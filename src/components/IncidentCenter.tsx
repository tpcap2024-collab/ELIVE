import React, { useState } from 'react';
import { Truck } from '../types';
import { AlertTriangle, MapPin, Truck as TruckIcon, User, MessageSquare, CheckCircle2, Filter, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface IncidentCenterProps {
  trucks: Truck[];
  onUpdateTruck: (id: string, updates: Partial<Truck>) => void;
}

export function IncidentCenter({ trucks, onUpdateTruck }: IncidentCenterProps) {
  const actionTrucks = trucks.filter(t => t.actionProblem);
  const [selectedTruck, setSelectedTruck] = useState<Truck | null>(null);
  const [newRemark, setNewRemark] = useState('');

  const statusColors: Record<string, string> = {
    OPEN: 'bg-red-100 text-red-800 border-red-200',
    IN_PROGRESS: 'bg-blue-100 text-blue-800 border-blue-200',
    RESOLVED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    CLOSED: 'bg-slate-200 text-slate-500 border-slate-300'
  };

  const handleUpdateStatus = (newStatus: string) => {
    if (!selectedTruck) return;
    onUpdateTruck(selectedTruck.id, { actionStatus: newStatus });
    setSelectedTruck({ ...selectedTruck, actionStatus: newStatus });
  };

  const handleAssignOwner = (owner: string) => {
    if (!selectedTruck) return;
    onUpdateTruck(selectedTruck.id, { actionResponsible: owner });
    setSelectedTruck({ ...selectedTruck, actionResponsible: owner });
  };

  const handleUpdateCountermeasure = (countermeasure: string) => {
    if (!selectedTruck) return;
    onUpdateTruck(selectedTruck.id, { actionCountermeasure: countermeasure });
    setSelectedTruck({ ...selectedTruck, actionCountermeasure: countermeasure });
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 relative overflow-hidden">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-red-500" />
            Action Center
          </h2>
          <p className="text-sm text-slate-500 mt-1">Manage and track abnormal activities and follow-ups.</p>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className={`flex flex-col border-r border-slate-200 bg-white transition-all duration-300 ${selectedTruck ? 'w-1/3' : 'w-full'}`}>
          <div className="flex-1 overflow-y-auto">
            {selectedTruck ? (
              <div className="p-4 space-y-3">
                {actionTrucks.map(truck => (
                  <motion.div
                    layoutId={`card-${truck.id}`}
                    key={truck.id}
                    onClick={() => setSelectedTruck(truck)}
                    className={`p-4 rounded-xl border cursor-pointer transition-all ${selectedTruck?.id === truck.id ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'}`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs font-bold text-slate-500 font-mono">{truck.route}</span>
                      <div className="flex gap-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${statusColors[truck.actionStatus || 'OPEN']}`}>
                          {truck.actionStatus || 'OPEN'}
                        </span>
                      </div>
                    </div>
                    
                    <h3 className="font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                      {truck.dropPoint}
                    </h3>
                    
                    <p className="text-sm text-slate-600 line-clamp-2 mb-3"><span className="font-semibold text-red-600">Problem:</span> {truck.actionProblem}</p>
                    
                    <div className="flex items-center justify-between border-t border-slate-100 pt-3 mt-3">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <TruckIcon className="w-3.5 h-3.5" />
                        <span className="font-medium text-slate-700">{truck.licensePlate}</span>
                      </div>
                      <span className="text-xs text-slate-400">{truck.actionResponsible || 'Unassigned'}</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider font-bold sticky top-0 z-10 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Route</th>
                    <th className="px-4 py-3">จุดลงงาน</th>
                    <th className="px-4 py-3">Problem</th>
                    <th className="px-4 py-3">Countermeasure</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">ผู้รับผิดชอบ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {actionTrucks.map(truck => (
                    <tr 
                      key={truck.id} 
                      onClick={() => setSelectedTruck(truck)}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-4 font-mono text-xs font-bold text-slate-500">{truck.route}</td>
                      <td className="px-4 py-4 font-bold text-slate-800">{truck.dropPoint}</td>
                      <td className="px-4 py-4 text-slate-600 max-w-xs truncate font-medium text-red-600">{truck.actionProblem}</td>
                      <td className="px-4 py-4 text-slate-600 max-w-xs truncate">{truck.actionCountermeasure || '-'}</td>
                      <td className="px-4 py-4">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider inline-block ${statusColors[truck.actionStatus || 'OPEN']}`}>
                          {truck.actionStatus || 'OPEN'}
                        </span>
                      </td>
                      <td className="px-4 py-4 font-medium text-slate-700">{truck.actionResponsible || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            
            {actionTrucks.length === 0 && (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-lg font-bold text-slate-700 mb-1">No Actions Required</h3>
                <p className="text-slate-500 text-sm">Everything is running smoothly right now.</p>
              </div>
            )}
          </div>
        </div>

        <AnimatePresence>
          {selectedTruck && (
            <motion.div
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-2/3 bg-white flex flex-col shadow-[-10px_0_30px_rgba(0,0,0,0.05)] z-20 relative"
            >
              <div className="h-14 border-b border-slate-200 flex items-center justify-between px-4 shrink-0 bg-white">
                <div className="flex gap-2">
                  {(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as string[]).map(status => (
                    <button
                      key={status}
                      onClick={() => handleUpdateStatus(status)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-md uppercase tracking-wider transition-all border ${
                        (selectedTruck.actionStatus || 'OPEN') === status 
                          ? statusColors[status]
                          : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {status.replace('_', ' ')}
                    </button>
                  ))}
                </div>
                <button 
                  onClick={() => setSelectedTruck(null)}
                  className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                <div className="p-8 max-w-3xl mx-auto space-y-8">
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <span className="font-mono text-sm font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded">{selectedTruck.route}</span>
                      <span className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                        <MapPin className="w-4 h-4 text-slate-400" /> {selectedTruck.dropPoint}
                      </span>
                    </div>
                    <h2 className="text-2xl font-bold text-slate-800">Action Follow-up</h2>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <TruckIcon className="w-3.5 h-3.5" /> Truck & Driver
                      </div>
                      <div className="font-medium text-slate-800">{selectedTruck.licensePlate}</div>
                      <div className="text-sm text-slate-600 mt-0.5">{selectedTruck.supplierName} • {selectedTruck.driverName}</div>
                    </div>
                    
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5" /> ผู้รับผิดชอบ
                      </div>
                      <div className="flex items-center gap-2">
                        <select 
                          value={selectedTruck.actionResponsible || ''}
                          onChange={(e) => handleAssignOwner(e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded-md py-1.5 px-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                          <option value="">Unassigned</option>
                          <option value="Operations Team">Operations Team</option>
                          <option value="Dispatch">Dispatch</option>
                          <option value="Warehouse Manager">Warehouse Manager</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-slate-400" />
                      Problem (ปัญหา)
                    </h3>
                    <div className="bg-red-50 text-red-800 p-4 rounded-xl border border-red-100 leading-relaxed text-sm">
                      {selectedTruck.actionProblem}
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-slate-400" />
                      Countermeasure (วิธีแก้ไข)
                    </h3>
                    <textarea 
                      value={selectedTruck.actionCountermeasure || ''}
                      onChange={(e) => handleUpdateCountermeasure(e.target.value)}
                      placeholder="ระบุวิธีแก้ไข / แนวทางการดำเนินการ..."
                      className="w-full bg-white border border-slate-300 rounded-xl p-4 text-sm focus:ring-2 focus:ring-blue-500 outline-none min-h-[120px]"
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
