import { Router, type Response } from 'express';
import { desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db, pool } from '../db/index.ts';
import {
  auditLogs,
  calibrationRecords,
  deviceEvents,
  devices,
  hospitals,
  measurements,
  patients,
  reports,
  testSessions,
  users,
  type AccountStatus,
  type UserRole,
} from '../db/schema.ts';
import { adminUpdateUser, toPublicUser } from '../db/users.ts';
import {
  requireAdmin,
  requireAuth,
  type AuthRequest,
} from '../middleware/auth.ts';
import { appendAuditLog, getClientIp, sanitizeText } from './helpers.ts';

export const adminRouter = Router();

// Strictly restrict ALL /api/admin/* endpoints to role === 'admin'
adminRouter.use(requireAuth, requireAdmin);

adminRouter.get('/overview', async (_req: AuthRequest, res: Response) => {
  try {
    const start = Date.now();
    await pool.query('SELECT 1');
    const latencyMs = Date.now() - start;

    const [
      userCnt,
      hospitalCnt,
      patientCnt,
      deviceCnt,
      eventCnt,
      sessionCnt,
      measCnt,
      calCnt,
      reportCnt,
      auditCnt,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(users),
      db.select({ count: sql<number>`count(*)::int` }).from(hospitals),
      db.select({ count: sql<number>`count(*)::int` }).from(patients),
      db.select({ count: sql<number>`count(*)::int` }).from(devices),
      db.select({ count: sql<number>`count(*)::int` }).from(deviceEvents),
      db.select({ count: sql<number>`count(*)::int` }).from(testSessions),
      db.select({ count: sql<number>`count(*)::int` }).from(measurements),
      db.select({ count: sql<number>`count(*)::int` }).from(calibrationRecords),
      db.select({ count: sql<number>`count(*)::int` }).from(reports),
      db.select({ count: sql<number>`count(*)::int` }).from(auditLogs),
    ]);

    res.json({
      health: {
        database: 'connected',
        dialect: 'PostgreSQL (Cloud SQL)',
        latencyMs,
        checkedAt: new Date().toISOString(),
      },
      tableCounts: {
        users: userCnt[0]?.count ?? 0,
        hospitals: hospitalCnt[0]?.count ?? 0,
        patients: patientCnt[0]?.count ?? 0,
        devices: deviceCnt[0]?.count ?? 0,
        device_events: eventCnt[0]?.count ?? 0,
        test_sessions: sessionCnt[0]?.count ?? 0,
        measurements: measCnt[0]?.count ?? 0,
        calibration_records: calCnt[0]?.count ?? 0,
        reports: reportCnt[0]?.count ?? 0,
        audit_logs: auditCnt[0]?.count ?? 0,
      },
    });
  } catch (error) {
    console.error('Admin overview failed:', error);
    res.status(500).json({ error: 'Unable to load database overview.' });
  }
});

adminRouter.get('/users', async (_req: AuthRequest, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(200);
    res.json({ users: rows.map(toPublicUser) });
  } catch (error) {
    console.error('Admin users list failed:', error);
    res.status(500).json({ error: 'Unable to list users.' });
  }
});

adminRouter.patch('/users/:uid', async (req: AuthRequest, res: Response) => {
  try {
    const actor = req.dbUser!;
    const targetUid = sanitizeText(req.params.uid, 128);
    if (!targetUid) {
      res.status(400).json({ error: 'Invalid user UID.' });
      return;
    }

    if (
      req.body?.role !== undefined &&
      req.body.role !== 'consumer' &&
      req.body.role !== 'hospital_operator' &&
      req.body.role !== 'clinician' &&
      req.body.role !== 'admin'
    ) {
      res.status(400).json({ error: 'Invalid role value.' });
      return;
    }

    if (
      req.body?.accountStatus !== undefined &&
      req.body.accountStatus !== 'active' &&
      req.body.accountStatus !== 'suspended' &&
      req.body.accountStatus !== 'pending'
    ) {
      res.status(400).json({ error: 'Invalid accountStatus value.' });
      return;
    }

    const role: UserRole | undefined =
      req.body?.role === 'consumer' ||
      req.body?.role === 'hospital_operator' ||
      req.body?.role === 'clinician' ||
      req.body?.role === 'admin'
        ? req.body.role
        : undefined;

    const accountStatus: AccountStatus | undefined =
      req.body?.accountStatus === 'active' ||
      req.body?.accountStatus === 'suspended' ||
      req.body?.accountStatus === 'pending'
        ? req.body.accountStatus
        : undefined;

    const hospitalId =
      req.body?.hospitalId === null || req.body?.hospitalId === ''
        ? null
        : req.body?.hospitalId !== undefined
          ? Number(req.body.hospitalId)
          : undefined;

    if (
      hospitalId !== undefined &&
      hospitalId !== null &&
      (!Number.isInteger(hospitalId) || hospitalId <= 0)
    ) {
      res.status(400).json({ error: 'Invalid hospitalId.' });
      return;
    }

    if (hospitalId !== undefined && hospitalId !== null) {
      const [hosp] = await db
        .select({ id: hospitals.id })
        .from(hospitals)
        .where(eq(hospitals.id, hospitalId))
        .limit(1);
      if (!hosp) {
        res.status(404).json({ error: 'Referenced hospital not found.' });
        return;
      }
    }

    if (
      targetUid === actor.uid &&
      ((role && role !== 'admin') || accountStatus === 'suspended')
    ) {
      res.status(400).json({
        error: 'Administrators cannot demote or suspend their own active session.',
      });
      return;
    }

    const updated = await adminUpdateUser(targetUid, {
      ...(role ? { role } : {}),
      ...(accountStatus ? { accountStatus } : {}),
      ...(hospitalId !== undefined ? { hospitalId } : {}),
    });

    if (!updated) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    await appendAuditLog({
      userUid: actor.uid,
      actorRole: actor.role,
      hospitalId: actor.hospitalId,
      action: role ? 'PERMISSION_CHANGED' : 'ADMIN_USER_UPDATED',
      entityType: 'user',
      entityId: targetUid,
      ipAddress: getClientIp(req),
      details: { role, accountStatus, hospitalId },
    });

    res.json({ user: updated });
  } catch (error) {
    console.error('Admin user update failed:', error);
    res.status(500).json({ error: 'Failed to update user.' });
  }
});

adminRouter.get('/patients', async (req: AuthRequest, res: Response) => {
  try {
    const q = sanitizeText(req.query.q, 80);
    const pattern = q ? `%${q}%` : null;

    const rows = await db
      .select()
      .from(patients)
      .where(
        pattern
          ? or(
              ilike(patients.fullName, pattern),
              ilike(patients.uhid, pattern),
              ilike(patients.email, pattern),
            )
          : undefined,
      )
      .orderBy(desc(patients.createdAt))
      .limit(200);

    res.json({ patients: rows });
  } catch (error) {
    console.error('Admin patients query failed:', error);
    res.status(500).json({ error: 'Unable to query patients.' });
  }
});

adminRouter.get('/devices', async (_req: AuthRequest, res: Response) => {
  try {
    const [deviceRows, recentEvents] = await Promise.all([
      db.select().from(devices).orderBy(desc(devices.createdAt)).limit(200),
      db
        .select()
        .from(deviceEvents)
        .orderBy(desc(deviceEvents.createdAt))
        .limit(100),
    ]);
    res.json({ devices: deviceRows, deviceEvents: recentEvents });
  } catch (error) {
    console.error('Admin devices query failed:', error);
    res.status(500).json({ error: 'Unable to load devices.' });
  }
});

adminRouter.get('/test-sessions', async (_req: AuthRequest, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(testSessions)
      .orderBy(desc(testSessions.startedAt))
      .limit(200);
    res.json({ testSessions: rows });
  } catch (error) {
    console.error('Admin sessions query failed:', error);
    res.status(500).json({ error: 'Unable to load test sessions.' });
  }
});

adminRouter.get('/measurements', async (_req: AuthRequest, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(measurements)
      .orderBy(desc(measurements.measuredAt))
      .limit(250);
    res.json({ measurements: rows });
  } catch (error) {
    console.error('Admin measurements query failed:', error);
    res.status(500).json({ error: 'Unable to load measurements.' });
  }
});

adminRouter.get('/calibrations', async (_req: AuthRequest, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(calibrationRecords)
      .orderBy(desc(calibrationRecords.calibrationDate))
      .limit(200);
    res.json({ calibrations: rows });
  } catch (error) {
    console.error('Admin calibrations query failed:', error);
    res.status(500).json({ error: 'Unable to load calibration records.' });
  }
});

adminRouter.get('/audit-logs', async (_req: AuthRequest, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(200);
    res.json({ auditLogs: rows });
  } catch (error) {
    console.error('Admin audit logs query failed:', error);
    res.status(500).json({ error: 'Unable to load system audit logs.' });
  }
});

adminRouter.get('/hospitals', async (_req: AuthRequest, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(hospitals)
      .orderBy(desc(hospitals.createdAt))
      .limit(200);
    res.json({ hospitals: rows });
  } catch (error) {
    console.error('Admin hospitals query failed:', error);
    res.status(500).json({ error: 'Unable to load hospitals.' });
  }
});
