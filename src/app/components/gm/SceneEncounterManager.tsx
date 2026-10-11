import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Eye, EyeOff, Ghost, Lightbulb, MapPin, Play, Scroll, Swords } from 'lucide-react';
import { useCampaign } from '../../campaigns/CampaignContext';
import { CAMPAIGN_STORAGE_KEYS } from '../../../services/campaign/campaignStorageKeys';
import { buildActiveScenePublication } from '../../../services/campaign/activeScene';
import { loadChapters, loadScenes } from '../../../services/supabase/entitiesService';
import { saveCampaignDocument } from '../../../services/storage/campaignDocuments';
import { persistenceKey, selectedContentMode } from '../../../services/storage/persistenceMode';
import { isSupabaseConfigured, supabase } from '../../../lib/supabaseClient';
import { generateUUID } from '../../../lib/uuid';
import type { Chapter } from '../../../types/chapter';
import type { Scene } from '../../../types/scene';
import { useActiveScene } from '../session/useActiveScene';
import { ActiveSceneMap } from '../session/ActiveSceneMap';
import { EmptyState } from '../ui/EmptyState';
import { HorrorButton } from '../ui/HorrorButton';
import { HorrorCard } from '../ui/HorrorCard';
import { SectionHeader } from '../ui/SectionHeader';

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
  const [busy, setBusy] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const { activeScene, channelReady, publish, clear } = useActiveScene(activeCampaignId);

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
      || (!item.sceneId && !!selectedScene.environmentId && item.environmentId === selectedScene.environmentId)
    );
    return {
      npcs: npcs.filter(belongs),
      monsters: monsters.filter(belongs),
      clues: clues.filter(belongs),
      situations: situations.filter(belongs),
    };
  }, [selectedScene, npcs, monsters, clues, situations]);

  const notify = (message: string) => {
    setToastMessage(message);
    window.setTimeout(() => setToastMessage(null), 2600);
  };

  const publishScene = async () => {
    if (!selectedScene || !selectedChapter || selectedScene.status !== 'ready') return;
    setBusy(true);
    try {
      await publish(buildActiveScenePublication(activeCampaignId, selectedScene, selectedChapter));
      notify(`Scena pubblicata: ${selectedScene.title}`);
    } catch (error) {
      setToastMessage(error instanceof Error ? error.message : 'Pubblicazione scena non riuscita.');
    } finally {
      setBusy(false);
    }
  };

  const clearScene = async () => {
    setBusy(true);
    try { await clear(); notify('Scena rimossa dalla sessione.'); }
    catch (error) { setToastMessage(error instanceof Error ? error.message : 'Rimozione scena non riuscita.'); }
    finally { setBusy(false); }
  };

  const startEncounter = async () => {
    if (!selectedScene) return;
    const encounter: ActiveEncounter = {
      id: generateUUID(),
      campaignId: activeCampaignId,
      environmentId: selectedScene.environmentId ?? selectedScene.id,
      environmentName: selectedScene.title,
      npcIds: sceneData.npcs.map(item => item.id),
      monsterIds: sceneData.monsters.map(item => item.id),
      clueIds: sceneData.clues.map(item => item.id),
      situationIds: sceneData.situations.map(item => item.id),
      startedAt: new Date().toISOString(),
    };
    try { await saveCampaignDocument(activeCampaignId, 'active-encounter', encounter); notify(`Encounter avviato: ${selectedScene.title}`); }
    catch (error) { setToastMessage(error instanceof Error ? error.message : 'Salvataggio encounter non riuscito.'); }
  };

  return (
    <div className="space-y-6">
      <HorrorCard className="p-6">
        <SectionHeader title="Scene & Encounter" description="Pubblica una Scena preparata nella sessione live o avvia il relativo incontro." icon={<Play className="h-8 w-8" />} />
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
              <div className="flex flex-wrap gap-3">
                <HorrorButton type="button" onClick={() => void publishScene()} disabled={busy || !channelReady || selectedScene.status !== 'ready'}><Eye className="h-4 w-4" />{activeScene?.sceneId === selectedScene.id ? 'Ripubblica scena' : 'Pubblica in sessione'}</HorrorButton>
                {activeScene && <HorrorButton type="button" onClick={() => void clearScene()} disabled={busy || !channelReady}><EyeOff className="h-4 w-4" />Nascondi scena attiva</HorrorButton>}
                <HorrorButton type="button" onClick={() => void startEncounter()} disabled={busy}><Play className="h-4 w-4" />Avvia encounter</HorrorButton>
              </div>
              {selectedScene.status !== 'ready' && <p className="text-xs text-amber-300">Imposta la Scena come “Pronta” nel Capitolo prima di pubblicarla.</p>}
              {!channelReady && <p className="text-xs text-[var(--dash-muted)]">Connessione alla sessione live in corso...</p>}
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
