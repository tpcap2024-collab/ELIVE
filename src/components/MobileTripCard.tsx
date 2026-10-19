import React, { useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Clock3,
  MapPin,
  MessageSquare,
  Navigation,
  PackageCheck,
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

  return (
    <article
      className={`overflow-hidden rounded-2xl border border-l-4 border-slate-200 bg-white shadow-sm ${getCardAccentClass(
        truck
      )}`}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-lg font-black text-slate-900">
                {formatValue(truck.route)}
              </span>
              {truck.planRemark === 'EXTRA' && (
                <span className="rounded-md border border-violet-200 bg-violet-100 px-2 py-0.5 text-[10px] font-black text-violet-700">
                  EXTRA
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-2 text-slate-700">
              <TruckIcon className="h-4 w-4 shrink-0 text-blue-600" />
              <span className="truncate text-base font-bold">
                {formatValue(truck.licensePlate)}
              </span>
            </div>
          </div>

          <div className="shrink-0 text-right">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
              Plan ETA
            </p>
            <p className="font-mono text-xl font-black text-blue-700">
              {formatValue(truck.planEta)}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
              <MapPin className="h-3.5 w-3.5" />
              จุดลงงาน
            </p>
            <p className="mt-1 truncate font-bold text-slate-800">
              {formatValue(truck.dropPoint)}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
              <Clock3 className="h-3.5 w-3.5" />
              Actual
            </p>
            <p className="mt-1 font-mono text-sm font-bold text-slate-800">
              {formatValue(truck.stampEta || truck.actualEta)}
              <span className="mx-1 text-slate-300">/</span>
              {formatValue(truck.stampEtd)}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black ${performance.className}`}
          >
            {performance.label}
          </span>

          {gpsLost ? (
            <span
              className="inline-flex rounded-full border border-orange-300 bg-slate-700 px-2.5 py-1 text-[11px] font-black text-orange-400"
              title={truck.actionProblem || 'GPS มีปัญหา'}
            >
              GPS LOST
            </span>
          ) : noWork ? (
            <span
              className="inline-flex rounded-full border border-slate-700 bg-slate-700 px-2.5 py-1 text-[11px] font-black text-white"
              title={truck.actionProblem || 'ไม่มีงาน'}
            >
              NO WORK
            </span>
          ) : (
            <StatusBadge status={truck.status} />
          )}

          {completed && !gpsLost && !noWork && (
            <PackageCheck className="h-5 w-5 text-emerald-600" />
          )}
        </div>

        {gpsLost && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="break-words">
              {truck.actionProblem || 'GPS มีปัญหา'}
            </span>
          </div>
        )}

        {noWork && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-slate-300 bg-slate-100 p-3 text-sm text-slate-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="break-words">
              {truck.actionProblem || 'ไม่มีงานลง'}
            </span>
          </div>
        )}

        {hasPendingWorkDetail && (
          <button
            type="button"
            onClick={() => onOpenWorkDetail(truck)}
            className="mt-3 flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border-2 border-amber-500 bg-yellow-300 px-4 py-3 text-left text-amber-950 shadow-sm active:scale-[0.99]"
          >
            <span className="flex min-w-0 items-center gap-2">
              <ClipboardCheck className="h-5 w-5 shrink-0" />
              <span className="font-bold">มีรายละเอียดงานที่ต้องตรวจสอบ</span>
            </span>
            <span className="shrink-0 text-xs font-black">เปิดดู</span>
          </button>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onOpenGps(truck.id)}
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-red-700 px-3 py-3 text-sm font-bold text-white shadow-sm active:scale-[0.98]"
          >
            <Navigation className="h-5 w-5" />
            GPS พิกัด
          </button>

          {canOperate ? (
            <button
              type="button"
              onClick={() => onOpenAction(truck)}
              className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold text-white shadow-sm active:scale-[0.98] ${
                truck.actionProblem ? 'bg-red-700' : 'bg-amber-500'
              }`}
            >
              <MessageSquare className="h-5 w-5" />
              Action
            </button>
          ) : (
            <button
              type="button"
              disabled
              className="flex min-h-12 cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-slate-200 px-3 py-3 text-sm font-bold text-slate-400"
            >
              <MessageSquare className="h-5 w-5" />
              ดูอย่างเดียว
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowDetails(current => !current)}
          aria-expanded={showDetails}
          className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-bold text-slate-600 active:bg-slate-100"
        >
          {showDetails ? (
            <>
              <ChevronUp className="h-4 w-4" />
              ซ่อนรายละเอียด
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4" />
              ดูรายละเอียด
            </>
          )}
        </button>
      </div>

      {showDetails && (
        <div className="border-t border-slate-200 bg-slate-50 p-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-xs font-medium text-slate-400">Code Run</dt>
              <dd className="mt-0.5 font-mono font-bold text-slate-800">
                {formatValue(truck.id)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-400">Group Code</dt>
              <dd className="mt-0.5 font-bold text-slate-800">
                {formatValue(truck.groupCode)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-400">สังกัด</dt>
              <dd className="mt-0.5 break-words font-medium text-slate-800">
                {formatValue(truck.supplierName)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-400">Project</dt>
              <dd className="mt-0.5 font-medium text-slate-800">
                {formatValue(truck.project)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-400">Plan ETD</dt>
              <dd className="mt-0.5 font-mono font-bold text-slate-800">
                {formatValue(truck.planEtd)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-400">ประเภทรถ</dt>
              <dd className="mt-0.5 font-medium text-slate-800">
                {formatValue(truck.truckType)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-400">ผู้ขับรถ</dt>
              <dd className="mt-0.5 break-words font-medium text-slate-800">
                {formatValue(truck.driverName)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-400">โทรศัพท์</dt>
              <dd className="mt-0.5 font-medium text-slate-800">
                {truck.phone ? (
                  <a className="text-blue-700 underline" href={`tel:${truck.phone}`}>
                    {truck.phone}
                  </a>
                ) : (
                  '-'
                )}
              </dd>
            </div>
          </dl>

          {truck.workDetail && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                <Route className="h-4 w-4" />
                รายละเอียดงาน
              </p>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
                {truck.workDetail}
              </p>
            </div>
          )}

          {truck.actionProblem && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-amber-700">
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
