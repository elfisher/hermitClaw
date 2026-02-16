import { describe, it, expect, vi } from 'vitest';
import { isSafeUrl } from '../../src/lib/ssrf.js';
import { lookup } from 'node:dns/promises';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}));

describe('ssrf protection', () => {
  const mockLookup = vi.mocked(lookup);

  it('allows a public IP address', async () => {
    mockLookup.mockResolvedValue({ address: '8.8.8.8', family: 4 });
    const result = await isSafeUrl('http://example.com');
    expect(result).toBe(true);
  });

  it('rejects a private IP address', async () => {
    mockLookup.mockResolvedValue({ address: '192.168.1.1', family: 4 });
    const result = await isSafeUrl('http://private-router.local');
    expect(result).toBe(false);
  });

  it('rejects a loopback address', async () => {
    mockLookup.mockResolvedValue({ address: '127.0.0.1', family: 4 });
    const result = await isSafeUrl('http://localhost');
    expect(result).toBe(false);
  });

  it('rejects a domain that resolves to a private IP address', async () => {
    mockLookup.mockResolvedValue({ address: '10.0.0.1', family: 4 });
    const result = await isSafeUrl('http://internal-service');
    expect(result).toBe(false);
  });

  it('rejects a url that fails to resolve', async () => {
    mockLookup.mockRejectedValue(new Error('Failed to resolve'));
    const result = await isSafeUrl('http://non-existent-domain');
    expect(result).toBe(false);
  });
});
