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

// POST /api/samsub/kyc/init
// body: { externalUserId, levelName?, email?, firstName?, lastName?, phone? }
module.exports = async (req, res) => {
  if (req.method !== 'POST')
    return res.status(405).json({ success:false, error:{ message:'Method not allowed' }});

  if (!APP_TOKEN || !SECRET)
    return res.status(500).json({ success:false, error:{ message:'Sumsub credentials are not configured' }});

  try {
    const {
      externalUserId,
      levelName = 'basic-kyc-level',
      email, firstName, lastName, phone
    } = req.body || {};

    const extId = (externalUserId || '').toString().trim();
    if (!extId) return res.status(400).json({ success:false, error:{ message:'externalUserId required' }});

    // 1) Try create (levelName must be in query string for signing)
    const createPath = `/resources/applicants?${new URLSearchParams({ levelName: levelName.trim() || 'basic-kyc-level' })}`;

    const payload = { externalUserId: extId };
    const fixedInfo = {};
    if (typeof firstName === 'string' && firstName.trim()) fixedInfo.firstName = firstName.trim();
    if (typeof lastName === 'string' && lastName.trim()) fixedInfo.lastName = lastName.trim();
    if (Object.keys(fixedInfo).length) payload.fixedInfo = fixedInfo;
    if (typeof email === 'string' && email.trim()) payload.email = email.trim();
    if (typeof phone === 'string' && phone.trim()) payload.phone = phone.trim();

    let createResp = await sumsubFetch('POST', createPath, payload);

    // 1b) If duplicate, fetch by externalUserId
    let applicantData = createResp.data;
    if (!createResp.ok && createResp.status === 409) {
      const getPath = `/resources/applicants?${new URLSearchParams({ externalUserId: extId })}`;
      const found = await sumsubFetch('GET', getPath);
      if (!found.ok) {
        return res.status(409).json({ success:false, error:{ message:'Duplicate externalUserId but fetch failed' }, data: createResp.data });
      }
      applicantData = found.data; // reuse existing
    } else if (!createResp.ok) {
      return res.status(createResp.status).json({ success:false, error:{ message:'Sumsub error (create)' }, data: createResp.data });
    }

    // try to grab an applicantId from whatever shape we got back
    const applicantId =
      applicantData?.id ||
      applicantData?.applicantId ||
      applicantData?.applicant?.id ||
      applicantData?.inspectionId /* fallback, not ideal */;

    // 2) Get WebSDK access token (official way: userId = externalUserId)
    const tokenPath = `/resources/accessTokens?${new URLSearchParams({
      userId: extId,
      levelName: levelName.trim() || 'id-ad-liveness'
    })}`;
    const tokenResp = await sumsubFetch('POST', tokenPath);
    if (!tokenResp.ok) {
      return res.status(tokenResp.status).json({ success:false, error:{ message:'Sumsub error (access token)' }, data: tokenResp.data });
    }
    const token = tokenResp.data?.token || tokenResp.data?.accessToken || tokenResp.data;

    return res.status(200).json({
      success: true,
      data: {
        applicantId,
        externalUserId: extId,
        levelName,
        token
      }
    });
  } catch (e) {
    return res.status(500).json({ success:false, error:{ message: e.message }});
  }
};
