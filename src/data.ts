import { Truck, Incident } from './types';

export const mockTrucks: Truck[] = [
  { id: 'TRK-001', route: 'BKK-01', licensePlate: '71-1234 BKK', supplierName: 'Thai Union', driverName: 'Somchai S.', phone: '081-111-1111', status: 'TRAVELING', performanceStatus: 'ON_PLAN', planEta: '10:30', dropPoint: 'D-01', lastUpdated: '10:00', location: {lat: 13.75, lng: 100.5}, truckType: '10W' },
  { id: 'TRK-002', route: 'NPT-02', licensePlate: '72-5678 BKK', supplierName: 'Betagro', driverName: 'Somsak P.', phone: '081-222-2222', status: 'TRAVELING', performanceStatus: 'DELAY', planEta: '09:00', dropPoint: 'D-02', lastUpdated: '09:15', location: {lat: 13.8, lng: 100.4}, truckType: '6W' },
  { id: 'TRK-003', route: 'RYG-01', licensePlate: '80-9999 NPT', supplierName: 'CP Foods', driverName: 'Wichai T.', phone: '081-333-3333', status: 'TRAVELING', performanceStatus: 'WARNING', planEta: '08:30', dropPoint: 'D-03', lastUpdated: '09:30', location: {lat: 13.9, lng: 100.3}, truckType: 'Trailer' },
  { id: 'TRK-004', route: 'BKK-02', licensePlate: '81-4444 BKK', supplierName: 'Thai Union', driverName: 'Mana K.', phone: '081-444-4444', status: 'COMPLETED', performanceStatus: 'EARLY', planEta: '08:00', actualEta: '07:50', stampEta: '07:50', stampEtd: '09:00', dropPoint: 'D-01', lastUpdated: '09:45', location: {lat: 13.7, lng: 100.6}, truckType: '4W' },
  { id: 'TRK-005', route: 'SP-01', licensePlate: '70-5555 BKK', supplierName: 'Supplier A', driverName: 'Piti W.', phone: '081-555-5555', status: 'COMPLETED', performanceStatus: 'ON_PLAN', planEta: '07:00', actualEta: '06:55', stampEta: '06:55', stampEtd: '08:30', dropPoint: 'D-04', lastUpdated: '10:00', location: {lat: 13.6, lng: 100.7}, truckType: '10W' },
  { id: 'TRK-006', route: 'CBI-01', licensePlate: '66-8888 SP', supplierName: 'Farm Fresh', driverName: 'Anek C.', phone: '081-666-6666', status: 'TRAVELING', performanceStatus: 'DELAY', planEta: '09:30', dropPoint: 'D-02', lastUpdated: '09:30', location: {lat: 13.5, lng: 100.8}, truckType: '6W' },
  { id: 'TRK-007', route: 'CBI-02', licensePlate: '89-1122 BKK', supplierName: 'Thai Union', driverName: 'Chatchai M.', phone: '081-777-7777', status: 'TRAVELING', performanceStatus: 'ON_PLAN', planEta: '11:15', dropPoint: 'D-05', lastUpdated: '11:00', location: {lat: 13.6, lng: 100.6}, truckType: '10W' },
  { id: 'TRK-008', route: 'AYT-01', licensePlate: '90-2233 AYT', supplierName: 'CP Foods', driverName: 'Surachai N.', phone: '081-888-8888', status: 'TRAVELING', performanceStatus: 'ON_PLAN', planEta: '13:00', dropPoint: 'D-06', lastUpdated: '12:00', location: {lat: 14.1, lng: 100.5}, truckType: 'Trailer' },
  { id: 'TRK-009', route: 'NPT-03', licensePlate: '88-4455 NPT', supplierName: 'Betagro', driverName: 'Wirat J.', phone: '081-999-9999', status: 'TRAVELING', performanceStatus: 'WARNING', planEta: '14:30', dropPoint: 'D-07', lastUpdated: '14:00', location: {lat: 13.7, lng: 100.2}, truckType: '6W' },
  { id: 'TRK-010', route: 'RYG-02', licensePlate: '70-9988 RYG', supplierName: 'Supplier A', driverName: 'Kittisak V.', phone: '082-000-0000', status: 'TRAVELING', performanceStatus: 'DELAY', planEta: '15:45', dropPoint: 'D-08', lastUpdated: '15:00', location: {lat: 12.7, lng: 101.2}, truckType: '10W' },
  { id: 'TRK-011', route: 'BKK-03', licensePlate: '71-3344 BKK', supplierName: 'Farm Fresh', driverName: 'Anuson S.', phone: '082-111-1111', status: 'COMPLETED', performanceStatus: 'ON_PLAN', planEta: '06:15', actualEta: '06:10', stampEta: '06:10', stampEtd: '07:15', dropPoint: 'D-05', lastUpdated: '08:00', location: {lat: 13.8, lng: 100.5}, truckType: '4W' },
];

export const mockIncidents: Incident[] = [
  {
    id: 'INC-1001',
    truckId: 'TRK-002',
    route: 'NPT-02',
    licensePlate: '72-5678 BKK',
    type: 'DELAY',
    priority: 'HIGH',
    status: 'OPEN',
    description: 'Truck is delayed by 45 minutes due to heavy traffic on route NPT-02. Needs immediate follow-up to adjust dock schedule.',
    createdAt: '09:30',
    updatedAt: '09:30',
    remarks: []
  },
  {
    id: 'INC-1002',
    truckId: 'TRK-006',
    route: 'CBI-01',
    licensePlate: '66-8888 SP',
    type: 'GPS_OFFLINE',
    priority: 'CRITICAL',
    status: 'IN_PROGRESS',
    description: 'GPS signal lost for the last 30 minutes. Last known location was near Chonburi.',
    createdAt: '09:00',
    updatedAt: '09:45',
    owner: 'Operations Team',
    remarks: [
      { id: 'RM-1', text: 'Tried calling driver, no response yet.', author: 'Admin', timestamp: '09:15' },
      { id: 'RM-2', text: 'Contacted supplier. They are checking with the driver.', author: 'Operations Team', timestamp: '09:40' }
    ]
  },
  {
    id: 'INC-1003',
    truckId: 'TRK-003',
    route: 'RYG-01',
    licensePlate: '80-9999 NPT',
    type: 'DOCK_OVER_SLA',
    priority: 'MEDIUM',
    status: 'OPEN',
    description: 'Truck has been unloading for 1 hour 15 minutes. SLA is 1 hour.',
    createdAt: '10:00',
    updatedAt: '10:00',
    remarks: []
  }
];

