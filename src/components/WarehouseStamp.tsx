import React, { useState } from 'react';
import { Truck } from '../types';
import { Clock, PlayCircle, CheckCircle2, ArrowRightSquare } from 'lucide-react';
import { calculateMinutesDifference, calculatePerformanceStatus } from '../utils';
import { StatusBadge } from './StatusBadge';

interface WarehouseStampProps {
  trucks: Truck[];
  onUpdateTruck: (id: string, updates: Partial<Truck>) => void;
}

export function WarehouseStamp({ trucks, onUpdateTruck }: WarehouseStampProps) {
  const [showCompleted, setShowCompleted] = useState(false);
  const [filterPlatform, setFilterPlatform] = useState<string>('ALL');

  const getPlatformGroup = (dropPoint?: string) => {
    if (!dropPoint) return '';
    const match = dropPoint.trim().match(/^[a-zA-Z]+\d*/);
    return match ? match[0].toUpperCase() : dropPoint.trim().toUpperCase();
  };

  const uniquePlatforms = Array.from(new Set(trucks.map(t => getPlatformGroup(t.dropPoint)).filter(Boolean))) as string[];
  uniquePlatforms.sort();

  // Only show trucks that are relevant for stamping
  const activeTrucks = trucks.filter(t => {
    const isCompleted = t.status === 'COMPLETED' || t.status === 'TRUCK_OUT' || (t.stampEta && t.stampEtd);
    if (!showCompleted && isCompleted) return false;
    if (filterPlatform !== 'ALL' && getPlatformGroup(t.dropPoint) !== filterPlatform) return false;

    return true;
  });

  const getCurrentTimeStr = () => {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  };

  const handleStampEta = (truck: Truck) => {
    const time = getCurrentTimeStr();
    const performanceStatus = calculatePerformanceStatus(truck.planEta, time);
    onUpdateTruck(truck.id, { stampEta: time, status: 'UNLOADING_AT_TPCAP', performanceStatus });
  };

  const handleStampEtd = (truck: Truck) => {
    onUpdateTruck(truck.id, { stampEtd: getCurrentTimeStr(), status: 'COMPLETED' });
  };

  return (
    <div className="h-full flex flex-col p-4 md:p-6 lg:p-8 bg-slate-50">
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm mb-6 shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-800">Stamp ETA / ETD</h2>
          <p className="text-slate-500 text-sm mt-1">Warehouse Staff Action Dashboard</p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <select
            value={filterPlatform}
            onChange={(e) => setFilterPlatform(e.target.value)}
            className="text-sm font-medium text-slate-600 bg-white border border-slate-200 px-3 py-2.5 rounded-lg shadow-sm hover:bg-slate-50 transition-colors focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            <option value="ALL">All Platforms</option>
            {uniquePlatforms.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-600 bg-white border border-slate-200 px-3 py-2.5 rounded-lg shadow-sm hover:bg-slate-50 transition-colors">
            <input 
              type="checkbox" 
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
            />
            Show Stamped Routes
          </label>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-white rounded-xl border border-slate-200 shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-bold sticky top-0 z-10">
              <th className="p-4">Plan ETA</th>
              <th className="p-4">Route</th>
              <th className="p-4">Platform</th>
              <th className="p-4">Truck type</th>
              <th className="p-4">Status</th>
              <th className="p-4">Stamp ETA</th>
              <th className="p-4">Stamp ETD</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {activeTrucks.map(truck => {
              const etaDiff = calculateMinutesDifference(truck.planEta, truck.stampEta || truck.actualEta || '');
              let etaStatusColor = 'text-slate-500';
              if (etaDiff !== null) {
                if (etaDiff < -5) etaStatusColor = 'text-blue-600';
                else if (etaDiff > 15) etaStatusColor = 'text-red-600';
                else etaStatusColor = 'text-emerald-600';
              }

              return (
                <tr key={truck.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="p-4 font-mono font-bold text-slate-800">{truck.planEta}</td>
                  <td className="p-4">
                    <div className="font-bold text-slate-900">{truck.route}</div>
                    <div className="text-xs text-slate-500">{truck.licensePlate}</div>
                  </td>
                  <td className="p-4 font-bold text-slate-700">{truck.dropPoint}</td>
                  <td className="p-4 text-slate-600">{truck.truckType || 'Unknown'}</td>
                  <td className="p-4"><StatusBadge status={truck.status} /></td>
                  <td className="p-4">
                    {truck.stampEta || truck.actualEta ? (
                      <span className={`font-mono font-bold ${etaStatusColor}`}>
                        {truck.stampEta || truck.actualEta}
                      </span>
                    ) : (
                      <button
                        onClick={() => handleStampEta(truck)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white hover:bg-blue-700 text-xs font-bold rounded-lg transition-colors active:scale-95"
                      >
                        Stamp ETA
                      </button>
                    )}
                  </td>
                  <td className="p-4">
                    {truck.stampEtd ? (
                      <span className="font-mono font-bold text-slate-700">
                        {truck.stampEtd}
                      </span>
                    ) : (
                      <button
                        onClick={() => handleStampEtd(truck)}
                        disabled={!truck.stampEta && !truck.actualEta}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed text-xs font-bold rounded-lg transition-colors active:scale-95"
                      >
                        Stamp ETD
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            
            {activeTrucks.length === 0 && (
              <tr>
                <td colSpan={6} className="p-12 text-center text-slate-500">
                  <CheckCircle2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-base font-medium">No pending actions</p>
                  <p className="text-xs">All active trucks have been processed</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
