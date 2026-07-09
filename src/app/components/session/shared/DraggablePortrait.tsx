import { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { EyeOff } from 'lucide-react';
import { TokenShapePreview } from '../../shared/TokenShapePreview';
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
  name = '',
  fallbackIcon,
  size = 56,
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
  /** Nome dell'entita', solo per il testo alternativo dell'immagine. */
  name?: string;
  fallbackIcon: React.ReactNode;
  size?: number;
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
        if (url && dragGhostRef.current) {
          e.dataTransfer.setDragImage(dragGhostRef.current, TOKEN_SIZE / 2, TOKEN_SIZE / 2);
        }
        onDragStart?.(e);
      }}
      className={`group relative shrink-0 overflow-hidden rounded-md border-2 border-[var(--dash-accent)] bg-[var(--dash-input)] ${
        draggable ? 'cursor-grab active:cursor-grabbing' : ''
      }`}
      style={{ width: size, height: size }}
    >
      {url ? (
        <img src={url} alt={name} className="h-full w-full object-cover" draggable={false} />
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
      {url && draggable && createPortal(
        <div ref={dragGhostRef} style={{ position: 'fixed', left: -9999, top: -9999 }}>
          <TokenShapePreview
            clipId={`${clipIdBase}-dragimage`}
            name={name}
            portraitImageUrl={url}
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
