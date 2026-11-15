/**
 * Binds a pre-authenticated browser RTCDataChannel to the existing
 * authoritative GM event router. NO authentication is performed here:
 * the caller MUST take authenticatedUserId and verifiedCampaignId from
 * the server-verified campaign membership, NEVER from any wire message.
 * This is a standalone transport adapter, not enabled in the VTT UI.
 *
 * Incoming wire schema is ONLY {"event": string, "payload": object}.
 * Identity, campaign scope and event permissions remain owned by the router.
 */
const MAX_BYTES=65536;
const utf8=new TextEncoder();
const decoder=new TextDecoder('utf-8',{fatal:true});
const CHANNEL_STATES=new Set(['open','connecting','closing','closed']);

function parseFrame(data){
 if(typeof data!=='string'||utf8.encode(data).length>MAX_BYTES)return null;
 let frame;
 try{frame=JSON.parse(data);}catch{return null;}
 if(!frame||Array.isArray(frame)||typeof frame!=='object')return null;
 const keys=Object.keys(frame).sort();
 if(keys.length!==2||keys[0]!=='event'||keys[1]!=='payload'||
  typeof frame.event!=='string'||!frame.payload||
  typeof frame.payload!=='object'||Array.isArray(frame.payload))return null;
 return frame;
}
function wireFrame(message){
 if(!message||typeof message!=='object')return null;
 // The router delivers campaignId and event. Never forward the envelope's
 // fromUserId or trust a user-controlled sender field from the wire.
 const frame={event:message.event,payload:message.payload};
 let serialized;
 try{serialized=JSON.stringify(frame);}catch{return null;}
 if(!serialized||utf8.encode(serialized).length>MAX_BYTES)return null;
 return serialized;
}

/**
 * The registered peer's authenticated identity must be held outside WebRTC,
 * supplied by a trusted, revalidated signaling/membership integration.
 * Do not attach an unknown peer; do not infer identity from the DataChannel.
 */
export function attachVerifiedPlayerDataChannel({
 router,channel,peerId,authenticatedUserId,verifiedCampaignId,onError=()=>{},
}){
 if(typeof router?.attachVerifiedPlayer!=='function'||
  typeof channel?.addEventListener!=='function'||
  typeof channel?.removeEventListener!=='function'||
  typeof channel?.send!=='function'||
  typeof onError!=='function'||
  (channel.readyState!==undefined&&!CHANNEL_STATES.has(channel.readyState)))
  throw new TypeError('Verified WebRTC channel adapter dependencies required');
 let current=true;
 const deliver=message=>{
  if(!current||channel.readyState!=='open')return;
  const serialized=wireFrame(message);
  if(!serialized)return;
  try{channel.send(serialized);}catch(error){onError(error);}
 };
 const registered=router.attachVerifiedPlayer({
  peerId,authenticatedUserId,verifiedCampaignId,receiveFromHost:deliver,
 });
 if(!registered)return null; // Never install a handler on unauthorized peers.
 function onMessage(event){
  if(!current||channel.readyState!=='open')return;
  const frame=parseFrame(event?.data);
  if(!frame)return;
  // The router's player policy is fail-closed, even for known event names.
  try{registered.publish(frame.event,frame.payload);}catch(error){onError(error);}
 }
 const close=()=>{
  if(!current)return;
  current=false;
  channel.removeEventListener('message',onMessage);
  channel.removeEventListener('close',close);
  channel.removeEventListener('error',close);
  registered.disconnect();
 };
 channel.addEventListener('message',onMessage);
 channel.addEventListener('close',close);
 channel.addEventListener('error',close);
 if(channel.readyState==='closed'||channel.readyState==='closing')close();
 return Object.freeze({disconnect:close});
}
