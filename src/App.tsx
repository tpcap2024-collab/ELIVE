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
  confirmWorkDetail,
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
  const [workDetailTruck, setWorkDetailTruck] = useState<Truck | null>(null);
  const [isConfirmingWorkDetail, setIsConfirmingWorkDetail] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPlanAccessDialog, setShowPlanAccessDialog] = useState(false);
  const [planAccessCode, setPlanAccessCode] = useState('');
  const [planAccessError, setPlanAccessError] = useState('');
  const [appsScriptUrl, setAppsScriptUrl] = useState(getAppsScriptUrl());
  const [showHiddenRows, setShowHiddenRows] = useState(false);
  const [selectedDockFilters, setSelectedDockFilters] = useState<Exclude<DockFilter, 'ALL'>[]>([
    'M1',
    'L1',
    'L2',
    'R1',
    'R2',
  ]);
  const [dashboardSearch, setDashboardSearch] = useState('');
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
  const updateQueueRef = useRef<Promise<void>>(Promise.resolve());
  const trucksRef = useRef<Truck[]>(trucks);

  useEffect(() => {
    trucksRef.current = trucks;
  }, [trucks]);

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
  }, [selectedDate, showHiddenRows, selectedDockFilters, dashboardSearch]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsDashboardFullscreen(
        document.fullscreenElement === dashboardFullscreenRef.current
      );
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handleUpdateTruck = (
    id: string,
    updates: Partial<Truck>
  ): Promise<void> => {
    const currentTruck = trucksRef.current.find(truck => truck.id === id);
    if (!currentTruck) return Promise.resolve();

    const optimisticTruck = { ...currentTruck, ...updates };
    trucksRef.current = trucksRef.current.map(truck =>
      truck.id === id ? optimisticTruck : truck
    );
    setTrucks(trucksRef.current);

    const queuedUpdate = updateQueueRef.current.then(async () => {
      try {
        await updateTruckInSheets(id, updates, currentTruck);
        setSheetError(null);
      } catch (error) {
        console.error('Failed to update sheet:', error);
        setSheetError(
          error instanceof Error ? error.message : 'Failed to update truck data'
        );
        await loadData();
        throw error;
      }
    });

    updateQueueRef.current = queuedUpdate.catch(() => undefined);
    return queuedUpdate;
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
  const allDockFiltersSelected = DOCK_FILTERS
    .filter((filter): filter is Exclude<DockFilter, 'ALL'> => filter !== 'ALL')
    .every(filter => selectedDockFilters.includes(filter));

  const toggleDockFilter = (filter: DockFilter) => {
    if (filter === 'ALL') {
      setSelectedDockFilters(
        allDockFiltersSelected ? [] : ['M1', 'L1', 'L2', 'R1', 'R2']
      );
      return;
    }

    setSelectedDockFilters(current =>
      current.includes(filter)
        ? current.filter(item => item !== filter)
        : [...current, filter]
    );
  };

  const getActionReasonOptions = (dropPoint?: string): string[] => {
    const dockGroup = getDockGroup(dropPoint);
    if (dockGroup === 'L1' || dockGroup === 'L2') {
      return ['LSP ไม่มีงานลง', 'LSP งานไม่พร้อม', 'LSP ช่องลงงานไม่พร้อม', 'อื่น ๆ'];
    }
    if (dockGroup === 'R1' || dockGroup === 'R2') {
      return ['Free ไม่มีงานลง', 'Free งานไม่พร้อม', 'Free ช่องลงงานไม่พร้อม', 'อื่น ๆ'];
    }
    return ['ไม่มีงานลง', 'งานไม่พร้อม', 'ช่องลงงานไม่พร้อม', 'อื่น ๆ'];
  };

  const handleConfirmWorkDetail = async () => {
    const selectedTruck = workDetailTruck;
    if (!selectedTruck || isConfirmingWorkDetail) return;
    setIsConfirmingWorkDetail(true);
    try {
      await confirmWorkDetail(selectedTruck.id);
      trucksRef.current = trucksRef.current.map(truck =>
        truck.id === selectedTruck.id
          ? { ...truck, workDetailConfirmed: true }
          : truck
      );
      setTrucks(trucksRef.current);
      setWorkDetailTruck(null);
      setSheetError(null);
    } catch (error) {
      console.error('Failed to confirm Work Detail:', error);
      setSheetError(
        error instanceof Error
          ? error.message
          : 'ไม่สามารถยืนยันรายละเอียดงานได้'
      );
    } finally {
      setIsConfirmingWorkDetail(false);
    }
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
    const query = dashboardSearch.trim().toLowerCase();
    return inboundTrucks
      .filter(shouldShowTruck)
      .filter(truck => selectedDockFilters.includes(getDockGroup(truck.dropPoint)))
      .filter(truck => {
        if (!query) return true;
        return [
          truck.route,
          truck.licensePlate,
          truck.supplierName,
          truck.dropPoint,
          truck.workDetail,
        ]
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .sort((first, second) => {
        const timeDifference =
          getPlanEtaSortValue(first.planEta) - getPlanEtaSortValue(second.planEta);
        if (timeDifference !== 0) return timeDifference;
        return String(first.route || '').localeCompare(String(second.route || ''), 'en');
      });
  }, [inboundTrucks, showHiddenRows, selectedDockFilters, dashboardSearch]);

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
                <div className="mb-3 flex shrink-0 flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm sm:flex-row sm:items-center">
                  <div>
                    <h2 className="text-xl font-bold tracking-tight text-slate-800">
                      Live Dashboard
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Real-Time Truck Status Monitoring
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void toggleDashboardFullscreen()}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 shadow-sm hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700"
                  >
                    {isDashboardFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                    {isDashboardFullscreen ? 'EXIT FULL SCREEN' : 'FULL SCREEN'}
                  </button>
                </div>
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
                        onClick={() => toggleDockFilter(option)}
                        className={`rounded-md border px-3 py-1 text-[9px] font-bold transition-colors ${
                          option === 'ALL' ? allDockFiltersSelected : selectedDockFilters.includes(option)
                            ? option === 'ALL'
                              ? 'border-slate-800 bg-slate-800 text-white'
                              : 'border-blue-700 bg-blue-600 text-white shadow-sm'
                            : 'border-slate-300 bg-white text-slate-500 hover:bg-slate-100'
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                    <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
                      <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <input
                        type="search"
                        value={dashboardSearch}
                        onChange={event => setDashboardSearch(event.target.value)}
                        placeholder="ค้นหา Route, ทะเบียนรถ..."
                        className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-[11px] text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <label className="flex cursor-pointer items-center gap-1.5 text-[10px] text-slate-600">
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
                    </div>
                  </div>

                  <div className="flex-1 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        <tr>
                          {['Route', 'สังกัด', 'ทะเบียนรถ', 'จุดลงงาน', 'รายละเอียดงาน', 'Plan ETA', 'Actual ETA', 'Actual ETD', 'Status', 'GPS พิกัด', 'Action'].map((heading) => (
                            <th key={heading} className="whitespace-nowrap px-3 py-2">{heading}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {paginatedTrucks.length === 0 ? (
                          <tr><td colSpan={11} className="px-6 py-8 text-center text-slate-500">No trucks found matching your criteria.</td></tr>
                        ) : paginatedTrucks.map((truck) => (
                          <tr key={truck.id} className={`${getRowClass(truck)} border-b border-slate-100/50`}>
                            <td className="whitespace-nowrap px-3 py-1.5 font-mono font-bold text-slate-800">{truck.route}</td>
                            <td className="whitespace-nowrap px-3 py-1.5 font-medium text-slate-700">{truck.supplierName || '-'}</td>
                            <td className="whitespace-nowrap px-3 py-1.5 font-bold text-slate-800">{truck.licensePlate}</td>
                            <td className="whitespace-nowrap px-3 py-1.5 font-medium text-slate-700">{truck.dropPoint}</td>
                            <td className="px-3 py-1.5 text-center">
                              {truck.workDetail && !truck.workDetailConfirmed ? (
                                <button
                                  type="button"
                                  onClick={() => setWorkDetailTruck(truck)}
                                  title="เปิดรายละเอียดงาน"
                                  aria-label={`เปิดรายละเอียดงาน ${truck.route}`}
                                  className="inline-flex h-9 w-9 animate-pulse items-center justify-center rounded-lg border-2 border-amber-600 bg-yellow-300 text-amber-950 shadow-sm transition hover:bg-yellow-400 active:scale-95"
                                >
                                  <AlertTriangle className="h-5 w-5" />
                                </button>
                              ) : (
                                <span className="text-slate-300">-</span>
                              )}
                            </td>
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
                              <button type="button" onClick={() => handleOpenGps(truck.id)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border-2 border-red-800 bg-red-700 text-white shadow-sm transition hover:bg-red-800 active:scale-95">
                                <MapPin className="h-5 w-5" />
                              </button>
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              <button type="button" onClick={() => setActionDialog({ isOpen: true, truck })} className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border-2 text-white shadow-sm transition active:scale-95 ${truck.actionProblem ? 'border-red-900 bg-red-700 hover:bg-red-800' : 'border-amber-700 bg-amber-500 hover:bg-amber-600'}`}>
                                <MessageSquare className="h-5 w-5" />
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

      {workDetailTruck &&
        createPortal(
          <div
            className="fixed inset-0 z-[1450] flex items-center justify-center bg-slate-950/70 p-4"
            onMouseDown={event => {
              if (event.target === event.currentTarget && !isConfirmingWorkDetail) {
                setWorkDetailTruck(null);
              }
            }}
          >
            <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="flex items-start justify-between gap-4 border-b border-amber-200 bg-yellow-50 px-6 py-5">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl border border-amber-400 bg-yellow-300 p-3 text-amber-950">
                    <AlertTriangle className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">รายละเอียดงาน</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      {workDetailTruck.route} · {workDetailTruck.licensePlate} · {workDetailTruck.dropPoint}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isConfirmingWorkDetail}
                  onClick={() => setWorkDetailTruck(null)}
                  className="rounded-lg p-2 text-slate-500 hover:bg-amber-100 disabled:opacity-50"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-6">
                <div className="max-h-[55vh] overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 p-5 text-base leading-7 text-slate-800">
                  {workDetailTruck.workDetail}
                </div>
                <p className="mt-4 text-sm text-slate-500">
                  กรุณาตรวจสอบว่าดำเนินการตามรายละเอียดครบถ้วนก่อนกดยืนยัน
                </p>
                <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    disabled={isConfirmingWorkDetail}
                    onClick={() => setWorkDetailTruck(null)}
                    className="rounded-xl bg-slate-100 px-6 py-3 font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                  >
                    ปิด
                  </button>
                  <button
                    type="button"
                    disabled={isConfirmingWorkDetail}
                    onClick={() => void handleConfirmWorkDetail()}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isConfirmingWorkDetail ? (
                      <RefreshCw className="h-5 w-5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-5 w-5" />
                    )}
                    {isConfirmingWorkDetail ? 'กำลังยืนยัน...' : 'ยืนยันดำเนินการแล้ว'}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          isDashboardFullscreen && dashboardFullscreenRef.current
            ? dashboardFullscreenRef.current
            : document.body
        )}
      {actionDialog.isOpen &&
        actionDialog.truck &&
        createPortal(
          <div
            className="fixed inset-0 z-[1400] flex items-center justify-center bg-slate-950/70 p-3 sm:p-6"
            onMouseDown={event => {
              if (event.target === event.currentTarget) {
                setActionDialog({ isOpen: false, truck: null });
              }
            }}
          >
            <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-6 py-5">
                <div>
                  <h3 className="flex items-center gap-2 text-xl font-bold text-slate-800">
                    <MessageSquare className="h-6 w-6 text-amber-600" />
                    Update Problem
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {actionDialog.truck.route} · {actionDialog.truck.licensePlate} · {actionDialog.truck.dropPoint}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActionDialog({ isOpen: false, truck: null })}
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-200"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <form
                className="overflow-y-auto p-6"
                onSubmit={event => {
                  event.preventDefault();
                  const formData = new FormData(event.currentTarget);
                  const reason = String(formData.get('reason') || '').trim();
                  const detail = String(formData.get('detail') || '').trim();
                  const problem = [reason, detail].filter(Boolean).join(' : ');
                  const selectedTruck = actionDialog.truck;
                  if (selectedTruck && problem) {
                    void handleUpdateTruck(selectedTruck.id, {
                      actionProblem: problem,
                      actionStatus: 'OPEN',
                    });
                  }
                  setActionDialog({ isOpen: false, truck: null });
                }}
              >
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-bold uppercase text-slate-400">Route</p>
                    <p className="mt-1 font-bold text-slate-800">{actionDialog.truck.route}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-bold uppercase text-slate-400">ทะเบียนรถ</p>
                    <p className="mt-1 font-bold text-slate-800">{actionDialog.truck.licensePlate}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-bold uppercase text-slate-400">จุดลงงาน</p>
                    <p className="mt-1 font-bold text-slate-800">{actionDialog.truck.dropPoint || '-'}</p>
                  </div>
                </div>
                <label className="mt-5 block text-sm font-bold text-slate-700">
                  เหตุผล
                  <select
                    name="reason"
                    required
                    defaultValue=""
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                  >
                    <option value="" disabled>เลือกเหตุผล</option>
                    {getActionReasonOptions(actionDialog.truck.dropPoint).map(reason => (
                      <option key={reason} value={reason}>{reason}</option>
                    ))}
                  </select>
                </label>
                <label className="mt-5 block text-sm font-bold text-slate-700">
                  รายละเอียดเพิ่มเติม
                  <textarea
                    name="detail"
                    defaultValue={actionDialog.truck.actionProblem || ''}
                    className="mt-2 w-full resize-y rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                    rows={7}
                    placeholder="ระบุรายละเอียดเพิ่มเติม..."
                  />
                </label>
                <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setActionDialog({ isOpen: false, truck: null })}
                    className="rounded-xl bg-slate-100 px-6 py-3 font-bold text-slate-700 hover:bg-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-xl bg-amber-600 px-6 py-3 font-bold text-white hover:bg-amber-700"
                  >
                    Save Problem
                  </button>
                </div>
              </form>
            </div>
          </div>,
          isDashboardFullscreen && dashboardFullscreenRef.current
            ? dashboardFullscreenRef.current
            : document.body
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
