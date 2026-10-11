import { useEffect, useRef, useState, type SVGProps } from 'react';
import { Bell, Bug, Check, CloudFog, LogOut, MapPin, MoreVertical, Newspaper, Pencil, Search, Settings, UserPlus, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useNotifications, type NotificationRow } from '../notifications/NotificationsContext';
import { useCampaign } from '../campaigns/CampaignContext';
import { isRulesetCompatible } from '../campaigns/campaignTypes';
import { JoinCampaignCharacterDialog, type JoinCampaignCharacterOption } from '../components/session/shared/JoinCampaignCharacterDialog';
import {
  loadCharactersByOwner, assignCharacterToCampaign,
  claimCharacter, loadAvailableCharactersForInvite,
} from '../../services/supabase/charactersService';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from '../components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip';

const SERVER_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-771c5bfd`;

interface TopBarProps {
  activeSection?: string | null;
  sessionWorkspaceActive?: boolean;
  onLogout: () => void;
  onOpenSettings: (tab: 'general' | 'profile') => void;
  onReportBug: () => void;
}

function MoveMapIcon(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <g className="map-tool-move-vertical"><path d="M12 3v18" /><path d="m8.5 6 3.5-3 3.5 3M8.5 18l3.5 3 3.5-3" /></g>
    <g className="map-tool-move-horizontal"><path d="M3 12h18" /><path d="m6 8.5-3 3.5 3 3.5M18 8.5l3 3.5-3 3.5" /></g>
    <circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none" />
  </svg>;
}

function SelectMapIcon(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" overflow="visible" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="4" y="4" width="15" height="15" rx="2" strokeDasharray="3 2" />
    <g className="map-tool-select-cursor" strokeWidth="2.2">
      <path d="m26 26-7-7" />
      <path d="M19 24v-5h5" />
    </g>
  </svg>;
}

function GridMapIcon(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
    {[4, 10, 16].flatMap(y => [4, 10, 16].map(x => <rect key={`${x}-${y}`} className="map-tool-grid-cell" x={x} y={y} width="4" height="4" rx="0.6" />))}
  </svg>;
}

function MeasureMapIcon(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <g transform="rotate(42 12 12)">
      <rect className="map-tool-measure-fill" x="7.8" y="3" width="8.4" height="18" rx="1.5" stroke="none" fill="currentColor" opacity="0.32" />
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M8 6h4M8 9h2.5M8 12h4M8 15h2.5M8 18h4" />
    </g>
  </svg>;
}

function WallsMapIcon(props: SVGProps<SVGSVGElement>) {
  const bricks = [
    [1, 17], [8.5, 17], [16, 17],
    [4.75, 11.5], [12.25, 11.5],
    [1, 6], [8.5, 6], [16, 6],
    [4.75, 0.5], [12.25, 0.5],
  ];
  return <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.2" {...props}>
    {bricks.map(([x, y], index) => <rect key={`${x}-${y}`} className={`map-tool-wall-brick map-tool-wall-brick-${index + 1}`} x={x} y={y} width="6.8" height="5" rx="0.6" stroke="var(--dash-panel)" strokeWidth="1" />)}
  </svg>;
}

function PointerMapIcon(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="5" cy="19" r="1.6" fill="currentColor" stroke="none" />
    <g className="map-tool-pointer-arrow">
      <path d="M18 5 8 15" />
      <path d="M8 10v5h5" />
    </g>
  </svg>;
}

const SESSION_MAP_TOOLS = [
  { id: 'move', label: 'Muovi', icon: MoveMapIcon },
  { id: 'select', label: 'Seleziona', icon: SelectMapIcon },
  { id: 'grid', label: 'Griglia', icon: GridMapIcon },
  { id: 'measure', label: 'Misura', icon: MeasureMapIcon },
  { id: 'draw', label: 'Disegna', icon: Pencil },
  { id: 'pin', label: 'Puntina', icon: MapPin },
  { id: 'fog', label: 'Nebbia', icon: CloudFog },
  { id: 'walls', label: 'Muri', icon: WallsMapIcon },
  { id: 'pointer', label: 'Puntatore', icon: PointerMapIcon },
] as const;

const SEARCH_PLACEHOLDERS: Record<string, string> = {
  monsters: 'Cerca mostro...',
  npcs: 'Cerca PNG...',
  players: 'Cerca personaggio...',
};

const NOTIFICATION_LABELS: Record<string, { icon: typeof Bell; text: (data: Record<string, any>) => string }> = {
  campaign_invite: {
    icon: UserPlus,
    text: (data) => `${data.inviterDisplayName ?? 'Qualcuno'} ti ha invitato nella campagna "${data.campaignName ?? ''}"`,
  },
};

function formatNotificationTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function NotificationRowItem({ notification }: { notification: NotificationRow }) {
  const { user, session } = useAuth();
  const { markAsRead, respondToInvite } = useNotifications();
  const { refreshJoinedCampaigns } = useCampaign();
  const [isResponding, setIsResponding] = useState(false);
  const [respondError, setRespondError] = useState<string | null>(null);
  // Scelte trovate per QUESTO invito (propri PG compatibili + precompilati
  // disponibili nella campagna), popolate al click su "Accetta" - non null
  // significa "mostra il dialog di scelta PG" (spazio troppo stretto per
  // gestirlo inline in questa riga di dropdown, vedi JoinCampaignCharacterDialog
  // condiviso con HomeScreen.tsx).
  const [joinChoices, setJoinChoices] = useState<{
    ownCharacters: JoinCampaignCharacterOption[];
    availableCharacters: JoinCampaignCharacterOption[];
  } | null>(null);

  const meta = NOTIFICATION_LABELS[notification.type];
  const Icon = meta?.icon ?? Bell;
  const text = meta ? meta.text(notification.data) : `Notifica: ${notification.type}`;

  const isPendingInvite = notification.type === 'campaign_invite' && notification.data?.status === 'pending';

  const handleDecline = async () => {
    setIsResponding(true);
    setRespondError(null);
    try {
      await respondToInvite(notification.id, 'decline');
    } catch (err) {
      setRespondError(err instanceof Error ? err.message : 'Errore durante la risposta.');
    } finally {
      setIsResponding(false);
    }
  };

  // "Accetta" non chiama piu' respondToInvite direttamente al click sul
  // bottone: prima verifica che esista almeno un PG proprio compatibile per
  // ruleset O un precompilato disponibile in quella campagna
  // (loadAvailableCharactersForInvite - non e' ancora membro a questo punto,
  // vedi endpoint server dedicato), altrimenti blocca del tutto (nessuna accettazione, stesso
  // principio gia' applicato al codice invito in HomeScreen.tsx). Il
  // ruleset della campagna viaggia gia' dentro la notifica (campaignRuleset,
  // scritto da /campaigns/:id/invite-by-name) - nessuna chiamata di rete in
  // piu' solo per saperlo.
  //
  // respondToInvite('accept') viene chiamato UNA SOLA VOLTA qui, appena
  // confermato che esiste almeno una scelta valida - non dentro gli handler
  // di selezione del personaggio sotto. respondToInvite NON e' idempotente
  // (la notifica passa a status "accepted", una seconda chiamata sulla
  // stessa notifica torna 409 "Invito già gestito"): se restasse dentro
  // l'handler di selezione e un primo tentativo fallisse dopo un accept
  // riuscito, un retry (anche su un personaggio diverso) richiamerebbe
  // respondToInvite e fallirebbe con 409, bloccando anche il retry del solo
  // passaggio successivo. Spostandolo qui, gli handler di selezione sotto
  // diventano chiamate singole e sicure da ripetere.
  const handleAcceptClick = async () => {
    if (!user?.id) return;
    setRespondError(null);

    const campaignRuleset = notification.data?.campaignRuleset ?? null;
    if (!campaignRuleset) {
      setRespondError('Impossibile verificare la compatibilità di questo invito. Chiedi al GM di inviarlo di nuovo.');
      return;
    }

    setIsResponding(true);
    try {
      const campaignId = notification.data.campaignId as string;
      const accessToken = session?.access_token ?? publicAnonKey;
      const [myCharacters, availableCharacters] = await Promise.all([
        loadCharactersByOwner(user.id),
        loadAvailableCharactersForInvite(campaignId, null, SERVER_BASE, accessToken),
      ]);
      const ownCharacters = myCharacters.filter(c => isRulesetCompatible(c.ruleset, null, campaignRuleset));

      if (ownCharacters.length === 0 && availableCharacters.length === 0) {
        setRespondError(
          `Nessuno dei tuoi personaggi è compatibile con il regolamento di "${notification.data?.campaignName ?? 'questa campagna'}" e non ci sono personaggi precompilati disponibili. ` +
          'Crea o richiedi un personaggio compatibile, poi riprova.'
        );
        return;
      }

      await respondToInvite(notification.id, 'accept');
      await refreshJoinedCampaigns();
      setJoinChoices({
        ownCharacters: ownCharacters.map(c => ({ id: c.id, name: c.name, ruleset: c.ruleset })),
        availableCharacters: availableCharacters.map(c => ({ id: c.id, name: c.name, ruleset: c.ruleset })),
      });
    } catch (err) {
      setRespondError(err instanceof Error ? err.message : 'Errore durante la verifica dei personaggi.');
    } finally {
      setIsResponding(false);
    }
  };

  // La membership e' gia' stabilita da handleAcceptClick sopra - qui solo
  // l'assegnazione del PG scelto, in sicurezza rispetto a un retry.
  const handleSelectOwnCharacterForInvite = async (characterId: string) => {
    setIsResponding(true);
    setRespondError(null);
    try {
      const accessToken = session?.access_token ?? publicAnonKey;
      await assignCharacterToCampaign(characterId, SERVER_BASE, accessToken, { campaignId: notification.data.campaignId });
      setJoinChoices(null);
    } catch (err) {
      setRespondError(err instanceof Error ? err.message : 'Errore durante la risposta.');
    } finally {
      setIsResponding(false);
    }
  };

  const handleSelectAvailableCharacterForInvite = async (characterId: string) => {
    setIsResponding(true);
    setRespondError(null);
    try {
      const accessToken = session?.access_token ?? publicAnonKey;
      await claimCharacter(characterId, SERVER_BASE, accessToken);
      setJoinChoices(null);
    } catch (err) {
      setRespondError(err instanceof Error ? err.message : 'Errore durante la richiesta.');
    } finally {
      setIsResponding(false);
    }
  };

  return (
    <div
      onClick={() => { if (!notification.read) void markAsRead(notification.id); }}
      className={`flex cursor-default gap-2.5 border-b border-[var(--dash-border-soft)] px-3 py-2.5 text-sm last:border-b-0 ${
        notification.read ? 'text-[var(--dash-muted)]' : 'bg-[var(--dash-surface-2)] text-[var(--dash-text)]'
      }`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="leading-snug">{text}</p>
        <p className="mt-0.5 text-[11px] text-[var(--dash-muted)]">{formatNotificationTime(notification.created_at)}</p>
        {isPendingInvite && (
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              disabled={isResponding}
              onClick={(e) => { e.stopPropagation(); void handleAcceptClick(); }}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--dash-accent)] bg-[var(--dash-accent)] px-2.5 py-1 text-xs font-semibold text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-accent-2)] disabled:opacity-60"
            >
              <Check className="h-3.5 w-3.5" /> Accetta
            </button>
            <button
              type="button"
              disabled={isResponding}
              onClick={(e) => { e.stopPropagation(); void handleDecline(); }}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-2.5 py-1 text-xs text-[var(--dash-muted)] transition-colors hover:text-[var(--dash-text)] disabled:opacity-60"
            >
              <X className="h-3.5 w-3.5" /> Rifiuta
            </button>
          </div>
        )}
        {respondError && <p className="mt-1 text-[11px] text-[var(--dash-danger-text)]">{respondError}</p>}
      </div>

      {joinChoices && (
        <JoinCampaignCharacterDialog
          campaignName={notification.data?.campaignName ?? 'questa campagna'}
          ownCharacters={joinChoices.ownCharacters}
          availableCharacters={joinChoices.availableCharacters}
          isPending={isResponding}
          error={respondError}
          onSelectOwnCharacter={(id) => { void handleSelectOwnCharacterForInvite(id); }}
          onSelectAvailableCharacter={(id) => { void handleSelectAvailableCharacterForInvite(id); }}
          onClose={() => setJoinChoices(null)}
        />
      )}
    </div>
  );
}

export function TopBar({ activeSection, sessionWorkspaceActive = false, onLogout, onOpenSettings, onReportBug }: TopBarProps) {
  const { user } = useAuth();
  const { notifications, unreadCount, markAllAsRead } = useNotifications();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [activeMapTool, setActiveMapTool] = useState<(typeof SESSION_MAP_TOOLS)[number]['id']>('move');

  useEffect(() => {
    if (!isUserMenuOpen) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!userMenuRef.current?.contains(event.target as Node)) setIsUserMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsUserMenuOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isUserMenuOpen]);

  const displayName = user?.displayName ?? 'Utente';
  const initials = displayName.trim().charAt(0).toUpperCase() || '?';
  const searchPlaceholder = (activeSection && SEARCH_PLACEHOLDERS[activeSection]) || 'Cerca...';

  return (
    <header className="sticky top-0 z-[1000] flex h-12 shrink-0 items-center gap-2 border-b border-[var(--dash-border)] bg-[var(--dash-surface)] px-4">
      <div className="flex-1" />

      {sessionWorkspaceActive && (
        <div data-session-map-toolbar className="absolute left-2 right-24 flex items-center justify-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:left-1/2 md:right-auto md:-translate-x-1/2">
          <div className="flex items-center gap-1 rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)]/90 p-1 shadow-lg">
            {SESSION_MAP_TOOLS.map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" data-map-tool={id} aria-label={label} title={label} aria-pressed={activeMapTool === id} onClick={() => setActiveMapTool(id)} className={`grid h-8 w-8 shrink-0 place-items-center rounded-md transition-colors ${activeMapTool === id ? 'bg-[var(--dash-accent)] text-[var(--dash-text-strong)]' : 'text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)]'}`}>
                <Icon className="h-4.5 w-4.5" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      <div className={`${sessionWorkspaceActive ? 'hidden' : 'flex'} w-48 items-center gap-2 rounded-full border border-[var(--dash-border)] bg-[var(--dash-surface)] px-3 py-1.5 text-[var(--dash-muted)]`}>
        <Search className="h-4 w-4 shrink-0" />
        <input
          type="text"
          placeholder={searchPlaceholder}
          className="w-full bg-transparent text-sm text-[var(--dash-text)] placeholder-[var(--dash-muted)] outline-none"
        />
      </div>

      {/* Notifications */}
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                data-notification-button
                aria-label={unreadCount > 0 ? 'Nuove Notifiche' : 'Notifiche'}
                className="relative flex items-center justify-center rounded-full border border-[var(--dash-border)] bg-[var(--dash-surface)] p-2 text-[var(--dash-muted)] transition-colors hover:text-[var(--dash-text)]"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[var(--dash-danger-border)]" />
                )}
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{unreadCount > 0 ? 'Nuove Notifiche' : 'Notifiche'}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent
          align="end"
          className="w-80 border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-0 text-[var(--dash-text)]"
        >
          <div className="flex items-center justify-between border-b border-[var(--dash-border-soft)] px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--dash-muted)]">Notifiche</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllAsRead()}
                className="text-xs text-[var(--dash-accent)] hover:underline"
              >
                Segna tutte come lette
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-[var(--dash-muted)]">Nessuna notifica</p>
            ) : (
              notifications.map((n) => <NotificationRowItem key={n.id} notification={n} />)
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* User */}
      <div ref={userMenuRef} className="relative">
        <button
          type="button"
          onClick={() => setIsUserMenuOpen(open => !open)}
          className="flex items-center gap-2 rounded-full border border-[var(--dash-border)] bg-[var(--dash-surface)] px-2 py-1 transition-colors hover:text-[var(--dash-text)]"
        >
          {user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt=""
              className="h-7 w-7 rounded-full object-cover"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          ) : (
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--dash-accent)] text-xs font-semibold text-[var(--dash-text-strong)]">
              {initials}
            </span>
          )}
          <span className="text-sm text-[var(--dash-text)]">{displayName}</span>
          <span data-account-menu-dots className="grid h-5 w-5 place-items-center">
            <MoreVertical className="h-3.5 w-3.5 text-[var(--dash-muted)]" />
          </span>
        </button>

        {isUserMenuOpen && (
          <div className="absolute right-0 top-full mt-1 min-w-[160px] rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface)] py-1 shadow-2xl">
            <button
              type="button"
              onClick={() => {
                setIsUserMenuOpen(false);
                window.open('/news', '_blank');
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--dash-text)] hover:bg-[var(--dash-surface-2)]"
            >
              <Newspaper className="h-4 w-4" /> News e Novità
            </button>
            <button
              type="button"
              onClick={() => {
                setIsUserMenuOpen(false);
                onReportBug();
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--dash-text)] hover:bg-[var(--dash-surface-2)]"
            >
              <Bug className="h-4 w-4" /> Segnala un Bug
            </button>
            <button
              type="button"
              onClick={() => {
                setIsUserMenuOpen(false);
                onOpenSettings('general');
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--dash-text)] hover:bg-[var(--dash-surface-2)]"
            >
              <Settings className="h-4 w-4" /> Impostazioni
            </button>
            <button
              type="button"
              onClick={() => {
                setIsUserMenuOpen(false);
                onLogout();
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--dash-text)] hover:bg-[var(--dash-surface-2)]"
            >
              <LogOut className="h-4 w-4" /> Esci
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
