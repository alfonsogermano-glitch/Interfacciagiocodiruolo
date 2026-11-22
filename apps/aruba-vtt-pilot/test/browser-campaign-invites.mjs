import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const base='http://127.0.0.1:4173/vtt/';
const ownerId='11111111-1111-4111-8111-111111111111';
const playerId='22222222-2222-4222-8222-222222222222';
const campaignId='33333333-3333-4333-8333-333333333333';
const code='HG-0123456789ABCDEF0123';
const timestamp='2026-11-16T12:00:00.000Z';
const campaign={id:campaignId,ownerId,name:'Il Varco degli Inviti',description:'Campagna controllata',ruleset:'hsc',createdAt:timestamp};
const caps={campaigns:{read:true,write:true},campaignInvites:{read:true,write:true},characters:{read:true,write:true},
 chapters:{read:false,write:false},scenes:{read:false,write:false},narrativeContent:{read:false,write:false},equipmentCatalog:{read:false,write:false},
 campaignDocuments:{read:false,write:false},visualAssets:{read:false,write:false},campaignRoster:{read:true,write:false},
 characterAvailability:{read:true,write:true},characterAssignments:{read:true,write:true},playerCharacters:{read:true,write:false},
 characterPortraits:{read:false,write:false},gameSession:false};

const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.HG_BROWSER_EXECUTABLE?{executablePath:process.env.HG_BROWSER_EXECUTABLE}:{})});
try{
 const owner=await browser.newPage({viewport:{width:1440,height:900}}),ownerErrors=[],ownerSockets=[];
 owner.on('pageerror',error=>ownerErrors.push(error.message));
 owner.on('websocket',socket=>ownerSockets.push(socket.url()));
 let rotations=0;
 await owner.route('**/vtt/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  if(path==='/vtt/'||path==='/vtt/index.html'||path.startsWith('/vtt/assets/'))return route.continue();
  let status=200,payload={};
  if(path==='/vtt/bootstrap')payload={backend:'aruba-staging',user:{id:ownerId,email:'owner@example.invalid',displayName:'Owner',role:'standard'},capabilities:{...caps,gameSession:true},campaignMemberships:[{userId:ownerId,campaignId,role:'gm'}]};
  else if(path==='/vtt/campaigns'&&request.method()==='GET')payload={campaigns:[campaign]};
  else if(path==='/vtt/player-campaigns')payload={campaigns:[]};
  else if(path===`/vtt/campaigns/${campaignId}/roster`)payload={members:[{userId:ownerId,displayName:'Owner',role:'gm'}]};
  else if(path==='/vtt/characters')payload={characters:[]};
  else if(path==='/vtt/character-availability')payload={characters:[]};
  else if(path==='/vtt/character-assignments')payload={assignments:[]};
  else if(path===`/vtt/campaigns/${campaignId}/invite-code`&&request.method()==='POST'){rotations++;payload={invite:{campaignId,code,expiresAt:'2026-11-23T12:00:00.000Z'}};}
  else {status=404;payload={error:'Endpoint non previsto'};}
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(payload)});
 });
 await owner.goto(base,{waitUntil:'domcontentloaded'});
 await owner.getByRole('button',{name:'Campagne',exact:true}).click();
 await owner.getByRole('button',{name:/Il Varco degli Inviti[\s\S]*Creata il/}).click();
 await owner.getByRole('button',{name:'Entra nella campagna'}).click();
 await owner.getByRole('button',{name:'Invita giocatori'}).click();
 await owner.getByRole('dialog',{name:'Invita giocatori'}).getByRole('button',{name:'Genera codice invito'}).click();
 await owner.getByText(code,{exact:true}).waitFor();
 assert.equal(rotations,1);assert.deepEqual(ownerErrors,[]);
 await owner.getByRole('button',{name:'Chiudi invito'}).click();
 assert.equal(await owner.getByText(code,{exact:true}).count(),0,'one-time code must leave the DOM when dialog closes');
 const ownerHome=owner.locator('[data-aruba-campaign-home]');
 assert.deepEqual(ownerSockets,[],'GM signaling must remain closed before explicit start');
 await ownerHome.getByRole('button',{name:'Avvia sessione'}).click();
 await ownerHome.getByRole('button',{name:'Termina'}).waitFor();
 assert.equal(await owner.getByRole('button',{name:'Panoramica',exact:true}).count(),0,'live GM shell must hide the dashboard left rail');
 await owner.waitForTimeout(100);
 assert.equal(ownerSockets.length,1,'explicit GM start must open exactly one signaling socket');
 await ownerHome.getByRole('button',{name:'Termina'}).click();
 await ownerHome.getByRole('button',{name:'Avvia sessione'}).waitFor();
 assert.equal(await owner.getByRole('button',{name:'Panoramica',exact:true}).count(),1,'ending the GM session must restore dashboard navigation');

 const player=await browser.newPage({viewport:{width:390,height:844}}),playerErrors=[];
 player.on('pageerror',error=>playerErrors.push(error.message));
 let previews=0,joins=0,characterWrites=0;
 await player.route('**/vtt/**',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname;
  if(path==='/vtt/'||path==='/vtt/index.html'||path.startsWith('/vtt/assets/'))return route.continue();
  let status=200,payload={};
  if(path==='/vtt/bootstrap')payload={backend:'aruba-staging',user:{id:playerId,email:'player@example.invalid',displayName:'Player',role:'standard'},capabilities:caps};
  else if(path==='/vtt/campaigns')payload={campaigns:[]};
  else if(path==='/vtt/player-campaigns')payload={campaigns:[]};
  else if(path==='/vtt/campaign-invites/preview'){previews++;assert.equal(url.searchParams.get('code'),code);payload={campaign};}
  else if(path==='/vtt/campaign-invites/join'){joins++;assert.deepEqual(request.postDataJSON(),{code});payload={campaign};}
  else if(path==='/vtt/player-characters')payload={characters:[]};
  else if(path.includes('character')){characterWrites++;status=403;payload={error:'Vietato'};}
  else {status=404;payload={error:'Endpoint non previsto'};}
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(payload)});
 });
 await player.goto(base,{waitUntil:'domcontentloaded'});
 await player.getByRole('button',{name:/Unisciti a sessione/}).click();
 const joinDialog=player.getByRole('dialog',{name:'Unisciti a una campagna'});
 await joinDialog.getByLabel('Codice invito').fill(code.toLowerCase());
 await joinDialog.getByRole('button',{name:'Continua'}).click();
 await joinDialog.getByText(campaign.name,{exact:true}).waitFor();
 await joinDialog.getByRole('button',{name:'Unisciti',exact:true}).click();
 await player.locator('[data-aruba-campaign-home]').waitFor();
 assert.equal(previews,1);assert.equal(joins,1);assert.equal(characterWrites,0);
 assert.deepEqual(playerErrors,[]);
 console.log('Campaign invites Chromium QA passed: owner one-time rotation, player preview/join, no character assignment.');
}finally{await browser.close();}
