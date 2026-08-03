import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import L from 'leaflet';

import 'leaflet/dist/leaflet.css';

import {
  GpsLocation,
  Truck,
} from '../types';

import {
  fetchRouteToTpcap,
  RouteToTpcapResult,
} from '../lib/sheets';

import {
  AlertTriangle,
  Building2,
  Clock,
  LoaderCircle,
  MapPin,
  Navigation,
  RefreshCw,
  Route,
  Search,
  Truck as TruckIcon,
  UserRound,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';

interface LiveMapProps {
  trucks: Truck[];
  gpsLocations: GpsLocation[];
  initialTruckId?: string | null;
  onRefresh?: () => void | Promise<void>;
  isRefreshing?: boolean;
}

type GpsFreshness =
  | 'LIVE'
  | 'STALE'
  | 'OFFLINE';

const DEFAULT_MAP_CENTER:
  [number, number] = [
    13.623729606202758,
    101.01501162061923,
  ];

const TPCAP_POSITION:
  [number, number] = [
    13.623729606202758,
    101.01501162061923,
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

  const isoText =
    text.includes('T')
      ? text
      : text.replace(
          ' ',
          'T'
        );

  const hasTimeZone =
    isoText.endsWith('Z') ||
    /[+-]\d{2}:\d{2}$/.test(
      isoText
    );

  const normalizedText =
    hasTimeZone
      ? isoText
      : `${isoText}+07:00`;

  const date =
    new Date(
      normalizedText
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return date;
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
    gpsDate ||
    receivedDate;

  if (!referenceDate) {
    return 'OFFLINE';
  }

  const ageMs =
    Date.now() -
    referenceDate.getTime();

  if (
    ageMs <= 120000
  ) {
    return 'LIVE';
  }

  if (
    ageMs <= 300000
  ) {
    return 'STALE';
  }

  return 'OFFLINE';
}

function getFreshnessClasses(
  freshness: GpsFreshness
): string {
  if (
    freshness === 'LIVE'
  ) {
    return [
      'border-emerald-200',
      'bg-emerald-50',
      'text-emerald-700',
    ].join(' ');
  }

  if (
    freshness === 'STALE'
  ) {
    return [
      'border-amber-200',
      'bg-amber-50',
      'text-amber-700',
    ].join(' ');
  }

  return [
    'border-slate-200',
    'bg-slate-100',
    'text-slate-600',
  ].join(' ');
}

function formatGpsDateTime(
  value?: string
): string {
  if (!value) {
    return '-';
  }

  const date =
    parseGpsDateTime(
      value
    );

  if (!date) {
    return value;
  }

  return date.toLocaleString(
    'en-GB',
    {
      timeZone:
        'Asia/Bangkok',

      day:
        '2-digit',

      month:
        '2-digit',

      year:
        'numeric',

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
}

function formatEta(
  value?: string
): string {
  if (!value) {
    return '-';
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
  }

  return date.toLocaleString(
    'en-GB',
    {
      timeZone:
        'Asia/Bangkok',

      day:
        '2-digit',

      month:
        '2-digit',

      year:
        'numeric',

      hour:
        '2-digit',

      minute:
        '2-digit',

      hour12:
        false,
    }
  );
}

function formatDuration(
  totalMinutes?: number
): string {
  if (
    totalMinutes === undefined ||
    !Number.isFinite(
      totalMinutes
    )
  ) {
    return '-';
  }

  const roundedMinutes =
    Math.max(
      1,
      Math.round(
        totalMinutes
      )
    );

  const hours =
    Math.floor(
      roundedMinutes /
      60
    );

  const minutes =
    roundedMinutes %
    60;

  if (
    hours <= 0
  ) {
    return `${minutes} นาที`;
  }

  if (
    minutes === 0
  ) {
    return `${hours} ชั่วโมง`;
  }

  return (
    `${hours} ชั่วโมง ` +
    `${minutes} นาที`
  );
}

function createTruckMarkerIcon(
  heading: number
): L.DivIcon {
  const safeHeading =
    Number.isFinite(
      heading
    )
      ? heading
      : 0;

  return L.divIcon({
    className:
      'elive-truck-marker',

    html: `
      <div
        style="
          width:52px;
          height:52px;
          display:flex;
          align-items:center;
          justify-content:center;
          border-radius:50%;
          background:#00a8ff;
          border:4px solid white;
          box-shadow:0 5px 16px rgba(2,132,199,0.5);
          box-sizing:border-box;
        "
      >
        <div
          style="
            width:0;
            height:0;
            border-left:8px solid transparent;
            border-right:8px solid transparent;
            border-bottom:20px solid white;
            transform:rotate(${safeHeading}deg);
            transform-origin:center;
          "
        ></div>
      </div>
    `,

    iconSize:
      [52, 52],

    iconAnchor:
      [26, 26],
  });
}

function createTpcapMarkerIcon():
  L.DivIcon {
  return L.divIcon({
    className:
      'elive-tpcap-marker',

    html: `
      <div
        style="
          width:70px;
          height:80px;
          display:flex;
          flex-direction:column;
          align-items:center;
        "
      >
        <div
          style="
            position:relative;
            width:48px;
            height:48px;
          "
        >
          <div
            style="
              position:absolute;
              left:4px;
              top:4px;
              width:40px;
              height:40px;
              border-radius:50% 50% 50% 0;
              background:#ef4444;
              border:4px solid white;
              box-shadow:0 5px 16px rgba(185,28,28,0.45);
              transform:rotate(-45deg);
              box-sizing:border-box;
            "
          ></div>

          <div
            style="
              position:absolute;
              left:17px;
              top:17px;
              width:14px;
              height:14px;
              border-radius:50%;
              background:white;
            "
          ></div>
        </div>

        <div
          style="
            margin-top:4px;
            padding:4px 9px;
            border-radius:6px;
            background:white;
            border:1px solid #fecaca;
            color:#b91c1c;
            font-size:11px;
            font-weight:700;
            white-space:nowrap;
            box-shadow:0 2px 8px rgba(15,23,42,0.2);
          "
        >
          TPCAP
        </div>
      </div>
    `,

    iconSize:
      [70, 80],

    iconAnchor:
      [35, 44],
  });
}

export function LiveMap({
  trucks,
  gpsLocations,
  initialTruckId,
  onRefresh,
  isRefreshing = false,
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

  const routeLayerRef =
    useRef<L.LayerGroup | null>(
      null
    );

  const routeRequestIdRef =
    useRef(0);

  const appliedInitialTruckIdRef =
    useRef<string | null>(
      null
    );

  const [
    selectedGpsId,
    setSelectedGpsId,
  ] = useState('');

  const [
    searchText,
    setSearchText,
  ] = useState('');

  const [
    routeError,
    setRouteError,
  ] = useState<string | null>(
    null
  );

  const [
    routeResult,
    setRouteResult,
  ] = useState<RouteToTpcapResult | null>(
    null
  );

  const [
    isRouteLoading,
    setIsRouteLoading,
  ] = useState(false);

  const truckByPlate =
    useMemo(() => {
      const map =
        new Map<
          string,
          Truck
        >();

      for (
        const truck of trucks
      ) {
        const normalizedPlate =
          normalizeLicensePlate(
            truck.licensePlate
          );

        if (
          normalizedPlate
        ) {
          map.set(
            normalizedPlate,
            truck
          );
        }
      }

      return map;
    }, [
      trucks,
    ]);

  const matchedGpsLocations =
    useMemo(() => {
      return gpsLocations.filter(
        location => {
          const normalizedPlate =
            normalizeLicensePlate(
              location.licensePlate
            );

          return (
            normalizedPlate !== '' &&
            truckByPlate.has(
              normalizedPlate
            )
          );
        }
      );
    }, [
      gpsLocations,
      truckByPlate,
    ]);

  const selectableGpsLocations =
    useMemo(() => {
      const normalizedSearch =
        searchText
          .trim()
          .toUpperCase();

      return matchedGpsLocations
        .filter(
          location => {
            if (
              !normalizedSearch
            ) {
              return true;
            }

            const normalizedPlate =
              normalizeLicensePlate(
                location.licensePlate
              );

            const truck =
              truckByPlate.get(
                normalizedPlate
              );

            const searchableText = [
              location.licensePlate,
              location.gpsId,
              location.locationName,
              truck?.licensePlate,
              truck?.route,
              truck?.supplierName,
              truck?.driverName,
            ]
              .filter(
                Boolean
              )
              .join(' ')
              .toUpperCase();

            return searchableText.includes(
              normalizedSearch
            );
          }
        )
        .sort(
          (
            first,
            second
          ) => {
            const firstLabel =
              first.licensePlate ||
              first.gpsId;

            const secondLabel =
              second.licensePlate ||
              second.gpsId;

            return firstLabel.localeCompare(
              secondLabel,
              'th'
            );
          }
        );
    }, [
      matchedGpsLocations,
      searchText,
      truckByPlate,
    ]);

  const selectedGpsLocation =
    useMemo(() => {
      if (
        !selectedGpsId
      ) {
        return null;
      }

      return (
        gpsLocations.find(
          location =>
            location.gpsId ===
            selectedGpsId
        ) ||
        null
      );
    }, [
      gpsLocations,
      selectedGpsId,
    ]);

  const selectedTruck =
    useMemo(() => {
      if (
        !selectedGpsLocation
      ) {
        return undefined;
      }

      const normalizedPlate =
        normalizeLicensePlate(
          selectedGpsLocation
            .licensePlate
        );

      return truckByPlate.get(
        normalizedPlate
      );
    }, [
      selectedGpsLocation,
      truckByPlate,
    ]);

  const selectedFreshness =
    useMemo(() => {
      if (
        !selectedGpsLocation
      ) {
        return null;
      }

      return getGpsFreshness(
        selectedGpsLocation
      );
    }, [
      selectedGpsLocation,
    ]);

  const freshnessStats =
    useMemo(() => {
      let live =
        0;

      let stale =
        0;

      let offline =
        0;

      for (
        const location of matchedGpsLocations
      ) {
        const freshness =
          getGpsFreshness(
            location
          );

        if (
          freshness ===
          'LIVE'
        ) {
          live +=
            1;
        } else if (
          freshness ===
          'STALE'
        ) {
          stale +=
            1;
        } else {
          offline +=
            1;
        }
      }

      return {
        live,
        stale,
        offline,
      };
    }, [
      matchedGpsLocations,
    ]);

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

          zoom:
            10,

          zoomControl:
            true,

          attributionControl:
            true,
        }
      );

    L.tileLayer(
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        maxZoom:
          19,

        attribution:
          '© OpenStreetMap contributors',
      }
    ).addTo(
      map
    );

    const markerLayer =
      L.layerGroup()
        .addTo(
          map
        );

    const routeLayer =
      L.layerGroup()
        .addTo(
          map
        );

    mapRef.current =
      map;

    markerLayerRef.current =
      markerLayer;

    routeLayerRef.current =
      routeLayer;

    window.setTimeout(
      () => {
        map.invalidateSize();
      },
      150
    );

    return () => {
      markerLayer
        .clearLayers();

      routeLayer
        .clearLayers();

      map.remove();

      markerLayerRef.current =
        null;

      routeLayerRef.current =
        null;

      mapRef.current =
        null;
    };
  }, []);

  useEffect(() => {
    if (
      initialTruckId !==
      appliedInitialTruckIdRef.current
    ) {
      appliedInitialTruckIdRef.current =
        null;
    }
  }, [
    initialTruckId,
  ]);

  useEffect(() => {
    if (
      !initialTruckId ||
      gpsLocations.length ===
        0
    ) {
      return;
    }

    if (
      appliedInitialTruckIdRef.current ===
      initialTruckId
    ) {
      return;
    }

    const initialTruck =
      trucks.find(
        truck =>
          truck.id ===
          initialTruckId
      );

    if (
      !initialTruck
    ) {
      return;
    }

    const normalizedPlate =
      normalizeLicensePlate(
        initialTruck.licensePlate
      );

    const initialGpsLocation =
      gpsLocations.find(
        location =>
          normalizeLicensePlate(
            location.licensePlate
          ) ===
          normalizedPlate
      );

    if (
      !initialGpsLocation
    ) {
      return;
    }

    setSelectedGpsId(
      initialGpsLocation.gpsId
    );

    setSearchText(
      initialTruck.licensePlate
    );

    appliedInitialTruckIdRef.current =
      initialTruckId;
  }, [
    gpsLocations,
    initialTruckId,
    trucks,
  ]);

  useEffect(() => {
    if (
      !selectedGpsId
    ) {
      return;
    }

    const selectedStillExists =
      gpsLocations.some(
        location =>
          location.gpsId ===
          selectedGpsId
      );

    if (
      !selectedStillExists
    ) {
      setSelectedGpsId(
        ''
      );

      setRouteResult(
        null
      );

      setRouteError(
        null
      );
    }
  }, [
    gpsLocations,
    selectedGpsId,
  ]);

  useEffect(() => {
    if (
      !selectedGpsLocation
    ) {
      routeRequestIdRef.current +=
        1;

      setRouteResult(
        null
      );

      setRouteError(
        null
      );

      setIsRouteLoading(
        false
      );

      return;
    }

    const requestId =
      routeRequestIdRef.current +
      1;

    routeRequestIdRef.current =
      requestId;

    const loadRoute =
      async () => {
        setIsRouteLoading(
          true
        );

        setRouteError(
          null
        );

        try {
          const result =
            await fetchRouteToTpcap(
              selectedGpsLocation
                .latitude,

              selectedGpsLocation
                .longitude
            );

          if (
            routeRequestIdRef.current !==
            requestId
          ) {
            return;
          }

          setRouteResult(
            result
          );
        } catch (error) {
          if (
            routeRequestIdRef.current !==
            requestId
          ) {
            return;
          }

          console.error(
            'Unable to calculate route:',
            error
          );

          const message =
            error instanceof Error
              ? error.message
              : 'ไม่สามารถคำนวณเส้นทางได้';

          setRouteResult(
            null
          );

          setRouteError(
            message
          );
        } finally {
          if (
            routeRequestIdRef.current ===
            requestId
          ) {
            setIsRouteLoading(
              false
            );
          }
        }
      };

    loadRoute();
  }, [
    selectedGpsLocation,
  ]);

  useEffect(() => {
    const map =
      mapRef.current;

    const markerLayer =
      markerLayerRef.current;

    const routeLayer =
      routeLayerRef.current;

    if (
      !map ||
      !markerLayer ||
      !routeLayer
    ) {
      return;
    }

    markerLayer
      .clearLayers();

    routeLayer
      .clearLayers();

    if (
      !selectedGpsLocation
    ) {
      return;
    }

    const truckPosition:
      [number, number] = [
        selectedGpsLocation
          .latitude,

        selectedGpsLocation
          .longitude,
      ];

    const truckMarker =
      L.marker(
        truckPosition,
        {
          icon:
            createTruckMarkerIcon(
              selectedGpsLocation
                .heading
            ),

          title:
            selectedTruck
              ?.licensePlate ||
            selectedGpsLocation
              .licensePlate ||
            selectedGpsLocation
              .gpsId,

          zIndexOffset:
            1000,
        }
      );

    truckMarker.addTo(
      markerLayer
    );

    const tpcapMarker =
      L.marker(
        TPCAP_POSITION,
        {
          icon:
            createTpcapMarkerIcon(),

          title:
            'TPCAP',

          zIndexOffset:
            900,
        }
      );

    tpcapMarker.addTo(
      markerLayer
    );

    if (
      routeResult &&
      routeResult
        .geometry
        .coordinates
        .length >= 2
    ) {
      const routePoints:
        [number, number][] =
          routeResult
            .geometry
            .coordinates
            .map(
              coordinate => {
                return [
                  coordinate[1],
                  coordinate[0],
                ];
              }
            );

      const routeLine =
        L.polyline(
          routePoints,
          {
            color:
              '#0284c7',

            weight:
              6,

            opacity:
              0.9,

            lineCap:
              'round',

            lineJoin:
              'round',
          }
        );

      routeLine.addTo(
        routeLayer
      );

      const bounds =
        L.latLngBounds(
          routePoints
        );

      bounds.extend(
        truckPosition
      );

      bounds.extend(
        TPCAP_POSITION
      );

      map.fitBounds(
        bounds,
        {
          padding:
            [50, 50],

          maxZoom:
            15,

          animate:
            true,
        }
      );
    } else {
      const bounds =
        L.latLngBounds([
          truckPosition,
          TPCAP_POSITION,
        ]);

      map.fitBounds(
        bounds,
        {
          padding:
            [50, 50],

          maxZoom:
            15,

          animate:
            true,
        }
      );
    }
  }, [
    selectedGpsLocation,
    selectedTruck,
    routeResult,
  ]);

  const handleRefresh =
    async () => {
      if (
        !onRefresh ||
        isRefreshing
      ) {
        return;
      }

      await onRefresh();
    };

  const clearSelection =
    () => {
      routeRequestIdRef.current +=
        1;

      appliedInitialTruckIdRef.current =
        null;

      setSelectedGpsId(
        ''
      );

      setSearchText(
        ''
      );

      setRouteResult(
        null
      );

      setRouteError(
        null
      );

      const map =
        mapRef.current;

      if (map) {
        map.setView(
          DEFAULT_MAP_CENTER,
          10,
          {
            animate:
              true,
          }
        );
      }
    };

  const showNoGpsMessage =
    gpsLocations.length ===
      0 &&
    !selectedGpsLocation;

  const showNoMatchMessage =
    gpsLocations.length >
      0 &&
    matchedGpsLocations.length ===
      0 &&
    !selectedGpsLocation;

  const showSelectTruckMessage =
    matchedGpsLocations.length >
      0 &&
    !selectedGpsLocation;

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50 p-4 md:p-6 lg:p-8">
      <div className="shrink-0 rounded-t-xl border border-b-0 border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold tracking-tight text-slate-800">
                Live GPS Tracking
              </h2>

              <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            </div>

            <p className="mt-1 text-xs text-slate-500">
              GPS data prepared from the selected plan
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
              onClick={
                handleRefresh
              }
              disabled={
                isRefreshing ||
                !onRefresh
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${
                  isRefreshing
                    ? 'animate-spin'
                    : ''
                }`}
              />

              Refresh
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

            <input
              type="text"
              value={
                searchText
              }
              onChange={
                event => {
                  setSearchText(
                    event.target.value
                  );
                }
              }
              placeholder="ค้นหาทะเบียน Route บริษัท หรือชื่อคนขับ"
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <select
            value={
              selectedGpsId
            }
            onChange={
              event => {
                setSelectedGpsId(
                  event.target.value
                );

                appliedInitialTruckIdRef.current =
                  null;
              }
            }
            className="min-w-[300px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="">
              เลือกรถที่ต้องการติดตาม
            </option>

            {selectableGpsLocations.map(
              location => {
                const normalizedPlate =
                  normalizeLicensePlate(
                    location
                      .licensePlate
                  );

                const truck =
                  truckByPlate.get(
                    normalizedPlate
                  );

                const plate =
                  truck
                    ?.licensePlate ||
                  location
                    .licensePlate ||
                  location
                    .gpsId;

                const route =
                  truck?.route
                    ? ` | ${truck.route}`
                    : '';

                return (
                  <option
                    key={
                      location.gpsId
                    }
                    value={
                      location.gpsId
                    }
                  >
                    {plate}
                    {route}
                  </option>
                );
              }
            )}
          </select>

          <button
            type="button"
            onClick={
              clearSelection
            }
            disabled={
              !selectedGpsId &&
              !searchText
            }
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" />
            ล้างการเลือก
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-b-xl border border-slate-200 bg-white shadow-sm lg:flex-row">
        <div className="relative min-h-[460px] flex-1 overflow-hidden bg-slate-100">
          <div
            ref={
              mapContainerRef
            }
            className="h-full min-h-[460px] w-full"
          />

          {showNoGpsMessage && (
            <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center bg-white/60 backdrop-blur-sm">
              <div className="max-w-sm rounded-xl border border-slate-200 bg-white p-6 text-center shadow-lg">
                <MapPin className="mx-auto h-8 w-8 text-slate-400" />

                <div className="mt-3 font-bold text-slate-700">
                  ไม่พบข้อมูล GPS ของรถในแผน
                </div>

                <div className="mt-1 text-sm text-slate-500">
                  ตรวจสอบทะเบียนรถใน Plan และข้อมูล API GPS
                </div>
              </div>
            </div>
          )}

          {showNoMatchMessage && (
            <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center">
              <div className="max-w-sm rounded-xl border border-amber-200 bg-white p-6 text-center shadow-lg">
                <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />

                <div className="mt-3 font-bold text-slate-700">
                  ไม่พบท้ายทะเบียนที่ตรงกับ GPS
                </div>

                <div className="mt-1 text-sm text-slate-500">
                  ตรวจสอบรูปแบบทะเบียนรถใน Plan และ API GPS
                </div>
              </div>
            </div>
          )}

          {showSelectTruckMessage && (
            <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center">
              <div className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-lg">
                <MapPin className="mx-auto h-8 w-8 text-blue-500" />

                <div className="mt-3 font-bold text-slate-700">
                  เลือกรถที่ต้องการติดตาม
                </div>

                <div className="mt-1 text-sm text-slate-500">
                  เลือกทะเบียนจากรายการด้านบน
                </div>

                <div className="mt-2 text-xs text-slate-400">
                  พบรถที่จับคู่ GPS ได้{' '}
                  {
                    matchedGpsLocations.length
                  }{' '}
                  คัน
                </div>
              </div>
            </div>
          )}
        </div>

        <aside className="w-full shrink-0 overflow-y-auto border-t border-slate-200 bg-white lg:w-[360px] lg:border-l lg:border-t-0">
          {!selectedGpsLocation && (
            <div className="flex h-full min-h-[260px] flex-col items-center justify-center p-8 text-center">
              <TruckIcon className="h-10 w-10 text-slate-300" />

              <div className="mt-3 font-bold text-slate-700">
                ยังไม่ได้เลือกรถ
              </div>

              <div className="mt-1 text-sm text-slate-500">
                รายละเอียดรถและเส้นทางจะแสดงบริเวณนี้
              </div>
            </div>
          )}

          {selectedGpsLocation && (
            <div className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
                    Selected Truck
                  </div>

                  <div className="mt-1 text-xl font-bold text-slate-900">
                    {selectedTruck
                      ?.licensePlate ||
                      selectedGpsLocation
                        .licensePlate ||
                      '-'}
                  </div>

                  <div className="mt-1 text-xs text-slate-500">
                    GPS ID:{' '}
                    {
                      selectedGpsLocation
                        .gpsId
                    }
                  </div>
                </div>

                {selectedFreshness && (
                  <div
                    className={`rounded-full border px-3 py-1 text-[10px] font-bold ${getFreshnessClasses(
                      selectedFreshness
                    )}`}
                  >
                    {selectedFreshness}
                  </div>
                )}
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-blue-600">
                    <Route className="h-3.5 w-3.5" />
                    Distance
                  </div>

                  <div className="mt-2 text-xl font-bold text-blue-800">
                    {routeResult
                      ? `${routeResult.distanceKilometers.toFixed(
                          1
                        )} km`
                      : '-'}
                  </div>
                </div>

                <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-indigo-600">
                    <Clock className="h-3.5 w-3.5" />
                    Travel Time
                  </div>

                  <div className="mt-2 text-base font-bold text-indigo-800">
                    {routeResult
                      ? formatDuration(
                          routeResult
                            .durationMinutes
                        )
                      : '-'}
                  </div>
                </div>
              </div>

              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase text-emerald-700">
                  <Navigation className="h-4 w-4" />
                  Estimated arrival at TPCAP
                </div>

                <div className="mt-2 text-lg font-bold text-emerald-900">
                  {routeResult
                    ? formatEta(
                        routeResult
                          .estimatedArrival
                      )
                    : '-'}
                </div>

                <div className="mt-1 text-xs text-emerald-700">
                  คำนวณจากเส้นทางถนนไปยัง TPCAP
                </div>
              </div>

              {isRouteLoading && (
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-3 text-sm text-blue-700">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  กำลังคำนวณเส้นทาง
                </div>
              )}

              {routeError && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />

                  <span>
                    {routeError}
                  </span>
                </div>
              )}

              <div className="mt-5 border-t border-slate-200 pt-5">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Truck Information
                </div>

                <div className="mt-3 space-y-3 text-sm">
                  <div className="flex items-start gap-3">
                    <Route className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />

                    <div>
                      <div className="text-xs text-slate-400">
                        Route
                      </div>

                      <div className="font-medium text-slate-800">
                        {selectedTruck
                          ?.route ||
                          '-'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />

                    <div>
                      <div className="text-xs text-slate-400">
                        Supplier
                      </div>

                      <div className="font-medium text-slate-800">
                        {selectedTruck
                          ?.supplierName ||
                          '-'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />

                    <div>
                      <div className="text-xs text-slate-400">
                        Driver
                      </div>

                      <div className="font-medium text-slate-800">
                        {selectedTruck
                          ?.driverName ||
                          '-'}
                      </div>

                      <div className="mt-0.5 text-xs text-slate-500">
                        {selectedTruck
                          ?.phone ||
                          '-'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />

                    <div>
                      <div className="text-xs text-slate-400">
                        Drop Point
                      </div>

                      <div className="font-medium text-slate-800">
                        {selectedTruck
                          ?.dropPoint ||
                          '-'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 border-t border-slate-200 pt-5">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  GPS Information
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <div className="text-[10px] font-bold uppercase text-slate-400">
                      Speed
                    </div>

                    <div className="mt-1 text-lg font-bold text-slate-800">
                      {
                        selectedGpsLocation
                          .speed
                      }{' '}
                      km/h
                    </div>
                  </div>

                  <div className="rounded-lg bg-slate-50 p-3">
                    <div className="text-[10px] font-bold uppercase text-slate-400">
                      Heading
                    </div>

                    <div className="mt-1 text-lg font-bold text-slate-800">
                      {
                        selectedGpsLocation
                          .heading
                      }
                      °
                    </div>
                  </div>
                </div>

                <div className="mt-3 space-y-3 text-sm">
                  <div>
                    <div className="text-xs text-slate-400">
                      สถานที่ล่าสุด
                    </div>

                    <div className="mt-1 font-medium text-slate-800">
                      {selectedGpsLocation
                        .locationName ||
                        '-'}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-400">
                      สถานะ GPS
                    </div>

                    <div className="mt-1 font-medium text-slate-800">
                      {selectedGpsLocation
                        .gpsStatus ||
                        '-'}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-400">
                      เวลา GPS
                    </div>

                    <div className="mt-1 font-mono text-xs font-medium text-slate-700">
                      {formatGpsDateTime(
                        selectedGpsLocation
                          .gpsTime
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-400">
                      เวลารับข้อมูล
                    </div>

                    <div className="mt-1 font-mono text-xs font-medium text-slate-700">
                      {formatGpsDateTime(
                        selectedGpsLocation
                          .receivedAt
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-400">
                      พิกัดล่าสุด
                    </div>

                    <div className="mt-1 break-all font-mono text-xs font-medium text-slate-700">
                      {selectedGpsLocation
                        .latitude.toFixed(
                          6
                        )}
                      ,{' '}
                      {selectedGpsLocation
                        .longitude.toFixed(
                          6
                        )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
