import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const errors=[];
try{
 for(const width of [390,768,1440]){
  const page=await browser.newPage({viewport:{width,height:900}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4175/vtt/original-shell.html',{waitUntil:'domcontentloaded'});
  const qa=page.locator('[data-original-shell-qa="true"]');
  await qa.waitFor();
  const left=qa.locator('aside').first();
  const right=qa.locator('aside').last();
  const leftBox=await left.boundingBox();
  const rightBox=await right.boundingBox();
  const topbar=qa.locator('[data-original-topbar-slot]');
  const topBox=await topbar.boundingBox();
  assert.ok(leftBox&&rightBox&&topBox);
  assert.equal(Math.round(leftBox.width),100,'original left rail width');
  assert.equal(Math.round(rightBox.width),80,'original right rail width');
  assert.ok(rightBox.y>=topBox.y+topBox.height-1,'right sidebar must start below topbar');
  assert.equal(await qa.getAttribute('data-original-shell-qa'),'true');
  assert.equal(await qa.locator('[data-dashboard-palette]').getAttribute('data-dashboard-palette'),'noir');
  await page.getByRole('button',{name:'Campagne',exact:true}).click();
  assert.equal(await qa.locator('[data-active-section]').getAttribute('data-active-section'),'campaigns');
  await page.getByRole('button',{name:'Personaggi',exact:true}).click();
  assert.equal(await qa.locator('[data-active-section]').getAttribute('data-active-section'),'characters');
  await page.getByRole('button',{name:'Panoramica',exact:true}).click();
  assert.equal(await qa.locator('[data-active-section]').getAttribute('data-active-section'),'home');
  await page.getByRole('button',{name:'Campagna di collaudo'}).first().click();
  assert.equal(await qa.locator('[data-active-section]').getAttribute('data-active-section'),'campaign-home');
  await page.close();
 }
 assert.deepEqual(errors,[],'Original shell QA must not crash');
 console.log('Original AppShell, LeftSidebar and GmSectionSidebar mounted with correct geometry at 390/768/1440.');
}finally{await browser.close();}
