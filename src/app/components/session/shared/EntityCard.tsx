import type { ReactNode } from 'react';
import { EyeOff } from 'lucide-react';

interface EntityCardProps {
  name: string;
  subtitle?: string;
  photoUrl?: string | null;
  onClick?: () => void;
  hiddenBadge?: boolean;
  cornerAction?: ReactNode;
  children?: ReactNode;
}

function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';

  const parts = trimmed.split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';

  return (first + last).toUpperCase();
}

export function EntityCard({ name, subtitle, photoUrl, onClick, hiddenBadge, cornerAction, children }: EntityCardProps) {
  return (
    <div
      onClick={onClick}
      className={`flex h-[190px] flex-col overflow-hidden rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] transition-colors hover:border-[var(--dash-accent)] ${
        onClick ? 'cursor-pointer' : ''
      }`}
    >
      <div className="relative min-h-0 flex-1 overflow-hidden bg-[var(--dash-panel)]">
        {photoUrl ? (
          <img src={photoUrl} alt={name} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-[var(--dash-muted)]">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--dash-border-soft)] bg-[var(--dash-input)] font-serif text-sm font-semibold text-[var(--dash-accent-2)]">
              {getInitials(name)}
            </div>
            <span className="text-[10px] uppercase tracking-[0.08em]">Nessuna foto</span>
          </div>
        )}

        {hiddenBadge && (
          <div className="absolute bottom-2 left-2 z-[3] inline-flex items-center gap-1 rounded-full border border-white/20 bg-black/65 px-2 py-1 text-[10px] font-semibold text-white">
            <EyeOff className="h-2.5 w-2.5" />
            Nascosto
          </div>
        )}

        {cornerAction && (
          <div onClick={e => e.stopPropagation()} className="absolute right-2 top-2 z-[3]">
            {cornerAction}
          </div>
        )}
      </div>

      <div className="flex-none border-t border-[var(--dash-border-soft)] bg-[var(--dash-surface)] px-3 py-2">
        <h3 className="truncate font-serif text-sm font-semibold text-[var(--dash-text-strong)]">{name || 'Senza nome'}</h3>
        {subtitle && <p className="truncate text-xs text-[var(--dash-muted)]">{subtitle}</p>}
        {children && (
          <div onClick={e => e.stopPropagation()} className="mt-1">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
