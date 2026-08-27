import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (name) => readFile(new URL(`../src/app/components/session/shared/${name}`, import.meta.url), 'utf8');
const readSession = (name) => readFile(new URL(`../src/app/components/session/${name}`, import.meta.url), 'utf8');
const [commands, slash, selection, pickers, richClipboard, editor, slashPlugin, menuCss, entityTabBar, noteSubTabs, noteListRow, trashRow, sessionNotesPanel] = await Promise.all([
  read('noteEditorCommands.ts'), read('NoteSlashMenu.tsx'), read('NoteSelectionToolbar.tsx'),
  read('NoteContextualPickers.tsx'), read('tiptapNoteRichClipboard.ts'), read('RichTextEditor.tsx'), read('tiptapNoteSlashMenu.ts'),
  read('noteContextualMenus.css'), read('EntityTabBar.tsx'), read('NoteSubTabs.tsx'), read('NoteListRow.tsx'), read('TrashRow.tsx'),
  readSession('SessionNotesPanel.tsx'),
]);

assert.match(commands, /id: 'horizontalRule'[\s\S]*icon: Minus/, 'horizontal rule must use Lucide Minus');
assert.doesNotMatch(commands, /SeparatorHorizontal/, 'obsolete horizontal-rule icon must not return');
for (const id of ['bold','italic','underline','strike','fontSize','fontFamily','bulletList','orderedList','blockquote','alignLeft','alignCenter','alignRight']) {
  assert.match(commands, new RegExp(`id: '${id}'[\\s\\S]*selectionEligible: true`), `${id} must be selection-toolbar eligible`);
}
assert.match(commands, /id: 'undo'[\s\S]*group: 'history'/, 'Undo descriptor remains centralized');
assert.match(slash, /filter\(\(command\) => command\.id !== 'undo'\)/, 'Undo must stay out of Slash menu');
assert.match(slash, /aria-disabled=\{disabled\}/, 'disabled Slash commands must expose aria-disabled');
assert.match(slash, /cursor-not-allowed/, 'disabled Slash commands must show not-allowed cursor');
assert.match(slash, /setSelectedIndex\(disabled \? -1 : index\)/, 'disabled hover must remove ghost highlight');
assert.match(slash, /if \(disabled\) \{[\s\S]*preventDefault\(\)[\s\S]*stopPropagation\(\)[\s\S]*return;/, 'disabled click must be absorbed without closing menu');
assert.match(slash, /event\.key === 'Escape' \|\| event\.key === 'Backspace' \|\| event\.key === 'Delete'/, 'Slash close keys must preserve literal slash');
assert.match(slashPlugin, /insertText\('\/'/, 'Slash plugin must insert a literal slash trigger');
assert.match(slashPlugin, /type: 'close'/, 'Slash menu close must be metadata-only unless command is executed');
assert.match(commands, /runSlashNoteCommand[\s\S]*deleteRange\(\{ from: slashPos, to: slashPos \+ 1 \}\)[\s\S]*case 'collapse':[\s\S]*setCollapseBlock\(\)\.run\(\)/, 'Slash-trigger deletion and Collapse insertion must stay in one TipTap chain');
assert.match(slash, /runSlashNoteCommand\(editor, command\.id, slashPos\)/, 'Slash menu must execute structural commands atomically with slash deletion');
assert.doesNotMatch(slash, /removeNoteSlashTrigger\(editor, slashPos\)[\s\S]*runImmediateNoteCommand/, 'Slash menu must not dispatch slash deletion before the immediate command');

assert.match(selection, /captureNoteSelection/, 'selection toolbar must snapshot exact selection');
assert.match(selection, /restoreNoteSelection/, 'selection toolbar must restore selection before commands');
assert.match(selection, /\['c', 'x', 'v'\]/, 'clipboard shortcuts must dismiss toolbar without preventing native clipboard');
assert.match(selection, /data-note-selection-toolbar/, 'selection toolbar must be marked contextual');

assert.match(pickers, /data-note-picker-tooltip="true"/, 'picker tooltip must be dedicated Hollowgate UI');
assert.match(pickers, /onPointerEnter/, 'picker tooltip opens from pointer enter');
assert.match(pickers, /onPointerLeave/, 'picker tooltip closes independently of Popover');
assert.match(pickers, /createPortal/, 'picker tooltip must portal palette-aware');
assert.match(pickers, /position|fixed/, 'picker tooltip is fixed-position UI');
assert.match(pickers, /tiptap-font-popover-scroll[\s\S]*overflow-y-scroll/, 'font list must expose an always-visible vertical scroll affordance');
assert.match(pickers, /import '\.\/noteContextualMenus\.css'/, 'contextual picker scrollbar styles must be loaded with the picker');
assert.match(menuCss, /\.tiptap-font-popover-scroll[\s\S]*scrollbar-width:\s*thin\s*!important[\s\S]*scrollbar-color:\s*var\(--dash-accent-2\)\s+var\(--dash-panel\)/, 'font scrollbar must override global suppression and use the active palette accent');
assert.match(menuCss, /::-webkit-scrollbar[\s\S]*display:\s*block\s*!important/, 'font scrollbar must override global WebKit scrollbar suppression');

assert.match(selection, /command\.isActive\(editor\) \? 'bg-\[var\(--dash-accent\)\][^']*ring-\[var\(--dash-accent-2\)\]/, 'selection toolbar active formatting must use palette accent with a visible accent ring');
assert.match(selection, /hover:bg-\[var\(--dash-accent\)\]/, 'selection toolbar hover must use palette accent');
assert.match(slash, /highlighted[\s\S]*bg-\[var\(--dash-accent\)\][^']*ring-\[var\(--dash-accent-2\)\]/, 'Slash highlighted command must use palette accent with a visible accent ring');
assert.match(slash, /hover:bg-\[var\(--dash-accent\)\]/, 'Slash hover must use palette accent');
assert.match(slash, /className=\{`flex min-h-12 w-full flex-col/, 'Slash command buttons must fill their grid cell so picker icons stay centered');
assert.doesNotMatch(pickers, /<PopoverTrigger asChild><PickerTooltip/, 'picker tooltip must not swallow Popover trigger events');
assert.match(pickers, /<PickerTooltip trigger=\{<PopoverTrigger asChild>\{trigger\}<\/PopoverTrigger>\} label="Dimensione testo" \/>/, 'font-size picker must attach PopoverTrigger directly to the real button');
assert.match(pickers, /<PickerTooltip trigger=\{<PopoverTrigger asChild>\{trigger\}<\/PopoverTrigger>\} label="Font" \/>/, 'font-family picker must attach PopoverTrigger directly to the real button');

assert.match(richClipboard, /application\/x-hollowgate-note\+json/, 'rich clipboard custom representation must remain');
assert.match(richClipboard, /data-hollowgate-note-clipboard/, 'rich clipboard HTML marker must remain');
assert.match(richClipboard, /DOMSerializer\.fromSchema/, 'rich clipboard must preserve schema marks');
assert.match(richClipboard, /replaceSelection\(slice\)/, 'rich paste must restore complete Slice, not plain text');

const order = ['containerGuardExtension','tableClipboardExtension','richClipboardExtension','NoteSlashMenuExtension'].map((token) => editor.lastIndexOf(token));
assert.ok(order.every((index) => index >= 0) && order.every((index, i) => i === 0 || index > order[i - 1]), 'guard/table clipboard/rich clipboard/slash registration order must remain');
assert.match(editor, /PermanentUndo/, 'Undo must remain permanent outside Slash menu');
assert.match(editor, /absolute right-2 top-2/, 'Undo must stay top-right');

assert.match(noteListRow, /title="Spostare questa nota nel cestino\?"/, 'top-level note soft-delete dialog title must describe moving to trash');
assert.match(noteListRow, /confirmLabel="Sposta nel cestino"/, 'top-level note soft-delete confirmation must say Sposta nel cestino');
assert.match(entityTabBar, /deleteConfirmTitle\?: string;/, 'EntityTabBar must support a contextual delete dialog title');
assert.match(entityTabBar, /deleteConfirmLabel\?: string;/, 'EntityTabBar must support a contextual delete confirmation label');
assert.match(entityTabBar, /deleteConfirmTitle = 'Eliminare questa tab\?'/, 'hard-delete tab title must remain the default');
assert.match(entityTabBar, /deleteConfirmLabel = 'Elimina'/, 'hard-delete tab confirmation must remain the default');
assert.match(entityTabBar, /title=\{deleteConfirmTitle\}/, 'EntityTabBar dialog must use the contextual title');
assert.match(entityTabBar, /confirmLabel=\{deleteConfirmLabel\}/, 'EntityTabBar dialog must use the contextual confirmation label');
assert.match(noteSubTabs, /deleteConfirmTitle="Spostare questa tab nel cestino\?"/, 'note sub-tab soft-delete title must describe moving to trash');
assert.match(noteSubTabs, /deleteConfirmLabel="Sposta nel cestino"/, 'note sub-tab soft-delete confirmation must say Sposta nel cestino');
assert.match(trashRow, /confirmLabel="Elimina definitivamente"/, 'single trash purge must use final deletion wording');
assert.doesNotMatch(trashRow, /confirmLabel="Elimina per sempre"/, 'obsolete single-purge wording must not return');
assert.match(sessionNotesPanel, /title="Svuotare il cestino\?"[\s\S]*confirmLabel="Elimina definitivamente"/, 'empty-trash confirmation must use final deletion wording');
assert.doesNotMatch(sessionNotesPanel, /confirmLabel="Svuota per sempre"/, 'obsolete empty-trash wording must not return');

assert.match(noteListRow, /\.\.\.\(!isGm \? \[\{[\s\S]*?key: 'visibility'[\s\S]*?\}\] : \[\]\),/, 'players alone must receive the private/public visibility action');
assert.match(noteListRow, /\.\.\.\(isGm \? \[\{[\s\S]*?key: 'hide'[\s\S]*?\}\] : \[\]\),/, 'GM alone must receive the hide/show action');
assert.doesNotMatch(noteListRow, /\n\s*\{\n\s*key: 'visibility',[\s\S]*?handleSetNoteVisibility/, 'visibility action must not remain unconditional for GM');

console.log('Note contextual controls verification: PASS');
