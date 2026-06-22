import { useState } from 'react';
import { Bell, ChevronDown, Search } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

interface TopBarProps {
  activeSection?: string | null;
  hasNotifications?: boolean;
  onLogout: () => void;
  onEditProfile: () => void;
}

const SEARCH_PLACEHOLDERS: Record<string, string> = {
  monsters: 'Cerca mostro...',
  npcs: 'Cerca PNG...',
  players: 'Cerca personaggio...',
};

export function TopBar({ activeSection, hasNotifications = false, onLogout, onEditProfile }: TopBarProps) {
  const { user } = useAuth();
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
      <button
        type="button"
        aria-label="Notifiche"
        className="relative flex items-center justify-center rounded-full border border-[var(--dash-border)] bg-[var(--dash-surface)] p-2 text-[var(--dash-muted)] transition-colors hover:text-[var(--dash-text)]"
      >
        <Bell className="h-4 w-4" />
        {hasNotifications && (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[var(--dash-danger-border)]" />
        )}
      </button>

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
          <div className="absolute right-0 top-full mt-1 min-w-[140px] rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface)] py-1 shadow-2xl">
            <button
              type="button"
              onClick={() => {
                setIsUserMenuOpen(false);
                onEditProfile();
              }}
              className="w-full px-3 py-1.5 text-left text-sm text-[var(--dash-text)] hover:bg-[var(--dash-surface-2)]"
            >
              Modifica profilo
            </button>
            <button
              type="button"
              onClick={() => {
                setIsUserMenuOpen(false);
                onLogout();
              }}
              className="w-full px-3 py-1.5 text-left text-sm text-[var(--dash-text)] hover:bg-[var(--dash-surface-2)]"
            >
              Esci
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
