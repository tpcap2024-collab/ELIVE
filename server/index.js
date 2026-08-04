import express from 'express';
import cors from 'cors';

const app = express();
const PORT = Number(process.env.PORT || 10000);
const APPS_SCRIPT_URL = String(process.env.APPS_SCRIPT_URL || '').trim().replace(/^['"]|['"];?$/g, '').replace(/[;\s]+$/g, '').replace(/\/+$/, '');
const APPS_SCRIPT_TIMEOUT_MS = 60000;
const MAX_ATTEMPTS = 3;
const RETRYABLE = new Set([404, 408, 425, 429, 500, 502, 503, 504]);
const FRESH_MS = 60000;
const STALE_MS = 1800000;
const TPCAP_LATITUDE = 13.623729606202758;
const TPCAP_LONGITUDE = 101.01501162061923;

let truckCache = null;
let truckCacheAt = 0;
let truckPromise = null;
let masterCache = null;
let masterCacheAt = 0;

app.use(cors({ origin: true, methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Accept'] }));
app.use(express.json({ limit: '10mb' }));

function validateUrl() {
  if (!APPS_SCRIPT_URL.startsWith('https://script.google.com/macros/s/') || !APPS_SCRIPT_URL.endsWith('/exec')) {
    throw new Error('APPS_SCRIPT_URL must be a permanent Apps Script URL ending with /exec.');
  }
}

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function previewText(text) { return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 300); }
function parseJson(text, message) { try { return JSON.parse(text); } catch { throw new Error(message); } }

async function fetchTimeout(url, options, timeout = APPS_SCRIPT_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(id); }
}

async function appsGet(action) {
  validateUrl();
  const url = `${APPS_SCRIPT_URL}?${new URLSearchParams({ action, t: String(Date.now()) })}`;
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchTimeout(url, { method: 'GET', redirect: 'follow', cache: 'no-store', headers: { Accept: 'application/json', 'User-Agent': 'ELIVE-API/3.0' } });
      const text = await response.text();
      if (response.ok) {
        const data = parseJson(text, `${action} returned invalid JSON.`);
        if (data.error || data.success === false) throw new Error(String(data.error || `${action} failed.`));
        return data;
      }
      lastError = new Error(`Google Apps Script returned HTTP ${response.status}.`);
      console.error('Apps Script GET failed', { action, attempt, status: response.status, preview: previewText(text) });
      if (!RETRYABLE.has(response.status)) break;
    } catch (error) { lastError = error; console.error('Apps Script GET error', { action, attempt, message: error instanceof Error ? error.message : String(error) }); }
    if (attempt < MAX_ATTEMPTS) await wait(attempt === 1 ? 1000 : 2500);
  }
  throw lastError instanceof Error ? lastError : new Error(`${action} request failed.`);
}

async function appsPost(action, payload) {
  validateUrl();
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchTimeout(APPS_SCRIPT_URL, {
        method: 'POST', redirect: 'follow', cache: 'no-store',
        headers: { 'Content-Type': 'text/plain;charset=utf-8', Accept: 'application/json', 'User-Agent': 'ELIVE-API/3.0' },
        body: JSON.stringify({ action, ...payload }),
      });
      const text = await response.text();
      if (response.ok) {
        const data = parseJson(text, `${action} returned invalid JSON.`);
        if (data.error || data.success === false) throw new Error(String(data.error || `${action} failed.`));
        return data;
      }
      lastError = new Error(`Google Apps Script returned HTTP ${response.status}.`);
      console.error('Apps Script POST failed', { action, attempt, status: response.status, preview: previewText(text) });
      if (!RETRYABLE.has(response.status)) break;
    } catch (error) { lastError = error; console.error('Apps Script POST error', { action, attempt, message: error instanceof Error ? error.message : String(error) }); }
    if (attempt < MAX_ATTEMPTS) await wait(attempt === 1 ? 1000 : 2500);
  }
  throw lastError instanceof Error ? lastError : new Error(`${action} request failed.`);
}

function normalizeWorkingDays(value) {
  const input = Array.isArray(value) ? value : [1, 2, 3, 4, 5, 6];
  return [...new Set(input.map(Number).filter((day) => Number.isInteger(day) && day >= 1 && day <= 7))].sort((a, b) => a - b);
}

function normalizeTemplateRows(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 500).map((row) => ({
    route: String(row?.route || '').trim(), company: String(row?.company || '').trim(),
    truckName: String(row?.truckName || '').trim(), truckType: String(row?.truckType || '').trim(),
    driverName: String(row?.driverName || '').trim(), telDriver: String(row?.telDriver || '').trim(),
    project: String(row?.project || '').trim(), dropPoint: String(row?.dropPoint || '').trim(),
    planEta: String(row?.planEta || '').trim(), planEtd: String(row?.planEtd || '').trim(),
  }));
}

function validatePlanBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Request body is required.');
  const startDate = String(body.startDate || '').trim();
  const endDate = String(body.endDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new Error('startDate must use yyyy-MM-dd format.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) throw new Error('endDate must use yyyy-MM-dd format.');
  const workingDays = normalizeWorkingDays(body.workingDays);
  if (!workingDays.length) throw new Error('At least one working day is required.');
  const source = body.source === 'uploaded-file' ? 'uploaded-file' : 'master-plan';
  const templateRows = source === 'uploaded-file' ? normalizeTemplateRows(body.templateRows) : undefined;
  if (source === 'uploaded-file' && !templateRows.length) throw new Error('Uploaded file has no valid Plan rows.');
  return { startDate, endDate, workingDays, source, templateRows, fileName: body.fileName ? String(body.fileName) : undefined };
}

app.get('/', (req, res) => res.json({ status: 'success', service: 'ELIVE API', version: '6' }));
app.get('/health', (req, res) => res.json({ status: 'ok', version: '6', routes: ['/api/trucks', '/api/trucks/update', '/api/master-plan', '/api/plans/preview', '/api/plans/create', '/api/route-to-tpcap'] }));

app.get('/api/trucks', async (req, res) => {
  try {
    const age = Date.now() - truckCacheAt;
    if (truckCache && age <= FRESH_MS) return res.json({ ...truckCache, meta: { source: 'fresh-cache', cacheAgeSeconds: Math.round(age / 1000) } });
    if (!truckPromise) truckPromise = appsGet('getTrucks');
    try {
      const data = await truckPromise;
      truckCache = data; truckCacheAt = Date.now();
      return res.json({ ...data, meta: { source: 'google-apps-script', cacheAgeSeconds: 0 } });
    } catch (error) {
      if (truckCache && age <= STALE_MS) return res.json({ ...truckCache, meta: { source: 'stale-cache', cacheAgeSeconds: Math.round(age / 1000) } });
      throw error;
    } finally { truckPromise = null; }
  } catch (error) { return res.status(502).json({ success: false, error: error instanceof Error ? error.message : String(error) }); }
});

app.get('/api/master-plan', async (req, res) => {
  try {
    const age = Date.now() - masterCacheAt;
    if (req.query.refresh !== 'true' && masterCache && age <= FRESH_MS) return res.json({ ...masterCache, meta: { source: 'fresh-cache', cacheAgeSeconds: Math.round(age / 1000) } });
    try {
      const data = await appsGet('getMasterPlan'); masterCache = data; masterCacheAt = Date.now();
      return res.json({ ...data, meta: { source: 'google-apps-script', cacheAgeSeconds: 0 } });
    } catch (error) {
      if (masterCache && age <= STALE_MS) return res.json({ ...masterCache, meta: { source: 'stale-cache', cacheAgeSeconds: Math.round(age / 1000) } });
      throw error;
    }
  } catch (error) { return res.status(502).json({ success: false, error: error instanceof Error ? error.message : String(error) }); }
});

app.post('/api/plans/preview', async (req, res) => {
  try { return res.json(await appsPost('previewPlanPeriod', validatePlanBody(req.body))); }
  catch (error) { return res.status(400).json({ success: false, error: error instanceof Error ? error.message : String(error) }); }
});

app.post('/api/plans/create', async (req, res) => {
  try {
    const result = await appsPost('createPlanPeriod', validatePlanBody(req.body));
    truckCache = null; truckCacheAt = 0;
    return res.json(result);
  } catch (error) { return res.status(400).json({ success: false, error: error instanceof Error ? error.message : String(error) }); }
});

app.post('/api/trucks/update', async (req, res) => {
  try {
    const truckId = String(req.body?.truckId || '').trim();
    if (!truckId || !Array.isArray(req.body?.newRow)) throw new Error('truckId and newRow are required.');
    const result = await appsPost('updateTruck', { truckId, newRow: req.body.newRow });
    truckCache = null; truckCacheAt = 0;
    return res.json(result);
  } catch (error) { return res.status(400).json({ success: false, error: error instanceof Error ? error.message : String(error) }); }
});

app.get('/api/route-to-tpcap', async (req, res) => {
  try {
    const lat = Number(req.query.lat); const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('Valid lat and lng are required.');
    const url = `https://router.project-osrm.org/route/v1/driving/${lng},${lat};${TPCAP_LONGITUDE},${TPCAP_LATITUDE}?overview=full&geometries=geojson&steps=false`;
    const response = await fetchTimeout(url, { headers: { Accept: 'application/json', 'User-Agent': 'ELIVE-API/3.0' } }, 15000);
    const data = parseJson(await response.text(), 'Routing service returned invalid JSON.');
    if (!response.ok || data.code !== 'Ok' || !data.routes?.[0]) throw new Error(data.message || 'No route found.');
    const route = data.routes[0];
    const durationSeconds = Number(route.duration);
    const estimatedArrival = new Date(Date.now() + durationSeconds * 1000);
    return res.json({ success: true, origin: { latitude: lat, longitude: lng }, destination: { name: 'TPCAP', latitude: TPCAP_LATITUDE, longitude: TPCAP_LONGITUDE }, distanceMeters: Number(route.distance), distanceKilometers: Number((Number(route.distance) / 1000).toFixed(1)), durationSeconds, durationMinutes: Math.max(1, Math.round(durationSeconds / 60)), estimatedArrival: estimatedArrival.toISOString(), estimatedArrivalBangkok: estimatedArrival.toLocaleString('en-GB', { timeZone: 'Asia/Bangkok', hour12: false }), geometry: route.geometry });
  } catch (error) { return res.status(502).json({ success: false, error: error instanceof Error ? error.message : String(error) }); }
});

app.use((req, res) => res.status(404).json({ success: false, error: 'API route not found.', path: req.path }));
app.listen(PORT, '0.0.0.0', () => console.log(`ELIVE API version 6 is running on port ${PORT}`));
