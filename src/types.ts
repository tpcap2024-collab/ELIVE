export type TruckStatus =
  | 'TRAVELING'
  | 'UNLOADING_AT_TPCAP'
  | 'WAITING_AREA'
  | 'DOCK_IN'
  | 'UNLOADING'
  | 'COMPLETED'
  | 'TRUCK_OUT';

export type PerformanceStatus =
  | 'EARLY'
  | 'ON_PLAN'
  | 'DELAY'
  | 'WARNING';

/**
 * ข้อมูลตำแหน่งล่าสุดจากชีท API GPS
 *
 * 0 GPS ID
 * 1 ทะเบียนรถ
 * 2 ละติจูด
 * 3 ลองจิจูด
 * 4 ความเร็ว
 * 5 ทิศทาง
 * 6 ชื่อสถานที่
 * 7 เวลา GPS
 * 8 สถานะ
 * 9 เวลาที่ระบบดึงข้อมูล
 */
export interface GpsLocation {
  gpsId: string;
  licensePlate: string;

  latitude: number;
  longitude: number;

  speed: number;
  heading: number;

  locationName: string;
  gpsTime: string;
  gpsStatus: string;
  receivedAt: string;
}

export interface Truck {
  id: string;

  /**
   * GPS ID ของอุปกรณ์ติดรถ
   * ใช้จับคู่กับข้อมูลจากชีท API GPS
   */
  gpsId?: string;

  /**
   * ข้อมูล GPS ล่าสุดที่จับคู่กับรถได้
   */
  gpsLocation?: GpsLocation;

  planDate?: string;
  route: string;
  licensePlate: string;
  supplierName: string;
  driverName: string;
  phone: string;

  status: TruckStatus;
  performanceStatus: PerformanceStatus;

  planEta: string;
  planEtd?: string;
  actualEta?: string;

  dropPoint: string;
  lastUpdated: string;

  /**
   * เก็บไว้เพื่อรองรับ Component เดิม
   */
  location?: {
    lat: number;
    lng: number;
  };

  truckType?: string;

  stampEta?: string;
  stampEtd?: string;
  dockInTime?: string;

  actionProblem?: string;
  actionCountermeasure?: string;
  actionStatus?: string;
  actionResponsible?: string;
}

export type Priority =
  | 'CRITICAL'
  | 'HIGH'
  | 'MEDIUM'
  | 'LOW';

export type IncidentType =
  | 'DELAY'
  | 'GPS_OFFLINE'
  | 'WAITING_OVER_SLA'
  | 'DOCK_OVER_SLA'
  | 'GENERAL';

export type IncidentStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'RESOLVED'
  | 'CLOSED';

export interface IncidentRemark {
  id: string;
  text: string;
  author: string;
  timestamp: string;
}

export interface Incident {
  id: string;
  truckId: string;
  route: string;
  licensePlate: string;

  type: IncidentType;
  priority: Priority;
  status: IncidentStatus;

  description: string;
  createdAt: string;
  updatedAt: string;

  owner?: string;
  remarks: IncidentRemark[];
}
