import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { db } from '../lib/db.js';
import { requireAdmin } from '../lib/auth.js';

export async function crabsRoutes(app: FastifyInstance) {
  /**
   * POST /v1/crabs
   * Register a new agent. Returns the bearer token — only shown once.
   *
   * Body: { name }
   */
  app.post<{
    Body: { name: string };
  }>('/v1/crabs', { preHandler: [requireAdmin] }, async (request, reply) => {
    const { name } = request.body;

    if (!name) {
      return reply.status(400).send({ error: 'name is required' });
    }

    const existing = await db.crab.findUnique({ where: { name } });
    if (existing) {
      return reply.status(409).send({ error: `Agent "${name}" already exists` });
    }

    const token = randomBytes(32).toString('hex');

    const crab = await db.crab.create({
      data: { name, token },
    });

    // Token is only returned at creation time — not stored in plaintext after this
    return reply.status(201).send({
      id: crab.id,
      name: crab.name,
      token: crab.token, // show once
      active: crab.active,
      createdAt: crab.createdAt,
    });
  });

  /**
   * GET /v1/crabs
   * List all registered agents. Never returns tokens.
   */
  app.get('/v1/crabs', { preHandler: [requireAdmin] }, async (_request, reply) => {
    const crabs = await db.crab.findMany({
      select: {
        id: true,
        name: true,
        active: true,
        createdAt: true,
        updatedAt: true,
        // token intentionally omitted
      },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({ crabs });
  });

  /**
   * PATCH /v1/crabs/:id/revoke
   * Kill switch — deactivate an agent immediately.
   */
  app.patch<{
    Params: { id: string };
  }>('/v1/crabs/:id/revoke', { preHandler: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params;

    const crab = await db.crab.findUnique({ where: { id } });
    if (!crab) {
      return reply.status(404).send({ error: `No agent found with id: ${id}` });
    }

    const updated = await db.crab.update({
      where: { id },
      data: { active: false },
      select: { id: true, name: true, active: true, updatedAt: true },
    });

    return reply.send(updated);
  });
}
