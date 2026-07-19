import { useState } from 'react';
import { Bell, Bug, Check, ChevronDown, LogOut, Newspaper, Search, Settings, UserPlus, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useNotifications, type NotificationRow } from '../notifications/NotificationsContext';
import { useCampaign } from '../campaigns/CampaignContext';
import { isRulesetCompatible } from '../campaigns/campaignTypes';
import { JoinCampaignCharacterDialog, type JoinCampaignCharacterOption } from '../components/session/shared/JoinCampaignCharacterDialog';
import {
  loadCharactersByOwner, assignCharacterToCampaign,
  claimCharacter, loadAvailableCharactersInCampaigns,
} from '../../services/supabase/charactersService';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from '../components/ui/dropdown-menu';

const SERVER_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-771c5bfd`;

interface TopBarProps {
  activeSection?: string | null;
  onLogout: () => void;
  onOpenSettings: (tab: 'general' | 'profile') => void;
  onReportBug: () => void;
}

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
  // (loadAvailableCharactersInCampaigns, scoped alla sola campagna
  // dell'invito), altrimenti blocca del tutto (nessuna accettazione, stesso
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
      const [myCharacters, availableCharacters] = await Promise.all([
        loadCharactersByOwner(user.id),
        loadAvailableCharactersInCampaigns([campaignId]),
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

export function TopBar({ activeSection, onLogout, onOpenSettings, onReportBug }: TopBarProps) {
  const { user } = useAuth();
  const { notifications, unreadCount, markAllAsRead } = useNotifications();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const displayName = user?.displayName ?? 'Utente';
  const initials = displayName.trim().charAt(0).toUpperCase() || '?';
  const searchPlaceholder = (activeSection && SEARCH_PLACEHOLDERS[activeSection]) || 'Cerca...';

  return (
    <header className="sticky top-0 z-[1000] flex h-12 shrink-0 items-center gap-2 border-b border-[var(--dash-border)] bg-[var(--dash-surface)] px-4">
      <div className="flex-1" />

      {/* Search */}
      <div className="flex w-48 items-center gap-2 rounded-full border border-[var(--dash-border)] bg-[var(--dash-surface)] px-3 py-1.5 text-[var(--dash-muted)]">
        <Search className="h-4 w-4 shrink-0" />
        <input
          type="text"
          placeholder={searchPlaceholder}
          className="w-full bg-transparent text-sm text-[var(--dash-text)] placeholder-[var(--dash-muted)] outline-none"
        />
      </div>

      {/* Notifications */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Notifiche"
            className="relative flex items-center justify-center rounded-full border border-[var(--dash-border)] bg-[var(--dash-surface)] p-2 text-[var(--dash-muted)] transition-colors hover:text-[var(--dash-text)]"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[var(--dash-danger-border)]" />
            )}
          </button>
        </DropdownMenuTrigger>
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
      <div className="relative">
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
          <ChevronDown className="h-3.5 w-3.5 text-[var(--dash-muted)]" />
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
