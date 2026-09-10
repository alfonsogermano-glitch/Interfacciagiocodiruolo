import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/app/components/session/shared/tiptapInlineModifier.ts', import.meta.url), 'utf8');

assert.match(
  source,
  /Mark\.create[\s\S]*name:\s*'inlineModifier'/,
  'inline modifier must define a Mark with name "inlineModifier"',
);
assert.match(
  source,
  /addAttributes\(\)[\s\S]*name:[\s\S]*default:\s*MODIFIER_DEFAULT_NAME[\s\S]*value:[\s\S]*default:\s*MODIFIER_DEFAULT_VALUE/,
  'inline modifier must expose name and value attributes with documented defaults',
);
assert.match(
  source,
  /parseHTML\(\)[\s\S]*\{\s*tag:\s*'span\[data-inline-modifier\]'\s*\}/,
  'inline modifier must parse HTML via a data-inline-modifier marker',
);
assert.match(
  source,
  /insertInlineModifier[\s\S]*insertContent\([\s\S]*INLINE_MODIFIER_CHAR[\s\S]*marks:[\s\S]*type:\s*this\.name/,
  'insertInlineModifier must insert a ZWSP character carrying the inlineModifier mark',
);
assert.match(
  source,
  /Decoration\.widget\([\s\S]*key:\s*`modifier:\$\{.*\}:\$\{.*\}:\$\{.*\}`/,
  'inline modifier decoration must include name and value in the key to force rebuild on attribute change',
);
assert.match(
  source,
  /stretchWidgetToLineEnd[\s\S]*querySelectorAll\(MODIFIER_WIDGET_SELECTOR\)/,
  'inline modifier must measure width to the next modifier (or line end) to fill remaining space',
);
assert.match(
  source,
  /setModifierAttrs\([\s\S]*removeMark[\s\S]*addMark/,
  'modifying attributes must replace the mark rather than mutating state in-place',
);
assert.match(
  source,
  /duplicateModifierAt[\s\S]*insert\([\s\S]*INLINE_MODIFIER_CHAR[\s\S]*markType\.create\(currentMark\.attrs\)/,
  'duplicate must re-insert a fresh ZWSP character carrying identical mark attributes',
);
assert.match(
  source,
  /deleteModifierAt[\s\S]*delete\([\s\S]*pos,\s*pos \+ 1\)/,
  'delete must remove the single marked character without touching neighbours',
);
assert.match(
  source,
  /NOTE_MODIFIER_MENU_EVENT[\s\S]*CustomEvent<NoteModifierMenuRequest>/,
  'the vanilla widget must bridge to the React menu via a typed CustomEvent',
);

const commandsSource = await readFile(new URL('../src/app/components/session/shared/noteEditorCommands.ts', import.meta.url), 'utf8');
assert.match(
  commandsSource,
  /case 'inlineModifier':\s*return chain\.insertInlineModifier\(\)\.run\(\)/,
  'slash menu must route the inlineModifier command to the Tiptap insert call',
);
assert.match(
  commandsSource,
  /id:\s*'inlineModifier'[\s\S]*SlidersHorizontal/,
  'slash menu must expose "Modificatore" with a unique icon (SlidersHorizontal by default)',
);

const richTextSource = await readFile(new URL('../src/app/components/session/shared/RichTextEditor.tsx', import.meta.url), 'utf8');
assert.match(
  richTextSource,
  /InlineModifier[\s\S]*extensions/,
  'RichTextEditor must register InlineModifier so its plugin and schema are available',
);
assert.match(
  richTextSource,
  /NoteModifierMenu/,
  'RichTextEditor must mount the NoteModifierMenu component alongside the slash menu',
);

console.log('Inline modifier verification: PASS');
