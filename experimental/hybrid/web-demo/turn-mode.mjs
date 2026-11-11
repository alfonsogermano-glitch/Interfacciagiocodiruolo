// TURN-only mode is an opt-in experiment. Credentials are supplied in memory
// by each browser, never persisted, logged, or put in room codes.
export const TURN_PREFIX='T';
export function isTurnRoom(code){return typeof code==='string'&&code.toUpperCase().startsWith(TURN_PREFIX)}
export function turnIceConfig(url,username,credential){
 if(typeof url!=='string'||!/^turns?:[^\s/?#]+(?::\d{1,5})?(?:\?transport=(?:tcp|udp))?$/i.test(url.trim()))
  throw Error('Inserisci un indirizzo TURN valido (turn:host:3478 oppure turns:host:5349)');
 if(!username||!credential)throw Error('TURN richiede utente e credenziale validi su entrambi i dispositivi');
 const candidate=url.trim();
 const match=candidate.match(/:(\d{1,5})(?:\?|$)/);
 if(match&&(Number(match[1])<1||Number(match[1])>65535))throw Error('Porta TURN non valida');
 return {iceServers:[{urls:candidate,username,credential}],iceTransportPolicy:'relay'};
}
