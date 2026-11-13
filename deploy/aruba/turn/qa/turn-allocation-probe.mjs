// CI-only RFC 5766 TURN Allocate handshake against an isolated Docker bridge.
// Produces credentials through the real Aruba service, never via fixtures.
// Do not log shared secrets, TURN passwords, nonce values or raw STUN packets.
import assert from 'node:assert/strict';
import {createSocket} from 'node:dgram';
import {readFile} from 'node:fs/promises';
import {randomBytes,createHash,createHmac} from 'node:crypto';
import {parseTurnSharedSecret,createTurnCredentialService} from '../../../../apps/aruba-api/src/turn-credential-service.mjs';

const MAGIC=0x2112a442;
const ALLOCATE=0x0003;
const SUCCESS=0x0103;
const ERROR=0x0113;
const ATTR={
 username:0x0006,integrity:0x0008,error:0x0009,lifetime:0x000d,
 relayed:0x0016,transport:0x0019,realm:0x0014,nonce:0x0015,
};
const ID='00000000-0000-4000-8000-000000000002';
const CAMPAIGN='00000000-0000-4000-8000-000000000001';
const host=process.env.TURN_TEST_HOST;
const port=Number(process.env.TURN_TEST_PORT??3478);
if(typeof host!=='string'||!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)||
 !Number.isSafeInteger(port)||port<1||port>65535)
 throw new Error('Isolated TURN endpoint must be a literal IPv4 and valid port');
const secret= parseTurnSharedSecret(await readFile(process.env.TURN_TEST_SECRET_FILE));
const identity={async verify({sessionToken,campaignId,connectionRole}){
 if(sessionToken!=='ci-cookie'||campaignId!==CAMPAIGN||connectionRole!=='player')
  throw new Error('Membership rejected');
 return {userId:ID,campaignId:CAMPAIGN,role:'player'};
}};
const creds=await createTurnCredentialService({
 identity,sharedSecret:secret,urls:['turn:turn.example.invalid:3478?transport=udp'],
 ttlSeconds:300,
}).issue({sessionToken:'ci-cookie',campaignId:CAMPAIGN,connectionRole:'player'});
assert.ok(creds.expiresAt>Math.floor(Date.now()/1000)+60);

const attr=(type,data)=>{
 const pad=(4-data.length%4)%4;
 const b=Buffer.alloc(4+data.length+pad);
 b.writeUInt16BE(type,0);b.writeUInt16BE(data.length,2);data.copy(b,4);
 return b;
};
const utf=(type,value)=>attr(type,Buffer.from(value,'utf8'));
const transport=()=>attr(ATTR.transport,Buffer.from([17,0,0,0]));
function packet(type,attrs,transaction=randomBytes(12),key=null){
 const parts=[...attrs];
 if(key){
  // MESSAGE-INTEGRITY is the final attribute. The STUN header length
  // includes its 24 bytes; the HMAC input excludes that attribute.
  const header=Buffer.alloc(20);
  header.writeUInt16BE(type,0);
  header.writeUInt16BE(parts.reduce((n,b)=>n+b.length,0)+24,2);
  header.writeUInt32BE(MAGIC,4);transaction.copy(header,8);
  const digest=createHmac('sha1',key).update(Buffer.concat([header,...parts])).digest();
  parts.push(attr(ATTR.integrity,digest));
 }
 const result=Buffer.alloc(20);
 result.writeUInt16BE(type,0);
 result.writeUInt16BE(parts.reduce((n,b)=>n+b.length,0),2);
 result.writeUInt32BE(MAGIC,4);transaction.copy(result,8);
 return {bytes:Buffer.concat([result,...parts]),transaction};
}
function decode(buf,expectedId){
 assert.ok(buf.length>=20,'Short STUN response');
 assert.equal(buf.readUInt32BE(4),MAGIC,'Wrong STUN magic');
 assert.ok(buf.subarray(8,20).equals(expectedId),'Wrong STUN transaction');
 const end=20+buf.readUInt16BE(2);
 assert.ok(end<=buf.length,'Truncated STUN attributes');
 const fields=new Map();
 for(let at=20;at<end;){
  assert.ok(at+4<=end,'Truncated STUN attribute header');
  const type=buf.readUInt16BE(at),length=buf.readUInt16BE(at+2);
  assert.ok(at+4+length<=end,'Truncated STUN attribute body');
  fields.set(type,buf.subarray(at+4,at+4+length));
  at+=4+Math.ceil(length/4)*4;
 }
 return {type:buf.readUInt16BE(0),fields};
}
const failureCode=fields=>{
 const field=fields.get(ATTR.error);
 assert.ok(field&&field.length>=4,'Missing STUN ERROR-CODE');
 return (field[2]&7)*100+field[3];
};
const socket=createSocket('udp4');
await new Promise((resolve,reject)=>{
 socket.once('error',reject);
 socket.bind(0,'0.0.0.0',()=>{socket.off('error',reject);resolve();});
});
async function request(message){
 for(let attempt=0;attempt<3;attempt++){
  const response=new Promise((resolve,reject)=>{
   let timeout;
   const receive=raw=>{
    if(raw.length<20||!raw.subarray(8,20).equals(message.transaction))return;
    cleanup();resolve(raw);
   };
   const error=e=>{cleanup();reject(e);};
   const cleanup=()=>{clearTimeout(timeout);socket.off('message',receive);socket.off('error',error);};
   socket.on('message',receive);
   socket.on('error',error);
   timeout=setTimeout(()=>{cleanup();resolve(null);},1200);
   socket.send(message.bytes,port,host,error=>{if(error){cleanup();reject(error);}});
  });
  const result=await response;
  if(result)return decode(result,message.transaction);
 }
 throw new Error('TURN Allocate did not respond in isolated Docker network');
}
try{
 const challenge=await request(packet(ALLOCATE,[transport()]));
 assert.equal(challenge.type,ERROR,'Allocate without credentials was accepted');
 assert.equal(failureCode(challenge.fields),401,'Expected TURN nonce challenge');
 const realm=challenge.fields.get(ATTR.realm)?.toString('utf8');
 const nonce=challenge.fields.get(ATTR.nonce)?.toString('utf8');
 assert.ok(realm&&nonce&&realm.length<512&&nonce.length<512,'Missing realm/nonce');
 const {username,credential}=creds.iceServers[0];
 const attrs=[
  utf(ATTR.username,username),utf(ATTR.realm,realm),utf(ATTR.nonce,nonce),transport(),
 ];
 const validKey=createHash('md5').update(username+':'+realm+':'+credential).digest();
 const granted=await request(packet(ALLOCATE,attrs,randomBytes(12),validKey));
 assert.equal(granted.type,SUCCESS,'Valid temporary TURN credentials were rejected');
 assert.ok(granted.fields.get(ATTR.relayed)?.length>=8,'Missing relay allocation address');
 const life=granted.fields.get(ATTR.lifetime);
 assert.ok(life&&life.length===4&&life.readUInt32BE(0)>0,'No allocation lifetime');
 // Separate unauthorized credentials must never be accepted.
 const badKey=createHash('md5').update(username+':'+realm+':incorrect-password').digest();
 const denied=await request(packet(ALLOCATE,attrs,randomBytes(12),badKey));
 assert.equal(denied.type,ERROR,'Invalid TURN credentials allocated relay');
 assert.ok([401,438].includes(failureCode(denied.fields)),'Unexpected authorization error');
 console.log('COTURN_ALLOCATION_SUCCESS: temporary credential accepted, incorrect password rejected; Docker bridge only');
}finally{socket.close();}
