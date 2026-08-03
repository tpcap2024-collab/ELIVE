import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  mockTrucks,
} from './data';

import {
  LiveMap,
} from './components/LiveMap';

import {
  WarehouseStamp,
} from './components/WarehouseStamp';

import {
  PlatformDiagram,
} from './components/PlatformDiagram';

import {
  IncidentCenter,
} from './components/IncidentCenter';

import {
  StatusBadge,
} from './components/StatusBadge';

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
  Clock,
  LayoutDashboard,
  Map,
  MapPin,
  Menu,
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
  | 'incident';

interface ActionDialogState {
  isOpen: boolean;
  truck: Truck | null;
}

const ROWS_PER_PAGE =
  20;

const REFRESH_INTERVAL =
  60000;

function normalizeLicensePlate(
  value?: string
): string {
  return String(
    value || ''
  )
    .split('(')[0]
    .replace(
      /[\s-]/g,
      ''
    )
    .trim()
    .toUpperCase();
}

export default function App() {
  const [
    trucks,
    setTrucks,
  ] = useState<Truck[]>(
    mockTrucks
  );

  const [
    gpsLocations,
    setGpsLocations,
  ] = useState<GpsLocation[]>(
    []
  );

  const [
    currentView,
    setCurrentView,
  ] = useState<CurrentView>(
    'dashboard'
  );

  const [
    selectedGpsTruckId,
    setSelectedGpsTruckId,
  ] = useState<string | null>(
    null
  );

  const [
    selectedDate,
    setSelectedDate,
  ] = useState('');

  const [
    isSidebarOpen,
    setIsSidebarOpen,
  ] = useState(
    window.innerWidth >= 768
  );

  const [
    lastUpdate,
    setLastUpdate,
  ] = useState('-');

  const [
    actionDialog,
    setActionDialog,
  ] = useState<ActionDialogState>({
    isOpen: false,
    truck: null,
  });

  const [
    showSettings,
    setShowSettings,
  ] = useState(false);

  const [
    appsScriptUrl,
    setAppsScriptUrl,
  ] = useState(
    getAppsScriptUrl()
  );

  const [
    showHiddenRows,
    setShowHiddenRows,
  ] = useState(false);

  const [
    currentPage,
    setCurrentPage,
  ] = useState(1);

  const [
    sheetError,
    setSheetError,
  ] = useState<string | null>(
    null
  );

  const [
    isRefreshing,
    setIsRefreshing,
  ] = useState(false);

  const [
    hasLoadedSuccessfully,
    setHasLoadedSuccessfully,
  ] = useState(false);

  const [
    appLoginUser,
    setAppLoginUser,
  ] = useState('');

  const [
    appLoginPw,
    setAppLoginPw,
  ] = useState('');

  const [
    isAppLoggedIn,
    setIsAppLoggedIn,
  ] = useState(
    localStorage.getItem(
      'isAppLoggedIn'
    ) === 'true'
  );

  const requestRunningRef =
    useRef(false);

  const loadData =
    useCallback(
      async () => {
        if (
          requestRunningRef.current
        ) {
          return;
        }

        requestRunningRef.current =
          true;

        setIsRefreshing(
          true
        );

        try {
          const data =
            await fetchEliveDashboardData();

          if (
            data.trucks.length > 0
          ) {
            setTrucks(
              data.trucks
            );
          }

          setGpsLocations(
            data.gpsLocations
          );

          setLastUpdate(
            new Date()
              .toLocaleTimeString(
                'en-GB',
                {
                  timeZone:
                    'Asia/Bangkok',

                  hour:
                    '2-digit',

                  minute:
                    '2-digit',

                  second:
                    '2-digit',

                  hour12:
                    false,
                }
              )
          );

          setSheetError(
            null
          );

          setHasLoadedSuccessfully(
            true
          );
        } catch (error) {
          console.error(
            'Failed to fetch ELIVE data:',
            error
          );

          const message =
            error instanceof Error
              ? error.message
              : 'Failed to fetch ELIVE data';

          setSheetError(
            message
          );
        } finally {
          requestRunningRef.current =
            false;

          setIsRefreshing(
            false
          );
        }
      },
      []
    );

  useEffect(() => {
    if (!isAppLoggedIn) {
      return;
    }

    loadData();

    const intervalId =
      window.setInterval(
        loadData,
        REFRESH_INTERVAL
      );

    return () => {
      window.clearInterval(
        intervalId
      );
    };
  }, [
    isAppLoggedIn,
    loadData,
  ]);

  useEffect(() => {
    setCurrentPage(
      1
    );
  }, [
    selectedDate,
    showHiddenRows,
  ]);

  const handleUpdateTruck =
    async (
      id: string,
      updates: Partial<Truck>
    ) => {
      const currentTruck =
        trucks.find(
          truck =>
            truck.id === id
        );

      if (!currentTruck) {
        return;
      }

      setTrucks(
        previousTrucks =>
          previousTrucks.map(
            truck =>
              truck.id === id
                ? {
                    ...truck,
                    ...updates,
                  }
                : truck
          )
      );

      try {
        await updateTruckInSheets(
          id,
          updates,
          currentTruck
        );

        await loadData();
      } catch (error) {
        console.error(
          'Failed to update sheet:',
          error
        );

        const message =
          error instanceof Error
            ? error.message
            : 'Failed to update truck data';

        setSheetError(
          message
        );
      }
    };

  const handleOpenGps =
    (
      truckId: string
    ) => {
      setSelectedGpsTruckId(
        truckId
      );

      setCurrentView(
        'map'
      );

      if (
        window.innerWidth < 768
      ) {
        setIsSidebarOpen(
          false
        );
      }
    };

  const handleOpenMapMenu =
    () => {
      setSelectedGpsTruckId(
        null
      );

      setCurrentView(
        'map'
      );

      if (
        window.innerWidth < 768
      ) {
        setIsSidebarOpen(
          false
        );
      }
    };

  const closeSidebarOnMobile =
    () => {
      if (
        window.innerWidth < 768
      ) {
        setIsSidebarOpen(
          false
        );
      }
    };

  const formattedSelectedDate =
    useMemo(() => {
      if (!selectedDate) {
        return '';
      }

      return selectedDate
        .trim()
        .slice(
          0,
          10
        );
    }, [
      selectedDate,
    ]);

  const filteredTrucks =
    useMemo(() => {
      if (
        !formattedSelectedDate
      ) {
        return [];
      }

      return trucks.filter(
        truck => {
          const truckPlanDate =
            String(
              truck.planDate || ''
            )
              .trim()
              .slice(
                0,
                10
              );

          return (
            truckPlanDate ===
            formattedSelectedDate
          );
        }
      );
    }, [
      trucks,
      formattedSelectedDate,
    ]);

  const filteredGpsLocations =
    useMemo(() => {
      if (
        filteredTrucks.length === 0 ||
        gpsLocations.length === 0
      ) {
        return [];
      }

      const planLicensePlates =
        new Set<string>();

      for (
        const truck of filteredTrucks
      ) {
        const normalizedPlate =
          normalizeLicensePlate(
            truck.licensePlate
          );

        if (normalizedPlate) {
          planLicensePlates.add(
            normalizedPlate
          );
        }
      }

      return gpsLocations.filter(
        location => {
          const normalizedPlate =
            normalizeLicensePlate(
              location.licensePlate
            );

          return (
            normalizedPlate !== '' &&
            planLicensePlates.has(
              normalizedPlate
            )
          );
        }
      );
    }, [
      filteredTrucks,
      gpsLocations,
    ]);

  const stats =
    useMemo(() => {
      return {
        total:
          filteredTrucks.length,

        unloading:
          filteredTrucks.filter(
            truck =>
              truck.status ===
                'DOCK_IN' ||
              truck.status ===
                'UNLOADING' ||
              truck.status ===
                'UNLOADING_AT_TPCAP'
          ).length,

        complete:
          filteredTrucks.filter(
            truck =>
              truck.status ===
                'COMPLETED' ||
              truck.status ===
                'TRUCK_OUT'
          ).length,

        remain:
          filteredTrucks.filter(
            truck =>
              truck.status !==
                'COMPLETED' &&
              truck.status !==
                'TRUCK_OUT'
          ).length,
      };
    }, [
      filteredTrucks,
    ]);

  const isDelayedNoStamp =
    (
      truck: Truck
    ): boolean => {
      if (
        truck.stampEta ||
        truck.actualEta
      ) {
        return false;
      }

      if (
        !truck.planDate ||
        !truck.planEta ||
        truck.planEta === '-'
      ) {
        return false;
      }

      const planDate =
        String(
          truck.planDate
        )
          .trim()
          .slice(
            0,
            10
          );

      const planEta =
        String(
          truck.planEta
        )
          .trim()
          .slice(
            0,
            5
          );

      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(
          planDate
        ) ||
        !/^\d{1,2}:\d{2}$/.test(
          planEta
        )
      ) {
        return false;
      }

      const plannedEta =
        new Date(
          `${planDate}T${planEta}:00+07:00`
        );

      if (
        Number.isNaN(
          plannedEta.getTime()
        )
      ) {
        return false;
      }

      return (
        Date.now() >=
        plannedEta.getTime()
      );
    };

  const getRowClass =
    (
      truck: Truck
    ): string => {
      if (
        truck.status ===
          'COMPLETED' ||
        truck.status ===
          'TRUCK_OUT'
      ) {
        return 'row-complete';
      }

      if (
        isDelayedNoStamp(
          truck
        )
      ) {
        return [
          'animate-pulse',
          'bg-red-100',
          'hover:bg-red-200',
          'transition-colors',
        ].join(' ');
      }

      if (
        truck.performanceStatus ===
        'DELAY'
      ) {
        return 'row-delay';
      }

      if (
        truck.performanceStatus ===
        'WARNING'
      ) {
        return 'row-warning';
      }

      return [
        'hover:bg-slate-50',
        'transition-colors',
      ].join(' ');
    };

  const getPerformanceBadge =
    (
      status: PerformanceStatus
    ) => {
      switch (status) {
        case 'EARLY':
          return (
            <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
              EARLY
            </span>
          );

        case 'ON_PLAN':
          return (
            <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
              ON PLAN
            </span>
          );

        case 'DELAY':
          return (
            <span className="animate-pulse rounded bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
              DELAY
            </span>
          );

        case 'WARNING':
          return (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
              WARNING
            </span>
          );

        default:
          return null;
      }
    };

  const shouldShowTruck =
    (
      truck: Truck
    ): boolean => {
      if (showHiddenRows) {
        return true;
      }

      if (
        truck.status !==
          'COMPLETED' &&
        truck.status !==
          'TRUCK_OUT'
      ) {
        return true;
      }

      if (!truck.stampEtd) {
        return true;
      }

      const stampParts =
        truck.stampEtd
          .split(':')
          .map(Number);

      const hours =
        stampParts[0];

      const minutes =
        stampParts[1];

      if (
        Number.isNaN(hours) ||
        Number.isNaN(minutes)
      ) {
        return true;
      }

      const now =
        new Date();

      const etdDate =
        new Date(now);

      etdDate.setHours(
        hours,
        minutes,
        0,
        0
      );

      const differenceMs =
        now.getTime() -
        etdDate.getTime();

      return (
        differenceMs <=
        600000
      );
    };

  const visibleTrucks =
    useMemo(() => {
      return filteredTrucks.filter(
        shouldShowTruck
      );
    }, [
      filteredTrucks,
      showHiddenRows,
    ]);

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        visibleTrucks.length /
        ROWS_PER_PAGE
      )
    );

  const pageStartIndex =
    Math.imul(
      currentPage - 1,
      ROWS_PER_PAGE
    );

  const pageEndIndex =
    Math.imul(
      currentPage,
      ROWS_PER_PAGE
    );

  const paginatedTrucks =
    visibleTrucks.slice(
      pageStartIndex,
      pageEndIndex
    );

  useEffect(() => {
    if (
      currentPage >
      totalPages
    ) {
      setCurrentPage(
        1
      );
    }
  }, [
    currentPage,
    totalPages,
  ]);

  const handleAppLogin =
    async (
      event: React.FormEvent
    ) => {
      event.preventDefault();

      if (
        appLoginUser === 'TTKA' &&
        appLoginPw === '1234'
      ) {
        setIsAppLoggedIn(
          true
        );

        localStorage.setItem(
          'isAppLoggedIn',
          'true'
        );

        return;
      }

      alert(
        'Invalid Username or Password'
      );
    };

  if (!isAppLoggedIn) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 font-sans">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600">
            <span className="text-3xl font-bold italic text-white">
              E
            </span>
          </div>

          <h1 className="mb-2 text-center text-2xl font-bold tracking-tight text-slate-800">
            ELIVE Login
          </h1>

          <p className="mb-6 text-center text-sm text-slate-500">
            Sign in to access your dashboard
          </p>

          <form
            onSubmit={
              handleAppLogin
            }
            className="space-y-4"
          >
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Username
              </label>

              <input
                type="text"
                value={
                  appLoginUser
                }
                onChange={
                  event =>
                    setAppLoginUser(
                      event.target.value
                    )
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter username"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Password
              </label>

              <input
                type="password"
                value={
                  appLoginPw
                }
                onChange={
                  event =>
                    setAppLoginPw(
                      event.target.value
                    )
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter password"
              />
            </div>

            <button
              type="submit"
              className="mt-4 w-full rounded-xl bg-blue-600 px-4 py-2.5 font-bold text-white transition-colors hover:bg-blue-700"
            >
              Sign In
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 font-sans md:flex-row">
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white p-4 md:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
            <span className="text-lg font-bold italic text-white">
              E
            </span>
          </div>

          <span className="text-xl font-bold tracking-tight text-slate-800">
            ELIVE
          </span>
        </div>

        <button
          type="button"
          onClick={() =>
            setIsSidebarOpen(
              !isSidebarOpen
            )
          }
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{
              width: 0,
              opacity: 0,
            }}
            animate={{
              width: 256,
              opacity: 1,
            }}
            exit={{
              width: 0,
              opacity: 0,
            }}
            className="fixed left-0 top-0 z-30 flex h-screen shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white text-slate-600 md:sticky"
          >
            <div className="hidden w-64 shrink-0 items-center gap-3 border-b border-slate-200 p-6 md:flex">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600">
                <span className="text-lg font-bold italic text-white">
                  E
                </span>
              </div>

              <span className="whitespace-nowrap text-xl font-bold tracking-tight text-slate-800">
                ELIVE
              </span>
            </div>

            <div className="flex w-64 shrink-0 items-center justify-between border-b border-slate-200 p-4 md:hidden">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600">
                  <span className="text-lg font-bold italic text-white">
                    E
                  </span>
                </div>

                <span className="whitespace-nowrap text-xl font-bold tracking-tight text-slate-800">
                  ELIVE
                </span>
              </div>

              <button
                type="button"
                onClick={() =>
                  setIsSidebarOpen(
                    false
                  )
                }
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="w-64 flex-1 space-y-1 px-4 py-6">
              <button
                type="button"
                onClick={() => {
                  setCurrentView(
                    'dashboard'
                  );

                  closeSidebarOnMobile();
                }}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  currentView ===
                  'dashboard'
                    ? 'bg-blue-50 font-semibold text-blue-600'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
              >
                <LayoutDashboard className="h-5 w-5" />
                Live Dashboard
              </button>

              <button
                type="button"
                onClick={() => {
                  setCurrentView(
                    'diagram'
                  );

                  closeSidebarOnMobile();
                }}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  currentView ===
                  'diagram'
                    ? 'bg-blue-50 font-semibold text-blue-600'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
              >
                <Network className="h-5 w-5" />
                Platform Dashboard
              </button>

              <button
                type="button"
                onClick={() => {
                  setCurrentView(
                    'warehouse'
                  );

                  closeSidebarOnMobile();
                }}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  currentView ===
                  'warehouse'
                    ? 'bg-blue-50 font-semibold text-blue-600'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
              >
                <TabletSmartphone className="h-5 w-5" />
                Stamp ETA/ETD
              </button>

              <button
                type="button"
                onClick={
                  handleOpenMapMenu
                }
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  currentView ===
                  'map'
                    ? 'bg-blue-50 font-semibold text-blue-600'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
              >
                <Map className="h-5 w-5" />
                Live Map
              </button>

              <button
                type="button"
                onClick={() => {
                  setCurrentView(
                    'incident'
                  );

                  closeSidebarOnMobile();
                }}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  currentView ===
                  'incident'
                    ? 'bg-red-50 font-semibold text-red-600'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
              >
                <ShieldAlert className="h-5 w-5" />
                Action Center
              </button>
            </nav>

            <div className="w-64 border-t border-slate-100 p-4">
              <button
                type="button"
                onClick={() =>
                  setShowSettings(
                    true
                  )
                }
                className="mb-1 flex w-full items-center gap-3 px-3 py-2 text-sm text-slate-500 transition-colors hover:text-slate-700"
              >
                <Settings className="h-5 w-5" />
                Settings
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsAppLoggedIn(
                    false
                  );

                  localStorage.removeItem(
                    'isAppLoggedIn'
                  );
                }}
                className="flex w-full items-center gap-3 px-3 py-2 text-sm text-red-500 transition-colors hover:text-red-700"
              >
                <X className="h-5 w-5" />
                Sign Out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-slate-900/50 backdrop-blur-sm md:hidden"
          onClick={() =>
            setIsSidebarOpen(
              false
            )
          }
        />
      )}

      <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <div className="flex flex-1 items-center gap-4">
            <button
              type="button"
              onClick={() =>
                setIsSidebarOpen(
                  !isSidebarOpen
                )
              }
              className="hidden items-center justify-center rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 md:flex"
            >
              <Menu className="h-5 w-5" />
            </button>

            <h1 className="hidden text-xl font-bold tracking-tight text-slate-800 md:block">
              Real-Time Truck Status Monitoring
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <input
              type="date"
              value={
                selectedDate
              }
              onChange={
                event =>
                  setSelectedDate(
                    event.target.value
                  )
              }
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />

            <div className="flex items-center space-x-4 border-l border-slate-200 pl-4">
              <div className="hidden text-right sm:block">
                <p className="text-xs leading-none text-slate-400">
                  Last Update
                </p>

                <p className="font-mono text-sm text-slate-600">
                  {lastUpdate}
                </p>
              </div>

              <button
                type="button"
                onClick={
                  loadData
                }
                disabled={
                  isRefreshing
                }
                className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                title="Refresh data"
              >
                <RefreshCw
                  className={`h-5 w-5 ${
                    isRefreshing
                      ? 'animate-spin'
                      : ''
                  }`}
                />
              </button>

              <button
                type="button"
                className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200"
              >
                <Bell className="h-5 w-5" />

                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
              </button>

              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-slate-200 text-xs font-medium text-slate-600">
                OP
              </div>
            </div>
          </div>
        </header>

        {sheetError && (
          <div className="z-10 flex shrink-0 items-center gap-3 border-b border-amber-200 bg-amber-50 px-6 py-3 text-sm text-amber-800">
            <AlertTriangle className="h-5 w-5 shrink-0" />

            <div>
              <span className="font-bold">
                การอัปเดตล่าสุดไม่สำเร็จ:
              </span>{' '}
              {sheetError}

              {hasLoadedSuccessfully && (
                <span className="ml-2">
                  กำลังแสดงข้อมูลรอบล่าสุดที่โหลดสำเร็จ
                </span>
              )}
            </div>
          </div>
        )}

        {!selectedDate ? (
          <main className="flex flex-1 items-center justify-center overflow-auto p-4 md:p-6 lg:p-8">
            <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-blue-500">
                <Search className="h-8 w-8" />
              </div>

              <h2 className="mb-2 text-xl font-bold text-slate-800">
                Select a Date
              </h2>

              <p className="text-sm text-slate-500">
                Please select a date from the top right corner to view tracking data.
              </p>
            </div>
          </main>
        ) : (
          <>
            {currentView ===
              'dashboard' && (
              <main className="flex flex-1 flex-col overflow-auto p-4 md:p-6 lg:p-8">
                <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
                  <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <TruckIcon className="h-3.5 w-3.5" />
                      Total Truck
                    </p>

                    <h3 className="text-2xl font-bold text-slate-800">
                      {stats.total}
                    </h3>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <Package className="h-3.5 w-3.5 text-purple-500" />
                      Unloading
                    </p>

                    <h3 className="text-2xl font-bold text-slate-800">
                      {stats.unloading}
                    </h3>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      Complete
                    </p>

                    <h3 className="text-2xl font-bold text-slate-800">
                      {stats.complete}
                    </h3>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <Clock className="h-3.5 w-3.5 text-amber-500" />
                      Remain
                    </p>

                    <h3 className="text-2xl font-bold text-slate-800">
                      {stats.remain}
                    </h3>
                  </div>
                </div>

                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-200 bg-slate-50 p-4">
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={
                          showHiddenRows
                        }
                        onChange={
                          event =>
                            setShowHiddenRows(
                              event.target.checked
                            )
                        }
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />

                      Show completed/out trucks
                    </label>
                  </div>

                  <div className="flex-1 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="px-4 py-3">
                            Route
                          </th>

                          <th className="px-4 py-3">
                            ทะเบียนรถ
                          </th>

                          <th className="px-4 py-3">
                            จุดลงงาน
                          </th>

                          <th className="px-4 py-3">
                            Plan ETA
                          </th>

                          <th className="px-4 py-3">
                            Actual ETA
                          </th>

                          <th className="px-4 py-3">
                            Actual ETD
                          </th>

                          <th className="px-4 py-3">
                            Status
                          </th>

                          <th className="px-4 py-3 text-center">
                            GPS พิกัด
                          </th>

                          <th className="px-4 py-3 text-center">
                            Action
                          </th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-slate-100">
                        {paginatedTrucks.length ===
                        0 ? (
                          <tr>
                            <td
                              colSpan={
                                9
                              }
                              className="px-6 py-8 text-center text-slate-500"
                            >
                              No trucks found matching your criteria.
                            </td>
                          </tr>
                        ) : (
                          paginatedTrucks.map(
                            truck => (
                              <tr
                                key={
                                  truck.id
                                }
                                className={`${getRowClass(
                                  truck
                                )} border-b border-slate-100/50 transition-colors hover:bg-slate-50/50`}
                              >
                                <td className="px-2 py-1">
                                  <span className="font-mono font-medium text-slate-600">
                                    {truck.route}
                                  </span>
                                </td>

                                <td className="px-2 py-1">
                                  <div className="font-bold text-slate-800">
                                    {
                                      truck.licensePlate
                                    }
                                  </div>

                                  <div className="text-xs text-slate-500">
                                    {
                                      truck.supplierName
                                    }
                                  </div>
                                </td>

                                <td className="px-2 py-1 font-medium text-slate-700">
                                  {
                                    truck.dropPoint
                                  }
                                </td>

                                <td className="px-2 py-1 font-mono text-sm text-slate-600">
                                  {truck.planEta ||
                                    '-'}
                                </td>

                                <td className="px-2 py-1 font-mono text-sm">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={
                                        truck.performanceStatus ===
                                        'DELAY'
                                          ? 'font-bold text-red-600'
                                          : 'text-slate-800'
                                      }
                                    >
                                      {truck.stampEta ||
                                        truck.actualEta ||
                                        '-'}
                                    </span>

                                    {getPerformanceBadge(
                                      truck.performanceStatus
                                    )}
                                  </div>
                                </td>

                                <td className="px-2 py-1 font-mono text-sm text-slate-600">
                                  {truck.stampEtd ||
                                    '-'}
                                </td>

                                <td className="px-2 py-1">
                                  <StatusBadge
                                    status={
                                      truck.status
                                    }
                                  />
                                </td>

                                <td className="px-2 py-1 text-center">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleOpenGps(
                                        truck.id
                                      )
                                    }
                                    className="inline-flex items-center justify-center rounded-full border border-blue-100 bg-blue-50 p-1.5 text-blue-600 transition-colors hover:bg-blue-100 hover:text-blue-700"
                                    title={`View ${truck.licensePlate} on map`}
                                  >
                                    <MapPin className="h-4 w-4" />
                                  </button>
                                </td>

                                <td className="px-2 py-1">
                                  <div className="flex items-center justify-center gap-2">
                                    {truck.actionProblem && (
                                      <span
                                        className="max-w-[120px] truncate rounded bg-red-50 px-2 py-1 text-xs text-red-600"
                                        title={
                                          truck.actionProblem
                                        }
                                      >
                                        {
                                          truck.actionProblem
                                        }
                                      </span>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() =>
                                        setActionDialog({
                                          isOpen:
                                            true,
                                          truck,
                                        })
                                      }
                                      className={`inline-flex items-center justify-center rounded-full p-1.5 transition-colors hover:bg-slate-100 ${
                                        truck.actionProblem
                                          ? 'text-red-500 hover:text-red-600'
                                          : 'text-slate-400 hover:text-blue-600'
                                      }`}
                                      title="Update Problem"
                                    >
                                      <MessageSquare className="h-4 w-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            )
                          )
                        )}
                      </tbody>
                    </table>
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center justify-between border-t border-slate-200 bg-white p-3 text-sm">
                      <div className="text-slate-500">
                        Showing{' '}
                        {pageStartIndex +
                          1}{' '}
                        to{' '}
                        {Math.min(
                          pageEndIndex,
                          visibleTrucks.length
                        )}{' '}
                        of{' '}
                        {
                          visibleTrucks.length
                        }{' '}
                        entries
                      </div>

                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            setCurrentPage(
                              page =>
                                Math.max(
                                  1,
                                  page - 1
                                )
                            )
                          }
                          disabled={
                            currentPage ===
                            1
                          }
                          className="rounded border border-slate-200 px-3 py-1 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Prev
                        </button>

                        {Array.from(
                          {
                            length:
                              totalPages,
                          },
                          (
                            value,
                            index
                          ) =>
                            index + 1
                        ).map(
                          page => (
                            <button
                              type="button"
                              key={
                                page
                              }
                              onClick={() =>
                                setCurrentPage(
                                  page
                                )
                              }
                              className={`rounded border px-3 py-1 ${
                                currentPage ===
                                page
                                  ? 'border-blue-200 bg-blue-50 font-bold text-blue-600'
                                  : 'border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              {page}
                            </button>
                          )
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            setCurrentPage(
                              page =>
                                Math.min(
                                  totalPages,
                                  page + 1
                                )
                            )
                          }
                          disabled={
                            currentPage ===
                            totalPages
                          }
                          className="rounded border border-slate-200 px-3 py-1 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </main>
            )}

            {currentView ===
              'map' && (
              <main className="flex-1 overflow-hidden bg-slate-50">
                <LiveMap
                  trucks={
                    filteredTrucks
                  }
                  gpsLocations={
                    filteredGpsLocations
                  }
                  initialTruckId={
                    selectedGpsTruckId
                  }
                  onRefresh={
                    loadData
                  }
                  isRefreshing={
                    isRefreshing
                  }
                />
              </main>
            )}

            {currentView ===
              'diagram' && (
              <main className="min-w-0 flex-1 overflow-hidden bg-white">
                <PlatformDiagram
                  trucks={
                    filteredTrucks
                  }
                />
              </main>
            )}

            {currentView ===
              'incident' && (
              <main className="flex-1 overflow-hidden">
                <IncidentCenter
                  trucks={
                    filteredTrucks
                  }
                  onUpdateTruck={
                    handleUpdateTruck
                  }
                />
              </main>
            )}

            {currentView ===
              'warehouse' && (
              <main className="flex-1 overflow-hidden">
                <WarehouseStamp
                  trucks={
                    filteredTrucks
                  }
                  onUpdateTruck={
                    handleUpdateTruck
                  }
                />
              </main>
            )}
          </>
        )}

        <footer className="z-10 flex h-12 shrink-0 items-center justify-between bg-slate-800 px-6 text-xs text-white">
          <div className="flex items-center space-x-4">
            <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold">
              ALERT
            </span>

            <span className="hidden sm:inline">
              System running. Check the warning banner for connection status.
            </span>
          </div>

          <div className="flex items-center space-x-6">
            <span className="hidden italic underline opacity-60 sm:block">
              TPCAP Hub Alpha
            </span>

            <span className="opacity-60">
              © 2026 ELIVE Logistics
            </span>
          </div>
        </footer>
      </div>

      {actionDialog.isOpen &&
        actionDialog.truck && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
              <div className="mb-6 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800">
                  <MessageSquare className="h-5 w-5 text-blue-500" />

                  Update Problem -{' '}
                  {
                    actionDialog
                      .truck
                      .licensePlate
                  }
                </h3>

                <button
                  type="button"
                  onClick={() =>
                    setActionDialog({
                      isOpen:
                        false,
                      truck:
                        null,
                    })
                  }
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form
                onSubmit={
                  event => {
                    event.preventDefault();

                    const formData =
                      new FormData(
                        event.currentTarget
                      );

                    const problem =
                      String(
                        formData.get(
                          'problem'
                        ) || ''
                      );

                    const selectedTruck =
                      actionDialog.truck;

                    if (
                      selectedTruck
                    ) {
                      handleUpdateTruck(
                        selectedTruck.id,
                        {
                          actionProblem:
                            problem,

                          actionStatus:
                            'OPEN',
                        }
                      );
                    }

                    setActionDialog({
                      isOpen:
                        false,

                      truck:
                        null,
                    });
                  }
                }
              >
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    ระบุปัญหา
                  </label>

                  <textarea
                    name="problem"
                    defaultValue={
                      actionDialog
                        .truck
                        .actionProblem ||
                      ''
                    }
                    className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={
                      4
                    }
                    required
                  />
                </div>

                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setActionDialog({
                        isOpen:
                          false,

                        truck:
                          null,
                      })
                    }
                    className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <motion.div
              initial={{
                opacity:
                  0,

                scale:
                  0.95,
              }}
              animate={{
                opacity:
                  1,

                scale:
                  1,
              }}
              exit={{
                opacity:
                  0,

                scale:
                  0.95,
              }}
              className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            >
              <div className="mb-6 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800">
                  <Settings className="h-5 w-5 text-blue-500" />
                  Settings
                </h3>

                <button
                  type="button"
                  onClick={() =>
                    setShowSettings(
                      false
                    )
                  }
                  className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  ELIVE Backend API URL
                </label>

                <input
                  type="text"
                  value={
                    appsScriptUrl
                  }
                  onChange={
                    event =>
                      setAppsScriptUrl(
                        event.target.value
                      )
                  }
                  placeholder="https://elive-api.onrender.com"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                />

                <p className="mt-2 text-xs text-slate-500">
                  Frontend connects to the ELIVE Backend API configured in VITE_API_URL.
                </p>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setShowSettings(
                      false
                    )
                  }
                  className="rounded-lg px-4 py-2 font-medium text-slate-600 transition-colors hover:bg-slate-100"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={() => {
                    localStorage.setItem(
                      'apps_script_url',
                      appsScriptUrl
                    );

                    setShowSettings(
                      false
                    );

                    loadData();
                  }}
                  className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-700"
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
