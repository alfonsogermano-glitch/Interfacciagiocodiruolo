// Diagnostic geometry probe for the controlled authenticated panorama.
// It reads the same fixture routes as capture-visual-baseline.mjs and prints
// element boxes from the original entrypoint and the Aruba pilot side by side.
// This probe is evidence only: it never approves a visual gate by itself.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const baselineUrl=process.env.HG_VISUAL_BASELINE_URL;
const arubaUrl=process.env.HG_VISUAL_ARUBA_URL;
const readySelector=process.env.HG_VISUAL_READY_SELECTOR;
const viewport=process.env.HG_GEOMETRY_VIEWPORT??'1440x900';
assert.ok(baselineUrl&&arubaUrl&&readySelector,'HG_VISUAL_BASELINE_URL, HG_VISUAL_ARUBA_URL and HG_VISUAL_READY_SELECTOR are required');
assert.equal(process.env.HG_VISUAL_BASELINE_CONFIRMED,'TRUE_ORIGINAL_ENTRYPOINT','Explicit original-entrypoint confirmation is required');
const baseline=new URL(baselineUrl),aruba=new URL(arubaUrl);
const [width,height]=viewport.split('x').map(Number);
assert.ok(width>0&&height>0,'HG_GEOMETRY_VIEWPORT must use WIDTHxHEIGHT');

const userId='4a3465ec-47d7-4021-9f0d-e70da8cbd001',campaignId='f24f6bdd-a5f7-4521-aa16-bc0854dc5841',timestamp='2026-11-15T12:00:00.000Z';
const campaign={id:campaignId,ownerId:userId,name:'Campagna browser',description:'QA visuale controllato',ruleset:'hsc',createdAt:timestamp,updatedAt:timestamp};
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],
  ...(process.env.HG_BROWSER_EXECUTABLE?{executablePath:process.env.HG_BROWSER_EXECUTABLE}:{})});
try{
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,colorScheme:'dark',reducedMotion:'reduce'});
 const results={};
 for(const [kind,url] of [['baseline',baselineUrl],['aruba',arubaUrl]]){
  const page=await context.newPage();
  await page.route('**/*',route=>{
   const target=new URL(route.request().url());
   if(target.hostname==='filtering.adblock360.com')return route.abort('blockedbyclient');
   if(target.hostname==='fonts.googleapis.com')return route.fulfill({status:200,contentType:'text/css',body:''});
   if(target.hostname.endsWith('.supabase.co')&&target.pathname.endsWith('/notifications'))return route.fulfill({status:200,contentType:'application/json',body:'{"notifications":[]}'});
   if(target.origin===baseline.origin)return route.continue();
   if(target.origin===aruba.origin){
    if(target.pathname==='/vtt/bootstrap')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({backend:'aruba-staging',user:{id:userId,email:'gm@example.invalid',displayName:'GM prova',role:'standard'},capabilities:{campaigns:{read:true,write:true},characters:{read:true,write:true},chapters:{read:true,write:true},scenes:{read:true,write:true},narrativeContent:{read:true,write:true},equipmentCatalog:{read:true,write:true},campaignDocuments:{read:true,write:true},visualAssets:{read:true,write:true},campaignRoster:{read:true,write:false},characterAvailability:{read:true,write:true},characterAssignments:{read:true,write:true},characterPortraits:{read:false,write:false},gameSession:false}})});
    if(target.pathname==='/vtt/campaigns')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({campaigns:[campaign]})});
    if(target.pathname.startsWith('/vtt/'))return route.continue();
   }
   return route.abort('blockedbyclient');
  });
  await page.goto(url,{waitUntil:'networkidle'});
  await page.locator(readySelector).first().waitFor({state:'visible'});
  results[kind]=await page.evaluate(()=>{
   const box=element=>{if(!element)return null;const rect=element.getBoundingClientRect();return {x:Math.round(rect.x*10)/10,y:Math.round(rect.y*10)/10,w:Math.round(rect.width*10)/10,h:Math.round(rect.height*10)/10};};
   const main=document.querySelector('main');
   const sections=main?[...main.querySelectorAll('section')]:[];
   const sectionByHeading=text=>sections.find(section=>[...section.querySelectorAll('h2')].some(heading=>heading.textContent.trim()===text));
   const quick=sectionByHeading('Azioni rapide');
   const recent=sectionByHeading('Campagne recenti');
   const header=document.querySelector('header');
   return {
    header:box(header),
    headerClass:header?.className,
    headerComputedHeight:header?getComputedStyle(header).height:null,
    mainArea:box(document.querySelector('.main-area')),
    main:box(main),
    mainChildren:main?[...main.children].map(child=>({tag:child.tagName,cls:child.className,txt:(child.textContent??'').trim().slice(0,40),box:box(child)})):[],
    title:box(main?.querySelector('h1')),
    heroIcon:box(main?.querySelector('section:first-of-type div, .home-hero-icon')),
    quickHeading:box(quick?.querySelector('h2')),
    quickCards:[...(quick?.querySelectorAll('button')??[])].map(box),
    recentHeading:box(recent?.querySelector('h2')),
    recentCard:box(recent?.querySelector('button')),
    recentLogo:box(recent?.querySelector('img')),
   };
  });
  await page.close();
 }
 await context.close();
 console.log(JSON.stringify({viewport,results},null,2));
}finally{await browser.close();}
