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

export type EditableMasterPlanRow = Omit<MasterPlanRow, 'sheetRow'>;

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

export interface MasterPlanMutationResult {
  success: boolean;
  message: string;
  action:
    | 'createMasterPlanRow'
    | 'updateMasterPlanRow'
    | 'deleteMasterPlanRow';
  sheetRow?: number;
  row?: MasterPlanRow;
  previousRow?: MasterPlanRow;
  deletedRow?: MasterPlanRow;
  rowCount?: number;
}

export type PlanSource = 'master-plan' | 'uploaded-file';
export type PlanRemark = 'REGULAR' | 'EXTRA' | 'CANCEL';

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
  source?: PlanSource;
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

export interface DailyPlan {
  rowNumber?: number;
  codeRun: string;
  date: string;
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
  remark: PlanRemark;
  workDetail: string;
  workDetailConfirmed: boolean;
}

export interface EditablePlan {
  date: string;
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
  remark?: PlanRemark;
  workDetail?: string;
}

export interface DailyPlansResult {
  success: boolean;
  date: string;
  rowCount: number;
  activeCount: number;
  regularCount: number;
  extraCount: number;
  cancelCount: number;
  rows: DailyPlan[];
}

export interface DailyPlanMutationResult {
  success: boolean;
  message: string;
  codeRun: string;
  rowNumber?: number;
  remark?: PlanRemark;
  plan?: DailyPlan;
}

interface PlanApiResponse<T> {
  success: boolean;
  status: string;
  action?: string;
  result: T;
  timestamp?: string;
  error?: string;
}

export type EliveUserRole =
  | 'TV_VIEWER'
  | 'OPERATOR'
  | 'PLANNER'
  | 'SUPERVISOR'
  | 'ADMIN';

export interface EliveAuthUser {
  username: string;
  role: EliveUserRole;
}

export interface EliveAuthSession {
  username?: string;
  role?: EliveUserRole;
  expiresAt: string;
}

export interface EliveAuthResult {
  success: boolean;
  authenticated?: boolean;
  user?: EliveAuthUser;
  session?: EliveAuthSession;
  compatibilityMode?: boolean;
  timestamp?: string;
  message?: string;
}

export class EliveApiError extends Error {
  status: number;
  path: string;
  data: unknown;

  constructor(
    message: string,
    status: number,
    path: string,
    data: unknown
  ) {
    super(message);
    this.name = 'EliveApiError';
    this.status = status;
    this.path = path;
    this.data = data;
  }
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

function parseGoogleSheetsTime(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';

  if (typeof value === 'number' && Number.isFinite(value)) {
    const totalMinutes = ((Math.round(value * 1440) % 1440) + 1440) % 1440;
    return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(
      totalMinutes % 60
    ).padStart(2, '0')}`;
  }

  const text = String(value).trim();
  if (!text) return '';

  if (text.includes('T')) {
    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleTimeString('en-GB', {
        timeZone: 'Asia/Bangkok',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    }
  }

  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return '';

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return '';

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function parseGoogleSheetsDate(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';

  const text = String(value).trim();
  if (!text) return '';

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    return `${slash[3]}-${String(Number(slash[2])).padStart(2, '0')}-${String(
      Number(slash[1])
    ).padStart(2, '0')}`;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime())
    ? text
    : date.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
}

function normalizePlanRemark(value: unknown): PlanRemark {
  const remark = String(value || '').trim().toUpperCase();
  if (remark === 'EXTRA') return 'EXTRA';
  if (remark === 'CANCEL') return 'CANCEL';
  return 'REGULAR';
}

function getApiError(data: unknown): string | null {
  if (typeof data === 'object' && data !== null && 'error' in data) {
    const value = (data as { error?: unknown }).error;
    return value ? String(value) : null;
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
      credentials: 'include',
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
    throw new EliveApiError(
      apiError ||
        `ELIVE API request failed (${response.status} ${response.statusText})`,
      response.status,
      normalizedPath,
      data
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
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error(`${fieldName} must use yyyy-MM-dd format.`);
  }

  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error(`${fieldName} is invalid.`);
  }

  return text;
}

function validatePlanTime(value: string, fieldName: string): string {
  const time = parseGoogleSheetsTime(value);
  if (!time) throw new Error(`${fieldName} must use HH:mm format.`);
  return time;
}

function normalizePlanWorkingDays(value: number[]): number[] {
  const input = Array.isArray(value) ? value : [1, 2, 3, 4, 5, 6];

  return [...new Set(input.map(Number))]
    .filter(day => Number.isInteger(day) && day >= 1 && day <= 7)
    .sort((first, second) => first - second);
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
  if (!workingDays.length) throw new Error('Select at least one working day.');

  const source: PlanSource =
    request.source === 'uploaded-file' ? 'uploaded-file' : 'master-plan';

  const templateRows =
    source === 'uploaded-file'
      ? Array.isArray(request.templateRows)
        ? request.templateRows
        : []
      : undefined;

  if (source === 'uploaded-file' && !templateRows?.length) {
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

function validateEditablePlan(plan: EditablePlan): EditablePlan {
  if (!plan || typeof plan !== 'object') {
    throw new Error('Plan data is required.');
  }

  const validPlan: EditablePlan = {
    date: validateDateText(plan.date, 'Date'),
    route: String(plan.route || '').trim(),
    company: String(plan.company || '').trim(),
    truckName: String(plan.truckName || '').trim(),
    truckType: String(plan.truckType || '').trim(),
    driverName: String(plan.driverName || '').trim(),
    telDriver: String(plan.telDriver || '').trim(),
    project: String(plan.project || '').trim(),
    dropPoint: String(plan.dropPoint || '').trim(),
    planEta: validatePlanTime(plan.planEta, 'Plan ETA'),
    planEtd: validatePlanTime(plan.planEtd, 'Plan ETD'),
    remark: plan.remark ? normalizePlanRemark(plan.remark) : undefined,
    workDetail: String(plan.workDetail || '').trim(),
  };

  if (!validPlan.route) throw new Error('Route is required.');
  if (!validPlan.company) throw new Error('Company is required.');
  if (!validPlan.truckName) throw new Error('Truck Name is required.');
  if (!validPlan.truckType) throw new Error('Truck Type is required.');
  if (!validPlan.project) throw new Error('Project is required.');
  if (!validPlan.dropPoint) throw new Error('Drop Point is required.');

  return validPlan;
}

function validateMasterPlanRow(
  row: EditableMasterPlanRow
): EditableMasterPlanRow {
  if (!row || typeof row !== 'object') {
    throw new Error('Master Plan data is required.');
  }

  const validRow: EditableMasterPlanRow = {
    route: String(row.route || '').trim(),
    company: String(row.company || '').trim(),
    truckName: String(row.truckName || '').trim(),
    truckType: String(row.truckType || '').trim(),
    driverName: String(row.driverName || '').trim(),
    telDriver: String(row.telDriver || '').trim(),
    project: String(row.project || '').trim(),
    dropPoint: String(row.dropPoint || '').trim(),
    planEta: validatePlanTime(row.planEta, 'Plan ETA'),
    planEtd: validatePlanTime(row.planEtd, 'Plan ETD'),
  };

  if (!validRow.route) throw new Error('Route is required.');
  if (!validRow.company) throw new Error('Company is required.');
  if (!validRow.truckName) throw new Error('Truck Name is required.');
  if (!validRow.truckType) throw new Error('Truck Type is required.');
  if (!validRow.project) throw new Error('Project is required.');
  if (!validRow.dropPoint) throw new Error('Drop Point is required.');

  return validRow;
}

function validateMasterPlanSheetRow(value: number): number {
  const sheetRow = Number(value);
  if (!Number.isInteger(sheetRow) || sheetRow < 2) {
    throw new Error('Master Plan sheet row is invalid.');
  }
  return sheetRow;
}

function normalizeCodeRun(value: string): string {
  const codeRun = String(value || '').trim().toUpperCase();
  if (!/^A\d+$/.test(codeRun)) {
    throw new Error('Code run format is invalid.');
  }
  return codeRun;
}

function mapMasterPlanRow(value: any): MasterPlanRow {
  return {
    sheetRow: Number.isFinite(Number(value?.sheetRow))
      ? Number(value.sheetRow)
      : undefined,
    route: String(value?.route || '').trim(),
    company: String(value?.company || '').trim(),
    truckName: String(value?.truckName || '').trim(),
    truckType: String(value?.truckType || '').trim(),
    driverName: String(value?.driverName || '').trim(),
    telDriver: String(value?.telDriver || '').trim(),
    project: String(value?.project || '').trim(),
    dropPoint: String(value?.dropPoint || '').trim(),
    planEta: parseGoogleSheetsTime(value?.planEta),
    planEtd: parseGoogleSheetsTime(value?.planEtd),
  };
}

function mapDailyPlan(value: any): DailyPlan {
  return {
    rowNumber: Number.isFinite(Number(value?.rowNumber))
      ? Number(value.rowNumber)
      : undefined,
    codeRun: String(value?.codeRun || '').trim().toUpperCase(),
    date: parseGoogleSheetsDate(value?.date),
    route: String(value?.route || '').trim(),
    company: String(value?.company || '').trim(),
    truckName: String(value?.truckName || '').trim(),
    truckType: String(value?.truckType || '').trim(),
    driverName: String(value?.driverName || '').trim(),
    telDriver: String(value?.telDriver || '').trim(),
    project: String(value?.project || '').trim(),
    dropPoint: String(value?.dropPoint || '').trim(),
    planEta: parseGoogleSheetsTime(value?.planEta),
    planEtd: parseGoogleSheetsTime(value?.planEtd),
    remark: normalizePlanRemark(value?.remark),
    workDetail: String(value?.workDetail || '').trim(),
    workDetailConfirmed: String(value?.workDetailConfirmed || '').trim().toUpperCase() === 'CONFIRMED',
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
    mapMasterPlanRow
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
            cacheAgeSeconds: Number.isFinite(Number(data.meta.cacheAgeSeconds))
              ? Number(data.meta.cacheAgeSeconds)
              : undefined,
            serverTime: data.meta.serverTime
              ? String(data.meta.serverTime)
              : undefined,
          }
        : undefined,
  };
}

export async function createMasterPlanRow(
  row: EditableMasterPlanRow
): Promise<MasterPlanMutationResult> {
  const validRow = validateMasterPlanRow(row);
  const data: PlanApiResponse<MasterPlanMutationResult> = await fetchApiRequest(
    '/api/master-plan/rows',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ row: validRow }),
    }
  );

  if (data.success !== true || !data.result) {
    throw new Error(
      data.error || 'The server did not confirm Master Plan creation.'
    );
  }

  const result = data.result;
  return {
    success: true,
    action: 'createMasterPlanRow',
    message: String(result.message || 'เพิ่ม Master Plan สำเร็จ'),
    sheetRow: Number.isFinite(Number(result.sheetRow))
      ? Number(result.sheetRow)
      : result.row?.sheetRow,
    row: result.row ? mapMasterPlanRow(result.row) : undefined,
  };
}

export async function updateMasterPlanRow(
  sheetRow: number,
  row: EditableMasterPlanRow
): Promise<MasterPlanMutationResult> {
  const validSheetRow = validateMasterPlanSheetRow(sheetRow);
  const validRow = validateMasterPlanRow(row);
  const data: PlanApiResponse<MasterPlanMutationResult> = await fetchApiRequest(
    `/api/master-plan/rows/${encodeURIComponent(String(validSheetRow))}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ row: validRow }),
    }
  );

  if (data.success !== true || !data.result) {
    throw new Error(
      data.error || 'The server did not confirm Master Plan update.'
    );
  }

  const result = data.result;
  return {
    success: true,
    action: 'updateMasterPlanRow',
    message: String(
      result.message || `แก้ไข Master Plan แถว ${validSheetRow} สำเร็จ`
    ),
    sheetRow: Number.isFinite(Number(result.sheetRow))
      ? Number(result.sheetRow)
      : validSheetRow,
    previousRow: result.previousRow
      ? mapMasterPlanRow(result.previousRow)
      : undefined,
    row: result.row
      ? mapMasterPlanRow(result.row)
      : { sheetRow: validSheetRow, ...validRow },
  };
}

export async function deleteMasterPlanRow(
  sheetRow: number
): Promise<MasterPlanMutationResult> {
  const validSheetRow = validateMasterPlanSheetRow(sheetRow);
  const data: PlanApiResponse<MasterPlanMutationResult> = await fetchApiRequest(
    `/api/master-plan/rows/${encodeURIComponent(String(validSheetRow))}`,
    { method: 'DELETE' }
  );

  if (data.success !== true || !data.result) {
    throw new Error(
      data.error || 'The server did not confirm Master Plan deletion.'
    );
  }

  const result = data.result;
  return {
    success: true,
    action: 'deleteMasterPlanRow',
    message: String(
      result.message || `ลบ Master Plan แถว ${validSheetRow} สำเร็จ`
    ),
    sheetRow: Number.isFinite(Number(result.sheetRow))
      ? Number(result.sheetRow)
      : validSheetRow,
    deletedRow: result.deletedRow
      ? mapMasterPlanRow(result.deletedRow)
      : undefined,
    rowCount: Number.isFinite(Number(result.rowCount))
      ? Number(result.rowCount)
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
    source: validRequest.source,
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

export async function fetchDailyPlans(
  date: string
): Promise<DailyPlansResult> {
  const validDate = validateDateText(date, 'Date');
  const query = new URLSearchParams({ date: validDate, t: String(Date.now()) });
  const data: PlanApiResponse<DailyPlansResult> = await fetchApiRequest(
    `/api/plans/daily?${query.toString()}`,
    { method: 'GET' }
  );

  if (data.success !== true || !data.result) {
    throw new Error(
      data.error || 'The server did not return daily Plans successfully.'
    );
  }

  const rows = Array.isArray(data.result.rows)
    ? data.result.rows.map(mapDailyPlan)
    : [];

  return {
    success: true,
    date: String(data.result.date || validDate),
    rowCount: Number(data.result.rowCount ?? rows.length),
    activeCount: Number(
      data.result.activeCount ?? rows.filter(row => row.remark !== 'CANCEL').length
    ),
    regularCount: Number(
      data.result.regularCount ??
        rows.filter(row => row.remark === 'REGULAR').length
    ),
    extraCount: Number(
      data.result.extraCount ?? rows.filter(row => row.remark === 'EXTRA').length
    ),
    cancelCount: Number(
      data.result.cancelCount ?? rows.filter(row => row.remark === 'CANCEL').length
    ),
    rows,
  };
}

export async function createExtraPlan(
  plan: EditablePlan
): Promise<DailyPlanMutationResult> {
  const validPlan = validateEditablePlan({ ...plan, remark: 'EXTRA' });
  const data: PlanApiResponse<DailyPlanMutationResult> = await fetchApiRequest(
    '/api/plans/extra',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: validPlan }),
    }
  );

  if (data.success !== true || !data.result) {
    throw new Error(
      data.error || 'The server did not confirm Extra Plan creation.'
    );
  }

  return {
    success: true,
    message: String(data.result.message || 'เพิ่ม Extra Plan สำเร็จ'),
    codeRun: String(data.result.codeRun || ''),
    rowNumber: Number.isFinite(Number(data.result.rowNumber))
      ? Number(data.result.rowNumber)
      : undefined,
    remark: 'EXTRA',
    plan: data.result.plan ? mapDailyPlan(data.result.plan) : undefined,
  };
}

export async function updateDailyPlan(
  codeRun: string,
  plan: EditablePlan
): Promise<DailyPlanMutationResult> {
  const validCodeRun = normalizeCodeRun(codeRun);
  const validPlan = validateEditablePlan(plan);
  const data: PlanApiResponse<DailyPlanMutationResult> = await fetchApiRequest(
    `/api/plans/${encodeURIComponent(validCodeRun)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: validPlan }),
    }
  );

  if (data.success !== true || !data.result) {
    throw new Error(data.error || 'The server did not confirm Plan update.');
  }

  return {
    success: true,
    message: String(data.result.message || 'แก้ไข Plan สำเร็จ'),
    codeRun: String(data.result.codeRun || validCodeRun),
    rowNumber: Number.isFinite(Number(data.result.rowNumber))
      ? Number(data.result.rowNumber)
      : undefined,
    plan: data.result.plan ? mapDailyPlan(data.result.plan) : undefined,
  };
}

export async function cancelDailyPlan(
  codeRun: string
): Promise<DailyPlanMutationResult> {
  const validCodeRun = normalizeCodeRun(codeRun);
  const data: PlanApiResponse<DailyPlanMutationResult> = await fetchApiRequest(
    `/api/plans/${encodeURIComponent(validCodeRun)}/cancel`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }
  );

  if (data.success !== true || !data.result) {
    throw new Error(
      data.error || 'The server did not confirm Plan cancellation.'
    );
  }

  return {
    success: true,
    message: String(data.result.message || 'ยกเลิก Plan สำเร็จ'),
    codeRun: String(data.result.codeRun || validCodeRun),
    remark: 'CANCEL',
  };
}

export async function restoreDailyPlan(
  codeRun: string,
  restoreAs: Exclude<PlanRemark, 'CANCEL'> = 'REGULAR'
): Promise<DailyPlanMutationResult> {
  const validCodeRun = normalizeCodeRun(codeRun);
  if (restoreAs !== 'REGULAR' && restoreAs !== 'EXTRA') {
    throw new Error('Restore type must be REGULAR or EXTRA.');
  }

  const data: PlanApiResponse<DailyPlanMutationResult> = await fetchApiRequest(
    `/api/plans/${encodeURIComponent(validCodeRun)}/restore`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restoreAs }),
    }
  );

  if (data.success !== true || !data.result) {
    throw new Error(
      data.error || 'The server did not confirm Plan restoration.'
    );
  }

  return {
    success: true,
    message: String(data.result.message || 'คืนค่า Plan สำเร็จ'),
    codeRun: String(data.result.codeRun || validCodeRun),
    remark: restoreAs,
  };
}

export async function confirmWorkDetail(
  codeRun: string
): Promise<void> {
  const validCodeRun = normalizeCodeRun(codeRun);
  const data = await fetchApiRequest(
    `/api/plans/${encodeURIComponent(validCodeRun)}/confirm-work-detail`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }
  );

  if (data.success !== true || !data.result || data.result.success !== true) {
    throw new Error(data.error || 'The server did not confirm Work Detail completion.');
  }
}

function mapTruckStatus(currentStatus: string): TruckStatus {
  const value = String(currentStatus || '').trim().toLowerCase();

  if (
    value.includes('complete') ||
    value.includes('completed') ||
    value.includes('เสร็จ')
  ) return 'COMPLETED';

  if (value.includes('truck out') || value.includes('ออก')) {
    return 'TRUCK_OUT';
  }

  if (
    value.includes('unloading at tpcap') ||
    value.includes('arrive') ||
    value.includes('arrived') ||
    value.includes('ถึง')
  ) return 'UNLOADING_AT_TPCAP';

  if (value.includes('dock in')) return 'DOCK_IN';

  if (
    value.includes('กำลังลงงาน') ||
    value.includes('dock') ||
    value.includes('unloading') ||
    value.includes('unload at tpcap')
  ) return 'UNLOADING';

  if (
    value.includes('wait') ||
    value.includes('waiting') ||
    value.includes('รอ')
  ) return 'WAITING_AREA';

  return 'TRAVELING';
}

function mapPerformanceStatus(value: string): PerformanceStatus {
  const status = String(value || '').trim().toLowerCase();

  if (
    status.includes('delay') ||
    status.includes('delayed') ||
    status.includes('ดีเล')
  ) return 'DELAY';

  if (
    status.includes('early') ||
    status.includes('ก่อน') ||
    status.includes('ไว')
  ) return 'EARLY';

  if (status.includes('warning') || status.includes('เตือน')) {
    return 'WARNING';
  }

  return 'ON_PLAN';
}

export async function fetchTrucksFromSheets(
  sourceData?: any
): Promise<Truck[]> {
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
    if (!codeRun || normalizePlanRemark(row[12]) === 'CANCEL') continue;

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
      project: String(row[8] || '').trim(),
      workDetail: String(row[13] || '').trim(),
      workDetailConfirmed: String(row[14] || '').trim().toUpperCase() === 'CONFIRMED',
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
    updates.status !== undefined ? updates.status : currentTruck.status,
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
    new Date().toLocaleString('en-GB', {
      timeZone: 'Asia/Bangkok',
      hour12: false,
    }),
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
  return headers.findIndex(header =>
    possibleNames.some(name => header.includes(normalizeGpsHeader(name)))
  );
}

function parseGpsNumber(value: unknown): number {
  return Number(String(value ?? '').trim().replace(/\s/g, '').replace(',', '.'));
}

function readGpsCell(row: any[], index: number): string {
  return index < 0 ? '' : String(row[index] ?? '').trim();
}

export async function fetchGpsLocations(
  sourceData?: any
): Promise<GpsLocation[]> {
  const data = sourceData ?? (await fetchEliveApiData());
  const gpsData: any[][] = Array.isArray(data.gps) ? data.gps : [];
  if (gpsData.length <= 1) return [];

  const headers = gpsData[0].map(normalizeGpsHeader);
  const gpsIdIndex = findGpsColumn(headers, ['GPS ID', 'GPSID', 'รหัส GPS']);
  const plateIndex = findGpsColumn(headers, [
    'ทะเบียนรถ',
    'License Plate',
    'Truck Name',
    'Plate',
  ]);
  const latIndex = findGpsColumn(headers, ['ละติจูด', 'Latitude', 'Lat']);
  const lngIndex = findGpsColumn(headers, ['ลองจิจูด', 'Longitude', 'Lng', 'Lon']);
  const speedIndex = findGpsColumn(headers, ['ความเร็ว', 'Speed']);
  const headingIndex = findGpsColumn(headers, ['ทิศทาง', 'Heading', 'Direction']);
  const locationIndex = findGpsColumn(headers, ['ชื่อสถานที่', 'สถานที่', 'Location']);
  const timeIndex = findGpsColumn(headers, ['เวลา GPS', 'GPS Time', 'GPS Datetime']);
  const statusIndex = findGpsColumn(headers, ['สถานะ', 'Status']);
  const receivedIndex = findGpsColumn(headers, [
    'เวลาที่ระบบดึงข้อมูล',
    'เวลารับข้อมูล',
    'Received At',
    'Update Time',
  ]);

  if (latIndex < 0 || lngIndex < 0) {
    throw new Error('ไม่พบคอลัมน์ละติจูดหรือลองจิจูดในข้อมูล GPS');
  }

  const locations: GpsLocation[] = [];

  for (const row of gpsData.slice(1)) {
    if (!Array.isArray(row)) continue;

    const latitude = parseGpsNumber(row[latIndex]);
    const longitude = parseGpsNumber(row[lngIndex]);

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) continue;

    const speed = speedIndex >= 0 ? parseGpsNumber(row[speedIndex]) : 0;
    const heading = headingIndex >= 0 ? parseGpsNumber(row[headingIndex]) : 0;

    locations.push({
      gpsId: readGpsCell(row, gpsIdIndex) || `${latitude},${longitude}`,
      licensePlate: readGpsCell(row, plateIndex),
      latitude,
      longitude,
      speed: Number.isFinite(speed) ? speed : 0,
      heading: Number.isFinite(heading) ? heading : 0,
      locationName: readGpsCell(row, locationIndex),
      gpsTime: readGpsCell(row, timeIndex),
      gpsStatus: readGpsCell(row, statusIndex),
      receivedAt: readGpsCell(row, receivedIndex),
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

  const data = await fetchApiRequest(`/api/route-to-tpcap?${query.toString()}`, {
    method: 'GET',
  });

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
    .map((coordinate: unknown[]) => [
      Number(coordinate[0]),
      Number(coordinate[1]),
    ])
    .filter(
      ([lng, lat]: number[]) =>
        Number.isFinite(lng) &&
        Number.isFinite(lat) &&
        lng >= -180 &&
        lng <= 180 &&
        lat >= -90 &&
        lat <= 90
    );

  if (validCoordinates.length < 2) {
    throw new Error('ข้อมูลเส้นทางมีจำนวนพิกัดไม่เพียงพอ');
  }

  return {
    success: true,
    origin: {
      latitude: Number(data.origin?.latitude),
      longitude: Number(data.origin?.longitude),
    },
    destination: {
      name: String(data.destination?.name || 'TPCAP'),
      latitude: Number(data.destination?.latitude),
      longitude: Number(data.destination?.longitude),
    },
    distanceMeters,
    distanceKilometers,
    durationSeconds,
    durationMinutes,
    estimatedArrival: String(data.estimatedArrival || ''),
    estimatedArrivalBangkok: String(data.estimatedArrivalBangkok || ''),
    geometry: {
      type: 'LineString',
      coordinates: validCoordinates,
    },
  };
}

export async function loginElive(
  username: string,
  password: string
): Promise<EliveAuthResult> {
  const normalizedUsername = String(username || '').trim();
  if (!normalizedUsername || !password) {
    throw new Error('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
  }

  return fetchApiRequest('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username: normalizedUsername,
      password,
    }),
  });
}

export async function fetchEliveSession(): Promise<EliveAuthResult> {
  return fetchApiRequest('/api/auth/session', {
    method: 'GET',
  });
}

export async function verifyEliveSession(): Promise<EliveAuthResult> {
  return fetchApiRequest('/api/auth/verify', {
    method: 'GET',
  });
}

export async function logoutElive(): Promise<EliveAuthResult> {
  return fetchApiRequest('/api/auth/logout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
}

export function isEliveUnauthorizedError(error: unknown): boolean {
  return error instanceof EliveApiError && error.status === 401;
}

export function isEliveForbiddenError(error: unknown): boolean {
  return error instanceof EliveApiError && error.status === 403;
}

export async function fetchEliveDashboardData(): Promise<EliveDashboardData> {
  const sourceData = await fetchEliveApiData();
  const trucks = await fetchTrucksFromSheets(sourceData);
  const gpsLocations = await fetchGpsLocations(sourceData);

  return {
    trucks,
    gpsLocations,
  };
}
