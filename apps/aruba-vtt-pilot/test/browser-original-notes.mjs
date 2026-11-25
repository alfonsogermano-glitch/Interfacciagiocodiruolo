// Browser-level QA of ORIGINAL SessionNotesPanel mounted in Aruba's real
// GM navigation. All API responses are isolated in-memory fixtures: this
// NEVER touches the production VPS, Supabase or real user accounts.
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {compareOriginalSheets} from './sheet-visual-comparison.mjs';

const base=process.env.HG_E2E_BASE??'http://127.0.0.1:4173';
const campaign='b0da2f75-f700-454c-9ba4-65bc0c8838ef';
const user='d4df2562-a83d-4d8d-92d4-e49b19c7810e';
const initialNote='fab34aae-beaf-4bca-9cce-9b497e114b94';
const secondNote='cf317f44-a915-4839-8cd6-9c8c2295599d';
const archivedNote='af3aa8a5-6333-4cbb-b2f1-ecbb394542e6';
const folderId='46fb111f-61b3-4a60-b122-54e8d7689c0e';
const characterId='eeaa5632-f050-4eb4-a0f4-3981443bf19e';
const playerId='2675f0a2-ad43-4f2d-ad01-6cfb9e8919b0';
const recoveredImages=process.env.HG_E2E_RECOVERED_IMAGES==='1';
const sheetParity=process.env.HG_E2E_SHEET_PARITY==='1';
const imageFixture='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRk0AAAAASUVORK5CYII=';
const npcPortrait=`/vtt/campaigns/${campaign}/visual-assets/10000000-0000-4000-8000-000000000002/content`;
const monsterPortrait=`/vtt/campaigns/${campaign}/visual-assets/10000000-0000-4000-8000-000000000003/content`;
const campaignRow={
 id:campaign,ownerId:user,name:'Campagna prova Note',description:'Solo browser test',
 ruleset:'hsc',createdAt:'2026-11-12T00:00:00.000Z',
 logoUrl:`/vtt/campaigns/${campaign}/visual-assets/10000000-0000-4000-8000-000000000001/content`,
};
const capability=(enabled,assignmentsEnabled=false,portraitsEnabled=false)=>({
 backend:'aruba-staging',
 user:{id:user,email:'qa-notes@example.invalid',displayName:'GM di prova',role:'standard'},
 capabilities:{
  campaigns:{read:true,write:true},
  campaignRoster:{read:true,write:false},
  characters:{read:true,write:true},
  characterAvailability:{read:true,write:true},
  characterAssignments:{read:assignmentsEnabled,write:assignmentsEnabled},
   characterPortraits:{read:portraitsEnabled,write:portraitsEnabled},
   ...(sheetParity?{visualAssets:{read:true,write:true}}:{}),
  entityNotes:{read:false,write:false},
  campaignNotes:{read:true,write:true},
  campaignNoteFolders:{read:true,write:true},
   originalNotesPanel:{read:enabled,write:enabled},
   diceFormulas:{read:true,write:true},
   narrativeContent:{read:true,write:true},
   chapters:{read:true,write:true},
   scenes:{read:true,write:true},
  gameSession:false,
 },
});
const send=(route,status,body)=>route.fulfill({
 status,contentType:'application/json; charset=utf-8',
 headers:{'cache-control':'no-store'},body:JSON.stringify(body),
});
function mockApi(page,{enabled=true,authorized=true,assignmentsEnabled=false,portraitsEnabled=false}={}){
  const store={notes:[],trash:[],folders:[],formulas:[],requests:[],next:0,rejectNextCharacterSave:false,
  characterAvailability:new Map([[characterId,assignmentsEnabled]]),
  characterAssignments:new Map(),
  rejectNextAssignment:false,
  portrait:null,
  portraitMime:'image/jpeg',
  portraitSource:null,
  characters:[{id:characterId,campaignId:campaign,ownerId:user,name:'Mara di prova',
   status:'active',sheetData:{
    name:'Mara di prova',style:'Jock',viaggio:'Campione',
    description:'Fixture HSC per il test della scheda originale',
    ambiti:{Fisico:2,Scuola:1,Carisma:1,Strada:1},
    abilita:{Muscoli:1,Sport:1,Acrobatica:1,Resistenza:1,Freddezza:1,
     Cultura:1,Tecnologia:1,Studio:1,'Pronto Soccorso':1,Scienze:1,
     Esibirsi:1,Parlantina:1,Fascino:1,Intuito:1,Leadership:1,
     'Furtività':1,Mira:1,Sopravvivenza:1,Crimine:1,Allerta:1},
    freschezza:12,maxFreschezza:12,caselleFrischezzaCruciali:[8,12],
    follia:9,maxFollia:9,conditions:[],turbe:[],audacia:1,prodigi:1,
    legame:'',tratti:[],equipment:[],notes:'',
   }}]};
  store.narrative={
   npcs:[{id:'40000000-0000-4000-8000-000000000001',campaignId:campaign,name:'Custode prova',description:'PNG di test',
    ...(recoveredImages?{portraitImageUrl:npcPortrait}:{})}],
   monsters:[{id:'40000000-0000-4000-8000-000000000002',campaignId:campaign,name:'Bestia prova',description:'Mostro di test',
    ...(recoveredImages?{portraitImageUrl:monsterPortrait}:{})}],
  };
  page.route('**/vtt/**',async route=>{
  const request=route.request(),url=new URL(request.url());
  const path=url.pathname,method=request.method();
  // Vite also serves its HTML and executable assets under /vtt/; the
  // sandbox must NEVER replace those frontend files with fixture JSON.
  if(path==='/vtt/'||path==='/vtt/index.html'||path.startsWith('/vtt/assets/'))
   return route.continue();
  const raw=request.postData();
  const body=raw?JSON.parse(raw):{};
  store.requests.push({path,method,body});
   if(path==='/vtt/bootstrap')return send(route,authorized?200:401,
    authorized?capability(enabled,assignmentsEnabled,portraitsEnabled):{error:'Non autenticato'});
   if(path===campaignRow.logoUrl)return route.fulfill({status:200,contentType:'image/png',
    body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRk0AAAAASUVORK5CYII=','base64')});
  if(!authorized)return send(route,401,{error:'Non autenticato'});
  if(recoveredImages&&[npcPortrait,monsterPortrait].includes(path))
   return route.fulfill({status:200,contentType:'image/png',body:Buffer.from(imageFixture,'base64')});
  if(sheetParity&&path===`/vtt/campaigns/${campaign}/visual-assets`)return send(route,200,{items:[]});
  if(portraitsEnabled&&path==='/vtt/character-portrait-source/'+characterId){
   if(url.searchParams.get('campaignId')!==campaign)return send(route,400,{error:'Invalid source campaign'});
   if(method==='GET')return store.portraitSource?
    send(route,200,{characterId,mimeType:'image/jpeg',dataBase64:store.portraitSource}):
    send(route,404,{error:'No original source'});
   if(method==='PUT'){
    if(body.campaignId!==campaign||body.mimeType!=='image/jpeg'||
      typeof body.dataBase64!=='string')return send(route,400,{error:'Invalid portrait source'});
    store.portraitSource=body.dataBase64;
    return send(route,200,{stored:true,characterId});
   }
  }
  if(portraitsEnabled&&path==='/vtt/character-portrait/'+characterId){
   if(url.searchParams.get('campaignId')!==campaign)return send(route,400,{error:'Invalid campaign'});
   if(method==='GET')return store.portrait?
    send(route,200,{characterId,mimeType:store.portraitMime,dataBase64:store.portrait}):
    send(route,404,{error:'No portrait'});
   if(method==='PUT'){
    if(body.campaignId!==campaign||body.mimeType!=='image/jpeg'||
       typeof body.dataBase64!=='string')return send(route,400,{error:'Invalid portrait'});
    store.portrait=body.dataBase64;
    return send(route,200,{stored:true,characterId});
   }
  }
  if(assignmentsEnabled&&path==='/vtt/character-assignments'&&method==='GET'){
   if(url.searchParams.get('campaignId')!==campaign)return send(route,400,{error:'Invalid campaign'});
   return send(route,200,{assignments:[...store.characterAssignments]
    .map(([characterId,playerId])=>({characterId,playerId}))});
  }
  if(assignmentsEnabled&&path==='/vtt/character-assignments/'+characterId&&method==='PATCH'){
   if(store.rejectNextAssignment){
    store.rejectNextAssignment=false;
    return send(route,404,{error:'Assignment not authorized'});
   }
   if(body.campaignId!==campaign||![playerId,null].includes(body.playerId))
    return send(route,400,{error:'Invalid assignment'});
   if(body.playerId===null)store.characterAssignments.delete(characterId);
   else store.characterAssignments.set(characterId,body.playerId);
   return send(route,200,{characterId,playerId:body.playerId});
  }
  if(path==='/vtt/character-availability'&&method==='GET')
   return send(route,200,{characters:[...store.characterAvailability]
    .map(([id,availableForPlayers])=>({id,availableForPlayers}))});
  if(path==='/vtt/character-availability/'+characterId&&method==='PATCH'){
   if(typeof body.availableForPlayers!=='boolean')return send(route,400,{error:'invalid flag'});
   store.characterAvailability.set(characterId,body.availableForPlayers);
   return send(route,200,{id:characterId,availableForPlayers:body.availableForPlayers});
  }
   if(path==='/vtt/characters'&&method==='GET')
    return send(route,200,{characters:store.characters});
   if(path==='/vtt/characters/'+characterId&&method==='PUT'){
    if(store.rejectNextCharacterSave){
     store.rejectNextCharacterSave=false;
     return send(route,503,{error:'Temporary isolated save failure'});
    }
    if(body.campaignId!==campaign)return send(route,400,{error:'Wrong campaign'});
    Object.assign(store.characters[0],{name:body.name,sheetData:body.sheetData});
    return send(route,200,{character:store.characters[0]});
   }
  if(path==='/vtt/campaigns/'+campaign+'/roster'&&method==='GET')
   return send(route,200,{members:[{userId:user,displayName:'GM di prova',role:'gm'},{userId:playerId,displayName:'Giocatore prova',role:'player'}]});
   if(path==='/vtt/campaigns'&&method==='GET')
    return send(route,200,{campaigns:[campaignRow]});
   if(path===`/vtt/campaigns/${campaign}/chapters`)return send(route,200,{chapters:[
    process.env.HG_E2E_INVALID_CHAPTERS==='1'?
     {id:'60000000-0000-4000-8000-000000000001',campaignId:campaign,title:'Capitolo incompleto'}:
     {id:'60000000-0000-4000-8000-000000000001',campaignId:campaign,title:'Capitolo originale',
      description:'',notes:'',kind:'standard',isActive:true,nextChapterIds:[],
      mapUrl:'https://njcnkovruynhtsgzgrxi.supabase.co/storage/v1/object/public/visual-assets/owner/map.webp',
      mapMetadata:{},locationMetadata:{},created_at:'2026-01-02T03:04:05.123456+00:00',updated_at:'2026-01-02T03:04:05+00:00'},
   ]});
   for(const kind of ['npcs','monsters']){
    if(path!==`/vtt/campaigns/${campaign}/narrative/${kind}`)continue;
    if(method==='GET')return send(route,200,{items:store.narrative[kind]});
    if(method==='PUT'){
     const index=store.narrative[kind].findIndex(item=>item.id===body.id);
     if(index<0||body.campaignId!==campaign)return send(route,404,{error:'Not authorized'});
     store.narrative[kind][index]=structuredClone(body);
     return send(route,200,{item:body});
    }
   }
   const formulaBase=`/vtt/campaigns/${campaign}/dice-formulas`;
   if(path===formulaBase&&method==='GET')return send(route,200,{formulas:store.formulas});
   if(path===formulaBase&&method==='POST'){
    const formula={id:'30000000-0000-4000-8000-000000000001',campaignId:campaign,ownerProfileId:user,
     name:body.name,items:body.items,isSecret:body.isSecret,iconName:body.iconName??null,
     folderId:null,sortOrder:0,createdAt:'2026-11-24T00:00:00.000Z',updatedAt:'2026-11-24T00:00:00.000Z'};
    store.formulas.push(formula);
    return send(route,200,{formula});
   }
   if(path.startsWith(formulaBase+'/')&&method==='PATCH'){
    const formula=store.formulas.find(f=>f.id===path.slice(formulaBase.length+1));
    if(!formula)return send(route,404,{error:'Not found'});
    Object.assign(formula,body);
    return send(route,200,{updated:true});
   }
  if(path==='/vtt/campaign-note-folders'&&method==='GET')
   return send(route,200,{folders:store.folders.filter(f=>f.scope===url.searchParams.get('scope'))});
  if(path==='/vtt/campaign-note-folders'&&method==='POST'){
   store.folders.push({id:folderId,name:body.name,scope:body.scope,
    parentId:body.parentId??null,position:0,icon:null});
   return send(route,200,{folderId});
  }
  if(path==='/vtt/campaign-notes/trash'&&method==='GET')
   return send(route,200,{notes:store.trash.map(note=>({
    id:note.id,tab_name:note.title,content:'',
    entity_type:note.parentId?'note':'campaign',hidden:note.scope==='gm',
    deleted_at:'2026-11-12T14:00:00.000Z',
   })),folders:[]});
  if(path==='/vtt/campaign-notes/trash/restore'&&method==='POST'){
   const index=store.trash.findIndex(n=>n.id===body.itemId);
   if(index<0)return send(route,404,{error:'Not found'});
   const [note]=store.trash.splice(index,1);
   store.notes.push({...note,visibility:'private'});
   return send(route,200,{restoredId:body.itemId,kind:body.kind});
  }
  if(path==='/vtt/campaign-notes'&&method==='GET'){
   const parentId=url.searchParams.get('parentId');
   return send(route,200,{notes:store.notes.filter(n=>n.parentId===(parentId??null))});
  }
  if(path==='/vtt/campaign-notes'&&method==='POST'){
   const parent=body.parentId?
    store.notes.find(n=>n.id===body.parentId):null;
   const id=store.next++===0?initialNote:secondNote;
   const note={id,title:body.title,parentId:body.parentId??null,
    scope:parent?.scope??body.scope??'shared',position:store.notes.length,
    visibility:parent?.visibility??(body.scope==='gm'?'private':'all'),
    contentRich:null,folderId:null,creatorId:user,editorOwnerId:user,
    titleIcon:null,tabOrder:null,updatedAt:'2026-11-12T15:00:00.000Z'};
   store.notes.push(note);
   return send(route,200,{note});
  }
  if(path.startsWith('/vtt/campaign-notes/')&&method==='PATCH'){
   const id=path.slice('/vtt/campaign-notes/'.length);
   const note=store.notes.find(n=>n.id===id);
   if(!note)return send(route,404,{error:'Not found'});
   note.title=body.title;
   note.contentRich=body.contentRich;
   note.position=body.position;
   note.visibility=body.visibility;
   return send(route,200,{savedId:id});
  }
  if(path.startsWith('/vtt/campaign-notes/')&&method==='DELETE'){
   const id=path.slice('/vtt/campaign-notes/'.length);
   const index=store.notes.findIndex(n=>n.id===id);
   if(index<0)return send(route,404,{error:'Not found'});
   store.trash.push(...store.notes.splice(index,1));
   return send(route,200,{archivedId:id});
  }
  return send(route,404,{error:'Unexpected browser fixture endpoint',path,method});
 });
 return store;
}
const browser=await chromium.launch({headless:true,channel:process.env.HG_BROWSER_CHANNEL??'chrome'});
const errors=[];
try{
 if(process.env.HG_E2E_FOCUSED==='1'){
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.setDefaultTimeout(10000);
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',request=>{if(/supabase\.(co|in)/i.test(request.url()))errors.push('Unexpected legacy network request');});
  const store=mockApi(page,{portraitsEnabled:recoveredImages,assignmentsEnabled:recoveredImages});
  if(recoveredImages){
   store.portrait=imageFixture;store.portraitMime='image/png';
   store.characterAvailability.set(characterId,true);
   store.characterAssignments.set(characterId,playerId);
  }
  if(process.env.HG_E2E_DATA_GUARDS==='1')store.characters.push({
   id:'50000000-0000-4000-8000-000000000001',campaignId:campaign,ownerId:user,
   name:'[Recupero] Personaggio test',status:'active',sheetData:{recoveredPlaceholder:true},
  });
  try{
   await page.goto(base,{waitUntil:'domcontentloaded'});
   await page.getByRole('button',{name:'Campagne',exact:true}).click();
   const logo=page.getByRole('img',{name:'Logo di '+campaignRow.name,exact:true});
   await logo.waitFor();
   assert.equal(await logo.getAttribute('src'),campaignRow.logoUrl);
   await page.getByRole('button',{name:'Mara di prova',exact:true}).click();
   await page.getByRole('region',{name:'Scheda di Mara di prova'}).waitFor();
   await page.getByRole('button',{name:/Torna ai personaggi/}).click();
   await page.getByRole('button',{name:'Campagne',exact:true}).click();
   await page.getByRole('button',{name:'Apri campagna',exact:true}).click();
   await page.getByRole('button',{name:'Entra nella campagna'}).click();
   const assertDecoded=async(scope,name)=>{
    const img=scope.getByRole('img',{name,exact:true});
    await img.waitFor();
    await img.evaluate(node=>new Promise((resolve,reject)=>{
     if(node.complete)return node.naturalWidth>0?resolve():reject(Error('Image failed to decode'));
     node.addEventListener('load',()=>resolve(),{once:true});
     node.addEventListener('error',()=>reject(Error('Image failed to load')),{once:true});
    }));
   };
   if(recoveredImages){
    const home=page.locator('[data-aruba-campaign-home]');
    await assertDecoded(home,'Mara di prova');
    await assertDecoded(home,'Custode prova');
    await assertDecoded(home,'Bestia prova');
   }
   await page.getByRole('button',{name:'Schede',exact:true}).click();
   const split=page.locator('[data-session-sheets-split]');
   await split.waitFor();
   await split.getByRole('button',{name:'Apri scheda di Mara di prova',exact:true}).click();
   await split.getByRole('region',{name:'Scheda di Mara di prova'}).waitFor();
   if(recoveredImages)await assertDecoded(split.locator('[data-session-sheet-detail="pg"]'),'Mara di prova');
   if(process.env.HG_E2E_VISUAL_REFERENCE)await compareOriginalSheets(browser,page,store,{campaign,ownerId:user,imageFixture});
   if(sheetParity){
    const panelResize=page.getByRole('separator',{name:'Larghezza pannello Schede'});
    const listResize=page.getByRole('separator',{name:'Larghezza elenco schede'});
     const initialPanel=Number(await panelResize.getAttribute('aria-valuenow'));
     const panel=page.locator('[data-session-slide-over]');
     const initialBox=await panel.boundingBox();
     await panelResize.focus();await page.keyboard.press('ArrowLeft');
     assert.equal(Number(await panelResize.getAttribute('aria-valuenow')),initialPanel+16);
     const resizedBox=await panel.boundingBox();
     assert.equal(Math.round(resizedBox.width-initialBox.width),16,'actual rendered panel must resize, not just aria state');
    const initialList=Number(await listResize.getAttribute('aria-valuenow'));
    await listResize.focus();await page.keyboard.press('ArrowRight');
    assert.equal(Number(await listResize.getAttribute('aria-valuenow')),initialList+16);
    const detail=split.locator('[data-session-sheet-detail="pg"]');
    for(const name of ['Scheda','Immagine','Token'])assert.equal(await detail.getByRole('button',{name,exact:true}).count(),0);
    assert.equal(await detail.getByText('Scheda salvata',{exact:true}).count(),0);
   }
   assert.equal(await page.locator('.aruba-entity-overlay').count(),0,
    'Session sheets must not open the global Personaggi overlay');
   assert.equal(await page.locator('[data-session-slide-over="true"]').count(),1);
   const geometry=await split.evaluate(node=>{
    const list=node.querySelector('.aruba-session-character-list').getBoundingClientRect();
    const detail=node.querySelector('.aruba-session-sheet-content').getBoundingClientRect();
    return {list:{left:list.left,right:list.right,width:list.width,height:list.height},
     detail:{left:detail.left,right:detail.right,width:detail.width,height:detail.height}};
   });
   assert.ok(geometry.list.right<=geometry.detail.left+1,JSON.stringify(geometry));
   assert.ok(geometry.list.width>=140&&geometry.detail.width>=350,JSON.stringify(geometry));
   if(process.env.HG_E2E_SCREENSHOTS==='1')await page.screenshot({path:'../../.local/session-sheets-two-columns.png'});
   store.rejectNextCharacterSave=true;
   const fisico=split.locator('[data-session-sheet-detail="pg"] [role="button"]')
    .filter({has:page.getByText('Fisico',{exact:true})});
   await Promise.all([
    page.waitForResponse(r=>r.request().method()==='PUT'&&new URL(r.url()).pathname==='/vtt/characters/'+characterId),
    fisico.locator('button').first().click(),
   ]);
   await split.getByRole('button',{name:'Riprova salvataggio',exact:true}).waitFor();
   await split.getByRole('button',{name:'Apri scheda PNG di Custode prova',exact:true}).click();
   await split.getByText(/la scheda resta aperta/).waitFor();
   assert.equal(await split.locator('[data-session-sheet-detail="pg"]').count(),1);
   assert.equal(await split.locator('[data-session-sheet-detail="npcs"]').count(),0);
   await Promise.all([
    page.waitForResponse(r=>r.request().method()==='PUT'&&r.status()===200&&new URL(r.url()).pathname==='/vtt/characters/'+characterId),
    split.getByRole('button',{name:'Riprova salvataggio',exact:true}).click(),
   ]);
   assert.equal(store.characters[0].campaignId,campaign);
   assert.equal(store.characters[0].sheetData.ambiti.Fisico,1);
   if(recoveredImages){
    assert.equal(Object.hasOwn(store.characters[0].sheetData,'portraitImageUrl'),false,
     'display-only authenticated portrait must not be sent with sheet writes');
   }
   await page.getByRole('button',{name:'Apri scheda PNG di Custode prova',exact:true}).click();
   await split.locator('[data-session-sheet-detail="npcs"]').waitFor();
   if(recoveredImages)await assertDecoded(split.locator('[data-session-sheet-detail="npcs"]'),'Custode prova');
   if(sheetParity){
    const detail=split.locator('[data-session-sheet-detail="npcs"]');
    for(const name of ['Scheda','Immagine','Token'])assert.equal(await detail.getByRole('button',{name,exact:true}).count(),0);
   }
   const chapterSelect=split.locator('[data-session-sheet-detail="npcs"]').getByRole('combobox',{name:'Capitolo narrativo',exact:true});
   await chapterSelect.waitFor();
   assert.equal(await chapterSelect.isDisabled(),process.env.HG_E2E_INVALID_CHAPTERS==='1');
   assert.equal(await split.getByRole('button',{name:'Apri scheda di Mara di prova',exact:true}).isVisible(),true);
   await page.getByRole('button',{name:'Apri scheda Mostro di Bestia prova',exact:true}).click();
   await split.locator('[data-session-sheet-detail="monsters"]').waitFor();
   if(recoveredImages)await assertDecoded(split.locator('[data-session-sheet-detail="monsters"]'),'Bestia prova');
   if(sheetParity){
    const detail=split.locator('[data-session-sheet-detail="monsters"]');
    for(const name of ['Scheda','Immagine','Token'])assert.equal(await detail.getByRole('button',{name,exact:true}).count(),0);
   }
   await split.getByRole('button',{name:'Apri scheda di Mara di prova',exact:true}).click();
   await split.getByRole('region',{name:'Scheda di Mara di prova'}).waitFor();
   assert.equal(await page.locator('.aruba-entity-overlay').count(),0);
   if(process.env.HG_E2E_DATA_GUARDS==='1'){
    await split.getByRole('button',{name:'Apri scheda di [Recupero] Personaggio test',exact:true}).click();
    await split.getByText(/Segnaposto tecnico di recupero/).waitFor();
    assert.equal(await split.getByRole('button',{name:'Apri scheda di Mara di prova',exact:true}).isVisible(),true);
    await split.getByRole('button',{name:'Apri scheda di Mara di prova',exact:true}).click();
    await split.getByRole('region',{name:'Scheda di Mara di prova'}).waitFor();
   }
   await page.getByRole('button',{name:'Dadi',exact:true}).click();
   await page.locator('[data-session-dice-panel]').waitFor();
   assert.equal(await page.locator('[data-dice-quick-palette]').count(),0,
    'Dadi must open the formula library, never the floating quick selector');
   await page.getByRole('button',{name:'Aggiungi d20',exact:true}).click();
   await page.getByRole('textbox',{name:'Nome formula',exact:true}).fill('Formula test originale');
   await Promise.all([
    page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname===`/vtt/campaigns/${campaign}/dice-formulas`),
    page.locator('[data-dice-save-formula]').click(),
   ]);
   assert.equal(store.formulas.length,1);
   await page.getByRole('textbox',{name:'Nome formula',exact:true}).fill('Formula aggiornata');
   await Promise.all([
    page.waitForResponse(r=>r.request().method()==='PATCH'&&new URL(r.url()).pathname.endsWith('/dice-formulas/'+store.formulas[0].id)),
    page.locator('[data-dice-save-formula]').click(),
   ]);
   await page.getByRole('button',{name:/Formula aggiornata/}).first().waitFor();
   assert.equal(store.formulas[0].items.length,1);
   assert.equal(store.formulas[0].ownerProfileId,user);
   if(process.env.HG_E2E_SCREENSHOTS==='1')await page.screenshot({path:'../../.local/tools-dice.png'});
   await page.locator('[data-dice-roll-builder]').click();
   await page.locator('[data-dice-3d-overlay] canvas').waitFor();
   await page.getByRole('button',{name:'Dadi',exact:true}).click();
   await page.getByRole('button',{name:'Tiro rapido',exact:true}).click();
   await page.locator('[data-dice-quick-palette]').waitFor();
   await page.locator('[data-dice-quick-palette] > div > button').nth(5).click();
   await page.locator('[data-dice-quick-palette]').getByRole('button',{name:'Tira',exact:true}).click();
   await page.getByRole('button',{name:'Mostra storico tiri',exact:true}).click();
   await page.locator('[data-dice-history-drawer]').waitFor();
   await page.getByRole('button',{name:'Note',exact:true}).click();
   await page.locator('[data-note-split-panel="true"]').waitFor();
   await page.locator('[data-note-sidebar="true"] button[aria-label="Nuova nota"]').last().click();
   await page.locator('[data-tab-id="'+initialNote+'"]').waitFor();
   await page.getByRole('button',{name:'Crea la prima sotto-tab'}).click();
   await page.locator('[data-tab-id="'+secondNote+'"]').waitFor();
   const saved=page.waitForResponse(r=>r.request().method()==='PATCH'&&
    new URL(r.url()).pathname==='/vtt/campaign-notes/'+secondNote&&
    JSON.stringify(r.request().postDataJSON().contentRich).includes('Verifica funzionale Aruba'));
   await page.locator('[contenteditable="true"]').first().fill('Verifica funzionale Aruba');
   await saved;
   assert.equal(store.notes.length,2);
   assert.equal(errors.length,0,errors.join('\n'));
   assert.equal(await page.getByText(/Animazione 3D non disponibile/).count(),0);
   if(recoveredImages)console.log('ENTITY_IMAGES_BROWSER_OK: PG/PNG/Monster images decoded in cards and details; PG save keeps portrait outside sheet JSON');
   console.log('FUNCTIONAL_BROWSER_OK: campaign logo, PG/PNG/Monster sheets, separate original dice library and floating quick roll, 3D, formula save, Notes create/save (isolated fixtures)');
  }catch(error){
    console.error('FUNCTIONAL_BROWSER_STATE',JSON.stringify({
     body:(await page.locator('body').innerText()).slice(-6000),errors,requests:store.requests.slice(-15),
     images:await page.locator('[data-session-sheets-split] img').evaluateAll(nodes=>nodes.map(node=>({
      alt:node.alt,loaded:node.complete&&node.naturalWidth>0,
      data:node.src.startsWith('data:'),width:node.getBoundingClientRect().width,
     }))),
   }));
   throw error;
  }
  await page.close();
 }else{
 // Test a real unauthenticated browser, not only a bootstrap unit test.
 {
  const page=await browser.newPage();
  page.on('pageerror',e=>errors.push('unauthenticated '+e.message));
  mockApi(page,{authorized:false});
  await page.goto(base,{waitUntil:'domcontentloaded'});
  try{await page.getByText('Il varco è chiuso').waitFor({timeout:7000});}
  catch(error){
   console.error('UNAUTORED BROWSER STATE',JSON.stringify({
    url:page.url(),body:(await page.locator('body').innerText()).slice(0,1800),
    errors,requests:(await page.evaluate(()=>performance.getEntriesByType('resource').map(x=>x.name))).slice(-10),
   }));
   throw error;
  }
  assert.equal(await page.getByRole('button',{name:'Note',exact:true}).count(),0);
  await page.close();
 }
 // A valid account without the specific server capability must never see
 // the new right-side entry, even after selecting an owned campaign.
 {
  const page=await browser.newPage();
  page.on('pageerror',e=>errors.push('disabled '+e.message));
  mockApi(page,{enabled:false});
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Campagne',exact:true}).click();
  await page.getByRole('button',{name:'Apri campagna'}).click();
  await page.getByRole('button',{name:'Entra nella campagna'}).click();
  await page.locator('[data-aruba-session-rail="true"]').waitFor();
  assert.equal(await page.getByRole('button',{name:'Note',exact:true}).isDisabled(),true);
  assert.equal(await page.locator('[data-note-split-panel="true"]').count(),0);
  assert.equal(await page.locator('[data-note-split-panel="true"]').count(),0);
  await page.close();
 }
 // Mobile regression: character detail must not overlap the persistent rail.
 {
  const page=await browser.newPage({viewport:{width:390,height:844}});
  page.on('pageerror',e=>errors.push('mobile-character '+e.message));
  mockApi(page,{assignmentsEnabled:true});
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Campagne',exact:true}).click();
  await page.getByRole('button',{name:'Apri campagna'}).click();
  await page.getByRole('button',{name:'Entra nella campagna'}).click();
  await page.locator('[data-aruba-session-rail="true"]').waitFor();
  await page.locator('[data-campaign-character-id="'+characterId+'"]')
   .getByRole('button',{name:'Apri scheda campagna di Mara di prova'}).click();
  const detail=page.locator('[data-entity-context="characters-detail"]');
  // The overlay wrapper is display:contents in the pilot and has no box;
  // assert attachment, then wait for the actual visible sheet region.
  await detail.waitFor({state:'attached'});
  await page.getByRole('region',{name:'Scheda di Mara di prova'}).waitFor();
  const layout=await page.evaluate(()=>{
   const panel=document.querySelector('.aruba-entity-overlay [data-session-slide-over="true"]');
   const rail=document.querySelector('.aruba-entity-rail');
   const back=document.querySelector('.aruba-entity-back-column');
   const content=document.querySelector('.aruba-entity-detail-main');
   if(!panel||!rail||!back||!content)throw Error('Missing original character detail structure');
   const p=panel.getBoundingClientRect(),r=rail.getBoundingClientRect();
   const b=back.getBoundingClientRect(),c=content.getBoundingClientRect();
   return {panelRight:p.right,railLeft:r.left,backBottom:b.bottom,contentTop:c.top,
    contentWidth:c.width,viewport:window.innerWidth};
  });
  assert.ok(layout.panelRight<=layout.railLeft+2,'Detail must not overlap the 80px rail: '+JSON.stringify(layout));
  assert.ok(layout.backBottom<=layout.contentTop+2,'Back control must sit above sheet on mobile: '+JSON.stringify(layout));
  assert.ok(layout.contentWidth>150,'Sheet content must retain usable width: '+JSON.stringify(layout));
  await detail.getByRole('button',{name:/Torna ai personaggi/}).click();
  await detail.waitFor({state:'detached'});
  // The Schede list is a distinct slide-over and must also remain clickable
  // between the original 100px left navigation and 80px session rail.
  const sessionRail=page.locator('[data-aruba-session-rail="true"]');
  await sessionRail.getByRole('button',{name:'Schede',exact:true}).click();
  const list=page.locator('.aruba-session-characters-host');
  await list.waitFor({state:'attached'});
  await list.getByRole('button',{name:'Apri scheda di Mara di prova'}).waitFor();
  const listBounds=await page.evaluate(()=>{
   const panel=document.querySelector('.aruba-session-characters-host [data-session-slide-over="true"]');
   if(!panel)throw Error('Missing mobile Schede list slide-over');
   const rect=panel.getBoundingClientRect();
   return {left:rect.left,right:rect.right,width:rect.width,viewport:window.innerWidth};
  });
  assert.ok(listBounds.left>=99,'Schede list overlaps original left navigation: '+JSON.stringify(listBounds));
  assert.ok(listBounds.right<=listBounds.viewport-79,'Schede list overlaps session rail: '+JSON.stringify(listBounds));
  await list.getByRole('button',{name:'Apri scheda di Mara di prova'}).click();
  await detail.waitFor({state:'attached'});
  await page.getByRole('region',{name:'Scheda di Mara di prova'}).waitFor();
  await detail.getByRole('button',{name:/Torna ai personaggi/}).click();
  await detail.waitFor({state:'detached'});
  await page.close();
 }
 // Portraits in the GM archive and original detail/Token must be loaded
 // from authenticated Aruba only; the backend character JSON stays unchanged.
 {
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',e=>errors.push('gm-portrait '+e.message));
  const store=mockApi(page,{assignmentsEnabled:true,portraitsEnabled:true});
  store.portrait=Buffer.from([255,216,255,224,0,16,74,70,73,70,0,1,255,217]).toString('base64');
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Personaggi',exact:true}).click();
  const library=page.getByRole('region',{name:'Archivio personaggi'});
  try{
   await library.getByText('Mara di prova').first().waitFor({timeout:8000});
   await library.locator('img[src^="data:image/jpeg;base64,"]').first()
    .waitFor({state:'attached',timeout:8000});
  }catch(e){
   console.error('GM_PORTRAIT_CARD_DEBUG',JSON.stringify({
    library:(await library.innerText()).slice(0,1400),
    portraitRequests:store.requests.filter(r=>r.path.includes('portrait')),
    imageSrcs:await library.locator('img').evaluateAll(images=>
     images.map(img=>({alt:img.alt,src:img.getAttribute('src')?.slice(0,90)}))),
    errors,
   }));
   throw e;
  }
  await library.getByText('Mara di prova').first().click();
  const sheet=page.getByRole('region',{name:'Scheda di Mara di prova'});
  await sheet.waitFor();
  const rail=page.getByLabel('Barra contestuale personaggio');
  await rail.getByRole('button',{name:'Token'}).click();
  await sheet.getByRole('img',{name:'Token di Mara di prova'}).waitFor();
  assert.ok((await sheet.getByRole('img',{name:'Token di Mara di prova'}).first().getAttribute('src'))
   .startsWith('data:image/jpeg;base64,'));
  await rail.getByRole('button',{name:'Scheda'}).click();
  assert.equal(store.requests.some(r=>/storage\/v1|supabase/.test(r.path)),false);
  assert.equal(store.requests.filter(r=>r.path==='/vtt/character-portrait/'+characterId&&r.method==='GET').length>=2,true);
  assert.equal(store.requests.some(r=>r.method==='PUT'&&r.path==='/vtt/characters/'+characterId),false,
   'Photo preview must not alter character sheet JSON');
  await page.close();
 }
 // Real GM portrait cropping uses the ORIGINAL ImageCropCore, with
 // in-memory isolated Aruba PUT/GET. No production media is touched.
 {
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',e=>errors.push('portrait '+e.message));
  const store=mockApi(page,{assignmentsEnabled:true,portraitsEnabled:true});
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Personaggi',exact:true}).click();
  const archive=page.getByRole('region',{name:'Archivio personaggi'});
  await archive.getByText('Mara di prova').first().click();
  await page.getByRole('region',{name:'Scheda di Mara di prova'}).waitFor();
  const rail=page.getByLabel('Barra contestuale personaggio');
  await rail.getByRole('button',{name:'Immagine'}).click();
  const media=page.getByRole('region',{name:'Immagine di Mara di prova'});
  await media.waitFor();
  await media.getByText(/Ritaglio con l'editor originale Hollowgate/).waitFor();
  assert.equal(store.portrait,null);
  // Valid 1x1 PNG pixel, browser canvas exports the cropped JPEG.
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRk0AAAAASUVORK5CYII=','base64');
  await media.locator('input[type="file"]').setInputFiles({
   name:'qa-portrait.png',mimeType:'image/png',buffer:png,
  });
  const confirm=media.locator('[data-image-crop-action="confirm"]');
  await confirm.waitFor();
  await confirm.click();
  // Await the asynchronous crop/export and BOTH isolated media writes.
  // A fixed 200 ms delay races browser canvas encoding on CI runners.
  await assert.doesNotReject(async()=>{
   const deadline=Date.now()+10000;
   while(!(store.portrait&&store.portrait.length>16&&store.portraitSource&&store.portraitSource.length>16)){
    if(Date.now()>deadline)throw new Error('Timed out waiting for original cropper Aruba media writes; requests='+JSON.stringify(store.requests.filter(r=>r.method==='PUT')));
    await new Promise(resolve=>setTimeout(resolve,100));
   }
  });
  assert.ok(store.portrait&&store.portrait.length>16,
   'Original cropper must PUT a generated JPEG into Aruba media API');
  assert.ok(store.portraitSource&&store.portraitSource.length>16,
   'Original cropper must preserve the full resized owner-only source');
  const sourceWrites=store.requests.filter(r=>r.path==='/vtt/character-portrait-source/'+characterId&&r.method==='PUT');
  assert.equal(sourceWrites.length,1);
  const writes=store.requests.filter(r=>r.path==='/vtt/character-portrait/'+characterId&&r.method==='PUT');
  assert.equal(writes.length,1);
  assert.equal(writes[0].body.campaignId,campaign);
  assert.equal(writes[0].body.mimeType,'image/jpeg');
  assert.equal(store.requests.some(r=>/supabase|storage\/v1/.test(r.path)),false);
  await rail.getByRole('button',{name:'Scheda'}).click();
  await page.locator('[data-tab-id="summary"] button').first().waitFor();
  await page.close();
 }
 // Browser contract for the REAL campaign Players rows, original EntityCard
 // and original Schede detail. Assignments are fake-server fixtures ONLY.
 {
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',e=>errors.push('assigned '+e.message));
  const store=mockApi(page,{assignmentsEnabled:true});
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Campagne',exact:true}).click();
  await page.getByRole('button',{name:'Apri campagna'}).click();
  await page.getByRole('button',{name:'Entra nella campagna'}).click();
  const gm=page.getByRole('region',{name:'Partecipante GM di prova'});
  const player=page.getByRole('region',{name:'Partecipante Giocatore prova'});
  const assignedCard='[data-campaign-character-id="'+characterId+'"]';
  await gm.locator(assignedCard).waitFor();
  assert.equal(await player.locator(assignedCard).count(),0);
  const choose=gm.getByRole('combobox',{name:'Assegna Mara di prova a un giocatore'});
  await choose.waitFor();
  assert.equal(await choose.inputValue(),'');
  // A rejected server request cannot move the character on screen.
  store.rejectNextAssignment=true;
  await choose.selectOption(playerId);
  await page.getByRole('alert').filter({hasText:'Personaggio o giocatore non autorizzato'}).waitFor();
  assert.equal(await choose.inputValue(),'');
  assert.equal(await player.locator(assignedCard).count(),0);
  // Confirmed assignment moves exactly one card; GM remains the owner.
  await choose.selectOption(playerId);
  await player.locator(assignedCard).waitFor();
  assert.equal(await gm.locator(assignedCard).count(),0);
  assert.equal(await page.locator(assignedCard).count(),1);
  assert.equal(store.characters[0].ownerId,user);
  assert.equal(store.characterAssignments.get(characterId),playerId);
  const assigned=player.locator(assignedCard);
  assert.equal(await assigned.getByRole('button',{name:'Disponibilità di Mara di prova'}).isDisabled(),true);
  await assigned.getByRole('button',{name:'Apri scheda campagna di Mara di prova'}).click();
  await page.getByRole('region',{name:'Scheda di Mara di prova'}).waitFor();
  await page.locator('[data-entity-context="characters-detail"]')
   .getByRole('button',{name:/Torna ai personaggi/}).click();
  await page.locator('[data-entity-context="characters-detail"]').waitFor({state:'detached'});
  // Diagnose ambiguous assignment controls without masking a duplicated card.
  const release=player.locator(assignedCard).getByRole('combobox',{name:'Assegna Mara di prova a un giocatore'});
  // The roster is intentionally unmounted while the original detail is open;
  // wait for its authoritative server snapshot after closing the overlay.
  await player.locator(assignedCard).waitFor({state:'visible'});
  const cardCount=await page.locator(assignedCard).count();
  if(cardCount!==1){
   const origins=await page.locator(assignedCard).evaluateAll(nodes=>nodes.map(node=>({
    parent:node.closest('.aruba-campaign-player-rows')?.outerHTML.slice(0,600),
    ancestor:node.parentElement?.parentElement?.className,
    visible:!!node.getClientRects().length,
    rootId:node.closest('[id]')?.id,
    rootChildren:document.querySelector('#root')?.children.length,
    mainCount:document.querySelectorAll('main.content').length,
    workspaceCount:document.querySelectorAll('.workspace').length,
    outerContext:node.closest('main')?.outerHTML.slice(0,250),
    regionIndex:[...document.querySelectorAll('.aruba-campaign-player-rows')].indexOf(node.closest('.aruba-campaign-player-rows')),
    rosterInstance:node.closest('.aruba-campaign-player-rows')?.getAttribute('data-roster-instance'),
    regionParent:node.closest('.aruba-campaign-player-rows')?.parentElement?.className,
    regionSiblingCount:node.closest('.aruba-campaign-player-rows')?.parentElement?.children.length,
    cardRowId:node.closest('[data-campaign-member-id]')?.getAttribute('data-campaign-member-id'),
    reactRootChildren:[...document.querySelector('#root')?.children??[]].map(el=>el.className),
   })));
   throw new Error('Duplicate assigned cards: '+JSON.stringify({cardCount,origins}));
  }
  assert.equal(await release.count(),1,
   'The assigned character must expose exactly one assignment selector');
  await release.selectOption('');
  // A server-confirmed release must update both the authoritative fixture and
  // the React grouping; report the exact mismatch rather than timing out.
  await page.waitForFunction(id=>{
   const card=document.querySelector('[data-campaign-member-id="'+id+'"] [data-campaign-character-id]');
   return card!==null;
  },user,{timeout:5000}).catch(async()=>{
   const snapshot=(await page.locator('.aruba-campaign-player-rows').allInnerTexts()).join(' || DUPLICATE PARTICIPANTS REGION || ');
   throw new Error('Released character did not return to GM; serverAssignment='+
    String(store.characterAssignments.get(characterId)??'none')+'; UI='+snapshot);
  });
  await gm.locator(assignedCard).waitFor();
  assert.equal(await player.locator(assignedCard).count(),0);
  assert.equal(await page.locator(assignedCard).count(),1);
  assert.equal(store.characterAssignments.has(characterId),false);
  await page.close();
 }
 // The authenticated, explicitly enabled trial uses the REAL two-column
 // SessionNotesPanel, with original GM/shared sections and persisted Note.
 {
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',e=>errors.push('enabled '+e.message));
  const store=mockApi(page);
  // An archived note is available before mounting the real Notes panel:
  // this tests recovery through the ORIGINAL Cestino row, not a fake button.
  store.trash.push({id:archivedNote,title:'Nota da ripristinare',
   parentId:null,scope:'shared',visibility:'private',contentRich:{type:'doc'},
   position:0,folderId:null,creatorId:user,editorOwnerId:user});
  await page.goto(base,{waitUntil:'domcontentloaded'});
  assert.equal(await page.getByRole('button',{name:'Note',exact:true}).count(),0,
   'No Note tab before a selected campaign');
  await page.getByRole('button',{name:'Campagne',exact:true}).click();
  await page.getByRole('button',{name:'Apri campagna'}).click();
  await page.getByRole('button',{name:'Entra nella campagna'}).click();
  await page.getByRole('region',{name:'Partecipanti campagna'}).waitFor();
  const ownerRow=page.getByRole('region',{name:'Partecipante GM di prova'});
  await ownerRow.waitFor();
  const availableButton=ownerRow.getByRole('button',{name:'Disponibilità di Mara di prova'});
  await availableButton.waitFor();
  assert.equal(await availableButton.getAttribute('aria-pressed'),'false');
  await availableButton.click();
  await page.waitForFunction(()=>document.querySelector('[aria-label="Disponibilità di Mara di prova"]')?.getAttribute('aria-pressed')==='true');
  assert.equal(store.characterAvailability.get(characterId),true);
  await availableButton.click();
  await page.waitForFunction(()=>document.querySelector('[aria-label="Disponibilità di Mara di prova"]')?.getAttribute('aria-pressed')==='false');
  assert.equal(store.characterAvailability.get(characterId),false);
  assert.equal(await ownerRow.locator('[data-campaign-character-id="'+characterId+'"]').count(),1,
   'A real GM-owned PG must appear under its verified owner');
  assert.equal(await page.locator('[data-campaign-character-id="'+characterId+'"]').count(),1,
   'No duplicate character card between Players and Personaggi sections');

  await page.getByRole('region',{name:'Partecipante Giocatore prova'}).waitFor();
  assert.equal(await page.getByRole('region',{name:'Partecipante Giocatore prova'})
   .locator('[data-campaign-character-id]').count(),0,
   'Do not fabricate a player assignment');
  await page.getByText('GM di prova').last().waitFor();
  const sessionRail=page.locator('[data-aruba-session-rail="true"]');
  await sessionRail.waitFor();
  // Real CampaignHome EntityCard must open the contextual Schede detail,
  // even if the same PG is selected twice in consecutive requests.
  const card=page.locator('[data-campaign-character-id="'+characterId+'"]');
  await card.waitFor();
  // The character opener and availability switch are separate sibling controls.
  // Target the opener explicitly so layout changes cannot click the switch.
  const cardOpener=card.getByRole('button',{name:'Apri scheda campagna di Mara di prova'});
  await cardOpener.click();
  await page.getByRole('region',{name:'Scheda di Mara di prova'}).waitFor();
  await page.locator('[data-entity-context="characters-detail"]')
   .getByRole('button',{name:/Torna ai personaggi/}).click();
  await page.locator('[data-entity-context="characters-detail"]').waitFor({state:'detached'});
  // Closing detail restores roster; explicitly open then close Schede.
  await page.locator('.aruba-session-characters-host').waitFor({state:'detached'});
  await sessionRail.getByRole('button',{name:'Schede',exact:true}).click();
  await page.locator('.aruba-session-characters-host').waitFor({state:'visible'});
  await sessionRail.getByRole('button',{name:'Schede',exact:true}).click();
  await page.locator('.aruba-session-characters-host').waitFor({state:'detached'});
  // Closing the detail remounts the server-backed roster. Ensure that its
  // keyboard target is unique before exercising the second open request.
  await page.waitForFunction(id=>document.querySelectorAll('[data-campaign-character-id="'+id+'"]').length===1,characterId);
  assert.equal(await card.count(),1,'Only one character card after closing the original detail');
  await cardOpener.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('region',{name:'Scheda di Mara di prova'}).waitFor();
  await page.locator('[data-entity-context="characters-detail"]')
   .getByRole('button',{name:/Torna ai personaggi/}).click();
  await page.locator('[data-entity-context="characters-detail"]').waitFor({state:'detached'});
  await page.locator('.aruba-session-characters-host').waitFor({state:'detached'});
  await sessionRail.getByRole('button',{name:'Schede',exact:true}).click();
  await page.locator('.aruba-session-characters-host').waitFor({state:'visible'});
  await sessionRail.getByRole('button',{name:'Schede',exact:true}).click();
  await page.locator('.aruba-session-characters-host').waitFor({state:'detached'});

  assert.equal(await sessionRail.getByRole('button',{name:'Chat',exact:true}).isDisabled(),true,
   'Chat must not pretend to be migrated');
  for(const label of ['Incontri','Combatti'])
   assert.equal(await sessionRail.getByRole('button',{name:label,exact:true}).count(),0,
    label+' must be hidden without a server-authorized GM membership');
  assert.equal(await sessionRail.getByRole('button',{name:'Dadi',exact:true}).isEnabled(),true);
  await sessionRail.getByRole('button',{name:'Dadi',exact:true}).click();
  await page.getByRole('button',{name:'Aggiungi d20'}).waitFor();
  await page.getByRole('button',{name:'Chiudi selezione dadi'}).click();
  assert.equal(await sessionRail.getByRole('button',{name:'Schede',exact:true}).isEnabled(),true);
  await sessionRail.getByRole('button',{name:'Schede',exact:true}).click();
  await page.getByRole('button',{name:'Apri scheda di Mara di prova'}).waitFor();
  await page.getByRole('button',{name:'Apri scheda di Mara di prova'}).click();
  try{
   await page.locator('[data-entity-context="characters-detail"]').waitFor({state:'attached',timeout:6000});
   await page.getByRole('region',{name:'Scheda di Mara di prova'}).waitFor({timeout:6000});
  }catch(e){
   console.error('CHARACTER_OPEN_DEBUG',JSON.stringify({
    text:(await page.locator('body').innerText()).slice(0,1900),
    errors,
    count:await page.locator('[data-aruba-session-rail="true"]').count(),
    requests:store.requests.slice(-12),
   }));
   throw e;
  }
  assert.ok(store.requests.some(r=>r.path==='/vtt/characters'&&r.method==='GET'),
   'Session Schede must request owned campaign characters from Aruba');
  await page.locator('[data-entity-context="characters-detail"]')
   .getByRole('button',{name:/Torna ai personaggi/}).click();
  await page.locator('[data-entity-context="characters-detail"]').waitFor({state:'detached'});
  // Detail close already deselects Schede and restores the campaign roster.
  // Clicking Schede here would reopen it, not close it.
  await page.locator('.aruba-session-characters-host').waitFor({state:'detached'});
  assert.equal(await sessionRail.getByRole('button',{name:'Note',exact:true}).isEnabled(),true);
  assert.equal(await page.getByRole('button',{name:'Capitoli e Scene',exact:true}).count(),0);
  await page.getByRole('button',{name:'Note',exact:true}).click();
  await page.locator('[data-note-split-panel="true"]').waitFor();
  const slide=page.locator('[data-session-slide-over="true"]');
  await slide.waitFor();
  assert.equal(await slide.count(),1,'Real original SlideOverPanel must be mounted');
  const slideBox=await slide.boundingBox();
  assert.ok(slideBox&&slideBox.x>0&&slideBox.x+slideBox.width<=1441,
   'Original Notes overlay must stay within 1440px viewport');
  assert.ok(slideBox.width>=700,'Original Notes overlay must preserve editing width');

  await page.getByRole('button',{name:/Note della Campagna/}).waitFor();
  await page.getByRole('button',{name:/Note del GM/}).waitFor();
  await page.getByRole('button',{name:/Cestino/}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Svuota cestino'}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Ripristina tutto'}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Elimina definitivamente'}).count(),0);

  const add=page.locator('[data-note-sidebar="true"] button[aria-label="Nuova nota"]');
  await add.last().click();
  await page.locator('[data-tab-id="'+initialNote+'"]').waitFor();
  assert.ok(store.requests.some(r=>r.method==='POST'&&r.path==='/vtt/campaign-notes'
   &&r.body.scope==='shared'), 'Creating original shared Note must call Aruba API');
  assert.equal(store.notes.length,1);
  // New notes are containers. Creating the first original subtab must use the
  // same campaign, real parent UUID and the Aruba session.
  await page.getByRole('button',{name:'Crea la prima sotto-tab'}).click();
  await page.locator('[data-tab-id="'+secondNote+'"]').waitFor();
  assert.ok(store.requests.some(r=>r.method==='POST'&&
   r.path==='/vtt/campaign-notes'&&r.body.parentId===initialNote),
   'Creating original NoteSubTabs must use the server parent ID');

  // RichTextEditor should render from the real component.
  await page.locator('[contenteditable="true"]').first().waitFor();
  await page.locator('[contenteditable="true"]').first().fill('Test TipTap Aruba');
  await page.waitForTimeout(500);
  assert.ok(store.requests.some(r=>r.method==='PATCH'&&
   r.path==='/vtt/campaign-notes/'+secondNote&&
   JSON.stringify(r.body.contentRich??{}).includes('Test TipTap Aruba')),
   'Editor must persist a real TipTap JSON document via Aruba API');

  // Use the existing original shared-section folder button. A successful
  // API POST must be followed by a reload to obtain the authoritative row.
  const folders=page.locator('[data-note-sidebar="true"] button[aria-label="Nuova cartella"]');
  await Promise.all([
   page.waitForResponse(r=>new URL(r.url()).pathname==='/vtt/campaign-note-folders'&&
    r.request().method()==='POST'&&r.status()===200),
   folders.last().click(),
  ]);
  assert.equal(store.folders.length,1);
  assert.equal(store.folders[0].scope,'shared');
  assert.ok(store.requests.some(r=>r.path==='/vtt/campaign-note-folders'&&
   r.method==='POST'&&r.body.name==='Nuova cartella'));

  // Open the ORIGINAL Cestino accordion and restore an archived note. The
  // restored record must leave the trash and retain its private visibility.
  await page.getByRole('button',{name:/Cestino/}).click();
  await page.getByText('Nota da ripristinare').waitFor();
  await Promise.all([
   page.waitForResponse(r=>new URL(r.url()).pathname==='/vtt/campaign-notes/trash/restore'&&
    r.request().method()==='POST'&&r.status()===200),
   page.getByRole('button',{name:'Ripristina'}).click(),
  ]);
  await page.locator('[data-note-sidebar="true"]')
   .getByText('Nota da ripristinare').waitFor({state:'hidden'});
  assert.equal(store.trash.length,0);
  assert.equal(store.notes.find(n=>n.id===archivedNote)?.visibility,'private');
  assert.ok(store.requests.some(r=>r.path==='/vtt/campaign-notes/trash/restore'&&
   r.body.itemId===archivedNote&&r.body.kind==='note'));
  assert.equal(await page.getByRole('button',{name:'Elimina definitivamente'}).count(),0);
  // Original SlideOverPanel Escape closes its own panel and returns the
  // pilot to the selected campaign instead of leaving a stale overlay.
  await page.keyboard.press('Escape');
  await slide.waitFor({state:'detached'});
  assert.equal(await page.getByRole('button',{name:'Note',exact:true}).count(),1);
  await page.getByRole('button',{name:'Note',exact:true}).click();
  await slide.waitFor();
  await page.getByRole('button',{name:'Note',exact:true}).click();
  await slide.waitFor({state:'detached'});
  assert.equal(errors.length,0,'Browser runtime errors: '+errors.join('; '));
  await page.close();
 }
 }
}finally{await browser.close();}
if(errors.length)throw Error('Browser console runtime errors: '+errors.join('; '));
if(process.env.HG_E2E_FOCUSED!=='1')console.log('Original Hollowgate browser QA passed: authorized player assignment/revocation, rejected assignments, original EntityCard/detail, auth gating, session rail, original Note slide-over, TipTap persistence, folders and trash restore.');
