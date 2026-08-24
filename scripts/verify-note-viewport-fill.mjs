import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readShared = (name) => readFile(new URL(`../src/app/components/session/shared/${name}`, import.meta.url), 'utf8');
const readSharedMaybe = async (name) => {
  try { return await readShared(name); } catch { return ''; }
};

const [editor, viewportCss] = await Promise.all([
  readShared('RichTextEditor.tsx'),
  readSharedMaybe('noteEditorViewport.css'),
]);

assert.match(editor, /fillViewport\?: boolean/, 'RichTextEditor must expose viewport-fill mode');
assert.match(editor, /getBoundingClientRect\(\)\.top/, 'viewport-fill height must be derived from the editor position in the viewport');
assert.match(editor, /visualViewport\?\.height\s*\?\?\s*window\.innerHeight/, 'viewport-fill must respect the visual viewport when available');
assert.match(editor, /new ResizeObserver\(scheduleUpdate\)/, 'viewport-fill must react when surrounding layout changes');
assert.match(editor, /addEventListener\('resize', scheduleUpdate\)/, 'viewport-fill must recalculate on viewport resize');
assert.doesNotMatch(editor, /addEventListener\('scroll', scheduleUpdate/, 'viewport-fill height must not grow while the page itself scrolls');
assert.match(editor, /data-note-viewport-fill="true"/, 'viewport-fill wrapper must be explicitly marked');
assert.match(editor, /tiptap-viewport-scroll/, 'viewport-fill editor must use dedicated visible scrollbars');
assert.match(editor, /overflow-auto/, 'viewport-fill editor must scroll internally on both axes');
assert.match(editor, /fillViewport = true/, 'Note editor must fill the viewport by default for every current tab/sub-tab usage');
assert.match(editor, /style=\{fillViewport \? \{ height: '100%' \} : undefined\}/, 'viewport-fill must override legacy fixed-height utility classes');
assert.match(viewportCss, /\.tiptap-viewport-scroll[\s\S]*scrollbar-color:\s*var\(--dash-accent-2\)\s+var\(--dash-panel\)/, 'editor scrollbars must use the active palette');
assert.match(viewportCss, /::-webkit-scrollbar[\s\S]*width:\s*10px[\s\S]*height:\s*10px/, 'editor must expose visible vertical and horizontal WebKit scrollbars');

console.log('Note viewport fill verification: PASS');
