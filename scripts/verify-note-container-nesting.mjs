import assert from 'node:assert/strict';
import { Schema } from '@tiptap/pm/model';
import { EditorState, NodeSelection, TextSelection } from '@tiptap/pm/state';
import {
  analyzeStructuralSubtree,
  canInsertNoteContainer,
  canInsertStructuralSubtree,
  getStructuralDepth,
  validateNoteContainerDocument,
  validateStructuralReplacement,
} from '../src/app/components/session/shared/noteContainerPolicy.ts';
import { readFile } from 'node:fs/promises';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*' },
    text: { group: 'inline' },
    textBox: { group: 'block', content: 'block+' },
    collapseBlock: { group: 'block', content: 'collapseSummary collapseBody' },
    collapseSummary: { content: 'inline*' },
    collapseBody: { content: 'block+' },
    table: { group: 'block', content: 'tableRow+' },
    tableRow: { content: '(tableCell | tableHeader)+' },
    tableCell: { content: 'block+' },
    tableHeader: { content: 'block+' },
  },
});
const n = (type, content = undefined) => schema.nodes[type].create(null, content);
const p = (text = '') => n('paragraph', text ? schema.text(text) : undefined);
const box = (content) => n('textBox', content);
const collapse = (content) => n('collapseBlock', [n('collapseSummary'), n('collapseBody', content)]);
const table = (content = [p('cell')]) => n('table', [n('tableRow', [n('tableCell', content)])]);
const doc = (content) => n('doc', content);

function insideFirst(node, type) {
  let found = null;
  node.descendants((child, pos) => {
    if (found === null && child.type.name === type) { found = pos + 1; return false; }
    return found === null;
  });
  assert.notEqual(found, null, `missing ${type}`);
  return node.resolve(found);
}
function insideLastParagraph(node) {
  let found = null;
  node.descendants((child, pos) => { if (child.type.name === 'paragraph') found = pos + 1; });
  assert.notEqual(found, null);
  return node.resolve(found);
}

const root = doc([p('root')]);
assert.deepEqual(canInsertNoteContainer(insideFirst(root, 'paragraph'), 'textBox'), { allowed: true });
assert.deepEqual(canInsertNoteContainer(insideFirst(root, 'paragraph'), 'collapseBlock'), { allowed: true });
assert.deepEqual(canInsertNoteContainer(insideFirst(root, 'paragraph'), 'table'), { allowed: true });

const depth1Box = doc([box([p('inside')])]);
const depth1Collapse = doc([collapse([p('inside')])]);
for (const fixture of [depth1Box, depth1Collapse]) {
  const target = insideFirst(fixture, 'paragraph');
  assert.equal(getStructuralDepth(target), 1);
  assert.deepEqual(canInsertNoteContainer(target, 'textBox'), { allowed: true });
  assert.deepEqual(canInsertNoteContainer(target, 'collapseBlock'), { allowed: true });
  assert.deepEqual(canInsertNoteContainer(target, 'table'), { allowed: true });
}

const inTable = doc([table()]);
const tableTarget = insideFirst(inTable, 'paragraph');
assert.deepEqual(canInsertNoteContainer(tableTarget, 'textBox'), { allowed: true });
assert.deepEqual(canInsertNoteContainer(tableTarget, 'collapseBlock'), { allowed: true });
assert.deepEqual(canInsertNoteContainer(tableTarget, 'table'), { allowed: false, reason: 'table-in-table' });

const depth2 = doc([box([collapse([p('deep')])])]);
const depth2Target = insideFirst(depth2, 'paragraph');
for (const type of ['textBox','collapseBlock','table']) assert.deepEqual(canInsertNoteContainer(depth2Target, type), { allowed: false, reason: 'max-depth' });
const summaryTarget = insideFirst(depth1Collapse, 'collapseSummary');
assert.deepEqual(canInsertNoteContainer(summaryTarget, 'textBox'), { allowed: false, reason: 'collapse-summary' });

const siblings = doc([box([box([p('a')]), box([p('b')]), p('after')])]);
assert.equal(getStructuralDepth(insideLastParagraph(siblings)), 1, 'siblings do not consume structural depth');

const standaloneTable = table();
assert.deepEqual(canInsertStructuralSubtree(insideFirst(depth1Box, 'paragraph'), standaloneTable), { allowed: true });
assert.deepEqual(canInsertStructuralSubtree(tableTarget, standaloneTable), { allowed: false, reason: 'table-in-table' });
assert.equal(analyzeStructuralSubtree(box([collapse([p('x')])])).maxRelativeDepth, 2);
assert.deepEqual(validateNoteContainerDocument(depth2), { allowed: true });
const invalidDepth3 = doc([box([collapse([box([p('x')])])])]);
assert.deepEqual(validateNoteContainerDocument(invalidDepth3), { allowed: false, reason: 'max-depth' });



// Partial selections inside a structural container carry open wrapper nodes in
// their Slice (for example textBox -> paragraph -> inline checkbox/text). Those
// wrappers are context, not content to re-insert. Validation must therefore be
// based on the document produced by replaceSelection, not the raw Slice tree.
const partialSource = doc([box([p('X')])]);
let partialTextPos = null;
partialSource.descendants((node, pos) => {
  if (partialTextPos === null && node.isText) partialTextPos = pos;
});
assert.notEqual(partialTextPos, null);
const partialSlice = TextSelection.create(partialSource, partialTextPos, partialTextPos + 1).content();
assert.equal(partialSlice.openStart, 2, 'fixture must reproduce the open TextBox/paragraph wrapper context');
assert.equal(partialSlice.openEnd, 2, 'fixture must reproduce the open TextBox/paragraph wrapper context');

const partialTargetDoc = doc([box([p('AB')])]);
let partialTargetPos = null;
partialTargetDoc.descendants((node, pos) => {
  if (partialTargetPos === null && node.isText) partialTargetPos = pos + 1;
});
assert.notEqual(partialTargetPos, null);
const partialTargetState = EditorState.create({
  schema,
  doc: partialTargetDoc,
  selection: TextSelection.create(partialTargetDoc, partialTargetPos),
});
assert.deepEqual(
  validateStructuralReplacement(partialTargetState, partialSlice),
  { allowed: true },
  'copying one inline character from inside a TextBox must not be mistaken for copying the TextBox itself',
);
const partialResult = partialTargetState.tr.replaceSelection(partialSlice).doc;
assert.equal(partialResult.textContent, 'AXB', 'partial paste must insert only the selected inline content');
assert.equal(analyzeStructuralSubtree(partialResult).maxRelativeDepth, 1, 'partial paste must not create a nested TextBox');

// The opposite case must remain protected: a complete structural node really
// is pasted as a structural node, so inserting it at depth 2 must still fail.
const wholeBoxSlice = NodeSelection.create(partialSource, 0).content();
assert.equal(wholeBoxSlice.openStart, 0, 'whole TextBox selection must remain a closed structural slice');
const wholeTargetDoc = doc([box([collapse([p('deep')])])]);
let wholeTargetPos = null;
wholeTargetDoc.descendants((node, pos) => {
  if (wholeTargetPos === null && node.isText) wholeTargetPos = pos;
});
assert.notEqual(wholeTargetPos, null);
const wholeTargetState = EditorState.create({
  schema,
  doc: wholeTargetDoc,
  selection: TextSelection.create(wholeTargetDoc, wholeTargetPos),
});
assert.deepEqual(
  validateStructuralReplacement(wholeTargetState, wholeBoxSlice),
  { allowed: false, reason: 'max-depth' },
  'copying a whole TextBox must still respect structural nesting limits',
);

const guardSource = await readFile(new URL('../src/app/components/session/shared/tiptapNoteContainerGuard.ts', import.meta.url), 'utf8');
assert.match(
  guardSource,
  /handlePaste:[\s\S]*validateStructuralReplacement\(view\.state, slice\)/,
  'normal paste guard must validate the document produced by replacing the current selection',
);
const richClipboardSource = await readFile(new URL('../src/app/components/session/shared/tiptapNoteRichClipboard.ts', import.meta.url), 'utf8');
assert.match(
  richClipboardSource,
  /handlePaste:[\s\S]*validateStructuralReplacement\(view\.state, slice\)/,
  'rich clipboard paste must validate the replacement result instead of raw open Slice wrappers',
);

const blocks = await readFile(new URL('../src/app/components/session/shared/tiptapBlocks.tsx', import.meta.url), 'utf8');
assert.match(blocks, /NOTE_CONTAINER_BLOCK_CONTENT[\s\S]*textBox[\s\S]*collapseBlock[\s\S]*table/, 'TextBox/CollapseBody schema must allow structural children');
assert.match(blocks, /collapseSummary'[\s\S]*content: 'inline\*'/, 'Collapse title must remain text-only');
assert.doesNotMatch(blocks, /requestAnimationFrame/, 'Collapse insertion must keep the browser-approved single-transaction focus behavior');
const notice = await readFile(new URL('../src/app/components/session/shared/NoteContainerNotice.tsx', import.meta.url), 'utf8');
for (const message of [
  'Impossibile inserire: profondità massima dei contenitori raggiunta.',
  'Non è possibile inserire una tabella dentro un’altra tabella.',
  'Il titolo del Collapse può contenere solo testo.',
]) assert.match(notice, new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.match(notice, /aria-live="polite"/);
assert.match(notice, /var\(--dash-/);
assert.doesNotMatch(notice, /window\.alert|alert\s*\(/);

console.log('Note container nesting verification: PASS');
