import {
  getInitialBleConfig,
  STANDARD_BLE_CHARACTERISTICS,
  STANDARD_BLE_SERVICES,
  type BleGattConfiguration,
} from '../../config/bleConfig.ts';

export type BleConnectionState =
  | 'unsupported'
  | 'idle'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

export interface BleDeviceInfo {
  id: string;
  name: string;
  firmwareVersion: string | null;
  hardwareRevision: string | null;
  batteryLevel: number | null;
  connectedAt: string;
}

export interface BleParsedPacket {
  testType: string;
  measuredValue: number;
  secondaryValue: number | null;
  rawPacketHex: string;
  receivedAt: string;
}

export interface BleSupportStatus {
  supported: boolean;
  reason: string | null;
}

function bytesToHex(buffer: ArrayBufferLike): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function decodeTextValue(view: DataView): string {
  return new TextDecoder('utf-8').decode(view.buffer).replace(/\0/g, '').trim();
}

function decodeSfloat16(raw: number): number {
  let mantissa = raw & 0x0fff;
  if (mantissa >= 0x0800) mantissa -= 0x1000;
  let exponent = (raw >> 12) & 0x0f;
  if (exponent >= 0x08) exponent -= 0x10;
  return mantissa * Math.pow(10, exponent);
}

export function checkWebBluetoothSupport(): BleSupportStatus {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { supported: false, reason: 'Browser runtime unavailable.' };
  }
  if (!window.isSecureContext) {
    return {
      supported: false,
      reason: 'Web Bluetooth requires a secure HTTPS context.',
    };
  }
  const nav = navigator as Navigator & { bluetooth?: unknown };
  if (!nav.bluetooth) {
    return {
      supported: false,
      reason:
        'Web Bluetooth is not supported in this browser. Use Chrome, Edge, or Android Chrome for direct ESP32 BLE pairing.',
    };
  }
  return { supported: true, reason: null };
}

class HemaBleService {
  private device: any = null;
  private server: any = null;
  private config: BleGattConfiguration = getInitialBleConfig();
  private state: BleConnectionState = 'idle';
  private lastError: string | null = null;
  private deviceInfo: BleDeviceInfo | null = null;
  private listeners = new Set<() => void>();
  private packetListeners = new Set<(packet: BleParsedPacket) => void>();

  constructor() {
    const support = checkWebBluetoothSupport();
    if (!support.supported) {
      this.state = 'unsupported';
      this.lastError = support.reason;
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onPacket(listener: (packet: BleParsedPacket) => void): () => void {
    this.packetListeners.add(listener);
    return () => this.packetListeners.delete(listener);
  }

  private emitChange() {
    for (const listener of this.listeners) {
      listener();
    }
  }

  getSnapshot() {
    return {
      state: this.state,
      lastError: this.lastError,
      deviceInfo: this.deviceInfo,
      config: { ...this.config },
      support: checkWebBluetoothSupport(),
    };
  }

  updateConfig(next: Partial<BleGattConfiguration>) {
    this.config = { ...this.config, ...next };
    this.emitChange();
  }

  private handleDisconnect = () => {
    this.server = null;
    this.state = 'disconnected';
    this.emitChange();
  };

  async scanAndConnect(): Promise<BleDeviceInfo> {
    const support = checkWebBluetoothSupport();
    if (!support.supported) {
      this.state = 'unsupported';
      this.lastError = support.reason;
      this.emitChange();
      throw new Error(support.reason || 'Web Bluetooth is unavailable.');
    }

    const nav = navigator as Navigator & { bluetooth: any };
    this.state = 'scanning';
    this.lastError = null;
    this.emitChange();

    const optionalServices: (number | string)[] = [
      STANDARD_BLE_SERVICES.deviceInformation,
      STANDARD_BLE_SERVICES.batteryService,
      STANDARD_BLE_SERVICES.bloodPressure,
      STANDARD_BLE_SERVICES.glucose,
      STANDARD_BLE_SERVICES.pulseOximeter,
      STANDARD_BLE_SERVICES.healthThermometer,
      STANDARD_BLE_SERVICES.heartRate,
    ];

    if (this.config.customServiceUuid.trim()) {
      optionalServices.push(this.config.customServiceUuid.trim());
    }

    try {
      const filters: any[] = [];
      if (this.config.deviceNamePrefix.trim()) {
        filters.push({ namePrefix: this.config.deviceNamePrefix.trim() });
      }
      if (this.config.customServiceUuid.trim()) {
        filters.push({ services: [this.config.customServiceUuid.trim()] });
      }

      const requestOptions =
        filters.length > 0
          ? { filters, optionalServices }
          : { acceptAllDevices: true, optionalServices };

      const selectedDevice = await nav.bluetooth.requestDevice(requestOptions);
      if (!selectedDevice) {
        throw new Error('No device selected.');
      }

      this.device = selectedDevice;
      selectedDevice.addEventListener(
        'gattserverdisconnected',
        this.handleDisconnect,
      );

      return await this.connectToSelectedDevice();
    } catch (err: any) {
      const msg = this.normalizeBleError(err);
      this.state = 'error';
      this.lastError = msg;
      this.emitChange();
      throw new Error(msg);
    }
  }

  async reconnect(): Promise<BleDeviceInfo> {
    if (!this.device) {
      return this.scanAndConnect();
    }
    try {
      return await this.connectToSelectedDevice();
    } catch (err: any) {
      const msg = this.normalizeBleError(err);
      this.state = 'error';
      this.lastError = msg;
      this.emitChange();
      throw new Error(msg);
    }
  }

  private async connectToSelectedDevice(): Promise<BleDeviceInfo> {
    if (!this.device?.gatt) {
      throw new Error('Selected Bluetooth device does not expose a GATT server.');
    }

    this.state = 'connecting';
    this.lastError = null;
    this.emitChange();

    const server = await this.device.gatt.connect();
    if (!server || !server.connected) {
      throw new Error('GATT server did not confirm active connection.');
    }
    this.server = server;

    let firmwareVersion: string | null = null;
    let hardwareRevision: string | null = null;
    let batteryLevel: number | null = null;

    try {
      const devInfoSvc = await server.getPrimaryService(
        STANDARD_BLE_SERVICES.deviceInformation,
      );
      try {
        const fwChar = await devInfoSvc.getCharacteristic(
          STANDARD_BLE_CHARACTERISTICS.firmwareRevision,
        );
        firmwareVersion = decodeTextValue(await fwChar.readValue());
      } catch {
        // Optional characteristic
      }
      try {
        const hwChar = await devInfoSvc.getCharacteristic(
          STANDARD_BLE_CHARACTERISTICS.hardwareRevision,
        );
        hardwareRevision = decodeTextValue(await hwChar.readValue());
      } catch {
        // Optional characteristic
      }
    } catch {
      // Device Information service optional
    }

    try {
      const batterySvc = await server.getPrimaryService(
        STANDARD_BLE_SERVICES.batteryService,
      );
      const batChar = await batterySvc.getCharacteristic(
        STANDARD_BLE_CHARACTERISTICS.batteryLevel,
      );
      const batView = await batChar.readValue();
      batteryLevel = batView.getUint8(0);
    } catch {
      // Battery service optional
    }

    await this.subscribeKnownCharacteristics(server);

    const info: BleDeviceInfo = {
      id: this.device.id || `ble-${Date.now()}`,
      name: this.device.name || 'Hema Nexus Unit',
      firmwareVersion,
      hardwareRevision,
      batteryLevel,
      connectedAt: new Date().toISOString(),
    };

    this.deviceInfo = info;
    this.state = 'connected';
    this.lastError = null;
    this.emitChange();
    return info;
  }

  private async subscribeKnownCharacteristics(server: any) {
    // 1. Custom ESP32 Service if configured
    if (
      this.config.customServiceUuid.trim() &&
      this.config.measurementCharacteristicUuid.trim()
    ) {
      try {
        const svc = await server.getPrimaryService(
          this.config.customServiceUuid.trim(),
        );
        const char = await svc.getCharacteristic(
          this.config.measurementCharacteristicUuid.trim(),
        );
        await char.startNotifications();
        char.addEventListener('characteristicvaluechanged', (ev: any) => {
          const view: DataView = ev.target.value;
          const packet = this.parseCustomJsonOrBinaryPacket(view);
          if (packet) {
            for (const listener of this.packetListeners) listener(packet);
          }
        });
      } catch {
        // Custom service unavailable on this peripheral
      }
    }

    // 2. Standard Bluetooth SIG Heart Rate (0x180D / 0x2A37)
    try {
      const hrSvc = await server.getPrimaryService(
        STANDARD_BLE_SERVICES.heartRate,
      );
      const hrChar = await hrSvc.getCharacteristic(
        STANDARD_BLE_CHARACTERISTICS.heartRateMeasurement,
      );
      await hrChar.startNotifications();
      hrChar.addEventListener('characteristicvaluechanged', (ev: any) => {
        const view: DataView = ev.target.value;
        const flags = view.getUint8(0);
        const isUint16 = (flags & 0x01) !== 0;
        const bpm = isUint16 ? view.getUint16(1, true) : view.getUint8(1);
        const packet: BleParsedPacket = {
          testType: 'heart_rate',
          measuredValue: bpm,
          secondaryValue: null,
          rawPacketHex: bytesToHex(view.buffer),
          receivedAt: new Date().toISOString(),
        };
        for (const listener of this.packetListeners) listener(packet);
      });
    } catch {
      // Service not exposed
    }

    // 3. Standard Blood Pressure (0x1810 / 0x2A35)
    try {
      const bpSvc = await server.getPrimaryService(
        STANDARD_BLE_SERVICES.bloodPressure,
      );
      const bpChar = await bpSvc.getCharacteristic(
        STANDARD_BLE_CHARACTERISTICS.bloodPressureMeasurement,
      );
      await bpChar.startNotifications();
      bpChar.addEventListener('characteristicvaluechanged', (ev: any) => {
        const view: DataView = ev.target.value;
        if (view.byteLength >= 7) {
          const sys = Math.round(decodeSfloat16(view.getUint16(1, true)));
          const dia = Math.round(decodeSfloat16(view.getUint16(3, true)));
          const packet: BleParsedPacket = {
            testType: 'blood_pressure',
            measuredValue: sys,
            secondaryValue: dia,
            rawPacketHex: bytesToHex(view.buffer),
            receivedAt: new Date().toISOString(),
          };
          for (const listener of this.packetListeners) listener(packet);
        }
      });
    } catch {
      // Service not exposed
    }
  }

  private parseCustomJsonOrBinaryPacket(view: DataView): BleParsedPacket | null {
    try {
      const text = decodeTextValue(view);
      if (text.startsWith('{')) {
        const parsed = JSON.parse(text);
        if (
          typeof parsed.testType === 'string' &&
          typeof parsed.value === 'number' &&
          Number.isFinite(parsed.value)
        ) {
          return {
            testType: parsed.testType,
            measuredValue: parsed.value,
            secondaryValue:
              typeof parsed.secondaryValue === 'number'
                ? parsed.secondaryValue
                : null,
            rawPacketHex: bytesToHex(view.buffer),
            receivedAt: new Date().toISOString(),
          };
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  async sendTestCommand(testSlug: string): Promise<boolean> {
    if (!this.server?.connected) {
      throw new Error('No active BLE connection to Hema Nexus device.');
    }
    if (
      !this.config.customServiceUuid.trim() ||
      !this.config.controlCharacteristicUuid.trim()
    ) {
      return false;
    }
    const svc = await this.server.getPrimaryService(
      this.config.customServiceUuid.trim(),
    );
    const char = await svc.getCharacteristic(
      this.config.controlCharacteristicUuid.trim(),
    );
    const payload = new TextEncoder().encode(
      JSON.stringify({ cmd: 'START_TEST', testType: testSlug }),
    );
    await char.writeValue(payload);
    return true;
  }

  disconnect() {
    if (this.device) {
      this.device.removeEventListener(
        'gattserverdisconnected',
        this.handleDisconnect,
      );
      if (this.device.gatt?.connected) {
        this.device.gatt.disconnect();
      }
    }
    this.server = null;
    this.state = 'disconnected';
    this.emitChange();
  }

  private normalizeBleError(err: any): string {
    const name = err?.name || '';
    const message = err?.message || '';
    if (name === 'NotFoundError') {
      return 'Bluetooth pairing cancelled or no matching Hema Nexus device was selected.';
    }
    if (name === 'SecurityError') {
      return 'Bluetooth access was blocked by browser or iframe permissions policy.';
    }
    if (name === 'NotAllowedError') {
      return 'Bluetooth permission was denied by the browser.';
    }
    if (name === 'NetworkError') {
      return 'GATT connection dropped during handshake. Move closer to the device and retry.';
    }
    return message || 'Unable to establish Bluetooth connection.';
  }
}

export const bleService = new HemaBleService();
