// /api/paystack/init.js
export default async function handler(req, res) {
  // --- CORS ---
  res.setHeader('Access-Control-Allow-Origin', '*'); // later: restrict to your domain
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, X-Requested-With');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // --- Health/info ---
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, hint: 'POST { email, amount_cents|amount, reference } (ZAR cents)' });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // --- Env guard ---
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) {
    return res.status(500).json({ ok: false, error: 'PAYSTACK_SECRET_KEY is not set on the server' });
  }

  try {
    const {
      email,
      amount_cents,
      amount, // optional legacy; both are cents
      currency = 'ZAR',
      reference,
      callback_url = 'https://www.thealgohive.com/pay/success',
      metadata = {},
      channels = ['card']
    } = req.body || {};

    const cents = Number.isFinite(Number(amount_cents)) ? Number(amount_cents) : Number(amount);

    if (!email || !Number.isFinite(cents) || cents <= 0 || !reference) {
      return res.status(400).json({ ok: false, error: 'Required: email, reference, amount_cents (integer > 0)' });
    }

    const payload = {
      email,
      amount: Math.round(cents), // Paystack expects smallest unit
      currency,
      reference,
      callback_url,
      channels,
      metadata: {
        site: 'thealgohive.com',
        profile_id: metadata.profile_id ?? null,
        strategy_id: metadata.strategy_id ?? null,
        units: metadata.units ?? null,
        unit_price: metadata.unit_price ?? null,
        strategy_name: metadata.strategy_name ?? null,
      }
    };

    const r = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });

    const ct = r.headers.get('content-type') || '';
    const rawText = await r.text();
    const body = ct.includes('application/json') ? safeParse(rawText) : null;

    // Handle upstream errors
    if (!r.ok || body?.status === false) {
      const msg = body?.message || `Paystack init failed (${r.status})`;
      return res.status(r.status || 502).json({ ok: false, error: msg, upstream: body ?? rawText });
    }

    // Normalize: always return the nested .data object
    const ps = body?.data || null;
    if (!ps?.authorization_url) {
      // Defensive guard so the client never sees a shape without authorization_url
      return res.status(502).json({
        ok: false,
        error: 'Paystack did not return authorization_url',
        upstream: body ?? rawText,
      });
    }

    return res.status(200).json({ ok: true, data: ps });
  } catch (err) {
    console.error('paystack/init error', err);
    return res.status(500).json({ ok: false, error: err.message || 'Server error' });
  }
}

function safeParse(t) { try { return JSON.parse(t); } catch { return null; } }
   