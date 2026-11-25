import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { ApiError, apiRequest } from '../services/api/client.ts';
import {
  enqueueMeasurement,
  flushQueuedMeasurements,
  getQueuedMeasurements,
} from '../services/sync/offlineQueue.ts';
import type {
  AuditLogRecord,
  CalibrationRecord,
  DataSourceType,
  DeviceEventRecord,
  DeviceRecord,
  HospitalRecord,
  MeasurementRecord,
  NotificationRecord,
  PatientRecord,
  QueuedMeasurementPayload,
  ReportRecord,
  TestSessionRecord,
  TestTypeRecord,
} from '../types/hema.ts';
import { useAuth } from './AuthContext.tsx';

interface HemaDataContextValue {
  testCatalog: TestTypeRecord[];
  hospitals: HospitalRecord[];
  devices: DeviceRecord[];
  patients: PatientRecord[];
  testSessions: TestSessionRecord[];
  calibrations: CalibrationRecord[];
  measurements: MeasurementRecord[];
  reports: ReportRecord[];
  notifications: NotificationRecord[];
  auditLogs: AuditLogRecord[];
  queuedMeasurements: QueuedMeasurementPayload[];
  loading: boolean;
  error: string | null;
  backendHealthy: boolean | null;
  refreshAll: () => Promise<void>;
  registerHospital: (payload: {
    name: string;
    address?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    registrationNumber?: string | null;
  }) => Promise<HospitalRecord>;
  registerDevice: (payload: {
    deviceName: string;
    deviceIdentifier: string;
    deviceModel?: string | null;
    firmwareVersion?: string | null;
    hardwareRevision?: string | null;
    connectionType?: 'ble' | 'simulated';
  }) => Promise<DeviceRecord>;
  updateDeviceStatus: (
    id: number,
    patch: {
      status?: 'connected' | 'disconnected' | 'paired';
      deviceName?: string;
      firmwareVersion?: string;
    },
  ) => Promise<DeviceRecord>;
  removeDevice: (id: number) => Promise<void>;
  fetchDeviceEvents: (deviceId: number) => Promise<DeviceEventRecord[]>;
  logDeviceEvent: (
    deviceId: number,
    payload: {
      eventType: DeviceEventRecord['eventType'];
      connectionMode: 'ble' | 'simulated';
      errorCode?: string | null;
      message: string;
    },
  ) => Promise<void>;
  recordCalibration: (payload: {
    deviceId: number;
    sensorChannel: string;
    calibrationStatus: 'passed' | 'pending' | 'failed' | 'expired';
    calibrationParameters?: Record<string, unknown>;
    nextDueDate?: string | null;
    notes?: string | null;
  }) => Promise<CalibrationRecord>;
  registerPatient: (payload: {
    fullName: string;
    uhid?: string | null;
    dateOfBirth?: string | null;
    sex?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    notes?: string | null;
  }) => Promise<PatientRecord>;
  updatePatient: (
    id: number,
    patch: {
      fullName?: string;
      dateOfBirth?: string | null;
      sex?: string | null;
      phone?: string | null;
      email?: string | null;
      address?: string | null;
      notes?: string | null;
    },
  ) => Promise<PatientRecord>;
  removePatient: (id: number) => Promise<void>;
  createTestSession: (payload: {
    patientRecordId?: number | null;
    deviceId?: number | null;
    testMode: 'simulated' | 'real' | 'manual';
    selectedParameters: string[];
  }) => Promise<TestSessionRecord>;
  updateTestSession: (
    id: number,
    patch: {
      sessionStatus?: TestSessionRecord['sessionStatus'];
      completionStatus?: TestSessionRecord['completionStatus'];
      errorDetails?: string | null;
    },
  ) => Promise<TestSessionRecord>;
  recordMeasurement: (payload: {
    testType: string;
    measuredValue: number;
    secondaryValue?: number | null;
    measuredAt?: string;
    dataSource: DataSourceType;
    deviceId?: number | null;
    patientRecordId?: number | null;
    sessionId?: number | null;
    notes?: string | null;
    rawPacketHex?: string | null;
    explicitIdempotencyKey?: string | null;
    simulateApiFailure?: boolean;
    simulateNetworkInterruption?: boolean;
  }) => Promise<{
    saved: MeasurementRecord | null;
    queued: boolean;
    deduplicated: boolean;
  }>;
  removeMeasurement: (id: number) => Promise<void>;
  syncQueue: () => Promise<{ syncedCount: number; remainingCount: number }>;
  generateReport: (payload: {
    title: string;
    measurementIds: number[];
    patientRecordId?: number | null;
    sessionId?: number | null;
    summaryNotes?: string | null;
  }) => Promise<{ report: ReportRecord; measurements: MeasurementRecord[] }>;
  removeReport: (id: number) => Promise<void>;
  markNotificationRead: (id: number) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  logAuditEvent: (payload: {
    action: string;
    entityType: string;
    entityId?: string | number | null;
    details?: Record<string, unknown>;
  }) => Promise<void>;
}

const HemaDataContext = createContext<HemaDataContextValue | null>(null);

export function HemaDataProvider({ children }: { children: React.ReactNode }) {
  const { profile, isAuthenticated } = useAuth();
  const activeUid = profile?.uid ?? null;

  const [testCatalog, setTestCatalog] = useState<TestTypeRecord[]>([]);
  const [hospitals, setHospitals] = useState<HospitalRecord[]>([]);
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [testSessions, setTestSessions] = useState<TestSessionRecord[]>([]);
  const [calibrations, setCalibrations] = useState<CalibrationRecord[]>([]);
  const [measurements, setMeasurements] = useState<MeasurementRecord[]>([]);
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [queuedMeasurements, setQueuedMeasurements] = useState<
    QueuedMeasurementPayload[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [backendHealthy, setBackendHealthy] = useState<boolean | null>(null);

  const loadCatalogAndHealth = useCallback(async () => {
    try {
      const [healthRes, catalogRes] = await Promise.all([
        apiRequest<{ status: string }>('/api/health', { requiresAuth: false }),
        apiRequest<{ testTypes: TestTypeRecord[] }>('/api/test-types', {
          requiresAuth: false,
        }),
      ]);
      setBackendHealthy(healthRes.status === 'ok');
      setTestCatalog(catalogRes.testTypes);
    } catch (err) {
      setBackendHealthy(false);
      console.error('Failed to load test catalog:', err);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadCatalogAndHealth();
      if (!isAuthenticated || !activeUid) {
        setHospitals([]);
        setDevices([]);
        setPatients([]);
        setTestSessions([]);
        setCalibrations([]);
        setMeasurements([]);
        setReports([]);
        setNotifications([]);
        setAuditLogs([]);
        setQueuedMeasurements([]);
        return;
      }

      const [
        hospRes,
        devRes,
        patRes,
        sessRes,
        calRes,
        measRes,
        repRes,
        notifRes,
        auditRes,
      ] = await Promise.all([
        apiRequest<{ hospitals: HospitalRecord[] }>('/api/hospitals'),
        apiRequest<{ devices: DeviceRecord[] }>('/api/devices'),
        apiRequest<{ patients: PatientRecord[] }>('/api/patients'),
        apiRequest<{ testSessions: TestSessionRecord[] }>('/api/test-sessions'),
        apiRequest<{ calibrations: CalibrationRecord[] }>('/api/calibrations'),
        apiRequest<{ measurements: MeasurementRecord[] }>(
          '/api/measurements?limit=350',
        ),
        apiRequest<{ reports: ReportRecord[] }>('/api/reports'),
        apiRequest<{ notifications: NotificationRecord[] }>(
          '/api/notifications',
        ),
        apiRequest<{ auditLogs: AuditLogRecord[] }>('/api/audit-logs'),
      ]);

      setHospitals(hospRes.hospitals);
      setDevices(devRes.devices);
      setPatients(patRes.patients);
      setTestSessions(sessRes.testSessions);
      setCalibrations(calRes.calibrations);
      setMeasurements(measRes.measurements);
      setReports(repRes.reports);
      setNotifications(notifRes.notifications);
      setAuditLogs(auditRes.auditLogs);
      setQueuedMeasurements(getQueuedMeasurements(activeUid));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to synchronize Hema Nexus records.',
      );
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, activeUid, loadCatalogAndHealth]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const refreshMeasurementActivity = useCallback(async () => {
    if (!isAuthenticated || !activeUid) return;
    try {
      const [measRes, notifRes, auditRes] = await Promise.all([
        apiRequest<{ measurements: MeasurementRecord[] }>(
          '/api/measurements?limit=350',
        ),
        apiRequest<{ notifications: NotificationRecord[] }>(
          '/api/notifications',
        ),
        apiRequest<{ auditLogs: AuditLogRecord[] }>('/api/audit-logs'),
      ]);
      setMeasurements(measRes.measurements);
      setNotifications(notifRes.notifications);
      setAuditLogs(auditRes.auditLogs);
    } catch {
      // Fallback gracefully if incremental refresh hits a transient failure
    }
  }, [isAuthenticated, activeUid]);

  const registerHospital = useCallback(
    async (payload: {
      name: string;
      address?: string | null;
      contactEmail?: string | null;
      contactPhone?: string | null;
      registrationNumber?: string | null;
    }) => {
      const res = await apiRequest<{ hospital: HospitalRecord }>(
        '/api/hospitals',
        {
          method: 'POST',
          body: payload,
        },
      );
      await refreshAll();
      return res.hospital;
    },
    [refreshAll],
  );

  const registerDevice = useCallback(
    async (payload: {
      deviceName: string;
      deviceIdentifier: string;
      deviceModel?: string | null;
      firmwareVersion?: string | null;
      hardwareRevision?: string | null;
      connectionType?: 'ble' | 'simulated';
    }) => {
      const res = await apiRequest<{ device: DeviceRecord }>('/api/devices', {
        method: 'POST',
        body: payload,
      });
      await refreshAll();
      return res.device;
    },
    [refreshAll],
  );

  const updateDeviceStatus = useCallback(
    async (
      id: number,
      patch: {
        status?: 'connected' | 'disconnected' | 'paired';
        deviceName?: string;
        firmwareVersion?: string;
      },
    ) => {
      const res = await apiRequest<{ device: DeviceRecord }>(
        `/api/devices/${id}`,
        {
          method: 'PATCH',
          body: patch,
        },
      );
      setDevices((prev) => prev.map((d) => (d.id === id ? res.device : d)));
      return res.device;
    },
    [],
  );

  const removeDevice = useCallback(async (id: number) => {
    await apiRequest(`/api/devices/${id}`, { method: 'DELETE' });
    setDevices((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const fetchDeviceEvents = useCallback(async (deviceId: number) => {
    const res = await apiRequest<{ events: DeviceEventRecord[] }>(
      `/api/devices/${deviceId}/events`,
    );
    return res.events;
  }, []);

  const logDeviceEvent = useCallback(
    async (
      deviceId: number,
      payload: {
        eventType: DeviceEventRecord['eventType'];
        connectionMode: 'ble' | 'simulated';
        errorCode?: string | null;
        message: string;
      },
    ) => {
      try {
        await apiRequest(`/api/devices/${deviceId}/events`, {
          method: 'POST',
          body: payload,
        });
      } catch {
        // Non-blocking diagnostic event logging
      }
    },
    [],
  );

  const recordCalibration = useCallback(
    async (payload: {
      deviceId: number;
      sensorChannel: string;
      calibrationStatus: 'passed' | 'pending' | 'failed' | 'expired';
      calibrationParameters?: Record<string, unknown>;
      nextDueDate?: string | null;
      notes?: string | null;
    }) => {
      const res = await apiRequest<{ calibration: CalibrationRecord }>(
        '/api/calibrations',
        {
          method: 'POST',
          body: payload,
        },
      );
      await refreshAll();
      return res.calibration;
    },
    [refreshAll],
  );

  const registerPatient = useCallback(
    async (payload: {
      fullName: string;
      uhid?: string | null;
      dateOfBirth?: string | null;
      sex?: string | null;
      phone?: string | null;
      email?: string | null;
      address?: string | null;
      notes?: string | null;
    }) => {
      const res = await apiRequest<{ patient: PatientRecord }>('/api/patients', {
        method: 'POST',
        body: payload,
      });
      await refreshAll();
      return res.patient;
    },
    [refreshAll],
  );

  const updatePatient = useCallback(
    async (
      id: number,
      patch: {
        fullName?: string;
        dateOfBirth?: string | null;
        sex?: string | null;
        phone?: string | null;
        email?: string | null;
        address?: string | null;
        notes?: string | null;
      },
    ) => {
      const res = await apiRequest<{ patient: PatientRecord }>(
        `/api/patients/${id}`,
        {
          method: 'PATCH',
          body: patch,
        },
      );
      setPatients((prev) => prev.map((p) => (p.id === id ? res.patient : p)));
      return res.patient;
    },
    [],
  );

  const removePatient = useCallback(
    async (id: number) => {
      await apiRequest(`/api/patients/${id}`, { method: 'DELETE' });
      await refreshAll();
    },
    [refreshAll],
  );

  const createTestSession = useCallback(
    async (payload: {
      patientRecordId?: number | null;
      deviceId?: number | null;
      testMode: 'simulated' | 'real' | 'manual';
      selectedParameters: string[];
    }) => {
      const res = await apiRequest<{ testSession: TestSessionRecord }>(
        '/api/test-sessions',
        {
          method: 'POST',
          body: payload,
        },
      );
      setTestSessions((prev) => [res.testSession, ...prev]);
      return res.testSession;
    },
    [],
  );

  const updateTestSession = useCallback(
    async (
      id: number,
      patch: {
        sessionStatus?: TestSessionRecord['sessionStatus'];
        completionStatus?: TestSessionRecord['completionStatus'];
        errorDetails?: string | null;
      },
    ) => {
      const res = await apiRequest<{ testSession: TestSessionRecord }>(
        `/api/test-sessions/${id}`,
        {
          method: 'PATCH',
          body: patch,
        },
      );
      setTestSessions((prev) =>
        prev.map((s) => (s.id === id ? res.testSession : s)),
      );
      return res.testSession;
    },
    [],
  );

  const logAuditEvent = useCallback(
    async (payload: {
      action: string;
      entityType: string;
      entityId?: string | number | null;
      details?: Record<string, unknown>;
    }) => {
      if (!activeUid) return;
      try {
        await apiRequest('/api/audit-logs', {
          method: 'POST',
          body: payload,
        });
        const auditRes = await apiRequest<{ auditLogs: AuditLogRecord[] }>(
          '/api/audit-logs',
        );
        setAuditLogs(auditRes.auditLogs);
      } catch {
        // Non-blocking audit call
      }
    },
    [activeUid],
  );

  const recordMeasurement = useCallback(
    async (payload: {
      testType: string;
      measuredValue: number;
      secondaryValue?: number | null;
      measuredAt?: string;
      dataSource: DataSourceType;
      deviceId?: number | null;
      patientRecordId?: number | null;
      sessionId?: number | null;
      notes?: string | null;
      rawPacketHex?: string | null;
      explicitIdempotencyKey?: string | null;
      simulateApiFailure?: boolean;
      simulateNetworkInterruption?: boolean;
    }) => {
      if (!activeUid) {
        throw new Error('You must be signed in to save measurements.');
      }

      const idempotencyKey =
        payload.explicitIdempotencyKey || crypto.randomUUID();

      const body = {
        testType: payload.testType,
        measuredValue: payload.measuredValue,
        secondaryValue: payload.secondaryValue ?? null,
        measuredAt: payload.measuredAt || new Date().toISOString(),
        dataSource: payload.dataSource,
        deviceId: payload.deviceId ?? null,
        patientRecordId: payload.patientRecordId ?? null,
        sessionId: payload.sessionId ?? null,
        idempotencyKey,
        notes: payload.notes ?? null,
        rawPacketHex: payload.rawPacketHex ?? null,
        ...(payload.simulateApiFailure ? { simulateApiFailure: true } : {}),
      };

      if (payload.simulateNetworkInterruption) {
        enqueueMeasurement(activeUid, {
          testType: body.testType,
          measuredValue: body.measuredValue,
          secondaryValue: body.secondaryValue,
          measuredAt: body.measuredAt,
          dataSource: body.dataSource,
          deviceId: body.deviceId,
          patientRecordId: body.patientRecordId,
          sessionId: body.sessionId,
          idempotencyKey: body.idempotencyKey,
          notes: body.notes,
          rawPacketHex: body.rawPacketHex,
        });
        setQueuedMeasurements(getQueuedMeasurements(activeUid));
        await logAuditEvent({
          action: 'SIMULATED_NETWORK_INTERRUPTION',
          entityType: 'measurement',
          details: { testType: body.testType, queued: true },
        });
        return { saved: null, queued: true, deduplicated: false };
      }

      try {
        const res = await apiRequest<{
          measurement: MeasurementRecord;
          deduplicated?: boolean;
        }>('/api/measurements', {
          method: 'POST',
          body,
          retrySafe: !payload.simulateApiFailure,
        });
        await refreshMeasurementActivity();
        return {
          saved: res.measurement,
          queued: false,
          deduplicated: Boolean(res.deduplicated),
        };
      } catch (err: any) {
        if (payload.simulateApiFailure) {
          throw err;
        }
        const isTransient =
          err instanceof ApiError &&
          (err.status === 0 || err.status === 408 || err.status >= 500);
        if (isTransient) {
          enqueueMeasurement(activeUid, {
            testType: body.testType,
            measuredValue: body.measuredValue,
            secondaryValue: body.secondaryValue,
            measuredAt: body.measuredAt,
            dataSource: body.dataSource,
            deviceId: body.deviceId,
            patientRecordId: body.patientRecordId,
            sessionId: body.sessionId,
            idempotencyKey: body.idempotencyKey,
            notes: body.notes,
            rawPacketHex: body.rawPacketHex,
          });
          setQueuedMeasurements(getQueuedMeasurements(activeUid));
          return { saved: null, queued: true, deduplicated: false };
        }
        throw err;
      }
    },
    [activeUid, refreshMeasurementActivity, logAuditEvent],
  );

  const removeMeasurement = useCallback(async (id: number) => {
    await apiRequest(`/api/measurements/${id}`, { method: 'DELETE' });
    setMeasurements((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const syncQueue = useCallback(async () => {
    if (!activeUid) return { syncedCount: 0, remainingCount: 0 };
    const result = await flushQueuedMeasurements(activeUid);
    setQueuedMeasurements(result.remaining);
    if (result.synced.length > 0) {
      await refreshMeasurementActivity();
    }
    return {
      syncedCount: result.synced.length,
      remainingCount: result.remaining.length,
    };
  }, [activeUid, refreshMeasurementActivity]);

  // Automatically flush queued offline measurements when connectivity restores
  useEffect(() => {
    if (!isAuthenticated || !activeUid) return;
    const tryAutoSync = () => {
      if (
        typeof navigator !== 'undefined' &&
        navigator.onLine &&
        getQueuedMeasurements(activeUid).length > 0
      ) {
        void syncQueue().catch(() => {
          // Retain queue if backend is still unreachable
        });
      }
    };
    const handleOnline = () => tryAutoSync();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [isAuthenticated, activeUid, syncQueue]);

  const generateReport = useCallback(
    async (payload: {
      title: string;
      measurementIds: number[];
      patientRecordId?: number | null;
      sessionId?: number | null;
      summaryNotes?: string | null;
    }) => {
      const res = await apiRequest<{
        report: ReportRecord;
        measurements: MeasurementRecord[];
      }>('/api/reports', {
        method: 'POST',
        body: payload,
      });
      const [repRes, notifRes, auditRes] = await Promise.all([
        apiRequest<{ reports: ReportRecord[] }>('/api/reports'),
        apiRequest<{ notifications: NotificationRecord[] }>(
          '/api/notifications',
        ),
        apiRequest<{ auditLogs: AuditLogRecord[] }>('/api/audit-logs'),
      ]);
      setReports(repRes.reports);
      setNotifications(notifRes.notifications);
      setAuditLogs(auditRes.auditLogs);
      return res;
    },
    [],
  );

  const removeReport = useCallback(async (id: number) => {
    await apiRequest(`/api/reports/${id}`, { method: 'DELETE' });
    setReports((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const markNotificationRead = useCallback(async (id: number) => {
    await apiRequest(`/api/notifications/${id}/read`, { method: 'PATCH' });
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
    );
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    await apiRequest('/api/notifications/read-all', { method: 'POST' });
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  }, []);

  return (
    <HemaDataContext.Provider
      value={{
        testCatalog,
        hospitals,
        devices,
        patients,
        testSessions,
        calibrations,
        measurements,
        reports,
        notifications,
        auditLogs,
        queuedMeasurements,
        loading,
        error,
        backendHealthy,
        refreshAll,
        registerHospital,
        registerDevice,
        updateDeviceStatus,
        removeDevice,
        fetchDeviceEvents,
        logDeviceEvent,
        recordCalibration,
        registerPatient,
        updatePatient,
        removePatient,
        createTestSession,
        updateTestSession,
        recordMeasurement,
        removeMeasurement,
        syncQueue,
        generateReport,
        removeReport,
        markNotificationRead,
        markAllNotificationsRead,
        logAuditEvent,
      }}
    >
      {children}
    </HemaDataContext.Provider>
  );
}

export function useHemaData() {
  const ctx = useContext(HemaDataContext);
  if (!ctx) {
    throw new Error('useHemaData must be used within HemaDataProvider');
  }
  return ctx;
}
