import { useEffect, useMemo, useRef, useState } from 'react';
import { Boxes, Clapperboard, GitBranch, LayoutDashboard, Map as MapIcon, PanelLeftClose, PanelLeftOpen, Plus, Edit2, Save, Star, Trash2, Upload, Waypoints, X } from 'lucide-react';
import { toast } from 'sonner';
import { CAMPAIGN_STORAGE_KEYS } from '../../../services/campaign/campaignStorageKeys';
import type { Chapter, ChapterKind } from '../../../types/chapter';
import type { Scene } from '../../../types/scene';
import {
  loadChapters,
  loadEnvironments,
  loadScenes,
  saveChapter as saveChapterToSupabase,
  saveScene as saveSceneToSupabase,
  deleteChapter as deleteChapterFromSupabase
} from '../../../services/supabase/entitiesService';
import { persistenceKey, persistenceOwner } from '../../../services/storage/persistenceMode';
import { generateUUID } from '../../../lib/uuid';
import { uploadContentAsset } from '../../../services/storage/contentAssets';
import { LEGACY_CHAPTER_STORAGE_KEYS, normalizeLegacyChapterValue } from '../../../services/campaign/chapterMigration';
import { ChapterScenesEditor } from './ChapterScenesEditor';
import { NarrativeScopeContent } from './NarrativeScopeContent';
import {
  migrateEnvironmentDomainTables,
  normalizeChapterSpatialValue,
  normalizeSceneSpatialValue,
  resolveChapterNavigation
} from '../../../services/campaign/spatialDomainMigration';

const CHAPTERS_STORAGE_KEY = CAMPAIGN_STORAGE_KEYS.chapters;
const ACTIVE_CHAPTER_STORAGE_KEY = CAMPAIGN_STORAGE_KEYS.activeChapter;

// Nessun capitolo predefinito: gli utenti costruiscono la propria struttura.

export type ChapterManagerNavigationTarget = {
  tabId: string;
  entityId?: string;
  entityType?: string;
};

interface ChapterManagerProps {
  campaignId?: string;
  storageRefreshKey?: number;
  navigationTarget?: ChapterManagerNavigationTarget | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function canvasToWebp(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(
    blob => blob ? resolve(blob) : reject(new Error('Ottimizzazione mappa non riuscita.')),
    'image/webp',
    quality,
  ));
}

async function createMapRenditions(file: File): Promise<{ preview: Blob; display: Blob }> {
  const bitmap = await createImageBitmap(file);
  const render = (maxEdge: number) => {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Elaborazione mappa non disponibile.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas;
  };
  try {
    const displayCanvas = render(4096);
    const previewCanvas = render(1200);
    const [display, preview] = await Promise.all([canvasToWebp(displayCanvas, 0.82), canvasToWebp(previewCanvas, 0.78)]);
    return { display, preview };
  } finally {
    bitmap.close();
  }
}

function readStoredChapters(key: string): Chapter[] {
  try {
    const raw = window.localStorage.getItem(persistenceKey(key));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? normalizeLegacyChapterValue(parsed) : [];
  } catch {
    return [];
  }
}

function getKindLabel(kind: ChapterKind): string {
  switch (kind) {
    case 'intro':
      return 'Introduttivo';
    case 'final':
      return 'Finale';
    default:
      return 'Standard';
  }
}

export function ChapterManager({
  campaignId: providedCampaignId = '',
  storageRefreshKey = 0,
  navigationTarget = null
}: ChapterManagerProps) {
  const campaignId = providedCampaignId;
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(
    () => {
      if (typeof window === 'undefined') {
        return null;
      }

      return window.localStorage.getItem(persistenceKey(ACTIVE_CHAPTER_STORAGE_KEY))
        ?? window.localStorage.getItem(persistenceKey(LEGACY_CHAPTER_STORAGE_KEYS.activeChapter))
        ?? null;
    }
  );

  const [isEditing, setIsEditing] = useState(false);
  const [chapterDraft, setChapterDraft] = useState<Chapter | null>(null);
  const [isUploadingMap, setIsUploadingMap] = useState(false);
  const mapFileInputRef = useRef<HTMLInputElement>(null);
  const [activePanel, setActivePanel] = useState<'overview' | 'map' | 'content' | 'scenes' | 'flow'>('overview');
  const [chapterListCollapsed, setChapterListCollapsed] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const [loadedChapters, loadedEnvironments, loadedScenes] = await Promise.all([
          loadChapters(campaignId),
          loadEnvironments(campaignId).catch(error => {
            console.error('Errore caricamento luoghi legacy:', error);
            return [];
          }),
          loadScenes(campaignId).catch(error => {
            console.error('Errore caricamento scene:', error);
            return [] as Scene[];
          })
        ]);
        const legacyChapters = readStoredChapters(LEGACY_CHAPTER_STORAGE_KEYS.chapters);
        const relevantLegacyChapters = legacyChapters.filter(chapter => chapter.campaignId === campaignId);
        const legacyById = new Map(relevantLegacyChapters.map(chapter => [chapter.id, chapter]));
        const migratedChapters = loadedChapters.map(chapter => {
          const normalized = normalizeLegacyChapterValue(chapter);
          const legacy = legacyById.get(chapter.id);
          return normalizeChapterSpatialValue({
            ...normalized,
            kind: legacy?.kind ?? normalized.kind ?? 'standard',
            isActive: legacy?.isActive ?? normalized.isActive ?? false,
            nextChapterIds: legacy?.nextChapterIds ?? normalized.nextChapterIds ?? [],
            createdAt: normalized.createdAt ?? new Date().toISOString(),
            updatedAt: normalized.updatedAt ?? normalized.createdAt ?? new Date().toISOString(),
          });
        });
        const loadedIds = new Set(migratedChapters.map(chapter => chapter.id));
        migratedChapters.push(...relevantLegacyChapters.filter(chapter => !loadedIds.has(chapter.id)));

        // Cutover lato client: le Environment diventano Capitoli/Scene senza
        // rimuovere la conservazione di compatibilità (le righe luogo restano
        // intatte in storage/DB e vengono rileggute al prossimo caricamento).
        const loadedSceneIds = new Set(loadedScenes.map(scene => scene.id));
        const campaignEnvironments = loadedEnvironments.filter(
          environment => !environment.campaignId || environment.campaignId === campaignId
        );
        const tables = migrateEnvironmentDomainTables({
          chapters: migratedChapters,
          scenes: loadedScenes,
          environments: campaignEnvironments,
        });
        const mergedChapters = (tables.chapters ?? []).map(row =>
          normalizeChapterSpatialValue(row as Chapter)
        );
        const mergedScenes = (tables.scenes ?? []).map(row =>
          normalizeSceneSpatialValue(row as Scene)
        );
        setChapters(mergedChapters);

        const createdChapters = mergedChapters.filter(chapter => !loadedIds.has(chapter.id));
        const createdScenes = mergedScenes.filter(scene => !loadedSceneIds.has(scene.id));
        if (createdChapters.length || createdScenes.length || relevantLegacyChapters.length) {
          // Con capitoli legacy da fondere si risalvano tutti (arricchiscono i
          // capitoli esistenti con kind/isActive/nextChapterIds); altrimenti
          // solo i nuovi capitoli/scene prodotti dalla conversione.
          const chaptersToPersist = relevantLegacyChapters.length ? mergedChapters : createdChapters;
          await Promise.all([
            ...chaptersToPersist.map(chapter => saveChapterToSupabase(campaignId, chapter)),
            ...createdScenes.map(scene => saveSceneToSupabase(campaignId, scene)),
          ]);
        }
        if (relevantLegacyChapters.length) {
          const remainingLegacy = legacyChapters.filter(chapter => chapter.campaignId !== campaignId);
          if (remainingLegacy.length) {
            window.localStorage.setItem(persistenceKey(LEGACY_CHAPTER_STORAGE_KEYS.chapters), JSON.stringify(remainingLegacy));
          } else {
            window.localStorage.removeItem(persistenceKey(LEGACY_CHAPTER_STORAGE_KEYS.chapters));
          }
        }
      } catch (error) {
        console.error('Errore caricamento capitoli da Supabase:', error);

        try {
          const stored = readStoredChapters(CHAPTERS_STORAGE_KEY);
          setChapters(stored.length ? stored : readStoredChapters(LEGACY_CHAPTER_STORAGE_KEYS.chapters));
        } catch (localError) {
          console.error('Errore caricamento capitoli da localStorage:', localError);
          setChapters([]);
        }
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [campaignId, storageRefreshKey]);

  useEffect(() => {
    if (isLoading) return;

    try {
      window.localStorage.setItem(
        persistenceKey(CHAPTERS_STORAGE_KEY),
        JSON.stringify(chapters)
      );
    } catch (error) {
      console.error('Errore nel salvataggio dei capitoli su localStorage:', error);
    }
  }, [chapters, isLoading]);

  const filteredChapters = useMemo(() => {
    return chapters.filter(chapter => chapter.campaignId === campaignId);
  }, [chapters, campaignId]);

  const selectedChapter =
    filteredChapters.find(chapter => chapter.id === selectedChapterId)
    ?? null;
  const isChapterDirty = !!selectedChapter && !!chapterDraft
    && JSON.stringify(chapterDraft) !== JSON.stringify(selectedChapter);

  useEffect(() => {
    if (!isChapterDirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [isChapterDirty]);

  const discardChapterDraft = () => {
    setChapterDraft(null);
    setIsEditing(false);
  };

  const confirmDiscardChapterDraft = () => !isChapterDirty
    || window.confirm('Le modifiche non salvate andranno perse. Continuare?');

  const beginChapterEditing = () => {
    if (!selectedChapter) return;
    setChapterDraft(structuredClone(selectedChapter));
    setIsEditing(true);
  };

  const saveChapterDraft = async () => {
    if (!chapterDraft) return;
    if (chapterDraft.isActive && !selectedChapter?.isActive) await setActiveChapter(chapterDraft.id);
    await updateChapter(chapterDraft);
    setChapterDraft(null);
    setIsEditing(false);
    toast.success('Capitolo salvato.');
  };

  const cancelChapterEditing = () => {
    if (!confirmDiscardChapterDraft()) return;
    discardChapterDraft();
  };

  const changePanel = (panel: typeof activePanel) => {
    if (panel === activePanel) return;
    if (isEditing) {
      if (!confirmDiscardChapterDraft()) return;
      discardChapterDraft();
    }
    setActivePanel(panel);
  };

  const handleMapFile = async (file: File | null) => {
    if (!file || !chapterDraft) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Seleziona un file immagine valido.');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error('La mappa non può superare 50 MB.');
      return;
    }

    setIsUploadingMap(true);
    try {
      const extension = file.name.split('.').pop()?.toLowerCase() || 'png';
      const basePath = `${persistenceOwner()}/${campaignId}/chapter-maps/${generateUUID()}`;
      const { display, preview } = await createMapRenditions(file);
      const [{ publicUrl }, { publicUrl: displayUrl }, { publicUrl: previewUrl }] = await Promise.all([
        uploadContentAsset('visual-assets', `${basePath}.${extension}`, file, { contentType: file.type, upsert: false }),
        uploadContentAsset('visual-assets', `${basePath}-display.webp`, display, { contentType: 'image/webp', upsert: false }),
        uploadContentAsset('visual-assets', `${basePath}-preview.webp`, preview, { contentType: 'image/webp', upsert: false }),
      ]);
      setChapterDraft(current => current ? {
        ...current,
        mapUrl: publicUrl,
        mapMetadata: { ...current.mapMetadata, imageUrl: publicUrl, displayUrl, previewUrl, source: 'upload', fileName: file.name },
      } : current);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Caricamento mappa non riuscito.');
    } finally {
      setIsUploadingMap(false);
      if (mapFileInputRef.current) mapFileInputRef.current.value = '';
    }
  };

  // Navigazione dagli archivi (Mostri/Archivio Oggetti): accetta sia target
  // "chapter" sia target legacy "environment", mappando i vecchi ID tramite i
  // marker persistiti della migrazione (sourceEnvironment).
  useEffect(() => {
    if (!navigationTarget) return;
    if (navigationTarget.tabId !== 'chapters') return;
    if (navigationTarget.entityType !== 'chapter' && navigationTarget.entityType !== 'environment') return;
    if (!navigationTarget.entityId) return;

    const target = resolveChapterNavigation(navigationTarget.entityId, filteredChapters);
    if (!target) return;

    setSelectedChapterId(target.id);
    setIsEditing(false);
    setChapterDraft(null);
    setActivePanel('overview');
  }, [navigationTarget, filteredChapters]);

  useEffect(() => {
    if (!selectedChapterId) {
      return;
    }

    try {
      window.localStorage.setItem(
        persistenceKey(ACTIVE_CHAPTER_STORAGE_KEY),
        selectedChapterId
      );
      window.localStorage.removeItem(persistenceKey(LEGACY_CHAPTER_STORAGE_KEYS.activeChapter));
    } catch (error) {
      console.error('Errore nel salvataggio del capitolo attivo:', error);
    }
  }, [selectedChapterId]);

  const addChapter = async () => {
    const timestamp = nowIso();

    const newChapter: Chapter = normalizeChapterSpatialValue({
      id: generateUUID(),
      campaignId,
      title: 'Nuovo Capitolo',
      description: '',
      notes: '',
      kind: 'standard',
      isActive: filteredChapters.length === 0,
      nextChapterIds: [],
      createdAt: timestamp,
      updatedAt: timestamp,
      mapUrl: null,
      mapMetadata: { imageUrl: null, gridVisible: true, gridColumns: 20, gridRows: 20 },
      locationMetadata: {},
    });

    setChapters(prev => {
      const next = [...prev, newChapter];

      if (newChapter.isActive) {
        return next.map(chapter => ({
          ...chapter,
          isActive: chapter.id === newChapter.id
        }));
      }

      return next;
    });

    setSelectedChapterId(newChapter.id);
    setChapterDraft(structuredClone(newChapter));
    setIsEditing(true);

    try {
      await saveChapterToSupabase(campaignId, newChapter);
    } catch (error) {
      console.error('Errore salvataggio capitolo su Supabase:', error, newChapter);
    }
  };

  const updateChapter = async (updatedChapter: Chapter) => {
    const nextChapter = {
      ...updatedChapter,
      updatedAt: nowIso()
    };

    setChapters(prev =>
      prev.map(chapter =>
        chapter.id === nextChapter.id ? nextChapter : chapter
      )
    );

    try {
      await saveChapterToSupabase(campaignId, nextChapter);
    } catch (error) {
      console.error('Errore aggiornamento capitolo su Supabase:', error, nextChapter);
    }
  };

  const deleteChapter = async (id: string) => {
  if (!confirm('Eliminare questo capitolo?')) {
    return;
  }

  let fallbackId: string | null = null;

  setChapters(prev => {
    let next = prev.filter(chapter => chapter.id !== id);

    const stillHasActive = next.some(chapter => chapter.isActive);

    if (!stillHasActive && next.length > 0) {
      next = next.map((chapter, index) => ({
        ...chapter,
        isActive: index === 0,
        updatedAt: index === 0 ? nowIso() : chapter.updatedAt
      }));
    }

    fallbackId = next.find(chapter => chapter.campaignId === campaignId)?.id ?? null;

    return next.map(chapter => ({
      ...chapter,
      nextChapterIds: (chapter.nextChapterIds ?? []).filter(
        nextId => nextId !== id
      )
    }));
  });

  if (selectedChapterId === id) {
    setSelectedChapterId(fallbackId);
    setIsEditing(false);
    setChapterDraft(null);
  }

  try {
    await deleteChapterFromSupabase(id);
  } catch (error) {
    console.error('Errore eliminazione capitolo da Supabase:', error);
  }
};

  const setActiveChapter = async (id: string) => {
    const updatedChapters = chapters.map(chapter => ({
      ...chapter,
      isActive: chapter.id === id,
      updatedAt: chapter.id === id ? nowIso() : chapter.updatedAt
    }));

    setChapters(updatedChapters);
    setSelectedChapterId(id);

    // Save all affected chapters to Supabase
    for (const chapter of updatedChapters) {
      try {
        await saveChapterToSupabase(campaignId, chapter);
      } catch (error) {
        console.error('Errore aggiornamento capitolo attivo su Supabase:', error, chapter);
      }
    }
  };

  const toggleNextChapter = (targetId: string) => {
    if (!selectedChapter) {
      return;
    }

    const source = chapterDraft ?? selectedChapter;
    const currentNext = source.nextChapterIds ?? [];

    const alreadyLinked = currentNext.includes(targetId);

    const updatedChapter: Chapter = {
      ...source,
      nextChapterIds: alreadyLinked
        ? currentNext.filter(id => id !== targetId)
        : [...currentNext, targetId]
    };

    setChapterDraft(updatedChapter);
  };

  return (
    <div className={`grid gap-4 ${chapterListCollapsed ? 'grid-cols-[minmax(0,1fr)]' : 'grid-cols-[220px_minmax(0,1fr)]'}`}>
      <div className={`${chapterListCollapsed ? 'hidden' : 'block'} sticky top-4 max-h-[calc(100vh-7rem)] self-start space-y-2 overflow-y-auto pr-1`}>
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-[var(--dash-text-strong)]">Capitoli</h2>
            <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--dash-muted)]">{filteredChapters.length} totali</p>
          </div>

          <button
            onClick={addChapter}
            aria-label="Nuovo capitolo"
            title="Nuovo capitolo"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-[var(--dash-border)] bg-[var(--dash-panel)] text-[var(--dash-text)] transition-colors hover:border-[var(--dash-accent)] hover:text-[var(--dash-text-strong)]"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-1">
          {filteredChapters.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--dash-border-soft)] bg-[var(--dash-surface)] px-3 py-5 text-center">
              <GitBranch className="mx-auto mb-2 h-6 w-6 text-[var(--dash-muted)]" />
              <p className="text-xs text-[var(--dash-muted)]">Nessun capitolo</p>
            </div>
          ) : (
            filteredChapters.map(chapter => (
              <button
                type="button"
                key={chapter.id}
                onClick={() => {
                  if (chapter.id === selectedChapterId) return;
                  if (!confirmDiscardChapterDraft()) return;
                  discardChapterDraft();
                  setSelectedChapterId(chapter.id);
                  setActivePanel('overview');
                }}
                className={`relative w-full rounded-lg border px-2.5 py-2 text-left transition-colors ${
                  selectedChapterId === chapter.id
                    ? 'border-[var(--dash-accent)] bg-[var(--dash-panel)] shadow-[inset_3px_0_0_var(--dash-accent)]'
                    : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface)] hover:border-[var(--dash-accent)]'
                }`}
              >
                <h3 className="truncate pr-2 text-sm font-medium text-[var(--dash-text-strong)]">{chapter.title}</h3>
                <div className="mt-1 flex items-center gap-1.5 text-[10px] text-[var(--dash-muted)]">
                  <span>{getKindLabel(chapter.kind)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{(chapter.nextChapterIds ?? []).length} uscite</span>
                  {chapter.isActive && <><span aria-hidden="true">·</span><span className="text-[var(--dash-accent-2)]">Attivo</span></>}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="min-w-0">
        {selectedChapter ? (
          <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-6">
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-[var(--dash-text-strong)]">
                  {selectedChapter.title}
                </h2>
                <p className="mt-1 text-sm text-[var(--dash-text)]">
                  {getKindLabel(selectedChapter.kind)}
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  data-chapter-list-toggle
                  onClick={() => setChapterListCollapsed(collapsed => !collapsed)}
                  aria-label={chapterListCollapsed ? 'Mostra elenco Capitoli' : 'Nascondi elenco Capitoli'}
                  title={chapterListCollapsed ? 'Mostra elenco Capitoli' : 'Nascondi elenco Capitoli'}
                  className="rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-2 text-[var(--dash-muted)] transition-colors hover:border-[var(--dash-accent)] hover:text-[var(--dash-text-strong)]"
                >
                  {chapterListCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                </button>
                {isEditing ? <>
                  <button type="button" onClick={() => void saveChapterDraft()} disabled={!isChapterDirty || isUploadingMap} aria-label="Salva modifiche Capitolo" title="Salva modifiche" className="rounded-md border border-[var(--dash-accent)] bg-[var(--dash-accent)] p-2 text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-accent-2)] disabled:cursor-not-allowed disabled:opacity-40"><Save className="h-4 w-4" /></button>
                  <button type="button" onClick={cancelChapterEditing} aria-label="Annulla modifiche Capitolo" title="Annulla modifiche" className="rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-2 text-[var(--dash-muted)] transition-colors hover:border-[var(--dash-danger-border)] hover:text-[var(--dash-danger-text)]"><X className="h-4 w-4" /></button>
                </> : <button
                  onClick={beginChapterEditing}
                  aria-label="Modifica Capitolo"
                  title="Modifica Capitolo"
                  className="rounded-md border border-[var(--dash-accent)] bg-[var(--dash-accent)] p-2 text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-accent-2)]"
                >
                  <Edit2 className="h-4 w-4" />
                </button>}

                <button
  onClick={() => deleteChapter(selectedChapter.id)}
  aria-label="Elimina Capitolo"
  title="Elimina Capitolo"
  className="rounded-md border border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)] p-2 text-[var(--dash-danger-text)] transition-colors hover:bg-[var(--dash-danger-hover)]"
>
  <Trash2 className="h-4 w-4" />
</button>
              </div>
            </div>

            <div className="mb-6 grid grid-cols-2 gap-2 border-b border-[var(--dash-border-soft)] pb-4 sm:grid-cols-5">
              {([
                ['overview', 'Panoramica', LayoutDashboard],
                ['map', 'Mappa', MapIcon],
                ['content', 'Contenuti', Boxes],
                ['scenes', 'Scene', Clapperboard],
                ['flow', 'Diramazioni', Waypoints],
              ] as const).map(([id, label, Icon]) => (
                <button key={id} type="button" onClick={() => changePanel(id)} className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs transition-colors ${activePanel === id ? 'border-[var(--dash-accent)] bg-[var(--dash-accent)] text-[var(--dash-text-strong)]' : 'border-[var(--dash-border-soft)] bg-[var(--dash-panel)] text-[var(--dash-muted)] hover:border-[var(--dash-accent)] hover:text-[var(--dash-text)]'}`}>
                  <Icon className="h-4 w-4" />{label}
                </button>
              ))}
            </div>

            {isEditing && chapterDraft ? (
              <div className="space-y-4">
                <div className={activePanel === 'overview' ? '' : 'hidden'}>
                  <label className="mb-2 block text-[var(--dash-text)]">Titolo</label>
                  <input
                    type="text"
                    value={chapterDraft.title}
                    onChange={e => setChapterDraft({ ...chapterDraft, title: e.target.value })}
                    className="w-full rounded px-3 py-2 border-2 border-[var(--dash-border)] bg-[var(--dash-input)] text-[var(--dash-text)]"
                  />
                </div>

                <div className={activePanel === 'overview' ? '' : 'hidden'}>
                  <label className="mb-2 block text-[var(--dash-text)]">Descrizione</label>
                  <textarea
                    value={chapterDraft.description}
                    onChange={e => setChapterDraft({ ...chapterDraft, description: e.target.value })}
                    className="w-full h-28 resize-none rounded px-3 py-2 border-2 border-[var(--dash-border)] bg-[var(--dash-input)] text-[var(--dash-text)]"
                  />
                </div>

                <div className={activePanel === 'overview' ? '' : 'hidden'}>
                  <label className="mb-2 block text-[var(--dash-text)]">Note GM</label>
                  <textarea
                    value={chapterDraft.notes}
                    onChange={e => setChapterDraft({ ...chapterDraft, notes: e.target.value })}
                    className="w-full h-28 resize-none rounded px-3 py-2 border-2 border-[var(--dash-border)] bg-[var(--dash-input)] text-[var(--dash-text)]"
                  />
                </div>

                <div className={`${activePanel === 'map' ? '' : 'hidden'} rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4`}>
                  <div className="mb-3 text-sm uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Mappa generale del capitolo</div>
                  <label className="block text-sm text-[var(--dash-text)]">URL immagine mappa<input value={chapterDraft.mapMetadata.source === 'upload' ? '' : chapterDraft.mapUrl ?? ''} placeholder="https://..." onChange={e => setChapterDraft({ ...chapterDraft, mapUrl: e.target.value || null, mapMetadata: { ...chapterDraft.mapMetadata, imageUrl: e.target.value || null, displayUrl: null, previewUrl: null, source: 'url', fileName: null } })} className="mt-1 w-full rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2" /></label>
                  <div className="mt-3 flex flex-wrap items-center gap-2"><input ref={mapFileInputRef} type="file" accept="image/*" className="hidden" onChange={event => void handleMapFile(event.target.files?.[0] ?? null)} /><button type="button" disabled={isUploadingMap} onClick={() => mapFileInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-md border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-sm text-[var(--dash-text)] hover:border-[var(--dash-accent)] disabled:opacity-50"><Upload className="h-4 w-4" />{isUploadingMap ? 'Caricamento...' : 'Scegli file dal PC'}</button><span className="text-xs text-[var(--dash-muted)]">Immagini fino a 50 MB</span></div>
                  {chapterDraft.mapMetadata.source === 'upload' && chapterDraft.mapMetadata.fileName && <p className="mt-2 truncate text-xs text-[var(--dash-muted)]" title={chapterDraft.mapMetadata.fileName}>{chapterDraft.mapMetadata.fileName}</p>}
                </div>

                <div className={activePanel === 'overview' ? '' : 'hidden'}>
                  <label className="mb-2 block text-[var(--dash-text)]">Tipo Capitolo</label>
                  <select
                    value={chapterDraft.kind}
                    onChange={e => setChapterDraft({ ...chapterDraft, kind: e.target.value as ChapterKind })}
                    className="w-full rounded px-3 py-2 border-2 border-[var(--dash-border)] bg-[var(--dash-input)] text-[var(--dash-text)]"
                  >
                    <option value="intro">Introduttivo</option>
                    <option value="standard">Standard</option>
                    <option value="final">Finale</option>
                  </select>
                </div>

                <div className={`${activePanel === 'overview' ? '' : 'hidden'} rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4`}>
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-sm uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
                      Capitolo attivo
                    </div>

                    <button
                      type="button"
                      onClick={() => setChapterDraft({ ...chapterDraft, isActive: true })}
                      className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                        chapterDraft.isActive
                          ? 'border-[var(--dash-accent)] bg-[var(--dash-accent)] text-[var(--dash-text-strong)]'
                          : 'border-[var(--dash-border-soft)] bg-[var(--dash-panel)] text-[var(--dash-text)] hover:bg-[var(--dash-surface-2)]'
                      }`}
                    >
                      <Star className="h-4 w-4" />
                      {chapterDraft.isActive
                        ? 'Già attivo'
                        : 'Imposta come attivo'}
                    </button>
                  </div>
                </div>

                <div className={`${activePanel === 'flow' ? '' : 'hidden'} rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4`}>
                  <div className="mb-3 text-sm uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
                    Possibili capitoli successivi
                  </div>

                  <div className="space-y-2">
                    {filteredChapters
                      .filter(chapter => chapter.id !== selectedChapter.id)
                      .map(chapter => (
                        <label
                          key={chapter.id}
                          className="flex items-center gap-2 text-sm text-[var(--dash-text-strong)]"
                        >
                          <input
                            type="checkbox"
                            checked={(chapterDraft.nextChapterIds ?? []).includes(chapter.id)}
                            onChange={() => toggleNextChapter(chapter.id)}
                            className="h-4 w-4 accent-[var(--dash-accent)]"
                          />
                          <span>
                            {chapter.title} ·{' '}
                            <span className="text-[var(--dash-accent-2)]">
                              {getKindLabel(chapter.kind)}
                            </span>
                          </span>
                        </label>
                      ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className={activePanel === 'overview' ? '' : 'hidden'}>
                  <h3 className="mb-2 text-[var(--dash-text)]">Descrizione</h3>
                  <p className="text-[var(--dash-muted)]">
                    {selectedChapter.description || 'Nessuna descrizione'}
                  </p>
                </div>

                <div className={activePanel === 'overview' ? '' : 'hidden'}>
                  <h3 className="mb-2 text-[var(--dash-text)]">Note GM</h3>
                  <p className="text-[var(--dash-muted)]">
                    {selectedChapter.notes || 'Nessuna nota'}
                  </p>
                </div>

                <div className={activePanel === 'map' ? '' : 'hidden'}>
                  <h3 className="mb-2 text-[var(--dash-text)]">Mappa generale</h3>
                  {selectedChapter.mapUrl ? <img src={selectedChapter.mapMetadata.previewUrl ?? selectedChapter.mapUrl} alt={`Mappa di ${selectedChapter.title}`} className="max-h-80 w-full rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] object-contain" /> : <p className="text-[var(--dash-muted)]">Nessuna mappa assegnata.</p>}
                </div>

                <div className={`${activePanel === 'overview' ? '' : 'hidden'} rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] p-4`}>
                  <h3 className="mb-2 text-[var(--dash-text)]">Stato</h3>
                  <p className="text-[var(--dash-muted)]">
                    {selectedChapter.isActive
                      ? 'Questo è il capitolo attualmente attivo.'
                      : 'Capitolo disponibile ma non attivo.'}
                  </p>
                </div>

                <div className={`${activePanel === 'flow' ? '' : 'hidden'} rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] p-4`}>
                  <h3 className="mb-2 text-[var(--dash-text)]">Prossimi capitoli</h3>

                  {(selectedChapter.nextChapterIds ?? []).length === 0 ? (
                    <p className="text-[var(--dash-muted)]">
                      Nessuna diramazione definita.
                    </p>
                  ) : (
                    <ul className="space-y-1 text-[var(--dash-muted)]">
                      {(selectedChapter.nextChapterIds ?? []).map(nextId => {
                        const nextChapter = filteredChapters.find(
                          chapter => chapter.id === nextId
                        );

                        return (
                          <li key={nextId}>
                            • {nextChapter?.title ?? 'Capitolo rimosso'}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            )}
            <div className={activePanel === 'content' ? 'mt-2' : 'hidden'}>
              <NarrativeScopeContent campaignId={campaignId} chapterId={selectedChapter.id} />
            </div>
            <div className={activePanel === 'scenes' ? '' : 'hidden'}>
              <ChapterScenesEditor key={selectedChapter.id} campaignId={campaignId} chapter={selectedChapter} />
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-12 text-center">
            {chapterListCollapsed && <button type="button" data-chapter-list-toggle onClick={() => setChapterListCollapsed(false)} aria-label="Mostra elenco Capitoli" className="mx-auto mb-4 rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-2 text-[var(--dash-muted)]"><PanelLeftOpen className="h-4 w-4" /></button>}
            <GitBranch className="mx-auto mb-4 h-16 w-16 text-[var(--dash-muted)]" />
            <div className="text-xs uppercase tracking-[0.16em] text-[var(--dash-accent-2)]">
              Nessun capitolo selezionato
            </div>
            <h3 className="mt-2 text-xl font-semibold text-[var(--dash-text-strong)]">
              Seleziona un capitolo
            </h3>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[var(--dash-text)]">
              Apri un capitolo esistente oppure crea il primo blocco narrativo della campagna.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
