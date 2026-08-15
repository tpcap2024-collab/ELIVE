import { useMemo, useState } from 'react';
import type { Truck } from '../types';
import {
  CheckCircle2,
} from 'lucide-react';
import {
  calculatePerformanceStatus,
} from '../utils';
import { StatusBadge } from './StatusBadge';

interface WarehouseStampProps {
  trucks: Truck[];
  onUpdateTruck: (
    id: string,
    updates: Partial<Truck>
  ) => void;
}

function getPlatformGroup(
  dropPoint?: string
): string {
  if (!dropPoint) {
    return '';
  }

  const normalizedDropPoint =
    dropPoint.trim();

  const match =
    normalizedDropPoint.match(
      /^[a-zA-Z]+\d*/
    );

  return match
    ? match[0].toUpperCase()
    : normalizedDropPoint.toUpperCase();
}

function isInboundProject(truck: Truck): boolean {
  return String(truck.project || '').trim().toUpperCase() === 'INBOUND';
}

function getPlanEtaSortValue(value?: string): number {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return Number.MAX_SAFE_INTEGER;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return Number.MAX_SAFE_INTEGER;
  }

  return hour * 60 + minute;
}

function getCurrentTimeString(): string {
  const now = new Date();

  const hour = String(
    now.getHours()
  ).padStart(2, '0');

  const minute = String(
    now.getMinutes()
  ).padStart(2, '0');

  return `${hour}:${minute}`;
}

export function WarehouseStamp({
  trucks,
  onUpdateTruck,
}: WarehouseStampProps) {
  const [
    showCompleted,
    setShowCompleted,
  ] = useState(false);

  const [
    filterPlatform,
    setFilterPlatform,
  ] = useState('ALL');

  const inboundTrucks = useMemo(
    () => trucks.filter(isInboundProject),
    [trucks]
  );

  const uniquePlatforms = useMemo(() => {
    const platforms = Array.from(
      new Set(
        inboundTrucks
          .map(truck =>
            getPlatformGroup(
              truck.dropPoint
            )
          )
          .filter(Boolean)
      )
    );

    return platforms.sort(
      (first, second) =>
        first.localeCompare(second)
    );
  }, [inboundTrucks]);

  const activeTrucks = useMemo(() => {
    return inboundTrucks.filter(truck => {
      const hasBothStamps =
        Boolean(truck.stampEta) &&
        Boolean(truck.stampEtd);

      const isCompleted =
        truck.status === 'COMPLETED' ||
        truck.status === 'TRUCK_OUT' ||
        hasBothStamps;

      if (
        !showCompleted &&
        isCompleted
      ) {
        return false;
      }

      const truckPlatform =
        getPlatformGroup(
          truck.dropPoint
        );

      if (
        filterPlatform !== 'ALL' &&
        truckPlatform !==
          filterPlatform
      ) {
        return false;
      }

      return true;
    }).sort((first, second) => {
      const timeDifference =
        getPlanEtaSortValue(first.planEta) - getPlanEtaSortValue(second.planEta);
      if (timeDifference !== 0) return timeDifference;
      return String(first.route || '').localeCompare(String(second.route || ''), 'en');
    });
  }, [
    inboundTrucks,
    showCompleted,
    filterPlatform,
  ]);

  const handleStampEta = (
    truck: Truck
  ) => {
    const time =
      getCurrentTimeString();

    const performanceStatus =
      calculatePerformanceStatus(
        truck.planEta,
        time
      );

    onUpdateTruck(
      truck.id,
      {
        stampEta: time,
        status:
          'UNLOADING_AT_TPCAP',
        performanceStatus,
      }
    );
  };

  const handleStampEtd = (
    truck: Truck
  ) => {
    const time =
      getCurrentTimeString();

    onUpdateTruck(
      truck.id,
      {
        stampEtd: time,
        status: 'COMPLETED',
      }
    );
  };

  return (
    <div className="flex h-full flex-col bg-slate-50 p-4 md:p-6 lg:p-8">
      <div className="mb-6 flex shrink-0 flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-800">
            Stamp ETA / ETD
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Warehouse Staff Action Dashboard
          </p>
        </div>

        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <select
            value={filterPlatform}
            onChange={event =>
              setFilterPlatform(
                event.target.value
              )
            }
            className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="ALL">
              All Platforms
            </option>

            {uniquePlatforms.map(
              platform => (
                <option
                  key={platform}
                  value={platform}
                >
                  {platform}
                </option>
              )
            )}
          </select>

          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={event =>
                setShowCompleted(
                  event.target.checked
                )
              }
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />

            Show Stamped Routes
          </label>
        </div>
      </div>

      <div className="flex-1 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100 text-xs font-bold uppercase tracking-wider text-slate-500">
              <th className="p-4">
                Plan ETA
              </th>

              <th className="p-4">
                Route
              </th>

              <th className="p-4">
                ทะเบียนรถ
              </th>

              <th className="p-4">
                Platform
              </th>

              <th className="p-4">
                Truck Type
              </th>

              <th className="p-4">
                Status
              </th>

              <th className="p-4">
                Stamp ETA
              </th>

              <th className="p-4">
                Stamp ETD
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 text-sm">
            {activeTrucks.map(truck => {
              const displayedStampEta =
                truck.stampEta ||
                truck.actualEta ||
                '';

              const hasStampEta =
                Boolean(
                  displayedStampEta
                );

              return (
                <tr
                  key={truck.id}
                  className="group transition-colors hover:bg-slate-50"
                >
                  <td className="p-4 font-mono font-bold text-slate-800">
                    {truck.planEta || '-'}
                  </td>

                  <td className="p-4 font-bold text-slate-900">
                    {truck.route}
                  </td>

                  <td className="p-4 font-bold text-slate-800">
                    {truck.licensePlate || '-'}
                  </td>

                  <td className="p-4 font-bold text-slate-700">
                    {truck.dropPoint || '-'}
                  </td>

                  <td className="p-4 text-slate-600">
                    {truck.truckType ||
                      'Unknown'}
                  </td>

                  <td className="p-4">
                    <StatusBadge
                      status={truck.status}
                    />
                  </td>

                  <td className="p-4">
                    {hasStampEta ? (
                      <span className="font-mono font-bold text-slate-900">
                        {displayedStampEta}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          handleStampEta(
                            truck
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-blue-700 active:scale-95"
                      >
                        Stamp ETA
                      </button>
                    )}
                  </td>

                  <td className="p-4">
                    {truck.stampEtd ? (
                      <span className="font-mono font-bold text-slate-900">
                        {truck.stampEtd}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          handleStampEtd(
                            truck
                          )
                        }
                        disabled={
                          !hasStampEta
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-blue-700 active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:active:scale-100"
                      >
                        Stamp ETD
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}

            {activeTrucks.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="p-12 text-center text-slate-500"
                >
                  <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-slate-300" />

                  <p className="text-base font-medium">
                    No pending actions
                  </p>

                  <p className="text-xs">
                    All active trucks have been processed
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
