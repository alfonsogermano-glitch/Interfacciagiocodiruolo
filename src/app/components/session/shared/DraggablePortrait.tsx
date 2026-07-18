import { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { EyeOff } from 'lucide-react';
import { TokenShapePreview } from '../../shared/TokenShapePreview';
import { EntityPortraitImage } from '../../shared/EntityPortraitImage';
import type { CropAreaPercent } from '../../shared/SourceCroppedImage';
import { TOKEN_SHAPE_SPECS, getTokenStrokeWidth } from '../../shared/tokenShapes';
import {
  DEFAULT_TOKEN_COLOR,
  DEFAULT_TOKEN_BACKGROUND_COLOR,
  DEFAULT_TOKEN_BORDER_STYLE,
  DEFAULT_TOKEN_BORDER_THICKNESS,
  DEFAULT_TOKEN_BORDER_VISIBLE,
  type TokenBorderStyle,
  type TokenBorderThickness,
} from '../../../../types/tokenStyle';

const TOKEN_SIZE = 64;
const IDENTITY_CROP = { x: 0, y: 0, scale: 1 };

export function DraggablePortrait({
  url,
  sourceImageUrl,
  cropArea,
  name = '',
  fallbackIcon,
  size = 56,
  chrome = 'framed',
  draggable,
  onDragStart,
  hiddenFromPlayers = false,
  hiddenBadgePosition = 'top-right',
  tokenColor,
  tokenBackgroundColor,
  tokenBorderStyle,
  tokenBorderThickness,
  tokenBorderVisible,
  tokenBorderLabel,
}: {
  url?: string;
  /** Sorgente+crop percentuale del registro immagini condiviso (Fase 1) -
   *  quando presenti insieme, hanno priorita' su url (vedi
   *  EntityPortraitImage). Assenti = comportamento invariato. */
  sourceImageUrl?: string | null;
  cropArea?: CropAreaPercent | null;
  /** Nome dell'entita', solo per il testo alternativo dell'immagine. */
  name?: string;
  fallbackIcon: React.ReactNode;
  size?: number;
  /** "framed" (default) = riquadro quadrato size×size con bordo/raggio/
   *  ombra/sfondo propri, comportamento invariato (EntityDetailView.tsx,
   *  vista lista di EntityCard.tsx). "flush" = niente chrome propria,
   *  larghezza fissa (size) ma altezza 100% del genitore - pensato per
   *  colonne che devono riempire per intero uno spazio dedicato (variant
   *  grid di EntityCard.tsx): il ritaglio agli angoli arriva dal
   *  contenitore (rounded+overflow-hidden), non da qui. */
  chrome?: 'framed' | 'flush';
  draggable: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  hiddenFromPlayers?: boolean;
  hiddenBadgePosition?: 'center' | 'top-right';
  tokenColor?: string | null;
  tokenBackgroundColor?: string | null;
  tokenBorderStyle?: TokenBorderStyle | null;
  tokenBorderThickness?: TokenBorderThickness | null;
  tokenBorderVisible?: boolean | null;
  tokenBorderLabel?: string | null;
}) {
  const isFlush = chrome === 'flush';
  const dragGhostRef = useRef<HTMLDivElement | null>(null);
  const clipIdBase = useId().replace(/:/g, '');

  const color = tokenColor ?? DEFAULT_TOKEN_COLOR;
  const backgroundColor = tokenBackgroundColor ?? DEFAULT_TOKEN_BACKGROUND_COLOR;
  const style = tokenBorderStyle ?? DEFAULT_TOKEN_BORDER_STYLE;
  const thickness = tokenBorderThickness ?? DEFAULT_TOKEN_BORDER_THICKNESS;
  const borderVisible = tokenBorderVisible ?? DEFAULT_TOKEN_BORDER_VISIBLE;
  const geometry = TOKEN_SHAPE_SPECS[style].geometry;
  const strokeWidth = getTokenStrokeWidth(style, thickness);

  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        if (dragGhostRef.current) {
          e.dataTransfer.setDragImage(dragGhostRef.current, TOKEN_SIZE / 2, TOKEN_SIZE / 2);
        }
        onDragStart?.(e);
      }}
      className={`group relative shrink-0 overflow-hidden ${
        isFlush ? '' : 'rounded-2xl border-2 border-[var(--dash-border-soft)] bg-[var(--dash-surface)] shadow-lg'
      } ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
      style={isFlush ? { width: size, height: '100%' } : { width: size, height: size }}
    >
      {url || (sourceImageUrl && cropArea) ? (
        <EntityPortraitImage
          portraitImageUrl={url}
          portraitSourceImageUrl={sourceImageUrl}
          portraitCropArea={cropArea}
          alt={name}
          style={{ width: '100%', height: '100%' }}
          draggable={false}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">{fallbackIcon}</div>
      )}
      {draggable && (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-150 group-hover:opacity-100"
          style={{ backgroundColor: 'rgba(0,0,0,0.35)' }}
        >
          <TokenShapePreview
            clipId={`${clipIdBase}-hover`}
            name={name}
            portraitImageUrl={url}
            portraitSourceImageUrl={sourceImageUrl}
            portraitCropArea={cropArea}
            fallbackContent={!url ? fallbackIcon : undefined}
            crop={IDENTITY_CROP}
            color={color}
            backgroundColor={backgroundColor}
            geometry={geometry}
            strokeWidth={strokeWidth}
            borderVisible={borderVisible}
            borderLabel={tokenBorderLabel}
            style={{ width: TOKEN_SIZE, height: TOKEN_SIZE }}
          />
        </div>
      )}
      {hiddenFromPlayers && (
        <div
          className={`pointer-events-none absolute flex items-center justify-center rounded-full bg-black/70 ${
            hiddenBadgePosition === 'center' ? 'inset-0 m-auto h-5 w-5' : 'right-0.5 top-0.5 h-5 w-5'
          }`}
        >
          <EyeOff className="h-3 w-3 text-white" />
        </div>
      )}
      {draggable && createPortal(
        <div ref={dragGhostRef} style={{ position: 'fixed', left: -9999, top: -9999 }}>
          <TokenShapePreview
            clipId={`${clipIdBase}-dragimage`}
            name={name}
            portraitImageUrl={url}
            portraitSourceImageUrl={sourceImageUrl}
            portraitCropArea={cropArea}
            fallbackContent={!url ? fallbackIcon : undefined}
            crop={IDENTITY_CROP}
            color={color}
            backgroundColor={backgroundColor}
            geometry={geometry}
            strokeWidth={strokeWidth}
            borderVisible={borderVisible}
            style={{ width: TOKEN_SIZE, height: TOKEN_SIZE }}
          />
        </div>,
        document.body
      )}
    </div>
  );
}
