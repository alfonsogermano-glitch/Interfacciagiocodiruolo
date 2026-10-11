import { useEffect, useState, type ReactNode } from 'react';
import { Ghost, Lightbulb, Plus, Scroll, Swords, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  loadClues,
  loadMonsters,
  loadNPCs,
  loadSituations,
  saveClue,
  saveMonster,
  saveNPC,
  saveSituation,
  type Clue,
  type Monster,
  type NPC,
  type Situation,
} from '../../../services/supabase/entitiesService';

type NarrativeScopeContentProps = {
  campaignId: string;
  chapterId: string;
  sceneId?: string;
};

type ScopedEntity = {
  id: string;
  chapterId?: string | null;
  sceneId?: string | null;
};

type ContentGroups = {
  npcs: NPC[];
  monsters: Monster[];
  clues: Clue[];
  events: Situation[];
};

type ContentKind = keyof ContentGroups;

const EMPTY_GROUPS: ContentGroups = { npcs: [], monsters: [], clues: [], events: [] };
const CONTENT_CHANGE_EVENT = 'campaign-narrative-content-change';

const GROUP_META: Record<ContentKind, { title: string; icon: ReactNode; getLabel: (item: any) => string }> = {
  npcs: { title: 'PNG', icon: <Ghost className="h-4 w-4" />, getLabel: item => item.name || 'PNG senza nome' },
  monsters: { title: 'Mostri', icon: <Swords className="h-4 w-4" />, getLabel: item => item.name || 'Mostro senza nome' },
  clues: { title: 'Indizi', icon: <Lightbulb className="h-4 w-4" />, getLabel: item => item.title || 'Indizio senza titolo' },
  events: { title: 'Eventi', icon: <Scroll className="h-4 w-4" />, getLabel: item => item.title || 'Evento senza titolo' },
};

export function NarrativeScopeContent({ campaignId, chapterId, sceneId }: NarrativeScopeContentProps) {
  const [allGroups, setAllGroups] = useState<ContentGroups>(EMPTY_GROUPS);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    const refresh = () => setRefreshVersion(version => version + 1);
    window.addEventListener(CONTENT_CHANGE_EVENT, refresh);
    return () => window.removeEventListener(CONTENT_CHANGE_EVENT, refresh);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    void Promise.all([
      loadNPCs(campaignId),
      loadMonsters(campaignId),
      loadClues(campaignId),
      loadSituations(campaignId),
    ]).then(([npcs, monsters, clues, events]) => {
      if (!cancelled) setAllGroups({ npcs, monsters, clues, events });
    }).catch(error => {
      console.error('Errore caricamento contenuti narrativi:', error);
      if (!cancelled) setAllGroups(EMPTY_GROUPS);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [campaignId, refreshVersion]);

  const saveEntity = async (kind: ContentKind, entity: ScopedEntity) => {
    switch (kind) {
      case 'npcs': return saveNPC(campaignId, entity as NPC);
      case 'monsters': return saveMonster(campaignId, entity as Monster);
      case 'clues': return saveClue(campaignId, entity as Clue);
      case 'events': return saveSituation(campaignId, entity as Situation);
    }
  };

  const updatePlacement = async (kind: ContentKind, id: string, placement: { chapterId: string | null; sceneId: string | null }) => {
    const entity = allGroups[kind].find(item => item.id === id) as ScopedEntity | undefined;
    if (!entity) return;

    const next = { ...entity, ...placement };
    const key = `${kind}:${id}`;
    setSavingKey(key);
    try {
      await saveEntity(kind, next);
      setAllGroups(current => ({
        ...current,
        [kind]: current[kind].map(item => item.id === id ? next : item),
      }));
      window.dispatchEvent(new Event(CONTENT_CHANGE_EVENT));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Assegnazione non riuscita.');
    } finally {
      setSavingKey(null);
    }
  };

  const belongs = (item: ScopedEntity) => sceneId
    ? item.sceneId === sceneId
    : item.chapterId === chapterId && !item.sceneId;

  const canAssign = (item: ScopedEntity) => sceneId
    ? (!item.chapterId && !item.sceneId) || (item.chapterId === chapterId && !item.sceneId)
    : !item.chapterId && !item.sceneId;

  return (
    <section className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
      <div className="mb-3">
        <h4 className="font-medium text-[var(--dash-text-strong)]">
          {sceneId ? 'Contenuti della scena' : 'Contenuti del capitolo'}
        </h4>
        <p className="mt-1 text-xs text-[var(--dash-muted)]">
          {sceneId
            ? 'Focus locali di questa scena. Rimuovendoli, tornano al contesto generale del capitolo.'
            : 'Presenze ed eventi della mappa generale, non limitati a una singola scena.'}
        </p>
      </div>
      {loading ? (
        <p className="text-sm text-[var(--dash-muted)]">Caricamento contenuti...</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(Object.keys(GROUP_META) as ContentKind[]).map(kind => {
            const meta = GROUP_META[kind];
            return (
              <ContentGroup
                key={kind}
                title={meta.title}
                icon={meta.icon}
                items={allGroups[kind].filter(belongs)}
                available={allGroups[kind].filter(canAssign)}
                getLabel={meta.getLabel}
                savingKey={savingKey}
                kind={kind}
                onAssign={id => void updatePlacement(kind, id, { chapterId, sceneId: sceneId ?? null })}
                onRemove={id => void updatePlacement(kind, id, sceneId
                  ? { chapterId, sceneId: null }
                  : { chapterId: null, sceneId: null })}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function ContentGroup<T extends ScopedEntity>({ title, icon, items, available, getLabel, savingKey, kind, onAssign, onRemove }: {
  title: string;
  icon: ReactNode;
  items: T[];
  available: T[];
  getLabel: (item: T) => string;
  savingKey: string | null;
  kind: ContentKind;
  onAssign: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-input)] p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-[var(--dash-text-strong)]">
        {icon}<span>{title}</span><span className="ml-auto text-xs text-[var(--dash-muted)]">{items.length}</span>
      </div>
      {items.length ? (
        <ul className="mb-2 space-y-1">
          {items.map(item => (
            <li key={item.id} className="flex items-center gap-1 rounded bg-[var(--dash-panel)] px-2 py-1 text-xs text-[var(--dash-muted)]">
              <span className="min-w-0 flex-1 truncate">{getLabel(item)}</span>
              <button type="button" aria-label={`Rimuovi ${getLabel(item)}`} disabled={savingKey === `${kind}:${item.id}`} onClick={() => onRemove(item.id)} className="rounded p-0.5 hover:text-[var(--dash-text-strong)] disabled:opacity-40"><X className="h-3.5 w-3.5" /></button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-2 text-xs text-[var(--dash-muted)]">Nessun contenuto assegnato.</p>
      )}
      <label className="relative flex items-center gap-1 text-xs text-[var(--dash-muted)]">
        <Plus className="h-3.5 w-3.5 shrink-0" />
        <select aria-label={`Aggiungi ${title}`} value="" disabled={!available.length || savingKey !== null} onChange={event => { if (event.target.value) onAssign(event.target.value); }} className="min-w-0 flex-1 rounded border border-[var(--dash-border)] bg-[var(--dash-panel)] px-2 py-1 text-xs disabled:opacity-50">
          <option value="">{available.length ? 'Aggiungi...' : 'Nessun elemento disponibile'}</option>
          {available.map(item => <option key={item.id} value={item.id}>{getLabel(item)}</option>)}
        </select>
      </label>
    </div>
  );
}
