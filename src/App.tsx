import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import { mockTrucks } from './data';
import { LiveMap } from './components/LiveMap';
import { WarehouseStamp } from './components/WarehouseStamp';
import { PlatformDiagram } from './components/PlatformDiagram';
import { IncidentCenter } from './components/IncidentCenter';
import { StatusBadge } from './components/StatusBadge';
import PlanManagement from './components/PlanManagement';

import {
  GpsLocation,
  PerformanceStatus,
  Truck,
} from './types';

import {
  fetchEliveDashboardData,
  getAppsScriptUrl,
  updateTruckInSheets,
} from './lib/sheets';

import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ClipboardList,
  Clock,
  LayoutDashboard,
  LockKeyhole,
  Map,
  MapPin,
  Maximize2,
  Menu,
  Minimize2,
  MessageSquare,
  Network,
  Package,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  TabletSmartphone,
  Truck as TruckIcon,
  X,
} from 'lucide-react';

import {
  AnimatePresence,
  motion,
} from 'motion/react';

type CurrentView =
  | 'dashboard'
  | 'map'
  | 'warehouse'
  | 'diagram'
  | 'incident'
  | 'plan-management';

interface ActionDialogState {
  isOpen: boolean;
  truck: Truck | null;
}

type DockFilter = 'ALL' | 'M1' | 'L1' | 'L2' | 'R1' | 'R2';

const DOCK_FILTERS: DockFilter[] = ['ALL', 'M1', 'L1', 'L2', 'R1', 'R2'];

const ROWS_PER_PAGE = 20;
const REFRESH_INTERVAL = 60000;

function normalizeLicensePlate(value?: string): string {
  return String(value || '')
    .split('(')[0]
    .replace(/[\s-]/g, '')
    .trim()
    .toUpperCase();
}

function getDockGroup(value?: string): Exclude<DockFilter, 'ALL'> | '' {
  const normalized = String(value || '').replace(/\s+/g, '').toUpperCase();
  const match = normalized.match(/^(M1|L1|L2|R1|R2)/);
  return match ? (match[1] as Exclude<DockFilter, 'ALL'>) : '';
}

function isInboundProject(truck: Truck): boolean {
  return String(truck.project || '').trim().toUpperCase() === 'INBOUND';
}

function getPlanEtaSortValue(value?: string): number {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return Number.MAX_SAFE_INTEGER;
  }
  return hour * 60 + minute;
}

export default function App() {
  const [trucks, setTrucks] = useState<Truck[]>(mockTrucks);
  const [gpsLocations, setGpsLocations] = useState<GpsLocation[]>([]);
  const [currentView, setCurrentView] = useState<CurrentView>('dashboard');
  const [selectedGpsTruckId, setSelectedGpsTruckId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 768);
  const [lastUpdate, setLastUpdate] = useState('-');
  const [actionDialog, setActionDialog] = useState<ActionDialogState>({
    isOpen: false,
    truck: null,
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showPlanAccessDialog, setShowPlanAccessDialog] = useState(false);
  const [planAccessCode, setPlanAccessCode] = useState('');
  const [planAccessError, setPlanAccessError] = useState('');
  const [appsScriptUrl, setAppsScriptUrl] = useState(getAppsScriptUrl());
  const [showHiddenRows, setShowHiddenRows] = useState(false);
  const [dockFilter, setDockFilter] = useState<DockFilter>('ALL');
  const [isDashboardFullscreen, setIsDashboardFullscreen] = useState(false);
  const [isGpsPopupOpen, setIsGpsPopupOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasLoadedSuccessfully, setHasLoadedSuccessfully] = useState(false);
  const [appLoginUser, setAppLoginUser] = useState('');
  const [appLoginPw, setAppLoginPw] = useState('');
  const [isAppLoggedIn, setIsAppLoggedIn] = useState(
    localStorage.getItem('isAppLoggedIn') === 'true'
  );

  const requestRunningRef = useRef(false);
  const dashboardFullscreenRef = useRef<HTMLElement | null>(null);

  const loadData = useCallback(async () => {
    if (requestRunningRef.current) return;

    requestRunningRef.current = true;
    setIsRefreshing(true);

    try {
      const data = await fetchEliveDashboardData();

      if (data.trucks.length > 0) {
        setTrucks(data.trucks);
      }

      setGpsLocations(data.gpsLocations);
      setLastUpdate(
        new Date().toLocaleTimeString('en-GB', {
          timeZone: 'Asia/Bangkok',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
      );
      setSheetError(null);
      setHasLoadedSuccessfully(true);
    } catch (error) {
      console.error('Failed to fetch ELIVE data:', error);
      setSheetError(
        error instanceof Error ? error.message : 'Failed to fetch ELIVE data'
      );
    } finally {
      requestRunningRef.current = false;
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!isAppLoggedIn) return;

    void loadData();
    const intervalId = window.setInterval(() => void loadData(), REFRESH_INTERVAL);
    return () => window.clearInterval(intervalId);
  }, [isAppLoggedIn, loadData]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedDate, showHiddenRows, dockFilter]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsDashboardFullscreen(
        document.fullscreenElement === dashboardFullscreenRef.current
      );
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handleUpdateTruck = async (id: string, updates: Partial<Truck>) => {
    const currentTruck = trucks.find((truck) => truck.id === id);
    if (!currentTruck) return;

    setTrucks((previousTrucks) =>
      previousTrucks.map((truck) =>
        truck.id === id ? { ...truck, ...updates } : truck
      )
    );

    try {
      await updateTruckInSheets(id, updates, currentTruck);
      await loadData();
    } catch (error) {
      console.error('Failed to update sheet:', error);
      setSheetError(
        error instanceof Error ? error.message : 'Failed to update truck data'
      );
    }
  };

  const closeSidebarOnMobile = () => {
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const changeView = (view: CurrentView) => {
    setCurrentView(view);
    closeSidebarOnMobile();
  };

  const requestPlanManagementAccess = () => {
    setPlanAccessCode('');
    setPlanAccessError('');
    setShowPlanAccessDialog(true);
    closeSidebarOnMobile();
  };

  const handlePlanAccessSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (planAccessCode === '12234') {
      setShowPlanAccessDialog(false);
      setPlanAccessCode('');
      setPlanAccessError('');
      setCurrentView('plan-management');
      return;
    }

    setPlanAccessError('รหัสไม่ถูกต้อง กรุณาลองใหม่');
  };

  const handleOpenGps = (truckId: string) => {
    setSelectedGpsTruckId(truckId);
    setIsGpsPopupOpen(true);
  };

  const closeGpsPopup = () => {
    setIsGpsPopupOpen(false);
    setSelectedGpsTruckId(null);
  };

  const toggleDashboardFullscreen = async () => {
    const element = dashboardFullscreenRef.current;
    if (!element) return;

    try {
      if (document.fullscreenElement === element) {
        await document.exitFullscreen();
        return;
      }
      if (document.fullscreenElement) await document.exitFullscreen();
      await element.requestFullscreen();
    } catch (error) {
      console.error('Unable to change dashboard fullscreen mode:', error);
      setSheetError('อุปกรณ์หรือเบราว์เซอร์ไม่รองรับ Full Screen');
    }
  };

  const handleOpenMapMenu = () => {
    setSelectedGpsTruckId(null);
    changeView('map');
  };

  const formattedSelectedDate = useMemo(() => {
    return selectedDate ? selectedDate.trim().slice(0, 10) : '';
  }, [selectedDate]);

  const filteredTrucks = useMemo(() => {
    if (!formattedSelectedDate) return [];

    return trucks.filter((truck) =>
      String(truck.planDate || '').trim().slice(0, 10) === formattedSelectedDate
    );
  }, [trucks, formattedSelectedDate]);

  const inboundTrucks = useMemo(
    () => filteredTrucks.filter(isInboundProject),
    [filteredTrucks]
  );

  const filteredGpsLocations = useMemo(() => {
    if (inboundTrucks.length === 0 || gpsLocations.length === 0) return [];

    const planLicensePlates = new Set<string>();
    for (const truck of inboundTrucks) {
      const normalizedPlate = normalizeLicensePlate(truck.licensePlate);
      if (normalizedPlate) planLicensePlates.add(normalizedPlate);
    }

    return gpsLocations.filter((location) => {
      const normalizedPlate = normalizeLicensePlate(location.licensePlate);
      return normalizedPlate !== '' && planLicensePlates.has(normalizedPlate);
    });
  }, [inboundTrucks, gpsLocations]);

  const stats = useMemo(() => ({
    total: inboundTrucks.length,
    unloading: inboundTrucks.filter((truck) =>
      truck.status === 'DOCK_IN' ||
      truck.status === 'UNLOADING' ||
      truck.status === 'UNLOADING_AT_TPCAP'
    ).length,
    complete: inboundTrucks.filter((truck) =>
      truck.status === 'COMPLETED' || truck.status === 'TRUCK_OUT'
    ).length,
    remain: inboundTrucks.filter((truck) =>
      truck.status !== 'COMPLETED' && truck.status !== 'TRUCK_OUT'
    ).length,
  }), [inboundTrucks]);

  const isDelayedNoStamp = (truck: Truck): boolean => {
    if (truck.stampEta || truck.actualEta) return false;
    if (!truck.planDate || !truck.planEta || truck.planEta === '-') return false;

    const planDate = String(truck.planDate).trim().slice(0, 10);
    const planEta = String(truck.planEta).trim().slice(0, 5);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(planDate) || !/^\d{1,2}:\d{2}$/.test(planEta)) {
      return false;
    }

    const plannedEta = new Date(`${planDate}T${planEta}:00+07:00`);
    return !Number.isNaN(plannedEta.getTime()) && Date.now() >= plannedEta.getTime();
  };

  const getRowClass = (truck: Truck): string => {
    if (truck.status === 'COMPLETED' || truck.status === 'TRUCK_OUT') {
      return 'row-complete';
    }
    if (isDelayedNoStamp(truck)) {
      return 'animate-pulse bg-red-100 hover:bg-red-200 transition-colors';
    }
    if (truck.performanceStatus === 'DELAY') return 'row-delay';
    if (truck.performanceStatus === 'WARNING') return 'row-warning';
    return 'hover:bg-slate-50 transition-colors';
  };

  const getPerformanceBadge = (status: PerformanceStatus) => {
    const styles: Record<PerformanceStatus, string> = {
      EARLY: 'bg-blue-100 text-blue-700',
      ON_PLAN: 'bg-emerald-100 text-emerald-700',
      DELAY: 'animate-pulse bg-red-100 text-red-700',
      WARNING: 'bg-amber-100 text-amber-700',
    };

    const labels: Record<PerformanceStatus, string> = {
      EARLY: 'EARLY',
      ON_PLAN: 'ON PLAN',
      DELAY: 'DELAY',
      WARNING: 'WARNING',
    };

    return (
      <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${styles[status]}`}>
        {labels[status]}
      </span>
    );
  };

  const shouldShowTruck = (truck: Truck): boolean => {
    if (showHiddenRows) return true;
    if (truck.status !== 'COMPLETED' && truck.status !== 'TRUCK_OUT') return true;
    if (!truck.stampEtd) return true;

    const [hours, minutes] = truck.stampEtd.split(':').map(Number);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return true;

    const now = new Date();
    const etdDate = new Date(now);
    etdDate.setHours(hours, minutes, 0, 0);
    return now.getTime() - etdDate.getTime() <= 600000;
  };

  const visibleTrucks = useMemo(() => {
    return inboundTrucks
      .filter(shouldShowTruck)
      .filter(truck =>
        dockFilter === 'ALL' ? true : getDockGroup(truck.dropPoint) === dockFilter
      )
      .sort((first, second) => {
        const timeDifference =
          getPlanEtaSortValue(first.planEta) - getPlanEtaSortValue(second.planEta);
        if (timeDifference !== 0) return timeDifference;
        return String(first.route || '').localeCompare(String(second.route || ''), 'en');
      });
  }, [inboundTrucks, showHiddenRows, dockFilter]);

  const totalPages = Math.max(1, Math.ceil(visibleTrucks.length / ROWS_PER_PAGE));
  const pageStartIndex = (currentPage - 1) * ROWS_PER_PAGE;
  const pageEndIndex = currentPage * ROWS_PER_PAGE;
  const paginatedTrucks = visibleTrucks.slice(pageStartIndex, pageEndIndex);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(1);
  }, [currentPage, totalPages]);

  const handleAppLogin = (event: React.FormEvent) => {
    event.preventDefault();

    if (appLoginUser === 'TTKA' && appLoginPw === '1234') {
      setIsAppLoggedIn(true);
      localStorage.setItem('isAppLoggedIn', 'true');
      return;
    }

    alert('Invalid Username or Password');
  };

  if (!isAppLoggedIn) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 font-sans">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600">
            <span className="text-3xl font-bold italic text-white">E</span>
          </div>
          <h1 className="mb-2 text-center text-2xl font-bold text-slate-800">ELIVE Login</h1>
          <p className="mb-6 text-center text-sm text-slate-500">Sign in to access your dashboard</p>
          <form onSubmit={handleAppLogin} className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Username</span>
              <input
                type="text"
                value={appLoginUser}
                onChange={(event) => setAppLoginUser(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter username"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Password</span>
              <input
                type="password"
                value={appLoginPw}
                onChange={(event) => setAppLoginPw(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter password"
              />
            </label>
            <button type="submit" className="w-full rounded-xl bg-blue-600 px-4 py-2.5 font-bold text-white hover:bg-blue-700">
              Sign In
            </button>
          </form>
        </div>
      </div>
    );
  }

  const navItems: Array<{
    view: CurrentView;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    activeClass?: string;
  }> = [
    { view: 'dashboard', label: 'Live Dashboard', icon: LayoutDashboard },
    { view: 'diagram', label: 'Platform Dashboard', icon: Network },
    { view: 'warehouse', label: 'Stamp ETA/ETD', icon: TabletSmartphone },
    {
      view: 'plan-management',
      label: 'Plan Management',
      icon: ClipboardList,
      activeClass: 'bg-emerald-50 font-semibold text-emerald-700',
    },
    {
      view: 'incident',
      label: 'Action Center',
      icon: ShieldAlert,
      activeClass: 'bg-red-50 font-semibold text-red-600',
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 font-sans md:flex-row">
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white p-4 md:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
            <span className="text-lg font-bold italic text-white">E</span>
          </div>
          <span className="text-xl font-bold text-slate-800">ELIVE</span>
        </div>
        <button type="button" onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100">
          <Menu className="h-5 w-5" />
        </button>
      </div>

      <AnimatePresence>
        {isSidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 256, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="fixed left-0 top-0 z-30 flex h-screen shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white md:sticky"
          >
            <div className="flex w-64 items-center justify-between border-b border-slate-200 p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
                  <span className="text-lg font-bold italic text-white">E</span>
                </div>
                <span className="text-xl font-bold text-slate-800">ELIVE</span>
              </div>
              <button type="button" onClick={() => setIsSidebarOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 md:hidden">
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="w-64 flex-1 space-y-1 px-4 py-6">
              {navItems.map(({ view, label, icon: Icon, activeClass }) => (
                <button
                  key={view}
                  type="button"
                  onClick={() => {
                    if (view === 'plan-management') {
                      requestPlanManagementAccess();
                    } else {
                      changeView(view);
                    }
                  }}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                    currentView === view
                      ? activeClass || 'bg-blue-50 font-semibold text-blue-600'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </button>
              ))}
            </nav>

            <div className="w-64 border-t border-slate-100 p-4">
              <button type="button" onClick={() => setShowSettings(true)} className="mb-1 flex w-full items-center gap-3 px-3 py-2 text-sm text-slate-500 hover:text-slate-700">
                <Settings className="h-5 w-5" /> Settings
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsAppLoggedIn(false);
                  localStorage.removeItem('isAppLoggedIn');
                }}
                className="flex w-full items-center gap-3 px-3 py-2 text-sm text-red-500 hover:text-red-700"
              >
                <X className="h-5 w-5" /> Sign Out
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {isSidebarOpen && (
        <div className="fixed inset-0 z-20 bg-slate-900/50 backdrop-blur-sm md:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-4 md:px-6">
          <div className="flex flex-1 items-center gap-4">
            <button type="button" onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="hidden rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:flex">
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="hidden text-xl font-bold text-slate-800 md:block">
              {currentView === 'plan-management' ? 'Plan Management' : 'Real-Time Truck Status Monitoring'}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {currentView !== 'plan-management' && (
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            )}
            <div className="flex items-center gap-3 border-l border-slate-200 pl-3">
              <div className="hidden text-right sm:block">
                <p className="text-xs text-slate-400">Last Update</p>
                <p className="font-mono text-sm text-slate-600">{lastUpdate}</p>
              </div>
              <button type="button" onClick={() => void loadData()} disabled={isRefreshing} className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50">
                <RefreshCw className={`h-5 w-5 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
              <button type="button" className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-slate-600">
                <Bell className="h-5 w-5" />
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
              </button>
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-slate-200 text-xs font-medium text-slate-600">OP</div>
            </div>
          </div>
        </header>

        {sheetError && (
          <div className="z-10 flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-6 py-3 text-sm text-amber-800">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <div>
              <span className="font-bold">การอัปเดตล่าสุดไม่สำเร็จ:</span>{' '}
              {sheetError}
              {hasLoadedSuccessfully && <span className="ml-2">กำลังแสดงข้อมูลรอบล่าสุดที่โหลดสำเร็จ</span>}
            </div>
          </div>
        )}

        {currentView === 'plan-management' ? (
          <main className="min-h-0 flex-1 overflow-auto">
            <PlanManagement
              onPlanCreated={async () => {
                await loadData();
                setSheetError(null);
              }}
            />
          </main>
        ) : !selectedDate ? (
          <main className="flex flex-1 items-center justify-center overflow-auto p-6">
            <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-blue-500">
                <Search className="h-8 w-8" />
              </div>
              <h2 className="mb-2 text-xl font-bold text-slate-800">Select a Date</h2>
              <p className="text-sm text-slate-500">Please select a date from the top right corner to view tracking data.</p>
            </div>
          </main>
        ) : (
          <>
            {currentView === 'dashboard' && (
              <main
                ref={dashboardFullscreenRef}
                className={`flex flex-1 flex-col overflow-auto bg-slate-50 p-2 md:p-3 ${
                  isDashboardFullscreen ? 'h-screen w-screen' : ''
                }`}
              >
                <div className="mb-2 grid grid-cols-2 gap-2 md:grid-cols-4">
                  {[
                    ['Total Truck', stats.total, TruckIcon, 'text-blue-500'],
                    ['Unloading', stats.unloading, Package, 'text-purple-500'],
                    ['Complete', stats.complete, CheckCircle2, 'text-emerald-500'],
                    ['Remain', stats.remain, Clock, 'text-amber-500'],
                  ].map(([label, value, Icon, color]) => {
                    const CardIcon = Icon as React.ComponentType<{ className?: string }>;
                    return (
                      <div key={String(label)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
                        <p className="mb-0.5 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                          <CardIcon className={`h-3.5 w-3.5 ${color}`} /> {String(label)}
                        </p>
                        <h3 className="text-xl font-bold leading-none text-slate-800">{String(value)}</h3>
                      </div>
                    );
                  })}
                </div>

                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 bg-white px-2 py-1.5">
                    <span className="mr-1 text-[9px] font-bold uppercase text-slate-500">
                      Show Dock:
                    </span>
                    {DOCK_FILTERS.map(option => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setDockFilter(option)}
                        className={`rounded-md border px-3 py-1 text-[9px] font-bold transition-colors ${
                          dockFilter === option
                            ? option === 'ALL'
                              ? 'border-slate-800 bg-slate-800 text-white'
                              : 'border-blue-700 bg-blue-600 text-white shadow-sm'
                            : 'border-slate-300 bg-white text-slate-500 hover:bg-slate-100'
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                    <label className="ml-2 flex cursor-pointer items-center gap-1.5 text-[10px] text-slate-600">
                      <input
                        type="checkbox"
                        checked={showHiddenRows}
                        onChange={event => setShowHiddenRows(event.target.checked)}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600"
                      />
                      Show completed/out trucks
                    </label>
                    <div className="ml-auto flex items-center gap-2">
                      <span className="hidden text-[9px] text-slate-500 sm:inline">
                        แสดง {visibleTrucks.length} รายการ
                      </span>
                      <button
                        type="button"
                        onClick={() => void toggleDashboardFullscreen()}
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[9px] font-bold text-slate-700 shadow-sm hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700"
                      >
                        {isDashboardFullscreen ? (
                          <Minimize2 className="h-3.5 w-3.5" />
                        ) : (
                          <Maximize2 className="h-3.5 w-3.5" />
                        )}
                        {isDashboardFullscreen ? 'EXIT FULL SCREEN' : 'FULL SCREEN'}
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        <tr>
                          {['Route', 'สังกัด', 'ทะเบียนรถ', 'จุดลงงาน', 'Plan ETA', 'Actual ETA', 'Actual ETD', 'Status', 'GPS พิกัด', 'Action'].map((heading) => (
                            <th key={heading} className="whitespace-nowrap px-3 py-2">{heading}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {paginatedTrucks.length === 0 ? (
                          <tr><td colSpan={10} className="px-6 py-8 text-center text-slate-500">No trucks found matching your criteria.</td></tr>
                        ) : paginatedTrucks.map((truck) => (
                          <tr key={truck.id} className={`${getRowClass(truck)} border-b border-slate-100/50`}>
                            <td className="whitespace-nowrap px-3 py-1.5 font-mono font-bold text-slate-800">{truck.route}</td>
                            <td className="whitespace-nowrap px-3 py-1.5 font-medium text-slate-700">{truck.supplierName || '-'}</td>
                            <td className="whitespace-nowrap px-3 py-1.5 font-bold text-slate-800">{truck.licensePlate}</td>
                            <td className="whitespace-nowrap px-3 py-1.5 font-medium text-slate-700">{truck.dropPoint}</td>
                            <td className="whitespace-nowrap px-3 py-1.5 font-mono text-slate-600">{truck.planEta || '-'}</td>
                            <td className="whitespace-nowrap px-3 py-1.5 font-mono">
                              <div className="flex items-center gap-2">
                                <span className={truck.performanceStatus === 'DELAY' ? 'font-bold text-red-600' : 'text-slate-800'}>{truck.stampEta || truck.actualEta || '-'}</span>
                                {getPerformanceBadge(truck.performanceStatus)}
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-3 py-1.5 font-mono text-slate-600">{truck.stampEtd || '-'}</td>
                            <td className="whitespace-nowrap px-3 py-1.5"><StatusBadge status={truck.status} /></td>
                            <td className="px-3 py-1.5 text-center">
                              <button type="button" onClick={() => handleOpenGps(truck.id)} className="rounded-full border border-blue-100 bg-blue-50 p-1.5 text-blue-600 hover:bg-blue-100">
                                <MapPin className="h-4 w-4" />
                              </button>
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              <button type="button" onClick={() => setActionDialog({ isOpen: true, truck })} className={truck.actionProblem ? 'text-red-500' : 'text-slate-400 hover:text-blue-600'}>
                                <MessageSquare className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center justify-between border-t border-slate-200 p-3 text-sm">
                      <span className="text-slate-500">Showing {pageStartIndex + 1} to {Math.min(pageEndIndex, visibleTrucks.length)} of {visibleTrucks.length}</span>
                      <div className="flex gap-1">
                        <button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage === 1} className="rounded border px-3 py-1 disabled:opacity-50">Prev</button>
                        <span className="rounded border border-blue-200 bg-blue-50 px-3 py-1 font-bold text-blue-600">{currentPage} / {totalPages}</span>
                        <button type="button" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={currentPage === totalPages} className="rounded border px-3 py-1 disabled:opacity-50">Next</button>
                      </div>
                    </div>
                  )}
                </div>
              </main>
            )}

            {currentView === 'map' && (
              <main className="flex-1 overflow-hidden bg-slate-50">
                <LiveMap trucks={inboundTrucks} gpsLocations={filteredGpsLocations} initialTruckId={selectedGpsTruckId} onRefresh={loadData} isRefreshing={isRefreshing} />
              </main>
            )}
            {currentView === 'diagram' && (
              <main className="min-w-0 flex-1 overflow-hidden bg-white"><PlatformDiagram trucks={filteredTrucks} /></main>
            )}
            {currentView === 'incident' && (
              <main className="flex-1 overflow-hidden"><IncidentCenter trucks={filteredTrucks} onUpdateTruck={handleUpdateTruck} /></main>
            )}
            {currentView === 'warehouse' && (
              <main className="flex-1 overflow-hidden"><WarehouseStamp trucks={inboundTrucks} onUpdateTruck={handleUpdateTruck} /></main>
            )}
          </>
        )}

        <footer className="z-10 flex h-12 shrink-0 items-center justify-between bg-slate-800 px-6 text-xs text-white">
          <div className="flex items-center gap-4">
            <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold">ALERT</span>
            <span className="hidden sm:inline">System running. Check the warning banner for connection status.</span>
          </div>
          <span className="opacity-60">© 2026 ELIVE Logistics</span>
        </footer>
      </div>

      {showPlanAccessDialog && (
        <div
          className="fixed inset-0 z-[1300] flex items-center justify-center bg-slate-950/70 p-4"
          onMouseDown={event => {
            if (event.target === event.currentTarget) {
              setShowPlanAccessDialog(false);
              setPlanAccessCode('');
              setPlanAccessError('');
            }
          }}
        >
          <form
            onSubmit={handlePlanAccessSubmit}
            className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-emerald-100 p-3 text-emerald-700">
                  <LockKeyhole className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-800">
                    Plan Management
                  </h2>
                  <p className="text-sm text-slate-500">
                    กรุณาใส่รหัสเพื่อเข้าใช้งาน
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowPlanAccessDialog(false);
                  setPlanAccessCode('');
                  setPlanAccessError('');
                }}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                title="ปิด"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <label className="mt-6 block text-sm font-medium text-slate-700">
              รหัสเข้าใช้งาน
              <input
                type="password"
                inputMode="numeric"
                autoFocus
                autoComplete="off"
                value={planAccessCode}
                onChange={event => {
                  setPlanAccessCode(event.target.value);
                  if (planAccessError) setPlanAccessError('');
                }}
                placeholder="กรอกรหัส"
                className={`mt-1.5 w-full rounded-xl border px-3 py-2.5 text-center text-lg tracking-[0.35em] outline-none focus:ring-2 ${
                  planAccessError
                    ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20'
                    : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20'
                }`}
              />
            </label>

            {planAccessError && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {planAccessError}
              </div>
            )}

            <button
              type="submit"
              className="mt-5 w-full rounded-xl bg-emerald-600 px-4 py-2.5 font-bold text-white transition-colors hover:bg-emerald-700"
            >
              เข้า Plan Management
            </button>
          </form>
        </div>
      )}

      {isGpsPopupOpen &&
        selectedGpsTruckId &&
        createPortal(
          <div
            className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/70 p-2 sm:p-4"
            onMouseDown={event => {
              if (event.target === event.currentTarget) closeGpsPopup();
            }}
          >
            <div className="flex h-[94vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-2.5">
                <div>
                  <h2 className="font-bold text-slate-800">Live Map</h2>
                  <p className="text-xs text-slate-500">
                    แสดงพิกัดและเส้นทางของรถที่เลือก โดยไม่เปลี่ยนออกจาก Live Dashboard
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeGpsPopup}
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                  title="ปิด Live Map"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                <LiveMap
                  trucks={inboundTrucks}
                  gpsLocations={filteredGpsLocations}
                  initialTruckId={selectedGpsTruckId}
                  onRefresh={loadData}
                  isRefreshing={isRefreshing}
                />
              </div>
            </div>
          </div>,
          isDashboardFullscreen && dashboardFullscreenRef.current
            ? dashboardFullscreenRef.current
            : document.body
        )}

      {actionDialog.isOpen && actionDialog.truck && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800"><MessageSquare className="h-5 w-5 text-blue-500" />Update Problem - {actionDialog.truck.licensePlate}</h3>
              <button type="button" onClick={() => setActionDialog({ isOpen: false, truck: null })}><X className="h-5 w-5" /></button>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const formData = new FormData(event.currentTarget);
                const problem = String(formData.get('problem') || '');
                const selectedTruck = actionDialog.truck;
                if (selectedTruck) void handleUpdateTruck(selectedTruck.id, { actionProblem: problem, actionStatus: 'OPEN' });
                setActionDialog({ isOpen: false, truck: null });
              }}
            >
              <textarea name="problem" defaultValue={actionDialog.truck.actionProblem || ''} className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 focus:ring-2 focus:ring-blue-500" rows={4} required />
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={() => setActionDialog({ isOpen: false, truck: null })} className="rounded-lg bg-slate-100 px-4 py-2 text-sm">Cancel</button>
                <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
              <div className="mb-6 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800"><Settings className="h-5 w-5 text-blue-500" />Settings</h3>
                <button type="button" onClick={() => setShowSettings(false)} className="rounded-full p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
              </div>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">ELIVE Backend API URL</span>
                <input type="text" value={appsScriptUrl} onChange={(event) => setAppsScriptUrl(event.target.value)} placeholder="https://elive-api.onrender.com" className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:ring-2 focus:ring-blue-500" />
              </label>
              <p className="mt-2 text-xs text-slate-500">Frontend connects to the ELIVE Backend API configured in VITE_API_URL.</p>
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={() => setShowSettings(false)} className="rounded-lg px-4 py-2 text-slate-600 hover:bg-slate-100">Cancel</button>
                <button
                  type="button"
                  onClick={() => {
                    localStorage.setItem('apps_script_url', appsScriptUrl);
                    setShowSettings(false);
                    void loadData();
                  }}
                  className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
                >
                  Save Changes
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
