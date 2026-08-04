import {
  GpsLocation,
  PerformanceStatus,
  Truck,
  TruckStatus,
} from '../types';

import { calculatePerformanceStatus } from '../utils';

export interface RouteGeometry {
  type: 'LineString';
  coordinates: number[][];
}

export interface RouteToTpcapResult {
  success: boolean;
  origin: { latitude: number; longitude: number };
  destination: { name: string; latitude: number; longitude: number };
  distanceMeters: number;
  distanceKilometers: number;
  durationSeconds: number;
  durationMinutes: number;
  estimatedArrival: string;
  estimatedArrivalBangkok: string;
  geometry: RouteGeometry;
}

export interface EliveDashboardData {
  trucks: Truck[];
  gpsLocations: GpsLocation[];
}

export interface MasterPlanRow {
  sheetRow?: number;
  route: string;
  company: string;
  truckName: string;
  truckType: string;
  driverName: string;
  telDriver: string;
  project: string;
  dropPoint: string;
  planEta: string;
  planEtd: string;
}

export interface MasterPlanValidationError {
  sheetRow: number;
  errors: string[];
}

export interface MasterPlanResponse {
  success: boolean;
  status: string;
  action?: string;
  source: string;
  sheetName: string;
  rowCount: number;
  rows: MasterPlanRow[];
  validationErrors: MasterPlanValidationError[];
  timestamp?: string;
  meta?: {
    source?: string;
    cacheAgeSeconds?: number;
    serverTime?: string;
  };
}

export type PlanSource = 'master-plan' | 'uploaded-file';

export interface PlanPeriodRequest {
  startDate: string;
  endDate: string;
  workingDays: number[];
  source?: PlanSource;
  templateRows?: MasterPlanRow[];
  fileName?: string;
}

export interface PlanPeriodPreview {
  success: boolean;
  startDate: string;
  endDate: string;
  calendarDayCount: number;
  workingDateCount: number;
  workingDays: number[];
  workingDayLabels: string[];
  masterPlanRowCount: number;
  totalCandidateRows: number;
  duplicateRowCount: number;
  newRowCount: number;
  currentMaximumCodeRun: string;
  startCodeRun: string;
  endCodeRun: string;
  duplicateHandling?: string;
  message: string;
}

export interface PlanCreationResult {
  success: boolean;
  startDate?: string;
  endDate?: string;
  workingDateCount?: number;
  totalCandidateRows?: number;
  createdRowCount: number;
  duplicateRowCount: number;
  firstOutputRow?: number | null;
  lastOutputRow?: number | null;
  startCodeRun: string;
  endCodeRun: string;
  durationMs: number;
  message: string;
}

interface PlanApiResponse<T> {
  success: boolean;
  status: string;
  action?: string;
  result: T;
  timestamp?: string;
  error?: string;
}

const DEFAULT_API_URL = 'https://elive-api.onrender.com';

export const getAppsScriptUrl = (): string => {
  const environment = (import.meta as any).env;
  const apiUrl = environment?.VITE_API_URL || DEFAULT_API_URL;

  return String(apiUrl)
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/\/+$/, '');
};

function parseGoogleSheetsTime(timeValue: unknown): string {
  if (timeValue === null || timeValue === undefined || timeValue === '') {
    return '';
  }

  const timeText = String(timeValue).trim();
  if (!timeText) return '';

  if (timeText.includes('T')) {
    const date = new Date(timeText);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleTimeString('en-GB', {
        timeZone: 'Asia/Bangkok',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    }
  }

  const timeMatch = timeText.match(/^(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    const hour = String(Number(timeMatch[1])).padStart(2, '0');
    return `${hour}:${timeMatch[2]}`;
  }

  return timeText;
}

function parseGoogleSheetsDate(dateValue: unknown): string {
  if (dateValue === null || dateValue === undefined || dateValue === '') {
    return '';
  }

  const dateText = String(dateValue).trim();
  if (!dateText) return '';

  const plainDateMatch = dateText.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (plainDateMatch) {
    return `${plainDateMatch[1]}-${plainDateMatch[2]}-${plainDateMatch[3]}`;
  }

  const date = new Date(dateText);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
  }

  return dateText;
}

function getApiError(data: unknown): string | null {
  if (typeof data === 'object' && data !== null && 'error' in data) {
    const errorValue = (data as { error?: unknown }).error;
    if (errorValue) return String(errorValue);
  }

  return null;
}

async function readJsonResponse(
  response: Response,
  invalidMessage: string
): Promise<any> {
  try {
    return await response.json();
  } catch (error) {
    console.error(invalidMessage, error);
    throw new Error(invalidMessage);
  }
}

async function fetchApiRequest(
  path: string,
  options?: RequestInit
): Promise<any> {
  const apiUrl = getAppsScriptUrl();
  if (!apiUrl) throw new Error('Render Backend API URL is not configured.');

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  let response: Response;

  try {
    response = await fetch(`${apiUrl}${normalizedPath}`, {
      cache: 'no-store',
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options?.headers || {}),
      },
    });
  } catch (error) {
    console.error(`Unable to connect to ELIVE API: ${normalizedPath}`, error);
    throw new Error('Unable to connect to the ELIVE Backend API.');
  }

  const data = await readJsonResponse(
    response,
    `ELIVE API returned invalid JSON from ${normalizedPath}.`
  );
  const apiError = getApiError(data);

  if (!response.ok || apiError) {
    throw new Error(
      apiError ||
        `ELIVE API request failed (${response.status} ${response.statusText})`
    );
  }

  return data;
}

async function fetchEliveApiData(): Promise<any> {
  const query = new URLSearchParams({ t: String(Date.now()) });
  const data = await fetchApiRequest(`/api/trucks?${query.toString()}`, {
    method: 'GET',
  });

  if (data.status !== 'success') {
    throw new Error('The ELIVE Backend API did not return success status.');
  }

  return data;
}

function validateDateText(value: string, fieldName: string): string {
  const normalizedValue = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
    throw new Error(`${fieldName} must use yyyy-MM-dd format.`);
  }

  const date = new Date(`${normalizedValue}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} is invalid.`);
  }

  return normalizedValue;
}

function normalizePlanWorkingDays(workingDays: number[]): number[] {
  if (!Array.isArray(workingDays)) return [1, 2, 3, 4, 5, 6];

  const uniqueDays = new Set<number>();
  for (const value of workingDays) {
    const dayNumber = Number(value);
    if (Number.isInteger(dayNumber) && dayNumber >= 1 && dayNumber <= 7) {
      uniqueDays.add(dayNumber);
    }
  }

  return Array.from(uniqueDays).sort((first, second) => first - second);
}

function validatePlanPeriodRequest(
  request: PlanPeriodRequest
): PlanPeriodRequest {
  if (!request || typeof request !== 'object') {
    throw new Error('Plan period request is required.');
  }

  const startDate = validateDateText(request.startDate, 'Start Date');
  const endDate = validateDateText(request.endDate, 'End Date');
  if (endDate < startDate) {
    throw new Error('End Date must not be earlier than Start Date.');
  }

  const workingDays = normalizePlanWorkingDays(request.workingDays);
  if (workingDays.length === 0) {
    throw new Error('Select at least one working day.');
  }

  const source: PlanSource =
    request.source === 'uploaded-file' ? 'uploaded-file' : 'master-plan';

  const templateRows = source === 'uploaded-file'
    ? (Array.isArray(request.templateRows) ? request.templateRows : [])
    : undefined;

  if (source === 'uploaded-file' && (!templateRows || templateRows.length === 0)) {
    throw new Error('Uploaded Plan file has no valid rows.');
  }

  return {
    startDate,
    endDate,
    workingDays,
    source,
    templateRows,
    fileName: request.fileName ? String(request.fileName) : undefined,
  };
}

export async function fetchMasterPlan(
  forceRefresh = false
): Promise<MasterPlanResponse> {
  const query = new URLSearchParams({
    refresh: forceRefresh ? 'true' : 'false',
    t: String(Date.now()),
  });

  const data = await fetchApiRequest(`/api/master-plan?${query.toString()}`, {
    method: 'GET',
  });

  if (data.success !== true) {
    throw new Error('The server did not return Master Plan successfully.');
  }

  const rows: MasterPlanRow[] = (Array.isArray(data.rows) ? data.rows : []).map(
    (row: any) => ({
      sheetRow: Number.isFinite(Number(row.sheetRow))
        ? Number(row.sheetRow)
        : undefined,
      route: String(row.route || '').trim(),
      company: String(row.company || '').trim(),
      truckName: String(row.truckName || '').trim(),
      truckType: String(row.truckType || '').trim(),
      driverName: String(row.driverName || '').trim(),
      telDriver: String(row.telDriver || '').trim(),
      project: String(row.project || '').trim(),
      dropPoint: String(row.dropPoint || '').trim(),
      planEta: parseGoogleSheetsTime(row.planEta),
      planEtd: parseGoogleSheetsTime(row.planEtd),
    })
  );

  const validationErrors: MasterPlanValidationError[] = Array.isArray(
    data.validationErrors
  )
    ? data.validationErrors.map((item: any) => ({
        sheetRow: Number(item.sheetRow || 0),
        errors: Array.isArray(item.errors)
          ? item.errors.map((error: unknown) => String(error))
          : [],
      }))
    : [];

  return {
    success: true,
    status: String(data.status || 'success'),
    action: data.action ? String(data.action) : undefined,
    source: String(data.source || 'master-plan'),
    sheetName: String(data.sheetName || 'Master Plan'),
    rowCount: Number.isFinite(Number(data.rowCount))
      ? Number(data.rowCount)
      : rows.length,
    rows,
    validationErrors,
    timestamp: data.timestamp ? String(data.timestamp) : undefined,
    meta:
      data.meta && typeof data.meta === 'object'
        ? {
            source: data.meta.source ? String(data.meta.source) : undefined,
            cacheAgeSeconds: Number.isFinite(
              Number(data.meta.cacheAgeSeconds)
            )
              ? Number(data.meta.cacheAgeSeconds)
              : undefined,
            serverTime: data.meta.serverTime
              ? String(data.meta.serverTime)
              : undefined,
          }
        : undefined,
  };
}

export async function previewPlanPeriod(
  request: PlanPeriodRequest
): Promise<PlanPeriodPreview> {
  const validRequest = validatePlanPeriodRequest(request);
  const data: PlanApiResponse<PlanPeriodPreview> = await fetchApiRequest(
    '/api/plans/preview',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validRequest),
    }
  );

  if (data.success !== true || !data.result) {
    throw new Error(
      data.error || 'The server did not return Plan preview successfully.'
    );
  }

  const result = data.result;
  return {
    success: true,
    startDate: String(result.startDate || validRequest.startDate),
    endDate: String(result.endDate || validRequest.endDate),
    calendarDayCount: Number(result.calendarDayCount || 0),
    workingDateCount: Number(result.workingDateCount || 0),
    workingDays: Array.isArray(result.workingDays)
      ? result.workingDays.map(Number)
      : validRequest.workingDays,
    workingDayLabels: Array.isArray(result.workingDayLabels)
      ? result.workingDayLabels.map(String)
      : [],
    masterPlanRowCount: Number(result.masterPlanRowCount || 0),
    totalCandidateRows: Number(result.totalCandidateRows || 0),
    duplicateRowCount: Number(result.duplicateRowCount || 0),
    newRowCount: Number(result.newRowCount || 0),
    currentMaximumCodeRun: String(result.currentMaximumCodeRun || '-'),
    startCodeRun: String(result.startCodeRun || '-'),
    endCodeRun: String(result.endCodeRun || '-'),
    duplicateHandling: result.duplicateHandling
      ? String(result.duplicateHandling)
      : 'SKIP',
    message: String(result.message || 'Preview completed.'),
  };
}

export async function createPlanPeriod(
  request: PlanPeriodRequest
): Promise<PlanCreationResult> {
  const validRequest = validatePlanPeriodRequest(request);
  const data: PlanApiResponse<PlanCreationResult> = await fetchApiRequest(
    '/api/plans/create',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validRequest),
    }
  );

  if (data.success !== true || !data.result) {
    throw new Error(data.error || 'The server did not confirm Plan creation.');
  }

  const result = data.result;
  return {
    success: true,
    startDate: result.startDate
      ? String(result.startDate)
      : validRequest.startDate,
    endDate: result.endDate ? String(result.endDate) : validRequest.endDate,
    workingDateCount: Number.isFinite(Number(result.workingDateCount))
      ? Number(result.workingDateCount)
      : undefined,
    totalCandidateRows: Number.isFinite(Number(result.totalCandidateRows))
      ? Number(result.totalCandidateRows)
      : undefined,
    createdRowCount: Number(result.createdRowCount || 0),
    duplicateRowCount: Number(result.duplicateRowCount || 0),
    firstOutputRow:
      result.firstOutputRow === null || result.firstOutputRow === undefined
        ? null
        : Number(result.firstOutputRow),
    lastOutputRow:
      result.lastOutputRow === null || result.lastOutputRow === undefined
        ? null
        : Number(result.lastOutputRow),
    startCodeRun: String(result.startCodeRun || '-'),
    endCodeRun: String(result.endCodeRun || '-'),
    durationMs: Number(result.durationMs || 0),
    message: String(result.message || 'Plan created successfully.'),
  };
}

function mapTruckStatus(currentStatus: string): TruckStatus {
  const normalizedStatus = String(currentStatus || '').trim().toLowerCase();

  if (
    normalizedStatus.includes('complete') ||
    normalizedStatus.includes('completed') ||
    normalizedStatus.includes('เสร็จ')
  ) {
    return 'COMPLETED';
  }

  if (
    normalizedStatus.includes('truck out') ||
    normalizedStatus.includes('ออก')
  ) {
    return 'TRUCK_OUT';
  }

  if (
    normalizedStatus.includes('unloading at tpcap') ||
    normalizedStatus.includes('arrive') ||
    normalizedStatus.includes('arrived') ||
    normalizedStatus.includes('ถึง')
  ) {
    return 'UNLOADING_AT_TPCAP';
  }

  if (normalizedStatus.includes('dock in')) return 'DOCK_IN';

  if (
    normalizedStatus.includes('กำลังลงงาน') ||
    normalizedStatus.includes('dock') ||
    normalizedStatus.includes('unloading') ||
    normalizedStatus.includes('unload at tpcap')
  ) {
    return 'UNLOADING';
  }

  if (
    normalizedStatus.includes('wait') ||
    normalizedStatus.includes('waiting') ||
    normalizedStatus.includes('รอ')
  ) {
    return 'WAITING_AREA';
  }

  return 'TRAVELING';
}

function mapPerformanceStatus(efficiencyStatus: string): PerformanceStatus {
  const normalizedPerformance = String(efficiencyStatus || '')
    .trim()
    .toLowerCase();

  if (
    normalizedPerformance.includes('delay') ||
    normalizedPerformance.includes('delayed') ||
    normalizedPerformance.includes('ดีเล')
  ) {
    return 'DELAY';
  }

  if (
    normalizedPerformance.includes('early') ||
    normalizedPerformance.includes('ก่อน') ||
    normalizedPerformance.includes('ไว')
  ) {
    return 'EARLY';
  }

  if (
    normalizedPerformance.includes('warning') ||
    normalizedPerformance.includes('เตือน')
  ) {
    return 'WARNING';
  }

  return 'ON_PLAN';
}

export async function fetchTrucksFromSheets(sourceData?: any): Promise<Truck[]> {
  const data = sourceData ?? (await fetchEliveApiData());
  const planData: any[][] = Array.isArray(data.plan) ? data.plan : [];
  const actualData: any[][] = Array.isArray(data.actual) ? data.actual : [];
  const actualMap = new Map<string, any[]>();

  for (const row of actualData.slice(1)) {
    if (!Array.isArray(row)) continue;
    const codeRun = String(row[0] || '').trim();
    if (codeRun) actualMap.set(codeRun, row);
  }

  const trucks: Truck[] = [];

  for (const row of planData.slice(1)) {
    if (!Array.isArray(row)) continue;

    const codeRun = String(row[0] || '').trim();
    if (!codeRun) continue;

    const actualRow = actualMap.get(codeRun);
    const planDate = parseGoogleSheetsDate(row[1]);
    const planEta = parseGoogleSheetsTime(row[10]);
    const planEtd = parseGoogleSheetsTime(row[11]);

    let currentStatus = 'TRAVELING';
    let efficiencyStatus = 'ON_PLAN';
    let stampEta = '';
    let stampEtd = '';
    let actionProblem = '';
    let actionCountermeasure = '';
    let actionResponsible = '';
    let actionStatus = '';

    if (actualRow) {
      currentStatus = String(actualRow[1] || 'TRAVELING');
      efficiencyStatus = String(actualRow[2] || 'ON_PLAN');
      stampEta = parseGoogleSheetsTime(actualRow[4]);
      stampEtd = parseGoogleSheetsTime(actualRow[5]);
      actionProblem = String(actualRow[6] || '');
      actionCountermeasure = String(actualRow[7] || '');
      actionResponsible = String(actualRow[8] || '');
      actionStatus = String(actualRow[9] || '');
    }

    const mappedStatus = mapTruckStatus(currentStatus);
    let performanceStatus = mapPerformanceStatus(efficiencyStatus);

    if (stampEta && planEta && planEtd) {
      performanceStatus = calculatePerformanceStatus(planEta, planEtd, stampEta);
    }

    trucks.push({
      id: codeRun,
      planDate,
      route: String(row[2] || ''),
      supplierName: String(row[3] || ''),
      licensePlate: String(row[4] || ''),
      truckType: String(row[5] || ''),
      driverName: String(row[6] || ''),
      phone: String(row[7] || ''),
      dropPoint: String(row[9] || ''),
      planEta,
      planEtd,
      status: mappedStatus,
      performanceStatus,
      stampEta,
      stampEtd,
      actionProblem,
      actionCountermeasure,
      actionResponsible,
      actionStatus,
      lastUpdated: new Date().toLocaleTimeString('en-GB', {
        timeZone: 'Asia/Bangkok',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }),
    });
  }

  return trucks;
}

export async function updateTruckInSheets(
  truckId: string,
  updates: Partial<Truck>,
  currentTruck: Truck
): Promise<void> {
  if (!truckId) throw new Error('Truck ID is required.');

  const datetimeUpdate = new Date().toLocaleString('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour12: false,
  });

  const currentStatus =
    updates.status !== undefined ? updates.status : currentTruck.status;
  const stampEta =
    updates.stampEta !== undefined ? updates.stampEta : currentTruck.stampEta;
  const stampEtd =
    updates.stampEtd !== undefined ? updates.stampEtd : currentTruck.stampEtd;

  let efficiencyStatus: PerformanceStatus =
    updates.performanceStatus !== undefined
      ? updates.performanceStatus
      : currentTruck.performanceStatus;

  if (stampEta && currentTruck.planEta && currentTruck.planEtd) {
    efficiencyStatus = calculatePerformanceStatus(
      currentTruck.planEta,
      currentTruck.planEtd,
      stampEta
    );
  }

  const newRow = [
    truckId,
    currentStatus || '',
    efficiencyStatus || '',
    currentTruck.planEta || '',
    stampEta || '',
    stampEtd || '',
    updates.actionProblem !== undefined
      ? updates.actionProblem
      : currentTruck.actionProblem || '',
    updates.actionCountermeasure !== undefined
      ? updates.actionCountermeasure
      : currentTruck.actionCountermeasure || '',
    updates.actionResponsible !== undefined
      ? updates.actionResponsible
      : currentTruck.actionResponsible || '',
    updates.actionStatus !== undefined
      ? updates.actionStatus
      : currentTruck.actionStatus || '',
    'System User',
    datetimeUpdate,
  ];

  const result = await fetchApiRequest('/api/trucks/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ truckId, newRow }),
  });

  if (result.success !== true) {
    throw new Error('The server did not confirm the update.');
  }
}

function normalizeGpsHeader(value: unknown): string {
  return String(value || '').trim().toLowerCase().replace(/\s/g, '');
}

function findGpsColumn(headers: string[], possibleNames: string[]): number {
  return headers.findIndex((header) =>
    possibleNames.some((name) =>
      header.includes(normalizeGpsHeader(name))
    )
  );
}

function parseGpsNumber(value: unknown): number {
  return Number(String(value ?? '').trim().replace(/\s/g, '').replace(',', '.'));
}

function readGpsCell(row: any[], columnIndex: number): string {
  if (columnIndex < 0) return '';
  return String(row[columnIndex] ?? '').trim();
}

export async function fetchGpsLocations(
  sourceData?: any
): Promise<GpsLocation[]> {
  const data = sourceData ?? (await fetchEliveApiData());
  const gpsData: any[][] = Array.isArray(data.gps) ? data.gps : [];
  if (gpsData.length <= 1) return [];

  const headers = gpsData[0].map(normalizeGpsHeader);
  const gpsIdIndex = findGpsColumn(headers, ['GPS ID', 'GPSID', 'รหัส GPS']);
  const licensePlateIndex = findGpsColumn(headers, [
    'ทะเบียนรถ',
    'License Plate',
    'Truck Name',
    'Plate',
  ]);
  const latitudeIndex = findGpsColumn(headers, ['ละติจูด', 'Latitude', 'Lat']);
  const longitudeIndex = findGpsColumn(headers, [
    'ลองจิจูด',
    'Longitude',
    'Lng',
    'Lon',
  ]);
  const speedIndex = findGpsColumn(headers, ['ความเร็ว', 'Speed']);
  const headingIndex = findGpsColumn(headers, [
    'ทิศทาง',
    'Heading',
    'Direction',
  ]);
  const locationNameIndex = findGpsColumn(headers, [
    'ชื่อสถานที่',
    'สถานที่',
    'Location',
  ]);
  const gpsTimeIndex = findGpsColumn(headers, [
    'เวลา GPS',
    'GPS Time',
    'GPS Datetime',
  ]);
  const gpsStatusIndex = findGpsColumn(headers, ['สถานะ', 'Status']);
  const receivedAtIndex = findGpsColumn(headers, [
    'เวลาที่ระบบดึงข้อมูล',
    'เวลารับข้อมูล',
    'Received At',
    'Update Time',
  ]);

  if (latitudeIndex === -1 || longitudeIndex === -1) {
    throw new Error('ไม่พบคอลัมน์ละติจูดหรือลองจิจูดในข้อมูล GPS');
  }

  const locations: GpsLocation[] = [];

  for (const row of gpsData.slice(1)) {
    if (!Array.isArray(row)) continue;

    const gpsId = readGpsCell(row, gpsIdIndex);
    const licensePlate = readGpsCell(row, licensePlateIndex);
    const latitude = parseGpsNumber(row[latitudeIndex]);
    const longitude = parseGpsNumber(row[longitudeIndex]);
    const speed = speedIndex >= 0 ? parseGpsNumber(row[speedIndex]) : 0;
    const heading = headingIndex >= 0 ? parseGpsNumber(row[headingIndex]) : 0;

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      continue;
    }

    locations.push({
      gpsId: gpsId || `${latitude},${longitude}`,
      licensePlate,
      latitude,
      longitude,
      speed: Number.isFinite(speed) ? speed : 0,
      heading: Number.isFinite(heading) ? heading : 0,
      locationName: readGpsCell(row, locationNameIndex),
      gpsTime: readGpsCell(row, gpsTimeIndex),
      gpsStatus: readGpsCell(row, gpsStatusIndex),
      receivedAt: readGpsCell(row, receivedAtIndex),
    });
  }

  return locations;
}

export async function fetchRouteToTpcap(
  latitude: number,
  longitude: number
): Promise<RouteToTpcapResult> {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error('Latitude is invalid.');
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error('Longitude is invalid.');
  }

  const query = new URLSearchParams({
    lat: String(latitude),
    lng: String(longitude),
    t: String(Date.now()),
  });
  const data = await fetchApiRequest(
    `/api/route-to-tpcap?${query.toString()}`,
    { method: 'GET' }
  );

  if (data.success !== true) {
    throw new Error('ระบบไม่สามารถยืนยันผลการคำนวณเส้นทางได้');
  }

  const distanceMeters = Number(data.distanceMeters);
  const distanceKilometers = Number(data.distanceKilometers);
  const durationSeconds = Number(data.durationSeconds);
  const durationMinutes = Number(data.durationMinutes);

  if (
    !Number.isFinite(distanceMeters) ||
    !Number.isFinite(distanceKilometers) ||
    !Number.isFinite(durationSeconds) ||
    !Number.isFinite(durationMinutes)
  ) {
    throw new Error('ข้อมูลระยะทางหรือเวลาเดินทางไม่ถูกต้อง');
  }

  const geometry = data.geometry;
  if (
    !geometry ||
    geometry.type !== 'LineString' ||
    !Array.isArray(geometry.coordinates)
  ) {
    throw new Error('ไม่พบข้อมูลเส้นทางสำหรับแสดงบนแผนที่');
  }

  const validCoordinates: number[][] = geometry.coordinates
    .filter(
      (coordinate: unknown): coordinate is unknown[] =>
        Array.isArray(coordinate) && coordinate.length >= 2
    )
    .map((coordinate) => [Number(coordinate[0]), Number(coordinate[1])])
    .filter(([routeLongitude, routeLatitude]) =>
      Number.isFinite(routeLongitude) &&
      Number.isFinite(routeLatitude) &&
      routeLongitude >= -180 &&
      routeLongitude <= 180 &&
      routeLatitude >= -90 &&
      routeLatitude <= 90
    );

  if (validCoordinates.length < 2) {
    throw new Error('ข้อมูลเส้นทางมีจำนวนพิกัดไม่เพียงพอ');
  }

  const originLatitude = Number(data.origin?.latitude);
  const originLongitude = Number(data.origin?.longitude);
  const destinationLatitude = Number(data.destination?.latitude);
  const destinationLongitude = Number(data.destination?.longitude);

  if (
    !Number.isFinite(originLatitude) ||
    !Number.isFinite(originLongitude) ||
    !Number.isFinite(destinationLatitude) ||
    !Number.isFinite(destinationLongitude)
  ) {
    throw new Error('ข้อมูลพิกัดต้นทางหรือปลายทางไม่ถูกต้อง');
  }

  return {
    success: true,
    origin: { latitude: originLatitude, longitude: originLongitude },
    destination: {
      name: String(data.destination?.name || 'TPCAP'),
      latitude: destinationLatitude,
      longitude: destinationLongitude,
    },
    distanceMeters,
    distanceKilometers,
    durationSeconds,
    durationMinutes,
    estimatedArrival: String(data.estimatedArrival || ''),
    estimatedArrivalBangkok: String(data.estimatedArrivalBangkok || ''),
    geometry: { type: 'LineString', coordinates: validCoordinates },
  };
}

export async function fetchEliveDashboardData(): Promise<EliveDashboardData> {
  const sourceData = await fetchEliveApiData();
  const trucks = await fetchTrucksFromSheets(sourceData);
  const gpsLocations = await fetchGpsLocations(sourceData);
  return { trucks, gpsLocations };
}
