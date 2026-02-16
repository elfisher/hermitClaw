import Fastify from 'fastify';
import { crabsRoutes } from './routes/crabs.js';
import { secretsRoutes } from './routes/secrets.js';
import { executeRoutes } from './routes/execute.js';

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

// Routes
await server.register(crabsRoutes);
await server.register(secretsRoutes);
await server.register(executeRoutes);

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
