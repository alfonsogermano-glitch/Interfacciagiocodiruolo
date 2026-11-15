import { createHmac } from 'node:crypto';

export function canonicalEmail(email) {
  if (typeof email !== 'string') throw new TypeError('Invalid email');
  const value = email.trim().toLowerCase();
  if (value.length < 3 || value.length > 320 || !value.includes('@')) {
    throw new TypeError('Invalid email');
  }
  return value;
}

// HMAC keeps direct email/IP addresses out of persistent counter tables.
// This does NOT itself enforce throttling: the caller must atomically increment
// PostgreSQL counters before doing expensive account/password operations.
export function rateLimitSubjectDigest({ secret, action, category, value }) {
  if (!Buffer.isBuffer(secret) || secret.length < 32) throw new TypeError('HMAC key too short');
  if (!['login', 'signup', 'password_reset', 'password_setup'].includes(action)) {
    throw new TypeError('Invalid action');
  }
  if (!['account', 'network'].includes(category)) throw new TypeError('Invalid category');
  if (typeof value !== 'string' || value.length < 1 || value.length > 512) {
    throw new TypeError('Invalid subject');
  }
  return createHmac('sha256', secret).update(JSON.stringify([action, category, value]), 'utf8').digest();
}

// Public forgot-password endpoints should return the same message regardless
// of whether an email address belongs to an account. Responses need identical
// HTTP status and shape; throttling and timing defenses remain required.
export function publicPasswordResetAcknowledgement() {
  return Object.freeze({
    message: 'Se l’indirizzo è registrato, riceverai le istruzioni via email.',
  });
}
