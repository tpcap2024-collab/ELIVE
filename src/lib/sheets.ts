import { Truck, TruckStatus, PerformanceStatus } from '../types';
import { calculatePerformanceStatus } from '../utils';

// Read URL from LocalStorage or Env
export const getAppsScriptUrl = () => {
  const env = (import.meta as any).env;

  return (
    localStorage.getItem('apps_script_url') ||
    env?.VITE_APPS_SCRIPT_URL ||
    'https://script.google.com/macros/s/AKfycbxr9w7IGGlLVbCif7eB7-P4BlabBdll5uyO0nGBvo3Dt89pyAzB0iJpdK3bg6ZH244vMw/exec'
  );
};

function parseGoogleSheetsTime(timeStr: string): string {
  if (!timeStr) return '';

  if (timeStr.includes('1899-12-30T')) {
    const d = new Date(timeStr);

    return d.toLocaleTimeString('en-GB', {
      timeZone: 'Asia/Bangkok',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return timeStr;
}

function parseGoogleSheetsDate(dateStr: string): string {
  if (!dateStr) return '';

  if (dateStr.includes('T')) {
    const d = new Date(dateStr);

    return d.toLocaleDateString('en-CA', {
      timeZone: 'Asia/Bangkok',
    });
  }

  return dateStr;
}

export async function fetchTrucksFromSheets(): Promise<Truck[]> {
  const APPS_SCRIPT_URL = getAppsScriptUrl();

  if (!APPS_SCRIPT_URL) {
    throw new Error('Please set Google Apps Script URL in Settings.');
  }

  const response = await fetch(
    `${APPS_SCRIPT_URL}?action=getTrucks`,
    {
      method: 'GET',
      mode: 'cors',
      redirect: 'follow',
    }
  );

  if (!response.ok) {
    throw new Error(
      `Failed to fetch from Apps Script (${response.status})`
    );
  }

  const data = await response.json();

  const planData = data.plan || [];
  const actualData = data.actual || [];

  const planRows = planData.slice(1);
  const actualRows = actualData.slice(1);

  const actualMap = new Map();

  for (const row of actualRows) {
    if (row[0]) {
      actualMap.set(row[0], row);
    }
  }

  const trucks: Truck[] = [];

  for (const row of planRows) {
    if (!row[0]) continue;

    const codeRun = row[0];
    const actualRow = actualMap.get(codeRun);

    const planDate = parseGoogleSheetsDate(row[1] || '');
    const planEta = parseGoogleSheetsTime(row[10] || '');
    const planEtd = parseGoogleSheetsTime(row[11] || '');

    let currentStatus = 'TRAVELING';
    let efficiencyStatus = 'ON_PLAN';
    let stampEta = '';
    let stampEtd = '';
    let actionProblem = '';
    let actionCountermeasure = '';
    let actionResponsible = '';
    let actionStatus = '';

    if (actualRow) {
      currentStatus = actualRow[1] || 'TRAVELING';
      efficiencyStatus = actualRow[2] || 'ON_PLAN';
      stampEta = parseGoogleSheetsTime(actualRow[4] || '');
      stampEtd = parseGoogleSheetsTime(actualRow[5] || '');
      actionProblem = actualRow[6] || '';
      actionCountermeasure = actualRow[7] || '';
      actionResponsible = actualRow[8] || '';
      actionStatus = actualRow[9] || '';
    }

    const normStatus = currentStatus.toLowerCase();

    let mappedStatus: TruckStatus = 'TRAVELING';

    if (normStatus.includes('complete') || normStatus.includes('เสร็จ')) {
      mappedStatus = 'COMPLETED';
    } else if (
      normStatus.includes('กำลังลงงาน') ||
      normStatus.includes('dock') ||
      normStatus.includes('unloading') ||
      normStatus.includes('unload at tpcap')
    ) {
      mappedStatus = 'UNLOADING';
    } else if (
      normStatus.includes('arrive') ||
      normStatus.includes('ถึง')
    ) {
      mappedStatus = 'UNLOADING_AT_TPCAP';
    } else if (
      normStatus.includes('wait') ||
      normStatus.includes('รอ')
    ) {
      mappedStatus = 'WAITING_AREA';
    } else if (
      normStatus.includes('out') ||
      normStatus.includes('ออก')
    ) {
      mappedStatus = 'TRUCK_OUT';
    }

    let perfStatus: PerformanceStatus = 'ON_PLAN';

    const normPerf =
      efficiencyStatus.toString().trim().toLowerCase();

    if (
      normPerf.includes('delay') ||
      normPerf.includes('ดีเล')
    ) {
      perfStatus = 'DELAY';
    } else if (
      normPerf.includes('early') ||
      normPerf.includes('ก่อน') ||
      normPerf.includes('ไว')
    ) {
      perfStatus = 'EARLY';
    } else if (
      normPerf.includes('warning') ||
      normPerf.includes('เตือน')
    ) {
      perfStatus = 'WARNING';
    }

    if (perfStatus === 'ON_PLAN' && stampEta) {
      perfStatus = calculatePerformanceStatus(
        planEta,
        stampEta
      );
    }

    trucks.push({
      id: codeRun,
      planDate,
      route: row[2] || '',
      supplierName: row[3] || '',
      licensePlate: row[4] || '',
      truckType: row[5] || '',
      driverName: row[6] || '',
      phone: row[7] || '',
      dropPoint: row[9] || '',
      planEta,
      planEtd,

      status: mappedStatus,
      performanceStatus: perfStatus,

      stampEta,
      stampEtd,

      actionProblem,
      actionCountermeasure,
      actionResponsible,
      actionStatus,

      lastUpdated: new Date().toLocaleTimeString('en-US', {
        hour12: false,
      }),
    });
  }

  return trucks;
}
