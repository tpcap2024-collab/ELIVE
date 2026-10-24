import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Truck } from '../types';
import { fetchDailyPlans, fetchEliveDashboardData } from '../lib/sheets';

interface ReportProps { trucks: Truck[]; selectedDate?: string; }
type Kind = 'SUMMARY' | 'EARLY' | 'ONTIME' | 'LATE' | 'DWELL' | 'POINT' | 'ROUTE' | 'SUPPLIER';
type ReportRow = { truck: Truck & { planRemark?: string }; date: string };
type MetricRow = { name: string; total: number; measured: number; count: number; rate: number | null; average: number | null; maximum: number | null; topReason?: string };
type SummaryStatus = 'EARLY' | 'ONTIME' | 'LATE' | 'EXCLUDED';
type SummaryChartRow = { date: string; total: number; counts: Record<SummaryStatus, number> };

type DwellOptions = {
  standardMode: 'PLAN' | 'CUSTOM'; standardMinutes: number;
  scope: 'ALL' | 'EXCEEDED'; excessMinutes: number;
  arrival: 'ALL' | 'EARLY' | 'ONTIME' | 'LATE'; problem: 'ALL' | 'RECORDED' | 'UNRECORDED';
};
function dwellExcess(truck: ReportRow['truck'], options: DwellOptions): number | null {
  if (!isTimeEligible(truck)) return null;
  const actual = duration(truck.stampEta || truck.actualEta, truck.stampEtd || (truck as Truck & { actualEtd?: unknown }).actualEtd);
  const standard = options.standardMode === 'CUSTOM' ? options.standardMinutes : duration(truck.planEta, truck.planEtd);
  return actual === null || standard === null ? null : actual - standard;
}
type DwellTrip = ReturnType<typeof makeDwellTrip>;
const DWELL_COLUMNS = ['วันที่','Route','สังกัด','ทะเบียน','ชื่อคนขับรถ','จุดลงงาน','Plan ETA','Actual ETA','Plan ETD','Actual ETD','สถานะการเข้า','ก่อนเวลา / ล่าช้า','มาตรฐาน (นาที)','เวลาจริง (นาที)','เกินมาตรฐาน (นาที)','ปัญหาที่บันทึก','สถานะการดำเนินการ'];
function makeDwellTrip(row: ReportRow, options: DwellOptions) {
  const truck = row.truck;
  const actual = duration(truck.stampEta || truck.actualEta, truck.stampEtd || (truck as Truck & { actualEtd?: unknown }).actualEtd);
  const standard = options.standardMode === 'CUSTOM' ? options.standardMinutes : duration(truck.planEta, truck.planEtd);
  const excess = dwellExcess(truck, options);
  const status = summaryStatus(truck, 0);
  const statusLabel = status === 'EARLY' ? 'ก่อนเวลา' : status === 'ONTIME' ? 'ตามแผน' : status === 'LATE' ? 'ล่าช้า' : 'ประเมินไม่ได้';
  const arrivalText = status && status !== 'EXCLUDED' ? status === 'ONTIME' ? 'ตามแผน' : timeResultText(truck, status, 0) : 'ประเมินไม่ได้';
  const problem = text(truck.actionProblem) || 'ยังไม่มีการบันทึกสาเหตุ';
  return { row, key: `${row.date}:${truck.id}`, actual, standard, excess, status, statusLabel, arrivalText, problem };
}
function dwellTripCells(item: DwellTrip): string[] {
  const t = item.row.truck;
  const minutes = (value: number | null) => value === null ? '-' : String(Math.round(value * 10) / 10);
  return [item.row.date, text(t.route), text(t.supplierName), text(t.licensePlate), text((t as Truck & { driverName?: unknown }).driverName) || '-', text(t.dropPoint), text(t.planEta), text(t.stampEta || t.actualEta), text(t.planEtd), text(t.stampEtd || (t as Truck & { actualEtd?: unknown }).actualEtd), item.statusLabel, item.arrivalText, minutes(item.standard), minutes(item.actual), minutes(item.excess === null ? null : Math.max(0, item.excess)), item.problem, text(t.actionStatus) || 'ยังไม่มีข้อมูล'];
}

function matchesDwell(row: ReportRow, options: DwellOptions): boolean {
  if (!isInbound(row.truck)) return false;
  const excess = dwellExcess(row.truck, options);
  if (excess === null) return false;
  if (options.scope === 'EXCEEDED' && !(excess > 0 && excess >= options.excessMinutes)) return false;
  if (options.arrival !== 'ALL' && summaryStatus(row.truck, 0) !== options.arrival) return false;
  const recorded = Boolean(text(row.truck.actionProblem));
  return options.problem === 'ALL' || (options.problem === 'RECORDED' ? recorded : !recorded);
}
const DEFAULT_TOLERANCE_MINUTES = 10;
const TOLERANCE_OPTIONS = [0, 3, 5, 10, 15, 20, 30, 45, 60];
const MAX_REPORT_DAYS = 92;
const reportGroups: Array<{ title: string; reports: Array<{ id: Kind; title: string; description: string }> }> = [
  { title: 'รายงานสรุป', reports: [
    { id: 'SUMMARY', title: 'รายงานรถเข้า-ออกพื้นที่ทั้งหมด', description: 'สรุปจำนวนเที่ยวรถเข้าและออกพื้นที่ในช่วงเวลาที่เลือก' },
    { id: 'EARLY', title: 'รายงานรถเข้าพื้นที่ก่อนเวลา', description: 'สรุปจำนวนเที่ยวและระยะเวลาที่รถเข้าพื้นที่ก่อนช่วง ON PLAN' },
    { id: 'ONTIME', title: 'รายงานรถเข้าพื้นที่ตามแผน', description: 'สรุปจำนวนเที่ยวที่รถเข้าพื้นที่ภายในช่วง ON PLAN' },
    { id: 'LATE', title: 'รายงานรถเข้าพื้นที่ล่าช้า', description: 'สรุปจำนวนเที่ยวและระยะเวลาที่รถเข้าพื้นที่หลังช่วง ON PLAN' },
  ]},
  { title: 'รายงานประสิทธิภาพการปฏิบัติงาน', reports: [
    { id: 'DWELL', title: 'รายงานระยะเวลาปฏิบัติงาน', description: 'สรุประยะเวลาปฏิบัติงานจริงเทียบกับแผน แยกตามจุดลงงาน' },
  ]},
  { title: 'รายงานการวิเคราะห์ปัญหา', reports: [
    { id: 'POINT', title: 'รายงานปัญหาแยกตามจุดลงงาน', description: 'สรุปจำนวนและสัดส่วนเที่ยวที่พบปัญหาในแต่ละจุดลงงาน' },
    { id: 'ROUTE', title: 'รายงานเส้นทางที่พบปัญหาบ่อยที่สุด', description: 'จัดอันดับเส้นทางตามจำนวนและสัดส่วนเที่ยวที่พบปัญหา' },
    { id: 'SUPPLIER', title: 'รายงานสังกัดที่พบปัญหามากที่สุด', description: 'จัดอันดับสังกัดตามจำนวนและสัดส่วนเที่ยวที่พบปัญหา' },
  ]},
];
const flatReports = reportGroups.flatMap(group => group.reports);
const buttonClass = 'rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';

function text(value: unknown): string { return String(value ?? '').trim(); }
function upper(value: unknown): string { return text(value).toUpperCase(); }
function isInbound(truck: Truck): boolean { return upper(truck.project) === 'INBOUND'; }
function isCancelled(truck: Truck & { planRemark?: string }): boolean { return ['CANCEL', 'CANCELLED', 'CANCELED'].includes(upper(truck.planRemark)) || ['CANCEL', 'CANCELLED', 'CANCELED'].includes(upper(truck.status)); }
function isNoWork(truck: Truck & { planRemark?: string }): boolean {
  const status = upper(truck.status).replace(/[\s-]+/g, '_');
  const performanceStatus = upper(truck.performanceStatus).replace(/[\s-]+/g, '_');
  const remark = upper(truck.planRemark).replace(/[\s-]+/g, '_');
  return ['NO_WORK', 'NO_DROP'].includes(status) || ['NO_WORK', 'NO_DROP'].includes(performanceStatus) || ['NO_WORK', 'NO_DROP'].includes(remark) || text(truck.actionProblem).includes('ไม่มีงาน');
}
function isTimeEligible(truck: Truck & { planRemark?: string }): boolean { return !isCancelled(truck) && !isNoWork(truck); }
function timeMinutes(value: unknown): number | null {
  const match = text(value).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const hour = Number(match[1]); const minute = Number(match[2]); const second = Number(match[3] || 0);
  if (hour > 23 || minute > 59 || second > 59) return null;
  return hour * 60 + minute + second / 60;
}
function etaDifference(truck: Truck & { planRemark?: string }): number | null {
  if (!isTimeEligible(truck)) return null;
  const plan = timeMinutes(truck.planEta); const actual = timeMinutes(truck.stampEta || truck.actualEta);
  if (plan === null || actual === null) return null;
  const raw = actual - plan;
  const difference = raw > 720 ? raw - 1440 : raw < -720 ? raw + 1440 : raw;
  return Math.abs(difference) > 720 ? null : difference;
}
function duration(start: unknown, end: unknown): number | null {
  const first = timeMinutes(start); const last = timeMinutes(end);
  if (first === null || last === null) return null;
  const result = last >= first ? last - first : last + 1440 - first;
  return result <= 720 ? result : null;
}
function dwellDifferenceRaw(truck: Truck & { planRemark?: string }): number | null {
  if (!isTimeEligible(truck)) return null;
  const planned = duration(truck.planEta, truck.planEtd);
  const actualEtd = truck.stampEtd || (truck as Truck & { actualEtd?: unknown }).actualEtd;
  const actual = duration(truck.stampEta || truck.actualEta, actualEtd);
  return planned === null || actual === null ? null : actual - planned;
}
function arrivalClass(truck: Truck & { planRemark?: string }, toleranceMinutes: number): 'EARLY' | 'ONTIME' | 'LATE' | null {
  const difference = etaDifference(truck);
  if (difference === null) return null;
  if (difference < -toleranceMinutes) return 'EARLY';
  if (difference > toleranceMinutes) return 'LATE';
  return 'ONTIME';
}
// Only the overall SUMMARY report uses Plan ETD as the start of Delay.
// Compare all clock times relative to Plan ETA so midnight crossings remain valid.
function summaryDelayMinutes(truck: Truck & { planRemark?: string }): number | null {
  const arrivalDiff = etaDifference(truck);
  const plannedWindow = duration(truck.planEta, truck.planEtd);
  if (arrivalDiff === null || plannedWindow === null) return null;
  return Math.max(0, arrivalDiff - plannedWindow);
}
function summaryStatus(truck: Truck & { planRemark?: string }, allowance = 0): SummaryStatus | null {
  if (isCancelled(truck) || isNoWork(truck)) return 'EXCLUDED';
  const difference = etaDifference(truck);
  const delay = summaryDelayMinutes(truck);
  if (difference === null || delay === null) return null;
  if (difference < -allowance) return 'EARLY';
  if (delay > allowance) return 'LATE';
  return 'ONTIME';
}
function summaryStatusLabel(status: SummaryStatus): string {
  if (status === 'EARLY') return 'Early';
  if (status === 'ONTIME') return 'On Plan';
  if (status === 'LATE') return 'Delay';
  return 'No Drop / Cancel';
}
function timeResultText(truck: Truck & { planRemark?: string }, status: SummaryStatus, allowance = 0): string {
  if (status === 'EXCLUDED') return isCancelled(truck) ? 'Cancel' : 'No Drop';
  if (status === 'ONTIME') return 'On Plan';
  // Count only minutes outside the expanded Plan ETA / Plan ETD window.
  const difference = status === 'LATE' ? summaryDelayMinutes(truck) : etaDifference(truck);
  const minutes = difference === null ? 0 : Math.max(0, Math.abs(difference) - allowance);
  return `${status === 'EARLY' ? 'ก่อนเวลา' : 'ล่าช้า'} ${Math.round(minutes)} นาที`;
}
function timeBeyondOnPlan(truck: Truck & { planRemark?: string }, toleranceMinutes: number): number | null {
  const difference = etaDifference(truck);
  if (difference === null) return null;
  if (difference < -toleranceMinutes) return -difference - toleranceMinutes;
  if (difference > toleranceMinutes) return difference - toleranceMinutes;
  return 0;
}
function dwellBeyondTolerance(truck: Truck & { planRemark?: string }, toleranceMinutes: number): number | null {
  const difference = dwellDifferenceRaw(truck);
  return difference === null ? null : Math.max(0, difference - toleranceMinutes);
}
function planDateTimeValue(row: ReportRow): number | null {
  const date = text(row.date).slice(0, 10);
  const time = text(row.truck.planEta).slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,2}:\d{2}$/.test(time)) return null;
  const timestamp = Date.parse(`${date}T${time.padStart(5, '0')}:00+07:00`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function problemReason(truck: Truck): string {
  const problem = text(truck.actionProblem); if (!problem) return '';
  const reason = problem.split(/\s*[:：]\s*/)[0];
  if (/GPS/i.test(reason)) return 'GPS มีปัญหา';
  if (reason.includes('ไม่มีงาน')) return 'ไม่มีงานลง';
  if (reason.includes('ช่อง') && reason.includes('ไม่พร้อม')) return 'ช่องลงงานไม่พร้อม';
  if (reason.includes('งานไม่พร้อม')) return 'งานไม่พร้อม';
  if (reason.includes('ทะเบียน')) return 'ปัญหาทะเบียนรถ';
  return 'อื่น ๆ';
}
function datesBetween(start: string, end: string): string[] {
  const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (!valid(start) || !valid(end)) throw new Error('กรุณาระบุช่วงวันที่ให้ถูกต้อง');
  if (start > end) throw new Error('วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด');
  const days: string[] = [];
  for (let timestamp = Date.parse(`${start}T00:00:00Z`); timestamp <= Date.parse(`${end}T00:00:00Z`); timestamp += 86400000) {
    if (days.length >= MAX_REPORT_DAYS) throw new Error(`เลือกช่วงวันที่ได้ไม่เกิน ${MAX_REPORT_DAYS} วันต่อครั้ง`);
    days.push(new Date(timestamp).toISOString().slice(0, 10));
  }
  return days;
}
function average(values: number[]): number | null { return values.length ? values.reduce((sum, item) => sum + item, 0) / values.length : null; }
function percentage(value: number | null): string { return value === null ? 'ไม่มีข้อมูลประเมิน' : `${value.toFixed(1)}%`; }
function minuteText(value: number | null): string { return value === null ? 'ไม่มีข้อมูลประเมิน' : `${Math.round(value)} นาที`; }
function csvCell(value: unknown): string {
  const original = text(value); const safe = /^\s*[=+@-]/.test(original) ? `'${original}` : original;
  return `"${safe.replace(/"/g, '""')}"`;
}
function metricBy(rows: ReportRow[], key: (row: ReportRow) => string, kind: Kind, toleranceMinutes: number): MetricRow[] {
  const names = Array.from(new Set(rows.map(key).filter(Boolean)));
  return names.map(name => {
    const group = rows.filter(row => key(row) === name);
    if (kind === 'DWELL') {
      const differences = group.map(row => dwellBeyondTolerance(row.truck, toleranceMinutes)).filter((item): item is number => item !== null);
      const exceeded = differences.filter(item => item > 0);
      return { name, total: group.length, measured: differences.length, count: exceeded.length, rate: differences.length ? exceeded.length / differences.length * 100 : null, average: average(exceeded), maximum: exceeded.length ? Math.max(...exceeded) : null };
    }
    if (kind === 'POINT' || kind === 'ROUTE' || kind === 'SUPPLIER') {
      const problemRows = group.filter(row => problemReason(row.truck));
      const reasonCount = new Map<string, number>();
      problemRows.forEach(row => { const reason = problemReason(row.truck); reasonCount.set(reason, (reasonCount.get(reason) || 0) + 1); });
      const topReason = Array.from(reasonCount.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';
      return { name, total: group.length, measured: group.length, count: problemRows.length, rate: group.length ? problemRows.length / group.length * 100 : null, average: null, maximum: null, topReason };
    }
    const measured = group.filter(row => arrivalClass(row.truck, toleranceMinutes));
    const matched = measured.filter(row => arrivalClass(row.truck, toleranceMinutes) === kind);
    const values = matched.map(row => timeBeyondOnPlan(row.truck, toleranceMinutes) || 0);
    return { name, total: group.length, measured: measured.length, count: matched.length, rate: measured.length ? matched.length / measured.length * 100 : null, average: average(values), maximum: values.length ? Math.max(...values) : null };
  }).sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || b.count - a.count || a.name.localeCompare(b.name, 'th'));
}

function MultiSelectField({ label, options, values, onChange, placeholder = 'ทั้งหมด' }: { label: string; options: string[]; values: string[]; onChange: (values: string[]) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const filteredOptions = options.filter(option => !values.includes(option) && option.toLocaleLowerCase('th').includes(query.trim().toLocaleLowerCase('th')));
  const selectOption = (value: string) => {
    if (!values.includes(value)) onChange([...(values.includes('ทั้งหมด') ? [] : values), value]);
    setQuery('');
    setOpen(true);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };
  const removeOption = (value: string) => onChange(values.filter(item => item !== value));
  return <div ref={wrapperRef} className="relative">
    <label className="text-sm font-bold text-slate-700">{label}</label>
    <div onClick={() => { setOpen(true); inputRef.current?.focus(); }} className="mt-2 flex min-h-[52px] w-full cursor-text flex-wrap items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
      {values.map(value => <span key={value} className="inline-flex max-w-full items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-bold text-blue-800">
        <span className="truncate">{value}</span>
        <button type="button" aria-label={`ยกเลิก ${value}`} onClick={event => { event.stopPropagation(); removeOption(value); }} className="text-base leading-none text-blue-500 hover:text-red-600">×</button>
      </span>)}
      <input ref={inputRef} type="text" value={query} onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setOpen(true); }} onKeyDown={event => {
        if (event.key === 'Enter' && filteredOptions.length) { event.preventDefault(); selectOption(filteredOptions[0]); }
        if (event.key === 'Backspace' && !query && values.length) removeOption(values[values.length - 1]);
        if (event.key === 'Escape') { setOpen(false); setQuery(''); }
      }} placeholder={!values.length ? placeholder : ''} className="min-w-[90px] flex-1 border-0 bg-transparent py-1 text-sm text-slate-800 outline-none placeholder:text-slate-400" />
      <button type="button" aria-label={`เปิดรายการ ${label}`} onClick={event => { event.stopPropagation(); setOpen(current => !current); inputRef.current?.focus(); }} className="ml-auto shrink-0 px-1 text-slate-500">▾</button>
    </div>
    {open && <div className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl">
      <button type="button" onClick={() => { onChange(['ทั้งหมด']); setQuery(''); setOpen(false); }} className="w-full rounded-md px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-100">ทั้งหมด</button>
      {filteredOptions.map(option => <button key={option} type="button" onClick={() => selectOption(option)} className="block w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-800">{option}</button>)}
      {!filteredOptions.length && query && <p className="px-3 py-3 text-sm text-slate-500">ไม่พบรายการ</p>}
    </div>}
  </div>;
}


const detailColumns = ['วันที่', 'Project', 'Route', 'สังกัด', 'ทะเบียน', 'จุดลงงาน', 'Plan ETA', 'Actual ETA', 'Plan ETD', 'Actual ETD', 'สถานะ', 'Remark'];
function detailCells(row: ReportRow, status: SummaryStatus, allowance = 0): string[] {
  return [row.date, row.truck.project, row.truck.route, row.truck.supplierName, row.truck.licensePlate, row.truck.dropPoint, row.truck.planEta, row.truck.stampEta || row.truck.actualEta, row.truck.planEtd, row.truck.stampEtd || (row.truck as Truck & { actualEtd?: unknown }).actualEtd, summaryStatusLabel(status), timeResultText(row.truck, status, allowance)].map(text);
}
function escapeMarkup(value: string): string { return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char] || char)).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''); }
function downloadWorkbook(data: string[][], filename: string): void {
  const enc = new TextEncoder();
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const sheet = xml + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="12" width="22" customWidth="1"/></cols><sheetData>' + data.map((row, r) => '<row r="' + (r + 1) + '">' + row.map((value, c) => '<c r="' + String.fromCharCode(65 + c) + (r + 1) + '" t="inlineStr"><is><t xml:space="preserve">' + escapeMarkup(value) + '</t></is></c>').join('') + '</row>').join('') + '</sheetData><autoFilter ref="A1:L' + Math.max(1, data.length) + '"/></worksheet>';
  const files: [string, string][] = [
    ['[Content_Types].xml', xml + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
    ['_rels/.rels', xml + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', xml + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="ELIVE Report" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', xml + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],
    ['xl/worksheets/sheet1.xml', sheet]
  ];
  const chunks: Uint8Array[] = []; const directory: Uint8Array[] = []; let offset = 0;
  const crc32 = (bytes: Uint8Array): number => { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; };
  for (const [name, content] of files) {
    const n = enc.encode(name); const b = enc.encode(content); const crc = crc32(b);
    const local = new Uint8Array(30 + n.length); const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(12, 33, true); lv.setUint32(14, crc, true); lv.setUint32(18, b.length, true); lv.setUint32(22, b.length, true); lv.setUint16(26, n.length, true); local.set(n, 30);
    const central = new Uint8Array(46 + n.length); const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(14, 33, true); cv.setUint32(16, crc, true); cv.setUint32(20, b.length, true); cv.setUint32(24, b.length, true); cv.setUint16(28, n.length, true); cv.setUint32(42, offset, true); central.set(n, 46);
    chunks.push(local, b); directory.push(central); offset += local.length + b.length;
  }
  const end = new Uint8Array(22); const ev = new DataView(end.buffer); ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true); ev.setUint32(12, directory.reduce((sum, item) => sum + item.length, 0), true); ev.setUint32(16, offset, true);
  const parts = [...chunks, ...directory, end].map(part => new Uint8Array(part).buffer);
  const url = URL.createObjectURL(new Blob(parts, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const earlyTableColumns = ['วันที่', 'Project', 'Route', 'สังกัด', 'ทะเบียน', 'จุดลงงาน', 'Plan ETA', 'Actual ETA', 'Plan ETD', 'Actual ETD', 'สถานะ', 'Remark'];
function earlyTableCells(row: ReportRow): string[] {
  const minutes = etaDifference(row.truck);
  return [row.date, row.truck.project, row.truck.route, row.truck.supplierName, row.truck.licensePlate, row.truck.dropPoint, row.truck.planEta, row.truck.stampEta || row.truck.actualEta, row.truck.planEtd, row.truck.stampEtd || (row.truck as Truck & { actualEtd?: unknown }).actualEtd, 'Early', minutes === null ? '-' : `ก่อนเวลา ${Math.round(-minutes)} นาที`].map(text);
}
function earlyActualBucket(row: ReportRow, bucketSize: number): number | null {
  const minute = timeMinutes(row.truck.stampEta || row.truck.actualEta);
  return minute === null ? null : Math.floor(minute / bucketSize) * bucketSize;
}
const lateTableColumns = ['วันที่', 'Project', 'Route', 'สังกัด', 'ทะเบียน', 'จุดลงงาน', 'Plan ETA', 'Actual ETA', 'Plan ETD', 'Actual ETD', 'สถานะ', 'Remark'];
function lateTableCells(row: ReportRow): string[] {
  const minutes = summaryDelayMinutes(row.truck);
  return [row.date, row.truck.project, row.truck.route, row.truck.supplierName, row.truck.licensePlate, row.truck.dropPoint, row.truck.planEta, row.truck.stampEta || row.truck.actualEta, row.truck.planEtd, row.truck.stampEtd || (row.truck as Truck & { actualEtd?: unknown }).actualEtd, 'Delay', minutes === null ? '-' : `ล่าช้า ${Math.round(minutes)} นาที`].map(text);
}
function lateActualBucket(row: ReportRow, bucketSize: number): number | null {
  const minute = timeMinutes(row.truck.stampEta || row.truck.actualEta);
  return minute === null ? null : Math.floor(minute / bucketSize) * bucketSize;
}
const ontimeTableColumns = ['วันที่', 'Project', 'Route', 'สังกัด', 'ทะเบียน', 'จุดลงงาน', 'Plan ETA', 'Actual ETA', 'Plan ETD', 'Actual ETD', 'สถานะ', 'Remark'];
function ontimeTableCells(row: ReportRow): string[] {
  
  return [row.date, row.truck.project, row.truck.route, row.truck.supplierName, row.truck.licensePlate, row.truck.dropPoint, row.truck.planEta, row.truck.stampEta || row.truck.actualEta, row.truck.planEtd, row.truck.stampEtd || (row.truck as Truck & { actualEtd?: unknown }).actualEtd, 'On Plan', 'อยู่ในช่วงเวลาตามแผนรวมเวลาเผื่อ'].map(text);
}
function ontimeActualBucket(row: ReportRow, bucketSize: number): number | null {
  const minute = timeMinutes(row.truck.stampEta || row.truck.actualEta);
  return minute === null ? null : Math.floor(minute / bucketSize) * bucketSize;
}
function clockLabel(minutes: number): string { return `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`; }
function isWithinPlanWindow(truck: Truck & { planRemark?: string }, allowance: number): boolean {
  const difference = etaDifference(truck);
  const window = duration(truck.planEta, truck.planEtd);
  return difference !== null && window !== null && difference >= -allowance && difference <= window + allowance;
}
function downloadDwellWorkbook(data: string[][], filename: string): void {
  const enc = new TextEncoder();
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const sheet = xml + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="17" width="22" customWidth="1"/></cols><sheetData>' + data.map((row, r) => '<row r="' + (r + 1) + '">' + row.map((value, c) => '<c r="' + String.fromCharCode(65 + c) + (r + 1) + '" t="inlineStr"><is><t xml:space="preserve">' + escapeMarkup(value) + '</t></is></c>').join('') + '</row>').join('') + '</sheetData><autoFilter ref="A1:Q' + Math.max(1, data.length) + '"/></worksheet>';
  const files: [string, string][] = [
    ['[Content_Types].xml', xml + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
    ['_rels/.rels', xml + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', xml + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="ELIVE Report" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', xml + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],
    ['xl/worksheets/sheet1.xml', sheet]
  ];
  const chunks: Uint8Array[] = []; const directory: Uint8Array[] = []; let offset = 0;
  const crc32 = (bytes: Uint8Array): number => { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; };
  for (const [name, content] of files) {
    const n = enc.encode(name); const b = enc.encode(content); const crc = crc32(b);
    const local = new Uint8Array(30 + n.length); const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(12, 33, true); lv.setUint32(14, crc, true); lv.setUint32(18, b.length, true); lv.setUint32(22, b.length, true); lv.setUint16(26, n.length, true); local.set(n, 30);
    const central = new Uint8Array(46 + n.length); const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(14, 33, true); cv.setUint32(16, crc, true); cv.setUint32(20, b.length, true); cv.setUint32(24, b.length, true); cv.setUint16(28, n.length, true); cv.setUint32(42, offset, true); central.set(n, 46);
    chunks.push(local, b); directory.push(central); offset += local.length + b.length;
  }
  const end = new Uint8Array(22); const ev = new DataView(end.buffer); ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true); ev.setUint32(12, directory.reduce((sum, item) => sum + item.length, 0), true); ev.setUint32(16, offset, true);
  const parts = [...chunks, ...directory, end].map(part => new Uint8Array(part).buffer);
  const url = URL.createObjectURL(new Blob(parts, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Report({ trucks, selectedDate = '' }: ReportProps) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const initial = /^\d{4}-\d{2}-\d{2}$/.test(selectedDate) ? selectedDate : today;
  const [selectedKind, setSelectedKind] = useState<Kind | null>(null);
  const [startDate, setStartDate] = useState(initial);
  const [endDate, setEndDate] = useState(initial);
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState('00:00');
  const [endTime, setEndTime] = useState('23:59');
  const [toleranceMode, setToleranceMode] = useState<'PRESET' | 'CUSTOM'>('PRESET');
  const [presetTolerance, setPresetTolerance] = useState(DEFAULT_TOLERANCE_MINUTES);
  const [customTolerance, setCustomTolerance] = useState('10');
  const [selectedProjects, setSelectedProjects] = useState<string[]>(['INBOUND']);
  const [selectedRoutes, setSelectedRoutes] = useState<string[]>(['ทั้งหมด']);
  const [selectedDropPoints, setSelectedDropPoints] = useState<string[]>(['ทั้งหมด']);
  const [dwellSelectedRoute, setDwellSelectedRoute] = useState<string | null>(null);
  const [dwellTableFilters, setDwellTableFilters] = useState<string[]>(Array(DWELL_COLUMNS.length).fill(''));
  const [dwellChartPage, setDwellChartPage] = useState(0);
  const [dwellArrivalSelection, setDwellArrivalSelection] = useState<string | null>(null);
  const [dwellStandardMode, setDwellStandardMode] = useState<'PLAN' | 'CUSTOM'>('PLAN');
  const [dwellStandardMinutes, setDwellStandardMinutes] = useState('15');
  const [dwellScope, setDwellScope] = useState<'ALL' | 'EXCEEDED'>('EXCEEDED');
  const [dwellThreshold, setDwellThreshold] = useState('10');
  const [dwellArrival, setDwellArrival] = useState<DwellOptions['arrival']>('ALL');
  const [dwellProblem, setDwellProblem] = useState<DwellOptions['problem']>('ALL');
  const [dwellSuppliers, setDwellSuppliers] = useState<string[]>(['ทั้งหมด']);
  const dwellSupplierOptions = useMemo(() => Array.from(new Set(trucks.filter(isInbound).map(truck => text(truck.supplierName) || 'ไม่ระบุสังกัด'))).sort(), [trucks]);
  const [result, setResult] = useState<{ kind: Kind; days: string[]; rows: ReportRow[]; start: string; end: string; startTime: string; endTime: string; allDay: boolean; toleranceMinutes: number; dwellOptions?: DwellOptions } | null>(null);
  const [supplier, setSupplier] = useState('');
  const [detailFilters, setDetailFilters] = useState<string[]>(Array(12).fill(''));
  const [exportError, setExportError] = useState('');
  const [earlyBucketSize, setEarlyBucketSize] = useState<30 | 60>(60);
  const [earlySelectedBucket, setEarlySelectedBucket] = useState<number | null>(null);
  const [earlySelectedDate, setEarlySelectedDate] = useState<string | null>(null);
  const [earlyFilters, setEarlyFilters] = useState<string[]>(Array(12).fill(''));
  const [lateBucketSize, setLateBucketSize] = useState<30 | 60>(60);
  const [lateSelectedBucket, setLateSelectedBucket] = useState<number | null>(null);
  const [lateSelectedDate, setLateSelectedDate] = useState<string | null>(null);
  const [lateFilters, setLateFilters] = useState<string[]>(Array(12).fill(''));
  const [ontimeBucketSize, setOntimeBucketSize] = useState<30 | 60>(60);
  const [ontimeSelectedBucket, setOntimeSelectedBucket] = useState<number | null>(null);
  const [ontimeSelectedDate, setOntimeSelectedDate] = useState<string | null>(null);
  const [ontimeFilters, setOntimeFilters] = useState<string[]>(Array(12).fill(''));
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [, setShowDetails] = useState(false);
  const generation = useRef(0);
  const dwellDetailsRef = useRef<HTMLElement | null>(null);
  const projectOptions = useMemo(() => Array.from(new Set(['INBOUND', ...trucks.map(truck => upper(truck.project)).filter(Boolean)])).sort(), [trucks]);
  const routeOptions = useMemo(() => Array.from(new Set(trucks.map(truck => text(truck.route)).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'th')), [trucks]);
  const dropPointOptions = useMemo(() => Array.from(new Set(trucks.map(truck => text(truck.dropPoint)).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'th')), [trucks]);
  useEffect(() => () => { generation.current += 1; }, []);

  const openReport = (kind: Kind) => { setSelectedKind(kind); setResult(null); setError(''); setShowDetails(false); setDetailFilters(Array(12).fill('')); setExportError(''); setEarlySelectedBucket(null); setEarlySelectedDate(null); setEarlyFilters(Array(12).fill('')); setLateSelectedBucket(null); setLateSelectedDate(null); setLateFilters(Array(12).fill('')); setOntimeSelectedBucket(null); setOntimeSelectedDate(null); setOntimeFilters(Array(12).fill('')); };
  const loadReport = async (event: React.FormEvent) => {
    event.preventDefault(); if (!selectedKind || loading) return;
    let days: string[];
    try { days = datesBetween(startDate, endDate); } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'ช่วงวันที่ไม่ถูกต้อง'); return; }
    const toleranceMinutes = selectedKind === 'DWELL' ? 0 : toleranceMode === 'CUSTOM' ? Number(customTolerance) : presetTolerance;
    const dwellOptions: DwellOptions | undefined = selectedKind === 'DWELL' ? {
      standardMode: dwellStandardMode, standardMinutes: Number(dwellStandardMinutes), scope: dwellScope,
      excessMinutes: Number(dwellThreshold), arrival: dwellArrival, problem: dwellProblem,
    } : undefined;
    if (dwellOptions && dwellOptions.standardMode === 'CUSTOM' && (!dwellStandardMinutes.trim() || !Number.isInteger(dwellOptions.standardMinutes) || dwellOptions.standardMinutes < 1 || dwellOptions.standardMinutes > 720)) {
      setError('กรุณาระบุมาตรฐาน 1–720 นาที'); return;
    }
    if (dwellOptions && dwellOptions.scope === 'EXCEEDED' && (!dwellThreshold.trim() || !Number.isInteger(dwellOptions.excessMinutes) || dwellOptions.excessMinutes < 0 || dwellOptions.excessMinutes > 720)) {
      setError('กรุณาระบุระยะเวลาเกินมาตรฐาน 0–720 นาที'); return;
    }
    const isTimeReport = ['SUMMARY', 'EARLY', 'ONTIME', 'LATE', 'DWELL'].includes(selectedKind);
    const minimumTolerance = ['SUMMARY', 'ONTIME', 'DWELL'].includes(selectedKind) ? 0 : 1;
    if (isTimeReport && (!Number.isInteger(toleranceMinutes) || toleranceMinutes < minimumTolerance || toleranceMinutes > 720)) { setError(`กรุณาระบุเกณฑ์เวลา ${minimumTolerance}–720 นาที`); return; }
    const effectiveStartTime = startTime;
    const effectiveEndTime = endTime;
    const rangeStart = Date.parse(`${startDate}T${effectiveStartTime}:00+07:00`);
    const rangeEnd = Date.parse(`${endDate}T${effectiveEndTime}:59+07:00`);
    if (!Number.isFinite(rangeStart) || !Number.isFinite(rangeEnd) || rangeStart > rangeEnd) { setError('ช่วงวันและเวลาไม่ถูกต้อง'); return; }
    const token = ++generation.current; const rows: ReportRow[] = [];
    setLoading(true); setError(''); setProgress('');
    try {
      for (let index = 0; index < days.length; index++) {
        if (token !== generation.current) return;
        const date = days[index]; setProgress(`กำลังโหลด ${index + 1}/${days.length} วัน · ${date}`);
        const [dashboard, plans] = await Promise.all([fetchEliveDashboardData(date, false), fetchDailyPlans(date)]);
        if (token !== generation.current) return;
        if (!dashboard || !Array.isArray(dashboard.trucks) || !plans || !Array.isArray(plans.rows)) throw new Error(`ข้อมูลวันที่ ${date} ไม่สมบูรณ์`);
        const actualById = new Map(dashboard.trucks.map(truck => [upper(truck.id), truck]));
        const usedIds = new Set<string>();
        for (const plan of plans.rows) {
          const planProject = upper(plan.project);
                      if (selectedKind === 'DWELL' && planProject !== 'INBOUND') continue;
            if (selectedKind !== 'DWELL' && selectedProjects.length && !selectedProjects.includes('ทั้งหมด') && !selectedProjects.includes(planProject)) continue;
          if (selectedRoutes.length && !selectedRoutes.includes('ทั้งหมด') && !selectedRoutes.includes(text(plan.route))) continue;
          if (selectedDropPoints.length && !selectedDropPoints.includes('ทั้งหมด') && !selectedDropPoints.includes(text(plan.dropPoint))) continue;
          const id = upper(plan.codeRun); if (!id || usedIds.has(id)) continue; usedIds.add(id);
          const actual = actualById.get(id);
          const truck = { ...actual, id, planDate: date, project: plan.project, route: plan.route, supplierName: plan.company, licensePlate: plan.truckName, dropPoint: plan.dropPoint, planEta: plan.planEta, planEtd: plan.planEtd, planRemark: plan.remark } as Truck & { planRemark?: string };
                      const reportRow = { truck, date };
            if (dwellOptions) {
              (truck as Truck & { driverName?: unknown }).driverName = text((actual as (Truck & { driverName?: unknown }) | undefined)?.driverName) || text((plan as typeof plan & { driverName?: unknown }).driverName);
              if (dwellSuppliers.length && !dwellSuppliers.includes('ทั้งหมด') && !dwellSuppliers.includes(text(truck.supplierName) || 'ไม่ระบุสังกัด')) continue;
              if (!matchesDwell(reportRow, dwellOptions)) continue;
            }
          const plannedAt = planDateTimeValue(reportRow);
          if (plannedAt !== null && plannedAt >= rangeStart && plannedAt <= rangeEnd) rows.push(reportRow);
        }
      }
      setResult({ kind: selectedKind, days, rows, start: startDate, end: endDate, startTime: effectiveStartTime, endTime: effectiveEndTime, allDay, toleranceMinutes, dwellOptions }); setSupplier(''); setDwellSelectedRoute(null); setDwellArrivalSelection(null); setDwellChartPage(0); setDwellTableFilters(Array(DWELL_COLUMNS.length).fill('')); setProgress(''); setShowDetails(false); setDetailFilters(Array(12).fill('')); setEarlySelectedBucket(null); setEarlySelectedDate(null); setEarlyFilters(Array(12).fill('')); setLateSelectedBucket(null); setLateSelectedDate(null); setLateFilters(Array(12).fill('')); setOntimeSelectedBucket(null); setOntimeSelectedDate(null); setOntimeFilters(Array(12).fill('')); setExportError('');
    } catch (loadError) {
      if (token === generation.current) setError(`${loadError instanceof Error ? loadError.message : 'โหลดข้อมูลไม่สำเร็จ'} · ไม่แสดงผลจากข้อมูลที่โหลดไม่ครบ`);
    } finally { if (token === generation.current) setLoading(false); }
  };
  const cancelLoading = () => { generation.current += 1; setLoading(false); setProgress('ยกเลิกการโหลดแล้ว'); };
  const suppliers = useMemo(() => Array.from(new Set((result?.rows || []).map(row => text(row.truck.supplierName) || 'ไม่ระบุสังกัด'))).sort(), [result]);
  const rows = useMemo(() => (result?.rows || []).filter(row => !supplier || (text(row.truck.supplierName) || 'ไม่ระบุสังกัด') === supplier), [result, supplier]);
  const kind = result?.kind;
  const toleranceMinutes = result?.toleranceMinutes ?? DEFAULT_TOLERANCE_MINUTES;
  const measuredArrival = useMemo(() => rows.filter(row => arrivalClass(row.truck, toleranceMinutes)), [rows]);
  const matchedArrival = useMemo(() => kind && ['EARLY', 'ONTIME', 'LATE'].includes(kind) ? measuredArrival.filter(row => arrivalClass(row.truck, toleranceMinutes) === kind) : [], [kind, measuredArrival]);
  const arrivalValues = useMemo(() => matchedArrival.map(row => timeBeyondOnPlan(row.truck, toleranceMinutes) || 0), [matchedArrival]);
  const earlyQualified = useMemo(() => rows.filter(row => {
    const difference = etaDifference(row.truck);
    return difference !== null && difference <= -toleranceMinutes;
  }), [rows, toleranceMinutes]);
  const earlyHourBins = useMemo(() => Array.from({ length: 1440 / earlyBucketSize }, (_, index) => {
    const start = index * earlyBucketSize;
    const group = earlyQualified.filter(row => earlyActualBucket(row, earlyBucketSize) === start);
    const difference = group.map(row => -(etaDifference(row.truck) || 0));
    return { start, name: `${clockLabel(start)}–${clockLabel((start + earlyBucketSize) % 1440)}`, count: group.length, average: average(difference) };
  }), [earlyQualified, earlyBucketSize]);
  const earlyPeak = useMemo(() => earlyHourBins.reduce((best, bin) => bin.count > best.count ? bin : best, earlyHourBins[0]), [earlyHourBins]);
  const earlyHeatDates = useMemo(() => Array.from(new Set(earlyQualified.map(row => row.date))).sort(), [earlyQualified]);
  const earlyAfterClick = useMemo(() => earlyQualified.filter(row =>
    (earlySelectedDate === null || row.date === earlySelectedDate) &&
    (earlySelectedBucket === null || earlyActualBucket(row, earlyBucketSize) === earlySelectedBucket)
  ), [earlyQualified, earlySelectedDate, earlySelectedBucket, earlyBucketSize]);
  const earlyDisplayed = useMemo(() => earlyAfterClick.filter(row => {
    const cells = earlyTableCells(row);
    return earlyFilters.every((query, index) => !query.trim() || cells[index].toLocaleLowerCase('th').includes(query.trim().toLocaleLowerCase('th')));
  }), [earlyAfterClick, earlyFilters]);
  const earlyExport = (format: 'csv' | 'excel' | 'pdf') => {
    const data = [earlyTableColumns, ...earlyDisplayed.map(earlyTableCells)];
    const filename = `ELIVE-Early-${result?.start || 'report'}-${result?.end || 'report'}`;
    try {
      setExportError('');
      if (format === 'excel') { downloadWorkbook(data, `${filename}.xlsx`); return; }
      if (format === 'csv') {
        const output = '\uFEFF' + data.map(line => line.map(csvCell).join(',')).join('\r\n');
        const url = URL.createObjectURL(new Blob([output], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a'); link.href = url; link.download = `${filename}.csv`; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); return;
      }
      const popup = window.open('', '_blank', 'width=1200,height=800');
      if (!popup) { setExportError('กรุณาอนุญาตป๊อปอัปเพื่อบันทึก PDF'); return; }
      const cellHtml = (name: string) => escapeMarkup(name || '-');
      popup.document.open();
      popup.document.write('<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ELIVE Early Report</title><style>@page{size:A3 landscape;margin:10mm}body{font-family:Tahoma,Arial,sans-serif;color:#222;font-size:11px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:5px;text-align:left}th{background:#eee}thead{display:table-header-group}tr{break-inside:avoid}@media print{button{display:none}}</style></head><body><button onclick="window.print()">พิมพ์ / บันทึก PDF</button><h2>รายงานรถเข้าพื้นที่ก่อนเวลา</h2><table><thead><tr>' + data[0].map(v => `<th>${cellHtml(v)}</th>`).join('') + '</tr></thead><tbody>' + data.slice(1).map(line => '<tr>' + line.map(v => `<td>${cellHtml(v)}</td>`).join('') + '</tr>').join('') + '</tbody></table></body></html>');
      popup.document.close(); window.setTimeout(() => { if (!popup.closed) popup.print(); }, 500);
    } catch { setExportError('ส่งออกไฟล์ไม่สำเร็จ กรุณาลองอีกครั้ง'); }
  };
  const lateQualified = useMemo(() => rows.filter(row => {
    const difference = summaryDelayMinutes(row.truck);
    return difference !== null && difference >= toleranceMinutes;
  }), [rows, toleranceMinutes]);
  const lateHourBins = useMemo(() => Array.from({ length: 1440 / lateBucketSize }, (_, index) => {
    const start = index * lateBucketSize;
    const group = lateQualified.filter(row => lateActualBucket(row, lateBucketSize) === start);
    const difference = group.map(row => (summaryDelayMinutes(row.truck) || 0));
    return { start, name: `${clockLabel(start)}–${clockLabel((start + lateBucketSize) % 1440)}`, count: group.length, average: average(difference) };
  }), [lateQualified, lateBucketSize]);
  const latePeak = useMemo(() => lateHourBins.reduce((best, bin) => bin.count > best.count ? bin : best, lateHourBins[0]), [lateHourBins]);
  const lateHeatDates = useMemo(() => Array.from(new Set(lateQualified.map(row => row.date))).sort(), [lateQualified]);
  const lateAfterClick = useMemo(() => lateQualified.filter(row =>
    (lateSelectedDate === null || row.date === lateSelectedDate) &&
    (lateSelectedBucket === null || lateActualBucket(row, lateBucketSize) === lateSelectedBucket)
  ), [lateQualified, lateSelectedDate, lateSelectedBucket, lateBucketSize]);
  const lateDisplayed = useMemo(() => lateAfterClick.filter(row => {
    const cells = lateTableCells(row);
    return lateFilters.every((query, index) => !query.trim() || cells[index].toLocaleLowerCase('th').includes(query.trim().toLocaleLowerCase('th')));
  }), [lateAfterClick, lateFilters]);
  const lateExport = (format: 'csv' | 'excel' | 'pdf') => {
    const data = [lateTableColumns, ...lateDisplayed.map(lateTableCells)];
    const filename = `ELIVE-Late-${result?.start || 'report'}-${result?.end || 'report'}`;
    try {
      setExportError('');
      if (format === 'excel') { downloadWorkbook(data, `${filename}.xlsx`); return; }
      if (format === 'csv') {
        const output = '\uFEFF' + data.map(line => line.map(csvCell).join(',')).join('\r\n');
        const url = URL.createObjectURL(new Blob([output], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a'); link.href = url; link.download = `${filename}.csv`; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); return;
      }
      const popup = window.open('', '_blank', 'width=1200,height=800');
      if (!popup) { setExportError('กรุณาอนุญาตป๊อปอัปเพื่อบันทึก PDF'); return; }
      const cellHtml = (name: string) => escapeMarkup(name || '-');
      popup.document.open();
      popup.document.write('<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ELIVE Late Report</title><style>@page{size:A3 landscape;margin:10mm}body{font-family:Tahoma,Arial,sans-serif;color:#222;font-size:11px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:5px;text-align:left}th{background:#eee}thead{display:table-header-group}tr{break-inside:avoid}@media print{button{display:none}}</style></head><body><button onclick="window.print()">พิมพ์ / บันทึก PDF</button><h2>รายงานรถเข้าพื้นที่ล่าช้า</h2><table><thead><tr>' + data[0].map(v => `<th>${cellHtml(v)}</th>`).join('') + '</tr></thead><tbody>' + data.slice(1).map(line => '<tr>' + line.map(v => `<td>${cellHtml(v)}</td>`).join('') + '</tr>').join('') + '</tbody></table></body></html>');
      popup.document.close(); window.setTimeout(() => { if (!popup.closed) popup.print(); }, 500);
    } catch { setExportError('ส่งออกไฟล์ไม่สำเร็จ กรุณาลองอีกครั้ง'); }
  };
  const ontimeQualified = useMemo(() => rows.filter(row => isWithinPlanWindow(row.truck, toleranceMinutes)), [rows, toleranceMinutes]);
  const ontimeHourBins = useMemo(() => Array.from({ length: 1440 / ontimeBucketSize }, (_, index) => {
    const start = index * ontimeBucketSize;
    const group = ontimeQualified.filter(row => ontimeActualBucket(row, ontimeBucketSize) === start);
    const difference = group.map(row => (summaryDelayMinutes(row.truck) || 0));
    return { start, name: `${clockLabel(start)}–${clockLabel((start + ontimeBucketSize) % 1440)}`, count: group.length, average: average(difference) };
  }), [ontimeQualified, ontimeBucketSize]);
  const ontimePeak = useMemo(() => ontimeHourBins.reduce((best, bin) => bin.count > best.count ? bin : best, ontimeHourBins[0]), [ontimeHourBins]);
  const ontimeHeatDates = useMemo(() => Array.from(new Set(ontimeQualified.map(row => row.date))).sort(), [ontimeQualified]);
  const ontimeAfterClick = useMemo(() => ontimeQualified.filter(row =>
    (ontimeSelectedDate === null || row.date === ontimeSelectedDate) &&
    (ontimeSelectedBucket === null || ontimeActualBucket(row, ontimeBucketSize) === ontimeSelectedBucket)
  ), [ontimeQualified, ontimeSelectedDate, ontimeSelectedBucket, ontimeBucketSize]);
  const ontimeDisplayed = useMemo(() => ontimeAfterClick.filter(row => {
    const cells = ontimeTableCells(row);
    return ontimeFilters.every((query, index) => !query.trim() || cells[index].toLocaleLowerCase('th').includes(query.trim().toLocaleLowerCase('th')));
  }), [ontimeAfterClick, ontimeFilters]);
  const ontimeExport = (format: 'csv' | 'excel' | 'pdf') => {
    const data = [ontimeTableColumns, ...ontimeDisplayed.map(ontimeTableCells)];
    const filename = `ELIVE-Ontime-${result?.start || 'report'}-${result?.end || 'report'}`;
    try {
      setExportError('');
      if (format === 'excel') { downloadWorkbook(data, `${filename}.xlsx`); return; }
      if (format === 'csv') {
        const output = '\uFEFF' + data.map(line => line.map(csvCell).join(',')).join('\r\n');
        const url = URL.createObjectURL(new Blob([output], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a'); link.href = url; link.download = `${filename}.csv`; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); return;
      }
      const popup = window.open('', '_blank', 'width=1200,height=800');
      if (!popup) { setExportError('กรุณาอนุญาตป๊อปอัปเพื่อบันทึก PDF'); return; }
      const cellHtml = (name: string) => escapeMarkup(name || '-');
      popup.document.open();
      popup.document.write('<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ELIVE Ontime Report</title><style>@page{size:A3 landscape;margin:10mm}body{font-family:Tahoma,Arial,sans-serif;color:#222;font-size:11px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:5px;text-align:left}th{background:#eee}thead{display:table-header-group}tr{break-inside:avoid}@media print{button{display:none}}</style></head><body><button onclick="window.print()">พิมพ์ / บันทึก PDF</button><h2>รายงานรถเข้าพื้นที่ตามแผน</h2><table><thead><tr>' + data[0].map(v => `<th>${cellHtml(v)}</th>`).join('') + '</tr></thead><tbody>' + data.slice(1).map(line => '<tr>' + line.map(v => `<td>${cellHtml(v)}</td>`).join('') + '</tr>').join('') + '</tbody></table></body></html>');
      popup.document.close(); window.setTimeout(() => { if (!popup.closed) popup.print(); }, 500);
    } catch { setExportError('ส่งออกไฟล์ไม่สำเร็จ กรุณาลองอีกครั้ง'); }
  };
  const dwellMeasured = useMemo(() => rows.map(row => result?.kind === 'DWELL' && result.dwellOptions ? dwellExcess(row.truck, result.dwellOptions) : dwellBeyondTolerance(row.truck, toleranceMinutes)).filter((item): item is number => item !== null), [rows, result, toleranceMinutes]);
  const dwellExceeded = useMemo(() => dwellMeasured.filter(item => item > 0), [dwellMeasured]);
  const problemRows = useMemo(() => rows.filter(row => problemReason(row.truck)), [rows]);
  const summaryChartRows = useMemo<SummaryChartRow[]>(() => {
    const dates = Array.from(new Set(rows.map(row => row.date))).sort();
    return dates.map(date => {
      const daily = rows.filter(row => row.date === date);
      const counts: Record<SummaryStatus, number> = { EARLY: 0, ONTIME: 0, LATE: 0, EXCLUDED: 0 };
      daily.forEach(row => { const status = summaryStatus(row.truck, toleranceMinutes); if (status) counts[status] += 1; });
      return { date, total: Object.values(counts).reduce((sum, count) => sum + count, 0), counts };
    }).filter(item => item.total > 0);
  }, [rows, toleranceMinutes]);
  const summaryDetailRows = useMemo(() => rows.map(row => ({ row, status: summaryStatus(row.truck, toleranceMinutes) })).filter((item): item is { row: ReportRow; status: SummaryStatus } => item.status !== null), [rows, toleranceMinutes]);
  const visibleDetails = useMemo(() => summaryDetailRows.filter(({ row, status }) => {
    const cells = detailCells(row, status, toleranceMinutes);
    return detailFilters.every((value, index) => !value.trim() || cells[index].toLocaleLowerCase('th').includes(value.trim().toLocaleLowerCase('th')));
  }), [summaryDetailRows, detailFilters]);
  const exportDetailsExcel = () => {
    try { setExportError(''); downloadWorkbook([detailColumns, ...visibleDetails.map(({ row, status }) => detailCells(row, status, toleranceMinutes))], `ELIVE-Details-${result?.start}-${result?.end}.xlsx`); }
    catch { setExportError('ส่งออก Excel ไม่สำเร็จ กรุณาลองอีกครั้ง'); }
  };
  const exportDetailsPdf = () => {
    setExportError('');
    const popup = window.open('', '_blank', 'width=1200,height=800');
    if (!popup) { setExportError('กรุณาอนุญาตหน้าต่างป๊อปอัป แล้วกด PDF อีกครั้ง'); return; }
    const title = 'รายงานรถเข้า-ออกพื้นที่ทั้งหมด';
    const table = '<table><thead><tr>' + detailColumns.map(value => '<th>' + escapeMarkup(value) + '</th>').join('') + '</tr></thead><tbody>' + visibleDetails.map(({ row, status }) => '<tr>' + detailCells(row, status, toleranceMinutes).map(value => '<td>' + escapeMarkup(value || '-') + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
    popup.document.open();
    popup.document.write('<!doctype html><html lang="th"><head><meta charset="utf-8"><title>' + title + '</title><style>@page{size:A3 landscape;margin:10mm}body{font-family:Tahoma,Arial,sans-serif;color:#222;font-size:11px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:5px;text-align:left}th{background:#eee}thead{display:table-header-group}tr{break-inside:avoid}button{padding:10px 18px;background:#388438;color:white;border:0;cursor:pointer}@media print{.tools{display:none}}</style></head><body><div class="tools"><p>เลือก Save as PDF / บันทึกเป็น PDF ในหน้าต่างพิมพ์</p><button id="print" type="button">พิมพ์ / บันทึก PDF</button></div><h2>' + title + '</h2><p>' + escapeMarkup(`${result?.start} ถึง ${result?.end} · ${visibleDetails.length} เที่ยว`) + '</p>' + table + '</body></html>');
    popup.document.close();
    popup.document.getElementById('print')?.addEventListener('click', () => { popup.focus(); popup.print(); });
    window.setTimeout(() => { if (!popup.closed) { popup.focus(); popup.print(); } }, 500);
  };
  const summaryStatusCounts = useMemo(() => summaryDetailRows.reduce<Record<SummaryStatus, number>>((counts, item) => { counts[item.status] += 1; return counts; }, { EARLY: 0, ONTIME: 0, LATE: 0, EXCLUDED: 0 }), [summaryDetailRows]);
  const overallSummaryTotal = summaryDetailRows.length;
  const overallSummaryParts: Array<[SummaryStatus, string]> = [
    ['EARLY', 'bg-gradient-to-r from-blue-600 to-blue-400'],
    ['ONTIME', 'bg-gradient-to-r from-emerald-600 to-emerald-400'],
    ['LATE', 'bg-gradient-to-r from-red-600 to-red-400'],
    ['EXCLUDED', 'bg-gradient-to-r from-slate-500 to-slate-400'],
  ];
  const metricRows = useMemo(() => {
    if (!kind) return [];
    if (kind === 'SUMMARY') {
      return Array.from(new Set(rows.map(row => row.date))).map(name => {
        const group = rows.filter(row => row.date === name);
        return { name, total: group.length, measured: group.length, count: group.length, rate: rows.length ? group.length / rows.length * 100 : null, average: null, maximum: null, topReason: undefined } as MetricRow;
      }).sort((a, b) => a.name.localeCompare(b.name));
    }
    if (kind === 'DWELL' && result?.dwellOptions) {
      const options = result.dwellOptions;
      return Array.from(new Set(rows.map(row => text(row.truck.dropPoint) || 'ไม่ระบุจุดลงงาน'))).map(name => {
        const group = rows.filter(row => (text(row.truck.dropPoint) || 'ไม่ระบุจุดลงงาน') === name);
        const values = group.map(row => dwellExcess(row.truck, options)).filter((value): value is number => value !== null);
        const exceeded = values.filter(value => value > 0);
        return { name, total: group.length, measured: values.length, count: exceeded.length, rate: values.length ? exceeded.length / values.length * 100 : null, average: average(exceeded), maximum: exceeded.length ? Math.max(...exceeded) : null } as MetricRow;
      }).sort((a, b) => (b.average ?? -1) - (a.average ?? -1));
    }
    if (kind === 'DWELL' || kind === 'POINT') return metricBy(rows, row => text(row.truck.dropPoint) || 'ไม่ระบุจุดลงงาน', kind, toleranceMinutes);
    if (kind === 'ROUTE') return metricBy(rows, row => text(row.truck.route) || 'ไม่ระบุ Route', kind, toleranceMinutes).filter(item => item.total >= 3);
    if (kind === 'SUPPLIER') return metricBy(rows, row => text(row.truck.supplierName) || 'ไม่ระบุสังกัด', kind, toleranceMinutes);
    return metricBy(rows, row => row.date, kind, toleranceMinutes);
  }, [kind, rows, toleranceMinutes, result]);
  const dwellTrips = useMemo(() => result?.kind === 'DWELL' && result.dwellOptions
    ? rows.map(row => makeDwellTrip(row, result.dwellOptions!)).sort((a, b) => (b.excess ?? -Infinity) - (a.excess ?? -Infinity) || a.key.localeCompare(b.key)) : [], [rows, result]);
  const dwellChartTrips = useMemo(() => dwellTrips.filter(item => !dwellArrivalSelection || (item.status || 'UNKNOWN') === dwellArrivalSelection), [dwellTrips, dwellArrivalSelection]);
  const dwellVisibleTrips = useMemo(() => dwellChartTrips.filter(item => (!dwellSelectedRoute || (text(item.row.truck.route) || 'ไม่ระบุ Route') === dwellSelectedRoute) && dwellTripCells(item).every((value, index) => !dwellTableFilters[index] || value.toLocaleLowerCase().includes(dwellTableFilters[index].trim().toLocaleLowerCase()))), [dwellChartTrips, dwellSelectedRoute, dwellTableFilters]);
  const dwellExport = (format: 'pdf' | 'excel') => {
    if (result?.kind !== 'DWELL') return;
    try {
      setExportError('');
      const data = [DWELL_COLUMNS, ...dwellVisibleTrips.map(dwellTripCells)];
      const filename = `ELIVE-Dwell-${result.start}-${result.end}`;
      if (format === 'excel') { downloadDwellWorkbook(data, `${filename}.xlsx`); return; }
      const popup = window.open('', '_blank', 'width=1200,height=800');
      if (!popup) { setExportError('กรุณาอนุญาตป๊อปอัปเพื่อบันทึก PDF'); return; }
      const table = '<table><thead><tr>' + data[0].map(value => '<th>' + escapeMarkup(value) + '</th>').join('') + '</tr></thead><tbody>' + data.slice(1).map(line => '<tr>' + line.map(value => '<td>' + escapeMarkup(value || '-') + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
      popup.document.open();
      popup.document.write('<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ELIVE Dwell Report</title><style>@page{size:A3 landscape;margin:10mm}body{font-family:Tahoma,Arial,sans-serif;color:#222;font-size:10px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:5px;text-align:left;overflow-wrap:anywhere}th{background:#f1f5f9}thead{display:table-header-group}tr{break-inside:avoid}@media print{button{display:none}}</style></head><body><button id="print" type="button">พิมพ์ / บันทึก PDF</button><h2>รายงานระยะเวลาปฏิบัติงาน</h2><p>' + escapeMarkup(`${result.start} ${result.startTime} ถึง ${result.end} ${result.endTime} · ${dwellVisibleTrips.length} เที่ยว`) + '</p>' + table + '</body></html>');
      popup.document.close();
      popup.document.getElementById('print')?.addEventListener('click', () => { popup.focus(); popup.print(); });
      window.setTimeout(() => { if (!popup.closed) { popup.focus(); popup.print(); } }, 500);
    } catch { setExportError('ส่งออกไฟล์ไม่สำเร็จ กรุณาลองอีกครั้ง'); }
  };
  const dwellRouteAverages = useMemo(() => {
    const groups = new Map<string, DwellTrip[]>();
    dwellChartTrips.forEach(item => {
      const route = text(item.row.truck.route) || 'ไม่ระบุ Route';
      const group = groups.get(route) || [];
      group.push(item);
      groups.set(route, group);
    });
    return Array.from(groups, ([route, trips]) => {
      const measured = trips.filter(item => item.actual !== null && item.standard !== null);
      const actual = average(measured.map(item => item.actual!));
      const standard = average(measured.map(item => item.standard!));
      return { key: route, route, count: measured.length, actual, standard,
        excess: actual === null || standard === null ? null : actual - standard };
    }).sort((a, b) => (b.excess ?? -Infinity) - (a.excess ?? -Infinity) || a.route.localeCompare(b.route, 'th'));
  }, [dwellChartTrips]);
  const dwellChartPages = Math.max(1, Math.ceil(dwellRouteAverages.length / 20));
  const dwellCurrentPage = Math.min(dwellChartPage, dwellChartPages - 1);
  const dwellScale = dwellRouteAverages.reduce((maximum, item) => Math.max(maximum, item.actual ?? 0, item.standard ?? 0), 1);
  useEffect(() => { setDwellSelectedRoute(null); setDwellChartPage(0); }, [supplier]);
  const reportTitle = flatReports.find(item => item.id === (kind || selectedKind))?.title || 'รายงาน';
  const maximumBar = Math.max(1, ...metricRows.map(item => item.rate ?? 0));
  const summary = kind === 'SUMMARY'
    ? [['ประเมินได้ทั้งหมด', summaryDetailRows.length], ['Early', summaryStatusCounts.EARLY], ['On Plan', summaryStatusCounts.ONTIME], ['Delay', summaryStatusCounts.LATE], ['No Drop / Cancel', summaryStatusCounts.EXCLUDED]]
    : kind === 'DWELL'
    ? [['เที่ยวตามเงื่อนไข', rows.length], ['ประเมินเวลาได้', dwellMeasured.length], ['ใช้เวลาเกินมาตรฐาน', dwellExceeded.length], ['เกินมาตรฐานเฉลี่ย', minuteText(average(dwellExceeded))], ['เกินมาตรฐานสูงสุด', minuteText(dwellExceeded.length ? Math.max(...dwellExceeded) : null)]]
    : kind && ['POINT', 'ROUTE', 'SUPPLIER'].includes(kind)
      ? [['เที่ยวทั้งหมด', rows.length], ['เที่ยวที่มีปัญหา', problemRows.length], ['อัตราเกิดปัญหา', percentage(rows.length ? problemRows.length / rows.length * 100 : null)], ['ปัญหาที่ยังไม่เสร็จสิ้น', problemRows.filter(row => upper(row.truck.actionStatus) !== 'CLOSED').length]]
      : [['เที่ยวทั้งหมด', rows.length], ['ประเมินเวลาได้', measuredArrival.length], [kind === 'EARLY' ? 'เข้าก่อนเวลา' : kind === 'ONTIME' ? 'มาตรงเวลา' : 'มาช้ากว่าแผน', matchedArrival.length], ['อัตรา', percentage(measuredArrival.length ? matchedArrival.length / measuredArrival.length * 100 : null)], [kind === 'ONTIME' ? `ช่วงตรงเวลา` : 'เฉลี่ย', kind === 'ONTIME' ? `±${toleranceMinutes} นาที` : minuteText(average(arrivalValues))]];

  const exportCsv = () => {
    if (!result || !kind) return;
    const output: unknown[][] = [['รายงาน', reportTitle], ['ช่วงวันและเวลา', `${result.start} ${result.startTime}`, `${result.end} ${result.endTime}`], ['Project', kind === 'DWELL' ? 'INBOUND' : !selectedProjects.length || selectedProjects.includes('ทั้งหมด') ? 'ทั้งหมด' : selectedProjects.join(' | ')], ['สังกัด', supplier || 'ทั้งหมด'], []];
    if (kind === 'SUMMARY') {
      output.push(['สถานะ', 'จำนวนเที่ยว'], ['Early', summaryStatusCounts.EARLY], ['On Plan', summaryStatusCounts.ONTIME], ['Delay', summaryStatusCounts.LATE], ['No Drop / Cancel', summaryStatusCounts.EXCLUDED]);
      output.push([], ['รายละเอียดเที่ยว'], ['วันที่', 'Project', 'Route', 'สังกัด', 'ทะเบียน', 'จุดลงงาน', 'Plan ETA', 'Actual ETA', 'Plan ETD', 'Actual ETD', 'สถานะ', 'Remark']);
      summaryDetailRows.forEach(({ row, status }) => output.push([row.date, row.truck.project, row.truck.route, row.truck.supplierName, row.truck.licensePlate, row.truck.dropPoint, row.truck.planEta, row.truck.stampEta || row.truck.actualEta, row.truck.planEtd, row.truck.stampEtd || (row.truck as Truck & { actualEtd?: unknown }).actualEtd, summaryStatusLabel(status), timeResultText(row.truck, status, toleranceMinutes)]));
    } else if (kind === 'DWELL' && result.dwellOptions) {
      output.push(['มาตรฐาน', result.dwellOptions.standardMode === 'PLAN' ? 'Plan ETD − Plan ETA' : `${result.dwellOptions.standardMinutes} นาที`], ['แสดงเที่ยว', result.dwellOptions.scope === 'ALL' ? 'ทุกเที่ยวที่มีเวลาเข้า–ออกครบ' : `เกินมาตรฐานตั้งแต่ ${result.dwellOptions.excessMinutes} นาที`], ['รายละเอียดตามตัวกรอง', dwellVisibleTrips.length], [], DWELL_COLUMNS, ...dwellVisibleTrips.map(dwellTripCells));
    } else {
      output.push(['เกณฑ์ตรงเวลา', `±${toleranceMinutes} นาที`]);
      output.push(['รายการ', 'เที่ยวทั้งหมด', 'ประเมินได้', 'จำนวนที่เข้าเงื่อนไข', 'อัตรา %', 'เฉลี่ยนาที', 'สูงสุดนาที', 'สาเหตุหลัก'], ...metricRows.map(item => [item.name, item.total, item.measured, item.count, item.rate?.toFixed(1) || '', item.average?.toFixed(1) || '', item.maximum?.toFixed(1) || '', item.topReason || '']));
      output.push([], ['รายละเอียดเที่ยว'], ['วันที่', 'Route', 'สังกัด', 'ทะเบียน', 'จุดลงงาน', 'Plan ETA', 'Actual ETA', 'Plan ETD', 'Actual ETD', 'ความต่าง ETA (นาที)', 'เกินเวลาปฏิบัติงาน (นาที)', 'ปัญหา']);
      rows.forEach(row => output.push([row.date, row.truck.route, row.truck.supplierName, row.truck.licensePlate, row.truck.dropPoint, row.truck.planEta, row.truck.stampEta || row.truck.actualEta, row.truck.planEtd, row.truck.stampEtd || (row.truck as Truck & { actualEtd?: unknown }).actualEtd, timeBeyondOnPlan(row.truck, toleranceMinutes), dwellBeyondTolerance(row.truck, toleranceMinutes), row.truck.actionProblem]));
    }
    const url = URL.createObjectURL(new Blob(['\uFEFF' + output.map(line => line.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `INBOUND-${kind}-${result.start}-${result.end}.csv`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const [, setReportView] = useState<'OVERVIEW' | 'DETAILS'>('OVERVIEW');
  const [, setChartView] = useState<'PRIMARY' | 'SECONDARY'>('PRIMARY');
  const [reportPage, setReportPage] = useState(1);
  const [reportPageSize, setReportPageSize] = useState(50);
  const [, setReportFiltersOpen] = useState(false);
  useEffect(() => { setReportView('OVERVIEW'); setChartView('PRIMARY'); setReportPage(1); setReportFiltersOpen(false); }, [result]);
  useEffect(() => { setReportPage(1); }, [result, supplier, visibleDetails, earlyDisplayed, lateDisplayed, ontimeDisplayed, dwellVisibleTrips, reportPageSize]);
  const pageItems = <T,>(items: T[]): T[] => {
    const page = Math.min(Math.max(1, reportPage), Math.max(1, Math.ceil(items.length / reportPageSize)));
    return items.slice((page - 1) * reportPageSize, page * reportPageSize);
  };
  const renderReportPager = (total: number) => {
    const pages = Math.max(1, Math.ceil(total / reportPageSize));
    const page = Math.min(Math.max(1, reportPage), pages);
    return <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-700">
      <span role="status" aria-live="polite">{total ? (page - 1) * reportPageSize + 1 : 0}–{Math.min(page * reportPageSize, total)} จาก {total} เที่ยว</span>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2">แถวต่อหน้า<select value={reportPageSize} onChange={event => { setReportPageSize([10, 20, 50].includes(Number(event.target.value)) ? Number(event.target.value) : 50); setReportPage(1); }} className="rounded border border-slate-300 bg-white px-2 py-1.5 text-slate-900"><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option></select></label>
        <button type="button" disabled={page <= 1} onClick={() => setReportPage(Math.max(1, page - 1))} className="rounded border border-slate-300 bg-white px-3 py-1.5 font-bold disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-blue-500">ก่อนหน้า</button>
        <span>หน้า {page}/{pages}</span>
        <button type="button" disabled={page >= pages} onClick={() => setReportPage(Math.min(pages, page + 1))} className="rounded border border-slate-300 bg-white px-3 py-1.5 font-bold disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-blue-500">ถัดไป</button>
      </div>
    </div>;
  };
  return <div className="h-full min-h-0 overflow-auto bg-slate-50 p-4 md:p-6">
    {!selectedKind ? <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-black text-slate-900">รายงาน</h1>
      <p className="mt-2 text-sm text-slate-500">เลือกประเภทรายงานที่ต้องการ</p>
      <div className="mt-6 grid gap-5 lg:grid-cols-2">{reportGroups.map(group => <section key={group.title} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><h2 className="border-b border-slate-200 bg-slate-100 px-5 py-3 text-sm font-black text-slate-800">{group.title}</h2><div className="grid gap-2 p-4 sm:grid-cols-2">{group.reports.map(report => <button key={report.id} type="button" onClick={() => openReport(report.id)} className="rounded-lg border border-slate-200 bg-white px-4 py-4 text-left hover:border-blue-400 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500"><span className="block text-sm font-black text-slate-900">{report.title}</span></button>)}</div></section>)}</div>
    </div> : !result ? <div className="max-w-5xl">
      <button type="button" onClick={() => setSelectedKind(null)} className="rounded-lg border border-slate-300 bg-slate-200 px-5 py-2.5 text-base text-slate-900 hover:bg-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-400" style={{ fontWeight: 900 }}>ย้อนกลับ</button>
      <h1 className="mt-4 text-xl font-black text-slate-900">{reportTitle}</h1>
      <form onSubmit={loadReport} className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><fieldset disabled={loading} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm font-bold text-slate-700">วันที่เริ่มต้น<input type="date" required value={startDate} onChange={event => setStartDate(event.target.value)} className="mt-2 block w-full rounded-lg border border-slate-300 p-3" /></label>
          <label className="text-sm font-bold text-slate-700">เวลา<input type="time" required value={startTime} onChange={event => setStartTime(event.target.value)} className="mt-2 block w-full rounded-lg border border-slate-300 p-3" /></label>
          <label className="text-sm font-bold text-slate-700">วันที่สิ้นสุด<input type="date" required min={startDate} value={endDate} onChange={event => setEndDate(event.target.value)} className="mt-2 block w-full rounded-lg border border-slate-300 p-3" /></label>
          <label className="text-sm font-bold text-slate-700">เวลา<input type="time" required value={endTime} onChange={event => setEndTime(event.target.value)} className="mt-2 block w-full rounded-lg border border-slate-300 p-3" /></label>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {selectedKind === 'DWELL' ? <div><label className="text-sm font-bold text-slate-700">Project</label><div className="mt-2 flex min-h-[52px] items-center rounded-lg border border-slate-300 bg-slate-50 px-3 text-sm font-bold text-blue-800">INBOUND</div></div> : <MultiSelectField label="Project" options={projectOptions} values={selectedProjects} onChange={setSelectedProjects} />}
          <MultiSelectField label="Route" options={routeOptions} values={selectedRoutes} onChange={setSelectedRoutes} />
          <MultiSelectField label="จุดลงงาน" options={dropPointOptions} values={selectedDropPoints} onChange={setSelectedDropPoints} />
        </div>
        {selectedKind && ['SUMMARY','EARLY','ONTIME','LATE'].includes(selectedKind) && <div className="rounded-lg border border-blue-100 bg-blue-50 p-4"><p className="text-sm font-black text-blue-900">{['SUMMARY', 'ONTIME'].includes(selectedKind) ? 'กำหนดเวลาเผื่อ' : 'เงื่อนไขเวลามากกว่า'}</p><div className="mt-3 flex flex-wrap items-center gap-4"><label className="inline-flex items-center gap-2 text-sm"><input type="radio" checked={toleranceMode === 'PRESET'} onChange={() => setToleranceMode('PRESET')} />เลือกนาที</label><select disabled={toleranceMode !== 'PRESET'} value={presetTolerance} onChange={event => setPresetTolerance(Number(event.target.value))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 disabled:bg-slate-100">{TOLERANCE_OPTIONS.map(value => <option key={value} value={value}>{value} นาที</option>)}</select><label className="inline-flex items-center gap-2 text-sm"><input type="radio" checked={toleranceMode === 'CUSTOM'} onChange={() => setToleranceMode('CUSTOM')} />ระบุนาที</label><input type="number" min={selectedKind === 'SUMMARY' || selectedKind === 'ONTIME' ? 0 : 1} max="720" step="1" disabled={toleranceMode !== 'CUSTOM'} value={customTolerance} onChange={event => setCustomTolerance(event.target.value)} className="w-28 rounded-lg border border-slate-300 bg-white px-3 py-2 disabled:bg-slate-100" /><span className="text-sm text-slate-600">นาที</span></div></div>}
                {selectedKind === 'DWELL' && <>
            <MultiSelectField label="สังกัด" options={dwellSupplierOptions} values={dwellSuppliers} onChange={setDwellSuppliers} />
            <section className="space-y-4 rounded-lg border border-blue-100 bg-blue-50 p-4">
              <h2 className="text-sm font-black text-blue-900">เกณฑ์ระยะเวลาปฏิบัติงาน</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-bold text-slate-700">เกณฑ์มาตรฐาน<select value={dwellStandardMode} onChange={event => setDwellStandardMode(event.target.value as 'PLAN' | 'CUSTOM')} className="mt-2 block w-full rounded-lg border border-slate-300 bg-white p-3"><option value="PLAN">ตามแผน: Plan ETD − Plan ETA</option><option value="CUSTOM">กำหนดเอง</option></select></label>
                {dwellStandardMode === 'CUSTOM' && <label className="text-sm font-bold text-slate-700">มาตรฐาน (นาที)<input type="number" required min="1" max="720" step="1" value={dwellStandardMinutes} onChange={event => setDwellStandardMinutes(event.target.value)} className="mt-2 block w-full rounded-lg border border-slate-300 bg-white p-3" /></label>}
              </div>
              <label className="block text-sm font-bold text-slate-700">แสดงเที่ยว<select value={dwellScope} onChange={event => setDwellScope(event.target.value as 'ALL' | 'EXCEEDED')} className="mt-2 block w-full rounded-lg border border-slate-300 bg-white p-3"><option value="ALL">ทุกเที่ยวที่มีเวลาเข้า–ออกครบ</option><option value="EXCEEDED">เฉพาะเที่ยวที่เกินมาตรฐาน</option></select></label>
              {dwellScope === 'EXCEEDED' && <label className="flex flex-wrap items-center gap-3 text-sm font-bold text-slate-700">เกินมาตรฐานตั้งแต่<input type="number" required min="0" max="720" step="1" list="dwell-thresholds" value={dwellThreshold} onChange={event => setDwellThreshold(event.target.value)} className="w-28 rounded-lg border border-slate-300 bg-white p-3" /><datalist id="dwell-thresholds">{TOLERANCE_OPTIONS.map(value => <option key={value} value={value} />)}</datalist>นาที</label>}
              
              
            </section>
            <details className="rounded-lg border border-slate-200 bg-white p-4">
              <summary className="cursor-pointer text-sm font-bold text-slate-800">ตัวกรองเพิ่มเติม</summary>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-bold text-slate-700">สถานะการเข้าพื้นที่<select value={dwellArrival} onChange={event => setDwellArrival(event.target.value as DwellOptions['arrival'])} className="mt-2 block w-full rounded-lg border border-slate-300 bg-white p-3"><option value="ALL">ทั้งหมด</option><option value="EARLY">ก่อนเวลา</option><option value="ONTIME">ตามแผน</option><option value="LATE">ล่าช้า</option></select></label>
                <label className="text-sm font-bold text-slate-700">ข้อมูลปัญหา<select value={dwellProblem} onChange={event => setDwellProblem(event.target.value as DwellOptions['problem'])} className="mt-2 block w-full rounded-lg border border-slate-300 bg-white p-3"><option value="ALL">ทั้งหมด</option><option value="RECORDED">มีการบันทึกปัญหา</option><option value="UNRECORDED">ยังไม่มีการบันทึกปัญหา</option></select></label>
              </div>
              
            </details>
          </>}
        </fieldset><div role="status" aria-live="polite" className="mt-3 text-sm font-semibold text-blue-700">{progress}</div>{error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}<div className="mt-5 flex justify-end gap-2">{loading && <button type="button" onClick={cancelLoading} className={buttonClass}>ยกเลิก</button>}<button type="submit" disabled={loading} className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-bold text-white disabled:opacity-50">{loading ? 'กำลังสร้างรายงาน...' : 'แสดงรายงาน'}</button></div></form>
    </div> : <div className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><button type="button" onClick={() => setResult(null)} className="rounded-lg border border-slate-300 bg-slate-200 px-5 py-2.5 text-base text-slate-900 shadow-sm hover:bg-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-400" style={{ fontWeight: 900 }}>ย้อนกลับ</button></div><div className="flex flex-wrap items-end gap-2"><div className="flex flex-wrap items-end gap-2"><label className="text-xs font-bold text-slate-700"><select aria-label="สังกัด" value={supplier} onChange={event => setSupplier(event.target.value)} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"><option value="">ทุกสังกัด</option>{suppliers.map(name => <option key={name} value={name}>{name}</option>)}</select></label></div><button type="button" onClick={() => kind === 'EARLY' ? earlyExport('csv') : kind === 'LATE' ? lateExport('csv') : kind === 'ONTIME' ? ontimeExport('csv') : exportCsv()} className="rounded-xl border border-teal-500 bg-gradient-to-r from-teal-600 to-cyan-600 px-6 py-3 text-sm font-black tracking-wide text-white shadow-lg shadow-teal-100 transition hover:from-teal-700 hover:to-cyan-700 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-cyan-200">Export CSV</button></div></div>
      
      
      {kind !== 'DWELL' && kind !== 'SUMMARY' && kind !== 'EARLY' && kind !== 'LATE' && kind !== 'ONTIME' && <>
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-5">{summary.map(([label, item]) => {
        const labelText = String(label);
        const accent = kind === 'SUMMARY'
          ? labelText === 'Early' ? 'border-blue-500 bg-blue-50/70'
          : labelText === 'On Plan' ? 'border-emerald-500 bg-emerald-50/70'
          : labelText === 'Delay' ? 'border-red-500 bg-red-50/70'
          : labelText === 'No Drop / Cancel' ? 'border-slate-400 bg-slate-100/80'
          : 'border-indigo-500 bg-indigo-50/70'
          : 'border-slate-300 bg-white';
        const valueColor = kind === 'SUMMARY'
          ? labelText === 'Early' ? 'text-blue-700'
          : labelText === 'On Plan' ? 'text-emerald-700'
          : labelText === 'Delay' ? 'text-red-700'
          : labelText === 'No Drop / Cancel' ? 'text-slate-700'
          : 'text-indigo-700'
          : 'text-slate-900';
        return <div key={labelText} className={`relative overflow-hidden rounded-2xl border border-slate-200 border-l-4 ${accent} p-4 shadow-sm`}><p className="text-xs font-black uppercase tracking-wide text-slate-600">{label}</p><p className={`mt-2 text-3xl font-black ${valueColor}`}>{item}</p></div>;
      })}</div>
      </>}
      {kind === 'SUMMARY' ? <>
        {true && (<section className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-4 py-3">
            <div><h2 className="text-lg font-black text-slate-900">{reportTitle}</h2></div>
            <div className="flex flex-wrap items-end gap-3"><div className="flex flex-wrap gap-2 pb-1 text-xs font-black text-slate-700">
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5"><i className="h-2.5 w-2.5 rounded-full bg-blue-500 shadow-sm" />Early {summaryStatusCounts.EARLY} เที่ยว</span>
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5"><i className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-sm" />On Plan {summaryStatusCounts.ONTIME} เที่ยว</span>
              <span className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1.5"><i className="h-2.5 w-2.5 rounded-full bg-red-500 shadow-sm" />Delay {summaryStatusCounts.LATE} เที่ยว</span>
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5"><i className="h-2.5 w-2.5 rounded-full bg-slate-400 shadow-sm" />No Drop / Cancel {summaryStatusCounts.EXCLUDED} เที่ยว</span>
            </div></div>
          </div>
          <p className="px-6 pt-4 text-xs font-semibold text-slate-500">ช่วง On Plan: Plan ETA ลบ {toleranceMinutes} นาที ถึง Plan ETD บวก {toleranceMinutes} นาที</p>
          {result.days.length > 1 && overallSummaryTotal > 0 && <div className="border-b border-slate-200 bg-blue-50/40 px-4 py-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-sm">
              <strong className="rounded-md border border-blue-200 bg-blue-100 px-3 py-1.5 font-black text-blue-900">ค่าเฉลี่ยของทุกวัน</strong>
              <span className="font-black text-slate-700">{overallSummaryTotal} เที่ยว · 100.0%</span>
            </div>
            <div role="img" aria-label={`สัดส่วนสถานะรวมทุกวัน ${overallSummaryTotal} เที่ยว`} className="flex h-12 w-full overflow-hidden rounded-xl bg-slate-100 shadow-inner ring-1 ring-blue-200">
              {overallSummaryParts.map(([status, color]) => {
                const count = summaryStatusCounts[status]; const rate = count / overallSummaryTotal * 100;
                if (!count) return null;
                return <div key={status} title={`${summaryStatusLabel(status)} ${count} เที่ยว · ${rate.toFixed(1)}%`} className={`${color} flex min-w-0 items-center justify-center overflow-hidden border-r border-white/30 text-xs font-black text-white last:border-r-0`} style={{ width: `${rate}%`, flexShrink: 0 }}>
                  <span className="shrink-0 whitespace-nowrap" style={{ fontSize: rate < 5 ? '10px' : undefined }}>{rate.toFixed(1)}%</span>
                </div>;
              })}
              </div>
            </div>}
            {true && <div className="max-h-[360px] overflow-auto">{!summaryChartRows.length ? <p className="py-20 text-center text-slate-500">ไม่มีเที่ยวที่สามารถแสดงในกราฟได้</p> : <div className="space-y-6 px-4 py-3">{summaryChartRows.map(item => <div key={item.date}>
            <div className="mb-3 flex items-center justify-between gap-3 text-sm"><strong className="rounded-md bg-slate-100 px-2.5 py-1 text-slate-800">{item.date}</strong><span className="font-black text-slate-700">{item.total} เที่ยว · 100.0%</span></div>
            <div className="flex h-12 w-full overflow-hidden rounded-xl bg-slate-100 shadow-inner ring-1 ring-slate-200">{([
              ['EARLY','bg-gradient-to-r from-blue-600 to-blue-400'],['ONTIME','bg-gradient-to-r from-emerald-600 to-emerald-400'],['LATE','bg-gradient-to-r from-red-600 to-red-400'],['EXCLUDED','bg-gradient-to-r from-slate-500 to-slate-400']
            ] as Array<[SummaryStatus,string]>).map(([status,color]) => {
              const count = item.counts[status]; const rate = item.total ? count / item.total * 100 : 0;
              if (!count) return null;
              return <div key={status} title={`${summaryStatusLabel(status)} ${count} เที่ยว · ${rate.toFixed(1)}%`} className={`${color} flex min-w-0 items-center justify-center overflow-hidden border-r border-white/30 text-xs font-black text-white transition-all duration-300 last:border-r-0 hover:brightness-110`} style={{ width: `${rate}%`, flexShrink: 0 }}>
                <span className="shrink-0 whitespace-nowrap" style={{ fontSize: rate < 5 ? '10px' : undefined }}>{rate.toFixed(1)}%</span>
              </div>;
            })}</div>
          </div>)}</div>}</div>}
        </section>)}
        {true && (<section className="mt-3 overflow-hidden border border-[#cccccc] bg-white">
          <div className="flex min-h-[46px] flex-wrap items-center justify-between gap-2 border-b border-[#999999] bg-[#eeeeee] pr-4">
            <div className="flex min-w-0 items-center"><span aria-hidden="true" className="flex h-[46px] w-11 shrink-0 items-center justify-center border-r border-[#d4d4d4] text-lg text-[#68ace0]">▦</span><h2 className="px-4 text-sm font-bold text-[#555555]">รายละเอียดในกราฟ</h2></div>
            <div className="flex gap-4 py-1"><button type="button" onClick={exportDetailsPdf} title="พิมพ์หรือบันทึกเป็น PDF" className="min-w-[75px] bg-[#388438] px-4 py-2 text-base font-semibold text-white hover:bg-[#2c6c2c] focus:outline-none focus:ring-2 focus:ring-green-600">PDF</button><button type="button" onClick={exportDetailsExcel} title="ดาวน์โหลด Excel (.xlsx) ตามข้อมูลที่กรอง" className="min-w-[75px] bg-[#388438] px-4 py-2 text-base font-semibold text-white hover:bg-[#2c6c2c] focus:outline-none focus:ring-2 focus:ring-green-600">Excel</button></div>
          </div>
          {exportError && <p role="alert" className="bg-red-50 px-3 py-2 text-sm text-red-700">{exportError}</p>}
          <div className="max-h-[360px] overflow-auto"><table className="w-full min-w-[1400px] border-separate border-spacing-0 text-left text-xs">
            <thead className="sticky top-0 z-10"><tr>{detailColumns.map(heading => <th key={heading} scope="col" className="whitespace-nowrap border-b border-r border-[#c6c6c6] bg-gradient-to-b from-[#eeeeee] to-[#e3e3e3] px-2 py-2 text-center font-medium text-[#555555]">{heading}</th>)}</tr>
              <tr>{detailColumns.map((heading, index) => <th key={heading} className="border-b border-r border-[#c6c6c6] bg-[#87cee5] p-1.5"><input type="text" aria-label={`กรอง ${heading}`} value={detailFilters[index]} onChange={event => setDetailFilters(previous => previous.map((value, position) => position === index ? event.target.value : value))} className="block h-6 w-full min-w-[75px] rounded-none border border-[#cbd5df] bg-white px-1.5 text-xs font-normal text-slate-800 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600" /></th>)}</tr>
            </thead><tbody>{pageItems(visibleDetails).map(({ row, status }) => <tr key={`${row.date}:${row.truck.id}`} className="even:bg-[#fafafa] hover:bg-sky-50">{detailCells(row, status, toleranceMinutes).map((value, index) => <td key={index} className="whitespace-nowrap border-b border-r border-dotted border-[#cccccc] px-2 py-2 text-slate-800">{index === 10 ? <span className={`inline-block px-2 py-0.5 font-bold ${status === 'EARLY' ? 'bg-blue-50 text-blue-700' : status === 'ONTIME' ? 'bg-green-50 text-green-700' : status === 'LATE' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'}`}>{value}</span> : value || '-'}</td>)}</tr>)}</tbody>
          </table>{!visibleDetails.length && <p className="py-10 text-center text-sm text-slate-500">ไม่พบข้อมูลที่ตรงกับตัวกรอง</p>}</div>
        {renderReportPager(visibleDetails.length)}</section>)}
      </> : kind === 'EARLY' ? <>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'เข้าก่อนเวลาตามเกณฑ์', value: `${earlyQualified.length} เที่ยว` },
            { label: 'ช่วงเวลาที่เข้าก่อนเวลาหนาแน่นที่สุด', value: earlyPeak && earlyPeak.count ? earlyPeak.name : '-' },
            { label: 'เข้าก่อนเวลาเฉลี่ย', value: minuteText(average(earlyQualified.map(row => -(etaDifference(row.truck) || 0)))) },
            { label: 'ช่วงเวลาที่พบมากที่สุด', value: earlyPeak && earlyPeak.count ? `${earlyPeak.count} เที่ยว` : '0 เที่ยว' },
          ].map(card => <div key={card.label} className="rounded-xl border border-blue-100 border-l-4 border-l-blue-500 bg-white p-4 shadow-sm"><p className="text-xs font-bold text-slate-600">{card.label}</p><p className="mt-2 text-lg font-black text-blue-800">{card.value}</p></div>)}
        </div>
        {true && true && (<section className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
            <div><h2 className="font-black text-slate-900">ความหนาแน่นของรถเข้าก่อนเวลา</h2><p className="mt-1 text-xs text-slate-500">จัดกลุ่มตาม Actual ETA · ก่อนเวลาตามเกณฑ์ตั้งแต่ {toleranceMinutes} นาที</p></div>
            <div className="flex items-end gap-3">
              <label className="text-xs font-bold text-slate-700">ช่วงเวลา<select value={earlyBucketSize} onChange={event => { setEarlyBucketSize(Number(event.target.value) as 30 | 60); setEarlySelectedBucket(null); setEarlySelectedDate(null); }} className="ml-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value={60}>1 ชั่วโมง</option><option value={30}>30 นาที</option></select></label></div>
          </div>
          {!earlyQualified.length ? <p className="p-12 text-center text-sm text-slate-500">ไม่พบเที่ยวที่เข้าก่อนเวลาอย่างน้อย {toleranceMinutes} นาที</p> : <div className="px-4 py-5 md:px-6">
            <div className="flex items-center justify-between text-xs font-bold text-slate-600"><span>จำนวนเที่ยวรถเข้าก่อนเวลา</span><span>รวม {earlyQualified.length} เที่ยว</span></div>
            <div className="mt-3 flex h-56 items-end gap-1 border-b border-slate-200 pb-1" role="group" aria-label="จำนวนเที่ยวเข้าก่อนเวลาตามช่วงเวลา">
              {earlyHourBins.map(bin => <button key={bin.start} type="button" title={`${bin.name}: ${bin.count} เที่ยว · ${(bin.count / earlyQualified.length * 100).toFixed(1)}% · ก่อนเวลาเฉลี่ย ${minuteText(bin.average)}`} aria-label={`${bin.name} ${bin.count} เที่ยว`} aria-pressed={earlySelectedBucket === bin.start && earlySelectedDate === null} onClick={() => { setReportView('DETAILS');  setEarlySelectedDate(null); setEarlySelectedBucket(previous => previous === bin.start ? null : bin.start); }} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600" >
                {bin.count > 0 && <span className="mb-1 text-center text-[10px] font-black text-blue-800">{bin.count}</span>}
                <span className={`block w-full rounded-t-sm transition-colors ${earlySelectedBucket === bin.start && earlySelectedDate === null ? 'bg-indigo-800' : bin.count === earlyPeak?.count && bin.count > 0 ? 'bg-blue-800' : 'bg-blue-400 group-hover:bg-blue-600'}`} style={{ height: `${bin.count ? Math.max(5, (bin.count / Math.max(1, earlyPeak?.count || 1)) * 85) : 1}%` }} />
              </button>)}
            </div>
            <div className="mt-2 flex justify-between text-xs text-slate-600"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div>
            <p className="mt-2 text-xs text-slate-500">คลิ้กที่แท่งเพื่อดูเฉพาะเที่ยวในช่วงเวลานั้น</p>
          </div>}
        </section>)}
        {true && true && (<section className="mt-3 max-h-[380px] overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-4"><h2 className="font-black text-slate-900">ความหนาแน่นรายวันและช่วงเวลา</h2></div>
          {earlyHeatDates.length === 0 ? <p className="p-8 text-center text-slate-500">ไม่มีข้อมูล</p> : <div className="overflow-auto p-4"><div className="min-w-[780px]">
            <div className="mb-2 flex gap-1"><span className="w-28 shrink-0" />{earlyHourBins.map(bin => <span key={bin.start} className="flex-1 text-center text-[9px] font-bold text-slate-600">{bin.start % 120 === 0 ? clockLabel(bin.start) : ''}</span>)}</div>
            {earlyHeatDates.map(date => <div key={date} className="mb-1 flex items-center gap-1"><span className="w-28 shrink-0 text-xs font-bold text-slate-700">{date}</span>{earlyHourBins.map(bin => {
              const count = earlyQualified.filter(row => row.date === date && earlyActualBucket(row, earlyBucketSize) === bin.start).length;
              const maximum = Math.max(1, earlyPeak?.count || 1);
              const intensity = count / maximum;
              return <button type="button" key={bin.start} aria-label={`${date} ${bin.name}: ${count} เที่ยว`} title={`${date} ${bin.name} · ${count} เที่ยว`} onClick={() => { setReportView('DETAILS');  setEarlySelectedDate(date); setEarlySelectedBucket(bin.start); }} className={`h-8 min-w-0 flex-1 rounded-sm border border-white text-[9px] font-black focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${earlySelectedDate === date && earlySelectedBucket === bin.start ? 'ring-2 ring-indigo-700' : ''} ${count ? 'text-white' : 'text-slate-400'}`} style={{ backgroundColor: count ? `rgb(${Math.round(135 - intensity * 100)}, ${Math.round(190 - intensity * 115)}, ${Math.round(235 - intensity * 40)})` : '#f1f5f9' }}>{count || ''}</button>;
            })}</div>)}
          </div></div>}
        </section>)}
        {true && (<section className="mt-3 overflow-hidden border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-100 px-4 py-3"><div className="flex flex-wrap items-center gap-3"><h2 className="font-black text-slate-800">รายละเอียดในกราฟ</h2><span className="text-xs text-slate-600">{earlyDisplayed.length} เที่ยว</span>{(earlySelectedBucket !== null || earlySelectedDate !== null) && <button type="button" onClick={() => { setReportView('DETAILS');  setEarlySelectedBucket(null); setEarlySelectedDate(null); }} className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-bold">ล้างการเลือกช่วงเวลา</button>}</div><div className="flex gap-2"><button type="button" onClick={() => earlyExport('pdf')} className="bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800">PDF</button><button type="button" onClick={() => earlyExport('excel')} className="bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800">Excel</button></div></div>
          {exportError && <p role="alert" className="bg-red-50 p-3 text-sm text-red-800">{exportError}</p>}
          <div className="max-h-[360px] overflow-auto"><table className="w-full min-w-[1400px] border-separate border-spacing-0 text-left text-xs"><thead className="sticky top-0 z-10"><tr>{earlyTableColumns.map(name => <th key={name} className="border-b border-r border-slate-200 bg-slate-100 p-2 text-center font-bold">{name}</th>)}</tr><tr>{earlyTableColumns.map((name, index) => <th key={name} className="border-r border-sky-200 bg-sky-200 p-1.5"><input aria-label={`กรอง ${name}`} value={earlyFilters[index]} onChange={event => setEarlyFilters(previous => previous.map((value, cell) => cell === index ? event.target.value : value))} className="w-full min-w-[75px] border border-slate-200 bg-white px-2 py-1.5 outline-none focus:border-blue-500" /></th>)}</tr></thead><tbody>{pageItems(earlyDisplayed).map(row => <tr key={`${row.date}:${row.truck.id}`} className="even:bg-slate-50 hover:bg-blue-50">{earlyTableCells(row).map((cell, index) => <td key={index} className="whitespace-nowrap border-b border-r border-slate-100 p-2.5">{index === 10 ? <span className="rounded bg-blue-100 px-2 py-1 font-bold text-blue-700">{cell}</span> : cell || '-'}</td>)}</tr>)}</tbody></table>{earlyDisplayed.length === 0 && <p className="p-8 text-center text-sm text-slate-500">ไม่พบข้อมูลตามเงื่อนไข</p>}</div>
        {renderReportPager(earlyDisplayed.length)}</section>)}
      </> : kind === 'LATE' ? <>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'เข้าล่าช้าตามเกณฑ์', value: `${lateQualified.length} เที่ยว` },
            { label: 'ช่วงเวลาที่เข้าล่าช้าหนาแน่นที่สุด', value: latePeak && latePeak.count ? latePeak.name : '-' },
            { label: 'เข้าล่าช้าเฉลี่ย', value: minuteText(average(lateQualified.map(row => (summaryDelayMinutes(row.truck) || 0)))) },
            { label: 'ช่วงเวลาที่พบมากที่สุด', value: latePeak && latePeak.count ? `${latePeak.count} เที่ยว` : '0 เที่ยว' },
          ].map(card => <div key={card.label} className="rounded-xl border border-red-100 border-l-4 border-l-red-500 bg-white p-4 shadow-sm"><p className="text-xs font-bold text-slate-600">{card.label}</p><p className="mt-2 text-lg font-black text-red-800">{card.value}</p></div>)}
        </div>
        {true && true && (<section className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
            <div><h2 className="font-black text-slate-900">ความหนาแน่นของรถเข้าล่าช้า</h2><p className="mt-1 text-xs text-slate-500">จัดกลุ่มตาม Actual ETA · ล่าช้าตามเกณฑ์ตั้งแต่ {toleranceMinutes} นาที</p></div>
            <div className="flex items-end gap-3">
              <label className="text-xs font-bold text-slate-700">ช่วงเวลา<select value={lateBucketSize} onChange={event => { setLateBucketSize(Number(event.target.value) as 30 | 60); setLateSelectedBucket(null); setLateSelectedDate(null); }} className="ml-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value={60}>1 ชั่วโมง</option><option value={30}>30 นาที</option></select></label></div>
          </div>
          {!lateQualified.length ? <p className="p-12 text-center text-sm text-slate-500">ไม่พบเที่ยวที่เข้าล่าช้าอย่างน้อย {toleranceMinutes} นาที</p> : <div className="px-4 py-5 md:px-6">
            <div className="flex items-center justify-between text-xs font-bold text-slate-600"><span>จำนวนเที่ยวรถเข้าล่าช้า</span><span>รวม {lateQualified.length} เที่ยว</span></div>
            <div className="mt-3 flex h-56 items-end gap-1 border-b border-slate-200 pb-1" role="group" aria-label="จำนวนเที่ยวเข้าล่าช้าตามช่วงเวลา">
              {lateHourBins.map(bin => <button key={bin.start} type="button" title={`${bin.name}: ${bin.count} เที่ยว · ${(bin.count / lateQualified.length * 100).toFixed(1)}% · ล่าช้าเฉลี่ย ${minuteText(bin.average)}`} aria-label={`${bin.name} ${bin.count} เที่ยว`} aria-pressed={lateSelectedBucket === bin.start && lateSelectedDate === null} onClick={() => { setReportView('DETAILS');  setLateSelectedDate(null); setLateSelectedBucket(previous => previous === bin.start ? null : bin.start); }} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600" >
                {bin.count > 0 && <span className="mb-1 text-center text-[10px] font-black text-red-800">{bin.count}</span>}
                <span className={`block w-full rounded-t-sm transition-colors ${lateSelectedBucket === bin.start && lateSelectedDate === null ? 'bg-rose-800' : bin.count === latePeak?.count && bin.count > 0 ? 'bg-red-800' : 'bg-red-400 group-hover:bg-red-600'}`} style={{ height: `${bin.count ? Math.max(5, (bin.count / Math.max(1, latePeak?.count || 1)) * 85) : 1}%` }} />
              </button>)}
            </div>
            <div className="mt-2 flex justify-between text-xs text-slate-600"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div>
            <p className="mt-2 text-xs text-slate-500">คลิ้กที่แท่งเพื่อดูเฉพาะเที่ยวในช่วงเวลานั้น</p>
          </div>}
        </section>)}
        {true && true && (<section className="mt-3 max-h-[380px] overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-4"><h2 className="font-black text-slate-900">ความหนาแน่นรายวันและช่วงเวลา</h2></div>
          {lateHeatDates.length === 0 ? <p className="p-8 text-center text-slate-500">ไม่มีข้อมูล</p> : <div className="overflow-auto p-4"><div className="min-w-[780px]">
            <div className="mb-2 flex gap-1"><span className="w-28 shrink-0" />{lateHourBins.map(bin => <span key={bin.start} className="flex-1 text-center text-[9px] font-bold text-slate-600">{bin.start % 120 === 0 ? clockLabel(bin.start) : ''}</span>)}</div>
            {lateHeatDates.map(date => <div key={date} className="mb-1 flex items-center gap-1"><span className="w-28 shrink-0 text-xs font-bold text-slate-700">{date}</span>{lateHourBins.map(bin => {
              const count = lateQualified.filter(row => row.date === date && lateActualBucket(row, lateBucketSize) === bin.start).length;
              const maximum = Math.max(1, latePeak?.count || 1);
              const intensity = count / maximum;
              return <button type="button" key={bin.start} aria-label={`${date} ${bin.name}: ${count} เที่ยว`} title={`${date} ${bin.name} · ${count} เที่ยว`} onClick={() => { setReportView('DETAILS');  setLateSelectedDate(date); setLateSelectedBucket(bin.start); }} className={`h-8 min-w-0 flex-1 rounded-sm border border-white text-[9px] font-black focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 ${lateSelectedDate === date && lateSelectedBucket === bin.start ? 'ring-2 ring-rose-700' : ''} ${count ? 'text-white' : 'text-slate-400'}`} style={{ backgroundColor: count ? `rgb(${Math.round(245 - intensity * 60)}, ${Math.round(150 - intensity * 115)}, ${Math.round(150 - intensity * 100)})` : '#f1f5f9' }}>{count || ''}</button>;
            })}</div>)}
          </div></div>}
        </section>)}
        {true && (<section className="mt-3 overflow-hidden border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-100 px-4 py-3"><div className="flex flex-wrap items-center gap-3"><h2 className="font-black text-slate-800">รายละเอียดในกราฟ</h2><span className="text-xs text-slate-600">{lateDisplayed.length} เที่ยว</span>{(lateSelectedBucket !== null || lateSelectedDate !== null) && <button type="button" onClick={() => { setReportView('DETAILS');  setLateSelectedBucket(null); setLateSelectedDate(null); }} className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-bold">ล้างการเลือกช่วงเวลา</button>}</div><div className="flex gap-2"><button type="button" onClick={() => lateExport('pdf')} className="bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800">PDF</button><button type="button" onClick={() => lateExport('excel')} className="bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800">Excel</button></div></div>
          {exportError && <p role="alert" className="bg-red-50 p-3 text-sm text-red-800">{exportError}</p>}
          <div className="max-h-[360px] overflow-auto"><table className="w-full min-w-[1400px] border-separate border-spacing-0 text-left text-xs"><thead className="sticky top-0 z-10"><tr>{lateTableColumns.map(name => <th key={name} className="border-b border-r border-slate-200 bg-slate-100 p-2 text-center font-bold">{name}</th>)}</tr><tr>{lateTableColumns.map((name, index) => <th key={name} className="border-r border-sky-200 bg-sky-200 p-1.5"><input aria-label={`กรอง ${name}`} value={lateFilters[index]} onChange={event => setLateFilters(previous => previous.map((value, cell) => cell === index ? event.target.value : value))} className="w-full min-w-[75px] border border-slate-200 bg-white px-2 py-1.5 outline-none focus:border-red-500" /></th>)}</tr></thead><tbody>{pageItems(lateDisplayed).map(row => <tr key={`${row.date}:${row.truck.id}`} className="even:bg-slate-50 hover:bg-red-50">{lateTableCells(row).map((cell, index) => <td key={index} className="whitespace-nowrap border-b border-r border-slate-100 p-2.5">{index === 10 ? <span className="rounded bg-red-100 px-2 py-1 font-bold text-red-700">{cell}</span> : cell || '-'}</td>)}</tr>)}</tbody></table>{lateDisplayed.length === 0 && <p className="p-8 text-center text-sm text-slate-500">ไม่พบข้อมูลตามเงื่อนไข</p>}</div>
        {renderReportPager(lateDisplayed.length)}</section>)}
      </> : kind === 'ONTIME' ? <>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'เข้าตามแผนตามเกณฑ์', value: `${ontimeQualified.length} เที่ยว` },
            { label: 'ช่วงเวลาที่เข้าตามแผนหนาแน่นที่สุด', value: ontimePeak && ontimePeak.count ? ontimePeak.name : '-' },
            { label: 'เวลาเผื่อก่อนและหลังแผน', value: `${toleranceMinutes} นาที` },
            { label: 'ช่วงเวลาที่พบมากที่สุด', value: ontimePeak && ontimePeak.count ? `${ontimePeak.count} เที่ยว` : '0 เที่ยว' },
          ].map(card => <div key={card.label} className="rounded-xl border border-emerald-100 border-l-4 border-l-emerald-500 bg-white p-4 shadow-sm"><p className="text-xs font-bold text-slate-600">{card.label}</p><p className="mt-2 text-lg font-black text-emerald-800">{card.value}</p></div>)}
        </div>
        {true && true && (<section className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
            <div><h2 className="font-black text-slate-900">ความหนาแน่นของรถเข้าตามแผน</h2><p className="mt-1 text-xs text-slate-500">จัดกลุ่มตาม Actual ETA · ช่วง Plan ETA − {toleranceMinutes} นาที ถึง Plan ETD + {toleranceMinutes} นาที</p></div>
            <div className="flex items-end gap-3">
              <label className="text-xs font-bold text-slate-700">ช่วงเวลา<select value={ontimeBucketSize} onChange={event => { setOntimeBucketSize(Number(event.target.value) as 30 | 60); setOntimeSelectedBucket(null); setOntimeSelectedDate(null); }} className="ml-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value={60}>1 ชั่วโมง</option><option value={30}>30 นาที</option></select></label></div>
          </div>
          {!ontimeQualified.length ? <p className="p-12 text-center text-sm text-slate-500">ไม่พบเที่ยวที่อยู่ในช่วงเวลาตามแผนรวมเวลาเผื่อ</p> : <div className="px-4 py-5 md:px-6">
            <div className="flex items-center justify-between text-xs font-bold text-slate-600"><span>จำนวนเที่ยวรถเข้าตามแผน</span><span>รวม {ontimeQualified.length} เที่ยว</span></div>
            <div className="mt-3 flex h-56 items-end gap-1 border-b border-slate-200 pb-1" role="group" aria-label="จำนวนเที่ยวเข้าตามแผนตามช่วงเวลา">
              {ontimeHourBins.map(bin => <button key={bin.start} type="button" title={`${bin.name}: ${bin.count} เที่ยว · ${(bin.count / ontimeQualified.length * 100).toFixed(1)}%`} aria-label={`${bin.name} ${bin.count} เที่ยว`} aria-pressed={ontimeSelectedBucket === bin.start && ontimeSelectedDate === null} onClick={() => { setReportView('DETAILS');  setOntimeSelectedDate(null); setOntimeSelectedBucket(previous => previous === bin.start ? null : bin.start); }} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" >
                {bin.count > 0 && <span className="mb-1 text-center text-[10px] font-black text-emerald-800">{bin.count}</span>}
                <span className={`block w-full rounded-t-sm transition-colors ${ontimeSelectedBucket === bin.start && ontimeSelectedDate === null ? 'bg-green-800' : bin.count === ontimePeak?.count && bin.count > 0 ? 'bg-emerald-800' : 'bg-emerald-400 group-hover:bg-emerald-600'}`} style={{ height: `${bin.count ? Math.max(5, (bin.count / Math.max(1, ontimePeak?.count || 1)) * 85) : 1}%` }} />
              </button>)}
            </div>
            <div className="mt-2 flex justify-between text-xs text-slate-600"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div>
            <p className="mt-2 text-xs text-slate-500">คลิ้กที่แท่งเพื่อดูเฉพาะเที่ยวในช่วงเวลานั้น</p>
          </div>}
        </section>)}
        {true && true && (<section className="mt-3 max-h-[380px] overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-4"><h2 className="font-black text-slate-900">ความหนาแน่นรายวันและช่วงเวลา</h2></div>
          {ontimeHeatDates.length === 0 ? <p className="p-8 text-center text-slate-500">ไม่มีข้อมูล</p> : <div className="overflow-auto p-4"><div className="min-w-[780px]">
            <div className="mb-2 flex gap-1"><span className="w-28 shrink-0" />{ontimeHourBins.map(bin => <span key={bin.start} className="flex-1 text-center text-[9px] font-bold text-slate-600">{bin.start % 120 === 0 ? clockLabel(bin.start) : ''}</span>)}</div>
            {ontimeHeatDates.map(date => <div key={date} className="mb-1 flex items-center gap-1"><span className="w-28 shrink-0 text-xs font-bold text-slate-700">{date}</span>{ontimeHourBins.map(bin => {
              const count = ontimeQualified.filter(row => row.date === date && ontimeActualBucket(row, ontimeBucketSize) === bin.start).length;
              const maximum = Math.max(1, ontimePeak?.count || 1);
              const intensity = count / maximum;
              return <button type="button" key={bin.start} aria-label={`${date} ${bin.name}: ${count} เที่ยว`} title={`${date} ${bin.name} · ${count} เที่ยว`} onClick={() => { setReportView('DETAILS');  setOntimeSelectedDate(date); setOntimeSelectedBucket(bin.start); }} className={`h-8 min-w-0 flex-1 rounded-sm border border-white text-[9px] font-black focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${ontimeSelectedDate === date && ontimeSelectedBucket === bin.start ? 'ring-2 ring-green-700' : ''} ${count ? 'text-white' : 'text-slate-400'}`} style={{ backgroundColor: count ? `rgb(${Math.round(130 - intensity * 110)}, ${Math.round(210 - intensity * 80)}, ${Math.round(160 - intensity * 80)})` : '#f1f5f9' }}>{count || ''}</button>;
            })}</div>)}
          </div></div>}
        </section>)}
        {true && (<section className="mt-3 overflow-hidden border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-100 px-4 py-3"><div className="flex flex-wrap items-center gap-3"><h2 className="font-black text-slate-800">รายละเอียดในกราฟ</h2><span className="text-xs text-slate-600">{ontimeDisplayed.length} เที่ยว</span>{(ontimeSelectedBucket !== null || ontimeSelectedDate !== null) && <button type="button" onClick={() => { setReportView('DETAILS');  setOntimeSelectedBucket(null); setOntimeSelectedDate(null); }} className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-bold">ล้างการเลือกช่วงเวลา</button>}</div><div className="flex gap-2"><button type="button" onClick={() => ontimeExport('pdf')} className="bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800">PDF</button><button type="button" onClick={() => ontimeExport('excel')} className="bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800">Excel</button></div></div>
          {exportError && <p role="alert" className="bg-emerald-50 p-3 text-sm text-emerald-800">{exportError}</p>}
          <div className="max-h-[360px] overflow-auto"><table className="w-full min-w-[1400px] border-separate border-spacing-0 text-left text-xs"><thead className="sticky top-0 z-10"><tr>{ontimeTableColumns.map(name => <th key={name} className="border-b border-r border-slate-200 bg-slate-100 p-2 text-center font-bold">{name}</th>)}</tr><tr>{ontimeTableColumns.map((name, index) => <th key={name} className="border-r border-sky-200 bg-sky-200 p-1.5"><input aria-label={`กรอง ${name}`} value={ontimeFilters[index]} onChange={event => setOntimeFilters(previous => previous.map((value, cell) => cell === index ? event.target.value : value))} className="w-full min-w-[75px] border border-slate-200 bg-white px-2 py-1.5 outline-none focus:border-emerald-500" /></th>)}</tr></thead><tbody>{pageItems(ontimeDisplayed).map(row => <tr key={`${row.date}:${row.truck.id}`} className="even:bg-slate-50 hover:bg-emerald-50">{ontimeTableCells(row).map((cell, index) => <td key={index} className="whitespace-nowrap border-b border-r border-slate-100 p-2.5">{index === 10 ? <span className="rounded bg-emerald-100 px-2 py-1 font-bold text-emerald-700">{cell}</span> : cell || '-'}</td>)}</tr>)}</tbody></table>{ontimeDisplayed.length === 0 && <p className="p-8 text-center text-sm text-slate-500">ไม่พบข้อมูลตามเงื่อนไข</p>}</div>
        {renderReportPager(ontimeDisplayed.length)}</section>)}
      </> : kind === 'DWELL' ? <>
        {kind === 'DWELL' && (<section className="mt-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-black text-slate-900">รายงานระยะเวลาปฏิบัติงาน</h2><span className="text-xs text-slate-500">{dwellRouteAverages.length} Route · เฉลี่ยจาก {dwellChartTrips.length} เที่ยว · เรียงตามเวลาเกินมาตรฐานเฉลี่ยมากที่สุด</span></div>
          <div className="mt-3 flex flex-wrap gap-4 text-xs font-bold"><span className="inline-flex items-center gap-1 text-slate-700"><span className="inline-block w-6 border-t-2 border-dashed border-slate-700" />เวลามาตรฐานเฉลี่ย</span><span className="text-orange-700">■ เวลาจริงเฉลี่ยเกินมาตรฐาน</span><span className="text-emerald-700">■ เวลาจริงเฉลี่ยไม่เกินมาตรฐาน</span></div>
          <p className="mt-2 text-xs text-slate-500">กดไอคอน i เพื่อดูรายละเอียดทุกเที่ยวของ Route</p>
          {!dwellRouteAverages.length ? <p className="py-8 text-center text-slate-500">ไม่พบเที่ยวตามเงื่อนไข</p> : <div className="mt-4 overflow-x-auto">
            <div className="min-w-[1200px] pr-2">
              <div className="relative ml-14 h-[280px] mt-6 border-b border-l border-slate-300">
                {[0, 0.25, 0.5, 0.75, 1].map(fraction => <div key={fraction} className="pointer-events-none absolute left-0 right-0 border-t border-slate-200" style={{ bottom: `${fraction * 100}%` }}><span className="absolute right-full -translate-y-1/2 whitespace-nowrap pr-2 text-[10px] text-slate-500">{Math.round(dwellScale * fraction)} นาที</span></div>)}
                <div className="absolute inset-0 grid grid-cols-[repeat(20,minmax(0,1fr))] gap-2 px-2">
                  {dwellRouteAverages.slice(dwellCurrentPage * 20, (dwellCurrentPage + 1) * 20).map(item => <button key={item.key} type="button" aria-label={`${item.route} ${item.count} เที่ยว มาตรฐาน ${minuteText(item.standard)} เวลาจริงเฉลี่ย ${minuteText(item.actual)} ดูรายละเอียด`} title={`มาตรฐาน ${minuteText(item.standard)} · เวลาจริงเฉลี่ย ${minuteText(item.actual)}`} onClick={() => { setDwellSelectedRoute(item.key); setReportPage(1); dwellDetailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} className="relative flex h-full min-w-0 items-end justify-center gap-1 px-1 hover:bg-blue-50/50 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <span className={`relative block w-8 max-w-[55%] ${(item.excess ?? 0) > 0 ? 'bg-orange-500' : 'bg-emerald-500'}`} style={{ height: `${(item.actual ?? 0) / dwellScale * 100}%` }}><span className={`absolute bottom-full left-1/2 -translate-x-1/2 pb-1 text-[11px] font-bold ${(item.excess ?? 0) > 0 ? 'text-orange-700' : 'text-emerald-700'}`}>{Number((item.actual ?? 0).toFixed(1))}</span></span>
                  </button>)}
                </div>
                <div className="pointer-events-none absolute inset-0 z-10 grid grid-cols-[repeat(20,minmax(0,1fr))] gap-0 px-2" aria-label="เส้นระดับเวลามาตรฐาน">
                  {dwellRouteAverages.slice(dwellCurrentPage * 20, (dwellCurrentPage + 1) * 20).map((item, index, pageTrips) => {
                    const uniform = pageTrips.every(trip => trip.standard === pageTrips[0].standard);
                    return <div key={item.key} className="relative h-full min-w-0">
                      {item.standard !== null && <span className="absolute left-0 right-0 border-t-2 border-dashed border-slate-700" style={{ bottom: `${item.standard / dwellScale * 100}%` }}>
                        {(!uniform || index === 0) && <span className="absolute bottom-1 left-0 whitespace-nowrap rounded bg-white/90 px-1 text-[10px] font-bold text-slate-700">{uniform ? 'มาตรฐาน ' : ''}{Number(item.standard.toFixed(1))} นาที</span>}
                      </span>}
                    </div>;
                  })}
                </div>
              </div>
              <div className="ml-14 grid grid-cols-[repeat(20,minmax(0,1fr))] gap-2 px-2 pt-2">
                {dwellRouteAverages.slice(dwellCurrentPage * 20, (dwellCurrentPage + 1) * 20).map(item => <div key={item.key} className="min-w-0 text-center">
                  <p className="truncate text-xs font-bold text-slate-800" title={item.route}>{item.route}</p>
                  <button type="button" aria-label={`ดูรายละเอียด ${item.route}`} title="ดูรายละเอียดทุกเที่ยวของ Route" onClick={() => { setDwellSelectedRoute(item.key); setReportPage(1); dwellDetailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} className="mt-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-blue-300 bg-white text-sm font-bold text-blue-700 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500"><span aria-hidden="true" className="font-serif">i</span></button>
                </div>)}
              </div>
            </div>
          </div>}
          {dwellChartPages > 1 && <div className="mt-4 flex flex-wrap items-center justify-end gap-3 text-sm"><button type="button" disabled={dwellCurrentPage === 0} onClick={() => setDwellChartPage(dwellCurrentPage - 1)} className="rounded border px-3 py-2 disabled:opacity-40">ก่อนหน้า</button><span>หน้า {dwellCurrentPage + 1} / {dwellChartPages}</span><button type="button" disabled={dwellCurrentPage + 1 >= dwellChartPages} onClick={() => setDwellChartPage(dwellCurrentPage + 1)} className="rounded border px-3 py-2 disabled:opacity-40">ถัดไป</button></div>}
        </section>)}
        {kind === 'DWELL' && (<section ref={dwellDetailsRef} className="mt-3 scroll-mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-100 px-4 py-3">
            <div className="flex flex-wrap items-center gap-3"><h2 className="font-black text-slate-800">รายละเอียดในกราฟ</h2><span role="status" className="text-xs text-slate-600">{dwellVisibleTrips.length} เที่ยว</span>
              <button type="button" onClick={() => { setDwellSelectedRoute(null); setDwellArrivalSelection(null); setDwellTableFilters(Array(DWELL_COLUMNS.length).fill('')); setDwellChartPage(0); }} className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-bold">ล้างตัวกรองผลลัพธ์</button>
            </div>
            <div className="flex gap-2"><button type="button" onClick={() => dwellExport('pdf')} className="bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-600">PDF</button><button type="button" onClick={() => dwellExport('excel')} className="bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-600">Excel</button></div>
          </div>
          {exportError && <p role="alert" className="bg-red-50 p-3 text-sm text-red-800">{exportError}</p>}
          <div className="max-h-[360px] overflow-auto"><table className="w-full min-w-[1900px] border-separate border-spacing-0 text-left text-xs"><thead className="sticky top-0 z-10"><tr>{DWELL_COLUMNS.map(name => <th key={name} scope="col" className="whitespace-nowrap border-b border-r border-slate-200 bg-slate-100 p-2 text-center font-bold">{name}</th>)}</tr><tr>{DWELL_COLUMNS.map((name,index) => <th key={name} className="border-r border-sky-200 bg-sky-200 p-1.5"><input type="text" aria-label={`กรอง ${name}`} value={dwellTableFilters[index]} onChange={event => setDwellTableFilters(previous => previous.map((value,cell) => cell === index ? event.target.value : value))} className="w-full min-w-[75px] border border-slate-200 bg-white px-2 py-1.5 font-normal outline-none focus:border-blue-500" /></th>)}</tr></thead><tbody>{pageItems(dwellVisibleTrips).map(item => <tr key={item.key} className="even:bg-slate-50 hover:bg-blue-50">{dwellTripCells(item).map((value,index) => <td key={index} className={`border-b border-r border-slate-100 p-2.5 ${index === 15 ? 'min-w-[220px] whitespace-normal' : 'whitespace-nowrap'} ${index === 14 && (item.excess ?? 0) > 0 ? 'font-bold text-orange-700' : ''} ${index === 10 ? item.status === 'EARLY' ? 'font-bold text-blue-700' : item.status === 'LATE' ? 'font-bold text-red-700' : item.status === 'ONTIME' ? 'font-bold text-emerald-700' : '' : ''}`}>{value || '-'}</td>)}</tr>)}</tbody></table>{!dwellVisibleTrips.length && <p className="py-10 text-center text-sm text-slate-500">ไม่พบข้อมูลที่ตรงกับตัวกรอง</p>}</div>
        {renderReportPager(dwellVisibleTrips.length)}</section>)}
      </> : <>
      {true && (<section className="mt-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-black text-slate-900">{reportTitle}</h2><span className="text-xs font-bold text-slate-500">แสดง {metricRows.length} รายการ</span></div>
        {!rows.length ? <p className="py-20 text-center text-slate-500">ไม่พบเที่ยวในเงื่อนไขที่เลือก</p> : <div className="mt-6 space-y-4">{metricRows.slice(0, kind === 'ROUTE' ? 15 : 30).map(item => {
          const compactValue = ['POINT','ROUTE','SUPPLIER'].includes(kind || '')
              ? `${item.count} เที่ยว · ${percentage(item.rate)}`
              : percentage(item.rate);
          return <div key={item.name} title={['POINT','ROUTE','SUPPLIER'].includes(kind || '') ? `มีปัญหา ${item.count} จาก ${item.total} เที่ยว · สาเหตุหลัก ${item.topReason || '-'}` : `${item.count} จาก ${item.measured} เที่ยว · เฉลี่ย ${minuteText(item.average)}`}>
            <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
              <strong className="truncate text-slate-900">{item.name}</strong>
              <span className="shrink-0 font-black text-slate-700">{compactValue}</span>
            </div>
            <div className="h-6 overflow-hidden rounded-md bg-slate-100"><div className={`h-full rounded-md ${kind === 'LATE' || ['POINT','ROUTE','SUPPLIER'].includes(kind || '') ? 'bg-orange-500' : kind === 'EARLY' ? 'bg-cyan-500' : 'bg-emerald-500'}`} style={{ width: `${(item.rate ?? 0) / maximumBar * 100}%` }} /></div>
          </div>;
        })}</div>}
      </section>)}
      </>}
      {kind === 'ROUTE' && <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs leading-6 text-amber-900">การจัดอันดับ Route แสดงเฉพาะ Route ที่มีอย่างน้อย 3 เที่ยวในช่วงรายงาน เพื่อป้องกัน Route ที่มีข้อมูลน้อยถูกจัดอันดับสูงเกินจริง</p>}
      
      
      {kind !== 'DWELL' && kind !== 'SUMMARY' && kind !== 'EARLY' && kind !== 'LATE' && kind !== 'ONTIME' && <>{true && <><div className="mt-3 max-h-[430px] overflow-auto rounded-xl border border-slate-200 bg-white"><table className="w-full min-w-[1200px] text-left text-xs"><thead className="sticky top-0 bg-slate-100"><tr>{['วันที่','Route','สังกัด','ทะเบียน','จุดลงงาน','Plan ETA','Actual ETA','Plan ETD','Actual ETD','ผลต่าง ETA','เกินเวลาปฏิบัติงาน','ปัญหา'].map(heading => <th key={heading} className="whitespace-nowrap p-3 font-black">{heading}</th>)}</tr></thead><tbody>{pageItems(rows).map(row => <tr key={`${row.date}:${row.truck.id}`} className="hover:bg-slate-50">{[row.date,row.truck.route,row.truck.supplierName,row.truck.licensePlate,row.truck.dropPoint,row.truck.planEta,row.truck.stampEta || row.truck.actualEta,row.truck.planEtd,row.truck.stampEtd || (row.truck as Truck & { actualEtd?: unknown }).actualEtd,timeBeyondOnPlan(row.truck, toleranceMinutes) === null ? '-' : `${Math.round(timeBeyondOnPlan(row.truck, toleranceMinutes)!)} นาที`,dwellBeyondTolerance(row.truck, toleranceMinutes) === null ? '-' : `${Math.round(dwellBeyondTolerance(row.truck, toleranceMinutes)!)} นาที`,row.truck.actionProblem].map((item,index) => <td key={index} className="border-t border-slate-100 p-3">{text(item) || '-'}</td>)}</tr>)}</tbody></table></div>{renderReportPager(rows.length)}</>}</>}
    </div>}
  </div>;
}
