import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getNoteTableContainerGapTarget } from '../src/app/components/session/shared/noteTableContainerGapCursor.ts';

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
assert.match(tableSource, /GapCursor\.valid\(\$gap\)/, 'only valid ProseMirror gaps may receive the cursor');
assert.match(tableSource, /NoteTableContainerGapCursor,[\s\S]*NoteTableResizeBootstrap/, 'gap handling must be registered before ordinary table mousedown handling');

console.log('Note table container gap verification: PASS');
