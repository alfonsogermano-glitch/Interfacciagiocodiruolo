import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Schema } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { GapCursor } from '@tiptap/pm/gapcursor';
import {
  exitRowSelection,
  rowEdgeExitTarget,
  createBlockRowTrailingParagraphPlugin,
  deleteInlineBoxAndRowResidue,
} from '../src/app/components/session/shared/tiptapBlockRow.ts';

// Schema minimo in stile nota: paragrafi, righe di elementi (blockRow), un
// blocco non idoneo (archivio) per i fallback e un box di testo incorniciato
// (figlio di riga non-idoneo alla regola margine).
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*' },
    text: { group: 'inline' },
    blockRow: { group: 'block', content: '(paragraph | textBox)+' },
    textBox: { group: 'block', content: 'paragraph*' },
    archivio: { group: 'block', content: 'paragraph?' },
  },
});
const p = (text = '') => schema.nodes.paragraph.create(null, text ? schema.text(text) : undefined);
const row = (...children) => schema.nodes.blockRow.create(null, children);
const doc = (...blocks) => schema.nodes.doc.create(null, blocks);
const nodePos = (target, type, text) => {
  let found = null;
  target.descendants((node, pos) => {
    if (found !== null || node.type.name !== type) return;
    if (text === undefined || node.textContent === text) found = pos;
  });
  assert.notEqual(found, null, `fixture must contain ${type}:${text ?? ''}`);
  return found;
};
const textPos = (target, text, side) => {
  let found = null;
  target.descendants((node, pos) => {
    if (found !== null || !node.isText || node.text !== text) return;
    found = side === 'end' ? pos + text.length : pos;
  });
  assert.notEqual(found, null, `fixture must contain text ${text}`);
  return found;
};

// --- P2: caret agli estremi -> riga di testo adiacente -----------------------

const mixedDoc = doc(
  p('sopra'),
  row(p('box'), p('dado')),
  row(p('seconda')),
  p('coda'),
);
const row1Pos = nodePos(mixedDoc, 'blockRow', 'boxdado');
const row2Pos = nodePos(mixedDoc, 'blockRow', 'seconda');
const state = EditorState.create({ schema, doc: mixedDoc });

// Dal bordo superiore della prima riga: in coda al paragrafo sopra.
const up = exitRowSelection(state, row1Pos, -1);
assert.ok(up instanceof TextSelection, 'head gap must resolve to a text selection, not a gap widget');
assert.equal(up.from, textPos(mixedDoc, 'sopra', 'end'), 'head gap must exit up into the end of the text row above');

// Dal bordo inferiore della prima riga: in testa al primo elemento della riga sotto.
const down = exitRowSelection(state, row1Pos, 1);
assert.ok(down instanceof TextSelection, 'tail gap must resolve to a text selection');
assert.equal(down.from, textPos(mixedDoc, 'seconda', 'start'), 'tail gap must exit down into the first element of the row below');

// Dal bordo inferiore dell'ultima riga: in testa al paragrafo di coda.
const downLast = exitRowSelection(state, row2Pos, 1);
assert.ok(downLast instanceof TextSelection, 'last row tail gap must resolve to a text selection');
assert.equal(downLast.from, textPos(mixedDoc, 'coda', 'start'), 'last row tail gap must land at the start of the trailing text row');

// Tra due righe: dal bordo superiore della seconda riga si sale alla coda
// dell'ultimo elemento della riga sopra (mai in testa/fine riga).
const upBetween = exitRowSelection(state, row2Pos, -1);
assert.ok(upBetween instanceof TextSelection, 'head gap between rows must resolve to a text selection');
assert.equal(upBetween.from, textPos(mixedDoc, 'dado', 'end'), 'head gap between rows must land at the end of the last element of the row above');

// Nessun blocco adiacente: null (il chiamante fa il fallback).
const loneDoc = doc(row(p('solo')));
const loneState = EditorState.create({ schema, doc: loneDoc });
assert.equal(
  exitRowSelection(loneState, nodePos(loneDoc, 'blockRow', 'solo'), -1),
  null,
  'head gap on the first block must fall back (no neighbor above)',
);

// Vicino non idoneo (blocco non testuale come l'archivio): null.
const archDoc = doc(row(p('riga')), schema.nodes.archivio.create(null, p('tab')));
const archState = EditorState.create({ schema, doc: archDoc });
assert.equal(
  exitRowSelection(archState, nodePos(archDoc, 'blockRow', 'riga'), 1),
  null,
  'tail gap must fall back when the block below is not text/row content',
);

// --- P3: paragrafo di coda sempre presente sotto l'ultima riga --------------

const trailingPlugin = createBlockRowTrailingParagraphPlugin();

// Transazione docChanged su un doc che finisce con una riga -> append.
const appendDoc = doc(p('intro'), row(p('ultima')));
const appendState = EditorState.create({
  schema,
  doc: appendDoc,
  plugins: [trailingPlugin],
});
const afterAppend = appendState.apply(
  appendState.tr.insertText('x', textPos(appendDoc, 'ultima', 'end')),
);
assert.equal(
  afterAppend.doc.lastChild.type.name,
  'paragraph',
  'doc ending in a blockRow must always gain a trailing empty paragraph',
);
assert.equal(afterAppend.doc.lastChild.content.size, 0, 'the trailing paragraph must be empty');

// Idempotente: doc che gia' finisce con il paragrafo non viene toccato.
const guardedDoc = doc(p('intro'), row(p('ultima')), p(''));
const guardedState = EditorState.create({
  schema,
  doc: guardedDoc,
  plugins: [trailingPlugin],
});
const afterGuarded = guardedState.apply(
  guardedState.tr.insertText('y', textPos(guardedDoc, 'ultima', 'end')),
);
assert.equal(afterGuarded.doc.childCount, guardedDoc.childCount, 'a doc that already ends with a paragraph must not grow');

// Transazioni senza docChanged: nessun append.
const noopState = EditorState.create({ schema, doc: appendDoc, plugins: [trailingPlugin] });
const afterNoop = noopState.apply(noopState.tr.setMeta('blockRowNudge', true));
assert.equal(afterNoop.doc, appendDoc, 'non-docChanged transactions must not append anything');

// --- Sorgente: nessun GapCursor di attesa più agli estremi ------------------

const source = await readFile(
  new URL('../src/app/components/session/shared/tiptapBlockRow.ts', import.meta.url),
  'utf8',
);
assert.match(
  source,
  /isHead \|\| isTail\)[\s\S]{0,80}exitRowTo\(editor, rowPos, isHead \? -1 : 1\)/,
  'the caret nudge must exit the row at its extremes instead of entering first/last item',
);
assert.ok(
  (source.match(/exitRowTo\(editor, rowPos/g) ?? []).length >= 3,
  'nudge and left/right gap travel must both exit the row at its extremes',
);
assert.match(
  source,
  /addProseMirrorPlugins\(\) \{\n {4}return \[createBlockRowTrailingParagraphPlugin\(\), createBlockRowGapCursorPlugin\(\)\];\n {2}\},/,
  'BlockRow must register the trailing paragraph and internal gap cursor plugins',
);

// --- P4: regola margine (mai caret ai margini esterni della riga) ------------

const edgeDoc = doc(
  p('sopra'),
  row(p('box'), p('dado'), p('coda')),
  row(p('singolo')),
  row(schema.nodes.textBox.create(null, p('interno')), p('dopoBox')),
  row(p('')),
  p('giu'),
);
const edgeRow1 = nodePos(edgeDoc, 'blockRow', 'boxdadocoda');
const edgeRow2 = nodePos(edgeDoc, 'blockRow', 'singolo');
const edgeRow3 = nodePos(edgeDoc, 'blockRow', 'internodopoBox');
const edgeRow4 = nodePos(edgeDoc, 'blockRow', '');
const stateAt = (pos, to) =>
  EditorState.create({ schema, doc: edgeDoc, selection: TextSelection.create(edgeDoc, pos, to) });

// Primo figlio a inizio: esce verso l'alto (paragrafo sopra / altra riga).
assert.deepEqual(
  rowEdgeExitTarget(stateAt(textPos(edgeDoc, 'box', 'start'))),
  { rowPos: edgeRow1, dir: -1 },
  'caret at the start of the first paragraph child must exit left/up',
);
// Ultimo figlio a fine: esce verso il basso (riga libera sotto).
assert.deepEqual(
  rowEdgeExitTarget(stateAt(textPos(edgeDoc, 'coda', 'end'))),
  { rowPos: edgeRow1, dir: 1 },
  'caret at the end of the last paragraph child must exit down to the free row',
);
// Figlio intermedio: mai margine (il cursore intero e' ammesso solo tra
// elementi - questo e' proprio l'inizio/fine di uno di loro).
assert.equal(
  rowEdgeExitTarget(stateAt(textPos(edgeDoc, 'dado', 'start'))),
  null,
  'the start of a middle child must not trigger the edge rule',
);
assert.equal(
  rowEdgeExitTarget(stateAt(textPos(edgeDoc, 'dado', 'end'))),
  null,
  'the end of a middle child must not trigger the edge rule',
);
assert.equal(
  rowEdgeExitTarget(stateAt(textPos(edgeDoc, 'box', 'end'))),
  null,
  'the end of the first child (not last) must not exit',
);
assert.equal(
  rowEdgeExitTarget(stateAt(textPos(edgeDoc, 'coda', 'start'))),
  null,
  'the start of the last child (not first) must not exit',
);
// Figlio unico: e' insieme primo e ultimo, quindi entrambi i bordi escono.
assert.deepEqual(
  rowEdgeExitTarget(stateAt(textPos(edgeDoc, 'singolo', 'start'))),
  { rowPos: edgeRow2, dir: -1 },
  'a sole child start must exit up',
);
assert.deepEqual(
  rowEdgeExitTarget(stateAt(textPos(edgeDoc, 'singolo', 'end'))),
  { rowPos: edgeRow2, dir: 1 },
  'a sole child end must exit down',
);
// Box incorniciato (figlio non-paragrafo): il caret dentro e' dentro
// l'elemento, mai un margine di riga.
assert.equal(
  rowEdgeExitTarget(stateAt(textPos(edgeDoc, 'interno', 'start'))),
  null,
  'the caret inside a textBox child must never trigger the edge rule',
);
assert.equal(
  rowEdgeExitTarget(stateAt(nodePos(edgeDoc, 'textBox') + 2)),
  null,
  'the caret at the start of the paragraph inside a textBox must not trigger the edge rule',
);
assert.deepEqual(
  rowEdgeExitTarget(stateAt(textPos(edgeDoc, 'dopoBox', 'end'))),
  { rowPos: edgeRow3, dir: 1 },
  'the paragraph after a textBox must still exit at its own trailing edge',
);
assert.equal(
  rowEdgeExitTarget(stateAt(textPos(edgeDoc, 'dopoBox', 'start'))),
  null,
  'the start of the paragraph after a textBox is not the row head',
);
// Slot di testo vuoto: e' il posto dove scrivere, resta dov'e'.
assert.equal(
  rowEdgeExitTarget(stateAt(edgeRow4 + 2)),
  null,
  'an empty paragraph child is the writing slot and must stay put',
);
// Fuori riga: nessun blockRow antenato.
assert.equal(
  rowEdgeExitTarget(stateAt(textPos(edgeDoc, 'sopra', 'start'))),
  null,
  'a caret outside any row must not trigger the edge rule',
);
// Gap di riga: l'unica selezione possibile lì e' la GapCursor (una
// TextSelection non puo' risolvere in un figlio non-inline), e quella resta
// al ramo gap esistente di onTransaction.
assert.equal(
  rowEdgeExitTarget(
    EditorState.create({ schema, doc: edgeDoc, selection: new GapCursor(edgeDoc.resolve(edgeRow2 + 1), 1) }),
  ),
  null,
  'the row GapCursor must stay handled by the gap branch, not the edge rule',
);
// Selezione non vuota: mai rimbalzi mentre si seleziona testo.
assert.equal(
  rowEdgeExitTarget(stateAt(textPos(edgeDoc, 'box', 'start'), textPos(edgeDoc, 'box', 'end'))),
  null,
  'a non-empty selection must never trigger the edge rule',
);

// --- Sorgente: wiring della regola margine e meta anti-loop ------------------

const exitFn = source.match(/function exitRowTo\([\s\S]*?\n\}/)?.[0] ?? '';
assert.match(
  exitFn,
  /setMeta\('blockRowNudge', true\)/,
  'exitRowTo must tag its landing with blockRowNudge so nothing bounces back',
);
assert.ok(
  (source.match(/setMeta\('blockRowNudge', true\)/g) ?? []).length >= 5,
  'every intentional selection dispatch (nudge, jump, verticals, exit) must set blockRowNudge',
);
assert.match(
  source,
  /if \(state\.selection instanceof GapCursor\) return;/,
  'an internal row GapCursor must be kept (the visible between-elements cursor)',
);
assert.match(
  source,
  /if \(nudgeFree && !transaction\.docChanged\) \{\n {6}const edge = rowEdgeExitTarget\(state\);/,
  'the edge rule must run only on selection-only transactions (typing keeps the caret)',
);
assert.ok(
  !/new GapCursor\(/.test(
    source
      .replace(/export function createBlockRowGapCursorPlugin[\s\S]*?\n\}/, '')
      // Uscita verticale con nessun blocco sopra la prima riga: GapCursor
      // esplicita sul gap adiacente (stessa famiglia del plugin sopra, il
      // gapcursor standard darebbe il bordo esterno della riga).
      .replace(/function moveOutOfRowVertical[\s\S]*?\n\}/, '')
      // onTransaction: fallback head/tail - quando exitRowTo non ha un
      // paragrafo adiacente (hr/Box/tabella/lista) la GapCursor interna
      // viene spostata sul confine ESTERNO della riga (GapCursor.valid) o
      // nel testo adiacente: stessa famiglia, stessa meta blockRowNudge.
      .replace(/onTransaction\(\{ editor, transaction[\s\S]*?\n {2}\},/, ''),
  ),
  'only the internal gap cursor plugin (and the matching vertical exit) may construct a GapCursor',
);
assert.match(
  source,
  /event\.clientX >= rect\.left && event\.clientX <= rect\.right\) return false;[\s\S]*?new GapCursor\(view\.state\.doc\.resolve\(startOf\(target\)\)\)/,
  'a click in the visual gap between framed items must park a GapCursor at the boundary',
);

// --- Eliminazione box: nessun buco vuoto residuo in riga ---------------------

const runDelete = (docFixture, pos) => {
  const start = EditorState.create({ schema, doc: docFixture });
  let applied = null;
  deleteInlineBoxAndRowResidue(start, (tr) => { applied = start.apply(tr); }, pos);
  assert.notEqual(applied, null, 'delete must dispatch a transaction');
  return applied;
};

// In mezzo: il paragrafo del box sparisce e non resta alcun gap.
const midDoc = doc(p('sopra'), row(p('sx'), p('x'), p('dx')));
const mid = runDelete(midDoc, textPos(midDoc, 'x', 'start'));
const midRow = mid.doc.child(1);
assert.equal(midRow.type.name, 'blockRow', 'the row must survive the delete');
assert.equal(midRow.childCount, 2, 'the emptied middle paragraph must leave no gap');
assert.equal(midRow.child(0).textContent, 'sx', 'the left neighbour must stay untouched');
assert.equal(midRow.child(1).textContent, 'dx', 'the right neighbour must stay untouched');
assert.ok(mid.selection instanceof TextSelection, 'the caret must land in a text position');
assert.ok(
  ['sx', 'dx'].includes(mid.selection.$from.parent.textContent),
  'the caret must sit inside a surviving neighbour',
);

// All'inizio: il primo figlio svuotato sparisce.
const startDoc = doc(row(p('x'), p('dx')));
const startRow = runDelete(startDoc, textPos(startDoc, 'x', 'start')).doc.firstChild;
assert.equal(startRow.childCount, 1, 'the emptied leading paragraph must leave no gap');
assert.equal(startRow.firstChild.textContent, 'dx', 'the row must keep its remaining child');

// Alla fine: l'ultimo figlio svuotato sparisce.
const endDoc = doc(row(p('sx'), p('x')));
const endRow = runDelete(endDoc, textPos(endDoc, 'x', 'start')).doc.firstChild;
assert.equal(endRow.childCount, 1, 'the emptied trailing paragraph must leave no gap');
assert.equal(endRow.firstChild.textContent, 'sx', 'the row must keep its remaining child');

// Solo lo spaziatore di separazione: anche quello e' residuo visivo.
const sepDoc = doc(row(p('sx'), p(' x'), p('dx')));
const sepRow = runDelete(sepDoc, textPos(sepDoc, ' x', 'start') + 1).doc.firstChild;
assert.equal(sepRow.childCount, 2, 'a paragraph left with only the separating space must be dropped');

// Testo residuo: il paragrafo resta (non si cancella mai testo).
const keepDoc = doc(row(p('sx'), p('y x'), p('dx')));
const keepRow = runDelete(keepDoc, textPos(keepDoc, 'y x', 'start') + 2).doc.firstChild;
assert.equal(keepRow.childCount, 3, 'a paragraph still holding text must never be dropped');
assert.equal(keepRow.child(1).textContent, 'y ', 'only the box character must be removed');

// Paragrafo unico figlio: si lascia (lo srotolamento della riga ci pensa).
const loneRowDoc = doc(row(p('x')));
const loneRow = runDelete(loneRowDoc, textPos(loneRowDoc, 'x', 'start')).doc.firstChild;
assert.equal(loneRow.childCount, 1, 'the sole paragraph must be kept for the row-unwrap cleanup');

// Fuori riga: nessun effetto collaterale sul paragrafo standalone.
const plainDoc = doc(p('x'));
const plain = runDelete(plainDoc, textPos(plainDoc, 'x', 'start'));
assert.equal(plain.doc.childCount, 1, 'a standalone paragraph must just lose the character');
assert.equal(plain.doc.firstChild.textContent, '', 'the standalone paragraph must remain in place');

console.log('Note row extremes (caret exit + trailing paragraph) verification: PASS');
