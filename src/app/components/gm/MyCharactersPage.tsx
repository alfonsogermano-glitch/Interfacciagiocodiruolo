import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus, Loader2, Pencil, Trash2, KeyRound, MoreVertical,
  Copy, UserMinus, Search, Eye, EyeOff, MapPin, ArrowLeft, Sparkles
} from 'lucide-react';
import { useAuth, supabase } from '../../auth/AuthContext';
import { useCampaign } from '../../campaigns/CampaignContext';
import { useRuleset } from '../../campaigns/RulesetContext';
import { isRulesetCompatible, VISIBLE_RULESETS, type RulesetId } from '../../campaigns/campaignTypes';
import { RulesetPickerDialog } from '../../campaigns/RulesetPickerDialog';
import { RulesetTag } from '../shared/RulesetTag';
import { CharacterCreationWizard } from './CharacterCreationWizard';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { EntityCard } from '../session/shared/EntityCard';
import { EntityKebabMenu } from '../session/shared/EntityKebabMenu';
import { EntityFilterToolbar, type SortMode, type ViewMode } from '../session/shared/EntityFilterToolbar';
import { EntityPagination, paginateItems } from '../session/shared/EntityPagination';
import { EntityDetailView } from '../session/shared/EntityDetailView';
import { EntityDetailRail, type EntityDetailRailSection } from '../session/shared/EntityDetailRail';
import { SlideOverPanel } from '../session/SlideOverPanel';
import { loadCharactersByOwner, saveCharacter, deleteCharacter } from '../../../services/supabase/charactersService';
import {
  loadNPCsByOwner, loadMonstersByOwner, loadAdventures,
  assignNPCToCampaign, assignMonsterToCampaign,
  unassignNPCFromCampaign, unassignMonsterFromCampaign,
  copyNPCToCampaign, copyMonsterToCampaign,
  deleteNPC, deleteMonster,
  saveNPC, saveMonster,
  type NPC, type Monster
} from '../../../services/supabase/entitiesService';
import { createEmptyMonster } from './monsters/monstersUtils';
import type { Character } from '../../../types/character';
import type { Adventure } from '../../../types/adventure';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { PALETTE_COLORS, DEFAULT_PALETTE_COLORS, type PaletteId } from '../ui/paletteColors';
import { generateUUID } from '../../../lib/uuid';

const SERVER_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-771c5bfd`;
const INVITE_OPTION_VALUE = '__invite__';

type OwnedCharacter = Character & { player: string; notes: string; ownerProfileId: string; campaignId: string | null; ruleset: RulesetId | null };
type CatalogEntry = { kind: 'npc'; entity: NPC } | { kind: 'monster'; entity: Monster };
type EntityFilter = 'all' | 'assigned' | 'unassigned';
type ActiveTab = 'characters' | 'npcs' | 'monsters';

// Occupa tutta la larghezza di <main>, nessun contenitore centrato: con
// filtri/paginazione/vista lista-o-griglia ormai a disposizione non ha piu'
// senso limitare artificialmente lo spazio orizzontale. Usato anche per la
// barra di paginazione, cosi' resta allineata alla griglia/lista sopra.
const GRID_CONTAINER_CLASS = 'w-full';
// auto-fill invece di un numero di colonne fisso: le card mantengono la
// loro larghezza naturale (minmax) e le colonne vuote restano vuote invece
// di stirare le card esistenti a riempire la riga - stesso effetto dei
// vecchi segnaposto di withPlaceholders, ma nativo del grid e senza il
// numero di colonne bloccato a 3.
// Tetto di 4 colonne senza reintrodurre un max-width sul contenitore
// (tecnica "RAM": il minimo della minmax e' il piu' grande tra 300px e
// (100% - 3 gap da gap-4/1rem) / 4 colonne). Sotto quella soglia il max()
// resta 300px e la griglia si comporta come prima (1-2-3-4 colonne in base
// allo spazio); oltre, il minimo cresce insieme alla larghezza cosi' le 4
// colonne restano sempre esattamente 4, mai di piu', su schermi larghi.
const GRID_CLASS =
  'grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(max(300px,calc((100%_-_3rem)/4)),1fr))]';
// Stessa larghezza piena di GRID_CONTAINER_CLASS - un cap qui ricreava
// esattamente i margini laterali vuoti che avevamo tolto dalla griglia.
// L'eventuale spazio vuoto interno a una riga va risolto nella
// distribuzione interna di EntityCard (variant "list"), non qui.
const LIST_CONTAINER_CLASS = 'w-full';

// Deve combaciare con la larghezza reale di EntityDetailRail (w-20 = 5rem),
// che qui (standalone, non in sessione) fa da rail destra ancorata al bordo
// schermo mentre il pannello dettaglio e' aperto. Vedi SESSION_SIDEBAR_WIDTH
// in SlideOverPanel.tsx per l'equivalente lato sessione (anch'essa w-20 = 5rem,
// stesso sistema unico di rail contestuale).
const CHARACTERS_RAIL_WIDTH = '5rem';

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

function sortByNameOrDate<T extends { name: string; createdAt?: string; updatedAt?: string }>(items: T[], mode: SortMode): T[] {
  const copy = [...items];
  if (mode === 'name') {
    copy.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'it', { sensitivity: 'base' }));
  } else if (mode === 'name-desc') {
    copy.sort((a, b) => (b.name || '').localeCompare(a.name || '', 'it', { sensitivity: 'base' }));
  } else if (mode === 'oldest') {
    copy.sort((a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime());
  } else if (mode === 'updated') {
    copy.sort((a, b) => new Date(b.updatedAt ?? b.createdAt ?? 0).getTime() - new Date(a.updatedAt ?? a.createdAt ?? 0).getTime());
  } else {
    copy.sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
  }
  return copy;
}

function sortEntries(items: CatalogEntry[], mode: SortMode): CatalogEntry[] {
  const copy = [...items];
  if (mode === 'name') {
    copy.sort((a, b) => (a.entity.name || '').localeCompare(b.entity.name || '', 'it', { sensitivity: 'base' }));
  } else if (mode === 'name-desc') {
    copy.sort((a, b) => (b.entity.name || '').localeCompare(a.entity.name || '', 'it', { sensitivity: 'base' }));
  } else if (mode === 'oldest') {
    copy.sort((a, b) => new Date(a.entity.createdAt ?? 0).getTime() - new Date(b.entity.createdAt ?? 0).getTime());
  } else if (mode === 'updated') {
    copy.sort((a, b) => new Date(b.entity.updatedAt ?? b.entity.createdAt ?? 0).getTime() - new Date(a.entity.updatedAt ?? a.entity.createdAt ?? 0).getTime());
  } else {
    copy.sort((a, b) => new Date(b.entity.createdAt ?? 0).getTime() - new Date(a.entity.createdAt ?? 0).getTime());
  }
  return copy;
}

function filterEntries(
  all: CatalogEntry[],
  filter: EntityFilter,
  campaignFilterId: string,
  adventureFilterId: string,
  rulesetFilterId: string
): CatalogEntry[] {
  let result = all;
  if (filter === 'assigned') result = result.filter(e => e.entity.campaignId);
  if (filter === 'unassigned') result = result.filter(e => !e.entity.campaignId);
  if (campaignFilterId) result = result.filter(e => e.entity.campaignId === campaignFilterId);
  if (adventureFilterId) result = result.filter(e => e.entity.adventureId === adventureFilterId);
  // Confronto diretto (non isRulesetCompatible, che tratta ruleset null come
  // "jolly" per la validazione di assegnazione): qui, quando l'utente sceglie
  // un set di regole specifico, un'entita' senza ruleset confermato (dato
  // legacy non ancora backfillato) va esclusa - non e' verificato che
  // appartenga a quel set. "Tutti i set di regole" (stringa vuota) non
  // filtra affatto, quindi le entita' null restano visibili in quel caso.
  if (rulesetFilterId) result = result.filter(e => e.entity.ruleset === rulesetFilterId);
  return result;
}

// Ricerca client-side sui dati gia' caricati, stesso pattern semplice
// (.filter()/.some()) gia' usato in MonstersManager.tsx, adattato ai campi
// rilevanti per ciascun tipo di scheda.
function searchCharacters(items: OwnedCharacter[], query: string): OwnedCharacter[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(char =>
    [char.name, char.style, char.viaggio, char.description]
      .filter(Boolean)
      .some(value => String(value).toLowerCase().includes(q))
  );
}

function searchEntries(items: CatalogEntry[], query: string): CatalogEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(({ entity }) =>
    [entity.name, entity.description, entity.attacco, entity.difesa]
      .filter(Boolean)
      .some(value => String(value).toLowerCase().includes(q))
  );
}

type DetailContext = { entityType: 'character' | 'npc' | 'monster'; id: string };

interface MyCharactersPageProps {
  // Lo stato del pannello dettaglio e' sollevato in App.tsx (rightSidebarContext)
  // solo perche' deve sopravvivere al cambio di tab GM; il rendering pero'
  // resta tutto qui (overlay fixed + rail), cosi' non tocca la larghezza
  // flex di <main> in AppShell. Vedi il commento su RightSidebarContext in App.tsx.
  detailContext: DetailContext | null;
  onOpenDetail: (entityType: DetailContext['entityType'], id: string) => void;
  onCloseDetail: () => void;
}

export function MyCharactersPage({ detailContext, onOpenDetail, onCloseDetail }: MyCharactersPageProps) {
  const { user, session } = useAuth();
  const { campaigns, joinedCampaigns, refreshCampaigns, refreshJoinedCampaigns } = useCampaign();
  const { isHSC } = useRuleset();

  const [activeTab, setActiveTab] = useState<ActiveTab>('characters');

  // ============= Personaggi giocanti =============

  const [characters, setCharacters] = useState<OwnedCharacter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<OwnedCharacter | null>(null);
  // Creazione PG: prima si sceglie il regolamento (stesso picker di
  // HomeScreen.tsx), poi si apre il wizard. In modifica (editingCharacter
  // gia' impostato) il picker resta saltato: il ruleset esistente si
  // preserva da solo, vedi handleAdd.
  const [showCharacterRulesetPicker, setShowCharacterRulesetPicker] = useState(false);
  const [newCharacterRuleset, setNewCharacterRuleset] = useState<RulesetId | null>(null);
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
  const [charSearch, setCharSearch] = useState('');
  const [charViewMode, setCharViewMode] = useState<ViewMode>('grid');
  const [charFiltersOpen, setCharFiltersOpen] = useState(false);
  const [charCampaignFilter, setCharCampaignFilter] = useState('');
  const [charRulesetFilter, setCharRulesetFilter] = useState('');
  const [charPage, setCharPage] = useState(1);
  const [charPageSize, setCharPageSize] = useState<number>(12);

  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const loadSeqRef = useRef(0);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (message: string) => {
    setToastMessage(message);
    window.setTimeout(() => setToastMessage(null), 4000);
  };

  // EntityDetailRail e' montata qui separatamente da EntityDetailView
  // (rightSidebar fisso, vedi sotto) invece che al suo interno: la sezione
  // attiva va sollevata qui per essere condivisa da entrambe le istanze.
  const [railSection, setRailSection] = useState<EntityDetailRailSection>('scheda');
  useEffect(() => { setRailSection('scheda'); }, [detailContext?.id]);

  const allCampaignOptions = [
    ...campaigns.map(c => ({ id: c.id, name: c.name, ruleset: c.ruleset, suffix: '(tua campagna)' })),
    ...joinedCampaigns.map(c => ({ id: c.id, name: c.name, ruleset: c.ruleset, suffix: '(partecipi)' })),
  ];

  // Ruleset "effettivo" di un'entita' per i confronti di compatibilita':
  // quello dell'entita' se noto, altrimenti quello della campagna a cui e'
  // gia' assegnata (dato transitorio non ancora backfillato), vedi
  // isRulesetCompatible in campaignTypes.ts.
  const rulesetCompatibleCampaignOptions = (entityRuleset: RulesetId | null | undefined, sourceCampaignId: string | null) => {
    const sourceCampaign = sourceCampaignId
      ? [...campaigns, ...joinedCampaigns].find(c => c.id === sourceCampaignId)
      : undefined;
    return allCampaignOptions.filter(c => isRulesetCompatible(entityRuleset, sourceCampaign?.ruleset, c.ruleset));
  };

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
    const ruleset = editingCharacter ? (editingCharacter.ruleset ?? undefined) : (newCharacterRuleset ?? undefined);
    await saveCharacter(editingCharacter?.campaignId ?? null, character, user.id, ruleset);
    setShowWizard(false);
    setEditingCharacter(null);
    setNewCharacterRuleset(null);
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
        await saveCharacter(updatedChar.campaignId, updatedChar, user?.id ?? '', updatedChar.ruleset ?? undefined);
      } catch (error) {
        console.error('Errore salvataggio personaggio su Supabase:', error);
        // Il trigger characters_lock_origins_in_campaign rifiuta lato DB le
        // modifiche a Stile/Viaggio/Legame/Tutore/Tipo Speciale/Tratti quando
        // il personaggio e' gia' in campagna: il fieldset disabled della tab
        // "Origini" dovrebbe gia' impedirlo, quindi qui e' un caso limite
        // (race condition con un'assegnazione concorrente, o un bypass) -
        // avvisiamo l'utente invece di lasciare l'update ottimistico
        // (gia' applicato in setCharacters sopra) silenziosamente disallineato
        // dal DB, e ricarichiamo per tornare allo stato reale.
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('ORIGINI_LOCKED')) {
          showToast('Non è stato possibile salvare: il personaggio è già in una campagna, la scheda "Origini" è di sola lettura. Le modifiche non salvate sono state annullate.');
          await load();
        }
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
  const charFilterPool = (charFilter === 'assigned' ? assignedCharacters : charFilter === 'unassigned' ? unassignedCharacters : characters)
    .filter(c => !charCampaignFilter || c.campaignId === charCampaignFilter)
    // Confronto diretto, non isRulesetCompatible: qui un PG senza ruleset
    // confermato va escluso quando si filtra per un set specifico, vedi
    // stessa nota in filterEntries() per PNG/Mostri.
    .filter(c => !charRulesetFilter || c.ruleset === charRulesetFilter);
  const filteredCharacters = sortByNameOrDate(searchCharacters(charFilterPool, charSearch), charSort);
  const {
    pageItems: pagedCharacters,
    totalPages: charTotalPages,
    safePage: charSafePage,
    startIndex: charStartIndex,
    endIndex: charEndIndex,
  } = paginateItems(filteredCharacters, charPage, charPageSize);

  const renderCharacterCard = (char: OwnedCharacter, variant: ViewMode = 'grid') => {
    const isPending = pendingCharacterId === char.id;
    const isInviteMode = inviteModeFor === char.id;
    const error = assignErrors[char.id];
    const isMenuOpen = openMenuFor === char.id;
    const campaignInfo = campaignInfoFor(char.campaignId);
    // stesso formato di SessionCharactersPanel.tsx:673-675 ({style} · {viaggio})
    const styleViaggio = [char.style, char.viaggio].filter(Boolean).join(' · ') || 'Personaggio';

    return (
      <EntityCard
        key={char.id}
        variant={variant}
        name={char.name}
        subtitle={styleViaggio}
        badge={<RulesetTag rulesetId={char.ruleset ?? 'hsc'} />}
        secondaryText={char.description}
        photoUrl={char.portraitImageUrl || user?.avatarUrl}
        tokenColor={char.tokenColor}
        tokenBackgroundColor={char.tokenBackgroundColor}
        tokenBorderStyle={char.tokenBorderStyle}
        tokenBorderThickness={char.tokenBorderThickness}
        tokenBorderVisible={char.tokenBorderVisible}
        tokenBorderLabel={char.tokenBorderLabel}
        onClick={() => onOpenDetail('character', char.id)}
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
                  {rulesetCompatibleCampaignOptions(char.ruleset, char.campaignId).map(c => (
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
  const [showNpcRulesetPicker, setShowNpcRulesetPicker] = useState(false);
  const [npcFilter, setNpcFilter] = useState<EntityFilter>('all');
  const [npcSort, setNpcSort] = useState<SortMode>('recent');
  const [npcSearch, setNpcSearch] = useState('');
  const [npcViewMode, setNpcViewMode] = useState<ViewMode>('grid');
  const [npcFiltersOpen, setNpcFiltersOpen] = useState(false);
  const [npcCampaignFilter, setNpcCampaignFilter] = useState('');
  const [npcAdventureFilter, setNpcAdventureFilter] = useState('');
  const [npcRulesetFilter, setNpcRulesetFilter] = useState('');
  const [npcFilterAdventures, setNpcFilterAdventures] = useState<Adventure[]>([]);
  const [npcPage, setNpcPage] = useState(1);
  const [npcPageSize, setNpcPageSize] = useState<number>(12);
  // Bozza di un nuovo PNG aperta da "+ Nuovo PNG": resta solo qui, non entra
  // in npcs ne' viene scritta su Supabase, finche' il nome resta vuoto (vedi
  // handleNpcDetailUpdate/handleCloseDetail sotto). Cosi' chiudere l'overlay
  // senza aver scritto un nome non lascia righe orfane sul DB.
  const [draftNpc, setDraftNpc] = useState<NPC | null>(null);

  // ============= Mostri =============

  const [monsters, setMonsters] = useState<Monster[]>([]);
  const [isLoadingMonsters, setIsLoadingMonsters] = useState(true);
  const [monsterFilter, setMonsterFilter] = useState<EntityFilter>('all');
  const [monsterSort, setMonsterSort] = useState<SortMode>('recent');
  const [monsterSearch, setMonsterSearch] = useState('');
  const [monsterViewMode, setMonsterViewMode] = useState<ViewMode>('grid');
  const [monsterFiltersOpen, setMonsterFiltersOpen] = useState(false);
  const [monsterCampaignFilter, setMonsterCampaignFilter] = useState('');
  const [monsterAdventureFilter, setMonsterAdventureFilter] = useState('');
  const [monsterRulesetFilter, setMonsterRulesetFilter] = useState('');
  const [monsterFilterAdventures, setMonsterFilterAdventures] = useState<Adventure[]>([]);
  const [monsterPage, setMonsterPage] = useState(1);
  const [monsterPageSize, setMonsterPageSize] = useState<number>(12);
  const [showMonsterRulesetPicker, setShowMonsterRulesetPicker] = useState(false);
  // Bozza di un nuovo Mostro aperta da "+ Nuovo Mostro": stesso pattern di
  // draftNpc sopra - resta solo qui, non entra in monsters ne' viene
  // scritta su Supabase, finche' il nome resta vuoto (vedi
  // handleMonsterDetailUpdate/handleCloseDetail sotto).
  const [draftMonster, setDraftMonster] = useState<Monster | null>(null);

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

  // Le avventure sono sempre scoped a una singola campagna (loadAdventures
  // richiede un campaignId) - il filtro Avventura del pannello Filtri ha
  // senso solo quando e' gia' selezionata una campagna specifica, quindi
  // ricarichiamo la lista ogni volta che cambia quella scelta e la
  // svuotiamo (con l'eventuale filtro attivo) quando torna su "tutte".
  useEffect(() => {
    if (!npcCampaignFilter) {
      setNpcFilterAdventures([]);
      setNpcAdventureFilter('');
      return;
    }
    let cancelled = false;
    loadAdventures(npcCampaignFilter).then(list => {
      if (!cancelled) setNpcFilterAdventures(list);
    });
    setNpcAdventureFilter('');
    return () => { cancelled = true; };
  }, [npcCampaignFilter]);

  useEffect(() => {
    if (!monsterCampaignFilter) {
      setMonsterFilterAdventures([]);
      setMonsterAdventureFilter('');
      return;
    }
    let cancelled = false;
    loadAdventures(monsterCampaignFilter).then(list => {
      if (!cancelled) setMonsterFilterAdventures(list);
    });
    setMonsterAdventureFilter('');
    return () => { cancelled = true; };
  }, [monsterCampaignFilter]);

  // Torna a pagina 1 ogni volta che ricerca/filtri/ordinamento cambiano,
  // stesso comportamento di MonstersManager.tsx (altrimenti si potrebbe
  // restare su una pagina che i nuovi risultati non hanno piu').
  useEffect(() => { setCharPage(1); }, [charSearch, charFilter, charCampaignFilter, charRulesetFilter, charSort, charPageSize]);
  useEffect(() => { setNpcPage(1); }, [npcSearch, npcFilter, npcCampaignFilter, npcAdventureFilter, npcRulesetFilter, npcSort, npcPageSize]);
  useEffect(() => { setMonsterPage(1); }, [monsterSearch, monsterFilter, monsterCampaignFilter, monsterAdventureFilter, monsterRulesetFilter, monsterSort, monsterPageSize]);

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

  // Salvataggio immediato (nessun debounce, come in SessionCharactersPanel)
  // usato da EntityDetailView quando aperta su un PNG/Mostro dal catalogo.
  const persistEntity = (entityType: 'npc' | 'monster', updated: NPC | Monster) => {
    if (entityType === 'npc') {
      setNpcs(prev => prev.map(n => (n.id === updated.id ? (updated as NPC) : n)));
      saveNPC(updated.campaignId ?? '', updated as NPC).catch(err => console.error('Errore salvataggio PNG:', err));
    } else {
      setMonsters(prev => prev.map(m => (m.id === updated.id ? (updated as Monster) : m)));
      saveMonster(updated.campaignId ?? '', updated as Monster).catch(err => console.error('Errore salvataggio mostro:', err));
    }
  };

  const createEmptyNpcDraft = (ruleset: RulesetId): NPC => ({
    id: generateUUID(),
    campaignId: null,
    ruleset,
    environmentId: null,
    adventureId: null,
    name: '',
    role: '',
    description: '',
    personality: '',
    secrets: '',
    location: '',
    portraitImageUrl: '',
    mapLocationId: null,
    customLocationName: '',
    freschezza: null,
    maxFreschezza: null,
    caselleFrischezzaCruciali: [],
    attacco: '',
    difesa: '',
    tratti: [],
    trattiPersonalizzati: [],
    azioniSpeciali: [],
    azioniSpecialiPersonalizzate: [],
    puntoDebole: '',
    ownerProfileId: user?.id,
  });

  const handleOpenNewNpc = (ruleset: RulesetId) => {
    const draft = createEmptyNpcDraft(ruleset);
    setDraftNpc(draft);
    onOpenDetail('npc', draft.id);
  };

  // Finche' la bozza non ha un nome resta solo qui (nessuna scrittura su
  // Supabase). Alla prima modifica con nome non vuoto viene "promossa":
  // entra in npcs e si salva - da quel momento le modifiche successive
  // passano dal normale persistEntity() (id gia' presente in npcs).
  const handleNpcDetailUpdate = (updated: NPC) => {
    if (draftNpc && updated.id === draftNpc.id) {
      if (!updated.name.trim()) {
        setDraftNpc(updated);
        return;
      }
      setDraftNpc(null);
      setNpcs(prev => [...prev, updated]);
      saveNPC(updated.campaignId ?? null, updated).catch(err => console.error('Errore salvataggio PNG:', err));
      return;
    }
    persistEntity('npc', updated);
  };

  const handleOpenNewMonster = (ruleset: RulesetId) => {
    const draft = createEmptyMonster('', user?.id, ruleset);
    setDraftMonster(draft);
    onOpenDetail('monster', draft.id);
  };

  // Stessa logica di promozione di handleNpcDetailUpdate: finche' il nome
  // resta vuoto la bozza aggiorna solo lo stato locale, alla prima modifica
  // con nome non vuoto entra in monsters e si salva. Il draft ha sempre
  // campaignId stringa ('' se non assegnato, mai null/undefined), quindi
  // saveMonster() non richiede alcun fallback qui.
  const handleMonsterDetailUpdate = (updated: Monster) => {
    if (draftMonster && updated.id === draftMonster.id) {
      if (!updated.name.trim()) {
        setDraftMonster(updated);
        return;
      }
      setDraftMonster(null);
      setMonsters(prev => [...prev, updated]);
      saveMonster(updated.campaignId, updated).catch(err => console.error('Errore salvataggio mostro:', err));
      return;
    }
    persistEntity('monster', updated);
  };

  // Chiude l'overlay e scarta un'eventuale bozza PNG/Mostro mai promossa
  // (mai scritta su Supabase, quindi niente da ripulire lato server).
  const handleCloseDetail = () => {
    setDraftNpc(null);
    setDraftMonster(null);
    onCloseDetail();
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
    const targetCampaign = campaigns.find(c => c.id === targetCampaignId);
    if (!targetCampaign) return;
    setEntityAssigningId(entry.entity.id);
    setEntityAssignErrors(prev => ({ ...prev, [entry.entity.id]: '' }));

    try {
      if (entry.kind === 'npc') {
        await assignNPCToCampaign(entry.entity.id, entry.entity.ruleset, targetCampaign);
      } else {
        await assignMonsterToCampaign(entry.entity.id, entry.entity.ruleset, targetCampaign);
      }

      applyEntityUpdate(entry, e => ({ ...e, campaignId: targetCampaignId, ruleset: e.ruleset ?? targetCampaign.ruleset }));
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
    return campaigns.filter(c => c.id !== entry.entity.campaignId && isRulesetCompatible(entry.entity.ruleset, sourceCampaign?.ruleset, c.ruleset));
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

  const renderEntityCard = (entry: CatalogEntry, variant: ViewMode = 'grid') => {
    const { entity, kind } = entry;
    const name = entityName(entry);
    const typeLabel = kind === 'npc' ? (entity as NPC).role || 'PNG' : 'Mostro';
    const campaignName = entityCampaignName(entity.campaignId);
    const photoUrl = kind === 'npc'
      ? (entity as NPC).portraitImageUrl
      : (entity as Monster).portraitImageUrl;
    const isUnassigned = !entity.campaignId;
    const assignError = entityAssignErrors[entity.id];
    const isAssigning = entityAssigningId === entity.id;

    return (
      <EntityCard
        key={`${kind}-${entity.id}`}
        variant={variant}
        name={name}
        subtitle={typeLabel}
        badge={<RulesetTag rulesetId={entity.ruleset ?? 'hsc'} />}
        photoUrl={photoUrl}
        hiddenBadge={!entity.visibleToPlayers}
        tokenColor={entity.tokenColor}
        tokenBackgroundColor={entity.tokenBackgroundColor}
        tokenBorderStyle={entity.tokenBorderStyle}
        tokenBorderThickness={entity.tokenBorderThickness}
        tokenBorderVisible={entity.tokenBorderVisible}
        tokenBorderLabel={entity.tokenBorderLabel}
        onClick={() => onOpenDetail(kind, entity.id)}
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
              {campaigns.filter(c => isRulesetCompatible(entity.ruleset, null, c.ruleset)).map(c => (
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
    search: string;
    setSearch: (s: string) => void;
    viewMode: ViewMode;
    setViewMode: (v: ViewMode) => void;
    isLoading: boolean;
    labelSingular: string; // "PNG" / "mostro"
    labelPluralLower: string; // "PNG" / "mostri"
    campaignFilter: string;
    setCampaignFilter: (id: string) => void;
    adventureFilter: string;
    setAdventureFilter: (id: string) => void;
    filterAdventures: Adventure[];
    rulesetFilter: string;
    setRulesetFilter: (id: string) => void;
    filtersOpen: boolean;
    setFiltersOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
    page: number;
    setPage: (p: number) => void;
    pageSize: number;
    setPageSize: (s: number) => void;
  }) => {
    const {
      entries, filter, setFilter, sort, setSort, search, setSearch, viewMode, setViewMode, isLoading, labelSingular, labelPluralLower,
      campaignFilter, setCampaignFilter, adventureFilter, setAdventureFilter, filterAdventures,
      rulesetFilter, setRulesetFilter,
      filtersOpen, setFiltersOpen, page, setPage, pageSize, setPageSize,
    } = params;
    const assigned = entries.filter(e => e.entity.campaignId);
    const unassigned = entries.filter(e => !e.entity.campaignId);
    const filtered = sortEntries(searchEntries(filterEntries(entries, filter, campaignFilter, adventureFilter, rulesetFilter), search), sort);
    const { pageItems: paged, totalPages, safePage, startIndex, endIndex } = paginateItems(filtered, page, pageSize);

    return (
      <div className="space-y-4">
        <EntityFilterToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder={`Cerca ${labelPluralLower}...`}
          sort={sort}
          onSortChange={setSort}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          filtersOpen={filtersOpen}
          onToggleFilters={() => setFiltersOpen(v => !v)}
          filtersPanel={
            <div className="grid gap-3 lg:grid-cols-4">
              <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
                <div className="text-sm font-semibold text-[var(--dash-text-strong)]">Campagna</div>
                <select
                  value={campaignFilter}
                  onChange={e => setCampaignFilter(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-input)] px-3 py-2 text-sm text-[var(--dash-text)]"
                >
                  <option value="">Tutte le campagne</option>
                  {campaigns.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
                <div className="text-sm font-semibold text-[var(--dash-text-strong)]">Avventura</div>
                <select
                  value={adventureFilter}
                  onChange={e => setAdventureFilter(e.target.value)}
                  disabled={!campaignFilter}
                  className="mt-2 w-full rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-input)] px-3 py-2 text-sm text-[var(--dash-text)] disabled:opacity-50"
                >
                  <option value="">Tutte le avventure</option>
                  {filterAdventures.map(a => (
                    <option key={a.id} value={a.id}>{a.title}</option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-[var(--dash-muted)]">
                  {campaignFilter ? 'Solo le avventure della campagna selezionata sopra.' : 'Seleziona prima una campagna: le avventure sono sempre legate a una singola campagna.'}
                </p>
              </div>

              <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
                <div className="text-sm font-semibold text-[var(--dash-text-strong)]">Set di regole</div>
                <select
                  value={rulesetFilter}
                  onChange={e => setRulesetFilter(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-input)] px-3 py-2 text-sm text-[var(--dash-text)]"
                >
                  <option value="">Tutti i set di regole</option>
                  {VISIBLE_RULESETS.map(rs => (
                    <option key={rs.id} value={rs.id}>{rs.name}</option>
                  ))}
                </select>
              </div>

              <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
                <div className="text-sm font-semibold text-[var(--dash-text-strong)]">Parole chiave</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {['Boss', 'Occulti', 'Umanoidi'].map(label => (
                    <button
                      key={label}
                      type="button"
                      className="group relative rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-input)] px-3 py-2 text-xs text-[var(--dash-muted)] transition-colors hover:border-[var(--dash-accent)] hover:text-[var(--dash-text-strong)]"
                    >
                      {label}
                      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-xl border border-[var(--dash-accent)] bg-[var(--dash-panel)] px-3 py-1.5 text-xs text-[var(--dash-text-strong)] shadow-xl group-hover:block">
                        In arrivo: richiede l'assegnazione tag ai {labelPluralLower}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-[var(--dash-muted)]">
                  Questi filtri diventeranno operativi quando aggiungeremo l'assegnazione tag alla scheda.
                </p>
              </div>
            </div>
          }
        >
          <button type="button" onClick={() => setFilter('all')} className={pillClass(filter === 'all')}>
            <Sparkles className="h-3 w-3" />
            Tutti <span className="opacity-70">({entries.length})</span>
          </button>
          <button type="button" onClick={() => setFilter('assigned')} className={pillClass(filter === 'assigned')}>
            <Sparkles className="h-3 w-3" />
            In campagna <span className="opacity-70">({assigned.length})</span>
          </button>
          <button type="button" onClick={() => setFilter('unassigned')} className={pillClass(filter === 'unassigned')}>
            <Sparkles className="h-3 w-3" />
            Non in campagna <span className="opacity-70">({unassigned.length})</span>
          </button>
          <button type="button" className={pillClass(false, true)} disabled title={`In arrivo: filtro per ${labelPluralLower} richiedibili dai giocatori`}>
            Richiedibile
          </button>
        </EntityFilterToolbar>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[var(--dash-muted)]" /></div>
        ) : filtered.length === 0 ? (
          <div className={`${GRID_CONTAINER_CLASS} rounded-2xl border border-dashed border-[var(--dash-border-soft)] bg-[var(--dash-surface)]/60 px-6 py-12 text-center`}>
            <p className="text-sm text-[var(--dash-muted)]">
              {entries.length === 0
                ? `Non hai ancora creato nessun ${labelSingular}.`
                : search.trim()
                  ? `Nessun ${labelSingular} trovato per "${search.trim()}".`
                  : filter === 'assigned'
                    ? `Nessun ${labelSingular} in campagna con questo filtro.`
                    : filter === 'unassigned'
                      ? `Nessun ${labelSingular} scollegato da una campagna.`
                      : `Nessun ${labelSingular} trovato.`}
            </p>
          </div>
        ) : (
          <>
            {viewMode === 'list' ? (
              <div className={LIST_CONTAINER_CLASS}>
                <div className="space-y-2">
                  {paged.map(entry => renderEntityCard(entry, 'list'))}
                </div>
              </div>
            ) : (
              <div className={GRID_CONTAINER_CLASS}>
                <div className={GRID_CLASS}>
                  {paged.map(entry => renderEntityCard(entry))}
                </div>
              </div>
            )}

            <div className={GRID_CONTAINER_CLASS}>
              <EntityPagination
                page={safePage}
                onPageChange={setPage}
                pageSize={pageSize}
                onPageSizeChange={setPageSize}
                totalPages={totalPages}
                startIndex={startIndex}
                endIndex={endIndex}
                totalItems={filtered.length}
                itemLabelPlural={labelPluralLower}
              />
            </div>
          </>
        )}
      </div>
    );
  };

  const npcEntries = npcs.map((entity): CatalogEntry => ({ kind: 'npc', entity }));
  const monsterEntries = monsters.map((entity): CatalogEntry => ({ kind: 'monster', entity }));

  const tabLabel = (tab: ActiveTab) =>
    tab === 'characters' ? 'Personaggi giocanti' : tab === 'npcs' ? 'PNG' : 'Mostri';

  // Derivato dalle liste live (non uno snapshot statico), cosi' la vista
  // rapida resta coerente con eventuali aggiornamenti nel frattempo -
  // stesso pattern di selectedChar/selectedNpc/selectedMonster in
  // SessionCharactersPanel.tsx.
  const detailData: (OwnedCharacter | NPC | Monster) | null =
    detailContext?.entityType === 'character' ? characters.find(c => c.id === detailContext.id) ?? null :
    detailContext?.entityType === 'npc'
      ? npcs.find(n => n.id === detailContext.id) ?? (draftNpc?.id === detailContext.id ? draftNpc : null) :
    detailContext?.entityType === 'monster'
      ? monsters.find(m => m.id === detailContext.id) ?? (draftMonster?.id === detailContext.id ? draftMonster : null) :
    null;

  const isViewingUnsavedNpcDraft = detailContext?.entityType === 'npc' && draftNpc?.id === detailContext.id;
  const isViewingUnsavedMonsterDraft = detailContext?.entityType === 'monster' && draftMonster?.id === detailContext.id;

  return (
    <>
    <div className={`space-y-6 select-none ${detailContext ? 'pointer-events-none' : ''}`}>
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
          <button type="button" onClick={() => { setEditingCharacter(null); setShowCharacterRulesetPicker(true); }}
            className="group inline-flex items-center gap-2 rounded-2xl border border-[var(--dash-accent)] bg-[var(--dash-accent)] px-5 py-2.5 text-sm font-semibold text-[var(--dash-text-strong)] shadow-lg shadow-black/20 transition-colors hover:bg-[var(--dash-accent-2)]">
            <Plus className="h-4 w-4 group-hover:animate-[plusPulse_0.75s_ease-in-out_infinite]" /> Nuovo personaggio
          </button>
        )}

        {activeTab === 'npcs' && (
          <button type="button" onClick={() => setShowNpcRulesetPicker(true)}
            className="group inline-flex items-center gap-2 rounded-2xl border border-[var(--dash-accent)] bg-[var(--dash-accent)] px-5 py-2.5 text-sm font-semibold text-[var(--dash-text-strong)] shadow-lg shadow-black/20 transition-colors hover:bg-[var(--dash-accent-2)]">
            <Plus className="h-4 w-4 group-hover:animate-[plusPulse_0.75s_ease-in-out_infinite]" /> Nuovo PNG
          </button>
        )}

        {activeTab === 'monsters' && (
          <button type="button" onClick={() => setShowMonsterRulesetPicker(true)}
            className="group inline-flex items-center gap-2 rounded-2xl border border-[var(--dash-accent)] bg-[var(--dash-accent)] px-5 py-2.5 text-sm font-semibold text-[var(--dash-text-strong)] shadow-lg shadow-black/20 transition-colors hover:bg-[var(--dash-accent-2)]">
            <Plus className="h-4 w-4 group-hover:animate-[plusPulse_0.75s_ease-in-out_infinite]" /> Nuovo Mostro
          </button>
        )}
      </div>

      {activeTab === 'characters' && (
        <div className="space-y-4">
          <EntityFilterToolbar
            search={charSearch}
            onSearchChange={setCharSearch}
            searchPlaceholder="Cerca personaggi..."
            sort={charSort}
            onSortChange={setCharSort}
            viewMode={charViewMode}
            onViewModeChange={setCharViewMode}
            filtersOpen={charFiltersOpen}
            onToggleFilters={() => setCharFiltersOpen(v => !v)}
            filtersPanel={
              <div className="grid gap-3 lg:grid-cols-4">
                <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
                  <div className="text-sm font-semibold text-[var(--dash-text-strong)]">Campagna</div>
                  <select
                    value={charCampaignFilter}
                    onChange={e => setCharCampaignFilter(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-input)] px-3 py-2 text-sm text-[var(--dash-text)]"
                  >
                    <option value="">Tutte le campagne</option>
                    {allCampaignOptions.map(c => (
                      <option key={c.id} value={c.id}>{c.name} {c.suffix}</option>
                    ))}
                  </select>
                </div>

                <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
                  <div className="text-sm font-semibold text-[var(--dash-text-strong)]">Set di regole</div>
                  <select
                    value={charRulesetFilter}
                    onChange={e => setCharRulesetFilter(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-input)] px-3 py-2 text-sm text-[var(--dash-text)]"
                  >
                    <option value="">Tutti i set di regole</option>
                    {VISIBLE_RULESETS.map(rs => (
                      <option key={rs.id} value={rs.id}>{rs.name}</option>
                    ))}
                  </select>
                </div>

                <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3 lg:col-span-2">
                  <div className="text-sm font-semibold text-[var(--dash-text-strong)]">Parole chiave</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {['Boss', 'Occulti', 'Umanoidi'].map(label => (
                      <button
                        key={label}
                        type="button"
                        className="group relative rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-input)] px-3 py-2 text-xs text-[var(--dash-muted)] transition-colors hover:border-[var(--dash-accent)] hover:text-[var(--dash-text-strong)]"
                      >
                        {label}
                        <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-xl border border-[var(--dash-accent)] bg-[var(--dash-panel)] px-3 py-1.5 text-xs text-[var(--dash-text-strong)] shadow-xl group-hover:block">
                          In arrivo: richiede l'assegnazione tag ai personaggi
                        </span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-[var(--dash-muted)]">
                    Questi filtri diventeranno operativi quando aggiungeremo l'assegnazione tag alla scheda personaggio.
                  </p>
                </div>
              </div>
            }
          >
            <button type="button" onClick={() => setCharFilter('all')} className={pillClass(charFilter === 'all')}>
              <Sparkles className="h-3 w-3" />
              Tutti <span className="opacity-70">({characters.length})</span>
            </button>
            <button type="button" onClick={() => setCharFilter('assigned')} className={pillClass(charFilter === 'assigned')}>
              <Sparkles className="h-3 w-3" />
              In campagna <span className="opacity-70">({assignedCharacters.length})</span>
            </button>
            <button type="button" onClick={() => setCharFilter('unassigned')} className={pillClass(charFilter === 'unassigned')}>
              <Sparkles className="h-3 w-3" />
              Non in campagna <span className="opacity-70">({unassignedCharacters.length})</span>
            </button>
            <button type="button" className={pillClass(false, true)} disabled title="In arrivo: filtro per personaggi richiedibili dagli altri giocatori">
              Richiedibile
            </button>
          </EntityFilterToolbar>

          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[var(--dash-muted)]" /></div>
          ) : filteredCharacters.length === 0 ? (
            <div className={`${GRID_CONTAINER_CLASS} rounded-2xl border border-dashed border-[var(--dash-border-soft)] bg-[var(--dash-surface)]/60 px-6 py-12 text-center`}>
              <p className="text-sm text-[var(--dash-muted)]">
                {characters.length === 0
                  ? 'Non hai ancora creato nessun personaggio.'
                  : charSearch.trim()
                    ? `Nessun personaggio trovato per "${charSearch.trim()}".`
                    : charFilter === 'assigned'
                      ? 'Nessun personaggio in campagna con questo filtro.'
                      : charFilter === 'unassigned'
                        ? 'Nessun personaggio scollegato da una campagna.'
                        : 'Nessun personaggio trovato.'}
              </p>
            </div>
          ) : (
            <>
              {charViewMode === 'list' ? (
                <div className={LIST_CONTAINER_CLASS}>
                  <div className="space-y-2">
                    {pagedCharacters.map(char => renderCharacterCard(char, 'list'))}
                  </div>
                </div>
              ) : (
                <div className={GRID_CONTAINER_CLASS}>
                  <div className={GRID_CLASS}>
                    {pagedCharacters.map(char => renderCharacterCard(char))}
                  </div>
                </div>
              )}

              <div className={GRID_CONTAINER_CLASS}>
                <EntityPagination
                  page={charSafePage}
                  onPageChange={setCharPage}
                  pageSize={charPageSize}
                  onPageSizeChange={setCharPageSize}
                  totalPages={charTotalPages}
                  startIndex={charStartIndex}
                  endIndex={charEndIndex}
                  totalItems={filteredCharacters.length}
                  itemLabelPlural="personaggi"
                />
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'npcs' && renderEntityTab({
        entries: npcEntries,
        filter: npcFilter,
        setFilter: setNpcFilter,
        sort: npcSort,
        setSort: setNpcSort,
        search: npcSearch,
        setSearch: setNpcSearch,
        viewMode: npcViewMode,
        setViewMode: setNpcViewMode,
        isLoading: isLoadingNpcs,
        labelSingular: 'PNG',
        labelPluralLower: 'PNG',
        campaignFilter: npcCampaignFilter,
        setCampaignFilter: setNpcCampaignFilter,
        adventureFilter: npcAdventureFilter,
        setAdventureFilter: setNpcAdventureFilter,
        filterAdventures: npcFilterAdventures,
        rulesetFilter: npcRulesetFilter,
        setRulesetFilter: setNpcRulesetFilter,
        filtersOpen: npcFiltersOpen,
        setFiltersOpen: setNpcFiltersOpen,
        page: npcPage,
        setPage: setNpcPage,
        pageSize: npcPageSize,
        setPageSize: setNpcPageSize,
      })}

      {activeTab === 'monsters' && renderEntityTab({
        entries: monsterEntries,
        filter: monsterFilter,
        setFilter: setMonsterFilter,
        sort: monsterSort,
        setSort: setMonsterSort,
        search: monsterSearch,
        setSearch: setMonsterSearch,
        viewMode: monsterViewMode,
        setViewMode: setMonsterViewMode,
        isLoading: isLoadingMonsters,
        labelSingular: 'mostro',
        labelPluralLower: 'mostri',
        campaignFilter: monsterCampaignFilter,
        setCampaignFilter: setMonsterCampaignFilter,
        adventureFilter: monsterAdventureFilter,
        setAdventureFilter: setMonsterAdventureFilter,
        filterAdventures: monsterFilterAdventures,
        rulesetFilter: monsterRulesetFilter,
        setRulesetFilter: setMonsterRulesetFilter,
        filtersOpen: monsterFiltersOpen,
        setFiltersOpen: setMonsterFiltersOpen,
        page: monsterPage,
        setPage: setMonsterPage,
        pageSize: monsterPageSize,
        setPageSize: setMonsterPageSize,
      })}

      {showCharacterRulesetPicker && (
        <RulesetPickerDialog
          onChoose={rulesetId => { setNewCharacterRuleset(rulesetId); setShowCharacterRulesetPicker(false); setShowWizard(true); }}
          onClose={() => setShowCharacterRulesetPicker(false)}
        />
      )}

      {showNpcRulesetPicker && (
        <RulesetPickerDialog
          title="Nuovo PNG"
          onChoose={rulesetId => { setShowNpcRulesetPicker(false); handleOpenNewNpc(rulesetId); }}
          onClose={() => setShowNpcRulesetPicker(false)}
        />
      )}

      {showMonsterRulesetPicker && (
        <RulesetPickerDialog
          title="Nuovo Mostro"
          onChoose={rulesetId => { setShowMonsterRulesetPicker(false); handleOpenNewMonster(rulesetId); }}
          onClose={() => setShowMonsterRulesetPicker(false)}
        />
      )}

      {showWizard && (
        <CharacterCreationWizard
          onClose={() => { setShowWizard(false); setEditingCharacter(null); setNewCharacterRuleset(null); }}
          onAdd={handleAdd}
          existingCharacters={characters.filter(c => c.id !== editingCharacter?.id).map(c => ({ id: c.id, name: c.name }))}
          initialCharacter={editingCharacter}
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

    <SlideOverPanel isOpen={!!detailContext} onClose={handleCloseDetail} rightOffset={CHARACTERS_RAIL_WIDTH} widthClassName="w-full max-w-6xl">
      {detailContext && detailData && (
        <div className="flex h-full select-none">
          <div className="w-32 shrink-0 overflow-y-auto p-4">
            <button
              type="button"
              onClick={handleCloseDetail}
              className="inline-flex items-center gap-2 text-sm text-[var(--dash-muted)] transition-colors hover:text-[var(--dash-text-strong)]"
            >
              <ArrowLeft className="h-4 w-4" />
              Torna ai {tabLabel(activeTab)}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            {(isViewingUnsavedNpcDraft || isViewingUnsavedMonsterDraft) && (
              <div className="mb-4 rounded-lg border border-[var(--dash-accent)] bg-[var(--dash-panel)] px-3 py-2 text-xs text-[var(--dash-text)]">
                Bozza non salvata — verrà salvata automaticamente non appena inserisci un nome.
              </div>
            )}
            <EntityDetailView
              entityType={detailContext.entityType}
              entity={detailData}
              onUpdate={(updated) => {
                if (detailContext.entityType === 'character') persistCharacter(updated.id, updated);
                else if (detailContext.entityType === 'npc') handleNpcDetailUpdate(updated);
                else if (detailContext.entityType === 'monster') handleMonsterDetailUpdate(updated);
                else persistEntity(detailContext.entityType, updated);
              }}
              canEdit
              campaignId={detailData.campaignId ?? null}
              accessToken={session?.access_token}
              isHSC={isHSC}
              draggable={false}
              showOwnerRow={false}
              showRail={false}
              activeSection={railSection}
              onActiveSectionChange={setRailSection}
              isDraft={isViewingUnsavedNpcDraft || isViewingUnsavedMonsterDraft}
              linkableCharacters={
                detailContext.entityType === 'character'
                  ? characters.filter(c => c.id !== detailContext.id && c.campaignId === null).map(c => ({ id: c.id, name: c.name }))
                  : []
              }
            />
          </div>
        </div>
      )}
    </SlideOverPanel>

    {/* fixed, non un sibling flex di <main>: se montata in AppShell come
        rightSidebar (come in una versione precedente), la comparsa/scomparsa
        di questa rail restringe/riespande <main> e fa ricentrare la griglia
        (mx-auto) sotto di essa - esattamente lo "scatto" da evitare. */}
    {detailContext && (
      <div className="fixed top-12 bottom-0 right-0 z-[900]">
        <EntityDetailRail activeSection={railSection} onSectionChange={setRailSection} />
      </div>
    )}

    {toastMessage && (
      <div className="fixed bottom-6 right-6 z-[1200] max-w-sm rounded-xl border border-[var(--dash-danger-border)] bg-[var(--dash-panel)] px-4 py-3 text-sm text-[var(--dash-text-strong)] shadow-2xl">
        {toastMessage}
      </div>
    )}
    </>
  );
}
