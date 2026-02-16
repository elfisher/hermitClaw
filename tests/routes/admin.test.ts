import { describe, it, expect, vi } from 'vitest';
import { buildApp } from '../helpers/app.js';

describe('admin authentication', () => {
  const protectedRoutes = [
    { method: 'POST', url: '/v1/crabs', body: {} },
    { method: 'GET', url: '/v1/crabs' },
    { method: 'PATCH', url: '/v1/crabs/some-id/revoke' },
    { method: 'POST', url: '/v1/secrets', body: {} },
    { method: 'GET', url: '/v1/secrets' },
    { method: 'DELETE', url: '/v1/secrets/some-id' },
    { method: 'GET', url: '/v1/tides' },
  ];

  protectedRoutes.forEach(({ method, url, body }) => {
    it(`(${method} ${url}) succeeds with a valid admin key`, async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: method as any,
        url,
        headers: { 'x-admin-api-key': process.env.ADMIN_API_KEY },
        body,
      });
      // We don't care about the actual response, just that it's not 401
      expect(res.statusCode).not.toBe(401);
    });

    it(`(${method} ${url}) fails with an invalid admin key`, async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: method as any,
        url,
        headers: { 'x-admin-api-key': 'invalid-key' },
        body,
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe('Invalid admin API key');
    });

    it(`(${method} ${url}) fails with a missing admin key`, async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: method as any,
        url,
        body,
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe('Missing x-admin-api-key header');
    });
  });
});
