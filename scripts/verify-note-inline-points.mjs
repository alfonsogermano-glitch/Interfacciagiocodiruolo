import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const points = await readFile(new URL('../src/app/components/session/shared/tiptapInlinePoints.ts', import.meta.url), 'utf8');
const menu = await readFile(new URL('../src/app/components/session/shared/NotePointsMenu.tsx', import.meta.url), 'utf8');
const editor = await readFile(new URL('../src/app/components/session/shared/RichTextEditor.tsx', import.meta.url), 'utf8');
const commands = await readFile(new URL('../src/app/components/session/shared/noteEditorCommands.ts', import.meta.url), 'utf8');
const modifiers = await readFile(new URL('../src/app/components/session/shared/tiptapInlineModifier.ts', import.meta.url), 'utf8');
const clipboard = await readFile(new URL('../src/app/components/session/shared/tiptapNoteRichClipboard.ts', import.meta.url), 'utf8');

assert.match(points, /Mark\.create\([\s\S]*name:\s*'inlinePoints'/, 'Punti must be a persisted TipTap mark');
assert.match(points, /name:[\s\S]*POINTS_DEFAULT_NAME[\s\S]*value:[\s\S]*POINTS_DEFAULT_VALUE[\s\S]*max:[\s\S]*POINTS_DEFAULT_MAX[\s\S]*maxEnabled:[\s\S]*default:\s*true[\s\S]*barVisible:[\s\S]*default:\s*true/, 'Punti must persist its complete numeric display state');
assert.match(points, /input\.type = 'number'/, 'Punti must expose numeric fields');
assert.match(points, /button\('−', -1[\s\S]*button\('\+', 1/, 'Punti must expose decrement and increment controls');
assert.match(points, /if \(data\.maxEnabled && data\.barVisible\)/, 'progress must only render with a maximum and when visible');
assert.match(points, /ratio >= 0\.5[\s\S]*#2fb981[\s\S]*ratio >= 0\.21[\s\S]*#f59e0b[\s\S]*#ef4444/, 'progress must use green, orange and red thresholds');
assert.match(points, /getUniquePointsName[\s\S]*inlineModifier[\s\S]*inlinePoints/, 'Punti names must share a unique namespace with Modificatori');
assert.match(points, /duplicatePointsAt[\s\S]*createPointsId/, 'Punti must support duplicate with fresh identity');
assert.match(points, /copyPointsToClipboard[\s\S]*wrapNoteClipboardHTML/, 'Punti must support rich copy');
assert.match(points, /deletePointsAt[\s\S]*state\.tr\.delete/, 'Punti must support delete');

for (const label of ['Rinomina', 'Nascondi la barra', 'Mostra la barra', 'Disabilita punteggio massimo', 'Abilita punteggio massimo', 'Duplica', 'Copia', 'Elimina']) {
  assert.ok(menu.includes(label), `Punti menu must include ${label}`);
}
for (const icon of ['Pencil', 'EyeOff', 'Eye', 'Ban', 'Gauge', 'Copy', 'Clipboard', 'Trash2']) {
  assert.match(menu, new RegExp(`\\b${icon}\\b`), `Punti menu must use the standard ${icon} icon`);
}
assert.match(editor, /InlinePoints[\s\S]*NotePointsMenu/, 'RichTextEditor must register Punti and mount its menu');
assert.match(commands, /id:\s*'inlinePoints'[\s\S]*label:\s*'Punti'[\s\S]*icon:\s*Gauge/, 'slash menu must expose Punti');
assert.match(commands, /case 'inlinePoints':\s*return chain\.insertInlinePoints\(\)\.run\(\)/, 'slash command must insert Punti');
assert.match(modifiers, /mark\?\.type === 'inlineModifier' \|\| mark\?\.type === 'inlinePoints'/, 'persisted Punti must join peer modifier snapshots');
assert.match(modifiers, /state\.schema\.marks\.inlinePoints[\s\S]*formula:\s*''/, 'live Punti must join the dice and modifier lookup as numeric values');
assert.match(clipboard, /entry\.type !== 'inlineModifier' && entry\.type !== 'inlinePoints'[\s\S]*isSinglePointsSlice/, 'pasted Punti must receive fresh identity/name handling and inline spacing');

console.log('Inline points verification: PASS');
