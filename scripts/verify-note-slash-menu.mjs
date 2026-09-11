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

assert.match(
  uiSource,
  /SLASH_MENU_COLUMNS\s*=\s*4[\s\S]*stopImmediatePropagation\(\)[\s\S]*ArrowDown[\s\S]*moveSelection\(SLASH_MENU_COLUMNS\)[\s\S]*ArrowUp[\s\S]*moveSelection\(-SLASH_MENU_COLUMNS\)/,
  'slash menu arrow up/down must navigate vertically in the 4-column grid and stop editor propagation',
);

assert.match(
  uiSource,
  /ArrowRight[\s\S]*moveSelection\(1\)[\s\S]*ArrowLeft[\s\S]*moveSelection\(-1\)/,
  'slash menu arrow left/right must navigate inside the menu instead of moving the editor caret',
);

console.log('Note slash menu verification: PASS');
