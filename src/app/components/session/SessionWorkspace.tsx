import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Eye, Loader2, Map, Square } from 'lucide-react';
import { buildActiveScenePublication } from '../../../services/campaign/activeScene';
import { loadChapters, loadScenes } from '../../../services/supabase/entitiesService';
import type { ActiveScenePublication } from '../../../types/activeScene';
import type { Chapter } from '../../../types/chapter';
import type { Scene } from '../../../types/scene';
import { ActiveSceneMap } from './ActiveSceneMap';
import { useActiveScene } from './useActiveScene';

function chapterPreview(chapter: Chapter): ActiveScenePublication {
  return {
    id: `chapter:${chapter.id}`,
    campaignId: chapter.campaignId,
    sceneId: '',
    chapterId: chapter.id,
    title: chapter.title,
    description: chapter.description,
    chapterTitle: chapter.title,
    mapUrl: chapter.mapUrl,
    sceneImageUrl: null,
    mapMetadata: chapter.mapMetadata,
    mapRegions: [],
    contextMetadata: { timeOfDay: '', period: '', condition: '' },
    publishedAt: chapter.updatedAt,
  };
}

export function SessionWorkspace({
  campaignId,
  campaignName,
  isOwner,
  onEndSession,
}: {
  campaignId: string;
  campaignName: string;
  isOwner: boolean;
  onEndSession: () => Promise<void>;
}) {
  const { activeScene, channelReady, publish } = useActiveScene(campaignId);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(isOwner);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!isOwner) {
      setChapters([]); setScenes([]); setLoading(false);
      return () => { cancelled = true; };
    }
    setLoading(true);
    void Promise.all([loadChapters(campaignId), loadScenes(campaignId)]).then(([nextChapters, nextScenes]) => {
      if (cancelled) return;
      setChapters(nextChapters);
      setScenes(nextScenes);
      setSelectedChapterId(current => current ?? activeScene?.chapterId ?? nextChapters.find(chapter => chapter.isActive)?.id ?? nextChapters[0]?.id ?? null);
    }).catch(error => console.error('Caricamento albero sessione non riuscito:', error))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [campaignId, isOwner]);

  useEffect(() => {
    if (!activeScene) return;
    setSelectedChapterId(activeScene.chapterId);
    setSelectedSceneId(activeScene.sceneId);
  }, [activeScene?.id]);

  const orderedChapters = useMemo(() => [...chapters].sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return a.createdAt.localeCompare(b.createdAt) || a.title.localeCompare(b.title, 'it');
  }), [chapters]);
  const selectedChapter = chapters.find(chapter => chapter.id === selectedChapterId) ?? null;
  const selectedScene = scenes.find(scene => scene.id === selectedSceneId) ?? null;
  const display = selectedScene && selectedChapter
    ? buildActiveScenePublication(campaignId, selectedScene, selectedChapter)
    : selectedChapter
      ? chapterPreview(selectedChapter)
      : activeScene;
  const publicChapters = activeScene ? [{
    id: activeScene.chapterId,
    title: activeScene.chapterTitle,
    scenes: [{ id: activeScene.sceneId, title: activeScene.title }],
  }] : [];

  const chooseScene = async (scene: Scene, chapter: Chapter) => {
    setSelectedChapterId(chapter.id);
    setSelectedSceneId(scene.id);
    if (scene.status !== 'ready' || !channelReady) return;
    setPublishingId(scene.id);
    try { await publish(buildActiveScenePublication(campaignId, scene, chapter)); }
    catch (error) { console.error('Pubblicazione Scena dalla sessione non riuscita:', error); }
    finally { setPublishingId(null); }
  };

  const endSession = async () => {
    setEnding(true);
    try { await onEndSession(); } finally { setEnding(false); }
  };

  return (
    <div className="grid h-full min-h-0 grid-cols-1 grid-rows-[minmax(220px,38vh)_minmax(0,1fr)] overflow-hidden bg-[#111318] md:grid-cols-[280px_minmax(0,1fr)] md:grid-rows-1">
      <aside className="flex min-h-0 flex-col border-b border-white/10 bg-[#1a1d25] md:border-b-0 md:border-r">
        <div className="border-b border-white/10 px-4 py-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300">Sessione live</div>
          <h2 className="mt-1 truncate text-base font-semibold text-white">{campaignName}</h2>
          {isOwner && <button type="button" disabled={ending} onClick={() => void endSession()} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-700/70 bg-red-950/40 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-900/50 disabled:opacity-50">{ending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}Termina sessione</button>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="mb-3 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-[0.14em] text-white/60"><Map className="h-4 w-4" />Capitoli e Scene</div>
          {loading ? <div className="flex items-center gap-2 px-2 py-4 text-sm text-white/50"><Loader2 className="h-4 w-4 animate-spin" />Caricamento...</div> : isOwner ? (
            <div className="space-y-2">{orderedChapters.map(chapter => {
              const chapterScenes = scenes.filter(scene => scene.chapterId === chapter.id).sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'it'));
              const isCollapsed = collapsed.has(chapter.id);
              return <div key={chapter.id} className="relative">
                <div className={`flex items-center rounded-lg border ${selectedChapterId === chapter.id ? 'border-cyan-400/70 bg-cyan-400/10' : 'border-white/10 bg-white/[0.03]'}`}>
                  <button type="button" aria-label={isCollapsed ? 'Espandi Capitolo' : 'Comprimi Capitolo'} onClick={() => setCollapsed(current => { const next = new Set(current); if (next.has(chapter.id)) next.delete(chapter.id); else next.add(chapter.id); return next; })} className="p-2 text-white/50">{isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
                  <button type="button" onClick={() => { setSelectedChapterId(chapter.id); setSelectedSceneId(null); }} className="min-w-0 flex-1 py-2 pr-2 text-left"><span className="block truncate text-sm font-medium text-white">{chapter.title}</span>{chapter.isActive && <span className="text-[10px] uppercase tracking-wider text-cyan-300">Capitolo corrente</span>}</button>
                </div>
                {!isCollapsed && <div className="ml-5 border-l border-white/15 pl-3 pt-1.5">{chapterScenes.length === 0 ? <div className="py-2 text-xs text-white/35">Nessuna scena</div> : chapterScenes.map(scene => <button key={scene.id} type="button" onClick={() => void chooseScene(scene, chapter)} className={`relative mb-1 flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left text-xs ${selectedSceneId === scene.id ? 'border-cyan-400/60 bg-cyan-400/10 text-white' : 'border-transparent text-white/65 hover:bg-white/[0.05] hover:text-white'}`}><span className="absolute -left-[13px] top-1/2 h-px w-3 bg-white/15" /><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${scene.status === 'ready' ? 'bg-emerald-400' : scene.status === 'completed' ? 'bg-white/30' : 'bg-amber-400'}`} /><span className="min-w-0 flex-1 truncate">{scene.title}</span>{publishingId === scene.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : activeScene?.sceneId === scene.id ? <Eye className="h-3.5 w-3.5 text-cyan-300" /> : null}</button>)}</div>}
              </div>;
            })}</div>
          ) : publicChapters.length === 0 ? <div className="rounded-lg border border-dashed border-white/15 px-3 py-5 text-center text-xs text-white/45">Il Game Master non ha ancora pubblicato una Scena.</div> : <div className="space-y-2">{publicChapters.map(chapter => <div key={chapter.id}><div className="rounded-lg border border-cyan-400/70 bg-cyan-400/10 px-3 py-2 text-sm font-medium text-white">{chapter.title}</div><div className="ml-5 border-l border-white/15 py-1 pl-3">{chapter.scenes.map(scene => <div key={scene.id} className="relative rounded-md bg-white/[0.05] px-3 py-2 text-xs text-white"><span className="absolute -left-[13px] top-1/2 h-px w-3 bg-white/15" />{scene.title}</div>)}</div></div>)}</div>}
        </div>
      </aside>

      <main className="relative min-h-0 overflow-auto bg-[radial-gradient(circle_at_center,#262a31_0%,#14161b_58%,#0d0f13_100%)] p-4 sm:p-6">
        {display ? <div className="mx-auto flex min-h-full max-w-[1600px] flex-col justify-center">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><div className="text-xs uppercase tracking-[0.16em] text-cyan-300">{display.chapterTitle}</div>{display.sceneId && <h1 className="mt-1 text-xl font-semibold text-white">{display.title}</h1>}</div>{isOwner && selectedScene?.status !== 'ready' && selectedScene && <span className="rounded-full border border-amber-500/50 bg-amber-500/10 px-3 py-1 text-xs text-amber-200">Anteprima privata · Scena non pronta</span>}</div>
          {display.mapUrl || display.sceneImageUrl ? <ActiveSceneMap scene={display} /> : <div className="grid min-h-[55vh] place-items-center rounded-xl border border-dashed border-white/15 bg-black/20 px-8 text-center"><div><Map className="mx-auto h-12 w-12 text-white/20" /><p className="mt-3 text-sm text-white/45">Nessuna mappa assegnata a questo Capitolo.</p></div></div>}
          {display.description && <p className="mt-4 max-w-3xl whitespace-pre-wrap text-sm leading-relaxed text-white/70">{display.description}</p>}
        </div> : <div className="grid h-full min-h-[60vh] place-items-center text-center"><div><Map className="mx-auto h-14 w-14 text-white/15" /><h1 className="mt-4 text-xl font-semibold text-white/70">In attesa della mappa</h1><p className="mt-2 text-sm text-white/40">Il Game Master selezionerà il Capitolo da giocare.</p></div></div>}
      </main>
    </div>
  );
}
