import express from 'express';
import cors from 'cors';

const app =
  express();

const PORT =
  process.env.PORT ||
  10000;

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

const APPS_SCRIPT_TIMEOUT_MS =
  60000;

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
    limit: '1mb',
  })
);

app.use(
  express.text({
    type: 'text/plain',
    limit: '1mb',
  })
);

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

function getCacheAgeMs() {
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
    getCacheAgeMs();

  return (
    cacheAgeMs !== null &&
    cacheAgeMs <=
      FRESH_CACHE_DURATION_MS
  );
}

function hasUsableStaleCache() {
  const cacheAgeMs =
    getCacheAgeMs();

  return (
    cacheAgeMs !== null &&
    cacheAgeMs <=
      STALE_CACHE_DURATION_MS
  );
}

function createCacheResponse(
  data,
  cacheStatus
) {
  const cacheAgeMs =
    getCacheAgeMs();

  return {
    ...data,

    meta: {
      source:
        cacheStatus,

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

function getMaskedAppsScriptUrl() {
  if (!APPS_SCRIPT_URL) {
    return 'NOT_CONFIGURED';
  }

  if (
    APPS_SCRIPT_URL.length <=
    40
  ) {
    return 'CONFIGURED';
  }

  return (
    `${APPS_SCRIPT_URL.slice(
      0,
      34
    )}` +
    `...` +
    `${APPS_SCRIPT_URL.slice(
      -12
    )}`
  );
}

function validateAppsScriptUrl() {
  if (!APPS_SCRIPT_URL) {
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

async function parseJsonText(
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

async function requestAppsScriptTruckData() {
  validateAppsScriptUrl();

  const googleUrl =
    `${APPS_SCRIPT_URL}?action=getTrucks`;

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
        `Calling Google Apps Script, attempt ${attempt} of ${APPS_SCRIPT_MAX_ATTEMPTS}`
      );

      const googleResponse =
        await fetchWithTimeout(
          googleUrl,
          {
            method:
              'GET',

            redirect:
              'follow',

            headers: {
              Accept:
                'application/json',

              'User-Agent':
                'ELIVE-API/1.0',
            },
          },
          APPS_SCRIPT_TIMEOUT_MS
        );

      const responseText =
        await googleResponse.text();

      if (
        googleResponse.ok
      ) {
        const data =
          await parseJsonText(
            responseText,
            'Google Apps Script returned invalid JSON.'
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
          !data ||
          data.status !==
            'success'
        ) {
          throw new Error(
            'Google Apps Script did not return success status.'
          );
        }

        truckDataCache =
          data;

        truckDataCacheTime =
          Date.now();

        lastAppsScriptSuccessTime =
          new Date()
            .toISOString();

        lastAppsScriptErrorTime =
          null;

        lastAppsScriptError =
          null;

        console.log(
          'Google Apps Script data loaded successfully.'
        );

        return data;
      }

      const responsePreview =
        responseText
          .replace(
            /\s+/g,
            ' '
          )
          .trim()
          .slice(
            0,
            300
          );

      const statusError =
        new Error(
          `Google Apps Script returned HTTP ${googleResponse.status}.`
        );

      statusError.statusCode =
        googleResponse.status;

      statusError.responsePreview =
        responsePreview;

      finalError =
        statusError;

      console.error(
        'Google Apps Script request failed:',
        {
          attempt,
          status:
            googleResponse.status,
          finalHost:
            (() => {
              try {
                return new URL(
                  googleResponse.url
                ).host;
              } catch {
                return 'unknown';
              }
            })(),
          responsePreview,
        }
      );

      if (
        !RETRYABLE_STATUS_CODES.has(
          googleResponse.status
        )
      ) {
        break;
      }
    } catch (error) {
      finalError =
        error;

      const errorName =
        error instanceof Error
          ? error.name
          : 'UnknownError';

      const errorMessage =
        error instanceof Error
          ? error.message
          : String(
              error
            );

      console.error(
        'Google Apps Script connection error:',
        {
          attempt,
          errorName,
          errorMessage,
        }
      );
    }

    if (
      attempt <
      APPS_SCRIPT_MAX_ATTEMPTS
    ) {
      const retryDelayMs =
        attempt === 1
          ? 1000
          : 2500;

      console.log(
        `Retrying Google Apps Script in ${retryDelayMs} ms.`
      );

      await wait(
        retryDelayMs
      );
    }
  }

  const finalMessage =
    finalError instanceof Error
      ? finalError.message
      : 'Google Apps Script request failed.';

  lastAppsScriptError =
    finalMessage;

  lastAppsScriptErrorTime =
    new Date()
      .toISOString();

  throw new Error(
    finalMessage
  );
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
    console.log(
      'Waiting for the active Google Apps Script request.'
    );

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
        hasUsableStaleCache()
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
      hasUsableStaleCache()
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

async function parseUpstreamJson(
  response
) {
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

app.get(
  '/',
  (
    req,
    res
  ) => {
    res.json({
      status:
        'success',

      service:
        'ELIVE API',

      message:
        'Backend proxy is running.',

      appsScriptUrl:
        getMaskedAppsScriptUrl(),
    });
  }
);

app.get(
  '/health',
  (
    req,
    res
  ) => {
    const cacheAgeMs =
      getCacheAgeMs();

    res.json({
      status:
        'ok',

      version:
        '4',

      routes: [
        '/health',
        '/api/trucks',
        '/api/trucks/update',
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

      cache: {
        available:
          Boolean(
            truckDataCache
          ),

        ageSeconds:
          cacheAgeMs === null
            ? null
            : Math.max(
                0,
                Math.round(
                  cacheAgeMs /
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
          createCacheResponse(
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
          error:
            error instanceof Error
              ? error.message
              : 'Unable to retrieve truck data.',

          timestamp:
            new Date()
              .toISOString(),

          cacheAvailable:
            Boolean(
              truckDataCache
            ),
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
      validateAppsScriptUrl();

      let requestData =
        req.body;

      if (
        typeof requestData ===
        'string'
      ) {
        try {
          requestData =
            JSON.parse(
              requestData
            );
        } catch {
          return res
            .status(400)
            .json({
              error:
                'Request body is not valid JSON.',
            });
        }
      }

      if (
        !requestData ||
        typeof requestData !==
          'object'
      ) {
        return res
          .status(400)
          .json({
            error:
              'Request body is required.',
          });
      }

      const truckId =
        String(
          requestData.truckId ||
          ''
        ).trim();

      if (!truckId) {
        return res
          .status(400)
          .json({
            error:
              'truckId is required.',
          });
      }

      if (
        !Array.isArray(
          requestData.newRow
        )
      ) {
        return res
          .status(400)
          .json({
            error:
              'newRow must be an array.',
          });
      }

      const googleResponse =
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
                'ELIVE-API/1.0',
            },

            body:
              JSON.stringify({
                action:
                  'updateTruck',

                truckId,

                newRow:
                  requestData.newRow,
              }),
          },
          APPS_SCRIPT_TIMEOUT_MS
        );

      const responseText =
        await googleResponse.text();

      let result;

      try {
        result =
          JSON.parse(
            responseText
          );
      } catch {
        const responsePreview =
          responseText
            .replace(
              /\s+/g,
              ' '
            )
            .trim()
            .slice(
              0,
              300
            );

        console.error(
          'Google Apps Script update returned invalid JSON:',
          {
            status:
              googleResponse.status,

            responsePreview,
          }
        );

        return res
          .status(502)
          .json({
            error:
              'Google Apps Script returned an invalid update response.',
          });
      }

      if (
        !googleResponse.ok
      ) {
        return res
          .status(502)
          .json({
            error:
              result.error ||
              `Google Apps Script update failed with HTTP ${googleResponse.status}.`,
          });
      }

      if (
        result.error
      ) {
        return res
          .status(502)
          .json({
            error:
              String(
                result.error
              ),
          });
      }

      if (
        result.success !==
        true
      ) {
        return res
          .status(502)
          .json({
            error:
              'Google Apps Script did not confirm the update.',
          });
      }

      truckDataCache =
        null;

      truckDataCacheTime =
        0;

      return res
        .status(200)
        .json(result);
    } catch (error) {
      console.error(
        'POST /api/trucks/update failed:',
        error
      );

      return res
        .status(500)
        .json({
          error:
            error instanceof Error
              ? error.message
              : 'Unable to update truck data.',
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
            error:
              'Valid lat and lng query parameters are required.',
          });
      }

      const coordinates =
        `${longitude},${latitude};` +
        `${TPCAP_LONGITUDE},${TPCAP_LATITUDE}`;

      const routeUrl =
        `${OSRM_BASE_URL}` +
        `/route/v1/driving/` +
        `${coordinates}` +
        `?overview=full` +
        `&geometries=geojson` +
        `&steps=false`;

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
                'ELIVE-API/1.0',
            },
          },
          15000
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

      return res
        .status(500)
        .json({
          error:
            error instanceof Error
              ? error.message
              : 'Unable to calculate route to TPCAP.',
        });
    }
  }
);

app.use(
  (
    req,
    res
  ) => {
    res
      .status(404)
      .json({
        error:
          'API route not found.',
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

    res
      .status(500)
      .json({
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
      `ELIVE API is running on port ${PORT}`
    );
  }
);
