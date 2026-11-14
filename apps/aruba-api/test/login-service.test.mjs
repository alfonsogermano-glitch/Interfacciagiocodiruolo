import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoginService, LoginRejected } from '../src/login-service.mjs';
import { createOpaqueSessionToken } from '../src/session-token.mjs';

const accountId = '11111111-1111-4111-8111-111111111111';
function mockDb(user) {
  const queries = [];
  return {
    queries,
    connect: async () => ({ query: async (...args) => {
      queries.push(args);
      if (args[0].includes('RETURNING hits')) return { rows:[{hits:1}] };
      return {rows:[]};
    }, release:()=>{} }),
    query: async (...args) => {
      queries.push(args);
      if (args[0].includes('LEFT JOIN')) return {rows:user ? [user] : []};
      return {rows:[]};
    },
  };
}
const date = () => new Date('2026-11-11T15:00:00Z');
const key = Buffer.alloc(32, 1);
const verified = {id:accountId,status:'active',email_verified_at:new Date(),password_hash:'$argon2id$placeholder'};
test('login stores only a session digest and returns opaque token', async () => {
  const db = mockDb(verified);
  const token = createOpaqueSessionToken();
  const login = createLoginService({pool:db,verifyPassword:async()=>true,hmacKey:key,now:date,issueToken:()=>token});
  const result = await login({email:' Test@Example.org ',password:'correct secret',networkSubject:'127.0.0.1'});
  assert.equal(result.userId,accountId);
  assert.equal(result.token,token);
  assert.equal(db.queries.filter(([q])=>q.includes('rate_limit_buckets')).length,2);
  const session = db.queries.find(([q])=>q.includes('INSERT INTO hollowgate_auth.sessions'));
  assert.equal(session[1][0],accountId);
  assert.notEqual(session[1][1].toString('utf8'),token);
  assert.equal(session[1][1].length,32);
  assert.equal(new Date(session[1][2]).getTime() - date().getTime(),12*3600000);
});

test('unknown, disabled, unverified, and pending-reset users cannot log in', async () => {
  for (const user of [null,{...verified,status:'pending_reset'},{...verified,status:'disabled'},{...verified,email_verified_at:null}]) {
    const db=mockDb(user),login=createLoginService({pool:db,verifyPassword:async()=>true,hmacKey:key,now:date});
    await assert.rejects(()=>login({email:'test@example.org',password:'abc',networkSubject:'127.0.0.1'}),e=>e instanceof LoginRejected && e.status===401);
    assert.equal(db.queries.filter(([q])=>q.includes('INSERT INTO hollowgate_auth.sessions')).length,0);
  }
});

test('bad password never creates a session', async () => {
  const db=mockDb(verified),login=createLoginService({pool:db,verifyPassword:async()=>false,hmacKey:key,now:date});
  await assert.rejects(()=>login({email:'test@example.org',password:'wrong',networkSubject:'127.0.0.1'}),LoginRejected);
  assert.equal(db.queries.filter(([q])=>q.includes('INSERT INTO hollowgate_auth.sessions')).length,0);
});

test('account and network counters independently reject excess attempts',async()=>{
  for(const over of [0,1]){
    const db=mockDb(verified);
    db.connect=async()=> {
      let index=0;return {query:async (sql) => {
        if(sql.includes('RETURNING hits')) return {rows:[{hits: index++ === over ? 21 : 1}]};
        return {rows:[]};
      },release:()=>{}};
    };
    const login=createLoginService({pool:db,verifyPassword:async()=>true,hmacKey:key,now:date});
    await assert.rejects(()=>login({email:'test@example.org',password:'ok',networkSubject:'127.0.0.1'}),e=>e instanceof LoginRejected && e.status===429);
  }
});
