import test from 'node:test';
import assert from 'node:assert/strict';
import {createSocket} from 'node:dgram';
import {createServer as createTlsServer,connect as tlsConnect} from 'node:tls';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {buildUnauthenticatedAllocate,parseChallenge,probeUdp,probeTls}
 from './external-turn-probe.mjs';

const magic=0x2112a442;
function attr(type,value){
 const pad=(4-value.length%4)%4;
 const out=Buffer.alloc(4+value.length+pad);
 out.writeUInt16BE(type,0);
 out.writeUInt16BE(value.length,2);
 value.copy(out,4);
 return out;
}
function errorChallenge(tx,error=401){
 const code=Buffer.from([0,0,Math.floor(error/100),error%100]);
 const fields=[
  attr(0x0009,code),attr(0x0014,Buffer.from('turn.example.invalid')),
  attr(0x0015,Buffer.from('nonce-for-test')),
 ];
 const head=Buffer.alloc(20);
 head.writeUInt16BE(0x0113,0);
 head.writeUInt16BE(fields.reduce((n,b)=>n+b.length,0),2);
 head.writeUInt32BE(magic,4);
 tx.copy(head,8);
 return Buffer.concat([head,...fields]);
}
test('unauthenticated TURN Allocate packet contains UDP transport request and transaction',()=>{
 const tx=Buffer.alloc(12,31);
 const msg=buildUnauthenticatedAllocate(tx);
 assert.equal(msg.length,28);
 assert.equal(msg.readUInt16BE(0),0x0003);
 assert.equal(msg.readUInt32BE(4),magic);
 assert.equal(msg[24],17);
 assert.ok(msg.subarray(8,20).equals(tx));
});
test('TURN 401 challenge parser rejects forged, malformed and unrelated responses',()=>{
 const tx=Buffer.alloc(12,8);
 assert.equal(parseChallenge(errorChallenge(tx),tx),true);
 assert.throws(()=>parseChallenge(errorChallenge(Buffer.alloc(12,3)),tx));
 assert.throws(()=>parseChallenge(errorChallenge(tx,403),tx));
 const truncated=errorChallenge(tx);
 truncated.writeUInt16BE(65535,2);
 assert.throws(()=>parseChallenge(truncated,tx));
});
async function udpFixture({error=401,respond=true}={}){
 const sock=createSocket('udp4');
 sock.on('message',(buf,rinfo)=>{
  if(respond&&buf.length>=28&&buf.readUInt32BE(4)===magic)
   sock.send(errorChallenge(buf.subarray(8,20),error),rinfo.port,rinfo.address);
 });
 await new Promise(resolve=>sock.bind(0,'127.0.0.1',resolve));
 return sock;
}
test('live UDP challenge probe succeeds and fails on unauthorized or missing response',async()=>{
 const good=await udpFixture();
 try{
  assert.equal(await probeUdp({hostname:'localhost',port:good.address().port,timeoutMs:600}),true);
 }finally{good.close();}
 const forbidden=await udpFixture({error:403});
 try{
  await assert.rejects(probeUdp({hostname:'localhost',port:forbidden.address().port,timeoutMs:600}),
   /not a valid 401 challenge/);
 }finally{forbidden.close();}
 const silent=await udpFixture({respond:false});
 try{
  await assert.rejects(probeUdp({hostname:'localhost',port:silent.address().port,timeoutMs:150}),
   /timeout/);
 }finally{silent.close();}
});
test('live TLS probe authenticates hostname and rejects wrong server identity',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'hg-turn-tls-'));
 let server;
 try{
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1',
   '-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost',
   '-keyout',join(dir,'key.pem'),'-out',join(dir,'cert.pem')],{stdio:'ignore'});
  const ca=readFileSync(join(dir,'cert.pem'));
  server=createTlsServer({
   key:readFileSync(join(dir,'key.pem')),cert:ca,
  },socket=>socket.end());
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;
  assert.equal(await probeTls({hostname:'localhost',port,ca}),true);
  await assert.rejects(probeTls({
   hostname:'wrong.example',port,ca,timeoutMs:500,
   connect:options=>tlsConnect({...options,host:'127.0.0.1'}),
  }),/handshake or certificate/);
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  rmSync(dir,{recursive:true,force:true});
 }
});
