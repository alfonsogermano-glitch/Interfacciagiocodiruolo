import { useState, useEffect, useRef, Fragment } from 'react';
import {
  Play, Square, Loader2, AlertTriangle, Users, Ghost, Skull,
  KeyRound, Check, MoreVertical, Pencil, Copy, CopyPlus, UserCog, FileDown, Trash2, UserMinus, Undo2,
  LayoutGrid, Package, Folder as FolderIcon, FolderPlus, ChevronDown, ChevronRight,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useCampaign } from './CampaignContext';
import { useCampaignChannel } from '../../services/realtime/campaignChannel';
import {
  loadCharactersByOwner, copyCharacterToCampaign, unassignCharacterFromCampaign,
  duplicateCharacter, deleteCharacter, setCharacterAvailableForPlayers, releaseCharacter,
  saveCharacter as saveCharacterToSupabase, saveCharacterAsGm, deleteCharacterAsGm, mapRowToCharacter,
} from '../../services/supabase/charactersService';
import {
  loadNPCs, loadMonsters, saveNPC, saveMonster, type NPC, type Monster,
  duplicateNPC, deleteNPC, unassignNPCFromCampaign, copyNPCToCampaign,
  duplicateMonster, deleteMonster, unassignMonsterFromCampaign, copyMonsterToCampaign,
} from '../../services/supabase/entitiesService';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { EntityCard } from '../components/session/shared/EntityCard';
import { EntityKebabMenu, type EntityKebabMenuItem } from '../components/session/shared/EntityKebabMenu';
import { CampaignNotesPanel } from '../components/session/shared/CampaignNotesPanel';
import { CampaignForm } from './CampaignSelector';
import { CampaignCoverEditor, type CampaignCoverPatch } from './CampaignCoverEditor';
import { InviteByNameModal } from './InviteByNameModal';
import { isRulesetCompatible, type CampaignCreateInput, type RulesetId } from './campaignTypes';
import type { TokenBorderStyle, TokenBorderThickness } from '../../types/tokenStyle';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '../components/ui/dropdown-menu';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { Switch } from '../components/ui/switch';
import {
  loadFolders, createFolder, renameFolder, reorderFolder, deleteFolder, setCharacterFolder,
  type Folder, type FolderEntityType,
} from '../../services/supabase/foldersService';
import { useFolderDragDrop, UNFILED_DROP_ID } from '../components/session/shared/useFolderDragDrop';
import { CharacterCreationWizard } from '../components/gm/CharacterCreationWizard';
import { PALETTE_COLORS, DEFAULT_PALETTE_COLORS, type PaletteId } from '../components/ui/paletteColors';
import type { Character } from '../../types/character';

// Stessa funzione di MyCharactersPage.tsx (non condivisa in un modulo a
// parte: e' un one-liner che legge il DOM, non vale la pena un import
// incrociato tra le due pagine per questo).
function getCurrentPaletteColors() {
  const el = document.querySelector('[data-dashboard-palette]');
  const palette = el?.getAttribute('data-dashboard-palette') as PaletteId | null;
  return palette && PALETTE_COLORS[palette] ? PALETTE_COLORS[palette] : DEFAULT_PALETTE_COLORS;
}

const photoCornerButtonClass =
  'rounded-lg bg-black/40 p-1 text-white/80 transition-colors hover:bg-black/60 hover:text-white';

const SERVER_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-771c5bfd`;
const AUTO_CLOSE_AFTER_MS = 60 * 60 * 1000; // 1 ora

// Stessa forma del "selected" interno di SessionCharactersPanel.tsx - usata
// per chiedere l'apertura del pannello "Schede" (SessionRightSidebar, gia'
// montata come rightSidebar di AppShell nella vista campagna) con
// un'entita' specifica pre-selezionata, invece di costruire un pannello
// dedicato qui.
export type SessionEntityOpenRequest = { kind: 'pg' | 'png' | 'mostro'; id: string; requestId: number };

interface CampaignHomeProps {
  onGoToManagement: () => void;
  onOpenSessionEntity: (kind: 'pg' | 'png' | 'mostro', id: string) => void;
}

type PlayerCharacterSummary = {
  id: string;
  name: string;
  ownerProfileId: string;
  ruleset: RulesetId | null;
  createdAt: string | null;
  portraitUrl: string | null;
  portraitSourceUrl: string | null;
  portraitCropArea: { x: number; y: number; width: number; height: number } | null;
  styleViaggio: string;
  description: string;
  ownerAvatarUrl: string | null;
  tokenColor: string | null;
  tokenBackgroundColor: string | null;
  tokenBorderStyle: TokenBorderStyle | null;
  tokenBorderThickness: TokenBorderThickness | null;
  tokenBorderVisible: boolean | null;
  tokenBorderLabel: string | null;
  // Servono per le condizioni del menu ⋮ (Disponibile per i giocatori,
  // Rilascia al GM) - gia' presenti nella risposta grezza di
  // GET /campaigns/:id/characters (select("*") lato server), qui solo
  // mappati per la prima volta.
  campaignId: string | null;
  claimableOrigin: boolean;
  originalOwnerProfileId: string | null;
  availableForPlayers: boolean;
  folderId: string | null;
};

type PlayerRow = {
  profileId: string;
  displayName: string | null;
  joinedAt: string | null;
  characters: PlayerCharacterSummary[];
};

type QuickFilter = 'all' | 'pg' | 'premades' | 'npc' | 'monster';

// Stesso helper di pillClass() in MyCharactersPage.tsx - riuso lo stile
// (non l'implementazione, e' una funzione locale non esportata li' anche).
function pillClass(active: boolean) {
  return `inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
    active
      ? 'border-[var(--dash-accent)] bg-[var(--dash-accent)] text-[var(--dash-text-strong)]'
      : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface)] text-[var(--dash-muted)] hover:text-[var(--dash-text)]'
  }`;
}

// Titolo+icona della riga affiancata alle pillole: riflette sempre la
// sezione corrente (non solo "Personaggi", il caso di default) cosi' le
// pillole restano cliccabili con un'intestazione coerente in ogni filtro.
function quickFilterHeading(filter: QuickFilter): { icon: typeof Users; label: string } {
  switch (filter) {
    case 'premades': return { icon: Package, label: 'Precompilati' };
    case 'npc': return { icon: Ghost, label: 'PNG' };
    case 'monster': return { icon: Skull, label: 'Mostri' };
    case 'pg':
    case 'all':
    default:
      return { icon: Users, label: 'Personaggi' };
  }
}

// Riga in cima a ciascuna delle 4 sezioni della griglia: icona+etichetta
// (era gia' presente per PNG/Mostri come <h2 col-span-2>, ma solo quando
// activeQuickFilter === 'all' - qui invece sempre visibile e uniformata
// anche a Personaggi/Precompilati, che prima non avevano alcuna
// intestazione) + pulsante "Nuova cartella", solo GM (le cartelle sono
// gestite solo dal GM, visibili identiche a tutti - vedi piano Fase 2).
function FolderSectionHeader({
  icon: Icon, label, isOwner, onCreateFolder,
}: {
  icon: typeof Users;
  label: string;
  isOwner: boolean;
  onCreateFolder: () => void;
}) {
  return (
    <div className="col-span-2 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[var(--dash-muted)]">
        <Icon className="h-4 w-4" /> {label}
      </h2>
      {isOwner && (
        <button
          type="button"
          onClick={onCreateFolder}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] px-2.5 py-1 text-xs font-medium text-[var(--dash-muted)] transition-colors hover:text-[var(--dash-text-strong)]"
        >
          <FolderPlus className="h-3.5 w-3.5" /> Nuova cartella
        </button>
      )}
    </div>
  );
}

// Header di una singola cartella (collassata: solo la riga; espansa: le sue
// card seguono subito dopo, renderizzate dal chiamante). data-folder-id +
// data-folder-entity-type sono gli hook per useFolderDragDrop - vedi il
// commento su resolveFolderDropTarget in useFolderDragDrop.ts per il perche'
// serve anche l'entity-type (le 4 sezioni condividono lo stesso containerRef).
// Rinomina inline al click sul nome: stesso pattern di renamingTabId/
// renameDraft in useEntityTabs.ts (autoFocus, Enter conferma, Escape annulla,
// blur conferma).
function FolderRow({
  folder, isOpen, onToggle, count, canEdit, isRenaming, renameDraft, onRenameDraftChange,
  onStartRename, onCommitRename, onCancelRename, onRequestDelete, onPointerDown, isDropActive,
}: {
  folder: Folder;
  isOpen: boolean;
  onToggle: () => void;
  count: number;
  canEdit: boolean;
  isRenaming: boolean;
  renameDraft: string;
  onRenameDraftChange: (v: string) => void;
  onStartRename: () => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onRequestDelete: () => void;
  onPointerDown: (e: React.PointerEvent) => void;
  isDropActive: boolean;
}) {
  return (
    <div
      data-folder-id={folder.id}
      data-folder-entity-type={folder.entityType}
      onPointerDown={canEdit ? onPointerDown : undefined}
      className={`group col-span-2 flex items-center justify-between gap-2 rounded-xl border px-3 py-2 transition-colors ${
        isDropActive
          ? 'border-[var(--dash-accent)] bg-[var(--dash-accent)]/10'
          : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface)]'
      } ${canEdit ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-[var(--dash-muted)]" /> : <ChevronRight className="h-4 w-4 shrink-0 text-[var(--dash-muted)]" />}
        <FolderIcon className="h-4 w-4 shrink-0 text-[var(--dash-accent-2)]" />
        {isRenaming ? (
          <input
            type="text"
            autoFocus
            data-no-drag
            value={renameDraft}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onRenameDraftChange(e.target.value)}
            onBlur={onCommitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCommitRename();
              if (e.key === 'Escape') onCancelRename();
            }}
            className="w-40 rounded-md border border-[var(--dash-accent)] bg-[var(--dash-input)] px-2 py-1 text-sm text-[var(--dash-text)]"
          />
        ) : (
          <span
            className="truncate text-sm font-medium text-[var(--dash-text-strong)]"
            onClick={canEdit ? (e) => { e.stopPropagation(); onStartRename(); } : undefined}
          >
            {folder.name}
          </span>
        )}
        <span className="shrink-0 text-xs text-[var(--dash-muted)]">({count})</span>
      </button>
      {canEdit && !isRenaming && (
        <button
          type="button"
          data-no-drag
          onClick={(e) => { e.stopPropagation(); onRequestDelete(); }}
          className="shrink-0 rounded p-1 text-[var(--dash-muted)] opacity-0 transition-opacity hover:text-[var(--dash-danger-text)] group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// Striscia "Senza cartella": bersaglio esplicito per togliere una card da
// una cartella (invece di rendere tutta l'area sparsa delle card sciolte un
// hit-target implicito, che avrebbe richiesto di avvolgerle in un unico div
// e romperebbe il flusso a griglia condiviso - vedi piano Fase 2). Mostrata
// solo se la sezione ha almeno una cartella: con zero cartelle tutte le card
// sono gia' banalmente "sciolte", nessun'etichetta serve.
function UnfiledDropZone({ entityType, isDropActive }: { entityType: FolderEntityType; isDropActive: boolean }) {
  return (
    <div
      data-folder-id={UNFILED_DROP_ID}
      data-folder-entity-type={entityType}
      className={`col-span-2 rounded-lg border border-dashed px-3 py-1.5 text-[11px] uppercase tracking-wide transition-colors ${
        isDropActive ? 'border-[var(--dash-accent)] text-[var(--dash-accent-2)]' : 'border-[var(--dash-border-soft)] text-[var(--dash-muted)]'
      }`}
    >
      Senza cartella
    </div>
  );
}

export function CampaignHome({ onGoToManagement, onOpenSessionEntity }: CampaignHomeProps) {
  const { user, session } = useAuth();
  const { activeCampaign, campaigns, joinedCampaigns, refreshCampaigns, refreshJoinedCampaigns, updateCampaign, deleteCampaign, generateInviteCode } = useCampaign();

  const [isToggling, setIsToggling] = useState(false);
  const [gmOnline, setGmOnline] = useState(false);
  const [localSessionActive, setLocalSessionActive] = useState<boolean | null>(null);
  const [ownCharacterId, setOwnCharacterId] = useState<string | null>(null);
  const [characterLookupDone, setCharacterLookupDone] = useState(false);
  const [autoClosedNotice, setAutoClosedNotice] = useState(false);
  const autoCloseCheckedRef = useRef(false);
  const [gmDisplayName, setGmDisplayName] = useState<string | null>(null);
  const [gmAvatarUrl, setGmAvatarUrl] = useState<string | null>(null);
  const [playerRows, setPlayerRows] = useState<PlayerRow[]>([]);
  const [playersLoaded, setPlayersLoaded] = useState(false);
  // "Precompilati": PG del GM (available_for_players=true) - esclusi di
  // proposito da playerRows sopra (quello raggruppa solo per membro non-GM,
  // vedi il filtro su activeCampaign.ownerId piu' sotto), quindi vanno tenuti
  // a parte qui dalla stessa risposta /campaigns/:id/characters.
  const [availablePremades, setAvailablePremades] = useState<PlayerCharacterSummary[]>([]);
  const [npcs, setNpcs] = useState<NPC[]>([]);
  const [npcsLoaded, setNpcsLoaded] = useState(false);
  const [monsters, setMonsters] = useState<Monster[]>([]);
  const [monstersLoaded, setMonstersLoaded] = useState(false);

  // ─── Cartelle (sistema di organizzazione PG/Precompilati/PNG/Mostri) ───
  // Un array per sezione (namespace 'character'/'premade'/'npc'/'monster' -
  // vedi supabase-add-folders.sql), mai mescolati tra loro: una cartella non
  // compare mai in una sezione diversa da quella in cui e' stata creata.
  const [charFolders, setCharFolders] = useState<Folder[]>([]);
  const [premadeFolders, setPremadeFolders] = useState<Folder[]>([]);
  const [npcFolders, setNpcFolders] = useState<Folder[]>([]);
  const [monsterFolders, setMonsterFolders] = useState<Folder[]>([]);
  // Aperte di default (true) al primo avvistamento di un id - condiviso tra
  // le 4 sezioni, le chiavi (id di cartella) sono UUID quindi non collidono.
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameFolderDraft, setRenameFolderDraft] = useState('');
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<Folder | null>(null);
  const [isDeletingFolder, setIsDeletingFolder] = useState(false);

  const [inviteCopied, setInviteCopied] = useState(false);
  const [showInviteByNameModal, setShowInviteByNameModal] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [activeQuickFilter, setActiveQuickFilter] = useState<QuickFilter>('all');
  const [copyDialogChar, setCopyDialogChar] = useState<PlayerCharacterSummary | null>(null);
  const [copyTargetCampaignId, setCopyTargetCampaignId] = useState<string | null>(null);
  const [isCopyingChar, setIsCopyingChar] = useState(false);
  const [copyCharError, setCopyCharError] = useState<string | null>(null);
  const [removePlayerTarget, setRemovePlayerTarget] = useState<PlayerRow | null>(null);
  const [isRemovingPlayer, setIsRemovingPlayer] = useState(false);
  const [removePlayerError, setRemovePlayerError] = useState<string | null>(null);
  // Bump per forzare un refetch di PG/PNG/Mostri dopo copia/rimozione dal
  // menu delle card, o dopo un evento members_change dal canale condiviso.
  const [playersReloadToken, setPlayersReloadToken] = useState(0);
  // Righe grezze (select("*") originale) dietro a playerRows/availablePremades -
  // PlayerCharacterSummary e' troppo leggero per precompilare il wizard di
  // modifica (mancano ambiti/abilita/equipaggiamento/etc.), quindi "Modifica"
  // pesca da qui e mappa con mapRowToCharacter solo quando serve davvero.
  const [charactersRaw, setCharactersRaw] = useState<any[]>([]);

  // ─── Menu ⋮ condiviso (EntityKebabMenu) sulle card PG/precompilati/PNG/Mostri ───
  const [menuColors, setMenuColors] = useState(() => getCurrentPaletteColors());
  const [editingCharacter, setEditingCharacter] = useState<ReturnType<typeof mapRowToCharacter> | null>(null);
  const [deleteCharTarget, setDeleteCharTarget] = useState<PlayerCharacterSummary | null>(null);
  const [isDeletingChar, setIsDeletingChar] = useState(false);
  const [releaseCharTarget, setReleaseCharTarget] = useState<PlayerCharacterSummary | null>(null);
  const [isReleasingChar, setIsReleasingChar] = useState(false);
  // Rimuove solo questo PG dalla campagna (il giocatore resta membro con
  // eventuali altri suoi PG) - distinta da removePlayerTarget piu' sotto,
  // che rimuove tutti i PG del giocatore piu' la membership. Solo GM (isOwner).
  const [unassignCharTarget, setUnassignCharTarget] = useState<PlayerCharacterSummary | null>(null);
  const [isUnassigningChar, setIsUnassigningChar] = useState(false);
  // Elimina/Rimuovi/Copia per PNG e Mostri - tagged union invece di 6 stati
  // separati (uno per azione x tipo): stessa forma per entrambi i tipi,
  // nessuna differenza di comportamento tra i due se non la funzione service
  // da chiamare.
  const [deleteEntityTarget, setDeleteEntityTarget] = useState<{ kind: 'npc' | 'monster'; id: string; name: string } | null>(null);
  const [isDeletingEntity, setIsDeletingEntity] = useState(false);
  const [unassignEntityTarget, setUnassignEntityTarget] = useState<{ kind: 'npc' | 'monster'; id: string; name: string } | null>(null);
  const [isUnassigningEntity, setIsUnassigningEntity] = useState(false);
  const [copyEntityDialog, setCopyEntityDialog] = useState<{ kind: 'npc' | 'monster'; id: string; name: string; ruleset: RulesetId | null } | null>(null);
  const [copyEntityTargetId, setCopyEntityTargetId] = useState<string | null>(null);
  const [isCopyingEntity, setIsCopyingEntity] = useState(false);
  const [copyEntityError, setCopyEntityError] = useState<string | null>(null);

  const lookupSeqRef = useRef(0);
  const isOwner = activeCampaign?.ownerId === user?.id;
  const sessionActive = localSessionActive ?? !!activeCampaign?.sessionActive;

  useEffect(() => {
    setLocalSessionActive(activeCampaign?.sessionActive ?? false);
  }, [activeCampaign?.id, activeCampaign?.sessionActive]);

  useEffect(() => {
    if (!activeCampaign?.id) return;
    const promise = isOwner ? refreshCampaigns() : refreshJoinedCampaigns();
    void promise;
  }, [activeCampaign?.id, isOwner]);

  // Il GM, al rientro, verifica se una sessione è rimasta attiva troppo a
  // lungo (es. ha chiuso il browser senza terminarla esplicitamente) e la
  // chiude automaticamente, senza intaccare le disconnessioni brevi/pausa
  useEffect(() => {
    if (!isOwner || !activeCampaign?.id || autoCloseCheckedRef.current) return;
    if (!activeCampaign.sessionActive) return;

    const activatedAt = activeCampaign.sessionActivatedAt ? new Date(activeCampaign.sessionActivatedAt).getTime() : null;
    if (!activatedAt) return;

    autoCloseCheckedRef.current = true;

    if (Date.now() - activatedAt > AUTO_CLOSE_AFTER_MS) {
      const accessToken = session?.access_token ?? publicAnonKey;
      fetch(`${SERVER_BASE}/campaigns/${activeCampaign.id}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ active: false }),
      })
        .then(() => {
          setLocalSessionActive(false);
          setAutoClosedNotice(true);
          void refreshCampaigns();
        })
        .catch(err => console.error('Errore chiusura automatica sessione:', err));
    }
  }, [isOwner, activeCampaign?.id, activeCampaign?.sessionActive, activeCampaign?.sessionActivatedAt, session]);

  // Trova il proprio personaggio in questa campagna (solo per i giocatori)
  useEffect(() => {
    const mySeq = ++lookupSeqRef.current;

    if (isOwner) {
      setOwnCharacterId(null);
      setCharacterLookupDone(true);
      return;
    }
    if (!user?.id || !activeCampaign?.id) {
      setCharacterLookupDone(false);
      return;
    }
    setCharacterLookupDone(false);
    loadCharactersByOwner(user.id)
      .then(chars => {
        if (lookupSeqRef.current !== mySeq) return;
        const mine = chars.find(c => c.campaignId === activeCampaign.id);
        setOwnCharacterId(mine?.id ?? null);
        setCharacterLookupDone(true);
      })
      .catch(err => {
        console.error('Errore nel caricamento dei personaggi:', err);
      });
  }, [isOwner, user?.id, activeCampaign?.id]);

  // Sezione "Players": combina /characters (PG gia' arricchiti con
  // owner_display_name/owner_avatar_url lato server) e /member-names
  // (roster completo dei membri, incluso chi non ha ancora un PG). Il GM
  // non e' mai tra i membri (si unisce solo chi fa "join"), quindi il suo
  // nome arriva separato come ownerDisplayName.
  useEffect(() => {
    if (!activeCampaign?.id || !session) return;
    let cancelled = false;
    setPlayersLoaded(false);

    (async () => {
      try {
        const accessToken = session.access_token;
        const [charsRes, memberNamesRes] = await Promise.all([
          fetch(`${SERVER_BASE}/campaigns/${activeCampaign.id}/characters`, { headers: { Authorization: `Bearer ${accessToken}` } }),
          fetch(`${SERVER_BASE}/campaigns/${activeCampaign.id}/member-names`, { headers: { Authorization: `Bearer ${accessToken}` } }),
        ]);
        if (cancelled) return;
        const charsData = charsRes.ok ? await charsRes.json() : { characters: [] };
        const memberNamesData = memberNamesRes.ok ? await memberNamesRes.json() : { members: [], ownerDisplayName: null };
        if (cancelled) return;

        const characters = charsData.characters ?? [];
        setCharactersRaw(characters);
        // Il GM ha gia' la propria riga dedicata (badge "GM") indipendentemente
        // dal fatto che possieda un PG - va escluso qui, all'ingresso
        // dell'unione, cosi' non puo' ricomparire ne' come membro ne' come
        // "orfano" piu' sotto, qualunque sia la provenienza del suo profileId.
        const members: { profileId: string; displayName: string | null; joinedAt: string | null }[] = (memberNamesData.members ?? [])
          .filter((m: any) => m.profileId !== activeCampaign.ownerId);

        const toCharacterSummary = (ch: any): PlayerCharacterSummary => ({
          id: ch.id,
          name: ch.name,
          ownerProfileId: ch.owner_profile_id,
          ruleset: ch.ruleset ?? null,
          createdAt: ch.created_at ?? null,
          portraitUrl: ch.portrait_image_url ?? null,
          portraitSourceUrl: ch.portrait_source_image_url ?? null,
          portraitCropArea: ch.portrait_crop_area ?? null,
          // stesso formato di MyCharactersPage.tsx:463 ({style} · {viaggio})
          styleViaggio: [ch.style, ch.viaggio].filter(Boolean).join(' · ') || 'Personaggio',
          description: ch.sheet_data?.description ?? '',
          ownerAvatarUrl: ch.owner_avatar_url ?? null,
          tokenColor: ch.token_color ?? null,
          tokenBackgroundColor: ch.token_background_color ?? null,
          tokenBorderStyle: ch.token_border_style ?? null,
          tokenBorderThickness: ch.token_border_thickness ?? null,
          tokenBorderVisible: ch.token_border_visible ?? null,
          tokenBorderLabel: ch.token_border_label ?? null,
          campaignId: ch.campaign_id ?? null,
          claimableOrigin: ch.claimable_origin ?? false,
          originalOwnerProfileId: ch.original_owner_profile_id ?? null,
          availableForPlayers: ch.available_for_players ?? false,
          folderId: ch.folder_id ?? null,
        });

        const charsByOwner = new Map<string, PlayerCharacterSummary[]>();
        for (const ch of characters) {
          const ownerId = ch.owner_profile_id;
          if (!ownerId) continue;
          const list = charsByOwner.get(ownerId) ?? [];
          list.push(toCharacterSummary(ch));
          charsByOwner.set(ownerId, list);
        }

        // Unione tra membri noti e proprietari di PG non (piu') tra i membri
        // (es. rimosso dalla campagna ma PG non riassegnato) - nessun PG va perso.
        const knownIds = new Set(members.map((m) => m.profileId));
        const orphanOwnerIds = Array.from(charsByOwner.keys()).filter(
          (id) => id !== activeCampaign.ownerId && !knownIds.has(id)
        );

        setPlayerRows([
          ...members.map((m) => ({ profileId: m.profileId, displayName: m.displayName, joinedAt: m.joinedAt, characters: charsByOwner.get(m.profileId) ?? [] })),
          ...orphanOwnerIds.map((id) => ({ profileId: id, displayName: null, joinedAt: null, characters: charsByOwner.get(id) ?? [] })),
        ]);
        // PG del GM (owner_profile_id = GM) marcati disponibili - esclusi di
        // proposito da playerRows sopra, che raggruppa solo per membro non-GM.
        setAvailablePremades(
          characters
            .filter((ch: any) => ch.owner_profile_id === activeCampaign.ownerId && ch.available_for_players)
            .map(toCharacterSummary)
        );
        setGmDisplayName(memberNamesData.ownerDisplayName ?? null);
        setGmAvatarUrl(memberNamesData.ownerAvatarUrl ?? null);
      } catch (err) {
        console.error('Errore nel caricamento della sezione Players:', err);
      } finally {
        if (!cancelled) setPlayersLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeCampaign?.id, activeCampaign?.ownerId, session, playersReloadToken]);

  // Sezione "NPCs": solo per il GM - i PNG nascosti ai giocatori non devono
  // arrivare al browser di un giocatore (nemmeno solo per essere filtrati
  // client-side, come accade altrove in SessionCharactersPanel.tsx).
  useEffect(() => {
    if (!isOwner || !activeCampaign?.id) {
      setNpcs([]);
      setNpcsLoaded(false);
      return;
    }
    let cancelled = false;
    setNpcsLoaded(false);

    loadNPCs(activeCampaign.id)
      .then((loaded) => {
        if (cancelled) return;
        setNpcs(loaded);
      })
      .catch((err) => {
        console.error('Errore nel caricamento dei PNG:', err);
      })
      .finally(() => {
        if (!cancelled) setNpcsLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [isOwner, activeCampaign?.id]);

  // Sezione "Mostri": stessa regola di sicurezza degli NPC - solo per il GM,
  // Monster ha lo stesso campo visibleToPlayers di NPC (entitiesService.ts).
  useEffect(() => {
    if (!isOwner || !activeCampaign?.id) {
      setMonsters([]);
      setMonstersLoaded(false);
      return;
    }
    let cancelled = false;
    setMonstersLoaded(false);

    loadMonsters(activeCampaign.id)
      .then((loaded) => {
        if (cancelled) return;
        setMonsters(loaded);
      })
      .catch((err) => {
        console.error('Errore nel caricamento dei mostri:', err);
      })
      .finally(() => {
        if (!cancelled) setMonstersLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [isOwner, activeCampaign?.id]);

  // Cartelle: 'character'/'premade' caricate per chiunque veda la sezione
  // Personaggi/Precompilati (GM e giocatori, sola lettura per questi ultimi -
  // canAccessFolders lato server ammette anche i membri in lettura), 'npc'/
  // 'monster' solo per il GM, stessa regola di sicurezza delle sezioni PNG/
  // Mostri sopra (mai richieste per un giocatore).
  useEffect(() => {
    if (!activeCampaign?.id || !session) {
      setCharFolders([]);
      setPremadeFolders([]);
      setNpcFolders([]);
      setMonsterFolders([]);
      return;
    }
    let cancelled = false;
    const accessToken = session.access_token;
    const campaignId = activeCampaign.id;

    const load = (entityType: FolderEntityType, setter: (f: Folder[]) => void) =>
      loadFolders(campaignId, entityType, SERVER_BASE, accessToken)
        .then((loaded) => { if (!cancelled) setter(loaded); })
        .catch((err) => console.error(`Errore caricamento cartelle ${entityType}:`, err));

    load('character', setCharFolders);
    load('premade', setPremadeFolders);
    if (isOwner) {
      load('npc', setNpcFolders);
      load('monster', setMonsterFolders);
    } else {
      setNpcFolders([]);
      setMonsterFolders([]);
    }

    return () => {
      cancelled = true;
    };
  }, [activeCampaign?.id, session, isOwner]);

  // Canale campaign:{id} condiviso (src/services/realtime/campaignChannel.ts):
  // CampaignHome non è l'unico consumer di questo topic (SessionCharactersPanel,
  // SessionNotesPanel e useEntityTabs lo usano anche loro quando montati
  // insieme, dentro SessionRightSidebar) - prima di questo hook ciascuno apriva
  // il proprio supabase.channel() per lo stesso topic in modo scoordinato,
  // causando collisioni reali (canale chiuso da sotto i piedi di un altro
  // consumer, errore "cannot add X callbacks... after subscribe()" - bug
  // trovato e diagnosticato dal vivo il 2026-07-20). Qui un solo punto
  // possiede davvero il canale, con un solo retry condiviso.
  const { isReady: channelReady, track, untrack, send } = useCampaignChannel(activeCampaign?.id ?? null, {
    onBroadcast: {
      session_change: (msg) => {
        const active = msg?.payload?.active;
        if (typeof active === 'boolean') {
          setLocalSessionActive(active);
        }
      },
      members_change: () => {
        setPlayersReloadToken((t) => t + 1);
      },
    },
    onPresenceSync: (state) => {
      const online = Object.values(state).some((presences: any) =>
        presences.some((p: any) => p.role === 'gm')
      );
      setGmOnline(online);
    },
  });

  useEffect(() => {
    if (!channelReady || !characterLookupDone) return;
    if (isOwner) {
      void track({ role: 'gm', online_at: new Date().toISOString() });
    } else if (ownCharacterId) {
      void track({ role: 'player', characterId: ownCharacterId, online_at: new Date().toISOString() });
    }
    return () => {
      if (isOwner || ownCharacterId) void untrack();
    };
  }, [channelReady, characterLookupDone, isOwner, ownCharacterId, track, untrack]);

  const handleToggleSession = async () => {
    if (!activeCampaign?.id) return;
    setIsToggling(true);
    const nextActive = !sessionActive;
    try {
      const accessToken = session?.access_token ?? publicAnonKey;
      await fetch(`${SERVER_BASE}/campaigns/${activeCampaign.id}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ active: nextActive }),
      });

      setLocalSessionActive(nextActive);
      setAutoClosedNotice(false);

      if (channelReady) {
        try {
          await send('session_change', { active: nextActive });
        } catch (err) {
          console.error('Errore invio broadcast session_change:', err);
        }
      }

      await refreshCampaigns();
    } catch (err) {
      console.error('Errore cambio stato sessione:', err);
    } finally {
      setIsToggling(false);
    }
  };

  const handleInvitePlayers = async () => {
    if (!activeCampaign) return;
    if (!activeCampaign.inviteCode) {
      // Caso raro: campagne create prima dell'introduzione del codice
      // invito. Lo genera ora - il campo si popola al prossimo render,
      // un secondo click copia il codice appena creato.
      await generateInviteCode(activeCampaign.id);
      await refreshCampaigns();
      return;
    }
    await navigator.clipboard.writeText(activeCampaign.inviteCode);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 1500);
  };

  const handleEditCampaign = async (data: CampaignCreateInput) => {
    if (!activeCampaign) return;
    setIsSubmittingEdit(true);
    setEditError(null);
    try {
      await updateCampaign(activeCampaign.id, data);
      setShowEditForm(false);
    } catch (err) {
      setEditError(String(err));
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleDeleteCampaign = async () => {
    if (!activeCampaign) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteCampaign(activeCampaign.id);
      setConfirmDeleteOpen(false);
    } catch (err) {
      setDeleteError(String(err));
    } finally {
      setIsDeleting(false);
    }
  };

  const compatibleCopyTargets = (char: PlayerCharacterSummary | null) => {
    if (!char || !activeCampaign) return [];
    // campagne possedute + a cui si partecipa: chi copia non e' sempre il
    // GM (un giocatore che copia il proprio PG usera' tipicamente una
    // campagna a cui partecipa, non una che possiede).
    const ids = new Set<string>();
    return [...campaigns, ...joinedCampaigns].filter((c) => {
      if (ids.has(c.id) || c.id === activeCampaign.id) return false;
      ids.add(c.id);
      return isRulesetCompatible(char.ruleset, activeCampaign.ruleset, c.ruleset);
    });
  };

  const handleConfirmCopyCharacter = async () => {
    if (!copyDialogChar || !copyTargetCampaignId) return;
    setIsCopyingChar(true);
    setCopyCharError(null);
    try {
      await copyCharacterToCampaign(copyDialogChar.id, copyTargetCampaignId, copyDialogChar.ownerProfileId);
      setCopyDialogChar(null);
      setCopyTargetCampaignId(null);
    } catch (err) {
      setCopyCharError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCopyingChar(false);
    }
  };

  const handleConfirmRemovePlayer = async () => {
    if (!removePlayerTarget || !activeCampaign || !session) return;
    setIsRemovingPlayer(true);
    setRemovePlayerError(null);
    try {
      const accessToken = session.access_token;
      const res = await fetch(`${SERVER_BASE}/campaigns/${activeCampaign.id}/remove-player`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ playerProfileId: removePlayerTarget.profileId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Errore durante la rimozione del giocatore');
      setRemovePlayerTarget(null);
      setPlayersReloadToken((t) => t + 1);
    } catch (err) {
      setRemovePlayerError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRemovingPlayer(false);
    }
  };

  // ─── Menu ⋮ PG/precompilati: handler condivisi tra playerRows e availablePremades ───

  // Duplica crea sempre una riga nuova posseduta da chi clicca (mai
  // l'originale) - sicuro indipendentemente da chi possiede il PG di
  // partenza, nessun branch isMine necessario qui (a differenza di
  // Modifica/Elimina sotto).
  const handleDuplicateCharacterCard = async (id: string) => {
    if (!user?.id) return;
    try {
      await duplicateCharacter(id, user.id);
      setPlayersReloadToken((t) => t + 1);
    } catch (err) {
      console.error('Errore duplicazione personaggio:', err);
    }
  };

  // "Modifica" pesca la riga grezza (non la summary, troppo leggera per
  // precompilare il wizard) e la mappa con mapRowToCharacter.
  const handleOpenEditCharacter = (id: string) => {
    const raw = charactersRaw.find((r) => r.id === id);
    if (!raw) return;
    setEditingCharacter(mapRowToCharacter(raw));
  };

  // Stesso pattern isMine di PlayerCharacters.tsx (persistCharacter): il
  // wizard salva sempre con ownerProfileId potenzialmente diverso da chi
  // sta modificando - se il GM sta modificando il PG di un giocatore serve
  // passare da saveCharacterAsGm (server, preserva la proprieta'), non da
  // saveCharacter diretto (sposterebbe la proprieta' al GM).
  const handleSaveEditedCharacter = async (character: Character & { player: string; notes: string }) => {
    if (!activeCampaign || !session || !user?.id) return;
    const ownerProfileId = (editingCharacter as any)?.ownerProfileId as string | undefined;
    const isMine = !ownerProfileId || ownerProfileId === user.id;
    try {
      if (isMine) {
        await saveCharacterToSupabase(activeCampaign.id, character, user.id);
      } else {
        await saveCharacterAsGm(activeCampaign.id, character.id, character, SERVER_BASE, session.access_token);
      }
      setEditingCharacter(null);
      setPlayersReloadToken((t) => t + 1);
    } catch (err) {
      console.error('Errore salvataggio personaggio:', err);
    }
  };

  const handleConfirmDeleteCharacter = async () => {
    if (!deleteCharTarget || !activeCampaign || !session) return;
    setIsDeletingChar(true);
    try {
      const isMine = deleteCharTarget.ownerProfileId === user?.id;
      if (isMine) {
        await deleteCharacter(deleteCharTarget.id);
      } else {
        await deleteCharacterAsGm(activeCampaign.id, deleteCharTarget.id, SERVER_BASE, session.access_token);
      }
      setDeleteCharTarget(null);
      setPlayersReloadToken((t) => t + 1);
    } catch (err) {
      console.error('Errore eliminazione personaggio:', err);
    } finally {
      setIsDeletingChar(false);
    }
  };

  // Sempre self-service: la voce non viene mai offerta al GM (vedi
  // costruzione degli item piu' sotto), solo al giocatore che possiede
  // attualmente il PG.
  const handleConfirmReleaseCharacter = async () => {
    if (!releaseCharTarget) return;
    setIsReleasingChar(true);
    try {
      const accessToken = session?.access_token ?? publicAnonKey;
      await releaseCharacter(releaseCharTarget.id, SERVER_BASE, accessToken);
      setReleaseCharTarget(null);
      setPlayersReloadToken((t) => t + 1);
    } catch (err) {
      console.error('Errore rilascio personaggio:', err);
    } finally {
      setIsReleasingChar(false);
    }
  };

  const handleConfirmUnassignCharacter = async () => {
    if (!unassignCharTarget || !session) return;
    setIsUnassigningChar(true);
    try {
      await unassignCharacterFromCampaign(unassignCharTarget.id, SERVER_BASE, session.access_token);
      setUnassignCharTarget(null);
      setPlayersReloadToken((t) => t + 1);
    } catch (err) {
      console.error('Errore rimozione personaggio dalla campagna:', err);
    } finally {
      setIsUnassigningChar(false);
    }
  };

  // Toggle "Disponibile per i giocatori" - solo sui precompilati del GM,
  // update ottimistico locale (stesso schema di MyCharactersPage.tsx),
  // rollback su errore.
  const handleToggleCharacterAvailable = async (ch: PlayerCharacterSummary) => {
    const nextAvailable = !ch.availableForPlayers;
    setAvailablePremades((prev) => prev.map((c) => (c.id === ch.id ? { ...c, availableForPlayers: nextAvailable } : c)));
    try {
      const accessToken = session?.access_token ?? publicAnonKey;
      await setCharacterAvailableForPlayers(ch.id, nextAvailable, SERVER_BASE, accessToken);
      if (!nextAvailable) setPlayersReloadToken((t) => t + 1);
    } catch (err) {
      console.error('Errore aggiornamento disponibilità personaggio:', err);
      setAvailablePremades((prev) => prev.map((c) => (c.id === ch.id ? ch : c)));
    }
  };

  // ─── Menu ⋮ PNG/Mostri (sempre del GM, nessun branch isMine) ───

  const handleDuplicateEntityCard = async (kind: 'npc' | 'monster', id: string) => {
    try {
      if (kind === 'npc') {
        const duplicated = await duplicateNPC(id);
        setNpcs((prev) => [...prev, duplicated]);
      } else {
        const duplicated = await duplicateMonster(id);
        setMonsters((prev) => [...prev, duplicated]);
      }
    } catch (err) {
      console.error('Errore duplicazione:', err);
    }
  };

  const compatibleCopyEntityTargets = () => {
    if (!copyEntityDialog || !activeCampaign) return [];
    const ids = new Set<string>();
    return [...campaigns, ...joinedCampaigns].filter((c) => {
      if (ids.has(c.id) || c.id === activeCampaign.id) return false;
      ids.add(c.id);
      return isRulesetCompatible(copyEntityDialog.ruleset, activeCampaign.ruleset, c.ruleset);
    });
  };

  const handleConfirmCopyEntity = async () => {
    if (!copyEntityDialog || !copyEntityTargetId || !user?.id) return;
    setIsCopyingEntity(true);
    setCopyEntityError(null);
    try {
      if (copyEntityDialog.kind === 'npc') {
        await copyNPCToCampaign(copyEntityDialog.id, copyEntityTargetId, user.id);
      } else {
        await copyMonsterToCampaign(copyEntityDialog.id, copyEntityTargetId, user.id);
      }
      setCopyEntityDialog(null);
      setCopyEntityTargetId(null);
    } catch (err) {
      setCopyEntityError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCopyingEntity(false);
    }
  };

  const handleConfirmUnassignEntity = async () => {
    if (!unassignEntityTarget) return;
    setIsUnassigningEntity(true);
    try {
      if (unassignEntityTarget.kind === 'npc') {
        await unassignNPCFromCampaign(unassignEntityTarget.id);
        setNpcs((prev) => prev.filter((n) => n.id !== unassignEntityTarget.id));
      } else {
        await unassignMonsterFromCampaign(unassignEntityTarget.id);
        setMonsters((prev) => prev.filter((m) => m.id !== unassignEntityTarget.id));
      }
      setUnassignEntityTarget(null);
    } catch (err) {
      console.error('Errore rimozione dalla campagna:', err);
    } finally {
      setIsUnassigningEntity(false);
    }
  };

  const handleConfirmDeleteEntity = async () => {
    if (!deleteEntityTarget) return;
    setIsDeletingEntity(true);
    try {
      if (deleteEntityTarget.kind === 'npc') {
        await deleteNPC(deleteEntityTarget.id);
        setNpcs((prev) => prev.filter((n) => n.id !== deleteEntityTarget.id));
      } else {
        await deleteMonster(deleteEntityTarget.id);
        setMonsters((prev) => prev.filter((m) => m.id !== deleteEntityTarget.id));
      }
      setDeleteEntityTarget(null);
    } catch (err) {
      console.error('Errore eliminazione:', err);
    } finally {
      setIsDeletingEntity(false);
    }
  };

  // ─── Cartelle: azioni condivise dalle 4 sezioni ───
  // Un'unica implementazione parametrizzata su entityType/folders/setFolders
  // invece di 4 copie quasi identiche - solo la persistenza finale (quale
  // servizio chiamare) cambia da sezione a sezione, e resta nei rispettivi
  // onMoveCard passati a ciascuna istanza di useFolderDragDrop piu' sotto.

  const handleCreateFolder = async (entityType: FolderEntityType, setFolders: React.Dispatch<React.SetStateAction<Folder[]>>) => {
    if (!activeCampaign || !session) return;
    try {
      const folder = await createFolder(activeCampaign.id, entityType, 'Nuova cartella', SERVER_BASE, session.access_token);
      setFolders((prev) => [...prev, folder]);
      setOpenFolders((prev) => ({ ...prev, [folder.id]: true }));
      // Entra subito in rinomina, stesso pattern di handleAddCustomTab in
      // useEntityTabs.ts: crea e passa direttamente al nome invece di
      // lasciare "Nuova cartella" come placeholder da rinominare dopo.
      setRenamingFolderId(folder.id);
      setRenameFolderDraft('Nuova cartella');
    } catch (err) {
      console.error('Errore creazione cartella:', err);
    }
  };

  const handleCommitFolderRename = async (folder: Folder, setFolders: React.Dispatch<React.SetStateAction<Folder[]>>) => {
    const name = renameFolderDraft.trim();
    setRenamingFolderId(null);
    if (!name || name === folder.name || !session) return;
    setFolders((prev) => prev.map((f) => (f.id === folder.id ? { ...f, name } : f)));
    try {
      await renameFolder(folder.id, name, SERVER_BASE, session.access_token);
    } catch (err) {
      console.error('Errore rinomina cartella:', err);
      setFolders((prev) => prev.map((f) => (f.id === folder.id ? folder : f)));
    }
  };

  const handleReorderFolders = async (
    folders: Folder[],
    newOrderIds: string[],
    setFolders: React.Dispatch<React.SetStateAction<Folder[]>>,
  ) => {
    if (!session) return;
    const byId = new Map(folders.map((f) => [f.id, f]));
    const reordered = newOrderIds.map((id, idx) => ({ ...(byId.get(id) as Folder), position: idx }));
    setFolders(reordered);
    await Promise.all(
      reordered.map((f) => {
        const original = byId.get(f.id);
        if (original && original.position === f.position) return null;
        return reorderFolder(f.id, f.position, SERVER_BASE, session.access_token)
          .catch((err) => console.error('Errore riordino cartella:', err));
      })
    );
  };

  const handleConfirmDeleteFolder = async () => {
    if (!deleteFolderTarget || !session) return;
    setIsDeletingFolder(true);
    try {
      await deleteFolder(deleteFolderTarget.id, SERVER_BASE, session.access_token);
      const clearFolder = <T extends { id: string; folderId?: string | null }>(list: T[]) =>
        list.map((item) => (item.folderId === deleteFolderTarget.id ? { ...item, folderId: null } : item));
      switch (deleteFolderTarget.entityType) {
        case 'character':
          setCharFolders((prev) => prev.filter((f) => f.id !== deleteFolderTarget.id));
          setPlayerRows((prev) => prev.map((row) => ({ ...row, characters: clearFolder(row.characters) })));
          break;
        case 'premade':
          setPremadeFolders((prev) => prev.filter((f) => f.id !== deleteFolderTarget.id));
          setAvailablePremades((prev) => clearFolder(prev));
          break;
        case 'npc':
          setNpcFolders((prev) => prev.filter((f) => f.id !== deleteFolderTarget.id));
          setNpcs((prev) => clearFolder(prev));
          break;
        case 'monster':
          setMonsterFolders((prev) => prev.filter((f) => f.id !== deleteFolderTarget.id));
          setMonsters((prev) => clearFolder(prev));
          break;
      }
      setDeleteFolderTarget(null);
    } catch (err) {
      console.error('Errore eliminazione cartella:', err);
    } finally {
      setIsDeletingFolder(false);
    }
  };

  // PG/Precompilati: endpoint stretto dedicato (POST /characters/:id/folder)
  // - PUT /campaigns/:id/characters/:id (saveCharacterAsGm) fa un update
  // integrale con default hardcoded sui campi non passati e distruggerebbe
  // cornice/token/sheet_data se richiamato con solo folderId (vedi commento
  // sul server). Aggiorna playerRows/availablePremades via bump del token di
  // reload esistente invece di un update ottimistico locale: il PG spostato
  // potrebbe non essere nell'array giusto (es. draggato da Precompilati a
  // Personaggi non e' un caso reale oggi, ma un refetch resta piu' semplice
  // e sicuro di due update ottimistici paralleli su due liste diverse).
  const handleMoveCharacterFolder = async (characterId: string, folderId: string | null) => {
    if (!session) return;
    try {
      await setCharacterFolder(characterId, folderId, SERVER_BASE, session.access_token);
      setPlayersReloadToken((t) => t + 1);
    } catch (err) {
      console.error('Errore assegnazione cartella personaggio:', err);
    }
  };

  // PNG/Mostri: gia' owned per intero dal GM, nessun rischio di scrivere su
  // un PG altrui - update ottimistico + rollback su errore, stesso schema di
  // handleToggleCharacterAvailable poco sotto. saveNPC/saveMonster fanno un
  // round-trip sull'oggetto intero (non un update parziale), quindi passare
  // lo spread completo con solo folderId cambiato e' sicuro.
  const handleMoveNpcFolder = async (npcId: string, folderId: string | null) => {
    const npc = npcs.find((n) => n.id === npcId);
    if (!npc || !activeCampaign) return;
    const updated = { ...npc, folderId };
    setNpcs((prev) => prev.map((n) => (n.id === npcId ? updated : n)));
    try {
      await saveNPC(activeCampaign.id, updated);
    } catch (err) {
      console.error('Errore assegnazione cartella PNG:', err);
      setNpcs((prev) => prev.map((n) => (n.id === npcId ? npc : n)));
    }
  };

  const handleMoveMonsterFolder = async (monsterId: string, folderId: string | null) => {
    const monster = monsters.find((m) => m.id === monsterId);
    if (!monster || !activeCampaign) return;
    const updated = { ...monster, folderId };
    setMonsters((prev) => prev.map((m) => (m.id === monsterId ? updated : m)));
    try {
      await saveMonster(activeCampaign.id, updated);
    } catch (err) {
      console.error('Errore assegnazione cartella mostro:', err);
      setMonsters((prev) => prev.map((m) => (m.id === monsterId ? monster : m)));
    }
  };

  // Le 4 sezioni condividono lo stesso containerRef (un solo grid flat, vedi
  // il commento sul markup piu' sotto) - ogni istanza filtra i propri target
  // di drop tramite entityType, senza contaminarsi a vicenda pur osservando
  // tutte lo stesso DOM (vedi il commento su resolveFolderDropTarget in
  // useFolderDragDrop.ts).
  const foldersContainerRef = useRef<HTMLDivElement | null>(null);
  const charFolderDnd = useFolderDragDrop({
    canEdit: isOwner,
    entityType: 'character',
    folderIds: charFolders.map((f) => f.id),
    onReorderFolders: (order) => handleReorderFolders(charFolders, order, setCharFolders),
    onMoveCard: handleMoveCharacterFolder,
    containerRef: foldersContainerRef,
  });
  const premadeFolderDnd = useFolderDragDrop({
    canEdit: isOwner,
    entityType: 'premade',
    folderIds: premadeFolders.map((f) => f.id),
    onReorderFolders: (order) => handleReorderFolders(premadeFolders, order, setPremadeFolders),
    onMoveCard: handleMoveCharacterFolder,
    containerRef: foldersContainerRef,
  });
  const npcFolderDnd = useFolderDragDrop({
    canEdit: isOwner,
    entityType: 'npc',
    folderIds: npcFolders.map((f) => f.id),
    onReorderFolders: (order) => handleReorderFolders(npcFolders, order, setNpcFolders),
    onMoveCard: handleMoveNpcFolder,
    containerRef: foldersContainerRef,
  });
  const monsterFolderDnd = useFolderDragDrop({
    canEdit: isOwner,
    entityType: 'monster',
    folderIds: monsterFolders.map((f) => f.id),
    onReorderFolders: (order) => handleReorderFolders(monsterFolders, order, setMonsterFolders),
    onMoveCard: handleMoveMonsterFolder,
    containerRef: foldersContainerRef,
  });

  const isFolderOpen = (folderId: string) => openFolders[folderId] ?? true;
  const toggleFolderOpen = (folderId: string) => setOpenFolders((prev) => ({ ...prev, [folderId]: !isFolderOpen(folderId) }));

  // Costruisce le voci del menu ⋮ di un PG - condivisa tra playerRows (di un
  // giocatore, row valorizzato) e availablePremades (del GM, row assente).
  // Chiamata solo quando il menu e' comunque visibile (isOwner || isSelfOwned,
  // vedi cornerAction sulle card), quindi Modifica/Duplica/Copia/Rimuovi/
  // Elimina sono sempre incluse - cambiano solo Disponibile per i giocatori
  // (solo GM sul proprio precompilato) e Rilascia al GM (solo il giocatore
  // proprietario, mai il GM) e Rimuovi il giocatore (solo su playerRows).
  const buildCharacterMenuItems = (ch: PlayerCharacterSummary, row: PlayerRow | null) => {
    const isSelfOwned = ch.ownerProfileId === user?.id;
    const items: EntityKebabMenuItem[] = [
      {
        key: 'edit',
        icon: <Pencil className="h-4 w-4" />,
        label: 'Modifica',
        onClick: () => handleOpenEditCharacter(ch.id),
      },
      {
        key: 'duplicate',
        icon: <CopyPlus className="h-4 w-4" />,
        label: 'Duplica',
        onClick: () => handleDuplicateCharacterCard(ch.id),
      },
    ];

    if (isOwner && isSelfOwned) {
      items.push({
        key: 'available-for-players',
        icon: <UserCog className="h-4 w-4" />,
        label: 'Disponibile per i giocatori',
        onClick: () => handleToggleCharacterAvailable(ch),
        keepOpenAfterClick: true,
        trailing: <Switch checked={ch.availableForPlayers} className="pointer-events-none" />,
      });
    }

    items.push({
      key: 'copy',
      icon: <Copy className="h-4 w-4" />,
      label: "Copia in un'altra campagna",
      onClick: () => setCopyDialogChar(ch),
    });

    if (!isOwner && isSelfOwned && ch.claimableOrigin && ch.originalOwnerProfileId != null && ch.ownerProfileId !== ch.originalOwnerProfileId) {
      items.push({
        key: 'release',
        icon: <Undo2 className="h-4 w-4" />,
        label: 'Rilascia al GM',
        onClick: () => setReleaseCharTarget(ch),
      });
    }

    // "Elimina" solo su un PG che possiedi davvero (il GM sul proprio
    // precompilato, o il giocatore sul proprio PG) - mai al GM su un PG di
    // un giocatore: non e' suo, non deve poterlo eliminare (ne' con
    // deleteCharacter ne' con deleteCharacterAsGm). "Rimuovi giocatore" sotto
    // resta lo strumento corretto per il GM su un PG altrui.
    if (isSelfOwned) {
      items.push({
        key: 'delete',
        icon: <Trash2 className="h-4 w-4" />,
        label: 'Elimina',
        onClick: () => setDeleteCharTarget(ch),
        danger: true,
      });
    }

    // Due ampiezze distinte, entrambe solo GM (mai al giocatore proprietario):
    // "Rimuovi dalla campagna" tocca solo questo PG (il giocatore resta
    // membro con eventuali altri suoi PG); "Rimuovi giocatore" e' il
    // sovrainsieme che rimuove tutti i PG del giocatore in questa campagna
    // piu' la membership.
    if (isOwner) {
      items.push({
        key: 'unassign',
        icon: <UserMinus className="h-4 w-4" />,
        label: 'Rimuovi dalla campagna',
        onClick: () => setUnassignCharTarget(ch),
      });
    }

    if (isOwner && row) {
      items.push({
        key: 'remove-player',
        icon: <Users className="h-4 w-4" />,
        label: 'Rimuovi giocatore',
        onClick: () => setRemovePlayerTarget(row),
        danger: true,
      });
    }

    return items;
  };

  const buildEntityMenuItems = (kind: 'npc' | 'monster', entity: NPC | Monster) => {
    const items: EntityKebabMenuItem[] = [
      {
        key: 'duplicate',
        icon: <CopyPlus className="h-4 w-4" />,
        label: 'Duplica',
        onClick: () => handleDuplicateEntityCard(kind, entity.id),
      },
      {
        key: 'copy',
        icon: <Copy className="h-4 w-4" />,
        label: "Copia in un'altra campagna",
        onClick: () => setCopyEntityDialog({ kind, id: entity.id, name: entity.name || '', ruleset: entity.ruleset ?? null }),
      },
      {
        key: 'unassign',
        icon: <UserMinus className="h-4 w-4" />,
        label: 'Rimuovi dalla campagna',
        onClick: () => setUnassignEntityTarget({ kind, id: entity.id, name: entity.name || '' }),
      },
      {
        key: 'delete',
        icon: <Trash2 className="h-4 w-4" />,
        label: 'Elimina',
        onClick: () => setDeleteEntityTarget({ kind, id: entity.id, name: entity.name || '' }),
        danger: true,
      },
    ];
    return items;
  };

  const gmInitial = (gmDisplayName ?? 'G').trim().charAt(0).toUpperCase() || 'G';
  const { icon: QuickFilterIcon, label: quickFilterLabel } = quickFilterHeading(activeQuickFilter);

  const handleCoverUpdate = (patch: CampaignCoverPatch) => {
    if (!activeCampaign) return;
    void updateCampaign(activeCampaign.id, patch);
  };

  // ─── Render delle card, estratti in funzioni riusabili tra il loop dentro
  // una cartella e quello delle card sciolte (renderFolderedSection sotto) -
  // stesso identico JSX gia' in uso prima dell'introduzione delle cartelle,
  // solo spostato da inline a funzione per essere chiamato da due punti.
  const renderCharacterCard = (ch: PlayerCharacterSummary, row: PlayerRow) => (
    <EntityCard
      key={ch.id}
      variant="grid"
      name={ch.name}
      subtitle={ch.styleViaggio}
      secondaryText={ch.description}
      onClick={() => onOpenSessionEntity('pg', ch.id)}
      photoUrl={ch.portraitUrl}
      photoSourceUrl={ch.portraitSourceUrl}
      photoCropArea={ch.portraitCropArea}
      tokenColor={ch.tokenColor}
      tokenBackgroundColor={ch.tokenBackgroundColor}
      tokenBorderStyle={ch.tokenBorderStyle}
      tokenBorderThickness={ch.tokenBorderThickness}
      tokenBorderVisible={ch.tokenBorderVisible}
      tokenBorderLabel={ch.tokenBorderLabel}
      cornerAction={
        isOwner || ch.ownerProfileId === user?.id ? (
          <EntityKebabMenu
            colors={menuColors}
            buttonClassName={photoCornerButtonClass}
            items={buildCharacterMenuItems(ch, row)}
            footer={
              <div className="px-2 py-1.5 text-xs" style={{ color: menuColors.text, opacity: 0.7 }}>
                {ch.createdAt && (
                  <div>Creato il {new Date(ch.createdAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                )}
                {row.joinedAt && (
                  <div>Unito alla campagna il {new Date(row.joinedAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                )}
              </div>
            }
          />
        ) : undefined
      }
    >
      <div className="flex items-center gap-1.5 truncate text-[11px] text-[var(--dash-accent-2)]">
        {ch.ownerAvatarUrl ? (
          <img src={ch.ownerAvatarUrl} alt="" className="h-4 w-4 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--dash-accent)] text-[8px] font-semibold text-[var(--dash-text-strong)]">
            {(row.displayName ?? '?').trim().charAt(0).toUpperCase() || '?'}
          </span>
        )}
        <span className="truncate">{row.displayName ?? 'Sconosciuto'}</span>
      </div>
    </EntityCard>
  );

  const renderPremadeCard = (ch: PlayerCharacterSummary) => (
    <EntityCard
      key={ch.id}
      variant="grid"
      name={ch.name}
      subtitle={ch.styleViaggio}
      secondaryText={ch.description}
      onClick={() => onOpenSessionEntity('pg', ch.id)}
      photoUrl={ch.portraitUrl}
      photoSourceUrl={ch.portraitSourceUrl}
      photoCropArea={ch.portraitCropArea}
      tokenColor={ch.tokenColor}
      tokenBackgroundColor={ch.tokenBackgroundColor}
      tokenBorderStyle={ch.tokenBorderStyle}
      tokenBorderThickness={ch.tokenBorderThickness}
      tokenBorderVisible={ch.tokenBorderVisible}
      tokenBorderLabel={ch.tokenBorderLabel}
      cornerAction={
        isOwner ? (
          <EntityKebabMenu
            colors={menuColors}
            buttonClassName={photoCornerButtonClass}
            items={buildCharacterMenuItems(ch, null)}
          />
        ) : undefined
      }
    />
  );

  const renderNpcCard = (npc: NPC) => (
    <EntityCard
      key={npc.id}
      variant="grid"
      name={npc.name || 'PNG senza nome'}
      subtitle={npc.role || 'PNG'}
      onClick={() => onOpenSessionEntity('png', npc.id)}
      photoUrl={npc.portraitImageUrl}
      photoSourceUrl={npc.portraitSourceImageUrl}
      photoCropArea={npc.portraitCropArea}
      tokenColor={npc.tokenColor}
      tokenBackgroundColor={npc.tokenBackgroundColor}
      tokenBorderStyle={npc.tokenBorderStyle}
      tokenBorderThickness={npc.tokenBorderThickness}
      tokenBorderVisible={npc.tokenBorderVisible}
      tokenBorderLabel={npc.tokenBorderLabel}
      hiddenBadge={!npc.visibleToPlayers}
      cornerAction={
        isOwner ? (
          <EntityKebabMenu
            colors={menuColors}
            buttonClassName={photoCornerButtonClass}
            items={buildEntityMenuItems('npc', npc)}
            footer={
              <div className="px-2 py-1.5 text-xs" style={{ color: menuColors.text, opacity: 0.7 }}>
                {npc.createdAt && (
                  <div>Creato il {new Date(npc.createdAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                )}
              </div>
            }
          />
        ) : undefined
      }
    />
  );

  const renderMonsterCard = (monster: Monster) => (
    <EntityCard
      key={monster.id}
      variant="grid"
      name={monster.name || 'Mostro senza nome'}
      onClick={() => onOpenSessionEntity('mostro', monster.id)}
      photoUrl={monster.portraitImageUrl}
      photoSourceUrl={monster.portraitSourceImageUrl}
      photoCropArea={monster.portraitCropArea}
      tokenColor={monster.tokenColor}
      tokenBackgroundColor={monster.tokenBackgroundColor}
      tokenBorderStyle={monster.tokenBorderStyle}
      tokenBorderThickness={monster.tokenBorderThickness}
      tokenBorderVisible={monster.tokenBorderVisible}
      tokenBorderLabel={monster.tokenBorderLabel}
      hiddenBadge={!monster.visibleToPlayers}
      cornerAction={
        isOwner ? (
          <EntityKebabMenu
            colors={menuColors}
            buttonClassName={photoCornerButtonClass}
            items={buildEntityMenuItems('monster', monster)}
            footer={
              <div className="px-2 py-1.5 text-xs" style={{ color: menuColors.text, opacity: 0.7 }}>
                {monster.createdAt && (
                  <div>Creato il {new Date(monster.createdAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                )}
              </div>
            }
          />
        ) : undefined
      }
    />
  );

  // Cartelle di una sezione (righe espandibili + le card al loro interno,
  // se aperte) seguite dalla striscia "Senza cartella" - la stessa struttura
  // per tutte e 4 le sezioni, solo folders/setFolders/dnd/items/renderCard
  // cambiano. Le card sciolte (fuori da ogni cartella) restano fuori da
  // questa funzione: ogni sezione le renderizza a modo suo subito dopo,
  // riusando lo stesso renderCard passato qui.
  function renderFolderedSection<T extends { id: string; folderId?: string | null }>(
    entityType: FolderEntityType,
    folders: Folder[],
    setFolders: React.Dispatch<React.SetStateAction<Folder[]>>,
    dnd: typeof charFolderDnd,
    items: T[],
    renderCard: (item: T) => React.ReactNode,
  ) {
    return (
      <>
        {[...folders].sort((a, b) => a.position - b.position).map((folder) => {
          const folderItems = items.filter((it) => it.folderId === folder.id);
          const open = isFolderOpen(folder.id);
          return (
            <Fragment key={folder.id}>
              <FolderRow
                folder={folder}
                isOpen={open}
                onToggle={() => toggleFolderOpen(folder.id)}
                count={folderItems.length}
                canEdit={isOwner}
                isRenaming={renamingFolderId === folder.id}
                renameDraft={renameFolderDraft}
                onRenameDraftChange={setRenameFolderDraft}
                onStartRename={() => { setRenamingFolderId(folder.id); setRenameFolderDraft(folder.name); }}
                onCommitRename={() => handleCommitFolderRename(folder, setFolders)}
                onCancelRename={() => setRenamingFolderId(null)}
                onRequestDelete={() => setDeleteFolderTarget(folder)}
                onPointerDown={(e) => dnd.handlePointerDown(e, { kind: 'folder', id: folder.id })}
                isDropActive={dnd.dropTarget?.type === 'into-folder' && dnd.dropTarget.folderId === folder.id}
              />
              {open && folderItems.map((it) => (
                <div key={it.id} className="contents" onPointerDown={(e) => dnd.handlePointerDown(e, { kind: 'card', id: it.id })}>
                  {renderCard(it)}
                </div>
              ))}
            </Fragment>
          );
        })}
        {folders.length > 0 && (
          <UnfiledDropZone entityType={entityType} isDropActive={dnd.dropTarget?.type === 'unfiled'} />
        )}
      </>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto text-left select-none">
      <div className="relative">
        {activeCampaign ? (
          <CampaignCoverEditor campaign={activeCampaign} canEdit={isOwner} onUpdate={handleCoverUpdate} />
        ) : (
          <div className="h-60 w-full shrink-0 bg-[var(--dash-panel)]" />
        )}

        {/* Riga pulsanti sessione + pillole quick-filter sovrapposta al
            banner, non sotto - stessa griglia 320px/1fr E stesso gap-6 della
            sezione contenuti qui sotto (md:grid-cols-[320px_1fr]) cosi' le
            due righe restano allineate sia verticalmente sia orizzontalmente
            (un gap-3 qui, diverso dal gap-6 sotto, aveva spostato di 12px la
            colonna 2 - da qui il disallineamento del titolo "Personaggi"
            rispetto a "PNG"/"Mostri" piu' sotto nella griglia delle card).
            absolute (non contribuisce all'altezza del contenitore relative,
            che resta quella del solo banner) - z-40, sopra tutto cio' che
            c'e' nel banner (max z-30 li' dentro).

            bottom-2 (non top-[88%]): un ancoraggio percentuale dall'alto è
            una frazione dell'altezza REALE del contenitore, che pero' non è
            costante - h-60 fisso (240px) senza immagine, aspect-[3.8/1]
            variabile con la larghezza pagina (es. ~368px) con immagine. Lo
            stesso 88% produceva quindi un residuo diverso in pixel tra il
            fondo della riga e il fondo del banner nei due casi, e il pt-4
            del contenuto sotto si sommava sopra un residuo già diverso -
            da qui la distanza incoerente segnalata. Un ancoraggio fisso dal
            basso rende quel residuo costante indipendentemente dall'altezza
            del contenitore, in entrambi i rami. */}
        {playersLoaded && (
          <div className="absolute inset-x-0 bottom-2 z-40 grid grid-cols-1 gap-6 px-8 md:grid-cols-[320px_1fr]">
            <div className="flex flex-col gap-3">
              {isOwner && (
                <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleToggleSession}
                  disabled={isToggling}
                  className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    sessionActive
                      ? 'border-red-800 bg-red-900/40 text-red-200 hover:bg-red-900/60'
                      : 'border-[var(--dash-accent)] bg-[var(--dash-accent)] text-[var(--dash-text-strong)] hover:bg-[var(--dash-accent-2)]'
                  }`}
                >
                  {isToggling ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : sessionActive ? (
                    <Square className="h-3.5 w-3.5" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  {sessionActive ? 'Termina' : 'Avvia sessione'}
                </button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-3 py-1.5 text-xs font-semibold text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-surface-2)]"
                    >
                      {inviteCopied ? <Check className="h-3.5 w-3.5" /> : <KeyRound className="h-3.5 w-3.5" />}
                      {inviteCopied ? 'Copiato!' : 'Invita giocatori'}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="w-56 border-[var(--dash-border-soft)] bg-[var(--dash-surface)] text-[var(--dash-text)]"
                  >
                    <DropdownMenuItem
                      onSelect={handleInvitePlayers}
                      className="text-[var(--dash-text)] focus:bg-[var(--dash-surface-2)] focus:text-[var(--dash-text-strong)]"
                    >
                      <KeyRound className="h-4 w-4" /> Copia codice invito
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => setShowInviteByNameModal(true)}
                      className="text-[var(--dash-text)] focus:bg-[var(--dash-surface-2)] focus:text-[var(--dash-text-strong)]"
                    >
                      <Users className="h-4 w-4" /> Invita per nome…
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {activeCampaign && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex shrink-0 items-center justify-center rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-2.5 text-[var(--dash-muted)] transition-colors hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)]"
                        aria-label="Menu campagna"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="w-64 border-[var(--dash-border-soft)] bg-[var(--dash-surface)] text-[var(--dash-text)]"
                    >
                      <DropdownMenuItem
                        onSelect={() => setShowEditForm(true)}
                        className="text-[var(--dash-text)] focus:bg-[var(--dash-surface-2)] focus:text-[var(--dash-text-strong)]"
                      >
                        <Pencil className="h-4 w-4" /> Impostazioni Campagna
                      </DropdownMenuItem>
                      <DropdownMenuItem disabled className="text-[var(--dash-text)]">
                        <Copy className="h-4 w-4" /> Duplica Campagna
                        <span className="ml-auto text-[10px] text-[var(--dash-muted)]">Prossimamente</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem disabled className="text-[var(--dash-text)]">
                        <UserCog className="h-4 w-4" /> Seleziona nuovo Game Master
                        <span className="ml-auto text-[10px] text-[var(--dash-muted)]">Prossimamente</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem disabled className="text-[var(--dash-text)]">
                        <FileDown className="h-4 w-4" /> Esporta le note
                        <span className="ml-auto text-[10px] text-[var(--dash-muted)]">Prossimamente</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-[var(--dash-border-soft)]" />
                      <DropdownMenuItem
                        onSelect={() => setConfirmDeleteOpen(true)}
                        className="text-[var(--dash-danger-text)] focus:bg-[var(--dash-danger-bg)] focus:text-[var(--dash-danger-text)]"
                      >
                        <Trash2 className="h-4 w-4" /> Cancella campagna
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-[var(--dash-border-soft)]" />
                      <div className="px-2 py-1.5 text-xs text-[var(--dash-muted)]">
                        Creata da {gmDisplayName ?? 'Game Master'} il{' '}
                        {new Date(activeCampaign.createdAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[var(--dash-muted)]">
                <QuickFilterIcon className="h-4 w-4" /> {quickFilterLabel}
              </h2>
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" onClick={() => setActiveQuickFilter('all')} className={pillClass(activeQuickFilter === 'all')}>
                  <LayoutGrid className="h-3.5 w-3.5" /> Tutti
                </button>
                <button type="button" onClick={() => setActiveQuickFilter('pg')} className={pillClass(activeQuickFilter === 'pg')}>
                  <Users className="h-3.5 w-3.5" /> Personaggi
                </button>
                <button type="button" onClick={() => setActiveQuickFilter('premades')} className={pillClass(activeQuickFilter === 'premades')}>
                  <Package className="h-3.5 w-3.5" /> Precompilati
                </button>
                <button type="button" onClick={() => setActiveQuickFilter('npc')} className={pillClass(activeQuickFilter === 'npc')}>
                  <Ghost className="h-3.5 w-3.5" /> PNG
                </button>
                <button type="button" onClick={() => setActiveQuickFilter('monster')} className={pillClass(activeQuickFilter === 'monster')}>
                  <Skull className="h-3.5 w-3.5" /> Mostri
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* pt-4: spazio tra la fine del banner/riga pulsanti overlay
          (top-[88%] li' sopra) e l'inizio di questa griglia - "Personaggi"
          (prime card, subito qui sotto) non ha un header in griglia con
          margine proprio come "PNG"/"Mostri" (mt-2 + gap-4 interno,
          invariato) piu' sotto. pt-12, pt-8, pt-6, pt-4 e pt-2 (round
          precedenti) lasciavano ancora una fascia vuota eccessiva sotto la
          riga pulsanti - pt-1 e' meno del valore originale del contenitore
          (pt-6), a compensare lo spazio gia' presente sotto la riga
          overlay del banner (ora bottom-2, altezza-indipendente). */}
      <div className="flex flex-1 flex-col gap-6 p-8 pt-1">
      {playersLoaded && (
        <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-[320px_1fr]">
          {/* Colonna 1: card GM compatta (non il riquadro verticale con
              portrait grande) - niente "truncate" sul nome, il testo va a
              capo se serve invece di tagliarsi a un carattere come nelle
              versioni precedenti confinate in una colonna troppo stretta.
              La riga pulsanti sessione che stava qui è ora sovrapposta al
              banner qui sopra (stessa griglia 320px/1fr), non più qui. */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-3">
              {gmAvatarUrl ? (
                <img
                  src={gmAvatarUrl}
                  alt=""
                  className="h-9 w-9 shrink-0 rounded-full object-cover"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              ) : (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--dash-accent)] text-sm font-semibold text-[var(--dash-text-strong)]">
                  {gmInitial}
                </span>
              )}
              <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                <span className="break-words text-sm font-medium text-[var(--dash-text-strong)]">{gmDisplayName ?? 'Game Master'}</span>
                <span className="inline-flex shrink-0 items-center rounded-full border border-[var(--dash-accent)] bg-[var(--dash-accent)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--dash-accent-2)]">
                  GM
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-4">
              <h3 className="mb-3 text-sm font-semibold text-[var(--dash-text-strong)]">Note di campagna</h3>
              <CampaignNotesPanel
                campaignId={activeCampaign.id}
                accessToken={session?.access_token}
                canEdit={isOwner}
                savedTabOrder={activeCampaign.tabOrder}
                onPersistTabOrder={(order) => updateCampaign(activeCampaign.id, { tabOrder: order })}
              />
            </div>
          </div>

          {/* Colonna 2+3: la riga titolo+pillole che stava qui è ora
              sovrapposta al banner qui sopra (stessa griglia 320px/1fr),
              non più qui - resta solo la griglia delle card. */}
          <div className="flex flex-col gap-3">

          {/* sempre esattamente 2 card per riga (grid-cols-2, non auto-fill)
              - le due colonne 1fr si espandono per riempire tutto lo spazio
              a destra della colonna 1, non restano piccole. minmax(200px,1fr)
              invece del semplice 1fr: stesso numero di colonne garantito, ma
              con un minimo protetto che evita la stessa classe di bug di
              troncamento vista finora se lo schermo e' stretto. */}
          <div ref={foldersContainerRef} className="grid grid-cols-[repeat(2,minmax(200px,1fr))] content-start gap-4">
            {(activeQuickFilter === 'all' || activeQuickFilter === 'pg') && (
              <>
                <FolderSectionHeader icon={Users} label="Personaggi" isOwner={isOwner} onCreateFolder={() => handleCreateFolder('character', setCharFolders)} />
                {renderFolderedSection(
                  'character', charFolders, setCharFolders, charFolderDnd,
                  playerRows.flatMap((row) => row.characters.map((ch) => ({ ...ch, row }))),
                  (item) => renderCharacterCard(item, item.row),
                )}
                {playerRows.map((row) =>
                  row.characters.length > 0 ? (
                    row.characters.filter((ch) => !ch.folderId).map((ch) => (
                      <div key={ch.id} className="contents" onPointerDown={(e) => charFolderDnd.handlePointerDown(e, { kind: 'card', id: ch.id })}>
                        {renderCharacterCard(ch, row)}
                      </div>
                    ))
                  ) : (
                    <EntityCard
                      key={row.profileId}
                      variant="grid"
                      name={row.displayName ?? 'Giocatore'}
                      badge={
                        <span className="inline-flex items-center rounded-full border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-2 py-0.5 text-[10px] font-medium text-[var(--dash-muted)]">
                          Nessun personaggio
                        </span>
                      }
                    />
                  )
                )}
              </>
            )}

            {activeQuickFilter === 'premades' && (
              <>
                <FolderSectionHeader icon={Package} label="Precompilati" isOwner={isOwner} onCreateFolder={() => handleCreateFolder('premade', setPremadeFolders)} />
                {renderFolderedSection('premade', premadeFolders, setPremadeFolders, premadeFolderDnd, availablePremades, renderPremadeCard)}
                {availablePremades.length === 0 ? (
                  <div className="col-span-2 rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] px-5 py-8 text-center">
                    <Package className="mx-auto mb-3 h-10 w-10 text-[var(--dash-muted)]" />
                    <div className="text-xs uppercase tracking-[0.16em] text-[var(--dash-accent-2)]">Nessun personaggio precompilato disponibile</div>
                    <p className="mt-2 text-xs text-[var(--dash-muted)]">
                      Marca un PG come "Disponibile per i giocatori" dal menu ⋮ in Personaggi per farlo comparire qui.
                    </p>
                  </div>
                ) : (
                  availablePremades.filter((ch) => !ch.folderId).map((ch) => (
                    <div key={ch.id} className="contents" onPointerDown={(e) => premadeFolderDnd.handlePointerDown(e, { kind: 'card', id: ch.id })}>
                      {renderPremadeCard(ch)}
                    </div>
                  ))
                )}
              </>
            )}

            {(activeQuickFilter === 'all' || activeQuickFilter === 'npc') && isOwner && npcsLoaded && npcs.length > 0 && (
              <>
                <FolderSectionHeader icon={Ghost} label="PNG" isOwner={isOwner} onCreateFolder={() => handleCreateFolder('npc', setNpcFolders)} />
                {renderFolderedSection('npc', npcFolders, setNpcFolders, npcFolderDnd, npcs, renderNpcCard)}
                {npcs.filter((npc) => !npc.folderId).map((npc) => (
                  <div key={npc.id} className="contents" onPointerDown={(e) => npcFolderDnd.handlePointerDown(e, { kind: 'card', id: npc.id })}>
                    {renderNpcCard(npc)}
                  </div>
                ))}
              </>
            )}

            {(activeQuickFilter === 'all' || activeQuickFilter === 'monster') && isOwner && monstersLoaded && monsters.length > 0 && (
              <>
                <FolderSectionHeader icon={Skull} label="Mostri" isOwner={isOwner} onCreateFolder={() => handleCreateFolder('monster', setMonsterFolders)} />
                {renderFolderedSection('monster', monsterFolders, setMonsterFolders, monsterFolderDnd, monsters, renderMonsterCard)}
                {monsters.filter((monster) => !monster.folderId).map((monster) => (
                  <div key={monster.id} className="contents" onPointerDown={(e) => monsterFolderDnd.handlePointerDown(e, { kind: 'card', id: monster.id })}>
                    {renderMonsterCard(monster)}
                  </div>
                ))}
              </>
            )}
          </div>
          </div>
        </div>
      )}

      {copyDialogChar && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-[var(--dash-accent)] bg-[var(--dash-surface)] p-6 shadow-2xl">
            <h3 className="mb-1 text-lg font-semibold text-[var(--dash-text-strong)]">Copia in un'altra campagna</h3>
            <p className="mb-4 text-sm text-[var(--dash-muted)]">
              "{copyDialogChar.name}" verrà copiato (l'originale resta qui) nella campagna scelta, con lo stesso proprietario.
            </p>
            {copyCharError && (
              <div className="mb-3 rounded-lg border border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)] px-3 py-2 text-sm text-[var(--dash-danger-text)]">
                {copyCharError}
              </div>
            )}
            {compatibleCopyTargets(copyDialogChar).length === 0 ? (
              <p className="mb-4 text-sm text-[var(--dash-muted)]">Nessun'altra tua campagna compatibile per ruleset.</p>
            ) : (
              <div className="mb-4 flex flex-col gap-1.5">
                {compatibleCopyTargets(copyDialogChar).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCopyTargetCampaignId(c.id)}
                    className={`rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                      copyTargetCampaignId === c.id
                        ? 'border-[var(--dash-accent)] bg-[var(--dash-accent)]/15 text-[var(--dash-text-strong)]'
                        : 'border-[var(--dash-border-soft)] bg-[var(--dash-panel)] text-[var(--dash-text)] hover:bg-[var(--dash-surface-2)]'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setCopyDialogChar(null); setCopyTargetCampaignId(null); setCopyCharError(null); }}
                disabled={isCopyingChar}
                className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-4 py-2 text-sm text-[var(--dash-text-strong)]"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleConfirmCopyCharacter}
                disabled={!copyTargetCampaignId || isCopyingChar}
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--dash-accent)] bg-[var(--dash-accent)] px-4 py-2 text-sm font-semibold text-[var(--dash-text-strong)] disabled:opacity-50"
              >
                {isCopyingChar && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Copia
              </button>
            </div>
          </div>
        </div>
      )}


      {removePlayerTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-[var(--dash-danger-border)] bg-[var(--dash-surface)] p-6 shadow-2xl">
            <h3 className="mb-2 font-semibold text-[var(--dash-text-strong)]">Rimuovere il giocatore dalla campagna?</h3>
            <p className="mb-3 text-sm text-[var(--dash-muted)]">
              {removePlayerTarget.displayName ?? 'Il giocatore'} e tutti i suoi personaggi verranno rimossi da questa campagna. L'account e i personaggi restano intatti, semplicemente non parteciperanno più qui.
            </p>
            {removePlayerError && (
              <div className="mb-3 rounded-lg border border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)] px-3 py-2 text-sm text-[var(--dash-danger-text)]">
                {removePlayerError}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRemovePlayerTarget(null)}
                disabled={isRemovingPlayer}
                className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-4 py-2 text-sm text-[var(--dash-text-strong)]"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleConfirmRemovePlayer}
                disabled={isRemovingPlayer}
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)] px-4 py-2 text-sm font-semibold text-[var(--dash-danger-text)] hover:bg-[var(--dash-danger-border)]"
              >
                {isRemovingPlayer && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Rimuovi
              </button>
            </div>
          </div>
        </div>
      )}

      {editingCharacter && (
        <CharacterCreationWizard
          onClose={() => setEditingCharacter(null)}
          onAdd={handleSaveEditedCharacter}
          existingCharacters={charactersRaw.filter((r) => r.id !== editingCharacter.id).map((r) => ({ id: r.id, name: r.name }))}
          initialCharacter={editingCharacter}
        />
      )}

      {deleteCharTarget && (
        <ConfirmDialog
          title="Eliminare questo personaggio?"
          message={`"${deleteCharTarget.name}" e tutti i suoi dati verranno eliminati definitivamente. Questa azione non è reversibile.`}
          confirmLabel="Elimina"
          onConfirm={handleConfirmDeleteCharacter}
          onCancel={() => setDeleteCharTarget(null)}
        />
      )}

      {releaseCharTarget && (
        <ConfirmDialog
          title="Rilasciare questo personaggio?"
          message={`"${releaseCharTarget.name}" tornerà al GM e sarà di nuovo disponibile per altri giocatori. Tutte le statistiche e le tab restano intatte.`}
          confirmLabel="Rilascia"
          danger={false}
          onConfirm={handleConfirmReleaseCharacter}
          onCancel={() => setReleaseCharTarget(null)}
        />
      )}

      {unassignCharTarget && (
        <ConfirmDialog
          title="Rimuovere il personaggio dalla campagna?"
          message={`"${unassignCharTarget.name}" non verrà eliminato: resterà nel database del giocatore, semplicemente non farà più parte di questa campagna.`}
          confirmLabel="Rimuovi"
          danger={false}
          onConfirm={handleConfirmUnassignCharacter}
          onCancel={() => setUnassignCharTarget(null)}
        />
      )}

      {deleteFolderTarget && (
        <ConfirmDialog
          title="Eliminare questa cartella?"
          message={`"${deleteFolderTarget.name}" verrà eliminata. Le card al suo interno non vengono eliminate: torneranno semplicemente senza cartella.`}
          confirmLabel="Elimina"
          onConfirm={handleConfirmDeleteFolder}
          onCancel={() => setDeleteFolderTarget(null)}
        />
      )}

      {copyEntityDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-[var(--dash-accent)] bg-[var(--dash-surface)] p-6 shadow-2xl">
            <h3 className="mb-1 text-lg font-semibold text-[var(--dash-text-strong)]">Copia in un'altra campagna</h3>
            <p className="mb-4 text-sm text-[var(--dash-muted)]">
              "{copyEntityDialog.name}" verrà copiato (l'originale resta qui) nella campagna scelta.
            </p>
            {copyEntityError && (
              <div className="mb-3 rounded-lg border border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)] px-3 py-2 text-sm text-[var(--dash-danger-text)]">
                {copyEntityError}
              </div>
            )}
            {compatibleCopyEntityTargets().length === 0 ? (
              <p className="mb-4 text-sm text-[var(--dash-muted)]">Nessun'altra tua campagna compatibile per ruleset.</p>
            ) : (
              <div className="mb-4 flex flex-col gap-1.5">
                {compatibleCopyEntityTargets().map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCopyEntityTargetId(c.id)}
                    className={`rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                      copyEntityTargetId === c.id
                        ? 'border-[var(--dash-accent)] bg-[var(--dash-accent)]/15 text-[var(--dash-text-strong)]'
                        : 'border-[var(--dash-border-soft)] bg-[var(--dash-panel)] text-[var(--dash-text)] hover:bg-[var(--dash-surface-2)]'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setCopyEntityDialog(null); setCopyEntityTargetId(null); setCopyEntityError(null); }}
                disabled={isCopyingEntity}
                className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-4 py-2 text-sm text-[var(--dash-text-strong)]"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleConfirmCopyEntity}
                disabled={!copyEntityTargetId || isCopyingEntity}
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--dash-accent)] bg-[var(--dash-accent)] px-4 py-2 text-sm font-semibold text-[var(--dash-text-strong)] disabled:opacity-50"
              >
                {isCopyingEntity && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Copia
              </button>
            </div>
          </div>
        </div>
      )}

      {unassignEntityTarget && (
        <ConfirmDialog
          title="Rimuovere dalla campagna?"
          message={`"${unassignEntityTarget.name}" non verrà eliminato: resterà nel database, semplicemente non farà più parte di questa campagna.`}
          confirmLabel="Rimuovi"
          onConfirm={handleConfirmUnassignEntity}
          onCancel={() => setUnassignEntityTarget(null)}
        />
      )}

      {deleteEntityTarget && (
        <ConfirmDialog
          title="Eliminare definitivamente?"
          message={`"${deleteEntityTarget.name}" verrà eliminato definitivamente. Questa azione non è reversibile.`}
          confirmLabel="Elimina"
          onConfirm={handleConfirmDeleteEntity}
          onCancel={() => setDeleteEntityTarget(null)}
        />
      )}

      {showInviteByNameModal && activeCampaign && (
        <InviteByNameModal
          campaignId={activeCampaign.id}
          onClose={() => setShowInviteByNameModal(false)}
        />
      )}

      {showEditForm && activeCampaign && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--dash-accent)] bg-[var(--dash-surface)] p-6 shadow-2xl">
            <h3 className="mb-4 text-lg font-semibold text-[var(--dash-text-strong)]">Impostazioni Campagna</h3>
            {editError && (
              <div className="mb-4 rounded-lg border border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)] px-3 py-2 text-sm text-[var(--dash-danger-text)]">
                {editError}
              </div>
            )}
            <CampaignForm
              initial={activeCampaign}
              onSave={handleEditCampaign}
              onCancel={() => { setShowEditForm(false); setEditError(null); }}
              isSubmitting={isSubmittingEdit}
            />
          </div>
        </div>
      )}

      {confirmDeleteOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-[var(--dash-danger-border)] bg-[var(--dash-surface)] p-6 shadow-2xl">
            <h3 className="mb-2 font-semibold text-[var(--dash-text-strong)]">Elimina campagna</h3>
            <p className="mb-3 text-sm text-[var(--dash-muted)]">
              Questa azione è irreversibile. Tutti i dati della campagna nel server saranno eliminati.
            </p>
            {deleteError && (
              <div className="mb-3 rounded-lg border border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)] px-3 py-2 text-sm text-[var(--dash-danger-text)]">
                {deleteError}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(false)}
                disabled={isDeleting}
                className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-4 py-2 text-sm text-[var(--dash-text-strong)]"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleDeleteCampaign}
                disabled={isDeleting}
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)] px-4 py-2 text-sm font-semibold text-[var(--dash-danger-text)] hover:bg-[var(--dash-danger-border)]"
              >
                {isDeleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Elimina
              </button>
            </div>
          </div>
        </div>
      )}

      {autoClosedNotice && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-800 bg-amber-900/30 px-4 py-2 text-sm text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          La sessione precedente era rimasta attiva da più di un'ora senza attività ed è stata chiusa automaticamente.
        </div>
      )}

      {!isOwner && (
        <div className="flex flex-col items-center gap-3 text-center">
          {!sessionActive ? (
            <p className="text-sm text-[var(--dash-muted)]">
              In attesa che il Game Master avvii la sessione di gioco...
            </p>
          ) : gmOnline ? (
            <p className="text-sm text-[var(--dash-accent-2)]">
              Sessione in corso — pronta per giocare.
            </p>
          ) : (
            <p className="text-sm text-[var(--dash-muted)]">
              Sessione in pausa: il Game Master si è momentaneamente disconnesso. Attendi il suo ritorno.
            </p>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
