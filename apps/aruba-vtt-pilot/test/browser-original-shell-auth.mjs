import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:4175/vtt/original-shell-auth.html';
const owner='00000000-0000-4000-8000-000000000002';
const outsider='00000000-0000-4000-8000-000000000009';
const characters=[{id:'00000000-0000-4000-8000-000000000010',campaignId:'00000000-0000-4000-8000-000000000001',ownerId:owner,name:'Investigatore Aruba',status:'draft',sheetData:{}}];
const campaigns=[
 {id:'00000000-0000-4000-8000-000000000001',ownerId:owner,name:'Campagna Aruba del GM',description:'',ruleset:'hsc',createdAt:'2026-11-13T00:00:00Z'},
 {id:'00000000-0000-4000-8000-000000000003',ownerId:outsider,name:'Campagna estranea',description:'',ruleset:'hsc',createdAt:'2026-11-13T00:00:00Z'},
];
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const errors=[];
async function run(mode){
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const requests=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/vtt/bootstrap',async route=>{
  requests.push({path:'/vtt/bootstrap',method:route.request().method()});
  if(mode==='unauthorized')return route.fulfill({status:401,json:{error:'Not logged in'}});
  const allowed=mode!=='no-campaign-capability';
  return route.fulfill({json:{
   backend:'aruba-staging',
   user:{id:owner,email:'qa@example.org',displayName:'GM Aruba',role:'standard'},
   capabilities:{
    campaigns:{read:allowed,write:allowed},characters:{read:mode==='characters',write:mode==='characters'},
    gameSession:false,
   },
  }});
 });
 await page.route('**/vtt/campaigns',async route=>{
  requests.push({path:'/vtt/campaigns',method:route.request().method()});
  if(mode==='expired-campaign-session')return route.fulfill({status:401,json:{error:'Session expired'}});
  await route.fulfill({json:{campaigns:mode==='empty'?[]:campaigns}});
 });
 await page.route('**/vtt/characters?*',async route=>{
  requests.push({path:'/vtt/characters',method:route.request().method()});
  await route.fulfill({json:{characters}});
 });
 await page.goto(base,{waitUntil:'domcontentloaded'});
 if(mode==='unauthorized'){
  await page.locator('[data-original-shell-auth-state="unauthorized"]').waitFor();
  assert.equal(await page.locator('[data-original-shell-qa]').count(),0);
  assert.equal(requests.some(r=>r.path==='/vtt/campaigns'),false);
 }else if(mode==='no-campaign-capability'){
  await page.locator('[data-original-shell-auth-state="unavailable"]').waitFor();
  assert.equal(await page.locator('[data-original-shell-qa]').count(),0);
  assert.equal(requests.some(r=>r.path==='/vtt/campaigns'),false);
 }else if(mode==='expired-campaign-session'){
  await page.locator('[data-original-shell-auth-state="error"]').waitFor();
  assert.equal(await page.locator('[data-original-shell-qa]').count(),0);
  assert.equal(requests.filter(r=>r.path==='/vtt/campaigns').length,1);
 }else{
  await page.locator('[data-original-shell-auth-state="ready"]').waitFor();
  const originalTopbar=page.locator('header.sticky');
  await originalTopbar.waitFor();
  assert.ok(await originalTopbar.getByText('GM Aruba').count()>0);
  assert.equal(await originalTopbar.getByRole('button',{name:'Notifiche'}).count(),1);
  assert.equal(await page.locator('[data-original-topbar-slot]').count(),0,
   'Authenticated QA must mount the genuine TopBar, not its placeholder');
  assert.equal(await originalTopbar.locator('[data-session-map-toolbar]').count(),0,
   'Inactive map is never presented as an operational session');
  const headerBox=await originalTopbar.boundingBox();
  assert.equal(Math.round(headerBox.height),48,'Original TopBar is h-12, not pilot 76px');
  if(mode==='empty'){
   await page.getByRole('button',{name:'Campagne',exact:true}).click();
   assert.equal(await page.locator('[data-campaign-overview-empty="true"]').count(),1);
   assert.equal(await page.locator('[data-campaign-overview-state="list"]').getByRole('button').count(),0);
  }else{
  await page.getByRole('button',{name:'Campagna Aruba del GM'}).waitFor();
  await page.getByRole('button',{name:'Campagne',exact:true}).click();
  assert.equal(await page.locator('[data-campaign-overview-state="list"]').count(),1);
  assert.equal(await page.locator('[data-campaign-overview-state="list"]').getByRole('button',{name:/Campagna Aruba del GM/}).count(),1);
  assert.equal(await page.locator('[data-campaign-overview-state="list"]').getByText('Campagna estranea').count(),0);
  assert.equal(await page.getByRole('button',{name:'Campagna estranea'}).count(),0);
  await page.locator('[data-campaign-overview-state="list"]')
   .getByRole('button',{name:/Campagna Aruba del GM/}).click();
  assert.equal(await page.locator('[data-active-section]').getAttribute('data-active-section'),'campaign-home');
  assert.equal(await page.locator('[data-campaign-overview-state="selected"]').getAttribute('data-campaign-id'),campaigns[0].id);
  assert.equal(await page.locator('[data-campaign-session-state="not-connected"]').count(),1);
  if(mode==='characters'){
   await page.getByRole('button',{name:'Personaggi',exact:true}).click();
   await page.locator('[data-original-characters-state="no-campaign"]').waitFor();
   assert.equal(requests.some(r=>r.path==='/vtt/characters'),false);
   await page.getByRole('button',{name:'Campagna Aruba del GM'}).first().click();
   await page.getByRole('button',{name:'Personaggi',exact:true}).click();
   await page.locator('[data-original-characters-state="ready"]').waitFor();
   assert.equal(await page.getByText('Investigatore Aruba').count(),1);
   assert.equal(requests.filter(r=>r.path==='/vtt/characters').length,1);
  }
  await page.getByRole('button',{name:'Panoramica',exact:true}).click();
  assert.equal(await page.locator('[data-active-section]').getAttribute('data-active-section'),'home');
  assert.equal(await page.locator('[data-campaign-overview-state="home"]').count(),1);
  }
  if(mode==='empty')assert.equal(await page.getByRole('button',{name:'Campagna Aruba del GM'}).count(),0);
  assert.equal(requests.filter(r=>r.path==='/vtt/campaigns').length,1);
  assert.equal(requests.some(r=>r.path.includes('supabase')),false);
  const topbarActions=[];
  await page.evaluate(()=>document.addEventListener('aruba-original-topbar-qa',
   event=>window.__qaTopbarActions=(window.__qaTopbarActions??[]).concat(event.detail.kind)));
  await originalTopbar.getByRole('button',{name:/GM Aruba/}).click();
  await originalTopbar.getByRole('button',{name:'Impostazioni'}).click();
  const actions=await page.evaluate(()=>window.__qaTopbarActions??[]);
  topbarActions.push(...actions);
  assert.deepEqual(topbarActions,['settings:general']);
 }
 assert.ok(requests.every(r=>r.method==='GET'),'QA original shell must never write');
 await page.close();
}
try{
 await run('unauthorized');
 await run('no-campaign-capability');
 await run('ready');
 await run('empty');
 await run('characters');
 await run('expired-campaign-session');
 assert.deepEqual(errors,[]);
 console.log('Original AppShell with authenticated Aruba campaign API: scope, capability and 401 cases PASS.');
}finally{await browser.close();}
