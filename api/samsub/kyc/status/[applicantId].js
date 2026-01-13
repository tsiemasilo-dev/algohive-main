// api/samsub/kyc/status/[applicantId].js
import crypto from 'crypto';

const SUMSUB_BASE = process.env.SUMSUB_BASE_URL || 'https://api.sumsub.com';
const APP_TOKEN   = process.env.SUMSUB_APP_TOKEN;
const SECRET      = process.env.SUMSUB_SECRET_KEY;

function sign(ts, method, path, body = '') {
  const toSign = String(ts) + method.toUpperCase() + path + body;
  return crypto.createHmac('sha256', SECRET).update(toSign).digest('hex');
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res
      .status(405)
      .json({ error: 'Method not allowed' });
  }

  if (!APP_TOKEN || !SECRET) {
    return res
      .status(500)
      .json({ error: 'Sumsub credentials are not configured' });
  }

  const { applicantId } = req.query || {};
  const rawId = Array.isArray(applicantId) ? applicantId[0] : applicantId;
  const normalizedId =
    typeof rawId === 'string' ? rawId.trim() : String(rawId || '');

  if (!normalizedId) {
    return res
      .status(400)
      .json({ error: 'applicantId required' });
  }

  try {
    // 👉 use /one instead of /status
    const path = `/resources/applicants/${encodeURIComponent(
      normalizedId,
    )}/one`;
    const url = `${SUMSUB_BASE}${path}`;
    const ts = Math.floor(Date.now() / 1000);

    const sig = sign(ts, 'GET', path);

    const r = await fetch(url, {
      method: 'GET',
      headers: {
        'X-App-Token': APP_TOKEN,
        'X-App-Access-Ts': String(ts),
        'X-App-Access-Sig': sig,
      },
    });

    const text = await r.text();
    let raw;
    try {
      raw = text ? JSON.parse(text) : {};
    } catch (error) {
      raw = { raw: text };
    }

    if (!r.ok) {
      return res
        .status(r.status)
        .json({ error: 'Sumsub error', data: raw });
    }

    // 🧠 Normalise the shape so your existing frontend
    // resolveSamsubState() keeps working:
    // - statusPayload.reviewResult.reviewAnswer -> 'GREEN' / 'RED'
    // - statusPayload.reviewStatus -> 'completed' / 'pending' / etc
    const review = raw.review || {};
    const normalized = {
      ...raw,
      reviewStatus: raw.reviewStatus || review.reviewStatus || null,
      reviewResult: raw.reviewResult || review.reviewResult || null,
    };

    return res.status(200).json(normalized);
  } catch (e) {
    console.error(e);
    return res
      .status(500)
      .json({ error: e.message });
  }
}
