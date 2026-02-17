/**
 * Phase 8C — Agent UI Reverse Proxy
 *
 * Routes:
 *   GET/POST/... /agents/:name/*  → forwards to the agent's web UI at
 *                                   http://<containerName>:<uiPort>/<rest>
 *   WS           /agents/:name/*  → WebSocket upgrade passthrough
 *
 * Auth: requires a valid hc_session cookie (checked via requireSession).
 * Agents must have `uiPort` set on their Crab record. The container is
 * addressed by its Docker name (same as the Crab name) on the sand_bed network.
 *
 * Security notes:
 * - Only sand_bed addresses are reachable (internal Docker network, no internet).
 * - The path is forwarded verbatim; no SSRF concern because only registered
 *   agent names with an explicit uiPort are proxied.
 */

import http from 'node:http';
import net from 'node:net';
import type { FastifyInstance } from 'fastify';
import { db } from '../lib/db.js';
import { requireSession } from './auth.js';

export async function agentUiRoutes(app: FastifyInstance) {
  // ── HTTP proxy ──────────────────────────────────────────────────────────────
  //
  // We handle all HTTP methods at /agents/:name/* by intercepting at the
  // raw Node.js level, similar to how we handle CONNECT. This avoids having
  // to register every method individually and ensures body streaming works.
  //
  // For Fastify routes we register a wildcard GET (and all-method handler via
  // addContentTypeParser) but the cleanest approach is to register a catch-all
  // route on all methods.

  const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

  for (const method of methods) {
    app.route({
      method,
      url: '/agents/:name/*',
      preHandler: [requireSession],
      handler: async (request, reply) => {
        const { name } = request.params as { name: string; '*': string };
        const rest = (request.params as { '*': string })['*'] ?? '';

        // Look up the agent
        const crab = await db.crab.findUnique({ where: { name } });
        if (!crab || !crab.uiPort) {
          return reply.status(404).send({ error: `No UI configured for agent "${name}"` });
        }
        if (!crab.active) {
          return reply.status(403).send({ error: `Agent "${name}" is revoked` });
        }

        const targetHost = name; // Docker container name == sand_bed hostname
        const targetPort = crab.uiPort;
        const targetPath = `/${rest}${request.url.includes('?') ? request.url.slice(request.url.indexOf('?')) : ''}`;

        // Build upstream request options
        const upstreamOptions: http.RequestOptions = {
          hostname: targetHost,
          port: targetPort,
          path: targetPath,
          method: request.method,
          headers: {
            ...request.headers,
            host: `${targetHost}:${targetPort}`,
            // Strip hop-by-hop headers
            connection: 'close',
          },
        };

        // Forward the request and pipe the response back
        await new Promise<void>((resolve, reject) => {
          const upstream = http.request(upstreamOptions, (upstreamRes) => {
            // Strip hop-by-hop headers from response
            const responseHeaders: Record<string, string | string[]> = {};
            for (const [key, val] of Object.entries(upstreamRes.headers)) {
              if (!HOP_BY_HOP.has(key.toLowerCase()) && val !== undefined) {
                responseHeaders[key] = val as string | string[];
              }
            }

            reply.status(upstreamRes.statusCode ?? 502).headers(responseHeaders);
            upstreamRes.pipe(reply.raw);
            upstreamRes.on('end', resolve);
            upstreamRes.on('error', reject);
          });

          upstream.on('error', (err) => {
            app.log.warn({ name, err: err.message }, 'agent-ui upstream error');
            reply.status(502).send({ error: 'Agent UI unavailable' });
            resolve();
          });

          // Pipe request body to upstream (for POST/PUT/PATCH)
          if (request.raw.readable) {
            request.raw.pipe(upstream);
          } else {
            upstream.end();
          }
        });
      },
    });
  }

  // ── WebSocket upgrade passthrough ───────────────────────────────────────────
  //
  // Fastify doesn't own WebSocket upgrades — they arrive as HTTP Upgrade events
  // on the underlying Node.js server before Fastify's router sees them.
  // We intercept and verify the session cookie manually, then tunnel the WS.

  app.server.on('upgrade', async (req, clientSocket, head) => {
    // Only handle /agents/:name/* WebSocket upgrades
    const match = req.url?.match(/^\/agents\/([^/?]+)(\/.*)?(\?.*)?$/);
    if (!match) return; // let other handlers deal with it

    const name = match[1];

    // Check session cookie in the Upgrade request headers
    const cookies = parseCookies(req.headers.cookie ?? '');
    const cookieValue = cookies['hc_session'];
    if (!cookieValue) {
      clientSocket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      clientSocket.destroy();
      return;
    }

    const { verifySession } = await import('../lib/session.js');
    if (!verifySession(cookieValue)) {
      clientSocket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      clientSocket.destroy();
      return;
    }

    // Look up agent
    const crab = await db.crab.findUnique({ where: { name } }).catch(() => null);
    if (!crab?.uiPort || !crab.active) {
      clientSocket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      clientSocket.destroy();
      return;
    }

    // Open TCP tunnel to the agent container on sand_bed
    const upstream = net.createConnection({ host: name, port: crab.uiPort });

    upstream.once('connect', () => {
      // Re-emit the original HTTP Upgrade request to the upstream
      const requestLine = `${req.method ?? 'GET'} ${req.url ?? '/'} HTTP/1.1\r\n`;
      const headers = Object.entries(req.headers)
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
        .join('\r\n');
      upstream.write(`${requestLine}${headers}\r\n\r\n`);
      if (head.length > 0) upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });

    upstream.once('error', () => {
      clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      clientSocket.destroy();
    });

    clientSocket.once('error', () => upstream.destroy());
    clientSocket.once('close', () => upstream.destroy());
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Headers that must not be forwarded between proxies (RFC 2616 §13.5.1)
const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailers', 'transfer-encoding', 'upgrade',
]);

function parseCookies(header: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    result[key] = decodeURIComponent(val);
  }
  return result;
}
