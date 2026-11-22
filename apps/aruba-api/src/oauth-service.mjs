import {createHash,randomBytes} from 'node:crypto';
import {rateLimitSubjectDigest} from './auth-abuse.mjs';
import {hashSessionToken,createOpaqueSessionToken} from './session-token.mjs';
import {oauthAuthorizationUrl,oauthCallbackUrl,assertOAuthIssuer,oauthProvider} from './oauth-provider-contract.mjs';
import {exchangeOAuthIdentity} from './oauth-provider-identity.mjs';

const random=()=>randomBytes(32).toString('base64url');
const digest=value=>createHash('sha256').update(value).digest();
const browserPattern=/^[A-Za-z0-9_-]{43}$/;
const challenge=verifier=>createHash('sha256').update(verifier).digest('base64url');

export function createOAuthService({pool,origin,providers,getSessionUser,hmacKey,
  exchange=exchangeOAuthIdentity,issueToken=createOpaqueSessionToken}){
  if(typeof pool?.query!=='function'||typeof pool?.connect!=='function'||
    typeof getSessionUser!=='function'||
    !Buffer.isBuffer(hmacKey)||hmacKey.length<32)throw new TypeError('OAuth dependencies required');
  oauthCallbackUrl(origin,'google');
  for(const [provider,config] of Object.entries(providers)){
    oauthProvider(provider);
    if(typeof config?.clientId!=='string'||!config.clientId||
      typeof config?.clientSecret!=='string'||!config.clientSecret)
      throw new TypeError('OAuth client configuration incomplete');
  }
  function configured(provider){
    oauthProvider(provider);
    const config=providers[provider];
    if(!config)throw new Error('OAuth provider not configured');
    return config;
  }
  return {
    async start({provider,networkSubject,linkSession=null,requireLink=false}){
      const config=configured(provider);
      if(requireLink&&!linkSession)throw new Error('Valid session required for linking');
      if(typeof networkSubject!=='string'||networkSubject.length>512||!networkSubject)
        throw new Error('OAuth network unavailable');
      const minute=new Date(Math.floor(Date.now()/60000)*60000);
      const subject=rateLimitSubjectDigest({secret:hmacKey,action:'oauth_start',
        category:'network',value:networkSubject});
      const limited=await pool.query(
        `INSERT INTO hollowgate_auth.rate_limit_buckets(action,subject_digest,window_start,hits)
         VALUES ('oauth_start',$1,$2,1)
         ON CONFLICT (action,subject_digest,window_start)
         DO UPDATE SET hits=hollowgate_auth.rate_limit_buckets.hits+1,updated_at=now()
         RETURNING hits`,[subject,minute]);
      if(Number(limited.rows[0].hits)>10)throw new Error('OAuth rate limit');
      const linkUser=linkSession?await getSessionUser(linkSession):null;
      if(linkSession&&!linkUser)throw new Error('Valid session required for linking');
      const state=random(),browser=random(),verifier=random();
      const nonce=provider==='google'?random():null;
      const url=oauthAuthorizationUrl({provider,origin,clientId:config.clientId,
        state,codeChallenge:challenge(verifier),nonce});
      await pool.query('SELECT hollowgate_auth.begin_oauth($1,$2,$3,$4,$5,$6,$7)',
        [digest(state),digest(browser),provider,verifier,nonce,linkUser?.id??null,
          linkSession?hashSessionToken(linkSession):null]);
      return {url,browser};
    },
    async finish({provider,state,code,issuer,browser}){
      const config=configured(provider);
      if(!browserPattern.test(state??'')||!browserPattern.test(browser??'')||
        typeof code!=='string'||code.length<1||code.length>2048)
        throw new Error('Invalid OAuth callback');
      if(provider==='discord')assertOAuthIssuer(provider,issuer);
      else if(issuer!==null&&issuer!==undefined)assertOAuthIssuer(provider,issuer);
      const attempt=await pool.query('SELECT * FROM hollowgate_auth.consume_oauth($1,$2,$3)',
        [digest(state),digest(browser),provider]);
      if(attempt.rowCount!==1)throw new Error('OAuth state invalid or expired');
      const item=attempt.rows[0];
      if(item.link_user_id){
        const active=await pool.query(
          `SELECT 1 FROM hollowgate_auth.sessions s
           JOIN hollowgate_auth.users u ON u.id=s.user_id
           WHERE s.token_hash=$1 AND s.user_id=$2 AND s.revoked_at IS NULL
             AND s.expires_at>now() AND u.status='active' AND u.email_verified_at IS NOT NULL`,
          [item.link_session_digest,item.link_user_id]);
        if(active.rowCount!==1)throw new Error('Linking session expired');
      }
      const identity=await exchange({provider,origin,clientId:config.clientId,
        clientSecret:config.clientSecret,code,codeVerifier:item.code_verifier,
        nonce:item.nonce});
      const client=await pool.connect();
      try{
        await client.query('BEGIN');
        const user=await client.query('SELECT hollowgate_auth.finish_oauth($1,$2,$3,$4,$5) AS id',
          [provider,identity.subject,identity.email,identity.displayName,item.link_user_id]);
        if(!user.rows[0]?.id)throw new Error('Account linking required or identity unavailable');
        const token=issueToken();
        await client.query('INSERT INTO hollowgate_auth.sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval \'12 hours\')',
          [user.rows[0].id,hashSessionToken(token)]);
        await client.query('COMMIT');
        return {token};
      }catch(error){
        try{await client.query('ROLLBACK');}catch{/* Never replace the original failure. */}
        throw error;
      }finally{client.release();}
    },
  };
}
