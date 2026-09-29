import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Schema } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import {
  exitRowSelection,
  createBlockRowTrailingParagraphPlugin,
} from '../src/app/components/session/shared/tiptapBlockRow.ts';

// Schema minimo in stile nota: paragrafi, righe di elementi (blockRow) e un
// blocco non idoneo (archivio) per i fallback.
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*' },
    text: { group: 'inline' },
    blockRow: { group: 'block', content: 'paragraph+' },
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
assert.ok(
  !/new GapCursor\(/.test(source),
  'row extremes must never park a blinking GapCursor widget anymore',
);
assert.match(
  source,
  /isHead \|\| isTail\) && exitRowTo\(editor, rowPos, isHead \? -1 : 1\)/,
  'the caret nudge must exit the row at its extremes instead of entering first/last item',
);
assert.ok(
  (source.match(/exitRowTo\(editor, rowPos/g) ?? []).length >= 3,
  'nudge and left/right gap travel must both exit the row at its extremes',
);
assert.match(
  source,
  /addProseMirrorPlugins\(\) \{\n {4}return \[createBlockRowTrailingParagraphPlugin\(\)\];\n {2}\},/,
  'BlockRow must register the trailing paragraph plugin',
);

console.log('Note row extremes (caret exit + trailing paragraph) verification: PASS');
