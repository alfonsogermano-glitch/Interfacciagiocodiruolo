import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Save, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Chapter } from '../../../types/chapter';
import type { Scene } from '../../../types/scene';
import { CAMPAIGN_STORAGE_KEYS } from '../../../services/campaign/campaignStorageKeys';
import { persistenceKey } from '../../../services/storage/persistenceMode';
import { deleteScene, loadEnvironments, loadScenes, reorderScenes, saveScene, type Environment } from '../../../services/supabase/entitiesService';
import { generateUUID } from '../../../lib/uuid';

function sceneLabel(status: Scene['status']): string {
  if (status === 'ready') return 'Pronta';
  if (status === 'completed') return 'Conclusa';
  return 'Preparazione';
}

export function ChapterScenesEditor({ campaignId, chapter }: { campaignId: string; chapter: Chapter }) {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Scene | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([loadScenes(campaignId), loadEnvironments(campaignId)]).then(([loadedScenes, loadedEnvironments]) => {
      if (cancelled) return;
      setScenes(loadedScenes);
      setEnvironments(loadedEnvironments);
      const first = loadedScenes.find(scene => scene.chapterId === chapter.id) ?? null;
      setSelectedId(first?.id ?? null);
      setDraft(first ? { ...first } : null);
    }).catch((error) => toast.error(error instanceof Error ? error.message : 'Caricamento scene non riuscito.'))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [campaignId, chapter.id]);

  useEffect(() => {
    if (loading) return;
    try { window.localStorage.setItem(persistenceKey(CAMPAIGN_STORAGE_KEYS.scenes), JSON.stringify(scenes)); } catch { /* Backup mirror best effort. */ }
  }, [scenes, loading]);

  const chapterScenes = scenes.filter(scene => scene.chapterId === chapter.id)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));

  const select = (scene: Scene) => { setSelectedId(scene.id); setDraft({ ...scene }); };
  const create = async () => {
    const now = new Date().toISOString();
    const scene: Scene = {
      id: generateUUID(), campaignId, chapterId: chapter.id, title: 'Nuova scena', description: '', notes: '',
      status: 'draft', environmentId: null, imageUrl: null, sortOrder: chapterScenes.length,
      nextSceneIds: [], createdAt: now, updatedAt: now,
    };
    setSaving(true);
    try {
      await saveScene(campaignId, scene);
      setScenes(current => [...current, scene]);
      select(scene);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Creazione scena non riuscita.'); }
    finally { setSaving(false); }
  };
  const save = async () => {
    if (!draft || saving) return;
    const next = { ...draft, updatedAt: new Date().toISOString() };
    setSaving(true);
    try {
      await saveScene(campaignId, next);
      setScenes(current => current.map(scene => scene.id === next.id ? next : scene));
      setDraft(next);
      toast.success('Scena salvata.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Salvataggio scena non riuscito.'); }
    finally { setSaving(false); }
  };
  const remove = async () => {
    if (!draft || saving || !confirm('Eliminare questa scena?')) return;
    setSaving(true);
    try {
      await deleteScene(campaignId, draft.id);
      const nextScenes = scenes.filter(scene => scene.id !== draft.id)
        .map(scene => ({ ...scene, nextSceneIds: scene.nextSceneIds.filter(id => id !== draft.id) }));
      setScenes(nextScenes);
      const next = nextScenes.find(scene => scene.chapterId === chapter.id) ?? null;
      setSelectedId(next?.id ?? null); setDraft(next ? { ...next } : null);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Eliminazione scena non riuscita.'); }
    finally { setSaving(false); }
  };
  const move = async (direction: -1 | 1) => {
    if (!draft || saving) return;
    const index = chapterScenes.findIndex(scene => scene.id === draft.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= chapterScenes.length) return;
    const ordered = [...chapterScenes];
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    setSaving(true);
    try {
      const reordered = await reorderScenes(campaignId, ordered);
      const byId = new Map(reordered.map(scene => [scene.id, scene]));
      setScenes(current => current.map(scene => byId.get(scene.id) ?? scene));
      setDraft(current => current ? byId.get(current.id) ?? current : null);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Riordino scene non riuscito.'); }
    finally { setSaving(false); }
  };

  return <section className="mt-6 border-t border-[var(--dash-border-soft)] pt-6">
    <div className="mb-4 flex items-center justify-between gap-3">
      <div><h3 className="font-semibold text-[var(--dash-text-strong)]">Scene del capitolo</h3><p className="text-xs text-[var(--dash-muted)]">Preparazione narrativa privata del GM. Luogo e scena restano entità distinte.</p></div>
      <button type="button" disabled={saving} onClick={() => void create()} className="inline-flex items-center gap-1.5 rounded-md bg-[var(--dash-accent)] px-3 py-2 text-sm text-[var(--dash-text-strong)] disabled:opacity-50"><Plus className="h-4 w-4" />Nuova scena</button>
    </div>
    {loading ? <p className="text-sm text-[var(--dash-muted)]">Caricamento scene...</p> : chapterScenes.length === 0 ? <div className="rounded-xl border border-dashed border-[var(--dash-border)] p-6 text-center text-sm text-[var(--dash-muted)]">Nessuna scena. Crea la prima unità giocabile del capitolo.</div> : <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
      <div className="space-y-2">{chapterScenes.map((scene, index) => <button key={scene.id} type="button" onClick={() => select(scene)} className={`w-full rounded-lg border p-3 text-left ${selectedId === scene.id ? 'border-[var(--dash-accent)] bg-[var(--dash-panel)]' : 'border-[var(--dash-border-soft)] bg-[var(--dash-input)]'}`}><span className="block truncate text-sm font-medium text-[var(--dash-text-strong)]">{index + 1}. {scene.title}</span><span className="mt-1 block text-xs text-[var(--dash-muted)]">{sceneLabel(scene.status)}</span></button>)}</div>
      {draft && <div className="space-y-4 rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
        <div className="flex justify-end gap-1"><button type="button" aria-label="Sposta scena su" disabled={saving || chapterScenes[0]?.id === draft.id} onClick={() => void move(-1)} className="rounded p-1.5 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button><button type="button" aria-label="Sposta scena giù" disabled={saving || chapterScenes.at(-1)?.id === draft.id} onClick={() => void move(1)} className="rounded p-1.5 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button></div>
        <label className="block text-sm text-[var(--dash-text)]">Titolo<input value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} className="mt-1 w-full rounded border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2" /></label>
        <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm text-[var(--dash-text)]">Stato<select value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value as Scene['status'] })} className="mt-1 w-full rounded border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2"><option value="draft">Preparazione</option><option value="ready">Pronta</option><option value="completed">Conclusa</option></select></label><label className="block text-sm text-[var(--dash-text)]">Luogo opzionale<select value={draft.environmentId ?? ''} onChange={event => setDraft({ ...draft, environmentId: event.target.value || null })} className="mt-1 w-full rounded border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2"><option value="">Nessun luogo</option>{environments.map(environment => <option key={environment.id} value={environment.id}>{environment.name}</option>)}</select></label></div>
        <label className="block text-sm text-[var(--dash-text)]">Descrizione per i giocatori<textarea value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} rows={4} className="mt-1 w-full resize-y rounded border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2" /></label>
        <label className="block text-sm text-[var(--dash-text)]">Note GM<textarea value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} rows={4} className="mt-1 w-full resize-y rounded border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2" /></label>
        <label className="block text-sm text-[var(--dash-text)]">URL immagine opzionale<input value={draft.imageUrl ?? ''} onChange={event => setDraft({ ...draft, imageUrl: event.target.value || null })} className="mt-1 w-full rounded border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2" /></label>
        {chapterScenes.length > 1 && <fieldset className="rounded-lg border border-[var(--dash-border)] p-3"><legend className="px-1 text-xs uppercase tracking-wide text-[var(--dash-muted)]">Scene successive</legend>{chapterScenes.filter(scene => scene.id !== draft.id).map(scene => <label key={scene.id} className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.nextSceneIds.includes(scene.id)} onChange={() => setDraft({ ...draft, nextSceneIds: draft.nextSceneIds.includes(scene.id) ? draft.nextSceneIds.filter(id => id !== scene.id) : [...draft.nextSceneIds, scene.id] })} />{scene.title}</label>)}</fieldset>}
        <div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={saving} onClick={() => { const original = scenes.find(scene => scene.id === draft.id); if (original) setDraft({ ...original }); }} className="inline-flex items-center gap-1 rounded border border-[var(--dash-border)] px-3 py-2 text-sm"><X className="h-4 w-4" />Annulla</button><button type="button" disabled={saving} onClick={() => void remove()} className="inline-flex items-center gap-1 rounded border border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)] px-3 py-2 text-sm text-[var(--dash-danger-text)]"><Trash2 className="h-4 w-4" />Elimina</button><button type="button" disabled={saving || !draft.title.trim()} onClick={() => void save()} className="inline-flex items-center gap-1 rounded bg-[var(--dash-accent)] px-3 py-2 text-sm text-[var(--dash-text-strong)] disabled:opacity-50"><Save className="h-4 w-4" />Salva</button></div>
      </div>}
    </div>}
  </section>;
}
