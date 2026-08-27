import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../src/app/components/session/SessionNotesPanel.tsx', import.meta.url),
  'utf8',
);

assert.match(source, /NOTES_SIDEBAR_DEFAULT_WIDTH\s*=\s*256/, 'default note sidebar width must remain 256px');
assert.match(source, /NOTES_SIDEBAR_MIN_WIDTH\s*=\s*192/, 'note sidebar must have a usable minimum width');
assert.match(source, /NOTES_DETAIL_MIN_WIDTH\s*=\s*360/, 'note detail must retain meaningful minimum room');
assert.match(source, /containerWidth - NOTES_DETAIL_MIN_WIDTH/, 'maximum sidebar width must depend on available panel width');
assert.match(source, /localStorage\.getItem\(NOTES_SIDEBAR_STORAGE_KEY\)/, 'saved sidebar width must be restored');
assert.match(source, /localStorage\.setItem\(NOTES_SIDEBAR_STORAGE_KEY/, 'sidebar width must persist locally');
assert.match(source, /new ResizeObserver\(/, 'sidebar width must re-clamp when the panel resizes');
assert.match(source, /setPointerCapture\(event\.pointerId\)/, 'dragging must use pointer capture');
assert.match(source, /releasePointerCapture\(event\.pointerId\)/, 'pointer capture must be released');
assert.match(source, /data-note-sidebar-resizer="true"/, 'divider must expose a dedicated resize hit target');
assert.match(source, /touchAction:\s*'none'/, 'splitter must suppress browser touch gestures while dragging');
assert.match(source, /style=\{\{\s*width:\s*sidebarWidth\s*\}\}/, 'sidebar width must be driven by state');
assert.doesNotMatch(source, /className="w-64 shrink-0 overflow-y-auto/, 'fixed w-64 sidebar must not return');
assert.match(source, /className="min-w-0 flex-1 overflow-auto p-4"/, 'detail pane must be allowed to shrink correctly');

console.log('Note panel resize verification: PASS');
