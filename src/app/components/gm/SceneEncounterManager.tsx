import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Ghost, Lightbulb, MapPin, Play, Scroll, Swords } from 'lucide-react';
import { useCampaign } from '../../campaigns/CampaignContext';
import { CAMPAIGN_STORAGE_KEYS } from '../../../services/campaign/campaignStorageKeys';
import { buildActiveScenePublication } from '../../../services/campaign/activeScene';
import { loadChapters, loadScenes } from '../../../services/supabase/entitiesService';
import { persistenceKey, selectedContentMode } from '../../../services/storage/persistenceMode';
import { isSupabaseConfigured, supabase } from '../../../lib/supabaseClient';
import type { Chapter } from '../../../types/chapter';
import type { Scene } from '../../../types/scene';
import { useActiveScene } from '../session/useActiveScene';
import { ActiveSceneMap } from '../session/ActiveSceneMap';
import { EmptyState } from '../ui/EmptyState';
import { HorrorCard } from '../ui/HorrorCard';
import { SectionHeader } from '../ui/SectionHeader';

type LinkedEntity = {
  id: string;
  name?: string;
  title?: string;
  environmentId?: string | null;
  chapterId?: string | null;
  sceneId?: string | null;
  description?: string;
  role?: string;
  discovered?: boolean;
};

function readArray<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(persistenceKey(key)) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mapLinkedEntity(item: any): LinkedEntity {
  return {
    id: item.id,
    name: item.name ?? undefined,
    title: item.title ?? undefined,
    environmentId: item.environment_id ?? item.environmentId ?? null,
    chapterId: item.chapter_id ?? item.chapterId ?? null,
    sceneId: item.scene_id ?? item.sceneId ?? null,
    description: item.description ?? '',
    role: item.role ?? '',
    discovered: item.discovered ?? false,
  };
}

export function SceneEncounterManager() {
  const { activeCampaignId } = useCampaign();
  const [selectedSceneId, setSelectedSceneId] = useState('');
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [npcs, setNpcs] = useState<LinkedEntity[]>([]);
  const [monsters, setMonsters] = useState<LinkedEntity[]>([]);
  const [clues, setClues] = useState<LinkedEntity[]>([]);
  const [situations, setSituations] = useState<LinkedEntity[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const { activeScene } = useActiveScene(activeCampaignId);

  useEffect(() => {
    let cancelled = false;
    const loadLinked = async () => {
      if (selectedContentMode() === 'local' || !isSupabaseConfigured || !supabase) {
        return {
          npcs: readArray<LinkedEntity>(CAMPAIGN_STORAGE_KEYS.npcs),
          monsters: readArray<LinkedEntity>(CAMPAIGN_STORAGE_KEYS.monsters),
          clues: readArray<LinkedEntity>(CAMPAIGN_STORAGE_KEYS.clues),
          situations: readArray<LinkedEntity>(CAMPAIGN_STORAGE_KEYS.situations),
        };
      }
      const tables = ['npcs', 'monsters', 'clues', 'situations'] as const;
      const results = await Promise.all(tables.map(table => supabase.from(table).select('*').eq('campaign_id', activeCampaignId)));
      if (results.some(result => result.error)) throw results.find(result => result.error)?.error;
      return {
        npcs: (results[0].data ?? []).map(mapLinkedEntity),
        monsters: (results[1].data ?? []).map(mapLinkedEntity),
        clues: (results[2].data ?? []).map(mapLinkedEntity),
        situations: (results[3].data ?? []).map(mapLinkedEntity),
      };
    };

    void Promise.all([loadChapters(activeCampaignId), loadScenes(activeCampaignId), loadLinked()])
      .then(([loadedChapters, loadedScenes, linked]) => {
        if (cancelled) return;
        setChapters(loadedChapters);
        setScenes(loadedScenes);
        setNpcs(linked.npcs); setMonsters(linked.monsters); setClues(linked.clues); setSituations(linked.situations);
      })
      .catch(error => setToastMessage(error instanceof Error ? error.message : 'Caricamento scene non riuscito.'));
    return () => { cancelled = true; };
  }, [activeCampaignId]);

  useEffect(() => {
    if (activeScene?.sceneId) setSelectedSceneId(activeScene.sceneId);
  }, [activeScene?.sceneId]);

  const selectedScene = scenes.find(scene => scene.id === selectedSceneId) ?? null;
  const selectedChapter = selectedScene ? chapters.find(chapter => chapter.id === selectedScene.chapterId) ?? null : null;
  const previewScene = useMemo(() => selectedScene && selectedChapter
    ? buildActiveScenePublication(activeCampaignId, selectedScene, selectedChapter)
    : null, [activeCampaignId, selectedChapter, selectedScene]);
  const orderedScenes = [...scenes].sort((a, b) => {
    const chapterCompare = (chapters.find(item => item.id === a.chapterId)?.title ?? '').localeCompare(chapters.find(item => item.id === b.chapterId)?.title ?? '', 'it');
    return chapterCompare || a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'it');
  });

  const sceneData = useMemo(() => {
    const belongs = (item: LinkedEntity) => !!selectedScene && (
      item.sceneId === selectedScene.id
      || (!item.sceneId && item.chapterId === selectedScene.chapterId)
      || (!item.sceneId && !!selectedScene.environmentId && item.environmentId === selectedScene.environmentId)
    );
    return {
      npcs: npcs.filter(belongs),
      monsters: monsters.filter(belongs),
      clues: clues.filter(belongs),
      situations: situations.filter(belongs),
    };
  }, [selectedScene, npcs, monsters, clues, situations]);

  return (
    <div className="space-y-6">
      <HorrorCard className="p-6">
        <SectionHeader title="Scene & Encounter" description="Consulta la Scena e le entita collegate durante la sessione." icon={<Play className="h-8 w-8" />} />
        <select value={selectedSceneId} onChange={event => setSelectedSceneId(event.target.value)} className="w-full rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text)]">
          <option value="">Seleziona scena...</option>
          {orderedScenes.map(scene => <option key={scene.id} value={scene.id}>{chapters.find(chapter => chapter.id === scene.chapterId)?.title ?? 'Capitolo'} · {scene.title} ({scene.status === 'ready' ? 'pronta' : scene.status === 'completed' ? 'conclusa' : 'preparazione'})</option>)}
        </select>
      </HorrorCard>

      {!selectedScene || !selectedChapter ? (
        <EmptyState icon={<MapPin className="h-14 w-14" />} title="Nessuna scena selezionata" description="Prepara le Scene nei Capitoli, poi seleziona qui quella da mostrare in sessione." />
      ) : (
        <>
          <HorrorCard className="p-6">
            <div className="flex flex-col gap-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.14em] text-[var(--dash-accent-2)]">{selectedChapter.title}</div>
                  <h3 className="mt-1 text-xl font-semibold text-[var(--dash-text-strong)]">{selectedScene.title}</h3>
                  {selectedScene.description && <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--dash-muted)]">{selectedScene.description}</p>}
                </div>
                <span className="rounded-full border border-[var(--dash-border-soft)] px-3 py-1 text-xs text-[var(--dash-muted)]">{selectedScene.status === 'ready' ? 'Pronta' : selectedScene.status === 'completed' ? 'Conclusa' : 'In preparazione'}</span>
              </div>
              {previewScene && <ActiveSceneMap scene={previewScene} />}
            </div>
          </HorrorCard>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SceneColumn title="PNG" icon={<Ghost className="h-5 w-5" />} items={sceneData.npcs} emptyText="Nessun PNG collegato." getTitle={item => item.name ?? 'PNG senza nome'} getSubtitle={item => item.role ?? ''} />
            <SceneColumn title="Mostri" icon={<Swords className="h-5 w-5" />} items={sceneData.monsters} emptyText="Nessun mostro collegato." getTitle={item => item.name ?? 'Mostro senza nome'} getSubtitle={item => item.description ?? ''} />
            <SceneColumn title="Indizi" icon={<Lightbulb className="h-5 w-5" />} items={sceneData.clues} emptyText="Nessun indizio collegato." getTitle={item => item.title ?? item.name ?? 'Indizio'} getSubtitle={item => item.discovered ? 'Scoperto' : 'Non scoperto'} />
            <SceneColumn title="Situazioni" icon={<Scroll className="h-5 w-5" />} items={sceneData.situations} emptyText="Nessuna situazione collegata." getTitle={item => item.title ?? item.name ?? 'Situazione'} getSubtitle={item => item.description ?? ''} />
          </div>
        </>
      )}

      {toastMessage && <div className="fixed bottom-6 right-6 z-50 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-panel)] px-4 py-3 text-sm text-[var(--dash-text-strong)] shadow-xl">{toastMessage}</div>}
    </div>
  );
}

function SceneColumn({ title, icon, items, emptyText, getTitle, getSubtitle }: {
  title: string;
  icon: ReactNode;
  items: LinkedEntity[];
  emptyText: string;
  getTitle: (item: LinkedEntity) => string;
  getSubtitle: (item: LinkedEntity) => string;
}) {
  return <HorrorCard className="p-4"><div className="mb-3 flex items-center gap-2 text-[var(--dash-text-strong)]">{icon}<h3 className="font-semibold">{title}</h3><span className="ml-auto text-xs text-[var(--dash-muted)]">{items.length}</span></div>{items.length === 0 ? <p className="text-sm text-[var(--dash-muted)]">{emptyText}</p> : <div className="space-y-2">{items.map(item => <div key={item.id} className="rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-input)] p-3"><div className="text-sm font-medium text-[var(--dash-text-strong)]">{getTitle(item)}</div>{getSubtitle(item) && <div className="mt-1 line-clamp-2 text-xs text-[var(--dash-muted)]">{getSubtitle(item)}</div>}</div>)}</div>}</HorrorCard>;
}
