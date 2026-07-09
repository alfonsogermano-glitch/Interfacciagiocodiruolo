import type { TokenBorderStyle, TokenBorderThickness } from '../../../types/tokenStyle';

// Geometria delle 12 forme del Token Studio, CSS/SVG puro - nessun asset
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

const CIRCLE_RADIUS = 0.44;
const SQUARE_SIZE = 0.8;
const SQUARE_CORNER_RADIUS = 0.06;

export const TOKEN_SHAPE_SPECS: Record<TokenBorderStyle, TokenShapeRenderSpec> = {
  'circle-filled': { geometry: { kind: 'circle', radius: CIRCLE_RADIUS }, strokeWidth: 0.07 },

  octagon: { geometry: { kind: 'path', d: pointsToPathD(regularPolygonPoints(8, 0.45, 22.5)) }, strokeWidth: 0.05 },
  hexagon: { geometry: { kind: 'path', d: pointsToPathD(regularPolygonPoints(6, 0.46, 0)) }, strokeWidth: 0.05 },
  'hexagon-pointed': { geometry: { kind: 'path', d: pointsToPathD(regularPolygonPoints(6, 0.46, 30)) }, strokeWidth: 0.05 },

  'starburst-thin': { geometry: { kind: 'path', d: pointsToPathD(starPoints(8, 0.47, 0.20, -90)) }, strokeWidth: 0.03 },
  'starburst-thick': { geometry: { kind: 'path', d: pointsToPathD(starPoints(8, 0.47, 0.20, -90)) }, strokeWidth: 0.08 },
  scalloped: { geometry: { kind: 'path', d: scallopedPathD(12, 0.42) }, strokeWidth: 0.04 },

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

export function getTokenStrokeWidth(style: TokenBorderStyle, thickness: TokenBorderThickness): number {
  return TOKEN_SHAPE_SPECS[style].strokeWidth * THICKNESS_MULTIPLIER[thickness];
}
