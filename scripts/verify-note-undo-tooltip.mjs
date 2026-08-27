import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const editor = await readFile(new URL('../src/app/components/session/shared/RichTextEditor.tsx', import.meta.url), 'utf8');

assert.match(
  editor,
  /import \{ Tooltip, TooltipContent, TooltipTrigger \} from '\.\.\/\.\.\/ui\/tooltip';/,
  'Undo must use the shared palette-aware Tooltip',
);

const undoBlock = editor.match(/function PermanentUndo[\s\S]*?\n}\n/)?.[0] ?? '';
assert.match(undoBlock, /<Tooltip>/, 'Undo must be wrapped in the shared Tooltip');
assert.match(undoBlock, /<TooltipTrigger asChild>/, 'Undo tooltip must use an asChild trigger');
assert.match(
  undoBlock,
  /<span[^>]*className="absolute right-2 top-2 z-\[20\] inline-flex"/,
  'Undo tooltip trigger wrapper must own positioning and remain hoverable when the button is disabled',
);
assert.match(undoBlock, /disabled=\{disabled\}/, 'Undo button native disabled behavior must remain unchanged');
assert.match(
  undoBlock,
  /editor\.chain\(\)\.focus\(\)\.undo\(\)\.run\(\)/,
  'Undo action must remain unchanged',
);
assert.match(
  undoBlock,
  /<TooltipContent side="left"(?: sideOffset=\{\d+\})?>Annulla<\/TooltipContent>/,
  'Undo tooltip must read Annulla and open to the left',
);
assert.doesNotMatch(undoBlock, /style=\{\{[^}]*backgroundColor/, 'Undo tooltip must not hardcode its own palette colors');

console.log('Note undo tooltip verification: PASS');
