import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPasswordActionToken,
  hashPasswordActionToken,
  matchPasswordActionToken,
  RESET_TOKEN_TTL_MINUTES,
} from '../src/password-action-token.mjs';

test('password action tokens have 256 bits of random entropy', () => {
  const a = createPasswordActionToken();
  const b = createPasswordActionToken();
  assert.match(a, /^[a-zA-Z0-9_-]{43}$/);
  assert.equal(Buffer.from(a, 'base64url').length, 32);
  assert.notEqual(a, b);
  assert.equal(RESET_TOKEN_TTL_MINUTES, 30);
});

test('only a digest is suitable for storage, and it validates the original token', () => {
  const token = createPasswordActionToken();
  const digest = hashPasswordActionToken(token);
  assert.equal(digest.length, 32);
  assert.ok(matchPasswordActionToken(token, digest));
  assert.equal(matchPasswordActionToken(createPasswordActionToken(), digest), false);
});

test('invalid tokens and digests never match', () => {
  const digest = hashPasswordActionToken(createPasswordActionToken());
  for (const bad of [null, '', 'x', '$'.repeat(43), 'x'.repeat(42), 'x'.repeat(44)]) {
    assert.equal(matchPasswordActionToken(bad, digest), false);
  }
  assert.equal(matchPasswordActionToken(createPasswordActionToken(), Buffer.alloc(31)), false);
  assert.equal(matchPasswordActionToken(createPasswordActionToken(), null), false);
});
