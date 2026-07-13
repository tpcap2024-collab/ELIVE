/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Truck, CheckCircle2, Navigation, MapPin, AlertCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { TruckData } from '../types';

interface KPICardsProps {
  trucks: TruckData[];
  onSelectStatusFilter: (status: string) => void;
  activeFilter: string;
}

export default function KPICards({ trucks, onSelectStatusFilter, activeFilter }: KPICardsProps) {
  const total = trucks.length;
  const delivered = trucks.filter(t => t.status === 'Delivered').length;
  const traveling = trucks.filter(t => t.status === 'Traveling').length;
  const atArea = trucks.filter(t => t.status === 'At_Area').length;
  const offline = trucks.filter(t => t.status === 'Offline').length;

  const pctDelivered = total ? Math.round((delivered / total) * 100) : 0;
  const pctTraveling = total ? Math.round((traveling / total) * 100) : 0;
  const pctAtArea = total ? Math.round((atArea / total) * 100) : 0;
  const pctOffline = total ? Math.round((offline / total) * 100) : 0;

  // Tiny custom sparkles lines
  const sparklineData = {
    total: [10, 10, 11, 10, 12, 10, 10],
    delivered: [3, 4, 4, 5, 5, 5, 6],
    traveling: [5, 4, 5, 4, 5, 4, 3],
    atArea: [1, 1, 2, 1, 2, 1, 1],
    offline: [1, 1, 0, 0, 0, 0, 0]
  };

  const renderSparkline = (points: number[], strokeColor: string) => {
    const width = 80;
    const height = 24;
    const max = Math.max(...points, 1);
    const min = Math.min(...points, 0);
    const range = max - min;
    const xStep = width / (points.length - 1);
    
    const svgPoints = points.map((p, i) => {
      const x = i * xStep;
      const y = height - ((p - min) / range) * (height - 4) - 2;
      return `${x},${y}`;
    }).join(' ');

    return (
      <svg className="w-20 h-6 overflow-visible" viewBox={`0 0 ${width} ${height}`}>
        <polyline
          fill="none"
          stroke={strokeColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={svgPoints}
        />
      </svg>
    );
  };

  const cards = [
    {
      id: 'All',
      title: 'จำนวนรถทั้งหมด',
      count: total,
      pct: '100%',
      icon: <Truck className="w-5 h-5 text-slate-700" />,
      colorClass: 'border-l-4 border-l-slate-400 bg-white hover:bg-slate-50',
      activeColorClass: 'ring-2 ring-slate-400 bg-slate-50/50',
      textColor: 'text-slate-600',
      trend: { text: '+2 คันเมื่อบ่ายนี้', isPositive: true },
      sparkPoints: sparklineData.total,
      sparkColor: '#64748b'
    },
    {
      id: 'Delivered',
      title: 'รถเข้าส่งงานแล้ว',
      count: delivered,
      pct: `${pctDelivered}%`,
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-600" />,
      colorClass: 'border-l-4 border-l-emerald-500 bg-white hover:bg-slate-50',
      activeColorClass: 'ring-2 ring-emerald-500 bg-emerald-50/50',
      textColor: 'text-emerald-600',
      trend: { text: 'ส่งงานตรงเวลา 95%', isPositive: true },
      sparkPoints: sparklineData.delivered,
      sparkColor: '#10b981'
    },
    {
      id: 'Traveling',
      title: 'รถกำลังเดินทาง',
      count: traveling,
      pct: `${pctTraveling}%`,
      icon: <Navigation className="w-5 h-5 text-amber-600" />,
      colorClass: 'border-l-4 border-l-amber-500 bg-white hover:bg-slate-50',
      activeColorClass: 'ring-2 ring-amber-500 bg-amber-50/50',
      textColor: 'text-amber-600',
      trend: { text: 'ความเร็วเฉลี่ย 72 กม/ชม', isPositive: true },
      sparkPoints: sparklineData.traveling,
      sparkColor: '#f59e0b'
    },
    {
      id: 'At_Area',
      title: 'อยู่ในพื้นที่ TPCAP/ลูกค้า',
      count: atArea,
      pct: `${pctAtArea}%`,
      icon: <MapPin className="w-5 h-5 text-blue-600" />,
      colorClass: 'border-l-4 border-l-blue-500 bg-white hover:bg-slate-50',
      activeColorClass: 'ring-2 ring-blue-500 bg-blue-50/50',
      textColor: 'text-blue-600',
      trend: { text: 'จอดเฉลี่ยต่ำกว่า 30 นาที', isPositive: true },
      sparkPoints: sparklineData.atArea,
      sparkColor: '#3b82f6'
    },
    {
      id: 'Offline',
      title: 'GPS Offline / ยังไม่เริ่ม',
      count: offline,
      pct: `${pctOffline}%`,
      icon: <AlertCircle className="w-5 h-5 text-rose-600" />,
      colorClass: 'border-l-4 border-l-rose-500 bg-white hover:bg-slate-50',
      activeColorClass: 'ring-2 ring-rose-500 bg-rose-50/50',
      textColor: 'text-rose-600',
      trend: { text: 'ลดลง 1 คันจากวานนี้', isPositive: true },
      sparkPoints: sparklineData.offline,
      sparkColor: '#ef4444'
    }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3" id="kpi-dashboard-grid">
      {cards.map((card) => {
        const isActive = activeFilter === card.id;
        return (
          <div
            key={card.id}
            onClick={() => onSelectStatusFilter(card.id)}
            className={`cursor-pointer rounded-lg p-3.5 transition-all duration-300 border border-slate-200 shadow-sm ${
              isActive ? card.activeColorClass : card.colorClass
            } flex flex-col justify-between h-22`}
            id={`kpi-card-${card.id}`}
          >
            {/* Top row */}
            <div className="flex items-start justify-between gap-2">
              <span className="text-slate-500 font-sans text-[11px] font-bold uppercase tracking-wider line-clamp-1">
                {card.title}
              </span>
              <div className="p-1 rounded bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                {card.icon}
              </div>
            </div>

            {/* Mid stats */}
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-2xl font-sans font-black tracking-tight text-slate-900">
                {card.count}
              </span>
              <div className="flex items-baseline gap-1">
                <span className={`text-xs font-mono font-bold ${card.textColor}`}>
                  {card.pct}
                </span>
                <span className="text-[9px] text-slate-400 font-mono">สัดส่วน</span>
              </div>
            </div>

            {/* Sparkline and Trend info */}
            <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                {card.trend.isPositive ? (
                  <TrendingUp className="w-3 h-3 text-emerald-500" />
                ) : (
                  <TrendingDown className="w-3 h-3 text-rose-500" />
                )}
                <span className="text-[10px] text-slate-400 font-sans line-clamp-1 leading-none">
                  {card.trend.text}
                </span>
              </div>
              <div className="opacity-80 hover:opacity-100 transition-opacity">
                {renderSparkline(card.sparkPoints, card.sparkColor)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
