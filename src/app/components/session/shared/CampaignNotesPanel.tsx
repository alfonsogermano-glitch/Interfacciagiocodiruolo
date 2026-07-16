import { useEffect, useRef } from 'react';
import { StickyNote } from 'lucide-react';
import { EntityTabBar } from './EntityTabBar';
import { useEntityTabs } from './useEntityTabs';

interface CampaignNotesPanelProps {
  campaignId: string;
  accessToken: string | null | undefined;
  canEdit: boolean;
  savedTabOrder: string[] | undefined;
  onPersistTabOrder: (order: string[]) => void;
  className?: string;
}

export function CampaignNotesPanel({
  campaignId,
  accessToken,
  canEdit,
  savedTabOrder,
  onPersistTabOrder,
  className,
}: CampaignNotesPanelProps) {
  const tabs = useEntityTabs({
    entityType: 'campaign',
    entityId: campaignId,
    campaignId,
    accessToken,
    canEdit,
    baseTabs: [],
    savedTabOrder,
    onPersistTabOrder,
  });

  // Senza base tab, useEntityTabs non ha un default reale: il suo effetto
  // "tab sparita" resetta currentTab a '' subito dopo la creazione di una
  // tab (perche' tabOrder non si e' ancora aggiornato per includerla), prima
  // che handleAddCustomTab riesca a farla restare selezionata. Teniamo quindi
  // traccia dell'ultima tab comparsa in customTabs e, quando dobbiamo
  // scegliere un fallback, preferiamo quella invece della prima in ordine -
  // altrimenti il contenuto digitato subito dopo la creazione rischia di
  // salvarsi sulla tab sbagliata (riprodotto e verificato manualmente).
  const lastAddedIdRef = useRef<string | null>(null);
  const knownIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const tab of tabs.customTabs) {
      if (!knownIdsRef.current.has(tab.id)) lastAddedIdRef.current = tab.id;
    }
    knownIdsRef.current = new Set(tabs.customTabs.map(t => t.id));
  }, [tabs.customTabs]);

  useEffect(() => {
    if (tabs.currentTab || tabs.orderedTabs.length === 0) return;
    const preferred = lastAddedIdRef.current && tabs.orderedTabs.some(t => t.id === lastAddedIdRef.current)
      ? lastAddedIdRef.current
      : tabs.orderedTabs[0].id;
    tabs.setCurrentTab(preferred);
  }, [tabs.orderedTabs, tabs.currentTab]);

  const selectedTab = tabs.customTabs.find(t => t.id === tabs.currentTab) ?? null;

  return (
    <div className={className}>
      <EntityTabBar canEdit={canEdit} tabs={tabs} />
      {tabs.orderedTabs.length === 0 ? (
        <div className="flex h-32 items-center justify-center text-center text-sm text-[var(--dash-muted)]">
          <div>
            <StickyNote className="mx-auto mb-2 h-6 w-6 text-[var(--dash-border-soft)]" />
            Nessuna nota di campagna. {canEdit && 'Creane una per iniziare.'}
          </div>
        </div>
      ) : selectedTab && (canEdit || !selectedTab.hidden) ? (
        <textarea
          value={selectedTab.content}
          onChange={(e) => tabs.handleCustomTabContentChange(selectedTab.id, e.target.value)}
          disabled={!canEdit}
          placeholder="Scrivi qui..."
          className="h-48 w-full resize-none rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3 text-sm text-[var(--dash-text)] outline-none focus:border-[var(--dash-accent)] disabled:cursor-not-allowed disabled:opacity-70"
        />
      ) : null}
    </div>
  );
}
