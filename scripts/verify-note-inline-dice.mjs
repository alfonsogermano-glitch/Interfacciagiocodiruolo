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
const categoryIcon = await readFile(new URL('../src/app/components/session/shared/noteElementCategoryIcon.ts', import.meta.url), 'utf8');

// Mark + widget.
assert.match(dice, /Mark\.create[\s\S]*name:\s*'inlineDice'/, 'dice must define a Mark with name "inlineDice"');
assert.match(dice, /DICE_DEFAULT_NAME = 'Dado'/, 'new dice must default to the name "Dado"');
assert.match(dice, /DICE_DEFAULT_FORMULA = '1d6'/, 'new dice must default to a 1d6 formula');
assert.match(dice, /DICE_TITLE_FORMAT_DEFAULTS[\s\S]{0,300}align:\s*'center'/, 'new dice names must default to explicit centered alignment');
assert.match(dice, /insertInlineDice[\s\S]*name:\s*DICE_DEFAULT_NAME[\s\S]*formula:\s*DICE_DEFAULT_FORMULA[\s\S]*titleAlign:\s*DICE_TITLE_FORMAT_DEFAULTS\.align/, 'slash-created dice must use the canonical name, formula and centered alignment defaults');
assert.match(dice, /insertInlineDice[\s\S]*INLINE_MODIFIER_CHAR[\s\S]*markType\.create/, 'insertInlineDice must insert a ZWSP character carrying the inlineDice mark');
assert.match(dice, /previousIsBox[\s\S]*inlineModifier/, 'inserting dice after a modifier must leave a real space like modifiers do');
assert.match(dice, /tiptap-inline-dice-widget[\s\S]*registerInlineBoxWidget/, 'dice widgets must join the shared visual-line measurement');
assert.match(dice, /buildNoteElementCategoryIcon\('Dices'\)/, 'dice widgets must show the slash-menu Dices icon in their background');
assert.match(categoryIcon, /left:\s*'0\.35em'[\s\S]*opacity:\s*'0\.5'[\s\S]*pointerEvents:\s*'none'/, 'category icons must stay behind the content at 50% opacity on the left');
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
  /notazione XdY testuale[\s\S]*modifierFormulaHasDice\(formulaText\)[\s\S]*almeno una notazione XdY/,
  'dice values must always contain a literal XdY notation typed by the user',
);
assert.doesNotMatch(
  modifierMenu,
  /DiceEditForm[\s\S]{0,2000}modifierFormulaHasDice\(formulaText, resolveRef\)/,
  'dice values must not accept dice only through referenced modifiers',
);
assert.match(
  dice,
  /dash-danger-bg[\s\S]*showInlineBoxTipAbove/,
  'anomalous dice must turn red including the background and explain the reason in a tooltip',
);
assert.match(
  dice,
  /2px solid var\(--dash-danger-border\)/,
  'anomalous dice must use a thick vivid red border',
);
assert.match(
  dice,
  /non riempiono la riga[\s\S]*dataset\.modifierCompact = 'true'/,
  'dice must size to content instead of filling the line',
);
assert.match(
  dice,
  /titleBold: \{[\s\S]*default: false[\s\S]*data-dice-title-bold[\s\S]*titleAlign: \{[\s\S]*data-dice-title-align/,
  'dice names must persist title formatting like modifier titles',
);
assert.match(
  dice,
  /applyModifierTitleFormat\(label, titleFormat\)/,
  'dice widgets must render the persisted title formatting',
);
assert.doesNotMatch(
  dice,
  /tiptap-inline-dice-label[\s\S]{0,700}textTransform:\s*'uppercase'/,
  'dice names must preserve the saved uppercase and lowercase characters',
);
assert.match(
  modifierMenu,
  /DiceEditForm[\s\S]*data-note-modifier-rename="true"[\s\S]*syncTitleMenu/,
  'dice names must open the title slash menu with "/" like modifier titles',
);
assert.match(
  modifierMenu,
  /NOTE_MODIFIER_TITLE_FORMAT_EVENT[\s\S]*detail\.pos !== dicePos[\s\S]*alignCenter/,
  'dice names must apply the title menu formatting to the pending name',
);
assert.match(
  modifierMenu,
  /titleBold: nextTitle\.bold[\s\S]*titleAlign: nextTitle\.align/,
  'saving dice must persist the title formatting',
);
assert.match(
  modifierMenu,
  /aria-label="Formato titolo"[\s\S]*zIndex: 10002/,
  'title menu must paint above the dice edit panel',
);
assert.match(
  modifierMenu,
  /data-note-dice-menu="true"[\s\S]*data-note-modifier-title-menu="true"[\s\S]*close\(false\)/,
  'choosing a title entry must not close the dice panel',
);
assert.match(
  modifierMenu,
  /onTitleOpen[\s\S]*detail\?\.pos === 'number'[\s\S]*detail\.pos === request\.pos/,
  'outside clicks must only dismiss the title menu when it belongs to this dice',
);
assert.match(
  modifierMenu,
  /diceTitleMenuOpenRef\.current[\s\S]*TITLE_MENU_CLOSE_EVENT[\s\S]*TITLE_MENU_DISMISS_EVENT[\s\S]*return;[\s\S]*close\(false\)/,
  'outside clicks with the title menu open must close only the title menu first',
);
assert.match(
  modifierMenu,
  /resta aperto per altre scelte[\s\S]*query: ''/,
  'applying a title entry must keep the menu open with the full list',
);
assert.match(
  dice,
  /diceAnomalous[\s\S]*assessDiceFormula\(rawFormula, getModifierLookupForState\(state\)\)[\s\S]*dice:\$\{id \?\? dicePos\}:.*:\$\{diceAnomalous \? 1 : 0\}/,
  'dice widgets must rebuild red when a referenced modifier disappears',
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
