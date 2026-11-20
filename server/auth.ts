import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { MediStockStore, StoredUserRecord } from './store.ts';
import type { UserProfile } from '../src/shared/types.ts';

export const SESSION_COOKIE_NAME = 'medistock_session';
const SESSION_TTL_DAYS = 30;

export interface AuthenticatedRequest extends Request {
  user?: UserProfile;
  sessionTokenHash?: string;
}

export function normalizeUserName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export function hashSessionToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function toPublicUser(record: StoredUserRecord): UserProfile {
  return {
    id: record.id,
    name: record.name,
    dateFormat: record.dateFormat,
    themePreference: record.themePreference,
    notificationsEnabled: record.notificationsEnabled,
    onboardingCompleted: record.onboardingCompleted,
    createdAt: record.createdAt,
  };
}

export async function createSession(
  store: MediStockStore,
  userId: string
): Promise<{ rawToken: string; expiresAt: string }> {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(rawToken);
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_DAYS * 86_400_000);
  const id = crypto.randomUUID();

  await store.createSession({
    id,
    userId,
    tokenHash,
    expiresAt: expires.toISOString(),
    createdAt: now.toISOString(),
  });

  return { rawToken, expiresAt: expires.toISOString() };
}

export function extractSessionToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }
  const cookieToken = (req as Request & { cookies?: Record<string, string> }).cookies?.[
    SESSION_COOKIE_NAME
  ];
  if (cookieToken && typeof cookieToken === 'string') {
    return cookieToken;
  }
  return null;
}

export function createAuthMiddleware(store: MediStockStore) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const rawToken = extractSessionToken(req);
      if (!rawToken) {
        return res.status(401).json({ error: 'Authentication required. Please log in.' });
      }

      const tokenHash = hashSessionToken(rawToken);
      const nowIso = new Date().toISOString();

      const found = await store.findSessionWithUser(tokenHash);
      if (!found) {
        return res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
      }

      if (found.session.expiresAt <= nowIso) {
        await store.deleteSessionByTokenHash(tokenHash);
        return res.status(401).json({ error: 'Your session has expired. Please log in again.' });
      }

      req.user = toPublicUser(found.user);
      req.sessionTokenHash = tokenHash;
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function setSessionCookie(res: Response, rawToken: string, expiresAt: string, req: Request) {
  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: isSecure ? 'none' : 'lax',
    secure: isSecure,
    expires: new Date(expiresAt),
    path: '/',
  });
}

export function clearSessionCookie(res: Response, req: Request) {
  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: isSecure ? 'none' : 'lax',
    secure: isSecure,
    path: '/',
  });
}

/**
 * Sliding-window rate limiter to protect auth endpoints from brute force.
 */
export function createRateLimiter(options: { windowMs: number; maxRequests: number }) {
  const hits = new Map<string, number[]>();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const cutoff = now - options.windowMs;
    const timestamps = (hits.get(key) || []).filter((t) => t > cutoff);

    if (timestamps.length >= options.maxRequests) {
      return res.status(429).json({
        error: 'Too many attempts. Please wait a moment and try again.',
      });
    }

    timestamps.push(now);
    hits.set(key, timestamps);
    next();
  };
}
