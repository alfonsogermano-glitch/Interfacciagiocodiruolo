import { useId } from 'react';
import type { ImageCrop } from '../gm/monsters/monstersTypes';
import {
  DEFAULT_TOKEN_COLOR,
  DEFAULT_TOKEN_BACKGROUND_COLOR,
  DEFAULT_TOKEN_BORDER_STYLE,
  DEFAULT_TOKEN_BORDER_THICKNESS,
  DEFAULT_TOKEN_BORDER_VISIBLE,
  TOKEN_BORDER_STYLE_OPTIONS,
  TOKEN_BORDER_THICKNESS_OPTIONS,
  type TokenBorderStyle,
  type TokenBorderThickness,
} from '../../../types/tokenStyle';
import { TOKEN_SHAPE_SPECS, getTokenStrokeWidth, type TokenShapeGeometry } from './tokenShapes';

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
  tokenBorderThickness?: TokenBorderThickness | null;
  tokenBorderLabel?: string | null;
  tokenBorderVisible?: boolean | null;
  onChange: (patch: {
    tokenColor?: string;
    tokenBackgroundColor?: string;
    tokenBorderStyle?: TokenBorderStyle;
    tokenBorderThickness?: TokenBorderThickness;
    tokenBorderLabel?: string;
    tokenBorderVisible?: boolean;
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
  geometry,
  strokeWidth,
  borderVisible,
  borderLabel,
  sizeClassName,
}: {
  clipId: string;
  name: string;
  portraitImageUrl?: string | null;
  crop: ImageCrop;
  color: string;
  backgroundColor: string;
  geometry: TokenShapeGeometry;
  strokeWidth: number;
  borderVisible: boolean;
  borderLabel?: string | null;
  sizeClassName: string;
}) {
  const tooltip = borderLabel?.trim() ? borderLabel.trim() : undefined;

  return (
    <div className={`relative ${sizeClassName}`} title={tooltip}>
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

export function TokenStyleEditor({
  name,
  portraitImageUrl,
  crop,
  tokenColor,
  tokenBackgroundColor,
  tokenBorderStyle,
  tokenBorderThickness,
  tokenBorderLabel,
  tokenBorderVisible,
  onChange,
}: TokenStyleEditorProps) {
  // useId() include ':' (es. ":r1:"), non valido in un riferimento CSS
  // url(#id) senza escaping - ripulito qui una volta sola.
  const clipIdBase = useId().replace(/:/g, '');

  const color = tokenColor ?? DEFAULT_TOKEN_COLOR;
  const backgroundColor = tokenBackgroundColor ?? DEFAULT_TOKEN_BACKGROUND_COLOR;
  const activeStyle = tokenBorderStyle ?? DEFAULT_TOKEN_BORDER_STYLE;
  const activeThickness = tokenBorderThickness ?? DEFAULT_TOKEN_BORDER_THICKNESS;
  const activeLabel = tokenBorderLabel ?? '';
  const activeVisible = tokenBorderVisible ?? DEFAULT_TOKEN_BORDER_VISIBLE;
  const activeGeometry = TOKEN_SHAPE_SPECS[activeStyle].geometry;
  const activeStrokeWidth = getTokenStrokeWidth(activeStyle, activeThickness);

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
            geometry={activeGeometry}
            strokeWidth={activeStrokeWidth}
            borderVisible={activeVisible}
            borderLabel={activeLabel}
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
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--dash-accent-2)]">
              Forma bordo
            </h4>
            <label className="flex items-center gap-2 text-xs text-[var(--dash-muted)]">
              <input
                type="checkbox"
                checked={activeVisible}
                onChange={event => onChange({ tokenBorderVisible: event.target.checked })}
                className="h-3.5 w-3.5 cursor-pointer accent-[var(--dash-accent)]"
              />
              Visibile
            </label>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {TOKEN_BORDER_STYLE_OPTIONS.map(option => {
              const selected = activeStyle === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onChange({ tokenBorderStyle: option.id })}
                  title={option.label}
                  aria-label={option.label}
                  aria-pressed={selected}
                  className={`flex items-center justify-center rounded-lg border p-2 transition-colors ${
                    selected
                      ? 'border-[var(--dash-accent)] bg-[var(--dash-surface-2)]'
                      : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface)] hover:border-[var(--dash-accent)]/60'
                  }`}
                >
                  <svg viewBox="0 0 1 1" className="h-10 w-10 overflow-visible">
                    {renderShapeSvgChild(TOKEN_SHAPE_SPECS[option.id].geometry, {
                      fill: 'none',
                      stroke: selected ? 'var(--dash-accent)' : 'var(--dash-text-strong)',
                      strokeWidth: TOKEN_SHAPE_SPECS[option.id].strokeWidth,
                    })}
                  </svg>
                </button>
              );
            })}
          </div>

          <h5 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--dash-muted)]">
            Spessore bordo
          </h5>
          <div className="grid grid-cols-3 gap-2">
            {TOKEN_BORDER_THICKNESS_OPTIONS.map(option => (
              <button
                key={option.id}
                type="button"
                onClick={() => onChange({ tokenBorderThickness: option.id })}
                aria-pressed={activeThickness === option.id}
                className={`rounded-lg border px-2 py-1.5 text-xs transition-colors ${
                  activeThickness === option.id
                    ? 'border-[var(--dash-accent)] bg-[var(--dash-surface-2)] text-[var(--dash-text-strong)]'
                    : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface)] text-[var(--dash-muted)] hover:border-[var(--dash-accent)]/60'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="mt-4">
            <label className="mb-1 block text-xs text-[var(--dash-muted)]">Nota facoltativa (tooltip al passaggio del mouse)</label>
            <input
              type="text"
              value={activeLabel}
              onChange={event => onChange({ tokenBorderLabel: event.target.value })}
              placeholder="Es. Ferito, PNG alleato..."
              className="w-full rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] px-3 py-1.5 text-sm text-[var(--dash-text)]"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            onChange({
              tokenColor: DEFAULT_TOKEN_COLOR,
              tokenBackgroundColor: DEFAULT_TOKEN_BACKGROUND_COLOR,
              tokenBorderStyle: DEFAULT_TOKEN_BORDER_STYLE,
              tokenBorderThickness: DEFAULT_TOKEN_BORDER_THICKNESS,
              tokenBorderLabel: '',
              tokenBorderVisible: DEFAULT_TOKEN_BORDER_VISIBLE,
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
