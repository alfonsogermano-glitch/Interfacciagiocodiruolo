import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [node, view, commands, editor, policy, blocks, migration] = await Promise.all([
  readFile(new URL('../src/app/components/session/shared/tiptapArchivio.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/components/session/shared/ArchivioView.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/components/session/shared/noteEditorCommands.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/components/session/shared/RichTextEditor.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/components/session/shared/noteContainerPolicy.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/components/session/shared/tiptapBlocks.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/components/session/shared/tiptapLegacyMigration.ts', import.meta.url), 'utf8'),
]);

// Nodo blocco atomico con titolo, colonne e righe persistiti come JSON.
assert.match(node, /name:\s*'archivio'/, 'archivio must define a Node with name "archivio"');
assert.match(node, /atom:\s*true/, 'archivio must be an atom block without ProseMirror content');
assert.match(node, /title:[\s\S]*titleVisible:[\s\S]*columns:[\s\S]*rows:/, 'archivio must persist title, title visibility, columns and rows');
assert.match(node, /div\[data-type="archivio"\]/, 'archivio must parse and render a data-type archivio marker');
assert.match(node, /insertArchivio/, 'archivio must expose an insertArchivio command');
assert.match(node, /label:\s*'Nome'[\s\S]*label:\s*'Tipo'/, 'new archivi must start with Nome and Tipo columns');
assert.match(node, /nextValue > nextMax[\s\S]*nextValue = nextMax|value > max/, 'archivio points cells must clamp like inline points');
assert.match(editor, /import \{\s*Archivio\s*\}[\s\S]*Archivio,/, 'RichTextEditor must register the Archivio extension');

// Slash menu e policy strutturale.
assert.match(commands, /id:\s*'archivio'[\s\S]*label:\s*'Archivio'[\s\S]*icon:\s*Archive/, 'slash menu must expose Archivio with the Archive icon');
assert.match(commands, /case 'archivio':\s*return chain\.insertArchivio\(\)\.run\(\)/, 'slash command must route archivio to the insert call');
assert.match(policy, /'archivio'/, 'container policy must recognize archivio as a structural container');
assert.match(blocks, /archivio/, 'block content expression must allow archivio');
assert.match(migration, /'archivio'/, 'legacy migration must preserve archivio nodes');

// Intestazione: titolo, aggiunta riga che copia gli elementi senza valori, menu blocco.
assert.match(view, /Titolo archivio/, 'archivio header must expose an editable title');
assert.match(view, /Aggiungi riga/, 'archivio must offer row addition from the header and the block menu');
assert.match(view, /Aggiungi colonna/, 'archivio must offer column addition');
assert.match(view, /Nascondi il Titolo/, 'block menu must toggle title visibility');
assert.match(view, /Mostra il Titolo/, 'block menu must restore a hidden title');
for (const label of ['Duplica', 'Copia', 'Elimina']) {
  assert.ok(view.includes(label), `block menu must include ${label}`);
}

// Intestazione colonne: rinomina, ordinamento, movimenti, conversioni, cancellazione.
for (const label of ['Rinomina', 'Ordinamento crescente', 'Ordinamento decrescente', 'Aggiungi una colonna prima', 'Aggiungi una colonna dopo', 'Muovi a sinistra', 'Muovi a destra', 'Cancella colonna']) {
  assert.ok(view.includes(label), `column menu must include ${label}`);
}
for (const label of ['Converti tutto in testo', 'Converti tutto in bottoni', 'Converti tutto in Modificatori', 'Converti tutto in Checkbox', 'Converti tutto in punti']) {
  assert.ok(view.includes(label), `column menu must include ${label}`);
}
assert.match(view, /Nuova colonna/, 'new columns must start with the "Nuova colonna" label');

// Prima colonna: solo testo e menu righe dedicato.
for (const label of ['Aggiungi riga prima', 'Aggiungi riga dopo', 'Aggiungi colonna dopo', 'Muovi riga sopra', 'Muovi riga sotto', 'Cancella riga']) {
  assert.ok(view.includes(label), `first-column menu must include ${label}`);
}

// Celle dati: i cinque tipi con trasformazione ed editing dedicato.
for (const label of ['Trasforma in testo', 'Trasforma in Bottone', 'Trasforma in checkbox', 'Trasforma in Punti', 'Trasforma in modificatore', 'Modifica']) {
  assert.ok(view.includes(label), `data cells must support ${label}`);
}

// Ridimensionamento colonne senza altezza regolabile.
assert.match(view, /Ridimensiona colonna[\s\S]*cursor-col-resize/, 'columns must resize by dragging their divider');
assert.match(view, /ARCHIVIO_CELL_MIN_WIDTH/, 'column resize must respect the shared minimum width');
assert.doesNotMatch(view, /row-resize|resize-row|cursor-row-resize/, 'archivio must not offer row height resizing');

// Puntini verticali, menu in portal sopra lo sfondo, nessuna evidenziazione permanente.
assert.match(view, /MoreVertical/, 'archivio menu triggers must use vertical dots');
assert.doesNotMatch(view, /MoreHorizontal/, 'archivio menu triggers must not use horizontal dots');
assert.match(view, /createPortal[\s\S]*data-note-contextual-ui/, 'archivio menus must render in a portal above clipped containers');
assert.match(view, /placeFloatingNoteUI/, 'archivio menus must anchor next to their trigger inside the viewport');
const theme = await readFile(new URL('../src/styles/theme.css', import.meta.url), 'utf8');
assert.match(theme, /\.tiptap-archivio\.ProseMirror-selectednode[\s\S]*outline:\s*none/, 'a selected archivio must not keep the global selection outline');

// Nessun colore hardcoded: solo variabili di palette e classi Tailwind.
for (const [name, source] of [['tiptapArchivio', node], ['ArchivioView', view]]) {
  assert.doesNotMatch(source, /#[0-9a-fA-F]{3,8}/, `${name} must not hardcode hex colors`);
}

console.log('Archivio verification: PASS');
