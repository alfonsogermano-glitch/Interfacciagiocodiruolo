import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {WebSocketServer} from 'ws';
import {createSession} from './session.mjs';
import {createStateStore} from './state-store.mjs';
import {isLocalGmOrigin} from './desktop/local-origin.mjs';
const appDir=path.dirname(fileURLToPath(import.meta.url));
const routes=new Map([['/','index.html'],['/client.js','client.js'],['/style.css','style.css']]);
export function createHostServer({host='127.0.0.1',port=4177,archiveFile=path.join(appDir,'data','campaign.json')}={}){
 if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Porta non valida');
 const root=path.join(appDir,'public');
 const store=createStateStore(archiveFile);
 const session=createSession({initialState:store.load(),onChange:store.save});
 const server=http.createServer((req,res)=>{
  const url=(req.url||'').split('?')[0],name=routes.get(url);
  if(req.method!=='GET'||!name){res.writeHead(404).end('Not found');return}
  const p=path.join(root,name);
  res.writeHead(200,{'Content-Type':name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'none'",'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
  fs.createReadStream(p).on('error',()=>res.destroy()).pipe(res);
 });
 const wss=new WebSocketServer({noServer:true,maxPayload:8192,perMessageDeflate:false});
 server.on('upgrade',(req,socket,head)=>{
  if(req.url!=='/ws'){socket.destroy();return}
  try{if(!req.headers.origin||new URL(req.headers.origin).host!==req.headers.host){socket.destroy();return}}catch{socket.destroy();return}
  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
 });
 wss.on('connection',(ws,req)=>{
  const local=isLocalGmOrigin(req.headers.host,req.headers.origin)&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  let count=0,start=Date.now();
  const timeout=setTimeout(()=>{if(!ws.hgRole)ws.close(1008,'Timeout autenticazione')},5000);
  ws.on('message',data=>{
   const now=Date.now();if(now-start>10000){start=now;count=0}
   if(++count>60){ws.close(1008,'Rate limit');return}
   let m;try{m=JSON.parse(data.toString('utf8'))}catch{ws.close(1007,'JSON non valido');return}
   if(!session.handle(ws,m,local))ws.close(1008,'Operazione non consentita');
   if(ws.hgRole)clearTimeout(timeout);
  });
  ws.on('close',()=>{clearTimeout(timeout);session.detach(ws)});
  ws.on('error',()=>{});
 });
 return {
  session,server,
  async listen(){
   await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,()=>{server.off('error',reject);resolve()})});
   return 'http://'+host+':'+port+'/#gm='+session.gmToken;
  },
  async close(){
   for(const client of wss.clients)client.terminate();
   await new Promise(resolve=>wss.close(resolve));
   await new Promise(resolve=>server.close(resolve));
  }
 };
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const port=Number(process.env.HOLLOWGATE_PORT||4177);
 const instance=createHostServer({port,archiveFile:process.env.HOLLOWGATE_DATA_FILE||undefined});
 instance.listen().then(url=>{
  console.log('HOLLOWGATE GM HOST — DEMO ISOLATA');
  console.log('GM: '+url);
  console.log('In un secondo terminale: cloudflared tunnel --url http://127.0.0.1:'+port);
  console.log('NON usare dati reali. Arresta con Ctrl+C.');
 }).catch(error=>{console.error(error.message);process.exitCode=1});
}
