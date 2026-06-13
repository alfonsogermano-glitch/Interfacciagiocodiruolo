import { useEffect, useState } from 'react';
import { Plus, CheckCircle, Circle } from 'lucide-react';
import { CAMPAIGN_STORAGE_KEYS } from '../../../services/campaign/campaignStorageKeys';
import { loadClues, saveClue as saveClueToSupabase, deleteClue as deleteClueFromSupabase } from '../../../services/supabase/entitiesService';
import { DEFAULT_CAMPAIGN_ID } from '../../../config/campaign.config';
import { generateUUID } from '../../../lib/uuid';

type EnvironmentSummary = {
  id: string;
  campaignId?: string | null;
  adventureId?: string | null;
  name: string;
};

const ENVIRONMENTS_STORAGE_KEY = CAMPAIGN_STORAGE_KEYS.environments;

interface Clue {
  id: string;
  campaignId: string;
  adventureId?: string | null;
  environmentId?: string | null;
  title: string;
  description: string;
  location: string;
  discovered: boolean;
  connectedTo: string[];
}

const CLUES_STORAGE_KEY = CAMPAIGN_STORAGE_KEYS.clues;

// Nessun indizio di default: gli utenti creano i propri indizi

interface CluesManagerProps {
  storageRefreshKey?: number;
}

export function CluesManager({
  storageRefreshKey = 0
}: CluesManagerProps) {
  const [clues, setClues] = useState<Clue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newClue, setNewClue] = useState({
  title: '',
  description: '',
  location: '',
  environmentId: ''
    });

  useEffect(() => {
    async function loadData() {
      try {
        const loadedClues = await loadClues(DEFAULT_CAMPAIGN_ID);

        // loadClues già restituisce dati mappati correttamente (toCamelCase)
        setClues(loadedClues);
        console.log('Indizi caricati da Supabase:', loadedClues);
      } catch (error) {
        console.error('Errore caricamento indizi da Supabase:', error);

        try {
          const savedClues = window.localStorage.getItem(CLUES_STORAGE_KEY);
          if (savedClues) {
            const parsedClues = JSON.parse(savedClues);
            if (Array.isArray(parsedClues)) {
              setClues(parsedClues);
            } else {
              setClues([]);
            }
          } else {
            setClues([]);
          }
        } catch (localError) {
          console.error('Errore caricamento indizi da localStorage:', localError);
          setClues([]);
        }
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
    }, [storageRefreshKey]);

  useEffect(() => {
    if (isLoading) return;

    try {
      window.localStorage.setItem(
        CLUES_STORAGE_KEY,
        JSON.stringify(clues)
      );
    } catch (error) {
      console.error('Errore nel salvataggio degli indizi su localStorage:', error);
    }
  }, [clues, isLoading]);

  const [environments] = useState<EnvironmentSummary[]>(() => {
  if (typeof window === 'undefined') return [];

  try {
    const saved = window.localStorage.getItem(ENVIRONMENTS_STORAGE_KEY);
    if (!saved) return [];

    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
});

  const addClue = async () => {
  if (!newClue.title) return;

  const clueToAdd = {
    id: generateUUID(),
    campaignId: DEFAULT_CAMPAIGN_ID,
    adventureId:
      environments.find(env => env.id === newClue.environmentId)?.adventureId ?? null,
    environmentId: newClue.environmentId || null,
    title: newClue.title,
    description: newClue.description,
    location: newClue.location,
    discovered: false,
    connectedTo: []
  };

  setClues(prev => [...prev, clueToAdd]);

  setNewClue({
    title: '',
    description: '',
    location: '',
    environmentId: ''
  });

  setShowAddForm(false);

  try {
    // Passa l'intero oggetto - il servizio si occupa del mapping automatico
    await saveClueToSupabase(DEFAULT_CAMPAIGN_ID, clueToAdd);
  } catch (error) {
    console.error('Errore salvataggio indizio su Supabase:', error, clueToAdd);
  }
};

  const toggleDiscovered = async (id: string) => {
    const clue = clues.find(c => c.id === id);
    if (!clue) return;

    const updatedClue = { ...clue, discovered: !clue.discovered };

    setClues(prev => prev.map(c =>
      c.id === id ? updatedClue : c
    ));

    try {
      // Passa l'intero oggetto - il servizio si occupa del mapping automatico
      await saveClueToSupabase(DEFAULT_CAMPAIGN_ID, updatedClue);
    } catch (error) {
      console.error('Errore aggiornamento indizio su Supabase:', error, updatedClue);
    }
  };

  const deleteClue = async (id: string) => {
    if (confirm('Eliminare questo indizio?')) {
      setClues(prev => prev.filter(clue => clue.id !== id));

      try {
        await deleteClueFromSupabase(id);
      } catch (error) {
        console.error('Errore eliminazione indizio da Supabase:', error);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-[var(--dash-text)]">Indizi</h2>
          <p className="text-[var(--dash-muted)] text-sm">
            Scoperti: {clues.filter(c => c.discovered).length} / {clues.length}
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-[var(--dash-border)] border-2 border-[var(--dash-border)] rounded-lg px-4 py-2 text-[var(--dash-text)] hover:bg-[var(--dash-accent)] transition-colors flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Aggiungi Indizio
        </button>
      </div>

      {showAddForm && (
        <div className="bg-[var(--dash-surface-2)] border-2 border-[var(--dash-border)] rounded-lg p-6">
          <h3 className="text-[var(--dash-text)] mb-4">Nuovo Indizio</h3>
          <div className="space-y-4 mb-4">
            <input
              type="text"
              placeholder="Titolo indizio"
              value={newClue.title}
              onChange={(e) => setNewClue({ ...newClue, title: e.target.value })}
              className="w-full bg-[var(--dash-input)] text-[var(--dash-text)] border-2 border-[var(--dash-border)] rounded px-3 py-2"
            />
            <textarea
              placeholder="Descrizione dettagliata"
              value={newClue.description}
              onChange={(e) => setNewClue({ ...newClue, description: e.target.value })}
              className="w-full h-24 bg-[var(--dash-input)] text-[var(--dash-text)] border-2 border-[var(--dash-border)] rounded px-3 py-2 resize-none"
            />
            <input
              type="text"
              placeholder="Dove si trova?"
              value={newClue.location}
              onChange={(e) => setNewClue({ ...newClue, location: e.target.value })}
              className="w-full bg-[var(--dash-input)] text-[var(--dash-text)] border-2 border-[var(--dash-border)] rounded px-3 py-2"
            />
            <select
  value={newClue.environmentId}
  onChange={e =>
    setNewClue({
      ...newClue,
      environmentId: e.target.value
    })
  }
  className="w-full bg-[var(--dash-input)] text-[var(--dash-text)] border-2 border-[var(--dash-border)] rounded px-3 py-2"
>
  <option value="">Nessun ambiente collegato</option>

  {environments
    .filter(environment =>
      environment.campaignId == null ||
      environment.campaignId === DEFAULT_CAMPAIGN_ID
    )
    .map(environment => (
      <option key={environment.id} value={environment.id}>
        {environment.name}
      </option>
    ))}
</select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={addClue}
              className="bg-[var(--dash-accent)] text-[var(--dash-text)] rounded px-4 py-2 hover:bg-[var(--dash-accent-2)]"
            >
              Aggiungi
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="bg-[var(--dash-border)] text-[var(--dash-muted)] rounded px-4 py-2 hover:bg-[var(--dash-input)]"
            >
              Annulla
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {clues.map(clue => (
          <div
            key={clue.id}
            className={`bg-[var(--dash-surface-2)] border-2 rounded-lg p-6 transition-all ${
              clue.discovered ? 'border-[var(--dash-accent)] bg-[var(--dash-accent)]/20' : 'border-[var(--dash-border)]'
            }`}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  {clue.discovered ? (
                    <CheckCircle className="w-5 h-5 text-[var(--dash-accent-2)]" />
                  ) : (
                    <Circle className="w-5 h-5 text-[var(--dash-muted)]" />
                  )}
                  <h3 className="text-[var(--dash-text)]">{clue.title}</h3>
                </div>
                <p className="text-[var(--dash-muted)] text-sm mb-2">📍 {clue.location}</p>
                {clue.environmentId && (
  <p className="text-[var(--dash-text)] text-xs mb-2">
    Ambiente: {environments.find(env => env.id === clue.environmentId)?.name ?? 'Ambiente non trovato'}
  </p>
)}
              </div>
              <button
                onClick={() => deleteClue(clue.id)}
                className="text-[var(--dash-muted)] hover:text-[var(--dash-danger-text)]"
              >
                ✕
              </button>
            </div>

            <p className="text-[var(--dash-muted)] mb-4">{clue.description}</p>

            <button
              onClick={() => toggleDiscovered(clue.id)}
              className={`w-full py-2 rounded transition-colors ${
                clue.discovered
                  ? 'bg-[var(--dash-accent)] text-[var(--dash-text-strong)] hover:bg-[var(--dash-accent-2)]'
                  : 'bg-[var(--dash-border)] text-[var(--dash-text)] hover:bg-[var(--dash-accent)]'
              }`}
            >
              {clue.discovered ? 'Scoperto' : 'Segna come Scoperto'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}