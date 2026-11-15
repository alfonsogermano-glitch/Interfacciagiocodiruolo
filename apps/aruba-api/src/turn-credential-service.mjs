import {createHmac} from 'node:crypto';
import {CampaignRejected} from './campaign-service.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TURN_URL=/^turns?:[a-zA-Z0-9.-]+(?::[0-9]{1,5})?(?:\?transport=(?:tcp|udp))?$/;
const MAX_TTL=900;

/**
 * Normalize precisely one optional trailing LF from an operator-created
 * secret file. Reject all other whitespace and incorrect encodings.
 * Coturn's POSIX launcher strips the final newline when reading the same file.
 * HMAC must use the ASCII hex text itself, not the hex-decoded bytes.
 */
export function parseTurnSharedSecret(content){
 if(!Buffer.isBuffer(content))throw new TypeError('TURN secret file must be bytes');
 const original=content.toString('utf8');
 if(!/^[0-9a-f]{64}\n?$/.test(original))
  throw new TypeError('TURN secret file must contain 64 lowercase hex characters');
 return Buffer.from(original.replace(/\n$/,''),'ascii');
}

/**
 * Coturn REST shared-secret credentials, short-lived and authenticated.
 * Server-only. No permanent TURN secret is ever sent to the browser.
 * TURN must be provisioned separately with use-auth-secret, matching secret,
 * and sufficient TLS/UDP/TCP firewall configuration. Not enabled by default.
 */
export function createTurnCredentialService({identity,sharedSecret,urls,
 ttlSeconds=600,clock=()=>Date.now()}){
 if(typeof identity?.verify!=='function'||!Buffer.isBuffer(sharedSecret)||
    sharedSecret.length<32||
    !Array.isArray(urls)||!urls.length||urls.length>4||
    urls.some(url=>typeof url!=='string'||!TURN_URL.test(url)||url.length>512)||
    !Number.isSafeInteger(ttlSeconds)||ttlSeconds<60||ttlSeconds>MAX_TTL||
    typeof clock!=='function')
  throw new TypeError('Secure TURN configuration required');
 const secret=Buffer.from(sharedSecret);
 const safeUrls=Object.freeze([...urls]);
 return {
  async issue({sessionToken,campaignId,connectionRole}){
   if(typeof sessionToken!=='string'||!sessionToken||
      !UUID.test(campaignId??'')||!['host','player'].includes(connectionRole))
    throw new CampaignRejected('Richiesta TURN non valida',401);
   const proof=await identity.verify({sessionToken,campaignId,connectionRole});
   if(!UUID.test(proof?.userId??'')||proof.campaignId!==campaignId||
      proof.role!==(connectionRole==='host'?'gm':'player'))
    throw new CampaignRejected('Accesso TURN negato',403);
   const now=clock();
   if(!Number.isSafeInteger(now)||now<0)
    throw new Error('Clock not available');
   const expiresAt=Math.floor(now/1000)+ttlSeconds;
   // Standard coturn REST API username: timestamp:opaque identifier.
   // The identity is bound to a freshly verified campaign membership.
   const username=expiresAt+':'+proof.userId;
   const credential=createHmac('sha1',secret).update(username).digest('base64');
   return {iceServers:[{urls:[...safeUrls],username,credential}],expiresAt};
  },
 };
}
