import type { TokenBorderStyle, TokenBorderThickness } from '../../../types/tokenStyle';

// Geometria delle 8 forme del Token Studio, CSS/SVG puro - nessun asset
// caricato, nessuna dipendenza dal sistema Asset Grafici legacy
// (visual_assets).
//
// Tutte le coordinate sono normalizzate in spazio 0-1 (centro 0.5,0.5),
// non 0-100: cosi' la stessa geometria serve sia per il contorno visibile
// (un <svg viewBox="0 0 1 1"> con fill/stroke) sia per ritagliare
// l'immagine ritratto via clip-path: url(#id) con clipPathUnits=
// "objectBoundingBox" - che richiede esattamente coordinate 0-1 e si
// riscala da solo a qualunque dimensione del contenitore, senza dover
// far combaciare a mano la dimensione in pixel del preview con un viewBox
// fisso.

export type TokenShapeGeometry =
  | { kind: 'circle'; radius: number }
  | { kind: 'rect'; size: number; cornerRadius: number }
  | { kind: 'path'; d: string };

export interface TokenShapeRenderSpec {
  geometry: TokenShapeGeometry;
  /** Spessore del contorno a spessore "medium", in unita' normalizzate 0-1
   *  - il controllo "Spessore bordo" lo scala via getTokenStrokeWidth(). */
  strokeWidth: number;
}

function toFixed(n: number): string {
  return n.toFixed(4);
}

function regularPolygonPoints(sides: number, radius: number, rotationDeg: number, cx = 0.5, cy = 0.5): [number, number][] {
  const rotationRad = (rotationDeg * Math.PI) / 180;
  const points: [number, number][] = [];
  for (let i = 0; i < sides; i += 1) {
    const angle = rotationRad + (i * 2 * Math.PI) / sides;
    points.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
  }
  return points;
}

function starPoints(spikes: number, outerRadius: number, innerRadius: number, rotationDeg: number, cx = 0.5, cy = 0.5): [number, number][] {
  const rotationRad = (rotationDeg * Math.PI) / 180;
  const step = Math.PI / spikes;
  const points: [number, number][] = [];
  for (let i = 0; i < spikes * 2; i += 1) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = rotationRad + i * step;
    points.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
  }
  return points;
}

function pointsToPathD(points: [number, number][]): string {
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${toFixed(x)},${toFixed(y)}`).join(' ') + ' Z';
}

/**
 * Bordo smerlato/a petali: una serie di archi (semicerchi) attorno a un
 * cerchio base. Non ottenibile con un poligono a lati dritti - servono
 * comandi arco (A), per questo scalloped e' l'unica forma che non passa da
 * regularPolygonPoints/starPoints.
 */
function scallopedPathD(bumps: number, radius: number, cx = 0.5, cy = 0.5): string {
  const points: [number, number][] = [];
  for (let i = 0; i <= bumps; i += 1) {
    const angle = (i * 2 * Math.PI) / bumps;
    points.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
  }
  const bumpRadius = (Math.PI * radius) / bumps;
  let d = `M${toFixed(points[0][0])},${toFixed(points[0][1])} `;
  for (let i = 1; i < points.length; i += 1) {
    const [x, y] = points[i];
    d += `A${toFixed(bumpRadius)},${toFixed(bumpRadius)} 0 0 1 ${toFixed(x)},${toFixed(y)} `;
  }
  return `${d}Z`;
}

// Fase 2 del redesign Token: ogni forma e' tarata al proprio massimo
// geometrico teorico (edge-to-edge nel riquadro 1x1) - nessun margine
// artificiale piu' incorporato nel raggio. Il margine visivo/spaziatura
// sulla mappa e' un problema separato, risolto da MARGIN_SCALE qui sotto
// (applicato in TokenShapePreview.tsx come transform: scale() sull'intero
// gruppo immagine+bordo gia' composto, non piu' rimpicciolendo la forma).
// Per le forme senza simmetria a 4 vie rispetto al quadrato (hexagon,
// hexagon-pointed, decagon, starburst) il massimo tocca il bordo solo
// sull'asse vincolante: sull'altro asse resta un margine strutturale
// intrinseco alla forma, non rimovibile alzando ulteriormente il raggio -
// non forzarlo, e' voluto.
export const CIRCLE_RADIUS = 0.5;
const SQUARE_SIZE = 1;
const SQUARE_CORNER_RADIUS = 0.075;

/** Fattore di scala uniforme applicato in TokenShapePreview.tsx al gruppo
 *  gia' composto (immagine ritagliata + bordo) per ottenere lo spazio
 *  visivo tra token adiacenti sulla mappa - vedi la nota sopra: la
 *  geometria delle forme non lo incorpora piu'. 0.92 (margine 8%, non
 *  0.95/5%) perche' deve assorbire anche la meta' dello strokeWidth che,
 *  con le forme ora tarate esattamente al bordo, sporge oltre il riquadro
 *  1x1 di quel tanto (bordo centrato sul contorno) - il caso peggiore e'
 *  circle-filled a spessore "thick" (getTokenStrokeWidth = 0.07*0.4*1.8 =
 *  0.0504): richiederebbe k <= 1/(1+0.0504) = 0.952 solo per restare
 *  dentro il contenitore, il che renderebbe 0.95 un margine di sicurezza
 *  praticamente nullo (0.002). 0.92 lascia un margine di sicurezza reale
 *  (~0.03) mantenendosi comunque nel range 0.92-0.95 richiesto.
 */
export const MARGIN_SCALE = 0.92;

export const TOKEN_SHAPE_SPECS: Record<TokenBorderStyle, TokenShapeRenderSpec> = {
  'circle-filled': { geometry: { kind: 'circle', radius: CIRCLE_RADIUS }, strokeWidth: 0.07 },

  octagon: { geometry: { kind: 'path', d: pointsToPathD(regularPolygonPoints(8, 0.541196, 22.5)) }, strokeWidth: 0.05 },
  hexagon: { geometry: { kind: 'path', d: pointsToPathD(regularPolygonPoints(6, 0.5, 0)) }, strokeWidth: 0.05 },
  'hexagon-pointed': { geometry: { kind: 'path', d: pointsToPathD(regularPolygonPoints(6, 0.5, 30)) }, strokeWidth: 0.05 },

  // "Sole/ingranaggio a denti fitti" (riferimento QuestPortal), non una
  // stella a 8 punte larghe: 18 punte, rapporto raggio interno/esterno
  // 0.80 (0.4/0.5) - denti corti e stretti invece di punte lunghe.
  // v3: starburst-thin/starburst-thick consolidate in un'unica forma, lo
  // spessore e' ora il controllo ortogonale "Spessore bordo" (stesso
  // trattamento gia' applicato a circle-filled e square).
  starburst: { geometry: { kind: 'path', d: pointsToPathD(starPoints(18, 0.5, 0.4, -90)) }, strokeWidth: 0.04 },
  // Decagono (10 lati): quasi un cerchio sfaccettato, distinto
  // dall'ottagono (8 lati) sia nel numero di lati sia nella rotazione.
  decagon: { geometry: { kind: 'path', d: pointsToPathD(regularPolygonPoints(10, 0.5, 18)) }, strokeWidth: 0.045 },
  // R risolto numericamente (non c'e' formula chiusa: bumpRadius=pi*R/bumps
  // spinge gli apici dei petali oltre R stesso) cosi' che l'apice piu'
  // vicino agli assi tocchi esattamente 0.5, stesso script/metodo con cui
  // e' stato verificato R=0.42 dava un margine ancora residuo del 2.8%.
  scalloped: { geometry: { kind: 'path', d: scallopedPathD(12, 0.432242) }, strokeWidth: 0.04 },

  square: { geometry: { kind: 'rect', size: SQUARE_SIZE, cornerRadius: SQUARE_CORNER_RADIUS }, strokeWidth: 0.05 },
};

/** Moltiplicatore applicato allo strokeWidth "medium" di ciascuna forma -
 *  cosi' il controllo "Spessore bordo" resta ortogonale alla forma pur
 *  rispettando le proporzioni gia' calibrate per ogni geometria (es. una
 *  stella a punte sottili non deve ispessirsi quanto un ottagono). */
const THICKNESS_MULTIPLIER: Record<TokenBorderThickness, number> = {
  thin: 0.5,
  medium: 1,
  thick: 1.8,
};

/**
 * TOKEN_SHAPE_SPECS.strokeWidth e' tarato per restare leggibile nell'icona
 * piccola del selettore forme (~40px): a quella scala serve un valore
 * relativamente alto (0.05-0.08) solo per superare la soglia di un pixel
 * visibile. La stessa geometria pero' serve anche l'anteprima grande
 * (~224px, oltre 5x piu' grande) - riusare li' lo stesso valore relativo
 * produce un bordo sproporzionato (bug corretto qui: prima della rimozione
 * di vector-effect="non-scaling-stroke" questo passava inosservato perche'
 * lo stroke non scalava affatto, quindi i valori non erano mai stati
 * ritarati per il comportamento "scalabile" corretto). PREVIEW_STROKE_SCALE
 * riporta lo spessore dell'anteprima a una proporzione sensata, mantenendo
 * intatti sia i valori usati per l'icona sia i rapporti relativi tra le
 * forme e tra Sottile/Medio/Spesso.
 */
const PREVIEW_STROKE_SCALE = 0.4;

export function getTokenStrokeWidth(style: TokenBorderStyle, thickness: TokenBorderThickness): number {
  return TOKEN_SHAPE_SPECS[style].strokeWidth * PREVIEW_STROKE_SCALE * THICKNESS_MULTIPLIER[thickness];
}
