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
const historyDrawer = read('src/app/components/session/dice/DiceRollHistoryDrawer.tsx');
const historyCard = read('src/app/components/session/dice/DiceRollHistoryCard.tsx');
const summary = read('src/app/components/session/dice/diceResultSummary.ts');

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
assert.ok(row.includes('<option value="equal">Equal</option>'), 'Keep must expose an Equal option');
assert.ok(row.includes('ariaLabel="Valore soglia Keep"'), 'Keep numeric control must be a threshold, not a result count');
assert.ok(!row.includes('Singolo dado'), 'Modifier UI must not add a per-die scope control');
assert.ok(!row.includes('data-dice-modifier-scope'), 'Modifier UI must not expose an explicit scope control');
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
assert.ok(historyDrawer.includes("import { useEffect, useRef } from 'react'"), 'dice history must use React hooks for autoscroll');
assert.ok(historyDrawer.includes('const scrollContainerRef = useRef<HTMLDivElement>(null);'), 'dice history must keep a ref to its scroll container');
assert.ok(historyDrawer.includes('data-dice-history-scroll'), 'dice history must expose its scroll container');
assert.ok(historyDrawer.includes('scrollContainer.scrollTop = scrollContainer.scrollHeight;'), 'new dice rolls must scroll the history to the newest result');
assert.ok(historyDrawer.includes('[historyOpen, rolls.length]'), 'autoscroll must run when history opens or a roll is appended');
assert.ok(historyDrawer.includes('max-h-[58vh]'), 'dice history must use the compact max height');
assert.ok(historyDrawer.includes('w-[min(22rem,calc(100vw-8rem))]'), 'dice history must use the compact width');
assert.ok(historyCard.includes('formatPrimaryRollResult(result)'), 'history must use the Keep-aware result summary');
assert.ok(historyCard.includes('p-2 shadow-md'), 'dice history cards must use compact padding');
assert.ok(historyCard.includes('h-7 w-7'), 'dice history avatar must use the compact size');
assert.ok(historyCard.includes('text-lg font-bold'), 'dice history primary result must use the compact size');
assert.ok(summary.includes("item.kind === 'keep'"), 'Keep presence must control N (total) formatting');
assert.ok(summary.includes('die.active && die.keepMatched === true'), 'Keep count must include only final active Keep matches');

console.log('Dice UI verification passed.');
