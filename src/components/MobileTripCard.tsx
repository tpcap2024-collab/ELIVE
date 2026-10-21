import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  MessageSquare,
  Phone,
  Route,
} from 'lucide-react';
import { Truck } from '../types';
import { fetchRouteToTpcap, RouteToTpcapResult } from '../lib/sheets';

interface MobileTripCardProps {
  truck: Truck;
  canOperate: boolean;
  onOpenGps: (truckId: string) => void;
  onOpenAction: (truck: Truck) => void;
  onOpenWorkDetail: (truck: Truck) => void;
  onStamp: (truck: Truck, type: 'ETA' | 'ETD') => void | Promise<void>;
}

function hasCompletedTrip(truck: Truck): boolean {
  return Boolean(
    truck.status === 'COMPLETED' ||
      truck.status === 'TRUCK_OUT' ||
      truck.stampEtd
  );
}

function hasGpsLostAction(truck: Truck): boolean {
  const status = String(truck.status || '').trim().toUpperCase();
  const performanceStatus = String(truck.performanceStatus || '')
    .trim()
    .toUpperCase();
  const actionProblem = String(truck.actionProblem || '');
  const completed = Boolean((truck.stampEta || truck.actualEta) && truck.stampEtd);

  return (
    !completed &&
    (status === 'GPS_LOST' ||
      performanceStatus === 'GPS_LOST' ||
      actionProblem.includes('GPS มีปัญหา'))
  );
}

function hasNoWorkAction(truck: Truck): boolean {
  const status = String(truck.status || '').trim().toUpperCase();
  const performanceStatus = String(truck.performanceStatus || '')
    .trim()
    .toUpperCase();
  const actionProblem = String(truck.actionProblem || '');

  return (
    !hasGpsLostAction(truck) &&
    (status === 'NO_WORK' ||
      performanceStatus === 'NO_DROP' ||
      actionProblem.includes('ไม่มีงาน'))
  );
}

function getCardAccentClass(truck: Truck): string {
  if (hasCompletedTrip(truck)) return 'border-l-emerald-600';
  if (hasNoWorkAction(truck)) return 'border-l-slate-600';
  if (truck.performanceStatus === 'DELAY') return 'border-l-orange-600';
  if (truck.status === 'DOCK_IN' || truck.status === 'UNLOADING' || truck.status === 'UNLOADING_AT_TPCAP') {
    return 'border-l-yellow-500';
  }
  if (hasGpsLostAction(truck)) return 'border-l-orange-500';
  return 'border-l-blue-500';
}
function isUnloadingTrip(truck: Truck): boolean {
  return (
    truck.status === 'DOCK_IN' ||
    truck.status === 'UNLOADING' ||
    truck.status === 'UNLOADING_AT_TPCAP'
  );
}
function isPlanEtaReachedWithoutActivity(truck: Truck): boolean {
  if (hasCompletedTrip(truck) || hasNoWorkAction(truck)) return false;
  if (truck.stampEta || truck.actualEta || truck.stampEtd) return false;
  if (isUnloadingTrip(truck)) return false;
  const planDate = String(truck.planDate || '').trim().slice(0, 10);
  const planTimeMatch = String(truck.planEta || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(planDate) || !planTimeMatch) return false;
  const hour = Number(planTimeMatch[1]);
  const minute = Number(planTimeMatch[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return false;
  const plannedEta = new Date(
    `${planDate}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+07:00`
  );
  return !Number.isNaN(plannedEta.getTime()) && Date.now() >= plannedEta.getTime();
}
function getCardBackgroundClass(truck: Truck): string {
  // Priority: completed > no work > unloading delay > unloading > overdue inactivity > normal.
  if (hasCompletedTrip(truck)) return 'bg-emerald-100';
  if (hasNoWorkAction(truck)) return 'bg-slate-200';
  if (isUnloadingTrip(truck) && truck.performanceStatus === 'DELAY') return 'bg-orange-200';
  if (isUnloadingTrip(truck)) return 'bg-yellow-100';
  if (isPlanEtaReachedWithoutActivity(truck)) return 'animate-pulse bg-red-200';
  return 'bg-white';
}

function formatValue(value?: string): string {
  const text = String(value || '').trim();
  return text || '-';
}
function formatPlanEtaTime(value?: string): string {
  const text = String(value || '').trim();
  if (!text) return '-';
  const directTime = text.match(/^(\d{1,2}):(\d{2})/);
  if (directTime) return `${directTime[1].padStart(2, '0')}:${directTime[2]}`;
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

function callPhone(phone?: string): void {
  const number = String(phone || '').trim();
  if (!number) return;
  window.location.href = 'tel:' + number;
}

function formatRouteEta(value?: string): string {
  const text = String(value || '').trim();
  if (!text) return '-';
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatRouteDuration(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) return '-';
  const minutes = Math.max(1, Math.round(value));
  if (minutes < 60) return `${minutes} นาที`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0
    ? `${hours} ชม. ${remainingMinutes} นาที`
    : `${hours} ชม.`;
}

type MobileGeofence = {
  latitude: number;
  longitude: number;
  radiusMeters: number;
};
const MOBILE_TPCAP_SITE_POLYGON: [number, number][] = [
  [13.628373770556774, 101.01488672623992],
  [13.624058460200862, 101.01077277012493],
  [13.62156363013412, 101.01457300431943],
  [13.625365805109753, 101.01794805367612],
];
function isMobilePointInsidePolygon(
  latitude: number,
  longitude: number,
  polygon: [number, number][]
): boolean {
  let isInside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
    const currentLatitude = polygon[current][0];
    const currentLongitude = polygon[current][1];
    const previousLatitude = polygon[previous][0];
    const previousLongitude = polygon[previous][1];
    const intersects =
      (currentLatitude > latitude) !== (previousLatitude > latitude) &&
      longitude <
        ((previousLongitude - currentLongitude) * (latitude - currentLatitude)) /
          (previousLatitude - currentLatitude) +
        currentLongitude;
    if (intersects) isInside = !isInside;
  }
  return isInside;
}
const MOBILE_GEOFENCES: Record<'TPCAP-LSP' | 'TPCAP-R2' | 'TPCAP-R1', MobileGeofence> = {
  'TPCAP-LSP': { latitude: 13.624391050915499, longitude: 101.01532262451346, radiusMeters: 60 },
  'TPCAP-R2': { latitude: 13.624670855780815, longitude: 101.01287491445134, radiusMeters: 50 },
  'TPCAP-R1': { latitude: 13.626408220162133, longitude: 101.01512843208137, radiusMeters: 80 },
};
function getMobileTargetGeofence(dropPoint?: string): MobileGeofence | null {
  const value = String(dropPoint || '').trim().toUpperCase();
  if (/^R1(?:-|\b)/.test(value)) return MOBILE_GEOFENCES['TPCAP-R1'];
  if (/^R2(?:-|\b)/.test(value)) return MOBILE_GEOFENCES['TPCAP-R2'];
  if (/^(?:L1|L2|L3|M1)(?:-|\b)/.test(value)) return MOBILE_GEOFENCES['TPCAP-LSP'];
  return null;
}
function calculateMobileDistanceMeters(
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
    Math.cos(firstLatitudeRadians) * Math.cos(secondLatitudeRadians) *
    Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(haversine));
}

export function MobileTripCard({
  truck,
  canOperate,
  onOpenGps,
  onOpenAction,
  onOpenWorkDetail,
  onStamp,
}: MobileTripCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const cardRef = useRef<HTMLElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [routeResult, setRouteResult] = useState<RouteToTpcapResult | null>(null);
  const [isRouteLoading, setIsRouteLoading] = useState(false);
  const [routeUnavailable, setRouteUnavailable] = useState(false);
  const [pendingStamp, setPendingStamp] = useState<'ETA' | 'ETD' | null>(null);
  const [isStamping, setIsStamping] = useState(false);
  const [stampError, setStampError] = useState('');
  const gpsLost = hasGpsLostAction(truck);
  const noWork = hasNoWorkAction(truck);
  const completed = hasCompletedTrip(truck);
  const isInsideTpcap = Boolean(
    truck.gpsLocation &&
    isMobilePointInsidePolygon(
      truck.gpsLocation.latitude,
      truck.gpsLocation.longitude,
      MOBILE_TPCAP_SITE_POLYGON
    )
  );
  useEffect(() => {
    const element = cardRef.current;
    if (!element) return;
    if (typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '160px 0px' }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const location = truck.gpsLocation;
    if (!isVisible || !location || gpsLost || noWork || completed || isInsideTpcap) {
      setRouteResult(null);
      setRouteUnavailable(false);
      setIsRouteLoading(false);
      return;
    }

    let cancelled = false;
    setIsRouteLoading(true);
    setRouteUnavailable(false);
    void fetchRouteToTpcap(location.latitude, location.longitude)
      .then(result => {
        if (!cancelled) setRouteResult(result);
      })
      .catch(error => {
        console.error('Unable to calculate Mobile route:', error);
        if (!cancelled) {
          setRouteResult(null);
          setRouteUnavailable(true);
        }
      })
      .finally(() => {
        if (!cancelled) setIsRouteLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [completed, gpsLost, isInsideTpcap, isVisible, noWork, truck.gpsLocation]);

  const hasPendingWorkDetail = Boolean(
    canOperate && truck.workDetail && !truck.workDetailConfirmed
  );
  const actualEta = formatValue(truck.stampEta || truck.actualEta);
  const actualEtd = formatValue(truck.stampEtd);

  return (
    <article
      ref={cardRef}
      className={`overflow-hidden rounded-xl border border-l-4 border-slate-200 shadow-sm ${getCardBackgroundClass(
        truck
      )} ${getCardAccentClass(truck)}`}
    >
      <div className="px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setShowDetails(current => !current)}
            aria-expanded={showDetails}
            aria-label={`รายละเอียด ${truck.route} ${truck.licensePlate}`}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"
          >
            <span className="shrink-0 rounded-md bg-blue-700 px-2 py-1 font-mono text-base font-black leading-none tracking-tight text-white shadow-sm">
              {formatValue(truck.route)}
            </span>
            <span className="shrink-0 text-slate-300" aria-hidden="true">|</span>
            <span className="min-w-0 truncate text-lg font-black leading-none tracking-tight text-slate-950">
              {formatValue(truck.licensePlate)}
            </span>
            <span
              className="min-w-0 truncate rounded-md bg-slate-100 px-1.5 py-1 text-xs font-bold leading-none text-slate-600"
              title={formatValue(truck.dropPoint)}
            >
              {formatValue(truck.dropPoint)}
            </span>
            <span
              className="shrink-0 rounded-md bg-blue-50 px-1.5 py-1 font-mono text-xs font-black leading-none text-blue-700"
              title={`Plan ETA ${formatPlanEtaTime(truck.planEta)}`}
            >
              {formatPlanEtaTime(truck.planEta)}
            </span>
            {hasPendingWorkDetail && <ClipboardCheck className="h-4 w-4 shrink-0 text-amber-600" aria-label="มีงานรอตรวจสอบ เปิดรายละเอียด" />}
          </button>
          <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${
            gpsLost ? 'bg-orange-100 text-orange-800' : noWork ? 'bg-slate-100 text-slate-700' : completed ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-50 text-blue-700'
          }`}>
            {gpsLost ? 'GPS มีปัญหา' : noWork ? 'ไม่มีงานลง' : completed ? 'เสร็จแล้ว' : truck.status === 'TRAVELING' ? 'กำลังเดินทาง' : truck.status === 'WAITING_AREA' ? 'พื้นที่รอ' : truck.status === 'DOCK_IN' ? 'เข้าช่องจอด' : 'กำลังลงงาน'}
          </span>
        </div>
        <div className="flex min-w-0 items-center text-sm">
          <span className="min-w-0 flex-1 truncate font-semibold text-slate-700" title={truck.gpsLocation?.locationName || ''}>
            {truck.gpsLocation?.locationName || 'ยังไม่มีข้อมูลตำแหน่ง'}
          </span>
        </div>
        <div className="flex min-w-0 items-center justify-between gap-2">
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-600" title={truck.actionProblem || ''}>
            {gpsLost
              ? 'ไม่สามารถยืนยันเวลาถึง'
              : noWork
                ? (truck.actionProblem || 'ไม่มีงานลง')
                : completed
                  ? `ออก ${actualEtd}`
                  : isInsideTpcap
                    ? 'อยู่ในพื้นที่ TPCAP'
                    : isRouteLoading
                      ? 'กำลังคำนวณเส้นทาง...'
                      : routeResult
                        ? `อีก ${formatRouteDuration(routeResult.durationMinutes)} • ถึง ${formatRouteEta(routeResult.estimatedArrival)} • ${routeResult.distanceKilometers.toFixed(1)} กม.`
                        : routeUnavailable
                          ? 'ไม่สามารถคำนวณเส้นทางได้'
                          : truck.gpsLocation
                            ? 'รอคำนวณเส้นทาง'
                            : 'ยังไม่มีข้อมูลตำแหน่ง'}
          </span>
          <button
            type="button"
            onClick={() => onOpenGps(truck.id)}
            aria-label={`เปิดแผนที่ ${truck.route} ${truck.licensePlate}`}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-red-800 bg-red-50 shadow-sm active:bg-red-100"
          >
            <svg
              viewBox="0 0 32 40"
              className="h-8 w-7 shrink-0"
              aria-hidden="true"
            >
              <path
                d="M16 1.5C8.27 1.5 2 7.77 2 15.5c0 10.5 14 22.5 14 22.5s14-12 14-22.5C30 7.77 23.73 1.5 16 1.5Z"
                fill="#ff0000"
                stroke="#111827"
                strokeWidth="2.8"
                strokeLinejoin="round"
              />
              <circle
                cx="16"
                cy="15.5"
                r="6.5"
                fill="#ffffff"
                stroke="#111827"
                strokeWidth="2.5"
              />
            </svg>
          </button>
        </div>
      </div>

      {showDetails && (
        <div className="border-t border-slate-300 bg-white/55 p-3">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span>Plan {formatValue(truck.planEta)}</span>
            <span>Actual {actualEta} / {actualEtd}</span>
            <span>{truck.performanceStatus}</span>
            {truck.planRemark === 'EXTRA' && <span className="font-bold text-violet-700">EXTRA</span>}
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            {canStampEta && (
              <button type="button" onClick={() => { setStampError(''); setPendingStamp('ETA'); }} className="flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-black text-white shadow-sm">
                <CheckCircle2 className="h-4 w-4" /> Stamp ETA
              </button>
            )}
            {canStampEtd && (
              <button type="button" onClick={() => { setStampError(''); setPendingStamp('ETD'); }} className="flex min-h-11 items-center gap-2 rounded-lg bg-orange-500 px-4 text-xs font-black text-white shadow-sm">
                <CheckCircle2 className="h-4 w-4" /> Stamp ETD
              </button>
            )}
            <button type="button" disabled={!canOperate} onClick={() => onOpenAction(truck)} className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 disabled:opacity-40">
              <MessageSquare className="h-4 w-4" /> Action
            </button>
            {hasPendingWorkDetail && (
              <button type="button" onClick={() => onOpenWorkDetail(truck)} className="flex min-h-11 items-center gap-2 rounded-lg bg-yellow-300 px-3 text-xs font-bold text-amber-950">
                <ClipboardCheck className="h-4 w-4" /> ตรวจสอบงาน
              </button>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-x-5 gap-y-3">
            <div>
              <dt className="text-xs font-semibold text-slate-500">สังกัด</dt>
              <dd className="mt-1 truncate text-sm font-semibold leading-5 text-slate-900">
                {formatValue(truck.supplierName)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-slate-500">Project</dt>
              <dd className="mt-1 truncate text-sm font-semibold leading-5 text-slate-900">
                {formatValue(truck.project)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-slate-500">Plan ETD</dt>
              <dd className="mt-1 font-mono text-sm font-bold leading-5 text-slate-900">
                {formatValue(truck.planEtd)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-slate-500">ประเภทรถ</dt>
              <dd className="mt-1 truncate text-sm font-semibold leading-5 text-slate-900">
                {formatValue(truck.truckType)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-slate-500">ผู้ขับรถ</dt>
              <dd className="mt-1 truncate text-sm font-semibold leading-5 text-slate-900">
                {formatValue(truck.driverName)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-slate-500">โทรศัพท์</dt>
              <dd className="mt-1 text-sm font-semibold leading-5 text-slate-900">
                {truck.phone ? (
                  <button
                    type="button"
                    onClick={() => callPhone(truck.phone)}
                    className="inline-flex min-h-6 items-center gap-1 text-sm font-bold text-blue-700 underline underline-offset-2 active:text-blue-900"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    {truck.phone}
                  </button>
                ) : (
                  '-'
                )}
              </dd>
            </div>
          </dl>

          {truck.workDetail && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-white p-2.5">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-600">
                <Route className="h-3.5 w-3.5" />
                รายละเอียดงาน
              </p>
              <p className="mt-1.5 whitespace-pre-wrap break-words text-sm font-medium leading-6 text-slate-800">
                {truck.workDetail}
              </p>
            </div>
          )}

          {truck.actionProblem && (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">
                Action / Problem
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-amber-900">
                {truck.actionProblem}
              </p>
            </div>
          )}
        </div>
      )}
      {pendingStamp && (
        <div className="fixed inset-0 z-[1700] flex items-center justify-center bg-slate-950/70 p-4" onMouseDown={event => { if (event.target === event.currentTarget && !isStamping) setPendingStamp(null); }}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-black text-slate-900">ยืนยัน Stamp {pendingStamp}</h3>
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-800">{truck.route} • {truck.licensePlate} • {truck.dropPoint}</div>
            <p className="mt-3 text-sm text-slate-600">ระบบจะบันทึกเวลาปัจจุบันของประเทศไทย</p>
            {stampError && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{stampError}</div>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={isStamping} onClick={() => setPendingStamp(null)} className="rounded-xl border border-slate-300 px-4 py-2.5 font-bold text-slate-700 disabled:opacity-50">ยกเลิก</button>
              <button type="button" disabled={isStamping} onClick={() => void handleConfirmStamp()} className={`rounded-xl px-4 py-2.5 font-black text-white disabled:opacity-50 ${pendingStamp === 'ETA' ? 'bg-blue-600' : 'bg-orange-500'}`}>{isStamping ? 'กำลังบันทึก...' : `ยืนยัน Stamp ${pendingStamp}`}</button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

export default MobileTripCard;
