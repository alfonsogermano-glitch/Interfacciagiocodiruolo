import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, validateNewPassword } from '../src/password.mjs';

test('argon2id password hash is salted and validates correct password', async () => {
  const pwd = 'A reliable passphrase - 2026';
  const first = await hashPassword(pwd);
  const second = await hashPassword(pwd);
  assert.ok(first.startsWith('$argon2id$'));
  assert.notEqual(first, second);
  assert.equal(await verifyPassword(first, pwd), true);
  assert.equal(await verifyPassword(first, 'not my password'), false);
});

test('rejects short, oversized and malformed credentials', async () => {
  for (const bad of ['12345678901', '', 'a'.repeat(257), null]) {
    assert.throws(() => validateNewPassword(bad));
  }
  assert.equal(await verifyPassword('plaintext', 'secret'), false);
  assert.equal(await verifyPassword('$argon2id$corrupt', 'secret'), false);
});
