import { vi } from 'vitest';

/**
 * Shared mock for the Prisma db client.
 *
 * Usage in a test file:
 *
 *   import { mockDb } from '../helpers/db-mock.js';
 *   vi.mock('../../src/lib/db.js', () => ({ db: mockDb }));
 *
 * Then in tests:
 *   mockDb.crab.findUnique.mockResolvedValue({ ... })
 */
export const mockDb = {
  crab: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  pearl: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
  },
  tide: {
    create: vi.fn(),
  },
};

/** Reset all mocks between tests — call in beforeEach. */
export function resetDbMocks() {
  vi.clearAllMocks();
}
