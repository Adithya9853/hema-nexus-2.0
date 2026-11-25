import { apiRequest } from '../api/client.ts';
import type { MeasurementRecord, QueuedMeasurementPayload } from '../../types/hema.ts';

// Keeps transient unsynced packets purely in JS memory for the active session
// so sensitive patient readings are never stored unencrypted in localStorage.
const pendingByUid = new Map<string, QueuedMeasurementPayload[]>();

export function getQueuedMeasurements(uid: string): QueuedMeasurementPayload[] {
  return [...(pendingByUid.get(uid) || [])];
}

export function enqueueMeasurement(
  uid: string,
  payload: Omit<QueuedMeasurementPayload, 'queuedAt' | 'attempts'>,
): QueuedMeasurementPayload {
  const item: QueuedMeasurementPayload = {
    ...payload,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  };
  const list = pendingByUid.get(uid) || [];
  pendingByUid.set(uid, [...list, item]);
  return item;
}

export function clearQueueForUser(uid: string) {
  pendingByUid.delete(uid);
}

export async function flushQueuedMeasurements(uid: string): Promise<{
  synced: MeasurementRecord[];
  remaining: QueuedMeasurementPayload[];
}> {
  const queue = pendingByUid.get(uid) || [];
  if (queue.length === 0) {
    return { synced: [], remaining: [] };
  }

  const synced: MeasurementRecord[] = [];
  const remaining: QueuedMeasurementPayload[] = [];

  for (const item of queue) {
    try {
      const response = await apiRequest<{ measurement: MeasurementRecord }>(
        '/api/measurements',
        {
          method: 'POST',
          body: {
            testType: item.testType,
            measuredValue: item.measuredValue,
            secondaryValue: item.secondaryValue,
            measuredAt: item.measuredAt,
            dataSource: item.dataSource,
            deviceId: item.deviceId,
            patientRecordId: item.patientRecordId ?? null,
            sessionId: item.sessionId ?? null,
            idempotencyKey: item.idempotencyKey,
            notes: item.notes,
            rawPacketHex: item.rawPacketHex,
          },
          retrySafe: true,
        },
      );
      synced.push(response.measurement);
    } catch (err) {
      remaining.push({
        ...item,
        attempts: item.attempts + 1,
        lastError: err instanceof Error ? err.message : 'Sync failed',
      });
    }
  }

  pendingByUid.set(uid, remaining);
  return { synced, remaining };
}
