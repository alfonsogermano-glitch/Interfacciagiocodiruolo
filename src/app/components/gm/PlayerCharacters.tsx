import { useEffect, useRef, useState, useCallback } from 'react';
import { UserPlus, User, Heart, Brain, Shield, ChevronDown, ChevronUp, X, Loader2 } from 'lucide-react';
import { projectId } from '/utils/supabase/info';
import { FrischezzaTracker } from '../FrischezzaTracker';
import { FoliaSpiral } from '../FoliaSpiral';
import { ConditionsPanel } from '../ConditionsPanel';
import { TurbePanel } from '../TurbePanel';
import { EquipmentPanel as LegacyEquipmentPanel } from '../EquipmentPanel';
import { CharacterCreationWizard } from './CharacterCreationWizard';
import type { Character } from '../../../types/character';
import { CAMPAIGN_STORAGE_KEYS } from '../../../services/campaign/campaignStorageKeys';
import { loadCharacters, loadCharactersViaServer, saveCharacter as saveCharacterToSupabase, saveCharacterAsGm, deleteCharacter as deleteCharacterFromSupabase, deleteCharacterAsGm, mapRowToCharacter } from '../../../services/supabase/charactersService';
import { generateUUID } from '../../../lib/uuid';
import { useAuth, supabase } from '../../auth/AuthContext';
import { useCampaign } from '../../campaigns/CampaignContext';
import { useRuleset } from '../../campaigns/RulesetContext';
import { RulesetBadge } from '../../campaigns/RulesetGate';
import { D20StatBlock, D20StatSummary, DEFAULT_D20_STATS, type D20Stats } from '../ruleset/D20StatBlock';

interface PlayerCharacter extends Character {
  player: string;
  notes: string;
  d20Stats?: D20Stats;
}

const PLAYER_CHARACTERS_STORAGE_KEY = CAMPAIGN_STORAGE_KEYS.playerCharacters;
const SERVER_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-771c5bfd`;
interface PlayerCharactersProps {
  storageRefreshKey?: number;
  navigationTarget?: { tabId: string; entityId?: string; entityType?: string } | null;
}

export function PlayerCharacters({
  storageRefreshKey = 0,
  navigationTarget
}: PlayerCharactersProps) {
  const { user, session } = useAuth();
  const { activeCampaignId, activeCampaign } = useCampaign();
  const { isHSC, isDnD5e, isPathfinder } = useRuleset();
  const isD20 = isDnD5e || isPathfinder;

  const [characters, setCharacters] = useState<PlayerCharacter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedCharacters, setExpandedCharacters] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<Record<string, 'stats' | 'conditions' | 'equipment'>>({});
  const [showWizard, setShowWizard] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<PlayerCharacter | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const loadSeqRef = useRef(0);
  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [pendingImportCharacters, setPendingImportCharacters] = useState<PlayerCharacter[] | null>(null);
  const [showImportChoiceModal, setShowImportChoiceModal] = useState(false);

  const loadData = useCallback(async () => {
    const mySeq = ++loadSeqRef.current;
    try {
      let loadedCharacters;
      if (session?.access_token) {
        loadedCharacters = await loadCharactersViaServer(activeCampaignId, SERVER_BASE, session.access_token);
      } else {
        loadedCharacters = await loadCharacters(activeCampaignId);
      }
      if (loadSeqRef.current !== mySeq) return;
      setCharacters(loadedCharacters);
    } catch (error) {
      console.error('Errore caricamento personaggi da Supabase:', error);
      if (loadSeqRef.current !== mySeq) return;
      try {
        const savedCharacters = window.localStorage.getItem(PLAYER_CHARACTERS_STORAGE_KEY);
        if (savedCharacters) {
          const parsed = JSON.parse(savedCharacters);
          if (Array.isArray(parsed)) {
            setCharacters(parsed);
          }
        }
      } catch (e) {
        console.error('Errore fallback localStorage:', e);
      }
    } finally {
      if (loadSeqRef.current === mySeq) setIsLoading(false);
    }
  }, [activeCampaignId, session?.access_token]);

  const persistCharacter = useCallback((id: string, updatedChar: PlayerCharacter) => {
    if (saveTimersRef.current[id]) {
      clearTimeout(saveTimersRef.current[id]);
    }
    saveTimersRef.current[id] = setTimeout(async () => {
      const isMine = (updatedChar as any).ownerProfileId === user?.id;
      try {
        if (isMine || !(updatedChar as any).ownerProfileId) {
          await saveCharacterToSupabase(activeCampaignId, updatedChar, user?.id ?? '');
        } else {
          await saveCharacterAsGm(activeCampaignId, id, updatedChar, SERVER_BASE, session?.access_token ?? '');
        }
      } catch (error) {
        console.error('Errore salvataggio personaggio su Supabase:', error);
      }
    }, 150);
  }, [activeCampaignId, session?.access_token, user?.id]);

  // Carica personaggi da Supabase all'avvio
  useEffect(() => {
    loadData();
  }, [storageRefreshKey, loadData]);

  useEffect(() => {
    if (!activeCampaignId) return;

    let isActive = true;
    let currentChannel: ReturnType<typeof supabase.channel> | null = null;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let retryCount = 0;
    const MAX_RETRIES = 5;

    const handleBroadcast = (msg: any) => {
      const data = msg?.payload ?? {};
      const operation = data.operation as string | undefined;

      if (operation === 'DELETE') {
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
        const next = exists
          ? prev.map(c => (c.id === mapped.id ? { ...mapped, ownerDisplayName: (c as any).ownerDisplayName } : c))
          : [...prev, mapped];
        return next.sort((a, b) => {
          const at = (a as any).createdAt ? new Date((a as any).createdAt).getTime() : 0;
          const bt = (b as any).createdAt ? new Date((b as any).createdAt).getTime() : 0;
          return at - bt;
        });
      });
    };

    const subscribeChannel = async () => {
      if (!isActive) return;
      await supabase.realtime.setAuth(); // necessario per l'autorizzazione sui canali privati

      let settled = false;
      const ch = supabase
        .channel(`campaign:${activeCampaignId}`, { config: { private: true } })
        .on('broadcast', { event: 'INSERT' }, handleBroadcast)
        .on('broadcast', { event: 'UPDATE' }, handleBroadcast)
        .on('broadcast', { event: 'DELETE' }, handleBroadcast)
        .subscribe((status) => {
          if (!isActive) return;

          if (status === 'SUBSCRIBED') {
            retryCount = 0;
            settled = true;
            return;
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            if (settled) return;
            settled = true;
            if (currentChannel === ch) currentChannel = null;
            (async () => {
              try {
                await supabase.removeChannel(ch);
              } catch { /* ignora */ }
              if (retryCount >= MAX_RETRIES) return;
              retryCount += 1;
              retryTimeout = setTimeout(() => { if (isActive) subscribeChannel(); }, 1000);
            })();
          }
        });

      currentChannel = ch;
    };

    subscribeChannel();

    return () => {
      isActive = false;
      if (retryTimeout) clearTimeout(retryTimeout);
      if (currentChannel) {
        try { supabase.removeChannel(currentChannel); } catch { /* ignora */ }
      }
    };
  }, [activeCampaignId]);

  // Salva su Supabase quando i personaggi cambiano
  useEffect(() => {
    if (isLoading) return; // Non salvare durante il caricamento iniziale

    // Salva anche su localStorage come backup
    try {
      window.localStorage.setItem(PLAYER_CHARACTERS_STORAGE_KEY, JSON.stringify(characters));
    } catch (error) {
      console.error('Errore backup localStorage:', error);
    }
  }, [characters, isLoading]);

  useEffect(() => {
    if (navigationTarget?.tabId !== 'players') return;
    if (navigationTarget.entityType !== 'character') return;
    if (!navigationTarget.entityId) return;
    const charToOpen = characters.find(c => c.id === navigationTarget.entityId);
    if (!charToOpen) return;
    setExpandedCharacters(prev => new Set(prev).add(charToOpen.id));
    // scorre la pagina fino alla card, se il ref esiste
    const el = document.getElementById(`character-card-${charToOpen.id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [navigationTarget, characters]);

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedCharacters);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
      if (!activeTab[id]) {
        setActiveTab(prev => ({ ...prev, [id]: 'stats' }));
      }
    }
    setExpandedCharacters(newExpanded);
  };

  const addCharacter = async (character: PlayerCharacter) => {
    setCharacters(prev => [...prev, character]);
    // Salva su Supabase
    try {
      await saveCharacterToSupabase(activeCampaignId, character, user?.id ?? '');
    } catch (error) {
      console.error('Errore salvataggio personaggio su Supabase:', error);
    }
  };

  const startEditingCharacter = (character: PlayerCharacter) => {
  setEditingCharacter(character);
  setShowWizard(true);
  };

  const saveCharacter = (character: PlayerCharacter) => {
  if (editingCharacter) {
    const characterWithOwner = {
      ...character,
      ownerProfileId: (editingCharacter as any).ownerProfileId,
    } as PlayerCharacter;
    updateCharacter(editingCharacter.id, characterWithOwner);
  } else {
    addCharacter(character);
  }

  setShowWizard(false);
  setEditingCharacter(null);
};

  const updateCharacter = (id: string, updatedChar: PlayerCharacter) => {
    setCharacters(prev => prev.map(char => char.id === id ? updatedChar : char));
    persistCharacter(id, updatedChar);
  };

  const updateAudacia = (id: string, delta: number) => {
  setCharacters(prev =>
    prev.map(char => {
      if (char.id !== id) {
        return char;
      }

      const current = typeof char.audacia === 'number' ? char.audacia : 1;
      const next = Math.min(6, Math.max(0, current + delta));

      const updated = {
        ...char,
        audacia: next
      };

      persistCharacter(id, updated);

      return updated;
    })
  );
};

const updateProdigi = (id: string, delta: number) => {
  setCharacters(prev =>
    prev.map(char => {
      if (char.id !== id) {
        return char;
      }

      const current = typeof char.prodigi === 'number' ? char.prodigi : 1;
      const next = Math.min(2, Math.max(0, current + delta));

      const updated = {
        ...char,
        prodigi: next
      };

      persistCharacter(id, updated);

      return updated;
    })
  );
};

  const deleteCharacter = (id: string) => {
  if (!confirm('Sei sicuro di voler eliminare questo personaggio?')) return;

  const target = characters.find(c => c.id === id);
  const isMineDelete = (target as any)?.ownerProfileId === user?.id;

  setCharacters(prev =>
    prev
      .filter(char => char.id !== id)
      .map(char =>
        char.linkedCharacterId === id
          ? { ...char, linkedCharacterId: undefined, legame: 'Da definire in seguito' }
          : char
      )
  );

  const newExpanded = new Set(expandedCharacters);
  newExpanded.delete(id);
  setExpandedCharacters(newExpanded);

  if (isMineDelete || !(target as any)?.ownerProfileId) {
    deleteCharacterFromSupabase(id).catch(error => {
      console.error('Errore eliminazione personaggio da Supabase:', error);
    });
  } else {
    deleteCharacterAsGm(activeCampaignId, id, SERVER_BASE, session?.access_token ?? '').catch(error => {
      console.error('Errore eliminazione personaggio da Supabase (GM):', error);
    });
  }
};

  const exportCharacters = () => {
  try {
    const payload = {
      exportedAt: new Date().toISOString(),
      version: 1,
      characters
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json'
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'high-school-cthulhu-personaggi.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('Esportazione completata.');
  } catch (error) {
    console.error('Errore durante l’esportazione dei personaggi:', error);
    showToast('Errore durante l’esportazione dei personaggi.');
  }
};

const importCharacters = async (event: React.ChangeEvent<HTMLInputElement>) => {
  const file = event.target.files?.[0];

  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);

    const importedCharacters = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.characters)
        ? parsed.characters
        : null;

    if (!importedCharacters) {
      throw new Error('Formato file non valido');
    }

    setPendingImportCharacters(importedCharacters);
    setShowImportChoiceModal(true);
  } catch (error) {
    console.error('Errore durante l’importazione dei personaggi:', error);
    showToast('File JSON non valido o danneggiato.');
  } finally {
    if (event.target) {
      event.target.value = '';
    }
  }
};

  const confirmReplaceImport = () => {
  if (!pendingImportCharacters) {
    return;
  }

  setCharacters(pendingImportCharacters);
  setExpandedCharacters(new Set());
  setActiveTab({});
  setPendingImportCharacters(null);
  setShowImportChoiceModal(false);
  showToast('Personaggi importati con successo.');
};

const confirmMergeImport = () => {
  if (!pendingImportCharacters) {
    return;
  }

  setCharacters(prev => {
    const existingIds = new Set(prev.map(char => char.id));

    const normalizedImported = pendingImportCharacters.map((char: PlayerCharacter) => {
      if (!existingIds.has(char.id)) {
        return char;
      }

      return {
        ...char,
        id: generateUUID()
      };
    });

    return [...prev, ...normalizedImported];
  });

  setPendingImportCharacters(null);
  setShowImportChoiceModal(false);
  showToast('Personaggi aggiunti con successo.');
};

const closeImportChoiceModal = () => {
  setPendingImportCharacters(null);
  setShowImportChoiceModal(false);
};

  const getLinkedCharacterName = (linkedCharacterId?: string) => {
  if (!linkedCharacterId) {
    return null;
  }

  const linkedCharacter = characters.find(char => char.id === linkedCharacterId);
  return linkedCharacter?.name ?? null;
};

  const getHighestTurbaLabel = (turbe: PlayerCharacter['turbe']) => {
  if (!turbe || turbe.length === 0) {
    return null;
  }

  if (turbe.some(turba => turba.level === 'Grave')) {
    return 'Turba grave';
  }

  if (turbe.some(turba => turba.level === 'Moderata')) {
    return 'Turba moderata';
  }

  if (turbe.some(turba => turba.level === 'Lieve')) {
    return 'Turba lieve';
  }

  return null;
};

const showToast = (message: string) => {
  setToastMessage(message);
  window.setTimeout(() => {
    setToastMessage(null);
  }, 2600);
};

  const visibleCharacters = characters;
  const isOwner = activeCampaign?.ownerId === user?.id;

  return (
  <div className="min-h-screen bg-[var(--dash-bg)] text-[var(--dash-text-strong)]">
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between border-b border-[var(--dash-border-soft)] pb-4">
        <div>
          <h2 className="flex items-center text-3xl font-semibold tracking-[0.08em] uppercase text-[var(--dash-text-strong)]">
            Personaggi Giocanti
            <RulesetBadge className="ml-2" />
          </h2>
          <p className="mt-1 text-sm text-[var(--dash-text)]">
            Gestione del party e stato attuale dei personaggi
          </p>
        </div>

       <div className="flex items-center gap-3">
  <input
    ref={importInputRef}
    type="file"
    accept="application/json"
    onChange={importCharacters}
    className="hidden"
  />

  <div className="group relative">
    <button
  onClick={exportCharacters}
  className="flex cursor-help items-center gap-2 rounded-md border border-[var(--dash-accent)] bg-[var(--dash-input)] px-4 py-2 text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-input)]"
>
  Esporta PG
</button>

    <div className="pointer-events-none absolute bottom-full right-0 z-30 mb-2 hidden whitespace-nowrap rounded-md border border-[var(--dash-accent)] bg-[var(--dash-panel)] px-3 py-2 text-xs text-[var(--dash-text-strong)] shadow-xl group-hover:block">
      Salva tutti i personaggi in un file JSON
      <div className="absolute right-3 top-full h-2 w-2 rotate-45 border-r border-b border-[var(--dash-accent)] bg-[var(--dash-panel)]" />
    </div>
  </div>

  <div className="group relative">
    <button
  onClick={() => importInputRef.current?.click()}
  className="flex cursor-help items-center gap-2 rounded-md border border-[var(--dash-accent)] bg-[var(--dash-input)] px-4 py-2 text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-input)]"
>
  Importa PG
</button>

    <div className="pointer-events-none absolute bottom-full right-0 z-30 mb-2 hidden whitespace-nowrap rounded-md border border-[var(--dash-accent)] bg-[var(--dash-panel)] px-3 py-2 text-xs text-[var(--dash-text-strong)] shadow-xl group-hover:block">
      Carica personaggi da un file JSON
      <div className="absolute right-3 top-full h-2 w-2 rotate-45 border-r border-b border-[var(--dash-accent)] bg-[var(--dash-panel)]" />
    </div>
  </div>

  <div className="group relative">
    <button
      onClick={() => {
        setEditingCharacter(null);
        setShowWizard(true);
      }}
      className="flex cursor-help items-center gap-2 rounded-md border border-[var(--dash-accent)] bg-[var(--dash-input)] px-4 py-2 text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-input)]"
    >
      <UserPlus className="h-5 w-5" />
      Aggiungi PG
    </button>

    <div className="pointer-events-none absolute bottom-full right-0 z-30 mb-2 hidden whitespace-nowrap rounded-md border border-[var(--dash-accent)] bg-[var(--dash-panel)] px-3 py-2 text-xs text-[var(--dash-text-strong)] shadow-xl group-hover:block">
      Crea un nuovo personaggio giocante
      <div className="absolute right-3 top-full h-2 w-2 rotate-45 border-r border-b border-[var(--dash-accent)] bg-[var(--dash-panel)]" />
    </div>
  </div>
</div>
      </div>

      {showWizard && (
  <CharacterCreationWizard
    onClose={() => {
      setShowWizard(false);
      setEditingCharacter(null);
    }}
    onAdd={saveCharacter}
    existingCharacters={characters
      .filter(c => c.id !== editingCharacter?.id)
      .map(c => ({ id: c.id, name: c.name }))}
    initialCharacter={editingCharacter}
  />
)}

     <div className="space-y-5">
  {isLoading ? (
    <div className="flex justify-center py-16">
      <Loader2 className="h-6 w-6 animate-spin text-[var(--dash-muted)]" />
    </div>
  ) : visibleCharacters.length === 0 ? (
    <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] px-8 py-12 text-center">
      <div className="mx-auto max-w-2xl">
        <div className="mb-3 text-xs uppercase tracking-[0.18em] text-[var(--dash-accent-2)]">
          Party vuoto
        </div>

        <h3 className="text-2xl font-semibold text-[var(--dash-text-strong)]">
          Nessun personaggio giocante creato
        </h3>

        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-[var(--dash-text)]">
          La compagnia non ha ancora preso forma. Crea il primo personaggio per iniziare a costruire il party,
          gestire legami, condizioni, equipaggiamento e tutta la campagna.
        </p>

        <div className="mt-6 flex justify-center">
          <button
            onClick={() => {
            setEditingCharacter(null);
            setShowWizard(true);
            }}
            className="flex items-center gap-2 rounded-md border border-[var(--dash-accent)] bg-[var(--dash-accent)] px-5 py-3 text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-accent-2)]"
          >
            <UserPlus className="h-5 w-5" />
            Crea il primo PG
          </button>
        </div>
      </div>
    </div>
  ) : (
    visibleCharacters.map(char => {
      const isExpanded = expandedCharacters.has(char.id);
      const currentTab = activeTab[char.id] || 'stats';
      const audaciaValue = typeof char.audacia === 'number' ? char.audacia : 1;
      const prodigiValue = typeof char.prodigi === 'number' ? char.prodigi : 1;
      const isMine = (char as any).ownerProfileId === user?.id;

      return (
        <div
          key={char.id}
          id={`character-card-${char.id}`}
          className="rounded-2xl border-2 border-[var(--dash-border-soft)] bg-[var(--dash-surface)] shadow-[0_10px_28px_rgba(0,0,0,0.35)]"
        >
          <div className={`relative z-10 bg-gradient-to-r from-[var(--dash-panel)] via-[var(--dash-surface-2)] to-[var(--dash-surface)] p-5 ${
  isExpanded
    ? 'rounded-t-2xl border-b border-[var(--dash-border-soft)]'
    : 'rounded-2xl'
}`}>
            <div className="relative h-48 w-full overflow-visible rounded-xl border border-[var(--dash-accent)] bg-[var(--dash-panel)]">
              <div className="absolute inset-[1px] overflow-hidden rounded-[11px]">
  {char.coverImageUrl ? (
    <img
      src={char.coverImageUrl}
      alt={`Sfondo di ${char.name}`}
      className="absolute inset-0 h-full w-full select-none object-cover"
      draggable={false}
    />
  ) : (
    <div className="absolute inset-0 bg-gradient-to-r from-[var(--dash-input)] via-[var(--dash-panel)] to-[var(--dash-bg)]" />
  )}

  <div className="absolute inset-0 bg-gradient-to-r from-[var(--dash-panel)]/52 via-[var(--dash-panel)]/12 to-[var(--dash-panel)]/22" />
  <div className="absolute inset-y-0 left-0 w-[18%] bg-gradient-to-r from-[var(--dash-panel)] to-transparent" />
  <div className="absolute inset-y-0 right-0 w-[18%] bg-gradient-to-l from-[var(--dash-panel)] to-transparent" />
  <div className="absolute inset-0 bg-gradient-to-t from-[var(--dash-panel)] via-[var(--dash-panel)]/70 to-transparent" />
</div>
   <div className="absolute left-5 top-5 z-10 flex items-center gap-4">
<div className="relative h-24 w-24 overflow-hidden rounded-full border-2 border-[var(--dash-accent)] bg-[var(--dash-input)] shadow-lg">
  {char.portraitCroppedImageUrl ? (
    <img
      src={char.portraitCroppedImageUrl}
      alt={`Ritratto di ${char.name}`}
      className="h-full w-full object-cover select-none"
      draggable={false}
    />
  ) : char.portraitImageUrl ? (
    <img
      src={char.portraitImageUrl}
      alt={`Ritratto di ${char.name}`}
      className="h-full w-full object-cover select-none"
      draggable={false}
    />
  ) : (
    <div className="flex h-full w-full items-center justify-center">
      <User className="h-9 w-9 text-[var(--dash-accent-2)]" />
    </div>
  )}
</div>

    <div>
  <h3 className="text-2xl font-semibold text-[var(--dash-text-strong)]">
    {char.name}
  </h3>

  {isD20 && char.d20Stats && (
    <D20StatSummary stats={char.d20Stats} />
  )}

  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--dash-text)]">
    <span>Giocatore: {(char as any).ownerDisplayName || char.player}</span>
    <span className="text-[var(--dash-muted)]">•</span>
    <span>{char.style}</span>
    <span className="text-[var(--dash-muted)]">•</span>
    <span>{char.viaggio}</span>
  </div>

  {getHighestTurbaLabel(char.turbe) && (
    <div className="mt-2 inline-flex rounded-full border border-[var(--dash-accent)] bg-[var(--dash-panel)] px-3 py-1 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
      {getHighestTurbaLabel(char.turbe)}
    </div>
  )}

  {char.notes && (
    <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--dash-text)]">
      {char.notes}
    </p>
  )}
</div>
  </div>

  <div className="absolute right-5 top-5 z-10 flex items-center gap-2 self-start">
    <div className="group relative">
      <button
        onClick={() => toggleExpanded(char.id)}
        className="flex cursor-help items-center gap-2 rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-panel)]/95 px-4 py-2 text-sm text-[var(--dash-text)] transition-colors hover:bg-[var(--dash-surface-2)]"
      >
        {isExpanded ? (
          <>
            <ChevronUp className="h-4 w-4" />
            Chiudi scheda
          </>
        ) : (
          <>
            <ChevronDown className="h-4 w-4" />
            Apri scheda
          </>
        )}
      </button>

      <div className="pointer-events-none absolute bottom-full right-0 z-50 mb-2 hidden whitespace-nowrap rounded-md border border-[var(--dash-accent)] bg-[var(--dash-panel)] px-3 py-2 text-xs text-[var(--dash-text-strong)] shadow-xl group-hover:block">
        {isExpanded ? 'Nasconde i dettagli del personaggio' : 'Mostra la scheda completa del personaggio'}
        <div className="absolute right-3 top-full h-2 w-2 rotate-45 border-r border-b border-[var(--dash-accent)] bg-[var(--dash-panel)]" />
      </div>
    </div>

    {(isMine || isOwner) && (
    <div className="group relative">
      <button
        onClick={() => startEditingCharacter(char)}
        className="flex h-9 w-9 cursor-help items-center justify-center rounded-md border border-[var(--dash-accent)] bg-[var(--dash-accent)]/95 text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-accent-2)]"
      >
        ✎
      </button>

      <div className="pointer-events-none absolute bottom-full right-0 z-50 mb-2 hidden whitespace-nowrap rounded-md border border-[var(--dash-accent)] bg-[var(--dash-panel)] px-3 py-2 text-xs text-[var(--dash-text-strong)] shadow-xl group-hover:block">
        Modifica personaggio
        <div className="absolute right-3 top-full h-2 w-2 rotate-45 border-r border-b border-[var(--dash-accent)] bg-[var(--dash-panel)]" />
      </div>
    </div>
    )}

    {(isMine || isOwner) && (
    <div className="group relative">
      <button
        onClick={() => deleteCharacter(char.id)}
        className="flex h-9 w-9 cursor-help items-center justify-center rounded-md border border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)]/95 text-[var(--dash-danger-text)] transition-colors hover:bg-[var(--dash-danger-hover)]"
      >
        <X className="h-5 w-5" />
      </button>

      <div className="pointer-events-none absolute bottom-full right-0 z-50 mb-2 hidden whitespace-nowrap rounded-md border border-[var(--dash-danger-hover)] bg-[var(--dash-danger-bg)] px-3 py-2 text-xs text-[var(--dash-danger-text)] shadow-xl group-hover:block">
        Elimina personaggio
        <div className="absolute right-3 top-full h-2 w-2 rotate-45 border-r border-b border-[var(--dash-danger-hover)] bg-[var(--dash-danger-bg)]" />
      </div>
    </div>
    )}
  </div>

  
</div>

            {isHSC && <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-6">
              {Object.entries(char.ambiti).map(([ambito, value]) => (
                <div
                  key={ambito}
                  className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-4 py-3"
                >
                  <div className="text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
                    {ambito}
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-[var(--dash-text-strong)]">
                    {value}
                  </div>
                </div>
              ))}

              <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-4 py-3">
                <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
                  <Heart className="h-3.5 w-3.5 text-red-500" />
                  Freschezza
                </div>
                <div className="text-lg font-semibold text-[var(--dash-text-strong)]">
                  {char.freschezza}/{char.maxFreschezza}
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--dash-border-soft)]">
                  <div
                    className="h-full rounded-full bg-red-700"
                    style={{ width: `${(char.freschezza / char.maxFreschezza) * 100}%` }}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-4 py-3">
                <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
                  <Brain className="h-3.5 w-3.5 text-purple-400" />
                  Follia
                </div>
                <div className="text-lg font-semibold text-[var(--dash-text-strong)]">
                  {char.follia}/{char.maxFollia}
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--dash-border-soft)]">
                  <div
                    className="h-full rounded-full bg-purple-700"
                    style={{ width: `${(char.follia / char.maxFollia) * 100}%` }}
                  />
                </div>
              </div>
            </div>}
          </div>

          {isExpanded && (
            <div className="relative z-10 p-5">
              <div className="mb-5 flex flex-wrap gap-2 border-b border-[var(--dash-border-soft)] pb-3">
                {[
                  { id: 'stats' as const, label: 'Stato' },
                  { id: 'conditions' as const, label: 'Condizioni & Follia' },
                  { id: 'equipment' as const, label: 'Equipaggiamento' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(prev => ({ ...prev, [char.id]: tab.id }))}
                    className={`rounded-md px-4 py-2 text-sm transition-colors ${
                      currentTab === tab.id
                        ? 'bg-[var(--dash-accent)] text-[var(--dash-text-strong)] border border-[var(--dash-accent)]'
                        : 'bg-transparent text-[var(--dash-text)] border border-transparent hover:bg-[var(--dash-panel)] hover:text-[var(--dash-text-strong)]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="space-y-4">
               {currentTab === 'stats' && (
  <>
  {isHSC && (
  <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
    <div className="space-y-4">
      <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
        <FrischezzaTracker
          current={char.freschezza}
          max={char.maxFreschezza}
          crucialBoxes={char.caselleFrischezzaCruciali}
          onUpdate={(value) => updateCharacter(char.id, { ...char, freschezza: value })}
        />
      </div>

      <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-4">
        <div className="mb-3 text-sm uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
          Relazioni e riferimenti
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
            <div className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
              Legame
            </div>

            <div className="text-base font-medium text-[var(--dash-text-strong)]">
              {getLinkedCharacterName(char.linkedCharacterId) ?? (char.legame || 'Nessuno')}
            </div>

            <div className="mt-2 min-h-[2.5rem] text-xs leading-relaxed text-[var(--dash-text)]">
              {char.legameDescription || 'Nessuna descrizione aggiuntiva.'}
            </div>
          </div>

          <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
            <div className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
              Tutore
            </div>

            <div className="text-base font-medium text-[var(--dash-text-strong)]">
              {char.tutore || 'Nessuno'}
            </div>

            <div className="mt-2 min-h-[2.5rem] text-xs leading-relaxed text-[var(--dash-text)]">
              Figura adulta o riferimento speciale del personaggio.
            </div>
          </div>
        </div>
      </div>
    </div>

    <div className="space-y-4">
      <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-4">
        <div className="mb-3 text-sm uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
          Risorse del personaggio
        </div>

        <div className="grid grid-cols-1 gap-4">
          <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
            <div className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
              Prodigi
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xl font-semibold text-[var(--dash-text-strong)]">
                  {prodigiValue}
                  <span className="ml-2 text-sm font-normal text-[var(--dash-accent-2)]">/ 2</span>
                </div>
                <div className="mt-1 text-xs text-[var(--dash-muted)]">
                  Attuale / Massimo
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => updateProdigi(char.id, -1)}
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-surface-2)]"
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={() => updateProdigi(char.id, 1)}
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--dash-accent)] bg-[var(--dash-accent)] text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-accent-2)]"
                >
                  +
                </button>
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              {[1, 2].map(slot => (
                <div
                  key={slot}
                  className={`h-2 flex-1 rounded-full ${
                    slot <= prodigiValue ? 'bg-[var(--dash-accent-2)]' : 'bg-[var(--dash-border-soft)]'
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
            <div className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
              Audacia
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xl font-semibold text-[var(--dash-text-strong)]">
                  {audaciaValue}
                  <span className="ml-2 text-sm font-normal text-[var(--dash-accent-2)]">/ 6</span>
                </div>
                <div className="mt-1 text-xs text-[var(--dash-muted)]">
                  Attuale / Massimo
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => updateAudacia(char.id, -1)}
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-surface-2)]"
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={() => updateAudacia(char.id, 1)}
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--dash-accent)] bg-[var(--dash-accent)] text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-accent-2)]"
                >
                  +
                </button>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-6 gap-2">
              {[1, 2, 3, 4, 5, 6].map(slot => (
                <div
                  key={slot}
                  className={`h-2 rounded-full ${
                    slot <= audaciaValue ? 'bg-[var(--dash-accent-2)]' : 'bg-[var(--dash-border-soft)]'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-4">
        <div className="mb-3 flex items-center gap-2 text-sm uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
          <Shield className="h-4 w-4" />
          Tratti
        </div>

        {char.tratti.length > 0 ? (
          <div className="space-y-3">
            {char.tratti.map((trait, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3"
              >
                <div className="font-medium text-[var(--dash-text-strong)]">{trait.name}</div>
                {trait.description && (
                  <div className="mt-1 text-sm text-[var(--dash-text)]">
                    {trait.description}
                  </div>
                )}
                {trait.benefit && (
                  <div className="mt-2 text-xs text-[var(--dash-accent-2)]">
                    {trait.benefit}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-[var(--dash-muted)]">Nessun tratto.</div>
        )}
      </div>
    </div>
  </div>
  )}
  {isD20 && (
    <D20StatBlock
      stats={char.d20Stats ?? DEFAULT_D20_STATS}
      isPlayerCharacter={true}
      isEditing={true}
      onChange={(patch) => updateCharacter(char.id, {
        ...char,
        d20Stats: { ...(char.d20Stats ?? DEFAULT_D20_STATS), ...patch }
      })}
    />
  )}
  </>
)}

                {currentTab === 'conditions' && (
  <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.95fr_1.05fr]">
    <div>
      <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-4">
        <div className="mb-3 text-sm uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
          Condizioni attive
        </div>

        <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
          <ConditionsPanel
            conditions={char.conditions}
            onUpdate={(conditions) => updateCharacter(char.id, { ...char, conditions })}
          />
        </div>
      </div>
    </div>

    <div className="space-y-4">
      <div className="rounded-2xl border border-[var(--dash-accent)] bg-[linear-gradient(180deg,var(--dash-panel)_0%,var(--dash-panel)_100%)] p-4">
        <div className="mb-3 flex items-center gap-2 text-sm uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
          <Brain className="h-4 w-4 text-purple-400" />
          Spirale della Follia
        </div>

        
          <FoliaSpiral
            current={char.follia}
            max={char.maxFollia}
            onUpdate={(value) => updateCharacter(char.id, { ...char, follia: value })}
          />
        
      </div>

      <div className="rounded-2xl border border-[var(--dash-accent)] bg-[linear-gradient(180deg,var(--dash-panel)_0%,var(--dash-panel)_100%)] p-4">
        <div className="mb-3 text-sm uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
          Turbe mentali
        </div>

        
          <TurbePanel
            turbe={char.turbe}
            onUpdate={(turbe) => updateCharacter(char.id, { ...char, turbe })}
          />
        
      </div>
    </div>
  </div>
)}

                {currentTab === 'equipment' && (
  <div className="space-y-4">
    <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-4">
      <div className="mb-3 text-sm uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
        Inventario del personaggio
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
          <div className="text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
            Totale oggetti
          </div>
          <div className="mt-2 text-2xl font-semibold text-[var(--dash-text-strong)]">
            {char.equipment.length}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
          <div className="text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
            Tascabili
          </div>
          <div className="mt-2 text-2xl font-semibold text-[var(--dash-text-strong)]">
            {char.equipment.filter(item => item.type === 'tascabile').length}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
          <div className="text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
            Trasportabili
          </div>
          <div className="mt-2 text-2xl font-semibold text-[var(--dash-text-strong)]">
            {char.equipment.filter(item => item.type === 'trasportabile' || item.type === 'arma').length}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
          <div className="text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
            Risorse
          </div>
          <div className="mt-2 text-2xl font-semibold text-[var(--dash-text-strong)]">
            {char.equipment.filter(item => item.type === 'risorsa').length}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
        <LegacyEquipmentPanel
          equipment={char.equipment}
          onUpdate={(equipment) => updateCharacter(char.id, { ...char, equipment })}
        />
      </div>
    </div>
  </div>
)}
              </div>
            </div>
          )}
        </div>
      );
    })
  )}
</div>
    </div>

    {showImportChoiceModal && (
  <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
    <div className="w-full max-w-md rounded-2xl border border-[var(--dash-accent)] bg-[var(--dash-surface)] shadow-2xl">
      <div className="border-b border-[var(--dash-border-soft)] px-6 py-4">
        <h3 className="text-lg font-semibold text-[var(--dash-text-strong)]">
          Importa personaggi
        </h3>
        <p className="mt-1 text-sm text-[var(--dash-text)]">
          Scegli se sostituire i personaggi attuali oppure aggiungere quelli importati.
        </p>
      </div>

      <div className="px-6 py-5 space-y-3">
        <button
          onClick={confirmReplaceImport}
          className="w-full rounded-md border border-[var(--dash-accent)] bg-[var(--dash-accent)] px-4 py-3 text-sm text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-accent-2)]"
        >
          Sostituisci personaggi attuali
        </button>

        <button
          onClick={confirmMergeImport}
          className="w-full rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-4 py-3 text-sm text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-surface-2)]"
        >
          Aggiungi ai personaggi esistenti
        </button>

        <button
          onClick={closeImportChoiceModal}
          className="w-full rounded-md border border-[var(--dash-border-soft)] bg-transparent px-4 py-3 text-sm text-[var(--dash-text)] transition-colors hover:bg-[var(--dash-surface)] hover:text-[var(--dash-text-strong)]"
        >
          Annulla
        </button>
      </div>
    </div>
  </div>
)}

{toastMessage && (
  <div className="fixed bottom-6 right-6 z-[80] max-w-sm rounded-xl border border-[var(--dash-accent)] bg-[var(--dash-panel)] px-4 py-3 text-sm text-[var(--dash-text-strong)] shadow-2xl">
    {toastMessage}
  </div>
)}
    
  </div>
);
}