import React, { useState, useMemo } from 'react';
import { Truck } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { MapPin, AlertTriangle, X, Package, CheckCircle2, Clock, Truck as TruckIcon } from 'lucide-react';

import { calculateMinutesDifference } from '../utils';

interface PlatformDiagramProps {
  trucks: Truck[];
}

export function PlatformDiagram({ trucks }: PlatformDiagramProps) {
  const [selectedTruck, setSelectedTruck] = useState<Truck | null>(null);

  // Hours from 06:00 to 18:00
  const START_HOUR = 6;
  const END_HOUR = 18;
  const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);
  const MINUTES = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];

  const TOTAL_MINS = (END_HOUR - START_HOUR + 1) * 60;

  const categories = [
    { label: 'INTERPLANT', color: 'bg-white text-slate-800' },
    { label: 'MILK RUN', color: 'bg-white text-slate-800' },
    { label: 'BODY PARTS', color: 'bg-slate-200 text-slate-800' },
    { label: 'RETURN TRIP', color: 'bg-white text-slate-800' },
    { label: 'MIX BANPHO', color: 'bg-white text-slate-800' },
    { label: 'DIRECT', color: 'bg-white text-slate-800' },
  ];

  const ROW_GROUPS = [
    {
      groupName: 'M1',
      title: 'MOTOR OIL',
      docks: [
        { id: '1', mappedPoint: 'M1-1' },
        { id: '2', mappedPoint: 'M1-2' },
      ]
    },
    {
      groupName: 'L1',
      title: '(L1) LSP MON-FRI',
      docks: [
        { id: '1', mappedPoint: 'L1-1' },
        { id: '2', mappedPoint: 'L1-2' },
        { id: '3', mappedPoint: 'L1-3' },
      ]
    },
    {
      groupName: 'L2',
      title: '(L2) LSP MON-FRI',
      docks: [
        { id: '4', mappedPoint: 'L2-4' },
        { id: '5', mappedPoint: 'L2-5' },
        { id: '6', mappedPoint: 'L2-6' },
      ]
    },
    {
      groupName: 'R2',
      title: 'FREELOCATION2#Shutter 2',
      docks: [
        { id: '1', mappedPoint: 'R2-1' },
      ]
    },
    {
      groupName: 'R1',
      title: 'FREELOCATION#1',
      docks: [
        { id: '1', mappedPoint: 'R1-1' },
        { id: '2', mappedPoint: 'R1-2' },
      ]
    }
  ];

  // Helper to parse HH:mm to minutes from start
  const parseTimeToMinutes = (timeStr: string | undefined) => {
    if (!timeStr) return null;
    const [hStr, mStr] = timeStr.trim().split(':');
    const h = Number(hStr);
    const m = Number(mStr);
    if (isNaN(h) || isNaN(m)) return null;
    return (h - START_HOUR) * 60 + m;
  };

  const getTruckColor = (truck: Truck) => {
    // complete +onplan = สีเขียว
    // complete +Delay = สีแดง
    // Complete+Early = น้ำเงิน
    if (truck.status === 'COMPLETED' || truck.status === 'TRUCK_OUT') {
      if (truck.performanceStatus === 'DELAY') return 'bg-red-500 border-red-700 text-white';
      if (truck.performanceStatus === 'EARLY') return 'bg-blue-500 border-blue-700 text-white';
      return 'bg-green-500 border-green-700 text-white'; // default ON_PLAN
    }
    
    // กำลังลงงาน / Unloading at TPCAP = สีเหลือง, กำลังลงงานและดีเลย์ด้วย = สีส้ม
    if (truck.status === 'DOCK_IN' || truck.status === 'UNLOADING' || truck.status === 'UNLOADING_AT_TPCAP') {
      if (truck.performanceStatus === 'DELAY') return 'bg-orange-500 border-orange-700 text-white';
      return 'bg-yellow-400 border-yellow-600 text-slate-900';
    }

    if (truck.performanceStatus === 'DELAY') return 'bg-red-500 border-red-700 text-white';
    return 'bg-slate-300 border-slate-500 text-slate-800'; // Initial grey box
  };

  const normalizePoint = (p?: string) => (p || '').replace(/\s+/g, '').toUpperCase();
  
  // Dynamically find unmapped docks
  const mappedDocks = new Set();
  ROW_GROUPS.forEach(g => g.docks.forEach(d => mappedDocks.add(normalizePoint(d.mappedPoint))));
  
  const unmappedPoints = [...new Set(
    trucks
      .map(t => t.dropPoint?.trim() || 'UNASSIGNED')
      .filter(dp => !mappedDocks.has(normalizePoint(dp)))
  )];
  
  const dynamicGroups = [...ROW_GROUPS];
  if (unmappedPoints.length > 0) {
    dynamicGroups.push({
      groupName: 'ETC',
      title: 'UNMAPPED DOCKS',
      docks: unmappedPoints.map((dp, i) => ({ id: `?`, mappedPoint: dp }))
    });
  }

  const stats = useMemo(() => {
    return {
      total: trucks.length,
      unloading: trucks.filter(t => t.status === 'UNLOADING' || t.status === 'DOCK_IN' || t.status === 'UNLOADING_AT_TPCAP').length,
      complete: trucks.filter(t => t.status === 'COMPLETED').length,
      remain: trucks.filter(t => !['COMPLETED', 'TRUCK_OUT'].includes(t.status)).length
    };
  }, [trucks]);

  return (
    <div className="h-full min-h-0 min-w-0 flex flex-col bg-slate-100 overflow-hidden text-xs relative">

            {/* Summary Cards - Fixed width and always visible */}
      <div className="w-full shrink-0 bg-white border-b border-slate-200 p-4">
        <div className="grid w-full grid-cols-2 gap-4 md:grid-cols-4">
          {/* Total */}
          <div className="min-w-0 h-14 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 flex flex-col justify-center">
            <p className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1.5 whitespace-nowrap">
              <TruckIcon className="w-3.5 h-3.5 shrink-0" />
              Total
            </p>

            <h3 className="text-xl leading-none mt-1 font-bold text-slate-800">
              {stats.total}
            </h3>
          </div>

          {/* Unloading */}
          <div className="min-w-0 h-14 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 flex flex-col justify-center">
            <p className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1.5 whitespace-nowrap">
              <Package className="w-3.5 h-3.5 shrink-0 text-yellow-500" />
              Unloading
            </p>

            <h3 className="text-xl leading-none mt-1 font-bold text-slate-800">
              {stats.unloading}
            </h3>
          </div>
  
          {/* Complete */}
          <div className="min-w-0 h-14 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 flex flex-col justify-center">
            <p className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1.5 whitespace-nowrap">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-green-500" />
              Complete
            </p>

            <h3 className="text-xl leading-none mt-1 font-bold text-slate-800">
              {stats.complete}
            </h3>
          </div>

          {/* Remain */}
          <div className="min-w-0 h-14 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 flex flex-col justify-center">
            <p className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1.5 whitespace-nowrap">
              <Clock className="w-3.5 h-3.5 shrink-0 text-blue-500" />
              Remain
            </p>

            <h3 className="text-xl leading-none mt-1 font-bold text-slate-800">
              {stats.remain}
            </h3>
          </div>
        </div>
      </div>
      

      {/* Diagram Scrollable Area */}
      <div className="flex-1 min-h-0 *in-w-0 overflow-auto bg-slate-50 relative">
        <div className="flex flex-col w-[6000px] min-w-[6000px] bg-slate-50">

          {/* Platform Header - Scrolls horizontally with timeline */}
          <div className="sticky top-0 z-50 w-full h-10 bg-slate-800 px-4 flex items-center gap-2 border-b-2 border-slate-900 shrink-0">
            <div className="sticky left-4 z-[60] font-bold text-white text-sm whitespace-nowrap mr-auto">
              PLATFORM DIAGRAM
            </div>

            <div className="ml-auto flex items-center gap-2">
              {categories.map((cat, i) => (
                <div
                  key={i}
                  className={`min-w-[120px] px-4 py-1 text-center text-[10px] font-bold whitespace-nowrap border-2 border-black ${cat.color}`}
                >
                  {cat.label}
                </div>
              ))}
            </div>
          </div>

          {dynamicGroups.map((group, groupIdx) => (
      
       
          
          {dynamicGroups.map((group, groupIdx) => (
            <div key={group.groupName} className="flex flex-col border-b-2 border-slate-900">
              
              {/* Group Title Row */}
              {group.title && (
                <div className="flex bg-slate-600 border-b border-slate-800 sticky left-0 z-30 w-full">
                  <div className="sticky left-0 z-40 bg-slate-600 text-white font-bold px-2 py-1 text-[10px] tracking-widest whitespace-nowrap w-24 border-r-2 border-slate-800 flex items-center shrink-0">
                    {group.title}
                  </div>
                  <div className="flex-1 text-center text-white text-[10px] py-1 font-bold">
                    {trucks.filter(t => ROW_GROUPS.find(g => g.groupName === group.groupName)?.docks.some(d => normalizePoint(d.mappedPoint) === normalizePoint(t.dropPoint))).length} TRIPS
                  </div>
                </div>
              )}
              
              {/* Group Docks Area */}
              <div className="flex">
                {/* Leftmost Group Name - Sticky */}
                <div className="sticky left-0 z-20 w-10 shrink-0 flex items-center justify-center bg-slate-700 text-white font-bold text-lg border-r-2 border-slate-800 shadow-[2px_0_5px_rgba(0,0,0,0.1)]">
                  {group.groupName}
                </div>

                {/* Docks List */}
                <div className="flex flex-col flex-1">
                  {group.docks.map((dock) => (
                    <div key={dock.id} className="flex flex-col border-b-2 border-slate-900 last:border-b-0 bg-white">
                      
                      {/* TIME Header Row for this dock */}
                      <div className="flex h-6 bg-slate-100 border-b border-slate-300">
                        {/* TIME (min) Box - Sticky */}
                        <div className="sticky left-10 z-20 w-14 shrink-0 flex flex-col items-center justify-center text-[7px] font-bold border-r-2 border-slate-300 bg-slate-50 leading-[8px] text-slate-600 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                          <span>TIME</span>
                          <span>(min)</span>
                        </div>
                        
                        {/* Timeline Hours/Mins */}
                        <div className="flex flex-1">
                          {HOURS.map((hour) => (
                            <div key={hour} className="flex flex-col flex-1 border-r border-slate-400">
                              <div className="text-[9px] font-bold text-center border-b border-slate-300 bg-slate-200">
                                {hour.toString().padStart(2, '0')}:00
                              </div>
                              <div className="flex h-3 text-[7px] text-slate-600 font-medium">
                                {MINUTES.map((min) => (
                                  <div key={min} className="flex-1 text-center border-r border-slate-300 last:border-r-0">
                                    {min}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                        
                        {/* Summary Header - Sticky Right */}
                        <div className="flex w-16 shrink-0 border-l-2 border-slate-400 bg-slate-200 sticky right-0 z-20 shadow-[-2px_0_5px_rgba(0,0,0,0.05)] border-b border-slate-300">
                          <div className="flex-1 flex items-center justify-center text-[10px] font-bold text-center">
                            Total
                          </div>
                        </div>
                      </div>

                      {/* Dock & Trucks Row */}
                      <div className="flex h-24">
                        {/* Dock Number Box - Sticky */}
                        <div className="sticky left-10 z-20 w-14 shrink-0 flex items-center justify-center font-bold text-slate-800 text-xl border-r-2 border-slate-300 bg-white shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                          {dock.id}
                        </div>

                        {/* Timeline Trucks Grid */}
                        <div className="flex-1 relative flex">
                          {HOURS.map((hour) => (
                            <div key={hour} className="flex flex-1 border-r border-slate-400">
                              {MINUTES.map((min) => (
                                <div key={min} className="flex-1 border-r border-slate-100 last:border-r-0"></div>
                              ))}
                            </div>
                          ))}
                          
                          {/* Render Trucks for this dock */}
                          {trucks.filter(t => normalizePoint(t.dropPoint || 'UNASSIGNED') === normalizePoint(dock.mappedPoint)).map(truck => {
                            const etaToUse = truck.planEta || truck.stampEta;
                            const startMins = parseTimeToMinutes(etaToUse);
                            if (startMins === null) return null;
                            
                            let durationMins = 60;
                            const etdToUse = truck.planEtd || truck.stampEtd;
                            if (etdToUse) {
                              const diff = calculateMinutesDifference(etaToUse || '', etdToUse);
                              if (diff !== null && diff > 0) {
                                durationMins = diff;
                              }
                            }
                            
                            const leftPercent = (startMins / TOTAL_MINS) * 100;
                            const widthPercent = (durationMins / TOTAL_MINS) * 100;
                            
                            const left = Math.max(0, leftPercent);
                            
                            // Adjust width if it was clamped
                            let width = widthPercent;
                            if (leftPercent < 0) {
                                width = widthPercent + leftPercent; // leftPercent is negative
                            }
                            // Don't let it overflow the right side
                            if (left + width > 100) {
                                width = 100 - left;
                            }
                            
                            // If width is <= 0 after clamping, it means it's entirely outside the visible range.
                            if (width <= 0) return null;
                            
                            return (
                              <motion.div
                                initial={{ opacity: 0, scaleY: 0 }}
                                animate={{ opacity: 1, scaleY: 1 }}
                                key={truck.id}
                                onClick={() => setSelectedTruck(truck)}
                                className={`absolute top-1 bottom-1 border-2 p-1 overflow-hidden hover:z-10 hover:shadow-lg transition-shadow cursor-pointer flex flex-col justify-center items-center text-center ${getTruckColor(truck)}`}
                                style={{ 
                                  left: `${left}%`, 
                                  width: `${width}%`
                                }}
                                title={`${truck.licensePlate} (${truck.route})`}
                              >
                                <div className="font-bold text-[9px] leading-tight w-full truncate">{truck.route}</div>
                                <div className="font-bold text-[8px] leading-tight w-full truncate mt-0.5">{truck.licensePlate}</div>
                                {truck.performanceStatus === 'DELAY' && (
                                  <AlertTriangle className="w-3 h-3 text-white absolute top-1 right-1" />
                                )}
                              </motion.div>
                            );
                          })}
                        </div>

                        {/* Summary Body - Sticky Right */}
                        <div className="flex w-16 shrink-0 border-l-2 border-slate-400 bg-white sticky right-0 z-20 shadow-[-2px_0_5px_rgba(0,0,0,0.05)]">
                          <div className="flex-1 flex items-center justify-center font-bold text-sm">
                            {trucks.filter(t => normalizePoint(t.dropPoint || 'UNASSIGNED') === normalizePoint(dock.mappedPoint)).length}
                          </div>
                        </div>
                      </div>

                    </div>
                  ))}
                </div>
              </div>
              
            </div>
          ))}
          
        </div>
      </div>

      {/* Truck Details Modal */}
      <AnimatePresence>
        {selectedTruck && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden"
            >
              <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50">
                <h3 className="font-bold text-slate-800 text-sm">Truck Details</h3>
                <button 
                  onClick={() => setSelectedTruck(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <div className="text-xs text-slate-500 font-bold mb-1 uppercase tracking-wider">License Plate</div>
                  <div className="text-sm font-medium text-slate-800">{selectedTruck.licensePlate}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 font-bold mb-1 uppercase tracking-wider">Route</div>
                  <div className="text-sm text-slate-700">{selectedTruck.route}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 font-bold mb-1 uppercase tracking-wider">Supplier</div>
                  <div className="text-sm text-slate-700">{selectedTruck.supplierName}</div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-slate-500 font-bold mb-1 uppercase tracking-wider">Status</div>
                    <div className="text-sm text-slate-700">{selectedTruck.status}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 font-bold mb-1 uppercase tracking-wider">Performance</div>
                    <div className="text-sm text-slate-700">{selectedTruck.performanceStatus}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 font-bold mb-1 uppercase tracking-wider">Plan ETA</div>
                    <div className="text-sm font-mono text-slate-700">{selectedTruck.planEta || '-'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 font-bold mb-1 uppercase tracking-wider">Actual ETA</div>
                    <div className="text-sm font-mono text-slate-700">{selectedTruck.stampEta || selectedTruck.actualEta || '-'}</div>
                  </div>
                </div>
                
                {selectedTruck.actionProblem && (
                  <div className="bg-red-50 border border-red-100 rounded-lg p-3 mt-4">
                    <div className="flex items-center gap-2 text-red-700 text-xs font-bold mb-1 uppercase tracking-wider">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Action / Problem
                    </div>
                    <div className="text-sm text-red-800 break-words whitespace-pre-wrap">
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
  );
}


