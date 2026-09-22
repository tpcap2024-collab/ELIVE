import express from 'express';
import cors from 'cors';
import { createHash, pbkdf2 as pbkdf2Callback, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { createClient } from 'redis';

const app = express();
const PORT = Number(process.env.PORT || 10000);
const API_VERSION = '27';

const RAW_APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || '';
const APPS_SCRIPT_URL = String(RAW_APPS_SCRIPT_URL)
  .trim()
  .replace(/^['"]|['"];?$/g, '')
  .replace(/[;\s]+$/g, '')
  .replace(/\/+$/, '');

const TPCAP_LATITUDE = 13.623729606202758;
const TPCAP_LONGITUDE = 101.01501162061923;
const TPCAP_GREEN_ENTRY_LATITUDE = 13.622237112897071;
const TPCAP_GREEN_ENTRY_LONGITUDE = 101.02136640328747;
const OSRM_BASE_URL = 'https://router.project-osrm.org';

const FRESH_CACHE_DURATION_MS = 60000;
const STALE_CACHE_DURATION_MS = 1800000;
const MASTER_PLAN_CACHE_DURATION_MS = 60000;
const APPS_SCRIPT_TIMEOUT_MS = 60000;
const APPS_SCRIPT_GET_TRUCKS_TIMEOUT_MS = 120000;
const APPS_SCRIPT_GET_TRUCKS_MAX_ATTEMPTS = 2;
const APPS_SCRIPT_PLAN_CREATE_TIMEOUT_MS = 120000;
const APPS_SCRIPT_MUTATION_LOCK_KEY = 'elive:apps-script:mutation-lock';
const APPS_SCRIPT_MUTATION_LOCK_SECONDS = 180;
const APPS_SCRIPT_MUTATION_WAIT_MS = 185000;
const APPS_SCRIPT_MUTATION_POLL_MS = 500;
const APPS_SCRIPT_POST_SETTLE_MS = 3000;
const APPS_SCRIPT_GET_LOCK_KEY = 'elive:apps-script:get-lock';
const APPS_SCRIPT_GET_LOCK_SECONDS = 300;
const APPS_SCRIPT_GET_WAIT_MS = 310000;
const APPS_SCRIPT_GET_POLL_MS = 250;
const APPS_SCRIPT_GPS_WAITING_KEY = 'elive:apps-script:gps-waiting';
const APPS_SCRIPT_GPS_WAITING_TTL_SECONDS = 310;
const APPS_SCRIPT_GET_CIRCUIT_PREFIX = 'elive:apps-script:get-circuit:';
const APPS_SCRIPT_GET_CIRCUIT_FAILURE_THRESHOLD = 5;
const APPS_SCRIPT_GET_CIRCUIT_COOLDOWN_SECONDS = 30;
const ROUTE_TIMEOUT_MS = 15000;
const APPS_SCRIPT_MAX_ATTEMPTS = 3;
const APPS_SCRIPT_SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;
const APPS_SCRIPT_SHARED_SECRET = String(process.env.APPS_SCRIPT_SHARED_SECRET || '').trim();
const MAX_UPLOAD_ROWS = 500;
const GPS_PARKING_SPEED_THRESHOLD_KMH = 0;
const GPS_DWELL_THRESHOLD_MS = 3 * 60 * 1000;
const GPS_STALE_THRESHOLD_MS = 5 * 60 * 1000;
const GPS_MOVEMENT_GRACE_MS = 30 * 1000;
const GPS_NEXT_TRIP_EARLY_WINDOW_MINUTES = 90;
const GPS_LSP_ARRIVAL_GROUP_WINDOW_MINUTES = 30;
const GPS_DWELL_STATE_TTL_SECONDS = 4 * 60 * 60;
const GPS_DWELL_KEY_PREFIX = 'elive:gps-dwell:';
const GPS_VEHICLE_CYCLE_KEY_PREFIX = 'elive:gps-vehicle-cycle:';
const GPS_VEHICLE_CYCLE_TTL_SECONDS = 36 * 60 * 60;
const GPS_AUTO_STAMP_KEY_PREFIX = 'elive:gps-auto-stamp:';
const GPS_AUTO_STAMP_LOCK_SECONDS = 90;
const GPS_AUTO_STAMP_RESULT_TTL_SECONDS = 36 * 60 * 60;
const GPS_PENDING_STAMP_KEY_PREFIX = 'elive:gps-pending-stamp:';
const GPS_PENDING_STAMP_LOCK_PREFIX = 'elive:gps-pending-stamp-lock:';
const GPS_PENDING_STAMP_SCHEDULE_KEY = 'elive:gps-pending-stamp:schedule';
const GPS_PENDING_STAMP_TTL_SECONDS = 7 * 24 * 60 * 60;
const GPS_PENDING_STAMP_LOCK_SECONDS = 90;
const GPS_PENDING_STAMP_BASE_RETRY_MS = 30 * 1000;
const GPS_PENDING_STAMP_MAX_RETRY_MS = 15 * 60 * 1000;
const GPS_PENDING_STAMP_BATCH_SIZE = 1;
const GPS_PENDING_STAMP_SPACING_MS = 2000;
const GPS_PENDING_STAMP_LOCK_BUSY_BASE_RETRY_MS = 60 * 1000;
const GPS_PENDING_STAMP_LOCK_BUSY_MAX_RETRY_MS = 15 * 60 * 1000;
const GPS_PENDING_STAMP_LOCK_COOLDOWN_KEY = 'elive:gps-pending-stamp:apps-script-lock-cooldown';
const GPS_PENDING_STAMP_LOCK_COOLDOWN_SECONDS = 60;
const GPS_AUTO_STAMP_ETA_ENABLED = cleanText(process.env.GPS_AUTO_STAMP_ETA_ENABLED || 'true').toLowerCase() === 'true';
const GPS_AUTO_STAMP_ETD_ENABLED = cleanText(process.env.GPS_AUTO_STAMP_ETD_ENABLED || 'false').toLowerCase() === 'true';
const GPS_BACKGROUND_WORKER_ENABLED = cleanText(process.env.GPS_BACKGROUND_WORKER_ENABLED || 'false').toLowerCase() === 'true';
const GPS_BACKGROUND_WORKER_INTERVAL_MS = Math.max(15000, Number(process.env.GPS_BACKGROUND_WORKER_INTERVAL_MS || 60000));
const GPS_WORKER_LOCK_KEY = 'elive:gps-worker:leader';
const GPS_WORKER_LOCK_SECONDS = Math.max(30, Math.ceil(GPS_BACKGROUND_WORKER_INTERVAL_MS / 1000) + 30);
const GPS_WORKER_STATUS_KEY = 'elive:gps-worker:status';
const GPS_WORKER_STATUS_TTL_SECONDS = 5 * 60;
const GPS_DAILY_PLAN_CACHE_PREFIX = 'elive:gps-worker:daily-plan:';
const GPS_DAILY_PLAN_CACHE_TTL_SECONDS = 36 * 60 * 60;
const GPS_REALTIME_CACHE_KEY = 'elive:gps-worker:realtime-snapshot';
const GPS_REALTIME_CACHE_TTL_SECONDS = 10 * 60;
const GPS_REALTIME_FALLBACK_MAX_AGE_MS = 5 * 60 * 1000;
const GPS_REALTIME_SYNCHRONIZER_LOCK_KEY = 'elive:gps-worker:realtime-synchronizer-lock';
const GPS_REALTIME_SYNCHRONIZER_LOCK_SECONDS = 90;
const GPS_REALTIME_SYNCHRONIZER_WAIT_MS = 95000;
const GPS_REALTIME_SYNCHRONIZER_POLL_MS = 250;
const SERVICE_MODE = cleanText(process.env.SERVICE_MODE || 'web').toLowerCase();
const GPS_GEOFENCES = Object.freeze([
  Object.freeze({
    id: 'TPCAP-LSP',
    name: 'TPCAP-LSP',
    latitude: 13.624391050915499,
    longitude: 101.01532262451346,
    radiusMeters: 60,
  }),
  Object.freeze({
    id: 'TPCAP-R2',
    name: 'TPCAP-R2',
    latitude: 13.624670855780815,
    longitude: 101.01287491445134,
    radiusMeters: 50,
  }),
  Object.freeze({
    id: 'TPCAP-R1',
    name: 'TPCAP-R1',
    latitude: 13.626408220162133,
    longitude: 101.01512843208137,
    radiusMeters: 80,
  }),
]);
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
const PASSWORD_CHANGE_RATE_LIMIT_KEY_PREFIX = 'elive:rate-limit:password-change:';
const PASSWORD_CHANGE_RATE_LIMIT_MAX_FAILURES = 5;
const AUTH_USER_OVERRIDE_KEY_PREFIX = 'elive:auth-user-override:';
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;
const PASSWORD_HASH_ITERATIONS = 310000;
const PBKDF2_MIN_ITERATIONS = 210000;
const PBKDF2_MAX_ITERATIONS = 1000000;
const PBKDF2_KEY_LENGTH = 32;
const PBKDF2_DIGEST = 'sha256';
const pbkdf2Async = promisify(pbkdf2Callback);
const SESSION_COOKIE_NAME = '__Host-elive_session';
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;
const SESSION_IDLE_TIMEOUT_MS = 60 * 60 * 1000;
const SESSION_TTL_SECONDS = Math.floor(SESSION_DURATION_MS / 1000);
const SESSION_KEY_PREFIX = 'elive:session:';
const SESSION_USER_INDEX_PREFIX = 'elive:session-user:';
const SESSION_LIMITS_BY_ROLE = Object.freeze({
  TV_VIEWER: 3,
  OPERATOR: 2,
  PLANNER: 2,
  SUPERVISOR: 2,
  ADMIN: 1,
});
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
  408,
  425,
  429,
  500,
  502,
  503,
  504,
]);
const NON_RETRYABLE_APPS_SCRIPT_ERROR_PATTERNS = Object.freeze([
  'nonce has already been used',
  'signature verification failed',
  'signature has expired',
  'request signature',
  'http 400',
  'http 401',
  'http 403',
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
let gpsWorkerTimer = null;
let gpsWorkerStopping = false;
let gpsWorkerCycleRunning = false;

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
  if (method === 'POST' && path === '/api/auth/change-password') {
    return {
      action: 'AUTH_PASSWORD_CHANGE',
      targetType: 'AUTH_USER',
      targetIdHash: hashAuditValue(req.auth?.username),
    };
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
  if (method === 'POST' && path === '/api/plans/delete-batch') {
    return { action: 'PLAN_BATCH_DELETE', targetType: 'PLAN_BATCH', targetIdHash: hashAuditValue((req.body?.codeRuns || []).join('|')) };
  }
  if (method === 'DELETE' && /^\/api\/plans\/A\d+$/i.test(path)) {
    return {
      action: 'PLAN_DELETE',
      targetType: 'PLAN',
      targetIdHash: hashAuditValue(path.split('/').pop()),
    };
  }
  if (method === 'PUT' && /^\/api\/plans\/A\d+$/i.test(path)) {
    return {
      action: 'PLAN_UPDATE',
      targetType: 'PLAN',
      targetIdHash: hashAuditValue(path.split('/').pop()),
    };
  }
  if (method === 'POST' && /^\/api\/plans\/A\d+\/stamp$/i.test(path)) {
    return {
      action: 'PLAN_STAMP',
      targetType: 'ACTUAL_STAMP',
      targetIdHash: hashAuditValue(path.split('/')[3]),
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
  if (method === 'POST' && path === '/api/gps/dock/evaluate') {
    return {
      action: 'GPS_DOCK_EVALUATE',
      targetType: 'GPS_DWELL',
      targetIdHash: hashAuditValue(req.body?.codeRun || req.body?.gpsId),
    };
  }
  if (method === 'GET' && path === '/api/gps/vehicle-cycle') {
    return {
      action: 'GPS_VEHICLE_CYCLE_READ',
      targetType: 'GPS_VEHICLE_CYCLE',
      targetIdHash: hashAuditValue(req.query?.licensePlate),
    };
  }
  if (method === 'DELETE' && /^\/api\/gps\/dock-status\/A\d+$/i.test(path)) {
    return {
      action: 'GPS_DOCK_RESET',
      targetType: 'GPS_DWELL',
      targetIdHash: hashAuditValue(path.split('/').pop()),
    };
  }
  if (method === 'POST' && path === '/api/trucks/update') {
    return {
      action: 'TRUCK_UPDATE',
      targetType: 'TRUCK',
      targetIdHash: hashAuditValue(req.body?.truckId),
    };
  }
  if (method === 'GET' && path === '/api/admin/sessions') {
    return {
      action: 'ADMIN_SESSION_LIST',
      targetType: 'SESSION',
      targetIdHash: null,
    };
  }
  if (method === 'POST' && path === '/api/admin/sessions/revoke-user') {
    return {
      action: 'ADMIN_SESSION_REVOKE_USER',
      targetType: 'AUTH_USER',
      targetIdHash: hashAuditValue(req.body?.username),
    };
  }
  if (method === 'POST' && path === '/api/admin/sessions/revoke-all') {
    return {
      action: 'ADMIN_SESSION_REVOKE_ALL',
      targetType: 'SESSION',
      targetIdHash: null,
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
      ...(req.auditDetails || {}),
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
function normalizeLicensePlate(value) {
  const source = cleanText(value)
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .toUpperCase();
  const match = source.match(/^([0-9A-Zก-๙]{1,4})\s*-?\s*([0-9]{1,4})/u);
  if (match) return `${match[1]}${match[2]}`.replace(/[\s-]/g, '');
  return source
    .split('(')[0]
    .replace(/\s*(?:EXTRA|EX)(?:\s*-.*)?$/i, '')
    .replace(/[\s-]/g, '');
}
function parseBangkokDateTime(value, fieldName) {
  const text = cleanText(value);
  if (!text) throw new Error(`${fieldName} is required.`);
  const isoText = text.includes('T') ? text : text.replace(' ', 'T');
  const normalizedText = /(?:Z|[+-]\d{2}:\d{2})$/.test(isoText)
    ? isoText
    : `${isoText}+07:00`;
  const date = new Date(normalizedText);
  if (Number.isNaN(date.getTime())) throw new Error(`${fieldName} is invalid.`);
  return date;
}
function calculateDistanceMeters(firstLatitude, firstLongitude, secondLatitude, secondLongitude) {
  const earthRadiusMeters = 6371000;
  const toRadians = value => value * Math.PI / 180;
  const latitudeDelta = toRadians(secondLatitude - firstLatitude);
  const longitudeDelta = toRadians(secondLongitude - firstLongitude);
  const firstLatitudeRadians = toRadians(firstLatitude);
  const secondLatitudeRadians = toRadians(secondLatitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitudeRadians) * Math.cos(secondLatitudeRadians) *
    Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(haversine));
}
function getBangkokDateText(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
function parseSheetDateText(value) {
  const text = cleanText(value);
  if (!text) return '';
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    return `${slashMatch[3]}-${String(Number(slashMatch[2])).padStart(2, '0')}-${String(Number(slashMatch[1])).padStart(2, '0')}`;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? '' : getBangkokDateText(date);
}
function parsePlanMinutes(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round((((value * 1440) % 1440) + 1440) % 1440);
  }
  const text = cleanText(value);
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (match) {
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59
      ? hour * 60 + minute
      : null;
  }
  if (text.includes('T')) {
    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) {
      const sheetsTimeValue = date.getUTCFullYear() === 1899 || date.getUTCFullYear() === 1900;
      if (sheetsTimeValue) return date.getUTCHours() * 60 + date.getUTCMinutes();
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Bangkok',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(date);
      const hour = Number(parts.find(part => part.type === 'hour')?.value || 0) % 24;
      const minute = Number(parts.find(part => part.type === 'minute')?.value || 0);
      return hour * 60 + minute;
    }
  }
  return null;
}
function getBangkokMinuteOfDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find(part => part.type === 'hour')?.value || 0) % 24;
  const minute = Number(parts.find(part => part.type === 'minute')?.value || 0);
  return hour * 60 + minute;
}
function getVehicleCycleKey(licensePlate) {
  const normalizedPlate = normalizeLicensePlate(licensePlate);
  if (!normalizedPlate) throw new Error('licensePlate is required for Vehicle Cycle.');
  return `${GPS_VEHICLE_CYCLE_KEY_PREFIX}${createHash('sha256').update(normalizedPlate).digest('hex')}`;
}
async function readVehicleCycleState(licensePlate) {
  const client = requireRedisClient();
  const raw = await client.get(getVehicleCycleKey(licensePlate));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    await client.del(getVehicleCycleKey(licensePlate));
    return null;
  }
}
async function writeVehicleCycleState(licensePlate, state) {
  const client = requireRedisClient();
  await client.set(getVehicleCycleKey(licensePlate), JSON.stringify(state), {
    EX: GPS_VEHICLE_CYCLE_TTL_SECONDS,
  });
  return state;
}
function getGpsDailyPlanCacheKey(dateText) {
  return `${GPS_DAILY_PLAN_CACHE_PREFIX}${dateText}`;
}
async function getGpsWorkerDailyPlan(dateText, forceRefresh = false) {
  const client = requireRedisClient();
  const cacheKey = getGpsDailyPlanCacheKey(dateText);
  if (!forceRefresh) {
    const cachedText = await client.get(cacheKey);
    if (cachedText) {
      try {
        const cachedPlan = JSON.parse(cachedText);
        if (Array.isArray(cachedPlan)) {
          return { plan: cachedPlan, source: 'redis-daily-plan-cache' };
        }
      } catch {
        await client.del(cacheKey);
      }
    }
  }
  const response = await requestAppsScriptGet('getGpsWorkerDailyPlan', { date: dateText });
  const plan = Array.isArray(response?.plan) ? response.plan : [];
  await client.set(cacheKey, JSON.stringify(plan), { EX: GPS_DAILY_PLAN_CACHE_TTL_SECONDS });
  return { plan, source: 'google-apps-script' };
}
async function refreshGpsWorkerDailyPlanCache(dateText) {
  const validatedDate = validateDateText(dateText, 'date');
  const result = await getGpsWorkerDailyPlan(validatedDate, true);
  const rowCount = Math.max(0, result.plan.length - 1);
  console.log(JSON.stringify({
    logType: 'ELIVE_GPS_PLAN_CACHE',
    event: 'DAILY_PLAN_CACHE_REFRESHED',
    date: validatedDate,
    rowCount,
    source: result.source,
    ttlSeconds: GPS_DAILY_PLAN_CACHE_TTL_SECONDS,
  }));
  return { date: validatedDate, rowCount, source: result.source };
}
async function refreshCurrentGpsPlanCacheIfAffected(startDate, endDate = startDate) {
  const today = getBangkokDateText(new Date());
  if (today < startDate || today > endDate) {
    return { refreshed: false, date: today, reason: 'CURRENT_DATE_NOT_AFFECTED' };
  }
  const result = await refreshGpsWorkerDailyPlanCache(today);
  return { refreshed: true, ...result };
}
async function clearGpsWorkerDailyPlanCache(dateText = null) {
  const client = requireRedisClient();
  if (dateText) return await client.del(getGpsDailyPlanCacheKey(dateText));
  let cursor = '0';
  let deletedCount = 0;
  do {
    const result = await client.scan(cursor, { MATCH: `${GPS_DAILY_PLAN_CACHE_PREFIX}*`, COUNT: 100 });
    cursor = String(result.cursor);
    if (result.keys.length) deletedCount += await client.del(result.keys);
  } while (cursor !== '0');
  return deletedCount;
}
async function writeGpsWorkerRealtimeSnapshot(realtime) {
  const snapshot = {
    actual: Array.isArray(realtime?.actual) ? realtime.actual : [],
    gps: Array.isArray(realtime?.gps) ? realtime.gps : [],
    cachedAtMs: Date.now(),
    cachedAt: new Date().toISOString(),
  };
  await requireRedisClient().set(
    GPS_REALTIME_CACHE_KEY,
    JSON.stringify(snapshot),
    { EX: GPS_REALTIME_CACHE_TTL_SECONDS }
  );
  return snapshot;
}
async function readGpsWorkerRealtimeSnapshot(maximumAgeMs = GPS_REALTIME_FALLBACK_MAX_AGE_MS) {
  const client = requireRedisClient();
  const raw = await client.get(GPS_REALTIME_CACHE_KEY);
  if (!raw) return null;
  try {
    const snapshot = JSON.parse(raw);
    const ageMs = Date.now() - Number(snapshot.cachedAtMs || 0);
    if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > maximumAgeMs) return null;
    if (!Array.isArray(snapshot.actual) || !Array.isArray(snapshot.gps)) return null;
    return { ...snapshot, ageMs };
  } catch {
    await client.del(GPS_REALTIME_CACHE_KEY);
    return null;
  }
}
async function synchronizeGpsWorkerRealtime() {
  const client = requireRedisClient();
  const deadline = Date.now() + GPS_REALTIME_SYNCHRONIZER_WAIT_MS;
  while (Date.now() < deadline) {
    const lockValue = JSON.stringify({
      token: randomUUID(),
      action: 'getGpsWorkerRealtime',
      startedAt: new Date().toISOString(),
    });
    const acquired = await client.set(
      GPS_REALTIME_SYNCHRONIZER_LOCK_KEY,
      lockValue,
      { NX: true, EX: GPS_REALTIME_SYNCHRONIZER_LOCK_SECONDS }
    );
    if (!acquired) {
      const sharedSnapshot = await readGpsWorkerRealtimeSnapshot();
      if (sharedSnapshot) {
        return {
          realtime: sharedSnapshot,
          source: 'redis-realtime-shared',
          fallbackUsed: false,
          fallbackAgeMs: sharedSnapshot.ageMs,
          synchronized: false,
        };
      }
      await wait(GPS_REALTIME_SYNCHRONIZER_POLL_MS);
      continue;
    }
    try {
      console.log(JSON.stringify({
        logType: 'ELIVE_GPS_REALTIME_SYNCHRONIZER',
        event: 'SYNC_STARTED',
      }));
      const realtime = await requestAppsScriptGet('getGpsWorkerRealtime');
      const snapshot = await writeGpsWorkerRealtimeSnapshot(realtime);
      console.log(JSON.stringify({
        logType: 'ELIVE_GPS_REALTIME_SYNCHRONIZER',
        event: 'SYNC_COMPLETED',
        cachedAt: snapshot.cachedAt,
        actualRows: Math.max(0, snapshot.actual.length - 1),
        gpsRows: Math.max(0, snapshot.gps.length - 1),
      }));
      return {
        realtime: snapshot,
        source: 'google-apps-script-synchronizer',
        fallbackUsed: false,
        fallbackAgeMs: 0,
        synchronized: true,
      };
    } catch (error) {
      const fallback = await readGpsWorkerRealtimeSnapshot();
      if (!fallback) throw error;
      console.warn(JSON.stringify({
        logType: 'ELIVE_GPS_REALTIME_SYNCHRONIZER',
        event: 'SYNC_FALLBACK_USED',
        reason: getErrorMessage(error),
        fallbackAgeMs: fallback.ageMs,
        cachedAt: fallback.cachedAt,
      }));
      return {
        realtime: fallback,
        source: 'redis-realtime-fallback',
        fallbackUsed: true,
        fallbackAgeMs: fallback.ageMs,
        synchronized: false,
      };
    } finally {
      await releaseRedisLock(
        client,
        GPS_REALTIME_SYNCHRONIZER_LOCK_KEY,
        lockValue
      ).catch(() => {});
    }
  }
  throw new Error('GPS_REALTIME_SYNCHRONIZER_WAIT_TIMEOUT');
}
async function getSharedGpsWorkerRealtime(maximumAgeMs = GPS_REALTIME_FALLBACK_MAX_AGE_MS) {
  const snapshot = await readGpsWorkerRealtimeSnapshot(maximumAgeMs);
  if (!snapshot) throw new Error('GPS_REALTIME_SNAPSHOT_UNAVAILABLE');
  return {
    realtime: snapshot,
    source: 'redis-realtime-shared',
    fallbackUsed: false,
    fallbackAgeMs: snapshot.ageMs,
    synchronized: false,
  };
}
async function getGpsWorkerCycleData(dateText) {
  const dailyPlanResult = await getGpsWorkerDailyPlan(dateText);
  const realtimeResult = await getSharedGpsWorkerRealtime();
  const realtime = realtimeResult.realtime;
  return {
    data: {
      plan: dailyPlanResult.plan,
      actual: Array.isArray(realtime?.actual) ? realtime.actual : [],
      gps: Array.isArray(realtime?.gps) ? realtime.gps : [],
    },
    planSource: dailyPlanResult.source,
    realtimeSource: realtimeResult.source,
    realtimeFallbackUsed: realtimeResult.fallbackUsed,
    realtimeFallbackAgeMs: realtimeResult.fallbackAgeMs,
    realtimeSynchronized: realtimeResult.synchronized,
  };
}

function compareTripsByPlanTime(first, second) {
  const firstDate = cleanText(first.planDate);
  const secondDate = cleanText(second.planDate);
  if (firstDate !== secondDate) return firstDate.localeCompare(secondDate);
  const firstMinutes = first.planEtaMinutes ?? Number.MAX_SAFE_INTEGER;
  const secondMinutes = second.planEtaMinutes ?? Number.MAX_SAFE_INTEGER;
  if (firstMinutes !== secondMinutes) return firstMinutes - secondMinutes;
  return first.codeRun.localeCompare(second.codeRun, undefined, { numeric: true });
}
function buildTripsForPlate(data, licensePlate, dateText) {
  const targetPlate = normalizeLicensePlate(licensePlate);
  const planRows = Array.isArray(data?.plan) ? data.plan : [];
  const actualRows = Array.isArray(data?.actual) ? data.actual : [];
  const actualByCodeRun = new Map();
  for (const row of actualRows.slice(1)) {
    if (!Array.isArray(row)) continue;
    const codeRun = cleanText(row[0]).toUpperCase();
    if (codeRun) actualByCodeRun.set(codeRun, row);
  }
  const trips = [];
  for (const row of planRows.slice(1)) {
    if (!Array.isArray(row)) continue;
    const codeRun = cleanText(row[0]).toUpperCase();
    const planDate = parseSheetDateText(row[1]);
    const planPlate = cleanText(row[4]);
    const remark = cleanText(row[12]).toUpperCase();
    if (!/^A\d+$/.test(codeRun) || remark === 'CANCEL') continue;
    if (normalizeLicensePlate(planPlate) !== targetPlate) continue;
    if (planDate !== dateText) continue;
    const actual = actualByCodeRun.get(codeRun) || [];
    trips.push({
      codeRun,
      planDate,
      planLicensePlate: planPlate,
      dropPoint: cleanText(row[9]).toUpperCase(),
      planEta: cleanText(row[10]),
      planEtaMinutes: parsePlanMinutes(row[10]),
      stampEta: cleanText(actual[4]),
      stampEtd: cleanText(actual[5]),
      actionProblem: cleanText(actual[6]),
      noWorkAction: cleanText(actual[6]).includes('ไม่มีงาน'),
      completed: Boolean(cleanText(actual[5])),
    });
  }
  return trips.sort(compareTripsByPlanTime).map((trip, index, sortedTrips) => ({
    ...trip,
    tripSequence: index + 1,
    tripCount: sortedTrips.length,
  }));
}
function getGeofenceIdForDropPoint(dropPoint) {
  const normalizedDropPoint = cleanText(dropPoint).toUpperCase();
  if (/^R1(?:-|\b)/.test(normalizedDropPoint)) return 'TPCAP-R1';
  if (/^R2(?:-|\b)/.test(normalizedDropPoint)) return 'TPCAP-R2';
  if (/^(?:L1|L2|L3|M1)(?:-|\b)/.test(normalizedDropPoint)) return 'TPCAP-LSP';
  return null;
}
function selectGpsEtaStampTrips(trips, nowMinutes, geofenceId) {
  return trips
    .filter(trip =>
      !trip.stampEta &&
      !trip.stampEtd &&
      !trip.noWorkAction &&
      (trip.planEtaMinutes === null ||
        nowMinutes >= trip.planEtaMinutes - GPS_NEXT_TRIP_EARLY_WINDOW_MINUTES) &&
      getGeofenceIdForDropPoint(trip.dropPoint) === geofenceId
    )
    .sort(compareTripsByPlanTime);
}
function selectGpsEtaArrivalGroup(trips, activeTrip, geofenceId) {
  if (!activeTrip) return [];
  const activeGeofenceId = getGeofenceIdForDropPoint(activeTrip.dropPoint);
  if (!activeGeofenceId || activeGeofenceId !== geofenceId) return [];
  const isPendingEtaTrip = trip =>
    !trip.stampEta &&
    !trip.stampEtd &&
    !trip.noWorkAction &&
    getGeofenceIdForDropPoint(trip.dropPoint) === geofenceId;
  if (geofenceId !== 'TPCAP-LSP' || activeTrip.planEtaMinutes === null) {
    return isPendingEtaTrip(activeTrip) ? [activeTrip] : [];
  }
  return trips
    .filter(trip =>
      isPendingEtaTrip(trip) &&
      trip.planEtaMinutes !== null &&
      Math.abs(trip.planEtaMinutes - activeTrip.planEtaMinutes) <=
        GPS_LSP_ARRIVAL_GROUP_WINDOW_MINUTES
    )
    .sort(compareTripsByPlanTime);
}

function selectTripForVehicle(trips, nowMinutes, previousCycle = null) {
  const inProgressTrips = trips
    .filter(trip => trip.stampEta && !trip.stampEtd && !trip.noWorkAction)
    .sort(compareTripsByPlanTime);
  if (inProgressTrips.length) {
    const lockedInProgress = inProgressTrips.find(
      trip => trip.codeRun === previousCycle?.activeCodeRun
    );
    return {
      activeTrip: lockedInProgress || inProgressTrips[0],
      selectionReason: lockedInProgress ? 'LOCKED_ACTIVE_TRIP' : 'ETA_WITHOUT_ETD',
      planEtaDifferenceMinutes: null,
    };
  }
  const pendingTrips = trips.filter(
    trip => !trip.stampEta && !trip.stampEtd && !trip.noWorkAction
  );
  if (!pendingTrips.length) {
    return {
      activeTrip: null,
      selectionReason: 'NO_PENDING_TRIP',
      planEtaDifferenceMinutes: null,
    };
  }
  const eligiblePendingTrips = pendingTrips.filter(trip =>
    trip.planEtaMinutes === null ||
    nowMinutes >= trip.planEtaMinutes - GPS_NEXT_TRIP_EARLY_WINDOW_MINUTES
  );
  if (!eligiblePendingTrips.length) {
    const nextTrip = [...pendingTrips].sort(compareTripsByPlanTime)[0] || null;
    return {
      activeTrip: null,
      selectionReason: 'WAITING_FOR_PLAN_WINDOW',
      planEtaDifferenceMinutes:
        nextTrip?.planEtaMinutes === null || nextTrip?.planEtaMinutes === undefined
          ? null
          : nextTrip.planEtaMinutes - nowMinutes,
    };
  }
  const lockedPending = eligiblePendingTrips.find(
    trip => trip.codeRun === previousCycle?.activeCodeRun
  );
  if (lockedPending) {
    return {
      activeTrip: lockedPending,
      selectionReason: 'LOCKED_ACTIVE_TRIP',
      planEtaDifferenceMinutes: lockedPending.planEtaMinutes === null
        ? null
        : Math.abs(lockedPending.planEtaMinutes - nowMinutes),
    };
  }
  const activeTrip = [...eligiblePendingTrips].sort((first, second) => {
    const firstDistance = first.planEtaMinutes === null
      ? Number.MAX_SAFE_INTEGER
      : Math.abs(first.planEtaMinutes - nowMinutes);
    const secondDistance = second.planEtaMinutes === null
      ? Number.MAX_SAFE_INTEGER
      : Math.abs(second.planEtaMinutes - nowMinutes);
    if (firstDistance !== secondDistance) return firstDistance - secondDistance;
    return compareTripsByPlanTime(first, second);
  })[0];
  return {
    activeTrip,
    selectionReason: 'NEAREST_PENDING_PLAN_ETA',
    planEtaDifferenceMinutes: activeTrip.planEtaMinutes === null
      ? null
      : Math.abs(activeTrip.planEtaMinutes - nowMinutes),
  };
}
async function resolveVehicleTrip(input, isInside, dataOverride = null) {
  const truckResult = dataOverride ? { data: dataOverride, source: 'gps-worker-cycle' } : await getTruckDataWithCache(false);
  const dateText = getBangkokDateText(input.gpsTime);
  const trips = buildTripsForPlate(truckResult.data, input.licensePlate, dateText);
  const previousCycle = await readVehicleCycleState(input.licensePlate);
  const nowMinutes = getBangkokMinuteOfDay(input.gpsTime);
  const selected = selectTripForVehicle(trips, nowMinutes, previousCycle);
  const completedTrips = trips.filter(trip => trip.completed).sort(compareTripsByPlanTime);
  const latestCompletedTrip = completedTrips.length
    ? completedTrips[completedTrips.length - 1]
    : null;
  let waitingForExit = Boolean(
    previousCycle?.date === dateText && previousCycle?.waitingForExit
  );
  let exitConfirmedAt = previousCycle?.date === dateText
    ? previousCycle?.exitConfirmedAt || null
    : null;
  const completedCodeRunChanged = Boolean(
    latestCompletedTrip &&
    previousCycle?.date === dateText &&
    previousCycle?.lastCompletedCodeRun !== latestCompletedTrip.codeRun
  );
  if (completedCodeRunChanged && isInside) {
    waitingForExit = true;
    exitConfirmedAt = null;
  }
  if (waitingForExit && !isInside) {
    waitingForExit = false;
    exitConfirmedAt = new Date().toISOString();
  }
  const activeTrip = waitingForExit ? null : selected.activeTrip;
  const nextPendingTrip = trips
    .filter(trip => !trip.stampEta && !trip.stampEtd && !trip.noWorkAction)
    .sort(compareTripsByPlanTime)[0] || null;
  const state = {
    licensePlate: input.licensePlate,
    normalizedLicensePlate: normalizeLicensePlate(input.licensePlate),
    date: dateText,
    activeCodeRun: activeTrip?.codeRun || null,
    activePlanDate: activeTrip?.planDate || null,
    activePlanEta: activeTrip?.planEta || null,
    activeTripSequence: activeTrip?.tripSequence || null,
    planEtaDifferenceMinutes: selected.planEtaDifferenceMinutes,
    gpsMinuteOfDay: nowMinutes,
    nextCodeRun: nextPendingTrip?.codeRun || null,
    nextPlanEta: nextPendingTrip?.planEta || null,
    requestedCodeRun: input.codeRun,
    lastCompletedCodeRun: latestCompletedTrip?.codeRun || previousCycle?.lastCompletedCodeRun || null,
    waitingForExit,
    exitConfirmedAt,
    selectionReason: waitingForExit
      ? 'WAITING_FOR_EXIT_AFTER_ETD'
      : selected.selectionReason,
    tripCount: trips.length,
    tripOrdering: 'ACTIVE_TRIP_THEN_LSP_ARRIVAL_GROUP_WITHIN_30_MINUTES',
    updatedAt: new Date().toISOString(),
  };
  await writeVehicleCycleState(input.licensePlate, state);
  return { state, activeTrip, trips, nowMinutes };
}
function getGpsDwellKey(codeRun) {
  return `${GPS_DWELL_KEY_PREFIX}${normalizeCodeRun(codeRun)}`;
}
function validateGpsDockPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('GPS dock evaluation payload is required.');
  }
  const codeRun = normalizeCodeRun(body.codeRun);
  const gpsId = cleanText(body.gpsId);
  const licensePlate = cleanText(body.licensePlate);
  const planLicensePlate = cleanText(body.planLicensePlate || body.licensePlate);
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  const speedKmh = Number(body.speedKmh ?? body.speed);
  const gpsStatus = cleanText(body.gpsStatus);
  const gpsTime = parseBangkokDateTime(body.gpsTime, 'gpsTime');
  const receivedAt = parseBangkokDateTime(body.receivedAt, 'receivedAt');
  if (!gpsId) throw new Error('gpsId is required.');
  if (!licensePlate) throw new Error('licensePlate is required.');
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new Error('latitude is invalid.');
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error('longitude is invalid.');
  if (!Number.isFinite(speedKmh) || speedKmh < 0 || speedKmh > 300) throw new Error('speed is invalid.');
  return { codeRun, gpsId, licensePlate, planLicensePlate, latitude, longitude, speedKmh, gpsStatus, gpsTime, receivedAt };
}
function findNearestGpsGeofence(latitude, longitude) {
  return GPS_GEOFENCES
    .map(geofence => ({
      ...geofence,
      distanceMeters: calculateDistanceMeters(latitude, longitude, geofence.latitude, geofence.longitude),
    }))
    .sort((first, second) => first.distanceMeters - second.distanceMeters)[0];
}
async function readGpsDwellState(codeRun) {
  const client = requireRedisClient();
  const rawState = await client.get(getGpsDwellKey(codeRun));
  if (!rawState) return null;
  try {
    return JSON.parse(rawState);
  } catch {
    await client.del(getGpsDwellKey(codeRun));
    return null;
  }
}
async function writeGpsDwellState(codeRun, state) {
  const client = requireRedisClient();
  await client.set(getGpsDwellKey(codeRun), JSON.stringify(state), {
    EX: GPS_DWELL_STATE_TTL_SECONDS,
  });
  return state;
}
function createGpsDockResult(state) {
  const dwellSeconds = Math.max(0, Number(state.dwellSeconds || 0));
  return {
    ...state,
    dwellSeconds,
    dwellMinutes: Number((dwellSeconds / 60).toFixed(2)),
    requiredDwellSeconds: Math.floor(GPS_DWELL_THRESHOLD_MS / 1000),
    remainingDwellSeconds: Math.max(0, Math.floor(GPS_DWELL_THRESHOLD_MS / 1000) - dwellSeconds),
    parkingSpeedThresholdKmh: GPS_PARKING_SPEED_THRESHOLD_KMH,
    gpsStaleThresholdSeconds: Math.floor(GPS_STALE_THRESHOLD_MS / 1000),
  };
}
function getGpsAutoStampKey(stampType, codeRun) {
  return `${GPS_AUTO_STAMP_KEY_PREFIX}${cleanText(stampType).toUpperCase()}:${normalizeCodeRun(codeRun)}`;
}
function normalizeStampType(value) {
  const stampType = cleanText(value).toUpperCase();
  if (stampType !== 'ETA' && stampType !== 'ETD') throw new Error('stampType must be ETA or ETD.');
  return stampType;
}
function findTripByCodeRun(data, codeRun) {
  const normalizedCodeRun = normalizeCodeRun(codeRun);
  const planRows = Array.isArray(data?.plan) ? data.plan : [];
  const actualRows = Array.isArray(data?.actual) ? data.actual : [];
  const planRow = planRows.slice(1).find(row => Array.isArray(row) && cleanText(row[0]).toUpperCase() === normalizedCodeRun);
  if (!planRow) throw new Error(`Plan ${normalizedCodeRun} was not found.`);
  if (cleanText(planRow[12]).toUpperCase() === 'CANCEL') throw new Error(`Plan ${normalizedCodeRun} is cancelled.`);
  const actualRow = actualRows.slice(1).find(row => Array.isArray(row) && cleanText(row[0]).toUpperCase() === normalizedCodeRun) || [];
  const actionProblem = cleanText(actualRow[6]);
  return {
    codeRun: normalizedCodeRun,
    planDate: parseSheetDateText(planRow[1]),
    planLicensePlate: cleanText(planRow[4]),
    planEta: cleanText(planRow[10]),
    planEtaMinutes: parsePlanMinutes(planRow[10]),
    stampEta: cleanText(actualRow[4]),
    stampEtd: cleanText(actualRow[5]),
    actionProblem,
    noWorkAction: actionProblem.includes('ไม่มีงานลง') || actionProblem.includes('ไม่มีงาน'),
  };
}
function getEtaWindowDecision(planDate, planEta, eventTime) {
  const planEtaMinutes = parsePlanMinutes(planEta);
  if (!planDate || planEtaMinutes === null) {
    return { allowed: false, reason: 'PLAN_ETA_UNAVAILABLE' };
  }
  const eventDate = parseBangkokDateTime(eventTime, 'stampTime');
  const eventDateText = getBangkokDateText(eventDate);
  const eventMinutes = getBangkokMinuteOfDay(eventDate);
  if (eventDateText !== planDate) {
    return { allowed: false, reason: 'STAMP_DATE_DOES_NOT_MATCH_PLAN_DATE' };
  }
  const earliestAllowedMinutes = planEtaMinutes - GPS_NEXT_TRIP_EARLY_WINDOW_MINUTES;
  return {
    allowed: eventMinutes >= earliestAllowedMinutes,
    reason: eventMinutes >= earliestAllowedMinutes ? null : 'ETA_BEFORE_PLAN_WINDOW',
    planDate,
    planEta,
    eventMinutes,
    earliestAllowedMinutes,
    earlyWindowMinutes: GPS_NEXT_TRIP_EARLY_WINDOW_MINUTES,
  };
}

function comparePendingStampRecords(first, second) {
  const firstGpsTime = Date.parse(first?.gpsTime || '') || Number.MAX_SAFE_INTEGER;
  const secondGpsTime = Date.parse(second?.gpsTime || '') || Number.MAX_SAFE_INTEGER;
  if (firstGpsTime !== secondGpsTime) return firstGpsTime - secondGpsTime;
  const firstCreatedAt = Date.parse(first?.createdAt || '') || Number.MAX_SAFE_INTEGER;
  const secondCreatedAt = Date.parse(second?.createdAt || '') || Number.MAX_SAFE_INTEGER;
  if (firstCreatedAt !== secondCreatedAt) return firstCreatedAt - secondCreatedAt;
  return cleanText(first?.codeRun).localeCompare(cleanText(second?.codeRun), undefined, { numeric: true });
}

async function stampActualData(payload) {
  const result = await requestAppsScriptPost('stampActualData', payload);
  clearTruckCache();
  return result;
}
function getPendingStampId(stampType, codeRun) {
  return `${normalizeStampType(stampType)}:${normalizeCodeRun(codeRun)}`;
}
function getPendingStampKey(pendingId) {
  return `${GPS_PENDING_STAMP_KEY_PREFIX}${pendingId}`;
}
function getPendingStampLockKey(pendingId) {
  return `${GPS_PENDING_STAMP_LOCK_PREFIX}${pendingId}`;
}
function calculatePendingStampRetryDelayMs(attemptCount) {
  const exponent = Math.max(0, Math.min(10, Number(attemptCount || 1) - 1));
  return Math.min(GPS_PENDING_STAMP_MAX_RETRY_MS, GPS_PENDING_STAMP_BASE_RETRY_MS * (2 ** exponent));
}
function isAppsScriptLockBusyError(error) {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes('stamp_write_lock_busy') || message.includes('lock timeout') || message.includes('holding the lock for too long');
}
function getTerminalPendingStampErrorReason(error) {
  const message = getErrorMessage(error).toUpperCase();
  const terminalReasons = [
    'ETA_BEFORE_PLAN_WINDOW',
    'STAMP_DATE_DOES_NOT_MATCH_PLAN_DATE',
    'PLAN_ETA_UNAVAILABLE',
    'IS CANCELLED',
    'CANNOT STAMP ETA BECAUSE THIS TRIP ALREADY HAS STAMP ETD',
  ];
  return terminalReasons.find(reason => message.includes(reason)) || null;
}
function calculateLockBusyRetryDelayMs(attemptCount) {
  const exponent = Math.max(0, Math.min(4, Number(attemptCount || 1) - 1));
  return Math.min(GPS_PENDING_STAMP_LOCK_BUSY_MAX_RETRY_MS, GPS_PENDING_STAMP_LOCK_BUSY_BASE_RETRY_MS * (2 ** exponent));
}
async function readPendingStamp(pendingId) {
  const raw = await requireRedisClient().get(getPendingStampKey(pendingId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    await requireRedisClient().multi().del(getPendingStampKey(pendingId)).zRem(GPS_PENDING_STAMP_SCHEDULE_KEY, pendingId).exec();
    return null;
  }
}
async function writePendingStamp(record, scheduleAtMs = null) {
  const client = requireRedisClient();
  const transaction = client.multi().set(getPendingStampKey(record.pendingId), JSON.stringify(record), { EX: GPS_PENDING_STAMP_TTL_SECONDS });
  if (Number.isFinite(scheduleAtMs)) transaction.zAdd(GPS_PENDING_STAMP_SCHEDULE_KEY, [{ score: scheduleAtMs, value: record.pendingId }]);
  else transaction.zRem(GPS_PENDING_STAMP_SCHEDULE_KEY, record.pendingId);
  await transaction.exec();
  return record;
}
async function createPendingGpsStamp(stampType, state) {
  const normalizedStampType = normalizeStampType(stampType);
  const codeRun = normalizeCodeRun(state.activeCodeRun || state.codeRun);
  const pendingId = getPendingStampId(normalizedStampType, codeRun);
  const now = new Date().toISOString();
  const payload = normalizedStampType === 'ETA'
    ? {
        codeRun,
        stampType: 'ETA',
        stampSource: 'GPS_GEOFENCE_ENTRY',
        stampTime: state.gpsTime,
        stampedBy: 'GPS SYSTEM',
        geofence: state.geofenceName,
        gpsSnapshot: { gpsId: state.gpsId, gpsTime: state.gpsTime, latitude: state.latitude, longitude: state.longitude, speed: state.speedKmh, geofence: state.geofenceName },
      }
    : {
        codeRun,
        stampType: 'ETD',
        stampSource: 'GPS_EXIT',
        stampTime: state.gpsTime,
        stampedBy: 'GPS SYSTEM',
        geofence: state.lastInsideGeofenceName || state.geofenceName,
        exitDetectedAt: state.gpsTime,
        gpsSnapshot: { gpsId: state.gpsId, gpsTime: state.gpsTime, latitude: state.latitude, longitude: state.longitude, speed: state.speedKmh, geofence: state.lastInsideGeofenceName || state.geofenceName },
      };
  const initial = {
    pendingId, stampType: normalizedStampType, codeRun,
    licensePlate: state.licensePlate, normalizedLicensePlate: normalizeLicensePlate(state.licensePlate),
    gpsId: state.gpsId, gpsTime: state.gpsTime, selectedPlanEta: state.activePlanEta || null,
    geofence: payload.geofence || null, payload,
    status: 'PENDING', attemptCount: 0, lastAttemptAt: null, lastError: null,
    nextRetryAt: now, createdAt: now, updatedAt: now, completedAt: null,
  };
  const client = requireRedisClient();
  const created = await client.set(getPendingStampKey(pendingId), JSON.stringify(initial), { NX: true, EX: GPS_PENDING_STAMP_TTL_SECONDS });
  if (created) {
    await client.zAdd(GPS_PENDING_STAMP_SCHEDULE_KEY, [{ score: Date.now(), value: pendingId }]);
    console.log(JSON.stringify({ logType: 'ELIVE_GPS_STAMP', event: 'PENDING_STAMP_CREATED', pendingId, codeRun, stampType: normalizedStampType, licensePlate: state.licensePlate, gpsTime: state.gpsTime }));
    return initial;
  }
  return await readPendingStamp(pendingId);
}
async function closePendingStamp(record, status, details = {}) {
  const now = new Date().toISOString();
  const completed = { ...record, ...details, status, nextRetryAt: null, updatedAt: now, completedAt: now };
  await writePendingStamp(completed, null);
  return completed;
}
async function processPendingGpsStamp(pendingId) {
  const client = requireRedisClient();
  const lockKey = getPendingStampLockKey(pendingId);
  const lockToken = randomUUID();
  const acquired = await client.set(lockKey, lockToken, { NX: true, EX: GPS_PENDING_STAMP_LOCK_SECONDS });
  if (!acquired) return { status: 'PROCESSING', pendingId };
  try {
    let record = await readPendingStamp(pendingId);
    if (!record) return { status: 'MISSING', pendingId };
    if (['STAMPED', 'ALREADY_STAMPED', 'BLOCKED_NO_WORK', 'SUPERSEDED'].includes(record.status)) return record;
    const attemptCount = Number(record.attemptCount || 0) + 1;
    const lastAttemptAt = new Date().toISOString();
    record = { ...record, status: 'PROCESSING', attemptCount, lastAttemptAt, lastError: null, updatedAt: lastAttemptAt };
    await writePendingStamp(record, null);
    console.log(JSON.stringify({ logType: 'ELIVE_GPS_STAMP', event: 'PENDING_STAMP_CLAIMED', pendingId, attemptCount }));

    const pendingDate = getBangkokDateText(parseBangkokDateTime(record.gpsTime, 'gpsTime'));
    const latestResult = await getGpsWorkerCycleData(pendingDate);
    const latestData = latestResult.data;
    const trip = findTripByCodeRun(latestData, record.codeRun);
    if (trip.noWorkAction) {
      console.log(JSON.stringify({ logType: 'ELIVE_GPS_STAMP', event: 'STAMP_BLOCKED_NO_WORK', pendingId, codeRun: record.codeRun }));
      return await closePendingStamp(record, 'BLOCKED_NO_WORK', { lastError: 'NO_WORK_ACTION' });
    }
    const alreadyStamped = record.stampType === 'ETA' ? Boolean(trip.stampEta) : Boolean(trip.stampEtd);
    if (alreadyStamped) {
      console.log(JSON.stringify({ logType: 'ELIVE_GPS_STAMP', event: 'STAMP_ALREADY_EXISTS', pendingId, codeRun: record.codeRun }));
      return await closePendingStamp(record, 'ALREADY_STAMPED');
    }
    if (record.stampType === 'ETD' && !trip.stampEta) {
      throw new Error('STAMP_ETA_REQUIRED_BEFORE_ETD');
    }
    if (record.stampType === 'ETA') {
      const etaWindow = getEtaWindowDecision(trip.planDate, trip.planEta, record.gpsTime);
      if (!etaWindow.allowed) {
        console.warn(JSON.stringify({
          logType: 'ELIVE_GPS_STAMP',
          event: 'PENDING_ETA_SUPERSEDED_BEFORE_WINDOW',
          pendingId,
          codeRun: record.codeRun,
          ...etaWindow,
        }));
        return await closePendingStamp(record, 'SUPERSEDED', {
          lastError: etaWindow.reason,
          etaWindow,
        });
      }
      const currentTrips = buildTripsForPlate(
        latestData,
        record.licensePlate,
        pendingDate
      );
      const currentCycle = await readVehicleCycleState(record.licensePlate);
      const currentSelection = selectTripForVehicle(
        currentTrips,
        getBangkokMinuteOfDay(new Date()),
        currentCycle
      );
      const selectedCodeRun = currentSelection.activeTrip?.codeRun || null;
      const selectedGeofenceId = currentSelection.activeTrip
        ? getGeofenceIdForDropPoint(currentSelection.activeTrip.dropPoint)
        : null;
      const pendingGeofenceId = GPS_GEOFENCES.find(
        geofence => geofence.name === record.geofence || geofence.id === record.geofence
      )?.id || null;
      const currentArrivalGroup = selectGpsEtaArrivalGroup(
        currentTrips,
        currentSelection.activeTrip,
        pendingGeofenceId
      );
      const pendingIsInCurrentArrivalGroup = currentArrivalGroup.some(
        arrivalTrip => arrivalTrip.codeRun === record.codeRun
      );
      if (
        !pendingIsInCurrentArrivalGroup ||
        !selectedGeofenceId ||
        selectedGeofenceId !== pendingGeofenceId
      ) {
        console.warn(JSON.stringify({
          logType: 'ELIVE_GPS_STAMP',
          event: 'PENDING_ETA_SUPERSEDED',
          pendingId,
          pendingCodeRun: record.codeRun,
          selectedCodeRun,
          pendingGeofenceId,
          selectedGeofenceId,
          currentArrivalGroupCodeRuns: currentArrivalGroup.map(arrivalTrip => arrivalTrip.codeRun),
        }));
        return await closePendingStamp(record, 'SUPERSEDED', {
          lastError: 'PENDING_ETA_IS_NOT_CURRENT_ACTIVE_TRIP',
          selectedCodeRun,
        });
      }
    }
    console.log(JSON.stringify({ logType: 'ELIVE_GPS_STAMP', event: 'STAMP_REQUEST_SENT', pendingId, codeRun: record.codeRun, stampType: record.stampType, attemptCount }));
    const response = await stampActualData(record.payload);
    const stampResult = response?.result || response;
    const status = stampResult?.written === false ? 'ALREADY_STAMPED' : 'STAMPED';
    console.log(JSON.stringify({ logType: 'ELIVE_GPS_STAMP', event: status === 'STAMPED' ? 'STAMP_CONFIRMED' : 'STAMP_ALREADY_EXISTS', pendingId, codeRun: record.codeRun }));
    return await closePendingStamp(record, status, { result: stampResult });
  } catch (error) {
    const existing = await readPendingStamp(pendingId);
    if (!existing) throw error;
    const terminalReason = getTerminalPendingStampErrorReason(error);
    if (terminalReason) {
      const lastError = getErrorMessage(error);
      console.warn(JSON.stringify({
        logType: 'ELIVE_GPS_STAMP',
        event: 'PENDING_STAMP_SUPERSEDED_TERMINAL_ERROR',
        pendingId,
        codeRun: existing.codeRun,
        stampType: existing.stampType,
        terminalReason,
        lastError,
      }));
      return await closePendingStamp(existing, 'SUPERSEDED', {
        lastError,
        retryReason: 'TERMINAL_VALIDATION_ERROR',
        terminalReason,
      });
    }
    const lockBusy = isAppsScriptLockBusyError(error);
    const delayMs = lockBusy ? calculateLockBusyRetryDelayMs(existing.attemptCount) : calculatePendingStampRetryDelayMs(existing.attemptCount);
    const nextRetryMs = Date.now() + delayMs;
    const retryRecord = { ...existing, status: 'RETRY_WAIT', lastError: getErrorMessage(error), retryReason: lockBusy ? 'APPS_SCRIPT_LOCK_BUSY' : 'TRANSIENT_ERROR', nextRetryAt: new Date(nextRetryMs).toISOString(), updatedAt: new Date().toISOString() };
    await writePendingStamp(retryRecord, nextRetryMs);
    if (lockBusy) {
      await requireRedisClient().set(GPS_PENDING_STAMP_LOCK_COOLDOWN_KEY, JSON.stringify({ pendingId, startedAt: new Date().toISOString() }), { EX: GPS_PENDING_STAMP_LOCK_COOLDOWN_SECONDS });
    }
    console.error(JSON.stringify({ logType: 'ELIVE_GPS_STAMP', event: lockBusy ? 'STAMP_LOCK_BUSY_COOLDOWN' : 'STAMP_RETRY_SCHEDULED', pendingId, attemptCount: retryRecord.attemptCount, lastError: retryRecord.lastError, nextRetryAt: retryRecord.nextRetryAt }));
    return retryRecord;
  } finally {
    await client.eval("if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end", { keys: [lockKey], arguments: [lockToken] }).catch(() => {});
  }
}
async function processDuePendingGpsStamps() {
  const client = requireRedisClient();
  if (await client.exists(GPS_PENDING_STAMP_LOCK_COOLDOWN_KEY)) {
    return { due: 0, processed: 0, stamped: 0, alreadyStamped: 0, blockedNoWork: 0, superseded: 0, retryWait: 0, skipped: true, reason: 'APPS_SCRIPT_LOCK_COOLDOWN' };
  }
  const candidateLimit = Math.max(GPS_PENDING_STAMP_BATCH_SIZE * 20, 20);
  const candidateIds = await client.zRangeByScore(
    GPS_PENDING_STAMP_SCHEDULE_KEY,
    0,
    Date.now(),
    { LIMIT: { offset: 0, count: candidateLimit } }
  );
  const records = (await Promise.all(candidateIds.map(readPendingStamp)))
    .filter(Boolean)
    .sort(comparePendingStampRecords);
  const selectedRecords = records.slice(0, GPS_PENDING_STAMP_BATCH_SIZE);
  const pendingIds = selectedRecords.map(record => record.pendingId);
  console.log(JSON.stringify({
    logType: 'ELIVE_GPS_STAMP',
    event: 'PENDING_QUEUE_SORTED',
    candidateCount: records.length,
    selectedPendingIds: pendingIds,
    order: 'GPS_TIME_THEN_CREATED_AT_THEN_CODE_RUN',
  }));
  const summary = { due: records.length, selected: pendingIds.length, processed: 0, stamped: 0, alreadyStamped: 0, blockedNoWork: 0, superseded: 0, retryWait: 0, stoppedOnLockBusy: false };
  for (let index = 0; index < pendingIds.length; index += 1) {
    if (gpsWorkerStopping) break;
    const result = await processPendingGpsStamp(pendingIds[index]);
    summary.processed += 1;
    if (result?.status === 'STAMPED') summary.stamped += 1;
    if (result?.status === 'ALREADY_STAMPED') summary.alreadyStamped += 1;
    if (result?.status === 'BLOCKED_NO_WORK') summary.blockedNoWork += 1;
    if (result?.status === 'SUPERSEDED') summary.superseded += 1;
    if (result?.status === 'RETRY_WAIT') summary.retryWait += 1;
    if (result?.retryReason === 'APPS_SCRIPT_LOCK_BUSY') { summary.stoppedOnLockBusy = true; break; }
    if (index < pendingIds.length - 1) await wait(GPS_PENDING_STAMP_SPACING_MS);
  }
  return summary;
}

async function executeGpsAutoStampEta(state) {
  if (state?.noWorkAction) return { status: 'BLOCKED_NO_WORK', reason: 'NO_WORK_ACTION' };
  if (!GPS_AUTO_STAMP_ETA_ENABLED || !state?.readyForGpsStampEta || !state?.isInside) return null;
  if (state.waitingForExit || !state.activeCodeRun || state.activeCodeRun !== state.codeRun) return null;
  const pending = await createPendingGpsStamp('ETA', state);
  return { ...pending, queued: true };
}
async function executeGpsAutoStampEtaBatch(state, trips) {
  if (!GPS_AUTO_STAMP_ETA_ENABLED || !state?.isInside || state.waitingForExit) {
    return [];
  }
  const results = [];
  for (const trip of trips) {
    const tripState = {
      ...state,
      codeRun: trip.codeRun,
      activeCodeRun: trip.codeRun,
      activePlanDate: trip.planDate,
      activePlanEta: trip.planEta,
      activeTripSequence: trip.tripSequence,
      planLicensePlate: trip.planLicensePlate,
      noWorkAction: trip.noWorkAction === true,
      readyForGpsStampEta: true,
    };
    const result = await executeGpsAutoStampEta(tripState);
    results.push({
      codeRun: trip.codeRun,
      dropPoint: trip.dropPoint,
      geofenceId: state.geofenceId,
      result,
    });
  }
  return results;
}
async function executeGpsAutoStampEtd(state, activeTrip) {
  if (state?.noWorkAction || activeTrip?.noWorkAction) return { status: 'BLOCKED_NO_WORK', reason: 'NO_WORK_ACTION' };
  if (!GPS_AUTO_STAMP_ETD_ENABLED || !state?.readyForGpsStampEtd) return null;
  if (!activeTrip?.stampEta || activeTrip?.stampEtd) return null;
  if (!state.wasInsideBeforeExit || state.isInside || state.status !== 'OUTSIDE_GEOFENCE') return null;
  if (!state.activeCodeRun || state.activeCodeRun !== state.codeRun) return null;
  const pending = await createPendingGpsStamp('ETD', state);
  return { ...pending, queued: true };
}
async function evaluateGpsDock(payload, dataOverride = null) {
  const input = validateGpsDockPayload(payload);
  const nowMs = Date.now();
  const gpsTimeMs = input.gpsTime.getTime();
  const receivedAtMs = input.receivedAt.getTime();
  const eventTimeMs = Math.min(receivedAtMs, nowMs);
  const gpsAgeMs = Math.max(0, nowMs - gpsTimeMs);
  const nearest = findNearestGpsGeofence(input.latitude, input.longitude);
  const isInside = nearest.distanceMeters <= nearest.radiusMeters;
  const isParked = input.speedKmh === GPS_PARKING_SPEED_THRESHOLD_KMH;
  const tripResolution = await resolveVehicleTrip(input, isInside, dataOverride);
  const vehicleCycle = tripResolution.state;
  const activeTrip = tripResolution.activeTrip;
  const eligibleEtaTrips = selectGpsEtaArrivalGroup(
    tripResolution.trips,
    activeTrip,
    nearest.id
  ).filter(trip =>
    trip.planEtaMinutes === null ||
    tripResolution.nowMinutes >=
      trip.planEtaMinutes - GPS_NEXT_TRIP_EARLY_WINDOW_MINUTES
  );
  const effectiveCodeRun = activeTrip?.codeRun || input.codeRun;
  const platesMatch = activeTrip
    ? normalizeLicensePlate(input.licensePlate) === normalizeLicensePlate(activeTrip.planLicensePlate)
    : normalizeLicensePlate(input.licensePlate) === normalizeLicensePlate(input.planLicensePlate);
  const previous = await readGpsDwellState(effectiveCodeRun);
  const wasInsideBeforeExit = previous?.isInside === true || previous?.hasBeenInside === true;
  const hasBeenInside = isInside || wasInsideBeforeExit;
  const lastInsideGeofenceName = isInside ? nearest.name : previous?.lastInsideGeofenceName || previous?.geofenceName || null;
  let parkingStartedAtMs = Number(previous?.parkingStartedAtMs || 0);
  let movingStartedAtMs = Number(previous?.movingStartedAtMs || 0);
  let status = 'OUTSIDE_GEOFENCE';

  if (vehicleCycle.waitingForExit) {
    status = 'WAITING_FOR_EXIT_AFTER_ETD';
    parkingStartedAtMs = 0;
    movingStartedAtMs = 0;
  } else if (!activeTrip) {
    status = vehicleCycle.selectionReason === 'WAITING_FOR_PLAN_WINDOW'
      ? 'WAITING_FOR_PLAN_WINDOW'
      : 'NO_ACTIVE_TRIP';
    parkingStartedAtMs = 0;
    movingStartedAtMs = 0;
  } else if (!platesMatch) {
    status = 'GPS_PLATE_MISMATCH';
    parkingStartedAtMs = 0;
    movingStartedAtMs = 0;
  } else if (gpsAgeMs > GPS_STALE_THRESHOLD_MS) {
    status = 'GPS_STALE';
  } else if (!isInside) {
    status = 'OUTSIDE_GEOFENCE';
    parkingStartedAtMs = 0;
    movingStartedAtMs = 0;
  } else {
    status = 'DOCK_IN_CONFIRMED';
    movingStartedAtMs = 0;
    if (!parkingStartedAtMs || previous?.geofenceId !== nearest.id || previous?.codeRun !== effectiveCodeRun) {
      parkingStartedAtMs = eventTimeMs;
    }
  }

  const dwellSeconds = parkingStartedAtMs && isInside && isParked && !vehicleCycle.waitingForExit && activeTrip
    ? Math.max(0, Math.floor((eventTimeMs - parkingStartedAtMs) / 1000))
    : 0;
  const state = {
    codeRun: effectiveCodeRun,
    requestedCodeRun: input.codeRun,
    activeCodeRun: vehicleCycle.activeCodeRun,
    nextCodeRun: vehicleCycle.nextCodeRun,
    lastCompletedCodeRun: vehicleCycle.lastCompletedCodeRun,
    waitingForExit: vehicleCycle.waitingForExit,
    exitConfirmedAt: vehicleCycle.exitConfirmedAt,
    tripSelectionReason: vehicleCycle.selectionReason,
    tripCountForVehicleToday: vehicleCycle.tripCount,
    activePlanDate: vehicleCycle.activePlanDate,
    activePlanEta: vehicleCycle.activePlanEta,
    activeTripSequence: vehicleCycle.activeTripSequence,
    planEtaDifferenceMinutes: vehicleCycle.planEtaDifferenceMinutes,
    gpsMinuteOfDay: vehicleCycle.gpsMinuteOfDay,
    nextPlanEta: vehicleCycle.nextPlanEta,
    tripOrdering: vehicleCycle.tripOrdering,
    noWorkAction: activeTrip?.noWorkAction === true,
    eligibleEtaCodeRuns: eligibleEtaTrips.map(trip => trip.codeRun),
    eligibleEtaTripCount: eligibleEtaTrips.length,
    gpsId: input.gpsId,
    latitude: input.latitude,
    longitude: input.longitude,
    licensePlate: input.licensePlate,
    planLicensePlate: activeTrip?.planLicensePlate || input.planLicensePlate,
    geofenceId: nearest.id,
    geofenceName: nearest.name,
    geofenceLatitude: nearest.latitude,
    geofenceLongitude: nearest.longitude,
    radiusMeters: nearest.radiusMeters,
    distanceMeters: Number(nearest.distanceMeters.toFixed(2)),
    isInside,
    wasInsideBeforeExit,
    hasBeenInside,
    lastInsideGeofenceName,
    isParked,
    speedKmh: input.speedKmh,
    gpsStatus: input.gpsStatus,
    gpsTime: input.gpsTime.toISOString(),
    receivedAt: input.receivedAt.toISOString(),
    evaluatedAt: new Date(nowMs).toISOString(),
    gpsAgeSeconds: Math.floor(gpsAgeMs / 1000),
    status,
    parkingStartedAtMs,
    parkingStartedAt: parkingStartedAtMs ? new Date(parkingStartedAtMs).toISOString() : null,
    movingStartedAtMs,
    dwellSeconds,
    confirmedAt: status === 'DOCK_IN_CONFIRMED'
      ? previous?.confirmedAt || new Date(eventTimeMs).toISOString()
      : null,
    readyForGpsStampEta: isInside && gpsAgeMs <= GPS_STALE_THRESHOLD_MS && !vehicleCycle.waitingForExit && eligibleEtaTrips.length > 0,
    readyForGpsStampEtd: GPS_AUTO_STAMP_ETD_ENABLED && status === 'OUTSIDE_GEOFENCE' && wasInsideBeforeExit && Boolean(activeTrip?.stampEta) && !activeTrip?.noWorkAction && !activeTrip?.stampEtd,
    autoStampExecuted: false,
    autoStampEtaResult: null,
    autoStampEtaResults: [],
    autoStampEtdResult: null,
  };
  await writeGpsDwellState(effectiveCodeRun, state);
  if (state.readyForGpsStampEta) {
    state.autoStampEtaResults = await executeGpsAutoStampEtaBatch(state, eligibleEtaTrips);
    const etaResults = state.autoStampEtaResults
      .map(item => item.result)
      .filter(Boolean);
    state.autoStampEtaResult = etaResults.find(item => item.status === 'STAMPED')
      || etaResults.find(item => item.status === 'ALREADY_STAMPED')
      || etaResults[0]
      || null;
  }
  if (state.readyForGpsStampEtd) state.autoStampEtdResult = await executeGpsAutoStampEtd(state, activeTrip);
  state.autoStampResult = state.autoStampEtdResult || state.autoStampEtaResult;
  state.autoStampExecuted = state.autoStampEtaResults.some(item =>
    ['STAMPED', 'ALREADY_STAMPED'].includes(item.result?.status)
  ) || ['STAMPED', 'ALREADY_STAMPED'].includes(state.autoStampEtdResult?.status);
  await writeGpsDwellState(effectiveCodeRun, state);
  return createGpsDockResult(state);
}
function normalizeGpsHeader(value) {
  return cleanText(value).toLowerCase().replace(/\s/g, '');
}
function findGpsHeaderIndex(headers, names) {
  return headers.findIndex(header => names.some(name => header.includes(normalizeGpsHeader(name))));
}
function parseGpsNumber(value) {
  return Number(cleanText(value).replace(/\s/g, '').replace(',', '.'));
}
function buildBackgroundGpsInputs(data) {
  const planRows = Array.isArray(data?.plan) ? data.plan : [];
  const gpsRows = Array.isArray(data?.gps) ? data.gps : [];
  if (gpsRows.length <= 1 || planRows.length <= 1) return [];
  const today = getBangkokDateText(new Date());
  const seedTrips = [];
  for (const row of planRows.slice(1)) {
    if (!Array.isArray(row)) continue;
    const codeRun = cleanText(row[0]).toUpperCase();
    const planDate = parseSheetDateText(row[1]);
    const plate = cleanText(row[4]);
    const remark = cleanText(row[12]).toUpperCase();
    if (!/^A\d+$/.test(codeRun) || !plate || remark === 'CANCEL' || planDate !== today) continue;
    seedTrips.push({
      codeRun,
      planDate,
      planEta: cleanText(row[10]),
      planEtaMinutes: parsePlanMinutes(row[10]),
      planLicensePlate: plate,
      normalizedPlate: normalizeLicensePlate(plate),
    });
  }
  seedTrips.sort(compareTripsByPlanTime);
  const seedTripByPlate = new Map();
  for (const trip of seedTrips) {
    if (!seedTripByPlate.has(trip.normalizedPlate)) {
      seedTripByPlate.set(trip.normalizedPlate, trip);
    }
  }
  const headers = gpsRows[0].map(normalizeGpsHeader);
  const gpsIdIndex = findGpsHeaderIndex(headers, ['GPS ID', 'GPSID', 'รหัส GPS']);
  const plateIndex = findGpsHeaderIndex(headers, ['ทะเบียนรถ', 'License Plate', 'Truck Name', 'Plate']);
  const latIndex = findGpsHeaderIndex(headers, ['ละติจูด', 'Latitude', 'Lat']);
  const lngIndex = findGpsHeaderIndex(headers, ['ลองจิจูด', 'Longitude', 'Lng', 'Lon']);
  const speedIndex = findGpsHeaderIndex(headers, ['ความเร็ว', 'Speed']);
  const statusIndex = findGpsHeaderIndex(headers, ['สถานะ', 'Status']);
  const gpsTimeIndex = findGpsHeaderIndex(headers, ['เวลา GPS', 'GPS Time', 'GPS Datetime']);
  const receivedIndex = findGpsHeaderIndex(headers, ['เวลาที่ระบบดึงข้อมูล', 'เวลารับข้อมูล', 'Received At', 'Update Time']);
  if (plateIndex < 0 || latIndex < 0 || lngIndex < 0 || gpsTimeIndex < 0 || receivedIndex < 0) {
    throw new Error('GPS_WORKER_REQUIRED_COLUMNS_MISSING');
  }
  const latestByPlate = new Map();
  for (const row of gpsRows.slice(1)) {
    if (!Array.isArray(row)) continue;
    const licensePlate = cleanText(row[plateIndex]);
    const normalizedPlate = normalizeLicensePlate(licensePlate);
    const seedTrip = seedTripByPlate.get(normalizedPlate);
    if (!seedTrip) continue;
    const latitude = parseGpsNumber(row[latIndex]);
    const longitude = parseGpsNumber(row[lngIndex]);
    const speed = speedIndex >= 0 ? parseGpsNumber(row[speedIndex]) : 0;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(speed)) continue;
    const gpsTimeText = cleanText(row[gpsTimeIndex]);
    const receivedAtText = cleanText(row[receivedIndex]);
    try {
      const gpsTime = parseBangkokDateTime(gpsTimeText, 'gpsTime');
      const receivedAt = parseBangkokDateTime(receivedAtText, 'receivedAt');
      const candidate = {
        codeRun: seedTrip.codeRun,
        gpsId: gpsIdIndex >= 0 ? cleanText(row[gpsIdIndex]) || normalizedPlate : normalizedPlate,
        licensePlate,
        planLicensePlate: seedTrip.planLicensePlate,
        latitude,
        longitude,
        speed,
        gpsStatus: statusIndex >= 0 ? cleanText(row[statusIndex]) : '',
        gpsTime: gpsTime.toISOString(),
        receivedAt: receivedAt.toISOString(),
        sortTime: Math.max(gpsTime.getTime(), receivedAt.getTime()),
      };
      const previous = latestByPlate.get(normalizedPlate);
      if (!previous || candidate.sortTime > previous.sortTime) latestByPlate.set(normalizedPlate, candidate);
    } catch {
      continue;
    }
  }
  return [...latestByPlate.values()].map(({ sortTime, ...input }) => input);
}
async function releaseGpsWorkerLock(client, token) {
  await client.eval(
    "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end",
    { keys: [GPS_WORKER_LOCK_KEY], arguments: [token] }
  );
}
async function writeGpsWorkerStatus(status) {
  const client = requireRedisClient();
  await client.set(GPS_WORKER_STATUS_KEY, JSON.stringify(status), { EX: GPS_WORKER_STATUS_TTL_SECONDS });
}
async function runGpsBackgroundCycle() {
  if (!GPS_BACKGROUND_WORKER_ENABLED || gpsWorkerCycleRunning || gpsWorkerStopping) return null;
  gpsWorkerCycleRunning = true;
  const client = requireRedisClient();
  const lockToken = randomUUID();
  const lockAcquired = await client.set(GPS_WORKER_LOCK_KEY, lockToken, { NX: true, EX: GPS_WORKER_LOCK_SECONDS });
  if (!lockAcquired) {
    gpsWorkerCycleRunning = false;
    return { skipped: true, reason: 'LEADER_LOCK_NOT_ACQUIRED' };
  }
  const startedAt = Date.now();
  const summary = { processed: 0, confirmed: 0, etaStamped: 0, etdStamped: 0, stamped: 0, alreadyStamped: 0, failed: 0, failures: [] };
  try {
    if (await client.exists(APPS_SCRIPT_MUTATION_LOCK_KEY)) {
      const status = {
        enabled: true,
        running: true,
        skipped: true,
        reason: 'APPS_SCRIPT_MUTATION_IN_PROGRESS',
        lastCycleStartedAt: new Date(startedAt).toISOString(),
        lastCycleCompletedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        ...summary,
      };
      await writeGpsWorkerStatus(status);
      console.log(JSON.stringify({ logType: 'ELIVE_GPS_WORKER', ...status }));
      return status;
    }
    const realtimeSynchronization = await synchronizeGpsWorkerRealtime();
    const pendingRetrySummary = await processDuePendingGpsStamps();
    summary.pendingRetry = pendingRetrySummary;
    const workerDate = getBangkokDateText(new Date());
    const workerDataResult = await getGpsWorkerCycleData(workerDate);
    workerDataResult.realtimeSource = realtimeSynchronization.source;
    workerDataResult.realtimeFallbackUsed = realtimeSynchronization.fallbackUsed;
    workerDataResult.realtimeFallbackAgeMs = realtimeSynchronization.fallbackAgeMs;
    workerDataResult.realtimeSynchronized = realtimeSynchronization.synchronized;
    summary.dailyPlanSource = workerDataResult.planSource;
    summary.realtimeSource = workerDataResult.realtimeSource;
    summary.realtimeFallbackUsed = workerDataResult.realtimeFallbackUsed;
    summary.realtimeFallbackAgeMs = workerDataResult.realtimeFallbackAgeMs;
    summary.realtimeSynchronized = workerDataResult.realtimeSynchronized;
    const inputs = buildBackgroundGpsInputs(workerDataResult.data);
    for (const input of inputs) {
      if (gpsWorkerStopping) break;
      try {
        const result = await evaluateGpsDock(input, workerDataResult.data);
        summary.processed += 1;
        if (result.status === 'DOCK_IN_CONFIRMED') summary.confirmed += 1;
        const etaBatchResults = Array.isArray(result.autoStampEtaResults)
          ? result.autoStampEtaResults.map(item => item.result).filter(Boolean)
          : result.autoStampEtaResult ? [result.autoStampEtaResult] : [];
        const etaStampedCount = etaBatchResults.filter(item => item.status === 'STAMPED').length;
        const etaAlreadyStampedCount = etaBatchResults.filter(item => item.status === 'ALREADY_STAMPED').length;
        summary.etaStamped += etaStampedCount;
        if (result.autoStampEtdResult?.status === 'STAMPED') summary.etdStamped += 1;
        summary.stamped += etaStampedCount + (result.autoStampEtdResult?.status === 'STAMPED' ? 1 : 0);
        summary.alreadyStamped += etaAlreadyStampedCount + (result.autoStampEtdResult?.status === 'ALREADY_STAMPED' ? 1 : 0);
      } catch (error) {
        summary.failed += 1;
        summary.failures.push({ gpsIdHash: hashAuditValue(input.gpsId), error: getErrorMessage(error) });
      }
    }
    const status = {
      enabled: true,
      running: true,
      lastCycleStartedAt: new Date(startedAt).toISOString(),
      lastCycleCompletedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      ...summary,
    };
    await writeGpsWorkerStatus(status);
    console.log(JSON.stringify({ logType: 'ELIVE_GPS_WORKER', ...status }));
    return status;
  } catch (error) {
    const status = {
      enabled: true,
      running: true,
      lastCycleStartedAt: new Date(startedAt).toISOString(),
      lastCycleCompletedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      error: getErrorMessage(error),
      ...summary,
    };
    await writeGpsWorkerStatus(status).catch(() => {});
    console.error('GPS Background Worker cycle failed:', status);
    return status;
  } finally {
    await releaseGpsWorkerLock(client, lockToken).catch(error => {
      console.error('Unable to release GPS Worker lock:', getErrorMessage(error));
    });
    gpsWorkerCycleRunning = false;
  }
}
function scheduleNextGpsWorkerCycle(delayMs) {
  if (gpsWorkerStopping || !GPS_BACKGROUND_WORKER_ENABLED) return;
  gpsWorkerTimer = setTimeout(async () => {
    await runGpsBackgroundCycle();
    scheduleNextGpsWorkerCycle(GPS_BACKGROUND_WORKER_INTERVAL_MS);
  }, delayMs);
}
function startGpsBackgroundWorker() {
  if (!GPS_BACKGROUND_WORKER_ENABLED) {
    console.log('GPS Background Worker is disabled.');
    return;
  }
  console.log(`GPS Background Worker enabled, interval ${GPS_BACKGROUND_WORKER_INTERVAL_MS} ms.`);
  scheduleNextGpsWorkerCycle(2000);
}
async function stopGpsBackgroundWorker() {
  gpsWorkerStopping = true;
  if (gpsWorkerTimer) clearTimeout(gpsWorkerTimer);
  const deadline = Date.now() + 15000;
  while (gpsWorkerCycleRunning && Date.now() < deadline) await wait(250);
}
function waitForLoginFailure() { return wait(LOGIN_FAILURE_DELAY_MS + Math.floor(Math.random() * 250)); }
function normalizeLoginUsername(value) { const username=cleanText(value).toLowerCase(); if(!username||username.length>MAX_LOGIN_USERNAME_LENGTH) throw new Error('LOGIN_PAYLOAD_INVALID'); return username; }
function normalizeLoginPassword(value) { if(typeof value!=='string'||!value||value.length>MAX_LOGIN_PASSWORD_LENGTH) throw new Error('LOGIN_PAYLOAD_INVALID'); return value; }
function getAuthUserOverrideKey(username) {
  const normalizedUsername = cleanText(username).toLowerCase();
  return `${AUTH_USER_OVERRIDE_KEY_PREFIX}${createHash('sha256').update(normalizedUsername).digest('hex')}`;
}
async function readAuthUserOverride(username) {
  const raw = await requireRedisClient().get(getAuthUserOverrideKey(username));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    await requireRedisClient().del(getAuthUserOverrideKey(username));
    return null;
  }
}
async function getEffectiveAuthUser(username) {
  const normalizedUsername = cleanText(username).toLowerCase();
  const configuredUser = getConfiguredAuthUsers().find(item => item.username === normalizedUsername);
  if (!configuredUser) return null;
  const override = await readAuthUserOverride(normalizedUsername);
  if (!override) return { ...configuredUser, credentialVersion: 0, passwordChangedAt: null };
  return {
    ...configuredUser,
    passwordHash: cleanText(override.passwordHash).toLowerCase(),
    salt: cleanText(override.salt).toLowerCase(),
    iterations: Number(override.iterations),
    credentialVersion: Number(override.credentialVersion || 0),
    passwordChangedAt: override.passwordChangedAt || null,
  };
}
async function writeAuthUserOverride(user, passwordHash, salt) {
  const now = new Date().toISOString();
  const previous = await readAuthUserOverride(user.username);
  const record = {
    username: user.username,
    passwordHash,
    salt,
    iterations: PASSWORD_HASH_ITERATIONS,
    credentialVersion: Number(previous?.credentialVersion || user.credentialVersion || 0) + 1,
    passwordChangedAt: now,
    updatedAt: now,
  };
  await requireRedisClient().set(getAuthUserOverrideKey(user.username), JSON.stringify(record));
  return record;
}
function validateNewPassword(username, currentPassword, newPassword, confirmNewPassword) {
  if (typeof currentPassword !== 'string' || !currentPassword) throw new Error('CURRENT_PASSWORD_REQUIRED');
  if (typeof newPassword !== 'string' || typeof confirmNewPassword !== 'string') throw new Error('NEW_PASSWORD_REQUIRED');
  if (newPassword !== confirmNewPassword) throw new Error('PASSWORD_CONFIRMATION_MISMATCH');
  if (newPassword.length < PASSWORD_MIN_LENGTH || newPassword.length > PASSWORD_MAX_LENGTH) throw new Error('PASSWORD_POLICY_INVALID');
  if (newPassword === currentPassword) throw new Error('PASSWORD_UNCHANGED');
  if (newPassword.toLowerCase().includes(cleanText(username).toLowerCase())) throw new Error('PASSWORD_CONTAINS_USERNAME');
  return newPassword;
}
async function hashNewPassword(password) {
  const salt = randomBytes(32).toString('hex');
  const hash = await pbkdf2Async(password, Buffer.from(salt, 'hex'), PASSWORD_HASH_ITERATIONS, PBKDF2_KEY_LENGTH, PBKDF2_DIGEST);
  return { salt, passwordHash: hash.toString('hex') };
}
function getPasswordChangeRateLimitKey(req, username) {
  return `${PASSWORD_CHANGE_RATE_LIMIT_KEY_PREFIX}${getRateLimitKey(req, username)}`;
}
async function enforcePasswordChangeRateLimit(req, username) {
  const client = requireRedisClient();
  const key = getPasswordChangeRateLimitKey(req, username);
  const state = await getRateLimitState(client, key, PASSWORD_CHANGE_RATE_LIMIT_MAX_FAILURES);
  if (state.blocked) {
    const error = new Error('PASSWORD_CHANGE_RATE_LIMITED');
    error.retryAfterSeconds = state.retryAfterSeconds;
    throw error;
  }
  return key;
}
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
function getSessionUserIndexKey(username) {
  return `${SESSION_USER_INDEX_PREFIX}${createHash('sha256')
    .update(cleanText(username).toLowerCase())
    .digest('hex')}`;
}

function getConcurrentSessionLimit(role) {
  return SESSION_LIMITS_BY_ROLE[cleanText(role).toUpperCase()] || 1;
}

function writeConcurrentSessionRevocationAudit(user, revokedCount) {
  if (!revokedCount) return;
  writeAuditLog({
    requestId: randomUUID(),
    timestamp: new Date().toISOString(),
    actorUsername: user.username,
    actorRole: user.role,
    method: 'SYSTEM',
    path: '/api/auth/login',
    action: 'SESSION_REVOKED',
    targetType: 'SESSION',
    targetIdHash: hashAuditValue(user.username),
    reason: 'CONCURRENT_SESSION_LIMIT',
    revokedCount,
    result: 'SUCCESS',
    statusCode: 200,
    durationMs: 0,
    ipHash: null,
    userAgentHash: null,
  });
}

async function enforceConcurrentSessionLimit(client, user) {
  const indexKey = getSessionUserIndexKey(user.username);
  const maximumSessions = getConcurrentSessionLimit(user.role);
  const indexedTokenHashes = await client.zRange(indexKey, 0, -1);
  const validSessions = [];

  for (const tokenHash of indexedTokenHashes) {
    const rawSession = await client.get(getSessionKey(tokenHash));
    if (!rawSession) {
      await client.zRem(indexKey, tokenHash);
      continue;
    }

    let session;
    try {
      session = JSON.parse(rawSession);
    } catch {
      await client.del(getSessionKey(tokenHash));
      await client.zRem(indexKey, tokenHash);
      continue;
    }

    if (Number(session.expiresAt || 0) <= Date.now()) {
      await client.del(getSessionKey(tokenHash));
      await client.zRem(indexKey, tokenHash);
      continue;
    }

    validSessions.push({
      tokenHash,
      createdAt: Number(session.createdAt || 0),
    });
  }

  validSessions.sort((first, second) => first.createdAt - second.createdAt);
  const sessionsToRevoke = validSessions.slice(
    0,
    Math.max(0, validSessions.length - maximumSessions)
  );

  if (sessionsToRevoke.length) {
    const transaction = client.multi();
    for (const session of sessionsToRevoke) {
      transaction.del(getSessionKey(session.tokenHash));
      transaction.zRem(indexKey, session.tokenHash);
    }
    await transaction.exec();
  }

  return sessionsToRevoke.length;
}

async function createSession(user) {
  const client = requireRedisClient();
  const token = randomBytes(48).toString('base64url');
  const tokenHash = hashSessionToken(token);
  const now = Date.now();
  const session = {
    username: user.username,
    role: user.role,
    createdAt: now,
    expiresAt: now + SESSION_DURATION_MS,
    lastUserActivityAt: now,
    credentialVersion: Number(user.credentialVersion || 0),
  };
  const indexKey = getSessionUserIndexKey(user.username);

  await client
    .multi()
    .set(getSessionKey(tokenHash), JSON.stringify(session), {
      EX: SESSION_TTL_SECONDS,
    })
    .zAdd(indexKey, [{ score: now, value: tokenHash }])
    .expire(indexKey, SESSION_TTL_SECONDS)
    .exec();

  const revokedCount = await enforceConcurrentSessionLimit(client, user);
  writeConcurrentSessionRevocationAudit(user, revokedCount);

  return { token, session };
}

async function getIndexedUserSessions(client, username) {
  const indexKey = getSessionUserIndexKey(username);
  const tokenHashes = await client.zRange(indexKey, 0, -1);
  const sessions = [];

  for (const tokenHash of tokenHashes) {
    const rawSession = await client.get(getSessionKey(tokenHash));
    if (!rawSession) {
      await client.zRem(indexKey, tokenHash);
      continue;
    }

    let session;
    try {
      session = JSON.parse(rawSession);
    } catch {
      await client.del(getSessionKey(tokenHash));
      await client.zRem(indexKey, tokenHash);
      continue;
    }

    sessions.push({ tokenHash, session });
  }

  return { indexKey, sessions };
}

async function listActiveSessions() {
  const client = requireRedisClient();
  const configuredUsers = getConfiguredAuthUsers();
  const users = [];
  let activeSessionCount = 0;

  for (const user of configuredUsers) {
    const { sessions } = await getIndexedUserSessions(client, user.username);
    const activeSessions = sessions
      .map(item => ({
        createdAt: Number(item.session?.createdAt || 0),
        expiresAt: Number(item.session?.expiresAt || 0),
      }))
      .filter(item => item.expiresAt > Date.now())
      .sort((first, second) => first.createdAt - second.createdAt);

    if (!activeSessions.length) continue;
    activeSessionCount += activeSessions.length;
    users.push({
      username: user.username,
      role: user.role,
      accountActive: user.active,
      activeSessionCount: activeSessions.length,
      oldestSessionCreatedAt: new Date(
        activeSessions[0].createdAt
      ).toISOString(),
      newestSessionCreatedAt: new Date(
        activeSessions[activeSessions.length - 1].createdAt
      ).toISOString(),
      nearestExpiryAt: new Date(
        Math.min(...activeSessions.map(item => item.expiresAt))
      ).toISOString(),
    });
  }

  users.sort((first, second) => first.username.localeCompare(second.username));
  return {
    activeUserCount: users.length,
    activeSessionCount,
    users,
  };
}

async function revokeUserSessions(username, excludedTokenHash = null) {
  const client = requireRedisClient();
  const normalizedUsername = normalizeLoginUsername(username);
  const { indexKey, sessions } = await getIndexedUserSessions(
    client,
    normalizedUsername
  );
  const sessionsToRevoke = sessions.filter(
    item => item.tokenHash !== excludedTokenHash
  );

  if (!sessionsToRevoke.length) {
    return { username: normalizedUsername, revokedCount: 0 };
  }

  const transaction = client.multi();
  for (const item of sessionsToRevoke) {
    transaction.del(getSessionKey(item.tokenHash));
    transaction.zRem(indexKey, item.tokenHash);
  }
  await transaction.exec();

  return {
    username: normalizedUsername,
    revokedCount: sessionsToRevoke.length,
  };
}

async function revokeAllSessions(excludedTokenHash = null) {
  const client = requireRedisClient();
  let cursor = '0';
  let revokedCount = 0;

  do {
    const result = await client.scan(cursor, {
      MATCH: `${SESSION_USER_INDEX_PREFIX}*`,
      COUNT: 100,
    });
    cursor = String(result.cursor);

    for (const indexKey of result.keys) {
      const tokenHashes = await client.zRange(indexKey, 0, -1);
      const transaction = client.multi();
      let operationCount = 0;

      for (const tokenHash of tokenHashes) {
        if (tokenHash === excludedTokenHash) continue;
        transaction.del(getSessionKey(tokenHash));
        transaction.zRem(indexKey, tokenHash);
        revokedCount += 1;
        operationCount += 2;
      }

      if (operationCount > 0) await transaction.exec();
    }
  } while (cursor !== '0');

  return { revokedCount };
}

async function getCurrentSessionUser(session) {
  const username = cleanText(session?.username).toLowerCase();
  const sessionRole = cleanText(session?.role).toUpperCase();
  const user = await getEffectiveAuthUser(username);
  if (!user || !user.active) {
    return { valid: false, reason: 'ACCOUNT_INACTIVE_OR_REMOVED', user: null };
  }
  if (user.role !== sessionRole) {
    return { valid: false, reason: 'ACCOUNT_ROLE_CHANGED', user };
  }
  if (Number(session?.credentialVersion || 0) !== Number(user.credentialVersion || 0)) {
    return { valid: false, reason: 'CREDENTIAL_VERSION_CHANGED', user };
  }
  return { valid: true, reason: null, user };
}
async function getSessionFromRequest(req) {
  const token=parseCookies(req.headers.cookie)[SESSION_COOKIE_NAME]; if(!token) return null;
  const client=requireRedisClient(); const tokenHash=hashSessionToken(token); const raw=await client.get(getSessionKey(tokenHash)); if(!raw) return null;
  let session; try { session=JSON.parse(raw); } catch { await client.del(getSessionKey(tokenHash)); return null; }
  if(!session?.username||!session?.role||!Number.isFinite(Number(session.expiresAt))||Number(session.expiresAt)<=Date.now()){ await client.del(getSessionKey(tokenHash)); return null; }

  const normalizedSession = {
    ...session,
    username: cleanText(session.username).toLowerCase(),
    role: cleanText(session.role).toUpperCase(),
    createdAt: Number(session.createdAt || 0),
    expiresAt: Number(session.expiresAt),
    lastUserActivityAt: Number(session.lastUserActivityAt || session.createdAt || 0),
    credentialVersion: Number(session.credentialVersion || 0),
    lastReauthenticatedAt: Number(session.lastReauthenticatedAt || 0),
    passwordChangedAt: session.passwordChangedAt || null,
  };
  const idleDurationMs = Date.now() - normalizedSession.lastUserActivityAt;
  if (idleDurationMs >= SESSION_IDLE_TIMEOUT_MS) {
    await client
      .multi()
      .del(getSessionKey(tokenHash))
      .zRem(getSessionUserIndexKey(normalizedSession.username), tokenHash)
      .exec();
    return {
      tokenHash,
      session: normalizedSession,
      invalidReason: 'IDLE_TIMEOUT',
    };
  }

  const accountValidation = await getCurrentSessionUser(normalizedSession);

  if (!accountValidation.valid) {
    await client
      .multi()
      .del(getSessionKey(tokenHash))
      .zRem(getSessionUserIndexKey(normalizedSession.username), tokenHash)
      .exec();
    return {
      tokenHash,
      session: normalizedSession,
      invalidReason: accountValidation.reason,
    };
  }

  return { tokenHash, session: normalizedSession, invalidReason: null };
}
async function recordSessionUserActivity(tokenHash, session) {
  const client = requireRedisClient();
  const sessionKey = getSessionKey(tokenHash);
  const rawCurrentSession = await client.get(sessionKey);
  if (!rawCurrentSession) throw new Error('SESSION_NOT_FOUND');
  let currentSession;
  try {
    currentSession = JSON.parse(rawCurrentSession);
  } catch {
    await client.del(sessionKey);
    throw new Error('SESSION_INVALID');
  }
  const now = Date.now();
  const expiresAt = Number(currentSession.expiresAt || session.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    await client.del(sessionKey);
    throw new Error('SESSION_EXPIRED');
  }
  const updatedSession = {
    ...currentSession,
    ...session,
    credentialVersion: Number(currentSession.credentialVersion ?? session.credentialVersion ?? 0),
    lastReauthenticatedAt: Number(currentSession.lastReauthenticatedAt ?? session.lastReauthenticatedAt ?? 0),
    passwordChangedAt: currentSession.passwordChangedAt ?? session.passwordChangedAt ?? null,
    lastUserActivityAt: now,
    expiresAt,
  };
  const remainingTtlSeconds = Math.max(1, Math.ceil((expiresAt - now) / 1000));
  await client.set(sessionKey, JSON.stringify(updatedSession), { EX: remainingTtlSeconds });
  return updatedSession;
}

function setSessionCookie(res,token){ res.cookie(SESSION_COOKIE_NAME,token,{httpOnly:true,secure:true,sameSite:'none',path:'/',maxAge:SESSION_DURATION_MS}); }
function clearSessionCookie(res){ res.clearCookie(SESSION_COOKIE_NAME,{httpOnly:true,secure:true,sameSite:'none',path:'/'}); }
function createSessionResponse(session){ return {username:session.username,role:session.role,expiresAt:new Date(session.expiresAt).toISOString()}; }
async function deleteSession(tokenHash, session = null) {
  const client = requireRedisClient();
  const transaction = client.multi().del(getSessionKey(tokenHash));
  if (session?.username) {
    transaction.zRem(getSessionUserIndexKey(session.username), tokenHash);
  }
  await transaction.exec();
}
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
          : record?.invalidReason === 'IDLE_TIMEOUT'
            ? 'Session expired due to inactivity. Please sign in again.'
            : 'Authentication required.'
      });
    }
    req.auth={...record.session,username:record.session.username,role:record.session.role,createdAt:record.session.createdAt,expiresAt:record.session.expiresAt,lastUserActivityAt:record.session.lastUserActivityAt,credentialVersion:Number(record.session.credentialVersion || 0),lastReauthenticatedAt:Number(record.session.lastReauthenticatedAt || 0),passwordChangedAt:record.session.passwordChangedAt || null}; req.authSessionTokenHash=record.tokenHash; return next();
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

function isRetryableAppsScriptError(error) {
  const message = getErrorMessage(error).toLowerCase();
  return !NON_RETRYABLE_APPS_SCRIPT_ERROR_PATTERNS.some(pattern =>
    message.includes(pattern)
  );
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
async function releaseRedisLock(client, key, token) {
  await client.eval(
    "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end",
    { keys: [key], arguments: [token] }
  );
}
async function waitForAppsScriptMutationToFinish() {
  const client = requireRedisClient();
  const deadline = Date.now() + APPS_SCRIPT_MUTATION_WAIT_MS;
  while (await client.exists(APPS_SCRIPT_MUTATION_LOCK_KEY)) {
    if (Date.now() >= deadline) throw new Error('APPS_SCRIPT_MUTATION_WAIT_TIMEOUT');
    await wait(APPS_SCRIPT_MUTATION_POLL_MS);
  }
}
async function acquireAppsScriptMutationLock(action) {
  const client = requireRedisClient();
  const token = randomUUID();
  const deadline = Date.now() + APPS_SCRIPT_MUTATION_WAIT_MS;
  while (Date.now() < deadline) {
    const acquired = await client.set(
      APPS_SCRIPT_MUTATION_LOCK_KEY,
      JSON.stringify({ token, action, startedAt: new Date().toISOString() }),
      { NX: true, EX: APPS_SCRIPT_MUTATION_LOCK_SECONDS }
    );
    if (acquired) return { client, token, action };
    await wait(APPS_SCRIPT_MUTATION_POLL_MS);
  }
  throw new Error('APPS_SCRIPT_MUTATION_LOCK_TIMEOUT');
}
async function releaseAppsScriptMutationLock(lock) {
  if (!lock) return;
  const raw = await lock.client.get(APPS_SCRIPT_MUTATION_LOCK_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.token !== lock.token) return;
  } catch {
    return;
  }
  await releaseRedisLock(lock.client, APPS_SCRIPT_MUTATION_LOCK_KEY, raw);
}
async function waitForAppsScriptGetQueueToDrain() {
  const client = requireRedisClient();
  const deadline = Date.now() + APPS_SCRIPT_GET_WAIT_MS;
  while (await client.exists(APPS_SCRIPT_GET_LOCK_KEY)) {
    if (Date.now() >= deadline) {
      throw new Error('APPS_SCRIPT_GET_DRAIN_TIMEOUT');
    }
    await wait(APPS_SCRIPT_GET_POLL_MS);
  }
}
async function waitForExistingAppsScriptReads() {
  const pendingReads = [truckDataRequestPromise, masterPlanRequestPromise].filter(Boolean);
  if (!pendingReads.length) return;
  await Promise.allSettled(pendingReads);
}

function getAppsScriptGetCircuitKey(action) {
  return `${APPS_SCRIPT_GET_CIRCUIT_PREFIX}${cleanText(action)}`;
}
async function assertAppsScriptGetCircuitIsClosed(action) {
  const client = requireRedisClient();
  const key = getAppsScriptGetCircuitKey(action);
  const raw = await client.get(key);
  if (!raw) return;
  try {
    const state = JSON.parse(raw);
    const failureCount = Number(state.failureCount || 0);
    const retryAfterMs = Math.max(0, Number(state.openedUntilMs || 0) - Date.now());
    if (failureCount >= APPS_SCRIPT_GET_CIRCUIT_FAILURE_THRESHOLD && retryAfterMs > 0) {
      const error = new Error(`APPS_SCRIPT_GET_CIRCUIT_OPEN:${action}`);
      error.retryAfterMs = retryAfterMs;
      throw error;
    }
    if (retryAfterMs <= 0) await client.del(key);
  } catch (error) {
    if (getErrorMessage(error).startsWith('APPS_SCRIPT_GET_CIRCUIT_OPEN:')) throw error;
    await client.del(key);
  }
}
async function recordAppsScriptGetCircuitSuccess(action) {
  await requireRedisClient().del(getAppsScriptGetCircuitKey(action));
}
async function recordAppsScriptGetCircuitFailure(action) {
  const client = requireRedisClient();
  const key = getAppsScriptGetCircuitKey(action);
  const raw = await client.get(key);
  let failureCount = 0;
  if (raw) {
    try {
      failureCount = Number(JSON.parse(raw).failureCount || 0);
    } catch {
      failureCount = 0;
    }
  }
  failureCount += 1;
  const openedUntilMs = failureCount >= APPS_SCRIPT_GET_CIRCUIT_FAILURE_THRESHOLD
    ? Date.now() + APPS_SCRIPT_GET_CIRCUIT_COOLDOWN_SECONDS * 1000
    : 0;
  await client.set(
    key,
    JSON.stringify({ failureCount, openedUntilMs, updatedAt: new Date().toISOString() }),
    { EX: APPS_SCRIPT_GET_CIRCUIT_COOLDOWN_SECONDS }
  );
}
async function acquireAppsScriptGetLock(action) {
  const client = requireRedisClient();
  const token = randomUUID();
  const isGpsRealtime = action === 'getGpsWorkerRealtime';
  if (isGpsRealtime) {
    await client.set(
      APPS_SCRIPT_GPS_WAITING_KEY,
      JSON.stringify({ action, queuedAt: new Date().toISOString() }),
      { EX: APPS_SCRIPT_GPS_WAITING_TTL_SECONDS }
    );
  }
  const deadline = Date.now() + APPS_SCRIPT_GET_WAIT_MS;
  try {
    while (Date.now() < deadline) {
      if (
        !isGpsRealtime &&
        action === 'getTrucks' &&
        await client.exists(APPS_SCRIPT_GPS_WAITING_KEY)
      ) {
        await wait(APPS_SCRIPT_GET_POLL_MS);
        continue;
      }
      const lockValue = JSON.stringify({ token, action, startedAt: new Date().toISOString() });
      const acquired = await client.set(
        APPS_SCRIPT_GET_LOCK_KEY,
        lockValue,
        { NX: true, EX: APPS_SCRIPT_GET_LOCK_SECONDS }
      );
      if (acquired) {
        console.log(JSON.stringify({
          logType: 'ELIVE_APPS_SCRIPT_GET_QUEUE',
          event: 'LOCK_ACQUIRED',
          action,
        }));
        return { client, action, lockValue, isGpsRealtime };
      }
      await wait(APPS_SCRIPT_GET_POLL_MS);
    }
    throw new Error(`APPS_SCRIPT_GET_LOCK_TIMEOUT:${action}`);
  } catch (error) {
    if (isGpsRealtime) await client.del(APPS_SCRIPT_GPS_WAITING_KEY).catch(() => {});
    throw error;
  }
}
async function releaseAppsScriptGetLock(lock) {
  if (!lock) return;
  await releaseRedisLock(
    lock.client,
    APPS_SCRIPT_GET_LOCK_KEY,
    lock.lockValue
  ).catch(() => {});
  if (lock.isGpsRealtime) {
    await lock.client.del(APPS_SCRIPT_GPS_WAITING_KEY).catch(() => {});
  }
  console.log(JSON.stringify({
    logType: 'ELIVE_APPS_SCRIPT_GET_QUEUE',
    event: 'LOCK_RELEASED',
    action: lock.action,
  }));
}
async function requestAppsScriptGet(action, parameters = {}) {
  validateAppsScriptUrl();
  await waitForAppsScriptMutationToFinish();
  await assertAppsScriptGetCircuitIsClosed(action);
  const getLock = await acquireAppsScriptGetLock(action);
  try {
    const signedParameters = {};
    for (const [key, value] of Object.entries(parameters)) {
      if (value !== undefined && value !== null) signedParameters[key] = String(value);
    }
    const requestTimeoutMilliseconds = action === 'getTrucks'
      ? APPS_SCRIPT_GET_TRUCKS_TIMEOUT_MS
      : APPS_SCRIPT_TIMEOUT_MS;
    const maximumAttempts = action === 'getTrucks'
      ? APPS_SCRIPT_GET_TRUCKS_MAX_ATTEMPTS
      : APPS_SCRIPT_MAX_ATTEMPTS;
    let finalError = null;
    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      try {
        const auth = createAppsScriptSignature('GET', action, signedParameters);
        const queryData = {
          action,
          ...signedParameters,
          authTimestamp: auth.timestamp,
          authNonce: auth.nonce,
          authSignature: auth.signature,
          t: String(Date.now()),
        };
        const requestUrl = `${APPS_SCRIPT_URL}?${new URLSearchParams(queryData).toString()}`;
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
          requestTimeoutMilliseconds
        );
        const responseText = await response.text();
        if (response.ok) {
          const data = parseJsonText(
            responseText,
            `Google Apps Script ${action} returned invalid JSON.`
          );
          validateAppsScriptResponse(data, action);
          recordAppsScriptSuccess();
          await recordAppsScriptGetCircuitSuccess(action);
          return data;
        }
        finalError = new Error(`Google Apps Script returned HTTP ${response.status}.`);
        console.error(`Apps Script GET ${action} failed:`, {
          attempt,
          status: response.status,
          responsePreview: getResponsePreview(responseText),
        });
        const contentType = cleanText(response.headers.get('content-type')).toLowerCase();
        const looksLikeHtml = contentType.includes('text/html') || /^\s*<!doctype html/i.test(responseText);
        const retryableTransient404 = response.status === 404 && looksLikeHtml;
        if (!RETRYABLE_STATUS_CODES.has(response.status) && !retryableTransient404) break;
      } catch (error) {
        finalError = error;
        console.error(`Apps Script GET ${action} connection error:`, {
          attempt,
          error: getErrorMessage(error),
        });
        if (!isRetryableAppsScriptError(error)) break;
      }
      if (attempt < maximumAttempts) {
        await wait(attempt === 1 ? 1000 : 2500);
      }
    }
    const error = finalError || new Error(`${action} request failed.`);
    await recordAppsScriptGetCircuitFailure(action);
    recordAppsScriptError(error);
    throw error;
  } finally {
    await releaseAppsScriptGetLock(getLock);
  }
}

/*
 * Mutation requests are sent once only. Do not retry automatically because
 * the first request may already have changed Google Sheets successfully.
 */
async function requestAppsScriptPost(action, payload = {}, timeoutMilliseconds = APPS_SCRIPT_TIMEOUT_MS) {
  validateAppsScriptUrl();
  let mutationLock = null;
  try {
    mutationLock = await acquireAppsScriptMutationLock(action);
    await waitForAppsScriptGetQueueToDrain();
    await wait(APPS_SCRIPT_POST_SETTLE_MS);
    console.log(JSON.stringify({
      logType: 'ELIVE_APPS_SCRIPT_POST_QUEUE',
      event: 'POST_LOCK_ACQUIRED',
      action,
    }));
    console.log(`Calling Apps Script POST ${action}, single attempt`);
    const signedPayload = JSON.parse(JSON.stringify({ action, ...payload }));
    const auth = createAppsScriptSignature('POST', action, signedPayload);
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
        body: JSON.stringify({ ...signedPayload, _auth: auth }),
        cache: 'no-store',
      },
      timeoutMilliseconds
    );
    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(`Google Apps Script returned HTTP ${response.status}. Response: ${getResponsePreview(responseText)}`);
    }
    const data = parseJsonText(responseText, `Google Apps Script ${action} returned invalid JSON.`);
    validateAppsScriptResponse(data, action);
    recordAppsScriptSuccess();
    return data;
  } catch (error) {
    console.error(`Apps Script POST ${action} failed without retry:`, { error: getErrorMessage(error) });
    recordAppsScriptError(error);
    throw error;
  } finally {
    if (mutationLock) {
      await wait(APPS_SCRIPT_POST_SETTLE_MS).catch(() => {});
      await releaseAppsScriptMutationLock(mutationLock).catch(error => {
        console.error('Unable to release Apps Script POST lock:', getErrorMessage(error));
      });
      console.log(JSON.stringify({
        logType: 'ELIVE_APPS_SCRIPT_POST_QUEUE',
        event: 'POST_LOCK_RELEASED',
        action,
      }));
    }
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

app.post('/api/auth/login', loginRateLimit, async (req,res)=>{ try { const username=normalizeLoginUsername(req.body?.username); const password=normalizeLoginPassword(req.body?.password); const user=await getEffectiveAuthUser(username); if(!user||!user.active){ await waitForLoginFailure(); return res.status(401).json({success:false,error:'Username or password is incorrect.'}); } const passwordIsValid=await verifyLoginPassword(password,user); if(!passwordIsValid){ await waitForLoginFailure(); return res.status(401).json({success:false,error:'Username or password is incorrect.'}); } const {token,session}=await createSession(user); setSessionCookie(res,token); return res.status(200).json({success:true,user:createLoginUserResponse(user),session:createSessionResponse(session),compatibilityMode:true,timestamp:new Date().toISOString()}); } catch(error){ const errorCode=getErrorMessage(error); if(errorCode==='LOGIN_PAYLOAD_INVALID') return res.status(400).json({success:false,error:'A valid username and password are required.'}); if(errorCode==='AUTH_CONFIG_MISSING'||errorCode==='AUTH_CONFIG_INVALID'){ console.error('Authentication configuration error:',errorCode); return res.status(503).json({success:false,error:'Authentication service is not configured.'}); } console.error('Login endpoint error:',getErrorMessage(error)); return res.status(500).json({success:false,error:'Unable to process login.'}); } });

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

app.get('/api/auth/session', async (req,res)=>{ try { const record=await getSessionFromRequest(req); if(!record||record.invalidReason){ if(record?.invalidReason) writeSessionRevocationAudit(req,record); clearSessionCookie(res); return res.status(401).json({success:false,authenticated:false,error:record?.invalidReason==='ACCOUNT_ROLE_CHANGED'?'Account permission changed. Please sign in again.':record?.invalidReason==='IDLE_TIMEOUT'?'Session expired due to inactivity. Please sign in again.':'Authentication required.'}); } return res.status(200).json({success:true,authenticated:true,user:{username:record.session.username,role:record.session.role},session:createSessionResponse(record.session),compatibilityMode:false,timestamp:new Date().toISOString()}); } catch(error){ const errorCode=getErrorMessage(error); if(errorCode==='SESSION_STORE_UNAVAILABLE') return res.status(503).json({success:false,error:'Session service is temporarily unavailable.'}); if(errorCode==='AUTH_CONFIG_MISSING'||errorCode==='AUTH_CONFIG_INVALID') return res.status(503).json({success:false,error:'Authentication service is not configured.'}); return sendRouteError(res,error,'Unable to read Session.',500); } });
app.post('/api/auth/activity', requireAuthentication, async (req, res) => {
  try {
    const updatedSession = await recordSessionUserActivity(
      req.authSessionTokenHash,
      req.auth
    );
    return res.status(200).json({
      success: true,
      lastUserActivityAt: new Date(updatedSession.lastUserActivityAt).toISOString(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (getErrorMessage(error) === 'SESSION_STORE_UNAVAILABLE') {
      return res.status(503).json({
        success: false,
        error: 'Session service is temporarily unavailable.',
      });
    }
    return sendRouteError(res, error, 'Unable to record user activity.', 500);
  }
});

app.post('/api/auth/logout', async (req,res)=>{ try { const record=await getSessionFromRequest(req); if(record){ req.auth={username:record.session.username,role:record.session.role,expiresAt:record.session.expiresAt}; await deleteSession(record.tokenHash, record.session); } clearSessionCookie(res); return res.status(200).json({success:true,message:'Logged out.',timestamp:new Date().toISOString()}); } catch(error){ const errorCode=getErrorMessage(error); if(errorCode==='SESSION_STORE_UNAVAILABLE') return res.status(503).json({success:false,error:'Session service is temporarily unavailable.'}); if(errorCode==='AUTH_CONFIG_MISSING'||errorCode==='AUTH_CONFIG_INVALID'){ clearSessionCookie(res); return res.status(200).json({success:true,message:'Logged out.',timestamp:new Date().toISOString()}); } return sendRouteError(res,error,'Unable to logout.',500); } });
app.post('/api/auth/change-password', requireAuthentication, async (req, res) => {
  const username = req.auth.username;
  let rateLimitKey = null;
  try {
    rateLimitKey = await enforcePasswordChangeRateLimit(req, username);
    const currentPassword = req.body?.currentPassword;
    const newPassword = validateNewPassword(username, currentPassword, req.body?.newPassword, req.body?.confirmNewPassword);
    const user = await getEffectiveAuthUser(username);
    if (!user || !user.active) return res.status(401).json({ success: false, error: 'Authentication required.' });
    const currentPasswordIsValid = await verifyLoginPassword(currentPassword, user);
    if (!currentPasswordIsValid) {
      await incrementRateLimitFailure(requireRedisClient(), rateLimitKey);
      req.auditDetails = { reason: 'CURRENT_PASSWORD_INVALID', otherSessionsRevoked: 0, currentSessionPreserved: true };
      return res.status(401).json({ success: false, error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
    }
    const { salt, passwordHash } = await hashNewPassword(newPassword);
    const credentialRecord = await writeAuthUserOverride(user, passwordHash, salt);
    const revoked = await revokeUserSessions(username, req.authSessionTokenHash);
    const currentSession = {
      ...req.auth,
      credentialVersion: credentialRecord.credentialVersion,
      lastReauthenticatedAt: Date.now(),
      passwordChangedAt: credentialRecord.passwordChangedAt,
    };
    const remainingTtlSeconds = Math.max(1, Math.ceil((Number(req.auth.expiresAt) - Date.now()) / 1000));
    await requireRedisClient().set(getSessionKey(req.authSessionTokenHash), JSON.stringify(currentSession), { EX: remainingTtlSeconds });
    await requireRedisClient().del(rateLimitKey);
    req.auditDetails = { reason: 'SELF_SERVICE', otherSessionsRevoked: revoked.revokedCount, currentSessionPreserved: true };
    return res.status(200).json({
      success: true,
      message: 'เปลี่ยนรหัสผ่านสำเร็จ',
      currentSessionPreserved: true,
      otherSessionsRevoked: revoked.revokedCount,
      passwordChangedAt: credentialRecord.passwordChangedAt,
      passwordPolicy: { minimumLength: PASSWORD_MIN_LENGTH, maximumLength: PASSWORD_MAX_LENGTH },
    });
  } catch (error) {
    const code = getErrorMessage(error);
    req.auditDetails = { reason: code, otherSessionsRevoked: 0, currentSessionPreserved: true };
    if (code === 'PASSWORD_CHANGE_RATE_LIMITED') {
      res.setHeader('Retry-After', String(error.retryAfterSeconds || 900));
      return res.status(429).json({ success: false, error: 'ลองเปลี่ยนรหัสผ่านผิดหลายครั้ง กรุณารอสักครู่แล้วลองใหม่' });
    }
    const validationMessages = {
      CURRENT_PASSWORD_REQUIRED: 'กรุณากรอกรหัสผ่านปัจจุบัน',
      NEW_PASSWORD_REQUIRED: 'กรุณากรอกรหัสผ่านใหม่และยืนยันรหัสผ่านใหม่',
      PASSWORD_CONFIRMATION_MISMATCH: 'รหัสผ่านใหม่และการยืนยันไม่ตรงกัน',
      PASSWORD_POLICY_INVALID: `รหัสผ่านใหม่ต้องมีความยาว ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} ตัวอักษร`,
      PASSWORD_UNCHANGED: 'รหัสผ่านใหม่ต้องไม่เหมือนรหัสผ่านปัจจุบัน',
      PASSWORD_CONTAINS_USERNAME: 'รหัสผ่านใหม่ต้องไม่มี Username เป็นส่วนประกอบ',
    };
    if (validationMessages[code]) return res.status(400).json({ success: false, error: validationMessages[code] });
    return sendRouteError(res, error, 'Unable to change password.', 500);
  }
});

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
      '/api/auth/activity',
      '/api/auth/change-password',
      '/api/admin/sessions',
      '/api/admin/sessions/revoke-user',
      '/api/admin/sessions/revoke-all',
      '/api/trucks',
      '/api/trucks/update',
      '/api/gps/geofences',
      '/api/gps/dock-status/:codeRun',
      '/api/gps/dock/evaluate',
      '/api/gps/vehicle-cycle',
      '/api/gps/worker-status',
      '/api/master-plan',
      '/api/master-plan/rows',
      '/api/master-plan/rows/:sheetRow',
      '/api/plans/preview',
      '/api/plans/create',
      '/api/plans/daily',
      '/api/plans/extra',
      '/api/plans/:codeRun',
      '/api/plans/:codeRun/stamp',
      'DELETE /api/plans/:codeRun',
      '/api/plans/:codeRun/cancel',
      '/api/plans/:codeRun/restore',
      '/api/plans/:codeRun/confirm-work-detail',
      '/api/route-to-tpcap',
    ],
    sessionStore: { type: 'redis', configured: Boolean(REDIS_URL), ready: Boolean(redisReady && redisClient?.isReady), lastError: lastRedisError },
    gpsDockMonitoring: {
      enabled: true,
      autoStampEnabled: GPS_AUTO_STAMP_ETA_ENABLED,
      autoStampEtaEnabled: GPS_AUTO_STAMP_ETA_ENABLED,
      autoStampEtdEnabled: GPS_AUTO_STAMP_ETD_ENABLED,
      backgroundWorkerEnabled: GPS_BACKGROUND_WORKER_ENABLED,
      backgroundWorkerIntervalMs: GPS_BACKGROUND_WORKER_INTERVAL_MS,
      workerTruckSnapshotCacheSeconds: Math.floor(FRESH_CACHE_DURATION_MS / 1000),
      dailyPlanRedisCacheEnabled: true,
      dailyPlanCacheTtlSeconds: GPS_DAILY_PLAN_CACHE_TTL_SECONDS,
      dailyPlanCacheRefreshPolicy: 'CACHE_MISS_OR_PLAN_MUTATION',
      hourlyDailyPlanRefreshEnabled: false,
      createPlanRefreshesCurrentDateImmediately: true,
      dailyPlanCacheKeyPrefix: GPS_DAILY_PLAN_CACHE_PREFIX,
      realtimeRefreshSeconds: Math.floor(GPS_BACKGROUND_WORKER_INTERVAL_MS / 1000),
      workerForcesFullTruckRefreshEveryCycle: false,
      appsScriptGetRetryPolicy: 'RETRY_TIMEOUT_408_425_429_5XX_AND_TRANSIENT_HTML_404',
      realtimeRedisFallbackEnabled: true,
      realtimeSynchronizerEnabled: true,
      realtimeSynchronizerPolicy: 'ONE_FETCH_WRITES_REDIS_WORKER_AND_ELIVE_SHARE',
      realtimeSynchronizerIntervalSeconds: Math.floor(GPS_BACKGROUND_WORKER_INTERVAL_MS / 1000),
      realtimeSynchronizerLockSeconds: GPS_REALTIME_SYNCHRONIZER_LOCK_SECONDS,
      eliveReadsSharedRealtimeSnapshot: true,
      gpsWorkerReadsSharedRealtimeSnapshot: true,
      directGetTrucksForDashboardEnabled: false,
      realtimeCacheTtlSeconds: GPS_REALTIME_CACHE_TTL_SECONDS,
      realtimeFallbackMaximumAgeSeconds: Math.floor(GPS_REALTIME_FALLBACK_MAX_AGE_MS / 1000),
      realtimeFallbackStillEnforcesGpsStaleGuard: true,
      serviceMode: SERVICE_MODE,
      parkingSpeedThresholdKmh: GPS_PARKING_SPEED_THRESHOLD_KMH,
      dwellThresholdSeconds: Math.floor(GPS_DWELL_THRESHOLD_MS / 1000),
      gpsStaleThresholdSeconds: Math.floor(GPS_STALE_THRESHOLD_MS / 1000),
      movementGraceSeconds: Math.floor(GPS_MOVEMENT_GRACE_MS / 1000),
      multipleTripsPerVehiclePerDay: true,
      tripSelectionPolicy: 'IN_PROGRESS_THEN_PLAN_WINDOW_THEN_LOCKED_THEN_NEAREST_PLAN_ETA',
      activeTripLockEnabled: true,
      futureTripGuardEnabled: true,
      nextTripEarlyWindowMinutes: GPS_NEXT_TRIP_EARLY_WINDOW_MINUTES,
      noWorkActionKeyword: 'ไม่มีงาน',
      noWorkActionAutoStampBlocked: true,
      tripTieBreaker: 'EARLIER_PLAN_ETA_THEN_CODE_RUN_NUMERIC',
      exitRequiredBeforeNextTrip: true,
      etaRule: 'STAMP_ACTIVE_ARRIVAL_GROUP_IN_MATCHING_GEOFENCE',
      multiDropSameGeofenceEtaEnabled: true,
      lspArrivalGroupWindowMinutes: GPS_LSP_ARRIVAL_GROUP_WINDOW_MINUTES,
      dropPointGeofenceMapping: { L1: 'TPCAP-LSP', L2: 'TPCAP-LSP', L3: 'TPCAP-LSP', M1: 'TPCAP-LSP', R1: 'TPCAP-R1', R2: 'TPCAP-R2' },
      pendingStampRetryQueueEnabled: true,
      pendingStampTerminalValidationErrorsBecomeSuperseded: true,
      pendingStampTerminalValidationReasons: ['ETA_BEFORE_PLAN_WINDOW', 'STAMP_DATE_DOES_NOT_MATCH_PLAN_DATE', 'PLAN_ETA_UNAVAILABLE'],
      pendingStampBatchSize: GPS_PENDING_STAMP_BATCH_SIZE,
      pendingStampOrder: 'GPS_TIME_THEN_CREATED_AT_THEN_CODE_RUN',
      etaEarlyWindowGuardLayers: ['TRIP_SELECTION', 'PENDING_CREATION', 'PENDING_PROCESSING', 'MANUAL_ROUTE'],
      pendingStampRetryBaseSeconds: Math.floor(GPS_PENDING_STAMP_BASE_RETRY_MS / 1000),
      pendingStampRetryMaximumSeconds: Math.floor(GPS_PENDING_STAMP_MAX_RETRY_MS / 1000),
      etdRule: 'IMMEDIATE_ON_FIRST_FRESH_GPS_OUTSIDE_AFTER_INSIDE',
      vehicleCycleTtlSeconds: GPS_VEHICLE_CYCLE_TTL_SECONDS,
      geofences: GPS_GEOFENCES,
    },
    rateLimitStore: { type: 'redis', persistentAcrossDeploys: true, windowSeconds: LOGIN_RATE_LIMIT_WINDOW_SECONDS },
    sessionAccountValidation: { enabled: true, invalidatesOnInactive: true, invalidatesOnRoleChange: true, invalidatesOnCredentialChange: true },
    selfServicePasswordChange: {
      enabled: true,
      requiresCurrentPassword: true,
      currentSessionPreserved: true,
      otherSessionsRevoked: true,
      credentialStore: 'redis-override-with-environment-seed',
      minimumLength: PASSWORD_MIN_LENGTH,
      maximumLength: PASSWORD_MAX_LENGTH,
      rateLimitFailures: PASSWORD_CHANGE_RATE_LIMIT_MAX_FAILURES,
    },
    sessionRevocationAudit: { enabled: true, action: 'SESSION_REVOKED' },
    concurrentSessionControl: {
      enabled: true,
      policy: 'revoke-oldest',
      limitsByRole: SESSION_LIMITS_BY_ROLE,
    },
    adminSessionRevocation: { enabled: true, currentAdminSessionPreserved: true },
    adminSessionInventory: { enabled: true, exposesSecrets: false },
    userActivitySignal: { enabled: true, endpoint: '/api/auth/activity', frontendThrottleSeconds: 60 },
    sessionIdleTimeout: { enabled: true, timeoutSeconds: Math.floor(SESSION_IDLE_TIMEOUT_MS / 1000), enforcedServerSide: true, absoluteLifetimeSeconds: SESSION_TTL_SECONDS },
    appsScript: {
      configured: Boolean(APPS_SCRIPT_URL),
      signatureConfigured: Boolean(APPS_SCRIPT_SHARED_SECRET && APPS_SCRIPT_SHARED_SECRET.length >= 32),
      signatureMaxAgeSeconds: Math.floor(APPS_SCRIPT_SIGNATURE_MAX_AGE_MS / 1000),
      defaultTimeoutSeconds: Math.floor(APPS_SCRIPT_TIMEOUT_MS / 1000),
      getTrucksTimeoutSeconds: Math.floor(APPS_SCRIPT_GET_TRUCKS_TIMEOUT_MS / 1000),
      getTrucksMaximumAttempts: APPS_SCRIPT_GET_TRUCKS_MAX_ATTEMPTS,
      planCreateTimeoutSeconds: Math.floor(APPS_SCRIPT_PLAN_CREATE_TIMEOUT_MS / 1000),
      mutationLockEnabled: true,
      mutationLockTtlSeconds: APPS_SCRIPT_MUTATION_LOCK_SECONDS,
      serializedGetQueueEnabled: true,
      serializedGetLockTtlSeconds: APPS_SCRIPT_GET_LOCK_SECONDS,
      serializedGetMaximumWaitSeconds: Math.floor(APPS_SCRIPT_GET_WAIT_MS / 1000),
      gpsRealtimeQueuePriorityEnabled: true,
      getCircuitBreakerEnabled: true,
      getCircuitBreakerFailureThreshold: APPS_SCRIPT_GET_CIRCUIT_FAILURE_THRESHOLD,
      getCircuitBreakerCooldownSeconds: APPS_SCRIPT_GET_CIRCUIT_COOLDOWN_SECONDS,
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

app.get('/api/gps/worker-status', requireAuthentication, requireMinimumRole('SUPERVISOR'), async (req, res) => {
  try {
    const raw = await requireRedisClient().get(GPS_WORKER_STATUS_KEY);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      success: true,
      enabled: GPS_BACKGROUND_WORKER_ENABLED,
      result: raw ? JSON.parse(raw) : null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return sendRouteError(res, error, 'Unable to retrieve GPS Worker status.', 500);
  }
});
app.get('/api/gps/vehicle-cycle', requireAuthentication, requireMinimumRole('TV_VIEWER'), async (req, res) => {
  try {
    const licensePlate = cleanText(req.query.licensePlate);
    if (!licensePlate) throw new Error('licensePlate is required.');
    const result = await readVehicleCycleState(licensePlate);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ success: true, result, timestamp: new Date().toISOString() });
  } catch (error) {
    return sendRouteError(res, error, 'Unable to retrieve GPS Vehicle Cycle.');
  }
});
app.get('/api/gps/geofences', requireAuthentication, requireMinimumRole('TV_VIEWER'), (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    success: true,
    geofences: GPS_GEOFENCES,
    config: {
      parkingSpeedThresholdKmh: GPS_PARKING_SPEED_THRESHOLD_KMH,
      dwellThresholdSeconds: Math.floor(GPS_DWELL_THRESHOLD_MS / 1000),
      gpsStaleThresholdSeconds: Math.floor(GPS_STALE_THRESHOLD_MS / 1000),
      movementGraceSeconds: Math.floor(GPS_MOVEMENT_GRACE_MS / 1000),
      autoStampEnabled: GPS_AUTO_STAMP_ETA_ENABLED,
      autoStampEtaEnabled: GPS_AUTO_STAMP_ETA_ENABLED,
      autoStampEtdEnabled: GPS_AUTO_STAMP_ETD_ENABLED,
    },
    timestamp: new Date().toISOString(),
  });
});
app.get('/api/gps/dock-status/:codeRun', requireAuthentication, requireMinimumRole('TV_VIEWER'), async (req, res) => {
  try {
    const codeRun = normalizeCodeRun(req.params.codeRun);
    const state = await readGpsDwellState(codeRun);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      success: true,
      codeRun,
      result: state ? createGpsDockResult(state) : null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return sendRouteError(res, error, 'Unable to retrieve GPS Dock status.');
  }
});
app.post('/api/gps/dock/evaluate', requireAuthentication, requireMinimumRole('OPERATOR'), async (req, res) => {
  try {
    const result = await evaluateGpsDock(req.body);
    req.auditDetails = {
      status: result.status,
      geofenceId: result.geofenceId,
      distanceMeters: result.distanceMeters,
      speedKmh: result.speedKmh,
      dwellSeconds: result.dwellSeconds,
      readyForGpsStampEta: result.readyForGpsStampEta,
    };
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      success: true,
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return sendRouteError(res, error, 'Unable to evaluate GPS Dock status.');
  }
});
app.delete('/api/gps/dock-status/:codeRun', requireAuthentication, requireMinimumRole('SUPERVISOR'), async (req, res) => {
  try {
    const codeRun = normalizeCodeRun(req.params.codeRun);
    const client = requireRedisClient();
    const deletedCount = await client.del(getGpsDwellKey(codeRun));
    req.auditDetails = { deletedCount };
    return res.status(200).json({
      success: true,
      codeRun,
      deleted: deletedCount > 0,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return sendRouteError(res, error, 'Unable to reset GPS Dock status.');
  }
});
app.get('/api/trucks', requireAuthentication, requireMinimumRole('TV_VIEWER'), async (req, res) => {
  try {
    const forceRefresh = cleanText(req.query.refresh).toLowerCase() === 'true';
    if (forceRefresh) await synchronizeGpsWorkerRealtime();
    let realtimeResult;
    try {
      realtimeResult = await getSharedGpsWorkerRealtime();
    } catch {
      realtimeResult = await synchronizeGpsWorkerRealtime();
    }
    const dateText = getBangkokDateText(new Date());
    const dailyPlanResult = await getGpsWorkerDailyPlan(dateText);
    const snapshot = realtimeResult.realtime;
    const responseData = {
      status: 'success',
      plan: dailyPlanResult.plan,
      actual: Array.isArray(snapshot?.actual) ? snapshot.actual : [],
      gps: Array.isArray(snapshot?.gps) ? snapshot.gps : [],
    };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-ELIVE-Data-Source', realtimeResult.source);
    return res.status(200).json({
      ...responseData,
      meta: {
        source: realtimeResult.source,
        planSource: dailyPlanResult.source,
        cacheAgeSeconds: Math.max(0, Math.round(realtimeResult.fallbackAgeMs / 1000)),
        realtimeFallbackUsed: realtimeResult.fallbackUsed,
        sharedRealtimeSnapshot: true,
        directGetTrucksUsed: false,
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
    await waitForExistingAppsScriptReads();
    const result = await requestAppsScriptPost(
      'createPlanPeriod',
      request,
      APPS_SCRIPT_PLAN_CREATE_TIMEOUT_MS
    );
    clearTruckCache();
    clearMasterPlanCache();
    const dailyPlanCacheRefresh = await refreshCurrentGpsPlanCacheIfAffected(
      request.startDate,
      request.endDate
    );
    req.auditDetails = {
      source: request.source,
      startDate: request.startDate,
      endDate: request.endDate,
      createdRowCount: Number(result?.result?.createdRowCount || 0),
      mutationLockUsed: true,
      dailyPlanCacheRefresh,
    };
    return res.status(200).json(result);
  } catch (error) {
    const message = getErrorMessage(error);
    const uncertainResult =
      message.includes('This operation was aborted') ||
      message.includes('HTTP 404') ||
      message.includes('invalid JSON');
    if (uncertainResult) {
      req.auditDetails = {
        reason: 'PLAN_CREATE_RESULT_UNKNOWN',
        mutationLockUsed: true,
      };
      return res.status(202).json({
        success: true,
        status: 'unknown',
        result: {
          success: true,
          confirmationPending: true,
          reason: 'PLAN_CREATE_RESULT_UNKNOWN',
          message: 'ระบบส่งคำขอสร้างแผนแล้ว แต่ยังยืนยันผลตอบกลับไม่ได้ กรุณาตรวจสอบแผนประจำวันที่สร้างก่อนดำเนินการซ้ำ',
        },
        timestamp: new Date().toISOString(),
      });
    }
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
    const dailyPlanCacheRefresh = await refreshGpsWorkerDailyPlanCache(plan.date);
    req.auditDetails = { dailyPlanCacheRefresh };
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
    const dailyPlanCacheRefresh = await refreshGpsWorkerDailyPlanCache(plan.date);
    req.auditDetails = { dailyPlanCacheRefresh };
    return res.status(200).json(result);
  } catch (error) {
    return sendRouteError(res, error, 'Unable to update Plan.');
  }
});

app.post('/api/plans/delete-batch', requireAuthentication, requireMinimumRole('SUPERVISOR'), async (req, res) => {
  try {
    const input = Array.isArray(req.body?.codeRuns) ? req.body.codeRuns : [];
    const codeRuns = [...new Set(input.map(normalizeCodeRun))];
    if (!codeRuns.length) throw new Error('At least one codeRun is required.');
    if (codeRuns.length > 500) throw new Error('เลือกได้สูงสุด 500 รายการต่อครั้ง');
    const result = await requestAppsScriptPost('deletePlansBatch', { codeRuns });
    clearTruckCache();
    await clearGpsWorkerDailyPlanCache();
    req.auditDetails = { requestedCount: codeRuns.length, deletedPlanCount: Number(result?.result?.deletedPlanCount || 0), deletedActualCount: Number(result?.result?.deletedActualCount || 0) };
    return res.status(200).json(result);
  } catch (error) { return sendRouteError(res, error, 'Unable to delete selected Plans.'); }
});

app.delete('/api/plans/:codeRun', requireAuthentication, requireMinimumRole('SUPERVISOR'), async (req, res) => {
  try {
    const codeRun = normalizeCodeRun(req.params.codeRun);
    const result = await requestAppsScriptPost('deletePlan', { codeRun });
    clearTruckCache();
    await clearGpsWorkerDailyPlanCache();
    return res.status(200).json(result);
  } catch (error) {
    return sendRouteError(res, error, 'Unable to delete Plan.');
  }
});

app.post('/api/plans/:codeRun/stamp', requireAuthentication, requireMinimumRole('OPERATOR'), async (req, res) => {
  try {
    const codeRun = normalizeCodeRun(req.params.codeRun);
    const stampType = normalizeStampType(req.body?.stampType);
    const override = req.body?.override === true;
    if (override && ROLE_LEVELS[req.auth.role] < ROLE_LEVELS.SUPERVISOR) {
      return res.status(403).json({ success: false, error: 'Supervisor permission is required for Stamp override.' });
    }
    let realtimeResult;
    try {
      realtimeResult = await getSharedGpsWorkerRealtime();
    } catch {
      realtimeResult = await synchronizeGpsWorkerRealtime();
    }
    const dailyPlanResult = await getGpsWorkerDailyPlan(getBangkokDateText(new Date()));
    const trip = findTripByCodeRun({
      plan: dailyPlanResult.plan,
      actual: realtimeResult.realtime.actual,
      gps: realtimeResult.realtime.gps,
    }, codeRun);
    if (stampType === 'ETA' && trip.stampEtd) throw new Error('Cannot Stamp ETA because this trip already has Stamp ETD.');
    if (stampType === 'ETD' && !trip.stampEta) throw new Error('Stamp ETA is required before Stamp ETD.');
    const stampSource = override ? 'SUPERVISOR_OVERRIDE' : 'MANUAL';
    const stampTime = cleanText(req.body?.stampTime) || new Date().toISOString();
    if (stampType === 'ETA' && !override) {
      const etaWindow = getEtaWindowDecision(trip.planDate, trip.planEta, stampTime);
      if (!etaWindow.allowed) {
        req.auditDetails = { stampType, stampSource, reason: etaWindow.reason, etaWindow };
        return res.status(409).json({
          success: false,
          error: 'ยังไม่สามารถ Stamp ETA ได้ สามารถบันทึกได้ล่วงหน้าสูงสุด 90 นาทีจาก Plan ETA',
          reason: etaWindow.reason,
          etaWindow,
        });
      }
    }
    const result = await stampActualData({
      codeRun,
      stampType,
      stampSource,
      stampTime,
      stampedBy: req.auth.username,
      overrideReason: override ? cleanText(req.body?.overrideReason) : '',
    });
    req.auditDetails = {
      stampType,
      stampSource,
      written: result?.result?.written !== false,
      reason: result?.result?.reason || null,
    };
    return res.status(200).json(result);
  } catch (error) {
    return sendRouteError(res, error, 'Unable to Stamp Actual data.');
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
    await clearGpsWorkerDailyPlanCache();
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
    await clearGpsWorkerDailyPlanCache();
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
      `${longitude},${latitude};` +
      `${TPCAP_GREEN_ENTRY_LONGITUDE},${TPCAP_GREEN_ENTRY_LATITUDE};` +
      `${TPCAP_LONGITUDE},${TPCAP_LATITUDE}`;

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
      waypoint: {
        name: 'TPCAP Green Entry',
        latitude: TPCAP_GREEN_ENTRY_LATITUDE,
        longitude: TPCAP_GREEN_ENTRY_LONGITUDE,
      },
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

app.get(
  '/api/admin/sessions',
  requireAuthentication,
  requireMinimumRole('ADMIN'),
  async (req, res) => {
    try {
      const result = await listActiveSessions();
      req.auditDetails = {
        activeUsers: result.activeUserCount,
        activeSessions: result.activeSessionCount,
      };
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({
        success: true,
        summary: {
          activeUsers: result.activeUserCount,
          activeSessions: result.activeSessionCount,
        },
        users: result.users,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return sendRouteError(res, error, 'Unable to list active Sessions.', 500);
    }
  }
);

app.post(
  '/api/admin/sessions/revoke-user',
  requireAuthentication,
  requireMinimumRole('ADMIN'),
  async (req, res) => {
    try {
      const result = await revokeUserSessions(
        req.body?.username,
        req.authSessionTokenHash
      );
      req.auditDetails = { revokedCount: result.revokedCount };
      return res.status(200).json({
        success: true,
        username: result.username,
        revokedCount: result.revokedCount,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      if (getErrorMessage(error) === 'LOGIN_PAYLOAD_INVALID') {
        return res.status(400).json({
          success: false,
          error: 'A valid username is required.',
        });
      }
      return sendRouteError(res, error, 'Unable to revoke user Sessions.', 500);
    }
  }
);

app.post(
  '/api/admin/sessions/revoke-all',
  requireAuthentication,
  requireMinimumRole('ADMIN'),
  async (req, res) => {
    try {
      const result = await revokeAllSessions(req.authSessionTokenHash);
      req.auditDetails = { revokedCount: result.revokedCount };
      return res.status(200).json({
        success: true,
        revokedCount: result.revokedCount,
        currentAdminSessionPreserved: true,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return sendRouteError(res, error, 'Unable to revoke all Sessions.', 500);
    }
  }
);

app.post('/api/cache/clear', requireAuthentication, requireMinimumRole('ADMIN'), async (req, res) => {
  clearTruckCache();
  clearMasterPlanCache();
  const deletedDailyPlanCacheCount = await clearGpsWorkerDailyPlanCache();
  const deletedRealtimeCacheCount = await requireRedisClient().del(GPS_REALTIME_CACHE_KEY);

  return res.json({
    success: true,
    deletedDailyPlanCacheCount,
    deletedRealtimeCacheCount,
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

async function shutdown(signal) {
  console.log(`Received ${signal}. Shutting down safely.`);
  await stopGpsBackgroundWorker();
  if (redisClient?.isOpen) await redisClient.quit().catch(() => {});
  process.exit(0);
}
process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
process.on('SIGINT', () => { void shutdown('SIGINT'); });
async function startServer(){
  await initializeRedis();
  startGpsBackgroundWorker();
  if (SERVICE_MODE === 'worker') {
    if (!GPS_BACKGROUND_WORKER_ENABLED) throw new Error('SERVICE_MODE worker requires GPS_BACKGROUND_WORKER_ENABLED=true.');
    console.log(`ELIVE GPS Background Worker version ${API_VERSION} is running.`);
    return;
  }
  app.listen(PORT,'0.0.0.0',()=>{ console.log(`ELIVE API version ${API_VERSION} is running on port ${PORT}`); });
}
startServer().catch(error=>{ console.error('Unable to start ELIVE API:',getErrorMessage(error)); process.exit(1); });
