// Real Chromium + shipping Vite pilot + real HTTP handlers + disposable PostgreSQL.
// Proves Scene placement through the original Chapter/Scene content surface.
// Identity alone is a deterministic QA cookie; no production services are contacted.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {createServer as createViteServer} from 'vite';
import pg from '../../aruba-api/node_modules/pg/lib/index.js';
import {createApp} from '../../aruba-api/src/app.mjs';
import {createAuthHttpHandler} from '../../aruba-api/src/auth-http.mjs';
import {createCampaignService} from '../../aruba-api/src/campaign-service.mjs';
import {createChapterService} from '../../aruba-api/src/chapter-service.mjs';
import {createSceneService} from '../../aruba-api/src/scene-service.mjs';
import {createNarrativeContentService} from '../../aruba-api/src/narrative-content-service.mjs';

const {Client}=pg;
const owner=crypto.randomUUID(),token='P'.repeat(43);
const ORIGIN='https://staging.hollowgate.quest';
const admin=new Client({host:'127.0.0.1',port:15432,user:'postgres',password:'ci-only-password',database:'hollowgate_test'});
const runtime=new Client({host:'127.0.0.1',port:15432,user:'postgres',password:'ci-only-password',database:'hollowgate_test'});
let api,vite,browser;
try{
 await admin.connect();await runtime.connect();
 await admin.query(`INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source)
  VALUES($1,$2,'GM Placement','active',now(),'local')`,[owner,`qa-scene-placement-${owner}@example.invalid`]);
 await runtime.query('SET ROLE hollowgate_api_runtime');
 const pool={query:(sql,args)=>runtime.query(sql,args)};
 const campaigns=createCampaignService({pool}),chapters=createChapterService({pool});
 const scenes=createSceneService({pool,chapters}),narrativeContent=createNarrativeContentService({pool});
 const campaign=(await campaigns.create(owner,{name:'Placement Scene reale',description:'PostgreSQL Chromium',ruleset:'hsc'})).campaign;
 const chapterId=crypto.randomUUID();
 await chapters.save(owner,campaign.id,{id:chapterId,title:'Capitolo Placement',description:'Scene reali',notes:'',kind:'standard',isActive:true,
  nextChapterIds:[],mapUrl:null,mapMetadata:{},locationMetadata:{}});
 const sceneId=crypto.randomUUID();
 await scenes.save(owner,campaign.id,{id:sceneId,campaignId:campaign.id,chapterId,title:'Atrio Placement',description:'Scena reale',notes:'',status:'ready',
  environmentId:null,imageUrl:null,sortOrder:0,nextSceneIds:[],mapRegions:[],contextMetadata:{timeOfDay:'',weather:'',lighting:'',condition:''},sourceEnvironment:null});
 const npcId=crypto.randomUUID();
 await narrativeContent.save(owner,campaign.id,'npcs',{id:npcId,campaignId:campaign.id,name:'Custode Placement',description:'PNG senza collocazione'});
 const monsterId=crypto.randomUUID();
 await narrativeContent.save(owner,campaign.id,'monsters',{id:monsterId,campaignId:campaign.id,name:'Bestia Placement',description:'Mostro senza collocazione'});
 api=createApp({checkDatabase:()=>runtime.query('SELECT 1'),authHandler:createAuthHttpHandler({
  origin:ORIGIN,login:async()=>{throw Error('Login prohibited')},revokeSession:async()=>{},
  getSessionUser:async value=>value===token?{id:owner,email:'qa@example.invalid',displayName:'GM Placement',role:'standard'}:null,
  campaigns,chapters,scenes,narrativeContent,
 })});
 api.listen(0,'127.0.0.1');await once(api,'listening');
 const apiPort=api.address().port;
 const target=`http://127.0.0.1:${apiPort}`;
 const apiProxy=()=>({target,configure(proxy){proxy.on('proxyReq',request=>{
  request.setHeader('cookie','__Host-hg_session='+token);request.setHeader('origin',ORIGIN);
 });}});
 vite=await createViteServer({configFile:fileURLToPath(new URL('../vite.config.mjs',import.meta.url)),
  server:{host:'127.0.0.1',port:4177,strictPort:true,proxy:{
   '/vtt/bootstrap':apiProxy(),'/vtt/campaigns':apiProxy(),
  }}});
 await vite.listen();
 const localChromium=join(process.env.LOCALAPPDATA??'','ms-playwright','chromium-1228','chrome-win64','chrome.exe');
 const executablePath=process.env.HG_CHROMIUM_PATH??(existsSync(localChromium)?localChromium:undefined);
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-extensions','--no-first-run'],...(executablePath?{executablePath}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 const openEditor=async()=>{
  await page.getByRole('button',{name:'Campagne',exact:true}).click();
  await page.getByText('Placement Scene reale',{exact:true}).first().click();
  await page.getByRole('button',{name:'Capitoli e Scene',exact:true}).click();
  const editor=page.getByRole('region',{name:'Capitoli e Scene'});
  await editor.waitFor();
  return editor;
 };
 const openSceneContent=async editor=>{
  await editor.getByRole('tab',{name:'Scene'}).click();
  const sceneRegion=editor.getByRole('region',{name:'Scene del capitolo'});
  await sceneRegion.getByRole('button',{name:/^Atrio Placement/}).click();
  await sceneRegion.getByRole('tab',{name:'Contenuti'}).click();
  const sceneContent=sceneRegion.getByRole('region',{name:'Contenuti della scena'});
  await sceneContent.waitFor();
  return sceneContent;
 };
 await page.goto('http://127.0.0.1:4177/vtt/',{waitUntil:'domcontentloaded'});
 await page.getByText('Placement Scene reale',{exact:true}).first().waitFor({timeout:10000});
 let editor=await openEditor();
 let sceneContent=await openSceneContent(editor);
 assert.equal(await sceneContent.getByText('Nessun contenuto assegnato.').first().isVisible(),true);
 const assignment=page.waitForResponse(response=>response.request().method()==='PUT'&&
  response.url().endsWith(`/vtt/campaigns/${campaign.id}/narrative/monsters`)&&response.ok());
 await sceneContent.getByLabel('Aggiungi Mostri').selectOption(monsterId);
 const response=await assignment;
 assert.equal(response.status(),200);
 await sceneContent.getByText('Bestia Placement',{exact:true}).waitFor();
 const placed=(await narrativeContent.list(owner,campaign.id,'monsters')).items.find(item=>item.id===monsterId);
 assert.equal(placed.chapterId,chapterId);
 assert.equal(placed.sceneId,sceneId);
 assert.equal(placed.name,'Bestia Placement');
 assert.deepEqual(errors,[]);
 // A full reload must read the same Scene placement back from PostgreSQL,
 // not from the component's optimistic state.
 await page.reload({waitUntil:'domcontentloaded'});
 await page.getByText('Placement Scene reale',{exact:true}).first().waitFor({timeout:10000});
 editor=await openEditor();
 sceneContent=await openSceneContent(editor);
 await sceneContent.getByText('Bestia Placement',{exact:true}).waitFor();
 const reloaded=(await narrativeContent.list(owner,campaign.id,'monsters')).items.find(item=>item.id===monsterId);
 assert.equal(reloaded.chapterId,chapterId);
 assert.equal(reloaded.sceneId,sceneId);
 // Removing from the Scene returns the entity to Chapter scope, still through
 // the same original surface and PostgreSQL.
 const removal=page.waitForResponse(response=>response.request().method()==='PUT'&&
  response.url().endsWith(`/vtt/campaigns/${campaign.id}/narrative/monsters`)&&response.ok());
 await sceneContent.getByRole('button',{name:'Rimuovi Bestia Placement'}).click();
 await removal;
 await sceneContent.getByRole('button',{name:'Rimuovi Bestia Placement'}).waitFor({state:'detached'});
 const unplaced=(await narrativeContent.list(owner,campaign.id,'monsters')).items.find(item=>item.id===monsterId);
 assert.equal(unplaced.chapterId,chapterId);
 assert.equal(unplaced.sceneId,null);
 assert.deepEqual(errors,[]);
 console.log('BROWSER_SCENE_PLACEMENT_REAL_DB_PASS: Chromium -> Vite -> original Chapter/Scene content -> HTTP -> PostgreSQL; Scene assignment, reload and return-to-Chapter verified.');
}finally{
 if(browser)await browser.close().catch(()=>{});
 if(vite)await vite.close().catch(()=>{});
 if(api)await new Promise(resolve=>api.close(resolve)).catch(()=>{});
 await runtime.end().catch(()=>{});await admin.end().catch(()=>{});
}
