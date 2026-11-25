import { useState } from 'react';
import {
  Battery,
  Bluetooth,
  BluetoothConnected,
  BluetoothOff,
  ClipboardList,
  Cpu,
  RefreshCw,
  Sliders,
  Trash2,
  Wrench,
} from 'lucide-react';
import { HemaCard, StatusBanner } from '../components/ui/HemaPrimitives.tsx';
import { BRAND_ASSETS } from '../config/assets.ts';
import { useBle } from '../contexts/BleContext.tsx';
import { useHemaData } from '../contexts/HemaDataContext.tsx';
import { useSimulatedDevice } from '../contexts/SimulatedDeviceContext.tsx';
import type { DeviceEventRecord } from '../types/hema.ts';
import { formatDateTime } from '../utils/formatters.ts';

interface DeviceManagementPageProps {
  onOpenSimulator?: () => void;
}

export function DeviceManagementPage({
  onOpenSimulator,
}: DeviceManagementPageProps) {
  const {
    state: bleState,
    lastError,
    deviceInfo,
    config,
    support,
    scanAndConnect,
    reconnect,
    disconnect,
    updateConfig,
  } = useBle();
  const { state: simState, deviceInfo: simDeviceInfo } = useSimulatedDevice();

  const {
    devices,
    calibrations,
    registerDevice,
    updateDeviceStatus,
    removeDevice,
    fetchDeviceEvents,
    recordCalibration,
  } = useHemaData();

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [showBleAdvanced, setShowBleAdvanced] = useState(false);
  const [inspectedDeviceId, setInspectedDeviceId] = useState<number | null>(
    null,
  );
  const [confirmRemoveId, setConfirmRemoveId] = useState<number | null>(null);
  const [deviceEvents, setDeviceEvents] = useState<DeviceEventRecord[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [calChannel, setCalChannel] = useState('Port 1: Glucose');
  const [calStatus, setCalStatus] = useState<
    'passed' | 'pending' | 'failed' | 'expired'
  >('passed');
  const [calNotes, setCalNotes] = useState('');
  const [savingCal, setSavingCal] = useState(false);

  const [prefixInput, setPrefixInput] = useState(config.deviceNamePrefix);
  const [serviceUuidInput, setServiceUuidInput] = useState(
    config.customServiceUuid,
  );
  const [measCharInput, setMeasCharInput] = useState(
    config.measurementCharacteristicUuid,
  );
  const [ctrlCharInput, setCtrlCharInput] = useState(
    config.controlCharacteristicUuid,
  );

  const handleScanAndConnect = async () => {
    setBusy(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const info = await scanAndConnect();
      await registerDevice({
        deviceName: info.name,
        deviceIdentifier: info.id,
        firmwareVersion: info.firmwareVersion,
        hardwareRevision: info.hardwareRevision,
      });
      setActionSuccess(
        `Connected and verified GATT link with ${info.name}.`,
      );
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Bluetooth connection failed.',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleReconnect = async (dbDeviceId?: number) => {
    setBusy(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const info = await reconnect();
      if (dbDeviceId) {
        await updateDeviceStatus(dbDeviceId, { status: 'connected' });
      }
      setActionSuccess(`Reconnected to ${info.name}.`);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Unable to reconnect to device.',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    disconnect();
    const activeDb = devices.find((d) => d.status === 'connected');
    if (activeDb) {
      await updateDeviceStatus(activeDb.id, { status: 'disconnected' });
    }
    setActionSuccess('Bluetooth session closed.');
  };

  const handleSaveBleConfig = (e: React.FormEvent) => {
    e.preventDefault();
    updateConfig({
      deviceNamePrefix: prefixInput.trim(),
      customServiceUuid: serviceUuidInput.trim(),
      measurementCharacteristicUuid: measCharInput.trim(),
      controlCharacteristicUuid: ctrlCharInput.trim(),
    });
    setActionSuccess('ESP32 BLE GATT configuration updated for this session.');
    setShowBleAdvanced(false);
  };

  const handleInspectDevice = async (deviceId: number) => {
    if (inspectedDeviceId === deviceId) {
      setInspectedDeviceId(null);
      return;
    }
    setInspectedDeviceId(deviceId);
    setLoadingEvents(true);
    setActionError(null);
    try {
      const events = await fetchDeviceEvents(deviceId);
      setDeviceEvents(events);
    } catch (err) {
      setDeviceEvents([]);
      setActionError(
        err instanceof Error
          ? err.message
          : 'Unable to load device event history.',
      );
    } finally {
      setLoadingEvents(false);
    }
  };

  const handleRemoveDevice = async (deviceId: number, deviceName: string) => {
    setActionError(null);
    setActionSuccess(null);
    try {
      await removeDevice(deviceId);
      setConfirmRemoveId(null);
      if (inspectedDeviceId === deviceId) {
        setInspectedDeviceId(null);
      }
      setActionSuccess(`Removed ${deviceName} from registered devices.`);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Failed to remove device.',
      );
    }
  };

  const handleSaveCalibration = async (
    e: React.FormEvent,
    deviceId: number,
  ) => {
    e.preventDefault();
    setSavingCal(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await recordCalibration({
        deviceId,
        sensorChannel: calChannel,
        calibrationStatus: calStatus,
        notes: calNotes.trim() || null,
      });
      setCalNotes('');
      const events = await fetchDeviceEvents(deviceId);
      setDeviceEvents(events);
      setActionSuccess(
        `Saved ${calStatus} calibration record for ${calChannel}.`,
      );
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Failed to save calibration.',
      );
    } finally {
      setSavingCal(false);
    }
  };

  return (
    <div className="space-y-6 sm:space-y-7">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
            Connect Device
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Pair and manage your ESP32-powered Hema Nexus clinical unit over Bluetooth Low Energy.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowBleAdvanced((s) => !s)}
          className="min-h-[44px] px-4 py-2 rounded-lg border border-[#D5E0EC] dark:border-[#1E2E42] bg-white dark:bg-[#111B27] text-xs font-medium flex items-center justify-center gap-2 self-stretch sm:self-auto"
        >
          <Sliders className="w-3.5 h-3.5 text-[#005EB8] dark:text-sky-300" />
          <span>ESP32 GATT Config</span>
        </button>
      </div>

      {/* Dedicated Simulated Device Mode Entry */}
      {onOpenSimulator && (
        <HemaCard
          variant="simulation"
          className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-10 w-10 rounded-lg bg-amber-600 text-white flex items-center justify-center shrink-0">
              <Cpu className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-sm sm:text-base font-bold">
                  Simulated Device Mode
                </h2>
                <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                  SIMULATION · No Hardware Required
                </span>
                {simState === 'connected' && simDeviceInfo && (
                  <span className="font-mono text-[11px] font-semibold text-teal-700 dark:text-teal-400">
                    ● Active ({simDeviceInfo.id})
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-700 dark:text-amber-100/80 leading-relaxed">
                Test all 9 blood parameters and 4 vitals directly from your phone or laptop without a physical ESP32 unit. Readings are permanently flagged as{' '}
                <span className="font-mono font-semibold">SIMULATED</span> and separated from real BLE hardware data.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenSimulator}
            className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 shrink-0 transition-colors"
          >
            <Cpu className="w-4 h-4 shrink-0" />
            <span>
              {simState === 'connected'
                ? 'Open Active Simulator'
                : 'Enter Simulated Device Mode'}
            </span>
          </button>
        </HemaCard>
      )}

      {!support.supported && (
        <StatusBanner
          variant="warning"
          message={`${support.reason} On Android, open this page directly in Chrome with Bluetooth & Location enabled to pair physical ESP32 hardware. On iOS Safari or in-app browsers, use Simulated Device Mode above.`}
        />
      )}

      {actionError && (
        <StatusBanner
          variant="error"
          message={actionError}
          onDismiss={() => setActionError(null)}
        />
      )}

      {lastError && !actionError && bleState === 'error' && (
        <StatusBanner variant="error" message={lastError} />
      )}

      {actionSuccess && (
        <StatusBanner
          variant="success"
          message={actionSuccess}
          onDismiss={() => setActionSuccess(null)}
        />
      )}

      {/* Hardware Showcase + Live Connection Inspector */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-stretch">
        <HemaCard
          variant="clinical"
          className="lg:col-span-6 p-4 sm:p-6 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-xs text-slate-300 mb-3 gap-2">
            <span className="font-medium text-sky-300">
              Hema Nexus Clinical Instrument
            </span>
            <span className="tabular-nums-mono text-slate-400">
              ESP32 DevKit V1 · BLE GATT
            </span>
          </div>

          <div className="rounded-lg bg-[#081829] border border-[#1E3F66] p-3 flex-1 flex items-center justify-center relative">
            <img
              src={BRAND_ASSETS.productPhoto}
              alt="Hema Nexus Complete Physical Unit"
              referrerPolicy="no-referrer"
              className={`w-full max-h-[260px] sm:max-h-[340px] object-contain transition-opacity ${
                busy || bleState === 'connecting' ? 'opacity-65' : 'opacity-100'
              }`}
            />
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3 text-xs border-t border-[#1E3F66] pt-4">
            <div>
              <div className="text-slate-400">Strip Bays</div>
              <div className="font-semibold mt-0.5 text-white">Ports 1–9</div>
            </div>
            <div>
              <div className="text-slate-400">Hemodynamics</div>
              <div className="font-semibold mt-0.5 text-white">
                BP &amp; SpO2
              </div>
            </div>
            <div>
              <div className="text-slate-400">Thermal Probe</div>
              <div className="font-semibold mt-0.5 text-white">
                Port 7 Sensor
              </div>
            </div>
          </div>
        </HemaCard>

        <HemaCard className="lg:col-span-6 p-4 sm:p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-4 pb-4 border-b border-[#E2E8F0] dark:border-[#1E2E42]">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-11 w-11 rounded-lg bg-[#F1F5F9] dark:bg-[#0D1622] border border-[#D5E0EC] dark:border-[#1E2E42] flex items-center justify-center shrink-0">
                  {bleState === 'connected' ? (
                    <BluetoothConnected className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                  ) : bleState === 'unsupported' ? (
                    <BluetoothOff className="w-5 h-5 text-slate-400" />
                  ) : (
                    <Bluetooth
                      className={`w-5 h-5 text-[#005EB8] dark:text-sky-300 ${
                        busy || bleState === 'connecting' ? 'animate-pulse' : ''
                      }`}
                    />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-base font-display font-semibold truncate">
                    {deviceInfo?.name || 'No Active BLE Session'}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Bluetooth State:{' '}
                    <span className="font-medium capitalize text-slate-900 dark:text-slate-100">
                      {busy ? 'scanning' : bleState}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <dl className="mt-4 sm:mt-5 grid grid-cols-2 gap-3 sm:gap-4 text-sm">
              <div className="p-3 sm:p-3.5 rounded-lg bg-[#F8FAFC] dark:bg-[#0D1622] border border-[#D5E0EC] dark:border-[#1E2E42]">
                <dt className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                  Device Identifier
                </dt>
                <dd className="mt-1 font-mono text-xs font-semibold truncate">
                  {deviceInfo?.id || '—'}
                </dd>
              </div>
              <div className="p-3 sm:p-3.5 rounded-lg bg-[#F8FAFC] dark:bg-[#0D1622] border border-[#D5E0EC] dark:border-[#1E2E42]">
                <dt className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                  Firmware Version
                </dt>
                <dd className="mt-1 font-mono text-xs font-semibold truncate">
                  {deviceInfo?.firmwareVersion || 'Unreported'}
                </dd>
              </div>
              <div className="p-3 sm:p-3.5 rounded-lg bg-[#F8FAFC] dark:bg-[#0D1622] border border-[#D5E0EC] dark:border-[#1E2E42]">
                <dt className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Battery className="w-3.5 h-3.5" />
                  Battery Level
                </dt>
                <dd className="mt-1 font-mono text-xs font-semibold">
                  {deviceInfo?.batteryLevel !== null &&
                  deviceInfo?.batteryLevel !== undefined
                    ? `${deviceInfo.batteryLevel}%`
                    : '—'}
                </dd>
              </div>
              <div className="p-3 sm:p-3.5 rounded-lg bg-[#F8FAFC] dark:bg-[#0D1622] border border-[#D5E0EC] dark:border-[#1E2E42]">
                <dt className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                  Connected Timestamp
                </dt>
                <dd className="mt-1 font-mono text-xs font-semibold truncate">
                  {deviceInfo?.connectedAt
                    ? formatDateTime(deviceInfo.connectedAt)
                    : '—'}
                </dd>
              </div>
            </dl>
          </div>

          <div className="mt-5 pt-4 border-t border-[#E2E8F0] dark:border-[#1E2E42] flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2.5 sm:gap-3">
            {bleState !== 'connected' ? (
              <button
                type="button"
                onClick={handleScanAndConnect}
                disabled={busy || !support.supported}
                className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-lg hn-btn-primary text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-45 transition-colors"
              >
                <Bluetooth className="w-4 h-4" />
                <span>
                  {busy ? 'Scanning BLE...' : 'Scan & Connect Device'}
                </span>
              </button>
            ) : (
              <div className="grid grid-cols-2 sm:flex gap-2.5">
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="min-h-[44px] px-4 py-2.5 rounded-lg border border-rose-300 dark:border-rose-500/40 text-rose-700 dark:text-rose-300 text-sm font-medium hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                >
                  Disconnect
                </button>
                <button
                  type="button"
                  onClick={() => void handleReconnect()}
                  disabled={busy}
                  className="min-h-[44px] px-4 py-2.5 rounded-lg border border-[#CBD5E1] dark:border-[#24364D] text-sm font-medium flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Refresh GATT</span>
                </button>
              </div>
            )}

            {bleState === 'disconnected' && deviceInfo && (
              <button
                type="button"
                onClick={() => void handleReconnect()}
                disabled={busy}
                className="min-h-[44px] px-4 py-2.5 rounded-lg border border-[#CBD5E1] dark:border-[#24364D] text-sm font-medium flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reconnect</span>
              </button>
            )}

            {onOpenSimulator && (
              <button
                type="button"
                onClick={onOpenSimulator}
                className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-lg border border-amber-300 dark:border-amber-500/40 text-amber-900 dark:text-amber-200 hover:bg-amber-50 dark:hover:bg-amber-950/30 text-sm font-medium flex items-center justify-center gap-2 transition-colors"
              >
                <Cpu className="w-4 h-4" />
                <span>Simulated Mode (SIMULATION)</span>
              </button>
            )}
          </div>
        </HemaCard>
      </section>

      {/* ESP32 Custom GATT Configuration Drawer */}
      {showBleAdvanced && (
        <HemaCard className="p-4 sm:p-6">
          <form onSubmit={handleSaveBleConfig} className="space-y-4">
            <div>
              <h2 className="font-display text-base font-semibold">
                ESP32 BLE GATT Service Configuration
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Standard Bluetooth SIG health services are discovered automatically. Enter your ESP32 firmware&apos;s custom GATT UUIDs below when testing custom multi-port packets.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1.5">
                  BLE Device Name Prefix
                </label>
                <input
                  type="text"
                  value={prefixInput}
                  onChange={(e) => setPrefixInput(e.target.value)}
                  placeholder="Hema"
                  className="w-full h-11 px-3 rounded-lg border border-[#CBD5E1] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0D1622] text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5">
                  Custom Primary Service UUID (optional)
                </label>
                <input
                  type="text"
                  value={serviceUuidInput}
                  onChange={(e) => setServiceUuidInput(e.target.value)}
                  placeholder="e.g. 128-bit UUID from ESP32 firmware"
                  className="w-full h-11 px-3 rounded-lg border border-[#CBD5E1] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0D1622] text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5">
                  Measurement Notify Characteristic UUID
                </label>
                <input
                  type="text"
                  value={measCharInput}
                  onChange={(e) => setMeasCharInput(e.target.value)}
                  placeholder="UUID for JSON / binary measurement notifications"
                  className="w-full h-11 px-3 rounded-lg border border-[#CBD5E1] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0D1622] text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5">
                  Control Write Characteristic UUID
                </label>
                <input
                  type="text"
                  value={ctrlCharInput}
                  onChange={(e) => setCtrlCharInput(e.target.value)}
                  placeholder="UUID for START_TEST command writes"
                  className="w-full h-11 px-3 rounded-lg border border-[#CBD5E1] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0D1622] text-sm font-mono"
                />
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowBleAdvanced(false)}
                className="min-h-[44px] px-4 py-2 rounded-lg border border-[#CBD5E1] dark:border-[#24364D] text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="min-h-[44px] px-5 py-2 rounded-lg hn-btn-primary text-xs font-semibold"
              >
                Save GATT Settings
              </button>
            </div>
          </form>
        </HemaCard>
      )}

      {/* Registered Devices Registry */}
      <HemaCard className="overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b border-[#D5E0EC] dark:border-[#1E2E42] flex items-center justify-between gap-2 bg-[#F8FAFC] dark:bg-[#0D1622]">
          <div>
            <h2 className="font-display text-base font-semibold">
              Paired Hema Nexus Devices
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Devices linked to your PostgreSQL clinical record.
            </p>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums-mono shrink-0">
            {devices.length} registered
          </span>
        </div>

        {devices.length === 0 ? (
          <div className="p-8 text-center">
            <Cpu className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <div className="text-sm font-semibold">No paired hardware yet</div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Use &ldquo;Scan &amp; Connect Device&rdquo; above in a Web Bluetooth-capable browser to pair your physical Hema Nexus ESP32 unit, or use Simulated Device Mode.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#E2E8F0] dark:divide-[#1E2E42]">
            {devices.map((d) => {
              const isExpanded = inspectedDeviceId === d.id;
              const deviceCals = calibrations.filter(
                (c) => c.deviceId === d.id,
              );
              return (
                <div key={d.id} className="px-4 sm:px-5 py-4 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
                        <span>{d.deviceName}</span>
                        <span className="text-xs font-mono font-normal text-slate-500 dark:text-slate-400">
                          · {d.deviceIdentifier}
                        </span>
                        <span className="text-[11px] font-mono uppercase text-[#005EB8] dark:text-sky-300">
                          · {d.connectionType} / {d.status}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span>Model: {d.deviceModel}</span>
                        <span aria-hidden="true">·</span>
                        <span>Firmware: {d.firmwareVersion || 'Unreported'}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">
                          Cal: {d.calibrationStatus}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums-mono">
                          Last comm:{' '}
                          {formatDateTime(
                            d.lastCommunicationAt || d.lastConnectedAt,
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => void handleInspectDevice(d.id)}
                        className="min-h-[40px] px-3 py-1.5 rounded-lg border border-[#CBD5E1] dark:border-[#24364D] text-xs font-medium flex items-center gap-1.5"
                      >
                        <Wrench className="w-3.5 h-3.5 text-[#005EB8] dark:text-sky-300" />
                        <span>
                          {isExpanded ? 'Hide Logs & Cal' : 'Calibration & Logs'}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleReconnect(d.id)}
                        disabled={!support.supported || busy}
                        className="min-h-[40px] px-3 py-1.5 rounded-lg border border-[#CBD5E1] dark:border-[#24364D] text-xs font-medium disabled:opacity-45"
                      >
                        Reconnect
                      </button>
                      {confirmRemoveId === d.id ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              void handleRemoveDevice(d.id, d.deviceName)
                            }
                            className="min-h-[40px] px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-medium"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmRemoveId(null)}
                            className="min-h-[40px] px-3 py-1.5 rounded-lg border border-[#CBD5E1] dark:border-[#24364D] text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmRemoveId(d.id)}
                          aria-label={`Remove ${d.deviceName}`}
                          className="min-h-[40px] min-w-[40px] p-2 rounded-lg border border-[#CBD5E1] dark:border-[#24364D] text-slate-500 hover:text-rose-600 transition-colors flex items-center justify-center"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-3 border-t border-[#E2E8F0] dark:border-[#1E2E42]">
                      <form
                        onSubmit={(e) => void handleSaveCalibration(e, d.id)}
                        className="lg:col-span-5 p-4 rounded-lg bg-[#F8FAFC] dark:bg-[#0D1622] border border-[#D5E0EC] dark:border-[#1E2E42] space-y-3"
                      >
                        <div className="text-xs font-semibold flex items-center gap-1.5">
                          <Wrench className="w-3.5 h-3.5 text-[#005EB8] dark:text-sky-300" />
                          <span>Record Sensor Calibration</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <select
                            value={calChannel}
                            onChange={(e) => setCalChannel(e.target.value)}
                            className="h-10 px-2.5 rounded-lg border border-[#CBD5E1] dark:border-[#24364D] bg-white dark:bg-[#111B27] text-xs"
                          >
                            {(
                              d.sensorChannels || [
                                'Port 1: Glucose',
                                'Port 2: Cholesterol',
                                'Port 3: Triglycerides',
                                'Port 4: Uric Acid',
                                'Port 5: Hemoglobin',
                                'Port 6: Total Protein',
                                'Port 7: Lactate / Temp',
                                'Port 8: Creatinine',
                                'Port 9: Urea',
                                'Cuff: BP (SYS/DIA)',
                                'Optical: SpO2 / Pulse',
                              ]
                            ).map((ch) => (
                              <option key={ch} value={ch}>
                                {ch}
                              </option>
                            ))}
                          </select>
                          <select
                            value={calStatus}
                            onChange={(e) =>
                              setCalStatus(
                                e.target.value as
                                  | 'passed'
                                  | 'pending'
                                  | 'failed'
                                  | 'expired',
                              )
                            }
                            className="h-10 px-2.5 rounded-lg border border-[#CBD5E1] dark:border-[#24364D] bg-white dark:bg-[#111B27] text-xs"
                          >
                            <option value="passed">passed</option>
                            <option value="pending">pending</option>
                            <option value="failed">failed</option>
                            <option value="expired">expired</option>
                          </select>
                        </div>
                        <input
                          type="text"
                          maxLength={250}
                          value={calNotes}
                          onChange={(e) => setCalNotes(e.target.value)}
                          placeholder="Control solution lot / drift notes (optional)"
                          className="w-full h-10 px-2.5 rounded-lg border border-[#CBD5E1] dark:border-[#24364D] bg-white dark:bg-[#111B27] text-xs"
                        />
                        <button
                          type="submit"
                          disabled={savingCal}
                          className="w-full sm:w-auto min-h-[42px] px-4 py-2 rounded-lg hn-btn-primary text-xs font-semibold disabled:opacity-50"
                        >
                          {savingCal ? 'Saving...' : 'Save Calibration Record'}
                        </button>

                        {deviceCals.length > 0 && (
                          <div className="pt-2 border-t border-[#E2E8F0] dark:border-[#1E2E42] space-y-1.5">
                            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                              Recent Calibrations ({deviceCals.length})
                            </div>
                            {deviceCals.slice(0, 4).map((c) => (
                              <div
                                key={c.id}
                                className="text-[11px] flex items-center justify-between gap-2"
                              >
                                <span className="truncate">
                                  {c.sensorChannel} ({c.calibrationStatus})
                                </span>
                                <span className="font-mono text-slate-500 dark:text-slate-400 shrink-0">
                                  {formatDateTime(c.calibrationDate)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </form>

                      <div className="lg:col-span-7 p-4 rounded-lg bg-[#F8FAFC] dark:bg-[#0D1622] border border-[#D5E0EC] dark:border-[#1E2E42] space-y-2.5">
                        <div className="text-xs font-semibold flex items-center gap-1.5">
                          <ClipboardList className="w-3.5 h-3.5 text-[#005EB8] dark:text-sky-300" />
                          <span>Connection &amp; Diagnostic Event History</span>
                        </div>
                        {loadingEvents ? (
                          <div className="text-xs text-slate-500 dark:text-slate-400 py-4">
                            Loading device event history...
                          </div>
                        ) : deviceEvents.length === 0 ? (
                          <div className="text-xs text-slate-500 dark:text-slate-400 py-4">
                            No events logged for this unit yet.
                          </div>
                        ) : (
                          <div className="max-h-48 overflow-y-auto divide-y divide-[#E2E8F0] dark:divide-[#1E2E42] text-xs">
                            {deviceEvents.map((ev) => (
                              <div
                                key={ev.id}
                                className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-3"
                              >
                                <div>
                                  <span className="font-mono font-semibold uppercase text-[#005EB8] dark:text-sky-300">
                                    [{ev.eventType}]
                                  </span>{' '}
                                  <span>{ev.message}</span>
                                </div>
                                <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
                                  {formatDateTime(ev.createdAt)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </HemaCard>
    </div>
  );
}
