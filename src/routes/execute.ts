import type { FastifyInstance } from 'fastify';
import { request as undiciRequest } from 'undici';
import { db } from '../lib/db.js';
import { decryptPearl } from '../lib/crypto.js';
import { injectCredential } from '../lib/injector.js';
import { requireCrab } from '../lib/auth.js';
import type { AuthType } from '../lib/injector.js';

interface ExecuteBody {
  service: string;       // pearl to use, e.g. "github"
  url: string;           // target URL to call
  method?: string;       // HTTP method, default GET
  body?: unknown;        // optional request body
  authType?: AuthType;   // how to inject the credential, default "bearer"
  authParamName?: string; // for header/queryparam auth types
}

export async function executeRoutes(app: FastifyInstance) {
  /**
   * POST /v1/execute
   *
   * The core gateway route. An authenticated agent sends a tool call;
   * the Shell looks up + decrypts the credential, injects it, executes
   * the HTTP request, logs everything, and returns the result.
   */
  app.post<{ Body: ExecuteBody }>(
    '/v1/execute',
    { preHandler: requireCrab },
    async (request, reply) => {
      const crab = request.crab!;
      const {
        service,
        url,
        method = 'GET',
        body: requestBody,
        authType = 'bearer',
        authParamName,
      } = request.body;

      if (!service || !url) {
        return reply.status(400).send({ error: 'service and url are required' });
      }

      // Validate URL to prevent SSRF against internal services
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        return reply.status(400).send({ error: 'Invalid URL' });
      }

      if (parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1' || parsedUrl.hostname.endsWith('.internal')) {
        return reply.status(400).send({ error: 'Requests to internal addresses are not allowed' });
      }

      // --- 1. Look up and decrypt the pearl ---
      const pearl = await db.pearl.findUnique({
        where: { crabId_service: { crabId: crab.id, service } },
      });

      if (!pearl) {
        await logTide({ crabId: crab.id, url, method, error: `No credential found for service: ${service}` });
        return reply.status(404).send({ error: `No credential found for service "${service}". Register it via POST /v1/secrets.` });
      }

      let secret: string;
      try {
        secret = decryptPearl({
          encryptedBlob: pearl.encryptedBlob,
          iv: pearl.iv,
          authTag: pearl.authTag,
        });
      } catch (err) {
        await logTide({ crabId: crab.id, url, method, error: 'Decryption failed' });
        return reply.status(500).send({ error: 'Failed to decrypt credential' });
      }

      // --- 2. Inject credential into request ---
      const { url: finalUrl, headers } = injectCredential(url, secret, {
        authType,
        paramName: authParamName,
      });

      // --- 3. Execute the outbound HTTP request ---
      let statusCode: number;
      let responseBody: string;

      try {
        const { statusCode: code, body } = await undiciRequest(finalUrl, {
          method: method.toUpperCase() as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
          headers,
          body: requestBody ? JSON.stringify(requestBody) : undefined,
        });

        statusCode = code;
        responseBody = await body.text();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        await logTide({ crabId: crab.id, url, method, error: message });
        return reply.status(502).send({ error: `Upstream request failed: ${message}` });
      }

      // --- 4. Log to tides ---
      await logTide({
        crabId: crab.id,
        url,
        method,
        requestBody: requestBody ? JSON.stringify(requestBody) : undefined,
        statusCode,
        responseBody: sanitizeResponseBody(responseBody),
      });

      // --- 5. Return response to agent ---
      let parsedResponse: unknown;
      try {
        parsedResponse = JSON.parse(responseBody);
      } catch {
        parsedResponse = responseBody;
      }

      return reply.status(statusCode).send({
        statusCode,
        body: parsedResponse,
      });
    },
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface TideEntry {
  crabId: string;
  url: string;
  method: string;
  requestBody?: string;
  statusCode?: number;
  responseBody?: string;
  error?: string;
}

async function logTide(entry: TideEntry) {
  try {
    await db.tide.create({
      data: {
        crabId: entry.crabId,
        direction: 'EGRESS',
        targetUrl: entry.url,
        requestBody: entry.requestBody ?? null,
        statusCode: entry.statusCode ?? null,
        responseBody: entry.responseBody ?? null,
        error: entry.error ?? null,
      },
    });
  } catch {
    // Audit log failure must never crash the gateway
  }
}

/**
 * Strips values that look like secrets from response bodies before logging.
 * Caps length to avoid bloating the audit log.
 */
function sanitizeResponseBody(body: string): string {
  const MAX_LENGTH = 4096;
  const truncated = body.length > MAX_LENGTH ? body.slice(0, MAX_LENGTH) + '…[truncated]' : body;
  // Redact anything that looks like a token/key in the response
  return truncated.replace(/(["']?(?:token|key|secret|password|api_key)["']?\s*:\s*["'])[^"']{6,}(["'])/gi, '$1[REDACTED]$2');
}
