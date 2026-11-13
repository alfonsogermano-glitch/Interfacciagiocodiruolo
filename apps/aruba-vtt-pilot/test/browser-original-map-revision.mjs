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
const mapProjection=fileURLToPath(new URL('../src/ArubaOriginalMapRevisionProjection.mjs',import.meta.url));
let server,gateway,browser;
try{
 await build({entryPoints:[source,receiver,mapProjection],outdir:temp,entryNames:'[name]',
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
   '/ArubaOriginalMapRevisionProjection.js':join(temp,'ArubaOriginalMapRevisionProjection.js'),
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
   const {projectOriginalMapForPlayer,projectOriginalMapDelta}=await import('/ArubaOriginalMapRevisionProjection.js');
   window.gameSource=createArubaGmRevisionedCampaignSource({
    campaignId:campaign,gmUserId:gm,
    initialState:{
     mapTokens:[
      {id:'visible-token',visible:true,name:'Visible',x:0,y:0,hiddenFromPlayers:true,
       light:{enabled:true,radius:10,shape:'cone',coneAngle:60,coneDirection:90},
       vision:{enabled:true,radius:20,shape:'circle'}},
      {id:'hidden-token',visible:false,name:'TOP SECRET TOKEN',x:2,y:2},
     ],
     mapDrawings:[
      {id:'visible-drawing',visible:true,x:1},
      {id:'hidden-drawing',visible:false,text:{content:'SECRET DRAWING'}},
     ],
     mapPois:[
      {id:'visible-poi',visibleToPlayers:true,noteId:'PRIVATE-NOTE-ID',
       noteVisibleToPlayers:false,label:'Visible POI'},
      {id:'hidden-poi',visibleToPlayers:false,noteId:'SECRET-POI-NOTE',
       noteVisibleToPlayers:false,label:'SECRET POI'},
     ],
     mapObjectOrder:[
      {family:'poi',id:'hidden-poi'},
      {family:'token',id:'hidden-token'},
      {family:'drawing',id:'visible-drawing'},
      {family:'token',id:'visible-token'},
      {family:'poi',id:'visible-poi'},
      {family:'drawing',id:'hidden-drawing'},
     ],
     mapFog:[{id:'fog-main',kind:'rectangle',operation:'cover',persistence:'semi-persistent',
      opacity:0.6,enabled:true,exploredAreas:[],lightExploredAreas:[]}],
     gmNotes:'PRIVATE NEVER SEND',
    },
    applyGmEvent:({state,payload})=>({...state,...payload}),
    projectVisibleSnapshot:({state,userId})=>
     userId===player?projectOriginalMapForPlayer(state):null,
    projectVisibleEvent:args=>args.userId===player?projectOriginalMapDelta(args):null,
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
 const initial=await guest.evaluate(()=>window.snapshotFrames);
 assert.equal(initial.length,1);
 assert.equal(initial[0].revision,0);
 assert.deepEqual(initial[0].payload.mapTokens.map(t=>t.id),['visible-token']);
 assert.deepEqual(initial[0].payload.mapDrawings.map(d=>d.id),['visible-drawing']);
 assert.deepEqual(initial[0].payload.mapPois.map(p=>p.id),['visible-poi']);
 assert.equal(initial[0].payload.mapPois[0].noteId,null);
 assert.equal(initial[0].payload.mapFog.length,1);
 assert.equal(initial[0].payload.mapFog[0].persistence,'semi-persistent');
 assert.equal(initial[0].payload.mapTokens[0].light.radius,10);
 assert.equal(initial[0].payload.mapTokens[0].vision.radius,20);
 assert.deepEqual(initial[0].payload.mapObjectOrder,[
  {family:'drawing',id:'visible-drawing'},
  {family:'token',id:'visible-token'},
  {family:'poi',id:'visible-poi'},
 ]);
 await host.evaluate(({gm})=>{
  window.privateCommitAccepted=window.gameSource.commit({
   authenticatedGmUserId:gm,event:'active_scene_map_patch',
   payload:{gmNotes:'SECRET TWO'},
  });
  window.gmRevisionAfterPrivate=[...window.verifiedSessions.values()][0].revision;
  window.gameSource.commit({
   authenticatedGmUserId:gm,event:'active_scene_map_patch',
   payload:{mapTokens:[
    {id:'visible-token',visible:true,name:'Visible',x:11,y:12,hiddenFromPlayers:true,
     light:{enabled:true,radius:14,shape:'cone',coneAngle:60,coneDirection:90},
     vision:{enabled:true,radius:20,shape:'circle'}},
    {id:'hidden-token',visible:false,name:'TOP SECRET TOKEN',x:99,y:99},
   ]},
  });
  window.gameSource.commit({
   authenticatedGmUserId:gm,event:'active_scene_map_patch',
   payload:{mapPois:[
    {id:'visible-poi',visibleToPlayers:true,noteId:'PRIVATE-NOTE-ID',
     noteVisibleToPlayers:true,label:'Visible POI'},
    {id:'hidden-poi',visibleToPlayers:false,noteId:'SECRET-POI-NOTE',
     noteVisibleToPlayers:false,label:'SECRET POI'},
   ]},
  });
  window.gameSource.commit({
   authenticatedGmUserId:gm,event:'active_scene_map_patch',
   payload:{mapFog:[{
    id:'fog-main',kind:'rectangle',operation:'cover',
    persistence:'semi-persistent',opacity:0.6,enabled:true,
    exploredAreas:[[[{x:0,y:0},{x:1,y:0},{x:1,y:1}]]],
    lightExploredAreas:[[[{x:0,y:0},{x:1,y:1},{x:0,y:1}]]],
   }]},
  });
  window.gameSource.commit({
   authenticatedGmUserId:gm,event:'active_scene_map_patch',
   payload:{
    mapTokens:[
     {id:'visible-token',visible:true,name:'Visible',x:33,y:44,size:60,
      rotation:135,locked:true,hiddenFromPlayers:true,
      light:{enabled:true,radius:14,shape:'cone',coneAngle:60,coneDirection:90},
      vision:{enabled:true,radius:20,shape:'circle'}},
     {id:'hidden-token',visible:false,name:'TOP SECRET TOKEN',x:99,y:99,pinned:true},
    ],
    mapDrawings:[
     {id:'visible-drawing',visible:true,x:51,y:70,width:84,height:42,
      rotation:90,pinned:true},
     {id:'hidden-drawing',visible:false,text:{content:'SECRET DRAWING'}},
    ],
   },
  });
  window.gameSource.commit({
   authenticatedGmUserId:gm,event:'active_scene_map_patch',
   payload:{mapObjectOrder:[
    {family:'drawing',id:'hidden-drawing'},
    {family:'token',id:'hidden-token'},
    {family:'poi',id:'visible-poi'},
    {family:'token',id:'visible-token'},
    {family:'drawing',id:'visible-drawing'},
    {family:'poi',id:'hidden-poi'},
   ]},
  });
 },{gm});
 assert.equal(await host.evaluate(()=>window.privateCommitAccepted),true);
 assert.equal(await host.evaluate(()=>window.gmRevisionAfterPrivate),0);
 await guest.waitForFunction(()=>window.receiver?.revision===5,null,{timeout:10000});
 const frames=await guest.evaluate(()=>window.deltaFrames);
 assert.deepEqual(frames.map(f=>[f.revision,f.event]),[
  [1,'active_scene_map_patch'],[2,'active_scene_map_patch'],
  [3,'active_scene_map_patch'],[4,'active_scene_map_patch'],
  [5,'active_scene_map_patch'],
 ]);
 assert.equal(frames[0].payload.mapTokens[0].x,11);
 assert.equal(frames[0].payload.mapTokens[0].light.radius,14);
 assert.equal(frames[0].payload.mapTokens[0].vision.radius,20);
 assert.deepEqual(frames[0].payload.mapObjectOrder,initial[0].payload.mapObjectOrder);
 assert.equal(frames[1].payload.mapPois[0].noteId,'PRIVATE-NOTE-ID');
 assert.deepEqual(frames[1].payload.mapTokens.map(t=>t.id),['visible-token']);
 assert.equal(frames[2].payload.mapFog[0].exploredAreas.length,1);
 assert.equal(frames[2].payload.mapFog[0].lightExploredAreas.length,1);
 assert.equal(frames[3].payload.mapTokens[0].x,33);
 assert.equal(frames[3].payload.mapTokens[0].y,44);
 assert.equal(frames[3].payload.mapTokens[0].rotation,135);
 assert.equal(frames[3].payload.mapTokens[0].size,60);
 assert.equal(frames[3].payload.mapTokens[0].locked,true);
 assert.equal(frames[3].payload.mapDrawings[0].rotation,90);
 assert.equal(frames[3].payload.mapDrawings[0].pinned,true);
 assert.deepEqual(frames[4].payload.mapObjectOrder,[
  {family:'poi',id:'visible-poi'},
  {family:'token',id:'visible-token'},
  {family:'drawing',id:'visible-drawing'},
 ]);
 assert.equal(frames[4].payload.mapTokens.some(t=>t.id==='hidden-token'),false);
 assert.equal(frames[4].payload.mapDrawings.some(d=>d.id==='hidden-drawing'),false);
 const delivered=await guest.evaluate(()=>JSON.stringify([window.snapshotFrames,window.deltaFrames]));
 assert.doesNotMatch(delivered,/TOP SECRET TOKEN|SECRET DRAWING|SECRET-POI-NOTE|SECRET POI|gmNotes|PRIVATE NEVER SEND|SECRET TWO/);
 assert.deepEqual(await guest.evaluate(()=>window.errors),[]);
 revoked.add(guestToken);
 await Promise.all([
  guest.waitForFunction(()=>!window.probe.connected,null,{timeout:10000}),
  host.waitForFunction(()=>window.gameSource.peerCount===0,null,{timeout:10000}),
 ]);
 assert.equal(await guest.evaluate(()=>window.receiver.status),'closed');
 await host.evaluate(({gm})=>{
  window.gameSource.commit({authenticatedGmUserId:gm,event:'active_scene_map_patch',payload:{gmNotes:'forbidden'}});
 },{gm});
 assert.equal(await guest.evaluate(()=>window.deltaFrames.length),5);
 await Promise.all([gmContext.close(),playerContext.close()]);
 console.log('BROWSER_ORIGINAL_MAP_REVISION_SUCCESS: real Chromium WebRTC, original map visibility, fog exploration, lighting, layer order, revocation');
}finally{
 if(browser)await browser.close();
 if(gateway)gateway.close();
 if(server)await new Promise(resolve=>server.close(resolve));
 rmSync(temp,{recursive:true,force:true});
}
