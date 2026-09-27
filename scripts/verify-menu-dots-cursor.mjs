import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Regola universale del sito: i menu ⋮ a tre puntini mostrano SEMPRE la
// freccia (default), mai la manina (pointer), indipendentemente dal cursor
// ereditato o aggiunto dalla card/cella sottostante.
const [theme, archivio, kebab, tabBar, folderRow, formulaCard, dieCard, campaign, dice, modifier, points] = await Promise.all([
  readFile(new URL('../src/styles/theme.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/components/session/shared/ArchivioView.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/components/session/shared/EntityKebabMenu.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/components/session/shared/EntityTabBar.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/components/session/dice/DiceFormulaFolderRow.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/components/session/dice/SavedDiceFormulaCard.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/components/session/dice/SavedCustomDieCard.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/campaigns/CampaignHome.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/components/session/shared/tiptapInlineDice.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/components/session/shared/tiptapInlineModifier.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/components/session/shared/tiptapInlinePoints.ts', import.meta.url), 'utf8'),
]);

// 1. Regola CSS universale: seleziona il marcatore data-menu-dots e le tre
// classi dei trigger inline, con !important contro cursor-pointer ereditato.
assert.match(
  theme,
  /\[data-menu-dots\],\s*\n\.tiptap-inline-dice-menu-trigger,\s*\n\.tiptap-inline-modifier-menu-trigger,\s*\n\.tiptap-inline-points-menu-trigger\s*\{\s*\n\s*cursor:\s*default\s*!important;/,
  'theme.css must force cursor: default !important on every menu ⋮ trigger (data-menu-dots + inline triggers)',
);

// 2. Ogni ⋮ trigger button del sito porta il marcatore data-menu-dots.
const marked = [
  ['ArchivioView.tsx', archivio],
  ['EntityKebabMenu.tsx', kebab],
  ['EntityTabBar.tsx', tabBar],
  ['DiceFormulaFolderRow.tsx', folderRow],
  ['SavedDiceFormulaCard.tsx', formulaCard],
  ['SavedCustomDieCard.tsx', dieCard],
  ['CampaignHome.tsx', campaign],
];
for (const [name, source] of marked) {
  assert.match(source, /data-menu-dots/, `${name} must mark its ⋮ trigger button with data-menu-dots`);
}

// 3. Nessun trigger ⋮ puo' dichiarare cursor-pointer.
assert.doesNotMatch(archivio, /TriggerButton[\s\S]{0,600}cursor-pointer/, 'ArchivioView TriggerButton must not use cursor-pointer');
assert.doesNotMatch(kebab, /cursor-pointer/, 'EntityKebabMenu must not use cursor-pointer on its trigger');

// 4. Trigger inline (Dado/Modificatore/Punti): i puntini usano sempre
// cursor: 'default' (prima: view.editable ? 'pointer' : 'default' che nella
// nota editabile dava la manina). Il resto del widget resta pointer.
const inline = [
  ['tiptapInlineDice.ts', dice],
  ['tiptapInlineModifier.ts', modifier],
  ['tiptapInlinePoints.ts', points],
];
for (const [name, source] of inline) {
  assert.doesNotMatch(
    source,
    /view\.editable\s*\?\s*'pointer'\s*:\s*'default'/,
    `${name} dots must not toggle cursor on view.editable anymore`,
  );
  assert.match(source, /cursor:\s*'default'/, `${name} dots must declare cursor: 'default'`);
}

console.log('Menu ⋮ universal arrow cursor verification: PASS');
