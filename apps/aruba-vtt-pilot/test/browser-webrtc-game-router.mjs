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
const gmToken='A'.repeat(43),playerToken='B'.repeat(43);
const source=fileURLToPath(new URL('../src/ArubaWebRtcSignalingClient.mjs',import.meta.url));
const routerSource=fileURLToPath(new URL('../src/ArubaGmHostEventRouter.mjs',import.meta.url));
const bindingsSource=fileURLToPath(new URL('../src/ArubaVerifiedGmPeerBindings.mjs',import.meta.url));
const temp=mkdtempSync(join(tmpdir(),'hg-webrtc-browser-'));
let server,gateway,browser;
const closeServer=()=>new Promise(resolve=>server.close(resolve));
try{
 // Bundle only test-side router and binding dependencies. This resolves
 // canonical TypeScript event vocabulary without changing production code.
 await build({entryPoints:[routerSource,bindingsSource],
  outdir:temp,entryNames:'[name]',bundle:true,format:'esm',platform:'browser',
  logLevel:'silent'});
 // Disposable loopback TLS only; neither the VPS nor real accounts are used.
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes',
  '-keyout',join(temp,'key.pem'),'-out',join(temp,'cert.pem'),
  '-days','1','-subj','/CN=localhost',
  '-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{stdio:'ignore'});
 server=createServer({key:readFileSync(join(temp,'key.pem')),
  cert:readFileSync(join(temp,'cert.pem'))},(req,res)=>{
  if(req.url==='/ArubaGmHostEventRouter.js'||req.url==='/ArubaVerifiedGmPeerBindings.js'){
   res.writeHead(200,{'content-type':'text/javascript','cache-control':'no-store'});
   res.end(readFileSync(join(temp,req.url.slice(1))));return;
  }
  if(req.url==='/client.mjs'){
   res.writeHead(200,{'content-type':'text/javascript','cache-control':'no-store'});
   res.end(readFileSync(source));return;
  }
  res.writeHead(200,{'content-type':'text/html'});
  res.end('<!DOCTYPE html><title>Isolated WebRTC probe</title>');
 });
 server.listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 const origin='https://127.0.0.1:'+server.address().port;
 const revoked=new Set();
 const identity={async verify({sessionToken,campaignId,connectionRole}){
  if(revoked.has(sessionToken))throw Error('Membership revoked');
  if(campaignId!==campaign)throw Error('Invalid campaign');
  if(connectionRole==='host'&&sessionToken===gmToken)
   return {userId:gm,campaignId,role:'gm'};
  if(connectionRole==='player'&&sessionToken===playerToken)
   return {userId:player,campaignId,role:'player'};
  throw Error('Invalid membership');
 }};
 gateway=createSignalingWebSocketGateway({server,origin,identity,revalidateIntervalMs:100});
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--ignore-certificate-errors']});
 const ctx=await browser.newContext({ignoreHTTPSErrors:true});
 const gmPage=await ctx.newPage(),playerPage=await ctx.newPage();
 await ctx.addCookies([
  {name:'__Host-hg_session',value:gmToken,url:origin},
 ]); // Replace cookie in each independent context below.
 await ctx.clearCookies();
 const gmContext=await browser.newContext({ignoreHTTPSErrors:true});
 const playerContext=await browser.newContext({ignoreHTTPSErrors:true});
 await gmContext.addCookies([{name:'__Host-hg_session',value:gmToken,url:origin}]);
 await playerContext.addCookies([{name:'__Host-hg_session',value:playerToken,url:origin}]);
 const host=await gmContext.newPage(),guest=await playerContext.newPage();
 await Promise.all([host.goto(origin),guest.goto(origin)]);
 const connect=async(page,role)=>{
  await page.evaluate(async({campaign,role,origin})=>{
   const {createArubaWebRtcSignalingClient}=await import('/client.mjs');
   if(role==='host'){
    const {createGmHostEventRouter}=await import('/ArubaGmHostEventRouter.js');
    const {createVerifiedGmPeerBindings}=await import('/ArubaVerifiedGmPeerBindings.js');
    window.gameFrames=[];
    window.gameRouter=createGmHostEventRouter({
     campaignId:campaign,gmUserId:'00000000-0000-4000-8000-000000000002',
     authorizePlayerEvent:({userId,event,payload})=>
      userId==='00000000-0000-4000-8000-000000000003'&&
      event==='chat_message'&&typeof payload.text==='string'&&
      payload.fromUserId===undefined,
     authorizeHostEvent:({toUserId,event})=>
      toUserId==='00000000-0000-4000-8000-000000000003'&&
      event==='active_scene_change',
    });
    window.gameHost=window.gameRouter.openVerifiedHost({
     authenticatedUserId:'00000000-0000-4000-8000-000000000002',
     receiveFromPlayer:frame=>window.gameFrames.push(frame),
    });
    window.gameBindings=createVerifiedGmPeerBindings({
     router:window.gameRouter,campaignId:campaign,
    });
   }
   window.guestFrames=[];
   window.gameChannel=null;
   window.probeStates=[];
   window.verifiedProofs=[];
   window.revokedProofs=[];
   window.probe=createArubaWebRtcSignalingClient({
    campaignId:campaign,role,origin,WebSocketCtor:WebSocket,
    PeerConnectionCtor:RTCPeerConnection,rtcConfig:{iceServers:[]},
    onState:value=>window.probeStates.push(value),
    onVerifiedPeer:proof=>{window.verifiedProofs.push(proof);window.gameBindings?.onVerifiedPeer(proof);},
    onPeerRevoked:proof=>{window.revokedProofs.push(proof);window.gameBindings?.onPeerRevoked(proof);},
    onDataChannel:({peerId,channel})=>{
     if(role==='host')window.gameBindings.attachChannel(peerId,channel);
     else{
      window.gameChannel=channel;
      channel.addEventListener('message',event=>window.guestFrames.push(JSON.parse(event.data)));
     }
    },
    onError:error=>window.probeStates.push({state:'error',detail:String(error)}),
   });
   window.probe.connect();
  },{campaign,role,origin});
 };
 await connect(host,'host');
 await host.waitForFunction(()=>window.probeStates.some(s=>s.state==='ready'),null,{timeout:10000});
 await connect(guest,'player');
 await guest.waitForFunction(()=>window.probeStates.some(s=>s.state==='ready'),null,{timeout:10000});
 await Promise.all([
  host.waitForFunction(()=>window.probeStates.some(s=>s.state==='peer-connected'),null,{timeout:20000}),
  guest.waitForFunction(()=>window.probeStates.some(s=>s.state==='peer-connected'),null,{timeout:20000}),
 ]);
 assert.equal(await host.evaluate(()=>window.probe.peerCount),1);
 assert.equal(await guest.evaluate(()=>window.probe.peerCount),1);
 await Promise.all([
  host.waitForFunction(()=>window.gameBindings?.attachedCount===1,null,{timeout:10000}),
  guest.waitForFunction(()=>window.gameChannel?.readyState==='open',null,{timeout:10000}),
 ]);
 await guest.evaluate(()=>{
  window.gameChannel.send(JSON.stringify({event:'active_scene_change',payload:{id:'hacked'}}));
  window.gameChannel.send(JSON.stringify({event:'chat_message',payload:{text:'hello from WebRTC'}}));
  window.gameChannel.send(JSON.stringify({event:'chat_message',payload:{text:'forged',fromUserId:'gm'}}));
 });
 await host.waitForFunction(()=>window.gameFrames.length===1,null,{timeout:5000});
 assert.deepEqual(await host.evaluate(()=>window.gameFrames),[{
  campaignId:campaign,fromUserId:player,event:'chat_message',
  payload:{text:'hello from WebRTC'},
 }]);
 await host.evaluate(()=>{
  window.gameHost.publish('active_scene_change',{sceneId:'visible'});
  window.gameHost.publish('notes_change',{secret:'GM only'});
 });
 await guest.waitForFunction(()=>window.guestFrames.length===1,null,{timeout:5000});
 assert.deepEqual(await guest.evaluate(()=>window.guestFrames),[{
  event:'active_scene_change',payload:{sceneId:'visible'},
 }]);
 const identityProof=await host.evaluate(()=>window.verifiedProofs[0]);
 assert.deepEqual({userId:identityProof?.userId,campaignId:identityProof?.campaignId},
  {userId:player,campaignId:campaign});
 const stats=await Promise.all([
  host.evaluate(()=>window.probe.inspectConnections()),
  guest.evaluate(()=>window.probe.inspectConnections()),
 ]);
 assert.equal(stats[0].length,1);
 assert.equal(stats[1].length,1);
 for(const entries of stats){
  assert.equal(entries[0].connectionState,'connected');
  assert.ok(['direct','relay','unknown'].includes(entries[0].route));
  assert.doesNotMatch(JSON.stringify(entries),/candidate:|\.local|192\.168\.|10\.0\./);
 }
 const states=await Promise.all([host.evaluate(()=>window.probeStates),guest.evaluate(()=>window.probeStates)]);
 assert.equal(states.flat().some(x=>x.state==='error'),false);
 await host.evaluate(()=>window.probe.disconnect());
 await guest.waitForFunction(()=>!window.probe.connected,null,{timeout:10000});
 // Recreate a fresh room on the same TLS gateway, proving manual recovery
 // after the GM's prior socket closes and the player is disconnected.
 await host.evaluate(()=>{window.probeStates=[];window.revokedProofs=[];window.verifiedProofs=[];window.probe.connect();});
 await host.waitForFunction(()=>window.probeStates.some(s=>s.state==='ready'),null,{timeout:10000});
 await guest.evaluate(()=>{window.probeStates=[];window.probe.connect();});
 await guest.waitForFunction(()=>window.probeStates.some(s=>s.state==='ready'),null,{timeout:10000});
 await Promise.all([
  host.waitForFunction(()=>window.probeStates.some(s=>s.state==='peer-connected'),null,{timeout:20000}),
  guest.waitForFunction(()=>window.probeStates.some(s=>s.state==='peer-connected'),null,{timeout:20000}),
 ]);
 assert.equal(await host.evaluate(()=>window.probe.peerCount),1);
 assert.equal(await guest.evaluate(()=>window.probe.peerCount),1);
 // Active RTCDataChannels must be torn down even when a revoked player sends
 // no further signaling messages. Server heartbeat independently revalidates.
 revoked.add(playerToken);
 await Promise.all([
  guest.waitForFunction(()=>!window.probe.connected,null,{timeout:10000}),
  host.waitForFunction(()=>window.probe.peerCount===0,null,{timeout:10000}),
 ]);
 assert.equal(await host.evaluate(()=>window.revokedProofs.length),1);
 assert.equal(await host.evaluate(()=>window.probe.getVerifiedPeer(window.revokedProofs[0].peerId)),null);
 assert.equal(await host.evaluate(()=>window.gameBindings.attachedCount),0);
 assert.equal(await host.evaluate(()=>window.gameHost.connectedPlayers),0);
 assert.equal(await host.evaluate(()=>window.gameFrames.length),1);
 await Promise.all([gmContext.close(),playerContext.close(),ctx.close()]);
 console.log('BROWSER_WEBRTC_GAME_ROUTER_SUCCESS: real channel authorized events, filtering and revocation');
}finally{
 if(browser)await browser.close();
 if(gateway)gateway.close();
 if(server)await closeServer();
 rmSync(temp,{recursive:true,force:true});
}
