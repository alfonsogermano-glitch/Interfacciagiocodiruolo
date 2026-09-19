import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [commands, editor, icon, checks, modifier, dice, points] = await Promise.all([
  readFile(new URL('../src/app/components/session/shared/noteEditorCommands.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/components/session/shared/RichTextEditor.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/components/session/shared/tiptapInlineIcon.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/components/session/shared/tiptapInlineCheckbox.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/components/session/shared/tiptapInlineModifier.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/components/session/shared/tiptapInlineDice.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/components/session/shared/tiptapInlinePoints.ts', import.meta.url), 'utf8'),
]);

for (const command of ['checkbox', 'radio', 'inlineIcon', 'inlineModifier', 'inlineDice', 'inlinePoints']) {
  assert.match(commands, new RegExp(`id: '${command}'`), `inline layout audit must include the ${command} command`);
}
assert.match(editor, /InlineIcon,[\s\S]*InlineModifier,[\s\S]*InlineDice,[\s\S]*InlinePoints,[\s\S]*inlineCheckboxExtension/, 'all audited inline extensions must be registered in the editor');

assert.match(icon, /buildIconWidget[\s\S]*width = '1em'[\s\S]*height = '1em'/, 'inline icons must keep fixed geometry across decoration rebuilds');
assert.match(checks, /buildCheckboxWidget[\s\S]*width:\s*'1em'[\s\S]*height:\s*'1em'/, 'inline checkboxes must keep fixed geometry across decoration rebuilds');
assert.match(checks, /buildRadioWidget[\s\S]*width:\s*'1em'[\s\S]*height:\s*'1em'/, 'inline radio buttons must keep fixed geometry across decoration rebuilds');

assert.match(modifier, /buildModifierWidget[\s\S]*getInlineBoxWidgetAt\(getPos\(\)!\)[\s\S]*replacedWidget\.offsetWidth/, 'modifiers must preserve their previous width during rebuild');
assert.match(dice, /buildDiceWidget[\s\S]*getInlineBoxWidgetAt\(getPos\(\)!\)[\s\S]*replacedWidget\.offsetWidth/, 'dice must preserve their previous width during rebuild');
assert.match(points, /buildPointsWidget[\s\S]*getInlineBoxWidgetAt\(getPos\(\)!\)[\s\S]*replacedWidget\.offsetWidth/, 'points must preserve their previous width during rebuild');

assert.match(modifier, /getWidgetLineContainer[\s\S]*display === 'block'[\s\S]*display === 'list-item'[\s\S]*display === 'table-cell'/, 'shared box measurement must use the nearest real line container inside nested blocks, lists and tables');
assert.doesNotMatch(modifier, /widgetEntries\.clear\(\)/, 'destroying one editor must not clear inline box measurements owned by other editors');
assert.match(modifier, /entry\.view === editorView[\s\S]*widgetEntries\.delete\(element\)/, 'editor teardown must remove only its own inline box measurements');

console.log('Inline element layout verification: PASS');
