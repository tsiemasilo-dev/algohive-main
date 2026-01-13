const express = require('express');
const path = require('path');

const app = express();
const PORT = 5000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  next();
});

const apiRoutes = {
  '/api/health': require('./api/health'),
  '/api/auth/signin': require('./api/auth/signin'),
  '/api/auth/signup': require('./api/auth/signup'),
  '/api/alpaca/account': require('./api/alpaca/account'),
  '/api/kyc/create-applicant': require('./api/kyc/create-applicant'),
  '/api/paystack/init': require('./api/paystack/init'),
  '/api/samsub/kyc/init': require('./api/samsub/kyc/init'),
  '/api/samsub/kyc/access-token': require('./api/samsub/kyc/access-token'),
  '/api/samsub/kyc/create-applicant': require('./api/samsub/kyc/create-applicant'),
  '/api/samsub/kyc/init-websdk': require('./api/samsub/kyc/init-websdk'),
  '/api/samsub/kyc/websdk-link': require('./api/samsub/kyc/websdk-link'),
};

for (const [route, handler] of Object.entries(apiRoutes)) {
  app.all(route, async (req, res) => {
    try {
      const fn = handler.default || handler;
      await fn(req, res);
    } catch (err) {
      console.error(`Error in ${route}:`, err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });
}

app.get('/api/samsub/kyc/status/:applicantId', async (req, res) => {
  try {
    req.query = req.query || {};
    req.query.applicantId = req.params.applicantId;
    const handler = require('./api/samsub/kyc/status/[applicantId]');
    const fn = handler.default || handler;
    await fn(req, res);
  } catch (err) {
    console.error('Error in status endpoint:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html']
}));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  
  const filePath = path.join(__dirname, 'public', req.path + '.html');
  res.sendFile(filePath, (err) => {
    if (err) {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
