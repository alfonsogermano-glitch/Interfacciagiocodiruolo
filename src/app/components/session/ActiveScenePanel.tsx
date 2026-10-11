import { useEffect, useState } from 'react';
import { Eye, MapPin } from 'lucide-react';
import { loadScenes } from '../../../services/supabase/entitiesService';
import type { ActiveScenePublication } from '../../../types/activeScene';
import { ActiveSceneMap } from './ActiveSceneMap';

function contextLabels(scene: ActiveScenePublication): string[] {
  return [
    scene.contextMetadata.timeOfDay,
    scene.contextMetadata.period,
    scene.contextMetadata.condition,
  ].map(value => value.trim()).filter(Boolean);
}

export function ActiveScenePanel({
  campaignId,
  scene,
  isOwner,
}: {
  campaignId: string;
  scene: ActiveScenePublication;
  isOwner: boolean;
}) {
  const [gmNotes, setGmNotes] = useState('');

  useEffect(() => {
    let cancelled = false;
    setGmNotes('');
    if (!isOwner) return () => { cancelled = true; };
    void loadScenes(campaignId).then(scenes => {
      if (!cancelled) setGmNotes(scenes.find(item => item.id === scene.sceneId)?.notes ?? '');
    }).catch(error => console.error('Caricamento note GM della scena attiva non riuscito:', error));
    return () => { cancelled = true; };
  }, [campaignId, isOwner, scene.sceneId]);

  const labels = contextLabels(scene);
  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--dash-accent)]/60 bg-[var(--dash-surface)] shadow-lg">
      <div className="border-b border-[var(--dash-border-soft)] px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--dash-accent-2)]">
              <Eye className="h-4 w-4" /> Scena attiva
            </div>
            <h2 className="text-2xl font-semibold text-[var(--dash-text-strong)]">{scene.title}</h2>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-[var(--dash-muted)]">
              <MapPin className="h-4 w-4" /> {scene.chapterTitle}
            </p>
          </div>
          {labels.length > 0 && <div className="flex flex-wrap justify-end gap-2">{labels.map(label => (
            <span key={label} className="rounded-full border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-3 py-1 text-xs text-[var(--dash-text)]">{label}</span>
          ))}</div>}
        </div>
        {scene.description && <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-[var(--dash-text)]">{scene.description}</p>}
      </div>
      {(scene.mapUrl || scene.sceneImageUrl) && <div className="p-4 sm:p-6"><ActiveSceneMap scene={scene} /></div>}
      {isOwner && gmNotes && (
        <div className="border-t border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-5 py-4 sm:px-6">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--dash-danger-text)]">Solo GM</div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--dash-text)]">{gmNotes}</p>
        </div>
      )}
    </section>
  );
}
