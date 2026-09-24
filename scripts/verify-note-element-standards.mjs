import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// ===== Standard degli elementi dell'editor note =====
// Il "file di regole standard" vive nel blocco :root di src/styles/theme.css
// (token --note-*): UN punto per ogni proprietà che deve restare identica
// fra gli elementi della nota (interlinea, raggio pannelli, padding, spessore
// bordo, celle, riga affiancata, durata transizioni). Questo script e' la
// procedura che fa rispettare quelle regole: se un elemento usa un valore
// letterale al posto del token (o il token sparisce da :root), `npm run check`
// fallisce qui. Cambiare lo standard = cambiare il valore SOLO nel :root.
//
// Eccezioni deliberate (non toccate da questi assert, motivate nel codice
// dell'elemento): sfondo editor dash-surface vs dash-panel (protetto da
// verify-note-viewport-fill), bordo accent dei Dadi (elemento azione),
// border-top 2px dell'hr (altezza cliccabile), checkbox da 0.25rem (controllo
// di forma), bordo-left 3px della citazione, righe/heigth delle celle di
// tabella, raggio0.25em dell'input di rinomina Punti, dimensioni tipografiche
// dei widget (scelta per widget).

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

const theme = await read('../src/styles/theme.css');
// Commenti esclusi: citano valori storici che non devono triggerare i divieti.
const css = theme.replace(/\/\*[\s\S]*?\*\//g, '');
const resizeCss = await read('../src/app/components/session/shared/noteTableResize.css');
const dice = await read('../src/app/components/session/shared/tiptapInlineDice.ts');
const modifier = await read('../src/app/components/session/shared/tiptapInlineModifier.ts');
const points = await read('../src/app/components/session/shared/tiptapInlinePoints.ts');
const archivioView = await read('../src/app/components/session/shared/ArchivioView.tsx');
const editor = await read('../src/app/components/session/shared/RichTextEditor.tsx');
const subTabs = await read('../src/app/components/session/shared/NoteSubTabs.tsx');
const entity = await read('../src/app/components/session/shared/EntityDetailView.tsx');
const blocks = await read('../src/app/components/session/shared/tiptapBlocks.tsx');

const escapeRe = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Preleva la prima regola CSS il cui selettore inizia per `selectorPattern`.
function rule(selectorPattern) {
  const match = css.match(new RegExp(`${selectorPattern}\\s*\\{([^}]*)\\}`, 'm'));
  assert.ok(match, `missing CSS rule for ${selectorPattern} in theme.css`);
  return match[1];
}

// La linea che contiene un frammento qualsiasi (contenitori TSX su una riga).
function lineWith(source, marker, label) {
  const line = source.split('\n').find((l) => l.includes(marker));
  assert.ok(line, `${label}: line containing "${marker}" not found`);
  return line;
}

// 1) Il patto di standard: i token devono vivere in :root coi valori concordati.
const STANDARD_TOKENS = {
  '--note-block-gap': '0.5rem',
  '--note-block-radius': '0.75rem',
  '--note-block-padding-y': '0.5rem',
  '--note-block-padding-x': '0.75rem',
  '--note-widget-radius': '0.45em',
  '--note-widget-menu-radius': '0.3em',
  '--note-border-width': '1px',
  '--note-cell-padding-y': '0.4rem',
  '--note-cell-padding-x': '0.5rem',
  '--note-row-gap': '0.25rem',
  '--note-ui-duration': '120ms',
};
const rootBlock = css.match(/:root\s*\{[^}]*\}/)?.[0] ?? '';
for (const [name, value] of Object.entries(STANDARD_TOKENS)) {
  assert.match(
    rootBlock,
    new RegExp(`${escapeRe(name)}:\\s*${escapeRe(value)};`),
    `:root must define ${name}: ${value} - the shared standard of the note elements`,
  );
}

// 2) Interlinea: ogni blocco impilato GENERA il margine tramite il token.
const stackedBlocks = [
  ['.tiptap-content p', '\\.tiptap-content p'],
  ['.tiptap-content blockquote', '\\.tiptap-content blockquote'],
  ['.tiptap-content img', '\\.tiptap-content img'],
  ['.tiptap-content hr', '\\.tiptap-content hr'],
  ['.tiptap-content ul (bullet list)', '\\.tiptap-content ul(?!\\[)'],
  ['.tiptap-content ol (ordered list)', '\\.tiptap-content ol'],
  ["[data-type='taskList']", "\\.tiptap-content ul\\[data-type='taskList'\\]"],
  ['.tiptap-content pre (code block)', '\\.tiptap-content pre'],
  ['.tiptap-textbox', '\\.tiptap-textbox'],
  ['.tiptap-collapse', '\\.tiptap-collapse'],
  ['.tiptap-row', '\\.tiptap-row'],
  ['.tiptap-content .tiptap-archivio', '\\.tiptap-content \\.tiptap-archivio(?!\\.ProseMirror)'],
  ['.tiptap-note-table', '\\.tiptap-note-table(?!-cell|-header)'],
];
for (const [label, selectorPattern] of stackedBlocks) {
  assert.match(
    rule(selectorPattern),
    /margin:\s*0 0 var\(--note-block-gap\) 0;/,
    `${label} must declare margin: 0 0 var(--note-block-gap) 0 - the vertical rhythm standard`,
  );
}
assert.doesNotMatch(css, /margin:\s*0 0 0\.5rem 0/, 'literal 0.5rem bottom margin must go through var(--note-block-gap)');
assert.doesNotMatch(css, /margin:\s*0 0 0\.25rem 0/, 'half-standard vertical margin (0.25rem) must not come back');
assert.doesNotMatch(css, /margin:\s*0\.75rem/, 'hr must use the standard spacing, not 0.75rem');
// Ogni margin-bottom esplicito resta nel contratto: 0 (reset dentro
// contenitori/righe) oppure lo standard tramite token.
for (const m of css.matchAll(/margin-bottom:\s*([^;!]+);/g)) {
  const value = m[1].trim();
  assert.ok(
    value === '0' || value === 'var(--note-block-gap)',
    `margin-bottom: ${value} breaks the spacing contract (0 = in-container reset, var(--note-block-gap) = standard)`,
  );
}

// 3) Zone cliccabili (pseudo-elementi dentro il margine): devono DERIVARE
// dall'interlinea standard, non ripeterne il valore in pixel.
assert.match(css, /height:\s*var\(--note-block-gap\);/, 'click-extension pseudo-elements must derive their height from --note-block-gap');
assert.match(css, /top:\s*calc\(-1 \* var\(--note-block-gap\)\);/, 'top click-extension must derive from --note-block-gap');
assert.match(css, /bottom:\s*calc\(-1 \* var\(--note-block-gap\)\);/, 'bottom click-extension must derive from --note-block-gap');
assert.doesNotMatch(css, /top:\s*-8px|bottom:\s*-8px/, 'hardcoded -8px click extension must not come back');

// 4) Forma dei pannelli: raggio, padding e spessore bordo condivisi.
for (const [label, selectorPattern] of [
  ['.tiptap-textbox', '\\.tiptap-textbox'],
  ['.tiptap-collapse', '\\.tiptap-collapse'],
]) {
  const body = rule(selectorPattern);
  assert.match(body, /border-radius:\s*var\(--note-block-radius\);/, `${label}: radius must be --note-block-radius`);
  assert.match(body, /padding:\s*var\(--note-block-padding-y\) var\(--note-block-padding-x\);/, `${label}: padding must be --note-block-padding-y/x`);
  assert.match(body, /border:\s*var\(--note-border-width\) solid/, `${label}: border width must be --note-border-width`);
}
assert.match(rule('\\.tiptap-content img'), /border-radius:\s*var\(--note-block-radius\);/, 'img radius must match the panel radius standard');
assert.match(rule('\\.tiptap-content blockquote'), /padding-left:\s*var\(--note-block-padding-x\);/, 'blockquote indent must reuse the horizontal padding standard');
assert.doesNotMatch(css, /border-radius: 0\.75rem|border-radius: 0\.5rem/, 'panel/media radius literals must go through --note-block-radius');

// 5) Riga di blocchi affiancati: gap orizzontale standard.
assert.match(rule('\\.tiptap-row'), /gap:\s*var\(--note-row-gap\);/, 'row gap must be the --note-row-gap standard');

// 6) Checkbox delle attivita': spessore bordo standard.
assert.match(
  rule("\\.tiptap-content ul\\[data-type='taskList'\\] > li input\\[type='checkbox'\\]"),
  /border:\s*var\(--note-border-width\) solid var\(--dash-border-soft\)/,
  'taskList checkbox border must use --note-border-width',
);

// 7) Tabelle: margine, frame, padding celle, transizioni, peso intestazione.
const tableBody = rule('\\.tiptap-note-table(?!-cell|-header)');
assert.match(tableBody, /margin:\s*0 0 var\(--note-block-gap\) 0;/, 'note table must stack with the standard gap');
assert.match(tableBody, /outline:\s*var\(--note-border-width\) solid/, 'table frame width must be --note-border-width');
// Celle e intestazione condividono la stessa regola (selettore combinato).
const cellBody = rule('\\.tiptap-content \\.tiptap-note-table-cell(?:\\s*,\\s*\\.tiptap-content \\.tiptap-note-table-header)?');
assert.match(cellBody, /padding:\s*var\(--note-cell-padding-y\) var\(--note-cell-padding-x\);/, 'cell padding must be --note-cell-padding-y/x');
assert.match(cellBody, /border:\s*var\(--note-border-width\) solid/, 'cell border width must be --note-border-width');
assert.match(
  cellBody,
  /transition:\s*background-color var\(--note-ui-duration\), box-shadow var\(--note-ui-duration\);/,
  'cell hover transition must run on --note-ui-duration',
);
assert.match(
  css,
  /\.tiptap-content \.tiptap-note-table-header\s*\{[^}]*font-weight:\s*var\(--font-weight-semibold\);/,
  'table header weight must come from the theme font-weight scale',
);
assert.doesNotMatch(css, /font-weight: 600/, 'literal font-weight 600 must go through var(--font-weight-semibold)');
assert.doesNotMatch(css, /0\.12s/, 'literal 0.12s transition must go through var(--note-ui-duration)');

// 8) Compensi del GapCursor dentro la cella: meta' della padding standard,
// non un 0.2rem scritto a mano.
assert.match(resizeCss, /top:\s*calc\(var\(--note-cell-padding-y\) \/ 2 - 0\.5px\);/, 'lower GapCursor offset must derive from --note-cell-padding-y');
assert.match(resizeCss, /top:\s*calc\(-1 \* var\(--note-cell-padding-y\) \/ 2 \+ 0\.5px\);/, 'upper GapCursor offset must derive from --note-cell-padding-y');
assert.doesNotMatch(resizeCss, /0\.2rem/, 'literal 0.2rem cell-padding half must go through --note-cell-padding-y');

// 9) Widget inline (Dadi, Modificatori, Punti): la scatolina usa lo standard
// condiviso; il trigger a tre pallini e' lo stesso componente in tre file.
for (const [label, source] of [['Dadi', dice], ['Modificatori', modifier], ['Punti', points]]) {
  assert.match(
    source,
    /border:\s*'var\(--note-border-width\) solid[^']*',\s*borderRadius:\s*'var\(--note-widget-radius\)'/,
    `${label}: widget shell must pair --note-border-width with --note-widget-radius`,
  );
  assert.match(
    source,
    /top:\s*'0\.32em',\s*right:\s*'0\.32em',[\s\S]{0,300}?gap:\s*'0\.11em',\s*padding:\s*'0\.22em',\s*borderRadius:\s*'var\(--note-widget-menu-radius\)'/,
    `${label}: the shared three-dot trigger must use the common geometry (0.32em / 0.11em / 0.22em / --note-widget-menu-radius)`,
  );
  assert.doesNotMatch(
    source,
    /borderRadius:\s*'(0\.45em|0\.7em|0\.5em|0\.3em)'/,
    `${label}: literal widget radius must go through var(--note-widget-radius) or var(--note-widget-menu-radius)`,
  );
}
assert.ok(
  (points.match(/var\(--note-widget-radius\)/g) ?? []).length >= 2,
  'Punti: shell and value box must both use --note-widget-radius',
);
assert.doesNotMatch(dice + modifier + points, /120ms|160ms/, 'literal transition durations must go through var(--note-ui-duration)');

// 10) Contenitori dei blocchi in TSX: raggio standard, non la scala Tailwind.
assert.match(lineWith(archivioView, 'overflow-hidden rounded', 'Archivio'), /rounded-\[var\(--note-block-radius\)\]/, 'Archivio shell radius must be the shared standard');
assert.match(
  lineWith(archivioView, 'justify-between gap-2', 'Archivio header'),
  /px-\[var\(--note-block-padding-x\)\] py-\[var\(--note-block-padding-y\)\]/,
  'Archivio header padding must be the panel standard',
);
const archivioCellLines = archivioView.split('\n').filter((l) => l.includes('px-[var(--note-cell-padding-x)]'));
assert.equal(archivioCellLines.length, 2, 'Archivio th/td cell lines not found');
for (const line of archivioCellLines) {
  assert.match(line, /px-\[var\(--note-cell-padding-x\)\] py-\[var\(--note-cell-padding-y\)\]/, 'Archivio cells must use the shared cell padding standard');
}
assert.match(lineWith(subTabs, 'min-h-[3rem]', 'NoteSubTabs editor'), /rounded-\[var\(--note-block-radius\)\]/, 'session note editor radius must be the shared standard');
assert.match(lineWith(editor, 'DEFAULT_CONTAINER_CLASS', 'RichTextEditor'), /rounded-\[var\(--note-block-radius\)\]/, 'default editor container radius must be the shared standard');
assert.match(
  lineWith(entity, 'overflow-y-auto rounded', 'EntityDetailView custom tab'),
  /rounded-\[var\(--note-block-radius\)\]/,
  'custom-tab editor radius must be the shared standard',
);

// 11) Transizioni Tailwind nelle pagine-note: la durata va dichiarata, non
// ereditata dal default 150ms del tema.
for (const [label, source] of [['ArchivioView', archivioView], ['RichTextEditor', editor], ['tiptapBlocks', blocks]]) {
  for (const line of source.split('\n')) {
    if (/transition-(colors|transform|opacity)/.test(line)) {
      assert.ok(
        line.includes('duration-[var(--note-ui-duration)]'),
        `${label}: transition must pair with duration-[var(--note-ui-duration)] -> ${line.trim().slice(0, 70)}`,
      );
    }
  }
}

console.log('Note element standards verification: PASS');
