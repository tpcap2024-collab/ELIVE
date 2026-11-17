import { useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { AlertTriangle, Download, Edit3, FileSpreadsheet, Loader2, MapPin, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import * as XLSX from 'xlsx';

export type SupplierLocation = {
  supplierCode: string;
  supplierName: string;
  siteId: string;
  latitude: number;
  longitude: number;
  radiusMeter: number;
  status: 'ACTIVE' | 'INACTIVE';
  remark: string;
};

type Props = {
  role: 'TV_VIEWER' | 'OPERATOR' | 'PLANNER' | 'SUPERVISOR' | 'ADMIN';
  rows?: SupplierLocation[];
  loading?: boolean;
  onRefresh?: () => void | Promise<void>;
  onCreate?: (row: SupplierLocation) => void | Promise<void>;
  onUpdate?: (originalSupplierCode: string, originalSiteId: string, row: SupplierLocation) => void | Promise<void>;
  onDelete?: (row: SupplierLocation) => void | Promise<void>;
  onImport?: (rows: SupplierLocation[], mode: 'append' | 'replace') => void | Promise<void>;
  onViewMap?: (row: SupplierLocation) => void;
};

const EMPTY: SupplierLocation = { supplierCode: '', supplierName: '', siteId: '', latitude: 13.624391, longitude: 101.015323, radiusMeter: 500, status: 'ACTIVE', remark: '' };
const HEADERS = ['Supplier Code','Supplier Name','Site ID','Latitude','Longitude','Radius Meter','Status','Remark'];
const aliases: Record<keyof SupplierLocation, string[]> = {
  supplierCode: ['suppliercode','code'], supplierName: ['suppliername','name'], siteId: ['siteid','site'],
  latitude: ['latitude','lat'], longitude: ['longitude','lng','lon'], radiusMeter: ['radiusmeter','radius'],
  status: ['status'], remark: ['remark','note'],
};
function clean(v: unknown){ return String(v ?? '').trim(); }
function header(v: unknown){ return clean(v).toLowerCase().replace(/[\s_\-./()]+/g,''); }
function parseRows(raw: unknown[][]): SupplierLocation[] {
  if(raw.length < 2) throw new Error('ไฟล์ต้องมีหัวตารางและข้อมูล');
  const h=raw[0].map(header); const ix=Object.fromEntries(Object.entries(aliases).map(([k,a])=>[k,h.findIndex(x=>a.includes(x))])) as Record<keyof SupplierLocation,number>;
  const required=(Object.keys(aliases) as (keyof SupplierLocation)[]).filter(k=>k!=='remark');
  const missing=required.filter(k=>ix[k]<0); if(missing.length) throw new Error(`ไม่พบคอลัมน์: ${missing.join(', ')}`);
  const seen=new Set<string>(); const rows: SupplierLocation[]=[];
  raw.slice(1).forEach((r,i)=>{ if(r.every(v=>clean(v)==='')) return;
    const row: SupplierLocation={ supplierCode:clean(r[ix.supplierCode]).toUpperCase(), supplierName:clean(r[ix.supplierName]), siteId:clean(r[ix.siteId]).toUpperCase(), latitude:Number(r[ix.latitude]), longitude:Number(r[ix.longitude]), radiusMeter:Number(r[ix.radiusMeter]), status:clean(r[ix.status]).toUpperCase()==='INACTIVE'?'INACTIVE':'ACTIVE', remark:ix.remark>=0?clean(r[ix.remark]):'' };
    const errors:string[]=[]; if(!row.supplierCode)errors.push('Supplier Code'); if(!row.supplierName)errors.push('Supplier Name'); if(!row.siteId)errors.push('Site ID'); if(!Number.isFinite(row.latitude)||row.latitude < -90||row.latitude > 90)errors.push('Latitude'); if(!Number.isFinite(row.longitude)||row.longitude < -180||row.longitude > 180)errors.push('Longitude'); if(!Number.isFinite(row.radiusMeter)||row.radiusMeter<100||row.radiusMeter>2000)errors.push('Radius Meter');
    const key=`${row.supplierCode}|${row.siteId}`; if(seen.has(key))errors.push('รายการซ้ำ'); seen.add(key); if(errors.length) throw new Error(`แถว ${i+2}: ${errors.join(', ')}`); rows.push(row);
  }); if(!rows.length) throw new Error('ไม่พบข้อมูล Supplier'); return rows;
}
function workbook(rows: SupplierLocation[]){ const wb=XLSX.utils.book_new(); const body=rows.map(r=>[r.supplierCode,r.supplierName,r.siteId,r.latitude,r.longitude,r.radiusMeter,r.status,r.remark]); const ws=XLSX.utils.aoa_to_sheet([HEADERS,...body]); ws['!cols']=[{wch:16},{wch:48},{wch:16},{wch:15},{wch:15},{wch:16},{wch:12},{wch:36}]; ws['!freeze']={xSplit:0,ySplit:1}; ws['!autofilter']={ref:`A1:H${body.length+1}`}; XLSX.utils.book_append_sheet(wb,ws,'Supplier Upload'); return wb; }

export default function SupplierManagement({role,rows=[],loading=false,onRefresh,onCreate,onUpdate,onDelete,onImport,onViewMap}:Props){
  const canManage=role==='PLANNER'||role==='ADMIN'; const inputRef=useRef<HTMLInputElement>(null);
  const [query,setQuery]=useState(''); const [status,setStatus]=useState<'ALL'|'ACTIVE'|'INACTIVE'>('ALL'); const [dialog,setDialog]=useState<'create'|'edit'|null>(null); const [form,setForm]=useState<SupplierLocation>(EMPTY); const [originalSupplierCode,setOriginalSupplierCode]=useState(''); const [originalSiteId,setOriginalSiteId]=useState(''); const [busy,setBusy]=useState(false); const [message,setMessage]=useState(''); const [preview,setPreview]=useState<SupplierLocation[]>([]); const [importMode,setImportMode]=useState<'append'|'replace'>('append'); const [showImport,setShowImport]=useState(false);
  const filtered=useMemo(()=>rows.filter(r=>(status==='ALL'||r.status===status)&&(!query||[r.supplierCode,r.supplierName,r.siteId,r.remark].join(' ').toLowerCase().includes(query.toLowerCase()))),[rows,query,status]);
  const save=async(e:FormEvent)=>{e.preventDefault();if(!canManage||busy)return;setBusy(true);setMessage('');try{if(dialog==='create')await onCreate?.(form);else await onUpdate?.(originalSupplierCode,originalSiteId,form);setDialog(null);setMessage('บันทึก Supplier สำเร็จ');}catch(err){setMessage(err instanceof Error?err.message:String(err));}finally{setBusy(false);}};
  const read=async(e:ChangeEvent<HTMLInputElement>)=>{const file=e.target.files?.[0];if(!file)return;setBusy(true);setMessage('');try{const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});const ws=wb.Sheets[wb.SheetNames[0]];setPreview(parseRows(XLSX.utils.sheet_to_json<unknown[]>(ws,{header:1,raw:true,defval:'',blankrows:false})));setShowImport(true);}catch(err){setMessage(err instanceof Error?err.message:String(err));}finally{setBusy(false);e.target.value='';}};
  const confirmImport=async()=>{if(!canManage||!preview.length)return;setBusy(true);try{await onImport?.(preview,importMode);setShowImport(false);setPreview([]);setMessage(`นำเข้า Supplier สำเร็จ ${preview.length} รายการ`);}catch(err){setMessage(err instanceof Error?err.message:String(err));}finally{setBusy(false);}};
  return <div className="min-h-full bg-slate-50 p-3">
    <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={read}/>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 xl:flex-row xl:items-center">
        <div><h1 className="text-xl font-black text-slate-900">Supplier Locations</h1><p className="text-sm text-slate-500">จัดการพิกัด Supplier สำหรับ Live Map</p></div>
        <div className="grid grid-cols-3 gap-2 xl:ml-auto"><div className="rounded-lg border bg-slate-50 px-3 py-2"><p className="text-[9px] font-bold text-slate-500">ทั้งหมด</p><b>{rows.length}</b></div><div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800"><p className="text-[9px] font-bold">ACTIVE</p><b>{rows.filter(r=>r.status==='ACTIVE').length}</b></div><div className="rounded-lg border border-slate-300 bg-slate-100 px-3 py-2"><p className="text-[9px] font-bold">INACTIVE</p><b>{rows.filter(r=>r.status==='INACTIVE').length}</b></div></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={()=>XLSX.writeFile(workbook([]),'ELIVE_Supplier_Locations_Template.xlsx')} className="inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-bold"><FileSpreadsheet className="h-4 w-4"/>Template</button>
          <button type="button" onClick={()=>XLSX.writeFile(workbook(rows),'ELIVE_Supplier_Locations.xlsx')} className="inline-flex h-10 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-sm font-bold text-emerald-700"><Download className="h-4 w-4"/>Download</button>
          {canManage&&<><button type="button" onClick={()=>inputRef.current?.click()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white"><Upload className="h-4 w-4"/>Upload</button><button type="button" onClick={()=>{setForm(EMPTY);setDialog('create');}} className="inline-flex h-10 items-center gap-2 rounded-xl bg-amber-600 px-4 text-sm font-bold text-white"><Plus className="h-4 w-4"/>เพิ่ม Supplier</button></>}
          <button type="button" onClick={()=>void onRefresh?.()} disabled={loading} className="h-10 rounded-xl border px-4 text-sm font-bold">{loading?'กำลังโหลด...':'รีเฟรช'}</button>
        </div>
      </div>
      {message&&<div className="m-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-800">{message}</div>}
      <div className="grid gap-3 p-3 sm:grid-cols-[1fr_180px]"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ค้นหา Code, Supplier, Site หรือ Remark..." className="h-10 w-full rounded-xl border pl-9 pr-3 text-sm"/></div><select value={status} onChange={e=>setStatus(e.target.value as typeof status)} className="h-10 rounded-xl border bg-white px-3 text-sm"><option value="ALL">ทุกสถานะ</option><option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option></select></div>
      <div className="max-h-[calc(100vh-260px)] overflow-auto border-t"><table className="w-full min-w-[1180px] text-xs"><thead className="sticky top-0 bg-slate-100 text-left text-[10px] uppercase text-slate-600"><tr>{['Code','Supplier Name','Site ID','Latitude','Longitude','Radius','Status','Remark','Action'].map(h=><th key={h} className="px-3 py-3">{h}</th>)}</tr></thead><tbody className="divide-y">{filtered.map(r=><tr key={`${r.supplierCode}-${r.siteId}`} className="hover:bg-blue-50/40"><td className="px-3 py-2 font-bold text-blue-700">{r.supplierCode}</td><td className="px-3 py-2">{r.supplierName}</td><td className="px-3 py-2 font-semibold">{r.siteId}</td><td className="px-3 py-2 font-mono">{r.latitude.toFixed(6)}</td><td className="px-3 py-2 font-mono">{r.longitude.toFixed(6)}</td><td className="px-3 py-2">{r.radiusMeter} m</td><td className="px-3 py-2"><span className={r.status==='ACTIVE'?'rounded-full bg-emerald-100 px-2 py-1 font-bold text-emerald-700':'rounded-full bg-slate-200 px-2 py-1 font-bold text-slate-600'}>{r.status}</span></td><td className="max-w-[260px] truncate px-3 py-2" title={r.remark}>{r.remark||'-'}</td><td className="px-3 py-2"><div className="flex gap-1"><button type="button" title="ดูบนแผนที่" onClick={()=>onViewMap?.(r)} className="rounded-lg bg-emerald-50 p-2 text-emerald-700"><MapPin className="h-4 w-4"/></button>{canManage&&<><button type="button" title="แก้ไข" onClick={()=>{setForm(r);setOriginalSupplierCode(r.supplierCode);setOriginalSiteId(r.siteId);setDialog('edit');}} className="rounded-lg bg-blue-50 p-2 text-blue-700"><Edit3 className="h-4 w-4"/></button><button type="button" title="ลบ" onClick={()=>{ if(window.confirm(`ยืนยันปิดใช้งาน ${r.supplierCode} · ${r.siteId}?`)) void onDelete?.(r); }} className="rounded-lg bg-red-50 p-2 text-red-700"><Trash2 className="h-4 w-4"/></button></>}</div></td></tr>)}</tbody></table></div>
    </section>
    {dialog&&<div className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/65 p-4"><form onSubmit={save} className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl"><div className="flex justify-between"><h2 className="text-xl font-black">{dialog==='create'?'เพิ่ม Supplier':'แก้ไข Supplier'}</h2><button type="button" onClick={()=>setDialog(null)}><X/></button></div><div className="mt-5 grid gap-4 sm:grid-cols-2">{([['supplierCode','Supplier Code','text'],['supplierName','Supplier Name','text'],['siteId','Site ID','text'],['latitude','Latitude','number'],['longitude','Longitude','number'],['radiusMeter','Radius Meter','number']] as const).map(([field,label,type])=><label key={field} className="text-sm font-semibold">{label}<input type={type} step={type==='number'?'any':undefined} value={form[field]} onChange={e=>setForm(v=>({...v,[field]:type==='number'?Number(e.target.value):e.target.value}))} required className="mt-1 w-full rounded-xl border px-3 py-2.5"/></label>)}<label className="text-sm font-semibold">Status<select value={form.status} onChange={e=>setForm(v=>({...v,status:e.target.value as SupplierLocation['status']}))} className="mt-1 w-full rounded-xl border px-3 py-2.5"><option>ACTIVE</option><option>INACTIVE</option></select></label><label className="text-sm font-semibold">Remark<input value={form.remark} onChange={e=>setForm(v=>({...v,remark:e.target.value}))} className="mt-1 w-full rounded-xl border px-3 py-2.5"/></label></div><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={()=>setDialog(null)} className="rounded-xl border px-5 py-2.5">ยกเลิก</button><button disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 font-bold text-white">{busy&&<Loader2 className="h-4 w-4 animate-spin"/>}บันทึก</button></div></form></div>}
    {showImport&&<div className="fixed inset-0 z-[1300] flex items-center justify-center bg-slate-950/70 p-4"><div className="flex max-h-[90vh] w-full max-w-6xl flex-col rounded-2xl bg-white p-5"><div className="flex items-center justify-between"><h2 className="text-xl font-black">ตรวจสอบ Supplier ก่อนอัปโหลด</h2><button type="button" onClick={()=>setShowImport(false)}><X/></button></div><div className="mt-4 flex gap-4 rounded-xl border bg-slate-50 p-3"><label><input type="radio" checked={importMode==='append'} onChange={()=>setImportMode('append')}/> เพิ่มต่อ</label><label><input type="radio" checked={importMode==='replace'} onChange={()=>setImportMode('replace')}/> แทนที่ทั้งหมด</label><b className="ml-auto">{preview.length} รายการ</b></div><div className="mt-3 flex-1 overflow-auto rounded-xl border"><table className="w-full min-w-[1000px] text-xs"><thead className="sticky top-0 bg-slate-100"><tr>{HEADERS.map(h=><th key={h} className="px-2 py-2 text-left">{h}</th>)}</tr></thead><tbody>{preview.map(r=><tr key={`${r.supplierCode}-${r.siteId}`}><td className="px-2 py-2">{r.supplierCode}</td><td className="px-2 py-2">{r.supplierName}</td><td className="px-2 py-2">{r.siteId}</td><td className="px-2 py-2">{r.latitude}</td><td className="px-2 py-2">{r.longitude}</td><td className="px-2 py-2">{r.radiusMeter}</td><td className="px-2 py-2">{r.status}</td><td className="px-2 py-2">{r.remark}</td></tr>)}</tbody></table></div><div className="mt-4 flex justify-end gap-3"><button type="button" onClick={()=>setShowImport(false)} className="rounded-xl border px-5 py-2.5">ยกเลิก</button><button type="button" onClick={()=>void confirmImport()} disabled={busy} className="rounded-xl bg-blue-600 px-5 py-2.5 font-bold text-white">ยืนยันอัปโหลด</button></div></div></div>}
  </div>;
}
