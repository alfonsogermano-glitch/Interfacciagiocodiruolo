// Hollowgate Hybrid browser-to-browser experiment.
import { assessAnswer } from './answer-guard.mjs';
import { retryDelay,canRetry } from './reconnect-policy.mjs';
import { adaptPeerJsConnection } from './peerjs-adapter.mjs';
import { createConnectClient, validateHubEndpoint } from './connect-client.mjs';
// No Supabase, no production Auth, and no permanent server-side data.
// GM is the only authority. WebRTC data channels are DTLS encrypted.
// Manual signaling is intentionally temporary until Hollowgate Hub exists.
const $=id=>document.getElementById(id);
const STORAGE='hollowgate-hybrid-web-demo-v1';
const QUICK_SESSION='hollowgate-hybrid-quick-room-v1';
const stun={iceServers:[{urls:'stun:stun.l.google.com:19302'}]};
const peers=new Map();
const pendingPeerJs=new Map();
const SNAPSHOT_ACK_RETRIES=4;
let mode='gm',hostState=null,channel=null,playerPC=null,peerId=null,playerState=null,role='gm', applyingAnswer=false, appliedAnswerSdp=null;
let latencyTimer=null, lastPingId=null, lastPingAt=0, latencyMs=null, sentPings=0, receivedPings=0;
let connectClient=null, autoSession=false, pendingApprovalTimer=null;
const log=(text)=>{const line=document.createElement('div');line.textContent=new Date().toLocaleTimeString()+' · '+text;$('log').prepend(line)};
const copy=async(id)=>{try{await navigator.clipboard.writeText($(id).value);log('Testo copiato negli appunti')}catch{ $(id).select();log('Seleziona e copia con Ctrl+C')}}; 
$('copyHostAnswer').onclick=()=>copy('hostAnswer');$('copyPlayerOffer').onclick=()=>copy('playerOffer');
const genId=()=>crypto.randomUUID();
const defaultState=()=>({title:'Campagna demo',sequence:0,owner:'gm',members:{},tokens:{gm:{owner:'gm',x:20,y:20}},activity:[]});
const save=()=>{if(!hostState)return;localStorage.setItem(STORAGE,JSON.stringify(hostState))};
const displayStatus=text=>{$('status').textContent=text;log(text)};
const updateLatency=()=>{
 const meter=$('latencyMeter');
 if(!meter)return;
 if(mode==='gm'){
  const connected=[...peers.entries()].filter(([,peer])=>peer.channel?.readyState==='open');
  meter.textContent=connected.length===0?'Latenza: nessun giocatore collegato':
   connected.map(([id,peer])=>id+': '+(peer.rttMs===null?'misurazione in corso':Math.round(peer.rttMs)+' ms')).join(' · ');
 }else{
  meter.textContent=latencyMs===null?'Latenza: in attesa di misurazione':
   'Latenza: '+Math.round(latencyMs)+' ms · risposte '+receivedPings+'/'+sentPings;
 }

};
function stopPings(){
 if(latencyTimer!==null){clearInterval(latencyTimer);latencyTimer=null;}
 lastPingId=null;latencyMs=null;sentPings=0;receivedPings=0;updateLatency();
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
 tell(peer.channel,{kind:'snapshot',state:snapshot(id)});
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
 for(const [id,p] of peers)tell(p.channel,{kind:'snapshot',state:snapshot(id)});
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
function bindPlayerChannel(c){
  channel=c;
  channel.onopen=()=>{tell(channel,{kind:'join',name:validateName($('playerName').value),resumeKey:quickRole==='player'?quickResumeKey:null});startPings(channel);displayStatus('Connessione diretta aperta; attendo il GM')};
  channel.onclose=()=>{stopPings();displayStatus('Connessione con il GM chiusa')};
  channel.onmessage=e=>{try{
   const m=JSON.parse(e.data);
   if(m.kind==='snapshot'){
    if(!m.state||typeof m.state.sequence!=='number')throw Error('Snapshot non valido');
    playerState=m.state;
    render();
    tell(c,{kind:'snapshot-ack',sequence:playerState.sequence});
    displayStatus('Collegato al GM · stato #'+playerState.sequence);
   }
   else if(m.kind==='waiting')displayStatus('Connessione aperta: attendo autorizzazione del GM')
   else if(m.kind==='approved')displayStatus('Accesso autorizzato dal GM')
   else if(m.kind==='rejected')displayStatus('Richiesta di accesso rifiutata dal GM')
   else if(m.kind==='ping'&&typeof m.id==='string'&&m.id.length<=80){
    tell(channel,{kind:'pong',id:m.id});
   }else if(m.kind==='pong'&&m.id===lastPingId){
    const next=performance.now()-lastPingAt;
    if(Number.isFinite(next)&&next>=0){latencyMs=latencyMs===null?next:latencyMs*.7+next*.3;receivedPings++;updateLatency()}
   }else if(m.kind==='error')log(m.reason)
  }catch(e){log('Messaggio giocatore non elaborato: '+(e.message??'errore'))}};
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
 const peer={pc:conn,channel:c,timer:null,pendingPing:null,sentAt:0,rttMs:null,syncTimer:null,syncAttempts:0,syncAcked:false};
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
   tell(request.channel,{kind:'approved'});
   const assigned=completeHostJoin(request.id,request.name,request.channel,request.conn,request.resumeKey);
   pendingPeerJs.delete(request.id);updateQuickApprovals();
   request.setAssignedId?.(assigned);
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
     if(peers.get(id)?.channel===c)sendFreshSnapshot(id);
    }else if(msg.kind==='join'){
     const name=validateName(msg.name);
     if(requireApproval){
      if(!pendingPeerJs.has(id)&&!peers.has(id)){
       if(pendingPeerJs.size>=12){tell(c,{kind:'rejected'});c.close();return}
       pendingPeerJs.set(id,{id,name,channel:c,conn,resumeKey:msg.resumeKey,setAssignedId:(assigned)=>{id=assigned}});
       updateQuickApprovals();
       tell(c,{kind:'waiting'});
       log('Richiesta di accesso da '+name+' · '+id);
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
 const bytes=crypto.getRandomValues(new Uint8Array(12));
 return Array.from(bytes,value=>ROOM_ALPHABET[value%ROOM_ALPHABET.length]).join('');
}
function stopQuickPeer(){
 quickStopRequested=true;
 quickGeneration++;
 if(quickRetryTimer!==null){clearTimeout(quickRetryTimer);quickRetryTimer=null}
 quickConnection=null;quickRole=null;quickRoom=null;quickRetryAttempt=0;quickResumeKey=null;
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
 const raw=quickPeer.connect(PEER_ID_PREFIX+quickRoom,{serialization:'json',reliable:true});
 const adapter=peerJsAdapter(raw);
 quickConnection=adapter;
 bindPlayerChannel(adapter);
 const connectionTimeout=setTimeout(()=>{
  if(quickConnection===adapter&&adapter.readyState!=='open'){
   log('Collegamento rapido: apertura scaduta, nuovo tentativo');
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
  onOpen?.();
 };
 adapter.onclose=()=>{
  clearTimeout(connectionTimeout);
  if(quickConnection!==adapter)return;
  onClose?.();
  scheduleQuickRetry();
 };
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
  if(!hostState)$('startHost').click();
  let code;
  try{code=sessionStorage.getItem(QUICK_SESSION)}catch{}
  if(!code||!/^[A-HJ-NP-Z2-9]{12}$/.test(code))code=newQuickCode();
  let peer;
  try{peer=await openQuickPeer(PEER_ID_PREFIX+code)}
  catch(e){
   // Another tab or old host may still own this ID. Never steal it.
   if(code && /taken|unavailable|already/i.test(e.message)){
    code=newQuickCode();peer=await openQuickPeer(PEER_ID_PREFIX+code);
   }else throw e;
  }
  quickPeer=peer;quickRole='gm';quickRoom=code;quickStopRequested=false;
  try{sessionStorage.setItem(QUICK_SESSION,code)}catch{}
  peer.on('disconnected',()=>{
   if(quickStopRequested||quickPeer!==peer)return;
   displayStatus('Segnalazione GM disconnessa · tento di ripristinare la stanza');
   try{peer.reconnect()}catch(e){log('Riconnessione GM: '+e.message)}
  });
  peer.on('connection',raw=>{
   const id='P-'+genId().slice(0,6);
   bindHostChannel(peerJsAdapter(raw),id,{close:()=>raw.close()},{requireApproval:true});
  });
  $('quickCode').textContent=code;
  displayStatus('Stanza demo '+code+' attiva: comunica il codice al giocatore');
 }catch(e){stopQuickPeer();log('Collegamento rapido: '+e.message)}
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
  const peer=await openQuickPeer();
  quickPeer=peer;
  quickRole='player';quickRoom=code;quickStopRequested=false;quickRetryAttempt=0;quickResumeKey=crypto.randomUUID();
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
