/**
 * Phase 8B — HTTP CONNECT Proxy + Domain Rules
 *
 * This module does two things:
 *
 * 1. Registers an HTTP CONNECT tunnel handler on the underlying Node.js server.
 *    When an agent container sets HTTP_PROXY=http://hermit_shell:3000, all its
 *    outbound HTTPS traffic arrives here as CONNECT requests. We evaluate domain
 *    rules, then either establish a TCP tunnel or return 403.
 *
 * 2. Exposes admin CRUD routes for ConnectRule and SystemSetting management
 *    (GET/POST/DELETE /v1/connect-rules, GET/PUT /v1/settings).
 *
 * Auth note: Proxy-Authorization: Bearer <token> is optional. If provided and
 * valid, per-crab rules apply in addition to global rules. If absent, only
 * global rules are evaluated. This lets zero-config agents (Node.js HTTP_PROXY)
 * work out of the box without code changes.
 */

import net from 'node:net';
import type { FastifyInstance } from 'fastify';
import { db } from '../lib/db.js';
import { requireAdmin } from '../lib/auth.js';
import { evaluateConnectRules } from '../lib/connect-rules.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CreateRuleBody {
  domain: string;
  action: 'ALLOW' | 'DENY';
  crabId?: string;
  priority?: number;
  note?: string;
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export async function connectRoutes(app: FastifyInstance) {
  // ── HTTP CONNECT tunnel handler ─────────────────────────────────────────
  //
  // Fastify sits on top of a plain Node.js http.Server. That server emits a
  // 'connect' event for every HTTP CONNECT request before Fastify's router
  // sees it. We intercept here and handle it entirely at the TCP level.

  app.server.on('connect', async (req, clientSocket, head) => {
    // Parse host:port from CONNECT request line (e.g. "api.github.com:443")
    const target = req.url ?? '';
    const lastColon = target.lastIndexOf(':');
    const host = lastColon >= 0 ? target.slice(0, lastColon) : target;
    const port = lastColon >= 0 ? parseInt(target.slice(lastColon + 1), 10) : 443;

    if (!host || isNaN(port)) {
      clientSocket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      clientSocket.destroy();
      return;
    }

    // ── Resolve crab identity from Proxy-Authorization (optional) ────────
    let crabId: string | null = null;
    let crabName: string | null = null;
    const proxyAuth = req.headers['proxy-authorization'];
    if (proxyAuth?.startsWith('Bearer ')) {
      const token = proxyAuth.slice(7).trim();
      const crab = await db.crab.findUnique({ where: { token } }).catch(() => null);
      if (crab && crab.active && (!crab.expiresAt || crab.expiresAt > new Date())) {
        crabId = crab.id;
        crabName = crab.name;
      }
    }

    // ── Evaluate domain rules ────────────────────────────────────────────
    let allowed = false;
    try {
      allowed = await evaluateConnectRules(host, crabId);
    } catch {
      // Rule evaluation failure — fail closed
      clientSocket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      clientSocket.destroy();
      return;
    }

    if (!allowed) {
      clientSocket.write('HTTP/1.1 403 Forbidden\r\nX-HermitClaw: domain blocked by policy\r\n\r\n');
      clientSocket.destroy();
      await logTide(crabId, host, port, 403, `CONNECT to ${host}:${port} blocked by domain policy`);
      return;
    }

    // ── Establish upstream TCP tunnel ────────────────────────────────────
    const upstream = net.createConnection({ host, port });

    upstream.once('connect', () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      // Replay any bytes that arrived with the CONNECT frame
      if (head.length > 0) upstream.write(head);
      // Bidirectional pipe — the Hermit Shell is now a transparent TCP relay
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
      logTide(crabId, host, port, 200);
    });

    upstream.once('error', (err) => {
      const msg = err.message.includes('ECONNREFUSED') ? 'Connection refused' :
                  err.message.includes('ENOTFOUND')    ? 'Host not found' :
                  'Upstream connection failed';
      clientSocket.write(`HTTP/1.1 502 Bad Gateway\r\nX-HermitClaw: ${msg}\r\n\r\n`);
      clientSocket.destroy();
      logTide(crabId, host, port, 502, msg);
    });

    upstream.once('timeout', () => {
      upstream.destroy();
      clientSocket.write('HTTP/1.1 504 Gateway Timeout\r\n\r\n');
      clientSocket.destroy();
      logTide(crabId, host, port, 504, 'Upstream connection timed out');
    });

    clientSocket.once('error', () => upstream.destroy());
    clientSocket.once('close', () => upstream.destroy());

    // 10s connection timeout (distinct from the data transfer timeout)
    upstream.setTimeout(10_000);

    app.log.debug({ crabId: crabId ?? 'anonymous', crabName, host, port, allowed }, 'CONNECT tunnel');
  });

  // ── GET /v1/connect-rules ──────────────────────────────────────────────
  app.get('/v1/connect-rules', { preHandler: [requireAdmin] }, async (_req, reply) => {
    const rules = await db.connectRule.findMany({ orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }] });
    return reply.send({ rules });
  });

  // ── POST /v1/connect-rules ─────────────────────────────────────────────
  app.post<{ Body: CreateRuleBody }>(
    '/v1/connect-rules',
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const { domain, action, crabId, priority = 100, note } = request.body;

      if (!domain || !action) {
        return reply.status(400).send({ error: 'domain and action are required' });
      }
      if (!['ALLOW', 'DENY'].includes(action)) {
        return reply.status(400).send({ error: 'action must be ALLOW or DENY' });
      }

      const rule = await db.connectRule.create({
        data: { domain, action, crabId: crabId ?? null, priority, note: note ?? null },
      });
      return reply.status(201).send({ rule });
    },
  );

  // ── DELETE /v1/connect-rules/:id ──────────────────────────────────────
  app.delete<{ Params: { id: string } }>(
    '/v1/connect-rules/:id',
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const { id } = request.params;
      const existing = await db.connectRule.findUnique({ where: { id } });
      if (!existing) return reply.status(404).send({ error: 'Rule not found' });
      await db.connectRule.delete({ where: { id } });
      return reply.status(204).send();
    },
  );

  // ── GET /v1/settings ──────────────────────────────────────────────────
  app.get('/v1/settings', { preHandler: [requireAdmin] }, async (_req, reply) => {
    const settings = await db.systemSetting.findMany({ orderBy: { key: 'asc' } });
    // Return as a key→value map for easy UI consumption
    const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));

    // Inject defaults for any settings not yet in the DB
    const defaults: Record<string, string> = {
      connect_proxy_default: 'ALLOW',
      session_cookie_ttl_hours: '8',
    };

    return reply.send({ settings: { ...defaults, ...map } });
  });

  // ── PUT /v1/settings/:key ─────────────────────────────────────────────
  app.put<{ Params: { key: string }; Body: { value: string } }>(
    '/v1/settings/:key',
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const { key } = request.params;
      const { value } = request.body;

      if (value === undefined || value === null) {
        return reply.status(400).send({ error: 'value is required' });
      }

      // Validate known settings
      if (key === 'connect_proxy_default' && !['ALLOW', 'DENY'].includes(value)) {
        return reply.status(400).send({ error: 'connect_proxy_default must be ALLOW or DENY' });
      }

      const setting = await db.systemSetting.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      });

      return reply.send({ setting });
    },
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function logTide(
  crabId: string | null,
  host: string,
  port: number,
  statusCode: number,
  error?: string,
) {
  try {
    await db.tide.create({
      data: {
        crabId,
        direction: 'EGRESS',
        tool: 'CONNECT',
        targetUrl: `${host}:${port}`,
        statusCode,
        error: error ?? null,
      },
    });
  } catch {
    // Audit log failure must never interrupt tunnel establishment
  }
}
