import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const base='http://127.0.0.1:4173/vtt/';
const playerId='ca3465ec-47d7-4021-9f0d-e70da8cbd099';
const ownerId='4a3465ec-47d7-4021-9f0d-e70da8cbd001';
const campaignId='f24f6bdd-a5f7-4521-aa16-bc0854dc5841';
const characterId='d2244c0b-4b67-45c2-901a-2b4d3f7c8c42';
const timestamp='2026-11-16T12:00:00.000Z';
const campaign={id:campaignId,ownerId,name:'Campagna giocatore',description:'Accesso assegnato',ruleset:'hsc',createdAt:timestamp};
const character={id:characterId,campaignId,ownerId,name:'Mara assegnata',status:'active',createdAt:timestamp,updatedAt:timestamp,
 sheetData:{name:'Mara assegnata',style:'Custode',viaggio:'Il Varco',description:'Scheda in sola lettura',
  ambiti:{Fisico:2,Scuola:1,Carisma:1,Strada:1},
  abilita:{Muscoli:1,Sport:1,Acrobatica:1,Resistenza:1,Freddezza:1,Cultura:1,Tecnologia:1,Studio:1,'Pronto Soccorso':1,Scienze:1,Esibirsi:1,Parlantina:1,Fascino:1,Intuito:1,Leadership:1,Furtività:1,Mira:1,Sopravvivenza:1,Crimine:1,Allerta:1},
  freschezza:12,maxFreschezza:12,caselleFrischezzaCruciali:[8,12],follia:9,maxFollia:9,
  tratti:[],equipment:[],conditions:[],turbe:[],notes:''}};
const capabilities={campaigns:{read:true,write:true},characters:{read:true,write:true},
 chapters:{read:false,write:false},scenes:{read:false,write:false},narrativeContent:{read:false,write:false},
 equipmentCatalog:{read:false,write:false},campaignDocuments:{read:false,write:false},visualAssets:{read:false,write:false},
 campaignRoster:{read:true,write:false},characterAvailability:{read:true,write:true},
 characterAssignments:{read:true,write:true},playerCharacters:{read:true,write:false},characterPortraits:{read:false,write:false},
  gameSession:true};

const browser=await chromium.launch({headless:true,args:['--no-sandbox'],
 ...(process.env.HG_BROWSER_EXECUTABLE?{executablePath:process.env.HG_BROWSER_EXECUTABLE}:{})});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],webSockets=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('websocket',socket=>webSockets.push(socket.url()));
 let assigned=true,playerCharacterReads=0,ownerRosterReads=0,ownerCharacterReads=0;
 await page.route('**/vtt/**',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname;
  if(path==='/vtt/'||path==='/vtt/index.html'||path.startsWith('/vtt/assets/'))return route.continue();
  let status=200,payload={};
  if(path==='/vtt/bootstrap')payload={backend:'aruba-staging',user:{id:playerId,email:'player@example.invalid',displayName:'Giocatore prova',role:'standard'},capabilities,
   campaignMemberships:[{userId:playerId,campaignId,role:'player'}]};
  else if(path==='/vtt/campaigns'){payload={campaigns:[]};}
  else if(path==='/vtt/player-campaigns')payload={campaigns:[campaign]};
  else if(path==='/vtt/player-characters'&&url.searchParams.get('campaignId')===campaignId){playerCharacterReads++;payload={characters:assigned?[character]:[]};}
  else if(path===`/vtt/campaigns/${campaignId}/roster`){ownerRosterReads++;status=403;payload={error:'Vietato'};}
  else if(path==='/vtt/characters'){ownerCharacterReads++;status=403;payload={error:'Vietato'};}
  else {status=404;payload={error:'Endpoint non previsto'};}
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(payload)});
 });
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'Campagne',exact:true}).click();
 await page.getByRole('button',{name:/Campagna giocatore[\s\S]*Creata il/}).click();
 await page.getByText('CAMPAGNA SELEZIONATA · GIOCATORE',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Modifica nome e descrizione'}).count(),0);
 assert.equal(await page.locator('.gm-sidebar').count(),0);
 await page.getByRole('button',{name:'Entra nella campagna'}).click();
 const home=page.locator('[data-aruba-campaign-home]');
 await home.getByText('Mara assegnata',{exact:true}).waitFor();
 await page.getByRole('region',{name:'Sessione multiplayer GIOCATORE'}).waitFor();
  assert.equal(await home.getByRole('button',{name:'Entra nella sessione'}).count(),1);
 assert.equal(await page.getByRole('button',{name:'Apri connessione gm'}).count(),0);
  assert.deepEqual(webSockets,[],'the opt-in transport must remain closed until the player explicitly opens it');
  await home.getByRole('button',{name:'Entra nella sessione'}).click();
  await home.getByRole('button',{name:'Esci dalla sessione'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Panoramica',exact:true}).count(),0,'live player shell must hide the dashboard left rail');
  await page.waitForTimeout(100);
  assert.equal(webSockets.length,1,'explicit CampaignHome entry must be the only action that opens signaling');
  await home.getByRole('button',{name:'Esci dalla sessione'}).click();
  await home.getByRole('button',{name:'Entra nella sessione'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Panoramica',exact:true}).count(),1,'leaving the session must restore dashboard navigation');
  assert.equal(await home.getByRole('button',{name:'Avvia sessione'}).count(),0);
 assert.equal(await home.getByRole('button',{name:'Invita giocatori'}).count(),0);
 assert.equal(await page.getByRole('button',{name:'Incontri'}).count(),0);
 assert.equal(await page.getByRole('button',{name:'Combattimenti'}).count(),0);
 assert.equal(ownerRosterReads,0);assert.equal(ownerCharacterReads,0);
 await home.getByText('Mara assegnata',{exact:true}).click();
 await page.getByRole('region',{name:'Scheda di Mara assegnata'}).waitFor();
 assert.ok(playerCharacterReads>=3,'list, CampaignHome and detail must independently authorize assignment');
 await page.getByRole('button',{name:'Torna ai personaggi'}).click();
 assigned=false;
 await home.getByText('Mara assegnata',{exact:true}).click();
 await page.getByRole('alert').filter({hasText:'non è più assegnato'}).waitFor();
 assert.deepEqual(errors,[]);
 console.log('Player CampaignHome Chromium QA passed: joined navigation, read-only detail, live-role gate, revocation and GM isolation.');
}finally{await browser.close();}
