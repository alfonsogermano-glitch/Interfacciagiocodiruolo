import assert from 'node:assert/strict';
import {createServer} from 'node:https';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {build} from 'esbuild';
import {createSignalingWebSocketGateway} from '../../aruba-api/src/signaling-websocket-gateway.mjs';

const campaign='00000000-0000-4000-8000-000000000001';
const gm='00000000-0000-4000-8000-000000000002';
const player='00000000-0000-4000-8000-000000000003';
const hostToken='A'.repeat(43),guestToken='B'.repeat(43);
const temp=mkdtempSync(join(tmpdir(),'hg-revisioned-browser-'));
const client=fileURLToPath(new URL('../src/ArubaWebRtcSignalingClient.mjs',import.meta.url));
const source=fileURLToPath(new URL('../src/ArubaGmRevisionedCampaignSource.mjs',import.meta.url));
const receiver=fileURLToPath(new URL('../src/ArubaRevisionedPlayerReceiver.mjs',import.meta.url));
let server,gateway,browser;
try{
 await build({entryPoints:[source,receiver],outdir:temp,entryNames:'[name]',
  bundle:true,format:'esm',platform:'browser',logLevel:'silent'});
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes',
  '-keyout',join(temp,'key.pem'),'-out',join(temp,'cert.pem'),
  '-days','1','-subj','/CN=localhost',
  '-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{stdio:'ignore'});
 server=createServer({key:readFileSync(join(temp,'key.pem')),
  cert:readFileSync(join(temp,'cert.pem'))},(req,res)=>{
  const file={
   '/client.mjs':client,
   '/ArubaGmRevisionedCampaignSource.js':join(temp,'ArubaGmRevisionedCampaignSource.js'),
   '/ArubaRevisionedPlayerReceiver.js':join(temp,'ArubaRevisionedPlayerReceiver.js'),
  }[req.url];
  if(file){
   res.writeHead(200,{'content-type':'text/javascript','cache-control':'no-store'});
   res.end(readFileSync(file));return;
  }
  res.writeHead(200,{'content-type':'text/html'});
  res.end('<!doctype html><title>isolated original-events revisioned browser QA</title>');
 });
 server.listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 const origin='https://127.0.0.1:'+server.address().port;
 const revoked=new Set();
 const identity={async verify({sessionToken,campaignId,connectionRole}){
  if(revoked.has(sessionToken)||campaignId!==campaign)throw Error('Unauthorized');
  if(connectionRole==='host'&&sessionToken===hostToken)return {userId:gm,campaignId,role:'gm'};
  if(connectionRole==='player'&&sessionToken===guestToken)return {userId:player,campaignId,role:'player'};
  throw Error('Unauthorized');
 }};
 gateway=createSignalingWebSocketGateway({server,origin,identity,revalidateIntervalMs:75});
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--ignore-certificate-errors']});
 const gmContext=await browser.newContext({ignoreHTTPSErrors:true});
 const playerContext=await browser.newContext({ignoreHTTPSErrors:true});
 await gmContext.addCookies([{name:'__Host-hg_session',value:hostToken,url:origin}]);
 await playerContext.addCookies([{name:'__Host-hg_session',value:guestToken,url:origin}]);
 const host=await gmContext.newPage(),guest=await playerContext.newPage();
 await Promise.all([host.goto(origin),guest.goto(origin)]);
 const connect=async(page,role)=>page.evaluate(async({role,campaign,gm,player,origin})=>{
  const {createArubaWebRtcSignalingClient}=await import('/client.mjs');
  window.statusEvents=[];window.errors=[];
  if(role==='host'){
   const {createArubaGmRevisionedCampaignSource}=await import('/ArubaGmRevisionedCampaignSource.js');
   window.gameSource=createArubaGmRevisionedCampaignSource({
    campaignId:campaign,gmUserId:gm,
    initialState:{scene:'start',gmNotes:'PRIVATE NEVER SEND'},
    applyGmEvent:({event,payload,state})=>
     event==='active_scene_change'?{...state,scene:payload.scene}:
     {...state,gmNotes:payload.text},
    projectVisibleSnapshot:({state,userId})=>userId===player?{scene:state.scene}:null,
    projectVisibleEvent:({event,payload,userId})=>
     event==='active_scene_change'&&userId===player
      ?{event,payload:{scene:payload.scene}}:null,
   });
   window.verifiedSessions=new Map();
  }else{
   const {createArubaRevisionedPlayerReceiver}=await import('/ArubaRevisionedPlayerReceiver.js');
   window.snapshotFrames=[];window.deltaFrames=[];window.receiver=null;
   window.createReceiver=channel=>{
    window.receiver=createArubaRevisionedPlayerReceiver({
     channel,applySnapshot:f=>{window.snapshotFrames.push(f);return true;},
     applyDelta:f=>{window.deltaFrames.push(f);return true;},
     onError:e=>window.errors.push('receiver '+String(e)),
    });
   };
  }
  window.probe=createArubaWebRtcSignalingClient({
   campaignId:campaign,role,origin,WebSocketCtor:WebSocket,
   PeerConnectionCtor:RTCPeerConnection,rtcConfig:{iceServers:[]},
   onState:s=>window.statusEvents.push(s),
   onVerifiedPeer:proof=>{
    if(role==='host'){
     const record=window.gameSource.registerVerifiedPeer({
      peerId:proof.peerId,userId:proof.userId,verifiedCampaignId:proof.campaignId,
     });
     window.verifiedSessions.set(proof.peerId,record);
    }
   },
   onPeerRevoked:proof=>{
    if(role==='host'){
     window.verifiedSessions.get(proof.peerId)?.close();
     window.verifiedSessions.delete(proof.peerId);
    }
   },
   onDataChannel:({peerId,channel})=>{
    if(role==='host'){
     window.verifiedSessions.get(peerId)?.attachChannel(channel);
    }else window.createReceiver(channel);
   },
   onError:e=>window.errors.push(String(e)),
  });
  window.probe.connect();
 },{role,campaign,gm,player,origin});
 await connect(host,'host');
 await host.waitForFunction(()=>window.statusEvents.some(e=>e.state==='ready'),null,{timeout:10000});
 await connect(guest,'player');
 await Promise.all([
  host.waitForFunction(()=>window.statusEvents.some(e=>e.state==='peer-connected'),null,{timeout:20000}),
  guest.waitForFunction(()=>window.receiver?.status==='ready',null,{timeout:20000}),
 ]);
 assert.deepEqual(await guest.evaluate(()=>window.snapshotFrames),[
  {revision:0,payload:{scene:'start'}},
 ]);
 await host.evaluate(({gm})=>{
  window.gameSource.commit({authenticatedGmUserId:gm,event:'notes_change',payload:{text:'SECRET TWO'}});
  window.gameSource.commit({authenticatedGmUserId:gm,event:'active_scene_change',payload:{scene:'forest'}});
  window.gameSource.commit({authenticatedGmUserId:gm,event:'active_scene_change',payload:{scene:'cave'}});
 },{gm});
 await guest.waitForFunction(()=>window.receiver?.revision===2,null,{timeout:10000});
 assert.deepEqual(await guest.evaluate(()=>window.deltaFrames),[
  {revision:1,event:'active_scene_change',payload:{scene:'forest'}},
  {revision:2,event:'active_scene_change',payload:{scene:'cave'}},
 ]);
 const delivered=await guest.evaluate(()=>JSON.stringify([window.snapshotFrames,window.deltaFrames]));
 assert.doesNotMatch(delivered,/SECRET|PRIVATE|gmNotes|notes_change/);
 assert.deepEqual(await guest.evaluate(()=>window.errors),[]);
 revoked.add(guestToken);
 await Promise.all([
  guest.waitForFunction(()=>!window.probe.connected,null,{timeout:10000}),
  host.waitForFunction(()=>window.gameSource.peerCount===0,null,{timeout:10000}),
 ]);
 assert.equal(await guest.evaluate(()=>window.receiver.status),'closed');
 await host.evaluate(({gm})=>{
  window.gameSource.commit({authenticatedGmUserId:gm,event:'active_scene_change',payload:{scene:'forbidden'}});
 },{gm});
 assert.equal(await guest.evaluate(()=>window.deltaFrames.length),2);
 await Promise.all([gmContext.close(),playerContext.close()]);
 console.log('BROWSER_REVISIONED_EVENTS_SUCCESS: real Chromium WebRTC, privacy, ordered revisions, revocation');
}finally{
 if(browser)await browser.close();
 if(gateway)gateway.close();
 if(server)await new Promise(resolve=>server.close(resolve));
 rmSync(temp,{recursive:true,force:true});
}
