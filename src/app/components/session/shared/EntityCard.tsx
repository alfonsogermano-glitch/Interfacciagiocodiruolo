import type { ReactNode } from 'react';
import { EyeOff } from 'lucide-react';
import { DraggablePortrait } from './DraggablePortrait';
import type { CropAreaPercent } from '../../shared/SourceCroppedImage';
import type { TokenBorderStyle, TokenBorderThickness } from '../../../../types/tokenStyle';

interface EntityCardProps {
  name: string;
  subtitle?: string;
  secondaryText?: string;
  photoUrl?: string | null;
  /** Sorgente+crop percentuale del registro immagini condiviso (Fase 1) -
   *  quando presenti insieme, hanno priorita' su photoUrl (vedi
   *  EntityPortraitImage). Assenti = comportamento invariato. */
  photoSourceUrl?: string | null;
  photoCropArea?: CropAreaPercent | null;
  onClick?: () => void;
  hiddenBadge?: boolean;
  /** Badge extra dopo la descrizione, accanto alla campagna (es. RulesetTag). */
  badge?: ReactNode;
  cornerAction?: ReactNode;
  children?: ReactNode;
  // 'list' e' una riga orizzontale compatta (portrait piu' piccolo, testo su
  // una riga sola) per la vista a lista di MyCharactersPage.tsx - stesse
  // funzionalita' (badge/menu/children), solo riorganizzate. Default 'grid'
  // per non toccare nessuno degli usi esistenti.
  variant?: 'grid' | 'list';
  tokenColor?: string | null;
  tokenBackgroundColor?: string | null;
  tokenBorderStyle?: TokenBorderStyle | null;
  tokenBorderThickness?: TokenBorderThickness | null;
  tokenBorderVisible?: boolean | null;
  tokenBorderLabel?: string | null;
}

export function EntityCard({
  name,
  subtitle,
  secondaryText,
  photoUrl,
  photoSourceUrl,
  photoCropArea,
  onClick,
  hiddenBadge,
  badge,
  cornerAction,
  children,
  variant = 'grid',
  tokenColor,
  tokenBackgroundColor,
  tokenBorderStyle,
  tokenBorderThickness,
  tokenBorderVisible,
  tokenBorderLabel,
}: EntityCardProps) {
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
            sourceImageUrl={photoSourceUrl}
            cropArea={photoCropArea}
            name={name}
            fallbackIcon={
              <img
                src="/icon-source-1024.png"
                alt=""
                className="h-full w-full object-contain"
                style={{ filter: 'invert(1)', opacity: 0.9 }}
              />
            }
            size={56}
            tokenColor={tokenColor}
            tokenBackgroundColor={tokenBackgroundColor}
            tokenBorderStyle={tokenBorderStyle}
            tokenBorderThickness={tokenBorderThickness}
            tokenBorderVisible={tokenBorderVisible}
            tokenBorderLabel={tokenBorderLabel}
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

          {(badge || children) && (
            <div className="flex shrink-0 items-center gap-2">
              {badge}
              {children && (
                <div onClick={(e) => e.stopPropagation()}>
                  {children}
                </div>
              )}
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
      className={`relative flex items-stretch overflow-hidden rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] transition-colors hover:border-[var(--dash-accent)] ${
        onClick ? 'cursor-pointer' : ''
      }`}
    >
      <div className="relative shrink-0">
        <DraggablePortrait
          url={photoUrl ?? undefined}
          name={name}
          fallbackIcon={
            <img
              src="/icon-source-1024.png"
              alt=""
              // Percentuale fissa del lato piu' corto del box (non h-full
              // w-full come nella variant list, dove il box e' sempre
              // quadrato): il box flush ha altezza variabile (segue quella
              // della card), un'icona che riempie il lato corto rimane
              // proporzionata qualunque sia la forma del box, invece di
              // sembrare "piccola e sperduta" con margini vuoti asimmetrici
              // quando il box e' molto piu' largo che alto (card PNG/Mostri
              // senza secondaryText, quindi piu' basse di quelle PG).
              className="h-[75%] w-[75%] object-contain"
              style={{ filter: 'invert(1)', opacity: 0.9 }}
            />
          }
          size={140}
          chrome="flush"
          tokenColor={tokenColor}
          tokenBackgroundColor={tokenBackgroundColor}
          tokenBorderStyle={tokenBorderStyle}
          tokenBorderThickness={tokenBorderThickness}
          tokenBorderVisible={tokenBorderVisible}
          tokenBorderLabel={tokenBorderLabel}
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

      <div className="flex min-w-0 flex-1 flex-col p-2.5 pr-9">
        <h3 className="truncate font-serif text-base font-semibold text-[var(--dash-text-strong)]">{name || 'Senza nome'}</h3>
        {subtitle && <p className="truncate text-sm text-[var(--dash-muted)]">{subtitle}</p>}
        {secondaryText && (
          <p className="mt-1 line-clamp-2 text-xs text-[var(--dash-muted)]">{secondaryText}</p>
        )}
        {(badge || children) && (
          <div className="mt-auto flex flex-col gap-1.5 pt-2">
            {badge}
            {children && (
              <div onClick={e => e.stopPropagation()}>
                {children}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
