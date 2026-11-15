#!/usr/bin/env node
/**
 * Safe, unauthenticated external TURN reachability probe.
 * From a client outside the Aruba VPS, verify:
 * - A TURN Allocate request receives an RFC STUN/TURN authentication challenge over UDP
 * - The TLS listener presents a chain trusted by the local system for the hostname
 *
 * Does NOT send TURN credentials, cookies, gameplay data, or negotiate a relay.
 * Does NOT modify DNS, firewalls, or the remote service.
 */
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createSocket} from 'node:dgram';
import {lookup} from 'node:dns/promises';
import {connect as tlsConnect} from 'node:tls';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const MAGIC=0x2112a442;
export function buildUnauthenticatedAllocate(tx=randomBytes(12)){
 if(!Buffer.isBuffer(tx)||tx.length!==12)throw new TypeError('12-byte STUN transaction required');
 const packet=Buffer.alloc(28);
 packet.writeUInt16BE(0x0003,0);
 packet.writeUInt16BE(8,2);
 packet.writeUInt32BE(MAGIC,4);
 tx.copy(packet,8);
 packet.writeUInt16BE(0x0019,20); // REQUESTED-TRANSPORT
 packet.writeUInt16BE(4,22);
 packet[24]=17; // UDP
 return packet;
}
export function parseChallenge(packet,tx){
 if(!Buffer.isBuffer(packet)||packet.length<20||!Buffer.isBuffer(tx)||tx.length!==12)
  throw new Error('Invalid STUN response');
 if(packet.readUInt32BE(4)!==MAGIC||!packet.subarray(8,20).equals(tx)||
   packet.readUInt16BE(0)!==0x0113)throw new Error('Not a TURN Allocate error response');
 const end=20+packet.readUInt16BE(2);
 if(end>packet.length)throw new Error('Truncated TURN response');
 let code=null,hasRealm=false,hasNonce=false;
 for(let pos=20;pos<end;){
  if(pos+4>end)throw new Error('Invalid TURN attribute');
  const type=packet.readUInt16BE(pos),n=packet.readUInt16BE(pos+2);
  if(pos+4+n>end)throw new Error('Truncated TURN attribute');
  const value=packet.subarray(pos+4,pos+4+n);
  if(type===0x0009&&n>=4)code=(value[2]&7)*100+value[3];
  if(type===0x0014&&n>0)hasRealm=true;
  if(type===0x0015&&n>0)hasNonce=true;
  pos+=4+Math.ceil(n/4)*4;
 }
 if(code!==401||!hasRealm||!hasNonce)
  throw new Error('TURN did not issue a standard authentication challenge');
 return true;
}
export async function probeUdp({hostname,port=3478,timeoutMs=3000,
 socketFactory=createSocket,resolveHost=lookup}){
 const result=await resolveHost(hostname,{family:4});
 if(typeof result?.address!=='string')throw new Error('IPv4 DNS resolution failed');
 const tx=randomBytes(12),packet=buildUnauthenticatedAllocate(tx);
 const sock=socketFactory('udp4');
 try{
  await new Promise((resolve,reject)=>{
   let done=false;
   const cleanup=()=>{
    sock.off('message',onMessage);sock.off('error',onError);clearTimeout(timer);
   };
   const settle=(error)=>{
    if(done)return;
    done=true;cleanup();error?reject(error):resolve();
   };
   const onError=()=>settle(new Error('TURN UDP socket failure'));
   const onMessage=message=>{
    // Ignore unrelated packets (e.g., stale or spoofed transaction).
    if(message.length<20||!message.subarray(8,20).equals(tx))return;
    try{parseChallenge(message,tx);settle();}
    catch{settle(new Error('TURN UDP response not a valid 401 challenge'));}
   };
   const timer=setTimeout(()=>settle(new Error('TURN UDP timeout')),timeoutMs);
   sock.on('message',onMessage);sock.on('error',onError);
   sock.send(packet,port,result.address,error=>{
    if(error)settle(new Error('TURN UDP send failed'));
   });
  });
  return true;
 }finally{sock.close();}
}
export async function probeTls({hostname,port=5349,timeoutMs=3500,connect=tlsConnect,ca}){
 await new Promise((resolve,reject)=>{
  const socket=connect({
   host:hostname,port,servername:hostname,rejectUnauthorized:true,ca,
  });
  const timer=setTimeout(()=>finish(new Error('TURN TLS timeout')),timeoutMs);
  let done=false;
  function finish(error){
   if(done)return;
   done=true;clearTimeout(timer);socket.removeAllListeners();
   socket.destroy();
   error?reject(error):resolve();
  }
  socket.once('secureConnect',()=>{
   if(!socket.authorized)return finish(new Error('TURN TLS certificate untrusted'));
   finish();
  });
  socket.once('error',()=>finish(new Error('TURN TLS handshake or certificate failed')));
 });
 return true;
}
function parseArgs(argv){
 const obj={};
 for(let i=0;i<argv.length;i+=2){
  const key=argv[i],value=argv[i+1];
  if(!['--hostname','--udp-port','--tls-port'].includes(key)||!value||
    Object.hasOwn(obj,key))throw new Error('Usage: --hostname DNS [--udp-port 3478] [--tls-port 5349]');
  obj[key]=value;
 }
 const hostname=obj['--hostname'];
 if(typeof hostname!=='string'||hostname.length>253||
  !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])$/i.test(hostname)||
  hostname.includes('..')||/^\d+(?:\.\d+){3}$/.test(hostname))
  throw new Error('A valid TURN DNS hostname is required (no raw IP)');
 for(const key of ['--udp-port','--tls-port'])
  if(obj[key]!==undefined&&(!/^\d{1,5}$/.test(obj[key])||
   Number(obj[key])<1||Number(obj[key])>65535))
   throw new Error('Invalid TURN listener port');
 return {hostname,udpPort:Number(obj['--udp-port']??3478),
  tlsPort:Number(obj['--tls-port']??5349)};
}
export async function runExternalProbe(argv){
 const {hostname,udpPort,tlsPort}=parseArgs(argv);
 await probeUdp({hostname,port:udpPort});
 console.log('TURN_EXTERNAL_UDP_CHALLENGE_SUCCESS');
 await probeTls({hostname,port:tlsPort});
 console.log('TURN_EXTERNAL_TLS_CERT_SUCCESS');
 console.log('TURN_EXTERNAL_REACHABILITY_SUCCESS: no TURN secrets or user sessions sent');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 runExternalProbe(process.argv.slice(2)).catch(error=>{
  console.error('TURN_EXTERNAL_REACHABILITY_BLOCKED: '+error.message);
  process.exitCode=1;
 });
}
