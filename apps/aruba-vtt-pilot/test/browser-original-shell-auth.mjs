import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:4175/vtt/original-shell-auth.html';
const owner='00000000-0000-4000-8000-000000000002';
const outsider='00000000-0000-4000-8000-000000000009';
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
    campaigns:{read:allowed,write:allowed},characters:{read:false,write:false},
    gameSession:false,
   },
  }});
 });
 await page.route('**/vtt/campaigns',async route=>{
  requests.push({path:'/vtt/campaigns',method:route.request().method()});
  await route.fulfill({json:{campaigns}});
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
 }else{
  await page.locator('[data-original-shell-auth-state="ready"]').waitFor();
  await page.getByRole('button',{name:'Campagna Aruba del GM'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Campagna estranea'}).count(),0);
  await page.getByRole('button',{name:'Campagna Aruba del GM'}).click();
  assert.equal(await page.locator('[data-active-section]').getAttribute('data-active-section'),'campaign-home');
  await page.getByRole('button',{name:'Panoramica',exact:true}).click();
  assert.equal(await page.locator('[data-active-section]').getAttribute('data-active-section'),'home');
  assert.equal(requests.filter(r=>r.path==='/vtt/campaigns').length,1);
 }
 assert.ok(requests.every(r=>r.method==='GET'),'QA original shell must never write');
 await page.close();
}
try{
 await run('unauthorized');
 await run('no-campaign-capability');
 await run('ready');
 assert.deepEqual(errors,[]);
 console.log('Original AppShell with authenticated Aruba campaign API: scope, capability and 401 cases PASS.');
}finally{await browser.close();}
