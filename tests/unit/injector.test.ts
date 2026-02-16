import { describe, it, expect } from 'vitest';
import { injectCredential } from '../../src/lib/injector.js';

const TARGET_URL = 'https://api.example.com/v1/repos';
const SECRET = 'my-secret-token';

describe('injectCredential', () => {
  describe('bearer', () => {
    it('sets Authorization: Bearer header', () => {
      const { headers } = injectCredential(TARGET_URL, SECRET, { authType: 'bearer' });
      expect(headers['Authorization']).toBe(`Bearer ${SECRET}`);
    });

    it('does not modify the URL', () => {
      const { url } = injectCredential(TARGET_URL, SECRET, { authType: 'bearer' });
      expect(url).toBe(TARGET_URL);
    });
  });

  describe('basic', () => {
    it('base64-encodes the secret and sets Authorization: Basic header', () => {
      const { headers } = injectCredential(TARGET_URL, 'user:pass', { authType: 'basic' });
      const expected = Buffer.from('user:pass').toString('base64');
      expect(headers['Authorization']).toBe(`Basic ${expected}`);
    });

    it('does not modify the URL', () => {
      const { url } = injectCredential(TARGET_URL, 'user:pass', { authType: 'basic' });
      expect(url).toBe(TARGET_URL);
    });
  });

  describe('header', () => {
    it('sets the secret as a custom header', () => {
      const { headers } = injectCredential(TARGET_URL, SECRET, {
        authType: 'header',
        paramName: 'X-Api-Key',
      });
      expect(headers['X-Api-Key']).toBe(SECRET);
    });

    it('throws if paramName is not provided', () => {
      expect(() =>
        injectCredential(TARGET_URL, SECRET, { authType: 'header' }),
      ).toThrow("authType 'header' requires paramName");
    });

    it('does not set an Authorization header', () => {
      const { headers } = injectCredential(TARGET_URL, SECRET, {
        authType: 'header',
        paramName: 'X-Api-Key',
      });
      expect(headers['Authorization']).toBeUndefined();
    });
  });

  describe('queryparam', () => {
    it('appends the secret as a query parameter', () => {
      const { url } = injectCredential(TARGET_URL, SECRET, {
        authType: 'queryparam',
        paramName: 'api_key',
      });
      expect(new URL(url).searchParams.get('api_key')).toBe(SECRET);
    });

    it('preserves existing query parameters', () => {
      const urlWithQuery = `${TARGET_URL}?foo=bar`;
      const { url } = injectCredential(urlWithQuery, SECRET, {
        authType: 'queryparam',
        paramName: 'api_key',
      });
      const parsed = new URL(url);
      expect(parsed.searchParams.get('foo')).toBe('bar');
      expect(parsed.searchParams.get('api_key')).toBe(SECRET);
    });

    it('throws if paramName is not provided', () => {
      expect(() =>
        injectCredential(TARGET_URL, SECRET, { authType: 'queryparam' }),
      ).toThrow("authType 'queryparam' requires paramName");
    });
  });

  describe('default headers', () => {
    it('always sets Content-Type and User-Agent', () => {
      const { headers } = injectCredential(TARGET_URL, SECRET, { authType: 'bearer' });
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['User-Agent']).toBe('HermitClaw/1.0');
    });
  });
});
