const path = require('path');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { performCreditCheck } = require('./creditCheckService');

const CREDIT_SCORE_MIN = 300;
const CREDIT_SCORE_MAX = 850;
const CREDIT_SCORE_WEIGHT = 25; // percent
const CREDIT_UTILIZATION_WEIGHT = 5; // percent
const ADVERSE_LISTINGS_WEIGHT = 10; // percent
const DEVICE_IP_WEIGHT = 2; // percent
const DTI_WEIGHT = 15; // percent
const EMPLOYMENT_TENURE_WEIGHT = 5; // percent
const CONTRACT_TYPE_WEIGHT = 5; // percent
const EMPLOYMENT_CATEGORY_WEIGHT = 5; // percent
const INCOME_STABILITY_WEIGHT = 10; // percent
const ALGOLEND_REPAYMENT_WEIGHT = 3; // percent
const AGL_RETRIEVAL_WEIGHT = 5; // percent
const BANK_STATEMENT_CASHFLOW_WEIGHT = 10; // percent
const TOTAL_LOAN_ENGINE_WEIGHT = CREDIT_SCORE_WEIGHT
  + CREDIT_UTILIZATION_WEIGHT
  + ADVERSE_LISTINGS_WEIGHT
  + DEVICE_IP_WEIGHT
  + DTI_WEIGHT
  + EMPLOYMENT_TENURE_WEIGHT
  + CONTRACT_TYPE_WEIGHT
  + EMPLOYMENT_CATEGORY_WEIGHT
  + INCOME_STABILITY_WEIGHT
  + ALGOLEND_REPAYMENT_WEIGHT
  + AGL_RETRIEVAL_WEIGHT
  + BANK_STATEMENT_CASHFLOW_WEIGHT;

function clampToRange(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function computeCreditScoreContribution(score = 0) {
  const clampedScore = Number.isFinite(score) ? score : 0;
  const range = CREDIT_SCORE_MAX - CREDIT_SCORE_MIN;
  const delta = clampedScore - CREDIT_SCORE_MIN;
  const normalizedRatio = range > 0 ? clampToRange(delta / range, 0, 1) : 0;
  const normalizedPercent = normalizedRatio * 100;
  const contributionPercent = normalizedPercent * (CREDIT_SCORE_WEIGHT / 100);

  return {
    score: clampedScore,
    min: CREDIT_SCORE_MIN,
    max: CREDIT_SCORE_MAX,
    delta,
    range,
    normalizedPercent,
    valuePercent: normalizedPercent,
    weightPercent: CREDIT_SCORE_WEIGHT,
    contributionPercent
  };
}

function computeAdverseListingsContribution(creditScoreData = {}) {
  const adverseAccounts = creditScoreData.accountSummary?.adverseAccounts || 0;
  const adverseStatsTotal = creditScoreData.adverseStats?.adverseTotal || 0;
  const totalAdverse = Math.max(adverseAccounts, adverseStatsTotal);

  let valuePercent;
  if (totalAdverse === 0) {
    valuePercent = 100;
  } else if (totalAdverse === 1) {
    valuePercent = 40;
  } else {
    valuePercent = 0;
  }

  const contributionPercent = valuePercent * (ADVERSE_LISTINGS_WEIGHT / 100);

  return {
    totalAdverse,
    valuePercent,
    weightPercent: ADVERSE_LISTINGS_WEIGHT,
    contributionPercent
  };
}

function computeCreditUtilizationContribution(accountMetrics = {}) {
  const rawRatio = accountMetrics.revolvingUtilizationRatio ?? accountMetrics.revolvingUtilizationPercent;
  const ratio = Number.isFinite(rawRatio)
    ? rawRatio
    : Number.isFinite(Number(rawRatio))
      ? Number(rawRatio)
      : null;
  const percentRatio = ratio === null
    ? null
    : ratio > 1 && ratio <= 100
      ? ratio
      : ratio * 100;

  let valuePercent;
  if (!Number.isFinite(percentRatio)) {
    valuePercent = 0;
  } else if (percentRatio <= 30) {
    valuePercent = 100;
  } else if (percentRatio <= 50) {
    valuePercent = 70;
  } else if (percentRatio <= 75) {
    valuePercent = 40;
  } else if (percentRatio <= 90) {
    valuePercent = 20;
  } else {
    valuePercent = 5;
  }

  const contributionPercent = valuePercent * (CREDIT_UTILIZATION_WEIGHT / 100);

  return {
    ratioPercent: Number.isFinite(percentRatio) ? percentRatio : null,
    totalRevolvingLimit: accountMetrics.revolvingLimits || 0,
    totalRevolvingBalance: accountMetrics.revolvingBalance || 0,
    totalLimits: accountMetrics.totalLimits || 0,
    totalBalance: accountMetrics.totalBalance || 0,
    weightPercent: CREDIT_UTILIZATION_WEIGHT,
    valuePercent,
    contributionPercent
  };
}

function normalizeIp(ipAddress) {
  if (!ipAddress) {
    return null;
  }

  const value = typeof ipAddress === 'string' ? ipAddress : String(ipAddress);

  if (value.startsWith('::ffff:')) {
    return value.slice(7);
  }

  return value;
}

function extractClientDeviceMetadata(req) {
  const forwardedHeader = req.headers['x-forwarded-for'];
  const forwardedForChain = typeof forwardedHeader === 'string'
    ? forwardedHeader.split(',').map(entry => entry.trim()).filter(Boolean)
    : [];

  const rawIp = forwardedForChain[0] || req.socket?.remoteAddress || req.ip || null;
  const normalizedIp = normalizeIp(rawIp);

  return {
    ip: normalizedIp,
    rawIp,
    forwardedForChain,
    userAgent: req.headers['user-agent'] || null,
    acceptLanguage: req.headers['accept-language'] || null,
    captureTimestamp: new Date().toISOString()
  };
}

function computeDeviceFingerprintContribution(deviceFingerprint = {}) {
  const signals = ['ip', 'userAgent'];
  const signalsCaptured = signals.reduce((count, signalKey) => (
    deviceFingerprint[signalKey] ? count + 1 : count
  ), 0);
  const requiredSignals = signals.length || 1;
  const completenessRatio = signalsCaptured / requiredSignals;
  const valuePercent = completenessRatio * 100;
  const contributionPercent = valuePercent * (DEVICE_IP_WEIGHT / 100);

  return {
    ...deviceFingerprint,
    signalsCaptured,
    requiredSignals,
    valuePercent,
    weightPercent: DEVICE_IP_WEIGHT,
    contributionPercent
  };
}

function computeDTIContribution(totalMonthlyDebt = 0, grossMonthlyIncome = 0) {
  if (!grossMonthlyIncome || grossMonthlyIncome <= 0) {
    return {
      dtiRatio: null,
      dtiPercent: null,
      totalMonthlyDebt,
      grossMonthlyIncome,
      valuePercent: 0,
      weightPercent: DTI_WEIGHT,
      contributionPercent: 0
    };
  }

  const dtiRatio = totalMonthlyDebt / grossMonthlyIncome;
  const dtiPercent = dtiRatio * 100;

  let valuePercent;
  if (dtiPercent <= 30) {
    valuePercent = 100;
  } else if (dtiPercent <= 40) {
    valuePercent = 90;
  } else if (dtiPercent <= 50) {
    valuePercent = 75;
  } else if (dtiPercent <= 60) {
    valuePercent = 60;
  } else if (dtiPercent <= 75) {
    valuePercent = 50;
  } else {
    valuePercent = 0;
  }

  const contributionPercent = valuePercent * (DTI_WEIGHT / 100);

  return {
    dtiRatio,
    dtiPercent,
    totalMonthlyDebt,
    grossMonthlyIncome,
    valuePercent,
    weightPercent: DTI_WEIGHT,
    contributionPercent
  };
}

function computeEmploymentTenureContribution(monthsInCurrentJob = null) {
  const numericMonths = Number(monthsInCurrentJob);
  const monthsValue = Number.isFinite(numericMonths) ? Math.max(0, numericMonths) : null;

  let valuePercent;
  if (!Number.isFinite(monthsValue) || monthsValue === null || monthsValue <= 0) {
    valuePercent = 0;
  } else if (monthsValue >= 36) {
    valuePercent = 100;
  } else if (monthsValue >= 24) {
    valuePercent = 80;
  } else if (monthsValue >= 12) {
    valuePercent = 75;
  } else if (monthsValue >= 6) {
    valuePercent = 60;
  } else if (monthsValue >= 3) {
    valuePercent = 55;
  } else if (monthsValue >= 2) {
    valuePercent = 25;
  } else {
    valuePercent = 0;
  }

  const contributionPercent = valuePercent * (EMPLOYMENT_TENURE_WEIGHT / 100);

  return {
    monthsInCurrentJob: monthsValue,
    yearsInCurrentJob: Number.isFinite(monthsValue) && monthsValue !== null ? monthsValue / 12 : null,
    valuePercent,
    weightPercent: EMPLOYMENT_TENURE_WEIGHT,
    contributionPercent
  };
}

function computeContractTypeContribution(contractType = null) {
  const normalized = typeof contractType === 'string' ? contractType.toUpperCase() : null;

  const valueMap = {
    PERMANENT: 100,
    PERMANENT_ON_PROBATION: 80,
    FIXED_TERM_12_PLUS: 70,
    FIXED_TERM_LT_12: 50,
    SELF_EMPLOYED_12_PLUS: 60,
    PART_TIME: 40,
    UNEMPLOYED_OR_UNKNOWN: 0
  };

  const valuePercent = normalized && Object.prototype.hasOwnProperty.call(valueMap, normalized)
    ? valueMap[normalized]
    : 0;

  const contributionPercent = valuePercent * (CONTRACT_TYPE_WEIGHT / 100);

  const fixedTermMonthsRemaining = normalized === 'FIXED_TERM_12_PLUS'
    ? '12+'
    : normalized === 'FIXED_TERM_LT_12'
      ? '<12'
      : null;

  return {
    contractType: normalized,
    fixedTermMonthsRemaining,
    valuePercent,
    weightPercent: CONTRACT_TYPE_WEIGHT,
    contributionPercent
  };
}

function computeEmploymentCategoryContribution(overrides = {}) {
  const rawSector = typeof overrides.employment_sector_type === 'string'
    ? overrides.employment_sector_type.toUpperCase()
    : null;
  const employerName = overrides.employment_employer_name || null;
  const rawMatch = typeof overrides.employment_employer_match === 'string'
    ? overrides.employment_employer_match.toUpperCase()
    : null;
  const listedMatchName = overrides.employment_listed_match_name || null;

  let valuePercent = 0;
  let matchLabel = 'UNKNOWN';

  if (rawSector === 'GOVERNMENT' && employerName) {
    valuePercent = 100;
    matchLabel = 'GOVERNMENT';
  } else if (rawSector === 'PRIVATE' && rawMatch === 'LISTED') {
    valuePercent = 80;
    matchLabel = 'LISTED';
  } else if (rawSector === 'PRIVATE' && rawMatch === 'HIGH_RISK_MANUAL') {
    valuePercent = 50;
    matchLabel = 'HIGH_RISK';
  } else if (rawMatch === 'BLACKLISTED' || rawMatch === 'NOT_FOUND') {
    valuePercent = 0;
    matchLabel = 'NOT_FOUND';
  } else if (rawSector === 'PRIVATE' && employerName) {
    valuePercent = 50;
    matchLabel = 'HIGH_RISK';
  }

  const contributionPercent = valuePercent * (EMPLOYMENT_CATEGORY_WEIGHT / 100);

  return {
    sector: rawSector,
    employerName,
    matchLabel,
    listedMatchName,
    valuePercent,
    weightPercent: EMPLOYMENT_CATEGORY_WEIGHT,
    contributionPercent
  };
}

function computeIncomeStabilityContribution(overrides = {}) {
  const rawSector = typeof overrides.employment_sector_type === 'string'
    ? overrides.employment_sector_type.toUpperCase()
    : null;
  const employerName = overrides.employment_employer_name || null;

  let valuePercent = 0;
  let stabilityReason = 'Income stability not evaluated';

  if (rawSector === 'GOVERNMENT' && employerName) {
    valuePercent = 100;
    stabilityReason = 'Government employee · automatic 100%';
  } else {
    valuePercent = 0;
    stabilityReason = 'Pending bank statement or payroll analysis';
  }

  const contributionPercent = valuePercent * (INCOME_STABILITY_WEIGHT / 100);

  return {
    sector: rawSector,
    employerName,
    stabilityReason,
    valuePercent,
    weightPercent: INCOME_STABILITY_WEIGHT,
    contributionPercent
  };
}

function computeAlgolendRepaymentContribution(isNewBorrower = null) {
  const normalized = typeof isNewBorrower === 'string'
    ? isNewBorrower.toLowerCase()
    : isNewBorrower;
  const interpreted = normalized === true || normalized === 'true' || normalized === 'yes';
  const valuePercent = interpreted ? 100 : 50;
  const contributionPercent = valuePercent * (ALGOLEND_REPAYMENT_WEIGHT / 100);

  return {
    isNewBorrower: interpreted,
    valuePercent,
    weightPercent: ALGOLEND_REPAYMENT_WEIGHT,
    contributionPercent
  };
}

function computeAglRetrievalContribution() {
  const valuePercent = 100;
  const contributionPercent = valuePercent * (AGL_RETRIEVAL_WEIGHT / 100);

  return {
    valuePercent,
    weightPercent: AGL_RETRIEVAL_WEIGHT,
    contributionPercent,
    automatic: true
  };
}

function computeBankStatementCashflowContribution(cashflowData = {}) {
  const avgMonthlyIncome = cashflowData.avg_monthly_income || null;
  const incomeConsistency = cashflowData.income_consistency || null;
  const avgMonthlyBalance = cashflowData.avg_monthly_balance || null;
  const overdraftCount = cashflowData.overdraft_count ?? null;
  const gamblingTransactions = cashflowData.gambling_transactions ?? null;

  let valuePercent = 0;
  let analysisStatus = 'NOT_AVAILABLE';
  const factors = [];

  if (avgMonthlyIncome !== null || incomeConsistency !== null || avgMonthlyBalance !== null) {
    analysisStatus = 'ANALYZED';

    if (incomeConsistency !== null) {
      if (incomeConsistency >= 90) {
        valuePercent += 30;
        factors.push('Excellent income consistency (90%+)');
      } else if (incomeConsistency >= 70) {
        valuePercent += 20;
        factors.push('Good income consistency (70-89%)');
      } else if (incomeConsistency >= 50) {
        valuePercent += 10;
        factors.push('Moderate income consistency (50-69%)');
      } else {
        factors.push('Poor income consistency (<50%)');
      }
    }

    if (avgMonthlyBalance !== null) {
      if (avgMonthlyBalance >= 10000) {
        valuePercent += 25;
        factors.push('Strong average balance (R10,000+)');
      } else if (avgMonthlyBalance >= 5000) {
        valuePercent += 20;
        factors.push('Good average balance (R5,000-R9,999)');
      } else if (avgMonthlyBalance >= 1000) {
        valuePercent += 10;
        factors.push('Moderate average balance (R1,000-R4,999)');
      } else {
        factors.push('Low average balance (<R1,000)');
      }
    }

    if (overdraftCount !== null) {
      if (overdraftCount === 0) {
        valuePercent += 25;
        factors.push('No overdrafts');
      } else if (overdraftCount <= 2) {
        valuePercent += 15;
        factors.push('Minimal overdrafts (1-2)');
      } else if (overdraftCount <= 5) {
        valuePercent += 5;
        factors.push('Some overdrafts (3-5)');
      } else {
        factors.push('Frequent overdrafts (6+)');
      }
    }

    if (gamblingTransactions !== null) {
      if (gamblingTransactions === 0) {
        valuePercent += 20;
        factors.push('No gambling transactions');
      } else if (gamblingTransactions <= 3) {
        valuePercent += 10;
        factors.push('Minimal gambling activity (1-3)');
      } else {
        factors.push('Significant gambling activity (4+)');
      }
    }

    valuePercent = Math.min(valuePercent, 100);
  } else {
    analysisStatus = 'PENDING';
    factors.push('Awaiting bank statement upload');
  }

  const contributionPercent = valuePercent * (BANK_STATEMENT_CASHFLOW_WEIGHT / 100);

  return {
    avgMonthlyIncome,
    incomeConsistency,
    avgMonthlyBalance,
    overdraftCount,
    gamblingTransactions,
    analysisStatus,
    factors,
    valuePercent,
    weightPercent: BANK_STATEMENT_CASHFLOW_WEIGHT,
    contributionPercent
  };
}

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const buildUserData = (overrides = {}) => {
  const base = {
    user_id: 'demo-user',
    identity_number: '9001015800085',
    surname: 'Doe',
    forename: 'John',
    forename2: '',
    forename3: '',
    gender: 'M',
    date_of_birth: '19900101',
    address1: '123 Demo Street',
    address2: 'Unit 5',
    address3: '',
    address4: '',
    postal_code: '2000',
    home_tel_code: '',
    home_tel_no: '',
    work_tel_code: '',
    work_tel_no: '',
    cell_tel_no: '0820000000',
    passport_flag: 'N'
  };

  return { ...base, ...overrides };
};

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'credit-check.html'));
});

app.get('/api/mock-mode', (_req, res) => {
  res.json({ mock: process.env.EXPERIAN_MOCK === 'true' });
});

app.post('/api/credit-check', async (req, res) => {
  try {
    const deviceFingerprint = extractClientDeviceMetadata(req);
    const overrides = req.body?.userData || {};
    const applicationId = req.body?.applicationId || `APP-${Date.now()}`;
    const userData = buildUserData({ ...overrides, client_ref: applicationId });

    // Experian expects YYYYMMDD with no separators
    if (userData.date_of_birth) {
      userData.date_of_birth = userData.date_of_birth.replace(/-/g, '');
    }

    const result = await performCreditCheck(userData, applicationId);

    if (!result.success) {
      return res.status(502).json({
        success: false,
        error: result.error || 'Credit check failed'
      });
    }

    const creditScoreValue = result.creditScore?.score || 0;
    const creditScoreBreakdown = computeCreditScoreContribution(creditScoreValue);
    const adverseListingsBreakdown = computeAdverseListingsContribution(result.creditScore || {});
    const creditUtilizationBreakdown = computeCreditUtilizationContribution(
      result.creditScore?.accounts?.exposure || result.creditScore?.accountSummary || {}
    );
    const deviceFingerprintBreakdown = computeDeviceFingerprintContribution(deviceFingerprint);
    
    // Calculate DTI
    const accountExposure = result.creditScore?.accounts?.exposure || {};
    const accountSummary = result.creditScore?.accountSummary || {};
    const totalMonthlyDebt = accountExposure.totalMonthlyInstallments || accountSummary.totalMonthlyInstallments || 0;
    const grossMonthlyIncome = overrides.gross_monthly_income || 0;
    const dtiBreakdown = computeDTIContribution(totalMonthlyDebt, grossMonthlyIncome);
    const monthsInCurrentJob = Number.isFinite(Number(overrides.months_in_current_job))
      ? Number(overrides.months_in_current_job)
      : null;
    const employmentTenureBreakdown = computeEmploymentTenureContribution(monthsInCurrentJob);
    const contractTypeBreakdown = computeContractTypeContribution(overrides.contract_type);
    const employmentCategoryBreakdown = computeEmploymentCategoryContribution(overrides);
    const incomeStabilityBreakdown = computeIncomeStabilityContribution(overrides);
    const algolendRepaymentBreakdown = computeAlgolendRepaymentContribution(overrides.algolend_is_new_borrower);
    const aglRetrievalBreakdown = computeAglRetrievalContribution();
    const bankStatementCashflowBreakdown = computeBankStatementCashflowContribution(overrides.bank_statement_cashflow || {});
    
    const breakdown = {
      creditScore: creditScoreBreakdown,
      creditUtilization: creditUtilizationBreakdown,
      adverseListings: adverseListingsBreakdown,
      deviceFingerprint: deviceFingerprintBreakdown,
      dti: dtiBreakdown,
      employmentTenure: employmentTenureBreakdown,
      contractType: contractTypeBreakdown,
      employmentCategory: employmentCategoryBreakdown,
      incomeStability: incomeStabilityBreakdown,
      algolendRepayment: algolendRepaymentBreakdown,
      aglRetrieval: aglRetrievalBreakdown,
      bankStatementCashflow: bankStatementCashflowBreakdown
    };
    const loanEngineScore = Object.values(breakdown).reduce((total, metric) => {
      return total + (metric?.contributionPercent || 0);
    }, 0);
    const loanEngineScoreMax = TOTAL_LOAN_ENGINE_WEIGHT;
    const loanEngineScoreNormalized = loanEngineScoreMax > 0
      ? (loanEngineScore / loanEngineScoreMax) * 100
      : 0;

    res.json({
      success: true,
      applicationId,
      recordId: result.databaseId || result.id,
      creditScore: creditScoreValue,
      riskType: result.creditScore?.riskType || 'UNKNOWN',
      recommendation: result.recommendation || result.creditScore?.riskType || 'UNKNOWN',
      riskFlags: result.riskFlags || result.risk_flags || [],
      mockMode: process.env.EXPERIAN_MOCK === 'true',
      breakdown,
      creditExposure: result.creditScore?.accounts?.exposure || null,
      scoreReasons: result.creditScore?.declineReasons || [],
      cpaAccounts: result.creditScore?.accounts?.cpa || [],
      employmentHistory: result.creditScore?.employmentHistory || [],
      deviceFingerprint,
      loanEngineScore,
      loanEngineScoreMax,
      loanEngineScoreNormalized,
      raw: result
    });
  } catch (error) {
    console.error('❌ API error:', error);
    res.status(500).json({ success: false, error: error.message || 'Unexpected server error' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Credit check server listening on http://localhost:${PORT}`);
  console.log(`   Mock mode: ${process.env.EXPERIAN_MOCK === 'true' ? 'ON' : 'OFF'}`);
});
