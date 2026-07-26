import { useEntityTabs, type EntityCustomTab } from './useEntityTabs';
import { EntityTabBar } from './EntityTabBar';

interface NoteSubTabsProps {
  /** La nota "contenitore" selezionata nella barra di livello superiore
   *  (CampaignNotesPanel.tsx) - la pillola fissa "Principale" qui sotto
   *  legge/scrive il SUO content, non una riga entity_notes separata. */
  note: EntityCustomTab;
  campaignId: string | null;
  accessToken: string | null | undefined;
  canEdit: boolean;
  /** Edita note.content (pillola "Principale") - il chiamante lo inoltra
   *  tipicamente a tabs.handleCustomTabContentChange(note.id, content)
   *  della barra di livello superiore, stessa funzione gia' in uso prima
   *  dell'introduzione delle sotto-tab. */
  onMainContentChange: (content: string) => void;
  /** Persiste l'ordine delle sotto-tab sulla riga di `note` - il chiamante
   *  lo inoltra tipicamente a tabs.handlePersistSubTabOrder(note.id, order). */
  onPersistSubTabOrder: (order: string[]) => void;
}

/**
 * Ogni nota e' a sua volta un contenitore: una pillola fissa "Principale"
 * (legata al content esistente della nota, zero migrazione) piu' sotto-tab
 * create dall'utente (righe entity_notes con entity_type='note', entity_id=
 * note.id - vedi supabase-add-note-subtabs.sql). Profondita' fissa a 2
 * livelli: una sotto-tab e' sempre una foglia con una semplice textarea, mai
 * un altro NoteSubTabs annidato - niente cartelle qui dentro (EntityTabBar
 * senza `folders`).
 */
export function NoteSubTabs({ note, campaignId, accessToken, canEdit, onMainContentChange, onPersistSubTabOrder }: NoteSubTabsProps) {
  const nestedTabs = useEntityTabs({
    entityType: 'note',
    entityId: note.id,
    campaignId,
    accessToken,
    canEdit,
    baseTabs: [{ id: 'main', label: 'Principale' }],
    savedTabOrder: note.tab_order ?? undefined,
    onPersistTabOrder: onPersistSubTabOrder,
  });

  const selectedSubTab = nestedTabs.customTabs.find(t => t.id === nestedTabs.currentTab) ?? null;

  return (
    <div>
      <EntityTabBar canEdit={canEdit} tabs={nestedTabs} />

      {nestedTabs.currentTab === 'main' ? (
        <textarea
          value={note.content}
          onChange={(e) => onMainContentChange(e.target.value)}
          disabled={!canEdit}
          placeholder="Scrivi qui..."
          className="h-48 w-full resize-none rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3 text-sm text-[var(--dash-text)] outline-none focus:border-[var(--dash-accent)] disabled:cursor-not-allowed disabled:opacity-70"
        />
      ) : selectedSubTab && (canEdit || !selectedSubTab.hidden) ? (
        <textarea
          value={selectedSubTab.content}
          onChange={(e) => nestedTabs.handleCustomTabContentChange(selectedSubTab.id, e.target.value)}
          disabled={!canEdit}
          placeholder="Scrivi qui..."
          className="h-48 w-full resize-none rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3 text-sm text-[var(--dash-text)] outline-none focus:border-[var(--dash-accent)] disabled:cursor-not-allowed disabled:opacity-70"
        />
      ) : null}
    </div>
  );
}
