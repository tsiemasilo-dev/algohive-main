// samsubServices.js
const axios = require('axios');
const crypto = require('crypto');
const FormData = require('form-data');

const BASE_URL = process.env.SUMSUB_BASE_URL || 'https://api.sumsub.com';
const APP_TOKEN = process.env.SUMSUB_APP_TOKEN;
const APP_SECRET = process.env.SUMSUB_SECRET_KEY || process.env.SUMSUB_APP_SECRET;
const WEBHOOK_SECRET = process.env.SUMSUB_WEBHOOK_SECRET;
const DEFAULT_LEVEL = process.env.SUMSUB_DEFAULT_LEVEL || 'idv-and-phone-verification';
const DEFAULT_TTL = parseInt(process.env.SUMSUB_DEFAULT_TTL || '600', 10);

function sign(method, pathWithQuery, body = '') {
  if (!APP_TOKEN || !APP_SECRET) {
    const err = new Error('Missing Sumsub app token/secret');
    err.code = 'SAMSUB_CONFIG_MISSING';
    throw err;
  }
  const ts = Math.floor(Date.now() / 1000).toString();
  const payload = ts + method.toUpperCase() + pathWithQuery + body;
  const sig = crypto.createHmac('sha256', APP_SECRET)
    .update(Buffer.from(payload))
    .digest('hex');

  return {
    'X-App-Token': APP_TOKEN,
    'X-App-Access-Ts': ts,
    'X-App-Access-Sig': sig,
  };
}

async function call(method, path, { query = {}, data, headers = {} } = {}) {
  const usp = new URLSearchParams(query);
  const pathWithQuery = usp.toString() ? `${path}?${usp.toString()}` : path;

  let bodyToSend = undefined;
  let extraHeaders = {};

  if (data instanceof FormData) {
    bodyToSend = data;
    extraHeaders = data.getHeaders();
  } else if (data !== undefined) {
    bodyToSend = typeof data === 'string' ? data : JSON.stringify(data);
    extraHeaders['Content-Type'] = 'application/json';
  }

  const sigHeaders = sign(method, pathWithQuery, typeof bodyToSend === 'string' ? bodyToSend : '');

  const res = await axios.request({
    method,
    baseURL: BASE_URL,
    url: pathWithQuery,
    data: bodyToSend,
    headers: {
      Accept: 'application/json',
      ...extraHeaders,
      ...sigHeaders,
      ...headers,
    },
    transformRequest: (b) => b, // do not mutate signed body
  });

  return res.data;
}

// ==== Public API ====

async function createApplicant({ externalUserId, levelName = DEFAULT_LEVEL, email, firstName, lastName, phone }) {
  const path = '/resources/applicants';
  const query = { levelName };
  const data = {
    externalUserId,
    email,
    phone,
    fixedInfo: { firstName, lastName }
  };
  return call('POST', path, { query, data });
}

async function uploadDocument(applicantId, { documentType, fileName, fileBuffer, mimeType, country = 'ZA' }) {
  const path = `/resources/applicants/${encodeURIComponent(applicantId)}/info/idDoc`;
  const form = new FormData();
  form.append('metadata', JSON.stringify({ idDocType: documentType, country }));
  form.append('content', fileBuffer, { filename: fileName, contentType: mimeType });
  const headers = { 'X-Return-Doc-Warnings': 'true' };
  return call('POST', path, { data: form, headers });
}

async function generateAccessToken(applicantId, levelName = DEFAULT_LEVEL, ttlInSecs = DEFAULT_TTL) {
  const path = '/resources/accessTokens';
  const query = { userId: applicantId, levelName, ttlInSecs };
  return call('POST', path, { query });
}

async function generateWebSDKLink({ applicantId, externalUserId, levelName = DEFAULT_LEVEL, ttlInSecs = DEFAULT_TTL, lang = 'en' }) {
  const path = `/resources/sdkIntegrations/levels/${encodeURIComponent(levelName)}/websdkLink`;
  const query = {
    ttlInSecs,
    lang,
    ...(applicantId ? { userId: applicantId } : {}),
    ...(externalUserId ? { externalUserId } : {}),
  };
  return call('POST', path, { query });
}

async function getApplicantStatus(applicantId) {
  const path = `/resources/applicants/${encodeURIComponent(applicantId)}/status`;
  return call('GET', path);
}

async function getApplicantLevels() {
  const path = '/resources/levels';
  return call('GET', path);
}

async function requestApplicantCheck(applicantId) {
  const path = `/resources/applicants/${encodeURIComponent(applicantId)}/status/pending`;
  return call('POST', path);
}

async function getApplicantData(applicantId) {
  const path = `/resources/applicants/${encodeURIComponent(applicantId)}/one`;
  return call('GET', path);
}

async function resetApplicant(applicantId) {
  const path = `/resources/applicants/${encodeURIComponent(applicantId)}/reset`;
  return call('POST', path);
}

function verifyWebhookSignature(rawBodyBuffer, headerDigest, headerAlg = 'sha256') {
  if (!WEBHOOK_SECRET) return false;
  const algo = (headerAlg || 'sha256').toLowerCase();
  const expected = crypto.createHmac(algo, WEBHOOK_SECRET).update(rawBodyBuffer).digest('hex');
  try {
    return headerDigest && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(headerDigest));
  } catch {
    return false;
  }
}

module.exports = {
  createApplicant,
  uploadDocument,
  generateAccessToken,
  generateWebSDKLink,
  getApplicantStatus,
  getApplicantData,
  getApplicantLevels,
  requestApplicantCheck,
  resetApplicant,
  verifyWebhookSignature,
};
