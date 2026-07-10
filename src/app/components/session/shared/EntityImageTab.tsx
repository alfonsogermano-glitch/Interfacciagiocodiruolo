import { useCallback, useEffect, useRef, useState } from 'react';
import type { ImageCrop } from '../../gm/monsters/monstersTypes';
import { ImageEditor, PortraitCropFrame } from '../../shared/PortraitCropEditor';
import { uploadImageToStorage, bakePortraitCrop } from '../../../../services/supabase/storageService';

const IDENTITY_CROP: ImageCrop = { x: 0, y: 0, scale: 1 };
const BAKE_DEBOUNCE_MS = 500;

/**
 * Tab "Immagine" condiviso da PG/PNG/Mostri in EntityDetailView.tsx: upload
 * + pan/zoom live (stesso sistema gia' in uso per i Mostri, generalizzato
 * in shared/PortraitCropEditor.tsx), con bake automatico in
 * portraitCroppedImageUrl per i consumer che si aspettano un'immagine gia'
 * pronta (card, liste...). Il bake e' debounced e viene comunque
 * eseguito (flush) alla chiusura/cambio tab, per non perdere l'ultimo
 * aggiustamento non ancora "cotto".
 */
export function EntityImageTab({
  entityId,
  entityName,
  bucket,
  imageUrl,
  crop,
  rotationDegrees,
  canEdit,
  onImageUrlChange,
  onCropChange,
  onRotationDegreesChange,
  onCroppedImageUrlChange,
}: {
  entityId: string;
  entityName: string;
  bucket: string;
  imageUrl?: string | null;
  crop?: ImageCrop | null;
  rotationDegrees?: number | null;
  canEdit: boolean;
  onImageUrlChange: (url: string) => void;
  onCropChange: (crop: ImageCrop) => void;
  onRotationDegreesChange: (degrees: number) => void;
  /** Omesso per i Mostri: il loro crop live e' gia' applicato ad ogni
   *  rendering (PortraitImage...), non serve una copia "cotta" - e il
   *  tipo Monster non ha un campo portraitCroppedImageUrl da scrivere. */
  onCroppedImageUrlChange?: (url: string) => void;
}) {
  const resolvedCrop = crop ?? IDENTITY_CROP;
  const resolvedRotation = rotationDegrees ?? 0;
  const bakeEnabled = Boolean(onCroppedImageUrlChange);

  const [isUploading, setIsUploading] = useState(false);
  const [isBaking, setIsBaking] = useState(false);

  const pendingBakeRef = useRef<{ crop: ImageCrop; rotationDegrees: number; imageUrl: string } | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runBake = useCallback(async (snapshot: { crop: ImageCrop; rotationDegrees: number; imageUrl: string }) => {
    if (!snapshot.imageUrl || !onCroppedImageUrlChange) return;
    setIsBaking(true);
    try {
      const url = await bakePortraitCrop({
        imageUrl: snapshot.imageUrl,
        crop: snapshot.crop,
        rotationDegrees: snapshot.rotationDegrees,
        bucket,
        path: `${entityId}/portrait-cropped.jpg`,
      });
      onCroppedImageUrlChange(url);
    } catch (err) {
      console.error('Errore nella generazione dell\'anteprima ritagliata:', err);
    } finally {
      setIsBaking(false);
    }
  }, [bucket, entityId, onCroppedImageUrlChange]);

  // L'effect di flush all'unmount ha deps [] (deve scattare solo alla vera
  // chiusura, non ad ogni modifica) quindi altrimenti chiuderebbe su un
  // runBake "vecchio" del primo render. Il ref tiene sempre l'ultima
  // versione (con l'ultimo onCroppedImageUrlChange/entity aggiornati).
  const runBakeRef = useRef(runBake);
  runBakeRef.current = runBake;

  // Debounce: ogni modifica al crop/rotazione riprogramma il bake.
  useEffect(() => {
    if (!bakeEnabled || !imageUrl) return undefined;
    pendingBakeRef.current = { crop: resolvedCrop, rotationDegrees: resolvedRotation, imageUrl };
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      const toBake = pendingBakeRef.current;
      pendingBakeRef.current = null;
      if (toBake) runBakeRef.current(toBake);
    }, BAKE_DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedCrop.x, resolvedCrop.y, resolvedCrop.scale, resolvedRotation, imageUrl]);

  // Flush all'unmount (cambio tab della rail, chiusura pannello): se il
  // debounce non e' ancora scattato, esegue subito il bake pendente
  // invece di scartare in silenzio l'ultimo aggiustamento.
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (pendingBakeRef.current) {
        const toBake = pendingBakeRef.current;
        pendingBakeRef.current = null;
        runBakeRef.current(toBake);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Seleziona un file immagine valido.');
      return;
    }

    setIsUploading(true);
    try {
      const ext = file.name.split('.').pop() ?? 'png';
      const path = `${entityId}/portrait-${Date.now()}.${ext}`;
      const url = await uploadImageToStorage({ file, bucket, path });
      onImageUrlChange(url);
    } catch (err) {
      console.error('Errore upload immagine:', err);
      alert('Caricamento non riuscito. Riprova.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <fieldset disabled={!canEdit} className={!canEdit ? 'space-y-4 opacity-90' : 'space-y-4'}>
      <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
        <ImageEditor
          title="Immagine"
          imageUrl={imageUrl ?? ''}
          onUrlChange={onImageUrlChange}
          onFileChange={handleFileChange}
          isUploading={isUploading}
        />
      </div>

      {imageUrl ? (
        <PortraitCropFrame
          imageUrl={imageUrl}
          name={entityName}
          crop={resolvedCrop}
          portraitRotationDegrees={resolvedRotation}
          isEditing={canEdit}
          onCropChange={patch => onCropChange({ ...resolvedCrop, ...patch })}
          onScaleChange={scale => onCropChange({ ...resolvedCrop, scale })}
          onRotateImageDegrees={delta => onRotationDegreesChange(resolvedRotation + delta)}
          onReset={() => {
            onCropChange(IDENTITY_CROP);
            onRotationDegreesChange(0);
          }}
        />
      ) : (
        <p className="text-center text-xs text-[var(--dash-muted)]">
          Carica un'immagine per regolare inquadratura e zoom.
        </p>
      )}

      {isBaking && (
        <p className="text-center text-xs text-[var(--dash-muted)]">Salvataggio anteprima…</p>
      )}
    </fieldset>
  );
}
