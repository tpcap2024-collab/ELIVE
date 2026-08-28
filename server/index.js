import express from 'express';
import cors from 'cors';
import { createHash, pbkdf2 as pbkdf2Callback, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { createClient } from 'redis';

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
const APPS_SCRIPT_SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;
const APPS_SCRIPT_SHARED_SECRET = String(process.env.APPS_SCRIPT_SHARED_SECRET || '').trim();
const MAX_UPLOAD_ROWS = 500;
const MAX_LOGIN_USERNAME_LENGTH = 100;
const MAX_LOGIN_PASSWORD_LENGTH = 200;
const LOGIN_FAILURE_DELAY_MS = 650;
const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_RATE_LIMIT_MAX_FAILURES = 5;
const LOGIN_IP_RATE_LIMIT_MAX_FAILURES = 20;
const LOGIN_RATE_LIMIT_WINDOW_SECONDS = Math.floor(
  LOGIN_RATE_LIMIT_WINDOW_MS / 1000
);
const LOGIN_RATE_LIMIT_KEY_PREFIX = 'elive:rate-limit:login:';
const PBKDF2_MIN_ITERATIONS = 210000;
const PBKDF2_MAX_ITERATIONS = 1000000;
const PBKDF2_KEY_LENGTH = 32;
const PBKDF2_DIGEST = 'sha256';
const pbkdf2Async = promisify(pbkdf2Callback);
const SESSION_COOKIE_NAME = '__Host-elive_session';
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;
const SESSION_TTL_SECONDS = Math.floor(SESSION_DURATION_MS / 1000);
const SESSION_KEY_PREFIX = 'elive:session:';
const REDIS_URL = String(process.env.REDIS_URL || '').trim();
let redisClient = null;
let redisReady = false;
let lastRedisError = null;
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

const SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-DNS-Prefetch-Control': 'off',
  'X-Download-Options': 'noopen',
  'X-Frame-Options': 'DENY',
  'X-Permitted-Cross-Domain-Policies': 'none',
});
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

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req, res, next) => {
  for (const [headerName, headerValue] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(headerName, headerValue);
  }

  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
  );

  if (req.path.startsWith('/api/auth/')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }

  return next();
});

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

function requireTrustedMutationOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const origin = cleanText(req.headers.origin);
  const fetchSite = cleanText(req.headers['sec-fetch-site']).toLowerCase();

  if (!origin || !allowedOrigins.includes(origin)) {
    return res.status(403).json({
      success: false,
      error: 'Request origin is not allowed.',
    });
  }

  if (fetchSite && !['same-origin', 'same-site', 'cross-site'].includes(fetchSite)) {
    return res.status(403).json({
      success: false,
      error: 'Request context is not allowed.',
    });
  }

  return next();
}

app.use(requireTrustedMutationOrigin);

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

function getLoginUserRateLimitKey(req, username) {
  return `${LOGIN_RATE_LIMIT_KEY_PREFIX}user:${getRateLimitKey(req, username)}`;
}

function getLoginIpRateLimitKey(req) {
  return `${LOGIN_RATE_LIMIT_KEY_PREFIX}ip:${getRateLimitIpKey(req)}`;
}

async function getRateLimitState(client, key, maximumFailures) {
  const values = await client.multi().get(key).ttl(key).exec();
  const count = Number(values[0] || 0);
  const ttlSeconds = Number(values[1] || LOGIN_RATE_LIMIT_WINDOW_SECONDS);
  return {
    count,
    blocked: count >= maximumFailures,
    retryAfterSeconds: Math.max(1, ttlSeconds),
  };
}

async function incrementRateLimitFailure(client, key) {
  await client.eval(
    `
      local count = redis.call('INCR', KEYS[1])
      if count == 1 then
        redis.call('EXPIRE', KEYS[1], ARGV[1])
      end
      return count
    `,
    {
      keys: [key],
      arguments: [String(LOGIN_RATE_LIMIT_WINDOW_SECONDS)],
    }
  );
}

async function clearLoginRateLimit(req, username) {
  const client = requireRedisClient();
  await client.del([
    getLoginUserRateLimitKey(req, username),
    getLoginIpRateLimitKey(req),
  ]);
}

async function loginRateLimit(req, res, next) {
  try {
    const client = requireRedisClient();
    const username = cleanText(req.body?.username).toLowerCase();
    const userKey = getLoginUserRateLimitKey(req, username);
    const ipKey = getLoginIpRateLimitKey(req);
    const [userState, ipState] = await Promise.all([
      getRateLimitState(client, userKey, LOGIN_RATE_LIMIT_MAX_FAILURES),
      getRateLimitState(client, ipKey, LOGIN_IP_RATE_LIMIT_MAX_FAILURES),
    ]);
    const blockedState = userState.blocked
      ? userState
      : ipState.blocked
        ? ipState
        : null;

    if (blockedState) {
      res.setHeader('Retry-After', String(blockedState.retryAfterSeconds));
      res.setHeader('X-RateLimit-Limit', String(LOGIN_RATE_LIMIT_MAX_FAILURES));
      res.setHeader('X-RateLimit-Remaining', '0');
      return res.status(429).json({
        success: false,
        error: 'Too many login attempts. Please try again later.',
        retryAfterSeconds: blockedState.retryAfterSeconds,
      });
    }

    res.on('finish', () => {
      if (res.statusCode === 200) {
        void clearLoginRateLimit(req, username).catch(error => {
          console.error('Unable to clear Login Rate Limit:', getErrorMessage(error));
        });
        return;
      }
      if (res.statusCode === 400 || res.statusCode === 401) {
        void Promise.all([
          incrementRateLimitFailure(client, userKey),
          incrementRateLimitFailure(client, ipKey),
        ]).catch(error => {
          console.error('Unable to update Login Rate Limit:', getErrorMessage(error));
        });
      }
    });

    res.setHeader('X-RateLimit-Limit', String(LOGIN_RATE_LIMIT_MAX_FAILURES));
    res.setHeader(
      'X-RateLimit-Remaining',
      String(Math.max(0, LOGIN_RATE_LIMIT_MAX_FAILURES - userState.count))
    );
    return next();
  } catch (error) {
    if (getErrorMessage(error) === 'SESSION_STORE_UNAVAILABLE') {
      return res.status(503).json({
        success: false,
        error: 'Security service is temporarily unavailable.',
      });
    }
    return next(error);
  }
}

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

function writeSessionRevocationAudit(req, record) {
  if (!record?.invalidReason || !record?.session) return;

  writeAuditLog({
    requestId: randomUUID(),
    timestamp: new Date().toISOString(),
    actorUsername: record.session.username,
    actorRole: record.session.role,
    method: req.method,
    path: req.path,
    action: 'SESSION_REVOKED',
    targetType: 'SESSION',
    targetIdHash: hashAuditValue(record.session.username),
    reason: record.invalidReason,
    result: 'SUCCESS',
    statusCode: 401,
    durationMs: 0,
    ipHash: getMaskedRequestIp(req),
    userAgentHash: hashAuditValue(req.headers['user-agent']),
  });
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
async function initializeRedis() {
  if (!REDIS_URL) throw new Error('REDIS_URL is not configured on Render.');
  redisClient = createClient({ url: REDIS_URL, socket: { connectTimeout: 10000, reconnectStrategy: retries => Math.min(250 * 2 ** retries, 5000) } });
  redisClient.on('error', error => { redisReady = false; lastRedisError = getErrorMessage(error); console.error('Redis client error:', lastRedisError); });
  redisClient.on('ready', () => { redisReady = true; lastRedisError = null; console.log('ELIVE session store is ready.'); });
  redisClient.on('end', () => { redisReady = false; console.warn('ELIVE session store connection ended.'); });
  await redisClient.connect();
  redisReady = redisClient.isReady;
}
function requireRedisClient() { if (!redisClient || !redisReady || !redisClient.isReady) throw new Error('SESSION_STORE_UNAVAILABLE'); return redisClient; }
function getSessionKey(tokenHash) { return `${SESSION_KEY_PREFIX}${tokenHash}`; }
async function createSession(user) {
  const client=requireRedisClient(); const token=randomBytes(48).toString('base64url'); const tokenHash=hashSessionToken(token); const now=Date.now();
  const session={username:user.username,role:user.role,createdAt:now,expiresAt:now+SESSION_DURATION_MS};
  await client.set(getSessionKey(tokenHash),JSON.stringify(session),{EX:SESSION_TTL_SECONDS}); return {token,session};
}
function getCurrentSessionUser(session) {
  const users = getConfiguredAuthUsers();
  const username = cleanText(session?.username).toLowerCase();
  const sessionRole = cleanText(session?.role).toUpperCase();
  const user = users.find(item => item.username === username);

  if (!user || !user.active) {
    return { valid: false, reason: 'ACCOUNT_INACTIVE_OR_REMOVED', user: null };
  }

  if (user.role !== sessionRole) {
    return { valid: false, reason: 'ACCOUNT_ROLE_CHANGED', user };
  }

  return { valid: true, reason: null, user };
}

async function getSessionFromRequest(req) {
  const token=parseCookies(req.headers.cookie)[SESSION_COOKIE_NAME]; if(!token) return null;
  const client=requireRedisClient(); const tokenHash=hashSessionToken(token); const raw=await client.get(getSessionKey(tokenHash)); if(!raw) return null;
  let session; try { session=JSON.parse(raw); } catch { await client.del(getSessionKey(tokenHash)); return null; }
  if(!session?.username||!session?.role||!Number.isFinite(Number(session.expiresAt))||Number(session.expiresAt)<=Date.now()){ await client.del(getSessionKey(tokenHash)); return null; }

  const normalizedSession = {
    username: cleanText(session.username).toLowerCase(),
    role: cleanText(session.role).toUpperCase(),
    createdAt: Number(session.createdAt || 0),
    expiresAt: Number(session.expiresAt),
  };
  const accountValidation = getCurrentSessionUser(normalizedSession);

  if (!accountValidation.valid) {
    await client.del(getSessionKey(tokenHash));
    return {
      tokenHash,
      session: normalizedSession,
      invalidReason: accountValidation.reason,
    };
  }

  return { tokenHash, session: normalizedSession, invalidReason: null };
}
function setSessionCookie(res,token){ res.cookie(SESSION_COOKIE_NAME,token,{httpOnly:true,secure:true,sameSite:'none',path:'/',maxAge:SESSION_DURATION_MS}); }
function clearSessionCookie(res){ res.clearCookie(SESSION_COOKIE_NAME,{httpOnly:true,secure:true,sameSite:'none',path:'/'}); }
function createSessionResponse(session){ return {username:session.username,role:session.role,expiresAt:new Date(session.expiresAt).toISOString()}; }
async function deleteSession(tokenHash){ await requireRedisClient().del(getSessionKey(tokenHash)); }
async function requireAuthentication(req,res,next){
  try {
    const record=await getSessionFromRequest(req);
    if(!record || record.invalidReason){
      if (record?.invalidReason) writeSessionRevocationAudit(req, record);
      clearSessionCookie(res);
      return res.status(401).json({
        success:false,
        authenticated:false,
        error: record?.invalidReason === 'ACCOUNT_ROLE_CHANGED'
          ? 'Account permission changed. Please sign in again.'
          : 'Authentication required.'
      });
    }
    req.auth={username:record.session.username,role:record.session.role,expiresAt:record.session.expiresAt}; req.authSessionTokenHash=record.tokenHash; return next();
  } catch(error){
    const errorCode=getErrorMessage(error);
    if(errorCode==='SESSION_STORE_UNAVAILABLE') return res.status(503).json({success:false,error:'Session service is temporarily unavailable.'});
    if(errorCode==='AUTH_CONFIG_MISSING'||errorCode==='AUTH_CONFIG_INVALID') return res.status(503).json({success:false,error:'Authentication service is not configured.'});
    return next(error);
  }
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

function validateAppsScriptSharedSecret() {
  if (!APPS_SCRIPT_SHARED_SECRET || APPS_SCRIPT_SHARED_SECRET.length < 32) {
    throw new Error('APPS_SCRIPT_SHARED_SECRET must contain at least 32 characters.');
  }
}
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}
function createAppsScriptSignature(method, action, payload) {
  validateAppsScriptSharedSecret();
  const timestamp=String(Date.now());
  const nonce=randomBytes(24).toString('hex');
  const payloadHash=createHash('sha256').update(stableStringify(payload)).digest('hex');
  const canonicalText=[String(method).toUpperCase(),timestamp,nonce,String(action),payloadHash].join('\n');
  const signature=createHmac('sha256',APPS_SCRIPT_SHARED_SECRET).update(canonicalText).digest('hex');
  return {timestamp,nonce,signature};
}

async function requestAppsScriptGet(action, parameters = {}) {
  validateAppsScriptUrl();

  const signedParameters = {};
  for (const [key, value] of Object.entries(parameters)) {
    if (value !== undefined && value !== null) signedParameters[key] = String(value);
  }
  const auth = createAppsScriptSignature('GET', action, signedParameters);
  const queryData = {
    action,
    ...signedParameters,
    authTimestamp: auth.timestamp,
    authNonce: auth.nonce,
    authSignature: auth.signature,
    t: String(Date.now()),
  };

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
          _auth: createAppsScriptSignature('POST', action, { action, ...payload }),
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

app.post('/api/auth/login', loginRateLimit, async (req,res)=>{ try { const username=normalizeLoginUsername(req.body?.username); const password=normalizeLoginPassword(req.body?.password); const users=getConfiguredAuthUsers(); const user=users.find(item=>item.username===username); if(!user||!user.active){ await waitForLoginFailure(); return res.status(401).json({success:false,error:'Username or password is incorrect.'}); } const passwordIsValid=await verifyLoginPassword(password,user); if(!passwordIsValid){ await waitForLoginFailure(); return res.status(401).json({success:false,error:'Username or password is incorrect.'}); } const {token,session}=await createSession(user); setSessionCookie(res,token); return res.status(200).json({success:true,user:createLoginUserResponse(user),session:createSessionResponse(session),compatibilityMode:true,timestamp:new Date().toISOString()}); } catch(error){ const errorCode=getErrorMessage(error); if(errorCode==='LOGIN_PAYLOAD_INVALID') return res.status(400).json({success:false,error:'A valid username and password are required.'}); if(errorCode==='AUTH_CONFIG_MISSING'||errorCode==='AUTH_CONFIG_INVALID'){ console.error('Authentication configuration error:',errorCode); return res.status(503).json({success:false,error:'Authentication service is not configured.'}); } console.error('Login endpoint error:',getErrorMessage(error)); return res.status(500).json({success:false,error:'Unable to process login.'}); } });

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

app.get('/api/auth/session', async (req,res)=>{ try { const record=await getSessionFromRequest(req); if(!record||record.invalidReason){ if(record?.invalidReason) writeSessionRevocationAudit(req,record); clearSessionCookie(res); return res.status(401).json({success:false,authenticated:false,error:record?.invalidReason==='ACCOUNT_ROLE_CHANGED'?'Account permission changed. Please sign in again.':'Authentication required.'}); } return res.status(200).json({success:true,authenticated:true,user:{username:record.session.username,role:record.session.role},session:createSessionResponse(record.session),compatibilityMode:false,timestamp:new Date().toISOString()}); } catch(error){ const errorCode=getErrorMessage(error); if(errorCode==='SESSION_STORE_UNAVAILABLE') return res.status(503).json({success:false,error:'Session service is temporarily unavailable.'}); if(errorCode==='AUTH_CONFIG_MISSING'||errorCode==='AUTH_CONFIG_INVALID') return res.status(503).json({success:false,error:'Authentication service is not configured.'}); return sendRouteError(res,error,'Unable to read Session.',500); } });
app.post('/api/auth/logout', async (req,res)=>{ try { const record=await getSessionFromRequest(req); if(record){ req.auth={username:record.session.username,role:record.session.role,expiresAt:record.session.expiresAt}; await deleteSession(record.tokenHash); } clearSessionCookie(res); return res.status(200).json({success:true,message:'Logged out.',timestamp:new Date().toISOString()}); } catch(error){ const errorCode=getErrorMessage(error); if(errorCode==='SESSION_STORE_UNAVAILABLE') return res.status(503).json({success:false,error:'Session service is temporarily unavailable.'}); if(errorCode==='AUTH_CONFIG_MISSING'||errorCode==='AUTH_CONFIG_INVALID'){ clearSessionCookie(res); return res.status(200).json({success:true,message:'Logged out.',timestamp:new Date().toISOString()}); } return sendRouteError(res,error,'Unable to logout.',500); } });
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
    sessionStore: { type: 'redis', configured: Boolean(REDIS_URL), ready: Boolean(redisReady && redisClient?.isReady), lastError: lastRedisError },
    rateLimitStore: { type: 'redis', persistentAcrossDeploys: true, windowSeconds: LOGIN_RATE_LIMIT_WINDOW_SECONDS },
    sessionAccountValidation: { enabled: true, invalidatesOnInactive: true, invalidatesOnRoleChange: true },
    sessionRevocationAudit: { enabled: true, action: 'SESSION_REVOKED' },
    appsScript: {
      configured: Boolean(APPS_SCRIPT_URL),
      signatureConfigured: Boolean(APPS_SCRIPT_SHARED_SECRET && APPS_SCRIPT_SHARED_SECRET.length >= 32),
      signatureMaxAgeSeconds: Math.floor(APPS_SCRIPT_SIGNATURE_MAX_AGE_MS / 1000),
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
  validateAppsScriptSharedSecret();
  console.log('Apps Script URL and request signature validated:', getMaskedAppsScriptUrl());
} catch (error) {
  console.error('Apps Script configuration warning:', getErrorMessage(error));
}

async function startServer(){ await initializeRedis(); app.listen(PORT,'0.0.0.0',()=>{ console.log(`ELIVE API version ${API_VERSION} is running on port ${PORT}`); }); }
startServer().catch(error=>{ console.error('Unable to start ELIVE API:',getErrorMessage(error)); process.exit(1); });
