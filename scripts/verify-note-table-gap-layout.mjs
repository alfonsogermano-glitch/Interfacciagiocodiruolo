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
  /\.tiptap-content \.tiptap-note-table-cell\s*>\s*:is\(\.tiptap-textbox,\s*\.tiptap-collapse\)\s*\+\s*\.ProseMirror-gapcursor::after,[\s\S]*?\.tiptap-content \.tiptap-note-table-header\s*>\s*:is\(\.tiptap-textbox,\s*\.tiptap-collapse\)\s*\+\s*\.ProseMirror-gapcursor::after\s*\{[\s\S]*?top:\s*0\.4rem\s*;/,
  'the GapCursor after a table TextBox/Collapse must be visually centered in the lower cell padding without changing layout',
);

console.log('Note table GapCursor layout verification: PASS');
