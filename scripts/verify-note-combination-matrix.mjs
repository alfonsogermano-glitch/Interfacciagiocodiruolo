import assert from 'node:assert/strict';
import { Schema } from '@tiptap/pm/model';
import { EditorState, TextSelection, NodeSelection } from '@tiptap/pm/state';
import { history, undo, redo, closeHistory } from '@tiptap/pm/history';
import { GapCursor } from '@tiptap/pm/gapcursor';
import { noteCaretStops, nextNoteCaretSelection } from '../src/app/components/session/shared/noteCaretNavigation.ts';
import { noteNeedsTrailingParagraph, createBlockRowTrailingParagraphPlugin, applyBlockToRow, BLOCK_ROW_CONTENT } from '../src/app/components/session/shared/tiptapBlockRow.ts';
import { NOTE_CASES, documentFor, fixture } from './note-regression-fixtures.mjs';

const schema = new Schema({ nodes: {
  doc: { content: 'block+' }, text: { group: 'inline' },
  paragraph: { group: 'block', content: 'inline*' },
  textBox: { group: 'block', content: 'block+', isolating: true },
  blockRow: { group: 'block', content: BLOCK_ROW_CONTENT, isolating: true },
  collapseBlock: { group: 'block', content: 'collapseSummary collapseBody', isolating: true, attrs: { open: { default: false } } },
  collapseSummary: { content: 'inline*' }, collapseBody: { content: 'block+' },
  table: { group: 'block', content: 'tableRow+', isolating: true }, tableRow: { content: 'tableCell+' }, tableCell: { content: 'block+', isolating: true },
  archivio: { group: 'block', atom: true, selectable: false, isolating: true, attrs: { archiveId: {default: ''}, title: {default: ''}, columns: {default: []}, rows: {default: []} } },
  bulletList: { group: 'block', content: 'listItem+' }, listItem: { content: 'paragraph block*' },
  taskList: { group: 'block', content: 'taskItem+' }, taskItem: { content: 'paragraph block*', attrs: { checked: {default: false} } },
  image: { group: 'block', atom: true, attrs: { src: {default: ''}, alt: {default: ''} } }, horizontalRule: { group: 'block', atom: true },
}, marks: Object.fromEntries(['inlineDice', 'inlineModifier', 'inlinePoints', 'inlineCheckbox', 'inlineRadio', 'inlineIcon'].map(name => [name, { attrs: { id: {default: ''} } }])) });
const selectionAt = (doc, stop) => stop.kind === 'gap' ? new GapCursor(doc.resolve(stop.pos)) : stop.kind === 'node' ? NodeSelection.create(doc, stop.pos) : TextSelection.create(doc, stop.pos);
const signature = s => ({ pos: s.from, kind: s instanceof GapCursor ? 'gap' : s instanceof NodeSelection ? 'node' : 'text' });
let documents = 0, moves = 0, rows = 0;
function checkDocument(names) {
  const label = names.join(' → ');
  const original = schema.nodeFromJSON(documentFor(names)); original.check();
  let state = EditorState.create({ schema, doc: original, plugins: [createBlockRowTrailingParagraphPlugin(), history()] });
  // Actual docChanged transaction, including when restoring an existing note.
  state = state.apply(state.tr.replaceWith(0, original.content.size, original.content).setMeta('addToHistory', false));
  assert.equal(noteNeedsTrailingParagraph(state.doc), false, `${label}: missing final insertion point`);
  if (noteNeedsTrailingParagraph(original)) {
    assert.equal(state.doc.lastChild.type.name, 'paragraph');
    assert.equal(state.doc.lastChild.content.size, 0);
    assert.ok(state.doc.content.cut(0, original.content.size).eq(original.content), `${label}: normalization must preserve all existing content`);
  } else assert.ok(state.doc.eq(original), `${label}: text/empty paragraph must not grow`);
  const stable = state.doc;
  assert.ok(schema.nodeFromJSON(JSON.parse(JSON.stringify(stable.toJSON()))).eq(stable), `${label}: JSON roundtrip`);
  const path = noteCaretStops(stable);
  for (const dir of [1, -1]) {
    const ordered = dir > 0 ? path : [...path].reverse();
    let cursor = EditorState.create({ schema, doc: stable, selection: selectionAt(stable, ordered[0]) });
    for (const stop of ordered.slice(1)) {
      const next = nextNoteCaretSelection(cursor, dir);
      assert.ok(next, `${label}: unreachable stop`);
      assert.deepEqual(signature(next), stop, `${label}: skipped stop`);
      cursor = cursor.apply(cursor.tr.setSelection(next)); moves++;
    }
    assert.equal(nextNoteCaretSelection(cursor, dir), null, `${label}: path must not wrap`);
    assert.equal(cursor.doc, stable, `${label}: arrows must not mutate the document`);
  }
  // A real edit below the final elements, then undo/redo must be lossless.
  const last = path.at(-1);
  assert.equal(last.kind, 'text', `${label}: final stop must be writable text`);
  state = state.apply(closeHistory(state.tr).setSelection(TextSelection.create(stable, last.pos)).insertText('TEST'));
  const edited = state.doc;
  assert.ok(undo(state, tr => { state = state.apply(tr); }), `${label}: edit must be undoable`);
  assert.ok(state.doc.eq(stable), `${label}: undo must restore all elements`);
  assert.ok(redo(state, tr => { state = state.apply(tr); }), `${label}: redo must work`);
  assert.ok(state.doc.eq(edited), `${label}: redo must restore the text`);
  if (stable.lastChild.content.size === 0) {
    const start = stable.content.size - stable.lastChild.nodeSize;
    let deletion = EditorState.create({ schema, doc: stable, plugins: [createBlockRowTrailingParagraphPlugin()] });
    deletion = deletion.apply(deletion.tr.delete(start, stable.content.size));
    if (noteNeedsTrailingParagraph(original)) assert.ok(deletion.doc.eq(stable), `${label}: deleted tail must be restored exactly once`);
  }
  documents++;
}
for (const a of NOTE_CASES) {
  checkDocument([a]);
  for (const b of NOTE_CASES) {
    checkDocument([a,b]);
    for (const c of NOTE_CASES) checkDocument([a,b,c]);
  }
}
const rowCases = NOTE_CASES.filter(name => ['paragraph', 'textBox', 'collapseBlock'].includes(fixture(name).type));
for (const a of rowCases) for (const b of rowCases) {
  const original = schema.node('doc', null, [schema.node('blockRow', null, [schema.nodeFromJSON(fixture(a,'a')),schema.nodeFromJSON(fixture(b,'b'))])]);
  for (const kind of ['paragraph','textBox','collapseBlock']) for (const side of ['left','right']) {
    const state = EditorState.create({ schema, doc: original });
    const tr = state.tr;
    assert.equal(applyBlockToRow(tr, schema, {kind,side,pos:0}),true, `${a}/${b}/${kind}/${side}`);
    tr.doc.check();
    assert.equal(tr.doc.firstChild.childCount,3,'side insertion must stay in the row');
    const children = side === 'left' ? [tr.doc.firstChild.child(1),tr.doc.firstChild.child(2)] : [tr.doc.firstChild.child(0),tr.doc.firstChild.child(1)];
    assert.ok(children[0].eq(original.firstChild.child(0)) && children[1].eq(original.firstChild.child(1)), 'side insertion must preserve both original elements');
    const withTail = EditorState.create({schema,doc:tr.doc,plugins:[createBlockRowTrailingParagraphPlugin()]});
    const repaired = withTail.apply(withTail.tr.replaceWith(0,tr.doc.content.size,tr.doc.content));
    assert.equal(repaired.doc.lastChild.content.size,0,'an element row must have a trailing insertion point');
    rows++;
  }
}
console.log(`PASS note matrix: ${NOTE_CASES.length} types; ${documents} single/pair/triple documents; ${moves} forward/reverse caret moves; ${rows} side insertions; JSON roundtrip, edit, undo/redo and tail restoration.`);
