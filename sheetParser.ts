/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { TruckData, TruckStatus } from '../types';

/**
 * Helper to calculate the great-circle distance between two GPS coordinates using the Haversine formula
 */
function calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Helper to parse a single CSV line, handling quotes, commas, and escaped characters
 */
function parseCSVLine(line: string): string[] {
  const cells: string[] = [];
  let insideQuote = false;
  let currentCell = '';

  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    const nextChar = line[j + 1];

    if (char === '"') {
      if (insideQuote && nextChar === '"') {
        // Escaped double-quotes (e.g., "")
        currentCell += '"';
        j++; // skip next quote
      } else {
        insideQuote = !insideQuote;
      }
    } else if (char === ',' && !insideQuote) {
      cells.push(currentCell.trim());
      currentCell = '';
    } else {
      currentCell += char;
    }
  }
  cells.push(currentCell.trim());
  return cells;
}

/**
 * Normalizes license plate number for comparison
 */
export function normalizePlate(plate: string): string {
  if (!plate) return '';
  // Remove spaces, dashes, parentheses, extra text, and convert to lowercase
  return plate
    .replace(/[\s\-\(\)\.]/g, '')
    .replace(/(extra|cts|tot|apt|ctp|mcc|tat|tpt|mto|extra\-cts|extra\-tpt|extra\-cts)/gi, '')
    .toLowerCase();
}

/**
 * Checks if two plates match by comparing normalized substrings
 */
export function isPlateMatch(plate1: string, plate2: string): boolean {
  const p1 = normalizePlate(plate1);
  const p2 = normalizePlate(plate2);
  if (!p1 || !p2) return false;
  return p1.includes(p2) || p2.includes(p1);
}

export interface PlanItem {
  route: string;
  planEta: string;
  planEtd: string;
  truckType: string;
  plateNo: string;
  driverName: string;
  company: string;
  driverDay?: string;
  driverNight?: string;
  telDriverDay?: string;
  telDriverNight?: string;
}

export interface GpsItem {
  plateNo: string;
  statusText: string;
  stationName: string;
  boxTime: string;
  speed: number;
  lat: number;
  lng: number;
}

/**
 * Parses Plan CSV sheet
 */
export function parsePlanCSV(planCsv: string): PlanItem[] {
  if (!planCsv) return [];
  const lines = planCsv.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase());
  
  let routeIdx = 0;
  let etaIdx = 1;
  let etdIdx = 2;
  let typeIdx = 3;
  let nameIdx = 4;
  let driverDayIdx = 5;
  let driverNightIdx = 6;
  let companyIdx = 7;
  let telDriverDayIdx = -1;
  let telDriverNightIdx = -1;

  headers.forEach((h, idx) => {
    const headerStr = h.trim();
    if (headerStr.includes('route') || headerStr.includes('เส้นทาง')) {
      routeIdx = idx;
    } else if (headerStr.includes('plan eta') || headerStr.includes('eta') || headerStr.includes('เวลาเข้า')) {
      etaIdx = idx;
    } else if (headerStr.includes('plan etd') || headerStr.includes('etd') || headerStr.includes('เวลาออก')) {
      etdIdx = idx;
    } else if (headerStr.includes('truck type') || headerStr.includes('ประเภท')) {
      typeIdx = idx;
    } else if (headerStr.includes('truck name') || headerStr.includes('ทะเบียน') || headerStr.includes('รถ')) {
      nameIdx = idx;
    } else if (headerStr.includes('driver day') || headerStr.includes('คนขับกลางวัน') || headerStr.includes('คนขับ (กลางวัน)')) {
      driverDayIdx = idx;
    } else if (headerStr.includes('driver night') || headerStr.includes('คนขับกลางคืน') || headerStr.includes('คนขับ (กลางคืน)')) {
      driverNightIdx = idx;
    } else if (headerStr.includes('company') || headerStr.includes('บริษัท')) {
      companyIdx = idx;
    } else if (headerStr.includes('tel driver day') || headerStr.includes('เบอร์คนขับกลางวัน') || headerStr.includes('เบอร์ (กลางวัน)') || headerStr.includes('tel driver (day)') || headerStr.includes('tel driver_day')) {
      telDriverDayIdx = idx;
    } else if (headerStr.includes('tel driver night') || headerStr.includes('เบอร์คนขับกลางคืน') || headerStr.includes('เบอร์ (กลางคืน)') || headerStr.includes('tel driver (night)') || headerStr.includes('tel driver_night')) {
      telDriverNightIdx = idx;
    }
  });

  const items: PlanItem[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]);
    if (cells.length === 0) continue;
    const plateNo = cells[nameIdx];
    if (!plateNo) continue;

    const driverDay = cells[driverDayIdx] || '';
    const driverNight = cells[driverNightIdx] || '';
    const telDriverDay = telDriverDayIdx !== -1 ? cells[telDriverDayIdx] : '';
    const telDriverNight = telDriverNightIdx !== -1 ? cells[telDriverNightIdx] : '';

    let driverName = driverDay;
    if (driverDay && driverNight) {
      driverName = `${driverDay} (กลางวัน) / ${driverNight} (กลางคืน)`;
    } else if (driverNight) {
      driverName = `${driverNight} (กลางคืน)`;
    }

    items.push({
      route: cells[routeIdx] || 'Unknown Route',
      planEta: cells[etaIdx] || '-',
      planEtd: cells[etdIdx] || '-',
      truckType: cells[typeIdx] || '6W',
      plateNo: plateNo.trim(),
      driverName: driverName.trim() || 'ไม่ระบุคนขับ',
      company: cells[companyIdx] || 'Unknown',
      driverDay,
      driverNight,
      telDriverDay,
      telDriverNight
    });
  }
  return items;
}

/**
 * Parses API GPS CSV sheet
 */
export function parseGpsCSV(gpsCsv: string): GpsItem[] {
  if (!gpsCsv) return [];
  const lines = gpsCsv.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase());

  let plateIdx = 0;
  let statusIdx = 1;
  let stationIdx = 2;
  let timeIdx = 3;
  let speedIdx = 4;
  let latIdx = 5;
  let lngIdx = 6;

  headers.forEach((h, idx) => {
    const headerStr = h.trim();
    if (headerStr.includes('ทะเบียนรถ') || headerStr.includes('plate') || headerStr.includes('car')) {
      plateIdx = idx;
    } else if (headerStr.includes('สถานะ') || headerStr.includes('status')) {
      statusIdx = idx;
    } else if (headerStr.includes('สถานี') || headerStr.includes('station') || headerStr.includes('สถานที่') || headerStr.includes('ชื่อสถานี')) {
      stationIdx = idx;
    } else if (headerStr.includes('เวลากล่อง') || headerStr.includes('box time') || headerStr.includes('เวลา')) {
      timeIdx = idx;
    } else if (headerStr.includes('ความเร็ว') || headerStr.includes('speed')) {
      speedIdx = idx;
    } else if (headerStr.includes('ละติจูด') || headerStr.includes('latitude') || headerStr.includes('lat')) {
      latIdx = idx;
    } else if (headerStr.includes('ลองจิจูด') || headerStr.includes('longitude') || headerStr.includes('lng') || headerStr.includes('lon')) {
      lngIdx = idx;
    }
  });

  const items: GpsItem[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]);
    if (cells.length === 0) continue;
    const plateNo = cells[plateIdx];
    if (!plateNo) continue;

    const lat = parseFloat(cells[latIdx]) || 0;
    const lng = parseFloat(cells[lngIdx]) || 0;
    
    // Clean speed number
    const speedRaw = cells[speedIdx] ? cells[speedIdx].replace(/[^\d]/g, '') : '0';
    const speed = parseInt(speedRaw, 10) || 0;

    items.push({
      plateNo: plateNo.trim(),
      statusText: cells[statusIdx] || '',
      stationName: cells[stationIdx] || '',
      boxTime: cells[timeIdx] || '',
      speed,
      lat,
      lng
    });
  }
  return items;
}

/**
 * Merges Plan and GPS CSV strings into TruckData[]
 */
export function mergeSheetsData(planCsv: string, gpsCsv: string): TruckData[] {
  const TPCAP_LAT = 13.624926053598525;
  const TPCAP_LNG = 101.01461799137373;

  const planItems = parsePlanCSV(planCsv);
  const gpsItems = parseGpsCSV(gpsCsv);

  return planItems.map((plan, index) => {
    // Find matching GPS item by plate number
    const gps = gpsItems.find(g => isPlateMatch(g.plateNo, plan.plateNo));
    
    let speed = 0;
    let lat = TPCAP_LAT;
    let lng = TPCAP_LNG;
    let distanceToTpcap = 0;
    let currentLocation = 'ไม่พบสัญญาณ GPS (เช็คเลขทะเบียน)';
    let status: TruckStatus = 'Offline';
    let lastGpsUpdate = 'ไม่มีข้อมูล';
    let hasGps = false;

    if (gps) {
      hasGps = true;
      speed = gps.speed;
      lat = gps.lat;
      lng = gps.lng;
      distanceToTpcap = parseFloat(calculateHaversineDistance(lat, lng, TPCAP_LAT, TPCAP_LNG).toFixed(2));
      currentLocation = gps.stationName || `พิกัด ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      lastGpsUpdate = gps.boxTime || 'เพิ่งอัปเดต';

      // Smart status logic based on proximity and speed
      if (distanceToTpcap <= 0.5) {
        status = 'At_Area';
      } else if (speed > 5 || gps.statusText.includes('รถวิ่ง')) {
        status = 'Traveling';
      } else {
        status = 'Offline';
      }
    }

    // Map latitude and longitude to 0-100% canvas grid values for Eastern Seaboard (Thailand)
    let coordinateX = 15;
    let coordinateY = 35;
    if (hasGps && lat !== 0 && lng !== 0) {
      const x = 15 + (lng - TPCAP_LNG) * 498.64;
      const y = 35 + (TPCAP_LAT - lat) * 49.897;
      coordinateX = Math.max(2, Math.min(98, x));
      coordinateY = Math.max(2, Math.min(98, y));
    }

    const id = `MERGED-${index}-${plan.plateNo}`;

    let driverPhone = '-';
    if (plan.telDriverDay && plan.telDriverNight) {
      driverPhone = `${plan.telDriverDay} (กลางวัน) / ${plan.telDriverNight} (กลางคืน)`;
    } else if (plan.telDriverDay) {
      driverPhone = plan.telDriverDay;
    } else if (plan.telDriverNight) {
      driverPhone = plan.telDriverNight;
    }

    return {
      id,
      plateNo: plan.plateNo,
      route: plan.route,
      logisticsCo: plan.company,
      driverName: plan.driverName,
      driverPhone,
      etaTpcap: plan.planEta,
      etdTpcap: plan.planEtd,
      currentLocation,
      speed,
      distanceToTpcap,
      status,
      lastGpsUpdate,
      coordinateX,
      coordinateY,
      lat: hasGps ? lat : undefined,
      lng: hasGps ? lng : undefined,
      currentRouteIndex: 0,
      routePoints: [
        { x: 15, y: 35 },
        { x: coordinateX, y: coordinateY }
      ],
      timeline: [
        { 
          id: `st-${index}-1`, 
          time: plan.planEtd !== '-' ? plan.planEtd : '08:00', 
          title: 'เวลาแผนออกเดินทาง (ETD)', 
          description: `แผนงานจัดส่งเส้นทาง ${plan.route}`, 
          status: 'completed' 
        },
        { 
          id: `st-${index}-2`, 
          time: lastGpsUpdate, 
          title: gps ? `อัปเดต GPS ล่าสุด (${gps.statusText || 'สัญญาณสด'})` : 'ไม่มีสัญญาณพิกัด', 
          description: currentLocation, 
          status: gps ? 'current' : 'pending' 
        }
      ]
    };
  });
}

/**
 * Extracts Google Spreadsheet ID from a standard URL or publish URL
 */
export function extractSpreadsheetId(url: string): string | null {
  if (!url) return null;
  const dMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (dMatch && dMatch[1]) {
    return dMatch[1];
  }
  const deMatch = url.match(/\/d\/e\/([a-zA-Z0-9-_]+)/);
  if (deMatch && deMatch[1]) {
    return deMatch[1];
  }
  return null;
}

/**
 * Fetches and merges both sheets using Spreadsheet ID
 */
export async function fetchAndMergeSheets(spreadsheetId: string): Promise<TruckData[]> {
  const planUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=Plan`;
  const gpsUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=API%20GPS`;

  const [planRes, gpsRes] = await Promise.all([
    fetch(planUrl),
    fetch(gpsUrl)
  ]);

  if (!planRes.ok) throw new Error(`ล้มเหลวในการดึงข้อมูลจากชีท Plan (HTTP ${planRes.status})`);
  if (!gpsRes.ok) throw new Error(`ล้มเหลวในการดึงข้อมูลจากชีท API GPS (HTTP ${gpsRes.status})`);

  const planText = await planRes.text();
  const gpsText = await gpsRes.text();

  if (planText.trim().toLowerCase().startsWith('<html') || planText.trim().toLowerCase().includes('<!doctype html>')) {
    throw new Error('DETECTED_HTML');
  }

  return mergeSheetsData(planText, gpsText);
}

/**
 * Parses CSV text from a Google Sheet published to the web or exported as CSV.
 * Supports dynamic column detection for maximum robustness.
 */
export function parseSheetCSV(csvText: string): TruckData[] {
  if (!csvText) return [];

  const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 2) return [];

  // Parse header line (index 0)
  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase());

  // Default indices if headers mismatch
  let plateIndex = 0;
  let routeIndex = 1;
  let logisticsIndex = 2;
  let driverIndex = 3;
  let phoneIndex = 4;
  let speedIndex = 5;
  let distanceIndex = 6;
  let locationIndex = 7;
  let statusIndex = 8;
  let etaIndex = 9;
  let etdIndex = 10;
  let lastUpdateIndex = 11;

  // Dynamically map headers based on keywords (both Thai and English)
  headers.forEach((h, idx) => {
    const headerStr = h.trim();
    if (!headerStr) return;

    if (headerStr.includes('ทะเบียน') || headerStr.includes('plate')) {
      plateIndex = idx;
    } else if (headerStr.includes('เส้นทาง') || headerStr.includes('route')) {
      routeIndex = idx;
    } else if (headerStr.includes('บริษัท') || headerStr.includes('logistics') || headerStr.includes('co')) {
      logisticsIndex = idx;
    } else if (headerStr.includes('คนขับ') || headerStr.includes('driver')) {
      driverIndex = idx;
    } else if (headerStr.includes('โทร') || headerStr.includes('phone')) {
      phoneIndex = idx;
    } else if (headerStr.includes('ความเร็ว') || headerStr.includes('speed')) {
      speedIndex = idx;
    } else if (headerStr.includes('ระยะห่าง') || headerStr.includes('distance')) {
      distanceIndex = idx;
    } else if (headerStr.includes('ตำแหน่ง') || headerStr.includes('location')) {
      locationIndex = idx;
    } else if (headerStr.includes('สถานะ') || headerStr.includes('status')) {
      statusIndex = idx;
    } else if (headerStr.includes('eta') || headerStr.includes('arrival')) {
      etaIndex = idx;
    } else if (headerStr.includes('etd') || headerStr.includes('departure')) {
      etdIndex = idx;
    } else if (headerStr.includes('อัปเดต') || headerStr.includes('update') || headerStr.includes('gps')) {
      lastUpdateIndex = idx;
    }
  });

  const result: TruckData[] = [];

  // Process data lines (starting from index 1)
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]);
    
    // Skip empty rows or rows without a plate number
    const plateNo = cells[plateIndex];
    if (!plateNo) continue;

    const route = cells[routeIndex] || 'Unknown Route';
    const logisticsCo = cells[logisticsIndex] || 'Unknown Company';
    const driverName = cells[driverIndex] || 'Unknown Driver';
    const driverPhone = cells[phoneIndex] || '-';
    
    // Clean numbers/decimals
    const speedRaw = cells[speedIndex] ? cells[speedIndex].replace(/[^\d]/g, '') : '0';
    const speed = parseInt(speedRaw, 10) || 0;

    const distanceRaw = cells[distanceIndex] ? cells[distanceIndex].replace(/[^\d.]/g, '') : '0';
    let distanceToTpcap = parseFloat(distanceRaw) || 0;

    const currentLocation = cells[locationIndex] || 'Unknown Location';
    
    // Status normalization
    let status: TruckStatus = 'Offline';
    const statusVal = cells[statusIndex] || '';
    const statusLower = statusVal.toLowerCase();
    
    if (
      statusLower.includes('delivered') || 
      statusLower.includes('ส่งงาน') || 
      statusLower.includes('เสร็จ') || 
      statusLower.includes('สำเร็จ')
    ) {
      status = 'Delivered';
    } else if (
      statusLower.includes('traveling') || 
      statusLower.includes('เดินทาง') || 
      statusLower.includes('วิ่ง') || 
      statusLower.includes('ระหว่าง')
    ) {
      status = 'Traveling';
    } else if (
      statusLower.includes('area') || 
      statusLower.includes('tpcap') || 
      statusLower.includes('ลูกค้า') || 
      statusLower.includes('geofence') ||
      statusLower.includes('จอดในคลัง')
    ) {
      status = 'At_Area';
    } else {
      status = 'Offline'; // Handles "จอด", "offline", "ดับเครื่อง", etc.
    }

    const etaTpcap = cells[etaIndex] || '-';
    const etdTpcap = cells[etdIndex] || '-';
    
    // GPS Coordinates mapping logic
    let coordinateX = 20 + (i * 7) % 65;
    let coordinateY = 15 + (i * 9) % 70;
    let hasRealCoordinates = false;
    let lat: number | null = null;
    let lng: number | null = null;

    // Search cells for GPS coordinates pattern (Latitude, Longitude)
    for (let c = 0; c < cells.length; c++) {
      const cellVal = cells[c] || '';
      const match = cellVal.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
      if (match) {
        lat = parseFloat(match[1]);
        lng = parseFloat(match[2]);
        break;
      }
    }

    const TPCAP_LAT = 13.624926053598525;
    const TPCAP_LNG = 101.01461799137373;

    if (lat !== null && lng !== null) {
      // 1. Calculate real-time distance dynamically using the Haversine formula
      const calculatedDistance = calculateHaversineDistance(lat, lng, TPCAP_LAT, TPCAP_LNG);
      
      // Override or fallback to calculated distance
      if (distanceToTpcap === 0 || isNaN(distanceToTpcap)) {
        distanceToTpcap = parseFloat(calculatedDistance.toFixed(2));
      }

      // 2. Smart Geofence auto-override
      // If truck is closer than 0.5 km (500 meters) to TPCAP, it's considered "At_Area"
      if (calculatedDistance <= 0.5 && status !== 'Delivered') {
        status = 'At_Area';
      }

      // 3. Calibrated linear mapping projection for Eastern Seaboard (Thailand)
      // TPCAP HQ (13.624926, 101.014618) maps EXACTLY to grid x=15, y=35
      // Map Ta Phut (12.683, 101.155) maps EXACTLY to grid x=85, y=82
      const x = 15 + (lng - TPCAP_LNG) * 498.64;
      const y = 35 + (TPCAP_LAT - lat) * 49.897;
      
      coordinateX = Math.max(2, Math.min(98, x));
      coordinateY = Math.max(2, Math.min(98, y));
      hasRealCoordinates = true;
    }

    // Format lastGpsUpdate display
    let lastGpsUpdate = cells[lastUpdateIndex] || 'Just now';
    if (hasRealCoordinates && lat !== null && lng !== null) {
      lastGpsUpdate = `📍 ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }

    result.push({
      id: `SHEET-${i}`,
      plateNo,
      route,
      logisticsCo,
      driverName,
      driverPhone,
      speed,
      distanceToTpcap,
      currentLocation,
      status,
      etaTpcap,
      etdTpcap,
      lastGpsUpdate,
      coordinateX,
      coordinateY,
      lat: hasRealCoordinates && lat !== null ? lat : undefined,
      lng: hasRealCoordinates && lng !== null ? lng : undefined,
      currentRouteIndex: 0,
      routePoints: [
        { x: 15, y: 35 }, // Starts at HQ
        { x: coordinateX, y: coordinateY } // Ends at current coordinate
      ],
      timeline: [
        { 
          id: `st-${i}-1`, 
          time: etdTpcap !== '-' ? etdTpcap : '08:00', 
          title: 'ออกจากจุดสตาร์ท (ETD)', 
          description: 'ข้อมูลเที่ยววิ่งดึงจาก Google Sheet', 
          status: 'completed' 
        },
        { 
          id: `st-${i}-2`, 
          time: lastGpsUpdate, 
          title: 'อัปเดตพิกัดดาวเทียมล่าสุด', 
          description: currentLocation, 
          status: 'current' 
        }
      ]
    });
  }

  return result;
}
