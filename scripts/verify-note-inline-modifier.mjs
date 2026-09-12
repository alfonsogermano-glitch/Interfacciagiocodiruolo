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
  /addAttributes\(\)[\s\S]*name:[\s\S]*default:\s*MODIFIER_DEFAULT_NAME[\s\S]*value:[\s\S]*default:\s*MODIFIER_DEFAULT_VALUE[\s\S]*compact:[\s\S]*default:\s*false[\s\S]*titleBold:[\s\S]*default:\s*false[\s\S]*titleItalic:[\s\S]*default:\s*false[\s\S]*titleUnderline:[\s\S]*default:\s*false[\s\S]*titleStrike:[\s\S]*default:\s*false[\s\S]*titleFontSize:[\s\S]*default:\s*null[\s\S]*titleFontFamily:[\s\S]*default:\s*null[\s\S]*titleAlign:[\s\S]*default:\s*null/,
  'inline modifier must expose name, value, compact, and title-format attributes with documented defaults',
);
assert.match(
  source,
  /parseHTML\(\)[\s\S]*\{\s*tag:\s*'span\[data-inline-modifier\]'\s*\}/,
  'inline modifier must parse HTML via a data-inline-modifier marker',
);
assert.match(
  source,
  /insertInlineModifier[\s\S]*previousIsModifier[\s\S]*insertText\(' '[\s\S]*tr\.insert\([\s\S]*INLINE_MODIFIER_CHAR[\s\S]*markType\.create/,
  'insertInlineModifier must insert a ZWSP character carrying the inlineModifier mark and add a real space after adjacent modifiers',
);
assert.match(
  source,
  /getUniqueModifierName[\s\S]*names\.has[\s\S]*MODIFIER_DEFAULT_NAME[\s\S]*name:\s*getUniqueModifierName\(state\)/,
  'modifier names must be generated uniquely from the default name',
);
assert.match(
  source,
  /titleKey[\s\S]*Decoration\.widget\([\s\S]*key:\s*`modifier:\$\{.*\}:\$\{.*\}:\$\{.*\}:\$\{compact\}:\$\{titleKey\}`/,
  'inline modifier decoration must include name, value, compact, and title format in the key to force rebuild on attribute change',
);
assert.match(
  source,
  /applyModifierTitleFormat[\s\S]*fontWeight[\s\S]*textDecoration[\s\S]*fontSize[\s\S]*fontFamily[\s\S]*textAlign/,
  'modifier title must render persisted bold/italic/underline/strike/size/family/align formatting',
);
assert.match(
  source,
  /tiptap-inline-modifier-menu-trigger[\s\S]*position:\s*'absolute'[\s\S]*flexDirection:\s*'column'[\s\S]*opacity:\s*0[\s\S]*mouseenter/,
  'modifier menu trigger must be a vertical hover-only overlay that does not consume layout space',
);
assert.match(
  source,
  /performMeasurement[\s\S]*lineGroups[\s\S]*measureLine[\s\S]*marginRight = '0px'[\s\S]*realGap[\s\S]*CURSOR_ROOM[\s\S]*END_INSERTION_ROOM[\s\S]*marginRight/,
  'inline modifier must use visual-line measurement with real inter-widget gaps, cursor room, and post-caret insertion room',
);
assert.match(
  source,
  /isCompactModifier[\s\S]*measureLine[\s\S]*style\.width = 'auto'[\s\S]*compactWidth[\s\S]*available \/ expanded\.length/,
  'compact modifiers must shrink to content (value only) while expanded modifiers split the remaining line width',
);
assert.match(
  source,
  /minHeight:\s*'2\.5em'[\s\S]*justifyContent:\s*compact \? 'center'/,
  'compact modifiers must keep expanded height with centered value',
);
assert.doesNotMatch(
  source,
  /-0\.55em/,
  'compact menu dots must stay inside the box like the expanded variant',
);
assert.match(
  source,
  /tiptap-inline-modifier-tooltip[\s\S]*role['"]?,\s*['"]tooltip['"][\s\S]*position:\s*'fixed'[\s\S]*var\(--dash-panel\)[\s\S]*var\(--dash-text\)[\s\S]*var\(--dash-border-soft\)[\s\S]*closest\('\[data-dashboard-palette\]'\)/,
  'compact modifiers must show the modifier name in a portal palette-styled tooltip that cannot clip behind the note border',
);
assert.match(
  source,
  /makeRoomForInlineModifierText[\s\S]*getInlineModifierMark\(view\.state, pos\)[\s\S]*getInlineModifierMark\(view\.state, pos - 1\)[\s\S]*handleTextInput[\s\S]*makeRoomForInlineModifierText/,
  'typing immediately before or after a modifier must shrink the adjacent widget before native inline insertion',
);
assert.match(
  source,
  /makeRoomForInlineModifierInsertion[\s\S]*MIN_MODIFIER_WIDTH[\s\S]*previousIsModifier[\s\S]*makeRoomForInlineModifierInsertion/,
  'adding another modifier immediately after a modifier must shrink the previous widget before insertion so both stay on the same visual line',
);
assert.match(
  source,
  /setModifierAttrs\([\s\S]*removeMark[\s\S]*addMark/,
  'modifying attributes must replace the mark rather than mutating state in-place',
);
assert.match(
  source,
  /NOTE_MODIFIER_RENAME_EVENT[\s\S]*startInlineRename[\s\S]*data-note-modifier-rename[\s\S]*event\.key === 'Enter'[\s\S]*event\.key === 'Escape'[\s\S]*window\.addEventListener\('pointerdown'[\s\S]*addEventListener\('blur'/,
  'renaming a modifier must happen inline inside the widget and save on outside click/Enter/blur while Escape cancels',
);
assert.match(
  source,
  /formula:[\s\S]*default:\s*''[\s\S]*data-modifier-formula/,
  'inline modifier must persist a formula attribute with empty default',
);
assert.match(
  source,
  /export function parseModifierValue[\s\S]*0-9[\s\S]*kind: 'dice'[\s\S]*count[\s\S]*sides[\s\S]*modifier/,
  'modifier values must validate to plain numbers or dice expressions with restricted charset',
);
assert.match(
  source,
  /NOTE_MODIFIER_ROLL_EVENT[\s\S]*parseModifierValue\(current\.value\)[\s\S]*CustomEvent<NoteModifierRollRequest>/,
  'clicking a modifier with a dice value must request a chat roll instead of moving the caret',
);
assert.match(
  source,
  /parseModifierValue\(value\)\) \{[\s\S]*boxShadow[\s\S]*dash-accent-2/,
  'rollable modifiers must stand out with accent border and glow',
);
assert.match(
  source,
  /duplicateModifierAt[\s\S]*insert\([\s\S]*INLINE_MODIFIER_CHAR[\s\S]*markType\.create\([\s\S]*\.\.\.currentMark\.attrs[\s\S]*id:\s*createModifierId\(\)/,
  'duplicate must re-insert a fresh ZWSP character carrying identical data and a fresh stable id',
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
assert.match(
  source,
  /dots\.addEventListener\('mousedown'[\s\S]*if \(!view\.editable\) return;[\s\S]*dots\.addEventListener\('click'[\s\S]*if \(!view\.editable\)[\s\S]*requestAnimationFrame\(attempt\)/,
  'dots must let a blurred tab re-enter edit mode and defer the menu until the editor is editable again',
);
assert.match(
  source,
  /copyModifierToClipboard\(view: EditorView[\s\S]*ClipboardItem[\s\S]*createModifierId\(\)[\s\S]*wrapNoteClipboardHTML[\s\S]*writeText\(text\)/,
  'copy must write the whole modifier element (rich HTML slice with fresh id) and keep plain text only as fallback',
);
assert.match(
  source,
  /NOTE_MODIFIER_TITLE_MENU_EVENT[\s\S]*NOTE_MODIFIER_TITLE_MENU_CLOSE_EVENT[\s\S]*NOTE_MODIFIER_TITLE_FORMAT_EVENT[\s\S]*NOTE_MODIFIER_TITLE_MENU_DISMISS_EVENT/,
  'the rename input must bridge to the React title menu via typed CustomEvents for open/close/format/dismiss',
);
assert.match(
  source,
  /findTitleTrigger[\s\S]*selectionStart[\s\S]*syncTitleMenu[\s\S]*addEventListener\('input', onInput/,
  'typing / inside the modifier rename input must open/update the filtered title menu instead of staying plain text',
);
assert.match(
  source,
  /onTitleFormat[\s\S]*pendingFormat[\s\S]*removeTitleTrigger[\s\S]*closeTitleMenu/,
  'applying a title format must toggle pending formatting, remove the / trigger, and close the title menu while continuing the rename',
);
assert.match(
  source,
  /closest\(\s*'?\[data-note-modifier-title-menu="true"\]'?\s*\)/,
  'clicks on the title menu must not save the rename as an outside click',
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
