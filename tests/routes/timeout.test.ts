import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockDb, resetDbMocks } from '../helpers/db-mock.js';
import { buildApp } from '../helpers/app.js';
import type { Crab } from '@prisma/client';
import { request as undiciRequest } from 'undici';

vi.mock('../../src/lib/db.js', () => ({ db: mockDb }));
vi.mock('undici');

const VALID_KEY = 'a'.repeat(64);

const activeCrab: Crab = {
  id: 'crab-1',
  name: 'test-bot',
  token: 'valid-token',
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

describe('request timeout', () => {
  beforeEach(() => {
    resetDbMocks();
    process.env.MASTER_PEARL = VALID_KEY;
  });

  it('rejects a request that takes longer than 30s', async () => {
    const app = await buildApp();
    const pearl = await getEncryptedPearl();
    const mockRequest = vi.mocked(undiciRequest);
    mockRequest.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 31000));
      return {
        statusCode: 200,
        body: { text: async () => JSON.stringify({ login: 'elfisher' }) },
      } as any;
    });
    mockDb.crab.findUnique.mockResolvedValue(activeCrab);
    mockDb.pearl.findUnique.mockResolvedValue(pearl);
    mockDb.tide.create.mockResolvedValue({});

    const res = await app.inject({
      method: 'POST',
      url: '/v1/execute',
      headers: { authorization: `Bearer ${activeCrab.token}` },
      body: { service: 'github', url: 'https://api.github.com/user' },
    });

    expect(res.statusCode).toBe(502);
    expect(res.json().error).toMatch(/upstream/i);
  }, 32000);
});
