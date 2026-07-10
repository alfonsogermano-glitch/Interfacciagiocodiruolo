import { useState } from 'react';
import { ImageCropUploadModal } from '../../shared/ImageCropUploadModal';
import { useAuth } from '../../../auth/AuthContext';

/**
 * Tab "Immagine" condiviso da PG/PNG/Mostri in EntityDetailView.tsx: stesso
 * componente di upload+crop gia' usato con successo per l'avatar utente e
 * il logo campagna (react-easy-crop, ritaglio distruttivo con
 * restrictPosition di default - mai un bordo vuoto, per costruzione).
 * L'output e' un'unica publicUrl gia' ritagliata, scritta su
 * portraitImageUrl: nessun bake separato, nessun crop live da mantenere in
 * sincronia tra editor/header/token.
 */
export function EntityImageTab({
  entityId,
  entityName,
  bucket,
  imageUrl,
  canEdit,
  onImageUrlChange,
}: {
  entityId: string;
  entityName: string;
  bucket: string;
  imageUrl?: string | null;
  canEdit: boolean;
  onImageUrlChange: (url: string) => void;
}) {
  const { user } = useAuth();
  const [showCropModal, setShowCropModal] = useState(false);
  // Scoped per utente (non per entita'): le policy RLS gia' in uso sui
  // bucket immagine (es. monster-images, verificata) richiedono che il
  // primo segmento del path sia auth.uid() - (storage.foldername(name))[1]
  // = auth.uid()::text. Un path scoped per entita' le viola per
  // costruzione, indipendentemente da chi e' loggato (bug scoperto
  // sull'upload Mostro attraverso questo stesso tab).
  const storagePath = `${user?.id ?? 'unknown'}/${entityId}-portrait-${Date.now()}.jpg`;

  return (
    <fieldset disabled={!canEdit} className={!canEdit ? 'space-y-4 opacity-90' : 'space-y-4'}>
      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => setShowCropModal(true)}
          className="relative flex h-40 w-40 items-center justify-center overflow-hidden rounded-full border-2 border-[var(--dash-accent)] bg-[var(--dash-input)]"
        >
          {imageUrl ? (
            <img src={imageUrl} alt={`Immagine di ${entityName}`} className="h-full w-full object-cover" />
          ) : (
            <div className="text-center text-sm text-[var(--dash-muted)]">Nessuna immagine</div>
          )}
        </button>
        <p className="text-center text-xs text-[var(--dash-muted)]">Clicca per scegliere/ritagliare</p>
      </div>

      {showCropModal && (
        <ImageCropUploadModal
          bucket={bucket}
          storagePath={storagePath}
          cropShape="round"
          aspect={1}
          uploadLabel={`Seleziona l'immagine di ${entityName}`}
          onUploaded={url => {
            onImageUrlChange(url);
            setShowCropModal(false);
          }}
          onRemove={imageUrl ? () => { onImageUrlChange(''); setShowCropModal(false); } : undefined}
          onClose={() => setShowCropModal(false)}
        />
      )}
    </fieldset>
  );
}
