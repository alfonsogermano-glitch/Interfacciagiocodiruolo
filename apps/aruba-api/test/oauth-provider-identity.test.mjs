import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,SignJWT} from 'jose';
import {verifyGoogleIdentity,exchangeOAuthIdentity} from '../src/oauth-provider-identity.mjs';

test('Google identity requires issuer, audience, signed token, nonce and verified email',async()=>{
  const {privateKey,publicKey}=await generateKeyPair('RS256');
  const nonce='n'.repeat(43);
  const idToken=await new SignJWT({sub:'provider-subject',email:'TEST@EXAMPLE.INVALID',
    email_verified:true,nonce,name:'Player'})
    .setProtectedHeader({alg:'RS256'}).setIssuer('https://accounts.google.com')
    .setAudience('google-client').setIssuedAt().setExpirationTime('5m').sign(privateKey);
  const input={idToken,clientId:'google-client',nonce,jwks:publicKey};
  assert.deepEqual(await verifyGoogleIdentity(input),{
    subject:'provider-subject',email:'test@example.invalid',displayName:'Player',
  });
  await assert.rejects(()=>verifyGoogleIdentity({...input,nonce:'x'.repeat(43)}));
  await assert.rejects(()=>verifyGoogleIdentity({...input,clientId:'other-client'}));
  const unverified=await new SignJWT({sub:'provider-subject',email:'test@example.invalid',
    email_verified:false,nonce}).setProtectedHeader({alg:'RS256'})
    .setIssuer('https://accounts.google.com').setAudience('google-client')
    .setIssuedAt().setExpirationTime('5m').sign(privateKey);
  await assert.rejects(()=>verifyGoogleIdentity({...input,idToken:unverified}));
});

test('Discord exchange uses server-only form and accepts verified email only',async()=>{
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url,options});
    return {ok:true,json:async()=>calls.length===1?
      {access_token:'test-access',token_type:'Bearer',scope:'identify email'}:
      {id:'123456789012345678',email:'TEST@EXAMPLE.INVALID',verified:true,username:'Player'}};
  };
  const config={provider:'discord',origin:'https://www.hollowgate.quest',
    clientId:'test-client',clientSecret:'test-only',code:'test-code',
    codeVerifier:'v'.repeat(43),fetchImpl};
  const result=await exchangeOAuthIdentity(config);
  assert.deepEqual(result,{subject:'123456789012345678',email:'test@example.invalid',displayName:'Player'});
  assert.equal(calls[0].url,'https://discord.com/api/oauth2/token');
  assert.equal(calls[0].options.body.get('redirect_uri'),
    'https://www.hollowgate.quest/auth/oauth/discord/callback');
  assert.equal(calls[1].url,'https://discord.com/api/v10/users/@me');
  await assert.rejects(()=>exchangeOAuthIdentity({...config,fetchImpl:async()=>({ok:true,
    json:async()=>({access_token:'test-access',token_type:'Bearer',scope:'identify'})})}));
  await assert.rejects(()=>exchangeOAuthIdentity({...config,fetchImpl:async(url)=>({ok:true,
    json:async()=>url.includes('/token')?
      {access_token:'test-access',token_type:'Bearer',scope:'identify email'}:
      {id:'123456789012345678',email:'test@example.invalid',verified:false}})}));
});
