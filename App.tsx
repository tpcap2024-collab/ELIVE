/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import KPICards from './components/KPICards';
import InteractiveMap from './components/InteractiveMap';
import TruckTable from './components/TruckTable';
import TruckDetailPanel from './components/TruckDetailPanel';
import SheetConfigModal from './components/SheetConfigModal';
import { parseSheetCSV, fetchAndMergeSheets, extractSpreadsheetId } from './lib/sheetParser';
import { INITIAL_TRUCKS } from './data/mockData';
import { TruckData, SheetConfig, DashboardFilters, TruckStatus, SheetTestResult, DailyPlanItem } from './types';
import { Radio, AlertTriangle, ShieldAlert, CheckCircle2, CloudLightning, HelpCircle, LayoutDashboard, Map, History, BarChart2, Calendar, Search, ArrowRight, Clock, MapPin, Activity, Menu, ChevronLeft, ChevronRight, FileSpreadsheet, Database, RefreshCw } from 'lucide-react';
import DailyPlanManager from './components/DailyPlanManager';

// Historical Trips mock database
const HISTORICAL_TRIPS = [
  {
    id: 'HIST-001',
    date: '10 ก.ค. 2026',
    time: '01:15 - 05:45',
    plateNo: '70-4581 ชลบุรี',
    route: 'TPCAP - แหลมฉบัง (Chonburi)',
    driverName: 'นายสมชาย ดีใจ',
    logisticsCo: 'TPCAP Logistics',
    duration: '4 ชม. 30 นาที',
    distance: '135 กม.',
    avgSpeed: '68 km/h',
    status: 'Delivered',
    statusText: 'ส่งมอบสำเร็จ (ตรงเวลา)',
    statusColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  {
    id: 'HIST-002',
    date: '09 ก.ค. 2026',
    time: '20:30 - 23:15',
    plateNo: '71-9014 กรุงเทพฯ',
    route: 'TPCAP - อมตะซิตี้ (Chonburi)',
    driverName: 'นายวิชัย รักสงบ',
    logisticsCo: 'Siam Express',
    duration: '2 ชม. 45 นาที',
    distance: '82 กม.',
    avgSpeed: '72 km/h',
    status: 'Delivered',
    statusText: 'ส่งมอบสำเร็จ (ตรงเวลา)',
    statusColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  {
    id: 'HIST-003',
    date: '09 ก.ค. 2026',
    time: '18:15 - 22:45',
    plateNo: '72-3345 ระยอง',
    route: 'TPCAP - มาบตาพุด (Rayong)',
    driverName: 'นายประสิทธิ์ มั่นคง',
    logisticsCo: 'Rayong Logistics',
    duration: '4 ชม. 30 นาที',
    distance: '154 กม.',
    avgSpeed: '65 km/h',
    status: 'Delivered',
    statusText: 'ส่งมอบสำเร็จ (ล่าช้า 15 นาที)',
    statusColor: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  {
    id: 'HIST-004',
    date: '09 ก.ค. 2026',
    time: '14:00 - 16:30',
    plateNo: '73-1122 ชลบุรี',
    route: 'TPCAP - บ่อวิน (Chonburi)',
    driverName: 'นายสมบัติ รักดี',
    logisticsCo: 'Siam Express',
    duration: '2 ชม. 30 นาที',
    distance: '95 กม.',
    avgSpeed: '70 km/h',
    status: 'Delivered',
    statusText: 'ส่งมอบสำเร็จ (ตรงเวลา)',
    statusColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  {
    id: 'HIST-005',
    date: '08 ก.ค. 2026',
    time: '10:00 - 15:15',
    plateNo: '70-5544 ฉะเชิงเทรา',
    route: 'TPCAP - นิคมเวลโกรว์ (Chachoengsao)',
    driverName: 'นายมานะ เจริญผล',
    logisticsCo: 'TPCAP Logistics',
    duration: '5 ชม. 15 นาที',
    distance: '45 กม.',
    avgSpeed: '55 km/h',
    status: 'Delivered',
    statusText: 'ส่งมอบสำเร็จ (ตรงเวลา)',
    statusColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  }
];

export default function App() {
  const [trucks, setTrucks] = useState<TruckData[]>(INITIAL_TRUCKS);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'live' | 'plan' | 'history'>('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [dailyPlan, setDailyPlan] = useState<DailyPlanItem[]>([
    {
      plateNo: '70-4581 ชลบุรี',
      plannedRoute: 'TPCAP - แหลมฉบัง (Chonburi)',
      plannedDriverName: 'นายสมชาย ดีใจ (กลางวัน) / นายสมเกียรติ มุ่งมั่น (กลางคืน)',
      plannedDriverPhone: '081-234-5678 (กลางวัน) / 089-111-2222 (กลางคืน)',
      driverDay: 'นายสมชาย ดีใจ',
      telDriverDay: '081-234-5678',
      driverNight: 'นายสมเกียรติ มุ่งมั่น',
      telDriverNight: '089-111-2222',
    },
    {
      plateNo: '71-9014 กรุงเทพฯ',
      plannedRoute: 'TPCAP - อมตะซิตี้ (Chonburi)',
      plannedDriverName: 'นายวิชัย รักสงบ (กลางวัน) / นายชลทิศ พัฒนา (กลางคืน)',
      plannedDriverPhone: '089-876-5432 (กลางวัน) / 082-555-6666 (กลางคืน)',
      driverDay: 'นายวิชัย รักสงบ',
      telDriverDay: '089-876-5432',
      driverNight: 'นายชลทิศ พัฒนา',
      telDriverNight: '082-555-6666',
    },
    {
      plateNo: '72-2241 ระยอง',
      plannedRoute: 'TPCAP - มาบตาพุด (Rayong)',
      plannedDriverName: 'นายประสิทธิ์ มั่นคง (กลางวัน) / นายศักดา ยิ่งยืน (กลางคืน)',
      plannedDriverPhone: '082-345-6789 (กลางวัน) / 083-999-8888 (กลางคืน)',
      driverDay: 'นายประสิทธิ์ มั่นคง',
      telDriverDay: '082-345-6789',
      driverNight: 'นายศักดา ยิ่งยืน',
      telDriverNight: '083-999-8888',
    },
    {
      plateNo: '70-9875 อยุธยา',
      plannedRoute: 'โรจนะ (Ayutthaya) - TPCAP',
      plannedDriverName: 'นายสุรศักดิ์ ใจกว้าง (กลางวัน) / นายวิษณุ เก่งกาจ (กลางคืน)',
      plannedDriverPhone: '085-456-7890 (กลางวัน) / 084-222-3333 (กลางคืน)',
      driverDay: 'นายสุรศักดิ์ ใจกว้าง',
      telDriverDay: '085-456-7890',
      driverNight: 'นายวิษณุ เก่งกาจ',
      telDriverNight: '084-222-3333',
    },
    {
      plateNo: '10-3342 สมุทรปราการ',
      plannedRoute: 'TPCAP - บางนา (Bangna)',
      plannedDriverName: 'นายอภิชาติ นามมั่น (กลางวัน) / นายเกริกเดช รักชาติ (กลางคืน)',
      plannedDriverPhone: '083-789-0123 (กลางวัน) / 085-777-8888 (กลางคืน)',
      driverDay: 'นายอภิชาติ นามมั่น',
      telDriverDay: '083-789-0123',
      driverNight: 'นายเกริกเดช รักชาติ',
      telDriverNight: '085-777-8888',
    }
  ]);

  const handleSyncPlanToTrucks = () => {
    setTrucks(prev =>
      prev.map(truck => {
        const planItem = dailyPlan.find(p => p.plateNo.replace(/\s+/g, '') === truck.plateNo.replace(/\s+/g, ''));
        if (planItem) {
          return {
            ...truck,
            route: planItem.plannedRoute,
            driverName: planItem.plannedDriverName,
            driverPhone: planItem.plannedDriverPhone,
          };
        }
        return truck;
      })
    );
  };

  const userEmail = "tpcap2024@gmail.com";
  const [selectedTruckId, setSelectedTruckId] = useState<string | null>('TRK-001'); // Default select first truck
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [isSheetConfigOpen, setIsSheetConfigOpen] = useState<boolean>(false);
  const [isSheetConnected, setIsSheetConnected] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<string>('ยังไม่ได้เชื่อมต่อ Google Sheet 🔌');
  const [systemLogs, setSystemLogs] = useState<string[]>([
    'ELIVE Control Tower: ระบบควบคุมพร้อมทำงาน กรุณาเชื่อมโยง Google Sheet ด้านบนเพื่อดึงแผนงานจริง',
    'GPS API Link: สแตนด์บายรอรับพิกัดจาก Google Sheet แผ่นงาน API GPS',
  ]);

  const [sheetConfig, setSheetConfig] = useState<SheetConfig>({
    spreadsheetId: '',
    sheetName: 'Sheet1',
    apiKey: '',
    useMockSimulator: false,
  });

  const [filters, setFilters] = useState<DashboardFilters>({
    searchQuery: '',
    status: 'All',
    route: 'All',
    logisticsCo: 'All',
  });

  // System Logs generator helper
  const addLog = useCallback((msg: string) => {
    const timeStr = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setSystemLogs(prev => [`[${timeStr}] ${msg}`, ...prev.slice(0, 8)]);
  }, []);

  // Selected Truck helper
  const selectedTruck = trucks.find(t => t.id === selectedTruckId) || null;

  const handleSelectTruck = (truck: TruckData) => {
    setSelectedTruckId(truck.id);
  };

  // Live GPS Simulator Interval
  useEffect(() => {
    if (!isSimulating) return;

    const interval = setInterval(() => {
      setTrucks(prevTrucks => {
        return prevTrucks.map(truck => {
          // Only simulate traveling or newly reconnected trucks
          if (truck.status === 'Traveling') {
            const nextIndex = truck.currentRouteIndex + 1;
            
            // If truck completed its journey
            if (nextIndex >= truck.routePoints.length) {
              const arrivedAtTpcap = truck.route.endsWith('TPCAP');
              const finalStatus: TruckStatus = arrivedAtTpcap ? 'At_Area' : 'Delivered';
              
              addLog(`🚛 ทะเบียน ${truck.plateNo} เดินทางถึงปลายทาง (${truck.route.split(' - ')[1] || 'ลานจอด'}) เรียบร้อยแล้ว`);
              
              const completedTimeline = [
                {
                  id: `time-finish-${Date.now()}`,
                  time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
                  title: arrivedAtTpcap ? 'เข้าเขต TPCAP (Geofence)' : 'ส่งสินค้าให้คู่ค้าเรียบร้อย (POD)',
                  description: arrivedAtTpcap ? 'จอดรอช่องรับสินค้าด่วน คลัง 3' : 'ระบบบันทึกภาพถ่ายตู้เสร็จสมบูรณ์',
                  status: 'completed' as const
                },
                ...truck.timeline
              ];

              return {
                ...truck,
                status: finalStatus,
                speed: 0,
                distanceToTpcap: arrivedAtTpcap ? 0 : truck.distanceToTpcap,
                currentLocation: arrivedAtTpcap ? 'ภายในคลังรับวัตถุดิบ TPCAP' : 'คลังคู่ค้าปลายทาง (ภารกิจสำเร็จ)',
                currentRouteIndex: nextIndex,
                lastGpsUpdate: 'พึ่งอัปเดต (GPS จำลอง)',
                timeline: completedTimeline
              };
            }

            // Normal movement stage
            const nextPt = truck.routePoints[nextIndex];
            const originalDist = truck.distanceToTpcap;
            const newDist = Math.max(originalDist - (originalDist / (truck.routePoints.length - truck.currentRouteIndex)), 0.5);
            const deltaSpeed = Math.floor(Math.random() * 15) - 7; // -7 to 7 km/h change
            const newSpeed = Math.max(Math.min(truck.speed + deltaSpeed, 90), 55); // clamp speed

            // Status triggers based on distance
            let currentStatus = truck.status;
            let locationText = truck.currentLocation;

            if (newDist <= 2) {
              currentStatus = 'At_Area';
              locationText = 'เข้าสู่ขอบเขตรัศมี Geofence 2 กม.';
              addLog(`🔵 รถ ${truck.plateNo} เข้าเขตรัศมี Geofence คลังสินค้าปลายทาง`);
            } else {
              // Update generic location based on route point
              const routeWords = truck.route.replace('TPCAP - ', '').split(' ');
              locationText = `ทางหลวงมุ่งสู่ ${routeWords[0] || 'ปลายทาง'} (ความเร็วเดินทางสม่ำเสมอ)`;
            }

            return {
              ...truck,
              coordinateX: nextPt.x,
              coordinateY: nextPt.y,
              currentRouteIndex: nextIndex,
              speed: newSpeed,
              distanceToTpcap: newDist,
              status: currentStatus,
              currentLocation: locationText,
              lastGpsUpdate: 'พึ่งอัปเดต (GPS จำลอง)'
            };
          }

          // Randomly reconnect the offline truck TRK-005 to demonstrate active resolution
          if (truck.id === 'TRK-005' && truck.status === 'Offline' && Math.random() < 0.15) {
            addLog(`🟢 สัญญาณ GPS รถ ${truck.plateNo} กลับมาเชื่อมต่อได้สำเร็จแล้ว`);
            return {
              ...truck,
              status: 'Traveling',
              speed: 55,
              currentLocation: 'ถนนกิ่งแก้ว มุ่งหน้าจุดหมาย',
              lastGpsUpdate: 'พึ่งอัปเดต (กู้คืนสัญญาณ)',
              timeline: [
                {
                  id: `recon-${Date.now()}`,
                  time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
                  title: 'กู้คืนสัญญาณ GPS สำเร็จ',
                  description: 'คนขับแจ้งแก้ไขขั้วไฟต่อตรงเสร็จสิ้น สัญญาณกลับมาส่งปกติ',
                  status: 'completed' as const
                },
                ...truck.timeline
              ]
            };
          }

          return truck;
        });
      });
      
      const nowStr = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' (จำลอง)';
      setLastUpdated(nowStr);
    }, 4500);

    return () => clearInterval(interval);
  }, [isSimulating, addLog]);

  // Handle manual/telemetry update for selected truck inside details panel
  const handleUpdateTruckTelemetry = (truckId: string, updates: Partial<TruckData>) => {
    setTrucks(prev =>
      prev.map(t => {
        if (t.id === truckId) {
          const updated = { ...t, ...updates };
          if (updates.status) {
            addLog(`🛠️ ผู้ควบคุมเปลี่ยนสถานะของรถ ${t.plateNo} เป็น "${updates.status}"`);
          }
          if (updates.speed !== undefined) {
            addLog(`⚡ ผู้ควบคุมปรับระดับความเร็วรถ ${t.plateNo} เป็น ${updates.speed} km/h`);
          }
          return updated;
        }
        return t;
      })
    );
  };

  // Google Sheet integration Test fetch callback
  const handleTestSheetFetch = async (csvUrl: string): Promise<SheetTestResult> => {
    try {
      const spreadsheetId = extractSpreadsheetId(csvUrl);
      if (spreadsheetId) {
        addLog(`📡 ตรวจพบ Google Spreadsheet ID: ${spreadsheetId}`);
        addLog(`🔄 กำลังเชื่อมต่อเพื่อดึงและผสานข้อมูลจากชีท "Plan" และ "API GPS"...`);
        const merged = await fetchAndMergeSheets(spreadsheetId);
        if (merged.length > 0) {
          addLog(`✅ ผสานข้อมูลสเปรดชีตสำเร็จ! พบเส้นทางเดินรถทั้งหมด ${merged.length} รายการ`);
          return { success: true };
        } else {
          return {
            success: false,
            error: 'เชื่อมต่อชีทสำเร็จ แต่ไม่พบข้อมูลแผนเดินรถในชีท "Plan" กรุณาเช็คการสะกดคอลัมน์และข้อมูล'
          };
        }
      }

      // Legacy fallback
      addLog(`📡 กำลังดึงข้อมูลจาก Google Sheet CSV URL...`);
      const response = await fetch(csvUrl);
      if (!response.ok) {
        throw new Error(`เซิร์ฟเวอร์ตอบกลับรหัสข้อผิดพลาด HTTP ${response.status}`);
      }
      const text = await response.text();
      const textTrimmed = text.trim();

      // Check if response is HTML (indicating private sheet or login redirect)
      const isHtml = textTrimmed.startsWith('<') || 
                     textTrimmed.toLowerCase().includes('<!doctype html>') || 
                     textTrimmed.toLowerCase().includes('<html');

      if (isHtml) {
        const errorMsg = 'ระบบตรวจพบเนื้อหาหน้าเว็บล็อคอิน (HTML) แทนที่จะเป็นไฟล์ข้อมูล CSV! สาเหตุหลักเกิดจากสิทธิ์การแชร์ Google Sheet ตั้งค่าเป็น "ส่วนตัว (Private)"';
        addLog(`❌ ดึงข้อมูลล้มเหลว: ตรวจพบเอกสาร HTML (สเปรดชีตอาจถูกจำกัดสิทธิ์แชร์)`);
        return {
          success: false,
          isHtml: true,
          error: errorMsg,
          rawTextPreview: text.substring(0, 200)
        };
      }

      const parsed = parseSheetCSV(text);
      if (parsed.length > 0) {
        addLog(`✅ ดึงข้อมูลจาก Google Sheet สำเร็จจำนวน ${parsed.length} คัน`);
        return { success: true };
      }

      const lines = textTrimmed.split(/\r?\n/).filter(line => line.trim().length > 0);
      addLog(`⚠️ ดึงข้อมูลเสร็จสิ้น แต่แยกคอลัมน์ไม่พบรายการรถขนส่ง (${lines.length} แถว)`);
      return {
        success: false,
        error: 'เชื่อมต่อสำเร็จ แต่ไม่สามารถจัดรูปข้อมูลได้ หรือไม่พบหัวข้อคอลัมน์ที่รองรับ (ทะเบียนรถ, เส้นทาง, ฯลฯ) กรุณาเช็คแบบฟอร์มคอลัมน์ที่แนะนำ',
        rawTextPreview: lines.slice(0, 3).join('\n')
      };
    } catch (err) {
      const errMsg = (err as Error).message;
      addLog(`❌ ดึงข้อมูล Google Sheet ล้มเหลว: ${errMsg}`);
      return {
        success: false,
        error: `ไม่สามารถดึงข้อมูลได้ (CORS หรือข้อผิดพลาดเครือข่าย): ${errMsg} โปรดตรวจสอบว่าแชร์เป็น "ทุกคนที่มีลิงก์มีสิทธิ์อ่าน" หรือตั้งค่า "เผยแพร่ทางเว็บ" ถูกต้อง`
      };
    }
  };

  // Save Config & Apply Sheet data
  const handleSaveSheetConfig = async (newConfig: SheetConfig, csvUrl?: string) => {
    setSheetConfig(newConfig);
    if (newConfig.useMockSimulator) {
      setIsSheetConnected(false);
      setTrucks(INITIAL_TRUCKS);
      setIsSimulating(true);
      setLastUpdated(new Date().toLocaleTimeString('th-TH') + ' (จำลอง)');
      addLog('🔄 สลับกลับมาใช้งานระบบจำลองพิกัดเสมือนจริง (Local Simulator)');
    } else if (csvUrl) {
      setIsSimulating(false); // Stop simulation so sheet data is source of truth
      setIsSheetConnected(true);
      
      // Fetch data immediately
      try {
        const spreadsheetId = extractSpreadsheetId(csvUrl);
        if (spreadsheetId) {
          const merged = await fetchAndMergeSheets(spreadsheetId);
          if (merged.length > 0) {
            setTrucks(merged);
            if (merged[0]) setSelectedTruckId(merged[0].id);
            setLastUpdated(new Date().toLocaleTimeString('th-TH') + ' (Sheet)');
            addLog('🔌 เชื่อมต่อและประมวลผลข้อมูลจากชีท "Plan" & "API GPS" เรียบร้อยแล้ว');
          }
        } else {
          // Legacy fallback
          const response = await fetch(csvUrl);
          const text = await response.text();
          const parsed = parseSheetCSV(text);
          if (parsed.length > 0) {
            setTrucks(parsed);
            if (parsed[0]) setSelectedTruckId(parsed[0].id);
            setLastUpdated(new Date().toLocaleTimeString('th-TH') + ' (Sheet)');
            addLog('🔌 เชื่อมต่อข้อมูล Google Sheet เรียบร้อยแล้ว');
          }
        }
      } catch (err) {
        addLog('❌ เชื่อมต่อสเปรดชีตล้มเหลวขณะอัปเดตค่า');
      }
    }
  };

  const handleManualRefresh = useCallback(async () => {
    if (sheetConfig.useMockSimulator) {
      // Just simulate one immediate tick or notify
      addLog('📡 ทริกเกอร์เช็คพิกัดระบบดาวเทียม GPS สำเร็จ');
      setLastUpdated(new Date().toLocaleTimeString('th-TH') + ' (จำลอง)');
    } else if (sheetConfig.spreadsheetId) {
      addLog('📡 กำลังอัปเดตข้อมูลพิกัดล่าสุดจาก Google Sheet...');
      try {
        const spreadsheetId = extractSpreadsheetId(sheetConfig.spreadsheetId);
        if (spreadsheetId) {
          const merged = await fetchAndMergeSheets(spreadsheetId);
          if (merged.length > 0) {
            setTrucks(merged);
            setLastUpdated(new Date().toLocaleTimeString('th-TH') + ' (Sheet)');
            addLog(`✅ อัปเดตข้อมูลพิกัดล่าสุดจาก Plan & API GPS สำเร็จ (${merged.length} รายการ)`);
          }
        } else {
          // Legacy fallback
          const response = await fetch(sheetConfig.spreadsheetId);
          const text = await response.text();
          const parsed = parseSheetCSV(text);
          if (parsed.length > 0) {
            setTrucks(parsed);
            setLastUpdated(new Date().toLocaleTimeString('th-TH') + ' (Sheet)');
            addLog(`✅ รีเฟรชข้อมูลพิกัดสำเร็จ ดึงตารางจำนวน ${parsed.length} คัน`);
          }
        }
      } catch (err) {
        addLog('❌ ไม่สามารถรีเฟรชข้อมูล Google Sheet ได้');
      }
    }
  }, [sheetConfig, addLog]);

  // Google Sheet Auto-Refresh Interval
  useEffect(() => {
    if (!isSheetConnected || !sheetConfig.spreadsheetId) return;

    // Refresh every 15 seconds automatically to keep real-time updates alive
    const interval = setInterval(() => {
      handleManualRefresh();
    }, 15000);

    return () => clearInterval(interval);
  }, [isSheetConnected, sheetConfig.spreadsheetId, handleManualRefresh]);

  const handleSelectStatusFilterFromCard = (status: string) => {
    setFilters(prev => ({
      ...prev,
      status: status as TruckStatus | 'All'
    }));
    addLog(`🔍 กรองการดูข้อมูลตามสถานะ: ${status}`);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans" id="elive-app-root">
      
      {/* Header System Bar */}
      <Header
        lastUpdated={lastUpdated}
        onOpenSheetConfig={() => setIsSheetConfigOpen(true)}
        isSheetConnected={isSheetConnected}
        onManualRefresh={handleManualRefresh}
      />

      {/* Main Container with Left Sidebar & Switchable Views */}
      <div className="flex-1 flex flex-col lg:flex-row w-full max-w-[1700px] mx-auto">
        
        {/* Left Sidebar Menu */}
        <aside 
          className={`w-full bg-white border-b lg:border-b-0 lg:border-r border-slate-200 lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] shrink-0 flex flex-col justify-between p-4 shadow-sm z-30 transition-all duration-300 ${
            isSidebarCollapsed ? 'lg:w-20' : 'lg:w-64'
          }`} 
          id="left-sidebar-navigation"
        >
          <div className="space-y-6">
            {/* Sidebar Collapse Toggle & Title */}
            <div className="flex items-center justify-between min-h-8 border-b border-slate-100 pb-2.5">
              {!isSidebarCollapsed && (
                <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider px-2 animate-fadeIn">
                  เมนูหลัก (Console)
                </p>
              )}
              <button
                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                className={`p-1.5 rounded bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-all cursor-pointer hidden lg:flex items-center justify-center ${
                  isSidebarCollapsed ? 'mx-auto' : 'ml-auto'
                }`}
                title={isSidebarCollapsed ? "ขยายแถบเมนู" : "ซ่อนแถบเมนู"}
                id="sidebar-toggle-btn"
              >
                {isSidebarCollapsed ? (
                  <ChevronRight className="w-3.5 h-3.5" />
                ) : (
                  <ChevronLeft className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            <nav className="space-y-1.5">
              <button
                onClick={() => {
                  setActiveTab('dashboard');
                  addLog('📂 สลับไปที่หน้า "แดชบอร์ดหลัก"');
                }}
                className={`w-full flex items-center rounded-lg text-xs font-bold transition-all cursor-pointer py-2.5 ${
                  isSidebarCollapsed ? 'justify-center px-1' : 'justify-between px-3'
                } ${
                  activeTab === 'dashboard'
                    ? 'bg-blue-50 text-blue-700 shadow-sm border border-blue-100/50'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
                }`}
                id="menu-btn-dashboard"
                title="Dashboard (แดชบอร์ด)"
              >
                <div className="flex items-center gap-2.5">
                  <LayoutDashboard className={`w-4.5 h-4.5 shrink-0 ${activeTab === 'dashboard' ? 'text-blue-600' : 'text-slate-400'}`} />
                  {!isSidebarCollapsed && <span>Dashboard (แดชบอร์ด)</span>}
                </div>
                {!isSidebarCollapsed && activeTab === 'dashboard' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                )}
              </button>

              <button
                onClick={() => {
                  setActiveTab('live');
                  addLog('📂 สลับไปที่หน้า "ติดตามรถสด (Live Map)"');
                }}
                className={`w-full flex items-center rounded-lg text-xs font-bold transition-all cursor-pointer py-2.5 ${
                  isSidebarCollapsed ? 'justify-center px-1' : 'justify-between px-3'
                } ${
                  activeTab === 'live'
                    ? 'bg-blue-50 text-blue-700 shadow-sm border border-blue-100/50'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
                }`}
                id="menu-btn-live"
                title="Live Tracking (ติดตามสด)"
              >
                <div className="flex items-center gap-2.5">
                  <Map className={`w-4.5 h-4.5 shrink-0 ${activeTab === 'live' ? 'text-blue-600' : 'text-slate-400'}`} />
                  {!isSidebarCollapsed && <span>Live Tracking (ติดตามสด)</span>}
                </div>
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 absolute"></span>
                </span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('plan');
                  addLog('📂 สลับไปที่หน้า "แผนงานจัดส่งรายวัน (Daily Plan)"');
                }}
                className={`w-full flex items-center rounded-lg text-xs font-bold transition-all cursor-pointer py-2.5 ${
                  isSidebarCollapsed ? 'justify-center px-1' : 'justify-between px-3'
                } ${
                  activeTab === 'plan'
                    ? 'bg-blue-50 text-blue-700 shadow-sm border border-blue-100/50'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
                }`}
                id="menu-btn-plan"
                title="แผนงานจัดส่งรายวัน (Daily Plan)"
              >
                <div className="flex items-center gap-2.5">
                  <FileSpreadsheet className={`w-4.5 h-4.5 shrink-0 ${activeTab === 'plan' ? 'text-blue-600' : 'text-slate-400'}`} />
                  {!isSidebarCollapsed && <span>แผนงานจัดส่งรายวัน (Plan)</span>}
                </div>
                {!isSidebarCollapsed && activeTab === 'plan' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                )}
              </button>

              <button
                onClick={() => {
                  setActiveTab('history');
                  addLog('📂 สลับไปที่หน้า "ประวัติเที่ยววิ่งย้อนหลัง"');
                }}
                className={`w-full flex items-center rounded-lg text-xs font-bold transition-all cursor-pointer py-2.5 ${
                  isSidebarCollapsed ? 'justify-center px-1' : 'justify-between px-3'
                } ${
                  activeTab === 'history'
                    ? 'bg-blue-50 text-blue-700 shadow-sm border border-blue-100/50'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
                }`}
                id="menu-btn-history"
                title="ประวัติย้อนหลัง (History)"
              >
                <div className="flex items-center gap-2.5">
                  <History className={`w-4.5 h-4.5 shrink-0 ${activeTab === 'history' ? 'text-blue-600' : 'text-slate-400'}`} />
                  {!isSidebarCollapsed && <span>ประวัติย้อนหลัง (History)</span>}
                </div>
                {!isSidebarCollapsed && activeTab === 'history' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                )}
              </button>
            </nav>

            {/* Terminal Status Card */}
            {!isSidebarCollapsed && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-2.5 animate-fadeIn hidden lg:block">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
                  <Activity className="w-3.5 h-3.5 text-blue-600" />
                  <span>สถานะระบบตรวจพิกัด</span>
                </div>
                
                <div className="space-y-1.5 text-[10.5px]">
                  <div className="flex items-center justify-between text-slate-500">
                    <span>เชื่อมโยง GPS:</span>
                    <span className="text-emerald-600 font-bold">100% เสถียร</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-500">
                    <span>รถออนไลน์:</span>
                    <span className="text-slate-700 font-bold">
                      {trucks.filter(t => t.status !== 'Offline').length} / {trucks.length} คัน
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-500">
                    <span>เซิร์ฟเวอร์หลัก:</span>
                    <span className="text-blue-700 font-bold font-mono">ACTIVE-1</span>
                  </div>
                </div>
                
                <div className="pt-2 border-t border-slate-200">
                  <div className="flex items-center gap-1 text-[9px] text-slate-400 font-mono font-bold leading-none">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                    <span className="truncate">TPCAP-GEOFENCE: ONLINE</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-200 hidden lg:block">
            <div className={`flex items-center gap-2 text-slate-500 ${isSidebarCollapsed ? 'justify-center' : ''}`}>
              <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-[10.5px] font-bold text-blue-700 font-mono shrink-0">
                TP
              </div>
              {!isSidebarCollapsed && (
                <div className="leading-tight min-w-0 animate-fadeIn">
                  <p className="text-[10.5px] font-bold text-slate-700 truncate">ผู้ควบคุมระบบ</p>
                  <p className="text-[9px] text-slate-400 font-bold truncate">Operator: {userEmail.split('@')[0]}</p>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Main Switchable Views Pane */}
        <main className="flex-1 p-4 md:p-6 space-y-6 overflow-y-auto">
          
          {/* VIEW 1: Dashboard View */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6 animate-fadeIn" id="view-dashboard">
              
              {/* Google Sheet Live Connector Bar (Prominent and Auto-sync) */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4 border-l-4 border-l-emerald-500">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-emerald-50 rounded-lg shrink-0">
                    <Database className="w-5 h-5 text-emerald-600 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-xs font-sans font-bold text-slate-800 uppercase tracking-wider">
                      ศูนย์เชื่อมต่อข้อมูล Google Sheet (Google Sheet Live Sync Center)
                    </h3>
                    <p className="text-[10.5px] text-slate-500 font-medium leading-relaxed mt-0.5">
                      {isSheetConnected 
                        ? `เชื่อมต่อกับ Google Sheet สำเร็จ! ดึงข้อมูลพิกัดและรอบจัดส่งอัตโนมัติทุก 15 วินาที` 
                        : `ยังไม่ได้เชื่อมต่อข้อมูลจริง กรุณาป้อนที่อยู่ Google Sheet เพื่อดึงแผนจัดส่งและรับข้อมูล GPS สด`
                      }
                    </p>
                    {isSheetConnected && (
                      <span className="text-[9.5px] text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded font-mono font-bold mt-1.5 inline-block border border-emerald-100">
                        Spreadsheet ID: {sheetConfig.spreadsheetId}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto shrink-0 justify-end">
                  <button
                    onClick={() => setIsSheetConfigOpen(true)}
                    className={`w-full md:w-auto flex items-center justify-center gap-1.5 px-4.5 py-2 rounded text-xs font-bold tracking-wide transition-all border cursor-pointer ${
                      isSheetConnected
                        ? 'bg-emerald-600 hover:bg-emerald-700 border-transparent text-white'
                        : 'bg-emerald-500 hover:bg-emerald-600 border-transparent text-white'
                    }`}
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>{isSheetConnected ? 'ตั้งค่าการเชื่อมต่อชีท' : 'คลิกเพื่อเชื่อมต่อ Google Sheet'}</span>
                  </button>
                  
                  {isSheetConnected && (
                    <button
                      onClick={handleManualRefresh}
                      className="p-2 bg-white hover:bg-slate-50 border border-slate-300 hover:border-slate-400 text-slate-600 rounded cursor-pointer transition-all"
                      title="กดเพื่ออัปเดตข้อมูลพิกัดทันที"
                    >
                      <RefreshCw className="w-4 h-4 animate-spin-slow" />
                    </button>
                  )}
                </div>
              </div>

              {/* KPI Cards Summary Section */}
              <KPICards
                trucks={trucks}
                onSelectStatusFilter={handleSelectStatusFilterFromCard}
                activeFilter={filters.status}
              />

              {/* Live Status Table */}
              <div className="space-y-3" id="table-section">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <Radio className="w-4 h-4 text-blue-600 animate-pulse" />
                    <h2 className="text-xs font-sans font-bold text-slate-800 uppercase tracking-wider">
                      ตารางแสดงสถานะรถขนส่งแบบเรียลไทม์ (Real-Time Grid)
                    </h2>
                  </div>
                  <span className="text-[10.5px] text-slate-400 font-mono font-bold">
                    ข้อมูลสดอัปเดตอัตโนมัติ 📡
                  </span>
                </div>

                <TruckTable
                  trucks={trucks}
                  selectedTruckId={selectedTruckId}
                  onSelectTruck={(truck) => {
                    handleSelectTruck(truck);
                    setActiveTab('live');
                    addLog(`🎯 เลือกติดตามรถทะเบียน ${truck.plateNo} บนแผนที่เรียลไทม์`);
                  }}
                  filters={filters}
                  onSetFilters={setFilters}
                  hideDriverInfo={true}
                />
              </div>
            </div>
          )}

          {/* VIEW 2: Live Tracking View */}
          {activeTab === 'live' && (
            <div className="space-y-5 animate-fadeIn" id="view-live">
              
              {/* Top Selector Panel for better user experience */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                  </span>
                  <div>
                    <h2 className="text-xs font-sans font-bold text-slate-800 uppercase tracking-wider">
                      ศูนย์แผนที่ติดตามเรียลไทม์ (Live Terminal Hub)
                    </h2>
                    <p className="text-[10px] text-slate-400">คลิกเลือกรถในแถบขวาเพื่อสแกนพิกัดพล็อตเส้นทางบนแผนที่</p>
                  </div>
                </div>

                {/* Quick Selection pills */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10.5px] text-slate-500 font-bold mr-1">สแกนพิกัดรถวิ่ง:</span>
                  {trucks.filter(t => t.status === 'Traveling').map(t => (
                    <button
                      key={t.id}
                      onClick={() => {
                        handleSelectTruck(t);
                        addLog(`📍 เจาะพิกัดระบบติดตามจีพีเอสรถ ${t.plateNo}`);
                      }}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide transition-all border cursor-pointer ${
                        selectedTruckId === t.id
                          ? 'bg-blue-600 text-white border-transparent shadow-sm font-black'
                          : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border-slate-200'
                      }`}
                    >
                      🚛 {t.plateNo.split(' ')[0]}
                    </button>
                  ))}
                  {trucks.filter(t => t.status === 'Traveling').length === 0 && (
                    <span className="text-[10px] text-slate-400 italic">ไม่มีรถวิ่งเดินทางในขณะนี้</span>
                  )}
                </div>
              </div>

              {/* Mid Spatial Section: Map & Selected Detail */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5" id="spatial-section">
                {/* Real-time Interactive SVG Map (Left 7 columns) */}
                <div className="lg:col-span-7 flex flex-col justify-stretch">
                  <InteractiveMap
                    trucks={trucks}
                    selectedTruckId={selectedTruckId}
                    onSelectTruck={handleSelectTruck}
                  />
                </div>

                {/* Detailed Inspection panel (Right 5 columns) */}
                <div className="lg:col-span-5 flex flex-col justify-stretch">
                  <TruckDetailPanel
                    truck={selectedTruck}
                    onClose={() => setSelectedTruckId(null)}
                    onUpdateTruckTelemetry={handleUpdateTruckTelemetry}
                  />
                </div>
              </div>

              {/* Migrated Live System logs panel (At the bottom) */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3.5">
                <div className="flex items-center gap-1.5 px-1 border-b border-slate-100 pb-2">
                  <CloudLightning className="w-4.5 h-4.5 text-blue-600" />
                  <h2 className="text-xs font-sans font-bold text-slate-800 uppercase tracking-wider">
                    สัญญาณส่งการแบบเรียลไทม์ (Live System Logs)
                  </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  <div className="md:col-span-9 space-y-2 max-h-[160px] overflow-y-auto custom-scrollbar pr-2">
                    {systemLogs.map((log, idx) => (
                      <div key={idx} className="text-[11px] font-mono leading-relaxed border-b border-slate-100 pb-1.5 text-slate-600 flex items-start gap-1.5 font-semibold">
                        <span className="text-blue-600 font-bold shrink-0">▸</span>
                        <span className="break-words">{log}</span>
                      </div>
                    ))}
                  </div>

                  <div className="md:col-span-3 border-t md:border-t-0 md:border-l border-slate-100 pt-3 md:pt-0 md:pl-4 flex flex-col justify-between text-[10.5px]">
                    <div className="space-y-1.5 leading-relaxed">
                      <p className="font-bold text-slate-700">สถานีติดตามพิกัด TPCAP</p>
                      <p className="text-slate-500 font-medium">เซิร์ฟเวอร์ควบคุม: <span className="font-mono text-blue-700 font-bold">TH-EAST-1</span></p>
                      <p className="text-slate-500 font-medium">ความเสถียร: <span className="text-emerald-600 font-bold">100% เสถียร</span></p>
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono font-bold flex items-center gap-1 mt-3">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span>ระบบวิเคราะห์จีพีเอสออนไลน์</span>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* VIEW 3: History View */}
          {activeTab === 'history' && (
            <div className="space-y-6 animate-fadeIn" id="view-history">
              
              {/* History Header banner */}
              <div className="bg-[#1e3a8a] text-white rounded-xl p-5 shadow-md relative overflow-hidden">
                <div className="absolute right-0 bottom-0 opacity-10 translate-y-4">
                  <History className="w-48 h-48" />
                </div>
                <div className="relative z-10 space-y-1">
                  <span className="bg-blue-800 text-blue-200 text-[9px] font-mono font-bold tracking-widest px-2.5 py-1 rounded-full uppercase">
                    Historical Log Database
                  </span>
                  <h2 className="text-lg font-bold">บันทึกประวัติเที่ยววิ่งย้อนหลัง (Fleet Logs Archive)</h2>
                  <p className="text-xs text-blue-200 font-sans">ฐานข้อมูลแสดงประวัติงานเดินรถขนส่งวัตถุดิบและผลิตภัณฑ์ที่ทำภารกิจเสร็จสิ้น (Delivered) ย้อนหลัง</p>
                </div>
              </div>

              {/* History Stats Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">เสร็จสิ้นงานวันนี้ (Completed Today)</p>
                  <p className="text-2xl font-black text-emerald-600">8 เที่ยววิ่ง</p>
                  <div className="text-[9.5px] text-slate-400 font-bold flex items-center gap-1">
                    <span className="text-emerald-500 font-bold">↑ 100%</span> งานตรงเวลาทั้งหมด
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">อัตราจัดส่งตรงเวลา (On-Time Rate)</p>
                  <p className="text-2xl font-black text-blue-700">96.8%</p>
                  <div className="text-[9.5px] text-slate-400 font-bold flex items-center gap-1">
                    เทียบกับมาตรฐาน SLA 95%
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">ระยะเวลาเดินทางเฉลี่ย (Avg Duration)</p>
                  <p className="text-2xl font-black text-slate-800">3.4 ชม.</p>
                  <div className="text-[9.5px] text-slate-400 font-bold flex items-center gap-1">
                    คงที่เมื่อเทียบกับเดือนที่แล้ว
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">ระยะทางขนส่งรวม (Total Distance)</p>
                  <p className="text-2xl font-black text-slate-800">4,250 กม.</p>
                  <div className="text-[9.5px] text-slate-400 font-bold flex items-center gap-1 text-emerald-600">
                    ลดการปล่อย CO2 ได้ 14%
                  </div>
                </div>
              </div>

              {/* Historical Logs List */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="border-b border-slate-100 p-4 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-slate-500" />
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">ตารางสรุปบันทึกการเดินทาง (Historical Archive Grid)</span>
                  </div>
                  
                  {/* Select Range Preset */}
                  <div className="flex items-center gap-1">
                    <button className="px-2.5 py-1 rounded bg-blue-100 text-blue-700 text-[10px] font-bold">วันนี้</button>
                    <button className="px-2.5 py-1 rounded bg-slate-100 text-slate-600 text-[10px] font-bold hover:bg-slate-200">เมื่อวาน</button>
                    <button className="px-2.5 py-1 rounded bg-slate-100 text-slate-600 text-[10px] font-bold hover:bg-slate-200">ย้อนหลัง 7 วัน</button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/50 border-b border-slate-100 text-[10.5px] text-slate-400 font-bold uppercase tracking-wider">
                        <th className="py-3 px-4">รหัสและเวลา</th>
                        <th className="py-3 px-4">ทะเบียนรถ & คนขับ</th>
                        <th className="py-3 px-4">เส้นทางขนส่ง</th>
                        <th className="py-3 px-4">ระยะเวลา / ระยะทาง</th>
                        <th className="py-3 px-4">บริษัทขนส่ง</th>
                        <th className="py-3 px-4">ความเร็วเฉลี่ย</th>
                        <th className="py-3 px-4 text-right">ผลการจัดส่ง</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {HISTORICAL_TRIPS.map((trip) => (
                        <tr key={trip.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="font-mono font-bold text-slate-700">{trip.id}</div>
                            <div className="text-[10px] text-slate-400 font-bold">{trip.date} • {trip.time.split(' ')[0]}</div>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-800">{trip.plateNo}</div>
                            <div className="text-[10px] text-slate-500 font-semibold">{trip.driverName}</div>
                          </td>
                          <td className="py-3.5 px-4 font-bold text-slate-700">
                            {trip.route}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-700">{trip.duration}</div>
                            <div className="text-[10px] text-slate-400 font-bold">ระยะทาง: {trip.distance}</div>
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-500 text-[10.5px]">
                            {trip.logisticsCo}
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-700">
                            {trip.avgSpeed}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <span className={`inline-block px-2 py-1 rounded text-[10px] font-bold border ${trip.statusColor}`}>
                              {trip.statusText}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="p-4 border-t border-slate-100 bg-slate-50/30 text-center">
                  <span className="text-[10.5px] text-slate-400 font-bold">
                    แสดงหน้า 1 จาก 1 • ข้อมูลสำรองย้อนหลัง 30 วันจะถูกบีบอัดเก็บใน Cold-Storage คลาวด์อัตโนมัติ
                  </span>
                </div>
              </div>

            </div>
          )}

          {/* VIEW 4: Daily Plan View */}
          {activeTab === 'plan' && (
            <div className="space-y-6 animate-fadeIn" id="view-plan">
              {/* Header banner */}
              <div className="bg-[#1e3a8a] text-white rounded-xl p-5 shadow-sm relative overflow-hidden">
                <div className="absolute right-0 bottom-0 opacity-10 translate-y-4">
                  <FileSpreadsheet className="w-48 h-48" />
                </div>
                <div className="relative z-10 space-y-1">
                  <span className="bg-blue-800 text-blue-200 text-[9px] font-mono font-bold tracking-widest px-2.5 py-1 rounded-full uppercase">
                    Daily Logistics Plan
                  </span>
                  <h2 className="text-lg font-bold">แผนงานจัดส่งรายวัน (Daily Logistics Plan)</h2>
                  <p className="text-xs text-blue-200 font-sans">ใช้อัปโหลด เปรียบเทียบ และปรับข้อมูลเส้นทางของรถยนต์จริงให้สอดคล้องตามแผนประจำวัน</p>
                </div>
              </div>

              {/* Main Daily Plan Manager */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                <DailyPlanManager
                  trucks={trucks}
                  dailyPlan={dailyPlan}
                  onUploadPlan={setDailyPlan}
                  onSyncPlanToTrucks={handleSyncPlanToTrucks}
                  addLog={addLog}
                />
              </div>
            </div>
          )}

        </main>
      </div>

      {/* Sheet Integration setup modal */}
      <SheetConfigModal
        isOpen={isSheetConfigOpen}
        onClose={() => setIsSheetConfigOpen(false)}
        config={sheetConfig}
        onSaveConfig={handleSaveSheetConfig}
        isSheetConnected={isSheetConnected}
        onTestFetch={handleTestSheetFetch}
      />

      {/* Global corporate footer */}
      <footer className="bg-slate-100 border-t border-slate-200 py-5 text-center text-xs text-slate-500 font-sans mt-12 font-semibold">
        <div className="max-w-[1600px] mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>© 2026 ELIVE Logistics Fleet Monitoring Terminal. สงวนลิขสิทธิ์</span>
          <div className="flex items-center gap-4 text-[11px] text-slate-400 font-bold">
            <a href="#elive-header" className="hover:text-slate-800 transition-colors">ศูนย์ควบคุมกลาง (TPCAP Control Tower)</a>
            <span>•</span>
            <span className="text-emerald-600 font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
              ระบบทำงานปกติ
            </span>
          </div>
        </div>
      </footer>

    </div>
  );
}
