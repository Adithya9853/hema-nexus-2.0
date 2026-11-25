import { Router, type Response } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  calibrationRecords,
  deviceEvents,
  devices,
  patients,
  testSessions,
  testTypes,
} from '../db/schema.ts';
import {
  requireAuth,
  requireRoles,
  type AuthRequest,
} from '../middleware/auth.ts';
import {
  andAll,
  appendAuditLog,
  buildUserOrHospitalScope,
  canAccessScopedRecord,
  getClientIp,
  sanitizeText,
  uniqueCode,
} from './helpers.ts';

export const sessionCalibrationRouter = Router();

// --- Test Sessions ---
sessionCalibrationRouter.get(
  '/test-sessions',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const dbUser = req.dbUser!;
      const scope = buildUserOrHospitalScope(
        testSessions.userUid,
        testSessions.hospitalId,
        dbUser,
      );
      const patientIdParam = Number(req.query.patientRecordId);
      const limit = Math.min(Math.max(Number(req.query.limit) || 60, 1), 200);

      const whereClause = andAll([
        scope,
        Number.isInteger(patientIdParam) && patientIdParam > 0
          ? eq(testSessions.patientRecordId, patientIdParam)
          : undefined,
      ]);

      const rows = await db
        .select()
        .from(testSessions)
        .where(whereClause)
        .orderBy(desc(testSessions.startedAt), desc(testSessions.id))
        .limit(limit);

      res.json({ testSessions: rows });
    } catch (error) {
      console.error('Failed to load test sessions:', error);
      res.status(500).json({ error: 'Unable to load diagnostic test sessions.' });
    }
  },
);

sessionCalibrationRouter.post(
  '/test-sessions',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const dbUser = req.dbUser!;
      const body = req.body || {};
      const rawMode = body.testMode;
      if (
        rawMode !== undefined &&
        rawMode !== 'simulated' &&
        rawMode !== 'real' &&
        rawMode !== 'manual'
      ) {
        res.status(400).json({ error: 'Invalid testMode value.' });
        return;
      }
      const testMode =
        rawMode === 'real' || rawMode === 'manual' ? rawMode : 'simulated';
      const selectedParameters = Array.isArray(body.selectedParameters)
        ? body.selectedParameters
            .filter((s: unknown): s is string => typeof s === 'string')
            .slice(0, 20)
        : [];

      let verifiedPatientId: number | null = null;
      let resolvedHospitalId: number | null = dbUser.hospitalId ?? null;

      if (
        body.patientRecordId !== null &&
        body.patientRecordId !== undefined &&
        body.patientRecordId !== ''
      ) {
        const requestedPid = Number(body.patientRecordId);
        if (!Number.isInteger(requestedPid) || requestedPid <= 0) {
          res.status(400).json({ error: 'Invalid patient record ID.' });
          return;
        }
        const [patientRow] = await db
          .select()
          .from(patients)
          .where(eq(patients.id, requestedPid))
          .limit(1);
        if (!patientRow || !canAccessScopedRecord(patientRow, dbUser)) {
          res.status(403).json({
            error: 'Patient record not authorized for this account.',
          });
          return;
        }
        verifiedPatientId = patientRow.id;
        resolvedHospitalId = patientRow.hospitalId ?? resolvedHospitalId;
      }

      let verifiedDeviceId: number | null = null;
      if (
        body.deviceId !== null &&
        body.deviceId !== undefined &&
        body.deviceId !== ''
      ) {
        const requestedDid = Number(body.deviceId);
        if (!Number.isInteger(requestedDid) || requestedDid <= 0) {
          res.status(400).json({ error: 'Invalid device ID.' });
          return;
        }
        const [deviceRow] = await db
          .select()
          .from(devices)
          .where(eq(devices.id, requestedDid))
          .limit(1);
        if (!deviceRow || !canAccessScopedRecord(deviceRow, dbUser)) {
          res.status(403).json({
            error: 'Device not authorized for this account.',
          });
          return;
        }
        if (deviceRow.connectionType === 'simulated' && testMode === 'real') {
          res.status(400).json({
            error:
              'Cannot start a real hardware test session with a simulated device.',
          });
          return;
        }
        if (deviceRow.connectionType === 'ble' && testMode === 'simulated') {
          res.status(400).json({
            error:
              'Cannot start a simulated test session linked to a BLE hardware device.',
          });
          return;
        }
        verifiedDeviceId = deviceRow.id;
      }

      const [created] = await db
        .insert(testSessions)
        .values({
          sessionCode: uniqueCode('HN-SES'),
          userUid: dbUser.uid,
          patientRecordId: verifiedPatientId,
          deviceId: verifiedDeviceId,
          hospitalId: resolvedHospitalId,
          operatorName: dbUser.fullName || dbUser.email,
          testMode,
          sessionStatus: 'in_progress',
          completionStatus: 'incomplete',
          selectedParameters,
        })
        .returning();

      await appendAuditLog({
        userUid: dbUser.uid,
        actorRole: dbUser.role,
        hospitalId: resolvedHospitalId,
        action: 'TEST_SESSION_CREATED',
        entityType: 'test_session',
        entityId: created.id,
        ipAddress: getClientIp(req),
        details: {
          sessionCode: created.sessionCode,
          testMode,
          parameterCount: selectedParameters.length,
        },
      });

      res.status(201).json({ testSession: created });
    } catch (error) {
      console.error('Failed to create test session:', error);
      res.status(500).json({ error: 'Failed to create diagnostic test session.' });
    }
  },
);

sessionCalibrationRouter.patch(
  '/test-sessions/:id',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const dbUser = req.dbUser!;
      const sessionId = Number(req.params.id);
      if (!Number.isInteger(sessionId) || sessionId <= 0) {
        res.status(400).json({ error: 'Invalid session ID.' });
        return;
      }

      const [existing] = await db
        .select()
        .from(testSessions)
        .where(eq(testSessions.id, sessionId))
        .limit(1);
      if (!existing || !canAccessScopedRecord(existing, dbUser)) {
        res.status(404).json({ error: 'Test session not found.' });
        return;
      }

      const sessionStatus =
        req.body?.sessionStatus === 'completed' ||
        req.body?.sessionStatus === 'failed' ||
        req.body?.sessionStatus === 'cancelled' ||
        req.body?.sessionStatus === 'in_progress'
          ? req.body.sessionStatus
          : undefined;

      const completionStatus =
        req.body?.completionStatus === 'complete' ||
        req.body?.completionStatus === 'partial' ||
        req.body?.completionStatus === 'incomplete'
          ? req.body.completionStatus
          : undefined;

      const errorDetails = sanitizeText(req.body?.errorDetails, 400);

      const [updated] = await db
        .update(testSessions)
        .set({
          ...(sessionStatus ? { sessionStatus } : {}),
          ...(completionStatus ? { completionStatus } : {}),
          ...(req.body?.errorDetails !== undefined ? { errorDetails } : {}),
          ...(sessionStatus === 'completed' || sessionStatus === 'failed'
            ? { completedAt: new Date() }
            : {}),
        })
        .where(eq(testSessions.id, sessionId))
        .returning();

      res.json({ testSession: updated });
    } catch (error) {
      console.error('Failed to update test session:', error);
      res.status(500).json({ error: 'Failed to update test session.' });
    }
  },
);

// --- Device Connection History & Error Logs ---
sessionCalibrationRouter.get(
  '/devices/:id/events',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const dbUser = req.dbUser!;
      const deviceId = Number(req.params.id);
      if (!Number.isInteger(deviceId) || deviceId <= 0) {
        res.status(400).json({ error: 'Invalid device ID.' });
        return;
      }

      const [deviceRow] = await db
        .select()
        .from(devices)
        .where(eq(devices.id, deviceId))
        .limit(1);
      if (!deviceRow || !canAccessScopedRecord(deviceRow, dbUser)) {
        res.status(404).json({ error: 'Device not found.' });
        return;
      }

      const rows = await db
        .select()
        .from(deviceEvents)
        .where(eq(deviceEvents.deviceId, deviceId))
        .orderBy(desc(deviceEvents.createdAt))
        .limit(60);

      res.json({ events: rows });
    } catch (error) {
      console.error('Failed to fetch device events:', error);
      res.status(500).json({ error: 'Unable to load device history.' });
    }
  },
);

sessionCalibrationRouter.post(
  '/devices/:id/events',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const dbUser = req.dbUser!;
      const deviceId = Number(req.params.id);
      if (!Number.isInteger(deviceId) || deviceId <= 0) {
        res.status(400).json({ error: 'Invalid device ID.' });
        return;
      }

      const [deviceRow] = await db
        .select()
        .from(devices)
        .where(eq(devices.id, deviceId))
        .limit(1);
      if (!deviceRow || !canAccessScopedRecord(deviceRow, dbUser)) {
        res.status(404).json({ error: 'Device not found.' });
        return;
      }

      const eventType =
        req.body?.eventType === 'connected' ||
        req.body?.eventType === 'disconnected' ||
        req.body?.eventType === 'error' ||
        req.body?.eventType === 'calibration' ||
        req.body?.eventType === 'firmware_update' ||
        req.body?.eventType === 'paired'
          ? req.body.eventType
          : 'error';
      const connectionMode =
        deviceRow.connectionType === 'simulated' ? 'simulated' : 'ble';
      const errorCode = sanitizeText(req.body?.errorCode, 40);
      const message =
        sanitizeText(req.body?.message, 280) ||
        `Device event: ${eventType}`;

      let safeMetadata: Record<string, unknown> | null = null;
      if (req.body?.metadata && typeof req.body.metadata === 'object' && !Array.isArray(req.body.metadata)) {
        const serialized = JSON.stringify(req.body.metadata);
        if (serialized.length > 4096) {
          res.status(400).json({ error: 'Device event metadata exceeds size limit.' });
          return;
        }
        safeMetadata = req.body.metadata as Record<string, unknown>;
      }

      const created = await db.transaction(async (tx) => {
        const [inserted] = await tx
          .insert(deviceEvents)
          .values({
            deviceId,
            userUid: dbUser.uid,
            eventType,
            connectionMode,
            errorCode,
            message,
            metadata: safeMetadata,
          })
          .returning();

        await tx
          .update(devices)
          .set({ lastCommunicationAt: new Date() })
          .where(eq(devices.id, deviceId));

        return inserted;
      });

      res.status(201).json({ event: created });
    } catch (error) {
      console.error('Failed to log device event:', error);
      res.status(500).json({ error: 'Failed to record device event.' });
    }
  },
);

// --- Calibration Records ---
sessionCalibrationRouter.get(
  '/calibrations',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const dbUser = req.dbUser!;
      const deviceIdParam = Number(req.query.deviceId);
      const deviceScope = buildUserOrHospitalScope(
        devices.ownerUid,
        devices.hospitalId,
        dbUser,
      );

      const accessibleDevices = await db
        .select({ id: devices.id })
        .from(devices)
        .where(deviceScope);
      const allowedDeviceIds = new Set(accessibleDevices.map((d) => d.id));

      if (
        Number.isInteger(deviceIdParam) &&
        deviceIdParam > 0 &&
        dbUser.role !== 'admin' &&
        !allowedDeviceIds.has(deviceIdParam)
      ) {
        res.status(403).json({ error: 'Not authorized for this device.' });
        return;
      }

      const rows = await db
        .select()
        .from(calibrationRecords)
        .where(
          Number.isInteger(deviceIdParam) && deviceIdParam > 0
            ? eq(calibrationRecords.deviceId, deviceIdParam)
            : undefined,
        )
        .orderBy(desc(calibrationRecords.calibrationDate))
        .limit(100);

      const filtered =
        dbUser.role === 'admin'
          ? rows
          : rows.filter((r) => allowedDeviceIds.has(r.deviceId));

      res.json({ calibrations: filtered });
    } catch (error) {
      console.error('Failed to fetch calibration records:', error);
      res.status(500).json({ error: 'Unable to load calibration records.' });
    }
  },
);

sessionCalibrationRouter.post(
  '/calibrations',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const dbUser = req.dbUser!;
      const deviceId = Number(req.body?.deviceId);
      const sensorChannel = sanitizeText(req.body?.sensorChannel, 80);
      const calibrationStatus =
        req.body?.calibrationStatus === 'pending' ||
        req.body?.calibrationStatus === 'failed' ||
        req.body?.calibrationStatus === 'expired'
          ? req.body.calibrationStatus
          : 'passed';
      const notes = sanitizeText(req.body?.notes, 300);
      const hasExplicitDueDate =
        typeof req.body?.nextDueDate === 'string' &&
        req.body.nextDueDate.trim().length > 0;
      const nextDueDate = hasExplicitDueDate
        ? new Date(req.body.nextDueDate)
        : new Date(Date.now() + 90 * 86400000);

      if (Number.isNaN(nextDueDate.getTime())) {
        res.status(400).json({ error: 'Invalid nextDueDate timestamp.' });
        return;
      }

      if (!Number.isInteger(deviceId) || deviceId <= 0 || !sensorChannel) {
        res.status(400).json({
          error: 'Valid deviceId and sensorChannel are required.',
        });
        return;
      }

      const [deviceRow] = await db
        .select()
        .from(devices)
        .where(eq(devices.id, deviceId))
        .limit(1);
      if (!deviceRow || !canAccessScopedRecord(deviceRow, dbUser)) {
        res.status(403).json({ error: 'Device not authorized for calibration.' });
        return;
      }

      const calibrationParameters =
        req.body?.calibrationParameters &&
        typeof req.body.calibrationParameters === 'object' &&
        !Array.isArray(req.body.calibrationParameters)
          ? (req.body.calibrationParameters as Record<string, unknown>)
          : { slope: 1.0, offset: 0.0 };

      const created = await db.transaction(async (tx) => {
        const [calRow] = await tx
          .insert(calibrationRecords)
          .values({
            calibrationCode: uniqueCode('HN-CAL'),
            deviceId,
            hospitalId: deviceRow.hospitalId ?? dbUser.hospitalId ?? null,
            sensorChannel,
            calibrationParameters,
            calibrationStatus,
            verifiedByUid: dbUser.uid,
            verifiedByName: dbUser.fullName || dbUser.email,
            nextDueDate,
            notes,
          })
          .returning();

        const nextDeviceCalStatus =
          calibrationStatus === 'passed'
            ? 'calibrated'
            : calibrationStatus === 'expired'
              ? 'overdue'
              : 'due';

        await tx
          .update(devices)
          .set({
            calibrationStatus: nextDeviceCalStatus,
            lastCommunicationAt: new Date(),
          })
          .where(eq(devices.id, deviceId));

        await tx.insert(deviceEvents).values({
          deviceId,
          userUid: dbUser.uid,
          eventType: 'calibration',
          connectionMode:
            deviceRow.connectionType === 'simulated' ? 'simulated' : 'ble',
          message: `Calibration ${calibrationStatus} recorded for ${sensorChannel}`,
          metadata: { calibrationCode: calRow.calibrationCode },
        });

        return calRow;
      });

      await appendAuditLog({
        userUid: dbUser.uid,
        actorRole: dbUser.role,
        hospitalId: deviceRow.hospitalId ?? dbUser.hospitalId,
        action: 'CALIBRATION_RECORDED',
        entityType: 'calibration',
        entityId: created.id,
        ipAddress: getClientIp(req),
        details: {
          deviceId,
          sensorChannel,
          calibrationStatus,
          calibrationCode: created.calibrationCode,
        },
      });

      res.status(201).json({ calibration: created });
    } catch (error) {
      console.error('Failed to record calibration:', error);
      res.status(500).json({ error: 'Failed to save calibration record.' });
    }
  },
);

// --- Configurable Clinical Reference Ranges (Clinician / Admin Only) ---
sessionCalibrationRouter.put(
  '/test-types/:slug/reference-range',
  requireAuth,
  requireRoles('clinician', 'admin'),
  async (req: AuthRequest, res: Response) => {
    try {
      const slug = sanitizeText(req.params.slug, 40);
      if (!slug) {
        res.status(400).json({ error: 'Invalid test parameter slug.' });
        return;
      }

      const [existing] = await db
        .select()
        .from(testTypes)
        .where(eq(testTypes.slug, slug))
        .limit(1);
      if (!existing) {
        res.status(404).json({ error: 'Test parameter not found.' });
        return;
      }

      const incoming = req.body?.referenceRangeConfig;
      if (!incoming || typeof incoming !== 'object') {
        res.status(400).json({ error: 'referenceRangeConfig object required.' });
        return;
      }

      const minNormal = Number(incoming.minNormal);
      const maxNormal = Number(incoming.maxNormal);
      if (
        !Number.isFinite(minNormal) ||
        !Number.isFinite(maxNormal) ||
        minNormal >= maxNormal
      ) {
        res.status(400).json({
          error: 'minNormal and maxNormal must be valid numbers with minNormal < maxNormal.',
        });
        return;
      }

      const borderlineHigh =
        incoming.borderlineHigh !== undefined && incoming.borderlineHigh !== ''
          ? Number(incoming.borderlineHigh)
          : undefined;
      const criticalHigh =
        incoming.criticalHigh !== undefined && incoming.criticalHigh !== ''
          ? Number(incoming.criticalHigh)
          : undefined;
      const borderlineLow =
        incoming.borderlineLow !== undefined && incoming.borderlineLow !== ''
          ? Number(incoming.borderlineLow)
          : undefined;
      const criticalLow =
        incoming.criticalLow !== undefined && incoming.criticalLow !== ''
          ? Number(incoming.criticalLow)
          : undefined;

      if (
        (borderlineHigh !== undefined && (!Number.isFinite(borderlineHigh) || borderlineHigh < maxNormal)) ||
        (criticalHigh !== undefined && (!Number.isFinite(criticalHigh) || criticalHigh < maxNormal)) ||
        (borderlineHigh !== undefined && criticalHigh !== undefined && criticalHigh < borderlineHigh)
      ) {
        res.status(400).json({
          error: 'High threshold ordering invalid: require maxNormal <= borderlineHigh <= criticalHigh.',
        });
        return;
      }
      if (
        (borderlineLow !== undefined && (!Number.isFinite(borderlineLow) || borderlineLow > minNormal)) ||
        (criticalLow !== undefined && (!Number.isFinite(criticalLow) || criticalLow > minNormal)) ||
        (borderlineLow !== undefined && criticalLow !== undefined && criticalLow > borderlineLow)
      ) {
        res.status(400).json({
          error: 'Low threshold ordering invalid: require criticalLow <= borderlineLow <= minNormal.',
        });
        return;
      }

      const nextConfig = {
        ...existing.referenceRangeConfig,
        minNormal,
        maxNormal,
        ...(borderlineLow !== undefined ? { borderlineLow } : {}),
        ...(borderlineHigh !== undefined ? { borderlineHigh } : {}),
        ...(criticalLow !== undefined ? { criticalLow } : {}),
        ...(criticalHigh !== undefined ? { criticalHigh } : {}),
        ...(typeof incoming.notes === 'string'
          ? { notes: incoming.notes.trim().slice(0, 300) }
          : {}),
      };

      const [updated] = await db
        .update(testTypes)
        .set({ referenceRangeConfig: nextConfig })
        .where(and(eq(testTypes.slug, slug)))
        .returning();

      await appendAuditLog({
        userUid: req.dbUser!.uid,
        actorRole: req.dbUser!.role,
        hospitalId: req.dbUser!.hospitalId,
        action: 'REFERENCE_RANGE_UPDATED',
        entityType: 'test_type',
        entityId: slug,
        ipAddress: getClientIp(req),
        details: { minNormal, maxNormal },
      });

      res.json({ testType: updated });
    } catch (error) {
      console.error('Failed to update reference range:', error);
      res.status(500).json({ error: 'Failed to update reference range.' });
    }
  },
);
