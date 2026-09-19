import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const points = await readFile(new URL('../src/app/components/session/shared/tiptapInlinePoints.ts', import.meta.url), 'utf8');
const menu = await readFile(new URL('../src/app/components/session/shared/NotePointsMenu.tsx', import.meta.url), 'utf8');
const editor = await readFile(new URL('../src/app/components/session/shared/RichTextEditor.tsx', import.meta.url), 'utf8');
const commands = await readFile(new URL('../src/app/components/session/shared/noteEditorCommands.ts', import.meta.url), 'utf8');
const modifiers = await readFile(new URL('../src/app/components/session/shared/tiptapInlineModifier.ts', import.meta.url), 'utf8');
const clipboard = await readFile(new URL('../src/app/components/session/shared/tiptapNoteRichClipboard.ts', import.meta.url), 'utf8');
const theme = await readFile(new URL('../src/styles/theme.css', import.meta.url), 'utf8');
const modifierMenu = await readFile(new URL('../src/app/components/session/shared/NoteModifierMenu.tsx', import.meta.url), 'utf8');

assert.match(points, /Mark\.create\([\s\S]*name:\s*'inlinePoints'/, 'Punti must be a persisted TipTap mark');
assert.match(points, /name:[\s\S]*POINTS_DEFAULT_NAME[\s\S]*value:[\s\S]*POINTS_DEFAULT_VALUE[\s\S]*max:[\s\S]*POINTS_DEFAULT_MAX[\s\S]*maxEnabled:[\s\S]*default:\s*true[\s\S]*barVisible:[\s\S]*default:\s*true[\s\S]*titleVisible:[\s\S]*default:\s*true/, 'Punti must persist its complete numeric display state');
assert.match(points, /input\.type = 'number'/, 'Punti must expose numeric fields');
assert.match(points, /makeValueBox[\s\S]*makeInput\(kind, current\)[\s\S]*adjustmentZone\(kind, -1\)[\s\S]*adjustmentZone\(kind, 1\)/, 'current and maximum values must keep direct input plus overlaid decrement/increment click zones');
assert.match(points, /adjustmentZone[\s\S]*textContent = delta < 0 \? '−' : '\+'/, 'point adjustments must use concise minus and plus signs');
assert.match(points, /adjustmentZone[\s\S]*position:\s*'absolute'[\s\S]*opacity:\s*0[\s\S]*style\.opacity = '1'/, 'point adjustments must consume no layout width and become clearly visible only on hover or focus');
assert.doesNotMatch(points, /Diminuisci di 1|Aumenta di 1/, 'point adjustment zones must not open redundant tooltips');
assert.match(points, /if \(data\.maxEnabled && data\.barVisible\)/, 'progress must only render with a maximum and when visible');
assert.match(points, /ratio >= 0\.75[\s\S]*#22c55e[\s\S]*ratio >= 0\.5[\s\S]*#eab308[\s\S]*ratio >= 0\.25[\s\S]*#f97316[\s\S]*#ef4444/, 'progress must use four green-to-red thresholds');
assert.match(points, /flexDirection:\s*'column'[\s\S]*tiptap-inline-points-menu-trigger/, 'Punti menu dots must be vertical');
assert.match(points, /!data\.titleVisible[\s\S]*showInlineBoxTipAbove\(element, data\.name\)/, 'a hidden title must remain available through a palette tooltip');
assert.match(points, /adjacentPointsCaret[\s\S]*tiptap-inline-points-caret[\s\S]*nudgeToRightOfTrailingPoints/, 'Punti must normalize adjacent caret rendering and allow placement after a trailing element');
assert.match(points, /const previousBox = hasBoxAt\(pos - 1\)[\s\S]*const followingBox = hasBoxAt\(pos\)[\s\S]*halveInlineBoxWidget[\s\S]*tr\.insertText\(' ', pos \+ 1\)/, 'inserting Punti before or after an existing inline box must pre-shrink its neighbour and add a real separating space');
assert.match(points, /width: replacedWidget \? `\$\{replacedWidget\.offsetWidth\}px` : '4em'/, 'new Punti widgets must start narrow enough to remain beside their neighbour until shared measurement runs');
assert.match(points, /getUniquePointsName[\s\S]*inlineModifier[\s\S]*inlinePoints/, 'Punti names must share a unique namespace with Modificatori');
assert.match(points, /duplicatePointsAt[\s\S]*createPointsId/, 'Punti must support duplicate with fresh identity');
assert.match(points, /copyPointsToClipboard[\s\S]*wrapNoteClipboardHTML/, 'Punti must support rich copy');
assert.match(points, /deletePointsAt[\s\S]*state\.tr\.delete/, 'Punti must support delete');
assert.match(points, /nextMaxEnabled[\s\S]*nextValue > nextMax[\s\S]*nextValue = nextMax/, 'lowering the maximum must clamp the current value instead of leaving it above the maximum');

for (const label of ['Rinomina', 'Nascondi titolo', 'Mostra titolo', 'Nascondi la barra', 'Mostra la barra', 'Disabilita punteggio massimo', 'Abilita punteggio massimo', 'Duplica', 'Copia', 'Elimina']) {
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
assert.match(clipboard, /makeRoomForInlinePointsInsertion/, 'pasting beside Punti must preserve equal inline box sizing');
assert.match(theme, /tiptap-inline-points-input::\-webkit-inner-spin-button[\s\S]*appearance:\s*none/, 'Punti numeric inputs must hide native spinner arrows');
assert.doesNotMatch(theme, /p:has\(\.tiptap-inline-points-widget\)[\s\S]*margin-bottom/, 'Punti rows must use the same paragraph spacing as Modificatori');
assert.match(theme, /tiptap-points-adjacent-caret[\s\S]*caret-color:\s*transparent[\s\S]*tiptap-inline-points-caret/, 'the oversized native caret must be replaced beside Punti');
assert.match(menu, /DANGER[\s\S]*dash-danger-text[\s\S]*dash-danger-bg/, 'Punti delete action must use the real red palette variables');
assert.match(modifierMenu, /DANGER_ITEM_CLASS[\s\S]*dash-danger-text[\s\S]*dash-danger-bg/, 'Modifier and Dice delete actions must use the real red palette variables');
assert.match(modifiers, /items\.some\(\(item\) => item\.element\.classList\.contains\('tiptap-inline-points-widget'\)\)[\s\S]*measureLine\(items, lineRight\)/, 'paragraphs containing Punti must recover as one logical line after transient wrapping');
assert.match(points, /tiptap-inline-points-menu-trigger[\s\S]*position:\s*'absolute'[\s\S]*zIndex:\s*3[\s\S]*opacity:\s*0[\s\S]*element\.addEventListener\('mouseenter'[\s\S]*dots\.style\.opacity = '1'/, 'Punti menu dots must be a hover-only overlay above the adjustment zones');

console.log('Inline points verification: PASS');
