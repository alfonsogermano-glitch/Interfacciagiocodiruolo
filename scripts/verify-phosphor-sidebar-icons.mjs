import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const left = readFileSync('src/app/layout/LeftSidebar.tsx', 'utf8');
const gm = readFileSync('src/app/layout/GmSectionSidebar.tsx', 'utf8');
const right = readFileSync('src/app/components/session/SessionRightSidebar.tsx', 'utf8');
for (const [name, source] of [['LeftSidebar',left],['GmSectionSidebar',gm],['SessionRightSidebar',right]]) {
  assert.match(source, /from ['"]@iconify\/react['"]/, name + ': import Phosphor renderer');
  assert.doesNotMatch(source, /from ['"]lucide-react['"]/, name + ': no Lucide sidebar imports');
  assert.match(source, /<Icon icon=\{icon\}/, name + ': use mapped icon');
}
for (const [name, icon] of [
 ['Panoramica','house'], ['Personaggi','users-three'], ['Campagne','scroll']
]) assert.ok(left.includes('ph:' + icon + '-duotone'), name);
assert.match(gm, /id: 'npcs', label: 'PNG', icon: 'ph:identification-badge-duotone'/);
assert.match(gm, /id: 'monsters', label: 'Mostri', icon: 'ph:ghost-duotone'/);
assert.ok(!gm.includes("icon: 'ph:sword-duotone' }\n  { id: 'clues'"));
for(const tag of ['Capitoli e Scene','Preparazione','Schede','PNG','Mostri','Indizi','Archivio Oggetti','Mappa legacy','Eventi legacy','Fasi di Gioco','Combattimento','Asset Grafici']) assert.ok(gm.includes("label: '"+tag+"'"));
for(const tag of ['Chat','Schede','Note','Dadi','Incontri','Combatti']) assert.ok(right.includes("label: '"+tag+"'"));
assert.ok(left.includes('w-[100px]'));
assert.ok(gm.includes('w-20'));
assert.ok(right.includes("className=\"h-[18px] w-[18px]\""));
console.log('PASS: Phosphor Duotone sidebar icon mappings and placement invariants');
