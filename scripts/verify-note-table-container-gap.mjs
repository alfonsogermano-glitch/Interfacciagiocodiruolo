import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getNoteTableContainerGapTarget, getNoteTableContainerArrowSelection } from '../src/app/components/session/shared/noteTableContainerGapCursor.ts';
import { Schema } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { GapCursor } from '@tiptap/pm/gapcursor';
import { tableNodes } from '@tiptap/pm/tables';

const base = { top: 100, bottom: 200, childCount: 1 };

assert.equal(getNoteTableContainerGapTarget({ ...base, containerType: 'textBox', parentRole: 'cell', childIndex: 0, clientY: 96 }), 'before', 'TextBox first in a cell must expose the gap before it');
assert.equal(getNoteTableContainerGapTarget({ ...base, containerType: 'textBox', parentRole: 'cell', childIndex: 0, clientY: 204 }), 'after', 'TextBox last in a cell must expose the gap after it');
assert.equal(getNoteTableContainerGapTarget({ ...base, containerType: 'collapseBlock', parentRole: 'cell', childIndex: 0, clientY: 96 }), 'before', 'Collapse first in a cell must expose the gap before it');
assert.equal(getNoteTableContainerGapTarget({ ...base, containerType: 'collapseBlock', parentRole: 'cell', childIndex: 0, clientY: 204 }), 'after', 'Collapse last in a cell must expose the gap after it');
assert.equal(getNoteTableContainerGapTarget({ ...base, containerType: 'collapseBlock', parentRole: 'header_cell', childIndex: 0, clientY: 204 }), 'after', 'Header cells must expose the same boundary gap');
assert.equal(getNoteTableContainerGapTarget({ ...base, containerType: 'textBox', parentRole: 'cell', childIndex: 0, clientY: 150 }), null, 'clicks on the visible block must keep normal block selection');
assert.equal(getNoteTableContainerGapTarget({ top: 100, bottom: 200, childCount: 3, containerType: 'textBox', parentRole: 'cell', childIndex: 1, clientY: 96 }), null, 'a non-first block must not steal the gap before a previous sibling');
assert.equal(getNoteTableContainerGapTarget({ top: 100, bottom: 200, childCount: 3, containerType: 'collapseBlock', parentRole: 'cell', childIndex: 1, clientY: 204 }), null, 'a non-last block must not steal the gap after a following sibling');
assert.equal(getNoteTableContainerGapTarget({ ...base, containerType: 'textBox', parentRole: 'paragraph', childIndex: 0, clientY: 96 }), null, 'the override must be table-cell-only');
assert.equal(getNoteTableContainerGapTarget({ ...base, containerType: 'image', parentRole: 'cell', childIndex: 0, clientY: 96 }), null, 'only TextBox and Collapse use the structural hit-area override');

const tableSource = await readFile(new URL('../src/app/components/session/shared/tiptapNoteTable.ts', import.meta.url), 'utf8');
assert.match(tableSource, /import \{ GapCursor \} from '@tiptap\/pm\/gapcursor'/, 'table integration must use the real ProseMirror GapCursor');
assert.match(tableSource, /addEventListener\('mousedown', onMouseDown, true\)/, 'boundary handler must run in capture phase before Collapse NodeView stopEvent');
assert.match(tableSource, /parentRole === 'cell'[\s\S]*parentRole === 'header_cell'/, 'normal and header cells must both be supported');
assert.match(tableSource, /side === 'before'[\s\S]*container\.pos \+ container\.node\.nodeSize/, 'before/after selections must map to exact block boundaries');
assert.match(tableSource, /isValidNoteTableGapCursor\(\$gap\)/, 'only valid ProseMirror gaps may receive the cursor');
assert.match(tableSource, /NoteTableContainerGapCursor,[\s\S]*NoteTableResizeBootstrap/, 'gap handling must be registered before ordinary table mousedown handling');
assert.match(tableSource, /addEventListener\('keydown', onKeyDown, true\)/, 'vertical arrow handler must run in capture phase before broad table arrow handling');
assert.match(tableSource, /getNoteTableContainerArrowSelection\([\s\S]*view\.state[\s\S]*view\.endOfTextblock/, 'keyboard integration must resolve structural gaps from the current editor state');
assert.match(tableSource, /ArrowUp[\s\S]*ArrowDown[\s\S]*preventDefault\(\)[\s\S]*stopImmediatePropagation\(\)/, 'handled structural arrow motion must suppress the native/table fallback');



// Keyboard regression: vertical arrow navigation must expose the exact same
// before/after GapCursor positions without requiring a prior mouse click.
const keyboardTableNodes = tableNodes({ tableGroup: 'block', cellContent: 'block+' });
const keyboardSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*' },
    text: { group: 'inline' },
    textBox: { group: 'block', content: 'paragraph+', isolating: true, selectable: true },
    collapseBlock: { group: 'block', content: 'paragraph+', isolating: true, selectable: true },
    ...keyboardTableNodes,
  },
});
const kp = (text = '') => keyboardSchema.nodes.paragraph.create(null, text ? keyboardSchema.text(text) : undefined);
const kbox = (type, text) => keyboardSchema.nodes[type].create(null, [kp(text)]);
const kcell = (...content) => keyboardSchema.nodes.table_cell.create(null, content);
const kheader = (...content) => keyboardSchema.nodes.table_header.create(null, content);
const krow = (...cells) => keyboardSchema.nodes.table_row.create(null, cells);
const ktable = (...rows) => keyboardSchema.nodes.table.create(null, rows);
const kdoc = (...blocks) => keyboardSchema.nodes.doc.create(null, blocks);
function nodePos(doc, type, text) {
  let found = null;
  doc.descendants((node, pos) => {
    if (found !== null || node.type.name !== type) return;
    if (text === undefined || node.textContent === text) found = pos;
  });
  assert.notEqual(found, null, `fixture must contain ${type}:${text ?? ''}`);
  return found;
}
function textPos(doc, text, side) {
  let found = null;
  doc.descendants((node, pos) => {
    if (found !== null || !node.isText || node.text !== text) return;
    found = side === 'end' ? pos + text.length : pos;
  });
  assert.notEqual(found, null, `fixture must contain text ${text}`);
  return found;
}
function arrowSelection(doc, text, side, dir, atVisualEdge = true) {
  const state = EditorState.create({
    schema: keyboardSchema,
    doc,
    selection: TextSelection.create(doc, textPos(doc, text, side)),
  });
  return getNoteTableContainerArrowSelection(state, dir, () => atVisualEdge);
}

const currentBoxDoc = kdoc(ktable(
  krow(kcell(kbox('textBox', 'current-box'))),
  krow(kcell(kp('below-current-box'))),
));
const currentBoxPos = nodePos(currentBoxDoc, 'textBox', 'current-box');
const afterCurrentBox = arrowSelection(currentBoxDoc, 'current-box', 'end', 1);
assert.ok(afterCurrentBox instanceof GapCursor, 'ArrowDown at the bottom of a cell-filling TextBox must create a GapCursor after it');
assert.equal(afterCurrentBox.head, currentBoxPos + currentBoxDoc.nodeAt(currentBoxPos).nodeSize, 'ArrowDown must land exactly after the current TextBox');
const beforeCurrentBox = arrowSelection(currentBoxDoc, 'current-box', 'start', -1);
assert.ok(beforeCurrentBox instanceof GapCursor, 'ArrowUp at the top of a cell-filling TextBox must create a GapCursor before it');
assert.equal(beforeCurrentBox.head, currentBoxPos, 'ArrowUp must land exactly before the current TextBox');

const currentCollapseDoc = kdoc(ktable(
  krow(kcell(kbox('collapseBlock', 'current-collapse'))),
  krow(kcell(kp('below-current-collapse'))),
));
const currentCollapsePos = nodePos(currentCollapseDoc, 'collapseBlock', 'current-collapse');
const afterCurrentCollapse = arrowSelection(currentCollapseDoc, 'current-collapse', 'end', 1);
assert.ok(afterCurrentCollapse instanceof GapCursor, 'ArrowDown at the bottom of a cell-filling Collapse must create a GapCursor after it');
assert.equal(afterCurrentCollapse.head, currentCollapsePos + currentCollapseDoc.nodeAt(currentCollapsePos).nodeSize, 'Collapse ArrowDown must land exactly after the block');

const enterBoxDoc = kdoc(ktable(
  krow(kcell(kp('above-box'))),
  krow(kcell(kbox('textBox', 'destination-box'))),
));
const destinationBoxPos = nodePos(enterBoxDoc, 'textBox', 'destination-box');
const enterBox = arrowSelection(enterBoxDoc, 'above-box', 'end', 1);
assert.ok(enterBox instanceof GapCursor, 'ArrowDown into a cell occupied by a TextBox must expose the gap before it');
assert.equal(enterBox.head, destinationBoxPos, 'ArrowDown destination gap must be exactly before the TextBox');

const enterCollapseDoc = kdoc(ktable(
  krow(kcell(kbox('collapseBlock', 'destination-collapse'))),
  krow(kcell(kp('below-collapse'))),
));
const destinationCollapsePos = nodePos(enterCollapseDoc, 'collapseBlock', 'destination-collapse');
const enterCollapse = arrowSelection(enterCollapseDoc, 'below-collapse', 'start', -1);
assert.ok(enterCollapse instanceof GapCursor, 'ArrowUp into a cell occupied by a Collapse must expose the gap after it');
assert.equal(enterCollapse.head, destinationCollapsePos + enterCollapseDoc.nodeAt(destinationCollapsePos).nodeSize, 'ArrowUp destination gap must be exactly after the Collapse');

const headerDoc = kdoc(ktable(
  krow(kheader(kbox('textBox', 'header-box'))),
  krow(kcell(kp('under-header'))),
));
const headerBoxPos = nodePos(headerDoc, 'textBox', 'header-box');
const enterHeader = arrowSelection(headerDoc, 'under-header', 'start', -1);
assert.ok(enterHeader instanceof GapCursor, 'ArrowUp into a header cell occupied by a TextBox must expose its gap');
assert.equal(enterHeader.head, headerBoxPos + headerDoc.nodeAt(headerBoxPos).nodeSize, 'header-cell ArrowUp must land after the structural block');

assert.equal(arrowSelection(currentBoxDoc, 'current-box', 'end', 1, false), null, 'Arrow navigation inside a visual text line must remain native');
const mixedDoc = kdoc(ktable(krow(kcell(kp('prefix'), kbox('textBox', 'mixed-box')))));
assert.equal(arrowSelection(mixedDoc, 'mixed-box', 'end', 1), null, 'a cell with additional direct content must not be treated as totally occupied by the structural element');

const gapTravelDoc = kdoc(ktable(
  krow(kcell(kbox('textBox', 'gap-a'))),
  krow(kcell(kbox('collapseBlock', 'gap-b'))),
));
const gapAPos = nodePos(gapTravelDoc, 'textBox', 'gap-a');
const gapBPos = nodePos(gapTravelDoc, 'collapseBlock', 'gap-b');
const gapAAfter = gapAPos + gapTravelDoc.nodeAt(gapAPos).nodeSize;
const gapStateDown = EditorState.create({ schema: keyboardSchema, doc: gapTravelDoc, selection: new GapCursor(gapTravelDoc.resolve(gapAAfter)) });
const gapDown = getNoteTableContainerArrowSelection(gapStateDown, 1, () => true);
assert.ok(gapDown instanceof GapCursor, 'ArrowDown from the after-gap must continue vertically into the next structural cell');
assert.equal(gapDown.head, gapBPos, 'vertical GapCursor travel must enter the next structural cell before its block');
const gapStateUp = EditorState.create({ schema: keyboardSchema, doc: gapTravelDoc, selection: new GapCursor(gapTravelDoc.resolve(gapBPos)) });
const gapUp = getNoteTableContainerArrowSelection(gapStateUp, -1, () => true);
assert.ok(gapUp instanceof GapCursor, 'ArrowUp from the before-gap must continue vertically into the previous structural cell');
assert.equal(gapUp.head, gapAAfter, 'vertical GapCursor travel must enter the previous structural cell after its block');


console.log('Note table container gap verification: PASS');
