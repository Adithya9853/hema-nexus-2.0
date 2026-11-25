import { useMemo, useState } from 'react';
import { Activity } from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { HemaCard } from '../components/ui/HemaPrimitives.tsx';
import { useHemaData } from '../contexts/HemaDataContext.tsx';
import { formatReferenceRange } from '../utils/clinicalValidation.ts';
import { formatDataSource, formatShortDate } from '../utils/formatters.ts';

type RangeKey = '7d' | '30d' | '90d' | 'all';

const PRIORITY_SLUGS = [
  'glucose',
  'blood_pressure',
  'hemoglobin',
  'spo2',
  'heart_rate',
  'temperature',
];

function TrendChartTooltip({
  active,
  payload,
  unit,
}: {
  active?: boolean;
  payload?: {
    name?: string;
    value?: number;
    color?: string;
    payload?: { fullDate?: string; source?: string };
  }[];
  unit: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const meta = payload[0]?.payload;
  return (
    <div className="rounded-lg bg-white dark:bg-[#0D1622] border border-[#D5E0EC] dark:border-[#1E2E42] px-3.5 py-2.5 text-xs shadow-lg max-w-[230px]">
      {meta && (
        <div className="text-[11px] text-slate-500 dark:text-slate-400 border-b border-[#E2E8F0] dark:border-[#1E2E42] pb-1.5 mb-1.5">
          <div>{meta.fullDate}</div>
          <div className="font-mono mt-0.5 text-[#005EB8] dark:text-sky-300">
            {meta.source}
          </div>
        </div>
      )}
      <div className="space-y-1">
        {payload.map((entry, idx) => (
          <div key={idx} className="flex items-center justify-between gap-3">
            <span className="text-slate-600 dark:text-slate-300 truncate">
              {entry.name}
            </span>
            <span className="font-mono font-bold text-slate-900 dark:text-slate-100 shrink-0">
              {entry.value} {unit}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HealthTrendsPage() {
  const { measurements, testCatalog } = useHemaData();
  const [range, setRange] = useState<RangeKey>('30d');

  const availableSlugs = useMemo(() => {
    const withData = new Set(measurements.map((m) => m.testType));
    const ordered = [
      ...PRIORITY_SLUGS.filter((s) => withData.has(s)),
      ...Array.from(withData).filter((s) => !PRIORITY_SLUGS.includes(s)),
    ];
    return ordered.length > 0 ? ordered : PRIORITY_SLUGS;
  }, [measurements]);

  const [selectedSlug, setSelectedSlug] = useState<string>(availableSlugs[0]);

  const activeSlug = availableSlugs.includes(selectedSlug)
    ? selectedSlug
    : availableSlugs[0];

  const activeTest = testCatalog.find((t) => t.slug === activeSlug) || null;

  const filteredPoints = useMemo(() => {
    const now = Date.now();
    const cutoff =
      range === '7d'
        ? now - 7 * 86400000
        : range === '30d'
          ? now - 30 * 86400000
          : range === '90d'
            ? now - 90 * 86400000
            : 0;

    return measurements
      .filter(
        (m) =>
          m.testType === activeSlug &&
          (cutoff === 0 || new Date(m.measuredAt).getTime() >= cutoff),
      )
      .slice()
      .sort(
        (a, b) =>
          new Date(a.measuredAt).getTime() - new Date(b.measuredAt).getTime(),
      )
      .map((m) => ({
        label: formatShortDate(m.measuredAt),
        fullDate: new Date(m.measuredAt).toLocaleString(),
        value: m.measuredValue,
        secondary: m.secondaryValue,
        source: formatDataSource(m.dataSource),
      }));
  }, [measurements, activeSlug, range]);

  const precision =
    activeSlug === 'creatinine' || activeSlug === 'lactate' ? 2 : 1;

  const stats = useMemo(() => {
    if (filteredPoints.length === 0) return null;
    const vals = filteredPoints.map((p) => p.value);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const latest = vals[vals.length - 1];
    const delta = vals.length > 1 ? latest - vals[0] : 0;
    return {
      min: min.toFixed(precision),
      max: max.toFixed(precision),
      avg: avg.toFixed(precision),
      latest: latest.toFixed(precision),
      delta: delta.toFixed(precision),
      deltaRaw: delta,
      count: vals.length,
    };
  }, [filteredPoints, precision]);

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
            Health Trends
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Longitudinal biomarker telemetry plotted directly from stored clinical records.
          </p>
        </div>

        <div className="grid grid-cols-4 sm:inline-flex items-center gap-1 p-1 rounded-lg bg-[#E2E8F0]/80 dark:bg-[#0D1622] border border-[#D5E0EC] dark:border-[#1E2E42] w-full sm:w-auto">
          {(
            [
              ['7d', '7D'],
              ['30d', '30D'],
              ['90d', '90D'],
              ['all', 'All'],
            ] as [RangeKey, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setRange(id)}
              className={`min-h-[38px] px-3 py-1.5 rounded-md text-xs font-medium transition-colors text-center ${
                range === id
                  ? 'bg-white dark:bg-[#172436] text-[#005EB8] dark:text-sky-300 shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Horizontal Thumb-Scrollable Parameter Selector */}
      <div className="flex md:flex-wrap items-center gap-2 overflow-x-auto no-scrollbar -mx-3.5 px-3.5 md:mx-0 md:px-0 pb-1">
        {availableSlugs.map((slug) => {
          const meta = testCatalog.find((t) => t.slug === slug);
          const active = slug === activeSlug;
          return (
            <button
              key={slug}
              type="button"
              onClick={() => setSelectedSlug(slug)}
              className={`min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 ${
                active
                  ? 'hn-btn-primary border-transparent'
                  : 'bg-white dark:bg-[#111B27] border-[#D5E0EC] dark:border-[#1E2E42] text-slate-700 dark:text-slate-300 hover:border-[#005EB8]/50'
              }`}
            >
              {meta?.testName || slug}
            </button>
          );
        })}
      </div>

      {/* Summary Stats Strip */}
      {stats && activeTest && (
        <section className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4">
          <HemaCard className="p-3.5 sm:p-4">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Latest
            </div>
            <div className="mt-1 text-lg sm:text-xl font-bold tabular-nums-mono">
              {stats.latest}{' '}
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                {activeTest.unit}
              </span>
            </div>
          </HemaCard>
          <HemaCard className="p-3.5 sm:p-4">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Average
            </div>
            <div className="mt-1 text-lg sm:text-xl font-bold tabular-nums-mono">
              {stats.avg}
            </div>
          </HemaCard>
          <HemaCard className="p-3.5 sm:p-4">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Minimum
            </div>
            <div className="mt-1 text-lg sm:text-xl font-bold tabular-nums-mono">
              {stats.min}
            </div>
          </HemaCard>
          <HemaCard className="p-3.5 sm:p-4">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Maximum
            </div>
            <div className="mt-1 text-lg sm:text-xl font-bold tabular-nums-mono">
              {stats.max}
            </div>
          </HemaCard>
          <HemaCard className="col-span-2 sm:col-span-1 p-3.5 sm:p-4 flex sm:block items-center justify-between">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Period Delta
            </div>
            <div className="sm:mt-1 text-lg sm:text-xl font-bold tabular-nums-mono text-[#005EB8] dark:text-sky-300">
              {stats.count > 1
                ? `${stats.deltaRaw > 0 ? '+' : ''}${stats.delta}`
                : `${stats.count} pt`}
            </div>
          </HemaCard>
        </section>
      )}

      {/* Clinical Line Chart Container */}
      <HemaCard className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 sm:mb-5">
          <div>
            <h2 className="font-display text-base font-semibold">
              {activeTest?.testName || activeSlug} ({activeTest?.unit || ''})
            </h2>
            {activeTest && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Normal Reference:{' '}
                <span className="font-mono text-teal-700 dark:text-teal-400 font-medium">
                  {formatReferenceRange(
                    activeTest.referenceRangeConfig,
                    activeTest.unit,
                    activeTest.secondaryUnit,
                  )}
                </span>
              </p>
            )}
          </div>
          {stats && (
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
              {stats.count} readings
            </span>
          )}
        </div>

        {filteredPoints.length === 0 ? (
          <div className="py-12 sm:py-16 text-center">
            <Activity className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <div className="text-sm font-semibold">
              No {activeTest?.testName || activeSlug} readings in this timeframe
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Hema Nexus displays strictly authentic measurements. Record readings from your device, Simulated Mode, or Test Center to populate this clinical chart.
            </p>
          </div>
        ) : (
          <div className="h-64 sm:h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={filteredPoints}
                margin={{ top: 10, right: 12, left: -16, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#94A3B8"
                  opacity={0.25}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  axisLine={false}
                  tickLine={false}
                />
                {activeTest && (
                  <ReferenceArea
                    y1={activeTest.referenceRangeConfig.minNormal}
                    y2={activeTest.referenceRangeConfig.maxNormal}
                    fill="#0D9488"
                    fillOpacity={0.08}
                  />
                )}
                <Tooltip
                  content={
                    <TrendChartTooltip unit={activeTest?.unit || ''} />
                  }
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Line
                  type="monotone"
                  dataKey="value"
                  name={
                    activeSlug === 'blood_pressure'
                      ? 'Systolic (mmHg)'
                      : `${activeTest?.testName || 'Value'} (${activeTest?.unit || ''})`
                  }
                  stroke="#005EB8"
                  strokeWidth={2.5}
                  dot={{ r: 3.5, fill: '#005EB8' }}
                  activeDot={{ r: 6, fill: '#0284C7' }}
                />
                {activeSlug === 'blood_pressure' && (
                  <Line
                    type="monotone"
                    dataKey="secondary"
                    name="Diastolic (mmHg)"
                    stroke="#DC2626"
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: '#DC2626' }}
                    activeDot={{ r: 6 }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </HemaCard>
    </div>
  );
}
