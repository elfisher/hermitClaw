import Fastify from 'fastify';
import { crabsRoutes } from '../../src/routes/crabs.js';
import { secretsRoutes } from '../../src/routes/secrets.js';
import { executeRoutes } from '../../src/routes/execute.js';
import { tidesRoutes } from '../../src/routes/tides.js';

/**
 * Builds a Fastify test app with all routes registered.
 * Logger is disabled to keep test output clean.
 * Uses Fastify's .inject() for zero-network testing.
 */
export async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(crabsRoutes);
  await app.register(secretsRoutes);
  await app.register(executeRoutes);
  await app.register(tidesRoutes);
  return app;
}
