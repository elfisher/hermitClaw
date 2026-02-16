import type { FastifyInstance } from 'fastify';
import { db } from '../lib/db.js';
import { requireAdmin } from '../lib/auth.js';

export async function tidesRoutes(app: FastifyInstance) {
  /**
   * GET /v1/tides
   * Paginated audit log. Optional ?crabId= filter.
   */
  app.get<{
    Querystring: { crabId?: string; page?: string; limit?: string };
  }>('/v1/tides', { preHandler: [requireAdmin] }, async (request, reply) => {
    const crabId = request.query.crabId;
    const page = Math.max(1, parseInt(request.query.page ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(request.query.limit ?? '50', 10)));
    const skip = (page - 1) * limit;

    const [tides, total] = await Promise.all([
      db.tide.findMany({
        where: crabId ? { crabId } : undefined,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { crab: { select: { name: true } } },
      }),
      db.tide.count({ where: crabId ? { crabId } : undefined }),
    ]);

    return reply.send({
      tides,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  });
}
