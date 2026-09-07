// AES-256-GCM encryption for the one long-lived secret this module ever persists: a
// faculty's Google refresh token (google_account_connection.refresh_token_encrypted).
// The key itself is never hard-coded here — it comes from ConfigService, keyed by
// encryption_key_id, so rotating to a new key later means adding a new env var + a
// new case below, not touching any already-encrypted row.

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;

export interface EncryptedToken {
  ciphertext: string;
  keyId: string;
}

function resolveKey(keyId: string, keys: Record<string, string>): Buffer {
  const base64Key = keys[keyId];
  if (!base64Key) {
    throw new Error(`No encryption key configured for key id "${keyId}"`);
  }
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== 32) {
    throw new Error(`Encryption key "${keyId}" must decode to exactly 32 bytes for AES-256-GCM`);
  }
  return key;
}

/** Encrypts with the current key (always "v1" until a rotation adds a newer one). */
export function encryptRefreshToken(
  plaintext: string,
  keys: Record<string, string>,
  currentKeyId = 'v1',
): EncryptedToken {
  const key = resolveKey(currentKeyId, keys);
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // iv.authTag.ciphertext, each base64 — self-describing enough to decrypt without
  // guessing lengths.
  const ciphertext = [iv, authTag, encrypted].map((b) => b.toString('base64')).join('.');
  return { ciphertext, keyId: currentKeyId };
}

export function decryptRefreshToken(
  ciphertext: string,
  keyId: string,
  keys: Record<string, string>,
): string {
  const key = resolveKey(keyId, keys);
  const [ivB64, authTagB64, dataB64] = ciphertext.split('.');
  if (!ivB64 || !authTagB64 || !dataB64) {
    throw new Error('Malformed encrypted token payload');
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
