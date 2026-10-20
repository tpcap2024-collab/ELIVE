import React, { useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  MapPin,
  MessageSquare,
  Navigation,
  PackageCheck,
  Phone,
  Route,
  Truck as TruckIcon,
} from 'lucide-react';
import { Truck } from '../types';
import { StatusBadge } from './StatusBadge';

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

function getPerformanceConfig(truck: Truck): {
  label: string;
  className: string;
} {
  const status = hasGpsLostAction(truck)
    ? 'GPS_LOST'
    : hasNoWorkAction(truck)
      ? 'NO_DROP'
      : truck.performanceStatus;

  const configurations = {
    EARLY: {
      label: 'EARLY',
      className: 'border-blue-200 bg-blue-100 text-blue-700',
    },
    ON_PLAN: {
      label: 'ON PLAN',
      className: 'border-emerald-200 bg-emerald-100 text-emerald-700',
    },
    DELAY: {
      label: 'DELAY',
      className: 'border-red-200 bg-red-100 text-red-700',
    },
    WARNING: {
      label: 'WARNING',
      className: 'border-amber-200 bg-amber-100 text-amber-700',
    },
    NO_DROP: {
      label: 'NO DROP',
      className: 'border-slate-700 bg-slate-700 text-white',
    },
    GPS_LOST: {
      label: 'GPS LOST',
      className: 'border-orange-300 bg-slate-700 text-orange-400',
    },
  };

  return configurations[status] || configurations.ON_PLAN;
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

export function MobileTripCard({
  truck,
  canOperate,
  onOpenGps,
  onOpenAction,
  onOpenWorkDetail,
}: MobileTripCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const performance = getPerformanceConfig(truck);
  const gpsLost = hasGpsLostAction(truck);
  const noWork = hasNoWorkAction(truck);
  const completed = hasCompletedTrip(truck);
  const hasPendingWorkDetail = Boolean(
    canOperate && truck.workDetail && !truck.workDetailConfirmed
  );
  const actualEta = formatValue(truck.stampEta || truck.actualEta);
  const actualEtd = formatValue(truck.stampEtd);

  return (
    <article
      className={`overflow-hidden rounded-xl border border-l-4 border-slate-200 bg-white shadow-sm ${getCardAccentClass(
        truck
      )}`}
    >
      <div className="p-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 font-mono text-base font-black text-slate-900">
            {formatValue(truck.route)}
          </span>
          <span className="h-4 w-px shrink-0 bg-slate-200" />
          <span className="flex min-w-0 items-center gap-1.5 font-bold text-slate-800">
            <TruckIcon className="h-4 w-4 shrink-0 text-blue-600" />
            <span className="truncate">{formatValue(truck.licensePlate)}</span>
          </span>
          {truck.planRemark === 'EXTRA' && (
            <span className="shrink-0 rounded border border-violet-200 bg-violet-100 px-1.5 py-0.5 text-[9px] font-black text-violet-700">
              EXTRA
            </span>
          )}
          <span className="ml-auto shrink-0 font-mono text-sm font-black text-blue-700">
            {formatValue(truck.planEta)}
          </span>
        </div>

        <div className="mt-2 flex min-w-0 items-center gap-2 text-sm">
          <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="min-w-0 flex-1 truncate font-bold text-slate-700">
            {formatValue(truck.dropPoint)}
          </span>
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-black ${performance.className}`}
          >
            {performance.label}
          </span>
          {!gpsLost && !noWork && <StatusBadge status={truck.status} />}
          {completed && !gpsLost && !noWork && (
            <PackageCheck className="h-4 w-4 shrink-0 text-emerald-600" />
          )}
        </div>

        <div className="mt-2 flex min-w-0 items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-2">
          {gpsLost || noWork ? (
            <>
              <AlertTriangle
                className={`h-4 w-4 shrink-0 ${gpsLost ? 'text-orange-500' : 'text-slate-500'}`}
              />
              <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-700">
                {truck.actionProblem || (gpsLost ? 'GPS มีปัญหา' : 'ไม่มีงานลง')}
              </span>
            </>
          ) : (
            <>
              <span className="shrink-0 text-[10px] font-bold text-slate-400">ACTUAL</span>
              <span className="min-w-0 flex-1 truncate font-mono text-xs font-bold text-slate-700">
                {actualEta} / {actualEtd}
              </span>
              {truck.actionProblem && (
                <span className="min-w-0 truncate text-xs font-bold text-amber-700">
                  {truck.actionProblem}
                </span>
              )}
            </>
          )}
        </div>

        {hasPendingWorkDetail && (
          <button
            type="button"
            onClick={() => onOpenWorkDetail(truck)}
            className="mt-2 flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-amber-400 bg-yellow-300 px-3 py-2 text-left text-amber-950 active:scale-[0.99]"
          >
            <span className="flex min-w-0 items-center gap-2">
              <ClipboardCheck className="h-4 w-4 shrink-0" />
              <span className="truncate text-xs font-bold">มีรายละเอียดงานที่ต้องตรวจสอบ</span>
            </span>
            <span className="shrink-0 text-[10px] font-black">เปิดดู</span>
          </button>
        )}

        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenGps(truck.id)}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white shadow-sm active:scale-[0.98]"
          >
            <Navigation className="h-4 w-4" />
            ติดตามรถ
          </button>

          <button
            type="button"
            onClick={() => onOpenAction(truck)}
            disabled={!canOperate}
            className={`flex min-h-11 w-11 shrink-0 items-center justify-center rounded-lg border shadow-sm active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${
              truck.actionProblem
                ? 'border-red-600 bg-red-600 text-white'
                : 'border-slate-300 bg-white text-slate-600'
            }`}
            aria-label={canOperate ? 'เปิด Action' : 'ดูอย่างเดียว'}
            title={canOperate ? 'Action' : 'ดูอย่างเดียว'}
          >
            <MessageSquare className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={() => setShowDetails(current => !current)}
            aria-expanded={showDetails}
            className="flex min-h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 active:bg-slate-100"
            aria-label={showDetails ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียด'}
            title={showDetails ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียด'}
          >
            {showDetails ? (
              <ChevronUp className="h-5 w-5" />
            ) : (
              <ChevronDown className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      {showDetails && (
        <div className="border-t border-slate-200 bg-slate-50 p-3">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <dt className="text-[10px] font-medium text-slate-400">Code Run</dt>
              <dd className="mt-0.5 truncate font-mono font-bold text-slate-800">
                {formatValue(truck.id)}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-medium text-slate-400">Group Code</dt>
              <dd className="mt-0.5 truncate font-bold text-slate-800">
                {formatValue(truck.groupCode)}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-medium text-slate-400">สังกัด</dt>
              <dd className="mt-0.5 truncate font-medium text-slate-800">
                {formatValue(truck.supplierName)}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-medium text-slate-400">Project</dt>
              <dd className="mt-0.5 truncate font-medium text-slate-800">
                {formatValue(truck.project)}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-medium text-slate-400">Plan ETD</dt>
              <dd className="mt-0.5 font-mono font-bold text-slate-800">
                {formatValue(truck.planEtd)}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-medium text-slate-400">ประเภทรถ</dt>
              <dd className="mt-0.5 truncate font-medium text-slate-800">
                {formatValue(truck.truckType)}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-medium text-slate-400">ผู้ขับรถ</dt>
              <dd className="mt-0.5 truncate font-medium text-slate-800">
                {formatValue(truck.driverName)}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-medium text-slate-400">โทรศัพท์</dt>
              <dd className="mt-0.5 font-medium text-slate-800">
                {truck.phone ? (
                  <button
                    type="button"
                    onClick={() => callPhone(truck.phone)}
                    className="inline-flex items-center gap-1 font-bold text-blue-700 underline active:text-blue-900"
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
              <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                <Route className="h-3.5 w-3.5" />
                รายละเอียดงาน
              </p>
              <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-5 text-slate-700">
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
