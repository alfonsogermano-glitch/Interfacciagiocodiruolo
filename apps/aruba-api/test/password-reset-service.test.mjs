import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createPasswordResetService, PasswordActionRejected } from '../src/password-reset-service.mjs';

const TOKEN='T'.repeat(43);
function fixture({exists=true,expired=false,mailFails=false}={}) {
  const queries=[],sent=[],operations=[];
  const client={
    async query(sql,args=[]) {
      operations.push({sql,args});
      if (sql.includes('RETURNING hits')) return {rows:[{hits:1}],rowCount:1};
      if (sql.includes('RETURNING p.user_id')) return {
        rows:expired?[]:[{user_id:'fixture-user'}],rowCount:expired?0:1};
      return {rows:[],rowCount:1};
    },
    release() {},
  };
  const pool={
    connect:async()=>client,
    async query(sql,args=[]) {
      queries.push({sql,args});
      if (sql.includes('SELECT id FROM hollowgate_auth.users')) return {
        rows:exists?[{id:'fixture-user'}]:[],rowCount:exists?1:0};
      return {rows:[],rowCount:1};
    },
  };
  const service=createPasswordResetService({
    pool,mailer:{async send(message){sent.push(message);if(mailFails)throw new Error('Sensitive provider error');}},
    hmacKey:Buffer.alloc(32,8),now:()=>new Date('2026-11-11T15:00:00Z'),
    issueToken:()=>TOKEN,hashNewPassword:async p=>'argon-mock-'+p,
  });
  return {service,queries,operations,sent};
}

test('request has indistinguishable response for existing and unknown users',async()=>{
  const a=fixture(),b=fixture({exists:false});
  const x=await a.service.request({email:'USER@example.org',networkSubject:'127.0.0.1'});
  const y=await b.service.request({email:'nobody@example.org',networkSubject:'127.0.0.1'});
  assert.deepEqual(x,y);
  assert.equal(a.sent.length,1);
  assert.equal(b.sent.length,0);
  assert.equal(a.sent[0].to,'user@example.org');
  assert.match(a.sent[0].text,/https:\/\/staging\.hollowgate\.quest/);
  const insert=a.queries.find(q=>q.sql.includes('INSERT INTO hollowgate_auth.password_actions'));
  assert.deepEqual(insert.args[1],createHash('sha256').update(TOKEN).digest());
  assert.ok(!JSON.stringify(a.queries).includes(TOKEN));
});
test('provider failure uses the same acknowledgement',async()=>{
  const a=fixture({mailFails:true}),b=fixture({exists:false});
  assert.deepEqual(
    await a.service.request({email:'user@example.org',networkSubject:'host'}),
    await b.service.request({email:'no@example.org',networkSubject:'host'}));
});
test('request increments account and network counters independently',async()=>{
  const f=fixture();
  await f.service.request({email:'user@example.org',networkSubject:'host'});
  assert.equal(f.operations.filter(x=>x.sql.includes('rate_limit_buckets')).length,2);
});
test('redeem changes credential and revokes sessions in same transaction',async()=>{
  const f=fixture();
  assert.deepEqual(await f.service.redeem({token:TOKEN,newPassword:'long test password 2026'}),{status:'ok'});
  assert.equal(f.operations[0].sql,'BEGIN');
  assert.ok(f.operations.some(x=>x.sql.includes('INSERT INTO hollowgate_auth.password_credentials')));
  assert.ok(f.operations.some(x=>x.sql.includes('UPDATE hollowgate_auth.sessions')));
  assert.equal(f.operations.at(-1).sql,'COMMIT');
});
test('expired or reused tokens cannot modify credentials',async()=>{
  const f=fixture({expired:true});
  await assert.rejects(()=>f.service.redeem({token:TOKEN,newPassword:'long test password 2026'}),PasswordActionRejected);
  assert.ok(f.operations.some(x=>x.sql==='ROLLBACK'));
  assert.ok(!f.operations.some(x=>x.sql.includes('INSERT INTO hollowgate_auth.password_credentials')));
});
test('invalid token and short password fail before querying database',async()=>{
  const f=fixture();
  await assert.rejects(()=>f.service.redeem({token:'bad',newPassword:'long test password 2026'}),PasswordActionRejected);
  await assert.rejects(()=>f.service.redeem({token:TOKEN,newPassword:'short'}),PasswordActionRejected);
  assert.equal(f.operations.length,0);
});
