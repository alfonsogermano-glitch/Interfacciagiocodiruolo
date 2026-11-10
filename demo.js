// Hollowgate Hybrid browser-to-browser experiment.
import { assessAnswer } from './answer-guard.mjs';
// No Supabase, no production Auth, and no permanent server-side data.
// GM is the only authority. WebRTC data channels are DTLS encrypted.
// Manual signaling is intentionally temporary until Hollowgate Hub exists.
const $=id=>document.getElementById(id);
const STORAGE='hollowgate-hybrid-web-demo-v1';
const stun={iceServers:[{urls:'stun:stun.l.google.com:19302'}]};
const peers=new Map();
let mode='gm',hostState=null,channel=null,playerPC=null,peerId=null,playerState=null,role='gm', applyingAnswer=false, appliedAnswerSdp=null;
let latencyTimer=null, lastPingId=null, lastPingAt=0, latencyMs=null, sentPings=0, receivedPings=0;
const log=(text)=>{const line=document.createElement('div');line.textContent=new Date().toLocaleTimeString()+' · '+text;$('log').prepend(line)};
const copy=async(id)=>{try{await navigator.clipboard.writeText($(id).value);log('Testo copiato negli appunti')}catch{ $(id).select();log('Seleziona e copia con Ctrl+C')}}; 
$('copyHostAnswer').onclick=()=>copy('hostAnswer');$('copyPlayerOffer').onclick=()=>copy('playerOffer');
const genId=()=>crypto.randomUUID();
const defaultState=()=>({title:'Campagna demo',sequence:0,owner:'gm',members:{},tokens:{gm:{owner:'gm',x:20,y:20}},activity:[]});
const save=()=>{if(!hostState)return;localStorage.setItem(STORAGE,JSON.stringify(hostState))};
const displayStatus=text=>{$('status').textContent=text;log(text)};
const updateLatency=()=>{
 const meter=$('latencyMeter');
 if(meter)meter.textContent=latencyMs===null?'Latenza: in attesa di misurazione':
   'Latenza: '+Math.round(latencyMs)+' ms · risposte '+receivedPings+'/'+sentPings;
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
 mode=next;$('hostMode').classList.toggle('selected',next==='gm');$('playerMode').classList.toggle('selected',next==='player');
 $('hostSetup').hidden=next!=='gm';$('playerSetup').hidden=next!=='player';$('session').hidden=true;
}
$('hostMode').onclick=()=>selectMode('gm');$('playerMode').onclick=()=>selectMode('player');
$('startHost').onclick=()=>{
 if(!hostState){try{const x=JSON.parse(localStorage.getItem(STORAGE));hostState=x&&x.tokens&&Array.isArray(x.activity)?x:defaultState()}catch{hostState=defaultState()}}
 save();role='gm';peerId='gm';$('hostSignal').hidden=false;$('session').hidden=false;displayStatus('GM Host attivo, in attesa di giocatori');render();
};
$('resetHost').onclick=()=>{
 if(!confirm('Cancellare esclusivamente la campagna dimostrativa salvata in questo browser?'))return;
 localStorage.removeItem(STORAGE);hostState=defaultState();save();for(const p of peers.values())p.channel.close();peers.clear();displayStatus('Campagna di prova azzerata');render();
};
const validateName=s=>typeof s==='string'&&s.trim().length>0&&s.length<=32?s.trim():'Giocatore';
const visibleTo=(activity,receiver)=>activity.filter(e=>e.visibility!=='gm'||receiver==='gm');
function snapshot(receiver){
 const state=hostState;
 return {title:state.title,sequence:state.sequence,role:receiver==='gm'?'gm':'player',self:receiver,
 tokens:state.tokens,activity:visibleTo(state.activity,receiver)};
}
const tell=(p,body)=>{if(p?.readyState==='open')p.send(JSON.stringify(body))};
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
  playerPC=pc('Giocatore');channel=playerPC.createDataChannel('hollowgate',{ordered:true});
  channel.onopen=()=>{tell(channel,{kind:'join',name:validateName($('playerName').value)});startPings(channel);displayStatus('Connessione diretta aperta; attendo il GM')};
  channel.onclose=()=>{stopPings();displayStatus('Connessione con il GM chiusa')};
  channel.onmessage=e=>{try{
   const m=JSON.parse(e.data);
   if(m.kind==='snapshot'){playerState=m.state;render();displayStatus('Collegato al GM · stato #'+playerState.sequence)}
   else if(m.kind==='pong'&&m.id===lastPingId){
    const next=performance.now()-lastPingAt;
    if(Number.isFinite(next)&&next>=0){latencyMs=latencyMs===null?next:latencyMs*.7+next*.3;receivedPings++;updateLatency()}
   }else if(m.kind==='error')log(m.reason)
  }catch{log('Messaggio non valido')}};
  const offer=await playerPC.createOffer();await playerPC.setLocalDescription(offer);await gathered(playerPC);
  $('playerOffer').value=JSON.stringify(playerPC.localDescription);
  displayStatus('Offerta pronta: copiala al GM');
 }catch(e){log('Errore offerta: '+e.message)}
};
$('acceptOffer').onclick=async()=>{
 if(!hostState){log('Avvia prima la campagna');return}
 try{
  const offer=JSON.parse($('remoteOffer').value);
  if(offer.type!=='offer'||typeof offer.sdp!=='string'||offer.sdp.length>100000)throw Error('Offerta non valida');
  const conn=pc('GM');const id='P-'+genId().slice(0,6);
  conn.ondatachannel=e=>{
   const c=e.channel;
   c.onmessage=event=>{try{
    const msg=JSON.parse(event.data);
    if(msg.kind==='ping'&&typeof msg.id==='string'&&msg.id.length<=80){
     tell(c,{kind:'pong',id:msg.id});
    }else if(msg.kind==='join'){
     hostState.members[id]={name:validateName(msg.name)};
     hostState.tokens[id]={owner:id,x:20+peers.size*15,y:55};
     peers.set(id,{pc:conn,channel:c});save();broadcast();displayStatus('Giocatore '+id+' collegato');
    }else if(msg.kind==='command'){
     if(!peers.has(id)||!applyCommand(id,msg.action))tell(c,{kind:'error',reason:'Comando non autorizzato'});
    }
   }catch{tell(c,{kind:'error',reason:'Comando non valido'})}};
   c.onclose=()=>{peers.delete(id);displayStatus('Giocatore '+id+' disconnesso')};
  };
  await conn.setRemoteDescription(offer);const answer=await conn.createAnswer();await conn.setLocalDescription(answer);await gathered(conn);
  $('hostAnswer').value=JSON.stringify(conn.localDescription);
  displayStatus('Risposta pronta: inviala al giocatore');
 }catch(e){log('Errore risposta: '+e.message)}
};
$('applyAnswer').onclick=async()=>{
 if(applyingAnswer){log('Applicazione risposta già in corso');return}
 let answer;
 try{
  if(!playerPC)throw Error('Prima genera la richiesta');
  answer=JSON.parse($('remoteAnswer').value);
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
};
window.addEventListener('pagehide',()=>{stopPings();for(const p of peers.values())p.pc.close();playerPC?.close()});
log('Prova browser pronta — scegli GM oppure giocatore');
