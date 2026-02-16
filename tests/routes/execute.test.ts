import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockDb, resetDbMocks } from '../helpers/db-mock.js';
import { buildApp } from '../helpers/app.js';

vi.mock('../../src/lib/db.js', () => ({ db: mockDb }));
vi.mock('undici');

const VALID_KEY = 'a'.repeat(64);

// Shared fixtures
const activeCrab = { id: 'crab-1', name: 'test-bot', token: 'valid-token', active: true };
const encryptedPearl = {
  id: 'pearl-1',
  crabId: 'crab-1',
  service: 'github',
  encryptedBlob: '',
  iv: '',
  authTag: '',
};

async function getEncryptedPearl() {
  const { encryptPearl } = await import('../../src/lib/crypto.js');
  const result = encryptPearl('real-github-token');
  return { ...encryptedPearl, ...result };
}

describe('execute routes', () => {
  beforeEach(() => {
    resetDbMocks();
    process.env.MASTER_PEARL = VALID_KEY;
  });

  describe('authentication', () => {
    it('returns 401 with no Authorization header', async () => {
      const app = await buildApp();
      const res = await app.inject({ method: 'POST', url: '/v1/execute', body: {} });
      expect(res.statusCode).toBe(401);
    });

    it('returns 401 with a malformed Authorization header', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/v1/execute',
        headers: { authorization: 'Token abc123' },
        body: {},
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns 401 with an invalid token', async () => {
      const app = await buildApp();
      mockDb.crab.findUnique.mockResolvedValue(null);

      const res = await app.inject({
        method: 'POST',
        url: '/v1/execute',
        headers: { authorization: 'Bearer wrong-token' },
        body: { service: 'github', url: 'https://api.github.com/user' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns 403 if the agent has been revoked', async () => {
      const app = await buildApp();
      mockDb.crab.findUnique.mockResolvedValue({ ...activeCrab, active: false });

      const res = await app.inject({
        method: 'POST',
        url: '/v1/execute',
        headers: { authorization: 'Bearer valid-token' },
        body: { service: 'github', url: 'https://api.github.com/user' },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toMatch(/revoked/i);
    });
  });

  describe('request validation', () => {
    it('returns 400 if service is missing', async () => {
      const app = await buildApp();
      mockDb.crab.findUnique.mockResolvedValue(activeCrab);

      const res = await app.inject({
        method: 'POST',
        url: '/v1/execute',
        headers: { authorization: 'Bearer valid-token' },
        body: { url: 'https://api.github.com/user' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 if url is missing', async () => {
      const app = await buildApp();
      mockDb.crab.findUnique.mockResolvedValue(activeCrab);

      const res = await app.inject({
        method: 'POST',
        url: '/v1/execute',
        headers: { authorization: 'Bearer valid-token' },
        body: { service: 'github' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 for an invalid URL', async () => {
      const app = await buildApp();
      mockDb.crab.findUnique.mockResolvedValue(activeCrab);

      const res = await app.inject({
        method: 'POST',
        url: '/v1/execute',
        headers: { authorization: 'Bearer valid-token' },
        body: { service: 'github', url: 'not-a-url' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('SSRF guard', () => {
    const ssrfUrls = [
      'http://localhost/internal',
      'http://127.0.0.1/secret',
      'http://service.internal/db',
    ];

    ssrfUrls.forEach((url) => {
      it(`blocks ${url}`, async () => {
        const app = await buildApp();
        mockDb.crab.findUnique.mockResolvedValue(activeCrab);

        const res = await app.inject({
          method: 'POST',
          url: '/v1/execute',
          headers: { authorization: 'Bearer valid-token' },
          body: { service: 'github', url },
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().error).toMatch(/internal/i);
      });
    });
  });

  describe('happy path', () => {
    it('decrypts credential, calls upstream, logs to tides, returns response', async () => {
      const undici = await import('undici');
      const mockRequest = vi.mocked(undici.request);

      const app = await buildApp();
      const pearl = await getEncryptedPearl();

      mockDb.crab.findUnique.mockResolvedValue(activeCrab);
      mockDb.pearl.findUnique.mockResolvedValue(pearl);
      mockDb.tide.create.mockResolvedValue({});
      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: { text: async () => JSON.stringify({ login: 'elfisher' }) },
      } as any);

      const res = await app.inject({
        method: 'POST',
        url: '/v1/execute',
        headers: { authorization: 'Bearer valid-token' },
        body: { service: 'github', url: 'https://api.github.com/user' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().body).toEqual({ login: 'elfisher' });

      // Verify upstream was called with injected auth header
      const [calledUrl, calledOptions] = mockRequest.mock.calls[0];
      expect(calledUrl).toBe('https://api.github.com/user');
      expect((calledOptions as any).headers['Authorization']).toMatch(/^Bearer /);
      // Real secret must NOT appear in the header value check below
      expect((calledOptions as any).headers['Authorization']).not.toBe('Bearer ghp_secret');

      // Verify audit log was written
      expect(mockDb.tide.create).toHaveBeenCalledOnce();
      const tideCall = mockDb.tide.create.mock.calls[0][0];
      expect(tideCall.data.direction).toBe('EGRESS');
      expect(tideCall.data.statusCode).toBe(200);
    });

    it('passes through upstream status codes (e.g. 404)', async () => {
      const undici = await import('undici');
      vi.mocked(undici.request).mockResolvedValue({
        statusCode: 404,
        body: { text: async () => JSON.stringify({ message: 'Not Found' }) },
      } as any);

      const app = await buildApp();
      const pearl = await getEncryptedPearl();
      mockDb.crab.findUnique.mockResolvedValue(activeCrab);
      mockDb.pearl.findUnique.mockResolvedValue(pearl);
      mockDb.tide.create.mockResolvedValue({});

      const res = await app.inject({
        method: 'POST',
        url: '/v1/execute',
        headers: { authorization: 'Bearer valid-token' },
        body: { service: 'github', url: 'https://api.github.com/repos/missing/repo' },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('error handling', () => {
    it('returns 404 if no pearl exists for the requested service', async () => {
      const app = await buildApp();
      mockDb.crab.findUnique.mockResolvedValue(activeCrab);
      mockDb.pearl.findUnique.mockResolvedValue(null);
      mockDb.tide.create.mockResolvedValue({});

      const res = await app.inject({
        method: 'POST',
        url: '/v1/execute',
        headers: { authorization: 'Bearer valid-token' },
        body: { service: 'slack', url: 'https://slack.com/api/chat.postMessage' },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toMatch(/slack/i);
      // Error should still be logged to tides
      expect(mockDb.tide.create).toHaveBeenCalledOnce();
    });

    it('returns 502 if the upstream request throws a network error', async () => {
      const undici = await import('undici');
      vi.mocked(undici.request).mockRejectedValue(new Error('ECONNREFUSED'));

      const app = await buildApp();
      const pearl = await getEncryptedPearl();
      mockDb.crab.findUnique.mockResolvedValue(activeCrab);
      mockDb.pearl.findUnique.mockResolvedValue(pearl);
      mockDb.tide.create.mockResolvedValue({});

      const res = await app.inject({
        method: 'POST',
        url: '/v1/execute',
        headers: { authorization: 'Bearer valid-token' },
        body: { service: 'github', url: 'https://api.github.com/user' },
      });

      expect(res.statusCode).toBe(502);
      expect(res.json().error).toMatch(/upstream/i);
      // Network error should still be logged
      expect(mockDb.tide.create).toHaveBeenCalledOnce();
    });
  });
});
