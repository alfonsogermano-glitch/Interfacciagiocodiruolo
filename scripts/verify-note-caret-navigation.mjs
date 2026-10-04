import assert from 'node:assert/strict';
import { Schema } from '@tiptap/pm/model';
import { EditorState, TextSelection, NodeSelection } from '@tiptap/pm/state';
import { GapCursor } from '@tiptap/pm/gapcursor';
import { noteCaretStops, nextNoteCaretSelection } from '../src/app/components/session/shared/noteCaretNavigation.ts';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*' },
    text: { group: 'inline' },
    checkbox: { group: 'inline', inline: true, atom: true },
    hardBreak: { group: 'inline', inline: true, selectable: false },
    image: { group: 'block', atom: true },
    blockRow: { group: 'block', content: '(paragraph | textBox | collapseBlock)+', isolating: true },
    textBox: { group: 'block', content: 'block+', isolating: true },
    collapseBlock: { group: 'block', content: 'collapseSummary collapseBody', isolating: true, attrs: { open: { default: false } } },
    collapseSummary: { content: 'inline*' },
    collapseBody: { content: 'block+' },
    table: { group: 'block', content: 'tableRow+', isolating: true },
    tableRow: { content: 'tableCell+' },
    tableCell: { content: 'block+', isolating: true },
    archivio: { group: 'block', atom: true, selectable: false, isolating: true },
    bulletList: { group: 'block', content: 'listItem+' },
    listItem: { content: 'paragraph block*' },
  },
  marks: { inlineDice: {}, inlineModifier: {}, inlinePoints: {}, inlineIcon: {} },
});
const n = (name, children, attrs) => schema.nodes[name].create(attrs, children);
const p = (text = '') => n('paragraph', text ? schema.text(text) : undefined);
const collapse = (title, open) => n('collapseBlock', [n('collapseSummary', schema.text(title)), n('collapseBody', [p('hidden body'), p('second body')])], { open });
const box = (...children) => n('textBox', children);
const row = (...children) => n('blockRow', children);
const marked = type => schema.text('\u200b', [schema.marks[type].create()]);
const dice = n('paragraph', [schema.text('a '), marked('inlineDice'), schema.text(' b')]);
const mixed = n('doc', [
  p('a b'),
  row(collapse('one', false), dice, box(p('box'), p('next'))),
  row(box(p('left')), collapse('two', true)),
  collapse('three', false),
  n('paragraph', [marked('inlineModifier'), schema.text(' '), marked('inlinePoints'), schema.text(' '), marked('inlineIcon'), n('checkbox'), n('hardBreak'), schema.text('z')]),
  n('bulletList', [n('listItem', p('list one')), n('listItem', p('list two'))]),
  n('table', [n('tableRow', [n('tableCell', collapse('cell one', false)), n('tableCell', p('cell two'))]),
    n('tableRow', [n('tableCell', box(p('cell three'))), n('tableCell', p('cell four'))])]),
  n('archivio'), n('image'), p('end'),
]);
const signature = selection => ({ pos: selection.from, kind: selection instanceof GapCursor ? 'gap' : selection instanceof NodeSelection ? 'node' : 'text' });
const selectionAt = (doc, stop) => stop.kind === 'gap' ? new GapCursor(doc.resolve(stop.pos)) :
  stop.kind === 'node' ? NodeSelection.create(doc, stop.pos) : TextSelection.create(doc, stop.pos);

for (const doc of [mixed, n('doc', [collapse('one', false), collapse('two', false), collapse('three', false)]),
  n('doc', [row(collapse('one', false), dice), row(box(p('two')), dice), p()]), n('doc', [p('e\u0301 👩‍👩‍👧‍👦 a')])]) {
  const stops = noteCaretStops(doc);
  assert.ok(stops.length > 1);
  assert.equal(noteCaretStops(doc), stops, 'same document must reuse its cached path');
  for (const dir of [1, -1]) {
    const expected = dir > 0 ? [...stops] : [...stops].reverse();
    let state = EditorState.create({ schema, doc, selection: selectionAt(doc, expected[0]) });
    for (const stop of expected.slice(1)) {
      const next = nextNoteCaretSelection(state, dir);
      assert.ok(next, 'each adjacent stop must be reachable');
      assert.deepEqual(signature(next), stop, 'navigation must not skip a caret stop');
      state = state.apply(state.tr.setSelection(next));
      assert.equal(state.doc, doc, 'arrow motion must never modify the note');
    }
    assert.equal(nextNoteCaretSelection(state, dir), null, 'path boundary must not wrap or jump');
  }
}

// Independent coverage: each text position is visited; closed bodies are not.
const stops = noteCaretStops(mixed);
mixed.descendants((node, pos) => {
  if (node.type.name === 'collapseBlock' && !node.attrs.open) {
    const summaryEnd = pos + 2 + node.firstChild.content.size;
    const end = pos + node.nodeSize;
    assert.ok(!stops.some(s => s.kind === 'text' && s.pos > summaryEnd && s.pos < end), 'closed body must be excluded');
    return false;
  }
  if (node.isTextblock) {
    for (let offset = 0; offset <= node.content.size; offset++) {
      assert.ok(stops.some(s => s.kind === 'text' && s.pos === pos + 1 + offset), `missing character/space/element boundary at ${pos + 1 + offset}`);
    }
  }
  if (node.type.name === 'archivio') {
    assert.ok(stops.some(s => s.kind === 'gap' && s.pos === pos));
    assert.ok(stops.some(s => s.kind === 'gap' && s.pos === pos + node.nodeSize));
    assert.ok(!stops.some(s => s.kind === 'node' && s.pos === pos), 'non-selectable grid must retain its node protection');
  }
});
const unicode = n('doc', [p('e\u0301 👩‍👩‍👧‍👦 a')]);
assert.deepEqual(noteCaretStops(unicode).map(s => s.pos), [1, 3, 4, 15, 16, 17], 'combining accents and emoji must not be split');
const rangeDoc = n('doc', [p('abcd')]);
const rangeState = EditorState.create({ schema, doc: rangeDoc, selection: TextSelection.create(rangeDoc, 2, 4) });
assert.equal(nextNoteCaretSelection(rangeState, 1).from, 4);
assert.equal(nextNoteCaretSelection(rangeState, -1).from, 2);
console.log(`Universal note caret navigation: PASS (${stops.length} mixed stops, complete forward/reverse paths, hidden bodies, tables, grids, inline atoms and Unicode).`);
