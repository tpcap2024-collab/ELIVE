/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Search, Filter, Phone, MapPin, Gauge, ShieldAlert, ArrowUpDown, ChevronLeft, ChevronRight, FileDown } from 'lucide-react';
import { TruckData, TruckStatus, DashboardFilters } from '../types';

interface TruckTableProps {
  trucks: TruckData[];
  selectedTruckId: string | null;
  onSelectTruck: (truck: TruckData) => void;
  filters: DashboardFilters;
  onSetFilters: (filters: DashboardFilters) => void;
  hideDriverInfo?: boolean;
}

export default function TruckTable({
  trucks,
  selectedTruckId,
  onSelectTruck,
  filters,
  onSetFilters,
  hideDriverInfo = false,
}: TruckTableProps) {
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 6;

  // Sorting State
  const [sortField, setSortField] = useState<keyof TruckData>('plateNo');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Dynamically extract routes and companies for filter lists
  const availableRoutes = useMemo(() => {
    const r = new Set(trucks.map(t => t.route));
    return ['All', ...Array.from(r)];
  }, [trucks]);

  const availableCompanies = useMemo(() => {
    const c = new Set(trucks.map(t => t.logisticsCo));
    return ['All', ...Array.from(c)];
  }, [trucks]);

  const handleSort = (field: keyof TruckData) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleFilterChange = (key: keyof DashboardFilters, value: string) => {
    onSetFilters({
      ...filters,
      [key]: value
    });
    setCurrentPage(1); // Reset page on filter change
  };

  // Filter & Sort Logic
  const processedTrucks = useMemo(() => {
    let result = [...trucks];

    // Search query filter
    if (filters.searchQuery) {
      const q = filters.searchQuery.toLowerCase();
      result = result.filter(
        t =>
          t.plateNo.toLowerCase().includes(q) ||
          t.driverName.toLowerCase().includes(q) ||
          t.route.toLowerCase().includes(q) ||
          t.logisticsCo.toLowerCase().includes(q) ||
          t.driverPhone.includes(q)
      );
    }

    // Status filter
    if (filters.status !== 'All') {
      result = result.filter(t => t.status === filters.status);
    }

    // Route filter
    if (filters.route !== 'All') {
      result = result.filter(t => t.route === filters.route);
    }

    // Company filter
    if (filters.logisticsCo !== 'All') {
      result = result.filter(t => t.logisticsCo === filters.logisticsCo);
    }

    // Apply Sorting
    result.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortDirection === 'asc'
          ? valA.localeCompare(valB, 'th')
          : valB.localeCompare(valA, 'th');
      }

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }

      return 0;
    });

    return result;
  }, [trucks, filters, sortField, sortDirection]);

  // Paginated View
  const paginatedTrucks = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return processedTrucks.slice(startIndex, startIndex + itemsPerPage);
  }, [processedTrucks, currentPage]);

  const totalPages = Math.ceil(processedTrucks.length / itemsPerPage) || 1;

  const getStatusBadge = (status: TruckStatus) => {
    switch (status) {
      case 'Delivered':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-emerald-200 text-[10.5px] font-bold bg-emerald-50 text-emerald-700 select-none">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            ส่งงานแล้ว / เสร็จสิ้น
          </span>
        );
      case 'Traveling':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-amber-200 text-[10.5px] font-bold bg-amber-50 text-amber-700 select-none">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
            กำลังเดินทาง
          </span>
        );
      case 'At_Area':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-blue-200 text-[10.5px] font-bold bg-blue-50 text-blue-700 select-none">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
            อยู่ในพื้นที่ TPCAP / ลูกค้า
          </span>
        );
      case 'Offline':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-rose-200 text-[10.5px] font-bold bg-rose-50 text-rose-700 select-none">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
            GPS Offline / ไม่พบงาน
          </span>
        );
    }
  };

  const handleExportCSV = () => {
    const headers = ['PlateNo', 'Route', 'Company', 'Driver', 'Phone', 'Speed', 'Distance(km)', 'Location', 'Status', 'ETA', 'ETD', 'LastUpdate'];
    const csvRows = [headers.join(',')];
    
    processedTrucks.forEach(t => {
      csvRows.push([
        `"${t.plateNo}"`,
        `"${t.route}"`,
        `"${t.logisticsCo}"`,
        `"${t.driverName}"`,
        `"${t.driverPhone}"`,
        t.speed,
        t.distanceToTpcap,
        `"${t.currentLocation}"`,
        `"${t.status}"`,
        `"${t.etaTpcap}"`,
        `"${t.etdTpcap}"`,
        `"${t.lastGpsUpdate}"`
      ].join(','));
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `elive_truck_status_${new Date().toISOString().slice(0,10)}.csv`);
    link.click();
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm" id="truck-status-table-container">
      {/* Search & Filter Header block */}
      <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        {/* Row count & search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative">
            <input
              type="text"
              placeholder="ค้นหาทะเบียน, ชื่อคนขับ, บริษัท..."
              value={filters.searchQuery}
              onChange={(e) => handleFilterChange('searchQuery', e.target.value)}
              className="bg-white border border-slate-300 rounded py-1.5 pl-8 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 w-full sm:w-64 font-sans transition-all"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2" />
          </div>
          
          <button
            onClick={handleExportCSV}
            className="flex items-center justify-center gap-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 py-1.5 px-3 rounded text-xs font-bold cursor-pointer transition-all"
            title="ดาวน์โหลดไฟล์สรุปข้อมูล CSV"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>ออกรายงาน CSV ({processedTrucks.length})</span>
          </button>
        </div>

        {/* Dropdowns filters row */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Status filter dropdown */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="bg-white border border-slate-300 text-slate-700 rounded py-1 px-2.5 text-xs focus:outline-none focus:border-blue-500"
            >
              <option value="All">ทุกสถานะ ({trucks.length})</option>
              <option value="Delivered">🟢 ส่งงานแล้ว ({trucks.filter(t=>t.status==='Delivered').length})</option>
              <option value="Traveling">🟡 กำลังเดินทาง ({trucks.filter(t=>t.status==='Traveling').length})</option>
              <option value="At_Area">🔵 อยู่ในพื้นที่ ({trucks.filter(t=>t.status==='At_Area').length})</option>
              <option value="Offline">🔴 GPS Offline ({trucks.filter(t=>t.status==='Offline').length})</option>
            </select>
          </div>

          {/* Route filter dropdown */}
          <select
            value={filters.route}
            onChange={(e) => handleFilterChange('route', e.target.value)}
            className="bg-white border border-slate-300 text-slate-700 rounded py-1 px-2.5 text-xs focus:outline-none focus:border-blue-500 max-w-[180px] truncate"
          >
            <option value="All">ทุกเส้นทางขนส่ง</option>
            {availableRoutes.filter(r => r !== 'All').map(route => (
              <option key={route} value={route}>{route}</option>
            ))}
          </select>

          {/* Logistics Co filter dropdown */}
          <select
            value={filters.logisticsCo}
            onChange={(e) => handleFilterChange('logisticsCo', e.target.value)}
            className="bg-white border border-slate-300 text-slate-700 rounded py-1 px-2.5 text-xs focus:outline-none focus:border-blue-500 max-w-[150px] truncate"
          >
            <option value="All">ทุกผู้รับเหมา</option>
            {availableCompanies.filter(c => c !== 'All').map(co => (
              <option key={co} value={co}>{co}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Table Layout */}
      <div className="overflow-x-auto w-full">
        <table className="w-full text-left border-collapse" id="trucks-grid-table">
          <thead>
            <tr className="bg-slate-100 text-slate-600 font-sans text-[11px] font-bold uppercase tracking-wider border-b border-slate-200 select-none">
              <th className="py-2.5 px-4 cursor-pointer hover:bg-slate-200/50" onClick={() => handleSort('plateNo')}>
                <div className="flex items-center gap-1.5">
                  <span>ทะเบียน / ผู้ขนส่ง</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th className="py-2.5 px-4 cursor-pointer hover:bg-slate-200/50" onClick={() => handleSort('route')}>
                <div className="flex items-center gap-1.5">
                  <span>เส้นทางบริการ</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              {!hideDriverInfo && (
                <th className="py-2.5 px-4 cursor-pointer hover:bg-slate-200/50" onClick={() => handleSort('driverName')}>
                  <div className="flex items-center gap-1.5">
                    <span>คนขับ / เบอร์โทร</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
              )}
              <th className="py-2.5 px-4 text-center cursor-pointer hover:bg-slate-200/50" onClick={() => handleSort('speed')}>
                <div className="flex items-center justify-center gap-1.5">
                  <span>ความเร็ว</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th className="py-2.5 px-4 text-center cursor-pointer hover:bg-slate-200/50" onClick={() => handleSort('distanceToTpcap')}>
                <div className="flex items-center justify-center gap-1.5">
                  <span>ห่าง TPCAP</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th className="py-2.5 px-4 text-center font-semibold text-slate-600">ETA / ETD</th>
              <th className="py-2.5 px-4 cursor-pointer hover:bg-slate-200/50" onClick={() => handleSort('status')}>
                <div className="flex items-center gap-1.5">
                  <span>สถานะปฏิบัติการ</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th className="py-2.5 px-4 font-semibold text-slate-600">อัปเดตล่าสุด</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700 text-xs font-sans">
            {paginatedTrucks.map((truck) => {
              const isSelected = selectedTruckId === truck.id;
              return (
                <tr
                  key={truck.id}
                  onClick={() => onSelectTruck(truck)}
                  className={`hover:bg-slate-50 transition-all cursor-pointer ${
                    isSelected ? 'bg-blue-50/50 border-l-2 border-l-[#1e3a8a]' : ''
                  }`}
                  id={`row-${truck.id}`}
                >
                  {/* Plate and Company */}
                  <td className="py-2 px-4">
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-900 text-[12.5px]">{truck.plateNo}</span>
                      <span className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">{truck.logisticsCo}</span>
                    </div>
                  </td>

                  {/* Route */}
                  <td className="py-2 px-4">
                    <span className="font-semibold text-slate-700 leading-relaxed block max-w-[200px] truncate" title={truck.route}>
                      {truck.route}
                    </span>
                  </td>

                  {/* Driver Name & Phone */}
                  {!hideDriverInfo && (
                    <td className="py-2 px-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-800">{truck.driverName}</span>
                        <a
                          href={`tel:${truck.driverPhone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-[11px] text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 mt-0.5"
                        >
                          <Phone className="w-3 h-3 shrink-0 text-blue-500" />
                          <span>{truck.driverPhone}</span>
                        </a>
                      </div>
                    </td>
                  )}

                  {/* Speed with speedometer indicator */}
                  <td className="py-2 px-4 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <Gauge className={`w-3.5 h-3.5 ${truck.speed > 80 ? 'text-rose-500 animate-pulse' : 'text-slate-400'}`} />
                      <span className={`font-mono font-bold text-sm ${truck.speed > 80 ? 'text-rose-600 font-black' : 'text-slate-800'}`}>
                        {truck.speed}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">km/h</span>
                    </div>
                  </td>

                  {/* Distance */}
                  <td className="py-2 px-4 text-center">
                    <span className="font-mono font-bold text-slate-800 text-sm">
                      {truck.distanceToTpcap.toFixed(1)}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono ml-0.5">km</span>
                  </td>

                  {/* ETA / ETD Times */}
                  <td className="py-2 px-4 text-center">
                    <div className="flex flex-col items-center justify-center font-mono font-bold">
                      <span className="text-[10px] text-emerald-600" title="ETA TPCAP">
                        ⬇ {truck.etaTpcap}
                      </span>
                      <span className="text-[10px] text-slate-500" title="ETD TPCAP">
                        ⬆ {truck.etdTpcap}
                      </span>
                    </div>
                  </td>

                  {/* Status Badge */}
                  <td className="py-2 px-4">
                    {getStatusBadge(truck.status)}
                  </td>

                  {/* Location & GPS Last Update */}
                  <td className="py-2 px-4">
                    <div className="flex flex-col">
                      <span className="text-[10.5px] text-slate-600 flex items-center gap-1 max-w-[150px] truncate" title={truck.currentLocation}>
                        <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                        {truck.currentLocation}
                      </span>
                      <span className="text-[9.5px] text-slate-400 font-mono font-bold mt-0.5">
                        {truck.lastGpsUpdate}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination & Status Bar Footer */}
      <div className="p-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 font-sans">
        <span className="hidden sm:inline font-bold">
          แสดงข้อมูล <span className="text-slate-800">{processedTrucks.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}</span> ถึง{' '}
          <span className="text-slate-800">
            {Math.min(currentPage * itemsPerPage, processedTrucks.length)}
          </span>{' '}
          จากทั้งหมด <span className="text-slate-800">{processedTrucks.length}</span> คัน
        </span>

        <div className="flex items-center gap-1.5 ml-auto">
          <button
            onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
            disabled={currentPage === 1}
            className="p-1.5 bg-white border border-slate-300 hover:bg-slate-50 rounded disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-slate-500 hover:text-slate-900 transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-3 font-bold text-slate-600 font-mono">
            หน้า {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
            disabled={currentPage === totalPages}
            className="p-1.5 bg-white border border-slate-300 hover:bg-slate-50 rounded disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-slate-500 hover:text-slate-900 transition-all"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
