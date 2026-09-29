import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Regola universale del sito: i menu ⋮ a tre puntini mostrano SEMPRE la
// freccia (default), mai la manina (pointer), indipendentemente dal cursor
// ereditato o aggiunto dalla card/cella sottostante.
const [theme, archivio, kebab, tabBar, folderRow, formulaCard, dieCard, campaign, dice, modifier, points, noteRow, sharedFolderRow] = await Promise.all([
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
  readFile(new URL('../src/app/components/session/shared/NoteListRow.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/components/shared/FolderRow.tsx', import.meta.url), 'utf8'),
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

// 5. Regola di visibilita': nessuna cornice e visibili solo all'elemento
// evidenziato (group hover/focus, hover diretto, focus, aria-expanded,
// sempre su touch via media hover:none).
assert.match(theme, /\[data-menu-dots\]\s*\{\s*\n\s*opacity:\s*0;/, 'theme.css must hide [data-menu-dots] by default (opacity 0)');
assert.match(theme, /\.group:hover \[data-menu-dots\][\s\S]{0,420}opacity:\s*1;/, 'theme.css must reveal [data-menu-dots] on .group hover (and focus/open)');
assert.match(theme, /@media \(hover: none\)/, 'touch devices (hover: none) must keep the dots visible');

// 6. Nessuna cornice e nessun fondo di evidenziazione: il trigger ⋮ non
// puo' dichiarare bordi ne sfondo in hover (l'evidenziazione e' la sola
// animazione di luce + il cambio di colore del testo).
const noBorder = (name, snippet) => {
  assert.ok(snippet, `${name}: expected a trigger snippet to check`);
  assert.doesNotMatch(snippet, /(^|[\s'"`])border(-|\s|:)/, `${name}: ⋮ trigger must not declare a border (frameless rule)`);
  assert.doesNotMatch(snippet, /hover:bg/, `${name}: ⋮ trigger must not paint a hover background`);
};
const around = (source, marker, radius) => {
  const i = source.indexOf(marker);
  assert.ok(i >= 0, `marker not found: ${marker}`);
  return source.slice(Math.max(0, i - radius), i + marker.length + radius);
};
const cornerRe = /photoCornerButtonClass\s*=\s*\n?\s*'([^']+)'/;
noBorder('CampaignHome photoCornerButtonClass', (campaign.match(cornerRe) ?? [])[1]);
const [myChars] = await Promise.all([
  readFile(new URL('../src/app/components/gm/MyCharactersPage.tsx', import.meta.url), 'utf8'),
]);
noBorder('MyCharactersPage photoCornerButtonClass', (myChars.match(cornerRe) ?? [])[1]);
noBorder('EntityKebabMenu default buttonClassName', (kebab.match(/buttonClassName\s*=\s*\n?\s*'([^']+)'/) ?? [])[1]);
noBorder('NoteListRow kebab buttonClassName', (noteRow.match(/buttonClassName="([^"]+)"/) ?? [])[1]);
noBorder('FolderRow kebab buttonClassName', (sharedFolderRow.match(/buttonClassName="([^"]+)"/) ?? [])[1]);
noBorder('CampaignHome menu campagna trigger', (campaign.match(/className="[^"]*"\s*\r?\n\s*aria-label="Menu campagna"/) ?? [''])[0]);
noBorder('ArchivioView TriggerButton base class', (archivio.match(/className=\{`inline-flex shrink-0[^`]*`/g) ?? [''])[0]);
for (const [name, source, marker, radius] of [
  ['EntityTabBar trigger', tabBar, 'data-menu-dots', 320],
  ['SavedCustomDieCard trigger', dieCard, 'data-menu-dots', 260],
  ['SavedDiceFormulaCard trigger', formulaCard, 'data-menu-dots', 260],
  ['DiceFormulaFolderRow trigger', folderRow, 'data-menu-dots', 260],
]) noBorder(name, around(source, marker, radius));

// 7. Celle Archivio: i trigger (data-menu-dots-cell) sono esclusi
// dall'hover/focus della NOTA e si accendono SOLO con la loro cella
// (.group/cell:hover = freccia sulla cella, .group/cell:focus-within =
// caret/selezione dentro). Il reveal reale vive in theme.css (non-layered,
// batte le utility Tailwind in @layer utilities).
assert.match(
  theme,
  /\.group\\\/cell:hover \[data-menu-dots\]/,
  'theme.css must reveal cell dots on their own cell hover',
);
assert.match(
  theme,
  /\.group\\\/cell:focus-within \[data-menu-dots\]/,
  'theme.css must reveal cell dots when the caret/selection sits inside the cell',
);
assert.match(
  theme,
  /\[data-menu-dots\]:not\(\[data-menu-dots-cell\]\):hover/,
  'generic reveal must exclude cell triggers (they follow only their cell)',
);
assert.match(
  theme,
  /\.group:focus-within \[data-menu-dots\]:not\(\[data-menu-dots-cell\]\)/,
  'note focus-within must not light up every archive cell trigger',
);
assert.match(
  archivio,
  /data-menu-dots-cell=\{cell \? 'true' : undefined\}/,
  'TriggerButton must expose the cell reveal attribute',
);
for (const marker of ['Menu colonna', 'Menu riga', 'Menu cella']) {
  assert.match(
    archivio,
    new RegExp(`label=\\{\`${marker}[\\s\\S]{0,160}?cell=\\{true\\}`),
    `trigger "${marker}" must opt into the cell-scoped reveal`,
  );
}

console.log('Menu ⋮ universal arrow cursor verification: PASS');
