export type TruckStatus = 
  | 'TRAVELING' 
  | 'UNLOADING_AT_TPCAP' 
  | 'WAITING_AREA' 
  | 'DOCK_IN' 
  | 'UNLOADING' 
  | 'COMPLETED' 
  | 'TRUCK_OUT';

export type PerformanceStatus = 'EARLY' | 'ON_PLAN' | 'DELAY' | 'WARNING';

export interface Truck {
  id: string;
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
  location?: { lat: number, lng: number };
  truckType?: string;
  stampEta?: string;
  stampEtd?: string;
  dockInTime?: string;
  actionProblem?: string;
  actionCountermeasure?: string;
  actionStatus?: string;
  actionResponsible?: string;
}

export type Priority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type IncidentType = 'DELAY' | 'GPS_OFFLINE' | 'WAITING_OVER_SLA' | 'DOCK_OVER_SLA' | 'GENERAL';
export type IncidentStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

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
