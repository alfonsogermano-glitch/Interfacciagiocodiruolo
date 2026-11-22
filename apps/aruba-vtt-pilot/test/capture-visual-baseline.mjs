// Capture reviewable original/Aruba screenshot pairs. This runner never invents
// authentication fixtures: both URLs must already expose the same controlled state.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const baselineUrl=process.env.HG_VISUAL_BASELINE_URL;
const arubaUrl=process.env.HG_VISUAL_ARUBA_URL;
const readySelector=process.env.HG_VISUAL_READY_SELECTOR;
const controlledFixtures=process.env.HG_VISUAL_CONTROLLED_FIXTURES==='true';
const surface=process.env.HG_VISUAL_SURFACE??'home';
assert.ok(['home','campaigns','campaignhome'].includes(surface),'HG_VISUAL_SURFACE must be home, campaigns or campaignhome');
const output=path.resolve(process.env.HG_VISUAL_OUTPUT??'../../deploy/aruba/qa/visual-comparison');
const viewports=[[360,800],[390,844],[768,1024],[1280,720],[1440,900],[1920,1080]];

assert.ok(baselineUrl,'HG_VISUAL_BASELINE_URL is required');
assert.ok(arubaUrl,'HG_VISUAL_ARUBA_URL is required');
assert.ok(readySelector,'HG_VISUAL_READY_SELECTOR is required to prove equivalent application state');
const baseline=new URL(baselineUrl),aruba=new URL(arubaUrl);
assert.notEqual(baseline.origin,aruba.origin,'Original and Aruba must use distinct origins');
assert.equal(process.env.HG_VISUAL_BASELINE_CONFIRMED,'TRUE_ORIGINAL_ENTRYPOINT','Explicit original-entrypoint confirmation is required');

await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],
  ...(process.env.HG_BROWSER_EXECUTABLE?{executablePath:process.env.HG_BROWSER_EXECUTABLE}:{})});
const records=[];
const userId='4a3465ec-47d7-4021-9f0d-e70da8cbd001',campaignId='f24f6bdd-a5f7-4521-aa16-bc0854dc5841',timestamp='2026-11-15T12:00:00.000Z';
const campaign={id:campaignId,ownerId:userId,name:'Campagna browser',description:'QA visuale controllato',ruleset:'hsc',createdAt:timestamp,updatedAt:timestamp};
try{
  for(const [width,height] of viewports){
    const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,colorScheme:'dark',reducedMotion:'reduce'});
    for(const [kind,url] of [['baseline',baselineUrl],['aruba',arubaUrl]]){
      const page=await context.newPage(),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      if(controlledFixtures)await page.route('**/*',route=>{
        const request=route.request(),target=new URL(request.url());
        if(target.hostname==='filtering.adblock360.com')return route.abort('blockedbyclient');
        if(target.hostname==='fonts.googleapis.com')return route.fulfill({status:200,contentType:'text/css',body:''});
        if(target.hostname.endsWith('.supabase.co')){
          if(target.pathname.endsWith('/notifications'))return route.fulfill({status:200,contentType:'application/json',body:'{"notifications":[]}'});
          if(target.pathname.endsWith('/campaigns/overview'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({campaigns:[{...campaign,isOwned:true,inviteCode:null,logoUrl:null,characters:[],memberNames:[],memberCount:0}]})});
          if(/\/campaigns\/[^/]+\/characters$/.test(target.pathname))return route.fulfill({status:200,contentType:'application/json',body:'{"characters":[]}'});
          if(/\/campaigns\/[^/]+\/member-names$/.test(target.pathname))return route.fulfill({status:200,contentType:'application/json',body:'{"members":[],"ownerDisplayName":"GM prova"}'});
        }
        if(target.origin===baseline.origin)return route.continue();
        if(target.origin===aruba.origin){
          if(target.pathname==='/vtt/bootstrap')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({backend:'aruba-staging',user:{id:userId,email:'gm@example.invalid',displayName:'GM prova',role:'standard'},capabilities:{campaigns:{read:true,write:true},campaignInvites:{read:true,write:true},characters:{read:true,write:true},chapters:{read:true,write:true},scenes:{read:true,write:true},narrativeContent:{read:true,write:true},equipmentCatalog:{read:true,write:true},campaignDocuments:{read:true,write:true},visualAssets:{read:true,write:true},campaignRoster:{read:true,write:false},characterAvailability:{read:true,write:true},characterAssignments:{read:true,write:true},characterPortraits:{read:false,write:false},gameSession:true},campaignMemberships:[{userId,campaignId,role:'gm'}]})});
          if(target.pathname==='/vtt/campaigns')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({campaigns:[campaign]})});
          if(/^\/vtt\/campaigns\/[^/]+\/roster$/.test(target.pathname))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({members:[{userId,displayName:'GM prova',role:'gm'}]})});
          if(target.pathname==='/vtt/characters')return route.fulfill({status:200,contentType:'application/json',body:'{"characters":[]}'});
          if(target.pathname==='/vtt/character-availability')return route.fulfill({status:200,contentType:'application/json',body:'{"characters":[]}'});
          if(target.pathname==='/vtt/character-assignments')return route.fulfill({status:200,contentType:'application/json',body:'{"assignments":[]}'});
          if(/^\/vtt\/campaigns\/[^/]+\/narrative\/(npcs|monsters)$/.test(target.pathname))return route.fulfill({status:200,contentType:'application/json',body:'{"items":[]}'});
          if(target.pathname.startsWith('/vtt/'))return route.continue();
        }
        return route.abort('blockedbyclient');
      });
      await page.goto(url,{waitUntil:'networkidle'});
      await page.locator(readySelector).first().waitFor({state:'visible'});
      if(surface==='campaigns'||surface==='campaignhome'){
        await page.getByRole('button',{name:'Campagne',exact:true}).click();
        await page.locator(readySelector).first().waitFor({state:'visible'});
        await page.waitForTimeout(600);
        if(surface==='campaignhome'){
          // Same controlled campaign in both apps: the original enters
          // CampaignHome from the card, Aruba selects then opens session.
          await page.getByRole('button',{name:/Campagna browser[\s\S]*Creata il/}).click();
          if(kind==='aruba')await page.getByRole('button',{name:'Entra nella campagna'}).click();
          await page.locator(readySelector).first().waitFor({state:'visible'});
          await page.waitForTimeout(1200);
        }
      }
      await page.evaluate(()=>{document.documentElement.style.caretColor='transparent';});
      const filename=`${surface==='home'?'':surface+'-'}${kind}-${width}x${height}.png`,file=path.join(output,filename);
      await page.screenshot({path:file,fullPage:true,animations:'disabled'});
      const geometry=surface==='campaignhome'?await page.evaluate(()=>{
        const box=element=>{
          if(!element)return null;
          const {x,y,width,height}=element.getBoundingClientRect();
          return {x,y,width,height};
        };
        const title=Array.from(document.querySelectorAll('h1')).find(element=>element.textContent==='Campagna browser');
        const gmName=Array.from(document.querySelectorAll('span')).find(element=>element.textContent==='GM prova'&&element.classList.contains('break-words'));
        const section=Array.from(document.querySelectorAll('h2')).find(element=>element.textContent?.trim()==='Personaggi');
        const gmCard=gmName?.parentElement?.parentElement;
        const grid=gmCard?.parentElement?.parentElement;
        return {title:box(title),logo:box(title?.parentElement?.previousElementSibling),gmCard:box(gmCard),charactersHeading:box(section),grid:grid?{className:grid.className,display:getComputedStyle(grid).display,columns:getComputedStyle(grid).gridTemplateColumns}:null};
      }):undefined;
      assert.deepEqual(errors.filter(message=>message!=='Failed to fetch'),[],`${kind} ${width}x${height} emitted page errors`);
      const bytes=await readFile(file);
      records.push({kind,width,height,file:filename,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),...(geometry?{geometry}:{})});
      await page.close();
    }
    await context.close();
  }
}finally{await browser.close();}

const manifest={generatedAt:new Date().toISOString(),baselineUrl,arubaUrl,readySelector,controlledFixtures,fixtureState:{userId,campaignId,surface},approved:false,layoutDiffReviewed:false,records};
await writeFile(path.join(output,surface==='home'?'manifest.json':`manifest-${surface}.json`),JSON.stringify(manifest,null,2)+'\n');
const prefix=surface==='home'?'':surface+'-';
const sections=viewports.map(([width,height])=>`<section><h2>${width} × ${height}</h2><div class="pair"><figure><figcaption>Originale</figcaption><img src="${prefix}baseline-${width}x${height}.png"></figure><figure><figcaption>Aruba</figcaption><img src="${prefix}aruba-${width}x${height}.png"></figure></div><details><summary>Overlay differenza</summary><div class="overlay"><img src="${prefix}baseline-${width}x${height}.png"><img class="difference" src="${prefix}aruba-${width}x${height}.png"></div></details></section>`).join('');
const report=`<!doctype html><html lang="it"><meta charset="utf-8"><title>Originale / Aruba visual review</title><style>body{margin:0;padding:24px;background:#101014;color:#eee;font:14px system-ui}header,section{max-width:1800px;margin:0 auto 32px}h1,h2{color:#d6b45c}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}figure{margin:0;background:#18181d;padding:8px;overflow:auto}figcaption{padding:4px 0 10px;font-weight:700}img{display:block;max-width:100%;height:auto}.overlay{position:relative;display:inline-block;background:#000}.overlay img{max-width:none}.overlay .difference{position:absolute;inset:0;mix-blend-mode:difference;opacity:.75}summary{cursor:pointer;margin:12px 0;color:#d6b45c}@media(max-width:800px){.pair{grid-template-columns:1fr}}</style><header><h1>Originale / Aruba — revisione visuale</h1><p>Superficie: ${surface}. Fixture: utente GM prova, campagna Campagna browser. Questo report non costituisce approvazione.</p></header>${sections}</html>`;
await writeFile(path.join(output,surface==='home'?'report.html':`report-${surface}.html`),report);
console.log(`Captured ${records.length} screenshots in ${output}; manual/pixel review is still required.`);
