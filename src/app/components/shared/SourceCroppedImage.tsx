import type { CSSProperties } from 'react';

/** Formato nativo react-easy-crop (Area): percentuali 0-100 relative alle
 *  dimensioni naturali della sorgente, non pixel - vedi portrait_crop_area
 *  in tokenStyle.ts/entitiesService.ts. width%/height% non sono uguali tra
 *  loro anche per un crop quadrato in pixel, a meno che la sorgente non
 *  sia gia' quadrata: sono percentuali dei due assi separati, non un lato
 *  unico condiviso. */
export interface CropAreaPercent {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Calcola lo style CSS (width/height/left/top in %) che mostra esattamente
 * il rettangolo cropArea dentro un contenitore di qualunque dimensione -
 * nessuna dipendenza dalle dimensioni naturali dell'immagine (niente
 * onLoad/naturalWidth da attendere), puro calcolo percentuale. Stessa
 * famiglia di formula di background-size/background-position, applicata a
 * un <img> assolutamente posizionato invece che a un background-image, per
 * restare compatibile con clip-path/alt/drag-image gia' in uso altrove
 * (TokenShapePreview.tsx clippa il div contenitore, indifferente a cosa
 * c'e' dentro).
 *
 * Esportata a parte (non solo interna a SourceCroppedImage) cosi' la
 * verifica isolata usa la stessa funzione del render, non una sua
 * reimplementazione che rischierebbe di divergere.
 */
export function getCropRectStyle(cropArea: CropAreaPercent): CSSProperties {
  // Clamp difensivo: un rettangolo degenere (width/height 0) produrrebbe
  // una percentuale infinita - non dovrebbe mai accadere con dati validi
  // di react-easy-crop, ma un valore corrotto non deve rompere il layout
  // del chiamante.
  const width = Math.max(cropArea.width, 0.01);
  const height = Math.max(cropArea.height, 0.01);

  return {
    position: 'absolute',
    width: `${10000 / width}%`,
    height: `${10000 / height}%`,
    left: `${(-100 * cropArea.x) / width}%`,
    top: `${(-100 * cropArea.y) / height}%`,
    // Neutralizza il Preflight di Tailwind (img { max-width: 100%; height:
    // auto } - src/styles/tailwind.css importa 'tailwindcss' senza
    // esclusioni): senza questo l'immagine ingrandita (quasi sempre
    // >100%) verrebbe tagliata dal reset.
    maxWidth: 'none',
    maxHeight: 'none',
  };
}

/**
 * Mostra il rettangolo cropArea (percentuali) della sorgente sourceUrl,
 * riempiendo il contenitore - dimensioni del contenitore date da
 * className/style (applicati al wrapper, non all'<img> interno, che e'
 * posizionato assolutamente e dimensionato dalla formula sopra). Nessuna
 * decisione di fallback qui (vedi EntityPortraitImage per quella): questo
 * componente presuppone che sourceUrl/cropArea siano gia' validi.
 */
export function SourceCroppedImage({
  sourceUrl,
  cropArea,
  alt = '',
  className = '',
  style,
  draggable = false,
  loading,
}: {
  sourceUrl: string;
  cropArea: CropAreaPercent;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  draggable?: boolean;
  loading?: 'lazy' | 'eager';
}) {
  return (
    <div className={`relative overflow-hidden ${className}`} style={style}>
      <img src={sourceUrl} alt={alt} draggable={draggable} loading={loading} className="select-none" style={getCropRectStyle(cropArea)} />
    </div>
  );
}
