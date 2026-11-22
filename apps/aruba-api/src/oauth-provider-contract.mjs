// Provider allowlist for the future server-side authorization-code flow.
// This module never handles provider secrets or authenticates a user on its own.
const PROVIDERS=Object.freeze({
  google:Object.freeze({
    authorize:'https://accounts.google.com/o/oauth2/v2/auth',
    issuer:'https://accounts.google.com',
    scope:'openid email profile',
  }),
  discord:Object.freeze({
    authorize:'https://discord.com/oauth2/authorize',
    issuer:'https://discord.com',
    scope:'identify email',
  }),
});
const RANDOM=/^[A-Za-z0-9_-]{43}$/;
export function oauthProvider(name){
  if(!Object.hasOwn(PROVIDERS,name))throw new TypeError('Unsupported OAuth provider');
  return PROVIDERS[name];
}
export function oauthCallbackUrl(origin,provider){
  oauthProvider(provider);
  const url=new URL(origin);
  if(url.protocol!=='https:'||url.origin!==origin)throw new TypeError('Exact HTTPS origin required');
  return origin+'/auth/oauth/'+provider+'/callback';
}
export function oauthAuthorizationUrl({provider,origin,clientId,state,codeChallenge,nonce=null}){
  const config=oauthProvider(provider);
  if(typeof clientId!=='string'||!clientId.trim()||clientId.length>256||
    !RANDOM.test(state)||!RANDOM.test(codeChallenge)||
    (provider==='google'?!RANDOM.test(nonce):nonce!==null))throw new TypeError('Incomplete OAuth request');
  const url=new URL(config.authorize);
  url.searchParams.set('response_type','code');
  url.searchParams.set('client_id',clientId);
  url.searchParams.set('redirect_uri',oauthCallbackUrl(origin,provider));
  url.searchParams.set('scope',config.scope);
  url.searchParams.set('state',state);
  url.searchParams.set('code_challenge',codeChallenge);
  url.searchParams.set('code_challenge_method','S256');
  if(provider==='google')url.searchParams.set('nonce',nonce);
  return url.toString();
}
export function assertOAuthIssuer(provider,issuer){
  if(issuer!==oauthProvider(provider).issuer)throw new TypeError('OAuth issuer mismatch');
}
