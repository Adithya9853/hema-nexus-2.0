import { eq, ilike } from 'drizzle-orm';
import crypto from 'node:crypto';
import { db } from './index.ts';
import {
  users,
  type AccountStatus,
  type UserPreferences,
  type UserRole,
} from './schema.ts';
import { hashPassword, verifyPassword } from '../lib/sessionAuth.ts';

const DEFAULT_BOOTSTRAP_ADMINS = new Set(['tsadithya31@gmail.com']);

function isBootstrapAdminEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (DEFAULT_BOOTSTRAP_ADMINS.has(normalized)) return true;
  const configured = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return configured.includes(normalized);
}

function generatePatientCode(uid: string): string {
  const hash = Array.from(uid).reduce(
    (acc, ch) => (acc * 31 + ch.charCodeAt(0)) % 900000,
    100000,
  );
  return `HN-${String(hash).padStart(6, '0')}`;
}

export type DbUserRow = typeof users.$inferSelect;
export type PublicDbUser = Omit<DbUserRow, 'passwordHash'>;

export function toPublicUser(row: DbUserRow): PublicDbUser {
  const { passwordHash: _passwordHash, ...safe } = row;
  return safe;
}

export async function getUserByUid(uid: string): Promise<PublicDbUser | null> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.uid, uid))
    .limit(1);
  return rows[0] ? toPublicUser(rows[0]) : null;
}

export async function getOrCreateUser(
  uid: string,
  email: string,
  displayName?: string | null,
  avatarUrl?: string | null,
): Promise<PublicDbUser> {
  try {
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.uid, uid))
      .limit(1);

    if (existing.length > 0) {
      const current = existing[0];
      const shouldPromoteAdmin =
        isBootstrapAdminEmail(email) && current.role !== 'admin';
      if (current.email !== email || shouldPromoteAdmin) {
        const updated = await db
          .update(users)
          .set({
            email,
            ...(shouldPromoteAdmin ? { role: 'admin' } : {}),
            updatedAt: new Date(),
          })
          .where(eq(users.uid, uid))
          .returning();
        return toPublicUser(updated[0]);
      }
      return toPublicUser(current);
    }

    const initialRole: UserRole = isBootstrapAdminEmail(email)
      ? 'admin'
      : 'consumer';

    const result = await db
      .insert(users)
      .values({
        uid,
        email,
        fullName: displayName || null,
        avatarUrl: avatarUrl || null,
        patientCode: generatePatientCode(uid),
        role: initialRole,
        accountStatus: 'active',
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          updatedAt: new Date(),
        },
      })
      .returning();

    return toPublicUser(result[0]);
  } catch (error) {
    console.error('Database error in getOrCreateUser:', error);
    throw new Error('Failed to synchronize user profile.', { cause: error });
  }
}

export async function registerLocalUser(
  params: {
    email: string;
    password: string;
    fullName?: string | null;
    phone?: string | null;
    role?: 'consumer' | 'hospital_operator' | 'clinician';
    hospitalId?: number | null;
  },
  executor: Pick<typeof db, 'select' | 'insert'> = db,
): Promise<PublicDbUser> {
  const normalizedEmail = params.email.trim().toLowerCase();
  const existing = await executor
    .select()
    .from(users)
    .where(ilike(users.email, normalizedEmail))
    .limit(1);

  if (existing.length > 0) {
    throw new Error('EMAIL_EXISTS');
  }

  const uid = `local_${crypto.randomUUID()}`;
  const passwordHash = hashPassword(params.password);
  const role: UserRole =
    params.role === 'hospital_operator' || params.role === 'clinician'
      ? params.role
      : 'consumer';

  const inserted = await executor
    .insert(users)
    .values({
      uid,
      email: normalizedEmail,
      fullName: params.fullName || null,
      phone: params.phone || null,
      passwordHash,
      patientCode: generatePatientCode(uid),
      role,
      accountStatus: 'active',
      hospitalId: params.hospitalId ?? null,
    })
    .returning();

  return toPublicUser(inserted[0]);
}

export async function authenticateLocalUser(
  email: string,
  password: string,
): Promise<PublicDbUser | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const rows = await db
    .select()
    .from(users)
    .where(ilike(users.email, normalizedEmail))
    .limit(1);

  const user = rows[0];
  if (!user || !user.passwordHash) {
    return null;
  }
  if (!verifyPassword(password, user.passwordHash)) {
    return null;
  }
  return toPublicUser(user);
}

export async function updateUserProfile(
  uid: string,
  patch: {
    fullName?: string | null;
    phone?: string | null;
    dateOfBirth?: string | null;
    preferences?: UserPreferences;
  },
): Promise<PublicDbUser | null> {
  try {
    const result = await db
      .update(users)
      .set({
        ...(patch.fullName !== undefined ? { fullName: patch.fullName } : {}),
        ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
        ...(patch.dateOfBirth !== undefined
          ? { dateOfBirth: patch.dateOfBirth }
          : {}),
        ...(patch.preferences !== undefined
          ? { preferences: patch.preferences }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.uid, uid))
      .returning();

    return result[0] ? toPublicUser(result[0]) : null;
  } catch (error) {
    console.error('Database error in updateUserProfile:', error);
    throw new Error('Failed to update user profile.', { cause: error });
  }
}

export async function adminUpdateUser(
  targetUid: string,
  patch: {
    role?: UserRole;
    accountStatus?: AccountStatus;
    hospitalId?: number | null;
  },
): Promise<PublicDbUser | null> {
  const result = await db
    .update(users)
    .set({
      ...(patch.role !== undefined ? { role: patch.role } : {}),
      ...(patch.accountStatus !== undefined
        ? { accountStatus: patch.accountStatus }
        : {}),
      ...(patch.hospitalId !== undefined ? { hospitalId: patch.hospitalId } : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.uid, targetUid))
    .returning();

  return result[0] ? toPublicUser(result[0]) : null;
}
