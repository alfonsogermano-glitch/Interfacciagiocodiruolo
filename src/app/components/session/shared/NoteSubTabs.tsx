import { Plus, StickyNote } from 'lucide-react';
import { useEntityTabs, type EntityCustomTab } from './useEntityTabs';
import { EntityTabBar } from './EntityTabBar';
import { RichTextEditor } from './RichTextEditor';

interface NoteSubTabsProps {
  /** La nota "contenitore" selezionata nella lista di livello superiore
   *  (useCampaignNotesSection.tsx). Il suo campo `content` non e' piu' letto
   *  ne' scritto qui (vedi il commento sotto) - serve solo come chiave
   *  (note.id) per le sotto-tab. */
  note: EntityCustomTab;
  campaignId: string | null;
  accessToken: string | null | undefined;
  canEdit: boolean;
  /** Persiste l'ordine delle sotto-tab sulla riga di `note` - il chiamante
   *  lo inoltra tipicamente a tabs.handlePersistSubTabOrder(note.id, order). */
  onPersistSubTabOrder: (order: string[]) => void;
}

/**
 * Ogni nota e' un contenitore puro di sotto-tab: nessuna pillola/area di
 * testo fissa legata al content della nota stessa (rimossa la "Principale"
 * di una versione precedente). Stato vuoto (nessuna sotto-tab): solo un
 * prompt con pulsante per crearne la prima, MAI un'area di testo scrivibile
 * finche' non ne esiste almeno una. Una sotto-tab e' sempre una foglia con
 * una semplice textarea, mai un altro NoteSubTabs annidato (profondita'
 * fissa a 2 livelli, righe entity_notes con entity_type='note', entity_id=
 * note.id - vedi supabase-add-note-subtabs.sql).
 *
 * DEBITO NOTO: entity_notes.content sulla riga della nota padre (`note`
 * sopra) non e' piu' letto ne' scritto da nessuna UI dopo questa modifica -
 * nessuna migrazione eseguita (disciplina "nessuna migrazione distruttiva"
 * seguita in tutta questa sessione): il testo scritto li' prima
 * dell'introduzione delle sotto-tab resta nel DB, semplicemente orfano. Se
 * in futuro serve recuperarlo, va migrato esplicitamente (es. copiato in una
 * prima sotto-tab "Importata") prima di considerare la colonna sicura da
 * ignorare per sempre.
 */
export function NoteSubTabs({ note, campaignId, accessToken, canEdit, onPersistSubTabOrder }: NoteSubTabsProps) {
  const nestedTabs = useEntityTabs({
    entityType: 'note',
    entityId: note.id,
    campaignId,
    accessToken,
    canEdit,
    baseTabs: [],
    savedTabOrder: note.tab_order ?? undefined,
    onPersistTabOrder: onPersistSubTabOrder,
  });

  const selectedSubTab = nestedTabs.customTabs.find(t => t.id === nestedTabs.currentTab) ?? null;

  if (nestedTabs.customTabs.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-center text-sm text-[var(--dash-muted)]">
        <div>
          <StickyNote className="mx-auto mb-2 h-6 w-6 text-[var(--dash-border-soft)]" />
          Nessuna sotto-tab.
          {canEdit && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => nestedTabs.handleAddCustomTab()}
                className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-[var(--dash-border-soft)] px-3 py-1.5 text-sm text-[var(--dash-muted)] transition-colors hover:border-[var(--dash-accent)] hover:text-[var(--dash-text)]"
              >
                <Plus className="h-3.5 w-3.5" /> Crea la prima sotto-tab
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <EntityTabBar
        canEdit={canEdit}
        tabs={nestedTabs}
        deleteConfirmMessage={(tabName) => `"${tabName}" verrà spostata nel Cestino - potrai ripristinarla in seguito.`}
        deleteConfirmTitle="Spostare questa tab nel cestino?"
        deleteConfirmLabel="Sposta nel cestino"
        deleteMenuLabel="Sposta nel cestino"
      />

      {selectedSubTab && (canEdit || !selectedSubTab.hidden) ? (
        <RichTextEditor
          // key per-sotto-tab: senza, il cambio di sotto-tab riusava la
          // stessa istanza (solo richContent/legacyContent cambiavano via
          // props), quindi isEditing/lo stato del segnale di auto-focus
          // sotto non venivano mai riletti al cambio - stesso pattern di
          // remount gia' usato per le tab in EntityDetailView.tsx
          // (RichTextEditor key={tab.id} li').
          key={selectedSubTab.id}
          legacyContent={selectedSubTab.content}
          richContent={selectedSubTab.content_rich}
          onChangeRich={(json) => nestedTabs.handleCustomTabRichContentChange(selectedSubTab.id, json)}
          disabled={!canEdit}
          placeholder="Scrivi qui..."
          autoFocusOnSelect={nestedTabs.pendingFocusTabId === selectedSubTab.id}
          onAutoFocusConsumed={() => nestedTabs.clearPendingFocusTab(selectedSubTab.id)}
        />
      ) : null}
    </>
  );
}