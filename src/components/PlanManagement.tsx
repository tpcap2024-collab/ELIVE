import { useMemo, useRef, useState } from 'react';
import type {
  ChangeEvent,
  DragEvent,
  FormEvent,
} from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Edit3,
  FileSpreadsheet,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
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
  createPlanPeriod,
  fetchDailyPlans,
  fetchMasterPlan,
  previewPlanPeriod,
  restoreDailyPlan,
  updateDailyPlan,
} from '../lib/sheets';
import type {
  DailyPlan,
  DailyPlansResult,
  EditablePlan,
  MasterPlanRow,
  MasterPlanValidationError,
  PlanCreationResult,
  PlanPeriodPreview,
  PlanRemark,
  PlanSource,
} from '../lib/sheets';

type MainTab = 'create' | 'daily';
type DailyFilter = 'ALL' | PlanRemark;
type PlanDialogMode = 'extra' | 'edit';

type NoticeState = {
  type: 'success' | 'error' | 'info';
  message: string;
};

type PlanManagementProps = {
  onPlanCreated?: (
    result: PlanCreationResult
  ) => void | Promise<void>;
};

type FormField = {
  field: keyof EditablePlan;
  label: string;
  type: 'text' | 'date' | 'time';
  required: boolean;
};

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
  remark: 'EXTRA',
};

const FORM_FIELDS: FormField[] = [
  {
    field: 'date',
    label: 'Date',
    type: 'date',
    required: true,
  },
  {
    field: 'route',
    label: 'Route',
    type: 'text',
    required: true,
  },
  {
    field: 'company',
    label: 'Company',
    type: 'text',
    required: true,
  },
  {
    field: 'truckName',
    label: 'Truck Name',
    type: 'text',
    required: true,
  },
  {
    field: 'truckType',
    label: 'Truck Type',
    type: 'text',
    required: true,
  },
  {
    field: 'driverName',
    label: 'Driver Name',
    type: 'text',
    required: false,
  },
  {
    field: 'telDriver',
    label: 'Tel Driver',
    type: 'text',
    required: false,
  },
  {
    field: 'project',
    label: 'Project',
    type: 'text',
    required: true,
  },
  {
    field: 'dropPoint',
    label: 'Drop Point',
    type: 'text',
    required: true,
  },
  {
    field: 'planEta',
    label: 'Plan ETA',
    type: 'time',
    required: true,
  },
  {
    field: 'planEtd',
    label: 'Plan ETD',
    type: 'time',
    required: true,
  },
];

const HEADER_ALIASES: Record<
  keyof Omit<MasterPlanRow, 'sheetRow'>,
  string[]
> = {
  route: [
    'route',
    'รหัสเส้นทาง',
    'เส้นทาง',
  ],
  company: [
    'company',
    'supplier',
    'suppliername',
    'บริษัท',
  ],
  truckName: [
    'truckname',
    'licenseplate',
    'plate',
    'ทะเบียนรถ',
  ],
  truckType: [
    'trucktype',
    'ประเภททรัค',
    'ประเภทรถ',
  ],
  driverName: [
    'drivername',
    'driver',
    'ชื่อคนขับ',
    'ชื่อผู้ขับขี่',
  ],
  telDriver: [
    'teldriver',
    'driverphone',
    'phone',
    'เบอร์โทร',
    'เบอร์คนขับ',
  ],
  project: [
    'project',
    'โครงการ',
  ],
  dropPoint: [
    'droppoint',
    'dock',
    'doc',
    'จุดลงงาน',
    'จุดส่งงาน',
  ],
  planEta: [
    'planeta',
    'eta',
    'เวลาเข้า',
  ],
  planEtd: [
    'planetd',
    'etd',
    'เวลาออก',
  ],
};

function bangkokDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function getError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(
    error ||
    'เกิดข้อผิดพลาด'
  );
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
  if (
    typeof value === 'number' &&
    Number.isFinite(value)
  ) {
    const minutes =
      Math.round(value * 1440) % 1440;

    const hour =
      Math.floor(minutes / 60);

    const minute =
      minutes % 60;

    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  const match = String(value ?? '')
    .trim()
    .match(/^(\d{1,2}):(\d{2})/);

  if (!match) {
    return '';
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return '';
  }

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function findColumn(
  headers: string[],
  aliases: string[]
): number {
  const choices =
    aliases.map(cleanHeader);

  return headers.findIndex(
    header =>
      choices.includes(header)
  );
}

function parseTemplateRows(
  rawRows: unknown[][]
): {
  rows[: MasterPlanRow[];
 validationErrors: MasterPlanValidationError[];
} {
  if (rawRows.length < 2) {
    throw new Error(
      'ไฟล์ต้องมีหัวตารางและข้อมูลอย่างน้อย 1 แถว'
    );
  }

  const headers =
    rawRows[0].map(cleanHeader);

  const indexes = Object.fromEntries(
    Object.entries(HEADER_ALIASES).map(
      ([key, aliases]) => [
        key,
        findColumn(headers, aliases),
      ]
    )
  ) as Record<
    keyof Omit<MasterPlanRow, 'sheetRow'>,
    number
  >;

  const missing = Object.entries(indexes)
    .[
,
Column(headers, aliases),
 as Record<
 Omit<MasterPlanRow, ' key);

  if (missing.length > 0) {
    throw new Error(
      `ไม่พบคอลัมน์ที่จำเป็น: ${missing.join(', ')}`
    );
  }

  const rows: MasterPlanRow[] = [];
  const validationErrors:
    MasterPlanValidationError[] = [];

  rawRows
    .slice(1, 501)
    .forEach((rawRow, index) => {
      const sheetRow =
        index + 2;

      const row: MasterPlanRow = {
        sheetRow,
        route:
          cleanCell(rawRow[indexes.route]),
        company:
          cleanCell(rawRow[indexes.company]),
        truckName:
          cleanCell(rawRow[indexes.truckName]),
        truckType:
          cleanCell(rawRow[indexes.truckType]),
        driverName:
          cleanCell(rawRow[indexes.driverName]),
        telDriver:
          cleanCell(rawRow[indexes.telDriver]),
        project:
          cleanCell(rawRow[indexes.project]),
        dropPoint:
          cleanCell(rawRow[indexes.dropPoint]),
        planEta:
          normalizeTime(rawRow[indexes.planEta]),
        planEtd:
          normalizeTime(rawRow[indexes.planEtd]),
      };

      const isEmpty =
        Object.entries(row).every(
          ([key, value]) =>
            key === 'sheetRow' ||
            value === ''
        );

      if (isEmpty) {
        return;
      }

      const errors: string[] = [];

      if (!row.route) {
        errors.push('Route ว่าง');
      }

      if (!row.company) {
        errors.push('Company ว่าง');
      }

      if (!row.truckName) {
        errors.push('Truck Name ว่าง');
      }

      if (!row.truckType) {
        errors.push('Truck Type ว่าง');
      }

      if (!row.project) {
        errors.push('Project ว่าง');
      }

      if (!row.dropPoint) {
        errors.push('Drop Point ว่าง');
      }

      if (!row.planEta) {
        errors.push('Plan ETA ไม่ถูกต้อง');
      }

      if (!row.planEtd) {
        errors.push('Plan ETD ไม่ถูกต้อง');
      }

      if (errors.length > 0) {
        validationErrors.push({
          sheetRow,
          errors,
        });
      }

      rows.push(row);
    });

  if (rows.length === 0) {
    throw new Error(
      'ไม่พบข้อมูล Plan ในไฟล์'
    );
  }

  return {
    rows,
    validationErrors,
  };
}

async function readPlanFile(
  file: File
): Promise<unknown[][]> {
  const extension = file.name
    .split('.')
    .pop()
    ?.toLowerCase();

  if (
    !extension ||
    !['xlsx', 'xls', 'csv'].includes(extension)
  ) {
    throw new Error(
      'รองรับเฉพาะไฟล์ .xlsx, .xls และ .csv'
    );
  }

  if (
    file.size >
    5 * 1024 * 1024
  ) {
    throw new Error(
      'ไฟล์ต้องมีขนาดไม่เกิน 5 MB'
    );
  }

  const fileBuffer =
    await file.arrayBuffer();

  const workbook =
    XLSX.read(fileBuffer, {
      type: 'array',
    });

  const firstSheet =
    workbook.SheetNames[0];

  if (!firstSheet) {
    throw new Error(
      'ไม่พบ Worksheet ในไฟล์'
    );
  }

  return XLSX.utils.sheet_to_json<unknown[]>(
    workbook.S[heets[firstSheet],
   {
      header: 1,
      raw: true,
      defval: '',
      blankrows: false,
    }
  );
}

function StatCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  tone?:
    | 'default'
    | 'blue'
    | 'green'
    | 'amber'
    | 'red'
    | 'purple';
}) {
  const tones = {
    default:
      'border-slate-200 bg-white text-slate-900',
    blue:
      'border-blue-200 bg-blue-50 text-blue-800',
    green:
      'border-emerald-200 bg-emerald-50 text-emerald-800',
    amber:
      'border-amber-200 bg-amber-50 text-amber-800',
    red:
      'border-red-200 bg-red-50 text-red-800',
    purple:
      'border-purple-200 bg-purple-50 text-purple-800',
  };

  return (
    <div
      className={`rounded-xl border p-4 shadow-sm ${tones[tone]}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">
        {label}
      </p>

      <p className="mt-2 text-2xl font-bold tabular-nums">
        {value}
      </p>
    </div>
  );
}

function RemarkBadge({
  remark,
}: {
  remark: PlanRemark;
}) {
  const classes = {
    REGULAR:
      'bg-blue-100 text-blue-700',
    EXTRA:
      'bg-purple-100 text-purple-700',
    CANCEL:
      'bg-red-100 text-red-700',
  };

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-bold ${classes[remark]}`}
    >
      {remark}
    </span>
  );
}

export default function PlanManagement({
  onPlanCreated,
}: PlanManagementProps) {
  const today =
    useMemo(bangkokDate, []);

  const fileInputRef =
    useRef<HTMLInputElement>(null);

  const [tab, setTab] =
    useState<MainTab>('create');

  const [notice, setNotice] =
    useState<NoticeState | null>(null);

  const [source, setSource] =
    useState<PlanSource | null>(null);

  const [templateRows, setTemplateRows] =
    useState<MasterPlanRow[]>([]);

  const [
    validationErrors,
    setValidationErrors,
  [
Errors,
te<
    MasterPlanValidationError[]
  >([]);

  const [fileName, setFileName] =
    useState('');

  const [startDate, setStartDate] =
    useState(today);

  const [endDate, setEndDate] =
    useState(today);

  const [workingDays, setWorkingDays] =
    useState<number[]>([
      1,
      2,
      3,
      4,
      5,
      6,
    ]);

  const[
1,
2,
3,
4,
5,
6,
 ] =
    useState<PlanPeriodPreview | null>(
      null
    );

  const [
    creationResult,
    setCreationResult,
  [
Result,
CreationResult,
] =nResult | null
  >(null);

  const [
    templateSearch,
    setTemplateSearch,
  [
Search,
TemplateSearch,
] =    isLoadingSource,
    setIsLoadingSource,
  [
LoadingSource,
IsLoadingSource,
  isPreviewing,
    setIsPreviewing,
  [
Previewing,
IsPreviewing,
] = useState(false);

  setIsCreating,
  [
Creating,
IsCreating,
] = useStateisDragging,
    setIsDragging,
  [
Dragging,
IsDragging,
] = useStateshowCreateConfirmation,
    setShowCreateConfirmation,
  [
CreateConfirmation,
ShowCreateConfirmationtDailyDate] =
    useState(today);

  const [dailyResult, setDailyResult] =
    useState<DailyPlansResult | null>(
      null
    );

  const [dailySearch, setDailySearch] =
    useState('');

  const [dailyFilter, setDailyFilter] =
    useState<DailyFilter>('ALL');

  const [
    isLoadingDaily,
    setIsLoadingDaily,
  [
LoadingDaily,
IsLoadingDaily,
] = planDialogMode,
    setPlanDialogMode,
  [
DialogMode,
PlanDialogMode,
] =| null
  >(null);

  const [
    editingCodeRun,
    setEditingCodeRun,
  [
CodeRun,
EditingCodeRun,
] =anForm, setPlanForm] =
    useState<EditablePlan>({
      ...EMPTY_PLAN,
      date: today,
    });

  const [
    isSavingPlan,
    setIsSavingPlan,
  [
SavingPlan,
IsSavingPlan,
] = useState(falseet,
    setCancelTarget,
  [
Target,
CancelTarget,
] = useState<DailyPlan | null>(

    restoreTarget,
    setRestoreTarget,
  [
Target,
RestoreTarget,
] = useState<DailyPlan | null>(
lectedWorkingDays =
    useMemo(
      () =>
        [...new Set(workingDays)].sort(
          (first, second) =>
            first - second
        ),
      [workingDays]
    );

  const filteredTemplateRows =
    useMemo(() => {
      const query =
        templateSearch
          .trim()
          .toLowerCase();

      if (!query) {
        return templateRows;
      }

      return templateRows.filter(
        row =>
          [
            row.route,
            row.company,
            row.truckName,
            row.driverName,
            row.project,
            row.dropPoint,
          ]
            .join(' ')
            .toLowerCase()
            .includes(query)
      );
    }, [
      templateRows,
      templateSearch,
    ]);

  const filteredDailyRows =
    useMemo(() => {
      const query =
        dailySearch
          .trim()
          .toLowerCase();

      return (
        daily[
Rows,
Search,
 filteredDailyRows ow => {
        const matchesFilter =
          dailyFilter === 'ALL' ||
          row.remark === dailyFilter;

        const matchesSearch =
          !query ||
          [
            row.codeRun,
            row.route,
            row.company,
            row.truckName,
            row.driverName,
            row.dropPoint,
          ]
            .join(' ')
            .toLowerCase()
            .includes(query);

        return (
          matchesFilter &&
          matchesSearch
        );
      });
    }, [
      dailyResult,
      dailyFilter,
      dailySearch,
    ]);

  const createBusy =
    isLoadingSource ||
    isPreviewing ||
    isCreating;

  const canPreview = Boolean(
    source &&
    templateRows.length > 0 &&
    validationErrors.length === 0 &&
    startDate &&
    endDate &&
    selectedWorkingDays.length > 0 &&
    !createBusy
  );

  const resetCreateResult =
    () => {
      setPreview(null);
      setCreationResult(null);
      setShowCreateConfirmation(
        false
      );
    };

  const clearSource =
    () => {
      setSource(null);
      set[
Result,
Filter,
Search,
 createBusyErrors([]);
      setFileName('');
      setTemplateSearch('');
      setNotice(null);

      resetCreateResult();

      if (fileInputRef.current) {
        fileInputRef.current.value =
          '';
      }
    };

  const handleLoadMasterPlan =
    async () => {
      setIsLoadingSource(true);
      setNotice(null);

      resetCreateResult();

      try {
        const result =
          await fetchMasterPlan(true);

        setSource('master-plan');
        setTemplateRows(result.rows);
        setValidationErrors(
          result.validationErrors
        );
        setFileName('Master Plan');

        setNotice({
          type:
            result.validationErrors
              .length > 0
              ? 'error'
              : 'success',
          message:
            result.validationErrors
              .length > 0
              ? `Master Plan มีข้อมูลที่ต้องแก้ไข ${result.validationErrors.length} แถว`
              : `โหลด Master Plan สำเร็จ ${result.rows.length} เที่ยวต่อวัน`,
        });
      } catch (error) {
        setNotice({
          type: 'error',
          message: getError(error),
        });
      } finally {
        setIsLoadingSource(false);
      }
    };

  const handleFile =
    async (file: File) => {
      setIsLoadingSource(true);
      setNotice(null);

      resetCreateResult();

      try {
        const rawRows =
          await readPlanFile(file);

        const parsed =
          parseTemplateRows(rawRows);

        setSource('uploaded-file');
        setTemplateRows(parsed.rows);
        setValidationErrors(
          parsed.validationErrors
        );
        setFileName(file.name);

        setNotice({
          type:
            parsed.validationErrors
              .length > 0
              ? 'error'
              : 'success',
          message:
            parsed.validationErrors
              .length > 0
              ? `ไฟล์มีข้อมูลที่ต้องแก้ไข ${parsed.validationErrors.length} แถว`
              : `อ่านไฟล์สำเร็จ ${parsed.rows.length} เที่ยวต่อวัน`,
        });
      } catch (error) {
        clearSource();

        setNotice({
          type: 'error',
          message: getError(error),
        });
      } finally {
        setIsLoadingSource(false);
      }
    };

  const handleFileInput =
    (
      event:
        ChangeEvent<HTMLInputElement>
    ) => {
      const file =
        event.target.files?.[0];

      if (file) {
        void handleFile(file);
      }
    };

  const handleDrop =
    (
      event:
        DragEvent<HTMLDivElement>
    ) => {
      event.preventDefault();

      setIsDragging(false);

      const file =
        event.dataTransfer.files?.[0];

      if (file) {
        void handleFile(file);
      }
    };

  const toggleWorkingDay =
    (day: number) => {
      setWorkingDays(current =>
        current.includes(day)
          ? current.filter(
              value =>
                value !== day
            )
          : [...current, day].sort(
              (first, second) =>
                first - second
            )
      );

      resetCreateResult();
    };

  const buildPeriodRequest =
    () => ({
      startDate,
      endDate,
      workingDays:
        selectedWorkingDays,
      source:
        source || 'master-plan',
      templateRows:
        source === 'uploaded-file'
          ? templateRows
          : undefined,
      fileName:
        source === 'uploaded-file'
          ? fileName
          : undefined,
    });

  const handlePreview =
    async () => {
      if (!canPreview) {
        return;
      }

      setIsPreviewing(true);
      setNotice(null);
      setCreationResult(null);

      try {
        const result =
          await previewPlanPeriod(
            buildPeriodRequest()
          );

        setPreview(result);

        setNotice({
          type:
            result.newRowCount > 0
              ? 'success'
              : 'info',
          message:
            result.newRowCount > 0
              ? `Preview สำเร็จ พบรายการใหม่ ${result.newRowCount} รายการ`
              : 'ไม่มีรายการใหม่ รายการทั้งหมดมีอยู่ใน Plan แล้ว',
        });
      } catch (error) {
        setPreview(null);

        setNotice({
          type: 'error',
          message: getError(error),
        });
      } finally {
        setIsPreviewing(false);
      }
    };

  const handleCreatePeriod =
    async () => {
      if (
        !preview ||
        preview.newRowCount <= 0
      ) {
        return;
      }

      setShowCreateConfirmation(
        false
      );

      setIsCreating(true);
      setNotice(null);

      try {
        const result =
          await createPlanPeriod(
            buildPeriodRequest()
          );

        setCreationResult(result);

        const refreshedPreview =
          await previewPlanPeriod(
            buildPeriodRequest()
          );

        setPreview(
          refreshedPreview
        );

        setNotice({
          type: 'success',
          message:
            `สร้าง Plan สำเร็จ ${result.createdRowCount} รายการ`,
        });

        if (onPlanCreated) {
          await onPlanCreated(result);
        }
      } catch (error) {
        setNotice({
          type: 'error',
          message: getError(error),
        });
      } finally {
        setIsCreating(false);
      }
    };

  const loadDailyPlans =
    async (
      date = dailyDate,
      showMessage = true
    ): Promise<DailyPlansResult> => {
      setIsLoadingDaily(true);

      if (showMessage) {
        setNotice(null);
      }

      try {
        const result =
          await fetchDailyPlans(date);

        setDailyResult(result);

        if (showMessage) {
          setNotice({
            type: 'success',
            message:
              `โหลดแผนวันที่ ${date} สำเร็จ ${result.rowCount} รายการ`,
          });
        }

        return result;
      } catch (error) {
        if (showMessage) {
          setDailyResult(null);

          setNotice({
            type: 'error',
            message: getError(error),
          });
        }

        throw error;
      } finally {
        setIsLoadingDaily(false);
      }
    };

  const openExtraDialog =
    () => {
      if (isSavingPlan) {
        return;
      }

      setPlanDialogMode('extra');
      setEditingCodeRun('');

      setPlanForm({
        ...EMPTY_PLAN,
        date: dailyDate,
        remark: 'EXTRA',
      });
    };

  const openEditDialog =
    (plan: DailyPlan) => {
      if (isSavingPlan) {
        return;
      }

      setPlanDialogMode('edit');
      setEditingCodeRun(
        plan.codeRun
      );

      setPlanForm({
        date: plan.date,
        route: plan.route,
        company: plan.company,
        truckName:
          plan.truckName,
        truckType:
          plan.truckType,
        driverName:
          plan.driverName,
        telDriver:
          plan.telDriver,
        project:
          plan.project,
        dropPoint:
          plan.dropPoint,
        planEta:
          plan.planEta,
        planEtd:
          plan.planEtd,
        remark:
          plan.remark,
      });
    };

  const closePlanDialog =
    () => {
      if (isSavingPlan) {
        return;
      }

      setPlanDialogMode(null);
      setEditingCodeRun('');
    };

  const handleSavePlan =
    async (
      event: FormEvent
    ) => {
      event.preventDefault();

      if (
        !planDialogMode ||
        isSavingPlan
      ) {
        return;
      }

      const currentMode =
        planDialogMode;

      const currentCodeRun =
        editingCodeRun;

      const submittedPlan:
        EditablePlan = {
        ...planForm,
      };

      setIsSavingPlan(true);
      setNotice(null);

      if (
        currentMode === 'extra'
      ) {
        try {
          const result =
            await createExtraPlan({
              ...submittedPlan,
              remark: 'EXTRA',
            });

          setDailyDate(
            submittedPlan.date
          );

          setPlanDialogMode(null);
          setEditingCodeRun('');

          try {
            await loadDailyPlans(
              submittedPlan.date,
              false
            );
          } catch (
            refreshError
          ) {
            console.error(
              'Unable to refresh daily Plans after creating Extra Plan:',
              refreshError
            );
          }

          setNotice({
            type: 'success',
            message:
              `เพิ่มเที่ยว Extra เรียบร้อยแล้ว Code run: ${result.codeRun}`,
          });
        } catch (error) {
          let refreshed = false;

          try {
            setDailyDate(
              submittedPlan.date
            );

            await loadDailyPlans(
              submittedPlan.date,
              false
            );

            refreshed = true;
          } catch (
            refreshError
          ) {
            console.error(
              'Unable to verify Extra Plan after create response error:',
              refreshError
            );
          }

          setPlanDialogMode(null);
          setEditingCodeRun('');

          setNotice({
            type:
              refreshed
                ? 'info'
                : 'error',
            message:
              refreshed
                ? 'ไม่ได้รับการยืนยันจากเซิร์ฟเวอร์ แต่ระบบโหลดข้อมูลล่าสุดแล้ว กรุณาตรวจสอบรายการ Extra ในตารางก่อนเพิ่มใหม่'
                : `ไม่ได้รับการยืนยันจากเซิร์ฟเวอร์และไม่สามารถโหลดข้อมูลล่าสุดได้ กรุณากดโหลดแผนประจำวันก่อนเพิ่มใหม่ รายละเอียด: ${getError(error)}`,
          });
        } finally {
          setIsSavingPlan(false);
        }

        return;
      }

      try {
        await updateDailyPlan(
          currentCodeRun,
          submittedPlan
        );

        setDailyDate(
          submittedPlan.date
        );

        setPlanDialogMode(null);
        setEditingCodeRun('');

        await loadDailyPlans(
          submittedPlan.date,
          false
        );

        setNotice({
          type: 'success',
          message:
            `แก้ไข ${currentCodeRun} สำเร็จ`,
        });
      } catch (error) {
        try {
          await loadDailyPlans(
            submittedPlan.date,
            false
          );
        } catch (
          refreshError
        ) {
          console.error(
            'Unable to refresh daily Plans after update error:',
            refreshError
          );
        }

        setNotice({
          type: 'error',
          message: getError(error),
        });
      } finally {
        setIsSavingPlan(false);
      }
    };

  const handleCancelPlan =
    async () => {
      if (
        !cancelTarget ||
        isSavingPlan
      ) {
        return;
      }

      const target =
        cancelTarget;

      setIsSavingPlan(true);
      setNotice(null);

      try {
        await cancelDailyPlan(
          target.codeRun
        );

        setCancelTarget(null);

        await loadDailyPlans(
          dailyDate,
          false
        );

        setNotice({
          type: 'success',
          message:
            `ยกเลิก ${target.codeRun} สำเร็จ`,
        });
      } catch (error) {
        try {
          await loadDailyPlans(
            dailyDate,
            false
          );
        } catch (
          refreshError
        ) {
          console.error(
            'Unable to refresh daily Plans after cancel error:',
            refreshError
          );
        }

        setNotice({
          type: 'error',
          message: getError(error),
        });
      } finally {
        setIsSavingPlan(false);
      }
    };

  const handleRestorePlan =
    async (
      restoreAs:
        | 'REGULAR'
        | 'EXTRA'
    ) => {
      if (
        !restoreTarget ||
        isSavingPlan
      ) {
        return;
      }

      const target =
        restoreTarget;

      setIsSavingPlan(true);
      setNotice(null);

      try {
        await restoreDailyPlan(
          target.codeRun,
          restoreAs
        );

        setRestoreTarget(null);

        await loadDailyPlans(
          dailyDate,
          false
        );

        setNotice({
          type: 'success',
          message:
            `คืนค่า ${target.codeRun} เป็น ${restoreAs} สำเร็จ`,
        });
      } catch (error) {
        try {
          await loadDailyPlans(
            dailyDate,
            false
          );
        } catch (
          refreshError
        ) {
          console.error(
            'Unable to refresh daily Plans after restore error:',
            refreshError
          );
        }

        setNotice({
          type: 'error',
          message: getError(error),
        });
      } finally {
        setIsSavingPlan(false);
      }
    };

  const setFormField = (
    field: keyof EditablePlan,
    value: string
  ) => {
    setPlanForm((current) => ({
      ...current,
      value,
    }));
  };
    
  return (
    <div className="min-h-full bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="bg-gradient-to-r from-blue-700 to-blue-600 px-5 py-5 text-white sm:px-6">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-white/15 p-3 ring-1 ring-white/25">
                <ClipboardList className="h-6 w-6" />
              </div>

              <div>
                <h1 className="text-xl font-bold sm:text-2xl">
                  Plan Management
                </h1>

                <p className="mt-1 text-sm text-blue-100">
                  สร้างแผนเป็นช่วง หรือจัดการแผนรายวันในจุดเดียว
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 border-b border-slate-200 bg-slate-50 p-2">
            <button
              type="button"
              onClick={() =>
                setTab('create')
              }
              className={`rounded-xl px-4 py-3 text-sm font-semibold transition ${
                tab === 'create'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-500'
              }`}
            >
              สร้างแผนตามช่วง
            </button>

            <button
              type="button"
              onClick={() =>
                setTab('daily')
              }
              className={`rounded-xl px-4 py-3 text-sm font-semibold transition ${
                tab === 'daily'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-500'
              }`}
            >
              ดูแผนประจำวัน
            </button>
          </div>

          {tab === 'create' ? (
            <div className="p-5 sm:p-6">
              {!source ? (
                <div className="grid gap-5 lg:grid-cols-2">
                  <button
                    type="button"
                    onClick={() =>
                      void handleLoadMasterPlan()
                    }
                    disabled={
                      isLoadingSource
                    }
                    className="rounded-2xl border-2 border-blue-200 bg-blue-50 p-7 text-left hover:border-blue-500 disabled:opacity-60"
                  >
                    <div className="flex gap-4">
                      <div className="rounded-xl bg-blue-600 p-3 text-white">
                        {isLoadingSource ? (
                          <Loader2 className="h-7 w-7 animate-spin" />
                        ) : (
                          <Sheet className="h-7 w-7" />
                        )}
                      </div>

                      <div>
                        <h2 className="text-lg font-bold text-blue-900">
                          โหลดจากแผนเดิม
                        </h2>

                        <p className="mt-2 text-sm text-blue-700">
                          อ่านจากชีต Master Plan เมื่อกดปุ่ม
                        </p>
                      </div>
                    </div>
                  </button>

                  <div
                    onDragOver={event => {
                      event.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() =>
                      setIsDragging(false)
                    }
                    onDrop={handleDrop}
                    className={`rounded-2xl border-2 border-dashed p-7 ${
                      isDragging
                        ? 'border-emerald-500 bg-emerald-100'
                        : 'border-emerald-200 bg-emerald-50'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={
                        handleFileInput
                      }
                      className="hidden"
                    />

                    <button
                      type="button"
                      onClick={() =>
                        fileInputRef.current?.click()
                      }
                      className="flex w-full gap-4 text-left"
                    >
                      <div className="rounded-xl bg-emerald-600 p-3 text-white">
                        <Upload className="h-7 w-7" />
                      </div>

                      <div>
                        <h2 className="text-lg font-bold text-emerald-900">
                          อัปโหลดไฟล์ Plan
                        </h2>

                        <p className="mt-2 text-sm text-emerald-700">
                          รองรับ .xlsx, .xls, .csv ไม่เกิน 5 MB
                        </p>
                      </div>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className={`rounded-xl p-3 text-white ${
                            source === 'master-plan'
                              ? 'bg-blue-600'
                              : 'bg-emerald-600'
                          }`}
                        >
                          {source === 'master-plan' ? (
                            <Sheet className="h-6 w-6" />
                          ) : (
                            <FileSpreadsheet className="h-6 w-6" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <p className="font-semibold">
                            {source === 'master-plan'
                              ? 'Master Plan'
                              : 'Uploaded File'}
                          </p>

                          <p className="truncate text-sm text-slate-500">
                            {fileName}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={clearSource}
                        disabled={createBusy}
                        className="rounded-lg p-2 text-slate-500 hover:bg-slate-200"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <StatCard
                        label="เที่ยวต่อวัน"
                        value={templateRows.length}
                        tone="blue"
                      />

                      <StatCard
                        label="Validation"
                        value={
                          validationErrors.length > 0
                            ? `${validationErrors.length} จุด`
                            : 'ผ่าน'
                        }
                        tone={
                          validationErrors.length > 0
                            ? 'amber'
                            : 'green'
                        }
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center gap-2 font-semibold">
                      <CalendarDays className="h-5 w-5 text-blue-600" />
                      ช่วงวันที่สร้าง Plan
                    </div>

                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <label className="text-sm font-medium text-slate-700">
                        วันที่เริ่มต้น

                        <input
                          type="date"
                          value={startDate}
                          onChange={event => {
                            setStartDate(
                              event.target.value
                            );
                            resetCreateResult();
                          }}
                          className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5"
                        />
                      </label>

                      <label className="text-sm font-medium text-slate-700">
                        วันที่สิ้นสุด

                        <input
                          type="date"
                          value={endDate}
                          min={startDate}
                          onChange={event => {
                            setEndDate(
                              event.target.value
                            );
                            resetCreateResult();
                          }}
                          className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5"
                        />
                      </label>
                    </div>

                    <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-7">
                      {WORKING_DAYS.map(day => (
                        <button
                          key={day.value}
                          type="button"
                          title={day.full}
                          onClick={() =>
                            toggleWorkingDay(
                              day.value
                            )
                          }
                          className={`rounded-xl border px-2 py-2.5 text-sm font-semibold ${
                            selectedWorkingDays.includes(
                              day.value
                            )
                              ? 'border-blue-600 bg-blue-600 text-white'
                              : 'border-slate-300'
                          }`}
                        >
                          {day.short}
                        </button>
                      ))}
                    </div>

                    <div className="mt-5 flex justify-end">
                      <button
                        type="button"
                        onClick={() =>
                          void handlePreview()
                        }
                        disabled={!canPreview}
                        className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white disabled:bg-slate-300"
                      >
                        {isPreviewing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Search className="h-4 w-4" />
                        )}

                        Preview Plan
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-5 p-5 sm:p-6">
              <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 lg:flex-row lg:items-end">
                <label className="block text-sm font-medium text-slate-700">
                  วันที่ดูแผน

                  <input
                    type="date"
                    value={dailyDate}
                    onChange={event =>
                      setDailyDate(
                        event.target.value
                      )
                    }
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 lg:w-52"
                  />
                </label>

                <button
                  type="button"
                  onClick={() =>
                    void loadDailyPlans(
                      dailyDate,
                      true
                    )
                  }
                  disabled={isLoadingDaily}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {isLoadingDaily ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}

                  โหลดแผนประจำวัน
                </button>

                <button
                  type="button"
                  onClick={openExtraDialog}
                  disabled={isSavingPlan}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60 lg:ml-auto"
                >
                  <Plus className="h-4 w-4" />
                  เพิ่ม Extra Plan
                </button>
              </div>

              {dailyResult && (
                <>
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                    <StatCard
                      label="ทั้งหมด"
                      value={dailyResult.rowCount}
                    />

                    <StatCard
                      label="ใช้งาน"
                      value={dailyResult.activeCount}
                      tone="green"
                    />

                    <StatCard
                      label="REGULAR"
                      value={dailyResult.regularCount}
                      tone="blue"
                    />

                    <StatCard
                      label="EXTRA"
                      value={dailyResult.extraCount}
                      tone="purple"
                    />

                    <StatCard
                      label="CANCEL"
                      value={dailyResult.cancelCount}
                      tone="red"
                    />
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                      <input
                        value={dailySearch}
                        onChange={event =>
                          setDailySearch(
                            event.target.value
                          )
                        }
                        placeholder="ค้นหา Code run, Route, ทะเบียนรถ..."
                        className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-3"
                      />
                    </div>

                    <select
                      value={dailyFilter}
                      onChange={event =>
                        setDailyFilter(
                          event.target
                            .value as DailyFilter
                        )
                      }
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                    >
                      <option value="ALL">
                        ทุกประเภท
                      </option>
                      <option value="REGULAR">
                        REGULAR
                      </option>
                      <option value="EXTRA">
                        EXTRA
                      </option>
                      <option value="CANCEL">
                        CANCEL
                      </option>
                    </select>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-100 text-left text-xs font-semibold uppercase text-slate-600">
                        <tr>
                          {[
                            'Code Run',
                            'Type',
                            'Route',
                            'Company',
                            'Truck Name',
                            'Drop Point',
                            'ETA',
                            'ETD',
                            'Action',
                          ].map(heading => (
                            <th
                              key={heading}
                              className="px-4 py-3"
                            >
                              {heading}
                            </th>
                          ))}
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-slate-100 bg-white">
                        {filteredDailyRows.length === 0 ? (
                          <tr>
                            <td
                              colSpan={9}
                              className="px-4 py-10 text-center text-slate-500"
                            >
                              ไม่พบแผนในวันที่เลือก
                            </td>
                          </tr>
                        ) : (
                          filteredDailyRows.map(plan => (
                            <tr
                              key={plan.codeRun}
                              className={
                                plan.remark === 'CANCEL'
                                  ? 'bg-red-50/50 text-slate-500'
                                  : 'hover:bg-blue-50/40'
                              }
                            >
                              <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-900">
                                {plan.codeRun}
                              </td>

                              <td className="whitespace-nowrap px-4 py-3">
                                <RemarkBadge
                                  remark={plan.remark}
                                />
                              </td>

                              <td className="whitespace-nowrap px-4 py-3">
                                {plan.route}
                              </td>

                              <td className="whitespace-nowrap px-4 py-3">
                                {plan.company}
                              </td>

                              <td className="whitespace-nowrap px-4 py-3 font-medium">
                                {plan.truckName}
                              </td>

                              <td className="whitespace-nowrap px-4 py-3">
                                {plan.dropPoint}
                              </td>

                              <td className="whitespace-nowrap px-4 py-3 font-mono">
                                {plan.planEta}
                              </td>

                              <td className="whitespace-nowrap px-4 py-3 font-mono">
                                {plan.planEtd}
                              </td>

                              <td className="whitespace-nowrap px-4 py-3">
                                <div className="flex gap-2">
                                  {plan.remark !== 'CANCEL' ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          openEditDialog(plan)
                                        }
                                        disabled={isSavingPlan}
                                        className="rounded-lg bg-blue-50 p-2 text-blue-600 disabled:opacity-50"
                                        title="แก้ไข"
                                      >
                                        <Edit3 className="h-4 w-4" />
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() =>
                                          setCancelTarget(plan)
                                        }
                                        disabled={isSavingPlan}
                                        className="rounded-lg bg-red-50 p-2 text-red-600 disabled:opacity-50"
                                        title="ยกเลิก"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setRestoreTarget(plan)
                                      }
                                      disabled={isSavingPlan}
                                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 disabled:opacity-50"
                                    >
                                      <RotateCcw className="h-4 w-4" />
                                      คืนค่า
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

        {notice && (
          <div
            className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${
              notice.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : notice.type === 'error'
                  ? 'border-red-200 bg-red-50 text-red-800'
                  : 'border-blue-200 bg-blue-50 text-blue-800'
            }`}
          >
            {notice.type === 'success' ? (
              <CheckCircle2 className="h-5 w-5 shrink-0" />
            ) : notice.type === 'error' ? (
              <XCircle className="h-5 w-5 shrink-0" />
            ) : (
              <RefreshCw className="h-5 w-5 shrink-0" />
            )}

            <span>
              {notice.message}
            </span>
          </div>
        )}

        {tab === 'create' &&
          validationErrors.length > 0 && (
            <section className="rounded-2xl border border-red-200 bg-red-50 p-5">
              <div className="flex items-center gap-2 font-semibold text-red-800">
                <AlertTriangle className="h-5 w-5" />
                กรุณาแก้ข้อมูลต้นแบบก่อน Preview
              </div>

              <div className="mt-3 max-h-56 space-y-2 overflow-auto">
                {validationErrors.map(item => (
                  <div
                    key={item.sheetRow}
                    className="rounded-lg bg-white px-3 py-2 text-sm text-red-700"
                  >
                    แถว {item.sheetRow}: {item.errors.join(', ')}
                  </div>
                ))}
              </div>
            </section>
          )}

        {tab === 'create' &&
          preview && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-lg font-bold">
                ผล Preview
              </h2>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  label="วันทำงาน"
                  value={preview.workingDateCount}
                  tone="blue"
                />

                <StatCard
                  label="รายการทั้งหมด"
                  value={preview.totalCandidateRows}
                />

                <StatCard
                  label="รายการใหม่"
                  value={preview.newRowCount}
                  tone="green"
                />

                <StatCard
                  label="รายการซ้ำ"
                  value={preview.duplicateRowCount}
                  tone="amber"
                />
              </div>

              <div className="mt-5 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-slate-500">
                    Code run สูงสุด
                  </p>
                  <b>
                    {preview.currentMaximumCodeRun}
                  </b>
                </div>

                <div>
                  <p className="text-xs text-slate-500">
                    เริ่มต้น
                  </p>
                  <b className="text-blue-700">
                    {preview.startCodeRun}
                  </b>
                </div>

                <div>
                  <p className="text-xs text-slate-500">
                    สุดท้าย
                  </p>
                  <b className="text-blue-700">
                    {preview.endCodeRun}
                  </b>
                </div>
              </div>

              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() =>
                    setShowCreateConfirmation(true)
                  }
                  disabled={
                    preview.newRowCount <= 0 ||
                    createBusy
                  }
                  className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white disabled:bg-slate-300"
                >
                  Create Plan
                </button>
              </div>
            </section>
          )}

        {tab === 'create' &&
          creationResult && (
            <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
              <h2 className="font-bold">
                สร้าง Plan สำเร็จ
              </h2>

              <p className="mt-1 text-sm">
                สร้าง {creationResult.createdRowCount} รายการ
                {' '}
                ข้ามรายการซ้ำ {creationResult.duplicateRowCount} รายการ
              </p>
            </section>
          )}

        {tab === 'create' &&
          source && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-bold">
                    ข้อมูลต้นแบบ
                  </h2>

                  <p className="text-sm text-slate-500">
                    แสดง {filteredTemplateRows.length} จาก {templateRows.length}
                  </p>
                </div>

                <input
                  value={templateSearch}
                  onChange={event =>
                    setTemplateSearch(
                      event.target.value
                    )
                  }
                  placeholder="ค้นหาข้อมูลต้นแบบ..."
                  className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                />
              </div>

              <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-100 text-left text-xs font-semibold uppercase text-slate-600">
                    <tr>
                      {[
                        'Route',
                        'Company',
                        'Truck Name',
                        'Truck Type',
                        'Driver',
                        'Project',
                        'Drop Point',
                        'ETA',
                        'ETD',
                      ].map(heading => (
                        <th
                          key={heading}
                          className="px-4 py-3"
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {filteredTemplateRows.map(
                      (row, index) => (
                        <tr
                          key={`${row.sheetRow || index}-${row.route}-${row.truckName}`}
                        >
                          <td className="px-4 py-3">
                            {row.route}
                          </td>
                          <td className="px-4 py-3">
                            {row.company}
                          </td>
                          <td className="px-4 py-3 font-medium text-blue-700">
                            {row.truckName}
                          </td>
                          <td className="px-4 py-3">
                            {row.truckType}
                          </td>
                          <td className="px-4 py-3">
                            {row.driverName || '-'}
                          </td>
                          <td className="px-4 py-3">
                            {row.project}
                          </td>
                          <td className="px-4 py-3">
                            {row.dropPoint}
                          </td>
                          <td className="px-4 py-3 font-mono">
                            {row.planEta}
                          </td>
                          <td className="px-4 py-3 font-mono">
                            {row.planEtd}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}
      </div>

      {showCreateConfirmation &&
        preview && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/60 p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
              <h2 className="text-lg font-bold">
                ยืนยันการสร้าง Plan
              </h2>

              <p className="mt-2 text-sm text-slate-500">
                ระบบจะเขียน {preview.newRowCount} รายการลงชีต Plan
              </p>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setShowCreateConfirmation(false)
                  }
                  disabled={isCreating}
                  className="rounded-xl border px-5 py-2.5 disabled:opacity-50"
                >
                  ยกเลิก
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void handleCreatePeriod()
                  }
                  disabled={isCreating}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-white disabled:opacity-60"
                >
                  {isCreating && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  ยืนยันสร้าง
                </button>
              </div>
            </div>
          </div>
        )}

      {planDialogMode && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={handleSavePlan}
            className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">
                  {planDialogMode === 'extra'
                    ? 'เพิ่ม Extra Plan'
                    : `แก้ไข ${editingCodeRun}`}
                </h2>

                <p className="text-sm text-slate-500">
                  Code run จะสร้างอัตโนมัติและไม่สามารถแก้ไขได้
                </p>
              </div>

              <button
                type="button"
                onClick={closePlanDialog}
                disabled={isSavingPlan}
                className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FORM_FIELDS.map(item => (
                <label
                  key={item.field}
                  className="text-sm font-medium text-slate-700"
                >
                  {item.label}

                  <input
                    type={item.type}
                    value={String(
                      planForm[item.field] || ''
                    )}
                    onChange={event =>
                      setFormField(
                        item.field,
                        event.target.value
                      )
                    }
                    required={item.required}
                    disabled={isSavingPlan}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 disabled:bg-slate-100"
                  />
                </label>
              ))}

              {planDialogMode === 'edit' && (
                <label className="text-sm font-medium text-slate-700">
                  Remark

                  <select
                    value={
                      planForm.remark ||
                      'REGULAR'
                    }
                    onChange={event =>
                      setFormField(
                        'remark',
                        event.target.value
                      )
                    }
                    disabled={isSavingPlan}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 disabled:bg-slate-100"
                  >
                    <option value="REGULAR">
                      REGULAR
                    </option>
                    <option value="EXTRA">
                      EXTRA
                    </option>
                  </select>
                </label>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closePlanDialog}
                disabled={isSavingPlan}
                className="rounded-xl border px-5 py-2.5 disabled:opacity-50"
              >
                ยกเลิก
              </button>

              <button
                type="submit"
                disabled={isSavingPlan}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 font-semibold text-white disabled:opacity-60"
              >
                {isSavingPlan && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}

                {isSavingPlan
                  ? 'กำลังบันทึก...'
                  : 'บันทึก'}
              </button>
            </div>
          </form>
        </div>
      )}

      {cancelTarget && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6">
            <div className="flex gap-3">
              <div className="rounded-full bg-red-100 p-2 text-red-700">
                <AlertTriangle className="h-6 w-6" />
              </div>

              <div>
                <h2 className="text-lg font-bold">
                  ยืนยันยกเลิก Plan
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  {cancelTarget.codeRun} | {cancelTarget.truckName}
                </p>
              </div>
            </div>

            <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
              ระบบจะเปลี่ยน Remark เป็น CANCEL โดยไม่ลบแถวและไม่ลบ Actual data
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() =>
                  setCancelTarget(null)
                }
                disabled={isSavingPlan}
                className="rounded-xl border px-5 py-2.5 disabled:opacity-50"
              >
                กลับ
              </button>

              <button
                type="button"
                onClick={() =>
                  void handleCancelPlan()
                }
                disabled={isSavingPlan}
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 font-semibold text-white disabled:opacity-60"
              >
                {isSavingPlan && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                ยืนยันยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

      {restoreTarget && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6">
            <h2 className="text-lg font-bold">
              คืนค่า {restoreTarget.codeRun}
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              เลือกประเภทเดิมของแผน
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() =>
                  void handleRestorePlan(
                    'REGULAR'
                  )
                }
                disabled={isSavingPlan}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-60"
              >
                {isSavingPlan && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                REGULAR
              </button>

              <button
                type="button"
                onClick={() =>
                  void handleRestorePlan(
                    'EXTRA'
                  )
                }
                disabled={isSavingPlan}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-3 font-semibold text-white disabled:opacity-60"
              >
                {isSavingPlan && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                EXTRA
              </button>
            </div>

            <button
              type="button"
              onClick={() =>
                setRestoreTarget(null)
              }
              disabled={isSavingPlan}
              className="mt-3 w-full rounded-xl border px-4 py-2.5 disabled:opacity-50"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
