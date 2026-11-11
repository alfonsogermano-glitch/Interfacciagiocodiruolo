import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ROUTES,resolveRoute,validatePasswords,createAuthApi,ApiError} from '../flow.mjs';
const origin='https://staging.hollowgate.quest';
const TOKEN='A'.repeat(43);
const url=path=>origin+path;
test('five routes map to correct views',()=>{
  for(const [name,path] of Object.entries(ROUTES))assert.equal(resolveRoute(url(path)).view,name);
  assert.equal(resolveRoute(url('/bad-route')).view,'login');
});
test('email verification and password links use strict token format',()=>{
  const verify=resolveRoute(url('/account/verify-email?token='+TOKEN));
  assert.equal(verify.view,'verify');assert.equal(verify.token,TOKEN);
  assert.equal(resolveRoute(url('/account/verify-email?token=short')).token,null);
  const reset=resolveRoute(url('/account/password?action=password_reset&token='+TOKEN));
  assert.equal(reset.purpose,'password_reset');assert.equal(reset.token,TOKEN);
  assert.equal(resolveRoute(url('/account/password?token='+TOKEN+'&action=other')).purpose,null);
});
test('password confirmation enforces minimum and equality',()=>{
  assert.match(validatePasswords('a'.repeat(11),'a'.repeat(11)),/12/);
  assert.match(validatePasswords('a'.repeat(12),'b'.repeat(12)),/non coincidono/);
  assert.equal(validatePasswords('a'.repeat(12),'a'.repeat(12)),null);
});
test('API client sends same-origin JSON with cookies and never puts token in URL',async()=>{
  const calls=[];
  const api=createAuthApi({origin,fetchImpl:async(uri,options)=>{
    calls.push({uri,options});return {ok:true,status:200,json:async()=>({status:'ok'})};
  }});
  await api.signup('player@example.org','Player','test-password-2026');
  await api.reset(TOKEN,'updated-password-2026');
  await api.verify(TOKEN);
  await api.login('player@example.org','test-password-2026');
  await api.forgot('player@example.org');
  assert.equal(calls.length,5);
  for(const {uri,options} of calls){
    assert.ok(uri.startsWith(origin+'/auth/'));
    assert.ok(!uri.includes(TOKEN));
    assert.equal(options.credentials,'same-origin');
    assert.equal(options.redirect,'error');
    assert.equal(options.cache,'no-store');
    assert.equal(options.headers['Content-Type'],'application/json');
  }
  assert.equal(JSON.parse(calls[1].options.body).token,TOKEN);
});
test('client rejects insecure origins and surfaces backend errors',async()=>{
  assert.throws(()=>createAuthApi({origin:'http://localhost:3003',fetchImpl:async()=>{}}));
  const api=createAuthApi({origin,fetchImpl:async()=>({
    ok:false,status:503,json:async()=>({error:'Temporaneamente indisponibile'}),
  })});
  await assert.rejects(()=>api.forgot('test@example.org'),ApiError);
});
test('static pages are self-contained, accessible and scrub URL token',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const app=readFileSync(new URL('../app.mjs',import.meta.url),'utf8');
  assert.match(html,/meta name="referrer" content="no-referrer"/);
  assert.match(html,/meta name="robots" content="noindex,nofollow,noarchive"/);
  assert.match(html,/lang="it"/);
  assert.match(html,/aria-live="polite"/);
  assert.match(html,/src="\/auth-ui\/app.mjs"/);
  assert.doesNotMatch(html,/https?:\/\//);
  assert.match(app,/window\.history\.replaceState/);
  assert.match(app,/wire\('verify'/);
  assert.match(app,/wire\('reset'/);
  assert.doesNotMatch(app,/localStorage|sessionStorage|console\.log|innerHTML/);
});
