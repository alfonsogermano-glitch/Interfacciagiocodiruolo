import assert from 'node:assert/strict';
import fs from 'node:fs';
function read(path){return fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8')}
const row=read('src/app/components/session/dice/DiceFormulaRow.tsx');
const tree=read('src/app/components/session/dice/DiceFormulaLibraryTree.tsx');
for(const [name,source] of [['formula row',row],['library tree',tree]]){
 assert.ok(source.includes('setDragImage'),`${name} must create a custom drag image`);
 assert.ok(source.includes("opacity = '0.95'")||source.includes("opacity='0.95'")||source.includes("opacity = \"0.95\""),`${name} drag image must remain visible`);
 assert.ok(source.includes('window.getComputedStyle'),`${name} drag image must preserve active palette`);
}
assert.ok(row.includes('data-dice-drag-ghost'));
assert.ok(tree.includes('data-dice-library-drag-ghost'));
console.log('Dice drag ghost visibility verification passed.');
