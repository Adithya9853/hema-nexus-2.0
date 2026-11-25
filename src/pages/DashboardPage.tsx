import { useMemo, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  Bell,
  Bluetooth,
  BluetoothConnected,
  Calendar,
  Clock,
  Cpu,
  FlaskConical,
  History,
  Plus,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  BottomSheetModal,
  HemaCard,
  SectionHeader,
  SkeletonBlock,
  StatusBanner,
} from '../components/ui/HemaPrimitives.tsx';
import { BRAND_ASSETS } from '../config/assets.ts';
import { useAuth } from '../contexts/AuthContext.tsx';
import { useBle } from '../contexts/BleContext.tsx';
import { useHemaData } from '../contexts/HemaDataContext.tsx';
import { useSimulatedDevice } from '../contexts/SimulatedDeviceContext.tsx';
import type {
  MeasurementRecord,
  NavSection,
  TestTypeRecord,
} from '../types/hema.ts';
import { formatReferenceRange } from '../utils/clinicalValidation.ts';
import {
  formatDataSource,
  formatDateTime,
  formatMeasurementValue,
  formatShortDate,
  getStatusDisplay,
} from '../utils/formatters.ts';

interface DashboardPageProps {
  onNavigate: (section: NavSection) => void;
  onStartTest: (slug: string, mode?: 'ble' | 'manual') => void;
}

const VITAL_SLUGS = ['blood_pressure', 'spo2', 'heart_rate', 'temperature'];

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function PreviewChartTooltip({
  active,
  payload,
  unit,
}: {
  active?: boolean;
  payload?: { value?: number; payload?: { date?: string } }[];
  unit: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0];
  return (
    <div className="rounded-lg bg-white dark:bg-[#0D1622] border border-[#D5E0EC] dark:border-[#1E2E42] px-3 py-2 text-xs shadow-lg">
      <div className="text-slate-500 dark:text-slate-400">
        {item.payload?.date}
      </div>
      <div className="mt-0.5 tabular-nums-mono font-bold text-slate-900 dark:text-slate-100">
        {item.value} {unit}
      </div>
    </div>
  );
}

export function DashboardPage({
  onNavigate,
  onStartTest,
}: DashboardPageProps) {
  const { profile } = useAuth();
  const {
    state: bleState,
    deviceInfo,
    support,
    scanAndConnect,
    disconnect,
    reconnect,
  } = useBle();
  const { state: simState, deviceInfo: simDeviceInfo } = useSimulatedDevice();
  const {
    testCatalog,
    devices,
    measurements,
    notifications,
    loading,
    error,
    refreshAll,
    registerDevice,
    updateDeviceStatus,
    markNotificationRead,
  } = useHemaData();

  const [deviceBusy, setDeviceBusy] = useState(false);
  const [deviceNotice, setDeviceNotice] = useState<string | null>(null);
  const [deviceError, setDeviceError] = useState<string | null>(null);

  const [selectedDetail, setSelectedDetail] = useState<{
    test: TestTypeRecord;
    latest: MeasurementRecord | null;
    history: MeasurementRecord[];
  } | null>(null);

  const firstName = useMemo(() => {
    if (!profile?.fullName) return null;
    const parts = profile.fullName.trim().split(/\s+/);
    return parts[0] || null;
  }, [profile?.fullName]);

  const latestByType = useMemo(() => {
    const map = new Map<string, MeasurementRecord[]>();
    for (const m of measurements) {
      const list = map.get(m.testType) || [];
      list.push(m);
      map.set(m.testType, list);
    }
    return map;
  }, [measurements]);

  const latestOverall = measurements[0] || null;
  const primaryPairedDevice = devices[0] || null;
  const unreadNotifications = notifications.filter((n) => !n.isRead);

  const chartSeries = useMemo(() => {
    if (measurements.length === 0) {
      return {
        title: '',
        unit: '',
        data: [] as { date: string; value: number }[],
      };
    }
    const preferredSlug =
      measurements.find((m) => m.testType === 'glucose')?.testType ||
      measurements[0].testType;
    const rows = (latestByType.get(preferredSlug) || [])
      .slice(0, 12)
      .reverse();
    const meta = testCatalog.find((t) => t.slug === preferredSlug);
    return {
      title: meta?.testName || measurements[0].testName,
      unit: meta?.unit || measurements[0].unit,
      data: rows.map((r) => ({
        date: formatShortDate(r.measuredAt),
        value: r.measuredValue,
      })),
    };
  }, [measurements, latestByType, testCatalog]);

  const vitalsCatalog = testCatalog.filter((t) => VITAL_SLUGS.includes(t.slug));
  const bloodAndOtherCatalog = testCatalog.filter(
    (t) => !VITAL_SLUGS.includes(t.slug),
  );

  const handleQuickConnect = async () => {
    setDeviceBusy(true);
    setDeviceError(null);
    setDeviceNotice(null);
    try {
      const info = await scanAndConnect();
      await registerDevice({
        deviceName: info.name,
        deviceIdentifier: info.id,
        firmwareVersion: info.firmwareVersion,
        hardwareRevision: info.hardwareRevision,
      });
      setDeviceNotice(`Connected to ${info.name}.`);
    } catch (err) {
      setDeviceError(
        err instanceof Error ? err.message : 'Unable to connect via Bluetooth.',
      );
    } finally {
      setDeviceBusy(false);
    }
  };

  const handleQuickReconnect = async () => {
    setDeviceBusy(true);
    setDeviceError(null);
    setDeviceNotice(null);
    try {
      const info = await reconnect();
      const match = devices.find((d) => d.deviceIdentifier === info.id);
      if (match) {
        await updateDeviceStatus(match.id, { status: 'connected' });
      }
      setDeviceNotice(`Reconnected to ${info.name}.`);
    } catch (err) {
      setDeviceError(
        err instanceof Error ? err.message : 'Unable to reconnect to device.',
      );
    } finally {
      setDeviceBusy(false);
    }
  };

  const handleQuickDisconnect = async () => {
    disconnect();
    const activeDb = devices.find((d) => d.status === 'connected');
    if (activeDb) {
      await updateDeviceStatus(activeDb.id, { status: 'disconnected' });
    }
    setDeviceNotice('Bluetooth device disconnected.');
  };

  if (loading && testCatalog.length === 0) {
    return (
      <div className="space-y-5">
        <SkeletonBlock className="h-16" />
        <SkeletonBlock className="h-56" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <SkeletonBlock key={i} className="h-32 sm:h-36" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-7">
      {/* Clinical Overview Header */}
      <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-medium text-[#005EB8] dark:text-sky-300">
              {getTimeGreeting()}
              {firstName ? `, ${firstName}` : ''}
            </div>
            <h1 className="mt-0.5 font-display text-2xl sm:text-3xl font-bold tracking-tight text-balance">
              Clinical Overview
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
              Patient diagnostic records, vital signs telemetry, and device monitoring.
            </p>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('profile')}
            aria-label="Open patient profile"
            className="sm:hidden h-11 w-11 rounded-lg border border-[#D5E0EC] dark:border-[#1E2E42] bg-white dark:bg-[#111B27] flex items-center justify-center shrink-0 overflow-hidden"
          >
            {profile?.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt={profile.fullName || 'Profile'}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="font-display font-bold text-sm text-[#005EB8] dark:text-sky-300">
                {(firstName || profile?.email || 'H').slice(0, 1).toUpperCase()}
              </span>
            )}
          </button>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => onNavigate('simulator')}
            className="min-h-[44px] px-3.5 sm:px-4 py-2 rounded-lg border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100/80 dark:hover:bg-amber-950/50 text-amber-950 dark:text-amber-200 text-xs sm:text-sm font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
          >
            <Cpu className="w-4 h-4 text-amber-700 dark:text-amber-300 shrink-0" />
            <span>Simulated Mode</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('tests')}
            className="min-h-[44px] px-4 py-2 rounded-lg hn-btn-primary text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap active:scale-[0.99]"
          >
            <FlaskConical className="w-4 h-4 shrink-0" />
            <span>Start a Test</span>
          </button>
        </div>
      </section>

      {error && (
        <StatusBanner
          variant="error"
          message={error}
          action={
            <button
              type="button"
              onClick={() => void refreshAll()}
              className="px-2.5 py-1 rounded bg-white/80 dark:bg-white/10 text-xs font-semibold"
            >
              Retry
            </button>
          }
        />
      )}

      {deviceError && (
        <StatusBanner
          variant="error"
          message={deviceError}
          onDismiss={() => setDeviceError(null)}
        />
      )}

      {deviceNotice && (
        <StatusBanner
          variant="success"
          message={deviceNotice}
          onDismiss={() => setDeviceNotice(null)}
        />
      )}

      {/* Primary Clinical Hero: Instrument Link + Patient Summary */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-stretch">
        <HemaCard
          variant="clinical"
          className="lg:col-span-5 p-4 sm:p-5 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-mono font-medium uppercase tracking-wider text-sky-300">
                  Diagnostic Instrument Link
                </div>
                <div className="mt-1 text-base sm:text-lg font-display font-semibold text-white truncate">
                  {bleState === 'connected' && deviceInfo
                    ? deviceInfo.name
                    : simState === 'connected' && simDeviceInfo
                      ? simDeviceInfo.name
                      : primaryPairedDevice
                        ? primaryPairedDevice.deviceName
                        : 'Hema Nexus Unit'}
                </div>
                <div className="mt-1 text-xs text-slate-300 flex flex-wrap items-center gap-2">
                  <span>
                    {deviceBusy || bleState === 'connecting'
                      ? '◌ Scanning & Pairing...'
                      : bleState === 'connected'
                        ? '● Connected · BLE Active'
                        : simState === 'connected'
                          ? '● SIMULATION Active (No BLE)'
                          : bleState === 'unsupported'
                            ? 'Browser BLE Unavailable'
                            : primaryPairedDevice
                              ? '○ Paired · Disconnected'
                              : '○ Disconnected'}
                  </span>
                  {primaryPairedDevice?.lastConnectedAt && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums-mono text-slate-400">
                        {formatShortDate(primaryPairedDevice.lastConnectedAt)}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  onNavigate(simState === 'connected' ? 'simulator' : 'device')
                }
                className="min-h-[36px] px-2 text-xs font-medium text-sky-300 hover:underline whitespace-nowrap shrink-0 flex items-center gap-1"
              >
                <span>{simState === 'connected' ? 'Simulator' : 'Manage'}</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="mt-3.5 rounded-lg bg-[#081829] border border-[#1E3F66] p-3 relative overflow-hidden">
              <img
                src={BRAND_ASSETS.productPhoto}
                alt="Hema Nexus Physical Unit"
                referrerPolicy="no-referrer"
                className={`w-full h-32 sm:h-40 object-contain mx-auto transition-opacity duration-300 ${
                  deviceBusy ? 'opacity-70' : 'opacity-100'
                }`}
              />
              {deviceBusy && (
                <div className="mt-1 text-center text-[11px] font-mono text-sky-300">
                  Searching for ESP32 BLE service...
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {bleState !== 'connected' ? (
                <button
                  type="button"
                  disabled={deviceBusy || !support.supported}
                  onClick={() => void handleQuickConnect()}
                  className="min-h-[42px] px-3 py-2 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-45 transition-colors"
                >
                  <Bluetooth className="w-3.5 h-3.5 shrink-0" />
                  <span>{deviceBusy ? 'Scanning...' : 'Connect BLE'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleQuickDisconnect()}
                  className="min-h-[42px] px-3 py-2 rounded-lg border border-rose-400/50 bg-rose-950/50 text-rose-100 text-xs font-semibold flex items-center justify-center gap-1.5"
                >
                  <BluetoothConnected className="w-3.5 h-3.5 shrink-0" />
                  <span>Disconnect</span>
                </button>
              )}

              {bleState === 'disconnected' && deviceInfo ? (
                <button
                  type="button"
                  disabled={deviceBusy}
                  onClick={() => void handleQuickReconnect()}
                  className="min-h-[42px] px-3 py-2 rounded-lg border border-white/20 bg-white/10 hover:bg-white/15 text-xs font-medium text-white flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                  <span>Reconnect</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onNavigate('simulator')}
                  className="min-h-[42px] px-3 py-2 rounded-lg border border-amber-400/40 bg-amber-950/35 hover:bg-amber-950/55 text-xs font-medium text-amber-200 flex items-center justify-center gap-1.5"
                >
                  <Cpu className="w-3.5 h-3.5 shrink-0" />
                  <span>Sim Mode</span>
                </button>
              )}
            </div>
          </div>
        </HemaCard>

        <HemaCard className="lg:col-span-7 p-4 sm:p-6 flex flex-col justify-between">
          {measurements.length === 0 ? (
            <div className="flex-1 flex flex-col justify-center py-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#005EB8] dark:text-sky-300">
                Patient Record Baseline
              </div>
              <h2 className="mt-1 font-display text-xl sm:text-2xl font-bold tracking-tight">
                No diagnostic readings recorded yet.
              </h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 max-w-lg leading-relaxed">
                Pair your physical Hema Nexus unit, enter Simulated Device Mode for hardware-free testing, or log a validated laboratory reading.
              </p>
              <div className="mt-5 grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => onNavigate('device')}
                  className="min-h-[44px] px-4 py-2 rounded-lg hn-btn-primary text-sm font-semibold flex items-center justify-center gap-2"
                >
                  <Bluetooth className="w-4 h-4" />
                  <span>Connect Device</span>
                </button>
                <button
                  type="button"
                  onClick={() => onStartTest('glucose', 'manual')}
                  className="min-h-[44px] px-4 py-2 rounded-lg border border-[#CBD5E1] dark:border-[#24364D] hover:bg-slate-50 dark:hover:bg-white/[0.04] text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Log Lab Measurement</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col justify-between h-full gap-4 sm:gap-5">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-[#E2E8F0] dark:border-[#1E2E42] pb-4">
                <div>
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Latest Clinical Measurement
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-baseline gap-2.5">
                    <span className="font-display text-3xl sm:text-4xl font-bold tabular-nums-mono tracking-tight">
                      {formatMeasurementValue(latestOverall!)}
                    </span>
                    <span className="text-sm font-mono text-slate-500 dark:text-slate-400">
                      {latestOverall!.unit}
                    </span>
                    <span
                      className={`text-xs font-semibold ${
                        getStatusDisplay(latestOverall!.status).textClass
                      }`}
                    >
                      {getStatusDisplay(latestOverall!.status).glyph}{' '}
                      {getStatusDisplay(latestOverall!.status).label}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {latestOverall!.testName}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums-mono">
                      {formatDateTime(latestOverall!.measuredAt)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={
                        latestOverall!.isSimulated ||
                        latestOverall!.dataSource === 'simulated_device'
                          ? 'font-mono font-semibold text-amber-700 dark:text-amber-300'
                          : ''
                      }
                    >
                      {formatDataSource(latestOverall!.dataSource)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:flex items-center gap-4 sm:gap-6 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#E2E8F0] dark:border-[#1E2E42]">
                  <div>
                    <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                      Total Records
                    </div>
                    <div className="mt-0.5 text-lg font-semibold tabular-nums-mono">
                      {measurements.length}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                      Unread Alerts
                    </div>
                    <div className="mt-0.5 text-lg font-semibold tabular-nums-mono text-[#005EB8] dark:text-sky-300">
                      {unreadNotifications.length}
                    </div>
                  </div>
                </div>
              </div>

              {chartSeries.data.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate pr-2">
                      Recent Telemetry · {chartSeries.title} ({chartSeries.unit})
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigate('trends')}
                      className="min-h-[34px] px-2 text-xs font-medium text-[#005EB8] dark:text-sky-300 hover:underline shrink-0"
                    >
                      View Trends
                    </button>
                  </div>
                  <div className="h-36 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={chartSeries.data}
                        margin={{ top: 6, right: 8, left: -20, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient
                            id="hemaMedicalBlueGrad"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor="#005EB8"
                              stopOpacity={0.22}
                            />
                            <stop
                              offset="95%"
                              stopColor="#005EB8"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke="#94A3B8"
                          opacity={0.25}
                        />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 10, fill: '#64748B' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: '#64748B' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          content={<PreviewChartTooltip unit={chartSeries.unit} />}
                        />
                        <Area
                          type="monotone"
                          dataKey="value"
                          stroke="#005EB8"
                          strokeWidth={2}
                          fill="url(#hemaMedicalBlueGrad)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          )}
        </HemaCard>
      </section>

      {/* Clinical Alerts Strip */}
      {unreadNotifications.length > 0 && (
        <section aria-label="Active Clinical Alerts" className="space-y-2">
          {unreadNotifications.slice(0, 2).map((alert) => (
            <div
              key={alert.id}
              className="rounded-xl bg-sky-50/80 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-500/35 px-4 py-3 flex items-center justify-between gap-3"
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <Bell className="w-4 h-4 text-[#005EB8] dark:text-sky-300 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {alert.title}
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-300 truncate">
                    {alert.message}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void markNotificationRead(alert.id)}
                className="min-h-[34px] px-2.5 rounded-lg text-[11px] font-medium text-[#005EB8] dark:text-sky-300 hover:bg-black/5 dark:hover:bg-white/5 shrink-0"
              >
                Dismiss
              </button>
            </div>
          ))}
        </section>
      )}

      {/* Quick Actions Grid */}
      <section>
        <SectionHeader
          title="Clinical Shortcuts"
          subtitle="Direct access to testing bays, hardware pairing, trends, and PDF exports"
          className="mb-3"
        />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
          {[
            {
              label: 'Start a Test',
              sub: '9 ports + vitals',
              icon: FlaskConical,
              onClick: () => onNavigate('tests'),
              accent: 'text-[#005EB8] dark:text-sky-300',
            },
            {
              label: 'Connect Device',
              sub: bleState === 'connected' ? 'BLE Active' : 'ESP32 GATT',
              icon: Bluetooth,
              onClick: () => onNavigate('device'),
              accent: 'text-[#005EB8] dark:text-sky-300',
            },
            {
              label: 'Simulated Mode',
              sub: 'No hardware',
              icon: Cpu,
              onClick: () => onNavigate('simulator'),
              accent: 'text-amber-700 dark:text-amber-300',
            },
            {
              label: 'View History',
              sub: `${measurements.length} records`,
              icon: History,
              onClick: () => onNavigate('history'),
              accent: 'text-slate-600 dark:text-slate-300',
            },
            {
              label: 'Health Trends',
              sub: 'Biomarker charts',
              icon: TrendingUp,
              onClick: () => onNavigate('trends'),
              accent: 'text-teal-700 dark:text-teal-400',
            },
            {
              label: 'Clinical Reports',
              sub: 'Download PDF',
              icon: Calendar,
              onClick: () => onNavigate('reports'),
              accent: 'text-[#005EB8] dark:text-sky-300',
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                onClick={item.onClick}
                className="min-h-[76px] p-3.5 rounded-xl bg-white dark:bg-[#111B27] border border-[#D5E0EC] dark:border-[#1E2E42] hover:border-[#005EB8]/60 dark:hover:border-sky-400/50 text-left flex flex-col justify-between transition-colors active:scale-[0.99]"
              >
                <Icon className={`w-4 h-4 ${item.accent}`} />
                <div className="mt-2">
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {item.label}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {item.sub}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Physiological Monitoring Strip */}
      <section>
        <SectionHeader
          title="Physiological Monitoring"
          action={
            <button
              type="button"
              onClick={() => onNavigate('trends')}
              className="min-h-[36px] px-2 text-xs font-medium text-[#005EB8] dark:text-sky-300 hover:underline"
            >
              Compare Vitals
            </button>
          }
          className="mb-3"
        />

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          {vitalsCatalog.map((test) => {
            const list = latestByType.get(test.slug) || [];
            const latest = list[0] || null;
            const prev = list[1] || null;
            const status = latest ? getStatusDisplay(latest.status) : null;

            return (
              <HemaCard
                key={test.slug}
                className="p-3.5 sm:p-4 flex flex-col justify-between hover:border-[#005EB8]/50 dark:hover:border-sky-400/40"
              >
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2">
                    <span className="text-xs sm:text-sm font-semibold truncate">
                      {test.testName}
                    </span>
                    {status ? (
                      <span
                        className={`text-[11px] sm:text-xs font-semibold ${status.textClass}`}
                      >
                        {status.glyph} {status.label}
                      </span>
                    ) : (
                      <span className="text-[11px] sm:text-xs text-slate-400 dark:text-slate-500">
                        No reading
                      </span>
                    )}
                  </div>

                  <div className="mt-2 sm:mt-3 flex items-baseline gap-1">
                    <span className="text-xl sm:text-2xl font-bold tabular-nums-mono">
                      {latest ? formatMeasurementValue(latest) : '—'}
                    </span>
                    <span className="text-[11px] sm:text-xs font-mono text-slate-500 dark:text-slate-400">
                      {test.unit}
                    </span>
                  </div>

                  <div className="mt-1.5 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 tabular-nums-mono truncate">
                    {latest ? (
                      <>
                        {formatShortDate(latest.measuredAt)}
                        {prev && (
                          <span className="hidden sm:inline ml-2 text-slate-400 dark:text-slate-500">
                            · Prev {formatMeasurementValue(prev)}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="truncate block">
                        {test.sensingMethod}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-[#E2E8F0] dark:border-[#1E2E42] flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedDetail({ test, latest, history: list })
                    }
                    className="min-h-[36px] px-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                  >
                    Details
                  </button>
                  <button
                    type="button"
                    onClick={() => onStartTest(test.slug)}
                    className="min-h-[36px] px-2 text-xs font-semibold text-[#005EB8] dark:text-sky-300 hover:underline"
                  >
                    Measure
                  </button>
                </div>
              </HemaCard>
            );
          })}
        </div>
      </section>

      {/* Blood Parameters & Recent Activity */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
        <HemaCard className="lg:col-span-8 overflow-hidden">
          <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-[#D5E0EC] dark:border-[#1E2E42] flex items-center justify-between gap-3 bg-[#F8FAFC] dark:bg-[#0D1622]">
            <div className="min-w-0">
              <h2 className="font-display text-sm sm:text-base font-semibold">
                Blood Biomarkers &amp; Assay Channels
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                Port assignments correspond to the physical 9-bay diagnostic deck.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('tests')}
              className="min-h-[36px] px-2 text-xs font-medium text-[#005EB8] dark:text-sky-300 hover:underline whitespace-nowrap shrink-0"
            >
              View All
            </button>
          </div>

          <div className="divide-y divide-[#E2E8F0] dark:divide-[#1E2E42]">
            {bloodAndOtherCatalog.map((test) => {
              const list = latestByType.get(test.slug) || [];
              const latest = list[0] || null;
              const status = latest ? getStatusDisplay(latest.status) : null;

              return (
                <div
                  key={test.slug}
                  className="px-4 sm:px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <span>{test.testName}</span>
                      {test.portNumber && (
                        <span className="text-xs font-mono font-normal text-slate-500 dark:text-slate-400">
                          · Port {test.portNumber}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5">
                      <span>
                        {test.availabilityStatus === 'coming_soon'
                          ? 'Firmware Validation Pending'
                          : bleState === 'connected'
                            ? 'BLE Ready'
                            : 'BLE or Manual Entry'}
                      </span>
                      {latest && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums-mono">
                            {formatShortDate(latest.measuredAt)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                    <div className="sm:text-right">
                      <div className="text-sm font-semibold tabular-nums-mono">
                        {latest
                          ? `${formatMeasurementValue(latest)} ${test.unit}`
                          : `— ${test.unit}`}
                      </div>
                      {status && (
                        <div
                          className={`text-[11px] font-semibold ${status.textClass}`}
                        >
                          {status.glyph} {status.label}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedDetail({ test, latest, history: list })
                        }
                        className="min-h-[38px] px-2.5 rounded-lg border border-[#CBD5E1] dark:border-[#24364D] text-xs font-medium text-slate-600 dark:text-slate-300"
                      >
                        Details
                      </button>
                      <button
                        type="button"
                        onClick={() => onStartTest(test.slug)}
                        className="min-h-[38px] px-3 rounded-lg bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-500/35 text-xs font-semibold text-[#005EB8] dark:text-sky-300 hover:bg-sky-100/70 dark:hover:bg-sky-950/60"
                      >
                        {test.availabilityStatus === 'coming_soon'
                          ? 'Log Lab'
                          : 'Test'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </HemaCard>

        {/* Recent Activity Column */}
        <div className="lg:col-span-4 space-y-4 sm:space-y-5">
          <HemaCard className="p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-base font-semibold">
                Recent Activity
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('history')}
                className="min-h-[34px] px-2 text-xs font-medium text-[#005EB8] dark:text-sky-300 hover:underline"
              >
                All History
              </button>
            </div>

            {measurements.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                No recent measurements recorded. Completed BLE captures, simulated readings, and manual clinical entries appear here chronologically.
              </p>
            ) : (
              <div className="space-y-2.5">
                {measurements.slice(0, 5).map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-3 py-2 border-b border-[#E2E8F0] dark:border-[#1E2E42] last:border-0"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate">
                        {m.testName}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                        <Clock className="w-3 h-3 shrink-0" />
                        <span className="tabular-nums-mono">
                          {formatShortDate(m.measuredAt)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">
                          {formatDataSource(m.dataSource)}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-bold tabular-nums-mono">
                        {formatMeasurementValue(m)} {m.unit}
                      </div>
                      <div
                        className={`text-[11px] font-medium ${
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
          </HemaCard>

          <HemaCard className="p-4 sm:p-5 space-y-3 bg-[#F8FAFC] dark:bg-[#0D1622]">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#005EB8] dark:text-sky-300">
              <Activity className="w-4 h-4" />
              <span>Recommended Clinical Check</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Initiate a guided glucose or blood pressure capture session or compile a verified PDF report for clinician review.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onStartTest('glucose')}
                className="min-h-[40px] px-3 py-2 rounded-lg bg-white dark:bg-[#111B27] border border-[#D5E0EC] dark:border-[#1E2E42] hover:border-[#005EB8]/60 text-xs font-semibold"
              >
                Glucose
              </button>
              <button
                type="button"
                onClick={() => onStartTest('blood_pressure')}
                className="min-h-[40px] px-3 py-2 rounded-lg bg-white dark:bg-[#111B27] border border-[#D5E0EC] dark:border-[#1E2E42] hover:border-[#005EB8]/60 text-xs font-semibold"
              >
                Blood Pressure
              </button>
            </div>
          </HemaCard>
        </div>
      </section>

      {/* Parameter Details Modal */}
      <BottomSheetModal
        open={Boolean(selectedDetail)}
        onClose={() => setSelectedDetail(null)}
        ariaLabel={
          selectedDetail
            ? `${selectedDetail.test.testName} Details`
            : 'Parameter Details'
        }
      >
        {selectedDetail && (
          <div className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-lg font-bold">
                  {selectedDetail.test.testName}
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {selectedDetail.test.sensingMethod}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDetail(null)}
                className="min-h-[38px] px-3 py-1 rounded-lg border border-[#CBD5E1] dark:border-[#24364D] text-xs font-medium shrink-0"
              >
                Close
              </button>
            </div>

            <div className="mt-4 p-4 rounded-lg bg-[#F8FAFC] dark:bg-[#0D1622] border border-[#D5E0EC] dark:border-[#1E2E42]">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Clinical Reference Interval
              </div>
              <div className="mt-1 text-sm font-semibold tabular-nums-mono">
                {formatReferenceRange(
                  selectedDetail.test.referenceRangeConfig,
                  selectedDetail.test.unit,
                  selectedDetail.test.secondaryUnit,
                )}
              </div>
              {selectedDetail.test.referenceRangeConfig.notes && (
                <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300">
                  {selectedDetail.test.referenceRangeConfig.notes}
                </p>
              )}
            </div>

            <div className="mt-4">
              <div className="text-xs font-semibold mb-2">
                Recorded History ({selectedDetail.history.length})
              </div>
              {selectedDetail.history.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No measurements stored for this biomarker yet.
                </p>
              ) : (
                <div className="max-h-48 overflow-y-auto divide-y divide-[#E2E8F0] dark:divide-[#1E2E42] border border-[#D5E0EC] dark:border-[#1E2E42] rounded-lg">
                  {selectedDetail.history.slice(0, 10).map((item) => (
                    <div
                      key={item.id}
                      className="px-3 py-2.5 flex items-center justify-between text-xs gap-2"
                    >
                      <span className="tabular-nums-mono text-slate-500 dark:text-slate-400">
                        {formatDateTime(item.measuredAt)}
                      </span>
                      <span className="font-semibold tabular-nums-mono shrink-0">
                        {formatMeasurementValue(item)} {item.unit}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  const slug = selectedDetail.test.slug;
                  setSelectedDetail(null);
                  onStartTest(slug);
                }}
                className="w-full sm:w-auto min-h-[44px] px-5 py-2 rounded-lg hn-btn-primary text-xs sm:text-sm font-semibold"
              >
                Open Measurement Workflow
              </button>
            </div>
          </div>
        )}
      </BottomSheetModal>
    </div>
  );
}
