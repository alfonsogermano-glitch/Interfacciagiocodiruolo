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

const migration = read('supabase-add-note-title-icon.sql');
expectContains(migration, 'add column if not exists title_icon text', 'migration column');
expectContains(migration, 'entity_notes_title_icon_length_check', 'migration constraint');
expectContains(migration, 'set_entity_note_title_icon', 'title icon RPC');
expectContains(migration, 'auth.uid()', 'RPC authentication');
expectContains(migration, "from campaigns", 'RPC GM permission');
expectContains(migration, "from campaign_members", 'RPC membership permission');
expectContains(migration, 'owner_profile_id', 'RPC note-owner permission');
expectContains(migration, 'grant execute on function public.set_entity_note_title_icon', 'RPC authenticated grant');

const titleIconService = read('src/services/supabase/noteTitleIconService.ts');
expectContains(titleIconService, "supabase.rpc('set_entity_note_title_icon'", 'setter RPC call');
expectContains(titleIconService, 'p_note_id: noteId', 'setter note id');
expectContains(titleIconService, 'p_title_icon: titleIcon', 'setter icon value');

const duplicateService = read('src/services/supabase/entityNotesService.ts');
expectContains(duplicateService, 'title_icon: string | null;', 'entity duplication row type');
expectContains(duplicateService, 'setNoteTitleIcon(createData.note.id, note.title_icon)', 'entity duplication title icon');
expectContains(duplicateService, 'export async function duplicateSingleEntityNote', 'single note duplication helper');
expectContains(duplicateService, 'contentRich: source.content_rich', 'single note rich-content preservation');
expectContains(duplicateService, 'setNoteTitleIcon(createData.note.id, source.title_icon)', 'single note title icon preservation');
expectContains(duplicateService, "duplicateEntityNotes('note', source.id", 'single note sub-tab preservation');

const iconGrid = read('src/app/components/session/shared/NoteIconGrid.tsx');
expectContains(iconGrid, "import { ICON_CATEGORIES } from './tiptapIconData';", 'shared categories source');
expectContains(iconGrid, 'export const NOTE_ICON_COMPONENTS', 'shared icon registry');
expectContains(iconGrid, 'export function NoteIconGrid', 'shared icon grid');
expectContains(iconGrid, 'Rimuovi icona', 'shared removal action');

const pickers = read('src/app/components/session/shared/NoteContextualPickers.tsx');
expectContains(pickers, "import { NoteIconGrid } from './NoteIconGrid';", 'inline picker shared grid import');
expectContains(pickers, '<NoteIconGrid', 'inline picker shared grid usage');

const row = read('src/app/components/session/shared/NoteListRow.tsx');
expectContains(row, "key: 'icon'", 'note kebab icon action');
expectContains(row, "label: 'Icona'", 'note kebab icon label');
expectContains(row, 'setNoteTitleIcon(note.id, name)', 'note title icon selection');
expectContains(row, 'setNoteTitleIcon(note.id, null)', 'note title icon removal');
expectContains(row, 'duplicateSingleEntityNote(', 'note duplicate delegation');
expectContains(row, 'NOTE_ICON_COMPONENTS[titleIcon]', 'note title icon rendering lookup');
expectContains(row, 'gap-2', 'title icon visual spacing');

console.log('verify-note-title-icons: OK');
