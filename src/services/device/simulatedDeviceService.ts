import type {
  DeviceTransport,
  TransportConnectionState,
  TransportDeviceInfo,
  TransportMeasurementPacket,
} from './deviceTransport.ts';

export type SimulatedSampleMode = 'normal' | 'abnormal' | 'custom';

export type FailureSimulationMode =
  | 'none'
  | 'device_disconnect'
  | 'invalid_strip'
  | 'insufficient_sample'
  | 'incomplete_measurement'
  | 'api_failure'
  | 'network_interruption'
  | 'duplicate_submission';

export const SIMULATOR_TEST_PANEL_SLUGS = [
  // 9 Blood Parameters
  'glucose',
  'cholesterol',
  'triglycerides',
  'uric_acid',
  'hemoglobin',
  'total_protein',
  'lactate',
  'creatinine',
  'urea',
  // Physiological Vitals
  'blood_pressure',
  'spo2',
  'heart_rate',
  'temperature',
] as const;

export type SimulatorTestSlug = (typeof SIMULATOR_TEST_PANEL_SLUGS)[number];

interface SampleProfile {
  normal: () => { value: number; secondary: number | null };
  abnormal: () => { value: number; secondary: number | null };
}

function randRange(min: number, max: number, decimals = 1): number {
  const raw = min + Math.random() * (max - min);
  const factor = Math.pow(10, decimals);
  return Math.round(raw * factor) / factor;
}

const SAMPLE_PROFILES: Record<string, SampleProfile> = {
  glucose: {
    normal: () => ({ value: randRange(78, 96, 0), secondary: null }),
    abnormal: () => ({
      value: Math.random() > 0.4 ? randRange(148, 224, 0) : randRange(55, 66, 0),
      secondary: null,
    }),
  },
  cholesterol: {
    normal: () => ({ value: randRange(142, 188, 0), secondary: null }),
    abnormal: () => ({ value: randRange(235, 290, 0), secondary: null }),
  },
  triglycerides: {
    normal: () => ({ value: randRange(78, 138, 0), secondary: null }),
    abnormal: () => ({ value: randRange(210, 340, 0), secondary: null }),
  },
  uric_acid: {
    normal: () => ({ value: randRange(4.1, 6.4, 1), secondary: null }),
    abnormal: () => ({ value: randRange(7.9, 9.8, 1), secondary: null }),
  },
  hemoglobin: {
    normal: () => ({ value: randRange(13.0, 16.2, 1), secondary: null }),
    abnormal: () => ({
      value: Math.random() > 0.3 ? randRange(8.8, 10.9, 1) : randRange(18.2, 19.6, 1),
      secondary: null,
    }),
  },
  total_protein: {
    normal: () => ({ value: randRange(6.4, 7.9, 1), secondary: null }),
    abnormal: () => ({
      value: Math.random() > 0.5 ? randRange(4.9, 5.7, 1) : randRange(8.8, 9.8, 1),
      secondary: null,
    }),
  },
  lactate: {
    normal: () => ({ value: randRange(0.7, 1.9, 1), secondary: null }),
    abnormal: () => ({ value: randRange(2.8, 5.2, 1), secondary: null }),
  },
  creatinine: {
    normal: () => ({ value: randRange(0.7, 1.1, 2), secondary: null }),
    abnormal: () => ({ value: randRange(1.7, 2.9, 2), secondary: null }),
  },
  urea: {
    normal: () => ({ value: randRange(18, 35, 0), secondary: null }),
    abnormal: () => ({ value: randRange(49, 76, 0), secondary: null }),
  },
  blood_pressure: {
    normal: () => ({
      value: randRange(108, 119, 0),
      secondary: randRange(68, 78, 0),
    }),
    abnormal: () => ({
      value: randRange(142, 168, 0),
      secondary: randRange(92, 104, 0),
    }),
  },
  spo2: {
    normal: () => ({
      value: randRange(96, 99, 0),
      secondary: randRange(64, 84, 0),
    }),
    abnormal: () => ({
      value: randRange(87, 92, 0),
      secondary: randRange(96, 118, 0),
    }),
  },
  heart_rate: {
    normal: () => ({ value: randRange(62, 86, 0), secondary: null }),
    abnormal: () => ({
      value: Math.random() > 0.3 ? randRange(108, 134, 0) : randRange(44, 52, 0),
      secondary: null,
    }),
  },
  temperature: {
    normal: () => ({ value: randRange(36.3, 37.0, 1), secondary: null }),
    abnormal: () => ({ value: randRange(37.9, 39.2, 1), secondary: null }),
  },
};

function encodeSimulatedPacketHex(
  slug: string,
  val: number,
  sec: number | null,
): string {
  const str = JSON.stringify({ sim: true, slug, val, sec });
  return Array.from(new TextEncoder().encode(str))
    .slice(0, 24)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export class SimulatedTestFailure extends Error {
  failureMode: FailureSimulationMode;

  constructor(mode: FailureSimulationMode, message: string) {
    super(message);
    this.name = 'SimulatedTestFailure';
    this.failureMode = mode;
  }
}

class HemaSimulatedDeviceService implements DeviceTransport {
  readonly kind = 'simulated' as const;
  readonly isSimulated = true;

  private state: TransportConnectionState = 'idle';
  private deviceInfo: TransportDeviceInfo | null = null;
  private lastError: string | null = null;
  private listeners = new Set<() => void>();

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emitChange() {
    for (const listener of this.listeners) {
      listener();
    }
  }

  getSnapshot() {
    return {
      state: this.state,
      deviceInfo: this.deviceInfo,
      lastError: this.lastError,
      isSimulated: true,
    };
  }

  async connect(): Promise<TransportDeviceInfo> {
    this.lastError = null;
    this.state = 'scanning';
    this.emitChange();
    await new Promise((r) => window.setTimeout(r, 450));

    this.state = 'connecting';
    this.emitChange();
    await new Promise((r) => window.setTimeout(r, 650));

    const info: TransportDeviceInfo = {
      id: 'SIM-HN-DEV-001',
      name: 'Hema Nexus Simulator (ESP32-SIM)',
      firmwareVersion: 'SIM-FW-0.9.4-TEST',
      hardwareRevision: 'SIM-REV-B',
      batteryLevel: 94,
      connectedAt: new Date().toISOString(),
      isSimulated: true,
    };

    this.deviceInfo = info;
    this.state = 'connected';
    this.emitChange();
    return info;
  }

  async disconnect(): Promise<void> {
    if (this.state === 'idle' || this.state === 'disconnected') return;
    this.state = 'disconnecting';
    this.emitChange();
    await new Promise((r) => window.setTimeout(r, 420));
    this.state = 'disconnected';
    this.deviceInfo = null;
    this.emitChange();
  }

  async runSimulatedMeasurement(params: {
    testType: string;
    sampleMode: SimulatedSampleMode;
    customValue?: number;
    customSecondaryValue?: number | null;
    failureMode?: FailureSimulationMode;
    onStage?: (stageLabel: string, progressPct: number) => void;
  }): Promise<TransportMeasurementPacket> {
    const {
      testType,
      sampleMode,
      customValue,
      customSecondaryValue = null,
      failureMode = 'none',
      onStage,
    } = params;

    if (this.state !== 'connected') {
      throw new Error(
        'Simulated Hema Nexus device is not connected. Connect the simulator first.',
      );
    }

    onStage?.('Initializing sensor bay (SIMULATED)', 20);
    await new Promise((r) => window.setTimeout(r, 320));

    if (failureMode === 'invalid_strip') {
      throw new SimulatedTestFailure(
        'invalid_strip',
        'Simulated Fault: Invalid or expired reagent strip detected in cartridge port.',
      );
    }

    onStage?.('Verifying sample volume & reagent readiness (SIMULATED)', 48);
    await new Promise((r) => window.setTimeout(r, 380));

    if (failureMode === 'insufficient_sample') {
      throw new SimulatedTestFailure(
        'insufficient_sample',
        'Simulated Fault: Insufficient capillary blood sample volume detected. Insert a new strip and retry.',
      );
    }

    if (failureMode === 'device_disconnect') {
      this.state = 'disconnected';
      this.deviceInfo = null;
      this.lastError = 'Simulated mid-test device disconnection.';
      this.emitChange();
      throw new SimulatedTestFailure(
        'device_disconnect',
        'Simulated Fault: Simulated Hema Nexus unit disconnected unexpectedly during signal acquisition.',
      );
    }

    onStage?.('Acquiring simulated sensor waveform (SIMULATED)', 78);
    await new Promise((r) => window.setTimeout(r, 420));

    if (failureMode === 'incomplete_measurement') {
      throw new SimulatedTestFailure(
        'incomplete_measurement',
        'Simulated Fault: Incomplete measurement packet received (CRC / payload truncated).',
      );
    }

    onStage?.('Packet generated & ready for validation (SIMULATED)', 100);

    let measuredValue: number;
    let secondaryValue: number | null = null;

    if (sampleMode === 'custom') {
      if (customValue === undefined || !Number.isFinite(customValue)) {
        throw new Error('Enter a valid custom numeric value.');
      }
      measuredValue = customValue;
      secondaryValue =
        customSecondaryValue !== undefined &&
        customSecondaryValue !== null &&
        Number.isFinite(customSecondaryValue)
          ? customSecondaryValue
          : null;
    } else {
      const profile = SAMPLE_PROFILES[testType];
      if (!profile) {
        measuredValue = sampleMode === 'normal' ? 50 : 120;
      } else {
        const sample =
          sampleMode === 'normal' ? profile.normal() : profile.abnormal();
        measuredValue = sample.value;
        secondaryValue = sample.secondary;
      }
    }

    return {
      testType,
      measuredValue,
      secondaryValue,
      rawPacketHex: encodeSimulatedPacketHex(
        testType,
        measuredValue,
        secondaryValue,
      ),
      receivedAt: new Date().toISOString(),
      dataSource: 'simulated_device',
      isSimulated: true,
    };
  }
}

export const simulatedDeviceService = new HemaSimulatedDeviceService();
