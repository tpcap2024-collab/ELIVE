/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { X, Database, FileSpreadsheet, HelpCircle, Code, Copy, Check, Info, AlertCircle, PlayCircle } from 'lucide-react';
import { SheetConfig, TruckData, SheetTestResult } from '../types';
import { GOOGLE_SHEET_TEMPLATE_ID, SAMPLE_SHEETS_HELP, GOOGLE_APPS_SCRIPT_CODE } from '../data/mockData';

interface SheetConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: SheetConfig;
  onSaveConfig: (newConfig: SheetConfig, csvUrl?: string) => void;
  isSheetConnected: boolean;
  onTestFetch: (csvUrl: string) => Promise<SheetTestResult>;
}

export default function SheetConfigModal({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  isSheetConnected,
  onTestFetch,
}: SheetConfigModalProps) {
  const [useMock, setUseMock] = useState<boolean>(false);
  const [spreadsheetUrl, setSpreadsheetUrl] = useState<string>(config.spreadsheetId || '');
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testStatus, setTestStatus] = useState<'none' | 'success' | 'failed'>('none');
  const [testResult, setTestResult] = useState<SheetTestResult | null>(null);
  const [copiedScript, setCopiedScript] = useState<boolean>(false);
  const [copiedCols, setCopiedCols] = useState<boolean>(false);

  // Synchronize internal state when the modal is opened or the config changes
  useEffect(() => {
    if (isOpen) {
      setUseMock(false);
      setSpreadsheetUrl(config.spreadsheetId || '');
      setTestStatus('none');
      setTestResult(null);
    }
  }, [isOpen, config]);

  if (!isOpen) return null;

  const handleCopyText = (text: string, setCopied: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTestAndSave = async () => {
    if (useMock) {
      onSaveConfig({
        ...config,
        useMockSimulator: true
      });
      onClose();
      return;
    }

    if (!spreadsheetUrl) {
      alert('กรุณากรอก URL ของ Google Sheet หรือ Published CSV');
      return;
    }

    setIsTesting(true);
    setTestStatus('none');
    setTestResult(null);

    // Extract CSV URL from standard spreadsheet link if needed
    let finalCsvUrl = spreadsheetUrl.trim();
    if (finalCsvUrl.includes('docs.google.com/spreadsheets')) {
      const isAlreadyCsv = finalCsvUrl.includes('output=csv') || finalCsvUrl.includes('format=csv');
      if (!isAlreadyCsv) {
        // Check if it's a published web link (has /d/e/)
        const deMatch = finalCsvUrl.match(/\/d\/e\/([a-zA-Z0-9-_]+)/);
        if (deMatch && deMatch[1]) {
          const publishId = deMatch[1];
          finalCsvUrl = `https://docs.google.com/spreadsheets/d/e/${publishId}/pub?output=csv`;
        } else {
          // Standard spreadsheet link, convert to the /export?format=csv endpoint (requires "Anyone with the link can view" / public)
          const dMatch = finalCsvUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
          if (dMatch && dMatch[1]) {
            const docId = dMatch[1];
            // Capture GID if specified in the URL to export the correct sheet/tab
            const gidMatch = finalCsvUrl.match(/[#&?]gid=([0-9]+)/);
            const gidParam = gidMatch ? `&gid=${gidMatch[1]}` : '';
            finalCsvUrl = `https://docs.google.com/spreadsheets/d/${docId}/export?format=csv${gidParam}`;
          } else if (finalCsvUrl.includes('/pubhtml') || finalCsvUrl.includes('/pub')) {
            finalCsvUrl = finalCsvUrl.split('/pub')[0] + '/pub?output=csv';
          }
        }
      }
    }

    const result = await onTestFetch(finalCsvUrl);
    setIsTesting(false);
    setTestResult(result);
    
    if (result.success) {
      setTestStatus('success');
      setTimeout(() => {
        onSaveConfig({
          ...config,
          spreadsheetId: finalCsvUrl,
          useMockSimulator: false
        }, finalCsvUrl);
        onClose();
      }, 1200);
    } else {
      setTestStatus('failed');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" id="sheet-config-modal-backdrop">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl overflow-hidden shadow-xl flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="p-3 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#1e3a8a]">
            <Database className="w-5 h-5" />
            <h2 className="font-sans font-extrabold text-xs text-slate-800 uppercase tracking-wider">
              Google Sheet Integration Setup
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 bg-white border border-slate-300 hover:bg-slate-50 text-slate-500 hover:text-slate-800 rounded transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4.5 custom-scrollbar">
          
          <div className="space-y-4 animate-fade-in">
              {/* URL Input Form */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-600 uppercase block">
                  1. วางลิงก์ Google Sheet หรือ Published CSV URL:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={spreadsheetUrl}
                    onChange={(e) => setSpreadsheetUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/your-id-here/edit"
                    className="flex-1 bg-white border border-slate-300 rounded px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 font-sans"
                  />
                </div>
                <span className="text-[10px] text-slate-400 leading-normal block font-semibold">
                  💡 แนะนำ: ใช้ลิงก์แชร์ของ Google Sheet ปกติ ระบบจะพยายามแปลงเป็น Link สำหรับดึงข้อมูลแบบ CSV ให้โดยอัตโนมัติ
                </span>
              </div>

              {/* Diagnostic Failure Card */}
              {testStatus === 'failed' && testResult && (
                <div className="bg-rose-50 border border-rose-200 rounded-lg p-3.5 space-y-2 text-rose-800 animate-fade-in">
                  <div className="flex items-start gap-1.5">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-rose-900">
                        วิเคราะห์สาเหตุความล้มเหลว (Diagnostic Report):
                      </p>
                      <p className="text-[11px] font-semibold text-rose-700 leading-relaxed mt-0.5">
                        {testResult.error}
                      </p>
                    </div>
                  </div>

                  {/* HTML Sign-in detected advice */}
                  {testResult.isHtml && (
                    <div className="bg-white border border-rose-100 rounded p-2.5 text-[11px] text-slate-700 space-y-1.5 leading-relaxed font-semibold">
                      <p className="font-bold text-rose-800 flex items-center gap-1">
                        🔑 วิธีแก้ไขสิทธิ์การแชร์ (สาเหตุหลัก):
                      </p>
                      <ol className="list-decimal list-inside pl-1 space-y-1 text-slate-600">
                        <li>ไปที่หน้า Google Sheet ของคุณ กดปุ่ม <strong className="text-slate-900">แชร์ (Share)</strong> สีน้ำเงินขวาบน</li>
                        <li>เปลี่ยนสถานะจาก <strong className="text-rose-600 font-bold">จำกัด (Restricted)</strong> เป็น <strong className="text-emerald-700 font-bold">ทุกคนที่มีลิงก์มีสิทธิ์อ่าน (Anyone with the link can view)</strong></li>
                        <li>กดคัดลอกลิงก์มาวางในระบบใหม่อีกครั้ง</li>
                      </ol>
                    </div>
                  )}

                  {/* Preview code if available */}
                  {testResult.rawTextPreview && (
                    <div className="bg-slate-900 text-slate-300 rounded p-2 text-[9.5px] font-mono overflow-x-auto max-h-20 border border-slate-200">
                      <p className="text-slate-400 border-b border-slate-800 pb-1 mb-1 uppercase font-bold text-[8.5px]">ตัวอย่างเนื้อหาที่ดึงได้จริง (Raw Preview):</p>
                      <pre className="whitespace-pre-wrap">{testResult.rawTextPreview}</pre>
                    </div>
                  )}
                </div>
              )}

              {/* Instructions steps */}
              <div className="bg-slate-50 rounded-lg p-3.5 border border-slate-200 text-slate-700 space-y-2.5">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <HelpCircle className="w-4 h-4 text-[#1e3a8a]" />
                  ขั้นตอนการแชร์ Google Sheet ให้ดึงข้อมูลได้:
                </span>
                <ol className="text-[11px] space-y-1.5 text-slate-600 list-decimal list-inside pl-1 leading-relaxed font-semibold">
                  <li>เปิดไฟล์ Google Sheet ของคุณขึ้นมา</li>
                  <li>ไปที่เมนู <strong className="text-slate-900">File &gt; Share &gt; Publish to web</strong> (ไฟล์ &gt; แชร์ &gt; เผยแพร่ทางเว็บ)</li>
                  <li>เลือกแผ่นงานที่เก็บพิกัดรถบรรทุก แล้วเปลี่ยนรูปแบบจาก Web Page เป็น <strong className="text-emerald-700 font-bold">Comma-separated values (.csv)</strong></li>
                  <li>กดปุ่ม <strong className="text-slate-950 font-bold">Publish</strong> แล้วคัดลอกลิงก์นั้นมาวางในช่องด้านบน</li>
                </ol>

                <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-[10.5px]">
                  <span className="text-slate-500 font-semibold">ตรวจสอบหัวตาราง คอลัมน์ที่รองรับใน Sheet:</span>
                  <button
                    onClick={() => handleCopyText(SAMPLE_SHEETS_HELP, setCopiedCols)}
                    className="text-[10px] text-emerald-600 hover:text-emerald-800 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    {copiedCols ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 text-emerald-500" />}
                    <span>คัดลอกโครงสร้างคอลัมน์</span>
                  </button>
                </div>
              </div>

              {/* Google Apps Script code exporter */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-slate-600 uppercase flex items-center gap-1.5">
                    <Code className="w-4 h-4 text-blue-600" />
                    2. สคริปต์ Google Apps Script (Webhook รับสัญญาณพิกัด GPS):
                  </label>
                  <button
                    onClick={() => handleCopyText(GOOGLE_APPS_SCRIPT_CODE, setCopiedScript)}
                    className="text-[10px] text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    {copiedScript ? <Check className="w-3 h-3 text-blue-500" /> : <Copy className="w-3 h-3 text-blue-500" />}
                    <span>คัดลอก Code สคริปต์</span>
                  </button>
                </div>
                <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200 text-[10px] font-mono text-slate-600 max-h-24 overflow-y-auto">
                  <pre>{GOOGLE_APPS_SCRIPT_CODE}</pre>
                </div>
                <span className="text-[10px] text-slate-400 font-semibold leading-relaxed block">
                  ใช้สคริปต์นี้เพื่อรับข้อมูล JSON พิกัดจากเครื่องสแกน GPS ติดรถยนต์หรือ API ภายนอก แล้วบันทึกลงในแถวของ Google Sheet โดยตรงแบบอัตโนมัติ
                </span>
              </div>
            </div>
          </div>

        {/* Modal Actions Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {testStatus === 'success' && (
              <span className="text-[11px] text-emerald-600 font-sans font-bold flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> เชื่อมข้อมูลสำเร็จ! กำลังอัปเดต...
              </span>
            )}
            {testStatus === 'failed' && (
              <span className="text-[11px] text-rose-600 font-sans font-bold flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" /> เชื่อมต่อล้มเหลว โปรดเช็คลิงก์แชร์ CSV
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={onClose}
              className="bg-white hover:bg-slate-50 text-slate-600 border border-slate-300 rounded py-1.5 px-3.5 text-xs font-bold cursor-pointer transition-all"
            >
              ยกเลิก
            </button>
            <button
              onClick={handleTestAndSave}
              disabled={isTesting}
              className="bg-[#1e3a8a] hover:bg-[#1a3275] text-white rounded py-1.5 px-4 text-xs font-bold cursor-pointer transition-all flex items-center gap-1"
            >
              {isTesting ? 'กำลังเชื่อมต่อ...' : 'ทดสอบและเชื่อมข้อมูล'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

