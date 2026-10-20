import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
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
  if (hasGpsLostAction(truck)) return 'border-l-orange-500';
  if (hasNoWorkAction(truck)) return 'border-l-slate-600';
  if (truck.performanceStatus === 'DELAY') return 'border-l-red-500';
  if (truck.performanceStatus === 'WARNING') return 'border-l-amber-500';
  if (hasCompletedTrip(truck)) return 'border-l-emerald-500';
  return 'border-l-blue-500';
}

function formatValue(value?: string): string {
  const text = String(value || '').trim();
  return text || '-';
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

export function MobileTripCard({
  truck,
  canOperate,
  onOpenGps,
  onOpenAction,
  onOpenWorkDetail,
}: MobileTripCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const cardRef = useRef<HTMLElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [routeResult, setRouteResult] = useState<RouteToTpcapResult | null>(null);
  const [isRouteLoading, setIsRouteLoading] = useState(false);
  const [routeUnavailable, setRouteUnavailable] = useState(false);
  const gpsLost = hasGpsLostAction(truck);
  const noWork = hasNoWorkAction(truck);
  const completed = hasCompletedTrip(truck);
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
    if (!isVisible || !location || gpsLost || noWork || completed) {
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
  }, [completed, gpsLost, isVisible, noWork, truck.gpsLocation]);

  const hasPendingWorkDetail = Boolean(
    canOperate && truck.workDetail && !truck.workDetailConfirmed
  );
  const actualEta = formatValue(truck.stampEta || truck.actualEta);
  const actualEtd = formatValue(truck.stampEtd);

  return (
    <article
      ref={cardRef}
      className={`overflow-hidden rounded-xl border border-l-4 border-slate-200 bg-white shadow-sm ${getCardAccentClass(
        truck
      )}`}
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
            {hasPendingWorkDetail && <ClipboardCheck className="h-4 w-4 shrink-0 text-amber-600" aria-label="มีงานรอตรวจสอบ เปิดรายละเอียด" />}
            {showDetails ? <ChevronUp className="h-3 w-3 shrink-0 text-slate-400" /> : <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" />}
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
        <div className="border-t border-slate-200 bg-slate-50 p-3">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span>Plan {formatValue(truck.planEta)}</span>
            <span>Actual {actualEta} / {actualEtd}</span>
            <span>{truck.performanceStatus}</span>
            {truck.planRemark === 'EXTRA' && <span className="font-bold text-violet-700">EXTRA</span>}
          </div>
          <div className="mb-3 flex gap-2">
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
    </article>
  );
}

export default MobileTripCard;
