import { useEffect, useState } from 'react';
import { useCampaign } from '../../campaigns/CampaignContext';
import { Scroll, Plus, ChevronDown, ChevronRight } from 'lucide-react';
import { CAMPAIGN_STORAGE_KEYS } from '../../../services/campaign/campaignStorageKeys';
import { loadSituations, saveSituation as saveSituationToSupabase, deleteSituation as deleteSituationFromSupabase } from '../../../services/supabase/entitiesService';
import { generateUUID } from '../../../lib/uuid';

type EnvironmentSummary = {
  id: string;
  campaignId?: string | null;
  adventureId?: string | null;
  name: string;
};

interface Situation {
  id: string;
  campaignId: string;
  adventureId?: string | null;
  environmentId?: string | null;
  title: string;
  trigger: string;
  description: string;
  consequences: string[];
  choices: { text: string; outcome: string }[];
}

const SITUATIONS_STORAGE_KEY = CAMPAIGN_STORAGE_KEYS.situations;
const ENVIRONMENTS_STORAGE_KEY = CAMPAIGN_STORAGE_KEYS.environments;

// Nessuna situazione di default: gli utenti creano le proprie situazioni

interface SituationsManagerProps {
  storageRefreshKey?: number;
}

export function SituationsManager({
  storageRefreshKey = 0
}: SituationsManagerProps) {
  const { activeCampaignId } = useCampaign();
  const [situations, setSituations] = useState<Situation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const loadedSituations = await loadSituations(activeCampaignId);

        // loadSituations già restituisce dati mappati correttamente (toCamelCase)
        setSituations(loadedSituations);
        console.log('Situazioni caricate da Supabase:', loadedSituations);
      } catch (error) {
        console.error('Errore caricamento situazioni da Supabase:', error);

        try {
          const savedSituations = window.localStorage.getItem(SITUATIONS_STORAGE_KEY);
          if (savedSituations) {
            const parsedSituations = JSON.parse(savedSituations);
            if (Array.isArray(parsedSituations)) {
              setSituations(parsedSituations);
            } else {
              setSituations([]);
            }
          } else {
            setSituations([]);
          }
        } catch (localError) {
          console.error('Errore caricamento situazioni da localStorage:', localError);
          setSituations([]);
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
        SITUATIONS_STORAGE_KEY,
        JSON.stringify(situations)
      );
    } catch (error) {
      console.error('Errore nel salvataggio delle situazioni su localStorage:', error);
    }
  }, [situations, isLoading]);

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

  const addSituation = async () => {
    const newSituation: Situation = {
       id: generateUUID(),
       campaignId: activeCampaignId,
       adventureId: null,
       environmentId: null,
       title: 'Nuova Situazione',
       trigger: '',
       description: '',
       consequences: [],
       choices: []
      };
    setSituations(prev => [...prev, newSituation]);
    setExpandedId(newSituation.id);

    try {
      // Passa l'intero oggetto - il servizio si occupa del mapping automatico
      await saveSituationToSupabase(activeCampaignId, newSituation);
    } catch (error) {
      console.error('Errore salvataggio situazione su Supabase:', error, newSituation);
    }
  };

  const saveSituationChanges = async (situation: Situation) => {
    try {
      // Passa l'intero oggetto - il servizio si occupa del mapping automatico
      await saveSituationToSupabase(activeCampaignId, situation);
    } catch (error) {
      console.error('Errore aggiornamento situazione su Supabase:', error, situation);
    }
  };

  const deleteSituation = async (id: string) => {
    if (confirm('Eliminare questa situazione?')) {
      setSituations(prev => prev.filter(sit => sit.id !== id));

      try {
        await deleteSituationFromSupabase(id);
      } catch (error) {
        console.error('Errore eliminazione situazione da Supabase:', error);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-[var(--dash-text)]">Situazioni & Scelte</h2>
          <p className="text-[var(--dash-muted)] text-sm">Scenari basati sulle azioni dei personaggi</p>
        </div>
        <button
          onClick={addSituation}
          className="bg-[var(--dash-border)] border-2 border-[var(--dash-border)] rounded-lg px-4 py-2 text-[var(--dash-text)] hover:bg-[var(--dash-border)] transition-colors flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Aggiungi Situazione
        </button>
      </div>

      <div className="space-y-4">
        {situations.map(situation => (
          <div key={situation.id} className="bg-[var(--dash-surface-2)] border-2 border-[var(--dash-border)] rounded-lg overflow-hidden">
            <div
              onClick={() => setExpandedId(expandedId === situation.id ? null : situation.id)}
              className="flex items-center justify-between p-4 cursor-pointer hover:bg-[var(--dash-input)] transition-colors"
            >
              <div className="flex items-center gap-3">
                {expandedId === situation.id ? (
                  <ChevronDown className="w-5 h-5 text-[var(--dash-accent)]" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-[var(--dash-accent)]" />
                )}
                <Scroll className="w-5 h-5 text-[var(--dash-accent)]" />
                <h3 className="text-[var(--dash-text)]">{situation.title}</h3>
                {situation.environmentId && (
  <span className="rounded-full border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-2 py-0.5 text-[11px] text-[var(--dash-text)]">
    {environments.find(env => env.id === situation.environmentId)?.name ?? 'Ambiente'}
  </span>
)}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteSituation(situation.id);
                }}
                className="text-[var(--dash-muted)] hover:text-[var(--dash-danger-text)]"
              >
                ✕
              </button>
            </div>

            {expandedId === situation.id && (
              <div className="p-6 pt-0 space-y-4">
                <div className="bg-[var(--dash-input)] rounded-lg p-4">
                  <h4 className="text-[var(--dash-text)] mb-2">🎯 Trigger</h4>
                  <p className="text-[var(--dash-muted)]">{situation.trigger || 'Non specificato'}</p>
                </div>

                <div className="bg-[var(--dash-input)] rounded-lg p-4">
                  <h4 className="text-[var(--dash-text)] mb-2">📖 Descrizione</h4>
                  <p className="text-[var(--dash-muted)]">{situation.description || 'Nessuna descrizione'}</p>
                </div>

                {situation.consequences.length > 0 && (
                  <div className="bg-[var(--dash-input)] rounded-lg p-4">
                    <div className="bg-[var(--dash-input)] rounded-lg p-4">
  <h4 className="text-[var(--dash-text)] mb-2">Ambiente collegato</h4>

  <select
    value={situation.environmentId ?? ''}
    onChange={async e => {
      const selectedEnvironment = environments.find(
        env => env.id === e.target.value
      );

      const updatedSituation = {
        ...situation,
        environmentId: e.target.value || null,
        adventureId: selectedEnvironment?.adventureId ?? null
      };

      setSituations(prev =>
        prev.map(item =>
          item.id === situation.id
            ? updatedSituation
            : item
        )
      );

      await saveSituationChanges(updatedSituation);
    }}
    className="w-full bg-[var(--dash-surface-2)] text-[var(--dash-text)] border-2 border-[var(--dash-border)] rounded px-3 py-2"
  >
    <option value="">Nessun ambiente collegato</option>

    {environments
      .filter(environment =>
        environment.campaignId == null ||
        environment.campaignId === activeCampaignId
      )
      .map(environment => (
        <option key={environment.id} value={environment.id}>
          {environment.name}
        </option>
      ))}
  </select>
</div>
                    <h4 className="text-[var(--dash-text)] mb-2">⚠️ Possibili Conseguenze</h4>
                    <ul className="space-y-1">
                      {situation.consequences.map((cons, idx) => (
                        <li key={idx} className="text-[var(--dash-muted)] flex items-start gap-2">
                          <span>•</span>
                          <span>{cons}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {situation.choices.length > 0 && (
                  <div className="bg-[var(--dash-input)] rounded-lg p-4">
                    <h4 className="text-[var(--dash-text)] mb-3">🔀 Scelte Possibili</h4>
                    <div className="space-y-3">
                      {situation.choices.map((choice, idx) => (
                        <div key={idx} className="bg-[var(--dash-surface-2)] rounded p-3 border border-[var(--dash-border)]">
                          <p className="text-[var(--dash-text)] mb-1">→ {choice.text}</p>
                          <p className="text-[var(--dash-muted)] text-sm pl-4">{choice.outcome}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}