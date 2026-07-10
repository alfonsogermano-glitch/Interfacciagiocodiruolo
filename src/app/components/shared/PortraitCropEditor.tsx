import { useEffect, useRef, useState } from 'react';
import type { ImageCrop } from '../gm/monsters/monstersTypes';
import { DEFAULT_PORTRAIT_BORDER_COLOR, PORTRAIT_EDITOR_BOX_SIZE } from '../gm/monsters/monstersConstants';

// Estratti da monsters/MonsterImageComponents.tsx: gia' scritti su props
// primitive pure (nessun riferimento al tipo Monster), quindi riusabili
// as-is per il tab "Immagine" condiviso di PG/PNG/Mostri in
// EntityDetailView.tsx. Stessa tecnica gia' usata per TokenShapePreview.

const MIN_PORTRAIT_SCALE = 1;
const MAX_PORTRAIT_SCALE = 2.5;

/**
 * Vincola pan/zoom cosi' che l'immagine copra sempre per intero il box
 * (object-cover), mai un bordo vuoto: stessa garanzia che ImageCropUploadModal
 * ottiene "gratis" da react-easy-crop (restrictPosition di default), qui
 * ricostruita a mano perche' il modello {x,y,scale} e il rendering CSS
 * live sono diversi. Applicata come funzione derivata ad ogni render (non
 * solo sull'evento che genera un nuovo valore): questo e' anche cio' che
 * rende "auto-guarente" un crop legacy o fuori limite gia' salvato - non
 * serve una migrazione a parte, si corregge da solo alla prossima apertura
 * dell'editor (stessa logica di normalizeImageCrop per la vecchia forma
 * {centerX,centerY,zoom}).
 */
function clampCropToBox(
  crop: ImageCrop,
  naturalWidth: number,
  naturalHeight: number,
  boxSize: number = PORTRAIT_EDITOR_BOX_SIZE
): ImageCrop {
  const scale = Math.min(MAX_PORTRAIT_SCALE, Math.max(MIN_PORTRAIT_SCALE, crop.scale));

  if (!naturalWidth || !naturalHeight) {
    // Dimensioni non ancora note (onLoad non ancora scattato): un pan
    // gia' salvato non e' verificabile senza le dimensioni reali, quindi
    // NON va propagato as-is (produrrebbe un bordo scoperto per il breve
    // istante fino al load, per qualunque entita' con un pan non-zero
    // gia' salvato) - identita', sicura per costruzione con object-cover
    // a x:0,y:0 qualunque siano le proporzioni dell'immagine.
    return { x: 0, y: 0, scale };
  }

  // object-cover: il fattore che fa si' che il lato piu' corto combaci col
  // box, lasciando l'altro lato in eccesso (quello che il pan puo' rivelare).
  const coverScale = Math.max(boxSize / naturalWidth, boxSize / naturalHeight);
  const displayWidth = naturalWidth * coverScale * scale;
  const displayHeight = naturalHeight * coverScale * scale;
  const maxX = Math.max(0, (displayWidth - boxSize) / 2);
  const maxY = Math.max(0, (displayHeight - boxSize) / 2);

  return {
    x: Math.min(maxX, Math.max(-maxX, crop.x)),
    y: Math.min(maxY, Math.max(-maxY, crop.y)),
    scale
  };
}

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
  crop,
  frameImageUrl,
  frameRotationDegrees,
  frameOffsetX = 0,
  frameOffsetY = 0,
  frameScaleX = 1,
  frameScaleY = 1,
  portraitBorderColor = DEFAULT_PORTRAIT_BORDER_COLOR,
  portraitBorderVisible = true,
  portraitBorderLabel = '',
  portraitRotationDegrees,
  isEditing,
  onCropChange,
  onScaleChange,
  onRotateFrameDegrees,
  onRotateImageDegrees,
  onFrameTransformChange,
  onResetFrameTransform,
  onReset
}: {
  imageUrl: string;
  name: string;
  crop: ImageCrop;
  frameImageUrl?: string;
  frameRotationDegrees?: number;
  frameOffsetX?: number;
  frameOffsetY?: number;
  frameScaleX?: number;
  frameScaleY?: number;
  portraitBorderColor?: string;
  portraitBorderVisible?: boolean;
  portraitBorderLabel?: string;
  portraitRotationDegrees: number;
  isEditing: boolean;
  onCropChange?: (patch: Partial<ImageCrop>) => void;
  onScaleChange?: (scale: number) => void;
  onRotateFrameDegrees?: (delta: number) => void;
  onRotateImageDegrees?: (delta: number) => void;
  onFrameTransformChange?: (patch: {
    portraitFrameOffsetX?: number;
    portraitFrameOffsetY?: number;
    portraitFrameScaleX?: number;
    portraitFrameScaleY?: number;
  }) => void;
  onResetFrameTransform?: () => void;
  onReset?: () => void;
}) {
  const portraitRef = useRef<HTMLDivElement | null>(null);
  const [isDraggingPortrait, setIsDraggingPortrait] = useState(false);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);

  // Dimensioni naturali legate a un'immagine specifica: se cambia (nuovo
  // upload), vanno ricalcolate, non riusate da quella precedente.
  useEffect(() => {
    setNaturalSize(null);
  }, [imageUrl]);

  // Crop sempre vincolato al box, derivato ad ogni render invece che
  // scritto una tantum: garantisce che non si veda MAI un bordo vuoto,
  // anche per un valore gia' salvato fuori dai limiti (vecchio scale <1,
  // pan eccessivo...) - si "auto-corregge" alla prossima apertura.
  const displayCrop = clampCropToBox(crop, naturalSize?.width ?? 0, naturalSize?.height ?? 0);

  useEffect(() => {
    const element = portraitRef.current;
    if (!element || !isEditing || !onScaleChange) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const delta = event.deltaY > 0 ? -0.01 : 0.01;
      const nextScale = Math.min(MAX_PORTRAIT_SCALE, Math.max(MIN_PORTRAIT_SCALE, displayCrop.scale + delta));
      onScaleChange(nextScale);
    };

    element.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      element.removeEventListener('wheel', handleWheel);
    };
  }, [displayCrop.scale, isEditing, onScaleChange]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isEditing || !onCropChange) return;

    event.preventDefault();
    setIsDraggingPortrait(true);
    document.body.classList.add('hsc-is-dragging-portrait');

    const startX = event.clientX;
    const startY = event.clientY;
    const initialX = displayCrop.x;
    const initialY = displayCrop.y;
    const width = naturalSize?.width ?? 0;
    const height = naturalSize?.height ?? 0;
    const coverScale = width && height ? Math.max(PORTRAIT_EDITOR_BOX_SIZE / width, PORTRAIT_EDITOR_BOX_SIZE / height) : 0;
    const maxX = width && height ? Math.max(0, (width * coverScale * displayCrop.scale - PORTRAIT_EDITOR_BOX_SIZE) / 2) : 0;
    const maxY = width && height ? Math.max(0, (height * coverScale * displayCrop.scale - PORTRAIT_EDITOR_BOX_SIZE) / 2) : 0;

    // Clampato dentro handlePointerMove stesso, non solo al rilascio: cosi'
    // il drag non mostra mai il vuoto nemmeno per un istante mentre l'utente
    // trascina oltre il limite - si ferma esattamente al bordo, "snap"
    // continuo invece che a scatti dopo il fatto.
    const handlePointerMove = (moveEvent: PointerEvent) => {
      const rawX = initialX + moveEvent.clientX - startX;
      const rawY = initialY + moveEvent.clientY - startY;
      onCropChange({
        x: Math.min(maxX, Math.max(-maxX, rawX)),
        y: Math.min(maxY, Math.max(-maxY, rawY))
      });
    };

    const handlePointerUp = () => {
      setIsDraggingPortrait(false);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      document.body.classList.remove('hsc-is-dragging-portrait');
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  return (
    <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[var(--dash-text)]">Regola portrait</h3>

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

        {frameImageUrl && (
          <button
            type="button"
            onClick={() => onRotateFrameDegrees?.(-5)}
            className="rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-3 py-2 text-sm text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-surface-2)]"
            title="Ruota cornice a sinistra"
          >
            ↺ Cornice
          </button>
        )}

        {frameImageUrl && (
          <div className="rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-3 py-2 text-sm text-[var(--dash-muted)]">
            Cornice portrait
          </div>
        )}

        {frameImageUrl && (
          <button
            type="button"
            onClick={() => onRotateFrameDegrees?.(5)}
            className="rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-3 py-2 text-sm text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-surface-2)]"
            title="Ruota cornice a destra"
          >
            Cornice ↻
          </button>
        )}

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
          ref={portraitRef}
          onPointerDown={handlePointerDown}
          className={`relative h-52 w-52 bg-transparent ${isEditing ? (isDraggingPortrait ? 'cursor-grabbing' : 'cursor-grab') : ''}`}
          style={{ cursor: isEditing ? (isDraggingPortrait ? 'grabbing' : 'grab') : 'default' }}
        >
          <div className="absolute inset-[10%] z-10 overflow-hidden rounded-full bg-[var(--dash-panel)]">
            <img
              src={imageUrl}
              alt={`Portrait di ${name}`}
              draggable={false}
              onLoad={event =>
                setNaturalSize({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight
                })
              }
              className="h-full w-full select-none object-cover"
              style={{
                transform: `
                  translate(${displayCrop.x}px, ${displayCrop.y}px)
                  scale(${displayCrop.scale})
                  rotate(${portraitRotationDegrees}deg)
                `,
                transformOrigin: 'center center'
              }}
            />
          </div>
          {portraitBorderVisible && (
            <div
              className="pointer-events-none absolute inset-[10%] z-[15] rounded-full border-4 shadow-[0_0_0_1px_rgba(0,0,0,0.45),0_0_18px_rgba(245,166,35,0.16)]"
              style={{ borderColor: portraitBorderColor }}
              title={portraitBorderLabel.trim() || 'Linea massima portrait'}
              aria-hidden="true"
            />
          )}

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

      <div className="-mt-7">
        <div className="mb-2 flex items-center justify-between text-xs text-[var(--dash-muted)]">
          <span>Zoom portrait</span>
          <span>{Math.round(displayCrop.scale * 100)}%</span>
        </div>

        <input
          type="range"
          min={MIN_PORTRAIT_SCALE}
          max={MAX_PORTRAIT_SCALE}
          step={0.01}
          value={displayCrop.scale}
          onChange={e => onScaleChange?.(Number(e.target.value))}
          className="w-full accent-[var(--dash-accent)]"
        />
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

      <p className="mt-2 text-center text-xs text-[var(--dash-muted)]">
        Trascina il portrait per spostarlo. Usa la rotellina o lo slider per zoomare.
      </p>
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
