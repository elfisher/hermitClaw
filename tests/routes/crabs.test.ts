import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockDb, resetDbMocks } from '../helpers/db-mock.js';
import { buildApp } from '../helpers/app.js';

vi.mock('../../src/lib/db.js', () => ({ db: mockDb }));

describe('crabs routes', () => {
  beforeEach(() => {
    resetDbMocks();
  });

  describe('POST /v1/crabs', () => {
    it('creates an agent and returns a token', async () => {
      const app = await buildApp();
      mockDb.crab.findUnique.mockResolvedValue(null);
      mockDb.crab.create.mockResolvedValue({
        id: 'crab-1',
        name: 'test-bot',
        token: 'abc123token',
        active: true,
        createdAt: new Date(),
      });

      const res = await app.inject({
        method: 'POST',
        url: '/v1/crabs',
        body: { name: 'test-bot' },
        headers: { 'x-admin-api-key': process.env.ADMIN_API_KEY },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.name).toBe('test-bot');
      expect(body.token).toBeDefined();
      expect(body.active).toBe(true);
    });

    it('returns 400 if name is missing', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/v1/crabs',
        body: {},
        headers: { 'x-admin-api-key': process.env.ADMIN_API_KEY },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 409 if agent name already exists', async () => {
      const app = await buildApp();
      mockDb.crab.findUnique.mockResolvedValue({
        id: 'crab-1',
        name: 'existing-bot',
        token: 'tok',
        active: true,
        createdAt: new Date(),
      });

      const res = await app.inject({
        method: 'POST',
        url: '/v1/crabs',
        body: { name: 'existing-bot' },
        headers: { 'x-admin-api-key': process.env.ADMIN_API_KEY },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error).toMatch(/already exists/i);
    });
  });

  describe('GET /v1/crabs', () => {
    it('returns a list of agents without tokens', async () => {
      const app = await buildApp();
      mockDb.crab.findMany.mockResolvedValue([
        { id: 'crab-1', name: 'bot-a', active: true, createdAt: new Date(), updatedAt: new Date() },
        { id: 'crab-2', name: 'bot-b', active: false, createdAt: new Date(), updatedAt: new Date() },
      ]);

      const res = await app.inject({
        method: 'GET',
        url: '/v1/crabs',
        headers: { 'x-admin-api-key': process.env.ADMIN_API_KEY },
      });

      expect(res.statusCode).toBe(200);
      const { crabs } = res.json();
      expect(crabs).toHaveLength(2);
      crabs.forEach((c: Record<string, unknown>) => {
        expect(c).not.toHaveProperty('token');
      });
    });

    it('returns an empty array when no agents exist', async () => {
      const app = await buildApp();
      mockDb.crab.findMany.mockResolvedValue([]);

      const res = await app.inject({
        method: 'GET',
        url: '/v1/crabs',
        headers: { 'x-admin-api-key': process.env.ADMIN_API_KEY },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().crabs).toEqual([]);
    });
  });

  describe('PATCH /v1/crabs/:id/revoke', () => {
    it('deactivates an agent', async () => {
      const app = await buildApp();
      mockDb.crab.findUnique.mockResolvedValue({ id: 'crab-1', name: 'bot', active: true });
      mockDb.crab.update.mockResolvedValue({
        id: 'crab-1',
        name: 'bot',
        active: false,
        updatedAt: new Date(),
      });

      const res = await app.inject({
        method: 'PATCH',
        url: '/v1/crabs/crab-1/revoke',
        headers: { 'x-admin-api-key': process.env.ADMIN_API_KEY },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().active).toBe(false);
      expect(mockDb.crab.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { active: false } }),
      );
    });

    it('returns 404 if agent does not exist', async () => {
      const app = await buildApp();
      mockDb.crab.findUnique.mockResolvedValue(null);

      const res = await app.inject({
        method: 'PATCH',
        url: '/v1/crabs/nonexistent/revoke',
        headers: { 'x-admin-api-key': process.env.ADMIN_API_KEY },
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
