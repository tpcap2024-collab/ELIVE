/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, AlertTriangle, RefreshCw, Info, AlertCircle, Sparkles, Check, HelpCircle, Plus, Trash2 } from 'lucide-react';
import { TruckData, DailyPlanItem } from '../types';

interface DailyPlanManagerProps {
  trucks: TruckData[];
  dailyPlan: DailyPlanItem[];
  onUploadPlan: (newPlan: DailyPlanItem[]) => void;
  onSyncPlanToTrucks: () => void;
  addLog: (msg: string) => void;
}

export default function DailyPlanManager({
  trucks,
  dailyPlan,
  onUploadPlan,
  onSyncPlanToTrucks,
  addLog,
}: DailyPlanManagerProps) {
  const [pasteContent, setPasteContent] = useState('');
  const [showPasteArea, setShowPasteArea] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Parse CSV helper
  const handleParsePlan = (text: string) => {
    try {
      setUploadError(null);
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) {
        throw new Error('กรุณาใส่ข้อมูลอย่างน้อย 1 แถว (รวมหัวคอลัมน์)');
      }

      const items: DailyPlanItem[] = [];
      const startIdx = lines[0].includes('ทะเบียน') || lines[0].toLowerCase().includes('plate') ? 1 : 0;

      for (let i = startIdx; i < lines.length; i++) {
        const cols = lines[i].split(/[,\t]/).map(c => c.trim().replace(/^["']|["']$/g, ''));
        if (cols.length >= 2) {
          const plateNo = cols[0];
          const plannedRoute = cols[1] || 'ไม่ระบุเส้นทาง';
          const driverDay = cols[2] || '';
          const telDriverDay = cols[3] || '';
          const driverNight = cols[4] || '';
          const telDriverNight = cols[5] || '';

          // Compute legacy names/phones
          let plannedDriverName = driverDay;
          if (driverDay && driverNight) {
            plannedDriverName = `${driverDay} (กลางวัน) / ${driverNight} (กลางคืน)`;
          } else if (driverNight) {
            plannedDriverName = `${driverNight} (กลางคืน)`;
          }

          let plannedDriverPhone = telDriverDay;
          if (telDriverDay && telDriverNight) {
            plannedDriverPhone = `${telDriverDay} (กลางวัน) / ${telDriverNight} (กลางคืน)`;
          } else if (telDriverNight) {
            plannedDriverPhone = telDriverNight;
          }

          items.push({
            plateNo,
            plannedRoute,
            plannedDriverName,
            plannedDriverPhone,
            driverDay,
            telDriverDay,
            driverNight,
            telDriverNight
          });
        }
      }

      if (items.length === 0) {
        throw new Error('ไม่พบข้อมูลแผนจัดส่งที่ถูกต้อง');
      }

      onUploadPlan(items);
      addLog(`📅 อัปโหลดแผนจัดส่งรายวันใหม่สำเร็จ จำนวน ${items.length} รายการ`);
      setShowPasteArea(false);
      setPasteContent('');
    } catch (err: any) {
      setUploadError(err.message || 'เกิดข้อผิดพลาดในการอ่านไฟล์');
    }
  };

  // File upload change
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (text) {
        handleParsePlan(text);
      }
    };
    reader.onerror = () => {
      setUploadError('ไม่สามารถอ่านไฟล์ได้');
    };
    reader.readAsText(file, 'UTF-8');
  };

  // Add/Delete Row manually
  const handleAddRow = () => {
    const newRow: DailyPlanItem = {
      plateNo: '',
      plannedRoute: '',
      plannedDriverName: '',
      plannedDriverPhone: '',
      driverDay: '',
      driverNight: '',
      telDriverDay: '',
      telDriverNight: ''
    };
    onUploadPlan([...dailyPlan, newRow]);
    addLog('➕ เพิ่มรายการแผนจัดส่งแถวใหม่แล้ว (พิมพ์แก้ไขข้อมูลในตารางได้ทันที)');
  };

  const handleDeleteRow = (index: number) => {
    const updated = dailyPlan.filter((_, idx) => idx !== index);
    onUploadPlan(updated);
    addLog('❌ ลบรายการแผนจัดส่งออกจากตารางแล้ว');
  };

  // Inline edit handler
  const handleCellChange = (index: number, field: keyof DailyPlanItem, value: string) => {
    const updated = dailyPlan.map((item, idx) => {
      if (idx === index) {
        const updatedItem = { ...item, [field]: value };
        
        // Compute standard combined driver name and phone if day/night info is edited
        const dDay = field === 'driverDay' ? value : (item.driverDay || '');
        const dNight = field === 'driverNight' ? value : (item.driverNight || '');
        if (dDay && dNight) {
          updatedItem.plannedDriverName = `${dDay} (กลางวัน) / ${dNight} (กลางคืน)`;
        } else if (dDay) {
          updatedItem.plannedDriverName = `${dDay} (กลางวัน)`;
        } else if (dNight) {
          updatedItem.plannedDriverName = `${dNight} (กลางคืน)`;
        } else {
          updatedItem.plannedDriverName = item.plannedDriverName || '';
        }

        const tDay = field === 'telDriverDay' ? value : (item.telDriverDay || '');
        const tNight = field === 'telDriverNight' ? value : (item.telDriverNight || '');
        if (tDay && tNight) {
          updatedItem.plannedDriverPhone = `${tDay} (กลางวัน) / ${tNight} (กลางคืน)`;
        } else if (tDay) {
          updatedItem.plannedDriverPhone = tDay;
        } else if (tNight) {
          updatedItem.plannedDriverPhone = tNight;
        } else {
          updatedItem.plannedDriverPhone = item.plannedDriverPhone || '';
        }

        return updatedItem;
      }
      return item;
    });
    onUploadPlan(updated);
  };

  // Load standard samples
  const loadSamplePlan1 = () => {
    const sample: DailyPlanItem[] = [
      {
        plateNo: '70-4581 ชลบุรี',
        plannedRoute: 'TPCAP - แหลมฉบัง (Chonburi)',
        plannedDriverName: 'นายสมชาย ดีใจ (กลางวัน) / นายสมเกียรติ มุ่งมั่น (กลางคืน)',
        plannedDriverPhone: '081-234-5678 (กลางวัน) / 089-111-2222 (กลางคืน)',
        driverDay: 'นายสมชาย ดีใจ',
        driverNight: 'นายสมเกียรติ มุ่งมั่น',
        telDriverDay: '081-234-5678',
        telDriverNight: '089-111-2222'
      },
      {
        plateNo: '71-9014 กรุงเทพฯ',
        plannedRoute: 'TPCAP - อมตะซิตี้ (Chonburi)',
        plannedDriverName: 'นายวิชัย รักสงบ (กลางวัน) / นายชลทิศ พัฒนา (กลางคืน)',
        plannedDriverPhone: '089-876-5432 (กลางวัน) / 082-555-6666 (กลางคืน)',
        driverDay: 'นายวิชัย รักสงบ',
        driverNight: 'นายชลทิศ พัฒนา',
        telDriverDay: '089-876-5432',
        telDriverNight: '082-555-6666'
      },
      {
        plateNo: '72-2241 ระยอง',
        plannedRoute: 'TPCAP - มาบตาพุด (Rayong)',
        plannedDriverName: 'นายประสิทธิ์ มั่นคง (กลางวัน) / นายศักดา ยิ่งยืน (กลางคืน)',
        plannedDriverPhone: '082-345-6789 (กลางวัน) / 083-999-8888 (กลางคืน)',
        driverDay: 'นายประสิทธิ์ มั่นคง',
        driverNight: 'นายศักดา ยิ่งยืน',
        telDriverDay: '082-345-6789',
        telDriverNight: '083-999-8888'
      },
      {
        plateNo: '70-9875 อยุธยา',
        plannedRoute: 'โรจนะ (Ayutthaya) - TPCAP',
        plannedDriverName: 'นายสุรศักดิ์ ใจกว้าง (กลางวัน) / นายวิษณุ เก่งกาจ (กลางคืน)',
        plannedDriverPhone: '085-456-7890 (กลางวัน) / 084-222-3333 (กลางคืน)',
        driverDay: 'นายสุรศักดิ์ ใจกว้าง',
        driverNight: 'นายวิษณุ เก่งกาจ',
        telDriverDay: '085-456-7890',
        telDriverNight: '084-222-3333'
      },
      {
        plateNo: '10-3342 สมุทรปราการ',
        plannedRoute: 'TPCAP - บางนา (Bangna)',
        plannedDriverName: 'นายอภิชาติ นามมั่น (กลางวัน) / นายเกริกเดช รักชาติ (กลางคืน)',
        plannedDriverPhone: '083-789-0123 (กลางวัน) / 085-777-8888 (กลางคืน)',
        driverDay: 'นายอภิชาติ นามมั่น',
        driverNight: 'นายเกริกเดช รักชาติ',
        telDriverDay: '083-789-0123',
        telDriverNight: '085-777-8888'
      }
    ];
    onUploadPlan(sample);
    addLog('📅 โหลดตัวอย่างแผนจัดส่งประจำวันเข้าระบบสำเร็จ');
  };

  // Comparisons computation
  const comparisons = trucks.map(truck => {
    const planItem = dailyPlan.find(p => p.plateNo.replace(/\s+/g, '') === truck.plateNo.replace(/\s+/g, ''));
    
    if (!planItem) {
      return {
        truck,
        plan: null,
        status: 'unplanned' as const,
        statusText: 'วิ่งนอกแผนงาน 🚨',
        statusColor: 'text-rose-600 bg-rose-50 border-rose-200',
        routeMatch: false,
        driverMatch: false,
      };
    }

    const routeMatch = truck.route.replace(/\s+/g, '').includes(planItem.plannedRoute.replace(/\s+/g, '')) || 
                       planItem.plannedRoute.replace(/\s+/g, '').includes(truck.route.replace(/\s+/g, ''));
    const driverMatch = truck.driverName.trim().replace(/\s+/g, '').includes(planItem.plannedDriverName.trim().replace(/\s+/g, '')) ||
                        planItem.plannedDriverName.trim().replace(/\s+/g, '').includes(truck.driverName.trim().replace(/\s+/g, ''));

    const isAllMatched = routeMatch; // Focus match primarily on route alignment

    return {
      truck,
      plan: planItem,
      status: isAllMatched ? 'matched' as const : 'mismatch' as const,
      statusText: isAllMatched ? 'ข้อมูลตรงตามแผน 🟢' : 'ข้อมูลไม่ตรงกัน ⚠️',
      statusColor: isAllMatched ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-amber-700 bg-amber-50 border-amber-200',
      routeMatch,
      driverMatch,
    };
  });

  return (
    <div className="space-y-6" id="daily-plan-manager-panel">
      
      {/* Dynamic Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
            <FileSpreadsheet className="w-5 h-5 text-blue-600" />
            ตารางแผนจัดส่งรายวันแบบแมนนวล (Interactive Daily Plan Grid)
          </h3>
          <p className="text-[11px] text-slate-400 font-bold mt-0.5">คุณสามารถพิมพ์แก้ไขข้อมูลแต่ละช่องได้โดยตรง พิมพ์เสร็จระบบจะอัปเดตและเปรียบเทียบกับพิกัดจริงบนแดชบอร์ดทันที</p>
        </div>
        
        <div className="flex gap-2 shrink-0">
          <button
            onClick={loadSamplePlan1}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-lg cursor-pointer transition-all flex items-center gap-1"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            โหลดตัวอย่างแผนงาน
          </button>

          <button
            onClick={() => setShowPasteArea(!showPasteArea)}
            className="px-3 py-1.5 bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-lg cursor-pointer transition-all flex items-center gap-1"
          >
            {showPasteArea ? 'แก้ไขแมนนวล' : 'อัปโหลด/วางไฟล์'}
          </button>
        </div>
      </div>

      {/* CSV Import / Paste Options */}
      {showPasteArea && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4 animate-fadeIn">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Drag & drop upload box */}
            <div className="border border-dashed border-slate-300 bg-white hover:bg-slate-50/50 rounded-lg p-4 text-center cursor-pointer relative group transition-all">
              <input
                type="file"
                accept=".csv,.txt"
                onChange={handleFileUpload}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <div className="flex flex-col items-center justify-center space-y-2">
                <Upload className="w-6 h-6 text-slate-400 group-hover:text-blue-500 transition-colors" />
                <div className="text-xs font-bold">
                  <span className="text-blue-600">อัปโหลดไฟล์แผน CSV</span> หรือ ลากวางที่นี่
                </div>
                <p className="text-[10px] text-slate-400 font-bold">รองรับหัวคอลัมน์: ทะเบียน, เส้นทาง, คนขับกลางวัน, เบอร์คนขับกลางวัน, คนขับกลางคืน, เบอร์คนขับกลางคืน</p>
              </div>
            </div>

            {/* Paste content textarea */}
            <div className="space-y-2">
              <label className="block text-[10.5px] font-bold text-slate-500">วางแถวข้อมูล CSV ตรงนี้</label>
              <textarea
                value={pasteContent}
                onChange={(e) => setPasteContent(e.target.value)}
                placeholder="70-4581 ชลบุรี, TPCAP - แหลมฉบัง (Chonburi), สมชาย, 081-111-2222, สมเกียรติ, 089-333-4444"
                className="w-full h-20 border border-slate-300 rounded-lg p-2 text-xs font-mono focus:outline-none focus:border-blue-500 bg-white"
              />
            </div>
          </div>

          {uploadError && <p className="text-xs text-rose-600 font-bold">{uploadError}</p>}

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              onClick={() => setShowPasteArea(false)}
              className="px-3.5 py-1.5 text-xs font-bold text-slate-600 bg-slate-200 hover:bg-slate-300 rounded-lg cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              onClick={() => handleParsePlan(pasteContent)}
              className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer shadow-sm"
            >
              นำเข้าแผนงาน
            </button>
          </div>
        </div>
      )}

      {/* Manual Interactive Table Grid */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 shadow-inner">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="border-b border-slate-200 text-[10.5px] text-slate-400 font-bold uppercase tracking-wider">
                <th className="pb-2.5 px-2 w-[14%]">ทะเบียนรถ (Plate No)</th>
                <th className="pb-2.5 px-2 w-[22%]">เส้นทางขนส่ง (Planned Route)</th>
                <th className="pb-2.5 px-2 w-[15%]">คนขับกลางวัน (Driver Day)</th>
                <th className="pb-2.5 px-2 w-[15%]">เบอร์คนขับกลางวัน (Tel Day)</th>
                <th className="pb-2.5 px-2 w-[15%]">คนขับกลางคืน (Driver Night)</th>
                <th className="pb-2.5 px-2 w-[15%]">เบอร์คนขับกลางคืน (Tel Night)</th>
                <th className="pb-2.5 px-2 text-center w-[4%]">ลบ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60">
              {dailyPlan.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-100/40 transition-colors">
                  <td className="py-2 px-1">
                    <input
                      type="text"
                      value={item.plateNo}
                      onChange={(e) => handleCellChange(idx, 'plateNo', e.target.value)}
                      placeholder="70-xxxx ชลบุรี"
                      className="w-full bg-white border border-slate-200 px-2 py-1 text-xs rounded shadow-xs focus:outline-none focus:border-blue-500 font-bold text-slate-800"
                    />
                  </td>
                  <td className="py-2 px-1">
                    <input
                      type="text"
                      value={item.plannedRoute}
                      onChange={(e) => handleCellChange(idx, 'plannedRoute', e.target.value)}
                      placeholder="TPCAP - ปลายทาง"
                      className="w-full bg-white border border-slate-200 px-2 py-1 text-xs rounded shadow-xs focus:outline-none focus:border-blue-500 font-semibold text-slate-700"
                    />
                  </td>
                  <td className="py-2 px-1">
                    <input
                      type="text"
                      value={item.driverDay || ''}
                      onChange={(e) => handleCellChange(idx, 'driverDay', e.target.value)}
                      placeholder="ชื่อคนขับกลางวัน"
                      className="w-full bg-white border border-slate-200 px-2 py-1 text-xs rounded shadow-xs focus:outline-none focus:border-blue-500 text-slate-600"
                    />
                  </td>
                  <td className="py-2 px-1">
                    <input
                      type="text"
                      value={item.telDriverDay || ''}
                      onChange={(e) => handleCellChange(idx, 'telDriverDay', e.target.value)}
                      placeholder="08x-xxx-xxxx"
                      className="w-full bg-white border border-slate-200 px-2 py-1 text-xs rounded shadow-xs focus:outline-none focus:border-blue-500 font-mono text-slate-600"
                    />
                  </td>
                  <td className="py-2 px-1">
                    <input
                      type="text"
                      value={item.driverNight || ''}
                      onChange={(e) => handleCellChange(idx, 'driverNight', e.target.value)}
                      placeholder="ชื่อคนขับกลางคืน"
                      className="w-full bg-white border border-slate-200 px-2 py-1 text-xs rounded shadow-xs focus:outline-none focus:border-blue-500 text-slate-600"
                    />
                  </td>
                  <td className="py-2 px-1">
                    <input
                      type="text"
                      value={item.telDriverNight || ''}
                      onChange={(e) => handleCellChange(idx, 'telDriverNight', e.target.value)}
                      placeholder="08x-xxx-xxxx"
                      className="w-full bg-white border border-slate-200 px-2 py-1 text-xs rounded shadow-xs focus:outline-none focus:border-blue-500 font-mono text-slate-600"
                    />
                  </td>
                  <td className="py-2 px-1 text-center">
                    <button
                      onClick={() => handleDeleteRow(idx)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-all cursor-pointer"
                      title="ลบแถวแผนงานนี้"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}

              {dailyPlan.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-xs text-slate-400 font-bold">
                    ยังไม่มีข้อมูลแผนจัดส่งรายวันในตาราง เริ่มพิมพ์ด้วยตนเองได้โดยกดปุ่ม "เพิ่มแถวจัดส่งใหม่" ด้านล่าง
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Action Button underneath table */}
        <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-200/60">
          <button
            onClick={handleAddRow}
            className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg flex items-center gap-1 cursor-pointer shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>เพิ่มแถวจัดส่งใหม่</span>
          </button>

          <span className="text-[10px] text-slate-400 font-bold font-mono">
            ทั้งหมด {dailyPlan.length} แผนงานจัดส่ง
          </span>
        </div>
      </div>

      {/* Sync Plan to Live Trucks Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <Sparkles className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="space-y-1.5 leading-normal">
          <p className="text-xs font-bold text-blue-900">อัปเดตข้อมูลรถวิ่งตามแผนแมนนวลดนข้าง</p>
          <p className="text-[11px] text-blue-700 font-medium">คุณสามารถซิงค์ทับข้อมูลรถจริงเพื่อนำแผนงานแมนนวลดนนี้ (เส้นทาง และชื่อ/เบอร์คนขับทั้งช่วงกลางวันและกลางคืน) ไปใช้ควบคุมสถานะพิกัดและการเปรียบเทียบบนแดชบอร์ดได้ทันที</p>
          <button
            onClick={() => {
              onSyncPlanToTrucks();
              addLog('⚡ ประยุกต์ใช้ข้อมูล รูท คนขับ (Day/Night) และเบอร์โทรของรถจริงทั้งหมดตามแผนแมนนวลดนแล้ว');
            }}
            className="mt-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg flex items-center gap-1 cursor-pointer shadow-sm transition-all uppercase"
          >
            <Check className="w-3.5 h-3.5" />
            <span>ซิงค์แผนแมนนวลดนลงระบบพิกัดรถจริง</span>
          </button>
        </div>
      </div>

      {/* Comparison Grid Results */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-400 uppercase font-black tracking-wider">
          <span>ตารางสรุปเปรียบเทียบข้อมูลรถวิ่งจริง VS แผนงานแมนนวลดน (Proximity Audit)</span>
          <span className="font-mono text-blue-600 font-black">({comparisons.length} คันตรวจวัด)</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
          {comparisons.map(({ truck, plan, status, statusText, statusColor, routeMatch, driverMatch }) => (
            <div key={truck.id} className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2.5 transition-all hover:shadow-sm">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 text-xs">{truck.plateNo}</span>
                <span className={`px-2 py-0.5 rounded text-[9.5px] font-bold border ${statusColor}`}>
                  {statusText}
                </span>
              </div>

              {plan ? (
                <div className="grid grid-cols-2 gap-3 text-xs leading-snug border-t border-slate-100 pt-2.5">
                  <div className="space-y-1">
                    <span className="text-slate-400 font-bold block text-[10px]">พิกัดข้อมูลปัจจุบัน (Actual GPS)</span>
                    <p className={`font-semibold ${!routeMatch ? 'text-amber-600 font-bold' : 'text-slate-700'}`}>
                      📍 {truck.route.split(' (')[0]}
                    </p>
                    <p className={`font-semibold ${!driverMatch ? 'text-amber-600' : 'text-slate-600'}`}>
                      👤 {truck.driverName}
                    </p>
                    <p className="text-[10px] text-slate-400 font-bold">
                      📞 {truck.driverPhone}
                    </p>
                  </div>

                  <div className="space-y-1 border-l border-slate-100 pl-3">
                    <span className="text-slate-400 font-bold block text-[10px]">ข้อมูลตามแผนงาน (Planned Day/Night)</span>
                    <p className="font-bold text-slate-800 truncate" title={plan.plannedRoute}>
                      📋 {plan.plannedRoute.split(' (')[0]}
                    </p>
                    <p className="font-bold text-slate-800 truncate">
                      👤 {plan.plannedDriverName}
                    </p>
                    <p className="text-[10px] text-slate-500 font-mono font-bold truncate">
                      📞 {plan.plannedDriverPhone}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-[10.5px] text-slate-500 italic pl-1 border-t border-slate-100 pt-1.5">
                  * ไม่พบประวัติทะเบียนรถนี้ระบุในตารางแผนงานแมนนวลดนรายวัน
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
