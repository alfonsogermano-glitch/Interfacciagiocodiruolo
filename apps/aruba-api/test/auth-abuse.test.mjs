import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalEmail, rateLimitSubjectDigest, publicPasswordResetAcknowledgement } from '../src/auth-abuse.mjs';

const secret = Buffer.alloc(32, 42);

test('canonicalize email for consistent account bucketing', () => {
  assert.equal(canonicalEmail('  Player@Example.ORG  '), 'player@example.org');
  for (const bad of ['', 'no-at', null, 'x'.repeat(321)]) {
    assert.throws(() => canonicalEmail(bad));
  }
});

test('rate-limit digest is stable, private and separates actions', () => {
  const args = { secret, action:'login', category:'account', value:'player@example.org' };
  const one = rateLimitSubjectDigest(args);
  assert.equal(one.length, 32);
  assert.deepEqual(one, rateLimitSubjectDigest(args));
  assert.notDeepEqual(one, rateLimitSubjectDigest({...args, action:'password_reset'}));
  assert.notDeepEqual(one, rateLimitSubjectDigest({...args, category:'network'}));
  assert.notDeepEqual(one, rateLimitSubjectDigest({...args, secret:Buffer.alloc(32, 43)}));
  assert.equal(one.includes(Buffer.from('player@example.org')), false);
});

test('invalid HMAC key and untrusted action/category are rejected', () => {
  assert.throws(() => rateLimitSubjectDigest({secret:Buffer.alloc(8),action:'login',category:'account',value:'a'}));
  assert.throws(() => rateLimitSubjectDigest({secret,action:'admin',category:'account',value:'a'}));
  assert.throws(() => rateLimitSubjectDigest({secret,action:'login',category:'foo',value:'a'}));
});

test('public recovery response never includes account existence', () => {
  assert.deepEqual(publicPasswordResetAcknowledgement(), {
    message: 'Se l’indirizzo è registrato, riceverai le istruzioni via email.',
  });
});
