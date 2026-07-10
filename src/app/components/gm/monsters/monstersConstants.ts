import { CAMPAIGN_STORAGE_KEYS } from '../../../../services/campaign/campaignStorageKeys';
import type { Difficulty, ImageCrop } from './monstersTypes';

export const MONSTERS_STORAGE_KEY = CAMPAIGN_STORAGE_KEYS.monsters;
export const ADVENTURES_STORAGE_KEY = CAMPAIGN_STORAGE_KEYS.adventures;
export const ENVIRONMENTS_STORAGE_KEY = CAMPAIGN_STORAGE_KEYS.environments;

export const DIFFICULTY_OPTIONS: Difficulty[] = [
  '',
  'Base',
  'Critico',
  'Estremo',
  'Impossibile',
  'Non euclideo'
];

export const NO_FRAME_VALUE = '__none__';
export const PORTRAIT_FRAME_SCALE = 1.38;

export const DEFAULT_CROP: ImageCrop = { x: 0, y: 0, scale: 1 };
export const DEFAULT_PORTRAIT_BORDER_COLOR = '#f5a623';

// Diametro del cerchio visibile su cui PortraitCropFrame applica il crop
// live (inset-10% del box h-52 w-52 = 208px) per il tab "Avatar" dei
// Mostri in MonstersManager.tsx - unico consumer rimasto di
// clampCropToBox dopo che PG/PNG sono passati a ImageCropUploadModal
// (ritaglio distruttivo, nessun crop live da mantenere in sincronia).
export const PORTRAIT_EDITOR_BOX_SIZE = 166;
export const MIN_PORTRAIT_SCALE = 1;
export const MAX_PORTRAIT_SCALE = 2.5;

/**
 * Vincola pan/zoom cosi' che l'immagine copra sempre per intero il box
 * (object-cover), mai un bordo vuoto: stessa garanzia che ImageCropUploadModal
 * ottiene "gratis" da react-easy-crop (restrictPosition di default), qui
 * ricostruita a mano perche' il modello {x,y,scale} e il rendering CSS
 * live sono diversi. Applicata come funzione derivata ad ogni render (non
 * solo sull'evento che genera un nuovo valore): questo e' anche cio' che
 * rende "auto-guarente" un crop legacy o fuori limite gia' salvato - non
 * serve una migrazione a parte, si corregge da solo al prossimo rendering.
 *
 * Usata solo da PortraitCropFrame per il tab "Avatar" dei Mostri
 * (MonstersManager.tsx): PG/PNG hanno un crop live solo li' - per loro
 * il ritaglio e' distruttivo (ImageCropUploadModal), non serve clampare
 * nulla a runtime.
 */
export function clampCropToBox(
  crop: ImageCrop,
  naturalWidth: number,
  naturalHeight: number,
  boxSize: number = PORTRAIT_EDITOR_BOX_SIZE
): ImageCrop {
  const scale = Math.min(MAX_PORTRAIT_SCALE, Math.max(MIN_PORTRAIT_SCALE, crop.scale));

  if (!naturalWidth || !naturalHeight) {
    // Dimensioni non ancora note (onLoad non ancora scattato): un pan
    // gia' salvato non e' verificabile senza le dimensioni reali, quindi
    // NON va propagato as-is (produrrebbe un bordo scoperto per il breve
    // istante fino al load, per qualunque entita' con un pan non-zero
    // gia' salvato) - identita', sicura per costruzione con object-cover
    // a x:0,y:0 qualunque siano le proporzioni dell'immagine.
    return { x: 0, y: 0, scale };
  }

  // object-cover: il fattore che fa si' che il lato piu' corto combaci col
  // box, lasciando l'altro lato in eccesso (quello che il pan puo' rivelare).
  const coverScale = Math.max(boxSize / naturalWidth, boxSize / naturalHeight);
  const displayWidth = naturalWidth * coverScale * scale;
  const displayHeight = naturalHeight * coverScale * scale;
  const maxX = Math.max(0, (displayWidth - boxSize) / 2);
  const maxY = Math.max(0, (displayHeight - boxSize) / 2);

  return {
    x: Math.min(maxX, Math.max(-maxX, crop.x)),
    y: Math.min(maxY, Math.max(-maxY, crop.y)),
    scale
  };
}
