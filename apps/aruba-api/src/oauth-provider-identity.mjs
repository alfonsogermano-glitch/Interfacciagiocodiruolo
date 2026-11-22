import {createRemoteJWKSet,jwtVerify} from 'jose';
import {oauthCallbackUrl,oauthProvider} from './oauth-provider-contract.mjs';

const googleKeys=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const TOKEN_ENDPOINT=Object.freeze({
  google:'https://oauth2.googleapis.com/token',
  discord:'https://discord.com/api/oauth2/token',
});
const DISCORD_ME='https://discord.com/api/v10/users/@me';

function verifiedEmail(email){
  if(typeof email!=='string'||email.length>320||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error('Provider email unavailable');
  return email.trim().toLowerCase();
}

export async function verifyGoogleIdentity({idToken,clientId,nonce,jwks=googleKeys}){
  if(typeof idToken!=='string'||idToken.length>12000||
    typeof nonce!=='string'||nonce.length!==43)throw new Error('Invalid Google identity');
  const {payload}=await jwtVerify(idToken,jwks,{
    issuer:'https://accounts.google.com',audience:clientId,
    algorithms:['RS256'],maxTokenAge:'10m',
  });
  if(payload.nonce!==nonce||payload.email_verified!==true||
    typeof payload.sub!=='string'||!payload.sub||payload.sub.length>255)
    throw new Error('Unverified Google identity');
  const email=verifiedEmail(payload.email);
  return {subject:payload.sub,email,displayName:String(payload.name||email.split('@')[0]).slice(0,100)};
}

export async function exchangeOAuthIdentity({provider,origin,clientId,clientSecret,
  code,codeVerifier,nonce,fetchImpl=fetch}){
  oauthProvider(provider);
  if(typeof code!=='string'||code.length<1||code.length>2048||/[\x00-\x20\x7f]/.test(code)||
    typeof codeVerifier!=='string'||codeVerifier.length!==43||
    typeof clientSecret!=='string'||!clientSecret||clientSecret.length>2048)
    throw new Error('Invalid OAuth exchange');
  const form=new URLSearchParams({grant_type:'authorization_code',code,
    redirect_uri:oauthCallbackUrl(origin,provider),client_id:clientId,
    client_secret:clientSecret,code_verifier:codeVerifier});
  const tokenResponse=await fetchImpl(TOKEN_ENDPOINT[provider],{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},
    body:form,signal:AbortSignal.timeout(10000),redirect:'error',cache:'no-store',
  });
  if(!tokenResponse.ok)throw new Error('Provider token exchange failed');
  const tokens=await tokenResponse.json();
  if(provider==='google')return verifyGoogleIdentity({idToken:tokens.id_token,clientId,nonce});
  if(typeof tokens.access_token!=='string'||tokens.access_token.length>4096||
    tokens.token_type?.toLowerCase()!=='bearer'||
    !String(tokens.scope||'').split(' ').includes('email')||
    !String(tokens.scope||'').split(' ').includes('identify'))
    throw new Error('Insufficient Discord authorization');
  const me=await fetchImpl(DISCORD_ME,{
    headers:{Authorization:'Bearer '+tokens.access_token,Accept:'application/json'},
    signal:AbortSignal.timeout(10000),redirect:'error',cache:'no-store',
  });
  if(!me.ok)throw new Error('Discord identity unavailable');
  const profile=await me.json();
  if(profile.verified!==true||typeof profile.id!=='string'||
    !/^\d{10,25}$/.test(profile.id))throw new Error('Unverified Discord identity');
  const email=verifiedEmail(profile.email);
  return {subject:profile.id,email,displayName:String(profile.global_name||profile.username||email.split('@')[0]).slice(0,100)};
}
