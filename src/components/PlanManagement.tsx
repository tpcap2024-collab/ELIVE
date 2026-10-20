import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Download,
  Edit3,
  FileSpreadsheet,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  Sheet,
  Trash2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import * as XLSX from 'xlsx';

import {
  cancelDailyPlan,
  createExtraPlan,
  createMasterPlanRow,
  createPlanPeriod,
  deleteMasterPlanRow,
  deleteDailyPlan,
  deleteDailyPlansBatch,
  fetchDailyPlans,
  fetchMasterPlan,
  previewPlanPeriod,
  restoreDailyPlan,
  updateDailyPlan,
  updateMasterPlanRow,
} from '../lib/sheets';

import type {
  DailyPlan,
  DailyPlansResult,
  EditableMasterPlanRow,
  EditablePlan,
  MasterPlanRow,
  MasterPlanValidationError,
  PlanCreationResult,
  PlanPeriodPreview,
  PlanRemark,
  PlanSource,
} from '../lib/sheets';

type MainTab = 'create' | 'daily';
type CreateView = 'source' | 'master';
type CreateStep = 'select' | 'loading' | 'preview' | 'creating' | 'completed';
type DailyFilter = 'ALL' | PlanRemark;
type PlanDialogMode = 'extra' | 'edit';
type MasterDialogMode = 'create' | 'edit';
type MasterImportMode = 'append' | 'replace';

type NoticeState = {
  type: 'success' | 'error' | 'info';
  message: string;
};

type PlanManagementProps = {
  onPlanCreated?: (
    result: PlanCreationResult
  ) => void | Promise<void>;
};

type FormFieldConfig<T extends string> = {
  field: T;
  label: string;
  type: 'text' | 'date' | 'time';
  required: boolean;
};

type DailyRefreshOptions = {
  showMessage?: boolean;
  clearResultOnError?: boolean;
};

const MAX_BATCH_DELETE_PLANS = 2000;
const MAX_DAILY_VIEW_DAYS = 6;
const OPERATION_BATCH_SIZE = 20;
const WORKING_DAYS = [
  { value: 1, short: 'จ.', full: 'จันทร์' },
  { value: 2, short: 'อ.', full: 'อังคาร' },
  { value: 3, short: 'พ.', full: 'พุธ' },
  { value: 4, short: 'พฤ.', full: 'พฤหัสบดี' },
  { value: 5, short: 'ศ.', full: 'ศุกร์' },
  { value: 6, short: 'ส.', full: 'เสาร์' },
  { value: 7, short: 'อา.', full: 'อาทิตย์' },
];

const EMPTY_PLAN: EditablePlan = {
  date: '',
  route: '',
  company: '',
  truckName: '',
  truckType: '',
  driverName: '',
  telDriver: '',
  project: '',
  dropPoint: '',
  planEta: '',
  planEtd: '',
  groupCode: '',
  remark: 'EXTRA',
  workDetail: '',
};

const EMPTY_MASTER_PLAN: EditableMasterPlanRow = {
  route: '',
  company: '',
  truckName: '',
  truckType: '',
  driverName: '',
  telDriver: '',
  project: '',
  dropPoint: '',
  planEta: '',
  planEtd: '',
  groupCode: '',
};

const PLAN_FORM_FIELDS: FormFieldConfig<keyof EditablePlan>[] = [
  { field: 'date', label: 'Date', type: 'date', required: true },
  { field: 'route', label: 'Route', type: 'text', required: true },
  { field: 'company', label: 'Company', type: 'text', required: true },
  { field: 'truckName', label: 'Truck Name', type: 'text', required: true },
  { field: 'truckType', label: 'Truck Type', type: 'text', required: true },
  { field: 'driverName', label: 'Driver Name', type: 'text', required: false },
  { field: 'telDriver', label: 'Tel Driver', type: 'text', required: false },
  { field: 'project', label: 'Project', type: 'text', required: true },
  { field: 'dropPoint', label: 'Drop Point', type: 'text', required: true },
  { field: 'planEta', label: 'Plan ETA', type: 'time', required: true },
  { field: 'planEtd', label: 'Plan ETD', type: 'time', required: true },
];

const MASTER_FORM_FIELDS: FormFieldConfig<keyof EditableMasterPlanRow>[] = [
  { field: 'route', label: 'Route', type: 'text', required: true },
  { field: 'company', label: 'Company', type: 'text', required: true },
  { field: 'truckName', label: 'Truck Name', type: 'text', required: true },
  { field: 'truckType', label: 'Truck Type', type: 'text', required: true },
  { field: 'driverName', label: 'Driver Name', type: 'text', required: false },
  { field: 'telDriver', label: 'Tel Driver', type: 'text', required: false },
  { field: 'project', label: 'Project', type: 'text', required: true },
  { field: 'dropPoint', label: 'Drop Point', type: 'text', required: true },
  { field: 'planEta', label: 'Plan ETA', type: 'time', required: true },
  { field: 'planEtd', label: 'Plan ETD', type: 'time', required: true },
  { field: 'groupCode', label: 'Group Code', type: 'text', required: false },
];

const HEADER_ALIASES: Record<
  keyof Omit<MasterPlanRow, 'sheetRow'>,
  string[]
> = {
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
  groupCode: ['groupcode', 'group', 'รหัสกลุ่ม', 'กลุ่มงาน'],
};

function getBangkokDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function addCalendarDays(dateText: string, days: number): string {
  const date = new Date(`${dateText}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return dateText;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function buildDateRange(startDate: string, endDate: string): string[] {
  if (!startDate || !endDate || endDate < startDate) return [];
  const dates: string[] = [];
  let current = startDate;
  while (current <= endDate && dates.length < MAX_DAILY_VIEW_DAYS) {
    dates.push(current);
    current = addCalendarDays(current, 1);
  }
  return dates;
}
function clampDailyEndDate(startDate: string, endDate: string): string {
  const maximumEndDate = addCalendarDays(startDate, MAX_DAILY_VIEW_DAYS - 1);
  if (!endDate || endDate < startDate) return startDate;
  return endDate > maximumEndDate ? maximumEndDate : endDate;
}
function getErrorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : String(error || 'เกิดข้อผิดพลาด');
}

function cleanHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-./()]+/g, '');
}

function cleanCell(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeTime(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const rawMinutes = Math.round(value * 1440);
    const minutes = ((rawMinutes % 1440) + 1440) % 1440;
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(
      minutes % 60
    ).padStart(2, '0')}`;
  }

  const match = String(value ?? '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return '';

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return '';

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function findColumn(headers: string[], aliases: string[]): number {
  const possibleHeaders = aliases.map(cleanHeader);
  return headers.findIndex(header => possibleHeaders.includes(header));
}

function validateMasterRow(row: EditableMasterPlanRow): string[] {
  const errors: string[] = [];
  if (!row.route.trim()) errors.push('Route ว่าง');
  if (!row.company.trim()) errors.push('Company ว่าง');
  if (!row.truckName.trim()) errors.push('Truck Name ว่าง');
  if (!row.truckType.trim()) errors.push('Truck Type ว่าง');
  if (!row.project.trim()) errors.push('Project ว่าง');
  if (!row.dropPoint.trim()) errors.push('Drop Point ว่าง');
  if (!normalizeTime(row.planEta)) errors.push('Plan ETA ไม่ถูกต้อง');
  if (!normalizeTime(row.planEtd)) errors.push('Plan ETD ไม่ถูกต้อง');
  return errors;
}

function parseTemplateRows(rawRows: unknown[][]): {
  rows: MasterPlanRow[];
  validationErrors: MasterPlanValidationError[];
} {
  if (rawRows.length < 2) {
    throw new Error('ไฟล์ต้องมีหัวตารางและข้อมูลอย่างน้อย 1 แถว');
  }

  const headers = rawRows[0].map(cleanHeader);
  const indexes = Object.fromEntries(
    Object.entries(HEADER_ALIASES).map(([key, aliases]) => [
      key,
      findColumn(headers, aliases),
    ])
  ) as Record<keyof Omit<MasterPlanRow, 'sheetRow'>, number>;

  const missingColumns = Object.entries(indexes)
    .filter(([key, index]) => key !== 'groupCode' && index < 0)
    .map(([key]) => key);

  if (missingColumns.length) {
    throw new Error(`ไม่พบคอลัมน์ที่จำเป็น: ${missingColumns.join(', ')}`);
  }

  const rows: MasterPlanRow[] = [];
  const validationErrors: MasterPlanValidationError[] = [];

  rawRows.slice(1, 501).forEach((rawRow, index) => {
    const sheetRow = index + 2;
    const row: MasterPlanRow = {
      sheetRow,
      route: cleanCell(rawRow[indexes.route]),
      company: cleanCell(rawRow[indexes.company]),
      truckName: cleanCell(rawRow[indexes.truckName]),
      truckType: cleanCell(rawRow[indexes.truckType]),
      driverName: cleanCell(rawRow[indexes.driverName]),
      telDriver: cleanCell(rawRow[indexes.telDriver]),
      project: cleanCell(rawRow[indexes.project]),
      dropPoint: cleanCell(rawRow[indexes.dropPoint]),
      planEta: normalizeTime(rawRow[indexes.planEta]),
      planEtd: normalizeTime(rawRow[indexes.planEtd]),
      groupCode: indexes.groupCode >= 0 ? cleanCell(rawRow[indexes.groupCode]) : '',
    };

    const values = Object.entries(row).filter(([key]) => key !== 'sheetRow');
    if (values.every(([, value]) => value === '')) return;

    const errors = validateMasterRow(row);
    if (errors.length) validationErrors.push({ sheetRow, errors });
    rows.push(row);
  });

  if (!rows.length) throw new Error('ไม่พบข้อมูล Plan ในไฟล์');
  return { rows, validationErrors };
}

async function readPlanFile(file: File): Promise<unknown[][]> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension || !['xlsx', 'xls', 'csv'].includes(extension)) {
    throw new Error('รองรับเฉพาะไฟล์ .xlsx, .xls และ .csv');
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('ไฟล์ต้องมีขนาดไม่เกิน 5 MB');
  }

  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName || !workbook.Sheets[firstSheetName]) {
    throw new Error('ไม่พบ Worksheet ในไฟล์');
  }

  return XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[firstSheetName], {
    header: 1,
    raw: true,
    defval: '',
    blankrows: false,
  });
}

function buildMasterWorkbook(rows: MasterPlanRow[]) {
  const headers=['Route','Company','Truck Name','Truck type','Driver name','Tel driver','Project','Doc','Plan ETA','Plan ETD','Group Code'];
  const body=rows.map(row=>[row.route,row.company,row.truckName,row.truckType,row.driverName,row.telDriver,row.project,row.dropPoint,row.planEta,row.planEtd,String(row.groupCode||'')]);
  const workbook=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([headers,...body]),'Master Plan'); return workbook;
}
async function runInBatches<T>(items:T[],worker:(item:T)=>Promise<unknown>){for(let i=0;i<items.length;i+=OPERATION_BATCH_SIZE)await Promise.all(items.slice(i,i+OPERATION_BATCH_SIZE).map(worker));}
function StatCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  tone?: 'default' | 'blue' | 'green' | 'amber' | 'red' | 'purple';
}) {
  const tones = {
    default: 'border-slate-200 bg-white text-slate-900',
    blue: 'border-blue-200 bg-blue-50 text-blue-800',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    red: 'border-red-200 bg-red-50 text-red-800',
    purple: 'border-purple-200 bg-purple-50 text-purple-800',
  };

  return (
    <div className={`rounded-xl border p-4 shadow-sm ${tones[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function RemarkBadge({ remark }: { remark: PlanRemark }) {
  const classes: Record<PlanRemark, string> = {
    REGULAR: 'bg-blue-100 text-blue-700',
    EXTRA: 'bg-purple-100 text-purple-700',
    CANCEL: 'bg-red-100 text-red-700',
  };

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${classes[remark]}`}>
      {remark}
    </span>
  );
}

function Notice({ notice }: { notice: NoticeState }) {
  const classes =
    notice.type === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : notice.type === 'error'
        ? 'border-red-200 bg-red-50 text-red-800'
        : 'border-blue-200 bg-blue-50 text-blue-800';

  return (
    <div className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${classes}`}>
      {notice.type === 'success' ? (
        <CheckCircle2 className="h-5 w-5 shrink-0" />
      ) : notice.type === 'error' ? (
        <XCircle className="h-5 w-5 shrink-0" />
      ) : (
        <RefreshCw className="h-5 w-5 shrink-0" />
      )}
      <span>{notice.message}</span>
    </div>
  );
}

export default function PlanManagement({ onPlanCreated }: PlanManagementProps) {
  const today = useMemo(getBangkokDate, []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const masterImportInputRef = useRef<HTMLInputElement>(null);
  const batchDeleteRunningRef = useRef(false);

  const [tab, setTab] = useState<MainTab>('create');
  const [createView, setCreateView] = useState<CreateView>('source');
  const [notice, setNotice] = useState<NoticeState | null>(null);

  const [source, setSource] = useState<PlanSource | null>(null);
  const [templateRows, setTemplateRows] = useState<MasterPlanRow[]>([]);
  const [validationErrors, setValidationErrors] = useState<MasterPlanValidationError[]>([]);
  const [fileName, setFileName] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [preview, setPreview] = useState<PlanPeriodPreview | null>(null);
  const [creationResult, setCreationResult] = useState<PlanCreationResult | null>(null);
  const [createStep, setCreateStep] = useState<CreateStep>('select');
  const [templateSearch, setTemplateSearch] = useState('');
  const [isLoadingSource, setIsLoadingSource] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showCreateConfirmation, setShowCreateConfirmation] = useState(false);

  const [dailyDate, setDailyDate] = useState(today);
  const [dailyEndDate, setDailyEndDate] = useState(today);
  const [dailyResult, setDailyResult] = useState<DailyPlansResult | null>(null);
  const [dailySearch, setDailySearch] = useState('');
  const [dailyFilter, setDailyFilter] = useState<DailyFilter>('ALL');
  const [isLoadingDaily, setIsLoadingDaily] = useState(false);
  const [planDialogMode, setPlanDialogMode] = useState<PlanDialogMode | null>(null);
  const [editingCodeRun, setEditingCodeRun] = useState('');
  const [planForm, setPlanForm] = useState<EditablePlan>({ ...EMPTY_PLAN, date: today });
  const [isSavingPlan, setIsSavingPlan] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<DailyPlan | null>(null);
  const [deletePlanTarget, setDeletePlanTarget] = useState<DailyPlan | null>(null);
  const [selectedPlanCodes, setSelectedPlanCodes] = useState<string[]>([]);
  const [showBatchDeleteConfirmation, setShowBatchDeleteConfirmation] = useState(false);
  const [showBatchCancelConfirmation,setShowBatchCancelConfirmation]=useState(false);
  const [restoreTarget, setRestoreTarget] = useState<DailyPlan | null>(null);

  const [masterRows, setMasterRows] = useState<MasterPlanRow[]>([]);
  const [masterValidationErrors, setMasterValidationErrors] = useState<MasterPlanValidationError[]>([]);
  const [masterSearch, setMasterSearch] = useState('');
  const [isLoadingMaster, setIsLoadingMaster] = useState(false);
  const [isSavingMaster, setIsSavingMaster] = useState(false);
  const [masterDialogMode, setMasterDialogMode] = useState<MasterDialogMode | null>(null);
  const [editingMasterSheetRow, setEditingMasterSheetRow] = useState<number | null>(null);
  const [masterForm, setMasterForm] = useState<EditableMasterPlanRow>({ ...EMPTY_MASTER_PLAN });
  const [deleteMasterTarget, setDeleteMasterTarget] = useState<MasterPlanRow | null>(null);
  const [selectedMasterRows, setSelectedMasterRows] = useState<number[]>([]);
  const [showDeleteSelectedMaster, setShowDeleteSelectedMaster] = useState(false);
  const [showClearAllMaster, setShowClearAllMaster] = useState(false);
  const [showMasterImport,setShowMasterImport]=useState(false);
  const [masterImportMode,setMasterImportMode]=useState<MasterImportMode>('append');
  const [masterImportRows,setMasterImportRows]=useState<MasterPlanRow[]>([]);
  const [masterImportErrors,setMasterImportErrors]=useState<MasterPlanValidationError[]>([]);
  const [isImportingMaster,setIsImportingMaster]=useState(false);

  const selectedWorkingDays = useMemo(
    () => [...new Set(workingDays)].sort((a, b) => a - b),
    [workingDays]
  );

  const previewRows = useMemo(() => {
    if (!preview || !templateRows.length) return [];
    const workingDates = buildDateRange(startDate, endDate).filter(date =>
      selectedWorkingDays.includes(new Date(`${date}T00:00:00Z`).getUTCDay() || 7)
    );
    const startNumber = Number(String(preview.startCodeRun || '').replace(/\D/g, '')) || 0;
    let sequence = 0;
    return workingDates.flatMap(date =>
      templateRows.map(row => {
        const codeRun = startNumber
          ? `A${String(startNumber + sequence).padStart(4, '0')}`
          : '-';
        sequence += 1;
        return { date, codeRun, row };
      })
    );
  }, [preview, templateRows, startDate, endDate, selectedWorkingDays]);

  const filteredTemplateRows = useMemo(() => {
    const query = templateSearch.trim().toLowerCase();
    if (!query) return templateRows;
    return templateRows.filter(row =>
      [row.route, row.company, row.truckName, row.driverName, row.project, row.dropPoint, row.groupCode]
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }, [templateRows, templateSearch]);

  const filteredDailyRows = useMemo(() => {
    const query = dailySearch.trim().toLowerCase();
    return (dailyResult?.rows || []).filter(row => {
      const matchesFilter = dailyFilter === 'ALL' || row.remark === dailyFilter;
      const matchesSearch =
        !query ||
        [row.codeRun, row.route, row.company, row.truckName, row.driverName, row.dropPoint, row.workDetail]
          .join(' ')
          .toLowerCase()
          .includes(query);
      return matchesFilter && matchesSearch;
    });
  }, [dailyResult, dailyFilter, dailySearch]);

  const displayedPlanCodes = useMemo(
    () => filteredDailyRows.map(plan => plan.codeRun),
    [filteredDailyRows]
  );
  const allDisplayedPlansSelected = displayedPlanCodes.length > 0 &&
    displayedPlanCodes.every(codeRun => selectedPlanCodes.includes(codeRun));
  const toggleSelectPlan = (codeRun: string) => {
    setSelectedPlanCodes(current => {
      if (current.includes(codeRun)) return current.filter(item => item !== codeRun);
      if (current.length >= MAX_BATCH_DELETE_PLANS) {
        setNotice({ type: 'info', message: 'เลือกได้สูงสุด 2000 รายการต่อครั้ง' });
        return current;
      }
      return [...current, codeRun];
    });
  };
  const toggleSelectAllDisplayed = () => {
    setSelectedPlanCodes(current => {
      if (allDisplayedPlansSelected) {
        return current.filter(codeRun => !displayedPlanCodes.includes(codeRun));
      }
      const availableSlots = Math.max(0, MAX_BATCH_DELETE_PLANS - current.length);
      const newCodes = displayedPlanCodes.filter(codeRun => !current.includes(codeRun));
      const next = [...current, ...newCodes.slice(0, availableSlots)];
      if (newCodes.length > availableSlots) {
        setNotice({ type: 'info', message: 'เลือกได้สูงสุด 2000 รายการต่อครั้ง ระบบเลือกให้ครบ 2000 รายการแล้ว' });
      }
      return next;
    });
  };
  const filteredMasterRows = useMemo(() => {
    const query = masterSearch.trim().toLowerCase();
    if (!query) return masterRows;
    return masterRows.filter(row =>
      [
        row.sheetRow,
        row.route,
        row.company,
        row.truckName,
        row.truckType,
        row.driverName,
        row.telDriver,
        row.project,
        row.dropPoint,
        row.groupCode,
      ]
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }, [masterRows, masterSearch]);
  const displayedMasterSheetRows = useMemo(
    () => filteredMasterRows
      .map(row => Number(row.sheetRow))
      .filter(sheetRow => Number.isInteger(sheetRow) && sheetRow >= 2),
    [filteredMasterRows]
  );
  const allDisplayedMasterSelected = displayedMasterSheetRows.length > 0 &&
    displayedMasterSheetRows.every(sheetRow => selectedMasterRows.includes(sheetRow));
  const toggleSelectMasterRow = (sheetRow?: number) => {
    if (!sheetRow) return;
    setSelectedMasterRows(current => current.includes(sheetRow)
      ? current.filter(item => item !== sheetRow)
      : [...current, sheetRow]);
  };
  const toggleSelectAllDisplayedMaster = () => {
    setSelectedMasterRows(current => allDisplayedMasterSelected
      ? current.filter(sheetRow => !displayedMasterSheetRows.includes(sheetRow))
      : [...new Set([...current, ...displayedMasterSheetRows])]);
  };


  const planFieldOptions = useMemo(() => {
    const sources = [
      ...masterRows,
      ...(dailyResult?.rows || []),
      ...templateRows,
    ];
    const fields = [
      'route',
      'company',
      'truckName',
      'truckType',
      'driverName',
      'telDriver',
      'project',
      'dropPoint',
      'groupCode',
    ] as const;
    return Object.fromEntries(
      fields.map(field => [
        field,
        [...new Set(sources.map(row => String(row[field] || '').trim()).filter(Boolean))]
          .sort((first, second) => first.localeCompare(second, 'th')),
      ])
    ) as Record<(typeof fields)[number], string[]>;
  }, [dailyResult, masterRows, templateRows]);
  const createBusy = isLoadingSource || isPreviewing || isCreating;
  const canPreview = Boolean(
    source &&
      templateRows.length > 0 &&
      validationErrors.length === 0 &&
      startDate &&
      endDate &&
      selectedWorkingDays.length > 0 &&
      !createBusy
  );

  const resetCreateResult = () => {
    setPreview(null);
    setCreationResult(null);
    setShowCreateConfirmation(false);
  };

  const clearSource = () => {
    setSource(null);
    setTemplateRows([]);
    setValidationErrors([]);
    setFileName('');
    setTemplateSearch('');
    setNotice(null);
    setCreateStep('select');
    resetCreateResult();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const applyMasterResultToTemplate = (rows: MasterPlanRow[], errors: MasterPlanValidationError[]) => {
    if (source === 'master-plan') {
      setTemplateRows(rows);
      setValidationErrors(errors);
      resetCreateResult();
    }
  };

  const loadMasterRows = async (showMessage = true) => {
    setIsLoadingMaster(true);
    if (showMessage) setNotice(null);

    try {
      const result = await fetchMasterPlan(true);
      setMasterRows(result.rows);
      setMasterValidationErrors(result.validationErrors);
      applyMasterResultToTemplate(result.rows, result.validationErrors);

      if (showMessage) {
        setNotice({
          type: result.validationErrors.length ? 'error' : 'success',
          message: result.validationErrors.length
            ? `Master Plan มีข้อมูลที่ต้องแก้ไข ${result.validationErrors.length} แถว`
            : `โหลด Master Plan สำเร็จ ${result.rows.length} รายการ`,
        });
      }

      return result;
    } catch (error) {
      if (showMessage) setNotice({ type: 'error', message: getErrorMessage(error) });
      throw error;
    } finally {
      setIsLoadingMaster(false);
    }
  };

  const openMasterManagement = async () => {
    setCreateView('master');
    if (!masterRows.length) {
      try {
        await loadMasterRows(false);
      } catch (error) {
        setNotice({ type: 'error', message: getErrorMessage(error) });
      }
    }
  };

  const handleLoadMasterPlan = () => {
    setSource('master-plan');
    setTemplateRows([]);
    setValidationErrors([]);
    setFileName('Master Plan');
    setCreateStep('select');
    setNotice(null);
    resetCreateResult();
  };
  const handleFile = async (file: File) => {
    setIsLoadingSource(true);
    setNotice(null);
    resetCreateResult();

    try {
      const parsed = parseTemplateRows(await readPlanFile(file));
      setSource('uploaded-file');
      setTemplateRows(parsed.rows);
      setValidationErrors(parsed.validationErrors);
      setFileName(file.name);
      setNotice({
        type: parsed.validationErrors.length ? 'error' : 'success',
        message: parsed.validationErrors.length
          ? `ไฟล์มีข้อมูลที่ต้องแก้ไข ${parsed.validationErrors.length} แถว`
          : `อ่านไฟล์สำเร็จ ${parsed.rows.length} เที่ยวต่อวัน`,
      });
    } catch (error) {
      clearSource();
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
    setWorkingDays(current =>
      current.includes(day)
        ? current.filter(value => value !== day)
        : [...current, day].sort((a, b) => a - b)
    );
    resetCreateResult();
  };

  const buildPeriodRequest = () => ({
    startDate,
    endDate,
    workingDays: selectedWorkingDays,
    source: source || 'master-plan',
    templateRows: source === 'uploaded-file' ? templateRows : undefined,
    fileName: source === 'uploaded-file' ? fileName : undefined,
  });

  const handlePreview = async () => {
    if (!startDate || !endDate || !selectedWorkingDays.length || createBusy) return;
    setCreateStep('loading');
    setIsPreviewing(true);
    setNotice(null);
    setPreview(null);
    setCreationResult(null);
    try {
      let rows = templateRows;
      let errors = validationErrors;
      if (source === 'master-plan') {
        const master = await fetchMasterPlan(true);
        rows = master.rows;
        errors = master.validationErrors;
        setTemplateRows(rows);
        setValidationErrors(errors);
        setMasterRows(rows);
        setMasterValidationErrors(errors);
      }
      if (!rows.length) throw new Error('ไม่พบข้อมูล Master Plan');
      if (errors.length) throw new Error(`Master Plan มีข้อมูลที่ต้องแก้ไข ${errors.length} แถว`);
      const result = await previewPlanPeriod({
        startDate,
        endDate,
        workingDays: selectedWorkingDays,
        source: source || 'master-plan',
        templateRows: source === 'uploaded-file' ? rows : undefined,
        fileName: source === 'uploaded-file' ? fileName : undefined,
      });
      setPreview(result);
      setCreateStep('preview');
    } catch (error) {
      setCreateStep('select');
      setNotice({ type: 'error', message: getErrorMessage(error) });
    } finally {
      setIsPreviewing(false);
    }
  };
  const handleCreatePeriod = async () => {
    if (!preview || preview.newRowCount <= 0 || isCreating) return;
    setShowCreateConfirmation(false);
    setCreateStep('creating');
    setIsCreating(true);
    setNotice(null);

    try {
      const result = await createPlanPeriod(buildPeriodRequest());
      setCreationResult(result);
      setCreateStep('completed');
      setNotice(null);
      if (onPlanCreated) await onPlanCreated(result);
    } catch (error) {
      setCreateStep('preview');
      setNotice({ type: 'error', message: getErrorMessage(error) });
    } finally {
      setIsCreating(false);
    }
  };

  const loadDailyPlans = async (
    start = dailyDate,
    end = dailyEndDate,
    options: DailyRefreshOptions = {}
  ): Promise<DailyPlansResult> => {
    const { showMessage = true, clearResultOnError = showMessage } = options;
    const normalizedEnd = clampDailyEndDate(start, end);
    const dates = buildDateRange(start, normalizedEnd);
    if (!dates.length) throw new Error('ช่วงวันที่ดูแผนไม่ถูกต้อง');
    setIsLoadingDaily(true);
    if (showMessage) setNotice(null);
    try {
      const dailyResults = await Promise.all(dates.map(date => fetchDailyPlans(date)));
      const rows = dailyResults
        .flatMap(result => result.rows || [])
        .sort((first, second) =>
          String(first.date || '').localeCompare(String(second.date || '')) ||
          String(first.planEta || '').localeCompare(String(second.planEta || '')) ||
          String(first.codeRun || '').localeCompare(String(second.codeRun || ''))
        );
      const firstResult = dailyResults[0];
      const result: DailyPlansResult = {
        ...firstResult,
        rows,
        rowCount: rows.length,
        activeCount: dailyResults.reduce((sum, item) => sum + Number(item.activeCount || 0), 0),
        regularCount: dailyResults.reduce((sum, item) => sum + Number(item.regularCount || 0), 0),
        extraCount: dailyResults.reduce((sum, item) => sum + Number(item.extraCount || 0), 0),
        cancelCount: dailyResults.reduce((sum, item) => sum + Number(item.cancelCount || 0), 0),
      };
      setDailyDate(start);
      setDailyEndDate(normalizedEnd);
      setDailyResult(result);
      setSelectedPlanCodes([]);
      if (showMessage) {
        setNotice({
          type: 'success',
          message: dates.length === 1
            ? `โหลดแผนวันที่ ${start} สำเร็จ ${result.rowCount} รายการ`
            : `โหลดแผน ${start} ถึง ${normalizedEnd} รวม ${dates.length} วัน สำเร็จ ${result.rowCount} รายการ`,
        });
      }
      return result;
    } catch (error) {
      if (clearResultOnError) setDailyResult(null);
      if (showMessage) setNotice({ type: 'error', message: getErrorMessage(error) });
      throw error;
    } finally {
      setIsLoadingDaily(false);
    }
  };
  const openExtraDialog = () => {
    if (isSavingPlan) return;
    setEditingCodeRun('');
    setPlanForm({ ...EMPTY_PLAN, date: dailyDate, remark: 'EXTRA' });
    setPlanDialogMode('extra');
  };

  const openEditDialog = (plan: DailyPlan) => {
    if (isSavingPlan) return;
    setEditingCodeRun(plan.codeRun);
    setPlanForm({
      date: plan.date,
      route: plan.route,
      company: plan.company,
      truckName: plan.truckName,
      truckType: plan.truckType,
      driverName: plan.driverName,
      telDriver: plan.telDriver,
      project: plan.project,
      dropPoint: plan.dropPoint,
      planEta: plan.planEta,
      planEtd: plan.planEtd,
      groupCode: plan.groupCode || '',
      remark: plan.remark,
      workDetail: plan.workDetail || '',
    });
    setPlanDialogMode('edit');
  };

  const setPlanFormField = (field: keyof EditablePlan, value: string) => {
    setPlanForm(current => ({ ...current, [field]: value }));
  };

  const handleSavePlan = async (event: FormEvent) => {
    event.preventDefault();
    if (!planDialogMode || isSavingPlan) return;

    const mode = planDialogMode;
    const codeRun = editingCodeRun;
    const submittedPlan = { ...planForm };
    setIsSavingPlan(true);
    setNotice(null);

    try {
      if (mode === 'extra') {
        const result = await createExtraPlan({ ...submittedPlan, remark: 'EXTRA' });
        setNotice({
          type: 'success',
          message: `เพิ่มเที่ยว Extra เรียบร้อยแล้ว Code run: ${result.codeRun}`,
        });
      } else {
        await updateDailyPlan(codeRun, submittedPlan);
        setNotice({ type: 'success', message: `แก้ไข ${codeRun} สำเร็จ` });
      }

      setDailyDate(submittedPlan.date);
      setDailyEndDate(submittedPlan.date);
      setPlanDialogMode(null);
      setEditingCodeRun('');
      await loadDailyPlans(submittedPlan.date, submittedPlan.date, {
        showMessage: false,
        clearResultOnError: false,
      });
    } catch (error) {
      try {
        await loadDailyPlans(submittedPlan.date, submittedPlan.date, {
          showMessage: false,
          clearResultOnError: false,
        });
      } catch (refreshError) {
        console.error('Unable to refresh daily Plans:', refreshError);
      }
      setNotice({ type: 'error', message: getErrorMessage(error) });
    } finally {
      setIsSavingPlan(false);
    }
  };

  const handleBatchCancelPlans=async()=>{const items=[...selectedPlanCodes];setShowBatchCancelConfirmation(false);setIsSavingPlan(true);try{await runInBatches(items,c=>cancelDailyPlan(c));setSelectedPlanCodes([]);await loadDailyPlans(dailyDate,dailyEndDate,{showMessage:false,clearResultOnError:false});setNotice({type:'success',message:`ยกเลิกแผนสำเร็จ ${items.length} รายการ`});}catch(error){setNotice({type:'error',message:getErrorMessage(error)});}finally{setIsSavingPlan(false);}};
  const downloadEmptyTemplate=()=>XLSX.writeFile(buildMasterWorkbook([]),'ELIVE_Master_Plan_Template.xlsx');
  const downloadCurrentMasterPlan=async()=>{const rows=masterRows.length?masterRows:(await loadMasterRows(false)).rows;XLSX.writeFile(buildMasterWorkbook(rows),`ELIVE_Master_Plan_${getBangkokDate()}.xlsx`);};
  const handleMasterImportFile=async(file:File)=>{try{const result=parseTemplateRows(await readPlanFile(file));setMasterImportRows(result.rows);setMasterImportErrors(result.validationErrors);}catch(error){setNotice({type:'error',message:getErrorMessage(error)});}};
  const handleImportMasterPlan=async()=>{if(!masterImportRows.length||masterImportErrors.length)return;setIsImportingMaster(true);try{if(masterImportMode==='replace'){const rows=masterRows.length?masterRows:(await loadMasterRows(false)).rows;for(const row of rows.filter(r=>r.sheetRow).sort((a,b)=>Number(b.sheetRow)-Number(a.sheetRow)))await deleteMasterPlanRow(Number(row.sheetRow));}await runInBatches(masterImportRows,row=>createMasterPlanRow(row as EditableMasterPlanRow));await loadMasterRows(false);setShowMasterImport(false);setNotice({type:'success',message:`นำเข้า Master Plan สำเร็จ ${masterImportRows.length} รายการ`});}catch(error){setNotice({type:'error',message:getErrorMessage(error)});}finally{setIsImportingMaster(false);}};
  const waitForDeletedPlansToDisappear = async (
    codeRuns: string[],
    start = dailyDate,
    end = dailyEndDate
  ): Promise<DailyPlansResult> => {
    const normalizedEnd = clampDailyEndDate(start, end);
    const dates = buildDateRange(start, normalizedEnd);
    if (!dates.length) throw new Error('ช่วงวันที่ดูแผนไม่ถูกต้อง');
    const deletedCodes = new Set(codeRuns.map(codeRun => String(codeRun).trim().toUpperCase()));
    let latestResult: DailyPlansResult | null = null;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      if (attempt > 0) {
        await new Promise(resolve => window.setTimeout(resolve, 700 + attempt * 250));
      }
      const dailyResults = await Promise.all(dates.map(date => fetchDailyPlans(date)));
      const rows = dailyResults
        .flatMap(result => result.rows || [])
        .sort((first, second) =>
          String(first.date || '').localeCompare(String(second.date || '')) ||
          String(first.planEta || '').localeCompare(String(second.planEta || '')) ||
          String(first.codeRun || '').localeCompare(String(second.codeRun || ''))
        );
      const firstResult = dailyResults[0];
      latestResult = {
        ...firstResult,
        rows,
        rowCount: rows.length,
        activeCount: dailyResults.reduce((sum, item) => sum + Number(item.activeCount || 0), 0),
        regularCount: dailyResults.reduce((sum, item) => sum + Number(item.regularCount || 0), 0),
        extraCount: dailyResults.reduce((sum, item) => sum + Number(item.extraCount || 0), 0),
        cancelCount: dailyResults.reduce((sum, item) => sum + Number(item.cancelCount || 0), 0),
      };
      const stillVisible = rows.some(row => deletedCodes.has(String(row.codeRun || '').trim().toUpperCase()));
      if (!stillVisible) return latestResult;
    }

    throw new Error('ลบแผนแล้ว แต่ข้อมูลล่าสุดยังโหลดไม่เสร็จ กรุณารอสักครู่แล้วกดโหลดแผนอีกครั้ง');
  };

  const handleBatchDeletePlans = async () => {
    if (!selectedPlanCodes.length || selectedPlanCodes.length > MAX_BATCH_DELETE_PLANS || isSavingPlan || batchDeleteRunningRef.current) return;
    const codeRuns = [...selectedPlanCodes];
    batchDeleteRunningRef.current = true;
    setShowBatchDeleteConfirmation(false);
    setIsSavingPlan(true);
    setNotice({ type: 'info', message: 'กำลังลบและอัปเดตแผน กรุณารอสักครู่' });
    try {
      const result = await deleteDailyPlansBatch(codeRuns);
      const refreshedResult = await waitForDeletedPlansToDisappear(codeRuns);
      setDailyResult(refreshedResult);
      setSelectedPlanCodes([]);
      setNotice({
        type: result.notFoundCodeRuns.length ? 'info' : 'success',
        message: result.notFoundCodeRuns.length
          ? `ลบแผนแล้ว ${result.deletedPlanCount} รายการ และมี ${result.notFoundCodeRuns.length} รายการที่ไม่พบในแผนปัจจุบัน`
          : `ลบแผนเรียบร้อยแล้ว ${result.deletedPlanCount} รายการ`,
      });
    } catch (error) {
      setNotice({ type: 'error', message: getErrorMessage(error) });
    } finally {
      batchDeleteRunningRef.current = false;
      setIsSavingPlan(false);
    }
  };

  const handleDeletePlan = async () => {
    if (!deletePlanTarget || isSavingPlan) return;
    const target = deletePlanTarget;
    setIsSavingPlan(true);
    setNotice({ type: 'info', message: 'กำลังลบและอัปเดตแผน กรุณารอสักครู่' });
    try {
      await deleteDailyPlan(target.codeRun);
      const refreshedResult = await waitForDeletedPlansToDisappear([target.codeRun]);
      setDailyResult(refreshedResult);
      setDeletePlanTarget(null);
      setSelectedPlanCodes(current => current.filter(codeRun => codeRun !== target.codeRun));
      setNotice({ type: 'success', message: 'ลบแผนเรียบร้อยแล้ว' });
    } catch (error) {
      setNotice({ type: 'error', message: getErrorMessage(error) });
    } finally {
      setIsSavingPlan(false);
    }
  };

  const handleCancelPlan = async () => {
    if (!cancelTarget || isSavingPlan) return;
    const target = cancelTarget;
    setIsSavingPlan(true);
    setNotice(null);

    try {
      await cancelDailyPlan(target.codeRun);
      setCancelTarget(null);
      await loadDailyPlans(dailyDate, dailyEndDate, { showMessage: false, clearResultOnError: false });
      setNotice({ type: 'success', message: `ยกเลิก ${target.codeRun} สำเร็จ` });
    } catch (error) {
      setNotice({ type: 'error', message: getErrorMessage(error) });
    } finally {
      setIsSavingPlan(false);
    }
  };

  const handleRestorePlan = async (restoreAs: 'REGULAR' | 'EXTRA') => {
    if (!restoreTarget || isSavingPlan) return;
    const target = restoreTarget;
    setIsSavingPlan(true);
    setNotice(null);

    try {
      await restoreDailyPlan(target.codeRun, restoreAs);
      setRestoreTarget(null);
      await loadDailyPlans(dailyDate, dailyEndDate, { showMessage: false, clearResultOnError: false });
      setNotice({
        type: 'success',
        message: `คืนค่า ${target.codeRun} เป็น ${restoreAs} สำเร็จ`,
      });
    } catch (error) {
      setNotice({ type: 'error', message: getErrorMessage(error) });
    } finally {
      setIsSavingPlan(false);
    }
  };

  const openCreateMasterDialog = () => {
    setEditingMasterSheetRow(null);
    setMasterForm({ ...EMPTY_MASTER_PLAN });
    setMasterDialogMode('create');
  };

  const openEditMasterDialog = (row: MasterPlanRow) => {
    if (!row.sheetRow) {
      setNotice({ type: 'error', message: 'รายการนี้ไม่มี sheetRow จึงไม่สามารถแก้ไขได้' });
      return;
    }

    setEditingMasterSheetRow(row.sheetRow);
    setMasterForm({
      route: row.route,
      company: row.company,
      truckName: row.truckName,
      truckType: row.truckType,
      driverName: row.driverName,
      telDriver: row.telDriver,
      project: row.project,
      dropPoint: row.dropPoint,
      planEta: row.planEta,
      planEtd: row.planEtd,
      groupCode: row.groupCode || '',
    });
    setMasterDialogMode('edit');
  };

  const setMasterFormField = (field: keyof EditableMasterPlanRow, value: string) => {
    setMasterForm(current => ({ ...current, [field]: value }));
  };

  const handleSaveMaster = async (event: FormEvent) => {
    event.preventDefault();
    if (!masterDialogMode || isSavingMaster) return;

    const errors = validateMasterRow(masterForm);
    if (errors.length) {
      setNotice({ type: 'error', message: errors.join(', ') });
      return;
    }

    const mode = masterDialogMode;
    const sheetRow = editingMasterSheetRow;
    const submitted = {
      ...masterForm,
      planEta: normalizeTime(masterForm.planEta),
      planEtd: normalizeTime(masterForm.planEtd),
      groupCode: String(masterForm.groupCode || '').trim().toUpperCase(),
    };

    setIsSavingMaster(true);
    setNotice(null);

    try {
      if (mode === 'create') {
        await createMasterPlanRow(submitted);
      } else {
        if (!sheetRow) throw new Error('ไม่พบ sheetRow สำหรับแก้ไข');
        await updateMasterPlanRow(sheetRow, submitted);
      }

      setMasterDialogMode(null);
      setEditingMasterSheetRow(null);
      await loadMasterRows(false);
      setNotice({
        type: 'success',
        message: mode === 'create' ? 'เพิ่ม Master Plan สำเร็จ' : `แก้ไขแถว ${sheetRow} สำเร็จ`,
      });
    } catch (error) {
      try {
        await loadMasterRows(false);
      } catch (refreshError) {
        console.error('Unable to refresh Master Plan after mutation:', refreshError);
      }
      setNotice({ type: 'error', message: getErrorMessage(error) });
    } finally {
      setIsSavingMaster(false);
    }
  };

  const handleDeleteMaster = async () => {
    if (!deleteMasterTarget || !deleteMasterTarget.sheetRow || isSavingMaster) return;
    const target = deleteMasterTarget;
    setIsSavingMaster(true);
    setNotice(null);

    try {
      await deleteMasterPlanRow(target.sheetRow);
      setDeleteMasterTarget(null);
      await loadMasterRows(false);
      setNotice({
        type: 'success',
        message: `ลบ Master Plan แถว ${target.sheetRow} สำเร็จ`,
      });
    } catch (error) {
      try {
        await loadMasterRows(false);
      } catch (refreshError) {
        console.error('Unable to refresh Master Plan after delete:', refreshError);
      }
      setNotice({ type: 'error', message: getErrorMessage(error) });
    } finally {
      setIsSavingMaster(false);
    }
  };

  const handleDeleteSelectedMaster = async (clearAll = false) => {
    const sourceRows = clearAll
      ? masterRows.map(row => Number(row.sheetRow))
      : selectedMasterRows;
    const sheetRows = [...new Set(sourceRows)]
      .filter(sheetRow => Number.isInteger(sheetRow) && sheetRow >= 2)
      .sort((first, second) => second - first);
    if (!sheetRows.length || isSavingMaster) return;
    setShowDeleteSelectedMaster(false);
    setShowClearAllMaster(false);
    setIsSavingMaster(true);
    setNotice({ type: 'info', message: `กำลังลบ Master Plan ${sheetRows.length} รายการ กรุณาอย่าปิดหน้านี้` });
    try {
      for (const sheetRow of sheetRows) {
        await deleteMasterPlanRow(sheetRow);
      }
      setSelectedMasterRows([]);
      await loadMasterRows(false);
      setNotice({
        type: 'success',
        message: clearAll
          ? `ล้าง Master Plan เก่าทั้งหมดแล้ว ${sheetRows.length} รายการ พร้อมอัปโหลดแผนใหม่`
          : `ลบ Master Plan ที่เลือกสำเร็จ ${sheetRows.length} รายการ`,
      });
    } catch (error) {
      try {
        await loadMasterRows(false);
      } catch (refreshError) {
        console.error('Unable to refresh Master Plan after bulk delete:', refreshError);
      }
      setNotice({ type: 'error', message: getErrorMessage(error) });
    } finally {
      setIsSavingMaster(false);
    }
  };
  return (
    <div className="min-h-full bg-slate-50 p-2 sm:p-3">
      <div className="w-full space-y-3">
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileInput} />
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {tab === 'create' && createView === 'master' ? (
            <div className="space-y-3 px-3 py-4 sm:px-4">
              <div className="flex flex-col gap-2 xl:flex-row xl:items-end">
                <button
                  type="button"
                  onClick={() => setCreateView('source')}
                  className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <ArrowLeft className="h-4 w-4" />
                  ย้อนกลับ
                </button>
                <div className="min-w-[230px] xl:ml-1">
                  <h2 className="text-xl font-bold text-slate-900">จัดการ Master Plan</h2>
                  <p className="text-sm text-slate-500">เพิ่ม แก้ไข หรือลบข้อมูลต้นแบบ</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-[104px] rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-amber-800">
                    <p className="text-[9px] font-bold uppercase tracking-wide opacity-70">ทั้งหมด</p>
                    <p className="text-base font-bold leading-tight tabular-nums">{masterRows.length}</p>
                  </div>
                  <div className="min-w-[104px] rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-blue-800">
                    <p className="text-[9px] font-bold uppercase tracking-wide opacity-70">แสดงผล</p>
                    <p className="text-base font-bold leading-tight tabular-nums">{filteredMasterRows.length}</p>
                  </div>
                  <div className={`min-w-[104px] rounded-lg border px-3 py-1.5 ${masterValidationErrors.length ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
                    <p className="text-[9px] font-bold uppercase tracking-wide opacity-70">ตรวจสอบ</p>
                    <p className="text-base font-bold leading-tight">{masterValidationErrors.length ? `${masterValidationErrors.length} แถว` : 'ผ่าน'}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 xl:ml-auto">
                  <button type="button" onClick={() => { setMasterImportMode('replace'); setMasterImportRows([]); setMasterImportErrors([]); setShowMasterImport(true); }} disabled={isSavingMaster} className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-50">
                    <Upload className="h-4 w-4" /> อัปโหลด Master Plan
                  </button>
                  <button type="button" onClick={() => setShowDeleteSelectedMaster(true)} disabled={!selectedMasterRows.length || isSavingMaster} className="inline-flex h-10 items-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white disabled:opacity-40">
                    <Trash2 className="h-4 w-4" /> ลบที่เลือก ({selectedMasterRows.length})
                  </button>
                  <button type="button" onClick={() => setShowClearAllMaster(true)} disabled={!masterRows.length || isSavingMaster} className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-4 text-sm font-semibold text-red-700 disabled:opacity-40">
                    <Trash2 className="h-4 w-4" /> ล้างทั้งหมด
                  </button>
                  <button type="button" onClick={() => void loadMasterRows(true)} disabled={isLoadingMaster || isSavingMaster} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold disabled:opacity-50">
                    {isLoadingMaster ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    รีเฟรช
                  </button>
                  <button type="button" onClick={openCreateMasterDialog} disabled={isSavingMaster} className="inline-flex h-10 items-center gap-2 rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white disabled:opacity-50">
                    <Plus className="h-4 w-4" />
                    เพิ่มรายการ
                  </button>
                </div>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={masterSearch}
                  onChange={event => setMasterSearch(event.target.value)}
                  placeholder="ค้นหาแถว, Route, Company, Truck Name, Driver, Project, Drop Point หรือ Group Code..."
                  className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm"
                />
              </div>

              {masterValidationErrors.length > 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                  <div className="flex items-center gap-2 font-semibold text-red-800">
                    <AlertTriangle className="h-5 w-5" />
                    ข้อมูลที่ต้องแก้ไข
                  </div>
                  <div className="mt-3 max-h-40 space-y-2 overflow-auto">
                    {masterValidationErrors.map(item => (
                      <div key={item.sheetRow} className="rounded-lg bg-white px-3 py-2 text-sm text-red-700">
                        แถว {item.sheetRow}: {item.errors.join(', ')}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="max-h-[calc(100vh-300px)] w-full overflow-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[1220px] table-fixed divide-y divide-slate-200 text-[12px]">
                  <colgroup>
                    <col className="w-[38px]" /><col className="w-[52px]" /><col className="w-[88px]" /><col className="w-[72px]" />
                    <col className="w-[92px]" /><col className="w-[88px]" /><col className="w-[150px]" />
                    <col className="w-[112px]" /><col className="w-[82px]" /><col className="w-[76px]" />
                    <col className="w-[68px]" /><col className="w-[68px]" /><col className="w-[86px]" />
                    <col className="w-[76px]" />
                  </colgroup>
                  <thead className="sticky top-0 z-30 bg-slate-100 text-left text-[10px] font-bold uppercase text-slate-600 shadow-sm">
                    <tr>
                      <th className="sticky left-0 top-0 z-40 bg-slate-100 px-1 py-2 text-center">
                        <input type="checkbox" checked={allDisplayedMasterSelected} onChange={toggleSelectAllDisplayedMaster} disabled={!displayedMasterSheetRows.length || isSavingMaster} className="h-4 w-4 rounded border-slate-300 text-blue-600" aria-label="เลือก Master Plan ทั้งหมดที่แสดง" />
                      </th>
                      {['Row','Route','Company','Truck Name','Truck Type','Driver','Tel','Project','Drop Point','ETA','ETD','Group Code','Action'].map((heading, index) => (
                        <th key={heading} className={`whitespace-nowrap px-2 py-2 ${index >= 9 ? 'text-center' : ''} ${index === 12 ? 'sticky right-0 top-0 z-40 bg-slate-100' : 'bg-slate-100'}`}>{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredMasterRows.length === 0 ? (
                      <tr><td colSpan={14} className="px-3 py-10 text-center text-slate-500">{isLoadingMaster ? 'กำลังโหลด Master Plan...' : 'ไม่พบข้อมูล Master Plan'}</td></tr>
                    ) : filteredMasterRows.map((row, index) => (
                      <tr key={`${row.sheetRow ?? index}-${row.route}-${row.truckName}`} className="h-11 hover:bg-amber-50/40">
                        <td className="sticky left-0 z-10 bg-white px-1 py-2 text-center">
                          <input type="checkbox" checked={Boolean(row.sheetRow && selectedMasterRows.includes(row.sheetRow))} onChange={() => toggleSelectMasterRow(row.sheetRow)} disabled={!row.sheetRow || isSavingMaster} className="h-4 w-4 rounded border-slate-300 text-blue-600" aria-label={`เลือก Master Plan แถว ${row.sheetRow ?? '-'}`} />
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-center font-mono text-slate-500">{row.sheetRow ?? '-'}</td>
                        <td className="truncate px-2 py-2 font-semibold" title={row.route}>{row.route || '-'}</td>
                        <td className="truncate px-2 py-2" title={row.company}>{row.company || '-'}</td>
                        <td className="truncate px-2 py-2 font-medium text-blue-700" title={row.truckName}>{row.truckName || '-'}</td>
                        <td className="truncate px-2 py-2" title={row.truckType}>{row.truckType || '-'}</td>
                        <td className="truncate px-2 py-2" title={row.driverName || '-'}>{row.driverName || '-'}</td>
                        <td className="truncate px-2 py-2" title={row.telDriver || '-'}>{row.telDriver || '-'}</td>
                        <td className="truncate px-2 py-2" title={row.project}>{row.project || '-'}</td>
                        <td className="truncate px-2 py-2" title={row.dropPoint}>{row.dropPoint || '-'}</td>
                        <td className="whitespace-nowrap px-2 py-2 text-center font-mono">{row.planEta || '-'}</td>
                        <td className="whitespace-nowrap px-2 py-2 text-center font-mono">{row.planEtd || '-'}</td>
                        <td className="whitespace-nowrap px-2 py-2 text-center"><span className={row.groupCode ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700' : 'rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700'}>{row.groupCode || 'ไม่มี Group'}</span></td>
                        <td className="sticky right-0 z-10 whitespace-nowrap bg-white px-2 py-2 group-hover:bg-amber-50/40">
                          <div className="flex justify-center gap-1">
                            <button type="button" title="แก้ไข" onClick={() => openEditMasterDialog(row)} disabled={!row.sheetRow || isSavingMaster} className="rounded-md bg-blue-50 p-1.5 text-blue-600 hover:bg-blue-100 disabled:opacity-40"><Edit3 className="h-3.5 w-3.5" /></button>
                            <button type="button" title="ลบ" onClick={() => setDeleteMasterTarget(row)} disabled={!row.sheetRow || isSavingMaster} className="rounded-md bg-red-50 p-1.5 text-red-600 hover:bg-red-100 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : tab === 'create' ? (
            <div className="p-3 sm:p-4">
              
              {!source ? (
                <div className="space-y-4">
                  <section className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-white p-5 shadow-sm">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                      <div className="flex items-start gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm"><CalendarDays className="h-6 w-6" /></div>
                        <div><h2 className="text-xl font-bold text-slate-950">จัดการแผนรายวัน</h2><p className="mt-1 text-sm text-slate-500">ยกเลิกเที่ยว เปลี่ยนทะเบียน และแก้ไขแผนระหว่างวัน</p></div>
                      </div>
                      <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:ml-auto lg:max-w-2xl">
                        <button type="button" onClick={handleLoadMasterPlan} disabled={isLoadingSource} className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-base font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60">{isLoadingSource ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}สร้าง Plan</button>
                        <button type="button" onClick={() => setTab('daily')} className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-base font-bold text-white shadow-sm transition hover:bg-emerald-700"><Edit3 className="h-5 w-5" />ดูและแก้ไข Plan</button>
                      </div>
                    </div>
                  </section>
                  <section className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><Sheet className="h-5 w-5" /></div><div><h3 className="text-sm font-bold text-slate-800">Master Plan</h3></div></div>
                      <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                        <button type="button" onClick={() => void openMasterManagement()} title="เปิด Master Plan" aria-label="เปิด Master Plan" className="flex h-11 w-11 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-blue-700 transition hover:bg-blue-100"><Sheet className="h-5 w-5" /></button>
                        <button type="button" onClick={downloadEmptyTemplate} title="ดาวน์โหลด Template" className="inline-flex h-11 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-sm font-bold text-emerald-700 transition hover:bg-emerald-100"><FileSpreadsheet className="h-5 w-5" />Template</button>
                        <button type="button" onClick={() => void downloadCurrentMasterPlan()} title="ดาวน์โหลด Master Plan" aria-label="ดาวน์โหลด Master Plan" className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 transition hover:bg-emerald-100"><FileSpreadsheet className="h-5 w-5" /><Download className="absolute bottom-1 right-1 h-3 w-3 rounded-full bg-white" /></button>
                      </div>
                    </div>
                  </section>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <div className="flex items-center">
                      <div className="relative grid min-w-0 flex-1 grid-cols-3 px-4">
                        <div className="absolute left-[16.66%] right-[16.66%] top-[18px] h-1 -translate-y-1/2 bg-blue-600" />
                        {[
                          { number: 1, label: 'เลือกช่วงวันที่' },
                          { number: 2, label: createStep === 'loading' ? 'กำลังโหลดแผน' : 'ตรวจสอบข้อมูล' },
                          { number: 3, label: createStep === 'creating' ? 'กำลังสร้างแผน' : createStep === 'completed' ? 'สร้างสำเร็จ' : 'ยืนยันการสร้าง' },
                        ].map((item, index) => {
                          const activeIndex = createStep === 'select' ? 0 : createStep === 'loading' || createStep === 'preview' ? 1 : 2;
                          const active = index === activeIndex;
                          return (
                            <div key={item.number} className="relative z-10 flex flex-col items-center text-center">
                              <div className={`flex h-9 w-9 items-center justify-center rounded-full border-2 border-black text-base font-black shadow-sm ${active ? 'bg-yellow-400 text-black' : 'bg-blue-600 text-white'}`}>{item.number}</div>
                              <span className={`mt-1 text-[11px] font-bold ${active ? 'text-amber-700' : 'text-blue-700'}`}>{item.label}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {createStep === 'select' && (
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                      <div className="flex flex-wrap items-end gap-2 xl:flex-nowrap">
                        <button type="button" onClick={clearSource} disabled={createBusy} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                          <ArrowLeft className="h-4 w-4" />ย้อนกลับ
                        </button>
                        <label className="min-w-[165px] flex-1 text-xs font-semibold text-slate-600 xl:max-w-[220px]">
                          วันที่เริ่มต้น
                          <input type="date" value={startDate} onChange={event => { setStartDate(event.target.value); resetCreateResult(); }} className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800" />
                        </label>
                        <label className="min-w-[165px] flex-1 text-xs font-semibold text-slate-600 xl:max-w-[220px]">
                          วันที่สิ้นสุด
                          <input type="date" value={endDate} min={startDate} onChange={event => { setEndDate(event.target.value); resetCreateResult(); }} className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800" />
                        </label>
                        <div className="flex min-w-0 flex-1 items-end gap-1.5">
                          {WORKING_DAYS.map(day => (
                            <button key={day.value} type="button" title={day.full} onClick={() => toggleWorkingDay(day.value)} className={`h-10 min-w-[40px] flex-1 rounded-lg border px-2 text-xs font-bold ${selectedWorkingDays.includes(day.value) ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-600'}`}>
                              {day.short}
                            </button>
                          ))}
                        </div>
                        <div className="flex h-10 shrink-0 items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-emerald-800">
                          <span className="text-[10px] font-semibold">จำนวนวัน</span>
                          <b className="ml-2 text-base tabular-nums">{buildDateRange(startDate, endDate).filter(date => selectedWorkingDays.includes(new Date(`${date}T00:00:00Z`).getUTCDay() || 7)).length}</b>
                        </div>
                        <button type="button" onClick={() => void handlePreview()} disabled={!startDate || !endDate || !selectedWorkingDays.length || createBusy} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:bg-slate-300">
                          ถัดไป <span aria-hidden="true">→</span>
                        </button>
                      </div>
                    </div>
                  )}
                  {createStep === 'loading' && (
                    <div className="flex min-h-[360px] flex-col items-center justify-center rounded-xl border border-blue-200 bg-blue-50/50 p-8 text-center">
                      <Loader2 className="h-12 w-12 animate-spin text-blue-600" /><h2 className="mt-5 text-xl font-bold text-slate-900">กำลังโหลดแผน</h2><p className="mt-2 text-sm text-slate-500">กำลังตรวจสอบ Master Plan และเตรียมข้อมูลตามช่วงวันที่</p>
                    </div>
                  )}

                  {createStep === 'preview' && preview && (
                    <div className="flex min-h-0 flex-col gap-2 lg:h-[calc(100dvh-285px)]">
                      <div className="flex shrink-0 items-center gap-2 overflow-hidden rounded-xl border border-slate-200 bg-white px-3 py-2">
                        <button
                          type="button"
                          onClick={() => setCreateStep('select')}
                          disabled={createBusy}
                          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          <ArrowLeft className="h-4 w-4" />
                          ย้อนกลับ
                        </button>
                        {[['วันทำงาน', preview.workingDateCount, 'blue'], ['ทั้งหมด', preview.totalCandidateRows, 'slate'], ['รายการใหม่', preview.newRowCount, 'emerald'], ['รายการซ้ำ', preview.duplicateRowCount, 'amber'], ['ทะเบียนรถ', new Set(templateRows.map(row => row.truckName).filter(Boolean)).size, 'purple'], ['กลุ่มงาน', new Set(templateRows.map(row => row.groupCode).filter(Boolean)).size, 'cyan']].map(([label,value,tone]) => <div key={String(label)} className={`min-w-[82px] rounded-lg border px-2.5 py-1 ${tone === 'emerald' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : tone === 'amber' ? 'border-amber-200 bg-amber-50 text-amber-800' : tone === 'purple' ? 'border-purple-200 bg-purple-50 text-purple-800' : tone === 'cyan' ? 'border-cyan-200 bg-cyan-50 text-cyan-800' : tone === 'blue' ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white text-slate-800'}`}><p className="text-[9px] font-bold uppercase opacity-70">{label}</p><p className="text-sm font-bold tabular-nums">{value}</p></div>)}
                        <button type="button" onClick={() => setShowCreateConfirmation(true)} disabled={preview.newRowCount <= 0} className="ml-auto shrink-0 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white disabled:bg-slate-300">Create</button>
                      </div>
                      <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-200 bg-white p-3">
                        <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200">
                          <table className="min-w-[1050px] w-full divide-y divide-slate-200 text-sm">
                            <thead className="sticky top-0 z-20 bg-slate-100 text-left text-xs font-bold uppercase text-slate-600">
                              <tr>{['Code Run','วันที่','Route','Company','ทะเบียนรถ','จุดลงงาน','ETA','ETD','Group Code'].map(heading => <th key={heading} className="whitespace-nowrap px-3 py-2">{heading}</th>)}</tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                              {previewRows.length ? previewRows.map(({ date, codeRun, row }, index) => (
                                <tr key={`${date}-${row.sheetRow || index}-${codeRun}`} className="hover:bg-blue-50/40">
                                  <td className="whitespace-nowrap px-3 py-2 font-bold text-blue-700">{codeRun}</td>
                                  <td className="whitespace-nowrap px-3 py-2 font-mono text-slate-600">{date}</td>
                                  <td className="whitespace-nowrap px-3 py-2 font-semibold">{row.route || '-'}</td>
                                  <td className="whitespace-nowrap px-3 py-2">{row.company || '-'}</td>
                                  <td className="whitespace-nowrap px-3 py-2">{row.truckName || '-'}</td>
                                  <td className="whitespace-nowrap px-3 py-2">{row.dropPoint || '-'}</td>
                                  <td className="whitespace-nowrap px-3 py-2 font-mono">{row.planEta || '-'}</td>
                                  <td className="whitespace-nowrap px-3 py-2 font-mono">{row.planEtd || '-'}</td>
                                  <td className="whitespace-nowrap px-3 py-2.5"><span className={row.groupCode ? 'rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-700' : 'rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700'}>{row.groupCode || 'ไม่มี Group'}</span></td>
                                </tr>
                              )) : <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-500">ไม่พบข้อมูลสำหรับแสดงตัวอย่าง</td></tr>}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  {createStep === 'creating' && (
                    <div className="flex min-h-[360px] flex-col items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50/50 p-8 text-center"><Loader2 className="h-12 w-12 animate-spin text-emerald-600" /><h2 className="mt-5 text-xl font-bold text-slate-900">กำลังสร้าง Plan</h2><p className="mt-2 text-sm text-slate-500">กำลังบันทึกรายการลงแผนรายวัน กรุณารอสักครู่</p></div>
                  )}

                  {createStep === 'completed' && creationResult && (
                    <div className="flex min-h-[360px] flex-col items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 p-8 text-center"><CheckCircle2 className="h-14 w-14 text-emerald-600" /><h2 className="mt-4 text-2xl font-bold text-emerald-900">สร้าง Plan สำเร็จ</h2><p className="mt-2 text-emerald-800">สร้าง {creationResult.createdRowCount} รายการ ข้ามรายการซ้ำ {creationResult.duplicateRowCount} รายการ</p><div className="mt-6 flex flex-wrap justify-center gap-3"><button type="button" onClick={() => { setTab('daily'); setDailyDate(startDate); setDailyEndDate(endDate); void loadDailyPlans(startDate, endDate); }} className="rounded-xl bg-blue-600 px-5 py-2.5 font-semibold text-white">ดูแผนที่สร้าง</button><button type="button" onClick={() => { setCreateStep('select'); setPreview(null); setCreationResult(null); }} className="rounded-xl border border-emerald-300 bg-white px-5 py-2.5 font-semibold text-emerald-700">สร้างแผนเพิ่ม</button><button type="button" onClick={clearSource} className="rounded-xl border px-5 py-2.5 font-semibold">กลับเมนูหลัก</button></div></div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3 p-3 sm:p-4">

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                  <button
                    type="button"
                    onClick={() => {
                      setTab('create');
                      setCreateView('source');
                      setNotice(null);
                    }}
                    className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-100"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    ย้อนกลับ
                  </button>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <div className="min-w-[82px] rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-slate-800"><p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">ทั้งหมด</p><p className="text-sm font-bold leading-tight tabular-nums">{dailyResult?.rowCount ?? 0}</p></div>
                  <div className="min-w-[82px] rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-800"><p className="text-[9px] font-bold uppercase tracking-wide opacity-70">ใช้งาน</p><p className="text-sm font-bold leading-tight tabular-nums">{dailyResult?.activeCount ?? 0}</p></div>
                  <div className="min-w-[82px] rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-blue-800"><p className="text-[9px] font-bold uppercase tracking-wide opacity-70">แผนปกติ</p><p className="text-sm font-bold leading-tight tabular-nums">{dailyResult?.regularCount ?? 0}</p></div>
                  <div className="min-w-[82px] rounded-lg border border-purple-200 bg-purple-50 px-2.5 py-1 text-purple-800"><p className="text-[9px] font-bold uppercase tracking-wide opacity-70">แผนพิเศษ</p><p className="text-sm font-bold leading-tight tabular-nums">{dailyResult?.extraCount ?? 0}</p></div>
                  <div className="min-w-[82px] rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-red-800"><p className="text-[9px] font-bold uppercase tracking-wide opacity-70">ยกเลิก</p><p className="text-sm font-bold leading-tight tabular-nums">{dailyResult?.cancelCount ?? 0}</p></div>
                  </div>

                  <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2 lg:grid-cols-[150px_150px_130px] lg:items-end">
                    <label className="block text-sm font-medium text-slate-700">
                      วันที่เริ่มต้น
                      <input
                        type="date"
                        value={dailyDate}
                        onChange={event => {
                          const nextStart = event.target.value;
                          setDailyDate(nextStart);
                          setDailyEndDate(current => clampDailyEndDate(nextStart, current));
                        }}
                        className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm"
                      />
                    </label>
                    <label className="block text-sm font-medium text-slate-700">
                      วันที่สิ้นสุด
                      <input
                        type="date"
                        value={dailyEndDate}
                        min={dailyDate}
                        max={addCalendarDays(dailyDate, MAX_DAILY_VIEW_DAYS - 1)}
                        onChange={event => setDailyEndDate(clampDailyEndDate(dailyDate, event.target.value))}
                        className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => void loadDailyPlans(dailyDate, dailyEndDate, { showMessage: true, clearResultOnError: true })}
                      disabled={isLoadingDaily}
                      className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60 sm:col-span-2 lg:col-span-1 lg:w-[130px]"
                    >
                      {isLoadingDaily ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      โหลดแผน
                    </button>
                  </div>

                  <div className="flex shrink-0 flex-col gap-2 sm:flex-row xl:border-l xl:border-slate-200 xl:pl-4">
                    
                    <button
                      type="button"
                      onClick={openExtraDialog}
                      disabled={isSavingPlan}
                      className="inline-flex h-11 min-w-[112px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
                    >
                      <Plus className="h-4 w-4" />
                      EXTRA
                    </button>
                  </div>
                </div>
              </div>

              {dailyResult && (
                <>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        value={dailySearch}
                        onChange={event => setDailySearch(event.target.value)}
                        placeholder="ค้นหา Code run, Route, ทะเบียนรถ..."
                        className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-3"
                      />
                    </div>
                    <select
                      value={dailyFilter}
                      onChange={event => setDailyFilter(event.target.value as DailyFilter)}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                    >
                      <option value="ALL">ทุกประเภท</option>
                      <option value="REGULAR">REGULAR</option>
                      <option value="EXTRA">EXTRA</option>
                      <option value="CANCEL">CANCEL</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center">
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
                      <input type="checkbox" checked={allDisplayedPlansSelected} onChange={toggleSelectAllDisplayed} disabled={!displayedPlanCodes.length || isSavingPlan} className="h-4 w-4 rounded border-slate-300 text-blue-600" />
                      เลือกทั้งหมดที่แสดง
                    </label>
                    <span className="text-sm font-semibold text-slate-600">เลือกแล้ว {selectedPlanCodes.length}/{MAX_BATCH_DELETE_PLANS} รายการ</span>
                    <div className="flex gap-2 sm:ml-auto">
                      <button type="button" onClick={() => setSelectedPlanCodes([])} disabled={!selectedPlanCodes.length || isSavingPlan} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold disabled:opacity-40">ล้างการเลือก</button>
                      <button type="button" onClick={() => setShowBatchCancelConfirmation(true)} disabled={!selectedPlanCodes.length || isSavingPlan} className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"><XCircle className="h-4 w-4" />ยกเลิกแผนที่เลือก ({selectedPlanCodes.length})</button>
                      <button type="button" onClick={() => setShowBatchDeleteConfirmation(true)} disabled={!selectedPlanCodes.length || selectedPlanCodes.length > MAX_BATCH_DELETE_PLANS || isSavingPlan} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"><Trash2 className="h-4 w-4" />ลบรายการที่เลือก ({selectedPlanCodes.length})</button>
                    </div>
                  </div>
                  <div className="max-h-[calc(100dvh-365px)] min-h-[420px] w-full overflow-y-auto overflow-x-hidden rounded-xl border border-slate-200">
                    <table className="w-full table-fixed divide-y divide-slate-200 text-[12px]">
                      <colgroup>
                        <col className="w-[36px]" /><col className="w-[82px]" /><col className="w-[76px]" />
                        <col className="w-[105px]" /><col className="w-[72px]" /><col className="w-[86px]" />
                        <col className="w-[76px]" /><col className="w-[78px]" /><col className="w-[96px]" />
                        <col className="w-[54px]" /><col className="w-[54px]" /><col className="w-[92px]" />
                      </colgroup>
                      <thead className="sticky top-0 z-30 bg-slate-100 text-left text-[10px] font-semibold uppercase text-slate-600 shadow-sm">
                        <tr>
                          <th className="sticky left-0 top-0 z-40 bg-slate-100 px-1.5 py-2 text-center">
                            <input type="checkbox" checked={allDisplayedPlansSelected} onChange={toggleSelectAllDisplayed} disabled={!displayedPlanCodes.length || isSavingPlan} className="h-4 w-4 rounded border-slate-300 text-blue-600" aria-label="เลือกทั้งหมดที่แสดง" />
                          </th>
                          {['วันที่', 'ประเภท', 'Route', 'บริษัท', 'ทะเบียนรถ', 'จุดลงงาน', 'กลุ่มงาน', 'รายละเอียดงาน', 'ETA', 'ETD', 'จัดการ'].map((heading, index) => (
                            <th key={heading} className={`whitespace-nowrap px-1.5 py-2 ${index === 10 ? 'sticky right-0 top-0 z-40 bg-slate-100 text-center' : ''}`}>{heading}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {filteredDailyRows.length === 0 ? (
                          <tr><td colSpan={12} className="px-4 py-10 text-center text-slate-500">ไม่พบแผนในวันที่เลือก</td></tr>
                        ) : (
                          filteredDailyRows.map(plan => (
                            <tr key={plan.codeRun} className={plan.remark === 'CANCEL' ? 'bg-red-50/50 text-slate-500' : 'hover:bg-blue-50/40'}>
                              <td className="sticky left-0 z-10 bg-white px-1.5 py-1.5 text-center">
                                <input type="checkbox" checked={selectedPlanCodes.includes(plan.codeRun)} onChange={() => toggleSelectPlan(plan.codeRun)} disabled={isSavingPlan} className="h-4 w-4 rounded border-slate-300 text-blue-600" aria-label={`เลือก ${plan.codeRun}`} />
                              </td>
                              
                              <td className="whitespace-nowrap px-1.5 py-1.5 font-mono text-slate-600">{plan.date}</td>
                              <td className="whitespace-nowrap px-1.5 py-1.5"><RemarkBadge remark={plan.remark} /></td>
                              <td className="whitespace-nowrap px-1.5 py-1.5">{plan.route}</td>
                              <td className="whitespace-nowrap px-1.5 py-1.5">{plan.company}</td>
                              <td className="whitespace-nowrap px-1.5 py-1.5 font-medium">{plan.truckName}</td>
                              <td className="whitespace-nowrap px-1.5 py-1.5">{plan.dropPoint}</td>
                              <td className="whitespace-nowrap px-1.5 py-1.5"><span className={plan.groupCode ? 'rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700' : 'rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700'}>{plan.groupCode || 'ไม่มี Group'}</span></td>
                              <td className="max-w-[96px] px-1.5 py-1.5">
                                <span className="block max-w-[88px] truncate" title={plan.workDetail || '-'}>
                                  {plan.workDetail || '-'}
                                </span>
                              </td>
                              <td className="whitespace-nowrap px-1.5 py-1.5 font-mono">{plan.planEta}</td>
                              <td className="whitespace-nowrap px-1.5 py-1.5 font-mono">{plan.planEtd}</td>
                              <td className="sticky right-0 z-10 whitespace-nowrap bg-white px-1 py-1.5">
                                <div className="flex justify-center gap-1">
                                  {plan.remark !== 'CANCEL' ? (
                                    <>
                                      <button type="button" onClick={() => openEditDialog(plan)} disabled={isSavingPlan} className="rounded-md bg-blue-50 p-1.5 text-blue-600 disabled:opacity-50" title="แก้ไข">
                                        <Edit3 className="h-4 w-4" />
                                      </button>
                                      <button type="button" onClick={() => setCancelTarget(plan)} disabled={isSavingPlan} className="rounded-md bg-amber-50 p-1.5 text-amber-700 disabled:opacity-50" title="ยกเลิกแผนโดยเปลี่ยนเป็น CANCEL">
                                        <XCircle className="h-4 w-4" />
                                      </button>
                                      <button type="button" onClick={() => setDeletePlanTarget(plan)} disabled={isSavingPlan} className="rounded-md bg-red-600 p-1.5 text-white disabled:opacity-50" title="ลบแผนถาวร">
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    </>
                                  ) : (
                                    <button type="button" onClick={() => setRestoreTarget(plan)} disabled={isSavingPlan} className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 disabled:opacity-50">
                                      <RotateCcw className="h-4 w-4" /> คืนค่า
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </section>

        {notice && <Notice notice={notice} />}








      </div>

      {showCreateConfirmation && preview && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-bold">ยืนยันการสร้าง Plan</h2>
            <p className="mt-2 text-sm text-slate-500">ต้องการสร้างแผน {preview.newRowCount} รายการใช่หรือไม่ กรุณาตรวจสอบข้อมูลก่อนยืนยัน</p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setShowCreateConfirmation(false)} disabled={isCreating} className="rounded-xl border px-5 py-2.5 disabled:opacity-50">ยกเลิก</button>
              <button type="button" onClick={() => void handleCreatePeriod()} disabled={isCreating} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 font-semibold text-white disabled:opacity-60">
                {isCreating && <Loader2 className="h-4 w-4 animate-spin" />} ยืนยันสร้าง
              </button>
            </div>
          </div>
        </div>
      )}

      {planDialogMode && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/60 p-4">
          <form onSubmit={handleSavePlan} className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">{planDialogMode === 'extra' ? 'เพิ่มแผนพิเศษ' : `แก้ไข ${editingCodeRun}`}</h2>
                <p className="text-sm text-slate-500">เลขอ้างอิงจะถูกสร้างให้อัตโนมัติ</p>
              </div>
              <button type="button" onClick={() => !isSavingPlan && setPlanDialogMode(null)} disabled={isSavingPlan} className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-50"><X className="h-5 w-5" /></button>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {PLAN_FORM_FIELDS.map(item => (
                <label key={item.field} className="text-sm font-medium text-slate-700">
                  {item.label}
                  <input
                    type={item.type}
                    list={item.type === 'text' ? `plan-options-${item.field}` : undefined}
                    value={String(planForm[item.field] || '')}
                    onChange={event => setPlanFormField(item.field, event.target.value)}
                    required={item.required}
                    disabled={isSavingPlan}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 disabled:bg-slate-100"
                  />
                  {item.type === 'text' && item.field in planFieldOptions && (
                    <datalist id={`plan-options-${item.field}`}>
                      {planFieldOptions[item.field as keyof typeof planFieldOptions].map(option => (
                        <option key={option} value={option} />
                      ))}
                    </datalist>
                  )}
                </label>
              ))}
              <label className="text-sm font-medium text-slate-700 sm:col-span-2 lg:col-span-3">
                รายละเอียดงาน / Work Detail
                <textarea
                  value={planForm.workDetail || ''}
                  onChange={event => setPlanFormField('workDetail', event.target.value)}
                  disabled={isSavingPlan}
                  rows={4}
                  maxLength={1000}
                  placeholder="ระบุรายละเอียดงาน เช่น ลงงานเสร็จให้ขึ้นพาเลทเปล่า 20 ตัว"
                  className="mt-1.5 w-full resize-y rounded-xl border border-slate-300 px-3 py-2.5 disabled:bg-slate-100"
                />
                <span className="mt-1 block text-right text-xs text-slate-400">
                  {(planForm.workDetail || '').length}/1000
                </span>
              </label>

              {planDialogMode === 'edit' && (
                <label className="text-sm font-medium text-slate-700">
                  Remark
                  <select value={planForm.remark || 'REGULAR'} onChange={event => setPlanFormField('remark', event.target.value)} disabled={isSavingPlan} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 disabled:bg-slate-100">
                    <option value="REGULAR">REGULAR</option>
                    <option value="EXTRA">EXTRA</option>
                  </select>
                </label>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => !isSavingPlan && setPlanDialogMode(null)} disabled={isSavingPlan} className="rounded-xl border px-5 py-2.5 disabled:opacity-50">ยกเลิก</button>
              <button type="submit" disabled={isSavingPlan} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 font-semibold text-white disabled:opacity-60">
                {isSavingPlan && <Loader2 className="h-4 w-4 animate-spin" />} {isSavingPlan ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </form>
        </div>
      )}

      {masterDialogMode && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-slate-950/60 p-4">
          <form onSubmit={handleSaveMaster} className="max-h-[92vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">{masterDialogMode === 'create' ? 'เพิ่ม Master Plan' : `แก้ไข Master Plan แถว ${editingMasterSheetRow}`}</h2>
                <p className="text-sm text-slate-500">ช่องที่มี * เป็นข้อมูลบังคับ เวลาใช้รูปแบบ HH:mm</p>
              </div>
              <button type="button" onClick={() => !isSavingMaster && setMasterDialogMode(null)} disabled={isSavingMaster} className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-50"><X className="h-5 w-5" /></button>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {MASTER_FORM_FIELDS.map(item => (
                <label key={item.field} className="text-sm font-medium text-slate-700">
                  {item.label}{item.required ? ' *' : ''}
                  <input
                    type={item.type}
                    list={item.field === 'groupCode' ? 'master-group-code-options' : undefined}
                    value={String(masterForm[item.field] || '')}
                    onChange={event => setMasterFormField(item.field, event.target.value)}
                    required={item.required}
                    disabled={isSavingMaster}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 disabled:bg-slate-100"
                  />
                  {item.field === 'groupCode' && (
                    <datalist id="master-group-code-options">
                      {planFieldOptions.groupCode.map(option => <option key={option} value={option} />)}
                    </datalist>
                  )}
                </label>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => !isSavingMaster && setMasterDialogMode(null)} disabled={isSavingMaster} className="rounded-xl border px-5 py-2.5 disabled:opacity-50">ยกเลิก</button>
              <button type="submit" disabled={isSavingMaster} className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-2.5 font-semibold text-white disabled:opacity-60">
                {isSavingMaster && <Loader2 className="h-4 w-4 animate-spin" />} {isSavingMaster ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </form>
        </div>
      )}

      {deleteMasterTarget && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex gap-3">
              <div className="rounded-full bg-red-100 p-2 text-red-700"><AlertTriangle className="h-6 w-6" /></div>
              <div>
                <h2 className="text-lg font-bold">ยืนยันลบ Master Plan</h2>
                <p className="mt-1 text-sm text-slate-500">แถว {deleteMasterTarget.sheetRow} | {deleteMasterTarget.route} | {deleteMasterTarget.truckName}</p>
              </div>
            </div>
            <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
              ระบบจะลบแถวจริงจากชีต Master Plan และหมายเลขแถวด้านล่างจะเปลี่ยน หลังลบระบบจะโหลดข้อมูลใหม่อัตโนมัติ
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => !isSavingMaster && setDeleteMasterTarget(null)} disabled={isSavingMaster} className="rounded-xl border px-5 py-2.5 disabled:opacity-50">กลับ</button>
              <button type="button" onClick={() => void handleDeleteMaster()} disabled={isSavingMaster} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 font-semibold text-white disabled:opacity-60">
                {isSavingMaster && <Loader2 className="h-4 w-4 animate-spin" />} ยืนยันลบ
              </button>
            </div>
          </div>
        </div>
      )}

      {showBatchCancelConfirmation&&selectedPlanCodes.length>0&&<div className="fixed inset-0 z-[1260] flex items-center justify-center bg-slate-950/70 p-4"><div className="w-full max-w-md rounded-2xl bg-white p-6"><h2 className="text-lg font-bold">ยกเลิกแผน {selectedPlanCodes.length} รายการ</h2><p className="mt-3 text-sm text-slate-600">รายการที่เลือกจะเปลี่ยนเป็นยกเลิก และสามารถคืนสถานะได้ภายหลัง</p><div className="mt-6 flex justify-end gap-3"><button onClick={()=>setShowBatchCancelConfirmation(false)} className="rounded-xl border px-4 py-2">กลับ</button><button onClick={()=>void handleBatchCancelPlans()} className="rounded-xl bg-amber-500 px-4 py-2 font-semibold text-white">ยืนยัน</button></div></div></div>}
      {showDeleteSelectedMaster && selectedMasterRows.length > 0 && (
        <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-bold">ลบ Master Plan ที่เลือก?</h2>
            <p className="mt-3 rounded-xl bg-red-50 p-4 text-sm text-red-800">ระบบจะลบถาวร {selectedMasterRows.length} รายการ โดยไม่กระทบ Daily Plan ที่สร้างไว้แล้ว</p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setShowDeleteSelectedMaster(false)} className="rounded-xl border px-4 py-2">กลับ</button>
              <button type="button" onClick={() => void handleDeleteSelectedMaster(false)} className="rounded-xl bg-red-600 px-4 py-2 font-semibold text-white">ยืนยันลบ</button>
            </div>
          </div>
        </div>
      )}
      {showClearAllMaster && masterRows.length > 0 && (
        <div className="fixed inset-0 z-[1310] flex items-center justify-center bg-slate-950/75 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-red-700">ล้าง Master Plan เก่าทั้งหมด?</h2>
            <p className="mt-3 text-sm text-slate-600">กำลังจะลบ Master Plan ทั้งหมด <b>{masterRows.length} รายการ</b> เพื่อเตรียมอัปโหลดแผนใหม่</p>
            <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">การลบนี้ย้อนกลับไม่ได้ แต่จะไม่ลบ Daily Plan และ Actual ที่สร้างไว้แล้ว</p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setShowClearAllMaster(false)} className="rounded-xl border px-4 py-2">ยกเลิก</button>
              <button type="button" onClick={() => void handleDeleteSelectedMaster(true)} className="rounded-xl bg-red-700 px-4 py-2 font-semibold text-white">ยืนยันล้างทั้งหมด</button>
            </div>
          </div>
        </div>
      )}
      {showMasterImport&&<div className="fixed inset-0 z-[1300] flex items-center justify-center bg-slate-950/70 p-4"><div className="w-full max-w-2xl rounded-2xl bg-white p-6"><h2 className="text-xl font-bold">นำเข้า Master Plan</h2><input ref={masterImportInputRef} type="file" accept=".xlsx,.xls,.csv" className="mt-5" onChange={e=>{const f=e.target.files?.[0];if(f)void handleMasterImportFile(f);}} />{masterImportRows.length>0&&<div className="mt-4"><p>จำนวน {masterImportRows.length} รายการ | ผิดพลาด {masterImportErrors.length} แถว</p><div className="mt-3 flex gap-4"><label><input type="radio" checked={masterImportMode==='append'} onChange={()=>setMasterImportMode('append')} /> เพิ่มรายการ</label><label><input type="radio" checked={masterImportMode==='replace'} onChange={()=>setMasterImportMode('replace')} /> แทนที่ทั้งหมด</label></div></div>}<div className="mt-6 flex justify-end gap-3"><button onClick={()=>setShowMasterImport(false)} className="rounded-xl border px-4 py-2">ยกเลิก</button><button onClick={()=>void handleImportMasterPlan()} disabled={!masterImportRows.length||masterImportErrors.length>0||isImportingMaster} className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-40">นำเข้า</button></div></div></div>}
      {showBatchDeleteConfirmation && selectedPlanCodes.length > 0 && (
        <div className="fixed inset-0 z-[1250] flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-bold">ลบแผนที่เลือก {selectedPlanCodes.length} รายการ?</h2>
            
            <p className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">แผนที่ลบจะหายออกจากรายการและไม่สามารถนำกลับคืนได้ กรุณาตรวจสอบรายการที่เลือกก่อนยืนยัน</p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setShowBatchDeleteConfirmation(false)} disabled={isSavingPlan} className="rounded-xl border px-5 py-2.5">กลับ</button>
              <button type="button" onClick={() => void handleBatchDeletePlans()} disabled={isSavingPlan || batchDeleteRunningRef.current || selectedPlanCodes.length > MAX_BATCH_DELETE_PLANS} className="rounded-xl bg-red-600 px-5 py-2.5 font-semibold text-white disabled:opacity-50">ลบ {selectedPlanCodes.length} รายการ</button>
            </div>
          </div>
        </div>
      )}
      {deletePlanTarget && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex gap-3">
              <div className="rounded-full bg-red-100 p-2 text-red-700"><Trash2 className="h-6 w-6" /></div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">ลบแผนนี้?</h2>
                <p className="mt-1 text-sm text-slate-500">{deletePlanTarget.date} | {deletePlanTarget.route} | {deletePlanTarget.truckName} | {deletePlanTarget.dropPoint}</p>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              แผนนี้จะถูกลบออกจากรายการและไม่สามารถนำกลับคืนได้ กรุณาตรวจสอบข้อมูลก่อนยืนยัน
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => !isSavingPlan && setDeletePlanTarget(null)} disabled={isSavingPlan} className="rounded-xl border px-5 py-2.5 disabled:opacity-50">กลับ</button>
              <button type="button" onClick={() => void handleDeletePlan()} disabled={isSavingPlan} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 font-semibold text-white disabled:opacity-60">
                {isSavingPlan && <Loader2 className="h-4 w-4 animate-spin" />} ลบแผน
              </button>
            </div>
          </div>
        </div>
      )}
      {cancelTarget && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-bold">ยืนยันยกเลิก Plan</h2>
            <p className="mt-2 text-sm text-slate-500">{cancelTarget.codeRun} | {cancelTarget.truckName}</p>
            <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">แผนนี้จะเปลี่ยนเป็นยกเลิก และสามารถคืนสถานะได้ภายหลัง</p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setCancelTarget(null)} disabled={isSavingPlan} className="rounded-xl border px-5 py-2.5 disabled:opacity-50">กลับ</button>
              <button type="button" onClick={() => void handleCancelPlan()} disabled={isSavingPlan} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 font-semibold text-white disabled:opacity-60">
                {isSavingPlan && <Loader2 className="h-4 w-4 animate-spin" />} ยืนยันยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

      {restoreTarget && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-bold">คืนค่า {restoreTarget.codeRun}</h2>
            <p className="mt-2 text-sm text-slate-500">เลือกประเภทของแผนที่ต้องการคืนค่า</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => void handleRestorePlan('REGULAR')} disabled={isSavingPlan} className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-60">REGULAR</button>
              <button type="button" onClick={() => void handleRestorePlan('EXTRA')} disabled={isSavingPlan} className="rounded-xl bg-purple-600 px-4 py-3 font-semibold text-white disabled:opacity-60">EXTRA</button>
            </div>
            <button type="button" onClick={() => setRestoreTarget(null)} disabled={isSavingPlan} className="mt-3 w-full rounded-xl border px-4 py-2.5 disabled:opacity-50">ยกเลิก</button>
          </div>
        </div>
      )}
    </div>
  );
}
