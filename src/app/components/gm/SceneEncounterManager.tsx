import { useEffect, useMemo, useState } from 'react';
import { useCampaign } from '../../campaigns/CampaignContext';
import type { ReactNode } from 'react';
import { Play, MapPin, Ghost, Swords, Lightbulb, Scroll } from 'lucide-react';
import { CAMPAIGN_STORAGE_KEYS } from '../../../services/campaign/campaignStorageKeys';
import { HorrorCard } from '../ui/HorrorCard';
import { HorrorButton } from '../ui/HorrorButton';
import { SectionHeader } from '../ui/SectionHeader';
import { EmptyState } from '../ui/EmptyState';
import { isSupabaseConfigured, supabase } from '../../../lib/supabaseClient';
import { generateUUID } from '../../../lib/uuid';

const ACTIVE_ENCOUNTER_STORAGE_KEY = 'hsc_active_encounter';

type ActiveEncounter = {
  id: string;
  campaignId: string;
  environmentId: string;
  environmentName: string;
  npcIds: string[];
  monsterIds: string[];
  clueIds: string[];
  situationIds: string[];
  startedAt: string;
};

type EnvironmentSummary = {
  id: string;
  campaignId?: string | null;
  adventureId?: string | null;
  name: string;
  description?: string;
  atmosphere?: string;
};

type LinkedEntity = {
  id: string;
  name?: string;
  title?: string;
  environmentId?: string | null;
  adventureId?: string | null;
  description?: string;
  role?: string;
  discovered?: boolean;
};

// Nessun ambiente di default: gli utenti creano i propri luoghi

function readArray<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mapEnvironmentFromSupabase(item: any): EnvironmentSummary {
  return {
    id: item.id,
    campaignId: item.campaign_id ?? item.campaignId ?? null,
    adventureId: item.adventure_id ?? item.adventureId ?? null,
    name: item.name ?? 'Luogo senza nome',
    description: item.description ?? '',
    atmosphere: item.atmosphere ?? ''
  };
}

function mapLinkedEntityFromSupabase(item: any): LinkedEntity {
  return {
    id: item.id,
    name: item.name ?? undefined,
    title: item.title ?? undefined,
    environmentId: item.environment_id ?? item.environmentId ?? null,
    adventureId: item.adventure_id ?? item.adventureId ?? null,
    description: item.description ?? '',
    role: item.role ?? '',
    discovered: item.discovered ?? false
  };
}

export function SceneEncounterManager() {
  const { activeCampaignId } = useCampaign();
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [environments, setEnvironments] = useState<EnvironmentSummary[]>([]);
  const [npcs, setNpcs] = useState<LinkedEntity[]>([]);
  const [monsters, setMonsters] = useState<LinkedEntity[]>([]);
  const [clues, setClues] = useState<LinkedEntity[]>([]);
  const [situations, setSituations] = useState<LinkedEntity[]>([]);

  useEffect(() => {
    let isMounted = true;

    const loadFromLocalStorage = () => {
      const storedEnvironments = readArray<EnvironmentSummary>(
        CAMPAIGN_STORAGE_KEYS.environments
      );

      if (!isMounted) return;

      setEnvironments(
        storedEnvironments.length > 0
          ? storedEnvironments
          : []
      );
      setNpcs(readArray<LinkedEntity>(CAMPAIGN_STORAGE_KEYS.npcs));
      setMonsters(readArray<LinkedEntity>(CAMPAIGN_STORAGE_KEYS.monsters));
      setClues(readArray<LinkedEntity>(CAMPAIGN_STORAGE_KEYS.clues));
      setSituations(readArray<LinkedEntity>(CAMPAIGN_STORAGE_KEYS.situations));
    };

    const loadData = async () => {
      if (!isSupabaseConfigured || !supabase) {
        loadFromLocalStorage();
        return;
      }

      try {
        const [
          environmentsResult,
          npcsResult,
          monstersResult,
          cluesResult,
          situationsResult
        ] = await Promise.all([
          supabase
            .from('environments')
            .select('*')
            .eq('campaign_id', activeCampaignId),
          supabase
            .from('npcs')
            .select('*')
            .eq('campaign_id', activeCampaignId),
          supabase
            .from('monsters')
            .select('*')
            .eq('campaign_id', activeCampaignId),
          supabase
            .from('clues')
            .select('*')
            .eq('campaign_id', activeCampaignId),
          supabase
            .from('situations')
            .select('*')
            .eq('campaign_id', activeCampaignId)
        ]);

        if (
          environmentsResult.error ||
          npcsResult.error ||
          monstersResult.error ||
          cluesResult.error ||
          situationsResult.error
        ) {
          loadFromLocalStorage();
          return;
        }

        if (!isMounted) return;

        const loadedEnvironments =
          environmentsResult.data?.map(mapEnvironmentFromSupabase) ?? [];

        setEnvironments(
          loadedEnvironments.length > 0
            ? loadedEnvironments
            : []
        );
        setNpcs(npcsResult.data?.map(mapLinkedEntityFromSupabase) ?? []);
        setMonsters(monstersResult.data?.map(mapLinkedEntityFromSupabase) ?? []);
        setClues(cluesResult.data?.map(mapLinkedEntityFromSupabase) ?? []);
        setSituations(situationsResult.data?.map(mapLinkedEntityFromSupabase) ?? []);
      } catch {
        loadFromLocalStorage();
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, []);

  const selectedEnvironment =
    environments.find(env => env.id === selectedEnvironmentId) ?? null;

  const sceneData = useMemo(() => {
    if (!selectedEnvironment) {
      return {
        npcs: [],
        monsters: [],
        clues: [],
        situations: []
      };
    }

    return {
      npcs: npcs.filter(item => item.environmentId === selectedEnvironment.id),
      monsters: monsters.filter(item => item.environmentId === selectedEnvironment.id),
      clues: clues.filter(item => item.environmentId === selectedEnvironment.id),
      situations: situations.filter(item => item.environmentId === selectedEnvironment.id)
    };
  }, [selectedEnvironment, npcs, monsters, clues, situations]);

  const startEncounter = () => {
    if (!selectedEnvironment) return;

    const encounter: ActiveEncounter = {
      id: generateUUID(),
      campaignId: activeCampaignId,
      environmentId: selectedEnvironment.id,
      environmentName: selectedEnvironment.name,
      npcIds: sceneData.npcs.map(item => item.id),
      monsterIds: sceneData.monsters.map(item => item.id),
      clueIds: sceneData.clues.map(item => item.id),
      situationIds: sceneData.situations.map(item => item.id),
      startedAt: new Date().toISOString()
    };

    window.localStorage.setItem(
      ACTIVE_ENCOUNTER_STORAGE_KEY,
      JSON.stringify(encounter)
    );

    setToastMessage(`Encounter avviato: ${selectedEnvironment.name}`);

    window.setTimeout(() => {
      setToastMessage(null);
    }, 2600);
  };

  return (
    <div className="space-y-6">
      <HorrorCard className="p-6">
        <SectionHeader
          title="Scene & Encounter"
          description="Seleziona un luogo e carica automaticamente PNG, mostri, indizi e situazioni collegate."
          icon={<Play className="h-8 w-8" />}
        />

        <select
          value={selectedEnvironmentId}
          onChange={e => setSelectedEnvironmentId(e.target.value)}
          className="w-full rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text)]"
        >
          <option value="">Seleziona luogo...</option>

          {environments
            .filter(env =>
              env.campaignId == null ||
              env.campaignId === activeCampaignId
            )
            .map(env => (
              <option key={env.id} value={env.id}>
                {env.name}
              </option>
            ))}
        </select>
      </HorrorCard>

      {!selectedEnvironment ? (
        <EmptyState
          icon={<MapPin className="h-14 w-14" />}
          title="Nessuna scena selezionata"
          description="Scegli un luogo per preparare una scena narrativa o un incontro."
        />
      ) : (
        <>
          <HorrorCard className="p-6">
            <div className="flex items-start gap-3">
              <MapPin className="mt-1 h-5 w-5 text-[var(--dash-accent-2)]" />

              <div>
                <h3 className="text-xl font-semibold text-[var(--dash-text-strong)]">
                  {selectedEnvironment.name}
                </h3>

                {selectedEnvironment.atmosphere && (
                  <p className="mt-2 text-sm text-[var(--dash-text)]">
                    {selectedEnvironment.atmosphere}
                  </p>
                )}

                {selectedEnvironment.description && (
                  <p className="mt-3 text-sm leading-relaxed text-[var(--dash-muted)]">
                    {selectedEnvironment.description}
                  </p>
                )}

                <HorrorButton
                  type="button"
                  onClick={startEncounter}
                  className="mt-5"
                >
                  <Play className="h-4 w-4" />
                  Avvia encounter
                </HorrorButton>
              </div>
            </div>
          </HorrorCard>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SceneColumn
              title="PNG"
              icon={<Ghost className="h-5 w-5" />}
              items={sceneData.npcs}
              emptyText="Nessun PNG collegato."
              getTitle={item => item.name ?? 'PNG senza nome'}
              getSubtitle={item => item.role ?? ''}
            />

            <SceneColumn
              title="Mostri"
              icon={<Swords className="h-5 w-5" />}
              items={sceneData.monsters}
              emptyText="Nessun mostro collegato."
              getTitle={item => item.name ?? 'Mostro senza nome'}
              getSubtitle={item => item.description ?? ''}
            />

            <SceneColumn
              title="Indizi"
              icon={<Lightbulb className="h-5 w-5" />}
              items={sceneData.clues}
              emptyText="Nessun indizio collegato."
              getTitle={item => item.title ?? 'Indizio senza titolo'}
              getSubtitle={item =>
                item.discovered ? 'Scoperto' : 'Non ancora scoperto'
              }
            />

            <SceneColumn
              title="Situazioni"
              icon={<Scroll className="h-5 w-5" />}
              items={sceneData.situations}
              emptyText="Nessuna situazione collegata."
              getTitle={item => item.title ?? 'Situazione senza titolo'}
              getSubtitle={item => item.description ?? ''}
            />
          </div>
        </>
      )}

      {toastMessage && (
        <div className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center">
          <div className="max-w-sm rounded-2xl border border-[var(--dash-accent)] bg-[var(--dash-panel)] px-6 py-4 text-center text-sm text-[var(--dash-text-strong)] shadow-2xl">
            {toastMessage}
          </div>
        </div>
      )}
    </div>
  );
}

function SceneColumn({
  title,
  icon,
  items,
  emptyText,
  getTitle,
  getSubtitle
}: {
  title: string;
  icon: ReactNode;
  items: LinkedEntity[];
  emptyText: string;
  getTitle: (item: LinkedEntity) => string;
  getSubtitle: (item: LinkedEntity) => string;
}) {
  return (
    <HorrorCard className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[var(--dash-text-strong)]">
          <span className="text-[var(--dash-accent-2)]">{icon}</span>
          <h3 className="font-semibold">{title}</h3>
        </div>

        <span className="rounded-full border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-2 py-0.5 text-xs text-[var(--dash-text)]">
          {items.length}
        </span>
      </div>

      {items.length === 0 ? (
        <EmptyState title={emptyText} />
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <div
              key={item.id}
              className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3"
            >
              <h4 className="text-sm font-medium text-[var(--dash-text-strong)]">
                {getTitle(item)}
              </h4>

              {getSubtitle(item) && (
                <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-[var(--dash-muted)]">
                  {getSubtitle(item)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </HorrorCard>
  );
}