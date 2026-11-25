import { useMemo, useState } from 'react';
import {
  ArrowDownUp,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  GitCompare,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react';
import {
  BottomSheetModal,
  HemaCard,
  StatusBanner,
} from '../components/ui/HemaPrimitives.tsx';
import { useHemaData } from '../contexts/HemaDataContext.tsx';
import type { MeasurementRecord } from '../types/hema.ts';
import { formatReferenceRange } from '../utils/clinicalValidation.ts';
import {
  formatDataSource,
  formatDateTime,
  formatMeasurementValue,
  getStatusDisplay,
} from '../utils/formatters.ts';

const PAGE_SIZE = 20;

function parseLocalDateBoundary(dateStr: string, endOfDay: boolean): Date | null {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [y, m, d] = parts;
  return endOfDay
    ? new Date(y, m - 1, d, 23, 59, 59, 999)
    : new Date(y, m - 1, d, 0, 0, 0, 0);
}

export function HealthHistoryPage() {
  const { measurements, devices, patients, testCatalog, removeMeasurement } =
    useHemaData();

  const [search, setSearch] = useState('');
  const [testFilter, setTestFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] =
    useState<MeasurementRecord | null>(null);
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [page, setPage] = useState(1);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const deviceMap = useMemo(
    () => new Map(devices.map((d) => [d.id, d])),
    [devices],
  );
  const patientMap = useMemo(
    () => new Map(patients.map((p) => [p.id, p])),
    [patients],
  );
  const catalogMap = useMemo(
    () => new Map(testCatalog.map((t) => [t.slug, t])),
    [testCatalog],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromBoundary = fromDate ? parseLocalDateBoundary(fromDate, false) : null;
    const toBoundary = toDate ? parseLocalDateBoundary(toDate, true) : null;

    const list = measurements.filter((m) => {
      if (testFilter !== 'all' && m.testType !== testFilter) return false;
      if (sourceFilter !== 'all' && m.dataSource !== sourceFilter) return false;
      const measuredAt = new Date(m.measuredAt);
      if (fromBoundary && measuredAt < fromBoundary) return false;
      if (toBoundary && measuredAt > toBoundary) return false;
      if (q) {
        const match =
          m.testName.toLowerCase().includes(q) ||
          m.status.toLowerCase().includes(q) ||
          (m.notes && m.notes.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });

    return list.sort((a, b) => {
      const diff =
        new Date(a.measuredAt).getTime() - new Date(b.measuredAt).getTime();
      return sortOrder === 'newest' ? -diff : diff;
    });
  }, [
    measurements,
    search,
    testFilter,
    sourceFilter,
    fromDate,
    toDate,
    sortOrder,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage]);

  const activeFilterCount = [
    testFilter !== 'all',
    sourceFilter !== 'all',
    fromDate !== '',
    toDate !== '',
  ].filter(Boolean).length;

  const hasActiveFilters = search.trim() !== '' || activeFilterCount > 0;

  const resetFilters = () => {
    setSearch('');
    setTestFilter('all');
    setSourceFilter('all');
    setFromDate('');
    setToDate('');
    setPage(1);
  };

  const handleDeleteMeasurement = async (id: number) => {
    setActionError(null);
    try {
      await removeMeasurement(id);
      setConfirmDeleteId(null);
      setCompareIds((prev) => prev.filter((x) => x !== id));
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Unable to delete measurement.',
      );
    }
  };

  const comparedRecords = useMemo(
    () =>
      compareIds
        .map((id) => measurements.find((m) => m.id === id))
        .filter((x): x is MeasurementRecord => Boolean(x)),
    [compareIds, measurements],
  );

  const toggleCompare = (id: number) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Health History
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Search, filter, inspect, and compare stored clinical measurement records.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:flex items-center gap-2 self-stretch sm:self-auto">
          <button
            type="button"
            onClick={() => setMobileFiltersOpen((o) => !o)}
            className="sm:hidden min-h-[42px] px-3.5 py-2 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] bg-white dark:bg-[#111B27] text-xs font-medium text-slate-800 dark:text-slate-200 flex items-center justify-center gap-2"
          >
            <Filter className="w-3.5 h-3.5 text-[#005EB8] dark:text-sky-400" />
            <span>
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSortOrder((s) => (s === 'newest' ? 'oldest' : 'newest'));
              setPage(1);
            }}
            className="min-h-[42px] px-3.5 py-2 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] bg-white dark:bg-[#111B27] hover:bg-slate-50 dark:hover:bg-[#162232] text-xs font-medium text-slate-800 dark:text-slate-200 flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
          >
            <ArrowDownUp className="w-3.5 h-3.5 text-[#005EB8] dark:text-sky-400" />
            <span>{sortOrder === 'newest' ? 'Newest' : 'Oldest'}</span>
          </button>
        </div>
      </div>

      {/* Filters Toolbar */}
      <HemaCard className="p-3.5 sm:p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="relative lg:col-span-2">
            <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-3.5" />
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by test name, status, or notes..."
              className="w-full h-11 pl-9 pr-3 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0D1622] text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-[#005EB8] dark:focus:border-sky-400"
            />
          </div>

          <div
            className={`${
              mobileFiltersOpen ? 'grid' : 'hidden sm:grid'
            } grid-cols-1 sm:contents gap-3`}
          >
            <select
              value={testFilter}
              onChange={(e) => {
                setTestFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by test type"
              className="h-11 px-3 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0D1622] text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#005EB8] dark:focus:border-sky-400"
            >
              <option value="all">All Test Types</option>
              {testCatalog.map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.testName}
                </option>
              ))}
            </select>

            <select
              value={sourceFilter}
              onChange={(e) => {
                setSourceFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by source"
              className="h-11 px-3 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0D1622] text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#005EB8] dark:focus:border-sky-400"
            >
              <option value="all">All Sources</option>
              <option value="ble_device">Hema Nexus BLE</option>
              <option value="simulated_device">Simulated Device</option>
              <option value="manual_entry">Manual Entry</option>
            </select>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="sm:hidden block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                  From Date
                </label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    setPage(1);
                  }}
                  aria-label="From date"
                  className="w-full h-11 px-2 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0D1622] text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#005EB8] dark:focus:border-sky-400"
                />
              </div>
              <div>
                <label className="sm:hidden block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                  To Date
                </label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => {
                    setToDate(e.target.value);
                    setPage(1);
                  }}
                  aria-label="To date"
                  className="w-full h-11 px-2 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0D1622] text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#005EB8] dark:focus:border-sky-400"
                />
              </div>
            </div>
          </div>
        </div>

        {hasActiveFilters && (
          <div className="flex items-center justify-between text-xs pt-2 border-t border-[#D5E0EC] dark:border-[#1E2E42]">
            <span className="text-slate-500 dark:text-slate-400">
              Showing {filtered.length} matching record(s)
            </span>
            <button
              type="button"
              onClick={resetFilters}
              className="min-h-[34px] px-2 text-[#005EB8] dark:text-sky-300 hover:underline font-medium flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Filters</span>
            </button>
          </div>
        )}
      </HemaCard>

      {actionError && (
        <StatusBanner
          variant="error"
          message={actionError}
          onDismiss={() => setActionError(null)}
        />
      )}

      {/* Historical Comparison Bar */}
      {comparedRecords.length > 0 && (
        <HemaCard
          variant="clinical"
          className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3"
        >
          <div className="flex items-start gap-3">
            <GitCompare className="w-5 h-5 text-sky-300 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <div className="font-semibold text-sm text-white">
                Reading Comparison ({comparedRecords.length}/2 selected)
              </div>
              {comparedRecords.length === 2 ? (
                <div className="text-slate-300 flex flex-wrap items-center gap-2">
                  <span>
                    {comparedRecords[0].testName}:{' '}
                    <strong className="tabular-nums-mono text-white">
                      {formatMeasurementValue(comparedRecords[0])}{' '}
                      {comparedRecords[0].unit}
                    </strong>
                  </span>
                  <span>vs</span>
                  <span>
                    {comparedRecords[1].testName}:{' '}
                    <strong className="tabular-nums-mono text-white">
                      {formatMeasurementValue(comparedRecords[1])}{' '}
                      {comparedRecords[1].unit}
                    </strong>
                  </span>
                  {comparedRecords[0].testType ===
                    comparedRecords[1].testType && (
                    <span className="text-sky-300 font-mono font-semibold">
                      (Delta:{' '}
                      {(
                        comparedRecords[0].measuredValue -
                        comparedRecords[1].measuredValue
                      ).toFixed(1)}{' '}
                      {comparedRecords[0].unit})
                    </span>
                  )}
                </div>
              ) : (
                <div className="text-slate-300">
                  Select one more reading below to compare values side-by-side.
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setCompareIds([])}
            className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-[#1E3F66] bg-[#081829] hover:bg-[#102944] text-xs font-medium text-white self-start md:self-auto whitespace-nowrap transition-colors"
          >
            Clear Compare
          </button>
        </HemaCard>
      )}

      {/* Measurements View: Mobile Touch Cards + Desktop Clinical Table */}
      <HemaCard className="overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center">
            <Clock className="w-8 h-8 text-slate-400 dark:text-slate-500 mx-auto mb-2" />
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              No measurement records match your filters
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Record a new reading from Test Center or adjust your date and test filters.
            </p>
          </div>
        ) : (
          <>
            {/* Mobile Stacked Touch Cards (< md) */}
            <div className="md:hidden divide-y divide-[#D5E0EC] dark:divide-[#1E2E42]">
              {pagedRows.map((m) => {
                const status = getStatusDisplay(m.status);
                const device = m.deviceId ? deviceMap.get(m.deviceId) : null;
                const linkedPatient = m.patientRecordId
                  ? patientMap.get(m.patientRecordId)
                  : null;
                const isCompared = compareIds.includes(m.id);

                return (
                  <div key={m.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-sm text-slate-900 dark:text-slate-100 flex flex-wrap items-center gap-x-2">
                          <span>{m.testName}</span>
                          {linkedPatient && (
                            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                              · {linkedPatient.uhid}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-1.5">
                          <span className="tabular-nums-mono">
                            {formatDateTime(m.measuredAt)}
                          </span>
                          <span aria-hidden="true">·</span>
                          {m.isSimulated ||
                          m.dataSource === 'simulated_device' ? (
                            <span className="font-mono font-semibold text-amber-700 dark:text-amber-300">
                              SIMULATED
                            </span>
                          ) : (
                            <span>
                              {device
                                ? device.deviceName
                                : formatDataSource(m.dataSource)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-base font-bold tabular-nums-mono text-slate-900 dark:text-slate-100">
                          {formatMeasurementValue(m)}{' '}
                          <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                            {m.unit}
                          </span>
                        </div>
                        <div
                          className={`text-[11px] font-semibold ${status.textClass}`}
                        >
                          {status.glyph} {status.label}
                        </div>
                      </div>
                    </div>

                    {m.notes && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 bg-[#F8FAFC] dark:bg-[#0D1622] border border-[#D5E0EC]/70 dark:border-[#1E2E42] rounded-lg px-2.5 py-1.5">
                        {m.notes}
                      </p>
                    )}

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => toggleCompare(m.id)}
                        className={`min-h-[38px] px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors ${
                          isCompared
                            ? 'border-[#005EB8] dark:border-sky-400 bg-sky-50 dark:bg-sky-950/35 text-[#005EB8] dark:text-sky-300'
                            : 'border-[#D5E0EC] dark:border-[#24364D] text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <GitCompare className="w-3.5 h-3.5" />
                        <span>{isCompared ? 'Compared' : 'Compare'}</span>
                      </button>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedRecord(m)}
                          className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] text-xs font-medium text-[#005EB8] dark:text-sky-300"
                        >
                          Details
                        </button>
                        {confirmDeleteId === m.id ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => void handleDeleteMeasurement(m.id)}
                              className="min-h-[38px] px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-medium"
                            >
                              Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="min-h-[38px] px-2.5 py-1.5 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] text-xs text-slate-700 dark:text-slate-300"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(m.id)}
                            aria-label={`Delete ${m.testName} measurement`}
                            className="min-h-[38px] min-w-[38px] rounded-lg border border-[#D5E0EC] dark:border-[#24364D] flex items-center justify-center text-slate-500 hover:text-rose-600 dark:hover:text-rose-400"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Full 7-Column EHR Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#D5E0EC] dark:border-[#1E2E42] text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-[#EEF3F8] dark:bg-[#0D1622]">
                    <th className="py-3 px-4 font-semibold">Compare</th>
                    <th className="py-3 px-4 font-semibold">Test Parameter</th>
                    <th className="py-3 px-4 font-semibold text-right">Result</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                    <th className="py-3 px-4 font-semibold">Source</th>
                    <th className="py-3 px-4 font-semibold">Date &amp; Time</th>
                    <th className="py-3 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D5E0EC] dark:divide-[#1E2E42] text-sm">
                  {pagedRows.map((m) => {
                    const status = getStatusDisplay(m.status);
                    const device = m.deviceId ? deviceMap.get(m.deviceId) : null;
                    const linkedPatient = m.patientRecordId
                      ? patientMap.get(m.patientRecordId)
                      : null;
                    const isCompared = compareIds.includes(m.id);

                    return (
                      <tr
                        key={m.id}
                        className="hover:bg-[#F8FAFC] dark:hover:bg-[#162232] transition-colors"
                      >
                        <td className="py-3 px-4">
                          <input
                            type="checkbox"
                            checked={isCompared}
                            onChange={() => toggleCompare(m.id)}
                            aria-label={`Select ${m.testName} reading for comparison`}
                            className="h-4 w-4 rounded border-slate-300 dark:border-[#24364D] accent-[#005EB8]"
                          />
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">
                          <div>
                            {m.testName}
                            {linkedPatient && (
                              <span className="ml-2 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                                · {linkedPatient.uhid}
                              </span>
                            )}
                          </div>
                          {m.notes && (
                            <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[240px]">
                              {m.notes}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right tabular-nums-mono font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                          {formatMeasurementValue(m)}{' '}
                          <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                            {m.unit}
                          </span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={`text-xs font-semibold ${status.textClass}`}
                          >
                            {status.glyph} {status.label}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs whitespace-nowrap">
                          {m.isSimulated ||
                          m.dataSource === 'simulated_device' ? (
                            <span className="font-mono font-semibold text-amber-700 dark:text-amber-300">
                              SIMULATED
                            </span>
                          ) : (
                            <span className="text-slate-600 dark:text-slate-300">
                              {device
                                ? device.deviceName
                                : formatDataSource(m.dataSource)}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400 tabular-nums-mono whitespace-nowrap">
                          {formatDateTime(m.measuredAt)}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedRecord(m)}
                              className="text-xs font-medium text-[#005EB8] dark:text-sky-300 hover:underline"
                            >
                              Details
                            </button>
                            {confirmDeleteId === m.id ? (
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleDeleteMeasurement(m.id)
                                  }
                                  className="px-2 py-1 rounded bg-rose-600 text-white text-[11px] font-medium"
                                >
                                  Delete
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="px-2 py-1 rounded border border-[#D5E0EC] dark:border-[#24364D] text-[11px] text-slate-700 dark:text-slate-300"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(m.id)}
                                aria-label="Delete measurement"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {filtered.length > PAGE_SIZE && (
          <div className="px-4 py-3 border-t border-[#D5E0EC] dark:border-[#1E2E42] flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="tabular-nums-mono">
              Page {safePage} of {totalPages} · {filtered.length} records
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] flex items-center gap-1 disabled:opacity-40"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Prev</span>
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] flex items-center gap-1 disabled:opacity-40"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </HemaCard>

      {/* Measurement Details Modal */}
      <BottomSheetModal
        open={Boolean(selectedRecord)}
        onClose={() => setSelectedRecord(null)}
        ariaLabel="Measurement Record Details"
        maxWidthClass="max-w-md"
      >
        {selectedRecord && (
          <div className="p-5 sm:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
                  {selectedRecord.testName}
                </h3>
                <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums-mono">
                  {formatDateTime(selectedRecord.measuredAt)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRecord(null)}
                className="min-h-[38px] px-3 py-1 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Close
              </button>
            </div>

            <div className="p-4 rounded-xl bg-[#F8FAFC] dark:bg-[#0D1622] border border-[#D5E0EC] dark:border-[#1E2E42]">
              <div className="text-2xl font-bold tabular-nums-mono text-slate-900 dark:text-slate-100">
                {formatMeasurementValue(selectedRecord)} {selectedRecord.unit}
              </div>
              <div
                className={`mt-1 text-xs font-semibold ${
                  getStatusDisplay(selectedRecord.status).textClass
                }`}
              >
                {getStatusDisplay(selectedRecord.status).glyph}{' '}
                {getStatusDisplay(selectedRecord.status).label}
              </div>
            </div>

            <dl className="text-xs space-y-2.5">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400">
                  Data Source
                </dt>
                <dd className="font-medium text-right text-slate-900 dark:text-slate-100">
                  {formatDataSource(selectedRecord.dataSource)}
                </dd>
              </div>
              {catalogMap.get(selectedRecord.testType) && (
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500 dark:text-slate-400">
                    Reference Range
                  </dt>
                  <dd className="font-mono text-right text-slate-900 dark:text-slate-100">
                    {formatReferenceRange(
                      catalogMap.get(selectedRecord.testType)!
                        .referenceRangeConfig,
                      selectedRecord.unit,
                      catalogMap.get(selectedRecord.testType)!.secondaryUnit,
                    )}
                  </dd>
                </div>
              )}
              {selectedRecord.notes && (
                <div className="pt-2 border-t border-[#D5E0EC] dark:border-[#1E2E42]">
                  <dt className="text-slate-500 dark:text-slate-400 mb-1">
                    Notes
                  </dt>
                  <dd className="text-slate-700 dark:text-slate-300">
                    {selectedRecord.notes}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )}
      </BottomSheetModal>
    </div>
  );
}
