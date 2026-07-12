import type { Area } from 'react-easy-crop';
import { ImageCropCore } from '../../shared/ImageCropCore';
import { useAuth } from '../../../auth/AuthContext';

/**
 * Tab "Immagine" condiviso da PG/PNG/Mostri in EntityDetailView.tsx: monta
 * ImageCropCore (nucleo condiviso con ImageCropUploadModal, usato invece
 * come overlay per avatar utente e logo campagna) inline, senza backdrop -
 * l'editor e' visibile per intero non appena si apre la tab, nessun click
 * preliminare per aprirlo. react-easy-crop, ritaglio non distruttivo:
 * l'editor riparte sempre da sourceImageUrl (foto intera, ridimensionata a
 * un massimo ragionevole al primo upload), non dall'ultimo quadrato
 * salvato - portraitImageUrl resta solo il risultato gia' ritagliato,
 * usato in card/griglia/token. cropArea (percentuali, formato nativo di
 * react-easy-crop) riporta posizione/zoom dell'ultimo crop confermato, cosi'
 * il cropper riparte da li' invece che da centro/zoom di default. Entita'
 * con dati precedenti a questa modifica non hanno sourceImageUrl/cropArea:
 * fallback su portraitImageUrl e su centro/zoom di default (nessun dato
 * perso, semplicemente non esistono per quei casi) - si autoripara al
 * prossimo salvataggio.
 *
 * onPortraitChange e' un'unica callback per conferma/eliminazione (non tre
 * separate) apposta: ImageCropCore la chiama una sola volta con tutti i
 * campi cambiati in quella azione, cosi' EntityDetailView fa un solo
 * onUpdate({...entity, ...patch}) invece di piu' chiamate che spreaderebbero
 * tutte dalla stessa "entity" catturata al click, sovrascrivendosi a vicenda.
 */
export function EntityImageTab({
  entityId,
  entityName,
  bucket,
  imageUrl,
  sourceImageUrl,
  cropArea,
  canEdit,
  onPortraitChange,
}: {
  entityId: string;
  entityName: string;
  bucket: string;
  imageUrl?: string | null;
  sourceImageUrl?: string | null;
  cropArea?: Area | null;
  canEdit: boolean;
  onPortraitChange: (patch: { portraitImageUrl?: string; portraitSourceImageUrl?: string; portraitCropArea?: Area | null }) => void;
}) {
  const { user } = useAuth();
  // Scoped per utente (non per entita'): le policy RLS gia' in uso sui
  // bucket immagine (es. monster-images, verificata) richiedono che il
  // primo segmento del path sia auth.uid() - (storage.foldername(name))[1]
  // = auth.uid()::text. Un path scoped per entita' le viola per
  // costruzione, indipendentemente da chi e' loggato (bug scoperto
  // sull'upload Mostro attraverso questo stesso tab).
  const storagePath = `${user?.id ?? 'unknown'}/${entityId}-portrait-${Date.now()}.jpg`;

  return (
    <fieldset disabled={!canEdit} className={!canEdit ? 'opacity-90' : ''}>
      <ImageCropCore
        bucket={bucket}
        storagePath={storagePath}
        cropShape="rect"
        aspect={1}
        showCropGuide
        preserveSource
        uploadLabel={`Seleziona l'immagine di ${entityName}`}
        existingImageUrl={sourceImageUrl ?? imageUrl ?? undefined}
        existingCropArea={cropArea ?? undefined}
        onUploaded={(url, extra) => onPortraitChange({
          portraitImageUrl: url,
          ...(extra?.sourceUrl !== undefined ? { portraitSourceImageUrl: extra.sourceUrl } : {}),
          portraitCropArea: extra?.cropArea ?? null,
        })}
        onRemove={imageUrl ? () => onPortraitChange({ portraitImageUrl: '', portraitSourceImageUrl: '', portraitCropArea: null }) : undefined}
      />
    </fieldset>
  );
}
