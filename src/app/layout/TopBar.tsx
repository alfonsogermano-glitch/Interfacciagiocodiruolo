import { useState } from 'react';
import { Bell, Bug, Check, ChevronDown, LogOut, Newspaper, Search, Settings, UserPlus, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useNotifications, type NotificationRow } from '../notifications/NotificationsContext';
import { useCampaign } from '../campaigns/CampaignContext';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from '../components/ui/dropdown-menu';

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
  const { markAsRead, respondToInvite } = useNotifications();
  const { refreshJoinedCampaigns } = useCampaign();
  const [isResponding, setIsResponding] = useState(false);
  const [respondError, setRespondError] = useState<string | null>(null);

  const meta = NOTIFICATION_LABELS[notification.type];
  const Icon = meta?.icon ?? Bell;
  const text = meta ? meta.text(notification.data) : `Notifica: ${notification.type}`;

  const isPendingInvite = notification.type === 'campaign_invite' && notification.data?.status === 'pending';

  const handleRespond = async (action: 'accept' | 'decline') => {
    setIsResponding(true);
    setRespondError(null);
    try {
      await respondToInvite(notification.id, action);
      if (action === 'accept') await refreshJoinedCampaigns();
    } catch (err) {
      setRespondError(err instanceof Error ? err.message : 'Errore durante la risposta.');
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
              onClick={(e) => { e.stopPropagation(); void handleRespond('accept'); }}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--dash-accent)] bg-[var(--dash-accent)] px-2.5 py-1 text-xs font-semibold text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-accent-2)] disabled:opacity-60"
            >
              <Check className="h-3.5 w-3.5" /> Accetta
            </button>
            <button
              type="button"
              disabled={isResponding}
              onClick={(e) => { e.stopPropagation(); void handleRespond('decline'); }}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-2.5 py-1 text-xs text-[var(--dash-muted)] transition-colors hover:text-[var(--dash-text)] disabled:opacity-60"
            >
              <X className="h-3.5 w-3.5" /> Rifiuta
            </button>
          </div>
        )}
        {respondError && <p className="mt-1 text-[11px] text-[var(--dash-danger-text)]">{respondError}</p>}
      </div>
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
    <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b border-[var(--dash-border)] bg-[var(--dash-surface)] px-4">
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
