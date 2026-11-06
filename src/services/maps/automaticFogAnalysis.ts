import { analyzeBattleMap, type BattleMapAnalysis, type MapPlacement } from '../../lib/battleMapAnalysis';
import { analyzeBattleMapSemantically } from '../../lib/semanticBattleMapAnalysis';

type AiAnalysisResponse = {
  regions?: Array<{ normalizedPolygon: Array<{ x: number; y: number }>; classification?: string; confidence?: number }>;
  blockers?: Array<{ normalizedStart: { x: number; y: number }; normalizedEnd: { x: number; y: number }; kind?: string; confidence?: number }>;
};

async function prepareGeminiTiles(imageUrl: string) {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error('Impossibile leggere la mappa per preparare l analisi AI.');
  const bitmap = await createImageBitmap(await response.blob());
  const sectors = Array.from({ length: 9 }, (_, index) => ({ column: index % 3, row: Math.floor(index / 3), xMin: (index % 3) / 3, xMax: ((index % 3) + 1) / 3, yMin: Math.floor(index / 3) / 3, yMax: (Math.floor(index / 3) + 1) / 3 }));
  const tiles = sectors.map((sector) => {
    const overlap = 0.04;
    const crop = { xMin: Math.max(0, sector.xMin - overlap), xMax: Math.min(1, sector.xMax + overlap), yMin: Math.max(0, sector.yMin - overlap), yMax: Math.min(1, sector.yMax + overlap) };
    const sourceX = Math.round(crop.xMin * bitmap.width);
    const sourceY = Math.round(crop.yMin * bitmap.height);
    const sourceWidth = Math.max(1, Math.round((crop.xMax - crop.xMin) * bitmap.width));
    const sourceHeight = Math.max(1, Math.round((crop.yMax - crop.yMin) * bitmap.height));
    const scale = Math.min(2, 1536 / Math.max(sourceWidth, sourceHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D non disponibile.');
    context.drawImage(bitmap, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/webp', 0.88);
    return { imageData: dataUrl.slice(dataUrl.indexOf(',') + 1), mimeType: 'image/webp', sector, crop };
  });
  bitmap.close();
  return tiles;
}

export async function analyzeMapForAutomaticFog(input: { imageUrl: string; placement: MapPlacement; campaignId?: string; accessToken?: string | null; serverBase?: string; onProgress?: (progress: number, stage: string) => void }): Promise<BattleMapAnalysis> {
  if (input.campaignId && input.accessToken && input.serverBase) {
    try {
      input.onProgress?.(3, 'Preparazione immagine per Gemini');
      const tiles = await prepareGeminiTiles(input.imageUrl);
      const analyzedRegions: BattleMapAnalysis['regions'] = [];
      const analyzedBlockers: BattleMapAnalysis['blockers'] = [];
      const failures: string[] = [];
      for (let requestIndex = 0; requestIndex < tiles.length * 2; requestIndex++) {
        const task = requestIndex < tiles.length ? 'regions' : 'blockers';
        const tileIndex = requestIndex % tiles.length;
        const { sector, crop, ...preparedImage } = tiles[tileIndex];
        input.onProgress?.(8 + Math.round(requestIndex / (tiles.length * 2) * 82), `${task === 'regions' ? 'Ambienti' : 'Muri e aperture'}: settore ${tileIndex + 1} di ${tiles.length}`);
        const response = await fetch(`${input.serverBase}/campaigns/${encodeURIComponent(input.campaignId)}/map-vision`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${input.accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...preparedImage, task }),
          signal: AbortSignal.timeout(120_000),
        });
        if (!response.ok) {
          const failure = await response.json().catch(() => null) as { error?: string; code?: string } | null;
          const message = failure?.error ?? `Gemini non disponibile (${response.status})`;
          if (failure?.code === 'GEMINI_NOT_CONFIGURED') throw new Error(`GEMINI: ${message}`);
          failures.push(message);
          continue;
        }
        const ai = await response.json() as AiAnalysisResponse;
        const finitePoint = (point: { x: number; y: number }) => Number.isFinite(point?.x) && Number.isFinite(point?.y) && point.x >= 0 && point.y >= 0;
        const coordinateValues = [...(ai.regions ?? []).flatMap(item => item.normalizedPolygon ?? []), ...(ai.blockers ?? []).flatMap(item => [item.normalizedStart, item.normalizedEnd])].filter(finitePoint).flatMap(point => [point.x, point.y]);
        const coordinateMaximum = Math.max(1, ...coordinateValues);
        const coordinateDivisor = coordinateMaximum <= 1 ? 1 : coordinateMaximum <= 100 ? 100 : 1000;
        const normalizePoints = (points: Array<{ x: number; y: number }>) => {
          return points.map(point => {
            const localX = Math.max(0, Math.min(1, point.x / coordinateDivisor));
            const localY = Math.max(0, Math.min(1, point.y / coordinateDivisor));
            return { x: crop.xMin + localX * (crop.xMax - crop.xMin), y: crop.yMin + localY * (crop.yMax - crop.yMin) };
          });
        };
        const regions = (ai.regions ?? []).slice(0, 100).filter(item => item.classification?.toLowerCase() !== 'exterior' && Array.isArray(item.normalizedPolygon) && item.normalizedPolygon.length >= 3 && item.normalizedPolygon.every(finitePoint)).map(item => {
          const points = normalizePoints(item.normalizedPolygon);
          const center = { x: points.reduce((sum, point) => sum + point.x, 0) / points.length, y: points.reduce((sum, point) => sum + point.y, 0) / points.length };
          const normalizedPolygon = points;
          const area = Math.abs(normalizedPolygon.reduce((sum, point, index) => { const next = normalizedPolygon[(index + 1) % normalizedPolygon.length]; return sum + point.x * next.y - next.x * point.y; }, 0) / 2);
          return { normalizedPolygon, polygon: normalizedPolygon.map(point => ({ x: point.x * input.placement.width, y: point.y * input.placement.height })), classification: 'interior' as const, confidence: Math.max(0, Math.min(1, item.confidence ?? 0.75)), source: 'ai' as const, center, area };
        }).filter(region => region.area >= 0.00005 && region.center.x >= sector.xMin && region.center.x <= sector.xMax && region.center.y >= sector.yMin && region.center.y <= sector.yMax).map(({ center: _center, area: _area, ...region }) => region);
        const blockers = (ai.blockers ?? []).slice(0, 400).filter(item => finitePoint(item.normalizedStart) && finitePoint(item.normalizedEnd) && ['wall', 'door', 'window'].includes(item.kind ?? '')).map(item => {
          const [normalizedStart, normalizedEnd] = normalizePoints([item.normalizedStart, item.normalizedEnd]);
          return { normalizedStart, normalizedEnd, start: { x: normalizedStart.x * input.placement.width, y: normalizedStart.y * input.placement.height }, end: { x: normalizedEnd.x * input.placement.width, y: normalizedEnd.y * input.placement.height }, confidence: Math.max(0, Math.min(1, item.confidence ?? 0.75)), source: 'ai' as const, kind: item.kind as 'wall' | 'door' | 'window' };
        }).filter(blocker => { const midpoint = { x: (blocker.normalizedStart.x + blocker.normalizedEnd.x) / 2, y: (blocker.normalizedStart.y + blocker.normalizedEnd.y) / 2 }; return midpoint.x >= sector.xMin && midpoint.x <= sector.xMax && midpoint.y >= sector.yMin && midpoint.y <= sector.yMax; });
        analyzedRegions.push(...regions);
        analyzedBlockers.push(...blockers);
      }
      const regionCentroid = (region: BattleMapAnalysis['regions'][number]) => ({ x: region.normalizedPolygon.reduce((sum, point) => sum + point.x, 0) / region.normalizedPolygon.length, y: region.normalizedPolygon.reduce((sum, point) => sum + point.y, 0) / region.normalizedPolygon.length });
      const regions = analyzedRegions.filter((region, index, all) => { const center = regionCentroid(region); return all.findIndex(candidate => { const other = regionCentroid(candidate); return Math.hypot(center.x - other.x, center.y - other.y) < 0.01; }) === index; });
      const blockers = analyzedBlockers.filter((blocker, index, all) => all.findIndex(candidate => candidate.kind === blocker.kind && Math.hypot(candidate.normalizedStart.x - blocker.normalizedStart.x, candidate.normalizedStart.y - blocker.normalizedStart.y) < 0.01 && Math.hypot(candidate.normalizedEnd.x - blocker.normalizedEnd.x, candidate.normalizedEnd.y - blocker.normalizedEnd.y) < 0.01) === index);
      if (regions.length > 0) { input.onProgress?.(100, 'Analisi Gemini completata'); return { engine: 'gemini', imageSize: { width: input.placement.width, height: input.placement.height }, analysisSize: { width: input.placement.width, height: input.placement.height }, regions, blockers: blockers.filter(item => item.kind === 'wall'), candidateOpenings: blockers.filter(item => item.kind !== 'wall') }; }
      throw new Error(`GEMINI: Gemini non ha restituito ambienti utilizzabili nei nove settori.${failures.length ? ` Errori: ${failures.join(' | ')}` : ''}`);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('GEMINI:')) throw error;
    }
  }
  try {
    input.onProgress?.(2, 'Gemini non disponibile, avvio AI locale');
    return await analyzeBattleMapSemantically(input.imageUrl, input.placement, input.onProgress);
  } catch {
    input.onProgress?.(2, 'AI non disponibile, avvio analisi euristica');
  }
  input.onProgress?.(2, 'Avvio analisi locale');
  return analyzeBattleMap(input.imageUrl, input.placement, { onProgress: input.onProgress });
}
