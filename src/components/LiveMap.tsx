import React from 'react';
import { Truck } from '../types';
import { Search, Wrench } from 'lucide-react';

interface LiveMapProps {
  trucks: Truck[];
}

export function LiveMap({ trucks }: LiveMapProps) {
  return (
    <div className="h-full flex flex-col p-4 md:p-6 lg:p-8">
      <div className="bg-white p-4 rounded-t-xl border-t border-l border-r border-slate-200 shadow-sm flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-2">
          <h2 className="font-bold tracking-tight text-slate-800">Live GPS Tracking</h2>
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
        </div>
      </div>
      
      <div className="flex-1 rounded-b-xl border border-slate-200 shadow-sm overflow-hidden relative flex items-center justify-center bg-slate-100" style={{
        backgroundImage: `url("https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&q=80&w=1600")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}>
        <div className="absolute inset-0 bg-white/60 backdrop-blur-sm"></div>
        
        <div className="relative z-10 flex flex-col items-center justify-center p-8 bg-white/90 rounded-2xl shadow-xl border border-slate-200 max-w-sm text-center">
          <div className="w-20 h-20 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-6 shadow-inner">
            <Wrench className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">กำลังพัฒนา</h2>
          <p className="text-slate-500">Live Map is currently under construction and will be available soon.</p>
        </div>
      </div>
    </div>
  );
}
