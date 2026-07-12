import { useState } from 'react';
import type { Area } from 'react-easy-crop';
import { ImageCropCore } from '../../shared/ImageCropCore';
import { ImageAssetPicker } from '../../shared/ImageAssetPicker';
import { useAuth } from '../../../auth/AuthContext';
import { TOKEN_SHAPE_SPECS } from '../../shared/tokenShapes';
import { DEFAULT_TOKEN_BORDER_STYLE, type TokenBorderStyle } from '../../../../types/tokenStyle';
import {
  saveImageAssetSource,
  findReferenceCropAreaForAsset,
  DEFAULT_ASSET_CROP_AREA,
  type ImageAsset,
} from '../../../../services/supabase/imageAssetsService';

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
  tokenBorderStyle,
  portraitAssetId,
  canEdit,
  onPortraitChange,
}: {
  entityId: string;
  entityName: string;
  bucket: string;
  imageUrl?: string | null;
  sourceImageUrl?: string | null;
  cropArea?: Area | null;
  /** Forma Token dell'entita' (tab "Token"): la guida di ritaglio qui sotto
   *  ne mostra il contorno reale, cosi' l'inquadratura scelta corrisponde a
   *  quella che la forma finale mostrera' davvero. */
  tokenBorderStyle?: TokenBorderStyle | null;
  /** Asset condiviso della raccolta immagini gia' collegato a questa
   *  entita' (assente = immagine di proprieta' esclusiva). Quando una
   *  nuova foto sorgente viene confermata, se presente aggiorna quella
   *  riga in place (riferimento vivo: propaga a tutte le entita' che la
   *  condividono), altrimenti ne crea una nuova - vedi imageAssetsService.ts. */
  portraitAssetId?: string | null;
  canEdit: boolean;
  onPortraitChange: (patch: { portraitImageUrl?: string; portraitSourceImageUrl?: string; portraitCropArea?: Area | null; portraitAssetId?: string }) => void;
}) {
  const { user } = useAuth();
  // Scoped per utente (non per entita'): le policy RLS gia' in uso sui
  // bucket immagine (es. monster-images, verificata) richiedono che il
  // primo segmento del path sia auth.uid() - (storage.foldername(name))[1]
  // = auth.uid()::text. Un path scoped per entita' le viola per
  // costruzione, indipendentemente da chi e' loggato (bug scoperto
  // sull'upload Mostro attraverso questo stesso tab).
  const storagePath = `${user?.id ?? 'unknown'}/${entityId}-portrait-${Date.now()}.jpg`;

  const [showPicker, setShowPicker] = useState(false);
  // Asset scelto dalla raccolta, non ancora confermato: diventa il nuovo
  // existingImageUrl/existingCropArea di ImageCropCore (che gia' ricarica
  // l'editor quando questi prop cambiano, stesso meccanismo di un
  // aggiornamento esterno - nessuna modifica a ImageCropCore stesso). Se
  // l'utente annulla la selezione, si torna alla sorgente vera dell'entita'.
  const [pickedAsset, setPickedAsset] = useState<{ id: string; sourceUrl: string; cropArea: Area } | null>(null);

  const handlePickAsset = async (asset: ImageAsset) => {
    setShowPicker(false);
    // Il crop e' per-design per-entita' (Fase 1), non sulla riga
    // image_assets: se un'altra entita' propria referenzia gia' questo
    // asset, ne riusiamo il crop come punto di partenza, altrimenti
    // ripieghiamo sul quadrato intero centrato.
    const referenceCropArea = await findReferenceCropAreaForAsset(asset.id);
    setPickedAsset({
      id: asset.id,
      sourceUrl: asset.sourceImageUrl,
      cropArea: referenceCropArea ?? DEFAULT_ASSET_CROP_AREA,
    });
  };

  return (
    <fieldset disabled={!canEdit} className={!canEdit ? 'opacity-90' : ''}>
      {pickedAsset && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-[var(--dash-accent)]/40 bg-[var(--dash-accent)]/10 px-3 py-2 text-xs text-[var(--dash-text)]">
          <span>Stai usando una foto dalla raccolta: regola l'inquadratura qui sotto e conferma.</span>
          <button type="button" onClick={() => setPickedAsset(null)} className="shrink-0 text-[var(--dash-muted)] underline hover:text-[var(--dash-text)]">
            Annulla selezione
          </button>
        </div>
      )}
      <ImageCropCore
        bucket={bucket}
        storagePath={storagePath}
        cropShape="rect"
        aspect={1}
        cropGuideGeometry={TOKEN_SHAPE_SPECS[tokenBorderStyle ?? DEFAULT_TOKEN_BORDER_STYLE].geometry}
        preserveSource
        uploadLabel={`Seleziona l'immagine di ${entityName}`}
        existingImageUrl={pickedAsset?.sourceUrl ?? sourceImageUrl ?? imageUrl ?? undefined}
        existingCropArea={pickedAsset?.cropArea ?? cropArea ?? undefined}
        onPickFromCollection={user?.id ? () => setShowPicker(true) : undefined}
        onUploaded={async (url, extra) => {
          // extra.sourceUrl e' presente solo quando e' stato scelto un file
          // nuovo (non un semplice re-crop della sorgente esistente) - solo
          // in quel caso la foto sorgente e' davvero cambiata e va
          // propagata alla raccolta immagini condivisa. Un asset scelto dal
          // picker non passa da qui (nessun file nuovo, sourceUrl resta
          // undefined): il collegamento viene da pickedAsset invece.
          let assetId: string | undefined;
          if (extra?.sourceUrl !== undefined && user?.id) {
            assetId = (await saveImageAssetSource({
              existingAssetId: portraitAssetId ?? null,
              ownerProfileId: user.id,
              sourceImageUrl: extra.sourceUrl,
            })) ?? undefined;
          }

          onPortraitChange({
            portraitImageUrl: url,
            ...(extra?.sourceUrl !== undefined
              ? { portraitSourceImageUrl: extra.sourceUrl }
              : pickedAsset
                ? { portraitSourceImageUrl: pickedAsset.sourceUrl }
                : {}),
            portraitCropArea: extra?.cropArea ?? null,
            ...(assetId
              ? { portraitAssetId: assetId }
              : pickedAsset
                ? { portraitAssetId: pickedAsset.id }
                : {}),
          });
          setPickedAsset(null);
        }}
        onRemove={imageUrl ? () => {
          setPickedAsset(null);
          onPortraitChange({ portraitImageUrl: '', portraitSourceImageUrl: '', portraitCropArea: null });
        } : undefined}
      />
      {showPicker && user?.id && (
        <ImageAssetPicker ownerProfileId={user.id} onSelect={handlePickAsset} onClose={() => setShowPicker(false)} />
      )}
    </fieldset>
  );
}
