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
expectContains(migration, 'add column if not exists title_icon text', 'migration');
expectContains(migration, 'entity_notes_title_icon_length_check', 'migration constraint');

const server = read('supabase/functions/server/index.tsx');
expectContains(server, 'titleIcon', 'server request contract');
expectContains(server, 'patch.title_icon = titleIcon', 'server persistence mapping');
expectContains(server, 'titleIcon non valido', 'server validation');

const tabs = read('src/app/components/session/shared/useEntityTabs.ts');
expectContains(tabs, 'title_icon: string | null;', 'client note type');
expectContains(tabs, 'title_icon: n.title_icon ?? null', 'fetch normalization');
expectContains(tabs, 'title_icon: row.title_icon ?? null', 'realtime normalization');
expectContains(tabs, 'const handleSetNoteTitleIcon = async', 'title icon update handler');
expectContains(tabs, 'body: JSON.stringify({ titleIcon })', 'title icon PUT body');
expectContains(tabs, 'titleIcon: source.title_icon', 'direct note duplication');
expectContains(tabs, 'handleSetNoteTitleIcon,', 'hook result exposure');

const duplicateService = read('src/services/supabase/entityNotesService.ts');
expectContains(duplicateService, 'title_icon: string | null;', 'entity duplication row type');
expectContains(duplicateService, 'titleIcon: note.title_icon', 'entity duplication persistence');

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
expectContains(row, 'tabs.handleSetNoteTitleIcon(note.id, name)', 'note title icon selection');
expectContains(row, 'tabs.handleSetNoteTitleIcon(note.id, null)', 'note title icon removal');
expectContains(row, 'NOTE_ICON_COMPONENTS[note.title_icon]', 'note title icon rendering lookup');
expectContains(row, 'gap-2', 'title icon visual spacing');

console.log('verify-note-title-icons: OK');
