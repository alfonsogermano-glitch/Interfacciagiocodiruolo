import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent } from 'react';
import { useActiveSessionMapTool, type SessionMapTool } from './mapToolStore';
import type { SessionGridSettings } from '../../../types/mapGeometry';

const MIN_SCALE = 0.3;
const MAX_SCALE = 6;
const ZOOM_SENSITIVITY = 0.0008;
const PAN_ENABLED_TOOLS = new Set<SessionMapTool>(['move', 'grid', 'pin', 'pointer']);

type ViewTransform = { x: number; y: number; scale: number };
export type MapPlacement = { x: number; y: number; locked: boolean };
type PanGesture = { pointerId: number; target: 'view' | 'map'; startX: number; startY: number; originX: number; originY: number };

function CanvasGrid({ settings, patternId }: { settings: SessionGridSettings; patternId: string }) {
  if (!settings.visible || settings.opacity <= 0) return null;
  const size = settings.cellSize;
  const color = settings.color ?? '#38bdf8';
  if (settings.type === 'square') return <div data-session-map-grid="square" aria-hidden="true" className="pointer-events-none absolute -left-[20000px] -top-[20000px] z-[2] h-[40000px] w-[40000px]" style={{ opacity: settings.opacity, backgroundImage: `linear-gradient(to right, ${color} 1px, transparent 1px), linear-gradient(to bottom, ${color} 1px, transparent 1px)`, backgroundSize: `${size}px ${size}px`, backgroundPosition: '20000px 20000px' }} />;
  const pointy = settings.type === 'hex-pointy';
  const radius = size / 2;
  const hexWidth = pointy ? Math.sqrt(3) * radius : radius * 2;
  const hexHeight = pointy ? radius * 2 : Math.sqrt(3) * radius;
  const patternWidth = pointy ? hexWidth * 2 : radius * 3;
  const patternHeight = pointy ? radius * 3 : hexHeight * 2;
  const centers: Array<[number, number]> = [];
  if (pointy) {
    for (let row = -2; row <= 3; row += 1) for (let column = -2; column <= 2; column += 1) centers.push([hexWidth / 2 + (Math.abs(row) % 2) * hexWidth / 2 + column * hexWidth, radius + row * radius * 1.5]);
  } else {
    for (let column = -2; column <= 3; column += 1) for (let row = -2; row <= 2; row += 1) centers.push([radius + column * radius * 1.5, hexHeight / 2 + (Math.abs(column) % 2) * hexHeight / 2 + row * hexHeight]);
  }
  const polygonPoints = (cx: number, cy: number) => Array.from({ length: 6 }, (_, index) => {
    const angle = ((pointy ? -90 : 0) + index * 60) * Math.PI / 180;
    return `${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)}`;
  }).join(' ');
  return <svg data-session-map-grid={settings.type} aria-hidden="true" className="pointer-events-none absolute -left-[20000px] -top-[20000px] z-[2] h-[40000px] w-[40000px]" style={{ color, opacity: settings.opacity }}><defs><pattern id={patternId} x={20000} y={20000} width={patternWidth} height={patternHeight} patternUnits="userSpaceOnUse">{centers.map(([cx, cy], index) => <polygon key={index} points={polygonPoints(cx, cy)} fill="none" stroke="currentColor" strokeWidth="1" />)}</pattern></defs><rect width="100%" height="100%" fill={`url(#${patternId})`} /></svg>;
}

function readStoredView(mapId: string): ViewTransform {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(`hollowgate.map-view.${mapId}`) ?? 'null');
    if (parsed && Number.isFinite(parsed.x) && Number.isFinite(parsed.y) && Number.isFinite(parsed.scale)) {
      return { x: parsed.x, y: parsed.y, scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, parsed.scale)) };
    }
  } catch { /* The default view remains available without storage. */ }
  return { x: 0, y: 0, scale: 1 };
}

export function MapViewport({ children, mapId, backgroundUrl, isOwner, mapPlacement, gridSettings, onMapPlacementChange }: { children: ReactNode; mapId: string; backgroundUrl?: string | null; isOwner: boolean; mapPlacement: MapPlacement; gridSettings: SessionGridSettings; onMapPlacementChange?: (placement: MapPlacement) => void }) {
  const activeTool = useActiveSessionMapTool();
  const [view, setView] = useState<ViewTransform>(() => readStoredView(mapId));
  const [placement, setPlacement] = useState(mapPlacement);
  const [panning, setPanning] = useState(false);
  const [moveTargetAvailable, setMoveTargetAvailable] = useState(false);
  const panRef = useRef<PanGesture | null>(null);
  const placementRef = useRef(mapPlacement);

  useEffect(() => {
    if (panRef.current?.target === 'map') return;
    placementRef.current = mapPlacement;
    setPlacement(mapPlacement);
  }, [mapPlacement]);

  useEffect(() => {
    try { window.localStorage.setItem(`hollowgate.map-view.${mapId}`, JSON.stringify(view)); } catch { /* Pan and zoom still work without storage. */ }
  }, [mapId, view]);

  const zoom = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    setView(current => {
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, current.scale * Math.exp(-event.deltaY * ZOOM_SENSITIVITY)));
      if (scale === current.scale) return current;
      const ratio = scale / current.scale;
      return {
        scale,
        x: pointerX - (pointerX - current.x) * ratio,
        y: pointerY - (pointerY - current.y) * ratio,
      };
    });
  };

  const beginPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!PAN_ENABLED_TOOLS.has(activeTool) || event.button !== 0 || (event.target as Element).closest('[data-map-interactive]')) return;
    event.preventDefault();
    const target = isOwner && !mapPlacement.locked && (event.target as Element).closest('[data-map-placement]') ? 'map' : 'view';
    setMoveTargetAvailable(target === 'map');
    const origin = target === 'map' ? placementRef.current : view;
    panRef.current = { pointerId: event.pointerId, target, startX: event.clientX, startY: event.clientY, originX: origin.x, originY: origin.y };
    event.currentTarget.setPointerCapture(event.pointerId);
    setPanning(true);
  };

  const movePan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (!pan) {
      setMoveTargetAvailable((event.target as Element).closest('[data-map-movable="true"]') !== null);
      return;
    }
    if (pan.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - pan.startX;
    const deltaY = event.clientY - pan.startY;
    if (pan.target === 'map') {
      const next = { ...placementRef.current, x: pan.originX + deltaX / view.scale, y: pan.originY + deltaY / view.scale };
      placementRef.current = next;
      setPlacement(next);
    } else {
      setView(current => ({ ...current, x: pan.originX + deltaX, y: pan.originY + deltaY }));
    }
  };

  const finishPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (pan.target === 'map') onMapPlacementChange?.(placementRef.current);
    panRef.current = null;
    setPanning(false);
  };

  return <div
    key={mapId}
    data-map-viewport
    data-map-tool-active={activeTool}
    data-map-panning={panning || undefined}
    data-map-move-target={moveTargetAvailable ? 'movable' : 'fixed'}
    className="relative h-full min-h-0 w-full overflow-hidden touch-none bg-[radial-gradient(circle_at_center,#262a31_0%,#14161b_58%,#0d0f13_100%)]"
    onWheel={zoom}
    onPointerDown={beginPan}
    onPointerMove={movePan}
    onPointerUp={finishPan}
    onPointerCancel={finishPan}
    onPointerLeave={() => { if (!panning) setMoveTargetAvailable(false); }}
    onLostPointerCapture={() => { panRef.current = null; setPanning(false); }}
  >
    {backgroundUrl && <div aria-hidden="true" className="pointer-events-none absolute -inset-8 bg-cover bg-center opacity-30 blur-2xl saturate-75" style={{ backgroundImage: `url(${JSON.stringify(backgroundUrl)})` }} />}
    <div
      data-map-transform
      className={`relative w-full origin-top-left select-none [backface-visibility:hidden] [transform-style:preserve-3d] ${panning ? '' : 'transition-transform duration-150 ease-out'}`}
      style={{ transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`, willChange: 'transform' }}
    >
      <div data-map-placement data-map-movable={isOwner && !mapPlacement.locked ? 'true' : 'false'} className="w-full [backface-visibility:hidden]" style={{ transform: `translate3d(${placement.x}px, ${placement.y}px, 0)`, willChange: 'transform' }}>
        {children}
      </div>
      <CanvasGrid settings={gridSettings} patternId={`canvas-grid-${mapId.replace(/[^a-zA-Z0-9_-]/g, '')}`} />
    </div>
  </div>;
}
