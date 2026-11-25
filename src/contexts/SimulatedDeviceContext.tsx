import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import type {
  TransportConnectionState,
  TransportDeviceInfo,
  TransportMeasurementPacket,
} from '../services/device/deviceTransport.ts';
import {
  simulatedDeviceService,
  type FailureSimulationMode,
  type SimulatedSampleMode,
} from '../services/device/simulatedDeviceService.ts';

interface SimulatedDeviceContextValue {
  state: TransportConnectionState;
  deviceInfo: TransportDeviceInfo | null;
  lastError: string | null;
  isSimulated: true;
  connectSimulator: () => Promise<TransportDeviceInfo>;
  disconnectSimulator: () => Promise<void>;
  runSimulatedTest: (params: {
    testType: string;
    sampleMode: SimulatedSampleMode;
    customValue?: number;
    customSecondaryValue?: number | null;
    failureMode?: FailureSimulationMode;
    onStage?: (stageLabel: string, progressPct: number) => void;
  }) => Promise<TransportMeasurementPacket>;
}

const SimulatedDeviceContext =
  createContext<SimulatedDeviceContextValue | null>(null);

export function SimulatedDeviceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [snapshot, setSnapshot] = useState(() =>
    simulatedDeviceService.getSnapshot(),
  );

  useEffect(() => {
    return simulatedDeviceService.subscribe(() => {
      setSnapshot(simulatedDeviceService.getSnapshot());
    });
  }, []);

  const connectSimulator = useCallback(
    () => simulatedDeviceService.connect(),
    [],
  );

  const disconnectSimulator = useCallback(
    () => simulatedDeviceService.disconnect(),
    [],
  );

  const runSimulatedTest = useCallback(
    (params: {
      testType: string;
      sampleMode: SimulatedSampleMode;
      customValue?: number;
      customSecondaryValue?: number | null;
      failureMode?: FailureSimulationMode;
      onStage?: (stageLabel: string, progressPct: number) => void;
    }) => simulatedDeviceService.runSimulatedMeasurement(params),
    [],
  );

  return (
    <SimulatedDeviceContext.Provider
      value={{
        state: snapshot.state,
        deviceInfo: snapshot.deviceInfo,
        lastError: snapshot.lastError,
        isSimulated: true,
        connectSimulator,
        disconnectSimulator,
        runSimulatedTest,
      }}
    >
      {children}
    </SimulatedDeviceContext.Provider>
  );
}

export function useSimulatedDevice() {
  const ctx = useContext(SimulatedDeviceContext);
  if (!ctx) {
    throw new Error(
      'useSimulatedDevice must be used within SimulatedDeviceProvider',
    );
  }
  return ctx;
}
