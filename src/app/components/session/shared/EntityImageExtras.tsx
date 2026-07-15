import { useEffect, useState } from 'react';
import { useAuth } from '../../../auth/AuthContext';
import { isSupabaseConfigured, supabase } from '../../../../lib/supabaseClient';
import { generateUUID } from '../../../../lib/uuid';
import { DEFAULT_CROP, NO_FRAME_VALUE, type ImageCrop } from '../../../../types/imageCrop';
import {
  ImageEditor,
  PortraitCropFrame,
  FrameAssetSelect,
  CoverFrame
} from '../../shared/PortraitCropEditor';
import {
  loadVisualAssetsByTypes,
  VISUAL_ASSETS_CHANGED_EVENT,
  type VisualAsset
} from '../../../../services/storage/visualAssetsStorage';

export type EntityImageExtrasType = 'monster' | 'character' | 'npc';

const ENTITY_LABELS: Record<EntityImageExtrasType, string> = {
  monster: 'Mostro',
  character: 'PG',
  npc: 'PNG'
};

// Campi minimi richiesti per il tab "Immagine" - cornice portrait + cover
// 16:9 + cornice cover, stessa struttura per Mostri/PG/PNG (vedi
// entitiesService.ts/types/character.ts). Deliberatamente esclude
// portraitCrop/portraitRotationDegrees: concetti legacy esclusivi di
// Monster, mai esistiti su NPC/Character - non vanno reintrodotti qui.
export type EntityImageExtrasEntity = {
  id: string;
  name: string;
  portraitImageUrl?: string;
  portraitFrameAssetId?: string | null;
  portraitFrameRotationDegrees?: number;
  portraitFrameOffsetX?: number;
  portraitFrameOffsetY?: number;
  portraitFrameScaleX?: number;
  portraitFrameScaleY?: number;
  coverImageUrl?: string;
  coverImageScale?: number;
  coverCrop?: ImageCrop;
  coverRotationDegrees?: number;
  frameRotation?: 0 | 90;
  frameRotationDegrees?: number;
  coverFrameOffsetX?: number;
  coverFrameOffsetY?: number;
  coverFrameScaleX?: number;
  coverFrameScaleY?: number;
  coverFrameAssetId?: string | null;
};

// Generalizzazione di MonsterImageExtras (Fase 5 della migrazione
// EntityDetailView) a PG/PNG: stessa identica logica, parametrizzata per
// entityType (solo testi UI) e storageBucket (riusa il valore gia'
// calcolato da EntityDetailView per EntityImageTab, nessuna seconda
// ternary di risoluzione bucket qui). Catalogo cornici condiviso tra le
// tre entita' (nessun filtro per entityType sui tipi visual_assets).
export function EntityImageExtras<T extends EntityImageExtrasEntity>({
  entity,
  campaignId,
  entityType,
  storageBucket,
  onUpdate
}: {
  entity: T;
  campaignId: string;
  entityType: EntityImageExtrasType;
  storageBucket: string;
  onUpdate: (entity: T) => void;
}) {
  const { user } = useAuth();
  const [visualAssets, setVisualAssets] = useState<VisualAsset[]>([]);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const entityLabel = ENTITY_LABELS[entityType];

  // Fetch lazy: solo mentre questo componente e' montato, cioe' solo
  // quando il tab Immagine e' aperto.
  useEffect(() => {
    if (!campaignId) return;

    let cancelled = false;

    const loadFrameAssets = async () => {
      try {
        const assets = await loadVisualAssetsByTypes(
          campaignId,
          ['frame-default', 'frame', 'portrait-frame-default', 'portrait-frame'],
          { preferPersistentCache: true }
        );

        if (!cancelled) setVisualAssets(assets);
      } catch (error) {
        console.error('Errore caricamento cornici:', error);

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

  const defaultFrameAsset =
    visualAssets.find(asset => asset.type === 'frame-default') ??
    visualAssets.find(asset => asset.name === 'Cornice Foto Default') ??
    visualAssets.find(asset => asset.name === 'Cornice Foto Mostro Default') ??
    visualAssets.find(asset => asset.name === 'Cornice Foto Estesa Mostro Default') ??
    visualAssets.find(asset => asset.type === 'frame');

  const defaultPortraitFrameAsset =
    visualAssets.find(asset => asset.type === 'portrait-frame-default') ??
    visualAssets.find(asset => asset.name === 'Cornice Portrait Default') ??
    visualAssets.find(asset => asset.name === 'Cornice Portrait Mostro Default') ??
    visualAssets.find(asset => asset.type === 'portrait-frame');

  const getPortraitFrameImageUrl = (): string | undefined => {
    if (entity.portraitFrameAssetId === NO_FRAME_VALUE) return undefined;

    return visualAssets.find(asset => asset.id === entity.portraitFrameAssetId)?.imageDataUrl ??
      defaultPortraitFrameAsset?.imageDataUrl;
  };

  const getCoverFrameImageUrl = (): string | undefined => {
    if (entity.coverFrameAssetId === NO_FRAME_VALUE) return undefined;

    return visualAssets.find(asset => asset.id === entity.coverFrameAssetId)?.imageDataUrl ??
      defaultFrameAsset?.imageDataUrl;
  };

  const rotatePortraitFrameDegrees = (delta: number) => {
    const current = entity.portraitFrameRotationDegrees ?? 0;
    onUpdate({ ...entity, portraitFrameRotationDegrees: (current + delta + 360) % 360 });
  };

  const resetPortraitFrame = () => {
    onUpdate({
      ...entity,
      portraitFrameRotationDegrees: 0,
      portraitFrameOffsetX: 0,
      portraitFrameOffsetY: 0,
      portraitFrameScaleX: 1,
      portraitFrameScaleY: 1
    });
  };

  const updateCoverScale = (scale: number) => {
    onUpdate({ ...entity, coverImageScale: Math.max(0.5, Math.min(1.6, scale)) });
  };

  const updateCoverCrop = (patch: Partial<ImageCrop>) => {
    onUpdate({ ...entity, coverCrop: { ...(entity.coverCrop ?? DEFAULT_CROP), ...patch } });
  };

  const rotateCoverImageDegrees = (delta: number) => {
    const current = entity.coverRotationDegrees ?? 0;
    onUpdate({ ...entity, coverRotationDegrees: (current + delta + 360) % 360 });
  };

  const toggleFrameRotation = () => {
    onUpdate({ ...entity, frameRotation: entity.frameRotation === 90 ? 0 : 90 });
  };

  const rotateFrameDegrees = (delta: number) => {
    const current = entity.frameRotationDegrees ?? 0;
    onUpdate({ ...entity, frameRotationDegrees: (current + delta + 360) % 360 });
  };

  const resetCoverImageAndFrame = () => {
    onUpdate({
      ...entity,
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
        onUpdate({ ...entity, coverImageUrl: result });
      };
      reader.readAsDataURL(file);
    };

    if (isSupabaseConfigured && supabase && user) {
      setIsUploadingCover(true);
      try {
        const ext = file.name.split('.').pop() ?? 'png';
        const filePath = `${user.id}/${entity.id || generateUUID()}-cover-${Date.now()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from(storageBucket)
          .upload(filePath, file, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from(storageBucket)
          .getPublicUrl(filePath);

        onUpdate({ ...entity, coverImageUrl: publicUrl });
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
        value={entity.portraitFrameAssetId}
        assets={visualAssets.filter(asset => asset.type === 'portrait-frame')}
        defaultHint="Default = prima Cornice Portrait caricata negli Asset Grafici."
        onChange={value =>
          onUpdate({ ...entity, portraitFrameAssetId: value === NO_FRAME_VALUE ? NO_FRAME_VALUE : (value || null) })
        }
      />

      {entity.portraitImageUrl && (
        <PortraitCropFrame
          imageUrl={entity.portraitImageUrl}
          name={entity.name}
          frameImageUrl={getPortraitFrameImageUrl()}
          frameRotationDegrees={entity.portraitFrameRotationDegrees ?? 0}
          frameOffsetX={entity.portraitFrameOffsetX ?? 0}
          frameOffsetY={entity.portraitFrameOffsetY ?? 0}
          frameScaleX={entity.portraitFrameScaleX ?? 1}
          frameScaleY={entity.portraitFrameScaleY ?? 1}
          onRotateFrameDegrees={rotatePortraitFrameDegrees}
          onFrameTransformChange={patch => onUpdate({ ...entity, ...patch })}
          onResetFrameTransform={() =>
            onUpdate({
              ...entity,
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
          title={`Immagine ${entityLabel}`}
          imageUrl={entity.coverImageUrl ?? ''}
          onUrlChange={value => onUpdate({ ...entity, coverImageUrl: value })}
          onFileChange={handleCoverFileUpload}
          isUploading={isUploadingCover}
        />

        <div className="mt-4">
          <FrameAssetSelect
            label={`Cornice foto ${entityLabel}`}
            value={entity.coverFrameAssetId}
            assets={visualAssets.filter(asset => asset.type === 'frame')}
            defaultHint="Default = Cornice Foto Default caricata negli Asset Grafici."
            onChange={value =>
              onUpdate({ ...entity, coverFrameAssetId: value === NO_FRAME_VALUE ? NO_FRAME_VALUE : (value || null) })
            }
          />
        </div>

        {entity.coverImageUrl && (
          <div className="mt-4">
            <CoverFrame
              imageUrl={entity.coverImageUrl}
              name={entity.name}
              scale={entity.coverImageScale ?? 1}
              crop={entity.coverCrop ?? DEFAULT_CROP}
              frameImageUrl={getCoverFrameImageUrl()}
              frameRotation={entity.frameRotation ?? 0}
              frameRotationDegrees={entity.frameRotationDegrees ?? 0}
              frameOffsetX={entity.coverFrameOffsetX ?? 0}
              frameOffsetY={entity.coverFrameOffsetY ?? 0}
              frameScaleX={entity.coverFrameScaleX ?? 1}
              frameScaleY={entity.coverFrameScaleY ?? 1}
              coverRotationDegrees={entity.coverRotationDegrees ?? 0}
              isEditing
              onCropChange={updateCoverCrop}
              onScaleChange={updateCoverScale}
              onToggleFrameRotation={toggleFrameRotation}
              onRotateFrameDegrees={rotateFrameDegrees}
              onFrameTransformChange={patch => onUpdate({ ...entity, ...patch })}
              onResetFrameTransform={() =>
                onUpdate({
                  ...entity,
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
