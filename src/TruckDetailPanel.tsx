/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { X, User, Phone, MapPin, Route, Navigation, Shield } from 'lucide-react';
import { TruckData, TruckStatus } from '../types';

interface TruckDetailPanelProps {
  truck: TruckData | null;
  onClose: () => void;
  onUpdateTruckTelemetry: (truckId: string, updates: Partial<TruckData>) => void;
}

export default function TruckDetailPanel({ truck, onClose, onUpdateTruckTelemetry }: TruckDetailPanelProps) {

  if (!truck) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-slate-500 h-full flex flex-col items-center justify-center min-h-[300px]" id="truck-detail-empty-view">
        <Navigation className="w-12 h-12 text-slate-400 mb-3 animate-bounce" style={{ animationDuration: '4s' }} />
        <p className="font-sans font-bold text-slate-800">ควบคุมและเลือกดูข้อมูลรถบรรทุก</p>
        <p className="text-[11px] text-slate-400 mt-1 max-w-[220px]">
          กรุณาคลิกเลือกแถวรถบรรทุกในตาราง หรือคลิกหมุดในแผนที่เพื่อเข้าควบคุม สั่งการ และแสดงประวัติการเดินทางย้อนหลัง
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col h-full" id={`truck-detail-${truck.id}`}>
      {/* Panel header banner */}
      <div className="p-3 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-[#1e3a8a]" />
          <div className="flex flex-col">
            <span className="font-extrabold text-slate-800 text-xs font-sans tracking-wide">
              แผงควบคุมรถ {truck.plateNo.split(' ')[0]}
            </span>
            <span className="text-[9.5px] text-slate-400 font-mono font-bold">ID: {truck.id}</span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 bg-white border border-slate-300 hover:bg-slate-50 hover:text-slate-800 rounded transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Panel Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-4 custom-scrollbar">
        {/* Profile Card Summary */}
        <div className="bg-slate-50 rounded-lg p-3.5 border border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 font-mono tracking-wider">
              {truck.logisticsCo}
            </span>
            <span className="text-[10px] text-slate-500 font-mono font-bold">{truck.etaTpcap ? `ETA TPCAP: ${truck.etaTpcap}` : ''}</span>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 border border-slate-300">
              <User className="w-4.5 h-4.5" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 font-bold uppercase">ชื่อคนขับรถ</span>
              <span className="text-xs font-bold text-slate-900">{truck.driverName}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 font-bold uppercase">เบอร์ติดต่อหลัก</span>
              <a href={`tel:${truck.driverPhone}`} className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1 mt-0.5">
                <Phone className="w-3 h-3 text-blue-500" />
                {truck.driverPhone}
              </a>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 font-bold uppercase">ประเภทใบสั่งงาน</span>
              <span className="text-xs font-bold text-slate-700 truncate mt-0.5" title={truck.route}>
                {truck.route.split(' ')[0]}
              </span>
            </div>
          </div>
        </div>

        {/* Real-time Telemetries Indicators */}
        <div className="space-y-2.5">
          <h3 className="text-[10px] font-sans font-bold text-slate-400 flex items-center gap-1 uppercase tracking-wide">
            <Navigation className="w-3.5 h-3.5 text-blue-600" />
            ข้อมูล GPS แบบ Real-Time
          </h3>

          <div className="grid grid-cols-2 gap-2.5">
            {/* Speed card gauge */}
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 flex flex-col justify-between h-[84px]">
              <span className="text-[9.5px] text-slate-400 font-bold uppercase">ความเร็วความถี่หลัก</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className={`text-2xl font-mono font-extrabold ${truck.speed > 80 ? 'text-rose-600 font-black' : 'text-slate-800'}`}>
                  {truck.speed}
                </span>
                <span className="text-[9.5px] text-slate-400 font-mono">km/h</span>
              </div>
              {/* mini visual speed line */}
              <div className="w-full bg-slate-200 h-1 rounded-full mt-2 overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${truck.speed > 80 ? 'bg-rose-500' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.min((truck.speed / 100) * 100, 100)}%` }}
                ></div>
              </div>
            </div>

            {/* Distance to HQ TPCAP */}
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 flex flex-col justify-between h-[84px]">
              <span className="text-[9.5px] text-slate-400 font-bold uppercase">ระยะห่างจาก TPCAP</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-mono font-extrabold text-slate-800">
                  {truck.distanceToTpcap.toFixed(1)}
                </span>
                <span className="text-[9.5px] text-slate-400 font-mono">km</span>
              </div>
              {/* mini visual distance line */}
              <div className="w-full bg-slate-200 h-1 rounded-full mt-2 overflow-hidden">
                <div 
                  className="h-full bg-blue-600 rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(100 - (truck.distanceToTpcap / 120) * 100, 5)}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* Current Location text */}
          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 space-y-1">
            <span className="text-[9.5px] text-slate-400 font-bold uppercase block">พิกัด GPS อัปเดตล่าสุด:</span>
            <div className="flex items-start gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-800 leading-relaxed">
                  {truck.currentLocation}
                </span>
                <span className="text-[9.5px] text-slate-400 font-mono font-bold mt-0.5">
                  เวลาจับสัญญาณ: {truck.lastGpsUpdate}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* History Timeline Activity Logs */}
        <div className="space-y-3">
          <h3 className="text-[10px] font-sans font-bold text-slate-400 flex items-center gap-1 uppercase tracking-wide">
            <Route className="w-3.5 h-3.5 text-[#1e3a8a]" />
            ประวัติเดินทางย้อนหลัง (Timeline)
          </h3>

          <div className="relative border-l-2 border-slate-200 pl-4 ml-2 space-y-3">
            {truck.timeline.map((point) => (
              <div key={point.id} className="relative group/timeline">
                {/* Timeline node circle */}
                <span className={`absolute -left-[23px] top-1 w-3 h-3 rounded-full border-2 border-white flex items-center justify-center ${
                  point.status === 'completed'
                    ? 'bg-emerald-500'
                    : point.status === 'current'
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-slate-300'
                }`}></span>

                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                      {point.time}
                    </span>
                    <span className="font-bold text-xs text-slate-800">
                      {point.title}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 mt-0.5 leading-relaxed font-semibold">
                    {point.description}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
