import crypto from 'node:crypto';
import type { Request } from 'express';
import { and, eq, or, type SQL } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { auditLogs } from '../db/schema.ts';
import type { PublicDbUser } from '../db/users.ts';

export function sanitizeText(value: unknown, maxLen = 200): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\0/g, '').trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

export function getClientIp(req: Request): string | null {
  if (req.ip) return req.ip.slice(0, 64);
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) {
    return fwd.split(',')[0].trim().slice(0, 64);
  }
  return null;
}

export function isStaffRole(role: string | undefined): boolean {
  return role === 'hospital_operator' || role === 'clinician' || role === 'admin';
}

/**
 * Enforces patient-level and hospital-level isolation:
 * - Consumers see only records owned by their UID.
 * - Hospital staff (hospital_operator / clinician) see records owned by their UID
 *   OR scoped to their assigned hospitalId (never another hospital's data).
 */
export function buildUserOrHospitalScope(
  uidColumn: any,
  hospitalIdColumn: any,
  user: PublicDbUser,
): SQL {
  if (
    (user.role === 'hospital_operator' ||
      user.role === 'clinician' ||
      user.role === 'admin') &&
    user.hospitalId
  ) {
    return or(
      eq(uidColumn, user.uid),
      eq(hospitalIdColumn, user.hospitalId),
    ) as SQL;
  }
  return eq(uidColumn, user.uid);
}

export function canAccessScopedRecord(
  record: { ownerUid?: string; userUid?: string; hospitalId?: number | null },
  user: PublicDbUser,
): boolean {
  if (user.role === 'admin') return true;
  const owner = record.ownerUid ?? record.userUid;
  if (owner && owner === user.uid) return true;
  if (
    (user.role === 'hospital_operator' || user.role === 'clinician') &&
    user.hospitalId &&
    record.hospitalId === user.hospitalId
  ) {
    return true;
  }
  return false;
}

export async function appendAuditLog(params: {
  userUid: string;
  actorRole?: string;
  hospitalId?: number | null;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  ipAddress?: string | null;
  details?: Record<string, unknown>;
}) {
  try {
    await db.insert(auditLogs).values({
      userUid: params.userUid,
      actorRole: params.actorRole || 'consumer',
      hospitalId: params.hospitalId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId:
        params.entityId !== undefined && params.entityId !== null
          ? String(params.entityId)
          : null,
      ipAddress: params.ipAddress ?? null,
      details: params.details || null,
    });
  } catch (err) {
    console.error('Audit log insert failed:', err);
  }
}

export function uniqueCode(prefix: string): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${prefix}-${datePart}-${rand}`;
}

export function andAll(conditions: (SQL | undefined)[]): SQL | undefined {
  const valid = conditions.filter((c): c is SQL => Boolean(c));
  if (valid.length === 0) return undefined;
  return valid.length === 1 ? valid[0] : and(...valid);
}
