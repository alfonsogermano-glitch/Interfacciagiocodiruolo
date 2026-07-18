import { useState } from 'react';
import { ImagePlus, Pencil } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { ImageCropUploadModal } from '../components/shared/ImageCropUploadModal';
import { ImageAssetPicker } from '../components/shared/ImageAssetPicker';
import { RulesetTag } from '../components/shared/RulesetTag';
import type { ImageAsset } from '../../services/supabase/imageAssetsService';
import type { Campaign } from './campaignTypes';

// Tailwind analizza il testo sorgente in modo statico: la classe deve
// restare un literal (non una stringa costruita da BANNER_ASPECT) - i due
// vanno tenuti sincronizzati a mano se si cambia proporzione. Usata solo
// per il banner con immagine reale - il placeholder "nessuna immagine"
// (sotto) e quello "nessuna campagna attiva" (CampaignHome.tsx) hanno
// un'altezza fissa più contenuta, non questo aspect ratio molto largo.
const BANNER_SIZE_CLASS = 'aspect-[3.8/1] w-full';
const BANNER_ASPECT = 3.8;
// Ombra forte e uniforme (non solo drop-shadow di Tailwind, che a volte
// risulta troppo tenue su foto molto chiare) cosi' il testo resta leggibile
// sopra qualunque immagine di copertina.
const TEXT_SHADOW_STYLE = { textShadow: '0 1px 3px rgba(0,0,0,0.85), 0 1px 12px rgba(0,0,0,0.5)' };

export type CampaignCoverPatch = {
  coverImageUrl?: string | null;
};

/**
 * Banner header di CampaignHome, stile QuestPortal: immagine grande con
 * un'icona in alto a destra per modificarla, e il logo campagna sovrapposto
 * in basso a sinistra.
 *
 * Dopo tre round di crash su un'integrazione scritta da zero oggi (Rules of
 * Hooks, poi sfarfallio, poi geometria disallineata, poi loop di resize su
 * <Cropper> montato a mano) si è tornati a ImageCropCore.tsx così com'è -
 * lo stesso componente già usato con successo per portrait di PG/PNG/Mostri
 * e logo campagna, mai andato in crash in questa sessione: altezza fissa in
 * pixel (hardcoded al suo interno, non ricalcolata), nessuna geometria
 * nostra da mantenere. Come per il logo campagna, il ritaglio è distruttivo
 * (niente preserveSource): il file caricato è già il risultato ritagliato
 * (BANNER_ASPECT sotto), non un'immagine grezza con metadati di crop separati
 * da tenere sincronizzati - da qui la rimozione del campo coverCrop.
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
    <div className="relative w-full shrink-0 overflow-hidden">
      {campaign.coverImageUrl ? (
        <div className={`${BANNER_SIZE_CLASS} bg-[var(--dash-panel)]`}>
          <img src={campaign.coverImageUrl} alt={campaign.name} className="h-full w-full object-cover" />
        </div>
      ) : (
        // Altezza contenuta e fissa (non lo stesso aspect-[2.2/1] esagerato
        // del banner con foto) con un invito visivo chiaro - prima era un
        // riquadro vuoto della stessa altezza enorme di un banner reale, con
        // nulla a indicare che fosse uno stato intenzionale invece di un
        // errore di layout. Spazio in alto lasciato libero apposta: logo e
        // nome/descrizione restano ancorati in basso (overlay qui sotto,
        // invariato) su qualunque ramo, con o senza immagine.
        <button
          type="button"
          onClick={() => canEdit && setShowEditor(true)}
          disabled={!canEdit}
          className={`flex h-60 w-full flex-col items-center gap-2 bg-[var(--dash-panel)] pt-10 text-[var(--dash-muted)] ${
            canEdit ? 'cursor-pointer transition-colors hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)]' : 'cursor-default'
          }`}
        >
          <ImagePlus size={22} />
          <span className="text-sm font-medium">
            {canEdit ? "Clicca per aggiungere un'immagine di copertina" : 'Nessuna immagine di copertina'}
          </span>
        </button>
      )}

      {/* Sfumatura verso il basso nel colore di sfondo pagina (non un taglio
          netto) - anche supporto di lettura per nome/descrizione/badge
          sovrapposti qui sotto. Overlay su tutta l'altezza del banner
          (inset-0, non solo l'ultimo terzo): gli stop del gradiente, non
          l'altezza del div, decidono dove inizia la dissolvenza - resta
          piena/nitida fino al 60%, poi sfuma sul restante 40%. Uno stop
          intermedio a mezza opacità (via color-mix, non un rgba hardcoded:
          --dash-bg cambia per palette/tema, color-mix ne prende sempre il
          valore reale), a metà della zona di dissolvenza (80%, non più
          fisso all'85% di quando la zona era il 30% invece del 40%), rende
          la transizione morbida invece di un bordo percepibile a due sole
          tappe (trasparente -> opaco di colpo). */}
      <div
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background:
            'linear-gradient(to bottom, transparent 0%, transparent 60%, color-mix(in srgb, var(--dash-bg) 50%, transparent) 80%, var(--dash-bg) 100%)',
        }}
      />

      {canEdit && (
        <button
          type="button"
          onClick={() => setShowEditor(true)}
          title="Modifica immagine di copertina"
          className="absolute right-3 top-3 z-30 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--dash-border-soft)] bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
        >
          <Pencil size={15} />
        </button>
      )}

      {/* top-[28%] invece di bottom-0: ancorato più in alto sul banner, non
          più schiacciato sul fondo - items-start (non più items-end) perché
          con un ancoraggio dall'alto logo e testo crescono verso il basso a
          partire dallo stesso punto, invece di allinearsi al bordo inferiore
          reciproco. */}
      <div className="absolute inset-x-0 top-[28%] z-20 flex items-start gap-4 px-6">
        <div className="h-28 w-28 shrink-0 overflow-hidden rounded-2xl border-2 border-[var(--dash-border-soft)] bg-[var(--dash-surface)] shadow-lg">
          {campaign.logoUrl ? (
            <img src={campaign.logoUrl} alt={campaign.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center p-4">
              <img src="/icon-source-1024.png" alt="" className="h-full w-full object-contain opacity-80" style={{ filter: 'invert(1)' }} />
            </div>
          )}
        </div>

        <div className="min-w-0 pb-1">
          <h1 className="text-2xl font-semibold text-white" style={TEXT_SHADOW_STYLE}>{campaign.name}</h1>
          {campaign.description && (
            <p className="mt-1 max-w-md text-sm text-white/90" style={TEXT_SHADOW_STYLE}>{campaign.description}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-white/90">
            <RulesetTag rulesetId={campaign.ruleset} variant="onDark" />
            <span style={TEXT_SHADOW_STYLE}>
              Creata il {new Date(campaign.createdAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>
        </div>
      </div>

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
