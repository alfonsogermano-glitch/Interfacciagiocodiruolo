import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

// 32 random bytes of entropy. Store only SHA-256 digest in PostgreSQL.
// No authentication endpoint consumes these helpers until rate limiting,
// cookie policy and account migration have been separately reviewed.
export function createOpaqueSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    throw new TypeError('Invalid session token');
  }
  return createHash('sha256').update(token, 'utf8').digest();
}

export function matchSessionToken(token, digest) {
  if (!Buffer.isBuffer(digest) || digest.length !== 32) return false;
  try {
    return timingSafeEqual(hashSessionToken(token), digest);
  } catch {
    return false;
  }
}
