import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Il menu della tabella e' un portale fixed z 9998: deve restare a destra
// della tabella SENZA mai entrare nella corona dello shell dove vivono i
// "+" del gutter (absolute, right 2px, 16px larghezza, z 20). Entrandoci li
// coprirebbe con il suo sfondo opaco (tabella dentro textbox quasi a tutta
// larghezza = caso delle foto di regression). Quando la posizione naturale
// invade la corona il menu SALTA oltre il "+" (a destra della corona):
// resta fuori dall'ultima colonna della tabella e i "+" restano liberi.
// Solo se il salto non ci sta nel viewport si torna a uno stacco clampato
// PRIMA della corona (mai il flip a sinistra: dalla parte opposta vive il
// "+" sinistro e coprirebbe comunque la tabella).

const positionSource = await readFile(new URL('../src/app/components/session/shared/noteTableToolbarPosition.ts', import.meta.url), 'utf8');
const toolbarSource = await readFile(new URL('../src/app/components/session/shared/NoteTableToolbar.tsx', import.meta.url), 'utf8');
const editorSource = await readFile(new URL('../src/app/components/session/shared/RichTextEditor.tsx', import.meta.url), 'utf8');
const gutterSource = await readFile(new URL('../src/app/components/session/shared/NoteRowGutter.tsx', import.meta.url), 'utf8');

// Premessa geometrica: i "+" restano ancorati a 2px dai bordi dello shell.
assert.match(
  gutterSource,
  /anchor\.side === 'left' \? \{ left: '2px' \} : \{ right: '2px' \}/,
  'gutter buttons must stay anchored 2px to the shell edges',
);

// Geometria della corona: 2px di offset + 16px di pulsante + 4px di margine.
assert.match(positionSource, /const GUTTER_EDGE = 2/, 'gutter edge offset must stay 2px');
assert.match(positionSource, /const GUTTER_BUTTON_SIZE = 16/, 'gutter button size must stay 16px');
assert.match(positionSource, /const GUTTER_CROWN_MARGIN = 4/, 'crown margin must stay 4px');
assert.match(
  positionSource,
  /export const NOTE_TABLE_TOOLBAR_GUTTER_ZONE =\s*GUTTER_EDGE \+ GUTTER_BUTTON_SIZE \+ GUTTER_CROWN_MARGIN/,
  'the reserved gutter crown width must stay a named constant',
);

// Il posizionamento riceve il bordo destro dello shell e ne deriva i limiti.
assert.match(positionSource, /shellRight\?:\s*number/, 'position helper must accept the shell right edge');
assert.match(
  positionSource,
  /const crownStart = shellRight - GUTTER_EDGE - GUTTER_BUTTON_SIZE/,
  'crown start must derive from the gutter button geometry',
);
assert.match(
  positionSource,
  /const gutterLimit = crownStart - GUTTER_CROWN_MARGIN - toolbarWidth/,
  'fallback limit must stop the toolbar 4px before the crown',
);
assert.match(
  positionSource,
  /const beyondCrown = crownStart \+ GUTTER_BUTTON_SIZE \+ GUTTER_CROWN_MARGIN/,
  'jump target must sit beyond the crown',
);

// Regola principale: posizione naturale a destra della tabella; se invade
// la corona, salto oltre il "+" (mai sopra la tabella).
assert.match(
  positionSource,
  /if \(left \+ toolbarWidth > crownStart\)/,
  'the helper must detect the natural spot invading the crown',
);
assert.match(positionSource, /left = beyondCrown;/, 'invading positions must jump beyond the crown');
assert.match(positionSource, /if \(left > fitsViewport\)/, 'the jump must be checked against the viewport');
assert.match(
  positionSource,
  /left = gutterLimit;/,
  'when no room remains in the viewport, fall back to a spot before the crown',
);

// Mai il flip a sinistra: dalla parte opposta c'e' la corona del "+" sinistro
// (e comunque coprirebbe la tabella).
assert.doesNotMatch(
  positionSource,
  /anchor\.left\s*-\s*toolbarWidth/,
  'the toolbar must never flip to the left side, where the left "+" crown lives',
);

// Il componente passa il bordo destro dello shell (ref condiviso col gutter).
assert.match(toolbarSource, /shellRef:\s*RefObject</, 'table toolbar must accept the editor shell ref');
assert.match(toolbarSource, /shellRight:\s*shellRect\??\.right/, 'table toolbar must feed the shell right edge to the position helper');

// ...e l'editor inietta lo stesso shellRef usato da NoteRowGutter.
assert.match(
  editorSource,
  /<NoteTableToolbar editor=\{editor\} editable=\{editable\} shellRef=\{editorShellRef\} \/>/,
  'note editor must mount the table toolbar with the shared shell ref',
);

console.log('verify-note-table-toolbar-gutter: ok');
