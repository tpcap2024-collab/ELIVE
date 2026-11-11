import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Laptop,
  LogOut,
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
type MobileAreaFilter = 'ALL' | 'LSP' | 'R1' | 'R2';
const MOBILE_AREA_FILTERS: Array<{ value: MobileAreaFilter; label: string }> = [
  { value: 'ALL', label: 'ทุกพื้นที่' }, { value: 'LSP', label: 'LSP' }, { value: 'R1', label: 'R1' }, { value: 'R2', label: 'R2' },
];
function getMobileArea(truck: Truck): Exclude<MobileAreaFilter, 'ALL'> | 'OTHER' {
  const dropPoint = String(truck.dropPoint || '').trim().toUpperCase();
  if (/^(?:M1|L1|L2|L3)(?:-|\b)/.test(dropPoint)) return 'LSP';
  if (/^R1(?:-|\b)/.test(dropPoint)) return 'R1';
  if (/^R2(?:-|\b)/.test(dropPoint)) return 'R2';
  return 'OTHER';
}

interface MobileOperationProps {
  trucks: Truck[];
  gpsLocations?: GpsLocation[];
  selectedDate: string;
  onDateChange: (date: string) => void;
  lastUpdate: string;
  isRefreshing: boolean;
  canOperate: boolean;
  onRefresh: () => void | Promise<void>;
  onExitMobileMode: () => void;
  showDesktopButton?: boolean;
  onLogout: () => void | Promise<void>;
  onOpenMenu?: () => void;
  onOpenGps: (truckId: string) => void;
  onOpenAction: (truck: Truck) => void;
  onOpenWorkDetail: (truck: Truck) => void;
  onStampTruck: (truck: Truck, type: 'ETA' | 'ETD') => void | Promise<void>;
}

const MOBILE_FILTERS: Array<{
  value: MobileFilter;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { value: 'ALL', label: 'ทั้งหมด', icon: TruckIcon },
  { value: 'ACTIVE', label: 'กำลังทำงาน', icon: TruckIcon },
  { value: 'PENDING', label: 'รอดำเนินการ', icon: Clock3 },
  { value: 'ISSUE', label: 'ผิดปกติ', icon: AlertTriangle },
  { value: 'COMPLETED', label: 'เสร็จแล้ว', icon: CheckCircle2 },
];

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
  if (hasNoWorkAction(truck)) return false;
  return Boolean(
    hasGpsLostAction(truck) ||
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
  onDateChange,
  lastUpdate,
  isRefreshing,
  canOperate,
  onRefresh,
  onExitMobileMode,
  showDesktopButton = false,
  onLogout,
  onOpenMenu,
  onOpenGps,
  onOpenAction,
  onOpenWorkDetail,
  onStampTruck,
}: MobileOperationProps) {
  const [filter, setFilter] = useState<MobileFilter>('ALL');
  const [areaFilter, setAreaFilter] = useState<MobileAreaFilter>('ALL');
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

  const areaTrucks = useMemo(
    () => areaFilter === 'ALL' ? trucksWithGps : trucksWithGps.filter(truck => getMobileArea(truck) === areaFilter),
    [areaFilter, trucksWithGps]
  );
  const areaKpi = useMemo(() => ({
    total: areaTrucks.length,
    completed: areaTrucks.filter(isCompletedTruck).length,
    unloading: areaTrucks.filter(isActiveTruck).length,
    remaining: areaTrucks.filter(truck => !isCompletedTruck(truck) && !isActiveTruck(truck) && !hasNoWorkAction(truck)).length,
    issue: areaTrucks.filter(isIssueTruck).length,
  }), [areaTrucks]);
  const visibleTrucks = useMemo(() => {
    const query = searchText.trim().toLocaleLowerCase('th');
    return areaTrucks
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
  }, [areaTrucks, filter, searchText]);
  const selectedFilter =
    MOBILE_FILTERS.find(item => item.value === filter) || MOBILE_FILTERS[0];
  const SelectedFilterIcon = selectedFilter.icon;

  return (
    <div className="flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-slate-100">
      <header className="sticky top-0 z-30 shrink-0 border-b border-slate-200 bg-white shadow-sm">
        <div className="flex min-h-16 items-center justify-between gap-2 px-3 py-2">
          <div className="mt-3 flex min-w-0 items-center gap-2">
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
            <img
              src="/pwa-192x192.png"
              alt="ELIVE"
              className="h-11 w-11 shrink-0 rounded-full object-contain shadow-sm"
            />

            <div className="min-w-0">
              <h1 className="truncate text-base font-black text-slate-900">
                Mobile Operation
              </h1>
              <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-slate-500">
                <label className="relative inline-flex shrink-0 items-center rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 font-bold text-blue-700">
                  <span>{formatSelectedDate(selectedDate)}</span>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={event => onDateChange(event.target.value)}
                    disabled={isRefreshing}
                    aria-label="เลือกวันที่แผนงาน"
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                  />
                </label>
                <span>•</span>
                <span className="truncate">อัปเดต {lastUpdate || '-'}</span>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {showDesktopButton && (

              <button

                            type="button"

                            onClick={onExitMobileMode}

                            className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 active:bg-slate-100"

                            aria-label="กลับหน้า Desktop"

                            title="Desktop"

                          >

                            <Laptop className="h-5 w-5" />

                          </button>

            )}
            <button
              type="button"
              onClick={() => {
                if (window.confirm('ต้องการออกจากระบบหรือไม่?')) void onLogout();
              }}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-red-200 bg-white text-red-600 active:bg-red-50"
              aria-label="ออกจากระบบ"
              title="ออกจากระบบ"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>

        {!isOnline && (
          <div className="flex items-center justify-center gap-2 border-t border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
            <WifiOff className="h-4 w-4 shrink-0" />
            ออฟไลน์ ข้อมูลอาจไม่เป็นปัจจุบัน
          </div>
        )}
      </header>

      <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-3">
        <div className="grid grid-cols-4 gap-1.5">
          {MOBILE_AREA_FILTERS.map(item => <button key={item.value} type="button" onClick={() => setAreaFilter(item.value)} className={`h-9 rounded-lg border px-2 text-xs font-black ${areaFilter === item.value ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-600'}`}>{item.label}</button>)}
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          <button type="button" onClick={() => setFilter('ALL')} aria-pressed={filter === 'ALL'} className={`rounded-lg border p-1.5 text-center transition-all ${filter === 'ALL' ? 'border-slate-900 bg-slate-900 text-white ring-2 ring-slate-300' : 'border-slate-300 bg-slate-50 text-slate-700'}`}><p className="text-[9px] font-bold">ทั้งหมด</p><p className="font-black tabular-nums">{areaKpi.total}</p></button>
          <button type="button" onClick={() => setFilter('COMPLETED')} aria-pressed={filter === 'COMPLETED'} className={`rounded-lg border p-1.5 text-center transition-all ${filter === 'COMPLETED' ? 'border-emerald-700 bg-emerald-600 text-white ring-2 ring-emerald-200' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}><p className="text-[9px] font-bold">ลงแล้ว</p><p className="font-black tabular-nums">{areaKpi.completed}</p></button>
          <button type="button" onClick={() => setFilter('ACTIVE')} aria-pressed={filter === 'ACTIVE'} className={`rounded-lg border p-1.5 text-center transition-all ${filter === 'ACTIVE' ? 'border-amber-600 bg-amber-500 text-slate-950 ring-2 ring-amber-200' : 'border-amber-200 bg-amber-50 text-amber-800'}`}><p className="text-[9px] font-bold">กำลังลง</p><p className="font-black tabular-nums">{areaKpi.unloading}</p></button>
          <button type="button" onClick={() => setFilter('PENDING')} aria-pressed={filter === 'PENDING'} className={`rounded-lg border p-1.5 text-center transition-all ${filter === 'PENDING' ? 'border-blue-700 bg-blue-600 text-white ring-2 ring-blue-200' : 'border-blue-200 bg-blue-50 text-blue-800'}`}><p className="text-[9px] font-bold">เหลือ</p><p className="font-black tabular-nums">{areaKpi.remaining}</p></button>
        </div>
        {areaKpi.issue > 0 && <button type="button" onClick={() => setFilter('ISSUE')} aria-pressed={filter === 'ISSUE'} className={`mt-1.5 flex w-full items-center justify-center rounded-lg border px-3 py-1.5 text-xs font-black transition-all ${filter === 'ISSUE' ? 'border-red-700 bg-red-600 text-white ring-2 ring-red-200' : 'border-red-200 bg-red-50 text-red-700'}`}><AlertTriangle className="mr-1.5 h-3.5 w-3.5" />ผิดปกติ {areaKpi.issue} รายการ</button>}
        <div className="flex min-w-0 items-center gap-2">
          <div className="relative mt-3 min-w-0 flex-1">
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
                onStamp={onStampTruck}
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
