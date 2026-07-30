import express from 'express';
import cors from 'cors';

const app = express();

const PORT =
  process.env.PORT || 10000;

const APPS_SCRIPT_URL =
  process.env.APPS_SCRIPT_URL;

const TPCAP_LATITUDE =
  13.623729606202758;

const TPCAP_LONGITUDE =
  101.01501162061923;

const OSRM_BASE_URL =
  'https://router.project-osrm.org';

const allowedOrigins = [
  'https://elive.onrender.com',
  'http://localhost:5173',
  'http://localhost:3000',
];

app.use(
  cors({
    origin(origin, callback) {
      if (
        !origin ||
        allowedOrigins.includes(origin)
      ) {
        callback(null, true);
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
    Number.isFinite(value) &&
    value >= -90 &&
    value <= 90
  );
}

function isValidLongitude(
  value
) {
  return (
    Number.isFinite(value) &&
    value >= -180 &&
    value <= 180
  );
}

async function parseJsonResponse(
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
  (req, res) => {
    res.json({
      status: 'success',
      service: 'ELIVE API',
      message:
        'Backend proxy is running.',
    });
  }
);

app.get(
  '/health',
  (req, res) => {
    res.json({
      status: 'ok',
      version: '3',

      routes: [
        '/health',
        '/api/trucks',
        '/api/trucks/update',
        '/api/route-to-tpcap',
      ],

      destination: {
        name: 'TPCAP',
        latitude:
          TPCAP_LATITUDE,
        longitude:
          TPCAP_LONGITUDE,
      },

      timestamp:
        new Date().toISOString(),
    });
  }
);

app.get(
  '/api/trucks',
  async (req, res) => {
    try {
      if (!APPS_SCRIPT_URL) {
        return res
          .status(500)
          .json({
            error:
              'APPS_SCRIPT_URL is not configured on Render.',
          });
      }

      const separator =
        APPS_SCRIPT_URL.includes('?')
          ? '&'
          : '?';

      const googleUrl =
        `${APPS_SCRIPT_URL}${separator}` +
        `action=getTrucks`;

      const googleResponse =
        await fetch(
          googleUrl,
          {
            method: 'GET',
            redirect: 'follow',

            headers: {
              Accept:
                'application/json',
            },
          }
        );

      const responseText =
        await googleResponse.text();

      if (!googleResponse.ok) {
        console.error(
          'Google Apps Script GET error:',
          googleResponse.status,
          responseText
        );

        return res
          .status(502)
          .json({
            error:
              'Google Apps Script request failed.',

            upstreamStatus:
              googleResponse.status,
          });
      }

      let data;

      try {
        data =
          JSON.parse(
            responseText
          );
      } catch {
        const contentType =
          googleResponse
            .headers
            .get('content-type') || '';

        const responsePreview =
          responseText
            .slice(0, 1000)
            .replace(/\s+/g, ' ')
            .trim();

        console.error(
          'Apps Script returned invalid JSON:',
          {
            status:
              googleResponse.status,

            finalUrl:
              googleResponse.url,

            contentType,

            responsePreview,
          }
        );

        return res
          .status(502)
          .json({
            error:
              'Google Apps Script returned invalid JSON.',

            upstreamStatus:
              googleResponse.status,

            finalUrl:
              googleResponse.url,

            contentType,

            responsePreview,
          });
      }

      if (data.error) {
        return res
          .status(502)
          .json({
            error:
              data.error,
          });
      }

      res.setHeader(
        'Cache-Control',
        'no-store'
      );

      return res.json(data);
    } catch (error) {
      console.error(
        'GET /api/trucks failed:',
        error
      );

      return res
        .status(500)
        .json({
          error:
            error instanceof Error
              ? error.message
              : 'Unable to retrieve truck data.',
        });
    }
  }
);

app.post(
  '/api/trucks/update',
  async (req, res) => {
    try {
      if (!APPS_SCRIPT_URL) {
        return res
          .status(500)
          .json({
            error:
              'APPS_SCRIPT_URL is not configured on Render.',
          });
      }

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

      if (!requestData.truckId) {
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
        await fetch(
          APPS_SCRIPT_URL,
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
                action:
                  'updateTruck',

                truckId:
                  requestData.truckId,

                newRow:
                  requestData.newRow,
              }),
          }
        );

      const responseText =
        await googleResponse.text();

      if (!googleResponse.ok) {
        console.error(
          'Google Apps Script POST error:',
          googleResponse.status,
          responseText
        );

        return res
          .status(502)
          .json({
            error:
              'Google Apps Script update failed.',

            upstreamStatus:
              googleResponse.status,
          });
      }

      let data;

      try {
        data =
          JSON.parse(
            responseText
          );
      } catch {
        console.error(
          'Invalid update JSON from Google Apps Script:',
          responseText
        );

        return res
          .status(502)
          .json({
            error:
              'Google Apps Script returned an invalid update response.',
          });
      }

      if (data.error) {
        return res
          .status(502)
          .json({
            error:
              data.error,
          });
      }

      return res.json(data);
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
  async (req, res) => {
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

      const controller =
        new AbortController();

      const timeoutId =
        setTimeout(
          () => {
            controller.abort();
          },
          15000
        );

      let routeResponse;

      try {
        routeResponse =
          await fetch(
            routeUrl,
            {
              method: 'GET',

              headers: {
                Accept:
                  'application/json',
              },

              signal:
                controller.signal,
            }
          );
      } finally {
        clearTimeout(
          timeoutId
        );
      }

      const routeData =
        await parseJsonResponse(
          routeResponse
        );

      if (!routeResponse.ok) {
        console.error(
          'OSRM request failed:',
          routeResponse.status,
          routeData
        );

        return res
          .status(502)
          .json({
            error:
              routeData.message ||
              `Routing service error: ${routeResponse.status}`,
          });
      }

      if (
        routeData.code !== 'Ok'
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
            durationSeconds / 60
          )
        );

      const estimatedArrivalDate =
        new Date(
          Date.now() +
          durationSeconds * 1000
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
  (req, res) => {
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

app.listen(
  PORT,
  '0.0.0.0',
  () => {
    console.log(
      `ELIVE API is running on port ${PORT}`
    );
  }
);
