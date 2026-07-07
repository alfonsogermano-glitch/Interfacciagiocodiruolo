import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus, Loader2, Pencil, Trash2, KeyRound, MoreVertical,
  Copy, UserMinus, Search, Eye, EyeOff, MapPin
} from 'lucide-react';
import { useAuth, supabase } from '../../auth/AuthContext';
import { useCampaign } from '../../campaigns/CampaignContext';
import { CharacterCreationWizard } from './CharacterCreationWizard';
import { CharacterDetailModal } from './CharacterDetailModal';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { EntityCard } from '../session/shared/EntityCard';
import { EntityKebabMenu } from '../session/shared/EntityKebabMenu';
import { loadCharactersByOwner, saveCharacter, deleteCharacter } from '../../../services/supabase/charactersService';
import {
  loadNPCsByOwner, loadMonstersByOwner,
  assignNPCToCampaign, assignMonsterToCampaign,
  unassignNPCFromCampaign, unassignMonsterFromCampaign,
  copyNPCToCampaign, copyMonsterToCampaign,
  deleteNPC, deleteMonster,
  saveNPC, saveMonster,
  type NPC, type Monster
} from '../../../services/supabase/entitiesService';
import type { Character } from '../../../types/character';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { PALETTE_COLORS, DEFAULT_PALETTE_COLORS, type PaletteId } from '../ui/paletteColors';

const SERVER_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-771c5bfd`;
const INVITE_OPTION_VALUE = '__invite__';

type OwnedCharacter = Character & { player: string; notes: string; ownerProfileId: string; campaignId: string | null };
type CatalogEntry = { kind: 'npc'; entity: NPC } | { kind: 'monster'; entity: Monster };
type EntityFilter = 'all' | 'assigned' | 'unassigned';
type SortMode = 'recent' | 'name';
type ActiveTab = 'characters' | 'npcs' | 'monsters';

const GRID_CLASS = 'grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]';

function getCurrentPaletteColors() {
  const el = document.querySelector('[data-dashboard-palette]');
  const palette = el?.getAttribute('data-dashboard-palette') as PaletteId | null;
  return palette && PALETTE_COLORS[palette] ? PALETTE_COLORS[palette] : DEFAULT_PALETTE_COLORS;
}

function pillClass(active: boolean, dormant = false) {
  if (dormant) {
    return 'inline-flex cursor-default items-center gap-1.5 rounded-full border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] px-3.5 py-1.5 text-xs font-medium text-[var(--dash-muted)] opacity-60';
  }
  return `inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
    active
      ? 'border-[var(--dash-accent)] bg-[var(--dash-accent)] text-[var(--dash-text-strong)]'
      : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface)] text-[var(--dash-muted)] hover:text-[var(--dash-text)]'
  }`;
}

const entityKebabButtonClass =
  'flex h-8 w-8 items-center justify-center rounded-full border border-[var(--dash-border-soft)] bg-black/40 text-[var(--dash-muted)] transition-colors hover:border-[var(--dash-accent)] hover:text-[var(--dash-text-strong)]';

const photoCornerButtonClass =
  'flex h-7 w-7 items-center justify-center rounded-full border border-white/25 bg-black/50 text-white transition-colors hover:border-[var(--dash-accent-2)]';

function sortByNameOrDate<T extends { name: string; createdAt?: string }>(items: T[], mode: SortMode): T[] {
  const copy = [...items];
  if (mode === 'name') {
    copy.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'it', { sensitivity: 'base' }));
  } else {
    copy.sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
  }
  return copy;
}

function sortEntries(items: CatalogEntry[], mode: SortMode): CatalogEntry[] {
  const copy = [...items];
  if (mode === 'name') {
    copy.sort((a, b) => (a.entity.name || '').localeCompare(b.entity.name || '', 'it', { sensitivity: 'base' }));
  } else {
    copy.sort((a, b) => new Date(b.entity.createdAt ?? 0).getTime() - new Date(a.entity.createdAt ?? 0).getTime());
  }
  return copy;
}

function filterEntries(all: CatalogEntry[], filter: EntityFilter): CatalogEntry[] {
  if (filter === 'assigned') return all.filter(e => e.entity.campaignId);
  if (filter === 'unassigned') return all.filter(e => !e.entity.campaignId);
  return all;
}

export function MyCharactersPage() {
  const { user, session } = useAuth();
  const { campaigns, joinedCampaigns, refreshCampaigns, refreshJoinedCampaigns } = useCampaign();

  const [activeTab, setActiveTab] = useState<ActiveTab>('characters');

  // ============= Personaggi giocanti =============

  const [characters, setCharacters] = useState<OwnedCharacter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<OwnedCharacter | null>(null);
  const [detailCharacter, setDetailCharacter] = useState<OwnedCharacter | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [menuColors, setMenuColors] = useState(() => getCurrentPaletteColors());
  const menuButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const [inviteModeFor, setInviteModeFor] = useState<string | null>(null);
  const [inviteCodeDraft, setInviteCodeDraft] = useState('');
  const [pendingCharacterId, setPendingCharacterId] = useState<string | null>(null);
  const [assignErrors, setAssignErrors] = useState<Record<string, string>>({});
  const [gmOnlineFor, setGmOnlineFor] = useState<Record<string, boolean>>({});

  const [charFilter, setCharFilter] = useState<EntityFilter>('all');
  const [charSort, setCharSort] = useState<SortMode>('recent');

  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const loadSeqRef = useRef(0);

  const allCampaignOptions = [
    ...campaigns.map(c => ({ id: c.id, name: c.name, suffix: '(tua campagna)' })),
    ...joinedCampaigns.map(c => ({ id: c.id, name: c.name, suffix: '(partecipi)' })),
  ];

  const campaignInfoFor = (campaignId: string | null) => {
    if (!campaignId) return null;
    const found = [...campaigns, ...joinedCampaigns].find(c => c.id === campaignId);
    return found ? { name: found.name, logoUrl: found.logoUrl } : null;
  };

  const load = async () => {
    if (!user?.id) return;
    const mySeq = ++loadSeqRef.current;
    setIsLoading(true);
    try {
      const data = await loadCharactersByOwner(user.id);
      if (loadSeqRef.current !== mySeq) return;
      setCharacters(data);
    } finally {
      if (loadSeqRef.current === mySeq) setIsLoading(false);
    }
  };

  useEffect(() => { void load(); }, [user?.id]);

  useEffect(() => {
    const campaignIds = Array.from(new Set(characters.map(c => c.campaignId).filter(Boolean))) as string[];
    const channels: Record<string, ReturnType<typeof supabase.channel>> = {};

    campaignIds.forEach((campaignId) => {
      const ch = supabase
        .channel(`campaign:${campaignId}`, { config: { private: true } })
        .on('presence', { event: 'sync' }, () => {
          const state = ch.presenceState();
          const isGmOnline = Object.values(state).some((presences: any) =>
            presences.some((p: any) => p.role === 'gm')
          );
          setGmOnlineFor(prev => ({ ...prev, [campaignId]: isGmOnline }));
        })
        .subscribe();
      channels[campaignId] = ch;
    });

    return () => {
      Object.values(channels).forEach((ch) => supabase.removeChannel(ch));
    };
  }, [characters.map(c => c.campaignId).join(',')]);

  useEffect(() => {
    const closeMenu = () => setOpenMenuFor(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  const handleAdd = async (character: Character & { player: string; notes: string }) => {
    if (!user?.id) return;
    await saveCharacter(editingCharacter?.campaignId ?? null, character, user.id);
    setShowWizard(false);
    setEditingCharacter(null);
    await load();
  };

  const requestDelete = (id: string) => {
    setOpenMenuFor(null);
    setDeleteTargetId(id);
  };

  const confirmDelete = async () => {
    if (!deleteTargetId) return;
    await deleteCharacter(deleteTargetId);
    setDeleteTargetId(null);
    await load();
  };

  const persistCharacter = useCallback((id: string, updatedChar: OwnedCharacter) => {
    setCharacters(prev => prev.map(c => (c.id === id ? updatedChar : c)));
    if (saveTimersRef.current[id]) {
      clearTimeout(saveTimersRef.current[id]);
    }
    saveTimersRef.current[id] = setTimeout(async () => {
      try {
        await saveCharacter(updatedChar.campaignId, updatedChar, user?.id ?? '');
      } catch (error) {
        console.error('Errore salvataggio personaggio su Supabase:', error);
      }
    }, 150);
  }, [user?.id]);

  const callAssignEndpoint = async (characterId: string, body: { campaignId?: string | null; inviteCode?: string }) => {
    const accessToken = session?.access_token ?? publicAnonKey;
    const res = await fetch(`${SERVER_BASE}/characters/${characterId}/assign-campaign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Errore durante l\'operazione');
    return data;
  };

  const handleSelectChange = async (characterId: string, value: string) => {
    setAssignErrors(prev => ({ ...prev, [characterId]: '' }));
    if (value === INVITE_OPTION_VALUE) {
      setInviteModeFor(characterId);
      setInviteCodeDraft('');
      return;
    }
    setPendingCharacterId(characterId);
    try {
      await callAssignEndpoint(characterId, { campaignId: value || null });
      await Promise.all([load(), refreshCampaigns(), refreshJoinedCampaigns()]);
      setOpenMenuFor(null);
    } catch (err) {
      setAssignErrors(prev => ({ ...prev, [characterId]: err instanceof Error ? err.message : String(err) }));
    } finally {
      setPendingCharacterId(null);
    }
  };

  const handleConfirmInvite = async (characterId: string) => {
    if (!inviteCodeDraft.trim()) return;
    setPendingCharacterId(characterId);
    setAssignErrors(prev => ({ ...prev, [characterId]: '' }));
    try {
      await callAssignEndpoint(characterId, { inviteCode: inviteCodeDraft.trim() });
      setInviteModeFor(null);
      setInviteCodeDraft('');
      await Promise.all([load(), refreshCampaigns(), refreshJoinedCampaigns()]);
    } catch (err) {
      setAssignErrors(prev => ({ ...prev, [characterId]: err instanceof Error ? err.message : String(err) }));
    } finally {
      setPendingCharacterId(null);
    }
  };

  const assignedCharacters = characters.filter(c => c.campaignId);
  const unassignedCharacters = characters.filter(c => !c.campaignId);
  const charFilterPool = charFilter === 'assigned' ? assignedCharacters : charFilter === 'unassigned' ? unassignedCharacters : characters;
  const filteredCharacters = sortByNameOrDate(charFilterPool, charSort);

  const renderCharacterCard = (char: OwnedCharacter) => {
    const isPending = pendingCharacterId === char.id;
    const isInviteMode = inviteModeFor === char.id;
    const error = assignErrors[char.id];
    const isMenuOpen = openMenuFor === char.id;
    const campaignInfo = campaignInfoFor(char.campaignId);

    return (
      <EntityCard
        key={char.id}
        name={char.name}
        subtitle={char.style || char.viaggio || 'Personaggio'}
        photoUrl={char.portraitCroppedImageUrl || char.portraitImageUrl}
        onClick={() => setDetailCharacter(char)}
        cornerAction={
          <button
            type="button"
            ref={(el) => { menuButtonRefs.current[char.id] = el; }}
            onClick={(e) => {
              e.stopPropagation();
              if (isMenuOpen) {
                setOpenMenuFor(null);
                return;
              }
              const rect = menuButtonRefs.current[char.id]?.getBoundingClientRect();
              if (rect) {
                setMenuPosition({ top: rect.bottom + 4, left: rect.right - 224 });
              }
              setMenuColors(getCurrentPaletteColors());
              setOpenMenuFor(char.id);
            }}
            className={photoCornerButtonClass}
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        }
      >
        <div className="flex items-center gap-1.5 truncate text-[11px] text-[var(--dash-accent-2)]">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {campaignInfo?.name ?? 'Nessuna campagna'}
            {char.campaignId ? ` · GM ${gmOnlineFor[char.campaignId] ? 'online' : 'offline'}` : ''}
          </span>
        </div>

        {isMenuOpen && menuPosition && createPortal(
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: menuPosition.top,
              left: menuPosition.left,
              backgroundColor: menuColors.panel,
              border: `1px solid ${menuColors.border}`,
              borderRadius: '0.75rem',
              padding: '0.375rem',
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            }}
            className="z-[1000] w-56"
          >
            <button
              type="button"
              onClick={() => { setEditingCharacter(char); setShowWizard(true); setOpenMenuFor(null); }}
              style={{ color: menuColors.text }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-[#1a1a1a]"
            >
              <Pencil className="h-4 w-4" /> Modifica
            </button>
            <button
              type="button"
              onClick={() => requestDelete(char.id)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[#f1d3d3] hover:bg-[#231313]"
            >
              <Trash2 className="h-4 w-4" /> Elimina
            </button>
            <div className="my-1 border-t border-[#4a4a4a]" />
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-[0.08em] text-[#8d877f]">
              Assegna a campagna
            </div>
            {isInviteMode ? (
              <div className="flex flex-col gap-1.5 px-3 pb-2">
                <input
                  type="text"
                  value={inviteCodeDraft}
                  onChange={e => setInviteCodeDraft(e.target.value.toUpperCase())}
                  placeholder="Codice invito"
                  disabled={isPending}
                  style={{ color: menuColors.text }}
                  className="w-full rounded-lg border border-[#3a3a3a] bg-[#181818] px-2 py-1 text-xs uppercase tracking-[0.15em]"
                />
                <div className="flex gap-2">
                  <button type="button" onClick={() => handleConfirmInvite(char.id)} disabled={isPending || !inviteCodeDraft.trim()}
                    className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-[#8a8176] px-2 py-1 text-xs text-[#8a8176] disabled:opacity-50">
                    {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <KeyRound className="h-3 w-3" />}
                    Conferma
                  </button>
                  <button type="button" onClick={() => { setInviteModeFor(null); setInviteCodeDraft(''); }} disabled={isPending}
                    className="rounded-lg px-2 py-1 text-xs text-[#8d877f] hover:text-[#d8d2ca]">
                    Annulla
                  </button>
                </div>
              </div>
            ) : (
              <div className="px-3 pb-2">
                <select
                  value={char.campaignId ?? ''}
                  onChange={e => handleSelectChange(char.id, e.target.value)}
                  disabled={isPending}
                  style={{ color: menuColors.text }}
                  className="w-full rounded-lg border border-[#3a3a3a] bg-[#181818] px-2 py-1 text-xs"
                >
                  <option value="">— Nessuna campagna —</option>
                  {allCampaignOptions.map(c => (
                    <option key={c.id} value={c.id}>{c.name} {c.suffix}</option>
                  ))}
                  <option value={INVITE_OPTION_VALUE}>+ Usa un codice invito...</option>
                </select>
                {isPending && <Loader2 className="mt-1 h-3.5 w-3.5 animate-spin text-[#8d877f]" />}
              </div>
            )}
            {error && <p className="px-3 pb-2 text-xs text-[#f1d3d3]">{error}</p>}
          </div>,
          document.body
        )}
      </EntityCard>
    );
  };

  // ============= PNG =============

  const [npcs, setNpcs] = useState<NPC[]>([]);
  const [isLoadingNpcs, setIsLoadingNpcs] = useState(true);
  const [npcFilter, setNpcFilter] = useState<EntityFilter>('all');
  const [npcSort, setNpcSort] = useState<SortMode>('recent');

  // ============= Mostri =============

  const [monsters, setMonsters] = useState<Monster[]>([]);
  const [isLoadingMonsters, setIsLoadingMonsters] = useState(true);
  const [monsterFilter, setMonsterFilter] = useState<EntityFilter>('all');
  const [monsterSort, setMonsterSort] = useState<SortMode>('recent');

  // ============= Azioni condivise PNG/Mostri =============

  const [entityAssigningId, setEntityAssigningId] = useState<string | null>(null);
  const [entityAssignErrors, setEntityAssignErrors] = useState<Record<string, string>>({});
  const [copyDialogEntry, setCopyDialogEntry] = useState<CatalogEntry | null>(null);
  const [copyTargetId, setCopyTargetId] = useState<string | null>(null);
  const [isCopying, setIsCopying] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [unassignEntry, setUnassignEntry] = useState<CatalogEntry | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<CatalogEntry | null>(null);

  const loadNpcs = async () => {
    if (!user?.id) return;
    setIsLoadingNpcs(true);
    try {
      setNpcs(await loadNPCsByOwner(user.id));
    } finally {
      setIsLoadingNpcs(false);
    }
  };

  const loadMonstersList = async () => {
    if (!user?.id) return;
    setIsLoadingMonsters(true);
    try {
      setMonsters(await loadMonstersByOwner(user.id));
    } finally {
      setIsLoadingMonsters(false);
    }
  };

  useEffect(() => { void loadNpcs(); }, [user?.id]);
  useEffect(() => { void loadMonstersList(); }, [user?.id]);

  const entityName = (entry: CatalogEntry) =>
    entry.entity.name?.trim() || (entry.kind === 'npc' ? 'PNG senza nome' : 'Mostro senza nome');

  const entityCampaignName = (campaignId: string | null | undefined) => {
    if (!campaignId) return 'Non in campagna';
    return campaigns.find(c => c.id === campaignId)?.name ?? 'Campagna sconosciuta';
  };

  // applica un aggiornamento locale ottimistico sullo stato giusto (npcs o monsters) in base al kind
  const applyEntityUpdate = (entry: CatalogEntry, updater: (entity: NPC | Monster) => NPC | Monster) => {
    if (entry.kind === 'npc') {
      setNpcs(prev => prev.map(n => (n.id === entry.entity.id ? (updater(n) as NPC) : n)));
    } else {
      setMonsters(prev => prev.map(m => (m.id === entry.entity.id ? (updater(m) as Monster) : m)));
    }
  };

  const removeEntity = (entry: CatalogEntry) => {
    if (entry.kind === 'npc') {
      setNpcs(prev => prev.filter(n => n.id !== entry.entity.id));
    } else {
      setMonsters(prev => prev.filter(m => m.id !== entry.entity.id));
    }
  };

  const handleAssignEntity = async (entry: CatalogEntry, targetCampaignId: string) => {
    if (!targetCampaignId) return;
    setEntityAssigningId(entry.entity.id);
    setEntityAssignErrors(prev => ({ ...prev, [entry.entity.id]: '' }));

    try {
      if (entry.kind === 'npc') {
        await assignNPCToCampaign(entry.entity.id, targetCampaignId);
      } else {
        await assignMonsterToCampaign(entry.entity.id, targetCampaignId);
      }

      applyEntityUpdate(entry, e => ({ ...e, campaignId: targetCampaignId }));
    } catch (err) {
      setEntityAssignErrors(prev => ({ ...prev, [entry.entity.id]: err instanceof Error ? err.message : String(err) }));
    } finally {
      setEntityAssigningId(null);
    }
  };

  const handleToggleEntityVisibility = async (entry: CatalogEntry) => {
    const nextVisible = !entry.entity.visibleToPlayers;
    const updated = { ...entry.entity, visibleToPlayers: nextVisible };

    applyEntityUpdate(entry, () => updated);

    try {
      if (entry.kind === 'npc') {
        await saveNPC(updated.campaignId ?? '', updated as NPC);
      } else {
        await saveMonster(updated.campaignId ?? '', updated as Monster);
      }
    } catch (err) {
      console.error('Errore aggiornamento visibilità:', err);
      applyEntityUpdate(entry, () => entry.entity);
    }
  };

  const handleConfirmUnassignEntity = async () => {
    if (!unassignEntry) return;
    try {
      if (unassignEntry.kind === 'npc') {
        await unassignNPCFromCampaign(unassignEntry.entity.id);
      } else {
        await unassignMonsterFromCampaign(unassignEntry.entity.id);
      }

      applyEntityUpdate(unassignEntry, e => ({ ...e, campaignId: null }));
    } catch (err) {
      console.error('Errore rimozione dalla campagna:', err);
    } finally {
      setUnassignEntry(null);
    }
  };

  const handleConfirmDeleteEntity = async () => {
    if (!deleteEntry) return;
    try {
      if (deleteEntry.kind === 'npc') {
        await deleteNPC(deleteEntry.entity.id);
      } else {
        await deleteMonster(deleteEntry.entity.id);
      }

      removeEntity(deleteEntry);
    } catch (err) {
      console.error('Errore eliminazione:', err);
    } finally {
      setDeleteEntry(null);
    }
  };

  const compatibleCopyCampaigns = (entry: CatalogEntry | null) => {
    if (!entry) return [];
    const sourceCampaign = campaigns.find(c => c.id === entry.entity.campaignId);
    return campaigns.filter(c => c.id !== entry.entity.campaignId && (!sourceCampaign || c.ruleset === sourceCampaign.ruleset));
  };

  const handleConfirmCopyEntity = async () => {
    if (!copyDialogEntry || !copyTargetId || !user) return;
    setIsCopying(true);
    setCopyError(null);
    try {
      if (copyDialogEntry.kind === 'npc') {
        await copyNPCToCampaign(copyDialogEntry.entity.id, copyTargetId, user.id);
      } else {
        await copyMonsterToCampaign(copyDialogEntry.entity.id, copyTargetId, user.id);
      }
      setCopyDialogEntry(null);
      setCopyTargetId(null);
    } catch (err) {
      setCopyError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCopying(false);
    }
  };

  const renderEntityCard = (entry: CatalogEntry) => {
    const { entity, kind } = entry;
    const name = entityName(entry);
    const typeLabel = kind === 'npc' ? (entity as NPC).role || 'PNG' : 'Mostro';
    const campaignName = entityCampaignName(entity.campaignId);
    const photoUrl = kind === 'npc'
      ? (entity as NPC).portraitCroppedImageUrl || (entity as NPC).portraitImageUrl
      : (entity as Monster).portraitImageUrl;
    const isUnassigned = !entity.campaignId;
    const assignError = entityAssignErrors[entity.id];
    const isAssigning = entityAssigningId === entity.id;

    return (
      <EntityCard
        key={`${kind}-${entity.id}`}
        name={name}
        subtitle={typeLabel}
        photoUrl={photoUrl}
        hiddenBadge={!entity.visibleToPlayers}
        cornerAction={
          isUnassigned ? undefined : (
            <EntityKebabMenu
              colors={menuColors}
              buttonClassName={photoCornerButtonClass}
              items={[
                {
                  key: 'copy',
                  icon: <Copy className="h-4 w-4" />,
                  label: "Copia in un'altra campagna",
                  onClick: () => {
                    setMenuColors(getCurrentPaletteColors());
                    setCopyDialogEntry(entry);
                    setCopyTargetId(null);
                    setCopyError(null);
                  },
                },
                {
                  key: 'unassign',
                  icon: <UserMinus className="h-4 w-4" />,
                  label: 'Rimuovi dalla campagna',
                  onClick: () => setUnassignEntry(entry),
                },
                {
                  key: 'delete',
                  icon: <Trash2 className="h-4 w-4" />,
                  label: 'Elimina definitivamente',
                  onClick: () => setDeleteEntry(entry),
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
                  onClick: () => handleToggleEntityVisibility(entry),
                },
              ]}
            />
          )
        }
      >
        {isUnassigned ? (
          <div className="space-y-1">
            <select
              value=""
              onChange={e => handleAssignEntity(entry, e.target.value)}
              disabled={isAssigning}
              className="w-full rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-input)] px-2 py-1.5 text-xs text-[var(--dash-text)] disabled:opacity-50"
            >
              <option value="">Assegna a...</option>
              {campaigns.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {isAssigning && <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--dash-muted)]" />}
            {assignError && <p className="text-[11px] text-red-300">{assignError}</p>}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 truncate text-[11px] text-[var(--dash-accent-2)]">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{campaignName}</span>
          </div>
        )}
      </EntityCard>
    );
  };

  // sezione toolbar+griglia condivisa da tab PNG e tab Mostri (stessa struttura, sorgente dati diversa)
  const renderEntityTab = (params: {
    entries: CatalogEntry[];
    filter: EntityFilter;
    setFilter: (f: EntityFilter) => void;
    sort: SortMode;
    setSort: (s: SortMode) => void;
    isLoading: boolean;
    labelSingular: string; // "PNG" / "mostro"
    labelPluralLower: string; // "PNG" / "mostri"
  }) => {
    const { entries, filter, setFilter, sort, setSort, isLoading, labelSingular, labelPluralLower } = params;
    const assigned = entries.filter(e => e.entity.campaignId);
    const unassigned = entries.filter(e => !e.entity.campaignId);
    const filtered = sortEntries(filterEntries(entries, filter), sort);

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={sort}
            onChange={e => setSort(e.target.value as SortMode)}
            className="rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-input)] px-3 py-1.5 text-xs text-[var(--dash-text)]"
          >
            <option value="recent">Ordina: Più recenti</option>
            <option value="name">Ordina: Nome (A-Z)</option>
          </select>

          <button type="button" onClick={() => setFilter('all')} className={pillClass(filter === 'all')}>
            Tutti <span className="opacity-70">({entries.length})</span>
          </button>
          <button type="button" onClick={() => setFilter('assigned')} className={pillClass(filter === 'assigned')}>
            In campagna <span className="opacity-70">({assigned.length})</span>
          </button>
          <button type="button" onClick={() => setFilter('unassigned')} className={pillClass(filter === 'unassigned')}>
            Non in campagna <span className="opacity-70">({unassigned.length})</span>
          </button>
          <button type="button" className={pillClass(false, true)} disabled title={`In arrivo: filtro per ${labelPluralLower} richiedibili dai giocatori`}>
            Richiedibile
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[var(--dash-muted)]" /></div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--dash-border-soft)] bg-[var(--dash-surface)]/60 px-6 py-12 text-center">
            <p className="text-sm text-[var(--dash-muted)]">
              {entries.length === 0
                ? `Non hai ancora creato nessun ${labelSingular}.`
                : filter === 'assigned'
                  ? `Nessun ${labelSingular} in campagna con questo filtro.`
                  : filter === 'unassigned'
                    ? `Nessun ${labelSingular} scollegato da una campagna.`
                    : `Nessun ${labelSingular} trovato.`}
            </p>
          </div>
        ) : (
          <div className={GRID_CLASS}>
            {filtered.map(entry => renderEntityCard(entry))}
          </div>
        )}
      </div>
    );
  };

  const npcEntries = npcs.map((entity): CatalogEntry => ({ kind: 'npc', entity }));
  const monsterEntries = monsters.map((entity): CatalogEntry => ({ kind: 'monster', entity }));

  const tabLabel = (tab: ActiveTab) =>
    tab === 'characters' ? 'Personaggi giocanti' : tab === 'npcs' ? 'PNG' : 'Mostri';

  return (
    <div className="space-y-6 select-none">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-1">
          {(['characters', 'npcs', 'monsters'] as const).map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-[var(--dash-accent)] text-[var(--dash-text-strong)]'
                  : 'text-[var(--dash-muted)] hover:text-[var(--dash-text)]'
              }`}
            >
              {tabLabel(tab)}
            </button>
          ))}
        </div>

        {activeTab === 'characters' && (
          <button type="button" onClick={() => { setEditingCharacter(null); setShowWizard(true); }}
            className="group inline-flex items-center gap-2 rounded-2xl border border-[var(--dash-accent)] bg-[var(--dash-accent)] px-5 py-2.5 text-sm font-semibold text-[var(--dash-text-strong)] shadow-lg shadow-black/20 transition-colors hover:bg-[var(--dash-accent-2)]">
            <Plus className="h-4 w-4 group-hover:animate-[plusPulse_0.75s_ease-in-out_infinite]" /> Nuovo personaggio
          </button>
        )}
      </div>

      {activeTab === 'characters' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={charSort}
              onChange={e => setCharSort(e.target.value as SortMode)}
              className="rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-input)] px-3 py-1.5 text-xs text-[var(--dash-text)]"
            >
              <option value="recent">Ordina: Più recenti</option>
              <option value="name">Ordina: Nome (A-Z)</option>
            </select>

            <button type="button" onClick={() => setCharFilter('all')} className={pillClass(charFilter === 'all')}>
              Tutti <span className="opacity-70">({characters.length})</span>
            </button>
            <button type="button" onClick={() => setCharFilter('assigned')} className={pillClass(charFilter === 'assigned')}>
              In campagna <span className="opacity-70">({assignedCharacters.length})</span>
            </button>
            <button type="button" onClick={() => setCharFilter('unassigned')} className={pillClass(charFilter === 'unassigned')}>
              Non in campagna <span className="opacity-70">({unassignedCharacters.length})</span>
            </button>
            <button type="button" className={pillClass(false, true)} disabled title="In arrivo: filtro per personaggi richiedibili dagli altri giocatori">
              Richiedibile
            </button>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[var(--dash-muted)]" /></div>
          ) : filteredCharacters.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--dash-border-soft)] bg-[var(--dash-surface)]/60 px-6 py-12 text-center">
              <p className="text-sm text-[var(--dash-muted)]">
                {characters.length === 0
                  ? 'Non hai ancora creato nessun personaggio.'
                  : charFilter === 'assigned'
                    ? 'Nessun personaggio in campagna con questo filtro.'
                    : charFilter === 'unassigned'
                      ? 'Nessun personaggio scollegato da una campagna.'
                      : 'Nessun personaggio trovato.'}
              </p>
            </div>
          ) : (
            <div className={GRID_CLASS}>
              {filteredCharacters.map(char => renderCharacterCard(char))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'npcs' && renderEntityTab({
        entries: npcEntries,
        filter: npcFilter,
        setFilter: setNpcFilter,
        sort: npcSort,
        setSort: setNpcSort,
        isLoading: isLoadingNpcs,
        labelSingular: 'PNG',
        labelPluralLower: 'PNG',
      })}

      {activeTab === 'monsters' && renderEntityTab({
        entries: monsterEntries,
        filter: monsterFilter,
        setFilter: setMonsterFilter,
        sort: monsterSort,
        setSort: setMonsterSort,
        isLoading: isLoadingMonsters,
        labelSingular: 'mostro',
        labelPluralLower: 'mostri',
      })}

      {showWizard && (
        <CharacterCreationWizard
          onClose={() => { setShowWizard(false); setEditingCharacter(null); }}
          onAdd={handleAdd}
          existingCharacters={characters.filter(c => c.id !== editingCharacter?.id).map(c => ({ id: c.id, name: c.name }))}
          initialCharacter={editingCharacter}
        />
      )}

      {detailCharacter && (
        <CharacterDetailModal
          character={detailCharacter}
          onClose={() => setDetailCharacter(null)}
          onUpdate={(updated) => {
            setDetailCharacter(updated);
            persistCharacter(updated.id, updated);
          }}
        />
      )}

      {deleteTargetId && (
        <ConfirmDialog
          title="Eliminare il personaggio?"
          message="Questa azione non è reversibile. Il personaggio e tutti i suoi dati verranno eliminati definitivamente."
          confirmLabel="Elimina"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTargetId(null)}
        />
      )}

      {unassignEntry && (
        <ConfirmDialog
          title={`Rimuovere ${unassignEntry.kind === 'monster' ? 'il mostro' : 'il PNG'} dalla campagna?`}
          message={`${entityName(unassignEntry)} verrà scollegato da questa campagna. Potrai ritrovarlo e riassegnarlo qui, nella tab "${unassignEntry.kind === 'monster' ? 'Mostri' : 'PNG'}" → "Non in campagna".`}
          confirmLabel="Rimuovi"
          danger={false}
          onConfirm={handleConfirmUnassignEntity}
          onCancel={() => setUnassignEntry(null)}
        />
      )}

      {deleteEntry && (
        <ConfirmDialog
          title={`Eliminare definitivamente ${entityName(deleteEntry)}?`}
          message="Questa azione non può essere annullata e cancellerà anche tutte le sue tab, comprese quelle nascoste."
          confirmLabel="Elimina definitivamente"
          onConfirm={handleConfirmDeleteEntity}
          onCancel={() => setDeleteEntry(null)}
        />
      )}

      {copyDialogEntry && (
        <div
          className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/80 p-4"
          onClick={() => { setCopyDialogEntry(null); setCopyTargetId(null); }}
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
              {compatibleCopyCampaigns(copyDialogEntry).length === 0 ? (
                <p className="text-sm" style={{ color: menuColors.text, opacity: 0.6 }}>
                  Nessuna campagna compatibile trovata (stesso regolamento, diversa da quella attuale).
                </p>
              ) : (
                compatibleCopyCampaigns(copyDialogEntry).map((c) => (
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

            {copyError && <p className="mb-3 text-xs text-red-300">{copyError}</p>}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setCopyDialogEntry(null); setCopyTargetId(null); }}
                style={{ border: `1px solid ${menuColors.border}`, color: menuColors.text }}
                className="rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleConfirmCopyEntity}
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
    </div>
  );
}
