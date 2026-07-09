// Token Studio: stile del token mappa per PG/PNG/Mostri. Campi dedicati e
// separati da portraitBorderColor/Visible/Label ("Cerchio portrait"): il
// token sulla mappa e il cerchio portrait nella scheda sono personalizzabili
// in modo indipendente, non condividono piu' lo stesso colore.
//
// Stesso pattern di RulesetId (campaignTypes.ts): union di stringhe
// validata solo lato applicativo, colonna DB TEXT libera senza enum/CHECK
// Postgres (vedi supabase-add-token-studio.sql).

export type TokenBorderStyle =
  | 'circle-filled'
  | 'circle-thin'
  | 'circle-thick'
  | 'octagon'
  | 'hexagon'
  | 'hexagon-pointed'
  | 'starburst-thin'
  | 'starburst-thick'
  | 'scalloped'
  | 'square'
  | 'square-thick'
  | 'square-frame';

export interface TokenBorderStyleOption {
  id: TokenBorderStyle;
  label: string;
}

export const TOKEN_BORDER_STYLE_OPTIONS: TokenBorderStyleOption[] = [
  { id: 'circle-filled', label: 'Cerchio pieno' },
  { id: 'circle-thin', label: 'Cerchio sottile' },
  { id: 'circle-thick', label: 'Cerchio spesso' },
  { id: 'octagon', label: 'Ottagono' },
  { id: 'hexagon', label: 'Esagono' },
  { id: 'hexagon-pointed', label: 'Esagono a punta' },
  { id: 'starburst-thin', label: 'Stella sottile' },
  { id: 'starburst-thick', label: 'Stella spessa' },
  { id: 'scalloped', label: 'Smerlato' },
  { id: 'square', label: 'Quadrato' },
  { id: 'square-thick', label: 'Quadrato spesso' },
  { id: 'square-frame', label: 'Quadrato con cornice' },
];

export const DEFAULT_TOKEN_COLOR = '#f5a623';
export const DEFAULT_TOKEN_BACKGROUND_COLOR = '#1a1a1a';
export const DEFAULT_TOKEN_BORDER_STYLE: TokenBorderStyle = 'circle-filled';
