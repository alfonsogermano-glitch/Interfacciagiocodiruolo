// Real Chromium + shipping Vite pilot + real HTTP handlers + disposable PostgreSQL.
// Three isolated browser contexts use deterministic QA session identities backed by
// real hollowgate_auth.users rows and real campaign memberships. No Supabase or
// staging service is contacted.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';
import {createServer as createViteServer} from 'vite';
import pg from '../../aruba-api/node_modules/pg/lib/index.js';
import {createApp} from '../../aruba-api/src/app.mjs';
import {createAuthHttpHandler} from '../../aruba-api/src/auth-http.mjs';
import {createCampaignService} from '../../aruba-api/src/campaign-service.mjs';
import {createCampaignRosterService} from '../../aruba-api/src/campaign-roster-service.mjs';
import {createCharacterService} from '../../aruba-api/src/character-service.mjs';
import {createCharacterAvailabilityService} from '../../aruba-api/src/character-availability-service.mjs';
import {createCharacterAssignmentService} from '../../aruba-api/src/character-assignment-service.mjs';
import {createPlayerCharacterService} from '../../aruba-api/src/player-character-service.mjs';
import {createCharacterClaimService} from '../../aruba-api/src/character-claim-service.mjs';
import {createCharacterPortraitService} from '../../aruba-api/src/character-portrait-service.mjs';
import {createVisualAssetService} from '../../aruba-api/src/visual-asset-service.mjs';
import {listPlayerVisualAssets} from '../src/client.mjs';

const {Client,Pool}=pg;
const gmId=crypto.randomUUID(),playerId=crypto.randomUUID(),rivalId=crypto.randomUUID();
const gmToken='G'.repeat(43),playerToken='P'.repeat(43),rivalToken='R'.repeat(43);
const ORIGIN='https://staging.hollowgate.quest';
const TOKENS=new Map([[gmToken,{id:gmId,email:'qa-claim-gm@example.invalid',displayName:'GM Chromium',role:'standard'}],
 [playerToken,{id:playerId,email:'qa-claim-player@example.invalid',displayName:'Giocatore Chromium',role:'standard'}],
 [rivalToken,{id:rivalId,email:'qa-claim-rival@example.invalid',displayName:'Rivale Chromium',role:'standard'}]]);
const admin=new Client({host:'127.0.0.1',port:15432,user:'postgres',password:'ci-only-password',database:'hollowgate_test'});
const monitor=new Client({host:'127.0.0.1',port:15432,user:'postgres',password:'ci-only-password',database:'hollowgate_test'});
const pgPool=new Pool({host:'127.0.0.1',port:15432,user:'postgres',password:'ci-only-password',database:'hollowgate_test',max:8});
const pool={async query(sql,args){
 const client=await pgPool.connect();
 try{await client.query('SET ROLE hollowgate_api_runtime');return await client.query(sql,args);}
 finally{client.release();}
}};
let api,vite,browser;
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR4nGP8z8DAwMDAxMDAwAAAHgAB9HFkzgAAAABJRU5ErkJggg==','base64');
const frameData='data:image/png;base64,'+png.toString('base64');
const sheet={style:'Jock',viaggio:'Campione',description:'PG reclamabile',ambiti:{Fisico:2,Scuola:1,Carisma:1,Strada:1},abilita:{},tratti:[],equipment:[],conditions:[],turbe:[],notes:''};
try{
 await admin.connect();await monitor.connect();
 for(const [id,label] of [[gmId,'gm'],[playerId,'player'],[rivalId,'rival']])
  await admin.query(`INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source)
   VALUES($1,$2,$3,'active',now(),'local')`,[id,`qa-claim-${label}-${id}@example.invalid`,label]);
 const campaigns=createCampaignService({pool});
 const campaignRoster=createCampaignRosterService({pool});
 const characters=createCharacterService({pool});
 const characterAvailability=createCharacterAvailabilityService({pool});
 const characterAssignments=createCharacterAssignmentService({pool});
 const playerCharacters=createPlayerCharacterService({pool});
 const characterClaims=createCharacterClaimService({pool});
 const characterPortraits=createCharacterPortraitService({pool});
 const visualAssets=createVisualAssetService({pool});
 const campaign=(await campaigns.create(gmId,{name:'Claim Chromium reale',description:'PostgreSQL Chromium',ruleset:'hsc'})).campaign;
 const character=(await characters.create(gmId,campaign.id,{name:'Mara Claim Reale'})).character;
 const characterId=character.id;
 await characters.save(gmId,campaign.id,characterId,{campaignId:campaign.id,name:character.name,sheetData:sheet});
 await characterAvailability.set(gmId,campaign.id,characterId,true);
 const frameId=crypto.randomUUID();
 await visualAssets.save(gmId,campaign.id,{id:frameId,campaignId:campaign.id,name:'Cornice Claim Chromium',type:'portrait-frame',imageDataUrl:frameData,thumbnailDataUrl:frameData});
 for(const id of [playerId,rivalId])
  await admin.query('SELECT hollowgate_vtt.set_campaign_membership($1,$2,$3,$4,true)',[gmId,campaign.id,id,'player']);
 const claimState=async()=>{
  const claims=await admin.query('SELECT player_id::text AS player_id FROM hollowgate_vtt.character_claims WHERE character_id=$1',[characterId]);
  const assignments=await admin.query('SELECT player_id::text AS player_id FROM hollowgate_vtt.character_player_assignments WHERE character_id=$1',[characterId]);
  return {claims:claims.rows.map(row=>row.player_id),assignments:assignments.rows.map(row=>row.player_id)};
 };
 const characterName=async()=>(await admin.query('SELECT name FROM hollowgate_vtt.character_drafts WHERE id=$1',[characterId])).rows[0]?.name;

 api=createApp({checkDatabase:()=>pool.query('SELECT 1'),authHandler:createAuthHttpHandler({
  origin:ORIGIN,login:async()=>{throw Error('Login prohibited')},revokeSession:async()=>{},
  getSessionUser:async token=>TOKENS.get(token)??null,
  campaigns,campaignRoster,characters,characterAvailability,characterAssignments,
  playerCharacters,characterClaims,characterPortraits,visualAssets,
 })});
 api.listen(0,'127.0.0.1');await once(api,'listening');
 const target=`http://127.0.0.1:${api.address().port}`;
 const identities={
  gm:{token:gmToken},player:{token:playerToken},rival:{token:rivalToken},
 };
 const apiProxy=()=>({target,configure(proxy){proxy.on('proxyReq',request=>{
  const identity=identities[request.getHeader('x-qa-identity')]??identities.gm;
  request.setHeader('cookie','__Host-hg_session='+identity.token);
  request.setHeader('origin',ORIGIN);
  request.removeHeader('x-qa-identity');
 });}});
 vite=await createViteServer({configFile:fileURLToPath(new URL('../vite.config.mjs',import.meta.url)),
  server:{host:'127.0.0.1',port:4179,strictPort:true,proxy:{
   '/vtt/bootstrap':apiProxy(),'/vtt/campaigns':apiProxy(),'/vtt/player-campaigns':apiProxy(),
   '/vtt/characters':apiProxy(),'/vtt/character-availability':apiProxy(),'/vtt/character-assignments':apiProxy(),
   '/vtt/player-characters':apiProxy(),'/vtt/player-character-claims':apiProxy(),
   '/vtt/player-character-claim':apiProxy(),'/vtt/owned-character-claims':apiProxy(),
   '/vtt/character-portrait':apiProxy(),'/vtt/character-portrait-source':apiProxy(),
  }}});
 await vite.listen();
 const localChromium=join(process.env.LOCALAPPDATA??'','ms-playwright','chromium-1228','chrome-win64','chrome.exe');
 const executablePath=process.env.HG_CHROMIUM_PATH??(existsSync(localChromium)?localChromium:undefined);
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-extensions','--no-first-run'],...(executablePath?{executablePath}:{})});
 const gmContext=await browser.newContext({viewport:{width:1440,height:900}});
 const playerContext=await browser.newContext({viewport:{width:390,height:844}});
 const rivalContext=await browser.newContext({viewport:{width:390,height:844}});
 await gmContext.setExtraHTTPHeaders({'x-qa-identity':'gm'});
 await playerContext.setExtraHTTPHeaders({'x-qa-identity':'player'});
 await rivalContext.setExtraHTTPHeaders({'x-qa-identity':'rival'});
 const gm=await gmContext.newPage(),player=await playerContext.newPage(),rival=await rivalContext.newPage();
 const errors=[];
 gm.on('pageerror',error=>errors.push('gm:'+error.message));
 player.on('pageerror',error=>errors.push('player:'+error.message));
 rival.on('pageerror',error=>errors.push('rival:'+error.message));
 const base='http://127.0.0.1:4179/vtt/';
 await Promise.all([gm.goto(base,{waitUntil:'domcontentloaded'}),player.goto(base,{waitUntil:'domcontentloaded'}),rival.goto(base,{waitUntil:'domcontentloaded'})]);
 const enter=async page=>{
  await page.getByRole('button',{name:'Campagne',exact:true}).click();
  await page.getByRole('button',{name:/Claim Chromium reale[\s\S]*Creata il/}).click();
  await page.getByRole('button',{name:'Entra nella campagna'}).click();
  await page.locator('[data-aruba-campaign-home]').waitFor();
 };
 await Promise.all([enter(gm),enter(player),enter(rival)]);
 const transport=identity=>async(path,options={})=>{
  const headers={...options.headers,cookie:'__Host-hg_session='+identity};
  if(options.method&&options.method!=='GET'&&!headers.origin)headers.origin=ORIGIN;
  return fetch(target+path,{...options,headers});
 };
 const playerFetch=transport(playerToken),rivalFetch=transport(rivalToken),gmFetch=transport(gmToken);
 const playerBootstrap=await (await playerFetch('/vtt/bootstrap')).json();
 assert.equal(playerBootstrap.capabilities.characterClaims.read,true);
 assert.equal(playerBootstrap.capabilities.playerCharacters.read,true);
 assert.equal(playerBootstrap.capabilities.characterPortraits.read,true);
 assert.equal((await playerFetch('/vtt/player-characters/'+characterId+'/claim',{
  method:'POST',headers:{origin:'https://evil.invalid'}})).status,403);
 assert.equal((await playerFetch('/vtt/player-characters/'+characterId+'/claim',{
  method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,400);

 // First claim through the shipping player UI.
 const playerHome=player.locator('[data-aruba-campaign-home]');
 await playerHome.getByRole('button',{name:'Precompilati'}).click();
 const firstClaim=player.waitForResponse(response=>response.request().method()==='POST'&&
  response.url().endsWith(`/vtt/player-characters/${characterId}/claim`));
 await playerHome.getByRole('button',{name:'Richiedi'}).click();
 assert.equal((await firstClaim).status(),200);
 await playerHome.getByRole('button',{name:'Personaggi'}).click();
 await playerHome.getByText('Mara Claim Reale',{exact:true}).waitFor();
 assert.deepEqual(await claimState(),{claims:[playerId],assignments:[playerId]});

 // GM sees the exact claim grouped under the real player membership.
 await gm.getByRole('button',{name:'Campagne',exact:true}).click();
 await gm.getByRole('button',{name:'Schede',exact:true}).click();
 await gm.getByText('Reclamato dal giocatore · gestione assegnazione bloccata',{exact:true}).waitFor({timeout:10000}).catch(async()=>{
  throw new Error('GM claim grouping missing: '+(await gm.locator('body').innerText()).slice(-2500));
 });
 assert.equal(await gm.locator(`[data-campaign-member-id="${playerId}"] [data-campaign-character-id="${characterId}"]`).count(),1);

 // Claimed player edits through the original detail; PostgreSQL persists it.
 await player.getByLabel('Personaggi',{exact:true}).click();
 const panel=player.getByRole('region',{name:'I miei personaggi assegnati'});
 await panel.getByText('Mara Claim Reale',{exact:true}).click();
 const detail=player.getByRole('region',{name:'Scheda di Mara Claim Reale'});
 const nameInput=detail.locator('input[type="text"]').first();
 assert.equal(await nameInput.isDisabled(),false);
 const firstSave=player.waitForResponse(response=>response.request().method()==='PUT'&&
  response.url().endsWith(`/vtt/player-characters/${characterId}`));
 await nameInput.fill('Mara Modificata Reale');
 assert.equal((await firstSave).status(),200);
 assert.equal(await characterName(),'Mara Modificata Reale');

 // Claimed player may update the cropped portrait binary.
 const portraitPath=`/vtt/character-portrait/${characterId}?campaignId=${campaign.id}`;
 const portraitBody={campaignId:campaign.id,mimeType:'image/png',dataBase64:png.toString('base64')};
 assert.equal((await playerFetch(portraitPath,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(portraitBody)})).status,200);

 // Player-scoped visual asset reads follow the current assignment and sheet refs.
 const framedSheet=await playerFetch('/vtt/player-characters/'+characterId,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({
  campaignId:campaign.id,name:'Mara Modificata Reale',
  sheetData:{...sheet,portraitFrameAssetId:frameId,portraitImageUrl:portraitPath},
 })});
 assert.equal(framedSheet.status,200);
 const claimedAssets=await listPlayerVisualAssets(playerFetch,campaign.id);
 assert.ok(claimedAssets.some(asset=>asset.id===frameId),'Claimed player must read the referenced frame asset');
 assert.equal((await playerFetch(`/vtt/campaigns/${campaign.id}/visual-assets/${frameId}/content`)).status,200);

 // Release through the panel; PostgreSQL returns the character to the GM.
 await player.getByRole('button',{name:'Torna ai personaggi'}).click();
 const release=player.waitForResponse(response=>response.request().method()==='POST'&&
  response.url().endsWith(`/vtt/player-characters/${characterId}/release`));
 await panel.getByRole('button',{name:'Rilascia al GM'}).click();
 assert.equal((await release).status(),200);
 await panel.getByText('Nessun personaggio assegnato in questa campagna.').waitFor();
 assert.deepEqual(await claimState(),{claims:[],assignments:[]});
 assert.equal((await playerFetch(portraitPath,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(portraitBody)})).status,404);
 assert.equal((await gmFetch(portraitPath,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(portraitBody)})).status,200);
 assert.deepEqual(await listPlayerVisualAssets(playerFetch,campaign.id),[]);
 assert.equal((await playerFetch(`/vtt/campaigns/${campaign.id}/visual-assets/${frameId}/content`)).status,404);

 // GM sees the edited name and no stale claim grouping.
 await gm.getByRole('button',{name:'Campagne',exact:true}).click();
 await gm.getByRole('button',{name:/Claim Chromium reale[\s\S]*Creata il/}).click();
 await gm.getByRole('button',{name:'Entra nella campagna'}).click();
 await gm.getByRole('button',{name:'Campagne',exact:true}).click();
 await gm.getByRole('button',{name:'Schede',exact:true}).click();
 await gm.getByText('Mara Modificata Reale',{exact:true}).waitFor();
 assert.equal(await gm.getByText('Reclamato dal giocatore · gestione assegnazione bloccata',{exact:true}).count(),0);

 // Re-enter both player homes, then race two real HTTP claims while PostgreSQL
 // holds the character row. Both requests must reach the database and wait.
 const reenter=async page=>{
  await page.getByRole('button',{name:'Campagne',exact:true}).click();
  await page.getByRole('button',{name:/Claim Chromium reale[\s\S]*Creata il/}).click();
  await page.getByRole('button',{name:'Entra nella campagna'}).click();
  await page.locator('[data-aruba-campaign-home]').waitFor();
 };
 await Promise.all([reenter(player),reenter(rival)]);
 const openPremades=async page=>{
  const home=page.locator('[data-aruba-campaign-home]');
  await home.getByRole('button',{name:'Precompilati'}).click();
  await home.getByRole('button',{name:'Richiedi'}).waitFor();
  return home;
 };
 const [playerRaceHome,rivalRaceHome]=await Promise.all([openPremades(player),openPremades(rival)]);
 await admin.query('BEGIN');
 await admin.query('SELECT 1 FROM hollowgate_vtt.character_drafts WHERE id=$1 FOR UPDATE',[characterId]);
 const playerRace=player.waitForResponse(response=>response.request().method()==='POST'&&
  response.url().endsWith(`/vtt/player-characters/${characterId}/claim`));
 const rivalRace=rival.waitForResponse(response=>response.request().method()==='POST'&&
  response.url().endsWith(`/vtt/player-characters/${characterId}/claim`));
 const clicks=Promise.all([
  playerRaceHome.getByRole('button',{name:'Richiedi'}).click(),
  rivalRaceHome.getByRole('button',{name:'Richiedi'}).click(),
 ]);
 await clicks;
 let blocked=0;
 for(let attempt=0;attempt<80;attempt++){
  const result=await monitor.query(`SELECT count(*)::int AS blocked FROM pg_stat_activity
   WHERE datname=current_database() AND wait_event_type='Lock'
    AND query ILIKE '%claim_available_character%'`);
  blocked=result.rows[0]?.blocked??0;
  if(blocked>=2)break;
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 assert.equal(blocked,2,'Both browser claims must contend on the PostgreSQL character row');
 await admin.query('COMMIT');
 const [playerRaceResponse,rivalRaceResponse]=await Promise.all([playerRace,rivalRace]);
 const raceStatuses=[playerRaceResponse.status(),rivalRaceResponse.status()].sort((a,b)=>a-b);
 assert.deepEqual(raceStatuses,[200,409],'Exactly one browser claim must win');
 const winner=playerRaceResponse.status()===200?'player':'rival';
 const winnerId=winner==='player'?playerId:rivalId;
 const loser=winner==='player'?rival:player;
 await loser.getByRole('alert').filter({hasText:'Personaggio non più disponibile'}).waitFor();
 assert.deepEqual(await claimState(),{claims:[winnerId],assignments:[winnerId]});
 const winnerPage=winner==='player'?player:rival;
 const winnerPanel=winnerPage.getByRole('region',{name:'I miei personaggi assegnati'});
 await winnerPage.getByLabel('Personaggi',{exact:true}).click();
 await winnerPage.getByRole('button',{name:'Rilascia al GM'}).click();
 await winnerPanel.getByText('Nessun personaggio assegnato in questa campagna.').waitFor();
 assert.deepEqual(await claimState(),{claims:[],assignments:[]});

 // Reclaim, open the editable detail, then revoke the real membership.
 await reenter(winnerPage);
 const winnerHome=winnerPage.locator('[data-aruba-campaign-home]');
 await winnerHome.getByRole('button',{name:'Precompilati'}).click();
 const reclaim=winnerPage.waitForResponse(response=>response.request().method()==='POST'&&
  response.url().endsWith(`/vtt/player-characters/${characterId}/claim`));
 await winnerHome.getByRole('button',{name:'Richiedi'}).click();
 assert.equal((await reclaim).status(),200);
 await winnerPage.getByLabel('Personaggi',{exact:true}).click();
 await winnerPage.getByRole('region',{name:'I miei personaggi assegnati'}).getByText('Mara Modificata Reale',{exact:true}).click();
 const revokedDetail=winnerPage.getByRole('region',{name:'Scheda di Mara Modificata Reale'});
 const revokedInput=revokedDetail.locator('input[type="text"]').first();
 await revokedDetail.waitFor();
 assert.equal(await revokedInput.isDisabled(),false);
 await admin.query('SELECT hollowgate_vtt.set_campaign_membership($1,$2,$3,$4,false)',[gmId,campaign.id,winnerId,'player']);
 assert.deepEqual(await claimState(),{claims:[],assignments:[]});
 const staleSave=winnerPage.waitForResponse(response=>response.request().method()==='PUT'&&
  response.url().endsWith(`/vtt/player-characters/${characterId}`));
 await revokedInput.fill('Mara Revocata');
 assert.equal((await staleSave).status(),404);
 await winnerPage.getByRole('alert').filter({hasText:/Claim non più valido|non autorizzato/i}).waitFor();
 assert.equal(await characterName(),'Mara Modificata Reale');
 const winnerFetch=winner==='player'?playerFetch:rivalFetch;
 const revokedPortrait=await winnerFetch(portraitPath,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(portraitBody)});
 assert.equal(revokedPortrait.status,404);
 assert.deepEqual(await listPlayerVisualAssets(winnerFetch,campaign.id),[]);
 assert.equal((await winnerFetch(`/vtt/campaigns/${campaign.id}/visual-assets/${frameId}/content`)).status,404);
 const revokedCampaigns=await winnerFetch('/vtt/player-campaigns');
 assert.equal(revokedCampaigns.status,200);
 assert.ok(!(await revokedCampaigns.json()).campaigns.some(item=>item.id===campaign.id));
 await winnerPage.reload({waitUntil:'domcontentloaded'});
 await winnerPage.getByRole('button',{name:'Campagne',exact:true}).click();
 assert.equal(await winnerPage.getByText('Claim Chromium reale',{exact:true}).count(),0);
 assert.deepEqual(errors,[]);
 console.log('BROWSER_CHARACTER_CLAIM_REAL_DB_PASS: Chromium -> Vite -> HTTP -> PostgreSQL; GM + two players, availability, claim, GM grouping, claimed save, portrait, visual assets, release, two-tier lock race (exactly one winner), membership revocation, stale sheet/portrait denial, player asset invalidation.');
}finally{
 if(browser)await browser.close().catch(()=>{});if(vite)await vite.close().catch(()=>{});
 if(api)await new Promise(resolve=>api.close(resolve));
 await pgPool.end().catch(()=>{});await monitor.end().catch(()=>{});await admin.end().catch(()=>{});
}
