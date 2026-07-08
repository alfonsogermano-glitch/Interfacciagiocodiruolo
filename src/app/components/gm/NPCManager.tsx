import { useEffect, useState } from 'react';
import { Ghost, Plus, Edit2, Trash2, Lock, Save, X } from 'lucide-react';
import { CAMPAIGN_STORAGE_KEYS } from '../../../services/campaign/campaignStorageKeys';
import { loadEnvironmentReferences } from '../../../services/campaign/entityReferenceService';
import type { Adventure } from '../../../types/adventure';
import { loadNPCs, saveNPC as saveNPCToSupabase, deleteNPC as deleteNPCFromSupabase } from '../../../services/supabase/entitiesService';
import { generateUUID } from '../../../lib/uuid';
import { useAuth } from '../../auth/AuthContext';
import { useCampaign } from '../../campaigns/CampaignContext';
import { useRuleset } from '../../campaigns/RulesetContext';
import { RulesetBadge } from '../../campaigns/RulesetGate';
import { D20StatBlock, D20StatSummary, DEFAULT_D20_STATS, type D20Stats } from '../ruleset/D20StatBlock';
import { FreschezzaBoxesEditor } from '../shared/FreschezzaBoxesEditor';

type EnvironmentSummary = {
  id: string;
  campaignId?: string | null;
  adventureId?: string | null;
  name: string;
};

interface NPC {
  id: string;
  campaignId?: string | null;
  environmentId?: string | null;
  adventureId?: string | null;

  name: string;
  role: string;
  description: string;
  personality: string;
  secrets: string;
  location: string;

  portraitImageUrl?: string;
  portraitCroppedImageUrl?: string;
  portraitCrop?: {
    centerX: number;
    centerY: number;
    zoom: number;
  };

  mapLocationId?: string | null;
  customLocationName?: string;

  freschezza?: number | null;
  maxFreschezza?: number | null;
  caselleFrischezzaCruciali?: number[];

  attacco?: 'Base' | 'Critico' | 'Estremo' | 'Impossibile' | 'Non euclideo' | '';
  difesa?: 'Base' | 'Critico' | 'Estremo' | 'Impossibile' | 'Non euclideo' | '';

  tratti?: string[];
  trattiPersonalizzati?: string[];

  azioniSpeciali?: string[];
  azioniSpecialiPersonalizzate?: string[];

  puntoDebole?: string;
  d20Stats?: D20Stats;
  ownerProfileId?: string;
}

const NPC_STORAGE_KEY = CAMPAIGN_STORAGE_KEYS.npcs;
const ADVENTURES_STORAGE_KEY = CAMPAIGN_STORAGE_KEYS.adventures;
const ENVIRONMENTS_STORAGE_KEY = CAMPAIGN_STORAGE_KEYS.environments;
const ACTIVE_ADVENTURE_STORAGE_KEY = CAMPAIGN_STORAGE_KEYS.activeAdventure;

const DIFFICULTY_OPTIONS = [
  '',
  'Base',
  'Critico',
  'Estremo',
  'Impossibile',
  'Non euclideo'
] as const;

interface NavigationTarget {
  tabId: string;
  entityId?: string;
  entityType?: string;
}

interface NPCManagerProps {
  storageRefreshKey?: number;
  navigationTarget?: NavigationTarget | null;
}

export function NPCManager({
  storageRefreshKey = 0,
  navigationTarget = null
}: NPCManagerProps) {
  const { activeCampaignId } = useCampaign();
  const { user } = useAuth();
  const { isHSC, isDnD5e, isPathfinder } = useRuleset();
  const isD20 = isDnD5e || isPathfinder;

  const [npcs, setNpcs] = useState<NPC[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [adventures] = useState<Adventure[]>(() => {
    if (typeof window === 'undefined') return [];

    try {
      const savedAdventures = window.localStorage.getItem(ADVENTURES_STORAGE_KEY);
      if (!savedAdventures) return [];

      const parsedAdventures = JSON.parse(savedAdventures);
      return Array.isArray(parsedAdventures) ? parsedAdventures : [];
    } catch (error) {
      console.error('Errore nel caricamento delle avventure da localStorage:', error);
      return [];
    }
  });

  const [environments, setEnvironments] = useState<EnvironmentSummary[]>([]);

  useEffect(() => {
    let cancelled = false;

    loadEnvironmentReferences(activeCampaignId)
      .then(references => {
        if (cancelled) return;
        setEnvironments(references);
      })
      .catch(error => {
        console.error('Errore caricamento riferimenti Luoghi per PNG:', error);

        if (typeof window === 'undefined') return;

        try {
          const saved = window.localStorage.getItem(ENVIRONMENTS_STORAGE_KEY);
          if (!saved) {
            setEnvironments([]);
            return;
          }

          const parsed = JSON.parse(saved);
          setEnvironments(Array.isArray(parsed) ? parsed : []);
        } catch {
          setEnvironments([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [storageRefreshKey]);

  const [useActiveAdventureFilter, setUseActiveAdventureFilter] = useState(false);
  const [selectedAdventureFilterId, setSelectedAdventureFilterId] = useState<string>('all');
  const [includeUnassignedInAdventureFilter, setIncludeUnassignedInAdventureFilter] = useState(false);

  const [activeAdventureId, setActiveAdventureId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(ACTIVE_ADVENTURE_STORAGE_KEY);
  });

  const [selectedNPC, setSelectedNPC] = useState<NPC | null>(null);
  const [draftNPC, setDraftNPC] = useState<NPC | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const loadedNPCs = await loadNPCs(activeCampaignId);

        // loadNPCs già restituisce dati mappati correttamente (toCamelCase)
        setNpcs(loadedNPCs);
        console.log('NPC caricati da Supabase:', loadedNPCs);
      } catch (error) {
        console.error('Errore caricamento NPC da Supabase:', error);

        try {
          const savedNpcs = window.localStorage.getItem(NPC_STORAGE_KEY);
          if (savedNpcs) {
            const parsedNpcs = JSON.parse(savedNpcs);
            if (Array.isArray(parsedNpcs)) {
              setNpcs(parsedNpcs);
            }
          }
        } catch (localError) {
          console.error('Errore caricamento NPC da localStorage:', localError);
        }
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [storageRefreshKey]);

  useEffect(() => {
    if (isLoading) return;

    try {
      window.localStorage.setItem(NPC_STORAGE_KEY, JSON.stringify(npcs));
    } catch (error) {
      console.error('Errore nel salvataggio dei PNG su localStorage:', error);
    }
  }, [npcs, isLoading]);

  useEffect(() => {
    const syncActiveAdventure = () => {
      if (typeof window === 'undefined') return;
      setActiveAdventureId(window.localStorage.getItem(ACTIVE_ADVENTURE_STORAGE_KEY));
    };

    syncActiveAdventure();
    window.addEventListener('focus', syncActiveAdventure);

    return () => {
      window.removeEventListener('focus', syncActiveAdventure);
    };
  }, []);

  useEffect(() => {
    if (!selectedNPC) return;

    const updatedSelectedNpc = npcs.find(npc => npc.id === selectedNPC.id);

    if (!updatedSelectedNpc) {
      setSelectedNPC(null);
      setIsEditing(false);
      return;
    }

    if (updatedSelectedNpc !== selectedNPC) {
      setSelectedNPC(updatedSelectedNpc);
    }
  }, [npcs, selectedNPC]);

  const createEmptyNPC = (): NPC => ({
    id: generateUUID(),
    campaignId: activeCampaignId,
    ownerProfileId: user?.id,
    environmentId: null,
    adventureId: null,
    name: '',
    role: '',
    description: '',
    personality: '',
    secrets: '',
    location: '',
    portraitImageUrl: '',
    portraitCroppedImageUrl: '',
    portraitCrop: { centerX: 0.5, centerY: 0.5, zoom: 1 },
    mapLocationId: null,
    customLocationName: '',
    freschezza: null,
    maxFreschezza: null,
    caselleFrischezzaCruciali: [],
    attacco: '',
    difesa: '',
    tratti: [],
    trattiPersonalizzati: [],
    azioniSpeciali: [],
    azioniSpecialiPersonalizzate: [],
    puntoDebole: ''
  });

  const addNPC = () => {
    setDraftNPC(createEmptyNPC());
    setSelectedNPC(null);
    setIsCreating(true);
    setIsEditing(true);
  };

  const updateNPC = (updatedNPC: NPC) => {
    setNpcs(prev => prev.map(npc => (npc.id === updatedNPC.id ? updatedNPC : npc)));
    setSelectedNPC(updatedNPC);
  };

  const updateDraftNPC = (updatedNPC: NPC) => {
    setDraftNPC(updatedNPC);
  };

  const updateCurrentNPC = (updatedNPC: NPC) => {
    isCreating ? updateDraftNPC(updatedNPC) : updateNPC(updatedNPC);
  };

  const canSaveNPC = (npc: NPC) => {
    return npc.name.trim().length > 0 && npc.role.trim().length > 0;
  };

  const saveNPC = async () => {
    if (isCreating && draftNPC) {
      if (!canSaveNPC(draftNPC)) return;

      setNpcs(prev => [...prev, draftNPC]);
      setSelectedNPC(draftNPC);
      setDraftNPC(null);
      setIsCreating(false);
      setIsEditing(false);

      try {
        // Passa l'intero oggetto - il servizio si occupa del mapping automatico
        await saveNPCToSupabase(activeCampaignId, draftNPC);
      } catch (error) {
        console.error('Errore salvataggio NPC su Supabase:', error, draftNPC);
      }

      return;
    }

    if (selectedNPC) {
      try {
        // Passa l'intero oggetto - il servizio si occupa del mapping automatico
        await saveNPCToSupabase(activeCampaignId, selectedNPC);
      } catch (error) {
        console.error('Errore salvataggio NPC su Supabase:', error, selectedNPC);
      }
    }

    setIsEditing(false);
  };

  const cancelEditing = () => {
    if (isCreating) {
      setDraftNPC(null);
      setIsCreating(false);
      setIsEditing(false);
      return;
    }

    setIsEditing(false);
  };

  const deleteNPC = async (id: string) => {
    if (confirm('Eliminare questo PNG?')) {
      setNpcs(prev => prev.filter(npc => npc.id !== id));

      if (selectedNPC?.id === id) {
        setSelectedNPC(null);
        setIsEditing(false);
      }

      try {
        await deleteNPCFromSupabase(id);
      } catch (error) {
        console.error('Errore eliminazione NPC da Supabase:', error);
      }
    }
  };

  useEffect(() => {
    if (navigationTarget?.tabId !== 'npcs') return;
    if (navigationTarget.entityType !== 'npc') return;
    if (!navigationTarget.entityId) return;

    const npcToSelect = npcs.find(npc => npc.id === navigationTarget.entityId);

    if (!npcToSelect) return;

    setSelectedNPC(npcToSelect);
    setDraftNPC(null);
    setIsCreating(false);
    setIsEditing(false);
  }, [navigationTarget, npcs]);

  const currentNPC = isCreating ? draftNPC : selectedNPC;

  const activeAdventureTitle =
    adventures.find(adventure => adventure.id === activeAdventureId)?.title ?? null;

  const effectiveAdventureFilterId = useActiveAdventureFilter
    ? activeAdventureId
    : selectedAdventureFilterId === 'all'
      ? null
      : selectedAdventureFilterId;

  const isFilteringSpecificAdventure = effectiveAdventureFilterId !== null;

  useEffect(() => {
    if (!isFilteringSpecificAdventure) {
      setIncludeUnassignedInAdventureFilter(false);
    }
  }, [isFilteringSpecificAdventure]);

  const visibleNpcs = npcs.filter(npc => {
    if (!effectiveAdventureFilterId) return true;
    if (npc.adventureId === effectiveAdventureFilterId) return true;
    if (includeUnassignedInAdventureFilter && npc.adventureId == null) return true;
    return false;
  });

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-4 overflow-visible lg:col-span-1">
        <div className="relative z-20 flex items-center justify-between overflow-visible">
          <h2 className="flex items-center text-[var(--dash-text)]">PNG<RulesetBadge className="ml-2" /></h2>

          <div className="group relative">
            <button
              onClick={addNPC}
              className="cursor-help rounded-lg border-2 border-[var(--dash-border)] bg-[var(--dash-border)] p-2 text-[var(--dash-text)] transition-colors hover:bg-[var(--dash-border)]"
            >
              <Plus className="h-5 w-5" />
            </button>

            <div className="pointer-events-none absolute right-0 top-full z-50 mt-2 hidden whitespace-nowrap rounded-md border border-[var(--dash-accent)] bg-[var(--dash-panel)] px-3 py-2 text-xs text-[var(--dash-text-strong)] shadow-xl group-hover:block">
              Crea un nuovo PNG
              <div className="absolute bottom-full right-3 h-2 w-2 rotate-45 border-l border-t border-[var(--dash-accent)] bg-[var(--dash-panel)]" />
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] px-4 py-3">
          <div>
            <label className="mb-2 block text-sm text-[var(--dash-text-strong)]">
              Filtro narrativo
            </label>

            <select
              value={selectedAdventureFilterId}
              onChange={e => setSelectedAdventureFilterId(e.target.value)}
              disabled={useActiveAdventureFilter}
              className="w-full rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text)] disabled:opacity-50"
            >
              <option value="all">Tutta la campagna</option>
              {adventures
                .filter(adventure => adventure.campaignId === activeCampaignId)
                .map(adventure => (
                  <option key={adventure.id} value={adventure.id}>
                    {adventure.title}
                  </option>
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
            Usa automaticamente l’avventura attiva
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
                  ? `Filtro attivo: ${
                      adventures.find(adventure => adventure.id === selectedAdventureFilterId)?.title ?? 'Avventura'
                    } + PNG non assegnati`
                  : `Filtro attivo: ${
                      adventures.find(adventure => adventure.id === selectedAdventureFilterId)?.title ?? 'Avventura'
                    }`}
          </div>
        </div>

        <div className="space-y-2">
          {visibleNpcs.length === 0 ? (
            <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] px-5 py-8 text-center">
              <Ghost className="mx-auto mb-3 h-10 w-10 text-[var(--dash-muted)]" />
              <div className="text-xs uppercase tracking-[0.16em] text-[var(--dash-accent-2)]">
                Archivio vuoto
              </div>
              <h3 className="mt-2 text-lg font-semibold text-[var(--dash-text-strong)]">
                Nessun PNG visibile
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--dash-text)]">
                Non ci sono PNG che corrispondono al filtro narrativo selezionato.
              </p>
              <div className="mt-5">
                <button
                  onClick={addNPC}
                  className="inline-flex items-center gap-2 rounded-md border border-[var(--dash-accent)] bg-[var(--dash-accent)] px-4 py-2 text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-accent-2)]"
                >
                  <Plus className="h-4 w-4" />
                  Crea il primo PNG
                </button>
              </div>
            </div>
          ) : (
            visibleNpcs.map(npc => (
              <div
                key={npc.id}
                onClick={() => {
                  setSelectedNPC(npc);
                  setIsEditing(false);
                  setIsCreating(false);
                  setDraftNPC(null);
                }}
                className={`cursor-pointer rounded-xl border p-4 transition-colors ${
                  selectedNPC?.id === npc.id && !isCreating
                    ? 'border-[var(--dash-accent)] bg-[var(--dash-panel)]'
                    : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface)] hover:border-[var(--dash-accent)]'
                }`}
              >
                <div className="mb-2 flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--dash-accent)] bg-[var(--dash-panel)]">
                    <Ghost className="h-4 w-4 text-[var(--dash-accent-2)]" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-medium text-[var(--dash-text-strong)]">
                      {npc.name.trim() || 'PNG senza nome'}
                    </h3>
                    <p className="mt-1 text-sm text-[var(--dash-text)]">
                      {npc.role.trim() || 'Ruolo da definire'}
                    </p>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="rounded-full border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-2 py-0.5 text-[11px] text-[var(--dash-text)]">
                    {npc.adventureId
                      ? adventures.find(adventure => adventure.id === npc.adventureId)?.title ?? 'Avventura'
                      : 'Tutta la campagna'}
                  </span>
                  {npc.environmentId && (
  <span className="rounded-full border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-2 py-0.5 text-[11px] text-[var(--dash-text)]">
    {environments.find(env => env.id === npc.environmentId)?.name ?? 'Luogo'}
  </span>
)}
                </div>

                {npc.location.trim() && (
                  <div className="mt-3 border-t border-[var(--dash-surface-2)] pt-3 text-xs uppercase tracking-[0.08em] text-[var(--dash-muted)]">
                    {npc.location}
                  </div>
                )}

                {isD20 && npc.d20Stats && (
                  <D20StatSummary stats={npc.d20Stats} />
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="lg:col-span-2">
        {currentNPC ? (
          <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-6">
            <div className="mb-6 flex items-start justify-between">
              <h2 className="text-2xl font-semibold text-[var(--dash-text-strong)]">
                {currentNPC.name.trim() || 'Nuovo PNG'}
              </h2>

              <div className="flex gap-2">
                {isEditing ? (
                  <>
                    <button
                      onClick={saveNPC}
                      disabled={!canSaveNPC(currentNPC)}
                      className="rounded-md border border-[var(--dash-accent)] bg-[var(--dash-accent)] p-2 text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-accent-2)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Save className="h-4 w-4" />
                    </button>

                    <button
                      onClick={cancelEditing}
                      className="rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-2 text-[var(--dash-text)] transition-colors hover:bg-[var(--dash-surface-2)]"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setIsEditing(true)}
                      className="rounded-md border border-[var(--dash-accent)] bg-[var(--dash-accent)] p-2 text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-accent-2)]"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>

                    <button
                      onClick={() => deleteNPC(currentNPC.id)}
                      className="rounded-md border border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)] p-2 text-[var(--dash-danger-text)] transition-colors hover:bg-[var(--dash-danger-hover)]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {isEditing ? (
              <div className="space-y-4">
                <input
                  type="text"
                  value={currentNPC.name}
                  onChange={e => updateCurrentNPC({ ...currentNPC, name: e.target.value })}
                  placeholder="Nome PNG"
                  className="w-full rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text)]"
                />

                <input
                  type="text"
                  value={currentNPC.role}
                  onChange={e => updateCurrentNPC({ ...currentNPC, role: e.target.value })}
                  placeholder="Ruolo"
                  className="w-full rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text)]"
                />

                <div>
                  <label className="mb-2 block text-[var(--dash-text)]">Ambito narrativo</label>
                  <select
                    value={currentNPC.adventureId ?? ''}
                    onChange={e =>
                      updateCurrentNPC({
                        ...currentNPC,
                        campaignId: activeCampaignId,
                        adventureId: e.target.value || null
                      })
                    }
                    className="w-full rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text)]"
                  >
                    <option value="">Tutta la campagna</option>
                    {adventures
                      .filter(adventure => adventure.campaignId === activeCampaignId)
                      .map(adventure => (
                        <option key={adventure.id} value={adventure.id}>
                          {adventure.title}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
  <label className="mb-2 block text-[var(--dash-text)]">
    Luogo
  </label>

  <select
    value={currentNPC.environmentId ?? ''}
    onChange={e =>
      updateCurrentNPC({
        ...currentNPC,
        environmentId: e.target.value || null
      })
    }
    className="w-full rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text)]"
  >
    <option value="">Nessun luogo</option>

    {environments
      .filter(environment =>
        environment.campaignId == null ||
        environment.campaignId === activeCampaignId
      )
      .filter(environment =>
        !currentNPC.adventureId ||
        environment.adventureId == null ||
        environment.adventureId === currentNPC.adventureId
      )
      .map(environment => (
        <option key={environment.id} value={environment.id}>
          {environment.name}
        </option>
      ))}
  </select>
</div>

                {isHSC && (
                <div>
                  <label className="mb-2 block text-[var(--dash-text)]">
                    Freschezza massima
                  </label>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const currentMax = currentNPC.maxFreschezza ?? 0;
                        const nextMax = Math.max(0, currentMax - 1);

                        updateCurrentNPC({
                          ...currentNPC,
                          maxFreschezza: nextMax,
                          freschezza: nextMax,
                          caselleFrischezzaCruciali: (currentNPC.caselleFrischezzaCruciali ?? []).filter(
                            box => box <= nextMax
                          )
                        });
                      }}
                      className="h-10 w-10 rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] text-[var(--dash-text-strong)] hover:bg-[var(--dash-surface-2)]"
                    >
                      −
                    </button>

                    <div className="flex h-10 w-16 items-center justify-center rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] text-center text-[var(--dash-text)]">
                      {currentNPC.maxFreschezza ?? 0}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const currentMax = currentNPC.maxFreschezza ?? 0;
                        const nextMax = currentMax + 1;

                        updateCurrentNPC({
                          ...currentNPC,
                          maxFreschezza: nextMax,
                          freschezza: nextMax
                        });
                      }}
                      className="h-10 w-10 rounded-md border border-[var(--dash-accent)] bg-[var(--dash-accent)] text-[var(--dash-text-strong)] hover:bg-[var(--dash-accent-2)]"
                    >
                      +
                    </button>
                  </div>

                  <p className="mt-2 text-xs text-[var(--dash-muted)]">
                    Alla creazione, la freschezza attuale viene impostata automaticamente al massimo.
                  </p>
                </div>
                )}

                {isHSC && (currentNPC.maxFreschezza ?? 0) > 0 && (
                  <FreschezzaBoxesEditor
                    current={currentNPC.freschezza ?? currentNPC.maxFreschezza ?? 0}
                    max={currentNPC.maxFreschezza ?? 0}
                    crucialBoxes={currentNPC.caselleFrischezzaCruciali ?? []}
                    onUpdate={({ current, crucialBoxes }) =>
                      updateCurrentNPC({
                        ...currentNPC,
                        freschezza: current,
                        caselleFrischezzaCruciali: crucialBoxes
                      })
                    }
                  />
                )}

                {isHSC && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <select
                    value={currentNPC.attacco ?? ''}
                    onChange={e =>
                      updateCurrentNPC({
                        ...currentNPC,
                        attacco: e.target.value as NPC['attacco']
                      })
                    }
                    className="w-full rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text)]"
                  >
                    {DIFFICULTY_OPTIONS.map(option => (
                      <option key={option} value={option}>
                        {option || 'Attacco non definito'}
                      </option>
                    ))}
                  </select>

                  <select
                    value={currentNPC.difesa ?? ''}
                    onChange={e =>
                      updateCurrentNPC({
                        ...currentNPC,
                        difesa: e.target.value as NPC['difesa']
                      })
                    }
                    className="w-full rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text)]"
                  >
                    {DIFFICULTY_OPTIONS.map(option => (
                      <option key={option} value={option}>
                        {option || 'Difesa non definita'}
                      </option>
                    ))}
                  </select>
                </div>
                )}

                {isHSC && (
                <textarea
                  value={currentNPC.puntoDebole ?? ''}
                  onChange={e => updateCurrentNPC({ ...currentNPC, puntoDebole: e.target.value })}
                  placeholder="Punto debole"
                  className="h-24 w-full resize-none rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text)]"
                />
                )}

                {isD20 && (
                  <D20StatBlock
                    stats={draftNPC?.d20Stats ?? DEFAULT_D20_STATS}
                    isPlayerCharacter={false}
                    isEditing={true}
                    onChange={(patch) => setDraftNPC(prev => prev ? {
                      ...prev,
                      d20Stats: { ...(prev.d20Stats ?? DEFAULT_D20_STATS), ...patch }
                    } : prev)}
                  />
                )}

                <textarea
                  value={currentNPC.description}
                  onChange={e => updateCurrentNPC({ ...currentNPC, description: e.target.value })}
                  placeholder="Descrizione"
                  className="h-24 w-full resize-none rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text)]"
                />

                <textarea
                  value={currentNPC.personality}
                  onChange={e => updateCurrentNPC({ ...currentNPC, personality: e.target.value })}
                  placeholder="Personalità"
                  className="h-24 w-full resize-none rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text)]"
                />

                <div className="rounded-2xl border border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)] p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Lock className="h-4 w-4 text-[var(--dash-danger-hover)]" />
                    <label className="text-sm font-medium uppercase tracking-[0.08em] text-[var(--dash-danger-text)]">
                      Segreti (Solo GM)
                    </label>
                  </div>

                  <textarea
                    value={currentNPC.secrets}
                    onChange={e => updateCurrentNPC({ ...currentNPC, secrets: e.target.value })}
                    placeholder="Segreti"
                    className="h-28 w-full resize-none rounded-xl border border-[var(--dash-danger-hover)] bg-[var(--dash-bg)] px-3 py-2 text-[var(--dash-danger-text)]"
                  />
                </div>

                <input
                  type="text"
                  value={currentNPC.location}
                  onChange={e => updateCurrentNPC({ ...currentNPC, location: e.target.value })}
                  placeholder="Posizione"
                  className="w-full rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text)]"
                />
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <h3 className="mb-2 text-[var(--dash-text)]">Ruolo</h3>
                  <p className="text-[var(--dash-muted)]">{currentNPC.role || 'Non specificato'}</p>
                </div>

                <div>
                  <h3 className="mb-2 text-[var(--dash-text)]">Ambito narrativo</h3>
                  <p className="text-[var(--dash-muted)]">
                    {currentNPC.adventureId
                      ? adventures.find(adventure => adventure.id === currentNPC.adventureId)?.title ?? 'Avventura non trovata'
                      : 'Tutta la campagna'}
                  </p>
                </div>

                <div>
  <h3 className="mb-2 text-[var(--dash-text)]">Luogo</h3>

  <p className="text-[var(--dash-muted)]">
    {currentNPC.environmentId
      ? environments.find(env => env.id === currentNPC.environmentId)?.name ?? 'Luogo non trovato'
      : 'Nessun luogo collegato'}
  </p>
</div>

                {(currentNPC.maxFreschezza ?? 0) > 0 && (
                  <FreschezzaBoxesEditor
                    current={currentNPC.freschezza ?? currentNPC.maxFreschezza ?? 0}
                    max={currentNPC.maxFreschezza ?? 0}
                    crucialBoxes={currentNPC.caselleFrischezzaCruciali ?? []}
                    onUpdate={({ current, crucialBoxes }) =>
                      updateNPC({
                        ...currentNPC,
                        freschezza: current,
                        caselleFrischezzaCruciali: crucialBoxes
                      })
                    }
                  />
                )}

                {(currentNPC.attacco || currentNPC.difesa || currentNPC.puntoDebole) && (
                  <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                    <h3 className="mb-3 text-[var(--dash-text)]">Scheda estesa</h3>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <div className="text-xs uppercase tracking-[0.08em] text-[var(--dash-muted)]">
                          Attacco
                        </div>
                        <div className="mt-1 text-[var(--dash-text)]">
                          {currentNPC.attacco || '—'}
                        </div>
                      </div>

                      <div>
                        <div className="text-xs uppercase tracking-[0.08em] text-[var(--dash-muted)]">
                          Difesa
                        </div>
                        <div className="mt-1 text-[var(--dash-text)]">
                          {currentNPC.difesa || '—'}
                        </div>
                      </div>
                    </div>

                    {currentNPC.puntoDebole && (
                      <div className="mt-4 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-danger-bg)] p-3">
                        <div className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--dash-danger-hover)]">
                          Punto debole
                        </div>
                        <p className="text-[var(--dash-danger-text)]">{currentNPC.puntoDebole}</p>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <h3 className="mb-2 text-[var(--dash-text)]">Descrizione</h3>
                  <p className="text-[var(--dash-muted)]">{currentNPC.description || 'Nessuna descrizione'}</p>
                </div>

                <div>
                  <h3 className="mb-2 text-[var(--dash-text)]">Personalità</h3>
                  <p className="text-[var(--dash-muted)]">{currentNPC.personality || 'Non specificata'}</p>
                </div>

                <div className="rounded-lg border-2 border-[var(--dash-border)] bg-[var(--dash-input)] p-4">
                  <h3 className="mb-2 text-[var(--dash-text)]">🔒 Segreti (Solo GM)</h3>
                  <p className="text-[var(--dash-muted)]">{currentNPC.secrets || 'Nessun segreto'}</p>
                </div>

                <div>
                  <h3 className="mb-2 text-[var(--dash-text)]">Posizione</h3>
                  <p className="text-[var(--dash-muted)]">{currentNPC.location || 'Non specificata'}</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-12 text-center">
            <Ghost className="mx-auto mb-4 h-16 w-16 text-[var(--dash-muted)]" />
            <div className="text-xs uppercase tracking-[0.16em] text-[var(--dash-accent-2)]">
              Nessuna scheda aperta
            </div>
            <h3 className="mt-2 text-xl font-semibold text-[var(--dash-text-strong)]">
              Seleziona un PNG dalla lista
            </h3>
          </div>
        )}
      </div>
    </div>
  );
}
