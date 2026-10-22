import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Truck } from '../types';
import { fetchDailyPlans, fetchEliveDashboardData } from '../lib/sheets';

interface ReportProps { trucks: Truck[]; selectedDate?: string; }
type Kind = 'EARLY' | 'ONTIME' | 'LATE' | 'DWELL' | 'POINT' | 'ROUTE' | 'SUPPLIER';
type ReportRow = { truck: Truck & { planRemark?: string }; date: string };
type MetricRow = { name: string; total: number; measured: number; count: number; rate: number | null; average: number | null; maximum: number | null; topReason?: string };

const DEFAULT_TOLERANCE_MINUTES = 10;
const TOLERANCE_OPTIONS = [3, 5, 10, 15, 20, 30, 45, 60];
const MAX_REPORT_DAYS = 92;
const reportGroups: Array<{ title: string; reports: Array<{ id: Kind; title: string; description: string }> }> = [
  { title: 'ประสิทธิภาพการมาถึง', reports: [
    { id: 'EARLY', title: 'รถเข้าก่อนเวลา', description: 'จำนวนเที่ยว อัตรา และนาทีที่เข้าก่อนแผน' },
    { id: 'ONTIME', title: 'รถมาตรงเวลา', description: 'จำนวนเที่ยวและอัตราที่มาถึงภายในช่วง ON PLAN ที่กำหนด' },
    { id: 'LATE', title: 'รถมาช้ากว่าแผน', description: 'จำนวนเที่ยว อัตรา และนาทีที่มาช้ากว่าแผน' },
  ]},
  { title: 'ประสิทธิภาพ ณ จุดลงงาน', reports: [
    { id: 'DWELL', title: 'ระยะเวลาปฏิบัติงานเกินแผน', description: 'เปรียบเทียบเวลาจริงกับเวลาตามแผน แยกตามจุดลงงาน' },
  ]},
  { title: 'ปัญหาและการติดตาม', reports: [
    { id: 'POINT', title: 'ปัญหาแยกตามจุดลงงาน', description: 'จำนวนและอัตราเที่ยวที่มีปัญหาในแต่ละจุด' },
    { id: 'ROUTE', title: 'Route ที่มีปัญหาบ่อยที่สุด', description: 'จัดอันดับ Route ตามอัตราและจำนวนเที่ยวที่มีปัญหา' },
    { id: 'SUPPLIER', title: 'สังกัดที่มีปัญหามากที่สุด', description: 'จัดอันดับสังกัดตามอัตราและจำนวนเที่ยวที่มีปัญหา' },
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
  return status === 'NO_WORK' || performanceStatus === 'NO_DROP' || remark === 'NO_WORK' || text(truck.actionProblem).includes('ไม่มีงาน');
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
  if (Math.abs(raw) > 720) return null;
  return raw;
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

export default function Report({ selectedDate = '' }: ReportProps) {
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
  const [result, setResult] = useState<{ kind: Kind; days: string[]; rows: ReportRow[]; start: string; end: string; startTime: string; endTime: string; allDay: boolean; toleranceMinutes: number } | null>(null);
  const [supplier, setSupplier] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const generation = useRef(0);
  useEffect(() => () => { generation.current += 1; }, []);

  const openReport = (kind: Kind) => { setSelectedKind(kind); setResult(null); setError(''); setShowDetails(false); };
  const loadReport = async (event: React.FormEvent) => {
    event.preventDefault(); if (!selectedKind || loading) return;
    let days: string[];
    try { days = datesBetween(startDate, endDate); } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'ช่วงวันที่ไม่ถูกต้อง'); return; }
    const toleranceMinutes = toleranceMode === 'CUSTOM' ? Number(customTolerance) : presetTolerance;
    const isTimeReport = ['EARLY', 'ONTIME', 'LATE', 'DWELL'].includes(selectedKind);
    if (isTimeReport && (!Number.isInteger(toleranceMinutes) || toleranceMinutes < 1 || toleranceMinutes > 720)) { setError('กรุณาระบุเกณฑ์เวลา 1–720 นาที'); return; }
    const effectiveStartTime = allDay ? '00:00' : startTime;
    const effectiveEndTime = allDay ? '23:59' : endTime;
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
          if (upper(plan.project) !== 'INBOUND') continue;
          const id = upper(plan.codeRun); if (!id || usedIds.has(id)) continue; usedIds.add(id);
          const actual = actualById.get(id);
          const truck = { ...actual, id, planDate: date, project: plan.project, route: plan.route, supplierName: plan.company, licensePlate: plan.truckName, dropPoint: plan.dropPoint, planEta: plan.planEta, planEtd: plan.planEtd, planRemark: plan.remark } as Truck & { planRemark?: string };
          if (isInbound(truck)) {
            const reportRow = { truck, date };
            const plannedAt = planDateTimeValue(reportRow);
            if (plannedAt !== null && plannedAt >= rangeStart && plannedAt <= rangeEnd) rows.push(reportRow);
          }
        }
      }
      setResult({ kind: selectedKind, days, rows, start: startDate, end: endDate, startTime: effectiveStartTime, endTime: effectiveEndTime, allDay, toleranceMinutes }); setSupplier(''); setProgress(''); setShowDetails(false);
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
  const dwellMeasured = useMemo(() => rows.map(row => dwellBeyondTolerance(row.truck, toleranceMinutes)).filter((item): item is number => item !== null), [rows]);
  const dwellExceeded = useMemo(() => dwellMeasured.filter(item => item > 0), [dwellMeasured]);
  const problemRows = useMemo(() => rows.filter(row => problemReason(row.truck)), [rows]);
  const metricRows = useMemo(() => {
    if (!kind) return [];
    if (kind === 'DWELL' || kind === 'POINT') return metricBy(rows, row => text(row.truck.dropPoint) || 'ไม่ระบุจุดลงงาน', kind, toleranceMinutes);
    if (kind === 'ROUTE') return metricBy(rows, row => text(row.truck.route) || 'ไม่ระบุ Route', kind, toleranceMinutes).filter(item => item.total >= 3);
    if (kind === 'SUPPLIER') return metricBy(rows, row => text(row.truck.supplierName) || 'ไม่ระบุสังกัด', kind, toleranceMinutes);
    return metricBy(rows, row => row.date, kind, toleranceMinutes);
  }, [kind, rows, toleranceMinutes]);
  const reportTitle = flatReports.find(item => item.id === (kind || selectedKind))?.title || 'รายงาน';
  const maximumBar = Math.max(1, ...metricRows.map(item => item.rate ?? 0));
  const summary = kind === 'DWELL'
    ? [['เที่ยว INBOUND ทั้งหมด', rows.length], ['ประเมินเวลาได้', dwellMeasured.length], ['ใช้เวลาเกินแผน', dwellExceeded.length], ['เกินแผนเฉลี่ย', minuteText(average(dwellExceeded))], ['เกินแผนสูงสุด', minuteText(dwellExceeded.length ? Math.max(...dwellExceeded) : null)]]
    : kind && ['POINT', 'ROUTE', 'SUPPLIER'].includes(kind)
      ? [['เที่ยว INBOUND ทั้งหมด', rows.length], ['เที่ยวที่มีปัญหา', problemRows.length], ['อัตราเกิดปัญหา', percentage(rows.length ? problemRows.length / rows.length * 100 : null)], ['ปัญหาที่ยังไม่เสร็จสิ้น', problemRows.filter(row => upper(row.truck.actionStatus) !== 'CLOSED').length]]
      : [['เที่ยว INBOUND ทั้งหมด', rows.length], ['ประเมินเวลาได้', measuredArrival.length], [kind === 'EARLY' ? 'เข้าก่อนเวลา' : kind === 'ONTIME' ? 'มาตรงเวลา' : 'มาช้ากว่าแผน', matchedArrival.length], ['อัตรา', percentage(measuredArrival.length ? matchedArrival.length / measuredArrival.length * 100 : null)], [kind === 'ONTIME' ? `ช่วงตรงเวลา` : 'เฉลี่ย', kind === 'ONTIME' ? `±${toleranceMinutes} นาที` : minuteText(average(arrivalValues))]];

  const exportCsv = () => {
    if (!result || !kind) return;
    const output: unknown[][] = [['รายงาน', reportTitle], ['ช่วงวันและเวลา', `${result.start} ${result.startTime}`, `${result.end} ${result.endTime}`], ['โครงการ', 'INBOUND'], ['เกณฑ์ตรงเวลา', `±${toleranceMinutes} นาที`], ['สังกัด', supplier || 'ทั้งหมด'], []];
    output.push(['รายการ', 'เที่ยวทั้งหมด', 'ประเมินได้', 'จำนวนที่เข้าเงื่อนไข', 'อัตรา %', 'เฉลี่ยนาที', 'สูงสุดนาที', 'สาเหตุหลัก'], ...metricRows.map(item => [item.name, item.total, item.measured, item.count, item.rate?.toFixed(1) || '', item.average?.toFixed(1) || '', item.maximum?.toFixed(1) || '', item.topReason || '']));
    output.push([], ['รายละเอียดเที่ยว INBOUND'], ['วันที่', 'Route', 'สังกัด', 'ทะเบียน', 'จุดลงงาน', 'Plan ETA', 'Actual ETA', 'Plan ETD', 'Actual ETD', 'ความต่าง ETA (นาที)', 'เกินเวลาปฏิบัติงาน (นาที)', 'ปัญหา']);
    rows.forEach(row => output.push([row.date, row.truck.route, row.truck.supplierName, row.truck.licensePlate, row.truck.dropPoint, row.truck.planEta, row.truck.stampEta || row.truck.actualEta, row.truck.planEtd, row.truck.stampEtd || (row.truck as Truck & { actualEtd?: unknown }).actualEtd, timeBeyondOnPlan(row.truck, toleranceMinutes), dwellBeyondTolerance(row.truck, toleranceMinutes), row.truck.actionProblem]));
    const url = URL.createObjectURL(new Blob(['\uFEFF' + output.map(line => line.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `INBOUND-${kind}-${result.start}-${result.end}.csv`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <div className="h-full min-h-0 overflow-auto bg-slate-50 p-4 md:p-6">
    {!selectedKind ? <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-black text-slate-900">ศูนย์รวมรายงานสำหรับผู้บริหาร</h1>
      <p className="mt-2 text-sm text-slate-500">เลือกประเภทรายงาน · ใช้เฉพาะเที่ยวโครงการ INBOUND</p>
      <div className="mt-6 grid gap-5 lg:grid-cols-2">{reportGroups.map(group => <section key={group.title} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><h2 className="border-b border-slate-200 bg-slate-100 px-5 py-3 text-sm font-black text-slate-800">{group.title}</h2><div className="grid gap-2 p-4 sm:grid-cols-2">{group.reports.map(report => <button key={report.id} type="button" onClick={() => openReport(report.id)} className="rounded-lg border border-slate-200 bg-white p-4 text-left hover:border-blue-400 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500"><span className="block text-sm font-black text-slate-900">{report.title}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{report.description}</span></button>)}</div></section>)}</div>
    </div> : !result ? <div className="max-w-2xl">
      <button type="button" onClick={() => setSelectedKind(null)} className="text-sm font-bold text-blue-700">← กลับไปเลือกรายงาน</button>
      <h1 className="mt-4 text-xl font-black text-slate-900">{reportTitle}</h1><p className="mt-2 text-sm text-slate-500">เลือกช่วงวันที่ · เฉพาะโครงการ INBOUND</p>
      <form onSubmit={loadReport} className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><fieldset disabled={loading} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold text-slate-700">วันที่เริ่มต้น<input type="date" required value={startDate} onChange={event => setStartDate(event.target.value)} className="mt-2 block w-full rounded-lg border border-slate-300 p-3" /></label><label className="text-sm font-bold text-slate-700">วันที่สิ้นสุด<input type="date" required min={startDate} value={endDate} onChange={event => setEndDate(event.target.value)} className="mt-2 block w-full rounded-lg border border-slate-300 p-3" /></label></div>
        <div><label className="inline-flex items-center gap-2 text-sm font-bold text-slate-700"><input type="checkbox" checked={allDay} onChange={event => setAllDay(event.target.checked)} />ทั้งวัน</label><div className="mt-3 grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold text-slate-700">เวลาเริ่มต้น<input type="time" required={!allDay} disabled={allDay} value={startTime} onChange={event => setStartTime(event.target.value)} className="mt-2 block w-full rounded-lg border border-slate-300 p-3 disabled:bg-slate-100" /></label><label className="text-sm font-bold text-slate-700">เวลาสิ้นสุด<input type="time" required={!allDay} disabled={allDay} value={endTime} onChange={event => setEndTime(event.target.value)} className="mt-2 block w-full rounded-lg border border-slate-300 p-3 disabled:bg-slate-100" /></label></div></div>
        {selectedKind && ['EARLY','ONTIME','LATE','DWELL'].includes(selectedKind) && <div className="rounded-lg border border-blue-100 bg-blue-50 p-4"><p className="text-sm font-black text-blue-900">เกณฑ์เวลา (นาที)</p><div className="mt-3 flex flex-wrap items-center gap-4"><label className="inline-flex items-center gap-2 text-sm"><input type="radio" checked={toleranceMode === 'PRESET'} onChange={() => setToleranceMode('PRESET')} />เลือกนาที</label><select disabled={toleranceMode !== 'PRESET'} value={presetTolerance} onChange={event => setPresetTolerance(Number(event.target.value))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 disabled:bg-slate-100">{TOLERANCE_OPTIONS.map(value => <option key={value} value={value}>{value} นาที</option>)}</select><label className="inline-flex items-center gap-2 text-sm"><input type="radio" checked={toleranceMode === 'CUSTOM'} onChange={() => setToleranceMode('CUSTOM')} />ระบุนาที</label><input type="number" min="1" max="720" step="1" disabled={toleranceMode !== 'CUSTOM'} value={customTolerance} onChange={event => setCustomTolerance(event.target.value)} className="w-28 rounded-lg border border-slate-300 bg-white px-3 py-2 disabled:bg-slate-100" /><span className="text-sm text-slate-600">นาที</span></div></div>}
      </fieldset><p className="mt-3 text-xs text-slate-500">กรองเที่ยวตาม Plan ETA · รวมวันและเวลาต้นทางถึงปลายทาง · สูงสุด {MAX_REPORT_DAYS} วันต่อครั้ง</p><div role="status" aria-live="polite" className="mt-3 text-sm font-semibold text-blue-700">{progress}</div>{error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}<div className="mt-5 flex justify-end gap-2">{loading && <button type="button" onClick={cancelLoading} className={buttonClass}>ยกเลิก</button>}<button type="submit" disabled={loading} className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-bold text-white disabled:opacity-50">{loading ? 'กำลังสร้างรายงาน...' : 'แสดงรายงาน'}</button></div></form>
    </div> : <div className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><button type="button" onClick={() => setResult(null)} className="text-sm font-bold text-blue-700">← เปลี่ยนช่วงวันที่</button><h1 className="mt-3 text-xl font-black text-slate-900">{reportTitle}</h1><p className="mt-2 text-sm text-slate-500">{result.start} {result.startTime} ถึง {result.end} {result.endTime} · เฉพาะโครงการ INBOUND · โหลดครบ {result.days.length} วัน</p></div><div className="flex flex-wrap items-end gap-2"><label className="text-xs font-bold text-slate-500">สังกัด<select value={supplier} onChange={event => setSupplier(event.target.value)} className="mt-1 block max-w-56 rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-800"><option value="">ทุกสังกัด</option>{suppliers.map(item => <option key={item}>{item}</option>)}</select></label><button type="button" onClick={exportCsv} className={buttonClass}>ส่งออก CSV</button><button type="button" onClick={() => { setResult(null); setSelectedKind(null); }} className={buttonClass}>เลือกรายงานอื่น</button></div></div>
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5">{summary.map(([label, item]) => <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-2 text-2xl font-black text-slate-900">{item}</p></div>)}</div>
      <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-black text-slate-900">{reportTitle}</h2><span className="text-xs font-bold text-slate-500">แสดง {metricRows.length} รายการ</span></div>
        {!rows.length ? <p className="py-20 text-center text-slate-500">ไม่พบเที่ยว INBOUND ในช่วงวันที่และสังกัดที่เลือก</p> : <div className="mt-6 space-y-4">{metricRows.slice(0, kind === 'ROUTE' ? 15 : 30).map(item => {
          const compactValue = kind === 'DWELL'
            ? `${percentage(item.rate)} · ${minuteText(item.average)}`
            : ['POINT','ROUTE','SUPPLIER'].includes(kind || '')
              ? `${item.count} เที่ยว · ${percentage(item.rate)}`
              : percentage(item.rate);
          return <div key={item.name} title={kind === 'DWELL' ? `เกินแผน ${item.count} จาก ${item.measured} เที่ยว · เฉลี่ย ${minuteText(item.average)} · สูงสุด ${minuteText(item.maximum)}` : ['POINT','ROUTE','SUPPLIER'].includes(kind || '') ? `มีปัญหา ${item.count} จาก ${item.total} เที่ยว · สาเหตุหลัก ${item.topReason || '-'}` : `${item.count} จาก ${item.measured} เที่ยว · เฉลี่ย ${minuteText(item.average)}`}>
            <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
              <strong className="truncate text-slate-900">{item.name}</strong>
              <span className="shrink-0 font-black text-slate-700">{compactValue}</span>
            </div>
            <div className="h-6 overflow-hidden rounded-md bg-slate-100"><div className={`h-full rounded-md ${kind === 'LATE' || kind === 'DWELL' || ['POINT','ROUTE','SUPPLIER'].includes(kind || '') ? 'bg-orange-500' : kind === 'EARLY' ? 'bg-cyan-500' : 'bg-emerald-500'}`} style={{ width: `${(item.rate ?? 0) / maximumBar * 100}%` }} /></div>
          </div>;
        })}</div>}
      </section>
      {kind === 'ROUTE' && <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs leading-6 text-amber-900">การจัดอันดับ Route แสดงเฉพาะ Route ที่มีอย่างน้อย 3 เที่ยวในช่วงรายงาน เพื่อป้องกัน Route ที่มีข้อมูลน้อยถูกจัดอันดับสูงเกินจริง</p>}
      {['EARLY','ONTIME','LATE'].includes(kind || '') && <p className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-xs leading-6 text-blue-900">เกณฑ์มาตรฐาน: ก่อนเวลา = เร็วกว่า Plan ETA มากกว่า {toleranceMinutes} นาที · ตรงเวลา = อยู่ในช่วง ±{toleranceMinutes} นาที · ล่าช้า = ช้ากว่า Plan ETA มากกว่า {toleranceMinutes} นาที · ตัวหารใช้เฉพาะเที่ยวที่มี Plan ETA และ Actual ETA ครบ โดยไม่รวม NO WORK และ CANCEL</p>}
      {kind === 'DWELL' && <p className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-xs leading-6 text-blue-900">เวลาเกินเกณฑ์ = (Actual ETD − Actual ETA) − (Plan ETD − Plan ETA) − เกณฑ์ {toleranceMinutes} นาที · ต้องมีเวลาครบทั้ง 4 ค่า · รองรับงานข้ามเที่ยงคืน · ไม่รวม NO WORK และ CANCEL · เวลาปฏิบัติงานที่เกิน 12 ชั่วโมงถูกตัดออกจากการประเมินเพื่อป้องกันข้อมูลผิดปกติ</p>}
      <button type="button" onClick={() => setShowDetails(current => !current)} aria-expanded={showDetails} className={`${buttonClass} mt-4`}>{showDetails ? 'ซ่อน' : 'ดู'}รายละเอียดเที่ยวรถ ({rows.length})</button>
      {showDetails && <div className="mt-3 max-h-[430px] overflow-auto rounded-xl border border-slate-200 bg-white"><table className="w-full min-w-[1200px] text-left text-xs"><thead className="sticky top-0 bg-slate-100"><tr>{['วันที่','Route','สังกัด','ทะเบียน','จุดลงงาน','Plan ETA','Actual ETA','Plan ETD','Actual ETD','ผลต่าง ETA','เกินเวลาปฏิบัติงาน','ปัญหา'].map(heading => <th key={heading} className="whitespace-nowrap p-3 font-black">{heading}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={`${row.date}:${row.truck.id}`} className="hover:bg-slate-50">{[row.date,row.truck.route,row.truck.supplierName,row.truck.licensePlate,row.truck.dropPoint,row.truck.planEta,row.truck.stampEta || row.truck.actualEta,row.truck.planEtd,row.truck.stampEtd || (row.truck as Truck & { actualEtd?: unknown }).actualEtd,timeBeyondOnPlan(row.truck, toleranceMinutes) === null ? '-' : `${Math.round(timeBeyondOnPlan(row.truck, toleranceMinutes)!)} นาที`,dwellBeyondTolerance(row.truck, toleranceMinutes) === null ? '-' : `${Math.round(dwellBeyondTolerance(row.truck, toleranceMinutes)!)} นาที`,row.truck.actionProblem].map((item,index) => <td key={index} className="border-t border-slate-100 p-3">{text(item) || '-'}</td>)}</tr>)}</tbody></table></div>}
    </div>}
  </div>;
}
