import { useState } from 'react';
import { useEntityTabs } from './useEntityTabs';
import { NoteSubTabs } from './NoteSubTabs';
import { NoteListRow } from './NoteListRow';
import { useFolderSection } from '../../shared/useFolderSection';
import { FolderBreadcrumb } from '../../shared/FolderBreadcrumb';
import { FolderIconPicker } from '../../shared/FolderIconPicker';
import { ConfirmDialog } from '../../shared/ConfirmDialog';
import { PALETTE_COLORS, DEFAULT_PALETTE_COLORS, type PaletteId } from '../../ui/paletteColors';

function getCurrentPaletteColors() {
  const el = document.querySelector('[data-dashboard-palette]');
  const palette = el?.getAttribute('data-dashboard-palette') as PaletteId | null;
  return palette && PALETTE_COLORS[palette] ? PALETTE_COLORS[palette] : DEFAULT_PALETTE_COLORS;
}

export interface UseCampaignNotesSectionParams {
  campaignId: string;
  /** Solo per useFolderSection (drill-down/reset cartelle) - vedi il
   *  commento gemello su sessionKey in SessionCharactersPanel.tsx, stessa
   *  ragione: session?.user?.id, mai l'intero oggetto sessione. */
  sessionKey: string | null;
  accessToken: string | null | undefined;
  canEdit: boolean;
  /** 'gm' = Note del GM (entity_notes con hidden=true, mai lette da chi non
   *  e' GM - vedi canAccessEntityNotes lato server). 'shared' = Note della
   *  Campagna (hidden=false, lette da tutti i membri). Stessa tabella
   *  entity_notes/entity_type='campaign' di sempre: le due sezioni sono
   *  interamente distinte dal valore di hidden, non da un entity_type
   *  diverso (vedi l'indagine che ha preceduto questa feature). */
  scope: 'gm' | 'shared';
  savedTabOrder: string[] | undefined;
  onPersistTabOrder: (order: string[]) => void;
  /** Notifica il chiamante (SessionNotesPanel.tsx) quando una nota di QUESTA
   *  istanza/scope viene selezionata - entrambe le sezioni (Campagna/GM)
   *  sono sempre montate, ma solo una alla volta "possiede" la colonna di
   *  dettaglio a destra (vedi activeScope li'). */
  onSelectNote: () => void;
  /** false = niente fetch ne' sottoscrizione realtime, folders/customTabs
   *  restano vuoti - usato per l'istanza scope='gm' quando il chiamante non
   *  e' GM: l'hook va comunque chiamato SEMPRE (le regole di React vietano
   *  chiamate condizionali), ma un non-GM non deve interrogare il server per
   *  contenuto riservato solo perche' la sezione esiste nell'albero dei
   *  componenti - stesso principio di `enabled` in useFolderSection.tsx,
   *  qui inoltrato anche a useEntityTabs. Default true = comportamento
   *  invariato. */
  enabled?: boolean;
}

export interface UseCampaignNotesSectionResult {
  count: number;
  renderSidebar: () => React.ReactNode;
  renderDetail: () => React.ReactNode;
  renderDialogs: () => React.ReactNode;
  handleAddNote: () => void;
  handleCreateFolder: () => void;
  createDisabledReason: string | null;
}

/**
 * Ex CampaignNotesPanel.tsx: da componente-che-ritorna-un-blocco-unico a hook
 * che espone funzioni di render separate per lista (colonna sinistra) e
 * dettaglio (colonna destra) - stesso principio di useFolderSection.tsx
 * (renderRows/renderGhost). Le note di primo livello non sono piu' pillole
 * in EntityTabBar (rimosso da qui): sono righe NoteListRow dentro
 * section.renderRows(), che le tratta come i directItems di useFolderSection
 * esattamente come farebbe con PNG/Mostri in SessionCharactersPanel.tsx.
 */
export function useCampaignNotesSection({
  campaignId,
  sessionKey,
  accessToken,
  canEdit,
  scope,
  savedTabOrder,
  onPersistTabOrder,
  onSelectNote,
  enabled = true,
}: UseCampaignNotesSectionParams): UseCampaignNotesSectionResult {
  const [menuColors] = useState(() => getCurrentPaletteColors());

  const tabs = useEntityTabs({
    entityType: 'campaign',
    entityId: campaignId,
    campaignId,
    accessToken,
    canEdit,
    baseTabs: [],
    savedTabOrder,
    onPersistTabOrder,
    enabled,
  });

  // Le due sezioni (GM/Campagna) sono la STESSA tabella filtrata sul posto -
  // ogni istanza di questo hook fa il proprio fetch completo (via
  // useEntityTabs sopra) e si scarta lato client cio' che non le appartiene.
  // Duplica il fetch tra le due istanze montate in SessionNotesPanel.tsx, ma
  // il volume di note di campagna e' talmente piccolo che non vale la pena
  // di un parametro server dedicato solo per evitarlo.
  const scopedTabs = tabs.customTabs.filter(t => t.hidden === (scope === 'gm'));

  // Ordine di lista = tabOrder gia' salvato (tabOrderCampaignNotes/
  // tabOrderGmNotes), non l'ordine di arrivo dal server - tabs.orderedTabs
  // lo risolve gia' (baseTabs assente qui, solo customTabs in sequenza).
  // Nessun drag-riordino nella lista verticale per ora (vedi il piano): la
  // sola fonte d'ordine resta questo mapping.
  const orderIndex = new Map(tabs.orderedTabs.map((t, i) => [t.id, i]));
  const scopedTabsSorted = [...scopedTabs].sort(
    (a, b) => (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0)
  );

  const folderEntityType = scope === 'gm' ? 'gmnotes' : 'campaignnotes';
  const emptyLabel = scope === 'gm' ? 'Nessuna nota del GM.' : 'Nessuna nota di campagna.';

  const section = useFolderSection({
    entityType: folderEntityType,
    campaignId,
    sessionKey,
    accessToken: accessToken ?? null,
    canEdit,
    enabled,
    items: scopedTabsSorted.map(t => ({ ...t, folderId: t.folder_id })),
    renderCard: (note) => (
      <NoteListRow
        note={note}
        tabs={tabs}
        canEdit={canEdit}
        folders={section.folders.map(f => ({ id: f.id, name: f.name }))}
        colors={menuColors}
        isSelected={tabs.currentTab === note.id}
        onSelect={onSelectNote}
      />
    ),
    renderGhostCard: (note) => (
      <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] px-3 py-2 text-sm text-[var(--dash-text)]">
        {note.tab_name}
      </div>
    ),
    itemLabel: 'note',
    onMoveCard: (tabId, folderId) => tabs.handleMoveCustomTabToFolder(tabId, folderId),
    // Niente merge fine-grained (stesso motivo di reloadFolders in
    // useFolderSection.tsx, bug realtime 2026-07-23): un reload completo
    // delle note e' semplice e sicuro sia nel caso cascade (piu' note
    // cancellate in un colpo solo lato server) sia in quello non-cascade
    // (folder_id delle note orfane azzerato dalla FK "on delete set null",
    // vedi supabase-add-notes-folders.sql - il reload lo riflette subito
    // invece di aspettare il broadcast realtime riga-per-riga).
    onFolderDeleted: async () => { await tabs.reloadCustomTabs(); },
    maxVisibleDescendantShortcuts: 4,
    menuColors,
  });

  // Vista vuota (stesso calcolo di npcCurrentViewEmpty/monsterCurrentViewEmpty
  // in SessionCharactersPanel.tsx): nessuna sotto-cartella e nessuna nota
  // diretta nella cartella corrente.
  const currentViewEmpty =
    section.folders.filter(f => f.parentFolderId === section.currentFolderId).length === 0 &&
    scopedTabsSorted.filter(t => (t.folder_id ?? null) === section.currentFolderId).length === 0;

  // Nessuna selezione automatica (ne' "prima nota", ne' "sgancia se la
  // cartella cambia"): la selezione resta interamente in mano all'utente,
  // stesso principio gia' seguito per PNG/Mostri in SessionCharactersPanel.tsx
  // (mai auto-selezionati, a differenza del solo primo Personaggio). Se la
  // nota selezionata sparisce (nascosta/eliminata da altri), useEntityTabs
  // la sgancia gia' da solo (torna a currentTab='', vedi il suo effect
  // "torna alla tab di default").
  const selectedTab = scopedTabsSorted.find(t => t.id === tabs.currentTab) ?? null;

  const renderSidebar = (): React.ReactNode => (
    <>
      {section.folderPath.length > 0 && (
        <div className="mb-2">
          <FolderBreadcrumb
            sectionLabel={scope === 'gm' ? 'Note del GM' : 'Note della Campagna'}
            path={section.folderPath}
            entityType={folderEntityType}
            dropTarget={section.dnd.dropTarget}
            onNavigate={section.setCurrentFolderId}
            compact
          />
        </div>
      )}
      <div className="space-y-1">
        {section.renderRows()}
        {currentViewEmpty && <div className="px-3 py-2 text-xs text-[var(--dash-muted)]">{emptyLabel}</div>}
      </div>
    </>
  );

  const renderDetail = (): React.ReactNode => {
    if (!selectedTab || !(canEdit || !selectedTab.hidden)) {
      return (
        <div className="flex h-full items-center justify-center text-sm text-[var(--dash-muted)]">
          Seleziona una nota dalla lista
        </div>
      );
    }
    return (
      <NoteSubTabs
        note={selectedTab}
        campaignId={campaignId}
        accessToken={accessToken}
        canEdit={canEdit}
        onMainContentChange={(content) => tabs.handleCustomTabContentChange(selectedTab.id, content)}
        onPersistSubTabOrder={(order) => tabs.handlePersistSubTabOrder(selectedTab.id, order)}
      />
    );
  };

  const renderDialogs = (): React.ReactNode => (
    <>
      {section.iconPickerFolder && (
        <FolderIconPicker
          selectedIconId={section.iconPickerFolder.icon}
          onSelect={section.selectFolderIcon}
          onClose={section.closeIconPicker}
        />
      )}
      {section.deleteFolderTarget && (
        <ConfirmDialog
          title="Eliminare questa cartella?"
          message={
            section.deleteFolderCascadeContent
              ? `"${section.deleteFolderTarget.name}" e tutto il suo contenuto verranno eliminati definitivamente. Questa azione non è reversibile.`
              : `"${section.deleteFolderTarget.name}" verrà eliminata. Le note al suo interno non vengono eliminate: torneranno semplicemente senza cartella.`
          }
          confirmLabel={section.deleteFolderCascadeContent ? 'Elimina tutto' : 'Elimina'}
          extraContent={section.deleteFolderContents && (
            <label className="flex items-start gap-2 text-sm text-[var(--dash-text)]">
              <input
                type="checkbox"
                checked={section.deleteFolderCascadeContent}
                onChange={(e) => section.setDeleteFolderCascadeContent(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Elimina anche il contenuto: {section.deleteFolderContents.itemCount} {section.itemLabel}
                {section.deleteFolderContents.folderCount > 0 && ` e ${section.deleteFolderContents.folderCount} sotto-cartell${section.deleteFolderContents.folderCount === 1 ? 'a' : 'e'}`}
                {' '}verranno eliminati definitivamente.
              </span>
            </label>
          )}
          onConfirm={section.confirmDeleteFolder}
          onCancel={section.cancelDeleteFolder}
        />
      )}
      {section.renderGhost()}
    </>
  );

  return {
    count: scopedTabsSorted.length,
    renderSidebar,
    renderDetail,
    renderDialogs,
    handleAddNote: () => tabs.handleAddCustomTab('Nuova nota', { hidden: scope === 'gm', folderId: section.currentFolderId }),
    handleCreateFolder: section.handleCreateFolder,
    createDisabledReason: section.createDisabledReason,
  };
}
