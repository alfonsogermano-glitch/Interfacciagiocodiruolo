import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Elemento Dado: come il Modificatore ma semplificato (nome + formula,
// menu con sole Modifica/Duplica/Copia/Elimina, click tira sempre).
const dice = await readFile(new URL('../src/app/components/session/shared/tiptapInlineDice.ts', import.meta.url), 'utf8');
const commands = await readFile(new URL('../src/app/components/session/shared/noteEditorCommands.ts', import.meta.url), 'utf8');
const modifierMenu = await readFile(new URL('../src/app/components/session/shared/NoteModifierMenu.tsx', import.meta.url), 'utf8');
const editor = await readFile(new URL('../src/app/components/session/shared/RichTextEditor.tsx', import.meta.url), 'utf8');
const richClipboard = await readFile(new URL('../src/app/components/session/shared/tiptapNoteRichClipboard.ts', import.meta.url), 'utf8');
const slashPlugin = await readFile(new URL('../src/app/components/session/shared/tiptapNoteSlashMenu.ts', import.meta.url), 'utf8');
const selection = await readFile(new URL('../src/app/components/session/shared/NoteSelectionToolbar.tsx', import.meta.url), 'utf8');

// Mark + widget.
assert.match(dice, /Mark\.create[\s\S]*name:\s*'inlineDice'/, 'dice must define a Mark with name "inlineDice"');
assert.match(dice, /DICE_DEFAULT_FORMULA = '1d6'/, 'new dice must default to a 1d6 formula');
assert.match(dice, /insertInlineDice[\s\S]*INLINE_MODIFIER_CHAR[\s\S]*markType\.create/, 'insertInlineDice must insert a ZWSP character carrying the inlineDice mark');
assert.match(dice, /previousIsBox[\s\S]*inlineModifier/, 'inserting dice after a modifier must leave a real space like modifiers do');
assert.match(dice, /tiptap-inline-dice-widget[\s\S]*registerInlineBoxWidget/, 'dice widgets must join the shared visual-line measurement');
assert.match(dice, /duplicateDiceAt[\s\S]*makeRoomForInlineDiceInsertion[\s\S]*createDiceId/, 'duplicating dice must stay beside the original with a fresh id');
assert.match(dice, /copyDiceToClipboard[\s\S]*wrapNoteClipboardHTML/, 'copying dice must write the rich element for exact paste');
assert.match(
  dice,
  /NOTE_DICE_MENU_EVENT[\s\S]*NOTE_MODIFIER_ROLL_EVENT/,
  'dice must open its own dots menu and roll through the shared roll event',
);
assert.match(
  dice,
  /assessDiceFormula[\s\S]*extractModifierRefs[\s\S]*modifierFormulaHasDice/,
  'dice formulas must validate modifier references and detect dice like modifier formulas',
);

// Slash menu.
assert.match(commands, /id:\s*'inlineDice'[\s\S]*label:\s*'Dado'[\s\S]*icon:\s*Dices/, 'slash menu must expose "Dado" with the Dices icon');
assert.match(commands, /case 'inlineDice':\s*return chain\.insertInlineDice\(\)\.run\(\)/, 'slash menu must route the inlineDice command to the Tiptap insert call');

// Menu (4 voci) + pannello modifica (Nome + Valore a tag + lista).
assert.match(
  modifierMenu,
  /Menu Dado[\s\S]*MenuAction label="Modifica"[\s\S]*MenuAction label="Duplica"[\s\S]*MenuAction label="Copia"[\s\S]*MenuAction label="Elimina"/,
  'dice menu must offer only Modifica, Duplica, Copia and Elimina',
);
assert.doesNotMatch(
  modifierMenu,
  /Menu Dado[\s\S]{0,800}label="Rinomina"/,
  'dice menu must not offer inline rename',
);
assert.match(
  modifierMenu,
  /DiceEditForm[\s\S]*>Nome<[\s\S]*>Valore<[\s\S]*>Modificatori</,
  'dice edit must open a floating panel with Nome, tag-based Valore and the modifiers list',
);
assert.match(
  modifierMenu,
  /DiceEditForm[\s\S]*useFormulaTagTips/,
  'dice formula tags must share the site-style tooltips',
);
assert.match(
  modifierMenu,
  /modifierFormulaHasDice\(formulaText, resolveRef\)[\s\S]*almeno un dado/,
  'dice values must always contain at least one XdY die, directly or through a modifier',
);
assert.match(
  dice,
  /dash-danger-bg[\s\S]*showInlineBoxTipAbove/,
  'anomalous dice must turn red including the background and explain the reason in a tooltip',
);
assert.match(
  modifierMenu,
  /getDiceAt\(editorRef\.current\.state[\s\S]*submit\(\{ name: dice\.name, expression: dice\.formula, formula: dice\.formula/,
  'dice rolls must resolve modifier references and post like modifier rolls',
);

// Integrazione editor.
assert.match(editor, /InlineDice,[\s\S]*inlineCheckboxExtension/, 'editor must register the InlineDice mark');
assert.match(editor, /<NoteDiceMenu editor=\{editor\} editable=\{editable\} \/>/, 'editor must mount the dice menu');
assert.match(slashPlugin, /makeRoomForInlineDiceText\(view, from, text\)/, 'slash trigger after dice must shrink like after modifiers');
assert.match(
  richClipboard,
  /inlineDice[\s\S]*id: freshId\(\)/,
  'pasted dice must get fresh widget ids without renaming',
);
assert.match(
  richClipboard,
  /isSingleDiceSlice\(slice\)[\s\S]*previousIsBox/,
  'a single pasted dice after another element must stay beside it',
);
assert.match(selection, /data-note-dice-menu="true"/, 'selection toolbar must stay hidden while the dice menu or edit panel is open');

console.log('Inline dice verification: PASS');
