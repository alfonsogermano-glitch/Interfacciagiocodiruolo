import type { ReactNode } from 'react';
import { EyeOff } from 'lucide-react';
import { DraggablePortrait } from './DraggablePortrait';

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
      className={`relative flex items-start gap-3 rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-2.5 pr-9 transition-colors hover:border-[var(--dash-accent)] ${
        onClick ? 'cursor-pointer' : ''
      }`}
    >
      <div className="relative shrink-0">
        <DraggablePortrait
          url={photoUrl ?? undefined}
          fallbackIcon={
            <span className="font-serif text-xs font-semibold text-[var(--dash-accent-2)]">{getInitials(name)}</span>
          }
          size={76}
          draggable={false}
        />

        {hiddenBadge && (
          <div className="absolute bottom-0.5 left-0.5 z-[3] inline-flex items-center gap-1 rounded-full border border-white/20 bg-black/75 px-1.5 py-0.5 text-[9px] font-semibold text-white">
            <EyeOff className="h-2.5 w-2.5" />
            Nascosto
          </div>
        )}
      </div>

      {cornerAction && (
        <div onClick={e => e.stopPropagation()} className="absolute right-2 top-2 z-[3]">
          {cornerAction}
        </div>
      )}

      <div className="min-w-0 flex-1 pt-0.5">
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
