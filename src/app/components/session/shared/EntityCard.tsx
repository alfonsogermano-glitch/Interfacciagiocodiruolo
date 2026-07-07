import type { ReactNode } from 'react';
import { EyeOff } from 'lucide-react';
import { DraggablePortrait } from './DraggablePortrait';

interface EntityCardProps {
  name: string;
  subtitle?: string;
  secondaryText?: string;
  photoUrl?: string | null;
  onClick?: () => void;
  hiddenBadge?: boolean;
  cornerAction?: ReactNode;
  children?: ReactNode;
}

export function EntityCard({ name, subtitle, secondaryText, photoUrl, onClick, hiddenBadge, cornerAction, children }: EntityCardProps) {
  return (
    <div
      onClick={onClick}
      className={`relative flex items-stretch gap-3 rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-2.5 pr-9 transition-colors hover:border-[var(--dash-accent)] ${
        onClick ? 'cursor-pointer' : ''
      }`}
    >
      <div className="relative shrink-0">
        <DraggablePortrait
          url={photoUrl ?? undefined}
          fallbackIcon={
            <img
              src="/icon-source-1024.png"
              alt=""
              className="h-full w-full object-contain"
              style={{ filter: 'invert(1)', opacity: 0.9 }}
            />
          }
          size={140}
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

      <div className="flex min-w-0 flex-1 flex-col pt-1.5">
        <h3 className="truncate font-serif text-base font-semibold text-[var(--dash-text-strong)]">{name || 'Senza nome'}</h3>
        {subtitle && <p className="truncate text-sm text-[var(--dash-muted)]">{subtitle}</p>}
        {secondaryText && (
          <p className="mt-1 line-clamp-2 text-xs text-[var(--dash-muted)]">{secondaryText}</p>
        )}
        {children && (
          <div onClick={e => e.stopPropagation()} className="mt-auto pt-2">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
