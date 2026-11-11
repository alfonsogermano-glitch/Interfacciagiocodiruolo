import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from '../src/app.mjs';
import {createAuthHttpHandler} from '../src/auth-http.mjs';
import {SignupRejected} from '../src/signup-service.mjs';

const ORIGIN='https://staging.hollowgate.quest';
const setup=signupService=>createAuthHttpHandler({
  origin:ORIGIN,login:async()=>{},getSessionUser:async()=>null,revokeSession:async()=>{},
  signupService,
});
async function server(handler,fn){
  const app=createApp({checkDatabase:async()=>{},authHandler:handler});
  app.listen(0,'127.0.0.1');
  await once(app,'listening');
  try{await fn('http://127.0.0.1:'+app.address().port);}
  finally{await new Promise(resolve=>app.close(resolve));}
}
const post=(url,data,origin=ORIGIN)=>fetch(url,{
  method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(data),
});
test('registration endpoints are unavailable by default',async()=>{
  await server(setup(null),async base=>{
    assert.equal((await post(base+'/auth/signup',{})).status,404);
    assert.equal((await post(base+'/auth/verify-email',{})).status,404);
  });
});
test('only trusted Origin can create registration, without returning credentials',async()=>{
  const calls=[];
  await server(setup({
    signup:async x=>{calls.push(x);return {message:'Inviata richiesta'};},
    verify:async()=>({status:'ok'}),
  }),async base=>{
    const url=base+'/auth/signup';
    const body={email:'x@example.org',displayName:'X',password:'validpassword2026'};
    assert.equal((await post(url,body,'https://evil.example')).status,403);
    assert.equal(calls.length,0);
    const r=await post(url,body);
    assert.equal(r.status,202);
    const text=await r.text();
    assert.ok(!text.includes(body.password));
    assert.deepEqual(calls[0],{...body,networkSubject:'127.0.0.1'});
  });
});
test('verification consumes token behind trusted Origin',async()=>{
  const calls=[];
  await server(setup({
    signup:async()=>({}),
    verify:async input=>{calls.push(input);return {status:'ok'};},
  }),async base=>{
    const url=base+'/auth/verify-email',body={token:'T'.repeat(43)};
    assert.equal((await post(url,body,'https://wrong.example')).status,403);
    const r=await post(url,body);
    assert.equal(r.status,200);
    assert.deepEqual(await r.json(),{status:'ok'});
    assert.deepEqual(calls,[body]);
  });
});
test('reused token is rejected and internal errors do not leak details',async()=>{
  await server(setup({
    signup:async()=>{throw Error('private database details')},
    verify:async()=>{throw new SignupRejected()},
  }),async base=>{
    const bad=await post(base+'/auth/verify-email',{token:'bad'});
    assert.equal(bad.status,400);
    const error=await post(base+'/auth/signup',{email:'x@example.org'});
    assert.equal(error.status,500);
    assert.deepEqual(await error.json(),{error:'Errore interno'});
  });
});
