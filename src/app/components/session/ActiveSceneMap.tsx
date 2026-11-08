import type { ActiveScenePublication } from '../../../types/activeScene';

export function ActiveSceneMap({ scene, imageUrl, onReady, unframed = false, fill = false }: { scene: ActiveScenePublication; imageUrl?: string | null; onReady?: (url: string) => void; unframed?: boolean; fill?: boolean }) {
  const resolvedImageUrl = imageUrl === undefined ? scene.mapMetadata.displayUrl ?? scene.mapUrl ?? scene.sceneImageUrl : imageUrl;
  if (!resolvedImageUrl) return null;

  return (
    <div
      className={`relative overflow-hidden bg-[var(--dash-input)] ${fill ? 'h-full w-full' : ''} ${unframed ? '' : 'rounded-xl border border-[var(--dash-border-soft)]'}`}
    >
      <img key={resolvedImageUrl} src={resolvedImageUrl} alt={`Mappa di ${scene.chapterTitle}`} draggable={false} decoding="async" onLoad={() => requestAnimationFrame(() => requestAnimationFrame(() => onReady?.(resolvedImageUrl)))} className={`block w-full ${fill ? 'h-full object-fill' : 'h-auto'}`} />
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-label={`Aree di ${scene.title}`}>
        {scene.mapRegions.map(region => region.geometry.kind === 'rect' ? (
          <rect
            key={region.id}
            x={region.geometry.rect.x}
            y={region.geometry.rect.y}
            width={region.geometry.rect.width}
            height={region.geometry.rect.height}
            fill={region.color}
            fillOpacity={0.28}
            stroke={region.color}
            strokeWidth={0.8}
            vectorEffect="non-scaling-stroke"
          />
        ) : (
          <polygon
            key={region.id}
            points={region.geometry.points.map(point => `${point.x},${point.y}`).join(' ')}
            fill={region.color}
            fillOpacity={0.28}
            stroke={region.color}
            strokeWidth={0.8}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
    </div>
  );
}
