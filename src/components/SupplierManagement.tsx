import { useEffect, useMemo, useRef, useState } from 'react';
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
  const [query,setQuery]=useState(''); const [status,setStatus]=useState<'ALL'|'ACTIVE'|'INACTIVE'>('ALL'); const [mapSupplier,setMapSupplier]=useState<SupplierLocation|null>(null); const supplierMapRef=useRef<HTMLDivElement>(null); const editSupplierMapRef=useRef<HTMLDivElement>(null); const editMapInstanceRef=useRef<any>(null); const editMarkerRef=useRef<any>(null); const editCircleRef=useRef<any>(null); const [selectedKeys,setSelectedKeys]=useState<Set<string>>(new Set()); const [deleteProgress,setDeleteProgress]=useState(''); const [dialog,setDialog]=useState<'create'|'edit'|null>(null); const [form,setForm]=useState<SupplierLocation>(EMPTY); const [originalSupplierCode,setOriginalSupplierCode]=useState(''); const [originalSiteId,setOriginalSiteId]=useState(''); const [busy,setBusy]=useState(false); const [message,setMessage]=useState(''); const [preview,setPreview]=useState<SupplierLocation[]>([]); const [importMode,setImportMode]=useState<'append'|'replace'>('append'); const [showImport,setShowImport]=useState(false);
  const filtered=useMemo(()=>rows.filter(r=>(status==='ALL'||r.status===status)&&(!query||[r.supplierCode,r.supplierName,r.siteId,r.remark].join(' ').toLowerCase().includes(query.toLowerCase()))),[rows,query,status]);
    const rowKey=(row:SupplierLocation)=>`${row.supplierCode}|${row.siteId}`;
    const selectedRows=useMemo(()=>rows.filter(row=>selectedKeys.has(rowKey(row))),[rows,selectedKeys]);
    const allFilteredSelected=filtered.length>0&&filtered.every(row=>selectedKeys.has(rowKey(row)));
    const someFilteredSelected=filtered.some(row=>selectedKeys.has(rowKey(row)));
    const toggleAllFiltered=()=>setSelectedKeys(current=>{const next=new Set(current);if(allFilteredSelected)filtered.forEach(row=>next.delete(rowKey(row)));else filtered.forEach(row=>next.add(rowKey(row)));return next;});
    const toggleRow=(row:SupplierLocation)=>setSelectedKeys(current=>{const next=new Set(current);const key=rowKey(row);if(next.has(key))next.delete(key);else next.add(key);return next;});
    const deleteSelected=async()=>{
      if(!canManage||busy||!selectedRows.length||!onDelete)return;
      if(!window.confirm(`ยืนยันปิดใช้งาน Supplier ที่เลือก ${selectedRows.length} รายการ?`))return;
      setBusy(true);setMessage('');setDeleteProgress(`กำลังลบ 0/${selectedRows.length}`);
      let completed=0;
      try{
        for(const row of selectedRows){await onDelete(row);completed+=1;setDeleteProgress(`กำลังลบ ${completed}/${selectedRows.length}`);}
        setSelectedKeys(new Set());setMessage(`ปิดใช้งาน Supplier สำเร็จ ${completed} รายการ`);
      }catch(err){setMessage(`ลบสำเร็จ ${completed}/${selectedRows.length} รายการ · ${err instanceof Error?err.message:String(err)}`);}
      finally{setBusy(false);setDeleteProgress('');}
    };
  useEffect(()=>{
    if(!mapSupplier||!supplierMapRef.current)return;
    let disposed=false; let map:any=null;
    const openMap=async()=>{
      const L=(await import('leaflet')).default; await import('leaflet/dist/leaflet.css');
      if(disposed||!supplierMapRef.current)return;
      const street=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'});
      const satellite=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Tiles &copy; Esri'});
      const terrain=L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',{maxZoom:17,attribution:'Map data &copy; OpenStreetMap contributors, SRTM | Map style &copy; OpenTopoMap'});
      map=L.map(supplierMapRef.current,{zoomControl:true,attributionControl:true,layers:[street]}).setView([mapSupplier.latitude,mapSupplier.longitude],15);
      L.control.layers({'ถนน':street,'ดาวเทียม':satellite,'ภูมิประเทศ':terrain},undefined,{position:'topright',collapsed:true}).addTo(map);
      L.circle([mapSupplier.latitude,mapSupplier.longitude],{radius:mapSupplier.radiusMeter,color:'#7c3aed',weight:3,opacity:.95,fillColor:'#8b5cf6',fillOpacity:.17,dashArray:'8 6'}).addTo(map);
      const icon=L.divIcon({className:'',html:`<div style="display:flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#7c3aed;border:4px solid white;box-shadow:0 4px 14px rgba(15,23,42,.35)"><span style="transform:rotate(45deg);color:white;font:bold 12px system-ui">S</span></div>`,iconSize:[42,42],iconAnchor:[21,40],popupAnchor:[0,-40]});
      L.marker([mapSupplier.latitude,mapSupplier.longitude],{icon}).addTo(map).bindPopup(`<div style="min-width:230px;font-family:system-ui,sans-serif"><b>${mapSupplier.siteId} · ${mapSupplier.supplierCode}</b><div style="margin-top:5px">${mapSupplier.supplierName}</div><div style="margin-top:5px;color:#64748b">${mapSupplier.latitude.toFixed(6)}, ${mapSupplier.longitude.toFixed(6)} · Radius ${mapSupplier.radiusMeter} m</div></div>`).openPopup();
      window.setTimeout(()=>map?.invalidateSize(),80);
    };
    void openMap(); return()=>{disposed=true;if(map){map.remove();map=null;}};
  },[mapSupplier]);
  useEffect(()=>{
    if(dialog!=='edit'||!editSupplierMapRef.current)return;
    let disposed=false; let map:any=null;
    const openEditMap=async()=>{
      const L=(await import('leaflet')).default; await import('leaflet/dist/leaflet.css');
      if(disposed||!editSupplierMapRef.current)return;
      const street=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'});
      const satellite=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Tiles &copy; Esri'});
      const terrain=L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',{maxZoom:17,attribution:'Map data &copy; OpenStreetMap contributors, SRTM | Map style &copy; OpenTopoMap'});
      map=L.map(editSupplierMapRef.current,{zoomControl:true,attributionControl:true,layers:[street]}).setView([form.latitude,form.longitude],16);
      L.control.layers({'ถนน':street,'ดาวเทียม':satellite,'ภูมิประเทศ':terrain},undefined,{position:'topright',collapsed:true}).addTo(map);
      let circle=L.circle([form.latitude,form.longitude],{radius:form.radiusMeter,color:'#2563eb',weight:3,fillColor:'#60a5fa',fillOpacity:.16}).addTo(map);
      const editIcon=L.divIcon({className:'',html:'<div style="display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#2563eb;border:4px solid white;box-shadow:0 4px 14px rgba(15,23,42,.3)"><span style="transform:rotate(45deg);color:white;font:bold 12px system-ui">S</span></div>',iconSize:[38,38],iconAnchor:[19,36]});
      const marker=L.marker([form.latitude,form.longitude],{draggable:true,icon:editIcon}).addTo(map);
      editMapInstanceRef.current=map; editMarkerRef.current=marker; editCircleRef.current=circle;
      marker.on('drag',()=>{const pos=marker.getLatLng();circle.setLatLng(pos);});
      marker.on('dragend',()=>{const pos=marker.getLatLng();setForm(value=>({...value,latitude:Number(pos.lat.toFixed(6)),longitude:Number(pos.lng.toFixed(6))}));});
      map.on('click',(event:any)=>{marker.setLatLng(event.latlng);circle.setLatLng(event.latlng);setForm(value=>({...value,latitude:Number(event.latlng.lat.toFixed(6)),longitude:Number(event.latlng.lng.toFixed(6))}));});
      window.setTimeout(()=>map?.invalidateSize(),80);
    };
    void openEditMap(); return()=>{disposed=true;editMapInstanceRef.current=null;editMarkerRef.current=null;editCircleRef.current=null;if(map){map.remove();map=null;}};
  },[dialog]);
  useEffect(()=>{
    if(dialog!=='edit'||!editMapInstanceRef.current||!editMarkerRef.current||!editCircleRef.current)return;
    if(!Number.isFinite(form.latitude)||!Number.isFinite(form.longitude))return;
    const position:[number,number]=[form.latitude,form.longitude];
    editMarkerRef.current.setLatLng(position);
    editCircleRef.current.setLatLng(position);
    if(Number.isFinite(form.radiusMeter)&&form.radiusMeter>=100) editCircleRef.current.setRadius(form.radiusMeter);
  },[dialog,form.latitude,form.longitude,form.radiusMeter]);
  const save=async(e:FormEvent)=>{e.preventDefault();if(!canManage||busy)return;setBusy(true);setMessage('');try{if(dialog==='create')await onCreate?.(form);else await onUpdate?.(originalSupplierCode,originalSiteId,form);setDialog(null);setMessage('บันทึก Supplier สำเร็จ');}catch(err){setMessage(err instanceof Error?err.message:String(err));}finally{setBusy(false);}};
  const read=async(e:ChangeEvent<HTMLInputElement>)=>{const file=e.target.files?.[0];if(!file)return;setBusy(true);setMessage('');try{const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});const ws=wb.Sheets[wb.SheetNames[0]];setPreview(parseRows(XLSX.utils.sheet_to_json<unknown[]>(ws,{header:1,raw:true,defval:'',blankrows:false})));setShowImport(true);}catch(err){setMessage(err instanceof Error?err.message:String(err));}finally{setBusy(false);e.target.value='';}};
  const confirmImport=async()=>{if(!canManage||!preview.length)return;setBusy(true);try{await onImport?.(preview,importMode);setShowImport(false);setPreview([]);setMessage(`นำเข้า Supplier สำเร็จ ${preview.length} รายการ`);}catch(err){setMessage(err instanceof Error?err.message:String(err));}finally{setBusy(false);}};
  return <div className="min-h-full bg-slate-50 p-3">
    <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={read}/>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-gradient-to-r from-white via-slate-50/70 to-blue-50/40 p-4">
        <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
          <div className="min-w-[220px]">
            <h1 className="text-xl font-black tracking-tight text-slate-900">Supplier Locations</h1>
            <p className="mt-1 text-xs font-medium text-slate-500">จัดการข้อมูลและพิกัด Supplier สำหรับ Live Map</p>
          </div>
          <div className="flex flex-1 flex-col gap-3 xl:flex-row xl:items-center xl:justify-end">
            <div className="grid grid-cols-3 gap-2">
              <div className="min-w-[88px] rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"><p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">ทั้งหมด</p><div className="mt-0.5 text-lg font-black leading-none text-slate-800">{rows.length}</div></div>
              <div className="min-w-[88px] rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 shadow-sm"><p className="text-[9px] font-bold uppercase tracking-wide text-emerald-600">Active</p><div className="mt-0.5 text-lg font-black leading-none text-emerald-700">{rows.filter(r=>r.status==='ACTIVE').length}</div></div>
              <div className="min-w-[88px] rounded-xl border border-slate-300 bg-slate-100 px-3 py-2 shadow-sm"><p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Inactive</p><div className="mt-0.5 text-lg font-black leading-none text-slate-700">{rows.filter(r=>r.status==='INACTIVE').length}</div></div>
            </div>
            <div className="hidden h-10 w-px bg-slate-200 xl:block"/>
            <div className="flex flex-wrap items-center gap-2 xl:flex-nowrap">
              <button type="button" title="ดาวน์โหลดไฟล์ตัวอย่าง" onClick={()=>XLSX.writeFile(workbook([]),'ELIVE_Supplier_Locations_Template.xlsx')} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"><FileSpreadsheet className="h-4 w-4"/>Template</button>
              <button type="button" title="ดาวน์โหลดข้อมูล Supplier" onClick={()=>XLSX.writeFile(workbook(rows),'ELIVE_Supplier_Locations.xlsx')} className="inline-flex h-10 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-sm font-bold text-emerald-700 shadow-sm transition hover:bg-emerald-100"><Download className="h-4 w-4"/>Download</button>
              {canManage&&<><button type="button" title="ปิดใช้งานรายการที่เลือก" onClick={()=>void deleteSelected()} disabled={busy||selectedRows.length===0} className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 text-sm font-bold text-red-600 shadow-sm transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 className="h-4 w-4"/>{deleteProgress||`ลบ (${selectedRows.length})`}</button><button type="button" title="อัปโหลดไฟล์ Supplier" onClick={()=>inputRef.current?.click()} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"><Upload className="h-4 w-4"/>Upload</button><button type="button" onClick={()=>{setForm(EMPTY);setDialog('create');}} className="inline-flex h-10 items-center gap-2 rounded-xl bg-amber-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-amber-700"><Plus className="h-4 w-4"/>เพิ่ม Supplier</button></>}
            </div>
          </div>
        </div>
      </div>
      {message&&<div className="m-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-800">{message}</div>}
      <div className="grid gap-3 p-3 sm:grid-cols-[1fr_180px]"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ค้นหา Code, Supplier, Site หรือ Remark..." className="h-10 w-full rounded-xl border pl-9 pr-3 text-sm"/></div><select value={status} onChange={e=>setStatus(e.target.value as typeof status)} className="h-10 rounded-xl border bg-white px-3 text-sm"><option value="ALL">ทุกสถานะ</option><option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option></select></div>
      <div className="max-h-[calc(100vh-260px)] overflow-auto border-t"><table className="w-full table-fixed text-xs"><thead className="sticky top-0 bg-slate-100 text-left text-[10px] uppercase text-slate-600"><tr>{canManage&&<th className="w-12 px-3 py-3 text-center"><input type="checkbox" aria-label="เลือกทั้งหมดที่แสดง" checked={allFilteredSelected} ref={element=>{if(element)element.indeterminate=!allFilteredSelected&&someFilteredSelected;}} onChange={toggleAllFiltered} className="h-4 w-4 rounded border-slate-300 accent-blue-600"/></th>}{[['Code','w-[70px]'],['Supplier Name','w-[180px]'],['Site ID','w-[100px]'],['Latitude','w-[110px]'],['Longitude','w-[110px]'],['Radius','w-[80px]'],['Status','w-[95px]'],['Remark','w-[100px]'],['Action','w-[130px]']].map(([h,width])=><th key={h} className={`${width} whitespace-nowrap px-3 py-3`}>{h}</th>)}</tr></thead><tbody className="divide-y">{filtered.map(r=><tr key={`${r.supplierCode}-${r.siteId}`} className={selectedKeys.has(rowKey(r))?'bg-blue-50 hover:bg-blue-100':'hover:bg-blue-50/40'}>{canManage&&<td className="px-3 py-2 text-center"><input type="checkbox" aria-label={`เลือก ${r.supplierCode} ${r.siteId}`} checked={selectedKeys.has(rowKey(r))} onChange={()=>toggleRow(r)} className="h-4 w-4 rounded border-slate-300 accent-blue-600"/></td>}<td className="whitespace-nowrap px-3 py-2 font-bold text-blue-700">{r.supplierCode}</td><td className="truncate px-3 py-2" title={r.supplierName}>{r.supplierName}</td><td className="whitespace-nowrap px-3 py-2 font-semibold">{r.siteId}</td><td className="whitespace-nowrap px-3 py-2 font-mono tabular-nums">{r.latitude.toFixed(6)}</td><td className="whitespace-nowrap px-3 py-2 font-mono tabular-nums">{r.longitude.toFixed(6)}</td><td className="whitespace-nowrap px-3 py-2">{r.radiusMeter} m</td><td className="whitespace-nowrap px-3 py-2"><span className={r.status==='ACTIVE'?'rounded-full bg-emerald-100 px-2 py-1 font-bold text-emerald-700':'rounded-full bg-slate-200 px-2 py-1 font-bold text-slate-600'}>{r.status}</span></td><td className="max-w-[100px] truncate px-2 py-2" title={r.remark}>{r.remark||'-'}</td><td className="whitespace-nowrap px-3 py-2"><div className="flex justify-center gap-1"><button type="button" title="ดูบนแผนที่" onClick={()=>setMapSupplier(r)} className="rounded-lg bg-emerald-50 p-2 text-emerald-700"><MapPin className="h-4 w-4"/></button>{canManage&&<><button type="button" title="แก้ไข" onClick={()=>{setForm(r);setOriginalSupplierCode(r.supplierCode);setOriginalSiteId(r.siteId);setDialog('edit');}} className="rounded-lg bg-blue-50 p-2 text-blue-700"><Edit3 className="h-4 w-4"/></button><button type="button" title="ลบ" onClick={()=>{ if(window.confirm(`ยืนยันปิดใช้งาน ${r.supplierCode} · ${r.siteId}?`)) void onDelete?.(r); }} className="rounded-lg bg-red-50 p-2 text-red-700"><Trash2 className="h-4 w-4"/></button></>}</div></td></tr>)}</tbody></table></div>
    </section>
    {mapSupplier&&<div className="fixed inset-0 z-[1400] flex items-center justify-center bg-slate-950/65 p-4" onClick={()=>setMapSupplier(null)}><div className="flex h-[min(760px,92vh)] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl" onClick={event=>event.stopPropagation()}><div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div className="min-w-0"><h2 className="truncate text-xl font-black text-slate-900">{mapSupplier.siteId} · {mapSupplier.supplierName}</h2><p className="mt-1 text-sm text-slate-500">{mapSupplier.supplierCode} · รัศมี {mapSupplier.radiusMeter} m</p></div><button type="button" onClick={()=>setMapSupplier(null)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"><X className="h-6 w-6"/></button></div><div className="relative min-h-0 flex-1"><div ref={supplierMapRef} className="h-full w-full"/><div className="absolute right-4 top-4 z-[500] rounded-xl border border-violet-200 bg-white/95 px-4 py-3 text-sm shadow-lg backdrop-blur"><div className="font-black text-violet-700">{mapSupplier.status}</div><div className="mt-1 text-slate-600">Radius {mapSupplier.radiusMeter} m</div></div></div></div></div>}
    {dialog&&<div className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/65 p-4"><form onSubmit={save} className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"><div className="flex justify-between border-b border-slate-200 px-6 py-4"><h2 className="text-xl font-black">{dialog==='create'?'เพิ่ม Supplier':'แก้ไข Supplier'}</h2><button type="button" onClick={()=>setDialog(null)}><X/></button></div><div className={`min-h-0 flex-1 gap-5 overflow-auto p-6 ${dialog==='edit'?'grid lg:grid-cols-[420px_minmax(0,1fr)]':''}`}><div className="grid content-start gap-4 sm:grid-cols-2">{([['supplierCode','Supplier Code','text'],['supplierName','Supplier Name','text'],['siteId','Site ID','text'],['latitude','Latitude','number'],['longitude','Longitude','number'],['radiusMeter','Radius Meter','number']] as const).map(([field,label,type])=><label key={field} className="text-sm font-semibold">{label}<input type={type} step={type==='number'?'any':undefined} value={form[field]} onChange={e=>setForm(v=>({...v,[field]:type==='number'?Number(e.target.value):e.target.value}))} required className="mt-1 w-full rounded-xl border px-3 py-2.5"/></label>)}<label className="text-sm font-semibold">Status<select value={form.status} onChange={e=>setForm(v=>({...v,status:e.target.value as SupplierLocation['status']}))} className="mt-1 w-full rounded-xl border px-3 py-2.5"><option>ACTIVE</option><option>INACTIVE</option></select></label><label className="text-sm font-semibold">Remark<input value={form.remark} onChange={e=>setForm(v=>({...v,remark:e.target.value}))} className="mt-1 w-full rounded-xl border px-3 py-2.5"/></label></div>{dialog==='edit'&&<div className="min-h-[420px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"><div ref={editSupplierMapRef} className="h-full min-h-[420px] w-full"/></div>}</div><div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4"><button type="button" onClick={()=>setDialog(null)} className="rounded-xl border px-5 py-2.5">ยกเลิก</button><button disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 font-bold text-white">{busy&&<Loader2 className="h-4 w-4 animate-spin"/>}บันทึก</button></div></form></div>}
    {showImport&&<div className="fixed inset-0 z-[1300] flex items-center justify-center bg-slate-950/70 p-4"><div className="flex max-h-[90vh] w-full max-w-6xl flex-col rounded-2xl bg-white p-5"><div className="flex items-center justify-between"><h2 className="text-xl font-black">ตรวจสอบ Supplier ก่อนอัปโหลด</h2><button type="button" onClick={()=>setShowImport(false)}><X/></button></div><div className="mt-4 flex gap-4 rounded-xl border bg-slate-50 p-3"><label><input type="radio" checked={importMode==='append'} onChange={()=>setImportMode('append')}/> เพิ่มต่อ</label><label><input type="radio" checked={importMode==='replace'} onChange={()=>setImportMode('replace')}/> แทนที่ทั้งหมด</label><b className="ml-auto">{preview.length} รายการ</b></div><div className="mt-3 flex-1 overflow-auto rounded-xl border"><table className="w-full min-w-[1000px] text-xs"><thead className="sticky top-0 bg-slate-100"><tr>{HEADERS.map(h=><th key={h} className="px-2 py-2 text-left">{h}</th>)}</tr></thead><tbody>{preview.map(r=><tr key={`${r.supplierCode}-${r.siteId}`}><td className="px-2 py-2">{r.supplierCode}</td><td className="px-2 py-2">{r.supplierName}</td><td className="px-2 py-2">{r.siteId}</td><td className="px-2 py-2">{r.latitude}</td><td className="px-2 py-2">{r.longitude}</td><td className="px-2 py-2">{r.radiusMeter}</td><td className="px-2 py-2">{r.status}</td><td className="px-2 py-2">{r.remark}</td></tr>)}</tbody></table></div><div className="mt-4 flex justify-end gap-3"><button type="button" onClick={()=>setShowImport(false)} className="rounded-xl border px-5 py-2.5">ยกเลิก</button><button type="button" onClick={()=>void confirmImport()} disabled={busy} className="rounded-xl bg-blue-600 px-5 py-2.5 font-bold text-white">ยืนยันอัปโหลด</button></div></div></div>}
  </div>;
}
