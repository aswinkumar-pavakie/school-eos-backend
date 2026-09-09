// Opaque-token and OTP helpers shared across the identity module.
//
// Refresh tokens and OTP codes are hashed with SHA-256, not Argon2id: both need an
// equality lookup by hash (find the session row / find the challenge row), which
// requires a deterministic digest. Argon2id's random-salt-per-call design is for
// low-entropy secrets (passwords) verified against one known row — it's the right
// choice for password_hash, and the wrong tool for these.

import { randomBytes, randomInt, createHash } from 'crypto';
import * as argon2 from 'argon2';

export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

const TEMP_PASSWORD_ALPHABET =
  'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

/** Admin-issued temporary password: random, readable (no ambiguous 0/O/1/l/I), never logged. */
export function generateTempPassword(length = 12): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += TEMP_PASSWORD_ALPHABET[bytes[i] % TEMP_PASSWORD_ALPHABET.length];
  }
  return out;
}
