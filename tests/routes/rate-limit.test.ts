import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockDb, resetDbMocks } from '../helpers/db-mock.js';
import { buildApp } from '../helpers/app.js';
import type { Crab } from '@prisma/client';

vi.mock('../../src/lib/db.js', () => ({ db: mockDb }));
vi.mock('undici');

const VALID_KEY = 'a'.repeat(64);

const crab1: Crab = {
  id: 'crab-1',
  name: 'test-bot-1',
  token: 'valid-token-1',
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  allowedTools: null,
};

const crab2: Crab = {
  id: 'crab-2',
  name: 'test-bot-2',
  token: 'valid-token-2',
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  allowedTools: null,
};

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

describe('rate limiting', () => {
  beforeEach(() => {
    resetDbMocks();
    process.env.MASTER_PEARL = VALID_KEY;
  });

  it('allows requests under the rate limit', async () => {
    const app = await buildApp();
    const pearl = await getEncryptedPearl();
    const undici = await import('undici');
    const mockRequest = vi.mocked(undici.request);
    mockRequest.mockResolvedValue({
      statusCode: 200,
      body: { text: async () => JSON.stringify({ login: 'elfisher' }) },
    } as any);
    mockDb.crab.findUnique.mockResolvedValue(crab1);
    mockDb.pearl.findUnique.mockResolvedValue(pearl);
    mockDb.tide.create.mockResolvedValue({});

    const promises = [];
    for (let i = 0; i < 60; i++) {
      promises.push(
        app.inject({
          method: 'POST',
          url: '/v1/execute',
          headers: { authorization: `Bearer ${crab1.token}` },
          body: { service: 'github', url: 'https://api.github.com/user' },
        }),
      );
    }

    const results = await Promise.all(promises);
    results.forEach(res => expect(res.statusCode).not.toBe(429));
  });

  it('rejects requests over the rate limit', async () => {
    const app = await buildApp();
    const pearl = await getEncryptedPearl();
    const undici = await import('undici');
    const mockRequest = vi.mocked(undici.request);
    mockRequest.mockResolvedValue({
      statusCode: 200,
      body: { text: async () => JSON.stringify({ login: 'elfisher' }) },
    } as any);
    mockDb.crab.findUnique.mockResolvedValue(crab1);
    mockDb.pearl.findUnique.mockResolvedValue(pearl);
    mockDb.tide.create.mockResolvedValue({});

    for (let i = 0; i < 60; i++) {
      await app.inject({
        method: 'POST',
        url: '/v1/execute',
        headers: { authorization: `Bearer ${crab1.token}` },
        body: { service: 'github', url: 'https://api.github.com/user' },
      });
    }

    const res = await app.inject({
      method: 'POST',
      url: '/v1/execute',
      headers: { authorization: `Bearer ${crab1.token}` },
      body: { service: 'github', url: 'https://api.github.com/user' },
    });

    expect(res.statusCode).toBe(429);
  });

  it('does not share rate limits between crabs', async () => {
    const app1 = await buildApp();
    const app2 = await buildApp();
    const pearl = await getEncryptedPearl();
    const undici = await import('undici');
    const mockRequest = vi.mocked(undici.request);
    mockRequest.mockResolvedValue({
      statusCode: 200,
      body: { text: async () => JSON.stringify({ login: 'elfisher' }) },
    } as any);
    mockDb.pearl.findUnique.mockResolvedValue(pearl);
    mockDb.tide.create.mockResolvedValue({});

    // Exhaust crab1's rate limit
    mockDb.crab.findUnique.mockResolvedValue(crab1);
    for (let i = 0; i < 60; i++) {
      await app1.inject({
        method: 'POST',
        url: '/v1/execute',
        headers: { authorization: `Bearer ${crab1.token}` },
        body: { service: 'github', url: 'https://api.github.com/user' },
      });
    }

    // Make sure crab2 can still make requests
    mockDb.crab.findUnique.mockResolvedValue(crab2);
    const res = await app2.inject({
      method: 'POST',
      url: '/v1/execute',
      headers: { authorization: `Bearer ${crab2.token}` },
      body: { service: 'github', url: 'https://api.github.com/user' },
    });

    expect(res.statusCode).not.toBe(429);
  });
});
