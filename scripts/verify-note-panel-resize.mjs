import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../src/app/components/session/SessionNotesPanel.tsx', import.meta.url),
  'utf8',
);
const [sessionRightSidebar, slideOverPanel] = await Promise.all([
  readFile(new URL('../src/app/components/session/SessionRightSidebar.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/components/session/SlideOverPanel.tsx', import.meta.url), 'utf8'),
]);

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

assert.match(sessionRightSidebar, /NOTES_PANEL_STORAGE_KEY\s*=\s*'hollowgate\.notes\.panel-width'/, 'outer notes panel width must have its own storage key');
assert.match(sessionRightSidebar, /NOTES_PANEL_DEFAULT_WIDTH\s*=\s*1024/, 'outer notes panel must start at the old 5xl width');
assert.match(sessionRightSidebar, /NOTES_PANEL_MIN_WIDTH\s*=\s*640/, 'outer notes panel must keep a usable minimum width');
assert.match(sessionRightSidebar, /LEFT_SIDEBAR_WIDTH\s*=\s*100/, 'outer notes resize must reserve the 100px global left sidebar');
assert.match(sessionRightSidebar, /viewportWidth - LEFT_SIDEBAR_WIDTH - SESSION_RAIL_WIDTH - NOTES_PANEL_VIEWPORT_GAP/, 'outer notes maximum must reserve left sidebar, right rail, and safety gap');
assert.match(sessionRightSidebar, /Math\.max\(\s*0,\s*viewportWidth - LEFT_SIDEBAR_WIDTH - SESSION_RAIL_WIDTH - NOTES_PANEL_VIEWPORT_GAP,?\s*\)/, 'narrow viewports must not restore an overlap-producing minimum maximum width');
assert.doesNotMatch(sessionRightSidebar, /Math\.max\(320,\s*viewportWidth - SESSION_RAIL_WIDTH - NOTES_PANEL_VIEWPORT_GAP\)/, 'old viewport-only maximum must not return');
assert.match(sessionRightSidebar, /localStorage\.getItem\(NOTES_PANEL_STORAGE_KEY\)/, 'outer notes width must be restored locally');
assert.match(sessionRightSidebar, /return clampNotesPanelWidth\(candidate, window\.innerWidth\)/, 'restored outer width must be clamped against the current viewport');
assert.match(sessionRightSidebar, /localStorage\.setItem\(NOTES_PANEL_STORAGE_KEY/, 'outer notes width must persist locally');
assert.match(sessionRightSidebar, /setNotesPanelWidth\(\(currentWidth\) => clampNotesPanelWidth\(currentWidth, window\.innerWidth\)\)/, 'viewport resize must recover an oversized panel automatically');
assert.match(sessionRightSidebar, /setPointerCapture\(event\.pointerId\)/, 'outer resize must use pointer capture');
assert.match(sessionRightSidebar, /releasePointerCapture\(event\.pointerId\)/, 'outer resize must release pointer capture');
assert.match(sessionRightSidebar, /startWidth \+ \(resize\.startX - event\.clientX\)/, 'dragging left must enlarge the notes panel');
assert.match(sessionRightSidebar, /data-note-panel-resizer="true"/, 'notes panel must expose a dedicated outer resize handle');
assert.match(sessionRightSidebar, /panelWidth=\{openPanel === 'notes' \? notesPanelWidth : undefined\}/, 'custom width must apply only to notes');
assert.match(sessionRightSidebar, /widthClassName=\{openPanel === 'notes' \? 'max-w-none' : undefined\}/, 'notes alone must bypass the shared max-w-5xl cap');
assert.match(sessionRightSidebar, /leftResizeHandle=\{openPanel === 'notes' \? notesPanelResizeHandle : undefined\}/, 'outer resize handle must exist only for notes');
assert.match(slideOverPanel, /panelWidth\?: number;/, 'SlideOverPanel must accept an optional explicit width');
assert.match(slideOverPanel, /leftResizeHandle\?: React\.ReactNode;/, 'SlideOverPanel must accept an optional left resize handle');
assert.match(slideOverPanel, /width: panelWidth/, 'SlideOverPanel must apply the optional explicit width');
assert.match(slideOverPanel, /\{leftResizeHandle\}/, 'SlideOverPanel must render the optional left resize handle');
assert.match(slideOverPanel, /widthClassName = 'w-full max-w-5xl'/, 'default Schede panel width contract must remain unchanged');

console.log('Note panel resize verification: PASS');
