import { useEffect, useRef, useState } from 'react';
import { Swords, Plus, Trash2, MapPin } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useCampaign } from '../../campaigns/CampaignContext';
import { useRuleset } from '../../campaigns/RulesetContext';
import { RulesetBadge } from '../../campaigns/RulesetGate';
import { loadEnvironmentReferences } from '../../../services/campaign/entityReferenceService';
import { formatCampaignAdventureLabel } from '../../../services/campaign/campaignAdventureLabel';
import { MONSTER_BASE_CATALOG } from '../../../data/monsterBaseCatalog';
import { loadMonsters, saveMonster, deleteMonster, loadAdventures } from '../../../services/supabase/entitiesService';
import type { Adventure } from '../../../types/adventure';
import type { Monster, MonstersManagerProps, NavigationTarget, EnvironmentSummary } from './monsters/monstersTypes';
import {
  createEmptyMonster,
  createMonsterFromBase,
  normalizeMonster,
  mergeEnvironmentReferencesWithStoredDetails,
  readStoredEnvironmentSummaries,
  clampMonsterAudacia
} from './monsters/monstersUtils';
import { PALETTE_COLORS, DEFAULT_PALETTE_COLORS, type PaletteId } from '../ui/paletteColors';
import { EntityCard } from '../session/shared/EntityCard';
import { EntityKebabMenu } from '../session/shared/EntityKebabMenu';
import { EntityFilterToolbar, type SortMode, type ViewMode } from '../session/shared/EntityFilterToolbar';
import { EntityPagination, paginateItems } from '../session/shared/EntityPagination';
import { EntityDetailView } from '../session/shared/EntityDetailView';
import { ConfirmDialog } from '../shared/ConfirmDialog';

function getCurrentPaletteColors() {
  const el = document.querySelector('[data-dashboard-palette]');
  const palette = el?.getAttribute('data-dashboard-palette') as PaletteId | null;
  return palette && PALETTE_COLORS[palette] ? PALETTE_COLORS[palette] : DEFAULT_PALETTE_COLORS;
}

// Stesso pattern di ordinamento/ricerca duplicato per-file di NPCsManager.tsx.
function sortMonsters(items: Monster[], mode: SortMode): Monster[] {
  const copy = [...items];
  if (mode === 'name') copy.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'it', { sensitivity: 'base' }));
  else if (mode === 'name-desc') copy.sort((a, b) => (b.name || '').localeCompare(a.name || '', 'it', { sensitivity: 'base' }));
  else if (mode === 'oldest') copy.sort((a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime());
  else if (mode === 'updated') copy.sort((a, b) => new Date(b.updatedAt ?? b.createdAt ?? 0).getTime() - new Date(a.updatedAt ?? a.createdAt ?? 0).getTime());
  else copy.sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
  return copy;
}

function searchMonsters(items: Monster[], query: string): Monster[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(monster =>
    [monster.name, monster.description, monster.attacco, monster.difesa]
      .filter(Boolean)
      .some(value => String(value).toLowerCase().includes(q))
  );
}

export function MonstersManager({ navigationTarget = null, onNavigate }: MonstersManagerProps) {
  const { user, session } = useAuth();
  const { activeCampaignId, activeCampaign } = useCampaign();
  const { isHSC } = useRuleset();

  const [monsters, setMonsters] = useState<Monster[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [adventures, setAdventures] = useState<Adventure[]>([]);
  const [environments, setEnvironments] = useState<EnvironmentSummary[]>([]);

  const [selectedMonsterId, setSelectedMonsterId] = useState<string | null>(null);
  const [draftMonster, setDraftMonster] = useState<Monster | null>(null);
  const [baseMonsterIdToCreate, setBaseMonsterIdToCreate] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Monster | null>(null);
  const [menuColors] = useState(() => getCurrentPaletteColors());
  const handledNavigationTargetRef = useRef<string | null>(null);

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>('recent');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  const [archiveQuickFilter, setArchiveQuickFilter] = useState<'all' | 'campaign' | 'unassigned'>('all');
  const [narrativeFilter, setNarrativeFilter] = useState('all');

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    loadMonsters(activeCampaignId)
      .then(list => { if (!cancelled) setMonsters(list.map(monster => normalizeMonster(monster))); })
      .catch(err => console.error('Errore caricamento mostri:', err))
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
    let cancelled = false;
    loadEnvironmentReferences(activeCampaignId)
      .then(references => {
        if (cancelled) return;
        setEnvironments(mergeEnvironmentReferencesWithStoredDetails(references, readStoredEnvironmentSummaries(activeCampaignId)));
      })
      .catch(err => console.error('Errore caricamento luoghi:', err));
    return () => { cancelled = true; };
  }, [activeCampaignId]);

  useEffect(() => {
    if (navigationTarget?.tabId !== 'monsters') return;
    if (navigationTarget.entityType !== 'monster') return;
    if (!navigationTarget.entityId) return;

    const navigationKey = `${navigationTarget.tabId}:${navigationTarget.entityType}:${navigationTarget.entityId}`;
    if (handledNavigationTargetRef.current === navigationKey) return;

    const target = monsters.find(monster => monster.id === navigationTarget.entityId);
    if (!target) return;

    handledNavigationTargetRef.current = navigationKey;
    setDraftMonster(null);
    setSelectedMonsterId(target.id);
  }, [navigationTarget, monsters]);

  // Risale la catena parentLocationId per costruire un percorso leggibile
  // ("Regione - Zona - Stanza") - stessa logica di getEnvironmentPath nel
  // vecchio MonstersManager.tsx, qui chiusura sullo stato locale environments.
  const getEnvironmentPath = (environmentId?: string | null): string => {
    if (!environmentId) return '';

    const visited = new Set<string>();
    const path: string[] = [];
    let current = environments.find(environment => environment.id === environmentId);

    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      path.unshift(current.name || 'Luogo senza nome');
      if (!current.parentLocationId) break;
      current = environments.find(environment => environment.id === current?.parentLocationId);
    }

    return path.join(' - ');
  };

  const handleLinkedEntityNavigate = (target: NavigationTarget) => {
    if (onNavigate) {
      onNavigate(target);
      return;
    }

    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('hsc-dashboard-navigate', { detail: target }));
    window.dispatchEvent(new CustomEvent('dashboard:navigate', { detail: target }));
  };

  const selectedMonster: Monster | null = selectedMonsterId
    ? monsters.find(monster => monster.id === selectedMonsterId) ?? (draftMonster?.id === selectedMonsterId ? draftMonster : null)
    : null;
  const isViewingDraft = !!draftMonster && selectedMonsterId === draftMonster.id;

  const handleAddMonster = () => {
    const draft = createEmptyMonster(activeCampaignId, user?.id, activeCampaign?.ruleset ?? undefined);
    setDraftMonster(draft);
    setSelectedMonsterId(draft.id);
    setBaseMonsterIdToCreate('');
  };

  const handleSelectBaseMonster = (baseId: string) => {
    setBaseMonsterIdToCreate(baseId);
    if (!baseId || !draftMonster) return;

    const base = createMonsterFromBase(baseId, activeCampaignId, user?.id);
    if (!base) return;

    // L'id/createdAt restano quelli della bozza corrente (non quelli nuovi
    // generati da createMonsterFromBase) per non disallineare selectedMonsterId.
    setDraftMonster({
      ...base,
      id: draftMonster.id,
      createdAt: draftMonster.createdAt,
      name: draftMonster.name.trim() || base.name
    });
  };

  const handleSelectMonster = (id: string) => {
    setDraftMonster(null);
    setSelectedMonsterId(id);
  };

  // Bozza promossa al primo nome non vuoto - stesso pattern di
  // NPCsManager.tsx, scoped alla campagna attiva invece che al proprietario.
  const handleMonsterUpdate = (updated: Monster) => {
    if (draftMonster && updated.id === draftMonster.id) {
      // Bozza: resta solo in stato locale finche' non si preme "Crea Mostro"
      // esplicitamente (handleConfirmCreateMonster) - nessuna promozione
      // automatica al primo carattere digitato nel nome.
      setDraftMonster(updated);
      return;
    }

    const normalized = normalizeMonster({ ...updated, campaignId: activeCampaignId, updatedAt: new Date().toISOString() });
    setMonsters(prev => prev.map(monster => (monster.id === normalized.id ? normalized : monster)));
    saveMonster(activeCampaignId, normalized).catch(err => console.error('Errore salvataggio mostro:', err));
  };

  const handleConfirmCreateMonster = () => {
    if (!draftMonster || !draftMonster.name.trim()) return;

    const normalized = normalizeMonster({ ...draftMonster, campaignId: activeCampaignId });
    setDraftMonster(null);
    setBaseMonsterIdToCreate('');
    setMonsters(prev => [...prev, normalized]);
    setSelectedMonsterId(normalized.id);
    saveMonster(activeCampaignId, normalized).catch(err => console.error('Errore salvataggio mostro:', err));
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMonster(deleteTarget.id);
      setMonsters(prev => prev.filter(monster => monster.id !== deleteTarget.id));
      if (selectedMonsterId === deleteTarget.id) setSelectedMonsterId(null);
    } catch (err) {
      console.error('Errore eliminazione mostro:', err);
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleSpendAudacia = () => {
    if (!selectedMonster) return;
    handleMonsterUpdate({ ...selectedMonster, audacia: clampMonsterAudacia(selectedMonster, (selectedMonster.audacia ?? 0) - 1) });
  };

  const narrativeFilteredMonsters = narrativeFilter === 'all'
    ? monsters.filter(monster => monster.campaignId === activeCampaignId)
    : monsters.filter(monster => monster.adventureId === narrativeFilter);

  const quickFilteredMonsters = narrativeFilteredMonsters.filter(monster => {
    if (archiveQuickFilter === 'campaign') return Boolean(monster.adventureId || monster.environmentId);
    if (archiveQuickFilter === 'unassigned') return !monster.adventureId && !monster.environmentId;
    return true;
  });

  const filteredMonsters = sortMonsters(searchMonsters(quickFilteredMonsters, search), sort);
  const { pageItems, totalPages, safePage, startIndex, endIndex } = paginateItems(filteredMonsters, page, pageSize);

  useEffect(() => {
    setPage(1);
  }, [search, sort, pageSize, archiveQuickFilter, narrativeFilter]);

  const renderLuogoBadge = (monster: Monster) =>
    monster.environmentId ? (
      <button
        type="button"
        onClick={event => {
          event.preventDefault();
          event.stopPropagation();
          handleLinkedEntityNavigate({ tabId: 'environments', entityId: monster.environmentId ?? undefined, entityType: 'environment' });
        }}
        title={getEnvironmentPath(monster.environmentId) || 'Luogo non trovato'}
        className="inline-flex max-w-[200px] items-center gap-1 truncate rounded-md border border-[var(--dash-accent)] bg-[var(--dash-panel)] px-2 py-0.5 text-[10px] font-semibold text-[var(--dash-text-strong)] transition-colors hover:border-[var(--dash-accent-2)] hover:text-[var(--dash-accent-2)]"
      >
        <MapPin className="h-3 w-3 shrink-0" />
        <span className="truncate">{getEnvironmentPath(monster.environmentId) || 'Luogo non trovato'}</span>
      </button>
    ) : null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-1">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center text-[var(--dash-text)]">
            Mostri<RulesetBadge className="ml-2" />
          </h2>

          <button
            type="button"
            onClick={handleAddMonster}
            title="Crea un nuovo mostro"
            className="rounded-lg border-2 border-[var(--dash-border)] bg-[var(--dash-border)] p-2 text-[var(--dash-text)] transition-colors hover:bg-[var(--dash-border)]"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>

        <EntityFilterToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Cerca mostri..."
          sort={sort}
          onSortChange={setSort}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          filtersOpen={filtersOpen}
          onToggleFilters={() => setFiltersOpen(v => !v)}
          filtersPanel={
            <div>
              <label className="mb-2 block text-sm text-[var(--dash-text-strong)]">Ambito narrativo</label>
              <select
                value={narrativeFilter}
                onChange={e => setNarrativeFilter(e.target.value)}
                className="w-full rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text)]"
              >
                <option value="all">Tutta la campagna</option>
                {adventures.map(adventure => (
                  <option key={adventure.id} value={adventure.id}>{adventure.title}</option>
                ))}
              </select>
            </div>
          }
        >
          <button
            type="button"
            onClick={() => setArchiveQuickFilter('all')}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${archiveQuickFilter === 'all' ? 'border-[var(--dash-accent)] bg-[var(--dash-accent)] text-[var(--dash-text-strong)]' : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface)] text-[var(--dash-muted)] hover:text-[var(--dash-text)]'}`}
          >
            Tutti
          </button>
          <button
            type="button"
            onClick={() => setArchiveQuickFilter('campaign')}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${archiveQuickFilter === 'campaign' ? 'border-[var(--dash-accent)] bg-[var(--dash-accent)] text-[var(--dash-text-strong)]' : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface)] text-[var(--dash-muted)] hover:text-[var(--dash-text)]'}`}
          >
            In una Campagna
          </button>
          <button
            type="button"
            onClick={() => setArchiveQuickFilter('unassigned')}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${archiveQuickFilter === 'unassigned' ? 'border-[var(--dash-accent)] bg-[var(--dash-accent)] text-[var(--dash-text-strong)]' : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface)] text-[var(--dash-muted)] hover:text-[var(--dash-text)]'}`}
          >
            In nessuna Campagna
          </button>
        </EntityFilterToolbar>

        {isLoading ? (
          <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] px-5 py-8 text-center text-sm text-[var(--dash-muted)]">
            Caricamento mostri...
          </div>
        ) : filteredMonsters.length === 0 ? (
          <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] px-5 py-8 text-center">
            <Swords className="mx-auto mb-3 h-10 w-10 text-[var(--dash-muted)]" />
            <div className="text-xs uppercase tracking-[0.16em] text-[var(--dash-accent-2)]">
              {monsters.length === 0 ? 'Nessun mostro in questa campagna' : 'Nessun mostro corrisponde ai filtri'}
            </div>
          </div>
        ) : (
          <>
            <div className={viewMode === 'list' ? 'space-y-2' : 'grid gap-3 sm:grid-cols-2'}>
              {pageItems.map(monster => (
                <EntityCard
                  key={monster.id}
                  variant={viewMode}
                  name={monster.name || 'Mostro senza nome'}
                  subtitle={monster.description}
                  secondaryText={formatCampaignAdventureLabel(activeCampaign?.name, monster.adventureId ? adventures.find(a => a.id === monster.adventureId)?.title ?? null : null)}
                  photoUrl={monster.portraitImageUrl}
                  photoSourceUrl={monster.portraitSourceImageUrl}
                  photoCropArea={monster.portraitCropArea}
                  tokenColor={monster.tokenColor}
                  tokenBackgroundColor={monster.tokenBackgroundColor}
                  tokenBorderStyle={monster.tokenBorderStyle}
                  tokenBorderThickness={monster.tokenBorderThickness}
                  tokenBorderVisible={monster.tokenBorderVisible}
                  tokenBorderLabel={monster.tokenBorderLabel}
                  badge={
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-2 py-0.5 text-[10px] font-semibold text-[var(--dash-text)]">
                        {monster.isCustom ? 'Custom' : 'Standard'}
                      </span>
                      {renderLuogoBadge(monster)}
                    </div>
                  }
                  onClick={() => handleSelectMonster(monster.id)}
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
              totalItems={filteredMonsters.length}
              itemLabelPlural="mostri"
            />
          </>
        )}
      </div>

      <div className="lg:col-span-2">
        {selectedMonster ? (
          <>
            {isViewingDraft && (
              <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-[var(--dash-accent)] bg-[var(--dash-panel)] px-3 py-2 text-xs text-[var(--dash-text)]">
                <span>Bozza non salvata — premi "Crea Mostro" per salvarla.</span>
                <button
                  type="button"
                  onClick={handleConfirmCreateMonster}
                  disabled={!selectedMonster.name.trim()}
                  className="shrink-0 rounded-md border border-[var(--dash-accent)] bg-[var(--dash-accent)] px-3 py-1.5 text-xs font-semibold text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-accent-2)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Crea Mostro
                </button>
              </div>
            )}

            {isViewingDraft && (
              <div className="mb-4 rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                <div className="mb-3">
                  <h3 className="text-[var(--dash-text)]">Crea da mostro base</h3>
                  <p className="mt-1 text-xs text-[var(--dash-muted)]">
                    Puoi partire da un mostro del catalogo e poi modificarlo liberamente.
                  </p>
                </div>
                <select
                  value={baseMonsterIdToCreate}
                  onChange={e => handleSelectBaseMonster(e.target.value)}
                  className="w-full rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-sm text-[var(--dash-text)]"
                >
                  <option value="">Seleziona mostro...</option>
                  {MONSTER_BASE_CATALOG.map(base => (
                    <option key={base.id} value={base.id}>{base.name}</option>
                  ))}
                </select>
              </div>
            )}

            {!isViewingDraft && (
              <div className="mb-3">{renderLuogoBadge(selectedMonster)}</div>
            )}

            <EntityDetailView
              entityType="monster"
              entity={selectedMonster}
              onUpdate={handleMonsterUpdate}
              canEdit
              campaignId={activeCampaignId}
              accessToken={session?.access_token}
              isHSC={isHSC}
              draggable={false}
              showRail
              isDraft={isViewingDraft}
              monsterAudaciaExtraAction={
                (selectedMonster.maxFreschezza ?? 0) > 0 ? (
                  <button
                    type="button"
                    onClick={handleSpendAudacia}
                    disabled={(selectedMonster.audacia ?? 0) <= 0}
                    className="mt-3 w-full rounded-md border border-[var(--dash-accent)] bg-[var(--dash-accent)] px-3 py-2 text-sm text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-accent-2)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Spendi 1 Audacia
                  </button>
                ) : undefined
              }
              headerAction={
                !isViewingDraft ? (
                  <EntityKebabMenu
                    colors={menuColors}
                    items={[
                      {
                        key: 'delete',
                        icon: <Trash2 className="h-4 w-4" />,
                        label: 'Elimina mostro',
                        onClick: () => setDeleteTarget(selectedMonster),
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
              <Swords className="mx-auto mb-3 h-10 w-10 text-[var(--dash-muted)]" />
              <p className="text-sm text-[var(--dash-muted)]">Seleziona un mostro dalla lista, o creane uno nuovo.</p>
            </div>
          </div>
        )}
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title={`Eliminare definitivamente ${deleteTarget.name || 'questo mostro'}?`}
          message="Questa azione non può essere annullata."
          confirmLabel="Elimina definitivamente"
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
