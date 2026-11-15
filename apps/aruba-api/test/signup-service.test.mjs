import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createSignupService,SignupRejected} from '../src/signup-service.mjs';
const TOKEN='V'.repeat(43);
function fixture({created=true,confirm=true,failMail=false,limit=false}={}) {
  const calls=[],sent=[];
  const pool={
    connect:async()=>({query:async sql=>{
      calls.push(sql);
      if(sql.includes('RETURNING hits'))return {rows:[{hits:limit?11:1}]};
      return {rows:[]};
    },release(){}}),
    query:async(sql,args)=>{
      calls.push({sql,args});
      if(sql.includes('register_local_user'))return {rows:[{created}]};
      if(sql.includes('confirm_local_email'))return {rows:[{confirmed:confirm}]};
      throw new Error('Unexpected query');
    },
  };
  const svc=createSignupService({pool,hmacKey:Buffer.alloc(32,9),
    mailer:{send:async x=>{sent.push(x);if(failMail)throw new Error('secret diagnostics');}},
    now:()=>new Date('2026-11-11T17:00:00Z'),issueToken:()=>TOKEN,
    hashNewPassword:async p=>'$argon2id$mock-'+p});
  return {svc,calls,sent};
}
const data={email:'NEW@EXAMPLE.ORG',displayName:'  New Player  ',password:'very-long-test-password',networkSubject:'loopback'};
test('signup stores only token digest and emails complete verification link',async()=>{
  const f=fixture();
  const ack=await f.svc.signup(data);
  assert.match(ack.message,/Se la registrazione/);
  const insert=f.calls.find(x=>x.sql?.includes('register_local_user'));
  assert.equal(insert.args[0],'new@example.org');
  assert.equal(insert.args[1],'New Player');
  assert.deepEqual(insert.args[3],createHash('sha256').update(TOKEN).digest());
  assert.equal(f.sent.length,1);
  assert.match(f.sent[0].text,/verify-email\?token=/);
  assert.ok(!JSON.stringify(f.calls).includes(TOKEN));
});
test('existing identity receives same response, never gets another mail',async()=>{
  const yes=fixture(),duplicate=fixture({created:false});
  assert.deepEqual(await yes.svc.signup(data),await duplicate.svc.signup(data));
  assert.equal(duplicate.sent.length,0);
});
test('mailer errors return generic acknowledgement',async()=>{
  const yes=fixture(),failed=fixture({failMail:true});
  assert.deepEqual(await yes.svc.signup(data),await failed.svc.signup(data));
});
test('account and network limits prevent password hashing and mail',async()=>{
  const f=fixture({limit:true});
  const response=await f.svc.signup(data);
  assert.match(response.message,/registrazione/);
  assert.equal(f.sent.length,0);
  assert.equal(f.calls.filter(x=>x.sql?.includes('register_local_user')).length,0);
});
test('verification is single-use (database determines claim)',async()=>{
  const success=fixture(),used=fixture({confirm:false});
  assert.deepEqual(await success.svc.verify({token:TOKEN}),{status:'ok'});
  const verify=success.calls.find(x=>x.sql?.includes('confirm_local_email'));
  assert.deepEqual(verify.args[0],createHash('sha256').update(TOKEN).digest());
  await assert.rejects(()=>used.svc.verify({token:TOKEN}),SignupRejected);
  await assert.rejects(()=>success.svc.verify({token:'invalid'}),SignupRejected);
});
test('invalid registration input rejected without queries',async()=>{
  const f=fixture();
  await assert.rejects(()=>f.svc.signup({...data,password:'short'}),SignupRejected);
  await assert.rejects(()=>f.svc.signup({...data,displayName:' '}),SignupRejected);
  assert.equal(f.calls.length,0);
});
