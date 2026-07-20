import React, { useState, useMemo, useEffect } from 'react';
import { mockTrucks } from './data';
import { LiveMap } from './components/LiveMap';
import { WarehouseStamp } from './components/WarehouseStamp';
import { PlatformDiagram } from './components/PlatformDiagram';
import { Truck, PerformanceStatus, TruckStatus } from './types';
import { getStatusConfig } from './utils';
import { StatusBadge } from './components/StatusBadge';
import { Package, Search, Bell, LayoutDashboard, Truck as TruckIcon, Settings, Menu, Map, Clock, CheckCircle2, AlertTriangle, PlayCircle, MapPin, TabletSmartphone, Network, ShieldAlert, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { IncidentCenter } from './components/IncidentCenter';
import { initAuth, googleSignIn } from './lib/firebase';
import { fetchTrucksFromSheets, updateTruckInSheets } from './lib/sheets';
import type { User } from 'firebase/auth';

const STAGES: TruckStatus[] = [
  'TRAVELING',
  'UNLOADING_AT_TPCAP',
  'WAITING_AREA',
  'DOCK_IN',
  'UNLOADING',
  'COMPLETED'
];

export default function App() {
  const [trucks, setTrucks] = useState<Truck[]>(mockTrucks);
  const [currentView, setCurrentView] = useState<'dashboard' | 'map' | 'warehouse' | 'diagram' | 'incident'>('dashboard');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 768);
  const [lastUpdate, setLastUpdate] = useState(new Date().toLocaleTimeString('en-US', { hour12: false }));
  const [actionDialog, setActionDialog] = useState<{ isOpen: boolean; truck: Truck | null }>({ isOpen: false, truck: null });

  
  const [needsAuth, setNeedsAuth] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  
  const [showHiddenRows, setShowHiddenRows] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const ROWS_PER_PAGE = 20;

  useEffect(() => {
    initAuth(
      (u, token) => {
        setNeedsAuth(false);
        setUser(u);
        loadData();
      },
      () => setNeedsAuth(true)
    );
  }, []);

  const loadData = async () => {
    try {
      const data = await fetchTrucksFromSheets();
      if (data.length > 0) {
        setTrucks(data);
        setLastUpdate(new Date().toLocaleTimeString('en-US', { hour12: false }));
      }
    } catch (err) {
      console.error('Failed to fetch sheets data:', err);
      // Fallback to mock data if there's an error
      setTrucks(mockTrucks);
    }
  };

  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setNeedsAuth(false);
        loadData();
      }
    } catch (err) {
      console.error('Login failed:', err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Simulate 30s updates
  useEffect(() => {
    const interval = setInterval(() => {
      if (!needsAuth) {
        loadData();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [needsAuth]);

  const handleUpdateTruck = async (id: string, updates: Partial<Truck>) => {
    // Optimistic update
    setTrucks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    
    try {
      const truck = trucks.find(t => t.id === id);
      if (truck) {
        await updateTruckInSheets(id, updates, truck);
      }
    } catch (err) {
      console.error("Failed to update sheet:", err);
      // Reload from sheets to correct UI
      loadData();
    }
  };

  const formattedSelectedDate = useMemo(() => {
    if (!selectedDate) return '';
    const [year, month, day] = selectedDate.split('-');
    return `${parseInt(day, 10)}/${parseInt(month, 10)}/${year.slice(-2)}`;
  }, [selectedDate]);

  const filteredTrucks = useMemo(() => {
    if (!selectedDate) return [];
    return trucks.filter(t => t.planDate === formattedSelectedDate);
  }, [trucks, selectedDate, formattedSelectedDate]);

  const stats = {
    total: filteredTrucks.length,
    unloading: filteredTrucks.filter(t => t.status === 'DOCK_IN' || t.status === 'UNLOADING').length,
    complete: filteredTrucks.filter(t => t.status === 'COMPLETED' || t.status === 'TRUCK_OUT').length,
    remain: filteredTrucks.filter(t => t.status !== 'COMPLETED' && t.status !== 'TRUCK_OUT').length,
  };

  const isDelayedNoStamp = (planEta?: string, stampEta?: string, actualEta?: string) => {
    if (stampEta || actualEta) return false;
    if (!planEta || planEta === '-') return false;
    const now = new Date();
    const [hours, minutes] = planEta.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) return false;
    const planDate = new Date(now);
    planDate.setHours(hours, minutes, 0, 0);
    return now.getTime() > planDate.getTime();
  };

  const getRowClass = (truck: Truck) => {
    if (truck.status === 'COMPLETED' || truck.status === 'TRUCK_OUT') return 'row-complete';
    if (isDelayedNoStamp(truck.planEta, truck.stampEta, truck.actualEta)) return 'animate-pulse bg-red-100 hover:bg-red-200 transition-colors';
    if (truck.performanceStatus === 'DELAY') return 'row-delay';
    if (truck.performanceStatus === 'WARNING') return 'row-warning';
    return 'hover:bg-slate-50 transition-colors';
  };

  const getPerformanceBadge = (status: PerformanceStatus) => {
    switch (status) {
      case 'EARLY': return <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold">EARLY</span>;
      case 'ON_PLAN': return <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-bold">ON PLAN</span>;
      case 'DELAY': return <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-[10px] font-bold animate-pulse">DELAY</span>;
      case 'WARNING': return <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[10px] font-bold">WARNING</span>;
    }
  };

  const [appLoginUser, setAppLoginUser] = useState('');
  const [appLoginPw, setAppLoginPw] = useState('');
  const [isAppLoggedIn, setIsAppLoggedIn] = useState(
    localStorage.getItem('isAppLoggedIn') === 'true'
  );

  const handleAppLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (appLoginUser === 'TTKA' && appLoginPw === '1234') {
      setIsAppLoggedIn(true);
      localStorage.setItem('isAppLoggedIn', 'true');
      if (needsAuth) {
        await handleLogin();
      }
    } else {
      alert('Invalid Username or Password');
    }
  };

  if (!isAppLoggedIn) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-sans">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 w-full max-w-sm">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <span className="text-white font-bold text-3xl italic">E</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800 mb-2 text-center">ELIVE Login</h1>
          <p className="text-slate-500 mb-6 text-center text-sm">Sign in to access your dashboard</p>
          
          <form onSubmit={handleAppLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
              <input 
                type="text" 
                value={appLoginUser}
                onChange={e => setAppLoginUser(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter username"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <input 
                type="password" 
                value={appLoginPw}
                onChange={e => setAppLoginPw(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter password"
              />
            </div>
            <button 
              type="submit"
              disabled={isLoggingIn}
              className="w-full bg-blue-600 text-white font-bold py-2.5 px-4 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 mt-4"
            >
              {isLoggingIn ? 'Connecting...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (needsAuth) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-sans">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 text-center max-w-md w-full">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <span className="text-white font-bold text-3xl italic">E</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800 mb-2">Google Sheets Access</h1>
          <p className="text-slate-500 mb-8">Please authorize connection to Google Sheets to continue.</p>
          
          <button 
            onClick={handleLogin}
            disabled={isLoggingIn}
            className="w-full bg-white border border-slate-300 text-slate-700 font-medium py-2.5 px-4 rounded-xl flex items-center justify-center gap-3 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-5 h-5">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
              <path fill="none" d="M0 0h48v48H0z"></path>
            </svg>
            {isLoggingIn ? 'Connecting...' : 'Connect to Google Sheets'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-sans">
      
      {/* Mobile Header */}
      <div className="md:hidden bg-white border-b border-slate-200 p-4 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-lg italic">E</span>
          </div>
          <span className="text-xl font-bold tracking-tight text-slate-800">ELIVE</span>
        </div>
        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg">
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* Sidebar */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 256, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className={`
              fixed md:sticky top-0 left-0 h-screen bg-white text-slate-600 border-r border-slate-200 flex flex-col z-30 shrink-0
              overflow-hidden
            `}
          >
            <div className="p-6 hidden md:flex items-center gap-3 border-b border-slate-200 w-64 shrink-0">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
                <span className="text-white font-bold text-lg italic">E</span>
              </div>
              <span className="text-xl font-bold tracking-tight text-slate-800 whitespace-nowrap">ELIVE</span>
            </div>

            <div className="p-4 md:hidden flex items-center justify-between border-b border-slate-200 w-64 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
                  <span className="text-white font-bold text-lg italic">E</span>
                </div>
                <span className="text-xl font-bold tracking-tight text-slate-800 whitespace-nowrap">ELIVE</span>
              </div>
              <button onClick={() => setIsSidebarOpen(false)} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
            
            <nav className="flex-1 py-6 px-4 space-y-1 w-64">
              <a href="#" onClick={(e) => { e.preventDefault(); setCurrentView('dashboard'); if (window.innerWidth < 768) setIsSidebarOpen(false); }} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${currentView === 'dashboard' ? 'bg-blue-50 text-blue-600 font-semibold' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
                <LayoutDashboard className="w-5 h-5" />
                Live Dashboard
              </a>
              <a href="#" onClick={(e) => { e.preventDefault(); setCurrentView('diagram'); if (window.innerWidth < 768) setIsSidebarOpen(false); }} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${currentView === 'diagram' ? 'bg-blue-50 text-blue-600 font-semibold' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
                <Network className="w-5 h-5" />
                Platform Dashboard
              </a>
              <a href="#" onClick={(e) => { e.preventDefault(); setCurrentView('warehouse'); if (window.innerWidth < 768) setIsSidebarOpen(false); }} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${currentView === 'warehouse' ? 'bg-blue-50 text-blue-600 font-semibold' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
                <TabletSmartphone className="w-5 h-5" />
                Stamp ETA/ETD
              </a>
              <a href="#" onClick={(e) => { e.preventDefault(); setCurrentView('map'); if (window.innerWidth < 768) setIsSidebarOpen(false); }} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${currentView === 'map' ? 'bg-blue-50 text-blue-600 font-semibold' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
                <Map className="w-5 h-5" />
                Live Map
              </a>
              <a href="#" onClick={(e) => { e.preventDefault(); setCurrentView('incident'); if (window.innerWidth < 768) setIsSidebarOpen(false); }} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${currentView === 'incident' ? 'bg-red-50 text-red-600 font-semibold' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
                <ShieldAlert className="w-5 h-5" />
                Action Center
              </a>
            </nav>
            
            <div className="p-4 border-t border-slate-100 w-64">
              <a href="#" className="flex items-center gap-3 px-3 py-2 text-slate-500 hover:text-slate-700 transition-colors text-sm mb-1">
                <Settings className="w-5 h-5" />
                Settings
              </a>
              <button 
                onClick={() => {
                  setIsAppLoggedIn(false);
                  localStorage.removeItem('isAppLoggedIn');
                }}
                className="w-full flex items-center gap-3 px-3 py-2 text-red-500 hover:text-red-700 transition-colors text-sm"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                Sign Out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Overlay for mobile sidebar */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 z-20 md:hidden backdrop-blur-sm"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Topbar */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10 shrink-0">
          <div className="flex-1 flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
              className="hidden md:flex p-2 text-slate-600 hover:bg-slate-100 rounded-lg items-center justify-center transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-xl font-bold tracking-tight text-slate-800 hidden md:block">Real-Time Truck Status Monitoring</h1>
          </div>
          
          <div className="flex items-center gap-4">
            <input 
              type="date" 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            <div className="flex items-center space-x-4 border-l border-slate-200 pl-4">
              <div className="text-right hidden sm:block">
                <p className="text-xs text-slate-400 leading-none">Last Update</p>
                <p className="text-sm font-mono text-slate-600">{lastUpdate}</p>
              </div>
              <button className="relative w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition-colors">
                <Bell className="w-5 h-5" />
                <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white"></span>
              </button>
              
              <div className="w-10 h-10 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center text-slate-600 font-medium text-xs">
                OP
              </div>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        {!selectedDate ? (
          <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8 flex items-center justify-center">
            <div className="text-center p-8 bg-white border border-slate-200 rounded-xl shadow-sm max-w-md w-full">
              <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold text-slate-800 mb-2">Select a Date</h2>
              <p className="text-slate-500 text-sm mb-6">Please select a date from the top right corner to view tracking data.</p>
            </div>
          </main>
        ) : (
          <>
            {currentView === 'dashboard' && (
              <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
            
            {/* Stats Row - Control Tower Layout */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5"><TruckIcon className="w-3.5 h-3.5"/> Total Truck</p>
              <div className="flex items-end justify-between">
                <h3 className="text-2xl font-bold text-slate-800">{stats.total}</h3>
              </div>
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Package className="w-3.5 h-3.5 text-purple-500"/> Unloading</p>
              <div className="flex items-end justify-between">
                <h3 className="text-2xl font-bold text-slate-800">{stats.unloading}</h3>
              </div>
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500"/> Complete</p>
              <div className="flex items-end justify-between">
                <h3 className="text-2xl font-bold text-slate-800">{stats.complete}</h3>
              </div>
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-amber-500"/> Remain</p>
              <div className="flex items-end justify-between">
                <h3 className="text-2xl font-bold text-slate-800">{stats.remain}</h3>
              </div>
            </div>
          </div>

          {/* List View */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={showHiddenRows} 
                  onChange={(e) => setShowHiddenRows(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Show completed/out trucks
              </label>
            </div>
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider font-bold sticky top-0 z-10 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Route</th>
                    <th className="px-4 py-3">ทะเบียนรถ</th>
                    <th className="px-4 py-3">จุดลงงาน</th>
                    <th className="px-4 py-3">Plan ETA</th>
                    <th className="px-4 py-3">Actual ETA</th>
                    <th className="px-4 py-3">Actual ETD</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-center">GPS พิกัด</th>
                    <th className="px-4 py-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {(() => {
                    const visibleTrucks = filteredTrucks.filter(t => {
                      if (showHiddenRows) return true;
                      if (t.status === 'COMPLETED' || t.status === 'TRUCK_OUT') {
                        if (t.stampEtd) {
                          const now = new Date();
                          const [hours, minutes] = t.stampEtd.split(':').map(Number);
                          if (!isNaN(hours) && !isNaN(minutes)) {
                            const etdDate = new Date(now);
                            etdDate.setHours(hours, minutes, 0, 0);
                            const diffMs = now.getTime() - etdDate.getTime();
                            if (diffMs > 10 * 60 * 1000) {
                              return false;
                            }
                          }
                        }
                      }
                      return true;
                    });
                    
                    const totalPages = Math.ceil(visibleTrucks.length / ROWS_PER_PAGE) || 1;
                    const paginatedTrucks = visibleTrucks.slice((currentPage - 1) * ROWS_PER_PAGE, currentPage * ROWS_PER_PAGE);
                    
                    // Reset to page 1 if current page is out of bounds
                    if (currentPage > totalPages) {
                      setTimeout(() => setCurrentPage(1), 0);
                    }

                    if (paginatedTrucks.length === 0) {
                      return (
                        <tr>
                          <td colSpan={9} className="px-6 py-8 text-center text-slate-500">
                            No trucks found matching your criteria.
                          </td>
                        </tr>
                      );
                    }

                    return paginatedTrucks.map(truck => (
                      <tr key={truck.id} className={`${getRowClass(truck)} border-b border-slate-100/50 hover:bg-slate-50/50 transition-colors`}>
                        <td className="px-2 py-1">
                          <span className="font-mono font-medium text-slate-600">{truck.route}</span>
                        </td>
                        <td className="px-2 py-1">
                          <div className="font-bold text-slate-800">{truck.licensePlate}</div>
                          <div className="text-xs text-slate-500">{truck.supplierName}</div>
                        </td>
                        <td className="px-2 py-1 font-medium text-slate-700">
                          {truck.dropPoint}
                        </td>
                        <td className="px-2 py-1 text-slate-600 font-mono text-sm">
                          {truck.planEta || '-'}
                        </td>
                        <td className="px-2 py-1 font-mono text-sm">
                          <div className="flex items-center gap-2">
                            <span className={truck.performanceStatus === 'DELAY' ? 'text-red-600 font-bold' : 'text-slate-800'}>
                              {truck.stampEta || truck.actualEta || '-'}
                            </span>
                            {getPerformanceBadge(truck.performanceStatus)}
                          </div>
                        </td>
                        <td className="px-2 py-1 text-slate-600 font-mono text-sm">
                          {truck.stampEtd || '-'}
                        </td>
                        <td className="px-2 py-1">
                          <StatusBadge status={truck.status} />
                        </td>
                        <td className="px-2 py-1 text-center">
                          <button 
                            onClick={(e) => { e.preventDefault(); setCurrentView('map'); }}
                            className="inline-flex items-center justify-center text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 p-1.5 rounded-full transition-colors border border-blue-100"
                            title="View on Map"
                          >
                            <MapPin className="w-4 h-4" />
                          </button>
                        </td>
                        <td className="px-2 py-1">
                          <div className="flex items-center gap-2 justify-center">
                            {truck.actionProblem && (
                              <span className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded truncate max-w-[120px]" title={truck.actionProblem}>
                                {truck.actionProblem}
                              </span>
                            )}
                            <button 
                              onClick={() => {
                                setActionDialog({ isOpen: true, truck: truck });
                              }}
                              className={`${truck.actionProblem ? 'text-red-500 hover:text-red-600' : 'text-slate-400 hover:text-blue-600'} p-1.5 rounded-full hover:bg-slate-100 transition-colors inline-flex items-center justify-center`}
                              title="Update Problem"
                            >
                              <MessageSquare className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
            
            {/* Pagination Controls */}
            {(() => {
              const visibleTrucks = filteredTrucks.filter(t => {
                if (showHiddenRows) return true;
                if (t.status === 'COMPLETED' || t.status === 'TRUCK_OUT') {
                  if (t.stampEtd) {
                    const now = new Date();
                    const [hours, minutes] = t.stampEtd.split(':').map(Number);
                    if (!isNaN(hours) && !isNaN(minutes)) {
                      const etdDate = new Date(now);
                      etdDate.setHours(hours, minutes, 0, 0);
                      const diffMs = now.getTime() - etdDate.getTime();
                      if (diffMs > 10 * 60 * 1000) {
                        return false;
                      }
                    }
                  }
                }
                return true;
              });
              const totalPages = Math.ceil(visibleTrucks.length / ROWS_PER_PAGE) || 1;
              if (totalPages <= 1) return null;
              
              return (
                <div className="p-3 border-t border-slate-200 bg-white flex items-center justify-between text-sm">
                  <div className="text-slate-500">
                    Showing {(currentPage - 1) * ROWS_PER_PAGE + 1} to {Math.min(currentPage * ROWS_PER_PAGE, visibleTrucks.length)} of {visibleTrucks.length} entries
                  </div>
                  <div className="flex gap-1">
                    <button 
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Prev
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                      <button
                        key={p}
                        onClick={() => setCurrentPage(p)}
                        className={`px-3 py-1 rounded border ${currentPage === p ? 'bg-blue-50 border-blue-200 text-blue-600 font-bold' : 'border-slate-200 hover:bg-slate-50'}`}
                      >
                        {p}
                      </button>
                    ))}
                    <button 
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </main>
        )}
        
        {currentView === 'map' && (
          <main className="flex-1 overflow-hidden bg-slate-50">
            <LiveMap trucks={filteredTrucks} />
          </main>
        )}

        {currentView === 'diagram' && (
          <main className="flex-1 overflow-hidden">
            <PlatformDiagram trucks={filteredTrucks} />
          </main>
        )}

        {currentView === 'incident' && (
          <main className="flex-1 overflow-hidden">
            <IncidentCenter trucks={filteredTrucks} onUpdateTruck={handleUpdateTruck} />
          </main>
        )}

        {currentView === 'warehouse' && (
          <main className="flex-1 overflow-hidden">
            <WarehouseStamp trucks={filteredTrucks} onUpdateTruck={handleUpdateTruck} />
          </main>
        )}
        </>
        )}
        
        {/* Footer */}
        <footer className="h-12 bg-slate-800 flex items-center px-6 justify-between text-white text-xs z-10 shrink-0">
          <div className="flex items-center space-x-4">
            <span className="bg-red-500 text-[10px] px-2 py-0.5 rounded-full font-bold">ALERT</span>
            <span className="hidden sm:inline">System running smoothly. All services operational.</span>
          </div>
          <div className="flex items-center space-x-6">
            <span className="opacity-60 italic underline hidden sm:block">TPCAP Hub Alpha</span>
            <span className="opacity-60">© 2026 ELIVE Logistics</span>
          </div>
        </footer>
      </div>

      {actionDialog.isOpen && actionDialog.truck && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-blue-500" />
                Update Problem - {actionDialog.truck.licensePlate}
              </h3>
              <button 
                onClick={() => setActionDialog({ isOpen: false, truck: null })}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              handleUpdateTruck(actionDialog.truck!.id, {
                actionProblem: formData.get('problem') as string,
                actionStatus: 'OPEN'
              });
              setActionDialog({ isOpen: false, truck: null });
            }}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">ระบุปัญหา (Problem)</label>
                  <textarea 
                    name="problem"
                    defaultValue={actionDialog.truck.actionProblem || ''}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    rows={4}
                    required
                  ></textarea>
                </div>
              </div>
              
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setActionDialog({ isOpen: false, truck: null })}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
