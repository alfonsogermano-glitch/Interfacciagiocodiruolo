import { useEffect, useRef, useState } from 'react';
import { StickyNote, FolderPlus } from 'lucide-react';
import { EntityTabBar } from './EntityTabBar';
import { useEntityTabs } from './useEntityTabs';
import { useFolderSection } from '../../shared/useFolderSection';
import { FolderBreadcrumb } from '../../shared/FolderBreadcrumb';
import { FolderIconPicker } from '../../shared/FolderIconPicker';
import { ConfirmDialog } from '../../shared/ConfirmDialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/tooltip';
import { PALETTE_COLORS, DEFAULT_PALETTE_COLORS, type PaletteId } from '../../ui/paletteColors';

function getCurrentPaletteColors() {
  const el = document.querySelector('[data-dashboard-palette]');
  const palette = el?.getAttribute('data-dashboard-palette') as PaletteId | null;
  return palette && PALETTE_COLORS[palette] ? PALETTE_COLORS[palette] : DEFAULT_PALETTE_COLORS;
}

interface CampaignNotesPanelProps {
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
  className?: string;
}

export function CampaignNotesPanel({
  campaignId,
  sessionKey,
  accessToken,
  canEdit,
  scope,
  savedTabOrder,
  onPersistTabOrder,
  className,
}: CampaignNotesPanelProps) {
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
  });

  // Le due sezioni (GM/Campagna) sono la STESSA tabella filtrata sul posto -
  // ogni istanza di questo componente fa il proprio fetch completo (via
  // useEntityTabs sopra) e si scarta lato client cio' che non le appartiene.
  // Duplica il fetch tra le due istanze montate in SessionNotesPanel.tsx, ma
  // il volume di note di campagna e' talmente piccolo che non vale la pena
  // di un parametro server dedicato solo per evitarlo.
  const scopedTabs = tabs.customTabs.filter(t => t.hidden === (scope === 'gm'));

  const folderEntityType = scope === 'gm' ? 'gmnotes' : 'campaignnotes';

  const section = useFolderSection({
    entityType: folderEntityType,
    campaignId,
    sessionKey,
    accessToken: accessToken ?? null,
    canEdit,
    enabled: true,
    // Solo per conteggi/validazione cartella (countFolderContentsRecursive,
    // resolveFolderDropTarget) - renderCard/renderGhostCard sotto non
    // disegnano nulla per questi item: le note restano visibili come
    // pillole in EntityTabBar sotto, filtrate alla cartella corrente
    // (visibleCustomTabIds), non come righe qui. Spostare una nota di
    // cartella si fa dal menu ⋮ della pillola ("Muovi in cartella..."), non
    // trascinandola qui - le cartelle di note servono a navigare/contare,
    // non a un secondo drag-and-drop parallelo a quello (gia' complesso) di
    // useEntityTabs per il riordino delle pillole.
    items: scopedTabs.map(t => ({ id: t.id, folderId: t.folder_id })),
    renderCard: () => null,
    renderGhostCard: () => null,
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

  // TEMP DEBUG - rimuovere dopo la diagnosi
  console.log('[TEMP CampaignNotesPanel render]', 'instance=', (tabs as any).__debugInstanceId, 'scope=', scope, 'tabs.customTabs.length=', tabs.customTabs.length);

  const visibleCustomTabIds = new Set(
    scopedTabs.filter(t => (t.folder_id ?? null) === section.currentFolderId).map(t => t.id)
  );

  // Naviga in un'altra cartella: se la nota attualmente aperta non e' tra
  // quelle visibili qui, sgancia la selezione - senza questo, il contenuto
  // di una nota di un'altra cartella resterebbe mostrato sotto anche se la
  // sua pillola e' sparita dalla barra (useEntityTabs non sa nulla del
  // filtro per cartella, e' tutto interno a questo componente).
  useEffect(() => {
    if (tabs.currentTab && !visibleCustomTabIds.has(tabs.currentTab)) {
      tabs.setCurrentTab('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section.currentFolderId]);

  // Selezione di fallback (nessuna tab attiva) - stesso schema di prima
  // della suddivisione GM/Campagna: preferisce l'ultima nota comparsa nella
  // cartella corrente, altrimenti la prima - vedi il commento originale
  // sotto per il perche' (currentTab resettato a '' subito dopo la
  // creazione, prima che tabOrder si aggiorni per includerla).
  const lastAddedIdRef = useRef<string | null>(null);
  const knownIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const tab of scopedTabs) {
      if (!knownIdsRef.current.has(tab.id)) lastAddedIdRef.current = tab.id;
    }
    knownIdsRef.current = new Set(scopedTabs.map(t => t.id));
  }, [scopedTabs]);

  useEffect(() => {
    if (tabs.currentTab || visibleCustomTabIds.size === 0) return;
    const visibleIds = [...visibleCustomTabIds];
    const preferred = lastAddedIdRef.current && visibleCustomTabIds.has(lastAddedIdRef.current)
      ? lastAddedIdRef.current
      : visibleIds[0];
    tabs.setCurrentTab(preferred);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleCustomTabIds.size, section.currentFolderId, tabs.currentTab]);

  const selectedTab = scopedTabs.find(t => t.id === tabs.currentTab) ?? null;
  const folderName = scope === 'gm' ? 'Note del GM' : 'Note della Campagna';
  const emptyLabel = scope === 'gm' ? 'Nessuna nota del GM.' : 'Nessuna nota di campagna.';

  return (
    <div className={className}>
      {section.folderPath.length > 0 && (
        <div className="mb-2">
          <FolderBreadcrumb
            sectionLabel={folderName}
            path={section.folderPath}
            entityType={folderEntityType}
            dropTarget={section.dnd.dropTarget}
            onNavigate={section.setCurrentFolderId}
            compact
          />
        </div>
      )}

      <div className="space-y-1 mb-2">{section.renderRows()}</div>

      <EntityTabBar
        canEdit={canEdit}
        tabs={tabs}
        visibleCustomTabIds={visibleCustomTabIds}
        onAddTab={() => tabs.handleAddCustomTab('Nuova nota', { hidden: scope === 'gm', folderId: section.currentFolderId })}
        folders={section.folders.map(f => ({ id: f.id, name: f.name }))}
        headerAction={canEdit ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={section.handleCreateFolder}
                disabled={section.createDisabledReason !== null}
                aria-label="Nuova cartella"
                className={`flex shrink-0 items-center rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-1.5 text-[var(--dash-muted)] transition-colors ${
                  section.createDisabledReason !== null ? 'cursor-not-allowed opacity-40' : 'hover:text-[var(--dash-text-strong)]'
                }`}
              >
                <FolderPlus className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left">{section.createDisabledReason ?? 'Nuova cartella'}</TooltipContent>
          </Tooltip>
        ) : undefined}
      />

      {visibleCustomTabIds.size === 0 ? (
        <div className="flex h-32 items-center justify-center text-center text-sm text-[var(--dash-muted)]">
          <div>
            <StickyNote className="mx-auto mb-2 h-6 w-6 text-[var(--dash-border-soft)]" />
            {emptyLabel} {canEdit && 'Creane una per iniziare.'}
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
    </div>
  );
}
