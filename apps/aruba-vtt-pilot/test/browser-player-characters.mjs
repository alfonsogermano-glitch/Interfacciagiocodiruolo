// Real Chromium interaction of the player-facing original Character detail.
// In-memory fixtures only: never touches VPS, production, or user accounts.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base=process.env.HG_E2E_BASE??'http://127.0.0.1:4173';
const campaign='f24f6bdd-a5f7-4521-aa16-bc0854dc5841';
const owner='4a3465ec-47d7-4021-9f0d-e70da8cbd001';
const player='4a3465ec-47d7-4021-9f0d-e70da8cbd002';
const charId='d2344aae-20d0-4395-8039-49d0aa3657f9';
const fixture={id:charId,campaignId:campaign,ownerId:owner,name:'Mara',
 status:'active',sheetData:{name:'Mara',style:'Jock',viaggio:'Campione',
 description:'Personaggio assegnato',
 ambiti:{Fisico:2,Scuola:1,Carisma:1,Strada:1},
 abilita:{Muscoli:1,Sport:1,Acrobatica:1,Resistenza:1,Freddezza:1,
 Cultura:1,Tecnologia:1,Studio:1,'Pronto Soccorso':1,Scienze:1,
 Esibirsi:1,Parlantina:1,Fascino:1,Intuito:1,Leadership:1,
 Furtività:1,Mira:1,Sopravvivenza:1,Crimine:1,Allerta:1},
 freschezza:12,maxFreschezza:12,caselleFrischezzaCruciali:[8,12],follia:9,maxFollia:9,
 tratti:[],equipment:[],conditions:[],turbe:[],notes:''}};
const capabilities={
 campaigns:{read:true,write:true},characters:{read:true,write:true},
 campaignRoster:{read:true,write:false},
 characterAvailability:{read:true,write:true},
 characterAssignments:{read:true,write:true},
 playerCharacters:{read:true,write:false},
 entityNotes:{read:false,write:false},
 campaignNotes:{read:false,write:false},
 campaignNoteFolders:{read:false,write:false},
 originalNotesPanel:{read:false,write:false},gameSession:false,
};
let assigned=true;
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.route('**/vtt/**',async route=>{
  const req=route.request(),url=new URL(req.url());
  const path=url.pathname;
  if(path==='/vtt/'||path==='/vtt/index.html'||path.startsWith('/vtt/assets/'))
   return route.continue();
  requests.push({path,method:req.method()});
  let payload,status=200;
  if(path==='/vtt/bootstrap')payload={backend:'aruba-staging',
   user:{id:player,email:'player@example.invalid',displayName:'Giocatore prova',role:'standard'},
   capabilities};
  else if(path==='/vtt/campaigns')payload={campaigns:[]};
  else if(path==='/vtt/player-campaigns')payload={campaigns:[{
   id:campaign,ownerId:owner,name:'Campagna di prova',description:'Test giocatore',
   ruleset:'hsc',createdAt:'2026-11-12T00:00:00.000Z'}]};
  else if(path==='/vtt/player-characters'&&url.searchParams.get('campaignId')===campaign)
   payload={characters:assigned?[fixture]:[]};
  else {status=404;payload={error:'Endpoint not authorized in player browser test'};}
  return route.fulfill({status,contentType:'application/json; charset=utf-8',
   headers:{'cache-control':'no-store'},body:JSON.stringify(payload)});
 });
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'Personaggi',exact:true}).click();
 const region=page.getByRole('region',{name:'I miei personaggi assegnati'});
 await region.waitFor();
 await region.getByRole('button',{name:'Campagna di prova'}).waitFor();
 const opener=region.getByRole('button',{name:'Apri scheda assegnata di Mara'});
 await opener.click();
 try{
  await page.locator('[data-entity-context="player-assigned-detail"]').waitFor({state:'attached',timeout:8000});
  await page.getByRole('region',{name:'Scheda di Mara'}).waitFor({timeout:8000});
 }
 catch(e){
  console.error('PLAYER_DETAIL_DEBUG',JSON.stringify({
   openerCount:await opener.count(),overlayCount:await page.locator('[data-entity-context="player-assigned-detail"]').count(),
   body:(await page.locator('body').innerText()).slice(0,1600),
   errors,requests,
  }));
  throw e;
 }
 await page.getByRole('region',{name:'Scheda di Mara'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Riprova salvataggio'}).count(),0);
 assert.equal(await page.getByRole('button',{name:/Archivia/}).count(),0);
 // Five ORIGINAL HSC tabs remain navigable, but never grant mutations.
 // Fieldsets may contain nested controls: all native inputs/buttons inside
 // the readonly character data must be disabled, while tab navigation remains active.
 const sheet=page.getByRole('region',{name:'Scheda di Mara'});
 const baseTabs=[
  ['summary','FISICO'],['conditions','Condizioni attive'],
  ['equipment','Equipaggiamento'],['origins','Stile'],['storia','Storia']
 ];
 for(const [tab,heading] of baseTabs){
  const tabButton=page.locator('[data-tab-id="'+tab+'"] button').first();
  await tabButton.click();
  assert.equal(await tabButton.isEnabled(),true,'Original navigation must work: '+tab);
  await sheet.getByText(heading,{exact:false}).first().waitFor();
  const controls=sheet.locator('fieldset button, fieldset input, fieldset textarea, fieldset select');
  const count=await controls.count();
  assert.ok(count>0,'Original tab must contain actual readonly controls: '+tab);
  for(let i=0;i<count;i++){
   assert.equal(await controls.nth(i).isDisabled(),true,
    'Editable control escaped readonly fieldset: '+tab+' #'+i);
  }
 }
 assert.equal(await page.getByRole('button',{name:'Aggiungi tab'}).count(),0,
  'Read-only player cannot add custom character tabs');
 // Original contextual rail: image has a static Aruba-only preview,
 // token reuses the original shape preview with all editing controls disabled.
 const rail=page.getByLabel('Barra contestuale personaggio');
 await rail.getByRole('button',{name:'Immagine'}).click();
 const image=sheet.locator('[data-aruba-readonly-media="true"]');
 await image.waitFor();
 await image.getByText('Nessuna immagine migrata disponibile.').waitFor();
 assert.equal(await image.locator('input, button, select, textarea').count(),0,
  'Player image preview must contain no editor controls');
 await rail.getByRole('button',{name:'Token'}).click();
 await sheet.getByText('Token mappa').waitFor();
 const tokenControls=sheet.locator('fieldset button, fieldset input, fieldset select, fieldset textarea');
 assert.ok(await tokenControls.count()>0,'Original TokenStyleEditor controls must be present');
 for(let i=0;i<await tokenControls.count();i++)
  assert.equal(await tokenControls.nth(i).isDisabled(),true,
   'Player token editor control unexpectedly active: '+i);
 await rail.getByRole('button',{name:'Scheda'}).click();
 await page.locator('[data-tab-id="summary"] button').first().waitFor();
 assert.equal(requests.some(x=>/supabase|storage\/v1|image-assets/i.test(x.path)),false,
  'Player media view must not query legacy image storage');
 // Reopen summary so the original rail remains in its expected default state.
 await page.locator('[data-tab-id="summary"] button').first().click();
 assert.equal(requests.some(x=>x.path==='/vtt/characters'),false,
  'Player sheet must not use the GM character API');
 assert.equal(requests.some(x=>x.path.startsWith('/vtt/character-assignments')),false,
  'Player sheet must not query the GM assignment API');
 assert.equal(requests.some(x=>x.method!=='GET'),false,
  'Player viewer must not send character mutations');
 // The GM revokes assignment while the player has this sheet open.
 // On focus the player must lose the sheet without refreshing the page.
 assigned=false;
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await page.getByRole('alert').filter({hasText:'assegnazione revocata'}).waitFor();
 await page.locator('[data-entity-context="player-assigned-detail"]').waitFor({state:'detached'});
 assert.equal(await region.getByRole('button',{name:'Apri scheda assegnata di Mara'}).count(),0);
 // Revocation was read through a fresh player-only GET; never a GM endpoint.
 assert.ok(requests.filter(x=>x.path==='/vtt/player-characters').length>=3);
 assert.equal(requests.some(x=>x.method!=='GET'),false);
 assert.deepEqual(errors,[]);
 await page.close();
 console.log('Player character Chromium QA passed: joined campaign, assigned PG, original readonly detail, no owner endpoints or mutations.');
}finally{await browser.close();}
