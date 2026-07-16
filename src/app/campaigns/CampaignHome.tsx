import { useState, useEffect, useRef } from 'react';
import { Play, Square, Settings, Loader2, AlertTriangle, Users } from 'lucide-react';
import { useAuth, supabase } from '../auth/AuthContext';
import { useCampaign } from './CampaignContext';
import { loadCharactersByOwner } from '../../services/supabase/charactersService';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { RulesetTag } from '../components/shared/RulesetTag';
import { EntityCard } from '../components/session/shared/EntityCard';

const SERVER_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-771c5bfd`;
const AUTO_CLOSE_AFTER_MS = 60 * 60 * 1000; // 1 ora

interface CampaignHomeProps {
  onGoToManagement: () => void;
}

type PlayerCharacterSummary = {
  id: string;
  name: string;
  portraitUrl: string | null;
};

type PlayerRow = {
  profileId: string;
  displayName: string | null;
  characters: PlayerCharacterSummary[];
};

export function CampaignHome({ onGoToManagement }: CampaignHomeProps) {
  const { user, session } = useAuth();
  const { activeCampaign, refreshCampaigns, refreshJoinedCampaigns } = useCampaign();

  const [isToggling, setIsToggling] = useState(false);
  const [gmOnline, setGmOnline] = useState(false);
  const [localSessionActive, setLocalSessionActive] = useState<boolean | null>(null);
  const [channelReady, setChannelReady] = useState(false);
  const [ownCharacterId, setOwnCharacterId] = useState<string | null>(null);
  const [characterLookupDone, setCharacterLookupDone] = useState(false);
  const [channelGeneration, setChannelGeneration] = useState(0);
  const [autoClosedNotice, setAutoClosedNotice] = useState(false);
  const autoCloseCheckedRef = useRef(false);
  const [gmDisplayName, setGmDisplayName] = useState<string | null>(null);
  const [playerRows, setPlayerRows] = useState<PlayerRow[]>([]);
  const [playersLoaded, setPlayersLoaded] = useState(false);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
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
        // Il GM ha gia' la propria riga dedicata (badge "GM") indipendentemente
        // dal fatto che possieda un PG - va escluso qui, all'ingresso
        // dell'unione, cosi' non puo' ricomparire ne' come membro ne' come
        // "orfano" piu' sotto, qualunque sia la provenienza del suo profileId.
        const members: { profileId: string; displayName: string | null }[] = (memberNamesData.members ?? [])
          .filter((m: any) => m.profileId !== activeCampaign.ownerId);

        const charsByOwner = new Map<string, PlayerCharacterSummary[]>();
        for (const ch of characters) {
          const ownerId = ch.owner_profile_id;
          if (!ownerId) continue;
          const list = charsByOwner.get(ownerId) ?? [];
          list.push({ id: ch.id, name: ch.name, portraitUrl: ch.portrait_image_url ?? null });
          charsByOwner.set(ownerId, list);
        }

        // Unione tra membri noti e proprietari di PG non (piu') tra i membri
        // (es. rimosso dalla campagna ma PG non riassegnato) - nessun PG va perso.
        const knownIds = new Set(members.map((m) => m.profileId));
        const orphanOwnerIds = Array.from(charsByOwner.keys()).filter(
          (id) => id !== activeCampaign.ownerId && !knownIds.has(id)
        );

        setPlayerRows([
          ...members.map((m) => ({ profileId: m.profileId, displayName: m.displayName, characters: charsByOwner.get(m.profileId) ?? [] })),
          ...orphanOwnerIds.map((id) => ({ profileId: id, displayName: null, characters: charsByOwner.get(id) ?? [] })),
        ]);
        setGmDisplayName(memberNamesData.ownerDisplayName ?? null);
      } catch (err) {
        console.error('Errore nel caricamento della sezione Players:', err);
      } finally {
        if (!cancelled) setPlayersLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeCampaign?.id, activeCampaign?.ownerId, session]);

  useEffect(() => {
    if (!activeCampaign?.id || !characterLookupDone) return;
    setChannelReady(false);

    const ch = supabase
      .channel(`campaign:${activeCampaign.id}`, { config: { private: true } })
      .on('presence', { event: 'sync' }, () => {
        const state = ch.presenceState();
        const online = Object.values(state).some((presences: any) =>
          presences.some((p: any) => p.role === 'gm')
        );
        setGmOnline(online);
      })
      .on('broadcast', { event: 'session_change' }, (msg) => {
        const active = msg?.payload?.active;
        if (typeof active === 'boolean') {
          setLocalSessionActive(active);
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setTimeout(async () => {
            if (isOwner) {
              await ch.track({ role: 'gm', online_at: new Date().toISOString() });
            } else if (ownCharacterId) {
              await ch.track({ role: 'player', characterId: ownCharacterId, online_at: new Date().toISOString() });
            }
            setChannelReady(true);
          }, 0);
        }
      });

    channelRef.current = ch;

    return () => {
      if (isOwner || ownCharacterId) ch.untrack();
      supabase.removeChannel(ch);
      channelRef.current = null;
      setChannelReady(false);
    };
  }, [activeCampaign?.id, isOwner, ownCharacterId, characterLookupDone, channelGeneration]);

  useEffect(() => {
    if (isOwner) return;
    if (!sessionActive || gmOnline) return;

    const timer = setTimeout(() => {
      setChannelGeneration(g => g + 1);
    }, 6000);

    return () => clearTimeout(timer);
  }, [isOwner, sessionActive, gmOnline]);

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

      if (channelRef.current && channelReady) {
        try {
          await channelRef.current.send({ type: 'broadcast', event: 'session_change', payload: { active: nextActive } });
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

  return (
    <div className="flex h-full flex-col items-center gap-6 overflow-y-auto p-8 text-center select-none">
      <div className="relative h-24 w-24 overflow-hidden rounded-2xl border-2 border-[var(--dash-border-soft)] bg-[var(--dash-surface)]">
        {activeCampaign?.logoUrl ? (
          <img src={activeCampaign.logoUrl} alt={activeCampaign.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center p-4">
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
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-xs text-[var(--dash-muted)]">
            <RulesetTag rulesetId={activeCampaign.ruleset} />
            <span>
              Creata il {new Date(activeCampaign.createdAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>
        )}
      </div>

      {playersLoaded && (
        <div className="w-full max-w-2xl text-left">
          <h2 className="mb-3 flex items-center justify-center gap-2 text-sm font-semibold uppercase tracking-wide text-[var(--dash-muted)]">
            <Users className="h-4 w-4" /> Players
          </h2>
          <div className="flex flex-col gap-2">
            <EntityCard
              variant="list"
              name={gmDisplayName ?? 'Game Master'}
              badge={
                <span className="inline-flex items-center rounded-full border border-[var(--dash-accent)] bg-[var(--dash-accent)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--dash-accent-2)]">
                  GM
                </span>
              }
            />
            {playerRows.map((row) =>
              row.characters.length > 0 ? (
                row.characters.map((ch) => (
                  <EntityCard
                    key={ch.id}
                    variant="list"
                    name={ch.name}
                    secondaryText={`Proprietario: ${row.displayName ?? 'Sconosciuto'}`}
                    photoUrl={ch.portraitUrl}
                  />
                ))
              ) : (
                <EntityCard
                  key={row.profileId}
                  variant="list"
                  name={row.displayName ?? 'Giocatore'}
                  badge={
                    <span className="inline-flex items-center rounded-full border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-2 py-0.5 text-[10px] font-medium text-[var(--dash-muted)]">
                      Nessun personaggio
                    </span>
                  }
                />
              )
            )}
          </div>
        </div>
      )}

      {autoClosedNotice && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-800 bg-amber-900/30 px-4 py-2 text-sm text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          La sessione precedente era rimasta attiva da più di un'ora senza attività ed è stata chiusa automaticamente.
        </div>
      )}

      {isOwner ? (
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={handleToggleSession}
            disabled={isToggling}
            className={`inline-flex items-center gap-2 rounded-2xl border px-6 py-3 text-sm font-semibold shadow-lg transition-colors ${
              sessionActive
                ? 'border-red-800 bg-red-900/40 text-red-200 hover:bg-red-900/60'
                : 'border-[var(--dash-accent)] bg-[var(--dash-accent)] text-[var(--dash-text-strong)] hover:bg-[var(--dash-accent-2)]'
            }`}
          >
            {isToggling ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : sessionActive ? (
              <Square className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {sessionActive ? 'Termina sessione' : 'Avvia sessione di gioco'}
          </button>

          <button
            type="button"
            onClick={onGoToManagement}
            className="inline-flex items-center gap-2 rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-6 py-3 text-sm font-semibold text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-surface-2)]"
          >
            <Settings className="h-4 w-4" />
            Vai alla gestione
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
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
