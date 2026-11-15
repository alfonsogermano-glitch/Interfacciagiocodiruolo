import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const errors=[];
try{
 for(const width of [390,768,1440]){
  const page=await browser.newPage({viewport:{width,height:900}});
  const writes=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',request=>{
   if(!['GET','HEAD'].includes(request.method()))writes.push(request.url());
  });
  await page.goto('http://127.0.0.1:4175/vtt/original-shell-map.html',{waitUntil:'domcontentloaded'});
  await page.locator('[data-map-qa-fixture="local-only"]').waitFor();
  const toolbar=page.locator('[data-session-map-toolbar]');
  await toolbar.waitFor();
  const toolButtons=toolbar.locator('button[data-map-tool]');
  assert.equal(await toolButtons.count(),9,'Original toolbar must retain all nine map tools');
  const initial=page.locator('[data-map-qa-ready="false"]');
  await initial.waitFor();
  for(let i=0;i<9;i++)assert.equal(await toolButtons.nth(i).isDisabled(),true);
  await page.getByRole('button',{name:'QA: mappa locale pronta'}).click();
  await page.locator('[data-map-qa-ready="true"]').waitFor();
  // These tools only modify local mapToolStore state: no renderer, no network.
  const move=toolbar.locator('[data-map-tool="move"]');
  const pin=toolbar.locator('[data-map-tool="pin"]');
  await pin.click();
  await page.locator('[data-map-qa-tool="pin"]').waitFor();
  assert.equal(await pin.getAttribute('aria-pressed'),'true');
  for(const forbidden of ['grid','draw','fog','walls'])
   assert.equal(await toolbar.locator('[data-map-tool="'+forbidden+'"]').isDisabled(),true,
    'Unowned map tool must remain disabled: '+forbidden);
  await move.click();
  await page.locator('[data-map-qa-tool="move"]').waitFor();
  const header=page.locator('header.sticky');
  const top=await header.boundingBox();
  assert.equal(Math.round(top.height),48);
  // Poison the original shared store to reproduce a GM/campaign switch.
  await page.getByRole('button',{name:'QA: imposta stato GM temporaneo'}).click();
  await page.locator('[data-map-qa-user="00000000-0000-4000-8000-000000000002"]').waitFor({state:'attached'});
  await toolbar.locator('[data-map-tool="grid"]').waitFor();
  assert.equal(await toolbar.locator('[data-map-tool="grid"]').isEnabled(),true);
  await page.getByRole('button',{name:'QA: mappa disconnessa'}).click();
  await page.locator('[data-map-qa-ready="false"]').waitFor();
  await page.locator('[data-map-qa-user="none"]').waitFor({state:'attached'});
  for(let i=0;i<9;i++)assert.equal(await toolButtons.nth(i).isDisabled(),true);
  // Reconnecting to another campaign must not revive the previous GM's
  // map-edit authority, even though mapToolStore is a module singleton.
  await page.getByRole('button',{name:'QA: mappa locale pronta'}).click();
  await page.locator('[data-map-qa-ready="true"]').waitFor();
  for(const restricted of ['grid','draw','fog','walls'])
   assert.equal(await toolbar.locator('[data-map-tool="'+restricted+'"]').isDisabled(),true,
    'Stale previous-campaign permissions revived: '+restricted);
  await page.getByRole('button',{name:'QA: mappa disconnessa'}).click();
  await page.locator('[data-map-qa-ready="false"]').waitFor();
  assert.deepEqual(writes,[], 'Map QA must never perform network mutations');
  await page.close();
 }
 assert.deepEqual(errors,[]);
 console.log('Original map TopBar controls + mapToolStore local readiness: 390/768/1440 PASS');
}finally{await browser.close();}
