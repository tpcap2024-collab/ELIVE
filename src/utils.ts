import {
  TruckStatus,
  PerformanceStatus,
} from './types';

import {
  Truck,
  MapPin,
  Clock,
  ArrowRightSquare,
  PackageOpen,
  CheckCircle,
  LogOut,
} from 'lucide-react';

export const getStatusConfig = (
  status: TruckStatus
) => {
  switch (status) {
    case 'TRAVELING':
      return {
        label: 'On the way',
        color:
          'bg-blue-100 text-blue-700 border-blue-200',
        icon: MapPin,
      };

    case 'UNLOADING_AT_TPCAP':
      return {
        label: 'Unloading at TPCAP',
        color:
          'bg-yellow-100 text-yellow-700 border-yellow-200',
        icon: Clock,
      };

    case 'WAITING_AREA':
      return {
        label: 'Waiting Area',
        color:
          'bg-amber-100 text-amber-700 border-amber-200',
        icon: Clock,
      };

    case 'DOCK_IN':
      return {
        label: 'Dock In',
        color:
          'bg-yellow-100 text-yellow-700 border-yellow-200',
        icon: ArrowRightSquare,
      };

    case 'UNLOADING':
      return {
        label: 'Unloading',
        color:
          'bg-purple-100 text-purple-700 border-purple-200',
        icon: PackageOpen,
      };

    case 'COMPLETED':
      return {
        label: 'Completed',
        color:
          'bg-green-100 text-green-700 border-green-200',
        icon: CheckCircle,
      };

    case 'TRUCK_OUT':
      return {
        label: 'Truck Out',
        color:
          'bg-slate-100 text-slate-700 border-slate-200',
        icon: LogOut,
      };

    default:
      return {
        label: 'Unknown',
        color:
          'bg-gray-100 text-gray-700 border-gray-200',
        icon: Truck,
      };
  }
};

/**
 * แปลงเวลา HH:mm หรือ HH:mm:ss เป็นจำนวนนาที
 */
const timeToMinutes = (
  timeValue?: string
): number | null => {
  if (!timeValue) {
    return null;
  }

  const timeText = String(timeValue)
    .trim()
    .slice(0, 5);

  const match = timeText.match(
    /^(\d{1,2}):(\d{2})$/
  );

  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  return hour * 60 + minute;
};

/**
 * คำนวณระยะเวลาระหว่างเวลาเริ่มต้นกับเวลาสิ้นสุด
 *
 * รองรับกรณีข้ามเที่ยงคืน:
 * 23:30 ถึง 00:30 = 60 นาที
 */
export const calculateMinutesDifference = (
  start: string,
  end: string
): number | null => {
  const startMinutes =
    timeToMinutes(start);

  const endMinutes =
    timeToMinutes(end);

  if (
    startMinutes === null ||
    endMinutes === null
  ) {
    return null;
  }

  let difference =
    endMinutes - startMinutes;

  if (difference < 0) {
    difference += 24 * 60;
  }

  return difference;
};

/**
 * คำนวณ Performance จากวันที่และเวลา Stamp ETA
 *
 * Actual ก่อน Plan ETA = EARLY
 * Actual ตั้งแต่ Plan ETA ถึง Plan ETD = ON_PLAN
 * Actual หลัง Plan ETD = DELAY
 *
 * รองรับ Plan ข้ามเที่ยงคืน และข้อมูลเดิมที่ไม่มีวันที่ Stamp
 */
function parseDateText(value?: string): string | null {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function dateTimeToEpochMinutes(dateValue?: string, timeValue?: string): number | null {
  const dateText = parseDateText(dateValue);
  const minutes = timeToMinutes(timeValue);
  if (!dateText || minutes === null) return null;
  const [year, month, day] = dateText.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 60000) + minutes;
}

export const calculatePerformanceStatus = (
  planEta: string,
  planEtd: string,
  stampEta: string,
  planDate?: string,
  stampDate?: string
): PerformanceStatus => {
  const planEtaDateTime = dateTimeToEpochMinutes(planDate, planEta);
  let planEtdDateTime = dateTimeToEpochMinutes(planDate, planEtd);
  const stampEtaDateTime = dateTimeToEpochMinutes(stampDate, stampEta);

  if (
    planEtaDateTime !== null &&
    planEtdDateTime !== null &&
    stampEtaDateTime !== null
  ) {
    if (planEtdDateTime < planEtaDateTime) {
      planEtdDateTime += 24 * 60;
    }
    if (stampEtaDateTime < planEtaDateTime) return 'EARLY';
    if (stampEtaDateTime <= planEtdDateTime) return 'ON_PLAN';
    return 'DELAY';
  }

  const planEtaMinutes = timeToMinutes(planEta);
  const planEtdMinutes = timeToMinutes(planEtd);
  const stampEtaMinutes = timeToMinutes(stampEta);
  if (
    planEtaMinutes === null ||
    planEtdMinutes === null ||
    stampEtaMinutes === null
  ) return 'ON_PLAN';

  let adjustedPlanEtd = planEtdMinutes;
  let adjustedStampEta = stampEtaMinutes;
  if (adjustedPlanEtd < planEtaMinutes) {
    adjustedPlanEtd += 24 * 60;
    if (adjustedStampEta < planEtaMinutes) adjustedStampEta += 24 * 60;
  }
  if (adjustedStampEta < planEtaMinutes) return 'EARLY';
  if (adjustedStampEta <= adjustedPlanEtd) return 'ON_PLAN';
  return 'DELAY';
};

/**
 * แสดงระยะเวลาเป็นข้อความ
 */
export const formatDuration = (
  minutes: number | null
): string => {
  if (minutes === null) {
    return '-';
  }

  if (minutes < 0) {
    return '0m';
  }

  const hours =
    Math.floor(minutes / 60);

  const remainingMinutes =
    minutes % 60;

  return hours > 0
    ? `${hours}h ${remainingMinutes}m`
    : `${remainingMinutes}m`;
};
