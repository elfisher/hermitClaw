import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';

function getMasterKey(): Buffer {
  const hex = process.env.MASTER_PEARL ?? '';
  const key = Buffer.from(hex, 'hex');
  if (key.length !== 32) {
    throw new Error('CRITICAL: MASTER_PEARL must be a 64-character hex string (32 bytes). Generate with: openssl rand -hex 32');
  }
  return key;
}

export interface EncryptedPearl {
  encryptedBlob: string; // hex — AES-256-GCM ciphertext
  iv: string;            // hex — unique per encryption
  authTag: string;       // hex — GCM authentication tag (tamper detection)
}

/**
 * Encrypts a plaintext secret (e.g. an API key) into an EncryptedPearl.
 * A unique IV is generated for every call — never reuse IVs with the same key.
 */
export function encryptPearl(plaintext: string): EncryptedPearl {
  const key = getMasterKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return {
    encryptedBlob: encrypted,
    iv: iv.toString('hex'),
    authTag,
  };
}

/**
 * Decrypts an EncryptedPearl back to the plaintext secret.
 * Throws if the authTag doesn't match — indicates tampering or wrong key.
 */
export function decryptPearl(pearl: EncryptedPearl): string {
  const key = getMasterKey();
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(pearl.iv, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(pearl.authTag, 'hex'));

  let decrypted = decipher.update(pearl.encryptedBlob, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
