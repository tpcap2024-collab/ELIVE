import express from 'express';
import cors from 'cors';
import { createHash, pbkdf2 as pbkdf2Callback, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const app = express();
const PORT = Number(process.env.PORT || 10000);
const API_VERSION = '10';

const RAW_APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || '';
const APPS_SCRIPT_URL = String(RAW_APPS_SCRIPT_URL)
  .trim()
  .replace(/^['"]|['"];?$/g, '')
  .replace(/[;\s]+$/g, '')
  .replace(/\/+$/, '');

const TPCAP_LATITUDE = 13.623729606202758;
const TPCAP_LONGITUDE = 101.01501162061923;
const OSRM_BASE_URL = 'https://router.project-osrm.org';

const FRESH_CACHE_DURATION_MS = 60000;
const STALE_CACHE_DURATION_MS = 1800000;
const MASTER_PLAN_CACHE_DURATION_MS = 60000;
const APPS_SCRIPT_TIMEOUT_MS = 60000;
const ROUTE_TIMEOUT_MS = 15000;
const APPS_SCRIPT_MAX_ATTEMPTS = 3;
const MAX_UPLOAD_ROWS = 500;
const MAX_LOGIN_USERNAME_LENGTH = 100;
const MAX_LOGIN_PASSWORD_LENGTH = 200;
const LOGIN_FAILURE_DELAY_MS = 650;
const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_RATE_LIMIT_MAX_FAILURES = 5;
const LOGIN_IP_RATE_LIMIT_MAX_FAILURES = 20;
const RATE_LIMIT_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;
const loginFailureBuckets = new Map();
const loginIpFailureBuckets = new Map();
const PBKDF2_MIN_ITERATIONS = 210000;
const PBKDF2_MAX_ITERATIONS = 1000000;
const PBKDF2_KEY_LENGTH = 32;
const PBKDF2_DIGEST = 'sha256';
const pbkdf2Async = promisify(pbkdf2Callback);
const SESSION_COOKIE_NAME = '__Host-elive_session';
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;
const SESSION_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;
const sessions = new Map();
const ROLE_LEVELS = Object.freeze({
  TV_VIEWER: 10,
  OPERATOR: 20,
  PLANNER: 30,
  SUPERVISOR: 40,
  ADMIN: 50,
});
const ROLE_NAMES = Object.freeze(Object.keys(ROLE_LEVELS));

const RETRYABLE_STATUS_CODES = new Set([
  404,
  408,
  425,
  429,
  500,
  502,
  503,
  504,
]);

const allowedOrigins = [
  'https://elive.onrender.com',
  'http://localhost:5173',
  'http://localhost:3000',
];

let truckDataCache = null;
let truckDataCacheTime = 0;
let truckDataRequestPromise = null;

let masterPlanCache = null;
let masterPlanCacheTime = 0;
let masterPlanRequestPromise = null;

let lastAppsScriptSuccessTime = null;
let lastAppsScriptErrorTime = null;
let lastAppsScriptError = null;

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin not allowed: ${origin}`));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept'],
    credentials: true,
  })
);

app.use(express.json({ limit: '10mb' }));

function hashAuditValue(value) {
  const text = cleanText(value);
  if (!text) return null;
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function getRequestIp(req) {
  const forwardedFor = cleanText(req.headers['x-forwarded-for']);
  if (forwardedFor) return forwardedFor.split(',')[0].trim();
  return cleanText(req.socket?.remoteAddress) || 'unknown';
}

function getRateLimitKey(req, username) {
  return hashAuditValue(`${getRequestIp(req)}|${cleanText(username).toLowerCase()}`);
}

function getRateLimitIpKey(req) {
  return hashAuditValue(getRequestIp(req));
}

function getActiveRateLimitBucket(store, key, now = Date.now()) {
  if (!key) return null;
  const bucket = store.get(key);
  if (!bucket) return null;
  if (bucket.resetAt <= now) {
    store.delete(key);
    return null;
  }
  return bucket;
}

function addRateLimitFailure(store, key, now = Date.now()) {
  if (!key) return;
  const current = getActiveRateLimitBucket(store, key, now);
  if (current) {
    current.count += 1;
    return;
  }
  store.set(key, {
    count: 1,
    resetAt: now + LOGIN_RATE_LIMIT_WINDOW_MS,
  });
}

function clearLoginRateLimit(req, username) {
  const userKey = getRateLimitKey(req, username);
  if (userKey) loginFailureBuckets.delete(userKey);
}

function loginRateLimit(req, res, next) {
  const username = cleanText(req.body?.username).toLowerCase();
  const userKey = getRateLimitKey(req, username);
  const ipKey = getRateLimitIpKey(req);
  const now = Date.now();
  const userBucket = getActiveRateLimitBucket(loginFailureBuckets, userKey, now);
  const ipBucket = getActiveRateLimitBucket(loginIpFailureBuckets, ipKey, now);
  const blockedBucket =
    userBucket && userBucket.count >= LOGIN_RATE_LIMIT_MAX_FAILURES
      ? userBucket
      : ipBucket && ipBucket.count >= LOGIN_IP_RATE_LIMIT_MAX_FAILURES
        ? ipBucket
        : null;

  if (blockedBucket) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((blockedBucket.resetAt - now) / 1000)
    );
    res.setHeader('Retry-After', String(retryAfterSeconds));
    res.setHeader('X-RateLimit-Limit', String(LOGIN_RATE_LIMIT_MAX_FAILURES));
    res.setHeader('X-RateLimit-Remaining', '0');
    return res.status(429).json({
      success: false,
      error: 'Too many login attempts. Please try again later.',
      retryAfterSeconds,
    });
  }

  res.on('finish', () => {
    if (res.statusCode === 200) {
      clearLoginRateLimit(req, username);
      return;
    }
    if (res.statusCode === 400 || res.statusCode === 401) {
      addRateLimitFailure(loginFailureBuckets, userKey);
      addRateLimitFailure(loginIpFailureBuckets, ipKey);
    }
  });

  const remaining = Math.max(
    0,
    LOGIN_RATE_LIMIT_MAX_FAILURES - (userBucket?.count || 0)
  );
  res.setHeader('X-RateLimit-Limit', String(LOGIN_RATE_LIMIT_MAX_FAILURES));
  res.setHeader('X-RateLimit-Remaining', String(remaining));
  return next();
}

function cleanupRateLimitBuckets() {
  const now = Date.now();
  for (const store of [loginFailureBuckets, loginIpFailureBuckets]) {
    for (const [key, bucket] of store.entries()) {
      if (bucket.resetAt <= now) store.delete(key);
    }
  }
}

const rateLimitCleanupTimer = setInterval(
  cleanupRateLimitBuckets,
  RATE_LIMIT_CLEANUP_INTERVAL_MS
);
rateLimitCleanupTimer.unref();

function getMaskedRequestIp(req) {
  const forwardedFor = cleanText(req.headers['x-forwarded-for']);
  const rawIp = forwardedFor
    ? forwardedFor.split(',')[0].trim()
    : cleanText(req.socket?.remoteAddress);
  return rawIp ? `sha256:${hashAuditValue(rawIp)}` : null;
}

function getAuditDescriptor(req) {
  const method = String(req.method || '').toUpperCase();
  const path = String(req.path || '');

  if (method === 'POST' && path === '/api/auth/login') {
    return {
      action: 'AUTH_LOGIN',
      targetType: 'AUTH_USER',
      targetIdHash: hashAuditValue(req.body?.username),
    };
  }
  if (method === 'POST' && path === '/api/auth/logout') {
    return { action: 'AUTH_LOGOUT', targetType: 'SESSION', targetIdHash: null };
  }
  if (method === 'POST' && path === '/api/master-plan/rows') {
    return { action: 'MASTER_PLAN_CREATE', targetType: 'MASTER_PLAN_ROW', targetIdHash: null };
  }
  if (method === 'PUT' && /^\/api\/master-plan\/rows\/\d+$/.test(path)) {
    return {
      action: 'MASTER_PLAN_UPDATE',
      targetType: 'MASTER_PLAN_ROW',
      targetIdHash: hashAuditValue(path.split('/').pop()),
    };
  }
  if (method === 'DELETE' && /^\/api\/master-plan\/rows\/\d+$/.test(path)) {
    return {
      action: 'MASTER_PLAN_DELETE',
      targetType: 'MASTER_PLAN_ROW',
      targetIdHash: hashAuditValue(path.split('/').pop()),
    };
  }
  if (method === 'POST' && path === '/api/plans/create') {
    return { action: 'PLAN_PERIOD_CREATE', targetType: 'PLAN_PERIOD', targetIdHash: null };
  }
  if (method === 'POST' && path === '/api/plans/extra') {
    return { action: 'PLAN_EXTRA_CREATE', targetType: 'PLAN', targetIdHash: null };
  }
  if (method === 'PUT' && /^\/api\/plans\/A\d+$/i.test(path)) {
    return {
      action: 'PLAN_UPDATE',
      targetType: 'PLAN',
      targetIdHash: hashAuditValue(path.split('/').pop()),
    };
  }
  if (method === 'POST' && /^\/api\/plans\/A\d+\/confirm-work-detail$/i.test(path)) {
    return {
      action: 'WORK_DETAIL_CONFIRM',
      targetType: 'PLAN',
      targetIdHash: hashAuditValue(path.split('/')[3]),
    };
  }
  if (method === 'POST' && /^\/api\/plans\/A\d+\/cancel$/i.test(path)) {
    return {
      action: 'PLAN_CANCEL',
      targetType: 'PLAN',
      targetIdHash: hashAuditValue(path.split('/')[3]),
    };
  }
  if (method === 'POST' && /^\/api\/plans\/A\d+\/restore$/i.test(path)) {
    return {
      action: 'PLAN_RESTORE',
      targetType: 'PLAN',
      targetIdHash: hashAuditValue(path.split('/')[3]),
    };
  }
  if (method === 'POST' && path === '/api/trucks/update') {
    return {
      action: 'TRUCK_UPDATE',
      targetType: 'TRUCK',
      targetIdHash: hashAuditValue(req.body?.truckId),
    };
  }
  if (method === 'POST' && path === '/api/cache/clear') {
    return { action: 'CACHE_CLEAR', targetType: 'CACHE', targetIdHash: null };
  }
  return null;
}

function writeAuditLog(event) {
  console.log(JSON.stringify({
    logType: 'ELIVE_AUDIT',
    ...event,
  }));
}

app.use((req, res, next) => {
  const descriptor = getAuditDescriptor(req);
  if (!descriptor) return next();

  const requestId = randomUUID();
  const startedAt = Date.now();
  res.setHeader('X-Request-ID', requestId);

  res.on('finish', () => {
    const actorUsername = req.auth?.username || (
      descriptor.action === 'AUTH_LOGIN'
        ? cleanText(req.body?.username).toLowerCase() || null
        : null
    );
    const statusCode = Number(res.statusCode || 500);

    writeAuditLog({
      requestId,
      timestamp: new Date().toISOString(),
      actorUsername,
      actorRole: req.auth?.role || null,
      method: req.method,
      path: req.path,
      action: descriptor.action,
      targetType: descriptor.targetType,
      targetIdHash: descriptor.targetIdHash,
      result: statusCode >= 200 && statusCode < 400 ? 'SUCCESS' : 'FAILURE',
      statusCode,
      durationMs: Math.max(0, Date.now() - startedAt),
      ipHash: getMaskedRequestIp(req),
      userAgentHash: hashAuditValue(req.headers['user-agent']),
    });
  });

  return next();
});

function wait(milliseconds) {
  return new Promise(resolve => {
    setTimeout(resolve, milliseconds);
  });
}

function getErrorMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error || 'Unknown error');
}

function cleanText(value) {
  return String(value ?? '').trim();
}

function waitForLoginFailure() { return wait(LOGIN_FAILURE_DELAY_MS + Math.floor(Math.random() * 250)); }
function normalizeLoginUsername(value) { const username=cleanText(value).toLowerCase(); if(!username||username.length>MAX_LOGIN_USERNAME_LENGTH) throw new Error('LOGIN_PAYLOAD_INVALID'); return username; }
function normalizeLoginPassword(value) { if(typeof value!=='string'||!value||value.length>MAX_LOGIN_PASSWORD_LENGTH) throw new Error('LOGIN_PAYLOAD_INVALID'); return value; }
function getConfiguredAuthUsers() {
  const rawUsers=cleanText(process.env.ELIVE_AUTH_USERS); if(!rawUsers) throw new Error('AUTH_CONFIG_MISSING');
  let parsedUsers; try { parsedUsers=JSON.parse(rawUsers); } catch { throw new Error('AUTH_CONFIG_INVALID'); }
  if(!Array.isArray(parsedUsers)||!parsedUsers.length) throw new Error('AUTH_CONFIG_INVALID');
  const usernames=new Set(); return parsedUsers.map(user=>{ const username=cleanText(user?.username).toLowerCase(); const passwordHash=cleanText(user?.passwordHash).toLowerCase(); const salt=cleanText(user?.salt).toLowerCase(); const iterations=Number(user?.iterations); const role=cleanText(user?.role).toUpperCase(); const active=user?.active!==false; if(!username||username.length>MAX_LOGIN_USERNAME_LENGTH||!/^[a-f0-9]{64}$/.test(passwordHash)||!/^[a-f0-9]{64}$/.test(salt)||!Number.isInteger(iterations)||iterations<PBKDF2_MIN_ITERATIONS||iterations>PBKDF2_MAX_ITERATIONS||!['TV_VIEWER','OPERATOR','PLANNER','SUPERVISOR','ADMIN'].includes(role)||usernames.has(username)) throw new Error('AUTH_CONFIG_INVALID'); usernames.add(username); return {username,passwordHash,salt,iterations,role,active}; });
}
async function verifyLoginPassword(password,user){ const calculatedHash=await pbkdf2Async(password,Buffer.from(user.salt,'hex'),user.iterations,PBKDF2_KEY_LENGTH,PBKDF2_DIGEST); const expectedHash=Buffer.from(user.passwordHash,'hex'); return expectedHash.length===calculatedHash.length&&timingSafeEqual(expectedHash,calculatedHash); }
function createLoginUserResponse(user){ return {username:user.username,role:user.role}; }

function hashSessionToken(token){ return createHash('sha256').update(token).digest('hex'); }
function parseCookies(cookieHeader){ const cookies={}; for(const part of String(cookieHeader||'').split(';')){ const i=part.indexOf('='); if(i<=0) continue; const name=part.slice(0,i).trim(); const value=part.slice(i+1).trim(); if(!name) continue; try{ cookies[name]=decodeURIComponent(value); }catch{ cookies[name]=value; } } return cookies; }
function createSession(user){ const token=randomBytes(48).toString('base64url'); const tokenHash=hashSessionToken(token); const now=Date.now(); const session={username:user.username,role:user.role,createdAt:now,expiresAt:now+SESSION_DURATION_MS}; sessions.set(tokenHash,session); return {token,session}; }
function getSessionFromRequest(req){ const token=parseCookies(req.headers.cookie)[SESSION_COOKIE_NAME]; if(!token) return null; const tokenHash=hashSessionToken(token); const session=sessions.get(tokenHash); if(!session) return null; if(session.expiresAt<=Date.now()){ sessions.delete(tokenHash); return null; } return {tokenHash,session}; }
function setSessionCookie(res,token){ res.cookie(SESSION_COOKIE_NAME,token,{httpOnly:true,secure:true,sameSite:'none',path:'/',maxAge:SESSION_DURATION_MS}); }
function clearSessionCookie(res){ res.clearCookie(SESSION_COOKIE_NAME,{httpOnly:true,secure:true,sameSite:'none',path:'/'}); }
function createSessionResponse(session){ return {username:session.username,role:session.role,expiresAt:new Date(session.expiresAt).toISOString()}; }
function requireAuthentication(req, res, next) {
  const sessionRecord = getSessionFromRequest(req);
  if (!sessionRecord) {
    clearSessionCookie(res);
    return res.status(401).json({
      success: false,
      authenticated: false,
      error: 'Authentication required.',
    });
  }

  req.auth = {
    username: sessionRecord.session.username,
    role: sessionRecord.session.role,
    expiresAt: sessionRecord.session.expiresAt,
  };
  req.authSessionTokenHash = sessionRecord.tokenHash;
  return next();
}

function normalizeRoleName(value) {
  const role = cleanText(value).toUpperCase();
  if (!Object.prototype.hasOwnProperty.call(ROLE_LEVELS, role)) {
    throw new Error('ROLE_INVALID');
  }
  return role;
}

function requireMinimumRole(requiredRole) {
  const normalizedRequiredRole = normalizeRoleName(requiredRole);
  return (req, res, next) => {
    if (!req.auth) {
      return res.status(401).json({
        success: false,
        authenticated: false,
        error: 'Authentication required.',
      });
    }

    const currentRoleLevel = ROLE_LEVELS[req.auth.role] || 0;
    const requiredRoleLevel = ROLE_LEVELS[normalizedRequiredRole];
    if (currentRoleLevel < requiredRoleLevel) {
      return res.status(403).json({
        success: false,
        authenticated: true,
        authorized: false,
        error: 'Insufficient permission.',
        requiredRole: normalizedRequiredRole,
      });
    }

    req.authorization = {
      requiredRole: normalizedRequiredRole,
      currentRole: req.auth.role,
    };
    return next();
  };
}

function cleanupExpiredSessions(){ const now=Date.now(); for(const [tokenHash,session] of sessions.entries()){ if(session.expiresAt<=now) sessions.delete(tokenHash); } }
const sessionCleanupTimer=setInterval(cleanupExpiredSessions,SESSION_CLEANUP_INTERVAL_MS); sessionCleanupTimer.unref();

function validateAppsScriptUrl() {
  if (!APPS_SCRIPT_URL) {
    throw new Error('APPS_SCRIPT_URL is not configured on Render.');
  }

  if (!APPS_SCRIPT_URL.startsWith('https://script.google.com/macros/s/')) {
    throw new Error(
      'APPS_SCRIPT_URL must start with https://script.google.com/macros/s/'
    );
  }

  if (!APPS_SCRIPT_URL.endsWith('/exec')) {
    throw new Error('APPS_SCRIPT_URL must end with /exec');
  }

  if (APPS_SCRIPT_URL.includes('script.googleusercontent.com')) {
    throw new Error(
      'APPS_SCRIPT_URL must use the permanent script.google.com deployment URL.'
    );
  }
}

function getMaskedAppsScriptUrl() {
  if (!APPS_SCRIPT_URL) return 'NOT_CONFIGURED';
  if (APPS_SCRIPT_URL.length <= 45) return 'CONFIGURED';

  return APPS_SCRIPT_URL.slice(0, 34) + '...' + APPS_SCRIPT_URL.slice(-12);
}

function getTruckCacheAgeMs() {
  if (!truckDataCache || truckDataCacheTime <= 0) return null;
  return Date.now() - truckDataCacheTime;
}

function hasFreshTruckCache() {
  const age = getTruckCacheAgeMs();
  return age !== null && age <= FRESH_CACHE_DURATION_MS;
}

function hasUsableStaleTruckCache() {
  const age = getTruckCacheAgeMs();
  return age !== null && age <= STALE_CACHE_DURATION_MS;
}

function getMasterPlanCacheAgeMs() {
  if (!masterPlanCache || masterPlanCacheTime <= 0) return null;
  return Date.now() - masterPlanCacheTime;
}

function hasFreshMasterPlanCache() {
  const age = getMasterPlanCacheAgeMs();
  return age !== null && age <= MASTER_PLAN_CACHE_DURATION_MS;
}

function hasUsableStaleMasterPlanCache() {
  const age = getMasterPlanCacheAgeMs();
  return age !== null && age <= STALE_CACHE_DURATION_MS;
}

function clearTruckCache() {
  truckDataCache = null;
  truckDataCacheTime = 0;
}

function clearMasterPlanCache() {
  masterPlanCache = null;
  masterPlanCacheTime = 0;
}

function getResponsePreview(responseText) {
  return String(responseText || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

function parseJsonText(responseText, errorMessage) {
  try {
    return JSON.parse(responseText);
  } catch {
    throw new Error(errorMessage);
  }
}

async function fetchWithTimeout(url, options, timeoutMilliseconds) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMilliseconds);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function validateAppsScriptResponse(data, action) {
  if (!data || typeof data !== 'object') {
    throw new Error(`Google Apps Script ${action} returned no data.`);
  }

  if (data.error) {
    throw new Error(String(data.error));
  }

  if (data.success === false) {
    throw new Error(String(data.error || `${action} was not successful.`));
  }

  if (
    data.status &&
    data.status !== 'success' &&
    data.status !== 'validation_error'
  ) {
    throw new Error(
      String(data.error || `${action} did not return success status.`)
    );
  }
}

function recordAppsScriptSuccess() {
  lastAppsScriptSuccessTime = new Date().toISOString();
  lastAppsScriptErrorTime = null;
  lastAppsScriptError = null;
}

function recordAppsScriptError(error) {
  lastAppsScriptError = getErrorMessage(error);
  lastAppsScriptErrorTime = new Date().toISOString();
}

async function requestAppsScriptGet(action, parameters = {}) {
  validateAppsScriptUrl();

  const queryData = {
    action,
    t: String(Date.now()),
  };

  for (const [key, value] of Object.entries(parameters)) {
    if (value !== undefined && value !== null) {
      queryData[key] = String(value);
    }
  }

  const requestUrl = `${APPS_SCRIPT_URL}?${new URLSearchParams(
    queryData
  ).toString()}`;

  let finalError = null;

  for (let attempt = 1; attempt <= APPS_SCRIPT_MAX_ATTEMPTS; attempt += 1) {
    try {
      console.log(`Calling Apps Script GET ${action}, attempt ${attempt}`);

      const response = await fetchWithTimeout(
        requestUrl,
        {
          method: 'GET',
          redirect: 'follow',
          headers: {
            Accept: 'application/json',
            'User-Agent': `ELIVE-API/${API_VERSION}.0`,
          },
          cache: 'no-store',
        },
        APPS_SCRIPT_TIMEOUT_MS
      );

      const responseText = await response.text();

      if (response.ok) {
        const data = parseJsonText(
          responseText,
          `Google Apps Script ${action} returned invalid JSON.`
        );

        validateAppsScriptResponse(data, action);
        recordAppsScriptSuccess();
        return data;
      }

      finalError = new Error(
        `Google Apps Script returned HTTP ${response.status}.`
      );

      console.error(`Apps Script GET ${action} failed:`, {
        attempt,
        status: response.status,
        responsePreview: getResponsePreview(responseText),
      });

      if (!RETRYABLE_STATUS_CODES.has(response.status)) break;
    } catch (error) {
      finalError = error;
      console.error(`Apps Script GET ${action} connection error:`, {
        attempt,
        error: getErrorMessage(error),
      });
    }

    if (attempt < APPS_SCRIPT_MAX_ATTEMPTS) {
      await wait(attempt === 1 ? 1000 : 2500);
    }
  }

  const error = finalError || new Error(`${action} request failed.`);
  recordAppsScriptError(error);
  throw error;
}

/*
 * Mutation requests are sent once only. Do not retry automatically because
 * the first request may already have changed Google Sheets successfully.
 */
async function requestAppsScriptPost(action, payload = {}) {
  validateAppsScriptUrl();

  try {
    console.log(`Calling Apps Script POST ${action}, single attempt`);

    const response = await fetchWithTimeout(
      APPS_SCRIPT_URL,
      {
        method: 'POST',
        redirect: 'follow',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
          Accept: 'application/json',
          'User-Agent': `ELIVE-API/${API_VERSION}.0`,
        },
        body: JSON.stringify({
          action,
          ...payload,
        }),
        cache: 'no-store',
      },
      APPS_SCRIPT_TIMEOUT_MS
    );

    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(
        `Google Apps Script returned HTTP ${response.status}. Response: ${getResponsePreview(
          responseText
        )}`
      );
    }

    const data = parseJsonText(
      responseText,
      `Google Apps Script ${action} returned invalid JSON.`
    );

    validateAppsScriptResponse(data, action);
    recordAppsScriptSuccess();
    return data;
  } catch (error) {
    console.error(`Apps Script POST ${action} failed without retry:`, {
      error: getErrorMessage(error),
    });

    recordAppsScriptError(error);
    throw error;
  }
}

function validateDateText(value, fieldName) {
  const dateText = cleanText(value);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
    throw new Error(`${fieldName} must use yyyy-MM-dd format.`);
  }

  const [year, month, day] = dateText.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error(`${fieldName} is invalid.`);
  }

  return dateText;
}

function normalizeTimeText(value, fieldName) {
  const text = cleanText(value);
  const match = text.match(/^(\d{1,2}):(\d{2})$/);

  if (!match) {
    throw new Error(`${fieldName} must use HH:mm format.`);
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    throw new Error(`${fieldName} is invalid.`);
  }

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function normalizeWorkingDays(value) {
  const input = Array.isArray(value) ? value : [1, 2, 3, 4, 5, 6];

  return [...new Set(input.map(Number))]
    .filter(day => Number.isInteger(day) && day >= 1 && day <= 7)
    .sort((first, second) => first - second);
}

function normalizeTemplateRows(value) {
  if (!Array.isArray(value)) return [];

  if (value.length > MAX_UPLOAD_ROWS) {
    throw new Error(`Uploaded Plan cannot exceed ${MAX_UPLOAD_ROWS} rows.`);
  }

  return value
    .map(row => ({
      route: cleanText(row?.route),
      company: cleanText(row?.company),
      truckName: cleanText(row?.truckName),
      truckType: cleanText(row?.truckType),
      driverName: cleanText(row?.driverName),
      telDriver: cleanText(row?.telDriver),
      project: cleanText(row?.project),
      dropPoint: cleanText(row?.dropPoint),
      planEta: cleanText(row?.planEta),
      planEtd: cleanText(row?.planEtd),
    }))
    .filter(row => Object.values(row).some(item => item !== ''));
}

function validatePlanPeriodRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Request body is required.');
  }

  const startDate = validateDateText(body.startDate, 'startDate');
  const endDate = validateDateText(body.endDate, 'endDate');

  if (endDate < startDate) {
    throw new Error('endDate must not be earlier than startDate.');
  }

  const workingDays = normalizeWorkingDays(body.workingDays);
  if (!workingDays.length) {
    throw new Error('At least one working day is required.');
  }

  const source =
    body.source === 'uploaded-file' ? 'uploaded-file' : 'master-plan';

  const templateRows =
    source === 'uploaded-file'
      ? normalizeTemplateRows(body.templateRows)
      : undefined;

  if (source === 'uploaded-file' && !templateRows.length) {
    throw new Error('Uploaded file has no valid Plan rows.');
  }

  return {
    startDate,
    endDate,
    workingDays,
    source,
    templateRows,
    fileName: body.fileName ? cleanText(body.fileName) : undefined,
  };
}

function normalizeEditablePlan(body) {
  const source =
    body?.plan && typeof body.plan === 'object' ? body.plan : body;

  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('Plan data is required.');
  }

  const plan = {
    date: validateDateText(source.date, 'date'),
    route: cleanText(source.route),
    company: cleanText(source.company),
    truckName: cleanText(source.truckName),
    truckType: cleanText(source.truckType),
    driverName: cleanText(source.driverName),
    telDriver: cleanText(source.telDriver),
    project: cleanText(source.project),
    dropPoint: cleanText(source.dropPoint),
    planEta: normalizeTimeText(source.planEta, 'Plan ETA'),
    planEtd: normalizeTimeText(source.planEtd, 'Plan ETD'),
    remark:
      source.remark === undefined
        ? undefined
        : cleanText(source.remark).toUpperCase(),
    workDetail: cleanText(source.workDetail),
  };

  if (!plan.route) throw new Error('Route is required.');
  if (!plan.company) throw new Error('Company is required.');
  if (!plan.truckName) throw new Error('Truck Name is required.');
  if (!plan.truckType) throw new Error('Truck Type is required.');
  if (!plan.project) throw new Error('Project is required.');
  if (!plan.dropPoint) throw new Error('Drop Point is required.');

  return plan;
}

function normalizeCodeRun(value) {
  const codeRun = cleanText(value).toUpperCase();

  if (!/^A\d+$/.test(codeRun)) {
    throw new Error('codeRun format is invalid.');
  }

  return codeRun;
}

function normalizeMasterPlanRow(body) {
  const source =
    body?.row && typeof body.row === 'object' ? body.row : body;

  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('Master Plan data is required.');
  }

  const row = {
    route: cleanText(source.route),
    company: cleanText(source.company),
    truckName: cleanText(source.truckName),
    truckType: cleanText(source.truckType),
    driverName: cleanText(source.driverName),
    telDriver: cleanText(source.telDriver),
    project: cleanText(source.project),
    dropPoint: cleanText(source.dropPoint),
    planEta: normalizeTimeText(source.planEta, 'Plan ETA'),
    planEtd: normalizeTimeText(source.planEtd, 'Plan ETD'),
  };

  if (!row.route) throw new Error('Route is required.');
  if (!row.company) throw new Error('Company is required.');
  if (!row.truckName) throw new Error('Truck Name is required.');
  if (!row.truckType) throw new Error('Truck Type is required.');
  if (!row.project) throw new Error('Project is required.');
  if (!row.dropPoint) throw new Error('Drop Point is required.');

  return row;
}

function normalizeMasterPlanSheetRow(value) {
  const sheetRow = Number(value);

  if (!Number.isInteger(sheetRow) || sheetRow < 2) {
    throw new Error(
      'sheetRow must be an integer greater than or equal to 2.'
    );
  }

  return sheetRow;
}

async function getTruckDataWithCache(forceRefresh = false) {
  if (!forceRefresh && hasFreshTruckCache()) {
    return { data: truckDataCache, source: 'fresh-cache' };
  }

  if (truckDataRequestPromise) {
    try {
      return {
        data: await truckDataRequestPromise,
        source: 'shared-request',
      };
    } catch (error) {
      if (hasUsableStaleTruckCache()) {
        return { data: truckDataCache, source: 'stale-cache' };
      }
      throw error;
    }
  }

  truckDataRequestPromise = requestAppsScriptGet('getTrucks');

  try {
    const data = await truckDataRequestPromise;
    truckDataCache = data;
    truckDataCacheTime = Date.now();
    return { data, source: 'google-apps-script' };
  } catch (error) {
    if (hasUsableStaleTruckCache()) {
      return { data: truckDataCache, source: 'stale-cache' };
    }
    throw error;
  } finally {
    truckDataRequestPromise = null;
  }
}

async function getMasterPlanWithCache(forceRefresh = false) {
  if (!forceRefresh && hasFreshMasterPlanCache()) {
    return { data: masterPlanCache, source: 'fresh-cache' };
  }

  if (masterPlanRequestPromise) {
    try {
      return {
        data: await masterPlanRequestPromise,
        source: 'shared-request',
      };
    } catch (error) {
      if (hasUsableStaleMasterPlanCache()) {
        return { data: masterPlanCache, source: 'stale-cache' };
      }
      throw error;
    }
  }

  masterPlanRequestPromise = requestAppsScriptGet('getMasterPlan');

  try {
    const data = await masterPlanRequestPromise;
    masterPlanCache = data;
    masterPlanCacheTime = Date.now();
    return { data, source: 'google-apps-script' };
  } catch (error) {
    if (hasUsableStaleMasterPlanCache()) {
      return { data: masterPlanCache, source: 'stale-cache' };
    }
    throw error;
  } finally {
    masterPlanRequestPromise = null;
  }
}

function sendRouteError(res, error, fallbackMessage, statusCode = 400) {
  const message = getErrorMessage(error) || fallbackMessage;
  console.error(fallbackMessage, message);

  return res.status(statusCode).json({
    success: false,
    error: message,
    timestamp: new Date().toISOString(),
  });
}

app.post('/api/auth/login', loginRateLimit, async (req,res)=>{ try { const username=normalizeLoginUsername(req.body?.username); const password=normalizeLoginPassword(req.body?.password); const users=getConfiguredAuthUsers(); const user=users.find(item=>item.username===username); if(!user||!user.active){ await waitForLoginFailure(); return res.status(401).json({success:false,error:'Username or password is incorrect.'}); } const passwordIsValid=await verifyLoginPassword(password,user); if(!passwordIsValid){ await waitForLoginFailure(); return res.status(401).json({success:false,error:'Username or password is incorrect.'}); } const {token,session}=createSession(user); setSessionCookie(res,token); return res.status(200).json({success:true,user:createLoginUserResponse(user),session:createSessionResponse(session),compatibilityMode:true,timestamp:new Date().toISOString()}); } catch(error){ const errorCode=getErrorMessage(error); if(errorCode==='LOGIN_PAYLOAD_INVALID') return res.status(400).json({success:false,error:'A valid username and password are required.'}); if(errorCode==='AUTH_CONFIG_MISSING'||errorCode==='AUTH_CONFIG_INVALID'){ console.error('Authentication configuration error:',errorCode); return res.status(503).json({success:false,error:'Authentication service is not configured.'}); } console.error('Login endpoint error:',getErrorMessage(error)); return res.status(500).json({success:false,error:'Unable to process login.'}); } });

app.get('/api/auth/verify', requireAuthentication, (req, res) => {
  return res.status(200).json({
    success: true,
    authenticated: true,
    user: {
      username: req.auth.username,
      role: req.auth.role,
    },
    session: {
      expiresAt: new Date(req.auth.expiresAt).toISOString(),
    },
    compatibilityMode: false,
    timestamp: new Date().toISOString(),
  });
});

app.get(
  '/api/auth/role-test/:requiredRole',
  requireAuthentication,
  (req, res, next) => {
    let roleMiddleware;
    try {
      roleMiddleware = requireMinimumRole(req.params.requiredRole);
    } catch (error) {
      if (getErrorMessage(error) === 'ROLE_INVALID') {
        return res.status(400).json({
          success: false,
          error: 'Role is invalid.',
          allowedRoles: ROLE_NAMES,
        });
      }
      return next(error);
    }
    return roleMiddleware(req, res, next);
  },
  (req, res) => {
    return res.status(200).json({
      success: true,
      authenticated: true,
      authorized: true,
      user: {
        username: req.auth.username,
        role: req.auth.role,
      },
      requiredRole: req.authorization.requiredRole,
      compatibilityMode: false,
      timestamp: new Date().toISOString(),
    });
  }
);

app.get('/api/auth/session',(req,res)=>{ const record=getSessionFromRequest(req); if(!record){ clearSessionCookie(res); return res.status(401).json({success:false,authenticated:false,error:'Authentication required.'}); } return res.status(200).json({success:true,authenticated:true,user:{username:record.session.username,role:record.session.role},session:createSessionResponse(record.session),compatibilityMode:true,timestamp:new Date().toISOString()}); });
app.post('/api/auth/logout',(req,res)=>{ const record=getSessionFromRequest(req); if(record) sessions.delete(record.tokenHash); clearSessionCookie(res); return res.status(200).json({success:true,message:'Logged out.',timestamp:new Date().toISOString()}); });

app.get('/', (req, res) => {
  return res.json({
    status: 'success',
    service: 'ELIVE API',
    version: API_VERSION,
    message: 'Backend proxy is running.',
    appsScriptUrl: getMaskedAppsScriptUrl(),
    timestamp: new Date().toISOString(),
  });
});

app.get(['/health', '/api/health'], (req, res) => {
  const truckCacheAgeMs = getTruckCacheAgeMs();
  const masterCacheAgeMs = getMasterPlanCacheAgeMs();

  return res.json({
    status: 'ok',
    version: API_VERSION,
    routes: [
      '/health',
      '/api/health',
      '/api/auth/login',
      '/api/auth/verify',
      '/api/auth/role-test/:requiredRole',
      '/api/auth/session',
      '/api/auth/logout',
      '/api/trucks',
      '/api/trucks/update',
      '/api/master-plan',
      '/api/master-plan/rows',
      '/api/master-plan/rows/:sheetRow',
      '/api/plans/preview',
      '/api/plans/create',
      '/api/plans/daily',
      '/api/plans/extra',
      '/api/plans/:codeRun',
      '/api/plans/:codeRun/cancel',
      '/api/plans/:codeRun/restore',
      '/api/plans/:codeRun/confirm-work-detail',
      '/api/route-to-tpcap',
    ],
    appsScript: {
      configured: Boolean(APPS_SCRIPT_URL),
      validFormat: Boolean(
        APPS_SCRIPT_URL &&
          APPS_SCRIPT_URL.startsWith('https://script.google.com/macros/s/') &&
          APPS_SCRIPT_URL.endsWith('/exec')
      ),
      lastSuccess: lastAppsScriptSuccessTime,
      lastError: lastAppsScriptErrorTime,
      lastErrorMessage: lastAppsScriptError,
    },
    truckCache: {
      available: Boolean(truckDataCache),
      ageSeconds:
        truckCacheAgeMs === null
          ? null
          : Math.max(0, Math.round(truckCacheAgeMs / 1000)),
    },
    masterPlanCache: {
      available: Boolean(masterPlanCache),
      ageSeconds:
        masterCacheAgeMs === null
          ? null
          : Math.max(0, Math.round(masterCacheAgeMs / 1000)),
    },
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/trucks', requireAuthentication, requireMinimumRole('TV_VIEWER'), async (req, res) => {
  try {
    const forceRefresh =
      cleanText(req.query.refresh).toLowerCase() === 'true';
    const result = await getTruckDataWithCache(forceRefresh);
    const cacheAgeMs = getTruckCacheAgeMs();

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-ELIVE-Data-Source', result.source);

    return res.status(200).json({
      ...result.data,
      meta: {
        source: result.source,
        cacheAgeSeconds:
          cacheAgeMs === null
            ? 0
            : Math.max(0, Math.round(cacheAgeMs / 1000)),
        serverTime: new Date().toISOString(),
      },
    });
  } catch (error) {
    return sendRouteError(res, error, 'Unable to retrieve truck data.', 502);
  }
});

app.get('/api/master-plan', requireAuthentication, requireMinimumRole('TV_VIEWER'), async (req, res) => {
  try {
    const forceRefresh =
      cleanText(req.query.refresh).toLowerCase() === 'true';
    const result = await getMasterPlanWithCache(forceRefresh);
    const cacheAgeMs = getMasterPlanCacheAgeMs();

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-ELIVE-Data-Source', result.source);

    return res.status(200).json({
      ...result.data,
      meta: {
        source: result.source,
        cacheAgeSeconds:
          cacheAgeMs === null
            ? 0
            : Math.max(0, Math.round(cacheAgeMs / 1000)),
        serverTime: new Date().toISOString(),
      },
    });
  } catch (error) {
    return sendRouteError(res, error, 'Unable to retrieve Master Plan.', 502);
  }
});

app.post('/api/master-plan/rows', requireAuthentication, requireMinimumRole('PLANNER'), async (req, res) => {
  try {
    const row = normalizeMasterPlanRow(req.body);
    const result = await requestAppsScriptPost('createMasterPlanRow', { row });

    clearMasterPlanCache();

    return res.status(201).json(result);
  } catch (error) {
    return sendRouteError(res, error, 'Unable to create Master Plan row.');
  }
});

app.put('/api/master-plan/rows/:sheetRow', requireAuthentication, requireMinimumRole('PLANNER'), async (req, res) => {
  try {
    const sheetRow = normalizeMasterPlanSheetRow(req.params.sheetRow);
    const row = normalizeMasterPlanRow(req.body);
    const result = await requestAppsScriptPost('updateMasterPlanRow', {
      sheetRow,
      row,
    });

    clearMasterPlanCache();

    return res.status(200).json(result);
  } catch (error) {
    return sendRouteError(res, error, 'Unable to update Master Plan row.');
  }
});

app.delete('/api/master-plan/rows/:sheetRow', requireAuthentication, requireMinimumRole('SUPERVISOR'), async (req, res) => {
  try {
    const sheetRow = normalizeMasterPlanSheetRow(req.params.sheetRow);
    const result = await requestAppsScriptPost('deleteMasterPlanRow', {
      sheetRow,
    });

    clearMasterPlanCache();

    return res.status(200).json(result);
  } catch (error) {
    return sendRouteError(res, error, 'Unable to delete Master Plan row.');
  }
});

app.post('/api/plans/preview', requireAuthentication, requireMinimumRole('PLANNER'), async (req, res) => {
  try {
    const request = validatePlanPeriodRequest(req.body);
    const result = await requestAppsScriptPost('previewPlanPeriod', request);
    return res.status(200).json(result);
  } catch (error) {
    return sendRouteError(res, error, 'Unable to preview Plan period.');
  }
});

app.post('/api/plans/create', requireAuthentication, requireMinimumRole('PLANNER'), async (req, res) => {
  try {
    const request = validatePlanPeriodRequest(req.body);
    const result = await requestAppsScriptPost('createPlanPeriod', request);
    clearTruckCache();
    return res.status(200).json(result);
  } catch (error) {
    return sendRouteError(res, error, 'Unable to create Plan period.');
  }
});

app.get('/api/plans/daily', requireAuthentication, requireMinimumRole('TV_VIEWER'), async (req, res) => {
  try {
    const date = validateDateText(req.query.date, 'date');
    const result = await requestAppsScriptGet('getDailyPlans', { date });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(result);
  } catch (error) {
    return sendRouteError(res, error, 'Unable to retrieve daily Plans.');
  }
});

app.post('/api/plans/extra', requireAuthentication, requireMinimumRole('PLANNER'), async (req, res) => {
  try {
    const plan = normalizeEditablePlan(req.body);
    const result = await requestAppsScriptPost('createExtraPlan', { plan });
    clearTruckCache();
    return res.status(201).json(result);
  } catch (error) {
    return sendRouteError(res, error, 'Unable to create Extra Plan.');
  }
});

app.put('/api/plans/:codeRun', requireAuthentication, requireMinimumRole('PLANNER'), async (req, res) => {
  try {
    const codeRun = normalizeCodeRun(req.params.codeRun);
    const plan = normalizeEditablePlan(req.body);
    const result = await requestAppsScriptPost('updatePlan', {
      codeRun,
      plan,
      remark: plan.remark,
    });

    clearTruckCache();
    return res.status(200).json(result);
  } catch (error) {
    return sendRouteError(res, error, 'Unable to update Plan.');
  }
});

app.post('/api/plans/:codeRun/confirm-work-detail', requireAuthentication, requireMinimumRole('OPERATOR'), async (req, res) => {
  try {
    const codeRun = normalizeCodeRun(req.params.codeRun);
    const result = await requestAppsScriptPost('confirmWorkDetail', { codeRun });
    clearTruckCache();
    return res.status(200).json(result);
  } catch (error) {
    return sendRouteError(res, error, 'Unable to confirm Work Detail.');
  }
});

app.post('/api/plans/:codeRun/cancel', requireAuthentication, requireMinimumRole('SUPERVISOR'), async (req, res) => {
  try {
    const codeRun = normalizeCodeRun(req.params.codeRun);
    const result = await requestAppsScriptPost('cancelPlan', { codeRun });
    clearTruckCache();
    return res.status(200).json(result);
  } catch (error) {
    return sendRouteError(res, error, 'Unable to cancel Plan.');
  }
});

app.post('/api/plans/:codeRun/restore', requireAuthentication, requireMinimumRole('SUPERVISOR'), async (req, res) => {
  try {
    const codeRun = normalizeCodeRun(req.params.codeRun);
    const restoreAs = cleanText(req.body?.restoreAs || 'REGULAR').toUpperCase();

    if (restoreAs !== 'REGULAR' && restoreAs !== 'EXTRA') {
      throw new Error('restoreAs must be REGULAR or EXTRA.');
    }

    const result = await requestAppsScriptPost('restorePlan', {
      codeRun,
      restoreAs,
    });

    clearTruckCache();
    return res.status(200).json(result);
  } catch (error) {
    return sendRouteError(res, error, 'Unable to restore Plan.');
  }
});

app.post('/api/trucks/update', requireAuthentication, requireMinimumRole('OPERATOR'), async (req, res) => {
  try {
    const truckId = cleanText(req.body?.truckId);
    const newRow = req.body?.newRow;

    if (!truckId) throw new Error('truckId is required.');
    if (!Array.isArray(newRow)) throw new Error('newRow must be an array.');

    const result = await requestAppsScriptPost('updateTruck', {
      truckId,
      newRow,
    });

    clearTruckCache();
    return res.status(200).json(result);
  } catch (error) {
    return sendRouteError(res, error, 'Unable to update truck data.');
  }
});

app.get('/api/route-to-tpcap', requireAuthentication, requireMinimumRole('TV_VIEWER'), async (req, res) => {
  try {
    const latitude = Number(req.query.lat);
    const longitude = Number(req.query.lng);

    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw new Error('Latitude is invalid.');
    }

    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new Error('Longitude is invalid.');
    }

    const coordinates =
      `${longitude},${latitude};` + `${TPCAP_LONGITUDE},${TPCAP_LATITUDE}`;

    const routeUrl =
      `${OSRM_BASE_URL}/route/v1/driving/${coordinates}` +
      '?overview=full&geometries=geojson&steps=false';

    const routeResponse = await fetchWithTimeout(
      routeUrl,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': `ELIVE-API/${API_VERSION}.0`,
        },
      },
      ROUTE_TIMEOUT_MS
    );

    const routeData = parseJsonText(
      await routeResponse.text(),
      'Routing service returned invalid JSON.'
    );

    if (!routeResponse.ok || routeData.code !== 'Ok') {
      throw new Error(routeData.message || 'No driving route was found.');
    }

    const route = Array.isArray(routeData.routes) ? routeData.routes[0] : null;
    if (!route) throw new Error('No driving route was found.');

    const distanceMeters = Number(route.distance);
    const durationSeconds = Number(route.duration);
    const estimatedArrival = new Date(Date.now() + durationSeconds * 1000);

    res.setHeader('Cache-Control', 'public, max-age=45');

    return res.status(200).json({
      success: true,
      origin: { latitude, longitude },
      destination: {
        name: 'TPCAP',
        latitude: TPCAP_LATITUDE,
        longitude: TPCAP_LONGITUDE,
      },
      distanceMeters,
      distanceKilometers: Number((distanceMeters / 1000).toFixed(1)),
      durationSeconds,
      durationMinutes: Math.max(1, Math.round(durationSeconds / 60)),
      estimatedArrival: estimatedArrival.toISOString(),
      estimatedArrivalBangkok: estimatedArrival.toLocaleString('en-GB', {
        timeZone: 'Asia/Bangkok',
        hour12: false,
      }),
      geometry: route.geometry,
    });
  } catch (error) {
    return sendRouteError(res, error, 'Unable to calculate route.', 502);
  }
});

app.post('/api/cache/clear', requireAuthentication, requireMinimumRole('ADMIN'), (req, res) => {
  clearTruckCache();
  clearMasterPlanCache();

  return res.json({
    success: true,
    message: 'ELIVE API cache cleared.',
    timestamp: new Date().toISOString(),
  });
});

app.use((req, res) => {
  return res.status(404).json({
    success: false,
    error: 'API route not found.',
    path: req.path,
  });
});

app.use((error, req, res, next) => {
  console.error('Server error:', error);

  return res.status(500).json({
    success: false,
    error: getErrorMessage(error) || 'Internal server error.',
  });
});

try {
  validateAppsScriptUrl();
  console.log('Apps Script URL validated:', getMaskedAppsScriptUrl());
} catch (error) {
  console.error('Apps Script configuration warning:', getErrorMessage(error));
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`ELIVE API version ${API_VERSION} is running on port ${PORT}`);
});
