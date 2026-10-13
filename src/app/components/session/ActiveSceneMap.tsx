import { useEffect, useState } from 'react';
import type { ActiveScenePublication } from '../../../types/activeScene';

export function ActiveSceneMap({ scene, unframed = false, fill = false }: { scene: ActiveScenePublication; unframed?: boolean; fill?: boolean }) {
  const previewUrl = scene.mapMetadata.previewUrl;
  const fullMapUrl = scene.mapMetadata.displayUrl ?? scene.mapUrl;
  const [displayMapUrl, setDisplayMapUrl] = useState(previewUrl ?? fullMapUrl);

  useEffect(() => {
    if (!fullMapUrl || !previewUrl || previewUrl === fullMapUrl) {
      setDisplayMapUrl(fullMapUrl);
      return;
    }
    let cancelled = false;
    setDisplayMapUrl(previewUrl);
    const fullMap = new Image();
    fullMap.src = fullMapUrl;
    void fullMap.decode().catch(() => {}).then(() => {
      if (cancelled || !fullMap.complete || fullMap.naturalWidth <= 0) return;
      setDisplayMapUrl(fullMapUrl);
      if (!scene.mapMetadata.displayUrl || !scene.mapUrl || scene.mapUrl === fullMapUrl) return;
      const originalMap = new Image();
      originalMap.src = scene.mapUrl;
      void originalMap.decode().catch(() => {}).then(() => {
        if (!cancelled && originalMap.complete && originalMap.naturalWidth > 0) setDisplayMapUrl(scene.mapUrl);
      });
    });
    return () => { cancelled = true; };
  }, [fullMapUrl, previewUrl, scene.mapMetadata.displayUrl, scene.mapUrl]);

  if (!scene.mapUrl) {
    return scene.sceneImageUrl ? (
      <img src={scene.sceneImageUrl} alt={scene.title} draggable={false} className={`block w-full object-contain ${fill ? 'h-full' : ''} ${unframed ? '' : 'max-h-[65vh] rounded-xl'}`} />
    ) : null;
  }

  return (
    <div
      className={`relative overflow-hidden bg-[var(--dash-input)] ${fill ? 'h-full w-full' : ''} ${unframed ? '' : 'rounded-xl border border-[var(--dash-border-soft)]'}`}
    >
      <img src={displayMapUrl ?? fullMapUrl} alt={`Mappa di ${scene.chapterTitle}`} draggable={false} decoding="async" className={`block w-full [backface-visibility:hidden] ${fill ? 'h-full object-fill' : 'h-auto'}`} />
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
