import crypto from 'node:crypto';

const EPHEMERAL_DEV_SESSION_SECRET = crypto.randomBytes(32).toString('hex');

// In-memory revocation list keyed by JWT ID (`jti`) -> expiration unix seconds
const revokedTokens = new Map<string, number>();
const MAX_REVOKED_TOKENS = 50_000;

function pruneRevokedTokens(nowSec: number) {
  if (revokedTokens.size === 0) return;
  for (const [jti, exp] of revokedTokens.entries()) {
    if (exp <= nowSec) {
      revokedTokens.delete(jti);
    }
  }
  if (revokedTokens.size > MAX_REVOKED_TOKENS) {
    revokedTokens.clear();
  }
}

function getSessionSecret(): string {
  const configured = process.env.AUTH_SESSION_SECRET?.trim();
  if (configured && configured.length >= 32) {
    return configured;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'AUTH_SESSION_SECRET must be set to at least 32 characters in production.',
    );
  }
  return EPHEMERAL_DEV_SESSION_SECRET;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, originalHex] = parts;
  if (!salt || !originalHex) return false;
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const original = Buffer.from(originalHex, 'hex');
    if (derived.length !== original.length) return false;
    return crypto.timingSafeEqual(derived, original);
  } catch {
    return false;
  }
}

export interface LocalSessionClaims {
  uid: string;
  email: string;
  jti: string;
  iat: number;
  exp: number;
  provider: 'local';
}

export function signSessionToken(
  payload: { uid: string; email: string },
  ttlSeconds = 60 * 60 * 12,
): string {
  const now = Math.floor(Date.now() / 1000);
  const claims: LocalSessionClaims = {
    uid: payload.uid,
    email: payload.email,
    jti: crypto.randomUUID(),
    iat: now,
    exp: now + ttlSeconds,
    provider: 'local',
  };
  const encoded = Buffer.from(JSON.stringify(claims), 'utf8').toString(
    'base64url',
  );
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');
  return `hnloc.${encoded}.${sig}`;
}

export function verifySessionToken(token: string): LocalSessionClaims | null {
  if (!token.startsWith('hnloc.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, encoded, sig] = parts;
  if (!encoded || !sig) return null;

  try {
    const expectedSig = crypto
      .createHmac('sha256', getSessionSecret())
      .update(encoded)
      .digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return null;
    }

    const parsed = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    ) as LocalSessionClaims;
    if (
      parsed.provider !== 'local' ||
      typeof parsed.uid !== 'string' ||
      typeof parsed.jti !== 'string' ||
      !parsed.jti ||
      typeof parsed.exp !== 'number'
    ) {
      return null;
    }
    const nowSec = Math.floor(Date.now() / 1000);
    if (parsed.exp < nowSec) {
      return null;
    }
    pruneRevokedTokens(nowSec);
    if (revokedTokens.has(parsed.jti)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function revokeSessionToken(token: string): boolean {
  const claims = verifySessionToken(token);
  if (!claims) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  pruneRevokedTokens(nowSec);
  revokedTokens.set(claims.jti, claims.exp);
  return true;
}
