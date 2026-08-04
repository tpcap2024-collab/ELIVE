import {
  ChangeEvent,
  DragEvent,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Search,
  Sheet,
  Upload,
  X,
  XCircle,
} from 'lucide-react';

import * as XLSX from 'xlsx';

import {
  createPlanPeriod,
  fetchMasterPlan,
  MasterPlanRow,
  MasterPlanValidationError,
  PlanCreationResult,
  PlanPeriodPreview,
  PlanSource,
  previewPlanPeriod,
} from '../lib/sheets';

interface PlanManagementProps {
  onPlanCreated?: (
    result: PlanCreationResult
  ) => void | Promise<void>;
}

interface NoticeState {
  type: 'success' | 'error' | 'info';
  message: string;
}

interface WorkingDayOption {
  value: number;
  shortLabel: string;
  fullLabel: string;
}

const WORKING_DAY_OPTIONS: WorkingDayOption[] = [
  { value: 1, shortLabel: 'จ.', fullLabel: 'จันทร์' },
  { value: 2, shortLabel: 'อ.', fullLabel: 'อังคาร' },
  { value: 3, shortLabel: 'พ.', fullLabel: 'พุธ' },
  { value: 4, shortLabel: 'พฤ.', fullLabel: 'พฤหัสบดี' },
  { value: 5, shortLabel: 'ศ.', fullLabel: 'ศุกร์' },
  { value: 6, shortLabel: 'ส.', fullLabel: 'เสาร์' },
  { value: 7, shortLabel: 'อา.', fullLabel: 'อาทิตย์' },
];

const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5, 6];
const ACCEPTED_EXTENSIONS = ['xlsx', 'xls', 'csv'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_TEMPLATE_ROWS = 500;

const HEADER_ALIASES: Record<keyof Omit<MasterPlanRow, 'sheetRow'>, string[]> = {
  route: ['route', 'รหัสเส้นทาง', 'เส้นทาง'],
  company: ['company', 'supplier', 'suppliername', 'บริษัท'],
  truckName: ['truckname', 'licenseplate', 'plate', 'ทะเบียนรถ'],
  truckType: ['trucktype', 'ประเภททรัค', 'ประเภทรถ'],
  driverName: ['drivername', 'driver', 'ชื่อคนขับ', 'ชื่อผู้ขับขี่'],
  telDriver: ['teldriver', 'driverphone', 'phone', 'เบอร์โทร', 'เบอร์คนขับ'],
  project: ['project', 'โครงการ'],
  dropPoint: ['droppoint', 'dock', 'doc', 'จุดลงงาน', 'จุดส่งงาน'],
  planEta: ['planeta', 'eta', 'เวลาเข้า'],
  planEtd: ['planetd', 'etd', 'เวลาออก'],
};

function getBangkokDateText(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function cleanHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-./()]+/g, '');
}

function cleanCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function normalizeTime(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';

  if (typeof value === 'number' && Number.isFinite(value)) {
    const totalMinutes = Math.round(value * 24 * 60) % (24 * 60);
    return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(
      totalMinutes % 60
    ).padStart(2, '0')}`;
  }

  const text = String(value).trim();
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return '';

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return '';
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : String(error || 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ');
}

function getExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() || '';
}

function findColumnIndex(headers: string[], aliases: string[]): number {
  const normalizedAliases = aliases.map(cleanHeader);
  return headers.findIndex((header) => normalizedAliases.includes(header));
}

function parseTemplateRows(rawRows: unknown[][]): {
  rows: MasterPlanRow[];
  validationErrors: MasterPlanValidationError[];
} {
  if (rawRows.length < 2) {
    throw new Error('ไฟล์ต้องมีหัวตารางและข้อมูล Plan อย่างน้อย 1 แถว');
  }

  const headers = rawRows[0].map(cleanHeader);
  const columnIndexes = {
    route: findColumnIndex(headers, HEADER_ALIASES.route),
    company: findColumnIndex(headers, HEADER_ALIASES.company),
    truckName: findColumnIndex(headers, HEADER_ALIASES.truckName),
    truckType: findColumnIndex(headers, HEADER_ALIASES.truckType),
    driverName: findColumnIndex(headers, HEADER_ALIASES.driverName),
    telDriver: findColumnIndex(headers, HEADER_ALIASES.telDriver),
    project: findColumnIndex(headers, HEADER_ALIASES.project),
    dropPoint: findColumnIndex(headers, HEADER_ALIASES.dropPoint),
    planEta: findColumnIndex(headers, HEADER_ALIASES.planEta),
    planEtd: findColumnIndex(headers, HEADER_ALIASES.planEtd),
  };

  const missingHeaders = Object.entries(columnIndexes)
    .filter(([, index]) => index < 0)
    .map(([key]) => key);

  if (missingHeaders.length > 0) {
    throw new Error(`ไม่พบคอลัมน์ที่จำเป็น: ${missingHeaders.join(', ')}`);
  }

  const rows: MasterPlanRow[] = [];
  const validationErrors: MasterPlanValidationError[] = [];

  rawRows.slice(1, MAX_TEMPLATE_ROWS + 1).forEach((rawRow, index) => {
    const sheetRow = index + 2;
    const row: MasterPlanRow = {
      sheetRow,
      route: cleanCell(rawRow[columnIndexes.route]),
      company: cleanCell(rawRow[columnIndexes.company]),
      truckName: cleanCell(rawRow[columnIndexes.truckName]),
      truckType: cleanCell(rawRow[columnIndexes.truckType]),
      driverName: cleanCell(rawRow[columnIndexes.driverName]),
      telDriver: cleanCell(rawRow[columnIndexes.telDriver]),
      project: cleanCell(rawRow[columnIndexes.project]),
      dropPoint: cleanCell(rawRow[columnIndexes.dropPoint]),
      planEta: normalizeTime(rawRow[columnIndexes.planEta]),
      planEtd: normalizeTime(rawRow[columnIndexes.planEtd]),
    };

    const isEmpty = Object.entries(row).every(([key, value]) =>
      key === 'sheetRow' || value === ''
    );
    if (isEmpty) return;

    const errors: string[] = [];
    if (!row.route) errors.push('Route ว่าง');
    if (!row.company) errors.push('Company ว่าง');
    if (!row.truckName) errors.push('Truck Name ว่าง');
    if (!row.truckType) errors.push('Truck Type ว่าง');
    if (!row.project) errors.push('Project ว่าง');
    if (!row.dropPoint) errors.push('Drop Point ว่าง');
    if (!row.planEta) errors.push('Plan ETA ว่างหรือรูปแบบไม่ถูกต้อง');
    if (!row.planEtd) errors.push('Plan ETD ว่างหรือรูปแบบไม่ถูกต้อง');

    if (errors.length > 0) validationErrors.push({ sheetRow, errors });
    rows.push(row);
  });

  if (rows.length === 0) throw new Error('ไม่พบข้อมูล Plan ในไฟล์');
  return { rows, validationErrors };
}

async function readPlanFile(file: File): Promise<unknown[][]> {
  const extension = getExtension(file.name);
  if (!ACCEPTED_EXTENSIONS.includes(extension)) {
    throw new Error('รองรับเฉพาะไฟล์ .xlsx, .xls และ .csv');
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error('ไฟล์ต้องมีขนาดไม่เกิน 5 MB');
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error('ไม่พบ Worksheet ในไฟล์');

  return XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[firstSheetName], {
    header: 1,
    raw: true,
    defval: '',
    blankrows: false,
  });
}

function StatCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  tone?: 'default' | 'success' | 'warning' | 'primary';
}) {
  const classes = {
    default: 'border-slate-200 bg-white text-slate-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-800',
    primary: 'border-blue-200 bg-blue-50 text-blue-800',
  };

  return (
    <div className={`rounded-xl border p-4 shadow-sm ${classes[tone]}`}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

export default function PlanManagement({ onPlanCreated }: PlanManagementProps) {
  const today = useMemo(() => getBangkokDateText(), []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [source, setSource] = useState<PlanSource | null>(null);
  const [templateRows, setTemplateRows] = useState<MasterPlanRow[]>([]);
  const [validationErrors, setValidationErrors] = useState<MasterPlanValidationError[]>([]);
  const [fileName, setFileName] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [workingDays, setWorkingDays] = useState<number[]>(DEFAULT_WORKING_DAYS);
  const [preview, setPreview] = useState<PlanPeriodPreview | null>(null);
  const [creationResult, setCreationResult] = useState<PlanCreationResult | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [searchText, setSearchText] = useState('');
  const [isLoadingSource, setIsLoadingSource] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const selectedWorkingDays = useMemo(
    () => [...new Set(workingDays)].sort((a, b) => a - b),
    [workingDays]
  );

  const filteredRows = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return templateRows;
    return templateRows.filter((row) =>
      [
        row.route,
        row.company,
        row.truckName,
        row.truckType,
        row.driverName,
        row.project,
        row.dropPoint,
      ].some((value) => String(value || '').toLowerCase().includes(query))
    );
  }, [templateRows, searchText]);

  const isBusy = isLoadingSource || isPreviewing || isCreating;
  const canPreview = Boolean(
    source &&
      templateRows.length > 0 &&
      validationErrors.length === 0 &&
      startDate &&
      endDate &&
      selectedWorkingDays.length > 0 &&
      !isBusy
  );

  const resetCalculation = () => {
    setPreview(null);
    setCreationResult(null);
    setShowConfirmation(false);
  };

  const clearSource = () => {
    setSource(null);
    setTemplateRows([]);
    setValidationErrors([]);
    setFileName('');
    setSearchText('');
    setNotice(null);
    resetCalculation();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const loadMasterPlan = async () => {
    setIsLoadingSource(true);
    setNotice(null);
    resetCalculation();

    try {
      const result = await fetchMasterPlan(true);
      setSource('master-plan');
      setTemplateRows(result.rows);
      setValidationErrors(result.validationErrors);
      setFileName('Master Plan');
      setNotice({
        type: result.validationErrors.length ? 'error' : 'success',
        message: result.validationErrors.length
          ? `Master Plan มีข้อมูลที่ต้องแก้ไข ${result.validationErrors.length} แถว`
          : `โหลด Master Plan สำเร็จ ${result.rowCount} เที่ยวต่อวัน`,
      });
    } catch (error) {
      setNotice({ type: 'error', message: getErrorMessage(error) });
    } finally {
      setIsLoadingSource(false);
    }
  };

  const handleFile = async (file: File) => {
    setIsLoadingSource(true);
    setNotice(null);
    resetCalculation();

    try {
      const rawRows = await readPlanFile(file);
      const result = parseTemplateRows(rawRows);
      setSource('uploaded-file');
      setTemplateRows(result.rows);
      setValidationErrors(result.validationErrors);
      setFileName(file.name);
      setNotice({
        type: result.validationErrors.length ? 'error' : 'success',
        message: result.validationErrors.length
          ? `ไฟล์มีข้อมูลที่ต้องแก้ไข ${result.validationErrors.length} แถว`
          : `อ่านไฟล์สำเร็จ ${result.rows.length} เที่ยวต่อวัน`,
      });
    } catch (error) {
      setSource(null);
      setTemplateRows([]);
      setValidationErrors([]);
      setFileName('');
      setNotice({ type: 'error', message: getErrorMessage(error) });
    } finally {
      setIsLoadingSource(false);
    }
  };

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void handleFile(file);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const toggleWorkingDay = (day: number) => {
    setWorkingDays((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day].sort((a, b) => a - b)
    );
    resetCalculation();
  };

  const buildRequest = () => ({
    startDate,
    endDate,
    workingDays: selectedWorkingDays,
    source: source || 'master-plan',
    templateRows: source === 'uploaded-file' ? templateRows : undefined,
    fileName: source === 'uploaded-file' ? fileName : undefined,
  });

  const handlePreview = async () => {
    if (!canPreview) return;
    if (endDate < startDate) {
      setNotice({ type: 'error', message: 'วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่มต้น' });
      return;
    }

    setIsPreviewing(true);
    setNotice(null);
    setCreationResult(null);

    try {
      const result = await previewPlanPeriod(buildRequest());
      setPreview(result);
      setNotice({
        type: result.newRowCount > 0 ? 'success' : 'info',
        message:
          result.newRowCount > 0
            ? `Preview สำเร็จ พบรายการใหม่ ${result.newRowCount} รายการ`
            : 'รายการทั้งหมดมีอยู่ใน Plan แล้ว ไม่มีรายการใหม่',
      });
    } catch (error) {
      setPreview(null);
      setNotice({ type: 'error', message: getErrorMessage(error) });
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleCreate = async () => {
    if (!preview || preview.newRowCount <= 0) return;

    setShowConfirmation(false);
    setIsCreating(true);
    setNotice(null);

    try {
      const result = await createPlanPeriod(buildRequest());
      setCreationResult(result);
      setNotice({ type: 'success', message: `สร้าง Plan สำเร็จ ${result.createdRowCount} รายการ` });
      setPreview(await previewPlanPeriod(buildRequest()));
      if (onPlanCreated) await onPlanCreated(result);
    } catch (error) {
      setNotice({ type: 'error', message: getErrorMessage(error) });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-full bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-4 bg-gradient-to-r from-blue-700 to-blue-600 px-5 py-5 text-white sm:px-6">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-white/15 p-3 ring-1 ring-white/25">
                <ClipboardList className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold sm:text-2xl">Plan Management</h1>
                <p className="mt-1 text-sm text-blue-100">
                  เลือก Master Plan หรืออัปโหลดไฟล์แผน 1 วัน แล้วสร้างตามช่วงวันที่
                </p>
              </div>
            </div>

            {source && (
              <button
                type="button"
                onClick={clearSource}
                disabled={isBusy}
                className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20 disabled:opacity-60"
              >
                <X className="h-4 w-4" /> เปลี่ยนแหล่งข้อมูล
              </button>
            )}
          </div>

          {!source ? (
            <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-2">
              <button
                type="button"
                onClick={() => void loadMasterPlan()}
                disabled={isLoadingSource}
                className="group rounded-2xl border-2 border-blue-200 bg-blue-50 p-7 text-left transition hover:border-blue-500 hover:bg-blue-100 disabled:opacity-60"
              >
                <div className="flex items-start gap-4">
                  <div className="rounded-xl bg-blue-600 p-3 text-white">
                    {isLoadingSource ? <Loader2 className="h-7 w-7 animate-spin" /> : <Sheet className="h-7 w-7" />}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-blue-900">โหลดจากแผนเดิม</h2>
                    <p className="mt-2 text-sm leading-6 text-blue-700">
                      อ่านข้อมูลล่าสุดจากชีต Master Plan เมื่อกดปุ่มเท่านั้น
                    </p>
                  </div>
                </div>
              </button>

              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`rounded-2xl border-2 border-dashed p-7 transition ${
                  isDragging
                    ? 'border-emerald-500 bg-emerald-100'
                    : 'border-emerald-200 bg-emerald-50 hover:border-emerald-500 hover:bg-emerald-100'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileInput}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoadingSource}
                  className="flex w-full items-start gap-4 text-left disabled:opacity-60"
                >
                  <div className="rounded-xl bg-emerald-600 p-3 text-white">
                    {isLoadingSource ? <Loader2 className="h-7 w-7 animate-spin" /> : <Upload className="h-7 w-7" />}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-emerald-900">อัปโหลดไฟล์ Plan</h2>
                    <p className="mt-2 text-sm leading-6 text-emerald-700">
                      รองรับ .xlsx, .xls, .csv ขนาดไม่เกิน 5 MB หรือวางไฟล์ในพื้นที่นี้
                    </p>
                  </div>
                </button>
              </div>
            </div>
          ) : (
            <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_1.2fr]">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-3">
                  <div className={`rounded-xl p-3 text-white ${source === 'master-plan' ? 'bg-blue-600' : 'bg-emerald-600'}`}>
                    {source === 'master-plan' ? <Sheet className="h-6 w-6" /> : <FileSpreadsheet className="h-6 w-6" />}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">
                      {source === 'master-plan' ? 'Master Plan' : 'Uploaded File'}
                    </p>
                    <p className="truncate text-sm text-slate-500">{fileName}</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <StatCard label="เที่ยวต่อวัน" value={templateRows.length} tone="primary" />
                  <StatCard
                    label="Validation"
                    value={validationErrors.length === 0 ? 'ผ่าน' : `${validationErrors.length} จุด`}
                    tone={validationErrors.length === 0 ? 'success' : 'warning'}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-5 w-5 text-blue-600" />
                  <h2 className="font-semibold text-slate-900">ช่วงวันที่สร้าง Plan</h2>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">วันที่เริ่มต้น</span>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(event) => {
                        setStartDate(event.target.value);
                        resetCalculation();
                      }}
                      disabled={isBusy}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">วันที่สิ้นสุด</span>
                    <input
                      type="date"
                      value={endDate}
                      min={startDate}
                      onChange={(event) => {
                        setEndDate(event.target.value);
                        resetCalculation();
                      }}
                      disabled={isBusy}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                    />
                  </label>
                </div>

                <div className="mt-5">
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="font-medium text-slate-700">วันทำงาน</span>
                    <span className="text-xs text-slate-500">ค่าเริ่มต้น จันทร์ถึงเสาร์</span>
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-7">
                    {WORKING_DAY_OPTIONS.map((day) => {
                      const selected = selectedWorkingDays.includes(day.value);
                      return (
                        <button
                          key={day.value}
                          type="button"
                          title={day.fullLabel}
                          onClick={() => toggleWorkingDay(day.value)}
                          disabled={isBusy}
                          className={`rounded-xl border px-2 py-2.5 text-sm font-semibold transition ${
                            selected
                              ? 'border-blue-600 bg-blue-600 text-white'
                              : 'border-slate-300 bg-white text-slate-600 hover:bg-blue-50'
                          }`}
                        >
                          {day.shortLabel}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    onClick={() => void handlePreview()}
                    disabled={!canPreview}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {isPreviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    Preview Plan
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        {notice && (
          <div className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${
            notice.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : notice.type === 'error'
                ? 'border-red-200 bg-red-50 text-red-800'
                : 'border-blue-200 bg-blue-50 text-blue-800'
          }`}>
            {notice.type === 'success' ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : notice.type === 'error' ? <XCircle className="h-5 w-5 shrink-0" /> : <RefreshCw className="h-5 w-5 shrink-0" />}
            <span>{notice.message}</span>
          </div>
        )}

        {validationErrors.length > 0 && (
          <section className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
            <div className="flex items-center gap-2 text-red-800">
              <AlertTriangle className="h-5 w-5" />
              <h2 className="font-semibold">กรุณาแก้ข้อมูลต้นแบบก่อน Preview</h2>
            </div>
            <div className="mt-3 max-h-56 space-y-2 overflow-auto">
              {validationErrors.map((item) => (
                <div key={item.sheetRow} className="rounded-lg bg-white px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
                  แถว {item.sheetRow}: {item.errors.join(', ')}
                </div>
              ))}
            </div>
          </section>
        )}

        {preview && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">ผล Preview</h2>
                <p className="mt-1 text-sm text-slate-500">รายการซ้ำจะถูกข้ามอัตโนมัติ</p>
              </div>
              <span className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600">
                {source === 'uploaded-file' ? fileName : 'Master Plan'}
              </span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="วันทำงาน" value={preview.workingDateCount} tone="primary" />
              <StatCard label="รายการทั้งหมด" value={preview.totalCandidateRows} />
              <StatCard label="รายการใหม่" value={preview.newRowCount} tone="success" />
              <StatCard label="รายการซ้ำ" value={preview.duplicateRowCount} tone="warning" />
            </div>

            <div className="mt-5 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
              <div><p className="text-xs text-slate-500">Code run สูงสุด</p><p className="mt-1 font-semibold">{preview.currentMaximumCodeRun}</p></div>
              <div><p className="text-xs text-slate-500">Code run เริ่มต้น</p><p className="mt-1 font-semibold text-blue-700">{preview.startCodeRun}</p></div>
              <div><p className="text-xs text-slate-500">Code run สุดท้าย</p><p className="mt-1 font-semibold text-blue-700">{preview.endCodeRun}</p></div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowConfirmation(true)}
                disabled={preview.newRowCount <= 0 || isBusy}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-slate-300"
              >
                <CheckCircle2 className="h-4 w-4" /> Create Plan
              </button>
            </div>
          </section>
        )}

        {creationResult && (
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
            <h2 className="font-bold text-emerald-900">สร้าง Plan สำเร็จ</h2>
            <p className="mt-1 text-sm text-emerald-800">
              สร้าง {creationResult.createdRowCount} รายการ ข้ามรายการซ้ำ {creationResult.duplicateRowCount} รายการ
            </p>
          </section>
        )}

        {source && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">ข้อมูลต้นแบบ</h2>
                <p className="mt-1 text-sm text-slate-500">แสดง {filteredRows.length} จาก {templateRows.length} รายการ</p>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="ค้นหา Route, ทะเบียน, คนขับ..."
                  className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </div>
            </div>

            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                  <tr>
                    {['Route', 'Company', 'Truck Name', 'Truck Type', 'Driver', 'Project', 'Drop Point', 'ETA', 'ETD'].map((heading) => (
                      <th key={heading} className="px-4 py-3">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredRows.map((row, index) => (
                    <tr key={`${row.sheetRow || index}-${row.route}-${row.truckName}`} className="hover:bg-blue-50/50">
                      <td className="whitespace-nowrap px-4 py-3 font-medium">{row.route}</td>
                      <td className="whitespace-nowrap px-4 py-3">{row.company}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-blue-700">{row.truckName}</td>
                      <td className="whitespace-nowrap px-4 py-3">{row.truckType}</td>
                      <td className="whitespace-nowrap px-4 py-3">{row.driverName || '-'}</td>
                      <td className="whitespace-nowrap px-4 py-3">{row.project}</td>
                      <td className="whitespace-nowrap px-4 py-3">{row.dropPoint}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium tabular-nums">{row.planEta}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium tabular-nums">{row.planEtd}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      {showConfirmation && preview && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-amber-100 p-2 text-amber-700"><AlertTriangle className="h-6 w-6" /></div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">ยืนยันการสร้าง Plan</h2>
                <p className="mt-1 text-sm text-slate-500">ระบบจะเขียนข้อมูลจริงลงชีต Plan</p>
              </div>
            </div>
            <div className="mt-5 space-y-3 rounded-xl bg-slate-50 p-4 text-sm">
              <div className="flex justify-between"><span>แหล่งข้อมูล</span><strong>{source === 'uploaded-file' ? fileName : 'Master Plan'}</strong></div>
              <div className="flex justify-between"><span>รายการใหม่</span><strong className="text-emerald-700">{preview.newRowCount}</strong></div>
              <div className="flex justify-between"><span>รายการซ้ำ</span><strong className="text-amber-700">{preview.duplicateRowCount}</strong></div>
              <div className="flex justify-between"><span>Code run</span><strong className="text-blue-700">{preview.startCodeRun} ถึง {preview.endCodeRun}</strong></div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setShowConfirmation(false)} disabled={isCreating} className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold">ยกเลิก</button>
              <button type="button" onClick={() => void handleCreate()} disabled={isCreating} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-slate-400">
                {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                ยืนยันสร้าง Plan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
