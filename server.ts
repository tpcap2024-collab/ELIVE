import express from 'express';
import path from 'path';
import {
  createServer as createViteServer,
} from 'vite';

const DEFAULT_APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbwV9sfFxE-9lN4A08EKGq55_RlBjlVcvK6Bdeddj8GT0-6huxxnz8oyT7zunl69PK3qJA/exec';

const SERVER_VERSION = '10';
const TPCAP_LATITUDE = 13.623729606202758;
const TPCAP_LONGITUDE = 101.01501162061923;
const OSRM_BASE_URL = 'https://router.project-osrm.org';
const APPS_SCRIPT_TIMEOUT_MS = 60000;
const ROUTE_TIMEOUT_MS = 15000;
const MAX_UPLOAD_ROWS = 500;

const ALLOWED_ORIGINS = [
  'https://elive.onrender.com',
  'http://localhost:3000',
  'http://localhost:5173',
];

type MasterPlanRowInput = {
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
};

type PlanSource =
  | 'master-plan'
  | 'uploaded-file';

type EditablePlanInput = {
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
  remark?: string;
  workDetail?: string;
};

function getAppsScriptUrl(): string {
  const configuredUrl =
    process.env.APPS_SCRIPT_URL ||
    DEFAULT_APPS_SCRIPT_URL;

  return String(configuredUrl)
    .trim()
    .replace(/^['"]|['"];?$/g, '')
    .replace(/[;\s]+$/g, '')
    .replace(/\/+$/, '');
}

function isValidLatitude(
  value: number
): boolean {
  return (
    Number.isFinite(value) &&
    value >= -90 &&
    value <= 90
  );
}

function isValidLongitude(
  value: number
): boolean {
  return (
    Number.isFinite(value) &&
    value >= -180 &&
    value <= 180
  );
}

function getErrorMessage(
  error: unknown
): string {
  if (
    error instanceof Error &&
    error.message
  ) {
    return error.message;
  }

  return String(
    error ||
    'Unknown error'
  );
}

function cleanText(
  value: unknown
): string {
  return String(
    value ?? ''
  ).trim();
}

function validateDateText(
  value: unknown,
  fieldName: string
): string {
  const text =
    cleanText(value);

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      text
    )
  ) {
    throw new Error(
      `${fieldName} must use yyyy-MM-dd format.`
    );
  }

  const [
    year,
    month,
    day,
  ] = text
    .split('-')
    .map(Number);

  const date =
    new Date(
      year,
      month - 1,
      day
    );

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error(
      `${fieldName} is invalid.`
    );
  }

  return text;
}

function validateTimeText(
  value: unknown,
  fieldName: string
): string {
  const text =
    cleanText(value);

  const match =
    text.match(
      /^(\d{1,2}):(\d{2})$/
    );

  if (!match) {
    throw new Error(
      `${fieldName} must use HH:mm format.`
    );
  }

  const hour =
    Number(match[1]);

  const minute =
    Number(match[2]);

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    throw new Error(
      `${fieldName} is invalid.`
    );
  }

  return (
    String(hour).padStart(
      2,
      '0'
    ) +
    ':' +
    String(minute).padStart(
      2,
      '0'
    )
  );
}

function validateSheetRow(
  value: unknown
): number {
  const sheetRow =
    Number(value);

  if (
    !Number.isInteger(
      sheetRow
    ) ||
    sheetRow < 2
  ) {
    throw new Error(
      'sheetRow must be an integer greater than or equal to 2.'
    );
  }

  return sheetRow;
}

function normalizeMasterPlanRow(
  value: unknown
): MasterPlanRowInput {
  const source =
    value &&
    typeof value === 'object' &&
    !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;

  if (!source) {
    throw new Error(
      'Master Plan data is required.'
    );
  }

  const row: MasterPlanRowInput = {
    route:
      cleanText(source.route),

    company:
      cleanText(source.company),

    truckName:
      cleanText(source.truckName),

    truckType:
      cleanText(source.truckType),

    driverName:
      cleanText(source.driverName),

    telDriver:
      cleanText(source.telDriver),

    project:
      cleanText(source.project),

    dropPoint:
      cleanText(source.dropPoint),

    planEta:
      validateTimeText(
        source.planEta,
        'Plan ETA'
      ),

    planEtd:
      validateTimeText(
        source.planEtd,
        'Plan ETD'
      ),
  };

  if (!row.route) {
    throw new Error(
      'Route is required.'
    );
  }

  if (!row.company) {
    throw new Error(
      'Company is required.'
    );
  }

  if (!row.truckName) {
    throw new Error(
      'Truck Name is required.'
    );
  }

  if (!row.truckType) {
    throw new Error(
      'Truck Type is required.'
    );
  }

  if (!row.project) {
    throw new Error(
      'Project is required.'
    );
  }

  if (!row.dropPoint) {
    throw new Error(
      'Drop Point is required.'
    );
  }

  return row;
}

function normalizeWorkingDays(
  value: unknown
): number[] {
  const input =
    Array.isArray(value)
      ? value
      : [
          1,
          2,
          3,
          4,
          5,
          6,
        ];

  return [
    ...new Set(
      input
        .map(Number)
        .filter(
          day =>
            Number.isInteger(
              day
            ) &&
            day >= 1 &&
            day <= 7
        )
    ),
  ].sort(
    (
      first,
      second
    ) =>
      first - second
  );
}

function normalizeTemplateRows(
  value: unknown
): MasterPlanRowInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  if (
    value.length >
    MAX_UPLOAD_ROWS
  ) {
    throw new Error(
      `Uploaded Plan cannot exceed ${MAX_UPLOAD_ROWS} rows.`
    );
  }

  return value
    .map(item => {
      if (
        !item ||
        typeof item !== 'object' ||
        Array.isArray(item)
      ) {
        return null;
      }

      const row =
        item as Record<string, unknown>;

      return {
        route:
          cleanText(row.route),

        company:
          cleanText(row.company),

        truckName:
          cleanText(row.truckName),

        truckType:
          cleanText(row.truckType),

        driverName:
          cleanText(row.driverName),

        telDriver:
          cleanText(row.telDriver),

        project:
          cleanText(row.project),

        dropPoint:
          cleanText(row.dropPoint),

        planEta:
          cleanText(row.planEta),

        planEtd:
          cleanText(row.planEtd),
      };
    })
    .filter(
      (
        row
      ): row is MasterPlanRowInput =>
        Boolean(
          row &&
          Object.values(row).some(
            item =>
              item !== ''
          )
        )
    );
}

function normalizePlanPeriodRequest(
  value: unknown
) {
  const body =
    value &&
    typeof value === 'object' &&
    !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;

  if (!body) {
    throw new Error(
      'Request body is required.'
    );
  }

  const startDate =
    validateDateText(
      body.startDate,
      'startDate'
    );

  const endDate =
    validateDateText(
      body.endDate,
      'endDate'
    );

  if (
    endDate < startDate
  ) {
    throw new Error(
      'endDate must not be earlier than startDate.'
    );
  }

  const workingDays =
    normalizeWorkingDays(
      body.workingDays
    );

  if (
    workingDays.length === 0
  ) {
    throw new Error(
      'At least one working day is required.'
    );
  }

  const source: PlanSource =
    body.source ===
      'uploaded-file'
      ? 'uploaded-file'
      : 'master-plan';

  const templateRows =
    source ===
      'uploaded-file'
      ? normalizeTemplateRows(
          body.templateRows
        )
      : undefined;

  if (
    source ===
      'uploaded-file' &&
    !templateRows?.length
  ) {
    throw new Error(
      'Uploaded Plan file has no valid rows.'
    );
  }

  return {
    startDate,
    endDate,
    workingDays,
    source,
    templateRows,

    fileName:
      body.fileName
        ? cleanText(
            body.fileName
          )
        : undefined,
  };
}

function normalizeEditablePlan(
  value: unknown
): EditablePlanInput {
  const wrapper =
    value &&
    typeof value === 'object' &&
    !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;

  const source =
    wrapper?.plan &&
    typeof wrapper.plan === 'object' &&
    !Array.isArray(wrapper.plan)
      ? wrapper.plan as Record<string, unknown>
      : wrapper;

  if (!source) {
    throw new Error(
      'Plan data is required.'
    );
  }

  const plan: EditablePlanInput = {
    date:
      validateDateText(
        source.date,
        'date'
      ),

    route:
      cleanText(source.route),

    company:
      cleanText(source.company),

    truckName:
      cleanText(source.truckName),

    truckType:
      cleanText(source.truckType),

    driverName:
      cleanText(source.driverName),

    telDriver:
      cleanText(source.telDriver),

    project:
      cleanText(source.project),

    dropPoint:
      cleanText(source.dropPoint),

    planEta:
      validateTimeText(
        source.planEta,
        'Plan ETA'
      ),

    planEtd:
      validateTimeText(
        source.planEtd,
        'Plan ETD'
      ),

    remark:
      source.remark ===
        undefined
        ? undefined
        : cleanText(
            source.remark
          ).toUpperCase(),
    workDetail:
      cleanText(
        source.workDetail
      ),
  };

  if (!plan.route) {
    throw new Error(
      'Route is required.'
    );
  }

  if (!plan.company) {
    throw new Error(
      'Company is required.'
    );
  }

  if (!plan.truckName) {
    throw new Error(
      'Truck Name is required.'
    );
  }

  if (!plan.truckType) {
    throw new Error(
      'Truck Type is required.'
    );
  }

  if (!plan.project) {
    throw new Error(
      'Project is required.'
    );
  }

  if (!plan.dropPoint) {
    throw new Error(
      'Drop Point is required.'
    );
  }

  return plan;
}

function normalizeCodeRun(
  value: unknown
): string {
  const codeRun =
    cleanText(value)
      .toUpperCase();

  if (
    !/^A\d+$/.test(
      codeRun
    )
  ) {
    throw new Error(
      'codeRun format is invalid.'
    );
  }

  return codeRun;
}

async function readJsonResponse(
  response: Response
): Promise<any> {
  const responseText =
    await response.text();

  if (!responseText) {
    return {};
  }

  try {
    return JSON.parse(
      responseText
    );
  } catch {
    throw new Error(
      'Upstream service returned invalid JSON.'
    );
  }
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller =
    new AbortController();

  const timeoutId =
    setTimeout(
      () =>
        controller.abort(),
      timeoutMs
    );

  try {
    return await fetch(
      url,
      {
        ...options,
        signal:
          controller.signal,
      }
    );
  } finally {
    clearTimeout(
      timeoutId
    );
  }
}

async function requestAppsScriptGet(
  action: string,
  parameters: Record<
    string,
    string
  > = {}
): Promise<any> {
  const scriptUrl =
    getAppsScriptUrl();

  const query =
    new URLSearchParams({
      action,
      ...parameters,
      t: String(
        Date.now()
      ),
    });

  const response =
    await fetchWithTimeout(
      `${scriptUrl}?${query.toString()}`,
      {
        method: 'GET',
        redirect: 'follow',
        headers: {
          Accept:
            'application/json',
        },
        cache: 'no-store',
      },
      APPS_SCRIPT_TIMEOUT_MS
    );

  const data =
    await readJsonResponse(
      response
    );

  if (!response.ok) {
    throw new Error(
      data?.error ||
      `Apps Script error: ${response.status}`
    );
  }

  if (
    data?.error ||
    data?.success === false
  ) {
    throw new Error(
      String(
        data?.error ||
        `${action} was not successful.`
      )
    );
  }

  return data;
}

/*
 * Mutation requests are intentionally sent once only.
 * Retrying could create duplicate rows when Apps Script writes successfully
 * but the response is delayed or lost.
 */
async function requestAppsScriptPost(
  action: string,
  payload: Record<
    string,
    unknown
  > = {}
): Promise<any> {
  const response =
    await fetchWithTimeout(
      getAppsScriptUrl(),
      {
        method: 'POST',
        redirect: 'follow',
        headers: {
          'Content-Type':
            'text/plain;charset=utf-8',
          Accept:
            'application/json',
        },
        body:
          JSON.stringify({
            action,
            ...payload,
          }),
        cache: 'no-store',
      },
      APPS_SCRIPT_TIMEOUT_MS
    );

  const data =
    await readJsonResponse(
      response
    );

  if (!response.ok) {
    throw new Error(
      data?.error ||
      `Apps Script error: ${response.status}`
    );
  }

  if (
    data?.error ||
    data?.success === false
  ) {
    throw new Error(
      String(
        data?.error ||
        `${action} was not successful.`
      )
    );
  }

  return data;
}

function sendRouteError(
  res: express.Response,
  error: unknown,
  fallbackMessage: string,
  statusCode = 400
) {
  const message =
    getErrorMessage(error) ||
    fallbackMessage;

  console.error(
    fallbackMessage,
    message
  );

  return res
    .status(statusCode)
    .json({
      success: false,
      error: message,
      timestamp:
        new Date()
          .toISOString(),
    });
}

async function startServer() {
  const app =
    express();

  const PORT =
    Number(
      process.env.PORT ||
      3000
    );

  app.use(
    express.json({
      limit: '10mb',
    })
  );

  app.use(
    (
      req,
      res,
      next
    ) => {
      const requestOrigin =
        req.headers.origin;

      if (
        requestOrigin &&
        ALLOWED_ORIGINS.includes(
          requestOrigin
        )
      ) {
        res.setHeader(
          'Access-Control-Allow-Origin',
          requestOrigin
        );
      }

      res.setHeader(
        'Vary',
        'Origin'
      );

      res.setHeader(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, DELETE, OPTIONS'
      );

      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Accept'
      );

      if (
        req.method ===
        'OPTIONS'
      ) {
        return res
          .status(204)
          .end();
      }

      next();
    }
  );

  app.get(
    '/api/health',
    (
      req,
      res
    ) => {
      return res
        .status(200)
        .json({
          success: true,
          status: 'ok',
          service: 'ELIVE API',
          version:
            SERVER_VERSION,
          routes: [
            '/api/health',
            '/api/trucks',
            '/api/trucks/update',
            '/api/master-plan',
            '/api/master-plan/rows',
            '/api/master-plan/rows/:sheetRow',
            '/api/plans/preview',
            '/api/plans/create',
            '/api/plans/daily',
            '/api/plans/extra',
            '/api/plans/:codeRun',
            '/api/plans/:codeRun/cancel',
            '/api/plans/:codeRun/restore',
            '/api/plans/:codeRun/confirm-work-detail',
            '/api/route-to-tpcap',
            '/api/gps/webhook',
          ],
          timestamp:
            new Date()
              .toISOString(),
        });
    }
  );

  app.get(
    '/api/trucks',
    async (
      req,
      res
    ) => {
      try {
        const data =
          await requestAppsScriptGet(
            'getTrucks'
          );

        res.setHeader(
          'Cache-Control',
          'no-store'
        );

        return res
          .status(200)
          .json(data);
      } catch (error) {
        return sendRouteError(
          res,
          error,
          'Unable to fetch Google Sheets data.',
          502
        );
      }
    }
  );

  app.post(
    '/api/trucks/update',
    async (
      req,
      res
    ) => {
      try {
        const truckId =
          cleanText(
            req.body?.truckId
          );

        const newRow =
          req.body?.newRow;

        if (!truckId) {
          throw new Error(
            'truckId is required.'
          );
        }

        if (
          !Array.isArray(
            newRow
          )
        ) {
          throw new Error(
            'newRow must be an array.'
          );
        }

        const result =
          await requestAppsScriptPost(
            'updateTruck',
            {
              truckId,
              newRow,
            }
          );

        return res
          .status(200)
          .json(result);
      } catch (error) {
        return sendRouteError(
          res,
          error,
          'Unable to update Google Sheets.'
        );
      }
    }
  );

  app.get(
    '/api/master-plan',
    async (
      req,
      res
    ) => {
      try {
        const data =
          await requestAppsScriptGet(
            'getMasterPlan'
          );

        res.setHeader(
          'Cache-Control',
          'no-store'
        );

        return res
          .status(200)
          .json(data);
      } catch (error) {
        return sendRouteError(
          res,
          error,
          'Unable to retrieve Master Plan.',
          502
        );
      }
    }
  );

  app.post(
    '/api/master-plan/rows',
    async (
      req,
      res
    ) => {
      try {
        const row =
          normalizeMasterPlanRow(
            req.body?.row ||
            req.body
          );

        const result =
          await requestAppsScriptPost(
            'createMasterPlanRow',
            {
              row,
            }
          );

        return res
          .status(201)
          .json(result);
      } catch (error) {
        return sendRouteError(
          res,
          error,
          'Unable to create Master Plan row.'
        );
      }
    }
  );

  app.put(
    '/api/master-plan/rows/:sheetRow',
    async (
      req,
      res
    ) => {
      try {
        const sheetRow =
          validateSheetRow(
            req.params.sheetRow
          );

        const row =
          normalizeMasterPlanRow(
            req.body?.row ||
            req.body
          );

        const result =
          await requestAppsScriptPost(
            'updateMasterPlanRow',
            {
              sheetRow,
              row,
            }
          );

        return res
          .status(200)
          .json(result);
      } catch (error) {
        return sendRouteError(
          res,
          error,
          'Unable to update Master Plan row.'
        );
      }
    }
  );

  app.delete(
    '/api/master-plan/rows/:sheetRow',
    async (
      req,
      res
    ) => {
      try {
        const sheetRow =
          validateSheetRow(
            req.params.sheetRow
          );

        const result =
          await requestAppsScriptPost(
            'deleteMasterPlanRow',
            {
              sheetRow,
            }
          );

        return res
          .status(200)
          .json(result);
      } catch (error) {
        return sendRouteError(
          res,
          error,
          'Unable to delete Master Plan row.'
        );
      }
    }
  );

  app.post(
    '/api/plans/preview',
    async (
      req,
      res
    ) => {
      try {
        const request =
          normalizePlanPeriodRequest(
            req.body
          );

        const result =
          await requestAppsScriptPost(
            'previewPlanPeriod',
            request
          );

        return res
          .status(200)
          .json(result);
      } catch (error) {
        return sendRouteError(
          res,
          error,
          'Unable to preview Plan period.'
        );
      }
    }
  );

  app.post(
    '/api/plans/create',
    async (
      req,
      res
    ) => {
      try {
        const request =
          normalizePlanPeriodRequest(
            req.body
          );

        const result =
          await requestAppsScriptPost(
            'createPlanPeriod',
            request
          );

        return res
          .status(200)
          .json(result);
      } catch (error) {
        return sendRouteError(
          res,
          error,
          'Unable to create Plan period.'
        );
      }
    }
  );

  app.get(
    '/api/plans/daily',
    async (
      req,
      res
    ) => {
      try {
        const date =
          validateDateText(
            req.query.date,
            'date'
          );

        const result =
          await requestAppsScriptGet(
            'getDailyPlans',
            {
              date,
            }
          );

        res.setHeader(
          'Cache-Control',
          'no-store'
        );

        return res
          .status(200)
          .json(result);
      } catch (error) {
        return sendRouteError(
          res,
          error,
          'Unable to retrieve daily Plans.'
        );
      }
    }
  );

  app.post(
    '/api/plans/extra',
    async (
      req,
      res
    ) => {
      try {
        const plan =
          normalizeEditablePlan(
            req.body
          );

        const result =
          await requestAppsScriptPost(
            'createExtraPlan',
            {
              plan,
            }
          );

        return res
          .status(201)
          .json(result);
      } catch (error) {
        return sendRouteError(
          res,
          error,
          'Unable to create Extra Plan.'
        );
      }
    }
  );

  app.put(
    '/api/plans/:codeRun',
    async (
      req,
      res
    ) => {
      try {
        const codeRun =
          normalizeCodeRun(
            req.params.codeRun
          );

        const plan =
          normalizeEditablePlan(
            req.body
          );

        const result =
          await requestAppsScriptPost(
            'updatePlan',
            {
              codeRun,
              plan,
            }
          );

        return res
          .status(200)
          .json(result);
      } catch (error) {
        return sendRouteError(
          res,
          error,
          'Unable to update Plan.'
        );
      }
    }
  );

  app.post(
    '/api/plans/:codeRun/confirm-work-detail',
    async (
      req,
      res
    ) => {
      try {
        const codeRun = normalizeCodeRun(req.params.codeRun);
        const result = await requestAppsScriptPost(
          'confirmWorkDetail',
          { codeRun }
        );
        return res.status(200).json(result);
      } catch (error) {
        return sendRouteError(
          res,
          error,
          'Unable to confirm Work Detail.'
        );
      }
    }
  );

  app.post(
    '/api/plans/:codeRun/cancel',
    async (
      req,
      res
    ) => {
      try {
        const codeRun =
          normalizeCodeRun(
            req.params.codeRun
          );

        const result =
          await requestAppsScriptPost(
            'cancelPlan',
            {
              codeRun,
            }
          );

        return res
          .status(200)
          .json(result);
      } catch (error) {
        return sendRouteError(
          res,
          error,
          'Unable to cancel Plan.'
        );
      }
    }
  );

  app.post(
    '/api/plans/:codeRun/restore',
    async (
      req,
      res
    ) => {
      try {
        const codeRun =
          normalizeCodeRun(
            req.params.codeRun
          );

        const restoreAs =
          cleanText(
            req.body?.restoreAs ||
            'REGULAR'
          ).toUpperCase();

        if (
          restoreAs !==
            'REGULAR' &&
          restoreAs !==
            'EXTRA'
        ) {
          throw new Error(
            'restoreAs must be REGULAR or EXTRA.'
          );
        }

        const result =
          await requestAppsScriptPost(
            'restorePlan',
            {
              codeRun,
              restoreAs,
            }
          );

        return res
          .status(200)
          .json(result);
      } catch (error) {
        return sendRouteError(
          res,
          error,
          'Unable to restore Plan.'
        );
      }
    }
  );

  app.get(
    '/api/route-to-tpcap',
    async (
      req,
      res
    ) => {
      try {
        const latitude =
          Number(
            req.query.lat
          );

        const longitude =
          Number(
            req.query.lng
          );

        if (
          !isValidLatitude(
            latitude
          ) ||
          !isValidLongitude(
            longitude
          )
        ) {
          return res
            .status(400)
            .json({
              error:
                'Valid lat and lng query parameters are required.',
            });
        }

        const coordinates =
          `${longitude},${latitude};` +
          `${TPCAP_LONGITUDE},${TPCAP_LATITUDE}`;

        const routeUrl =
          `${OSRM_BASE_URL}` +
          `/route/v1/driving/${coordinates}` +
          '?overview=full' +
          '&geometries=geojson' +
          '&steps=false';

        const routeResponse =
          await fetchWithTimeout(
            routeUrl,
            {
              method: 'GET',
              headers: {
                Accept:
                  'application/json',
              },
            },
            ROUTE_TIMEOUT_MS
          );

        const routeData =
          await readJsonResponse(
            routeResponse
          );

        if (
          !routeResponse.ok
        ) {
          return res
            .status(502)
            .json({
              error:
                routeData?.message ||
                `Routing service error: ${routeResponse.status}`,
            });
        }

        if (
          routeData?.code !==
          'Ok'
        ) {
          return res
            .status(404)
            .json({
              error:
                routeData?.message ||
                'No driving route to TPCAP was found.',
              code:
                routeData?.code,
            });
        }

        const route =
          Array.isArray(
            routeData.routes
          )
            ? routeData.routes[0]
            : null;

        if (!route) {
          return res
            .status(404)
            .json({
              error:
                'No driving route to TPCAP was found.',
            });
        }

        const distanceMeters =
          Number(
            route.distance
          );

        const durationSeconds =
          Number(
            route.duration
          );

        if (
          !Number.isFinite(
            distanceMeters
          ) ||
          !Number.isFinite(
            durationSeconds
          )
        ) {
          return res
            .status(502)
            .json({
              error:
                'Routing service returned invalid route values.',
            });
        }

        const estimatedArrival =
          new Date(
            Date.now() +
            durationSeconds *
            1000
          );

        res.setHeader(
          'Cache-Control',
          'public, max-age=45'
        );

        return res
          .status(200)
          .json({
            success: true,

            origin: {
              latitude,
              longitude,
            },

            destination: {
              name: 'TPCAP',
              latitude:
                TPCAP_LATITUDE,
              longitude:
                TPCAP_LONGITUDE,
            },

            distanceMeters,

            distanceKilometers:
              Number(
                (
                  distanceMeters /
                  1000
                ).toFixed(1)
              ),

            durationSeconds,

            durationMinutes:
              Math.max(
                1,
                Math.round(
                  durationSeconds /
                  60
                )
              ),

            estimatedArrival:
              estimatedArrival
                .toISOString(),

            estimatedArrivalBangkok:
              estimatedArrival
                .toLocaleString(
                  'en-GB',
                  {
                    timeZone:
                      'Asia/Bangkok',
                    hour12: false,
                  }
                ),

            geometry:
              route.geometry,
          });
      } catch (error) {
        console.error(
          'Route calculation failed:',
          error
        );

        if (
          error instanceof Error &&
          error.name ===
            'AbortError'
        ) {
          return res
            .status(504)
            .json({
              error:
                'Routing service timeout.',
            });
        }

        return sendRouteError(
          res,
          error,
          'Unable to calculate route to TPCAP.',
          500
        );
      }
    }
  );

  app.post(
    '/api/gps/webhook',
    (
      req,
      res
    ) => {
      const licensePlate =
        cleanText(
          req.body?.licensePlate
        );

      const latitude =
        Number(
          req.body?.lat
        );

      const longitude =
        Number(
          req.body?.lng
        );

      if (
        !licensePlate ||
        !isValidLatitude(
          latitude
        ) ||
        !isValidLongitude(
          longitude
        )
      ) {
        return res
          .status(400)
          .json({
            error:
              'licensePlate, lat and lng are required.',
          });
      }

      return res
        .status(200)
        .json({
          received: true,
          licensePlate,
          latitude,
          longitude,
        });
    }
  );

  app.use(
    [
      '/server.cjs',
      '/server.cjs.map',
      '/server-dist/server.cjs',
      '/server-dist/server.cjs.map',
    ],
    (
      req,
      res
    ) => {
      res.setHeader(
        'Cache-Control',
        'no-store, no-cache, must-revalidate'
      );
      res.setHeader(
        'Pragma',
        'no-cache'
      );
      res.setHeader(
        'X-Content-Type-Options',
        'nosniff'
      );
      return res
        .status(404)
        .type('application/json')
        .send({
          success: false,
          error: 'Not found.',
        });
    }
  );

  if (
    process.env.NODE_ENV !==
    'production'
  ) {
    const vite =
      await createViteServer({
        server: {
          middlewareMode: true,
        },
        appType: 'spa',
      });

    app.use(
      vite.middlewares
    );
  } else {
    const distPath =
      path.join(
        process.cwd(),
        'dist'
      );

    app.use(
      express.static(
        distPath
      )
    );

    app.use(
      (
        req,
        res
      ) => {
        res.sendFile(
          path.join(
            distPath,
            'index.html'
          )
        );
      }
    );
  }

  app.listen(
    PORT,
    '0.0.0.0',
    () => {
      console.log(
        `ELIVE Server version ${SERVER_VERSION} running on port ${PORT}`
      );
    }
  );
}

startServer().catch(
  error => {
    console.error(
      'Unable to start ELIVE Server:',
      error
    );

    process.exit(1);
  }
);
