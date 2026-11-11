import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpaqueSessionToken, hashSessionToken, matchSessionToken } from '../src/session-token.mjs';

test('session token contains 32 bytes of cryptographic entropy', () => {
  const token = createOpaqueSessionToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(Buffer.from(token, 'base64url').length, 32);
  assert.notEqual(token, createOpaqueSessionToken());
});

test('tokens are stored as hashes, not as plaintext', () => {
  const token = createOpaqueSessionToken();
  const digest = hashSessionToken(token);
  assert.equal(digest.length, 32);
  assert.equal(digest.toString('hex').length, 64);
  assert.notEqual(digest.toString('utf8'), token);
  assert.ok(matchSessionToken(token, digest));
  assert.equal(matchSessionToken(createOpaqueSessionToken(), digest), false);
});

test('malformed tokens and malformed stored digests are rejected', () => {
  const digest = hashSessionToken(createOpaqueSessionToken());
  for (const token of ['', 'test', 'A'.repeat(42), 'A'.repeat(44), '$'.repeat(43), null]) {
    assert.equal(matchSessionToken(token, digest), false);
  }
  assert.equal(matchSessionToken(createOpaqueSessionToken(), Buffer.alloc(31)), false);
  assert.equal(matchSessionToken(createOpaqueSessionToken(), null), false);
});
