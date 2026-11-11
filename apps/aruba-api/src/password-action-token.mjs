import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

// A reset/setup link contains 32 random bytes (256 bits). Only its SHA-256
// digest may be stored. The link itself must never be logged or persisted.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const RESET_TOKEN_TTL_MINUTES = 30;

export function createPasswordActionToken() {
  return randomBytes(32).toString('base64url');
}

export function hashPasswordActionToken(token) {
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token) ||
      Buffer.from(token, 'base64url').toString('base64url') !== token) {
    throw new TypeError('Invalid password action token');
  }
  return createHash('sha256').update(token, 'utf8').digest();
}

export function matchPasswordActionToken(token, storedDigest) {
  if (!Buffer.isBuffer(storedDigest) || storedDigest.length !== 32) return false;
  try {
    return timingSafeEqual(hashPasswordActionToken(token), storedDigest);
  } catch {
    return false;
  }
}
