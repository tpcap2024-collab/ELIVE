import express from 'express';
import path from 'path';
import {
  createServer as createViteServer,
} from 'vite';

const DEFAULT_APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbwV9sfFxE-9lN4A08EKGq55_RlBjlVcvK6Bdeddj8GT0-6huxxnz8oyT7zunl69PK3qJA/exec';

const TPCAP_LATITUDE =
  13.623729606202758;

const TPCAP_LONGITUDE =
  101.01501162061923;

const OSRM_BASE_URL =
  'https://router.project-osrm.org';

function getAppsScriptUrl(): string {
  const configuredUrl =
    process.env.APPS_SCRIPT_URL ||
    DEFAULT_APPS_SCRIPT_URL;

  return String(configuredUrl)
    .trim()
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

async function startServer() {
  const app =
    express();

  const PORT =
    process.env.RENDER
      ? process.env.PORT || 3000
      : 3000;

  app.use(
    express.json({
      limit: '1mb',
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

      const allowedOrigins = [
        'https://elive.onrender.com',
        'http://localhost:3000',
        'http://localhost:5173',
      ];

      if (
        requestOrigin &&
        allowedOrigins.includes(
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
        'GET, POST, OPTIONS'
      );

      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Accept'
      );

      if (
        req.method === 'OPTIONS'
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
      res.status(200).json({
        success: true,
        service: 'ELIVE API',
        timestamp:
          new Date().toISOString(),
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
        const scriptUrl =
          getAppsScriptUrl();

        const requestUrl =
          `${scriptUrl}?action=getTrucks`;

        const response =
          await fetch(
            requestUrl,
            {
              method: 'GET',
              redirect: 'follow',
              headers: {
                Accept:
                  'application/json',
              },
            }
          );

        const data =
          await readJsonResponse(
            response
          );

        if (!response.ok) {
          return res
            .status(502)
            .json({
              error:
                data?.error ||
                `Apps Script error: ${response.status}`,
            });
        }

        if (data?.error) {
          return res
            .status(502)
            .json({
              error:
                String(
                  data.error
                ),
            });
        }

        res.setHeader(
          'Cache-Control',
          'no-store'
        );

        return res
          .status(200)
          .json(data);
      } catch (error) {
        console.error(
          'Error fetching sheets:',
          error
        );

        return res
          .status(500)
          .json({
            error:
              error instanceof Error
                ? error.message
                : 'Unable to fetch Google Sheets data.',
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
        const scriptUrl =
          getAppsScriptUrl();

        const truckId =
          String(
            req.body?.truckId ||
            ''
          ).trim();

        const newRow =
          req.body?.newRow;

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
            newRow
          )
        ) {
          return res
            .status(400)
            .json({
              error:
                'newRow must be an array.',
            });
        }

        const response =
          await fetch(
            scriptUrl,
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
                  truckId,
                  newRow,
                }),
            }
          );

        const result =
          await readJsonResponse(
            response
          );

        if (!response.ok) {
          return res
            .status(502)
            .json({
              error:
                result?.error ||
                `Apps Script error: ${response.status}`,
            });
        }

        if (result?.error) {
          return res
            .status(400)
            .json({
              error:
                String(
                  result.error
                ),
            });
        }

        if (
          result?.success !== true
        ) {
          return res
            .status(502)
            .json({
              error:
                'Apps Script did not confirm the update.',
              result,
            });
        }

        return res
          .status(200)
          .json({
            success: true,
            message:
              'Truck data updated.',
            result,
          });
      } catch (error) {
        console.error(
          'Error updating sheets:',
          error
        );

        return res
          .status(500)
          .json({
            error:
              error instanceof Error
                ? error.message
                : 'Unable to update Google Sheets.',
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

        const controller =
          new AbortController();

        const timeoutId =
          setTimeout(
            () => {
              controller.abort();
            },
            15000
          );

        let routeResponse:
          Response;

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
            durationSeconds * 1000
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

  app.post(
    '/api/gps/webhook',
    (
      req,
      res
    ) => {
      const licensePlate =
        String(
          req.body?.licensePlate ||
          ''
        ).trim();

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
        `ELIVE Server running on port ${PORT}`
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
