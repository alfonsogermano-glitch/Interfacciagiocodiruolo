import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {WebSocketServer} from 'ws';
import {createSession} from './session.mjs';
import {createStateStore} from './state-store.mjs';
const host='127.0.0.1',port=Number(process.env.HOLLOWGATE_PORT||4177);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Porta non valida');
const appDir=path.dirname(fileURLToPath(import.meta.url));
const root=path.join(appDir,'public');
// Only demo map position and dice events are saved, never role tokens or live player IDs.
const campaignFile=process.env.HOLLOWGATE_DATA_FILE||path.join(appDir,'data','campaign.json');
const store=createStateStore(campaignFile);
const session=createSession({initialState:store.load(),onChange:store.save});
const routes=new Map([['/','index.html'],['/client.js','client.js'],['/style.css','style.css']]);
const server=http.createServer((req,res)=>{
 const url=(req.url||'').split('?')[0],name=routes.get(url);
 if(req.method!=='GET'||!name){res.writeHead(404).end('Not found');return}
 const p=path.join(root,name);
 res.writeHead(200,{'Content-Type':name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'none'",'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
 fs.createReadStream(p).pipe(res);
});
const wss=new WebSocketServer({noServer:true,maxPayload:8192,perMessageDeflate:false});
server.on('upgrade',(req,socket,head)=>{
 if(req.url!=='/ws'){socket.destroy();return}
 try{if(!req.headers.origin||new URL(req.headers.origin).host!==req.headers.host){socket.destroy();return}}catch{socket.destroy();return}
 wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
});
wss.on('connection',(ws,req)=>{
 const a=req.socket.remoteAddress,local=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(a);
 let count=0,start=Date.now();
 const timeout=setTimeout(()=>{if(!ws.hgRole)ws.close(1008,'Timeout autenticazione')},5000);
 ws.on('message',data=>{
  const now=Date.now();if(now-start>10000){start=now;count=0}if(++count>60){ws.close(1008,'Rate limit');return}
  let m;try{m=JSON.parse(data.toString('utf8'))}catch{ws.close(1007,'JSON non valido');return}
  if(!session.handle(ws,m,local))ws.close(1008,'Operazione non consentita');
  if(ws.hgRole)clearTimeout(timeout);
 });
 ws.on('close',()=>{clearTimeout(timeout);session.detach(ws)});
 ws.on('error',()=>{});
});
server.listen(port,host,()=>{
 console.log('HOLLOWGATE GM HOST — DEMO ISOLATA');
 console.log('GM: http://localhost:'+port+'/#gm='+session.gmToken);
 console.log('In un secondo terminale: cloudflared tunnel --url http://localhost:'+port);
 console.log('Salvataggio locale demo: '+campaignFile);
 console.log('NON usare dati reali. Arresta con Ctrl+C.');
});
