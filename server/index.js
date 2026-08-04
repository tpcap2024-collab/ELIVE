import express from 'express';
import cors from 'cors';

const app =
  express();

const PORT =
  Number(
    process.env.PORT ||
    10000
  );

const RAW_APPS_SCRIPT_URL =
  process.env.APPS_SCRIPT_URL ||
  '';

const APPS_SCRIPT_URL =
  String(
    RAW_APPS_SCRIPT_URL
  )
    .trim()
    .replace(
      /^['"]|['"];?$/g,
      ''
    )
    .replace(
      /[;\s]+$/g,
      ''
    )
    .replace(
      /\/+$/,
      ''
    );

const TPCAP_LATITUDE =
  13.623729606202758;

const TPCAP_LONGITUDE =
  101.01501162061923;

const OSRM_BASE_URL =
  'https://router.project-osrm.org';

const FRESH_CACHE_DURATION_MS =
  60000;

const STALE_CACHE_DURATION_MS =
  1800000;

const MASTER_PLAN_CACHE_DURATION_MS =
  60000;

const APPS_SCRIPT_TIMEOUT_MS =
  60000;

const ROUTE_TIMEOUT_MS =
  15000;

const APPS_SCRIPT_MAX_ATTEMPTS =
  3;

const RETRYABLE_STATUS_CODES =
  new Set([
    404,
    408,
    425,
    429,
    500,
    502,
    503,
    504,
  ]);

const allowedOrigins = [
  'https://elive.onrender.com',
  'http://localhost:5173',
  'http://localhost:3000',
];

let truckDataCache =
  null;

let truckDataCacheTime =
  0;

let truckDataRequestPromise =
  null;

let masterPlanCache =
  null;

let masterPlanCacheTime =
  0;

let masterPlanRequestPromise =
  null;

let lastAppsScriptSuccessTime =
  null;

let lastAppsScriptErrorTime =
  null;

let lastAppsScriptError =
  null;

app.use(
  cors({
    origin(
      origin,
      callback
    ) {
      if (
        !origin ||
        allowedOrigins.includes(
          origin
        )
      ) {
        callback(
          null,
          true
        );

        return;
      }

      callback(
        new Error(
          `Origin not allowed: ${origin}`
        )
      );
    },

    methods: [
      'GET',
      'POST',
      'OPTIONS',
    ],

    allowedHeaders: [
      'Content-Type',
      'Accept',
    ],
  })
);

app.use(
  express.json({
    limit:
      '10mb',
  })
);

app.use(
  express.text({
    type:
      'text/plain',

    limit:
      '10mb',
  })
);

function wait(
  milliseconds
) {
  return new Promise(
    resolve => {
      setTimeout(
        resolve,
        milliseconds
      );
    }
  );
}

function isValidLatitude(
  value
) {
  return (
    Number.isFinite(
      value
    ) &&
    value >= -90 &&
    value <= 90
  );
}

function isValidLongitude(
  value
) {
  return (
    Number.isFinite(
      value
    ) &&
    value >= -180 &&
    value <= 180
  );
}

function validateAppsScriptUrl() {
  if (
    !APPS_SCRIPT_URL
  ) {
    throw new Error(
      'APPS_SCRIPT_URL is not configured on Render.'
    );
  }

  if (
    !APPS_SCRIPT_URL.startsWith(
      'https://script.google.com/macros/s/'
    )
  ) {
    throw new Error(
      'APPS_SCRIPT_URL must start with https://script.google.com/macros/s/'
    );
  }

  if (
    !APPS_SCRIPT_URL.endsWith(
      '/exec'
    )
  ) {
    throw new Error(
      'APPS_SCRIPT_URL must end with /exec'
    );
  }

  if (
    APPS_SCRIPT_URL.includes(
      'script.googleusercontent.com'
    )
  ) {
    throw new Error(
      'APPS_SCRIPT_URL must use the permanent script.google.com deployment URL.'
    );
  }
}

function getMaskedAppsScriptUrl() {
  if (
    !APPS_SCRIPT_URL
  ) {
    return 'NOT_CONFIGURED';
  }

  if (
    APPS_SCRIPT_URL.length <=
    45
  ) {
    return 'CONFIGURED';
  }

  return (
    APPS_SCRIPT_URL.slice(
      0,
      34
    ) +
    '...' +
    APPS_SCRIPT_URL.slice(
      -12
    )
  );
}

function getTruckCacheAgeMs() {
  if (
    !truckDataCache ||
    truckDataCacheTime <= 0
  ) {
    return null;
  }

  return (
    Date.now() -
    truckDataCacheTime
  );
}

function hasFreshTruckCache() {
  const cacheAgeMs =
    getTruckCacheAgeMs();

  return (
    cacheAgeMs !== null &&
    cacheAgeMs <=
      FRESH_CACHE_DURATION_MS
  );
}

function hasUsableStaleTruckCache() {
  const cacheAgeMs =
    getTruckCacheAgeMs();

  return (
    cacheAgeMs !== null &&
    cacheAgeMs <=
      STALE_CACHE_DURATION_MS
  );
}

function getMasterPlanCacheAgeMs() {
  if (
    !masterPlanCache ||
    masterPlanCacheTime <= 0
  ) {
    return null;
  }

  return (
    Date.now() -
    masterPlanCacheTime
  );
}

function hasFreshMasterPlanCache() {
  const cacheAgeMs =
    getMasterPlanCacheAgeMs();

  return (
    cacheAgeMs !== null &&
    cacheAgeMs <=
      MASTER_PLAN_CACHE_DURATION_MS
  );
}

function createTruckCacheResponse(
  data,
  source
) {
  const cacheAgeMs =
    getTruckCacheAgeMs();

  return {
    ...data,

    meta: {
      source,

      cacheAgeSeconds:
        cacheAgeMs === null
          ? 0
          : Math.max(
              0,
              Math.round(
                cacheAgeMs /
                1000
              )
            ),

      serverTime:
        new Date()
          .toISOString(),

      lastAppsScriptSuccessTime,

      lastAppsScriptErrorTime,
    },
  };
}

function normalizeWorkingDays(
  value
) {
  if (
    !Array.isArray(
      value
    )
  ) {
    return [
      1,
      2,
      3,
      4,
      5,
      6,
    ];
  }

  const uniqueDays =
    new Set();

  for (
    const item of value
  ) {
    const dayNumber =
      Number(
        item
      );

    if (
      Number.isInteger(
        dayNumber
      ) &&
      dayNumber >= 1 &&
      dayNumber <= 7
    ) {
      uniqueDays.add(
        dayNumber
      );
    }
  }

  return Array.from(
    uniqueDays
  ).sort(
    (
      first,
      second
    ) =>
      first -
      second
  );
}

function validatePlanPeriodRequest(
  body
) {
  if (
    !body ||
    typeof body !==
      'object' ||
    Array.isArray(
      body
    )
  ) {
    throw new Error(
      'Request body is required.'
    );
  }

  const startDate =
    String(
      body.startDate ||
      ''
    ).trim();

  const endDate =
    String(
      body.endDate ||
      ''
    ).trim();

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      startDate
    )
  ) {
    throw new Error(
      'startDate must use yyyy-MM-dd format.'
    );
  }

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      endDate
    )
  ) {
    throw new Error(
      'endDate must use yyyy-MM-dd format.'
    );
  }

  const workingDays =
    normalizeWorkingDays(
      body.workingDays
    );

  if (
    workingDays.length ===
    0
  ) {
    throw new Error(
      'At least one working day is required.'
    );
  }

  return {
    startDate,
    endDate,
    workingDays,
  };
}

function getResponsePreview(
  responseText
) {
  return String(
    responseText ||
    ''
  )
    .replace(
      /\s+/g,
      ' '
    )
    .trim()
    .slice(
      0,
      300
    );
}

function getResponseHost(
  response
) {
  try {
    return new URL(
      response.url
    ).host;
  } catch {
    return 'unknown';
  }
}

function parseJsonText(
  responseText,
  errorMessage
) {
  try {
    return JSON.parse(
      responseText
    );
  } catch {
    throw new Error(
      errorMessage
    );
  }
}

async function fetchWithTimeout(
  url,
  options,
  timeoutMilliseconds
) {
  const controller =
    new AbortController();

  const timeoutId =
    setTimeout(
      () => {
        controller.abort();
      },
      timeoutMilliseconds
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
  action
) {
  validateAppsScriptUrl();

  const query =
    new URLSearchParams({
      action,
      t:
        String(
          Date.now()
        ),
    });

  const requestUrl =
    `${APPS_SCRIPT_URL}?${query.toString()}`;

  let finalError =
    null;

  for (
    let attempt = 1;
    attempt <=
      APPS_SCRIPT_MAX_ATTEMPTS;
    attempt += 1
  ) {
    try {
      console.log(
        `Calling Google Apps Script GET ${action}, attempt ${attempt} of ${APPS_SCRIPT_MAX_ATTEMPTS}`
      );

      const response =
        await fetchWithTimeout(
          requestUrl,
          {
            method:
              'GET',

            redirect:
              'follow',

            headers: {
              Accept:
                'application/json',

              'User-Agent':
                'ELIVE-API/2.0',
            },

            cache:
              'no-store',
          },
          APPS_SCRIPT_TIMEOUT_MS
        );

      const responseText =
        await response.text();

      if (
        response.ok
      ) {
        const data =
          parseJsonText(
            responseText,
            `Google Apps Script ${action} returned invalid JSON.`
          );

        if (
          data &&
          data.error
        ) {
          throw new Error(
            String(
              data.error
            )
          );
        }

        if (
          data &&
          data.status &&
          data.status !==
            'success'
        ) {
          throw new Error(
            `Google Apps Script ${action} did not return success status.`
          );
        }

        lastAppsScriptSuccessTime =
          new Date()
            .toISOString();

        lastAppsScriptErrorTime =
          null;

        lastAppsScriptError =
          null;

        console.log(
          `Google Apps Script ${action} loaded successfully.`
        );

        return data;
      }

      const statusError =
        new Error(
          `Google Apps Script returned HTTP ${response.status}.`
        );

      statusError.statusCode =
        response.status;

      finalError =
        statusError;

      console.error(
        `Google Apps Script GET ${action} failed:`,
        {
          attempt,

          status:
            response.status,

          finalHost:
            getResponseHost(
              response
            ),

          responsePreview:
            getResponsePreview(
              responseText
            ),
        }
      );

      if (
        !RETRYABLE_STATUS_CODES.has(
          response.status
        )
      ) {
        break;
      }
    } catch (error) {
      finalError =
        error;

      console.error(
        `Google Apps Script GET ${action} connection error:`,
        {
          attempt,

          errorName:
            error instanceof Error
              ? error.name
              : 'UnknownError',

          errorMessage:
            error instanceof Error
              ? error.message
              : String(
                  error
                ),
        }
      );
    }

    if (
      attempt <
      APPS_SCRIPT_MAX_ATTEMPTS
    ) {
      const delayMs =
        attempt === 1
          ? 1000
          : 2500;

      await wait(
        delayMs
      );
    }
  }

  const finalMessage =
    finalError instanceof Error
      ? finalError.message
      : `Google Apps Script ${action} request failed.`;

  lastAppsScriptError =
    finalMessage;

  lastAppsScriptErrorTime =
    new Date()
      .toISOString();

  throw new Error(
    finalMessage
  );
}

async function requestAppsScriptPost(
  action,
  payload
) {
  validateAppsScriptUrl();

  console.log(
    `Calling Google Apps Script POST ${action}`
  );

  const response =
    await fetchWithTimeout(
      APPS_SCRIPT_URL,
      {
        method:
          'POST',

        redirect:
          'follow',

        headers: {
          'Content-Type':
            'text/plain;charset=utf-8',

          Accept:
            'application/json',

          'User-Agent':
            'ELIVE-API/2.0',
        },

        body:
          JSON.stringify({
            action,
            ...payload,
          }),

        cache:
          'no-store',
      },
      APPS_SCRIPT_TIMEOUT_MS
    );

  const responseText =
    await response.text();

  if (
    !response.ok
  ) {
    console.error(
      `Google Apps Script POST ${action} failed:`,
      {
        status:
          response.status,

        finalHost:
          getResponseHost(
            response
          ),

        responsePreview:
          getResponsePreview(
            responseText
          ),
      }
    );

    throw new Error(
      `Google Apps Script ${action} returned HTTP ${response.status}.`
    );
  }

  const data =
    parseJsonText(
      responseText,
      `Google Apps Script ${action} returned invalid JSON.`
    );

  if (
    data &&
    data.error
  ) {
    throw new Error(
      String(
        data.error
      )
    );
  }

  if (
    data &&
    data.success ===
      false
  ) {
    throw new Error(
      String(
        data.error ||
        `${action} was not successful.`
      )
    );
  }

  if (
    data &&
    data.status &&
    data.status !==
      'success'
  ) {
    throw new Error(
      `Google Apps Script ${action} did not return success status.`
    );
  }

  lastAppsScriptSuccessTime =
    new Date()
      .toISOString();

  lastAppsScriptErrorTime =
    null;

  lastAppsScriptError =
    null;

  return data;
}

async function requestAppsScriptTruckData() {
  const data =
    await requestAppsScriptGet(
      'getTrucks'
    );

  if (
    !data ||
    data.status !==
      'success'
  ) {
    throw new Error(
      'Google Apps Script did not return truck data successfully.'
    );
  }

  truckDataCache =
    data;

  truckDataCacheTime =
    Date.now();

  return data;
}

async function getTruckDataWithCache(
  forceRefresh = false
) {
  if (
    !forceRefresh &&
    hasFreshTruckCache()
  ) {
    return {
      data:
        truckDataCache,

      source:
        'fresh-cache',
    };
  }

  if (
    truckDataRequestPromise
  ) {
    try {
      const data =
        await truckDataRequestPromise;

      return {
        data,

        source:
          'shared-request',
      };
    } catch (error) {
      if (
        hasUsableStaleTruckCache()
      ) {
        return {
          data:
            truckDataCache,

          source:
            'stale-cache',
        };
      }

      throw error;
    }
  }

  truckDataRequestPromise =
    requestAppsScriptTruckData();

  try {
    const data =
      await truckDataRequestPromise;

    return {
      data,

      source:
        'google-apps-script',
    };
  } catch (error) {
    if (
      hasUsableStaleTruckCache()
    ) {
      console.warn(
        'Using stale truck cache because Google Apps Script is temporarily unavailable.'
      );

      return {
        data:
          truckDataCache,

        source:
          'stale-cache',
      };
    }

    throw error;
  } finally {
    truckDataRequestPromise =
      null;
  }
}

async function getMasterPlanWithCache(
  forceRefresh = false
) {
  if (
    !forceRefresh &&
    hasFreshMasterPlanCache()
  ) {
    return {
      data:
        masterPlanCache,

      source:
        'fresh-cache',
    };
  }

  if (
    masterPlanRequestPromise
  ) {
    const data =
      await masterPlanRequestPromise;

    return {
      data,

      source:
        'shared-request',
    };
  }

  masterPlanRequestPromise =
    requestAppsScriptGet(
      'getMasterPlan'
    );

  try {
    const data =
      await masterPlanRequestPromise;

    if (
      !data ||
      data.success !==
        true
    ) {
      throw new Error(
        'Google Apps Script did not return Master Plan successfully.'
      );
    }

    masterPlanCache =
      data;

    masterPlanCacheTime =
      Date.now();

    return {
      data,

      source:
        'google-apps-script',
    };
  } finally {
    masterPlanRequestPromise =
      null;
  }
}

function clearTruckCache() {
  truckDataCache =
    null;

  truckDataCacheTime =
    0;
}

function clearMasterPlanCache() {
  masterPlanCache =
    null;

  masterPlanCacheTime =
    0;
}

async function parseUpstreamJson(
  response
) {
  const responseText =
    await response.text();

  if (
    !responseText
  ) {
    return {};
  }

  return parseJsonText(
    responseText,
    'Upstream service returned invalid JSON.'
  );
}

app.get(
  '/',
  (
    req,
    res
  ) => {
    return res.json({
      status:
        'success',

      service:
        'ELIVE API',

      version:
        '5',

      message:
        'Backend proxy is running.',

      appsScriptUrl:
        getMaskedAppsScriptUrl(),

      timestamp:
        new Date()
          .toISOString(),
    });
  }
);

app.get(
  '/health',
  (
    req,
    res
  ) => {
    const truckCacheAgeMs =
      getTruckCacheAgeMs();

    const masterCacheAgeMs =
      getMasterPlanCacheAgeMs();

    return res.json({
      status:
        'ok',

      version:
        '5',

      routes: [
        '/health',
        '/api/trucks',
        '/api/trucks/update',
        '/api/master-plan',
        '/api/plans/preview',
        '/api/plans/create',
        '/api/route-to-tpcap',
      ],

      appsScript: {
        configured:
          Boolean(
            APPS_SCRIPT_URL
          ),

        validFormat:
          Boolean(
            APPS_SCRIPT_URL &&
            APPS_SCRIPT_URL.startsWith(
              'https://script.google.com/macros/s/'
            ) &&
            APPS_SCRIPT_URL.endsWith(
              '/exec'
            )
          ),

        lastSuccess:
          lastAppsScriptSuccessTime,

        lastError:
          lastAppsScriptErrorTime,

        lastErrorMessage:
          lastAppsScriptError,
      },

      truckCache: {
        available:
          Boolean(
            truckDataCache
          ),

        ageSeconds:
          truckCacheAgeMs === null
            ? null
            : Math.max(
                0,
                Math.round(
                  truckCacheAgeMs /
                  1000
                )
              ),

        freshDurationSeconds:
          Math.round(
            FRESH_CACHE_DURATION_MS /
            1000
          ),

        staleDurationSeconds:
          Math.round(
            STALE_CACHE_DURATION_MS /
            1000
          ),
      },

      masterPlanCache: {
        available:
          Boolean(
            masterPlanCache
          ),

        ageSeconds:
          masterCacheAgeMs === null
            ? null
            : Math.max(
                0,
                Math.round(
                  masterCacheAgeMs /
                  1000
                )
              ),

        freshDurationSeconds:
          Math.round(
            MASTER_PLAN_CACHE_DURATION_MS /
            1000
          ),
      },

      destination: {
        name:
          'TPCAP',

        latitude:
          TPCAP_LATITUDE,

        longitude:
          TPCAP_LONGITUDE,
      },

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
      const forceRefresh =
        String(
          req.query.refresh ||
          ''
        ).toLowerCase() ===
          'true';

      const result =
        await getTruckDataWithCache(
          forceRefresh
        );

      res.setHeader(
        'Cache-Control',
        'no-store'
      );

      res.setHeader(
        'X-ELIVE-Data-Source',
        result.source
      );

      return res
        .status(200)
        .json(
          createTruckCacheResponse(
            result.data,
            result.source
          )
        );
    } catch (error) {
      console.error(
        'GET /api/trucks failed:',
        error instanceof Error
          ? error.message
          : error
      );

      return res
        .status(502)
        .json({
          success:
            false,

          error:
            error instanceof Error
              ? error.message
              : 'Unable to retrieve truck data.',

          cacheAvailable:
            Boolean(
              truckDataCache
            ),

          timestamp:
            new Date()
              .toISOString(),
        });
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
      const forceRefresh =
        String(
          req.query.refresh ||
          ''
        ).toLowerCase() ===
          'true';

      const result =
        await getMasterPlanWithCache(
          forceRefresh
        );

      res.setHeader(
        'Cache-Control',
        'no-store'
      );

      res.setHeader(
        'X-ELIVE-Data-Source',
        result.source
      );

      return res
        .status(200)
        .json({
          ...result.data,

          meta: {
            source:
              result.source,

            cacheAgeSeconds:
              Math.max(
                0,
                Math.round(
                  (
                    Date.now() -
                    masterPlanCacheTime
                  ) /
                  1000
                )
              ),

            serverTime:
              new Date()
                .toISOString(),
          },
        });
    } catch (error) {
      console.error(
        'GET /api/master-plan failed:',
        error instanceof Error
          ? error.message
          : error
      );

      return res
        .status(502)
        .json({
          success:
            false,

          error:
            error instanceof Error
              ? error.message
              : 'Unable to retrieve Master Plan.',

          timestamp:
            new Date()
              .toISOString(),
        });
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
        validatePlanPeriodRequest(
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
      console.error(
        'POST /api/plans/preview failed:',
        error instanceof Error
          ? error.message
          : error
      );

      return res
        .status(400)
        .json({
          success:
            false,

          error:
            error instanceof Error
              ? error.message
              : 'Unable to preview Plan period.',

          timestamp:
            new Date()
              .toISOString(),
        });
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
        validatePlanPeriodRequest(
          req.body
        );

      const result =
        await requestAppsScriptPost(
          'createPlanPeriod',
          request
        );

      clearTruckCache();

      return res
        .status(200)
        .json(result);
    } catch (error) {
      console.error(
        'POST /api/plans/create failed:',
        error instanceof Error
          ? error.message
          : error
      );

      return res
        .status(400)
        .json({
          success:
            false,

          error:
            error instanceof Error
              ? error.message
              : 'Unable to create Plan period.',

          timestamp:
            new Date()
              .toISOString(),
        });
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
      const requestBody =
        typeof req.body ===
        'string'
          ? parseJsonText(
              req.body,
              'Request body is not valid JSON.'
            )
          : req.body;

      if (
        !requestBody ||
        typeof requestBody !==
          'object' ||
        Array.isArray(
          requestBody
        )
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            error:
              'Request body is required.',
          });
      }

      const truckId =
        String(
          requestBody.truckId ||
          ''
        ).trim();

      if (
        !truckId
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            error:
              'truckId is required.',
          });
      }

      if (
        !Array.isArray(
          requestBody.newRow
        )
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            error:
              'newRow must be an array.',
          });
      }

      const result =
        await requestAppsScriptPost(
          'updateTruck',
          {
            truckId,

            newRow:
              requestBody.newRow,
          }
        );

      clearTruckCache();

      return res
        .status(200)
        .json(result);
    } catch (error) {
      console.error(
        'POST /api/trucks/update failed:',
        error instanceof Error
          ? error.message
          : error
      );

      return res
        .status(502)
        .json({
          success:
            false,

          error:
            error instanceof Error
              ? error.message
              : 'Unable to update truck data.',

          timestamp:
            new Date()
              .toISOString(),
        });
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
            success:
              false,

            error:
              'Valid lat and lng query parameters are required.',
          });
      }

      const coordinates =
        `${longitude},${latitude};` +
        `${TPCAP_LONGITUDE},${TPCAP_LATITUDE}`;

      const routeUrl =
        `${OSRM_BASE_URL}` +
        '/route/v1/driving/' +
        `${coordinates}` +
        '?overview=full' +
        '&geometries=geojson' +
        '&steps=false';

      const routeResponse =
        await fetchWithTimeout(
          routeUrl,
          {
            method:
              'GET',

            headers: {
              Accept:
                'application/json',

              'User-Agent':
                'ELIVE-API/2.0',
            },
          },
          ROUTE_TIMEOUT_MS
        );

      const routeData =
        await parseUpstreamJson(
          routeResponse
        );

      if (
        !routeResponse.ok
      ) {
        return res
          .status(502)
          .json({
            success:
              false,

            error:
              routeData.message ||
              `Routing service error: ${routeResponse.status}`,
          });
      }

      if (
        routeData.code !==
        'Ok'
      ) {
        return res
          .status(404)
          .json({
            success:
              false,

            error:
              routeData.message ||
              'No driving route to TPCAP was found.',

            code:
              routeData.code,
          });
      }

      const route =
        Array.isArray(
          routeData.routes
        )
          ? routeData.routes[0]
          : null;

      if (
        !route
      ) {
        return res
          .status(404)
          .json({
            success:
              false,

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
            success:
              false,

            error:
              'Routing service returned invalid route values.',
          });
      }

      const durationMinutes =
        Math.max(
          1,
          Math.round(
            durationSeconds /
            60
          )
        );

      const estimatedArrivalDate =
        new Date(
          Date.now() +
          Math.round(
            durationSeconds *
            1000
          )
        );

      const estimatedArrivalBangkok =
        estimatedArrivalDate
          .toLocaleString(
            'en-GB',
            {
              timeZone:
                'Asia/Bangkok',

              year:
                'numeric',

              month:
                '2-digit',

              day:
                '2-digit',

              hour:
                '2-digit',

              minute:
                '2-digit',

              second:
                '2-digit',

              hour12:
                false,
            }
          );

      res.setHeader(
        'Cache-Control',
        'public, max-age=45'
      );

      return res
        .status(200)
        .json({
          success:
            true,

          origin: {
            latitude,
            longitude,
          },

          destination: {
            name:
              'TPCAP',

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
              ).toFixed(
                1
              )
            ),

          durationSeconds,

          durationMinutes,

          estimatedArrival:
            estimatedArrivalDate
              .toISOString(),

          estimatedArrivalBangkok,

          geometry:
            route.geometry,
        });
    } catch (error) {
      console.error(
        'GET /api/route-to-tpcap failed:',
        error instanceof Error
          ? error.message
          : error
      );

      if (
        error instanceof Error &&
        error.name ===
          'AbortError'
      ) {
        return res
          .status(504)
          .json({
            success:
              false,

            error:
              'Routing service timeout.',
          });
      }

      return res
        .status(500)
        .json({
          success:
            false,

          error:
            error instanceof Error
              ? error.message
              : 'Unable to calculate route to TPCAP.',
        });
    }
  }
);

app.post(
  '/api/cache/clear',
  (
    req,
    res
  ) => {
    clearTruckCache();
    clearMasterPlanCache();

    return res.json({
      success:
        true,

      message:
        'ELIVE API cache cleared.',

      timestamp:
        new Date()
          .toISOString(),
    });
  }
);

app.use(
  (
    req,
    res
  ) => {
    return res
      .status(404)
      .json({
        success:
          false,

        error:
          'API route not found.',

        path:
          req.path,
      });
  }
);

app.use(
  (
    error,
    req,
    res,
    next
  ) => {
    console.error(
      'Server error:',
      error
    );

    return res
      .status(500)
      .json({
        success:
          false,

        error:
          error instanceof Error
            ? error.message
            : 'Internal server error.',
      });
  }
);

try {
  validateAppsScriptUrl();

  console.log(
    'Apps Script URL validated:',
    getMaskedAppsScriptUrl()
  );
} catch (error) {
  console.error(
    'Apps Script configuration warning:',
    error instanceof Error
      ? error.message
      : error
  );
}

app.listen(
  PORT,
  '0.0.0.0',
  () => {
    console.log(
      `ELIVE API version 5 is running on port ${PORT}`
    );
  }
);
