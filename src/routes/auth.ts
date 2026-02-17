/**
 * Phase 8C — Admin Session Auth
 *
 * POST /v1/auth/login  — validates ADMIN_API_KEY, issues a signed session cookie
 * POST /v1/auth/logout — clears the session cookie
 * GET  /v1/auth/me     — returns { ok: true } if the cookie is valid (used by UI)
 *
 * The session cookie (hc_session) is HttpOnly, SameSite=Strict, Secure in production.
 * The UI uses this to gate access without sending the raw ADMIN_API_KEY to the browser.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../lib/db.js';
import { issueSession, verifySession, COOKIE_NAME } from '../lib/session.js';

const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
const IS_PROD = process.env.NODE_ENV === 'production';

// Default TTL; can be overridden by SystemSetting
const DEFAULT_TTL_HOURS = 8;

async function getTtlHours(): Promise<number> {
  const setting = await db.systemSetting
    .findUnique({ where: { key: 'session_cookie_ttl_hours' } })
    .catch(() => null);
  const parsed = parseInt(setting?.value ?? '', 10);
  return isNaN(parsed) ? DEFAULT_TTL_HOURS : parsed;
}

export async function authRoutes(app: FastifyInstance) {
  // ── POST /v1/auth/login ────────────────────────────────────────────────────
  app.post<{ Body: { apiKey: string } }>('/v1/auth/login', async (request, reply) => {
    if (!ADMIN_API_KEY) {
      return reply.status(500).send({ error: 'Server configuration error' });
    }

    const { apiKey } = request.body ?? {};
    if (!apiKey || apiKey !== ADMIN_API_KEY) {
      return reply.status(401).send({ error: 'Invalid admin API key' });
    }

    const ttlHours = await getTtlHours();
    const cookieValue = issueSession();

    reply.setCookie(COOKIE_NAME, cookieValue, {
      httpOnly: true,
      sameSite: 'strict',
      secure: IS_PROD,
      path: '/',
      maxAge: ttlHours * 3600,
    });

    return reply.send({ ok: true });
  });

  // ── POST /v1/auth/logout ───────────────────────────────────────────────────
  app.post('/v1/auth/logout', async (_request, reply) => {
    reply.clearCookie(COOKIE_NAME, { path: '/' });
    return reply.send({ ok: true });
  });

  // ── GET /v1/auth/me ────────────────────────────────────────────────────────
  // Used by the SPA on load to check if the existing cookie is still valid.
  app.get('/v1/auth/me', async (request, reply) => {
    const cookieValue = request.cookies[COOKIE_NAME];
    if (!cookieValue) {
      return reply.status(401).send({ ok: false });
    }
    const ttlHours = await getTtlHours();
    if (!verifySession(cookieValue, ttlHours)) {
      return reply.status(401).send({ ok: false });
    }
    return reply.send({ ok: true });
  });
}

/**
 * Fastify preHandler: require a valid session cookie.
 * Used to protect the agent-ui proxy route.
 */
export async function requireSession(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const cookieValue = request.cookies[COOKIE_NAME];
  if (!cookieValue) {
    return reply.status(401).send({ error: 'Not authenticated' });
  }
  const ttlHours = await getTtlHours();
  if (!verifySession(cookieValue, ttlHours)) {
    reply.clearCookie(COOKIE_NAME, { path: '/' });
    return reply.status(401).send({ error: 'Session expired' });
  }
}
