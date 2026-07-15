import { useEffect, useRef, useState } from 'react';
import { NO_FRAME_VALUE, type ImageCrop } from '../../../types/imageCrop';
import type { VisualAsset } from '../../../services/storage/visualAssetsStorage';

// ImageEditor e FrameTransformStepper: props primitive pure, nessun
// riferimento al tipo Monster. PortraitCropFrame invece era in origine
// (Avatar tab dei Mostri, MonstersManager.tsx, rimosso in Fase 2 della
// migrazione EntityDetailView) un editor di crop LIVE della foto stessa
// (pan/zoom/rotazione via {x,y,scale} + portraitRotationDegrees) più un
// overlay di cornice+cerchio indipendente. Fase 3 di quella migrazione ha
// tolto la parte di crop live (confliggeva col nuovo ritaglio non
// distruttivo di EntityImageTab.tsx, che tratta portraitImageUrl come
// risultato già ritagliato, non foto grezza) e ha lasciato solo l'overlay
// di cornice, qui sotto - portraitImageUrl viene mostrato cosi' com'e',
// senza alcuna trasformazione aggiuntiva. Il "Cerchio portrait" (bordo
// colorato) che viveva qui e' stato rimosso in Fase 4: zero consumer reali
// fuori dalla propria anteprima di editing, mai raggiungeva alcuna card o
// header (a differenza del Token Studio, che serve lo stesso bisogno).
//
// CoverFrame e FrameAssetSelect (ex MonsterCoverFrame, dentro
// MonsterImageComponents.tsx) sono stati spostati qui in Fase 5 della
// migrazione (generalizzazione cornice+cover a PG/PNG): erano gia' su
// props primitive pure, zero riferimento al tipo Monster nonostante il
// nome - nessuna riscrittura di logica, solo relocation + rename.

export function ImageEditor({
  title,
  imageUrl,
  onUrlChange,
  onFileChange,
  isUploading
}: {
  title: string;
  imageUrl: string;
  onUrlChange: (value: string) => void;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  isUploading?: boolean;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm text-[var(--dash-text)]">{title}</label>

      <input
        type="text"
        value={imageUrl}
        onChange={e => onUrlChange(e.target.value)}
        placeholder={`URL ${title.toLowerCase()}`}
        className="mb-2 w-full rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text)]"
        disabled={isUploading}
      />

      <input
        type="file"
        accept="image/*"
        onChange={onFileChange}
        className="block w-full text-sm text-[var(--dash-text)] file:mr-4 file:rounded-md file:border-0 file:bg-[var(--dash-accent)] file:px-3 file:py-2 file:text-sm file:text-[var(--dash-text-strong)]"
        disabled={isUploading}
      />

      {isUploading && (
        <p className="mt-2 text-sm text-[var(--dash-accent)]">Caricamento in corso…</p>
      )}
    </div>
  );
}

export function PortraitCropFrame({
  imageUrl,
  name,
  frameImageUrl,
  frameRotationDegrees,
  frameOffsetX = 0,
  frameOffsetY = 0,
  frameScaleX = 1,
  frameScaleY = 1,
  onRotateFrameDegrees,
  onFrameTransformChange,
  onResetFrameTransform,
  onReset
}: {
  imageUrl: string;
  name: string;
  frameImageUrl?: string;
  frameRotationDegrees?: number;
  frameOffsetX?: number;
  frameOffsetY?: number;
  frameScaleX?: number;
  frameScaleY?: number;
  onRotateFrameDegrees?: (delta: number) => void;
  onFrameTransformChange?: (patch: {
    portraitFrameOffsetX?: number;
    portraitFrameOffsetY?: number;
    portraitFrameScaleX?: number;
    portraitFrameScaleY?: number;
  }) => void;
  onResetFrameTransform?: () => void;
  onReset?: () => void;
}) {
  return (
    <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[var(--dash-text)]">Cornice portrait</h3>

        <button
          type="button"
          onClick={onReset}
          className="rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-3 py-1 text-xs text-[var(--dash-text)]"
        >
          Reset
        </button>
      </div>

      {frameImageUrl && (
        <div className="mb-3 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => onRotateFrameDegrees?.(-5)}
            className="rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-3 py-2 text-sm text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-surface-2)]"
            title="Ruota cornice a sinistra"
          >
            ↺ Cornice
          </button>

          <div className="rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-3 py-2 text-sm text-[var(--dash-muted)]">
            Cornice portrait
          </div>

          <button
            type="button"
            onClick={() => onRotateFrameDegrees?.(5)}
            className="rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-3 py-2 text-sm text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-surface-2)]"
            title="Ruota cornice a destra"
          >
            Cornice ↻
          </button>
        </div>
      )}

      <div className="flex justify-center">
        <div className="relative h-52 w-52 bg-transparent">
          <div className="absolute inset-[10%] z-10 overflow-hidden rounded-full bg-[var(--dash-panel)]">
            <img
              src={imageUrl}
              alt={`Portrait di ${name}`}
              draggable={false}
              className="h-full w-full select-none object-cover"
            />
          </div>
          {frameImageUrl && (
            <img
              src={frameImageUrl}
              alt=""
              className="pointer-events-none absolute inset-0 z-20 h-full w-full object-contain"
              style={{
                transform: `translate(${frameOffsetX}px, ${frameOffsetY}px) rotate(${frameRotationDegrees ?? 0}deg) scale(${frameScaleX}, ${frameScaleY})`,
                transformOrigin: 'center center'
              }}
            />
          )}
        </div>
      </div>

      {frameImageUrl && (
        <div className="mt-3 rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-[var(--dash-text-strong)]">
                Regola cornice portrait
              </h4>
              <p className="mt-1 text-xs text-[var(--dash-muted)]">
                Modifica solo la cornice di questo elemento, senza cambiare l’asset originale.
              </p>
            </div>

            <button
              type="button"
              onClick={onResetFrameTransform}
              className="rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-3 py-1 text-xs text-[var(--dash-text)] hover:bg-[var(--dash-surface)]"
            >
              Reset cornice
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <FrameTransformStepper
              label="X"
              value={frameOffsetX}
              min={-80}
              max={80}
              step={1}
              suffix="px"
              onChange={value => onFrameTransformChange?.({ portraitFrameOffsetX: value })}
            />

            <FrameTransformStepper
              label="Y"
              value={frameOffsetY}
              min={-80}
              max={80}
              step={1}
              suffix="px"
              onChange={value => onFrameTransformChange?.({ portraitFrameOffsetY: value })}
            />

            <FrameTransformStepper
              label="Larghezza"
              value={frameScaleX}
              min={0.5}
              max={1.8}
              step={0.01}
              suffix="×"
              onChange={value => onFrameTransformChange?.({ portraitFrameScaleX: value })}
            />

            <FrameTransformStepper
              label="Altezza"
              value={frameScaleY}
              min={0.5}
              max={1.8}
              step={0.01}
              suffix="×"
              onChange={value => onFrameTransformChange?.({ portraitFrameScaleY: value })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function FrameTransformStepper({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  const clamp = (nextValue: number) =>
    Math.min(max, Math.max(min, Number(nextValue.toFixed(2))));

  const formattedValue =
    suffix === 'px' ? `${Math.round(value)}${suffix}` : `${value.toFixed(2)}${suffix}`;

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-2 py-1.5">
      <span className="min-w-16 text-xs text-[var(--dash-muted)]">
        {label}
      </span>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onPointerDown={event => event.stopPropagation()}
          onClick={event => {
            event.preventDefault();
            event.stopPropagation();
            onChange(clamp(value - step));
          }}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] text-sm text-[var(--dash-text-strong)] hover:bg-[var(--dash-surface)]"
        >
          −
        </button>

        <span className="w-14 text-center text-xs tabular-nums text-[var(--dash-text)]">
          {formattedValue}
        </span>

        <button
          type="button"
          onPointerDown={event => event.stopPropagation()}
          onClick={event => {
            event.preventDefault();
            event.stopPropagation();
            onChange(clamp(value + step));
          }}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] text-sm text-[var(--dash-text-strong)] hover:bg-[var(--dash-surface)]"
        >
          +
        </button>
      </div>
    </div>
  );
}

// Select generica cornice (portrait/cover condividono la stessa struttura,
// solo il tipo di asset filtrato cambia) - "" = Default, NO_FRAME_VALUE =
// Nessuna cornice, altrimenti l'id di un asset specifico.
export function FrameAssetSelect({
  label,
  value,
  assets,
  defaultHint,
  onChange
}: {
  label: string;
  value: string | null | undefined;
  assets: VisualAsset[];
  defaultHint: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm text-[var(--dash-text)]">{label}</label>

      <select
        value={value === NO_FRAME_VALUE ? NO_FRAME_VALUE : value ?? ''}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text)]"
      >
        <option value="">Default</option>
        <option value={NO_FRAME_VALUE}>Nessuna cornice</option>

        {assets.map(asset => (
          <option key={asset.id} value={asset.id}>
            {asset.name}
          </option>
        ))}
      </select>

      <p className="mt-2 text-xs text-[var(--dash-muted)]">{defaultHint}</p>
    </div>
  );
}

export function CoverFrame({
  imageUrl,
  name,
  scale,
  crop,
  frameImageUrl,
  frameRotation,
  frameRotationDegrees,
  frameOffsetX = 0,
  frameOffsetY = 0,
  frameScaleX = 1,
  frameScaleY = 1,
  isEditing,
  onCropChange,
  onScaleChange,
  onToggleFrameRotation,
  onRotateFrameDegrees,
  onFrameTransformChange,
  onResetFrameTransform,
  coverRotationDegrees,
  onRotateImageDegrees,
  onReset
}: {
  imageUrl: string;
  name: string;
  scale: number;
  crop: ImageCrop;
  frameImageUrl?: string;
  frameRotation: 0 | 90;
  frameRotationDegrees: number;
  frameOffsetX?: number;
  frameOffsetY?: number;
  frameScaleX?: number;
  frameScaleY?: number;
  isEditing: boolean;
  onCropChange?: (patch: Partial<ImageCrop>) => void;
  onScaleChange?: (scale: number) => void;
  onToggleFrameRotation?: () => void;
  onRotateFrameDegrees?: (delta: number) => void;
  onFrameTransformChange?: (patch: {
    coverFrameOffsetX?: number;
    coverFrameOffsetY?: number;
    coverFrameScaleX?: number;
    coverFrameScaleY?: number;
  }) => void;
  onResetFrameTransform?: () => void;
  coverRotationDegrees: number;
  onRotateImageDegrees?: (delta: number) => void;
  onReset?: () => void;
}) {
  const [isDraggingCover, setIsDraggingCover] = useState(false);
  const isLandscape = frameRotation === 90;
  const frameRef = useRef<HTMLDivElement | null>(null);

  if (!isEditing) {
    return (
      <div className="flex justify-center">
        <div
          className={`relative bg-transparent ${
            isLandscape ? 'h-52 w-80' : 'h-80 w-52'
          }`}
        >
          <div className="absolute inset-0 z-10 overflow-hidden rounded-xl bg-[var(--dash-panel)]">
            <img
              src={imageUrl}
              alt={`Illustrazione di ${name}`}
              className="h-full w-full select-none object-cover"
              draggable={false}
              style={{
                transform: `
                  translate(${crop.x}px, ${crop.y}px)
                  scale(${scale})
                  rotate(${coverRotationDegrees}deg)
                `,
                transformOrigin: 'center center'
              }}
            />
          </div>

          {frameImageUrl && (
            <img
              src={frameImageUrl}
              alt=""
              className="pointer-events-none absolute inset-0 z-20 h-full w-full object-contain"
              style={{
                transform: `
                  translate(${frameOffsetX}px, ${frameOffsetY}px)
                  rotate(${frameRotationDegrees ?? 0}deg)
                  scale(${frameScaleX}, ${frameScaleY})
                `,
                transformOrigin: 'center center'
              }}
            />
          )}
        </div>
      </div>
    );
  }

  useEffect(() => {
    const element = frameRef.current;
    if (!element || !isEditing || !onScaleChange) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const delta = event.deltaY > 0 ? -0.01 : 0.01;
      onScaleChange(scale + delta);
    };

    element.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      element.removeEventListener('wheel', handleWheel);
    };
  }, [isEditing, onScaleChange, scale]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isEditing || !onCropChange) return;

    event.preventDefault();
    setIsDraggingCover(true);
    document.body.classList.add('hsc-is-dragging-cover');

    const startX = event.clientX;
    const startY = event.clientY;
    const initialX = crop.x;
    const initialY = crop.y;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      onCropChange({
        x: initialX + moveEvent.clientX - startX,
        y: initialY + moveEvent.clientY - startY
      });
    };

    const handlePointerUp = () => {
      setIsDraggingCover(false);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      document.body.classList.remove('hsc-is-dragging-cover');
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  return (
    <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[var(--dash-text)]">Regola immagine</h3>

        <button
          type="button"
          onClick={onReset}
          className="rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-3 py-1 text-xs text-[var(--dash-text)]"
        >
          Reset
        </button>
      </div>

      <div className="mb-3 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={() => onRotateImageDegrees?.(-5)}
          className="rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-3 py-2 text-sm text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-surface-2)]"
          title="Ruota immagine a sinistra"
        >
          ↺ Img
        </button>

        <button
          type="button"
          onClick={() => onRotateFrameDegrees?.(-5)}
          className="rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-3 py-2 text-sm text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-surface-2)]"
          title="Ruota cornice a sinistra"
        >
          ↺ Cornice
        </button>

        <button
          type="button"
          onClick={onToggleFrameRotation}
          className="rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-3 py-2 text-sm text-[var(--dash-muted)] hover:bg-[var(--dash-surface)]"
          title="Alterna orientamento finestra foto"
        >
          Finestra {isLandscape ? 'orizzontale' : 'verticale'}
        </button>

        <button
          type="button"
          onClick={() => onRotateFrameDegrees?.(5)}
          className="rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-3 py-2 text-sm text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-surface-2)]"
          title="Ruota cornice a destra"
        >
          Cornice ↻
        </button>

        <button
          type="button"
          onClick={() => onRotateImageDegrees?.(5)}
          className="rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-3 py-2 text-sm text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-surface-2)]"
          title="Ruota immagine a destra"
        >
          Img ↻
        </button>
      </div>

      <div className="flex justify-center">
        <div
          ref={frameRef}
          onPointerDown={handlePointerDown}
          className={`relative bg-transparent ${
            isLandscape ? 'h-52 w-80' : 'h-80 w-52'
          }`}
          style={{ cursor: isEditing ? (isDraggingCover ? 'grabbing' : 'grab') : 'default' }}
        >
          <div className="pointer-events-none absolute inset-0 z-[15] rounded-xl border-2 border-[var(--dash-accent)] shadow-[0_0_0_1px_rgba(0,0,0,0.45),0_0_22px_rgba(245,166,35,0.18)]" />

          <div className="absolute inset-0 z-10 overflow-hidden rounded-xl bg-[var(--dash-panel)]">
            <img
              src={imageUrl}
              alt={`Illustrazione di ${name}`}
              className="h-full w-full select-none object-cover"
              draggable={false}
              style={{
                transform: `
                  translate(${crop.x}px, ${crop.y}px)
                  scale(${scale})
                  rotate(${coverRotationDegrees}deg)
                `,
                transformOrigin: 'center center'
              }}
            />
          </div>

          {frameImageUrl && (
            <img
              src={frameImageUrl}
              alt=""
              className="pointer-events-none absolute inset-0 z-20 h-full w-full object-contain"
              style={{
                transform: `
                  translate(${frameOffsetX}px, ${frameOffsetY}px)
                  rotate(${frameRotationDegrees ?? 0}deg)
                  scale(${frameScaleX}, ${frameScaleY})
                `,
                transformOrigin: 'center center'
              }}
            />
          )}
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-2 flex items-center justify-between text-xs text-[var(--dash-muted)]">
          <span>Zoom immagine</span>
          <span>{Math.round(scale * 100)}%</span>
        </div>

        <input
          type="range"
          min={0.5}
          max={1.6}
          step={0.01}
          value={scale}
          onChange={e => onScaleChange?.(Number(e.target.value))}
          className="w-full accent-[var(--dash-accent)]"
        />
      </div>

      {frameImageUrl && (
        <div className="mt-3 rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-[var(--dash-text-strong)]">
                Regola cornice foto
              </h4>
              <p className="mt-1 text-xs text-[var(--dash-muted)]">
                Modifica solo la cornice di questa immagine, senza cambiare l’asset originale.
              </p>
            </div>

            <button
              type="button"
              onClick={onResetFrameTransform}
              className="rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-3 py-1 text-xs text-[var(--dash-text)] hover:bg-[var(--dash-surface)]"
            >
              Reset cornice
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <FrameTransformStepper
              label="X"
              value={frameOffsetX}
              min={-120}
              max={120}
              step={1}
              suffix="px"
              onChange={value => onFrameTransformChange?.({ coverFrameOffsetX: value })}
            />

            <FrameTransformStepper
              label="Y"
              value={frameOffsetY}
              min={-120}
              max={120}
              step={1}
              suffix="px"
              onChange={value => onFrameTransformChange?.({ coverFrameOffsetY: value })}
            />

            <FrameTransformStepper
              label="Larghezza"
              value={frameScaleX}
              min={0.5}
              max={1.8}
              step={0.01}
              suffix="×"
              onChange={value => onFrameTransformChange?.({ coverFrameScaleX: value })}
            />

            <FrameTransformStepper
              label="Altezza"
              value={frameScaleY}
              min={0.5}
              max={1.8}
              step={0.01}
              suffix="×"
              onChange={value => onFrameTransformChange?.({ coverFrameScaleY: value })}
            />
          </div>
        </div>
      )}

      <p className="mt-2 text-center text-xs text-[var(--dash-muted)]">
        Trascina l’immagine per spostarla. Usa la rotellina o lo slider per zoomare.
      </p>
    </div>
  );
}
