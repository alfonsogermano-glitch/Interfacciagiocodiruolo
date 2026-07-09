// Token Studio: stile del token mappa per PG/PNG/Mostri. Campi dedicati e
// separati da portraitBorderColor/Visible/Label ("Cerchio portrait"): il
// token sulla mappa e il cerchio portrait nella scheda sono personalizzabili
// in modo indipendente, non condividono piu' lo stesso colore.
//
// Stesso pattern di RulesetId (campaignTypes.ts): union di stringhe
// validata solo lato applicativo, colonna DB TEXT libera senza enum/CHECK
// Postgres (vedi supabase-add-token-studio.sql).

// v2: circle-thin/circle-thick e square-thick/square-frame sono stati
// consolidati in un'unica variante (circle-filled, square) piu' un
// controllo "Spessore bordo" ortogonale alla forma (vedi
// TokenBorderThickness sotto) - erano variazioni di solo strokeWidth sulla
// stessa geometria, ora coperte dal controllo dedicato.
// v3: stesso trattamento per starburst-thin/starburst-thick, consolidate in
// 'starburst' (sole/ingranaggio a denti fitti, 18 punte/ratio 0.80). Aggiunto
// 'decagon' (poligono a molti lati, quasi un cerchio sfaccettato) nello slot
// lasciato libero - forma di riferimento QuestPortal prima mancante.
export type TokenBorderStyle =
  | 'circle-filled'
  | 'octagon'
  | 'hexagon'
  | 'hexagon-pointed'
  | 'starburst'
  | 'decagon'
  | 'scalloped'
  | 'square';

export interface TokenBorderStyleOption {
  id: TokenBorderStyle;
  label: string;
}

export const TOKEN_BORDER_STYLE_OPTIONS: TokenBorderStyleOption[] = [
  { id: 'circle-filled', label: 'Cerchio' },
  { id: 'octagon', label: 'Ottagono' },
  { id: 'hexagon', label: 'Esagono' },
  { id: 'hexagon-pointed', label: 'Esagono a punta' },
  { id: 'starburst', label: 'Sole/Ingranaggio' },
  { id: 'decagon', label: 'Decagono' },
  { id: 'scalloped', label: 'Smerlato' },
  { id: 'square', label: 'Quadrato' },
];

export type TokenBorderThickness = 'thin' | 'medium' | 'thick';

export interface TokenBorderThicknessOption {
  id: TokenBorderThickness;
  label: string;
}

export const TOKEN_BORDER_THICKNESS_OPTIONS: TokenBorderThicknessOption[] = [
  { id: 'thin', label: 'Sottile' },
  { id: 'medium', label: 'Medio' },
  { id: 'thick', label: 'Spesso' },
];

export const DEFAULT_TOKEN_COLOR = '#f5a623';
export const DEFAULT_TOKEN_BACKGROUND_COLOR = '#1a1a1a';
export const DEFAULT_TOKEN_BORDER_STYLE: TokenBorderStyle = 'circle-filled';
export const DEFAULT_TOKEN_BORDER_THICKNESS: TokenBorderThickness = 'medium';
export const DEFAULT_TOKEN_BORDER_VISIBLE = true;
