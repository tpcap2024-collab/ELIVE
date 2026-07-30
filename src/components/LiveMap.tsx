import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import L from 'leaflet';

import 'leaflet/dist/leaflet.css';

import {
  Truck,
  GpsLocation,
} from '../types';

import {
  fetchGpsLocations,
} from '../lib/sheets';

import {
  AlertTriangle,
  Clock,
  Gauge,
  LocateFixed,
  MapPin,
  Navigation,
  RefreshCw,
  Truck as TruckIcon,
  Wifi,
  WifiOff,
} from 'lucide-react';

interface LiveMapProps {
  trucks: Truck[];
}

type GpsFreshness =
  | 'LIVE'
  | 'STALE'
  | 'OFFLINE';

const GPS_REFRESH_INTERVAL =
  60_000;

const DEFAULT_MAP_CENTER:
  [number, number] = [
    13.7563,
    100.5018,
  ];

function normalizeLicensePlate(
  value?: string
): string {
  return String(value || '')
    .split('(')[0]
    .replace(/[\s-]/g, '')
    .trim()
    .toUpperCase();
}

function parseGpsDateTime(
  value?: string
): Date | null {
  if (!value) {
    return null;
  }

  const text =
    String(value).trim();

  if (!text) {
    return null;
  }

  const directDate =
    new Date(text);

  if (
    !Number.isNaN(
      directDate.getTime()
    )
  ) {
    return directDate;
  }

  const normalizedText =
    text.replace(' ', 'T');

  const bangkokDate =
    new Date(
      `${normalizedText}+07:00`
    );

  if (
    !Number.isNaN(
      bangkokDate.getTime()
    )
  ) {
    return bangkokDate;
  }

  return null;
}

function getGpsFreshness(
  location: GpsLocation
): GpsFreshness {
  const gpsDate =
    parseGpsDateTime(
      location.gpsTime
    );

  const receivedDate =
    parseGpsDateTime(
      location.receivedAt
    );

  const referenceDate =
    gpsDate || receivedDate;

  if (!referenceDate) {
    return 'OFFLINE';
  }

  const ageMs =
    Date.now() -
    referenceDate.getTime();

  if (
    ageMs <= 120_000
  ) {
    return 'LIVE';
  }

  if (
    ageMs <= 300_000
  ) {
    return 'STALE';
  }

  return 'OFFLINE';
}

function getFreshnessColor(
  freshness: GpsFreshness
): string {
  if (freshness === 'LIVE') {
    return '#10b981';
  }

  if (freshness === 'STALE') {
    return '#f59e0b';
  }

  return '#64748b';
}

function escapeHtml(
  value: unknown
): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function createTruckMarkerIcon(
  location: GpsLocation,
  truck?: Truck
): L.DivIcon {
  const freshness =
    getGpsFreshness(location);

  const markerColor =
    getFreshnessColor(
      freshness
    );

  const heading =
    Number.isFinite(
      location.heading
    )
      ? location.heading
      : 0;

  const markerLabel =
    truck?.licensePlate ||
    location.licensePlate ||
    location.gpsId;

  return L.divIcon({
    className:
      'elive-gps-marker',

    html: `
      <div
        style="
          display:flex;
          flex-direction:column;
          align-items:center;
          transform:translate(-50%,-50%);
          pointer-events:auto;
        "
      >
        <div
          style="
            width:42px;
            height:42px;
            display:flex;
            align-items:center;
            justify-content:center;
            border-radius:50%;
            background:${markerColor};
            border:3px solid white;
            box-shadow:0 4px 12px rgba(15,23,42,0.35);
            transform:rotate(${heading}deg);
          "
        >
          <div
            style="
              width:0;
              height:0;
              border-left:7px solid transparent;
              border-right:7px solid transparent;
              border-bottom:16px solid white;
              transform:translateY(-1px);
            "
          ></div>
        </div>

        <div
          style="
            margin-top:4px;
            padding:3px 7px;
            border-radius:6px;
            background:white;
            border:1px solid #cbd5e1;
            color:#0f172a;
            font-size:11px;
            font-weight:700;
            white-space:nowrap;
            box-shadow:0 2px 6px rgba(15,23,42,0.18);
          "
        >
          ${escapeHtml(markerLabel)}
        </div>
      </div>
    `,

    iconSize: [42, 58],
    iconAnchor: [21, 29],
    popupAnchor: [0, -32],
  });
}

function createPopupContent(
  location: GpsLocation,
  truck?: Truck
): string {
  const freshness =
    getGpsFreshness(location);

  const freshnessColor =
    getFreshnessColor(
      freshness
    );

  const plate =
    truck?.licensePlate ||
    location.licensePlate ||
    '-';

  const route =
    truck?.route || '-';

  const supplier =
    truck?.supplierName || '-';

  const gpsStatus =
    location.gpsStatus || '-';

  const locationName =
    location.locationName || '-';

  const gpsTime =
    location.gpsTime || '-';

  const receivedAt =
    location.receivedAt || '-';

  return `
    <div
      style="
        width:260px;
        font-family:Arial,sans-serif;
        color:#0f172a;
      "
    >
      <div
        style="
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:8px;
          margin-bottom:10px;
        "
      >
        <div>
          <div
            style="
              font-size:15px;
              font-weight:700;
            "
          >
            ${escapeHtml(plate)}
          </div>

          <div
            style="
              margin-top:2px;
              color:#64748b;
              font-size:11px;
            "
          >
            GPS ID: ${escapeHtml(location.gpsId)}
          </div>
        </div>

        <div
          style="
            padding:4px 8px;
            border-radius:999px;
            background:${freshnessColor};
            color:white;
            font-size:10px;
            font-weight:700;
          "
        >
          ${freshness}
        </div>
      </div>

      <div
        style="
          padding-top:8px;
          border-top:1px solid #e2e8f0;
          font-size:12px;
          line-height:1.65;
        "
      >
        <div>
          <strong>Route:</strong>
          ${escapeHtml(route)}
        </div>

        <div>
          <strong>Supplier:</strong>
          ${escapeHtml(supplier)}
        </div>

        <div>
          <strong>สถานที่:</strong>
          ${escapeHtml(locationName)}
        </div>

        <div>
          <strong>ความเร็ว:</strong>
          ${escapeHtml(location.speed)} km/h
        </div>

        <div>
          <strong>ทิศทาง:</strong>
          ${escapeHtml(location.heading)}°
        </div>

        <div>
          <strong>สถานะ GPS:</strong>
          ${escapeHtml(gpsStatus)}
        </div>

        <div>
          <strong>เวลา GPS:</strong>
          ${escapeHtml(gpsTime)}
        </div>

        <div>
          <strong>เวลารับข้อมูล:</strong>
          ${escapeHtml(receivedAt)}
        </div>
      </div>
    </div>
  `;
}

export function LiveMap({
  trucks,
}: LiveMapProps) {
  const mapContainerRef =
    useRef<HTMLDivElement | null>(
      null
    );

  const mapRef =
    useRef<L.Map | null>(
      null
    );

  const markerLayerRef =
    useRef<L.LayerGroup | null>(
      null
    );

  const requestRunningRef =
    useRef(false);

  const firstFitRef =
    useRef(true);

  const [
    gpsLocations,
    setGpsLocations,
  ] = useState<GpsLocation[]>(
    []
  );

  const [
    gpsError,
    setGpsError,
  ] = useState<string | null>(
    null
  );

  const [
    isLoading,
    setIsLoading,
  ] = useState(true);

  const [
    lastRefresh,
    setLastRefresh,
  ] = useState<Date | null>(
    null
  );

  const truckByPlate =
    useMemo(() => {
      const map =
        new Map<string, Truck>();

      for (const truck of trucks) {
        const normalizedPlate =
          normalizeLicensePlate(
            truck.licensePlate
          );

        if (normalizedPlate) {
          map.set(
            normalizedPlate,
            truck
          );
        }
      }

      return map;
    }, [trucks]);

  const matchedCount =
    useMemo(() => {
      return gpsLocations.filter(
        location => {
          const normalizedPlate =
            normalizeLicensePlate(
              location.licensePlate
            );

          return truckByPlate.has(
            normalizedPlate
          );
        }
      ).length;
    }, [
      gpsLocations,
      truckByPlate,
    ]);

  const freshnessStats =
    useMemo(() => {
      return {
        live:
          gpsLocations.filter(
            location =>
              getGpsFreshness(
                location
              ) === 'LIVE'
          ).length,

        stale:
          gpsLocations.filter(
            location =>
              getGpsFreshness(
                location
              ) === 'STALE'
          ).length,

        offline:
          gpsLocations.filter(
            location =>
              getGpsFreshness(
                location
              ) === 'OFFLINE'
          ).length,
      };
    }, [gpsLocations]);

  const loadGps =
    useCallback(async () => {
      if (
        requestRunningRef.current
      ) {
        return;
      }

      requestRunningRef.current =
        true;

      try {
        const locations =
          await fetchGpsLocations();

        setGpsLocations(
          locations
        );

        setLastRefresh(
          new Date()
        );

        setGpsError(null);
      } catch (error) {
        console.error(
          'Unable to load GPS locations:',
          error
        );

        const message =
          error instanceof Error
            ? error.message
            : 'Unable to load GPS data.';

        setGpsError(message);
      } finally {
        requestRunningRef.current =
          false;

        setIsLoading(false);
      }
    }, []);

  useEffect(() => {
    if (
      !mapContainerRef.current ||
      mapRef.current
    ) {
      return;
    }

    const map =
      L.map(
        mapContainerRef.current,
        {
          center:
            DEFAULT_MAP_CENTER,
          zoom: 9,
          zoomControl: true,
          attributionControl: true,
        }
      );

    L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        maxZoom: 19,
        attribution:
          '© OpenStreetMap contributors',
      }
    ).addTo(map);

    const markerLayer =
      L.layerGroup()
        .addTo(map);

    mapRef.current =
      map;

    markerLayerRef.current =
      markerLayer;

    window.setTimeout(
      () => {
        map.invalidateSize();
      },
      100
    );

    return () => {
      markerLayer.clearLayers();
      map.remove();

      markerLayerRef.current =
        null;

      mapRef.current =
        null;
    };
  }, []);

  useEffect(() => {
    loadGps();

    const intervalId =
      window.setInterval(
        loadGps,
        GPS_REFRESH_INTERVAL
      );

    return () => {
      window.clearInterval(
        intervalId
      );
    };
  }, [loadGps]);

  useEffect(() => {
    const map =
      mapRef.current;

    const markerLayer =
      markerLayerRef.current;

    if (
      !map ||
      !markerLayer
    ) {
      return;
    }

    markerLayer.clearLayers();

    const markerPositions:
      L.LatLngExpression[] = [];

    for (
      const location of gpsLocations
    ) {
      const position:
        L.LatLngExpression = [
          location.latitude,
          location.longitude,
        ];

      markerPositions.push(
        position
      );

      const normalizedPlate =
        normalizeLicensePlate(
          location.licensePlate
        );

      const truck =
        truckByPlate.get(
          normalizedPlate
        );

      const marker =
        L.marker(
          position,
          {
            icon:
              createTruckMarkerIcon(
                location,
                truck
              ),

            title:
              truck?.licensePlate ||
              location.licensePlate ||
              location.gpsId,
          }
        );

      marker.bindPopup(
        createPopupContent(
          location,
          truck
        ),
        {
          maxWidth: 300,
          minWidth: 260,
        }
      );

      marker.addTo(
        markerLayer
      );
    }

    if (
      firstFitRef.current &&
      markerPositions.length > 0
    ) {
      const bounds =
        L.latLngBounds(
          markerPositions
        );

      map.fitBounds(
        bounds,
        {
          padding: [40, 40],
          maxZoom: 15,
        }
      );

      firstFitRef.current =
        false;
    }
  }, [
    gpsLocations,
    truckByPlate,
  ]);

  const handleFitAll =
    () => {
      const map =
        mapRef.current;

      if (
        !map ||
        gpsLocations.length === 0
      ) {
        return;
      }

      const bounds =
        L.latLngBounds(
          gpsLocations.map(
            location => [
              location.latitude,
              location.longitude,
            ] as [
              number,
              number
            ]
          )
        );

      map.fitBounds(
        bounds,
        {
          padding: [40, 40],
          maxZoom: 15,
        }
      );
    };

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50 p-4 md:p-6 lg:p-8">
      <div className="shrink-0 rounded-t-xl border border-b-0 border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold tracking-tight text-slate-800">
                Live GPS Tracking
              </h2>

              <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            </div>

            <p className="mt-1 text-xs text-slate-500">
              GPS updates every 60 seconds
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
              <Wifi className="h-3.5 w-3.5" />
              Live {freshnessStats.live}
            </div>

            <div className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
              <Clock className="h-3.5 w-3.5" />
              Stale {freshnessStats.stale}
            </div>

            <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">
              <WifiOff className="h-3.5 w-3.5" />
              Offline {freshnessStats.offline}
            </div>

            <button
              type="button"
              onClick={handleFitAll}
              disabled={
                gpsLocations.length === 0
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <LocateFixed className="h-3.5 w-3.5" />
              แสดงรถทั้งหมด
            </button>

            <button
              type="button"
              onClick={loadGps}
              disabled={
                requestRunningRef.current
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${
                  isLoading
                    ? 'animate-spin'
                    : ''
                }`}
              />
              Refresh
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-500">
              <MapPin className="h-3.5 w-3.5" />
              GPS Devices
            </div>

            <div className="mt-1 text-lg font-bold text-slate-800">
              {gpsLocations.length}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-500">
              <TruckIcon className="h-3.5 w-3.5" />
              Matched Trucks
            </div>

            <div className="mt-1 text-lg font-bold text-slate-800">
              {matchedCount}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-500">
              <Gauge className="h-3.5 w-3.5" />
              Moving
            </div>

            <div className="mt-1 text-lg font-bold text-slate-800">
              {
                gpsLocations.filter(
                  location =>
                    location.speed > 0
                ).length
              }
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-500">
              <Navigation className="h-3.5 w-3.5" />
              Last Refresh
            </div>

            <div className="mt-1 font-mono text-sm font-bold text-slate-800">
              {lastRefresh
                ? lastRefresh.toLocaleTimeString(
                    'en-GB',
                    {
                      timeZone:
                        'Asia/Bangkok',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      hour12: false,
                    }
                  )
                : '-'}
            </div>
          </div>
        </div>
      </div>

      {gpsError && (
        <div className="flex shrink-0 items-center gap-2 border-x border-t border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />

          <span>
            {gpsError}
          </span>
        </div>
      )}

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-b-xl border border-slate-200 bg-slate-100 shadow-sm">
        <div
          ref={mapContainerRef}
          className="h-full min-h-[420px] w-full"
        />

        {isLoading && (
          <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center bg-white/70 backdrop-blur-sm">
            <div className="rounded-xl border border-slate-200 bg-white px-6 py-4 text-center shadow-lg">
              <RefreshCw className="mx-auto h-6 w-6 animate-spin text-blue-600" />

              <div className="mt-2 text-sm font-bold text-slate-700">
                Loading GPS data
              </div>
            </div>
          </div>
        )}

        {!isLoading &&
          gpsLocations.length === 0 && (
            <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center bg-white/60 backdrop-blur-sm">
              <div className="max-w-sm rounded-xl border border-slate-200 bg-white p-6 text-center shadow-lg">
                <MapPin className="mx-auto h-8 w-8 text-slate-400" />

                <div className="mt-3 font-bold text-slate-700">
                  No GPS locations found
                </div>

                <div className="mt-1 text-sm text-slate-500">
                  ตรวจสอบข้อมูลในชีท API GPS และ API response
                </div>
              </div>
            </div>
          )}
      </div>
    </div>
  );
}
