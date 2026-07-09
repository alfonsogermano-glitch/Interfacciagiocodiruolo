import type { ReactNode } from 'react';
import type { ImageCrop } from '../gm/monsters/monstersTypes';
import type { TokenShapeGeometry } from './tokenShapes';

/** Renderizza la geometria di una forma token come figlio SVG (circle/rect/
 *  path), riusata sia per il contorno visibile sia per il clip-path -
 *  condivisa tra TokenStyleEditor (griglia selettore + anteprima grande) e
 *  qualunque altro punto che debba mostrare il token reale di un'entita'
 *  (es. DraggablePortrait). */
export function renderShapeSvgChild(geometry: TokenShapeGeometry, extraProps: React.SVGProps<SVGElement>) {
  if (geometry.kind === 'circle') {
    return <circle cx={0.5} cy={0.5} r={geometry.radius} {...(extraProps as React.SVGProps<SVGCircleElement>)} />;
  }
  if (geometry.kind === 'rect') {
    const half = geometry.size / 2;
    return (
      <rect
        x={0.5 - half}
        y={0.5 - half}
        width={geometry.size}
        height={geometry.size}
        rx={geometry.cornerRadius}
        {...(extraProps as React.SVGProps<SVGRectElement>)}
      />
    );
  }
  return <path d={geometry.d} {...(extraProps as React.SVGProps<SVGPathElement>)} />;
}

/** Anteprima/rendering del token: stessa geometria usata sia per il
 *  contorno visibile (fill/stroke SVG) sia per ritagliare il ritratto
 *  (clip-path sull'<img>, objectBoundingBox cosi' si riscala da solo a
 *  qualunque dimensione). sizeClassName copre l'uso a scala Tailwind
 *  (anteprima grande del Token Studio); style copre dimensioni in pixel
 *  arbitrari (es. i vari size di DraggablePortrait) - i due si possono
 *  combinare. */
export function TokenShapePreview({
  clipId,
  name,
  portraitImageUrl,
  fallbackContent,
  crop,
  color,
  backgroundColor,
  geometry,
  strokeWidth,
  borderVisible,
  borderLabel,
  sizeClassName = '',
  style,
}: {
  clipId: string;
  name: string;
  portraitImageUrl?: string | null;
  /** Mostrato al centro della forma quando non c'e' un'immagine ritratto. */
  fallbackContent?: ReactNode;
  crop: ImageCrop;
  color: string;
  backgroundColor: string;
  geometry: TokenShapeGeometry;
  strokeWidth: number;
  borderVisible: boolean;
  borderLabel?: string | null;
  sizeClassName?: string;
  style?: React.CSSProperties;
}) {
  const tooltip = borderLabel?.trim() ? borderLabel.trim() : undefined;

  return (
    <div className={`relative ${sizeClassName}`} style={style} title={tooltip}>
      <svg viewBox="0 0 1 1" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        <defs>
          <clipPath id={clipId} clipPathUnits="objectBoundingBox">
            {renderShapeSvgChild(geometry, {})}
          </clipPath>
        </defs>
      </svg>

      <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `url(#${clipId})`, backgroundColor }}>
        {portraitImageUrl ? (
          <img
            src={portraitImageUrl}
            alt={`Token di ${name}`}
            draggable={false}
            className="h-full w-full select-none object-cover"
            style={{
              transform: `translate(${crop.x}px, ${crop.y}px) scale(${crop.scale})`,
              transformOrigin: 'center center',
            }}
          />
        ) : fallbackContent ? (
          <div className="flex h-full w-full items-center justify-center">{fallbackContent}</div>
        ) : null}
      </div>

      {borderVisible && (
        <svg viewBox="0 0 1 1" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
          {renderShapeSvgChild(geometry, {
            fill: 'none',
            stroke: color,
            strokeWidth,
          })}
        </svg>
      )}
    </div>
  );
}
