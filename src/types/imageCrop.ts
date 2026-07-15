// Tipo/costanti di crop+cornice condivisi tra PG/PNG/Mostri (tab
// "Immagine" di EntityDetailView.tsx). Spostati qui da monstersTypes.ts/
// monstersConstants.ts durante la generalizzazione del sistema
// cornice+cover a PG/PNG - quei due moduli restano solo per riferimento
// (re-export) di chi importa ancora da li'.
export type ImageCrop = {
  x: number;
  y: number;
  scale: number;
};

export const DEFAULT_CROP: ImageCrop = { x: 0, y: 0, scale: 1 };

export const NO_FRAME_VALUE = '__none__';
