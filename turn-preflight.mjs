// Isolated TURN allocation probe. No PeerJS/signaling; no actual game data.
// Reporting never includes credentials, IP addresses, SDP or candidate strings.
export async function probeTurn(config,{RTCPeerConnectionClass=globalThis.RTCPeerConnection,timeoutMs=10000}={}){
 if(typeof RTCPeerConnectionClass!=='function')throw Error('WebRTC non disponibile nel browser');
 if(config?.iceTransportPolicy!=='relay'||!Array.isArray(config.iceServers)||!config.iceServers.length)
  throw Error('Configurazione TURN relay-only mancante');
 let pc,clock,done=false;
 const errors=[],types=new Set();
 const result={ok:false,candidateTypes:[],errors,iceGatheringState:'new'};
 try{
  pc=new RTCPeerConnectionClass(config);
  const completed=new Promise(resolve=>{
   const finish=()=>{if(done)return;done=true;resolve()};
   pc.onicecandidate=event=>{
    if(event?.candidate?.candidate){
     const match=event.candidate.candidate.match(/\btyp (host|srflx|prflx|relay)\b/);
     if(match)types.add(match[1]);
     if(match?.[1]==='relay')finish();
    }else if(event?.candidate===null)finish();
   };
   pc.onicecandidateerror=event=>{
    const code=Number(event?.errorCode);
    const label=Number.isInteger(code)?String(code):'non disponibile';
    if(!errors.includes(label))errors.push(label);
   };
   pc.onicegatheringstatechange=()=>{if(pc.iceGatheringState==='complete')finish()};
   clock=setTimeout(finish,timeoutMs);
  });
  pc.createDataChannel('turn-preflight');
  const offer=await pc.createOffer();
  await pc.setLocalDescription(offer);
  await completed;
  result.ok=types.has('relay');
  result.candidateTypes=[...types];
  result.iceGatheringState=pc.iceGatheringState;
  return result;
 }finally{
  if(clock!==undefined)clearTimeout(clock);
  if(pc)pc.close();
 }
}
export function explainTurnProbe(result){
 if(result.ok)return 'TURN funzionante: candidato relay ottenuto. Ora puoi provare la connessione PC–Android.';
 const suffix=result.errors?.length?' · codici ICE: '+result.errors.join(', '):'';
 return 'TURN NON raggiungibile o autorizzato: nessun candidato relay generato'+suffix+'. Controlla credenziali, scadenza, URL/porte e rete; prova un diverso trasporto TURN o un altro provider.';
}
