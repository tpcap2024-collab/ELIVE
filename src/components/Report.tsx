import React, { useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import { Truck } from '../types';

interface ReportProps {
  trucks: Truck[];
  selectedDate?: string;
}

type ReportTab = 'SUMMARY' | 'PERFORMANCE' | 'ACTION';

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function isCompleted(truck: Truck): boolean {
  return Boolean(truck.status === 'COMPLETED' || truck.status === 'TRUCK_OUT' || truck.stampEtd);
}

function isNoWork(truck: Truck): boolean {
  const status = text(truck.status).toUpperCase();
  const performance = text(truck.performanceStatus).toUpperCase();
  return status === 'NO_WORK' || performance === 'NO_DROP' || text(truck.actionProblem).includes('ไม่มีงาน');
}

function isDelayed(truck: Truck): boolean {
  return text(truck.performanceStatus).toUpperCase() === 'DELAY';
}

function hasOpenAction(truck: Truck): boolean {
  if (!text(truck.actionProblem)) return false;
  return text(truck.actionStatus).toUpperCase() !== 'CLOSED';
}

function csvCell(value: unknown): string {
  return `"${text(value).replace(/"/g, '""')}"`;
}

export function Report({ trucks, selectedDate = '' }: ReportProps) {
  const [tab, setTab] = useState<ReportTab>('SUMMARY');
  const [search, setSearch] = useState('');
  const [supplier, setSupplier] = useState('ALL');
  const [status, setStatus] = useState('ALL');

  const suppliers = useMemo(
    () => Array.from(new Set(trucks.map(truck => text(truck.supplierName)).filter(Boolean))).sort(),
    [trucks]
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('th');
    return trucks.filter(truck => {
      if (supplier !== 'ALL' && text(truck.supplierName) !== supplier) return false;
      if (status === 'COMPLETED' && !isCompleted(truck)) return false;
      if (status === 'DELAY' && !isDelayed(truck)) return false;
      if (status === 'NO_WORK' && !isNoWork(truck)) return false;
      if (status === 'ACTION' && !hasOpenAction(truck)) return false;
      if (!query) return true;
      return [truck.route, truck.licensePlate, truck.dropPoint, truck.supplierName, truck.actionProblem]
        .some(value => text(value).toLocaleLowerCase('th').includes(query));
    });
  }, [search, status, supplier, trucks]);

  const metrics = useMemo(() => ({
    total: filtered.length,
    completed: filtered.filter(isCompleted).length,
    delayed: filtered.filter(isDelayed).length,
    openAction: filtered.filter(hasOpenAction).length,
  }), [filtered]);

  const exportCsv = () => {
    const rows = [
      ['Route', 'Supplier', 'License Plate', 'Drop Point', 'Plan ETA', 'Actual ETA', 'Plan ETD', 'Actual ETD', 'Status', 'Performance', 'Action / Problem'],
      ...filtered.map(truck => [
        truck.route,
        truck.supplierName,
        truck.licensePlate,
        truck.dropPoint,
        truck.planEta,
        truck.stampEta || truck.actualEta,
        truck.planEtd,
        truck.stampEtd,
        truck.status,
        truck.performanceStatus,
        truck.actionProblem,
      ]),
    ];
    const csv = '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `elive-report-${selectedDate || 'all'}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const tabs: Array<{ id: ReportTab; label: string }> = [
    { id: 'SUMMARY', label: 'ภาพรวม' },
    { id: 'PERFORMANCE', label: 'ประสิทธิภาพ' },
    { id: 'ACTION', label: 'Action' },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-slate-50">
      <header className="shrink-0 border-b border-slate-200 bg-white px-5 py-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div>
            <h1 className="text-xl font-black text-slate-900">รายงานผลการปฏิบัติงาน</h1>
            <p className="mt-1 text-sm text-slate-500">สรุปสถานะเที่ยวรถ ประสิทธิภาพ และรายการที่ต้องติดตาม</p>
          </div>
          <button type="button" onClick={exportCsv} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 xl:ml-auto">
            <Download className="h-4 w-4" /> Export CSV
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-b border-slate-200">
          {tabs.map(item => (
            <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`border-b-2 px-4 py-2 text-sm font-bold ${tab === item.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500'}`}>
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-[1fr_200px_190px]">
          <label className="relative">
            <span className="sr-only">ค้นหา</span>
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="ค้นหา Route, ทะเบียนรถ, จุดลงงาน..." className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm outline-none focus:border-blue-500" />
          </label>
          <select value={supplier} onChange={event => setSupplier(event.target.value)} className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold">
            <option value="ALL">ทุกสังกัด</option>
            {suppliers.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
          <select value={status} onChange={event => setStatus(event.target.value)} className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold">
            <option value="ALL">ทุกสถานะ</option>
            <option value="COMPLETED">ดำเนินการเสร็จสิ้น</option>
            <option value="DELAY">ล่าช้า</option>
            <option value="NO_WORK">ไม่มีงานลง</option>
            <option value="ACTION">มี Action ค้าง</option>
          </select>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-auto p-4 md:p-5">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ['เที่ยวทั้งหมด', metrics.total, 'border-slate-200 bg-white text-slate-900'],
            ['เสร็จสิ้น', metrics.completed, 'border-emerald-200 bg-emerald-50 text-emerald-800'],
            ['ล่าช้า', metrics.delayed, 'border-orange-200 bg-orange-50 text-orange-800'],
            ['Action ค้าง', metrics.openAction, 'border-red-200 bg-red-50 text-red-800'],
          ].map(([label, value, style]) => (
            <div key={String(label)} className={`rounded-xl border p-4 shadow-sm ${style}`}>
              <p className="text-xs font-bold">{label}</p>
              <p className="mt-2 text-3xl font-black leading-none">{value}</p>
            </div>
          ))}
        </section>

        <section className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="font-black text-slate-900">{tab === 'SUMMARY' ? 'รายละเอียดเที่ยวรถ' : tab === 'PERFORMANCE' ? 'รายละเอียดประสิทธิภาพ' : 'รายการ Action และปัญหา'}</h2>
            <span className="text-xs font-bold text-slate-500">{filtered.length} รายการ</span>
          </div>
          <div className="overflow-auto">
            <table className="w-full min-w-[1150px] table-fixed text-left text-sm">
              <thead className="sticky top-0 z-10 bg-slate-100 text-xs font-black text-slate-700">
                <tr>
                  <th className="w-[105px] px-3 py-3">Route</th>
                  <th className="w-[120px] px-3 py-3">สังกัด</th>
                  <th className="w-[120px] px-3 py-3">ทะเบียนรถ</th>
                  <th className="w-[95px] px-3 py-3">จุดลงงาน</th>
                  <th className="w-[90px] px-3 py-3 text-center">Plan ETA</th>
                  <th className="w-[90px] px-3 py-3 text-center">Actual ETA</th>
                  <th className="w-[90px] px-3 py-3 text-center">Actual ETD</th>
                  <th className="w-[120px] px-3 py-3">สถานะ</th>
                  <th className="px-3 py-3">Action / Problem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(truck => (
                  <tr key={truck.id} className="h-14 hover:bg-blue-50/40">
                    <td className="truncate px-3 font-bold">{text(truck.route) || '-'}</td>
                    <td className="truncate px-3">{text(truck.supplierName) || '-'}</td>
                    <td className="truncate px-3 font-semibold">{text(truck.licensePlate) || '-'}</td>
                    <td className="truncate px-3">{text(truck.dropPoint) || '-'}</td>
                    <td className="px-3 text-center font-mono">{text(truck.planEta) || '-'}</td>
                    <td className="px-3 text-center font-mono font-bold text-blue-700">{text(truck.stampEta || truck.actualEta) || '-'}</td>
                    <td className="px-3 text-center font-mono font-bold text-orange-700">{text(truck.stampEtd) || '-'}</td>
                    <td className="px-3"><span className={`rounded-full px-2 py-1 text-xs font-black ${isCompleted(truck) ? 'bg-emerald-100 text-emerald-800' : isDelayed(truck) ? 'bg-orange-100 text-orange-800' : isNoWork(truck) ? 'bg-slate-200 text-slate-700' : 'bg-blue-100 text-blue-800'}`}>{isCompleted(truck) ? 'เสร็จสิ้น' : isDelayed(truck) ? 'ล่าช้า' : isNoWork(truck) ? 'ไม่มีงานลง' : text(truck.status) || 'กำลังดำเนินการ'}</span></td>
                    <td className="truncate px-3 text-red-700" title={text(truck.actionProblem)}>{text(truck.actionProblem) || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length && <div className="py-16 text-center text-sm font-bold text-slate-500">ไม่พบข้อมูลตามเงื่อนไขที่เลือก</div>}
          </div>
        </section>
      </main>
    </div>
  );
}

export default Report;
