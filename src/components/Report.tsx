import React, { useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import { Truck } from '../types';

interface ReportProps {
  trucks: Truck[];
  selectedDate?: string;
}

function value(input: unknown): string {
  return String(input ?? '').trim();
}

function completed(truck: Truck): boolean {
  return Boolean(truck.status === 'COMPLETED' || truck.status === 'TRUCK_OUT' || truck.stampEtd);
}

function noWork(truck: Truck): boolean {
  const status = value(truck.status).toUpperCase();
  const performance = value(truck.performanceStatus).toUpperCase();
  return status === 'NO_WORK' || performance === 'NO_DROP' || value(truck.actionProblem).includes('ไม่มีงาน');
}

function delayed(truck: Truck): boolean {
  return value(truck.performanceStatus).toUpperCase() === 'DELAY';
}

function openAction(truck: Truck): boolean {
  return Boolean(value(truck.actionProblem)) && value(truck.actionStatus).toUpperCase() !== 'CLOSED';
}

function timeToMinutes(input?: string): number | null {
  const match = value(input).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function delayMinutes(truck: Truck): number | null {
  const plan = timeToMinutes(truck.planEta);
  const actual = timeToMinutes(truck.stampEta || truck.actualEta);
  if (plan === null || actual === null) return null;
  let difference = actual - plan;
  if (difference < -720) difference += 1440;
  if (difference > 720) difference -= 1440;
  return difference;
}

function csvCell(input: unknown): string {
  return `"${value(input).replace(/"/g, '""')}"`;
}

export function Report({ trucks, selectedDate = '' }: ReportProps) {
  const [search, setSearch] = useState('');
  const [supplier, setSupplier] = useState('ALL');

  const suppliers = useMemo(
    () => Array.from(new Set(trucks.map(truck => value(truck.supplierName)).filter(Boolean))).sort(),
    [trucks]
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('th');
    return trucks.filter(truck => {
      if (supplier !== 'ALL' && value(truck.supplierName) !== supplier) return false;
      if (!query) return true;
      return [truck.route, truck.licensePlate, truck.dropPoint, truck.supplierName, truck.actionProblem]
        .some(item => value(item).toLocaleLowerCase('th').includes(query));
    });
  }, [search, supplier, trucks]);

  const summary = useMemo(() => {
    const total = filtered.length;
    const complete = filtered.filter(completed).length;
    const delay = filtered.filter(delayed).length;
    const action = filtered.filter(openAction).length;
    const onTimeRows = filtered.filter(truck => {
      const minutes = delayMinutes(truck);
      return minutes !== null && minutes <= 0;
    });
    const measured = filtered.filter(truck => delayMinutes(truck) !== null).length;
    const onTimePercent = measured > 0 ? Math.round((onTimeRows.length / measured) * 100) : 0;
    return { total, complete, delay, action, measured, onTimePercent };
  }, [filtered]);

  const statusRows = useMemo(() => {
    const rows = [
      { label: 'ดำเนินการเสร็จสิ้น', count: filtered.filter(completed).length, color: 'bg-emerald-500' },
      { label: 'อยู่ระหว่างดำเนินการ', count: filtered.filter(truck => !completed(truck) && !noWork(truck)).length, color: 'bg-blue-500' },
      { label: 'ไม่มีงานลง', count: filtered.filter(noWork).length, color: 'bg-slate-500' },
      { label: 'ล่าช้า', count: filtered.filter(delayed).length, color: 'bg-orange-500' },
    ];
    return rows.map(row => ({ ...row, percent: filtered.length ? Math.round((row.count / filtered.length) * 100) : 0 }));
  }, [filtered]);

  const supplierRows = useMemo(() => {
    const map = new Map<string, Truck[]>();
    filtered.forEach(truck => {
      const name = value(truck.supplierName) || 'ไม่ระบุสังกัด';
      map.set(name, [...(map.get(name) || []), truck]);
    });
    return Array.from(map.entries()).map(([name, rows]) => ({
      name,
      total: rows.length,
      complete: rows.filter(completed).length,
      delay: rows.filter(delayed).length,
    })).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)).slice(0, 6);
  }, [filtered]);

  const delayedRows = useMemo(() => filtered
    .map(truck => ({ truck, minutes: delayMinutes(truck) }))
    .filter((row): row is { truck: Truck; minutes: number } => row.minutes !== null && row.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 8), [filtered]);

  const exportCsv = () => {
    const rows = [
      ['Route', 'Supplier', 'License Plate', 'Drop Point', 'Plan ETA', 'Actual ETA', 'Actual ETD', 'Delay Minutes', 'Status', 'Action / Problem'],
      ...filtered.map(truck => [
        truck.route,
        truck.supplierName,
        truck.licensePlate,
        truck.dropPoint,
        truck.planEta,
        truck.stampEta || truck.actualEta,
        truck.stampEtd,
        delayMinutes(truck) ?? '',
        completed(truck) ? 'COMPLETED' : truck.status,
        truck.actionProblem,
      ]),
    ];
    const csv = '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `elive-operation-report-${selectedDate || 'all'}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-slate-100">
      <header className="shrink-0 border-b border-slate-200 bg-white px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div>
            <h1 className="text-xl font-black text-slate-900">รายงานผลการปฏิบัติงาน</h1>
            <p className="mt-1 text-sm text-slate-500">ประจำวันที่ {selectedDate || '-'} · สรุปผลจากข้อมูลเที่ยวรถจริง</p>
          </div>
          <div className="flex flex-1 flex-col gap-2 sm:flex-row lg:ml-auto lg:max-w-3xl">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">ค้นหา</span>
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder="ค้นหา Route, ทะเบียนรถ..." className="h-10 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm outline-none focus:border-blue-500" />
            </label>
            <select value={supplier} onChange={event => setSupplier(event.target.value)} className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold sm:w-48">
              <option value="ALL">ทุกสังกัด</option>
              {suppliers.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
            <button type="button" onClick={exportCsv} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700">
              <Download className="h-4 w-4" /> Export CSV
            </button>
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-auto p-4 md:p-5">
        <section className="grid grid-cols-2 gap-3 xl:grid-cols-5">
          {[
            ['เที่ยวทั้งหมด', summary.total, 'border-slate-200 bg-white text-slate-900'],
            ['เสร็จสิ้น', summary.complete, 'border-emerald-200 bg-emerald-50 text-emerald-800'],
            ['ตรงเวลา', `${summary.onTimePercent}%`, 'border-blue-200 bg-blue-50 text-blue-800'],
            ['ล่าช้า', summary.delay, 'border-orange-200 bg-orange-50 text-orange-800'],
            ['Action ค้าง', summary.action, 'border-red-200 bg-red-50 text-red-800'],
          ].map(([label, number, style]) => (
            <div key={String(label)} className={`rounded-xl border p-4 shadow-sm ${style}`}>
              <p className="text-xs font-bold">{label}</p>
              <p className="mt-2 text-3xl font-black leading-none">{number}</p>
            </div>
          ))}
        </section>

        <section className="mt-4 grid gap-4 xl:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-black text-slate-900">สรุปสถานะเที่ยวรถ</h2>
              <span className="text-xs font-bold text-slate-400">{summary.total} เที่ยว</span>
            </div>
            <div className="mt-5 space-y-4">
              {statusRows.map(row => (
                <div key={row.label}>
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span className="font-semibold text-slate-700">{row.label}</span>
                    <span className="font-black text-slate-900">{row.count} <span className="font-semibold text-slate-400">({row.percent}%)</span></span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full ${row.color}`} style={{ width: `${Math.min(100, row.percent)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="font-black text-slate-900">ผลการปฏิบัติงานตามสังกัด</h2>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs font-black text-slate-600"><tr><th className="px-4 py-3 text-left">สังกัด</th><th className="px-3 py-3 text-center">ทั้งหมด</th><th className="px-3 py-3 text-center">เสร็จสิ้น</th><th className="px-3 py-3 text-center">ล่าช้า</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {supplierRows.map(row => <tr key={row.name}><td className="max-w-[220px] truncate px-4 py-3 font-bold">{row.name}</td><td className="px-3 py-3 text-center">{row.total}</td><td className="px-3 py-3 text-center font-bold text-emerald-700">{row.complete}</td><td className="px-3 py-3 text-center font-bold text-orange-700">{row.delay}</td></tr>)}
                </tbody>
              </table>
              {!supplierRows.length && <div className="py-12 text-center text-sm font-bold text-slate-400">ไม่มีข้อมูล</div>}
            </div>
          </div>
        </section>

        <section className="mt-4 grid gap-4 xl:grid-cols-[380px_1fr]">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4"><h2 className="font-black text-slate-900">รายการล่าช้าสูงสุด</h2></div>
            <div className="divide-y divide-slate-100">
              {delayedRows.map(({ truck, minutes }) => (
                <div key={truck.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1"><p className="truncate font-black text-slate-900">{value(truck.route) || '-'} · {value(truck.licensePlate) || '-'}</p><p className="mt-0.5 truncate text-xs text-slate-500">{value(truck.dropPoint) || '-'} · Plan {value(truck.planEta) || '-'}</p></div>
                  <span className="shrink-0 rounded-full bg-orange-100 px-2.5 py-1 text-xs font-black text-orange-800">+{minutes} นาที</span>
                </div>
              ))}
              {!delayedRows.length && <div className="py-12 text-center text-sm font-bold text-slate-400">ไม่มีรายการล่าช้า</div>}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><h2 className="font-black text-slate-900">รายละเอียดเที่ยวรถ</h2><span className="text-xs font-bold text-slate-500">{filtered.length} รายการ</span></div>
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full min-w-[1000px] table-fixed text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-100 text-xs font-black text-slate-700"><tr><th className="w-[105px] px-3 py-3">Route</th><th className="w-[120px] px-3 py-3">สังกัด</th><th className="w-[120px] px-3 py-3">ทะเบียนรถ</th><th className="w-[95px] px-3 py-3">จุดลงงาน</th><th className="w-[90px] px-3 py-3 text-center">Plan ETA</th><th className="w-[90px] px-3 py-3 text-center">Actual ETA</th><th className="w-[90px] px-3 py-3 text-center">Actual ETD</th><th className="px-3 py-3">ผลการปฏิบัติงาน</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(truck => {
                    const minutes = delayMinutes(truck);
                    const result = completed(truck) ? 'เสร็จสิ้น' : noWork(truck) ? 'ไม่มีงานลง' : delayed(truck) ? 'ล่าช้า' : 'อยู่ระหว่างดำเนินการ';
                    return <tr key={truck.id} className="h-13 hover:bg-blue-50/40"><td className="truncate px-3 py-3 font-bold">{value(truck.route) || '-'}</td><td className="truncate px-3">{value(truck.supplierName) || '-'}</td><td className="truncate px-3 font-semibold">{value(truck.licensePlate) || '-'}</td><td className="truncate px-3">{value(truck.dropPoint) || '-'}</td><td className="px-3 text-center font-mono">{value(truck.planEta) || '-'}</td><td className="px-3 text-center font-mono font-bold text-blue-700">{value(truck.stampEta || truck.actualEta) || '-'}</td><td className="px-3 text-center font-mono font-bold text-orange-700">{value(truck.stampEtd) || '-'}</td><td className="px-3"><span className={`rounded-full px-2 py-1 text-xs font-black ${result === 'เสร็จสิ้น' ? 'bg-emerald-100 text-emerald-800' : result === 'ล่าช้า' ? 'bg-orange-100 text-orange-800' : result === 'ไม่มีงานลง' ? 'bg-slate-200 text-slate-700' : 'bg-blue-100 text-blue-800'}`}>{result}{minutes !== null && minutes > 0 ? ` +${minutes} นาที` : ''}</span></td></tr>;
                  })}
                </tbody>
              </table>
              {!filtered.length && <div className="py-16 text-center text-sm font-bold text-slate-500">ไม่พบข้อมูลตามเงื่อนไขที่เลือก</div>}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default Report;
