import test from 'node:test';
import assert from 'node:assert/strict';
import {oauthAuthorizationUrl,oauthCallbackUrl,assertOAuthIssuer} from '../src/oauth-provider-contract.mjs';

const request={origin:'https://www.hollowgate.quest',clientId:'public-client-id',
  state:'a'.repeat(43),codeChallenge:'b'.repeat(43)};
test('Google and Discord use exact same-origin callbacks, code + PKCE and minimal scopes',()=>{
  for(const [provider,host,scope] of [
    ['google','accounts.google.com','openid email profile'],
    ['discord','discord.com','identify email'],
  ]){
    const url=new URL(oauthAuthorizationUrl({...request,provider,
      ...(provider==='google'?{nonce:'c'.repeat(43)}:{})}));
    assert.equal(url.hostname,host);
    assert.equal(url.searchParams.get('response_type'),'code');
    assert.equal(url.searchParams.get('scope'),scope);
    assert.equal(url.searchParams.get('code_challenge_method'),'S256');
    assert.equal(url.searchParams.get('redirect_uri'),oauthCallbackUrl(request.origin,provider));
    assert.equal(url.searchParams.get('state'),request.state);
    assert.equal(url.searchParams.get('nonce'),provider==='google'?'c'.repeat(43):null);
  }
});
test('invalid provider, origin, state and issuer fail closed',()=>{
  assert.throws(()=>oauthAuthorizationUrl({...request,provider:'other'}));
  assert.throws(()=>oauthAuthorizationUrl({...request,provider:'google',origin:'http://localhost:5173'}));
  assert.throws(()=>oauthAuthorizationUrl({...request,provider:'discord',state:'short'}));
  assert.throws(()=>oauthAuthorizationUrl({...request,provider:'discord',codeChallenge:'short'}));
  assert.throws(()=>oauthAuthorizationUrl({...request,provider:'google'}));
  assert.throws(()=>oauthAuthorizationUrl({...request,provider:'discord',nonce:'c'.repeat(43)}));
  assert.throws(()=>assertOAuthIssuer('discord','https://accounts.google.com'));
  assert.doesNotThrow(()=>assertOAuthIssuer('discord','https://discord.com'));
});
