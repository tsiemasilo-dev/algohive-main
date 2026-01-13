const crypto = require('crypto');

const SUMSUB_BASE = process.env.SUMSUB_BASE_URL || 'https://api.sumsub.com';
const APP_TOKEN = process.env.SUMSUB_APP_TOKEN;
const SECRET = process.env.SUMSUB_APP_SECRET || process.env.SUMSUB_SECRET_KEY;

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

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    return res.status(200).json({
      success: false,
      error: {
        message: 'Use POST with an externalUserId payload to create or fetch a Sumsub applicant'
      }
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ success:false, error:{message:'Method not allowed'}});
  if (!APP_TOKEN || !SECRET) return res.status(500).json({ success:false, error:{message:'Sumsub credentials are not configured'}});

  try {
    const {
      externalUserId,
      levelName = 'basic-kyc-level',
      email, firstName, lastName, phone
    } = req.body || {};

    const extId = (typeof externalUserId === 'string' ? externalUserId : String(externalUserId || '')).trim();
    if (!extId) return res.status(400).json({ success:false, error:{message:'externalUserId required'} });

    // create path (Sumsub expects levelName as query param)
    const createPath = `/resources/applicants?${new URLSearchParams({ levelName: levelName.trim() || 'basic-kyc-level' })}`;

    // payload
    const payload = { externalUserId: extId };
    const fixedInfo = {};
    if (typeof firstName === 'string' && firstName.trim()) fixedInfo.firstName = firstName.trim();
    if (typeof lastName === 'string' && lastName.trim()) fixedInfo.lastName = lastName.trim();
    if (Object.keys(fixedInfo).length) payload.fixedInfo = fixedInfo;
    if (typeof email === 'string' && email.trim()) payload.email = email.trim();
    if (typeof phone === 'string' && phone.trim()) payload.phone = phone.trim();

    // try create
    let resp = await sumsubFetch('POST', createPath, payload);

    // if duplicate (409), fetch by externalUserId and return existing
    if (!resp.ok && resp.status === 409) {
      const getPath = `/resources/applicants?${new URLSearchParams({ externalUserId: extId })}`;
      const found = await sumsubFetch('GET', getPath);
      if (found.ok) {
        return res.status(200).json({ success:true, data: found.data, reused: true });
      }
      // if lookup failed, surface original error
      return res.status(409).json({ success:false, error:{message:'Sumsub error (duplicate externalUserId)'}, data: resp.data });
    }

    if (!resp.ok) {
      return res.status(resp.status).json({ success:false, error:{message:'Sumsub error'}, data: resp.data });
    }

    return res.status(200).json({ success:true, data: resp.data });
  } catch (e) {
    return res.status(500).json({ success:false, error:{message:e.message}});
  }
};
