// api/samsub/kyc/init-websdk.js
const crypto = require('crypto');

const SUMSUB_BASE = process.env.SUMSUB_BASE_URL || 'https://api.sumsub.com';
const APP_TOKEN   = process.env.SUMSUB_APP_TOKEN;
const SECRET      = process.env.SUMSUB_APP_SECRET || process.env.SUMSUB_SECRET_KEY;

function sign(ts, method, pathWithQuery, bodyStr = '') {
  const toSign = String(ts) + method.toUpperCase() + pathWithQuery + bodyStr;
  return crypto.createHmac('sha256', SECRET).update(toSign).digest('hex');
}

async function sumsubFetch(method, pathWithQuery, bodyObj) {
  const ts = Math.floor(Date.now() / 1000);
  const bodyStr = bodyObj ? JSON.stringify(bodyObj) : '';
  const sig = sign(ts, method, pathWithQuery, bodyStr);

  const r = await fetch(`${SUMSUB_BASE}${pathWithQuery}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-App-Token': APP_TOKEN,
      'X-App-Access-Ts': String(ts),
      'X-App-Access-Sig': sig
    },
    body: bodyObj ? bodyStr : undefined
  });

  const text = await r.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  return { ok: r.ok, status: r.status, data };
}

function extractApplicant(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const extracted = extractApplicant(item);
      if (extracted) return extracted;
    }
    return null;
  }

  if (payload.id || payload.applicantId) return payload;
  if (payload.applicant && typeof payload.applicant === 'object') return extractApplicant(payload.applicant);
  if (Array.isArray(payload.applicants)) return extractApplicant(payload.applicants);
  if (Array.isArray(payload.items)) return extractApplicant(payload.items);
  if (payload.data) return extractApplicant(payload.data);

  return null;
}

function extractApplicantId(payload) {
  const applicant = extractApplicant(payload);
  if (!applicant) return null;
  return applicant.id || applicant.applicantId || applicant.applicant_id || applicant.inspectionId || null;
}

// POST /api/samsub/kyc/init-websdk
// body: { externalUserId, levelName, ttlInSecs?, email?, phone?, firstName?, lastName?, redirect? }
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success:false, error:{ message: 'Method not allowed' }});
  if (!APP_TOKEN || !SECRET)   return res.status(500).json({ success:false, error:{ message: 'Sumsub credentials are not configured' }});

  try {
    const {
      externalUserId,
      levelName = 'test-level',
      ttlInSecs = 1400000000,
      email, phone,
      firstName, lastName,
      redirect // { successUrl, failUrl, // optional: jwt, keepParams, paramFilter }
    } = req.body || {};

    const userId = (externalUserId || '').toString().trim();
    if (!userId) return res.status(400).json({ success:false, error:{ message: 'externalUserId required' }});

    // 1) Ensure applicant exists (create or reuse)
    const createPath = `/resources/applicants?${new URLSearchParams({ levelName: levelName.trim() })}`;
    const payload = { externalUserId: userId };
    const fixedInfo = {};
    if (typeof firstName === 'string' && firstName.trim()) fixedInfo.firstName = firstName.trim();
    if (typeof lastName  === 'string' && lastName.trim())  fixedInfo.lastName  = lastName.trim();
    if (Object.keys(fixedInfo).length) payload.fixedInfo = fixedInfo;
    if (typeof email === 'string' && email.trim()) payload.email = email.trim();
    if (typeof phone === 'string' && phone.trim()) payload.phone = phone.trim();

    let createResp = await sumsubFetch('POST', createPath, payload);
    let reusedApplicant = false;
    let applicantPayload = createResp.data;

    if (!createResp.ok && createResp.status === 409) {
      // duplicate → fetch existing by externalUserId (OK)
      const getPath = `/resources/applicants?${new URLSearchParams({ externalUserId: userId })}`;
      const found = await sumsubFetch('GET', getPath);
      if (!found.ok) {
        return res.status(409).json({ success:false, error:{ message:'Duplicate userId and fetch failed' }, data: createResp.data });
      }
      reusedApplicant = true;
      applicantPayload = found.data;
    } else if (!createResp.ok) {
      return res.status(createResp.status).json({ success:false, error:{ message:'Sumsub error (create)' }, data: createResp.data });
    }

    const applicantId = extractApplicantId(applicantPayload);

    // 2) Generate WebSDK link (this is the “proper” endpoint)
    // POST /resources/sdkIntegrations/levels/-/websdkLink
    const ttl = Number(ttlInSecs) || 1400000000;
    const websdkPath = `/resources/sdkIntegrations/levels/-/websdkLink`;
    const body = {
      ttlInSecs: ttl,
      levelName: levelName.trim(),
      userId, // this is your externalUserId
      // optional helpers:
      applicantIdentifiers: {
        email: email && email.trim() ? email.trim() : undefined,
        phone: phone && phone.trim() ? phone.trim() : undefined
      },
      redirect // pass-through if you provided one
    };

    const ws = await sumsubFetch('POST', websdkPath, body);
    if (!ws.ok) {
      return res.status(ws.status).json({ success:false, error:{ message:'Sumsub error (websdkLink)' }, data: ws.data });
    }

    const websdkUrl = ws.data?.url || ws.data?.link || ws.data?.href || ws.data;

    return res.status(200).json({
      success: true,
      data: {
        applicantId,
        externalUserId: userId,
        levelName: levelName.trim(),
        ttlInSecs: ttl,
        websdkUrl,
        reusedApplicant
      }
    });
  } catch (e) {
    return res.status(500).json({ success:false, error:{ message: e.message }});
  }
};
