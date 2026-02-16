import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockDb, resetDbMocks } from '../helpers/db-mock.js';
import { buildApp } from '../helpers/app.js';

vi.mock('../../src/lib/db.js', () => ({ db: mockDb }));

const VALID_KEY = 'a'.repeat(64);

describe('secrets routes', () => {
  beforeEach(() => {
    resetDbMocks();
    process.env.MASTER_PEARL = VALID_KEY;
  });

  describe('POST /v1/secrets', () => {
    it('encrypts and stores a credential', async () => {
      const app = await buildApp();
      mockDb.crab.findUnique.mockResolvedValue({ id: 'crab-1', name: 'bot' });
      mockDb.pearl.upsert.mockResolvedValue({
        id: 'pearl-1',
        crabId: 'crab-1',
        service: 'github',
        label: 'GitHub token',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await app.inject({
        method: 'POST',
        url: '/v1/secrets',
        body: { crabId: 'crab-1', service: 'github', plaintext: 'ghp_secret', label: 'GitHub token' },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.service).toBe('github');
      // Plaintext must never appear in the response
      expect(JSON.stringify(body)).not.toContain('ghp_secret');

      // Verify the upsert was called with encrypted data (not plaintext)
      const upsertCall = mockDb.pearl.upsert.mock.calls[0][0];
      expect(upsertCall.create.encryptedBlob).toBeDefined();
      expect(upsertCall.create.encryptedBlob).not.toBe('ghp_secret');
    });

    it('returns 400 if required fields are missing', async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: 'POST',
        url: '/v1/secrets',
        body: { crabId: 'crab-1' }, // missing service and plaintext
      });

      expect(res.statusCode).toBe(400);
    });

    it('returns 404 if the crab does not exist', async () => {
      const app = await buildApp();
      mockDb.crab.findUnique.mockResolvedValue(null);

      const res = await app.inject({
        method: 'POST',
        url: '/v1/secrets',
        body: { crabId: 'ghost', service: 'github', plaintext: 'token' },
      });

      expect(res.statusCode).toBe(404);
    });

    it('upserts — does not create a duplicate for the same (crabId, service)', async () => {
      const app = await buildApp();
      mockDb.crab.findUnique.mockResolvedValue({ id: 'crab-1' });
      mockDb.pearl.upsert.mockResolvedValue({
        id: 'pearl-1',
        crabId: 'crab-1',
        service: 'github',
        label: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await app.inject({
        method: 'POST',
        url: '/v1/secrets',
        body: { crabId: 'crab-1', service: 'github', plaintext: 'first-token' },
      });
      await app.inject({
        method: 'POST',
        url: '/v1/secrets',
        body: { crabId: 'crab-1', service: 'github', plaintext: 'updated-token' },
      });

      // upsert called twice, not create twice
      expect(mockDb.pearl.upsert).toHaveBeenCalledTimes(2);
    });
  });

  describe('GET /v1/secrets', () => {
    it('returns pearls without encrypted fields', async () => {
      const app = await buildApp();
      mockDb.pearl.findMany.mockResolvedValue([
        { id: 'p-1', crabId: 'crab-1', service: 'github', label: null, createdAt: new Date(), updatedAt: new Date() },
      ]);

      const res = await app.inject({ method: 'GET', url: '/v1/secrets' });

      expect(res.statusCode).toBe(200);
      const { pearls } = res.json();
      expect(pearls).toHaveLength(1);
      pearls.forEach((p: Record<string, unknown>) => {
        expect(p).not.toHaveProperty('encryptedBlob');
        expect(p).not.toHaveProperty('iv');
        expect(p).not.toHaveProperty('authTag');
      });
    });

    it('filters by crabId when provided', async () => {
      const app = await buildApp();
      mockDb.pearl.findMany.mockResolvedValue([]);

      await app.inject({ method: 'GET', url: '/v1/secrets?crabId=crab-1' });

      expect(mockDb.pearl.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { crabId: 'crab-1' } }),
      );
    });

    it('fetches all pearls when no crabId is provided', async () => {
      const app = await buildApp();
      mockDb.pearl.findMany.mockResolvedValue([]);

      await app.inject({ method: 'GET', url: '/v1/secrets' });

      expect(mockDb.pearl.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: undefined }),
      );
    });
  });

  describe('DELETE /v1/secrets/:id', () => {
    it('deletes a pearl by id', async () => {
      const app = await buildApp();
      mockDb.pearl.findUnique.mockResolvedValue({ id: 'pearl-1', crabId: 'crab-1', service: 'github' });
      mockDb.pearl.delete.mockResolvedValue({});

      const res = await app.inject({ method: 'DELETE', url: '/v1/secrets/pearl-1' });

      expect(res.statusCode).toBe(204);
      expect(mockDb.pearl.delete).toHaveBeenCalledWith({ where: { id: 'pearl-1' } });
    });

    it('returns 404 if pearl does not exist', async () => {
      const app = await buildApp();
      mockDb.pearl.findUnique.mockResolvedValue(null);

      const res = await app.inject({ method: 'DELETE', url: '/v1/secrets/ghost' });

      expect(res.statusCode).toBe(404);
    });
  });
});
