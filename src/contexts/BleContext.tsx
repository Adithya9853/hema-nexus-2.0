import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import type { BleGattConfiguration } from '../config/bleConfig.ts';
import {
  bleService,
  type BleConnectionState,
  type BleDeviceInfo,
  type BleParsedPacket,
  type BleSupportStatus,
} from '../services/bluetooth/bleService.ts';

interface BleContextValue {
  state: BleConnectionState;
  lastError: string | null;
  deviceInfo: BleDeviceInfo | null;
  config: BleGattConfiguration;
  support: BleSupportStatus;
  latestPacket: BleParsedPacket | null;
  scanAndConnect: () => Promise<BleDeviceInfo>;
  reconnect: () => Promise<BleDeviceInfo>;
  disconnect: () => void;
  updateConfig: (next: Partial<BleGattConfiguration>) => void;
  sendTestCommand: (testSlug: string) => Promise<boolean>;
  clearLatestPacket: () => void;
}

const BleContext = createContext<BleContextValue | null>(null);

export function BleProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState(() => bleService.getSnapshot());
  const [latestPacket, setLatestPacket] = useState<BleParsedPacket | null>(
    null,
  );

  useEffect(() => {
    const unsub = bleService.subscribe(() => {
      setSnapshot(bleService.getSnapshot());
    });
    const unsubPackets = bleService.onPacket((packet) => {
      setLatestPacket(packet);
    });
    return () => {
      unsub();
      unsubPackets();
    };
  }, []);

  const scanAndConnect = useCallback(() => bleService.scanAndConnect(), []);
  const reconnect = useCallback(() => bleService.reconnect(), []);
  const disconnect = useCallback(() => bleService.disconnect(), []);
  const updateConfig = useCallback(
    (next: Partial<BleGattConfiguration>) => bleService.updateConfig(next),
    [],
  );
  const sendTestCommand = useCallback(
    (testSlug: string) => bleService.sendTestCommand(testSlug),
    [],
  );
  const clearLatestPacket = useCallback(() => setLatestPacket(null), []);

  return (
    <BleContext.Provider
      value={{
        ...snapshot,
        latestPacket,
        scanAndConnect,
        reconnect,
        disconnect,
        updateConfig,
        sendTestCommand,
        clearLatestPacket,
      }}
    >
      {children}
    </BleContext.Provider>
  );
}

export function useBle() {
  const ctx = useContext(BleContext);
  if (!ctx) {
    throw new Error('useBle must be used within BleProvider');
  }
  return ctx;
}
