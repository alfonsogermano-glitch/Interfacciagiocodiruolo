import argon2 from 'argon2';

const POLICY = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

export function validateNewPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) {
    throw new TypeError('Password must contain 12 to 256 characters');
  }
  return password;
}

export async function hashPassword(password) {
  validateNewPassword(password);
  return argon2.hash(password, POLICY);
}

export async function verifyPassword(encodedHash, password) {
  if (typeof encodedHash !== 'string' || !encodedHash.startsWith('$argon2id$') ||
      typeof password !== 'string' || password.length > 256) return false;
  try {
    return await argon2.verify(encodedHash, password);
  } catch {
    return false;
  }
}
