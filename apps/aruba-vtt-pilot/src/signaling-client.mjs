const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS=new Set(['offer','answer','ice']);
/** Aruba same-origin authenticated signaling transport. Never sends credentials in URLs. */
export function signalingUrl(origin,campaignId,role){
 if(!UUID.test(campaignId)||!['host','player'].includes(role))throw new TypeError('Invalid signaling identity');
 const url=new URL(origin);
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=='/')
  throw new TypeError('Invalid signaling origin');
 url.protocol=url.protocol==='https:'?'wss:':'ws:';
 url.pathname='/vtt/signaling';
 url.searchParams.set('campaignId',campaignId);url.searchParams.set('role',role);
 return url.href;
}
export function createSignalingClient({origin,campaignId,role,WebSocketImpl,onEvent,onDisconnect}){
 if(typeof WebSocketImpl!=='function'||typeof onEvent!=='function'||typeof onDisconnect!=='function')
  throw new TypeError('Signaling callbacks required');
 const ws=new WebSocketImpl(signalingUrl(origin,campaignId,role));
 let closed=false,ready=false;
 ws.addEventListener('message',event=>{
  if(closed||typeof event.data!=='string'||event.data.length>65536)return;
  let data;try{data=JSON.parse(event.data);}catch{return;}
  if(!data||typeof data!=='object'||Array.isArray(data))return;
  if(data.type==='ready'){
   // Accept the initial authenticated handshake only once; never forward a
   // malformed or contradictory second ready event to the peer lifecycle.
   if(ready||data.role!==role||!UUID.test(data.peerId??''))return;
   ready=true;
   onEvent(data);
   return;
  }
  if(!ready)return;
  if(['ready','peer-joined','peer-left','signal'].includes(data.type))onEvent(data);
 });
 ws.addEventListener('close',()=>{if(!closed){closed=true;ready=false;onDisconnect();}});
 ws.addEventListener('error',()=>{if(!closed){closed=true;ready=false;ws.close();onDisconnect();}});
 return {
  get ready(){return ready&&!closed;},
  send(kind,payload,targetPeerId){
   if(closed||!ready||ws.readyState!==WebSocketImpl.OPEN||!KINDS.has(kind)||
      !payload||typeof payload!=='object'||Array.isArray(payload))return false;
   if(role==='host'&&!UUID.test(targetPeerId??''))return false;
   if(role==='player'&&targetPeerId!==undefined)return false;
   const data={type:'signal',kind,payload};
   if(role==='host')data.targetPeerId=targetPeerId;
   try{ws.send(JSON.stringify(data));return true;}catch{return false;}
  },
  close(){if(!closed){closed=true;ready=false;ws.close();}},
 };
}
