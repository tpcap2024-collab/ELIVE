import React, { useMemo, useState } from 'react';
import { Truck } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertTriangle,
  X,
  Package,
  CheckCircle2,
  Clock,
  Truck as TruckIcon,
} from 'lucide-react';
import { calculateMinutesDifference } from '../utils';

interface PlatformDiagramProps {
  trucks: Truck[];
}

export function PlatformDiagram({
  trucks,
}: PlatformDiagramProps) {
  const [selectedTruck, setSelectedTruck] =
    useState<Truck | null>(null);

  /*
   * Timeline ตั้งแต่ 06:00-18:00
   */
  const START_HOUR = 6;
  const END_HOUR = 18;

  const HOURS = Array.from(
    {
      length: END_HOUR - START_HOUR + 1,
    },
    (_, index) => START_HOUR + index
  );

  const MINUTES = [
    5,
    10,
    15,
    20,
    25,
    30,
    35,
    40,
    45,
    50,
    55,
    60,
  ];

  const TOTAL_MINS =
    (END_HOUR - START_HOUR + 1) * 60;

  const categories = [
    {
      label: 'INTERPLANT',
      color: 'bg-white text-slate-800',
    },
    {
      label: 'MILK RUN',
      color: 'bg-white text-slate-800',
    },
    {
      label: 'BODY PARTS',
      color: 'bg-slate-200 text-slate-800',
    },
    {
      label: 'RETURN TRIP',
      color: 'bg-white text-slate-800',
    },
    {
      label: 'MIX BANPHO',
      color: 'bg-white text-slate-800',
    },
    {
      label: 'DIRECT',
      color: 'bg-white text-slate-800',
    },
  ];

  const ROW_GROUPS = [
    {
      groupName: 'M1',
      title: 'MOTOR OIL',
      docks: [
        {
          id: '1',
          mappedPoint: 'M1-1',
        },
        {
          id: '2',
          mappedPoint: 'M1-2',
        },
      ],
    },
    {
      groupName: 'L1',
      title: '(L1) LSP MON-FRI',
      docks: [
        {
          id: '1',
          mappedPoint: 'L1-1',
        },
        {
          id: '2',
          mappedPoint: 'L1-2',
        },
        {
          id: '3',
          mappedPoint: 'L1-3',
        },
      ],
    },
    {
      groupName: 'L2',
      title: '(L2) LSP MON-FRI',
      docks: [
        {
          id: '4',
          mappedPoint: 'L2-4',
        },
        {
          id: '5',
          mappedPoint: 'L2-5',
        },
        {
          id: '6',
          mappedPoint: 'L2-6',
        },
      ],
    },
    {
      groupName: 'R2',
      title: 'FREELOCATION2#Shutter 2',
      docks: [
        {
          id: '1',
          mappedPoint: 'R2-1',
        },
      ],
    },
    {
      groupName: 'R1',
      title: 'FREELOCATION#1',
      docks: [
        {
          id: '1',
          mappedPoint: 'R1-1',
        },
        {
          id: '2',
          mappedPoint: 'R1-2',
        },
      ],
    },
  ];

  /*
   * แปลงเวลา HH:mm เป็นจำนวนนาที
   * โดยเริ่มจาก START_HOUR
   */
  const parseTimeToMinutes = (
    timeStr: string | undefined
  ): number | null => {
    if (!timeStr) {
      return null;
    }

    const [hourString, minuteString] =
      timeStr.trim().split(':');

    const hour = Number(hourString);
    const minute = Number(minuteString);

    if (
      Number.isNaN(hour) ||
      Number.isNaN(minute)
    ) {
      return null;
    }

    return (
      (hour - START_HOUR) * 60 + minute
    );
  };

  /*
   * กำหนดสีของ Truck
   */
  const getTruckColor = (
    truck: Truck
  ): string => {
    /*
     * Complete + On Plan = เขียว
     * Complete + Delay = แดง
     * Complete + Early = น้ำเงิน
     */
    if (
      truck.status === 'COMPLETED' ||
      truck.status === 'TRUCK_OUT'
    ) {
      if (
        truck.performanceStatus === 'DELAY'
      ) {
        return 'bg-red-500 border-red-700 text-white';
      }

      if (
        truck.performanceStatus === 'EARLY'
      ) {
        return 'bg-blue-500 border-blue-700 text-white';
      }

      return 'bg-green-500 border-green-700 text-white';
    }

    /*
     * Unloading = เหลือง
     * Unloading + Delay = ส้ม
     */
    if (
      truck.status === 'DOCK_IN' ||
      truck.status === 'UNLOADING' ||
      truck.status ===
        'UNLOADING_AT_TPCAP'
    ) {
      if (
        truck.performanceStatus === 'DELAY'
      ) {
        return 'bg-orange-500 border-orange-700 text-white';
      }

      return 'bg-yellow-400 border-yellow-600 text-slate-900';
    }

    if (
      truck.performanceStatus === 'DELAY'
    ) {
      return 'bg-red-500 border-red-700 text-white';
    }

    return 'bg-slate-300 border-slate-500 text-slate-800';
  };

  /*
   * Normalize จุดลงงานเพื่อให้เทียบข้อความได้ง่าย
   */
  const normalizePoint = (
    point?: string
  ): string => {
    return (point || '')
      .replace(/\s+/g, '')
      .toUpperCase();
  };

  /*
   * สร้างรายการ Dock ที่ถูกกำหนดไว้แล้ว
   */
  const mappedDocks = new Set<string>();

  ROW_GROUPS.forEach(group => {
    group.docks.forEach(dock => {
      mappedDocks.add(
        normalizePoint(dock.mappedPoint)
      );
    });
  });

  /*
   * ค้นหาจุดลงงานที่ยังไม่ได้ Map
   */
  const unmappedPoints = [
    ...new Set(
      trucks
        .map(
          truck =>
            truck.dropPoint?.trim() ||
            'UNASSIGNED'
        )
        .filter(
          dropPoint =>
            !mappedDocks.has(
              normalizePoint(dropPoint)
            )
        )
    ),
  ];

  /*
   * เพิ่มกลุ่ม ETC หากมี Dock ที่ไม่ได้ Map
   */
  const dynamicGroups = [...ROW_GROUPS];

  if (unmappedPoints.length > 0) {
    dynamicGroups.push({
      groupName: 'ETC',
      title: 'UNMAPPED DOCKS',
      docks: unmappedPoints.map(
        dropPoint => ({
          id: '?',
          mappedPoint: dropPoint,
        })
      ),
    });
  }

  /*
   * สถิติด้านบน
   */
  const stats = useMemo(() => {
    return {
      total: trucks.length,

      unloading: trucks.filter(
        truck =>
          truck.status === 'UNLOADING' ||
          truck.status === 'DOCK_IN' ||
          truck.status ===
            'UNLOADING_AT_TPCAP'
      ).length,

      complete: trucks.filter(
        truck =>
          truck.status === 'COMPLETED' ||
          truck.status === 'TRUCK_OUT'
      ).length,

      remain: trucks.filter(
        truck =>
          ![
            'COMPLETED',
            'TRUCK_OUT',
          ].includes(truck.status)
      ).length,
    };
  }, [trucks]);

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-slate-100 text-xs">
      {/* Summary Cards */}
      <div className="w-full shrink-0 border-b border-slate-200 bg-white p-4">
        <div className="grid w-full grid-cols-2 gap-4 md:grid-cols-4">
          {/* Total */}
          <div className="flex h-14 min-w-0 flex-col justify-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="flex items-center gap-1.5 whitespace-nowrap text-[10px] font-bold uppercase text-slate-500">
              <TruckIcon className="h-3.5 w-3.5 shrink-0" />
              Total
            </p>

            <h3 className="mt-1 text-xl font-bold leading-none text-slate-800">
              {stats.total}
            </h3>
          </div>

          {/* Unloading */}
          <div className="flex h-14 min-w-0 flex-col justify-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="flex items-center gap-1.5 whitespace-nowrap text-[10px] font-bold uppercase text-slate-500">
              <Package className="h-3.5 w-3.5 shrink-0 text-yellow-500" />
              Unloading
            </p>

            <h3 className="mt-1 text-xl font-bold leading-none text-slate-800">
              {stats.unloading}
            </h3>
          </div>

          {/* Complete */}
          <div className="flex h-14 min-w-0 flex-col justify-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="flex items-center gap-1.5 whitespace-nowrap text-[10px] font-bold uppercase text-slate-500">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
              Complete
            </p>

            <h3 className="mt-1 text-xl font-bold leading-none text-slate-800">
              {stats.complete}
            </h3>
          </div>

          {/* Remain */}
          <div className="flex h-14 min-w-0 flex-col justify-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="flex items-center gap-1.5 whitespace-nowrap text-[10px] font-bold uppercase text-slate-500">
              <Clock className="h-3.5 w-3.5 shrink-0 text-blue-500" />
              Remain
            </p>

            <h3 className="mt-1 text-xl font-bold leading-none text-slate-800">
              {stats.remain}
            </h3>
          </div>
        </div>
      </div>

      {/* Diagram Scrollable Area */}
      <div
        className="relative min-*-0 min-w-0 flex-1 overflow-y-auto *verflow-x-scroll bg-slate-50"
        st*le={{
          width: '100%',
          maxWi*th: '100%',
        }}
      >
        <div
          clas*Name="flex shrink-0 flex-col bg-sl*te-50"
          style={{
            width: '*000px',
            minWidth: '6000px',
            maxWidth: 'none',
            flex:*'0 0 6000px',
          }}
        >
          
          {/* Platform Header */}
          <div className="sticky top-0 z-50 flex h-10 w-full shrink-0 items-center gap-2 border-b-2 border-slate-900 bg-slate-800 px-4">
            <div className="sticky left-4 z-[60] mr-auto whitespace-nowrap text-sm font-bold text-white">
              PLATFORM DIAGRAM
            </div>

            <div className="ml-auto flex items-center gap-2">
              {categories.map(
                (category, index) => (
                  <div
                    key={index}
                    className={`min-w-[120px] whitespace-nowrap border-2 border-black px-4 py-1 text-center text-[10px] font-bold ${category.color}`}
                  >
                    {category.label}
                  </div>
                )
              )}
            </div>
          </div>

          {/* Row Groups */}
          {dynamicGroups.map(group => {
            const groupMappedPoints =
              new Set(
                group.docks.map(dock =>
                  normalizePoint(
                    dock.mappedPoint
                  )
                )
              );

            const groupTrips =
              trucks.filter(truck =>
                groupMappedPoints.has(
                  normalizePoint(
                    truck.dropPoint
                  )
                )
              ).length;

            return (
              <div
                key={group.groupName}
                className="flex flex-col border-b-2 border-slate-900"
              >
                {/* Group Title Row */}
                {group.title && (
                  <div className="sticky left-0 z-30 flex w-full border-b border-slate-800 bg-slate-600">
                    <div className="sticky left-0 z-40 flex w-24 shrink-0 items-center whitespace-nowrap border-r-2 border-slate-800 bg-slate-600 px-2 py-1 text-[10px] font-bold tracking-widest text-white">
                      {group.title}
                    </div>

                    <div className="flex-1 py-1 text-center text-[10px] font-bold text-white">
                      {groupTrips} TRIPS
                    </div>
                  </div>
                )}

                {/* Group Docks Area */}
                <div className="flex">
                  {/* Left Group Name */}
                  <div className="sticky left-0 z-20 flex w-10 shrink-0 items-center justify-center border-r-2 border-slate-800 bg-slate-700 text-lg font-bold text-white shadow-[2px_0_5px_rgba(0,0,0,0.1)]">
                    {group.groupName}
                  </div>

                  {/* Docks List */}
                  <div className="flex flex-1 flex-col">
                    {group.docks.map(
                      (
                        dock,
                        dockIndex
                      ) => {
                        const dockTrucks =
                          trucks.filter(
                            truck =>
                              normalizePoint(
                                truck.dropPoint ||
                                  'UNASSIGNED'
                              ) ===
                              normalizePoint(
                                dock.mappedPoint
                              )
                          );

                        return (
                          <div
                            key={`${group.groupName}-${dock.id}-${dockIndex}`}
                            className="flex flex-col border-b-2 border-slate-900 bg-white last:border-b-0"
                          >
                            {/* Time Header */}
                            <div className="flex h-6 border-b border-slate-300 bg-slate-100">
                              {/* Time Min Sticky Box */}
                              <div className="sticky left-10 z-20 flex w-14 shrink-0 flex-col items-center justify-center border-r-2 border-slate-300 bg-slate-50 text-[7px] font-bold leading-[8px] text-slate-600 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                                <span>
                                  TIME
                                </span>
                                <span>
                                  (min)
                                </span>
                              </div>

                              {/* Timeline Hours */}
                              <div className="flex flex-1">
                                {HOURS.map(
                                  hour => (
                                    <div
                                      key={hour}
                                      className="flex flex-1 flex-col border-r border-slate-400"
                                    >
                                      <div className="border-b border-slate-300 bg-slate-200 text-center text-[9px] font-bold">
                                        {hour
                                          .toString()
                                          .padStart(
                                            2,
                                            '0'
                                          )}
                                        :00
                                      </div>

                                      <div className="flex h-3 text-[7px] font-medium text-slate-600">
                                        {MINUTES.map(
                                          minute => (
                                            <div
                                              key={
                                                minute
                                              }
                                              className="flex-1 border-r border-slate-300 text-center last:border-r-0"
                                            >
                                              {
                                                minute
                                              }
                                            </div>
                                          )
                                        )}
                                      </div>
                                    </div>
                                  )
                                )}
                              </div>

                              {/* Summary Header */}
                              <div className="sticky right-0 z-20 flex w-16 shrink-0 border-b border-l-2 border-slate-300 border-l-slate-400 bg-slate-200 shadow-[-2px_0_5px_rgba(0,0,0,0.05)]">
                                <div className="flex flex-1 items-center justify-center text-center text-[10px] font-bold">
                                  Total
                                </div>
                              </div>
                            </div>

                            {/* Dock and Trucks Row */}
                            <div className="flex h-24">
                              {/* Dock Number */}
                              <div className="sticky left-10 z-20 flex w-14 shrink-0 items-center justify-center border-r-2 border-slate-300 bg-white text-xl font-bold text-slate-800 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                                {dock.id}
                              </div>

                              {/* Timeline Trucks Grid */}
                              <div className="relative flex flex-1">
                                {HOURS.map(
                                  hour => (
                                    <div
                                      key={hour}
                                      className="flex flex-1 border-r border-slate-400"
                                    >
                                      {MINUTES.map(
                                        minute => (
                                          <div
                                            key={
                                              minute
                                            }
                                            className="flex-1 border-r border-slate-100 last:border-r-0"
                                          />
                                        )
                                      )}
                                    </div>
                                  )
                                )}

                                {/* Trucks */}
                                {dockTrucks.map(
                                  truck => {
                                    const etaToUse =
                                      truck.planEta ||
                                      truck.stampEta;

                                    const startMins =
                                      parseTimeToMinutes(
                                        etaToUse
                                      );

                                    if (
                                      startMins ===
                                      null
                                    ) {
                                      return null;
                                    }

                                    let durationMins =
                                      60;

                                    const etdToUse =
                                      truck.planEtd ||
                                      truck.stampEtd;

                                    if (
                                      etdToUse
                                    ) {
                                      const difference =
                                        calculateMinutesDifference(
                                          etaToUse ||
                                            '',
                                          etdToUse
                                        );

                                      if (
                                        difference !==
                                          null &&
                                        difference >
                                          0
                                      ) {
                                        durationMins =
                                          difference;
                                      }
                                    }

                                    const leftPercent =
                                      (startMins /
                                        TOTAL_MINS) *
                                      100;

                                    const widthPercent =
                                      (durationMins /
                                        TOTAL_MINS) *
                                      100;

                                    const left =
                                      Math.max(
                                        0,
                                        leftPercent
                                      );

                                    let width =
                                      widthPercent;

                                    if (
                                      leftPercent <
                                      0
                                    ) {
                                      width =
                                        widthPercent +
                                        leftPercent;
                                    }

                                    if (
                                      left +
                                        width >
                                      100
                                    ) {
                                      width =
                                        100 -
                                        left;
                                    }

                                    if (
                                      width <= 0
                                    ) {
                                      return null;
                                    }

                                    return (
                                      <motion.div
                                        initial={{
                                          opacity: 0,
                                          scaleY: 0,
                                        }}
                                        animate={{
                                          opacity: 1,
                                          scaleY: 1,
                                        }}
                                        key={
                                          truck.id
                                        }
                                        onClick={() =>
                                          setSelectedTruck(
                                            truck
                                          )
                                        }
                                        className={`absolute bottom-1 top-1 flex cursor-pointer flex-col items-center justify-center overflow-hidden border-2 p-1 text-center transition-shadow hover:z-10 hover:shadow-lg ${getTruckColor(
                                          truck
                                        )}`}
                                        style={{
                                          left: `${left}%`,
                                          width: `${width}%`,
                                        }}
                                        title={`${truck.licensePlate} (${truck.route})`}
                                      >
                                        <div className="w-full truncate text-[9px] font-bold leading-tight">
                                          {
                                            truck.route
                                          }
                                        </div>

                                        <div className="mt-0.5 w-full truncate text-[8px] font-bold leading-tight">
                                          {
                                            truck.licensePlate
                                          }
                                        </div>

                                        {truck.performanceStatus ===
                                          'DELAY' && (
                                          <AlertTriangle className="absolute right-1 top-1 h-3 w-3 text-white" />
                                        )}
                                      </motion.div>
                                    );
                                  }
                                )}
                              </div>

                              {/* Summary Body */}
                              <div className="sticky right-0 z-20 flex w-16 shrink-0 border-l-2 border-slate-400 bg-white shadow-[-2px_0_5px_rgba(0,0,0,0.05)]">
                                <div className="flex flex-1 items-center justify-center text-sm font-bold">
                                  {
                                    dockTrucks.length
                                  }
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      }
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Truck Details Modal */}
      <AnimatePresence>
        {selectedTruck && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <motion.div
              initial={{
                opacity: 0,
                scale: 0.95,
              }}
              animate={{
                opacity: 1,
                scale: 1,
              }}
              exit={{
                opacity: 0,
                scale: 0.95,
              }}
              className="w-full max-w-sm overflow-hidden rounded-xl bg-white shadow-2xl"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 p-4">
                <h3 className="text-sm font-bold text-slate-800">
                  Truck Details
                </h3>

                <button
                  type="button"
                  onClick={() =>
                    setSelectedTruck(null)
                  }
                  className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="space-y-4 p-4">
                <div>
                  <div className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                    License Plate
                  </div>

                  <div className="text-sm font-medium text-slate-800">
                    {
                      selectedTruck.licensePlate
                    }
                  </div>
                </div>

                <div>
                  <div className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                    Route
                  </div>

                  <div className="text-sm text-slate-700">
                    {selectedTruck.route}
                  </div>
                </div>

                <div>
                  <div className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                    Supplier
                  </div>

                  <div className="text-sm text-slate-700">
                    {
                      selectedTruck.supplierName
                    }
                  </div>
                </div>

                <div>
                  <div className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                    Drop Point
                  </div>

                  <div className="text-sm text-slate-700">
                    {selectedTruck.dropPoint ||
                      '-'}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                      Status
                    </div>

                    <div className="text-sm text-slate-700">
                      {
                        selectedTruck.status
                      }
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                      Performance
                    </div>

                    <div className="text-sm text-slate-700">
                      {
                        selectedTruck.performanceStatus
                      }
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                      Plan ETA
                    </div>

                    <div className="font-mono text-sm text-slate-700">
                      {selectedTruck.planEta ||
                        '-'}
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                      Plan ETD
                    </div>

                    <div className="font-mono text-sm text-slate-700">
                      {selectedTruck.planEtd ||
                        '-'}
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                      Actual ETA
                    </div>

                    <div className="font-mono text-sm text-slate-700">
                      {selectedTruck.stampEta ||
                        selectedTruck.actualEta ||
                        '-'}
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                      Actual ETD
                    </div>

                    <div className="font-mono text-sm text-slate-700">
                      {selectedTruck.stampEtd ||
                        '-'}
                    </div>
                  </div>
                </div>

                {selectedTruck.actionProblem && (
                  <div className="mt-4 rounded-lg border border-red-100 bg-red-50 p-3">
                    <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-red-700">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Action / Problem
                    </div>

                    <div className="whitespace-pre-wrap break-words text-sm text-red-800">
                      {
                        selectedTruck.actionProblem
                      }
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
