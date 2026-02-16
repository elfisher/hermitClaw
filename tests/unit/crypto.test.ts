import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { encryptPearl, decryptPearl } from '../../src/lib/crypto.js';

const VALID_KEY = 'a'.repeat(64); // 64 hex chars = 32 bytes

describe('crypto', () => {
  beforeEach(() => {
    process.env.MASTER_PEARL = VALID_KEY;
  });

  afterEach(() => {
    delete process.env.MASTER_PEARL;
  });

  describe('encryptPearl', () => {
    it('returns an object with encryptedBlob, iv, and authTag', () => {
      const result = encryptPearl('my-secret-api-key');
      expect(result).toHaveProperty('encryptedBlob');
      expect(result).toHaveProperty('iv');
      expect(result).toHaveProperty('authTag');
    });

    it('returns hex strings for all fields', () => {
      const result = encryptPearl('test');
      expect(result.encryptedBlob).toMatch(/^[0-9a-f]+$/);
      expect(result.iv).toMatch(/^[0-9a-f]+$/);
      expect(result.authTag).toMatch(/^[0-9a-f]+$/);
    });

    it('generates a unique IV on every call', () => {
      const a = encryptPearl('same-secret');
      const b = encryptPearl('same-secret');
      expect(a.iv).not.toBe(b.iv);
      expect(a.encryptedBlob).not.toBe(b.encryptedBlob);
    });

    it('produces a 32-char (16-byte) IV', () => {
      const { iv } = encryptPearl('test');
      expect(iv).toHaveLength(32);
    });

    it('throws if MASTER_PEARL is not set', () => {
      delete process.env.MASTER_PEARL;
      expect(() => encryptPearl('test')).toThrow('MASTER_PEARL');
    });

    it('throws if MASTER_PEARL is wrong length', () => {
      process.env.MASTER_PEARL = 'tooshort';
      expect(() => encryptPearl('test')).toThrow('MASTER_PEARL');
    });
  });

  describe('decryptPearl', () => {
    it('roundtrip: decrypted value matches original plaintext', () => {
      const plaintext = 'ghp_SuperSecretGitHubToken123';
      const encrypted = encryptPearl(plaintext);
      const decrypted = decryptPearl(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('roundtrip works with special characters', () => {
      const plaintext = 'sk-ant-🦀💎 secret/with+special=chars&more';
      const encrypted = encryptPearl(plaintext);
      expect(decryptPearl(encrypted)).toBe(plaintext);
    });

    it('throws if authTag is tampered with', () => {
      const encrypted = encryptPearl('my-secret');
      const tampered = { ...encrypted, authTag: 'ff'.repeat(16) };
      expect(() => decryptPearl(tampered)).toThrow();
    });

    it('throws if encryptedBlob is tampered with', () => {
      const encrypted = encryptPearl('my-secret');
      const tampered = { ...encrypted, encryptedBlob: 'deadbeef'.repeat(4) };
      expect(() => decryptPearl(tampered)).toThrow();
    });

    it('throws if iv is wrong', () => {
      const encrypted = encryptPearl('my-secret');
      const tampered = { ...encrypted, iv: 'ff'.repeat(16) };
      expect(() => decryptPearl(tampered)).toThrow();
    });

    it('throws if MASTER_PEARL is not set at decrypt time', () => {
      const encrypted = encryptPearl('my-secret');
      delete process.env.MASTER_PEARL;
      expect(() => decryptPearl(encrypted)).toThrow('MASTER_PEARL');
    });
  });
});
