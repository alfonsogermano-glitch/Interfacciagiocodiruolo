import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {readFileSync} from 'node:fs';
import {createApp} from '../src/app.mjs';
import {createAuthHttpHandler} from '../src/auth-http.mjs';

async function withServer(oauth,work){
  const handler=createAuthHttpHandler({origin:'https://www.hollowgate.quest',
    login:async()=>{},getSessionUser:async()=>null,revokeSession:async()=>{},oauth});
  const server=createApp({checkDatabase:async()=>{},authHandler:handler});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  try{await work('http://127.0.0.1:'+server.address().port);}
  finally{await new Promise(resolve=>server.close(resolve));}
}
test('OAuth is absent by default and cannot be simulated',async()=>{
  await withServer(null,async url=>{
    const res=await fetch(url+'/auth/oauth/google/start',{redirect:'manual'});
    assert.equal(res.status,404);
  });
});
test('start sets short-lived host-only browser cookie; callback clears code URL',async()=>{
  const browser='b'.repeat(43),state='s'.repeat(43),session='t'.repeat(43);
  const calls=[];
  await withServer({
    async start(input){calls.push(input);return {browser,url:'https://accounts.google.com/o/oauth2/v2/auth?state='+state};},
    async finish(input){calls.push(input);return {token:session};},
  },async url=>{
    const start=await fetch(url+'/auth/oauth/google/start',{redirect:'manual'});
    assert.equal(start.status,303);
    assert.match(start.headers.get('set-cookie'),/SameSite=Lax; Max-Age=600/);
    assert.doesNotMatch(start.headers.get('set-cookie'),/Domain=/);
    assert.equal(calls[0].linkSession,null);
    const callback=await fetch(url+'/auth/oauth/google/callback?code=sample&state='+state,
      {redirect:'manual',headers:{cookie:'__Host-hg_oauth='+browser}});
    assert.equal(callback.status,303);
    assert.equal(callback.headers.get('location'),'/auth/oauth/complete');
    assert.equal(calls[1].browser,browser);
    assert.equal(calls[1].code,'sample');
    assert.match(callback.headers.get('set-cookie'),/__Host-hg_session=/);
    assert.doesNotMatch(callback.headers.get('location'),/sample|state=/);
    const complete=await fetch(url+'/auth/oauth/complete');
    assert.equal(complete.status,200);
    assert.match(complete.headers.get('content-type'),/^text\/html/);
    assert.equal(complete.headers.get('cache-control'),'no-store');
    assert.match(await complete.text(),/http-equiv="refresh" content="0;url=\/vtt\/"/);
  });
});
test('Google callback ignores optional provider fields but rejects unknown or duplicate fields',async()=>{
  const calls=[];
  await withServer({
    async start(){throw new Error('Not used');},
    async finish(input){calls.push(input);return {token:'t'.repeat(43)};},
  },async url=>{
    const path=url+'/auth/oauth/google/callback?code=sample&state='+'s'.repeat(43);
    const headers={cookie:'__Host-hg_oauth='+'b'.repeat(43)};
    const valid=await fetch(path+'&scope=openid%20email%20profile&authuser=0&prompt=consent',
      {redirect:'manual',headers});
    assert.equal(valid.headers.get('location'),'/auth/oauth/complete');
    assert.equal(calls.length,1);
    for(const suffix of ['&unexpected=value','&scope=openid&scope=email']){
      const invalid=await fetch(path+suffix,{redirect:'manual',headers});
      assert.equal(invalid.headers.get('location'),'/login?oauth=failed');
    }
    assert.equal(calls.length,1);
  });
});
test('OAuth errors never expose provider code and linking requires current session',async()=>{
  await withServer({
    async start(){throw new Error('Never print this');},
    async finish(){throw new Error('Never print this');},
  },async url=>{
    const callback=await fetch(url+'/auth/oauth/discord/callback?code=sample&state='+ 's'.repeat(43)+'&iss=https%3A%2F%2Fdiscord.com',
      {redirect:'manual'});
    assert.equal(callback.status,303);
    assert.equal(callback.headers.get('location'),'/login?oauth=failed');
    assert.doesNotMatch(await callback.text(),/sample|Never print/);
    const badLink=await fetch(url+'/auth/oauth/google/start?link=1',{redirect:'manual'});
    assert.notEqual(badLink.status,303);
  });
});
test('explicit account linking requires same-origin POST and an existing Hollowgate session',async()=>{
  const calls=[];
  await withServer({
    async start(input){calls.push(input);return {browser:'b'.repeat(43),
      url:'https://discord.com/oauth2/authorize?state='+'s'.repeat(43)};},
    async finish(){throw new Error('Not used');},
  },async url=>{
    const path=url+'/auth/oauth/discord/start?link=1';
    const cookie='__Host-hg_session='+'a'.repeat(43);
    for(const options of [
      {method:'GET',headers:{cookie}},
      {method:'POST',headers:{cookie,origin:'https://attacker.invalid'}},
      {method:'POST',headers:{origin:'https://www.hollowgate.quest'}},
    ]){
      const res=await fetch(path,{redirect:'manual',...options});
      assert.notEqual(res.status,200);
    }
    assert.equal(calls.length,0);
    const res=await fetch(path,{method:'POST',redirect:'manual',
      headers:{cookie,origin:'https://www.hollowgate.quest'}});
    assert.equal(res.status,200);
    assert.equal(calls[0].requireLink,true);
    assert.equal(calls[0].linkSession,'a'.repeat(43));
    assert.match(res.headers.get('set-cookie'),/SameSite=Lax/);
    assert.match((await res.json()).url,/^https:\/\/discord\.com\/oauth2\/authorize/);
  });
});
test('private staging Caddy allows only the explicit OAuth endpoints behind Basic Auth',()=>{
  const caddy=readFileSync(new URL('../../../deploy/aruba/Caddyfile.auth-trial',import.meta.url),'utf8');
  assert.match(caddy,/@trialProtected path[^\n]*\/auth\/\*/);
  for(const route of ['/auth/oauth/providers','/auth/oauth/google/start',
    '/auth/oauth/google/callback','/auth/oauth/complete','/auth/oauth/discord/start',
    '/auth/oauth/discord/callback']){
    assert.ok(caddy.includes(route));
  }
  assert.match(caddy,/basic_auth @trialProtected/);
});
test('OAuth Compose activation is staging-only with separate secret files',()=>{
  const overlay=readFileSync(new URL('../../../deploy/aruba/compose.oauth-trial.yaml',import.meta.url),'utf8');
  assert.match(overlay,/aruba-auth-staging:/);
  assert.match(overlay,/AUTH_OAUTH_ENABLED: "true"/);
  assert.match(overlay,/HG_STAGING_GOOGLE_CLIENT_ID:\?/);
  assert.match(overlay,/HG_STAGING_DISCORD_CLIENT_ID:\?/);
  assert.match(overlay,/file: \/opt\/hollowgate\/config\/staging_google_oauth_secret/);
  assert.match(overlay,/file: \/opt\/hollowgate\/config\/staging_discord_oauth_secret/);
  assert.doesNotMatch(overlay,/PGDATABASE:|hollowgate-api:/);
});
test('independent staging HTTPS gateway cannot bind public ports or mount production web',()=>{
  const file=new URL('../../../deploy/aruba/Caddyfile.staging-isolated',import.meta.url);
  const compose=readFileSync(new URL('../../../deploy/aruba/compose.staging-edge-isolated.yaml',import.meta.url),'utf8');
  const caddy=readFileSync(file,'utf8');
  assert.match(caddy,/staging\.hollowgate\.quest \{/);
  assert.doesNotMatch(caddy,/^www\.hollowgate\.quest \{|^hollowgate\.quest \{/m);
  assert.match(caddy,/@private \{\s*not path \/health \/ready/);
  assert.match(caddy,/basic_auth @private bcrypt/);
  assert.match(caddy,/\/auth\/oauth\/google\/callback/);
  assert.match(caddy,/\/auth\/oauth\/discord\/callback/);
  assert.match(compose,/127\.0\.0\.1:8443:443/);
  assert.doesNotMatch(compose,/0\.0\.0\.0:443|0\.0\.0\.0:80/);
  assert.match(compose,/shared_staging_certs:\/origin-cert:ro/);
  assert.match(compose,/hollowgate-auth-staging_default/);
  assert.doesNotMatch(compose,/aruba-source\/apps\/aruba-auth-web|\/etc\/cloudflared/);
});
