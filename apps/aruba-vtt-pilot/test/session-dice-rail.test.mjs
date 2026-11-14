import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
test('Aruba session rail retains original panel order and Phosphor icon language',()=>{
 const rail=read('../src/ArubaSessionRightRail.tsx');
 for(const name of ['ChatCircleDotsIcon','FileTextIcon','NoteIcon','DiceFiveIcon','MapTrifoldIcon','SwordIcon'])
  assert.ok(rail.includes(name));
 assert.doesNotMatch(rail,/from 'lucide-react'/);
 const labels=['Chat','Schede','Note','Dadi','Incontri','Combatti'];
 let cursor=0;
 for(const label of labels){const index=rail.indexOf("label:'"+label+"'",cursor);assert.ok(index>cursor,label);cursor=index;}
});
test('session Dadi opens existing original dice engine rather than a duplicate or fake roll',()=>{
 const rail=read('../src/ArubaSessionRightRail.tsx');
 const dice=read('../src/ArubaQuickDice.tsx');
 assert.match(rail,/id==='dice'\)window\.dispatchEvent\(new CustomEvent\('hollowgate:aruba-open-dice',\{detail:\{campaignId\}\}\)\)/);
 assert.match(dice,/addEventListener\('hollowgate:aruba-open-dice',open\)/);
 assert.match(dice,/removeEventListener\('hollowgate:aruba-open-dice',open\)/);
 assert.match(dice,/rollDiceFormula/);
 assert.match(dice,/setPaletteOpen\(true\)/);
 assert.doesNotMatch(rail,/rollDiceFormula|localStorage|sessionStorage/);
});

test('unnamed quick rolls do not invent a saved formula name',()=>{
 const dice=read('../src/ArubaQuickDice.tsx');
 assert.match(dice,/formulaName:''/);
 assert.doesNotMatch(dice,/formulaName:'Tiro rapido'/);
});

test('dice rail events are scoped to the currently active Aruba campaign',()=>{
 const rail=read('../src/ArubaSessionRightRail.tsx');
 const dice=read('../src/ArubaQuickDice.tsx');
 const main=read('../src/main.tsx');
 assert.match(main,/<ArubaSessionRightRail campaignId=\{activeCampaign\.id\}/);
 assert.match(rail,/detail:\{campaignId\}/);
 assert.match(dice,/event\.detail\?\.campaignId!==campaignId/);
 assert.match(dice,/\},\[campaignId\]\);/);
});

test('dice engine remounts when authenticated player or active campaign changes',()=>{
 const main=read('../src/main.tsx');
 assert.match(main,/<ArubaQuickDice key=\{activeCampaign\.id\+':'\+user\.id\}/);
});

test('session dice palette does not leak into campaign management or home views',()=>{
 const main=read('../src/main.tsx');
 assert.match(main,/\{section==='session'&&activeCampaign&&<ArubaQuickDice key=/);
 assert.doesNotMatch(main,/\{activeCampaign&&<ArubaQuickDice/);
});
