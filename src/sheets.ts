import { Truck, TruckStatus, PerformanceStatus } from '../types';
import { calculatePerformanceStatus } from '../utils';

// Read URL from LocalStorage or Env
export const getAppsScriptUrl = () => {
  const env = (import.meta as any).env;
  return localStorage.getItem('apps_script_url') || (env && env.VITE_APPS_SCRIPT_URL) || 'https://script.google.com/macros/s/AKfycbwV9sfFxE-9lN4A08EKGq55_RlBjlVcvK6Bdeddj8GT0-6huxxnz8oyT7zunl69PK3qJA/exec';
};

export async function fetchTrucksFromSheets(): Promise<Truck[]> {
  const APPS_SCRIPT_URL = getAppsScriptUrl();
  
  if (!APPS_SCRIPT_URL) {
    throw new Error('Please set Google Apps Script URL in Settings.');
  }

  const res = await fetch(`${APPS_SCRIPT_URL}?action=getTrucks`);

  if (!res.ok) {
    throw new Error(`Failed to fetch from Apps Script (${res.status})`);
  }

  const data = await res.json();
  const planData = data.plan || [];
  const actualData = data.actual || [];

  const planRows = planData.slice(1) || []; // Skip header
  const actualRows = actualData.slice(1) || []; // Skip header

  // Create a map of actual data for easy lookup by Code run (index 0)
  const actualMap = new Map();
  for (const row of actualRows) {
    if (row[0]) {
      actualMap.set(row[0], row);
    }
  }

  const trucks: Truck[] = [];

  for (const row of planRows) {
    if (!row[0]) continue; // Skip empty rows

    const codeRun = row[0];
    const actualRow = actualMap.get(codeRun);

    const planEta = row[10] || '';
    const planEtd = row[11] || '';
    
    // Default actual values
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
      stampEta = actualRow[4] || '';
      stampEtd = actualRow[5] || '';
      actionProblem = actualRow[6] || '';
      actionCountermeasure = actualRow[7] || '';
      actionResponsible = actualRow[8] || '';
      actionStatus = actualRow[9] || '';
    }

    const normStatus = currentStatus.toString().trim().toLowerCase();
    let mappedStatus: TruckStatus = 'TRAVELING';
    if (normStatus.includes('complete') || normStatus.includes('เสร็จ')) mappedStatus = 'COMPLETED';
    else if (normStatus.includes('กำลังลงงาน') || normStatus.includes('dock') || normStatus.includes('unloading') || normStatus.includes('unload at tpcap')) mappedStatus = 'UNLOADING';
    else if (normStatus.includes('arrive') || normStatus.includes('ถึง') || normStatus.includes('unloading at tpcap')) mappedStatus = 'UNLOADING_AT_TPCAP';
    else if (normStatus.includes('wait') || normStatus.includes('รอ')) mappedStatus = 'WAITING_AREA';
    else if (normStatus.includes('out') || normStatus.includes('ออก')) mappedStatus = 'TRUCK_OUT';

    const normPerf = efficiencyStatus.toString().trim().toLowerCase();
    let initialPerf: PerformanceStatus = 'ON_PLAN';
    if (normPerf.includes('delay') || normPerf.includes('ดีเล')) initialPerf = 'DELAY';
    else if (normPerf.includes('early') || normPerf.includes('ก่อน') || normPerf.includes('ไว')) initialPerf = 'EARLY';
    else if (normPerf.includes('warning') || normPerf.includes('เตือน')) initialPerf = 'WARNING';

    let calculatedPerfStatus = initialPerf;
    // If the spreadsheet didn't explicitly say DELAY or EARLY, try calculating it.
    if (initialPerf === 'ON_PLAN' && stampEta) {
      calculatedPerfStatus = calculatePerformanceStatus(planEta, stampEta);
    }

    trucks.push({
      id: codeRun,
      planDate: row[1] || '',
      route: row[2] || '',
      licensePlate: row[4] || '',
      supplierName: row[3] || '',
      driverName: row[6] || '',
      phone: row[7] || '',
      truckType: row[5] || '',
      dropPoint: row[9] || '',
      planEta: planEta,
      planEtd: planEtd,
      
      status: mappedStatus,
      performanceStatus: calculatedPerfStatus,
      stampEta: stampEta,
      stampEtd: stampEtd,
      actionProblem: actionProblem,
      actionCountermeasure: actionCountermeasure,
      actionResponsible: actionResponsible,
      actionStatus: actionStatus,
      lastUpdated: new Date().toLocaleTimeString('en-US', { hour12: false })
    });
  }

  return trucks;
}

export async function updateTruckInSheets(truckId: string, updates: Partial<Truck>, currentTruck: Truck): Promise<void> {
  const APPS_SCRIPT_URL = getAppsScriptUrl();
  
  if (!APPS_SCRIPT_URL) {
    throw new Error('Please set Google Apps Script URL in Settings.');
  }

  const now = new Date();
  const datetimeUpdate = now.toLocaleString('en-US', { hour12: false });
  
  const currentStatus = updates.status || currentTruck.status;
  const efficiencyStatus = updates.performanceStatus || currentTruck.performanceStatus;
  const stampEta = updates.stampEta !== undefined ? updates.stampEta : currentTruck.stampEta;
  const stampEtd = updates.stampEtd !== undefined ? updates.stampEtd : currentTruck.stampEtd;
  const userStr = 'System User'; // Could be parameterized in future

  const newRow = [
    truckId,
    currentStatus,
    efficiencyStatus,
    currentTruck.planEta || '',
    stampEta || '',
    stampEtd || '',
    updates.actionProblem !== undefined ? updates.actionProblem : (currentTruck.actionProblem || ''),
    updates.actionCountermeasure !== undefined ? updates.actionCountermeasure : (currentTruck.actionCountermeasure || ''),
    updates.actionResponsible !== undefined ? updates.actionResponsible : (currentTruck.actionResponsible || ''),
    updates.actionStatus !== undefined ? updates.actionStatus : (currentTruck.actionStatus || ''),
    userStr,
    datetimeUpdate
  ];

  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    body: JSON.stringify({
      action: 'updateTruck',
      truckId: truckId,
      newRow: newRow
    })
  });
  
  if (!res.ok) {
    throw new Error('Failed to update Google Sheet via Apps Script');
  }
}

