import { Fragment, useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { User, ChevronDown, ChevronRight, Loader2, Skull, Ghost, FolderPlus } from 'lucide-react';
import { Copy, UserMinus, UserX, Eye, EyeOff, Search, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { useFolderSection } from '../shared/useFolderSection';
import { FolderBreadcrumb } from '../shared/FolderBreadcrumb';
import { FolderIconPicker } from '../shared/FolderIconPicker';
import { PALETTE_COLORS, DEFAULT_PALETTE_COLORS, type PaletteId } from '../ui/paletteColors';
import { projectId } from '/utils/supabase/info';
import type { Character } from '../../../types/character';
import { loadCharacters, loadCharactersViaServer, saveCharacter as saveCharacterToSupabase, saveCharacterAsGm, mapRowToCharacter, unassignCharacterFromCampaign } from '../../../services/supabase/charactersService';
import {
  loadNPCs, loadMonsters,
  saveNPC, saveMonster,
  deleteNPC, deleteMonster,
  unassignNPCFromCampaign, unassignMonsterFromCampaign,
  copyNPCToCampaign, copyMonsterToCampaign,
  toCamelCase,
} from '../../../services/supabase/entitiesService';
import { useAuth } from '../../auth/AuthContext';
import { useCampaign } from '../../campaigns/CampaignContext';
import { useCampaignChannel } from '../../../services/realtime/campaignChannel';
import { useRuleset } from '../../campaigns/RulesetContext';
import { isRulesetCompatible, type RulesetId } from '../../campaigns/campaignTypes';
import { EntityKebabMenu } from './shared/EntityKebabMenu';
import { EntityDetailView } from './shared/EntityDetailView';
import { EntityPortraitImage } from '../shared/EntityPortraitImage';
import type { CropAreaPercent } from '../shared/SourceCroppedImage';
import { useFolderDragDrop } from './shared/useFolderDragDrop';
import { TokenDragGhost } from './shared/TokenDragGhost';

interface PlayerCharacter extends Character {
  player: string;
  notes: string;
  ruleset?: RulesetId | null;
}

type EntityKind = 'pg' | 'png' | 'mostro';
interface ListEntry {
  kind: EntityKind;
  id: string;
  name: string;
  subtitle: string;
  portraitUrl?: string;
  /** Sorgente+crop percentuale del registro immagini condiviso (Fase 1) -
   *  quando presenti insieme, hanno priorita' su portraitUrl (vedi
   *  EntityPortraitImage). Assenti = comportamento invariato. */
  portraitSourceUrl?: string | null;
  portraitCropArea?: CropAreaPercent | null;
  ownerProfileId?: string | null;
  hiddenFromPlayers?: boolean;
}

const SERVER_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-771c5bfd`;

function getCurrentPaletteColors() {
  const el = document.querySelector('[data-dashboard-palette]');
  const palette = el?.getAttribute('data-dashboard-palette') as PaletteId | null;
  return palette && PALETTE_COLORS[palette] ? PALETTE_COLORS[palette] : DEFAULT_PALETTE_COLORS;
}

function SectionHeader({
  title, count, isOpen, onToggle, extraAction,
}: {
  title: string;
  count: number;
  isOpen: boolean;
  onToggle: () => void;
  /** Pulsante "Nuova cartella" (Fase 4, solo PNG/Mostri, solo GM, solo a
   *  sezione aperta) - reso come sibling del toggle (non annidato dentro,
   *  altrimenti sarebbe un <button> dentro un <button>, HTML non valido e un
   *  click sopra farebbe scattare anche il collapse/espandi). Assente =
   *  comportamento invariato (Personaggi, o chiunque non sia GM). */
  extraAction?: React.ReactNode;
}) {
  return (
    <div className="flex w-full items-center justify-between gap-1 px-4 py-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
      >
        <span className="truncate text-xs font-semibold uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
          {title} <span className="text-[var(--dash-muted)]">({count})</span>
        </span>
        {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--dash-muted)]" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--dash-muted)]" />}
      </button>
      {extraAction}
    </div>
  );
}

interface SessionCharactersPanelProps {
  // requestId incrementale: garantisce che l'effect sotto si riattivi anche
  // se si richiede due volte di seguito la stessa entita' (kind+id identici
  // non farebbero altrimenti scattare le dipendenze). Usato da CampaignHome.tsx
  // (via App.tsx/SessionRightSidebar.tsx) per aprire questo stesso pannello
  // - non uno nuovo - con l'entita' cliccata gia' selezionata invece del
  // primo personaggio di default.
  initialSelection?: { kind: EntityKind; id: string; requestId: number } | null;
}

export function SessionCharactersPanel({ initialSelection = null }: SessionCharactersPanelProps) {
  const { user, session } = useAuth();
  const { activeCampaignId, activeCampaign } = useCampaign();
  const { campaigns: ownedCampaigns, joinedCampaigns } = useCampaign();
  const { isHSC } = useRuleset();

  const [characters, setCharacters] = useState<PlayerCharacter[]>([]);
  const [npcs, setNpcs] = useState<any[]>([]);
  const [monsters, setMonsters] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState<{ kind: EntityKind; id: string } | null>(null);
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
    } catch (error) {
      console.error('Errore caricamento scheda unificata:', error);
    } finally {
      if (loadSeqRef.current === mySeq) setIsLoading(false);
    }
  }, [activeCampaignId, session?.access_token]);

  useEffect(() => { loadData(); }, [loadData]);

  // Default "primo personaggio" - separato da loadData apposta: loadData e'
  // una useCallback con deps [activeCampaignId, session?.access_token], la
  // sua closure non "vede" mai un selected aggiornato dopo il mount (non e'
  // nelle sue dipendenze), quindi un controllo li' dentro sovrascriverebbe
  // sempre qualunque selezione impostata nel frattempo da initialSelection
  // sotto (bug osservato: si apriva sempre il primo personaggio). Qui invece
  // l'effect e' ricreato ad ogni render, quindi legge sempre il "selected"
  // corrente - si applica solo se non c'e' gia' una selezione (di default o
  // da initialSelection).
  useEffect(() => {
    if (selected || !characters[0]) return;
    setSelected({ kind: 'pg', id: characters[0].id });
  }, [characters]);

  // Sovrascrive la selezione (di default o corrente) con quella richiesta
  // dall'esterno - vince sia sul default "primo personaggio" sopra sia su
  // una selezione gia' in corso se il pannello era gia' aperto.
  useEffect(() => {
    if (!initialSelection) return;
    setSelected({ kind: initialSelection.kind, id: initialSelection.id });
  }, [initialSelection?.requestId]);

  // Canale campaign:{id} condiviso (src/services/realtime/campaignChannel.ts)
  // - vedi il commento gemello in CampaignHome.tsx per il perché: questo
  // componente non possiede più un proprio canale, si registra su quello
  // condiviso insieme a CampaignHome/SessionNotesPanel/useEntityTabs.
  const handleBroadcast = (msg: any) => {
    const data = msg?.payload ?? {};
    const table = data.table;

    // Cartelle (bug realtime 2026-07-23): niente merge fine-grained qui -
    // useFolderSection.tsx non espone lo stato folders per una patch
    // puntuale, solo un reload completo (reloadFolders, vedi il commento li'
    // per il perche' e' la scelta giusta). entity_type sta su record
    // (INSERT/UPDATE) o su old_record (DELETE, dove record non esiste).
    // Personaggi non ha mai cartelle (Fase 4), nessun ramo da gestire per
    // quell'entity_type.
    if (table === 'folders') {
      const entityType = (data.record ?? data.old_record)?.entity_type;
      if (entityType === 'npc') npcSection.reloadFolders();
      else if (entityType === 'monster') monsterSection.reloadFolders();
      return;
    }

    if (data.operation === 'DELETE') {
      const deletedId = data.old_record?.id;
      if (!deletedId) return;
      if (table === 'characters') {
        setCharacters(prev => prev.filter(c => c.id !== deletedId));
      } else if (table === 'npcs') {
        setNpcs(prev => prev.filter(n => n.id !== deletedId));
      } else if (table === 'monsters') {
        setMonsters(prev => prev.filter(m => m.id !== deletedId));
      } else if (table === 'entity_notes') {
        // Gestito dentro useEntityTabs (sottoscrizione dedicata), non qui.
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
      // Un UPDATE con campaign_id diverso dalla campagna corrente significa
      // che il PG è stato scollegato/spostato altrove (assign-campaign non
      // cancella mai la riga, aggiorna solo campaign_id) - va tolto da
      // questa lista, non aggiornato in place. Bug reale trovato il
      // 2026-07-21: senza questo controllo il PG restava visibile qui
      // anche dopo lo scollegamento, con dati "aggiornati" ma campaign_id
      // ormai diverso, perché nessun codice controllava mai questo campo.
      if ((row as any).campaign_id !== activeCampaignId) {
        setCharacters(prev => prev.filter(c => c.id !== mapped.id));
      } else {
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
      }
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
    } else if (table === 'entity_notes') {
      // Gestito dentro useEntityTabs (sottoscrizione dedicata), non qui.
    } else {
      console.warn('[handleBroadcast] tabella non gestita:', table);
    }
  };

  useCampaignChannel(activeCampaignId, {
    onBroadcast: {
      INSERT: handleBroadcast,
      UPDATE: handleBroadcast,
      DELETE: handleBroadcast,
    },
  });

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

  const handleConfirmCopy = async () => {
    if (!selected || !copyTargetId || !user) return;
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
        await copyNPCToCampaign(selected.id, copyTargetId, user.id);
      } else if (selected.kind === 'mostro') {
        await copyMonsterToCampaign(selected.id, copyTargetId, user.id);
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
      await unassignCharacterFromCampaign(selectedChar.id, SERVER_BASE, accessToken);
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

  // Elimina tutte le tab personalizzate (comprese quelle nascoste) di
  // un'entità prima di eliminarla definitivamente. Le tab non sono più
  // accessibili da qui (lo stato di useEntityTabs vive dentro
  // EntityDetailView), quindi le recuperiamo fresche con una GET invece di
  // leggerle da uno stato locale.
  const deleteAllCustomTabs = async (entityType: 'npc' | 'monster', entityId: string, accessToken: string) => {
    const res = await fetch(`${SERVER_BASE}/campaigns/${activeCampaignId}/notes?entityType=${entityType}&entityId=${entityId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json().catch(() => ({ notes: [] }));
    await Promise.all((data.notes ?? []).map((tab: any) =>
      fetch(`${SERVER_BASE}/notes/${tab.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } })
    ));
  };

  // Eliminazione definitiva: cancella anche le tab personalizzate associate
  // (comprese quelle nascoste), come promesso nel ConfirmDialog.
  const handleDeleteNpcOrMonster = async () => {
    setActionError(null);
    try {
      const accessToken = session?.access_token ?? '';
      if (selected?.kind === 'png' && selectedNpc) {
        await deleteAllCustomTabs('npc', selectedNpc.id, accessToken);
        await deleteNPC(selectedNpc.id);
        setNpcs(prev => prev.filter(n => n.id !== selectedNpc.id));
        setSelected(null);
      } else if (selected?.kind === 'mostro' && selectedMonster) {
        await deleteAllCustomTabs('monster', selectedMonster.id, accessToken);
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

  // Fase 4: assegna/sposta PNG/Mostro in una cartella - PNG/Mostri sono
  // sempre interamente del GM (mai un rischio di scrivere sull'entita' di
  // qualcun altro), stesso schema ottimistico + rollback di
  // handleToggleVisibleToPlayers sopra. saveNPC/saveMonster fanno un
  // round-trip sull'oggetto intero, quindi lo spread con solo folderId
  // cambiato e' sicuro. Stessa identica logica di CampaignHome.tsx
  // (handleMoveNpcFolder/handleMoveMonsterFolder) - duplicata qui perche'
  // opera sullo stato locale (npcs/monsters) di questo componente, non su
  // quello di CampaignHome.
  const handleMoveNpcFolder = async (npcId: string, folderId: string | null) => {
    const npc = npcs.find((n) => n.id === npcId);
    if (!npc || !activeCampaign) return;
    // "Sposta di un livello" (vedi commento gemello in CampaignHome.tsx):
    // rilasciato sulla propria cartella attuale -> promuovi al genitore di
    // quella, invece di un no-op.
    let resolvedFolderId = folderId;
    if (folderId !== null && npc.folderId === folderId) {
      resolvedFolderId = npcSection.folders.find((f) => f.id === folderId)?.parentFolderId ?? null;
    }
    const updated = { ...npc, folderId: resolvedFolderId };
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
    let resolvedFolderId = folderId;
    if (folderId !== null && monster.folderId === folderId) {
      resolvedFolderId = monsterSection.folders.find((f) => f.id === folderId)?.parentFolderId ?? null;
    }
    const updated = { ...monster, folderId: resolvedFolderId };
    setMonsters((prev) => prev.map((m) => (m.id === monsterId ? updated : m)));
    try {
      await saveMonster(activeCampaign.id, updated);
    } catch (err) {
      console.error('Errore assegnazione cartella mostro:', err);
      setMonsters((prev) => prev.map((m) => (m.id === monsterId ? monster : m)));
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

  const selectedEntityRuleset: RulesetId | null | undefined =
    selectedChar?.ruleset ?? selectedNpc?.ruleset ?? selectedMonster?.ruleset;
  const compatibleCampaigns = (isOwner ? ownedCampaigns : joinedCampaigns).filter(
    (c) => c.id !== activeCampaignId && isRulesetCompatible(selectedEntityRuleset, activeCampaign?.ruleset, c.ruleset)
  );

  // I giocatori (non GM) non vedono affatto in lista i PNG/Mostri non resi visibili
  const visibleNpcs = isOwner ? npcs : npcs.filter(n => n.visibleToPlayers);
  const visibleMonsters = isOwner ? monsters : monsters.filter(m => m.visibleToPlayers);

  const canDragEntity = (kind: EntityKind, ownerProfileId?: string | null) => {
    if (isOwner) return true; // il GM può trascinare tutto: PG, PNG, Mostri
    if (kind === 'pg' && ownerProfileId === user?.id) return true; // il giocatore solo il proprio PG
    return false;
  };

  // Fase 3: sostituisce il drag nativo (draggable/onDragStart/dataTransfer)
  // con il sistema a puntatore condiviso di useFolderDragDrop.ts (stesso
  // usato dal sistema cartelle in CampaignHome.tsx). Nessuna cartella
  // integrata qui ancora - folderIds/onReorderFolders/onMoveCard/
  // onNestFolder restano no-op perche' senza elementi data-folder-id nel
  // DOM di questo pannello resolveFolderDropTarget non risolve mai un
  // target cartella (vedi il commento sulla funzione). canEdit:true perche'
  // il permesso di trascinare e' gia' deciso per-entita' da canDragEntity
  // sopra (chiamato prima di ogni handlePointerDown sotto), non a livello
  // di intero hook. onDropOutside: punto di estensione per la Mappa futura
  // (vedi useFolderDragDrop.ts) - solo il contratto, nessun consumer ancora.
  const dnd = useFolderDragDrop({
    canEdit: true,
    entityType: 'session-entity',
    folderIds: [],
    onReorderFolders: () => {},
    onMoveCard: () => {},
    onNestFolder: () => {},
    onDropOutside: undefined,
  });

  // Risolve l'entita' attualmente trascinata a partire dall'id composito
  // "<kind>:<id>" passato a handlePointerDown sotto (il kind non viaggia
  // altrimenti nel DraggedItem dell'hook, che e' generico folder/card) -
  // usata solo per disegnare il ghost (vedi TokenDragGhost sotto), nessuna
  // logica di persistenza qui.
  const draggedEntityInfo = (() => {
    if (!dnd.draggedItem) return null;
    const sep = dnd.draggedItem.id.indexOf(':');
    if (sep === -1) return null;
    const kind = dnd.draggedItem.id.slice(0, sep) as EntityKind;
    const id = dnd.draggedItem.id.slice(sep + 1);
    const source = kind === 'pg' ? characters : kind === 'png' ? npcs : kind === 'mostro' ? monsters : null;
    const entity = source?.find((e: any) => e.id === id) ?? null;
    return entity ? { kind, entity } : null;
  })();

  const npcToEntry = (n: any): ListEntry => ({
    kind: 'png', id: n.id, name: n.name, subtitle: n.role || 'PNG',
    portraitUrl: n.portraitImageUrl,
    portraitSourceUrl: n.portraitSourceImageUrl,
    portraitCropArea: n.portraitCropArea,
    hiddenFromPlayers: !n.visibleToPlayers,
  });
  const monsterToEntry = (m: any): ListEntry => ({
    kind: 'mostro', id: m.id, name: m.name, subtitle: 'Mostro',
    portraitUrl: m.portraitImageUrl,
    portraitSourceUrl: m.portraitSourceImageUrl,
    portraitCropArea: m.portraitCropArea,
    hiddenFromPlayers: !m.visibleToPlayers,
  });

  // Fase 4: PNG e Mostri (mai Personaggi, resta piatta) organizzabili in
  // cartelle - riuso 1:1 di useFolderSection.tsx (stessa infrastruttura di
  // CampaignHome.tsx, entityType 'npc'/'monster', nessun cambio lato
  // servizio/DB). containerRef condiviso con dnd sopra (stesso principio
  // "un solo containerRef, filtrato per entityType" di CampaignHome).
  // canEdit/enabled: isOwner - le cartelle sono gestite solo dal GM, e per
  // chi non e' GM restano semplicemente vuote (folders:[]): il fallback
  // piatto sotto (non isOwner) mostra comunque tutti i PNG/Mostri visibili,
  // indipendentemente da come il GM li ha organizzati - decisione esplicita
  // (vedi piano Fase 4): niente navigazione cartelle in sola lettura per i
  // giocatori qui, a differenza dei Precompilati in CampaignHome.
  // maxVisibleDescendantShortcuts ridotto (4 invece del default 10 di
  // CampaignHome): colonna fissa 256px, 10 scorciatoie in wrap
  // occuperebbero piu' righe di quante ne valga la pena in cosi' poco
  // spazio. onDropOutside: non passato in questa fase (vedi il commento su
  // dnd sopra) - il pointerdown di un item PNG/Mostro qui appartiene
  // interamente al drag-in-cartella, non al contratto Mappa futura (che
  // resta solo per Personaggi finche' la Mappa non esiste davvero).
  const npcSection = useFolderSection({
    entityType: 'npc',
    campaignId: activeCampaignId,
    sessionKey: user?.id ?? null,
    accessToken: session?.access_token ?? null,
    canEdit: isOwner,
    enabled: isOwner,
    items: npcs,
    renderCard: (n) => renderListItem(npcToEntry(n), { disableOwnDrag: true }),
    renderGhostCard: (n) => renderListItem(npcToEntry(n)),
    itemLabel: 'PNG',
    onMoveCard: handleMoveNpcFolder,
    onFolderDeleted: async (deletedFolderId, cascade) => {
      if (cascade) {
        setNpcs(await loadNPCs(activeCampaignId));
      } else {
        setNpcs((prev) => prev.map((n) => (n.folderId === deletedFolderId ? { ...n, folderId: null } : n)));
      }
    },
    containerRef: dnd.containerRef,
    maxVisibleDescendantShortcuts: 4,
  });
  const monsterSection = useFolderSection({
    entityType: 'monster',
    campaignId: activeCampaignId,
    sessionKey: user?.id ?? null,
    accessToken: session?.access_token ?? null,
    canEdit: isOwner,
    enabled: isOwner,
    items: monsters,
    renderCard: (m) => renderListItem(monsterToEntry(m), { disableOwnDrag: true }),
    renderGhostCard: (m) => renderListItem(monsterToEntry(m)),
    itemLabel: 'Mostri',
    onMoveCard: handleMoveMonsterFolder,
    onFolderDeleted: async (deletedFolderId, cascade) => {
      if (cascade) {
        setMonsters(await loadMonsters(activeCampaignId));
      } else {
        setMonsters((prev) => prev.map((m) => (m.folderId === deletedFolderId ? { ...m, folderId: null } : m)));
      }
    },
    containerRef: dnd.containerRef,
    maxVisibleDescendantShortcuts: 4,
  });

  // "Nessun PNG/mostro" (Fase 4): per il GM va valutato sulla cartella
  // attualmente aperta (currentFolderId), non sul totale della sezione -
  // altrimenti il messaggio resterebbe nascosto anche quando si e'
  // navigati dentro una cartella vuota. Stesso identico calcolo che
  // renderRows() fa internamente per childFolders/directItems (nessuna API
  // pubblica dedicata in useFolderSection per "vista corrente vuota").
  const npcCurrentViewEmpty = isOwner
    && npcSection.folders.filter((f) => f.parentFolderId === npcSection.currentFolderId).length === 0
    && npcs.filter((n) => (n.folderId ?? null) === npcSection.currentFolderId).length === 0;
  const monsterCurrentViewEmpty = isOwner
    && monsterSection.folders.filter((f) => f.parentFolderId === monsterSection.currentFolderId).length === 0
    && monsters.filter((m) => (m.folderId ?? null) === monsterSection.currentFolderId).length === 0;

  if (isLoading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[var(--dash-muted)]" /></div>;
  }

  // disableOwnDrag (Fase 4): usato quando questa riga e' gia' avvolta da un
  // wrapper esterno che gestisce da solo l'intero pointerdown (vedi
  // renderRows() in useFolderSection.tsx per PNG/Mostri foderati) - senza
  // questo, l'avatar avvierebbe COMUNQUE il drag standalone verso `dnd`
  // (Fase 3, pensato per Personaggi/Mappa futura) in parallelo a quello di
  // npcSection/monsterSection sullo stesso gesto, con due hook che
  // inseguono lo stesso pointermove/pointerup in conflitto. "Personaggi"
  // (mai foderata) e il fallback piatto di PNG/Mostri per i non-GM restano
  // sull'unico dnd standalone, comportamento Fase 3 invariato.
  const renderListItem = (entry: ListEntry, options?: { disableOwnDrag?: boolean }) => (
    <button
      key={`${entry.kind}-${entry.id}`}
      type="button"
      onClick={() => setSelected({ kind: entry.kind, id: entry.id })}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
        selected?.kind === entry.kind && selected.id === entry.id ? 'bg-[var(--dash-surface-2)]' : 'hover:bg-[var(--dash-surface-2)]/50'
      }`}
    >
      <div
        onPointerDown={options?.disableOwnDrag ? undefined : (e) => {
          if (canDragEntity(entry.kind, entry.ownerProfileId)) {
            dnd.handlePointerDown(e, { kind: 'card', id: `${entry.kind}:${entry.id}` });
          }
        }}
        className={`relative h-9 w-9 shrink-0 overflow-hidden rounded-md bg-[var(--dash-input)] ${
          canDragEntity(entry.kind, entry.ownerProfileId) ? 'cursor-grab active:cursor-grabbing' : ''
        }`}
      >
        {entry.portraitUrl || (entry.portraitSourceUrl && entry.portraitCropArea) ? (
          <EntityPortraitImage
            portraitImageUrl={entry.portraitUrl}
            portraitSourceImageUrl={entry.portraitSourceUrl}
            portraitCropArea={entry.portraitCropArea}
            alt={entry.name}
            style={{ width: '100%', height: '100%' }}
            draggable={false}
          />
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
    <div ref={dnd.containerRef} className="flex h-full select-none">
      <div className="w-64 shrink-0 overflow-y-auto border-r border-[var(--dash-border-soft)] py-3">
        <SectionHeader title="Personaggi" count={characters.length} isOpen={openSections.pg} onToggle={() => toggleSection('pg')} />
        {openSections.pg && (
          <div className="space-y-1 px-2 pb-2">
            {characters.map(c => renderListItem({
              kind: 'pg', id: c.id, name: c.name, subtitle: (c as any).ownerDisplayName || c.player || c.style,
              portraitUrl: c.portraitImageUrl,
              portraitSourceUrl: c.portraitSourceImageUrl,
              portraitCropArea: c.portraitCropArea,
              ownerProfileId: (c as any).ownerProfileId,
            }))}
            {characters.length === 0 && <div className="px-3 py-2 text-xs text-[var(--dash-muted)]">Nessun personaggio.</div>}
          </div>
        )}

        <SectionHeader
          title="PNG" count={visibleNpcs.length} isOpen={openSections.png} onToggle={() => toggleSection('png')}
          extraAction={isOwner && openSections.png ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={npcSection.handleCreateFolder}
                  disabled={npcSection.createDisabledReason !== null}
                  aria-label="Nuova cartella"
                  className={`flex shrink-0 items-center rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-1.5 text-[var(--dash-muted)] transition-colors ${
                    npcSection.createDisabledReason !== null ? 'cursor-not-allowed opacity-40' : 'hover:text-[var(--dash-text-strong)]'
                  }`}
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left">{npcSection.createDisabledReason ?? 'Nuova cartella'}</TooltipContent>
            </Tooltip>
          ) : undefined}
        />
        {openSections.png && (
          <div className="space-y-1 px-2 pb-2">
            {isOwner ? (
              <>
                {npcSection.folderPath.length > 0 && (
                  <FolderBreadcrumb
                    sectionLabel="PNG" path={npcSection.folderPath} entityType="npc"
                    dropTarget={npcSection.dnd.dropTarget} onNavigate={npcSection.setCurrentFolderId}
                    compact
                  />
                )}
                {npcSection.renderRows()}
                {npcCurrentViewEmpty && <div className="px-3 py-2 text-xs text-[var(--dash-muted)]">Nessun PNG.</div>}
              </>
            ) : (
              <>
                {visibleNpcs.map(n => renderListItem(npcToEntry(n)))}
                {visibleNpcs.length === 0 && <div className="px-3 py-2 text-xs text-[var(--dash-muted)]">Nessun PNG.</div>}
              </>
            )}
          </div>
        )}

        <SectionHeader
          title="Mostri" count={visibleMonsters.length} isOpen={openSections.mostro} onToggle={() => toggleSection('mostro')}
          extraAction={isOwner && openSections.mostro ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={monsterSection.handleCreateFolder}
                  disabled={monsterSection.createDisabledReason !== null}
                  aria-label="Nuova cartella"
                  className={`flex shrink-0 items-center rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-1.5 text-[var(--dash-muted)] transition-colors ${
                    monsterSection.createDisabledReason !== null ? 'cursor-not-allowed opacity-40' : 'hover:text-[var(--dash-text-strong)]'
                  }`}
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left">{monsterSection.createDisabledReason ?? 'Nuova cartella'}</TooltipContent>
            </Tooltip>
          ) : undefined}
        />
        {openSections.mostro && (
          <div className="space-y-1 px-2 pb-2">
            {isOwner ? (
              <>
                {monsterSection.folderPath.length > 0 && (
                  <FolderBreadcrumb
                    sectionLabel="Mostri" path={monsterSection.folderPath} entityType="monster"
                    dropTarget={monsterSection.dnd.dropTarget} onNavigate={monsterSection.setCurrentFolderId}
                    compact
                  />
                )}
                {monsterSection.renderRows()}
                {monsterCurrentViewEmpty && <div className="px-3 py-2 text-xs text-[var(--dash-muted)]">Nessun mostro.</div>}
              </>
            ) : (
              <>
                {visibleMonsters.map(m => renderListItem(monsterToEntry(m)))}
                {visibleMonsters.length === 0 && <div className="px-3 py-2 text-xs text-[var(--dash-muted)]">Nessun mostro.</div>}
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {!selected ? (
          <div className="flex h-full items-center justify-center text-sm text-[var(--dash-muted)]">Seleziona una scheda dalla lista</div>
        ) : selectedChar ? (
          <EntityDetailView
            entityType="character"
            entity={selectedChar}
            onUpdate={(updated) => updateCharacter(selectedChar.id, updated)}
            canEdit={canEdit}
            campaignId={activeCampaignId}
            accessToken={session?.access_token}
            isHSC={isHSC}
            showRail={false}
            onPointerDown={canDragEntity('pg', (selectedChar as any).ownerProfileId) ? (e) => dnd.handlePointerDown(e, { kind: 'card', id: `pg:${selectedChar.id}` }) : undefined}
            headerAction={canEdit ? (
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
            ) : undefined}
          />
        ) : selectedNpc ? (
          <EntityDetailView
            entityType="npc"
            entity={selectedNpc}
            onUpdate={(updated) => {
              setNpcs(prev => prev.map(n => (n.id === updated.id ? updated : n)));
              saveNPC(activeCampaignId, updated).catch(err => console.error('Errore salvataggio PNG:', err));
            }}
            canEdit={isOwner}
            campaignId={activeCampaignId}
            accessToken={session?.access_token}
            isHSC={isHSC}
            showRail={false}
            onPointerDown={canDragEntity('png') ? (e) => dnd.handlePointerDown(e, { kind: 'card', id: `png:${selectedNpc.id}` }) : undefined}
            headerAction={isOwner ? (
              <EntityKebabMenu
                colors={menuColors}
                items={buildEntityMenuItems(selectedNpc, 'Elimina il PNG')}
                footer={entityMenuFooter(selectedNpc)}
              />
            ) : undefined}
          />
        ) : selectedMonster ? (
          <EntityDetailView
            entityType="monster"
            entity={selectedMonster}
            onUpdate={(updated) => {
              setMonsters(prev => prev.map(m => (m.id === updated.id ? updated : m)));
              saveMonster(activeCampaignId, updated).catch(err => console.error('Errore salvataggio mostro:', err));
            }}
            canEdit={isOwner}
            campaignId={activeCampaignId}
            accessToken={session?.access_token}
            isHSC={isHSC}
            showRail={false}
            onPointerDown={canDragEntity('mostro') ? (e) => dnd.handlePointerDown(e, { kind: 'card', id: `mostro:${selectedMonster.id}` }) : undefined}
            headerAction={isOwner ? (
              <EntityKebabMenu
                colors={menuColors}
                items={buildEntityMenuItems(selectedMonster, 'Elimina il mostro')}
                footer={entityMenuFooter(selectedMonster)}
              />
            ) : undefined}
          />
        ) : null}
      </div>
    </div>
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
        message={`${(selected?.kind === 'mostro' ? selectedMonster?.name : selectedNpc?.name) ?? "L'entità"} verrà scollegato da questa campagna. Potrai ritrovarlo e riassegnarlo da Personaggi → PNG e mostri → Non in campagna.`}
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
    {/* Dialog icona/eliminazione cartella per PNG/Mostri - stesso schema di
        CampaignHome.tsx (una coppia per sezione, ognuna col proprio stato
        indipendente da useFolderSection, al piu' una aperta alla volta). */}
    {[npcSection, monsterSection].map((section) => (
      <Fragment key={section.itemLabel}>
        {section.iconPickerFolder && (
          <FolderIconPicker
            selectedIconId={section.iconPickerFolder.icon}
            onSelect={section.selectFolderIcon}
            onClose={section.closeIconPicker}
          />
        )}
        {section.deleteFolderTarget && (
          <ConfirmDialog
            title="Eliminare questa cartella?"
            message={
              section.deleteFolderCascadeContent
                ? `"${section.deleteFolderTarget.name}" e tutto il suo contenuto verranno eliminati definitivamente. Questa azione non è reversibile.`
                : `"${section.deleteFolderTarget.name}" verrà eliminata. Le card al suo interno non vengono eliminate: torneranno semplicemente senza cartella.`
            }
            confirmLabel={section.deleteFolderCascadeContent ? 'Elimina tutto' : 'Elimina'}
            extraContent={section.deleteFolderContents && (
              <label className="flex items-start gap-2 text-sm text-[var(--dash-text)]">
                <input
                  type="checkbox"
                  checked={section.deleteFolderCascadeContent}
                  onChange={(e) => section.setDeleteFolderCascadeContent(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Elimina anche il contenuto: {section.deleteFolderContents.itemCount} {section.itemLabel}
                  {section.deleteFolderContents.folderCount > 0 && ` e ${section.deleteFolderContents.folderCount} sotto-cartell${section.deleteFolderContents.folderCount === 1 ? 'a' : 'e'}`}
                  {' '}verranno eliminati definitivamente.
                </span>
              </label>
            )}
            onConfirm={section.confirmDeleteFolder}
            onCancel={section.cancelDeleteFolder}
          />
        )}
      </Fragment>
    ))}
    {npcSection.renderGhost()}
    {monsterSection.renderGhost()}
    <TokenDragGhost
      entity={draggedEntityInfo ? {
        id: draggedEntityInfo.entity.id,
        name: draggedEntityInfo.entity.name,
        portraitImageUrl: draggedEntityInfo.entity.portraitImageUrl,
        portraitSourceImageUrl: draggedEntityInfo.entity.portraitSourceImageUrl,
        portraitCropArea: draggedEntityInfo.entity.portraitCropArea,
        tokenColor: draggedEntityInfo.entity.tokenColor,
        tokenBackgroundColor: draggedEntityInfo.entity.tokenBackgroundColor,
        tokenBorderStyle: draggedEntityInfo.entity.tokenBorderStyle,
        tokenBorderThickness: draggedEntityInfo.entity.tokenBorderThickness,
        tokenBorderVisible: draggedEntityInfo.entity.tokenBorderVisible,
      } : null}
      pointerPosition={dnd.pointerPosition}
      fallbackIcon={
        draggedEntityInfo?.kind === 'png' ? <Ghost className="h-4 w-4 text-[var(--dash-accent-2)]" />
          : draggedEntityInfo?.kind === 'mostro' ? <Skull className="h-4 w-4 text-[var(--dash-accent-2)]" />
          : <User className="h-4 w-4 text-[var(--dash-accent-2)]" />
      }
    />
    </>
  );
}
