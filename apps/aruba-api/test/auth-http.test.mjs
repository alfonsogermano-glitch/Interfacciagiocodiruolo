import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.mjs';
import { createAuthHttpHandler } from '../src/auth-http.mjs';

const ORIGIN = 'https://staging.hollowgate.quest';
const TOKEN = 'A'.repeat(43);
function createHarness() {
  let revoked = null;
  let called = 0;
  const handler = createAuthHttpHandler({
    origin: ORIGIN,
    login: async () => { called++; return {token:TOKEN, expiresAt:new Date('2026-11-12T03:00:00Z')}; },
    getSessionUser: async token => token === TOKEN ? {id:'test-id',role:'standard'} : null,
    revokeSession: async token => { revoked = token; },
  });
  return {handler, get revoked(){ return revoked; }, get called(){ return called; }};
}

async function withServer(authHandler, callback) {
  const app = createApp({ checkDatabase:async()=>{}, authHandler });
  app.listen(0,'127.0.0.1');
  await once(app,'listening');
  try { await callback('http://127.0.0.1:'+app.address().port); }
  finally { await new Promise(resolve => app.close(resolve)); }
}

test('HTTP auth is disabled unless explicitly provided',async()=>{
  await withServer(null, async url=>{
    const res=await fetch(url+'/auth/me');
    assert.equal(res.status,404);
  });
});

test('login requires exact HTTPS Origin and JSON',async()=>{
  const h=createHarness();
  await withServer(h.handler,async url=>{
    const input={method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'demo@example.org',password:'demo'})};
    let r=await fetch(url+'/auth/login',input);
    assert.equal(r.status,403);
    r=await fetch(url+'/auth/login',{...input,headers:{...input.headers,origin:'https://evil.example'}});
    assert.equal(r.status,403);
    r=await fetch(url+'/auth/login',{...input,headers:{'content-type':'text/plain',origin:ORIGIN}});
    assert.equal(r.status,415);
    assert.equal(h.called,0);
  });
});

test('login sends secure host-only session cookie, not token in JSON',async()=>{
  const h=createHarness();
  await withServer(h.handler,async url=>{
    const r=await fetch(url+'/auth/login',{method:'POST',headers:{origin:ORIGIN,'content-type':'application/json'},body:JSON.stringify({email:'demo@example.org',password:'demo'})});
    assert.equal(r.status,200);
    const cookie=r.headers.get('set-cookie');
    assert.match(cookie,/^__Host-hg_session=/);
    assert.match(cookie,/HttpOnly; Secure; SameSite=Strict/);
    assert.match(cookie,/Path=\//);
    assert.doesNotMatch(cookie,/Domain=/);
    assert.doesNotMatch(JSON.stringify(await r.json()),new RegExp(TOKEN));
    assert.equal(h.called,1);
  });
});

test('session lookup and logout require valid cookie, logout requires Origin',async()=>{
  const h=createHarness();
  await withServer(h.handler,async url=>{
    const unauthorized=await fetch(url+'/auth/me');
    assert.equal(unauthorized.status,401);
    const ok=await fetch(url+'/auth/me',{headers:{cookie:'__Host-hg_session='+TOKEN}});
    assert.equal(ok.status,200);
    assert.deepEqual((await ok.json()).user,{id:'test-id',role:'standard'});
    const forged=await fetch(url+'/auth/logout',{method:'POST',headers:{cookie:'__Host-hg_session='+TOKEN,origin:'https://evil.example'}});
    assert.equal(forged.status,403);
    assert.equal(h.revoked,null);
    const logout=await fetch(url+'/auth/logout',{method:'POST',headers:{cookie:'__Host-hg_session='+TOKEN,origin:ORIGIN}});
    assert.equal(logout.status,200);
    assert.equal(h.revoked,TOKEN);
    assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
  });
});

test('HTTP handler refuses insecure origin and oversized request',async()=>{
  assert.throws(()=>createAuthHttpHandler({origin:'http://staging.hollowgate.quest',login:()=>{},getSessionUser:()=>{},revokeSession:()=>{}}));
  const h=createHarness();
  await withServer(h.handler,async url=>{
    const r=await fetch(url+'/auth/login',{method:'POST',headers:{origin:ORIGIN,'content-type':'application/json'},body:JSON.stringify({email:'test@example.org',password:'X'.repeat(5000)})});
    assert.equal(r.status,413);
    assert.equal(h.called,0);
  });
});

test('VTT pilot bootstrap only accepts an active Aruba cookie; game capabilities fail closed',async()=>{
  const h=createHarness();
  await withServer(h.handler,async base=>{
    const absent=await fetch(base+'/vtt/bootstrap');
    assert.equal(absent.status,401);
    const forged=await fetch(base+'/vtt/bootstrap',{headers:{cookie:'__Host-hg_session=bad'}});
    assert.equal(forged.status,401);
    const accepted=await fetch(base+'/vtt/bootstrap',{headers:{cookie:'__Host-hg_session='+TOKEN}});
    assert.equal(accepted.status,200);
    const payload=await accepted.json();
    assert.deepEqual(payload,{
      user:{id:'test-id',role:'standard'},backend:'aruba-staging',
      capabilities:{
        campaigns:{read:false,write:false},
        characters:{read:false,write:false},
        characterAvailability:{read:false,write:false},
        characterAssignments:{read:false,write:false},
        playerCharacters:{read:false,write:false},
        entityNotes:{read:false,write:false},
        campaignNotes:{read:false,write:false},
        campaignNoteFolders:{read:false,write:false},
        campaignRoster:{read:false,write:false},
        originalNotesPanel:{read:false,write:false},
        gameSession:false,
      },
    });
    assert.equal(accepted.headers.get('cache-control'),'no-store');
    assert.equal((await fetch(base+'/vtt/bootstrap?userId=other',{headers:{cookie:'__Host-hg_session='+TOKEN}})).status,404);
    assert.equal((await fetch(base+'/vtt/bootstrap',{method:'POST',headers:{cookie:'__Host-hg_session='+TOKEN}})).status,404);
  });
});

test('original Notes panel bootstrap cannot advertise disabled backend dependencies',()=>{
 assert.throws(()=>createAuthHttpHandler({
  origin:ORIGIN,login:async()=>{},getSessionUser:async()=>null,revokeSession:async()=>{},
  notesPanelEnabled:true,
 }),/requires both/);
});
