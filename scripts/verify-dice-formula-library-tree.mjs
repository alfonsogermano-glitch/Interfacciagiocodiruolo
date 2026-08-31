import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

const types = read('src/app/components/session/dice/diceTypes.ts');
const formulasService = read('src/services/supabase/diceFormulasService.ts');
const foldersService = read('src/services/supabase/diceFormulaFoldersService.ts');
const library = read('src/app/components/session/dice/diceFormulaLibrary.ts');
const tree = read('src/app/components/session/dice/DiceFormulaLibraryTree.tsx');
const folderRow = read('src/app/components/session/dice/DiceFormulaFolderRow.tsx');
const deleteDialog = read('src/app/components/session/dice/DeleteDiceFormulaFolderDialog.tsx');
const panel = read('src/app/components/session/dice/SessionDicePanel.tsx');
const picker = read('src/app/components/session/dice/DiceLibraryIconPicker.tsx');
const migration = read('supabase/migrations/20260831173000_dice_formula_library_tree.sql');
const rpcSecurityMigration = read('supabase/migrations/20260831174500_dice_formula_library_rpc_security.sql');

assert.ok(types.includes('export interface DiceFormulaFolder'), 'dice types must expose folder metadata');
assert.ok(types.includes('folderId: string | null;'), 'saved formulas must persist their folder');
assert.ok(types.includes('sortOrder: number;'), 'saved library nodes must carry explicit sort order');
assert.ok(formulasService.includes("folder_id: input.folderId ?? null"), 'formula creation must support a folder');
assert.ok(formulasService.includes('sort_order: -1'), 'new formulas must append through the database sort trigger');
assert.ok(formulasService.includes('folderId: formula.folderId'), 'formula duplication must preserve its folder');

for (const rpc of ['create_dice_formula_folder', 'move_dice_library_node', 'delete_dice_formula_folder']) {
  assert.ok(foldersService.includes(`rpc('${rpc}'`), `folder service must use ${rpc}`);
  assert.ok(migration.includes(`function public.${rpc}`), `migration must define ${rpc}`);
}
assert.ok(migration.includes('on delete cascade'), 'recursive destructive folder deletion must be database-backed');
assert.ok(migration.includes('Le cartelle possono essere annidate fino a un massimo di 5 livelli.'), 'database must enforce five folder levels');
assert.ok(migration.includes('Una cartella non può essere spostata dentro una propria sottocartella.'), 'database must reject folder cycles');
assert.ok(migration.includes('normalize_dice_library_level'), 'structural RPCs must normalize mixed ordering atomically');
assert.ok(rpcSecurityMigration.includes('move_dice_library_node(text, uuid, uuid, integer) security definer'), 'move RPC must be able to call the protected normalization helper');
assert.ok(rpcSecurityMigration.includes('delete_dice_formula_folder(uuid, boolean) security definer'), 'delete RPC must be able to call the protected normalization helper');

assert.ok(library.includes('MAX_DICE_FORMULA_FOLDER_DEPTH = 5'), 'client must share the five-level folder limit');
assert.ok(library.includes('canMoveDiceFormulaFolder'), 'client must reject invalid folder destinations before RPC');
assert.ok(library.includes('applyDiceLibraryMove'), 'client must support optimistic structural moves');

assert.ok(tree.includes('data-dice-formula-library-tree'), 'saved formulas must render through the inline library tree');
assert.ok(tree.includes('dice-formula-folders:${campaignId}:${userId}'), 'expanded folder state must be browser-local per campaign and user');
assert.ok(tree.includes("type DropPosition = 'before' | 'after' | 'inside' | 'root'"), 'drag/drop must distinguish before, after, inside, and root');
assert.ok(tree.includes('AUTO_OPEN_DELAY = 650'), 'closed folders must auto-open after hover while dragging');
assert.ok(tree.includes('data-dice-library-root-drop'), 'dragging out of folders must expose an explicit root target');
assert.ok(tree.includes('setDragImage'), 'library drag must render a custom drag ghost');
assert.ok(tree.includes("ghost.style.opacity = '0.95'"), 'drag ghost must remain clearly visible');
assert.ok(tree.includes('window.getComputedStyle(source)'), 'library drag ghost must read the resolved active palette');
assert.ok(tree.includes('DRAG_GHOST_PALETTE_PROPERTIES'), 'library drag ghost must preserve dashboard palette variables');
assert.ok(tree.includes('data-dice-library-drag-ghost'), 'library drag ghost must expose a stable regression target');

assert.ok(folderRow.includes('Nuova sottocartella'), 'folder menu must create nested folders');
for (const label of ['Rinomina', 'Icona', 'Elimina']) assert.ok(folderRow.includes(label), `folder menu must expose ${label}`);
assert.ok(folderRow.includes('<Folder className='), 'folders without custom icons must use Folder fallback');
assert.ok(folderRow.includes('<NoteIconGlyph'), 'folders must support the shared custom icon catalog');
assert.ok(picker.includes('<NoteIconGrid'), 'formula and folder icons must share the existing icon grid');
assert.ok(picker.includes("document.addEventListener('pointerdown'"), 'shared picker must own outside dismissal');
assert.ok(picker.includes("event.key === 'Escape'"), 'shared picker must close on Escape');

assert.ok(deleteDialog.includes('data-dice-folder-delete-contents'), 'non-empty folder deletion must expose the destructive checkbox');
assert.ok(deleteDialog.includes('Elimina anche tutto il contenuto della cartella'), 'destructive checkbox copy must be explicit');
assert.ok(panel.includes('getDiceFormulaFolderDirectContentCount'), 'folder deletion must detect non-empty folders');
assert.ok(panel.includes('deleteDiceFormulaFolder(target.id, deleteContents)'), 'folder deletion must pass checkbox choice to the atomic RPC');
assert.ok(panel.includes('applyDiceLibraryMove'), 'panel must apply drag moves optimistically');
assert.ok(panel.includes('setFormulas(previousFormulas)'), 'failed moves must rollback formula state');
assert.ok(panel.includes('setFolders(previousFolders)'), 'failed moves must rollback folder state');
assert.ok(panel.includes('data-dice-new-folder'), 'saved formula section must expose root folder creation');

console.log('Dice formula library tree verification passed.');
