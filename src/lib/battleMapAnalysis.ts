/** Dependency-free, browser-side heuristics for extracting editable map geometry. */

export interface AnalysisPoint {
  /** Coordinates in the map placement's local coordinate system. */
  x: number;
  y: number;
}

export interface NormalizedPoint {
  /** Coordinates in the inclusive 0..1 image/map space. */
  x: number;
  y: number;
}

export interface MapPlacement {
  width: number;
  height: number;
}

export interface AnalysisSegment {
  start: AnalysisPoint;
  end: AnalysisPoint;
  normalizedStart: NormalizedPoint;
  normalizedEnd: NormalizedPoint;
  confidence: number;
  source: 'local' | 'ai';
  kind: 'wall' | 'door' | 'window';
}

export interface AnalysisRegion {
  polygon: AnalysisPoint[];
  normalizedPolygon: NormalizedPoint[];
  classification: 'interior' | 'exterior';
  confidence: number;
  source: 'local' | 'ai';
}

export interface BattleMapAnalysis {
  engine?: 'gemini' | 'semantic-local' | 'heuristic';
  imageSize: { width: number; height: number };
  analysisSize: { width: number; height: number };
  regions: AnalysisRegion[];
  blockers: AnalysisSegment[];
  candidateOpenings: AnalysisSegment[];
}

export interface BattleMapAnalysisOptions {
  maxDimension?: number;
  gridSize?: number;
  maxBlockers?: number;
  maxRegions?: number;
  maxOpenings?: number;
  edgePercentile?: number;
  onProgress?: (progress: number, stage: string) => void;
}

type RoomFillImage = { width: number; height: number; colors: Uint8ClampedArray };
const roomFillCache = new Map<string, Promise<RoomFillImage>>();
const ROOM_FILL_SAMPLE_RADIUS = 18;
const ROOM_FILL_PALETTE_SIZE = 8;
const ROOM_FILL_COLOR_TOLERANCE = 52;
const ROOM_FILL_MORPHOLOGY_RADIUS = 6;
const ROOM_FILL_RECTANGULARITY = 0.5;

type PixelSegment = { x1: number; y1: number; x2: number; y2: number; score: number };
type Edge = { ax: number; ay: number; bx: number; by: number };

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const key = (x: number, y: number) => `${x},${y}`;
const yieldToBrowser = () => new Promise<void>(resolve => setTimeout(resolve, 0));
const reportProgress = async (options: BattleMapAnalysisOptions, progress: number, stage: string) => {
  options.onProgress?.(progress, stage);
  await new Promise<void>(resolve => setTimeout(resolve, 0));
};

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load battle map image: ${url}`));
    image.src = url;
  });
}

async function prepareRoomFillImage(imageUrl: string): Promise<RoomFillImage> {
  const cached = roomFillCache.get(imageUrl);
  if (cached) return cached;
  const pending = loadImage(imageUrl).then((image) => {
    const scale = Math.min(1, 768 / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(32, Math.round(image.naturalWidth * scale));
    const height = Math.max(32, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas 2D is unavailable.');
    context.filter = 'blur(2px)';
    context.drawImage(image, 0, 0, width, height);
    return { width, height, colors: context.getImageData(0, 0, width, height).data };
  }).catch((error) => { roomFillCache.delete(imageUrl); throw error; });
  roomFillCache.set(imageUrl, pending);
  return pending;
}

/** Warm the image cache when the assisted fill tool is selected. */
export async function preloadRoomFillImage(imageUrl: string): Promise<void> {
  await prepareRoomFillImage(imageUrl);
}

function simplifyPolygon(points: AnalysisPoint[], tolerance: number): AnalysisPoint[] {
  if (points.length <= 4) return points;
  const distance = (point: AnalysisPoint, start: AnalysisPoint, end: AnalysisPoint) => {
    const lengthSquared = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;
    if (!lengthSquared) return Math.hypot(point.x - start.x, point.y - start.y);
    const t = clamp(((point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y)) / lengthSquared, 0, 1);
    return Math.hypot(point.x - (start.x + t * (end.x - start.x)), point.y - (start.y + t * (end.y - start.y)));
  };
  const reduce = (source: AnalysisPoint[]): AnalysisPoint[] => {
    let maximum = 0;
    let split = 0;
    for (let i = 1; i < source.length - 1; i++) {
      const current = distance(source[i], source[0], source[source.length - 1]);
      if (current > maximum) { maximum = current; split = i; }
    }
    if (maximum <= tolerance) return [source[0], source[source.length - 1]];
    return [...reduce(source.slice(0, split + 1)).slice(0, -1), ...reduce(source.slice(split))];
  };
  const anchor = points.reduce((best, point, index) => point.x < points[best].x || point.x === points[best].x && point.y < points[best].y ? index : best, 0);
  const closed = [...points.slice(anchor), ...points.slice(0, anchor), points[anchor]];
  return reduce(closed).slice(0, -1);
}

/** Find the enclosed area containing a clicked map point. Returns null for exterior or implausibly large regions. */
export async function detectRoomAtPoint(imageUrl: string, placement: MapPlacement, point: AnalysisPoint, excludedPolygons: AnalysisPoint[][] = []): Promise<AnalysisPoint[] | null> {
  const prepared = await prepareRoomFillImage(imageUrl);
  const seedX = clamp(Math.floor(point.x / placement.width * prepared.width), 0, prepared.width - 1);
  const seedY = clamp(Math.floor(point.y / placement.height * prepared.height), 0, prepared.height - 1);
  const buckets = new Map<string, { count: number; red: number; green: number; blue: number }>();
  for (let dy = -ROOM_FILL_SAMPLE_RADIUS; dy <= ROOM_FILL_SAMPLE_RADIUS; dy += 2) for (let dx = -ROOM_FILL_SAMPLE_RADIUS; dx <= ROOM_FILL_SAMPLE_RADIUS; dx += 2) {
    const x = seedX + dx; const y = seedY + dy;
    if (x < 0 || y < 0 || x >= prepared.width || y >= prepared.height) continue;
    const offset = (y * prepared.width + x) * 4;
    const red = prepared.colors[offset]; const green = prepared.colors[offset + 1]; const blue = prepared.colors[offset + 2];
    const key = `${red >> 4},${green >> 4},${blue >> 4}`;
    const bucket = buckets.get(key) ?? { count: 0, red: 0, green: 0, blue: 0 };
    bucket.count++; bucket.red += red; bucket.green += green; bucket.blue += blue; buckets.set(key, bucket);
  }
  const palette = [...buckets.values()].sort((a, b) => b.count - a.count).slice(0, ROOM_FILL_PALETTE_SIZE).map(bucket => [bucket.red / bucket.count, bucket.green / bucket.count, bucket.blue / bucket.count]);
  const allowed = new Uint8Array(prepared.width * prepared.height);
  for (let cell = 0; cell < allowed.length; cell++) {
    const offset = cell * 4; let best = Infinity;
    for (const color of palette) {
      const red = prepared.colors[offset] - color[0]; const green = prepared.colors[offset + 1] - color[1]; const blue = prepared.colors[offset + 2] - color[2];
      best = Math.min(best, Math.sqrt(red * red * 0.3 + green * green * 0.59 + blue * blue * 0.11));
    }
    allowed[cell] = best <= ROOM_FILL_COLOR_TOLERANCE ? 1 : 0;
    if (cell > 0 && cell % 32768 === 0) await yieldToBrowser();
  }
  const makeIntegral = (mask: Uint8Array) => {
    const integral = new Uint32Array((prepared.width + 1) * (prepared.height + 1));
    for (let y = 0; y < prepared.height; y++) { let row = 0; for (let x = 0; x < prepared.width; x++) { row += mask[y * prepared.width + x]; integral[(y + 1) * (prepared.width + 1) + x + 1] = integral[y * (prepared.width + 1) + x + 1] + row; } }
    return integral;
  };
  const boxSum = (integral: Uint32Array, x0: number, y0: number, x1: number, y1: number) => integral[(y1 + 1) * (prepared.width + 1) + x1 + 1] - integral[y0 * (prepared.width + 1) + x1 + 1] - integral[(y1 + 1) * (prepared.width + 1) + x0] + integral[y0 * (prepared.width + 1) + x0];
  const radius = ROOM_FILL_MORPHOLOGY_RADIUS; const area = (radius * 2 + 1) ** 2;
  const allowedIntegral = makeIntegral(allowed); const eroded = new Uint8Array(allowed.length);
  for (let y = radius; y < prepared.height - radius; y++) {
    for (let x = radius; x < prepared.width - radius; x++) eroded[y * prepared.width + x] = boxSum(allowedIntegral, x - radius, y - radius, x + radius, y + radius) === area ? 1 : 0;
    if (y % 48 === 0) await yieldToBrowser();
  }
  const erodedIntegral = makeIntegral(eroded); const opened = new Uint8Array(allowed.length);
  for (let y = 0; y < prepared.height; y++) {
    for (let x = 0; x < prepared.width; x++) opened[y * prepared.width + x] = boxSum(erodedIntegral, Math.max(0, x - radius), Math.max(0, y - radius), Math.min(prepared.width - 1, x + radius), Math.min(prepared.height - 1, y + radius)) > 0 ? 1 : 0;
    if (y % 48 === 0) await yieldToBrowser();
  }
  const contains = (polygon: AnalysisPoint[], x: number, y: number) => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i]; const b = polygon[j];
      if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y || Number.EPSILON) + a.x) inside = !inside;
    }
    return inside;
  };
  const collisionMask = new Uint8Array(opened.length);
  for (const worldPolygon of excludedPolygons.filter(polygon => polygon.length >= 3)) {
    const polygon = worldPolygon.map(vertex => ({ x: vertex.x / placement.width * prepared.width, y: vertex.y / placement.height * prepared.height }));
    const minX = clamp(Math.floor(Math.min(...polygon.map(vertex => vertex.x))), 0, prepared.width - 1);
    const maxX = clamp(Math.ceil(Math.max(...polygon.map(vertex => vertex.x))), 0, prepared.width - 1);
    const minY = clamp(Math.floor(Math.min(...polygon.map(vertex => vertex.y))), 0, prepared.height - 1);
    const maxY = clamp(Math.ceil(Math.max(...polygon.map(vertex => vertex.y))), 0, prepared.height - 1);
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) if (opened[y * prepared.width + x] && contains(polygon, x + 0.5, y + 0.5)) { opened[y * prepared.width + x] = 0; collisionMask[y * prepared.width + x] = 1; }
  }
  let openedSeed = seedY * prepared.width + seedX;
  if (!opened[openedSeed]) {
    let nearest = -1;
    for (let search = 1; search <= 16 && nearest < 0; search++) for (let dy = -search; dy <= search && nearest < 0; dy++) for (let dx = -search; dx <= search; dx++) {
      const x = seedX + dx; const y = seedY + dy;
      if (x >= 0 && y >= 0 && x < prepared.width && y < prepared.height && opened[y * prepared.width + x]) { nearest = y * prepared.width + x; break; }
    }
    if (nearest < 0) return null;
    openedSeed = nearest;
  }
  const visited = new Uint8Array(prepared.width * prepared.height);
  const queue = new Int32Array(prepared.width * prepared.height);
  const cells: number[] = [];
  let head = 0; let tail = 1; let touchesBoundary = false;
  queue[0] = openedSeed; visited[openedSeed] = 1;
  while (head < tail) {
    const cell = queue[head++];
    cells.push(cell);
    const x = cell % prepared.width; const y = Math.floor(cell / prepared.width);
    if (x === 0 || y === 0 || x === prepared.width - 1 || y === prepared.height - 1) touchesBoundary = true;
    for (const next of [cell - 1, cell + 1, cell - prepared.width, cell + prepared.width]) {
      if (next < 0 || next >= visited.length || visited[next] || !opened[next]) continue;
      const nx = next % prepared.width;
      if (Math.abs(nx - x) > 1) continue;
      visited[next] = 1; queue[tail++] = next;
    }
    if (head % 32768 === 0) await yieldToBrowser();
  }
  if (touchesBoundary || cells.length < 40 || cells.length > prepared.width * prepared.height * 0.3) return null;
  let minX = prepared.width; let minY = prepared.height; let maxX = 0; let maxY = 0;
  for (const cell of cells) {
    const x = cell % prepared.width; const y = Math.floor(cell / prepared.width);
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  const boundsArea = Math.max(1, (maxX - minX + 1) * (maxY - minY + 1));
  if (cells.length / boundsArea >= ROOM_FILL_RECTANGULARITY) {
    const inset = Math.max(4, Math.round(Math.min(prepared.width, prepared.height) * 0.006));
    return [
      { x: (minX - inset) / prepared.width * placement.width, y: (minY - inset) / prepared.height * placement.height },
      { x: (maxX + inset) / prepared.width * placement.width, y: (minY - inset) / prepared.height * placement.height },
      { x: (maxX + inset) / prepared.width * placement.width, y: (maxY + inset) / prepared.height * placement.height },
      { x: (minX - inset) / prepared.width * placement.width, y: (maxY + inset) / prepared.height * placement.height },
    ];
  }
  const traced = tracePolygon(cells, prepared.width);
  const simplified = simplifyPolygon(traced, 7);
  if (simplified.length < 3) return null;
  const center = { x: simplified.reduce((sum, vertex) => sum + vertex.x, 0) / simplified.length, y: simplified.reduce((sum, vertex) => sum + vertex.y, 0) / simplified.length };
  const padding = Math.max(4, Math.round(Math.min(prepared.width, prepared.height) * 0.006));
  return simplified.map(vertex => {
    const distance = Math.max(1, Math.hypot(vertex.x - center.x, vertex.y - center.y));
    const x = vertex.x + (vertex.x - center.x) / distance * padding;
    const y = vertex.y + (vertex.y - center.y) / distance * padding;
    return { x: x / prepared.width * placement.width, y: y / prepared.height * placement.height };
  });
}

function percentile(values: Float32Array, fraction: number): number {
  const sample: number[] = [];
  const stride = Math.max(1, Math.floor(values.length / 16384));
  for (let i = 0; i < values.length; i += stride) sample.push(values[i]);
  sample.sort((a, b) => a - b);
  return sample[Math.floor((sample.length - 1) * clamp(fraction, 0.5, 0.99))] || 0;
}

function sobel(gray: Float32Array, width: number, height: number) {
  const horizontal = new Float32Array(width * height);
  const vertical = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const gx = -gray[i - width - 1] + gray[i - width + 1] - 2 * gray[i - 1] + 2 * gray[i + 1]
        - gray[i + width - 1] + gray[i + width + 1];
      const gy = -gray[i - width - 1] - 2 * gray[i - width] - gray[i - width + 1]
        + gray[i + width - 1] + 2 * gray[i + width] + gray[i + width + 1];
      vertical[i] = Math.abs(gx);
      horizontal[i] = Math.abs(gy);
    }
  }
  return { horizontal, vertical };
}

function collectRuns(
  strength: Float32Array,
  width: number,
  height: number,
  threshold: number,
  horizontal: boolean,
): PixelSegment[] {
  const lines: PixelSegment[] = [];
  const major = horizontal ? height : width;
  const minor = horizontal ? width : height;
  // Short high-contrast runs are usually furniture, floor patterns or text.
  const minRun = Math.max(8, Math.round(minor * 0.06));
  const maxGap = Math.max(3, Math.round(minor * 0.018));
  for (let a = 1; a < major - 1; a++) {
    let start = -1;
    let sum = 0;
    let strongPixels = 0;
    let lastStrong = -1;
    for (let b = 1; b <= minor + maxGap; b++) {
      const value = b < minor - 1 ? strength[horizontal ? a * width + b : b * width + a] : 0;
      if (value >= threshold) {
        if (start < 0) start = b;
        sum += value;
        strongPixels += 1;
        lastStrong = b;
      } else if (start >= 0 && b - lastStrong > maxGap) {
        const length = lastStrong - start + 1;
        const density = strongPixels / length;
        if (length >= minRun && density >= 0.32) {
          lines.push(horizontal
            ? { x1: start, y1: a, x2: lastStrong, y2: a, score: (sum / strongPixels) * density }
            : { x1: a, y1: start, x2: a, y2: lastStrong, score: (sum / strongPixels) * density });
        }
        start = -1;
        sum = 0;
        strongPixels = 0;
        lastStrong = -1;
      }
    }
  }
  return lines;
}

function mergeRuns(runs: PixelSegment[], horizontal: boolean, tolerance = 2): PixelSegment[] {
  const sorted = [...runs].sort((a, b) => {
    const ap = horizontal ? a.y1 : a.x1;
    const bp = horizontal ? b.y1 : b.x1;
    return ap - bp || (horizontal ? a.x1 - b.x1 : a.y1 - b.y1);
  });
  const result: PixelSegment[] = [];
  for (const run of sorted) {
    const previous = result[result.length - 1];
    const sameLine = previous && Math.abs((horizontal ? previous.y1 - run.y1 : previous.x1 - run.x1)) <= tolerance;
    const previousEnd = previous && (horizontal ? previous.x2 : previous.y2);
    const runStart = horizontal ? run.x1 : run.y1;
    if (previous && sameLine && runStart <= previousEnd + tolerance) {
      if (horizontal) previous.x2 = Math.max(previous.x2, run.x2);
      else previous.y2 = Math.max(previous.y2, run.y2);
      previous.score = Math.max(previous.score, run.score);
    } else result.push({ ...run });
  }
  return result;
}

function findOpenings(runs: PixelSegment[], horizontal: boolean, maxGap: number): PixelSegment[] {
  const openings: PixelSegment[] = [];
  const sorted = [...runs].sort((a, b) => (horizontal ? a.y1 - b.y1 || a.x1 - b.x1 : a.x1 - b.x1 || a.y1 - b.y1));
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    const parallelDistance = Math.abs(horizontal ? a.y1 - b.y1 : a.x1 - b.x1);
    const gapStart = horizontal ? a.x2 : a.y2;
    const gapEnd = horizontal ? b.x1 : b.y1;
    const gap = gapEnd - gapStart;
    if (parallelDistance <= 2 && gap >= 3 && gap <= maxGap) {
      openings.push(horizontal
        ? { x1: gapStart, y1: (a.y1 + b.y1) / 2, x2: gapEnd, y2: (a.y1 + b.y1) / 2, score: Math.min(a.score, b.score) }
        : { x1: (a.x1 + b.x1) / 2, y1: gapStart, x2: (a.x1 + b.x1) / 2, y2: gapEnd, score: Math.min(a.score, b.score) });
    }
  }
  return openings;
}

function crossesWall(a: AnalysisPoint, b: AnalysisPoint, walls: PixelSegment[], sx: number, sy: number): boolean {
  const p1 = { x: a.x * sx, y: a.y * sy };
  const p2 = { x: b.x * sx, y: b.y * sy };
  return walls.some(wall => segmentsIntersect(p1, p2, { x: wall.x1, y: wall.y1 }, { x: wall.x2, y: wall.y2 }));
}

function tracePolygon(cells: number[], columns: number): AnalysisPoint[] {
  const edges: Edge[] = [];
  const occupied = new Set(cells);
  for (const cell of cells) {
    const x = cell % columns;
    const y = Math.floor(cell / columns);
    if (!occupied.has(cell - columns)) edges.push({ ax: x, ay: y, bx: x + 1, by: y });
    if (!occupied.has(cell + 1) || x === columns - 1) edges.push({ ax: x + 1, ay: y, bx: x + 1, by: y + 1 });
    if (!occupied.has(cell + columns)) edges.push({ ax: x + 1, ay: y + 1, bx: x, by: y + 1 });
    if (!occupied.has(cell - 1) || x === 0) edges.push({ ax: x, ay: y + 1, bx: x, by: y });
  }
  const byStart = new Map<string, Edge[]>();
  for (const edge of edges) {
    const list = byStart.get(key(edge.ax, edge.ay)) || [];
    list.push(edge);
    byStart.set(key(edge.ax, edge.ay), list);
  }
  let current = edges[0];
  const polygon: AnalysisPoint[] = [];
  const used = new Set<Edge>();
  while (current && !used.has(current)) {
    used.add(current);
    polygon.push({ x: current.ax, y: current.ay });
    current = (byStart.get(key(current.bx, current.by)) || []).find(edge => !used.has(edge)) as Edge;
  }
  return polygon.filter((point, i, all) => {
    const previous = all[(i + all.length - 1) % all.length];
    const next = all[(i + 1) % all.length];
    return (point.x - previous.x) * (next.y - point.y) !== (point.y - previous.y) * (next.x - point.x);
  });
}

function makeSegment(segment: PixelSegment, width: number, height: number, placement: MapPlacement, threshold: number, kind: AnalysisSegment['kind']): AnalysisSegment {
  const normalizedStart = { x: segment.x1 / width, y: segment.y1 / height };
  const normalizedEnd = { x: segment.x2 / width, y: segment.y2 / height };
  return {
    start: { x: normalizedStart.x * placement.width, y: normalizedStart.y * placement.height },
    end: { x: normalizedEnd.x * placement.width, y: normalizedEnd.y * placement.height },
    normalizedStart,
    normalizedEnd,
    confidence: clamp(segment.score / Math.max(threshold * 2, 1), 0.25, 1),
    source: 'local',
    kind,
  };
}

/** Analyze an image using canvas APIs. A CORS-enabled URL is required for remote images. */
export async function analyzeBattleMap(imageUrl: string, placement: MapPlacement, options: BattleMapAnalysisOptions = {}): Promise<BattleMapAnalysis> {
  if (!imageUrl || !Number.isFinite(placement.width) || !Number.isFinite(placement.height) || placement.width <= 0 || placement.height <= 0) {
    throw new Error('A valid image URL and positive map placement dimensions are required.');
  }
  await reportProgress(options, 4, 'Caricamento immagine');
  const image = await loadImage(imageUrl);
  await reportProgress(options, 12, 'Preparazione immagine');
  const maxDimension = clamp(Math.round(options.maxDimension ?? 512), 64, 512);
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(2, Math.round(image.naturalWidth * scale));
  const height = Math.max(2, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas 2D is unavailable.');
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  await reportProgress(options, 24, 'Analisi dei contrasti');
  const gray = new Float32Array(width * height);
  for (let i = 0; i < gray.length; i++) gray[i] = pixels[i * 4] * 0.299 + pixels[i * 4 + 1] * 0.587 + pixels[i * 4 + 2] * 0.114;
  const gradients = sobel(gray, width, height);
  await reportProgress(options, 42, 'Ricerca dei bordi strutturali');
  const edgePercentile = options.edgePercentile ?? 0.9;
  const hThreshold = Math.max(32, percentile(gradients.horizontal, edgePercentile));
  const vThreshold = Math.max(32, percentile(gradients.vertical, edgePercentile));
  const horizontal = mergeRuns(collectRuns(gradients.horizontal, width, height, hThreshold, true), true);
  const vertical = mergeRuns(collectRuns(gradients.vertical, width, height, vThreshold, false), false);
  await reportProgress(options, 64, 'Ricostruzione dei muri');
  const minimumWallLength = Math.max(width, height) * 0.035;
  const walls = [...horizontal, ...vertical]
    .filter(wall => Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1) >= minimumWallLength)
    .sort((a, b) => b.score - a.score || a.y1 - b.y1 || a.x1 - b.x1);
  const maxBlockers = clamp(Math.round(options.maxBlockers ?? 250), 1, 500);
  const blockers = walls.slice(0, maxBlockers).map(wall => makeSegment(wall, width, height, placement, wall.x1 === wall.x2 ? vThreshold : hThreshold, 'wall'));

  const openingPixels = [
    ...findOpenings(horizontal, true, Math.max(8, width * 0.08)),
    ...findOpenings(vertical, false, Math.max(8, height * 0.08)),
  ].sort((a, b) => b.score - a.score || a.y1 - b.y1 || a.x1 - b.x1);
  const maxOpenings = clamp(Math.round(options.maxOpenings ?? 100), 0, 300);
  const candidateOpenings = openingPixels.slice(0, maxOpenings).map(opening => {
    const length = Math.hypot(opening.x2 - opening.x1, opening.y2 - opening.y1);
    const kind = length <= Math.max(width, height) * 0.035 ? 'door' : 'window';
    return makeSegment(opening, width, height, placement, opening.x1 === opening.x2 ? vThreshold : hThreshold, kind);
  });
  await reportProgress(options, 76, 'Separazione degli ambienti');

  const gridTarget = clamp(Math.round(options.gridSize ?? 48), 12, 96);
  const columns = Math.max(4, Math.round(gridTarget * width / Math.max(width, height)));
  const rows = Math.max(4, Math.round(gridTarget * height / Math.max(width, height)));
  const visited = new Uint8Array(columns * rows);
  const regions: AnalysisRegion[] = [];
  const cellW = width / columns;
  const cellH = height / rows;
  for (let seed = 0; seed < visited.length; seed++) {
    if (visited[seed]) continue;
    const queue = [seed];
    const cells: number[] = [];
    visited[seed] = 1;
    let boundary = false;
    for (let q = 0; q < queue.length; q++) {
      const cell = queue[q];
      cells.push(cell);
      const x = cell % columns;
      const y = Math.floor(cell / columns);
      if (x === 0 || y === 0 || x === columns - 1 || y === rows - 1) boundary = true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= columns || ny >= rows) continue;
        const next = ny * columns + nx;
        if (visited[next]) continue;
        const a = { x: (x + 0.5) * cellW, y: (y + 0.5) * cellH };
        const b = { x: (nx + 0.5) * cellW, y: (ny + 0.5) * cellH };
        if (!crossesWall(a, b, walls, 1, 1)) {
          visited[next] = 1;
          queue.push(next);
        }
      }
    }
    if (cells.length < 2) continue;
    const gridPolygon = tracePolygon(cells, columns);
    if (gridPolygon.length < 3) continue;
    const normalizedPolygon = gridPolygon.map(point => ({ x: point.x / columns, y: point.y / rows }));
    regions.push({
      normalizedPolygon,
      polygon: normalizedPolygon.map(point => ({ x: point.x * placement.width, y: point.y * placement.height })),
      classification: boundary ? 'exterior' : 'interior',
      confidence: clamp(0.45 + Math.min(cells.length / 50, 0.3) + (boundary ? 0 : 0.15), 0, 0.9),
      source: 'local',
    });
  }
  regions.sort((a, b) => (a.classification === b.classification ? b.polygon.length - a.polygon.length : a.classification === 'interior' ? -1 : 1));
  await reportProgress(options, 100, 'Analisi completata');
  return {
    engine: 'heuristic',
    imageSize: { width: image.naturalWidth, height: image.naturalHeight },
    analysisSize: { width, height },
    blockers,
    candidateOpenings,
    regions: regions.slice(0, clamp(Math.round(options.maxRegions ?? 100), 1, 300)),
  };
}

export function segmentsIntersect(a: AnalysisPoint, b: AnalysisPoint, c: AnalysisPoint, d: AnalysisPoint, epsilon = 1e-9): boolean {
  const cross = (p: AnalysisPoint, q: AnalysisPoint, r: AnalysisPoint) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  if (((abC > epsilon && abD < -epsilon) || (abC < -epsilon && abD > epsilon)) && ((cdA > epsilon && cdB < -epsilon) || (cdA < -epsilon && cdB > epsilon))) return true;
  const on = (p: AnalysisPoint, q: AnalysisPoint, r: AnalysisPoint) => Math.abs(cross(p, q, r)) <= epsilon && r.x >= Math.min(p.x, q.x) - epsilon && r.x <= Math.max(p.x, q.x) + epsilon && r.y >= Math.min(p.y, q.y) - epsilon && r.y <= Math.max(p.y, q.y) + epsilon;
  return on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b);
}

export function isLineOfSightBlocked(from: AnalysisPoint, to: AnalysisPoint, blockers: Pick<AnalysisSegment, 'start' | 'end'>[]): boolean {
  return blockers.some(blocker => segmentsIntersect(from, to, blocker.start, blocker.end));
}

export function filterSegmentsNearCircle(origin: AnalysisPoint, radius: number, blockers: Pick<AnalysisSegment, 'start' | 'end'>[]) {
  if (!Number.isFinite(radius)) return blockers;
  return blockers.filter(blocker => {
    const minX = Math.min(blocker.start.x, blocker.end.x);
    const maxX = Math.max(blocker.start.x, blocker.end.x);
    const minY = Math.min(blocker.start.y, blocker.end.y);
    const maxY = Math.max(blocker.start.y, blocker.end.y);
    return maxX >= origin.x - radius && minX <= origin.x + radius && maxY >= origin.y - radius && minY <= origin.y + radius;
  });
}

/** Cast deterministic rays toward blocker endpoints and return the nearest-hit visibility polygon. */
export function computeVisibilityPolygon(origin: AnalysisPoint, blockers: Pick<AnalysisSegment, 'start' | 'end'>[], bounds: { width: number; height: number }, maxPoints = 512, maxDistance = Infinity, direction = 0, fieldOfView = Math.PI * 2): AnalysisPoint[] {
  const boundary = [
    { start: { x: 0, y: 0 }, end: { x: bounds.width, y: 0 } },
    { start: { x: bounds.width, y: 0 }, end: { x: bounds.width, y: bounds.height } },
    { start: { x: bounds.width, y: bounds.height }, end: { x: 0, y: bounds.height } },
    { start: { x: 0, y: bounds.height }, end: { x: 0, y: 0 } },
  ];
  const segments = [...blockers, ...boundary];
  const endpointAngles = segments.flatMap(segment => [segment.start, segment.end]).flatMap(point => {
    const angle = Math.atan2(point.y - origin.y, point.x - origin.x);
    return [angle - 1e-5, angle, angle + 1e-5];
  });
  const cone = fieldOfView < Math.PI * 2 - 1e-6;
  const halfFieldOfView = clamp(fieldOfView / 2, 1e-4, Math.PI);
  const relativeAngle = (angle: number) => Math.atan2(Math.sin(angle - direction), Math.cos(angle - direction));
  const radialAngles = Number.isFinite(maxDistance) ? Array.from({ length: 96 }, (_, index) => cone ? direction - halfFieldOfView + index * fieldOfView / 95 : -Math.PI + index * Math.PI * 2 / 96) : [];
  const coneBoundaryAngles = cone ? [direction - halfFieldOfView, direction + halfFieldOfView] : [];
  const allAngles = [...endpointAngles, ...radialAngles, ...coneBoundaryAngles]
    .filter(angle => !cone || Math.abs(relativeAngle(angle)) <= halfFieldOfView + 1e-5)
    .sort((a, b) => cone ? relativeAngle(a) - relativeAngle(b) : a - b)
    .filter((angle, index, values) => index === 0 || Math.abs(relativeAngle(angle) - relativeAngle(values[index - 1])) > 1e-8);
  const limit = clamp(maxPoints, 3, 2048);
  // Never take the first N sorted angles: that removes one side of the circle
  // and produces a large triangular visibility wedge. Sample the whole range.
  const angles = allAngles.length <= limit ? allAngles : Array.from({ length: limit }, (_, index) => allAngles[Math.floor(index * allAngles.length / limit)]);
  const visiblePoints = angles.map(angle => {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let distance = Infinity;
    for (const segment of segments) {
      const sx = segment.end.x - segment.start.x;
      const sy = segment.end.y - segment.start.y;
      const denominator = dx * sy - dy * sx;
      if (Math.abs(denominator) < 1e-9) continue;
      const ox = segment.start.x - origin.x;
      const oy = segment.start.y - origin.y;
      const rayDistance = (ox * sy - oy * sx) / denominator;
      const alongSegment = (ox * dy - oy * dx) / denominator;
      if (rayDistance >= 0 && alongSegment >= 0 && alongSegment <= 1) distance = Math.min(distance, rayDistance);
    }
    distance = Math.min(distance, maxDistance);
    return { x: origin.x + dx * distance, y: origin.y + dy * distance };
  }).filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
  return cone ? [origin, ...visiblePoints] : visiblePoints;
}
