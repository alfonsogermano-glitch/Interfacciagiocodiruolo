import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpaqueSessionToken, hashSessionToken } from '../src/session-token.mjs';
import { createSessionRepository } from '../src/session-repository.mjs';

const token = createOpaqueSessionToken();
const user = {id:'11111111-1111-4111-8111-111111111111',email:'player@example.org',display_name:'Player',role:'standard'};
function makePool({session = user, revoked = false} = {}) {
  const calls = [];
  const pool = { calls, async query(sql, params) {
    calls.push({sql,params});
    if (sql.includes('SELECT u.id')) return {rows:session ? [session] : []};
    if (sql.includes('UPDATE hollowgate_auth.sessions')) return {rowCount:revoked ? 0 : 1};
    throw new Error('Unexpected query');
  }};
  return pool;
}
test('looks up current database-owned user and role using only the token digest',async()=>{
  const pool = makePool();
  const repo = createSessionRepository({pool});
  assert.deepEqual(await repo.getSessionUser(token),{
    id:user.id,email:user.email,displayName:user.display_name,role:'standard',
  });
  assert.equal(pool.calls.length,1);
  assert.deepEqual(pool.calls[0].params[0],hashSessionToken(token));
  assert.equal(pool.calls[0].sql.includes('s.expires_at > now()'),true);
  assert.equal(pool.calls[0].sql.includes('s.revoked_at IS NULL'),true);
  assert.equal(pool.calls[0].sql.includes("u.status = 'active'"),true);
  assert.equal(pool.calls[0].sql.includes('u.email_verified_at IS NOT NULL'),true);
  assert.equal(pool.calls[0].sql.includes('LEFT JOIN hollowgate_auth.user_roles'),true);
});
test('unknown, expired and revoked sessions are treated as unauthenticated',async()=>{
  const pool=makePool({session:null}), repo=createSessionRepository({pool});
  assert.equal(await repo.getSessionUser(token),null);
  assert.equal(await repo.getSessionUser('forged'),null);
  assert.equal(pool.calls.length,1);
});
test('logout revokes a valid session once; repeated logout is harmless',async()=>{
  const pool=makePool(), repo=createSessionRepository({pool});
  assert.equal(await repo.revokeSession(token),true);
  assert.deepEqual(pool.calls[0].params[0],hashSessionToken(token));
  assert.equal(pool.calls[0].sql.includes('s.revoked_at'),false);
  assert.equal(pool.calls[0].sql.includes('expires_at > now()'),true);
  assert.equal(await repo.revokeSession('malformed'),false);
  const p=makePool({revoked:true});
  assert.equal(await createSessionRepository({pool:p}).revokeSession(token),false);
});
test('roles are never inferred from client claims',async()=>{
  const pool=makePool({session:{...user,role:'unexpected'}}),repo=createSessionRepository({pool});
  assert.equal((await repo.getSessionUser(token)).role,'standard');
});
