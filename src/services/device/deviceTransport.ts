import type { DataSourceType } from '../../types/hema.ts';

export type TransportKind = 'ble' | 'simulated';

export type TransportConnectionState =
  | 'unsupported'
  | 'idle'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'disconnecting'
  | 'disconnected'
  | 'error';

export interface TransportDeviceInfo {
  id: string;
  name: string;
  firmwareVersion: string | null;
  hardwareRevision: string | null;
  batteryLevel: number | null;
  connectedAt: string;
  isSimulated: boolean;
}

export interface TransportMeasurementPacket {
  testType: string;
  measuredValue: number;
  secondaryValue: number | null;
  rawPacketHex: string;
  receivedAt: string;
  dataSource: DataSourceType;
  isSimulated: boolean;
}

export interface DeviceTransport {
  readonly kind: TransportKind;
  readonly isSimulated: boolean;
  connect(): Promise<TransportDeviceInfo>;
  disconnect(): Promise<void> | void;
}
