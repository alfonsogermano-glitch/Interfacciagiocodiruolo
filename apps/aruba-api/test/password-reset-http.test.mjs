import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import {createApp} from '../src/app.mjs';
import {createAuthHttpHandler} from '../src/auth-http.mjs';
import {PasswordActionRejected} from '../src/password-reset-service.mjs';

const ORIGIN='https://staging.hollowgate.quest';
function build(passwordReset) {
  return createAuthHttpHandler({
    origin:ORIGIN,
    login:async()=>{throw Error('not in reset tests');},
    getSessionUser:async()=>null,
    revokeSession:async()=>{},
    passwordReset,
  });
}
async function run(handler,cb) {
  const app=createApp({checkDatabase:async()=>{},authHandler:handler});
  app.listen(0,'127.0.0.1');
  await once(app,'listening');
  try { await cb('http://127.0.0.1:'+app.address().port); }
  finally { await new Promise(resolve=>app.close(resolve)); }
}
function post(url,data,origin=ORIGIN) {
  return fetch(url,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(data)});
}
test('password endpoints are 404 unless feature is explicitly supplied',async()=>{
  await run(build(null),async base=>{
    for (const endpoint of ['/auth/password/request','/auth/password/redeem']) {
      const r=await post(base+endpoint,{email:'test@example.org'});
      assert.equal(r.status,404);
    }
  });
});
test('request endpoint enforces exact Origin and generic 202 response',async()=>{
  const called=[];
  await run(build({
    request:async payload=>{called.push(payload);return {message:'Se l’indirizzo è registrato, riceverai le istruzioni via email.'};},
    redeem:async()=>({status:'ok'}),
  }),async base=>{
    const url=base+'/auth/password/request';
    assert.equal((await post(url,{email:'test@example.org'},'https://evil.example')).status,403);
    assert.equal(called.length,0);
    assert.equal((await fetch(url,{method:'POST',headers:{origin:ORIGIN,'content-type':'text/plain'},body:'x'})).status,415);
    const r=await post(url,{email:'test@example.org'});
    assert.equal(r.status,202);
    assert.deepEqual(await r.json(),{message:'Se l’indirizzo è registrato, riceverai le istruzioni via email.'});
    assert.equal(called[0].email,'test@example.org');
    assert.equal(called[0].networkSubject,'127.0.0.1');
  });
});
test('redeem enforces exact Origin and never echoes a token or password',async()=>{
  const called=[];
  await run(build({
    request:async()=>({}),
    redeem:async input=>{called.push(input);return {status:'ok'};},
  }),async base=>{
    const url=base+'/auth/password/redeem';
    const data={token:'T'.repeat(43),newPassword:'strong-password-12345'};
    assert.equal((await post(url,data,'https://another.example')).status,403);
    assert.equal(called.length,0);
    const r=await post(url,data);
    assert.equal(r.status,200);
    const text=await r.text();
    assert.equal(text,'{"status":"ok"}');
    assert.ok(!text.includes(data.token));
    assert.ok(!text.includes(data.newPassword));
    assert.deepEqual(called[0],data);
  });
});
test('expired token returns generic 400; internal service errors reveal nothing',async()=>{
  await run(build({
    request:async()=>{throw new Error('secret database message')},
    redeem:async()=>{throw new PasswordActionRejected()},
  }),async base=>{
    const a=await post(base+'/auth/password/redeem',{token:'X'.repeat(43),newPassword:'strong-password-12345'});
    assert.equal(a.status,400);
    assert.match((await a.json()).error,/non valido o scaduto/);
    const b=await post(base+'/auth/password/request',{email:'test@example.org'});
    assert.equal(b.status,500);
    assert.deepEqual(await b.json(),{error:'Errore interno'});
  });
});
test('handler rejects incomplete password reset implementation',()=>{
  assert.throws(()=>build({request:async()=>{}}),TypeError);
});
