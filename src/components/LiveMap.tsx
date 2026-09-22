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
  fetchGpsDockStatus,
  fetchRouteToTpcap,
  GpsDockEvaluationResult,
  normalizeLicensePlate,
  RouteToTpcapResult,
} from '../lib/sheets';

import {
  AlertTriangle,
  Clock,
  LoaderCircle,
  MapPin,
  Navigation,
  RefreshCw,
  Route,
  Search,
  Truck as TruckIcon,
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
type GeofenceConfig = {
  id: 'TPCAP-LSP' | 'TPCAP-R2' | 'TPCAP-R1';
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  color: string;
};
type GeofenceEvaluation = GeofenceConfig & {
  distanceMeters: number;
  isInside: boolean;
};
const DEFAULT_GEOFENCE_RADIUS_METERS = 50;
const GPS_GEOFENCES: GeofenceConfig[] = [
  {
    id: 'TPCAP-LSP',
    name: 'TPCAP-LSP',
    latitude: 13.624391050915499,
    longitude: 101.01532262451346,
    radiusMeters: 80,
    color: '#7c3aed',
  },
  {
    id: 'TPCAP-R2',
    name: 'TPCAP-R2',
    latitude: 13.624670855780815,
    longitude: 101.01287491445134,
    radiusMeters: DEFAULT_GEOFENCE_RADIUS_METERS,
    color: '#0284c7',
  },
  {
    id: 'TPCAP-R1',
    name: 'TPCAP-R1',
    latitude: 13.626408220162133,
    longitude: 101.01512843208137,
    radiusMeters: 80,
    color: '#059669',
  },
];

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
    ageMs <= 300000
  ) {
    return 'LIVE';
  }

  if (
    ageMs <= 600000
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

function formatPlanTime(value?: string): string {
  const text = String(value || '').trim();
  if (!text) return '-';
  const directTime = text.match(/^(\d{1,2}):(\d{2})/);
  if (directTime) {
    return `${directTime[1].padStart(2, '0')}:${directTime[2]}`;
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  const sheetsTime = date.getUTCFullYear() === 1899 || date.getUTCFullYear() === 1900;
  return date.toLocaleTimeString('en-GB', {
    timeZone: sheetsTime ? 'UTC' : 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
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

function calculateDistanceMeters(
  firstLatitude: number,
  firstLongitude: number,
  secondLatitude: number,
  secondLongitude: number
): number {
  const earthRadiusMeters = 6371000;
  const toRadians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = toRadians(secondLatitude - firstLatitude);
  const longitudeDelta = toRadians(secondLongitude - firstLongitude);
  const firstLatitudeRadians = toRadians(firstLatitude);
  const secondLatitudeRadians = toRadians(secondLatitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitudeRadians) *
      Math.cos(secondLatitudeRadians) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(haversine));
}
function getGpsAgeText(location: GpsLocation): string {
  const referenceDate = parseGpsDateTime(location.gpsTime) || parseGpsDateTime(location.receivedAt);
  if (!referenceDate) return 'ไม่พบเวลาข้อมูล';
  const ageSeconds = Math.max(0, Math.floor((Date.now() - referenceDate.getTime()) / 1000));
  if (ageSeconds < 60) return `${ageSeconds} วินาทีที่แล้ว`;
  const ageMinutes = Math.floor(ageSeconds / 60);
  if (ageMinutes < 60) return `${ageMinutes} นาทีที่แล้ว`;
  return `${Math.floor(ageMinutes / 60)} ชั่วโมงที่แล้ว`;
}
function getTargetGeofenceId(dropPoint?: string): GeofenceConfig['id'] | null {
  const value = String(dropPoint || '').trim().toUpperCase();
  if (/^R1(?:-|\b)/.test(value)) return 'TPCAP-R1';
  if (/^R2(?:-|\b)/.test(value)) return 'TPCAP-R2';
  if (/^(?:L1|L2|L3|M1)(?:-|\b)/.test(value)) return 'TPCAP-LSP';
  return null;
}
function createGeofenceMarkerIcon(
  name: string,
  color: string
): L.DivIcon {
  return L.divIcon({
    className: 'elive-geofence-marker',
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;">
        <div style="width:18px;height:18px;border-radius:50%;background:${color};border:4px solid white;box-shadow:0 2px 10px rgba(15,23,42,0.35);box-sizing:border-box;"></div>
        <div style="margin-top:4px;padding:3px 7px;border-radius:6px;background:white;border:1px solid ${color};color:${color};font-size:10px;font-weight:800;white-space:nowrap;box-shadow:0 2px 8px rgba(15,23,42,0.18);">${name}</div>
      </div>
    `,
    iconSize: [100, 44],
    iconAnchor: [50, 9],
  });
}
function createTruckMarkerIcon(
  heading: number,
  isMoving: boolean
): L.DivIcon {
  const safeHeading = Number.isFinite(heading) ? heading : 0;
  const markerColor = isMoving ? '#16a34a' : '#dc2626';
  const statusText = isMoving ? 'รถวิ่ง' : 'รถจอด';
  return L.divIcon({
    className: 'elive-truck-marker',
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;">
        <div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;border-radius:14px;background:${markerColor};border:4px solid white;box-shadow:0 5px 16px ${isMoving ? 'rgba(22,163,74,0.45)' : 'rgba(220,38,38,0.45)'};box-sizing:border-box;">
          <svg width="31" height="31" viewBox="0 0 64 64" aria-hidden="true" style="transform:rotate(${safeHeading}deg);transform-origin:center;">
            <path fill="white" d="M7 16h31v27H7zM38 24h11l8 9v10H38z"/>
            <path fill="${markerColor}" d="M42 28h6l5 6H42z"/>
            <circle cx="18" cy="47" r="7" fill="#0f172a" stroke="white" stroke-width="3"/>
            <circle cx="48" cy="47" r="7" fill="#0f172a" stroke="white" stroke-width="3"/>
          </svg>
        </div>
        <div style="margin-top:4px;padding:3px 7px;border-radius:999px;background:white;border:1px solid ${markerColor};color:${markerColor};font-size:10px;font-weight:800;white-space:nowrap;box-shadow:0 2px 8px rgba(15,23,42,0.18);">${statusText}</div>
      </div>
    `,
    iconSize: [70, 72],
    iconAnchor: [35, 30],
    popupAnchor: [0, -36],
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
  const geofenceLayerRef =
    useRef<L.LayerGroup | null>(
      null
    );
  const baseLayerControlRef = useRef<L.Control.Layers | null>(null);

  const routeRequestIdRef =
    useRef(0);
  const gpsDockRequestIdRef =
    useRef(0);

  const appliedInitialTruckIdRef =
    useRef<string | null>(
      null
    );
  const lastViewportFitKeyRef =
    useRef('');

  const [
    selectedTruckId,
    setSelectedTruckId,
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
  const [showGeofenceDebug] = useState(false);
  const [
    gpsDockResult,
    setGpsDockResult,
  ] = useState<GpsDockEvaluationResult | null>(null);
  const [
    gpsDockError,
    setGpsDockError,
  ] = useState<string | null>(null);
  const [
    isGpsDockLoading,
    setIsGpsDockLoading,
  ] = useState(false);

  const gpsByPlate = useMemo(() => {
    const map = new Map<string, GpsLocation>();
    for (const location of gpsLocations) {
      const plate = normalizeLicensePlate(location.licensePlate);
      if (!plate) continue;
      const existing = map.get(plate);
      const existingTime = parseGpsDateTime(existing?.gpsTime)?.getTime() ?? 0;
      const candidateTime = parseGpsDateTime(location.gpsTime)?.getTime() ?? 0;
      if (!existing || candidateTime >= existingTime) map.set(plate, location);
    }
    return map;
  }, [gpsLocations]);

  const matchedTrucks = useMemo(() => trucks.filter(truck => {
    const plate = normalizeLicensePlate(truck.licensePlate);
    return plate !== '' && gpsByPlate.has(plate);
  }), [trucks, gpsByPlate]);

  const selectableTrucks = useMemo(() => {
    const query = searchText.trim().toUpperCase();
    return matchedTrucks.filter(truck => {
      if (!query) return true;
      const location = gpsByPlate.get(normalizeLicensePlate(truck.licensePlate));
      return [truck.id, truck.licensePlate, truck.route, truck.dropPoint, truck.planEta,
        truck.supplierName, truck.driverName, location?.gpsId, location?.locationName]
        .filter(Boolean).join(' ').toUpperCase().includes(query);
    }).sort((first, second) => {
      const plateCompare = String(first.licensePlate || '').localeCompare(String(second.licensePlate || ''), 'th');
      if (plateCompare !== 0) return plateCompare;
      const etaCompare = formatPlanTime(first.planEta).localeCompare(formatPlanTime(second.planEta));
      if (etaCompare !== 0) return etaCompare;
      return String(first.id).localeCompare(String(second.id), undefined, { numeric: true });
    });
  }, [matchedTrucks, searchText, gpsByPlate]);

  const selectedTruck = useMemo(() => {
    if (!selectedTruckId) return undefined;
    return trucks.find(truck => truck.id === selectedTruckId);
  }, [trucks, selectedTruckId]);

  const selectedGpsLocation = useMemo(() => {
    if (!selectedTruck) return null;
    return gpsByPlate.get(normalizeLicensePlate(selectedTruck.licensePlate)) || null;
  }, [selectedTruck, gpsByPlate]);
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

  const selectedGeofenceEvaluation =
    useMemo<GeofenceEvaluation | null>(() => {
      if (!selectedGpsLocation) return null;
      const evaluations = GPS_GEOFENCES.map(geofence => {
        const distanceMeters = calculateDistanceMeters(
          selectedGpsLocation.latitude,
          selectedGpsLocation.longitude,
          geofence.latitude,
          geofence.longitude
        );
        return {
          ...geofence,
          distanceMeters,
          isInside: distanceMeters <= geofence.radiusMeters,
        };
      });
      const targetId = getTargetGeofenceId(selectedTruck?.dropPoint);
      if (targetId) {
        return evaluations.find(item => item.id === targetId) || null;
      }
      return evaluations.sort(
        (first, second) => first.distanceMeters - second.distanceMeters
      )[0] || null;
    }, [selectedGpsLocation, selectedTruck]);
  const selectedTargetPosition =
    useMemo<[number, number]>(() => {
      if (selectedGeofenceEvaluation) {
        return [selectedGeofenceEvaluation.latitude, selectedGeofenceEvaluation.longitude];
      }
      return TPCAP_POSITION;
    }, [selectedGeofenceEvaluation]);
  const selectedParkingStatus =
    useMemo(() => {
      if (!selectedGpsLocation || !selectedGeofenceEvaluation) return null;
      const isParked = Number(selectedGpsLocation.speed) === 0;
      if (!selectedGeofenceEvaluation.isInside) return 'OUTSIDE_GEOFENCE';
      if (selectedFreshness !== 'LIVE') return 'GPS_STALE';
      return isParked ? 'DOCK_PENDING' : 'MOVING_IN_GEOFENCE';
    }, [selectedFreshness, selectedGeofenceEvaluation, selectedGpsLocation]);
  const freshnessStats =
    useMemo(() => {
      let live =
        0;

      let stale =
        0;

      let offline =
        0;

      for (
        const location of matchedTrucks
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
      matchedTrucks,
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

    const streetLayer = L.tileLayer(
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors',
      }
    );
    const satelliteLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 19,
        attribution: 'Tiles © Esri',
      }
    );
    const terrainLayer = L.tileLayer(
      'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      {
        maxZoom: 17,
        attribution: 'Map data © OpenStreetMap contributors, SRTM | Map style © OpenTopoMap',
      }
    );
    streetLayer.addTo(map);
    baseLayerControlRef.current = L.control.layers(
      {
        'แผนที่ถนน': streetLayer,
        'ภาพถ่ายดาวเทียม': satelliteLayer,
        'ภูมิประเทศ': terrainLayer,
      },
      undefined,
      {
        position: 'topright',
        collapsed: true,
      }
    ).addTo(map);

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
    const geofenceLayer =
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
    geofenceLayerRef.current =
      geofenceLayer;

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

      baseLayerControlRef.current = null;
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
    const map = mapRef.current;
    const geofenceLayer = geofenceLayerRef.current;
    if (!map || !geofenceLayer) return;
    geofenceLayer.clearLayers();
    const geofencesToShow = showGeofenceDebug
      ? GPS_GEOFENCES
      : selectedGeofenceEvaluation
        ? [selectedGeofenceEvaluation]
        : [];
    for (const geofence of geofencesToShow) {
      const position: [number, number] = [geofence.latitude, geofence.longitude];
      L.circle(position, {
        radius: geofence.radiusMeters,
        color: geofence.color,
        weight: 3,
        opacity: 0.95,
        fillColor: geofence.color,
        fillOpacity: 0.12,
        dashArray: '8 6',
      }).addTo(geofenceLayer);
      L.marker(position, {
        icon: createGeofenceMarkerIcon(geofence.name, geofence.color),
        title: geofence.name,
        zIndexOffset: 800,
      }).addTo(geofenceLayer);
    }
  }, [showGeofenceDebug, selectedGeofenceEvaluation]);
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

    setSelectedTruckId(
      initialTruck.id
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
    if (!selectedTruckId) return;
    const selectedStillExists = trucks.some(truck => truck.id === selectedTruckId);
    if (!selectedStillExists) {
      setSelectedTruckId('');
      setRouteResult(null);
      setRouteError(null);
    }
  }, [trucks, selectedTruckId]);

  useEffect(() => {
    if (!selectedGpsLocation || !selectedTruck) {
      gpsDockRequestIdRef.current += 1;
      setGpsDockResult(null);
      setGpsDockError(null);
      setIsGpsDockLoading(false);
      return;
    }

    const requestId = gpsDockRequestIdRef.current + 1;
    gpsDockRequestIdRef.current = requestId;
    let cancelled = false;

    const loadGpsDockStatus = async () => {
      setIsGpsDockLoading(true);
      setGpsDockError(null);

      try {
        const result = await fetchGpsDockStatus(selectedTruck.id);

        if (cancelled || gpsDockRequestIdRef.current !== requestId) {
          return;
        }

        setGpsDockResult(result);
      } catch (error) {
        if (cancelled || gpsDockRequestIdRef.current !== requestId) {
          return;
        }

        console.error('Unable to load GPS Dock status:', error);
        setGpsDockResult(null);
        setGpsDockError(
          error instanceof Error
            ? error.message
            : 'ไม่สามารถอ่านสถานะ GPS Geofence จากระบบหลังบ้านได้'
        );
      } finally {
        if (!cancelled && gpsDockRequestIdRef.current === requestId) {
          setIsGpsDockLoading(false);
        }
      }
    };

    void loadGpsDockStatus();

    const intervalId = window.setInterval(() => {
      void loadGpsDockStatus();
    }, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [selectedGpsLocation, selectedTruck]);

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
              selectedGpsLocation.heading,
              Number(selectedGpsLocation.speed) > 0
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

    truckMarker.bindPopup(`
      <div style="min-width:190px;font-family:system-ui,sans-serif;">
        <div style="font-size:15px;font-weight:800;color:#0f172a;">${selectedTruck?.licensePlate || selectedGpsLocation.licensePlate || '-'}</div>
        <div style="margin-top:4px;font-size:12px;color:#334155;">${selectedGpsLocation.locationName || 'ไม่พบชื่อสถานี'}</div>
        <div style="margin-top:5px;font-size:11px;font-weight:800;color:${Number(selectedGpsLocation.speed) > 0 ? '#15803d' : '#b91c1c'};">${Number(selectedGpsLocation.speed) > 0 ? 'รถวิ่ง' : 'รถจอด'} · ${Number(selectedGpsLocation.speed).toFixed(0)} km/h</div>
        <div style="margin-top:3px;font-size:11px;color:#64748b;">อัปเดตล่าสุด ${getGpsAgeText(selectedGpsLocation)}</div>
      </div>
    `);
    truckMarker.addTo(markerLayer);

    const tpcapMarker =
      L.marker(
        selectedTargetPosition,
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
      const routePoints: [number, number][] = routeResult.geometry.coordinates
        .map(coordinate => [Number(coordinate[1]), Number(coordinate[0])] as [number, number])
        .filter(([latitude, longitude]) =>
          Number.isFinite(latitude) && Number.isFinite(longitude) &&
          latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
        );
      if (routePoints.length >= 2) {
        L.polyline(routePoints, {
          color: '#0284c7', weight: 6, opacity: 0.9,
          lineCap: 'round', lineJoin: 'round',
        }).addTo(routeLayer);
        const bounds = L.latLngBounds(routePoints);
        bounds.extend(truckPosition);
        bounds.extend(selectedTargetPosition);
        const routeDistanceMeters = Number(routeResult.distanceMeters || 0);
        const boundsDiagonalMeters = bounds.getSouthWest().distanceTo(bounds.getNorthEast());
        const maximumBoundsDiagonalMeters = Math.max(
          50000,
          routeDistanceMeters > 0 ? routeDistanceMeters * 3 : 0
        );
        const viewportFitKey = [
          selectedTruck?.id || '',
          truckPosition[0].toFixed(6), truckPosition[1].toFixed(6),
          selectedTargetPosition[0].toFixed(6), selectedTargetPosition[1].toFixed(6),
          routePoints.length,
          routePoints[0][0].toFixed(6), routePoints[0][1].toFixed(6),
          routePoints[routePoints.length - 1][0].toFixed(6),
          routePoints[routePoints.length - 1][1].toFixed(6),
        ].join('|');
        if (
          bounds.isValid() &&
          boundsDiagonalMeters <= maximumBoundsDiagonalMeters &&
          lastViewportFitKeyRef.current !== viewportFitKey
        ) {
          lastViewportFitKeyRef.current = viewportFitKey;
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15, animate: true });
        }
      }
    } else {
      const bounds =
        L.latLngBounds([
          truckPosition,
          selectedTargetPosition,
        ]);

      const viewportFitKey = [
        selectedTruck?.id || '',
        truckPosition[0].toFixed(6), truckPosition[1].toFixed(6),
        selectedTargetPosition[0].toFixed(6), selectedTargetPosition[1].toFixed(6),
        'fallback',
      ].join('|');
      if (bounds.isValid() && lastViewportFitKeyRef.current !== viewportFitKey) {
        lastViewportFitKeyRef.current = viewportFitKey;
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15, animate: true });
      }
    }
  }, [
    selectedGpsLocation,
    selectedTruck,
    routeResult,
    selectedTargetPosition,
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

      setSelectedTruckId(
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
      lastViewportFitKeyRef.current = '';
      gpsDockRequestIdRef.current += 1;
      setGpsDockResult(null);
      setGpsDockError(null);
      setIsGpsDockLoading(false);

      const map =
        mapRef.current;

      if (map) {
        const geofenceBounds = L.latLngBounds(
          GPS_GEOFENCES.map(geofence => [
            geofence.latitude,
            geofence.longitude,
          ] as [number, number])
        );
        map.fitBounds(geofenceBounds, {
          padding: [60, 60],
          maxZoom: 16,
          animate: true,
        });
      }
    };

  const showNoGpsMessage =
    gpsLocations.length ===
      0 &&
    !selectedGpsLocation;

  const showNoMatchMessage =
    gpsLocations.length >
      0 &&
    matchedTrucks.length ===
      0 &&
    !selectedGpsLocation;

  const showSelectTruckMessage =
    matchedTrucks.length >
      0 &&
    !selectedGpsLocation;

  const hasStampedEta = Boolean(
    selectedTruck?.stampEta ||
    selectedTruck?.actualEta ||
    gpsDockResult?.autoStampEtaResult
  );
  const hasStampedEtd = Boolean(
    selectedTruck?.stampEtd ||
    gpsDockResult?.autoStampEtdResult
  );
  const gpsAgeText = selectedGpsLocation ? getGpsAgeText(selectedGpsLocation) : '-';
  const stationName = selectedGpsLocation?.locationName || 'ไม่พบชื่อสถานี';
  const insideGeofence = selectedGeofenceEvaluation?.isInside ?? false;
  const geofenceName = selectedGeofenceEvaluation?.name || '-';
  const geofenceDistance = selectedGeofenceEvaluation?.distanceMeters;
  const geofenceRadius = selectedGeofenceEvaluation?.radiusMeters;
  const etaStatus = hasStampedEta ? 'STAMPED' : gpsDockResult?.readyForGpsStampEta ? 'READY' : 'WAITING';
  const etdStatus = hasStampedEtd ? 'STAMPED' : gpsDockResult?.readyForGpsStampEtd ? 'READY' : 'WAITING';
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-slate-50 p-2 md:p-3">
      <div className="flex shrink-0 flex-col gap-3 rounded-t-xl border border-b-0 border-slate-200 bg-white p-3 shadow-sm lg:flex-row lg:items-center">
        <div className="flex min-w-fit items-center gap-2">
          <h2 className="font-bold tracking-tight text-slate-900">Live Map</h2>
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">OPERATION</span>
        </div>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input type="text" value={searchText} onChange={event => setSearchText(event.target.value)} placeholder="ค้นหาทะเบียน / Route / ชื่อสถานี" className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
        </div>
        <select value={selectedTruckId} onChange={event => { setSelectedTruckId(event.target.value); appliedInitialTruckIdRef.current = null; }} className="min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 outline-none lg:w-[390px]">
          <option value="">เลือกเที่ยวรถที่ต้องการดู</option>
          {selectableTrucks.map(truck => (
            <option key={truck.id} value={truck.id}>
              {truck.licensePlate || truck.id}{truck.route ? ` | ${truck.route}` : ''}{truck.dropPoint ? ` | ${truck.dropPoint}` : ''}{truck.planEta ? ` | ${formatPlanTime(truck.planEta)}` : ''}
            </option>
          ))}
        </select>
        <button type="button" onClick={clearSelection} disabled={!selectedTruckId && !searchText} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"><X className="h-3.5 w-3.5" />ล้างการเลือก</button>
        <button type="button" onClick={handleRefresh} disabled={isRefreshing || !onRefresh} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />Refresh</button>
      </div>

      <div className="relative min-h-[420px] flex-1 overflow-hidden border-x border-slate-200 bg-slate-100">
        <div ref={mapContainerRef} className="h-full min-h-[420px] w-full" />
        {isRouteLoading && <div className="absolute right-3 top-3 z-[600] flex items-center gap-2 rounded-lg border border-blue-200 bg-white/95 px-3 py-2 text-xs font-semibold text-blue-700 shadow"><LoaderCircle className="h-4 w-4 animate-spin" />กำลังคำนวณเส้นทาง</div>}
        {routeError && <div className="absolute right-3 top-3 z-[600] max-w-sm rounded-lg border border-red-200 bg-white/95 px-3 py-2 text-xs text-red-700 shadow"><AlertTriangle className="mr-1 inline h-4 w-4" />{routeError}</div>}
        {showNoGpsMessage && <div className="absolute inset-0 z-[500] flex items-center justify-center bg-white/60"><div className="rounded-xl border bg-white p-6 text-center shadow-lg"><MapPin className="mx-auto h-8 w-8 text-slate-400" /><div className="mt-3 font-bold">ไม่พบข้อมูล GPS ของรถในแผน</div></div></div>}
        {showNoMatchMessage && <div className="absolute inset-0 z-[500] flex items-center justify-center"><div className="rounded-xl border border-amber-200 bg-white p-6 text-center shadow-lg"><AlertTriangle className="mx-auto h-8 w-8 text-amber-500" /><div className="mt-3 font-bold">ไม่พบท้ายทะเบียนที่ตรงกับ GPS</div></div></div>}
        {showSelectTruckMessage && <div className="absolute inset-0 z-[500] flex items-center justify-center"><div className="rounded-xl border bg-white p-6 text-center shadow-lg"><TruckIcon className="mx-auto h-8 w-8 text-blue-500" /><div className="mt-3 font-bold">เลือกรถที่ต้องการติดตาม</div><div className="mt-1 text-xs text-slate-500">พบรถที่จับคู่ GPS ได้ {matchedTrucks.length} คัน</div></div></div>}
      </div>

      <div className="shrink-0 overflow-x-auto rounded-b-xl border border-slate-200 bg-white shadow-sm">
        {!selectedGpsLocation ? (
          <div className="flex h-28 items-center justify-center text-sm text-slate-500">ข้อมูล Operation จะแสดงหลังเลือกรถ</div>
        ) : (
          <div className="grid min-w-[1180px] grid-cols-[1.35fr_1.45fr_.8fr_.8fr_.9fr_1.05fr_1.45fr] divide-x divide-slate-200">
            <div className="flex items-center gap-3 p-4"><TruckIcon className="h-8 w-8 shrink-0 text-emerald-600" /><div><div className="flex items-center gap-2"><span className="text-lg font-bold text-slate-900">{selectedTruck?.licensePlate || selectedGpsLocation.licensePlate || '-'}</span>{selectedFreshness && <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${getFreshnessClasses(selectedFreshness)}`}>{selectedFreshness}</span>}</div><div className="mt-1 text-xs font-semibold text-slate-600">{selectedTruck?.route || '-'} | {selectedTruck?.dropPoint || '-'}</div><div className={`mt-1 text-[11px] font-bold ${Number(selectedGpsLocation.speed) > 0 ? 'text-emerald-700' : 'text-red-700'}`}>{Number(selectedGpsLocation.speed) > 0 ? 'รถวิ่ง' : 'รถจอด'} · {Number(selectedGpsLocation.speed).toFixed(0)} km/h</div></div></div>
            <div className="p-4"><div className="text-[10px] font-bold uppercase text-slate-400">สถานีปัจจุบัน</div><div className="mt-1 line-clamp-2 text-sm font-bold text-slate-800" title={stationName}>{stationName}</div><div className="mt-1 text-[11px] text-slate-500">GPS {formatGpsDateTime(selectedGpsLocation.gpsTime)} · <span className="font-semibold text-emerald-700">{gpsAgeText}</span></div></div>
            <div className="p-4"><div className="text-[10px] font-bold uppercase text-blue-500">ระยะทาง</div><div className="mt-2 text-xl font-bold text-slate-900">{routeResult ? `${routeResult.distanceKilometers.toFixed(1)} km` : '-'}</div></div>
            <div className="p-4"><div className="text-[10px] font-bold uppercase text-indigo-500">เวลาเดินทาง</div><div className="mt-2 text-lg font-bold text-slate-900">{routeResult ? formatDuration(routeResult.durationMinutes) : '-'}</div></div>
            <div className="p-4"><div className="text-[10px] font-bold uppercase text-emerald-600">ETA ถึง TPCAP</div><div className="mt-2 text-lg font-bold text-slate-900">{routeResult ? formatEta(routeResult.estimatedArrival).split(', ').pop() : '-'}</div></div>
            <div className="p-4"><div className="flex items-center justify-between gap-2"><div className="text-[10px] font-bold uppercase text-slate-500">เป้าหมาย</div><span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${insideGeofence ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>{insideGeofence ? 'INSIDE' : 'OUTSIDE'}</span></div><div className="mt-1 text-base font-bold text-slate-900">{geofenceName}</div><div className="mt-1 text-[11px] text-slate-500">ระยะ {geofenceDistance !== undefined ? geofenceDistance >= 1000 ? `${(geofenceDistance / 1000).toFixed(1)} km` : `${geofenceDistance.toFixed(0)} m` : '-'} · รัศมี {geofenceRadius || '-'} m</div></div>
            <div className="grid grid-cols-3 divide-x divide-slate-200"><div className="p-4 text-center"><div className="text-[10px] font-bold uppercase text-slate-400">Plan ETA</div><div className="mt-2 text-base font-bold text-slate-900">{formatPlanTime(selectedTruck?.planEta)}</div></div><div className="p-4 text-center"><div className="text-[10px] font-bold uppercase text-blue-500">Stamp ETA</div><div className={`mt-2 text-sm font-bold ${etaStatus === 'STAMPED' ? 'text-emerald-600' : 'text-blue-600'}`}>{etaStatus}</div></div><div className="p-4 text-center"><div className="text-[10px] font-bold uppercase text-orange-500">Stamp ETD</div><div className={`mt-2 text-sm font-bold ${etdStatus === 'STAMPED' ? 'text-emerald-600' : 'text-orange-600'}`}>{etdStatus}</div></div></div>
          </div>
        )}
      </div>
      {(gpsDockError || isGpsDockLoading) && selectedGpsLocation && <div className="pointer-events-none absolute bottom-32 left-1/2 z-[700] -translate-x-1/2 rounded-lg border bg-white px-3 py-2 text-xs shadow-lg">{isGpsDockLoading ? 'กำลังอ่านสถานะ Geofence...' : gpsDockError}</div>}
    </div>
  );
}
