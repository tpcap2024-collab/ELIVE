/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Truck, RefreshCw, Layers, Database, AlertCircle, Play, Pause } from 'lucide-react';

interface HeaderProps {
  lastUpdated: string;
  onOpenSheetConfig: () => void;
  isSheetConnected: boolean;
  onManualRefresh: () => void;
}

export default function Header({
  lastUpdated,
  onOpenSheetConfig,
  isSheetConnected,
  onManualRefresh,
}: HeaderProps) {
  const [currentTime, setCurrentTime] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('th-TH', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }) + ' | ' + now.toLocaleDateString('th-TH', {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="bg-[#1e3a8a] text-white flex flex-col md:flex-row md:items-center justify-between px-6 py-3.5 md:h-16 shrink-0 shadow-lg sticky top-0 z-40" id="elive-header">
      {/* Brand Logo & Title */}
      <div className="flex items-center gap-4">
        <div className="bg-white text-[#1e3a8a] font-black text-2xl px-3 py-1 rounded italic select-none shadow-sm">
          ELIVE
        </div>
        <div className="h-8 w-px bg-blue-700/50 hidden md:block"></div>
        <div>
          <h1 className="text-sm md:text-base font-bold leading-none tracking-tight uppercase text-white">
            Real-Time Truck Status Monitoring
          </h1>
          <p className="text-[10px] text-blue-200 uppercase tracking-widest mt-1">
            Logistics Control Tower System
          </p>
        </div>
      </div>

      {/* Control Tools & Timing */}
      <div className="flex flex-wrap items-center gap-3 md:gap-6 mt-3 md:mt-0">
        {/* Connection status */}
        <div className="flex items-center gap-4 bg-blue-950/40 px-3.5 py-1.5 rounded border border-blue-700/30 text-[11px] font-mono">
          <div className="flex flex-col">
            <span className="text-blue-200 text-[9px] uppercase font-semibold">Live Time</span>
            <span className="text-emerald-300 font-bold">{currentTime}</span>
          </div>
          <div className="h-6 w-[1px] bg-blue-700/40"></div>
          <div className="flex flex-col">
            <span className="text-blue-200 text-[9px] uppercase font-semibold">Last GPS Sync</span>
            <span className="text-blue-100 flex items-center gap-1 font-bold">
              {lastUpdated}
              <button 
                onClick={onManualRefresh}
                title="คลิกเพื่อดึงพิกัดล่าสุด" 
                className="hover:text-emerald-300 transition-colors cursor-pointer ml-1 p-0.5"
              >
                <RefreshCw className="w-2.5 h-2.5" />
              </button>
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Google Sheets Config Button */}
          <button
            onClick={onOpenSheetConfig}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold tracking-wide transition-all cursor-pointer border ${
              isSheetConnected
                ? 'bg-emerald-600 border-transparent text-white'
                : 'bg-blue-800/80 text-white border-blue-700 hover:bg-blue-800'
            }`}
            id="sheet-config-btn"
          >
            <Database className="w-3 h-3" />
            <span>Google Sheet</span>
            <span className={`w-1.5 h-1.5 rounded-full ${isSheetConnected ? 'bg-emerald-300 animate-pulse' : 'bg-blue-400'}`}></span>
          </button>
        </div>
      </div>
    </header>
  );
}
