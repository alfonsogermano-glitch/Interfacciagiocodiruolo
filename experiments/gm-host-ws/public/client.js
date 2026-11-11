const $=id=>document.getElementById(id);
// Keep role credentials only within this browser tab; not in URLs or persistent storage.
// A bare tunnel URL intentionally has no role and cannot join a private session.
const params=new URLSearchParams(location.hash.slice(1));
const freshGm=params.get('gm'),freshPlayer=params.get('join');
if(freshGm||freshPlayer){
 sessionStorage.removeItem('hg-demo-gm');sessionStorage.removeItem('hg-demo-player');
 if(freshGm)sessionStorage.setItem('hg-demo-gm',freshGm);
 else sessionStorage.setItem('hg-demo-player',freshPlayer);
}
const gmToken=sessionStorage.getItem('hg-demo-gm'),playerToken=sessionStorage.getItem('hg-demo-player');
if(location.hash)history.replaceState(null,'',location.pathname+location.search);
const role=gmToken?'gm':playerToken?'player':null;
let socket=null,selfId=null,state=null,pingAt=0,inviteToken=null;
const reconnect=$('reconnect');reconnect.onclick=connect;
$('gmPanel').hidden=role!=='gm';$('playerPanel').hidden=role!=='player';
const status=msg=>$('status').textContent=msg;
const log=msg=>$('log').textContent=new Date().toLocaleTimeString()+' '+msg+'\n'+$('log').textContent.slice(0,5000);
const send=m=>{if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(m))};
function render(){
 if(!state)return;const board=$('board');board.replaceChildren();
 for(const [id,pos] of Object.entries(state.tokens)){
  const el=document.createElement('div');el.className='token';el.textContent=id==='gm'?'GM':'P';el.style.left=pos.x+'%';el.style.top=pos.y+'%';board.append(el);
 }
 $('events').replaceChildren(...state.events.slice(-20).reverse().map(e=>{const li=document.createElement('li');li.textContent=e.name+': '+e.text;return li}));
}
function connect(){
 if(!role){status('Apri il link GM stampato dal server o un invito giocatore');return}
 if(socket&&[WebSocket.OPEN,WebSocket.CONNECTING].includes(socket.readyState))return;
 selfId=null;reconnect.hidden=true;status('Connessione in corso…');
 socket=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws');
 const current=socket;
 socket.addEventListener('open',()=>{send({type:'hello',role,token:role==='gm'?gmToken:playerToken,name:$('playerName').value});status('Autenticazione…')});
 socket.addEventListener('message',ev=>{
  let m;try{m=JSON.parse(ev.data)}catch{return}
  if(m.type==='joined'){reconnect.hidden=true;if(m.role==='gm'&&typeof m.playerToken==='string')inviteToken=m.playerToken;selfId=m.id||'gm';status('Collegato come '+role);log('Sessione aperta')}
  if(m.type==='state'){state=m.state;render()}
  if(m.type==='notice'||m.type==='error')status(m.text);
  if(m.type==='pong')$('latency').textContent='Latenza WebSocket: '+Math.round(performance.now()-pingAt)+' ms';
 });
 socket.addEventListener('close',event=>{if(socket!==current)return;selfId=null;reconnect.hidden=false;status('Connessione chiusa (codice '+event.code+'). Premi Riconnetti.');log('Connessione chiusa · codice '+event.code)});
 socket.addEventListener('error',()=>status('Errore WebSocket'));
}
if(role==='gm')connect();
else if(!role){status('Manca il link di accesso. Sul PC usa l’indirizzo completo #gm=... mostrato in AVVIA_HOST; su Android apri il link #join=... creato dal GM.');$('left').disabled=true;$('right').disabled=true;$('roll').disabled=true;}
$('connectPlayer').onclick=connect;
$('createLink').onclick=()=>{
 let url;try{url=new URL($('publicUrl').value.trim());if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error()}catch{status('Inserisci URL HTTPS del tunnel');return}
 if(!inviteToken){status('Non sei ancora autenticato come GM');return}
 url.hash='join='+encodeURIComponent(inviteToken);
 $('invite').value=url.href;
};
if(role==='gm'&&window.hollowgateDesktop){
 const applyTunnel=url=>{
  if(!url){$('publicUrl').value='';$('invite').value='';status('Tunnel esterno non disponibile; la partita locale resta attiva.');return}
  $('publicUrl').value=url;
  if(window.__playerToken){$('createLink').click();status('Invito giocatore pronto.')}
 };
 window.hollowgateDesktop.onTunnelUrl(applyTunnel);
 void window.hollowgateDesktop.getTunnelUrl().then(applyTunnel).catch(()=>{});
 const observer=new MutationObserver(()=>{
  if(window.__playerToken&&$('publicUrl').value&&!$('invite').value){$('createLink').click();observer.disconnect()}
 });
 observer.observe($('status'),{childList:true,subtree:true});
}
$('copyInvite').onclick=async()=>{try{await navigator.clipboard.writeText($('invite').value);status('Link copiato')}catch{status('Copia il link dal campo')}};
function move(delta){if(socket?.readyState!==WebSocket.OPEN||!selfId||!state?.tokens[selfId]){status('Sessione scollegata: premi Riconnetti');return;}const t=state.tokens[selfId];send({type:'move',id:role==='gm'?'gm':undefined,x:Math.max(0,Math.min(100,t.x+delta)),y:t.y})}
$('left').onclick=()=>move(-5);$('right').onclick=()=>move(5);$('roll').onclick=()=>send({type:'roll',sides:20});
setInterval(()=>{if(socket?.readyState===WebSocket.OPEN){pingAt=performance.now();send({type:'ping'})}},3000);
