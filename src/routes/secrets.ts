import type { FastifyInstance } from 'fastify';
import { db } from '../lib/db.js';
import { encryptPearl, decryptPearl } from '../lib/crypto.js';

export async function secretsRoutes(app: FastifyInstance) {
  /**
   * POST /v1/secrets
   * Store an encrypted credential for an agent.
   *
   * Body: { crabId, service, plaintext, label? }
   * Returns the pearl record (no plaintext).
   */
  app.post<{
    Body: {
      crabId: string;
      service: string;
      plaintext: string;
      label?: string;
    };
  }>('/v1/secrets', async (request, reply) => {
    const { crabId, service, plaintext, label } = request.body;

    if (!crabId || !service || !plaintext) {
      return reply.status(400).send({ error: 'crabId, service, and plaintext are required' });
    }

    // Verify the crab exists
    const crab = await db.crab.findUnique({ where: { id: crabId } });
    if (!crab) {
      return reply.status(404).send({ error: `No agent found with id: ${crabId}` });
    }

    const encrypted = encryptPearl(plaintext);

    const pearl = await db.pearl.upsert({
      where: { crabId_service: { crabId, service } },
      create: {
        crabId,
        service,
        label: label ?? null,
        encryptedBlob: encrypted.encryptedBlob,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
      },
      update: {
        label: label ?? undefined,
        encryptedBlob: encrypted.encryptedBlob,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
      },
    });

    return reply.status(201).send({
      id: pearl.id,
      crabId: pearl.crabId,
      service: pearl.service,
      label: pearl.label,
      createdAt: pearl.createdAt,
      updatedAt: pearl.updatedAt,
    });
  });

  /**
   * GET /v1/secrets
   * List all pearls. Never returns plaintext values.
   * Optional query: ?crabId=<id>
   */
  app.get<{
    Querystring: { crabId?: string };
  }>('/v1/secrets', async (request, reply) => {
    const { crabId } = request.query;

    const pearls = await db.pearl.findMany({
      where: crabId ? { crabId } : undefined,
      select: {
        id: true,
        crabId: true,
        service: true,
        label: true,
        createdAt: true,
        updatedAt: true,
        // encryptedBlob, iv, authTag intentionally omitted
      },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({ pearls });
  });

  /**
   * DELETE /v1/secrets/:id
   * Remove a pearl by ID.
   */
  app.delete<{
    Params: { id: string };
  }>('/v1/secrets/:id', async (request, reply) => {
    const { id } = request.params;

    const pearl = await db.pearl.findUnique({ where: { id } });
    if (!pearl) {
      return reply.status(404).send({ error: `No secret found with id: ${id}` });
    }

    await db.pearl.delete({ where: { id } });
    return reply.status(204).send();
  });
}
