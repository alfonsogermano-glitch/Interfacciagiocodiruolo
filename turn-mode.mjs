// TURN credentials are transient browser-only values. Never log or persist them.
export const TURN_PREFIX='T';
export function isTurnRoom(code){return typeof code==='string'&&code.toUpperCase().startsWith(TURN_PREFIX)}
export function turnIceConfig(url,username,credential){
 let urls=url;
 // rstream Download / JSON response can be pasted as-is into the URL input.
 if(typeof url==='string'&&url.trim().startsWith('{')){
  let obj;
  try{obj=JSON.parse(url)}catch{throw Error('Configurazione TURN JSON non valida')}
  const ice=obj.iceServers?.[0]??obj;
  urls=ice.urls;username=ice.username;credential=ice.credential;
 }
 if(typeof urls==='string')urls=urls.trim().split(/[\s,]+/).filter(Boolean);
 if(!Array.isArray(urls)||urls.length===0||urls.length>8)
  throw Error('Inserisci uno o più indirizzi TURN validi');
 for(const address of urls){
  if(typeof address!=='string'||!/^turns?:[^\s/?#]+(?::\d{1,5})?(?:\?transport=(?:tcp|udp))?$/i.test(address))
   throw Error('Indirizzo TURN non valido: usa turn:host:3478 oppure turns:host:5349');
  const match=address.match(/:(\d{1,5})(?:\?|$)/);
  if(match&&(Number(match[1])<1||Number(match[1])>65535))throw Error('Porta TURN non valida');
 }
 if(typeof username!=='string'||!username.trim()||typeof credential!=='string'||!credential)
  throw Error('TURN richiede utente e credenziale validi');
 return {iceServers:[{urls,username:username.trim(),credential}],iceTransportPolicy:'relay'};
}
export function createJoinFragment(code,turnConfig){
 if(typeof code!=='string'||!/^[A-HJ-NP-Z2-9]{12}$/.test(code)||!isTurnRoom(code))throw Error('Codice stanza TURN non valido');
 const server=turnConfig?.iceServers?.[0];
 if(turnConfig?.iceTransportPolicy!=='relay'||!server)throw Error('Configurazione TURN mancante');
 const data=JSON.stringify({v:1,c:code,u:server.urls,n:server.username,p:server.credential});
 const bytes=new TextEncoder().encode(data);
 let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
 return '#join='+btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export function parseJoinFragment(fragment){
 const value=new URLSearchParams(String(fragment||'').replace(/^#/, '')).get('join');
 if(!value)return null;
 if(value.length>8192||!/^[A-Za-z0-9_-]+$/.test(value))throw Error('Link di accesso non valido');
 let data;
 try{
  const binary=atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4));
  const bytes=Uint8Array.from(binary,ch=>ch.charCodeAt(0));
  data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 }catch{throw Error('Link di accesso danneggiato')}
 if(data?.v!==1)throw Error('Versione link non riconosciuta');
 const config=turnIceConfig(data.u,data.n,data.p);
 if(!isTurnRoom(data.c)||!/^[A-HJ-NP-Z2-9]{12}$/.test(data.c))throw Error('Codice stanza non valido');
 return {code:data.c,config};
}
