import { useState, useEffect, useRef } from 'react';
import {
  Play, Square, Loader2, AlertTriangle, Users, Ghost, Skull,
  KeyRound, Check, MoreVertical, Pencil, Copy, UserCog, FileDown, Trash2, UserMinus,
  LayoutGrid, Package,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useCampaign } from './CampaignContext';
import { useCampaignChannel } from '../../services/realtime/campaignChannel';
import { loadCharactersByOwner, copyCharacterToCampaign } from '../../services/supabase/charactersService';
import { loadNPCs, loadMonsters, type NPC, type Monster } from '../../services/supabase/entitiesService';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { RulesetTag } from '../components/shared/RulesetTag';
import { EntityCard } from '../components/session/shared/EntityCard';
import { CampaignNotesPanel } from '../components/session/shared/CampaignNotesPanel';
import { CampaignForm } from './CampaignSelector';
import { InviteByNameModal } from './InviteByNameModal';
import { isRulesetCompatible, type CampaignCreateInput, type RulesetId } from './campaignTypes';
import type { TokenBorderStyle, TokenBorderThickness } from '../../types/tokenStyle';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '../components/ui/dropdown-menu';

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

export function CampaignHome({ onGoToManagement, onOpenSessionEntity }: CampaignHomeProps) {
  const { user, session } = useAuth();
  const { activeCampaign, campaigns, refreshCampaigns, refreshJoinedCampaigns, updateCampaign, deleteCampaign, generateInviteCode } = useCampaign();

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
  const [npcs, setNpcs] = useState<NPC[]>([]);
  const [npcsLoaded, setNpcsLoaded] = useState(false);
  const [monsters, setMonsters] = useState<Monster[]>([]);
  const [monstersLoaded, setMonstersLoaded] = useState(false);
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
  const [removeCharTarget, setRemoveCharTarget] = useState<PlayerCharacterSummary | null>(null);
  const [isRemovingChar, setIsRemovingChar] = useState(false);
  const [removeCharError, setRemoveCharError] = useState<string | null>(null);
  const [removePlayerTarget, setRemovePlayerTarget] = useState<PlayerRow | null>(null);
  const [isRemovingPlayer, setIsRemovingPlayer] = useState(false);
  const [removePlayerError, setRemovePlayerError] = useState<string | null>(null);
  // Bump per forzare un refetch di PG/PNG/Mostri dopo copia/rimozione dal
  // menu delle card, o dopo un evento members_change dal canale condiviso.
  const [playersReloadToken, setPlayersReloadToken] = useState(0);

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
    // DEBUG TEMPORANEO - terzo giro di diagnosi 2026-07-20/21: verifica se
    // questo effect si ri-esegue davvero quando playersReloadToken cambia.
    console.log('[DEBUG CampaignHome] fetch Players effect RI-ESEGUITO', {
      t: new Date().toISOString(), playersReloadToken, activeCampaignId: activeCampaign?.id, hasSession: !!session,
    });
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
        // Il GM ha gia' la propria riga dedicata (badge "GM") indipendentemente
        // dal fatto che possieda un PG - va escluso qui, all'ingresso
        // dell'unione, cosi' non puo' ricomparire ne' come membro ne' come
        // "orfano" piu' sotto, qualunque sia la provenienza del suo profileId.
        const members: { profileId: string; displayName: string | null; joinedAt: string | null }[] = (memberNamesData.members ?? [])
          .filter((m: any) => m.profileId !== activeCampaign.ownerId);

        const charsByOwner = new Map<string, PlayerCharacterSummary[]>();
        for (const ch of characters) {
          const ownerId = ch.owner_profile_id;
          if (!ownerId) continue;
          const list = charsByOwner.get(ownerId) ?? [];
          list.push({
            id: ch.id,
            name: ch.name,
            ownerProfileId: ownerId,
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
          });
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
        // DEBUG TEMPORANEO - terzo giro di diagnosi 2026-07-20/21
        console.log('[DEBUG CampaignHome] members_change handler CHIAMATO, sto per bump playersReloadToken', { t: new Date().toISOString() });
        setPlayersReloadToken((t) => {
          console.log('[DEBUG CampaignHome] setPlayersReloadToken updater eseguito', { t: new Date().toISOString(), prev: t, next: t + 1 });
          return t + 1;
        });
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
    return campaigns.filter(
      (c) => c.id !== activeCampaign.id && isRulesetCompatible(char.ruleset, activeCampaign.ruleset, c.ruleset)
    );
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

  const handleConfirmRemoveCharacter = async () => {
    if (!removeCharTarget || !session) return;
    setIsRemovingChar(true);
    setRemoveCharError(null);
    try {
      const accessToken = session.access_token;
      const res = await fetch(`${SERVER_BASE}/characters/${removeCharTarget.id}/assign-campaign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ campaignId: null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Errore durante la rimozione');
      setRemoveCharTarget(null);
      setPlayersReloadToken((t) => t + 1);
    } catch (err) {
      setRemoveCharError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRemovingChar(false);
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

  const gmInitial = (gmDisplayName ?? 'G').trim().charAt(0).toUpperCase() || 'G';
  const { icon: QuickFilterIcon, label: quickFilterLabel } = quickFilterHeading(activeQuickFilter);

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-8 text-left select-none">
      <div className="flex items-center gap-4">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border-2 border-[var(--dash-border-soft)] bg-[var(--dash-surface)]">
          {activeCampaign?.logoUrl ? (
            <img src={activeCampaign.logoUrl} alt={activeCampaign.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center p-3">
              <img src="/icon-source-1024.png" alt="" className="h-full w-full object-contain opacity-80" style={{ filter: 'invert(1)' }} />
            </div>
          )}
        </div>

        <div>
          <h1 className="text-2xl font-semibold text-[var(--dash-text-strong)]">{activeCampaign?.name ?? 'Campagna'}</h1>
          {activeCampaign?.description && (
            <p className="mt-1 max-w-md text-sm text-[var(--dash-muted)]">{activeCampaign.description}</p>
          )}
          {activeCampaign && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--dash-muted)]">
              <RulesetTag rulesetId={activeCampaign.ruleset} />
              <span>
                Creata il {new Date(activeCampaign.createdAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
            </div>
          )}
        </div>
      </div>

      {playersLoaded && (
        <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-[320px_1fr]">
          {/* Colonna 1: card GM compatta (non il riquadro verticale con
              portrait grande) - niente "truncate" sul nome, il testo va a
              capo se serve invece di tagliarsi a un carattere come nelle
              versioni precedenti confinate in una colonna troppo stretta.
              320px (allargata da 240px) per contenere comodamente sulla
              stessa riga i due pulsanti compatti + il trigger del menu a
              tre puntini, senza comprimerli o mandarli a capo. */}
          <div className="flex flex-col gap-3">
            {/* Riga controlli separata dalla card GM (non al suo interno),
                alla stessa altezza di titolo+pillole in colonna 2. */}
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

          {/* Colonne 2+3: titolo della sezione corrente + pillole sulla
              stessa riga (non piu' una riga di pillole separata sopra),
              alla stessa quota della card GM di colonna 1 - entrambe sono
              il primo figlio della rispettiva colonna, nessuno spaziatore
              necessario. flex-wrap sulle pillole: su schermi stretti vanno
              a capo in modo naturale. */}
          <div className="flex flex-col gap-3">
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

          {/* sempre esattamente 2 card per riga (grid-cols-2, non auto-fill)
              - le due colonne 1fr si espandono per riempire tutto lo spazio
              a destra della colonna 1, non restano piccole. minmax(200px,1fr)
              invece del semplice 1fr: stesso numero di colonne garantito, ma
              con un minimo protetto che evita la stessa classe di bug di
              troncamento vista finora se lo schermo e' stretto. */}
          <div className="grid grid-cols-[repeat(2,minmax(200px,1fr))] content-start gap-4">
            {(activeQuickFilter === 'all' || activeQuickFilter === 'pg') && (
              <>
                {playerRows.map((row) =>
                  row.characters.length > 0 ? (
                    row.characters.map((ch) => (
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
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  onClick={(e) => e.stopPropagation()}
                                  className="rounded-lg bg-black/40 p-1 text-white/80 transition-colors hover:bg-black/60 hover:text-white"
                                  aria-label="Menu personaggio"
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="end"
                                className="w-64 border-[var(--dash-border-soft)] bg-[var(--dash-surface)] text-[var(--dash-text)]"
                              >
                                <DropdownMenuItem
                                  onSelect={() => setCopyDialogChar(ch)}
                                  className="text-[var(--dash-text)] focus:bg-[var(--dash-surface-2)] focus:text-[var(--dash-text-strong)]"
                                >
                                  <Copy className="h-4 w-4" /> Copia in un'altra campagna
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onSelect={() => setRemoveCharTarget(ch)}
                                  className="text-[var(--dash-danger-text)] focus:bg-[var(--dash-danger-bg)] focus:text-[var(--dash-danger-text)]"
                                >
                                  <Trash2 className="h-4 w-4" /> Rimuovi il Personaggio
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onSelect={() => setRemovePlayerTarget(row)}
                                  className="text-[var(--dash-danger-text)] focus:bg-[var(--dash-danger-bg)] focus:text-[var(--dash-danger-text)]"
                                >
                                  <UserMinus className="h-4 w-4" /> Rimuovi il giocatore
                                </DropdownMenuItem>
                                <DropdownMenuSeparator className="bg-[var(--dash-border-soft)]" />
                                <div className="px-2 py-1.5 text-xs text-[var(--dash-muted)]">
                                  {ch.createdAt && (
                                    <div>Creato il {new Date(ch.createdAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                                  )}
                                  {row.joinedAt && (
                                    <div>Unito alla campagna il {new Date(row.joinedAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                                  )}
                                </div>
                              </DropdownMenuContent>
                            </DropdownMenu>
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
              <div className="col-span-2 rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] px-5 py-8 text-center">
                <Package className="mx-auto mb-3 h-10 w-10 text-[var(--dash-muted)]" />
                <div className="text-xs uppercase tracking-[0.16em] text-[var(--dash-accent-2)]">Funzionalità in arrivo</div>
              </div>
            )}

            {(activeQuickFilter === 'all' || activeQuickFilter === 'npc') && isOwner && npcsLoaded && npcs.length > 0 && (
              <>
                {/* solo in 'all': con filtro 'npc' il titolo e' gia' nella
                    riga affiancata alle pillole sopra, non va duplicato qui */}
                {activeQuickFilter === 'all' && (
                  <h2 className="col-span-2 mt-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[var(--dash-muted)]">
                    <Ghost className="h-4 w-4" /> PNG
                  </h2>
                )}
                {npcs.map((npc) => (
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
                  />
                ))}
              </>
            )}

            {(activeQuickFilter === 'all' || activeQuickFilter === 'monster') && isOwner && monstersLoaded && monsters.length > 0 && (
              <>
                {activeQuickFilter === 'all' && (
                  <h2 className="col-span-2 mt-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[var(--dash-muted)]">
                    <Skull className="h-4 w-4" /> Mostri
                  </h2>
                )}
                {monsters.map((monster) => (
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
                  />
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

      {removeCharTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-[var(--dash-danger-border)] bg-[var(--dash-surface)] p-6 shadow-2xl">
            <h3 className="mb-2 font-semibold text-[var(--dash-text-strong)]">Rimuovere il personaggio dalla campagna?</h3>
            <p className="mb-3 text-sm text-[var(--dash-muted)]">
              "{removeCharTarget.name}" non verrà eliminato: resterà nel database del giocatore, semplicemente non farà più parte di questa campagna.
            </p>
            {removeCharError && (
              <div className="mb-3 rounded-lg border border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)] px-3 py-2 text-sm text-[var(--dash-danger-text)]">
                {removeCharError}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRemoveCharTarget(null)}
                disabled={isRemovingChar}
                className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-4 py-2 text-sm text-[var(--dash-text-strong)]"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleConfirmRemoveCharacter}
                disabled={isRemovingChar}
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)] px-4 py-2 text-sm font-semibold text-[var(--dash-danger-text)] hover:bg-[var(--dash-danger-border)]"
              >
                {isRemovingChar && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Rimuovi
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
  );
}
