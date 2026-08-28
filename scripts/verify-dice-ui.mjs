import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

const toolbar = read('src/app/components/session/dice/DiceToolbar.tsx');
const builder = read('src/app/components/session/dice/DiceFormulaBuilder.tsx');
const row = read('src/app/components/session/dice/DiceFormulaRow.tsx');
const panel = read('src/app/components/session/dice/SessionDicePanel.tsx');
const saved = read('src/app/components/session/dice/SavedDiceFormulaCard.tsx');
const sidebar = read('src/app/components/session/SessionRightSidebar.tsx');

assert.match(toolbar, /QUICK_DICE_SIDES\s*=\s*\[4, 6, 8, 10, 12, 20, 100\]/);
assert.ok(builder.includes('data-dice-modifier-add'));
assert.match(
  builder,
  /<DropdownMenuContent[^>]*className="[^"]*z-\[1000\][^"]*"/,
  'dice modifier menu must render above the z-[900] dice slide-over panel',
);
for (const family of ['compare', 'dice', 'drop', 'exploding', 'keep', 'modifier']) {
  assert.ok(builder.includes(`append('${family}')`), `Missing modifier menu family: ${family}`);
}
assert.ok(row.includes('data-dice-formula-row'));
assert.ok(row.includes('Sposta su'));
assert.ok(row.includes('Sposta giu'));
assert.ok(row.includes('draggable'));
for (const hook of ['data-dice-roll-builder', 'data-dice-save-formula', 'data-dice-clear-builder']) {
  assert.ok(panel.includes(hook), `Missing builder action hook: ${hook}`);
}
assert.ok(saved.includes('data-saved-dice-formula'));
assert.ok(saved.includes('data-dice-visibility-toggle'));
assert.ok(saved.includes('data-dice-formula-edit'));
assert.ok(saved.includes('data-dice-formula-duplicate'));
assert.ok(saved.includes('data-dice-formula-delete'));
assert.match(sidebar, /id: 'dice',[\s\S]*?enabled: true/);
assert.ok(sidebar.includes('SessionDicePanel'));
assert.ok(sidebar.includes('DiceSessionProvider'));
assert.ok(sidebar.includes('DiceRollHistoryDrawer'));

console.log('Dice UI verification passed.');
