import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { User, Brain, ChevronDown, ChevronRight, Loader2, Skull, Ghost, Heart, Star } from 'lucide-react';
import { Copy, UserMinus, UserX, Eye, EyeOff, Search, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { PALETTE_COLORS, DEFAULT_PALETTE_COLORS, type PaletteId } from '../ui/paletteColors';
import { projectId } from '/utils/supabase/info';
import { FrischezzaTracker } from '../FrischezzaTracker';
import { FoliaSpiral } from '../FoliaSpiral';
import { ConditionsPanel } from '../ConditionsPanel';
import { TurbePanel } from '../TurbePanel';
import { EquipmentPanel as LegacyEquipmentPanel } from '../EquipmentPanel';
import type { Character } from '../../../types/character';
import { loadCharacters, loadCharactersViaServer, saveCharacter as saveCharacterToSupabase, saveCharacterAsGm, mapRowToCharacter } from '../../../services/supabase/charactersService';
import {
  loadNPCs, loadMonsters,
  saveNPC, saveMonster,
  deleteNPC, deleteMonster,
  unassignNPCFromCampaign, unassignMonsterFromCampaign,
  copyNPCToCampaign, copyMonsterToCampaign,
  toCamelCase,
} from '../../../services/supabase/entitiesService';
import { useAuth, supabase } from '../../auth/AuthContext';
import { useCampaign } from '../../campaigns/CampaignContext';
import { useRuleset } from '../../campaigns/RulesetContext';
import { useEntityTabs } from './shared/useEntityTabs';
import { EntityTabBar } from './shared/EntityTabBar';
import { EntityKebabMenu } from './shared/EntityKebabMenu';

interface PlayerCharacter extends Character {
  player: string;
  notes: string;
}

type EntityKind = 'pg' | 'png' | 'mostro';
interface ListEntry {
  kind: EntityKind;
  id: string;
  name: string;
  subtitle: string;
  portraitUrl?: string;
  ownerProfileId?: string | null;
  hiddenFromPlayers?: boolean;
}

const SERVER_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-771c5bfd`;

function getCurrentPaletteColors() {
  const el = document.querySelector('[data-dashboard-palette]');
  const palette = el?.getAttribute('data-dashboard-palette') as PaletteId | null;
  return palette && PALETTE_COLORS[palette] ? PALETTE_COLORS[palette] : DEFAULT_PALETTE_COLORS;
}

function SectionHeader({ title, count, isOpen, onToggle }: { title: string; count: number; isOpen: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between px-4 py-2 text-left"
    >
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
        {title} <span className="text-[var(--dash-muted)]">({count})</span>
      </span>
      {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-[var(--dash-muted)]" /> : <ChevronRight className="h-3.5 w-3.5 text-[var(--dash-muted)]" />}
    </button>
  );
}

const ABILITA_PER_AMBITO: Record<string, string[]> = {
  Fisico: ['Muscoli', 'Sport', 'Acrobatica', 'Resistenza', 'Freddezza'],
  Scuola: ['Cultura', 'Tecnologia', 'Studio', 'Pronto Soccorso', 'Scienze'],
  Carisma: ['Esibirsi', 'Parlantina', 'Fascino', 'Intuito', 'Leadership'],
  Strada: ['Furtività', 'Mira', 'Sopravvivenza', 'Crimine', 'Allerta'],
};

const BASE_TABS = [
  { id: 'summary', label: 'Riepilogo' },
  { id: 'conditions', label: 'Condizioni & Follia' },
  { id: 'equipment', label: 'Equipaggiamento' },
] as const;

// Per ora PNG e Mostri hanno solo la tab "Riepilogo": altre eventuali tab
// base verranno aggiunte in seguito.
const NPC_MONSTER_BASE_TABS = [
  { id: 'summary', label: 'Riepilogo' },
] as const;

function AbilitaDots({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled: boolean }) {
  const dots = [1, 2, 3, 4];
  return (
    <div className="flex gap-1">
      {dots.map((dot) => {
        const filled = dot <= value;
        return (
          <button
            key={dot}
            type="button"
            disabled={disabled}
            onClick={() => onChange(filled && dot === value ? dot - 1 : dot)}
            className={`h-3.5 w-3.5 rounded-full border transition-all ${
              filled ? 'border-[var(--dash-accent)] bg-[var(--dash-accent)]' : 'border-[var(--dash-border-soft)] bg-transparent'
            } ${disabled ? '' : 'hover:scale-125'}`}
          />
        );
      })}
    </div>
  );
}

function StarRating({ value, max, onChange, disabled }: { value: number; max: number; onChange: (v: number) => void; disabled: boolean }) {
  const stars = Array.from({ length: max }, (_, i) => i + 1);
  return (
    <div className="flex items-center justify-between">
      <div className="flex gap-1">
        {stars.map((star) => {
          const filled = star <= value;
          return (
            <button
              key={star}
              type="button"
              disabled={disabled}
              onClick={() => onChange(filled ? star - 1 : star)}
              className={disabled ? '' : 'transition-transform hover:scale-110'}
            >
              <Star
                className="h-5 w-5"
                fill={filled ? '#eab308' : 'none'}
                color={filled ? '#eab308' : 'var(--dash-border-soft)'}
                strokeWidth={filled ? 1 : 1.5}
              />
            </button>
          );
        })}
      </div>
      <span className="text-xs text-yellow-500/70">{value} / {max}</span>
    </div>
  );
}

const TOKEN_SIZE = 64;

function DraggablePortrait({
  url,
  fallbackIcon,
  size = 56,
  draggable,
  onDragStart,
  hiddenFromPlayers = false,
  hiddenBadgePosition = 'top-right',
}: {
  url?: string;
  fallbackIcon: React.ReactNode;
  size?: number;
  draggable: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  hiddenFromPlayers?: boolean;
  hiddenBadgePosition?: 'center' | 'top-right';
}) {
  const dragGhostRef = useRef<HTMLImageElement | null>(null);

  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        if (url && dragGhostRef.current) {
          e.dataTransfer.setDragImage(dragGhostRef.current, TOKEN_SIZE / 2, TOKEN_SIZE / 2);
        }
        onDragStart?.(e);
      }}
      className={`group relative shrink-0 overflow-hidden rounded-md border-2 border-[var(--dash-accent)] bg-[var(--dash-input)] ${
        draggable ? 'cursor-grab active:cursor-grabbing' : ''
      }`}
      style={{ width: size, height: size }}
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" draggable={false} />
      ) : (
        <div className="flex h-full w-full items-center justify-center">{fallbackIcon}</div>
      )}
      {draggable && (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md opacity-0 transition-opacity duration-150 group-hover:opacity-100"
          style={{ backgroundColor: 'rgba(0,0,0,0.35)' }}
        >
          <div className="overflow-hidden rounded-full border-2 border-[var(--dash-accent)]" style={{ width: TOKEN_SIZE, height: TOKEN_SIZE }}>
            {url ? (
              <img src={url} alt="" className="h-full w-full object-cover" draggable={false} />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[var(--dash-input)]">{fallbackIcon}</div>
            )}
          </div>
        </div>
      )}
      {hiddenFromPlayers && (
        <div
          className={`pointer-events-none absolute flex items-center justify-center rounded-full bg-black/70 ${
            hiddenBadgePosition === 'center' ? 'inset-0 m-auto h-5 w-5' : 'right-0.5 top-0.5 h-5 w-5'
          }`}
        >
          <EyeOff className="h-3 w-3 text-white" />
        </div>
      )}
      {url && draggable && createPortal(
        <img
          ref={dragGhostRef}
          src={url}
          alt=""
          draggable={false}
          style={{
            position: 'fixed',
            left: -9999,
            top: -9999,
            width: TOKEN_SIZE,
            height: TOKEN_SIZE,
            borderRadius: '9999px',
            objectFit: 'cover',
            pointerEvents: 'none',
          }}
        />,
        document.body
      )}
    </div>
  );
}

export function SessionCharactersPanel() {
  const { user, session } = useAuth();
  const { activeCampaignId, activeCampaign } = useCampaign();
  const { campaigns: ownedCampaigns, joinedCampaigns } = useCampaign();
  const { isHSC } = useRuleset();

  const [characters, setCharacters] = useState<PlayerCharacter[]>([]);
  const [npcs, setNpcs] = useState<any[]>([]);
  const [monsters, setMonsters] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState<{ kind: EntityKind; id: string } | null>(null);
  const [expandedAmbito, setExpandedAmbito] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState({ pg: true, png: true, mostro: true });
  const [confirmRemoveChar, setConfirmRemoveChar] = useState(false);
  const [confirmRemovePlayer, setConfirmRemovePlayer] = useState(false);
  const [confirmUnassignEntity, setConfirmUnassignEntity] = useState(false);
  const [confirmDeleteEntity, setConfirmDeleteEntity] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [copyTargetId, setCopyTargetId] = useState<string | null>(null);
  const [isCopying, setIsCopying] = useState(false);
  const [menuColors] = useState(() => getCurrentPaletteColors());

  const loadSeqRef = useRef(0);
  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const recentLocalEditRef = useRef<Record<string, number>>({});
  const isOwner = activeCampaign?.ownerId === user?.id;

  const loadData = useCallback(async () => {
    const mySeq = ++loadSeqRef.current;
    try {
      const [loadedChars, loadedNpcs, loadedMonsters] = await Promise.all([
        session?.access_token
          ? loadCharactersViaServer(activeCampaignId, SERVER_BASE, session.access_token)
          : loadCharacters(activeCampaignId),
        loadNPCs(activeCampaignId),
        loadMonsters(activeCampaignId),
      ]);
      if (loadSeqRef.current !== mySeq) return;
      const sortByName = <T extends { name: string }>(arr: T[]) =>
        [...arr].sort((a, b) => a.name.localeCompare(b.name, 'it'));
      setCharacters(sortByName(loadedChars));
      setNpcs(sortByName(loadedNpcs));
      setMonsters(sortByName(loadedMonsters));
      if (!selected && loadedChars[0]) {
        setSelected({ kind: 'pg', id: loadedChars[0].id });
      }
    } catch (error) {
      console.error('Errore caricamento scheda unificata:', error);
    } finally {
      if (loadSeqRef.current === mySeq) setIsLoading(false);
    }
  }, [activeCampaignId, session?.access_token]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!activeCampaignId) return;
    let currentChannel: ReturnType<typeof supabase.channel> | null = null;

    const handleBroadcast = (msg: any) => {
      const data = msg?.payload ?? {};
      const table = data.table;

      if (data.operation === 'DELETE') {
        const deletedId = data.old_record?.id;
        if (!deletedId) return;
        if (table === 'characters') {
          setCharacters(prev => prev.filter(c => c.id !== deletedId));
        } else if (table === 'npcs') {
          setNpcs(prev => prev.filter(n => n.id !== deletedId));
        } else if (table === 'monsters') {
          setMonsters(prev => prev.filter(m => m.id !== deletedId));
        } else {
          console.warn('[handleBroadcast] tabella non gestita:', table);
        }
        return;
      }

      const row = data.record;
      if (!row) return;
      const lastLocalEdit = recentLocalEditRef.current[row.id];
      if (lastLocalEdit && Date.now() - lastLocalEdit < 1200) {
        return;
      }

      if (table === 'characters') {
        const mapped = mapRowToCharacter(row) as PlayerCharacter;
        setCharacters(prev => {
          const exists = prev.some(c => c.id === mapped.id);
          return exists
            ? prev.map(c => (c.id === mapped.id ? {
                ...mapped,
                ownerDisplayName: (c as any).ownerDisplayName,
                ownerAvatarUrl: (c as any).ownerAvatarUrl,
              } : c))
            : [...prev, mapped];
        });
      } else if (table === 'npcs') {
        const mapped = toCamelCase(row);
        setNpcs(prev => {
          const exists = prev.some(n => n.id === mapped.id);
          return exists ? prev.map(n => (n.id === mapped.id ? mapped : n)) : [...prev, mapped];
        });
      } else if (table === 'monsters') {
        const mapped = toCamelCase(row);
        setMonsters(prev => {
          const exists = prev.some(m => m.id === mapped.id);
          return exists ? prev.map(m => (m.id === mapped.id ? mapped : m)) : [...prev, mapped];
        });
      } else {
        console.warn('[handleBroadcast] tabella non gestita:', table);
      }
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
      if (currentChannel) { try { supabase.removeChannel(currentChannel); } catch {} }
    };
  }, [activeCampaignId]);

  const persistCharacter = useCallback((id: string, updatedChar: PlayerCharacter) => {
    recentLocalEditRef.current[id] = Date.now();
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

  const updateSelectedCharAmbito = (charId: string, ambito: string, delta: number) => {
    setCharacters(prev => prev.map(c => {
      if (c.id !== charId) return c;
      const currentValue = (c.ambiti as any)[ambito] ?? 0;
      const nextValue = Math.max(0, Math.min(2, currentValue + delta));
      const updated = { ...c, ambiti: { ...c.ambiti, [ambito]: nextValue } };
      persistCharacter(charId, updated);
      return updated;
    }));
  };

  const compatibleCampaigns = (isOwner ? ownedCampaigns : joinedCampaigns).filter(
    (c) => c.id !== activeCampaignId && c.ruleset === activeCampaign?.ruleset
  );

  const handleConfirmCopy = async () => {
    if (!selected || !copyTargetId) return;
    setIsCopying(true);
    setActionError(null);
    try {
      if (selected.kind === 'pg') {
        const accessToken = session?.access_token ?? '';
        const res = await fetch(`${SERVER_BASE}/characters/${selected.id}/copy-to-campaign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ campaignId: copyTargetId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Errore durante la copia');
      } else if (selected.kind === 'png') {
        await copyNPCToCampaign(selected.id, copyTargetId);
      } else if (selected.kind === 'mostro') {
        await copyMonsterToCampaign(selected.id, copyTargetId);
      }
      setShowCopyDialog(false);
      setCopyTargetId(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCopying(false);
    }
  };

  const handleRemoveCharacterFromCampaign = async () => {
    if (!selectedChar) return;
    setActionError(null);
    try {
      const accessToken = session?.access_token ?? '';
      const res = await fetch(`${SERVER_BASE}/characters/${selectedChar.id}/assign-campaign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ campaignId: null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Errore durante la rimozione');
      setConfirmRemoveChar(false);
      setSelected(null);
      await loadData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRemovePlayer = async () => {
    if (!selectedChar) return;
    const playerProfileId = (selectedChar as any).ownerProfileId;
    if (!playerProfileId) return;
    setActionError(null);
    try {
      const accessToken = session?.access_token ?? '';
      const res = await fetch(`${SERVER_BASE}/campaigns/${activeCampaignId}/remove-player`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ playerProfileId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Errore durante la rimozione del giocatore');
      setConfirmRemovePlayer(false);
      setSelected(null);
      await loadData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  // Scollega l'entità dalla campagna corrente senza eliminarla: resta nel
  // catalogo, riassegnabile in futuro da NPCManager/MonstersManager.
  const handleUnassignNpcOrMonster = async () => {
    setActionError(null);
    try {
      if (selected?.kind === 'png' && selectedNpc) {
        await unassignNPCFromCampaign(selectedNpc.id);
        setNpcs(prev => prev.filter(n => n.id !== selectedNpc.id));
        setSelected(null);
      } else if (selected?.kind === 'mostro' && selectedMonster) {
        await unassignMonsterFromCampaign(selectedMonster.id);
        setMonsters(prev => prev.filter(m => m.id !== selectedMonster.id));
        setSelected(null);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setConfirmUnassignEntity(false);
    }
  };

  // Eliminazione definitiva: cancella anche le tab personalizzate associate
  // (comprese quelle nascoste), come promesso nel ConfirmDialog.
  const handleDeleteNpcOrMonster = async () => {
    setActionError(null);
    try {
      const accessToken = session?.access_token ?? '';
      if (selected?.kind === 'png' && selectedNpc) {
        await Promise.all(npcTabs.customTabs.map(tab =>
          fetch(`${SERVER_BASE}/notes/${tab.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } })
        ));
        await deleteNPC(selectedNpc.id);
        setNpcs(prev => prev.filter(n => n.id !== selectedNpc.id));
        setSelected(null);
      } else if (selected?.kind === 'mostro' && selectedMonster) {
        await Promise.all(monsterTabs.customTabs.map(tab =>
          fetch(`${SERVER_BASE}/notes/${tab.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } })
        ));
        await deleteMonster(selectedMonster.id);
        setMonsters(prev => prev.filter(m => m.id !== selectedMonster.id));
        setSelected(null);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setConfirmDeleteEntity(false);
    }
  };

  const handleToggleVisibleToPlayers = async () => {
    if (selected?.kind === 'png' && selectedNpc) {
      const nextVisible = !selectedNpc.visibleToPlayers;
      const updated = { ...selectedNpc, visibleToPlayers: nextVisible };
      setNpcs(prev => prev.map(n => (n.id === selectedNpc.id ? updated : n)));
      try {
        await saveNPC(activeCampaignId, updated);
      } catch (err) {
        console.error('Errore aggiornamento visibilità PNG:', err);
        setNpcs(prev => prev.map(n => (n.id === selectedNpc.id ? selectedNpc : n)));
      }
    } else if (selected?.kind === 'mostro' && selectedMonster) {
      const nextVisible = !selectedMonster.visibleToPlayers;
      const updated = { ...selectedMonster, visibleToPlayers: nextVisible };
      setMonsters(prev => prev.map(m => (m.id === selectedMonster.id ? updated : m)));
      try {
        await saveMonster(activeCampaignId, updated);
      } catch (err) {
        console.error('Errore aggiornamento visibilità mostro:', err);
        setMonsters(prev => prev.map(m => (m.id === selectedMonster.id ? selectedMonster : m)));
      }
    }
  };

  const buildEntityMenuItems = (entity: any, deleteLabel: string) => [
    {
      key: 'copy',
      icon: <Copy className="h-4 w-4" />,
      label: "Copia in un'altra campagna",
      onClick: () => setShowCopyDialog(true),
    },
    {
      key: 'unassign',
      icon: <UserMinus className="h-4 w-4" />,
      label: 'Rimuovi dalla campagna',
      onClick: () => setConfirmUnassignEntity(true),
    },
    {
      key: 'delete',
      icon: <Trash2 className="h-4 w-4" />,
      label: deleteLabel,
      onClick: () => setConfirmDeleteEntity(true),
      danger: true,
    },
    {
      key: 'requestable',
      icon: <Search className="h-4 w-4" />,
      label: 'Richiedibile',
      onClick: () => {},
    },
    {
      key: 'toggle-visibility',
      icon: entity.visibleToPlayers ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />,
      label: entity.visibleToPlayers ? 'Rendi invisibile ai giocatori' : 'Rendi visibile ai giocatori',
      onClick: handleToggleVisibleToPlayers,
    },
  ];

  const entityMenuFooter = (entity: any) => (
    <>
      {entity.createdAt && (
        <>
          <div style={{ borderTop: `1px solid ${menuColors.border}` }} className="my-1" />
          <div className="px-3 py-1.5 text-[11px]" style={{ color: menuColors.text, opacity: 0.6 }}>
            Creato il {new Date(entity.createdAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </>
      )}
    </>
  );

  const toggleSection = (key: keyof typeof openSections) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const selectedChar = selected?.kind === 'pg' ? characters.find(c => c.id === selected.id) ?? null : null;
  const selectedNpc = selected?.kind === 'png' ? npcs.find(n => n.id === selected.id) ?? null : null;
  const selectedMonster = selected?.kind === 'mostro' ? monsters.find(m => m.id === selected.id) ?? null : null;
  const isMine = selectedChar ? (selectedChar as any).ownerProfileId === user?.id : false;
  const canEdit = isMine || isOwner;

  const charTabs = useEntityTabs({
    entityType: 'character',
    entityId: selectedChar?.id ?? null,
    campaignId: activeCampaignId,
    accessToken: session?.access_token,
    canEdit,
    baseTabs: BASE_TABS.map(t => ({ id: t.id, label: t.label })),
    savedTabOrder: (selectedChar as any)?.tabOrder,
    onPersistTabOrder: (order) => {
      if (!selectedChar) return;
      updateCharacter(selectedChar.id, { ...selectedChar, tabOrder: order } as any);
    },
  });

  const npcTabs = useEntityTabs({
    entityType: 'npc',
    entityId: selectedNpc?.id ?? null,
    campaignId: activeCampaignId,
    accessToken: session?.access_token,
    canEdit: isOwner,
    baseTabs: NPC_MONSTER_BASE_TABS.map(t => ({ id: t.id, label: t.label })),
    savedTabOrder: selectedNpc?.tabOrder,
    onPersistTabOrder: (order) => {
      if (!selectedNpc) return;
      setNpcs(prev => prev.map(n => (n.id === selectedNpc.id ? { ...n, tabOrder: order } : n)));
      saveNPC(activeCampaignId, { ...selectedNpc, tabOrder: order }).catch(err => console.error('Errore salvataggio ordine tab PNG:', err));
    },
  });

  const monsterTabs = useEntityTabs({
    entityType: 'monster',
    entityId: selectedMonster?.id ?? null,
    campaignId: activeCampaignId,
    accessToken: session?.access_token,
    canEdit: isOwner,
    baseTabs: NPC_MONSTER_BASE_TABS.map(t => ({ id: t.id, label: t.label })),
    savedTabOrder: selectedMonster?.tabOrder,
    onPersistTabOrder: (order) => {
      if (!selectedMonster) return;
      setMonsters(prev => prev.map(m => (m.id === selectedMonster.id ? { ...m, tabOrder: order } : m)));
      saveMonster(activeCampaignId, { ...selectedMonster, tabOrder: order }).catch(err => console.error('Errore salvataggio ordine tab mostro:', err));
    },
  });

  // I giocatori (non GM) non vedono affatto in lista i PNG/Mostri non resi visibili
  const visibleNpcs = isOwner ? npcs : npcs.filter(n => n.visibleToPlayers);
  const visibleMonsters = isOwner ? monsters : monsters.filter(m => m.visibleToPlayers);

  const canDragEntity = (kind: EntityKind, ownerProfileId?: string | null) => {
    if (isOwner) return true; // il GM può trascinare tutto: PG, PNG, Mostri
    if (kind === 'pg' && ownerProfileId === user?.id) return true; // il giocatore solo il proprio PG
    return false;
  };

  if (isLoading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[var(--dash-muted)]" /></div>;
  }

  const renderListItem = (entry: ListEntry) => (
    <button
      key={`${entry.kind}-${entry.id}`}
      type="button"
      onClick={() => { setSelected({ kind: entry.kind, id: entry.id }); charTabs.setCurrentTab('stats'); }}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
        selected?.kind === entry.kind && selected.id === entry.id ? 'bg-[var(--dash-surface-2)]' : 'hover:bg-[var(--dash-surface-2)]/50'
      }`}
    >
      <div
        draggable={canDragEntity(entry.kind, entry.ownerProfileId)}
        onDragStart={(e) => {
          e.dataTransfer.setData('application/x-hollowgate-entity', JSON.stringify({ kind: entry.kind, id: entry.id }));
        }}
        className={`relative h-9 w-9 shrink-0 overflow-hidden rounded-md bg-[var(--dash-input)] ${
          canDragEntity(entry.kind, entry.ownerProfileId) ? 'cursor-grab active:cursor-grabbing' : ''
        }`}
      >
        {entry.portraitUrl ? (
          <img src={entry.portraitUrl} alt={entry.name} className="h-full w-full object-cover" draggable={false} />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            {entry.kind === 'png' ? <Ghost className="h-4 w-4 text-[var(--dash-accent-2)]" /> : entry.kind === 'mostro' ? <Skull className="h-4 w-4 text-[var(--dash-accent-2)]" /> : <User className="h-4 w-4 text-[var(--dash-accent-2)]" />}
          </div>
        )}
        {entry.hiddenFromPlayers && (
          <div className="pointer-events-none absolute inset-0 m-auto flex h-4 w-4 items-center justify-center rounded-full bg-black/70">
            <EyeOff className="h-2.5 w-2.5 text-white" />
          </div>
        )}
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-[var(--dash-text-strong)]">{entry.name}</div>
        <div className="truncate text-xs text-[var(--dash-muted)]">{entry.subtitle}</div>
      </div>
    </button>
  );

  return (
    <>
    <div className="flex h-full select-none">
      <div className="w-64 shrink-0 overflow-y-auto border-r border-[var(--dash-border-soft)] py-3">
        <SectionHeader title="Personaggi" count={characters.length} isOpen={openSections.pg} onToggle={() => toggleSection('pg')} />
        {openSections.pg && (
          <div className="space-y-1 px-2 pb-2">
            {characters.map(c => renderListItem({
              kind: 'pg', id: c.id, name: c.name, subtitle: (c as any).ownerDisplayName || c.player || c.style,
              portraitUrl: c.portraitCroppedImageUrl || c.portraitImageUrl,
              ownerProfileId: (c as any).ownerProfileId,
            }))}
            {characters.length === 0 && <div className="px-3 py-2 text-xs text-[var(--dash-muted)]">Nessun personaggio.</div>}
          </div>
        )}

        <SectionHeader title="PNG" count={visibleNpcs.length} isOpen={openSections.png} onToggle={() => toggleSection('png')} />
        {openSections.png && (
          <div className="space-y-1 px-2 pb-2">
            {visibleNpcs.map(n => renderListItem({
              kind: 'png', id: n.id, name: n.name, subtitle: n.role || 'PNG',
              portraitUrl: n.portraitCroppedImageUrl || n.portraitImageUrl,
              hiddenFromPlayers: !n.visibleToPlayers,
            }))}
            {visibleNpcs.length === 0 && <div className="px-3 py-2 text-xs text-[var(--dash-muted)]">Nessun PNG.</div>}
          </div>
        )}

        <SectionHeader title="Mostri" count={visibleMonsters.length} isOpen={openSections.mostro} onToggle={() => toggleSection('mostro')} />
        {openSections.mostro && (
          <div className="space-y-1 px-2 pb-2">
            {visibleMonsters.map(m => renderListItem({
              kind: 'mostro', id: m.id, name: m.name, subtitle: 'Mostro',
              portraitUrl: m.portraitImageUrl,
              hiddenFromPlayers: !m.visibleToPlayers,
            }))}
            {visibleMonsters.length === 0 && <div className="px-3 py-2 text-xs text-[var(--dash-muted)]">Nessun mostro.</div>}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {!selected ? (
          <div className="flex h-full items-center justify-center text-sm text-[var(--dash-muted)]">Seleziona una scheda dalla lista</div>
        ) : selectedChar ? (
          <>
            <div className={!canEdit ? 'opacity-90' : ''}>
            <div className="mb-4 flex items-start gap-4">
              <DraggablePortrait
                url={selectedChar.portraitCroppedImageUrl || selectedChar.portraitImageUrl}
                fallbackIcon={<User className="h-12 w-12 text-[var(--dash-accent-2)]" />}
                size={116}
                draggable={canDragEntity('pg', (selectedChar as any).ownerProfileId)}
                onDragStart={(e) => e.dataTransfer.setData('application/x-hollowgate-entity', JSON.stringify({ kind: 'pg', id: selectedChar.id }))}
              />
              <div className="min-w-0 flex-1 space-y-1">
                <input
                  type="text"
                  value={selectedChar.name}
                  onChange={(e) => updateCharacter(selectedChar.id, { ...selectedChar, name: e.target.value })}
                  disabled={!canEdit}
                  className="w-full rounded-lg border border-transparent bg-transparent px-1 text-xl font-semibold text-[var(--dash-text-strong)] outline-none transition-colors hover:border-[var(--dash-border-soft)] focus:border-[var(--dash-accent)] disabled:cursor-not-allowed"
                />
                <p className="px-1 text-sm text-[var(--dash-muted)]">
                  {selectedChar.style} · {selectedChar.viaggio}
                </p>
                <input
                  type="text"
                  value={selectedChar.player}
                  onChange={(e) => updateCharacter(selectedChar.id, { ...selectedChar, player: e.target.value })}
                  disabled={!canEdit}
                  placeholder="Breve descrizione del personaggio"
                  className="w-full rounded-lg border border-transparent bg-transparent px-1 text-sm text-[var(--dash-text)] outline-none transition-colors hover:border-[var(--dash-border-soft)] focus:border-[var(--dash-accent)] disabled:cursor-not-allowed"
                />
                <div className="flex items-center gap-2 pt-1">
                  <div className="h-6 w-6 shrink-0 overflow-hidden rounded-full border border-[var(--dash-border-soft)] bg-[var(--dash-input)]">
                    {(selectedChar as any).ownerAvatarUrl ? (
                      <img src={(selectedChar as any).ownerAvatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center"><User className="h-3.5 w-3.5 text-[var(--dash-accent-2)]" /></div>
                    )}
                  </div>
                  <span className="text-xs text-[var(--dash-muted)]">
                    {(selectedChar as any).ownerDisplayName || 'Giocatore sconosciuto'}
                  </span>
                </div>
              </div>

              {canEdit && (
                <EntityKebabMenu
                  colors={menuColors}
                  items={[
                    {
                      key: 'copy',
                      icon: <Copy className="h-4 w-4" />,
                      label: "Copia in un'altra campagna",
                      onClick: () => setShowCopyDialog(true),
                    },
                    {
                      key: 'remove-char',
                      icon: <UserMinus className="h-4 w-4" />,
                      label: 'Rimuovi il personaggio',
                      onClick: () => setConfirmRemoveChar(true),
                    },
                    ...(isOwner ? [{
                      key: 'remove-player',
                      icon: <UserX className="h-4 w-4" />,
                      label: 'Rimuovi il giocatore',
                      onClick: () => setConfirmRemovePlayer(true),
                      danger: true,
                    }] : []),
                  ]}
                  footer={
                    <>
                      {(selectedChar as any).createdAt && (
                        <>
                          <div style={{ borderTop: `1px solid ${menuColors.border}` }} className="my-1" />
                          <div className="px-3 py-1.5 text-[11px]" style={{ color: menuColors.text, opacity: 0.6 }}>
                            Creato il {new Date((selectedChar as any).createdAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}
                          </div>
                        </>
                      )}
                      {actionError && <p className="px-3 pt-1 text-xs text-red-300">{actionError}</p>}
                    </>
                  }
                />
              )}
            </div>

            {!canEdit && (
              <div className="mb-4 rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-3 py-2 text-xs text-[var(--dash-muted)]">
                Puoi visualizzare questo personaggio ma non modificarlo.
              </div>
            )}
            </div>

            <EntityTabBar canEdit={canEdit} tabs={charTabs} />

            <fieldset disabled={!canEdit} className={!canEdit ? 'opacity-90' : ''}>
            {charTabs.currentTab === 'summary' && isHSC && (
              <div className="space-y-4">
                <div className="grid grid-cols-4 gap-2">
                  {(['Fisico', 'Scuola', 'Carisma', 'Strada'] as const).map((ambito) => {
                    const value = (selectedChar.ambiti as any)[ambito];
                    const isExpanded = expandedAmbito === ambito;
                    return (
                      <div
                        key={ambito}
                        role="button"
                        tabIndex={0}
                        onClick={() => setExpandedAmbito(isExpanded ? null : ambito)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setExpandedAmbito(isExpanded ? null : ambito); }}
                        className={`cursor-pointer rounded-lg border-2 px-1.5 py-2 text-center transition-colors ${
                          isExpanded
                            ? 'border-[var(--dash-accent)] bg-[var(--dash-surface-2)]'
                            : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] hover:border-[var(--dash-accent)]'
                        }`}
                      >
                        <div className="truncate text-[10px] uppercase tracking-[0.05em] text-[var(--dash-accent-2)]">{ambito}</div>
                        <div className="mt-0.5 flex items-center justify-between gap-1">
                          <button
                            type="button"
                            tabIndex={canEdit ? 0 : -1}
                            onClick={(e) => {
                              e.stopPropagation();
                              updateSelectedCharAmbito(selectedChar.id, ambito, -1);
                            }}
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] text-xs text-[var(--dash-text-strong)] hover:bg-[var(--dash-panel)] ${
                              canEdit ? '' : 'invisible'
                            }`}
                          >
                            −
                          </button>
                          <span className="text-lg font-semibold text-[var(--dash-text-strong)]">{value}</span>
                          <button
                            type="button"
                            tabIndex={canEdit ? 0 : -1}
                            onClick={(e) => {
                              e.stopPropagation();
                              updateSelectedCharAmbito(selectedChar.id, ambito, 1);
                            }}
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[var(--dash-accent)] bg-[var(--dash-accent)] text-xs text-[var(--dash-text-strong)] hover:bg-[var(--dash-accent-2)] ${
                              canEdit ? '' : 'invisible'
                            }`}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {expandedAmbito && (
                  <div className="rounded-xl border-2 border-[var(--dash-accent)] bg-[var(--dash-panel)] p-4">
                    <div className="mb-3 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
                      Abilità · {expandedAmbito}
                    </div>
                    <div className="space-y-2.5">
                      {ABILITA_PER_AMBITO[expandedAmbito].map((abilita) => {
                        const currentValue = (selectedChar.abilita as any)?.[abilita] ?? 1;
                        return (
                          <div key={abilita} className="flex items-center justify-between">
                            <span className="text-sm text-[var(--dash-text)]">{abilita}</span>
                            <AbilitaDots
                              value={currentValue}
                              disabled={!canEdit}
                              onChange={(v) => updateCharacter(selectedChar.id, {
                                ...selectedChar,
                                abilita: { ...selectedChar.abilita, [abilita]: v },
                              })}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="rounded-xl border-2 border-red-900/60 bg-red-950/20 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.08em] text-red-500/80">
                      <Heart className="h-4 w-4 text-red-500" />
                      Freschezza
                    </div>
                    <span className="text-xs text-red-200/60">{selectedChar.freschezza} / {selectedChar.maxFreschezza}</span>
                  </div>
                  <FrischezzaTracker
                    current={selectedChar.freschezza}
                    max={selectedChar.maxFreschezza}
                    crucialBoxes={selectedChar.caselleFrischezzaCruciali}
                    onUpdate={(value) => updateCharacter(selectedChar.id, { ...selectedChar, freschezza: value })}
                  />
                </div>
                <div className="rounded-xl border-2 border-purple-900/60 bg-purple-950/20 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.08em] text-purple-400/80">
                      <Brain className="h-4 w-4 text-purple-400" />
                      Spirale della Follia
                    </div>
                    <span className="text-xs text-purple-200/60">{selectedChar.follia} / {selectedChar.maxFollia}</span>
                  </div>
                  <FoliaSpiral current={selectedChar.follia} max={selectedChar.maxFollia} onUpdate={(value) => updateCharacter(selectedChar.id, { ...selectedChar, follia: value })} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border-2 border-yellow-900/60 bg-yellow-950/20 p-3">
                    <div className="mb-2 text-xs uppercase tracking-[0.08em] text-yellow-500/80">Audacia</div>
                    <StarRating
                      value={typeof selectedChar.audacia === 'number' ? selectedChar.audacia : 1}
                      max={6}
                      disabled={!canEdit}
                      onChange={(v) => updateCharacter(selectedChar.id, { ...selectedChar, audacia: v })}
                    />
                  </div>
                  <div className="rounded-xl border-2 border-yellow-900/60 bg-yellow-950/20 p-3">
                    <div className="mb-2 text-xs uppercase tracking-[0.08em] text-yellow-500/80">Prodigi</div>
                    <StarRating
                      value={typeof selectedChar.prodigi === 'number' ? selectedChar.prodigi : 1}
                      max={2}
                      disabled={!canEdit}
                      onChange={(v) => updateCharacter(selectedChar.id, { ...selectedChar, prodigi: v })}
                    />
                  </div>
                </div>

                <div className="rounded-xl border-2 border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                  <div className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Tratti</div>
                  {selectedChar.tratti.length > 0 ? (
                    <div className="space-y-2">
                      {selectedChar.tratti.map((trait, idx) => (
                        <div key={idx} className="rounded-lg border-2 border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-2 text-sm">
                          <div className="font-medium text-[var(--dash-text-strong)]">{trait.name}</div>
                          {trait.description && <div className="text-xs text-[var(--dash-text)]">{trait.description}</div>}
                          {trait.benefit && <div className="mt-1 text-xs text-[var(--dash-accent-2)]">{trait.benefit}</div>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-[var(--dash-muted)]">Nessun tratto.</div>
                  )}
                </div>
              </div>
            )}

            {charTabs.currentTab === 'conditions' && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                  <div className="mb-2 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Condizioni attive</div>
                  <ConditionsPanel conditions={selectedChar.conditions} onUpdate={(conditions) => updateCharacter(selectedChar.id, { ...selectedChar, conditions })} />
                </div>
                <div className="rounded-2xl border border-[var(--dash-accent)] bg-[var(--dash-panel)] p-4">
                  <div className="mb-2 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Turbe mentali</div>
                  <TurbePanel turbe={selectedChar.turbe} onUpdate={(turbe) => updateCharacter(selectedChar.id, { ...selectedChar, turbe })} />
                </div>
              </div>
            )}

            {charTabs.currentTab === 'equipment' && (
              <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                <LegacyEquipmentPanel equipment={selectedChar.equipment} onUpdate={(equipment) => updateCharacter(selectedChar.id, { ...selectedChar, equipment })} />
              </div>
            )}

            {charTabs.customTabs.map(tab =>
              charTabs.currentTab === tab.id && (canEdit || !tab.hidden) ? (
                <textarea
                  key={tab.id}
                  value={tab.content}
                  onChange={(e) => charTabs.handleCustomTabContentChange(tab.id, e.target.value)}
                  disabled={!canEdit}
                  placeholder="Scrivi qui..."
                  className="h-64 w-full resize-none rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4 text-sm text-[var(--dash-text)] outline-none focus:border-[var(--dash-accent)] disabled:cursor-not-allowed disabled:opacity-70"
                />
              ) : null
            )}
            </fieldset>
          </>
        ) : selectedNpc ? (
          <>
            <div className={!isOwner ? 'opacity-90' : ''}>
            <div className="mb-4 flex items-start gap-3">
              <DraggablePortrait
                url={selectedNpc.portraitCroppedImageUrl || selectedNpc.portraitImageUrl}
                fallbackIcon={<Ghost className="h-6 w-6 text-[var(--dash-accent-2)]" />}
                size={56}
                draggable={canDragEntity('png')}
                onDragStart={(e) => e.dataTransfer.setData('application/x-hollowgate-entity', JSON.stringify({ kind: 'png', id: selectedNpc.id }))}
                hiddenFromPlayers={!selectedNpc.visibleToPlayers}
              />
              <div className="min-w-0 flex-1">
                <h3 className="text-xl font-semibold text-[var(--dash-text-strong)]">{selectedNpc.name}</h3>
                <p className="text-sm text-[var(--dash-muted)]">{selectedNpc.role}</p>
              </div>
              {isOwner && (
                <EntityKebabMenu
                  colors={menuColors}
                  items={buildEntityMenuItems(selectedNpc, 'Elimina il PNG')}
                  footer={entityMenuFooter(selectedNpc)}
                />
              )}
            </div>

            {!isOwner && (
              <div className="mb-4 rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-3 py-2 text-xs text-[var(--dash-muted)]">
                Puoi visualizzare questa scheda ma non modificarla.
              </div>
            )}
            </div>

            <EntityTabBar canEdit={isOwner} tabs={npcTabs} />

            <fieldset disabled={!isOwner} className={!isOwner ? 'opacity-90' : ''}>
            {npcTabs.currentTab === 'summary' && (
              <div className="space-y-3 text-sm">
                {selectedNpc.description && (
                  <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
                    <div className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Descrizione</div>
                    <p className="text-[var(--dash-text)]">{selectedNpc.description}</p>
                  </div>
                )}
                {selectedNpc.personality && (
                  <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
                    <div className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Personalità</div>
                    <p className="text-[var(--dash-text)]">{selectedNpc.personality}</p>
                  </div>
                )}
                {isOwner && selectedNpc.secrets && (
                  <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
                    <div className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Segreti (solo GM)</div>
                    <p className="text-[var(--dash-text)]">{selectedNpc.secrets}</p>
                  </div>
                )}
                {(selectedNpc.attacco || selectedNpc.difesa) && (
                  <div className="grid grid-cols-2 gap-3">
                    {selectedNpc.attacco && (
                      <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-3 py-2">
                        <div className="text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Attacco</div>
                        <div className="mt-1 text-sm font-semibold text-[var(--dash-text-strong)]">{selectedNpc.attacco}</div>
                      </div>
                    )}
                    {selectedNpc.difesa && (
                      <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-3 py-2">
                        <div className="text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Difesa</div>
                        <div className="mt-1 text-sm font-semibold text-[var(--dash-text-strong)]">{selectedNpc.difesa}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {npcTabs.customTabs.map(tab =>
              npcTabs.currentTab === tab.id && (isOwner || !tab.hidden) ? (
                <textarea
                  key={tab.id}
                  value={tab.content}
                  onChange={(e) => npcTabs.handleCustomTabContentChange(tab.id, e.target.value)}
                  disabled={!isOwner}
                  placeholder="Scrivi qui..."
                  className="h-64 w-full resize-none rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4 text-sm text-[var(--dash-text)] outline-none focus:border-[var(--dash-accent)] disabled:cursor-not-allowed disabled:opacity-70"
                />
              ) : null
            )}
            </fieldset>
          </>
        ) : selectedMonster ? (
          <>
            <div className={!isOwner ? 'opacity-90' : ''}>
            <div className="mb-4 flex items-start gap-3">
              <DraggablePortrait
                url={selectedMonster.portraitImageUrl}
                fallbackIcon={<Skull className="h-6 w-6 text-[var(--dash-accent-2)]" />}
                size={56}
                draggable={canDragEntity('mostro')}
                onDragStart={(e) => e.dataTransfer.setData('application/x-hollowgate-entity', JSON.stringify({ kind: 'mostro', id: selectedMonster.id }))}
                hiddenFromPlayers={!selectedMonster.visibleToPlayers}
              />
              <h3 className="min-w-0 flex-1 text-xl font-semibold text-[var(--dash-text-strong)]">{selectedMonster.name}</h3>
              {isOwner && (
                <EntityKebabMenu
                  colors={menuColors}
                  items={buildEntityMenuItems(selectedMonster, 'Elimina il mostro')}
                  footer={entityMenuFooter(selectedMonster)}
                />
              )}
            </div>

            {!isOwner && (
              <div className="mb-4 rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-3 py-2 text-xs text-[var(--dash-muted)]">
                Puoi visualizzare questa scheda ma non modificarla.
              </div>
            )}
            </div>

            <EntityTabBar canEdit={isOwner} tabs={monsterTabs} />

            <fieldset disabled={!isOwner} className={!isOwner ? 'opacity-90' : ''}>
            {monsterTabs.currentTab === 'summary' && (
              <div className="space-y-3 text-sm">
                {selectedMonster.description && (
                  <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
                    <div className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Descrizione</div>
                    <p className="text-[var(--dash-text)]">{selectedMonster.description}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  {selectedMonster.attacco && (
                    <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-3 py-2">
                      <div className="text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Attacco</div>
                      <div className="mt-1 text-sm font-semibold text-[var(--dash-text-strong)]">{selectedMonster.attacco}</div>
                    </div>
                  )}
                  {selectedMonster.difesa && (
                    <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-3 py-2">
                      <div className="text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Difesa</div>
                      <div className="mt-1 text-sm font-semibold text-[var(--dash-text-strong)]">{selectedMonster.difesa}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {monsterTabs.customTabs.map(tab =>
              monsterTabs.currentTab === tab.id && (isOwner || !tab.hidden) ? (
                <textarea
                  key={tab.id}
                  value={tab.content}
                  onChange={(e) => monsterTabs.handleCustomTabContentChange(tab.id, e.target.value)}
                  disabled={!isOwner}
                  placeholder="Scrivi qui..."
                  className="h-64 w-full resize-none rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4 text-sm text-[var(--dash-text)] outline-none focus:border-[var(--dash-accent)] disabled:cursor-not-allowed disabled:opacity-70"
                />
              ) : null
            )}
            </fieldset>
          </>
        ) : null}
      </div>
    </div>
    {(charTabs.draggedTabId || npcTabs.draggedTabId || monsterTabs.draggedTabId) && (
      <div className="fixed inset-0 z-[9999] cursor-grabbing" />
    )}
    {confirmRemoveChar && (
      <ConfirmDialog
        title="Rimuovere il personaggio dalla campagna?"
        message="Il personaggio non verrà eliminato: resterà nel database del giocatore, semplicemente non farà più parte di questa campagna."
        confirmLabel="Rimuovi"
        onConfirm={handleRemoveCharacterFromCampaign}
        onCancel={() => setConfirmRemoveChar(false)}
      />
    )}
    {confirmRemovePlayer && (
      <ConfirmDialog
        title="Rimuovere il giocatore dalla campagna?"
        message="Il giocatore e tutti i suoi personaggi verranno rimossi da questa campagna. L'account e i personaggi restano intatti, semplicemente non parteciperanno più qui."
        confirmLabel="Rimuovi"
        onConfirm={handleRemovePlayer}
        onCancel={() => setConfirmRemovePlayer(false)}
      />
    )}
    {confirmUnassignEntity && (
      <ConfirmDialog
        title={`Rimuovere ${selected?.kind === 'mostro' ? 'il mostro' : 'il PNG'} dalla campagna?`}
        message={`${(selected?.kind === 'mostro' ? selectedMonster?.name : selectedNpc?.name) ?? "L'entità"} verrà scollegato da questa campagna. Al momento l'app non ha ancora una vista catalogo per le entità non assegnate: non sarà raggiungibile da nessuna schermata finché questa funzionalità non verrà completata.`}
        confirmLabel="Rimuovi"
        danger={false}
        onConfirm={handleUnassignNpcOrMonster}
        onCancel={() => setConfirmUnassignEntity(false)}
      />
    )}
    {confirmDeleteEntity && (
      <ConfirmDialog
        title={`Eliminare definitivamente ${(selected?.kind === 'mostro' ? selectedMonster?.name : selectedNpc?.name) ?? ''}?`}
        message="Questa azione non può essere annullata e cancellerà anche tutte le sue tab, comprese quelle nascoste."
        confirmLabel="Elimina definitivamente"
        onConfirm={handleDeleteNpcOrMonster}
        onCancel={() => setConfirmDeleteEntity(false)}
      />
    )}
    {showCopyDialog && (
      <div
        className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/80 p-4"
        onClick={() => { setShowCopyDialog(false); setCopyTargetId(null); }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ backgroundColor: menuColors.panel, border: `1px solid ${menuColors.border}` }}
          className="w-full max-w-sm rounded-2xl p-5 shadow-2xl"
        >
          <h3 className="mb-1 text-base font-semibold" style={{ color: menuColors.text }}>
            Copia in un'altra campagna
          </h3>
          <p className="mb-4 text-sm" style={{ color: menuColors.text, opacity: 0.75 }}>
            Scegli la campagna di destinazione. Verrà creata una copia; l'originale resterà qui invariato.
          </p>

          <div className="mb-4 max-h-56 space-y-1 overflow-y-auto">
            {compatibleCampaigns.length === 0 ? (
              <p className="text-sm" style={{ color: menuColors.text, opacity: 0.6 }}>
                Nessuna campagna compatibile trovata (stesso regolamento, diversa da quella attuale).
              </p>
            ) : (
              compatibleCampaigns.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCopyTargetId(c.id)}
                  style={{
                    color: menuColors.text,
                    backgroundColor: copyTargetId === c.id ? menuColors.border : 'transparent',
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors"
                >
                  {c.name}
                </button>
              ))
            )}
          </div>

          {actionError && <p className="mb-3 text-xs text-red-300">{actionError}</p>}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => { setShowCopyDialog(false); setCopyTargetId(null); }}
              style={{ border: `1px solid ${menuColors.border}`, color: menuColors.text }}
              className="rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80"
            >
              Annulla
            </button>
            <button
              type="button"
              onClick={handleConfirmCopy}
              disabled={!copyTargetId || isCopying}
              style={{ backgroundColor: menuColors.border, color: '#f4efe8', opacity: !copyTargetId || isCopying ? 0.5 : 1 }}
              className="rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-80"
            >
              {isCopying ? 'Copia in corso...' : 'Conferma'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
