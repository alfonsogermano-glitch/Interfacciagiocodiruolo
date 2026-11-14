// Browser-level QA of ORIGINAL SessionNotesPanel mounted in Aruba's real
// GM navigation. All API responses are isolated in-memory fixtures: this
// NEVER touches the production VPS, Supabase or real user accounts.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const base=process.env.HG_E2E_BASE??'http://127.0.0.1:4173';
const campaign='b0da2f75-f700-454c-9ba4-65bc0c8838ef';
const user='d4df2562-a83d-4d8d-92d4-e49b19c7810e';
const initialNote='fab34aae-beaf-4bca-9cce-9b497e114b94';
const secondNote='cf317f44-a915-4839-8cd6-9c8c2295599d';
const archivedNote='af3aa8a5-6333-4cbb-b2f1-ecbb394542e6';
const folderId='46fb111f-61b3-4a60-b122-54e8d7689c0e';
const characterId='eeaa5632-f050-4eb4-a0f4-3981443bf19e';
const playerId='2675f0a2-ad43-4f2d-ad01-6cfb9e8919b0';
const campaignRow={
 id:campaign,ownerId:user,name:'Campagna prova Note',description:'Solo browser test',
 ruleset:'hsc',createdAt:'2026-11-12T00:00:00.000Z',
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
  entityNotes:{read:false,write:false},
  campaignNotes:{read:true,write:true},
  campaignNoteFolders:{read:true,write:true},
  originalNotesPanel:{read:enabled,write:enabled},
  gameSession:false,
 },
});
const send=(route,status,body)=>route.fulfill({
 status,contentType:'application/json; charset=utf-8',
 headers:{'cache-control':'no-store'},body:JSON.stringify(body),
});
function mockApi(page,{enabled=true,authorized=true,assignmentsEnabled=false,portraitsEnabled=false}={}){
 const store={notes:[],trash:[],folders:[],requests:[],next:0,
  characterAvailability:new Map([[characterId,assignmentsEnabled]]),
  characterAssignments:new Map(),
  rejectNextAssignment:false,
  portrait:null,
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
  if(!authorized)return send(route,401,{error:'Non autenticato'});
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
    send(route,200,{characterId,mimeType:'image/jpeg',dataBase64:store.portrait}):
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
  if(path==='/vtt/campaigns/'+campaign+'/roster'&&method==='GET')
   return send(route,200,{members:[{userId:user,displayName:'GM di prova',role:'gm'},{userId:playerId,displayName:'Giocatore prova',role:'player'}]});
  if(path==='/vtt/campaigns'&&method==='GET')
   return send(route,200,{campaigns:[campaignRow]});
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
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const errors=[];
try{
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
  await sessionRail.getByRole('button',{name:'Schede',exact:true}).click();
  await page.locator('.aruba-session-characters-host').waitFor({state:'detached'});

  for(const label of ['Chat','Incontri','Combatti'])
   assert.equal(await sessionRail.getByRole('button',{name:label,exact:true}).isDisabled(),true,
    label+' must not pretend to be migrated');
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
  await sessionRail.getByRole('button',{name:'Schede',exact:true}).click();
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
}finally{await browser.close();}
if(errors.length)throw Error('Browser console runtime errors: '+errors.join('; '));
console.log('Original Hollowgate browser QA passed: authorized player assignment/revocation, rejected assignments, original EntityCard/detail, auth gating, session rail, original Note slide-over, TipTap persistence, folders and trash restore.');
