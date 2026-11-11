import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {WebSocket} from 'ws';
import {createHostServer} from '../server.mjs';
const wait=(ws,pred,timeoutMs=4000)=>new Promise((resolve,reject)=>{
 const timeout=setTimeout(()=>{cleanup();reject(Error('Timeout waiting for frame'))},timeoutMs);
 const handler=raw=>{let frame;try{frame=JSON.parse(String(raw))}catch{return}
  if(pred(frame)){cleanup();resolve(frame)}
 };
 const close=()=>{cleanup();reject(Error('WebSocket closed before expected frame'))};
 function cleanup(){clearTimeout(timeout);ws.off('message',handler);ws.off('close',close)}
 ws.on('message',handler);ws.on('close',close);
});
const connect=async port=>{
 const ws=new WebSocket('ws://127.0.0.1:'+port+'/ws',{headers:{Origin:'http://127.0.0.1:'+port}});
 await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject)});
 return ws;
};
test('real WebSocket GM/player negotiation publishes safe patch and recovers snapshot',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'hg-vtt-wire-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const port=41893;
 const host=createHostServer({port,archiveFile:join(dir,'state.json')});
 await host.listen();
 const clients=[];
 t.after(async()=>{for(const ws of clients)ws.terminate();await host.close()});
 const gm=await connect(port);clients.push(gm);
 let gmReady=wait(gm,m=>m.type==='joined');
 gm.send(JSON.stringify({type:'hello',role:'gm',token:host.session.gmToken}));
 await gmReady;
 const p=await connect(port);clients.push(p);
 let playerReady=wait(p,m=>m.type==='joined');
 p.send(JSON.stringify({type:'hello',role:'player',token:host.session.playerToken}));
 await playerReady;
 // Listen for the patch before sending to avoid event races.
 const patchWait=wait(p,m=>m.type==='vtt:patch'&&m.sequence===1);
 gm.send(JSON.stringify({type:'vtt:command',version:1,campaignId:'demo',eventId:'evt1',command:'publishScene',payload:{sceneId:'one',title:'Catacombe',gmNotes:'SECRET'}}));
 const patch=await patchWait;
 assert.equal(patch.changes.scene.title,'Catacombe');
 assert.equal(JSON.stringify(patch).includes('SECRET'),false);
 const resyncWait=wait(p,m=>m.type==='vtt:snapshot'&&m.sequence===1);
 p.send(JSON.stringify({type:'vtt:resync',version:1,campaignId:'demo',lastSequence:0}));
 const snapshot=await resyncWait;
 assert.equal(snapshot.state.scene.title,'Catacombe');
 assert.equal(JSON.stringify(snapshot).includes('SECRET'),false);
 const rejectWait=wait(p,m=>m.type==='vtt:ack'&&m.eventId==='evt2');
 p.send(JSON.stringify({type:'vtt:command',version:1,campaignId:'demo',eventId:'evt2',command:'publishScene',payload:{sceneId:'other',title:'Wrong'}}));
 assert.equal((await rejectWait).status,'rejected');
});

test('real GM Host serves two independent browser players with identical event streams',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'hg-vtt-multibrowser-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const port=41894,host=createHostServer({port,archiveFile:join(dir,'state.json')});
 await host.listen();
 const clients=[];
 t.after(async()=>{for(const ws of clients)ws.terminate();await host.close()});
 const joinPeer=async(role,token,name)=>{
  const ws=await connect(port);clients.push(ws);
  const ready=wait(ws,m=>m.type==='joined');
  ws.send(JSON.stringify({type:'hello',role,token,name}));
  await ready;
  return ws;
 };
 const gm=await joinPeer('gm',host.session.gmToken,'GM');
 const p1=await joinPeer('player',host.session.playerToken,'Player PC');
 const p2=await joinPeer('player',host.session.playerToken,'Player Android');
 const changes=[wait(p1,m=>m.type==='vtt:patch'&&m.sequence===1),
                wait(p2,m=>m.type==='vtt:patch'&&m.sequence===1)];
 gm.send(JSON.stringify({type:'vtt:command',version:1,campaignId:'demo',eventId:'multi-1',command:'publishScene',payload:{sceneId:'same',title:'Scena condivisa'}}));
 const [one,two]=await Promise.all(changes);
 assert.equal(one.changes.scene.title,'Scena condivisa');
 assert.equal(two.changes.scene.title,'Scena condivisa');
 assert.equal(one.sequence,two.sequence);
});
