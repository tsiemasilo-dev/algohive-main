(() => {
  const statusEl = document.getElementById('status');
  const button = document.getElementById('run-credit-check-btn');
  const resultEl = document.getElementById('result');
  const mockModeEl = document.getElementById('mock-mode');
  const identityInput = document.getElementById('identity-number');
  const firstNameInput = document.getElementById('first-name');
  const lastNameInput = document.getElementById('last-name');
  const grossMonthlyIncomeInput = document.getElementById('gross-monthly-income');
  const yearsCurrentEmployerInput = document.getElementById('years-current-employer');
  const contractTypeSelect = document.getElementById('contract-type');
  const algolendNewBorrowerSelect = document.getElementById('algolend-new-borrower');
  const breakdownCard = document.getElementById('credit-score-breakdown');
  const breakdownExplanation = document.getElementById('credit-score-explanation');
  const formulaEl = document.getElementById('credit-score-formula');
  const normalizedEl = document.getElementById('credit-score-normalized');
  const weightedEl = document.getElementById('credit-score-weighted');
  const engineCard = document.getElementById('loan-engine-card');
  const engineList = document.getElementById('loan-engine-list');
  const engineTotal = document.getElementById('loan-engine-total');
  const engineHelper = document.getElementById('loan-engine-helper');
  const breakdownToggleBtn = document.getElementById('breakdown-toggle-btn');
  let breakdownExpanded = false;
  const exposureCard = document.getElementById('credit-exposure-card');
  const exposureHelper = document.getElementById('credit-exposure-helper');
  const exposureFields = {
    utilization: document.getElementById('exposure-utilization'),
    revolvingBalance: document.getElementById('exposure-revolving-balance'),
    revolvingLimit: document.getElementById('exposure-revolving-limit'),
    totalBalance: document.getElementById('exposure-total-balance'),
    totalLimit: document.getElementById('exposure-total-limit'),
    openAccounts: document.getElementById('exposure-open-accounts')
  };
  const reasonCard = document.getElementById('score-reasons-card');
  const reasonList = document.getElementById('score-reasons-list');
  const employmentCard = document.getElementById('employment-card');
  const employmentBody = document.getElementById('employment-body');
  const employmentSectorSelect = document.getElementById('employment-sector');
  const governmentEmployerSection = document.getElementById('government-employer-section');
  const privateEmployerSection = document.getElementById('private-employer-section');
  const governmentEmployerInput = document.getElementById('government-employer-name');
  const privateEmployerInput = document.getElementById('private-employer-name');
  const privateEmployerFeedback = document.getElementById('private-employer-feedback');
  const employerOptionsDataList = document.getElementById('listed-employer-options');
  const retdataCard = document.getElementById('retdata-download-card');
  const retdataButton = document.getElementById('download-retdata-btn');
  const intakePanel = document.getElementById('intake-panel');
  const enginePanel = document.getElementById('engine-panel');
  const detailSections = document.getElementById('detail-sections');
  const lockInputsBtn = document.getElementById('lock-inputs-btn');
  const editInputsBtn = document.getElementById('edit-inputs-btn');
  const viewDetailsBtn = document.getElementById('view-details-btn');
  const engineConsole = document.getElementById('engine-console');
  const engineLoader = document.getElementById('engine-loader');
  const engineLoaderCircle = document.getElementById('engine-loader-circle');
  const engineLoaderPercent = document.getElementById('engine-loader-percent');
  const engineLoaderLabel = document.getElementById('engine-loader-label');
  const engineLoaderStatus = document.getElementById('engine-loader-status');
  const scoreValueEl = document.getElementById('score-value');
  const intakeErrorEl = document.getElementById('intake-error');
  const proceedStepTwoBtn = document.getElementById('proceed-step-two-btn');

  // Supabase client for auth + token pass-through to the API
  const SUPABASE_URL = "https://aazofjsssobejhkyyiqv.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhem9manNzc29iZWpoa3l5aXF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxMTI1NDUsImV4cCI6MjA3MzY4ODU0NX0.guYlxaV5RwTlTVFoUhpER0KWEIGPay8svLsxMwyRUyM";
  const supabaseClient = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      fetch: (url, options = {}) => fetch(url, { mode: 'cors', cache: 'no-store', ...options })
    }
  });

  async function getActiveSession() {
    try {
      if (!supabaseClient) return null;
      const { data, error } = await supabaseClient.auth.getSession();
      if (error) {
        console.warn('Supabase session fetch error', error.message);
        return null;
      }
      return data?.session || null;
    } catch (err) {
      console.warn('Unable to fetch session', err);
      return null;
    }
  }

  const HTML_ESCAPES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '`': '&#96;'
  };

  function escapeHtml(value) {
    if (value === null || value === undefined) {
      return '';
    }

    return String(value).replace(/[&<>"'`]/g, char => HTML_ESCAPES[char] || char);
  }

  const randFormatter = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 });
  const EMPLOYER_CSV_PATH = '/2025-10-16%20JSE%20Listed%20Companies.csv';
  const PRIVATE_EMPLOYER_DEFAULT_MESSAGE = 'Type three or more characters to match against the JSE directory (80% when matched).';

  function formatRand(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return '--';
    }
    return `R ${randFormatter.format(numericValue)}`;
  }

  function formatPercent(value, digits = 1) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return '--';
    }
    return `${numericValue.toFixed(digits)}%`;
  }

  let retdataDownloadUrl = null;
  let lockedPayload = null;
  let intakeLocked = false;
  let detailsVisible = false;
  let hasEngineResult = false;
  let latestLoanEngineMax = 70;
  const employmentDirectory = [];
  const employmentDirectoryIndex = new Map();
  const employmentState = {
    sector: null,
    listedMatch: null
  };
  const loaderStages = [
    { max: 30, label: 'Fetching data…' },
    { max: 50, label: 'Calculating score…' },
    { max: 80, label: 'Normalizing factors…' },
    { max: 95, label: 'Weighting decision…' },
    { max: 100, label: 'Finalizing output…' }
  ];
  let loaderTimer = null;
  let loaderProgress = 0;
  let consoleCollapsed = true;

  function revokeRetdataDownloadUrl() {
    if (retdataDownloadUrl) {
      URL.revokeObjectURL(retdataDownloadUrl);
      retdataDownloadUrl = null;
    }
  }

  function normalizeEmployerName(value = '') {
    if (!value) return '';
    return value
      .trim()
      .replace(/&/g, 'AND')
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .toUpperCase();
  }

  function resetRetdataDownload() {
    revokeRetdataDownloadUrl();
    if (retdataButton) {
      retdataButton.disabled = true;
      retdataButton.removeAttribute('data-filename');
    }
    if (retdataCard) {
      retdataCard.classList.add('hidden');
    }
  }

  function setIntakeError(message = '') {
    if (!intakeErrorEl) return;
    if (!message) {
      intakeErrorEl.textContent = '';
      intakeErrorEl.classList.add('hidden');
      intakeErrorEl.classList.remove('error');
      return;
    }
    intakeErrorEl.textContent = message;
    intakeErrorEl.classList.remove('hidden');
    intakeErrorEl.classList.add('error');
  }

  function appendConsoleLine(message, variant = 'muted') {
    if (!engineConsole) return;
    const line = document.createElement('p');
    line.textContent = message;
    line.classList.add('console-line');
    if (variant) {
      line.classList.add(variant);
    }
    engineConsole.appendChild(line);
    while (engineConsole.children.length > 20) {
      engineConsole.removeChild(engineConsole.firstChild);
    }
    engineConsole.scrollTop = engineConsole.scrollHeight;
  }

  function resetConsole(message = 'Awaiting launch instructions...') {
    if (!engineConsole) return;
    engineConsole.innerHTML = '';
    appendConsoleLine(message, 'muted');
    if (consoleCollapsed) {
      engineConsole.classList.add('hidden');
    } else {
      engineConsole.classList.remove('hidden');
    }
  }

  function resetEngineLoaderVisuals() {
    if (loaderTimer) {
      clearInterval(loaderTimer);
      loaderTimer = null;
    }
    loaderProgress = 0;
    engineLoaderCircle?.style.setProperty('--progress', '0');
    engineLoaderPercent.textContent = '0%';
    engineLoaderLabel.textContent = 'Idle';
    if (engineLoaderStatus) {
      engineLoaderStatus.textContent = '';
    }
  }

  function updateEngineLoader(value) {
    const clamped = Math.max(0, Math.min(100, value));
    loaderProgress = clamped;
    const stage = loaderStages.find(s => clamped <= s.max) || loaderStages[loaderStages.length - 1];
    if (engineLoaderCircle) {
      engineLoaderCircle.style.setProperty('--progress', `${clamped * 3.6}`);
    }
    if (engineLoaderPercent) {
      engineLoaderPercent.textContent = `${clamped.toFixed(0)}%`;
    }
    if (engineLoaderLabel && stage && loaderProgress > 0 && loaderProgress < 100) {
      engineLoaderLabel.textContent = stage.label;
    } else if (engineLoaderLabel && loaderProgress >= 100) {
      engineLoaderLabel.textContent = 'Complete';
    } else if (engineLoaderLabel) {
      engineLoaderLabel.textContent = 'Idle';
    }
    if (engineLoaderStatus && loaderProgress > 0 && loaderProgress < 100) {
      engineLoaderStatus.textContent = 'Live engine timeline';
    } else if (engineLoaderStatus && loaderProgress >= 100) {
      engineLoaderStatus.textContent = 'Engine finished';
    } else if (engineLoaderStatus) {
      engineLoaderStatus.textContent = '';
    }
  }

  function startEngineLoader() {
    resetEngineLoaderVisuals();
    updateEngineLoader(3);
    loaderTimer = setInterval(() => {
      const increment = loaderProgress < 40 ? 3 : loaderProgress < 70 ? 2 : 1;
      const jitter = Math.random() * 1.2;
      const nextValue = loaderProgress + increment + jitter;
      if (nextValue >= 96) {
        clearInterval(loaderTimer);
        loaderTimer = null;
        updateEngineLoader(96);
        return;
      }
      updateEngineLoader(nextValue);
    }, 420);
  }

  function completeEngineLoader() {
    if (loaderTimer) {
      clearInterval(loaderTimer);
      loaderTimer = null;
    }
    updateEngineLoader(100);
  }

  function failEngineLoader() {
    if (loaderTimer) {
      clearInterval(loaderTimer);
      loaderTimer = null;
    }
    updateEngineLoader(100);
    if (engineLoaderLabel) {
      engineLoaderLabel.textContent = 'Engine halted';
    }
    if (engineLoaderStatus) {
      engineLoaderStatus.textContent = 'Check inputs';
    }
  }

  function updateEmploymentSections() {
    if (governmentEmployerSection) {
      governmentEmployerSection.classList.toggle('hidden', employmentState.sector !== 'GOVERNMENT');
    }
    if (privateEmployerSection) {
      privateEmployerSection.classList.toggle('hidden', employmentState.sector !== 'PRIVATE');
    }
    if (privateEmployerFeedback && employmentState.sector !== 'PRIVATE') {
      privateEmployerFeedback.textContent = PRIVATE_EMPLOYER_DEFAULT_MESSAGE;
    }
  }

  function setEmploymentSector(sector) {
    if (!sector) return;
    employmentState.sector = sector;
    if (sector !== 'PRIVATE') {
      employmentState.listedMatch = null;
    }
    if (employmentSectorSelect) {
      employmentSectorSelect.value = sector;
    }
    updateEmploymentSections();
  }

  function evaluatePrivateEmployerMatch(rawValue = '') {
    if (!privateEmployerFeedback) return;
    if (!rawValue || !rawValue.trim()) {
      employmentState.listedMatch = null;
      privateEmployerFeedback.textContent = PRIVATE_EMPLOYER_DEFAULT_MESSAGE;
      return;
    }

    const normalized = normalizeEmployerName(rawValue);
    if (!normalized) {
      employmentState.listedMatch = null;
      privateEmployerFeedback.textContent = PRIVATE_EMPLOYER_DEFAULT_MESSAGE;
      return;
    }

    const exactMatch = employmentDirectoryIndex.get(normalized);
    let detectedMatch = exactMatch;
    if (!detectedMatch && normalized.length >= 3) {
      detectedMatch = employmentDirectory.find(entry => entry.normalized.includes(normalized)) || null;
    }

    if (detectedMatch) {
      employmentState.listedMatch = detectedMatch;
      privateEmployerFeedback.innerHTML = `Matched <strong>${escapeHtml(detectedMatch.displayName)}</strong> · Listed (80%)`;
    } else {
      employmentState.listedMatch = null;
      privateEmployerFeedback.textContent = 'No listed match found yet · defaults to High Risk (50%).';
    }
  }

  function getEmploymentSnapshot() {
    const sector = employmentState.sector;
    const employerName = sector === 'GOVERNMENT'
      ? governmentEmployerInput?.value.trim()
      : privateEmployerInput?.value.trim();

    const snapshot = {
      sector,
      employerName: employerName || null,
      listedMatchName: employmentState.listedMatch?.displayName || null,
      listedMatchSource: employmentState.listedMatch ? 'JSE_DIRECTORY' : null
    };

    if (sector === 'GOVERNMENT' && snapshot.employerName) {
      snapshot.matchTier = 'GOVERNMENT';
    } else if (sector === 'PRIVATE' && employmentState.listedMatch) {
      snapshot.matchTier = 'LISTED';
    } else if (sector === 'PRIVATE' && snapshot.employerName) {
      snapshot.matchTier = 'HIGH_RISK_MANUAL';
    } else {
      snapshot.matchTier = 'UNKNOWN';
    }

    return snapshot;
  }

  async function loadEmploymentDirectory() {
    if (employmentDirectory.length > 0) return;

    try {
      const response = await fetch(EMPLOYER_CSV_PATH);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const csvText = await response.text();
      const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
      const [header, ...rows] = lines;
      if (!header) {
        throw new Error('CSV missing header');
      }
      const seen = new Set();
      rows.forEach(line => {
        const [name = '', tel = '', email = '', website = ''] = line.split(';');
        const displayName = name.trim();
        const normalized = normalizeEmployerName(displayName);
        if (!displayName || !normalized || seen.has(normalized)) {
          return;
        }
        const record = {
          displayName,
          normalized,
          tel: tel.trim() || null,
          email: email.trim() || null,
          website: website.trim() || null
        };
        employmentDirectory.push(record);
        employmentDirectoryIndex.set(normalized, record);
        seen.add(normalized);
      });

      if (employmentDirectory.length === 0) {
        throw new Error('No employer entries detected');
      }

      if (employerOptionsDataList) {
        const optionsMarkup = employmentDirectory
          .map(entry => `<option value="${escapeHtml(entry.displayName)}"></option>`)
          .join('');
        employerOptionsDataList.innerHTML = optionsMarkup;
      }
    } catch (error) {
      console.error('Unable to load employment directory', error);
      if (privateEmployerFeedback) {
        privateEmployerFeedback.textContent = 'Unable to load listed employer directory · manual entries will default to High Risk (50%).';
      }
    }
  }

  function resetDetailSections() {
    if (detailSections) {
      detailSections.classList.add('hidden');
    }
    detailsVisible = false;
    if (viewDetailsBtn) {
      viewDetailsBtn.textContent = 'View details';
      viewDetailsBtn.disabled = true;
    }
  }

  function resetVisualOutputs(statusMessage = intakeLocked ? 'Ready to launch' : 'Inputs pending') {
    if (scoreValueEl) {
      scoreValueEl.textContent = '--';
    }
    if (statusEl) {
      statusEl.textContent = statusMessage;
    }
    if (resultEl) {
      resultEl.classList.add('hidden');
    }
    // Reset button visibility
    if (proceedStepTwoBtn) {
      proceedStepTwoBtn.classList.add('hidden');
    }
    if (button) {
      button.classList.remove('hidden');
    }
    renderCreditScoreBreakdown(null);
    renderLoanEngineSummary(null, null);
    renderCreditExposure(null);
    renderScoreReasons(null);
    renderEmploymentHistory(null);
    resetRetdataDownload();
    resetEngineLoaderVisuals();
    hasEngineResult = false;
    breakdownExpanded = false;
    if (engineList) {
      engineList.classList.add('collapsed');
    }
    if (breakdownToggleBtn) {
      breakdownToggleBtn.textContent = 'Show breakdown';
    }
  }

  function showEnginePanel() {
    intakePanel?.classList.add('hidden');
    enginePanel?.classList.remove('hidden');
  }

  function returnToIntake() {
    intakeLocked = false;
    lockedPayload = null;
    intakePanel?.classList.remove('hidden');
    enginePanel?.classList.add('hidden');
    resetDetailSections();
    resetVisualOutputs('Inputs pending');
    resetConsole();
    if (button) {
      button.disabled = true;
    }
    setIntakeError('');
  }

  function deriveNormalizedLoanScore(rawScore, maxScore, normalizedScore) {
    if (Number.isFinite(normalizedScore)) {
      return normalizedScore;
    }
    if (Number.isFinite(rawScore) && Number.isFinite(maxScore) && maxScore > 0) {
      return (rawScore / maxScore) * 100;
    }
    if (Number.isFinite(rawScore) && latestLoanEngineMax > 0) {
      return (rawScore / latestLoanEngineMax) * 100;
    }
    return null;
  }

  function base64ToArrayBuffer(base64Data = '') {
    const cleaned = base64Data.replace(/\s+/g, '');
    const binaryString = atob(cleaned);
    const length = binaryString.length;
    const bytes = new Uint8Array(length);

    for (let index = 0; index < length; index += 1) {
      bytes[index] = binaryString.charCodeAt(index);
    }

    return bytes.buffer;
  }

  function prepareRetdataDownload(base64Data, filename = 'experian-retdata.zip') {
    if (!retdataCard || !retdataButton || !base64Data) {
      resetRetdataDownload();
      return;
    }

    try {
      const buffer = base64ToArrayBuffer(base64Data);
      revokeRetdataDownloadUrl();
      const blob = new Blob([buffer], { type: 'application/zip' });
      retdataDownloadUrl = URL.createObjectURL(blob);
      retdataButton.disabled = false;
      retdataButton.dataset.filename = filename;
      retdataCard.classList.remove('hidden');
    } catch (error) {
      console.error('Unable to prepare Experian retdata download', error);
      resetRetdataDownload();
    }
  }

  function parseDobFromId(idNumber) {
    if (!/^\d{13}$/.test(idNumber)) return null;
    const yy = parseInt(idNumber.slice(0, 2), 10);
    const mm = parseInt(idNumber.slice(2, 4), 10);
    const dd = parseInt(idNumber.slice(4, 6), 10);
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;

    const currentYearTwoDigits = new Date().getFullYear() % 100;
    const century = yy <= currentYearTwoDigits ? 2000 : 1900;
    const year = century + yy;
    return `${year.toString().padStart(4, '0')}${idNumber.slice(2, 4)}${idNumber.slice(4, 6)}`;
  }

  function buildRequestPayload() {
    const overrides = {};
    const identity = identityInput?.value.trim();
    const forename = firstNameInput?.value.trim();
    const surname = lastNameInput?.value.trim();

    if (!identity) {
      throw new Error('Please enter the 13-digit South African ID number.');
    }
    if (!/^\d{13}$/.test(identity)) {
      throw new Error('ID number must contain exactly 13 digits.');
    }

    overrides.identity_number = identity;

    if (!forename) {
      throw new Error('Please enter the customer\'s first name.');
    }
    if (!surname) {
      throw new Error('Please enter the customer\'s surname.');
    }

    overrides.forename = forename;
    overrides.surname = surname;

    const grossMonthlyIncome = grossMonthlyIncomeInput?.value.trim();
    if (!grossMonthlyIncome || parseFloat(grossMonthlyIncome) <= 0) {
      throw new Error('Please enter a valid gross monthly income.');
    }
    overrides.gross_monthly_income = parseFloat(grossMonthlyIncome);

    const yearsAtCurrentEmployerRaw = yearsCurrentEmployerInput?.value.trim();
    if (yearsAtCurrentEmployerRaw === undefined || yearsAtCurrentEmployerRaw === '') {
      throw new Error('Please enter how many years the applicant has worked at their current employer (0 if unemployed).');
    }
    const yearsAtCurrentEmployer = parseFloat(yearsAtCurrentEmployerRaw);
    if (!Number.isFinite(yearsAtCurrentEmployer) || yearsAtCurrentEmployer < 0) {
      throw new Error('Please enter a valid non-negative number of years at the current employer.');
    }
    const monthsInCurrentJob = yearsAtCurrentEmployer * 12;
    overrides.months_in_current_job = monthsInCurrentJob;
    overrides.years_in_current_job = yearsAtCurrentEmployer;

    const contractType = contractTypeSelect?.value;
    if (!contractType) {
      throw new Error('Please select the applicant\'s contract type.');
    }
    overrides.contract_type = contractType;

    const algolendBorrowerStatus = algolendNewBorrowerSelect?.value;
    if (!algolendBorrowerStatus) {
      throw new Error('Please specify whether the applicant is a new Algolend borrower.');
    }
    overrides.algolend_is_new_borrower = algolendBorrowerStatus === 'yes';

    const employmentSnapshot = getEmploymentSnapshot();
    if (!employmentSnapshot.sector) {
      throw new Error('Please select whether the applicant works for Government or the Private sector.');
    }
    if (!employmentSnapshot.employerName) {
      throw new Error('Please provide the employer name for the selected sector.');
    }
    overrides.employment_sector_type = employmentSnapshot.sector;
    overrides.employment_employer_name = employmentSnapshot.employerName;
    overrides.employment_employer_match = employmentSnapshot.matchTier;
    if (employmentSnapshot.listedMatchName) {
      overrides.employment_listed_match_name = employmentSnapshot.listedMatchName;
    }

    const derivedDob = parseDobFromId(identity);
    if (derivedDob) {
      overrides.date_of_birth = derivedDob;
    }

    return { userData: overrides };
  }

  function renderCreditScoreBreakdown(data) {
    if (!breakdownCard) return;

    if (!data) {
      breakdownCard.classList.add('hidden');
      return;
    }

    breakdownCard.classList.remove('hidden');

    const {
      score = 0,
      min = 0,
      max = 0,
      normalizedPercent = 0,
      weightPercent = 0,
      contributionPercent = 0
    } = data;
    const safeScore = Number.isFinite(score) ? score : 0;
    const safeMin = Number.isFinite(min) ? min : 0;
    const safeMax = Number.isFinite(max) ? max : 0;
    const normalizedValue = Number.isFinite(normalizedPercent) ? normalizedPercent : Number(normalizedPercent) || 0;
    const contributionValue = Number.isFinite(contributionPercent) ? contributionPercent : Number(contributionPercent) || 0;
    const normalizedRounded = normalizedValue.toFixed(1);
    const contributionRounded = contributionValue.toFixed(2);

    if (breakdownExplanation) {
      breakdownExplanation.textContent = `Min ${safeMin}, Max ${safeMax}. Experian returned ${safeScore}.`;
    }

    if (formulaEl) {
      formulaEl.innerHTML = `Step 1 · Normalize: (<span>${safeScore}</span> − ${safeMin}) / (${safeMax} − ${safeMin}) × 100`;
    }

    if (normalizedEl) {
      normalizedEl.innerHTML = `Normalized Credit Score ≈ <span>${normalizedRounded}%</span>`;
    }

    if (weightedEl) {
      weightedEl.innerHTML = `Step 2 · Weighted: ${normalizedRounded}% × ${weightPercent}% = <span>${contributionRounded}%</span> total weight`;
    }
  }

  function renderLoanEngineSummary(breakdown, totalScore, maxScore = latestLoanEngineMax, normalizedScore = null) {
    if (!engineCard || !engineList || !engineTotal) return;

    if (!breakdown) {
      engineCard.classList.add('hidden');
      engineList.innerHTML = '';
      engineTotal.textContent = '';
      if (engineHelper) {
        engineHelper.textContent = 'We evaluate Experian score, utilization, DTI, tenure, contract type, Algolend signals, and device/IP confidence once the engine runs.';
      }
      return;
    }

    if (Number.isFinite(maxScore) && maxScore > 0) {
      latestLoanEngineMax = maxScore;
    }

    if (engineHelper) {
      engineHelper.textContent = 'Minimal view of captured metrics contributing to the engine output.';
    }

    const factorConfig = [
      {
        key: 'creditScore',
        label: 'Credit Score (Experian)',
        detailBuilder: (_metric, valuePercent) => `Normalized value: ${valuePercent.toFixed(1)}%`
      },
      {
        key: 'creditUtilization',
        label: 'Credit Utilization',
        detailBuilder: (metric = {}) => {
          const ratioPercent = Number(metric.ratioPercent ?? metric.normalizedPercent);
          const balance = formatRand(metric.totalRevolvingBalance ?? metric.totalBalance);
          const limit = formatRand(metric.totalRevolvingLimit ?? metric.totalLimits);
          const ratioText = Number.isFinite(ratioPercent) ? `${ratioPercent.toFixed(1)}% util` : 'utilization unavailable';
          return `Revolving balance ${balance} vs. limit ${limit} (${ratioText})`;
        }
      },
      {
        key: 'dti',
        label: 'Debt-to-Income Ratio (DTI)',
        detailBuilder: (metric = {}) => {
          const dtiPercent = Number(metric.dtiPercent);
          const monthlyDebt = formatRand(metric.totalMonthlyDebt ?? 0);
          const monthlyIncome = formatRand(metric.grossMonthlyIncome ?? 0);
          const dtiText = Number.isFinite(dtiPercent) ? `${dtiPercent.toFixed(1)}% DTI` : 'DTI unavailable';
          return `Monthly debt ${monthlyDebt} vs. income ${monthlyIncome} (${dtiText})`;
        }
      },
      {
        key: 'employmentTenure',
        label: 'Employment Tenure',
        detailBuilder: (metric = {}) => {
          const monthsValue = Number(metric.monthsInCurrentJob);
          const yearsValue = Number.isFinite(metric.yearsInCurrentJob)
            ? Number(metric.yearsInCurrentJob)
            : (Number.isFinite(monthsValue) ? monthsValue / 12 : NaN);
          const monthsText = Number.isFinite(monthsValue)
            ? `${monthsValue.toFixed(0)} months`
            : 'tenure unavailable';
          const yearsText = Number.isFinite(yearsValue)
            ? `${yearsValue.toFixed(1)} years`
            : null;
          return yearsText
            ? `${yearsText} (${monthsText}) at current employer`
            : `${monthsText} at current employer`;
        }
      },
      {
        key: 'contractType',
        label: 'Contract Type',
        detailBuilder: (metric = {}) => {
          const labelMap = {
            PERMANENT: 'Permanent',
            PERMANENT_ON_PROBATION: 'Permanent · Probation',
            FIXED_TERM_12_PLUS: 'Fixed Term · ≥ 12 months',
            FIXED_TERM_LT_12: 'Fixed Term · < 12 months',
            SELF_EMPLOYED_12_PLUS: 'Self-employed · ≥ 12 months history',
            PART_TIME: 'Part-time',
            UNEMPLOYED_OR_UNKNOWN: 'Unemployed / Unknown'
          };
          const rawType = metric.contractType;
          const friendly = rawType && labelMap[rawType] ? labelMap[rawType] : 'Not captured';
          const remainingText = metric.fixedTermMonthsRemaining
            ? `${metric.fixedTermMonthsRemaining} months remaining`
            : null;
          return remainingText ? `${friendly} (${remainingText})` : friendly;
        }
      },
      {
        key: 'employmentCategory',
        label: 'Employer Category',
        detailBuilder: (metric = {}) => {
          const sector = metric.sector === 'GOVERNMENT'
            ? 'Government / State'
            : 'Private / Listed';
          const employerName = metric.employerName
            ? escapeHtml(metric.employerName)
            : 'Employer not captured';
          const matchLabel = (() => {
            switch (metric.matchLabel) {
              case 'GOVERNMENT':
                return '100% · Government';
              case 'LISTED':
                return '80% · Listed';
              case 'HIGH_RISK':
                return '50% · Manual';
              case 'NOT_FOUND':
                return '0% · Not found';
              default:
                return 'Pending classification';
            }
          })();
          const listedText = metric.listedMatchName
            ? ` · Matched ${escapeHtml(metric.listedMatchName)}`
            : '';
          return `${sector} · ${employerName} (${matchLabel}${listedText})`;
        }
      },
      {
        key: 'incomeStability',
        label: 'Income Stability',
        detailBuilder: (metric = {}) => {
          const reason = metric.stabilityReason || 'Not evaluated';
          return escapeHtml(reason);
        }
      },
      {
        key: 'algolendRepayment',
        label: 'Algolend Repayment History',
        detailBuilder: (metric = {}) => {
          const statusText = metric.isNewBorrower
            ? 'New Algolend borrower · provisional 100%'
            : 'Existing Algolend borrower · default 50%';
          return statusText;
        }
      },
      {
        key: 'aglRetrieval',
        label: 'AGL Retrieval Score',
        detailBuilder: () => 'Automatic 100% · API integration pending'
      },
      {
        key: 'adverseListings',
        label: 'Adverse Listings',
        detailBuilder: (metric, valuePercent) => `Adverse count: ${metric.totalAdverse ?? 0} · Score: ${valuePercent.toFixed(1)}%`
      },
      {
        key: 'deviceFingerprint',
        label: 'Device / IP Confidence',
        detailBuilder: (metric = {}) => {
          const signalsCaptured = Number(metric.signalsCaptured ?? 0);
          const requiredSignals = Number(metric.requiredSignals ?? 2);
          const ipStatus = metric.ip ? `IP: ${escapeHtml(metric.ip)}` : 'IP missing';
          const uaStatus = metric.userAgent ? `User-Agent: ${escapeHtml(metric.userAgent)}` : 'User-Agent missing';
          return `Signals ${signalsCaptured}/${requiredSignals} · ${ipStatus} · ${uaStatus}`;
        }
      }
    ];

    const rows = factorConfig
      .map(({ key, label, detailBuilder }) => {
        const metric = breakdown[key];
        if (!metric) return null;
        const valuePercent = Number(metric.valuePercent ?? metric.normalizedPercent ?? 0);
        const contributionPercent = Number(metric.contributionPercent ?? 0);
        const details = typeof detailBuilder === 'function'
          ? detailBuilder(metric, valuePercent)
          : `Value: ${valuePercent.toFixed(1)}%`;
        return `
          <div class="engine-row">8
            <div>
              <strong>${label}</strong>
              <span>${details}</span>
            </div>
            <div class="engine-row-score">${contributionPercent.toFixed(2)}%</div>
          </div>
        `;
      })
      .filter(Boolean)
      .join('');

    const rawScore = Number(totalScore) || 0;
    const normalized = Number.isFinite(normalizedScore)
      ? normalizedScore
      : (latestLoanEngineMax > 0 ? (rawScore / latestLoanEngineMax) * 100 : rawScore);

    engineList.innerHTML = rows || '<p class="helper-text">No loan-engine factors scored yet.</p>';
    engineTotal.textContent = `Engine output: ${normalized.toFixed(1)} / 100`;
    engineCard.classList.remove('hidden');
  }

  function renderCreditExposure(exposure) {
    if (!exposureCard || !exposureFields.utilization) {
      return;
    }

    if (!exposure) {
      exposureCard.classList.add('hidden');
      return;
    }

    const ratioPercent = exposure.revolvingUtilizationPercent ?? (
      Number.isFinite(exposure.revolvingUtilizationRatio)
        ? exposure.revolvingUtilizationRatio * 100
        : null
    );

    exposureFields.utilization.textContent = formatPercent(ratioPercent ?? exposure.ratioPercent);
    exposureFields.revolvingBalance.textContent = formatRand(exposure.revolvingBalance);
    const revolvingLimitValue = exposure.revolvingLimits ?? exposure.totalRevolvingLimit ?? exposure.totalLimits;
    exposureFields.revolvingLimit.textContent = formatRand(revolvingLimitValue);
    exposureFields.totalBalance.textContent = formatRand(exposure.totalBalance);
    exposureFields.totalLimit.textContent = formatRand(exposure.totalLimits);
    exposureFields.openAccounts.textContent = Number.isFinite(exposure.openAccounts)
      ? `${exposure.openAccounts}`
      : '--';

    if (exposureHelper) {
      exposureHelper.textContent = 'Live figures from Experian retdata · combined CPA + NLR exposures.';
    }

    exposureCard.classList.remove('hidden');
  }

  function renderScoreReasons(reasons) {
    if (!reasonCard || !reasonList) {
      return;
    }

    const normalizedReasons = Array.isArray(reasons)
      ? reasons.filter(reason => reason && (reason.code || reason.description || reason.raw))
      : [];

    if (normalizedReasons.length === 0) {
      reasonList.innerHTML = '';
      reasonCard.classList.add('hidden');
      return;
    }

    const items = normalizedReasons
      .map(reason => {
        const code = escapeHtml(reason.code || 'Reason');
        const description = escapeHtml(reason.description || reason.raw || 'Provided by Experian');
        return `<li><strong>${code}</strong> · ${description}</li>`;
      })
      .join('');

    reasonList.innerHTML = items;
    reasonCard.classList.remove('hidden');
  }

  function renderEmploymentHistory(employers) {
    if (!employmentCard || !employmentBody) {
      return;
    }

    const normalizedEmployers = Array.isArray(employers)
      ? employers.filter(emp => emp && (emp.employerName || emp.occupation))
      : [];

    if (normalizedEmployers.length === 0) {
      employmentBody.innerHTML = '';
      employmentCard.classList.add('hidden');
      return;
    }

    const rows = normalizedEmployers.slice(0, 6).map(employer => `
      <tr>
        <td>${escapeHtml(employer.employerName || 'Unknown')}</td>
        <td>${escapeHtml(employer.occupation || 'N/A')}</td>
        <td>${escapeHtml(employer.employerType || 'N/A')}</td>
        <td>${escapeHtml(employer.salaryFrequency || 'N/A')}</td>
        <td>${escapeHtml(employer.payslipReference || '—')}</td>
        <td>${escapeHtml(employer.employeeNumber || '—')}</td>
        <td>${escapeHtml(employer.activeDate || employer.dateCreated || '--')}</td>
      </tr>
    `).join('');

    employmentBody.innerHTML = rows;
    employmentCard.classList.remove('hidden');
  }

  async function detectMockMode() {
    if (!mockModeEl) return;
    try {
      const response = await fetch('/api/mock-mode');
      const payload = await response.json();
      if (typeof payload.mock === 'boolean') {
        mockModeEl.textContent = payload.mock ? 'ON' : 'OFF';
      }
    } catch (error) {
      mockModeEl.textContent = 'unknown';
      console.error('Unable to detect mock mode', error);
    }
  }

  async function runCreditCheck() {
    if (!button) {
      console.error('Missing run button');
      return;
    }

    if (!intakeLocked || !lockedPayload) {
      setIntakeError('Lock all required inputs before starting the engine.');
      appendConsoleLine('Start command rejected · inputs not locked.', 'error');
      return;
    }

    button.disabled = true;
    resetRetdataDownload();
    setIntakeError('');
    statusEl.textContent = 'Running credit check...';
    startEngineLoader();
    if (resultEl) {
      resultEl.textContent = 'Contacting Experian (or mock).';
      resultEl.classList.remove('hidden');
    }
    appendConsoleLine('Start Engine command received.', 'success');
    appendConsoleLine('Submitting payload to Experian SOAP service...', 'muted');

    const requestPayload = JSON.parse(JSON.stringify(lockedPayload));

    try {
      const session = await getActiveSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        setIntakeError('Session expired. Please sign in again.');
        const next = encodeURIComponent(location.pathname + location.search + location.hash);
        location.replace(`/auth.html?tab=in&redirect=${next}`);
        failEngineLoader();
        return;
      }

      if (session?.user?.id) {
        requestPayload.userData.user_id = session.user.id;
      }

      const res = await fetch('/api/credit-check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          applicationId: requestPayload.applicationId || Date.now(),
          userData: requestPayload.userData
        })
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.success || !payload?.creditScore) {
        throw new Error(payload?.error || payload?.message || 'Credit check failed');
      }

      appendConsoleLine('Experian response received.', 'success');
      appendConsoleLine('Normalizing loan-engine factors...', 'muted');

      const creditScore = payload.creditScore || {};
      const mockMode = payload.mockMode ?? payload.mock ?? payload.raw?.mockMode;
      if (mockModeEl && typeof mockMode === 'boolean') {
        mockModeEl.textContent = mockMode ? 'ON' : 'OFF';
      }

      const normalizedLoanScore = deriveNormalizedLoanScore(
        creditScore.score,
        creditScore.max || 900,
        creditScore.normalizedPercent || creditScore.normalized_score
      );

      if (Number.isFinite(creditScore.score)) {
        scoreValueEl.textContent = creditScore.score.toString();
      } else {
        scoreValueEl.textContent = '--';
      }

      statusEl.textContent = `Engine complete · Experian ${creditScore.score ?? '--'}`;

      try {
        sessionStorage.setItem('latestCreditResult', JSON.stringify(payload));
      } catch (err) {
        console.warn('Unable to persist credit result', err);
      }
      hasEngineResult = true;
      detailsVisible = false;
      detailSections?.classList.add('hidden');
      if (viewDetailsBtn) {
        viewDetailsBtn.disabled = false;
      }

      renderCreditScoreBreakdown({
        score: creditScore.score,
        min: creditScore.min || 0,
        max: creditScore.max || 900,
        normalizedPercent: creditScore.normalizedPercent || creditScore.normalized_score || 0,
        weightPercent: creditScore.weightPercent || 35,
        contributionPercent: creditScore.contributionPercent || 0
      });

      renderLoanEngineSummary(
        null,
        Number.isFinite(normalizedLoanScore) ? normalizedLoanScore : 0,
        100,
        Number.isFinite(normalizedLoanScore) ? normalizedLoanScore : 0
      );

      renderCreditExposure(creditScore.accountSummary || creditScore.accounts?.exposure || creditScore.exposure);
      renderScoreReasons(creditScore.declineReasons || creditScore.reasons);
      renderEmploymentHistory(creditScore.employmentHistory || []);

      prepareRetdataDownload(
        payload.zipData || payload.retdata || payload.raw?.zipData,
        `${payload.applicationId || 'credit-check'}-experian-retdata.zip`
      );

      if (resultEl) {
        resultEl.textContent = 'Credit check completed.';
        resultEl.classList.remove('hidden');
      }
      completeEngineLoader();
      appendConsoleLine('Engine finished. Score ready.', 'success');

      if (proceedStepTwoBtn) {
        proceedStepTwoBtn.classList.remove('hidden');
      }
      if (button) {
        button.classList.add('hidden');
      }
    } catch (error) {
      appendConsoleLine(`Engine failed: ${error.message}`, 'error');
      statusEl.textContent = 'Credit check failed';
      renderCreditScoreBreakdown(null);
      renderLoanEngineSummary(null, null);
      renderCreditExposure(null);
      renderScoreReasons(null);
      renderEmploymentHistory(null);
      resetRetdataDownload();
      failEngineLoader();
      hasEngineResult = false;
      resetDetailSections();
      setIntakeError(error.message || 'Credit check failed');
    } finally {
      if (button && intakeLocked) {
        button.disabled = false;
      }
    }
  }

  function toggleConsoleVisibility() {
    consoleCollapsed = !consoleCollapsed;
    if (consoleCollapsed) {
      engineConsole?.classList.add('hidden');
    } else {
      engineConsole?.classList.remove('hidden');
    }
  }

  function toggleDetailSections() {
    if (!detailSections || !viewDetailsBtn) return;
    detailsVisible = !detailsVisible;
    detailSections.classList.toggle('hidden', !detailsVisible);
    viewDetailsBtn.textContent = detailsVisible ? 'Hide details' : 'View details';
  }

  function toggleBreakdown() {
    if (!breakdownToggleBtn || !engineList) return;
    breakdownExpanded = !breakdownExpanded;
    breakdownToggleBtn.textContent = breakdownExpanded ? 'Hide breakdown' : 'Show breakdown';
    engineList.classList.toggle('collapsed', !breakdownExpanded);
  }

  function lockInputs() {
    try {
      const payload = buildRequestPayload();
      lockedPayload = {
        ...payload,
        applicationId: Date.now()
      };
      intakeLocked = true;
      setIntakeError('');
      appendConsoleLine('Inputs locked. Ready for Experian.', 'success');
      showEnginePanel();
      resetVisualOutputs('Ready to launch');
      resetConsole('Inputs locked. Launch when ready.');
      if (button) {
        button.disabled = false;
      }
    } catch (error) {
      intakeLocked = false;
      lockedPayload = null;
      setIntakeError(error.message || 'Unable to lock inputs.');
      appendConsoleLine(`Validation failed: ${error.message}`, 'error');
      if (button) {
        button.disabled = true;
      }
    }
  }

  breakdownToggleBtn?.addEventListener('click', toggleBreakdown);
  engineLoader?.addEventListener('click', toggleConsoleVisibility);
  viewDetailsBtn?.addEventListener('click', toggleDetailSections);
  lockInputsBtn?.addEventListener('click', lockInputs);
  editInputsBtn?.addEventListener('click', returnToIntake);
  button?.addEventListener('click', runCreditCheck);

  employmentSectorSelect?.addEventListener('change', event => {
    setEmploymentSector(event.target.value);
  });

  governmentEmployerInput?.addEventListener('input', event => {
    if (employmentState.sector !== 'GOVERNMENT' && employmentSectorSelect) {
      employmentSectorSelect.value = 'GOVERNMENT';
      setEmploymentSector('GOVERNMENT');
    }
    if (!event.target.value) {
      employmentState.listedMatch = null;
    }
  });

  privateEmployerInput?.addEventListener('input', event => {
    if (employmentState.sector !== 'PRIVATE' && employmentSectorSelect) {
      employmentSectorSelect.value = 'PRIVATE';
      setEmploymentSector('PRIVATE');
    }
    evaluatePrivateEmployerMatch(event.target.value);
  });

  privateEmployerInput?.addEventListener('change', event => {
    evaluatePrivateEmployerMatch(event.target.value);
  });

  updateEmploymentSections();

  retdataButton?.addEventListener('click', () => {
    if (!retdataDownloadUrl) {
      return;
    }

    const filename = retdataButton.dataset.filename || 'experian-retdata.zip';
    const tempLink = document.createElement('a');
    tempLink.href = retdataDownloadUrl;
    tempLink.download = filename;
    document.body.appendChild(tempLink);
    tempLink.click();
    document.body.removeChild(tempLink);
  });

  window.addEventListener('beforeunload', revokeRetdataDownloadUrl);
  returnToIntake();
  detectMockMode();
  loadEmploymentDirectory();
})();
