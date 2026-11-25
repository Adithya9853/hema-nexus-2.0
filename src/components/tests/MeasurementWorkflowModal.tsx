import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertCircle,
  ArrowRight,
  Bluetooth,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileText,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useBle } from '../../contexts/BleContext.tsx';
import { useHemaData } from '../../contexts/HemaDataContext.tsx';
import { generateClinicalPdfReport } from '../../services/reports/pdfGenerator.ts';
import type { MeasurementRecord, TestTypeRecord } from '../../types/hema.ts';
import {
  classifyMeasurementStatus,
  formatReferenceRange,
  getPhysiologicalBounds,
} from '../../utils/clinicalValidation.ts';
import {
  formatDateTime,
  formatMeasurementValue,
  getStatusDisplay,
} from '../../utils/formatters.ts';

type WorkflowStep =
  | 'select'
  | 'prep'
  | 'readiness'
  | 'measuring'
  | 'completed'
  | 'results'
  | 'saved';

interface MeasurementWorkflowModalProps {
  test: TestTypeRecord;
  initialMode?: 'ble' | 'manual';
  onClose: () => void;
  onGoToDevice: () => void;
  onOpenSimulator?: () => void;
  onSelectTest?: (test: TestTypeRecord) => void;
  onGoToReports?: () => void;
}

const STEP_PILLS: { id: WorkflowStep; label: string }[] = [
  { id: 'select', label: '1. Select' },
  { id: 'prep', label: '2. Prep' },
  { id: 'readiness', label: '3. Input' },
  { id: 'results', label: '4. Result' },
  { id: 'saved', label: '5. Report' },
];

export function MeasurementWorkflowModal({
  test,
  initialMode,
  onClose,
  onGoToDevice,
  onOpenSimulator,
  onSelectTest,
  onGoToReports,
}: MeasurementWorkflowModalProps) {
  const { profile } = useAuth();
  const {
    state: bleState,
    deviceInfo,
    latestPacket,
    sendTestCommand,
    clearLatestPacket,
  } = useBle();
  const {
    devices,
    measurements,
    testCatalog,
    recordMeasurement,
    generateReport,
  } = useHemaData();

  const isHardwareComingSoon =
    test.availabilityStatus === 'coming_soon' ||
    test.availabilityStatus === 'unavailable';
  const isBleConnected = bleState === 'connected' && !isHardwareComingSoon;

  const [mode, setMode] = useState<'ble' | 'manual'>(
    initialMode === 'manual' || isHardwareComingSoon
      ? 'manual'
      : isBleConnected
        ? 'ble'
        : 'manual',
  );
  const [step, setStep] = useState<WorkflowStep>('select');
  const [primaryInput, setPrimaryInput] = useState('');
  const [secondaryInput, setSecondaryInput] = useState('');
  const [notes, setNotes] = useState('');
  const [rawPacketHex, setRawPacketHex] = useState<string | null>(null);
  const [capturedAt, setCapturedAt] = useState<string>(
    () => new Date().toISOString(),
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [saveOutcome, setSaveOutcome] = useState<'saved' | 'queued' | null>(
    null,
  );
  const [savedRecord, setSavedRecord] = useState<MeasurementRecord | null>(
    null,
  );

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  useEffect(() => {
    if (step !== 'measuring' || mode !== 'ble' || !latestPacket) return;
    if (latestPacket.testType === test.slug) {
      setPrimaryInput(String(latestPacket.measuredValue));
      setSecondaryInput(
        latestPacket.secondaryValue !== null
          ? String(latestPacket.secondaryValue)
          : '',
      );
      setRawPacketHex(latestPacket.rawPacketHex);
      setCapturedAt(latestPacket.receivedAt || new Date().toISOString());
      clearLatestPacket();
      setStep('completed');
    }
  }, [step, mode, latestPacket, test.slug, clearLatestPacket]);

  const bounds = getPhysiologicalBounds(test.slug);
  const needsSecondary =
    test.slug === 'blood_pressure' || test.slug === 'spo2';

  const parsedPrimary = Number(primaryInput);
  const parsedSecondary =
    secondaryInput.trim() !== '' ? Number(secondaryInput) : null;

  const previewStatus =
    primaryInput.trim() !== '' && Number.isFinite(parsedPrimary)
      ? classifyMeasurementStatus(
          parsedPrimary,
          parsedSecondary,
          test.referenceRangeConfig,
        )
      : null;

  const priorReading = useMemo(
    () => measurements.find((m) => m.testType === test.slug) || null,
    [measurements, test.slug],
  );

  const deltaFromPrior = useMemo(() => {
    if (!priorReading || !Number.isFinite(parsedPrimary)) return null;
    const diff = parsedPrimary - priorReading.measuredValue;
    return Number(diff.toFixed(2));
  }, [priorReading, parsedPrimary]);

  const calmGuidance = useMemo(() => {
    if (!previewStatus) return '';
    switch (previewStatus) {
      case 'normal':
        return 'Within standard physiological reference limits for this biomarker.';
      case 'borderline':
        return 'Near the threshold of reference limits. Consider retesting under resting/fasting protocol or consulting your clinician.';
      case 'low':
        return 'Below expected physiological limits. Verify sample quality and consult healthcare support if symptomatic.';
      case 'elevated':
        return 'Above standard reference limits. Log clinical notes or generate a PDF summary for clinician review.';
      case 'critical':
        return 'Significantly outside reference range. Repeat measurement cleanly and seek medical review if clinically indicated.';
    }
  }, [previewStatus]);

  const handleStartBleCapture = async () => {
    setErrorMsg(null);
    if (!isBleConnected) {
      setErrorMsg('No active BLE device connected.');
      return;
    }
    setStep('measuring');
    try {
      await sendTestCommand(test.slug);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Unable to send start command to ESP32 unit.',
      );
      setStep('readiness');
    }
  };

  const handleValidateManual = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!Number.isFinite(parsedPrimary)) {
      setErrorMsg('Please enter a valid numeric value.');
      return;
    }
    if (parsedPrimary < bounds.min || parsedPrimary > bounds.max) {
      setErrorMsg(
        `Value must be within physiological range (${bounds.min}–${bounds.max} ${test.unit}).`,
      );
      return;
    }
    if (needsSecondary && test.slug === 'blood_pressure') {
      if (parsedSecondary === null || !Number.isFinite(parsedSecondary)) {
        setErrorMsg('Please enter both systolic and diastolic values.');
        return;
      }
      if (
        bounds.secondaryMin !== undefined &&
        bounds.secondaryMax !== undefined &&
        (parsedSecondary < bounds.secondaryMin ||
          parsedSecondary > bounds.secondaryMax)
      ) {
        setErrorMsg(
          `Diastolic value must be between ${bounds.secondaryMin} and ${bounds.secondaryMax} mmHg.`,
        );
        return;
      }
    }
    if (
      test.slug === 'spo2' &&
      secondaryInput.trim() !== '' &&
      (parsedSecondary === null ||
        !Number.isFinite(parsedSecondary) ||
        (bounds.secondaryMin !== undefined &&
          parsedSecondary < bounds.secondaryMin) ||
        (bounds.secondaryMax !== undefined &&
          parsedSecondary > bounds.secondaryMax))
    ) {
      setErrorMsg(
        `Pulse rate must be between ${bounds.secondaryMin ?? 25} and ${bounds.secondaryMax ?? 240} BPM.`,
      );
      return;
    }
    setCapturedAt(new Date().toISOString());
    setStep('completed');
  };

  const handleSave = async () => {
    setSaving(true);
    setErrorMsg(null);
    try {
      const pairedDevice = deviceInfo
        ? devices.find((d) => d.deviceIdentifier === deviceInfo.id) || null
        : null;

      const result = await recordMeasurement({
        testType: test.slug,
        measuredValue: parsedPrimary,
        secondaryValue: parsedSecondary,
        measuredAt: capturedAt,
        dataSource: mode === 'ble' ? 'ble_device' : 'manual_entry',
        deviceId: mode === 'ble' && pairedDevice ? pairedDevice.id : null,
        notes: notes.trim() || null,
        rawPacketHex,
      });

      setSavedRecord(result.saved);
      setSaveOutcome(result.queued ? 'queued' : 'saved');
      setStep('saved');
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Failed to persist measurement. Your entry was not discarded.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleExportPdf = async () => {
    if (!profile || !savedRecord) return;
    setExportingPdf(true);
    setErrorMsg(null);
    try {
      const created = await generateReport({
        title: `${test.testName} Clinical Result`,
        measurementIds: [savedRecord.id],
        summaryNotes: notes.trim() || null,
      });
      const pdf = await generateClinicalPdfReport({
        report: created.report,
        measurements: created.measurements,
        profile,
        testCatalog,
      });
      pdf.save(`${created.report.reportCode}.pdf`);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to export PDF report.',
      );
    } finally {
      setExportingPdf(false);
    }
  };

  const activePillId =
    step === 'measuring'
      ? 'readiness'
      : step === 'completed'
        ? 'results'
        : step;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${test.testName} Measurement Workflow`}
    >
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.99 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-xl max-h-[92dvh] overflow-y-auto rounded-t-2xl sm:rounded-xl bg-white dark:bg-[#111B27] border-t sm:border border-[#D5E0EC] dark:border-[#1E2E42] pb-safe shadow-2xl"
      >
        <div className="sm:hidden pt-2.5 flex justify-center">
          <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
        </div>

        {/* Clinical Modal Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-[#D5E0EC] dark:border-[#1E2E42] flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs text-[#005EB8] dark:text-sky-300 truncate">
              {test.portNumber
                ? `Port ${test.portNumber} · ${test.sensingMethod}`
                : test.sensingMethod}
            </div>
            <h2 className="font-display text-lg font-bold mt-0.5 truncate">
              {test.testName}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close measurement modal"
            className="h-10 w-10 rounded-lg border border-[#CBD5E1] dark:border-[#24364D] flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/[0.06] shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 5-Stage Clinical Progress Strip */}
        <div className="px-4 sm:px-6 py-2.5 bg-[#F8FAFC] dark:bg-[#0D1622] border-b border-[#E2E8F0] dark:border-[#1E2E42] grid grid-cols-5 gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          {STEP_PILLS.map((pill) => {
            const active = activePillId === pill.id;
            return (
              <span
                key={pill.id}
                className={`text-center truncate py-0.5 rounded ${
                  active
                    ? 'font-semibold text-[#005EB8] dark:text-sky-300'
                    : ''
                }`}
              >
                {pill.label}
              </span>
            );
          })}
        </div>

        <div className="p-4 sm:p-6 space-y-5">
          {errorMsg && (
            <div
              role="alert"
              className="p-3.5 rounded-lg border border-rose-300 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-950/35 text-xs text-rose-800 dark:text-rose-200 flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <AnimatePresence mode="wait">
            {/* Step 1: Select Channel & Source */}
            {step === 'select' && (
              <motion.div
                key="select"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                {onSelectTest && testCatalog.length > 1 && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                      Selected Biomarker Channel
                    </label>
                    <select
                      value={test.slug}
                      onChange={(e) => {
                        const next = testCatalog.find(
                          (item) => item.slug === e.target.value,
                        );
                        if (next) {
                          setPrimaryInput('');
                          setSecondaryInput('');
                          setErrorMsg(null);
                          onSelectTest(next);
                        }
                      }}
                      className="w-full h-11 px-3 rounded-lg border border-[#CBD5E1] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0D1622] text-sm"
                    >
                      {testCatalog.map((t) => (
                        <option key={t.slug} value={t.slug}>
                          {t.portNumber ? `Port ${t.portNumber}: ` : ''}
                          {t.testName} ({t.unit})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="p-4 rounded-lg border border-[#D5E0EC] dark:border-[#1E2E42] bg-[#F8FAFC] dark:bg-[#0D1622]">
                  <div className="flex items-start gap-3">
                    <Bluetooth
                      className={`w-5 h-5 shrink-0 mt-0.5 ${
                        isBleConnected
                          ? 'text-teal-600 dark:text-teal-400'
                          : 'text-[#005EB8] dark:text-sky-300'
                      }`}
                    />
                    <div>
                      <div className="text-sm font-semibold">
                        {isHardwareComingSoon
                          ? 'Hardware Firmware Pending Validation'
                          : isBleConnected
                            ? `Connected: ${deviceInfo?.name}`
                            : 'Hema Nexus BLE Device Not Connected'}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                        {isHardwareComingSoon
                          ? 'This blood channel is scheduled for upcoming ESP32 chemistry validation. You can log verified laboratory values manually.'
                          : isBleConnected
                            ? 'Hardware channel verified and ready to receive GATT measurement packets.'
                            : 'Connect your physical unit via Bluetooth, use Simulated Device Mode, or record a validated manual reading.'}
                      </div>
                    </div>
                  </div>
                </div>

                {!isHardwareComingSoon && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      disabled={!isBleConnected}
                      onClick={() => setMode('ble')}
                      className={`min-h-[68px] p-3.5 rounded-lg border text-left transition-colors ${
                        mode === 'ble'
                          ? 'border-[#005EB8] dark:border-sky-400 bg-sky-50/70 dark:bg-sky-950/30'
                          : 'border-[#D5E0EC] dark:border-[#1E2E42]'
                      } disabled:opacity-45`}
                    >
                      <div className="text-sm font-semibold">
                        Hema Nexus BLE Capture
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {isBleConnected
                          ? 'Receive telemetry from connected unit'
                          : 'Requires active BLE connection'}
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setMode('manual')}
                      className={`min-h-[68px] p-3.5 rounded-lg border text-left transition-colors ${
                        mode === 'manual'
                          ? 'border-[#005EB8] dark:border-sky-400 bg-sky-50/70 dark:bg-sky-950/30'
                          : 'border-[#D5E0EC] dark:border-[#1E2E42]'
                      }`}
                    >
                      <div className="text-sm font-semibold">
                        Manual Clinical Entry
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Log a validated lab or standalone reading
                      </div>
                    </button>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                  {!isBleConnected && !isHardwareComingSoon ? (
                    <div className="flex flex-wrap items-center gap-4">
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onGoToDevice();
                        }}
                        className="min-h-[38px] text-xs font-medium text-[#005EB8] dark:text-sky-300 hover:underline"
                      >
                        Go to Connect Device
                      </button>
                      {onOpenSimulator && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onOpenSimulator();
                          }}
                          className="min-h-[38px] text-xs font-medium text-amber-800 dark:text-amber-300 hover:underline"
                        >
                          Use Simulated Mode
                        </button>
                      )}
                    </div>
                  ) : (
                    <span />
                  )}

                  <button
                    type="button"
                    onClick={() => setStep('prep')}
                    className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-lg hn-btn-primary text-sm font-semibold"
                  >
                    Continue
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 2: Preparation Protocol */}
            {step === 'prep' && (
              <motion.div
                key="prep"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <div>
                  <div className="text-xs font-semibold text-[#005EB8] dark:text-sky-300">
                    Clinical Preparation Protocol
                  </div>
                  <ol className="mt-3 space-y-2.5">
                    {test.instructions.map((line, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-200"
                      >
                        <span className="h-5 w-5 rounded bg-[#EEF3F8] dark:bg-[#0D1622] border border-[#D5E0EC] dark:border-[#1E2E42] text-xs font-mono font-semibold flex items-center justify-center shrink-0 mt-0.5 text-[#005EB8] dark:text-sky-300">
                          {i + 1}
                        </span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="p-3.5 rounded-lg bg-[#F8FAFC] dark:bg-[#0D1622] border border-[#D5E0EC] dark:border-[#1E2E42] text-xs">
                  <span className="text-slate-500 dark:text-slate-400">
                    Reference Range:{' '}
                  </span>
                  <span className="font-semibold tabular-nums-mono">
                    {formatReferenceRange(
                      test.referenceRangeConfig,
                      test.unit,
                      test.secondaryUnit,
                    )}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:flex justify-between gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setStep('select')}
                    className="min-h-[44px] px-4 py-2 rounded-lg border border-[#CBD5E1] dark:border-[#24364D] text-sm font-medium"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep('readiness')}
                    className="min-h-[44px] px-5 py-2 rounded-lg hn-btn-primary text-sm font-semibold"
                  >
                    Proceed to Capture
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 3: Readiness / Manual Input */}
            {step === 'readiness' && (
              <motion.div
                key="readiness"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {mode === 'ble' ? (
                  <div className="space-y-4">
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      Tap Start Measurement to listen for an incoming BLE notification packet from{' '}
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {deviceInfo?.name}
                      </span>
                      .
                    </p>
                    <div className="grid grid-cols-2 sm:flex justify-between gap-2.5 pt-2">
                      <button
                        type="button"
                        onClick={() => setStep('prep')}
                        className="min-h-[44px] px-4 py-2 rounded-lg border border-[#CBD5E1] dark:border-[#24364D] text-sm font-medium"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleStartBleCapture()}
                        className="min-h-[44px] px-5 py-2.5 rounded-lg hn-btn-primary text-sm font-semibold"
                      >
                        Start Measurement
                      </button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleValidateManual} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium mb-1.5">
                          {test.slug === 'blood_pressure'
                            ? 'Systolic (mmHg)'
                            : `Measured Value (${test.unit})`}
                        </label>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          required
                          value={primaryInput}
                          onChange={(e) => setPrimaryInput(e.target.value)}
                          placeholder={`${bounds.min} – ${bounds.max}`}
                          className="w-full h-11 px-3 rounded-lg border border-[#CBD5E1] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0D1622] text-sm font-mono"
                        />
                      </div>

                      {needsSecondary && (
                        <div>
                          <label className="block text-xs font-medium mb-1.5">
                            {test.slug === 'blood_pressure'
                              ? 'Diastolic (mmHg)'
                              : 'Pulse Rate (BPM, optional)'}
                          </label>
                          <input
                            type="number"
                            inputMode="decimal"
                            step="any"
                            required={test.slug === 'blood_pressure'}
                            value={secondaryInput}
                            onChange={(e) => setSecondaryInput(e.target.value)}
                            placeholder={
                              test.slug === 'blood_pressure' ? '80' : '72'
                            }
                            className="w-full h-11 px-3 rounded-lg border border-[#CBD5E1] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0D1622] text-sm font-mono"
                          />
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-medium mb-1.5">
                        Notes (optional)
                      </label>
                      <input
                        type="text"
                        maxLength={300}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="e.g., Fasting 10 hours, lab slip #412"
                        className="w-full h-11 px-3 rounded-lg border border-[#CBD5E1] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0D1622] text-sm"
                      />
                    </div>

                    <div className="grid grid-cols-2 sm:flex justify-between gap-2.5 pt-2">
                      <button
                        type="button"
                        onClick={() => setStep('prep')}
                        className="min-h-[44px] px-4 py-2 rounded-lg border border-[#CBD5E1] dark:border-[#24364D] text-sm font-medium"
                      >
                        Back
                      </button>
                      <button
                        type="submit"
                        className="min-h-[44px] px-5 py-2 rounded-lg hn-btn-primary text-sm font-semibold"
                      >
                        Review Result
                      </button>
                    </div>
                  </form>
                )}
              </motion.div>
            )}

            {/* Step 4: BLE Telemetry Capture State */}
            {step === 'measuring' && (
              <motion.div
                key="measuring"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="py-6 text-center space-y-5"
              >
                <div className="relative mx-auto h-20 w-20 flex items-center justify-center">
                  <motion.div
                    animate={{ scale: [1, 1.22, 1], opacity: [0.55, 0.15, 0.55] }}
                    transition={{ duration: 1.8, repeat: Infinity }}
                    className="absolute inset-0 rounded-full border border-[#005EB8] dark:border-sky-400"
                  />
                  <div className="h-14 w-14 rounded-full bg-sky-50 dark:bg-sky-950/50 border border-[#005EB8]/40 dark:border-sky-400/50 flex items-center justify-center">
                    <Bluetooth className="w-6 h-6 text-[#005EB8] dark:text-sky-300" />
                  </div>
                </div>
                <div>
                  <div className="text-base font-semibold">
                    Capturing {test.testName} Telemetry
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
                    Waiting for incoming GATT packet from {deviceInfo?.name}. Keep the device close until capture completes.
                  </p>
                </div>
                <div className="pt-2 flex flex-col sm:flex-row justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setStep('readiness')}
                    className="min-h-[44px] px-4 py-2 rounded-lg border border-[#CBD5E1] dark:border-[#24364D] text-xs font-medium"
                  >
                    Cancel Wait
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('manual');
                      setStep('readiness');
                    }}
                    className="min-h-[44px] px-4 py-2 rounded-lg text-xs font-medium text-[#005EB8] dark:text-sky-300 hover:underline"
                  >
                    Switch to Manual Entry
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 5: Measurement Completed Confirmation */}
            {step === 'completed' && (
              <motion.div
                key="completed"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="py-5 text-center space-y-4"
              >
                <div className="mx-auto h-14 w-14 rounded-xl bg-teal-50 dark:bg-teal-950/50 border border-teal-300 dark:border-teal-500/40 flex items-center justify-center">
                  <CheckCircle2 className="w-7 h-7 text-teal-700 dark:text-teal-400" />
                </div>
                <div>
                  <div className="text-xs font-mono uppercase tracking-wider text-teal-700 dark:text-teal-400">
                    Validation Complete
                  </div>
                  <h3 className="mt-1 font-display text-xl font-bold">
                    Measurement Captured
                  </h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {mode === 'ble' ? 'BLE GATT Packet Verified' : 'Clinical Range Validated'}{' '}
                    · {formatDateTime(capturedAt)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStep('results')}
                  className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 rounded-lg hn-btn-primary text-sm font-semibold inline-flex items-center justify-center gap-2"
                >
                  <span>Inspect Clinical Results</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </motion.div>
            )}

            {/* Step 6: Clinical Results Screen with Trend Comparison */}
            {step === 'results' && (
              <motion.div
                key="results"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <div className="p-5 rounded-xl bg-[#F8FAFC] dark:bg-[#0D1622] border border-[#D5E0EC] dark:border-[#1E2E42]">
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span>
                      {mode === 'ble' ? 'Hema Nexus BLE' : 'Manual Clinical Entry'}
                    </span>
                    <span className="tabular-nums-mono">
                      {formatDateTime(capturedAt)}
                    </span>
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-baseline gap-2.5">
                    <span className="font-display text-4xl font-bold tabular-nums-mono">
                      {parsedPrimary}
                      {parsedSecondary !== null ? `/${parsedSecondary}` : ''}
                    </span>
                    <span className="text-sm font-mono text-slate-500 dark:text-slate-400">
                      {test.unit}
                    </span>
                    {previewStatus && (
                      <span
                        className={`text-xs font-semibold ${
                          getStatusDisplay(previewStatus).textClass
                        }`}
                      >
                        {getStatusDisplay(previewStatus).glyph}{' '}
                        {getStatusDisplay(previewStatus).label}
                      </span>
                    )}
                  </div>

                  <p className="mt-2.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {calmGuidance}
                  </p>

                  <div className="mt-3 pt-3 border-t border-[#E2E8F0] dark:border-[#1E2E42] grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    <div>
                      <span className="text-slate-500 dark:text-slate-400">
                        Reference:{' '}
                      </span>
                      <span className="font-mono font-medium">
                        {formatReferenceRange(
                          test.referenceRangeConfig,
                          test.unit,
                          test.secondaryUnit,
                        )}
                      </span>
                    </div>

                    {priorReading && deltaFromPrior !== null && (
                      <div className="flex items-center gap-1.5 sm:justify-end">
                        {deltaFromPrior >= 0 ? (
                          <TrendingUp className="w-3.5 h-3.5 text-[#005EB8] dark:text-sky-300" />
                        ) : (
                          <TrendingDown className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                        )}
                        <span className="text-slate-500 dark:text-slate-400">
                          vs Prior ({formatMeasurementValue(priorReading)}):
                        </span>
                        <span className="font-mono font-semibold">
                          {deltaFromPrior > 0 ? `+${deltaFromPrior}` : deltaFromPrior}{' '}
                          {test.unit}
                        </span>
                      </div>
                    )}
                  </div>

                  {rawPacketHex && (
                    <div className="mt-2 text-[11px] font-mono text-slate-400">
                      Packet 0x{rawPacketHex.slice(0, 14)}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1.5">
                    Clinical Notes (optional)
                  </label>
                  <input
                    type="text"
                    maxLength={300}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add context before storing to clinical record..."
                    className="w-full h-11 px-3 rounded-lg border border-[#CBD5E1] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0D1622] text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 sm:flex justify-between gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setStep('readiness')}
                    className="min-h-[44px] px-4 py-2 rounded-lg border border-[#CBD5E1] dark:border-[#24364D] text-sm font-medium"
                  >
                    Edit Value
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={saving}
                    className="min-h-[44px] px-5 py-2 rounded-lg hn-btn-primary text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    <ClipboardCheck className="w-4 h-4 shrink-0" />
                    <span>{saving ? 'Saving...' : 'Save Result'}</span>
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 7: Saved & Report Export Actions */}
            {step === 'saved' && (
              <motion.div
                key="saved"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="py-4 text-center space-y-4"
              >
                <CheckCircle2 className="w-11 h-11 text-teal-600 dark:text-teal-400 mx-auto" />
                <div>
                  <h3 className="font-display text-lg font-bold">
                    {saveOutcome === 'queued'
                      ? 'Queued for Synchronization'
                      : 'Measurement Stored'}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
                    {saveOutcome === 'queued'
                      ? 'Backend connectivity was temporarily unavailable. Your measurement is safely queued and can be synced from the top bar.'
                      : 'Your reading has been verified and saved to your PostgreSQL clinical record.'}
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5 pt-2">
                  {savedRecord && (
                    <button
                      type="button"
                      disabled={exportingPdf}
                      onClick={() => void handleExportPdf()}
                      className="min-h-[44px] px-4 py-2 rounded-lg border border-[#005EB8]/40 dark:border-sky-400/40 bg-sky-50 dark:bg-sky-950/40 text-[#005EB8] dark:text-sky-300 text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>
                        {exportingPdf ? 'Building PDF...' : 'Export PDF Report'}
                      </span>
                    </button>
                  )}

                  {onGoToReports && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onGoToReports();
                      }}
                      className="min-h-[44px] px-4 py-2 rounded-lg border border-[#CBD5E1] dark:border-[#24364D] text-xs font-medium flex items-center justify-center gap-1.5"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>All Reports</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={onClose}
                    className="min-h-[44px] px-6 py-2 rounded-lg hn-btn-primary text-xs font-semibold"
                  >
                    Return to Dashboard
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
