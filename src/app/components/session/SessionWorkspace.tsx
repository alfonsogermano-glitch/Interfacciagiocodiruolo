import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { ChevronDown, ChevronRight, Loader2, Lock, Map, PanelLeftClose, PanelLeftOpen, Pause, Play, Square, Unlock } from 'lucide-react';
import { buildActiveScenePublication } from '../../../services/campaign/activeScene';
import { buildSceneEncounter, type ActiveEncounter } from '../../../services/campaign/sceneEncounter';
import { loadChapters, loadScenes } from '../../../services/supabase/entitiesService';
import type { ActiveScenePublication } from '../../../types/activeScene';
import type { Chapter } from '../../../types/chapter';
import type { Scene } from '../../../types/scene';
import { ActiveSceneMap } from './ActiveSceneMap';
import { MapViewport, type MapPlacement } from './MapViewport';
import { configureSessionGrid, DEFAULT_SESSION_GRID, type SessionGridSettings } from './mapToolStore';
import { useActiveScene } from './useActiveScene';
import { useCampaignDocument } from '../shared/useCampaignDocument';

const TREE_WIDTH_STORAGE_KEY = 'hollowgate.session.tree-width';
const TREE_DEFAULT_WIDTH = 280;
const TREE_MIN_WIDTH = 220;
const TREE_MAX_WIDTH = 480;

function readTreeWidth() {
  if (typeof window === 'undefined') return TREE_DEFAULT_WIDTH;
  const stored = Number(window.localStorage.getItem(TREE_WIDTH_STORAGE_KEY));
  return Number.isFinite(stored) && stored >= TREE_MIN_WIDTH && stored <= TREE_MAX_WIDTH ? stored : TREE_DEFAULT_WIDTH;
}

function chapterPreview(chapter: Chapter, mapPlacement?: MapPlacement): ActiveScenePublication {
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
    mapPlacement,
    mapRegions: [],
    contextMetadata: { timeOfDay: '', period: '', condition: '' },
    publishedAt: chapter.updatedAt,
  };
}

export function SessionWorkspace({
  campaignId,
  campaignName,
  campaignLogoUrl,
  isOwner,
  onEndSession,
}: {
  campaignId: string;
  campaignName: string;
  campaignLogoUrl?: string | null;
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
  const [encounterBusyId, setEncounterBusyId] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const [activeEncounter, setActiveEncounter] = useCampaignDocument<ActiveEncounter | null>('active-encounter', null, { enabled: isOwner, deleteWhenNull: true });
  const [mapPlacements, setMapPlacements] = useCampaignDocument<Record<string, MapPlacement>>('session-map-placements', {});
  const [chapterGrids, setChapterGrids] = useCampaignDocument<Record<string, SessionGridSettings>>('session-map-grids', {});
  const [treeWidth, setTreeWidth] = useState(readTreeWidth);
  const [treeHidden, setTreeHidden] = useState(false);
  const [resizingTree, setResizingTree] = useState(false);
  const treeResizeRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);
  const sessionChapterPublishedRef = useRef(false);

  useEffect(() => {
    const syncQuickRollEdge = () => {
      document.documentElement.style.setProperty('--session-tree-edge', isOwner && !treeHidden && window.innerWidth >= 768 ? `${treeWidth}px` : '0px');
    };
    syncQuickRollEdge();
    window.addEventListener('resize', syncQuickRollEdge);
    try { window.localStorage.setItem(TREE_WIDTH_STORAGE_KEY, String(Math.round(treeWidth))); } catch { /* Resize still works without storage. */ }
    return () => {
      window.removeEventListener('resize', syncQuickRollEdge);
      document.documentElement.style.removeProperty('--session-tree-edge');
    };
  }, [isOwner, treeHidden, treeWidth]);

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
      setSelectedChapterId(current => current ?? nextChapters.find(chapter => chapter.isActive)?.id ?? activeScene?.chapterId ?? nextChapters[0]?.id ?? null);
      setSelectedSceneId(null);
    }).catch(error => console.error('Caricamento albero sessione non riuscito:', error))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [campaignId, isOwner]);

  useEffect(() => {
    if (!isOwner || !channelReady || loading || sessionChapterPublishedRef.current) return;
    const chapter = chapters.find(item => item.isActive)
      ?? chapters.find(item => item.id === activeScene?.chapterId)
      ?? chapters[0];
    if (!chapter) return;
    sessionChapterPublishedRef.current = true;
    setSelectedChapterId(chapter.id);
    setSelectedSceneId(null);
    const placement = mapPlacements[chapter.id]
      ?? (activeScene?.chapterId === chapter.id ? activeScene.mapPlacement : undefined)
      ?? { x: 0, y: 0, locked: false };
    void publish({ ...chapterPreview(chapter, placement), gridSettings: chapterGrids[chapter.id] ?? DEFAULT_SESSION_GRID }).catch(error => {
      sessionChapterPublishedRef.current = false;
      console.error('Pubblicazione Capitolo iniziale non riuscita:', error);
    });
  }, [activeScene?.chapterId, channelReady, chapterGrids, chapters, isOwner, loading, mapPlacements, publish]);

  const orderedChapters = useMemo(() => [...chapters].sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return a.createdAt.localeCompare(b.createdAt) || a.title.localeCompare(b.title, 'it');
  }), [chapters]);
  const selectedChapter = chapters.find(chapter => chapter.id === selectedChapterId) ?? null;
  const selectedScene = scenes.find(scene => scene.id === selectedSceneId) ?? null;
  const publicChapterPreview = activeScene ? {
    ...activeScene,
    id: `chapter:${activeScene.chapterId}`,
    sceneId: '',
    title: activeScene.chapterTitle,
    description: '',
    sceneImageUrl: null,
    mapRegions: [],
    contextMetadata: { timeOfDay: '', period: '', condition: '' },
  } : null;
  const display = selectedScene && selectedChapter
    ? { ...buildActiveScenePublication(campaignId, selectedScene, selectedChapter), mapPlacement: mapPlacements[selectedChapter.id] ?? (activeScene?.chapterId === selectedChapter.id ? activeScene.mapPlacement : undefined), gridSettings: chapterGrids[selectedChapter.id] ?? (activeScene?.chapterId === selectedChapter.id ? activeScene.gridSettings : undefined) ?? DEFAULT_SESSION_GRID }
    : selectedChapter
      ? { ...chapterPreview(selectedChapter, mapPlacements[selectedChapter.id] ?? (activeScene?.chapterId === selectedChapter.id ? activeScene.mapPlacement : undefined)), gridSettings: chapterGrids[selectedChapter.id] ?? (activeScene?.chapterId === selectedChapter.id ? activeScene.gridSettings : undefined) ?? DEFAULT_SESSION_GRID }
      : publicChapterPreview;
  const mapPlacement = display?.mapPlacement ?? { x: 0, y: 0, locked: false };
  const chooseScene = async (scene: Scene, chapter: Chapter) => {
    setSelectedChapterId(chapter.id);
    setSelectedSceneId(scene.id);
    if (scene.status !== 'ready' || !channelReady) return;
    setPublishingId(scene.id);
    try { await publish({ ...buildActiveScenePublication(campaignId, scene, chapter), mapPlacement: mapPlacements[chapter.id] ?? { x: 0, y: 0, locked: false }, gridSettings: chapterGrids[chapter.id] ?? DEFAULT_SESSION_GRID }); }
    catch (error) { console.error('Pubblicazione Scena dalla sessione non riuscita:', error); }
    finally { setPublishingId(null); }
  };

  const updateMapPlacement = (placement: MapPlacement) => {
    if (!isOwner || !display) return;
    setMapPlacements(current => ({ ...current, [display.chapterId]: placement }));
    if (channelReady) void publish({ ...display, mapPlacement: placement, publishedAt: new Date().toISOString() });
  };

  const updateGridSettings = (settings: SessionGridSettings) => {
    if (!isOwner || !display) return;
    setChapterGrids(current => ({ ...current, [display.chapterId]: settings }));
    if (channelReady) void publish({ ...display, gridSettings: settings, publishedAt: new Date().toISOString() });
  };

  useEffect(() => {
    const settings = display?.gridSettings ?? DEFAULT_SESSION_GRID;
    const normalizedSettings = settings.unit.trim().toLowerCase() === 'ft' ? { ...settings, unit: 'Metri' } : settings;
    configureSessionGrid(normalizedSettings, isOwner && Boolean(display), isOwner ? updateGridSettings : null);
    if (isOwner && display && normalizedSettings !== settings) updateGridSettings(normalizedSettings);
    return () => configureSessionGrid(DEFAULT_SESSION_GRID, false, null);
  }, [display?.chapterId, display?.gridSettings, display?.id, display?.mapPlacement, isOwner]);

  const endSession = async () => {
    setEnding(true);
    try { await onEndSession(); } finally { setEnding(false); }
  };

  const encounterMatchesScene = (scene: Scene) => activeEncounter?.sceneId === scene.id
    || (!activeEncounter?.sceneId && activeEncounter?.environmentId === (scene.environmentId ?? scene.id));

  const startEncounter = async (scene: Scene, chapter: Chapter) => {
    setEncounterBusyId(scene.id);
    try {
      if (activeScene?.sceneId !== scene.id) await chooseScene(scene, chapter);
      else { setSelectedChapterId(chapter.id); setSelectedSceneId(scene.id); }
      setActiveEncounter(await buildSceneEncounter(campaignId, scene));
    } catch (error) {
      console.error('Avvio incontro dalla sessione non riuscito:', error);
    } finally {
      setEncounterBusyId(null);
    }
  };

  const toggleEncounterPause = (scene: Scene) => {
    if (!activeEncounter || !encounterMatchesScene(scene)) return;
    const paused = activeEncounter.status === 'paused';
    setActiveEncounter({
      ...activeEncounter,
      status: paused ? 'running' : 'paused',
      pausedAt: paused ? undefined : new Date().toISOString(),
    });
  };

  const stopEncounter = (scene: Scene) => {
    if (encounterMatchesScene(scene)) setActiveEncounter(null);
  };

  const beginTreeResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    treeResizeRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: treeWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
    setResizingTree(true);
  };

  const moveTreeResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const resize = treeResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    setTreeWidth(Math.min(TREE_MAX_WIDTH, Math.max(TREE_MIN_WIDTH, resize.startWidth + event.clientX - resize.startX)));
  };

  const finishTreeResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (treeResizeRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    treeResizeRef.current = null;
    setResizingTree(false);
  };

  return (
    <div className={`grid h-full min-h-0 grid-cols-1 overflow-hidden bg-[#111318] ${isOwner && !treeHidden ? 'grid-rows-[minmax(220px,38vh)_minmax(0,1fr)] md:grid-cols-[var(--session-tree-width)_minmax(0,1fr)] md:grid-rows-1' : 'grid-rows-1'}`} style={{ '--session-tree-width': `${treeWidth}px` } as CSSProperties}>
      {isOwner && !treeHidden && <aside className="relative flex min-h-0 flex-col border-b border-white/10 bg-[#1a1d25] md:border-b-0 md:border-r">
        <div className="border-b border-white/10 px-4 py-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300">Sessione live</div>
          <div className="mt-2 flex min-w-0 items-center gap-3">
            {campaignLogoUrl ? <img src={campaignLogoUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-white/15" /> : <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-cyan-400/10 p-1 ring-1 ring-cyan-300/20"><img src="/icon-source-1024.png" alt="" className="h-full w-full object-contain opacity-90" style={{ filter: 'invert(1)' }} /></div>}
            <h2 className="min-w-0 truncate text-base font-semibold text-white">{campaignName}</h2>
            <button type="button" onClick={() => setTreeHidden(true)} aria-label="Nascondi pannello Capitoli e Scene" title="Nascondi pannello" className="ml-auto rounded-md p-1.5 text-white/50 hover:bg-white/10 hover:text-white"><PanelLeftClose className="h-4 w-4" /></button>
          </div>
          {isOwner && <button type="button" disabled={ending} onClick={() => void endSession()} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-700/70 bg-red-950/40 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-900/50 disabled:opacity-50">{ending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}Termina sessione</button>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="mb-3 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-[0.14em] text-white/60"><Map className="h-4 w-4" />Capitoli e Scene</div>
          {loading ? <div className="flex items-center gap-2 px-2 py-4 text-sm text-white/50"><Loader2 className="h-4 w-4 animate-spin" />Caricamento...</div> : (
            <div className="space-y-2">{orderedChapters.map(chapter => {
              const chapterScenes = scenes.filter(scene => scene.chapterId === chapter.id).sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'it'));
              const isCollapsed = collapsed.has(chapter.id);
              return <div key={chapter.id} className="relative">
                <div className={`flex items-center rounded-lg border ${selectedChapterId === chapter.id ? 'border-cyan-400/70 bg-cyan-400/10' : 'border-white/10 bg-white/[0.03]'}`}>
                  <button type="button" aria-label={isCollapsed ? 'Espandi Capitolo' : 'Comprimi Capitolo'} onClick={() => setCollapsed(current => { const next = new Set(current); if (next.has(chapter.id)) next.delete(chapter.id); else next.add(chapter.id); return next; })} className="p-2 text-white/50">{isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
                  <button type="button" onClick={() => { setSelectedChapterId(chapter.id); setSelectedSceneId(null); }} className="min-w-0 flex-1 py-2 pr-2 text-left"><span className="block truncate text-sm font-medium text-white">{chapter.title}</span>{chapter.isActive && <span className="text-[10px] uppercase tracking-wider text-cyan-300">Capitolo corrente</span>}</button>
                </div>
                {!isCollapsed && <div className="ml-5 border-l border-white/15 pl-3 pt-1.5">{chapterScenes.length === 0 ? <div className="py-2 text-xs text-white/35">Nessuna scena</div> : chapterScenes.map(scene => {
                  const encounterActive = encounterMatchesScene(scene);
                  const encounterPaused = encounterActive && activeEncounter?.status === 'paused';
                  return <div key={scene.id} className={`relative mb-1 flex w-full items-center rounded-md border text-xs ${selectedSceneId === scene.id ? 'border-cyan-400/60 bg-cyan-400/10 text-white' : 'border-transparent text-white/65 hover:bg-white/[0.05] hover:text-white'}`}>
                    <span className="absolute -left-[13px] top-1/2 h-px w-3 bg-white/15" />
                    <button type="button" onClick={() => void chooseScene(scene, chapter)} className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${scene.status === 'ready' ? 'bg-emerald-400' : scene.status === 'completed' ? 'bg-white/30' : 'bg-amber-400'}`} />
                      <span className="min-w-0 flex-1 truncate">{scene.title}</span>
                      {publishingId === scene.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    </button>
                    <div className="flex shrink-0 items-center gap-0.5 pr-1">
                      {!encounterActive && <button type="button" disabled={encounterBusyId === scene.id} onClick={() => void startEncounter(scene, chapter)} aria-label={`Avvia incontro ${scene.title}`} title="Avvia incontro" className="rounded p-1.5 text-emerald-300 hover:bg-emerald-400/15 disabled:opacity-40">{encounterBusyId === scene.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}</button>}
                      {encounterActive && <button type="button" onClick={() => toggleEncounterPause(scene)} aria-label={`${encounterPaused ? 'Riprendi' : 'Metti in pausa'} incontro ${scene.title}`} title={encounterPaused ? 'Riprendi incontro' : 'Pausa incontro'} className={`rounded p-1.5 text-amber-300 hover:bg-amber-400/15 ${encounterPaused ? 'animate-pulse bg-amber-400/15' : ''}`}><Pause className="h-3.5 w-3.5" /></button>}
                      {encounterActive && <button type="button" onClick={() => stopEncounter(scene)} aria-label={`Termina incontro ${scene.title}`} title="Termina incontro" className="rounded p-1.5 text-red-300 hover:bg-red-400/15"><Square className="h-3.5 w-3.5 fill-current" /></button>}
                    </div>
                  </div>;
                })}</div>}
              </div>;
            })}</div>
          )}
        </div>
        {display && <div className="border-t border-white/10 p-3"><div className="mb-2 truncate text-xs font-medium text-white/70">{display.chapterTitle}</div><button type="button" data-map-lock={mapPlacement.locked ? 'locked' : 'unlocked'} aria-label={mapPlacement.locked ? 'Sblocca mappa' : 'Blocca mappa'} onClick={() => updateMapPlacement({ ...mapPlacement, locked: !mapPlacement.locked })} className={`flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${mapPlacement.locked ? 'border-amber-400/50 bg-amber-400/10 text-amber-200' : 'border-white/15 bg-white/[0.04] text-white/65 hover:bg-white/[0.08]'}`}>{mapPlacement.locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}{mapPlacement.locked ? 'Mappa bloccata' : 'Mappa sbloccata'}</button></div>}
        <div role="separator" aria-orientation="vertical" aria-label="Ridimensiona albero Capitoli e Scene" aria-valuemin={TREE_MIN_WIDTH} aria-valuemax={TREE_MAX_WIDTH} aria-valuenow={Math.round(treeWidth)} onPointerDown={beginTreeResize} onPointerMove={moveTreeResize} onPointerUp={finishTreeResize} onPointerCancel={finishTreeResize} onLostPointerCapture={() => { treeResizeRef.current = null; setResizingTree(false); }} className="group absolute inset-y-0 -right-1 z-30 hidden w-2 cursor-col-resize touch-none md:block"><div className={`pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors ${resizingTree ? 'bg-cyan-300' : 'bg-transparent group-hover:bg-cyan-300/80'}`} /></div>
      </aside>}

      <main className="relative min-h-0 overflow-hidden bg-[radial-gradient(circle_at_center,#262a31_0%,#14161b_58%,#0d0f13_100%)]">
        {isOwner && treeHidden && <button type="button" onClick={() => setTreeHidden(false)} aria-label="Mostra pannello Capitoli e Scene" title="Mostra pannello" className="absolute left-3 top-3 z-40 rounded-lg border border-white/15 bg-black/60 p-2 text-white/70 shadow-lg backdrop-blur hover:text-white"><PanelLeftOpen className="h-4 w-4" /></button>}
        {display ? (display.mapUrl || display.sceneImageUrl ? <MapViewport key={`${display.campaignId}:${display.chapterId}`} mapId={`${display.campaignId}:${display.chapterId}`} backgroundUrl={display.mapMetadata.previewUrl ?? display.mapUrl ?? display.sceneImageUrl} isOwner={isOwner} mapPlacement={mapPlacement} gridSettings={display.gridSettings ?? DEFAULT_SESSION_GRID} onMapPlacementChange={updateMapPlacement}><ActiveSceneMap scene={display} unframed /></MapViewport> : <div className="grid h-full min-h-[55vh] place-items-center px-8 text-center"><div><Map className="mx-auto h-12 w-12 text-white/20" /><p className="mt-3 text-sm text-white/45">Nessuna mappa assegnata a questo Capitolo.</p></div></div>) : <div className="grid h-full min-h-[60vh] place-items-center text-center"><div><Map className="mx-auto h-14 w-14 text-white/15" /><h1 className="mt-4 text-xl font-semibold text-white/70">In attesa della mappa</h1><p className="mt-2 text-sm text-white/40">Il Game Master selezionerà il Capitolo da giocare.</p></div></div>}
      </main>
    </div>
  );
}
