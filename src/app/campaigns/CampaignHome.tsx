import { useState, useEffect, useRef } from 'react';
import { Play, Square, Settings, Loader2 } from 'lucide-react';
import { useAuth, supabase } from '../auth/AuthContext';
import { useCampaign } from './CampaignContext';
import { loadCharactersByOwner } from '../../services/supabase/charactersService';
import { projectId, publicAnonKey } from '/utils/supabase/info';

const SERVER_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-771c5bfd`;

interface CampaignHomeProps {
  onGoToManagement: () => void;
}

export function CampaignHome({ onGoToManagement }: CampaignHomeProps) {
  console.log('[CAMPAIGNHOME-MOUNT] componente montato');
  const { user, session } = useAuth();
  const { activeCampaign, refreshCampaigns } = useCampaign();

  const [isToggling, setIsToggling] = useState(false);
  const [gmOnline, setGmOnline] = useState(false);
  const [localSessionActive, setLocalSessionActive] = useState<boolean | null>(null);
  const [channelReady, setChannelReady] = useState(false);
  const [ownCharacterId, setOwnCharacterId] = useState<string | null>(null);
  const [characterLookupDone, setCharacterLookupDone] = useState(false);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isOwner = activeCampaign?.ownerId === user?.id;
  const sessionActive = localSessionActive ?? !!activeCampaign?.sessionActive;

  useEffect(() => {
    setLocalSessionActive(activeCampaign?.sessionActive ?? false);
  }, [activeCampaign?.id, activeCampaign?.sessionActive]);

  // Trova il proprio personaggio in questa campagna (solo per i giocatori)
  useEffect(() => {
    if (isOwner) {
      setOwnCharacterId(null);
      setCharacterLookupDone(true);
      return;
    }
    if (!user?.id || !activeCampaign?.id) {
      setCharacterLookupDone(false);
      return;
    }
    let cancelled = false;
    setCharacterLookupDone(false);
    loadCharactersByOwner(user.id).then(chars => {
      if (cancelled) return;
      const mine = chars.find(c => c.campaignId === activeCampaign.id);
      setOwnCharacterId(mine?.id ?? null);
      setCharacterLookupDone(true);
    });
    return () => { cancelled = true; };
  }, [isOwner, user?.id, activeCampaign?.id]);

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
      .subscribe(async (status) => {
        console.log('[PRESENCE-DEBUG2] isOwner=', isOwner, '| ownCharacterId=', ownCharacterId, '| characterLookupDone=', characterLookupDone, '| activeCampaign.id=', activeCampaign?.id);
        if (status === 'SUBSCRIBED') {
          if (isOwner) {
            await ch.track({ role: 'gm', online_at: new Date().toISOString() });
          } else if (ownCharacterId) {
            const result = await ch.track({ role: 'player', characterId: ownCharacterId, online_at: new Date().toISOString() });
            console.log('[PRESENCE-DEBUG3] track result=', result);
          }
          setChannelReady(true);
        }
      });

    channelRef.current = ch;

    return () => {
      if (isOwner || ownCharacterId) ch.untrack();
      supabase.removeChannel(ch);
      channelRef.current = null;
      setChannelReady(false);
    };
  }, [activeCampaign?.id, isOwner, ownCharacterId, characterLookupDone]);

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
    <div className="flex h-full flex-col items-center justify-center gap-6 p-8 text-center select-none">
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
      </div>

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
