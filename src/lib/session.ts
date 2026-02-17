/**
 * Phase 8C — Signed Session Cookies
 *
 * Issues and verifies short-lived admin session cookies using HMAC-SHA256.
 * The cookie value is: base64(payload) + "." + base64(hmac)
 *
 * Payload: { sub: "admin", iat: <unix-seconds> }
 *
 * The signing key is derived from ADMIN_API_KEY so no separate secret is needed.
 * TTL is controlled by the session_cookie_ttl_hours SystemSetting (default 8h).
 */

import crypto from 'node:crypto';

export const COOKIE_NAME = 'hc_session';

interface SessionPayload {
  sub: 'admin';
  iat: number; // issued-at (unix seconds)
}

function signingKey(): string {
  const key = process.env.ADMIN_API_KEY;
  if (!key) throw new Error('ADMIN_API_KEY is not set');
  return key;
}

/**
 * Issue a signed session cookie value (not the Set-Cookie header, just the value).
 */
export function issueSession(): string {
  const payload: SessionPayload = { sub: 'admin', iat: Math.floor(Date.now() / 1000) };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', signingKey())
    .update(payloadB64)
    .digest('base64url');
  return `${payloadB64}.${sig}`;
}

/**
 * Verify a session cookie value.
 *
 * Returns true if the signature is valid and the session has not expired.
 * ttlHours defaults to 8 if not provided (caller may pass the DB setting value).
 */
export function verifySession(cookieValue: string, ttlHours = 8): boolean {
  const parts = cookieValue.split('.');
  if (parts.length !== 2) return false;
  const [payloadB64, sig] = parts;

  // Constant-time signature check
  const expectedSig = crypto
    .createHmac('sha256', signingKey())
    .update(payloadB64)
    .digest('base64url');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return false;
  } catch {
    return false;
  }

  // Decode payload and check expiry
  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return false;
  }

  if (payload.sub !== 'admin') return false;
  const age = Math.floor(Date.now() / 1000) - payload.iat;
  return age <= ttlHours * 3600;
}
