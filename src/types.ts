/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type TruckStatus = 'Delivered' | 'Traveling' | 'At_Area' | 'Offline';

export interface RouteTimelinePoint {
  id: string;
  time: string;
  title: string;
  description: string;
  status: 'completed' | 'current' | 'pending';
}

export interface TruckData {
  id: string;
  plateNo: string;       // ทะเบียนรถ
  route: string;         // เส้นทาง
  logisticsCo: string;   // บริษัทขนส่ง
  driverName: string;    // ชื่อคนขับ
  driverPhone: string;   // เบอร์โทรศัพท์
  etaTpcap: string;      // ETA TPCAP
  etdTpcap: string;      // ETD TPCAP
  currentLocation: string; // ตำแหน่งปัจจุบัน (ข้อความ)
  speed: number;         // ความเร็ว (km/h)
  distanceToTpcap: number; // ระยะห่างจาก TPCAP (km)
  status: TruckStatus;   // สถานะ
  lastGpsUpdate: string; // เวลาอัปเดต GPS ล่าสุด
  // Map positioning (0 to 100 % for relative grid positions or coordinates)
  coordinateX: number; 
  coordinateY: number;
  lat?: number;
  lng?: number;
  routePoints: { x: number; y: number }[]; // Coordinates along route for animation
  currentRouteIndex: number;
  timeline: RouteTimelinePoint[];
}

export interface SheetConfig {
  spreadsheetId: string;
  sheetName: string;
  apiKey: string;
  useMockSimulator: boolean;
}

export interface DashboardFilters {
  searchQuery: string;
  status: TruckStatus | 'All';
  route: string | 'All';
  logisticsCo: string | 'All';
}

export interface SheetTestResult {
  success: boolean;
  error?: string;
  isHtml?: boolean;
  rawTextPreview?: string;
}

export interface DailyPlanItem {
  plateNo: string;
  plannedRoute: string;
  plannedDriverName: string;
  plannedDriverPhone: string;
  driverDay?: string;
  driverNight?: string;
  telDriverDay?: string;
  telDriverNight?: string;
}

