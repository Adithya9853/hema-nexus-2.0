import { Router, type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { hospitals, users } from '../db/schema.ts';
import {
  authenticateLocalUser,
  registerLocalUser,
} from '../db/users.ts';
import { revokeSessionToken, signSessionToken } from '../lib/sessionAuth.ts';
import { requireAuth, type AuthRequest } from '../middleware/auth.ts';
import { createRateLimiter } from '../middleware/rateLimit.ts';
import { appendAuditLog, getClientIp, sanitizeText, uniqueCode } from './helpers.ts';

export const authRouter = Router();

const authRateLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 12,
  keyPrefix: 'auth',
  message: 'Too many authentication attempts. Please wait a minute before retrying.',
});

authRouter.post('/register', authRateLimiter, async (req: Request, res: Response) => {
  try {
    if (req.body?.role === 'admin') {
      res.status(403).json({
        error: 'Administrator accounts cannot be created via public registration.',
      });
      return;
    }

    const email = sanitizeText(req.body?.email, 160)?.toLowerCase();
    const password =
      typeof req.body?.password === 'string' ? req.body.password : '';
    const fullName = sanitizeText(req.body?.fullName, 120);
    const phone = sanitizeText(req.body?.phone, 40);
    const requestedRole =
      req.body?.role === 'hospital_operator' || req.body?.role === 'clinician'
        ? req.body.role
        : 'consumer';
    const hospitalName = sanitizeText(req.body?.hospitalName, 140);

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'A valid email address is required.' });
      return;
    }
    if (password.length < 8 || password.length > 128) {
      res.status(400).json({
        error: 'Password must be between 8 and 128 characters.',
      });
      return;
    }

    const { user, linkedHospitalId } = await db.transaction(async (tx) => {
      const createdUser = await registerLocalUser(
        {
          email,
          password,
          fullName,
          phone,
          role: requestedRole,
          hospitalId: null,
        },
        tx,
      );

      let hospitalId: number | null = null;
      if (
        (requestedRole === 'hospital_operator' || requestedRole === 'clinician') &&
        hospitalName
      ) {
        const [createdHospital] = await tx
          .insert(hospitals)
          .values({
            hospitalCode: uniqueCode('HN-HOSP'),
            name: hospitalName,
            contactEmail: email,
            contactPhone: phone,
            accountStatus: 'active',
            ownerUid: createdUser.uid,
          })
          .returning();
        hospitalId = createdHospital.id;

        await tx
          .update(users)
          .set({ hospitalId, updatedAt: new Date() })
          .where(eq(users.uid, createdUser.uid));
        createdUser.hospitalId = hospitalId;
      }

      return { user: createdUser, linkedHospitalId: hospitalId };
    });

    const token = signSessionToken({ uid: user.uid, email: user.email });

    await appendAuditLog({
      userUid: user.uid,
      actorRole: user.role,
      hospitalId: linkedHospitalId,
      action: 'USER_REGISTERED',
      entityType: 'user',
      entityId: user.uid,
      ipAddress: getClientIp(req),
      details: { role: user.role, provider: 'local', hospitalId: linkedHospitalId },
    });

    res.status(201).json({ token, profile: user });
  } catch (error: any) {
    if (error instanceof Error && error.message === 'EMAIL_EXISTS') {
      res.status(409).json({
        error: 'An account with this email already exists. Please sign in.',
      });
      return;
    }
    console.error('Local registration failed:', error);
    res.status(500).json({ error: 'Unable to register account.' });
  }
});

authRouter.post('/login', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const email = sanitizeText(req.body?.email, 160)?.toLowerCase();
    const password =
      typeof req.body?.password === 'string' ? req.body.password : '';

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const user = await authenticateLocalUser(email, password);
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    if (user.accountStatus === 'suspended') {
      res.status(403).json({
        error: 'This account has been suspended by an administrator.',
      });
      return;
    }

    if (user.hospitalId && user.role !== 'admin') {
      const [hosp] = await db
        .select({ accountStatus: hospitals.accountStatus })
        .from(hospitals)
        .where(eq(hospitals.id, user.hospitalId))
        .limit(1);
      if (hosp?.accountStatus === 'suspended') {
        res.status(403).json({
          error: 'Associated hospital or clinic account has been suspended.',
        });
        return;
      }
    }

    const token = signSessionToken({ uid: user.uid, email: user.email });

    await appendAuditLog({
      userUid: user.uid,
      actorRole: user.role,
      hospitalId: user.hospitalId,
      action: 'USER_LOGIN',
      entityType: 'user',
      entityId: user.uid,
      ipAddress: getClientIp(req),
      details: { provider: 'local' },
    });

    res.json({ token, profile: user });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Sign-in failed.' });
  }
});

authRouter.post('/logout', requireAuth, async (req: AuthRequest, res: Response) => {
  const revoked =
    req.user?.provider === 'local' && req.authToken
      ? revokeSessionToken(req.authToken)
      : false;

  await appendAuditLog({
    userUid: req.user!.uid,
    actorRole: req.dbUser!.role,
    hospitalId: req.dbUser!.hospitalId,
    action: 'USER_LOGOUT',
    entityType: 'user',
    entityId: req.user!.uid,
    ipAddress: getClientIp(req),
    details: { provider: req.user!.provider, sessionRevoked: revoked },
  });
  res.json({ ok: true });
});
