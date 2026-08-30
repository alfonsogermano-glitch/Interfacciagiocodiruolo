import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

const toolbar = read('src/app/components/session/dice/DiceToolbar.tsx');
const diceTypeIconPath = new URL('../src/app/components/session/dice/DiceTypeIcon.tsx', import.meta.url);
const diceTypeIcon = fs.existsSync(diceTypeIconPath) ? fs.readFileSync(diceTypeIconPath, 'utf8') : '';
const builder = read('src/app/components/session/dice/DiceFormulaBuilder.tsx');
const row = read('src/app/components/session/dice/DiceFormulaRow.tsx');
const panel = read('src/app/components/session/dice/SessionDicePanel.tsx');
const saved = read('src/app/components/session/dice/SavedDiceFormulaCard.tsx');
const sidebar = read('src/app/components/session/SessionRightSidebar.tsx');
const historyDrawer = read('src/app/components/session/dice/DiceRollHistoryDrawer.tsx');
const historyCard = read('src/app/components/session/dice/DiceRollHistoryCard.tsx');
const summary = read('src/app/components/session/dice/diceResultSummary.ts');

assert.match(toolbar, /QUICK_DICE_SIDES\s*=\s*\[4, 6, 8, 10, 12, 20, 100\]/);
assert.ok(diceTypeIcon, 'dice toolbar must provide a dedicated DiceTypeIcon component');
assert.ok(toolbar.includes("import { DiceTypeIcon } from './DiceTypeIcon';"), 'dice toolbar must use the dedicated die icon component');
assert.ok(toolbar.includes('TooltipContent'), 'quick dice buttons must use palette-aware tooltips');
assert.ok(toolbar.includes('<DiceTypeIcon sides={sides}'), 'each quick-die button must render the shape matching its side count');
assert.ok(toolbar.includes('<TooltipContent>{`d${sides}`}</TooltipContent>'), 'quick-die tooltip must contain only the compact dX label');
assert.doesNotMatch(toolbar, /Dado da \$\{sides\} facce/, 'quick-die tooltip must not repeat the long die description');
assert.doesNotMatch(toolbar, /<Dices\b/, 'quick-die buttons must not reuse the generic two-d6 icon');
assert.doesNotMatch(toolbar, /<span[^>]*>\s*d\{sides\}\s*<\/span>/, 'quick-die buttons must not show a redundant text label under the icon');
assert.ok(diceTypeIcon.includes('data-die-style="polymath-outline"'), 'dice icons must use the clean Polymath-inspired outline treatment');
assert.ok(diceTypeIcon.includes('<text'), 'Polymath-style dice must place the identifying value inside the die');
for (const sides of [4, 6, 8, 10, 12, 20, 100]) {
  assert.ok(diceTypeIcon.includes(`data-die-shape="d${sides}"`), `Missing dedicated d${sides} vector shape`);
}
assert.ok(diceTypeIcon.includes('data-die-percentile-tens'), 'd100 must render a dedicated tens d10');
assert.ok(diceTypeIcon.includes('data-die-percentile-units'), 'd100 must render a dedicated units d10');
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
assert.ok(!historyDrawer.includes('cursor-grab'), 'dice history scrollbar must not switch to the grab cursor');
assert.ok(!historyDrawer.includes('cursor-grabbing'), 'dice history scrollbar must not switch to the grabbing cursor');
assert.match(
  historyDrawer,
  /data-dice-history-drawer[\s\S]*?className="[^"]*select-none[^"]*"/,
  'dice history must prevent mouse text selection',
);
assert.match(
  historyDrawer,
  /data-dice-history-drawer[\s\S]*?className="[^"]*cursor-default[^"]*"/,
  'dice history must keep the default cursor over non-interactive content',
);
assert.match(
  historyDrawer,
  /data-dice-history-clear[\s\S]*?<Trash2[^>]*\/>[\s\S]*?Pulisci/,
  'dice history clear action must use the Italian label Pulisci',
);
assert.ok(historyCard.includes('formatPrimaryRollResult(result)'), 'history must use the Keep-aware result summary');
assert.ok(historyCard.includes('p-2 shadow-md'), 'dice history cards must use compact padding');
assert.ok(historyCard.includes('h-7 w-7'), 'dice history avatar must use the compact size');
assert.ok(historyCard.includes('text-xl font-bold'), 'dice history primary result must be slightly larger');
assert.ok(historyCard.includes('break-words text-sm'), 'player names must wrap instead of being truncated');
assert.ok(historyCard.includes('break-words text-xs'), 'long roll titles must wrap and remain readable');
assert.match(
  historyCard,
  /\(result\.formulaId \|\| result\.visibility === 'secret'\) && \([\s\S]*?result\.formulaId && \([\s\S]*?\{result\.formulaName\}/,
  'dice history must hide the formula-name row for unsaved public rolls while keeping saved formula names under the player',
);
assert.ok(!historyCard.includes('truncate'), 'dice history must not truncate long player names or roll titles');
assert.ok(historyCard.includes('text-[11px]'), 'dice details must use the slightly larger compact text size');
assert.ok(summary.includes("item.kind === 'keep'"), 'Keep presence must control N (total) formatting');
assert.ok(summary.includes('die.active && die.keepMatched === true'), 'Keep count must include only final active Keep matches');

assert.ok(historyCard.includes('data-dice-player-actions'), 'history must expose the portrait/action column');
assert.ok(historyCard.includes('data-dice-reroll'), 'history must expose the reroll action');
assert.ok(
  historyCard.indexOf('data-dice-player-actions') < historyCard.indexOf('data-dice-reroll'),
  'reroll must live inside the player portrait/action column',
);
assert.match(
  historyCard,
  /data-dice-reroll[\s\S]*?className="[^"]*mt-auto[^"]*"/,
  'reroll must sit at the bottom under the player portrait',
);

for (const [name, source] of [
  ['DiceRollHistoryCard', historyCard],
  ['DiceRollHistoryDrawer', historyDrawer],
  ['DiceFormulaRow', row],
  ['SavedDiceFormulaCard', saved],
]) {
  assert.doesNotMatch(source, /\stitle=/, `${name} must not use browser-native title tooltips`);
  assert.ok(source.includes('TooltipContent'), `${name} must use the palette-aware Tooltip component`);
}

console.log('Dice UI verification passed.');
