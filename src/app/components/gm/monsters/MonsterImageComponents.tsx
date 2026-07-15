import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../../auth/AuthContext';
import { isSupabaseConfigured, supabase } from '../../../../lib/supabaseClient';
import { generateUUID } from '../../../../lib/uuid';
import type { Monster, ImageCrop } from './monstersTypes';
import { DEFAULT_CROP, NO_FRAME_VALUE } from './monstersConstants';
import { FrameTransformStepper, ImageEditor, PortraitCropFrame } from '../../shared/PortraitCropEditor';
import {
  loadVisualAssetsByTypes,
  VISUAL_ASSETS_CHANGED_EVENT,
  type VisualAsset
} from '../../../../services/storage/visualAssetsStorage';

// ImageEditor e PortraitCropFrame (ex MonsterPortraitFrame) sono stati
// estratti in shared/PortraitCropEditor.tsx per essere riusati dal tab
// "Immagine" di PG/PNG/Mostri in EntityDetailView.tsx - qui restano
// MonsterImageExtras e MonsterCoverFrame, cablati al tipo Monster (quest'ultimo
// non ancora generalizzato: riguarda la cover 16:9, fuori dall'ambito del tab
// "Immagine").
export { ImageEditor, PortraitCropFrame } from '../../shared/PortraitCropEditor';

// Select generica cornice (portrait/cover condividono la stessa struttura,
// solo il tipo di asset filtrato cambia) - "" = Default, NO_FRAME_VALUE =
// Nessuna cornice, altrimenti l'id di un asset specifico. Mai componentizzata
// nel vecchio MonstersManager.tsx (era JSX duplicato due volte).
function FrameAssetSelect({
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

// Porta la cornice portrait + l'intero sistema cover del vecchio tab
// "Avatar" (MonstersManager.tsx, rimosso in Fase 2) dentro il tab "Immagine"
// di EntityDetailView.tsx - Fase 3 della migrazione. Esclude deliberatamente
// il crop live della foto portrait (portraitCrop/portraitRotationDegrees):
// confliggerebbe col nuovo ritaglio non distruttivo di EntityImageTab.tsx,
// che tratta portraitImageUrl come risultato gia' ritagliato. Cornice
// overlay e cover invece non hanno alcun sistema concorrente, portati con
// parita' completa. Il "Cerchio portrait" che viveva qui accanto e' stato
// rimosso in Fase 4 (zero consumer reali fuori dalla propria anteprima di
// editing - vedi Token Studio per lo stesso bisogno, gia' servito altrove).
export function MonsterImageExtras({
  monster,
  campaignId,
  onUpdate
}: {
  monster: Monster;
  campaignId: string;
  onUpdate: (monster: Monster) => void;
}) {
  const { user } = useAuth();
  const [visualAssets, setVisualAssets] = useState<VisualAsset[]>([]);
  const [isUploadingCover, setIsUploadingCover] = useState(false);

  // Fetch lazy: solo mentre questo componente e' montato, cioe' solo
  // quando il tab Immagine e' aperto su un Mostro - a differenza del
  // vecchio MonstersManager.tsx che la caricava incondizionatamente al
  // mount dell'intero manager.
  useEffect(() => {
    if (!campaignId) return;

    let cancelled = false;

    const loadFrameAssets = async () => {
      try {
        const assets = await loadVisualAssetsByTypes(
          campaignId,
          ['monster-frame-default', 'monster-frame', 'monster-portrait-frame-default', 'monster-portrait-frame'],
          { preferPersistentCache: true }
        );

        if (!cancelled) setVisualAssets(assets);
      } catch (error) {
        console.error('Errore caricamento cornici mostro:', error);

        if (!cancelled) setVisualAssets([]);
      }
    };

    void loadFrameAssets();

    const handleVisualAssetsChanged = () => {
      void loadFrameAssets();
    };

    window.addEventListener(VISUAL_ASSETS_CHANGED_EVENT, handleVisualAssetsChanged);

    return () => {
      cancelled = true;
      window.removeEventListener(VISUAL_ASSETS_CHANGED_EVENT, handleVisualAssetsChanged);
    };
  }, [campaignId]);

  const defaultMonsterFrameAsset =
    visualAssets.find(asset => asset.type === 'monster-frame-default') ??
    visualAssets.find(asset => asset.name === 'Cornice Foto Mostro Default') ??
    visualAssets.find(asset => asset.name === 'Cornice Foto Estesa Mostro Default') ??
    visualAssets.find(asset => asset.type === 'monster-frame');

  const defaultPortraitFrameAsset =
    visualAssets.find(asset => asset.type === 'monster-portrait-frame-default') ??
    visualAssets.find(asset => asset.name === 'Cornice Portrait Mostro Default') ??
    visualAssets.find(asset => asset.type === 'monster-portrait-frame');

  const getPortraitFrameImageUrl = (): string | undefined => {
    if (monster.portraitFrameAssetId === NO_FRAME_VALUE) return undefined;

    return visualAssets.find(asset => asset.id === monster.portraitFrameAssetId)?.imageDataUrl ??
      defaultPortraitFrameAsset?.imageDataUrl;
  };

  const getCoverFrameImageUrl = (): string | undefined => {
    if (monster.coverFrameAssetId === NO_FRAME_VALUE) return undefined;

    return visualAssets.find(asset => asset.id === monster.coverFrameAssetId)?.imageDataUrl ??
      defaultMonsterFrameAsset?.imageDataUrl;
  };

  const rotatePortraitFrameDegrees = (delta: number) => {
    const current = monster.portraitFrameRotationDegrees ?? 0;
    onUpdate({ ...monster, portraitFrameRotationDegrees: (current + delta + 360) % 360 });
  };

  const resetPortraitFrame = () => {
    onUpdate({
      ...monster,
      portraitFrameRotationDegrees: 0,
      portraitFrameOffsetX: 0,
      portraitFrameOffsetY: 0,
      portraitFrameScaleX: 1,
      portraitFrameScaleY: 1
    });
  };

  const updateCoverScale = (scale: number) => {
    onUpdate({ ...monster, coverImageScale: Math.max(0.5, Math.min(1.6, scale)) });
  };

  const updateCoverCrop = (patch: Partial<ImageCrop>) => {
    onUpdate({ ...monster, coverCrop: { ...(monster.coverCrop ?? DEFAULT_CROP), ...patch } });
  };

  const rotateCoverImageDegrees = (delta: number) => {
    const current = monster.coverRotationDegrees ?? 0;
    onUpdate({ ...monster, coverRotationDegrees: (current + delta + 360) % 360 });
  };

  const toggleFrameRotation = () => {
    onUpdate({ ...monster, frameRotation: monster.frameRotation === 90 ? 0 : 90 });
  };

  const rotateFrameDegrees = (delta: number) => {
    const current = monster.frameRotationDegrees ?? 0;
    onUpdate({ ...monster, frameRotationDegrees: (current + delta + 360) % 360 });
  };

  const resetCoverImageAndFrame = () => {
    onUpdate({
      ...monster,
      coverCrop: DEFAULT_CROP,
      coverImageScale: 1,
      coverRotationDegrees: 0,
      frameRotation: 0,
      frameRotationDegrees: 0
    });
  };

  const handleCoverFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Seleziona un file immagine valido.');
      return;
    }

    const readAsBase64 = () => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        onUpdate({ ...monster, coverImageUrl: result });
      };
      reader.readAsDataURL(file);
    };

    if (isSupabaseConfigured && supabase && user) {
      setIsUploadingCover(true);
      try {
        const ext = file.name.split('.').pop() ?? 'png';
        const filePath = `${user.id}/${monster.id || generateUUID()}-cover-${Date.now()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('monster-images')
          .upload(filePath, file, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('monster-images')
          .getPublicUrl(filePath);

        onUpdate({ ...monster, coverImageUrl: publicUrl });
      } catch (err) {
        console.error('Errore upload immagine cover su Storage:', err);
        readAsBase64();
      } finally {
        setIsUploadingCover(false);
      }
    } else {
      readAsBase64();
    }
  };

  return (
    <div className="mt-6 space-y-6">
      <FrameAssetSelect
        label="Cornice portrait"
        value={monster.portraitFrameAssetId}
        assets={visualAssets.filter(asset => asset.type === 'monster-portrait-frame')}
        defaultHint="Default = prima Cornice Portrait Mostro caricata negli Asset Grafici."
        onChange={value =>
          onUpdate({ ...monster, portraitFrameAssetId: value === NO_FRAME_VALUE ? NO_FRAME_VALUE : (value || null) })
        }
      />

      {monster.portraitImageUrl && (
        <PortraitCropFrame
          imageUrl={monster.portraitImageUrl}
          name={monster.name}
          frameImageUrl={getPortraitFrameImageUrl()}
          frameRotationDegrees={monster.portraitFrameRotationDegrees ?? 0}
          frameOffsetX={monster.portraitFrameOffsetX ?? 0}
          frameOffsetY={monster.portraitFrameOffsetY ?? 0}
          frameScaleX={monster.portraitFrameScaleX ?? 1}
          frameScaleY={monster.portraitFrameScaleY ?? 1}
          onRotateFrameDegrees={rotatePortraitFrameDegrees}
          onFrameTransformChange={patch => onUpdate({ ...monster, ...patch })}
          onResetFrameTransform={() =>
            onUpdate({
              ...monster,
              portraitFrameOffsetX: 0,
              portraitFrameOffsetY: 0,
              portraitFrameScaleX: 1,
              portraitFrameScaleY: 1,
              portraitFrameRotationDegrees: 0
            })
          }
          onReset={resetPortraitFrame}
        />
      )}

      <div className="border-t border-[var(--dash-border-soft)] pt-6">
        <ImageEditor
          title="Immagine mostro"
          imageUrl={monster.coverImageUrl ?? ''}
          onUrlChange={value => onUpdate({ ...monster, coverImageUrl: value })}
          onFileChange={handleCoverFileUpload}
          isUploading={isUploadingCover}
        />

        <div className="mt-4">
          <FrameAssetSelect
            label="Cornice foto mostro"
            value={monster.coverFrameAssetId}
            assets={visualAssets.filter(asset => asset.type === 'monster-frame')}
            defaultHint="Default = Cornice Foto Mostro Default caricata negli Asset Grafici."
            onChange={value =>
              onUpdate({ ...monster, coverFrameAssetId: value === NO_FRAME_VALUE ? NO_FRAME_VALUE : (value || null) })
            }
          />
        </div>

        {monster.coverImageUrl && (
          <div className="mt-4">
            <MonsterCoverFrame
              imageUrl={monster.coverImageUrl}
              name={monster.name}
              scale={monster.coverImageScale ?? 1}
              crop={monster.coverCrop ?? DEFAULT_CROP}
              frameImageUrl={getCoverFrameImageUrl()}
              frameRotation={monster.frameRotation ?? 0}
              frameRotationDegrees={monster.frameRotationDegrees ?? 0}
              frameOffsetX={monster.coverFrameOffsetX ?? 0}
              frameOffsetY={monster.coverFrameOffsetY ?? 0}
              frameScaleX={monster.coverFrameScaleX ?? 1}
              frameScaleY={monster.coverFrameScaleY ?? 1}
              coverRotationDegrees={monster.coverRotationDegrees ?? 0}
              isEditing
              onCropChange={updateCoverCrop}
              onScaleChange={updateCoverScale}
              onToggleFrameRotation={toggleFrameRotation}
              onRotateFrameDegrees={rotateFrameDegrees}
              onFrameTransformChange={patch => onUpdate({ ...monster, ...patch })}
              onResetFrameTransform={() =>
                onUpdate({
                  ...monster,
                  coverFrameOffsetX: 0,
                  coverFrameOffsetY: 0,
                  coverFrameScaleX: 1,
                  coverFrameScaleY: 1,
                  frameRotationDegrees: 0
                })
              }
              onRotateImageDegrees={rotateCoverImageDegrees}
              onReset={resetCoverImageAndFrame}
            />
          </div>
        )}
      </div>
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
