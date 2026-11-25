import 'dotenv/config';
import crypto from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { db, pool } from './src/db/index.ts';
import {
  auditLogs,
  deviceEvents,
  devices,
  measurements,
  notifications,
  patients,
  reports,
  testSessions,
  testTypes,
  type UserPreferences,
} from './src/db/schema.ts';
import { ensureTestCatalogSeeded } from './src/db/seed.ts';
import { updateUserProfile } from './src/db/users.ts';
import { requireAuth, type AuthRequest } from './src/middleware/auth.ts';
import { createRateLimiter } from './src/middleware/rateLimit.ts';
import { adminRouter } from './src/routes/adminRoutes.ts';
import { authRouter } from './src/routes/authRoutes.ts';
import {
  andAll,
  appendAuditLog,
  buildUserOrHospitalScope,
  canAccessScopedRecord,
  getClientIp,
  sanitizeText,
} from './src/routes/helpers.ts';
import { hospitalRouter } from './src/routes/hospitalRoutes.ts';
import { sessionCalibrationRouter } from './src/routes/sessionAndCalibrationRoutes.ts';
import {
  classifyMeasurementStatus,
  getPhysiologicalBounds,
} from './src/utils/clinicalValidation.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

const apiRateLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 180,
  keyPrefix: 'api',
  message: 'API rate limit exceeded. Please slow down and try again shortly.',
  skip: (req) =>
    req.path === '/health' ||
    req.path === '/auth/login' ||
    req.path === '/auth/register',
});

app.use('/api', apiRateLimiter);

// --- Health & Public Catalog ---
app.get('/api/health', async (_req: Request, res: Response) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'degraded',
      database: 'unavailable',
      timestamp: new Date().toISOString(),
    });
  }
});

app.get('/api/test-types', async (_req: Request, res: Response) => {
  try {
    await ensureTestCatalogSeeded();
    const rows = await db
      .select()
      .from(testTypes)
      .orderBy(asc(testTypes.portNumber), asc(testTypes.id));
    res.json({ testTypes: rows });
  } catch (error) {
    console.error('Failed to fetch test types:', error);
    res.status(500).json({ error: 'Unable to load test catalog right now.' });
  }
});

// --- Modular Auth, Hospital, Session/Calibration, and Admin Routers ---
app.use('/api/auth', authRouter);
app.use('/api/hospitals', hospitalRouter);
app.use('/api', sessionCalibrationRouter);
app.use('/api/admin', adminRouter);

// --- Authenticated Profile ---
app.get('/api/profile', requireAuth, async (req: AuthRequest, res: Response) => {
  res.json({ profile: req.dbUser });
});

app.put('/api/profile', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const body = req.body || {};

    const fullName =
      body.fullName === null || body.fullName === ''
        ? null
        : sanitizeText(body.fullName, 120);
    const phone =
      body.phone === null || body.phone === ''
        ? null
        : sanitizeText(body.phone, 40);

    let dateOfBirth: string | null | undefined = undefined;
    if (body.dateOfBirth === null || body.dateOfBirth === '') {
      dateOfBirth = null;
    } else if (typeof body.dateOfBirth === 'string') {
      const dob = body.dateOfBirth.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
        res
          .status(400)
          .json({ error: 'Date of birth must use YYYY-MM-DD format.' });
        return;
      }
      dateOfBirth = dob;
    }

    let preferences: UserPreferences | undefined = undefined;
    if (body.preferences && typeof body.preferences === 'object') {
      const current = req.dbUser!.preferences;
      const incoming = body.preferences;
      preferences = {
        theme:
          incoming.theme === 'dark' ||
          incoming.theme === 'light' ||
          incoming.theme === 'system'
            ? incoming.theme
            : current.theme,
        unitSystem:
          incoming.unitSystem === 'si' ||
          incoming.unitSystem === 'conventional'
            ? incoming.unitSystem
            : current.unitSystem,
        notificationsEnabled:
          typeof incoming.notificationsEnabled === 'boolean'
            ? incoming.notificationsEnabled
            : current.notificationsEnabled,
        deviceAlertsEnabled:
          typeof incoming.deviceAlertsEnabled === 'boolean'
            ? incoming.deviceAlertsEnabled
            : current.deviceAlertsEnabled,
        autoSyncBle:
          typeof incoming.autoSyncBle === 'boolean'
            ? incoming.autoSyncBle
            : current.autoSyncBle,
        shareQrIncludeEmergencyInfo:
          typeof incoming.shareQrIncludeEmergencyInfo === 'boolean'
            ? incoming.shareQrIncludeEmergencyInfo
            : current.shareQrIncludeEmergencyInfo,
      };
    }

    const updated = await updateUserProfile(uid, {
      ...(body.fullName !== undefined ? { fullName } : {}),
      ...(body.phone !== undefined ? { phone } : {}),
      ...(dateOfBirth !== undefined ? { dateOfBirth } : {}),
      ...(preferences !== undefined ? { preferences } : {}),
    });

    res.json({ profile: updated });
  } catch (error) {
    console.error('Failed to update profile:', error);
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});

// --- Devices & Device Lifecycle ---
app.get('/api/devices', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const dbUser = req.dbUser!;
    const scope = buildUserOrHospitalScope(
      devices.ownerUid,
      devices.hospitalId,
      dbUser,
    );
    const rows = await db
      .select()
      .from(devices)
      .where(scope)
      .orderBy(desc(devices.lastConnectedAt), desc(devices.createdAt));
    res.json({ devices: rows });
  } catch (error) {
    console.error('Failed to fetch devices:', error);
    res.status(500).json({ error: 'Failed to load paired devices.' });
  }
});

app.post('/api/devices', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const dbUser = req.dbUser!;
    const uid = dbUser.uid;
    const deviceName = sanitizeText(req.body?.deviceName, 80);
    const deviceIdentifier = sanitizeText(req.body?.deviceIdentifier, 120);
    const deviceModel =
      sanitizeText(req.body?.deviceModel, 80) || 'Hema Nexus Multi-Port v1';
    const firmwareVersion = sanitizeText(req.body?.firmwareVersion, 40);
    const hardwareRevision = sanitizeText(req.body?.hardwareRevision, 40);
    const connectionType =
      req.body?.connectionType === 'simulated' ? 'simulated' : 'ble';
    const sensorChannels = Array.isArray(req.body?.sensorChannels)
      ? req.body.sensorChannels.filter(
          (c: unknown): c is string => typeof c === 'string',
        )
      : [
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
        ];

    if (!deviceName || !deviceIdentifier) {
      res
        .status(400)
        .json({ error: 'Device name and identifier are required.' });
      return;
    }

    if (
      connectionType === 'ble' &&
      deviceIdentifier.toUpperCase().startsWith('SIM-')
    ) {
      res.status(400).json({
        error:
          'Simulated device identifiers (SIM-*) cannot be registered as physical BLE hardware.',
      });
      return;
    }

    const existing = await db
      .select()
      .from(devices)
      .where(
        and(
          eq(devices.ownerUid, uid),
          eq(devices.deviceIdentifier, deviceIdentifier),
        ),
      )
      .limit(1);

    const now = new Date();

    if (existing.length > 0) {
      if (existing[0].connectionType !== connectionType) {
        res.status(409).json({
          error:
            'This device identifier is already registered with a different transport mode.',
        });
        return;
      }

      const updated = await db.transaction(async (tx) => {
        const rows = await tx
          .update(devices)
          .set({
            deviceName,
            deviceModel,
            firmwareVersion: firmwareVersion ?? existing[0].firmwareVersion,
            hardwareRevision: hardwareRevision ?? existing[0].hardwareRevision,
            status: 'connected',
            lastConnectedAt: now,
            lastCommunicationAt: now,
          })
          .where(eq(devices.id, existing[0].id))
          .returning();

        await tx.insert(deviceEvents).values({
          deviceId: rows[0].id,
          userUid: uid,
          eventType: 'connected',
          connectionMode: connectionType,
          message: `${deviceName} reconnected via ${connectionType.toUpperCase()}`,
        });

        return rows;
      });

      res.json({ device: updated[0], reconnected: true });
      return;
    }

    const inserted = await db.transaction(async (tx) => {
      const rows = await tx
        .insert(devices)
        .values({
          ownerUid: uid,
          hospitalId: dbUser.hospitalId ?? null,
          deviceName,
          deviceIdentifier,
          deviceModel,
          firmwareVersion,
          hardwareRevision,
          connectionType,
          status: 'connected',
          calibrationStatus:
            connectionType === 'simulated' ? 'calibrated' : 'uncalibrated',
          sensorChannels,
          lastConnectedAt: now,
          lastCommunicationAt: now,
        })
        .returning();

      await tx.insert(deviceEvents).values({
        deviceId: rows[0].id,
        userUid: uid,
        eventType: 'paired',
        connectionMode: connectionType,
        message: `${deviceName} (${deviceIdentifier}) registered (${connectionType})`,
      });

      await tx.insert(notifications).values({
        userUid: uid,
        title:
          connectionType === 'simulated'
            ? 'Simulated Device Connected'
            : 'Device Paired',
        message: `${deviceName} (${deviceIdentifier}) has been registered to your Hema Nexus profile.`,
        category: 'device',
      });

      return rows;
    });

    await appendAuditLog({
      userUid: uid,
      actorRole: dbUser.role,
      hospitalId: dbUser.hospitalId,
      action:
        connectionType === 'simulated'
          ? 'SIMULATED_DEVICE_REGISTERED'
          : 'BLE_DEVICE_PAIRED',
      entityType: 'device',
      entityId: inserted[0].id,
      ipAddress: getClientIp(req),
      details: { deviceName, deviceIdentifier, connectionType },
    });

    res.status(201).json({ device: inserted[0], reconnected: false });
  } catch (error) {
    console.error('Failed to register device:', error);
    res.status(500).json({ error: 'Failed to register device.' });
  }
});

app.patch('/api/devices/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const dbUser = req.dbUser!;
    const deviceId = Number(req.params.id);
    if (!Number.isInteger(deviceId) || deviceId <= 0) {
      res.status(400).json({ error: 'Invalid device ID.' });
      return;
    }

    const [existing] = await db
      .select()
      .from(devices)
      .where(eq(devices.id, deviceId))
      .limit(1);

    if (!existing || !canAccessScopedRecord(existing, dbUser)) {
      res.status(404).json({ error: 'Device not found.' });
      return;
    }

    const status =
      req.body?.status === 'connected' ||
      req.body?.status === 'disconnected' ||
      req.body?.status === 'paired'
        ? req.body.status
        : undefined;
    const deviceName = sanitizeText(req.body?.deviceName, 80);
    const firmwareVersion = sanitizeText(req.body?.firmwareVersion, 40);
    const hardwareRevision = sanitizeText(req.body?.hardwareRevision, 40);
    const now = new Date();

    const updated = await db
      .update(devices)
      .set({
        ...(status ? { status } : {}),
        ...(deviceName ? { deviceName } : {}),
        ...(firmwareVersion ? { firmwareVersion } : {}),
        ...(hardwareRevision ? { hardwareRevision } : {}),
        ...(status === 'connected'
          ? { lastConnectedAt: now, lastCommunicationAt: now }
          : status === 'disconnected'
            ? { lastCommunicationAt: now }
            : {}),
      })
      .where(eq(devices.id, deviceId))
      .returning();

    if (status === 'connected' || status === 'disconnected') {
      await db.insert(deviceEvents).values({
        deviceId,
        userUid: dbUser.uid,
        eventType: status,
        connectionMode:
          existing.connectionType === 'simulated' ? 'simulated' : 'ble',
        message: `${updated[0].deviceName} ${status}`,
      });
    }

    res.json({ device: updated[0] });
  } catch (error) {
    console.error('Failed to update device:', error);
    res.status(500).json({ error: 'Failed to update device.' });
  }
});

app.delete('/api/devices/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const dbUser = req.dbUser!;
    const deviceId = Number(req.params.id);
    if (!Number.isInteger(deviceId) || deviceId <= 0) {
      res.status(400).json({ error: 'Invalid device ID.' });
      return;
    }

    const [existing] = await db
      .select()
      .from(devices)
      .where(eq(devices.id, deviceId))
      .limit(1);
    if (!existing || !canAccessScopedRecord(existing, dbUser)) {
      res.status(404).json({ error: 'Device not found.' });
      return;
    }

    await db.delete(devices).where(eq(devices.id, deviceId));
    res.json({ deletedId: deviceId });
  } catch (error) {
    console.error('Failed to delete device:', error);
    res.status(500).json({ error: 'Failed to remove device.' });
  }
});

// --- Measurements (Test Results) ---
app.get('/api/measurements', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const dbUser = req.dbUser!;
    const testType = sanitizeText(req.query.testType, 40);
    const dataSource = sanitizeText(req.query.dataSource, 40);
    const patientRecordIdParam = Number(req.query.patientRecordId);
    const sessionIdParam = Number(req.query.sessionId);
    const isSimulatedParam = sanitizeText(req.query.isSimulated, 10);
    const fromParam = sanitizeText(req.query.from, 40);
    const toParam = sanitizeText(req.query.to, 40);
    const limitParam = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const offsetParam = Math.max(Number(req.query.offset) || 0, 0);

    const conditions = [
      buildUserOrHospitalScope(
        measurements.userUid,
        measurements.hospitalId,
        dbUser,
      ),
    ];
    if (testType && testType !== 'all') {
      conditions.push(eq(measurements.testType, testType));
    }
    if (dataSource && dataSource !== 'all') {
      conditions.push(eq(measurements.dataSource, dataSource));
    }
    if (Number.isInteger(patientRecordIdParam) && patientRecordIdParam > 0) {
      conditions.push(eq(measurements.patientRecordId, patientRecordIdParam));
    }
    if (Number.isInteger(sessionIdParam) && sessionIdParam > 0) {
      conditions.push(eq(measurements.sessionId, sessionIdParam));
    }
    if (isSimulatedParam === 'true') {
      conditions.push(eq(measurements.isSimulated, true));
    } else if (isSimulatedParam === 'false') {
      conditions.push(eq(measurements.isSimulated, false));
    }
    if (fromParam) {
      const fromDate = new Date(fromParam);
      if (!Number.isNaN(fromDate.getTime())) {
        conditions.push(gte(measurements.measuredAt, fromDate));
      }
    }
    if (toParam) {
      const toDate = new Date(toParam);
      if (!Number.isNaN(toDate.getTime())) {
        conditions.push(lte(measurements.measuredAt, toDate));
      }
    }

    const whereClause = andAll(conditions);

    const [items, countRows] = await Promise.all([
      db
        .select()
        .from(measurements)
        .where(whereClause)
        .orderBy(desc(measurements.measuredAt), desc(measurements.id))
        .limit(limitParam)
        .offset(offsetParam),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(measurements)
        .where(whereClause),
    ]);

    res.json({
      measurements: items,
      total: countRows[0]?.count ?? items.length,
    });
  } catch (error) {
    console.error('Failed to fetch measurements:', error);
    res.status(500).json({ error: 'Failed to load measurement history.' });
  }
});

app.post('/api/measurements', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await ensureTestCatalogSeeded();
    const dbUser = req.dbUser!;
    const uid = dbUser.uid;
    const body = req.body || {};

    const testTypeSlug = sanitizeText(body.testType, 40);
    const measuredValue = Number(body.measuredValue);
    const secondaryValue =
      body.secondaryValue !== null &&
      body.secondaryValue !== undefined &&
      body.secondaryValue !== ''
        ? Number(body.secondaryValue)
        : null;
    const dataSource =
      body.dataSource === 'ble_device' ||
      body.dataSource === 'manual_entry' ||
      body.dataSource === 'simulated_device'
        ? body.dataSource
        : null;
    const isSimulated = dataSource === 'simulated_device';
    const idempotencyKey = sanitizeText(body.idempotencyKey, 128);
    const notes = sanitizeText(body.notes, 400);
    const rawPacketHex = sanitizeText(body.rawPacketHex, 256);

    if (rawPacketHex && !/^[0-9a-fA-F]{2,256}$/.test(rawPacketHex)) {
      res.status(400).json({ error: 'Invalid raw packet hexadecimal format.' });
      return;
    }

    if (isSimulated && body.simulateApiFailure === true) {
      await appendAuditLog({
        userUid: uid,
        actorRole: dbUser.role,
        hospitalId: dbUser.hospitalId,
        action: 'SIMULATED_API_FAILURE',
        entityType: 'measurement',
        ipAddress: getClientIp(req),
        details: { testType: testTypeSlug, status: 503 },
      });
      res.status(503).json({
        error:
          'Simulated API failure (HTTP 503): backend storage temporarily unavailable for testing.',
      });
      return;
    }

    if (!testTypeSlug || !dataSource) {
      res.status(400).json({
        error: 'Test type and valid data source are required.',
      });
      return;
    }

    if (!Number.isFinite(measuredValue)) {
      res.status(400).json({ error: 'Measured value must be a valid number.' });
      return;
    }

    if (secondaryValue !== null && !Number.isFinite(secondaryValue)) {
      res.status(400).json({ error: 'Secondary value must be a valid number.' });
      return;
    }

    const bounds = getPhysiologicalBounds(testTypeSlug);
    if (measuredValue < bounds.min || measuredValue > bounds.max) {
      res.status(400).json({
        error: `Measured value must be between ${bounds.min} and ${bounds.max}.`,
      });
      return;
    }
    if (
      secondaryValue !== null &&
      bounds.secondaryMin !== undefined &&
      bounds.secondaryMax !== undefined &&
      (secondaryValue < bounds.secondaryMin ||
        secondaryValue > bounds.secondaryMax)
    ) {
      res.status(400).json({
        error: `Secondary value must be between ${bounds.secondaryMin} and ${bounds.secondaryMax}.`,
      });
      return;
    }

    const testRows = await db
      .select()
      .from(testTypes)
      .where(eq(testTypes.slug, testTypeSlug))
      .limit(1);

    if (testRows.length === 0) {
      res.status(400).json({ error: 'Unsupported test type.' });
      return;
    }
    const testMeta = testRows[0];

    let verifiedDeviceRow: typeof devices.$inferSelect | null = null;
    if (body.deviceId !== null && body.deviceId !== undefined && body.deviceId !== '') {
      const requestedDeviceId = Number(body.deviceId);
      if (!Number.isInteger(requestedDeviceId) || requestedDeviceId <= 0) {
        res.status(400).json({ error: 'Invalid device ID.' });
        return;
      }
      const [ownedDevice] = await db
        .select()
        .from(devices)
        .where(eq(devices.id, requestedDeviceId))
        .limit(1);
      if (!ownedDevice || !canAccessScopedRecord(ownedDevice, dbUser)) {
        res.status(403).json({ error: 'Device not authorized for this account.' });
        return;
      }
      verifiedDeviceRow = ownedDevice;
    }
    const verifiedDeviceId = verifiedDeviceRow?.id ?? null;

    let verifiedPatientRecordId: number | null = null;
    let resolvedHospitalId: number | null = dbUser.hospitalId ?? null;
    if (
      body.patientRecordId !== null &&
      body.patientRecordId !== undefined &&
      body.patientRecordId !== ''
    ) {
      const requestedPatientId = Number(body.patientRecordId);
      if (!Number.isInteger(requestedPatientId) || requestedPatientId <= 0) {
        res.status(400).json({ error: 'Invalid patient record ID.' });
        return;
      }
      const [ownedPatient] = await db
        .select()
        .from(patients)
        .where(eq(patients.id, requestedPatientId))
        .limit(1);
      if (!ownedPatient || !canAccessScopedRecord(ownedPatient, dbUser)) {
        res
          .status(403)
          .json({ error: 'Patient record not authorized for this account.' });
        return;
      }
      verifiedPatientRecordId = ownedPatient.id;
      resolvedHospitalId = ownedPatient.hospitalId ?? resolvedHospitalId;
    }

    let verifiedSessionRow: typeof testSessions.$inferSelect | null = null;
    if (
      body.sessionId !== null &&
      body.sessionId !== undefined &&
      body.sessionId !== ''
    ) {
      const requestedSessionId = Number(body.sessionId);
      if (!Number.isInteger(requestedSessionId) || requestedSessionId <= 0) {
        res.status(400).json({ error: 'Invalid session ID.' });
        return;
      }
      const [ownedSession] = await db
        .select()
        .from(testSessions)
        .where(eq(testSessions.id, requestedSessionId))
        .limit(1);
      if (!ownedSession || !canAccessScopedRecord(ownedSession, dbUser)) {
        res.status(403).json({ error: 'Test session not authorized.' });
        return;
      }
      verifiedSessionRow = ownedSession;
    }
    const verifiedSessionId = verifiedSessionRow?.id ?? null;

    // Enforce strict server-side provenance between BLE hardware, simulated devices, and sessions
    if (dataSource === 'ble_device') {
      if (!verifiedDeviceRow) {
        res.status(400).json({
          error:
            'A paired BLE hardware deviceId is required when submitting BLE device measurements.',
        });
        return;
      }
      if (
        verifiedDeviceRow.connectionType !== 'ble' ||
        verifiedDeviceRow.deviceIdentifier.toUpperCase().startsWith('SIM-')
      ) {
        res.status(400).json({
          error:
            'Simulated devices cannot submit measurements marked as real BLE hardware.',
        });
        return;
      }
      if (verifiedSessionRow?.testMode === 'simulated') {
        res.status(400).json({
          error:
            'Simulated test sessions cannot store measurements as real BLE hardware.',
        });
        return;
      }
      if (
        testMeta.availabilityStatus === 'coming_soon' ||
        testMeta.availabilityStatus === 'unavailable'
      ) {
        res.status(400).json({
          error:
            'This channel is not validated for live BLE device telemetry yet.',
        });
        return;
      }
    }

    if (
      (verifiedDeviceRow?.connectionType === 'simulated' ||
        verifiedSessionRow?.testMode === 'simulated') &&
      dataSource !== 'simulated_device'
    ) {
      res.status(400).json({
        error:
          'Simulated devices and simulated test sessions must use dataSource = simulated_device.',
      });
      return;
    }

    const measuredAt = body.measuredAt ? new Date(body.measuredAt) : new Date();
    if (Number.isNaN(measuredAt.getTime())) {
      res.status(400).json({ error: 'Invalid measurement timestamp.' });
      return;
    }

    if (idempotencyKey) {
      const existing = await db
        .select()
        .from(measurements)
        .where(
          and(
            eq(measurements.userUid, uid),
            eq(measurements.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1);
      if (existing.length > 0) {
        res.status(200).json({ measurement: existing[0], deduplicated: true });
        return;
      }
    }

    const status = classifyMeasurementStatus(
      measuredValue,
      secondaryValue,
      testMeta.referenceRangeConfig,
    );
    const validationStatus =
      status === 'normal' ? 'validated' : 'flagged';

    let saved: typeof measurements.$inferSelect;
    try {
      saved = await db.transaction(async (tx) => {
        const [insertedRow] = await tx
          .insert(measurements)
          .values({
            userUid: uid,
            deviceId: verifiedDeviceId,
            patientRecordId: verifiedPatientRecordId,
            sessionId: verifiedSessionId,
            hospitalId: resolvedHospitalId,
            testType: testMeta.slug,
            testName: testMeta.testName,
            measuredValue,
            secondaryValue,
            unit: testMeta.unit,
            measuredAt,
            status,
            dataSource,
            isSimulated,
            validationStatus,
            referenceRangeSnapshot: testMeta.referenceRangeConfig,
            idempotencyKey,
            notes,
            rawPacketHex,
          })
          .returning();

        if (verifiedDeviceId) {
          await tx
            .update(devices)
            .set({ lastCommunicationAt: new Date() })
            .where(eq(devices.id, verifiedDeviceId));
        }

        if (status === 'elevated' || status === 'critical' || status === 'low') {
          await tx.insert(notifications).values({
            userUid: uid,
            title: `${isSimulated ? '[SIMULATED] ' : ''}${testMeta.testName} Outside Normal Range`,
            message: `Recorded ${measuredValue}${secondaryValue !== null ? `/${secondaryValue}` : ''} ${testMeta.unit} (${status})${isSimulated ? ' [Simulated Test Data]' : ''}. Review clinical reference ranges or consult a clinician if symptomatic.`,
            category: 'measurement',
          });
        }

        return insertedRow;
      });
    } catch (insertErr: any) {
      // Handle concurrent idempotent submission race gracefully via unique index
      if (idempotencyKey && insertErr?.code === '23505') {
        const existing = await db
          .select()
          .from(measurements)
          .where(
            and(
              eq(measurements.userUid, uid),
              eq(measurements.idempotencyKey, idempotencyKey),
            ),
          )
          .limit(1);
        if (existing.length > 0) {
          res.status(200).json({ measurement: existing[0], deduplicated: true });
          return;
        }
      }
      throw insertErr;
    }

    await appendAuditLog({
      userUid: uid,
      actorRole: dbUser.role,
      hospitalId: resolvedHospitalId,
      action: isSimulated ? 'SIMULATED_MEASUREMENT_SAVED' : 'MEASUREMENT_SAVED',
      entityType: 'measurement',
      entityId: saved.id,
      ipAddress: getClientIp(req),
      details: {
        testType: saved.testType,
        measuredValue: saved.measuredValue,
        secondaryValue: saved.secondaryValue,
        status: saved.status,
        dataSource: saved.dataSource,
        patientRecordId: verifiedPatientRecordId,
        sessionId: verifiedSessionId,
      },
    });

    res.status(201).json({ measurement: saved, deduplicated: false });
  } catch (error) {
    console.error('Failed to save measurement:', error);
    res.status(500).json({ error: 'Failed to save measurement record.' });
  }
});

app.delete(
  '/api/measurements/:id',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const dbUser = req.dbUser!;
      const measurementId = Number(req.params.id);
      if (!Number.isInteger(measurementId) || measurementId <= 0) {
        res.status(400).json({ error: 'Invalid measurement ID.' });
        return;
      }

      const [existing] = await db
        .select()
        .from(measurements)
        .where(eq(measurements.id, measurementId))
        .limit(1);
      if (!existing || !canAccessScopedRecord(existing, dbUser)) {
        res.status(404).json({ error: 'Measurement record not found.' });
        return;
      }

      await db.delete(measurements).where(eq(measurements.id, measurementId));
      res.json({ deletedId: measurementId });
    } catch (error) {
      console.error('Failed to delete measurement:', error);
      res.status(500).json({ error: 'Failed to delete measurement record.' });
    }
  },
);

// --- Reports ---
app.get('/api/reports', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const dbUser = req.dbUser!;
    const scope = buildUserOrHospitalScope(
      reports.userUid,
      reports.hospitalId,
      dbUser,
    );
    const rows = await db
      .select()
      .from(reports)
      .where(scope)
      .orderBy(desc(reports.generatedAt));
    res.json({ reports: rows });
  } catch (error) {
    console.error('Failed to load reports:', error);
    res.status(500).json({ error: 'Failed to load health reports.' });
  }
});

app.post('/api/reports', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const dbUser = req.dbUser!;
    const uid = dbUser.uid;
    const title =
      sanitizeText(req.body?.title, 120) || 'Hema Nexus Clinical Summary Report';
    const summaryNotes = sanitizeText(req.body?.summaryNotes, 500);
    if (!Array.isArray(req.body?.measurementIds) || req.body.measurementIds.length === 0) {
      res
        .status(400)
        .json({ error: 'Select at least one measurement to generate a report.' });
      return;
    }

    if (req.body.measurementIds.length > 250) {
      res
        .status(400)
        .json({ error: 'A single report can include up to 250 measurements.' });
      return;
    }

    const parsedIds = req.body.measurementIds.map((id: unknown) => Number(id));
    if (parsedIds.some((id: number) => !Number.isInteger(id) || id <= 0)) {
      res.status(400).json({ error: 'All measurementIds must be valid positive integers.' });
      return;
    }
    const uniqueIds = Array.from(new Set<number>(parsedIds));

    const measScope = buildUserOrHospitalScope(
      measurements.userUid,
      measurements.hospitalId,
      dbUser,
    );
    const ownedMeasurements = await db
      .select()
      .from(measurements)
      .where(and(measScope, inArray(measurements.id, uniqueIds)))
      .orderBy(desc(measurements.measuredAt));

    if (ownedMeasurements.length !== uniqueIds.length) {
      res.status(403).json({
        error:
          'One or more selected measurements do not exist or are not authorized for this account.',
      });
      return;
    }

    let deviceSnapshot: {
      deviceName: string;
      deviceIdentifier: string;
      firmwareVersion?: string | null;
      isSimulated?: boolean;
    } | null = null;

    const includesSimulatedData = ownedMeasurements.some(
      (m) => m.isSimulated || m.dataSource === 'simulated_device',
    );

    let verifiedPatientRecordId: number | null = null;
    let resolvedHospitalId: number | null = dbUser.hospitalId ?? null;
    let reportPatientName = dbUser.fullName || dbUser.email;
    let reportPatientId = dbUser.patientCode;

    if (
      req.body?.patientRecordId !== null &&
      req.body?.patientRecordId !== undefined &&
      req.body?.patientRecordId !== ''
    ) {
      const requestedPatientId = Number(req.body.patientRecordId);
      if (!Number.isInteger(requestedPatientId) || requestedPatientId <= 0) {
        res.status(400).json({ error: 'Invalid patientRecordId.' });
        return;
      }
      const [patientRow] = await db
        .select()
        .from(patients)
        .where(eq(patients.id, requestedPatientId))
        .limit(1);
      if (!patientRow || !canAccessScopedRecord(patientRow, dbUser)) {
        res.status(403).json({
          error: 'Selected patient is not authorized for this account.',
        });
        return;
      }
      verifiedPatientRecordId = patientRow.id;
      resolvedHospitalId = patientRow.hospitalId ?? resolvedHospitalId;
      reportPatientName = patientRow.fullName;
      reportPatientId = patientRow.uhid;
    }

    let verifiedSessionId: number | null = null;
    if (
      req.body?.sessionId !== null &&
      req.body?.sessionId !== undefined &&
      req.body?.sessionId !== ''
    ) {
      const requestedSessionId = Number(req.body.sessionId);
      if (!Number.isInteger(requestedSessionId) || requestedSessionId <= 0) {
        res.status(400).json({ error: 'Invalid sessionId.' });
        return;
      }
      const [sessRow] = await db
        .select()
        .from(testSessions)
        .where(eq(testSessions.id, requestedSessionId))
        .limit(1);
      if (!sessRow || !canAccessScopedRecord(sessRow, dbUser)) {
        res.status(403).json({
          error: 'Selected test session is not authorized for this account.',
        });
        return;
      }
      verifiedSessionId = sessRow.id;
    } else {
      verifiedSessionId =
        ownedMeasurements.find((m) => m.sessionId !== null)?.sessionId ?? null;
    }

    const latestWithDevice = ownedMeasurements.find((m) => m.deviceId !== null);
    if (latestWithDevice?.deviceId) {
      const [devRow] = await db
        .select()
        .from(devices)
        .where(eq(devices.id, latestWithDevice.deviceId))
        .limit(1);
      if (devRow && canAccessScopedRecord(devRow, dbUser)) {
        deviceSnapshot = {
          deviceName: devRow.deviceName,
          deviceIdentifier: devRow.deviceIdentifier,
          firmwareVersion: devRow.firmwareVersion,
          isSimulated: devRow.connectionType === 'simulated',
        };
      }
    } else if (includesSimulatedData) {
      deviceSnapshot = {
        deviceName: 'Hema Nexus Simulator (ESP32-SIM)',
        deviceIdentifier: 'SIM-HN-DEV-001',
        firmwareVersion: 'SIM-FW-0.9.4-TEST',
        isSimulated: true,
      };
    }

    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    const reportCode = `HN-${datePart}-${suffix}`;
    const reportFileLocation = `client-pdf://${reportCode}.pdf`;
    const verificationStatus = includesSimulatedData
      ? 'simulated_only'
      : 'verified';

    const inserted = await db.transaction(async (tx) => {
      const rows = await tx
        .insert(reports)
        .values({
          userUid: uid,
          patientRecordId: verifiedPatientRecordId,
          sessionId: verifiedSessionId,
          hospitalId: resolvedHospitalId,
          reportCode,
          title,
          patientName: reportPatientName,
          patientId: reportPatientId,
          measurementIds: ownedMeasurements.map((m) => m.id),
          includesSimulatedData,
          reportFileLocation,
          verificationStatus,
          generatedByUid: uid,
          generatedByName: dbUser.fullName || dbUser.email,
          summaryNotes,
          deviceSnapshot,
        })
        .returning();

      await tx.insert(notifications).values({
        userUid: uid,
        title: includesSimulatedData
          ? '[SIMULATED] Health Report Generated'
          : 'Health Report Generated',
        message: `${title} (${reportCode}) for ${reportPatientName} is ready for preview and PDF download.`,
        category: 'report',
      });

      return rows;
    });

    await appendAuditLog({
      userUid: uid,
      actorRole: dbUser.role,
      hospitalId: resolvedHospitalId,
      action: 'REPORT_GENERATED',
      entityType: 'report',
      entityId: inserted[0].id,
      ipAddress: getClientIp(req),
      details: {
        reportCode,
        patientId: reportPatientId,
        includesSimulatedData,
        measurementCount: ownedMeasurements.length,
      },
    });

    res.status(201).json({
      report: inserted[0],
      measurements: ownedMeasurements,
    });
  } catch (error) {
    console.error('Failed to generate report:', error);
    res.status(500).json({ error: 'Failed to generate health report.' });
  }
});

app.get('/api/reports/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const dbUser = req.dbUser!;
    const reportId = Number(req.params.id);
    if (!Number.isInteger(reportId) || reportId <= 0) {
      res.status(400).json({ error: 'Invalid report ID.' });
      return;
    }

    const [report] = await db
      .select()
      .from(reports)
      .where(eq(reports.id, reportId))
      .limit(1);

    if (!report || !canAccessScopedRecord(report, dbUser)) {
      res.status(404).json({ error: 'Report not found.' });
      return;
    }

    const measScope = buildUserOrHospitalScope(
      measurements.userUid,
      measurements.hospitalId,
      dbUser,
    );
    const reportMeasurements =
      report.measurementIds.length > 0
        ? await db
            .select()
            .from(measurements)
            .where(and(measScope, inArray(measurements.id, report.measurementIds)))
            .orderBy(desc(measurements.measuredAt))
        : [];

    res.json({ report, measurements: reportMeasurements });
  } catch (error) {
    console.error('Failed to load report:', error);
    res.status(500).json({ error: 'Failed to load report.' });
  }
});

app.delete('/api/reports/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const dbUser = req.dbUser!;
    const reportId = Number(req.params.id);
    if (!Number.isInteger(reportId) || reportId <= 0) {
      res.status(400).json({ error: 'Invalid report ID.' });
      return;
    }

    const [existing] = await db
      .select()
      .from(reports)
      .where(eq(reports.id, reportId))
      .limit(1);
    if (!existing || !canAccessScopedRecord(existing, dbUser)) {
      res.status(404).json({ error: 'Report not found.' });
      return;
    }

    await db.delete(reports).where(eq(reports.id, reportId));
    res.json({ deletedId: reportId });
  } catch (error) {
    console.error('Failed to delete report:', error);
    res.status(500).json({ error: 'Failed to delete report.' });
  }
});

// --- Notifications ---
app.get('/api/notifications', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userUid, uid))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
    res.json({ notifications: rows });
  } catch (error) {
    console.error('Failed to fetch notifications:', error);
    res.status(500).json({ error: 'Failed to load notifications.' });
  }
});

app.patch(
  '/api/notifications/:id/read',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.user!.uid;
      const notificationId = Number(req.params.id);
      if (!Number.isInteger(notificationId) || notificationId <= 0) {
        res.status(400).json({ error: 'Invalid notification ID.' });
        return;
      }

      const updated = await db
        .update(notifications)
        .set({ isRead: true })
        .where(
          and(
            eq(notifications.id, notificationId),
            eq(notifications.userUid, uid),
          ),
        )
        .returning();

      if (updated.length === 0) {
        res.status(404).json({ error: 'Notification not found.' });
        return;
      }

      res.json({ notification: updated[0] });
    } catch (error) {
      console.error('Failed to mark notification read:', error);
      res.status(500).json({ error: 'Failed to update notification.' });
    }
  },
);

app.post(
  '/api/notifications/read-all',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.user!.uid;
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(eq(notifications.userUid, uid));
      res.json({ ok: true });
    } catch (error) {
      console.error('Failed to mark all notifications read:', error);
      res.status(500).json({ error: 'Failed to update notifications.' });
    }
  },
);

// --- Patients (Registration, Retrieval, Profile Updates, Removal) ---
app.get('/api/patients', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const dbUser = req.dbUser!;
    const scope = buildUserOrHospitalScope(
      patients.ownerUid,
      patients.hospitalId,
      dbUser,
    );
    const rows = await db
      .select()
      .from(patients)
      .where(scope)
      .orderBy(desc(patients.createdAt));
    res.json({ patients: rows });
  } catch (error) {
    console.error('Failed to fetch patients:', error);
    res.status(500).json({ error: 'Failed to load registered patients.' });
  }
});

app.post('/api/patients', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const dbUser = req.dbUser!;
    const uid = dbUser.uid;
    const fullName = sanitizeText(req.body?.fullName, 120);
    const rawUhid = sanitizeText(req.body?.uhid, 40);
    const sex = sanitizeText(req.body?.sex, 24);
    const phone = sanitizeText(req.body?.phone, 40);
    const email = sanitizeText(req.body?.email, 140);
    const address = sanitizeText(req.body?.address, 260);
    const notes = sanitizeText(req.body?.notes, 300);

    let dateOfBirth: string | null = null;
    if (
      typeof req.body?.dateOfBirth === 'string' &&
      req.body.dateOfBirth.trim()
    ) {
      const dob = req.body.dateOfBirth.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
        res
          .status(400)
          .json({ error: 'Date of birth must use YYYY-MM-DD format.' });
        return;
      }
      dateOfBirth = dob;
    }

    if (!fullName) {
      res.status(400).json({ error: 'Patient full name is required.' });
      return;
    }

    const uhid =
      rawUhid?.toUpperCase() ||
      `UHID-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    const duplicate = await db
      .select()
      .from(patients)
      .where(and(eq(patients.ownerUid, uid), eq(patients.uhid, uhid)))
      .limit(1);

    if (duplicate.length > 0) {
      res.status(409).json({
        error: `A patient with UHID ${uhid} is already registered under your account.`,
      });
      return;
    }

    const inserted = await db
      .insert(patients)
      .values({
        ownerUid: uid,
        hospitalId: dbUser.hospitalId ?? null,
        uhid,
        fullName,
        dateOfBirth,
        sex,
        phone,
        email,
        address,
        notes,
      })
      .returning();

    await appendAuditLog({
      userUid: uid,
      actorRole: dbUser.role,
      hospitalId: dbUser.hospitalId,
      action: 'PATIENT_REGISTERED',
      entityType: 'patient',
      entityId: inserted[0].id,
      ipAddress: getClientIp(req),
      details: { uhid, fullName },
    });

    res.status(201).json({ patient: inserted[0] });
  } catch (error: any) {
    if (error?.code === '23505') {
      res.status(409).json({
        error: 'A patient with this UHID is already registered under your account.',
      });
      return;
    }
    console.error('Failed to register patient:', error);
    res.status(500).json({ error: 'Failed to register test patient.' });
  }
});

app.patch('/api/patients/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const dbUser = req.dbUser!;
    const patientId = Number(req.params.id);
    if (!Number.isInteger(patientId) || patientId <= 0) {
      res.status(400).json({ error: 'Invalid patient ID.' });
      return;
    }

    const [existing] = await db
      .select()
      .from(patients)
      .where(eq(patients.id, patientId))
      .limit(1);
    if (!existing || !canAccessScopedRecord(existing, dbUser)) {
      res.status(404).json({ error: 'Patient record not found.' });
      return;
    }

    const fullName = sanitizeText(req.body?.fullName, 120);
    const sex = sanitizeText(req.body?.sex, 24);
    const phone = sanitizeText(req.body?.phone, 40);
    const email = sanitizeText(req.body?.email, 140);
    const address = sanitizeText(req.body?.address, 260);
    const notes = sanitizeText(req.body?.notes, 300);

    let dateOfBirth: string | null | undefined = undefined;
    if (req.body?.dateOfBirth === null || req.body?.dateOfBirth === '') {
      dateOfBirth = null;
    } else if (typeof req.body?.dateOfBirth === 'string') {
      const dob = req.body.dateOfBirth.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
        res
          .status(400)
          .json({ error: 'Date of birth must use YYYY-MM-DD format.' });
        return;
      }
      dateOfBirth = dob;
    }

    const [updated] = await db
      .update(patients)
      .set({
        ...(fullName ? { fullName } : {}),
        ...(req.body?.sex !== undefined ? { sex } : {}),
        ...(req.body?.phone !== undefined ? { phone } : {}),
        ...(req.body?.email !== undefined ? { email } : {}),
        ...(req.body?.address !== undefined ? { address } : {}),
        ...(req.body?.notes !== undefined ? { notes } : {}),
        ...(dateOfBirth !== undefined ? { dateOfBirth } : {}),
        updatedAt: new Date(),
      })
      .where(eq(patients.id, patientId))
      .returning();

    await appendAuditLog({
      userUid: dbUser.uid,
      actorRole: dbUser.role,
      hospitalId: dbUser.hospitalId,
      action: 'PATIENT_UPDATED',
      entityType: 'patient',
      entityId: patientId,
      ipAddress: getClientIp(req),
      details: { uhid: updated.uhid },
    });

    res.json({ patient: updated });
  } catch (error) {
    console.error('Failed to update patient:', error);
    res.status(500).json({ error: 'Failed to update patient record.' });
  }
});

app.delete(
  '/api/patients/:id',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const dbUser = req.dbUser!;
      const patientId = Number(req.params.id);
      if (!Number.isInteger(patientId) || patientId <= 0) {
        res.status(400).json({ error: 'Invalid patient ID.' });
        return;
      }

      const [existing] = await db
        .select()
        .from(patients)
        .where(eq(patients.id, patientId))
        .limit(1);
      if (!existing || !canAccessScopedRecord(existing, dbUser)) {
        res.status(404).json({ error: 'Patient record not found.' });
        return;
      }

      await db.delete(patients).where(eq(patients.id, patientId));

      await appendAuditLog({
        userUid: dbUser.uid,
        actorRole: dbUser.role,
        hospitalId: dbUser.hospitalId,
        action: 'PATIENT_REMOVED',
        entityType: 'patient',
        entityId: patientId,
        ipAddress: getClientIp(req),
      });

      res.json({ deletedId: patientId });
    } catch (error) {
      console.error('Failed to remove patient:', error);
      res.status(500).json({ error: 'Failed to remove patient.' });
    }
  },
);

// --- Audit Logs (User / Hospital Scoped) ---
app.get('/api/audit-logs', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const dbUser = req.dbUser!;
    const scope = buildUserOrHospitalScope(
      auditLogs.userUid,
      auditLogs.hospitalId,
      dbUser,
    );
    const rows = await db
      .select()
      .from(auditLogs)
      .where(scope)
      .orderBy(desc(auditLogs.createdAt))
      .limit(100);
    res.json({ auditLogs: rows });
  } catch (error) {
    console.error('Failed to load audit logs:', error);
    res.status(500).json({ error: 'Failed to load audit logs.' });
  }
});

const ALLOWED_CLIENT_AUDIT_ACTIONS = new Set([
  'SIMULATED_NETWORK_INTERRUPTION',
  'SIMULATED_FAILURE_HANDLED',
  'SIMULATED_DEVICE_DISCONNECTED',
  'BLE_SCAN_FAILED',
  'REPORT_PDF_DOWNLOADED',
]);

app.post('/api/audit-logs', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const dbUser = req.dbUser!;
    const action = sanitizeText(req.body?.action, 80);
    const entityType = sanitizeText(req.body?.entityType, 40) || 'system';
    const entityId = sanitizeText(req.body?.entityId, 80);
    const details =
      req.body?.details &&
      typeof req.body.details === 'object' &&
      !Array.isArray(req.body.details) &&
      JSON.stringify(req.body.details).length <= 4096
        ? (req.body.details as Record<string, unknown>)
        : undefined;

    if (!action || !ALLOWED_CLIENT_AUDIT_ACTIONS.has(action)) {
      res.status(400).json({
        error: 'Unsupported or restricted client audit action.',
      });
      return;
    }

    await appendAuditLog({
      userUid: dbUser.uid,
      actorRole: dbUser.role,
      hospitalId: dbUser.hospitalId,
      action,
      entityType,
      entityId,
      ipAddress: getClientIp(req),
      details,
    });
    res.status(201).json({ ok: true });
  } catch (error) {
    console.error('Failed to record audit log:', error);
    res.status(500).json({ error: 'Failed to record audit event.' });
  }
});

app.all('/api/*', (_req: Request, res: Response) => {
  res.status(404).json({ error: 'API endpoint not found.' });
});

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    res.status(400).json({ error: 'Malformed JSON request payload.' });
    return;
  }
  if (err?.type === 'entity.too.large' || err?.status === 413) {
    res.status(413).json({ error: 'Request payload exceeds maximum 1MB limit.' });
    return;
  }
  console.error('Unhandled API error:', err);
  res.status(500).json({ error: 'An unexpected server error occurred.' });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Hema Nexus server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Hema Nexus server:', err);
  process.exit(1);
});
