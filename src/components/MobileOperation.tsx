import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Laptop,
  Menu,
  RefreshCw,
  Search,
  X,
  Truck as TruckIcon,
  WifiOff,
} from 'lucide-react';
import { GpsLocation, Truck } from '../types';
import { normalizeLicensePlate } from '../lib/sheets';
import MobileTripCard from './MobileTripCard';

type MobileFilter = 'ALL' | 'ACTIVE' | 'PENDING' | 'ISSUE' | 'COMPLETED';

interface MobileOperationProps {
  trucks: Truck[];
  gpsLocations?: GpsLocation[];
  selectedDate: string;
  lastUpdate: string;
  isRefreshing: boolean;
  canOperate: boolean;
  onRefresh: () => void | Promise<void>;
  onExitMobileMode: () => void;
  onOpenMenu?: () => void;
  onOpenGps: (truckId: string) => void;
  onOpenAction: (truck: Truck) => void;
  onOpenWorkDetail: (truck: Truck) => void;
}

const MOBILE_FILTERS: Array<{
  value: MobileFilter;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { value: 'ALL', label: 'ทั้งหมด', icon: TruckIcon },
  { value: 'ACTIVE', label: 'กำลังลงงาน', icon: TruckIcon },
  { value: 'PENDING', label: 'รอดำเนินการ', icon: Clock3 },
  { value: 'ISSUE', label: 'ผิดปกติ', icon: AlertTriangle },
  { value: 'COMPLETED', label: 'เสร็จแล้ว', icon: CheckCircle2 },
];


const MOBILE_FILTER_STYLES: Record<MobileFilter, { select: string; option: string }> = {
  ALL: { select: 'border-black bg-black text-white', option: 'bg-black text-white' },
  ACTIVE: { select: 'border-yellow-400 bg-yellow-300 text-yellow-950', option: 'bg-yellow-300 text-yellow-950' },
  PENDING: { select: 'border-slate-400 bg-slate-300 text-slate-950', option: 'bg-slate-300 text-slate-950' },
  ISSUE: { select: 'border-red-700 bg-red-600 text-white', option: 'bg-red-600 text-white' },
  COMPLETED: { select: 'border-emerald-700 bg-emerald-600 text-white', option: 'bg-emerald-600 text-white' },
};
function parseGpsTimestamp(value?: string): number {
  const text = String(value || '').trim();
  if (!text) return 0;
  const isoText = text.includes('T') ? text : text.replace(' ', 'T');
  const hasTimeZone = isoText.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(isoText);
  const timestamp = Date.parse(hasTimeZone ? isoText : `${isoText}+07:00`);
  return Number.isFinite(timestamp) ? timestamp : 0;
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

function isCompletedTruck(truck: Truck): boolean {
  return Boolean(
    hasNoWorkAction(truck) ||
      truck.status === 'COMPLETED' ||
      truck.status === 'TRUCK_OUT' ||
      truck.stampEtd
  );
}

function isActiveTruck(truck: Truck): boolean {
  if (hasGpsLostAction(truck) || hasNoWorkAction(truck) || isCompletedTruck(truck)) {
    return false;
  }

  return Boolean(
    truck.stampEta ||
      truck.actualEta ||
      truck.status === 'UNLOADING_AT_TPCAP' ||
      truck.status === 'WAITING_AREA' ||
      truck.status === 'DOCK_IN' ||
      truck.status === 'UNLOADING'
  );
}

function isIssueTruck(truck: Truck): boolean {
  return Boolean(
    hasGpsLostAction(truck) ||
      hasNoWorkAction(truck) ||
      truck.performanceStatus === 'DELAY' ||
      truck.performanceStatus === 'WARNING' ||
      String(truck.actionProblem || '').trim()
  );
}

function isPendingTruck(truck: Truck): boolean {
  return Boolean(
    !isCompletedTruck(truck) && !isActiveTruck(truck) && !hasGpsLostAction(truck)
  );
}

function getPlanEtaSortValue(value?: string): number {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return Number.MAX_SAFE_INTEGER;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return Number.MAX_SAFE_INTEGER;
  }
  return hour * 60 + minute;
}

function formatSelectedDate(value: string): string {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return text || '-';
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function MobileOperation({
  trucks,
  gpsLocations = [],
  selectedDate,
  lastUpdate,
  isRefreshing,
  canOperate,
  onRefresh,
  onExitMobileMode,
  onOpenMenu,
  onOpenGps,
  onOpenAction,
  onOpenWorkDetail,
}: MobileOperationProps) {
  const [filter, setFilter] = useState<MobileFilter>('ALL');
  const [searchText, setSearchText] = useState('');
  const [isOnline, setIsOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine
  );
  const trucksWithGps = useMemo(() => {
    if (gpsLocations.length === 0) return trucks;

    const gpsByPlate = new Map<string, GpsLocation>();
    for (const location of gpsLocations) {
      const plate = normalizeLicensePlate(location.licensePlate);
      if (!plate) continue;

      const existing = gpsByPlate.get(plate);
      const existingTime = parseGpsTimestamp(existing?.gpsTime || existing?.receivedAt);
      const candidateTime = parseGpsTimestamp(location.gpsTime || location.receivedAt);
      if (!existing || candidateTime >= existingTime) {
        gpsByPlate.set(plate, location);
      }
    }

    return trucks.map(truck => {
      const plate = normalizeLicensePlate(truck.licensePlate);
      const gpsLocation = plate ? gpsByPlate.get(plate) : undefined;
      return gpsLocation ? { ...truck, gpsLocation } : truck;
    });
  }, [gpsLocations, trucks]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const counts = useMemo(
    () => ({
      ALL: trucksWithGps.length,
      ACTIVE: trucksWithGps.filter(isActiveTruck).length,
      PENDING: trucksWithGps.filter(isPendingTruck).length,
      ISSUE: trucksWithGps.filter(isIssueTruck).length,
      COMPLETED: trucksWithGps.filter(isCompletedTruck).length,
    }),
    [trucksWithGps]
  );

  const visibleTrucks = useMemo(() => {
    const query = searchText.trim().toLocaleLowerCase('th');
    return trucksWithGps
      .filter(truck => {
        if (filter === 'ALL') return true;
        if (filter === 'ACTIVE') return isActiveTruck(truck);
        if (filter === 'PENDING') return isPendingTruck(truck);
        if (filter === 'ISSUE') return isIssueTruck(truck);
        return isCompletedTruck(truck);
      })
      .filter(truck => {
        if (!query) return true;
        return [truck.route, truck.licensePlate, truck.dropPoint, truck.supplierName, truck.project, truck.groupCode]
          .some(value => String(value || '').toLocaleLowerCase('th').includes(query));
      })
      .sort((first, second) => {
        if (filter !== 'COMPLETED' && isIssueTruck(first) !== isIssueTruck(second)) {
          return isIssueTruck(first) ? -1 : 1;
        }
        const planEtaDifference =
          getPlanEtaSortValue(first.planEta) - getPlanEtaSortValue(second.planEta);
        if (planEtaDifference !== 0) return planEtaDifference;
        return String(first.route || '').localeCompare(String(second.route || ''), 'en', {
          numeric: true,
        });
      });
  }, [filter, searchText, trucksWithGps]);
  const selectedFilter =
    MOBILE_FILTERS.find(item => item.value === filter) || MOBILE_FILTERS[0];
  const SelectedFilterIcon = selectedFilter.icon;

  return (
    <div className="flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-slate-100">
      <header className="sticky top-0 z-30 shrink-0 border-b border-slate-200 bg-white shadow-sm">
        <div className="flex min-h-16 items-center justify-between gap-2 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            {onOpenMenu && (
              <button
                type="button"
                onClick={onOpenMenu}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 active:bg-slate-100"
                aria-label="เปิดเมนู"
              >
                <Menu className="h-5 w-5" />
              </button>
            )}

            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600">
              <span className="text-xl font-black italic text-white">E</span>
            </div>

            <div className="min-w-0">
              <h1 className="truncate text-base font-black text-slate-900">
                ELIVE Mobile
              </h1>
              <p className="truncate text-[11px] text-slate-500">
                {formatSelectedDate(selectedDate)}
                <span className="mx-1.5">•</span>
                อัปเดต {lastUpdate || '-'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onExitMobileMode}
            className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 active:bg-slate-100"
          >
            <Laptop className="h-4 w-4" />
            Desktop
          </button>
        </div>

        {!isOnline && (
          <div className="flex items-center justify-center gap-2 border-t border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
            <WifiOff className="h-4 w-4 shrink-0" />
            ออฟไลน์ ข้อมูลอาจไม่เป็นปัจจุบัน
          </div>
        )}
      </header>

      <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <select
            value={filter}
            onChange={event => {
              const value = event.target.value;
              const option = MOBILE_FILTERS.find(item => item.value === value);
              if (option) setFilter(option.value);
            }}
            aria-label="เลือกสถานะรถ"
            className={`h-11 w-44 min-w-0 shrink-0 rounded-xl border px-3 text-sm font-black outline-none focus:ring-2 focus:ring-blue-500/30 ${
              MOBILE_FILTER_STYLES[filter].select
            }`}
          >
            {MOBILE_FILTERS.map(item => (
              <option
                key={item.value}
                value={item.value}
                className={`font-bold ${MOBILE_FILTER_STYLES[item.value].option}`}
              >
                {item.label} ({counts[item.value]})
              </option>
            ))}
          </select>
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchText}
              onChange={event => setSearchText(event.target.value)}
              placeholder="Route / ทะเบียน / จุดลงงาน"
              aria-label="ค้นหา Route ทะเบียน หรือจุดลงงาน"
              autoComplete="off"
              className="h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white pl-8 pr-9 text-base text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 [&::-webkit-search-cancel-button]:appearance-none"
            />
            {searchText && (
              <button
                type="button"
                onClick={() => setSearchText('')}
                aria-label="ล้างการค้นหา"
                className="absolute right-0 top-0 flex h-11 w-9 items-center justify-center rounded-r-xl text-slate-500 active:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <SelectedFilterIcon className="h-4 w-4 shrink-0 text-blue-600" />
            <span className="truncate text-sm font-bold text-slate-700">
              {selectedFilter.label}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600" role="status" aria-live="polite">
              {visibleTrucks.length} รายการ
            </span>
            <button
              type="button"
              onClick={() => void onRefresh()}
              disabled={isRefreshing || !isOnline}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="โหลดข้อมูลใหม่"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>
      <main
        className="mobile-operation-scroll min-h-0 flex-1 overflow-y-scroll overscroll-y-auto p-3"
        style={{
          touchAction: 'pan-y',
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorY: 'auto',
        }}
      >
        {visibleTrucks.length > 0 ? (
          <div className="mx-auto flex w-full max-w-xl flex-col gap-3 pb-24">
            {visibleTrucks.map(truck => (
              <MobileTripCard
                key={truck.id}
                truck={truck}
                canOperate={canOperate && isOnline}
                onOpenGps={onOpenGps}
                onOpenAction={onOpenAction}
                onOpenWorkDetail={onOpenWorkDetail}
              />
            ))}
          </div>
        ) : (
          <div className="mx-auto mt-8 w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <TruckIcon className="h-8 w-8" />
            </div>
            <h2 className="mt-4 font-bold text-slate-800">ไม่พบรายการ</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              ไม่พบรถที่ตรงกับสถานะหรือคำค้นหา
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

export default MobileOperation;
