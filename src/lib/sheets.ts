import {
  Truck,
  TruckStatus,
  PerformanceStatus,
} from '../types';

import { calculatePerformanceStatus } from '../utils';

/*
 * Render Backend API URL
 *
 * ระบบจะอ่าน URL ตามลำดับ:
 * 1. Environment Variable: VITE_API_URL
 * 2. URL เริ่มต้นด้านล่าง
 */
const DEFAULT_API_URL =
  'https://elive-api.onrender.com';

/*
 * คงชื่อ getAppsScriptUrl ไว้
 * เพื่อไม่ให้ App.tsx ที่เรียกฟังก์ชันเดิมเกิด Build Error
 *
 * แต่ค่าที่คืนกลับตอนนี้คือ Render Backend API URL
 * ไม่ใช่ Google Apps Script URL
 */
export const getAppsScriptUrl = (): string => {
  const env = (import.meta as any).env;

  const apiUrl =
    env?.VITE_API_URL ||
    DEFAULT_API_URL;

  return String(apiUrl)
    .trim()
    .replace(/\/+$/, '');
};

/**
 * แปลงเวลาที่ได้รับจาก Google Sheets
 *
 * Google Sheets อาจส่งเวลาในรูปแบบ:
 * 1899-12-30T07:56:00.000Z
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
 * อ่านข้อความ Error จาก Backend API
 */
function getApiError(
  data: unknown
): string | null {
  if (
    typeof data === 'object' &&
    data !== null &&
    'error' in data
  ) {
    const errorValue = (
      data as { error?: unknown }
    ).error;

    if (errorValue) {
      return String(errorValue);
    }
  }

  return null;
}

/**
 * ดึงข้อมูลรถผ่าน Render Backend API
 */
export async function fetchTrucksFromSheets(): Promise<Truck[]> {
  const apiUrl = getAppsScriptUrl();

  if (!apiUrl) {
    throw new Error(
      'Render Backend API URL is not configured.'
    );
  }

  const requestUrl =
    `${apiUrl}/api/trucks`;

  let response: Response;

  try {
    response = await fetch(requestUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
    });
  } catch (error) {
    console.error(
      'Unable to connect to ELIVE Backend API:',
      error
    );

    throw new Error(
      'Unable to connect to the ELIVE Backend API.'
    );
  }

  if (!response.ok) {
    let errorMessage =
      `Failed to fetch truck data (${response.status} ${response.statusText})`;

    try {
      const errorData = await response.json();
      const apiError = getApiError(errorData);

      if (apiError) {
        errorMessage = apiError;
      }
    } catch {
      // ใช้ข้อความ Error เริ่มต้น
    }

    throw new Error(errorMessage);
  }

  let data: any;

  try {
    data = await response.json();
  } catch (error) {
    console.error(
      'Backend API returned invalid JSON:',
      error
    );

    throw new Error(
      'The ELIVE Backend API returned an invalid response.'
    );
  }

  const apiError = getApiError(data);

  if (apiError) {
    throw new Error(apiError);
  }

  if (data.status !== 'success') {
    throw new Error(
      'The ELIVE Backend API did not return a success status.'
    );
  }

  const planData: any[][] =
    Array.isArray(data.plan)
      ? data.plan
      : [];

  const actualData: any[][] =
    Array.isArray(data.actual)
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
  const actualMap =
    new Map<string, any[]>();

  for (const row of actualRows) {
    if (!Array.isArray(row)) {
      continue;
    }

    const codeRun =
      String(row[0] || '').trim();

    if (codeRun) {
      actualMap.set(codeRun, row);
    }
  }

  const trucks: Truck[] = [];

  for (const row of planRows) {
    if (!Array.isArray(row)) {
      continue;
    }

    const codeRun =
      String(row[0] || '').trim();

    /*
     * ข้ามแถวที่ไม่มี Code run
     */
    if (!codeRun) {
      continue;
    }

    const actualRow =
      actualMap.get(codeRun);

    const planDate =
      parseGoogleSheetsDate(row[1]);

    const planEta =
      parseGoogleSheetsTime(row[10]);

    const planEtd =
      parseGoogleSheetsTime(row[11]);

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
     * แปลง Current Status เป็น TruckStatus
     */
    const normalizedStatus =
      currentStatus
        .trim()
        .toLowerCase();

    let mappedStatus: TruckStatus =
      'TRAVELING';

    if (
      normalizedStatus.includes('complete') ||
      normalizedStatus.includes('completed') ||
      normalizedStatus.includes('เสร็จ')
    ) {
      mappedStatus = 'COMPLETED';
    } else if (
      normalizedStatus.includes(
        'unloading at tpcap'
      ) ||
      normalizedStatus.includes('arrive') ||
      normalizedStatus.includes('arrived') ||
      normalizedStatus.includes('ถึง')
    ) {
      mappedStatus =
        'UNLOADING_AT_TPCAP';
    } else if (
      normalizedStatus.includes('กำลังลงงาน') ||
      normalizedStatus.includes('dock') ||
      normalizedStatus.includes('unloading') ||
      normalizedStatus.includes(
        'unload at tpcap'
      )
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

    let performanceStatus:
      PerformanceStatus = 'ON_PLAN';

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
     * ถ้าในชีทยังเป็น ON_PLAN
     * และมี Actual ETA ให้คำนวณใหม่
     */
    if (
      stampEta &&
      planEta &&
      planEtd
    ) {
      performanceStatus =
        calculatePerformanceStatus(
          planEta,
          planEtd,
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

      lastUpdated:
        new Date().toLocaleTimeString(
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
 * อัปเดตข้อมูลรถผ่าน Render Backend API
 */
export async function updateTruckInSheets(
  truckId: string,
  updates: Partial<Truck>,
  currentTruck: Truck
): Promise<void> {
  const apiUrl = getAppsScriptUrl();

  if (!apiUrl) {
    throw new Error(
      'Render Backend API URL is not configured.'
    );
  }

  if (!truckId) {
    throw new Error(
      'Truck ID is required.'
    );
  }

  const datetimeUpdate =
    new Date().toLocaleString(
      'en-GB',
      {
        timeZone: 'Asia/Bangkok',
        hour12: false,
      }
    );

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
    response = await fetch(
      `${apiUrl}/api/trucks/update`,
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          truckId,
          newRow,
        }),
      }
    );
  } catch (error) {
    console.error(
      'Unable to update Google Sheets through ELIVE API:',
      error
    );

    throw new Error(
      'Unable to connect to the ELIVE Backend API while updating data.'
    );
  }

  if (!response.ok) {
    let errorMessage =
      `Failed to update Google Sheet (${response.status} ${response.statusText})`;

    try {
      const errorData =
        await response.json();

      const apiError =
        getApiError(errorData);

      if (apiError) {
        errorMessage = apiError;
      }
    } catch {
      // ใช้ข้อความ Error เริ่มต้น
    }

    throw new Error(errorMessage);
  }

  let result: any;

  try {
    result = await response.json();
  } catch (error) {
    console.error(
      'ELIVE API returned invalid update response:',
      error
    );

    throw new Error(
      'The ELIVE Backend API returned an invalid update response.'
    );
  }

  const apiError =
    getApiError(result);

  if (apiError) {
    throw new Error(apiError);
  }

  if (result.success !== true) {
    throw new Error(
      'The server did not confirm the update.'
    );
  }
}
