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
 * คำนวณ Performance จาก Stamp ETA เท่านั้น
 *
 * Stamp ETA ก่อน Plan ETA = EARLY
 * Stamp ETA ตั้งแต่ Plan ETA ถึง Plan ETD = ON_PLAN
 * Stamp ETA หลัง Plan ETD = DELAY
 *
 * Stamp ETA ตรง Plan ETA = ON_PLAN
 * Stamp ETA ตรง Plan ETD = ON_PLAN
 *
 * Stamp ETD ไม่มีผลต่อ Performance
 */
export const calculatePerformanceStatus = (
  planEta: string,
  planEtd: string,
  stampEta: string
): PerformanceStatus => {
  const planEtaMinutes =
    timeToMinutes(planEta);

  const planEtdMinutes =
    timeToMinutes(planEtd);

  const stampEtaMinutes =
    timeToMinutes(stampEta);

  if (
    planEtaMinutes === null ||
    planEtdMinutes === null ||
    stampEtaMinutes === null
  ) {
    return 'ON_PLAN';
  }

  let adjustedPlanEtd =
    planEtdMinutes;

  let adjustedStampEta =
    stampEtaMinutes;

  /*
   * รองรับช่วงเวลาข้ามเที่ยงคืน
   *
   * ตัวอย่าง:
   * Plan ETA = 23:50
   * Plan ETD = 00:10
   */
  if (
    adjustedPlanEtd <
    planEtaMinutes
  ) {
    adjustedPlanEtd += 24 * 60;

    /*
     * Stamp ETA ที่อยู่หลังเที่ยงคืน
     * ให้ถือว่าเป็นเวลาของวันถัดไป
     */
    if (
      adjustedStampEta <
      planEtaMinutes
    ) {
      adjustedStampEta += 24 * 60;
    }
  }

  /*
   * ก่อน Plan ETA
   */
  if (
    adjustedStampEta <
    planEtaMinutes
  ) {
    return 'EARLY';
  }

  /*
   * ตั้งแต่ Plan ETA ถึง Plan ETD
   * รวมเวลาที่ตรงขอบทั้งสองด้าน
   */
  if (
    adjustedStampEta <=
    adjustedPlanEtd
  ) {
    return 'ON_PLAN';
  }

  /*
   * หลัง Plan ETD
   */
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
