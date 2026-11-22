// Real Chromium interaction of the Aruba Chapter/Scene editor.
// In-memory fixtures only: never touches VPS, production, or user accounts.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const base=process.env.HG_E2E_BASE??'http://127.0.0.1:4173';
const userId='4a3465ec-47d7-4021-9f0d-e70da8cbd001';
const campaignId='f24f6bdd-a5f7-4521-aa16-bc0854dc5841';
const chapterId='4b2c4c0b-4b67-45c2-901a-2b4d3f7c8c42';
const sceneId='c2244c0b-4b67-45c2-901a-2b4d3f7c8c42';
const characterId='e2244c0b-4b67-45c2-901a-2b4d3f7c8c42';
const playerId='a2244c0b-4b67-45c2-901a-2b4d3f7c8c42';
const frameAssetId='f2244c0b-4b67-45c2-901a-2b4d3f7c8c42';
const pngDataUrl='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nKsAAAAASUVORK5CYII=';
const pngPixel=Buffer.from(pngDataUrl.split(',')[1],'base64');
const timestamp='2026-11-15T12:00:00.000Z';
let chapter={id:chapterId,campaignId,title:'Il varco',description:'Descrizione iniziale',notes:'',kind:'intro',isActive:true,
 nextChapterIds:[],mapUrl:'https://aruba-test.invalid/test-map.png',mapMetadata:{imageUrl:null,gridVisible:true,gridColumns:20,gridRows:12},locationMetadata:{},
 sourceEnvironment:null,createdAt:timestamp,updatedAt:timestamp};
let scene={id:sceneId,campaignId,chapterId,title:'Atrio',description:'Scena iniziale',notes:'',status:'ready',environmentId:null,
 imageUrl:null,sortOrder:0,nextSceneIds:[],mapRegions:[],contextMetadata:{timeOfDay:'',weather:'',lighting:'',condition:''},
 sourceEnvironment:null,createdAt:timestamp,updatedAt:timestamp};
let failNextScenePut=false;
const writes=[];
const clueId='d2244c0b-4b67-45c2-901a-2b4d3f7c8c42';
const narrative={npcs:[],monsters:[],events:[],clues:[{id:clueId,campaignId,title:'Sigillo spezzato',description:'',location:'',discovered:false,connectedTo:[],chapterId:null,sceneId:null}]};
const equipment=[];
let mapDocument=null;
let phasesDocument=null;
let combatDocument=null;
const sessionDocuments=new Map();
let lastCharacterSheet=null;
const visualAssets=[];
const capabilities={campaigns:{read:true,write:true},characters:{read:true,write:true},chapters:{read:true,write:true},
 scenes:{read:true,write:true},narrativeContent:{read:true,write:true},equipmentCatalog:{read:true,write:true},campaignDocuments:{read:true,write:true},visualAssets:{read:true,write:true},campaignRoster:{read:true,write:false},
 characterAvailability:{read:true,write:true},characterAssignments:{read:true,write:true},characterPortraits:{read:false,write:false},gameSession:false};

const browser=await chromium.launch({headless:true,args:['--no-sandbox'],
 ...(process.env.HG_BROWSER_EXECUTABLE?{executablePath:process.env.HG_BROWSER_EXECUTABLE}:{})});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://aruba-test.invalid/test-map.png',route=>route.fulfill({status:200,contentType:'image/png',body:pngPixel}));
 await page.route('**/vtt/**',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname;
  if(path==='/vtt/'||path==='/vtt/index.html'||path.startsWith('/vtt/assets/'))return route.continue();
  let status=200,payload;
  if(path==='/vtt/bootstrap')payload={backend:'aruba-staging',user:{id:userId,email:'gm@example.invalid',displayName:'GM prova',role:'standard'},capabilities};
  else if(path==='/vtt/campaigns'&&request.method()==='GET')payload={campaigns:[{id:campaignId,ownerId:userId,name:'Campagna browser',description:'QA',ruleset:'hsc',createdAt:timestamp}]};
  else if(path===`/vtt/campaigns/${campaignId}/chapters`&&request.method()==='GET')payload={chapters:[chapter]};
   else if(path===`/vtt/campaigns/${campaignId}/scenes`&&request.method()==='GET')payload={scenes:[scene]};
    else if(path==='/vtt/characters'&&url.searchParams.get('campaignId')===campaignId&&request.method()==='GET')payload={characters:[{id:characterId,campaignId,ownerId:userId,name:'Mara Voss',status:'active',sheetData:{name:'Mara Voss',style:'Custode',viaggio:'Il Varco',description:'Custode della soglia',ambiti:{Fisico:2,Scuola:1,Carisma:1,Strada:1},abilita:{Muscoli:1,Sport:1,Acrobatica:1,Resistenza:1,Freddezza:1,Cultura:1,Tecnologia:1,Studio:1,'Pronto Soccorso':1,Scienze:1,Esibirsi:1,Parlantina:1,Fascino:1,Intuito:1,Leadership:1,Furtività:1,Mira:1,Sopravvivenza:1,Crimine:1,Allerta:1},freschezza:12,maxFreschezza:12,caselleFrischezzaCruciali:[8,12],follia:9,maxFollia:9,tratti:[],equipment:[],conditions:[],turbe:[],notes:''}}]};
   else if(path===`/vtt/campaigns/${campaignId}/roster`&&request.method()==='GET')payload={members:[{userId,displayName:'GM prova',role:'gm'},{userId:playerId,displayName:'Giocatore prova',role:'player'}]};
   else if(path==='/vtt/character-availability'&&url.searchParams.get('campaignId')===campaignId&&request.method()==='GET')payload={characters:[{id:characterId,availableForPlayers:true}]};
    else if(path==='/vtt/character-assignments'&&url.searchParams.get('campaignId')===campaignId&&request.method()==='GET')payload={assignments:[]};
    else if(path.startsWith(`/vtt/campaigns/${campaignId}/equipment`)){
     const itemId=path.split('/')[5]??null;
     if(request.method()==='GET')payload={items:equipment};
     else if(request.method()==='PUT'){const value={...request.postDataJSON(),campaignId,source:'gm_custom'},index=equipment.findIndex(item=>item.id===value.id);if(index<0)equipment.unshift(value);else equipment[index]=value;writes.push({kind:'equipment',name:value.name});payload={item:value};}
     else if(request.method()==='DELETE'&&itemId){const index=equipment.findIndex(item=>item.id===itemId);if(index<0){status=404;payload={error:'Oggetto non trovato'};}else{equipment.splice(index,1);writes.push({kind:'equipment-delete'});payload={deleted:true};}}
     else{status=405;payload={error:'Metodo non previsto'};}
    }
    else if(path===`/vtt/campaigns/${campaignId}/documents/map`){
     if(request.method()==='GET')payload={value:mapDocument};
     else if(request.method()==='PUT'){mapDocument=request.postDataJSON().value;writes.push({kind:'map-document'});payload={value:mapDocument};}
     else if(request.method()==='DELETE'){mapDocument=null;payload={deleted:true};}
     else{status=405;payload={error:'Metodo non previsto'};}
    }
    else if(path===`/vtt/campaigns/${campaignId}/documents/phases`){
     if(request.method()==='GET')payload={value:phasesDocument};
     else if(request.method()==='PUT'){phasesDocument=request.postDataJSON().value;writes.push({kind:'phases-document'});payload={value:phasesDocument};}
     else if(request.method()==='DELETE'){phasesDocument=null;payload={deleted:true};}
     else{status=405;payload={error:'Metodo non previsto'};}
    }
    else if(path===`/vtt/campaigns/${campaignId}/documents/combat`){
     if(request.method()==='GET')payload={value:combatDocument};
     else if(request.method()==='PUT'){combatDocument=request.postDataJSON().value;writes.push({kind:'combat-document'});payload={value:combatDocument};}
     else{status=405;payload={error:'Metodo non previsto'};}
    }
     else if(path===`/vtt/campaigns/${campaignId}/documents/active-encounter`&&request.method()==='GET')payload={value:null};
     else if(new RegExp(`^/vtt/campaigns/${campaignId}/documents/(active-scene|session-map-placements|session-map-grids|session-map-tokens|session-map-drawings|session-map-pois|session-map-fog|session-map-object-order)$`).test(path)){
      const key=path.split('/').at(-1);
      if(request.method()==='GET')payload={value:sessionDocuments.get(key)??null};
      else if(request.method()==='PUT'){const value=request.postDataJSON().value;sessionDocuments.set(key,value);writes.push({kind:'session-document',key});payload={value};}
      else if(request.method()==='DELETE'){sessionDocuments.delete(key);payload={deleted:true};}
      else{status=405;payload={error:'Metodo non previsto'};}
     }
    else if(/^\/vtt\/campaigns\/[0-9a-f-]{36}\/visual-assets\/[0-9a-f-]{36}\/content$/i.test(path)&&request.method()==='GET'){
     await route.fulfill({status:200,contentType:'image/png',headers:{'cache-control':'private, max-age=300'},body:pngPixel});
     return;
    }
    else if(path.startsWith(`/vtt/campaigns/${campaignId}/visual-assets`)){
     const assetId=path.split('/')[5]??null;
     if(request.method()==='GET')payload={items:visualAssets.map(item=>({...item,imageDataUrl:''}))};
     else if(request.method()==='PUT'){const item={...request.postDataJSON(),campaignId,createdAt:timestamp};visualAssets.unshift(item);writes.push({kind:'visual-asset',name:item.name});payload={item};}
     else if(request.method()==='DELETE'&&assetId){const index=visualAssets.findIndex(item=>item.id===assetId);if(index<0){status=404;payload={error:'Asset non trovato'};}else{visualAssets.splice(index,1);writes.push({kind:'visual-asset-delete'});payload={deleted:true};}}
     else{status=405;payload={error:'Metodo non previsto'};}
    }
   else if(path.startsWith(`/vtt/campaigns/${campaignId}/narrative/`)){
    const parts=path.split('/'),kind=parts[5],itemId=parts[6]??null;
    if(!Object.hasOwn(narrative,kind)){status=404;payload={error:'Tipo narrativo non previsto'};}
    else if(request.method()==='GET')payload={items:narrative[kind]};
    else if(request.method()==='PUT'){
     const item={...request.postDataJSON(),campaignId},index=narrative[kind].findIndex(value=>value.id===item.id);
     if(index<0)narrative[kind].unshift(item);else narrative[kind][index]=item;
     writes.push({kind:'narrative',contentKind:kind,chapterId:item.chapterId,sceneId:item.sceneId});payload={item};
    }else if(request.method()==='DELETE'&&itemId){const index=narrative[kind].findIndex(value=>value.id===itemId);if(index<0){status=404;payload={error:'Contenuto non trovato'};}else{narrative[kind].splice(index,1);writes.push({kind:'narrative-delete',contentKind:kind});payload={deleted:true};}}
    else{status=405;payload={error:'Metodo non previsto'};}
   }
   else if(path===`/vtt/campaigns/${campaignId}/chapters`&&request.method()==='PUT'){
   chapter={...chapter,...request.postDataJSON(),campaignId};writes.push({kind:'chapter',title:chapter.title});payload={chapter};
   }else if(path===`/vtt/characters/${characterId}`&&request.method()==='PUT'){
    const body=request.postDataJSON();lastCharacterSheet=body.sheetData;
    writes.push({kind:'character-sheet'});
    payload={character:{id:characterId,campaignId,ownerId:userId,name:body.name,status:'active',sheetData:body.sheetData}};
  }else if(path===`/vtt/campaigns/${campaignId}/scenes`&&request.method()==='PUT'){
   if(failNextScenePut){failNextScenePut=false;status=500;payload={error:'Errore simulato'};}
   else {scene={...scene,...request.postDataJSON(),campaignId};writes.push({kind:'scene',title:scene.title});payload={scene};}
  }else {status=404;payload={error:'Endpoint non previsto dal browser test'};}
  await route.fulfill({status,contentType:'application/json; charset=utf-8',headers:{'cache-control':'no-store'},body:JSON.stringify(payload)});
 });

 await page.goto(base,{waitUntil:'domcontentloaded'});
 const shell=page.locator('.workspace[data-dashboard-palette="noir"]');
 await shell.waitFor();
 assert.equal(await shell.locator(':scope > aside').count(),1);
 assert.equal(await shell.locator(':scope > .main-area').count(),1);
 assert.equal(await shell.locator(':scope > .main-area > header').count(),1);
 assert.equal(await shell.locator(':scope > .main-area > .main-workspace-row > main.content').count(),1);
 assert.equal(await shell.locator('main main').count(),0,'AppShell must not create a nested main landmark');
 await page.getByRole('button',{name:'Campagne',exact:true}).click();
 await page.getByRole('button',{name:/Campagna browser/}).first().click();
 await page.getByRole('button',{name:'Capitoli e Scene',exact:true}).click();
 const editor=page.getByRole('region',{name:'Capitoli e Scene'});
 await editor.waitFor();

 // Chapter cancel restores the authoritative value and performs no write.
 await editor.getByRole('button',{name:'Modifica Capitolo'}).click();
 const chapterTitle=editor.getByLabel('Titolo').first();
 await chapterTitle.fill('Titolo da scartare');
 page.once('dialog',dialog=>dialog.accept());
 await editor.getByRole('button',{name:'Annulla modifiche Capitolo'}).click();
 assert.equal(await chapterTitle.inputValue(),'Il varco');
 assert.equal(writes.length,0);

 // Chapter save writes through Aruba and exits edit mode only after reload.
 await editor.getByRole('button',{name:'Modifica Capitolo'}).click();
 await chapterTitle.fill('Il varco salvato');
 const saveChapter=editor.getByRole('button',{name:'Salva modifiche Capitolo'});
 if(await saveChapter.isDisabled())console.error('Chapter save diagnostic:',{value:await chapterTitle.inputValue(),errors,text:(await editor.innerText()).slice(0,1200)});
 await saveChapter.click();
 await editor.getByRole('button',{name:'Modifica Capitolo'}).waitFor();
 assert.deepEqual(writes.at(-1),{kind:'chapter',title:'Il varco salvato'});

 // Original narrative scope assigns an unscoped Clue to the Chapter.
 await editor.getByRole('tab',{name:'Contenuti'}).click();
 const chapterContent=editor.getByRole('region',{name:'Contenuti del capitolo'});
 await chapterContent.getByLabel('Aggiungi Indizi').selectOption(clueId);
 await chapterContent.getByText('Sigillo spezzato',{exact:true}).waitFor();
  assert.deepEqual(writes.at(-1),{kind:'narrative',contentKind:'clues',chapterId,sceneId:null});

 // Open the Scene through the original panel order, then cancel and save.
 await editor.getByRole('tab',{name:'Scene'}).click();
 const sceneRegion=editor.getByRole('region',{name:'Scene del capitolo'});
 await sceneRegion.getByRole('button',{name:/^Atrio/}).click();
 await sceneRegion.getByRole('button',{name:'Modifica Scena'}).click();
 const sceneTitle=sceneRegion.getByLabel('Titolo').first();
 await sceneTitle.fill('Scena da scartare');
 page.once('dialog',dialog=>dialog.accept());
 await sceneRegion.getByRole('button',{name:'Annulla modifiche Scena'}).click();
 assert.equal(await sceneTitle.inputValue(),'Atrio');

 await sceneRegion.getByRole('button',{name:'Modifica Scena'}).click();
 await sceneTitle.fill('Atrio salvato');
 await sceneRegion.getByRole('button',{name:'Salva modifiche Scena'}).click();
 await sceneRegion.getByRole('button',{name:'Modifica Scena'}).waitFor();
 assert.deepEqual(writes.at(-1),{kind:'scene',title:'Atrio salvato'});

 // Moving the same Clue into the Scene and removing it returns it to Chapter scope.
 await sceneRegion.getByRole('tab',{name:'Contenuti'}).click();
 const sceneContent=sceneRegion.getByRole('region',{name:'Contenuti della scena'});
 await sceneContent.getByLabel('Aggiungi Indizi').selectOption(clueId);
 await sceneContent.getByText('Sigillo spezzato',{exact:true}).waitFor();
 assert.deepEqual(writes.at(-1),{kind:'narrative',contentKind:'clues',chapterId,sceneId});
 await sceneContent.getByRole('button',{name:'Rimuovi Sigillo spezzato'}).click();
 await sceneContent.getByText('Nessun contenuto assegnato.').first().waitFor();
 assert.deepEqual(writes.at(-1),{kind:'narrative',contentKind:'clues',chapterId,sceneId:null});

 // A rejected save must preserve the draft and edit mode for retry/cancel.
 failNextScenePut=true;
 await sceneRegion.getByRole('button',{name:'Modifica Scena'}).click();
 await sceneTitle.fill('Bozza dopo errore');
 await sceneRegion.getByRole('button',{name:'Salva modifiche Scena'}).click();
 await editor.getByRole('alert').filter({hasText:'Operazione scene non riuscita'}).waitFor();
 assert.equal(await sceneRegion.getByRole('button',{name:'Annulla modifiche Scena'}).isVisible(),true);
  assert.equal(await sceneTitle.inputValue(),'Bozza dopo errore');
  assert.deepEqual(errors,[]);
  // Dedicated archive route creates, edits and deletes through the same Aruba API.
  await page.getByRole('button',{name:'PNG',exact:true}).click();
  const archive=page.getByRole('region',{name:'Archivio PNG'});
  await archive.getByRole('button',{name:'Nuovo PNG'}).click();
  await archive.getByLabel('Nome').fill('Custode del varco');
  await archive.getByLabel('Ruolo').fill('Guardiano');
  await archive.getByRole('button',{name:'Salva'}).click();
  await archive.getByText('Custode del varco',{exact:true}).first().waitFor();
  assert.equal(narrative.npcs[0].role,'Guardiano');
  page.once('dialog',dialog=>dialog.accept());
  await archive.getByRole('button',{name:'Elimina'}).click();
  assert.deepEqual(writes.at(-1),{kind:'narrative-delete',contentKind:'npcs'});
  // Events retain original consequences and choice outcomes on Aruba.
  await page.getByRole('button',{name:'Eventi',exact:true}).click();
  const events=page.getByRole('region',{name:'Archivio Eventi'});
  await events.getByRole('button',{name:'Nuovo Evento'}).click();
  await events.getByLabel('Titolo').fill('Il ponte crolla');
  await events.getByLabel('Innesco').fill('Il sigillo viene spezzato');
  await events.getByLabel('Conseguenze').fill('La via di fuga si chiude\nIl rumore attira i custodi');
  await events.getByLabel('Scelte e risultati').fill('Saltare => Si raggiunge l’altra sponda\nRestare => Il gruppo affronta i custodi');
  await events.getByRole('button',{name:'Salva'}).click();
  await events.getByText('Il ponte crolla',{exact:true}).first().waitFor();
  assert.equal(narrative.events[0].consequences.length,2);
  assert.equal(narrative.events[0].choices[1].outcome,'Il gruppo affronta i custodi');
  // Equipment Catalog performs capability-gated Aruba CRUD with original fields.
  await page.getByRole('button',{name:'Archivio Oggetti',exact:true}).click();
  const catalog=page.getByRole('region',{name:'Archivio Oggetti'});
  await catalog.getByRole('button',{name:'Nuovo oggetto'}).click();
  await catalog.getByLabel('Nome').fill('Lanterna d’ottone');
  await catalog.getByLabel('Tipo').selectOption('trasportabile');
  await catalog.getByLabel('Rarità').selectOption('rare');
  await catalog.getByLabel('Descrizione').fill('Illumina il varco.');
  await catalog.getByLabel('Tag',{exact:true}).fill('luce, varco');
  // Item images use the same Aruba visual-asset store, never Supabase.
  await catalog.getByLabel('Carica immagine oggetto').setInputFiles({name:'lanterna.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nKsAAAAASUVORK5CYII=','base64')});
  await catalog.locator('.aruba-item-image-preview').waitFor();
  assert.equal(visualAssets[0].type,'item-image');
  assert.match(visualAssets[0].thumbnailDataUrl,/^data:image\/png;base64,/);
  await catalog.getByRole('button',{name:'Salva'}).click();
  await catalog.getByText('Lanterna d’ottone',{exact:true}).first().waitFor();
  assert.equal(equipment[0].rarity,'rare');
  assert.equal(equipment[0].imageAssetId,visualAssets[0].id);
  assert.equal(writes.some(write=>write.kind==='visual-asset'&&write.name==='lanterna.png'),true);
  page.once('dialog',dialog=>dialog.accept());
  await catalog.getByRole('button',{name:'Elimina'}).click();
  assert.deepEqual(writes.at(-1),{kind:'equipment-delete'});
  // The original SessionWorkspace loads Chapters/Scenes and persists its active scene through Aruba.
  await page.getByRole('button',{name:'Mappa legacy',exact:true}).click();
  const gameMap=page.getByRole('region',{name:'Workspace mappa Aruba'});
  await gameMap.getByText('Capitoli e Scene',{exact:true}).waitFor();
  // The original workspace owns the single main landmark; the AppShell content
  // slot stays in place with identical classes, so geometry does not change.
  assert.equal(await page.locator('main').count(),1,'Session route must expose exactly one main landmark');
  assert.equal(await page.locator('main main').count(),0,'Session route must not nest main landmarks');
  assert.equal(await shell.locator(':scope > .main-area > .main-workspace-row > .content').count(),1);
  assert.equal(await shell.locator(':scope > .main-area > .main-workspace-row > .content > section[aria-label="Workspace mappa Aruba"]').count(),1);
  assert.equal(await shell.locator(':scope > .main-area > .main-workspace-row > main.content').count(),0);
  await gameMap.getByRole('button',{name:/^Atrio/}).click();
  for(let attempt=0;attempt<20&&sessionDocuments.get('active-scene')?.sceneId!==sceneId;attempt++)
   await page.waitForTimeout(100);
  if(sessionDocuments.get('active-scene')?.sceneId!==sceneId)
   console.error('Active scene diagnostic:',[...sessionDocuments.entries()]);
  assert.equal(sessionDocuments.get('active-scene')?.sceneId,sceneId);
  const moveTool=page.getByRole('button',{name:'Muovi',exact:true});
  for(let attempt=0;attempt<50&&!await moveTool.isEnabled();attempt++)await page.waitForTimeout(100);
  assert.equal(await moveTool.isEnabled(),true);
  await moveTool.click();
  assert.equal(await moveTool.getAttribute('aria-pressed'),'true');
  // Grid settings persist to the real per-Chapter Aruba document.
  const gridTool=page.getByRole('button',{name:'Griglia',exact:true});
  assert.equal(await gridTool.isEnabled(),true);
  await gridTool.click();
  const snapToggle=page.getByRole('button',{name:'Snap alla griglia'});
  await snapToggle.waitFor();
  const snapBefore=await snapToggle.getAttribute('aria-pressed');
  await snapToggle.click();
  for(let attempt=0;attempt<30&&!sessionDocuments.get('session-map-grids')?.[chapterId];attempt++)
   await page.waitForTimeout(100);
  assert.equal(typeof sessionDocuments.get('session-map-grids')?.[chapterId]?.snap,'boolean');
  assert.equal(sessionDocuments.get('session-map-grids')[chapterId].snap,snapBefore!=='true');
  // Original GamePhases persists progression and notes instead of simulating local state.
  await page.getByRole('button',{name:'Fasi di Gioco',exact:true}).click();
  const phases=page.getByRole('region',{name:'Fasi di Gioco Aruba'});
  await phases.getByRole('button',{name:'Successiva'}).click();
  await phases.getByRole('button',{name:'In corso'}).first().click();
  await phases.getByPlaceholder('Annotazioni sulla sessione di gioco...').fill('Investigazione avviata.');
  await page.waitForTimeout(500);
  assert.equal(phasesDocument.currentPhase,1);
  assert.equal(phasesDocument.phases[0].completed,true);
  assert.equal(phasesDocument.sessionNotes,'Investigazione avviata.');
  // Original CombatTracker persists its authoritative turn state on Aruba.
  await page.getByRole('button',{name:'Combattimento',exact:true}).click();
  const combat=page.getByRole('region',{name:'Combattimento Aruba'});
  await combat.getByRole('heading',{name:'Tracker Combattimento'}).waitFor();
  await combat.getByRole('button',{name:'+ PG'}).click();
  await combat.getByRole('button',{name:'+ Mostro'}).click();
  await combat.getByRole('button',{name:'Inizia Combattimento'}).click();
  await combat.getByRole('button',{name:'Prossimo Turno'}).click();
  await page.waitForTimeout(500);
  assert.equal(combatDocument.combatants.length,2);
  assert.equal(combatDocument.inCombat,true);
  assert.equal(combatDocument.currentTurn,1);
  // Original VisualAssetsManager uploads and deletes only through Aruba binary storage.
  await page.getByRole('button',{name:'Asset Grafici',exact:true}).focus();
  await page.getByRole('button',{name:'Asset Grafici',exact:true}).press('Enter');
  const assets=page.getByRole('region',{name:'Asset Grafici Aruba'});
  await assets.locator('input[type="file"]').setInputFiles({name:'cornice.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nKsAAAAASUVORK5CYII=','base64')});
  await assets.getByPlaceholder('Nome asset, es. Cornice mostro').fill('Cornice del varco');
  await assets.getByRole('button',{name:'Carica immagine'}).click();
  await assets.getByText('Cornice del varco',{exact:true}).waitFor();
  // The item image uploaded earlier remains in the same authoritative store.
  assert.equal(visualAssets.length,2);
  assert.equal(visualAssets.some(asset=>asset.type==='item-image'),true);
  await assets.getByRole('button',{name:'Elimina'}).first().click();
  await assets.getByRole('button',{name:'Elimina'}).last().click();
  await page.waitForTimeout(100);
  assert.equal(visualAssets.length,1);
  assert.equal(visualAssets[0].type,'item-image');
  // A frame remains available for the ORIGINAL character image tab.
  visualAssets.push({id:frameAssetId,campaignId,name:'Cornice del varco QA',type:'frame',imageDataUrl:'',thumbnailDataUrl:pngDataUrl,createdAt:timestamp});
  // Preparation reads the authoritative Chapter/Scene graph and scoped content.
  await page.getByRole('button',{name:'Preparazione',exact:true}).click();
  const preparation=page.getByRole('region',{name:'Preparazione Scene e Incontri'});
  await preparation.getByLabel('Seleziona scena').selectOption(sceneId);
  await preparation.getByRole('heading',{name:'Atrio salvato'}).waitFor();
  await preparation.getByText('Sigillo spezzato',{exact:true}).waitFor();
  // Schede uses verified roster and availability data from Aruba.
  await page.getByRole('button',{name:'Schede',exact:true}).click();
  const sheets=page.getByRole('region',{name:'Schede della campagna'});
  await sheets.getByRole('region',{name:'Partecipante GM prova'}).waitFor();
  await sheets.getByLabel('Disponibilità di Mara Voss').waitFor();
  await sheets.getByLabel('Apri scheda campagna di Mara Voss').click();
  await page.getByRole('button',{name:'Torna ai personaggi'}).waitFor();
  // Original EntityImageExtras: frames and cover persist only through Aruba.
  await page.getByRole('button',{name:'Immagine',exact:true}).click();
  const imageSection=page.getByRole('region',{name:'Immagini di Mara Voss'});
  await imageSection.getByText('Cornice portrait',{exact:true}).waitFor();
  const frameSelect=imageSection.getByText('Cornice foto PG',{exact:true}).locator('..').locator('select');
  const frameOption=frameSelect.locator(`option[value="${frameAssetId}"]`);
  await frameOption.waitFor({state:'attached',timeout:5000});
  assert.equal(await frameOption.count(),1);
  await frameSelect.selectOption(frameAssetId);
  await page.waitForTimeout(600);
  assert.equal(lastCharacterSheet.coverFrameAssetId,frameAssetId);
  await imageSection.locator('input[type="file"]').setInputFiles({name:'copertina.png',mimeType:'image/png',buffer:pngPixel});
  for(let i=0;i<60&&!visualAssets.some(asset=>asset.type==='other');i++)await page.waitForTimeout(100);
  const cover=visualAssets.find(asset=>asset.type==='other');
  assert.ok(cover,'cover visual asset not stored');
  assert.equal(cover.name,'Copertina di Mara Voss');
  assert.match(cover.thumbnailDataUrl,/^data:image\/png;base64,/);
  for(let i=0;i<60&&!/^\/vtt\/campaigns\/[0-9a-f-]+\/visual-assets\/[0-9a-f-]+\/content$/.test(lastCharacterSheet?.coverImageUrl??'');i++)await page.waitForTimeout(100);
  assert.match(lastCharacterSheet.coverImageUrl,/^\/vtt\/campaigns\/[0-9a-f-]+\/visual-assets\/[0-9a-f-]+\/content$/);
  assert.doesNotMatch(JSON.stringify(lastCharacterSheet),/data:image\//);
  // Original TokenStyleEditor persists token style fields through the same sheet API.
  await page.getByRole('button',{name:'Token',exact:true}).click();
  await page.getByLabel('Colore token').evaluate(element=>{
   const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
   setter?.call(element,'#123456');
   element.dispatchEvent(new Event('input',{bubbles:true}));
   element.dispatchEvent(new Event('change',{bubbles:true}));
  });
  for(let i=0;i<40&&lastCharacterSheet?.tokenColor!=='#123456';i++)await page.waitForTimeout(100);
  assert.equal(lastCharacterSheet.tokenColor,'#123456');
  const viewports=[[360,800],[390,844],[768,1024],[1280,720],[1440,900],[1920,1080]];
   for(const [width,height] of viewports){await page.setViewportSize({width,height});const shot=await page.screenshot({type:'png'});assert.ok(shot.length>1000,`Screenshot ${width}x${height} non valido`);assert.equal(await page.getByRole('button',{name:'Torna ai personaggi'}).isVisible(),true);}
   await page.getByRole('button',{name:'Torna ai personaggi'}).click();
   await page.setViewportSize({width:1440,height:900});
   await page.getByRole('button',{name:'Campagne',exact:true}).click();
   await page.getByRole('button',{name:'Entra nella campagna'}).click();
   const home=page.locator('[data-aruba-campaign-home]');
   await home.getByText('Giocatore prova',{exact:true}).waitFor();
   const gmCard=home.getByText('GM prova',{exact:true}).locator('../..');
   assert.equal(Math.round((await gmCard.boundingBox()).width),320,'desktop GM column must match original 320px grid');
   assert.equal(await home.getByRole('alert').count(),0);
   assert.equal(await home.getByRole('button',{name:'Avvia sessione',exact:true}).isDisabled(),true);
   assert.equal(await home.getByRole('button',{name:'Invita giocatori',exact:true}).isDisabled(),true);
   assert.equal(await page.getByRole('button',{name:'Incontri',exact:true}).isDisabled(),true);
   await home.getByRole('button',{name:'Precompilati',exact:true}).click();
   await home.getByText('Mara Voss',{exact:true}).waitFor();
   await home.getByText('Mara Voss',{exact:true}).click();
   await page.getByRole('button',{name:'Torna ai personaggi'}).click();
   await home.getByRole('button',{name:'Tutti',exact:true}).click();
   for(const [width,height] of viewports){
    await page.setViewportSize({width,height});
    assert.ok((await page.screenshot({type:'png'})).length>1000);
    assert.equal(await home.isVisible(),true);
   }
   await page.setViewportSize({width:1440,height:900});
   await home.getByRole('button',{name:'Menu campagna'}).click();
   await page.getByRole('menuitem',{name:'Gestione campagna'}).click();
   // A failed assignment read must not publish a trusted empty snapshot.
   await page.route('**/vtt/character-assignments?*',route=>route.fulfill({status:503,contentType:'application/json',body:'{}'}));
   await page.getByRole('button',{name:'Entra nella campagna'}).click();
   await home.getByRole('alert').waitFor();
   assert.equal(await home.getByText('Giocatore prova',{exact:true}).count(),0);
   assert.deepEqual(errors,[]);
  console.log('GM Chromium QA passed: CRUD/persistence modules, Schede detail and six viewport screenshots.');
}finally{await browser.close();}
