import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';

const random = (size = 20) => randomBytes(size).toString('base64url');
const allowedKinds = new Set(['offer','answer','candidate']);
const MAX_BODY = 125000;
const ROOM_IDLE_MS = 30 * 60_000;
const MAX_MAILBOX = 24;
const MAX_PEERS = 12;
const MAX_ROOMS = 128;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 240;

/**
 * Minimal *ephemeral signaling only* proof of concept.
 * Does not forward game commands, store campaigns or authenticate real users.
 * All identities are demo capabilities. Never deploy to untrusted public
 * networks without real account auth, rate limiting, TLS, monitoring and abuse controls.
 */
export function createSignalingHub({ hostname = '127.0.0.1', port = 0, now = () => Date.now(), allowedOrigins = [] } = {}) {
  if (hostname !== '127.0.0.1') throw new Error('Prototype must stay on loopback');
  const rooms = new Map();
  const buckets = new Map();
  const origins = new Set(allowedOrigins);
  for(const origin of origins) {
    const url = new URL(origin);
    if(url.origin !== origin || (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1')) throw Error('Invalid allowed origin');
  }
  const send = (res,status,data) => {
    res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
    res.end(JSON.stringify(data));
  };
  const clean = () => {
    for(const [ip,bucket] of buckets)if(now()-bucket.start>=WINDOW_MS)buckets.delete(ip);
    for (const [code,room] of rooms) if (now() - room.activity > ROOM_IDLE_MS) rooms.delete(code);
  };
  const parseBody = async req => {
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] ?? '')) throw Error('JSON required');
    const parts=[];let size=0;
    for await (const part of req) {
      size+=part.length;
      if(size>MAX_BODY)throw Error('Payload too large');
      parts.push(part);
    }
    const body=Buffer.concat(parts).toString('utf8');
    const value = JSON.parse(body);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid payload');
    return value;
  };
  const roomFrom = (req,body) => {
    const code=body.room;
    if (typeof code !== 'string' || !/^[A-Z2-9]{8}$/.test(code)) return null;
    const room=rooms.get(code);
    if (!room) return null;
    const token=/^Bearer ([A-Za-z0-9_-]{20,})$/.exec(req.headers.authorization??'')?.[1];
    const actor=room.tokens.get(token);
    if (!actor) return null;
    room.activity=now();
    return {room,actor};
  };
  const server=createServer(async(req,res)=>{
    clean();
    const ip=req.socket.remoteAddress??'unknown';
    const bucket=buckets.get(ip);
    if(!bucket || now()-bucket.start>=WINDOW_MS)buckets.set(ip,{start:now(),count:1});
    else if(++bucket.count>MAX_REQUESTS_PER_WINDOW){send(res,429,{error:'Rate limit exceeded'});return;}
    const origin=req.headers.origin;
    if(origin){
      if(!origins.has(origin)){send(res,403,{error:'Origin not permitted'});return;}
      res.setHeader('access-control-allow-origin',origin);
      res.setHeader('vary','Origin');
      res.setHeader('access-control-allow-methods','POST, OPTIONS');
      res.setHeader('access-control-allow-headers','Content-Type, Authorization');
    }
    if(req.method==='OPTIONS' && origin && origins.has(origin)){
      res.writeHead(204,{'cache-control':'no-store'});res.end();return;
    }
    // Loopback-only test server; allowlist is strict and never uses wildcard CORS.
    const url=new URL(req.url??'/', 'http://127.0.0.1');
    if (req.method !== 'POST' || !['/v1/create','/v1/join','/v1/send','/v1/poll','/v1/leave'].includes(url.pathname)) {
      send(res,404,{error:'Unknown endpoint'});return;
    }
    if (url.search) { send(res,400,{error:'No query parameters'});return; }
    let body;
    try { body=await parseBody(req); }
    catch(e){send(res,400,{error:e.message});return;}
    if(url.pathname==='/v1/create'){
      if(rooms.size>=MAX_ROOMS){send(res,429,{error:'Room capacity reached'});return;}
      if (Object.keys(body).length!==0){send(res,400,{error:'Unexpected fields'});return;}
      let code;
      do {code=Array.from(randomBytes(8), byte => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[byte % 32]).join('')}while(code.length!==8||rooms.has(code));
      const token=random(),room={code,activity:now(),tokens:new Map([[token,'host']]),peers:new Set(['host']),queues:new Map([['host',[]]]),seq:0};
      rooms.set(code,room);
      send(res,201,{room:code,token,role:'host',peerId:'host',expiresAfterIdleMs:ROOM_IDLE_MS});return;
    }
    if(url.pathname==='/v1/join'){
      if(typeof body.room!=='string'||Object.keys(body).length!==1){send(res,400,{error:'Invalid room'});return;}
      const room=rooms.get(body.room);
      if(!room){send(res,404,{error:'Room unavailable'});return;}
      if(room.peers.size>=MAX_PEERS){send(res,429,{error:'Room full'});return;}
      const peerId=random(10),token=random();
      room.tokens.set(token,peerId);room.peers.add(peerId);room.queues.set(peerId,[]);room.activity=now();
      send(res,200,{room:room.code,token,peerId,role:'player'});return;
    }
    const found=roomFrom(req,body);
    if(!found){send(res,403,{error:'Forbidden'});return;}
    const {room,actor}=found;
    if(url.pathname==='/v1/poll'){
      const after=body.after;
      if(!Number.isSafeInteger(after)||after<0||after>room.seq){send(res,400,{error:'Invalid cursor'});return;}
      // The cursor is receiver-specific. Erase acknowledged messages immediately.
      const inbox=room.queues.get(actor);
      while(inbox.length && inbox[0].id<=after)inbox.shift();
      const msgs=inbox.slice();
      send(res,200,{messages:msgs,cursor:room.seq});return;
    }
    if(url.pathname==='/v1/leave'){
      if(actor==='host'){rooms.delete(room.code);send(res,200,{closed:true});return;}
      room.peers.delete(actor);room.queues.delete(actor);
      for(const [token,id] of room.tokens)if(id===actor)room.tokens.delete(token);
      send(res,200,{closed:true});return;
    }
    const {kind,to,description}=body;
    if(!allowedKinds.has(kind)||typeof to!=='string'||!room.peers.has(to)||to===actor||
      typeof description!=='string'||description.length<1||description.length>110000||
      (actor!=='host' && to!=='host') || (actor==='host' && to==='host')||
      (kind==='offer'&&actor==='host')||(kind==='answer'&&actor!=='host')){
      send(res,400,{error:'Invalid signal'});return;
    }
    const inbox=room.queues.get(to);
    if(inbox.length>=MAX_MAILBOX) inbox.shift();
    inbox.push({id:++room.seq,from:actor,kind,description});
    send(res,200,{accepted:true});return;
  });
  return {
    async start(){
      await new Promise((resolve,reject)=>{
        server.once('error',reject);
        server.listen(port,hostname,resolve);
      });
      return 'http://127.0.0.1:'+server.address().port;
    },
    async close(){ await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve())); },
    get activeRooms(){clean();return rooms.size;},
  };
}
