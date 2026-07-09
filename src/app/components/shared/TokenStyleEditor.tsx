import { useId } from 'react';
import type { ImageCrop } from '../gm/monsters/monstersTypes';
import {
  DEFAULT_TOKEN_COLOR,
  DEFAULT_TOKEN_BACKGROUND_COLOR,
  DEFAULT_TOKEN_BORDER_STYLE,
  TOKEN_BORDER_STYLE_OPTIONS,
  type TokenBorderStyle,
} from '../../../types/tokenStyle';
import { TOKEN_SHAPE_SPECS, type TokenShapeGeometry, type TokenShapeRenderSpec } from './tokenShapes';

interface TokenStyleEditorProps {
  name: string;
  portraitImageUrl?: string | null;
  /** Crop dell'immagine da riusare nell'anteprima: quello reale del Mostro
   *  (pan/zoom gia' impostato nel tab Avatar) o un crop identita'
   *  {x:0,y:0,scale:1} per PG/PNG, la cui immagine e' gia' il risultato
   *  finale di un ritaglio fatto a monte (vedi nota in EntityDetailView). */
  crop: ImageCrop;
  tokenColor?: string | null;
  tokenBackgroundColor?: string | null;
  tokenBorderStyle?: TokenBorderStyle | null;
  onChange: (patch: {
    tokenColor?: string;
    tokenBackgroundColor?: string;
    tokenBorderStyle?: TokenBorderStyle;
  }) => void;
}

function renderShapeSvgChild(geometry: TokenShapeGeometry, extraProps: React.SVGProps<SVGElement>) {
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

/** Anteprima del token: stessa geometria usata sia per il contorno visibile
 *  (fill/stroke SVG) sia per ritagliare il ritratto (clip-path sull'<img>,
 *  objectBoundingBox cosi' si riscala da solo a qualunque dimensione). */
function TokenShapePreview({
  clipId,
  name,
  portraitImageUrl,
  crop,
  color,
  backgroundColor,
  spec,
  sizeClassName,
}: {
  clipId: string;
  name: string;
  portraitImageUrl?: string | null;
  crop: ImageCrop;
  color: string;
  backgroundColor: string;
  spec: TokenShapeRenderSpec;
  sizeClassName: string;
}) {
  return (
    <div className={`relative ${sizeClassName}`}>
      <svg viewBox="0 0 1 1" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        <defs>
          <clipPath id={clipId} clipPathUnits="objectBoundingBox">
            {renderShapeSvgChild(spec.geometry, {})}
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
        ) : null}
      </div>

      <svg viewBox="0 0 1 1" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        {renderShapeSvgChild(spec.geometry, {
          fill: 'none',
          stroke: color,
          strokeWidth: spec.strokeWidth,
          vectorEffect: 'non-scaling-stroke' as any,
        })}
        {spec.innerFrameInset != null &&
          spec.geometry.kind === 'rect' &&
          (() => {
            const insetSize = spec.geometry.size - spec.innerFrameInset! * 2;
            const half = insetSize / 2;
            return (
              <rect
                x={0.5 - half}
                y={0.5 - half}
                width={insetSize}
                height={insetSize}
                rx={Math.max(0, spec.geometry.cornerRadius - spec.innerFrameInset! / 2)}
                fill="none"
                stroke={color}
                strokeWidth={spec.strokeWidth * 0.6}
              />
            );
          })()}
      </svg>
    </div>
  );
}

export function TokenStyleEditor({
  name,
  portraitImageUrl,
  crop,
  tokenColor,
  tokenBackgroundColor,
  tokenBorderStyle,
  onChange,
}: TokenStyleEditorProps) {
  // useId() include ':' (es. ":r1:"), non valido in un riferimento CSS
  // url(#id) senza escaping - ripulito qui una volta sola.
  const clipIdBase = useId().replace(/:/g, '');

  const color = tokenColor ?? DEFAULT_TOKEN_COLOR;
  const backgroundColor = tokenBackgroundColor ?? DEFAULT_TOKEN_BACKGROUND_COLOR;
  const activeStyle = tokenBorderStyle ?? DEFAULT_TOKEN_BORDER_STYLE;
  const activeSpec = TOKEN_SHAPE_SPECS[activeStyle];

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-5">
        <h3 className="mb-2 flex items-center gap-2 text-lg font-semibold text-[var(--dash-text-strong)]">
          Token mappa
        </h3>
        <p className="text-sm text-[var(--dash-muted)]">
          Colore, sfondo e forma del token usato sulla mappa - indipendenti dal cerchio portrait della scheda.
        </p>

        <div className="mt-6 flex justify-center">
          <TokenShapePreview
            clipId={`${clipIdBase}-preview`}
            name={name}
            portraitImageUrl={portraitImageUrl}
            crop={crop}
            color={color}
            backgroundColor={backgroundColor}
            spec={activeSpec}
            sizeClassName="h-56 w-56"
          />
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-5">
          <h4 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-[var(--dash-accent-2)]">
            Colori
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-[var(--dash-muted)]">Colore token</label>
              <input
                type="color"
                value={color}
                onChange={event => onChange({ tokenColor: event.target.value })}
                className="h-10 w-full cursor-pointer rounded border border-[var(--dash-border-soft)] bg-transparent p-1"
                aria-label="Colore token"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--dash-muted)]">Colore sfondo</label>
              <input
                type="color"
                value={backgroundColor}
                onChange={event => onChange({ tokenBackgroundColor: event.target.value })}
                className="h-10 w-full cursor-pointer rounded border border-[var(--dash-border-soft)] bg-transparent p-1"
                aria-label="Colore sfondo token"
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-5">
          <h4 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-[var(--dash-accent-2)]">
            Forma bordo
          </h4>
          <div className="grid grid-cols-4 gap-2">
            {TOKEN_BORDER_STYLE_OPTIONS.map(option => (
              <button
                key={option.id}
                type="button"
                onClick={() => onChange({ tokenBorderStyle: option.id })}
                title={option.label}
                aria-label={option.label}
                aria-pressed={activeStyle === option.id}
                className={`flex items-center justify-center rounded-lg border p-2 transition-colors ${
                  activeStyle === option.id
                    ? 'border-[var(--dash-accent)] bg-[var(--dash-surface-2)]'
                    : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface)] hover:border-[var(--dash-accent)]/60'
                }`}
              >
                <svg viewBox="0 0 1 1" className="h-8 w-8 overflow-visible">
                  {renderShapeSvgChild(TOKEN_SHAPE_SPECS[option.id].geometry, {
                    fill: backgroundColor,
                    stroke: color,
                    strokeWidth: TOKEN_SHAPE_SPECS[option.id].strokeWidth,
                    vectorEffect: 'non-scaling-stroke' as any,
                  })}
                </svg>
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            onChange({
              tokenColor: DEFAULT_TOKEN_COLOR,
              tokenBackgroundColor: DEFAULT_TOKEN_BACKGROUND_COLOR,
              tokenBorderStyle: DEFAULT_TOKEN_BORDER_STYLE,
            })
          }
          className="w-full rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] px-3 py-1.5 text-xs text-[var(--dash-text)] hover:bg-[var(--dash-surface-2)]"
        >
          Reset token
        </button>
      </div>
    </div>
  );
}
