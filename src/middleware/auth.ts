import { eq } from 'drizzle-orm';
import type { NextFunction, Request, Response } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { db } from '../db/index.ts';
import { hospitals } from '../db/schema.ts';
import { adminAuth } from '../lib/firebase-admin.ts';
import { verifySessionToken } from '../lib/sessionAuth.ts';
import {
  getOrCreateUser,
  getUserByUid,
  type PublicDbUser,
} from '../db/users.ts';

export interface AuthRequest extends Request {
  user?: {
    uid: string;
    email?: string;
    name?: string;
    picture?: string;
    provider: 'firebase' | 'local';
    firebaseToken?: DecodedIdToken;
  };
  dbUser?: PublicDbUser;
  authToken?: string;
}

async function isLinkedHospitalSuspended(
  dbUser: PublicDbUser,
): Promise<boolean> {
  if (!dbUser.hospitalId || dbUser.role === 'admin') return false;
  const rows = await db
    .select({ accountStatus: hospitals.accountStatus })
    .from(hospitals)
    .where(eq(hospitals.id, dbUser.hospitalId))
    .limit(1);
  return rows[0]?.accountStatus === 'suspended';
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    res.status(401).json({ error: 'Authentication token is missing.' });
    return;
  }

  try {
    if (token.startsWith('hnloc.')) {
      const claims = verifySessionToken(token);
      if (!claims) {
        res
          .status(401)
          .json({ error: 'Session expired or invalid. Please sign in again.' });
        return;
      }
      const dbUser = await getUserByUid(claims.uid);
      if (!dbUser) {
        res.status(401).json({ error: 'Account no longer exists.' });
        return;
      }
      if (dbUser.accountStatus === 'suspended') {
        res.status(403).json({
          error: 'Account suspended. Contact a Hema Nexus administrator.',
        });
        return;
      }
      if (await isLinkedHospitalSuspended(dbUser)) {
        res.status(403).json({
          error:
            'Associated hospital or clinic account is suspended. Contact an administrator.',
        });
        return;
      }
      req.user = {
        uid: dbUser.uid,
        email: dbUser.email,
        name: dbUser.fullName ?? undefined,
        provider: 'local',
      };
      req.dbUser = dbUser;
      req.authToken = token;
      next();
      return;
    }

    const decodedToken = await adminAuth.verifyIdToken(token);
    const dbUser = await getOrCreateUser(
      decodedToken.uid,
      decodedToken.email || '',
      decodedToken.name || null,
      decodedToken.picture || null,
    );
    if (dbUser.accountStatus === 'suspended') {
      res.status(403).json({
        error: 'Account suspended. Contact a Hema Nexus administrator.',
      });
      return;
    }
    if (await isLinkedHospitalSuspended(dbUser)) {
      res.status(403).json({
        error:
          'Associated hospital or clinic account is suspended. Contact an administrator.',
      });
      return;
    }
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      name: decodedToken.name,
      picture: decodedToken.picture,
      provider: 'firebase',
      firebaseToken: decodedToken,
    };
    req.dbUser = dbUser;
    req.authToken = token;
    next();
  } catch (error) {
    console.error('Error verifying authentication token:', error);
    res.status(401).json({
      error: 'Session expired or invalid. Please sign in again.',
    });
  }
};

export const requireRoles =
  (...allowedRoles: string[]) =>
  (req: AuthRequest, res: Response, next: NextFunction) => {
    const role = req.dbUser?.role;
    if (!role || !allowedRoles.includes(role)) {
      res.status(403).json({
        error: 'Insufficient permissions for this action.',
      });
      return;
    }
    next();
  };

export const requireAdmin = requireRoles('admin');
export const requireHospitalStaffOrAdmin = requireRoles(
  'hospital_operator',
  'clinician',
  'admin',
);
