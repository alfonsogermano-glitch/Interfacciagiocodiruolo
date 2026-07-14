import { useEffect, useState } from 'react';
import { Ghost, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useCampaign } from '../../campaigns/CampaignContext';
import { useRuleset } from '../../campaigns/RulesetContext';
import { RulesetBadge } from '../../campaigns/RulesetGate';
import { CAMPAIGN_STORAGE_KEYS } from '../../../services/campaign/campaignStorageKeys';
import { generateUUID } from '../../../lib/uuid';
import {
  loadNPCs, saveNPC, deleteNPC, loadAdventures,
  type NPC
} from '../../../services/supabase/entitiesService';
import type { Adventure } from '../../../types/adventure';
import { PALETTE_COLORS, DEFAULT_PALETTE_COLORS, type PaletteId } from '../ui/paletteColors';
import { EntityCard } from '../session/shared/EntityCard';
import { EntityKebabMenu } from '../session/shared/EntityKebabMenu';
import { EntityFilterToolbar, type SortMode, type ViewMode } from '../session/shared/EntityFilterToolbar';
import { EntityPagination, paginateItems } from '../session/shared/EntityPagination';
import { EntityDetailView } from '../session/shared/EntityDetailView';
import { ConfirmDialog } from '../shared/ConfirmDialog';

type NavigationTarget = {
  tabId: string;
  entityId?: string;
  entityType?: string;
};

interface NPCsManagerProps {
  navigationTarget?: NavigationTarget | null;
}

function getCurrentPaletteColors() {
  const el = document.querySelector('[data-dashboard-palette]');
  const palette = el?.getAttribute('data-dashboard-palette') as PaletteId | null;
  return palette && PALETTE_COLORS[palette] ? PALETTE_COLORS[palette] : DEFAULT_PALETTE_COLORS;
}

// Stesso pattern di ordinamento/ricerca gia' duplicato per-file in
// MyCharactersPage.tsx/MonstersManager.tsx - nessun modulo condiviso esiste
// per questo, e' orchestrazione specifica del contesto chiamante.
function sortNpcs(items: NPC[], mode: SortMode): NPC[] {
  const copy = [...items];
  if (mode === 'name') copy.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'it', { sensitivity: 'base' }));
  else if (mode === 'name-desc') copy.sort((a, b) => (b.name || '').localeCompare(a.name || '', 'it', { sensitivity: 'base' }));
  else if (mode === 'oldest') copy.sort((a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime());
  else if (mode === 'updated') copy.sort((a, b) => new Date(b.updatedAt ?? b.createdAt ?? 0).getTime() - new Date(a.updatedAt ?? a.createdAt ?? 0).getTime());
  else copy.sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
  return copy;
}

function searchNpcs(items: NPC[], query: string): NPC[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(npc =>
    [npc.name, npc.role, npc.description, npc.attacco, npc.difesa]
      .filter(Boolean)
      .some(value => String(value).toLowerCase().includes(q))
  );
}

function createEmptyNpcDraft(campaignId: string, ruleset: NPC['ruleset'], ownerProfileId?: string): NPC {
  return {
    id: generateUUID(),
    campaignId,
    ruleset,
    environmentId: null,
    adventureId: null,
    name: '',
    role: '',
    description: '',
    personality: '',
    secrets: '',
    location: '',
    portraitImageUrl: '',
    // Mai renderizzati da nessuna UI per i PNG in tutta la codebase (vedi
    // censimento) - inizializzati solo per completezza di tipo, nessuna
    // superficie di editing qui.
    mapLocationId: null,
    customLocationName: '',
    tratti: [],
    trattiPersonalizzati: [],
    azioniSpeciali: [],
    azioniSpecialiPersonalizzate: [],
    freschezza: null,
    maxFreschezza: null,
    caselleFrischezzaCruciali: [],
    attacco: '',
    difesa: '',
    puntoDebole: '',
    ownerProfileId
  };
}

export function NPCsManager({ navigationTarget = null }: NPCsManagerProps) {
  const { user, session } = useAuth();
  const { activeCampaignId, activeCampaign } = useCampaign();
  const { isHSC } = useRuleset();

  const [npcs, setNpcs] = useState<NPC[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [adventures, setAdventures] = useState<Adventure[]>([]);

  const [selectedNpcId, setSelectedNpcId] = useState<string | null>(null);
  const [draftNpc, setDraftNpc] = useState<NPC | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<NPC | null>(null);
  const [menuColors] = useState(() => getCurrentPaletteColors());

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>('recent');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  const [useActiveAdventureFilter, setUseActiveAdventureFilter] = useState(false);
  const [selectedAdventureFilterId, setSelectedAdventureFilterId] = useState('all');
  const [includeUnassignedInAdventureFilter, setIncludeUnassignedInAdventureFilter] = useState(false);
  const [activeAdventureId, setActiveAdventureId] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : window.localStorage.getItem(CAMPAIGN_STORAGE_KEYS.activeAdventure)
  );

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    loadNPCs(activeCampaignId)
      .then(list => { if (!cancelled) setNpcs(list); })
      .catch(err => console.error('Errore caricamento PNG:', err))
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [activeCampaignId]);

  useEffect(() => {
    let cancelled = false;
    loadAdventures(activeCampaignId)
      .then(list => { if (!cancelled) setAdventures(list); })
      .catch(err => console.error('Errore caricamento avventure:', err));
    return () => { cancelled = true; };
  }, [activeCampaignId]);

  useEffect(() => {
    const sync = () => setActiveAdventureId(window.localStorage.getItem(CAMPAIGN_STORAGE_KEYS.activeAdventure));
    sync();
    window.addEventListener('focus', sync);
    return () => window.removeEventListener('focus', sync);
  }, []);

  const effectiveAdventureFilterId = useActiveAdventureFilter
    ? activeAdventureId
    : selectedAdventureFilterId === 'all' ? null : selectedAdventureFilterId;
  const isFilteringSpecificAdventure = effectiveAdventureFilterId !== null;

  useEffect(() => {
    if (!isFilteringSpecificAdventure) setIncludeUnassignedInAdventureFilter(false);
  }, [isFilteringSpecificAdventure]);

  useEffect(() => {
    if (navigationTarget?.tabId !== 'npcs') return;
    if (navigationTarget.entityType !== 'npc') return;
    if (!navigationTarget.entityId) return;

    const target = npcs.find(npc => npc.id === navigationTarget.entityId);
    if (!target) return;

    setDraftNpc(null);
    setSelectedNpcId(target.id);
  }, [navigationTarget, npcs]);

  const adventureFilteredNpcs = npcs.filter(npc => {
    if (!effectiveAdventureFilterId) return true;
    if (npc.adventureId === effectiveAdventureFilterId) return true;
    if (includeUnassignedInAdventureFilter && npc.adventureId == null) return true;
    return false;
  });

  const filteredNpcs = sortNpcs(searchNpcs(adventureFilteredNpcs, search), sort);
  const { pageItems, totalPages, safePage, startIndex, endIndex } = paginateItems(filteredNpcs, page, pageSize);

  useEffect(() => {
    setPage(1);
  }, [search, sort, pageSize, effectiveAdventureFilterId, includeUnassignedInAdventureFilter]);

  const selectedNpc: NPC | null = selectedNpcId
    ? npcs.find(npc => npc.id === selectedNpcId) ?? (draftNpc?.id === selectedNpcId ? draftNpc : null)
    : null;
  const isViewingDraft = !!draftNpc && selectedNpcId === draftNpc.id;

  const handleAddNpc = () => {
    const draft = createEmptyNpcDraft(activeCampaignId, activeCampaign?.ruleset ?? null, user?.id);
    setDraftNpc(draft);
    setSelectedNpcId(draft.id);
  };

  const handleSelectNpc = (id: string) => {
    setDraftNpc(null);
    setSelectedNpcId(id);
  };

  // Finche' la bozza non ha un nome resta solo in stato locale (nessuna
  // scrittura su Supabase). Alla prima modifica con nome non vuoto viene
  // "promossa": entra in npcs e si salva - stesso pattern di
  // MyCharactersPage.tsx (handleNpcDetailUpdate), qui scoped alla campagna
  // attiva invece che al proprietario.
  const handleNpcUpdate = (updated: NPC) => {
    if (draftNpc && updated.id === draftNpc.id) {
      if (!updated.name.trim()) {
        setDraftNpc(updated);
        return;
      }
      setDraftNpc(null);
      setNpcs(prev => [...prev, updated]);
      saveNPC(activeCampaignId, updated).catch(err => console.error('Errore salvataggio PNG:', err));
      return;
    }

    setNpcs(prev => prev.map(npc => (npc.id === updated.id ? updated : npc)));
    saveNPC(activeCampaignId, updated).catch(err => console.error('Errore salvataggio PNG:', err));
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteNPC(deleteTarget.id);
      setNpcs(prev => prev.filter(npc => npc.id !== deleteTarget.id));
      if (selectedNpcId === deleteTarget.id) setSelectedNpcId(null);
    } catch (err) {
      console.error('Errore eliminazione PNG:', err);
    } finally {
      setDeleteTarget(null);
    }
  };

  const activeAdventureTitle = adventures.find(adventure => adventure.id === activeAdventureId)?.title ?? null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-1">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center text-[var(--dash-text)]">
            PNG<RulesetBadge className="ml-2" />
          </h2>

          <button
            type="button"
            onClick={handleAddNpc}
            title="Crea un nuovo PNG"
            className="rounded-lg border-2 border-[var(--dash-border)] bg-[var(--dash-border)] p-2 text-[var(--dash-text)] transition-colors hover:bg-[var(--dash-border)]"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>

        <EntityFilterToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Cerca PNG..."
          sort={sort}
          onSortChange={setSort}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          filtersOpen={filtersOpen}
          onToggleFilters={() => setFiltersOpen(v => !v)}
          filtersPanel={
            <div className="space-y-3">
              <div>
                <label className="mb-2 block text-sm text-[var(--dash-text-strong)]">Filtro narrativo</label>
                <select
                  value={selectedAdventureFilterId}
                  onChange={e => setSelectedAdventureFilterId(e.target.value)}
                  disabled={useActiveAdventureFilter}
                  className="w-full rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text)] disabled:opacity-50"
                >
                  <option value="all">Tutta la campagna</option>
                  {adventures.map(adventure => (
                    <option key={adventure.id} value={adventure.id}>{adventure.title}</option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-3 text-sm text-[var(--dash-text-strong)]">
                <input
                  type="checkbox"
                  checked={useActiveAdventureFilter}
                  onChange={e => setUseActiveAdventureFilter(e.target.checked)}
                  className="h-4 w-4 accent-[var(--dash-accent)]"
                />
                Usa automaticamente l'avventura attiva
              </label>

              <label
                className={`flex items-center gap-3 text-sm ${
                  isFilteringSpecificAdventure ? 'text-[var(--dash-text-strong)]' : 'text-[var(--dash-muted)]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={includeUnassignedInAdventureFilter}
                  onChange={e => setIncludeUnassignedInAdventureFilter(e.target.checked)}
                  disabled={!isFilteringSpecificAdventure}
                  className="h-4 w-4 accent-[var(--dash-accent)]"
                />
                Mostra anche i PNG non assegnati ad alcuna avventura
              </label>

              <div className="text-xs text-[var(--dash-muted)]">
                {useActiveAdventureFilter
                  ? activeAdventureTitle
                    ? includeUnassignedInAdventureFilter
                      ? `Filtro attivo: avventura corrente (${activeAdventureTitle}) + PNG non assegnati`
                      : `Filtro attivo: avventura corrente (${activeAdventureTitle})`
                    : 'Filtro attivo: nessuna avventura attiva selezionata'
                  : selectedAdventureFilterId === 'all'
                    ? 'Filtro attivo: tutta la campagna'
                    : includeUnassignedInAdventureFilter
                      ? `Filtro attivo: ${adventures.find(a => a.id === selectedAdventureFilterId)?.title ?? 'Avventura'} + PNG non assegnati`
                      : `Filtro attivo: ${adventures.find(a => a.id === selectedAdventureFilterId)?.title ?? 'Avventura'}`}
              </div>
            </div>
          }
        />

        {isLoading ? (
          <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] px-5 py-8 text-center text-sm text-[var(--dash-muted)]">
            Caricamento PNG...
          </div>
        ) : filteredNpcs.length === 0 ? (
          <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] px-5 py-8 text-center">
            <Ghost className="mx-auto mb-3 h-10 w-10 text-[var(--dash-muted)]" />
            <div className="text-xs uppercase tracking-[0.16em] text-[var(--dash-accent-2)]">
              {npcs.length === 0 ? 'Nessun PNG in questa campagna' : 'Nessun PNG corrisponde ai filtri'}
            </div>
          </div>
        ) : (
          <>
            <div className={viewMode === 'list' ? 'space-y-2' : 'grid gap-3 sm:grid-cols-2'}>
              {pageItems.map(npc => (
                <EntityCard
                  key={npc.id}
                  variant={viewMode}
                  name={npc.name || 'PNG senza nome'}
                  subtitle={npc.role || 'PNG'}
                  photoUrl={npc.portraitImageUrl}
                  photoSourceUrl={npc.portraitSourceImageUrl}
                  photoCropArea={npc.portraitCropArea}
                  tokenColor={npc.tokenColor}
                  tokenBackgroundColor={npc.tokenBackgroundColor}
                  tokenBorderStyle={npc.tokenBorderStyle}
                  tokenBorderThickness={npc.tokenBorderThickness}
                  tokenBorderVisible={npc.tokenBorderVisible}
                  tokenBorderLabel={npc.tokenBorderLabel}
                  onClick={() => handleSelectNpc(npc.id)}
                />
              ))}
            </div>

            <EntityPagination
              page={safePage}
              onPageChange={setPage}
              pageSize={pageSize}
              onPageSizeChange={setPageSize}
              totalPages={totalPages}
              startIndex={startIndex}
              endIndex={endIndex}
              totalItems={filteredNpcs.length}
              itemLabelPlural="PNG"
            />
          </>
        )}
      </div>

      <div className="lg:col-span-2">
        {selectedNpc ? (
          <>
            {isViewingDraft && !selectedNpc.name.trim() && (
              <div className="mb-4 rounded-lg border border-[var(--dash-accent)] bg-[var(--dash-panel)] px-3 py-2 text-xs text-[var(--dash-text)]">
                Bozza non salvata — verrà salvata automaticamente non appena inserisci un nome.
              </div>
            )}
            <EntityDetailView
              entityType="npc"
              entity={selectedNpc}
              onUpdate={handleNpcUpdate}
              canEdit
              campaignId={activeCampaignId}
              accessToken={session?.access_token}
              isHSC={isHSC}
              draggable={false}
              showRail
              isDraft={isViewingDraft}
              headerAction={
                !isViewingDraft ? (
                  <EntityKebabMenu
                    colors={menuColors}
                    items={[
                      {
                        key: 'delete',
                        icon: <Trash2 className="h-4 w-4" />,
                        label: 'Elimina PNG',
                        onClick: () => setDeleteTarget(selectedNpc),
                        danger: true
                      }
                    ]}
                  />
                ) : undefined
              }
            />
          </>
        ) : (
          <div className="flex h-full min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-[var(--dash-border-soft)] bg-[var(--dash-surface)]/60 text-center">
            <div>
              <Ghost className="mx-auto mb-3 h-10 w-10 text-[var(--dash-muted)]" />
              <p className="text-sm text-[var(--dash-muted)]">Seleziona un PNG dalla lista, o creane uno nuovo.</p>
            </div>
          </div>
        )}
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title={`Eliminare definitivamente ${deleteTarget.name || 'questo PNG'}?`}
          message="Questa azione non può essere annullata."
          confirmLabel="Elimina definitivamente"
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
