import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function read(relativePath) {
  const fullPath = path.join(ROOT, relativePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Missing required file: ${relativePath}`);
  }
  return fs.readFileSync(fullPath, 'utf8');
}

function expectContains(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`${label}: expected to find ${JSON.stringify(needle)}`);
  }
}

function expectNotContains(source, needle, label) {
  if (source.includes(needle)) {
    throw new Error(`${label}: expected not to find ${JSON.stringify(needle)}`);
  }
}

const migration = read('supabase-add-note-title-icon.sql');
expectContains(migration, 'add column if not exists title_icon text', 'migration column');
expectContains(migration, 'entity_notes_title_icon_length_check', 'migration constraint');
expectContains(migration, 'set_entity_note_title_icon', 'title icon RPC');
expectContains(migration, 'auth.uid()', 'RPC authentication');
expectContains(migration, 'from public.campaigns', 'RPC GM permission');
expectContains(migration, 'from public.campaign_members', 'RPC membership permission');
expectContains(migration, 'owner_profile_id', 'RPC note-owner permission');
expectContains(migration, 'revoke execute on function public.set_entity_note_title_icon(uuid, text) from anon', 'RPC anon revoke');
expectContains(migration, 'grant execute on function public.set_entity_note_title_icon', 'RPC authenticated grant');

const titleIconService = read('src/services/supabase/noteTitleIconService.ts');
expectContains(titleIconService, "supabase.rpc('set_entity_note_title_icon'", 'setter RPC call');
expectContains(titleIconService, 'p_note_id: noteId', 'setter note id');
expectContains(titleIconService, 'p_title_icon: titleIcon', 'setter icon value');
expectContains(titleIconService, 'export async function duplicateCampaignNoteWithTitleIcon', 'single note duplication helper');
expectContains(titleIconService, 'contentRich: source.content_rich', 'single note rich-content preservation');
expectContains(titleIconService, 'setNoteTitleIcon(createData.note.id, source.title_icon)', 'single note title icon preservation');
expectContains(titleIconService, "'note',", 'single note sub-tab entity type');
expectContains(titleIconService, 'source.id,', 'single note sub-tab source');

const iconGrid = read('src/app/components/session/shared/NoteIconGrid.tsx');
expectContains(iconGrid, "import { ICON_CATEGORIES } from './tiptapIconData';", 'shared categories source');
expectContains(iconGrid, 'export const NOTE_ICON_COMPONENTS', 'shared icon registry');
expectContains(iconGrid, 'export function NoteIconGrid', 'shared icon grid');
expectContains(iconGrid, 'Rimuovi icona', 'shared removal action');
expectContains(iconGrid, 'data-note-icon-remove="true"', 'explicit removal styling hook');
expectContains(iconGrid, 'data-note-icon-category="true"', 'explicit category styling hook');
expectContains(iconGrid, 'data-note-icon-category-header="true"', 'explicit category-header styling hook');
expectContains(iconGrid, 'data-note-icon-grid="true"', 'explicit icon-grid styling hook');
expectContains(iconGrid, 'data-note-icon-button="true"', 'explicit icon-button styling hook');
expectContains(iconGrid, 'data-note-icon-glyph="true"', 'explicit Lucide glyph styling hook');
expectContains(iconGrid, 'text-[var(--dash-text-strong)]', 'explicit visible icon color');

const pickers = read('src/app/components/session/shared/NoteContextualPickers.tsx');
expectContains(pickers, "import { NoteIconGrid } from './NoteIconGrid';", 'inline picker shared grid import');
expectContains(pickers, "import './noteContextualMenus.css';", 'shared contextual menu stylesheet import');
expectContains(pickers, '<NoteIconGrid', 'inline picker shared grid usage');
expectContains(pickers, 'tiptap-icon-popover', 'inline icon picker shared shell hook');

const row = read('src/app/components/session/shared/NoteListRow.tsx');
expectContains(row, "key: 'icon'", 'note kebab icon action');
expectContains(row, "label: 'Icona'", 'note kebab icon label');
expectContains(row, 'setNoteTitleIcon(note.id, nextIcon)', 'note title icon selection/removal');
expectContains(row, 'duplicateCampaignNoteWithTitleIcon(', 'note duplicate delegation');
expectContains(row, 'NOTE_ICON_COMPONENTS[titleIcon]', 'note title icon rendering lookup');
expectContains(row, 'selectedName={titleIcon}', 'current title icon selection');
expectContains(row, 'updateTitleIcon(null)', 'note title icon removal');
expectContains(row, 'gap-2', 'title icon visual spacing');
expectContains(row, 'tiptap-icon-popover', 'title icon picker shared shell hook');

const contextualMenuCss = read('src/app/components/session/shared/noteContextualMenus.css');
expectContains(contextualMenuCss, '.tiptap-icon-popover:not([data-side])', 'title icon picker offset selector');
expectContains(contextualMenuCss, 'transform: translateX(8px);', 'title icon picker border gap');
expectContains(contextualMenuCss, '[data-note-icon-category="true"]', 'explicit icon category selector');
expectContains(contextualMenuCss, '[data-note-icon-category-header="true"]', 'explicit icon category header selector');
expectContains(contextualMenuCss, '[data-note-icon-grid="true"]', 'explicit icon grid selector');
expectContains(contextualMenuCss, '[data-note-icon-button="true"]', 'explicit icon button selector');
expectContains(contextualMenuCss, '[data-note-icon-glyph="true"]', 'explicit glyph selector');
expectContains(contextualMenuCss, 'visibility: visible;', 'glyph visibility guard');
expectContains(contextualMenuCss, 'stroke: currentColor;', 'Lucide stroke guard');
expectContains(contextualMenuCss, 'background: var(--dash-surface);', 'icon category card surface');
expectContains(contextualMenuCss, 'background: var(--dash-surface-2);', 'icon category header surface');
expectContains(contextualMenuCss, '[aria-pressed="true"]', 'selected icon accent state');
expectContains(contextualMenuCss, 'box-shadow: inset 0 0 0 1px var(--dash-accent-2);', 'icon accent ring');
expectNotContains(contextualMenuCss, '.tiptap-icon-popover-scroll > div:not(.border-t)', 'no DOM-structure-dependent category selector');
expectNotContains(contextualMenuCss, '.tiptap-icon-popover-scroll > button:first-child', 'no DOM-position-dependent removal selector');

console.log('verify-note-title-icons: OK');
