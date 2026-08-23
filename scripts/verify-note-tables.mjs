import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

let feature;
try {
  feature = await import('../src/app/components/session/shared/tiptapNoteTable.ts');
} catch (error) {
  if (error?.code === 'ERR_MODULE_NOT_FOUND' || String(error?.message ?? '').includes('tiptapNoteTable')) {
    assert.fail('Note table core not implemented yet');
  }
  throw error;
}

const { NOTE_TABLE_CELL_CONTENT, NOTE_TABLE_EXTENSIONS, sliceContainsTable } = feature;
assert.ok(Array.isArray(NOTE_TABLE_EXTENSIONS) && NOTE_TABLE_EXTENSIONS.length >= 4, 'note table extensions must be exported');
assert.match(NOTE_TABLE_CELL_CONTENT, /textBox/, 'table cells must allow a direct TextBox');
assert.match(NOTE_TABLE_CELL_CONTENT, /collapseBlock/, 'table cells must allow a direct CollapseBlock');
assert.doesNotMatch(NOTE_TABLE_CELL_CONTENT, /(?:^|\|\s*)table(?:\s*\||$)/, 'table cell content must exclude nested table nodes');
assert.equal(typeof sliceContainsTable, 'function', 'nested-table Slice detector must be exported');

const source = await readFile(new URL('../src/app/components/session/shared/tiptapNoteTable.ts', import.meta.url), 'utf8');
assert.match(source, /insertTable\(\{\s*rows:\s*3,\s*cols:\s*3,\s*withHeaderRow:\s*false\s*\}\)/s, 'insertNoteTable must create exactly 3x3 with no header');
assert.match(source, /isSelectionInside\(state, 'table'\)/, 'table insertion must be blocked while already inside a table');
assert.match(source, /isSelectionInside\(state, 'textBox'\)/, 'table insertion must be blocked inside TextBox');
assert.match(source, /isSelectionInside\(state, 'collapseBody'\)/, 'table insertion must be blocked inside CollapseBlock body');
assert.match(source, /handlePaste/, 'nested table paste must be guarded');
assert.match(source, /handleDrop/, 'nested table drop must be guarded');

console.log('Note table core verification: PASS');
