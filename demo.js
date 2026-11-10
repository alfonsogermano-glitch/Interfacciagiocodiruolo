// Hollowgate Hybrid browser-to-browser experiment.
import { assessAnswer } from './answer-guard.mjs';
import { retryDelay,canRetry } from './reconnect-policy.mjs';
import { adaptPeerJsConnection } from './peerjs-adapter.mjs';
import { snapshotPackets,createSnapshotAssembler } from './snapshot-wire.mjs';
import { makeRttMeter,describeRtt,classifySelectedPair } from './latency-metrics.mjs';
import { newRoomCode,explainPeerFailure } from './room-lifecycle.mjs';
import { connectionProblem,retryablePeerError } from './connection-diagnostics.mjs';
import { createConnectClient, validateHubEndpoint } from './connect-client.mjs';
// No Supabase, no production Auth, and no permanent server-side data.
// GM is the only authority. WebRTC data channels are DTLS encrypted.
// Manual signaling is intentionally temporary until Hollowgate Hub exists.
const $=id=>document.getElementById(id);
const STORAGE='hollowgate-hybrid-web-demo-v1';
// Codes are per-live-room, not durable across reloads: an old PeerJS ID can be stale.
const stun={iceServers:[{urls:'stun:stun.l.google.com:19302'}]};
const peers=new Map();
const pendingPeerJs=new Map();
const SNAPSHOT_ACK_RETRIES=4;
let mode='gm',hostState=null,channel=null,playerPC=null,peerId=null,playerState=null,role='gm', applyingAnswer=false, appliedAnswerSdp=null;
let latencyTimer=null, lastPingId=null, lastPingAt=0, latencyMs=null, sentPings=0, receivedPings=0;
const playerRtt=makeRttMeter();
let quickRoute='percorso non disponibile';
let connectClient=null, autoSession=false, pendingApprovalTimer=null;
let snapshotRecoveryTimer=null, snapshotRecoveryTries=0;
const log=(text)=>{const line=document.createElement('div');line.textContent=new Date().toLocaleTimeString()+' · '+text;$('log').prepend(line)};
const copy=async(id)=>{try{await navigator.clipboard.writeText($(id).value);log('Testo copiato negli appunti')}catch{ $(id).select();log('Seleziona e copia con Ctrl+C')}}; 
$('copyHostAnswer').onclick=()=>copy('hostAnswer');$('copyPlayerOffer').onclick=()=>copy('playerOffer');
const genId=()=>crypto.randomUUID();
const defaultState=()=>({title:'Campagna demo',sequence:0,owner:'gm',members:{},tokens:{gm:{owner:'gm',x:20,y:20}},activity:[]});
const save=()=>{if(!hostState)return;localStorage.setItem(STORAGE,JSON.stringify(hostState))};
const displayStatus=text=>{$('status').textContent=text;log(text)};
const quickDiag=(text)=>{const el=$('quickDiagnostics');if(el)el.textContent=text};
const updateLatency=()=>{
 const meter=$('latencyMeter');
 if(!meter)return;
 if(mode==='gm'){
  const connected=[...peers.entries()].filter(([,peer])=>peer.channel?.readyState==='open');
  meter.textContent=connected.length===0?'Latenza: nessun giocatore collegato':
   connected.map(([id,peer])=>id+': '+describeRtt(peer.rttMeter?.summary())+
    (peer.route?' · '+peer.route:'')).join(' | ');
 }else{
  meter.textContent='RTT giocatore: '+describeRtt(playerRtt.summary())+
   ' · '+quickRoute+' · risposte '+receivedPings+'/'+sentPings;
 }

};
function stopPings(){
 if(latencyTimer!==null){clearInterval(latencyTimer);latencyTimer=null;}
 lastPingId=null;latencyMs=null;sentPings=0;receivedPings=0;playerRtt.clear();updateLatency();
}
function startPings(c){
 stopPings();
 const pulse=()=>{
  if(c.readyState!=='open')return;
  const id=crypto.randomUUID();
  lastPingId=id;lastPingAt=performance.now();sentPings++;
  tell(c,{kind:'ping',id});updateLatency();
 };
 pulse();latencyTimer=setInterval(pulse,3000);
}

function selectMode(next){
 mode=next;updateLatency();$('hostMode').classList.toggle('selected',next==='gm');$('playerMode').classList.toggle('selected',next==='player');
 $('hostSetup').hidden=next!=='gm';$('playerSetup').hidden=next!=='player';$('session').hidden=true;
 $('quickApprovals').parentElement.hidden=next==='player';
}
$('hostMode').onclick=()=>selectMode('gm');$('playerMode').onclick=()=>selectMode('player');
$('startHost').onclick=()=>{
 if(!hostState){try{const x=JSON.parse(localStorage.getItem(STORAGE));hostState=x&&x.tokens&&Array.isArray(x.activity)?x:defaultState()}catch{hostState=defaultState()}}
 save();role='gm';peerId='gm';$('hostSignal').hidden=false;$('session').hidden=false;displayStatus('GM Host attivo, in attesa di giocatori');render();
};
$('resetHost').onclick=()=>{
 if(!confirm('Cancellare esclusivamente la campagna dimostrativa salvata in questo browser?'))return;
 localStorage.removeItem(STORAGE);hostState=defaultState();save();for(const [id,p] of peers){endHostPing(id,p);p.channel.close()}peers.clear();updateLatency();displayStatus('Campagna di prova azzerata');render();
};
const validateName=s=>typeof s==='string'&&s.trim().length>0&&s.length<=32?s.trim():'Giocatore';
const visibleTo=(activity,receiver)=>activity.filter(e=>e.visibility!=='gm'||receiver==='gm');
function snapshot(receiver){
 const state=hostState;
 return {title:state.title,sequence:state.sequence,role:receiver==='gm'?'gm':'player',self:receiver,
 tokens:state.tokens,activity:visibleTo(state.activity,receiver)};
}
const tell=(p,body)=>{if(p?.readyState==='open')p.send(JSON.stringify(body))};
function beginHostPing(id,peer){
 if(peer.timer)clearInterval(peer.timer);
 const pulse=()=>{
  if(peer.channel.readyState!=='open')return;
  peer.pendingPing=crypto.randomUUID();
  peer.sentAt=performance.now();
  tell(peer.channel,{kind:'ping',id:peer.pendingPing});
 };
 pulse();peer.timer=setInterval(pulse,3000);
}
function endHostPing(id,peer){
 if(peer?.timer)clearInterval(peer.timer);
 if(peer?.syncTimer)clearInterval(peer.syncTimer);
 if(peer){peer.timer=null;peer.syncTimer=null}
 if(peers.get(id)===peer)peers.delete(id);
 updateLatency();
}
function sendFreshSnapshot(id){
 const peer=peers.get(id);
 if(!peer||peer.channel?.readyState!=='open')return false;
 const packets=snapshotPackets(snapshot(id),crypto.randomUUID());
 log('Invio stato a '+id+' · '+packets.length+' pacchetto/i');
 for(const packet of packets)tell(peer.channel,packet);
 return true;
}
function awaitSnapshotAck(id){
 const peer=peers.get(id);
 if(!peer)return;
 if(peer.syncTimer)clearInterval(peer.syncTimer);
 peer.syncAttempts=0;
 peer.syncTimer=setInterval(()=>{
  if(peers.get(id)!==peer||peer.syncAcked||peer.channel.readyState!=='open'){
   clearInterval(peer.syncTimer);peer.syncTimer=null;return;
  }
  if(++peer.syncAttempts>SNAPSHOT_ACK_RETRIES){
   clearInterval(peer.syncTimer);peer.syncTimer=null;
   log('Snapshot non confermato da '+id+'; il giocatore può richiedere un nuovo stato');
   return;
  }
  sendFreshSnapshot(id);
  log('Ritrasmissione snapshot #'+peer.syncAttempts+' a '+id);
 },1500);
}

function broadcast(){
 render();
 for(const [id] of peers){
  try{sendFreshSnapshot(id)}
  catch(e){log('Errore invio stato a '+id+': '+e.message)}
 }
}
function applyCommand(actor,action){
 if(!hostState||!action||typeof action!=='object')return false;
 const type=action.type;
 let entry;
 if(type==='move'){
   const t=hostState.tokens[action.id];if(!t||(actor!=='gm'&&t.owner!==actor))return false;
   if(!Number.isInteger(action.direction)||Math.abs(action.direction)!==1)return false;
   t.x=Math.max(5,Math.min(95,t.x+action.direction*10));entry={label:actor+' ha spostato '+action.id,visibility:'public'};
 }else if(type==='roll'){
   entry={label:actor+' ha tirato d20 → '+(crypto.getRandomValues(new Uint32Array(1))[0]%20+1),visibility:'public'};
 }else if(type==='note'){
   if(typeof action.text!=='string'||!action.text.trim()||action.text.length>250)return false;
   const visibility=action.visibility==='gm'?'gm':'public';if(visibility==='gm'&&actor!=='gm')return false;
   entry={label:actor+': '+action.text.trim(),visibility};
 }else return false;
 hostState.sequence+=1;entry.sequence=hostState.sequence;hostState.activity.push(entry);save();broadcast();return true;
}
function render(){
 const state=mode==='gm'&&hostState?snapshot('gm'):playerState;
 if(!state)return;
 if(!state.tokens||typeof state.tokens!=='object'||!Array.isArray(state.activity))throw Error('Struttura dello stato non valida');
 const firstView=$('session').hidden;
 $('session').hidden=false;$('sessionTitle').textContent=state.title;
 $('roleInfo').textContent=state.role==='gm'?'Sei il GM autorevole — dati su questo browser':'Sei giocatore — stato ricevuto dal GM';
 $('sequence').textContent='Stato #'+state.sequence;
 $('secretNote').hidden=state.role!=='gm';
 const board=$('board');board.replaceChildren();
 for(const [id,t] of Object.entries(state.tokens)){
  const span=document.createElement('span');span.className='token '+(t.owner===state.self?'mine':t.owner==='gm'?'gm':'');
  span.textContent=id==='gm'?'GM':id.slice(-2);span.style.left=t.x+'%';span.style.top=t.y+'%';span.title=id+' · '+t.owner;board.append(span);
 }
 const timeline=$('timeline');timeline.replaceChildren();
 for(const e of [...state.activity].reverse().slice(0,50)){const li=document.createElement('li');li.textContent='#'+e.sequence+' '+e.label;if(e.visibility==='gm')li.className='private';timeline.append(li)}
 // On narrow screens the legacy manual-pairing form otherwise obscures the board.
 if(mode==='player'&&firstView){
  quickDiag('Campo ricevuto · stato #'+state.sequence+' · '+Object.keys(state.tokens).length+' pedine · visualizzazione attiva');
  requestAnimationFrame(()=>$('session').scrollIntoView({behavior:'smooth',block:'start'}));
 }
}
function act(action){
 if(mode==='gm'){if(!applyCommand('gm',action))log('Comando rifiutato');return}
 if(!channel||channel.readyState!=='open'){log('Non sei collegato al GM');return}
 tell(channel,{kind:'command',action});
}
function move(d){
 const state=mode==='gm'&&hostState?snapshot('gm'):playerState;if(!state)return;
 const token=Object.entries(state.tokens).find(([id,t])=>t.owner===state.self);
 if(!token){log('Nessuna pedina assegnata');return}
 act({type:'move',id:token[0],direction:d});
}
$('moveLeft').onclick=()=>move(-1);$('moveRight').onclick=()=>move(1);$('rollDice').onclick=()=>act({type:'roll'});
function note(visibility){const text=$('noteText').value;if(!text.trim())return;act({type:'note',visibility,text});$('noteText').value=''}
$('sendNote').onclick=()=>note('public');$('secretNote').onclick=()=>note('gm');
function pc(label){
 const connection=new RTCPeerConnection(stun);
 connection.oniceconnectionstatechange=()=>{
  const state=connection.iceConnectionState;
  log(label+' · ICE: '+state);
  if(state==='failed')displayStatus('Connessione ICE fallita: probabilmente serve un relay TURN su queste reti');
  else if(state==='disconnected')displayStatus('Connessione instabile: ICE disconnesso');
 };
 connection.onconnectionstatechange=()=>{
  const state=connection.connectionState;
  log(label+' · peer: '+state);
  if(state==='failed')displayStatus('Connessione diretta fallita: ripeti una nuova offerta oppure usa un relay TURN');
 };
 return connection;
}
function gathered(connection){
 if(connection.iceGatheringState==='complete')return Promise.resolve();
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{connection.removeEventListener('icegatheringstatechange',check);reject(new Error('ICE timeout'))},17000);
  const check=()=>{if(connection.iceGatheringState==='complete'){clearTimeout(timer);connection.removeEventListener('icegatheringstatechange',check);resolve()}};
  connection.addEventListener('icegatheringstatechange',check);check();
 });
}
$('createOffer').onclick=async()=>{
 try{
  if(playerPC)playerPC.close();stopPings();
  appliedAnswerSdp=null;applyingAnswer=false;$('remoteAnswer').value='';
  $('applyAnswer').disabled=false;
  playerPC=pc('Giocatore');bindPlayerChannel(playerPC.createDataChannel('hollowgate',{ordered:true}));
  const offer=await playerPC.createOffer();await playerPC.setLocalDescription(offer);await gathered(playerPC);
  $('playerOffer').value=JSON.stringify(playerPC.localDescription);
  displayStatus('Offerta pronta: copiala al GM');
 }catch(e){log('Errore offerta: '+e.message)}
};
// Use the same game command handlers for manual WebRTC and quick-connect PeerJS.
function stopSnapshotRecovery(){
 if(snapshotRecoveryTimer!==null){clearInterval(snapshotRecoveryTimer);snapshotRecoveryTimer=null}
 snapshotRecoveryTries=0;
}
function requestPlayerSnapshot(c,reason=''){
 if(channel!==c||c.readyState!=='open'||playerState)return false;
 tell(c,{kind:'sync-request'});
 log('Richiesta stato partita inviata al GM'+(reason?' · '+reason:''));
 $('quickReconnect').textContent='Autorizzazione ricevuta · sincronizzazione in corso';
 quickDiag('Autorizzazione confermata. Stato partita non ancora ricevuto · richiesta '+(reason||'iniziale'));
 return true;
}
function startSnapshotRecovery(c){
 stopSnapshotRecovery();
 if(playerState)return;
 // Request the latest state immediately after approval. Retry on mobile,
 // where an initial DataChannel message may precede event registration.
 requestPlayerSnapshot(c,'autorizzazione');
 snapshotRecoveryTimer=setInterval(()=>{
  if(channel!==c||c.readyState!=='open'||playerState){stopSnapshotRecovery();return}
  if(++snapshotRecoveryTries>5){
   stopSnapshotRecovery();
   displayStatus('Autorizzato, ma stato della partita non ricevuto. Premi «Recupera campo di gioco».');
   log('Snapshot mancante dopo cinque richieste; controllare anche registro GM');
   return;
  }
  requestPlayerSnapshot(c,'tentativo '+snapshotRecoveryTries+'/5');
 },2000);
}
$('quickSync').onclick=()=>{
 if(!channel||channel.readyState!=='open'){displayStatus('Non è presente una connessione aperta con il GM');return}
 // Explicit refresh is allowed only for an already-approved peer:
 // the GM checks its authenticated channel entry before responding.
 playerState=null;
 startSnapshotRecovery(channel);
};
function applyPlayerSnapshot(state,c){
 if(!state||typeof state.sequence!=='number')throw Error('Snapshot non valido');
 log('Snapshot ricevuto dal GM · #'+state.sequence);
 quickDiag('Snapshot ricevuto · visualizzazione del campo in corso');
 playerState=state;
 render();
 stopSnapshotRecovery();
 tell(c,{kind:'snapshot-ack',sequence:playerState.sequence});
 $('quickReconnect').textContent='Sincronizzazione completata · stato #'+playerState.sequence;
 displayStatus('Collegato al GM · stato #'+playerState.sequence);
}
function bindPlayerChannel(c){
  channel=c;
  const assembler=createSnapshotAssembler(
   state=>{try{applyPlayerSnapshot(state,c)}catch(e){quickDiag('Errore stato: '+e.message);log('Errore stato: '+e.message)}},
   error=>{quickDiag(error);log(error)}
  );
  channel.onopen=()=>{tell(channel,{kind:'join',name:validateName($('playerName').value),resumeKey:quickRole==='player'?quickResumeKey:null});startPings(channel);displayStatus('Connessione diretta aperta; attendo il GM')};
  channel.onclose=()=>{stopSnapshotRecovery();stopPings();displayStatus('Connessione con il GM chiusa')};
  channel.onmessage=e=>{try{
   const m=JSON.parse(e.data);
   if(m.kind==='snapshot')applyPlayerSnapshot(m.state,c);
   else if(assembler.accept(m)){} // Wait for all snapshot parts before rendering.
   else if(m.kind==='waiting'){
    if(!playerState)displayStatus('Connessione aperta: attendo autorizzazione del GM');
   }
   else if(m.kind==='approved'){
    quickDiag('Autorizzato dal GM · in attesa dello stato iniziale');
    displayStatus('Accesso autorizzato dal GM · recupero campo di gioco');
    startSnapshotRecovery(c);
   }
   else if(m.kind==='rejected'){
    stopSnapshotRecovery();displayStatus('Richiesta di accesso rifiutata dal GM');
   }
   else if(m.kind==='ping'&&typeof m.id==='string'&&m.id.length<=80){
    tell(channel,{kind:'pong',id:m.id});
   }else if(m.kind==='pong'&&m.id===lastPingId){
    const next=performance.now()-lastPingAt;
    if(Number.isFinite(next)&&next>=0){playerRtt.add(next);latencyMs=latencyMs===null?next:latencyMs*.7+next*.3;receivedPings++;updateLatency()}
   }else if(m.kind==='error')log(m.reason)
  }catch(e){
   const details='Messaggio giocatore non elaborato: '+(e.message??'errore');
   quickDiag(details);
   log(details);displayStatus('Errore sincronizzazione: '+(e.message??'errore'));
  }};
}
function completeHostJoin(id,name,c,conn,resumeKey=null){
 // Resume only after an explicit fresh GM approval. Never trust resumeKey
 // as authorization; it is just a lookup for the prior demo token.
 let assigned=id;
 if(typeof resumeKey==='string'&&/^[0-9a-f-]{36}$/.test(resumeKey)){
  const previous=Object.entries(hostState.members).find(([,m])=>m.resumeKey===resumeKey);
  if(previous)assigned=previous[0];
 }
 if(peers.has(assigned)){
  const previous=peers.get(assigned);
  endHostPing(assigned,previous);
  previous.channel.close();
 }
 const existing=hostState.tokens[assigned];
 hostState.members[assigned]={name,...(resumeKey?{resumeKey}:{})};
 if(!existing)hostState.tokens[assigned]={owner:assigned,x:20+peers.size*15,y:55};
 const peer={pc:conn,channel:c,timer:null,pendingPing:null,sentAt:0,rttMs:null,rttMeter:makeRttMeter(),route:'percorso non disponibile',syncTimer:null,syncAttempts:0,syncAcked:false};
 peers.set(assigned,peer);beginHostPing(assigned,peer);save();broadcast();awaitSnapshotAck(assigned);updateLatency();
 displayStatus('Giocatore '+name+' autorizzato e collegato');
 return assigned;
}
function updateQuickApprovals(){
 const target=$('quickApprovals');
 if(!target)return;
 target.replaceChildren();
 $('quickApprovalInfo').textContent=pendingPeerJs.size?
  'Giocatori in attesa: '+pendingPeerJs.size:
  'Nessun giocatore in attesa di autorizzazione';
 for(const request of pendingPeerJs.values()){
  const row=document.createElement('div');row.className='approval-entry';
  const name=document.createElement('span');name.textContent=request.name+' ('+request.id+')';
  const accept=document.createElement('button');accept.textContent='Autorizza';
  const reject=document.createElement('button');reject.textContent='Rifiuta';reject.className='secondary';
  accept.onclick=()=>{
   if(!pendingPeerJs.has(request.id))return;
   if(request.channel.readyState!=='open'){
    log('Il canale di '+request.name+' non è più aperto; richiesta da ripetere');
    pendingPeerJs.delete(request.id);updateQuickApprovals();return;
   }
   try{
    tell(request.channel,{kind:'approved'});
    const assigned=completeHostJoin(request.id,request.name,request.channel,request.conn,request.resumeKey);
    pendingPeerJs.delete(request.id);updateQuickApprovals();
    request.setAssignedId?.(assigned);
    log('Autorizzazione completata · stato iniziale inviato a '+request.name);
   }catch(error){
    const details='Errore sincronizzazione GM: '+error.message;
    log(details);displayStatus(details);
    tell(request.channel,{kind:'error',reason:'Il GM non è riuscito a sincronizzare la partita'});
   }
  };
  reject.onclick=()=>{
   if(!pendingPeerJs.has(request.id))return;
   pendingPeerJs.delete(request.id);updateQuickApprovals();
   tell(request.channel,{kind:'rejected'});
   request.channel.close();
   log('Ingresso rifiutato: '+request.name);
  };
  row.append(name,accept,reject);target.append(row);
 }
}

function bindHostChannel(c,id,conn,{requireApproval=false}={}){

   c.onmessage=event=>{try{
    const msg=JSON.parse(event.data);
    if(msg.kind==='ping'&&typeof msg.id==='string'&&msg.id.length<=80){
     tell(c,{kind:'pong',id:msg.id});
    }else if(msg.kind==='pong'){
     const peer=peers.get(id);
     if(peer?.pendingPing===msg.id){
      const elapsed=performance.now()-peer.sentAt;
      if(Number.isFinite(elapsed)&&elapsed>=0){
       peer.rttMeter?.add(elapsed);
       peer.rttMs=peer.rttMs===null?elapsed:peer.rttMs*.7+elapsed*.3;
       peer.pendingPing=null;updateLatency();
      }
     }
    }else if(msg.kind==='snapshot-ack'){
     const peer=peers.get(id);
     if(peer?.channel===c && Number.isInteger(msg.sequence)){
      peer.syncAcked=true;
      if(peer.syncTimer){clearInterval(peer.syncTimer);peer.syncTimer=null}
      log('Snapshot confermato da '+id+' · #'+msg.sequence);
     }
    }else if(msg.kind==='sync-request'){
     if(peers.get(id)?.channel===c){
      const sent=sendFreshSnapshot(id);
      log('Recupero stato richiesto da '+id+' · '+(sent?'snapshot inviato':'canale non disponibile'));
     }else{
      log('Richiesta stato ignorata: giocatore non approvato · '+id);
     }
    }else if(msg.kind==='join'){
     const name=validateName(msg.name);
     if(requireApproval){
      if(!pendingPeerJs.has(id)&&!peers.has(id)){
       if(pendingPeerJs.size>=12){tell(c,{kind:'rejected'});c.close();return}
       pendingPeerJs.set(id,{id,name,channel:c,conn,resumeKey:msg.resumeKey,setAssignedId:(assigned)=>{id=assigned}});
       updateQuickApprovals();
       tell(c,{kind:'waiting'});
       log('Richiesta di accesso da '+name+' · '+id);
       quickDiag('Giocatore '+name+' collegato via WebRTC · autorizzazione richiesta');
      }
     }else{
      completeHostJoin(id,name,c,conn);
     }
    }else if(msg.kind==='command'){
     if(!peers.has(id)||!applyCommand(id,msg.action))tell(c,{kind:'error',reason:'Comando non autorizzato'});
    }
   }catch{tell(c,{kind:'error',reason:'Comando non valido'})}};
   c.onclose=()=>{
    pendingPeerJs.delete(id);updateQuickApprovals();
    if(peers.get(id)?.channel===c)endHostPing(id,peers.get(id));
    displayStatus('Giocatore '+id+' disconnesso');
   };
}
async function inspectIceRoute(raw,onResult){
 try{
  const pc=raw.peerConnection;
  if(!pc||typeof pc.getStats!=='function')return;
  const report=await pc.getStats();
  onResult(classifySelectedPair(report));
 }catch(e){log('Statistiche WebRTC non disponibili: '+e.message)}
}
const peerJsAdapter=raw=>adaptPeerJsConnection(raw,{onError:error=>log('PeerJS canale: '+(error.message??error.type??'errore'))});

async function acceptRemoteOffer(offer, reply=null){
 if(!hostState)throw Error('Avvia prima la campagna');
 if(offer.type!=='offer'||typeof offer.sdp!=='string'||offer.sdp.length>100000)throw Error('Offerta non valida');
 const conn=pc('GM');const id='P-'+genId().slice(0,6);
 try{
  conn.ondatachannel=e=>bindHostChannel(e.channel,id,conn);
  await conn.setRemoteDescription(offer);const answer=await conn.createAnswer();await conn.setLocalDescription(answer);await gathered(conn);
  const result=JSON.stringify(conn.localDescription);
  if(reply)await reply(result);
  else { $('hostAnswer').value=result; displayStatus('Risposta pronta: inviala al giocatore') }
  return conn;
 }catch(e){conn.close();throw e}
}
$('acceptOffer').onclick=async()=>{
 try{await acceptRemoteOffer(JSON.parse($('remoteOffer').value))}
 catch(e){log('Errore risposta: '+e.message)}
};
async function applyRemoteAnswer(answer){
 if(applyingAnswer){log('Applicazione risposta già in corso');return}
 try{
  if(!playerPC)throw Error('Prima genera la richiesta');
  if(answer.type!=='answer'||typeof answer.sdp!=='string'||answer.sdp.length>100000)throw Error('Risposta non valida');
  const decision=assessAnswer(playerPC.signalingState,appliedAnswerSdp,answer.sdp);
  if(decision==='duplicate'){
   log('Questa risposta è già stata accettata; non serve ripeterla');
   return;
  }
  if(decision==='stale'){
   log('Risposta non applicabile: la sessione WebRTC è già stabile o chiusa. Per ripartire premi «Genera richiesta di collegamento» e scambia codici nuovi.');
   return;
  }
  applyingAnswer=true;$('applyAnswer').disabled=true;
  await playerPC.setRemoteDescription(answer);
  appliedAnswerSdp=answer.sdp;
  displayStatus('Risposta accettata · connessione ICE in corso (controlla il registro)');
 }catch(e){log('Errore collegamento: '+e.message)}
 finally{applyingAnswer=false;$('applyAnswer').disabled=false}
}
$('applyAnswer').onclick=()=>{try{applyRemoteAnswer(JSON.parse($('remoteAnswer').value))}catch(e){log('Risposta non valida: '+e.message)}};

function configuredHub(){
 const value=$('connectEndpoint').value.trim();
 if(!value)throw Error('Il servizio Hollowgate Connect non è ancora configurato. Usa lo scambio manuale.');
 return validateHubEndpoint(value);
}
function configureConnectPanel(){
 const ready=Boolean($('connectEndpoint').value.trim());
 $('connectHost').disabled=!ready;
 $('connectJoin').disabled=!ready;
 $('hubInfo').textContent=ready?
  'Modalità sperimentale: usa solo un endpoint HTTPS dedicato ai test, mai dati reali.':
  'Collegamento automatico non ancora disponibile su GitHub Pages: manca un servizio HTTPS pubblico.';
}
$('connectEndpoint').addEventListener('input',configureConnectPanel);
configureConnectPanel();
async function closeConnect(){
 if(pendingApprovalTimer!==null){clearInterval(pendingApprovalTimer);pendingApprovalTimer=null}
 $('pendingApprovals').replaceChildren();
 autoSession=false;
 if(connectClient){const old=connectClient;connectClient=null;await old.leave();}
 $('roomCode').textContent='—';
}
$('connectHost').onclick=async()=>{
 try{
  const endpoint=configuredHub();
  if(!hostState)$('startHost').click();
  await closeConnect();
  connectClient=createConnectClient({endpoint});
  const {room}=await connectClient.createRoom();
  autoSession=true;
  $('roomCode').textContent=room;
  displayStatus('Stanza '+room+' pronta: condividi soltanto questo codice');
  const active=connectClient;
  async function updatePending(){
   if(active!==connectClient)return;
   try{
    const requests=await active.pendingRequests();
    const list=$('pendingApprovals');list.replaceChildren();
    for(const request of requests){
     const item=document.createElement('div');item.className='approval-entry';
     const name=document.createElement('span');name.textContent=request.name+' chiede di partecipare';
     const yes=document.createElement('button');yes.textContent='Autorizza';
     const no=document.createElement('button');no.textContent='Rifiuta';no.className='secondary';
     yes.onclick=async()=>{try{await active.decide(request.peerId,true);await updatePending()}catch(e){log('Autorizzazione: '+e.message)}};
     no.onclick=async()=>{try{await active.decide(request.peerId,false);await updatePending()}catch(e){log('Rifiuto: '+e.message)}};
     item.append(name,yes,no);list.append(item);
    }
    $('pendingHint').textContent=requests.length?'Richieste in attesa: '+requests.length:'Nessuna richiesta di accesso in attesa';
   }catch(e){log('Richieste: '+e.message)}
  }
  await updatePending();pendingApprovalTimer=setInterval(()=>{void updatePending()},2000);
  void active.listen(async message=>{
   if(active!==connectClient)return;
   if(message.kind==='offer'&&message.from!=='host'){
    const offer=JSON.parse(message.description);
    await acceptRemoteOffer(offer,answer=>active.send(message.from,'answer',answer));
    log('Offerta di '+message.from+' accettata automaticamente');
   }
  },error=>log('Connect: '+error.message));
 }catch(e){log('Connect non disponibile: '+e.message);await closeConnect()}
};
$('connectJoin').onclick=async()=>{
 try{
  const endpoint=configuredHub();
  const room=$('joinRoomCode').value.trim().toUpperCase();
  if(!/^[A-Z2-9]{8}$/.test(room))throw Error('Codice stanza non valido');
  await closeConnect();
  connectClient=createConnectClient({endpoint});
  await connectClient.joinRoom(room,validateName($('playerName').value));
  autoSession=true;
  displayStatus('Richiesta inviata · attendo autorizzazione del GM');
  await connectClient.awaitApproval();
  displayStatus('Accesso autorizzato dal GM · preparo WebRTC');
  await $('createOffer').onclick();
  if(!playerPC?.localDescription)throw Error('Offerta non generata');
  await connectClient.send('host','offer',JSON.stringify(playerPC.localDescription));
  displayStatus('Offerta inviata automaticamente alla stanza '+room);
  const active=connectClient;
  void active.listen(async message=>{
   if(active!==connectClient)return;
   if(message.kind==='answer'&&message.from==='host'){
    await applyRemoteAnswer(JSON.parse(message.description));
    log('Risposta ricevuta tramite Connect');
   }
  },error=>log('Connect: '+error.message));
 }catch(e){log('Connect non disponibile: '+e.message);await closeConnect()}
};
$('connectDisconnect').onclick=async()=>{
 await closeConnect();
 displayStatus('Hollowgate Connect scollegato: le connessioni WebRTC esistenti non vengono interrotte');
};

// PeerJS Cloud is a shared third-party signaling broker for this **test**.
// It is NOT an authenticated Hollowgate Connect server.
const PEER_ID_PREFIX='hollowgate-lab-';
const ROOM_ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
let quickPeer=null,quickRole=null,quickRoom=null,quickConnection=null,quickRetryTimer=null,quickRetryAttempt=0,quickStopRequested=true,quickGeneration=0,quickResumeKey=null;
function newQuickCode(){
 return newRoomCode(crypto.getRandomValues(new Uint8Array(12)));
}
function stopQuickPeer(){
 stopSnapshotRecovery();
 quickStopRequested=true;
 quickGeneration++;
 if(quickRetryTimer!==null){clearTimeout(quickRetryTimer);quickRetryTimer=null}
 quickConnection=null;quickRole=null;quickRoom=null;quickRetryAttempt=0;quickResumeKey=null;quickRoute='percorso non disponibile';
 for(const request of pendingPeerJs.values())request.channel.close();
 pendingPeerJs.clear();updateQuickApprovals();
 if(quickPeer){quickPeer.destroy();quickPeer=null}
 $('quickCode').textContent='—';
 $('quickReconnect').textContent='Nessuna riconnessione in corso';
}
function openQuickPeer(identity){
 const Peer=window.Peer;
 if(typeof Peer!=='function')throw Error('La libreria PeerJS non è disponibile. Controlla connessione e blocchi CDN.');
 const peer=new Peer(identity,{
  host:'0.peerjs.com',port:443,path:'/',secure:true,
  config:stun,debug:1
 });
 return new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>{peer.destroy();reject(Error('Il servizio pubblico di segnalazione non risponde'))},14000);
  peer.on('open',()=>{clearTimeout(timeout);resolve(peer)});
  peer.on('error',err=>{clearTimeout(timeout);reject(Error(err?.message??'PeerJS: connessione fallita'))});
 });
}
function connectQuickPlayer(){
 if(quickStopRequested||quickRole!=='player'||!quickPeer||!quickRoom)return;
 if(quickPeer.disconnected){
  quickDiag('Segnalazione interrotta · attendo il ripristino della connessione PeerJS');
  try{quickPeer.reconnect()}catch(e){log('Riconnessione PeerJS: '+e.message)}
  scheduleQuickRetry();return;
 }
 const raw=quickPeer.connect(PEER_ID_PREFIX+quickRoom,{serialization:'json',reliable:true});
 quickDiag('Stanza '+quickRoom+' richiesta · negoziazione WebRTC in corso');
 log('PeerJS giocatore: richiesta canale verso stanza '+quickRoom);
 raw.on('error',error=>{
  if(quickStopRequested||quickConnection?.readyState==='open')return;
  const problem=connectionProblem(raw.peerConnection?.iceConnectionState,raw.peerConnection?.connectionState);
  const message=problem||explainPeerFailure(error);
  quickDiag(message);
  log('PeerJS giocatore: '+message);
 });
 const adapter=peerJsAdapter(raw);
 quickConnection=adapter;
 bindPlayerChannel(adapter);
 const connectionTimeout=setTimeout(()=>{
  if(quickConnection===adapter&&adapter.readyState!=='open'){
   log('Collegamento rapido: apertura scaduta, nuovo tentativo');
   const state=raw.peerConnection?.iceConnectionState??'non disponibile';
   const explanation=connectionProblem(state,raw.peerConnection?.connectionState);
   quickDiag(explanation||'Canale WebRTC non aperto (ICE: '+state+'). Verifica codice, Wi-Fi e rete ospiti.');
   raw.close();
   scheduleQuickRetry();
  }
 },12000);
 const onOpen=adapter.onopen, onClose=adapter.onclose;
 adapter.onopen=()=>{
  clearTimeout(connectionTimeout);
  if(quickStopRequested||quickConnection!==adapter){raw.close();return}
  quickRetryAttempt=0;
  if(quickRetryTimer!==null){clearTimeout(quickRetryTimer);quickRetryTimer=null}
  $('quickReconnect').textContent='Connessione ripristinata · autorizzazione del GM richiesta';
  quickDiag('WebRTC aperto · richiesta di accesso inviata al GM');
  onOpen?.();
  void inspectIceRoute(raw,route=>{if(quickConnection===adapter){quickRoute=route;updateLatency()}});
  setTimeout(()=>{if(quickConnection===adapter)void inspectIceRoute(raw,route=>{quickRoute=route;updateLatency()})},2500);
 };
 adapter.onclose=()=>{
  clearTimeout(connectionTimeout);
  if(quickConnection!==adapter)return;
  const ice=raw.peerConnection?.iceConnectionState??'non disponibile';
  const diagnostic=connectionProblem(ice,raw.peerConnection?.connectionState);
  if(diagnostic)quickDiag(diagnostic);
  log('PeerJS giocatore: canale chiuso · ICE '+ice);
  onClose?.();
  scheduleQuickRetry();
 };
 raw.on('iceStateChanged',state=>{
  if(quickConnection!==adapter||quickStopRequested)return;
  log('PeerJS giocatore: ICE '+state);
  const problem=connectionProblem(state,raw.peerConnection?.connectionState);
  if(problem)quickDiag(problem);
 });
}
function scheduleQuickRetry(){
 if(!canRetry({requested:!quickStopRequested&&quickRole==='player',connected:quickConnection?.readyState==='open',attempt:quickRetryAttempt+1}))return;
 if(quickRetryTimer!==null)return;
 const generation=quickGeneration;
 const delay=retryDelay(++quickRetryAttempt);
 $('quickReconnect').textContent='Riconnessione automatica: tentativo '+quickRetryAttempt+'/6';
 displayStatus('Connessione interrotta · nuovo tentativo tra '+delay/1000+' s');
 quickRetryTimer=setTimeout(()=>{
  quickRetryTimer=null;
  if(quickGeneration!==generation||quickStopRequested)return;
  try{
   if(quickPeer?.disconnected)quickPeer.reconnect();
   connectQuickPlayer();
  }catch(error){log('Riconnessione: '+error.message);scheduleQuickRetry()}
 },delay);
}

$('quickHost').onclick=async()=>{
 const button=$('quickHost');button.disabled=true;
 try{
  stopQuickPeer();
  selectMode('gm');
  $('hostSetup').hidden=true; // quick room does not use the manual SDP form
  if(!hostState)$('startHost').click();
  // A page reload does not guarantee the previous PeerJS reservation survived.
  // Always acquire a FRESH identity, and display only the one returned by PeerJS.
  let code=null,peer=null;
  for(let tries=0;tries<3;tries++){
   code=newQuickCode();
   try{peer=await openQuickPeer(PEER_ID_PREFIX+code);break}
   catch(e){
    log(explainPeerFailure(e));
    if(!/unavailable-id|taken|already|in use/i.test(e.type+' '+e.message)||tries===2)throw e;
   }
  }
  if(peer.id!==PEER_ID_PREFIX+code)throw Error('Il codice della stanza non corrisponde al PeerJS attivo');
  quickPeer=peer;quickRole='gm';quickRoom=code;quickStopRequested=false;
  quickDiag('Stanza demo attiva · in attesa delle richieste dei giocatori');
  log('Nuova stanza verificata sul server PeerJS · codice '+code);
  peer.on('disconnected',()=>{
   if(quickStopRequested||quickPeer!==peer)return;
   quickDiag('GM scollegato dal servizio di segnalazione: i nuovi ingressi non possono arrivare');
   displayStatus('Segnalazione GM disconnessa · tento di ripristinare la stanza');
   try{peer.reconnect()}catch(e){log('Riconnessione GM: '+e.message)}
  });
  peer.on('open',()=>{
   if(quickStopRequested||quickPeer!==peer)return;
   quickDiag('Stanza GM online sul server PeerJS · codice '+code);
   displayStatus('Stanza '+code+' disponibile per nuove richieste');
  });
  peer.on('error',error=>{
   if(quickStopRequested||quickPeer!==peer)return;
   const message=explainPeerFailure(error);
   quickDiag(message);displayStatus(message);
  });
  peer.on('connection',raw=>{
   const id='P-'+genId().slice(0,6);
   log('GM: richiesta di connessione PeerJS ricevuta da '+id+' · apertura WebRTC in corso');
   quickDiag('Richiesta PeerJS ricevuta · attendo apertura del canale WebRTC');
   raw.on('open',()=>{log('GM: canale WebRTC aperto per '+id);quickDiag('Canale WebRTC aperto · attendo richiesta di ingresso')});
   raw.on('error',error=>{log('GM: errore canale '+id+' · '+error.message);quickDiag('Errore apertura WebRTC: '+error.message)});
   raw.on('iceStateChanged',state=>{
    log('GM: ICE '+id+' '+state);
    const diagnostic=connectionProblem(state,raw.peerConnection?.connectionState);
    if(diagnostic)quickDiag(diagnostic);
   });
   const adapter=peerJsAdapter(raw);
   bindHostChannel(adapter,id,{close:()=>raw.close(),peerConnection:raw.peerConnection},{requireApproval:true});
   const checkRoute=()=>void inspectIceRoute(raw,route=>{
    const p=peers.get(id);
    if(p?.channel===adapter){p.route=route;updateLatency()}
   });
   raw.on('open',()=>setTimeout(checkRoute,1000));
   if(raw.open)setTimeout(checkRoute,1000);
  });
  $('quickCode').textContent=code;
  quickDiag('Stanza GM registrata · utilizza questo NUOVO codice dopo ogni ricaricamento');
  displayStatus('Stanza demo '+code+' attiva: comunica il codice al giocatore');
 }catch(e){stopQuickPeer();const message=explainPeerFailure(e);quickDiag(message);log(message)}
 finally{button.disabled=false}
};
$('quickJoin').onclick=async()=>{
 const button=$('quickJoin');button.disabled=true;
 try{
  const code=$('quickRoom').value.trim().toUpperCase();
  if(!/^[A-HJ-NP-Z2-9]{12}$/.test(code))throw Error('Inserisci il codice stanza di 12 caratteri dato dal GM');
  stopQuickPeer();stopPings();
  if(playerPC){playerPC.close();playerPC=null}
  selectMode('player');playerState=null;
  $('playerSetup').hidden=true; // hide lengthy manual offer/answer fields on mobile
  quickDiag('Collegamento rapido · in attesa del Game Master');
  const peer=await openQuickPeer();
  quickPeer=peer;
  quickRole='player';quickRoom=code;quickStopRequested=false;quickRetryAttempt=0;quickResumeKey=crypto.randomUUID();
  peer.on('error',error=>{
   if(quickStopRequested||quickPeer!==peer)return;
   const message=explainPeerFailure(error);
   quickDiag(message);displayStatus(message);
   if(error?.type==='peer-unavailable'){
    // Do not silently retry a room the broker says does not exist.
    if(quickRetryTimer!==null){clearTimeout(quickRetryTimer);quickRetryTimer=null}
    quickStopRequested=true;quickGeneration++;
    if(quickConnection)quickConnection.close();
   }
  });
  peer.on('disconnected',()=>{
   if(quickStopRequested||quickPeer!==peer)return;
   quickDiag('Il giocatore ha perso il collegamento col server PeerJS; nuovo tentativo');
   try{peer.reconnect()}catch(e){log('Ripristino segnalazione: '+e.message)}
   scheduleQuickRetry();
  });
  connectQuickPlayer();
  $('quickReconnect').textContent='Collegamento in corso';
  displayStatus('Collegamento rapido verso '+code+' in corso');
 }catch(e){stopQuickPeer();log('Collegamento rapido: '+e.message)}
 finally{button.disabled=false}
};
$('quickStop').onclick=()=>{
 stopQuickPeer();stopPings();
 displayStatus('Collegamento rapido terminato');
};

window.addEventListener('pagehide',()=>{stopQuickPeer();stopPings();void closeConnect();for(const [id,p] of peers){endHostPing(id,p);p.pc.close()}playerPC?.close()});
log('Prova browser pronta — scegli GM oppure giocatore');
