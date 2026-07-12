import type { CSSProperties } from 'react';
import { SourceCroppedImage, type CropAreaPercent } from './SourceCroppedImage';

/**
 * Unico punto di decisione "come mostro il portrait di un'entita'":
 * sorgente+crop al volo (SourceCroppedImage) quando disponibili, altrimenti
 * il JPEG pre-esportato di oggi (portraitImageUrl), invariato - cosi'
 * nessun punto di rendering deve reimplementare la stessa scelta.
 *
 * portraitSourceImageUrl/portraitCropArea bastano da soli: non serve
 * controllare portraitAssetId, che riguarda solo il registro condiviso
 * (chi vede l'aggiornamento di chi), non il rendering di questa singola
 * entita' - i due campi esistono gia' su qualunque entita' abbia usato il
 * tab "Immagine" da quando e' non distruttivo, indipendentemente da se e'
 * collegata alla raccolta immagini.
 *
 * className/style dimensionano il contenitore in entrambi i rami (wrapper
 * di SourceCroppedImage nel primo caso, <img> diretto nel secondo) - un
 * chiamante che migra da un <img className="h-full w-full object-cover">
 * esistente passa la stessa className cosi' com'e'.
 */
export function EntityPortraitImage({
  portraitImageUrl,
  portraitSourceImageUrl,
  portraitCropArea,
  alt = '',
  className = '',
  style,
  draggable = false,
}: {
  portraitImageUrl?: string | null;
  portraitSourceImageUrl?: string | null;
  portraitCropArea?: CropAreaPercent | null;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  draggable?: boolean;
}) {
  if (portraitSourceImageUrl && portraitCropArea) {
    return (
      <SourceCroppedImage
        sourceUrl={portraitSourceImageUrl}
        cropArea={portraitCropArea}
        alt={alt}
        className={className}
        style={style}
        draggable={draggable}
      />
    );
  }

  if (!portraitImageUrl) return null;

  return (
    <img
      src={portraitImageUrl}
      alt={alt}
      draggable={draggable}
      className={`object-cover ${className}`}
      style={style}
    />
  );
}
