import {
  Truck,
  TruckStatus,
  PerformanceStatus,
} from '../types';

import { calculatePerformanceStatus } from '../utils';

/*
 * Google Apps Script Web App URL
 *
 * ลำดับการเลือก URL:
 * 1. URL ที่บันทึกอยู่ใน Local Storage
 * 2. Environment Variable: VITE_APPS_SCRIPT_URL
 * 3. URL เริ่มต้นด้านล่าง
 */
const DEFAULT_APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbxr9w7IGGlLVbCif7eB7-P4BlabBdll5uyO0nGBvo3Dt89pyAzB0iJpdK3bg6ZH244vMw/exec';

/**
 * อ่าน Apps Script URL ที่เว็บไซต์จะใช้งาน
 */
export const getAppsScriptUrl = (): string => {
  const env = (import.meta as any).env;

  const savedUrl = localStorage.getItem('apps_script_url');
  const environmentUrl = env?.VITE_APPS_SCRIPT_URL;

  const selectedUrl =
    savedUrl ||
    environmentUrl ||
    DEFAULT_APPS_SCRIPT_URL;

  /*
   * ลบช่องว่างและเครื่องหมาย / ท้าย URL
   * เพื่อป้องกัน URL กลายเป็น //?action=getTrucks
   */
  return selectedUrl.trim().replace(/\/+$/, '');
};

/**
 * แปลงเวลาที่ได้รับจาก Google Sheets
 *
 * Google Sheets อาจส่งเวลาเป็นวันที่ 1899-12-30
 * เช่น 1899-12-30T07:56:00.000Z
 */
function parseGoogleSheetsTime(
  timeValue: unknown
): string {
  if (
    timeValue === null ||
    timeValue === undefined ||
    timeValue === ''
  ) {
    return '';
  }

  const timeStr = String(timeValue).trim();

  if (!timeStr) {
    return '';
  }

  if (timeStr.includes('1899-12-30T')) {
    const date = new Date(timeStr);

    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleTimeString('en-GB', {
        timeZone: 'Asia/Bangkok',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    }
  }

  return timeStr;
}

/**
 * แปลงวันที่จาก Google Sheets เป็น YYYY-MM-DD
 */
function parseGoogleSheetsDate(
  dateValue: unknown
): string {
  if (
    dateValue === null ||
    dateValue === undefined ||
    dateValue === ''
  ) {
    return '';
  }

  const dateStr = String(dateValue).trim();

  if (!dateStr) {
    return '';
  }

  if (dateStr.includes('T')) {
    const date = new Date(dateStr);

    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString('en-CA', {
        timeZone: 'Asia/Bangkok',
      });
    }
  }

  return dateStr;
}

/**
 * อ่านข้อความ Error จาก Apps Script
 */
function getAppsScriptError(
  data: unknown
): string | null {
  if (
    typeof data === 'object' &&
    data !== null &&
    'error' in data
  ) {
    const errorValue = (data as { error?: unknown }).error;

    if (errorValue) {
      return String(errorValue);
    }
  }

  return null;
}

/**
 * ดึงข้อมูลรถจาก Google Sheets
 */
export async function fetchTrucksFromSheets(): Promise<Truck[]> {
  const appsScriptUrl = getAppsScriptUrl();

  if (!appsScriptUrl) {
    throw new Error(
      'Please set Google Apps Script URL in Settings.'
    );
  }

  const requestUrl =
    `${appsScriptUrl}?action=getTrucks`;

  let response: Response;

  try {
    response = await fetch(requestUrl, {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store',
    });
  } catch (error) {
    console.error(
      'Unable to connect to Google Apps Script:',
      error
    );

    throw new Error(
      'Unable to connect to Google Sheets. Please check the Apps Script URL, deployment permission, or CORS configuration.'
    );
  }

  if (!response.ok) {
    throw new Error(
      `Failed to fetch from Apps Script (${response.status} ${response.statusText})`
    );
  }

  let data: any;

  try {
    data = await response.json();
  } catch (error) {
    console.error(
      'Apps Script returned invalid JSON:',
      error
    );

    throw new Error(
      'Apps Script returned an invalid response.'
    );
  }

  const appsScriptError = getAppsScriptError(data);

  if (appsScriptError) {
    throw new Error(appsScriptError);
  }

  if (data.status !== 'success') {
    throw new Error(
      'Apps Script did not return a success status.'
    );
  }

  const planData: any[][] = Array.isArray(data.plan)
    ? data.plan
    : [];

  const actualData: any[][] = Array.isArray(data.actual)
    ? data.actual
    : [];

  /*
   * ข้ามแถวแรก เพราะเป็น Header
   */
  const planRows = planData.slice(1);
  const actualRows = actualData.slice(1);

  /*
   * สร้าง Map ของ Actual data
   * โดยใช้ Code run ในคอลัมน์แรกเป็น Key
   */
  const actualMap = new Map<string, any[]>();

  for (const row of actualRows) {
    if (!Array.isArray(row)) {
      continue;
    }

    const codeRun = String(row[0] || '').trim();

    if (codeRun) {
      actualMap.set(codeRun, row);
    }
  }

  const trucks: Truck[] = [];

  for (const row of planRows) {
    if (!Array.isArray(row)) {
      continue;
    }

    const codeRun = String(row[0] || '').trim();

    /*
     * ข้ามแถวที่ไม่มี Code run
     */
    if (!codeRun) {
      continue;
    }

    const actualRow = actualMap.get(codeRun);

    const planDate = parseGoogleSheetsDate(
      row[1]
    );

    const planEta = parseGoogleSheetsTime(
      row[10]
    );

    const planEtd = parseGoogleSheetsTime(
      row[11]
    );

    /*
     * ค่าเริ่มต้นกรณียังไม่มี Actual data
     */
    let currentStatus = 'TRAVELING';
    let efficiencyStatus = 'ON_PLAN';
    let stampEta = '';
    let stampEtd = '';
    let actionProblem = '';
    let actionCountermeasure = '';
    let actionResponsible = '';
    let actionStatus = '';

    if (actualRow) {
      currentStatus = String(
        actualRow[1] || 'TRAVELING'
      );

      efficiencyStatus = String(
        actualRow[2] || 'ON_PLAN'
      );

      stampEta = parseGoogleSheetsTime(
        actualRow[4]
      );

      stampEtd = parseGoogleSheetsTime(
        actualRow[5]
      );

      actionProblem = String(
        actualRow[6] || ''
      );

      actionCountermeasure = String(
        actualRow[7] || ''
      );

      actionResponsible = String(
        actualRow[8] || ''
      );

      actionStatus = String(
        actualRow[9] || ''
      );
    }

    /*
     * แปลง Current Status จากข้อความในชีท
     * เป็น TruckStatus ที่ระบบใช้งาน
     */
    const normalizedStatus = currentStatus
      .trim()
      .toLowerCase();

    let mappedStatus: TruckStatus = 'TRAVELING';

    if (
      normalizedStatus.includes('complete') ||
      normalizedStatus.includes('completed') ||
      normalizedStatus.includes('เสร็จ')
    ) {
      mappedStatus = 'COMPLETED';
    } else if (
      normalizedStatus.includes('unloading at tpcap') ||
      normalizedStatus.includes('arrive') ||
      normalizedStatus.includes('arrived') ||
      normalizedStatus.includes('ถึง')
    ) {
      /*
       * ต้องตรวจเงื่อนไขนี้ก่อนคำว่า unloading
       * เพราะ "unloading at tpcap" มีคำว่า unloading อยู่ด้วย
       */
      mappedStatus = 'UNLOADING_AT_TPCAP';
    } else if (
      normalizedStatus.includes('กำลังลงงาน') ||
      normalizedStatus.includes('dock') ||
      normalizedStatus.includes('unloading') ||
      normalizedStatus.includes('unload at tpcap')
    ) {
      mappedStatus = 'UNLOADING';
    } else if (
      normalizedStatus.includes('wait') ||
      normalizedStatus.includes('waiting') ||
      normalizedStatus.includes('รอ')
    ) {
      mappedStatus = 'WAITING_AREA';
    } else if (
      normalizedStatus.includes('truck out') ||
      normalizedStatus.includes('ออก')
    ) {
      mappedStatus = 'TRUCK_OUT';
    }

    /*
     * แปลง Performance Status
     */
    const normalizedPerformance =
      efficiencyStatus
        .trim()
        .toLowerCase();

    let performanceStatus: PerformanceStatus =
      'ON_PLAN';

    if (
      normalizedPerformance.includes('delay') ||
      normalizedPerformance.includes('delayed') ||
      normalizedPerformance.includes('ดีเล')
    ) {
      performanceStatus = 'DELAY';
    } else if (
      normalizedPerformance.includes('early') ||
      normalizedPerformance.includes('ก่อน') ||
      normalizedPerformance.includes('ไว')
    ) {
      performanceStatus = 'EARLY';
    } else if (
      normalizedPerformance.includes('warning') ||
      normalizedPerformance.includes('เตือน')
    ) {
      performanceStatus = 'WARNING';
    }

    /*
     * ถ้าในชีทยังเป็น ON_PLAN และมี Actual ETA
     * ให้ระบบคำนวณ Performance ใหม่
     */
    if (
      performanceStatus === 'ON_PLAN' &&
      stampEta &&
      planEta
    ) {
      performanceStatus =
        calculatePerformanceStatus(
          planEta,
          stampEta
        );
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

      lastUpdated: new Date().toLocaleTimeString(
        'en-GB',
        {
          timeZone: 'Asia/Bangkok',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }
      ),
    });
  }

  return trucks;
}

/**
 * อัปเดตข้อมูลรถลงในชีท Actual data
 */
export async function updateTruckInSheets(
  truckId: string,
  updates: Partial<Truck>,
  currentTruck: Truck
): Promise<void> {
  const appsScriptUrl = getAppsScriptUrl();

  if (!appsScriptUrl) {
    throw new Error(
      'Please set Google Apps Script URL in Settings.'
    );
  }

  if (!truckId) {
    throw new Error(
      'Truck ID is required.'
    );
  }

  const datetimeUpdate =
    new Date().toLocaleString('en-GB', {
      timeZone: 'Asia/Bangkok',
      hour12: false,
    });

  const currentStatus =
    updates.status !== undefined
      ? updates.status
      : currentTruck.status;

  const efficiencyStatus =
    updates.performanceStatus !== undefined
      ? updates.performanceStatus
      : currentTruck.performanceStatus;

  const stampEta =
    updates.stampEta !== undefined
      ? updates.stampEta
      : currentTruck.stampEta;

  const stampEtd =
    updates.stampEtd !== undefined
      ? updates.stampEtd
      : currentTruck.stampEtd;

  /*
   * ลำดับคอลัมน์ของชีท Actual data:
   *
   * 0  Code run
   * 1  Current status
   * 2  Efficiency status
   * 3  Plan ETA
   * 4  Stamp ETA
   * 5  Stamp ETD
   * 6  Problem
   * 7  Countermeasures
   * 8  Responsible person
   * 9  Process status
   * 10 User
   * 11 Datetime update
   */
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

  let response: Response;

  try {
    response = await fetch(appsScriptUrl, {
      method: 'POST',

      /*
       * ใช้ text/plain เพื่อหลีกเลี่ยง CORS preflight
       * ห้ามเปลี่ยนเป็น application/json
       */
      headers: {
        'Content-Type':
          'text/plain;charset=utf-8',
      },

      redirect: 'follow',

      body: JSON.stringify({
        action: 'updateTruck',
        truckId,
        newRow,
      }),
    });
  } catch (error) {
    console.error(
      'Unable to update Google Sheets:',
      error
    );

    throw new Error(
      'Unable to connect to Google Sheets while updating data.'
    );
  }

  if (!response.ok) {
    throw new Error(
      `Failed to update Google Sheet (${response.status} ${response.statusText})`
    );
  }

  let result: any;

  try {
    result = await response.json();
  } catch (error) {
    console.error(
      'Apps Script returned invalid update response:',
      error
    );

    throw new Error(
      'Apps Script returned an invalid update response.'
    );
  }

  const appsScriptError =
    getAppsScriptError(result);

  if (appsScriptError) {
    throw new Error(appsScriptError);
  }

  if (result.success !== true) {
    throw new Error(
      'Apps Script did not confirm the update.'
    );
  }
}
