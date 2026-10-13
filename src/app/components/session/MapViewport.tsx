import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent } from 'react';
import { configureSessionMapFit, useActiveSessionMapTool, type SessionMapFitMode, type SessionMapTool } from './mapToolStore';
import type { SessionGridSettings } from '../../../types/mapGeometry';
import { snapToSessionGrid, type GridObjectSize } from './mapGridSnap';

const MIN_SCALE = 0.3;
const MAX_SCALE = 6;
const ZOOM_SENSITIVITY = 0.0008;
const PAN_ENABLED_TOOLS = new Set<SessionMapTool>(['move', 'grid', 'pin', 'pointer']);

type ViewTransform = { x: number; y: number; scale: number };
export type MapPlacement = { x: number; y: number; locked: boolean; width?: number; height?: number };
type PanGesture = { pointerId: number; target: 'view' | 'map'; startX: number; startY: number; originX: number; originY: number; objectSize: GridObjectSize };

function CanvasGrid({ settings, patternId }: { settings: SessionGridSettings; patternId: string }) {
  if (settings.opacity <= 0) return null;
  const size = settings.cellSize;
  const color = settings.color ?? '#38bdf8';
  const lineStyle = settings.lineStyle ?? 'solid';
  const strokeProps = lineStyle === 'dashed' ? { strokeDasharray: '6 5' } : lineStyle === 'dotted' ? { strokeDasharray: '1 6', strokeLinecap: 'round' as const } : {};
  if (settings.type === 'square') {
    const inset = Math.min(3, size / 6);
    const arm = Math.min(7, size / 3);
    const squarePath = lineStyle === 'crosses'
      ? `M ${-arm / 2} 0 H ${arm / 2} M 0 ${-arm / 2} V ${arm / 2}`
      : lineStyle === 'corners'
        ? `M ${inset} ${inset + arm} V ${inset} H ${inset + arm} M ${size - inset - arm} ${inset} H ${size - inset} V ${inset + arm} M ${size - inset} ${size - inset - arm} V ${size - inset} H ${size - inset - arm} M ${inset + arm} ${size - inset} H ${inset} V ${size - inset - arm}`
        : `M 0 0 H ${size} M 0 0 V ${size}`;
    return <svg data-session-map-grid="square" aria-hidden="true" className="pointer-events-none absolute -left-[20000px] -top-[20000px] z-[2] h-[40000px] w-[40000px]" style={{ color, opacity: settings.opacity }}><defs><pattern id={patternId} x={20000} y={20000} width={size} height={size} patternUnits="userSpaceOnUse"><path d={squarePath} fill="none" stroke="currentColor" strokeWidth="1" {...strokeProps} />{lineStyle === 'dotted' && <circle cx="0" cy="0" r="2" fill="currentColor" />}</pattern></defs><rect width="100%" height="100%" fill={`url(#${patternId})`} /></svg>;
  }
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
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  });
  return <svg data-session-map-grid={settings.type} aria-hidden="true" className="pointer-events-none absolute -left-[20000px] -top-[20000px] z-[2] h-[40000px] w-[40000px]" style={{ color, opacity: settings.opacity }}><defs><pattern id={patternId} x={20000} y={20000} width={patternWidth} height={patternHeight} patternUnits="userSpaceOnUse">{centers.map(([cx, cy], index) => {
    const points = polygonPoints(cx, cy);
    if (lineStyle === 'crosses') return <g key={index}>{points.map((point, pointIndex) => <path key={pointIndex} d={`M ${point.x - 3} ${point.y} H ${point.x + 3} M ${point.x} ${point.y - 3} V ${point.y + 3}`} fill="none" stroke="currentColor" strokeWidth="1" />)}</g>;
    if (lineStyle === 'corners') return <g key={index}>{points.map((point, pointIndex) => { const previous = points[(pointIndex + 5) % 6]; const next = points[(pointIndex + 1) % 6]; const before = { x: point.x + (previous.x - point.x) * 0.18, y: point.y + (previous.y - point.y) * 0.18 }; const after = { x: point.x + (next.x - point.x) * 0.18, y: point.y + (next.y - point.y) * 0.18 }; return <path key={pointIndex} d={`M ${before.x} ${before.y} L ${point.x} ${point.y} L ${after.x} ${after.y}`} fill="none" stroke="currentColor" strokeWidth="1" />; })}</g>;
    return <g key={index}><polygon points={points.map(point => `${point.x},${point.y}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="1" {...strokeProps} />{lineStyle === 'dotted' && points.map((point, pointIndex) => <circle key={pointIndex} cx={point.x} cy={point.y} r="2" fill="currentColor" />)}</g>;
  })}</pattern></defs><rect width="100%" height="100%" fill={`url(#${patternId})`} /></svg>;
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
  const placementElementRef = useRef<HTMLDivElement>(null);
  const onMapPlacementChangeRef = useRef(onMapPlacementChange);
  onMapPlacementChangeRef.current = onMapPlacementChange;

  useEffect(() => {
    if (panRef.current?.target === 'map') return;
    placementRef.current = mapPlacement;
    setPlacement(mapPlacement);
  }, [mapPlacement]);

  useEffect(() => {
    try { window.localStorage.setItem(`hollowgate.map-view.${mapId}`, JSON.stringify(view)); } catch { /* Pan and zoom still work without storage. */ }
  }, [mapId, view]);

  useEffect(() => {
    const available = isOwner && !mapPlacement.locked && gridSettings.type === 'square';
    const fitMap = (mode: SessionMapFitMode) => {
      const element = placementElementRef.current;
      if (!element || !available) return;
      if (mode === 'reset') {
        const { width: _width, height: _height, ...originalPlacement } = placementRef.current;
        placementRef.current = originalPlacement;
        setPlacement(originalPlacement);
        onMapPlacementChangeRef.current?.(originalPlacement);
        return;
      }
      const rect = element.getBoundingClientRect();
      const width = rect.width / view.scale;
      const height = rect.height / view.scale;
      const cellSize = gridSettings.cellSize;
      const x = Math.round(placementRef.current.x / cellSize) * cellSize;
      const y = Math.round(placementRef.current.y / cellSize) * cellSize;
      let fittedWidth = Math.max(cellSize, Math.round(width / cellSize) * cellSize);
      let fittedHeight = Math.max(cellSize, Math.round(height / cellSize) * cellSize);
      if (mode === 'proportional') {
        const image = element.querySelector('img');
        const aspectRatio = image?.naturalWidth && image.naturalHeight ? image.naturalWidth / image.naturalHeight : width / height;
        const widthScaleChange = Math.abs(fittedWidth / width - 1);
        const heightScaleChange = Math.abs(fittedHeight / height - 1);
        if (widthScaleChange <= heightScaleChange) fittedHeight = fittedWidth / aspectRatio;
        else fittedWidth = fittedHeight * aspectRatio;
      }
      const next = { ...placementRef.current, x, y, width: fittedWidth, height: fittedHeight };
      placementRef.current = next;
      setPlacement(next);
      onMapPlacementChangeRef.current?.(next);
    };
    configureSessionMapFit(available, fitMap);
    return () => configureSessionMapFit(false, null);
  }, [gridSettings.cellSize, gridSettings.type, isOwner, mapPlacement.locked, view.scale]);

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
    const targetElement = target === 'map' ? (event.target as Element).closest('[data-map-placement]') : null;
    const targetRect = targetElement?.getBoundingClientRect();
    const objectSize = targetRect ? { width: targetRect.width / view.scale, height: targetRect.height / view.scale } : { width: 0, height: 0 };
    panRef.current = { pointerId: event.pointerId, target, startX: event.clientX, startY: event.clientY, originX: origin.x, originY: origin.y, objectSize };
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
      const snapped = snapToSessionGrid({ x: pan.originX + deltaX / view.scale, y: pan.originY + deltaY / view.scale }, gridSettings, pan.objectSize);
      const next = { ...placementRef.current, ...snapped };
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
      <div ref={placementElementRef} data-map-placement data-map-movable={isOwner && !mapPlacement.locked ? 'true' : 'false'} className={`${placement.width ? '' : 'w-full'} [backface-visibility:hidden]`} style={{ width: placement.width, height: placement.height, transform: `translate3d(${placement.x}px, ${placement.y}px, 0)`, willChange: 'transform' }}>
        {children}
      </div>
      <CanvasGrid settings={gridSettings} patternId={`canvas-grid-${mapId.replace(/[^a-zA-Z0-9_-]/g, '')}`} />
    </div>
  </div>;
}
