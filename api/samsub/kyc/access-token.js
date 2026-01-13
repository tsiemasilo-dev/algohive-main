// CJS – works without "type":"module"
const crypto = require('crypto');

const SUMSUB_BASE = process.env.SUMSUB_BASE_URL || 'https://api.sumsub.com';
const APP_TOKEN = process.env.SUMSUB_APP_TOKEN;
const SECRET   = process.env.SUMSUB_APP_SECRET || process.env.SUMSUB_SECRET_KEY;

// HMAC: ts + METHOD + pathWithQuery + body
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

// POST /api/samsub/kyc/access-token
// body: { externalUserId: "xyz", levelName: "basic-kyc-level" }
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success:false, error:{message:'Method not allowed'}});
  if (!APP_TOKEN || !SECRET) return res.status(500).json({ success:false, error:{message:'Sumsub credentials are not configured'}});
  try {
    const { externalUserId, levelName = 'basic-kyc-level' } = req.body || {};
    const userId = (externalUserId || '').toString().trim();
    if (!userId) return res.status(400).json({ success:false, error:{message:'externalUserId required'} });

    // Sumsub official: POST /resources/accessTokens?userId=...&levelName=...
    const path = `/resources/accessTokens?${new URLSearchParams({ userId, levelName })}`;
    const resp = await sumsubFetch('POST', path);

    if (!resp.ok) return res.status(resp.status).json({ success:false, error:{message:'Sumsub error'}, data: resp.data });

    // token is usually at resp.data.token
    const token = resp.data?.token || resp.data?.accessToken || resp.data;
    return res.status(200).json({ success:true, data:{ token } });
  } catch (e) {
    return res.status(500).json({ success:false, error:{message:e.message}});
  }
};
