import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  TriangleAlert,
  Truck,
  XCircle,
} from 'lucide-react';

import {
  createPlanPeriod,
  fetchMasterPlan,
  MasterPlanResponse,
  PlanCreationResult,
  PlanPeriodPreview,
  previewPlanPeriod,
} from '../lib/sheets';

interface PlanManagementProps {
  onPlanCreated?: (
    result: PlanCreationResult
  ) => void | Promise<void>;
}

interface WorkingDayOption {
  value: number;
  shortLabel: string;
  fullLabel: string;
}

type NoticeType =
  | 'success'
  | 'error'
  | 'info';

interface NoticeState {
  type: NoticeType;
  message: string;
}

const WORKING_DAY_OPTIONS:
  WorkingDayOption[] = [
    {
      value: 1,
      shortLabel: 'จ.',
      fullLabel: 'จันทร์',
    },
    {
      value: 2,
      shortLabel: 'อ.',
      fullLabel: 'อังคาร',
    },
    {
      value: 3,
      shortLabel: 'พ.',
      fullLabel: 'พุธ',
    },
    {
      value: 4,
      shortLabel: 'พฤ.',
      fullLabel: 'พฤหัสบดี',
    },
    {
      value: 5,
      shortLabel: 'ศ.',
      fullLabel: 'ศุกร์',
    },
    {
      value: 6,
      shortLabel: 'ส.',
      fullLabel: 'เสาร์',
    },
    {
      value: 7,
      shortLabel: 'อา.',
      fullLabel: 'อาทิตย์',
    },
  ];

const DEFAULT_WORKING_DAYS = [
  1,
  2,
  3,
  4,
  5,
  6,
];

function getBangkokDateText(): string {
  const formatter =
    new Intl.DateTimeFormat(
      'en-CA',
      {
        timeZone:
          'Asia/Bangkok',
        year:
          'numeric',
        month:
          '2-digit',
        day:
          '2-digit',
      }
    );

  return formatter.format(
    new Date()
  );
}

function formatDisplayDate(
  value: string
): string {
  if (!value) {
    return '-';
  }

  const date =
    new Date(
      `${value}T00:00:00+07:00`
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
  }

  return date.toLocaleDateString(
    'th-TH',
    {
      timeZone:
        'Asia/Bangkok',
      day:
        '2-digit',
      month:
        '2-digit',
      year:
        'numeric',
    }
  );
}

function getErrorMessage(
  error: unknown
): string {
  if (
    error instanceof Error &&
    error.message
  ) {
    return error.message;
  }

  return String(
    error ||
    'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'
  );
}

function sortWorkingDays(
  days: number[]
): number[] {
  return [
    ...new Set(
      days
    ),
  ].sort(
    (
      first,
      second
    ) =>
      first -
      second
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
    | 'success'
    | 'warning'
    | 'primary';
}) {
  const toneClasses = {
    default:
      'border-slate-200 bg-white text-slate-900',
    success:
      'border-emerald-200 bg-emerald-50 text-emerald-800',
    warning:
      'border-amber-200 bg-amber-50 text-amber-800',
    primary:
      'border-blue-200 bg-blue-50 text-blue-800',
  };

  return (
    <div
      className={`rounded-xl border p-4 shadow-sm ${toneClasses[tone]}`}
    >
      <p className="text-xs font-medium uppercase tracking-wide opacity-70">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold tabular-nums">
        {value}
      </p>
    </div>
  );
}

export default function PlanManagement({
  onPlanCreated,
}: PlanManagementProps) {
  const today =
    useMemo(
      () =>
        getBangkokDateText(),
      []
    );

  const [startDate, setStartDate] =
    useState(
      today
    );

  const [endDate, setEndDate] =
    useState(
      today
    );

  const [workingDays, setWorkingDays] =
    useState<number[]>(
      DEFAULT_WORKING_DAYS
    );

  const [masterPlan, setMasterPlan] =
    useState<MasterPlanResponse | null>(
      null
    );

  const [preview, setPreview] =
    useState<PlanPeriodPreview | null>(
      null
    );

  const [creationResult, setCreationResult] =
    useState<PlanCreationResult | null>(
      null
    );

  const [notice, setNotice] =
    useState<NoticeState | null>(
      null
    );

  const [isLoadingMaster, setIsLoadingMaster] =
    useState(
      false
    );

  const [isPreviewing, setIsPreviewing] =
    useState(
      false
    );

  const [isCreating, setIsCreating] =
    useState(
      false
    );

  const [showConfirmation, setShowConfirmation] =
    useState(
      false
    );

  const [searchText, setSearchText] =
    useState(
      ''
    );

  const selectedWorkingDays =
    useMemo(
      () =>
        sortWorkingDays(
          workingDays
        ),
      [workingDays]
    );

  const filteredMasterRows =
    useMemo(
      () => {
        const query =
          searchText
            .trim()
            .toLowerCase();

        if (
          !masterPlan ||
          !query
        ) {
          return masterPlan?.rows || [];
        }

        return masterPlan.rows.filter(
          row => {
            return [
              row.route,
              row.company,
              row.truckName,
              row.truckType,
              row.driverName,
              row.project,
              row.dropPoint,
              row.planEta,
              row.planEtd,
            ].some(
              value =>
                String(
                  value ||
                  ''
                )
                  .toLowerCase()
                  .includes(
                    query
                  )
            );
          }
        );
      },
      [
        masterPlan,
        searchText,
      ]
    );

  const isBusy =
    isLoadingMaster ||
    isPreviewing ||
    isCreating;

  const canPreview =
    Boolean(
      startDate &&
      endDate &&
      selectedWorkingDays.length > 0 &&
      masterPlan?.success &&
      masterPlan.rowCount > 0 &&
      !isBusy
    );

  const canCreate =
    Boolean(
      preview &&
      preview.newRowCount > 0 &&
      !isBusy
    );

  const clearCalculatedResults =
    useCallback(
      () => {
        setPreview(
          null
        );
        setCreationResult(
          null
        );
        setShowConfirmation(
          false
        );
        setNotice(
          null
        );
      },
      []
    );

  const loadMasterPlan =
    useCallback(
      async (
        forceRefresh = false
      ) => {
        setIsLoadingMaster(
          true
        );
        setNotice(
          null
        );

        try {
          const result =
            await fetchMasterPlan(
              forceRefresh
            );

          setMasterPlan(
            result
          );
          setPreview(
            null
          );
          setCreationResult(
            null
          );

          if (
            result.validationErrors.length > 0
          ) {
            setNotice({
              type:
                'error',
              message:
                `Master Plan มีข้อมูลที่ต้องแก้ไข ${result.validationErrors.length} แถว`,
            });
          } else {
            setNotice({
              type:
                'success',
              message:
                `โหลด Master Plan สำเร็จ ${result.rowCount} เที่ยวต่อวัน`,
            });
          }
        } catch (error) {
          setMasterPlan(
            null
          );
          setNotice({
            type:
              'error',
            message:
              getErrorMessage(
                error
              ),
          });
        } finally {
          setIsLoadingMaster(
            false
          );
        }
      },
      []
    );

  useEffect(
    () => {
      void loadMasterPlan(
        false
      );
    },
    [loadMasterPlan]
  );

  const toggleWorkingDay =
    (
      dayNumber: number
    ) => {
      setWorkingDays(
        currentDays => {
          if (
            currentDays.includes(
              dayNumber
            )
          ) {
            return currentDays.filter(
              value =>
                value !==
                dayNumber
            );
          }

          return sortWorkingDays([
            ...currentDays,
            dayNumber,
          ]);
        }
      );

      clearCalculatedResults();
    };

  const handlePreview =
    async () => {
      if (!canPreview) {
        return;
      }

      if (
        endDate <
        startDate
      ) {
        setNotice({
          type:
            'error',
          message:
            'วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่มต้น',
        });
        return;
      }

      setIsPreviewing(
        true
      );
      setCreationResult(
        null
      );
      setShowConfirmation(
        false
      );
      setNotice(
        null
      );

      try {
        const result =
          await previewPlanPeriod({
            startDate,
            endDate,
            workingDays:
              selectedWorkingDays,
          });

        setPreview(
          result
        );

        setNotice({
          type:
            result.newRowCount > 0
              ? 'success'
              : 'info',
          message:
            result.newRowCount > 0
              ? `Preview สำเร็จ พบรายการใหม่ ${result.newRowCount} รายการ`
              : 'รายการทั้งหมดมีอยู่ใน Plan แล้ว ไม่มีรายการใหม่',
        });
      } catch (error) {
        setPreview(
          null
        );
        setNotice({
          type:
            'error',
          message:
            getErrorMessage(
              error
            ),
        });
      } finally {
        setIsPreviewing(
          false
        );
      }
    };

  const handleCreatePlan =
    async () => {
      if (
        !preview ||
        preview.newRowCount <= 0
      ) {
        return;
      }

      setShowConfirmation(
        false
      );
      setIsCreating(
        true
      );
      setNotice(
        null
      );

      try {
        const result =
          await createPlanPeriod({
            startDate,
            endDate,
            workingDays:
              selectedWorkingDays,
          });

        setCreationResult(
          result
        );

        setNotice({
          type:
            'success',
          message:
            `สร้าง Plan สำเร็จ ${result.createdRowCount} รายการ`,
        });

        const refreshedPreview =
          await previewPlanPeriod({
            startDate,
            endDate,
            workingDays:
              selectedWorkingDays,
          });

        setPreview(
          refreshedPreview
        );

        if (
          onPlanCreated
        ) {
          await onPlanCreated(
            result
          );
        }
      } catch (error) {
        setNotice({
          type:
            'error',
          message:
            getErrorMessage(
              error
            ),
        });
      } finally {
        setIsCreating(
          false
        );
      }
    };

  return (
    <div className="min-h-full bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-200 bg-gradient-to-r from-blue-700 to-blue-600 px-5 py-5 text-white sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-white/15 p-3 ring-1 ring-white/25">
                <ClipboardList className="h-6 w-6" />
              </div>

              <div>
                <h1 className="text-xl font-bold sm:text-2xl">
                  Plan Management
                </h1>
                <p className="mt-1 text-sm text-blue-100">
                  สร้างแผนตามช่วงวันที่จาก Master Plan พร้อมตรวจรายการซ้ำและ Code run
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                void loadMasterPlan(
                  true
                )
              }
              disabled={isBusy}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoadingMaster ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              โหลด Master Plan ใหม่
            </button>
          </div>

          <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_1.2fr]">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    แหล่งข้อมูล
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    ใช้ข้อมูลจากชีต Master Plan
                  </p>
                </div>

                <div className="rounded-lg bg-blue-100 p-2 text-blue-700">
                  <Truck className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <StatCard
                  label="เที่ยวต่อวัน"
                  value={
                    masterPlan?.rowCount ??
                    '-'
                  }
                  tone="primary"
                />

                <StatCard
                  label="Validation"
                  value={
                    masterPlan
                      ? masterPlan.validationErrors.length === 0
                        ? 'ผ่าน'
                        : `${masterPlan.validationErrors.length} จุด`
                      : '-'
                  }
                  tone={
                    masterPlan?.validationErrors.length === 0
                      ? 'success'
                      : 'warning'
                  }
                />
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-blue-600" />
                <h2 className="font-semibold text-slate-900">
                  ช่วงวันที่สร้าง Plan
                </h2>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    วันที่เริ่มต้น
                  </span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={event => {
                      setStartDate(
                        event.target.value
                      );
                      clearCalculatedResults();
                    }}
                    disabled={isBusy}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    วันที่สิ้นสุด
                  </span>
                  <input
                    type="date"
                    value={endDate}
                    min={startDate}
                    onChange={event => {
                      setEndDate(
                        event.target.value
                      );
                      clearCalculatedResults();
                    }}
                    disabled={isBusy}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100"
                  />
                </label>
              </div>

              <div className="mt-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-700">
                    วันทำงาน
                  </span>
                  <span className="text-xs text-slate-500">
                    ค่าเริ่มต้น จันทร์ถึงเสาร์
                  </span>
                </div>

                <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-7">
                  {WORKING_DAY_OPTIONS.map(
                    day => {
                      const isSelected =
                        selectedWorkingDays.includes(
                          day.value
                        );

                      return (
                        <button
                          key={day.value}
                          type="button"
                          title={day.fullLabel}
                          aria-pressed={isSelected}
                          disabled={isBusy}
                          onClick={() =>
                            toggleWorkingDay(
                              day.value
                            )
                          }
                          className={`rounded-xl border px-2 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                            isSelected
                              ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                              : 'border-slate-300 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50'
                          }`}
                        >
                          {day.shortLabel}
                        </button>
                      );
                    }
                  )}
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() =>
                    void handlePreview()
                  }
                  disabled={!canPreview}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
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
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            ) : notice.type === 'error' ? (
              <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
            ) : (
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
            )}
            <span>{notice.message}</span>
          </div>
        )}

        {masterPlan && masterPlan.validationErrors.length > 0 && (
          <section className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
            <div className="flex items-center gap-2 text-red-800">
              <TriangleAlert className="h-5 w-5" />
              <h2 className="font-semibold">
                กรุณาแก้ Master Plan ก่อนสร้างแผน
              </h2>
            </div>

            <div className="mt-3 space-y-2">
              {masterPlan.validationErrors.map(
                item => (
                  <div
                    key={item.sheetRow}
                    className="rounded-lg bg-white px-3 py-2 text-sm text-red-700 ring-1 ring-red-200"
                  >
                    แถว {item.sheetRow}: {item.errors.join(', ')}
                  </div>
                )
              )}
            </div>
          </section>
        )}

        {preview && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  ผล Preview
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {formatDisplayDate(preview.startDate)} ถึง {formatDisplayDate(preview.endDate)}
                </p>
              </div>

              <div className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600">
                รายการซ้ำจะถูกข้ามอัตโนมัติ
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="วันทำงาน"
                value={preview.workingDateCount}
                tone="primary"
              />
              <StatCard
                label="รายการทั้งหมด"
                value={preview.totalCandidateRows}
              />
              <StatCard
                label="รายการใหม่"
                value={preview.newRowCount}
                tone="success"
              />
              <StatCard
                label="รายการซ้ำ"
                value={preview.duplicateRowCount}
                tone="warning"
              />
            </div>

            <div className="mt-5 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
              <div>
                <p className="text-xs text-slate-500">
                  Code run สูงสุดปัจจุบัน
                </p>
                <p className="mt-1 font-semibold text-slate-900">
                  {preview.currentMaximumCodeRun}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">
                  Code run เริ่มต้น
                </p>
                <p className="mt-1 font-semibold text-blue-700">
                  {preview.startCodeRun}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">
                  Code run สุดท้าย
                </p>
                <p className="mt-1 font-semibold text-blue-700">
                  {preview.endCodeRun}
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() =>
                  setShowConfirmation(
                    true
                  )
                }
                disabled={!canCreate}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <CheckCircle2 className="h-4 w-4" />
                Create Plan
              </button>
            </div>
          </section>
        )}

        {creationResult && (
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm sm:p-6">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-emerald-100 p-2 text-emerald-700">
                <CheckCircle2 className="h-6 w-6" />
              </div>

              <div>
                <h2 className="text-lg font-bold text-emerald-900">
                  สร้าง Plan สำเร็จ
                </h2>
                <p className="mt-1 text-sm text-emerald-800">
                  สร้าง {creationResult.createdRowCount} รายการ และข้ามรายการซ้ำ {creationResult.duplicateRowCount} รายการ
                </p>
                <p className="mt-2 text-sm text-emerald-800">
                  Code run: {creationResult.startCodeRun} ถึง {creationResult.endCodeRun}
                </p>
              </div>
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Master Plan
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                แสดง {filteredMasterRows.length} จาก {masterPlan?.rowCount || 0} รายการ
              </p>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchText}
                onChange={event =>
                  setSearchText(
                    event.target.value
                  )
                }
                placeholder="ค้นหา Route, ทะเบียน, คนขับ..."
                className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-3">Route</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Truck Name</th>
                  <th className="px-4 py-3">Truck Type</th>
                  <th className="px-4 py-3">Driver</th>
                  <th className="px-4 py-3">Project</th>
                  <th className="px-4 py-3">Drop Point</th>
                  <th className="px-4 py-3">ETA</th>
                  <th className="px-4 py-3">ETD</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 bg-white">
                {isLoadingMaster ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                      <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-blue-600" />
                      กำลังโหลด Master Plan...
                    </td>
                  </tr>
                ) : filteredMasterRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                      ไม่พบข้อมูล Master Plan
                    </td>
                  </tr>
                ) : (
                  filteredMasterRows.map(
                    (
                      row,
                      index
                    ) => (
                      <tr
                        key={`${row.sheetRow || index}-${row.route}-${row.truckName}`}
                        className="hover:bg-blue-50/50"
                      >
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                          {row.route}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                          {row.company}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-blue-700">
                          {row.truckName}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                          {row.truckType}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                          {row.driverName || '-'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                          {row.project}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                          {row.dropPoint}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-medium tabular-nums text-slate-900">
                          {row.planEta}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-medium tabular-nums text-slate-900">
                          {row.planEtd}
                        </td>
                      </tr>
                    )
                  )
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {showConfirmation && preview && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-plan-title"
            className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl sm:p-6"
          >
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-amber-100 p-2 text-amber-700">
                <TriangleAlert className="h-6 w-6" />
              </div>

              <div>
                <h2 id="confirm-plan-title" className="text-lg font-bold text-slate-900">
                  ยืนยันการสร้าง Plan
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  ระบบจะเขียนข้อมูลจริงลงชีต Plan และสร้าง Code run ใหม่
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">ช่วงวันที่</span>
                <span className="text-right font-medium text-slate-900">
                  {formatDisplayDate(preview.startDate)} ถึง {formatDisplayDate(preview.endDate)}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">รายการใหม่</span>
                <span className="font-bold text-emerald-700">
                  {preview.newRowCount}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">รายการซ้ำที่ข้าม</span>
                <span className="font-medium text-amber-700">
                  {preview.duplicateRowCount}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Code run</span>
                <span className="font-medium text-blue-700">
                  {preview.startCodeRun} ถึง {preview.endCodeRun}
                </span>
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() =>
                  setShowConfirmation(
                    false
                  )
                }
                disabled={isCreating}
                className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
              >
                ยกเลิก
              </button>

              <button
                type="button"
                onClick={() =>
                  void handleCreatePlan()
                }
                disabled={isCreating}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {isCreating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                ยืนยันสร้าง Plan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
