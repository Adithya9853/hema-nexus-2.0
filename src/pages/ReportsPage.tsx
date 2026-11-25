import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  Eye,
  FilePlus2,
  FileText,
  Search,
  Share2,
  Trash2,
  X,
} from 'lucide-react';
import {
  BottomSheetModal,
  HemaCard,
  StatusBanner,
} from '../components/ui/HemaPrimitives.tsx';
import { BRAND_ASSETS } from '../config/assets.ts';
import { useAuth } from '../contexts/AuthContext.tsx';
import { useHemaData } from '../contexts/HemaDataContext.tsx';
import { apiRequest } from '../services/api/client.ts';
import { generateClinicalPdfReport } from '../services/reports/pdfGenerator.ts';
import type { MeasurementRecord, ReportRecord } from '../types/hema.ts';
import {
  formatDateTime,
  formatMeasurementValue,
  getStatusDisplay,
} from '../utils/formatters.ts';

export function ReportsPage() {
  const { profile } = useAuth();
  const {
    measurements,
    patients,
    reports,
    testCatalog,
    generateReport,
    removeReport,
  } = useHemaData();

  const [title, setTitle] = useState('Hema Nexus Personal Health Summary');
  const [summaryNotes, setSummaryNotes] = useState('');
  const [patientRecordId, setPatientRecordId] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<number[]>(() =>
    measurements.slice(0, 10).map((m) => m.id),
  );
  const initializedSelectionRef = useRef(measurements.length > 0);
  const [creating, setCreating] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [reportSearch, setReportSearch] = useState('');
  const [reportSourceFilter, setReportSourceFilter] = useState<
    'all' | 'standard' | 'simulated'
  >('all');
  const [previewData, setPreviewData] = useState<{
    report: ReportRecord;
    measurements: MeasurementRecord[];
  } | null>(null);

  const filteredMeasurements = useMemo(() => {
    if (!patientRecordId) return measurements;
    const targetId = Number(patientRecordId);
    return measurements.filter((m) => m.patientRecordId === targetId);
  }, [measurements, patientRecordId]);

  useEffect(() => {
    if (!initializedSelectionRef.current && filteredMeasurements.length > 0) {
      initializedSelectionRef.current = true;
      setSelectedIds(filteredMeasurements.slice(0, 10).map((m) => m.id));
    }
  }, [filteredMeasurements]);

  const filteredReports = useMemo(() => {
    const q = reportSearch.trim().toLowerCase();
    return reports.filter((r) => {
      if (reportSourceFilter === 'simulated' && !r.includesSimulatedData) {
        return false;
      }
      if (reportSourceFilter === 'standard' && r.includesSimulatedData) {
        return false;
      }
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        r.reportCode.toLowerCase().includes(q) ||
        r.patientName.toLowerCase().includes(q)
      );
    });
  }, [reports, reportSearch, reportSourceFilter]);

  const handlePatientChange = (nextPatientId: string) => {
    setPatientRecordId(nextPatientId);
    if (!nextPatientId) {
      setTitle('Hema Nexus Personal Health Summary');
      setSelectedIds(measurements.slice(0, 10).map((m) => m.id));
    } else {
      const patient = patients.find((p) => p.id === Number(nextPatientId));
      if (patient) {
        setTitle(
          `Consolidated Clinical Report — ${patient.fullName} (${patient.uhid})`,
        );
      }
      const patientMeasurements = measurements.filter(
        (m) => m.patientRecordId === Number(nextPatientId),
      );
      setSelectedIds(patientMeasurements.map((m) => m.id));
    }
  };

  const toggleId = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);
    if (selectedIds.length === 0) {
      setErrorMsg('Select at least one measurement record to include.');
      return;
    }

    setCreating(true);
    try {
      const created = await generateReport({
        title: title.trim() || 'Hema Nexus Clinical Summary',
        measurementIds: selectedIds,
        patientRecordId: patientRecordId ? Number(patientRecordId) : null,
        summaryNotes: summaryNotes.trim() || null,
      });
      setPreviewData(created);
      setStatusMsg(`Report ${created.report.reportCode} generated and saved.`);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to generate report.',
      );
    } finally {
      setCreating(false);
    }
  };

  const loadAuthorizedReport = async (reportId: number) => {
    const data = await apiRequest<{
      report: ReportRecord;
      measurements: MeasurementRecord[];
    }>(`/api/reports/${reportId}`);
    return data;
  };

  const handlePreview = async (reportId: number) => {
    setErrorMsg(null);
    try {
      const data = await loadAuthorizedReport(reportId);
      setPreviewData(data);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to open report preview.',
      );
    }
  };

  const handleDownload = async (reportId: number) => {
    if (!profile) return;
    setErrorMsg(null);
    try {
      const data = await loadAuthorizedReport(reportId);
      const pdf = await generateClinicalPdfReport({
        report: data.report,
        measurements: data.measurements,
        profile,
        testCatalog,
      });
      pdf.save(`${data.report.reportCode}.pdf`);
      setStatusMsg(`Downloaded ${data.report.reportCode}.pdf`);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to export PDF report.',
      );
    }
  };

  const handleShare = async (report: ReportRecord) => {
    setErrorMsg(null);
    setStatusMsg(null);
    const shareText = `Hema Nexus Clinical Report ${report.reportCode} (${report.title}) — Generated ${formatDateTime(report.generatedAt)}.`;

    try {
      if (profile && typeof navigator !== 'undefined' && navigator.share) {
        try {
          const data = await loadAuthorizedReport(report.id);
          const pdf = await generateClinicalPdfReport({
            report: data.report,
            measurements: data.measurements,
            profile,
            testCatalog,
          });
          const pdfBlob = pdf.output('blob');
          const pdfFile = new File([pdfBlob], `${report.reportCode}.pdf`, {
            type: 'application/pdf',
          });
          if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
            await navigator.share({
              title: report.title,
              text: shareText,
              files: [pdfFile],
            });
            return;
          }
        } catch {
          // Fall through to text share
        }

        await navigator.share({
          title: report.title,
          text: shareText,
        });
        return;
      }
    } catch {
      // User cancelled share
    }

    try {
      await navigator.clipboard.writeText(shareText);
      setStatusMsg('Report reference summary copied to clipboard.');
    } catch {
      setStatusMsg('Tap PDF to save and share the report file directly.');
    }
  };

  const handleDeleteReport = async (reportId: number, code: string) => {
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      await removeReport(reportId);
      setConfirmDeleteId(null);
      if (previewData?.report.id === reportId) {
        setPreviewData(null);
      }
      setStatusMsg(`Deleted report ${code}.`);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to delete report.',
      );
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Clinical Reports
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Generate authorized PDF medical summaries with reference ranges and device provenance.
        </p>
      </div>

      {errorMsg && (
        <StatusBanner
          variant="error"
          message={errorMsg}
          onDismiss={() => setErrorMsg(null)}
        />
      )}

      {statusMsg && (
        <StatusBanner
          variant="success"
          message={statusMsg}
          onDismiss={() => setStatusMsg(null)}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
        {/* Report Builder */}
        <HemaCard className="lg:col-span-5 p-4 sm:p-5">
          <form onSubmit={handleGenerate} className="space-y-4">
            <div className="flex items-center gap-2.5">
              <FilePlus2 className="w-5 h-5 text-[#005EB8] dark:text-sky-400" />
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Create New Report
              </h2>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Report Title
              </label>
              <input
                type="text"
                required
                maxLength={120}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full h-11 px-3 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0D1622] text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#005EB8] dark:focus:border-sky-400"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Summary Notes (optional)
              </label>
              <textarea
                rows={2}
                maxLength={400}
                value={summaryNotes}
                onChange={(e) => setSummaryNotes(e.target.value)}
                placeholder="Context for clinician review (fasting status, medication changes)..."
                className="w-full p-3 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0D1622] text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-[#005EB8] dark:focus:border-sky-400"
              />
            </div>

            {patients.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Patient Scope (optional)
                </label>
                <select
                  value={patientRecordId}
                  onChange={(e) => handlePatientChange(e.target.value)}
                  className="w-full h-11 px-3 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0D1622] text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#005EB8] dark:focus:border-sky-400"
                >
                  <option value="">
                    Personal Profile ({profile?.fullName || 'Self'}) — All Readings
                  </option>
                  {patients.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.fullName} · {p.uhid}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Select Measurements ({selectedIds.length} selected)
                </span>
                {filteredMeasurements.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedIds(
                        selectedIds.length === filteredMeasurements.length
                          ? []
                          : filteredMeasurements.map((m) => m.id),
                      )
                    }
                    className="min-h-[34px] px-2 text-xs text-[#005EB8] dark:text-sky-300 hover:underline font-medium"
                  >
                    {selectedIds.length === filteredMeasurements.length
                      ? 'Deselect all'
                      : 'Select all'}
                  </button>
                )}
              </div>

              {filteredMeasurements.length === 0 ? (
                <div className="p-4 rounded-lg border border-dashed border-[#D5E0EC] dark:border-[#24364D] text-xs text-slate-500 dark:text-slate-400">
                  Record at least one measurement first to generate a report.
                </div>
              ) : (
                <div className="max-h-60 overflow-y-auto divide-y divide-[#D5E0EC] dark:divide-[#1E2E42] border border-[#D5E0EC] dark:border-[#1E2E42] rounded-lg">
                  {filteredMeasurements.map((m) => (
                    <label
                      key={m.id}
                      className="min-h-[46px] px-3 py-2 flex items-center justify-between gap-2 text-xs cursor-pointer hover:bg-[#F8FAFC] dark:hover:bg-[#162232]"
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(m.id)}
                          onChange={() => toggleId(m.id)}
                          className="h-4 w-4 rounded border-slate-300 accent-[#005EB8] shrink-0"
                        />
                        <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                          {m.testName}
                        </span>
                        {(m.isSimulated ||
                          m.dataSource === 'simulated_device') && (
                          <span className="text-[10px] font-mono font-semibold text-amber-700 dark:text-amber-300 shrink-0">
                            [SIM]
                          </span>
                        )}
                      </span>
                      <span className="font-mono text-slate-600 dark:text-slate-400 shrink-0">
                        {formatMeasurementValue(m)} {m.unit}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={creating || filteredMeasurements.length === 0}
              className="w-full min-h-[46px] px-4 py-2 rounded-lg hn-btn-primary text-sm font-semibold disabled:opacity-45 transition-colors whitespace-nowrap"
            >
              {creating ? 'Generating Report...' : 'Generate Authorized Report'}
            </button>
          </form>
        </HemaCard>

        {/* Saved Reports List */}
        <HemaCard className="lg:col-span-7 overflow-hidden">
          <div className="px-4 sm:px-5 py-4 border-b border-[#D5E0EC] dark:border-[#1E2E42] space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Saved Reports
              </h2>
              <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums-mono">
                {filteredReports.length} / {reports.length}
              </span>
            </div>

            {reports.length > 0 && (
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute left-3 top-3" />
                  <input
                    type="search"
                    value={reportSearch}
                    onChange={(e) => setReportSearch(e.target.value)}
                    placeholder="Filter by title, code, or patient..."
                    className="w-full h-9 pl-8 pr-3 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0D1622] text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-[#005EB8] dark:focus:border-sky-400"
                  />
                </div>
                <select
                  value={reportSourceFilter}
                  onChange={(e) =>
                    setReportSourceFilter(
                      e.target.value as 'all' | 'standard' | 'simulated',
                    )
                  }
                  aria-label="Filter reports by source"
                  className="h-9 px-2.5 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0D1622] text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#005EB8] dark:focus:border-sky-400"
                >
                  <option value="all">All Reports</option>
                  <option value="standard">Hardware / Manual</option>
                  <option value="simulated">Includes Simulated</option>
                </select>
              </div>
            )}
          </div>

          {filteredReports.length === 0 ? (
            <div className="p-10 text-center">
              <FileText className="w-8 h-8 text-slate-400 dark:text-slate-500 mx-auto mb-2" />
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {reports.length === 0
                  ? 'No reports generated yet'
                  : 'No reports match your filter'}
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {reports.length === 0
                  ? 'Select measurements in Create New Report to build a structured PDF report.'
                  : 'Try clearing the search box or switching source filters.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#D5E0EC] dark:divide-[#1E2E42]">
              {filteredReports.map((r) => (
                <div
                  key={r.id}
                  className="px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 hover:bg-[#F8FAFC] dark:hover:bg-[#162232] transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex flex-wrap items-center gap-2">
                      <span>{r.title}</span>
                      {r.includesSimulatedData && (
                        <span className="text-[10px] font-mono font-semibold text-amber-700 dark:text-amber-300">
                          [SIMULATED TEST DATA]
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-mono font-medium text-[#005EB8] dark:text-sky-300">
                        {r.reportCode}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{r.measurementIds.length} readings</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums-mono">
                        {formatDateTime(r.generatedAt)}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handlePreview(r.id)}
                      className="flex-1 sm:flex-none min-h-[40px] px-3 py-1.5 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#1B2A3E] flex items-center justify-center gap-1.5 whitespace-nowrap"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Preview</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDownload(r.id)}
                      className="flex-1 sm:flex-none min-h-[40px] px-3 py-1.5 rounded-lg hn-btn-primary text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleShare(r)}
                      aria-label="Share report"
                      className="min-h-[40px] min-w-[40px] p-2 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1B2A3E] flex items-center justify-center"
                    >
                      <Share2 className="w-4 h-4" />
                    </button>
                    {confirmDeleteId === r.id ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            void handleDeleteReport(r.id, r.reportCode)
                          }
                          className="min-h-[40px] px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-medium"
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="min-h-[40px] px-2.5 py-1.5 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] text-xs text-slate-700 dark:text-slate-300"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(r.id)}
                        aria-label="Delete report"
                        className="min-h-[40px] min-w-[40px] p-2 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 flex items-center justify-center"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </HemaCard>
      </div>

      {/* Live Clinical Report Preview Modal */}
      <BottomSheetModal
        open={Boolean(previewData)}
        onClose={() => setPreviewData(null)}
        ariaLabel="Clinical Report Preview"
        maxWidthClass="max-w-2xl"
      >
        {previewData && (
          <div className="bg-white text-slate-900 sm:rounded-xl overflow-hidden">
            <div className="sticky top-0 z-10 bg-[#0B2239] text-white p-4 sm:p-6 flex items-center justify-between gap-3 border-b border-[#173657]">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-lg bg-[#081829] border border-[#1E3F66] p-1.5 flex items-center justify-center shrink-0">
                  <img
                    src={BRAND_ASSETS.officialLogo}
                    alt="Hema Nexus Logo"
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-contain"
                  />
                </div>
                <div className="min-w-0">
                  <div className="font-display font-bold text-base sm:text-lg truncate">
                    HEMA NEXUS CLINICAL REPORT
                  </div>
                  <div className="text-[11px] sm:text-xs text-sky-300 font-mono truncate">
                    {previewData.report.reportCode} ·{' '}
                    {formatDateTime(previewData.report.generatedAt)}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewData(null)}
                aria-label="Close preview"
                className="h-10 w-10 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
              {previewData.report.includesSimulatedData && (
                <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 text-xs font-semibold text-amber-900">
                  SIMULATED TEST DATA: This report includes readings generated in Hema Nexus Simulated Device Mode.
                </div>
              )}
              <div>
                <h3 className="font-display text-lg font-bold text-slate-900">
                  {previewData.report.title}
                </h3>
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-lg bg-[#F8FAFC] border border-[#D5E0EC] text-xs">
                  <div>
                    <div className="text-slate-500">Patient</div>
                    <div className="font-semibold mt-0.5 text-slate-900">
                      {previewData.report.patientName} ·{' '}
                      <span className="font-mono">
                        {previewData.report.patientId}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Device Snapshot</div>
                    <div className="font-semibold mt-0.5 text-slate-900">
                      {previewData.report.deviceSnapshot
                        ? `${previewData.report.deviceSnapshot.deviceName} (${previewData.report.deviceSnapshot.deviceIdentifier})`
                        : 'Manual / Multi-source Log'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="sm:hidden divide-y divide-[#D5E0EC] border border-[#D5E0EC] rounded-lg overflow-hidden">
                {previewData.measurements.map((m) => (
                  <div
                    key={m.id}
                    className="p-3 flex items-center justify-between gap-3 text-xs bg-white"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{m.testName}</div>
                      <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                        {formatDateTime(m.measuredAt)}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono font-bold">
                        {formatMeasurementValue(m)} {m.unit}
                      </div>
                      <div className="text-[11px] font-medium">
                        {getStatusDisplay(m.status).glyph}{' '}
                        {getStatusDisplay(m.status).label}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden sm:block overflow-x-auto border border-[#D5E0EC] rounded-lg">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#EEF3F8] text-slate-600 border-b border-[#D5E0EC] uppercase text-[11px] tracking-wider">
                      <th className="py-2.5 px-3 font-semibold">Test</th>
                      <th className="py-2.5 px-3 font-semibold">Value</th>
                      <th className="py-2.5 px-3 font-semibold">Status</th>
                      <th className="py-2.5 px-3 font-semibold text-right">
                        Recorded
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#D5E0EC]">
                    {previewData.measurements.map((m) => (
                      <tr key={m.id}>
                        <td className="py-2.5 px-3 font-medium">{m.testName}</td>
                        <td className="py-2.5 px-3 font-mono font-semibold">
                          {formatMeasurementValue(m)} {m.unit}
                        </td>
                        <td className="py-2.5 px-3">
                          {getStatusDisplay(m.status).glyph}{' '}
                          {getStatusDisplay(m.status).label}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-500">
                          {formatDateTime(m.measuredAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {previewData.report.summaryNotes && (
                <div className="text-xs text-slate-700 bg-[#F8FAFC] p-3.5 rounded-lg border border-[#D5E0EC]">
                  <div className="font-semibold mb-1">Summary Notes</div>
                  <p>{previewData.report.summaryNotes}</p>
                </div>
              )}

              <div className="grid grid-cols-2 sm:flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => void handleShare(previewData.report)}
                  className="min-h-[44px] px-4 py-2 rounded-lg border border-[#D5E0EC] text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-1.5"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Share</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleDownload(previewData.report.id)}
                  className="min-h-[44px] px-4 py-2 rounded-lg hn-btn-primary text-xs font-semibold flex items-center justify-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download PDF</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </BottomSheetModal>
    </div>
  );
}
