import assert from 'node:assert/strict';
import {createServer} from 'node:https';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {createSignalingWebSocketGateway} from '../../aruba-api/src/signaling-websocket-gateway.mjs';
import {createTurnCredentialService,parseTurnSharedSecret} from '../../aruba-api/src/turn-credential-service.mjs';

const campaign='00000000-0000-4000-8000-000000000001';
const gm='00000000-0000-4000-8000-000000000002';
const player='00000000-0000-4000-8000-000000000003';
const gmToken='A'.repeat(43),playerToken='B'.repeat(43);
const turnHost=process.env.TURN_TEST_HOST;
if(!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(turnHost??''))throw Error('TURN CI bridge IP required');
const secret=parseTurnSharedSecret(readFileSync(process.env.TURN_TEST_SECRET_FILE));
const source=fileURLToPath(new URL('../src/ArubaWebRtcSignalingClient.mjs',import.meta.url));
const temp=mkdtempSync(join(tmpdir(),'hg-relay-only-browser-'));
let server,gateway,browser;
const closeServer=()=>new Promise(resolve=>server.close(resolve));
try{
 // Disposable loopback TLS only; neither the VPS nor real accounts are used.
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes',
  '-keyout',join(temp,'key.pem'),'-out',join(temp,'cert.pem'),
  '-days','1','-subj','/CN=localhost',
  '-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{stdio:'ignore'});
 const identity={async verify({sessionToken,campaignId,connectionRole}){
  if(campaignId!==campaign)throw Error('Invalid campaign');
  if(connectionRole==='host'&&sessionToken===gmToken)
   return {userId:gm,campaignId,role:'gm'};
  if(connectionRole==='player'&&sessionToken===playerToken)
   return {userId:player,campaignId,role:'player'};
  throw Error('Invalid membership');
 }};
 const credentials=createTurnCredentialService({identity,sharedSecret:secret,
  urls:[`turn:${turnHost}:3478?transport=udp`],ttlSeconds:300});
 server=createServer({key:readFileSync(join(temp,'key.pem')),
  cert:readFileSync(join(temp,'cert.pem'))},(req,res)=>{
  if(req.url==='/vtt/ice-credentials'&&req.method==='POST'){
   const json=(status,value)=>{res.writeHead(status,{'content-type':'application/json',
    'cache-control':'no-store'});res.end(JSON.stringify(value));};
   (async()=>{
    try{
     const origin='https://127.0.0.1:'+server.address().port;
     if(req.headers.origin!==origin)return json(403,{error:'Forbidden'});
     const matches=(req.headers.cookie??'').split(';').map(x=>x.trim())
      .filter(x=>x.startsWith('__Host-hg_session='));
     if(matches.length!==1)return json(401,{error:'Unauthorized'});
     let body='';for await(const chunk of req){
      body+=chunk;if(body.length>2048)throw Error('Too large');
     }
     const input=JSON.parse(body);
     if(!input||Object.keys(input).sort().join(',')!=='campaignId,role')
      return json(400,{error:'Invalid'});
     const output=await credentials.issue({
      sessionToken:matches[0].slice('__Host-hg_session='.length),
      campaignId:input.campaignId,connectionRole:input.role,
     });
     return json(200,output);
    }catch{return json(403,{error:'Denied'});}
   })().catch(()=>{if(!res.writableEnded)json(403,{error:'Denied'});});
   return;
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

 gateway=createSignalingWebSocketGateway({server,origin,identity});
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--ignore-certificate-errors']});
 const gmContext=await browser.newContext({ignoreHTTPSErrors:true});
 const playerContext=await browser.newContext({ignoreHTTPSErrors:true});
 await gmContext.addCookies([{name:'__Host-hg_session',value:gmToken,url:origin}]);
 await playerContext.addCookies([{name:'__Host-hg_session',value:playerToken,url:origin}]);
 const host=await gmContext.newPage(),guest=await playerContext.newPage();
 await Promise.all([host.goto(origin),guest.goto(origin)]);
 const connect=async(page,role)=>{
  await page.evaluate(async({campaign,role,origin})=>{
   const {createArubaWebRtcSignalingClient}=await import('/client.mjs');
   window.probeStates=[];
   window.probe=createArubaWebRtcSignalingClient({
    campaignId:campaign,role,origin,WebSocketCtor:WebSocket,
    PeerConnectionCtor:RTCPeerConnection,rtcConfig:{iceServers:[]},
    onState:value=>window.probeStates.push(value),
    onError:error=>window.probeStates.push({state:'error',detail:String(error)}),
   });
   await window.probe.connectWithTurn(window.fetch.bind(window),{iceTransportPolicy:'relay'});
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
 const stats=await Promise.all([
  host.evaluate(()=>window.probe.inspectConnections()),
  guest.evaluate(()=>window.probe.inspectConnections()),
 ]);
 assert.equal(stats[0].length,1);
 assert.equal(stats[1].length,1);
 for(const entries of stats){
  assert.equal(entries[0].connectionState,'connected');
  assert.equal(entries[0].route,'relay','Connection must use actual coturn, not direct ICE');
  assert.doesNotMatch(JSON.stringify(entries),/candidate:|\.local|192\.168\.|10\.0\./);
 }
 const states=await Promise.all([host.evaluate(()=>window.probeStates),guest.evaluate(()=>window.probeStates)]);
 assert.equal(states.flat().some(x=>x.state==='error'),false);
 await Promise.all([host.evaluate(()=>window.probe.disconnect()),guest.evaluate(()=>window.probe.disconnect())]);
 await Promise.all([gmContext.close(),playerContext.close(),ctx.close()]);
 console.log('BROWSER_RELAY_ONLY_SUCCESS: two Chromium contexts, real TURN relay, no gameplay payload');
}finally{
 if(browser)await browser.close();
 if(gateway)gateway.close();
 if(server)await closeServer();
 rmSync(temp,{recursive:true,force:true});
}
