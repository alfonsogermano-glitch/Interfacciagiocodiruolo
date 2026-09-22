import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// L'Annulla vive ora in NoteUndoButton.tsx: e' fissata (absolute + slot
// riservato) a fine della PRIMA riga della EntityTabBar, quindi il guscio
// dell'editor non la contiene piu' e i "+" laterali delle righe non devono
// piu' schivarla.

const [editor, undoButton] = await Promise.all([
  readFile(new URL('../src/app/components/session/shared/RichTextEditor.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/components/session/shared/NoteUndoButton.tsx', import.meta.url), 'utf8'),
]);

assert.doesNotMatch(editor, /PermanentUndo/, 'Undo must no longer live inside the editor shell');

assert.match(
  undoButton,
  /import \{ Tooltip, TooltipContent, TooltipTrigger \} from '\.\.\/\.\.\/ui\/tooltip';/,
  'Undo must use the shared palette-aware Tooltip',
);

assert.match(undoButton, /<Tooltip>/, 'Undo must be wrapped in the shared Tooltip');
assert.match(undoButton, /<TooltipTrigger asChild>/, 'Undo tooltip must use an asChild trigger');
assert.doesNotMatch(undoButton, /ml-auto/, 'Undo must not rely on auto margins: it is pinned at the end of the first row');
assert.match(undoButton, /disabled=\{disabled\}/, 'Undo button native disabled behavior must remain unchanged');
assert.match(
  undoButton,
  /editor\.chain\(\)\.focus\(\)\.undo\(\)\.run\(\)/,
  'Undo action must remain unchanged',
);
assert.match(
  undoButton,
  /<TooltipContent side="bottom">Annulla<\/TooltipContent>/,
  'Undo tooltip must read Annulla and open below the tab row',
);
assert.doesNotMatch(undoButton, /style=\{\{[^}]*backgroundColor/, 'Undo tooltip must not hardcode its own palette colors');

console.log('Note undo tooltip verification: PASS');
