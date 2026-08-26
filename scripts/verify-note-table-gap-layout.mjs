import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(
  new URL('../src/app/components/session/shared/noteTableResize.css', import.meta.url),
  'utf8',
);

assert.match(
  css,
  /\.tiptap-content \.tiptap-note-table-cell\s*>\s*:is\(\.tiptap-textbox,\s*\.tiptap-collapse\):has\(\+\s*\.ProseMirror-gapcursor\),[\s\S]*?\.tiptap-content \.tiptap-note-table-header\s*>\s*:is\(\.tiptap-textbox,\s*\.tiptap-collapse\):has\(\+\s*\.ProseMirror-gapcursor\)\s*\{[\s\S]*?margin-bottom:\s*0\s*;/,
  'a GapCursor widget after the last TextBox/Collapse must not restore its bottom margin in table cells or headers',
);

assert.match(
  css,
  /:is\(\.tiptap-textbox,\s*\.tiptap-collapse\)\s*\+\s*\.ProseMirror-gapcursor::after[\s\S]*?top:\s*calc\(0\.2rem\s*-\s*0\.5px\)\s*;/,
  'the lower GapCursor line must be centered halfway through the 0.4rem lower cell padding',
);

assert.match(
  css,
  /\.ProseMirror-gapcursor:has\(\+\s*:is\(\.tiptap-textbox,\s*\.tiptap-collapse\)\)::after[\s\S]*?top:\s*calc\(-0\.2rem\s*-\s*0\.5px\)\s*;/,
  'the upper GapCursor line must be centered halfway through the 0.4rem upper cell padding',
);

console.log('Note table GapCursor symmetric layout verification: PASS');
