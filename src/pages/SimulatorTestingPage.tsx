import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Activity,
  ClipboardList,
  Cpu,
  Download,
  FileText,
  History,
  Layers,
  Loader2,
  Play,
  Power,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { HemaCard, StatusBanner } from '../components/ui/HemaPrimitives.tsx';
import { BRAND_ASSETS } from '../config/assets.ts';
import { useAuth } from '../contexts/AuthContext.tsx';
import { useHemaData } from '../contexts/HemaDataContext.tsx';
import { useSimulatedDevice } from '../contexts/SimulatedDeviceContext.tsx';
import {
  SIMULATOR_TEST_PANEL_SLUGS,
  type FailureSimulationMode,
  type SimulatedSampleMode,
} from '../services/device/simulatedDeviceService.ts';
import { generateClinicalPdfReport } from '../services/reports/pdfGenerator.ts';
import type { MeasurementRecord, NavSection, ReportRecord } from '../types/hema.ts';
import { getPhysiologicalBounds } from '../utils/clinicalValidation.ts';
import {
  formatDateTime,
  formatMeasurementValue,
  formatShortDate,
  getStatusDisplay,
} from '../utils/formatters.ts';

function AnalyticsTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string }[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg bg-white dark:bg-[#111B27] border border-[#D5E0EC] dark:border-[#24364D] px-3 py-2 text-xs shadow-lg">
      <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 mb-1">
        {label}
      </div>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center justify-between gap-3">
          <span className="text-slate-600 dark:text-slate-300">
            {entry.name}
          </span>
          <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
            {entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

interface SimulatorTestingPageProps {
  onNavigate: (section: NavSection) => void;
}

type SimulatorTab = 'workflow' | 'hospital';

const WORKFLOW_STAGES = [
  'Sim Connection',
  'Patient',
  'Test Selection',
  'Processing',
  'Generation',
  'Validation',
  'DB Storage',
  'History & Report',
] as const;

export function SimulatorTestingPage({
  onNavigate,
}: SimulatorTestingPageProps) {
  const { profile } = useAuth();
  const {
    testCatalog,
    hospitals,
    devices,
    patients,
    testSessions,
    measurements,
    auditLogs,
    registerDevice,
    updateDeviceStatus,
    logDeviceEvent,
    registerPatient,
    removePatient,
    createTestSession,
    updateTestSession,
    recordMeasurement,
    generateReport,
    logAuditEvent,
  } = useHemaData();

  const {
    state: simState,
    deviceInfo: simDevice,
    connectSimulator,
    disconnectSimulator,
    runSimulatedTest,
  } = useSimulatedDevice();

  const [tab, setTab] = useState<SimulatorTab>('workflow');

  // Workflow controls
  const [selectedPatientId, setSelectedPatientId] = useState<string>('self');
  const [selectedSlug, setSelectedSlug] = useState<string>('glucose');
  const [sampleMode, setSampleMode] = useState<SimulatedSampleMode>('normal');
  const [customPrimary, setCustomPrimary] = useState('');
  const [customSecondary, setCustomSecondary] = useState('');
  const [failureMode, setFailureMode] =
    useState<FailureSimulationMode>('none');

  // Execution state
  const [busy, setBusy] = useState(false);
  const [activeStageIdx, setActiveStageIdx] = useState<number>(0);
  const [progressPct, setProgressPct] = useState<number>(0);
  const [progressLabel, setProgressLabel] = useState<string>('');
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [sessionSaved, setSessionSaved] = useState<MeasurementRecord[]>([]);
  const [lastSessionId, setLastSessionId] = useState<number | null>(null);
  const [lastGeneratedReport, setLastGeneratedReport] = useState<{
    report: ReportRecord;
    measurements: MeasurementRecord[];
  } | null>(null);

  // Hospital registration form
  const [patientName, setPatientName] = useState('');
  const [patientUhid, setPatientUhid] = useState('');
  const [patientDob, setPatientDob] = useState('');
  const [patientSex, setPatientSex] = useState('Female');
  const [patientPhone, setPatientPhone] = useState('');
  const [patientEmail, setPatientEmail] = useState('');
  const [patientAddress, setPatientAddress] = useState('');
  const [patientNotes, setPatientNotes] = useState('');
  const [registeringPatient, setRegisteringPatient] = useState(false);
  const [inspectedPatientId, setInspectedPatientId] = useState<number | null>(
    null,
  );
  const [confirmRemovePatientId, setConfirmRemovePatientId] = useState<
    number | null
  >(null);

  useEffect(() => {
    setCustomPrimary('');
    setCustomSecondary('');
  }, [selectedSlug]);

  const panelTests = useMemo(() => {
    const order = new Map<string, number>(
      SIMULATOR_TEST_PANEL_SLUGS.map((s, idx) => [s, idx]),
    );
    return testCatalog
      .filter((t) => order.has(t.slug))
      .slice()
      .sort((a, b) => (order.get(a.slug) ?? 99) - (order.get(b.slug) ?? 99));
  }, [testCatalog]);

  const selectedTestMeta =
    panelTests.find((t) => t.slug === selectedSlug) || panelTests[0] || null;

  const selectedPatient =
    selectedPatientId === 'self'
      ? null
      : patients.find((p) => String(p.id) === selectedPatientId) || null;

  const activeStage = useMemo(() => {
    if (busy) return activeStageIdx;
    if (lastGeneratedReport || sessionSaved.length > 0) return 7;
    if (simState === 'connected') return 2;
    return 0;
  }, [busy, activeStageIdx, lastGeneratedReport, sessionSaved.length, simState]);

  const handleConnectSim = async () => {
    setErrorBanner(null);
    setStatusBanner(null);
    try {
      const info = await connectSimulator();
      await registerDevice({
        deviceName: info.name,
        deviceIdentifier: info.id,
        firmwareVersion: info.firmwareVersion,
        hardwareRevision: info.hardwareRevision,
        connectionType: 'simulated',
      });
      setStatusBanner(
        'SIMULATED Hema Nexus device connected and registered for software testing.',
      );
    } catch (err) {
      setErrorBanner(
        err instanceof Error
          ? err.message
          : 'Failed to connect simulated device.',
      );
    }
  };

  const handleDisconnectSim = async () => {
    setErrorBanner(null);
    await disconnectSimulator();
    const simDb = devices.find(
      (d) =>
        d.connectionType === 'simulated' ||
        d.deviceIdentifier === 'SIM-HN-DEV-001',
    );
    if (simDb) {
      await updateDeviceStatus(simDb.id, { status: 'disconnected' });
    }
    await logAuditEvent({
      action: 'SIMULATED_DEVICE_DISCONNECTED',
      entityType: 'device',
      entityId: simDb?.id ?? 'SIM-HN-DEV-001',
    });
    setStatusBanner('SIMULATED Hema Nexus device disconnected.');
  };

  const resolveSimDbDeviceId = (): number | null => {
    const found = devices.find(
      (d) =>
        d.connectionType === 'simulated' ||
        d.deviceIdentifier === 'SIM-HN-DEV-001',
    );
    return found ? found.id : null;
  };

  const executeSingleOrBatch = async (slugs: string[]) => {
    setErrorBanner(null);
    setStatusBanner(null);
    setLastGeneratedReport(null);

    if (simState !== 'connected') {
      setErrorBanner(
        'Connect the Simulated Hema Nexus Device before running simulated tests.',
      );
      return;
    }

    if (sampleMode === 'custom' && slugs.length === 1) {
      const val = Number(customPrimary);
      if (!Number.isFinite(val)) {
        setErrorBanner('Enter a valid numeric value for Custom Test mode.');
        return;
      }
      const bounds = getPhysiologicalBounds(slugs[0]);
      if (val < bounds.min || val > bounds.max) {
        setErrorBanner(
          `Custom value must be within physiological bounds (${bounds.min}–${bounds.max}).`,
        );
        return;
      }
      if (slugs[0] === 'blood_pressure') {
        const sec = Number(customSecondary);
        if (!Number.isFinite(sec)) {
          setErrorBanner('Enter both Systolic and Diastolic values.');
          return;
        }
      }
    }

    setBusy(true);
    const newlySaved: MeasurementRecord[] = [];
    const simDeviceId = resolveSimDbDeviceId();
    const patientRecordId = selectedPatient ? selectedPatient.id : null;
    let activeSessionId: number | null = null;

    try {
      const createdSession = await createTestSession({
        patientRecordId,
        deviceId: simDeviceId,
        testMode: 'simulated',
        selectedParameters: slugs,
      });
      activeSessionId = createdSession.id;
      setLastSessionId(createdSession.id);

      for (let i = 0; i < slugs.length; i++) {
        const slug = slugs[i];
        setActiveStageIdx(3);
        setProgressLabel(
          `Running ${slug} (${i + 1}/${slugs.length}) — SIMULATED`,
        );

        const packet = await runSimulatedTest({
          testType: slug,
          sampleMode:
            slugs.length > 1 && sampleMode === 'custom'
              ? 'normal'
              : sampleMode,
          customValue:
            sampleMode === 'custom' && slugs.length === 1
              ? Number(customPrimary)
              : undefined,
          customSecondaryValue:
            sampleMode === 'custom' &&
            slugs.length === 1 &&
            customSecondary.trim() !== ''
              ? Number(customSecondary)
              : null,
          failureMode,
          onStage: (label, pct) => {
            setProgressLabel(`${label} (${i + 1}/${slugs.length})`);
            setProgressPct(pct);
            if (pct >= 75) setActiveStageIdx(4);
          },
        });

        setActiveStageIdx(5);
        const dupKey =
          failureMode === 'duplicate_submission'
            ? `sim-dup-${slug}-${selectedPatientId}`
            : null;

        setActiveStageIdx(6);
        const firstAttempt = await recordMeasurement({
          testType: packet.testType,
          measuredValue: packet.measuredValue,
          secondaryValue: packet.secondaryValue,
          measuredAt: packet.receivedAt,
          dataSource: 'simulated_device',
          deviceId: simDeviceId,
          patientRecordId,
          sessionId: activeSessionId,
          notes: `SIMULATED (${sampleMode.toUpperCase()}) · ${selectedPatient ? `UHID ${selectedPatient.uhid}` : 'Self Profile'}`,
          rawPacketHex: packet.rawPacketHex,
          explicitIdempotencyKey: dupKey,
          simulateApiFailure: failureMode === 'api_failure',
          simulateNetworkInterruption: failureMode === 'network_interruption',
        });

        if (firstAttempt.saved) {
          newlySaved.push(firstAttempt.saved);
        }

        if (failureMode === 'duplicate_submission' && dupKey) {
          const secondAttempt = await recordMeasurement({
            testType: packet.testType,
            measuredValue: packet.measuredValue,
            secondaryValue: packet.secondaryValue,
            measuredAt: packet.receivedAt,
            dataSource: 'simulated_device',
            deviceId: simDeviceId,
            patientRecordId,
            sessionId: activeSessionId,
            notes: `SIMULATED duplicate verification`,
            rawPacketHex: packet.rawPacketHex,
            explicitIdempotencyKey: dupKey,
          });

          if (secondAttempt.deduplicated) {
            setStatusBanner(
              `Duplicate submission test verified: backend deduplicated repeated key (${dupKey}) without creating a second row.`,
            );
          }
        }
      }

      if (activeSessionId) {
        await updateTestSession(activeSessionId, {
          sessionStatus: 'completed',
          completionStatus:
            newlySaved.length === slugs.length
              ? 'complete'
              : newlySaved.length > 0
                ? 'partial'
                : 'incomplete',
        });
      }

      if (newlySaved.length > 0) {
        setSessionSaved((prev) => [...newlySaved, ...prev]);
        setActiveStageIdx(7);
        if (failureMode !== 'duplicate_submission') {
          setStatusBanner(
            `Saved ${newlySaved.length} SIMULATED measurement${newlySaved.length > 1 ? 's' : ''} to PostgreSQL${selectedPatient ? ` for ${selectedPatient.fullName} (${selectedPatient.uhid})` : ''}.`,
          );
        }
      } else if (failureMode === 'network_interruption') {
        setStatusBanner(
          'Simulated network interruption handled: measurement queued in session sync buffer. Click Sync in the top bar to recover.',
        );
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Simulated test execution failed.';
      setErrorBanner(msg);
      if (activeSessionId) {
        await updateTestSession(activeSessionId, {
          sessionStatus: 'failed',
          completionStatus: newlySaved.length > 0 ? 'partial' : 'incomplete',
          errorDetails: msg,
        });
      }
      if (simDeviceId) {
        await logDeviceEvent(simDeviceId, {
          eventType: 'error',
          connectionMode: 'simulated',
          errorCode: failureMode !== 'none' ? failureMode.toUpperCase() : 'SIM_ERR',
          message: msg,
        });
      }
      await logAuditEvent({
        action: 'SIMULATED_FAILURE_HANDLED',
        entityType: 'device',
        details: { failureMode, error: msg, testSlugs: slugs },
      });
    } finally {
      setBusy(false);
      setProgressPct(0);
      setProgressLabel('');
    }
  };

  const handleGenerateSessionReport = async (
    targetMeasurements: MeasurementRecord[],
    targetPatient?: typeof selectedPatient,
  ) => {
    if (!profile || targetMeasurements.length === 0) return;
    setErrorBanner(null);
    try {
      const created = await generateReport({
        title: targetPatient
          ? `Hema Nexus Simulated Lab Panel — ${targetPatient.fullName}`
          : 'Hema Nexus Simulated Device Validation Report',
        measurementIds: targetMeasurements.map((m) => m.id),
        patientRecordId: targetPatient ? targetPatient.id : null,
        sessionId: lastSessionId,
        summaryNotes:
          'Generated from Hema Nexus Simulated Device Mode for end-to-end software & workflow verification.',
      });
      setLastGeneratedReport(created);
      setStatusBanner(
        `Report ${created.report.reportCode} generated. Ready for PDF download.`,
      );
    } catch (err) {
      setErrorBanner(
        err instanceof Error ? err.message : 'Failed to generate report.',
      );
    }
  };

  const handleDownloadPdf = async (
    report: ReportRecord,
    reportMeasurements: MeasurementRecord[],
  ) => {
    if (!profile) return;
    const pdf = await generateClinicalPdfReport({
      report,
      measurements: reportMeasurements,
      profile,
      testCatalog,
    });
    pdf.save(`${report.reportCode}.pdf`);
  };

  const handleRegisterPatient = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);
    setStatusBanner(null);
    setRegisteringPatient(true);
    try {
      const created = await registerPatient({
        fullName: patientName.trim(),
        uhid: patientUhid.trim() || null,
        dateOfBirth: patientDob || null,
        sex: patientSex,
        phone: patientPhone.trim() || null,
        email: patientEmail.trim() || null,
        address: patientAddress.trim() || null,
        notes: patientNotes.trim() || null,
      });
      setPatientName('');
      setPatientUhid('');
      setPatientDob('');
      setPatientPhone('');
      setPatientEmail('');
      setPatientAddress('');
      setPatientNotes('');
      setInspectedPatientId(created.id);
      setSelectedPatientId(String(created.id));
      setStatusBanner(
        `Registered patient ${created.fullName} (${created.uhid}).`,
      );
    } catch (err) {
      setErrorBanner(
        err instanceof Error ? err.message : 'Failed to register patient.',
      );
    } finally {
      setRegisteringPatient(false);
    }
  };

  const getLocalDayKey = (isoOrDate: Date | string) => {
    const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const dailyAnalytics = useMemo(() => {
    const byDay = new Map<
      string,
      { day: string; simulated: number; standard: number }
    >();
    for (const m of measurements) {
      const dayKey = getLocalDayKey(m.measuredAt);
      const entry = byDay.get(dayKey) || {
        day: formatShortDate(m.measuredAt),
        simulated: 0,
        standard: 0,
      };
      if (m.isSimulated || m.dataSource === 'simulated_device') {
        entry.simulated += 1;
      } else {
        entry.standard += 1;
      }
      byDay.set(dayKey, entry);
    }
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-7)
      .map(([, v]) => v);
  }, [measurements]);

  const inspectedPatient =
    patients.find((p) => p.id === inspectedPatientId) || patients[0] || null;
  const inspectedPatientMeasurements = useMemo(() => {
    if (!inspectedPatient) return [];
    return measurements.filter(
      (m) => m.patientRecordId === inspectedPatient.id,
    );
  }, [measurements, inspectedPatient]);

  const todayPrefix = getLocalDayKey(new Date());
  const todayTestsCount = measurements.filter(
    (m) => getLocalDayKey(m.measuredAt) === todayPrefix,
  ).length;
  const simulatedTotalCount = measurements.filter(
    (m) => m.isSimulated || m.dataSource === 'simulated_device',
  ).length;
  const abnormalCount = measurements.filter(
    (m) => m.status !== 'normal',
  ).length;

  return (
    <div className="space-y-6">
      {/* Header & Tab Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Simulated Device Mode
            </h1>
            <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
              · SIMULATION
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            End-to-end software testing environment for Hema Nexus prior to physical ESP32 hardware completion. All generated readings are flagged as SIMULATED.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:inline-flex items-center gap-1 p-1 rounded-lg bg-[#EEF3F8] dark:bg-[#0D1622] border border-[#D5E0EC] dark:border-[#1E2E42] w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setTab('workflow')}
            className={`min-h-[40px] px-3 sm:px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap text-center ${
              tab === 'workflow'
                ? 'bg-white dark:bg-[#18273A] text-[#005EB8] dark:text-sky-300 font-semibold shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Device Simulator
          </button>
          <button
            type="button"
            onClick={() => setTab('hospital')}
            className={`min-h-[40px] px-3 sm:px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap text-center ${
              tab === 'hospital'
                ? 'bg-white dark:bg-[#18273A] text-[#005EB8] dark:text-sky-300 font-semibold shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Hospital Console
          </button>
        </div>
      </div>

      {/* Global Simulated Notice Banner */}
      <StatusBanner
        variant="warning"
        message="SIMULATED TESTING ENVIRONMENT: Real Web Bluetooth hardware pairing remains separate in Connect Device. Measurements created here are stored in PostgreSQL with is_simulated = true and labeled SIMULATED TEST DATA across history, analytics, and PDF reports."
      />

      {errorBanner && (
        <StatusBanner
          variant="error"
          message={errorBanner}
          onDismiss={() => setErrorBanner(null)}
        />
      )}

      {statusBanner && (
        <StatusBanner
          variant="success"
          message={statusBanner}
          onDismiss={() => setStatusBanner(null)}
        />
      )}

      {tab === 'workflow' ? (
        <div className="space-y-6">
          {/* Workflow Pipeline Progress */}
          <HemaCard className="p-4">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-3">
              End-to-End Verification Pipeline
            </div>
            <div className="grid grid-cols-2 sm:flex sm:overflow-x-auto no-scrollbar items-center gap-2">
              {WORKFLOW_STAGES.map((label, idx) => {
                const done = idx < activeStage;
                const current = idx === activeStage;
                return (
                  <div key={label} className="flex items-center gap-2 sm:shrink-0">
                    <div
                      className={`w-full sm:w-auto px-2.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-medium border truncate ${
                        current
                          ? 'hn-btn-primary border-transparent font-semibold'
                          : done
                            ? 'bg-teal-50 dark:bg-teal-950/35 text-teal-700 dark:text-teal-300 border-teal-300 dark:border-teal-500/35'
                            : 'bg-[#F8FAFC] dark:bg-[#0D1622] text-slate-500 dark:text-slate-400 border-[#D5E0EC] dark:border-[#1E2E42]'
                      }`}
                    >
                      {idx + 1}. {label}
                    </div>
                    {idx < WORKFLOW_STAGES.length - 1 && (
                      <span className="hidden sm:inline text-slate-300 dark:text-slate-600">
                        →
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </HemaCard>

          {/* Row 1: Simulated Device Card + Patient & Fault Injection Controls */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            <HemaCard
              variant="clinical"
              className="lg:col-span-5 p-5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-mono text-amber-300">
                      SIMULATED HARDWARE TRANSPORT
                    </div>
                    <h2 className="font-display text-lg font-bold mt-0.5 text-white">
                      {simDevice?.name || 'Hema Nexus Simulator'}
                    </h2>
                  </div>
                  <span className="text-xs font-mono text-slate-300">
                    {simState === 'connected'
                      ? '● SIMULATED ON'
                      : simState === 'connecting' || simState === 'scanning'
                        ? '◌ CONNECTING...'
                        : simState === 'disconnecting'
                          ? '◌ CLOSING...'
                          : '○ OFFLINE'}
                  </span>
                </div>

                <motion.div
                  animate={{
                    opacity:
                      simState === 'connecting' || simState === 'scanning'
                        ? [0.65, 1, 0.65]
                        : 1,
                    scale: simState === 'connected' ? 1 : 0.985,
                  }}
                  transition={{
                    duration: 0.9,
                    repeat:
                      simState === 'connecting' || simState === 'scanning'
                        ? Infinity
                        : 0,
                  }}
                  className="mt-4 rounded-xl bg-[#081829] border border-[#1E3F66] p-3"
                >
                  <img
                    src={BRAND_ASSETS.productPhoto}
                    alt="Simulated Hema Nexus Hardware Preview"
                    referrerPolicy="no-referrer"
                    className="w-full h-44 object-contain mx-auto"
                  />
                </motion.div>

                <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-2.5 rounded-lg bg-[#081829] border border-[#1E3F66] min-w-0">
                    <dt className="text-slate-400">Simulated ID</dt>
                    <dd className="mt-0.5 font-mono font-semibold text-white truncate">
                      {simDevice?.id || 'SIM-HN-DEV-001'}
                    </dd>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#081829] border border-[#1E3F66] min-w-0">
                    <dt className="text-slate-400">Firmware</dt>
                    <dd className="mt-0.5 font-mono font-semibold text-amber-300 truncate">
                      {simDevice?.firmwareVersion || 'SIM-FW-0.9.4-TEST'}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="mt-5 flex items-center gap-3">
                {simState !== 'connected' ? (
                  <button
                    type="button"
                    disabled={
                      simState === 'scanning' || simState === 'connecting'
                    }
                    onClick={() => void handleConnectSim()}
                    className="flex-1 min-h-[44px] px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60 transition-colors whitespace-nowrap"
                  >
                    <Cpu className="w-4 h-4" />
                    <span>
                      {simState === 'scanning' || simState === 'connecting'
                        ? 'Connecting Simulator...'
                        : 'Connect Simulated Device'}
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleDisconnectSim()}
                    className="flex-1 min-h-[44px] px-4 py-2 rounded-lg border border-rose-500/45 bg-rose-950/45 text-rose-200 hover:bg-rose-950/65 text-sm font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                  >
                    <Power className="w-4 h-4" />
                    <span>Disconnect Simulator</span>
                  </button>
                )}
              </div>
            </HemaCard>

            <HemaCard className="lg:col-span-7 p-5 sm:p-6 flex flex-col justify-between space-y-5">
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      2. Target Patient Profile
                    </label>
                    <select
                      value={selectedPatientId}
                      onChange={(e) => setSelectedPatientId(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0D1622] text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#005EB8] dark:focus:border-sky-400"
                    >
                      <option value="self">
                        Self Account ({profile?.patientCode || 'Personal'})
                      </option>
                      {patients.map((p) => (
                        <option key={p.id} value={String(p.id)}>
                          {p.fullName} ({p.uhid})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Failure Scenario Injection
                    </label>
                    <select
                      value={failureMode}
                      onChange={(e) =>
                        setFailureMode(e.target.value as FailureSimulationMode)
                      }
                      className="w-full h-10 px-3 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0D1622] text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#005EB8] dark:focus:border-sky-400"
                    >
                      <option value="none">None (Normal Execution)</option>
                      <option value="device_disconnect">
                        Device Disconnection Mid-Test
                      </option>
                      <option value="invalid_strip">
                        Invalid Strip Detection
                      </option>
                      <option value="insufficient_sample">
                        Insufficient Sample Volume
                      </option>
                      <option value="incomplete_measurement">
                        Incomplete Measurement Packet
                      </option>
                      <option value="api_failure">
                        API Storage Failure (HTTP 503)
                      </option>
                      <option value="network_interruption">
                        Network Interruption (Offline Queue)
                      </option>
                      <option value="duplicate_submission">
                        Duplicate Submission (Idempotency)
                      </option>
                    </select>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Sample Value Profile
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {(
                      [
                        ['normal', 'Normal Sample'],
                        ['abnormal', 'Abnormal Sample'],
                        ['custom', 'Custom Value'],
                      ] as [SimulatedSampleMode, string][]
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setSampleMode(id)}
                        className={`min-h-[40px] px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                          sampleMode === id
                            ? 'border-amber-600 dark:border-amber-400 bg-amber-50 dark:bg-amber-950/35 text-amber-800 dark:text-amber-300 font-semibold'
                            : 'border-[#D5E0EC] dark:border-[#24364D] text-slate-700 dark:text-slate-300 hover:bg-[#F8FAFC] dark:hover:bg-[#162232]'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {sampleMode === 'custom' && selectedTestMeta && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-lg bg-[#F8FAFC] dark:bg-[#0D1622] border border-[#D5E0EC] dark:border-[#1E2E42]">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        {selectedTestMeta.slug === 'blood_pressure'
                          ? 'Custom Systolic (mmHg)'
                          : `Custom ${selectedTestMeta.testName} (${selectedTestMeta.unit})`}
                      </label>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="any"
                        value={customPrimary}
                        onChange={(e) => setCustomPrimary(e.target.value)}
                        placeholder={`e.g. ${selectedTestMeta.referenceRangeConfig.minNormal}`}
                        className="w-full h-11 px-3 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] bg-white dark:bg-[#111B27] text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#005EB8] dark:focus:border-sky-400"
                      />
                    </div>
                    {(selectedTestMeta.slug === 'blood_pressure' ||
                      selectedTestMeta.slug === 'spo2') && (
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          {selectedTestMeta.slug === 'blood_pressure'
                            ? 'Custom Diastolic (mmHg)'
                            : 'Custom Pulse (BPM)'}
                        </label>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          value={customSecondary}
                          onChange={(e) => setCustomSecondary(e.target.value)}
                          placeholder="e.g. 76"
                          className="w-full h-11 px-3 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] bg-white dark:bg-[#111B27] text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#005EB8] dark:focus:border-sky-400"
                        />
                      </div>
                    )}
                  </div>
                )}

                {busy && (
                  <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-500/40 space-y-2">
                    <div className="flex items-center justify-between text-xs font-medium text-amber-950 dark:text-amber-200">
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>{progressLabel || 'Processing...'}</span>
                      </span>
                      <span className="tabular-nums-mono">{progressPct}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-amber-200/80 dark:bg-[#0D1622] overflow-hidden">
                      <div
                        className="h-full bg-amber-600 dark:bg-amber-400 transition-all duration-300"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-[#D5E0EC] dark:border-[#1E2E42] flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={busy || !selectedTestMeta}
                  onClick={() =>
                    selectedTestMeta &&
                    void executeSingleOrBatch([selectedTestMeta.slug])
                  }
                  className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  <Play className="w-4 h-4 shrink-0" />
                  <span className="truncate">
                    Run Single Test ({selectedTestMeta?.testName || 'Select'})
                  </span>
                </button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void executeSingleOrBatch([...SIMULATOR_TEST_PANEL_SLUGS])
                  }
                  className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-lg hn-btn-primary text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 whitespace-nowrap"
                >
                  <Layers className="w-4 h-4 shrink-0" />
                  <span>Run Complete 13-Parameter Session</span>
                </button>
              </div>
            </HemaCard>
          </section>

          {/* 9 Blood Parameters + 4 Vitals Interactive Test Selector */}
          <HemaCard className="p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  3. Diagnostic Test Panel (9 Blood Parameters + 4 Vitals)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Tap any parameter to target it for single-test simulation, or run the full 13-parameter session above.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
              {panelTests.map((t) => {
                const isSelected = t.slug === selectedSlug;
                const latestSim = sessionSaved.find(
                  (m) => m.testType === t.slug,
                );
                return (
                  <button
                    key={t.slug}
                    type="button"
                    onClick={() => setSelectedSlug(t.slug)}
                    className={`min-h-[76px] p-3 sm:p-3.5 rounded-xl border text-left transition-colors flex flex-col justify-between ${
                      isSelected
                        ? 'border-amber-600 dark:border-amber-400 bg-amber-50/75 dark:bg-[#1C1608]'
                        : 'border-[#D5E0EC] dark:border-[#1E2E42] hover:border-[#005EB8]/45 dark:hover:border-sky-400/45 bg-white dark:bg-[#111B27]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {t.testName}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 shrink-0">
                        {t.category === 'blood' ? 'Blood' : 'Vital'}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-baseline justify-between gap-1">
                      <span className="text-sm sm:text-base font-bold tabular-nums-mono text-slate-900 dark:text-slate-100">
                        {latestSim
                          ? `${formatMeasurementValue(latestSim)} ${t.unit}`
                          : `— ${t.unit}`}
                      </span>
                      {latestSim && (
                        <span
                          className={`text-[10px] sm:text-[11px] font-semibold ${
                            getStatusDisplay(latestSim.status).textClass
                          }`}
                        >
                          {getStatusDisplay(latestSim.status).glyph}{' '}
                          {getStatusDisplay(latestSim.status).label}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </HemaCard>

          {/* Session Output */}
          {sessionSaved.length > 0 && (
            <HemaCard className="p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                    Simulated Session Results ({sessionSaved.length} stored in PostgreSQL)
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    All records below are persisted with SIMULATED TEST DATA attribution.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onNavigate('history')}
                    className="min-h-[42px] px-3.5 py-2 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#162232] flex items-center justify-center gap-1.5 whitespace-nowrap"
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>Open Health History</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      void handleGenerateSessionReport(
                        sessionSaved,
                        selectedPatient,
                      )
                    }
                    className="min-h-[42px] px-3.5 py-2 rounded-lg hn-btn-primary text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Generate Session Report</span>
                  </button>

                  {lastGeneratedReport && (
                    <button
                      type="button"
                      onClick={() =>
                        void handleDownloadPdf(
                          lastGeneratedReport.report,
                          lastGeneratedReport.measurements,
                        )
                      }
                      className="min-h-[42px] px-3.5 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium flex items-center justify-center gap-1.5 whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>
                        Download PDF ({lastGeneratedReport.report.reportCode})
                      </span>
                    </button>
                  )}
                </div>
              </div>

              <div className="md:hidden divide-y divide-[#D5E0EC] dark:divide-[#1E2E42] border border-[#D5E0EC] dark:border-[#1E2E42] rounded-lg overflow-hidden">
                {sessionSaved.map((m) => (
                  <div
                    key={m.id}
                    className="p-3.5 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {m.testName}
                      </div>
                      <div className="text-[11px] font-mono text-amber-700 dark:text-amber-300 mt-0.5">
                        SIMULATED · {formatDateTime(m.measuredAt)}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono font-bold text-slate-900 dark:text-slate-100">
                        {formatMeasurementValue(m)} {m.unit}
                      </div>
                      <div
                        className={`text-[11px] font-semibold ${
                          getStatusDisplay(m.status).textClass
                        }`}
                      >
                        {getStatusDisplay(m.status).glyph}{' '}
                        {getStatusDisplay(m.status).label}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden md:block overflow-x-auto border border-[#D5E0EC] dark:border-[#1E2E42] rounded-lg">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#EEF3F8] dark:bg-[#0D1622] text-slate-600 dark:text-slate-400 border-b border-[#D5E0EC] dark:border-[#1E2E42] uppercase text-[11px] tracking-wider">
                      <th className="py-2.5 px-3 font-semibold">Parameter</th>
                      <th className="py-2.5 px-3 font-semibold text-right">
                        Value
                      </th>
                      <th className="py-2.5 px-3 font-semibold">Status</th>
                      <th className="py-2.5 px-3 font-semibold">Source Tag</th>
                      <th className="py-2.5 px-3 font-semibold text-right">
                        Timestamp
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#D5E0EC] dark:divide-[#1E2E42]">
                    {sessionSaved.map((m) => (
                      <tr key={m.id}>
                        <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-slate-100">
                          {m.testName}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900 dark:text-slate-100">
                          {formatMeasurementValue(m)} {m.unit}
                        </td>
                        <td
                          className={`py-2.5 px-3 font-semibold ${
                            getStatusDisplay(m.status).textClass
                          }`}
                        >
                          {getStatusDisplay(m.status).glyph}{' '}
                          {getStatusDisplay(m.status).label}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-amber-700 dark:text-amber-300">
                          SIMULATED
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-500 dark:text-slate-400">
                          {formatDateTime(m.measuredAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </HemaCard>
          )}
        </div>
      ) : (
        /* TAB 2: HOSPITAL STAFF TESTING CONSOLE */
        <div className="space-y-6">
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <HemaCard className="p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Today&apos;s Tests
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums-mono text-slate-900 dark:text-slate-100">
                {todayTestsCount}
              </div>
            </HemaCard>
            <HemaCard className="p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Registered Test Patients
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums-mono text-slate-900 dark:text-slate-100">
                {patients.length}
              </div>
            </HemaCard>
            <HemaCard className="p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Simulated Records
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums-mono text-amber-700 dark:text-amber-300">
                {simulatedTotalCount}
              </div>
            </HemaCard>
            <HemaCard className="p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Out-of-Range Flags
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums-mono text-rose-700 dark:text-rose-400">
                {abnormalCount}
              </div>
            </HemaCard>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <HemaCard className="lg:col-span-5 p-5">
              <form onSubmit={handleRegisterPatient} className="space-y-4">
                <div className="flex items-center gap-2.5">
                  <UserPlus className="w-5 h-5 text-[#005EB8] dark:text-sky-400" />
                  <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                    Register Test Patient (UHID)
                  </h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Patient Full Name
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={120}
                      value={patientName}
                      onChange={(e) => setPatientName(e.target.value)}
                      placeholder="e.g. Aarav Sharma"
                      className="w-full h-10 px-3 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0D1622] text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-[#005EB8] dark:focus:border-sky-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      UHID (auto if blank)
                    </label>
                    <input
                      type="text"
                      maxLength={40}
                      value={patientUhid}
                      onChange={(e) => setPatientUhid(e.target.value)}
                      placeholder="UHID-2026-1001"
                      className="w-full h-10 px-3 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0D1622] text-sm font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-[#005EB8] dark:focus:border-sky-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Sex
                    </label>
                    <select
                      value={patientSex}
                      onChange={(e) => setPatientSex(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0D1622] text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#005EB8] dark:focus:border-sky-400"
                    >
                      <option value="Female">Female</option>
                      <option value="Male">Male</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Date of Birth
                    </label>
                    <input
                      type="date"
                      value={patientDob}
                      onChange={(e) => setPatientDob(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0D1622] text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#005EB8] dark:focus:border-sky-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Phone
                    </label>
                    <input
                      type="tel"
                      maxLength={40}
                      value={patientPhone}
                      onChange={(e) => setPatientPhone(e.target.value)}
                      placeholder="+91 98000 00000"
                      className="w-full h-10 px-3 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0D1622] text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-[#005EB8] dark:focus:border-sky-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Email (optional)
                    </label>
                    <input
                      type="email"
                      maxLength={140}
                      value={patientEmail}
                      onChange={(e) => setPatientEmail(e.target.value)}
                      placeholder="patient@example.com"
                      className="w-full h-10 px-3 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0D1622] text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-[#005EB8] dark:focus:border-sky-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Address (optional)
                    </label>
                    <input
                      type="text"
                      maxLength={240}
                      value={patientAddress}
                      onChange={(e) => setPatientAddress(e.target.value)}
                      placeholder="Ward / City"
                      className="w-full h-10 px-3 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0D1622] text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-[#005EB8] dark:focus:border-sky-400"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Clinical Notes
                    </label>
                    <input
                      type="text"
                      maxLength={250}
                      value={patientNotes}
                      onChange={(e) => setPatientNotes(e.target.value)}
                      placeholder="OPD screening ward / test cohort"
                      className="w-full h-10 px-3 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0D1622] text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-[#005EB8] dark:focus:border-sky-400"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={registeringPatient}
                  className="w-full min-h-[42px] px-4 py-2 rounded-lg hn-btn-primary text-sm font-semibold disabled:opacity-50 whitespace-nowrap"
                >
                  {registeringPatient ? 'Registering...' : 'Register Patient'}
                </button>
              </form>
            </HemaCard>

            <HemaCard className="lg:col-span-7 p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#005EB8] dark:text-sky-400" />
                  <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                    Daily Testing Analytics
                  </h2>
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Last 7 active days
                </span>
              </div>

              {dailyAnalytics.length === 0 ? (
                <div className="flex-1 flex items-center justify-center py-12 text-xs text-slate-500 dark:text-slate-400">
                  No recorded tests yet. Run a simulated test session to populate daily analytics.
                </div>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyAnalytics}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#94A3B8"
                        opacity={0.22}
                      />
                      <XAxis
                        dataKey="day"
                        tick={{ fontSize: 11, fill: '#64748B' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 11, fill: '#64748B' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip content={<AnalyticsTooltip />} />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                      <Bar
                        dataKey="simulated"
                        name="Simulated Tests"
                        fill="#D97706"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="standard"
                        name="BLE / Manual"
                        fill="#005EB8"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </HemaCard>
          </div>

          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <HemaCard className="lg:col-span-5 overflow-hidden">
              <div className="px-5 py-4 border-b border-[#D5E0EC] dark:border-[#1E2E42] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#005EB8] dark:text-sky-400" />
                  <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                    Registered Test Patients
                  </h2>
                </div>
                <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                  {patients.length}
                </span>
              </div>

              {patients.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                  Register a test patient using the form above to assign UHIDs and consolidate simulated lab reports.
                </div>
              ) : (
                <div className="divide-y divide-[#D5E0EC] dark:divide-[#1E2E42]">
                  {patients.map((p) => {
                    const active = inspectedPatient?.id === p.id;
                    const count = measurements.filter(
                      (m) => m.patientRecordId === p.id,
                    ).length;
                    return (
                      <div
                        key={p.id}
                        className={`px-4 py-3 flex items-center justify-between gap-3 transition-colors ${
                          active
                            ? 'bg-sky-50/80 dark:bg-sky-950/30'
                            : 'hover:bg-[#F8FAFC] dark:hover:bg-[#162232]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setInspectedPatientId(p.id);
                            setSelectedPatientId(String(p.id));
                          }}
                          className="text-left flex-1 min-w-0"
                        >
                          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {p.fullName}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                            {p.uhid} · {count} tests
                          </div>
                        </button>
                        {confirmRemovePatientId === p.id ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={async () => {
                                setErrorBanner(null);
                                try {
                                  await removePatient(p.id);
                                  setConfirmRemovePatientId(null);
                                  if (inspectedPatientId === p.id) {
                                    setInspectedPatientId(null);
                                  }
                                  if (selectedPatientId === String(p.id)) {
                                    setSelectedPatientId('self');
                                  }
                                  setStatusBanner(`Removed patient ${p.fullName}.`);
                                } catch (err) {
                                  setErrorBanner(
                                    err instanceof Error
                                      ? err.message
                                      : 'Unable to remove patient.',
                                  );
                                }
                              }}
                              className="px-2 py-1 rounded bg-rose-600 text-white text-[11px] font-medium"
                            >
                              Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmRemovePatientId(null)}
                              className="px-2 py-1 rounded border border-[#D5E0EC] dark:border-[#24364D] text-[11px] text-slate-700 dark:text-slate-300"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmRemovePatientId(p.id)}
                            aria-label={`Remove ${p.fullName}`}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </HemaCard>

            <HemaCard className="lg:col-span-7 p-5 space-y-4">
              {!inspectedPatient ? (
                <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
                  Select a registered patient on the left to inspect test history, run simulated panels, or export a consolidated PDF report.
                </div>
              ) : (
                <>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#D5E0EC] dark:border-[#1E2E42]">
                    <div>
                      <div className="text-base font-display font-bold text-slate-900 dark:text-slate-100">
                        {inspectedPatient.fullName}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                        {inspectedPatient.uhid} · {inspectedPatient.sex || '—'}{' '}
                        {inspectedPatient.dateOfBirth
                          ? `· DOB ${inspectedPatient.dateOfBirth}`
                          : ''}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPatientId(String(inspectedPatient.id));
                          setTab('workflow');
                        }}
                        className="px-3 py-1.5 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#162232] whitespace-nowrap"
                      >
                        Run Simulated Tests
                      </button>

                      <button
                        type="button"
                        disabled={inspectedPatientMeasurements.length === 0}
                        onClick={async () => {
                          setErrorBanner(null);
                          try {
                            const created = await generateReport({
                              title: `Consolidated Diagnostic Report — ${inspectedPatient.fullName}`,
                              measurementIds: inspectedPatientMeasurements.map(
                                (m) => m.id,
                              ),
                              patientRecordId: inspectedPatient.id,
                              summaryNotes: `UHID ${inspectedPatient.uhid} consolidated panel.`,
                            });
                            await handleDownloadPdf(
                              created.report,
                              created.measurements,
                            );
                            setStatusBanner(
                              `Downloaded consolidated PDF report ${created.report.reportCode} for ${inspectedPatient.uhid}.`,
                            );
                          } catch (err) {
                            setErrorBanner(
                              err instanceof Error
                                ? err.message
                                : 'Failed to generate consolidated PDF report.',
                            );
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg hn-btn-primary text-xs font-semibold flex items-center gap-1.5 disabled:opacity-45 whitespace-nowrap"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Consolidated PDF</span>
                      </button>
                    </div>
                  </div>

                  {inspectedPatientMeasurements.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                      No tests recorded for {inspectedPatient.uhid} yet. Switch to Device Simulator with this patient selected to run tests.
                    </div>
                  ) : (
                    <div className="max-h-72 overflow-y-auto divide-y divide-[#D5E0EC] dark:divide-[#1E2E42] border border-[#D5E0EC] dark:border-[#1E2E42] rounded-lg">
                      {inspectedPatientMeasurements.map((m) => (
                        <div
                          key={m.id}
                          className="px-3.5 py-2.5 flex items-center justify-between text-xs"
                        >
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-slate-100">
                              {m.testName}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                              {formatDateTime(m.measuredAt)} ·{' '}
                              {m.isSimulated ? 'SIMULATED' : m.dataSource}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-mono font-bold text-slate-900 dark:text-slate-100">
                              {formatMeasurementValue(m)} {m.unit}
                            </div>
                            <div
                              className={`text-[11px] font-semibold ${
                                getStatusDisplay(m.status).textClass
                              }`}
                            >
                              {getStatusDisplay(m.status).label}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </HemaCard>
          </section>

          <HemaCard className="overflow-hidden">
            <div className="px-5 py-4 border-b border-[#D5E0EC] dark:border-[#1E2E42] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#005EB8] dark:text-sky-400" />
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  Diagnostic Test Sessions
                </h2>
              </div>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                {hospitals[0]
                  ? `${hospitals[0].name} (${hospitals[0].hospitalCode}) · `
                  : ''}
                {testSessions.length} sessions
              </span>
            </div>

            {testSessions.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                Run a single or 13-parameter simulated test session to track full diagnostic session lifecycles.
              </div>
            ) : (
              <div className="max-h-60 overflow-y-auto divide-y divide-[#D5E0EC] dark:divide-[#1E2E42] text-xs">
                {testSessions.slice(0, 20).map((s) => (
                  <div
                    key={s.id}
                    className="px-5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {s.sessionCode}
                      </span>
                      <span className="font-mono uppercase text-[11px] text-slate-500 dark:text-slate-400">
                        {s.testMode}
                      </span>
                      <span className="font-mono text-[11px] text-slate-600 dark:text-slate-300">
                        · {s.sessionStatus} ({s.completionStatus})
                      </span>
                    </div>
                    <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {formatDateTime(s.startedAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </HemaCard>

          <HemaCard className="overflow-hidden">
            <div className="px-5 py-4 border-b border-[#D5E0EC] dark:border-[#1E2E42] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-[#005EB8] dark:text-sky-400" />
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  System Audit Trail
                </h2>
              </div>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                Latest {auditLogs.length} events
              </span>
            </div>

            {auditLogs.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                Audit events for simulated runs, fault tests, patient registration, and report generation appear here.
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto divide-y divide-[#D5E0EC] dark:divide-[#1E2E42] text-xs">
                {auditLogs.slice(0, 25).map((log) => (
                  <div
                    key={log.id}
                    className="px-5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {log.action}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-500 dark:text-slate-400">
                        {log.entityType}
                        {log.entityId ? ` #${log.entityId}` : ''}
                      </span>
                    </div>
                    <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {formatDateTime(log.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </HemaCard>
        </div>
      )}
    </div>
  );
}
