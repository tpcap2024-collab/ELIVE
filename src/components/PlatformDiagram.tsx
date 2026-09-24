import { useEffect, useMemo, useRef, useState } from 'react';
import type { Truck } from '../types';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Expand,
  Minimize2,
  Package,
  Truck as TruckIcon,
  X,
} from 'lucide-react';
import { calculateMinutesDifference } from '../utils';

interface PlatformDiagramProps {
  trucks: Truck[];
  onOpenMap?: (truckId: string) => void;
}

type GroupFilter = 'M1' | 'L1' | 'L2' | 'L3' | 'R1' | 'R2';
type TimelineViewFilter = 'ALL' | 'PLAN' | 'ACTUAL';

type DockDefinition = {
  id: string;
  mappedPoint: string;
};

type RowGroup = {
  groupName: string;
  title: string;
  docks: DockDefinition[];
};

const START_HOUR = 7;
const END_HOUR = 17;
const TIMELINE_WIDTH = 2500;

const HOURS = Array.from(
  { length: END_HOUR - START_HOUR + 1 },
  (_, index) => START_HOUR + index
);

const MINUTES = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];
const TOTAL_MINS = (END_HOUR - START_HOUR + 1) * 60;

const GROUP_FILTER_OPTIONS: GroupFilter[] = ['M1', 'L1', 'L2', 'L3', 'R2', 'R1'];

const ROW_GROUPS: RowGroup[] = [
  {
    groupName: 'M1',
    title: 'MOTOR OIL',
    docks: [
      { id: '1', mappedPoint: 'M1-1' },
      { id: '2', mappedPoint: 'M1-2' },
    ],
  },
  {
    groupName: 'L1',
    title: '(L1) LSP MON-FRI',
    docks: [
      { id: '1', mappedPoint: 'L1-1' },
      { id: '2', mappedPoint: 'L1-2' },
    ],
  },
  {
    groupName: 'L2',
    title: '(L2) LSP MON-FRI',
    docks: [
      { id: '3', mappedPoint: 'L2-3' },
      { id: '4', mappedPoint: 'L2-4' },
    ],
  },
  {
    groupName: 'L3',
    title: '(L3) LSP MON-FRI',
    docks: [
      { id: '5', mappedPoint: 'L3-5' },
      { id: '6', mappedPoint: 'L3-6' },
    ],
  },
  {
    groupName: 'R2',
    title: 'FREELOCATION2#Shutter 2',
    docks: [{ id: '1', mappedPoint: 'R2-1' }],
  },
  {
    groupName: 'R1',
    title: 'FREELOCATION#1',
    docks: [
      { id: '1', mappedPoint: 'R1-1' },
      { id: '2', mappedPoint: 'R1-2' },
    ],
  },
];

function normalizePoint(point?: string): string {
  return String(point || '').replace(/\s+/g, '').toUpperCase();
}

function parseTimeToMinutes(timeText?: string): number | null {
  if (!timeText) return null;

  const match = String(timeText).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  return (hour - START_HOUR) * 60 + minute;
}

function isOverdueAndNotDocked(truck: Truck): boolean {
  if (truck.stampEta || truck.actualEta) return false;

  const dockedStatuses = [
    'DOCK_IN',
    'UNLOADING',
    'UNLOADING_AT_TPCAP',
    'COMPLETED',
    'TRUCK_OUT',
  ];

  if (dockedStatuses.includes(truck.status)) return false;
  if (!truck.planDate || !truck.planEta) return false;

  const planDate = String(truck.planDate).trim().slice(0, 10);
  const planTime = String(truck.planEta).trim().slice(0, 5);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(planDate) || !/^\d{2}:\d{2}$/.test(planTime)) {
    return false;
  }

  const plannedEta = new Date(`${planDate}T${planTime}:00+07:00`);
  if (Number.isNaN(plannedEta.getTime())) return false;

  return Date.now() > plannedEta.getTime();
}

function isNonInboundProject(truck: Truck): boolean {
  const project = String(truck.project || '').trim().toUpperCase();
  return project !== 'INBOUND';
}
function hasNoWorkAction(truck: Truck): boolean {
  return String(truck.actionProblem || '').includes('ไม่มีงาน');
}

function getHourBackgroundClass(hour: number): string {
  return hour === 12 ? 'bg-slate-200/80' : '';
}

function getTruckColor(truck: Truck): string {
  if (hasNoWorkAction(truck)) {
    return 'bg-black border-black text-white shadow-sm shadow-slate-500/50';
  }
  if (isNonInboundProject(truck)) {
    return 'bg-pink-500 border-pink-700 text-white shadow-sm shadow-pink-300/60';
  }

  if (isOverdueAndNotDocked(truck)) {
    return 'bg-red-600 border-red-800 text-white animate-pulse shadow-lg shadow-red-500/50';
  }

  if (truck.status === 'COMPLETED' || truck.status === 'TRUCK_OUT') {
    if (truck.performanceStatus === 'DELAY') {
      return 'bg-red-500 border-red-700 text-white';
    }
    if (truck.performanceStatus === 'EARLY') {
      return 'bg-blue-500 border-blue-700 text-white';
    }
    return 'bg-green-500 border-green-700 text-white';
  }

  if (
    truck.status === 'DOCK_IN' ||
    truck.status === 'UNLOADING' ||
    truck.status === 'UNLOADING_AT_TPCAP'
  ) {
    if (truck.performanceStatus === 'DELAY') {
      return 'bg-orange-500 border-orange-700 text-white';
    }
    return 'bg-yellow-400 border-yellow-600 text-slate-900';
  }

  if (truck.performanceStatus === 'DELAY') {
    return 'bg-red-500 border-red-700 text-white animate-pulse';
  }

  return 'bg-slate-300 border-slate-500 text-slate-800';
}

function getBangkokCurrentMinutes(): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const hour = Number(parts.find(part => part.type === 'hour')?.value || 0) % 24;
  const minute = Number(parts.find(part => part.type === 'minute')?.value || 0);
  return (hour - START_HOUR) * 60 + minute;
}

function getTimelinePosition(startMins: number, durationMins: number) {
  const leftPercent = (startMins / TOTAL_MINS) * 100;
  const widthPercent = (durationMins / TOTAL_MINS) * 100;
  const left = Math.max(0, leftPercent);
  let width = widthPercent;
  if (leftPercent < 0) width += leftPercent;
  if (left + width > 100) width = 100 - left;
  return width > 0 ? { left, width } : null;
}

function getPlanDurationMinutes(truck: Truck): number {
  const difference = calculateMinutesDifference(truck.planEta || '', truck.planEtd || '');
  return difference !== null && difference > 0 ? difference : 60;
}

function getActualDurationMinutes(truck: Truck, actualEta: string): number {
  if (truck.stampEtd) {
    const difference = calculateMinutesDifference(actualEta, truck.stampEtd);
    if (difference !== null && difference > 0) return difference;
  }
  const start = parseTimeToMinutes(actualEta);
  if (start === null) return 0;
  const elapsed = getBangkokCurrentMinutes() - start;
  return Math.max(10, elapsed > 0 ? elapsed : 10);
}

function getTimelineCardColor(truck: Truck, rowType: 'PLAN' | 'ACTUAL'): string {
  const base = getTruckColor(truck);
  if (truck.planRemark === 'EXTRA') {
    return `${base} ring-2 ring-inset ring-red-700`;
  }
  if (rowType === 'ACTUAL' && truck.stampEta && !truck.stampEtd) {
    return truck.performanceStatus === 'DELAY'
      ? 'bg-orange-500 border-orange-700 text-white'
      : 'bg-yellow-400 border-yellow-600 text-slate-900';
  }
  return base;
}

function getPerformanceLabel(truck: Truck): string {
  if (hasNoWorkAction(truck)) return 'NO DROP';
  if (isOverdueAndNotDocked(truck)) {
    const planMinutes = parseTimeToMinutes(truck.planEta);
    const currentMinutes = getBangkokCurrentMinutes();
    const sameDate = String(truck.planDate || '').slice(0, 10) === new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
    if (sameDate && planMinutes !== null && currentMinutes > planMinutes) {
      return `DELAY ${currentMinutes - planMinutes} MIN`;
    }
    return 'WAITING';
  }
  if (
    truck.status === 'DOCK_IN' ||
    truck.status === 'UNLOADING' ||
    truck.status === 'UNLOADING_AT_TPCAP'
  ) {
    return 'UNLOADING';
  }
  if (truck.performanceStatus === 'DELAY') {
    const actualEta = truck.stampEta || truck.actualEta || '';
    const difference = actualEta
      ? calculateMinutesDifference(truck.planEta || '', actualEta)
      : null;
    return difference !== null && difference > 0
      ? `DELAY ${difference} MIN`
      : 'DELAY';
  }
  if (truck.performanceStatus === 'EARLY') {
    const actualEta = truck.stampEta || truck.actualEta || '';
    const difference = actualEta
      ? calculateMinutesDifference(actualEta, truck.planEta || '')
      : null;
    return difference !== null && difference > 0
      ? `EARLY ${difference} MIN`
      : 'EARLY';
  }
  if (truck.performanceStatus === 'WARNING') return 'WARNING';
  if (truck.performanceStatus === 'NO_DROP') return 'NO DROP';
  return 'ON-TIME';
}

function getDurationText(start?: string, end?: string): string {
  if (!start || !end) return '-';
  const minutes = calculateMinutesDifference(start, end);
  if (minutes === null || minutes < 0) return '-';
  return `${minutes} MIN`;
}

function getPerformanceSummary(truck: Truck) {
  const label = getPerformanceLabel(truck);
  const actualEta = truck.stampEta || truck.actualEta || '';
  if (isOverdueAndNotDocked(truck)) {
    return {
      label,
      tone: 'red',
      description: actualEta
        ? `Actual ETA ${actualEta}`
        : 'เลย Plan ETA แล้ว แต่ยังไม่มี Actual ETA',
    };
  }
  if (truck.status === 'DOCK_IN' || truck.status === 'UNLOADING' || truck.status === 'UNLOADING_AT_TPCAP') {
    return { label: 'UNLOADING', tone: 'amber', description: 'รถเข้าพื้นที่แล้วและกำลังปฏิบัติงาน' };
  }
  if (truck.performanceStatus === 'DELAY') {
    return { label, tone: 'red', description: `Plan ETA ${truck.planEta || '-'} | Actual ETA ${actualEta || '-'}` };
  }
  if (truck.performanceStatus === 'EARLY') {
    return { label, tone: 'blue', description: `Plan ETA ${truck.planEta || '-'} | Actual ETA ${actualEta || '-'}` };
  }
  if (truck.performanceStatus === 'NO_DROP' || hasNoWorkAction(truck)) {
    return { label: 'NO DROP', tone: 'slate', description: truck.actionProblem || 'ไม่มีงานลง' };
  }
  return {
    label: actualEta ? 'ON-TIME' : 'PLANNED',
    tone: actualEta ? 'green' : 'slate',
    description: actualEta ? `Plan ETA ${truck.planEta || '-'} | Actual ETA ${actualEta}` : 'ยังไม่มี Actual ETA',
  };
}

function getStatusBadgeClass(status: Truck['status']): string {
  if (status === 'COMPLETED' || status === 'TRUCK_OUT') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'DOCK_IN' || status === 'UNLOADING' || status === 'UNLOADING_AT_TPCAP') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (status === 'WAITING_AREA') return 'border-slate-200 bg-slate-100 text-slate-700';
  return 'border-blue-200 bg-blue-50 text-blue-700';
}

export function PlatformDiagram({ trucks, onOpenMap }: PlatformDiagramProps) {
  const [selectedTruck, setSelectedTruck] = useState<Truck | null>(null);
  const [selectedRowType, setSelectedRowType] = useState<'PLAN' | 'ACTUAL'>('PLAN');
  const [hoveredTruckId, setHoveredTruckId] = useState<string | null>(null);
  const [timelineView, setTimelineView] = useState<TimelineViewFilter>('ALL');
  const [selectedGroups, setSelectedGroups] = useState<GroupFilter[]>([
    ...GROUP_FILTER_OPTIONS,
  ]);
  const [isDiagramFullscreen, setIsDiagramFullscreen] = useState(false);
  const diagramFullscreenRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsDiagramFullscreen(
        document.fullscreenElement === diagramFullscreenRef.current
      );
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleDiagramFullscreen = async () => {
    const diagramElement = diagramFullscreenRef.current;
    if (!diagramElement) return;

    try {
      if (document.fullscreenElement === diagramElement) {
        await document.exitFullscreen();
        return;
      }

      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }

      await diagramElement.requestFullscreen();
    } catch (error) {
      console.error('Unable to change Platform Diagram fullscreen mode:', error);
    }
  };

  const mappedDocks = useMemo(() => {
    const result = new Set<string>();
    ROW_GROUPS.forEach(group => {
      group.docks.forEach(dock => {
        result.add(normalizePoint(dock.mappedPoint));
      });
    });
    return result;
  }, []);

  const dynamicGroups = useMemo<RowGroup[]>(() => {
    const groups = ROW_GROUPS.map(group => ({
      ...group,
      docks: group.docks.map(dock => ({ ...dock })),
    }));

    const unmappedPoints = [
      ...new Set(
        trucks
          .map(truck => truck.dropPoint?.trim() || 'UNASSIGNED')
          .filter(dropPoint => !mappedDocks.has(normalizePoint(dropPoint)))
      ),
    ];

    if (unmappedPoints.length > 0) {
      groups.push({
        groupName: 'ETC',
        title: 'UNMAPPED DOCKS',
        docks: unmappedPoints.map(dropPoint => ({
          id: '?',
          mappedPoint: dropPoint,
        })),
      });
    }

    return groups;
  }, [trucks, mappedDocks]);

  const filteredGroups = useMemo(() => {
    return dynamicGroups.filter(
      group =>
        group.groupName === 'ETC' ||
        selectedGroups.includes(group.groupName as GroupFilter)
    );
  }, [dynamicGroups, selectedGroups]);

  const stats = useMemo(() => {
    const completeStatuses = ['COMPLETED', 'TRUCK_OUT'];
    const inboundTrucksInSelectedGroups = trucks.filter(truck => {
      if (String(truck.project || '').trim().toUpperCase() !== 'INBOUND') {
        return false;
      }

      const dropPoint = normalizePoint(truck.dropPoint);
      return selectedGroups.some(groupName =>
        dropPoint === groupName || dropPoint.startsWith(`${groupName}-`)
      );
    });

    return {
      total: inboundTrucksInSelectedGroups.length,
      unloading: inboundTrucksInSelectedGroups.filter(
        truck =>
          truck.status === 'UNLOADING' ||
          truck.status === 'DOCK_IN' ||
          truck.status === 'UNLOADING_AT_TPCAP'
      ).length,
      complete: inboundTrucksInSelectedGroups.filter(truck =>
        hasNoWorkAction(truck) || completeStatuses.includes(truck.status)
      ).length,
      remain: inboundTrucksInSelectedGroups.filter(truck =>
        !hasNoWorkAction(truck) && !completeStatuses.includes(truck.status)
      ).length,
    };
  }, [trucks, selectedGroups]);

  const allGroupsSelected = GROUP_FILTER_OPTIONS.every(groupName =>
    selectedGroups.includes(groupName)
  );

  const selectAllGroups = () => setSelectedGroups([...GROUP_FILTER_OPTIONS]);
  const clearAllGroups = () => setSelectedGroups([]);

  const toggleGroupFilter = (groupName: GroupFilter) => {
    setSelectedGroups(current =>
      current.includes(groupName)
        ? current.filter(selectedGroup => selectedGroup !== groupName)
        : [...current, groupName]
    );
  };

  return (
    <div
      ref={diagramFullscreenRef}
      className={`relative min-h-0 min-w-0 flex-col overflow-hidden bg-slate-100 text-xs ${
        isDiagramFullscreen ? 'flex h-screen w-screen' : 'flex h-full'
      }`}
    >
      <div className="w-full shrink-0 border-b border-slate-200 bg-white px-2 py-2">
        <div className="mb-2 flex w-full flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm lg:flex-row lg:items-center">
          <div className="shrink-0">
            <h2 className="text-xl font-bold tracking-tight text-slate-800">Platform Dashboard</h2>
            <p className="mt-1 text-sm text-slate-500">Real-Time Dock and Truck Operation Monitoring</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="mr-1 whitespace-nowrap text-[9px] font-bold uppercase text-slate-500">View:</span>
              {(['ALL', 'PLAN', 'ACTUAL'] as TimelineViewFilter[]).map(option => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setTimelineView(option)}
                  className={`rounded-md border px-3 py-1.5 text-[9px] font-bold transition-colors ${
                    timelineView === option
                      ? option === 'ALL'
                        ? 'border-slate-800 bg-slate-800 text-white shadow-sm'
                        : 'border-blue-700 bg-blue-600 text-white shadow-sm'
                      : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 whitespace-nowrap text-[9px] font-bold uppercase text-slate-500">Show Dock:</span>
            <button type="button" onClick={allGroupsSelected ? clearAllGroups : selectAllGroups} className={`rounded-md border px-3 py-1.5 text-[9px] font-bold transition-colors ${allGroupsSelected ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100'}`}>ALL</button>
            {GROUP_FILTER_OPTIONS.map(groupName => {
              const isSelected = selectedGroups.includes(groupName);
              return (
                <button key={groupName} type="button" onClick={() => toggleGroupFilter(groupName)} className={`rounded-md border px-3 py-1.5 text-[9px] font-bold transition-colors ${isSelected ? 'border-blue-700 bg-blue-600 text-white shadow-sm' : 'border-slate-300 bg-white text-slate-500 hover:bg-slate-100'}`}>{groupName}</button>
              );
            })}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="whitespace-nowrap text-[9px] font-medium text-slate-500">แสดง {selectedGroups.length} จาก {GROUP_FILTER_OPTIONS.length} กลุ่ม</span>
            <button type="button" onClick={() => void toggleDiagramFullscreen()} title={isDiagramFullscreen ? 'ออกจากโหมดเต็มหน้าจอ' : 'แสดง Platform Dashboard เต็มหน้าจอ'} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 shadow-sm hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700">
              {isDiagramFullscreen ? <Minimize2 className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
              {isDiagramFullscreen ? 'EXIT FULL SCREEN' : 'FULL SCREEN'}
            </button>
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 md:grid-cols-4">
          <div className="flex h-12 min-w-0 flex-col justify-center rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5">
            <p className="flex items-center gap-1 whitespace-nowrap text-[9px] font-bold uppercase text-slate-500">
              <TruckIcon className="h-3.5 w-3.5 shrink-0" />
              Total
            </p>
            <h3 className="mt-0.5 text-lg font-bold leading-none text-slate-800">
              {stats.total}
            </h3>
          </div>

          <div className="flex h-12 min-w-0 flex-col justify-center rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5">
            <p className="flex items-center gap-1 whitespace-nowrap text-[9px] font-bold uppercase text-slate-500">
              <Package className="h-3.5 w-3.5 shrink-0 text-yellow-500" />
              Unloading
            </p>
            <h3 className="mt-0.5 text-lg font-bold leading-none text-slate-800">
              {stats.unloading}
            </h3>
          </div>

          <div className="flex h-12 min-w-0 flex-col justify-center rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5">
            <p className="flex items-center gap-1 whitespace-nowrap text-[9px] font-bold uppercase text-slate-500">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
              Complete
            </p>
            <h3 className="mt-0.5 text-lg font-bold leading-none text-slate-800">
              {stats.complete}
            </h3>
          </div>

          <div className="flex h-12 min-w-0 flex-col justify-center rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5">
            <p className="flex items-center gap-1 whitespace-nowrap text-[9px] font-bold uppercase text-slate-500">
              <Clock className="h-3.5 w-3.5 shrink-0 text-blue-500" />
              Remain
            </p>
            <h3 className="mt-0.5 text-lg font-bold leading-none text-slate-800">
              {stats.remain}
            </h3>
          </div>
        </div>
      </div>

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-slate-50">
        <div
          className="relative min-h-0 min-w-0 flex-1 overflow-x-scroll overflow-y-auto bg-slate-50"
          style={{
            width: '100%',
            maxWidth: '100%',
            scrollbarGutter: 'stable',
          }}
        >
          <div
            className="flex shrink-0 flex-col bg-slate-50"
            style={{
              width: `${TIMELINE_WIDTH}px`,
              minWidth: `${TIMELINE_WIDTH}px`,
              maxWidth: 'none',
              flex: `0 0 ${TIMELINE_WIDTH}px`,
            }}
          >
            {filteredGroups.length === 0 && (
              <div className="flex h-40 w-full items-center justify-center border-b border-slate-300 bg-white text-sm font-semibold text-slate-500">
                กรุณาเลือกช่องที่ต้องการแสดงอย่างน้อย 1 กลุ่ม
              </div>
            )}

            {filteredGroups.map(group => {
              const groupMappedPoints = new Set(
                group.docks.map(dock => normalizePoint(dock.mappedPoint))
              );
              const groupTrips = trucks.filter(truck =>
                groupMappedPoints.has(normalizePoint(truck.dropPoint))
              ).length;

              return (
                <div
                  key={group.groupName}
                  className="flex flex-col border-b-2 border-slate-900"
                >
                  {group.title && (
                    <div className="sticky left-0 z-30 flex w-full border-b border-slate-800 bg-slate-600">
                      <div className="sticky left-0 z-40 flex h-4 w-20 shrink-0 items-center whitespace-nowrap border-r border-slate-800 bg-slate-600 px-1 text-[7px] font-bold tracking-wide text-white">
                        {group.title}
                      </div>
                      <div className="flex h-4 flex-1 items-center justify-center text-[7px] font-bold text-white">
                        {groupTrips} TRIPS
                      </div>
                    </div>
                  )}

                  <div className="flex">
                    <div className="sticky left-0 z-20 flex w-8 shrink-0 items-center justify-center border-r border-slate-800 bg-slate-700 text-sm font-bold text-white shadow-[2px_0_5px_rgba(0,0,0,0.1)]">
                      {group.groupName}
                    </div>

                    <div className="flex flex-1 flex-col">
                      {group.docks.map((dock, dockIndex) => {
                        const dockTrucks = trucks.filter(
                          truck =>
                            normalizePoint(truck.dropPoint || 'UNASSIGNED') ===
                            normalizePoint(dock.mappedPoint)
                        );

                        return (
                          <div
                            key={`${group.groupName}-${dock.id}-${dockIndex}`}
                            className="flex flex-col border-b-2 border-slate-900 bg-white last:border-b-0"
                          >
                            <div className="flex h-[18px] border-b border-slate-300 bg-slate-100">
                              <div className="sticky left-8 z-20 flex w-12 shrink-0 flex-col items-center justify-center border-r border-slate-300 bg-slate-50 text-[6px] font-bold leading-[6px] text-slate-600 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                                <span>TIME</span>
                                <span>(min)</span>
                              </div>

                              <div className="flex flex-1">
                                {HOURS.map(hour => (
                                  <div
                                    key={hour}
                                    className={`flex flex-1 flex-col border-r border-slate-400 ${getHourBackgroundClass(hour)}`}
                                  >
                                    <div className={`border-b border-slate-300 text-center text-[8px] font-bold leading-[10px] ${hour === 12 ? 'bg-slate-300 text-slate-700' : 'bg-slate-200'}`}>
                                      {String(hour).padStart(2, '0')}:00
                                    </div>
                                    <div className="flex h-2.5 text-[6px] font-medium leading-[10px] text-slate-600">
                                      {MINUTES.map(minute => (
                                        <div
                                          key={minute}
                                          className="flex-1 border-r border-slate-300 text-center last:border-r-0"
                                        >
                                          {minute}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>

                              <div className="sticky right-0 z-20 flex w-12 shrink-0 border-b border-l border-slate-300 border-l-slate-400 bg-slate-200 shadow-[-2px_0_5px_rgba(0,0,0,0.05)]">
                                <div className="flex flex-1 items-center justify-center text-center text-[8px] font-bold">
                                  Total
                                </div>
                              </div>
                            </div>

                            <div className="flex">
                              <div className="sticky left-8 z-20 flex w-12 shrink-0 items-center justify-center border-r border-slate-300 bg-white text-sm font-bold text-slate-800 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                                {dock.id}
                              </div>
                              <div className="relative flex flex-1 flex-col">
                                {(['PLAN', 'ACTUAL'] as const)
                                  .filter(rowType => timelineView === 'ALL' || timelineView === rowType)
                                  .map(rowType => (
                                    <div
                                      key={rowType}
                                      className={`relative flex h-[56px] border-b border-slate-300 last:border-b-0 ${
                                        rowType === 'PLAN' ? 'bg-white' : 'bg-emerald-100/80'
                                      }`}
                                    >
                                      {HOURS.map(hour => (
                                        <div key={hour} className={`flex flex-1 border-r border-slate-400 ${getHourBackgroundClass(hour)}`}>
                                          {MINUTES.map(minute => (
                                            <div key={minute} className="flex-1 border-r border-slate-100/80 last:border-r-0" />
                                          ))}
                                        </div>
                                      ))}
                                      <div className={`absolute left-1 top-1 z-[1] rounded px-1 py-0.5 text-[6px] font-black ${
                                        rowType === 'PLAN'
                                          ? 'bg-blue-100 text-blue-700'
                                          : 'bg-emerald-100 text-emerald-700'
                                      }`}>
                                        {rowType}
                                      </div>
                                      {dockTrucks.map(truck => {
                                        const startText = rowType === 'PLAN'
                                          ? truck.planEta
                                          : truck.stampEta || truck.actualEta || '';
                                        const startMins = parseTimeToMinutes(startText);
                                        if (startMins === null) return null;
                                        const durationMins = rowType === 'PLAN'
                                          ? getPlanDurationMinutes(truck)
                                          : getActualDurationMinutes(truck, startText);
                                        const position = getTimelinePosition(startMins, durationMins);
                                        if (!position) return null;
                                        const endText = rowType === 'PLAN'
                                          ? truck.planEtd || '-'
                                          : truck.stampEtd || 'NOW';
                                        return (
                                          <motion.div
                                            key={`${rowType}-${truck.id}`}
                                            initial={{ opacity: 0, scaleY: 0 }}
                                            animate={{ opacity: 1, scaleY: 1 }}
                                            onClick={() => { setSelectedTruck(truck); setSelectedRowType(rowType); }}
                                            onMouseEnter={() => setHoveredTruckId(truck.id)}
                                            onMouseLeave={() => setHoveredTruckId(null)}
                                            className={`absolute bottom-1 top-1 flex cursor-pointer flex-col items-center justify-center overflow-hidden border p-0.5 text-center transition-all hover:z-10 ${getTimelineCardColor(truck, rowType)} ${
                                              hoveredTruckId === truck.id
                                                ? 'z-30 ring-[3px] ring-yellow-300 ring-offset-1 ring-offset-yellow-100 shadow-xl shadow-yellow-400/80'
                                                : 'hover:shadow-lg'
                                            }`}
                                            style={{ left: `${position.left}%`, width: `${position.width}%` }}
                                            title={`${rowType}: ${truck.licensePlate} (${truck.route}) ${startText}-${endText}`}
                                          >
                                            {truck.planRemark === 'EXTRA' && (
                                              <div className="absolute left-0.5 top-0 text-[5px] font-black">+EXTRA</div>
                                            )}
                                            <div className="w-full truncate text-[7px] font-bold leading-[8px]">{truck.route}</div>
                                            <div className="w-full truncate text-[7px] font-bold leading-[8px]">{truck.licensePlate}</div>
                                            {rowType === 'ACTUAL' && (
                                              <div className="w-full truncate text-[6px] font-semibold leading-[7px]">
                                                {startText}-{endText}
                                              </div>
                                            )}
                                            <div className="w-full truncate text-[6px] font-black leading-[7px]">
                                              {getPerformanceLabel(truck)}
                                            </div>
                                            {!isNonInboundProject(truck) && truck.performanceStatus === 'DELAY' && (
                                              <AlertTriangle className="absolute right-0.5 top-0.5 h-2.5 w-2.5 text-white" />
                                            )}
                                          </motion.div>
                                        );
                                      })}
                                    </div>
                                  ))}
                              </div>
                              <div className="sticky right-0 z-20 flex w-12 shrink-0 border-l border-slate-400 bg-white shadow-[-2px_0_5px_rgba(0,0,0,0.05)]">
                                <div className="flex flex-1 items-center justify-center text-xs font-bold">
                                  {dockTrucks.length}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <AnimatePresence>
          {selectedTruck && (() => {
            const actualEta = selectedTruck.stampEta || selectedTruck.actualEta || '';
            const actualEtd = selectedTruck.stampEtd || '';
            const performance = getPerformanceSummary(selectedTruck);
            const toneClass = performance.tone === 'red'
              ? 'border-red-200 bg-red-50 text-red-700'
              : performance.tone === 'amber'
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : performance.tone === 'blue'
                  ? 'border-blue-200 bg-blue-50 text-blue-700'
                  : performance.tone === 'green'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 bg-slate-50 text-slate-700';
            return (
              <div
                className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/65 p-2 backdrop-blur-sm sm:p-4"
                onMouseDown={event => {
                  if (event.target === event.currentTarget) setSelectedTruck(null);
                }}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.97, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97, y: 10 }}
                  className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
                >
                  <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-7">
                    <div className="flex min-w-0 items-center gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
                        <TruckIcon className="h-7 w-7" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-xl font-black text-slate-900 sm:text-2xl">Trip Details</h3>
                          {selectedTruck.planRemark === 'EXTRA' && (
                            <span className="rounded-full border border-red-300 bg-red-50 px-2.5 py-1 text-xs font-black text-red-700">+ EXTRA</span>
                          )}
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${getStatusBadgeClass(selectedTruck.status)}`}>
                            {selectedTruck.status.replaceAll('_', ' ')}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-sm font-semibold text-slate-500">
                          {selectedTruck.route || '-'} · {selectedTruck.licensePlate || '-'} · {selectedTruck.id || '-'} · {selectedTruck.dropPoint || '-'}
                        </p>
                      </div>
                    </div>
                    <button type="button" onClick={() => setSelectedTruck(null)} className="rounded-xl p-2.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close trip details">
                      <X className="h-6 w-6" />
                    </button>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
                    <div className="grid gap-4 lg:grid-cols-3">
                      <section className={`rounded-2xl border p-4 ${selectedRowType === 'PLAN' ? 'border-blue-400 ring-2 ring-blue-100' : 'border-blue-200 bg-blue-50/50'}`}>
                        <div className="mb-4 text-sm font-black uppercase tracking-wide text-blue-700">PLAN</div>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between"><span className="font-bold text-slate-500">Plan ETA</span><span className="font-mono text-xl font-black text-blue-700">{selectedTruck.planEta || '-'}</span></div>
                          <div className="flex items-center justify-between"><span className="font-bold text-slate-500">Plan ETD</span><span className="font-mono text-xl font-black text-blue-700">{selectedTruck.planEtd || '-'}</span></div>
                          <div className="flex items-center justify-between border-t border-blue-100 pt-3"><span className="font-bold text-slate-500">Duration</span><span className="font-black text-slate-800">{getDurationText(selectedTruck.planEta, selectedTruck.planEtd)}</span></div>
                        </div>
                      </section>

                      <section className={`rounded-2xl border p-4 ${selectedRowType === 'ACTUAL' ? 'border-emerald-400 ring-2 ring-emerald-100' : 'border-emerald-200 bg-emerald-50/50'}`}>
                        <div className="mb-4 text-sm font-black uppercase tracking-wide text-emerald-700">ACTUAL</div>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between"><span className="font-bold text-slate-500">Actual ETA</span><span className="font-mono text-xl font-black text-emerald-700">{actualEta || '-'}</span></div>
                          <div className="flex items-center justify-between"><span className="font-bold text-slate-500">Actual ETD</span><span className="font-mono text-xl font-black text-emerald-700">{actualEtd || (actualEta ? 'IN PROGRESS' : '-')}</span></div>
                          <div className="flex items-center justify-between border-t border-emerald-100 pt-3"><span className="font-bold text-slate-500">Duration</span><span className="font-black text-slate-800">{getDurationText(actualEta, actualEtd)}</span></div>
                        </div>
                      </section>

                      <section className={`rounded-2xl border p-4 ${toneClass}`}>
                        <div className="mb-4 text-sm font-black uppercase tracking-wide">Performance Summary</div>
                        <div className="text-2xl font-black">{performance.label}</div>
                        <p className="mt-2 text-sm font-semibold leading-6 opacity-90">{performance.description}</p>
                      </section>
                    </div>

                    <section className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-4 text-sm font-black uppercase tracking-wide text-slate-700">Timeline Comparison</div>
                      <div className="space-y-3">
                        {(['PLAN', 'ACTUAL'] as const).map(kind => {
                          const startText = kind === 'PLAN' ? selectedTruck.planEta : actualEta;
                          const endText = kind === 'PLAN' ? selectedTruck.planEtd || '' : actualEtd || '';
                          const start = parseTimeToMinutes(startText);
                          const duration = kind === 'PLAN' ? getPlanDurationMinutes(selectedTruck) : actualEta ? getActualDurationMinutes(selectedTruck, actualEta) : 0;
                          const position = start === null ? null : getTimelinePosition(start, duration);
                          return (
                            <div key={kind} className="grid grid-cols-[68px_1fr] items-center gap-3">
                              <span className={`text-xs font-black ${kind === 'PLAN' ? 'text-blue-700' : 'text-emerald-700'}`}>{kind}</span>
                              <div className={`relative h-9 overflow-hidden rounded-lg ${kind === 'PLAN' ? 'bg-blue-50' : 'bg-emerald-50'}`}>
                                {position ? (
                                  <div className={`absolute bottom-1 top-1 flex min-w-[92px] items-center justify-center rounded-md px-2 text-xs font-black text-white ${kind === 'PLAN' ? 'bg-blue-600' : 'bg-emerald-600'}`} style={{ left: `${position.left}%`, width: `${position.width}%` }}>
                                    {startText}-{endText || 'NOW'}
                                  </div>
                                ) : (
                                  <div className="flex h-full items-center px-3 text-xs font-bold text-slate-400">ยังไม่มีข้อมูล</div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>

                    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="mb-4 text-sm font-black uppercase tracking-wide text-slate-700">Trip Information</div>
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                        {[
                          ['Supplier', selectedTruck.supplierName || '-'],
                          ['Project', selectedTruck.project || '-'],
                          ['Drop Point', selectedTruck.dropPoint || '-'],
                          ['Truck Type', selectedTruck.truckType || '-'],
                          ['Driver', selectedTruck.driverName || '-'],
                          ['Telephone', selectedTruck.phone || '-'],
                          ['Plan Date', selectedTruck.planDate || '-'],
                          ['Code Run', selectedTruck.id || '-'],
                          ['Route', selectedTruck.route || '-'],
                          ['License Plate', selectedTruck.licensePlate || '-'],
                        ].map(([label, value]) => (
                          <div key={label} className="min-w-0 border-l-2 border-slate-200 pl-3">
                            <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</div>
                            <div className="mt-1 break-words text-sm font-bold text-slate-800">{value}</div>
                          </div>
                        ))}
                      </div>
                    </section>

                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-black uppercase tracking-wide text-amber-800">Work Detail</div>
                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${selectedTruck.workDetailConfirmed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-200 text-amber-900'}`}>
                            {selectedTruck.workDetailConfirmed ? 'CONFIRMED' : 'WAITING'}
                          </span>
                        </div>
                        <div className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-800">{selectedTruck.workDetail || 'No work detail'}</div>
                      </section>

                      <section className="rounded-2xl border border-red-200 bg-red-50/70 p-4">
                        <div className="text-sm font-black uppercase tracking-wide text-red-700">Action / Problem</div>
                        <div className="mt-3 space-y-2 text-sm leading-5 text-slate-700">
                          <div><span className="font-black text-red-700">Problem:</span> {selectedTruck.actionProblem || '-'}</div>
                          <div><span className="font-black">Countermeasure:</span> {selectedTruck.actionCountermeasure || '-'}</div>
                          <div><span className="font-black">Responsible:</span> {selectedTruck.actionResponsible || '-'}</div>
                          <div><span className="font-black">Status:</span> {selectedTruck.actionStatus || '-'}</div>
                          <div><span className="font-black">Updated:</span> {selectedTruck.actionUpdatedAt || '-'}</div>
                        </div>
                      </section>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3 sm:px-7">
                    <span className="text-xs font-semibold text-slate-500">ข้อมูลล่าสุด {selectedTruck.lastUpdated || '-'}</span>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setSelectedTruck(null)} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100">Close</button>
                      {onOpenMap && (
                        <button type="button" onClick={() => { onOpenMap(selectedTruck.id); setSelectedTruck(null); }} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">View Live Map</button>
                      )}
                    </div>
                  </div>
                </motion.div>
              </div>
            );
          })()}
        </AnimatePresence>
      </div>
    </div>
  );
}
