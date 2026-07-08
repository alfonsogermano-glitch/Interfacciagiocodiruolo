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
  // 'list' e' una riga orizzontale compatta (portrait piu' piccolo, testo su
  // una riga sola) per la vista a lista di MyCharactersPage.tsx - stesse
  // funzionalita' (badge/menu/children), solo riorganizzate. Default 'grid'
  // per non toccare nessuno degli usi esistenti.
  variant?: 'grid' | 'list';
}

export function EntityCard({ name, subtitle, secondaryText, photoUrl, onClick, hiddenBadge, cornerAction, children, variant = 'grid' }: EntityCardProps) {
  if (variant === 'list') {
    return (
      <div
        onClick={onClick}
        className={`flex items-center gap-3 rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] py-2 pl-2 pr-3 transition-colors hover:border-[var(--dash-accent)] ${
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
            size={56}
            draggable={false}
          />

          {hiddenBadge && (
            <div className="absolute -bottom-1 -right-1 z-[3] flex h-4 w-4 items-center justify-center rounded-full border border-white/20 bg-black/75 text-white">
              <EyeOff className="h-2.5 w-2.5" />
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
          <div className="min-w-0 max-w-xs shrink-0">
            <h3 className="truncate font-serif text-sm font-semibold text-[var(--dash-text-strong)]">{name || 'Senza nome'}</h3>
            {subtitle && <p className="truncate text-xs text-[var(--dash-muted)]">{subtitle}</p>}
          </div>

          {secondaryText && (
            <p className="hidden min-w-0 max-w-md flex-1 truncate text-xs text-[var(--dash-muted)] lg:block">{secondaryText}</p>
          )}

          {children && (
            <div onClick={(e) => e.stopPropagation()} className="shrink-0">
              {children}
            </div>
          )}
        </div>

        {cornerAction && (
          <div onClick={(e) => e.stopPropagation()} className="shrink-0">
            {cornerAction}
          </div>
        )}
      </div>
    );
  }

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
