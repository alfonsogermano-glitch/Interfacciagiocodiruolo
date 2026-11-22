// Real Chromium + shipping Vite pilot + real HTTP handlers + disposable PostgreSQL.
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
import {createCampaignRosterService} from '../../aruba-api/src/campaign-roster-service.mjs';
import {createCharacterService} from '../../aruba-api/src/character-service.mjs';
import {createCharacterAvailabilityService} from '../../aruba-api/src/character-availability-service.mjs';
import {createChapterService} from '../../aruba-api/src/chapter-service.mjs';
import {createSceneService} from '../../aruba-api/src/scene-service.mjs';
import {createNarrativeContentService} from '../../aruba-api/src/narrative-content-service.mjs';
import {createNarrativeEntityNotesService} from '../../aruba-api/src/narrative-entity-notes-service.mjs';
import {createVisualAssetService} from '../../aruba-api/src/visual-asset-service.mjs';

const {Client}=pg;
const owner=crypto.randomUUID(),token='N'.repeat(43);
const ORIGIN='https://staging.hollowgate.quest';
const admin=new Client({host:'127.0.0.1',port:15432,user:'postgres',password:'ci-only-password',database:'hollowgate_test'});
const runtime=new Client({host:'127.0.0.1',port:15432,user:'postgres',password:'ci-only-password',database:'hollowgate_test'});
let api,vite,browser;
try{
 await admin.connect();await runtime.connect();
 await admin.query(`INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source)
  VALUES($1,$2,'GM Chromium','active',now(),'local')`,[owner,`qa-narrative-browser-${owner}@example.invalid`]);
 await runtime.query('SET ROLE hollowgate_api_runtime');
 const pool={query:(sql,args)=>runtime.query(sql,args)};
 const campaigns=createCampaignService({pool}),chapters=createChapterService({pool});
 const campaignRoster=createCampaignRosterService({pool});
 const characters=createCharacterService({pool});
 const characterAvailability=createCharacterAvailabilityService({pool});
 const scenes=createSceneService({pool,chapters}),narrativeContent=createNarrativeContentService({pool});
 const narrativeEntityNotes=createNarrativeEntityNotesService({pool});
 const visualAssets=createVisualAssetService({pool});
 const campaign=(await campaigns.create(owner,{name:'Browser narrative reale',description:'PostgreSQL Chromium',ruleset:'hsc'})).campaign;
 const chapterId=crypto.randomUUID();
 await chapters.save(owner,campaign.id,{id:chapterId,title:'Capitolo Chromium',description:'Placement reale',notes:'',kind:'standard',isActive:true,
  nextChapterIds:[],mapUrl:null,mapMetadata:{},locationMetadata:{}});
 const portraitFrameId=crypto.randomUUID(),coverFrameId=crypto.randomUUID();
 const frameData='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR4nGP8z8DAwMDAxMDAwAAAHgAB9HFkzgAAAABJRU5ErkJggg==';
 await visualAssets.save(owner,campaign.id,{id:portraitFrameId,campaignId:campaign.id,name:'Cornice Ritratto Chromium',type:'portrait-frame',imageDataUrl:frameData,thumbnailDataUrl:frameData});
 await visualAssets.save(owner,campaign.id,{id:coverFrameId,campaignId:campaign.id,name:'Cornice Cover Chromium',type:'frame',imageDataUrl:frameData,thumbnailDataUrl:frameData});
 const npcId=crypto.randomUUID();
 await narrativeContent.save(owner,campaign.id,'npcs',{id:npcId,campaignId:campaign.id,name:'Custode Chromium',description:'Dettaglio reale'});
 const monsterId=crypto.randomUUID();
 await narrativeContent.save(owner,campaign.id,'monsters',{id:monsterId,campaignId:campaign.id,name:'Bestia Chromium',description:'Mostro reale',
  portraitCrop:{x:3,y:-2,scale:1.2},coverCrop:{x:0,y:0,scale:1}});
 const d20Campaign=(await campaigns.create(owner,{name:'Browser d20 reale',description:'Regolamento d20',ruleset:'dnd5e'})).campaign;
 const d20NpcId=crypto.randomUUID();
 await narrativeContent.save(owner,d20Campaign.id,'npcs',{id:d20NpcId,campaignId:d20Campaign.id,name:'Arconte D20',description:'PNG d20 reale',
  ruleset:'dnd5e',d20Stats:{hp:5,maxHp:12,ac:12,speed:30,str:10,dex:12,con:10,int:14,wis:11,cha:13,challengeRating:'1',creatureType:'umanoide'}});
 api=createApp({checkDatabase:()=>runtime.query('SELECT 1'),authHandler:createAuthHttpHandler({
  origin:ORIGIN,login:async()=>{throw Error('Login prohibited')},revokeSession:async()=>{},
  getSessionUser:async value=>value===token?{id:owner,email:'qa@example.invalid',displayName:'GM Chromium',role:'standard'}:null,
   campaigns,campaignRoster,characters,characterAvailability,chapters,scenes,narrativeContent,narrativeEntityNotes,visualAssets,
 })});
 api.listen(0,'127.0.0.1');await once(api,'listening');
 const apiPort=api.address().port;
 const target=`http://127.0.0.1:${apiPort}`;
 const apiProxy=()=>({target,configure(proxy){proxy.on('proxyReq',request=>{
  request.setHeader('cookie','__Host-hg_session='+token);request.setHeader('origin',ORIGIN);
 });}});
 vite=await createViteServer({configFile:fileURLToPath(new URL('../vite.config.mjs',import.meta.url)),
  server:{host:'127.0.0.1',port:4178,strictPort:true,proxy:{
   '/vtt/bootstrap':apiProxy(),'/vtt/campaigns':apiProxy(),'/vtt/narrative-entity-notes':apiProxy(),
   '/vtt/characters':apiProxy(),'/vtt/character-availability':apiProxy(),'/vtt/character-assignments':apiProxy(),
   [`/vtt/campaigns/${campaign.id}/visual-assets`]:apiProxy(),
  }}});
 await vite.listen();
 const localChromium=join(process.env.LOCALAPPDATA??'','ms-playwright','chromium-1228','chrome-win64','chrome.exe');
 const executablePath=process.env.HG_CHROMIUM_PATH??(existsSync(localChromium)?localChromium:undefined);
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-extensions','--no-first-run'],...(executablePath?{executablePath}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const waitForNarrative=async(campaignId,kind,id,predicate)=>{
  for(let attempt=0;attempt<120;attempt++){
   const item=(await narrativeContent.list(owner,campaignId,kind)).items.find(candidate=>candidate.id===id);
   if(item&&predicate(item))return item;
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw new Error('Timed out waiting for persisted narrative '+kind+' '+id);
 };
 await page.goto('http://127.0.0.1:4178/vtt/',{waitUntil:'domcontentloaded'});
 await page.getByText('Browser narrative reale',{exact:true}).first().waitFor({timeout:10000}).catch(async()=>{
  throw new Error('Campaign not rendered: '+(await page.locator('body').innerText()).slice(0,2000));
 });
 await page.getByText('Browser narrative reale',{exact:true}).first().click();
 await page.getByRole('button',{name:'Entra nella campagna'}).click();
 await page.getByText('Custode Chromium',{exact:true}).first().waitFor({timeout:10000}).catch(async()=>{
  throw new Error('Narrative card not rendered: '+(await page.locator('body').innerText()).slice(0,3000));
 });
 await page.getByText('Custode Chromium',{exact:true}).first().click();
 const roleInput=page.getByPlaceholder('Ruolo');
 await roleInput.fill('Custode del varco reale');
 await page.getByText('Ambito narrativo',{exact:true}).locator('..').locator('select').selectOption(chapterId);
 assert.equal(await page.getByLabel('Luogo').isDisabled(),true, 'Unsupported Aruba environment selector must stay disabled');
 await page.getByRole('button',{name:'Immagine',exact:true}).click();
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR4nGP8z8DAwMDAxMDAwAAAHgAB9HFkzgAAAABJRU5ErkJggg==','base64');
 await page.locator('input[type="file"]').first().setInputFiles({name:'custode.png',mimeType:'image/png',buffer:png});
 await page.locator('[data-image-crop-action="confirm"]').click();
 await page.getByRole('status',{name:''}).filter({hasText:'Salvataggio immagine su Aruba'}).waitFor({state:'hidden',timeout:30000}).catch(()=>{});
 await page.getByText('Cornice portrait',{exact:true}).locator('..').locator('select').selectOption(portraitFrameId);
 await page.getByText('Cornice foto PNG',{exact:true}).locator('..').locator('select').selectOption(coverFrameId);
 const coverAssetSaved=page.waitForResponse(response=>response.request().method()==='PUT'&&
  response.url().endsWith(`/vtt/campaigns/${campaign.id}/visual-assets`)&&response.ok());
 const coverDocumentSaved=page.waitForResponse(response=>response.request().method()==='PUT'&&
  response.url().endsWith(`/vtt/campaigns/${campaign.id}/narrative/npcs`)&&response.ok());
 await page.locator('input[type="file"]').nth(1).setInputFiles({name:'cover.png',mimeType:'image/png',buffer:png});
 await Promise.all([coverAssetSaved,coverDocumentSaved]);
 await page.getByRole('button',{name:'Scheda',exact:true}).click();
 await page.getByRole('button',{name:'Aggiungi tab'}).click();
 await page.getByText('Nuova tab',{exact:true}).first().waitFor();
 await page.getByText('Nuova tab',{exact:true}).first().click();
 const placeholder=page.getByText('Scrivi qui...',{exact:true});
 if(await placeholder.count())await placeholder.click();
 else await page.locator('.ProseMirror').last().click();
 const editor=page.locator('[contenteditable="true"]').last();
 await editor.waitFor({timeout:10000}).catch(async()=>{
  const states=await page.locator('.ProseMirror').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('contenteditable')));
  throw new Error('TipTap editor not editable: '+JSON.stringify(states)+' '+(await page.locator('body').innerText()).slice(-2000));
 });
 await editor.fill('Persistenza Chromium PostgreSQL');
 await page.waitForTimeout(250);
 await page.getByRole('button',{name:/Torna alla sessione/}).click();
 await page.locator('[data-entity-context="narrative-detail"]').waitFor({state:'detached',timeout:10000}).catch(async()=>{
  throw new Error('Narrative detail did not close: '+JSON.stringify((await narrativeContent.list(owner,campaign.id,'npcs')).items)+' '+(await page.locator('body').innerText()).slice(-2500));
 });
 await page.getByText('Custode Chromium',{exact:true}).first().click();
 assert.equal(await page.getByPlaceholder('Ruolo').inputValue(),'Custode del varco reale');
 assert.equal(await page.getByText('Ambito narrativo',{exact:true}).locator('..').locator('select').inputValue(),chapterId);
 await page.getByRole('button',{name:'Immagine',exact:true}).click();
 await page.locator('section[aria-label="Immagini di Custode Chromium"] img').first().waitFor();
 await page.getByRole('button',{name:'Scheda',exact:true}).click();
 await page.getByText('Nuova tab',{exact:true}).first().click();
 await assert.doesNotReject(()=>page.getByText('Persistenza Chromium PostgreSQL',{exact:true}).waitFor());
 const persisted=(await narrativeContent.list(owner,campaign.id,'npcs')).items.find(item=>item.id===npcId);
 if(!persisted?.portraitImageUrl)throw new Error('Narrative portrait not persisted: '+JSON.stringify({persisted,assets:(await visualAssets.list(owner,campaign.id)).items}));
 assert.match(persisted.portraitImageUrl,new RegExp(`^/vtt/campaigns/${campaign.id}/visual-assets/[0-9a-f-]{36}/content$`,'i'));
 assert.match(persisted.portraitSourceImageUrl,new RegExp(`^/vtt/campaigns/${campaign.id}/visual-assets/[0-9a-f-]{36}/content$`,'i'));
 assert.match(persisted.portraitAssetId,/^[0-9a-f-]{36}$/i);
 assert.equal(persisted.chapterId,chapterId);
 assert.equal(persisted.portraitFrameAssetId,portraitFrameId);
 assert.equal(persisted.coverFrameAssetId,coverFrameId);
 assert.match(persisted.coverImageUrl,new RegExp(`^/vtt/campaigns/${campaign.id}/visual-assets/[0-9a-f-]{36}/content$`,'i'));
 assert.equal((await visualAssets.list(owner,campaign.id)).items.length,5);
 await page.getByRole('button',{name:/Torna alla sessione/}).click();
 await page.locator('[data-entity-context="narrative-detail"]').waitFor({state:'detached'});
 await page.getByText('Bestia Chromium',{exact:true}).first().click();
 await page.getByRole('button',{name:'Immagine',exact:true}).click();
 await page.locator('input[type="file"]').first().setInputFiles({name:'bestia.png',mimeType:'image/png',buffer:png});
 await page.locator('[data-image-crop-action="confirm"]').click();
 await page.getByText('Cornice portrait',{exact:true}).locator('..').locator('select').selectOption(portraitFrameId);
 await page.getByText('Cornice foto Mostro',{exact:true}).locator('..').locator('select').selectOption(coverFrameId);
 const monsterCoverAssetSaved=page.waitForResponse(response=>response.request().method()==='PUT'&&
  response.url().endsWith(`/vtt/campaigns/${campaign.id}/visual-assets`)&&response.ok());
 const monsterCoverDocumentSaved=page.waitForResponse(response=>response.request().method()==='PUT'&&
  response.url().endsWith(`/vtt/campaigns/${campaign.id}/narrative/monsters`)&&response.ok());
 await page.locator('input[type="file"]').nth(1).setInputFiles({name:'bestia-cover.png',mimeType:'image/png',buffer:png});
 await Promise.all([monsterCoverAssetSaved,monsterCoverDocumentSaved]);
 // Semantic original fields: cover crop drag, custom trait and custom action.
 const coverImage=page.locator('img[alt="Illustrazione di Bestia Chromium"]');
 await coverImage.waitFor();
 await page.getByText('Salvataggio immagine su Aruba…',{exact:true}).waitFor({state:'hidden',timeout:30000}).catch(()=>{});
 const coverFrame=coverImage.locator('xpath=../..');
 await coverFrame.scrollIntoViewIfNeeded();
 const coverBox=await coverFrame.boundingBox();
 assert.ok(coverBox&&coverBox.width>50&&coverBox.height>20,'Cover editor must be measurable');
 const startX=coverBox.x+coverBox.width/2,startY=coverBox.y+coverBox.height/2;
 await page.mouse.move(startX,startY);
 await page.mouse.down();
 await page.waitForTimeout(100);
 await page.mouse.move(startX+34,startY+22,{steps:8});
 await page.mouse.up();
 await page.getByRole('button',{name:'Scheda',exact:true}).click();
 const customSection=async title=>page.getByRole('heading',{name:title,exact:true}).locator('xpath=../../..');
 const traitSection=await customSection('Tratti personalizzati');
 await traitSection.getByRole('button',{name:'Aggiungi'}).click();
 await traitSection.getByPlaceholder('Nome').fill('Eco Chromium');
 await traitSection.getByPlaceholder('Descrizione').fill('Tratto persistente');
 const actionSection=await customSection('Azioni speciali personalizzate');
 await actionSection.getByRole('button',{name:'Aggiungi'}).click();
 await actionSection.getByPlaceholder('Nome').fill('Fendente Chromium');
 await actionSection.getByPlaceholder('Descrizione').fill('Azione persistente');
 const persistedMonster=await waitForNarrative(campaign.id,'monsters',monsterId,item=>
  (item.customTraits??[]).some(trait=>trait.name==='Eco Chromium'&&trait.description==='Tratto persistente')&&
  (item.customSpecialActions??[]).some(action=>action.name==='Fendente Chromium'&&action.description==='Azione persistente')&&
  item.coverCrop&&(item.coverCrop.x!==0||item.coverCrop.y!==0));
 assert.deepEqual(persistedMonster.portraitCrop,{x:3,y:-2,scale:1.2});
 await page.getByRole('button',{name:/Torna alla sessione/}).click();
 await page.locator('[data-entity-context="narrative-detail"]').waitFor({state:'detached'});
 await page.getByText('Bestia Chromium',{exact:true}).first().click();
 await page.getByRole('button',{name:'Immagine',exact:true}).click();
 await page.locator('section[aria-label="Immagini di Bestia Chromium"] img').first().waitFor();
 await page.getByRole('button',{name:'Scheda',exact:true}).click();
 const reloadedTraits=await customSection('Tratti personalizzati');
 assert.equal(await reloadedTraits.getByPlaceholder('Nome').inputValue(),'Eco Chromium');
 assert.equal(await reloadedTraits.getByPlaceholder('Descrizione').inputValue(),'Tratto persistente');
 const reloadedActions=await customSection('Azioni speciali personalizzate');
 assert.equal(await reloadedActions.getByPlaceholder('Nome').inputValue(),'Fendente Chromium');
 assert.equal(await reloadedActions.getByPlaceholder('Descrizione').inputValue(),'Azione persistente');
 assert.match(persistedMonster.portraitImageUrl,new RegExp(`^/vtt/campaigns/${campaign.id}/visual-assets/[0-9a-f-]{36}/content$`,'i'));
 assert.match(persistedMonster.portraitSourceImageUrl,new RegExp(`^/vtt/campaigns/${campaign.id}/visual-assets/[0-9a-f-]{36}/content$`,'i'));
 assert.match(persistedMonster.portraitAssetId,/^[0-9a-f-]{36}$/i);
 assert.equal(persistedMonster.portraitFrameAssetId,portraitFrameId);
 assert.equal(persistedMonster.coverFrameAssetId,coverFrameId);
 assert.match(persistedMonster.coverImageUrl,new RegExp(`^/vtt/campaigns/${campaign.id}/visual-assets/[0-9a-f-]{36}/content$`,'i'));
 assert.equal((await visualAssets.list(owner,campaign.id)).items.length,8);
 // A real dnd5e campaign proves the original d20 semantic block and its
 // PostgreSQL round-trip instead of the legacy HSC-only stub.
 await page.getByRole('button',{name:/Torna alla sessione/}).click();
 await page.locator('[data-entity-context="narrative-detail"]').waitFor({state:'detached'});
 await page.getByRole('button',{name:'Campagne',exact:true}).click();
 await page.getByText('Browser d20 reale',{exact:true}).first().click();
 await page.getByRole('button',{name:'Entra nella campagna'}).click();
 await page.getByText('Arconte D20',{exact:true}).first().click();
 const d20Heading=page.getByRole('heading',{name:'Statistiche D&D 5e',exact:true});
 await d20Heading.waitFor({timeout:10000}).catch(async()=>{
  throw new Error('D20 block not rendered: '+(await page.locator('body').innerText()).slice(-2500));
 });
 const d20Block=d20Heading.locator('xpath=..');
 await d20Block.getByText('CA',{exact:true}).locator('..').locator('input').fill('17');
 const persistedD20=await waitForNarrative(d20Campaign.id,'npcs',d20NpcId,item=>item.d20Stats?.ac===17);
 assert.equal(persistedD20.d20Stats.hp,5);
 assert.equal(persistedD20.d20Stats.str,10);
 assert.equal(persistedD20.d20Stats.creatureType,'umanoide');
 assert.equal(persistedD20.ruleset,'dnd5e');
 await page.getByRole('button',{name:/Torna alla sessione/}).click();
 await page.locator('[data-entity-context="narrative-detail"]').waitFor({state:'detached'});
 await page.getByText('Arconte D20',{exact:true}).first().click();
 await page.getByRole('heading',{name:'Statistiche D&D 5e',exact:true}).waitFor();
 assert.equal(await page.getByRole('heading',{name:'Statistiche D&D 5e',exact:true}).locator('xpath=..').getByText('CA',{exact:true}).locator('..').locator('input').inputValue(),'17');
 console.log('BROWSER_REAL_DB_NARRATIVE_NOTES_PASS: Chromium -> Vite -> HTTP -> PostgreSQL -> PNG+Monster media + original field + TipTap + d20/custom/crop reload.');
}finally{
 if(browser)await browser.close().catch(()=>{});if(vite)await vite.close().catch(()=>{});
 if(api)await new Promise(resolve=>api.close(resolve));await runtime.end().catch(()=>{});await admin.end().catch(()=>{});
}
