import type { AnalysisPoint, AnalysisRegion, AnalysisSegment, BattleMapAnalysis, MapPlacement } from './battleMapAnalysis';
import type { ImageSegmentationPipelineType } from '@huggingface/transformers';

type Progress = (progress: number, stage: string) => void;
type GridEdge = { x1: number; y1: number; x2: number; y2: number };

const MODEL_ID = 'Xenova/segformer-b0-finetuned-ade-512-512';
const STRUCTURAL_LABELS = new Set(['wall', 'building', 'door', 'window', 'fence', 'column', 'railing']);
let segmenterPromise: Promise<ImageSegmentationPipelineType> | null = null;

function getSegmenter(onProgress?: Progress) {
  if (!segmenterPromise) {
    segmenterPromise = import('@huggingface/transformers').then(({ pipeline }) => {
      const createImageSegmenter = pipeline as unknown as (task: string, model: string, options: object) => Promise<ImageSegmentationPipelineType>;
      return createImageSegmenter('image-segmentation', MODEL_ID, {
        dtype: 'q8',
        progress_callback: (event: { status?: string; progress?: number }) => {
          if (event.status === 'progress' && Number.isFinite(event.progress)) onProgress?.(5 + Math.round((event.progress ?? 0) * 0.45), 'Download modello semantico');
        },
      });
    }).catch(error => { segmenterPromise = null; throw error; });
  } else onProgress?.(50, 'Modello semantico dalla cache');
  return segmenterPromise;
}

function polygonFromCells(cells: number[], columns: number): AnalysisPoint[] {
  const occupied = new Set(cells);
  const edges: GridEdge[] = [];
  for (const cell of cells) {
    const x = cell % columns;
    const y = Math.floor(cell / columns);
    if (!occupied.has(cell - columns)) edges.push({ x1: x, y1: y, x2: x + 1, y2: y });
    if (x === columns - 1 || !occupied.has(cell + 1)) edges.push({ x1: x + 1, y1: y, x2: x + 1, y2: y + 1 });
    if (!occupied.has(cell + columns)) edges.push({ x1: x + 1, y1: y + 1, x2: x, y2: y + 1 });
    if (x === 0 || !occupied.has(cell - 1)) edges.push({ x1: x, y1: y + 1, x2: x, y2: y });
  }
  const starts = new Map<string, GridEdge[]>();
  for (const edge of edges) {
    const key = `${edge.x1},${edge.y1}`;
    starts.set(key, [...(starts.get(key) ?? []), edge]);
  }
  const polygon: AnalysisPoint[] = [];
  const used = new Set<GridEdge>();
  let edge = edges[0];
  while (edge && !used.has(edge)) {
    used.add(edge);
    polygon.push({ x: edge.x1, y: edge.y1 });
    edge = (starts.get(`${edge.x2},${edge.y2}`) ?? []).find(candidate => !used.has(candidate))!;
  }
  return polygon.filter((point, index, points) => {
    const previous = points[(index + points.length - 1) % points.length];
    const next = points[(index + 1) % points.length];
    return (point.x - previous.x) * (next.y - point.y) !== (point.y - previous.y) * (next.x - point.x);
  });
}

function mergeEdges(edges: GridEdge[]): GridEdge[] {
  const horizontal = edges.filter(edge => edge.y1 === edge.y2).sort((a, b) => a.y1 - b.y1 || a.x1 - b.x1);
  const vertical = edges.filter(edge => edge.x1 === edge.x2).sort((a, b) => a.x1 - b.x1 || a.y1 - b.y1);
  const merge = (source: GridEdge[], isHorizontal: boolean) => source.reduce<GridEdge[]>((result, edge) => {
    const previous = result[result.length - 1];
    const sameAxis = previous && (isHorizontal ? previous.y1 === edge.y1 : previous.x1 === edge.x1);
    const touches = previous && (isHorizontal ? previous.x2 === edge.x1 : previous.y2 === edge.y1);
    if (previous && sameAxis && touches) {
      previous.x2 = edge.x2;
      previous.y2 = edge.y2;
    } else result.push({ ...edge });
    return result;
  }, []);
  return [...merge(horizontal, true), ...merge(vertical, false)];
}

export async function analyzeBattleMapSemantically(imageUrl: string, placement: MapPlacement, onProgress?: Progress): Promise<BattleMapAnalysis> {
  onProgress?.(3, 'Preparazione modello semantico');
  const segmenter = await getSegmenter(onProgress);
  onProgress?.(58, 'Segmentazione semantica della mappa');
  const output = await segmenter(imageUrl, { threshold: 0.2 }) as unknown as Array<{ label: string | null; score: number | null; mask: { width: number; height: number; data: Uint8Array | Uint8ClampedArray } }>;
  const structural = output.filter(segment => segment.label && STRUCTURAL_LABELS.has(segment.label.toLowerCase()));
  if (structural.length === 0) throw new Error('Il modello semantico non ha riconosciuto strutture architettoniche.');
  onProgress?.(72, 'Ricostruzione di muri e aperture');
  const imageWidth = structural[0].mask.width;
  const imageHeight = structural[0].mask.height;
  const target = 128;
  const columns = Math.max(24, Math.round(target * imageWidth / Math.max(imageWidth, imageHeight)));
  const rows = Math.max(24, Math.round(target * imageHeight / Math.max(imageWidth, imageHeight)));
  const blocked = new Uint8Array(columns * rows);
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < columns; gx++) {
      const px = Math.min(imageWidth - 1, Math.floor((gx + 0.5) * imageWidth / columns));
      const py = Math.min(imageHeight - 1, Math.floor((gy + 0.5) * imageHeight / rows));
      if (structural.some(segment => segment.mask.data[py * imageWidth + px] > 127)) blocked[gy * columns + gx] = 1;
    }
  }
  // Close one-cell gaps caused by antialiasing while preserving real door-sized openings.
  const closed = blocked.slice();
  for (let y = 1; y < rows - 1; y++) for (let x = 1; x < columns - 1; x++) {
    const index = y * columns + x;
    if (blocked[index]) continue;
    const horizontal = blocked[index - 1] && blocked[index + 1];
    const vertical = blocked[index - columns] && blocked[index + columns];
    if (horizontal || vertical) closed[index] = 1;
  }
  onProgress?.(82, 'Separazione degli ambienti chiusi');
  const visited = new Uint8Array(columns * rows);
  const regions: AnalysisRegion[] = [];
  for (let seed = 0; seed < visited.length; seed++) {
    if (visited[seed] || closed[seed]) continue;
    const queue = [seed];
    const cells: number[] = [];
    visited[seed] = 1;
    let boundary = false;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const cell = queue[cursor];
      cells.push(cell);
      const x = cell % columns;
      const y = Math.floor(cell / columns);
      if (x === 0 || y === 0 || x === columns - 1 || y === rows - 1) boundary = true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= columns || ny >= rows) continue;
        const next = ny * columns + nx;
        if (!visited[next] && !closed[next]) { visited[next] = 1; queue.push(next); }
      }
    }
    if (boundary || cells.length < 4) continue;
    const gridPolygon = polygonFromCells(cells, columns);
    if (gridPolygon.length < 3) continue;
    const normalizedPolygon = gridPolygon.map(point => ({ x: point.x / columns, y: point.y / rows }));
    regions.push({ normalizedPolygon, polygon: normalizedPolygon.map(point => ({ x: point.x * placement.width, y: point.y * placement.height })), classification: 'interior', confidence: Math.min(0.95, 0.62 + cells.length / (columns * rows)), source: 'ai' });
  }
  const boundaryEdges: GridEdge[] = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    const index = y * columns + x;
    if (!closed[index]) continue;
    if (y === 0 || !closed[index - columns]) boundaryEdges.push({ x1: x, y1: y, x2: x + 1, y2: y });
    if (x === columns - 1 || !closed[index + 1]) boundaryEdges.push({ x1: x + 1, y1: y, x2: x + 1, y2: y + 1 });
    if (y === rows - 1 || !closed[index + columns]) boundaryEdges.push({ x1: x + 1, y1: y + 1, x2: x, y2: y + 1 });
    if (x === 0 || !closed[index - 1]) boundaryEdges.push({ x1: x, y1: y + 1, x2: x, y2: y });
  }
  const blockers: AnalysisSegment[] = mergeEdges(boundaryEdges).filter(edge => Math.hypot(edge.x2 - edge.x1, edge.y2 - edge.y1) >= 2).slice(0, 1000).map(edge => {
    const normalizedStart = { x: edge.x1 / columns, y: edge.y1 / rows };
    const normalizedEnd = { x: edge.x2 / columns, y: edge.y2 / rows };
    return { start: { x: normalizedStart.x * placement.width, y: normalizedStart.y * placement.height }, end: { x: normalizedEnd.x * placement.width, y: normalizedEnd.y * placement.height }, normalizedStart, normalizedEnd, confidence: 0.78, source: 'ai', kind: 'wall' };
  });
  onProgress?.(100, 'Analisi semantica completata');
  if (regions.length === 0 || blockers.length === 0) throw new Error('La segmentazione non ha prodotto ambienti chiusi utilizzabili.');
  return { engine: 'semantic-local', imageSize: { width: imageWidth, height: imageHeight }, analysisSize: { width: columns, height: rows }, regions, blockers, candidateOpenings: [] };
}
