import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Truck } from '../types';
import { fetchDailyPlans, fetchEliveDashboardData } from '../lib/sheets';

interface ReportProps { trucks: Truck[]; selectedDate?: string; }
type Kind = 'VOLUME' | 'ONTIME' | 'SUPPLIER' | 'PROBLEM';
type Row = { truck: Truck; date: string };
const reports: { id: Kind; title: string; description: string }[] = [
  { id: 'VOLUME', title: 'ปริมาณงานตามแผนเทียบผลจริง', description: 'กราฟแท่งซ้อนรายวัน แยกงานสำเร็จ คงค้าง ไม่มีงานลง และยกเลิก' },
  { id: 'ONTIME', title: 'ความตรงต่อเวลา', description: 'กราฟเส้นอัตราถึงตรงเวลารายวัน พร้อมจำนวนเที่ยวที่ใช้ประเมิน' },
  { id: 'SUPPLIER', title: 'ผลการปฏิบัติงานแยกตามสังกัด', description: 'กราฟแท่งเปรียบเทียบอัตราถึงตรงเวลาและจำนวนเที่ยวของแต่ละสังกัด' },
  { id: 'PROBLEM', title: 'สาเหตุปัญหา', description: 'กราฟแท่งเรียงสาเหตุจากมากไปน้อย เพื่อระบุประเด็นที่ควรติดตาม' },
];
const colors = ['#059669', '#2563eb', '#64748b', '#e11d48'];
const outcomes = ['ดำเนินการเสร็จสิ้น', 'งานคงค้าง', 'ไม่มีงานลง', 'ยกเลิก'];
function text(v: unknown): string { return String(v ?? '').trim(); }
function upper(v: unknown): string { return text(v).toUpperCase(); }
function inbound(t: Truck): boolean { return upper(t.project) === 'INBOUND'; }
function outcome(t: Truck): number {
  if (['CANCEL', 'CANCELLED', 'CANCELED'].includes(upper(t.status)) || ['CANCEL', 'CANCELLED', 'CANCELED'].includes(upper((t as Truck & { planRemark?: string }).planRemark))) return 3;
  if (upper(t.status) === 'NO_WORK' || upper(t.performanceStatus) === 'NO_DROP' || text(t.actionProblem).includes('ไม่มีงาน')) return 2;
  if (['COMPLETED', 'TRUCK_OUT'].includes(upper(t.status)) || text(t.stampEtd)) return 0;
  return 1;
}
function datesBetween(start: string, end: string): string[] {
  const valid = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
  if (!valid(start) || !valid(end)) throw new Error('กรุณาระบุวันที่เริ่มต้นและวันที่สิ้นสุดให้ถูกต้อง');
  if (start > end) throw new Error('วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด');
  const result: string[] = [];
  for (let ms = Date.parse(start + 'T00:00:00Z'); ms <= Date.parse(end + 'T00:00:00Z'); ms += 86400000) {
    if (result.length >= 92) throw new Error('กรุณาเลือกช่วงวันที่ไม่เกิน 92 วันต่อครั้ง');
    result.push(new Date(ms).toISOString().slice(0, 10));
  }
  return result;
}
function minutes(v: unknown): number | null {
  const m = text(v).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m || +m[1] > 23 || +m[2] > 59 || +(m[3] || 0) > 59) return null;
  return +m[1] * 60 + +m[2] + +(m[3] || 0) / 60;
}
function etaDelta(t: Truck): number | null {
  if (outcome(t) >= 2) return null;
  const plan = minutes(t.planEta);
  const actual = minutes(t.stampEta || t.actualEta);
  if (plan === null || actual === null || Math.abs(actual - plan) > 720) return null;
  return actual - plan;
}
function performance(rows: Row[]) {
  const measured = rows.map(r => etaDelta(r.truck)).filter((v): v is number => v !== null);
  const ontime = measured.filter(v => v <= 0).length;
  return { measured: measured.length, ontime, late: measured.length - ontime, rate: measured.length ? ontime / measured.length * 100 : null };
}
function problem(t: Truck): string {
  const p = text(t.actionProblem);
  if (!p) return '';
  const reason = p.split(/\s*[:：]\s*/)[0];
  if (/GPS/i.test(reason)) return 'GPS มีปัญหา';
  if (reason.includes('ไม่มีงาน')) return 'ไม่มีงานลง';
  if (reason.includes('ช่อง') && reason.includes('ไม่พร้อม')) return 'ช่องลงงานไม่พร้อม';
  if (reason.includes('งานไม่พร้อม')) return 'งานไม่พร้อม';
  if (reason.includes('ทะเบียน')) return 'ปัญหาทะเบียนรถ';
  return 'อื่น ๆ';
}
function pct(n: number | null): string { return n === null ? 'ไม่มีข้อมูลประเมิน' : `${n.toFixed(1)}%`; }
function csvCell(v: unknown): string {
  const s = text(v); const safe = /^[\s]*[=+@-]/.test(s) ? "'" + s : s;
  return '"' + safe.replace(/"/g, '""') + '"';
}
const button = 'rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50';

export function Report({ selectedDate = '' }: ReportProps) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const initial = /^\d{4}-\d{2}-\d{2}$/.test(selectedDate) ? selectedDate : today;
  const [kind, setKind] = useState<Kind>('VOLUME');
  const [start, setStart] = useState(initial);
  const [end, setEnd] = useState(initial);
  const [result, setResult] = useState<{ kind: Kind; start: string; end: string; days: string[]; rows: Row[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [supplier, setSupplier] = useState('');
  const [details, setDetails] = useState(false);
  const [target, setTarget] = useState('');
  const generation = useRef(0);
  useEffect(() => () => { generation.current += 1; }, []);
  const cancel = () => { generation.current += 1; setBusy(false); setProgress('ยกเลิกการโหลดแล้ว'); };
  const generate = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy) return;
    let days: string[];
    try { days = datesBetween(start, end); } catch (e) { setError(e instanceof Error ? e.message : 'ช่วงวันที่ไม่ถูกต้อง'); return; }
    const token = ++generation.current;
    setBusy(true); setError(''); setProgress('');
    const rows: Row[] = [];
    try {
      for (let i = 0; i < days.length; i++) {
        if (token !== generation.current) return;
        const date = days[i]; setProgress(`กำลังโหลด ${i + 1}/${days.length} วัน · ${date}`);
        const data = await fetchEliveDashboardData(date, false);
        if (token !== generation.current) return;
        if (!data || !Array.isArray(data.trucks)) throw new Error(`ข้อมูลวันที่ ${date} ไม่ถูกต้อง`);
        const plans = await fetchDailyPlans(date);
        if (token !== generation.current) return;
        if (!plans || !Array.isArray(plans.rows)) throw new Error(`แผนวันที่ ${date} ไม่ถูกต้อง`);
        const actualById = new Map(data.trucks.map(t => [upper(t.id), t]));
        const seen = new Set<string>();
        for (const plan of plans.rows) {
          if (upper(plan.project) !== 'INBOUND') continue;
          if (text(plan.date).slice(0, 10) !== date) throw new Error(`แผน INBOUND ไม่ตรงกับวันที่ ${date}`);
          const id = upper(plan.codeRun);
          if (!id || seen.has(id)) throw new Error(`รหัสเที่ยวว่างหรือซ้ำในวันที่ ${date}`);
          seen.add(id);
          const actual = actualById.get(id);
          if (upper(plan.remark) !== 'CANCEL' && !actual) throw new Error(`ไม่พบข้อมูลปฏิบัติงานของเที่ยว ${id} จึงไม่สรุปข้อมูลที่อาจไม่ครบ`);
          const truck = {
            ...actual, id, planDate: date, project: plan.project, route: plan.route,
            supplierName: plan.company, licensePlate: plan.truckName, dropPoint: plan.dropPoint,
            planEta: plan.planEta, planEtd: plan.planEtd, planRemark: plan.remark,
          } as Truck & { planRemark?: string };
          if (!inbound(truck)) continue;
          rows.push({ truck, date });
        }
      }
      setResult({ kind, start, end, days, rows }); setSupplier(''); setDetails(false); setProgress('');
    } catch (e) {
      if (token === generation.current) setError(`${e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ'} · ไม่แสดงยอดจากข้อมูลที่โหลดไม่ครบ กรุณาลองใหม่`);
    } finally { if (token === generation.current) setBusy(false); }
  };
  const suppliers = useMemo(() => Array.from(new Set((result?.rows || []).map(r => text(r.truck.supplierName) || 'ไม่ระบุสังกัด'))).sort(), [result]);
  const rows = useMemo(() => (result?.rows || []).filter(r => !supplier || (text(r.truck.supplierName) || 'ไม่ระบุสังกัด') === supplier), [result, supplier]);
  const perf = useMemo(() => performance(rows), [rows]);
  const daily = useMemo(() => (result?.days || []).map(date => {
    const group = rows.filter(r => r.date === date);
    return { date, rows: group, counts: outcomes.map((_, i) => group.filter(r => outcome(r.truck) === i).length), ...performance(group) };
  }), [rows, result]);
  const supplierData = useMemo(() => Array.from(new Set(rows.map(r => text(r.truck.supplierName) || 'ไม่ระบุสังกัด'))).map(name => {
    const group = rows.filter(r => (text(r.truck.supplierName) || 'ไม่ระบุสังกัด') === name);
    return { name, total: group.length, ...performance(group) };
  }).sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1)), [rows]);
  const problems = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach(r => { const name = problem(r.truck); if (name) map.set(name, (map.get(name) || 0) + 1); });
    return Array.from(map, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [rows]);
  const download = () => {
    if (!result) return;
    const lines: unknown[][] = [ ['รายงาน', reports.find(r => r.id === result.kind)?.title], ['ช่วงวันที่', result.start, result.end], ['โครงการ', 'INBOUND'], ['สังกัด', supplier || 'ทั้งหมด'], [] ];
    if (result.kind === 'VOLUME') lines.push(['วันที่', 'แผนทั้งหมด', ...outcomes], ...daily.map(d => [d.date, d.rows.length, ...d.counts]));
    if (result.kind === 'ONTIME') lines.push(['วันที่', 'เที่ยวที่ประเมินได้', 'ตรงเวลา', 'ล่าช้า', 'ตรงเวลา %'], ...daily.map(d => [d.date, d.measured, d.ontime, d.late, d.rate === null ? '' : d.rate.toFixed(1)]));
    if (result.kind === 'SUPPLIER') lines.push(['สังกัด', 'เที่ยวทั้งหมด', 'เที่ยวที่ประเมินได้', 'ตรงเวลา', 'ล่าช้า', 'ตรงเวลา %'], ...supplierData.map(d => [d.name, d.total, d.measured, d.ontime, d.late, d.rate === null ? '' : d.rate.toFixed(1)]));
    if (result.kind === 'PROBLEM') lines.push(['สาเหตุ', 'จำนวนเที่ยว'], ...problems.map(p => [p.name, p.count]));
    lines.push([], ['รายละเอียด INBOUND'], ['วันที่', 'รหัสเที่ยว', 'Route', 'สังกัด', 'ทะเบียน', 'จุดลงงาน', 'Plan ETA', 'Actual ETA', 'Actual ETD', 'ผลการดำเนินงาน', 'ปัญหา'], ...rows.map(({truck:t, date}) => [date, t.id, t.route, t.supplierName, t.licensePlate, t.dropPoint, t.planEta, t.stampEta || t.actualEta, t.stampEtd, outcomes[outcome(t)], t.actionProblem]));
    const url = URL.createObjectURL(new Blob(['\uFEFF' + lines.map(line => line.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `INBOUND-${result.kind}-${result.start}-${result.end}.csv`; document.body.appendChild(a); a.click(); a.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const maxCount = Math.max(4, Math.ceil(Math.max(0, ...daily.map(d => d.rows.length)) / 4) * 4);
  const width = Math.max(760, daily.length * 48 + 90);
  const step = (width - 90) / Math.max(1, daily.length);
  const x = (i: number) => 60 + step * (i + .5);
  const y = (n: number) => 270 - n * 2.2;
  const targetNumber = target.trim() === '' ? null : Number(target);
  const validTarget = targetNumber !== null && Number.isFinite(targetNumber) && targetNumber >= 0 && targetNumber <= 100;
  const title = reports.find(r => r.id === (result?.kind || kind))!.title;
  return <div className="h-full min-h-0 overflow-auto bg-slate-50 p-4 md:p-6">
    {!result ? <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold text-slate-900">รายงานสำหรับผู้บริหาร</h1><p className="mt-2 text-sm text-slate-500">เลือกรายงานและช่วงวันที่ · เฉพาะโครงการ INBOUND</p>
      <form onSubmit={generate} className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <fieldset disabled={busy}><legend className="mb-3 font-bold text-slate-800">เลือกรายงาน</legend><div className="divide-y divide-slate-100">{reports.map((r,i) => <label key={r.id} className={`flex cursor-pointer items-start gap-3 rounded-lg p-4 ${kind === r.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`}><input type="radio" name="report" value={r.id} checked={kind === r.id} onChange={() => setKind(r.id)} className="mt-1"/><span><span className="block text-sm font-bold text-slate-900">{i+1}. {r.title}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{r.description}</span></span></label>)}</div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold">วันที่เริ่มต้น<input type="date" required value={start} onChange={e => setStart(e.target.value)} className="mt-2 block w-full rounded-lg border p-3"/></label><label className="text-sm font-bold">วันที่สิ้นสุด<input type="date" required min={start} value={end} onChange={e => setEnd(e.target.value)} className="mt-2 block w-full rounded-lg border p-3"/></label></div></fieldset>
        <p className="mt-3 text-xs text-slate-500">รวมวันเริ่มต้นและวันสิ้นสุด · เลือกได้สูงสุด 92 วันต่อครั้ง</p>
        <div role="status" aria-live="polite" className="mt-4 text-sm text-blue-700">{progress}</div>{error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">{busy && <button type="button" onClick={cancel} className={button}>ยกเลิก</button>}<button type="submit" disabled={busy} className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? 'กำลังสร้างรายงาน...' : 'แสดงรายงาน'}</button></div>
      </form></div> : <div className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><button type="button" className="mb-3 text-sm font-bold text-blue-700" onClick={() => setResult(null)}>← กลับไปเลือกรายงาน</button><h1 className="text-xl font-bold text-slate-900">{title}</h1><p className="mt-2 text-sm text-slate-500">{result.start} ถึง {result.end} · เฉพาะโครงการ INBOUND · โหลดครบ {result.days.length} วัน</p></div><div className="flex flex-wrap gap-2"><label className="text-xs text-slate-500">สังกัด<select aria-label="สังกัด" value={supplier} onChange={e => setSupplier(e.target.value)} className="mt-1 block max-w-full rounded-lg border bg-white p-2 text-sm text-slate-800"><option value="">ทุกสังกัด</option>{suppliers.map(s => <option key={s}>{s}</option>)}</select></label><button type="button" onClick={download} className={button}>ส่งออก CSV</button></div></div>
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">{(result.kind === 'VOLUME' ? [['แผนทั้งหมด', rows.length], ['ทำงานสำเร็จ', rows.filter(r => outcome(r.truck) === 0).length], ['งานคงค้าง', rows.filter(r => outcome(r.truck) === 1).length], ['ไม่มีงานลง / ยกเลิก', `${rows.filter(r => outcome(r.truck) === 2).length} / ${rows.filter(r => outcome(r.truck) === 3).length}`]] : result.kind === 'PROBLEM' ? [['เที่ยวทั้งหมด', rows.length], ['เที่ยวที่มีปัญหา', rows.filter(r => problem(r.truck)).length], ['สาเหตุที่พบ', problems.length], ['ปัญหาที่ยังไม่เสร็จสิ้น', rows.filter(r => problem(r.truck) && upper(r.truck.actionStatus) !== 'CLOSED').length]] : [['เที่ยวทั้งหมด', rows.length], ['ประเมินเวลาได้', perf.measured], ['ถึงตรงเวลา', pct(perf.rate)], ['ถึงล่าช้า', perf.late]]).map(([label,n]) => <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-slate-900">{n}</p></div>)}</div>
      <section className="mt-5 rounded-xl border border-slate-200 bg-white p-4 md:p-6"><h2 className="font-bold text-slate-800">{title}</h2>
        {!rows.length ? <p className="py-20 text-center text-slate-500">ไม่พบเที่ยว INBOUND ในช่วงวันที่และสังกัดที่เลือก</p> : <>
        {result.kind === 'VOLUME' && <><div className="my-4 flex flex-wrap gap-4 text-xs">{outcomes.map((s,i) => <span key={s} className="flex items-center gap-2"><span className="h-3 w-3 rounded" style={{background:colors[i]}}/>{s}</span>)}</div><div className="overflow-x-auto"><svg role="img" aria-label="กราฟแท่งซ้อนแสดงจำนวนเที่ยวตามวัน" viewBox={`0 0 ${width} 330`} style={{minWidth:width}} className="w-full"><text x="12" y="20" fontSize="12">จำนวนเที่ยว</text>{[0,.25,.5,.75,1].map(f => <g key={f}><line x1="50" x2={width-20} y1={270-f*220} y2={270-f*220} stroke="#e2e8f0"/><text x="42" y={274-f*220} textAnchor="end" fontSize="11">{Math.round(maxCount*f)}</text></g>)}{daily.map((d,i) => { let base=270; return <g key={d.date}>{d.counts.map((n,j) => {const h=n/maxCount*220; base-=h; return <rect key={j} x={x(i)-step*.28} y={base} width={step*.56} height={h} fill={colors[j]}><title>{`${d.date} · ${outcomes[j]}: ${n} เที่ยว`}</title></rect>;})}<text x={x(i)} y={260-d.rows.length/maxCount*220} textAnchor="middle" fontSize="11">{d.rows.length}</text><text x={x(i)} y="298" textAnchor="middle" fontSize="11">{d.date.slice(5)}</text></g>;})}</svg></div><p className="mt-3 text-xs text-slate-500">ยอดรวมของแต่ละแท่ง = แผน INBOUND ทั้งหมดของวันนั้น แต่ละเที่ยวอยู่ในกลุ่มเดียวเท่านั้น</p></>}
        {result.kind === 'ONTIME' && <><label className="mt-4 block text-xs text-slate-600">เป้าหมายที่ต้องการเปรียบเทียบ (%) ไม่บังคับ<input type="number" min="0" max="100" step="0.1" value={target} onChange={e => setTarget(e.target.value)} className="ml-2 w-24 rounded border p-2"/></label>{target && !validTarget && <p role="alert" className="text-xs text-red-700">ระบุเป้าหมายระหว่าง 0 ถึง 100</p>}<div className="mt-5 overflow-x-auto"><svg role="img" aria-label="แนวโน้มอัตราถึงตรงเวลารายวัน" viewBox={`0 0 ${width} 340`} style={{minWidth:width}} className="w-full">{[0,25,50,75,100].map(n => <g key={n}><line x1="50" x2={width-20} y1={y(n)} y2={y(n)} stroke="#e2e8f0"/><text x="42" y={y(n)+4} textAnchor="end" fontSize="11">{n}%</text></g>)}{validTarget && <g><line x1="50" x2={width-20} y1={y(targetNumber!)} y2={y(targetNumber!)} stroke="#f97316" strokeDasharray="6 4"/><text x="55" y={y(targetNumber!)-8} fontSize="11" fill="#c2410c">เป้าหมาย {targetNumber}%</text></g>}{daily.map((d,i) => <g key={d.date}>{d.rate !== null && i>0 && daily[i-1].rate !== null && <line x1={x(i-1)} x2={x(i)} y1={y(daily[i-1].rate!)} y2={y(d.rate)} stroke="#2563eb" strokeWidth="3"/>}{d.rate !== null ? <circle cx={x(i)} cy={y(d.rate)} r="5" fill="#2563eb"><title>{`${d.date}: ${pct(d.rate)} · ${d.ontime}/${d.measured} เที่ยว`}</title></circle> : <text x={x(i)} y="260" textAnchor="middle" fontSize="10" fill="#64748b">ไม่มีข้อมูล</text>}<text x={x(i)} y="298" textAnchor="middle" fontSize="11">{d.date.slice(5)}</text><text x={x(i)} y="317" textAnchor="middle" fontSize="10" fill="#64748b">n={d.measured}</text></g>)}</svg></div></>}
        {result.kind === 'SUPPLIER' && <div className="mt-6 space-y-5">{supplierData.map(d => <div key={d.name}><div className="mb-2 flex flex-wrap justify-between gap-2 text-sm"><strong>{d.name}</strong><span>{pct(d.rate)} · ตรงเวลา {d.ontime}/{d.measured} · ทั้งหมด {d.total} เที่ยว</span></div><div className="h-6 overflow-hidden rounded bg-slate-100"><div className="h-full rounded bg-blue-600" style={{width:`${d.rate ?? 0}%`}}/></div></div>)}</div>}
        {result.kind === 'PROBLEM' && <div className="mt-6 space-y-5">{problems.map(d => <div key={d.name}><div className="mb-2 flex justify-between gap-2 text-sm"><strong>{d.name}</strong><span>{d.count} เที่ยว</span></div><div className="h-7 overflow-hidden rounded bg-slate-100"><div className="h-full rounded bg-orange-500" style={{width:`${d.count/Math.max(1,...problems.map(p => p.count))*100}%`}}/></div></div>)}{!problems.length && <p className="py-16 text-center text-slate-500">ไม่พบรายการปัญหา</p>}<p className="mt-5 text-xs text-slate-500">นับ 1 สาเหตุหลักต่อเที่ยวจากข้อความเหตุผลก่อนเครื่องหมาย : รวมทั้งรายการที่ปิดแล้ว และแยกไม่มีงานลงออกมาต่างหาก</p></div>}
        </>}
      </section>
      {(result.kind === 'ONTIME' || result.kind === 'SUPPLIER') && <p className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-4 text-xs leading-6 text-blue-900">ตรงเวลา = Actual ETA ไม่เกิน Plan ETA โดยรวมเที่ยวที่มาถึงก่อนเวลา ตัวหารใช้เฉพาะเที่ยวที่มีเวลาครบและประเมินได้ ไม่รวมไม่มีงานลงและยกเลิก เที่ยวเสร็จแล้วแต่ถึงล่าช้ายังคงนับล่าช้า ไม่ประเมินเวลาที่ต่างกันเกิน 12 ชั่วโมงเพราะไม่มีวันที่ Actual ยืนยันการข้ามวัน ไม่เดาวันให้เอง</p>}
      <details className="mt-4 rounded-lg border bg-white p-4"><summary className="cursor-pointer text-sm font-bold">ดูข้อมูลสรุปเป็นตาราง</summary><div className="mt-4 overflow-auto"><table className="w-full text-left text-sm"><thead><tr>{(result.kind === 'VOLUME' ? ['วันที่','แผนทั้งหมด',...outcomes] : result.kind === 'PROBLEM' ? ['สาเหตุ','จำนวนเที่ยว'] : [result.kind === 'SUPPLIER' ? 'สังกัด' : 'วันที่','ประเมินได้','ตรงเวลา','ล่าช้า','ตรงเวลา %']).map(h => <th key={h} className="whitespace-nowrap border-b p-3">{h}</th>)}</tr></thead><tbody>{(result.kind === 'VOLUME' ? daily.map(d => [d.date,d.rows.length,...d.counts]) : result.kind === 'PROBLEM' ? problems.map(d => [d.name,d.count]) : result.kind === 'SUPPLIER' ? supplierData.map(d => [d.name,d.measured,d.ontime,d.late,pct(d.rate)]) : daily.map(d => [d.date,d.measured,d.ontime,d.late,pct(d.rate)])).map((line,i) => <tr key={i}>{line.map((v,j) => <td key={j} className="whitespace-nowrap border-b p-3">{v}</td>)}</tr>)}</tbody></table></div></details>
      <button type="button" className={`${button} mt-4`} onClick={() => setDetails(v => !v)} aria-expanded={details}>{details ? 'ซ่อน' : 'ดู'}รายละเอียดเที่ยวรถ ({rows.length})</button>
      {details && <div className="mt-3 max-h-96 overflow-auto rounded-xl border bg-white"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-100"><tr>{['วันที่','Route','สังกัด','ทะเบียน','จุดลงงาน','Plan ETA','Actual ETA','ผลการดำเนินงาน','ปัญหา'].map(h => <th key={h} className="whitespace-nowrap p-3">{h}</th>)}</tr></thead><tbody>{rows.map(({truck:t,date}) => <tr key={`${date}:${t.id}`}>{[date,t.route,t.supplierName,t.licensePlate,t.dropPoint,t.planEta,t.stampEta || t.actualEta,outcomes[outcome(t)],t.actionProblem].map((v,i) => <td key={i} className="border-t p-3">{text(v) || '-'}</td>)}</tr>)}</tbody></table></div>}
    </div>}
  </div>;
}
export default Report;
