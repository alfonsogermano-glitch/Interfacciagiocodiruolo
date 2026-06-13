import { useEffect, useMemo, useState } from 'react';
import { GitBranch, Plus, Edit2, Trash2, Star } from 'lucide-react';
import { CAMPAIGN_STORAGE_KEYS } from '../../../services/campaign/campaignStorageKeys';
import type { Adventure, AdventureKind } from '../../../types/adventure';
import { loadAdventures, saveAdventure as saveAdventureToSupabase, deleteAdventure as deleteAdventureFromSupabase } from '../../../services/supabase/entitiesService';
import { DEFAULT_CAMPAIGN_ID } from '../../../config/campaign.config';
import { generateUUID } from '../../../lib/uuid';

const ADVENTURES_STORAGE_KEY = CAMPAIGN_STORAGE_KEYS.adventures;
const ACTIVE_ADVENTURE_STORAGE_KEY = CAMPAIGN_STORAGE_KEYS.activeAdventure;

// Nessuna avventura di default: gli utenti creano le proprie avventure

interface AdventureManagerProps {
  campaignId?: string;
  storageRefreshKey?: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

function getKindLabel(kind: AdventureKind): string {
  switch (kind) {
    case 'intro':
      return 'Introduttiva';
    case 'final':
      return 'Finale';
    default:
      return 'Standard';
  }
}

export function AdventureManager({
  campaignId: providedCampaignId = DEFAULT_CAMPAIGN_ID,
  storageRefreshKey = 0
}: AdventureManagerProps) {
  const campaignId = providedCampaignId;
  const [adventures, setAdventures] = useState<Adventure[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [selectedAdventureId, setSelectedAdventureId] = useState<string | null>(
    () => {
      if (typeof window === 'undefined') {
        return null;
      }

      return window.localStorage.getItem(ACTIVE_ADVENTURE_STORAGE_KEY) ?? null;
    }
  );

  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const loadedAdventures = await loadAdventures(campaignId);

setAdventures(
  loadedAdventures.map(adventure => ({
    ...adventure,
    createdAt: adventure.createdAt ?? new Date().toISOString(),
    updatedAt: adventure.updatedAt ?? adventure.createdAt ?? new Date().toISOString()
  }))
);
      } catch (error) {
        console.error('Errore caricamento avventure da Supabase:', error);

        try {
          const savedAdventures = window.localStorage.getItem(ADVENTURES_STORAGE_KEY);
          if (savedAdventures) {
            const parsedAdventures = JSON.parse(savedAdventures);
            if (Array.isArray(parsedAdventures)) {
              setAdventures(parsedAdventures);
            } else {
              setAdventures([]);
            }
          } else {
            setAdventures([]);
          }
        } catch (localError) {
          console.error('Errore caricamento avventure da localStorage:', localError);
          setAdventures([]);
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
        ADVENTURES_STORAGE_KEY,
        JSON.stringify(adventures)
      );
    } catch (error) {
      console.error('Errore nel salvataggio delle avventure su localStorage:', error);
    }
  }, [adventures, isLoading]);

  const filteredAdventures = useMemo(() => {
    return adventures.filter(adventure => adventure.campaignId === campaignId);
  }, [adventures, campaignId]);

  const selectedAdventure =
    filteredAdventures.find(adventure => adventure.id === selectedAdventureId)
    ?? null;

  useEffect(() => {
    if (!selectedAdventureId) {
      return;
    }

    try {
      window.localStorage.setItem(
        ACTIVE_ADVENTURE_STORAGE_KEY,
        selectedAdventureId
      );
    } catch (error) {
      console.error('Errore nel salvataggio dell\'avventura attiva:', error);
    }
  }, [selectedAdventureId]);

  const addAdventure = async () => {
    const timestamp = nowIso();

    const newAdventure: Adventure = {
      id: generateUUID(),
      campaignId,
      title: 'Nuova Avventura',
      description: '',
      notes: '',
      kind: 'standard',
      isActive: filteredAdventures.length === 0,
      nextAdventureIds: [],
      createdAt: timestamp,
      updatedAt: timestamp
    };

    setAdventures(prev => {
      const next = [...prev, newAdventure];

      if (newAdventure.isActive) {
        return next.map(adventure => ({
          ...adventure,
          isActive: adventure.id === newAdventure.id
        }));
      }

      return next;
    });

    setSelectedAdventureId(newAdventure.id);
    setIsEditing(true);

    try {
      await saveAdventureToSupabase(campaignId, newAdventure);
    } catch (error) {
      console.error('Errore salvataggio avventura su Supabase:', error, newAdventure);
    }
  };

  const updateAdventure = async (updatedAdventure: Adventure) => {
    const nextAdventure = {
      ...updatedAdventure,
      updatedAt: nowIso()
    };

    setAdventures(prev =>
      prev.map(adventure =>
        adventure.id === nextAdventure.id ? nextAdventure : adventure
      )
    );

    try {
      await saveAdventureToSupabase(campaignId, nextAdventure);
    } catch (error) {
      console.error('Errore aggiornamento avventura su Supabase:', error, nextAdventure);
    }
  };

  const deleteAdventure = async (id: string) => {
  if (!confirm('Eliminare questa avventura?')) {
    return;
  }

  let fallbackId: string | null = null;

  setAdventures(prev => {
    let next = prev.filter(adventure => adventure.id !== id);

    const stillHasActive = next.some(adventure => adventure.isActive);

    if (!stillHasActive && next.length > 0) {
      next = next.map((adventure, index) => ({
        ...adventure,
        isActive: index === 0,
        updatedAt: index === 0 ? nowIso() : adventure.updatedAt
      }));
    }

    fallbackId = next.find(adventure => adventure.campaignId === campaignId)?.id ?? null;

    return next.map(adventure => ({
      ...adventure,
      nextAdventureIds: (adventure.nextAdventureIds ?? []).filter(
        nextId => nextId !== id
      )
    }));
  });

  if (selectedAdventureId === id) {
    setSelectedAdventureId(fallbackId);
    setIsEditing(false);
  }

  try {
    await deleteAdventureFromSupabase(id);
  } catch (error) {
    console.error('Errore eliminazione avventura da Supabase:', error);
  }
};

  const setActiveAdventure = async (id: string) => {
    const updatedAdventures = adventures.map(adventure => ({
      ...adventure,
      isActive: adventure.id === id,
      updatedAt: adventure.id === id ? nowIso() : adventure.updatedAt
    }));

    setAdventures(updatedAdventures);
    setSelectedAdventureId(id);

    // Save all affected adventures to Supabase
    for (const adventure of updatedAdventures) {
      try {
        await saveAdventureToSupabase(campaignId, adventure);
      } catch (error) {
        console.error('Errore aggiornamento avventura attiva su Supabase:', error, adventure);
      }
    }
  };

  const toggleNextAdventure = (targetId: string) => {
    if (!selectedAdventure) {
      return;
    }

    const currentNext = selectedAdventure.nextAdventureIds ?? [];

    const alreadyLinked = currentNext.includes(targetId);

    const updatedAdventure: Adventure = {
      ...selectedAdventure,
      nextAdventureIds: alreadyLinked
        ? currentNext.filter(id => id !== targetId)
        : [...currentNext, targetId]
    };

    updateAdventure(updatedAdventure);
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-1">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[var(--dash-text)]">Avventure</h2>
            <p className="text-sm text-[var(--dash-muted)]">
              Struttura narrativa della campagna
            </p>
          </div>

          <button
            onClick={addAdventure}
            className="rounded-lg border-2 border-[var(--dash-border)] bg-[var(--dash-border)] p-2 text-[var(--dash-text)] transition-colors hover:bg-[var(--dash-border)]"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-2">
          {filteredAdventures.length === 0 ? (
            <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] px-5 py-8 text-center">
              <GitBranch className="mx-auto mb-3 h-10 w-10 text-[var(--dash-muted)]" />
              <div className="text-xs uppercase tracking-[0.16em] text-[var(--dash-accent-2)]">
                Nessuna avventura
              </div>
              <h3 className="mt-2 text-lg font-semibold text-[var(--dash-text-strong)]">
                Struttura campagna vuota
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--dash-text)]">
                Crea la prima avventura per iniziare a costruire il percorso narrativo.
              </p>
            </div>
          ) : (
            filteredAdventures.map(adventure => (
              <div
                key={adventure.id}
                onClick={() => {
                  setSelectedAdventureId(adventure.id);
                  setIsEditing(false);
                }}
                className={`cursor-pointer rounded-xl border p-4 transition-colors ${
                  selectedAdventureId === adventure.id
                    ? 'border-[var(--dash-accent)] bg-[var(--dash-panel)]'
                    : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface)] hover:border-[var(--dash-accent)]'
                }`}
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-medium text-[var(--dash-text-strong)]">
                      {adventure.title}
                    </h3>

                    <p className="mt-1 text-sm text-[var(--dash-text)]">
                      {getKindLabel(adventure.kind)}
                    </p>
                  </div>

                  {adventure.isActive && (
                    <span className="rounded-full border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-2 py-1 text-[10px] uppercase tracking-[0.08em] text-[var(--dash-text-strong)]">
                      Attiva
                    </span>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[var(--dash-muted)]">
                  <span className="rounded-full border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-2 py-0.5">
                    {(adventure.nextAdventureIds ?? []).length} uscite
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="lg:col-span-2">
        {selectedAdventure ? (
          <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-6">
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-[var(--dash-text-strong)]">
                  {selectedAdventure.title}
                </h2>
                <p className="mt-1 text-sm text-[var(--dash-text)]">
                  {getKindLabel(selectedAdventure.kind)}
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
  onClick={() => deleteAdventure(selectedAdventure.id)}
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
                    value={selectedAdventure.title}
                    onChange={e =>
                      updateAdventure({
                        ...selectedAdventure,
                        title: e.target.value
                      })
                    }
                    className="w-full rounded px-3 py-2 border-2 border-[var(--dash-border)] bg-[var(--dash-input)] text-[var(--dash-text)]"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-[var(--dash-text)]">Descrizione</label>
                  <textarea
                    value={selectedAdventure.description}
                    onChange={e =>
                      updateAdventure({
                        ...selectedAdventure,
                        description: e.target.value
                      })
                    }
                    className="w-full h-28 resize-none rounded px-3 py-2 border-2 border-[var(--dash-border)] bg-[var(--dash-input)] text-[var(--dash-text)]"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-[var(--dash-text)]">Note GM</label>
                  <textarea
                    value={selectedAdventure.notes}
                    onChange={e =>
                      updateAdventure({
                        ...selectedAdventure,
                        notes: e.target.value
                      })
                    }
                    className="w-full h-28 resize-none rounded px-3 py-2 border-2 border-[var(--dash-border)] bg-[var(--dash-input)] text-[var(--dash-text)]"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-[var(--dash-text)]">Tipo Avventura</label>
                  <select
                    value={selectedAdventure.kind}
                    onChange={e =>
                      updateAdventure({
                        ...selectedAdventure,
                        kind: e.target.value as AdventureKind
                      })
                    }
                    className="w-full rounded px-3 py-2 border-2 border-[var(--dash-border)] bg-[var(--dash-input)] text-[var(--dash-text)]"
                  >
                    <option value="intro">Introduttiva</option>
                    <option value="standard">Standard</option>
                    <option value="final">Finale</option>
                  </select>
                </div>

                <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-sm uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
                      Avventura attiva
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveAdventure(selectedAdventure.id)}
                      className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                        selectedAdventure.isActive
                          ? 'border-[var(--dash-accent)] bg-[var(--dash-accent)] text-[var(--dash-text-strong)]'
                          : 'border-[var(--dash-border-soft)] bg-[var(--dash-panel)] text-[var(--dash-text)] hover:bg-[var(--dash-surface-2)]'
                      }`}
                    >
                      <Star className="h-4 w-4" />
                      {selectedAdventure.isActive
                        ? 'Già attiva'
                        : 'Imposta come attiva'}
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                  <div className="mb-3 text-sm uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
                    Possibili avventure successive
                  </div>

                  <div className="space-y-2">
                    {filteredAdventures
                      .filter(adventure => adventure.id !== selectedAdventure.id)
                      .map(adventure => (
                        <label
                          key={adventure.id}
                          className="flex items-center gap-2 text-sm text-[var(--dash-text-strong)]"
                        >
                          <input
                            type="checkbox"
                            checked={(selectedAdventure.nextAdventureIds ?? []).includes(adventure.id)}
                            onChange={() => toggleNextAdventure(adventure.id)}
                            className="h-4 w-4 accent-[var(--dash-accent)]"
                          />
                          <span>
                            {adventure.title} ·{' '}
                            <span className="text-[var(--dash-accent-2)]">
                              {getKindLabel(adventure.kind)}
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
                    {selectedAdventure.description || 'Nessuna descrizione'}
                  </p>
                </div>

                <div>
                  <h3 className="mb-2 text-[var(--dash-text)]">Note GM</h3>
                  <p className="text-[var(--dash-muted)]">
                    {selectedAdventure.notes || 'Nessuna nota'}
                  </p>
                </div>

                <div className="rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] p-4">
                  <h3 className="mb-2 text-[var(--dash-text)]">Stato</h3>
                  <p className="text-[var(--dash-muted)]">
                    {selectedAdventure.isActive
                      ? 'Questa è l\'avventura attualmente attiva.'
                      : 'Avventura disponibile ma non attiva.'}
                  </p>
                </div>

                <div className="rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] p-4">
                  <h3 className="mb-2 text-[var(--dash-text)]">Prossime avventure</h3>

                  {(selectedAdventure.nextAdventureIds ?? []).length === 0 ? (
                    <p className="text-[var(--dash-muted)]">
                      Nessuna diramazione definita.
                    </p>
                  ) : (
                    <ul className="space-y-1 text-[var(--dash-muted)]">
                      {(selectedAdventure.nextAdventureIds ?? []).map(nextId => {
                        const nextAdventure = filteredAdventures.find(
                          adventure => adventure.id === nextId
                        );

                        return (
                          <li key={nextId}>
                            • {nextAdventure?.title ?? 'Avventura rimossa'}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-12 text-center">
            <GitBranch className="mx-auto mb-4 h-16 w-16 text-[var(--dash-muted)]" />
            <div className="text-xs uppercase tracking-[0.16em] text-[var(--dash-accent-2)]">
              Nessuna avventura selezionata
            </div>
            <h3 className="mt-2 text-xl font-semibold text-[var(--dash-text-strong)]">
              Seleziona un nodo narrativo
            </h3>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[var(--dash-text)]">
              Apri un'avventura esistente oppure crea la prima diramazione della campagna.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}