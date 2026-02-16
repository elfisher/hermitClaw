import type { FastifyRequest, FastifyReply } from 'fastify';
import { db } from './db.js';

// Attached to request after successful auth
declare module 'fastify' {
  interface FastifyRequest {
    crab?: {
      id: string;
      name: string;
    };
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

  request.crab = { id: crab.id, name: crab.name };
}
