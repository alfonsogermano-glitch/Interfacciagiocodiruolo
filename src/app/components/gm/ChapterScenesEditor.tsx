import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Boxes, FileText, Map as MapIcon, Plus, Save, Trash2, Waypoints, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Chapter } from '../../../types/chapter';
import type { Scene } from '../../../types/scene';
import type { MapRect, SceneMapRegion } from '../../../types/mapGeometry';
import { CAMPAIGN_STORAGE_KEYS } from '../../../services/campaign/campaignStorageKeys';
import { persistenceKey } from '../../../services/storage/persistenceMode';
import { deleteScene, loadScenes, reorderScenes, saveScene } from '../../../services/supabase/entitiesService';
import { normalizeSceneSpatialValue } from '../../../services/campaign/spatialDomainMigration';
import { generateUUID } from '../../../lib/uuid';
import { NarrativeScopeContent } from './NarrativeScopeContent';

const REGION_COLORS = ['#f59e0b', '#38bdf8', '#a78bfa', '#34d399', '#fb7185'];
const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

function sceneLabel(status: Scene['status']): string {
  return status === 'ready' ? 'Pronta' : status === 'completed' ? 'Conclusa' : 'Preparazione';
}

function MapOverview({ chapter, scenes, selectedId }: { chapter: Chapter; scenes: Scene[]; selectedId: string | null }) {
  const grid = chapter.mapMetadata;
  const backgroundSize = `${100 / grid.gridColumns}% ${100 / grid.gridRows}%`;
  return <div className="relative mb-4 aspect-video overflow-hidden rounded-xl border border-[var(--dash-border)] bg-[var(--dash-input)]" style={grid.gridVisible ? { backgroundImage: 'linear-gradient(to right, color-mix(in srgb, var(--dash-text) 15%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--dash-text) 15%, transparent) 1px, transparent 1px)', backgroundSize } : undefined}>
    {chapter.mapUrl ? <img src={chapter.mapUrl} alt={`Mappa di ${chapter.title}`} className="absolute inset-0 h-full w-full object-contain" /> : <div className="absolute inset-0 grid place-items-center px-4 text-center text-sm text-[var(--dash-muted)]">Aggiungi l’immagine della mappa nel Capitolo per disegnare le aree significative.</div>}
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
      {scenes.flatMap(scene => scene.mapRegions.map(region => region.geometry.kind === 'rect'
        ? <rect key={`${scene.id}:${region.id}`} x={region.geometry.rect.x} y={region.geometry.rect.y} width={region.geometry.rect.width} height={region.geometry.rect.height} fill={region.color} fillOpacity={scene.id === selectedId ? 0.3 : 0.12} stroke={region.color} strokeWidth={scene.id === selectedId ? 0.8 : 0.4} vectorEffect="non-scaling-stroke" />
        : <polygon key={`${scene.id}:${region.id}`} points={region.geometry.points.map(point => `${point.x},${point.y}`).join(' ')} fill={region.color} fillOpacity={scene.id === selectedId ? 0.3 : 0.12} stroke={region.color} strokeWidth={scene.id === selectedId ? 0.8 : 0.4} vectorEffect="non-scaling-stroke" />))}
    </svg>
  </div>;
}

export function ChapterScenesEditor({ campaignId, chapter }: { campaignId: string; chapter: Chapter }) {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Scene | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activePanel, setActivePanel] = useState<'details' | 'map' | 'content' | 'flow'>('details');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadScenes(campaignId).then(loaded => {
      if (cancelled) return;
      const normalized = loaded.map(normalizeSceneSpatialValue);
      setScenes(normalized);
      const first = normalized.find(scene => scene.chapterId === chapter.id) ?? null;
      setSelectedId(first?.id ?? null); setDraft(first ? { ...first } : null);
    }).catch(error => toast.error(error instanceof Error ? error.message : 'Caricamento scene non riuscito.'))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [campaignId, chapter.id]);

  useEffect(() => {
    if (loading) return;
    try { window.localStorage.setItem(persistenceKey(CAMPAIGN_STORAGE_KEYS.scenes), JSON.stringify(scenes)); } catch { /* Backup mirror best effort. */ }
  }, [scenes, loading]);

  const chapterScenes = scenes.filter(scene => scene.chapterId === chapter.id)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const select = (scene: Scene) => { setSelectedId(scene.id); setDraft({ ...scene }); setActivePanel('details'); };
  const create = async () => {
    const now = new Date().toISOString();
    const scene = normalizeSceneSpatialValue({
      id: generateUUID(), campaignId, chapterId: chapter.id, title: 'Nuova scena', description: '', notes: '',
      status: 'draft', imageUrl: null, sortOrder: chapterScenes.length, nextSceneIds: [], mapRegions: [],
      contextMetadata: { timeOfDay: '', period: '', condition: '' }, createdAt: now, updatedAt: now,
    });
    setSaving(true);
    try { await saveScene(campaignId, scene); setScenes(current => [...current, scene]); select(scene); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Creazione scena non riuscita.'); }
    finally { setSaving(false); }
  };
  const save = async () => {
    if (!draft || saving) return;
    const next = normalizeSceneSpatialValue({ ...draft, updatedAt: new Date().toISOString() });
    setSaving(true);
    try { await saveScene(campaignId, next); setScenes(current => current.map(scene => scene.id === next.id ? next : scene)); setDraft(next); toast.success('Scena salvata.'); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Salvataggio scena non riuscito.'); }
    finally { setSaving(false); }
  };
  const remove = async () => {
    if (!draft || saving || !confirm('Eliminare questa scena?')) return;
    setSaving(true);
    try {
      await deleteScene(campaignId, draft.id);
      const nextScenes = scenes.filter(scene => scene.id !== draft.id).map(scene => ({ ...scene, nextSceneIds: scene.nextSceneIds.filter(id => id !== draft.id) }));
      setScenes(nextScenes);
      const next = nextScenes.find(scene => scene.chapterId === chapter.id) ?? null;
      setSelectedId(next?.id ?? null); setDraft(next ? { ...next } : null);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Eliminazione scena non riuscita.'); }
    finally { setSaving(false); }
  };
  const moveLayer = async (direction: -1 | 1) => {
    if (!draft || saving) return;
    const index = chapterScenes.findIndex(scene => scene.id === draft.id), target = index + direction;
    if (index < 0 || target < 0 || target >= chapterScenes.length) return;
    const ordered = [...chapterScenes]; [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    setSaving(true);
    try {
      const reordered = await reorderScenes(campaignId, ordered), byId = new Map(reordered.map(scene => [scene.id, scene]));
      setScenes(current => current.map(scene => byId.get(scene.id) ?? scene)); setDraft(current => current ? byId.get(current.id) ?? current : null);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Ordine dei livelli non aggiornato.'); }
    finally { setSaving(false); }
  };
  const addRegion = () => {
    if (!draft) return;
    const region: SceneMapRegion = { id: generateUUID(), label: `Area ${draft.mapRegions.length + 1}`, color: REGION_COLORS[draft.mapRegions.length % REGION_COLORS.length], geometry: { kind: 'rect', rect: { x: 10, y: 10, width: 20, height: 20 } } };
    setDraft({ ...draft, mapRegions: [...draft.mapRegions, region] });
  };
  const updateRect = (regionId: string, key: keyof MapRect, value: number) => setDraft(current => current ? { ...current, mapRegions: current.mapRegions.map(region => region.id === regionId && region.geometry.kind === 'rect' ? { ...region, geometry: { kind: 'rect', rect: { ...region.geometry.rect, [key]: clampPercent(value) } } } : region) } : null);

  return <section data-chapter-scenes-editor className="mt-6 border-t border-[var(--dash-border-soft)] pt-6">
    <div className="mb-4 flex items-center justify-between gap-3"><div><h3 className="font-semibold text-[var(--dash-text-strong)]">Scene del capitolo</h3><p className="text-xs text-[var(--dash-muted)]">Aree significative e varianti contestuali sovrapponibili sulla mappa generale.</p></div><button type="button" disabled={saving} onClick={() => void create()} className="inline-flex items-center gap-1.5 rounded-md bg-[var(--dash-accent)] px-3 py-2 text-sm text-[var(--dash-text-strong)] disabled:opacity-50"><Plus className="h-4 w-4" />Nuova scena</button></div>
    {loading ? <p className="text-sm text-[var(--dash-muted)]">Caricamento scene...</p> : chapterScenes.length === 0 ? <div className="rounded-xl border border-dashed border-[var(--dash-border)] p-6 text-center text-sm text-[var(--dash-muted)]">Nessuna scena. Crea una stanza, un edificio o un’altra area significativa.</div> : <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
      <div className="space-y-2">{chapterScenes.map(scene => <button key={scene.id} type="button" onClick={() => select(scene)} className={`w-full rounded-lg border p-3 text-left ${selectedId === scene.id ? 'border-[var(--dash-accent)] bg-[var(--dash-panel)]' : 'border-[var(--dash-border-soft)] bg-[var(--dash-input)]'}`}><span className="block truncate text-sm font-medium text-[var(--dash-text-strong)]">{scene.title}</span><span className="mt-1 block text-xs text-[var(--dash-muted)]">{sceneLabel(scene.status)} · {scene.mapRegions.length} aree</span></button>)}</div>
      {draft && <div className="space-y-4 rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
        <div className="flex items-center justify-between"><span className="text-xs text-[var(--dash-muted)]">Ordine del livello sovrapposto</span><div><button type="button" aria-label="Porta livello indietro" disabled={saving || chapterScenes[0]?.id === draft.id} onClick={() => void moveLayer(-1)} className="rounded p-1.5 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button><button type="button" aria-label="Porta livello avanti" disabled={saving || chapterScenes.at(-1)?.id === draft.id} onClick={() => void moveLayer(1)} className="rounded p-1.5 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button></div></div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {([['details', 'Dettagli', FileText], ['map', 'Mappa', MapIcon], ['content', 'Contenuti', Boxes], ['flow', 'Diramazioni', Waypoints]] as const).map(([id, label, Icon]) => <button key={id} type="button" onClick={() => setActivePanel(id)} className={`flex items-center justify-center gap-1 rounded-md border px-2 py-2 text-xs ${activePanel === id ? 'border-[var(--dash-accent)] bg-[var(--dash-accent)] text-[var(--dash-text-strong)]' : 'border-[var(--dash-border-soft)] bg-[var(--dash-input)] text-[var(--dash-muted)] hover:border-[var(--dash-accent)]'}`}><Icon className="h-3.5 w-3.5" />{label}</button>)}
        </div>
        <div className={activePanel === 'details' ? 'space-y-4' : 'hidden'}>
          <label className="block text-sm text-[var(--dash-text)]">Titolo<input value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} className="mt-1 w-full rounded border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2" /></label>
          <label className="block text-sm text-[var(--dash-text)]">Stato<select value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value as Scene['status'] })} className="mt-1 w-full rounded border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2"><option value="draft">In preparazione</option><option value="ready">Pronta per la sessione</option><option value="completed">Conclusa</option></select></label>
          <div className="grid gap-3 sm:grid-cols-3"><label className="text-sm text-[var(--dash-text)]">Momento del giorno<input placeholder="Giorno, notte..." value={draft.contextMetadata.timeOfDay} onChange={event => setDraft({ ...draft, contextMetadata: { ...draft.contextMetadata, timeOfDay: event.target.value } })} className="mt-1 w-full rounded border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2" /></label><label className="text-sm text-[var(--dash-text)]">Periodo<input placeholder="Inverno, mesi dopo..." value={draft.contextMetadata.period} onChange={event => setDraft({ ...draft, contextMetadata: { ...draft.contextMetadata, period: event.target.value } })} className="mt-1 w-full rounded border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2" /></label><label className="text-sm text-[var(--dash-text)]">Condizione<input placeholder="Epidemia, incendio..." value={draft.contextMetadata.condition} onChange={event => setDraft({ ...draft, contextMetadata: { ...draft.contextMetadata, condition: event.target.value } })} className="mt-1 w-full rounded border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2" /></label></div>
          <label className="block text-sm text-[var(--dash-text)]">Descrizione per i giocatori<textarea value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} rows={3} className="mt-1 w-full resize-y rounded border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2" /></label>
          <label className="block text-sm text-[var(--dash-text)]">Note GM<textarea value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} rows={3} className="mt-1 w-full resize-y rounded border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2" /></label>
        </div>
        <div className={activePanel === 'content' ? '' : 'hidden'}><NarrativeScopeContent campaignId={campaignId} chapterId={chapter.id} sceneId={draft.id} /></div>
        <div className={activePanel === 'map' ? 'space-y-4' : 'hidden'}>
          <MapOverview chapter={chapter} scenes={chapterScenes} selectedId={selectedId} />
          <div className="rounded-lg border border-[var(--dash-border)] p-3"><div className="mb-3 flex items-center justify-between"><div><h4 className="text-sm font-medium text-[var(--dash-text-strong)]">Regioni sulla mappa</h4><p className="text-xs text-[var(--dash-muted)]">Coordinate percentuali; più Scene possono occupare la stessa area.</p></div><button type="button" onClick={addRegion} className="inline-flex items-center gap-1 rounded border border-[var(--dash-border)] px-2 py-1 text-xs"><Plus className="h-3.5 w-3.5" />Area</button></div>
          <div className="space-y-3">{draft.mapRegions.map(region => <div key={region.id} className="rounded border border-[var(--dash-border-soft)] bg-[var(--dash-input)] p-3">{region.geometry.kind === 'rect' ? <><div className="mb-2 flex gap-2"><input value={region.label} onChange={event => setDraft({ ...draft, mapRegions: draft.mapRegions.map(item => item.id === region.id ? { ...item, label: event.target.value } : item) })} className="min-w-0 flex-1 rounded border border-[var(--dash-border)] bg-[var(--dash-panel)] px-2 py-1 text-sm" /><input type="color" value={region.color} onChange={event => setDraft({ ...draft, mapRegions: draft.mapRegions.map(item => item.id === region.id ? { ...item, color: event.target.value } : item) })} className="h-8 w-10" /><button type="button" aria-label="Rimuovi area" onClick={() => setDraft({ ...draft, mapRegions: draft.mapRegions.filter(item => item.id !== region.id) })}><Trash2 className="h-4 w-4" /></button></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{(['x', 'y', 'width', 'height'] as const).map(key => <label key={key} className="text-xs uppercase text-[var(--dash-muted)]">{key}<input type="number" min={0} max={100} value={region.geometry.kind === 'rect' ? region.geometry.rect[key] : 0} onChange={event => updateRect(region.id, key, Number(event.target.value))} className="mt-1 w-full rounded border border-[var(--dash-border)] bg-[var(--dash-panel)] px-2 py-1 text-sm" /></label>)}</div></> : <p className="text-xs text-[var(--dash-muted)]">Poligono importato con {region.geometry.points.length} vertici.</p>}</div>)}</div>
          </div>
        </div>
        <div className={activePanel === 'flow' ? 'space-y-2 rounded-lg border border-[var(--dash-border)] p-3' : 'hidden'}><h4 className="text-sm font-medium text-[var(--dash-text-strong)]">Scene successive possibili</h4><p className="text-xs text-[var(--dash-muted)]">Definisci le direzioni narrative disponibili al termine di questa scena.</p>{chapterScenes.filter(scene => scene.id !== draft.id).map(scene => <label key={scene.id} className="flex items-center gap-2 rounded bg-[var(--dash-input)] px-3 py-2 text-sm text-[var(--dash-text)]"><input type="checkbox" checked={draft.nextSceneIds.includes(scene.id)} onChange={() => setDraft({ ...draft, nextSceneIds: draft.nextSceneIds.includes(scene.id) ? draft.nextSceneIds.filter(id => id !== scene.id) : [...draft.nextSceneIds, scene.id] })} />{scene.title}</label>)}{chapterScenes.length <= 1 && <p className="text-sm text-[var(--dash-muted)]">Crea almeno un’altra scena per aggiungere una diramazione.</p>}</div>
        <div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={saving} onClick={() => { const original = scenes.find(scene => scene.id === draft.id); if (original) setDraft({ ...original }); }} className="inline-flex items-center gap-1 rounded border border-[var(--dash-border)] px-3 py-2 text-sm"><X className="h-4 w-4" />Annulla</button><button type="button" disabled={saving} onClick={() => void remove()} className="inline-flex items-center gap-1 rounded border border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)] px-3 py-2 text-sm text-[var(--dash-danger-text)]"><Trash2 className="h-4 w-4" />Elimina</button><button type="button" disabled={saving || !draft.title.trim()} onClick={() => void save()} className="inline-flex items-center gap-1 rounded bg-[var(--dash-accent)] px-3 py-2 text-sm text-[var(--dash-text-strong)] disabled:opacity-50"><Save className="h-4 w-4" />Salva</button></div>
      </div>}
    </div>}
  </section>;
}
