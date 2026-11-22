import assert from 'node:assert/strict';
import {createServer} from 'node:https';
import {existsSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {extname,join,normalize} from 'node:path';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import {createSignalingWebSocketGateway} from '../../aruba-api/src/signaling-websocket-gateway.mjs';

const campaignId='33333333-3333-4333-8333-333333333333';
const gmId='11111111-1111-4111-8111-111111111111';
const playerId='22222222-2222-4222-8222-222222222222';
const gmToken='G'.repeat(43),playerToken='P'.repeat(43);
const timestamp='2026-11-16T12:00:00.000Z';
const campaign={id:campaignId,ownerId:gmId,name:'Il Varco Live',description:'Fixture UI shipping verificata',ruleset:'hsc',createdAt:timestamp};
const capabilities={campaigns:{read:true,write:true},campaignInvites:{read:false,write:false},characters:{read:true,write:true},
 chapters:{read:false,write:false},scenes:{read:false,write:false},narrativeContent:{read:false,write:false},equipmentCatalog:{read:false,write:false},
 campaignDocuments:{read:true,write:true},visualAssets:{read:false,write:false},campaignRoster:{read:true,write:false},
 characterAvailability:{read:true,write:true},characterAssignments:{read:true,write:true},playerCharacters:{read:true,write:false},
 characterPortraits:{read:false,write:false},gameSession:true};
const dist=join(import.meta.dirname,'../../../deploy/aruba/dist/vtt-pilot');
const temp=mkdtempSync(join(tmpdir(),'hg-shipping-ui-'));
const screenshots=join(import.meta.dirname,'../../../deploy/aruba/qa/screenshots');
const viewports=[[360,800],[390,844],[768,1024],[1280,720],[1440,900],[1920,1080]];
let server,gateway,browser;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
try{
 const openssl=process.env.HG_OPENSSL||['C:\\Program Files\\Git\\usr\\bin\\openssl.exe','C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe'].find(existsSync);
 if(!openssl)throw new Error('OpenSSL unavailable');
 execFileSync(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(temp,'key.pem'),'-out',join(temp,'cert.pem'),'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{stdio:'ignore'});
 server=createServer({key:readFileSync(join(temp,'key.pem')),cert:readFileSync(join(temp,'cert.pem'))},(req,res)=>{
  const pathname=new URL(req.url,'https://localhost').pathname;
  let relative=pathname.replace(/^\/vtt\/?/,'');if(!relative||relative==='index.html')relative='index.html';
  const file=normalize(join(dist,relative));
  if(file.startsWith(normalize(dist))&&existsSync(file)){
   res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(readFileSync(file));return;
  }
  if(pathname.startsWith('/vtt/')){res.writeHead(404,{'content-type':'application/json'});res.end('{"error":"Endpoint non previsto"}');return;}
  res.writeHead(302,{location:'/vtt/'});res.end();
 });
 server.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const origin=`https://127.0.0.1:${server.address().port}`,base=origin+'/vtt/';
 const revoked=new Set();
 const identity={async verify({sessionToken,campaignId:requested,connectionRole}){
  if(revoked.has(sessionToken)||requested!==campaignId)throw Error('Unauthorized');
  if(sessionToken===gmToken&&connectionRole==='host')return {userId:gmId,campaignId,role:'gm'};
  if(sessionToken===playerToken&&connectionRole==='player')return {userId:playerId,campaignId,role:'player'};
  throw Error('Unauthorized');
 }};
 gateway=createSignalingWebSocketGateway({server,origin,identity,revalidateIntervalMs:100});
 const executable=process.env.HG_BROWSER_EXECUTABLE||join(process.env.LOCALAPPDATA||'','ms-playwright','chromium-1228','chrome-win64','chrome.exe');
 browser=await chromium.launch({headless:true,executablePath:executable,args:['--no-sandbox','--ignore-certificate-errors','--allow-insecure-localhost','--no-proxy-server']});
 const gmContext=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:900}});
 const playerContext=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:390,height:844}});
 const localIceFixture=()=>{const Native=window.RTCPeerConnection;window.__qaFrames=[];window.RTCPeerConnection=class extends Native{
  constructor(){super({iceServers:[]});this.addEventListener('datachannel',event=>{event.channel.addEventListener('message',message=>window.__qaFrames.push(['in',message.data]));event.channel.addEventListener('close',()=>window.__qaFrames.push(['close']));});}
  createDataChannel(label,options){const channel=super.createDataChannel(label,options),send=channel.send.bind(channel);channel.send=data=>{window.__qaFrames.push(['out',data]);return send(data);};channel.addEventListener('message',message=>window.__qaFrames.push(['in',message.data]));channel.addEventListener('close',()=>window.__qaFrames.push(['close']));return channel;}
 };};
 await Promise.all([gmContext.addInitScript(localIceFixture),playerContext.addInitScript(localIceFixture)]);
 await gmContext.addCookies([{name:'__Host-hg_session',value:gmToken,url:origin}]);
 await playerContext.addCookies([{name:'__Host-hg_session',value:playerToken,url:origin}]);
 const errors={gm:[],player:[]},ownerOnlyPlayerRequests=[];
 const installApi=async(context,role)=>context.route('**/vtt/**',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname;
  if(path==='/vtt/'||path==='/vtt/index.html'||path.startsWith('/vtt/assets/')||/\.(?:png|svg|webp|jpg|jpeg|woff2?)$/i.test(path))return route.continue();
  let status=200,payload={};
  if(path==='/vtt/bootstrap')payload={backend:'aruba-staging',user:{id:role==='gm'?gmId:playerId,email:`${role}@example.invalid`,displayName:role==='gm'?'GM Fixture':'Player Fixture',role:'standard'},capabilities:role==='gm'?capabilities:{...capabilities,campaignDocuments:{read:false,write:false}},campaignMemberships:[{userId:role==='gm'?gmId:playerId,campaignId,role:role==='gm'?'gm':'player'}]};
  else if(path==='/vtt/campaigns')payload={campaigns:role==='gm'?[campaign]:[]};
  else if(path==='/vtt/player-campaigns')payload={campaigns:role==='player'?[campaign]:[]};
  else if(path==='/vtt/player-characters')payload={characters:[]};
  else if(path===`/vtt/campaigns/${campaignId}/roster`)payload={members:[{userId:gmId,displayName:'GM Fixture',role:'gm'},{userId:playerId,displayName:'Player Fixture',role:'player'}]};
  else if(path==='/vtt/characters'||path==='/vtt/character-availability')payload={characters:[]};
  else if(path==='/vtt/character-assignments')payload={assignments:[]};
  else if(path==='/vtt/ice-credentials')payload={expiresAt:Math.floor(Date.now()/1000)+300,iceServers:[{urls:['turn:127.0.0.1:9?transport=udp'],username:'fixture',credential:'fixture-only'}]};
  else if(path.includes('/documents/')&&role==='gm')payload=request.method()==='GET'?{value:null}:{ok:true};
  else {if(role==='player'&&(path.includes('/documents/')||path==='/vtt/characters'||path.includes('/roster')))ownerOnlyPlayerRequests.push(path);status=404;payload={error:'Endpoint non previsto'};}
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(payload)});
 });
 await Promise.all([installApi(gmContext,'gm'),installApi(playerContext,'player')]);
 const gm=await gmContext.newPage(),player=await playerContext.newPage();
 gm.on('pageerror',error=>errors.gm.push(error.message));player.on('pageerror',error=>errors.player.push(error.message));
 await Promise.all([gm.goto(base,{waitUntil:'domcontentloaded'}),player.goto(base,{waitUntil:'domcontentloaded'})]);
 const enter=async(page,name)=>{
  await page.getByRole('button',{name:'Campagne',exact:true}).click();
  await page.getByRole('button',{name:new RegExp(name+'[\\s\\S]*Creata il')}).click();
  await page.getByRole('button',{name:'Entra nella campagna'}).click();
  await page.locator('[data-aruba-campaign-home]').waitFor();
 };
 await Promise.all([enter(gm,campaign.name),enter(player,campaign.name)]);
 const gmHome=gm.locator('[data-aruba-campaign-home]'),playerHome=player.locator('[data-aruba-campaign-home]');
 await Promise.all([gmHome.getByRole('button',{name:'Avvia sessione'}).click(),playerHome.getByRole('button',{name:'Entra nella sessione'}).click()]);
 const gmMap=gmHome.getByRole('button',{name:'Apri mappa'}),playerMap=playerHome.getByRole('button',{name:'Apri mappa'});
 await Promise.all([gmMap.waitFor({state:'visible'}),playerMap.waitFor({state:'visible'})]);
 const waitReady=(page,timeout)=>page.waitForFunction(()=>!document.querySelector('[data-aruba-campaign-home] button[disabled][title="Connessione mappa in corso"]'),null,{timeout});
 try{await Promise.all([waitReady(gm,10000),waitReady(player,10000)]);}catch{
  const exit=playerHome.getByRole('button',{name:'Esci dalla sessione'});if(await exit.count())await exit.click();
  await playerHome.getByRole('button',{name:'Entra nella sessione'}).click();
 }
  try{await Promise.all([waitReady(gm,20000),waitReady(player,20000)]);}
  catch(error){throw new Error('UI channel readiness failed: '+JSON.stringify(await Promise.all([
   gm.locator('body').innerText(),player.locator('body').innerText(),
  ])),{cause:error});}
  const exerciseRail=async(page,role,surface)=>{
   const rail=page.getByRole('complementary',{name:'Strumenti sessione'});
   await rail.waitFor({state:'visible'});
   assert.equal(await rail.getByRole('button',{name:'Note'}).isDisabled(),true,`${surface} ${role} Note must remain disabled without backend capability`);
   await rail.getByRole('button',{name:'Schede'}).click();
   if(role==='gm'){
    await page.locator('[data-session-slide-over="true"]').waitFor({state:'visible'});
    await page.keyboard.press('Escape');
    await page.locator('[data-session-slide-over="true"]').waitFor({state:'detached'});
   }else{
    await page.getByRole('region',{name:'I miei personaggi assegnati'}).waitFor({state:'visible'});
    await rail.getByRole('button',{name:'Schede'}).click();
    await page.getByRole('region',{name:'I miei personaggi assegnati'}).waitFor({state:'detached'});
   }
   await rail.getByRole('button',{name:'Dadi'}).click();
   await page.getByLabel('Selezione dadi',{exact:true}).waitFor({state:'visible'});
   await page.getByRole('button',{name:'Chiudi selezione dadi'}).click();
  };
  await exerciseRail(gm,'gm','session');await exerciseRail(player,'player','session');
 const capture=async(page,role,surface)=>{
  for(const [width,height] of viewports){
   await page.setViewportSize({width,height});
   await page.evaluate(()=>{for(const node of document.querySelectorAll('.content,.aruba-campaign-home'))node.scrollTop=0;});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true,`${surface} ${role} ${width}x${height} document overflow`);
   await page.screenshot({path:join(screenshots,`shipping-${surface}-${role}-${width}x${height}.png`),fullPage:true,animations:'disabled'});
  }
 };
 await capture(gm,'gm','session');await capture(player,'player','session');
 await Promise.all([gm.setViewportSize({width:1440,height:900}),player.setViewportSize({width:390,height:844})]);
 await playerMap.click();
 await player.getByRole('region',{name:'Workspace mappa giocatore Aruba'}).waitFor({timeout:20000});
 await gmMap.click();
 try{await Promise.all([gm.getByRole('region',{name:'Workspace mappa Aruba'}).waitFor({timeout:20000}),player.getByRole('region',{name:'Workspace mappa giocatore Aruba'}).waitFor({timeout:20000})]);}
  catch(error){
  const campaignButton=player.getByRole('button',{name:campaign.name,exact:true});
  if(await campaignButton.count()){await campaignButton.first().click();const enterButton=player.getByRole('button',{name:'Entra nella campagna'});if(await enterButton.count())await enterButton.click();}
   throw new Error('UI map navigation failed: '+JSON.stringify(await Promise.all([gm.locator('body').innerText(),player.locator('body').innerText(),gm.evaluate(()=>window.__qaFrames),player.evaluate(()=>window.__qaFrames)])),{cause:error});
  }
  const closesBefore=await Promise.all([gm.evaluate(()=>window.__qaFrames.filter(frame=>frame[0]==='close').length),player.evaluate(()=>window.__qaFrames.filter(frame=>frame[0]==='close').length)]);
  await exerciseRail(gm,'gm','map');await exerciseRail(player,'player','map');
  assert.equal(await gm.getByRole('region',{name:'Workspace mappa Aruba'}).count(),1,'GM map workspace must survive rail routing');
  assert.equal(await player.getByRole('region',{name:'Workspace mappa giocatore Aruba'}).count(),1,'player map workspace must survive rail routing');
  assert.deepEqual(await Promise.all([gm.evaluate(()=>window.__qaFrames.filter(frame=>frame[0]==='close').length),player.evaluate(()=>window.__qaFrames.filter(frame=>frame[0]==='close').length)]),closesBefore,'rail routing must not close the verified DataChannel');
 await capture(gm,'gm','map');await capture(player,'player','map');
 await Promise.all([gm.setViewportSize({width:1440,height:900}),player.setViewportSize({width:390,height:844})]);
 assert.deepEqual(ownerOnlyPlayerRequests,[],'player must not request owner documents or owner endpoints');
 revoked.add(playerToken);
 await player.getByRole('region',{name:'Workspace mappa giocatore Aruba'}).waitFor({state:'detached',timeout:10000});
 assert.equal(await gm.getByRole('region',{name:'Workspace mappa Aruba'}).count(),1,'GM workspace must survive player revocation');
 assert.deepEqual(errors,{gm:[],player:[]});
  console.log('BROWSER_SHIPPING_SESSION_MAP_UI_SUCCESS: entry, ready gate, cross-panel rail, map workspaces, 24 screenshots, revocation');
 await Promise.all([gmContext.close(),playerContext.close()]);
}finally{
 if(browser)await browser.close();if(gateway)gateway.close();if(server)await new Promise(resolve=>server.close(resolve));rmSync(temp,{recursive:true,force:true});
}
