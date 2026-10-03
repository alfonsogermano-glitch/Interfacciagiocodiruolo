import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Schema } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import {
  applyBlockToRow,
  BLOCK_ROW_CONTENT,
} from '../src/app/components/session/shared/tiptapBlockRow.ts';

// Matrice completa delle combinazioni "+": ogni voce scelta dal + di un
// blocco/riga (Testo, Box di testo, Collapse — e le voci inline che
// preparano lo stesso paragrafo affiancato) deve finire SEMPRE nella
// STESSA riga del target, mai in un paragrafo orfano "in basso" fuori riga.
// Regressione segnalata: textbox + Dado finiva sotto la textbox; sul + di
// riga le voci inline non facevano nulla.

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*' },
    text: { group: 'inline' },
    textBox: { group: 'block', content: 'paragraph+', isolating: true },
    collapseBlock: { group: 'block', content: 'collapseSummary collapseBody', isolating: true },
    collapseSummary: { content: 'inline*' },
    collapseBody: { content: 'block+' },
    blockRow: { group: 'block', content: BLOCK_ROW_CONTENT, isolating: true },
  },
});

const p = (text = '') => schema.nodes.paragraph.create(null, text ? schema.text(text) : undefined);
const textBox = (text) => schema.nodes.textBox.createAndFill({}, [p(text)]);
const collapse = (bodyText) =>
  schema.nodes.collapseBlock.create({ open: false }, [
    schema.nodes.collapseSummary.create({}, []),
    schema.nodes.collapseBody.create({}, [p(bodyText)]),
  ]);
const row = (...children) => schema.nodes.blockRow.create(null, children);
const doc = (...blocks) => schema.nodes.doc.create(null, blocks);

// posizione del BLOCCO che contiene il marker (textBox/collapse/paragraph)
function blockPosOf(target, marker) {
  let found = null;
  target.descendants((node, pos) => {
    if (found !== null) return;
    if (['textBox', 'collapseBlock', 'paragraph'].includes(node.type.name) && node.textContent.includes(marker)) {
      found = pos;
    }
  });
  assert.notEqual(found, null, `fixture must contain block with ${marker}`);
  return found;
}

function rowWithMarker(target, marker) {
  let found = null;
  target.descendants((node, pos) => {
    if (found !== null) return;
    if (node.type.name === 'blockRow' && node.textContent.includes(marker)) found = { pos, node };
  });
  return found;
}

const KINDS = ['paragraph', 'textBox', 'collapseBlock'];
const SIDES = ['left', 'right'];

const TARGETS = [
  {
    name: 'textbox standalone',
    marker: 'TB',
    doc: () => doc(p('intro'), textBox('TB')),
    pos: (d) => blockPosOf(d, 'TB'),
  },
  {
    name: 'collapse standalone',
    marker: 'CL',
    doc: () => doc(collapse('CL')),
    pos: (d) => blockPosOf(d, 'CL'),
  },
  {
    name: 'paragraph standalone',
    marker: 'PAR',
    doc: () => doc(p('PAR')),
    pos: (d) => blockPosOf(d, 'PAR'),
  },
  {
    name: 'child inside a row',
    marker: 'IN',
    doc: () => doc(row(textBox('IN'), p('x'))),
    pos: (d) => blockPosOf(d, 'IN'),
  },
  {
    name: 'whole row',
    marker: 'ROW',
    doc: () => doc(row(textBox('ROW'))),
    pos: (d) => {
      let found = null;
      d.descendants((node, pos) => {
        if (found === null && node.type.name === 'blockRow' && node.textContent.includes('ROW')) found = pos;
      });
      assert.notEqual(found, null, 'fixture must contain the row');
      return found;
    },
  },
];

const newItemType = (kind) => (kind === 'paragraph' ? 'paragraph' : kind);
const itemContentEmpty = (item, kind) => {
  if (kind === 'paragraph') return item.textContent === '';
  if (kind === 'textBox') return item.childCount === 1 && item.firstChild.textContent === '';
  return item.childCount === 2 && item.textContent === '';
};

for (const target of TARGETS) {
  for (const kind of KINDS) {
    for (const side of SIDES) {
      const label = `${target.name} x ${kind} x ${side}`;
      const startDoc = target.doc();
      const startPos = target.pos(startDoc);
      const startState = EditorState.create({ schema, doc: startDoc });
      const tr = startState.tr;
      const ok = applyBlockToRow(tr, schema, { kind, side, pos: startPos });
      assert.equal(ok, true, `${label}: applyBlockToRow must succeed`);

      const finalDoc = tr.doc;
      const withRow = rowWithMarker(finalDoc, target.marker);
      assert.ok(withRow, `${label}: target must end up inside a blockRow (no orphan "below" paragraph)`);
      const { pos: rowPos, node: rowNode } = withRow;

      // il nuovo elemento e' l'ultimo (side right) o il primo (side left) figlio
      const item = side === 'right' ? rowNode.lastChild : rowNode.firstChild;
      assert.equal(item.type.name, newItemType(kind), `${label}: new element must sit at the ${side} edge of the row`);
      assert.ok(itemContentEmpty(item, kind), `${label}: the new element must be the freshly created empty one`);

      // il target resta sempre nella stessa riga
      const finalTargetPos = blockPosOf(finalDoc, target.marker);
      assert.ok(
        finalTargetPos > rowPos && finalTargetPos < rowPos + rowNode.nodeSize,
        `${label}: target must stay inside the same row`,
      );

      // il caret finisce dentro la riga appena costruita
      const sel = tr.selection.from;
      assert.ok(sel > rowPos && sel < rowPos + rowNode.nodeSize, `${label}: caret must land inside the row`);

      // nessun fratello "orfano": il doc non deve guadagnare blocchi liberi
      // (il wrap sostituisce, l'insert-in-row resta dentro la riga)
      assert.equal(finalDoc.childCount, startDoc.childCount, `${label}: doc must not gain free-floating blocks`);
    }
  }
}

// Caso di regressione segnalato: la riga finale con Dado affiancato.
{
  const startDoc = doc(p('intro'), textBox('TB'));
  const startState = EditorState.create({ schema, doc: startDoc });
  const tr = startState.tr;
  applyBlockToRow(tr, schema, { kind: 'paragraph', side: 'right', pos: blockPosOf(startDoc, 'TB') });
  const finalDoc = tr.doc;
  const withRow = rowWithMarker(finalDoc, 'TB');
  assert.ok(withRow, 'textbox + Dado: the die paragraph must be created inside the row');
  assert.equal(finalDoc.lastChild.type.name, 'blockRow', 'textbox + Dado: row must be the last block');
  assert.equal(withRow.node.childCount, 2, 'textbox + Dado: row must be [textBox, paragraph] side by side');
  assert.equal(withRow.node.lastChild.type.name, 'paragraph', 'textbox + Dado: the die host paragraph must follow the box');
}

// --- Wiring del gutter: le voci inline usano lo stesso percorso affiancato ---

const gutter = await readFile(
  new URL('../src/app/components/session/shared/NoteRowGutter.tsx', import.meta.url),
  'utf8',
);
for (const id of ['inlineModifier', 'inlineDice', 'inlinePoints', 'checkbox', 'radio']) {
  assert.ok(
    gutter.includes(`'${id}'`),
    `wiring: ${id} must be handled by the blockPos affiancamento branch`,
  );
}
assert.match(
  gutter,
  /: isInlineInsert \? 'paragraph'\n {10}: null;/,
  'wiring: inline inserts must prepare a paragraph inside the row via addBlockToRow',
);
assert.match(
  gutter,
  /if \(ok && isInlineInsert\) \{[\s\S]{0,600}?insertInlineDice[\s\S]{0,400}?clampNewBoxToRow\(\);/,
  'wiring: after addBlockToRow the inline (dice) must be inserted at the prepared caret',
);
assert.match(
  gutter,
  /isInlineInsert[\s\S]{0,1600}?return;\n {8}\}\n {6}\}\n {6}const rows = resolveMenuEdge/,
  'wiring: inline inserts must return before resolveMenuEdge (the raw paragraph insert)',
);
assert.ok(
  !/kind =\s*\n\s*command\.id === 'gutterText' \? 'paragraph' : command\.id === 'textBox' \? 'textBox' : command\.id === 'collapse' \? 'collapseBlock' : null/.test(gutter),
  'wiring: the old block-only kind chain must be replaced',
);

console.log('Note row insertion combinations (plus matrix + wiring) verification: PASS');
