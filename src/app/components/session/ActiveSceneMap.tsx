import type { ActiveScenePublication } from '../../../types/activeScene';

export function ActiveSceneMap({ scene }: { scene: ActiveScenePublication }) {
  const grid = scene.mapMetadata;
  const backgroundSize = `${100 / grid.gridColumns}% ${100 / grid.gridRows}%`;

  if (!scene.mapUrl) {
    return scene.sceneImageUrl ? (
      <img src={scene.sceneImageUrl} alt={scene.title} className="block max-h-[65vh] w-full rounded-xl object-contain" />
    ) : null;
  }

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-input)]"
      style={grid.gridVisible ? {
        backgroundImage: 'linear-gradient(to right, color-mix(in srgb, var(--dash-text) 15%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--dash-text) 15%, transparent) 1px, transparent 1px)',
        backgroundSize,
      } : undefined}
    >
      <img src={scene.mapUrl} alt={`Mappa di ${scene.chapterTitle}`} className="block h-auto w-full" />
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
