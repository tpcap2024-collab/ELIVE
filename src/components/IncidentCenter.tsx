import React, { useEffect, useMemo, useState } from 'react';
import { Truck } from '../types';
import { AlertTriangle, CheckCircle2, RotateCcw, Search, Send, ShieldCheck, X } from 'lucide-react';

interface IncidentCenterProps {
  trucks: Truck[];
  onUpdateTruck: (id: string, updates: Partial<Truck>) => void | Promise<void>;
}

type ActionStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
type ResponsibleRole = '' | 'DISPATCHER' | 'CONTROLLER' | 'CHIEF';
type StatusFilter = 'ACTIVE' | 'ALL' | ActionStatus;

const statusLabel: Record<ActionStatus, string> = {
  OPEN: 'รอรับผิดชอบ',
  IN_PROGRESS: 'กำลังดำเนินการ',
  RESOLVED: 'รอยืนยัน',
  CLOSED: 'ปิดแล้ว',
};
const statusStyle: Record<ActionStatus, string> = {
  OPEN: 'border-red-200 bg-red-100 text-red-800',
  IN_PROGRESS: 'border-amber-200 bg-amber-100 text-amber-800',
  RESOLVED: 'border-blue-200 bg-blue-100 text-blue-800',
  CLOSED: 'border-emerald-200 bg-emerald-100 text-emerald-800',
};
const statusOrder: Record<ActionStatus, number> = { OPEN: 0, IN_PROGRESS: 1, RESOLVED: 2, CLOSED: 3 };
const roleLabel: Record<Exclude<ResponsibleRole, ''>, string> = {
  DISPATCHER: 'Dispatcher', CONTROLLER: 'Controller', CHIEF: 'Chief',
};
const quickActions = ['ติดต่อคนขับแล้ว', 'ตรวจสอบ GPS แล้ว', 'ประสาน Transport แล้ว', 'แจ้ง Supplier แล้ว', 'เปลี่ยนทะเบียนแล้ว', 'ปรับแผนแล้ว', 'รอตรวจสอบผล'];

function getStatus(value?: string): ActionStatus {
  const valueText = String(value || '').trim().toUpperCase();
  return valueText === 'IN_PROGRESS' || valueText === 'RESOLVED' || valueText === 'CLOSED' ? valueText : 'OPEN';
}
function parseResponsible(value?: string): { role: ResponsibleRole; name: string } {
  const text = String(value || '').trim();
  if (!text) return { role: '', name: '' };
  const [roleText, ...nameParts] = text.split('|');
  const role = roleText.trim().toUpperCase();
  if (role === 'DISPATCHER' || role === 'CONTROLLER' || role === 'CHIEF') return { role, name: nameParts.join('|').trim() };
  return { role: '', name: text };
}
function responsibleText(value?: string): string {
  const responsible = parseResponsible(value);
  return responsible.role && responsible.name ? `${roleLabel[responsible.role]} • ${responsible.name}` : 'ยังไม่มีผู้รับผิดชอบ';
}
function bangkokTime(): string {
  return new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
}

export function IncidentCenter({ trucks, onUpdateTruck }: IncidentCenterProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ACTIVE');
  const [roleFilter, setRoleFilter] = useState<ResponsibleRole>('');
  const [role, setRole] = useState<ResponsibleRole>('');
  const [name, setName] = useState('');
  const [countermeasure, setCountermeasure] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const incidents = useMemo(() => trucks.filter(truck => String(truck.actionProblem || '').trim()), [trucks]);
  const selected = useMemo(() => incidents.find(truck => truck.id === selectedId) || null, [incidents, selectedId]);
  const currentStatus = selected ? getStatus(selected.actionStatus) : 'OPEN';

  useEffect(() => {
    if (!selected) return;
    const responsible = parseResponsible(selected.actionResponsible);
    setRole(responsible.role);
    setName(responsible.name);
    setCountermeasure(String(selected.actionCountermeasure || ''));
    setError('');
  }, [selected?.id, selected?.actionResponsible, selected?.actionCountermeasure]);

  const counts = useMemo(() => incidents.reduce((result, truck) => {
    result[getStatus(truck.actionStatus)] += 1;
    return result;
  }, { OPEN: 0, IN_PROGRESS: 0, RESOLVED: 0, CLOSED: 0 } as Record<ActionStatus, number>), [incidents]);

  const visibleIncidents = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('th');
    return incidents.filter(truck => {
      const truckStatus = getStatus(truck.actionStatus);
      const responsible = parseResponsible(truck.actionResponsible);
      if (statusFilter === 'ACTIVE' && truckStatus === 'CLOSED') return false;
      if (statusFilter !== 'ACTIVE' && statusFilter !== 'ALL' && truckStatus !== statusFilter) return false;
      if (roleFilter && responsible.role !== roleFilter) return false;
      if (!query) return true;
      return [truck.id, truck.route, truck.licensePlate, truck.dropPoint, truck.actionProblem, truck.actionResponsible]
        .some(value => String(value || '').toLocaleLowerCase('th').includes(query));
    }).sort((a, b) => statusOrder[getStatus(a.actionStatus)] - statusOrder[getStatus(b.actionStatus)] || String(a.planEta || '').localeCompare(String(b.planEta || '')));
  }, [incidents, roleFilter, search, statusFilter]);

  const save = async (updates: Partial<Truck>) => {
    if (!selected || isSaving) return;
    setIsSaving(true); setError('');
    try { await onUpdateTruck(selected.id, updates); }
    catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'บันทึกข้อมูลไม่สำเร็จ'); }
    finally { setIsSaving(false); }
  };
  const acceptIncident = async () => {
    if (!role) return setError('กรุณาเลือกตำแหน่งผู้รับผิดชอบ');
    if (!name.trim()) return setError('กรุณาระบุชื่อผู้รับผิดชอบ');
    await save({ actionResponsible: `${role}|${name.trim()}`, actionStatus: 'IN_PROGRESS' });
  };
  const submitCountermeasure = async () => {
    if (!role || !name.trim()) return setError('กรุณาระบุตำแหน่งและชื่อผู้รับผิดชอบ');
    if (!countermeasure.trim()) return setError('กรุณาระบุการดำเนินการหรือวิธีแก้ไข');
    await save({ actionResponsible: `${role}|${name.trim()}`, actionCountermeasure: countermeasure.trim(), actionStatus: 'RESOLVED' });
  };
  const appendQuickAction = (text: string) => setCountermeasure(current => {
    const entry = `${bangkokTime()} | ${text}`;
    return current.trim() ? `${current.trim()}\n${entry}` : entry;
  });

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-slate-50">
      <header className="shrink-0 border-b border-slate-200 bg-white px-5 py-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-black text-slate-900"><AlertTriangle className="h-6 w-6 text-red-500" />ศูนย์ติดตามปัญหา</h2>
            <p className="mt-1 text-sm text-slate-500">รวบรวม มอบหมาย ติดตาม และยืนยันการแก้ไขปัญหาประจำวัน</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 xl:ml-auto">
            {[
              ['ทั้งหมด', incidents.length, 'border-slate-200 bg-slate-50 text-slate-800'],
              ['รอรับผิดชอบ', counts.OPEN, 'border-red-200 bg-red-50 text-red-800'],
              ['กำลังดำเนินการ', counts.IN_PROGRESS, 'border-amber-200 bg-amber-50 text-amber-800'],
              ['รอยืนยัน', counts.RESOLVED, 'border-blue-200 bg-blue-50 text-blue-800'],
              ['ปิดแล้ว', counts.CLOSED, 'border-emerald-200 bg-emerald-50 text-emerald-800'],
            ].map(([label, value, style]) => <div key={String(label)} className={`min-w-[105px] rounded-xl border px-3 py-2 ${style}`}><p className="text-[10px] font-bold">{label}</p><p className="text-xl font-black">{value}</p></div>)}
          </div>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-[1fr_190px_160px]">
          <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="ค้นหา Code Run, Route, ทะเบียนรถ, จุดลงงาน หรือปัญหา..." className="h-11 w-full rounded-xl border border-slate-300 pl-10 pr-3 text-base" /></div>
          <select value={statusFilter} onChange={event => setStatusFilter(event.target.value as StatusFilter)} className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-base font-bold"><option value="ACTIVE">ปัญหาที่ยังไม่ปิด</option><option value="ALL">ทุกสถานะ</option><option value="OPEN">รอรับผิดชอบ</option><option value="IN_PROGRESS">กำลังดำเนินการ</option><option value="RESOLVED">รอยืนยัน</option><option value="CLOSED">ปิดแล้ว</option></select>
          <select value={roleFilter} onChange={event => setRoleFilter(event.target.value as ResponsibleRole)} className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-base font-bold"><option value="">ทุกระดับ</option><option value="DISPATCHER">Dispatcher</option><option value="CONTROLLER">Controller</option><option value="CHIEF">Chief</option></select>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <section className="block w-full min-w-0 overflow-auto bg-white">
          <table className="w-full min-w-[1100px] table-fixed text-left text-sm">
            <thead className="sticky top-0 z-20 bg-slate-100 text-xs font-black uppercase text-slate-700"><tr><th className="w-[85px] px-3 py-2.5">Code Run</th><th className="w-[90px] px-3 py-2.5">Route</th><th className="w-[120px] px-3 py-2.5">ทะเบียนรถ</th><th className="w-[90px] px-3 py-2.5">จุดลงงาน</th><th className="px-3 py-2.5">ปัญหา</th><th className="w-[200px] px-3 py-2.5">ผู้รับผิดชอบ</th><th className="w-[125px] px-3 py-2.5">สถานะ</th><th className="w-[75px] px-2 py-2.5">จัดการ</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {visibleIncidents.map(truck => { const truckStatus = getStatus(truck.actionStatus); return <tr key={truck.id} className="h-14 hover:bg-blue-50/40"><td className="truncate px-3 font-mono font-bold text-blue-700">{truck.id}</td><td className="truncate px-3 font-bold">{truck.route || '-'}</td><td className="truncate px-3 font-semibold">{truck.licensePlate || '-'}</td><td className="truncate px-3">{truck.dropPoint || '-'}</td><td className="truncate px-3 font-semibold text-red-700" title={truck.actionProblem}>{truck.actionProblem}</td><td className="truncate px-3 font-semibold" title={responsibleText(truck.actionResponsible)}>{responsibleText(truck.actionResponsible)}</td><td className="px-3"><span className={`rounded-full border px-2 py-1 text-xs font-black ${statusStyle[truckStatus]}`}>{statusLabel[truckStatus]}</span></td><td className="px-2"><button onClick={() => setSelectedId(truck.id)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white">เปิด</button></td></tr>; })}
            </tbody>
          </table>
          {!visibleIncidents.length && <div className="py-16 text-center"><CheckCircle2 className="mx-auto h-12 w-12 text-slate-300" /><p className="mt-3 font-bold text-slate-700">ไม่พบรายการปัญหา</p></div>}
        </section>

        {selected && <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/60 p-4">
          <aside className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
          <div className="flex min-h-16 items-center justify-between border-b border-slate-200 px-5"><div className="flex items-center gap-3"><span className={`rounded-full border px-3 py-1.5 text-sm font-black ${statusStyle[currentStatus]}`}>{statusLabel[currentStatus]}</span><span className="font-mono text-lg font-black text-blue-700">{selected.id}</span></div><button onClick={() => setSelectedId(null)} className="rounded-full p-2.5 hover:bg-slate-100"><X className="h-6 w-6" /></button></div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6"><div className="mx-auto max-w-4xl space-y-5">
            <div className="grid gap-3 sm:grid-cols-4">{[['Route', selected.route], ['ทะเบียนรถ', selected.licensePlate], ['จุดลงงาน', selected.dropPoint], ['Plan ETA / ETD', `${selected.planEta || '-'} / ${selected.planEtd || '-'}`]].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-1 text-lg font-black text-slate-900">{value || '-'}</p></div>)}</div>
            <section><h3 className="mb-2 text-lg font-black">ปัญหา</h3><div className="rounded-xl border border-red-200 bg-red-50 p-4 text-base font-semibold leading-7 text-red-800">{selected.actionProblem}</div></section>
            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><h3 className="text-lg font-black">ผู้รับผิดชอบ</h3><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm font-bold text-slate-700">ตำแหน่ง<select value={role} onChange={event => { setRole(event.target.value as ResponsibleRole); setName(''); setError(''); }} disabled={currentStatus === 'CLOSED' || isSaving} className="mt-1.5 h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base font-bold"><option value="">เลือกตำแหน่ง</option><option value="DISPATCHER">Dispatcher</option><option value="CONTROLLER">Controller</option><option value="CHIEF">Chief</option></select></label><label className="text-sm font-bold text-slate-700">ชื่อผู้รับผิดชอบ<input value={name} onChange={event => { setName(event.target.value); setError(''); }} disabled={!role || currentStatus === 'CLOSED' || isSaving} placeholder={role ? 'กรอกชื่อผู้รับผิดชอบ' : 'เลือกตำแหน่งก่อน'} className="mt-1.5 h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base font-semibold" /></label></div>{currentStatus === 'OPEN' && <button onClick={() => void acceptIncident()} disabled={isSaving} className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-amber-500 px-5 text-sm font-bold text-white"><ShieldCheck className="h-4 w-4" />รับเรื่อง</button>}</section>
            <section className="rounded-2xl border border-slate-200 p-4"><h3 className="text-lg font-black">การดำเนินการ / วิธีแก้ไข</h3><p className="mt-1 text-xs text-slate-500">ระบุสิ่งที่ดำเนินการแล้ว ผลการตรวจสอบ และขั้นตอนถัดไป</p>{currentStatus !== 'OPEN' && currentStatus !== 'CLOSED' && <div className="mt-3 flex flex-wrap gap-2">{quickActions.map(action => <button key={action} onClick={() => appendQuickAction(action)} className="rounded-full border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold">{action}</button>)}</div>}<textarea value={countermeasure} onChange={event => { setCountermeasure(event.target.value); setError(''); }} disabled={currentStatus === 'OPEN' || currentStatus === 'CLOSED' || isSaving} placeholder={currentStatus === 'OPEN' ? 'รับเรื่องและระบุผู้รับผิดชอบก่อน' : 'ระบุการดำเนินการหรือวิธีแก้ไข...'} className="mt-3 min-h-[170px] w-full rounded-xl border border-slate-300 p-4 text-base leading-7 disabled:bg-slate-100" /></section>
            {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</div>}
            <div className="flex flex-wrap justify-end gap-2 border-t pt-4">{currentStatus === 'IN_PROGRESS' && <button onClick={() => void submitCountermeasure()} disabled={isSaving} className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white"><Send className="h-4 w-4" />บันทึกวิธีแก้ไขและส่งตรวจสอบ</button>}{currentStatus === 'RESOLVED' && <><button onClick={() => void save({ actionStatus: 'IN_PROGRESS' })} disabled={isSaving} className="inline-flex h-11 items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-5 text-sm font-bold text-amber-800"><RotateCcw className="h-4 w-4" />ส่งกลับไปแก้ไข</button><button onClick={() => void save({ actionStatus: 'CLOSED' })} disabled={isSaving} className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-bold text-white"><CheckCircle2 className="h-4 w-4" />ยืนยันแก้ไขเรียบร้อย</button></>}{currentStatus === 'CLOSED' && <button onClick={() => void save({ actionStatus: 'IN_PROGRESS' })} disabled={isSaving} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-300 px-5 text-sm font-bold"><RotateCcw className="h-4 w-4" />เปิดปัญหาอีกครั้ง</button>}</div>
          </div></div>
        </aside></div>}
      </div>
    </div>
  );
}

export default IncidentCenter;
