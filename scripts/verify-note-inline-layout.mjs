import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [commands, editor, icon, checks, modifier, dice, points, gutter] = await Promise.all([
  readFile(new URL('../src/app/components/session/shared/noteEditorCommands.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/components/session/shared/RichTextEditor.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/components/session/shared/tiptapInlineIcon.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/components/session/shared/tiptapInlineCheckbox.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/components/session/shared/tiptapInlineModifier.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/components/session/shared/tiptapInlineDice.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/components/session/shared/tiptapInlinePoints.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/components/session/shared/NoteRowGutter.tsx', import.meta.url), 'utf8'),
]);

for (const command of ['checkbox', 'radio', 'inlineIcon', 'inlineModifier', 'inlineDice', 'inlinePoints']) {
  assert.match(commands, new RegExp(`id: '${command}'`), `inline layout audit must include the ${command} command`);
}
assert.match(editor, /InlineIcon,[\s\S]*InlineModifier,[\s\S]*InlineDice,[\s\S]*InlinePoints,[\s\S]*inlineCheckboxExtension/, 'all audited inline extensions must be registered in the editor');
assert.match(editor, /function canonicalizeNoteJSON[\s\S]*length === 0[\s\S]*function docsEqual[\s\S]*canonicalizeNoteJSON\(a\)/, 'external document sync must compare canonically so key order and empty contents never trigger a reset');

assert.match(icon, /buildIconWidget[\s\S]*width = '1em'[\s\S]*height = '1em'/, 'inline icons must keep fixed geometry across decoration rebuilds');
assert.match(checks, /buildCheckboxWidget[\s\S]*width:\s*'1em'[\s\S]*height:\s*'1em'/, 'inline checkboxes must keep fixed geometry across decoration rebuilds');
assert.match(checks, /buildRadioWidget[\s\S]*width:\s*'1em'[\s\S]*height:\s*'1em'/, 'inline radio buttons must keep fixed geometry across decoration rebuilds');

assert.match(modifier, /buildModifierWidget[\s\S]*getInlineBoxWidgetAt\(getPos\(\)!\)[\s\S]*replacedWidget\.offsetWidth/, 'modifiers must preserve their previous width during rebuild');
assert.match(dice, /buildDiceWidget[\s\S]*getInlineBoxWidgetAt\(getPos\(\)!\)[\s\S]*replacedWidget\.offsetWidth/, 'dice must preserve their previous width during rebuild');
assert.match(points, /buildPointsWidget[\s\S]*getInlineBoxWidgetAt\(getPos\(\)!\)[\s\S]*replacedWidget\.offsetWidth/, 'points must preserve their previous width during rebuild');

assert.match(modifier, /getWidgetLineContainer[\s\S]*display === 'block'[\s\S]*display === 'list-item'[\s\S]*display === 'table-cell'/, 'shared box measurement must use the nearest real line container inside nested blocks, lists and tables');
assert.doesNotMatch(modifier, /widgetEntries\.clear\(\)/, 'destroying one editor must not clear inline box measurements owned by other editors');
assert.match(modifier, /entry\.view === editorView[\s\S]*widgetEntries\.delete\(element\)/, 'editor teardown must remove only its own inline box measurements');
assert.match(modifier, /new ResizeObserver\(\(\) => scheduleMeasure\(\)\)[\s\S]*observe\(editorView\.dom\)/, 'shared box measurement must follow editor container resizes, not only window resizes');
assert.match(modifier, /function formulaKey\(formula: string\)[\s\S]*key: `modifier:[\s\S]*\$\{formulaKey\(formula\)\}/, 'modifier rebuilds must track formula text so tooltips and closures cannot go stale');
assert.match(modifier, /Il compatto conta con la LARGHEZZA VIVA/, 'compact boxes must count with their live rendered width, not an intrinsic clone, so min-width floors (dice 4em) cannot overcount the row');
assert.match(modifier, /compactWidth \+= rects\[i\]\.width/, 'compact box contribution must come from the same pre-captured row rects');
assert.match(modifier, /Un'unica applicazione senza letture intermedie/, 'row measurement must apply compact and expanded widths together after a single offscreen read');
assert.match(modifier, /export function unregisterInlineBoxWidget[\s\S]*widgetEntries\.delete\(element\)[\s\S]*scheduleMeasure\(\)/, 'removing a box must re-measure the row so remaining elements reclaim its width');
assert.match(modifier, /__destroyModifierWidget\?\.\(\)[\s\S]*unregisterInlineBoxWidget\(node/, 'modifier teardown must go through the rescheduling unregister path');

// Righe a tutta larghezza: nessuna riserva a inizio/fine, l'inserimento ai
// bordi passa dai pulsanti laterali invece che dal caret in uno spazio.
assert.match(modifier, /const CURSOR_ROOM = 0/, 'full-width rows must not reserve cursor room at the line end');
assert.match(modifier, /const END_INSERTION_ROOM = 0/, 'full-width rows must not reserve extra insertion room at the line end');
assert.match(modifier, /function trailingRowTextWidth[\s\S]*setStartAfter[\s\S]*setEnd/, 'trailing row text must be measured with a DOM range after the last widget');
assert.match(modifier, /lineItems\.includes\(lastItem\) \? trailingWidth : 0/, 'only the visual line holding the last widget may subtract trailing text');
assert.match(modifier, /Math\.min\(\s*trailingWidth/, 'empty end-of-row space must never shrink the row, only real text');
assert.match(editor, /<NoteRowGutter editor=\{editor\} editable=\{editable\} shellRef=\{editorShellRef\} \/>/, 'the editor shell must mount the lateral row gutter');
assert.match(gutter, /BOX_MARK_NAMES[\s\S]*inlineModifier[\s\S]*inlineDice[\s\S]*inlinePoints/, 'gutter rows must trigger on modifier, dice and points edge boxes');
assert.match(gutter, /data-note-row-gutter="true"[\s\S]*data-note-row-gutter-side/, 'gutter buttons must expose their row side without stealing editor focus');
assert.match(gutter, /onMouseDown[\s\S]*preventDefault/, 'gutter buttons must not blur the editor on mousedown');
assert.match(gutter, /opacity-75 hover:opacity-100/, 'shown gutter buttons must stay unobtrusive until hovered');
// Visibilita' su richiesta: i "+" spariscono dalle righe inactive in modo che
// il documento resti pulito dai simboli laterali. Appaiono solo quando il
// mouse entra nella fascia verticale della riga o quando caret/selezione
// (editor focalizzato) raggiungono la riga.
assert.match(gutter, /editor\.isFocused/, 'caret-driven gutter visibility must consider editor focus');
assert.match(gutter, /pointermove/, 'gutter visibility must follow the pointer row by row');
assert.match(gutter, /pointer-events-none opacity-0/, 'idle rows must hide their gutter buttons so the document stays clean');
assert.match(gutter, /'Testo'[\s\S]*Type/, 'the gutter menu must offer Testo with an adequate icon inside Blocchi');
assert.match(gutter, /NOTE_COMMANDS/, 'the gutter menu must reuse the slash command catalog');
assert.match(gutter, /insertInlineAtEdge[\s\S]*insertContent\(' '\)/, 'left-edge insertion of modifiers and dice must prepare a real trailing space');
assert.match(gutter, /insertTextAtEdge[\s\S]*setTextSelection\(\{ from: edge, to: edge \}\)/, 'Testo insertion must place the caret against the edge box so typing shrinks it on the same row');
assert.doesNotMatch(gutter, /insertTextAtEdge[\s\S]{0,400}insertText\(' ', edge/, 'Testo insertion must not interpose a space that would block makeRoom shrinking');
assert.match(gutter, /node\.type\.name === 'textBox' \|\| node\.type\.name === 'collapseBlock'/, 'textBox and collapse rows must expose both lateral buttons');
assert.doesNotMatch(gutter, /node\.type\.name === 'table'|node\.type\.name === 'archivio'/, 'tables and archivi must never expose lateral buttons');
assert.match(gutter, /resolveMenuEdge[\s\S]*paraType\.create/, 'block buttons must create the text row before or after only when an item is chosen');
assert.match(gutter, /INLINE_EDGE_CLICK_ROOM = 40[\s\S]*contentRight - coords\.right < INLINE_EDGE_CLICK_ROOM/, 'the right button must hide when clickable room already allows direct slash typing');
assert.match(gutter, /clampNewBoxToRow[\s\S]*room < widget\.offsetWidth/, 'new gutter boxes must be pre-shrunk to the remaining row before first paint');
assert.match(gutter, /getInlineBoxWidgetAt\(start\)\?\.getBoundingClientRect|getInlineBoxWidgetAt\(end - 1\)\?\.getBoundingClientRect/, 'edge buttons must anchor to the real border widget rects, not ambiguous boundary coordinates');
// Il "+" destro non deve mai cadere sotto la sua riga: con l'Annulla fuori
// dall'editor non ci sono piu' collisioni da schivare, resta sempre centrato.
assert.doesNotMatch(gutter, /Math\.max\((center|rawTop), 46\)/, 'right gutter buttons must stay vertically centered on their row');
assert.doesNotMatch(gutter, /data-note-undo/, 'the gutter must not dodge controls that no longer live in the editor shell');

console.log('Inline element layout verification: PASS');
