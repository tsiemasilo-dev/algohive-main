const axios = require('axios');
const crypto = require('crypto');

const STITCH_API_URL = 'https://api.stitch.money/graphql';
const STITCH_TOKEN_URL = 'https://secure.stitch.money/connect/token';
const STITCH_AUTH_URL = 'https://secure.stitch.money/connect/authorize';

const STITCH_CONFIG = {
  clientId: process.env.STITCH_CLIENT_ID,
  clientSecret: process.env.STITCH_CLIENT_SECRET,
  redirectUri: process.env.STITCH_REDIRECT_URI || `${process.env.REPLIT_DEV_DOMAIN || 'http://localhost:5000'}/api/stitch/callback`
};

const userTokens = new Map();
const pendingStates = new Map();

async function getClientToken() {
  if (!STITCH_CONFIG.clientId || !STITCH_CONFIG.clientSecret) {
    throw new Error('Stitch credentials not configured');
  }

  const response = await axios.post(STITCH_TOKEN_URL, new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: STITCH_CONFIG.clientId,
    client_secret: STITCH_CONFIG.clientSecret,
    scope: 'client_paymentrequest client_bankaccountverification'
  }), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  return response.data.access_token;
}

function generateAuthUrl(userId, state = null) {
  if (!STITCH_CONFIG.clientId) {
    throw new Error('Stitch client ID not configured');
  }

  const stateValue = state || `${userId}__STITCH__${crypto.randomBytes(16).toString('hex')}`;
  
  const now = Date.now();
  const expiryTime = 10 * 60 * 1000; // 10 minutes
  
  pendingStates.set(stateValue, {
    userId,
    createdAt: now,
    expiresAt: now + expiryTime
  });
  
  const params = new URLSearchParams({
    client_id: STITCH_CONFIG.clientId,
    redirect_uri: STITCH_CONFIG.redirectUri,
    response_type: 'code',
    scope: 'accounts transactions balances offline_access',
    state: stateValue
  });

  return {
    url: `${STITCH_AUTH_URL}?${params.toString()}`,
    state: stateValue
  };
}

async function exchangeCodeForToken(authCode) {
  if (!STITCH_CONFIG.clientId || !STITCH_CONFIG.clientSecret) {
    throw new Error('Stitch credentials not configured');
  }

  const response = await axios.post(STITCH_TOKEN_URL, new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: STITCH_CONFIG.clientId,
    client_secret: STITCH_CONFIG.clientSecret,
    code: authCode,
    redirect_uri: STITCH_CONFIG.redirectUri
  }), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  return {
    accessToken: response.data.access_token,
    refreshToken: response.data.refresh_token,
    expiresIn: response.data.expires_in,
    tokenType: response.data.token_type
  };
}

async function refreshUserToken(refreshToken) {
  const response = await axios.post(STITCH_TOKEN_URL, new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: STITCH_CONFIG.clientId,
    client_secret: STITCH_CONFIG.clientSecret,
    refresh_token: refreshToken
  }), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  return {
    accessToken: response.data.access_token,
    refreshToken: response.data.refresh_token || refreshToken,
    expiresIn: response.data.expires_in
  };
}

function storeUserToken(userId, tokenData) {
  userTokens.set(userId, {
    ...tokenData,
    storedAt: Date.now()
  });
}

function getUserToken(userId) {
  return userTokens.get(userId);
}

async function graphqlQuery(query, variables = {}, userToken) {
  const response = await axios.post(STITCH_API_URL, {
    query,
    variables
  }, {
    headers: {
      'Authorization': `Bearer ${userToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (response.data.errors) {
    throw new Error(response.data.errors[0]?.message || 'GraphQL error');
  }

  return response.data.data;
}

async function getBankAccounts(userToken) {
  const query = `
    query GetBankAccounts {
      user {
        bankAccounts {
          edges {
            node {
              id
              accountNumber
              accountType
              name
              bankId
              availableBalance {
                quantity
                currency
              }
              currentBalance {
                quantity
                currency
              }
            }
          }
        }
      }
    }
  `;

  const data = await graphqlQuery(query, {}, userToken);
  const accounts = data?.user?.bankAccounts?.edges?.map(edge => edge.node) || [];
  return accounts;
}

async function getTransactions(userToken, accountId, months = 3) {
  const allTransactions = [];
  let cursor = null;
  let hasNextPage = true;
  
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);
  const startDateStr = startDate.toISOString().split('T')[0];

  while (hasNextPage) {
    const query = `
      query GetTransactions($accountId: ID!, $cursor: String, $startDate: Date) {
        node(id: $accountId) {
          ... on BankAccount {
            transactions(first: 100, after: $cursor, filter: { date: { gte: $startDate } }) {
              edges {
                node {
                  id
                  amount {
                    quantity
                    currency
                  }
                  date
                  description
                  reference
                  runningBalance {
                    quantity
                    currency
                  }
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      }
    `;

    const data = await graphqlQuery(query, { accountId, cursor, startDate: startDateStr }, userToken);
    const transactions = data?.node?.transactions?.edges?.map(edge => edge.node) || [];
    allTransactions.push(...transactions);

    hasNextPage = data?.node?.transactions?.pageInfo?.hasNextPage || false;
    cursor = data?.node?.transactions?.pageInfo?.endCursor;

    if (allTransactions.length > 1000) break;
  }

  return allTransactions;
}

function analyzeTransactions(transactions) {
  if (!transactions || transactions.length === 0) {
    return {
      income_consistency: null,
      avg_monthly_income: null,
      avg_monthly_balance: null,
      overdraft_count: 0,
      gambling_transactions: 0,
      analysisStatus: 'NO_TRANSACTIONS'
    };
  }

  const gamblingKeywords = [
    'bet', 'casino', 'lotto', 'lottery', 'gambling', 'betway', 'sportingbet',
    'hollywoodbets', 'supabets', 'sunbet', 'playabets', 'worldsportsbetting',
    'tab', 'powerball', 'slots', 'poker', 'blackjack', 'roulette'
  ];

  const salaryKeywords = [
    'salary', 'wages', 'payroll', 'payment from employer', 'sal', 'nett pay',
    'net pay', 'income', 'allowance', 'commission'
  ];

  const incomeByMonth = {};
  const balancesByMonth = {};
  let overdraftCount = 0;
  let gamblingTransactionCount = 0;

  transactions.forEach(tx => {
    const amount = parseFloat(tx.amount?.quantity || 0);
    const balance = parseFloat(tx.runningBalance?.quantity || 0);
    const description = (tx.description || '').toLowerCase();
    const date = tx.date;

    if (!date) return;

    const monthKey = date.substring(0, 7);

    if (!balancesByMonth[monthKey]) {
      balancesByMonth[monthKey] = [];
    }
    balancesByMonth[monthKey].push(balance);

    if (balance < 0) {
      overdraftCount++;
    }

    const isGambling = gamblingKeywords.some(kw => description.includes(kw));
    if (isGambling && amount < 0) {
      gamblingTransactionCount++;
    }

    const isSalary = salaryKeywords.some(kw => description.includes(kw));
    if (isSalary && amount > 0) {
      if (!incomeByMonth[monthKey]) {
        incomeByMonth[monthKey] = 0;
      }
      incomeByMonth[monthKey] += amount;
    } else if (amount > 1000 && amount > 0) {
      if (!incomeByMonth[monthKey]) {
        incomeByMonth[monthKey] = 0;
      }
      incomeByMonth[monthKey] += amount;
    }
  });

  const monthlyIncomes = Object.values(incomeByMonth);
  const avgMonthlyIncome = monthlyIncomes.length > 0
    ? monthlyIncomes.reduce((sum, val) => sum + val, 0) / monthlyIncomes.length
    : 0;

  let incomeConsistency = 0;
  if (monthlyIncomes.length >= 2) {
    const mean = avgMonthlyIncome;
    const variance = monthlyIncomes.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / monthlyIncomes.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = mean > 0 ? (stdDev / mean) * 100 : 100;
    incomeConsistency = Math.max(0, Math.min(100, 100 - coefficientOfVariation));
  } else if (monthlyIncomes.length === 1) {
    incomeConsistency = 50;
  }

  const allBalances = Object.values(balancesByMonth).flat();
  const avgMonthlyBalance = allBalances.length > 0
    ? allBalances.reduce((sum, val) => sum + val, 0) / allBalances.length
    : 0;

  return {
    income_consistency: Math.round(incomeConsistency),
    avg_monthly_income: Math.round(avgMonthlyIncome * 100) / 100,
    avg_monthly_balance: Math.round(avgMonthlyBalance * 100) / 100,
    overdraft_count: overdraftCount,
    gambling_transactions: gamblingTransactionCount,
    months_analyzed: Object.keys(balancesByMonth).length,
    total_transactions: transactions.length,
    analysisStatus: 'ANALYZED'
  };
}

async function performBankStatementAnalysis(userId) {
  const tokenData = getUserToken(userId);
  if (!tokenData?.accessToken) {
    return {
      success: false,
      error: 'No linked bank account. Please link your bank account first.',
      needsLinking: true
    };
  }

  try {
    const accounts = await getBankAccounts(tokenData.accessToken);
    
    if (accounts.length === 0) {
      return {
        success: false,
        error: 'No bank accounts found',
        needsLinking: true
      };
    }

    const primaryAccount = accounts[0];
    const transactions = await getTransactions(tokenData.accessToken, primaryAccount.id, 3);
    const analysis = analyzeTransactions(transactions);

    return {
      success: true,
      accountId: primaryAccount.id,
      accountName: primaryAccount.name,
      bankId: primaryAccount.bankId,
      currentBalance: parseFloat(primaryAccount.currentBalance?.quantity || 0),
      analysis
    };
  } catch (error) {
    console.error('Bank statement analysis error:', error);
    
    if (error.response?.status === 401) {
      userTokens.delete(userId);
      return {
        success: false,
        error: 'Bank authorization expired. Please re-link your bank account.',
        needsLinking: true
      };
    }

    return {
      success: false,
      error: error.message || 'Failed to analyze bank statement'
    };
  }
}

function validateAndConsumeState(state) {
  if (!state) {
    throw new Error('State parameter missing');
  }

  const stateData = pendingStates.get(state);
  
  if (!stateData) {
    throw new Error('Invalid state: state not found');
  }

  const now = Date.now();
  if (now > stateData.expiresAt) {
    pendingStates.delete(state);
    throw new Error('Invalid state: state expired');
  }

  const userId = stateData.userId;
  pendingStates.delete(state);
  
  return userId;
}

function isStitchConfigured() {
  return !!(STITCH_CONFIG.clientId && STITCH_CONFIG.clientSecret);
}

module.exports = {
  isStitchConfigured,
  generateAuthUrl,
  exchangeCodeForToken,
  refreshUserToken,
  storeUserToken,
  getUserToken,
  getBankAccounts,
  getTransactions,
  analyzeTransactions,
  performBankStatementAnalysis,
  validateAndConsumeState,
  STITCH_CONFIG
};
