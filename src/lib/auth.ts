import type { FastifyRequest, FastifyReply } from 'fastify';
import { db } from './db.js';
import type { Crab } from '@prisma/client';

const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

// Attached to request after successful auth
declare module 'fastify' {
  interface FastifyRequest {
    crab?: Crab;
  }
}

/**
 * Pre-handler that validates the admin API key.
 * Rejects with 401 if missing or invalid.
 */
export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (!ADMIN_API_KEY) {
    // This is a server configuration error, not a client error.
    // Should not happen in a correctly configured environment.
    console.error('CRITICAL: ADMIN_API_KEY is not configured. Management routes are unprotected.');
    return reply.status(500).send({ error: 'Server configuration error' });
  }

  const clientKey = request.headers['x-admin-api-key'];

  if (!clientKey) {
    return reply.status(401).send({ error: 'Missing x-admin-api-key header' });
  }

  if (clientKey !== ADMIN_API_KEY) {
    return reply.status(401).send({ error: 'Invalid admin API key' });
  }
}

/**
 * Prehandler that validates the agent's bearer token.
 * Rejects with 401 if missing/invalid, 403 if the agent has been revoked.
 * On success, attaches `request.crab` for downstream handlers.
 */
export async function requireCrab(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Missing or malformed Authorization header. Expected: Bearer <token>' });
  }

  const token = authHeader.slice(7);

  const crab = await db.crab.findUnique({ where: { token } });

  if (!crab) {
    return reply.status(401).send({ error: 'Invalid agent token' });
  }

  if (!crab.active) {
    return reply.status(403).send({ error: `Agent "${crab.name}" has been revoked` });
  }

  request.crab = crab;
}
