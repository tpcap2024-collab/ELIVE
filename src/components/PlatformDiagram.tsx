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
}

type GroupFilter = 'M1' | 'L1' | 'L2' | 'R1' | 'R2';

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

const GROUP_FILTER_OPTIONS: GroupFilter[] = ['M1', 'L1', 'L2', 'R1', 'R2'];

const CATEGORIES = [
  { label: 'INTERPLANT', color: 'bg-white text-slate-800' },
  { label: 'MILK RUN', color: 'bg-white text-slate-800' },
  { label: 'BODY PARTS', color: 'bg-slate-200 text-slate-800' },
  { label: 'RETURN TRIP', color: 'bg-white text-slate-800' },
  { label: 'MIX BANPHO', color: 'bg-white text-slate-800' },
  { label: 'DIRECT', color: 'bg-white text-slate-800' },
];

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
      { id: '3', mappedPoint: 'L1-3' },
    ],
  },
  {
    groupName: 'L2',
    title: '(L2) LSP MON-FRI',
    docks: [
      { id: '4', mappedPoint: 'L2-4' },
      { id: '5', mappedPoint: 'L2-5' },
      { id: '6', mappedPoint: 'L2-6' },
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

function getTruckColor(truck: Truck): string {
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

export function PlatformDiagram({ trucks }: PlatformDiagramProps) {
  const [selectedTruck, setSelectedTruck] = useState<Truck | null>(null);
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

    return {
      total: trucks.length,
      unloading: trucks.filter(
        truck =>
          truck.status === 'UNLOADING' ||
          truck.status === 'DOCK_IN' ||
          truck.status === 'UNLOADING_AT_TPCAP'
      ).length,
      complete: trucks.filter(truck => completeStatuses.includes(truck.status)).length,
      remain: trucks.filter(truck => !completeStatuses.includes(truck.status)).length,
    };
  }, [trucks]);

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
    <div className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-slate-100 text-xs">
      <div className="w-full shrink-0 border-b border-slate-200 bg-white px-2 py-2">
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

      <div className="flex w-full shrink-0 flex-wrap items-center gap-1.5 border-b border-slate-200 bg-white px-2 py-1.5">
        <span className="mr-1 whitespace-nowrap text-[9px] font-bold uppercase text-slate-500">
          Show Dock:
        </span>

        <button
          type="button"
          onClick={allGroupsSelected ? clearAllGroups : selectAllGroups}
          className={`rounded-md border px-3 py-1 text-[9px] font-bold transition-colors ${
            allGroupsSelected
              ? 'border-slate-800 bg-slate-800 text-white'
              : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100'
          }`}
        >
          ALL
        </button>

        {GROUP_FILTER_OPTIONS.map(groupName => {
          const isSelected = selectedGroups.includes(groupName);
          return (
            <button
              key={groupName}
              type="button"
              onClick={() => toggleGroupFilter(groupName)}
              className={`rounded-md border px-3 py-1 text-[9px] font-bold transition-colors ${
                isSelected
                  ? 'border-blue-700 bg-blue-600 text-white shadow-sm'
                  : 'border-slate-300 bg-white text-slate-500 hover:bg-slate-100'
              }`}
            >
              {groupName}
            </button>
          );
        })}

        <div className="ml-auto flex items-center gap-2">
          <span className="whitespace-nowrap text-[9px] font-medium text-slate-500">
            แสดง {selectedGroups.length} จาก {GROUP_FILTER_OPTIONS.length} กลุ่ม
          </span>

          <button
            type="button"
            onClick={() => void toggleDiagramFullscreen()}
            title="แสดงเฉพาะ Platform Diagram เต็มหน้าจอ"
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[9px] font-bold text-slate-700 shadow-sm transition-colors hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700"
          >
            <Expand className="h-3.5 w-3.5" />
            FULL SCREEN
          </button>
        </div>
      </div>

      <div
        ref={diagramFullscreenRef}
        className={`relative min-h-0 min-w-0 overflow-hidden bg-slate-50 ${
          isDiagramFullscreen ? 'flex h-screen w-screen flex-col' : 'flex flex-1 flex-col'
        }`}
      >
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
            <div className="sticky top-0 z-50 flex h-8 w-full shrink-0 items-center gap-2 border-b border-slate-900 bg-slate-800 px-2">
              <div className="sticky left-2 z-[60] mr-auto flex items-center gap-2 whitespace-nowrap">
                <span className="text-[11px] font-bold text-white">
                  PLATFORM DIAGRAM
                </span>

                {isDiagramFullscreen && (
                  <button
                    type="button"
                    onClick={() => void toggleDiagramFullscreen()}
                    title="ออกจากโหมดเต็มหน้าจอ"
                    className="inline-flex items-center gap-1 rounded border border-white/30 bg-white/10 px-2 py-0.5 text-[8px] font-bold text-white transition-colors hover:bg-white/20"
                  >
                    <Minimize2 className="h-3 w-3" />
                    EXIT FULL SCREEN
                  </button>
                )}
              </div>

              <div className="ml-auto flex items-center gap-2">
                {CATEGORIES.map(category => (
                  <div
                    key={category.label}
                    className={`min-w-[92px] whitespace-nowrap border border-black px-2 py-0.5 text-center text-[8px] font-bold ${category.color}`}
                  >
                    {category.label}
                  </div>
                ))}
              </div>
            </div>

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
                                    className="flex flex-1 flex-col border-r border-slate-400"
                                  >
                                    <div className="border-b border-slate-300 bg-slate-200 text-center text-[8px] font-bold leading-[10px]">
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

                            <div className="flex h-[56px]">
                              <div className="sticky left-8 z-20 flex w-12 shrink-0 items-center justify-center border-r border-slate-300 bg-white text-sm font-bold text-slate-800 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                                {dock.id}
                              </div>

                              <div className="relative flex flex-1">
                                {HOURS.map(hour => (
                                  <div
                                    key={hour}
                                    className="flex flex-1 border-r border-slate-400"
                                  >
                                    {MINUTES.map(minute => (
                                      <div
                                        key={minute}
                                        className="flex-1 border-r border-slate-100 last:border-r-0"
                                      />
                                    ))}
                                  </div>
                                ))}

                                {dockTrucks.map(truck => {
                                  const etaToUse = truck.planEta || truck.stampEta;
                                  const startMins = parseTimeToMinutes(etaToUse);
                                  if (startMins === null) return null;

                                  let durationMins = 60;
                                  const etdToUse = truck.planEtd || truck.stampEtd;
                                  if (etdToUse) {
                                    const difference = calculateMinutesDifference(
                                      etaToUse || '',
                                      etdToUse
                                    );
                                    if (difference !== null && difference > 0) {
                                      durationMins = difference;
                                    }
                                  }

                                  const leftPercent = (startMins / TOTAL_MINS) * 100;
                                  const widthPercent = (durationMins / TOTAL_MINS) * 100;
                                  const left = Math.max(0, leftPercent);
                                  let width = widthPercent;

                                  if (leftPercent < 0) width = widthPercent + leftPercent;
                                  if (left + width > 100) width = 100 - left;
                                  if (width <= 0) return null;

                                  return (
                                    <motion.div
                                      key={truck.id}
                                      initial={{ opacity: 0, scaleY: 0 }}
                                      animate={{ opacity: 1, scaleY: 1 }}
                                      onClick={() => setSelectedTruck(truck)}
                                      className={`absolute bottom-0.5 top-0.5 flex cursor-pointer flex-col items-center justify-center overflow-hidden border p-0.5 text-center transition-shadow hover:z-10 hover:shadow-lg ${getTruckColor(
                                        truck
                                      )}`}
                                      style={{ left: `${left}%`, width: `${width}%` }}
                                      title={`${truck.licensePlate} (${truck.route})`}
                                    >
                                      <div className="w-full truncate text-[6px] font-bold leading-[7px]">
                                        {truck.route}
                                      </div>
                                      <div className="w-full truncate text-[6px] font-bold leading-[7px]">
                                        {truck.licensePlate}
                                      </div>
                                      {truck.performanceStatus === 'DELAY' && (
                                        <AlertTriangle className="absolute right-0.5 top-0.5 h-2.5 w-2.5 text-white" />
                                      )}
                                    </motion.div>
                                  );
                                })}
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
          {selectedTruck && (
            <div
              className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4"
              onMouseDown={event => {
                if (event.target === event.currentTarget) setSelectedTruck(null);
              }}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-sm overflow-hidden rounded-xl bg-white shadow-2xl"
              >
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 p-4">
                  <h3 className="text-sm font-bold text-slate-800">Truck Details</h3>
                  <button
                    type="button"
                    onClick={() => setSelectedTruck(null)}
                    className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="space-y-4 p-4">
                  <div>
                    <div className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                      License Plate
                    </div>
                    <div className="text-sm font-medium text-slate-800">
                      {selectedTruck.licensePlate}
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                      Route
                    </div>
                    <div className="text-sm text-slate-700">{selectedTruck.route}</div>
                  </div>

                  <div>
                    <div className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                      Supplier
                    </div>
                    <div className="text-sm text-slate-700">
                      {selectedTruck.supplierName || '-'}
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                      Drop Point
                    </div>
                    <div className="text-sm text-slate-700">
                      {selectedTruck.dropPoint || '-'}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                        Status
                      </div>
                      <div className="text-sm text-slate-700">{selectedTruck.status}</div>
                    </div>

                    <div>
                      <div className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                        Performance
                      </div>
                      <div className="text-sm text-slate-700">
                        {selectedTruck.performanceStatus || '-'}
                      </div>
                    </div>

                    <div>
                      <div className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                        Plan ETA
                      </div>
                      <div className="font-mono text-sm text-slate-700">
                        {selectedTruck.planEta || '-'}
                      </div>
                    </div>

                    <div>
                      <div className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                        Plan ETD
                      </div>
                      <div className="font-mono text-sm text-slate-700">
                        {selectedTruck.planEtd || '-'}
                      </div>
                    </div>

                    <div>
                      <div className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                        Actual ETA
                      </div>
                      <div className="font-mono text-sm text-slate-700">
                        {selectedTruck.stampEta || selectedTruck.actualEta || '-'}
                      </div>
                    </div>

                    <div>
                      <div className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                        Actual ETD
                      </div>
                      <div className="font-mono text-sm text-slate-700">
                        {selectedTruck.stampEtd || '-'}
                      </div>
                    </div>
                  </div>

                  {selectedTruck.actionProblem && (
                    <div className="rounded-lg border border-red-100 bg-red-50 p-3">
                      <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-red-700">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Action / Problem
                      </div>
                      <div className="whitespace-pre-wrap break-words text-sm text-red-800">
                        {selectedTruck.actionProblem}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
