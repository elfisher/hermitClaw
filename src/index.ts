import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { crabsRoutes } from './routes/crabs.js';
import { secretsRoutes } from './routes/secrets.js';
import { executeRoutes } from './routes/execute.js';
import { tidesRoutes } from './routes/tides.js';
import { modelRoutes } from './routes/model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const server = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true },
    },
  },
});

// Health check
server.get('/health', async () => {
  return { status: 'ok', service: 'hermitclaw', version: '0.1.0' };
});

// API routes
await server.register(crabsRoutes);
await server.register(secretsRoutes);
await server.register(executeRoutes);
await server.register(tidesRoutes);
await server.register(modelRoutes);

// Serve Tide Pool UI (web/dist) if built
const webDistPath = path.resolve(process.cwd(), 'web', 'dist');
if (existsSync(webDistPath)) {
  await server.register(fastifyStatic, {
    root: webDistPath,
    prefix: '/',
  });

  // SPA fallback — serve index.html for unmatched non-API routes
  // @fastify/static handles existing files; this catches client-side routes (e.g. /agents)
  server.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/v1/') || request.url === '/health') {
      return reply.status(404).send({ error: 'Not found' });
    }
    return reply.sendFile('index.html');
  });
} else {
  server.log.warn('web/dist not found — UI not available. Run: cd web && npm run build');
}

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3000;
    const host = process.env.HOST || '0.0.0.0';
    await server.listen({ port, host });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
