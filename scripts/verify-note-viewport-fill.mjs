import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readShared = (name) => readFile(new URL(`../src/app/components/session/shared/${name}`, import.meta.url), 'utf8');
const readSharedMaybe = async (name) => {
  try { return await readShared(name); } catch { return ''; }
};

const [editor, viewportCss, noteSubTabs] = await Promise.all([
  readShared('RichTextEditor.tsx'),
  readSharedMaybe('noteEditorViewport.css'),
  readShared('NoteSubTabs.tsx'),
]);

assert.match(editor, /fillViewport\?: boolean/, 'RichTextEditor must expose viewport-fill mode');
assert.match(editor, /getBoundingClientRect\(\)\.top/, 'viewport-fill height must be derived from the editor position in the viewport');
assert.match(editor, /visualViewport\?\.height\s*\?\?\s*window\.innerHeight/, 'viewport-fill must respect the visual viewport when available');
assert.doesNotMatch(editor, /NOTE_VIEWPORT_OVERSCAN/, 'viewport-fill must not add real layout overscan that makes the page scroll');
assert.match(editor, /viewportHeight - top\)\)/, 'viewport-fill must end exactly at the viewport edge');
assert.doesNotMatch(editor, /NOTE_VIEWPORT_BOTTOM_GAP/, 'viewport-fill must not reserve a visible bottom gap');
assert.match(editor, /new ResizeObserver\(scheduleUpdate\)/, 'viewport-fill must react when surrounding layout changes');
assert.match(editor, /addEventListener\('resize', scheduleUpdate\)/, 'viewport-fill must recalculate on viewport resize');
assert.doesNotMatch(editor, /addEventListener\('scroll', scheduleUpdate/, 'viewport-fill height must not grow while the page itself scrolls');
assert.match(editor, /data-note-viewport-fill="true"/, 'viewport-fill wrapper must be explicitly marked');
assert.match(editor, /tiptap-viewport-scroll/, 'viewport-fill editor must use dedicated visible scrollbars');
assert.match(editor, /overflow-auto/, 'viewport-fill editor must scroll internally on both axes');
assert.match(editor, /fillViewport = true/, 'Note editor must fill the viewport by default for every current tab/sub-tab usage');
assert.match(editor, /style=\{fillViewport \? \{ height: '100%' \} : undefined\}/, 'viewport-fill must override legacy fixed-height utility classes');
assert.match(viewportCss, /\.tiptap-viewport-scroll[\s\S]*scrollbar-color:\s*var\(--dash-accent-2\)\s+var\(--dash-panel\)/, 'editor scrollbars must use the active palette');
assert.match(viewportCss, /\.tiptap-viewport-scroll\s*\{[\s\S]*overscroll-behavior:\s*contain/, 'viewport editor must prevent wheel scroll chaining to the page');
assert.match(viewportCss, /\.tiptap-viewport-scroll\s*\{[\s\S]*border-bottom-width:\s*0(?:px)?\s*!important/, 'viewport editor must visually continue below the screen without a bottom border');
assert.match(viewportCss, /\.tiptap-viewport-scroll\s*\{[\s\S]*border-bottom-left-radius:\s*0(?:px)?\s*!important[\s\S]*border-bottom-right-radius:\s*0(?:px)?\s*!important/, 'viewport editor must remove lower corner rounding');
assert.match(viewportCss, /::-webkit-scrollbar[\s\S]*width:\s*10px[\s\S]*height:\s*10px/, 'editor must expose visible vertical and horizontal WebKit scrollbars');
assert.match(viewportCss, /\.tiptap-viewport-scroll \.tiptap-content\s*\{[\s\S]*overflow:\s*visible\s*!important/, 'viewport TipTap must not create a nested scroll container');
assert.match(viewportCss, /\.tiptap-viewport-scroll \.tiptap-content\s*\{[\s\S]*padding:\s*6px\s+6px\s+0(?:px)?\s*!important/, 'viewport TipTap must keep top/side safety padding but remove trailing bottom padding');
assert.match(viewportCss, /\.tiptap-viewport-scroll \.tiptap-content > :last-child\s*\{[\s\S]*margin-bottom:\s*0\s*!important/, 'viewport editor last block must not create premature vertical overflow');

assert.match(
  noteSubTabs,
  /className="min-h-\[3rem\] rounded-xl border border-\[var\(--dash-border-soft\)\] bg-\[var\(--dash-surface\)\] p-3"/,
  'session note editor must use the same dash-surface background as character sheets',
);
assert.match(
  editor,
  /DEFAULT_CONTAINER_CLASS\s*=\s*'min-h-\[3rem\] rounded-xl border border-\[var\(--dash-border-soft\)\] bg-\[var\(--dash-panel\)\] p-3'/,
  'RichTextEditor global default must remain dash-panel so other contexts are unchanged',
);

console.log('Note viewport fill verification: PASS');
