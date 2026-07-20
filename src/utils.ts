import { TruckStatus, PerformanceStatus } from './types';
import { Truck, MapPin, Clock, ArrowRightSquare, PackageOpen, CheckCircle, LogOut } from 'lucide-react';

export const getStatusConfig = (status: TruckStatus) => {
  switch (status) {
    case 'TRAVELING':
      return { label: 'On the way', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: MapPin };
    case 'UNLOADING_AT_TPCAP':
      return { label: 'Unloading at TPCAP', color: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: Clock };
    case 'WAITING_AREA':
      return { label: 'Waiting Area', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: Clock };
    case 'DOCK_IN':
      return { label: 'Dock In', color: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: ArrowRightSquare };
    case 'UNLOADING':
      return { label: 'Unloading', color: 'bg-purple-100 text-purple-700 border-purple-200', icon: PackageOpen };
    case 'COMPLETED':
      return { label: 'Completed', color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle };
    case 'TRUCK_OUT':
      return { label: 'Truck Out', color: 'bg-slate-100 text-slate-700 border-slate-200', icon: LogOut };
    default:
      return { label: 'Unknown', color: 'bg-gray-100 text-gray-700 border-gray-200', icon: Truck };
  }
};

export const calculateMinutesDifference = (start: string, end: string) => {
  if (!start || !end) return null;
  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  return (endH * 60 + endM) - (startH * 60 + startM);
};

export const calculatePerformanceStatus = (plan: string, actual: string): PerformanceStatus => {
  const diff = calculateMinutesDifference(plan, actual);
  if (diff === null) return 'ON_PLAN';
  if (diff > 0) return 'DELAY';
  if (diff < 0) return 'EARLY';
  return 'ON_PLAN';
};

export const formatDuration = (minutes: number | null) => {
  if (minutes === null) return '-';
  if (minutes < 0) return '0m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};
