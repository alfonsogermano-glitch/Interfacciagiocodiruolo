import { Fragment, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent } from 'react';
import { configureSessionMapFit, useActiveSessionMapTool, type SessionMapFitMode, type SessionMapTool } from './mapToolStore';
import type { SessionGridSettings } from '../../../types/mapGeometry';
import { snapToSessionGrid, type GridObjectSize } from './mapGridSnap';
import type { SessionMapToken, SessionMapTokenVisual } from '../../../types/sessionMapToken';
import { registerSessionMapTokenDropHandler } from './sessionMapTokenDropStore';
import { TokenGhostShape } from '../shared/TokenGhostShape';
import { isBoundsFullyContained, type MapLayerMove } from './mapObjectLayers';
import { Eye, EyeOff, Flashlight, Layers3, Lock, Maximize2, Palette, Skull, Trash2, Unlock } from 'lucide-react';

const MIN_SCALE = 0.3;
const MAX_SCALE = 6;
const ZOOM_SENSITIVITY = 0.0008;
const PAN_ENABLED_TOOLS = new Set<SessionMapTool>(['move', 'grid', 'pin', 'pointer']);

type ViewTransform = { x: number; y: number; scale: number };
export type MapPlacement = { x: number; y: number; locked: boolean; width?: number; height?: number };
type PanGesture = { pointerId: number; target: 'view' | 'map'; startX: number; startY: number; originX: number; originY: number; objectSize: GridObjectSize };
type TokenPosition = { x: number; y: number };
type TokenGesture = { pointerId: number; tokenId: string; startX: number; startY: number; origins: Record<string, TokenPosition>; positions: Record<string, TokenPosition> };
type TokenMenu = { tokenId: string; x: number; y: number; panel: 'layers' | 'colors' | null; nameDraft: string };
type TokenTransform = TokenPosition & { size: number; rotation: number };
type TokenTransformGesture = { pointerId: number; tokenId: string; kind: 'resize' | 'rotate'; centerClientX: number; centerClientY: number; startDistance: number; startAngle: number; origin: TokenTransform; draft: TokenTransform };

interface MapViewportProps {
  children: ReactNode;
  mapId: string;
  backgroundUrl?: string | null;
  isOwner: boolean;
  mapPlacement: MapPlacement;
  gridSettings: SessionGridSettings;
  mapTokens?: SessionMapToken[];
  onMapPlacementChange?: (placement: MapPlacement) => void;
  onTokenDrop?: (visual: SessionMapTokenVisual, position: TokenPosition, size: number) => void;
  onTokensMove?: (positions: Record<string, TokenPosition>) => void;
  onTokenLayerMove?: (tokenId: string, move: MapLayerMove) => void;
  onTokenLockChange?: (tokenId: string, locked: boolean) => void;
  onTokenChange?: (tokenId: string, update: Partial<SessionMapToken>) => void;
  onTokenDelete?: (tokenId: string) => void;
}

const tokenFallback = <img src="/icon-source-1024.png" alt="" draggable={false} className="h-full w-full object-contain" style={{ filter: 'invert(1)', opacity: 0.9 }} />;
const TOKEN_LABEL_COLORS = ['#111827', '#7f1d1d', '#92400e', '#166534', '#155e75', '#1e40af', '#6b21a8', '#9f1239'];

function getTokenSize(token: SessionMapToken, fallback: number) {
  return Math.max(8, token.size ?? fallback);
}

function getTokenBounds(token: SessionMapToken, fallback: number, position: TokenPosition = token) {
  const size = getTokenSize(token, fallback);
  const angle = ((token.rotation ?? 0) * Math.PI) / 180;
  const boundsSize = size * (Math.abs(Math.cos(angle)) + Math.abs(Math.sin(angle)));
  const offset = (boundsSize - size) / 2;
  return { x: position.x - offset, y: position.y - offset, width: boundsSize, height: boundsSize };
}

function CanvasGrid({ settings, patternId }: { settings: SessionGridSettings; patternId: string }) {
  if (settings.opacity <= 0) return null;
  const size = settings.cellSize;
  const color = settings.color ?? '#38bdf8';
  const lineStyle = settings.lineStyle ?? 'solid';
  const strokeProps = lineStyle === 'dashed' ? { strokeDasharray: '6 5' } : lineStyle === 'dotted' ? { strokeDasharray: '1 6', strokeLinecap: 'round' as const } : {};
  if (settings.type === 'square') {
    const crossHalf = Math.min(2, size * 0.1);
    const cornerHalf = Math.min(1.5, size * 0.075);
    const center = size / 2;
    const squarePath = lineStyle === 'crosses'
      ? `M ${center - crossHalf} ${center} H ${center + crossHalf} M ${center} ${center - crossHalf} V ${center + crossHalf}`
      : lineStyle === 'corners'
        ? `M 0 0 L ${cornerHalf} ${cornerHalf} M ${size} 0 L ${size - cornerHalf} ${cornerHalf} M 0 ${size} L ${cornerHalf} ${size - cornerHalf} M ${size} ${size} L ${size - cornerHalf} ${size - cornerHalf}`
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
    if (lineStyle === 'crosses') { const crossHalf = Math.min(2, radius * 0.2); return <path key={index} d={`M ${cx - crossHalf} ${cy} H ${cx + crossHalf} M ${cx} ${cy - crossHalf} V ${cy + crossHalf}`} fill="none" stroke="currentColor" strokeWidth="1" />; }
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

export function MapViewport({ children, mapId, backgroundUrl, isOwner, mapPlacement, gridSettings, mapTokens = [], onMapPlacementChange, onTokenDrop, onTokensMove, onTokenLayerMove, onTokenLockChange, onTokenChange, onTokenDelete }: MapViewportProps) {
  const activeTool = useActiveSessionMapTool();
  const [view, setView] = useState<ViewTransform>(() => readStoredView(mapId));
  const [placement, setPlacement] = useState(mapPlacement);
  const [panning, setPanning] = useState(false);
  const [moveTargetAvailable, setMoveTargetAvailable] = useState(false);
  const panRef = useRef<PanGesture | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const tokenGestureRef = useRef<TokenGesture | null>(null);
  const tokenTransformGestureRef = useRef<TokenTransformGesture | null>(null);
  const [tokenDraftPositions, setTokenDraftPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [tokenDraftTransforms, setTokenDraftTransforms] = useState<Record<string, TokenTransform>>({});
  const [transformTokenId, setTransformTokenId] = useState<string | null>(null);
  const [tokenMenu, setTokenMenu] = useState<TokenMenu | null>(null);
  const placementRef = useRef(mapPlacement);
  const placementElementRef = useRef<HTMLDivElement>(null);
  const onMapPlacementChangeRef = useRef(onMapPlacementChange);
  onMapPlacementChangeRef.current = onMapPlacementChange;

  useEffect(() => registerSessionMapTokenDropHandler((visual, clientX, clientY) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect || clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom || !isOwner) return false;
    const size = gridSettings.cellSize;
    const rawPosition = {
      x: (clientX - rect.left - view.x) / view.scale - size / 2,
      y: (clientY - rect.top - view.y) / view.scale - size / 2,
    };
    onTokenDrop?.(visual, snapToSessionGrid(rawPosition, gridSettings, { width: size, height: size }), size);
    return true;
  }), [gridSettings, isOwner, onTokenDrop, view]);

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
    setTokenMenu(null);
    setTransformTokenId(null);
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

  const beginTokenMove = (event: ReactPointerEvent<HTMLButtonElement>, token: SessionMapToken) => {
    if (!isOwner || token.locked || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    setTransformTokenId(null);
    setTokenMenu(null);
    const tokenIndex = mapTokens.findIndex(candidate => candidate.id === token.id);
    const tokenPosition = tokenDraftPositions[token.id] ?? token;
    const tokenBounds = getTokenBounds(token, gridSettings.cellSize, tokenPosition);
    const carriedTokens = mapTokens.slice(tokenIndex + 1).filter(candidate => {
      const position = tokenDraftPositions[candidate.id] ?? candidate;
      return !candidate.locked && isBoundsFullyContained(getTokenBounds(candidate, gridSettings.cellSize, position), tokenBounds);
    });
    const origins = Object.fromEntries([token, ...carriedTokens].map(candidate => {
      const position = tokenDraftPositions[candidate.id] ?? candidate;
      return [candidate.id, { x: position.x, y: position.y }];
    }));
    tokenGestureRef.current = { pointerId: event.pointerId, tokenId: token.id, startX: event.clientX, startY: event.clientY, origins, positions: origins };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveToken = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const gesture = tokenGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const token = mapTokens.find(candidate => candidate.id === gesture.tokenId);
    if (!token) return;
    const size = getTokenSize(token, gridSettings.cellSize);
    const origin = gesture.origins[gesture.tokenId];
    const position = snapToSessionGrid({
      x: origin.x + (event.clientX - gesture.startX) / view.scale,
      y: origin.y + (event.clientY - gesture.startY) / view.scale,
    }, gridSettings, { width: size, height: size });
    const delta = { x: position.x - origin.x, y: position.y - origin.y };
    gesture.positions = Object.fromEntries(Object.entries(gesture.origins).map(([id, itemOrigin]) => [id, { x: itemOrigin.x + delta.x, y: itemOrigin.y + delta.y }]));
    setTokenDraftPositions(current => ({ ...current, ...gesture.positions }));
  };

  const finishTokenMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const gesture = tokenGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    tokenGestureRef.current = null;
    onTokensMove?.(gesture.positions);
    setTokenDraftPositions(current => {
      const next = { ...current };
      Object.keys(gesture.positions).forEach(id => delete next[id]);
      return next;
    });
  };

  const openTokenMenu = (event: ReactMouseEvent<HTMLButtonElement>, tokenId: string) => {
    if (!isOwner) return;
    event.preventDefault();
    event.stopPropagation();
    setTransformTokenId(null);
    const token = mapTokens.find(candidate => candidate.id === tokenId);
    const viewport = viewportRef.current;
    if (!viewport || !token) return;
    const position = tokenDraftTransforms[token.id] ?? tokenDraftPositions[token.id] ?? token;
    const size = tokenDraftTransforms[token.id]?.size ?? getTokenSize(token, gridSettings.cellSize);
    const rotation = tokenDraftTransforms[token.id]?.rotation ?? token.rotation ?? 0;
    const angle = rotation * Math.PI / 180;
    const boundsSize = size * (Math.abs(Math.cos(angle)) + Math.abs(Math.sin(angle)));
    const boundsX = position.x + (size - boundsSize) / 2;
    const boundsY = position.y + (size - boundsSize) / 2;
    const tokenLeft = view.x + boundsX * view.scale;
    const tokenRight = view.x + (boundsX + boundsSize) * view.scale;
    const preferredX = tokenRight + 12;
    const x = preferredX + 398 <= viewport.clientWidth ? preferredX : Math.max(8, tokenLeft - 398 - 12);
    const y = Math.max(8, Math.min(view.y + boundsY * view.scale, viewport.clientHeight - 300));
    setTokenMenu({ tokenId, x, y, panel: null, nameDraft: token.name });
  };

  const moveTokenLayer = (move: MapLayerMove) => {
    if (!tokenMenu) return;
    onTokenLayerMove?.(tokenMenu.tokenId, move);
    setTokenMenu(null);
  };

  const beginTokenTransform = (event: ReactPointerEvent<SVGElement>, token: SessionMapToken, kind: 'resize' | 'rotate') => {
    if (token.locked || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const current = tokenDraftTransforms[token.id];
    const origin = current ?? { x: token.x, y: token.y, size: getTokenSize(token, gridSettings.cellSize), rotation: token.rotation ?? 0 };
    const centerClientX = rect.left + view.x + (origin.x + origin.size / 2) * view.scale;
    const centerClientY = rect.top + view.y + (origin.y + origin.size / 2) * view.scale;
    const startDistance = Math.max(1, Math.hypot(event.clientX - centerClientX, event.clientY - centerClientY));
    const startAngle = Math.atan2(event.clientY - centerClientY, event.clientX - centerClientX);
    tokenTransformGestureRef.current = { pointerId: event.pointerId, tokenId: token.id, kind, centerClientX, centerClientY, startDistance, startAngle, origin, draft: origin };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveTokenTransform = (event: ReactPointerEvent<SVGElement>) => {
    const gesture = tokenTransformGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (gesture.kind === 'resize') {
      const distance = Math.hypot(event.clientX - gesture.centerClientX, event.clientY - gesture.centerClientY);
      const size = Math.min(2000, Math.max(8, gesture.origin.size * distance / gesture.startDistance));
      gesture.draft = {
        ...gesture.origin,
        x: gesture.origin.x + (gesture.origin.size - size) / 2,
        y: gesture.origin.y + (gesture.origin.size - size) / 2,
        size,
      };
    } else {
      const angle = Math.atan2(event.clientY - gesture.centerClientY, event.clientX - gesture.centerClientX);
      const rotation = gesture.origin.rotation + (angle - gesture.startAngle) * 180 / Math.PI;
      gesture.draft = { ...gesture.origin, rotation: Math.round(rotation * 10) / 10 };
    }
    setTokenDraftTransforms(current => ({ ...current, [gesture.tokenId]: gesture.draft }));
  };

  const finishTokenTransform = (event: ReactPointerEvent<SVGElement>) => {
    const gesture = tokenTransformGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    tokenTransformGestureRef.current = null;
    onTokenChange?.(gesture.tokenId, gesture.draft);
    setTokenDraftTransforms(current => {
      const next = { ...current };
      delete next[gesture.tokenId];
      return next;
    });
  };

  return <div
    ref={viewportRef}
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
      <div data-session-map-tokens className="pointer-events-none absolute inset-0 z-[3]">
        {mapTokens.map(token => {
          const transform = tokenDraftTransforms[token.id];
          const position = transform ?? tokenDraftPositions[token.id] ?? token;
          const size = transform?.size ?? getTokenSize(token, gridSettings.cellSize);
          const rotation = transform?.rotation ?? token.rotation ?? 0;
          const renderedSize = size * view.scale;
          const handleScreenSize = Math.min(12, Math.max(5, renderedSize * 0.12));
          const rotationHandleScreenSize = Math.min(18, Math.max(8, renderedSize * 0.16));
          const handleSize = handleScreenSize / view.scale;
          const rotationHandleSize = rotationHandleScreenSize / view.scale;
          const rotationLineLength = Math.min(36, Math.max(16, renderedSize * 0.3)) / view.scale;
          const selectionBorderWidth = 1.5 / view.scale;
          return <Fragment key={token.id}><button
            type="button"
            aria-label={`Token di ${token.name}`}
            data-map-interactive
            data-map-movable={isOwner && !token.locked ? 'true' : 'false'}
            className={`pointer-events-auto absolute touch-none border-0 bg-transparent p-0 ${isOwner ? token.locked ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing' : 'cursor-default'} ${token.locked ? 'drop-shadow-[0_0_3px_rgba(251,191,36,0.9)]' : ''}`}
            style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)`, opacity: isOwner && token.visible === false ? 0.45 : 1 }}
            onPointerDown={event => beginTokenMove(event, token)}
            onPointerMove={moveToken}
            onPointerUp={finishTokenMove}
            onPointerCancel={finishTokenMove}
            onContextMenu={event => openTokenMenu(event, token.id)}
          >
            <div style={{ transform: `rotate(${rotation}deg)` }}><TokenGhostShape entity={token} fallbackIcon={tokenFallback} size={size} /></div>
            {token.showLabel && <span className="pointer-events-none absolute left-1/2 top-full mt-0.5 max-w-48 -translate-x-1/2 whitespace-nowrap rounded-lg border border-[var(--dash-border)] px-2 py-1 text-xs font-semibold leading-none text-[var(--dash-text-strong)] shadow-lg backdrop-blur-sm" style={{ backgroundColor: token.labelColor ?? 'var(--dash-surface)' }}>{token.name}</span>}
          </button>
          {isOwner && transformTokenId === token.id && !token.locked && <svg data-map-interactive className="pointer-events-none absolute z-20 overflow-visible" width={size} height={size + rotationLineLength + rotationHandleSize / 2} viewBox={`0 0 ${size} ${size + rotationLineLength + rotationHandleSize / 2}`} style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0) rotate(${rotation}deg)`, transformOrigin: `${size / 2}px ${size / 2}px` }}>
            <path d={`M 0 0 H ${size} V ${size} H 0 Z M ${size / 2} ${size} V ${size + rotationLineLength}`} fill="none" stroke="#67e8f9" strokeWidth={selectionBorderWidth} />
            {([[0, 0], [size, 0], [0, size], [size, size]] as const).map(([x, y], index) => <rect key={index} role="slider" aria-label="Ridimensiona token" tabIndex={0} className="pointer-events-auto cursor-nwse-resize" x={x - handleSize / 2} y={y - handleSize / 2} width={handleSize} height={handleSize} fill="white" stroke="#06b6d4" strokeWidth={selectionBorderWidth} transform={`rotate(${-rotation} ${x} ${y})`} onPointerDown={event => beginTokenTransform(event, token, 'resize')} onPointerMove={moveTokenTransform} onPointerUp={finishTokenTransform} onPointerCancel={finishTokenTransform} />)}
            <circle role="slider" aria-label="Ruota token" tabIndex={0} className="pointer-events-auto cursor-grab active:cursor-grabbing" cx={size / 2} cy={size + rotationLineLength} r={rotationHandleSize / 2} fill="#06b6d4" stroke="white" strokeWidth={2 / view.scale} transform={`rotate(${-rotation} ${size / 2} ${size + rotationLineLength})`} onPointerDown={event => beginTokenTransform(event, token, 'rotate')} onPointerMove={moveTokenTransform} onPointerUp={finishTokenTransform} onPointerCancel={finishTokenTransform} />
          </svg>}
          </Fragment>;
        })}
      </div>
    </div>
    {tokenMenu && (() => {
      const token = mapTokens.find(candidate => candidate.id === tokenMenu.tokenId);
      if (!token) return null;
      const iconClass = 'grid h-10 w-10 place-items-center rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] text-[var(--dash-muted)] hover:border-[var(--dash-accent)] hover:text-[var(--dash-text-strong)] disabled:cursor-not-allowed disabled:opacity-30';
      const commitName = () => {
        const name = tokenMenu.nameDraft.trim();
        if (name && name !== token.name) onTokenChange?.(token.id, { name });
      };
      return <div
        data-map-interactive
        role="menu"
        className="absolute z-50 w-[min(92vw,390px)] rounded-xl border border-[var(--dash-border)] bg-[var(--dash-panel)]/95 p-3 text-xs text-[var(--dash-text)] shadow-2xl backdrop-blur"
        style={{ left: tokenMenu.x, top: tokenMenu.y }}
        onPointerDown={event => event.stopPropagation()}
      >
        <div className="mb-3 flex flex-wrap gap-1.5">
          <button type="button" title={token.visible === false ? 'Mostra ai giocatori' : 'Nascondi ai giocatori'} aria-label={token.visible === false ? 'Mostra token ai giocatori' : 'Nascondi token ai giocatori'} onClick={() => onTokenChange?.(token.id, { visible: token.visible === false })} className={iconClass}>{token.visible === false ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button>
          <button type="button" title={token.locked ? 'Sblocca' : 'Blocca'} aria-label={token.locked ? 'Sblocca token' : 'Blocca token'} onClick={() => onTokenLockChange?.(token.id, !token.locked)} className={iconClass}>{token.locked ? <Unlock className="h-5 w-5" /> : <Lock className="h-5 w-5" />}</button>
          <button type="button" disabled title="Illuminazione: disponibile con la nebbia" aria-label="Illuminazione non ancora disponibile" className={iconClass}><Flashlight className="h-5 w-5" /></button>
          <button type="button" disabled={token.locked} title="Dimensione e rotazione" aria-label="Dimensione e rotazione" onClick={() => { setTransformTokenId(token.id); setTokenMenu(null); }} className={iconClass}><Maximize2 className="h-5 w-5" /></button>
          <button type="button" disabled title="Condizioni: non ancora disponibili" aria-label="Condizioni non ancora disponibili" className={iconClass}><Skull className="h-5 w-5" /></button>
          <button type="button" title="Colore etichetta" aria-label="Colore etichetta" onClick={() => setTokenMenu(current => current ? { ...current, panel: current.panel === 'colors' ? null : 'colors' } : null)} className={iconClass}><Palette className="h-5 w-5" /></button>
          <button type="button" title="Livelli" aria-label="Livelli" onClick={() => setTokenMenu(current => current ? { ...current, panel: current.panel === 'layers' ? null : 'layers' } : null)} className={iconClass}><Layers3 className="h-5 w-5" /></button>
          <button type="button" title="Elimina token" aria-label="Elimina token" onClick={() => { onTokenDelete?.(token.id); setTokenMenu(null); }} className={`${iconClass} text-red-300 hover:bg-red-500/15 hover:text-red-200`}><Trash2 className="h-5 w-5" /></button>
        </div>
        <div className="flex gap-2">
          <input value={tokenMenu.nameDraft} onChange={event => setTokenMenu(current => current ? { ...current, nameDraft: event.target.value } : null)} onBlur={commitName} onKeyDown={event => { if (event.key === 'Enter') { commitName(); event.currentTarget.blur(); } }} aria-label="Nome token" className="h-10 min-w-0 flex-1 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 text-sm text-[var(--dash-text-strong)] outline-none focus:border-[var(--dash-accent)]" />
          <button type="button" title={token.showLabel ? 'Nascondi nome sotto il token' : 'Mostra nome sotto il token'} aria-label={token.showLabel ? 'Nascondi etichetta token' : 'Mostra etichetta token'} onClick={() => onTokenChange?.(token.id, { showLabel: !token.showLabel })} className={`${iconClass} shrink-0 ${token.showLabel ? 'bg-cyan-400/20 text-cyan-200' : ''}`}>{token.showLabel ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}</button>
        </div>
        {tokenMenu.panel === 'colors' && <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--dash-border-soft)] pt-3"><span className="text-[var(--dash-muted)]">Sfondo del nome</span><div className="flex flex-wrap justify-end gap-1.5">{TOKEN_LABEL_COLORS.map(color => <button key={color} type="button" aria-label={`Colore etichetta ${color}`} onClick={() => onTokenChange?.(token.id, { labelColor: color })} className={`h-5 w-5 rounded-full border-2 ${token.labelColor === color ? 'border-[var(--dash-text-strong)]' : 'border-transparent'}`} style={{ backgroundColor: color }} />)}</div></div>}
        {tokenMenu.panel === 'layers' && <div className="mt-3 grid grid-cols-2 gap-1.5 border-t border-[var(--dash-border-soft)] pt-3"><button type="button" onClick={() => moveTokenLayer('forward')} className="rounded bg-[var(--dash-surface-2)] px-2 py-2 hover:text-[var(--dash-text-strong)]">Porta sopra</button><button type="button" onClick={() => moveTokenLayer('backward')} className="rounded bg-[var(--dash-surface-2)] px-2 py-2 hover:text-[var(--dash-text-strong)]">Porta sotto</button><button type="button" onClick={() => moveTokenLayer('front')} className="rounded bg-[var(--dash-surface-2)] px-2 py-2 hover:text-[var(--dash-text-strong)]">In primo piano</button><button type="button" onClick={() => moveTokenLayer('back')} className="rounded bg-[var(--dash-surface-2)] px-2 py-2 hover:text-[var(--dash-text-strong)]">In fondo</button></div>}
      </div>;
    })()}
  </div>;
}
