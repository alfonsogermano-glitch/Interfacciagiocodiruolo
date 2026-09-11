import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/app/components/session/shared/tiptapNoteSlashMenu.ts', import.meta.url), 'utf8');
const uiSource = await readFile(new URL('../src/app/components/session/shared/NoteSlashMenu.tsx', import.meta.url), 'utf8');

assert.match(
  source,
  /handleTextInput[\s\S]*text !== '\/'[\s\S]*insertText\('\/'[\s\S]*setSelection\(TextSelection\.create\(tr\.doc, from \+ 1\)\)[\s\S]*type:\s*'open'/,
  'slash trigger must insert /, explicitly place the caret after it, then open the slash menu',
);

assert.match(
  uiSource,
  /selection\.empty[\s\S]*selection\.from !== slashPos \+ 1[\s\S]*closeNoteSlashMenu/,
  'slash menu UI must keep guarding against stale slash positions and unexpected selections',
);

console.log('Note slash menu verification: PASS');
