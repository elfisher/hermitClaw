import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockDb, resetDbMocks } from '../helpers/db-mock.js';
import { buildApp } from '../helpers/app.js';
import type { Crab } from '@prisma/client';

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
  allowedTools: [
    { url: 'https://api.github.com/user', method: 'GET' },
    { url: 'https://api.github.com/repos/.*/issues', method: 'POST' },
  ],
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

describe('execute routes: allowlist', () => {
  beforeEach(() => {
    resetDbMocks();
    process.env.MASTER_PEARL = VALID_KEY;
  });

  it('succeeds with a tool that is in the allowedTools array', async () => {
    const app = await buildApp();
    const pearl = await getEncryptedPearl();
    mockDb.crab.findUnique.mockResolvedValue(activeCrab);
    mockDb.pearl.findUnique.mockResolvedValue(pearl);
    mockDb.tide.create.mockResolvedValue({});

    const res = await app.inject({
      method: 'POST',
      url: '/v1/execute',
      headers: { authorization: `Bearer ${activeCrab.token}` },
      body: { service: 'github', url: 'https://api.github.com/user', method: 'GET' },
    });

    expect(res.statusCode).not.toBe(403);
  });

  it('succeeds with a tool that matches a regex in the allowedTools array', async () => {
    const app = await buildApp();
    const pearl = await getEncryptedPearl();
    mockDb.crab.findUnique.mockResolvedValue(activeCrab);
    mockDb.pearl.findUnique.mockResolvedValue(pearl);
    mockDb.tide.create.mockResolvedValue({});

    const res = await app.inject({
      method: 'POST',
      url: '/v1/execute',
      headers: { authorization: `Bearer ${activeCrab.token}` },
      body: { service: 'github', url: 'https://api.github.com/repos/owner/repo/issues', method: 'POST' },
    });

    expect(res.statusCode).not.toBe(403);
  });

  it('fails with a tool that is not in the allowedTools array', async () => {
    const app = await buildApp();
    const pearl = await getEncryptedPearl();
    mockDb.crab.findUnique.mockResolvedValue(activeCrab);
    mockDb.pearl.findUnique.mockResolvedValue(pearl);
    mockDb.tide.create.mockResolvedValue({});

    const res = await app.inject({
      method: 'POST',
      url: '/v1/execute',
      headers: { authorization: `Bearer ${activeCrab.token}` },
      body: { service: 'github', url: 'https://api.github.com/orgs/some-org', method: 'GET' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('Tool not allowed');
  });

  it('fails when the allowedTools array is empty', async () => {
    const app = await buildApp();
    const pearl = await getEncryptedPearl();
    const crabWithEmptyAllowlist = { ...activeCrab, allowedTools: [] };
    mockDb.crab.findUnique.mockResolvedValue(crabWithEmptyAllowlist);
    mockDb.pearl.findUnique.mockResolvedValue(pearl);
    mockDb.tide.create.mockResolvedValue({});

    const res = await app.inject({
      method: 'POST',
      url: '/v1/execute',
      headers: { authorization: `Bearer ${activeCrab.token}` },
      body: { service: 'github', url: 'https://api.github.com/user', method: 'GET' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('Tool not allowed');
  });

  it('succeeds when the allowedTools is null', async () => {
    const app = await buildApp();
    const pearl = await getEncryptedPearl();
    const crabWithNullAllowlist = { ...activeCrab, allowedTools: null };
    mockDb.crab.findUnique.mockResolvedValue(crabWithNullAllowlist);
    mockDb.pearl.findUnique.mockResolvedValue(pearl);
    mockDb.tide.create.mockResolvedValue({});

    const res = await app.inject({
      method: 'POST',
      url: '/v1/execute',
      headers: { authorization: `Bearer ${activeCrab.token}` },
      body: { service: 'github', url: 'https://api.github.com/user', method: 'GET' },
    });

    expect(res.statusCode).not.toBe(403);
  });
});
