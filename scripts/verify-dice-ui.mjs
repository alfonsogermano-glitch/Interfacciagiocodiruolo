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
assert.ok(historyDrawer.includes('const scrollContainerRef = useRef<HTMLDivElement>(null);'), 'dice history must keep a ref to its scroll container');
assert.ok(historyDrawer.includes('data-dice-history-scroll'), 'dice history must expose its scroll container');
assert.ok(historyDrawer.includes('scrollContainer.scrollTop = scrollContainer.scrollHeight;'), 'new dice rolls must scroll the history to the newest result');
assert.ok(historyDrawer.includes('[historyOpen, rolls.length]'), 'autoscroll must run when history opens or a roll is appended');
assert.ok(historyDrawer.includes('max-h-[58vh]'), 'dice history must use the compact max height');
assert.ok(historyDrawer.includes('w-fit'), 'dice history must size itself to its content');
assert.ok(historyDrawer.includes('min-w-[18rem]'), 'dice history must keep a narrow default minimum width');
assert.ok(historyDrawer.includes('max-w-[min(24rem,calc(100vw-8rem))]'), 'dice history must expand only up to its responsive maximum');
assert.ok(historyDrawer.includes('className="relative flex min-h-0 flex-1 overflow-hidden"'), 'custom scrollbar wrapper must participate in flex sizing so the scroll viewport can shrink');
assert.match(historyDrawer, /className="[^"]*min-h-0[^"]*flex-1[^"]*overflow-y-auto[^"]*"/, 'scroll viewport must itself be a shrinking flex child');
assert.doesNotMatch(historyDrawer, /className="h-full min-h-0 overflow-y-auto/, 'scroll viewport must not depend on h-full inside a max-height-only drawer');
assert.ok(historyDrawer.includes('data-dice-history-scrollbar-track'), 'dice history must render its own scrollbar track');
assert.ok(historyDrawer.includes('data-dice-history-scrollbar-thumb'), 'dice history must render its own scrollbar thumb');
assert.ok(historyDrawer.includes('scrollContainer.scrollHeight > scrollContainer.clientHeight'), 'custom scrollbar must appear only when the history overflows');
assert.ok(historyDrawer.includes('onScroll={syncScrollbar}'), 'custom scrollbar thumb must follow native scroll position');
assert.ok(historyDrawer.includes('setPointerCapture'), 'custom scrollbar thumb must support pointer dragging');
assert.ok(historyDrawer.includes('onPointerMove={handleScrollbarPointerMove}'), 'custom scrollbar thumb must update scroll position while dragged');
assert.ok(historyDrawer.includes('[scrollbar-width:none]'), 'native Firefox scrollbar must be hidden behind the custom scrollbar');
assert.ok(historyDrawer.includes('[&::-webkit-scrollbar]:hidden'), 'native WebKit scrollbar must be hidden behind the custom scrollbar');
assert.ok(historyCard.includes('formatPrimaryRollResult(result)'), 'history must use the Keep-aware result summary');
assert.ok(historyCard.includes('p-2 shadow-md'), 'dice history cards must use compact padding');
assert.ok(historyCard.includes('h-7 w-7'), 'dice history avatar must use the compact size');
assert.ok(historyCard.includes('text-xl font-bold'), 'dice history primary result must be slightly larger');
assert.ok(historyCard.includes('break-words text-sm'), 'player names must wrap instead of being truncated');
assert.ok(historyCard.includes('break-words text-xs'), 'long roll titles must wrap and remain readable');
assert.ok(!historyCard.includes('truncate'), 'dice history must not truncate long player names or roll titles');
assert.ok(historyCard.includes('text-[11px]'), 'dice details must use the slightly larger compact text size');
assert.ok(summary.includes("item.kind === 'keep'"), 'Keep presence must control N (total) formatting');
assert.ok(summary.includes('die.active && die.keepMatched === true'), 'Keep count must include only final active Keep matches');

console.log('Dice UI verification passed.');
