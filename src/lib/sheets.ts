import {
  Truck,
  TruckStatus,
  PerformanceStatus,
  GpsLocation,
} from '../types';

import {
  calculatePerformanceStatus,
} from '../utils';

const DEFAULT_API_URL =
  'https://elive-api.onrender.com';

export const getAppsScriptUrl = (): string => {
  const env = (import.meta as any).env;

  const apiUrl =
    env?.VITE_API_URL ||
    DEFAULT_API_URL;

  return String(apiUrl)
    .trim()
    .replace(/\/+$/, '');
};

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

  const timeText =
    String(timeValue).trim();

  if (!timeText) {
    return '';
  }

  if (timeText.includes('T')) {
    const date =
      new Date(timeText);

    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleTimeString(
        'en-GB',
        {
          timeZone: 'Asia/Bangkok',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }
      );
    }
  }

  const timeMatch =
    timeText.match(
      /^(\d{1,2}):(\d{2})/
    );

  if (timeMatch) {
    const hour =
      String(
        Number(timeMatch[1])
      ).padStart(2, '0');

    const minute =
      timeMatch[2];

    return `${hour}:${minute}`;
  }

  return timeText;
}

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

  const dateText =
    String(dateValue).trim();

  if (!dateText) {
    return '';
  }

  const plainDateMatch =
    dateText.match(
      /^(\d{4})-(\d{2})-(\d{2})$/
    );

  if (plainDateMatch) {
    return (
      `${plainDateMatch[1]}-` +
      `${plainDateMatch[2]}-` +
      `${plainDateMatch[3]}`
    );
  }

  const date =
    new Date(dateText);

  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleDateString(
      'en-CA',
      {
        timeZone: 'Asia/Bangkok',
      }
    );
  }

  return dateText;
}

function getApiError(
  data: unknown
): string | null {
  if (
    typeof data === 'object' &&
    data !== null &&
    'error' in data
  ) {
    const errorValue =
      (
        data as {
          error?: unknown;
        }
      ).error;

    if (errorValue) {
      return String(errorValue);
    }
  }

  return null;
}

async function fetchEliveApiData():
  Promise<any> {
  const apiUrl =
    getAppsScriptUrl();

  if (!apiUrl) {
    throw new Error(
      'Render Backend API URL is not configured.'
    );
  }

  const requestUrl =
    `${apiUrl}/api/trucks?t=${Date.now()}`;

  let response: Response;

  try {
    response = await fetch(
      requestUrl,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        cache: 'no-store',
      }
    );
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
      `Failed to fetch ELIVE data ` +
      `(${response.status} ${response.statusText})`;

    try {
      const errorData =
        await response.json();

      const apiError =
        getApiError(errorData);

      if (apiError) {
        errorMessage =
          apiError;
      }
    } catch {
      console.error(
        'Unable to read ELIVE API error response.'
      );
    }

    throw new Error(
      errorMessage
    );
  }

  let data: any;

  try {
    data =
      await response.json();
  } catch (error) {
    console.error(
      'ELIVE API returned invalid JSON:',
      error
    );

    throw new Error(
      'The ELIVE Backend API returned invalid JSON.'
    );
  }

  const apiError =
    getApiError(data);

  if (apiError) {
    throw new Error(
      apiError
    );
  }

  if (data.status !== 'success') {
    throw new Error(
      'The ELIVE Backend API did not return success status.'
    );
  }

  return data;
}

function mapTruckStatus(
  currentStatus: string
): TruckStatus {
  const normalizedStatus =
    String(currentStatus || '')
      .trim()
      .toLowerCase();

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
    normalizedStatus.includes(
      'unloading at tpcap'
    ) ||
    normalizedStatus.includes('arrive') ||
    normalizedStatus.includes('arrived') ||
    normalizedStatus.includes('ถึง')
  ) {
    return 'UNLOADING_AT_TPCAP';
  }

  if (
    normalizedStatus.includes('dock in')
  ) {
    return 'DOCK_IN';
  }

  if (
    normalizedStatus.includes('กำลังลงงาน') ||
    normalizedStatus.includes('dock') ||
    normalizedStatus.includes('unloading') ||
    normalizedStatus.includes(
      'unload at tpcap'
    )
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

function mapPerformanceStatus(
  efficiencyStatus: string
): PerformanceStatus {
  const normalizedPerformance =
    String(efficiencyStatus || '')
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

export async function fetchTrucksFromSheets():
  Promise<Truck[]> {
  const data =
    await fetchEliveApiData();

  const planData: any[][] =
    Array.isArray(data.plan)
      ? data.plan
      : [];

  const actualData: any[][] =
    Array.isArray(data.actual)
      ? data.actual
      : [];

  const planRows =
    planData.slice(1);

  const actualRows =
    actualData.slice(1);

  const actualMap =
    new Map<string, any[]>();

  for (const row of actualRows) {
    if (!Array.isArray(row)) {
      continue;
    }

    const codeRun =
      String(row[0] || '').trim();

    if (codeRun) {
      actualMap.set(
        codeRun,
        row
      );
    }
  }

  const trucks: Truck[] = [];

  for (const row of planRows) {
    if (!Array.isArray(row)) {
      continue;
    }

    const codeRun =
      String(row[0] || '').trim();

    if (!codeRun) {
      continue;
    }

    const actualRow =
      actualMap.get(codeRun);

    const planDate =
      parseGoogleSheetsDate(
        row[1]
      );

    const planEta =
      parseGoogleSheetsTime(
        row[10]
      );

    const planEtd =
      parseGoogleSheetsTime(
        row[11]
      );

    let currentStatus =
      'TRAVELING';

    let efficiencyStatus =
      'ON_PLAN';

    let stampEta = '';
    let stampEtd = '';

    let actionProblem = '';
    let actionCountermeasure = '';
    let actionResponsible = '';
    let actionStatus = '';

    if (actualRow) {
      currentStatus =
        String(
          actualRow[1] ||
          'TRAVELING'
        );

      efficiencyStatus =
        String(
          actualRow[2] ||
          'ON_PLAN'
        );

      stampEta =
        parseGoogleSheetsTime(
          actualRow[4]
        );

      stampEtd =
        parseGoogleSheetsTime(
          actualRow[5]
        );

      actionProblem =
        String(
          actualRow[6] || ''
        );

      actionCountermeasure =
        String(
          actualRow[7] || ''
        );

      actionResponsible =
        String(
          actualRow[8] || ''
        );

      actionStatus =
        String(
          actualRow[9] || ''
        );
    }

    const mappedStatus =
      mapTruckStatus(
        currentStatus
      );

    let performanceStatus =
      mapPerformanceStatus(
        efficiencyStatus
      );

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

      route:
        String(row[2] || ''),

      supplierName:
        String(row[3] || ''),

      licensePlate:
        String(row[4] || ''),

      truckType:
        String(row[5] || ''),

      driverName:
        String(row[6] || ''),

      phone:
        String(row[7] || ''),

      dropPoint:
        String(row[9] || ''),

      planEta,
      planEtd,

      status:
        mappedStatus,

      performanceStatus,

      stampEta,
      stampEtd,

      actionProblem,
      actionCountermeasure,
      actionResponsible,
      actionStatus,

      lastUpdated:
        new Date()
          .toLocaleTimeString(
            'en-GB',
            {
              timeZone:
                'Asia/Bangkok',
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

export async function updateTruckInSheets(
  truckId: string,
  updates: Partial<Truck>,
  currentTruck: Truck
): Promise<void> {
  const apiUrl =
    getAppsScriptUrl();

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
    new Date()
      .toLocaleString(
        'en-GB',
        {
          timeZone:
            'Asia/Bangkok',
          hour12: false,
        }
      );

  const currentStatus =
    updates.status !== undefined
      ? updates.status
      : currentTruck.status;

  const stampEta =
    updates.stampEta !== undefined
      ? updates.stampEta
      : currentTruck.stampEta;

  const stampEtd =
    updates.stampEtd !== undefined
      ? updates.stampEtd
      : currentTruck.stampEtd;

  let efficiencyStatus:
    PerformanceStatus =
      updates.performanceStatus !== undefined
        ? updates.performanceStatus
        : currentTruck.performanceStatus;

  if (
    stampEta &&
    currentTruck.planEta &&
    currentTruck.planEtd
  ) {
    efficiencyStatus =
      calculatePerformanceStatus(
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

  let response: Response;

  try {
    response = await fetch(
      `${apiUrl}/api/trucks/update`,
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/json',
          Accept:
            'application/json',
        },
        body: JSON.stringify({
          truckId,
          newRow,
        }),
      }
    );
  } catch (error) {
    console.error(
      'Unable to update Google Sheets:',
      error
    );

    throw new Error(
      'Unable to connect to ELIVE API while updating.'
    );
  }

  if (!response.ok) {
    let errorMessage =
      `Failed to update Google Sheet ` +
      `(${response.status} ${response.statusText})`;

    try {
      const errorData =
        await response.json();

      const apiError =
        getApiError(errorData);

      if (apiError) {
        errorMessage =
          apiError;
      }
    } catch {
      console.error(
        'Unable to read update error response.'
      );
    }

    throw new Error(
      errorMessage
    );
  }

  let result: any;

  try {
    result =
      await response.json();
  } catch (error) {
    console.error(
      'ELIVE API returned invalid update response:',
      error
    );

    throw new Error(
      'ELIVE API returned an invalid update response.'
    );
  }

  const apiError =
    getApiError(result);

  if (apiError) {
    throw new Error(
      apiError
    );
  }

  if (result.success !== true) {
    throw new Error(
      'The server did not confirm the update.'
    );
  }
}

function normalizeGpsHeader(
  value: unknown
): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s/g, '');
}

function findGpsColumn(
  headers: string[],
  possibleNames: string[]
): number {
  return headers.findIndex(
    header =>
      possibleNames.some(
        name =>
          header.includes(
            normalizeGpsHeader(name)
          )
      )
  );
}

function parseGpsNumber(
  value: unknown
): number {
  const text =
    String(value ?? '')
      .trim()
      .replace(/\s/g, '')
      .replace(',', '.');

  return Number(text);
}

function readGpsCell(
  row: any[],
  columnIndex: number
): string {
  if (columnIndex < 0) {
    return '';
  }

  return String(
    row[columnIndex] ?? ''
  ).trim();
}

export async function fetchGpsLocations():
  Promise<GpsLocation[]> {
  const data =
    await fetchEliveApiData();

  const gpsData: any[][] =
    Array.isArray(data.gps)
      ? data.gps
      : [];

  console.log(
    'GPS RAW ROW COUNT:',
    gpsData.length
  );

  if (gpsData.length <= 1) {
    return [];
  }

  const headers =
    gpsData[0].map(
      normalizeGpsHeader
    );

  const gpsIdIndex =
    findGpsColumn(
      headers,
      [
        'GPS ID',
        'GPSID',
        'รหัส GPS',
      ]
    );

  const licensePlateIndex =
    findGpsColumn(
      headers,
      [
        'ทะเบียนรถ',
        'License Plate',
        'Truck Name',
        'Plate',
      ]
    );

  const latitudeIndex =
    findGpsColumn(
      headers,
      [
        'ละติจูด',
        'Latitude',
        'Lat',
      ]
    );

  const longitudeIndex =
    findGpsColumn(
      headers,
      [
        'ลองจิจูด',
        'Longitude',
        'Lng',
        'Lon',
      ]
    );

  const speedIndex =
    findGpsColumn(
      headers,
      [
        'ความเร็ว',
        'Speed',
      ]
    );

  const headingIndex =
    findGpsColumn(
      headers,
      [
        'ทิศทาง',
        'Heading',
        'Direction',
      ]
    );

  const locationNameIndex =
    findGpsColumn(
      headers,
      [
        'ชื่อสถานที่',
        'สถานที่',
        'Location',
      ]
    );

  const gpsTimeIndex =
    findGpsColumn(
      headers,
      [
        'เวลา GPS',
        'GPS Time',
        'GPS Datetime',
      ]
    );

  const gpsStatusIndex =
    findGpsColumn(
      headers,
      [
        'สถานะ',
        'Status',
      ]
    );

  const receivedAtIndex =
    findGpsColumn(
      headers,
      [
        'เวลาที่ระบบดึงข้อมูล',
        'เวลารับข้อมูล',
        'Received At',
        'Update Time',
      ]
    );

  console.log(
    'GPS COLUMN INDEXES:',
    {
      gpsIdIndex,
      licensePlateIndex,
      latitudeIndex,
      longitudeIndex,
      speedIndex,
      headingIndex,
      locationNameIndex,
      gpsTimeIndex,
      gpsStatusIndex,
      receivedAtIndex,
    }
  );

  if (
    latitudeIndex === -1 ||
    longitudeIndex === -1
  ) {
    throw new Error(
      'ไม่พบคอลัมน์ละติจูดหรือลองจิจูดในข้อมูล GPS'
    );
  }

  const locations:
    GpsLocation[] = [];

  const gpsRows =
    gpsData.slice(1);

  for (const row of gpsRows) {
    if (!Array.isArray(row)) {
      continue;
    }

    const gpsId =
      readGpsCell(
        row,
        gpsIdIndex
      );

    const licensePlate =
      readGpsCell(
        row,
        licensePlateIndex
      );

    const latitude =
      parseGpsNumber(
        row[latitudeIndex]
      );

    const longitude =
      parseGpsNumber(
        row[longitudeIndex]
      );

    const speed =
      speedIndex >= 0
        ? parseGpsNumber(
            row[speedIndex]
          )
        : 0;

    const heading =
      headingIndex >= 0
        ? parseGpsNumber(
            row[headingIndex]
          )
        : 0;

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      console.warn(
        'Skipping invalid GPS row:',
        {
          gpsId,
          licensePlate,
          latitude,
          longitude,
        }
      );

      continue;
    }

    const fallbackGpsId =
      `${latitude},${longitude}`;

    locations.push({
      gpsId:
        gpsId ||
        fallbackGpsId,

      licensePlate,

      latitude,
      longitude,

      speed:
        Number.isFinite(speed)
          ? speed
          : 0,

      heading:
        Number.isFinite(heading)
          ? heading
          : 0,

      locationName:
        readGpsCell(
          row,
          locationNameIndex
        ),

      gpsTime:
        readGpsCell(
          row,
          gpsTimeIndex
        ),

      gpsStatus:
        readGpsCell(
          row,
          gpsStatusIndex
        ),

      receivedAt:
        readGpsCell(
          row,
          receivedAtIndex
        ),
    });
  }

  console.log(
    'PARSED GPS COUNT:',
    locations.length
  );

  console.log(
    'PARSED GPS LOCATIONS:',
    locations
  );

  return locations;
}
