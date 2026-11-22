import test from 'node:test';
import assert from 'node:assert/strict';
import {createOAuthService} from '../src/oauth-service.mjs';

const origin='https://www.hollowgate.quest';
const USER_ID='12345678-1234-4234-8234-123456789abc';
function harness(){
  let saved,consumed=false,exchanged=0,issued=0,sessionActive=true,failInsert=false,released=0;
  const calls=[];
  const pool={async connect(){return {query:pool.query,release(){released++;}};},async query(sql,args){
    calls.push({sql,args});
    if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return {rows:[]};
    if(sql.includes('RETURNING hits'))return {rows:[{hits:1}]};
    if(sql.includes('begin_oauth')){saved=args;return {rows:[]};}
    if(sql.includes('consume_oauth')){
      if(consumed||!saved[0].equals(args[0])||!saved[1].equals(args[1])||saved[2]!==args[2])
        return {rowCount:0,rows:[]};
      consumed=true;
      return {rowCount:1,rows:[{code_verifier:saved[3],nonce:saved[4],
        link_user_id:saved[5],link_session_digest:saved[6]}]};
    }
    if(sql.includes('FROM hollowgate_auth.sessions s'))return {rowCount:sessionActive?1:0,rows:[]};
    if(sql.includes('finish_oauth'))return {rows:[{id:USER_ID}]};
    if(sql.includes('INSERT INTO hollowgate_auth.sessions')){
      if(failInsert)throw new Error('Simulated session failure');
      issued++;return {rows:[]};
    }
    throw new Error('Unexpected SQL');
  }};
  const oauth=createOAuthService({pool,origin,hmacKey:Buffer.alloc(32,9),
    providers:{google:{clientId:'google-client',clientSecret:'test-only'},
      discord:{clientId:'discord-client',clientSecret:'test-only'}},
    getSessionUser:async()=>({id:USER_ID}),issueToken:()=> 's'.repeat(43),
    exchange:async()=>{exchanged++;return {subject:'subject',email:'test@example.invalid',displayName:'Player'};},
  });
  return {oauth,calls,revoke(){sessionActive=false;},failSession(){failInsert=true;},
    get released(){return released;},get exchanged(){return exchanged;},get issued(){return issued;}};
}
test('provider state is hashed, browser-bound, consumed once before exchanging code',async()=>{
  const h=harness();
  const start=await h.oauth.start({provider:'google',networkSubject:'loopback'});
  const state=new URL(start.url).searchParams.get('state');
  assert.equal(state.length,43);
  assert.equal(h.calls[1].args[0].length,32);
  assert.notEqual(h.calls[1].args[0].toString('utf8'),state);
  await assert.rejects(()=>h.oauth.finish({provider:'google',state,code:'code',
    browser:'x'.repeat(43)}));
  assert.equal(h.exchanged,0);
  const finished=await h.oauth.finish({provider:'google',state,code:'code',browser:start.browser});
  assert.equal(finished.token.length,43);
  assert.equal(h.issued,1);
  assert.ok(h.calls.some(call=>call.sql==='COMMIT'));
  assert.equal(h.released,1);
  await assert.rejects(()=>h.oauth.finish({provider:'google',state,code:'code',browser:start.browser}));
  assert.equal(h.issued,1);
});
test('social registration rolls back identity creation when its session cannot be saved',async()=>{
  const h=harness();h.failSession();
  const start=await h.oauth.start({provider:'google',networkSubject:'loopback'});
  await assert.rejects(()=>h.oauth.finish({provider:'google',
    state:new URL(start.url).searchParams.get('state'),browser:start.browser,code:'code'}));
  assert.ok(h.calls.some(call=>call.sql==='ROLLBACK'));
  assert.equal(h.released,1);
  assert.equal(h.issued,0);
});
test('linking requires an authenticated session and rechecks it on callback',async()=>{
  const h=harness();
  await assert.rejects(()=>h.oauth.start({provider:'discord',networkSubject:'loopback',requireLink:true}));
  const start=await h.oauth.start({provider:'discord',networkSubject:'loopback',
    requireLink:true,linkSession:'a'.repeat(43)});
  const state=new URL(start.url).searchParams.get('state');
  await assert.rejects(()=>h.oauth.finish({provider:'discord',state,code:'code',
    issuer:'https://accounts.google.com',browser:start.browser,linkSession:'a'.repeat(43)}));
  h.revoke();
  await assert.rejects(()=>h.oauth.finish({provider:'discord',state,code:'code',
    issuer:'https://discord.com',browser:start.browser}));
  assert.equal(h.exchanged,0);
});
