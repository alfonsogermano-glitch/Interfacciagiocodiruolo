import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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

// Limiti reali di crop.x/y/scale per un riquadro object-fit: cover di
// aspect ratio boxAspect (larghezza/altezza) - senza questi, zoom-out sotto
// 1 (la scala minima che garantisce copertura totale) o pan oltre il
// margine disponibile a una data scala lasciano vuoti (bg-[var(--dash-panel)])
// visibili intorno all'immagine. naturalAspect assente/boxWidthPx<=0 (foto
// non ancora caricata, o riquadro non ancora misurato) - clampa solo la
// scala, x/y restano quelli passati (non c'e' ancora nulla su cui calcolare
// un margine valido).
// x/y/scaleInput SEPARATI (non un ImageCrop unico): EntityImageExtras.tsx
// tiene lo zoom reale in un campo a parte (entity.coverImageScale, passato
// qui come prop "scale") mai sincronizzato con crop.scale (che li' resta
// sempre 1, nessun handler lo aggiorna mai) - derivare lo scale da crop.scale
// avrebbe ignorato lo zoom salvato di ogni Cover PG/Mostro esistente.
export function clampCoverCrop(
  x: number,
  y: number,
  scaleInput: number,
  boxWidthPx: number,
  boxAspect: number,
  naturalAspect: number | null
): { x: number; y: number; scale: number } {
  const scale = Math.max(1, Math.min(1.6, scaleInput));
  if (!naturalAspect || boxWidthPx <= 0) {
    return { x, y, scale };
  }

  const boxHeightPx = boxWidthPx / boxAspect;
  const widthMatches = boxAspect >= naturalAspect;
  const renderedWidth = widthMatches ? boxWidthPx * scale : boxHeightPx * naturalAspect * scale;
  const renderedHeight = widthMatches ? (boxWidthPx / naturalAspect) * scale : boxHeightPx * scale;
  const slackX = Math.max(0, (renderedWidth - boxWidthPx) / 2);
  const slackY = Math.max(0, (renderedHeight - boxHeightPx) / 2);

  return {
    x: Math.max(-slackX, Math.min(slackX, x)),
    y: Math.max(-slackY, Math.min(slackY, y)),
    scale,
  };
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
  sizeClassName,
  aspectRatio,
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
  /** Sovrascrive le due dimensioni fisse (h-52 w-80 / h-80 w-52) pensate per
   *  la Cover di scheda PG/Mostro - assente = comportamento invariato per
   *  quei chiamanti. Usata dal banner di CampaignHome (full-width, aspect
   *  molto più largo di un preset landscape/verticale). */
  sizeClassName?: string;
  /** Aspect ratio numerico (larghezza/altezza) corrispondente a
   *  sizeClassName - es. 3 per un banner 3:1. Serve solo al calcolo di
   *  clamping/anteprima qui sotto (sizeClassName resta l'unica fonte del CSS
   *  effettivo); assente = derivato dai preset legacy, stesso valore che
   *  quei preset già rappresentavano in px (320/208 o 208/320). */
  aspectRatio?: number;
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
  const imgRef = useRef<HTMLImageElement | null>(null);
  const resolvedSizeClassName = sizeClassName ?? (isLandscape ? 'h-52 w-80' : 'h-80 w-52');
  const resolvedAspectRatio = aspectRatio ?? (isLandscape ? 320 / 208 : 208 / 320);

  // Dimensioni naturali dell'immagine e larghezza renderizzata del riquadro -
  // servono solo al clamping di crop.x/y/scale e all'anteprima "immagine
  // intera" qui sotto, mai al CSS effettivo (sizeClassName/object-fit: cover
  // restano invariati). Prima di questo fix ne' qui ne' in
  // EntityImageExtras.tsx (stesso Math.max(0.5, Math.min(1.6, scale)),
  // nessun limite su x/y) esisteva un vincolo legato alle dimensioni reali:
  // sotto scale=1 (il minimo che garantisce copertura totale del riquadro
  // via object-fit: cover) o oltre il margine di trascinamento disponibile a
  // quella scala comparivano vuoti (bg-[var(--dash-panel)]) intorno
  // all'immagine - difetto preesistente nel componente condiviso, mai
  // notato nel riquadro compatto originale.
  const [naturalAspect, setNaturalAspect] = useState<number | null>(null);
  const [boxWidth, setBoxWidth] = useState(0);

  // onLoad da solo non basta: se il browser serve l'immagine dalla cache,
  // l'evento "load" (non-bubbling) puo' non arrivare mai al listener React -
  // naturalAspect resterebbe bloccato a null per l'intera sessione,
  // disattivando di fatto il clamping qui sotto (che senza naturalAspect
  // passa x/y/scale cosi' come sono, senza limiti). Un controllo immediato
  // di img.complete dopo il mount/cambio immagine copre anche il caso
  // "gia' in cache".
  useLayoutEffect(() => {
    setNaturalAspect(null);
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) {
      setNaturalAspect(img.naturalWidth / img.naturalHeight);
    }
  }, [imageUrl]);

  // useEffect (e handlePointerDown, che ne condivide lo stato) devono restare
  // PRIMA dell'eventuale return anticipato qui sotto: React richiede lo
  // stesso numero di hook ad ogni render di una stessa istanza montata. Se
  // isEditing alterna true/false sulla stessa istanza (CampaignCoverEditor,
  // banner campagna - a differenza di EntityImageExtras.tsx che monta questo
  // componente con isEditing sempre true, mai togglato), un useEffect dopo
  // il return anticipato farebbe scattare "Rendered more hooks than during
  // the previous render" e mandare in crash l'intero albero React (nessun
  // ErrorBoundary in app). Il ramo !isEditing sotto ignora semplicemente gli
  // effetti/handler qui definiti.
  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;

    const updateBoxWidth = () => setBoxWidth(element.getBoundingClientRect().width);
    updateBoxWidth();

    const observer = new ResizeObserver(updateBoxWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, [isEditing]);

  useEffect(() => {
    const element = frameRef.current;
    if (!element || !isEditing || !onScaleChange) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const delta = event.deltaY > 0 ? -0.01 : 0.01;
      const clamped = clampCoverCrop(crop.x, crop.y, scale + delta, boxWidth, resolvedAspectRatio, naturalAspect);
      onScaleChange(clamped.scale);
    };

    element.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      element.removeEventListener('wheel', handleWheel);
    };
  }, [isEditing, onScaleChange, scale, crop.x, crop.y, boxWidth, resolvedAspectRatio, naturalAspect]);

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
      const clamped = clampCoverCrop(
        initialX + moveEvent.clientX - startX,
        initialY + moveEvent.clientY - startY,
        scale,
        boxWidth,
        resolvedAspectRatio,
        naturalAspect
      );
      onCropChange({ x: clamped.x, y: clamped.y });
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

  const effectiveCrop = clampCoverCrop(crop.x, crop.y, scale, boxWidth, resolvedAspectRatio, naturalAspect);

  if (!isEditing) {
    return (
      <div className="flex justify-center">
        <div className={`relative bg-transparent ${resolvedSizeClassName}`}>
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

        {frameImageUrl && (
          <>
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
          </>
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
          ref={frameRef}
          onPointerDown={handlePointerDown}
          className={`relative bg-transparent ${resolvedSizeClassName}`}
          style={{ cursor: isEditing ? (isDraggingCover ? 'grabbing' : 'grab') : 'default' }}
        >
          <div className="pointer-events-none absolute inset-0 z-[15] rounded-xl border-2 border-[var(--dash-accent)] shadow-[0_0_0_1px_rgba(0,0,0,0.45),0_0_22px_rgba(245,166,35,0.18)]" />

          <div className="absolute inset-0 z-10 overflow-hidden rounded-xl bg-[var(--dash-panel)]">
            <img
              ref={imgRef}
              src={imageUrl}
              alt={`Illustrazione di ${name}`}
              className="h-full w-full select-none object-cover"
              draggable={false}
              onLoad={event => setNaturalAspect(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight)}
              style={{
                transform: `
                  translate(${effectiveCrop.x}px, ${effectiveCrop.y}px)
                  scale(${effectiveCrop.scale})
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
          <span>{Math.round(effectiveCrop.scale * 100)}%</span>
        </div>

        <input
          type="range"
          min={1}
          max={1.6}
          step={0.01}
          value={effectiveCrop.scale}
          onChange={e => {
            const clamped = clampCoverCrop(crop.x, crop.y, Number(e.target.value), boxWidth, resolvedAspectRatio, naturalAspect);
            onScaleChange?.(clamped.scale);
          }}
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
