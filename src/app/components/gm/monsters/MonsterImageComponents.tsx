import { useEffect, useRef, useState } from 'react';
import type { Monster, ImageCrop } from './monstersTypes';
import { DEFAULT_CROP, DEFAULT_PORTRAIT_BORDER_COLOR } from './monstersConstants';
import { FrameTransformStepper } from '../../shared/PortraitCropEditor';

// ImageEditor e PortraitCropFrame (ex MonsterPortraitFrame) sono stati
// estratti in shared/PortraitCropEditor.tsx per essere riusati dal tab
// "Immagine" di PG/PNG/Mostri in EntityDetailView.tsx - qui restano solo
// PortraitImage e MonsterCoverFrame, entrambi cablati al tipo Monster
// (o non ancora generalizzati, come MonsterCoverFrame che riguarda la
// cover 16:9, fuori dall'ambito del tab "Immagine").
export { ImageEditor, PortraitCropFrame } from '../../shared/PortraitCropEditor';

export function PortraitImage({
  monster,
  size = 'medium',
  frameImageUrl
}: {
  monster: Monster;
  size?: 'small' | 'medium' | 'large';
  frameImageUrl?: string;
}) {
  const crop = monster.portraitCrop ?? DEFAULT_CROP;
  const sizeClass =
    size === 'small'
      ? 'h-12 w-12'
      : size === 'large'
        ? 'h-24 w-24'
        : 'h-16 w-16';

  const positionRatio =
    size === 'small'
      ? 0.25
      : size === 'large'
        ? 0.5
        : 0.35;

  // I controlli di "Regola portrait" lavorano sul token grande h-52 (~208px).
  // Lista e scheda hanno token più piccoli: gli offset della cornice vanno scalati,
  // altrimenti la cornice sembra non seguire la regolazione.
  const frameOffsetRatio =
    size === 'small'
      ? 48 / 208
      : size === 'large'
        ? 96 / 208
        : 64 / 208;

  const frameOffsetX = (monster.portraitFrameOffsetX ?? 0) * frameOffsetRatio;
  const frameOffsetY = (monster.portraitFrameOffsetY ?? 0) * frameOffsetRatio;
  const frameScaleX = monster.portraitFrameScaleX ?? 1;
  const frameScaleY = monster.portraitFrameScaleY ?? 1;
  const portraitBorderVisible = monster.portraitBorderVisible ?? true;
  const portraitBorderColor = monster.portraitBorderColor ?? DEFAULT_PORTRAIT_BORDER_COLOR;

  return (
    <div className={`relative shrink-0 ${sizeClass}`}>
      <div className="absolute inset-[10%] overflow-hidden rounded-full bg-[var(--dash-panel)]">
        {monster.portraitImageUrl ? (
          <img
            src={monster.portraitImageUrl}
            alt={monster.name}
            className="h-full w-full object-contain"
            style={{
              transform: `translate(${crop.x * positionRatio}px, ${crop.y * positionRatio}px) rotate(${monster.portraitRotationDegrees ?? 0}deg) scale(${crop.scale})`,
              transformOrigin: 'center center'
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-[var(--dash-muted)]">
            ?
          </div>
        )}
      </div>

      {portraitBorderVisible && (
        <div
          className="pointer-events-none absolute inset-[10%] z-[15] rounded-full border-2 shadow-[0_0_0_1px_rgba(0,0,0,0.45)]"
          style={{ borderColor: portraitBorderColor }}
          aria-hidden="true"
          title={monster.portraitBorderLabel?.trim() || 'Linea massima portrait'}
        />
      )}

      {frameImageUrl && (
        <img
          src={frameImageUrl}
          alt=""
          className="pointer-events-none absolute inset-0 z-20 h-full w-full object-contain"
          style={{
            transform: `translate(${frameOffsetX}px, ${frameOffsetY}px) rotate(${monster.portraitFrameRotationDegrees ?? 0}deg) scale(${frameScaleX}, ${frameScaleY})`,
            transformOrigin: 'center center'
          }}
        />
      )}
    </div>
  );
}

export function MonsterCoverFrame({
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
        <h3 className="text-[var(--dash-text)]">Regola immagine mostro</h3>

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
          title="Alterna orientamento finestra foto mostro"
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
          <span>Zoom immagine mostro</span>
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
                Regola cornice foto mostro
              </h4>
              <p className="mt-1 text-xs text-[var(--dash-muted)]">
                Modifica solo la cornice foto mostro di questo mostro, senza cambiare l’asset originale.
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
        Trascina l’immagine mostro per spostarla. Usa la rotellina o lo slider per zoomare.
      </p>
    </div>
  );
}
