import { useState } from 'react';
import { ImagePlus, Pencil } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { ImageCropUploadModal } from '../components/shared/ImageCropUploadModal';
import { ImageAssetPicker } from '../components/shared/ImageAssetPicker';
import { CampaignBannerDisplay } from '../components/shared/CampaignBannerDisplay';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip';
import type { ImageAsset } from '../../services/supabase/imageAssetsService';
import type { Campaign } from './campaignTypes';

const BANNER_ASPECT = 3.8;

export type CampaignCoverPatch = {
  coverImageUrl?: string | null;
};

/**
 * Banner header di CampaignHome, stile QuestPortal - wrapper sottile attorno
 * a CampaignBannerDisplay (porzione statica condivisa, riusata anche dalle
 * card della Panoramica in HomeScreen.tsx): qui si aggiunge solo la chrome di
 * editing (pulsante matita, CTA "aggiungi immagine", modal di upload).
 *
 * Editing tramite ImageCropCore/ImageCropUploadModal già collaudati per
 * logo campagna e portrait PG/PNG/Mostri (altezza fissa in pixel, nessuna
 * geometria nostra) - dopo tre round di crash su un'integrazione scritta da
 * zero (Rules of Hooks, sfarfallio, geometria disallineata, loop di resize
 * su <Cropper> montato a mano). Il ritaglio è distruttivo (niente
 * preserveSource): il file caricato è già il risultato ritagliato
 * (BANNER_ASPECT), non un'immagine grezza con metadati di crop separati.
 */
export function CampaignCoverEditor({
  campaign,
  canEdit,
  onUpdate,
}: {
  campaign: Campaign;
  canEdit: boolean;
  onUpdate: (patch: CampaignCoverPatch) => void;
}) {
  const { user } = useAuth();
  const [showEditor, setShowEditor] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pickedAssetUrl, setPickedAssetUrl] = useState<string | null>(null);

  const handlePickAsset = (asset: ImageAsset) => {
    setShowPicker(false);
    setPickedAssetUrl(asset.sourceImageUrl);
  };

  return (
    <div className="relative">
      <CampaignBannerDisplay campaign={campaign} size="full" />

      {canEdit && !campaign.coverImageUrl && (
        <button
          type="button"
          onClick={() => setShowEditor(true)}
          className="absolute inset-0 z-[15] flex flex-col items-center gap-2 pt-10 text-[var(--dash-muted)] transition-colors hover:bg-black/10 hover:text-[var(--dash-text)]"
        >
          <ImagePlus size={22} />
          <span className="text-sm font-medium">Clicca per aggiungere un'immagine di copertina</span>
        </button>
      )}

      {canEdit && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setShowEditor(true)}
              className="absolute right-3 top-3 z-30 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--dash-border-soft)] bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
            >
              <Pencil size={15} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Modifica immagine di copertina</TooltipContent>
        </Tooltip>
      )}

      {showEditor && (
        <ImageCropUploadModal
          bucket="campaign-logos"
          storagePath={`${campaign.id}/cover.jpg`}
          cropShape="rect"
          aspect={BANNER_ASPECT}
          uploadLabel="Seleziona l'immagine di copertina della campagna"
          existingImageUrl={pickedAssetUrl ?? campaign.coverImageUrl ?? undefined}
          onPickFromCollection={user?.id ? () => setShowPicker(true) : undefined}
          onUploaded={publicUrl => {
            onUpdate({ coverImageUrl: publicUrl });
            setPickedAssetUrl(null);
            setShowEditor(false);
          }}
          onRemove={campaign.coverImageUrl ? () => {
            onUpdate({ coverImageUrl: null });
            setPickedAssetUrl(null);
            setShowEditor(false);
          } : undefined}
          onClose={() => {
            setPickedAssetUrl(null);
            setShowEditor(false);
          }}
        />
      )}

      {showPicker && user?.id && (
        <ImageAssetPicker ownerProfileId={user.id} onSelect={handlePickAsset} onClose={() => setShowPicker(false)} />
      )}
    </div>
  );
}
