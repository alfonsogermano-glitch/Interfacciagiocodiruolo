import assert from 'node:assert/strict';
import {createServer,get as httpsGet} from 'node:https';
import {readFileSync,mkdtempSync,rmSync,existsSync,writeFileSync} from 'node:fs';
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
const temp=mkdtempSync(join(tmpdir(),'hg-shipping-channel-'));
const entries=['ArubaWebRtcSignalingClient.mjs','ArubaVerifiedGmCampaignChannelBinding.mjs',
 'ArubaVerifiedPlayerCampaignChannelBinding.mjs','ArubaCampaignChannelRuntime.mjs']
 .map(name=>fileURLToPath(new URL('../src/'+name,import.meta.url)));
let server,gateway,browser;
try{
 const combined=join(temp,'shipping-entry.mjs');
 writeFileSync(combined,entries.map((entry,index)=>`export * from ${JSON.stringify(entry.replaceAll('\\','/'))};`).join('\n'));
 await build({entryPoints:[combined],outfile:join(temp,'shipping.js'),bundle:true,format:'esm',platform:'browser',logLevel:'silent'});
 const openssl=process.env.HG_OPENSSL||['openssl','C:\\Program Files\\Git\\usr\\bin\\openssl.exe','C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe']
  .find(candidate=>candidate==='openssl'||existsSync(candidate));
 try{execFileSync(openssl,['version'],{stdio:'ignore'});}catch{
  const fallback=['C:\\Program Files\\Git\\usr\\bin\\openssl.exe','C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe'].find(existsSync);
  if(!fallback)throw new Error('OpenSSL required for disposable browser TLS fixture');
  process.env.HG_OPENSSL=fallback;
 }
 const opensslExecutable=process.env.HG_OPENSSL||openssl;
 execFileSync(opensslExecutable,['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(temp,'key.pem'),
  '-out',join(temp,'cert.pem'),'-days','1','-subj','/CN=localhost',
  '-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{stdio:'ignore'});
 server=createServer({key:readFileSync(join(temp,'key.pem')),cert:readFileSync(join(temp,'cert.pem')),
  minVersion:'TLSv1.2',maxVersion:'TLSv1.2'},(req,res)=>{
  if(req.url==='/shipping.js'){
   res.writeHead(200,{'content-type':'text/javascript','cache-control':'no-store'});res.end(readFileSync(join(temp,'shipping.js')));return;
  }
  res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><title>shipping campaign channel QA</title>');
 });
 server.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const origin='https://127.0.0.1:'+server.address().port,revoked=new Set();
 const identity={async verify({sessionToken,campaignId,connectionRole}){
  if(revoked.has(sessionToken)||campaignId!==campaign)throw Error('Unauthorized');
  if(connectionRole==='host'&&sessionToken===gmToken)return {userId:gm,campaignId,role:'gm'};
  if(connectionRole==='player'&&sessionToken===playerToken)return {userId:player,campaignId,role:'player'};
  throw Error('Unauthorized');
 }};
 gateway=createSignalingWebSocketGateway({server,origin,identity,revalidateIntervalMs:75});
 await new Promise((resolve,reject)=>httpsGet(origin,{rejectUnauthorized:false},response=>{
  response.resume();response.once('end',resolve);
 }).once('error',reject));
 const browserExecutable=process.env.HG_BROWSER_EXECUTABLE||[
  join(process.env.LOCALAPPDATA||'', 'ms-playwright','chromium-1228','chrome-win64','chrome.exe'),
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
 ].find(existsSync);
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--ignore-certificate-errors','--allow-insecure-localhost','--no-proxy-server'],
  ...(browserExecutable?{executablePath:browserExecutable}:{})});
 const gmContext=await browser.newContext({ignoreHTTPSErrors:true});
 const playerContext=await browser.newContext({ignoreHTTPSErrors:true});
 await gmContext.addCookies([{name:'__Host-hg_session',value:gmToken,url:origin}]);
 await playerContext.addCookies([{name:'__Host-hg_session',value:playerToken,url:origin}]);
 const host=await gmContext.newPage(),guest=await playerContext.newPage();await Promise.all([host.goto(origin),guest.goto(origin)]);
 await host.evaluate(async({campaign,gm,origin})=>{
  const {createArubaWebRtcSignalingClient,createVerifiedGmCampaignChannelBinding}=await import('/shipping.js');
  window.states=[];window.errors=[];
  window.binding=createVerifiedGmCampaignChannelBinding({campaignId:campaign,gmUserId:gm,
   authorizePlayerEvent:()=>false,authorizeHostEvent:({event})=>event==='active_scene_change',
   onError:error=>window.errors.push(String(error))});
  window.client=createArubaWebRtcSignalingClient({campaignId:campaign,role:'host',origin,
   WebSocketCtor:WebSocket,PeerConnectionCtor:RTCPeerConnection,rtcConfig:{iceServers:[]},
   onState:value=>window.states.push(value),onError:error=>window.errors.push(String(error)),
   onVerifiedPeer:proof=>window.binding.onVerifiedPeer(proof),
   onPeerRevoked:proof=>window.binding.onPeerRevoked(proof),
   onDataChannel:({peerId,channel})=>window.binding.attachChannel(peerId,channel)});
  window.client.connect();
 },{campaign,gm,origin});
 await host.waitForFunction(()=>window.states.some(x=>x.state==='ready'),null,{timeout:10000});
 await guest.evaluate(async({campaign,player,gm,origin})=>{
  const {createArubaWebRtcSignalingClient,createVerifiedPlayerCampaignChannelBinding,subscribeCampaignChannel}=await import('/shipping.js');
  window.states=[];window.errors=[];window.received=[];window.readiness=[];window.playerBinding=null;
  window.subscription=subscribeCampaignChannel(campaign,{onReady:value=>window.readiness.push(value),
   onBroadcast:{active_scene_change:message=>window.received.push(message.payload)}});
  window.client=createArubaWebRtcSignalingClient({campaignId:campaign,role:'player',origin,
   WebSocketCtor:WebSocket,PeerConnectionCtor:RTCPeerConnection,rtcConfig:{iceServers:[]},
   onState:value=>window.states.push(value),onError:error=>window.errors.push(String(error)),
   onDataChannel:({channel})=>{window.playerBinding?.close();window.playerBinding=createVerifiedPlayerCampaignChannelBinding({
    campaignId:campaign,userId:player,ownerId:gm,channel,onError:error=>window.errors.push(String(error))});}});
  window.client.connect();
 },{campaign,player,gm,origin});
 try{await Promise.all([host.waitForFunction(()=>window.binding.attachedCount===1,null,{timeout:20000}),
  guest.waitForFunction(()=>window.readiness.at(-1)===true,null,{timeout:20000})]);}
 catch(error){throw new Error('Initial shipping channel failed: '+JSON.stringify(await Promise.all([
  host.evaluate(()=>({states:window.states,errors:window.errors,count:window.binding.attachedCount})),
  guest.evaluate(()=>({states:window.states,errors:window.errors,readiness:window.readiness,binding:!!window.playerBinding})),
 ])),{cause:error});}
 await host.evaluate(()=>window.binding.publishHostEvent('active_scene_change',{activeScene:{id:'scene-a'}}));
 await guest.waitForFunction(()=>window.received.length===1,null,{timeout:10000});
 assert.equal(await guest.evaluate(()=>window.received[0].arubaMapRevision),1);
 await host.evaluate(()=>window.binding.publishHostEvent('active_scene_change',{activeScene:{id:'scene-b'}}));
 await guest.waitForFunction(()=>window.received.length===2,null,{timeout:10000});
 assert.deepEqual(await guest.evaluate(()=>window.received.map(x=>[x.activeScene.id,x.arubaMapRevision])),[['scene-a',1],['scene-b',2]]);
 await guest.evaluate(()=>window.client.disconnect());
 await host.waitForFunction(()=>window.binding.attachedCount===0,null,{timeout:10000});
 await guest.evaluate(()=>window.client.connect());
 await Promise.all([host.waitForFunction(()=>window.binding.attachedCount===1,null,{timeout:20000}),
  guest.waitForFunction(()=>window.readiness.at(-1)===true,null,{timeout:20000})]);
 await host.evaluate(()=>window.binding.publishHostEvent('active_scene_change',{activeScene:{id:'scene-c'}}));
 await guest.waitForFunction(()=>window.received.length===3,null,{timeout:10000});
 assert.deepEqual(await guest.evaluate(()=>[window.received[2].activeScene.id,window.received[2].arubaMapRevision]),['scene-c',3]);
 revoked.add(playerToken);
 await Promise.all([guest.waitForFunction(()=>!window.client.connected,null,{timeout:10000}),
  host.waitForFunction(()=>window.binding.attachedCount===0,null,{timeout:10000})]);
 await host.evaluate(()=>window.binding.publishHostEvent('active_scene_change',{activeScene:{id:'forbidden'}}));
 await new Promise(resolve=>setTimeout(resolve,150));
 assert.equal(await guest.evaluate(()=>window.received.length),3);
 assert.deepEqual(await Promise.all([host.evaluate(()=>window.errors),guest.evaluate(()=>window.errors)]),[[],[]]);
 console.log('BROWSER_SHIPPING_CAMPAIGN_CHANNEL_SUCCESS: simultaneous GM/player, revisions, reconnect, revocation');
 await Promise.all([gmContext.close(),playerContext.close()]);
}finally{
 if(browser)await browser.close();if(gateway)gateway.close();
 if(server)await new Promise(resolve=>server.close(resolve));rmSync(temp,{recursive:true,force:true});
}
