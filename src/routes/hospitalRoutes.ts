import { Router, type Response } from 'express';
import { desc, eq, or, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  devices,
  hospitals,
  measurements,
  patients,
  reports,
  testSessions,
  users,
} from '../db/schema.ts';
import {
  requireAuth,
  requireHospitalStaffOrAdmin,
  type AuthRequest,
} from '../middleware/auth.ts';
import {
  appendAuditLog,
  buildUserOrHospitalScope,
  getClientIp,
  sanitizeText,
  uniqueCode,
} from './helpers.ts';

export const hospitalRouter = Router();

hospitalRouter.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const dbUser = req.dbUser!;
    if (dbUser.role === 'admin') {
      const rows = await db
        .select()
        .from(hospitals)
        .orderBy(desc(hospitals.createdAt));
      res.json({ hospitals: rows });
      return;
    }

    const conditions = [eq(hospitals.ownerUid, dbUser.uid)];
    if (dbUser.hospitalId) {
      conditions.push(eq(hospitals.id, dbUser.hospitalId));
    }
    const rows = await db
      .select()
      .from(hospitals)
      .where(or(...conditions))
      .orderBy(desc(hospitals.createdAt));
    res.json({ hospitals: rows });
  } catch (error) {
    console.error('Failed to fetch hospitals:', error);
    res.status(500).json({ error: 'Unable to load clinics/hospitals.' });
  }
});

hospitalRouter.post(
  '/',
  requireAuth,
  requireHospitalStaffOrAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const dbUser = req.dbUser!;
      const name = sanitizeText(req.body?.name, 140);
      const address = sanitizeText(req.body?.address, 260);
      const contactEmail = sanitizeText(req.body?.contactEmail, 140);
      const contactPhone = sanitizeText(req.body?.contactPhone, 40);
      const registrationNumber = sanitizeText(req.body?.registrationNumber, 80);

      if (!name) {
        res.status(400).json({ error: 'Hospital or clinic name is required.' });
        return;
      }

      const [created] = await db
        .insert(hospitals)
        .values({
          hospitalCode: uniqueCode('HN-HOSP'),
          name,
          address,
          contactEmail,
          contactPhone,
          registrationNumber,
          accountStatus: 'active',
          ownerUid: dbUser.uid,
        })
        .returning();

      if (!dbUser.hospitalId) {
        await db
          .update(users)
          .set({ hospitalId: created.id, updatedAt: new Date() })
          .where(eq(users.uid, dbUser.uid));
      }

      await appendAuditLog({
        userUid: dbUser.uid,
        actorRole: dbUser.role,
        hospitalId: created.id,
        action: 'HOSPITAL_REGISTERED',
        entityType: 'hospital',
        entityId: created.id,
        ipAddress: getClientIp(req),
        details: { name, hospitalCode: created.hospitalCode },
      });

      res.status(201).json({ hospital: created });
    } catch (error) {
      console.error('Failed to register hospital:', error);
      res.status(500).json({ error: 'Failed to register hospital/clinic.' });
    }
  },
);

hospitalRouter.patch(
  '/:id',
  requireAuth,
  requireHospitalStaffOrAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const dbUser = req.dbUser!;
      const hospitalId = Number(req.params.id);
      if (!Number.isInteger(hospitalId) || hospitalId <= 0) {
        res.status(400).json({ error: 'Invalid hospital ID.' });
        return;
      }

      const existingRows = await db
        .select()
        .from(hospitals)
        .where(eq(hospitals.id, hospitalId))
        .limit(1);
      if (existingRows.length === 0) {
        res.status(404).json({ error: 'Hospital/clinic not found.' });
        return;
      }
      const existing = existingRows[0];
      if (
        dbUser.role !== 'admin' &&
        existing.ownerUid !== dbUser.uid &&
        dbUser.hospitalId !== existing.id
      ) {
        res.status(403).json({ error: 'Not authorized to modify this clinic.' });
        return;
      }

      const name = sanitizeText(req.body?.name, 140);
      const address = sanitizeText(req.body?.address, 260);
      const contactEmail = sanitizeText(req.body?.contactEmail, 140);
      const contactPhone = sanitizeText(req.body?.contactPhone, 40);
      const registrationNumber = sanitizeText(req.body?.registrationNumber, 80);
      const accountStatus =
        dbUser.role === 'admin' &&
        (req.body?.accountStatus === 'active' ||
          req.body?.accountStatus === 'pending' ||
          req.body?.accountStatus === 'suspended')
          ? req.body.accountStatus
          : undefined;

      const [updated] = await db
        .update(hospitals)
        .set({
          ...(name ? { name } : {}),
          ...(req.body?.address !== undefined ? { address } : {}),
          ...(req.body?.contactEmail !== undefined ? { contactEmail } : {}),
          ...(req.body?.contactPhone !== undefined ? { contactPhone } : {}),
          ...(req.body?.registrationNumber !== undefined
            ? { registrationNumber }
            : {}),
          ...(accountStatus ? { accountStatus } : {}),
          updatedAt: new Date(),
        })
        .where(eq(hospitals.id, hospitalId))
        .returning();

      res.json({ hospital: updated });
    } catch (error) {
      console.error('Failed to update hospital:', error);
      res.status(500).json({ error: 'Failed to update hospital details.' });
    }
  },
);

hospitalRouter.get(
  '/analytics',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const dbUser = req.dbUser!;
      const patientScope = buildUserOrHospitalScope(
        patients.ownerUid,
        patients.hospitalId,
        dbUser,
      );
      const deviceScope = buildUserOrHospitalScope(
        devices.ownerUid,
        devices.hospitalId,
        dbUser,
      );
      const sessionScope = buildUserOrHospitalScope(
        testSessions.userUid,
        testSessions.hospitalId,
        dbUser,
      );
      const measurementScope = buildUserOrHospitalScope(
        measurements.userUid,
        measurements.hospitalId,
        dbUser,
      );
      const reportScope = buildUserOrHospitalScope(
        reports.userUid,
        reports.hospitalId,
        dbUser,
      );

      const [
        patientCountRows,
        deviceCountRows,
        sessionStatsRows,
        measRows,
        reportCountRows,
      ] = await Promise.all([
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(patients)
          .where(patientScope),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(devices)
          .where(deviceScope),
        db
          .select({
            status: testSessions.sessionStatus,
            mode: testSessions.testMode,
            count: sql<number>`count(*)::int`,
          })
          .from(testSessions)
          .where(sessionScope)
          .groupBy(testSessions.sessionStatus, testSessions.testMode),
        db
          .select({
            measuredAt: measurements.measuredAt,
            isSimulated: measurements.isSimulated,
            status: measurements.status,
          })
          .from(measurements)
          .where(measurementScope)
          .orderBy(desc(measurements.measuredAt))
          .limit(500),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(reports)
          .where(reportScope),
      ]);

      const todayPrefix = new Date().toISOString().slice(0, 10);
      let todayTests = 0;
      let simulatedCount = 0;
      let realOrManualCount = 0;
      let abnormalCount = 0;
      const dailyMap = new Map<
        string,
        { date: string; simulated: number; standard: number }
      >();

      for (const m of measRows) {
        const dayKey = new Date(m.measuredAt).toISOString().slice(0, 10);
        if (dayKey === todayPrefix) todayTests += 1;
        if (m.isSimulated) simulatedCount += 1;
        else realOrManualCount += 1;
        if (m.status !== 'normal') abnormalCount += 1;

        const bucket = dailyMap.get(dayKey) || {
          date: dayKey,
          simulated: 0,
          standard: 0,
        };
        if (m.isSimulated) bucket.simulated += 1;
        else bucket.standard += 1;
        dailyMap.set(dayKey, bucket);
      }

      res.json({
        analytics: {
          totalPatients: patientCountRows[0]?.count ?? 0,
          totalDevices: deviceCountRows[0]?.count ?? 0,
          totalReports: reportCountRows[0]?.count ?? 0,
          todayTests,
          totalMeasurements: measRows.length,
          simulatedCount,
          realOrManualCount,
          abnormalCount,
          sessionBreakdown: sessionStatsRows,
          dailySeries: Array.from(dailyMap.values())
            .sort((a, b) => a.date.localeCompare(b.date))
            .slice(-14),
        },
      });
    } catch (error) {
      console.error('Failed to compute hospital analytics:', error);
      res.status(500).json({ error: 'Unable to compute hospital analytics.' });
    }
  },
);
