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

  let response: Response;

  try {
    response = await fetch(
      `${apiUrl}/api/trucks`,
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
      'The ELIVE Backend API returned an invalid response.'
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
      'The ELIVE Backend API did not return a success status.'
    );
  }

  return data;
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

    const normalizedStatus =
      currentStatus
        .trim()
        .toLowerCase();

    let mappedStatus:
      TruckStatus =
        'TRAVELING';

    if (
      normalizedStatus.includes(
        'complete'
      ) ||
      normalizedStatus.includes(
        'completed'
      ) ||
      normalizedStatus.includes(
        'เสร็จ'
      )
    ) {
      mappedStatus =
        'COMPLETED';
    } else if (
      normalizedStatus.includes(
        'truck out'
      ) ||
      normalizedStatus.includes(
        'ออก'
      )
    ) {
      mappedStatus =
        'TRUCK_OUT';
    } else if (
      normalizedStatus.includes(
        'unloading at tpcap'
      ) ||
      normalizedStatus.includes(
        'arrive'
      ) ||
      normalizedStatus.includes(
        'arrived'
      ) ||
      normalizedStatus.includes(
        'ถึง'
      )
    ) {
      mappedStatus =
        'UNLOADING_AT_TPCAP';
    } else if (
      normalizedStatus.includes(
        'กำลังลงงาน'
      ) ||
      normalizedStatus.includes(
        'dock'
      ) ||
      normalizedStatus.includes(
        'unloading'
      ) ||
      normalizedStatus.includes(
        'unload at tpcap'
      )
    ) {
      mappedStatus =
        'UNLOADING';
    } else if (
      normalizedStatus.includes(
        'wait'
      ) ||
      normalizedStatus.includes(
        'waiting'
      ) ||
      normalizedStatus.includes(
        'รอ'
      )
    ) {
      mappedStatus =
        'WAITING_AREA';
    }

    const normalizedPerformance =
      efficiencyStatus
        .trim()
        .toLowerCase();

    let performanceStatus:
      PerformanceStatus =
        'ON_PLAN';

    if (
      normalizedPerformance.includes(
        'delay'
      ) ||
      normalizedPerformance.includes(
        'delayed'
      ) ||
      normalizedPerformance.includes(
        'ดีเล'
      )
    ) {
      performanceStatus =
        'DELAY';
    } else if (
      normalizedPerformance.includes(
        'early'
      ) ||
      normalizedPerformance.includes(
        'ก่อน'
      ) ||
      normalizedPerformance.includes(
        'ไว'
      )
    ) {
      performanceStatus =
        'EARLY';
    } else if (
      normalizedPerformance.includes(
        'warning'
      ) ||
      normalizedPerformance.includes(
        'เตือน'
      )
    ) {
      performanceStatus =
        'WARNING';
    }

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
      updates.performanceStatus !==
      undefined
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
      : currentTruck.actionProblem ||
        '',

    updates.actionCountermeasure !==
    undefined
      ? updates.actionCountermeasure
      : currentTruck
          .actionCountermeasure ||
        '',

    updates.actionResponsible !==
    undefined
      ? updates.actionResponsible
      : currentTruck
          .actionResponsible ||
        '',

    updates.actionStatus !== undefined
      ? updates.actionStatus
      : currentTruck.actionStatus ||
        '',

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
      'Unable to update Google Sheets through ELIVE API:',
      error
    );

    throw new Error(
      'Unable to connect to the ELIVE Backend API while updating data.'
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
      'The ELIVE Backend API returned an invalid update response.'
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

export async function fetchGpsLocations():
  Promise<GpsLocation[]> {
  const data =
    await fetchEliveApiData();

  const gpsData: any[][] =
    Array.isArray(data.gps)
      ? data.gps
      : [];

  if (gpsData.length <= 1) {
    return [];
  }

  const gpsRows =
    gpsData.slice(1);

  const locations:
    GpsLocation[] = [];

  for (const row of gpsRows) {
    if (!Array.isArray(row)) {
      continue;
    }

    const gpsId =
      String(row[0] || '').trim();

    const licensePlate =
      String(row[1] || '').trim();

    const latitude =
      Number(
        String(row[2] || '')
          .trim()
          .replace(',', '.')
      );

    const longitude =
      Number(
        String(row[3] || '')
          .trim()
          .replace(',', '.')
      );

    const speed =
      Number(
        String(row[4] || '0')
          .trim()
          .replace(',', '.')
      );

    const heading =
      Number(
        String(row[5] || '0')
          .trim()
          .replace(',', '.')
      );

    if (
      !gpsId ||
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
      gpsId,
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
        String(row[6] || '').trim(),

      gpsTime:
        String(row[7] || '').trim(),

      gpsStatus:
        String(row[8] || '').trim(),

      receivedAt:
        String(row[9] || '').trim(),
    });
  }

  return locations;
}
