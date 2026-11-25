import assert from 'node:assert/strict';
import fs from 'node:fs';

export async function compareOriginalSheets(browser,page,store,{campaign,ownerId,imageFixture}){
 const reference=await browser.newPage({viewport:{width:1440,height:1000}});
 reference.setDefaultTimeout(10000);
 const errors=[];
 reference.on('pageerror',error=>errors.push(error.message));
 await reference.route(/https?:\/\/[^/]*supabase\.(co|in)\//,route=>route.abort());
 await reference.addInitScript(data=>{window.__HG_SHEET_REFERENCE__=data;},{
  campaignId:campaign,ownerId,
  characters:store.characters.filter(row=>!row.sheetData.recoveredPlaceholder).map(row=>({
   ...row.sheetData,id:row.id,name:row.name,player:'',notes:'',ownerProfileId:ownerId,
   ownerDisplayName:'GM di prova',
   portraitImageUrl:'data:image/png;base64,'+imageFixture,
  })),
  npcs:store.narrative.npcs.map(row=>({...row,portraitImageUrl:'data:image/png;base64,'+imageFixture})),
  monsters:store.narrative.monsters.map(row=>({...row,portraitImageUrl:'data:image/png;base64,'+imageFixture})),
 });
 try{
  await reference.goto(process.env.HG_E2E_VISUAL_REFERENCE,{waitUntil:'networkidle'});
  await reference.getByRole('textbox').first().waitFor();
  assert.deepEqual(errors,[]);
  const metrics=isReference=>{
   const panel=document.querySelector('[data-session-slide-over]');
   const list=document.querySelector(isReference?'[data-original-sheet-reference] .w-64':'.aruba-session-character-list');
   const detail=isReference?list.nextElementSibling:document.querySelector('.aruba-session-sheet-content');
   const row=list.querySelector(isReference?'[data-folder-card-id]':'.aruba-session-entity-row');
   const card=detail.querySelector('.rounded-2xl');
   const thumb=row.querySelector('img');
   const title=row.querySelector('.text-sm');
   const name=detail.querySelector('input');
   const result={
    panelWidth:panel.getBoundingClientRect().width,panelTop:panel.getBoundingClientRect().top,
    listWidth:list.getBoundingClientRect().width,
    listPaddingTop:parseFloat(getComputedStyle(list).paddingTop),
    rowWidth:row.getBoundingClientRect().width,rowHeight:row.getBoundingClientRect().height,
    rowPaddingX:parseFloat(getComputedStyle(row).paddingLeft),
    rowPaddingY:parseFloat(getComputedStyle(row).paddingTop),
    rowGap:parseFloat(getComputedStyle(row).columnGap),
    rowBorder:parseFloat(getComputedStyle(row).borderTopWidth),
    rowFont:parseFloat(getComputedStyle(title).fontSize),
    thumbWidth:thumb.getBoundingClientRect().width,thumbHeight:thumb.getBoundingClientRect().height,
    detailPadding:parseFloat(getComputedStyle(detail).paddingLeft),
    cardWidth:card.getBoundingClientRect().width,
    nameFont:parseFloat(getComputedStyle(name).fontSize),
    nameValue:name.value,nameClass:name.className,
    nameInline:name.getAttribute('style'),nameParentFont:parseFloat(getComputedStyle(name.parentElement).fontSize),
    nameVar:getComputedStyle(name).getPropertyValue('--text-xl'),
    nameFontWeight:getComputedStyle(name).fontWeight,
    nameMatchesXl:name.matches('.text-xl'),nameMatchesSemibold:name.matches('.font-semibold'),
    probe:(()=>{const probe=document.createElement('input');probe.className='text-xl font-semibold';probe.value='probe';detail.appendChild(probe);const out={font:parseFloat(getComputedStyle(probe).fontSize),weight:getComputedStyle(probe).fontWeight};probe.remove();return out;})(),
    cssTextXl:(()=>{const rules=[];for(const sheet of document.styleSheets){try{for(const rule of sheet.cssRules){if(rule.selectorText==='.text-xl')rules.push(rule.cssText);}}catch{}}return rules;})(),
    extraRail:detail.querySelectorAll('button').length,
    inputs:[...detail.querySelectorAll('input')].map(input=>({type:input.type,value:input.value,visible:!!input.offsetParent,font:parseFloat(getComputedStyle(input).fontSize)})),
    ownerText:detail.textContent.includes('Giocatore sconosciuto')||detail.textContent.includes('GM di prova'),
   };
   return result;
  };
  const expected=await reference.evaluate(metrics,true);
  const actual=await page.evaluate(metrics,false);
  fs.writeFileSync('../../.local/sheets-original-geometry.json',JSON.stringify({expected,actual},null,2));
  await reference.locator('[data-session-slide-over]').screenshot({path:'../../.local/sheets-original-reference.png'});
  await page.locator('[data-session-slide-over]').screenshot({path:'../../.local/sheets-native-corrected.png'});
  for(const key of Object.keys(expected)){
   if(['extraRail','nameValue','nameClass','nameInline','nameParentFont','nameVar','nameFontWeight','inputs','ownerText','probe','cssTextXl'].includes(key))continue; // Header action menus remain a separate functional work item.
   assert.ok(Math.abs(expected[key]-actual[key])<=1,`${key}: original=${expected[key]}, native=${actual[key]}`);
  }
  console.log('ORIGINAL_SHEET_VISUAL_GEOMETRY_OK: real original component; panel/list/row/portrait/detail metrics match within 1px');
 }catch(error){
  console.error('ORIGINAL_REFERENCE_STATE',JSON.stringify({errors,body:(await reference.locator('body').innerText()).slice(0,1800)}));
  throw error;
 }finally{await reference.close();}
}
