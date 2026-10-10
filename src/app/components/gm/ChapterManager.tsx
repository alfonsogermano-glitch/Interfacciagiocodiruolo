import { useEffect, useMemo, useState } from 'react';
import { GitBranch, Plus, Edit2, Trash2, Star } from 'lucide-react';
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
import { persistenceKey } from '../../../services/storage/persistenceMode';
import { generateUUID } from '../../../lib/uuid';
import { LEGACY_CHAPTER_STORAGE_KEYS, normalizeLegacyChapterValue } from '../../../services/campaign/chapterMigration';
import { ChapterScenesEditor } from './ChapterScenesEditor';
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

    const currentNext = selectedChapter.nextChapterIds ?? [];

    const alreadyLinked = currentNext.includes(targetId);

    const updatedChapter: Chapter = {
      ...selectedChapter,
      nextChapterIds: alreadyLinked
        ? currentNext.filter(id => id !== targetId)
        : [...currentNext, targetId]
    };

    updateChapter(updatedChapter);
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-1">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[var(--dash-text)]">Capitoli</h2>
            <p className="text-sm text-[var(--dash-muted)]">
              Macro-luoghi e mappe della campagna
            </p>
          </div>

          <button
            onClick={addChapter}
            className="rounded-lg border-2 border-[var(--dash-border)] bg-[var(--dash-border)] p-2 text-[var(--dash-text)] transition-colors hover:bg-[var(--dash-border)]"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-2">
          {filteredChapters.length === 0 ? (
            <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] px-5 py-8 text-center">
              <GitBranch className="mx-auto mb-3 h-10 w-10 text-[var(--dash-muted)]" />
              <div className="text-xs uppercase tracking-[0.16em] text-[var(--dash-accent-2)]">
                Nessun capitolo
              </div>
              <h3 className="mt-2 text-lg font-semibold text-[var(--dash-text-strong)]">
                Struttura campagna vuota
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--dash-text)]">
                Crea il primo macro-luogo e assegna la sua mappa generale.
              </p>
            </div>
          ) : (
            filteredChapters.map(chapter => (
              <div
                key={chapter.id}
                onClick={() => {
                  setSelectedChapterId(chapter.id);
                  setIsEditing(false);
                }}
                className={`cursor-pointer rounded-xl border p-4 transition-colors ${
                  selectedChapterId === chapter.id
                    ? 'border-[var(--dash-accent)] bg-[var(--dash-panel)]'
                    : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface)] hover:border-[var(--dash-accent)]'
                }`}
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-medium text-[var(--dash-text-strong)]">
                      {chapter.title}
                    </h3>

                    <p className="mt-1 text-sm text-[var(--dash-text)]">
                      {getKindLabel(chapter.kind)}
                    </p>
                  </div>

                  {chapter.isActive && (
                    <span className="rounded-full border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-2 py-1 text-[10px] uppercase tracking-[0.08em] text-[var(--dash-text-strong)]">
                      Attivo
                    </span>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[var(--dash-muted)]">
                  <span className="rounded-full border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-2 py-0.5">
                    {(chapter.nextChapterIds ?? []).length} uscite
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="lg:col-span-2">
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
                  onClick={() => setIsEditing(prev => !prev)}
                  className="rounded-md border border-[var(--dash-accent)] bg-[var(--dash-accent)] p-2 text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-accent-2)]"
                >
                  <Edit2 className="h-4 w-4" />
                </button>

                <button
  onClick={() => deleteChapter(selectedChapter.id)}
  className="rounded-md border border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)] p-2 text-[var(--dash-danger-text)] transition-colors hover:bg-[var(--dash-danger-hover)]"
>
  <Trash2 className="h-4 w-4" />
</button>
              </div>
            </div>

            {isEditing ? (
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-[var(--dash-text)]">Titolo</label>
                  <input
                    type="text"
                    value={selectedChapter.title}
                    onChange={e =>
                      updateChapter({
                        ...selectedChapter,
                        title: e.target.value
                      })
                    }
                    className="w-full rounded px-3 py-2 border-2 border-[var(--dash-border)] bg-[var(--dash-input)] text-[var(--dash-text)]"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-[var(--dash-text)]">Descrizione</label>
                  <textarea
                    value={selectedChapter.description}
                    onChange={e =>
                      updateChapter({
                        ...selectedChapter,
                        description: e.target.value
                      })
                    }
                    className="w-full h-28 resize-none rounded px-3 py-2 border-2 border-[var(--dash-border)] bg-[var(--dash-input)] text-[var(--dash-text)]"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-[var(--dash-text)]">Note GM</label>
                  <textarea
                    value={selectedChapter.notes}
                    onChange={e =>
                      updateChapter({
                        ...selectedChapter,
                        notes: e.target.value
                      })
                    }
                    className="w-full h-28 resize-none rounded px-3 py-2 border-2 border-[var(--dash-border)] bg-[var(--dash-input)] text-[var(--dash-text)]"
                  />
                </div>

                <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                  <div className="mb-3 text-sm uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Mappa del macro-luogo</div>
                  <label className="block text-sm text-[var(--dash-text)]">URL immagine mappa<input value={selectedChapter.mapUrl ?? ''} onChange={e => updateChapter({ ...selectedChapter, mapUrl: e.target.value || null, mapMetadata: { ...selectedChapter.mapMetadata, imageUrl: e.target.value || null } })} className="mt-1 w-full rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2" /></label>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm text-[var(--dash-text)]">Colonne griglia<input type="number" min={1} value={selectedChapter.mapMetadata.gridColumns} onChange={e => updateChapter({ ...selectedChapter, mapMetadata: { ...selectedChapter.mapMetadata, gridColumns: Math.max(1, Number(e.target.value) || 1) } })} className="mt-1 w-full rounded border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2" /></label><label className="text-sm text-[var(--dash-text)]">Righe griglia<input type="number" min={1} value={selectedChapter.mapMetadata.gridRows} onChange={e => updateChapter({ ...selectedChapter, mapMetadata: { ...selectedChapter.mapMetadata, gridRows: Math.max(1, Number(e.target.value) || 1) } })} className="mt-1 w-full rounded border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2" /></label></div>
                  <label className="mt-3 flex items-center gap-2 text-sm text-[var(--dash-text)]"><input type="checkbox" checked={selectedChapter.mapMetadata.gridVisible} onChange={e => updateChapter({ ...selectedChapter, mapMetadata: { ...selectedChapter.mapMetadata, gridVisible: e.target.checked } })} />Mostra griglia</label>
                </div>

                <div>
                  <label className="mb-2 block text-[var(--dash-text)]">Tipo Capitolo</label>
                  <select
                    value={selectedChapter.kind}
                    onChange={e =>
                      updateChapter({
                        ...selectedChapter,
                        kind: e.target.value as ChapterKind
                      })
                    }
                    className="w-full rounded px-3 py-2 border-2 border-[var(--dash-border)] bg-[var(--dash-input)] text-[var(--dash-text)]"
                  >
                    <option value="intro">Introduttivo</option>
                    <option value="standard">Standard</option>
                    <option value="final">Finale</option>
                  </select>
                </div>

                <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-sm uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
                      Capitolo attivo
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveChapter(selectedChapter.id)}
                      className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                        selectedChapter.isActive
                          ? 'border-[var(--dash-accent)] bg-[var(--dash-accent)] text-[var(--dash-text-strong)]'
                          : 'border-[var(--dash-border-soft)] bg-[var(--dash-panel)] text-[var(--dash-text)] hover:bg-[var(--dash-surface-2)]'
                      }`}
                    >
                      <Star className="h-4 w-4" />
                      {selectedChapter.isActive
                        ? 'Già attivo'
                        : 'Imposta come attivo'}
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
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
                            checked={(selectedChapter.nextChapterIds ?? []).includes(chapter.id)}
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
                <div>
                  <h3 className="mb-2 text-[var(--dash-text)]">Descrizione</h3>
                  <p className="text-[var(--dash-muted)]">
                    {selectedChapter.description || 'Nessuna descrizione'}
                  </p>
                </div>

                <div>
                  <h3 className="mb-2 text-[var(--dash-text)]">Note GM</h3>
                  <p className="text-[var(--dash-muted)]">
                    {selectedChapter.notes || 'Nessuna nota'}
                  </p>
                </div>

                <div>
                  <h3 className="mb-2 text-[var(--dash-text)]">Mappa generale</h3>
                  {selectedChapter.mapUrl ? <img src={selectedChapter.mapUrl} alt={`Mappa di ${selectedChapter.title}`} className="max-h-80 w-full rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] object-contain" /> : <p className="text-[var(--dash-muted)]">Nessuna mappa assegnata.</p>}
                </div>

                <div className="rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] p-4">
                  <h3 className="mb-2 text-[var(--dash-text)]">Stato</h3>
                  <p className="text-[var(--dash-muted)]">
                    {selectedChapter.isActive
                      ? 'Questo è il capitolo attualmente attivo.'
                      : 'Capitolo disponibile ma non attivo.'}
                  </p>
                </div>

                <div className="rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] p-4">
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
            <ChapterScenesEditor key={selectedChapter.id} campaignId={campaignId} chapter={selectedChapter} />
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-12 text-center">
            <GitBranch className="mx-auto mb-4 h-16 w-16 text-[var(--dash-muted)]" />
            <div className="text-xs uppercase tracking-[0.16em] text-[var(--dash-accent-2)]">
              Nessun capitolo selezionato
            </div>
            <h3 className="mt-2 text-xl font-semibold text-[var(--dash-text-strong)]">
              Seleziona un macro-luogo
            </h3>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[var(--dash-text)]">
              Apri un capitolo esistente oppure crea la prima mappa della campagna.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
