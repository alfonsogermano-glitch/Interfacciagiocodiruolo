import assert from 'node:assert/strict';
import fs from 'node:fs';
function read(path){return fs.readFileSync(new URL(`../${path}`, import.meta.url),'utf8')}
const styled=read('src/app/components/session/dice/StyledStandardDieIcon.tsx');
const surface=read('src/app/components/session/dice/DiceSkinSurface.tsx');
const library=read('src/app/components/session/dice/CustomDieLibraryIcon.tsx');
const result=read('src/app/components/session/dice/CustomDieFaceResult.tsx');
const history=read('src/app/components/session/dice/DiceRollHistoryCard.tsx');
assert.ok(surface.includes('getDiceSkinBackgroundImage'));
assert.ok(styled.includes('<DieSkinSurface') && styled.includes('appearance.symbolColor'));
assert.ok(history.includes('appearance={liveStandardAppearance}'));
assert.ok(history.includes("skinId={group.customDieSnapshot?.skinId ?? 'none'}"));
assert.ok(library.includes("const skinId = die.skinId ?? 'none'"));
assert.ok(library.includes('data-custom-die-image-untinted'));
assert.ok(result.includes('data-custom-die-image-untinted'));
assert.ok(library.includes('data-custom-die-library-d100-pair'),'custom d100 must keep the fixed two-die (tens + units) library icon');
for(const source of [library,result]) {
  const imageMatches=[...source.matchAll(/<img[\s\S]*?>/g)].map((m)=>m[0]);
  assert.ok(imageMatches.length>0);
  for(const img of imageMatches){
    assert.ok(!img.includes('filter:'),'custom image faces must never receive CSS filter tint');
    assert.ok(!img.includes('symbolColor'),'custom image faces must never receive symbolColor');
  }
}
console.log('verify-dice-skin-icons: PASS');
