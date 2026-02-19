/**
 * Phase 8A — Model Proxy
 *
 * POST /v1/chat/completions
 *
 * OpenAI-compatible endpoint. Authenticates the crab, looks up the configured
 * ModelProvider, optionally injects an API key from the pearl vault, and
 * streams the upstream response back to the caller unmodified.
 *
 * Agents call this as if it were a standard OpenAI API — fully transparent.
 */

import type { FastifyInstance } from 'fastify';
import { request as undiciRequest } from 'undici';
import { db } from '../lib/db.js';
import { decryptPearl } from '../lib/crypto.js';
import { requireCrab, requireAdmin } from '../lib/auth.js';

// ─── Provider CRUD routes (admin-only) ───────────────────────────────────────

interface CreateProviderBody {
  name: string;
  baseUrl: string;
  protocol?: 'OPENAI' | 'ANTHROPIC';
  pearlService?: string;
  scope?: 'GLOBAL' | 'RESTRICTED';
  active?: boolean;
}

interface GrantAccessBody {
  crabId: string;
}

export async function modelRoutes(app: FastifyInstance) {
  // ── GET /v1/providers — list all providers ──────────────────────────────
  app.get('/v1/providers', { preHandler: [requireAdmin] }, async (_request, reply) => {
    const providers = await db.modelProvider.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        access: { select: { crabId: true } },
      },
    });
    return reply.send({ providers });
  });

  // ── POST /v1/providers — create a provider ──────────────────────────────
  app.post<{ Body: CreateProviderBody }>(
    '/v1/providers',
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const { name, baseUrl, protocol = 'OPENAI', pearlService, scope = 'GLOBAL' } = request.body;

      if (!name || !baseUrl) {
        return reply.status(400).send({ error: 'name and baseUrl are required' });
      }

      try {
        new URL(baseUrl);
      } catch {
        return reply.status(400).send({ error: 'baseUrl must be a valid URL' });
      }

      const provider = await db.modelProvider.create({
        data: { name, baseUrl, protocol, pearlService: pearlService ?? null, scope },
      });

      return reply.status(201).send({ provider });
    },
  );

  // ── PATCH /v1/providers/:id — update a provider ─────────────────────────
  app.patch<{ Params: { id: string }; Body: Partial<CreateProviderBody> }>(
    '/v1/providers/:id',
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const { id } = request.params;
      const { name, baseUrl, protocol, pearlService, scope, active } = request.body;

      if (baseUrl) {
        try {
          new URL(baseUrl);
        } catch {
          return reply.status(400).send({ error: 'baseUrl must be a valid URL' });
        }
      }

      const existing = await db.modelProvider.findUnique({ where: { id } });
      if (!existing) return reply.status(404).send({ error: 'Provider not found' });

      const provider = await db.modelProvider.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          ...(baseUrl !== undefined && { baseUrl }),
          ...(protocol !== undefined && { protocol }),
          ...(pearlService !== undefined && { pearlService: pearlService || null }),
          ...(scope !== undefined && { scope }),
          ...(active !== undefined && { active }),
        },
      });

      return reply.send({ provider });
    },
  );

  // ── DELETE /v1/providers/:id — delete a provider ────────────────────────
  app.delete<{ Params: { id: string } }>(
    '/v1/providers/:id',
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const { id } = request.params;
      const existing = await db.modelProvider.findUnique({ where: { id } });
      if (!existing) return reply.status(404).send({ error: 'Provider not found' });

      await db.modelProvider.delete({ where: { id } });
      return reply.status(204).send();
    },
  );

  // ── POST /v1/providers/:id/access — grant a crab RESTRICTED access ──────
  app.post<{ Params: { id: string }; Body: GrantAccessBody }>(
    '/v1/providers/:id/access',
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const { id } = request.params;
      const { crabId } = request.body;

      if (!crabId) return reply.status(400).send({ error: 'crabId is required' });

      const provider = await db.modelProvider.findUnique({ where: { id } });
      if (!provider) return reply.status(404).send({ error: 'Provider not found' });

      const access = await db.modelProviderAccess.upsert({
        where: { providerId_crabId: { providerId: id, crabId } },
        create: { providerId: id, crabId },
        update: {},
      });

      return reply.status(201).send({ access });
    },
  );

  // ── DELETE /v1/providers/:id/access/:crabId — revoke access ─────────────
  app.delete<{ Params: { id: string; crabId: string } }>(
    '/v1/providers/:id/access/:crabId',
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const { id, crabId } = request.params;
      const existing = await db.modelProviderAccess.findUnique({
        where: { providerId_crabId: { providerId: id, crabId } },
      });
      if (!existing) return reply.status(404).send({ error: 'Access grant not found' });
      await db.modelProviderAccess.delete({
        where: { providerId_crabId: { providerId: id, crabId } },
      });
      return reply.status(204).send();
    },
  );

  // ─────────────────────────────────────────────────────────────────────────
  // POST /v1/chat/completions — the model proxy
  // ─────────────────────────────────────────────────────────────────────────
  app.post(
    '/v1/chat/completions',
    { preHandler: requireCrab },
    async (request, reply) => {
      const crab = request.crab!;

      // --- 1. Find an active provider ---
      // Prefer GLOBAL providers; if the crab has RESTRICTED access, those are
      // also eligible. We pick the first active provider the crab can use.
      const globalProvider = await db.modelProvider.findFirst({
        where: { active: true, scope: 'GLOBAL' },
        orderBy: { createdAt: 'asc' },
      });

      const restrictedProvider = await db.modelProvider.findFirst({
        where: {
          active: true,
          scope: 'RESTRICTED',
          access: { some: { crabId: crab.id } },
        },
        orderBy: { createdAt: 'asc' },
      });

      const provider = globalProvider ?? restrictedProvider;

      if (!provider) {
        return reply.status(503).send({
          error: 'No model provider is configured or accessible for this agent.',
        });
      }

      // --- 2. Build upstream URL ---
      const upstreamUrl = `${provider.baseUrl.replace(/\/$/, '')}/v1/chat/completions`;

      // --- 3. Optionally inject API key from pearl vault ---
      const headers: Record<string, string> = {
        'content-type': 'application/json',
      };

      if (provider.pearlService) {
        const pearl = await db.pearl.findUnique({
          // Pearl is stored against the hermit_shell "system" crab — we use a
          // sentinel crabId of "" to represent shell-owned secrets. But since
          // we don't have a system crab, we find pearls by service name across
          // all crabs (admin stored it) and take the first match.
          where: { crabId_service: { crabId: crab.id, service: provider.pearlService } },
        });

        // Also check if there's a pearl owned by any crab for this service
        // (admin may have stored it on a dedicated "system" crab)
        const systemPearl = pearl ?? await db.pearl.findFirst({
          where: { service: provider.pearlService },
        });

        if (systemPearl) {
          try {
            const apiKey = decryptPearl({
              encryptedBlob: systemPearl.encryptedBlob,
              iv: systemPearl.iv,
              authTag: systemPearl.authTag,
            });
            headers['authorization'] = `Bearer ${apiKey}`;
          } catch {
            return reply.status(500).send({ error: 'Failed to decrypt provider API key' });
          }
        }
        // If no pearl found, proceed without auth (Ollama doesn't need it)
      }

      // --- 4. Stream upstream response ---
      const requestBodyRaw = JSON.stringify(request.body);
      const isStreaming = (request.body as any)?.stream === true;

      let statusCode: number;
      let responseText = '';

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120_000); // 2 min for LLM

        const { statusCode: code, body, headers: upstreamHeaders } = await undiciRequest(upstreamUrl, {
          method: 'POST',
          headers,
          body: requestBodyRaw,
          signal: controller.signal,
        });

        clearTimeout(timeout);
        statusCode = code;

        // Pass through content-type so clients know if it's SSE
        const contentType = upstreamHeaders['content-type'];
        if (contentType) {
          reply.header('content-type', contentType);
        }

        if (isStreaming) {
          // Stream directly — don't buffer, pipe the body through
          reply.status(statusCode);
          // Collect for audit log while streaming
          const chunks: Buffer[] = [];
          for await (const chunk of body) {
            const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
            chunks.push(buf);
            reply.raw.write(buf);
          }
          reply.raw.end();
          responseText = Buffer.concat(chunks).toString('utf8').slice(0, 4096);
        } else {
          responseText = await body.text();
          reply.status(statusCode).send(responseText);
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          await logTide(crab.id, provider.name, upstreamUrl, 504, undefined, 'Upstream LLM request timed out');
          return reply.status(504).send({ error: 'Model provider request timed out' });
        }
        const message = err instanceof Error ? err.message : 'Unknown error';
        await logTide(crab.id, provider.name, upstreamUrl, 502, undefined, message);
        return reply.status(502).send({ error: `Model provider request failed: ${message}` });
      }

      // --- 5. Audit log ---
      await logTide(crab.id, provider.name, upstreamUrl, statusCode, responseText);
    },
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function logTide(
  crabId: string,
  tool: string,
  targetUrl: string,
  statusCode: number,
  responseBody?: string,
  error?: string,
) {
  try {
    await db.tide.create({
      data: {
        crabId,
        direction: 'EGRESS',
        tool,
        targetUrl,
        statusCode,
        responseBody: responseBody ? responseBody.slice(0, 4096) : null,
        error: error ?? null,
      },
    });
  } catch {
    // Audit log failure must never crash the gateway
  }
}
