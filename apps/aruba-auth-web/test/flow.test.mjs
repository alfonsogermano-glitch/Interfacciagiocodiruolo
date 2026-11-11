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

test('static staging preview cannot send browser API requests',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const app=readFileSync(new URL('../app.mjs',import.meta.url),'utf8');
  const caddy=readFileSync(new URL('../../../deploy/aruba/Caddyfile.staging',import.meta.url),'utf8');
  const compose=readFileSync(new URL('../../../deploy/aruba/compose.edge-staging.yaml',import.meta.url),'utf8');
  assert.match(html,/meta name="hollowgate-preview" content="static-only"/);
  assert.match(html,/Anteprima grafica/);
  assert.match(app,/isStaticPreview\?null:createAuthApi/);
  assert.match(app,/if\(isStaticPreview\)/);
  assert.match(caddy,/@authPreviewPages path \/login \/signup \/forgot-password \/account\/password \/account\/verify-email/);
  assert.match(caddy,/@authPreviewAssets path \/auth-ui\/app\.mjs \/auth-ui\/flow\.mjs \/auth-ui\/styles\.css/);
  assert.match(caddy,/connect-src 'none'/);
  assert.match(caddy,/handle \{\s*respond "Not Found" 404/);
  assert.doesNotMatch(caddy,/reverse_proxy[^\n]*\/auth/);
  assert.match(compose,/\.\.\/\.\.\/apps\/aruba-auth-web:\/srv\/auth-preview:ro/);
});

test('private trial opt-in keeps static preview unchanged and requires Caddy gate',()=>{
  const fs=readFileSync;
  const trial=fs(new URL('../index.trial.html',import.meta.url),'utf8');
  const preview=fs(new URL('../index.html',import.meta.url),'utf8');
  const config=fs(new URL('../../../deploy/aruba/Caddyfile.auth-trial',import.meta.url),'utf8');
  const trialApi=fs(new URL('../../../deploy/aruba/compose.auth-trial.yaml',import.meta.url),'utf8');
  const trialEdge=fs(new URL('../../../deploy/aruba/compose.edge-auth-trial.yaml',import.meta.url),'utf8');
  assert.match(preview,/hollowgate-preview" content="static-only"/);
  assert.doesNotMatch(trial,/hollowgate-preview" content="static-only"/);
  assert.match(config,/basic_auth @trialProtected/);
  assert.match(config,/\/auth\/\*/);
  assert.match(config,/\{file\.\/run\/secrets\/auth_trial_hash\}/);
  assert.match(config,/rewrite \* \/index\.trial\.html/);
  assert.match(config,/path \/auth\/login \/auth\/logout \/auth\/me/);
  assert.match(config,/handle \{\s*respond "Not Found" 404/);
  assert.match(trialApi,/AUTH_PASSWORD_RESET_ENABLED: "true"/);
  assert.match(trialApi,/AUTH_SIGNUP_ENABLED: "true"/);
  assert.match(trialApi,/\/opt\/hollowgate\/config\/resend_api_key/);
  assert.match(trialEdge,/\/opt\/hollowgate\/config\/auth_trial_hash/);
});

test('private trial credential setup never places plaintext in CLI arguments',()=>{
  const installer=readFileSync(new URL('../../../deploy/aruba/scripts/prepare-auth-trial.sh',import.meta.url),'utf8');
  const caddy=readFileSync(new URL('../../../deploy/aruba/Caddyfile.auth-trial',import.meta.url),'utf8');
  assert.match(installer,/read -r -s password/);
  assert.match(installer,/process\.stdin/);
  assert.match(installer,/argon2\.argon2id/);
  assert.match(installer,/install -m 600/);
  assert.doesNotMatch(installer,/--plaintext/);
  assert.match(caddy,/basic_auth @trialProtected argon2id/);
});
