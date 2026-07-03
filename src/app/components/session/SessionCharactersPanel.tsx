import { useEffect, useRef, useState, useCallback } from 'react';
import { User, Heart, Brain, Shield, Loader2 } from 'lucide-react';
import { projectId } from '/utils/supabase/info';
import { FrischezzaTracker } from '../FrischezzaTracker';
import { FoliaSpiral } from '../FoliaSpiral';
import { ConditionsPanel } from '../ConditionsPanel';
import { TurbePanel } from '../TurbePanel';
import { EquipmentPanel as LegacyEquipmentPanel } from '../EquipmentPanel';
import type { Character } from '../../../types/character';
import { loadCharacters, loadCharactersViaServer, saveCharacter as saveCharacterToSupabase, saveCharacterAsGm, mapRowToCharacter } from '../../../services/supabase/charactersService';
import { useAuth, supabase } from '../../auth/AuthContext';
import { useCampaign } from '../../campaigns/CampaignContext';
import { useRuleset } from '../../campaigns/RulesetContext';

interface PlayerCharacter extends Character {
  player: string;
  notes: string;
}

const SERVER_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-771c5bfd`;

export function SessionCharactersPanel() {
  const { user, session } = useAuth();
  const { activeCampaignId, activeCampaign } = useCampaign();
  const { isHSC } = useRuleset();

  const [characters, setCharacters] = useState<PlayerCharacter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentTab, setCurrentTab] = useState<'stats' | 'conditions' | 'equipment'>('stats');

  const loadSeqRef = useRef(0);
  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const isOwner = activeCampaign?.ownerId === user?.id;

  const loadData = useCallback(async () => {
    const mySeq = ++loadSeqRef.current;
    try {
      let loaded;
      if (session?.access_token) {
        loaded = await loadCharactersViaServer(activeCampaignId, SERVER_BASE, session.access_token);
      } else {
        loaded = await loadCharacters(activeCampaignId);
      }
      if (loadSeqRef.current !== mySeq) return;
      setCharacters(loaded);
      setSelectedId(prev => prev && loaded.some((c: any) => c.id === prev) ? prev : (loaded[0]?.id ?? null));
    } catch (error) {
      console.error('Errore caricamento personaggi (sessione):', error);
    } finally {
      if (loadSeqRef.current === mySeq) setIsLoading(false);
    }
  }, [activeCampaignId, session?.access_token]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!activeCampaignId) return;
    let isActive = true;
    let currentChannel: ReturnType<typeof supabase.channel> | null = null;

    const handleBroadcast = (msg: any) => {
      const data = msg?.payload ?? {};
      if (data.operation === 'DELETE') {
        const deletedId = data.old_record?.id;
        if (!deletedId) return;
        setCharacters(prev => prev.filter(c => c.id !== deletedId));
        return;
      }
      const row = data.record;
      if (!row) return;
      const mapped = mapRowToCharacter(row) as PlayerCharacter;
      setCharacters(prev => {
        const exists = prev.some(c => c.id === mapped.id);
        return exists ? prev.map(c => (c.id === mapped.id ? mapped : c)) : [...prev, mapped];
      });
    };

    (async () => {
      await supabase.realtime.setAuth();
      const ch = supabase
        .channel(`campaign:${activeCampaignId}`, { config: { private: true } })
        .on('broadcast', { event: 'INSERT' }, handleBroadcast)
        .on('broadcast', { event: 'UPDATE' }, handleBroadcast)
        .on('broadcast', { event: 'DELETE' }, handleBroadcast)
        .subscribe();
      currentChannel = ch;
    })();

    return () => {
      isActive = false;
      if (currentChannel) { try { supabase.removeChannel(currentChannel); } catch {} }
    };
  }, [activeCampaignId]);

  const persistCharacter = useCallback((id: string, updatedChar: PlayerCharacter) => {
    if (saveTimersRef.current[id]) clearTimeout(saveTimersRef.current[id]);
    saveTimersRef.current[id] = setTimeout(async () => {
      const isMine = (updatedChar as any).ownerProfileId === user?.id;
      try {
        if (isMine || !(updatedChar as any).ownerProfileId) {
          await saveCharacterToSupabase(activeCampaignId, updatedChar, user?.id ?? '');
        } else {
          await saveCharacterAsGm(activeCampaignId, id, updatedChar, SERVER_BASE, session?.access_token ?? '');
        }
      } catch (error) {
        console.error('Errore salvataggio personaggio (sessione):', error);
      }
    }, 150);
  }, [activeCampaignId, session?.access_token, user?.id]);

  const updateCharacter = (id: string, updatedChar: PlayerCharacter) => {
    setCharacters(prev => prev.map(c => (c.id === id ? updatedChar : c)));
    persistCharacter(id, updatedChar);
  };

  const selected = characters.find(c => c.id === selectedId) ?? null;
  const isMine = selected ? (selected as any).ownerProfileId === user?.id : false;
  const canEdit = isMine || isOwner;

  if (isLoading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[var(--dash-muted)]" /></div>;
  }

  if (characters.length === 0) {
    return <div className="flex h-full items-center justify-center p-8 text-center text-sm text-[var(--dash-muted)]">Nessun personaggio giocante presente in questa campagna.</div>;
  }

  return (
    <div className="flex h-full">
      <div className="w-64 shrink-0 overflow-y-auto border-r border-[var(--dash-border-soft)]">
        {characters.map(char => (
          <button
            key={char.id}
            type="button"
            onClick={() => { setSelectedId(char.id); setCurrentTab('stats'); }}
            className={`flex w-full items-center gap-3 border-b border-[var(--dash-border-soft)] px-4 py-3 text-left transition-colors ${
              selectedId === char.id ? 'bg-[var(--dash-surface-2)]' : 'hover:bg-[var(--dash-surface-2)]/50'
            }`}
          >
            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-[var(--dash-accent)] bg-[var(--dash-input)]">
              {char.portraitCroppedImageUrl || char.portraitImageUrl ? (
                <img src={char.portraitCroppedImageUrl || char.portraitImageUrl} alt={char.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center"><User className="h-5 w-5 text-[var(--dash-accent-2)]" /></div>
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-[var(--dash-text-strong)]">{char.name}</div>
              <div className="truncate text-xs text-[var(--dash-muted)]">{char.player || char.style}</div>
            </div>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {!selected ? (
          <div className="flex h-full items-center justify-center text-sm text-[var(--dash-muted)]">Seleziona un personaggio</div>
        ) : (
          <fieldset disabled={!canEdit} className={!canEdit ? 'opacity-90' : ''}>
            <div className="mb-4 flex items-center gap-3">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border-2 border-[var(--dash-accent)] bg-[var(--dash-input)]">
                {selected.portraitCroppedImageUrl || selected.portraitImageUrl ? (
                  <img src={selected.portraitCroppedImageUrl || selected.portraitImageUrl} alt={selected.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center"><User className="h-6 w-6 text-[var(--dash-accent-2)]" /></div>
                )}
              </div>
              <div>
                <h3 className="text-xl font-semibold text-[var(--dash-text-strong)]">{selected.name}</h3>
                <p className="text-sm text-[var(--dash-muted)]">{selected.style} · {selected.viaggio}</p>
              </div>
            </div>

            {!canEdit && (
              <div className="mb-4 rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-3 py-2 text-xs text-[var(--dash-muted)]">
                Puoi visualizzare questo personaggio ma non modificarlo.
              </div>
            )}

            <div className="mb-4 flex flex-wrap gap-2 border-b border-[var(--dash-border-soft)] pb-3">
              {[
                { id: 'stats' as const, label: 'Stato' },
                { id: 'conditions' as const, label: 'Condizioni & Follia' },
                { id: 'equipment' as const, label: 'Equipaggiamento' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setCurrentTab(tab.id)}
                  className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                    currentTab === tab.id
                      ? 'border border-[var(--dash-accent)] bg-[var(--dash-accent)] text-[var(--dash-text-strong)]'
                      : 'border border-transparent bg-transparent text-[var(--dash-text)] hover:bg-[var(--dash-panel)]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {currentTab === 'stats' && isHSC && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                  <FrischezzaTracker
                    current={selected.freschezza}
                    max={selected.maxFreschezza}
                    crucialBoxes={selected.caselleFrischezzaCruciali}
                    onUpdate={(value) => updateCharacter(selected.id, { ...selected, freschezza: value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(selected.ambiti).map(([ambito, value]) => (
                    <div key={ambito} className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-3 py-2">
                      <div className="text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">{ambito}</div>
                      <div className="mt-1 text-xl font-semibold text-[var(--dash-text-strong)]">{value}</div>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                  <div className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Tratti</div>
                  {selected.tratti.length > 0 ? (
                    <div className="space-y-2">
                      {selected.tratti.map((trait, idx) => (
                        <div key={idx} className="rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-2 text-sm">
                          <div className="font-medium text-[var(--dash-text-strong)]">{trait.name}</div>
                          {trait.description && <div className="text-xs text-[var(--dash-text)]">{trait.description}</div>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-[var(--dash-muted)]">Nessun tratto.</div>
                  )}
                </div>
              </div>
            )}

            {currentTab === 'conditions' && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                  <div className="mb-2 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Condizioni attive</div>
                  <ConditionsPanel conditions={selected.conditions} onUpdate={(conditions) => updateCharacter(selected.id, { ...selected, conditions })} />
                </div>
                <div className="rounded-2xl border border-[var(--dash-accent)] bg-[var(--dash-panel)] p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
                    <Brain className="h-3.5 w-3.5 text-purple-400" /> Spirale della Follia
                  </div>
                  <FoliaSpiral current={selected.follia} max={selected.maxFollia} onUpdate={(value) => updateCharacter(selected.id, { ...selected, follia: value })} />
                </div>
                <div className="rounded-2xl border border-[var(--dash-accent)] bg-[var(--dash-panel)] p-4">
                  <div className="mb-2 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Turbe mentali</div>
                  <TurbePanel turbe={selected.turbe} onUpdate={(turbe) => updateCharacter(selected.id, { ...selected, turbe })} />
                </div>
              </div>
            )}

            {currentTab === 'equipment' && (
              <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                <LegacyEquipmentPanel equipment={selected.equipment} onUpdate={(equipment) => updateCharacter(selected.id, { ...selected, equipment })} />
              </div>
            )}
          </fieldset>
        )}
      </div>
    </div>
  );
}
