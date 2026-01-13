const axios = require('axios');

// Configuration
const ALPACA_BASE_URL = "https://paper-api.alpaca.markets";
// Use environment variables in production! 
const ALPACA_KEY_ID = process.env.ALPACA_KEY_ID || "PKARM7PKO5AYOTHGHBAEYNLXV2";
const ALPACA_SECRET_KEY = process.env.ALPACA_SECRET_KEY || "AfVJWotnuyuSE2LBqFhX744zia9qc65xPSwbGEvCEC1T";

module.exports = async (req, res) => {
  // 1. CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const headers = {
      'APCA-API-KEY-ID': ALPACA_KEY_ID,
      'APCA-API-SECRET-KEY': ALPACA_SECRET_KEY
    };

    // 2. Fetch BOTH Account Data (Current) AND Portfolio History (Historical)
    const [accountRes, historyRes] = await Promise.all([
      axios.get(`${ALPACA_BASE_URL}/v2/account`, { headers }),
      axios.get(`${ALPACA_BASE_URL}/v2/account/portfolio/history?period=5D&timeframe=1D`, { headers })
    ]);

    // 3. Merge the data
    const mergedData = {
      ...accountRes.data,
      history: historyRes.data
    };

    res.status(200).json(mergedData);

  } catch (error) {
    console.error("Alpaca Error:", error.response?.data || error.message);
    res.status(500).json({ error: error.message });
  }
};
