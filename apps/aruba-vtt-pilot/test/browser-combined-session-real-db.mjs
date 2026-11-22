// Real Chromium + shipping build + real HTTPS API + real WebSocket signaling
// + disposable PostgreSQL. Two isolated browser contexts authenticate as a real
// campaign owner (GM) and a real active player membership. No Supabase, no
// production account, no mocked /vtt route: the only fixture is the local
// WebRTC constructor, which ignores the TURN relay and uses loopback ICE.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {existsSync,mkdtempSync,readFileSync,rmSync,statSync} from 'node:fs';
import {createServer} from 'node:https';
import {tmpdir} from 'node:os';
import {extname,join,normalize} from 'node:path';
import {chromium} from 'playwright';
import pg from '../../aruba-api/node_modules/pg/lib/index.js';
import {createAuthHttpHandler} from '../../aruba-api/src/auth-http.mjs';
import {createCampaignService} from '../../aruba-api/src/campaign-service.mjs';
import {createCampaignRosterService} from '../../aruba-api/src/campaign-roster-service.mjs';
import {createCampaignDocumentService} from '../../aruba-api/src/campaign-document-service.mjs';
import {createChapterService} from '../../aruba-api/src/chapter-service.mjs';
import {createSceneService} from '../../aruba-api/src/scene-service.mjs';
import {createCharacterService} from '../../aruba-api/src/character-service.mjs';
import {createCharacterAvailabilityService} from '../../aruba-api/src/character-availability-service.mjs';
import {createCharacterAssignmentService} from '../../aruba-api/src/character-assignment-service.mjs';
import {createPlayerCharacterService} from '../../aruba-api/src/player-character-service.mjs';
import {createCharacterPortraitService} from '../../aruba-api/src/character-portrait-service.mjs';
import {createVisualAssetService} from '../../aruba-api/src/visual-asset-service.mjs';
import {createNarrativeContentService} from '../../aruba-api/src/narrative-content-service.mjs';
import {createCampaignChatService} from '../../aruba-api/src/campaign-chat-service.mjs';
import {createGameSessionBootstrap} from '../../aruba-api/src/game-session-bootstrap.mjs';
import {createSignalingIdentityService} from '../../aruba-api/src/signaling-identity-service.mjs';
import {createSignalingWebSocketGateway} from '../../aruba-api/src/signaling-websocket-gateway.mjs';

process.env.NODE_TLS_REJECT_UNAUTHORIZED='0';
const {Client,Pool}=pg;
const gmId=crypto.randomUUID(),playerId=crypto.randomUUID();
const gmToken='G'.repeat(43),playerToken='P'.repeat(43);
const TOKENS=new Map([
 [gmToken,{id:gmId,email:`qa-combined-gm-${gmId}@example.invalid`,displayName:'GM Sessione Reale',role:'standard'}],
 [playerToken,{id:playerId,email:`qa-combined-player-${playerId}@example.invalid`,displayName:'Giocatore Sessione Reale',role:'standard'}],
]);
const dist=join(import.meta.dirname,'../../../deploy/aruba/dist/vtt-pilot');
const temp=mkdtempSync(join(tmpdir(),'hg-combined-session-'));
const admin=new Client({host:'127.0.0.1',port:15432,user:'postgres',password:'ci-only-password',database:'hollowgate_test'});
const monitor=new Client({host:'127.0.0.1',port:15432,user:'postgres',password:'ci-only-password',database:'hollowgate_test'});
const pgPool=new Pool({host:'127.0.0.1',port:15432,user:'postgres',password:'ci-only-password',database:'hollowgate_test',max:8});
const pool={async query(sql,args){
 const client=await pgPool.connect();
 try{await client.query('SET ROLE hollowgate_api_runtime');return await client.query(sql,args);}
 finally{client.release();}
}};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const sheet={style:'Jock',viaggio:'Campione',description:'PG della sessione combinata',ambiti:{Fisico:2,Scuola:1,Carisma:1,Strada:1},abilita:{},tratti:[],equipment:[],conditions:[],turbe:[],notes:''};
let apiHandler=null,server=null,gateway=null,browser=null;

try{
 await admin.connect();await monitor.connect();
 if(!existsSync(join(dist,'index.html')))throw new Error('Pilot build missing: run npm run build in apps/aruba-vtt-pilot');
 for(const [id,label] of [[gmId,'gm'],[playerId,'player']])
  await admin.query(`INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source)
   VALUES($1,$2,$3,'active',now(),'local')`,[id,`qa-combined-${label}-${id}@example.invalid`,label==='gm'?'GM Sessione Reale':'Giocatore Sessione Reale']);

 const campaigns=createCampaignService({pool});
 const campaignRoster=createCampaignRosterService({pool});
 const campaignDocuments=createCampaignDocumentService({pool});
 const chapters=createChapterService({pool});
 const scenes=createSceneService({pool,chapters});
 const characters=createCharacterService({pool});
 const characterAvailability=createCharacterAvailabilityService({pool});
 const characterAssignments=createCharacterAssignmentService({pool});
 const playerCharacters=createPlayerCharacterService({pool});
 const characterPortraits=createCharacterPortraitService({pool});
 const visualAssets=createVisualAssetService({pool});
 const narrativeContent=createNarrativeContentService({pool});
 const campaignChat=createCampaignChatService({pool});

 const campaign=(await campaigns.create(gmId,{name:'Sessione Combinata Reale',description:'PostgreSQL + HTTPS + WebRTC',ruleset:'hsc'})).campaign;
 const chapterId=crypto.randomUUID();
 await chapters.save(gmId,campaign.id,{id:chapterId,title:'Capitolo Sessione Reale',description:'Capitolo reale',notes:'',kind:'standard',isActive:true,
  nextChapterIds:[],mapUrl:null,mapMetadata:{},locationMetadata:{}});
 const sceneId=crypto.randomUUID();
 await scenes.save(gmId,campaign.id,{id:sceneId,campaignId:campaign.id,chapterId,title:'Scena Sessione Reale',description:'Scena pubblicata dal GM',notes:'',status:'ready',
  environmentId:null,imageUrl:null,sortOrder:0,nextSceneIds:[],mapRegions:[],contextMetadata:{timeOfDay:'',weather:'',lighting:'',condition:''},sourceEnvironment:null});
 const character=(await characters.create(gmId,campaign.id,{name:'Mara Sessione Reale'})).character;
 await characters.save(gmId,campaign.id,character.id,{campaignId:campaign.id,name:character.name,sheetData:sheet});
 await characterAvailability.set(gmId,campaign.id,character.id,true);
 await admin.query('SELECT hollowgate_vtt.set_campaign_membership($1,$2,$3,$4,true)',[gmId,campaign.id,playerId,'player']);
 await characterAssignments.set(gmId,campaign.id,character.id,playerId);

 const gameSessionBootstrap=createGameSessionBootstrap({campaigns,playerCharacters,pool});
 const signalingIdentity=createSignalingIdentityService({getSessionUser:async token=>TOKENS.get(token)??null,pool,campaigns});
 const turnCredentials={async issue({sessionToken,campaignId,connectionRole}){
  await signalingIdentity.verify({sessionToken,campaignId,connectionRole});
  return {expiresAt:Math.floor(Date.now()/1000)+300,
   iceServers:[{urls:['turn:127.0.0.1:9?transport=udp'],username:'qa-loopback-only',credential:'qa-loopback-only'}]};
 }};

 const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.json':'application/json'};
 const opensslCandidates=['openssl','C:\\Program Files\\Git\\usr\\bin\\openssl.exe','C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe'];
  const openssl=process.env.HG_OPENSSL??opensslCandidates.find(candidate=>existsSync(candidate))??'openssl';
 if(!openssl)throw new Error('OpenSSL unavailable');
 execFileSync(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(temp,'key.pem'),'-out',join(temp,'cert.pem'),'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{stdio:'ignore'});
 server=createServer({key:readFileSync(join(temp,'key.pem')),cert:readFileSync(join(temp,'cert.pem'))},async (req,res)=>{
  try{
   const pathname=new URL(req.url,'https://localhost').pathname;
   let relative=pathname.replace(/^\/vtt\/?/,'');
   if(!relative||relative==='index.html')relative='index.html';
   const file=normalize(join(dist,relative));
   if(file.startsWith(normalize(dist))&&existsSync(file)&&statSync(file).isFile()){
    res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(readFileSync(file));return;
   }
   if(pathname.startsWith('/vtt/')||pathname.startsWith('/auth/')){
    if(!apiHandler){res.writeHead(503,{'content-type':'application/json'});res.end('{"error":"API non pronta"}');return;}
    return apiHandler(req,res);
   }
   res.writeHead(302,{location:'/vtt/'});res.end();
  }catch(error){
   if(!res.headersSent)res.writeHead(500,{'content-type':'application/json'});
   res.end(JSON.stringify({error:error instanceof Error?error.message:'Server error'}));
  }
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const origin=`https://127.0.0.1:${server.address().port}`,base=origin+'/vtt/';
 apiHandler=createAuthHttpHandler({
  origin,login:async()=>{throw Error('Login prohibited')},revokeSession:async()=>{},
  getSessionUser:async token=>TOKENS.get(token)??null,
   campaigns,campaignRoster,campaignDocuments,campaignChat,chapters,scenes,narrativeContent,characters,characterAvailability,
  characterAssignments,playerCharacters,characterPortraits,visualAssets,
  turnCredentials,gameSessionBootstrap,
 });
 gateway=createSignalingWebSocketGateway({server,origin,identity:signalingIdentity,revalidateIntervalMs:100});

 const localIceFixture=()=>{const Native=window.RTCPeerConnection;window.__qaFrames=[];window.RTCPeerConnection=class extends Native{
  constructor(){super({iceServers:[]});this.addEventListener('datachannel',event=>{event.channel.addEventListener('message',message=>window.__qaFrames.push(['in',message.data]));event.channel.addEventListener('close',()=>window.__qaFrames.push(['close']));});}
  createDataChannel(label,options){const channel=super.createDataChannel(label,options),send=channel.send.bind(channel);channel.send=data=>{window.__qaFrames.push(['out',data]);return send(data);};channel.addEventListener('message',message=>window.__qaFrames.push(['in',message.data]));channel.addEventListener('close',()=>window.__qaFrames.push(['close']));return channel;}
 };};

 const localChromium=join(process.env.LOCALAPPDATA??'','ms-playwright','chromium-1228','chrome-win64','chrome.exe');
 const executable=process.env.HG_BROWSER_EXECUTABLE??(existsSync(localChromium)?localChromium:undefined);
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--ignore-certificate-errors','--allow-insecure-localhost','--no-proxy-server'],...(executable?{executablePath:executable}:{})});
 const gmContext=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:900}});
 const playerContext=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:390,height:844}});
 await Promise.all([gmContext.addInitScript(localIceFixture),playerContext.addInitScript(localIceFixture)]);
 await gmContext.addCookies([{name:'__Host-hg_session',value:gmToken,url:origin,secure:true,sameSite:'Strict'}]);
 await playerContext.addCookies([{name:'__Host-hg_session',value:playerToken,url:origin,secure:true,sameSite:'Strict'}]);
 const gm=await gmContext.newPage(),player=await playerContext.newPage();
 const errors={gm:[],player:[]},playerOwnerRequests=[];
 const playerSignalingSockets=[];
 const trackSignalingSocket=socket=>{
  if(!socket.url().includes('/vtt/signaling'))return;
  const entry={socket,closed:false};
  socket.on('close',()=>{entry.closed=true;});
  playerSignalingSockets.push(entry);
 };
 player.on('websocket',trackSignalingSocket);
 gm.on('pageerror',error=>errors.gm.push(error.message));
 player.on('pageerror',error=>errors.player.push(error.message));
 const captureOwnerRequests=request=>{
  const url=new URL(request.url());
  if(url.pathname.startsWith('/vtt/campaigns/')&&(url.pathname.includes('/documents/')||url.pathname.includes('/roster')||url.pathname.endsWith('/visual-assets')))playerOwnerRequests.push(url.pathname);
  if(url.pathname==='/vtt/characters'||url.pathname.startsWith('/vtt/character-availability')||url.pathname.startsWith('/vtt/character-assignments'))playerOwnerRequests.push(url.pathname);
 };
 player.on('request',captureOwnerRequests);

 const transport=token=>async (path,options={})=>{
  const headers={...options.headers,cookie:'__Host-hg_session='+token};
  if(options.method&&options.method!=='GET'&&!headers.origin)headers.origin=origin;
  return fetch(origin+path,{...options,headers});
 };
 const gmFetch=transport(gmToken),playerFetch=transport(playerToken);
 const enter=async(page,name)=>{
  await page.getByRole('button',{name:'Campagne',exact:true}).click();
  await page.getByRole('button',{name:new RegExp(name+'[\\s\\S]*Creata il')}).click();
  await page.getByRole('button',{name:'Entra nella campagna'}).click();
  await page.locator('[data-aruba-campaign-home]').waitFor();
 };
 const openSession=async(page,role)=>{
  const home=page.locator('[data-aruba-campaign-home]');
  const button=home.getByRole('button',{name:role==='gm'?'Avvia sessione':'Entra nella sessione'});
  await button.waitFor({state:'visible'});
  await button.click();
 };
 const buttonState=async page=>page.evaluate(()=>{const home=document.querySelector('[data-aruba-campaign-home]');const b=[...(home?.querySelectorAll('button')??[])].find(element=>element.textContent?.includes('Apri mappa'));if(!b)return {exists:false};return {exists:true,text:b.textContent.trim(),disabled:b.disabled,visible:!!b.offsetParent};});
 const statusText=async page=>(await page.locator('[role="status"]').allTextContents({timeout:2000}).catch(()=>[])).join(' ');
 const waitSignalingReady=async(page,label,target='ready',timeout=30000)=>{
  const started=Date.now();
  while(Date.now()-started<timeout){
   const state=await statusText(page);
   if(state.includes(target))return state;
   await sleep(250);
  }
  throw new Error(`${label} signaling not ready (${target}): ${await statusText(page)}`);
 };
 const waitMapReady=async(page,label,timeout=45000)=>{
  const started=Date.now();let last='';
  while(Date.now()-started<timeout){
   const state=await statusText(page);
   if(state!==last)last=state;
   const button=await buttonState(page);
   if(button.exists&&button.visible&&!button.disabled)return button;
   await sleep(1000);
  }
  const status=await page.locator('[role="status"]').allTextContents({timeout:5000}).catch(()=>[]);
  const alerts=await page.locator('[role="alert"]').allTextContents({timeout:5000}).catch(()=>[]);
  const buttons=await page.locator('[data-aruba-campaign-home] button').evaluateAll(elements=>elements.map(element=>element.textContent?.trim()).filter(Boolean)).catch(()=>[]);
  const consoleMessages=[];
  page.on('console',message=>{if(message.type()==='error')consoleMessages.push(message.text())});
  throw new Error(`${label} map not ready. status=${JSON.stringify(status)} alerts=${JSON.stringify(alerts)} buttons=${JSON.stringify(buttons)} console=${JSON.stringify(consoleMessages.slice(0,12))}`);
 };
 const openMap=async(page,regionName)=>{
  const home=page.locator('[data-aruba-campaign-home]');
  await home.getByRole('button',{name:'Apri mappa'}).click();
  await page.getByRole('region',{name:regionName}).waitFor({timeout:25000});
 };
 const waitDocument=async predicate=>{
  const started=Date.now();
  let value=null;
  while(Date.now()-started<20000){
   value=(await campaignDocuments.read(gmId,campaign.id,'active-scene')).value;
   if(value&&predicate(value))return value;
   await sleep(100);
  }
  throw new Error('Active scene document not updated: '+JSON.stringify(value));
 };
 const waitFrame=async(page,predicate,timeout=15000)=>{
  const started=Date.now();
  while(Date.now()-started<timeout){
   const frames=await page.evaluate(()=>window.__qaFrames??[]);
   if(frames.some(predicate))return frames;
   await sleep(100);
  }
  throw new Error('Expected DataChannel frame not observed');
 };
 await Promise.all([gm.goto(base,{waitUntil:'domcontentloaded'}),player.goto(base,{waitUntil:'domcontentloaded'})]);
 await Promise.all([gm.getByText('Sessione Combinata Reale',{exact:true}).first().waitFor({timeout:15000}),player.getByText('Sessione Combinata Reale',{exact:true}).first().waitFor({timeout:15000})]);

 // Bootstrap comes from the real authenticated HTTP handler and real PostgreSQL.
 const gmBootstrap=await (await gmFetch('/vtt/bootstrap')).json();
 const playerBootstrap=await (await playerFetch('/vtt/bootstrap')).json();
 assert.equal(gmBootstrap.backend,'aruba-staging');
 assert.equal(playerBootstrap.backend,'aruba-staging');
 assert.equal(gmBootstrap.capabilities.gameSession,true);
 assert.equal(playerBootstrap.capabilities.gameSession,true);
 assert.deepEqual(gmBootstrap.campaignMemberships,[{userId:gmId,campaignId:campaign.id,role:'gm'}]);
 assert.deepEqual(playerBootstrap.campaignMemberships,[{userId:playerId,campaignId:campaign.id,role:'player'}]);
 assert.deepEqual((await (await playerFetch('/vtt/player-campaigns')).json()).campaigns.map(item=>item.id),[campaign.id]);

 await Promise.all([enter(gm,campaign.name),enter(player,campaign.name)]);
 // The GM signaling room must be created before the player upgrades its socket,
 // otherwise the gateway rejects the player upgrade with HTTP 403.
 await openSession(gm,'gm');
 await waitSignalingReady(gm,'gm','ready');
 await openSession(player,'player');
 await waitMapReady(gm,'gm');
 await waitMapReady(player,'player');
 await openMap(gm,'Workspace mappa Aruba');
 await openMap(player,'Workspace mappa giocatore Aruba');

 // The original GM workspace loads real Chapters/Scenes from PostgreSQL.
 await gm.getByText('Capitolo Sessione Reale',{exact:true}).first().waitFor({timeout:15000});
 await gm.getByText('Scena Sessione Reale',{exact:true}).first().waitFor({timeout:15000});
 const chapterPublication=await waitDocument(value=>value.chapterId===chapterId);
 assert.equal(chapterPublication.campaignId,campaign.id);
 assert.equal(chapterPublication.sceneId,'');

 // Publishing the Scene through the original tree persists to PostgreSQL and
 // sends the active-scene publication over the verified DataChannel.
 await gm.getByText('Scena Sessione Reale',{exact:true}).first().click();
 const scenePublication=await waitDocument(value=>value.sceneId===sceneId);
 assert.equal(scenePublication.title,'Scena Sessione Reale');
 assert.equal(scenePublication.chapterTitle,'Capitolo Sessione Reale');
 await waitFrame(player,([direction,data])=>direction==='in'&&String(data).includes('active_scene_change')&&String(data).includes(sceneId));
 assert.equal(await gm.getByRole('region',{name:'Workspace mappa Aruba'}).count(),1);
 assert.equal(await player.getByRole('region',{name:'Workspace mappa giocatore Aruba'}).count(),1);

 // The shipping session rail keeps its original behavior and never closes the
 // verified DataChannel while routing between map panels.
 const exerciseRail=async(page,role)=>{
  const rail=page.getByRole('complementary',{name:'Strumenti sessione'});
  await rail.waitFor({state:'visible'});
  assert.equal(await rail.getByRole('button',{name:'Note'}).isDisabled(),true);
  await rail.getByRole('button',{name:'Schede'}).click();
  if(role==='gm'){
   await page.locator('[data-session-slide-over="true"]').waitFor({state:'visible'});
   await page.keyboard.press('Escape');
   await page.locator('[data-session-slide-over="true"]').waitFor({state:'detached'});
   const chat=rail.getByRole('button',{name:'Chat'});
   assert.equal(await chat.isDisabled(),false);
   await chat.click();
   const composer=page.getByPlaceholder('Scrivi qualcosa...');
   await composer.waitFor({state:'visible'});
   await composer.fill('Messaggio Aruba reale');
   await composer.press('Enter');
   await page.getByText('Messaggio Aruba reale',{exact:true}).waitFor({state:'visible'});
   await page.keyboard.press('Escape');
   await page.locator('[data-session-slide-over="true"]').waitFor({state:'detached'});
   const encounters=rail.getByRole('button',{name:'Incontri'});
   assert.equal(await encounters.isDisabled(),false);
   await encounters.click();
   await page.getByText('Scene & Encounter',{exact:true}).waitFor({state:'visible'});
   await page.keyboard.press('Escape');
   await page.locator('[data-session-slide-over="true"]').waitFor({state:'detached'});
   const combat=rail.getByRole('button',{name:'Combatti'});
   assert.equal(await combat.isDisabled(),false);
   await combat.click();
   await page.getByText('Tracker Combattimento',{exact:true}).waitFor({state:'visible'});
   await page.keyboard.press('Escape');
   await page.locator('[data-session-slide-over="true"]').waitFor({state:'detached'});
  }else{
   await page.getByRole('region',{name:'I miei personaggi assegnati'}).waitFor({state:'visible'});
   await rail.getByRole('button',{name:'Schede'}).click();
   await page.getByRole('region',{name:'I miei personaggi assegnati'}).waitFor({state:'detached'});
  }
 };
 const closesBefore=await Promise.all([gm.evaluate(()=>window.__qaFrames.filter(frame=>frame[0]==='close').length),player.evaluate(()=>window.__qaFrames.filter(frame=>frame[0]==='close').length)]);
 await exerciseRail(gm,'gm');await exerciseRail(player,'player');
 assert.deepEqual(await Promise.all([gm.evaluate(()=>window.__qaFrames.filter(frame=>frame[0]==='close').length),player.evaluate(()=>window.__qaFrames.filter(frame=>frame[0]==='close').length)]),closesBefore);

 // Owner-only HTTP endpoints remain owner-only for the player, despite the
 // global capability advertisement in the bootstrap document.
 const playerDocument=await playerFetch(`/vtt/campaigns/${campaign.id}/documents/active-scene`);
 const playerRoster=await playerFetch(`/vtt/campaigns/${campaign.id}/roster`);
 const playerCharactersResponse=await playerFetch(`/vtt/characters?campaignId=${campaign.id}`);
 const playerAvailability=await playerFetch(`/vtt/character-availability?campaignId=${campaign.id}`);
 const playerAssignments=await playerFetch(`/vtt/character-assignments?campaignId=${campaign.id}`);
 const playerVisualAssets=await playerFetch(`/vtt/campaigns/${campaign.id}/visual-assets`);
 assert.equal(playerDocument.status,404);
 assert.equal(playerRoster.status,404);
 // Availability is intentionally player-readable (never assigns a PG); the
 // owner-only denial applies to campaign documents, roster, assignments and
 // visual assets, not to this per-user availability flag.
 assert.equal(playerAvailability.status,200);
 assert.equal(playerAssignments.status,200);
 assert.equal(playerVisualAssets.status,404);
 assert.equal(playerCharactersResponse.status,200);
 const gmDocument=await (await gmFetch(`/vtt/campaigns/${campaign.id}/documents/active-scene`)).json();
 assert.equal(gmDocument.value.sceneId,sceneId);
 const gmRoster=await (await gmFetch(`/vtt/campaigns/${campaign.id}/roster`)).json();
 assert.deepEqual(gmRoster.members.map(member=>member.userId).sort(),[gmId,playerId].sort());
 assert.deepEqual(playerOwnerRequests,[],'player UI must not request owner-only campaign endpoints');

 // Player refresh: the socket closes, the page reloads from PostgreSQL, and a
 // new real signaling/WebRTC connection receives the persisted active scene.
 const socketsBeforeRefresh=[...playerSignalingSockets];
 assert.ok(socketsBeforeRefresh.length>=1,'player must open a real signaling socket');
 await player.reload({waitUntil:'domcontentloaded'});
 const closedStarted=Date.now();
 while(!socketsBeforeRefresh.every(entry=>entry.closed)){
  if(Date.now()-closedStarted>15000)throw new Error('Signaling socket did not close on refresh');
  await sleep(100);
 }
 await player.getByText('Sessione Combinata Reale',{exact:true}).first().waitFor({timeout:15000});
 const playerBootstrapAfterRefresh=await (await playerFetch('/vtt/bootstrap')).json();
 assert.deepEqual(playerBootstrapAfterRefresh.campaignMemberships,[{userId:playerId,campaignId:campaign.id,role:'player'}]);
 await enter(player,campaign.name);
 await openSession(player,'player');
 await waitMapReady(player,'player');
 await openMap(player,'Workspace mappa giocatore Aruba');
 await waitFrame(player,([direction,data])=>direction==='in'&&String(data).includes('active_scene_change')&&String(data).includes(sceneId),20000);
 assert.equal((await campaignDocuments.read(gmId,campaign.id,'active-scene')).value.sceneId,sceneId);
 assert.equal(await gm.getByRole('region',{name:'Workspace mappa Aruba'}).count(),1,'GM workspace must survive player refresh');

 // Real membership revocation: PostgreSQL is authoritative, the signaling
 // gateway revalidates, and both the player transport and owner-only reads die.
 await admin.query('SELECT hollowgate_vtt.set_campaign_membership($1,$2,$3,$4,false)',[gmId,campaign.id,playerId,'player']);
 await player.getByRole('region',{name:'Workspace mappa giocatore Aruba'}).waitFor({state:'detached',timeout:15000});
 assert.equal(await gm.getByRole('region',{name:'Workspace mappa Aruba'}).count(),1,'GM workspace must survive player revocation');
 const revokedBootstrap=await (await playerFetch('/vtt/bootstrap')).json();
 assert.deepEqual(revokedBootstrap.campaignMemberships,[]);
 const revokedCampaigns=await (await playerFetch('/vtt/player-campaigns')).json();
 assert.deepEqual(revokedCampaigns.campaigns,[]);
 const revokedCharacters=await playerFetch(`/vtt/player-characters?campaignId=${campaign.id}`);
 const revokedCharactersBody=await revokedCharacters.json();
 assert.deepEqual(revokedCharactersBody.characters??[],[],'revoked player must not keep assigned character sheets');
 const revokedDocument=await playerFetch(`/vtt/campaigns/${campaign.id}/documents/active-scene`);
 assert.equal(revokedDocument.status,404);
 assert.equal((await campaignDocuments.read(gmId,campaign.id,'active-scene')).value.sceneId,sceneId);

 assert.deepEqual(errors,{gm:[],player:[]});
 assert.deepEqual(playerOwnerRequests,[],'player UI must never request owner-only campaign endpoints');
 console.log('BROWSER_COMBINED_SESSION_REAL_DB_PASS: Chromium -> HTTPS real API -> PostgreSQL + real signaling/WebRTC; GM/player bootstrap, session entry, map workspace, original Encounter/Combat panels, Chapter/Scene publication, DataChannel active-scene, owner-only denial, player refresh/reconnect and membership revocation verified. TURN relay itself is not claimed: local loopback ICE only.');
 await Promise.all([gmContext.close(),playerContext.close()]);
}finally{
 if(browser)await browser.close().catch(()=>{});
 if(gateway)gateway.close();
 if(server)await new Promise(resolve=>server.close(resolve)).catch(()=>{});
 await pgPool.end().catch(()=>{});await monitor.end().catch(()=>{});await admin.end().catch(()=>{});
 rmSync(temp,{recursive:true,force:true});
}
