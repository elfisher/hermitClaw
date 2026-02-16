import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockDb, resetDbMocks } from '../helpers/db-mock.js';
import { buildApp } from '../helpers/app.js';
import type { Crab } from '@prisma/client';

vi.mock('../../src/lib/db.js', () => ({ db: mockDb }));

const VALID_KEY = 'a'.repeat(64);

const activeCrab: Crab = {
  id: 'crab-1',
  name: 'test-bot',
  token: 'valid-token',
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  allowedTools: null,
  expiresAt: null,
};

const expiredCrab: Crab = {
  id: 'crab-2',
  name: 'expired-bot',
  token: 'expired-token',
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  allowedTools: null,
  expiresAt: new Date('2023-01-01T00:00:00.000Z'), // Expired in the past
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

describe('token rotation', () => {
  beforeEach(() => {
    resetDbMocks();
    process.env.MASTER_PEARL = VALID_KEY;
  });

  it('allows a token that has not expired', async () => {
    const app = await buildApp();
    const pearl = await getEncryptedPearl();
    mockDb.crab.findUnique.mockResolvedValue(activeCrab);
    mockDb.pearl.findUnique.mockResolvedValue(pearl);
    mockDb.tide.create.mockResolvedValue({});

    const res = await app.inject({
      method: 'POST',
      url: '/v1/execute',
      headers: { authorization: `Bearer ${activeCrab.token}` },
      body: { service: 'github', url: 'https://api.github.com/user' },
    });

    expect(res.statusCode).not.toBe(403);
  });

  it('rejects a token that has expired', async () => {
    const app = await buildApp();
    const pearl = await getEncryptedPearl();
    mockDb.crab.findUnique.mockResolvedValue(expiredCrab);
    mockDb.pearl.findUnique.mockResolvedValue(pearl);
    mockDb.tide.create.mockResolvedValue({});

    const res = await app.inject({
      method: 'POST',
      url: '/v1/execute',
      headers: { authorization: `Bearer ${expiredCrab.token}` },
      body: { service: 'github', url: 'https://api.github.com/user' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatch(/expired/i);
  });
});
