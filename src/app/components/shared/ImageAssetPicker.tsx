import { useEffect, useState } from 'react';
import { Images, Loader2, X } from 'lucide-react';
import { SourceCroppedImage } from './SourceCroppedImage';
import type { CropAreaPercent } from './SourceCroppedImage';
import {
  loadImageAssetsByOwner,
  findReferenceCropAreasForAssets,
  DEFAULT_ASSET_CROP_AREA,
  type ImageAsset,
} from '../../../services/supabase/imageAssetsService';
import { PALETTE_COLORS, DEFAULT_PALETTE_COLORS, type PaletteId } from '../ui/paletteColors';

function getCurrentPaletteColors() {
  const el = document.querySelector('[data-dashboard-palette]');
  const palette = el?.getAttribute('data-dashboard-palette') as PaletteId | null;
  return palette && PALETTE_COLORS[palette] ? PALETTE_COLORS[palette] : DEFAULT_PALETTE_COLORS;
}

/**
 * Modale "scegli dalla raccolta": griglia delle foto sorgente gia'
 * caricate dall'utente (loadImageAssetsByOwner), una per riga di
 * image_assets - attraverso tutte le sue entita'/campagne. Ogni miniatura
 * mostra il crop gia' in uso da un'entita' propria che referenzia
 * quell'asset (findReferenceCropAreasForAssets, batch: 3 query totali
 * indipendentemente da quanti asset ci sono in griglia, non N), non la
 * sorgente intera - un crop "immagine intera" forzato dentro il riquadro
 * quadrato della griglia deformerebbe le sorgenti non quadrate (width%/
 * height% del crop applicati in modo indipendente, vedi
 * SourceCroppedImage). Fallback a DEFAULT_ASSET_CROP_AREA solo per gli
 * asset non ancora referenziati da nessuna entita' propria (caso limite:
 * un asset deve gia' essere referenziato da qualcosa per esistere). La
 * selezione del crop di partenza per l'entita' che riusa l'asset e'
 * decisa dal chiamante dopo onSelect, non qui.
 */
export function ImageAssetPicker({
  ownerProfileId,
  onSelect,
  onClose,
}: {
  ownerProfileId: string;
  onSelect: (asset: ImageAsset) => void;
  onClose: () => void;
}) {
  const [assets, setAssets] = useState<ImageAsset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [referenceCropAreas, setReferenceCropAreas] = useState<Map<string, CropAreaPercent>>(new Map());
  const colors = getCurrentPaletteColors();

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    loadImageAssetsByOwner(ownerProfileId).then(async items => {
      if (cancelled) return;
      const cropAreas = await findReferenceCropAreasForAssets(items.map(item => item.id));
      if (cancelled) return;
      setAssets(items);
      setReferenceCropAreas(cropAreas);
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [ownerProfileId]);

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{ backgroundColor: colors.panel, border: `1px solid ${colors.border}` }}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold" style={{ color: colors.text }}>Raccolta immagini</h3>
          <button
            type="button"
            onClick={onClose}
            style={{ color: colors.text }}
            className="rounded-full p-1 opacity-70 transition-opacity hover:opacity-100"
            aria-label="Chiudi"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: colors.text, opacity: 0.6 }} />
            </div>
          ) : assets.length === 0 ? (
            <div className="py-10 text-center">
              <Images className="mx-auto mb-3 h-10 w-10 opacity-50" style={{ color: colors.text }} />
              <p className="text-sm" style={{ color: colors.text, opacity: 0.7 }}>
                Nessuna immagine in raccolta ancora. Le foto che carichi per le tue schede appariranno qui, pronte per essere riusate su altre entità.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {assets.map(asset => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => onSelect(asset)}
                  style={{ border: `1px solid ${colors.border}` }}
                  className="aspect-square overflow-hidden rounded-xl transition-colors hover:border-[var(--dash-accent)]"
                >
                  <SourceCroppedImage
                    sourceUrl={asset.sourceImageUrl}
                    cropArea={referenceCropAreas.get(asset.id) ?? DEFAULT_ASSET_CROP_AREA}
                    style={{ width: '100%', height: '100%' }}
                    alt=""
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
