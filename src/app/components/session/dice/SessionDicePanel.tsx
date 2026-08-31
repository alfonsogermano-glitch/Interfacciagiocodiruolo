import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dices, FolderPlus, Loader2, Play, Save, Swords, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../auth/AuthContext';
import { useCampaign } from '../../../campaigns/CampaignContext';
import { ConfirmDialog } from '../../shared/ConfirmDialog';
import {
  createDiceFormula,
  deleteDiceFormula,
  loadDiceFormulas,
  updateDiceFormula,
} from '../../../../services/supabase/diceFormulasService';
import {
  createDiceFormulaFolder,
  deleteDiceFormulaFolder,
  loadDiceFormulaFolders,
  moveDiceLibraryNode,
  updateDiceFormulaFolder,
} from '../../../../services/supabase/diceFormulaFoldersService';
import { DeleteDiceFormulaFolderDialog } from './DeleteDiceFormulaFolderDialog';
import { DiceFormulaBuilder } from './DiceFormulaBuilder';
import { DiceFormulaLibraryTree } from './DiceFormulaLibraryTree';
import {
  MAX_DICE_FORMULA_FOLDER_DEPTH,
  applyDiceLibraryMove,
  getDiceFormulaFolderDepth,
  getDiceFormulaFolderDirectContentCount,
} from './diceFormulaLibrary.ts';
import { resolveUniqueDiceFormulaName } from './diceFormulaNames.ts';
import { formatDiceFormula } from './diceFormulaText.ts';
import { validateDiceFormula } from './diceFormulaValidation.ts';
import { DiceToolbar } from './DiceToolbar';
import { useDiceSession } from './DiceSessionContext';
import type {
  DiceFormulaFolder,
  DiceFormulaItem,
  DiceLibraryNodeType,
  SavedDiceFormula,
} from './diceTypes.ts';

const DEFAULT_FORMULA_NAME = 'Formula senza nome';

type FolderEditorState =
  | { mode: 'create'; parentFolderId: string | null }
  | { mode: 'rename'; folder: DiceFormulaFolder };

function cloneItems(items: DiceFormulaItem[]): DiceFormulaItem[] {
  return items.map((item) => ({ ...item })) as DiceFormulaItem[];
}

export function SessionDicePanel() {
  const { user } = useAuth();
  const { activeCampaign } = useCampaign();
  const { submitLocalRoll } = useDiceSession();

  const [name, setName] = useState(DEFAULT_FORMULA_NAME);
  const [items, setItems] = useState<DiceFormulaItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingIsSecret, setEditingIsSecret] = useState(false);
  const [formulas, setFormulas] = useState<SavedDiceFormula[]>([]);
  const [folders, setFolders] = useState<DiceFormulaFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SavedDiceFormula | null>(null);
  const [folderDeleteTarget, setFolderDeleteTarget] = useState<DiceFormulaFolder | null>(null);
  const [folderEditor, setFolderEditor] = useState<FolderEditorState | null>(null);
  const [folderDraft, setFolderDraft] = useState('');
  const [folderSaving, setFolderSaving] = useState(false);
  const loadSequence = useRef(0);

  const validation = useMemo(() => validateDiceFormula(items), [items]);
  const formulaText = useMemo(() => formatDiceFormula(items), [items]);

  const clearBuilder = useCallback(() => {
    setName(DEFAULT_FORMULA_NAME);
    setItems([]);
    setEditingId(null);
    setEditingIsSecret(false);
  }, []);

  const loadLibrary = useCallback(async (showSpinner: boolean) => {
    const campaignId = activeCampaign?.id;
    const ownerProfileId = user?.id;
    if (!campaignId || !ownerProfileId) return null;
    const sequence = ++loadSequence.current;
    if (showSpinner) setLoading(true);
    try {
      const [nextFormulas, nextFolders] = await Promise.all([
        loadDiceFormulas(campaignId, ownerProfileId),
        loadDiceFormulaFolders(campaignId, ownerProfileId),
      ]);
      if (loadSequence.current !== sequence) return null;
      setFormulas(nextFormulas);
      setFolders(nextFolders);
      return { formulas: nextFormulas, folders: nextFolders };
    } catch (error) {
      if (loadSequence.current === sequence) {
        console.error(error);
        toast.error('Impossibile caricare la libreria delle formule dadi.');
      }
      return null;
    } finally {
      if (showSpinner && loadSequence.current === sequence) setLoading(false);
    }
  }, [activeCampaign?.id, user?.id]);

  useEffect(() => {
    setFormulas([]);
    setFolders([]);
    setDeleteTarget(null);
    setFolderDeleteTarget(null);
    setFolderEditor(null);
    clearBuilder();
    if (!activeCampaign?.id || !user?.id) return;
    void loadLibrary(true);
  }, [activeCampaign?.id, clearBuilder, loadLibrary, user?.id]);

  const addQuickDie = (sides: number) => {
    const first = items.findIndex((item) => item.kind === 'dice' && item.sides === sides);
    if (first < 0) {
      setItems((current) => [
        ...current,
        { id: globalThis.crypto.randomUUID(), kind: 'dice', sides, quantity: 1 },
      ]);
      return;
    }
    setItems((current) => current.map((item, index) =>
      index === first && item.kind === 'dice' ? { ...item, quantity: item.quantity + 1 } : item,
    ));
  };

  const runBuilder = () => {
    if (!validation.valid) return;
    try {
      submitLocalRoll({
        items: cloneItems(items),
        formulaName: name.trim() || DEFAULT_FORMULA_NAME,
        visibility: 'public',
      });
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Errore durante il tiro.');
    }
  };

  const upsertFormula = (formula: SavedDiceFormula) => {
    setFormulas((current) => {
      const exists = current.some((item) => item.id === formula.id);
      return exists ? current.map((item) => item.id === formula.id ? formula : item) : [...current, formula];
    });
  };

  const upsertFolder = (folder: DiceFormulaFolder) => {
    setFolders((current) => {
      const exists = current.some((item) => item.id === folder.id);
      return exists ? current.map((item) => item.id === folder.id ? folder : item) : [...current, folder];
    });
  };

  const saveBuilder = async () => {
    if (!user?.id || !activeCampaign?.id || !validation.valid || saving) return;
    setSaving(true);
    try {
      const uniqueName = resolveUniqueDiceFormulaName(
        name,
        formulas.filter((formula) => formula.id !== editingId).map((formula) => formula.name),
      );
      const saved = editingId
        ? await updateDiceFormula(editingId, {
            name: uniqueName,
            items: cloneItems(items),
            isSecret: editingIsSecret,
          })
        : await createDiceFormula({
            campaignId: activeCampaign.id,
            ownerProfileId: user.id,
            name: uniqueName,
            items: cloneItems(items),
            isSecret: false,
            folderId: null,
          });
      upsertFormula(saved);
      setEditingId(saved.id);
      setEditingIsSecret(saved.isSecret);
      setName(saved.name);
      toast.success(editingId ? 'Formula aggiornata.' : 'Formula salvata.');
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Errore nel salvataggio della formula.');
    } finally {
      setSaving(false);
    }
  };

  const editFormula = (formula: SavedDiceFormula) => {
    setEditingId(formula.id);
    setEditingIsSecret(formula.isSecret);
    setName(formula.name);
    setItems(cloneItems(formula.items));
  };

  const rollSaved = (formula: SavedDiceFormula) => {
    try {
      submitLocalRoll({
        items: cloneItems(formula.items),
        formulaId: formula.id,
        formulaName: formula.name,
        formulaIconName: formula.iconName ?? undefined,
        visibility: formula.isSecret ? 'secret' : 'public',
      });
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Errore durante il tiro.');
    }
  };

  const toggleSecret = async (formula: SavedDiceFormula) => {
    const nextSecret = !formula.isSecret;
    setFormulas((current) => current.map((item) => item.id === formula.id ? { ...item, isSecret: nextSecret } : item));
    if (editingId === formula.id) setEditingIsSecret(nextSecret);
    try {
      const updated = await updateDiceFormula(formula.id, { isSecret: nextSecret });
      upsertFormula(updated);
    } catch (error) {
      console.error(error);
      setFormulas((current) => current.map((item) => item.id === formula.id ? formula : item));
      if (editingId === formula.id) setEditingIsSecret(formula.isSecret);
      toast.error('Impossibile cambiare la visibilita del tiro.');
    }
  };

  const setFormulaIcon = async (formula: SavedDiceFormula, iconName: string | null) => {
    setFormulas((current) => current.map((item) => item.id === formula.id ? { ...item, iconName } : item));
    try {
      const updated = await updateDiceFormula(formula.id, { iconName });
      upsertFormula(updated);
    } catch (error) {
      console.error(error);
      setFormulas((current) => current.map((item) => item.id === formula.id ? formula : item));
      toast.error('Impossibile cambiare l\'icona della formula.');
    }
  };

  const duplicateFormula = async (formula: SavedDiceFormula) => {
    if (!user?.id || !activeCampaign?.id) return;
    try {
      const duplicateName = resolveUniqueDiceFormulaName(`Copia di ${formula.name}`, formulas.map((item) => item.name));
      const duplicate = await createDiceFormula({
        campaignId: activeCampaign.id,
        ownerProfileId: user.id,
        name: duplicateName,
        items: cloneItems(formula.items),
        isSecret: formula.isSecret,
        iconName: formula.iconName,
        folderId: formula.folderId,
      });
      upsertFormula(duplicate);
      toast.success('Formula duplicata.');
    } catch (error) {
      console.error(error);
      toast.error('Impossibile duplicare la formula.');
    }
  };

  const confirmDelete = async () => {
    const target = deleteTarget;
    if (!target) return;
    setDeleteTarget(null);
    try {
      await deleteDiceFormula(target.id);
      setFormulas((current) => current.filter((item) => item.id !== target.id));
      if (editingId === target.id) clearBuilder();
      toast.success('Formula eliminata.');
    } catch (error) {
      console.error(error);
      toast.error('Impossibile eliminare la formula.');
    }
  };

  const openCreateFolder = (parentFolderId: string | null) => {
    if (parentFolderId) {
      const depth = getDiceFormulaFolderDepth(parentFolderId, folders);
      if (depth >= MAX_DICE_FORMULA_FOLDER_DEPTH) {
        toast.error('Hai raggiunto il limite massimo di 5 livelli.');
        return;
      }
    }
    setFolderDraft('Nuova cartella');
    setFolderEditor({ mode: 'create', parentFolderId });
  };

  const openRenameFolder = (folder: DiceFormulaFolder) => {
    setFolderDraft(folder.name);
    setFolderEditor({ mode: 'rename', folder });
  };

  const confirmFolderEditor = async () => {
    const editor = folderEditor;
    if (!editor || !user?.id || !activeCampaign?.id || folderSaving) return;
    const nextName = folderDraft.trim();
    if (!nextName) {
      toast.error('Inserisci un nome per la cartella.');
      return;
    }
    setFolderSaving(true);
    try {
      if (editor.mode === 'create') {
        const created = await createDiceFormulaFolder({
          campaignId: activeCampaign.id,
          ownerProfileId: user.id,
          parentFolderId: editor.parentFolderId,
          name: nextName,
        });
        upsertFolder(created);
        toast.success('Cartella creata.');
      } else {
        const updated = await updateDiceFormulaFolder(editor.folder.id, { name: nextName });
        upsertFolder(updated);
        toast.success('Cartella rinominata.');
      }
      setFolderEditor(null);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Impossibile salvare la cartella.');
    } finally {
      setFolderSaving(false);
    }
  };

  const setFolderIcon = async (folder: DiceFormulaFolder, iconName: string | null) => {
    setFolders((current) => current.map((item) => item.id === folder.id ? { ...item, iconName } : item));
    try {
      const updated = await updateDiceFormulaFolder(folder.id, { iconName });
      upsertFolder(updated);
    } catch (error) {
      console.error(error);
      setFolders((current) => current.map((item) => item.id === folder.id ? folder : item));
      toast.error('Impossibile cambiare l\'icona della cartella.');
    }
  };

  const confirmFolderDelete = async (deleteContents: boolean) => {
    const target = folderDeleteTarget;
    if (!target) return;
    setFolderDeleteTarget(null);
    try {
      await deleteDiceFormulaFolder(target.id, deleteContents);
      const refreshed = await loadLibrary(false);
      if (editingId && refreshed && !refreshed.formulas.some((formula) => formula.id === editingId)) clearBuilder();
      toast.success(deleteContents ? 'Cartella e contenuto eliminati.' : 'Cartella eliminata. Contenuto spostato al livello superiore.');
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Impossibile eliminare la cartella.');
      void loadLibrary(false);
    }
  };

  const handleMoveNode = async (
    nodeType: DiceLibraryNodeType,
    nodeId: string,
    destinationFolderId: string | null,
    destinationIndex: number,
  ) => {
    const previousFormulas = formulas;
    const previousFolders = folders;
    const optimistic = applyDiceLibraryMove(formulas, folders, nodeType, nodeId, destinationFolderId, destinationIndex);
    setFormulas(optimistic.formulas);
    setFolders(optimistic.folders);
    try {
      await moveDiceLibraryNode(nodeType, nodeId, destinationFolderId, destinationIndex);
    } catch (error) {
      console.error(error);
      setFormulas(previousFormulas);
      setFolders(previousFolders);
      toast.error(error instanceof Error ? error.message : 'Impossibile spostare l\'elemento.');
    }
  };

  const folderDeleteHasContents = folderDeleteTarget
    ? getDiceFormulaFolderDirectContentCount(folderDeleteTarget.id, formulas, folders) > 0
    : false;

  return (
    <div data-session-dice-panel className="flex h-full min-h-0 flex-col text-[var(--dash-text)]">
      <div className="shrink-0 border-b border-[var(--dash-border)] px-6 py-5">
        <h1 className="text-xl font-semibold text-[var(--dash-text-strong)]">Formule dei dadi</h1>
        <div className="mt-4"><DiceToolbar items={items} onAddDie={addQuickDie} /></div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <section className="rounded-xl border border-[var(--dash-border)] bg-[var(--dash-panel)] p-4">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] text-[var(--dash-accent)]">
              <Swords className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <input value={name} onChange={(event) => setName(event.target.value)} aria-label="Nome formula" className="w-full bg-transparent text-sm font-semibold text-[var(--dash-text-strong)] outline-none" />
              <div className="mt-0.5 min-h-4 truncate font-mono text-xs text-[var(--dash-muted)]">{formulaText || 'Aggiungi un dado per iniziare'}</div>
            </div>
          </div>

          <DiceFormulaBuilder items={items} itemErrors={validation.itemErrors} onChange={setItems} />

          {validation.issues.some((issue) => !issue.itemId) && items.length > 0 && (
            <div className="mt-2 text-xs text-red-400">{validation.issues.filter((issue) => !issue.itemId).map((issue) => issue.message).join(' ')}</div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" data-dice-roll-builder disabled={!validation.valid} onClick={runBuilder} className="inline-flex items-center gap-2 rounded-lg bg-[var(--dash-accent)] px-4 py-2 text-sm font-semibold text-[var(--dash-text-strong)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
              <Play className="h-4 w-4" />Tira
            </button>
            <button type="button" data-dice-save-formula disabled={!validation.valid || saving} onClick={() => { void saveBuilder(); }} className="inline-flex items-center gap-2 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface)] px-4 py-2 text-sm text-[var(--dash-text)] transition-colors hover:bg-[var(--dash-surface-2)] disabled:cursor-not-allowed disabled:opacity-40">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salva formula
            </button>
            <button type="button" data-dice-clear-builder onClick={clearBuilder} className="inline-flex items-center gap-2 rounded-lg border border-[var(--dash-border)] px-4 py-2 text-sm text-[var(--dash-muted)] transition-colors hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)]">
              <Trash2 className="h-4 w-4" />Svuota
            </button>
          </div>
        </section>

        <section className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-[var(--dash-text-strong)]">Formule salvate</h2>
            <div className="flex items-center gap-2">
              {loading && <Loader2 className="h-4 w-4 animate-spin text-[var(--dash-muted)]" />}
              <button
                type="button"
                data-dice-new-folder
                onClick={() => openCreateFolder(null)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--dash-text)] hover:bg-[var(--dash-surface-2)]"
              >
                <FolderPlus className="h-3.5 w-3.5" />Nuova cartella
              </button>
            </div>
          </div>

          {formulas.length === 0 && folders.length === 0 && !loading ? (
            <div className="rounded-xl border border-dashed border-[var(--dash-border)] p-8 text-center text-sm text-[var(--dash-muted)]">
              <Dices className="mx-auto mb-2 h-6 w-6 opacity-50" />
              Nessuna formula o cartella salvata in questa campagna.
            </div>
          ) : activeCampaign?.id && user?.id ? (
            <DiceFormulaLibraryTree
              campaignId={activeCampaign.id}
              userId={user.id}
              formulas={formulas}
              folders={folders}
              onRollFormula={rollSaved}
              onToggleSecret={(formula) => { void toggleSecret(formula); }}
              onEditFormula={editFormula}
              onDuplicateFormula={(formula) => { void duplicateFormula(formula); }}
              onDeleteFormula={setDeleteTarget}
              onFormulaIconChange={(formula, iconName) => { void setFormulaIcon(formula, iconName); }}
              onCreateFolder={openCreateFolder}
              onRenameFolder={openRenameFolder}
              onDeleteFolder={setFolderDeleteTarget}
              onFolderIconChange={(folder, iconName) => { void setFolderIcon(folder, iconName); }}
              onMoveNode={(nodeType, nodeId, destinationFolderId, destinationIndex) => {
                void handleMoveNode(nodeType, nodeId, destinationFolderId, destinationIndex);
              }}
            />
          ) : null}
        </section>
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="Elimina formula"
          message={`Vuoi eliminare definitivamente la formula “${deleteTarget.name}”?`}
          confirmLabel="Elimina"
          onConfirm={() => { void confirmDelete(); }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {folderDeleteTarget && (
        <DeleteDiceFormulaFolderDialog
          key={folderDeleteTarget.id}
          folder={folderDeleteTarget}
          hasContents={folderDeleteHasContents}
          onConfirm={(deleteContents) => { void confirmFolderDelete(deleteContents); }}
          onCancel={() => setFolderDeleteTarget(null)}
        />
      )}

      {folderEditor && (
        <ConfirmDialog
          title={folderEditor.mode === 'create' ? 'Nuova cartella' : 'Rinomina cartella'}
          message={folderEditor.mode === 'create' ? 'Scegli il nome della nuova cartella.' : `Scegli un nuovo nome per “${folderEditor.folder.name}”.`}
          confirmLabel={folderSaving ? 'Salvataggio…' : 'Salva'}
          danger={false}
          onConfirm={() => { void confirmFolderEditor(); }}
          onCancel={() => { if (!folderSaving) setFolderEditor(null); }}
          extraContent={(
            <input
              data-dice-folder-name-input
              autoFocus
              value={folderDraft}
              onChange={(event) => setFolderDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') { event.preventDefault(); void confirmFolderEditor(); }
              }}
              className="w-full rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-sm text-[var(--dash-text)] outline-none focus:border-[var(--dash-accent)]"
            />
          )}
        />
      )}
    </div>
  );
}
