import { Fragment, useEffect, useMemo, useRef, useState, type FocusEvent as ReactFocusEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent } from 'react';
import { configureSessionMapCenter, configureSessionMapFit, configureSessionMapFogClear, configureSessionMapFogCoverFullMap, configureSessionMapFogSelectionClear, getSessionMapCurrentUserId, hydrateSessionMapFogStyle, setActiveSessionMapTool, setSessionMapCalibrationActive, setSessionMapFogFullMapCovered, setSessionMapSelectionArmed, updateSessionGrid, updateSessionMapFogSettings, useActiveSessionMapTool, useSessionMapCalibrationActive, useSessionMapDrawSettings, useSessionMapFogSettings, useSessionMapMeasureMode, useSessionMapMeasurementsVisibleToAll, useSessionMapSelectionArmed, useSessionMapSelectionMode, type SessionMapDrawMode, type SessionMapFitMode, type SessionMapFogMode, type SessionMapTool } from './mapToolStore';
import { useCampaignChannel } from '../../../services/realtime/campaignChannel';
import type { SessionGridSettings } from '../../../types/mapGeometry';
import { snapToSessionGrid, type GridObjectSize } from './mapGridSnap';
import type { SessionMapToken, SessionMapTokenCondition, SessionMapTokenVisual } from '../../../types/sessionMapToken';
import type { SessionMapDrawing, SessionMapDrawingKind, SessionMapPoint } from '../../../types/sessionMapDrawing';
import type { SessionMapPoi } from '../../../types/sessionMapPoi';
import type { SessionMapFog, SessionMapFogKind } from '../../../types/sessionMapFog';
import { registerSessionMapTokenDropHandler } from './sessionMapTokenDropStore';
import { TokenGhostShape } from '../shared/TokenGhostShape';
import { MARGIN_SCALE } from '../shared/tokenShapes';
import { getRotatedRectBounds, getRotatedSquareBounds, isBoundsFullyContained, pointInPolygon, polygonCoverage, reconcileMapObjectOrder, rectangleCoverage, type MapLayerMove, type MapObjectRef } from './mapObjectLayers';
import { Accessibility, AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowRight, ArrowUp, BatteryLow, Bed, Biohazard, Bold, ChevronsDown, ChevronsUp, CircleX, ClipboardCopy, ClipboardPaste, CloudFog, Cog, EarOff, Eye, EyeOff, Flashlight, Ghost, GripHorizontal, Hand, Heart, HeartCrack, Italic, Layers3, Link, Lock, LockKeyhole, Magnet, Maximize2, Minus, Mountain, Orbit, Palette, Pin, Plus, ScanEye, Shapes, Skull, Slash, SlidersHorizontal, Spline, Star, Strikethrough, Trash2, Type, Underline, Unlock, UserRoundX, X, type LucideIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { Copy } from '../IconeCopia';
import { NoteIconGlyph, NoteIconGrid } from './shared/NoteIconGrid';
import { ContextHint } from './shared/ContextHint';
import { computeVisibilityPolygon, filterSegmentsNearCircle, type AnalysisSegment } from '../../../lib/battleMapAnalysis';
import { detectRoomAtPoint, preloadRoomFillImage } from '../../../lib/battleMapAnalysis';
import { requestSessionNoteOpen } from './sessionNoteBrowserEvents';
import { projectId } from '/utils/supabase/info';
import polygonClipping from 'polygon-clipping';

const MIN_SCALE = 0.3;
const MAX_SCALE = 6;
const ZOOM_SENSITIVITY = 0.0008;
const MAP_WORLD_WIDTH = 10_000;
const MAP_WORLD_HEIGHT = 7_000;
const CONDITION_BADGE_SIZE_RATIO = 0.18;
const CONDITION_BADGE_TOKEN_GAP_RATIO = 0.012;
const CONDITION_BADGE_GAP_RATIO = 0.1;
const CONDITION_MAX_ARC = Math.PI * 1.7;
const CONDITION_ICON_ADJUSTMENTS: Record<string, { x: number; y: number }> = {
  blinded: { x: 0.025, y: 0 },
  charmed: { x: 0.025, y: 0 },
  deafened: { x: 0, y: 0.025 },
  exhausted: { x: 0.036, y: 0 },
  grappled: { x: -0.025, y: 0 },
  invisible: { x: 0.03, y: 0 },
  petrified: { x: 0.025, y: 0 },
  poisoned: { x: 0, y: 0.025 },
  bloodied: { x: 0, y: 0.045 },
  unconscious: { x: 0, y: -0.03 },
  prone: { x: 0, y: -0.05 },
};

function RadiusStepper({ value, unit, onChange }: { value: number; unit: string; onChange: (value: number) => void }) {
  const update = (next: number) => onChange(Math.max(0, Number.isFinite(next) ? next : 0));
  return <div className="mt-3 flex items-center gap-2">
    <span className="w-12 text-[var(--dash-muted)]">Raggio</span>
    <div className="flex min-w-0 flex-1 items-stretch overflow-hidden rounded-md border border-[var(--dash-border)] bg-[var(--dash-input)] focus-within:border-[var(--dash-accent)]">
      <button type="button" aria-label="Diminuisci raggio" onClick={() => update(value - 0.5)} className="flex w-8 shrink-0 items-center justify-center text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)]"><Minus className="h-3.5 w-3.5" /></button>
      <input aria-label="Raggio" type="number" min="0" step="0.5" value={value} onChange={(event) => update(Number(event.target.value))} className="min-w-0 flex-1 appearance-none border-x border-[var(--dash-border)] bg-transparent px-2 py-1.5 text-center text-[var(--dash-text-strong)] outline-none [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none" />
      <button type="button" aria-label="Aumenta raggio" onClick={() => update(value + 0.5)} className="flex w-8 shrink-0 items-center justify-center text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)]"><Plus className="h-3.5 w-3.5" /></button>
    </div>
    <span className="max-w-20 truncate text-[var(--dash-muted)]">{unit}</span>
  </div>;
}

function ConeAngleStepper({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const update = (next: number) => onChange(Math.min(180, Math.max(5, Number.isFinite(next) ? next : 60)));
  return <div className="mt-2 flex items-center gap-2">
    <span className="w-12 text-[var(--dash-muted)]">Apertura</span>
    <div className="flex min-w-0 flex-1 items-stretch overflow-hidden rounded-md border border-[var(--dash-border)] bg-[var(--dash-input)] focus-within:border-[var(--dash-accent)]">
      <button type="button" aria-label="Diminuisci apertura cono" onClick={() => update(value - 5)} className="flex w-8 shrink-0 items-center justify-center text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)]"><Minus className="h-3.5 w-3.5" /></button>
      <input aria-label="Apertura cono" type="number" min="5" max="180" step="5" value={value} onChange={(event) => update(Number(event.target.value))} className="min-w-0 flex-1 appearance-none border-x border-[var(--dash-border)] bg-transparent px-2 py-1.5 text-center text-[var(--dash-text-strong)] outline-none [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
      <button type="button" aria-label="Aumenta apertura cono" onClick={() => update(value + 5)} className="flex w-8 shrink-0 items-center justify-center text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)]"><Plus className="h-3.5 w-3.5" /></button>
    </div>
    <span className="text-[var(--dash-muted)]">°</span>
  </div>;
}

function LightingShapeControls({ shape, coneAngle, onChange }: { shape?: 'circle' | 'cone'; coneAngle?: number; onChange: (update: { shape?: 'circle' | 'cone'; coneAngle?: number }) => void }) {
  const activeShape = shape ?? 'circle';
  return <>
    <div className="mt-2 grid grid-cols-2 gap-2" aria-label="Forma sorgente">
      {([['circle', 'Circolare'], ['cone', 'Conica']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={activeShape === value} onClick={() => onChange({ shape: value, ...(value === 'cone' && coneAngle === undefined ? { coneAngle: 60 } : {}) })} className={`rounded-md border px-2 py-1.5 text-[10px] font-semibold transition ${activeShape === value ? 'border-cyan-400 bg-cyan-400/15 text-cyan-100' : 'border-[var(--dash-border)] bg-[var(--dash-input)] text-[var(--dash-muted)] hover:text-[var(--dash-text-strong)]'}`}>{label}</button>)}
    </div>
    {activeShape === 'cone' && <ConeAngleStepper value={coneAngle ?? 60} onChange={(value) => onChange({ coneAngle: value })} />}
  </>;
}
const PAN_ENABLED_TOOLS = new Set<SessionMapTool>(['move', 'grid', 'pin', 'pointer']);

type ViewTransform = { x: number; y: number; scale: number };
export type MapPlacement = {
  x: number;
  y: number;
  locked: boolean;
  width?: number;
  height?: number;
};
type PanGesture = {
  pointerId: number;
  target: 'view' | 'map';
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  objectSize: GridObjectSize;
};
type TokenPosition = { x: number; y: number };
type TokenGesture = {
  pointerId: number;
  tokenId: string;
  startX: number;
  startY: number;
  origins: Record<string, TokenPosition>;
  positions: Record<string, TokenPosition>;
  drawingOrigins: Record<string, TokenPosition>;
  drawingPositions: Record<string, TokenPosition>;
};
type DrawingMoveGesture = {
  pointerId: number;
  id: string;
  startX: number;
  startY: number;
  origins: Record<string, TokenPosition>;
  positions: Record<string, TokenPosition>;
  tokenOrigins: Record<string, TokenPosition>;
  tokenPositions: Record<string, TokenPosition>;
};
type TokenMenu = {
  tokenId: string;
  x: number;
  y: number;
  panel: 'layers' | 'colors' | 'magnets' | 'conditions' | 'lighting' | null;
  nameDraft: string;
  customConditionDraft: string;
};
type TokenTransform = TokenPosition & { size: number; rotation: number };
type TokenTransformGesture = {
  pointerId: number;
  tokenId: string;
  kind: 'resize' | 'rotate';
  centerClientX: number;
  centerClientY: number;
  startDistance: number;
  startAngle: number;
  origins: Record<string, TokenTransform>;
  drafts: Record<string, TokenTransform>;
};
type SelectionPoint = { x: number; y: number };
type SelectionGesture = {
  pointerId: number;
  mode: 'rectangle' | 'freehand';
  start: SelectionPoint;
  current: SelectionPoint;
  points: SelectionPoint[];
};
type VisualMeasurement = {
  id: string;
  pointerId: number;
  mode: 'line' | 'circle' | 'cone';
  start: SelectionPoint;
  end: SelectionPoint;
  fading?: boolean;
};
type DrawingGesture = {
  pointerId: number;
  mode: Exclude<SessionMapDrawMode, 'grab' | 'polygon' | 'eraser'>;
  start: SessionMapPoint;
  current: SessionMapPoint;
  points: SessionMapPoint[];
};
type FogGesture = { pointerId: number; mode: Exclude<SessionMapFogMode, 'grab' | 'room-fill' | 'quick-select' | 'polygon' | 'cutter'>; start: SessionMapPoint; current: SessionMapPoint; points: SessionMapPoint[] };

interface MapViewportProps {
  campaignId?: string;
  children: ReactNode;
  mapId: string;
  backgroundUrl?: string | null;
  isOwner: boolean;
  currentUserId?: string | null;
  currentUserAccessToken?: string | null;
  mapPlacement: MapPlacement;
  gridSettings: SessionGridSettings;
  mapTokens?: SessionMapToken[];
  mapDrawings?: SessionMapDrawing[];
  mapFog?: SessionMapFog[];
  mapPois?: SessionMapPoi[];
  mapObjectOrder?: MapObjectRef[];
  onPoiCreate?: (position: TokenPosition) => void;
  onPoiMove?: (poiId: string, position: TokenPosition) => void;
  onPoiChange?: (poiId: string, update: Partial<SessionMapPoi>) => void;
  onPoiDelete?: (poiId: string) => void;
  onPoiDuplicate?: (poiId: string) => void;
  onPoiPaste?: (source: SessionMapPoi, position: TokenPosition) => void;
  onPoiLayerMove?: (poiId: string, move: MapLayerMove) => void;
  onDrawingCreate?: (drawing: SessionMapDrawing) => void;
  onDrawingChange?: (drawingId: string, update: Partial<SessionMapDrawing>) => void;
  onDrawingsChange?: (drawingIds: string[], update: Partial<SessionMapDrawing>) => void;
  onDrawingsMove?: (positions: Record<string, TokenPosition>) => void;
  onDrawingTransformsChange?: (updates: Record<string, Partial<SessionMapDrawing>>) => void;
  onDrawingDelete?: (drawingId: string) => void;
  onDrawingsDelete?: (drawingIds: string[]) => void;
  onDrawingDuplicate?: (drawingId: string) => void;
  onDrawingsDuplicate?: (drawingIds: string[]) => void;
  onDrawingLayerMove?: (drawingId: string, move: MapLayerMove) => void;
  onDrawingsLayerMove?: (drawingIds: string[], move: MapLayerMove) => void;
  onDrawingsCreateMagnetGroup?: (drawingIds: string[]) => void;
  onDrawingMagnetDisable?: (drawingId: string) => void;
  onFogCreate?: (fog: SessionMapFog) => void;
  onFogReplaceAll?: (fog: SessionMapFog[]) => void;
  onFogChange?: (fogId: string, update: Partial<SessionMapFog>) => void;
  onFogsChange?: (fogIds: string[], update: Partial<SessionMapFog>) => void;
  onFogsMove?: (updates: Record<string, Partial<SessionMapFog>>) => void;
  onFogTransformsChange?: (updates: Record<string, Partial<SessionMapFog>>) => void;
  onFogExplorationChange?: (updates: Record<string, Partial<SessionMapFog>>) => void;
  onFogDelete?: (fogId: string) => void;
  onFogsDelete?: (fogIds: string[]) => void;
  onFogCoverFullMap?: (fog: SessionMapFog) => void;
  onMapPlacementChange?: (placement: MapPlacement) => void;
  onTokenDrop?: (visual: SessionMapTokenVisual, position: TokenPosition, size: number) => void;
  onTokensMove?: (positions: Record<string, TokenPosition>) => void;
  onTokenMovePreview?: (positions: Record<string, TokenPosition>, finished?: boolean) => void;
  remoteTokenPositions?: Record<string, TokenPosition>;
  onTokenLayerMove?: (tokenId: string, move: MapLayerMove) => void;
  onTokensLayerMove?: (tokenIds: string[], move: MapLayerMove) => void;
  onTokenLockChange?: (tokenId: string, locked: boolean) => void;
  onTokenChange?: (tokenId: string, update: Partial<SessionMapToken>) => void;
  onTokensChange?: (tokenIds: string[], update: Partial<SessionMapToken>) => void;
  onTokenTransformsChange?: (updates: Record<string, Partial<SessionMapToken>>) => void;
  onTokenDelete?: (tokenId: string) => void;
  onTokensDelete?: (tokenIds: string[]) => void;
  onTokensCreateMagnetGroup?: (tokenIds: string[]) => void;
  onTokenMagnetEnabledChange?: (tokenId: string, enabled: boolean) => void;
  onTokenMagnetLink?: (tokenId: string, otherTokenId: string) => void;
  onTokenMagnetUnlink?: (tokenId: string) => void;
}

function drawingLineDash(style: SessionMapDrawing['style']['lineStyle']) {
  return style === 'dashed' ? '10 7' : style === 'dotted' ? '1 7' : style === 'dash-dot' ? '12 6 2 6' : style === 'long-dash' ? '20 8' : undefined;
}

function toggleLightEffect(current: 'flicker' | 'radiant' | 'flicker-radiant' | undefined, toggled: 'flicker' | 'radiant') {
  const flicker = current === 'flicker' || current === 'flicker-radiant';
  const radiant = current === 'radiant' || current === 'flicker-radiant';
  const nextFlicker = toggled === 'flicker' ? !flicker : flicker;
  const nextRadiant = toggled === 'radiant' ? !radiant : radiant;
  return nextFlicker && nextRadiant ? 'flicker-radiant' as const : nextFlicker ? 'flicker' as const : nextRadiant ? 'radiant' as const : undefined;
}

const LIGHT_FLICKER_PRESETS = [
  ['none', 'Nessun tremolio'],
  ['candle', 'Candela'],
  ['torch', 'Torcia'],
  ['embers', 'Braci'],
  ['magic', 'Magica'],
  ['storm', 'Tempesta'],
] as const;

function flickerGradientStops(preset: 'candle' | 'torch' | 'embers' | 'magic' | 'storm' | undefined, radiant: boolean) {
  const inner = radiant ? 0.3 : 0;
  if (preset === 'candle') return <><stop offset={inner} stopColor="black" /><stop offset={radiant ? 0.64 : 0.78} stopColor="#101010"><animate attributeName="offset" values={radiant ? '0.61;0.66;0.63;0.67;0.61' : '0.76;0.81;0.78;0.82;0.76'} dur="4.2s" calcMode="spline" keyTimes="0;0.25;0.5;0.75;1" keySplines=".4 0 .6 1;.4 0 .6 1;.4 0 .6 1;.4 0 .6 1" repeatCount="indefinite" /></stop><stop offset="1" stopColor="white" /></>;
  if (preset === 'embers') return <><stop offset={inner} stopColor="#181818" /><stop offset={radiant ? 0.52 : 0.68} stopColor="#484848"><animate attributeName="stop-color" values="#484848;#090909;#202020;#484848" keyTimes="0;0.08;0.22;1" dur="5.8s" calcMode="discrete" repeatCount="indefinite" /></stop><stop offset={radiant ? 0.72 : 0.84} stopColor="#777" /><stop offset="1" stopColor="white" /></>;
  if (preset === 'magic') return <><stop offset={inner} stopColor="black" /><stop offset={radiant ? 0.58 : 0.72} stopColor="#101010"><animate attributeName="stop-color" values="#080808;#606060;#080808" dur="3.4s" calcMode="spline" keyTimes="0;0.5;1" keySplines=".4 0 .6 1;.4 0 .6 1" repeatCount="indefinite" /></stop><stop offset={radiant ? 0.78 : 0.88} stopColor="#888"><animate attributeName="offset" values={radiant ? '0.72;0.82;0.72' : '0.84;0.92;0.84'} dur="3.4s" repeatCount="indefinite" /></stop><stop offset="1" stopColor="white" /></>;
  if (preset === 'storm') return <><stop offset={inner} stopColor="#333" /><stop offset={radiant ? 0.66 : 0.8} stopColor="#666"><animate attributeName="stop-color" values="#666;#020202;#666;#090909;#666;#040404;#666;#111;#666" keyTimes="0;0.03;0.07;0.31;0.34;0.41;0.76;0.79;1" dur="7.3s" calcMode="discrete" repeatCount="indefinite" /><animate attributeName="offset" values={radiant ? '0.66;0.74;0.63;0.7;0.66' : '0.8;0.9;0.77;0.86;0.8'} keyTimes="0;0.11;0.38;0.81;1" dur="5.1s" calcMode="discrete" repeatCount="indefinite" /></stop><stop offset="1" stopColor="white" /></>;
  return <><stop offset={inner} stopColor="black" /><stop offset={radiant ? 0.54 : 0.68} stopColor="#101010"><animate attributeName="stop-color" values="#101010;#2d2d2d;#080808;#242424;#101010" dur="2.1s" repeatCount="indefinite" /></stop><stop offset={radiant ? 0.68 : 0.82} stopColor="#181818"><animate attributeName="offset" values={radiant ? '0.62;0.73;0.66;0.71;0.62' : '0.76;0.87;0.8;0.85;0.76'} dur="2.7s" repeatCount="indefinite" /></stop><stop offset="1" stopColor="white" /></>;
}

function measureMapText(text: NonNullable<SessionMapDrawing['text']>, strokeWidth: number) {
  const lines = text.content.split(/\r?\n/);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (context) context.font = `${text.italic ? 'italic ' : ''}${text.bold ? '700 ' : ''}${text.fontSize}px ${text.fontFamily}`;
  const width = Math.max(...lines.map((line) => context?.measureText(line).width ?? line.length * text.fontSize * 0.6), 1) + Math.max(1, strokeWidth / 2);
  const height = Math.max(text.fontSize * 1.15 * lines.length, text.fontSize);
  const horizontalScale = text.horizontalScale ?? 1;
  return text.orientation === 'vertical'
    ? {
        width: Math.ceil(Math.max(text.fontSize * 1.15 * lines.length, text.fontSize) * horizontalScale + Math.max(1, strokeWidth / 2)),
        height: Math.ceil(Math.max(...lines.map((line) => Math.max(line.length, 1))) * text.fontSize * 1.15 + Math.max(1, strokeWidth / 2)),
      }
    : { width: Math.ceil(width * horizontalScale), height: Math.ceil(height) };
}

function withMeasuredTextBounds(drawing: SessionMapDrawing) {
  return drawing.kind === 'text' && drawing.text ? { ...drawing, ...measureMapText(drawing.text, drawing.style.strokeWidth) } : drawing;
}

function pointSegmentDistance(point: SessionMapPoint, start: SessionMapPoint, end: SessionMapPoint) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const position = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - (start.x + position * dx), point.y - (start.y + position * dy));
}

function simplifyPathPoints(points: SessionMapPoint[], tolerance: number): SessionMapPoint[] {
  if (points.length <= 2) return points.map((point) => ({ ...point }));
  let farthestIndex = 0;
  let farthestDistance = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = pointSegmentDistance(points[index], points[0], points[points.length - 1]);
    if (distance > farthestDistance) {
      farthestDistance = distance;
      farthestIndex = index;
    }
  }
  if (farthestDistance <= tolerance) return [{ ...points[0] }, { ...points[points.length - 1] }];
  const before = simplifyPathPoints(points.slice(0, farthestIndex + 1), tolerance);
  const after = simplifyPathPoints(points.slice(farthestIndex), tolerance);
  return [...before.slice(0, -1), ...after];
}

function convertDrawingToPath(drawing: SessionMapDrawing): SessionMapPoint[] {
  if (drawing.kind === 'rectangle')
    return [
      { x: 0, y: 0 },
      { x: drawing.width, y: 0 },
      { x: drawing.width, y: drawing.height },
      { x: 0, y: drawing.height },
    ];
  if (drawing.kind === 'triangle')
    return [
      { x: drawing.width / 2, y: 0 },
      { x: drawing.width, y: drawing.height },
      { x: 0, y: drawing.height },
    ];
  if (drawing.kind === 'hexagon')
    return [
      { x: drawing.width * 0.25, y: 0 },
      { x: drawing.width * 0.75, y: 0 },
      { x: drawing.width, y: drawing.height / 2 },
      { x: drawing.width * 0.75, y: drawing.height },
      { x: drawing.width * 0.25, y: drawing.height },
      { x: 0, y: drawing.height / 2 },
    ];
  if (drawing.kind === 'circle') {
    const count = Math.max(12, Math.min(32, Math.round((Math.PI * Math.max(drawing.width, drawing.height)) / 24)));
    return Array.from({ length: count }, (_, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
      return { x: drawing.width / 2 + (Math.cos(angle) * drawing.width) / 2, y: drawing.height / 2 + (Math.sin(angle) * drawing.height) / 2 };
    });
  }
  return drawing.points?.map((point) => ({ ...point })) ?? [];
}

function drawingVisualCenter(drawing: SessionMapDrawing) {
  const rotationCenter = { x: drawing.width / 2, y: drawing.height / 2 };
  if (!drawing.points?.length) return rotationCenter;
  const angle = (drawing.rotation * Math.PI) / 180;
  const rotatedPoints = drawing.points.map((point) => {
    const dx = point.x - rotationCenter.x;
    const dy = point.y - rotationCenter.y;
    return {
      x: rotationCenter.x + dx * Math.cos(angle) - dy * Math.sin(angle),
      y: rotationCenter.y + dx * Math.sin(angle) + dy * Math.cos(angle),
    };
  });
  return {
    x: (Math.min(...rotatedPoints.map((point) => point.x)) + Math.max(...rotatedPoints.map((point) => point.x))) / 2,
    y: (Math.min(...rotatedPoints.map((point) => point.y)) + Math.max(...rotatedPoints.map((point) => point.y))) / 2,
  };
}

function pointInsidePolygon(point: SessionMapPoint, polygon: SessionMapPoint[]) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index];
    const b = polygon[previous];
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function segmentsIntersect(a: SessionMapPoint, b: SessionMapPoint, c: SessionMapPoint, d: SessionMapPoint) {
  const cross = (p: SessionMapPoint, q: SessionMapPoint, r: SessionMapPoint) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  const boundsOverlap = Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) <= Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) && Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) <= Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y));
  return boundsOverlap && abC * abD <= 0 && cdA * cdB <= 0;
}

function drawingWorldPoints(drawing: SessionMapDrawing) {
  if (!drawing.points?.length) return [];
  const center = { x: drawing.width / 2, y: drawing.height / 2 };
  const angle = (drawing.rotation * Math.PI) / 180;
  return drawing.points.map((point) => {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    return { x: drawing.x + center.x + dx * Math.cos(angle) - dy * Math.sin(angle), y: drawing.y + center.y + dx * Math.sin(angle) + dy * Math.cos(angle) };
  });
}

function drawingPathIntersectsPolygon(drawing: SessionMapDrawing, selection: SessionMapPoint[]) {
  const points = drawingWorldPoints(drawing);
  if (points.length < 2 || selection.length < 3) return false;
  if (points.some((point) => pointInsidePolygon(point, selection))) return true;
  const drawingSegments = points.slice(0, -1).map((point, index) => [point, points[index + 1]] as const);
  if (drawing.kind === 'polygon') drawingSegments.push([points[points.length - 1], points[0]]);
  const selectionSegments = selection.map((point, index) => [point, selection[(index + 1) % selection.length]] as const);
  if (drawingSegments.some(([a, b]) => selectionSegments.some(([c, d]) => segmentsIntersect(a, b, c, d)))) return true;
  return drawing.kind === 'polygon' && selection.some((point) => pointInsidePolygon(point, points));
}

function textCurveControlCount(content: string) {
  const characterCount = Array.from(content.replace(/\s/g, '')).length;
  return characterCount <= 1 ? 0 : characterCount <= 4 ? 1 : characterCount <= 24 ? 5 : 7;
}

function normalizedTextCurveOffsets(text: NonNullable<SessionMapDrawing['text']>) {
  const count = textCurveControlCount(text.content);
  const source = text.curveOffsets ?? [];
  if (source.length === count) return source;
  if (source.length === 0) return Array.from({ length: count }, () => 0);
  const values = [0, ...source, 0];
  return Array.from({ length: count }, (_, index) => {
    const sourcePosition = ((index + 1) / (count + 1)) * (source.length + 1);
    const lower = Math.floor(sourcePosition);
    const fraction = sourcePosition - lower;
    return (values[lower] ?? 0) * (1 - fraction) + (values[lower + 1] ?? 0) * fraction;
  });
}

function curvedTextPath(drawing: SessionMapDrawing) {
  if (!drawing.text) return '';
  const vertical = drawing.text.orientation === 'vertical';
  const offsets = normalizedTextCurveOffsets(drawing.text);
  const values = [0, ...offsets, 0];
  const segments = offsets.length + 1;
  const endPadding = drawing.text.fontSize * 0.45;
  const points = values.map((offset, index) => (vertical ? { x: drawing.width / 2 + offset, y: -endPadding + ((drawing.height + endPadding * 2) * index) / segments } : { x: -endPadding + ((drawing.width + endPadding * 2) * index) / segments, y: Math.min(drawing.height, drawing.text!.fontSize) + offset }));
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[Math.max(0, index - 1)];
    const current = points[index];
    const next = points[index + 1];
    const following = points[Math.min(points.length - 1, index + 2)];
    const control1 = { x: current.x + (next.x - previous.x) / 6, y: current.y + (next.y - previous.y) / 6 };
    const control2 = { x: next.x - (following.x - current.x) / 6, y: next.y - (following.y - current.y) / 6 };
    path += ` C ${control1.x} ${control1.y} ${control2.x} ${control2.y} ${next.x} ${next.y}`;
  }
  return path;
}

function drawingGraphic(drawing: SessionMapDrawing, interactive = false, highlighted = false) {
  const dash = drawingLineDash(drawing.style.lineStyle);
  const common = {
    fill: drawing.kind === 'line' || drawing.kind === 'freehand' ? 'none' : drawing.style.fillColor,
    fillOpacity: drawing.style.fillOpacity,
    stroke: drawing.style.strokeColor,
    strokeWidth: drawing.style.strokeWidth,
    strokeDasharray: dash,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    vectorEffect: 'non-scaling-stroke' as const,
    opacity: drawing.style.opacity,
    filter: highlighted ? 'drop-shadow(0 0 2px #22d3ee) drop-shadow(0 0 5px rgba(34,211,238,.95))' : undefined,
  };
  const points = drawing.points?.map((point) => `${point.x},${point.y}`).join(' ') ?? '';
  const hit = interactive ? { className: 'pointer-events-auto', style: { cursor: 'pointer' } } : {};
  if (drawing.kind === 'text' && drawing.text) {
    const decoration = [drawing.text.underline ? 'underline' : '', drawing.text.strike ? 'line-through' : ''].filter(Boolean).join(' ');
    const horizontalScale = drawing.text.horizontalScale ?? 1;
    const curved = normalizedTextCurveOffsets(drawing.text).some((offset) => Math.abs(offset) > 0.1);
    if (curved) {
      const pathId = `map-text-curve-${drawing.id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
      return (
        <svg width={drawing.width} height={drawing.height} overflow="visible" {...hit} style={{ opacity: drawing.style.opacity, filter: highlighted ? 'drop-shadow(0 0 2px #22d3ee) drop-shadow(0 0 5px rgba(34,211,238,.95))' : undefined }}>
          <defs>
            <path id={pathId} d={curvedTextPath(drawing)} />
          </defs>
          <text fill={drawing.text.color} stroke={drawing.text.strokeColor} strokeWidth={Math.max(0.5, drawing.style.strokeWidth / 4)} paintOrder="stroke" fontFamily={drawing.text.fontFamily} fontSize={drawing.text.fontSize} fontWeight={drawing.text.bold ? 700 : 400} fontStyle={drawing.text.italic ? 'italic' : 'normal'} textDecoration={decoration} textAnchor="middle" style={{ writingMode: drawing.text.orientation === 'vertical' ? 'vertical-rl' : 'horizontal-tb', textOrientation: drawing.text.orientation === 'vertical' ? 'upright' : undefined }}>
            <textPath href={`#${pathId}`} startOffset="50%">
              {drawing.text.content}
            </textPath>
          </text>
        </svg>
      );
    }
    return (
      <foreignObject width={drawing.width} height={drawing.height} {...hit}>
        <div
          style={{
            width: `${100 / horizontalScale}%`,
            height: '100%',
            overflow: 'hidden',
            whiteSpace: 'pre-wrap',
            overflowWrap: drawing.text.orientation === 'vertical' ? 'normal' : 'anywhere',
            color: drawing.text.color,
            WebkitTextStroke: `${Math.max(0.5, drawing.style.strokeWidth / 4)}px ${drawing.text.strokeColor}`,
            fontFamily: drawing.text.fontFamily,
            fontSize: drawing.text.fontSize,
            fontWeight: drawing.text.bold ? 700 : 400,
            fontStyle: drawing.text.italic ? 'italic' : 'normal',
            textDecoration: decoration,
            textAlign: drawing.text.align,
            writingMode: drawing.text.orientation === 'vertical' ? 'vertical-rl' : 'horizontal-tb',
            textOrientation: drawing.text.orientation === 'vertical' ? 'upright' : undefined,
            lineHeight: 1.15,
            opacity: drawing.style.opacity,
            transform: `scaleX(${horizontalScale})`,
            transformOrigin: 'left top',
            filter: highlighted ? 'drop-shadow(0 0 2px #22d3ee) drop-shadow(0 0 5px rgba(34,211,238,.95))' : undefined,
          }}
        >
          {drawing.text.content}
        </div>
      </foreignObject>
    );
  }
  if (drawing.kind === 'line') return <polyline points={points} {...common} {...hit} />;
  if (drawing.kind === 'freehand') return <polyline points={points} {...common} {...hit} />;
  if (drawing.kind === 'polygon') return <polygon points={points} {...common} {...hit} />;
  if (drawing.kind === 'circle') return <ellipse cx={drawing.width / 2} cy={drawing.height / 2} rx={drawing.width / 2} ry={drawing.height / 2} {...common} {...hit} />;
  if (drawing.kind === 'triangle') return <polygon points={`${drawing.width / 2},0 ${drawing.width},${drawing.height} 0,${drawing.height}`} {...common} {...hit} />;
  if (drawing.kind === 'hexagon') return <polygon points={`${drawing.width * 0.25},0 ${drawing.width * 0.75},0 ${drawing.width},${drawing.height / 2} ${drawing.width * 0.75},${drawing.height} ${drawing.width * 0.25},${drawing.height} 0,${drawing.height / 2}`} {...common} {...hit} />;
  return <rect width={drawing.width} height={drawing.height} {...common} {...hit} />;
}

function pointToSegmentDistance(point: SessionMapPoint, start: SessionMapPoint, end: SessionMapPoint) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (start.x + ratio * dx), point.y - (start.y + ratio * dy));
}

function drawingContainsPoint(drawing: SessionMapDrawing, worldPoint: SessionMapPoint, scale: number) {
  const centerX = drawing.x + drawing.width / 2;
  const centerY = drawing.y + drawing.height / 2;
  const angle = -(drawing.rotation ?? 0) * Math.PI / 180;
  const worldDx = worldPoint.x - centerX;
  const worldDy = worldPoint.y - centerY;
  const point = {
    x: worldDx * Math.cos(angle) - worldDy * Math.sin(angle) + drawing.width / 2,
    y: worldDx * Math.sin(angle) + worldDy * Math.cos(angle) + drawing.height / 2,
  };
  const tolerance = (drawing.style.strokeWidth / 2 + 5) / Math.max(scale, 0.01);
  const path = drawing.points ?? [];
  const touchesPath = path.some((start, index) => index < path.length - 1 && pointToSegmentDistance(point, start, path[index + 1]) <= tolerance);
  if (drawing.kind === 'line' || drawing.kind === 'freehand') return touchesPath;
  if (drawing.kind === 'polygon') return pointInPolygon(point, path) || touchesPath || (path.length > 2 && pointToSegmentDistance(point, path[path.length - 1], path[0]) <= tolerance);
  if (drawing.kind === 'circle') {
    const radiusX = Math.max(1, drawing.width / 2);
    const radiusY = Math.max(1, drawing.height / 2);
    const normalized = ((point.x - radiusX) / (radiusX + tolerance)) ** 2 + ((point.y - radiusY) / (radiusY + tolerance)) ** 2;
    return normalized <= 1;
  }
  if (drawing.kind === 'triangle') return pointInPolygon(point, [{ x: drawing.width / 2, y: 0 }, { x: drawing.width, y: drawing.height }, { x: 0, y: drawing.height }]);
  if (drawing.kind === 'hexagon') return pointInPolygon(point, [{ x: drawing.width * 0.25, y: 0 }, { x: drawing.width * 0.75, y: 0 }, { x: drawing.width, y: drawing.height / 2 }, { x: drawing.width * 0.75, y: drawing.height }, { x: drawing.width * 0.25, y: drawing.height }, { x: 0, y: drawing.height / 2 }]);
  return point.x >= -tolerance && point.x <= drawing.width + tolerance && point.y >= -tolerance && point.y <= drawing.height + tolerance;
}

function buildDrawing(kind: SessionMapDrawingKind, points: SessionMapPoint[], style: SessionMapDrawing['style']): SessionMapDrawing | null {
  if (points.length < 2 || (kind === 'polygon' && points.length < 3)) return null;
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  if (Math.hypot(width, height) < 4) return null;
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    kind,
    x: minX,
    y: minY,
    width,
    height,
    rotation: 0,
    points: ['freehand', 'polygon', 'line'].includes(kind) ? points.map((point) => ({ x: point.x - minX, y: point.y - minY })) : undefined,
    style: { ...style },
    locked: false,
    pinned: false,
    visible: true,
    magnetEnabled: false,
    magnetGroupId: null,
    createdAt: now,
    updatedAt: now,
  };
}

function polygonArea(points: SessionMapPoint[]) {
  return Math.abs(points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length];
    return area + point.x * next.y - next.x * point.y;
  }, 0) / 2);
}

function segmentIntersection(a: SessionMapPoint, b: SessionMapPoint, c: SessionMapPoint, d: SessionMapPoint) {
  const denominator = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
  if (Math.abs(denominator) < 1e-7) return null;
  const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / denominator;
  const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / denominator;
  if (t <= 1e-5 || t >= 1 - 1e-5 || u <= 1e-5 || u >= 1 - 1e-5) return null;
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
}

// A hand-drawn fog boundary can cross itself while retracing an area. Remove the
// smaller loop at every crossing so persisted geometry contains only its shell.
function outerFreehandContour(source: SessionMapPoint[]) {
  let points = [...source];
  for (let pass = 0; pass < source.length && points.length >= 4; pass += 1) {
    let simplified = false;
    for (let first = 0; first < points.length - 1 && !simplified; first += 1) {
      for (let second = first + 2; second < points.length - 1; second += 1) {
        if (first === 0 && second === points.length - 2) continue;
        const crossing = segmentIntersection(points[first], points[first + 1], points[second], points[second + 1]);
        if (!crossing) continue;
        const loop = [crossing, ...points.slice(first + 1, second + 1)];
        const remainder = [crossing, ...points.slice(second + 1), ...points.slice(0, first + 1)];
        points = polygonArea(loop) > polygonArea(remainder) ? loop : remainder;
        simplified = true;
        break;
      }
    }
    if (!simplified) break;
  }
  return points;
}

function buildFog(kind: SessionMapFogKind, points: SessionMapPoint[], operation: SessionMapFog['operation'], style: SessionMapFog['style']): SessionMapFog | null {
  if (kind === 'freehand') points = outerFreehandContour(points);
  if (points.length < 2 || (['polygon', 'freehand'].includes(kind) && points.length < 3)) return null;
  const minX = Math.min(...points.map(point => point.x));
  const minY = Math.min(...points.map(point => point.y));
  const maxX = Math.max(...points.map(point => point.x));
  const maxY = Math.max(...points.map(point => point.y));
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  if (Math.hypot(width, height) < 4) return null;
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), kind, operation, persistence: 'permanent', opacity: 1, x: minX, y: minY, width, height, rotation: 0, points: ['polygon', 'freehand'].includes(kind) ? points.map(point => ({ x: point.x - minX, y: point.y - minY })) : undefined, style: { ...style }, enabled: true, locked: false, magnetEnabled: false, magnetGroupId: null, createdAt: now, updatedAt: now };
}

type FogRing = [number, number][];
type FogPolygon = FogRing[];
type FogMultiPolygon = FogPolygon[];

function exploredAreasToMultiPolygon(areas: SessionMapFog['exploredAreas']): FogMultiPolygon {
  return (areas ?? []).map(polygon => polygon.map(ring => ring.map(point => [point.x, point.y] as [number, number])));
}

function multiPolygonToExploredAreas(polygons: FogMultiPolygon): NonNullable<SessionMapFog['exploredAreas']> {
  return polygons.map(polygon => polygon.map(ring => ring.map(([x, y]) => ({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 }))));
}

function exploredAreasPath(areas: SessionMapFog['exploredAreas']) {
  return (areas ?? [])
    .flatMap(polygon => polygon.map(ring => (ring.length ? `M ${ring.map(point => `${point.x} ${point.y}`).join(' L ')} Z` : '')).filter(Boolean))
    .join(' ');
}

function translateExploredAreas(areas: SessionMapFog['exploredAreas'], dx: number, dy: number) {
  return areas?.map(polygon => polygon.map(ring => ring.map(point => ({ x: point.x + dx, y: point.y + dy }))));
}

function exploredAreasContainPoint(areas: SessionMapFog['exploredAreas'], point: SessionMapPoint) {
  return (areas ?? []).some(polygon => polygon[0]?.length >= 3 && pointInPolygon(point, polygon[0]) && !polygon.slice(1).some(hole => hole.length >= 3 && pointInPolygon(point, hole)));
}

function fogLocalRings(fog: SessionMapFog): SessionMapPoint[][] {
  if (fog.rings?.length) return fog.rings;
  if (fog.kind === 'circle') {
    const count = Math.max(48, Math.min(128, Math.ceil(Math.PI * Math.max(fog.width, fog.height) / 8)));
    return [Array.from({ length: count }, (_, index) => {
      const angle = index * Math.PI * 2 / count;
      return { x: fog.width / 2 + Math.cos(angle) * fog.width / 2, y: fog.height / 2 + Math.sin(angle) * fog.height / 2 };
    })];
  }
  if (fog.kind === 'triangle') return [[{ x: fog.width / 2, y: 0 }, { x: fog.width, y: fog.height }, { x: 0, y: fog.height }]];
  if (fog.kind === 'hexagon') return [[{ x: fog.width * .25, y: 0 }, { x: fog.width * .75, y: 0 }, { x: fog.width, y: fog.height / 2 }, { x: fog.width * .75, y: fog.height }, { x: fog.width * .25, y: fog.height }, { x: 0, y: fog.height / 2 }]];
  if (fog.kind === 'polygon' || fog.kind === 'freehand') return [fog.points ?? []];
  return [[{ x: 0, y: 0 }, { x: fog.width, y: 0 }, { x: fog.width, y: fog.height }, { x: 0, y: fog.height }]];
}

function fogWorldPolygon(fog: SessionMapFog): FogPolygon {
  const angle = fog.rotation * Math.PI / 180;
  const center = { x: fog.width / 2, y: fog.height / 2 };
  return fogLocalRings(fog).filter(ring => ring.length >= 3).map(ring => ring.map(point => {
    const dx = point.x - center.x; const dy = point.y - center.y;
    return [fog.x + center.x + dx * Math.cos(angle) - dy * Math.sin(angle), fog.y + center.y + dx * Math.sin(angle) + dy * Math.cos(angle)] as [number, number];
  }));
}

function polygonBounds(polygon: FogPolygon) {
  const points = polygon.flat();
  if (points.length === 0) return null;
  const xs = points.map(point => point[0]);
  const ys = points.map(point => point[1]);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

function polygonBoundsOverlap(first: ReturnType<typeof polygonBounds>, second: ReturnType<typeof polygonBounds>) {
  return !!first && !!second && first.minX <= second.maxX && first.maxX >= second.minX && first.minY <= second.maxY && first.maxY >= second.minY;
}

function fogsFromMultiPolygon(geometry: FogMultiPolygon, template: SessionMapFog, keepId = false): SessionMapFog[] {
  const now = new Date().toISOString();
  return geometry.filter(polygon => polygon[0]?.length >= 3).map((polygon, index) => {
    const coordinates = polygon.flat();
    const minX = Math.min(...coordinates.map(point => point[0])); const minY = Math.min(...coordinates.map(point => point[1]));
    const maxX = Math.max(...coordinates.map(point => point[0])); const maxY = Math.max(...coordinates.map(point => point[1]));
    const rings = polygon.map(ring => ring.map(([x, y]) => ({ x: x - minX, y: y - minY })));
    return { ...template, id: keepId && index === 0 ? template.id : crypto.randomUUID(), kind: 'polygon', x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY), rotation: 0, points: rings[0], rings, createdAt: keepId ? template.createdAt : now, updatedAt: now };
  });
}

function fogWorldPath(fog: SessionMapFog) {
  return fogWorldPolygon(fog).map(ring => ring.length ? `M ${ring.map(([x, y]) => `${x} ${y}`).join(' L ')} Z` : '').join(' ');
}

function trimPolygonCollisions(points: SessionMapPoint[], obstacles: SessionMapPoint[][]) {
  const bounds = (polygon: SessionMapPoint[]) => ({ minX: Math.min(...polygon.map(point => point.x)), maxX: Math.max(...polygon.map(point => point.x)), minY: Math.min(...polygon.map(point => point.y)), maxY: Math.max(...polygon.map(point => point.y)) });
  const clip = (polygon: SessionMapPoint[], axis: 'x' | 'y', limit: number, keepGreater: boolean) => {
    const result: SessionMapPoint[] = [];
    for (let index = 0; index < polygon.length; index++) {
      const current = polygon[index]; const previous = polygon[(index + polygon.length - 1) % polygon.length];
      const currentInside = keepGreater ? current[axis] >= limit : current[axis] <= limit;
      const previousInside = keepGreater ? previous[axis] >= limit : previous[axis] <= limit;
      if (currentInside !== previousInside) {
        const ratio = (limit - previous[axis]) / (current[axis] - previous[axis]);
        result.push(axis === 'x' ? { x: limit, y: previous.y + (current.y - previous.y) * ratio } : { x: previous.x + (current.x - previous.x) * ratio, y: limit });
      }
      if (currentInside) result.push(current);
    }
    return result;
  };
  let result = points;
  for (const obstacle of obstacles) {
    if (result.length < 3 || obstacle.length < 3) continue;
    const candidate = bounds(result); const blocked = bounds(obstacle);
    const overlapX = Math.min(candidate.maxX, blocked.maxX) - Math.max(candidate.minX, blocked.minX);
    const overlapY = Math.min(candidate.maxY, blocked.maxY) - Math.max(candidate.minY, blocked.minY);
    if (overlapX <= 0 || overlapY <= 0) continue;
    const candidateCenter = { x: (candidate.minX + candidate.maxX) / 2, y: (candidate.minY + candidate.maxY) / 2 };
    const blockedCenter = { x: (blocked.minX + blocked.maxX) / 2, y: (blocked.minY + blocked.maxY) / 2 };
    if (overlapX < overlapY) result = candidateCenter.x >= blockedCenter.x ? clip(result, 'x', blocked.maxX, true) : clip(result, 'x', blocked.minX, false);
    else result = candidateCenter.y >= blockedCenter.y ? clip(result, 'y', blocked.maxY, true) : clip(result, 'y', blocked.minY, false);
  }
  return result.length >= 3 ? result : null;
}

function fogShape(fog: SessionMapFog, props: Record<string, unknown> = {}) {
  if (fog.rings?.length) {
    const path = fog.rings.map(ring => ring.length ? `M ${ring.map(point => `${point.x} ${point.y}`).join(' L ')} Z` : '').join(' ');
    return <path d={path} fillRule="evenodd" clipRule="evenodd" {...props} />;
  }
  const points = fog.points?.map(point => `${point.x},${point.y}`).join(' ') ?? '';
  if (fog.kind === 'polygon' || fog.kind === 'freehand') return <polygon points={points} {...props} />;
  if (fog.kind === 'circle') return <ellipse cx={fog.width / 2} cy={fog.height / 2} rx={fog.width / 2} ry={fog.height / 2} {...props} />;
  if (fog.kind === 'triangle') return <polygon points={`${fog.width / 2},0 ${fog.width},${fog.height} 0,${fog.height}`} {...props} />;
  if (fog.kind === 'hexagon') return <polygon points={`${fog.width * 0.25},0 ${fog.width * 0.75},0 ${fog.width},${fog.height / 2} ${fog.width * 0.75},${fog.height} ${fog.width * 0.25},${fog.height} 0,${fog.height / 2}`} {...props} />;
  return <rect width={fog.width} height={fog.height} {...props} />;
}

function fogContainsPoint(fog: SessionMapFog, worldPoint: SessionMapPoint) {
  const centerX = fog.x + fog.width / 2;
  const centerY = fog.y + fog.height / 2;
  const angle = -fog.rotation * Math.PI / 180;
  const dx = worldPoint.x - centerX;
  const dy = worldPoint.y - centerY;
  const point = { x: dx * Math.cos(angle) - dy * Math.sin(angle) + fog.width / 2, y: dx * Math.sin(angle) + dy * Math.cos(angle) + fog.height / 2 };
  if (fog.rings?.length) return fog.rings.reduce((inside, ring) => pointInPolygon(point, ring) ? !inside : inside, false);
  if (fog.kind === 'polygon' || fog.kind === 'freehand') return pointInPolygon(point, fog.points ?? []);
  if (fog.kind === 'circle') return ((point.x - fog.width / 2) / Math.max(1, fog.width / 2)) ** 2 + ((point.y - fog.height / 2) / Math.max(1, fog.height / 2)) ** 2 <= 1;
  if (fog.kind === 'triangle') return pointInPolygon(point, [{ x: fog.width / 2, y: 0 }, { x: fog.width, y: fog.height }, { x: 0, y: fog.height }]);
  if (fog.kind === 'hexagon') return pointInPolygon(point, [{ x: fog.width * 0.25, y: 0 }, { x: fog.width * 0.75, y: 0 }, { x: fog.width, y: fog.height / 2 }, { x: fog.width * 0.75, y: fog.height }, { x: fog.width * 0.25, y: fog.height }, { x: 0, y: fog.height / 2 }]);
  return point.x >= 0 && point.x <= fog.width && point.y >= 0 && point.y <= fog.height;
}

function MeasurementGraphic({ measurement, view, gridSettings }: { measurement: VisualMeasurement; view: ViewTransform; gridSettings: SessionGridSettings }) {
  const length = Math.hypot(measurement.end.x - measurement.start.x, measurement.end.y - measurement.start.y);
  const distance = (length / Math.max(1, gridSettings.cellSize)) * gridSettings.distance;
  const label = `${new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 }).format(distance)} ${gridSettings.unit}`;
  const perpendicular =
    length > 0
      ? {
          x: -(measurement.end.y - measurement.start.y) / length,
          y: (measurement.end.x - measurement.start.x) / length,
        }
      : { x: 0, y: 0 };
  const corners = [
    {
      x: measurement.end.x + (perpendicular.x * length) / 2,
      y: measurement.end.y + (perpendicular.y * length) / 2,
    },
    {
      x: measurement.end.x - (perpendicular.x * length) / 2,
      y: measurement.end.y - (perpendicular.y * length) / 2,
    },
  ];
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 z-[10000] overflow-visible transition-opacity duration-500 ${measurement.fading ? 'opacity-0' : 'opacity-100'}`}>
      <svg className="absolute inset-0 h-full w-full overflow-visible">
        {measurement.mode === 'circle' && (
          <>
            <circle cx={measurement.start.x} cy={measurement.start.y} r={length} fill="rgba(34,211,238,0.12)" stroke="rgba(3,7,18,0.95)" strokeWidth={7 / view.scale} />
            <circle cx={measurement.start.x} cy={measurement.start.y} r={length} fill="none" stroke="#22d3ee" strokeWidth={3 / view.scale} />
          </>
        )}
        {measurement.mode === 'cone' && (
          <>
            <polygon points={`${measurement.start.x},${measurement.start.y} ${corners[0].x},${corners[0].y} ${corners[1].x},${corners[1].y}`} fill="rgba(34,211,238,0.12)" stroke="rgba(3,7,18,0.95)" strokeWidth={7 / view.scale} strokeLinejoin="round" />
            <polygon points={`${measurement.start.x},${measurement.start.y} ${corners[0].x},${corners[0].y} ${corners[1].x},${corners[1].y}`} fill="none" stroke="#22d3ee" strokeWidth={3 / view.scale} strokeLinejoin="round" />
          </>
        )}
        <line x1={measurement.start.x} y1={measurement.start.y} x2={measurement.end.x} y2={measurement.end.y} stroke="rgba(3,7,18,0.95)" strokeWidth={measurement.mode === 'line' ? 7 / view.scale : 4 / view.scale} strokeLinecap="round" />
        <line x1={measurement.start.x} y1={measurement.start.y} x2={measurement.end.x} y2={measurement.end.y} stroke="#22d3ee" strokeWidth={measurement.mode === 'line' ? 3 / view.scale : 1.5 / view.scale} strokeLinecap="round" />
        <circle cx={measurement.start.x} cy={measurement.start.y} r={5 / view.scale} fill="#22d3ee" stroke="rgba(3,7,18,0.95)" strokeWidth={2 / view.scale} />
        <circle cx={measurement.end.x} cy={measurement.end.y} r={5 / view.scale} fill="#f8fafc" stroke="rgba(3,7,18,0.95)" strokeWidth={2 / view.scale} />
      </svg>
      <span
        className="absolute whitespace-nowrap rounded-md border border-cyan-300/60 bg-slate-950/90 px-2 py-1 font-semibold text-cyan-100 shadow-lg"
        style={{
          left: measurement.end.x,
          top: measurement.end.y,
          fontSize: 12 / view.scale,
          transform: `translate(${10 / view.scale}px, ${-34 / view.scale}px)`,
        }}
      >
        {label}
      </span>
    </div>
  );
}

const tokenFallback = <img src="/icon-source-1024.png" alt="" draggable={false} className="h-full w-full object-contain" style={{ filter: 'invert(1)', opacity: 0.9 }} />;
const TOKEN_LABEL_COLORS = ['#111827', '#374151', '#7f1d1d', '#b91c1c', '#9a3412', '#92400e', '#854d0e', '#166534', '#15803d', '#155e75', '#0e7490', '#1e40af', '#4338ca', '#6b21a8', '#9d174d', '#be185d'];
const STANDARD_TOKEN_CONDITIONS: {
  key: string;
  name: string;
  icon: LucideIcon;
}[] = [
  { key: 'blinded', name: 'Accecato', icon: EyeOff },
  { key: 'charmed', name: 'Affascinato', icon: Heart },
  { key: 'grappled', name: 'Afferrato', icon: Hand },
  { key: 'deafened', name: 'Assordato', icon: EarOff },
  { key: 'poisoned', name: 'Avvelenato', icon: Biohazard },
  { key: 'exhausted', name: 'Esausto', icon: BatteryLow },
  { key: 'incapacitated', name: 'Incapacitato', icon: UserRoundX },
  { key: 'invisible', name: 'Invisibile', icon: ScanEye },
  { key: 'dead', name: 'Morte', icon: Skull },
  { key: 'paralyzed', name: 'Paralizzato', icon: Accessibility },
  { key: 'petrified', name: 'Pietrificato', icon: Mountain },
  { key: 'unconscious', name: 'Privo di sensi', icon: CircleX },
  { key: 'prone', name: 'Prono', icon: Bed },
  { key: 'bloodied', name: 'Sanguinante', icon: HeartCrack },
  { key: 'frightened', name: 'Spaventato', icon: Ghost },
  { key: 'stunned', name: 'Stordito', icon: Orbit },
  { key: 'restrained', name: 'Trattenuto', icon: LockKeyhole },
];

function getTokenConditionIcon(condition: SessionMapTokenCondition): LucideIcon {
  return STANDARD_TOKEN_CONDITIONS.find((item) => item.key === condition.standardKey)?.icon ?? Star;
}

function getTokenSize(token: SessionMapToken, fallback: number) {
  return Math.max(8, token.size ?? fallback);
}

function getTokenBounds(token: SessionMapToken, fallback: number, position: TokenPosition = token) {
  const size = getTokenSize(token, fallback);
  return getRotatedSquareBounds(position, size, token.rotation ?? 0);
}

function CanvasGrid({ settings, patternId, view, viewportWidth, viewportHeight, worldBounds }: { settings: SessionGridSettings; patternId: string; view: ViewTransform; viewportWidth: number; viewportHeight: number; worldBounds: { minX: number; minY: number; maxX: number; maxY: number } }) {
  if (settings.opacity <= 0) return null;
  const size = settings.cellSize;
  const color = settings.color ?? '#38bdf8';
  const lineStyle = settings.lineStyle ?? 'solid';
  const strokeProps = lineStyle === 'dashed' ? { strokeDasharray: '6 5' } : lineStyle === 'dotted' ? { strokeDasharray: '1 6', strokeLinecap: 'round' as const } : {};
  // Keep the SVG viewport on stable world-space tiles. Moving its fractional
  // bounds every frame forces the browser to re-rasterize the pattern and
  // produces visible sub-pixel shimmer at high zoom.
  const tileSize = Math.ceil(Math.max(512, size * 16));
  const viewportWorldX = -view.x / view.scale;
  const viewportWorldY = -view.y / view.scale;
  const viewportWorldWidth = viewportWidth / view.scale;
  const viewportWorldHeight = viewportHeight / view.scale;
  const visibleX = Math.max(worldBounds.minX, Math.floor((viewportWorldX - tileSize) / tileSize) * tileSize);
  const visibleY = Math.max(worldBounds.minY, Math.floor((viewportWorldY - tileSize) / tileSize) * tileSize);
  const visibleRight = Math.min(worldBounds.maxX, Math.ceil((viewportWorldX + viewportWorldWidth + tileSize) / tileSize) * tileSize);
  const visibleBottom = Math.min(worldBounds.maxY, Math.ceil((viewportWorldY + viewportWorldHeight + tileSize) / tileSize) * tileSize);
  const visibleWidth = Math.max(0, visibleRight - visibleX);
  const visibleHeight = Math.max(0, visibleBottom - visibleY);
  if (visibleWidth === 0 || visibleHeight === 0) return null;
  const gridStyle = { left: visibleX, top: visibleY, width: visibleWidth, height: visibleHeight, color, opacity: settings.opacity };
  if (settings.type === 'square') {
    const crossHalf = Math.min(2, size * 0.1);
    const cornerHalf = Math.min(1.5, size * 0.075);
    const center = size / 2;
    const squarePath = lineStyle === 'crosses' ? `M ${center - crossHalf} ${center} H ${center + crossHalf} M ${center} ${center - crossHalf} V ${center + crossHalf}` : lineStyle === 'corners' ? `M 0 0 L ${cornerHalf} ${cornerHalf} M ${size} 0 L ${size - cornerHalf} ${cornerHalf} M 0 ${size} L ${cornerHalf} ${size - cornerHalf} M ${size} ${size} L ${size - cornerHalf} ${size - cornerHalf}` : `M 0 0 H ${size} M 0 0 V ${size}`;
    return (
      <svg data-session-map-grid="square" aria-hidden="true" className="pointer-events-none absolute z-[2] overflow-hidden" style={gridStyle} viewBox={`${visibleX} ${visibleY} ${visibleWidth} ${visibleHeight}`} preserveAspectRatio="none">
        <defs>
          <pattern id={patternId} x={settings.originX ?? 0} y={settings.originY ?? 0} width={size} height={size} patternUnits="userSpaceOnUse">
            <path d={squarePath} fill="none" stroke="currentColor" strokeWidth="1" {...strokeProps} />
            {lineStyle === 'dotted' && <circle cx="0" cy="0" r="2" fill="currentColor" />}
          </pattern>
        </defs>
        <rect x={visibleX} y={visibleY} width={visibleWidth} height={visibleHeight} fill={`url(#${patternId})`} />
      </svg>
    );
  }
  const pointy = settings.type === 'hex-pointy';
  const radius = size / 2;
  const hexWidth = pointy ? Math.sqrt(3) * radius : radius * 2;
  const hexHeight = pointy ? radius * 2 : Math.sqrt(3) * radius;
  const patternWidth = pointy ? hexWidth * 2 : radius * 3;
  const patternHeight = pointy ? radius * 3 : hexHeight * 2;
  const centers: Array<[number, number]> = [];
  if (pointy) {
    for (let row = -2; row <= 3; row += 1) for (let column = -2; column <= 2; column += 1) centers.push([hexWidth / 2 + ((Math.abs(row) % 2) * hexWidth) / 2 + column * hexWidth, radius + row * radius * 1.5]);
  } else {
    for (let column = -2; column <= 3; column += 1) for (let row = -2; row <= 2; row += 1) centers.push([radius + column * radius * 1.5, hexHeight / 2 + ((Math.abs(column) % 2) * hexHeight) / 2 + row * hexHeight]);
  }
  const polygonPoints = (cx: number, cy: number) =>
    Array.from({ length: 6 }, (_, index) => {
      const angle = (((pointy ? -90 : 0) + index * 60) * Math.PI) / 180;
      return {
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      };
    });
  return (
    <svg data-session-map-grid={settings.type} aria-hidden="true" className="pointer-events-none absolute z-[2] overflow-hidden" style={gridStyle} viewBox={`${visibleX} ${visibleY} ${visibleWidth} ${visibleHeight}`} preserveAspectRatio="none">
      <defs>
        <pattern id={patternId} x={settings.originX ?? 0} y={settings.originY ?? 0} width={patternWidth} height={patternHeight} patternUnits="userSpaceOnUse">
          {centers.map(([cx, cy], index) => {
            const points = polygonPoints(cx, cy);
            if (lineStyle === 'crosses') {
              const crossHalf = Math.min(2, radius * 0.2);
              return <path key={index} d={`M ${cx - crossHalf} ${cy} H ${cx + crossHalf} M ${cx} ${cy - crossHalf} V ${cy + crossHalf}`} fill="none" stroke="currentColor" strokeWidth="1" />;
            }
            if (lineStyle === 'corners')
              return (
                <g key={index}>
                  {points.map((point, pointIndex) => {
                    const previous = points[(pointIndex + 5) % 6];
                    const next = points[(pointIndex + 1) % 6];
                    const before = {
                      x: point.x + (previous.x - point.x) * 0.18,
                      y: point.y + (previous.y - point.y) * 0.18,
                    };
                    const after = {
                      x: point.x + (next.x - point.x) * 0.18,
                      y: point.y + (next.y - point.y) * 0.18,
                    };
                    return <path key={pointIndex} d={`M ${before.x} ${before.y} L ${point.x} ${point.y} L ${after.x} ${after.y}`} fill="none" stroke="currentColor" strokeWidth="1" />;
                  })}
                </g>
              );
            return (
              <g key={index}>
                <polygon points={points.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="1" {...strokeProps} />
                {lineStyle === 'dotted' && points.map((point, pointIndex) => <circle key={pointIndex} cx={point.x} cy={point.y} r="2" fill="currentColor" />)}
              </g>
            );
          })}
        </pattern>
      </defs>
      <rect x={visibleX} y={visibleY} width={visibleWidth} height={visibleHeight} fill={`url(#${patternId})`} />
    </svg>
  );
}

function readStoredView(mapId: string): ViewTransform {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(`hollowgate.map-view.${mapId}`) ?? 'null');
    if (parsed && Number.isFinite(parsed.x) && Number.isFinite(parsed.y) && Number.isFinite(parsed.scale)) {
      return {
        x: parsed.x,
        y: parsed.y,
        scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, parsed.scale)),
      };
    }
  } catch {
    /* The default view remains available without storage. */
  }
  return { x: 0, y: 0, scale: 1 };
}

export function MapViewport({ children, campaignId, mapId, backgroundUrl, isOwner, currentUserId, currentUserAccessToken, mapPlacement, gridSettings, mapTokens = [], mapDrawings = [], mapFog = [], mapPois = [], mapObjectOrder, remoteTokenPositions = {}, onPoiCreate, onPoiMove, onPoiChange, onPoiDelete, onPoiDuplicate, onPoiPaste, onPoiLayerMove, onDrawingCreate, onDrawingChange, onDrawingsChange, onDrawingsMove, onDrawingTransformsChange, onDrawingDelete, onDrawingsDelete, onDrawingDuplicate, onDrawingsDuplicate, onDrawingLayerMove, onDrawingsLayerMove, onDrawingsCreateMagnetGroup, onDrawingMagnetDisable, onFogCreate, onFogReplaceAll, onFogChange, onFogsChange, onFogsMove, onFogTransformsChange, onFogExplorationChange, onFogDelete, onFogsDelete, onFogCoverFullMap, onMapPlacementChange, onTokenDrop, onTokensMove, onTokenMovePreview, onTokenLayerMove, onTokensLayerMove, onTokenLockChange, onTokenChange, onTokensChange, onTokenTransformsChange, onTokenDelete, onTokensDelete, onTokensCreateMagnetGroup, onTokenMagnetEnabledChange, onTokenMagnetLink, onTokenMagnetUnlink }: MapViewportProps) {
  const objectOrder = useMemo(() => reconcileMapObjectOrder(mapObjectOrder, [['drawing', mapDrawings], ['token', mapTokens], ['poi', mapPois]]), [mapDrawings, mapObjectOrder, mapPois, mapTokens]);
  const objectZIndex = useMemo(() => new globalThis.Map(objectOrder.map((ref, index) => [`${ref.family}\u0000${ref.id}`, index + 3])), [objectOrder]);
  const drawingById = useMemo(() => new globalThis.Map(mapDrawings.map(item => [item.id, item])), [mapDrawings]);
  const tokenById = useMemo(() => new globalThis.Map(mapTokens.map(item => [item.id, item])), [mapTokens]);
  const poiById = useMemo(() => new globalThis.Map(mapPois.map(item => [item.id, item])), [mapPois]);
  const mapUserId = currentUserId ?? getSessionMapCurrentUserId();
  const canMoveToken = (token: SessionMapToken) => token.pinned !== true && (isOwner || token.locked !== true);
  const canControlToken = (token: SessionMapToken) => token.pinned !== true && (isOwner || (token.locked !== true && !!mapUserId && token.createdByProfileId === mapUserId));
  const measurementClientIdRef = useRef(crypto.randomUUID());
  const activeTool = useActiveSessionMapTool();
  const selectionMode = useSessionMapSelectionMode();
  const selectionArmed = useSessionMapSelectionArmed();
  const measureMode = useSessionMapMeasureMode();
  const measurementsVisibleToAll = useSessionMapMeasurementsVisibleToAll();
  const drawSettings = useSessionMapDrawSettings();
  const fogSettings = useSessionMapFogSettings();
  const calibrationActive = useSessionMapCalibrationActive();
  const [view, setView] = useState<ViewTransform>(() => readStoredView(mapId));
  const [placement, setPlacement] = useState(mapPlacement);
  const [panning, setPanning] = useState(false);
  const [moveTargetAvailable, setMoveTargetAvailable] = useState(false);
  const panRef = useRef<PanGesture | null>(null);
  const panFrameRef = useRef<number | null>(null);
  const pendingPanPointRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const zoomFrameRef = useRef<number | null>(null);
  const pendingZoomRef = useRef<{ deltaY: number; pointerX: number; pointerY: number } | null>(null);
  const depthHoverFrameRef = useRef<number | null>(null);
  const pendingDepthHoverRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const isMoving = panning || zoomFrameRef.current !== null || panFrameRef.current !== null;
  const viewportRef = useRef<HTMLDivElement>(null);
  const constrainViewToWorld = (candidate: ViewTransform): ViewTransform => {
    const viewport = viewportRef.current;
    if (!viewport) return candidate;
    const mapWidth = placementRef.current.width ?? placementElementRef.current?.offsetWidth ?? 0;
    const mapHeight = placementRef.current.height ?? placementElementRef.current?.offsetHeight ?? 0;
    const worldCenterX = placementRef.current.x + mapWidth / 2;
    const worldCenterY = placementRef.current.y + mapHeight / 2;
    const worldMinX = worldCenterX - MAP_WORLD_WIDTH / 2;
    const worldMaxX = worldCenterX + MAP_WORLD_WIDTH / 2;
    const worldMinY = worldCenterY - MAP_WORLD_HEIGHT / 2;
    const worldMaxY = worldCenterY + MAP_WORLD_HEIGHT / 2;
    const scale = Math.max(candidate.scale, viewport.clientWidth / MAP_WORLD_WIDTH, viewport.clientHeight / MAP_WORLD_HEIGHT);
    const minX = viewport.clientWidth - worldMaxX * scale;
    const maxX = -worldMinX * scale;
    const minY = viewport.clientHeight - worldMaxY * scale;
    const maxY = -worldMinY * scale;
    return {
      scale,
      x: Math.min(maxX, Math.max(minX, candidate.x)),
      y: Math.min(maxY, Math.max(minY, candidate.y)),
    };
  };
  const tokenGestureRef = useRef<TokenGesture | null>(null);
  const tokenTransformGestureRef = useRef<TokenTransformGesture | null>(null);
  const [tokenDraftPositions, setTokenDraftPositions] = useState<Record<string, { x: number; y: number }>>({});
  const tokenPreviewSentAtRef = useRef(0);
  const [tokenDraftTransforms, setTokenDraftTransforms] = useState<Record<string, TokenTransform>>({});
  const [transformTokenId, setTransformTokenId] = useState<string | null>(null);
  const [tokenMenu, setTokenMenu] = useState<TokenMenu | null>(null);
  const [poiMenu, setPoiMenu] = useState<{ poiId: string; x: number; y: number; panel: 'icons' | 'notes' | 'layers' | 'lighting' | null } | null>(null);
  const [poiNoteOptions, setPoiNoteOptions] = useState<Array<{ id: string; label: string; visibleToPlayers: boolean }>>([]);
  const [poiNotesLoading, setPoiNotesLoading] = useState(false);
  const [poiClipboard, setPoiClipboard] = useState<SessionMapPoi | null>(null);
  const [poiDraftPositions, setPoiDraftPositions] = useState<Record<string, TokenPosition>>({});
  const [poiDraftTransforms, setPoiDraftTransforms] = useState<Record<string, { size: number; rotation: number }>>({});
  const [coneDirectionDrafts, setConeDirectionDrafts] = useState<Record<string, number>>({});
  const coneDirectionGestureRef = useRef<{ pointerId: number; key: string; family: 'token' | 'poi'; id: string; sourceType: 'light' | 'vision'; direction: number } | null>(null);
  const coneDirectionFrameRef = useRef<number | null>(null);
  const coneVisibilityCacheRef = useRef<Record<string, SessionMapPoint[]>>({});
  const [transformPoiId, setTransformPoiId] = useState<string | null>(null);
  const poiMoveRef = useRef<{ pointerId: number; poiId: string; startX: number; startY: number; origin: TokenPosition; position: TokenPosition } | null>(null);
  const poiTransformRef = useRef<{ pointerId: number; poiId: string; kind: 'resize' | 'rotate'; centerClientX: number; centerClientY: number; startDistance: number; startAngle: number; origin: { size: number; rotation: number }; draft: { size: number; rotation: number } } | null>(null);
  const depthSelectionRef = useRef<{ x: number; y: number; key: string } | null>(null);
  const [depthHoveredKeys, setDepthHoveredKeys] = useState<Set<string>>(() => new Set());
  const [depthSelectedKey, setDepthSelectedKey] = useState<string | null>(null);
  useEffect(() => {
    if (!transformPoiId) return;
    const closePoiTransform = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target.closest('[data-map-poi-id]') : null;
      if (target?.getAttribute('data-map-poi-id') !== transformPoiId) setTransformPoiId(null);
    };
    document.addEventListener('pointerdown', closePoiTransform, true);
    return () => document.removeEventListener('pointerdown', closePoiTransform, true);
  }, [transformPoiId]);
  const [selectedTokenIds, setSelectedTokenIds] = useState<Set<string>>(() => new Set());
  const [selectedDrawingIds, setSelectedDrawingIds] = useState<Set<string>>(() => new Set());
  const [hoveredDrawingId, setHoveredDrawingId] = useState<string | null>(null);
  const hoveredMapElementRef = useRef<{ type: 'drawing' | 'token'; id: string } | null>(null);
  const [selectionDraft, setSelectionDraft] = useState<SelectionGesture | null>(null);
  const selectionGestureRef = useRef<SelectionGesture | null>(null);
  const [calibrationStart, setCalibrationStart] = useState<SelectionPoint | null>(null);
  const [visualMeasurement, setVisualMeasurement] = useState<VisualMeasurement | null>(null);
  const visualMeasurementRef = useRef<VisualMeasurement | null>(null);
  const visualMeasurementTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [remoteMeasurements, setRemoteMeasurements] = useState<Record<string, VisualMeasurement>>({});
  const remoteMeasurementTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>[]>>({});
  const lastMeasurementBroadcastRef = useRef(0);
  const [conditionScrollRatio, setConditionScrollRatio] = useState(0);
  const drawingGestureRef = useRef<DrawingGesture | null>(null);
  const [drawingDraft, setDrawingDraft] = useState<SessionMapDrawing | null>(null);
  const [polygonPoints, setPolygonPoints] = useState<SessionMapPoint[]>([]);
  const [polygonHover, setPolygonHover] = useState<SessionMapPoint | null>(null);
  const fogGestureRef = useRef<FogGesture | null>(null);
  const [fogDraft, setFogDraft] = useState<SessionMapFog | null>(null);
  const [fogPolygonPoints, setFogPolygonPoints] = useState<SessionMapPoint[]>([]);
  const [fogPolygonHover, setFogPolygonHover] = useState<SessionMapPoint | null>(null);
  const [roomFillBusy, setRoomFillBusy] = useState(false);
  const [roomFillNotice, setRoomFillNotice] = useState<string | null>(null);
  const roomFillFailuresRef = useRef(0);
  const roomFillNoticeTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (fogDraft && mapFog.some(fog => fog.id === fogDraft.id)) setFogDraft(null);
  }, [fogDraft, mapFog]);
  useEffect(() => {
    if (activeTool !== 'fog' || fogSettings.mode !== 'room-fill' || !backgroundUrl) return;
    void preloadRoomFillImage(backgroundUrl).catch(() => undefined);
  }, [activeTool, backgroundUrl, fogSettings.mode]);
  useEffect(() => () => {
    if (roomFillNoticeTimerRef.current !== null) window.clearTimeout(roomFillNoticeTimerRef.current);
  }, []);
  const [wallStart, setWallStart] = useState<SessionMapPoint | null>(null);
  const [wallHover, setWallHover] = useState<SessionMapPoint | null>(null);
  useEffect(() => {
    if (activeTool !== 'walls') { setWallStart(null); setWallHover(null); }
  }, [activeTool]);
  const [selectedFogIds, setSelectedFogIds] = useState<Set<string>>(() => new Set());
  const quickFogSelectionRef = useRef<{ pointerId: number; ids: Set<string> } | null>(null);
  const [fogSelectionMenu, setFogSelectionMenu] = useState<{ x: number; y: number } | null>(null);
  const [fogMenu, setFogMenu] = useState<{ id: string; x: number; y: number; panel: 'magnets' | 'persistence' | 'opacity' | null } | null>(null);
  const [fogOpacityDraft, setFogOpacityDraft] = useState<number | null>(null);
  const fogMenuRef = useRef<HTMLDivElement>(null);
  const [fogClipboard, setFogClipboard] = useState<SessionMapFog | null>(null);
  const fogExplorationCacheRef = useRef<Record<string, NonNullable<SessionMapFog['exploredAreas']>>>({});
  const fogLightExplorationCacheRef = useRef<Record<string, NonNullable<SessionMapFog['lightExploredAreas']>>>({});
  const fogVolatileTrailCacheRef = useRef<Record<string, NonNullable<SessionMapFog['exploredAreas']>>>({});
  const fogCurrentVisionRef = useRef<Record<string, { signature: string; polygons: FogMultiPolygon; anchors: SessionMapPoint[] }>>({});
  const [, forceFogExplorationRender] = useState(0);
  const pendingFogExplorationRef = useRef<Record<string, Partial<SessionMapFog>>>({});
  const deletingExploredFogIdsRef = useRef(new Set<string>());
  const fogExplorationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fogPersistenceHint, setFogPersistenceHint] = useState<{ id: string; x: number; y: number; label: string } | null>(null);
  const [pathEditFogId, setPathEditFogId] = useState<string | null>(null);
  const [fogPathDrafts, setFogPathDrafts] = useState<Record<string, SessionMapFog>>({});
  const fogPathPointRef = useRef<{ pointerId: number; fogId: string; pointIndex: number; origin: SessionMapFog; draft: SessionMapFog } | null>(null);
  useEffect(() => {
    if (fogMenu) return;
    fogTooltipHoveredRef.current = null;
    setFogTooltip(null);
  }, [fogMenu]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (fogMenu && fogMenuRef.current && !fogMenuRef.current.contains(event.target as Node)) {
        setFogMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [fogMenu]);
  const previousFogModeRef = useRef(fogSettings.mode);
  const lastAppliedFogStyleRevisionRef = useRef(fogSettings.styleRevision);
  const hydratedFogStyleRef = useRef<{ mapId: string; color: string; strokeWidth: number } | null>(null);
  const fogMoveRef = useRef<{ pointerId: number; start: SessionMapPoint; origins: Record<string, SessionMapPoint>; fogs: Record<string, SessionMapFog>; finalPositions: Record<string, SessionMapPoint> } | null>(null);
  const [draggingFog, setDraggingFog] = useState(false);
  const [fogMoveDrafts, setFogMoveDrafts] = useState<Record<string, SessionMapPoint>>({});
  const [fogTransformDrafts, setFogTransformDrafts] = useState<Record<string, SessionMapFog>>({});
  const fogTransformRef = useRef<{ pointerId: number; id: string; kind: 'resize' | 'rotate'; handle?: 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'; startX: number; startY: number; startAngle: number; centerClientX: number; centerClientY: number; origin: SessionMapFog; draft: SessionMapFog } | null>(null);
  useEffect(() => {
    if (lastAppliedFogStyleRevisionRef.current === fogSettings.styleRevision) return;
    lastAppliedFogStyleRevisionRef.current = fogSettings.styleRevision;
    hydratedFogStyleRef.current = { mapId, color: fogSettings.color, strokeWidth: fogSettings.strokeWidth };
    if (mapFog.length > 0) onFogsChange?.(mapFog.map(fog => fog.id), { style: { color: fogSettings.color, strokeWidth: fogSettings.strokeWidth } });
  }, [fogSettings.color, fogSettings.strokeWidth, fogSettings.styleRevision, mapFog, mapId, onFogsChange]);
  useEffect(() => {
    const existingStyle = [...mapFog].reverse().find(fog => fog.operation === 'cover')?.style ?? mapFog.at(-1)?.style;
    if (existingStyle) {
      hydratedFogStyleRef.current = { mapId, ...existingStyle };
      hydrateSessionMapFogStyle(existingStyle);
      return;
    }
    try {
      const stored = JSON.parse(window.localStorage.getItem(`hollowgate.map-fog-style.${mapId}`) ?? 'null');
      if (stored && typeof stored.color === 'string' && Number.isFinite(stored.strokeWidth)) {
        hydratedFogStyleRef.current = { mapId, color: stored.color, strokeWidth: stored.strokeWidth };
        hydrateSessionMapFogStyle({ color: stored.color, strokeWidth: stored.strokeWidth });
      } else hydratedFogStyleRef.current = { mapId, color: fogSettings.color, strokeWidth: fogSettings.strokeWidth };
    } catch { /* The default fog style remains available. */ }
  }, [mapFog, mapId]);
  useEffect(() => {
    const hydrated = hydratedFogStyleRef.current;
    if (!hydrated || hydrated.mapId !== mapId || hydrated.color !== fogSettings.color || hydrated.strokeWidth !== fogSettings.strokeWidth) return;
    window.localStorage.setItem(`hollowgate.map-fog-style.${mapId}`, JSON.stringify({ color: fogSettings.color, strokeWidth: fogSettings.strokeWidth }));
  }, [fogSettings.color, fogSettings.strokeWidth, mapId]);
  useEffect(() => {
    if (!fogClipboard || !isOwner) return;
    const paste = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'v' || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select') || target?.isContentEditable) return;
      event.preventDefault();
      const pointer = lastMapPointerRef.current;
      const point = pointer ? mapPointFromClient(pointer.clientX, pointer.clientY) : null;
      const now = new Date().toISOString();
      onFogCreate?.({ ...structuredClone(fogClipboard), id: crypto.randomUUID(), x: point ? point.x - fogClipboard.width / 2 : fogClipboard.x + 20 / view.scale, y: point ? point.y - fogClipboard.height / 2 : fogClipboard.y + 20 / view.scale, magnetGroupId: null, createdAt: now, updatedAt: now });
    };
    document.addEventListener('keydown', paste);
    return () => document.removeEventListener('keydown', paste);
  }, [fogClipboard, isOwner, onFogCreate, view.scale]);
  const [lineStart, setLineStart] = useState<SessionMapPoint | null>(null);
  const [lineHover, setLineHover] = useState<SessionMapPoint | null>(null);
  const [textDraft, setTextDraft] = useState<{
    point: SessionMapPoint;
    value: string;
    editingId?: string;
  } | null>(null);
  const textDraftRef = useRef<HTMLTextAreaElement>(null);
  const drawingMoveRef = useRef<DrawingMoveGesture | null>(null);
  const [drawingMoveDrafts, setDrawingMoveDrafts] = useState<Record<string, TokenPosition>>({});
  const [drawingTransformDrafts, setDrawingTransformDrafts] = useState<Record<string, SessionMapDrawing>>({});
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [pathEditDrawingId, setPathEditDrawingId] = useState<string | null>(null);
  const [drawingClipboard, setDrawingClipboard] = useState<SessionMapDrawing | null>(null);
  const [pastePrompt, setPastePrompt] = useState<{ x: number; y: number; point: SessionMapPoint; context: 'map' | 'drawing' | 'token'; pasteType: 'drawing' | 'fog' | 'poi' } | null>(null);
  const lastMapPointerRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const [drawingMenu, setDrawingMenu] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  useEffect(() => {
    if (activeTool !== 'fog') return;
    setSelectedTokenIds(new Set());
    setSelectedDrawingIds(new Set());
    setSelectedDrawingId(null);
    setHoveredDrawingId(null);
    setTransformTokenId(null);
    setTransformPoiId(null);
    setTokenMenu(null);
    setDrawingMenu(null);
    setPoiMenu(null);
    depthSelectionRef.current = null;
    setDepthHoveredKeys(new Set());
    setDepthSelectedKey(null);
  }, [activeTool]);
  useEffect(() => {
    const modeChanged = previousFogModeRef.current !== fogSettings.mode;
    previousFogModeRef.current = fogSettings.mode;
    if (activeTool !== 'fog' || modeChanged) {
      quickFogSelectionRef.current = null;
      setSelectedFogIds(new Set());
      setFogSelectionMenu(null);
      setFogMenu(null);
    }
  }, [activeTool, fogSettings.mode]);
  const [drawingStyleEditorOpen, setDrawingStyleEditorOpen] = useState(false);
  const [drawingLayerPanelOpen, setDrawingLayerPanelOpen] = useState(false);
  const [drawingTooltip, setDrawingTooltip] = useState<string | null>(null);
  const [tokenTooltip, setTokenTooltip] = useState<string | null>(null);
  const [poiTooltip, setPoiTooltip] = useState<string | null>(null);
  const [fogTooltip, setFogTooltip] = useState<string | null>(null);
  const fogTooltipHoveredRef = useRef<string | null>(null);
  useEffect(() => {
    if (poiMenu?.panel !== 'notes' || !campaignId) return;
    let cancelled = false;
    setPoiNotesLoading(true);
    void fetch(`https://${projectId}.supabase.co/functions/v1/make-server-771c5bfd/campaigns/${campaignId}/notes?entityType=campaign&entityId=${campaignId}`, {
      headers: { Authorization: `Bearer ${currentUserAccessToken ?? ''}` },
    }).then(async (response) => {
      if (!response.ok) throw new Error('Caricamento note non riuscito');
      const data = await response.json();
      if (cancelled) return;
      const notes = (Array.isArray(data.notes) ? data.notes : []).filter((note: any) => isOwner || (!note.hidden && (note.visibility ?? 'all') === 'all'));
      setPoiNoteOptions(notes.map((note: any) => ({ id: String(note.id), label: String(note.tab_name ?? 'Nota'), visibleToPlayers: !note.hidden && (note.visibility ?? 'all') === 'all' })));
    }).catch(() => { if (!cancelled) setPoiNoteOptions([]); }).finally(() => { if (!cancelled) setPoiNotesLoading(false); });
    return () => { cancelled = true; };
  }, [campaignId, currentUserAccessToken, isOwner, poiMenu?.panel]);
  const [drawingMagnetLink, setDrawingMagnetLink] = useState<{
    ids: string[];
    pointer: SessionMapPoint;
    hoveredId: string | null;
  } | null>(null);
  const menuDragRef = useRef<{
    pointerId: number;
    menu: 'token' | 'drawing' | 'poi' | 'fog';
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const [drawingMenuDetached, setDrawingMenuDetached] = useState(false);
  const drawingTransformRef = useRef<{
    pointerId: number;
    id: string;
    kind: 'resize' | 'rotate';
    corner?: 'nw' | 'ne' | 'sw' | 'se';
    startX: number;
    startY: number;
    origin: SessionMapDrawing;
    origins: Record<string, SessionMapDrawing>;
    drafts: Record<string, SessionMapDrawing>;
    centerX: number;
    centerY: number;
    startAngle: number;
  } | null>(null);
  const textCurveRef = useRef<{ pointerId: number; drawing: SessionMapDrawing; index: number; startX: number; startY: number; offsets: number[]; draft: SessionMapDrawing } | null>(null);
  const pathPointRef = useRef<{ pointerId: number; drawing: SessionMapDrawing; index: number; startX: number; startY: number; points: SessionMapPoint[]; draft: SessionMapDrawing } | null>(null);
  const conditionListRef = useRef<HTMLDivElement>(null);
  const placementRef = useRef(mapPlacement);
  const placementElementRef = useRef<HTMLDivElement>(null);
  const onMapPlacementChangeRef = useRef(onMapPlacementChange);
  onMapPlacementChangeRef.current = onMapPlacementChange;

  useEffect(() => {
    if (!tokenMenu && !drawingMenu && !poiMenu) return;
    const closeMenus = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[role="menu"], [data-map-paste-action]')) return;
      setTokenMenu(null);
      setDrawingMenu(null);
      setPoiMenu(null);
      setFogMenu(null);
    };
    document.addEventListener('pointerdown', closeMenus);
    return () => document.removeEventListener('pointerdown', closeMenus);
  }, [tokenMenu, drawingMenu, poiMenu]);
  useEffect(() => {
    if (!drawingMenu) setDrawingMenuDetached(false);
  }, [drawingMenu]);
  useEffect(() => {
    if (!tokenMenu) setTokenTooltip(null);
  }, [tokenMenu]);

  const { send: sendCampaignEvent } = useCampaignChannel(campaignId ?? mapId.split(':')[0], {
    onBroadcast: {
      map_measurement: (message) => {
        const payload = message?.payload;
        if (!payload || payload.mapId !== mapId || payload.senderId === measurementClientIdRef.current) return;
        if (payload.action === 'clear-sender' && typeof payload.senderId === 'string') {
          setRemoteMeasurements((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${payload.senderId}:`))));
          return;
        }
        const value = payload.measurement;
        if (!value || typeof payload.senderId !== 'string' || typeof value.id !== 'string' || !['line', 'circle', 'cone'].includes(value.mode)) return;
        const key = `${payload.senderId}:${value.id}`;
        const measurement: VisualMeasurement = {
          id: value.id,
          pointerId: -1,
          mode: value.mode,
          start: value.start,
          end: value.end,
        };
        setRemoteMeasurements((current) => ({
          ...current,
          [key]: measurement,
        }));
        remoteMeasurementTimersRef.current[key]?.forEach(clearTimeout);
        if (payload.action === 'finish')
          remoteMeasurementTimersRef.current[key] = [
            setTimeout(() => setRemoteMeasurements((current) => (current[key] ? { ...current, [key]: { ...current[key], fading: true } } : current)), 1600),
            setTimeout(
              () =>
                setRemoteMeasurements((current) => {
                  const next = { ...current };
                  delete next[key];
                  return next;
                }),
              2100,
            ),
          ];
      },
    },
  });

  useEffect(
    () =>
      registerSessionMapTokenDropHandler((visual, clientX, clientY, grabOffset) => {
        const rect = viewportRef.current?.getBoundingClientRect();
        const hitViewport = document.elementFromPoint(clientX, clientY)?.closest('[data-map-viewport]');
        if (!rect || hitViewport !== viewportRef.current || clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return false;
        const size = gridSettings.cellSize;
        const rawPosition = {
          x: (clientX - rect.left - view.x) / view.scale - size * grabOffset.x,
          y: (clientY - rect.top - view.y) / view.scale - size * grabOffset.y,
        };
        onTokenDrop?.(
          visual,
          snapToSessionGrid(rawPosition, gridSettings, {
            width: size,
            height: size,
          }),
          size,
        );
        return true;
      }),
    [gridSettings, onTokenDrop, view],
  );

  useEffect(() => {
    if (panRef.current?.target === 'map') return;
    placementRef.current = mapPlacement;
    setPlacement(mapPlacement);
  }, [mapPlacement]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(`hollowgate.map-view.${mapId}`, JSON.stringify(view));
      } catch {
        /* Pan and zoom still work without storage. */
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [mapId, view]);

  useEffect(() => {
    setSelectedTokenIds((current) => new Set([...current].filter((id) => mapTokens.some((token) => token.id === id && canMoveToken(token)))));
    if (!isOwner) {
      setTokenDraftPositions((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([id, position]) => {
            const token = mapTokens.find((candidate) => candidate.id === id);
            return !token || token.x !== position.x || token.y !== position.y;
          }),
        ),
      );
      setTokenDraftTransforms((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([id, transform]) => {
            const token = mapTokens.find((candidate) => candidate.id === id);
            return !token || token.x !== transform.x || token.y !== transform.y || token.size !== transform.size || (token.rotation ?? 0) !== transform.rotation;
          }),
        ),
      );
    }
  }, [isOwner, mapTokens]);

  useEffect(() => {
    const clearSelection = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedTokenIds(new Set());
        setCalibrationStart(null);
        setSessionMapCalibrationActive(false);
        setPastePrompt(null);
      }
    };
    window.addEventListener('keydown', clearSelection);
    return () => window.removeEventListener('keydown', clearSelection);
  }, []);

  useEffect(() => {
    if (!poiClipboard) return;
    const pastePoi = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'v') return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.matches('input, textarea, select') || target.isContentEditable)) return;
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pointer = lastMapPointerRef.current ?? { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
      const point = mapPointFromClient(pointer.clientX, pointer.clientY);
      if (!point) return;
      event.preventDefault();
      onPoiPaste?.(poiClipboard, point);
    };
    document.addEventListener('keydown', pastePoi);
    return () => document.removeEventListener('keydown', pastePoi);
  }, [onPoiPaste, poiClipboard, view]);

  useEffect(() => {
    if (!drawingClipboard) return;
    const handlePasteShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'v') return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.matches('input, textarea, select') || target.isContentEditable)) return;
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pointer = lastMapPointerRef.current ?? { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
      const point = mapPointFromClient(pointer.clientX, pointer.clientY);
      if (!point) return;
      event.preventDefault();
      pasteDrawingAt(point);
    };
    document.addEventListener('keydown', handlePasteShortcut);
    return () => {
      document.removeEventListener('keydown', handlePasteShortcut);
    };
  }, [drawingClipboard, isOwner, onDrawingCreate, view]);

  useEffect(() => {
    const deleteSelectedElements = (event: KeyboardEvent) => {
      if (event.key !== 'Delete') return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.matches('input, textarea, select') || target.isContentEditable)) return;
      let tokenIds = [...selectedTokenIds].filter((id) => mapTokens.some((token) => token.id === id && canControlToken(token)));
      let drawingIds = [...selectedDrawingIds].filter((id) => mapDrawings.some((drawing) => drawing.id === id && drawing.pinned !== true && (isOwner || (drawing.locked !== true && !!mapUserId && drawing.createdByProfileId === mapUserId))));
      if (tokenIds.length === 0 && drawingIds.length === 0 && hoveredMapElementRef.current) {
        const hovered = hoveredMapElementRef.current;
        if (hovered.type === 'token' && mapTokens.some((token) => token.id === hovered.id && canControlToken(token))) tokenIds = [hovered.id];
        if (hovered.type === 'drawing' && mapDrawings.some((drawing) => drawing.id === hovered.id && drawing.pinned !== true && (isOwner || (drawing.locked !== true && !!mapUserId && drawing.createdByProfileId === mapUserId)))) drawingIds = [hovered.id];
      }
      if (tokenIds.length === 0 && drawingIds.length === 0) return;
      event.preventDefault();
      if (tokenIds.length > 1 && !window.confirm(`Eliminare definitivamente i ${tokenIds.length} token selezionati?`)) return;
      if (tokenIds.length > 1) onTokensDelete?.(tokenIds);
      else if (tokenIds.length === 1) onTokenDelete?.(tokenIds[0]);
      if (drawingIds.length > 1) onDrawingsDelete?.(drawingIds);
      else if (drawingIds.length === 1) onDrawingDelete?.(drawingIds[0]);
      setSelectedTokenIds(new Set());
      setSelectedDrawingIds(new Set());
      setSelectedDrawingId(null);
      setPathEditDrawingId(null);
      setTokenMenu(null);
      setDrawingMenu(null);
    };
    document.addEventListener('keydown', deleteSelectedElements);
    return () => document.removeEventListener('keydown', deleteSelectedElements);
  }, [isOwner, mapDrawings, mapTokens, mapUserId, onDrawingDelete, onDrawingsDelete, onTokenDelete, onTokensDelete, selectedDrawingIds, selectedTokenIds]);

  useEffect(
    () => () => {
      visualMeasurementTimersRef.current.forEach(clearTimeout);
      Object.values(remoteMeasurementTimersRef.current).flat().forEach(clearTimeout);
      if (panFrameRef.current !== null) window.cancelAnimationFrame(panFrameRef.current);
      if (zoomFrameRef.current !== null) window.cancelAnimationFrame(zoomFrameRef.current);
      if (depthHoverFrameRef.current !== null) window.cancelAnimationFrame(depthHoverFrameRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!calibrationActive) setCalibrationStart(null);
  }, [calibrationActive]);

  useEffect(() => () => setSessionMapCalibrationActive(false), []);

  useEffect(() => {
    const keepViewInsideWorld = () => setView((current) => constrainViewToWorld(current));
    keepViewInsideWorld();
    window.addEventListener('resize', keepViewInsideWorld);
    return () => window.removeEventListener('resize', keepViewInsideWorld);
  }, [mapId]);

  useEffect(() => {
    if (measurementsVisibleToAll) return;
    void sendCampaignEvent('map_measurement', {
      action: 'clear-sender',
      mapId,
      senderId: measurementClientIdRef.current,
    });
  }, [mapId, measurementsVisibleToAll, sendCampaignEvent]);

  useEffect(() => {
    const centerMap = () => {
      const viewport = viewportRef.current;
      const element = placementElementRef.current;
      if (!viewport || !element) return;
      const rect = element.getBoundingClientRect();
      const width = rect.width / view.scale;
      const height = rect.height / view.scale;
      setView((current) => constrainViewToWorld({
        ...current,
        x: viewport.clientWidth / 2 - (placementRef.current.x + width / 2) * current.scale,
        y: viewport.clientHeight / 2 - (placementRef.current.y + height / 2) * current.scale,
      }));
    };
    configureSessionMapCenter(true, centerMap);
    return () => configureSessionMapCenter(false, null);
  }, [view.scale]);

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
      const next = {
        ...placementRef.current,
        x,
        y,
        width: fittedWidth,
        height: fittedHeight,
      };
      placementRef.current = next;
      setPlacement(next);
      onMapPlacementChangeRef.current?.(next);
    };
    configureSessionMapFit(available, fitMap);
    return () => configureSessionMapFit(false, null);
  }, [gridSettings.cellSize, gridSettings.type, isOwner, mapPlacement.locked, view.scale]);

  useEffect(() => {
    const fullMapFog = mapFog.filter(fog => fog.fullMap);
    setSessionMapFogFullMapCovered(fullMapFog.length > 0);
    if (!isOwner || !onFogCoverFullMap || !onFogsDelete) {
      configureSessionMapFogCoverFullMap(null);
      return;
    }
    configureSessionMapFogCoverFullMap(() => {
      if (fullMapFog.length > 0) {
        onFogsDelete(fullMapFog.map(fog => fog.id));
        return;
      }
      const element = placementElementRef.current;
      const width = placement.width ?? element?.offsetWidth;
      const height = placement.height ?? element?.offsetHeight;
      if (!width || !height) return;
      const now = new Date().toISOString();
      onFogCoverFullMap({ id: crypto.randomUUID(), kind: 'rectangle', operation: 'cover', persistence: 'permanent', opacity: 1, x: placement.x, y: placement.y, width, height, rotation: 0, style: { color: fogSettings.color, strokeWidth: fogSettings.strokeWidth }, enabled: true, locked: true, magnetEnabled: false, magnetGroupId: null, fullMap: true, createdAt: now, updatedAt: now });
    });
    return () => configureSessionMapFogCoverFullMap(null);
  }, [fogSettings.color, fogSettings.strokeWidth, isOwner, mapFog, onFogCoverFullMap, onFogsDelete, placement.height, placement.width, placement.x, placement.y]);

  useEffect(() => {
    if (!isOwner || !onFogsDelete) {
      configureSessionMapFogClear(null);
      return;
    }
    configureSessionMapFogClear(() => {
      if (mapFog.length > 0) onFogsDelete(mapFog.map(fog => fog.id));
    });
    return () => configureSessionMapFogClear(null);
  }, [isOwner, mapFog, onFogsDelete]);

  useEffect(() => {
    configureSessionMapFogSelectionClear(() => {
      quickFogSelectionRef.current = null;
      setSelectedFogIds(new Set());
      setFogSelectionMenu(null);
      setFogMenu(null);
    });
    return () => configureSessionMapFogSelectionClear(null);
  }, []);

  const zoom = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const pending = pendingZoomRef.current;
    pendingZoomRef.current = {
      deltaY: (pending?.deltaY ?? 0) + event.deltaY,
      pointerX: event.clientX - rect.left,
      pointerY: event.clientY - rect.top,
    };
    if (zoomFrameRef.current !== null) return;
    zoomFrameRef.current = window.requestAnimationFrame(() => {
      zoomFrameRef.current = null;
      const next = pendingZoomRef.current;
      pendingZoomRef.current = null;
      if (!next) return;
      setView((current) => {
        const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, current.scale * Math.exp(-next.deltaY * ZOOM_SENSITIVITY)));
        if (scale === current.scale) return current;
        const ratio = scale / current.scale;
        return constrainViewToWorld({
          scale,
          x: next.pointerX - (next.pointerX - current.x) * ratio,
          y: next.pointerY - (next.pointerY - current.y) * ratio,
        });
      });
    });
  };

  const worldPoint = (event: ReactPointerEvent<HTMLDivElement>): SelectionPoint | null => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: (event.clientX - rect.left - view.x) / view.scale,
      y: (event.clientY - rect.top - view.y) / view.scale,
    };
  };

  const mapPointFromClient = (clientX: number, clientY: number): SessionMapPoint | null => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { x: (clientX - rect.left - view.x) / view.scale, y: (clientY - rect.top - view.y) / view.scale };
  };
  const showPastePrompt = (clientX: number, clientY: number, context: 'map' | 'drawing' | 'token', pasteType: 'drawing' | 'fog' | 'poi' = 'drawing') => {
    const clipboard = pasteType === 'drawing' ? drawingClipboard : pasteType === 'fog' ? fogClipboard : poiClipboard;
    if (!clipboard) return;
    const rect = viewportRef.current?.getBoundingClientRect();
    const point = mapPointFromClient(clientX, clientY);
    if (!rect || !point) return;
    setPastePrompt({ x: clientX - rect.left, y: clientY - rect.top, point, context, pasteType });
  };
  const pasteDrawingAt = (point: SessionMapPoint) => {
    if (!drawingClipboard || !isOwner) return;
    const now = new Date().toISOString();
    const copy = structuredClone(drawingClipboard);
    const visualCenter = drawingVisualCenter(copy);
    onDrawingCreate?.({
      ...copy,
      id: crypto.randomUUID(),
      x: point.x - visualCenter.x,
      y: point.y - visualCenter.y,
      magnetEnabled: false,
      magnetGroupId: null,
      pinned: false,
      createdAt: now,
      updatedAt: now,
    });
    setPastePrompt(null);
    setTokenMenu(null);
    setDrawingMenu(null);
  };

  const pasteFogAt = (point: SessionMapPoint) => {
    if (!fogClipboard || !isOwner) return;
    const now = new Date().toISOString();
    const copy = structuredClone(fogClipboard);
    onFogCreate?.({
      ...copy,
      id: crypto.randomUUID(),
      x: point.x,
      y: point.y,
      magnetEnabled: false,
      magnetGroupId: null,
      createdAt: now,
      updatedAt: now,
    });
    setPastePrompt(null);
    setActiveSessionMapTool('fog');
  };

  const pastePoiAt = (point: SessionMapPoint) => {
    if (!poiClipboard) return;
    const now = new Date().toISOString();
    const copy = structuredClone(poiClipboard);
    onPoiPaste?.(copy, point);
    setPastePrompt(null);
  };

  const measurementPoint = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = mapPointFromClient(event.clientX, event.clientY);
    return point ? snapToSessionGrid(point, gridSettings) : null;
  };

  const captureCalibrationPoint = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!calibrationActive || event.button !== 0) return false;
    const point = worldPoint(event);
    if (!point) return false;
    event.preventDefault();
    if (!calibrationStart) {
      setCalibrationStart(point);
      return true;
    }
    const deltaX = Math.abs(point.x - calibrationStart.x);
    const deltaY = Math.abs(point.y - calibrationStart.y);
    const axisDistance = Math.max(deltaX, deltaY);
    const estimatedCells = Math.max(1, Math.round(axisDistance / Math.max(1, gridSettings.cellSize)));
    const answer = window.prompt('Quante caselle ci sono tra i due punti selezionati?', String(estimatedCells));
    const cells = Number(answer?.replace(',', '.'));
    if (answer !== null && Number.isFinite(cells) && cells > 0 && axisDistance > 0) {
      const cellSize = axisDistance / cells;
      const modulo = (value: number) => ((value % cellSize) + cellSize) % cellSize;
      updateSessionGrid({
        cellSize,
        originX: modulo(calibrationStart.x),
        originY: modulo(calibrationStart.y),
        visible: true,
      });
    }
    setCalibrationStart(null);
    setSessionMapCalibrationActive(false);
    return true;
  };

  const broadcastMeasurement = (action: 'update' | 'finish', measurement: VisualMeasurement) => {
    if (!measurementsVisibleToAll) return;
    void sendCampaignEvent('map_measurement', {
      action,
      mapId,
      senderId: measurementClientIdRef.current,
      measurement: {
        id: measurement.id,
        mode: measurement.mode,
        start: measurement.start,
        end: measurement.end,
      },
    });
  };

  const beginVisualMeasurement = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activeTool !== 'measure' || (measureMode !== 'line' && measureMode !== 'circle' && measureMode !== 'cone') || event.button !== 0) return false;
    const point = measurementPoint(event);
    if (!point) return false;
    visualMeasurementTimersRef.current.forEach(clearTimeout);
    visualMeasurementTimersRef.current = [];
    const measurement: VisualMeasurement = {
      id: crypto.randomUUID(),
      pointerId: event.pointerId,
      mode: measureMode,
      start: point,
      end: point,
    };
    visualMeasurementRef.current = measurement;
    setVisualMeasurement(measurement);
    broadcastMeasurement('update', measurement);
    setTokenMenu(null);
    setTransformTokenId(null);
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    return true;
  };

  const moveVisualMeasurement = (event: ReactPointerEvent<HTMLDivElement>) => {
    const measurement = visualMeasurementRef.current;
    if (!measurement || measurement.pointerId !== event.pointerId) return false;
    const end = measurementPoint(event);
    if (end) {
      measurement.end = end;
      setVisualMeasurement({ ...measurement });
      if (performance.now() - lastMeasurementBroadcastRef.current >= 50) {
        lastMeasurementBroadcastRef.current = performance.now();
        broadcastMeasurement('update', measurement);
      }
    }
    return true;
  };

  const finishVisualMeasurement = (event: ReactPointerEvent<HTMLDivElement>) => {
    const measurement = visualMeasurementRef.current;
    if (!measurement || measurement.pointerId !== event.pointerId) return false;
    const end = measurementPoint(event);
    if (end) measurement.end = end;
    visualMeasurementRef.current = null;
    setVisualMeasurement({ ...measurement });
    broadcastMeasurement('finish', measurement);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    visualMeasurementTimersRef.current = [
      setTimeout(() => setVisualMeasurement((current) => (current ? { ...current, fading: true } : null)), 1600),
      setTimeout(() => {
        setVisualMeasurement(null);
        visualMeasurementTimersRef.current = [];
      }, 2100),
    ];
    return true;
  };

  const draftFromGesture = (gesture: DrawingGesture) => buildDrawing(gesture.mode as SessionMapDrawingKind, gesture.mode === 'freehand' ? gesture.points : [gesture.start, gesture.current], drawSettings.style);

  const beginDrawing = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isOwner || activeTool !== 'draw' || event.button !== 0 || (event.target as Element).closest('[data-map-interactive]')) return false;
    const point = worldPoint(event);
    if (!point) return false;
    setSelectedDrawingId(null);
    drawingTransformRef.current = null;
    setDrawingDraft(null);
    if (drawSettings.mode === 'polygon') {
      event.preventDefault();
      if (polygonPoints.length >= 3 && Math.hypot(point.x - polygonPoints[0].x, point.y - polygonPoints[0].y) <= 14 / view.scale) {
        const drawing = buildDrawing('polygon', polygonPoints, drawSettings.style);
        if (drawing) onDrawingCreate?.(drawing);
        setPolygonPoints([]);
        setPolygonHover(null);
      } else setPolygonPoints((current) => [...current, point]);
      return true;
    }
    if (drawSettings.mode === 'line') {
      event.preventDefault();
      if (!lineStart) {
        setLineStart(point);
        setLineHover(point);
      } else {
        const drawing = buildDrawing('line', [lineStart, point], drawSettings.style);
        if (drawing) onDrawingCreate?.(drawing);
        setLineStart(null);
        setLineHover(null);
      }
      return true;
    }
    if (drawSettings.mode === 'text') {
      event.preventDefault();
      setTextDraft({ point, value: '' });
      return true;
    }
    if (drawSettings.mode === 'grab') {
      setSelectedDrawingId(null);
      setDrawingMenu(null);
      event.preventDefault();
      return true;
    }
    if (drawSettings.mode === 'eraser') return false;
    const gesture: DrawingGesture = {
      pointerId: event.pointerId,
      mode: drawSettings.mode,
      start: point,
      current: point,
      points: [point],
    };
    drawingGestureRef.current = gesture;
    setDrawingDraft(draftFromGesture(gesture));
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    return true;
  };

  const moveDrawing = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drawingMagnetLink) {
      const pointer = worldPoint(event);
      if (pointer) setDrawingMagnetLink((current) => (current ? { ...current, pointer } : null));
      return true;
    }
    if (activeTool === 'draw' && drawSettings.mode === 'polygon' && polygonPoints.length > 0) setPolygonHover(worldPoint(event));
    if (activeTool === 'draw' && drawSettings.mode === 'line' && lineStart) setLineHover(worldPoint(event));
    const gesture = drawingGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return false;
    const point = worldPoint(event);
    if (!point) return true;
    gesture.current = point;
    if (gesture.mode === 'freehand') {
      const last = gesture.points[gesture.points.length - 1];
      if (Math.hypot(point.x - last.x, point.y - last.y) >= 2 / view.scale) gesture.points.push(point);
    }
    setDrawingDraft(draftFromGesture(gesture));
    return true;
  };

  const finishDrawing = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = drawingGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return false;
    const point = worldPoint(event);
    if (point) {
      gesture.current = point;
      if (gesture.mode === 'freehand') gesture.points.push(point);
    }
    const drawing = draftFromGesture(gesture);
    if (drawing) onDrawingCreate?.(drawing);
    drawingGestureRef.current = null;
    setDrawingDraft(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    return true;
  };

  const finishDrawingMagnetLink = () => {
    if (!drawingMagnetLink) return;
    if (drawingMagnetLink.ids.length >= 2) onDrawingsCreateMagnetGroup?.(drawingMagnetLink.ids);
    setDrawingMagnetLink(null);
  };

  const commitTextDraft = () => {
    if (!textDraft) return;
    const content = textDraft.value.trim();
    if (content) {
      const source = textDraft.editingId ? mapDrawings.find((item) => item.id === textDraft.editingId) : undefined;
      const text = { ...(source?.text ?? drawSettings.textStyle), content };
      const bounds = measureMapText(text, source?.style.strokeWidth ?? drawSettings.style.strokeWidth);
      const now = new Date().toISOString();
      if (source) onDrawingChange?.(source.id, { ...bounds, text });
      else
        onDrawingCreate?.({
          id: crypto.randomUUID(),
          kind: 'text',
          x: textDraft.point.x,
          y: textDraft.point.y,
          ...bounds,
          rotation: 0,
          style: { ...drawSettings.style, fillOpacity: 0 },
          text,
          locked: false,
          pinned: false,
          visible: true,
          magnetEnabled: false,
          magnetGroupId: null,
          createdAt: now,
          updatedAt: now,
        });
    }
    setTextDraft(null);
  };

  useEffect(() => {
    if (textDraft)
      requestAnimationFrame(() => {
        const input = textDraftRef.current;
        input?.focus();
        input?.setSelectionRange(input.value.length, input.value.length);
      });
  }, [Boolean(textDraft)]);
  useEffect(() => {
    if (!textDraft) return;
    const confirm = (event: PointerEvent) => {
      if (event.button === 0 && !(event.target as Element)?.closest('[data-map-text-draft]')) commitTextDraft();
    };
    const cancel = (event: MouseEvent) => {
      event.preventDefault();
      setTextDraft(null);
    };
    document.addEventListener('pointerdown', confirm, true);
    document.addEventListener('contextmenu', cancel, true);
    return () => {
      document.removeEventListener('pointerdown', confirm, true);
      document.removeEventListener('contextmenu', cancel, true);
    };
  }, [textDraft, drawSettings.style, drawSettings.textStyle, onDrawingCreate]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && textDraft) {
        event.preventDefault();
        setTextDraft(null);
        return;
      }
      if (event.key === 'Escape' && drawingMagnetLink) {
        event.preventDefault();
        finishDrawingMagnetLink();
        return;
      }
      if (event.key === 'Escape') {
        setSessionMapSelectionArmed(false);
        setSelectedTokenIds(new Set());
        setPolygonPoints([]);
        setPolygonHover(null);
        setLineStart(null);
        setLineHover(null);
        setSelectedDrawingId(null);
        setPathEditDrawingId(null);
        setSelectedDrawingIds(new Set());
        setDrawingMenu(null);
        drawingTransformRef.current = null;
        textCurveRef.current = null;
        pathPointRef.current = null;
        drawingMoveRef.current = null;
        setDrawingDraft(null);
        setDrawingMoveDrafts({});
        setDrawingTransformDrafts({});
      }
      if (event.key === 'Enter' && polygonPoints.length >= 3) {
        const drawing = buildDrawing('polygon', polygonPoints, drawSettings.style);
        if (drawing) onDrawingCreate?.(drawing);
        setPolygonPoints([]);
        setPolygonHover(null);
      }
    };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [polygonPoints, drawSettings.style, onDrawingCreate, drawingMagnetLink, textDraft]);

  useEffect(() => {
    if (activeTool === 'draw' && drawSettings.mode === 'polygon') return;
    setPolygonPoints([]);
    setPolygonHover(null);
  }, [activeTool, drawSettings.mode, mapId]);

  useEffect(() => {
    if (activeTool === 'draw' && drawSettings.mode === 'line') return;
    setLineStart(null);
    setLineHover(null);
  }, [activeTool, drawSettings.mode, mapId]);

  useEffect(() => {
    if (!textDraft?.editingId && (activeTool !== 'draw' || drawSettings.mode !== 'text')) setTextDraft(null);
  }, [activeTool, drawSettings.mode, mapId, textDraft?.editingId]);

  const beginDrawingMove = (event: ReactPointerEvent<SVGElement>, drawing: SessionMapDrawing) => {
    if (!isOwner || drawing.pinned || calibrationActive || activeTool === 'measure' || event.button !== 0) return;
    if (selectionArmed && !selectedDrawingIds.has(drawing.id)) {
      setSelectedTokenIds(new Set());
      setSelectedDrawingIds(new Set());
      setSelectedDrawingId(null);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    drawingTransformRef.current = null;
    textCurveRef.current = null;
    setDrawingDraft(null);
    setSelectedDrawingId(null);
    const selectionMembers = selectedDrawingIds.has(drawing.id) ? mapDrawings.filter((item) => selectedDrawingIds.has(item.id) && (isOwner || !item.locked)) : [];
    if (selectionMembers.length === 0) setSelectedDrawingIds(new Set());
    const members = selectionMembers.length > 0 ? selectionMembers : drawing.magnetGroupId ? mapDrawings.filter((item) => item.magnetGroupId === drawing.magnetGroupId && (isOwner || !item.locked)) : [drawing];
    const origins = Object.fromEntries(members.map((item) => [item.id, { x: item.x, y: item.y }]));
    const selectedTokens = selectionMembers.length > 0 ? mapTokens.filter((item) => selectedTokenIds.has(item.id) && canMoveToken(item)) : [];
    const tokenOrigins = Object.fromEntries(
      selectedTokens.map((item) => {
        const position = tokenDraftPositions[item.id] ?? remoteTokenPositions[item.id] ?? item;
        return [item.id, { x: position.x, y: position.y }];
      }),
    );
    drawingMoveRef.current = {
      pointerId: event.pointerId,
      id: drawing.id,
      startX: event.clientX,
      startY: event.clientY,
      origins,
      positions: origins,
      tokenOrigins,
      tokenPositions: tokenOrigins,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveSelectedDrawing = (event: ReactPointerEvent<SVGElement>) => {
    const gesture = drawingMoveRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const dx = (event.clientX - gesture.startX) / view.scale;
    const dy = (event.clientY - gesture.startY) / view.scale;
    gesture.positions = Object.fromEntries(Object.entries(gesture.origins).map(([id, origin]) => [id, { x: origin.x + dx, y: origin.y + dy }]));
    gesture.tokenPositions = Object.fromEntries(Object.entries(gesture.tokenOrigins).map(([id, origin]) => [id, { x: origin.x + dx, y: origin.y + dy }]));
    setDrawingMoveDrafts(gesture.positions);
    setTokenDraftPositions((current) => ({
      ...current,
      ...gesture.tokenPositions,
    }));
  };
  const finishSelectedDrawing = (event: ReactPointerEvent<SVGElement>) => {
    const gesture = drawingMoveRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const dx = (event.clientX - gesture.startX) / view.scale;
    const dy = (event.clientY - gesture.startY) / view.scale;
    const positions = Object.fromEntries(Object.entries(gesture.origins).map(([id, origin]) => [id, { x: origin.x + dx, y: origin.y + dy }]));
    const tokenPositions = Object.fromEntries(Object.entries(gesture.tokenOrigins).map(([id, origin]) => [id, { x: origin.x + dx, y: origin.y + dy }]));
    onDrawingsMove?.(positions);
    if (Object.keys(tokenPositions).length > 0) onTokensMove?.(tokenPositions);
    drawingMoveRef.current = null;
    setDrawingMoveDrafts({});
    setTokenDraftPositions((current) => {
      const next = { ...current };
      Object.keys(tokenPositions).forEach((id) => delete next[id]);
      return next;
    });
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const beginDrawingTransform = (event: ReactPointerEvent<SVGElement>, drawing: SessionMapDrawing, kind: 'resize' | 'rotate', corner?: 'nw' | 'ne' | 'sw' | 'se') => {
    event.preventDefault();
    event.stopPropagation();
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const normalizedDrawing = withMeasuredTextBounds(drawing);
    const centerX = rect.left + view.x + (normalizedDrawing.x + normalizedDrawing.width / 2) * view.scale;
    const centerY = rect.top + view.y + (normalizedDrawing.y + normalizedDrawing.height / 2) * view.scale;
    const members = (selectedDrawingIds.has(drawing.id) ? mapDrawings.filter((item) => selectedDrawingIds.has(item.id) && (isOwner || !item.locked)) : [drawing]).map(withMeasuredTextBounds);
    const origins = Object.fromEntries(members.map((item) => [item.id, item]));
    drawingTransformRef.current = {
      pointerId: event.pointerId,
      id: drawing.id,
      kind,
      corner,
      startX: event.clientX,
      startY: event.clientY,
      origin: normalizedDrawing,
      origins,
      drafts: origins,
      centerX,
      centerY,
      startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrawingTransform = (event: ReactPointerEvent<SVGElement>) => {
    const gesture = drawingTransformRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const origin = gesture.origin;
    if (gesture.kind === 'rotate') {
      const angle = Math.atan2(event.clientY - gesture.centerY, event.clientX - gesture.centerX);
      const delta = ((angle - gesture.startAngle) * 180) / Math.PI;
      gesture.drafts = Object.fromEntries(Object.entries(gesture.origins).map(([id, item]) => [id, { ...item, rotation: item.rotation + delta }]));
      setDrawingTransformDrafts(gesture.drafts);
      return;
    }
    const dx = (event.clientX - gesture.startX) / view.scale;
    const dy = (event.clientY - gesture.startY) / view.scale;
    const west = gesture.corner?.includes('w');
    const north = gesture.corner?.includes('n');
    const width = Math.max(8, origin.width + (west ? -dx : dx));
    const height = Math.max(8, origin.height + (north ? -dy : dy));
    const scaleX = width / origin.width;
    const scaleY = height / origin.height;
    gesture.drafts = Object.fromEntries(
      Object.entries(gesture.origins).map(([id, item]) => {
        const itemWidth = Math.max(8, item.width * scaleX);
        const itemHeight = Math.max(8, item.height * scaleY);
        const text = item.text
          ? {
              ...item.text,
              fontSize: Math.max(1, item.text.fontSize * scaleY),
              horizontalScale: ((item.text.horizontalScale ?? 1) * scaleX) / scaleY,
              curveOffsets: item.text.curveOffsets?.map((offset) => offset * (item.text?.orientation === 'vertical' ? scaleX : scaleY)),
            }
          : undefined;
        return [
          id,
          {
            ...item,
            x: item.x + (item.width - itemWidth) / 2,
            y: item.y + (item.height - itemHeight) / 2,
            width: itemWidth,
            height: itemHeight,
            points: item.points?.map((point) => ({
              x: (point.x * itemWidth) / item.width,
              y: (point.y * itemHeight) / item.height,
            })),
            text,
          },
        ];
      }),
    );
    setDrawingTransformDrafts(gesture.drafts);
  };
  const finishDrawingTransform = (event: ReactPointerEvent<SVGElement>) => {
    const gesture = drawingTransformRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const updates = Object.fromEntries(
      Object.entries(gesture.drafts).map(([id, draft]) => [
        id,
        {
          x: draft.x,
          y: draft.y,
          width: draft.width,
          height: draft.height,
          rotation: draft.rotation,
          points: draft.points,
          text: draft.text,
        },
      ]),
    );
    onDrawingTransformsChange?.(updates);
    drawingTransformRef.current = null;
    setDrawingTransformDrafts({});
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const beginTextCurve = (event: ReactPointerEvent<SVGRectElement>, drawing: SessionMapDrawing, index: number) => {
    if (!drawing.text) return;
    event.preventDefault();
    event.stopPropagation();
    const offsets = normalizedTextCurveOffsets(drawing.text);
    textCurveRef.current = { pointerId: event.pointerId, drawing, index, startX: event.clientX, startY: event.clientY, offsets, draft: drawing };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveTextCurve = (event: ReactPointerEvent<SVGRectElement>) => {
    const gesture = textCurveRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || !gesture.drawing.text) return;
    const vertical = gesture.drawing.text.orientation === 'vertical';
    const delta = (vertical ? event.clientX - gesture.startX : event.clientY - gesture.startY) / view.scale;
    const curveOffsets = gesture.offsets.map((offset, index) => (index === gesture.index ? offset + delta : offset));
    gesture.draft = { ...gesture.drawing, text: { ...gesture.drawing.text, curveOffsets } };
    setDrawingTransformDrafts({ [gesture.drawing.id]: gesture.draft });
  };
  const finishTextCurve = (event: ReactPointerEvent<SVGRectElement>) => {
    const gesture = textCurveRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    onDrawingTransformsChange?.({ [gesture.drawing.id]: { text: gesture.draft.text } });
    textCurveRef.current = null;
    setDrawingTransformDrafts({});
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const beginPathPointMove = (event: ReactPointerEvent<SVGCircleElement>, drawing: SessionMapDrawing, index: number) => {
    if (!drawing.points) return;
    event.preventDefault();
    event.stopPropagation();
    const points = drawing.points.map((point) => ({ ...point }));
    pathPointRef.current = { pointerId: event.pointerId, drawing, index, startX: event.clientX, startY: event.clientY, points, draft: drawing };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const movePathPoint = (event: ReactPointerEvent<SVGCircleElement>) => {
    const gesture = pathPointRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const dx = (event.clientX - gesture.startX) / view.scale;
    const dy = (event.clientY - gesture.startY) / view.scale;
    const angle = (-gesture.drawing.rotation * Math.PI) / 180;
    const localDx = dx * Math.cos(angle) - dy * Math.sin(angle);
    const localDy = dx * Math.sin(angle) + dy * Math.cos(angle);
    const points = gesture.points.map((point, index) => (index === gesture.index ? { x: point.x + localDx, y: point.y + localDy } : point));
    gesture.draft = { ...gesture.drawing, points };
    setDrawingTransformDrafts({ [gesture.drawing.id]: gesture.draft });
  };
  const finishPathPointMove = (event: ReactPointerEvent<SVGCircleElement>) => {
    const gesture = pathPointRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    onDrawingTransformsChange?.({ [gesture.drawing.id]: { points: gesture.draft.points } });
    pathPointRef.current = null;
    setDrawingTransformDrafts({});
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const beginSelection = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activeTool !== 'select' || !selectionArmed || event.button !== 0 || (event.target as Element).closest('[data-map-interactive]')) return false;
    const point = worldPoint(event);
    if (!point) return false;
    const gesture: SelectionGesture = {
      pointerId: event.pointerId,
      mode: selectionMode,
      start: point,
      current: point,
      points: [point],
    };
    selectionGestureRef.current = gesture;
    setSelectionDraft(gesture);
    setTokenMenu(null);
    setTransformTokenId(null);
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    return true;
  };

  const moveSelection = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = selectionGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return false;
    const point = worldPoint(event);
    if (!point) return true;
    gesture.current = point;
    const last = gesture.points[gesture.points.length - 1];
    if (gesture.mode === 'freehand' && Math.hypot(point.x - last.x, point.y - last.y) >= 4 / view.scale) gesture.points.push(point);
    setSelectionDraft({ ...gesture, points: [...gesture.points] });
    return true;
  };

  const finishSelection = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = selectionGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return false;
    const point = worldPoint(event) ?? gesture.current;
    gesture.current = point;
    let selected: SessionMapToken[] = [];
    let selectedDrawings: SessionMapDrawing[] = [];
    if (gesture.mode === 'rectangle') {
      const bounds = {
        x: Math.min(gesture.start.x, point.x),
        y: Math.min(gesture.start.y, point.y),
        width: Math.abs(point.x - gesture.start.x),
        height: Math.abs(point.y - gesture.start.y),
      };
      const rectangle = [
        { x: bounds.x, y: bounds.y },
        { x: bounds.x + bounds.width, y: bounds.y },
        { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
        { x: bounds.x, y: bounds.y + bounds.height },
      ];
      selected = mapTokens.filter((token) => canMoveToken(token) && rectangleCoverage(getTokenBounds(token, gridSettings.cellSize), bounds) > 0);
      selectedDrawings = mapDrawings.filter(
        (drawing) =>
          !drawing.pinned &&
          (isOwner || !drawing.locked) &&
          (drawing.points?.length
            ? drawingPathIntersectsPolygon(drawing, rectangle)
            : rectangleCoverage(
                {
                  x: drawing.x,
                  y: drawing.y,
                  width: drawing.width,
                  height: drawing.height,
                },
                bounds,
              ) > 0),
      );
    } else if (gesture.points.length >= 3 && Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) <= 24 / view.scale) {
      const polygon = [...gesture.points, gesture.start];
      selected = mapTokens.filter((token) => canMoveToken(token) && polygonCoverage(getTokenBounds(token, gridSettings.cellSize), polygon) > 0);
      selectedDrawings = mapDrawings.filter(
        (drawing) =>
          !drawing.pinned &&
          (isOwner || !drawing.locked) &&
          (drawing.points?.length
            ? drawingPathIntersectsPolygon(drawing, polygon)
            : polygonCoverage(
                {
                  x: drawing.x,
                  y: drawing.y,
                  width: drawing.width,
                  height: drawing.height,
                },
                polygon,
              ) > 0),
      );
    }
    setSelectedTokenIds(new Set(selected.map((token) => token.id)));
    setSelectedDrawingIds(new Set(selectedDrawings.map((drawing) => drawing.id)));
    selectionGestureRef.current = null;
    setSelectionDraft(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    return true;
  };

  const beginPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const viewPan = event.button === 1;
    if (!viewPan && (!(PAN_ENABLED_TOOLS.has(activeTool) || (activeTool === 'select' && !selectionArmed)) || event.button !== 0 || (event.target as Element).closest('[data-map-interactive]'))) return;
    setTokenMenu(null);
    setTransformTokenId(null);
    event.preventDefault();
    const target = !viewPan && isOwner && !mapPlacement.locked && (event.target as Element).closest('[data-map-placement]') ? 'map' : 'view';
    setMoveTargetAvailable(target === 'map');
    const origin = target === 'map' ? placementRef.current : view;
    const targetElement = target === 'map' ? (event.target as Element).closest('[data-map-placement]') : null;
    const targetRect = targetElement?.getBoundingClientRect();
    const objectSize = targetRect
      ? {
          width: targetRect.width / view.scale,
          height: targetRect.height / view.scale,
        }
      : { width: 0, height: 0 };
    panRef.current = {
      pointerId: event.pointerId,
      target,
      startX: event.clientX,
      startY: event.clientY,
      originX: origin.x,
      originY: origin.y,
      objectSize,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setPanning(true);
  };

  const applyPanPoint = (pan: PanGesture, clientX: number, clientY: number) => {
    const deltaX = clientX - pan.startX;
    const deltaY = clientY - pan.startY;
    if (pan.target === 'map') {
      const snapped = snapToSessionGrid(
        {
          x: pan.originX + deltaX / view.scale,
          y: pan.originY + deltaY / view.scale,
        },
        gridSettings,
        pan.objectSize,
      );
      const next = { ...placementRef.current, ...snapped };
      placementRef.current = next;
      setPlacement(next);
    } else {
      setView((current) => constrainViewToWorld({
        ...current,
        x: pan.originX + deltaX,
        y: pan.originY + deltaY,
      }));
    }
  };

  const movePan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (!pan) {
      setMoveTargetAvailable((event.target as Element).closest('[data-map-movable="true"]') !== null);
      return;
    }
    if (pan.pointerId !== event.pointerId) return;
    pendingPanPointRef.current = { clientX: event.clientX, clientY: event.clientY };
    if (panFrameRef.current !== null) return;
    panFrameRef.current = window.requestAnimationFrame(() => {
      panFrameRef.current = null;
      const currentPan = panRef.current;
      const point = pendingPanPointRef.current;
      pendingPanPointRef.current = null;
      if (currentPan && point) applyPanPoint(currentPan, point.clientX, point.clientY);
    });
  };

  const finishPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    if (panFrameRef.current !== null) {
      window.cancelAnimationFrame(panFrameRef.current);
      panFrameRef.current = null;
    }
    pendingPanPointRef.current = null;
    applyPanPoint(pan, event.clientX, event.clientY);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (pan.target === 'map') onMapPlacementChange?.(placementRef.current);
    panRef.current = null;
    setPanning(false);
  };

  const canControlPoi = (poi: SessionMapPoi) => !poi.pinned && (isOwner || (!poi.locked && !!mapUserId && poi.createdByProfileId === mapUserId));
  const menuPositionFromBounds = (bounds: { left: number; right: number; top: number; bottom: number }, menuWidth = 390, menuHeight = 420) => {
    const viewportRect = viewportRef.current?.getBoundingClientRect();
    if (!viewportRect) return null;
    const gap = 20;
    const candidates = [
      { x: bounds.right + gap, y: (bounds.top + bounds.bottom - menuHeight) / 2 },
      { x: bounds.left - menuWidth - gap, y: (bounds.top + bounds.bottom - menuHeight) / 2 },
      { x: (bounds.left + bounds.right - menuWidth) / 2, y: bounds.bottom + gap },
      { x: (bounds.left + bounds.right - menuWidth) / 2, y: bounds.top - menuHeight - gap },
    ];
    const fitting = candidates.find(position => position.x >= 8 && position.y >= 8 && position.x + menuWidth <= viewportRect.width - 8 && position.y + menuHeight <= viewportRect.height - 8) ?? candidates[0];
    return { x: Math.max(8, Math.min(fitting.x, viewportRect.width - menuWidth - 8)), y: Math.max(8, Math.min(fitting.y, viewportRect.height - menuHeight - 8)) };
  };
  const menuPositionBeside = (target: Element, menuWidth = 390, menuHeight = 420) => {
    const viewportRect = viewportRef.current?.getBoundingClientRect();
    if (!viewportRect) return null;
    const targetRect = target.getBoundingClientRect();
    return menuPositionFromBounds({ left: targetRect.left - viewportRect.left, right: targetRect.right - viewportRect.left, top: targetRect.top - viewportRect.top, bottom: targetRect.bottom - viewportRect.top }, menuWidth, menuHeight);
  };
  const menuPositionBesideMapBounds = (bounds: { x: number; y: number; width: number; height: number }) => menuPositionFromBounds({
    left: view.x + bounds.x * view.scale,
    right: view.x + (bounds.x + bounds.width) * view.scale,
    top: view.y + bounds.y * view.scale,
    bottom: view.y + (bounds.y + bounds.height) * view.scale,
  });
  const beginPoiMove = (event: ReactPointerEvent<HTMLButtonElement>, poi: SessionMapPoi) => {
    if (event.button !== 0 || !canControlPoi(poi)) return;
    event.preventDefault();
    event.stopPropagation();
    setPoiMenu(null);
    const origin = poiDraftPositions[poi.id] ?? poi;
    poiMoveRef.current = { pointerId: event.pointerId, poiId: poi.id, startX: event.clientX, startY: event.clientY, origin, position: origin };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const movePoi = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const gesture = poiMoveRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gesture.position = { x: gesture.origin.x + (event.clientX - gesture.startX) / view.scale, y: gesture.origin.y + (event.clientY - gesture.startY) / view.scale };
    setPoiDraftPositions((current) => ({ ...current, [gesture.poiId]: gesture.position }));
  };
  const finishPoiMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const gesture = poiMoveRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    poiMoveRef.current = null;
    onPoiMove?.(gesture.poiId, gesture.position);
    if (isOwner)
      setPoiDraftPositions((current) => {
        const next = { ...current };
        delete next[gesture.poiId];
        return next;
      });
  };
  const beginPoiTransform = (event: ReactPointerEvent<SVGElement>, poi: SessionMapPoi, kind: 'resize' | 'rotate') => {
    if (event.button !== 0 || !canControlPoi(poi)) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const position = poiDraftPositions[poi.id] ?? poi;
    const origin = poiDraftTransforms[poi.id] ?? { size: poi.size, rotation: poi.rotation ?? 0 };
    const centerClientX = rect.left + view.x + position.x * view.scale;
    const centerClientY = rect.top + view.y + position.y * view.scale;
    poiTransformRef.current = {
      pointerId: event.pointerId,
      poiId: poi.id,
      kind,
      centerClientX,
      centerClientY,
      startDistance: Math.max(1, Math.hypot(event.clientX - centerClientX, event.clientY - centerClientY)),
      startAngle: Math.atan2(event.clientY - centerClientY, event.clientX - centerClientX),
      origin,
      draft: origin,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const movePoiTransform = (event: ReactPointerEvent<SVGElement>) => {
    const gesture = poiTransformRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (gesture.kind === 'resize') {
      const factor = Math.hypot(event.clientX - gesture.centerClientX, event.clientY - gesture.centerClientY) / gesture.startDistance;
      gesture.draft = { ...gesture.origin, size: Math.min(240, Math.max(8, gesture.origin.size * factor)) };
    } else {
      const angle = Math.atan2(event.clientY - gesture.centerClientY, event.clientX - gesture.centerClientX);
      gesture.draft = { ...gesture.origin, rotation: Math.round((gesture.origin.rotation + ((angle - gesture.startAngle) * 180) / Math.PI) * 10) / 10 };
    }
    setPoiDraftTransforms((current) => ({ ...current, [gesture.poiId]: gesture.draft }));
  };
  const finishPoiTransform = (event: ReactPointerEvent<SVGElement>) => {
    const gesture = poiTransformRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    poiTransformRef.current = null;
    onPoiChange?.(gesture.poiId, gesture.draft);
    if (isOwner) setPoiDraftTransforms((current) => { const next = { ...current }; delete next[gesture.poiId]; return next; });
  };
  const openPoiMenu = (event: ReactMouseEvent<HTMLButtonElement>, poi: SessionMapPoi) => {
    event.preventDefault();
    event.stopPropagation();
    if (openUnderlyingMapObjectMenu(event.clientX, event.clientY, { family: 'poi', id: poi.id })) return;
    if (!isOwner && !canControlPoi(poi)) return;
    const position = menuPositionBeside(event.currentTarget);
    if (!position) return;
    setTokenMenu(null);
    setDrawingMenu(null);
    setPoiMenu({ poiId: poi.id, ...position, panel: null });
  };

  const openUnderlyingMapObjectMenu = (clientX: number, clientY: number, currentRef?: MapObjectRef) => {
    const point = mapPointFromClient(clientX, clientY);
    if (!point || !viewportRef.current) return false;
    const contains = (bounds: { x: number; y: number; width: number; height: number }) => point.x >= bounds.x && point.x <= bounds.x + bounds.width && point.y >= bounds.y && point.y <= bounds.y + bounds.height;
    const candidates = [...objectOrder].reverse().filter((ref) => {
      if (ref.family === 'drawing') {
        const drawing = drawingById.get(ref.id);
        const moveDraft = drawing ? drawingMoveDrafts[drawing.id] : null;
        const rendered = drawing ? drawingTransformDrafts[drawing.id] ?? (moveDraft ? { ...drawing, ...moveDraft } : drawing) : null;
        return !!rendered && isOwner && drawingContainsPoint(rendered, point, view.scale);
      }
      if (ref.family === 'token') {
        const token = mapTokens.find(item => item.id === ref.id);
        const position = token ? tokenDraftTransforms[token.id] ?? tokenDraftPositions[token.id] ?? token : null;
        const size = tokenDraftTransforms[ref.id]?.size ?? (token ? getTokenSize(token, gridSettings.cellSize) : 0);
        return !!token && !!position && (isOwner || canControlToken(token)) && contains({ x: position.x, y: position.y, width: size, height: size });
      }
      const poi = mapPois.find(item => item.id === ref.id);
      const position = poi ? poiDraftPositions[poi.id] ?? poi : null;
      const size = poi ? poiDraftTransforms[poi.id]?.size ?? poi.size : 0;
      return !!poi && !!position && (isOwner || canControlPoi(poi)) && contains({ x: position.x - size / 2, y: position.y - size / 2, width: size, height: size });
    });
    if (candidates.length === 0) return false;
    const previous = depthSelectionRef.current;
    const samePoint = !!previous && Math.hypot(previous.x - clientX, previous.y - clientY) < 8;
    const currentKey = samePoint ? previous.key : currentRef ? `${currentRef.family}\u0000${currentRef.id}` : null;
    const currentIndex = candidates.findIndex(ref => `${ref.family}\u0000${ref.id}` === currentKey);
    const target = candidates.length === 1 ? candidates[0] : candidates[(currentIndex + 1 + candidates.length) % candidates.length];
    const targetKey = `${target.family}\u0000${target.id}`;
    depthSelectionRef.current = { x: clientX, y: clientY, key: targetKey };
    setDepthSelectedKey(targetKey);
    let targetBounds: { x: number; y: number; width: number; height: number } | null = null;
    if (target.family === 'drawing') {
      const drawing = mapDrawings.find(item => item.id === target.id);
      const moveDraft = drawing ? drawingMoveDrafts[drawing.id] : null;
      const rendered = drawing ? withMeasuredTextBounds(drawingTransformDrafts[drawing.id] ?? (moveDraft ? { ...drawing, ...moveDraft } : drawing)) : null;
      if (rendered) targetBounds = getRotatedRectBounds(rendered, rendered.width, rendered.height, rendered.rotation ?? 0);
    } else if (target.family === 'token') {
      const token = mapTokens.find(item => item.id === target.id);
      const position = token ? tokenDraftTransforms[token.id] ?? tokenDraftPositions[token.id] ?? token : null;
      if (token && position) { const size = tokenDraftTransforms[token.id]?.size ?? getTokenSize(token, gridSettings.cellSize); targetBounds = { x: position.x, y: position.y, width: size, height: size }; }
    } else {
      const poi = mapPois.find(item => item.id === target.id);
      const position = poi ? poiDraftPositions[poi.id] ?? poi : null;
      const size = poi ? poiDraftTransforms[poi.id]?.size ?? poi.size : 0;
      if (poi && position) targetBounds = { x: position.x - size / 2, y: position.y - size / 2, width: size, height: size };
    }
    const menuPosition = targetBounds ? menuPositionBesideMapBounds(targetBounds) : null;
    if (!menuPosition) return false;
    const { x, y } = menuPosition;
    setTokenMenu(null); setDrawingMenu(null); setPoiMenu(null);
    if (target.family === 'drawing') {
      if (!selectedDrawingIds.has(target.id)) setSelectedDrawingIds(new Set([target.id]));
      setSelectedDrawingId(target.id);
      setDrawingStyleEditorOpen(false); setDrawingLayerPanelOpen(false); setDrawingMenu({ id: target.id, x, y });
    } else if (target.family === 'token') {
      const token = mapTokens.find(item => item.id === target.id);
      if (token) setTokenMenu({ tokenId: token.id, x, y, panel: null, nameDraft: token.name, customConditionDraft: '' });
    } else setPoiMenu({ poiId: target.id, x, y, panel: null });
    return true;
  };

  const updateDepthHover = (clientX: number, clientY: number) => {
    if (activeTool === 'fog') {
      if (depthHoveredKeys.size > 0) setDepthHoveredKeys(new Set());
      depthSelectionRef.current = null;
      setDepthSelectedKey(null);
      return;
    }
    const point = mapPointFromClient(clientX, clientY);
    if (!point) return;
    const contains = (bounds: { x: number; y: number; width: number; height: number }) => point.x >= bounds.x && point.x <= bounds.x + bounds.width && point.y >= bounds.y && point.y <= bounds.y + bounds.height;
    const keys = new Set<string>();
    let hoveredDrawingCandidate: string | null = null;
    objectOrder.forEach((ref) => {
      if (ref.family === 'drawing') {
        const drawing = mapDrawings.find(item => item.id === ref.id);
        const moveDraft = drawing ? drawingMoveDrafts[drawing.id] : null;
        const rendered = drawing ? drawingTransformDrafts[drawing.id] ?? (moveDraft ? { ...drawing, ...moveDraft } : drawing) : null;
        if (rendered && (isOwner || rendered.visible !== false) && drawingContainsPoint(rendered, point, view.scale)) {
          keys.add(`drawing\u0000${rendered.id}`);
          hoveredDrawingCandidate = rendered.id;
        }
      } else if (ref.family === 'token') {
        const token = tokenById.get(ref.id);
        const position = token ? tokenDraftTransforms[token.id] ?? tokenDraftPositions[token.id] ?? token : null;
        const size = tokenDraftTransforms[ref.id]?.size ?? (token ? getTokenSize(token, gridSettings.cellSize) : 0);
        if (token && position && contains({ x: position.x, y: position.y, width: size, height: size })) keys.add(`token\u0000${token.id}`);
      } else {
        const poi = poiById.get(ref.id);
        const position = poi ? poiDraftPositions[poi.id] ?? poi : null;
        const size = poi ? poiDraftTransforms[poi.id]?.size ?? poi.size : 0;
        if (poi && position && contains({ x: position.x - size / 2, y: position.y - size / 2, width: size, height: size })) keys.add(`poi\u0000${poi.id}`);
      }
    });
    if (hoveredDrawingCandidate) hoveredMapElementRef.current = { type: 'drawing', id: hoveredDrawingCandidate };
    else if (hoveredMapElementRef.current?.type === 'drawing') hoveredMapElementRef.current = null;
    setDepthHoveredKeys((current) => current.size === keys.size && [...keys].every(key => current.has(key)) ? current : keys);
    if (depthSelectedKey && !keys.has(depthSelectedKey)) {
      depthSelectionRef.current = null;
      setDepthSelectedKey(null);
    }
  };
  const scheduleDepthHover = (clientX: number, clientY: number) => {
    if (panRef.current) {
      pendingDepthHoverRef.current = null;
      return;
    }
    pendingDepthHoverRef.current = { clientX, clientY };
    if (depthHoverFrameRef.current !== null) return;
    depthHoverFrameRef.current = window.requestAnimationFrame(() => {
      depthHoverFrameRef.current = null;
      const point = pendingDepthHoverRef.current;
      pendingDepthHoverRef.current = null;
      if (point && !panRef.current) updateDepthHover(point.clientX, point.clientY);
    });
  };

  const fogOperation = fogSettings.mode === 'cutter' ? 'reveal' : fogSettings.operation;
  const fogStyle = { color: fogSettings.color, strokeWidth: fogSettings.strokeWidth };
  const showFogNotice = (message: string) => {
    setRoomFillNotice(message);
    if (roomFillNoticeTimerRef.current !== null) window.clearTimeout(roomFillNoticeTimerRef.current);
    roomFillNoticeTimerRef.current = window.setTimeout(() => setRoomFillNotice(null), 2800);
  };
  const commitFog = (fog: SessionMapFog) => {
    if (fog.operation !== 'cover' || fog.fullMap || fog.visionBlocker || !onFogReplaceAll) {
      onFogCreate?.(fog);
      return;
    }
    const candidates = mapFog.filter(item => item.operation === 'cover' && item.enabled !== false && !item.fullMap && !item.visionBlocker);
    const draftPolygon = fogWorldPolygon(fog);
    const draftBounds = polygonBounds(draftPolygon);
    const overlappingCandidates = candidates.filter(item => polygonBoundsOverlap(polygonBounds(fogWorldPolygon(item)), draftBounds));
    if (draftPolygon.length === 0 || fogSettings.overlapMode === 'overlay') {
      onFogReplaceAll([...mapFog, fog]);
      return;
    }
    if (fogSettings.overlapMode === 'fit') {
      const occupied = overlappingCandidates.reduce<FogMultiPolygon>((combined, item) => combined.length ? polygonClipping.union(combined, fogWorldPolygon(item)) : [fogWorldPolygon(item)], []);
      const result = occupied.length ? polygonClipping.difference(draftPolygon, occupied) : [draftPolygon];
      const additions = fogsFromMultiPolygon(result, fog);
      if (additions.length === 0) {
        showFogNotice('La sovrapposizione totale non è supportata: la nuova nebbia non è stata creata.');
        return;
      }
      onFogReplaceAll([...mapFog, ...additions]);
      return;
    }
    if (fogSettings.overlapMode === 'trim') {
      let changed = false;
      const next = mapFog.flatMap(item => {
        if (!overlappingCandidates.includes(item)) return [item];
        const itemPolygon = fogWorldPolygon(item);
        const intersection = polygonClipping.intersection(itemPolygon, draftPolygon);
        if (intersection.length === 0) return [item];
        changed = true;
        return fogsFromMultiPolygon(polygonClipping.difference(itemPolygon, draftPolygon), item, true);
      });
      if (changed) onFogReplaceAll(next);
      return;
    }
    const target = [...overlappingCandidates].reverse().find(item => polygonClipping.intersection(fogWorldPolygon(item), draftPolygon).length > 0);
    if (!target) {
      onFogReplaceAll([...mapFog, fog]);
      return;
    }
    const merged = fogsFromMultiPolygon(polygonClipping.union(fogWorldPolygon(target), draftPolygon), { ...target, style: fog.style }, true);
    onFogReplaceAll([...mapFog.filter(item => item.id !== target.id), ...merged]);
  };
  const bringFogToFront = (fogId: string) => {
    const index = mapFog.findIndex(item => item.id === fogId);
    if (index < 0 || index === mapFog.length - 1 || !onFogReplaceAll) return;
    onFogReplaceAll([...mapFog.slice(0, index), ...mapFog.slice(index + 1), mapFog[index]]);
  };
  const fogFromGesture = (gesture: FogGesture) => {
    const points = gesture.mode === 'freehand' ? gesture.points : [gesture.start, gesture.current];
    return buildFog(gesture.mode, points, fogOperation, fogStyle);
  };
  const snapFogPointToGrid = (point: SessionMapPoint) => {
    if (!fogSettings.gridSnapEnabled || gridSettings.cellSize <= 0) return point;
    if (gridSettings.type !== 'square') return snapToSessionGrid(point, { ...gridSettings, snap: true });
    const step = fogSettings.gridSnapMode === 'full-step' ? gridSettings.cellSize : gridSettings.cellSize / 2;
    const originX = gridSettings.originX ?? 0; const originY = gridSettings.originY ?? 0;
    return { x: Math.round((point.x - originX) / step) * step + originX, y: Math.round((point.y - originY) / step) * step + originY };
  };
  const beginFog = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isOwner || activeTool !== 'fog' || event.button !== 0 || (event.target as Element).closest('[data-map-interactive]')) return false;
    const point = worldPoint(event);
    if (!point) return false;
    if (fogSettings.mode === 'grab' || fogSettings.mode === 'quick-select') return true;
    setSelectedFogIds(new Set());
    setFogSelectionMenu(null);
    setFogMenu(null);
    if (fogSettings.mode === 'room-fill') {
      event.preventDefault();
      if (roomFillBusy || !backgroundUrl) return true;
      const localPoint = { x: point.x - placement.x, y: point.y - placement.y };
      if (localPoint.x < 0 || localPoint.y < 0 || localPoint.x > placement.width || localPoint.y > placement.height) return true;
      setRoomFillBusy(true);
      const excludedPolygons = mapFog.filter(fog => fog.operation === 'cover' && fog.enabled !== false && !fog.fullMap && !fog.visionBlocker && fog.points && fog.points.length >= 3).map(fog => {
        const radians = fog.rotation * Math.PI / 180; const center = { x: fog.width / 2, y: fog.height / 2 };
        return fog.points!.map(vertex => { const dx = vertex.x - center.x; const dy = vertex.y - center.y; return { x: fog.x - placement.x + center.x + dx * Math.cos(radians) - dy * Math.sin(radians), y: fog.y - placement.y + center.y + dx * Math.sin(radians) + dy * Math.cos(radians) }; });
      });
      const probeDistance = Math.max(4, gridSettings.cellSize * 0.3);
      const probes = [localPoint, { x: localPoint.x - probeDistance, y: localPoint.y }, { x: localPoint.x + probeDistance, y: localPoint.y }, { x: localPoint.x, y: localPoint.y - probeDistance }, { x: localPoint.x, y: localPoint.y + probeDistance }].filter(probe => probe.x >= 0 && probe.y >= 0 && probe.x <= placement.width && probe.y <= placement.height);
      void (async () => {
        const candidates: SessionMapPoint[][] = [];
        for (const probe of probes) {
          const room = await detectRoomAtPoint(backgroundUrl, { width: placement.width, height: placement.height }, probe, excludedPolygons);
          if (!room) continue;
          const collisionSafeRoom = trimPolygonCollisions(room, excludedPolygons);
          if (collisionSafeRoom) candidates.push(collisionSafeRoom);
        }
        const polygonArea = (polygon: SessionMapPoint[]) => Math.abs(polygon.reduce((sum, vertex, index) => { const next = polygon[(index + 1) % polygon.length]; return sum + vertex.x * next.y - next.x * vertex.y; }, 0) / 2);
        return candidates.sort((a, b) => polygonArea(b) - polygonArea(a))[0] ?? null;
      })().then((room) => {
        if (!room) {
          roomFillFailuresRef.current += 1;
          if (roomFillFailuresRef.current >= 5) {
            roomFillFailuresRef.current = 0;
            setRoomFillNotice('In questo punto non è possibile generare il riempimento automatico della nebbia.');
            if (roomFillNoticeTimerRef.current !== null) window.clearTimeout(roomFillNoticeTimerRef.current);
            roomFillNoticeTimerRef.current = window.setTimeout(() => setRoomFillNotice(null), 2800);
          }
          return;
        }
        roomFillFailuresRef.current = 0;
        setRoomFillNotice(null);
        const fog = buildFog('polygon', room.map(vertex => ({ x: vertex.x + placement.x, y: vertex.y + placement.y })), fogOperation, fogStyle);
        if (fog) {
          setFogDraft(fog);
           window.requestAnimationFrame(() => commitFog(fog));
        }
      }).catch(() => undefined).finally(() => setRoomFillBusy(false));
      return true;
    }
    if (fogSettings.mode === 'polygon' || fogSettings.mode === 'cutter') {
      event.preventDefault();
      const close = fogPolygonPoints.length >= 3 && Math.hypot(point.x - fogPolygonPoints[0].x, point.y - fogPolygonPoints[0].y) <= 14 / view.scale;
      if (close) {
        const fog = buildFog('polygon', fogPolygonPoints, fogOperation, fogStyle);
        if (fog) commitFog(fog);
        setFogPolygonPoints([]); setFogPolygonHover(null);
      } else setFogPolygonPoints(current => [...current, snapFogPointToGrid(point)]);
      return true;
    }
    const start = fogSettings.mode === 'freehand' ? point : snapFogPointToGrid(point);
    const gesture: FogGesture = { pointerId: event.pointerId, mode: fogSettings.mode, start, current: start, points: [start] };
    fogGestureRef.current = gesture;
    setFogDraft(fogFromGesture(gesture));
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    return true;
  };
  const moveFog = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = fogGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) {
      if (activeTool === 'fog' && (fogSettings.mode === 'polygon' || fogSettings.mode === 'cutter')) {
        const point = worldPoint(event);
        setFogPolygonHover(point ? snapFogPointToGrid(point) : point);
      }
      return false;
    }
    const point = worldPoint(event);
    if (!point) return true;
    gesture.current = gesture.mode === 'freehand' ? point : snapFogPointToGrid(point);
    if (gesture.mode === 'freehand' && Math.hypot(point.x - gesture.points.at(-1)!.x, point.y - gesture.points.at(-1)!.y) >= 2 / view.scale) gesture.points.push(point);
    setFogDraft(fogFromGesture(gesture));
    return true;
  };
  const finishFog = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = fogGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return false;
    const fog = fogFromGesture(gesture);
    if (fog) commitFog(fog);
    fogGestureRef.current = null;
    setFogDraft(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    return true;
  };
  const beginFogMove = (event: ReactPointerEvent<SVGElement>, fog: SessionMapFog) => {
    if (!isOwner || fog.locked || activeTool !== 'fog' || fogSettings.mode !== 'grab' || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    const selectedIds = selectedFogIds.has(fog.id) ? [...selectedFogIds] : [fog.id];
    if (!selectedFogIds.has(fog.id)) bringFogToFront(fog.id);
    const selectedGroups = new Set(mapFog.filter(item => selectedIds.includes(item.id) && item.magnetGroupId).map(item => item.magnetGroupId));
    const ids = mapFog.filter(item => !item.locked && (selectedIds.includes(item.id) || item.magnetGroupId && selectedGroups.has(item.magnetGroupId))).map(item => item.id);
    setSelectedFogIds(new Set(ids));
    const origins = Object.fromEntries(mapFog.filter(item => ids.includes(item.id)).map(item => [item.id, { x: item.x, y: item.y }]));
    const fogs = Object.fromEntries(mapFog.filter(item => ids.includes(item.id)).map(item => [item.id, item]));
    const start = mapPointFromClient(event.clientX, event.clientY);
    if (!start) return;
    fogMoveRef.current = { pointerId: event.pointerId, start, origins, fogs, finalPositions: origins };
    setDraggingFog(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const openFogMenu = (event: ReactMouseEvent<SVGElement>, fog: SessionMapFog) => {
    if (!isOwner) return;
    event.preventDefault(); event.stopPropagation();
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const targetRect = event.currentTarget.getBoundingClientRect();
    const fogBounds = { minX: targetRect.left - rect.left, maxX: targetRect.right - rect.left, minY: targetRect.top - rect.top, maxY: targetRect.bottom - rect.top };
    const menuWidth = Math.min(342, rect.width - 16); const menuHeight = 150; const gap = 36;
    const sides = [
      { space: rect.width - fogBounds.maxX, x: fogBounds.maxX + gap, y: (fogBounds.minY + fogBounds.maxY - menuHeight) / 2 },
      { space: fogBounds.minX, x: fogBounds.minX - menuWidth - gap, y: (fogBounds.minY + fogBounds.maxY - menuHeight) / 2 },
      { space: rect.height - fogBounds.maxY, x: (fogBounds.minX + fogBounds.maxX - menuWidth) / 2, y: fogBounds.maxY + gap },
      { space: fogBounds.minY, x: (fogBounds.minX + fogBounds.maxX - menuWidth) / 2, y: fogBounds.minY - menuHeight - gap },
    ];
    const position = sides.find(side => side.x >= 8 && side.y >= 8 && side.x + menuWidth <= rect.width - 8 && side.y + menuHeight <= rect.height - 8) ?? [...sides].sort((a, b) => b.space - a.space)[0];
    setSelectedFogIds(new Set([fog.id]));
    bringFogToFront(fog.id);
    setFogSelectionMenu(null); setTokenMenu(null); setDrawingMenu(null); setPoiMenu(null);
    setFogMenu({ id: fog.id, x: Math.max(8, Math.min(position.x, rect.width - menuWidth - 8)), y: Math.max(8, Math.min(position.y, rect.height - menuHeight - 8)), panel: null });
  };
  const duplicateFog = (fog: SessionMapFog) => {
    const now = new Date().toISOString();
    onFogCreate?.({ ...structuredClone(fog), id: crypto.randomUUID(), x: fog.x + 20 / view.scale, y: fog.y + 20 / view.scale, magnetGroupId: null, createdAt: now, updatedAt: now });
  };
  const beginFogPathPointMove = (event: ReactPointerEvent<SVGCircleElement>, fog: SessionMapFog, pointIndex: number) => {
    if (fog.locked) return;
    event.preventDefault(); event.stopPropagation();
    fogPathPointRef.current = { pointerId: event.pointerId, fogId: fog.id, pointIndex, origin: fog, draft: fog };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveFogPathPoint = (event: ReactPointerEvent<SVGCircleElement>) => {
    const gesture = fogPathPointRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const point = mapPointFromClient(event.clientX, event.clientY);
    if (!point || !gesture.origin.points) return;
    const center = { x: gesture.origin.x + gesture.origin.width / 2, y: gesture.origin.y + gesture.origin.height / 2 };
    const angle = -gesture.origin.rotation * Math.PI / 180;
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const local = { x: dx * Math.cos(angle) - dy * Math.sin(angle) + gesture.origin.width / 2, y: dx * Math.sin(angle) + dy * Math.cos(angle) + gesture.origin.height / 2 };
    const points = gesture.origin.points.map((item, index) => index === gesture.pointIndex ? local : item);
    gesture.draft = { ...gesture.origin, points, rings: gesture.origin.rings ? [points, ...gesture.origin.rings.slice(1)] : undefined };
    setFogPathDrafts(current => ({ ...current, [gesture.fogId]: gesture.draft }));
  };
  const finishFogPathPointMove = (event: ReactPointerEvent<SVGCircleElement>) => {
    const gesture = fogPathPointRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    onFogChange?.(gesture.fogId, { points: gesture.draft.points, rings: gesture.draft.rings });
    setFogPathDrafts(current => { const next = { ...current }; delete next[gesture.fogId]; return next; });
    fogPathPointRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const beginQuickFogSelection = (event: ReactPointerEvent<SVGElement>, fog: SessionMapFog) => {
    if (!isOwner || activeTool !== 'fog' || fogSettings.mode !== 'quick-select' || event.button !== 0) return false;
    event.preventDefault(); event.stopPropagation();
    const ids = new Set([fog.id]);
    quickFogSelectionRef.current = { pointerId: event.pointerId, ids };
    setSelectedFogIds(ids);
    setFogSelectionMenu(null);
    viewportRef.current?.setPointerCapture(event.pointerId);
    return true;
  };
  const moveQuickFogSelection = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = quickFogSelectionRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return false;
    const point = worldPoint(event);
    if (!point) return true;
    let changed = false;
    mapFog.forEach(fog => {
      if (fog.fullMap || fog.visionBlocker) return;
      const position = fogMoveDrafts[fog.id];
      const rendered = fogTransformDrafts[fog.id] ?? (position ? { ...fog, ...position } : fog);
      if (fogContainsPoint(rendered, point) && !gesture.ids.has(fog.id)) { gesture.ids.add(fog.id); changed = true; }
    });
    if (changed) setSelectedFogIds(new Set(gesture.ids));
    return true;
  };
  const finishQuickFogSelection = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = quickFogSelectionRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return false;
    quickFogSelectionRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const rect = viewportRef.current?.getBoundingClientRect();
    if (rect && gesture.ids.size > 0) setFogSelectionMenu({ x: Math.max(8, Math.min(event.clientX - rect.left + 12, rect.width - 260)), y: Math.max(8, Math.min(event.clientY - rect.top + 12, rect.height - 90)) });
    return true;
  };
  const moveSelectedFog = (event: ReactPointerEvent<SVGElement>) => {
    const gesture = fogMoveRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const current = mapPointFromClient(event.clientX, event.clientY);
    if (!current) return;
    const dx = current.x - gesture.start.x;
    const dy = current.y - gesture.start.y;
    const movingIds = new Set(Object.keys(gesture.origins));
    const raw = Object.fromEntries(Object.entries(gesture.origins).map(([id, origin]) => [id, { x: origin.x + dx, y: origin.y + dy }]));
    const targets = fogSettings.magnetEnabled ? mapFog.filter(fog => !movingIds.has(fog.id) && !fog.fullMap && !fog.visionBlocker && fog.enabled !== false && Math.abs((((fog.rotation ?? 0) % 180) + 180) % 180) < 1) : [];
    const snapDistance = 12 / Math.sqrt(view.scale);
    const xCorrections: number[] = []; const yCorrections: number[] = [];
    mapFog.filter(fog => movingIds.has(fog.id) && Math.abs((((fog.rotation ?? 0) % 180) + 180) % 180) < 1).forEach(fog => {
      const position = raw[fog.id]; if (!position) return;
      targets.forEach(target => {
        if (position.y < target.y + target.height + snapDistance && position.y + fog.height > target.y - snapDistance) xCorrections.push(target.x - position.x, target.x + target.width - position.x, target.x - position.x - fog.width, target.x + target.width - position.x - fog.width);
        if (position.x < target.x + target.width + snapDistance && position.x + fog.width > target.x - snapDistance) yCorrections.push(target.y - position.y, target.y + target.height - position.y, target.y - position.y - fog.height, target.y + target.height - position.y - fog.height);
      });
    });
    const snapX = xCorrections.filter(value => Math.abs(value) <= snapDistance).sort((a, b) => Math.abs(a) - Math.abs(b))[0] ?? 0;
    const snapY = yCorrections.filter(value => Math.abs(value) <= snapDistance).sort((a, b) => Math.abs(a) - Math.abs(b))[0] ?? 0;
    gesture.finalPositions = Object.fromEntries(Object.entries(raw).map(([id, position]) => [id, { x: position.x + snapX, y: position.y + snapY }]));
    setFogMoveDrafts(gesture.finalPositions);
  };
  const completeFogMove = (pointerId: number) => {
    const gesture = fogMoveRef.current;
    if (!gesture || gesture.pointerId !== pointerId) return false;
    const updates: Record<string, Partial<SessionMapFog>> = {};
    Object.entries(gesture.finalPositions).forEach(([id, position]) => {
      const origin = gesture.origins[id];
      const fog = gesture.fogs[id];
      if (!origin || !fog) return;
      const dx = position.x - origin.x;
      const dy = position.y - origin.y;
      const exploredAreas = translateExploredAreas(fogExplorationCacheRef.current[id] ?? fog.exploredAreas, dx, dy);
      const lightExploredAreas = translateExploredAreas(fogLightExplorationCacheRef.current[id] ?? fog.lightExploredAreas, dx, dy);
      const trailAreas = translateExploredAreas(fogVolatileTrailCacheRef.current[id] ?? fog.exploredAreas, dx, dy);
      if (exploredAreas) fogExplorationCacheRef.current[id] = exploredAreas;
      if (lightExploredAreas) fogLightExplorationCacheRef.current[id] = lightExploredAreas;
      if (trailAreas) fogVolatileTrailCacheRef.current[id] = trailAreas;
      delete fogCurrentVisionRef.current[id];
      updates[id] = { x: position.x, y: position.y, exploredAreas, lightExploredAreas };
    });
    onFogsMove?.(updates);
    setFogMoveDrafts({});
    fogMoveRef.current = null;
    setDraggingFog(false);
    return true;
  };
  const finishSelectedFog = (event: ReactPointerEvent<SVGElement>) => {
    if (!completeFogMove(event.pointerId)) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  useEffect(() => {
    const finishLostFogMove = (event: PointerEvent) => { completeFogMove(event.pointerId); };
    window.addEventListener('pointerup', finishLostFogMove);
    window.addEventListener('pointercancel', finishLostFogMove);
    return () => {
      window.removeEventListener('pointerup', finishLostFogMove);
      window.removeEventListener('pointercancel', finishLostFogMove);
    };
  });
  const beginFogTransform = (event: ReactPointerEvent<SVGElement>, fog: SessionMapFog, kind: 'resize' | 'rotate', handle?: 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w') => {
    if (fog.locked) return;
    event.preventDefault(); event.stopPropagation();
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const centerClientX = rect.left + view.x + (fog.x + fog.width / 2) * view.scale;
    const centerClientY = rect.top + view.y + (fog.y + fog.height / 2) * view.scale;
    fogTransformRef.current = { pointerId: event.pointerId, id: fog.id, kind, handle, startX: event.clientX, startY: event.clientY, startAngle: Math.atan2(event.clientY - centerClientY, event.clientX - centerClientX), centerClientX, centerClientY, origin: fog, draft: fog };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveFogTransform = (event: ReactPointerEvent<SVGElement>) => {
    const gesture = fogTransformRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (gesture.kind === 'rotate') {
      const angle = Math.atan2(event.clientY - gesture.centerClientY, event.clientX - gesture.centerClientX);
      gesture.draft = { ...gesture.origin, rotation: gesture.origin.rotation + (angle - gesture.startAngle) * 180 / Math.PI };
    } else {
      const radians = -gesture.origin.rotation * Math.PI / 180;
      const screenDx = (event.clientX - gesture.startX) / view.scale;
      const screenDy = (event.clientY - gesture.startY) / view.scale;
      const dx = screenDx * Math.cos(radians) - screenDy * Math.sin(radians);
      const dy = screenDx * Math.sin(radians) + screenDy * Math.cos(radians);
      let { width, height } = gesture.origin;
      if (gesture.handle?.includes('w')) width -= dx;
      else if (gesture.handle?.includes('e')) width += dx;
      if (gesture.handle?.includes('n')) height -= dy;
      else if (gesture.handle?.includes('s')) height += dy;
      width = Math.max(4, width);
      height = Math.max(4, height);
      const originCenter = { x: gesture.origin.x + gesture.origin.width / 2, y: gesture.origin.y + gesture.origin.height / 2 };
      const oppositeOrigin = {
        x: gesture.handle?.includes('w') ? gesture.origin.width : gesture.handle?.includes('e') ? 0 : gesture.origin.width / 2,
        y: gesture.handle?.includes('n') ? gesture.origin.height : gesture.handle?.includes('s') ? 0 : gesture.origin.height / 2,
      };
      const rotation = gesture.origin.rotation * Math.PI / 180;
      const anchorOffset = { x: oppositeOrigin.x - gesture.origin.width / 2, y: oppositeOrigin.y - gesture.origin.height / 2 };
      const anchorWorld = {
        x: originCenter.x + anchorOffset.x * Math.cos(rotation) - anchorOffset.y * Math.sin(rotation),
        y: originCenter.y + anchorOffset.x * Math.sin(rotation) + anchorOffset.y * Math.cos(rotation),
      };
      const oppositeDraft = {
        x: gesture.handle?.includes('w') ? width : gesture.handle?.includes('e') ? 0 : width / 2,
        y: gesture.handle?.includes('n') ? height : gesture.handle?.includes('s') ? 0 : height / 2,
      };
      const draftOffset = { x: oppositeDraft.x - width / 2, y: oppositeDraft.y - height / 2 };
      let x = anchorWorld.x - width / 2 - (draftOffset.x * Math.cos(rotation) - draftOffset.y * Math.sin(rotation));
      let y = anchorWorld.y - height / 2 - (draftOffset.x * Math.sin(rotation) + draftOffset.y * Math.cos(rotation));
      const axisAligned = Math.abs(((((gesture.origin.rotation ?? 0) % 180) + 180) % 180)) < 1;
      if (fogSettings.magnetEnabled && axisAligned && gesture.handle) {
        const snapDistance = 12 / Math.sqrt(view.scale);
        const candidates = mapFog.filter(fog => fog.id !== gesture.id && !fog.fullMap && !fog.visionBlocker && fog.enabled !== false && Math.abs(((((fog.rotation ?? 0) % 180) + 180) % 180)) < 1);
        const nearest = (value: number, targets: number[]) => targets.reduce<{ value: number; distance: number } | null>((best, target) => { const distance = Math.abs(target - value); return distance <= snapDistance && (!best || distance < best.distance) ? { value: target, distance } : best; }, null);
        if (gesture.handle.includes('w') || gesture.handle.includes('e')) {
          const targets = candidates.filter(fog => y < fog.y + fog.height + snapDistance && y + height > fog.y - snapDistance).flatMap(fog => [fog.x, fog.x + fog.width]);
          const edge = gesture.handle.includes('w') ? x : x + width;
          const snap = nearest(edge, targets);
          if (snap && gesture.handle.includes('w')) { const right = x + width; x = snap.value; width = Math.max(4, right - x); }
          else if (snap) width = Math.max(4, snap.value - x);
        }
        if (gesture.handle.includes('n') || gesture.handle.includes('s')) {
          const targets = candidates.filter(fog => x < fog.x + fog.width + snapDistance && x + width > fog.x - snapDistance).flatMap(fog => [fog.y, fog.y + fog.height]);
          const edge = gesture.handle.includes('n') ? y : y + height;
          const snap = nearest(edge, targets);
          if (snap && gesture.handle.includes('n')) { const bottom = y + height; y = snap.value; height = Math.max(4, bottom - y); }
          else if (snap) height = Math.max(4, snap.value - y);
        }
      }
      gesture.draft = { ...gesture.origin, x, y, width, height, points: gesture.origin.points?.map(point => ({ x: point.x * width / gesture.origin.width, y: point.y * height / gesture.origin.height })), rings: gesture.origin.rings?.map(ring => ring.map(point => ({ x: point.x * width / gesture.origin.width, y: point.y * height / gesture.origin.height }))) };
    }
    setFogTransformDrafts(current => ({ ...current, [gesture.id]: gesture.draft }));
  };
  const finishFogTransform = (event: ReactPointerEvent<SVGElement>) => {
    const gesture = fogTransformRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    onFogTransformsChange?.({ [gesture.id]: gesture.draft });
    setFogTransformDrafts(current => { const next = { ...current }; delete next[gesture.id]; return next; });
    fogTransformRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && activeTool === 'fog' && (fogSettings.mode === 'polygon' || fogSettings.mode === 'cutter') && fogPolygonPoints.length > 0) {
        event.preventDefault(); event.stopImmediatePropagation();
        setFogPolygonPoints([]); setFogPolygonHover(null); setFogDraft(null);
        return;
      }
      if (event.key === 'Enter' && fogPolygonPoints.length >= 3) {
        const fog = buildFog('polygon', fogPolygonPoints, fogOperation, fogStyle);
        if (fog) commitFog(fog);
        setFogPolygonPoints([]); setFogPolygonHover(null);
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedFogIds.size > 0 && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault(); onFogsDelete?.([...selectedFogIds]); setSelectedFogIds(new Set());
      }
    };
    document.addEventListener('keydown', keydown, true);
    return () => document.removeEventListener('keydown', keydown, true);
  }, [activeTool, fogOperation, fogPolygonPoints, fogSettings.color, fogSettings.mode, fogSettings.strokeWidth, onFogCreate, onFogsDelete, selectedFogIds]);
  useEffect(() => {
    if (activeTool === 'fog' && (fogSettings.mode === 'polygon' || fogSettings.mode === 'cutter')) return;
    setFogPolygonPoints([]); setFogPolygonHover(null); setFogDraft(null);
  }, [activeTool, fogSettings.mode, mapId]);

  const handleViewportPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drawingMagnetLink) {
      event.preventDefault();
      return;
    }
    const target = event.target as Element;
    if (!target.closest('[role="menu"]')) {
      setTokenMenu(null);
      setDrawingMenu(null);
      setPoiMenu(null);
      setFogSelectionMenu(null);
    }
    if (!target.closest('[data-map-interactive]')) {
      setSelectedTokenIds(new Set());
      setSelectedDrawingId(null);
      setSelectedDrawingIds(new Set());
      drawingTransformRef.current = null;
      setDrawingDraft(null);
    }
    if (activeTool === 'walls' && event.button === 0 && !target.closest('[data-map-interactive]')) {
      const point = worldPoint(event);
      if (!point) return;
      if (!wallStart) {
        setWallStart(point);
        setWallHover(point);
      } else {
        const minX = Math.min(wallStart.x, point.x);
        const minY = Math.min(wallStart.y, point.y);
        if (Math.hypot(point.x - wallStart.x, point.y - wallStart.y) >= 4 / view.scale) {
          const now = new Date().toISOString();
          onFogCreate?.({ id: crypto.randomUUID(), kind: 'freehand', operation: 'reveal', x: minX, y: minY, width: Math.max(1, Math.abs(point.x - wallStart.x)), height: Math.max(1, Math.abs(point.y - wallStart.y)), rotation: 0, points: [{ x: wallStart.x - minX, y: wallStart.y - minY }, { x: point.x - minX, y: point.y - minY }], style: { color: fogSettings.color, strokeWidth: fogSettings.strokeWidth }, enabled: false, locked: false, magnetEnabled: false, magnetGroupId: null, visionBlocker: { kind: 'wall', confidence: 1, source: 'manual' }, createdAt: now, updatedAt: now });
        }
        setWallStart(null);
        setWallHover(null);
      }
      event.preventDefault();
      return;
    }
    if (activeTool === 'pin' && event.button === 0 && !target.closest('[data-map-interactive]')) {
      const point = worldPoint(event);
      if (point) onPoiCreate?.(point);
      event.preventDefault();
      return;
    }
    if (!captureCalibrationPoint(event) && !beginVisualMeasurement(event) && !beginDrawing(event) && !beginFog(event) && !beginSelection(event)) beginPan(event);
  };
  const handleViewportPointerDownCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button === 1) {
      setActiveSessionMapTool('move');
      beginPan(event);
      event.stopPropagation();
      return;
    }
    beginDepthSelectedMove(event);
  };
  const handleViewportPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (isOwner && !panRef.current) {
      const point = worldPoint(event);
      const specialFog = point ? [...mapFog].reverse().find(fog => fog.operation === 'cover' && fog.enabled !== false && (fog.persistence ?? 'permanent') !== 'volatile' && fogContainsPoint(fogPathDrafts[fog.id] ?? fogTransformDrafts[fog.id] ?? { ...fog, ...(fogMoveDrafts[fog.id] ?? {}) }, point)) : null;
      if (specialFog) {
        const rect = viewportRef.current?.getBoundingClientRect();
        const label = (specialFog.persistence ?? 'permanent') === 'semi-persistent' ? 'Semi-persistente' : 'Persistente';
        setFogPersistenceHint(current => current?.id === specialFog.id ? current : { id: specialFog.id, x: event.clientX - (rect?.left ?? 0) + 14, y: event.clientY - (rect?.top ?? 0) + 14, label });
      } else setFogPersistenceHint(null);
    } else if (fogPersistenceHint) setFogPersistenceHint(null);
    if (activeTool === 'walls' && wallStart) setWallHover(worldPoint(event));
    if (moveQuickFogSelection(event)) return;
    if (drawingMoveRef.current) { moveSelectedDrawing(event as unknown as ReactPointerEvent<SVGElement>); return; }
    if (poiMoveRef.current) { movePoi(event as unknown as ReactPointerEvent<HTMLButtonElement>); return; }
    if (tokenGestureRef.current) { moveToken(event as unknown as ReactPointerEvent<HTMLElement>); return; }
    if (!moveVisualMeasurement(event) && !moveDrawing(event) && !moveFog(event) && !moveSelection(event)) movePan(event);
  };
  const handleViewportPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (finishQuickFogSelection(event)) return;
    if (drawingMoveRef.current) { finishSelectedDrawing(event as unknown as ReactPointerEvent<SVGElement>); return; }
    if (poiMoveRef.current) { finishPoiMove(event as unknown as ReactPointerEvent<HTMLButtonElement>); return; }
    if (tokenGestureRef.current) { finishTokenMove(event as unknown as ReactPointerEvent<HTMLElement>); return; }
    if (!finishVisualMeasurement(event) && !finishDrawing(event) && !finishFog(event) && !finishSelection(event)) finishPan(event);
  };

  const beginTokenMove = (event: ReactPointerEvent<HTMLElement>, token: SessionMapToken) => {
    if (calibrationActive || activeTool === 'measure' || !canMoveToken(token) || event.button !== 0) return;
    if (selectionArmed && !selectedTokenIds.has(token.id)) {
      setSelectedTokenIds(new Set());
      setSelectedDrawingIds(new Set());
      setSelectedDrawingId(null);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setSelectedDrawingId(null);
    drawingTransformRef.current = null;
    setDrawingDraft(null);
    setTransformTokenId(null);
    setTokenMenu(null);
    const selectionMembers = selectedTokenIds.has(token.id) ? mapTokens.filter((candidate) => selectedTokenIds.has(candidate.id) && canMoveToken(candidate)) : [];
    const linkedTokens = selectionMembers.length > 0 ? selectionMembers : token.magnetGroupId ? mapTokens.filter((candidate) => candidate.magnetGroupId === token.magnetGroupId && canMoveToken(candidate)) : [token];
    const movingIds = new Set(linkedTokens.map((candidate) => candidate.id));
    if (selectionMembers.length === 0)
      linkedTokens.forEach((linkedToken) => {
        const tokenIndex = mapTokens.findIndex((candidate) => candidate.id === linkedToken.id);
        const tokenPosition = tokenDraftPositions[linkedToken.id] ?? remoteTokenPositions[linkedToken.id] ?? linkedToken;
        const tokenBounds = getTokenBounds(linkedToken, gridSettings.cellSize, tokenPosition);
        mapTokens.slice(tokenIndex + 1).forEach((candidate) => {
          const position = tokenDraftPositions[candidate.id] ?? remoteTokenPositions[candidate.id] ?? candidate;
          if (canMoveToken(candidate) && isBoundsFullyContained(getTokenBounds(candidate, gridSettings.cellSize, position), tokenBounds)) movingIds.add(candidate.id);
        });
      });
    const movingTokens = mapTokens.filter((candidate) => movingIds.has(candidate.id));
    const origins = Object.fromEntries(
      movingTokens.map((candidate) => {
        const position = tokenDraftPositions[candidate.id] ?? remoteTokenPositions[candidate.id] ?? candidate;
        return [candidate.id, { x: position.x, y: position.y }];
      }),
    );
    const selectedDrawings = selectionMembers.length > 0 ? mapDrawings.filter((drawing) => selectedDrawingIds.has(drawing.id) && !drawing.pinned && (isOwner || !drawing.locked)) : [];
    const drawingOrigins = Object.fromEntries(selectedDrawings.map((drawing) => [drawing.id, { x: drawing.x, y: drawing.y }]));
    tokenGestureRef.current = {
      pointerId: event.pointerId,
      tokenId: token.id,
      startX: event.clientX,
      startY: event.clientY,
      origins,
      positions: origins,
      drawingOrigins,
      drawingPositions: drawingOrigins,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveToken = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = tokenGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const token = mapTokens.find((candidate) => candidate.id === gesture.tokenId);
    if (!token) return;
    const size = getTokenSize(token, gridSettings.cellSize);
    const origin = gesture.origins[gesture.tokenId];
    const position = snapToSessionGrid(
      {
        x: origin.x + (event.clientX - gesture.startX) / view.scale,
        y: origin.y + (event.clientY - gesture.startY) / view.scale,
      },
      gridSettings,
      { width: size, height: size },
    );
    const delta = { x: position.x - origin.x, y: position.y - origin.y };
    gesture.positions = Object.fromEntries(Object.entries(gesture.origins).map(([id, itemOrigin]) => [id, { x: itemOrigin.x + delta.x, y: itemOrigin.y + delta.y }]));
    gesture.drawingPositions = Object.fromEntries(Object.entries(gesture.drawingOrigins).map(([id, itemOrigin]) => [id, { x: itemOrigin.x + delta.x, y: itemOrigin.y + delta.y }]));
    setTokenDraftPositions((current) => ({ ...current, ...gesture.positions }));
    setDrawingMoveDrafts(gesture.drawingPositions);
    const now = performance.now();
    if (now - tokenPreviewSentAtRef.current >= 33) {
      tokenPreviewSentAtRef.current = now;
      onTokenMovePreview?.(gesture.positions);
    }
  };

  const finishTokenMove = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = tokenGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    tokenGestureRef.current = null;
    onTokenMovePreview?.(gesture.positions, true);
    onTokensMove?.(gesture.positions);
    if (Object.keys(gesture.drawingPositions).length > 0) onDrawingsMove?.(gesture.drawingPositions);
    setDrawingMoveDrafts({});
    if (!isOwner) return;
    setTokenDraftPositions((current) => {
      const next = { ...current };
      Object.keys(gesture.positions).forEach((id) => delete next[id]);
      return next;
    });
  };

  const beginDepthSelectedMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !depthSelectedKey || !depthHoveredKeys.has(depthSelectedKey) || (event.target as Element).closest('[role="menu"]')) return false;
    const separator = depthSelectedKey.indexOf('\u0000');
    const family = depthSelectedKey.slice(0, separator);
    const id = depthSelectedKey.slice(separator + 1);
    if (family === 'drawing') {
      const drawing = mapDrawings.find(item => item.id === id);
      if (!drawing || !isOwner || drawing.pinned) return false;
      beginDrawingMove(event as unknown as ReactPointerEvent<SVGElement>, drawing);
    } else if (family === 'token') {
      const token = mapTokens.find(item => item.id === id);
      if (!token || !canMoveToken(token)) return false;
      beginTokenMove(event as unknown as ReactPointerEvent<HTMLElement>, token);
    } else if (family === 'poi') {
      const poi = mapPois.find(item => item.id === id);
      if (!poi || !canControlPoi(poi)) return false;
      beginPoiMove(event as unknown as ReactPointerEvent<HTMLButtonElement>, poi);
    } else return false;
    setTokenMenu(null);
    setDrawingMenu(null);
    setPoiMenu(null);
    return true;
  };

  const openTokenMenu = (event: ReactMouseEvent<HTMLElement>, tokenId: string) => {
    event.preventDefault();
    event.stopPropagation();
    if (openUnderlyingMapObjectMenu(event.clientX, event.clientY, { family: 'token', id: tokenId })) return;
    showPastePrompt(event.clientX, event.clientY, 'token');
    if (selectionArmed && !selectedTokenIds.has(tokenId)) {
      setSessionMapSelectionArmed(false);
      setSelectedTokenIds(new Set());
      setSelectedDrawingIds(new Set());
      setSelectedDrawingId(null);
      return;
    }
    setTransformTokenId(null);
    const token = mapTokens.find((candidate) => candidate.id === tokenId);
    const viewport = viewportRef.current;
    if (!viewport || !token || (!isOwner && !canControlToken(token))) return;
    const menuPosition = menuPositionBeside(event.currentTarget);
    if (!menuPosition) return;
    const { x, y } = menuPosition;
    const selectedDrawing = mapDrawings.find((drawing) => selectedDrawingIds.has(drawing.id));
    if (selectedDrawing) {
      setTokenMenu({
        tokenId,
        x,
        y,
        panel: null,
        nameDraft: token.name,
        customConditionDraft: '',
      });
      setDrawingMenu({ id: selectedDrawing.id, x, y });
    } else {
      setTokenMenu({
        tokenId,
        x,
        y,
        panel: null,
        nameDraft: token.name,
        customConditionDraft: '',
      });
      setDrawingMenu(null);
    }
  };

  const moveTokenLayer = (move: MapLayerMove) => {
    if (!tokenMenu) return;
    const targetIds = selectedTokenIds.has(tokenMenu.tokenId) ? [...selectedTokenIds] : [tokenMenu.tokenId];
    if (targetIds.length > 1) onTokensLayerMove?.(targetIds, move);
    else onTokenLayerMove?.(tokenMenu.tokenId, move);
    setTokenMenu(null);
  };

  const beginTokenTransform = (event: ReactPointerEvent<SVGElement>, token: SessionMapToken, kind: 'resize' | 'rotate') => {
    if (!canControlToken(token) || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const members = selectedTokenIds.has(token.id) && selectedTokenIds.size > 1 ? mapTokens.filter((candidate) => selectedTokenIds.has(candidate.id) && canControlToken(candidate)) : token.magnetGroupId ? mapTokens.filter((candidate) => candidate.magnetGroupId === token.magnetGroupId && canControlToken(candidate)) : [token];
    const origins = Object.fromEntries(
      members.map((member) => {
        const current = tokenDraftTransforms[member.id];
        return [
          member.id,
          current ?? {
            x: member.x,
            y: member.y,
            size: getTokenSize(member, gridSettings.cellSize),
            rotation: member.rotation ?? 0,
          },
        ];
      }),
    );
    const origin = origins[token.id];
    const centerClientX = rect.left + view.x + (origin.x + origin.size / 2) * view.scale;
    const centerClientY = rect.top + view.y + (origin.y + origin.size / 2) * view.scale;
    const startDistance = Math.max(1, Math.hypot(event.clientX - centerClientX, event.clientY - centerClientY));
    const startAngle = Math.atan2(event.clientY - centerClientY, event.clientX - centerClientX);
    tokenTransformGestureRef.current = {
      pointerId: event.pointerId,
      tokenId: token.id,
      kind,
      centerClientX,
      centerClientY,
      startDistance,
      startAngle,
      origins,
      drafts: origins,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveTokenTransform = (event: ReactPointerEvent<SVGElement>) => {
    const gesture = tokenTransformGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (gesture.kind === 'resize') {
      const distance = Math.hypot(event.clientX - gesture.centerClientX, event.clientY - gesture.centerClientY);
      const factor = distance / gesture.startDistance;
      gesture.drafts = Object.fromEntries(
        Object.entries(gesture.origins).map(([id, origin]) => {
          const size = Math.min(2000, Math.max(8, origin.size * factor));
          return [
            id,
            {
              ...origin,
              x: origin.x + (origin.size - size) / 2,
              y: origin.y + (origin.size - size) / 2,
              size,
            },
          ];
        }),
      );
    } else {
      const angle = Math.atan2(event.clientY - gesture.centerClientY, event.clientX - gesture.centerClientX);
      const delta = ((angle - gesture.startAngle) * 180) / Math.PI;
      gesture.drafts = Object.fromEntries(
        Object.entries(gesture.origins).map(([id, origin]) => [
          id,
          {
            ...origin,
            rotation: Math.round((origin.rotation + delta) * 10) / 10,
          },
        ]),
      );
    }
    setTokenDraftTransforms((current) => ({ ...current, ...gesture.drafts }));
  };

  const finishTokenTransform = (event: ReactPointerEvent<SVGElement>) => {
    const gesture = tokenTransformGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    tokenTransformGestureRef.current = null;
    onTokenTransformsChange?.(gesture.drafts);
    if (!isOwner) return;
    setTokenDraftTransforms((current) => {
      const next = { ...current };
      Object.keys(gesture.drafts).forEach((id) => delete next[id]);
      return next;
    });
  };

  const beginMenuDrag = (event: ReactPointerEvent<HTMLButtonElement>, menu: 'token' | 'drawing' | 'poi' | 'fog', position: { x: number; y: number }) => {
    event.preventDefault();
    event.stopPropagation();
    if (menu === 'drawing') setDrawingMenuDetached(true);
    menuDragRef.current = {
      pointerId: event.pointerId,
      menu,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveMenuDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = menuDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const rect = viewportRef.current?.getBoundingClientRect();
    const x = Math.max(0, Math.min((rect?.width ?? Infinity) - 48, drag.originX + event.clientX - drag.startX));
    const y = Math.max(0, Math.min((rect?.height ?? Infinity) - 40, drag.originY + event.clientY - drag.startY));
    if (drag.menu === 'token') setTokenMenu((current) => (current ? { ...current, x, y } : null));
    else if (drag.menu === 'drawing') setDrawingMenu((current) => (current ? { ...current, x, y } : null));
    else if (drag.menu === 'poi') setPoiMenu((current) => (current ? { ...current, x, y } : null));
    else setFogMenu((current) => (current ? { ...current, x, y } : null));
  };
  const finishMenuDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = menuDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    menuDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const editingTextDrawing = textDraft?.editingId ? mapDrawings.find((drawing) => drawing.id === textDraft.editingId) : undefined;
  const activeTextStyle = editingTextDrawing?.text ?? drawSettings.textStyle;
  const activeTextStrokeWidth = editingTextDrawing?.style.strokeWidth ?? drawSettings.style.strokeWidth;
  const automaticVisionBlockers: Array<Pick<AnalysisSegment, 'start' | 'end'>> = useMemo(() => mapFog.flatMap(fog => {
    if (!fog.visionBlocker || !fog.points || fog.points.length < 2) return [];
    return [{ start: { x: fog.x + fog.points[0].x - placement.x, y: fog.y + fog.points[0].y - placement.y }, end: { x: fog.x + fog.points[1].x - placement.x, y: fog.y + fog.points[1].y - placement.y } }];
  }), [mapFog, placement.x, placement.y]);
  const distanceToWorld = (distance: number) => gridSettings.distance > 0 ? distance * gridSettings.cellSize / gridSettings.distance : 0;
  const mapBounds = placement.width && placement.height ? { width: placement.width, height: placement.height } : null;
  const coneDirection = (key: string, configured: number | undefined, fallback: number) => ((coneDirectionDrafts[key] ?? configured ?? fallback) - 90) * Math.PI / 180;
  const largestOuterRing = (geometry: number[][][][]) => geometry.flatMap(polygon => polygon.slice(0, 1)).sort((a, b) => {
    const area = (ring: number[][]) => Math.abs(ring.reduce((total, point, index) => total + point[0] * ring[(index + 1) % ring.length][1] - ring[(index + 1) % ring.length][0] * point[1], 0));
    return area(b) - area(a);
  })[0];
  const flashlightBeamPoints = (source: { origin: SessionMapPoint; radius: number; coneAngle?: number; direction: number; sourceSize: number }) => {
    const radius = distanceToWorld(source.radius);
    const halfAngle = Math.min(180, Math.max(5, source.coneAngle ?? 60)) * Math.PI / 360;
    const neckDistance = Math.min(radius * 0.22, source.sourceSize * 0.38);
    const neckHalfWidth = Math.min(radius * 0.08, source.sourceSize * 0.16);
    const capDepth = Math.min(radius * 0.16, Math.max(radius * 0.04, Math.tan(halfAngle) * radius * 0.22));
    const capCenterDistance = Math.max(neckDistance, radius - capDepth);
    const farHalfWidth = Math.min(radius * 1.5, Math.max(neckHalfWidth, Math.tan(halfAngle) * capCenterDistance));
    const point = (forward: number, lateral: number) => ({
      x: source.origin.x + Math.cos(source.direction) * forward - Math.sin(source.direction) * lateral,
      y: source.origin.y + Math.sin(source.direction) * forward + Math.cos(source.direction) * lateral,
    });
    return [
      point(neckDistance, neckHalfWidth),
      ...Array.from({ length: 25 }, (_, index) => {
        const angle = Math.PI / 2 - index * Math.PI / 24;
        return point(capCenterDistance + Math.cos(angle) * capDepth, Math.sin(angle) * farHalfWidth);
      }),
      point(neckDistance, -neckHalfWidth),
    ];
  };
  const visibilityPolygon = (source: { key: string; origin: SessionMapPoint; radius: number; shape?: 'circle' | 'cone'; coneAngle?: number; direction: number; sourceSize: number }) => {
    if (!mapBounds) return [];
    const localOrigin = { x: source.origin.x - placement.x, y: source.origin.y - placement.y };
    const radius = distanceToWorld(source.radius);
    const relevantBlockers = filterSegmentsNearCircle(localOrigin, radius, automaticVisionBlockers);
    const pointLimit = relevantBlockers.length > 100 ? 384 : 512;
    const visibility = computeVisibilityPolygon(localOrigin, relevantBlockers, mapBounds, pointLimit, radius).map(point => ({ x: point.x + placement.x, y: point.y + placement.y }));
    if (source.shape !== 'cone' || visibility.length < 3) return visibility;
    const sourceRadius = source.sourceSize * 0.52;
    const sourceCircle = Array.from({ length: 32 }, (_, index) => {
      const angle = index * Math.PI * 2 / 32;
      return [source.origin.x + Math.cos(angle) * sourceRadius, source.origin.y + Math.sin(angle) * sourceRadius] as [number, number];
    });
    try {
      const clipped = polygonClipping.intersection(
        [[visibility.map(point => [point.x, point.y] as [number, number])]],
        [[flashlightBeamPoints(source).map(point => [point.x, point.y] as [number, number])]],
      );
      const largest = largestOuterRing(polygonClipping.union(clipped, [[sourceCircle]]));
      if (!largest || largest.length < 3) return coneVisibilityCacheRef.current[source.key] ?? sourceCircle.map(([x, y]) => ({ x, y }));
      const result = largest.map(([x, y]) => ({ x, y }));
      coneVisibilityCacheRef.current[source.key] = result;
      return result;
    } catch {
      // Keep the last valid mask during a degenerate drag frame. Replacing it
      // with a fallback shape would make the fog flash until the next frame.
      return coneVisibilityCacheRef.current[source.key] ?? sourceCircle.map(([x, y]) => ({ x, y }));
    }
  };
  const publicLightSources = useMemo(() => [
    ...mapTokens.filter(token => (isOwner || token.visible !== false) && token.light?.enabled && token.light.radius > 0).map(token => {
      const position = tokenDraftTransforms[token.id] ?? tokenDraftPositions[token.id] ?? remoteTokenPositions[token.id] ?? token;
      const size = tokenDraftTransforms[token.id]?.size ?? getTokenSize(token, gridSettings.cellSize);
      const key = `token:${token.id}:light`;
      return { id: `token-${token.id}`, key, family: 'token' as const, entityId: token.id, sourceType: 'light' as const, interactive: canControlToken(token), origin: { x: position.x + size / 2, y: position.y + size / 2 }, radius: token.light!.radius, shape: token.light!.shape, coneAngle: token.light!.coneAngle, direction: coneDirection(key, token.light!.coneDirection, tokenDraftTransforms[token.id]?.rotation ?? token.rotation ?? 0), sourceSize: size, effect: token.light!.effect, flickerPreset: token.light!.flickerPreset, outlineVisible: token.light!.outlineVisible !== false };
    }),
    ...mapPois.filter(poi => (isOwner || poi.visibleToPlayers) && poi.light?.enabled && poi.light.radius > 0).map(poi => {
      const position = poiDraftPositions[poi.id] ?? poi;
      const key = `poi:${poi.id}:light`;
      return { id: `poi-${poi.id}`, key, family: 'poi' as const, entityId: poi.id, sourceType: 'light' as const, interactive: canControlPoi(poi), origin: position, radius: poi.light!.radius, shape: poi.light!.shape, coneAngle: poi.light!.coneAngle, direction: coneDirection(key, poi.light!.coneDirection, poiDraftTransforms[poi.id]?.rotation ?? poi.rotation ?? 0), sourceSize: poiDraftTransforms[poi.id]?.size ?? poi.size, effect: poi.light!.effect, flickerPreset: poi.light!.flickerPreset, outlineVisible: poi.light!.outlineVisible !== false };
    }),
  ], [coneDirectionDrafts, gridSettings.cellSize, isOwner, mapPois, mapTokens, mapUserId, poiDraftPositions, poiDraftTransforms, remoteTokenPositions, tokenDraftPositions, tokenDraftTransforms]);
  const privateVisionSources = useMemo(() => [
    ...mapTokens.filter(token => (isOwner || token.visible !== false) && token.vision?.enabled && token.vision.radius > 0 && (isOwner || token.ownerProfileId === mapUserId || token.createdByProfileId === mapUserId)).map(token => {
      const position = tokenDraftTransforms[token.id] ?? tokenDraftPositions[token.id] ?? remoteTokenPositions[token.id] ?? token;
      const size = tokenDraftTransforms[token.id]?.size ?? getTokenSize(token, gridSettings.cellSize);
      const key = `token:${token.id}:vision`;
      return { id: `token-${token.id}`, key, family: 'token' as const, entityId: token.id, sourceType: 'vision' as const, interactive: canControlToken(token), origin: { x: position.x + size / 2, y: position.y + size / 2 }, radius: token.vision!.radius, shape: token.vision!.shape, coneAngle: token.vision!.coneAngle, direction: coneDirection(key, token.vision!.coneDirection, tokenDraftTransforms[token.id]?.rotation ?? token.rotation ?? 0), sourceSize: size, outlineVisible: token.vision!.outlineVisible !== false };
    }),
    ...mapPois.filter(poi => (isOwner || poi.visibleToPlayers) && poi.vision?.enabled && poi.vision.radius > 0 && (isOwner || poi.createdByProfileId === mapUserId)).map(poi => {
      const position = poiDraftPositions[poi.id] ?? poi;
      const key = `poi:${poi.id}:vision`;
      return { id: `poi-${poi.id}`, key, family: 'poi' as const, entityId: poi.id, sourceType: 'vision' as const, interactive: canControlPoi(poi), origin: position, radius: poi.vision!.radius, shape: poi.vision!.shape, coneAngle: poi.vision!.coneAngle, direction: coneDirection(key, poi.vision!.coneDirection, poiDraftTransforms[poi.id]?.rotation ?? poi.rotation ?? 0), sourceSize: poiDraftTransforms[poi.id]?.size ?? poi.size, outlineVisible: poi.vision!.outlineVisible !== false };
    }),
  ], [coneDirectionDrafts, gridSettings.cellSize, isOwner, mapPois, mapTokens, mapUserId, poiDraftPositions, poiDraftTransforms, remoteTokenPositions, tokenDraftPositions, tokenDraftTransforms]);
  const publicLightEffects = useMemo(() => publicLightSources.map(source => ({ source, points: visibilityPolygon(source) })).filter(item => item.points.length >= 3), [automaticVisionBlockers, gridSettings.cellSize, gridSettings.distance, placement.height, placement.width, placement.x, placement.y, publicLightSources]);
  const publicLightPolygons = publicLightEffects.map(item => item.points);
  const privateVisionPolygons = useMemo(() => privateVisionSources.map(visibilityPolygon).filter(points => points.length >= 3), [automaticVisionBlockers, gridSettings.cellSize, gridSettings.distance, placement.height, placement.width, placement.x, placement.y, privateVisionSources]);
  useEffect(() => {
    if (!isOwner || !onFogExplorationChange) return;
    const existingFogIds = new Set(mapFog.map(fog => fog.id));
    deletingExploredFogIdsRef.current.forEach(id => { if (!existingFogIds.has(id)) deletingExploredFogIdsRef.current.delete(id); });
    const lightPolygons = publicLightEffects.map(item => item.points).filter(points => points.length >= 3);
    const visionPolygons = privateVisionPolygons.filter(points => points.length >= 3);
    const updates: Record<string, Partial<SessionMapFog>> = {};
    for (const fog of mapFog) {
      if (fog.operation !== 'cover' || fog.enabled === false || (fog.persistence ?? 'permanent') === 'permanent') continue;
      try {
        const fogPolygon = [fogWorldPolygon(fog)] as FogMultiPolygon;
        const clipPolygons = (polygons: SessionMapPoint[][]) => polygons.reduce<FogMultiPolygon>((combined, points) => {
          const clipped = polygonClipping.intersection(fogPolygon, [[points.map(point => [point.x, point.y] as [number, number])]]) as FogMultiPolygon;
          return clipped.length ? (combined.length ? polygonClipping.union(combined, clipped) as FogMultiPolygon : clipped) : combined;
        }, []);
        const visionObserved = clipPolygons(visionPolygons);
        const lightObserved = clipPolygons(lightPolygons);
        if (fog.persistence === 'volatile') {
          const currentVision = fogCurrentVisionRef.current[fog.id];
          const visionSignature = JSON.stringify(multiPolygonToExploredAreas(visionObserved));
          const visionAnchors = privateVisionSources.map(source => source.origin);
          const minimumSweepDistance = Math.max(8, gridSettings.cellSize * 0.35);
          if (!fogVolatileTrailCacheRef.current[fog.id]) fogVolatileTrailCacheRef.current[fog.id] = fog.exploredAreas ?? [];
          const visionChanged = currentVision
            ? visionObserved.length === 0
              || currentVision.anchors.length !== visionAnchors.length
              || visionAnchors.some((anchor, index) => Math.hypot(anchor.x - currentVision.anchors[index].x, anchor.y - currentVision.anchors[index].y) >= minimumSweepDistance)
            : visionObserved.length > 0;
          if (visionChanged) {
            if (visionObserved.length === 0) {
              fogVolatileTrailCacheRef.current[fog.id] = fogExplorationCacheRef.current[fog.id] ?? fog.exploredAreas ?? fogVolatileTrailCacheRef.current[fog.id];
            } else if (currentVision?.polygons.length) {
              const trail = exploredAreasToMultiPolygon(fogVolatileTrailCacheRef.current[fog.id]);
              fogVolatileTrailCacheRef.current[fog.id] = multiPolygonToExploredAreas(trail.length ? polygonClipping.union(trail, currentVision.polygons) as FogMultiPolygon : currentVision.polygons);
            }
            if (visionObserved.length) fogCurrentVisionRef.current[fog.id] = { signature: visionSignature, polygons: visionObserved, anchors: visionAnchors };
            else delete fogCurrentVisionRef.current[fog.id];
            forceFogExplorationRender(revision => revision + 1);
          }
        }
        const observed = visionObserved.length && lightObserved.length
          ? polygonClipping.union(visionObserved, lightObserved) as FogMultiPolygon
          : visionObserved.length ? visionObserved : lightObserved;
        if (observed.length === 0) continue;
        const cached = fogExplorationCacheRef.current[fog.id] ?? fog.exploredAreas ?? [];
        const previous = exploredAreasToMultiPolygon(cached);
        const merged = previous.length ? polygonClipping.union(previous, observed) as FogMultiPolygon : observed;
        const exploredAreas = multiPolygonToExploredAreas(merged);
        const cachedLight = fogLightExplorationCacheRef.current[fog.id] ?? fog.lightExploredAreas ?? [];
        const previousLight = exploredAreasToMultiPolygon(cachedLight);
        const mergedLight = lightObserved.length
          ? (previousLight.length ? polygonClipping.union(previousLight, lightObserved) as FogMultiPolygon : lightObserved)
          : previousLight;
        const lightExploredAreas = multiPolygonToExploredAreas(mergedLight);
        if (fog.persistence === 'volatile' && onFogDelete && !deletingExploredFogIdsRef.current.has(fog.id)) {
          const remaining = polygonClipping.difference(fogPolygon, merged) as FogMultiPolygon;
          const remainingArea = remaining.reduce((total, polygon) => total + polygon.reduce((polygonTotal, ring, ringIndex) => {
            const area = polygonArea(ring.map(([x, y]) => ({ x, y })));
            return polygonTotal + (ringIndex === 0 ? area : -area);
          }, 0), 0);
          const originalArea = fogPolygon.reduce((total, polygon) => total + polygon.reduce((polygonTotal, ring, ringIndex) => {
            const area = polygonArea(ring.map(([x, y]) => ({ x, y })));
            return polygonTotal + (ringIndex === 0 ? area : -area);
          }, 0), 0);
          if (remaining.length === 0 || remainingArea <= Math.max(1, originalArea * 0.0001)) {
            deletingExploredFogIdsRef.current.add(fog.id);
            delete fogExplorationCacheRef.current[fog.id];
            delete fogLightExplorationCacheRef.current[fog.id];
            delete fogVolatileTrailCacheRef.current[fog.id];
            delete fogCurrentVisionRef.current[fog.id];
            delete pendingFogExplorationRef.current[fog.id];
            onFogDelete(fog.id);
            continue;
          }
        }
        const explorationChanged = JSON.stringify(exploredAreas) !== JSON.stringify(cached);
        const lightExplorationChanged = JSON.stringify(lightExploredAreas) !== JSON.stringify(cachedLight);
        if (!explorationChanged && !lightExplorationChanged) continue;
        fogExplorationCacheRef.current[fog.id] = exploredAreas;
        fogLightExplorationCacheRef.current[fog.id] = lightExploredAreas;
        forceFogExplorationRender(revision => revision + 1);
        updates[fog.id] = { exploredAreas, lightExploredAreas };
      } catch {
        // Degenerate polygon frames are ignored; the last valid exploration remains.
      }
    }
    if (Object.keys(updates).length > 0) {
      pendingFogExplorationRef.current = { ...pendingFogExplorationRef.current, ...updates };
      if (fogExplorationTimerRef.current !== null) clearTimeout(fogExplorationTimerRef.current);
      fogExplorationTimerRef.current = setTimeout(() => {
        fogExplorationTimerRef.current = null;
        const pending = pendingFogExplorationRef.current;
        pendingFogExplorationRef.current = {};
        if (Object.keys(pending).length > 0) onFogExplorationChange(pending);
      }, 50);
    }
  }, [isOwner, mapFog, onFogDelete, onFogExplorationChange, privateVisionPolygons, publicLightEffects]);
  useEffect(() => () => {
    if (fogExplorationTimerRef.current !== null) clearTimeout(fogExplorationTimerRef.current);
  }, []);
  const viewportWidth = viewportRef.current?.clientWidth ?? 0;
  const viewportHeight = viewportRef.current?.clientHeight ?? 0;
  const mapWorldWidth = placement.width ?? placementElementRef.current?.offsetWidth ?? viewportWidth / view.scale;
  const mapWorldHeight = placement.height ?? placementElementRef.current?.offsetHeight ?? viewportHeight / view.scale;
  const mapWorldCenterX = placement.x + mapWorldWidth / 2;
  const mapWorldCenterY = placement.y + mapWorldHeight / 2;
  const worldBounds = {
    minX: mapWorldCenterX - MAP_WORLD_WIDTH / 2,
    minY: mapWorldCenterY - MAP_WORLD_HEIGHT / 2,
    maxX: mapWorldCenterX + MAP_WORLD_WIDTH / 2,
    maxY: mapWorldCenterY + MAP_WORLD_HEIGHT / 2,
  };
  const visibleWorldBounds = viewportWidth > 0 && viewportHeight > 0 ? {
    x: -view.x / view.scale,
    y: -view.y / view.scale,
    width: viewportWidth / view.scale,
    height: viewportHeight / view.scale,
  } : null;
  const viewportMargin = 160 / view.scale;
  const fogMaskMargin = Math.max(gridSettings.cellSize, 32);
  const fogMaskBounds = {
    x: placement.x - fogMaskMargin,
    y: placement.y - fogMaskMargin,
    width: (placement.width ?? placementElementRef.current?.offsetWidth ?? viewportWidth / view.scale) + fogMaskMargin * 2,
    height: (placement.height ?? placementElementRef.current?.offsetHeight ?? viewportHeight / view.scale) + fogMaskMargin * 2,
  };
  const intersectsViewport = (bounds: { x: number; y: number; width: number; height: number }) => !visibleWorldBounds
    || bounds.x + bounds.width >= visibleWorldBounds.x - viewportMargin
    && bounds.x <= visibleWorldBounds.x + visibleWorldBounds.width + viewportMargin
    && bounds.y + bounds.height >= visibleWorldBounds.y - viewportMargin
    && bounds.y <= visibleWorldBounds.y + visibleWorldBounds.height + viewportMargin;
  const visibleDrawings = mapDrawings.filter(drawing => {
    if (selectedDrawingIds.has(drawing.id) || drawingMoveDrafts[drawing.id] || drawingTransformDrafts[drawing.id] || drawingMenu?.id === drawing.id) return true;
    return intersectsViewport(getRotatedRectBounds(drawing, drawing.width, drawing.height, drawing.rotation ?? 0));
  });
  const visiblePois = mapPois.filter(poi => {
    if (poiMenu?.poiId === poi.id || poiDraftPositions[poi.id] || poiDraftTransforms[poi.id]) return true;
    const size = poi.size;
    return intersectsViewport({ x: poi.x - size / 2, y: poi.y - size / 2, width: size, height: size });
  });
  const currentVisibilityPolygons = [...publicLightPolygons, ...privateVisionPolygons];
  const visibleTokens = mapTokens.filter(token => {
    if (selectedTokenIds.has(token.id) || tokenMenu?.tokenId === token.id || tokenDraftPositions[token.id] || remoteTokenPositions[token.id] || tokenDraftTransforms[token.id]) return true;
    const size = getTokenSize(token, gridSettings.cellSize);
    if (!isOwner) {
      const center = { x: token.x + size / 2, y: token.y + size / 2 };
      const currentlyVisible = currentVisibilityPolygons.some(points => points.length >= 3 && pointInPolygon(center, points));
      if (!currentlyVisible && !canControlToken(token) && mapFog.some(fog => fog.operation === 'cover' && fog.enabled !== false && fog.persistence === 'semi-persistent' && exploredAreasContainPoint(fog.exploredAreas, center) && fogContainsPoint(fog, center))) return false;
    }
    return intersectsViewport({ x: token.x, y: token.y, width: size, height: size });
  });
  const beginConeDirection = (event: ReactPointerEvent<SVGCircleElement>, source: { key: string; family: 'token' | 'poi'; entityId: string; sourceType: 'light' | 'vision'; direction: number; interactive: boolean }) => {
    if (event.button !== 0 || !source.interactive) return;
    event.preventDefault();
    event.stopPropagation();
    const direction = (source.direction * 180 / Math.PI + 90 + 360) % 360;
    coneDirectionGestureRef.current = { pointerId: event.pointerId, key: source.key, family: source.family, id: source.entityId, sourceType: source.sourceType, direction };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveConeDirection = (event: ReactPointerEvent<SVGCircleElement>, origin: SessionMapPoint) => {
    const gesture = coneDirectionGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const point = mapPointFromClient(event.clientX, event.clientY);
    if (!point) return;
    gesture.direction = (Math.atan2(point.y - origin.y, point.x - origin.x) * 180 / Math.PI + 90 + 360) % 360;
    if (coneDirectionFrameRef.current !== null) return;
    coneDirectionFrameRef.current = window.requestAnimationFrame(() => {
      coneDirectionFrameRef.current = null;
      const current = coneDirectionGestureRef.current;
      if (current) setConeDirectionDrafts(drafts => ({ ...drafts, [current.key]: current.direction }));
    });
  };
  const finishConeDirection = (event: ReactPointerEvent<SVGCircleElement>) => {
    const gesture = coneDirectionGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    if (coneDirectionFrameRef.current !== null) {
      window.cancelAnimationFrame(coneDirectionFrameRef.current);
      coneDirectionFrameRef.current = null;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    coneDirectionGestureRef.current = null;
    const direction = Math.round(gesture.direction * 10) / 10;
    if (gesture.family === 'token') {
      const token = mapTokens.find(item => item.id === gesture.id);
      const source = token?.[gesture.sourceType];
      if (token && source) onTokenChange?.(token.id, { [gesture.sourceType]: { ...source, coneDirection: direction } });
    } else {
      const poi = mapPois.find(item => item.id === gesture.id);
      const source = poi?.[gesture.sourceType];
      if (poi && source) onPoiChange?.(poi.id, { [gesture.sourceType]: { ...source, coneDirection: direction } });
    }
    setConeDirectionDrafts(current => { const next = { ...current }; delete next[gesture.key]; return next; });
  };

  return (
    <div
      ref={viewportRef}
      key={mapId}
      data-map-viewport
      data-map-tool-active={activeTool}
      data-map-panning={panning || undefined}
      data-map-move-target={moveTargetAvailable ? 'movable' : 'fixed'}
      className={`relative h-full min-h-0 w-full overflow-hidden touch-none bg-[radial-gradient(circle_at_center,#262a31_0%,#14161b_58%,#0d0f13_100%)] ${drawingMagnetLink || calibrationActive || (activeTool === 'select' && selectionArmed) || (activeTool === 'draw' && !['grab', 'eraser'].includes(drawSettings.mode)) || (activeTool === 'fog' && !['grab', 'quick-select'].includes(fogSettings.mode)) ? 'cursor-crosshair' : activeTool === 'draw' && drawSettings.mode === 'eraser' ? 'cursor-cell' : ''}`}
      onWheel={zoom}
      onAuxClick={(event) => {
        if (event.button === 1) event.preventDefault();
      }}
      onPointerDownCapture={handleViewportPointerDownCapture}
      onPointerDown={handleViewportPointerDown}
      onPointerMove={(event) => {
        lastMapPointerRef.current = { clientX: event.clientX, clientY: event.clientY };
        scheduleDepthHover(event.clientX, event.clientY);
        handleViewportPointerMove(event);
      }}
      onPointerUp={handleViewportPointerUp}
      onContextMenu={(event) => {
        if (drawingClipboard || fogClipboard || poiClipboard) {
          event.preventDefault();
          const pasteType = drawingClipboard ? 'drawing' : fogClipboard ? 'fog' : 'poi';
          showPastePrompt(event.clientX, event.clientY, 'map', pasteType);
          return;
        }
        if (isOwner && activeTool === 'fog') {
          const point = mapPointFromClient(event.clientX, event.clientY);
          const fog = point ? [...mapFog].reverse().find(item => !item.fullMap && !item.visionBlocker && fogContainsPoint(fogPathDrafts[item.id] ?? fogTransformDrafts[item.id] ?? { ...item, ...(fogMoveDrafts[item.id] ?? {}) }, point)) : null;
          const rect = viewportRef.current?.getBoundingClientRect();
          event.preventDefault();
          event.stopPropagation();
          if (fog && rect) {
            setSelectedFogIds(new Set([fog.id])); setFogSelectionMenu(null); setTokenMenu(null); setDrawingMenu(null); setPoiMenu(null);
            setFogMenu({ id: fog.id, x: Math.max(8, Math.min(event.clientX - rect.left + 12, rect.width - 350)), y: Math.max(8, Math.min(event.clientY - rect.top, rect.height - 260)), panel: null });
          } else { setFogMenu(null); setSelectedFogIds(new Set()); }
          return;
        }
        if (drawingMagnetLink) {
          event.preventDefault();
          finishDrawingMagnetLink();
          return;
        }
        if (openUnderlyingMapObjectMenu(event.clientX, event.clientY)) {
          event.preventDefault();
          return;
        }
        if (selectionArmed) {
          event.preventDefault();
          if ((event.target as Element).closest('[data-selected-map-element="true"]')) return;
          setSessionMapSelectionArmed(false);
          setSelectedTokenIds(new Set());
          setSelectedDrawingIds(new Set());
          setSelectedDrawingId(null);
        }
      }}
      onPointerCancel={(event) => {
        if (finishQuickFogSelection(event)) return;
        if (!finishVisualMeasurement(event) && !finishDrawing(event) && !finishSelection(event)) finishPan(event);
      }}
      onPointerLeave={() => {
        setFogPersistenceHint(null);
        setDepthHoveredKeys(new Set());
        depthSelectionRef.current = null;
        setDepthSelectedKey(null);
        if (!panning) setMoveTargetAvailable(false);
      }}
      onLostPointerCapture={() => {
        panRef.current = null;
        selectionGestureRef.current = null;
        setSelectionDraft(null);
        setPanning(false);
      }}
    >
      <div
        data-map-transform
        data-map-is-moving={isMoving ? 'true' : undefined}
        className="relative w-full origin-top-left select-none"
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
        }}
      >
        <div
          ref={placementElementRef}
          data-map-placement
          data-map-movable={isOwner && !mapPlacement.locked ? 'true' : 'false'}
          className={placement.width ? '' : 'w-full'}
          style={{
            width: placement.width,
            height: placement.height,
            transform: `translate(${placement.x}px, ${placement.y}px)`,
          }}
        >
          {children}
        </div>
        <CanvasGrid settings={gridSettings} patternId={`canvas-grid-${mapId.replace(/[^a-zA-Z0-9_-]/g, '')}`} view={view} viewportWidth={viewportWidth || 1920} viewportHeight={viewportHeight || 1080} worldBounds={worldBounds} />
        <div data-session-map-drawings className="pointer-events-none absolute inset-0">
          {visibleDrawings.map((drawing) => {
            if (textDraft?.editingId === drawing.id) return null;
            const moveDraft = drawingMoveDrafts[drawing.id];
            const renderedBase = drawingTransformDrafts[drawing.id] ?? (drawingDraft?.id === drawing.id ? drawingDraft : moveDraft ? { ...drawing, ...moveDraft } : drawing);
            const rendered = withMeasuredTextBounds(renderedBase);
            if (drawing.visible === false && !isOwner) return null;
            const interactive = isOwner && activeTool !== 'fog';
            return (
              <svg key={drawing.id} className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" style={{ zIndex: objectZIndex.get(`drawing\u0000${drawing.id}`) }}>
              <g
                data-map-interactive={interactive || undefined}
                transform={`translate(${rendered.x} ${rendered.y}) rotate(${rendered.rotation} ${rendered.width / 2} ${rendered.height / 2})`}
                opacity={isOwner && drawing.visible === false ? 0.35 : 1}
                onPointerEnter={() => {
                  hoveredMapElementRef.current = { type: 'drawing', id: drawing.id };
                  setHoveredDrawingId(drawing.id);
                  if (drawingMagnetLink && !drawingMagnetLink.ids.includes(drawing.id)) setDrawingMagnetLink((current) => (current ? { ...current, hoveredId: drawing.id } : null));
                }}
                onPointerLeave={() => {
                  if (hoveredMapElementRef.current?.type === 'drawing' && hoveredMapElementRef.current.id === drawing.id) hoveredMapElementRef.current = null;
                  setHoveredDrawingId((current) => (current === drawing.id ? null : current));
                  if (drawingMagnetLink?.hoveredId === drawing.id) setDrawingMagnetLink((current) => (current ? { ...current, hoveredId: null } : null));
                }}
                onPointerDown={(event) => {
                  if (drawingMagnetLink) {
                    event.preventDefault();
                    event.stopPropagation();
                    if (!drawingMagnetLink.ids.includes(drawing.id)) {
                      const linkedIds = drawing.magnetGroupId ? mapDrawings.filter((item) => item.magnetGroupId === drawing.magnetGroupId).map((item) => item.id) : [drawing.id];
                      setDrawingMagnetLink((current) =>
                        current
                          ? {
                              ...current,
                              ids: [...new Set([...current.ids, ...linkedIds])],
                              hoveredId: null,
                            }
                          : null,
                      );
                    }
                  } else if (activeTool === 'draw' && drawSettings.mode === 'eraser' && !drawing.pinned) {
                    event.preventDefault();
                    event.stopPropagation();
                    onDrawingDelete?.(drawing.id);
                  } else beginDrawingMove(event, drawing);
                }}
                onPointerMove={moveSelectedDrawing}
                onPointerUp={finishSelectedDrawing}
                onPointerCancel={finishSelectedDrawing}
                onContextMenu={(event) => {
                  if (!isOwner) return;
                  event.preventDefault();
                  event.stopPropagation();
                  if (openUnderlyingMapObjectMenu(event.clientX, event.clientY, { family: 'drawing', id: drawing.id })) return;
                  showPastePrompt(event.clientX, event.clientY, 'drawing');
                  if (drawingMagnetLink) {
                    finishDrawingMagnetLink();
                    return;
                  }
                  if (selectionArmed && !selectedDrawingIds.has(drawing.id)) {
                    setSessionMapSelectionArmed(false);
                    setSelectedTokenIds(new Set());
                    setSelectedDrawingIds(new Set());
                    setSelectedDrawingId(null);
                    return;
                  }
                  setDrawingStyleEditorOpen(false);
                  setDrawingLayerPanelOpen(false);
                  setDrawingTooltip(null);
                   const menuPosition = menuPositionBeside(event.currentTarget);
                   if (menuPosition) {
                     const { x, y } = menuPosition;
                    setDrawingMenu({ id: drawing.id, x, y });
                    const selectedToken = mapTokens.find((token) => selectedTokenIds.has(token.id));
                    if (selectedToken)
                      setTokenMenu({
                        tokenId: selectedToken.id,
                         x: Math.max(8, Math.min((viewportRef.current?.clientWidth ?? 398) - 398, x + 402)),
                        y,
                        panel: null,
                        nameDraft: selectedToken.name,
                        customConditionDraft: '',
                      });
                    else setTokenMenu(null);
                  }
                }}
              >
                {drawingGraphic(rendered, interactive, hoveredDrawingId === drawing.id || selectedDrawingIds.has(drawing.id) || depthHoveredKeys.has(`drawing\u0000${drawing.id}`))}
                {pathEditDrawingId === drawing.id && !drawing.pinned && rendered.points && (
                  <g aria-label="Modifica tracciato">
                    {rendered.points.map((point, index) => (
                      <circle key={`path-point-${index}`} role="slider" aria-label={`Nodo tracciato ${index + 1}`} tabIndex={0} className="pointer-events-auto cursor-move" cx={point.x} cy={point.y} r={6 / view.scale} fill="#1f2937" stroke="#fb923c" strokeWidth={2 / view.scale} onPointerDown={(event) => beginPathPointMove(event, rendered, index)} onPointerMove={movePathPoint} onPointerUp={finishPathPointMove} onPointerCancel={finishPathPointMove} />
                    ))}
                  </g>
                )}
                {selectedDrawingId === drawing.id && (
                  <g>
                    <rect x={drawing.kind === 'text' ? 0 : -4 / view.scale} y={drawing.kind === 'text' ? 0 : -4 / view.scale} width={drawing.kind === 'text' ? rendered.width : rendered.width + 8 / view.scale} height={drawing.kind === 'text' ? rendered.height : rendered.height + 8 / view.scale} fill="none" stroke="#0f172a" strokeWidth={5 / view.scale} />
                    <rect x={drawing.kind === 'text' ? 0 : -4 / view.scale} y={drawing.kind === 'text' ? 0 : -4 / view.scale} width={drawing.kind === 'text' ? rendered.width : rendered.width + 8 / view.scale} height={drawing.kind === 'text' ? rendered.height : rendered.height + 8 / view.scale} fill="none" stroke="#67e8f9" strokeWidth={3 / view.scale} strokeDasharray={`${7 / view.scale} ${4 / view.scale}`} />
                    {isOwner &&
                      !drawing.pinned &&
                      (
                        [
                          ['nw', 0, 0],
                          ['ne', rendered.width, 0],
                          ['sw', 0, rendered.height],
                          ['se', rendered.width, rendered.height],
                        ] as const
                      ).map(([corner, x, y]) => <rect key={corner} className="pointer-events-auto cursor-nwse-resize" x={x - 7 / view.scale} y={y - 7 / view.scale} width={14 / view.scale} height={14 / view.scale} fill="white" stroke="#06b6d4" strokeWidth={3 / view.scale} onPointerDown={(event) => beginDrawingTransform(event, drawing, 'resize', corner)} onPointerMove={moveDrawingTransform} onPointerUp={finishDrawingTransform} onPointerCancel={finishDrawingTransform} />)}
                    {isOwner && !drawing.pinned && (
                      <>
                        <line x1={rendered.width / 2} y1={0} x2={rendered.width / 2} y2={-28 / view.scale} stroke="#67e8f9" strokeWidth={1.5 / view.scale} />
                        <circle className="pointer-events-auto cursor-grab" cx={rendered.width / 2} cy={-32 / view.scale} r={7 / view.scale} fill="#06b6d4" stroke="white" strokeWidth={2 / view.scale} onPointerDown={(event) => beginDrawingTransform(event, drawing, 'rotate')} onPointerMove={moveDrawingTransform} onPointerUp={finishDrawingTransform} onPointerCancel={finishDrawingTransform} />
                      </>
                    )}
                    {isOwner &&
                      !drawing.pinned &&
                      drawing.kind === 'text' &&
                      rendered.text &&
                      normalizedTextCurveOffsets(rendered.text).map((offset, index, offsets) => {
                        const vertical = rendered.text?.orientation === 'vertical';
                        const along = (index + 1) / (offsets.length + 1);
                        const handleSize = 8 / view.scale;
                        const gap = 14 / view.scale;
                        const positions = vertical
                          ? [
                              { x: -gap + offset, y: rendered.height * along },
                              { x: rendered.width + gap + offset, y: rendered.height * along },
                            ]
                          : [
                              { x: rendered.width * along, y: -gap + offset },
                              { x: rendered.width * along, y: rendered.height + gap + offset },
                            ];
                        return positions.map((position, side) => <rect key={`curve-${index}-${side}`} aria-label={`Curva testo punto ${index + 1}`} className={`pointer-events-auto ${vertical ? 'cursor-ew-resize' : 'cursor-ns-resize'}`} x={position.x - handleSize / 2} y={position.y - handleSize / 2} width={handleSize} height={handleSize} fill="#f8fafc" stroke="#a855f7" strokeWidth={1.5 / view.scale} onPointerDown={(event) => beginTextCurve(event, rendered, index)} onPointerMove={moveTextCurve} onPointerUp={finishTextCurve} onPointerCancel={finishTextCurve} />);
                      })}
                  </g>
                )}
              </g>
              </svg>
            );
          })}
          <svg className="pointer-events-none absolute inset-0 z-[10000] h-full w-full overflow-visible">
          {drawingMagnetLink &&
            (() => {
              const source = mapDrawings.find((item) => item.id === drawingMagnetLink.ids[drawingMagnetLink.ids.length - 1]);
              if (!source) return null;
              return <line x1={source.x + source.width / 2} y1={source.y + source.height / 2} x2={drawingMagnetLink.pointer.x} y2={drawingMagnetLink.pointer.y} stroke="#67e8f9" strokeWidth={2 / view.scale} strokeDasharray={`${7 / view.scale} ${5 / view.scale}`} />;
            })()}
          {drawingMagnetLink?.hoveredId &&
            (() => {
              const target = mapDrawings.find((item) => item.id === drawingMagnetLink.hoveredId);
              if (!target) return null;
              const x = target.x + target.width / 2;
              const y = target.y + target.height / 2;
              return (
                <g className="pointer-events-none" transform={`translate(${x} ${y})`}>
                  <circle r={14 / view.scale} fill="#06b6d4" stroke="white" strokeWidth={2 / view.scale} />
                  <text textAnchor="middle" dominantBaseline="central" fill="white" fontSize={22 / view.scale} fontWeight="700">
                    +
                  </text>
                  <foreignObject x={18 / view.scale} y={-17 / view.scale} width={230 / view.scale} height={36 / view.scale}>
                    <div className="w-max rounded-md bg-[var(--dash-panel)] px-3 py-1.5 text-[var(--dash-text)] shadow-lg" style={{ fontSize: 12 / view.scale }}>
                      Click: collega · Esc o destro: completa
                    </div>
                  </foreignObject>
                </g>
              );
            })()}
          {drawingDraft && !mapDrawings.some((item) => item.id === drawingDraft.id) && <g transform={`translate(${drawingDraft.x} ${drawingDraft.y})`}>{drawingGraphic(drawingDraft)}</g>}
          {polygonPoints.length > 0 && (
            <g>
              <polyline points={[...polygonPoints, polygonHover ?? polygonPoints[polygonPoints.length - 1]].map((point) => `${point.x},${point.y}`).join(' ')} fill={drawSettings.style.fillColor} fillOpacity={drawSettings.style.fillOpacity} stroke={drawSettings.style.strokeColor} strokeWidth={drawSettings.style.strokeWidth} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
              {polygonPoints.map((point, index) => (
                <circle key={index} cx={point.x} cy={point.y} r={(index === 0 && polygonPoints.length >= 3 ? 8 : 5) / view.scale} fill={index === 0 && polygonPoints.length >= 3 ? '#22c55e' : '#f8fafc'} stroke="#0f172a" strokeWidth={2 / view.scale} />
              ))}
            </g>
          )}
          {lineStart && lineHover && <line x1={lineStart.x} y1={lineStart.y} x2={lineHover.x} y2={lineHover.y} stroke={drawSettings.style.strokeColor} strokeWidth={drawSettings.style.strokeWidth} strokeDasharray="6 4" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
          </svg>
        </div>
        {textDraft && (
          <textarea
            ref={textDraftRef}
            data-map-interactive
            data-map-text-draft
            aria-label="Testo sulla mappa"
            value={textDraft.value}
            onChange={(event) => setTextDraft((current) => (current ? { ...current, value: event.target.value } : null))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitTextDraft();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                setTextDraft(null);
              }
            }}
            onPointerDown={(event) => event.stopPropagation()}
            spellCheck={false}
            className="absolute z-[10000] min-w-10 resize-none overflow-hidden border-0 bg-transparent p-0 outline-none"
            style={{
              left: textDraft.point.x,
              top: textDraft.point.y,
              width: measureMapText({ ...activeTextStyle, content: textDraft.value || ' ' }, activeTextStrokeWidth).width / (activeTextStyle.horizontalScale ?? 1),
              height: Math.max(24, measureMapText({ ...activeTextStyle, content: textDraft.value || ' ' }, activeTextStrokeWidth).height),
              color: activeTextStyle.color,
              caretColor: activeTextStyle.color,
              WebkitTextStroke: `${Math.max(0.5, activeTextStrokeWidth / 4)}px ${activeTextStyle.strokeColor}`,
              fontFamily: activeTextStyle.fontFamily,
              fontSize: activeTextStyle.fontSize,
              fontWeight: activeTextStyle.bold ? 700 : 400,
              fontStyle: activeTextStyle.italic ? 'italic' : 'normal',
              textDecoration: [activeTextStyle.underline ? 'underline' : '', activeTextStyle.strike ? 'line-through' : ''].filter(Boolean).join(' '),
              textAlign: activeTextStyle.align,
              writingMode: activeTextStyle.orientation === 'vertical' ? 'vertical-rl' : 'horizontal-tb',
              textOrientation: activeTextStyle.orientation === 'vertical' ? 'upright' : undefined,
              lineHeight: 1.15,
              transform: `scaleX(${activeTextStyle.horizontalScale ?? 1})`,
              transformOrigin: 'left top',
            }}
          />
        )}
        {selectionDraft && (
          <svg aria-hidden="true" className="pointer-events-none absolute inset-0 z-[10000] overflow-visible">
            {selectionDraft.mode === 'rectangle' ? <rect x={Math.min(selectionDraft.start.x, selectionDraft.current.x)} y={Math.min(selectionDraft.start.y, selectionDraft.current.y)} width={Math.abs(selectionDraft.current.x - selectionDraft.start.x)} height={Math.abs(selectionDraft.current.y - selectionDraft.start.y)} fill="rgba(34,211,238,0.12)" stroke="#22d3ee" strokeWidth={1.5 / view.scale} strokeDasharray={`${6 / view.scale} ${4 / view.scale}`} /> : <polyline points={[...selectionDraft.points, selectionDraft.current].map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke="#22d3ee" strokeWidth={1.5 / view.scale} strokeDasharray={`${6 / view.scale} ${4 / view.scale}`} />}
          </svg>
        )}
        {calibrationStart && (
          <div aria-hidden="true" className="pointer-events-none absolute z-[10000]" style={{ left: calibrationStart.x, top: calibrationStart.y }}>
            <span className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-cyan-400 shadow-[0_0_0_3px_rgba(3,7,18,0.85)]" style={{ width: 14 / view.scale, height: 14 / view.scale }} />
            <span className="absolute left-3 top-3 whitespace-nowrap rounded-md border border-cyan-300/60 bg-slate-950/90 px-2 py-1 font-semibold text-cyan-100 shadow-lg" style={{ fontSize: 12 / view.scale }}>
              Seleziona un secondo incrocio distante
            </span>
          </div>
        )}
        {visualMeasurement && <MeasurementGraphic measurement={visualMeasurement} view={view} gridSettings={gridSettings} />}
        {Object.entries(remoteMeasurements).map(([key, measurement]) => (
          <MeasurementGraphic key={key} measurement={measurement} view={view} gridSettings={gridSettings} />
        ))}
        {depthHoveredKeys.size > 1 && (
          <svg aria-hidden="true" className="pointer-events-none absolute inset-0 z-[9999] h-full w-full overflow-visible">
            {objectOrder.map((ref) => {
              const key = `${ref.family}\u0000${ref.id}`;
              if (!depthHoveredKeys.has(key)) return null;
              let bounds: { x: number; y: number; width: number; height: number } | null = null;
              if (ref.family === 'drawing') {
                const drawing = mapDrawings.find(item => item.id === ref.id);
                if (drawing) bounds = getRotatedRectBounds(drawing, drawing.width, drawing.height, drawing.rotation ?? 0);
              } else if (ref.family === 'token') {
                const token = mapTokens.find(item => item.id === ref.id);
                const position = token ? tokenDraftTransforms[token.id] ?? tokenDraftPositions[token.id] ?? token : null;
                if (token && position) { const size = tokenDraftTransforms[token.id]?.size ?? getTokenSize(token, gridSettings.cellSize); bounds = { x: position.x, y: position.y, width: size, height: size }; }
              } else {
                const poi = mapPois.find(item => item.id === ref.id);
                const position = poi ? poiDraftPositions[poi.id] ?? poi : null;
                const size = poi ? poiDraftTransforms[poi.id]?.size ?? poi.size : 0;
                if (poi && position) bounds = { x: position.x - size / 2, y: position.y - size / 2, width: size, height: size };
              }
              const selected = key === depthSelectedKey;
              return bounds ? <rect key={key} x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height} fill={selected ? 'rgba(251,191,36,0.12)' : 'rgba(34,211,238,0.04)'} stroke={selected ? '#fbbf24' : '#67e8f9'} strokeWidth={(selected ? 3 : 1.5) / view.scale} strokeDasharray={selected ? undefined : `${5 / view.scale} ${3 / view.scale}`} /> : null;
            })}
          </svg>
        )}
        <div data-session-map-pois className="pointer-events-none absolute inset-0">
          {visiblePois.map((poi) => {
            const position = poiDraftPositions[poi.id] ?? poi;
            const transform = poiDraftTransforms[poi.id];
            const size = Math.max(8, transform?.size ?? poi.size);
            const rotation = transform?.rotation ?? poi.rotation ?? 0;
            const handleSize = Math.min(16, Math.max(12, size * view.scale * 0.14)) / view.scale;
            const rotationHandleSize = Math.min(18, Math.max(14, size * view.scale * 0.18)) / view.scale;
            const rotationLineLength = Math.min(32, Math.max(18, size * view.scale * 0.35)) / view.scale;
            return (
              <Tooltip key={poi.id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    data-map-interactive
                    data-map-poi-id={poi.id}
                    aria-label={poi.label || 'Punto di interesse'}
                    className={`${activeTool === 'fog' ? 'pointer-events-none' : 'pointer-events-auto'} absolute touch-none border-0 bg-transparent p-0 ${depthHoveredKeys.has(`poi\u0000${poi.id}`) ? 'drop-shadow-[0_0_7px_rgba(34,211,238,0.95)]' : ''} ${canControlPoi(poi) ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
                    style={{ transform: `translate3d(${position.x - size / 2}px, ${position.y - size / 2}px, 0)`, width: size, height: size, opacity: isOwner && !poi.visibleToPlayers ? 0.45 : 1, color: poi.color, zIndex: objectZIndex.get(`poi\u0000${poi.id}`) }}
                    onPointerDown={(event) => beginPoiMove(event, poi)}
                    onPointerMove={movePoi}
                    onPointerUp={finishPoiMove}
                    onPointerCancel={finishPoiMove}
                    onContextMenu={(event) => openPoiMenu(event, poi)}
                    onDoubleClick={() => {
                      if (poi.noteId) requestSessionNoteOpen(poi.noteId);
                    }}
                  >
                    <span className="relative block h-full w-full" style={{ transform: `rotate(${rotation}deg)` }}>
                      <NoteIconGlyph data-static-icon name={poi.iconName} className="h-full w-full drop-shadow-[0_2px_3px_rgba(0,0,0,.8)]" />
                      {transformPoiId === poi.id && canControlPoi(poi) && (
                        <svg data-map-interactive className="pointer-events-none absolute inset-0 overflow-visible" width={size} height={size}>
                          <rect x={0} y={0} width={size} height={size} fill="none" stroke="#0f172a" strokeWidth={5 / view.scale} />
                          <rect x={0} y={0} width={size} height={size} fill="none" stroke="#67e8f9" strokeWidth={3 / view.scale} strokeDasharray={`${7 / view.scale} ${4 / view.scale}`} />
                          {([[0, 0], [size, 0], [0, size], [size, size]] as const).map(([x, y], index) => <rect key={index} role="slider" aria-label="Ridimensiona PDI" tabIndex={0} className="pointer-events-auto cursor-nwse-resize" x={x - handleSize / 2} y={y - handleSize / 2} width={handleSize} height={handleSize} fill="white" stroke="#06b6d4" strokeWidth={1.5 / view.scale} onPointerDown={(event) => beginPoiTransform(event, poi, 'resize')} onPointerMove={movePoiTransform} onPointerUp={finishPoiTransform} onPointerCancel={finishPoiTransform} />)}
                          <line x1={size / 2} y1={0} x2={size / 2} y2={-rotationLineLength} stroke="#67e8f9" strokeWidth={1.5 / view.scale} />
                          <circle role="slider" aria-label="Ruota PDI" tabIndex={0} className="pointer-events-auto cursor-grab active:cursor-grabbing" cx={size / 2} cy={-rotationLineLength} r={rotationHandleSize / 2} fill="#06b6d4" stroke="white" strokeWidth={2 / view.scale} onPointerDown={(event) => beginPoiTransform(event, poi, 'rotate')} onPointerMove={movePoiTransform} onPointerUp={finishPoiTransform} onPointerCancel={finishPoiTransform} />
                        </svg>
                      )}
                    </span>
                    {poi.labelVisible && poi.label && (
                      <span className="absolute left-full top-1/2 ml-1 -translate-y-1/2 whitespace-nowrap font-semibold drop-shadow-[0_2px_3px_rgba(0,0,0,.9)]" style={{ color: poi.color, fontSize: Math.max(10, size * 0.28) }}>
                        {poi.label}
                      </span>
                    )}
                  </button>
                </TooltipTrigger>
                {!poi.labelVisible && poi.label && <TooltipContent side="top">{poi.label}</TooltipContent>}
              </Tooltip>
            );
          })}
        </div>
        <div data-session-map-tokens className="pointer-events-none absolute inset-0">
          {visibleTokens.map((token) => {
            const transform = tokenDraftTransforms[token.id];
            const position = transform ?? tokenDraftPositions[token.id] ?? remoteTokenPositions[token.id] ?? token;
            const size = transform?.size ?? getTokenSize(token, gridSettings.cellSize);
            const rotation = transform?.rotation ?? token.rotation ?? 0;
            const renderedSize = size * view.scale;
            const handleScreenSize = Math.min(16, Math.max(12, renderedSize * 0.12));
            const rotationHandleScreenSize = Math.min(20, Math.max(14, renderedSize * 0.16));
            const handleSize = handleScreenSize / view.scale;
            const rotationHandleSize = rotationHandleScreenSize / view.scale;
            const rotationLineLength = Math.min(36, Math.max(16, renderedSize * 0.3)) / view.scale;
            const selectionBorderWidth = 3 / view.scale;
            const conditions = token.conditions ?? [];
            const dead = conditions.some((condition) => condition.standardKey === 'dead');
            const visibleConditions = conditions.filter((condition) => condition.standardKey !== 'dead').sort((a, b) => a.name.localeCompare(b.name, 'it'));
            const conditionCount = visibleConditions.length;
            const tokenBorderRadius = (size * MARGIN_SCALE) / 2;
            const conditionTokenGap = size * CONDITION_BADGE_TOKEN_GAP_RATIO;
            const conditionMaxStep = conditionCount > 1 ? CONDITION_MAX_ARC / (conditionCount - 1) : 0;
            const conditionStepSin = Math.sin(conditionMaxStep / 2);
            const conditionMaxSize = conditionCount > 1 ? (2 * (tokenBorderRadius + conditionTokenGap) * conditionStepSin) / (1 + CONDITION_BADGE_GAP_RATIO - conditionStepSin) : Number.POSITIVE_INFINITY;
            const conditionSize = Math.min(size * CONDITION_BADGE_SIZE_RATIO, conditionMaxSize);
            const conditionRadius = tokenBorderRadius + conditionTokenGap + conditionSize / 2;
            const conditionNaturalStep = 2 * Math.asin(Math.min(1, (conditionSize * (1 + CONDITION_BADGE_GAP_RATIO)) / (2 * conditionRadius)));
            const conditionStep = conditionCount > 1 ? Math.min(conditionNaturalStep, conditionMaxStep) : 0;
            const conditionStartAngle = -Math.PI / 2 - (conditionStep * (conditionCount - 1)) / 2;
            return (
              <Fragment key={token.id}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Token di ${token.name}`}
                      className={`pointer-events-none absolute touch-none border-0 bg-transparent p-0 transition-[filter] duration-150 hover:drop-shadow-[0_0_7px_rgba(34,211,238,0.95)] ${tokenMenu?.tokenId === token.id || depthHoveredKeys.has(`token\u0000${token.id}`) ? 'drop-shadow-[0_0_7px_rgba(34,211,238,0.95)]' : ''}`}
                      style={{
                        transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
                        opacity: isOwner && token.visible === false ? 0.45 : 1,
                        zIndex: token.entityKind === 'pg' && mapFog.some(fog => fog.operation === 'cover' && fog.enabled !== false) ? 9001 : objectZIndex.get(`token\u0000${token.id}`),
                      }}
                    >
                      <div style={{ transform: `rotate(${rotation}deg)` }}>
                        <TokenGhostShape entity={token} fallbackIcon={tokenFallback} size={size} />
                      </div>
                      <span
                        data-map-interactive
                        data-selected-map-element={selectedTokenIds.has(token.id) ? 'true' : undefined}
                        data-map-movable={canMoveToken(token) ? 'true' : 'false'}
                        className={`${activeTool === 'fog' ? 'pointer-events-none' : 'pointer-events-auto'} absolute inset-0 z-[7] rounded-full ${calibrationActive || (activeTool === 'select' && selectionArmed) ? 'cursor-crosshair' : !canMoveToken(token) ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'}`}
                        onPointerEnter={() => {
                          hoveredMapElementRef.current = { type: 'token', id: token.id };
                        }}
                        onPointerLeave={() => {
                          if (hoveredMapElementRef.current?.type === 'token' && hoveredMapElementRef.current.id === token.id) hoveredMapElementRef.current = null;
                        }}
                        onPointerDown={(event) => beginTokenMove(event, token)}
                        onPointerMove={moveToken}
                        onPointerUp={finishTokenMove}
                        onPointerCancel={finishTokenMove}
                        onContextMenu={(event) => openTokenMenu(event, token.id)}
                      />
                      {dead && (
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-0 z-[6] grid place-items-center"
                          style={{
                            filter: 'drop-shadow(0 0 3px rgba(239,68,68,1)) drop-shadow(0 0 6px rgba(239,68,68,0.9))',
                          }}
                        >
                          <img
                            src="/death-skull.svg"
                            alt=""
                            draggable={false}
                            className="object-contain"
                            style={{
                              width: size * 0.86,
                              height: size * 0.7,
                              opacity: 0.6,
                              filter: 'drop-shadow(0 0 1px #09090b) drop-shadow(0 0 1px #09090b)',
                            }}
                          />
                        </span>
                      )}
                      {selectedTokenIds.has(token.id) && <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-[8] rounded-full border-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.9)]" style={{ borderWidth: 2 / view.scale }} />}
                      {visibleConditions.length > 0 && (
                        <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[5]">
                          {visibleConditions.map((condition, index) => {
                            const ConditionIcon = getTokenConditionIcon(condition);
                            const angle = conditionStartAngle + index * conditionStep;
                            const iconStyle = {
                              width: conditionSize * 0.58,
                              height: conditionSize * 0.58,
                            };
                            const iconAdjustment = CONDITION_ICON_ADJUSTMENTS[condition.standardKey ?? ''];
                            return (
                              <span
                                key={condition.id}
                                className="absolute rounded-full bg-slate-800/95 text-white shadow-md"
                                style={{
                                  width: conditionSize,
                                  height: conditionSize,
                                  left: size / 2 + Math.cos(angle) * conditionRadius - conditionSize / 2,
                                  top: size / 2 + Math.sin(angle) * conditionRadius - conditionSize / 2,
                                }}
                              >
                                <span
                                  className="absolute inset-0 flex items-center justify-center"
                                  style={
                                    iconAdjustment
                                      ? {
                                          transform: `translate(${conditionSize * iconAdjustment.x}px, ${conditionSize * iconAdjustment.y}px)`,
                                        }
                                      : undefined
                                  }
                                >
                                  {condition.standardKey === 'prone' ? <img src="/condition-prone.svg" alt="" className="h-[70%] w-[70%] object-contain invert" /> : condition.standardKey === 'incapacitated' ? <img src="/condition-incapacitated.svg" alt="" className="h-[64%] w-[64%] object-contain invert" /> : condition.standardKey === 'stunned' ? <img src="/condition-stunned.png" alt="" className="h-[70%] w-[70%] object-contain invert" /> : condition.standardKey === 'unconscious' ? <img src="/condition-unconscious.png" alt="" className="h-[68%] w-[68%] object-contain invert" /> : condition.standardKey === 'restrained' ? <img src="/condition-restrained.png" alt="" className="h-[58%] w-[58%] object-contain invert" /> : condition.standardKey === 'paralyzed' ? <img src="/condition-paralyzed-v3.png" alt="" className="h-[70%] w-[70%] object-contain invert" /> : <ConditionIcon data-static-icon={condition.standardKey === 'blinded' ? true : undefined} style={iconStyle} />}
                                </span>
                              </span>
                            );
                          })}
                        </div>
                      )}
                      {token.showLabel && (
                        <span
                          className="pointer-events-none absolute left-1/2 top-full -translate-x-1/2 whitespace-nowrap border border-[var(--dash-border)] font-semibold leading-none text-[var(--dash-text-strong)] shadow-lg backdrop-blur-sm"
                          style={{
                            backgroundColor: token.labelColor ?? 'var(--dash-surface)',
                            marginTop: size * 0.04,
                            maxWidth: size * 5,
                            borderRadius: size * 0.1,
                            borderWidth: 1 / view.scale,
                            padding: `${size * 0.06}px ${size * 0.12}px`,
                            fontSize: size * 0.14,
                          }}
                        >
                          {token.name}
                        </span>
                      )}
                    </button>
                  </TooltipTrigger>
                  {(conditions.length > 0 || !token.showLabel) && (
                    <TooltipContent side="top">
                      <div className="space-y-1.5">
                        {!token.showLabel && <div className="font-semibold">{token.name}</div>}
                        {[...conditions]
                          .sort((a, b) => a.name.localeCompare(b.name, 'it'))
                          .map((condition) => {
                            const ConditionIcon = getTokenConditionIcon(condition);
                            return (
                              <div key={condition.id} className="flex items-center gap-1.5">
                                {condition.standardKey === 'prone' ? <img src="/condition-prone-v2.svg" alt="" className="h-4 w-4 object-contain invert" /> : condition.standardKey === 'incapacitated' ? <img src="/condition-incapacitated-v2.svg" alt="" className="h-4 w-4 object-contain invert" /> : condition.standardKey === 'stunned' ? <img src="/condition-stunned-v2.png" alt="" className="h-4 w-4 object-contain invert" /> : condition.standardKey === 'unconscious' ? <img src="/condition-unconscious.png" alt="" className="h-4 w-4 object-contain invert" /> : condition.standardKey === 'restrained' ? <img src="/condition-restrained-v2.png" alt="" className="h-4 w-4 object-contain invert" /> : condition.standardKey === 'paralyzed' ? <img src="/condition-paralyzed-v3.png" alt="" className="h-5 w-5 object-contain invert" /> : <ConditionIcon className={`h-3.5 w-3.5 ${condition.standardKey === 'dead' ? 'text-red-400' : ''}`} />}
                                <span>{condition.name}</span>
                              </div>
                            );
                          })}
                      </div>
                    </TooltipContent>
                  )}
                </Tooltip>
                {transformTokenId === token.id && canControlToken(token) && (
                  <svg
                    data-map-interactive
                    className="pointer-events-none absolute z-20 overflow-visible"
                    width={size}
                    height={size + rotationLineLength + rotationHandleSize / 2}
                    viewBox={`0 0 ${size} ${size + rotationLineLength + rotationHandleSize / 2}`}
                    style={{
                      transform: `translate3d(${position.x}px, ${position.y}px, 0) rotate(${rotation}deg)`,
                      transformOrigin: `${size / 2}px ${size / 2}px`,
                    }}
                  >
                    <path d={`M 0 0 H ${size} V ${size} H 0 Z M ${size / 2} ${size} V ${size + rotationLineLength}`} fill="none" stroke="#0f172a" strokeWidth={5 / view.scale} />
                    <path d={`M 0 0 H ${size} V ${size} H 0 Z M ${size / 2} ${size} V ${size + rotationLineLength}`} fill="none" stroke="#67e8f9" strokeWidth={selectionBorderWidth} />
                    {(
                      [
                        [0, 0],
                        [size, 0],
                        [0, size],
                        [size, size],
                      ] as const
                    ).map(([x, y], index) => (
                      <rect key={index} role="slider" aria-label="Ridimensiona token" tabIndex={0} className="pointer-events-auto cursor-nwse-resize" x={x - handleSize / 2} y={y - handleSize / 2} width={handleSize} height={handleSize} fill="white" stroke="#06b6d4" strokeWidth={selectionBorderWidth} transform={`rotate(${-rotation} ${x} ${y})`} onPointerDown={(event) => beginTokenTransform(event, token, 'resize')} onPointerMove={moveTokenTransform} onPointerUp={finishTokenTransform} onPointerCancel={finishTokenTransform} />
                    ))}
                    <circle role="slider" aria-label="Ruota token" tabIndex={0} className="pointer-events-auto cursor-grab active:cursor-grabbing" cx={size / 2} cy={size + rotationLineLength} r={rotationHandleSize / 2} fill="#06b6d4" stroke="white" strokeWidth={2 / view.scale} transform={`rotate(${-rotation} ${size / 2} ${size + rotationLineLength})`} onPointerDown={(event) => beginTokenTransform(event, token, 'rotate')} onPointerMove={moveTokenTransform} onPointerUp={finishTokenTransform} onPointerCancel={finishTokenTransform} />
                  </svg>
                )}
              </Fragment>
            );
          })}
        </div>
        <svg key={`${mapId}:${mapFog.map(fog => fog.id).join(':')}`} data-session-map-fog className="pointer-events-none absolute inset-0 z-[9000] h-full w-full overflow-visible">
          <defs>
            {publicLightSources.map((source, index) => source.effect && <radialGradient key={`light-gradient-${source.id}`} id={`session-light-gradient-${mapId.replace(/[^a-zA-Z0-9_-]/g, '')}-${index}`} gradientUnits="userSpaceOnUse" cx={source.origin.x} cy={source.origin.y} r={distanceToWorld(source.radius)}>
              <stop offset="0" stopColor="black" />
              {source.effect?.includes('flicker') && !panning ? flickerGradientStops(source.flickerPreset, source.effect === 'flicker-radiant') : <><stop offset="0.3" stopColor="black" /><stop offset="1" stopColor="white" /></>}
            </radialGradient>)}
            <mask id={`session-fog-outline-${mapId.replace(/[^a-zA-Z0-9_-]/g, '')}`} maskUnits="userSpaceOnUse" x={fogMaskBounds.x} y={fogMaskBounds.y} width={fogMaskBounds.width} height={fogMaskBounds.height}>
              <rect x={fogMaskBounds.x} y={fogMaskBounds.y} width={fogMaskBounds.width} height={fogMaskBounds.height} fill="white" />
              {privateVisionPolygons.map((points, polygonIndex) => <polygon key={`outline-vision-${polygonIndex}`} points={points.map(point => `${point.x},${point.y}`).join(' ')} fill="black" />)}
              {publicLightPolygons.map((points, polygonIndex) => <polygon key={`outline-light-${polygonIndex}`} points={points.map(point => `${point.x},${point.y}`).join(' ')} fill="black" />)}
            </mask>
            {mapFog.map((fog, index) => {
              if (fog.operation !== 'cover' || fog.enabled === false) return null;
              const position = fogMoveDrafts[fog.id] ?? fog;
              const rendered = fogPathDrafts[fog.id] ?? fogTransformDrafts[fog.id] ?? { ...fog, ...position };
              return <clipPath key={`vision-clip-${fog.id}`} id={`session-fog-shape-${mapId.replace(/[^a-zA-Z0-9_-]/g, '')}-${index}`}><path d={fogWorldPath(rendered)} /></clipPath>;
            })}
            {mapFog.map((fog, index) => {
              if (fog.operation !== 'cover' || fog.enabled === false) return null;
              const position = fogMoveDrafts[fog.id] ?? fog;
              const rendered = fogPathDrafts[fog.id] ?? fogTransformDrafts[fog.id] ?? { ...fog, ...position };
              const moveOffset = fogMoveDrafts[fog.id] ? { x: rendered.x - fog.x, y: rendered.y - fog.y } : null;
              const exploredAreas = moveOffset ? translateExploredAreas(fogExplorationCacheRef.current[fog.id] ?? fog.exploredAreas, moveOffset.x, moveOffset.y) : fogExplorationCacheRef.current[fog.id] ?? fog.exploredAreas;
              const lightExploredAreas = moveOffset ? translateExploredAreas(fogLightExplorationCacheRef.current[fog.id] ?? fog.lightExploredAreas, moveOffset.x, moveOffset.y) : fogLightExplorationCacheRef.current[fog.id] ?? fog.lightExploredAreas;
              const volatileTrailAreas = moveOffset ? translateExploredAreas(fogVolatileTrailCacheRef.current[fog.id] ?? fog.exploredAreas, moveOffset.x, moveOffset.y) : fogVolatileTrailCacheRef.current[fog.id] ?? fog.exploredAreas;
              const persistence = fog.persistence ?? 'permanent';
              const previewOpacity = fogMenu?.id === fog.id && fogMenu.panel === 'opacity' && fogOpacityDraft !== null ? fogOpacityDraft / 100 : fog.opacity ?? 1;
              const baseOpacity = Math.max(0, Math.min(1, previewOpacity));
              const attenuatedOpacity = Math.min(0.5, baseOpacity);
              const attenuatedMaskLevel = baseOpacity > 0 ? attenuatedOpacity / baseOpacity : 0;
              const attenuatedMaskColor = `rgb(${Math.round(attenuatedMaskLevel * 255)} ${Math.round(attenuatedMaskLevel * 255)} ${Math.round(attenuatedMaskLevel * 255)})`;
              const showAsPlayer = !isOwner || fogSettings.previewAsPlayer;
              return <mask key={fog.id} id={`session-fog-${mapId.replace(/[^a-zA-Z0-9_-]/g, '')}-${index}`} maskUnits="userSpaceOnUse" x={fogMaskBounds.x} y={fogMaskBounds.y} width={fogMaskBounds.width} height={fogMaskBounds.height}>
                <rect x={fogMaskBounds.x} y={fogMaskBounds.y} width={fogMaskBounds.width} height={fogMaskBounds.height} fill="black" />
                <g transform={`translate(${rendered.x} ${rendered.y}) rotate(${rendered.rotation} ${rendered.width / 2} ${rendered.height / 2})`}>{fogShape(rendered, { fill: 'white' })}</g>
                {showAsPlayer && persistence === 'semi-persistent' && exploredAreas?.length ? <path d={exploredAreasPath(exploredAreas)} fill={attenuatedMaskColor} fillRule="evenodd" clipRule="evenodd" /> : null}
                {showAsPlayer && <g clipPath={`url(#session-fog-shape-${mapId.replace(/[^a-zA-Z0-9_-]/g, '')}-${index})`}>{privateVisionPolygons.map((points, polygonIndex) => <polygon key={`vision-${polygonIndex}`} points={points.map(point => `${point.x},${point.y}`).join(' ')} fill={attenuatedMaskColor} />)}</g>}
                {persistence === 'volatile' && volatileTrailAreas?.length ? <path d={exploredAreasPath(volatileTrailAreas)} fill="black" stroke="black" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" fillRule="evenodd" clipRule="evenodd" /> : null}
                {persistence === 'volatile' && lightExploredAreas?.length ? <path d={exploredAreasPath(lightExploredAreas)} fill="black" stroke="black" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" fillRule="evenodd" clipRule="evenodd" /> : null}
                {showAsPlayer && <g clipPath={`url(#session-fog-shape-${mapId.replace(/[^a-zA-Z0-9_-]/g, '')}-${index})`}>{publicLightEffects.map((item, lightIndex) => <polygon key={`light-${lightIndex}`} points={item.points.map(point => `${point.x},${point.y}`).join(' ')} fill="black" />)}</g>}
                {mapFog.slice(index + 1).filter(item => item.operation === 'reveal' && item.enabled !== false).map(item => {
                  const revealPosition = fogMoveDrafts[item.id] ?? item;
                  const reveal = fogPathDrafts[item.id] ?? fogTransformDrafts[item.id] ?? { ...item, ...revealPosition };
                  return <g key={item.id} transform={`translate(${reveal.x} ${reveal.y}) rotate(${reveal.rotation} ${reveal.width / 2} ${reveal.height / 2})`}>{fogShape(reveal, { fill: 'black' })}</g>;
                })}
              </mask>;
            })}
          </defs>
          {mapFog.map((fog, index) => {
            if (fog.operation !== 'cover' || fog.enabled === false) return null;
            const previewOpacity = fogMenu?.id === fog.id && fogMenu.panel === 'opacity' && fogOpacityDraft !== null ? fogOpacityDraft / 100 : fog.opacity ?? 1;
            const baseOpacity = Math.max(0, Math.min(1, previewOpacity));
            const opacity = isOwner && !fogSettings.previewAsPlayer ? Math.min(0.5, baseOpacity) : baseOpacity;
            return <rect key={fog.id} x={fogMaskBounds.x} y={fogMaskBounds.y} width={fogMaskBounds.width} height={fogMaskBounds.height} fill={fog.style.color} opacity={opacity} mask={`url(#session-fog-${mapId.replace(/[^a-zA-Z0-9_-]/g, '')}-${index})`} />;
          })}
          {isOwner && activeTool === 'walls' && wallStart && wallHover && <line x1={wallStart.x} y1={wallStart.y} x2={wallHover.x} y2={wallHover.y} stroke="#ef4444" strokeWidth={4} strokeDasharray="8 4" vectorEffect="non-scaling-stroke" />}
          {isOwner && activeTool === 'walls' && mapFog.filter(fog => fog.visionBlocker && fog.points && fog.points.length >= 2).map(fog => <line key={`blocker-${fog.id}`} className="pointer-events-auto cursor-pointer" x1={fog.x + fog.points![0].x} y1={fog.y + fog.points![0].y} x2={fog.x + fog.points![1].x} y2={fog.y + fog.points![1].y} stroke={fog.visionBlocker!.kind === 'wall' ? '#ef4444' : fog.visionBlocker!.kind === 'door' ? '#f59e0b' : '#38bdf8'} strokeWidth={4} strokeDasharray="8 4" vectorEffect="non-scaling-stroke" onClick={event => { event.stopPropagation(); const kind = fog.visionBlocker!.kind === 'wall' ? 'door' : fog.visionBlocker!.kind === 'door' ? 'window' : 'wall'; onFogChange?.(fog.id, { visionBlocker: { ...fog.visionBlocker!, kind } }); }} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); if (window.confirm(`Eliminare ${fog.visionBlocker!.kind === 'wall' ? 'questo muro' : fog.visionBlocker!.kind === 'door' ? 'questa porta' : 'questa finestra'} dalla linea di vista?`)) onFogDelete?.(fog.id); }} />)}
          {isOwner && activeTool === 'fog' && mapFog.map((fog) => {
            if (fog.fullMap || fog.visionBlocker) return null;
            const position = fogMoveDrafts[fog.id] ?? fog;
            const rendered = fogPathDrafts[fog.id] ?? fogTransformDrafts[fog.id] ?? { ...fog, ...position };
            const selected = selectedFogIds.has(fog.id);
            const controlScale = Math.sqrt(view.scale);
            return <Fragment key={`edit-${fog.id}`}>
              {!fogSettings.previewAsPlayer && <path d={fogWorldPath(rendered)} fill="none" stroke={rendered.operation === 'reveal' ? '#fb923c' : rendered.style.color} strokeWidth={Math.max(2, rendered.style.strokeWidth)} vectorEffect="non-scaling-stroke" pointerEvents="none" mask={rendered.operation === 'cover' ? `url(#session-fog-${mapId.replace(/[^a-zA-Z0-9_-]/g, '')}-${mapFog.findIndex(item => item.id === fog.id)})` : `url(#session-fog-outline-${mapId.replace(/[^a-zA-Z0-9_-]/g, '')})`} opacity={rendered.enabled === false ? 0.45 : 1} />}
              <g data-map-interactive transform={`translate(${rendered.x} ${rendered.y}) rotate(${rendered.rotation} ${rendered.width / 2} ${rendered.height / 2})`} opacity={rendered.enabled === false ? 0.45 : 1} className={activeTool === 'fog' && !rendered.locked && ['grab', 'quick-select'].includes(fogSettings.mode) ? `pointer-events-auto touch-none ${draggingFog ? 'cursor-grabbing' : 'cursor-grab'}` : 'pointer-events-none'} onContextMenu={event => openFogMenu(event, rendered)} onPointerDown={(event) => {
              if (beginQuickFogSelection(event, fog)) return;
              beginFogMove(event, fog);
            }} onPointerMove={moveSelectedFog} onPointerUp={finishSelectedFog} onPointerCancel={finishSelectedFog}>
              {fogShape(rendered, { fill: 'transparent', stroke: 'transparent', strokeWidth: Math.max(8, rendered.style.strokeWidth), vectorEffect: 'non-scaling-stroke' })}
              {selected && !rendered.locked && <>
                <rect x={-2 / controlScale} y={-2 / controlScale} width={rendered.width + 4 / controlScale} height={rendered.height + 4 / controlScale} fill="none" stroke="#facc15" strokeWidth={1.5} strokeDasharray="2 2.5" vectorEffect="non-scaling-stroke" />
                {([['nw', 0, 0, 'cursor-nwse-resize'], ['n', rendered.width / 2, 0, 'cursor-ns-resize'], ['ne', rendered.width, 0, 'cursor-nesw-resize'], ['e', rendered.width, rendered.height / 2, 'cursor-ew-resize'], ['se', rendered.width, rendered.height, 'cursor-nwse-resize'], ['s', rendered.width / 2, rendered.height, 'cursor-ns-resize'], ['sw', 0, rendered.height, 'cursor-nesw-resize'], ['w', 0, rendered.height / 2, 'cursor-ew-resize']] as const).map(([handle, x, y, cursor]) => <rect key={handle} className={`pointer-events-auto ${cursor}`} x={x - 4 / controlScale} y={y - 4 / controlScale} width={8 / controlScale} height={8 / controlScale} fill="white" stroke="#facc15" strokeWidth={1.5} vectorEffect="non-scaling-stroke" onPointerDown={event => beginFogTransform(event, rendered, 'resize', handle)} onPointerMove={moveFogTransform} onPointerUp={finishFogTransform} onPointerCancel={finishFogTransform} />)}
                <path d={`M ${rendered.width / 2} 0 V ${-22 / controlScale}`} stroke="#facc15" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                <circle className="pointer-events-auto cursor-grab" cx={rendered.width / 2} cy={-22 / controlScale} r={6 / controlScale} fill="#facc15" stroke="#020617" strokeWidth={1.5} vectorEffect="non-scaling-stroke" onPointerDown={event => beginFogTransform(event, rendered, 'rotate')} onPointerMove={moveFogTransform} onPointerUp={finishFogTransform} onPointerCancel={finishFogTransform} />
              </>}
              {pathEditFogId === rendered.id && rendered.points?.map((point, pointIndex) => <circle key={pointIndex} className="pointer-events-auto cursor-move" cx={point.x} cy={point.y} r={6 / controlScale} fill="#facc15" stroke="#020617" strokeWidth={3} vectorEffect="non-scaling-stroke" onPointerDown={event => beginFogPathPointMove(event, rendered, pointIndex)} onPointerMove={moveFogPathPoint} onPointerUp={finishFogPathPointMove} onPointerCancel={finishFogPathPointMove} />)}
              </g>
            </Fragment>;
          })}
          {isOwner && activeTool === 'fog' && fogSettings.overlapMode === 'overlay' && mapFog.flatMap((under, underIndex) => {
            if (under.operation !== 'cover' || under.enabled === false || under.fullMap || under.visionBlocker) return [];
            return mapFog.slice(underIndex + 1).flatMap(over => {
              if (over.operation !== 'cover' || over.enabled === false || over.fullMap || over.visionBlocker) return [];
              const underPosition = fogMoveDrafts[under.id]; const overPosition = fogMoveDrafts[over.id];
              const renderedUnder = fogPathDrafts[under.id] ?? fogTransformDrafts[under.id] ?? (underPosition ? { ...under, ...underPosition } : under);
              const renderedOver = fogPathDrafts[over.id] ?? fogTransformDrafts[over.id] ?? (overPosition ? { ...over, ...overPosition } : over);
              const underPolygon = fogWorldPolygon(renderedUnder);
              const overPolygon = fogWorldPolygon(renderedOver);
              if (!polygonBoundsOverlap(polygonBounds(underPolygon), polygonBounds(overPolygon)) || polygonClipping.intersection(underPolygon, overPolygon).length === 0) return [];
              const clipId = `fog-overlap-clip-${under.id}-${over.id}`.replace(/[^a-zA-Z0-9_-]/g, '');
              return [<Fragment key={`fog-overlap-${under.id}-${over.id}`}><defs><clipPath id={clipId}><path d={fogWorldPath(renderedOver)} fill="black" fillRule="evenodd" clipRule="evenodd" /></clipPath></defs><path d={fogWorldPath(renderedUnder)} clipPath={`url(#${clipId})`} fill="none" stroke="#94a3b8" strokeOpacity={0.58} strokeWidth={1.5} strokeDasharray="2 2.5" vectorEffect="non-scaling-stroke" pointerEvents="none" /></Fragment>];
            });
          })}
          {isOwner && fogDraft && <g transform={`translate(${fogDraft.x} ${fogDraft.y})`}>{fogShape(fogDraft, { fill: fogSettings.overlapMode === 'trim' ? '#ef4444' : fogSettings.overlapMode === 'join' ? '#3b82f6' : fogDraft.style.color, fillOpacity: 0.38, stroke: fogSettings.overlapMode === 'trim' ? '#ef4444' : fogSettings.overlapMode === 'join' ? '#3b82f6' : fogDraft.style.color, strokeWidth: fogDraft.style.strokeWidth, vectorEffect: 'non-scaling-stroke' })}</g>}
          {isOwner && fogPolygonPoints.length > 0 && <polygon points={[...fogPolygonPoints, ...(fogPolygonHover ? [fogPolygonHover] : [])].map(point => `${point.x},${point.y}`).join(' ')} fill={fogSettings.overlapMode === 'trim' ? '#ef4444' : fogSettings.overlapMode === 'join' ? '#3b82f6' : fogSettings.color} fillOpacity={fogPolygonPoints.length >= 3 ? 0.38 : 0} stroke={fogSettings.overlapMode === 'trim' ? '#ef4444' : fogSettings.overlapMode === 'join' ? '#3b82f6' : fogSettings.color} strokeWidth={fogSettings.strokeWidth} vectorEffect="non-scaling-stroke" />}
        </svg>
      </div>
      <svg data-session-map-range-overlay className="pointer-events-none absolute inset-0 z-10 h-full w-full overflow-hidden">
        {publicLightSources.filter(source => source.outlineVisible).map(source => source.shape === 'cone' ? <polygon key={`light-range-${source.id}`} points={flashlightBeamPoints(source).map(point => `${view.x + point.x * view.scale},${view.y + point.y * view.scale}`).join(' ')} fill="none" stroke="#fbbf24" strokeWidth={1.2} strokeDasharray={`${8 * view.scale} ${5 * view.scale}`} pointerEvents="none" /> : <circle key={`light-range-${source.id}`} cx={view.x + source.origin.x * view.scale} cy={view.y + source.origin.y * view.scale} r={distanceToWorld(source.radius) * view.scale} fill="none" stroke="#fbbf24" strokeWidth={1.2} strokeDasharray={`${8 * view.scale} ${5 * view.scale}`} pointerEvents="none" />)}
        {privateVisionSources.filter(source => source.outlineVisible).map(source => source.shape === 'cone' ? <polygon key={`vision-range-${source.id}`} points={flashlightBeamPoints(source).map(point => `${view.x + point.x * view.scale},${view.y + point.y * view.scale}`).join(' ')} fill="none" stroke="#38bdf8" strokeWidth={1.2} strokeDasharray={`${4 * view.scale} ${4 * view.scale}`} pointerEvents="none" /> : <circle key={`vision-range-${source.id}`} cx={view.x + source.origin.x * view.scale} cy={view.y + source.origin.y * view.scale} r={distanceToWorld(source.radius) * view.scale} fill="none" stroke="#38bdf8" strokeWidth={1.2} strokeDasharray={`${4 * view.scale} ${4 * view.scale}`} pointerEvents="none" />)}
        {[...publicLightSources, ...privateVisionSources].filter(source => source.shape === 'cone' && source.interactive).map(source => {
          const radius = distanceToWorld(source.radius);
          const cx = view.x + (source.origin.x + Math.cos(source.direction) * radius) * view.scale;
          const cy = view.y + (source.origin.y + Math.sin(source.direction) * radius) * view.scale;
          const color = source.sourceType === 'light' ? '#fbbf24' : '#38bdf8';
          const discreet = !source.outlineVisible;
          return <g key={`cone-direction-${source.key}`} data-cone-direction-handle data-discreet={discreet || undefined} opacity={discreet ? 0.45 : 1}>
            <circle className="pointer-events-auto cursor-grab touch-none active:cursor-grabbing" cx={cx} cy={cy} r={12} fill="transparent" onPointerDown={event => beginConeDirection(event, source)} onPointerMove={event => moveConeDirection(event, source.origin)} onPointerUp={finishConeDirection} onPointerCancel={finishConeDirection} />
            <circle cx={cx} cy={cy} r={discreet ? 4 : 6} fill={color} stroke="#0f172a" strokeWidth={discreet ? 1.25 : 2} pointerEvents="none" />
          </g>;
        })}
      </svg>
      {isOwner && fogPersistenceHint && <div className="pointer-events-none absolute z-[10040] max-w-64 rounded-md border border-amber-300/40 bg-slate-950/95 px-2.5 py-1.5 text-xs font-semibold text-amber-100 shadow-xl" style={{ left: fogPersistenceHint.x, top: fogPersistenceHint.y }}>{fogPersistenceHint.label}</div>}
      {depthHoveredKeys.size > 1 && (
        <div className="pointer-events-none absolute right-4 top-4 z-[10000] flex justify-end">
          <ContextHint>
            <strong>Oggetti sovrapposti:</strong> Ogni click destro del mouse seleziona un nuovo oggetto. E' possibile spostare quello evidenziato in giallo.
          </ContextHint>
        </div>
      )}
      {(roomFillBusy || roomFillNotice) && <div className={`pointer-events-none absolute left-1/2 z-[10030] max-w-md -translate-x-1/2 rounded-lg border px-3 py-2 text-center text-xs font-medium shadow-xl ${roomFillNotice ? 'border-amber-400/40 bg-amber-950/95 text-amber-100' : 'border-[var(--dash-border)] bg-[var(--dash-panel)]/95 text-[var(--dash-text-strong)]'}`} style={{ top: '66.666%' }}>{roomFillNotice ?? 'Rilevamento ambiente...'}</div>}
      {fogSelectionMenu && selectedFogIds.size > 0 && (
        <div role="menu" aria-label="Azioni nebbia selezionata" className="absolute z-[10020] w-60 rounded-xl border border-[var(--dash-border)] bg-[var(--dash-panel)] p-3 text-[var(--dash-text)] shadow-2xl" style={{ left: fogSelectionMenu.x, top: fogSelectionMenu.y }}>
          <div className="flex items-center justify-between gap-3 border-b border-[var(--dash-border-soft)] pb-2">
            <span className="text-sm font-semibold">Nebbia selezionata</span>
            <span className="rounded-full bg-cyan-400/15 px-2 py-0.5 text-xs font-semibold text-cyan-200">{selectedFogIds.size}</span>
          </div>
          <button type="button" role="menuitem" onClick={() => { onFogsDelete?.([...selectedFogIds]); setSelectedFogIds(new Set()); setFogSelectionMenu(null); }} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm text-red-300 hover:bg-red-500/15"><Trash2 data-static-icon className="h-4 w-4" />Elimina selezionati</button>
        </div>
      )}
      {fogMenu && (() => {
        const fog = mapFog.find(item => item.id === fogMenu.id);
        if (!fog) return null;
        const actionClass = 'grid h-10 w-10 place-items-center rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] text-[var(--dash-muted)] hover:border-[var(--dash-accent)] hover:text-[var(--dash-text-strong)] disabled:cursor-not-allowed disabled:opacity-30';
        let fogIconIndex = 0;
        const iconAction = (label: string, icon: ReactNode, action: () => void, disabled = false, destructive = false, keepsMenu = false) => {
          const tooltipId = `fog-menu-${fogIconIndex++}`;
          return <Tooltip open={fogTooltip === tooltipId}>
            <TooltipTrigger asChild><span className="inline-flex" onPointerEnter={() => { fogTooltipHoveredRef.current = tooltipId; setFogTooltip(tooltipId); }} onPointerLeave={() => { if (fogTooltipHoveredRef.current === tooltipId) fogTooltipHoveredRef.current = null; setFogTooltip(current => current === tooltipId ? null : current); }} onFocus={() => setFogTooltip(tooltipId)} onBlur={() => { if (fogTooltipHoveredRef.current !== tooltipId) setFogTooltip(current => current === tooltipId ? null : current); }}><button type="button" role="menuitem" aria-label={label} disabled={disabled} onClick={() => { action(); if (!keepsMenu) setFogMenu(null); }} className={`${actionClass} ${destructive ? 'text-red-300 hover:bg-red-500/15 hover:text-red-200' : ''}`}>{icon}</button></span></TooltipTrigger>
            <TooltipContent side="top">{label}</TooltipContent>
          </Tooltip>;
        };
        return <div ref={fogMenuRef} data-map-interactive role="menu" aria-label="Azioni figura nebbia" className="absolute z-50 w-[min(92vw,342px)] overflow-y-auto rounded-xl border border-[var(--dash-border)] bg-[var(--dash-panel)]/95 p-3 text-xs text-[var(--dash-text)] shadow-2xl backdrop-blur" style={{ left: fogMenu.x, top: fogMenu.y, maxHeight: Math.max(80, (viewportRef.current?.clientHeight ?? 0) - fogMenu.y - 8) }} onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}>
          <div className="mb-3 flex items-center justify-between gap-2 border-b border-[var(--dash-border-soft)] pb-2 font-semibold text-[var(--dash-text-strong)]"><span>Figura Nebbia</span><div className="flex items-center gap-2">{fog.locked && <Lock data-static-icon className="h-4 w-4 text-amber-300" />}<button type="button" aria-label="Sposta menu Nebbia" onPointerDown={event => beginMenuDrag(event, 'fog', fogMenu)} onPointerMove={moveMenuDrag} onPointerUp={finishMenuDrag} onPointerCancel={finishMenuDrag} className="cursor-move touch-none rounded p-1 text-[var(--dash-muted)] hover:bg-white/10 hover:text-[var(--dash-text-strong)]"><GripHorizontal data-static-icon className="h-4 w-4" /></button></div></div>
          <div className="mb-3 grid grid-cols-[repeat(7,40px)] gap-1.5">
            {iconAction(fog.enabled === false ? 'Attiva nebbia' : 'Disattiva nebbia', fog.enabled === false ? <span className="relative grid h-5 w-5 place-items-center"><CloudFog data-static-icon className="h-5 w-5" /><Slash data-static-icon className="absolute h-6 w-6 text-red-300" /></span> : <CloudFog data-static-icon className="h-5 w-5" />, () => onFogChange?.(fog.id, { enabled: fog.enabled === false }), false, false, true)}
            {iconAction('Persistenza nebbia', <span className="relative block h-5 w-5"><CloudFog data-static-icon className="h-5 w-5" /><Cog data-static-icon className="absolute -right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-[var(--dash-panel)]" /></span>, () => setFogMenu(current => {
              if (!current) return null;
              const panel = current.panel === 'persistence' ? null : 'persistence';
              if (panel !== 'persistence') return { ...current, panel };
              const viewportHeight = viewportRef.current?.clientHeight ?? 0;
              return { ...current, panel, y: Math.max(8, Math.min(current.y, viewportHeight - 410)) };
            }), false, false, true)}
            {iconAction('Opacità nebbia', <SlidersHorizontal data-static-icon className="h-5 w-5" />, () => {
              setFogOpacityDraft(Math.round(Math.max(0, Math.min(1, fog.opacity ?? 1)) * 100));
              setFogMenu(current => current ? { ...current, panel: current.panel === 'opacity' ? null : 'opacity', y: Math.max(8, Math.min(current.y, (viewportRef.current?.clientHeight ?? 0) - 300)) } : null);
            }, false, false, true)}
            {iconAction('Muovi nebbia', <Hand data-static-icon className="h-5 w-5" />, () => { updateSessionMapFogSettings({ mode: 'grab' }); setActiveSessionMapTool('fog'); setSelectedFogIds(new Set([fog.id])); setFogMenu(null); }, fog.locked)}
            {iconAction(fog.locked ? 'Sblocca nebbia' : 'Blocca nebbia', fog.locked ? <Unlock data-static-icon className="h-5 w-5" /> : <Lock data-static-icon className="h-5 w-5" />, () => onFogChange?.(fog.id, { locked: !fog.locked }), false, false, true)}
            {iconAction('Duplica nebbia', <Copy data-static-icon className="h-5 w-5" />, () => duplicateFog(fog))}
            {iconAction('Copia nebbia', <ClipboardCopy data-static-icon className="h-5 w-5" />, () => { setDrawingClipboard(null); setPoiClipboard(null); setFogClipboard(structuredClone(fog)); })}
            {iconAction('Modifica tracciato', <Spline data-static-icon className="h-5 w-5" />, () => setPathEditFogId(current => current === fog.id ? null : fog.id), !fog.points?.length || fog.locked)}
            {iconAction(fog.magnetGroupId ? 'Rimuovi collegamenti magnetici' : 'Collegamenti magnetici', <Magnet data-static-icon className="h-5 w-5" />, () => {
              if (fog.magnetGroupId) { const ids = mapFog.filter(item => item.magnetGroupId === fog.magnetGroupId).map(item => item.id); onFogsChange?.(ids, { magnetEnabled: false, magnetGroupId: null }); setFogMenu(null); }
              else setFogMenu(current => current ? { ...current, panel: current.panel === 'magnets' ? null : 'magnets' } : null);
            }, fog.locked, false, true)}
            {iconAction('Elimina nebbia', <Trash2 data-static-icon className="h-5 w-5" />, () => { onFogDelete?.(fog.id); setSelectedFogIds(new Set()); }, false, true)}
          </div>
          {fogMenu.panel === 'opacity' && (() => {
            const savedPercent = Math.round(Math.max(0, Math.min(1, fog.opacity ?? 1)) * 100);
            const percent = fogOpacityDraft ?? savedPercent;
            const commitOpacity = () => {
              if (percent !== savedPercent) onFogChange?.(fog.id, { opacity: percent / 100 });
            };
            return <div className="mt-3 space-y-3 border-t border-[var(--dash-border-soft)] pt-3">
              <div className="flex items-center justify-between gap-3"><span className="font-semibold text-[var(--dash-text-strong)]">Opacità nebbia</span><span className="min-w-12 rounded-md bg-[var(--dash-surface-2)] px-2 py-1 text-center font-semibold text-cyan-200">{percent}%</span></div>
              <input type="range" min={0} max={100} step={1} value={percent} aria-label="Opacità nebbia" onChange={event => setFogOpacityDraft(Number(event.target.value))} onPointerUp={commitOpacity} onKeyUp={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) commitOpacity(); }} onBlur={commitOpacity} className="w-full accent-cyan-400" />
              <p className="text-[10px] leading-relaxed text-[var(--dash-muted)]">Sopra il 50%, vista, stati attenuati e visualizzazione GM restano al 50%. Sotto il 50% si allineano a questa opacità.</p>
            </div>;
          })()}
          {fogMenu.panel === 'persistence' && <div className="mt-3 space-y-1.5 border-t border-[var(--dash-border-soft)] pt-2">
            <div className="mb-1 text-xs font-semibold text-[var(--dash-muted)]">Comportamento dopo l'esplorazione</div>
            {([
              ['volatile', 'Volatile', 'Vista: 50%. Luce: 100%. Entrambe cancellano definitivamente la nebbia.'],
              ['semi-persistent', 'Semi-persistente', 'Vista: 50%. Luce: 100%. Le zone esplorate restano al 50%.'],
              ['permanent', 'Persistente', 'Vista: 50%. Luce: 100%. La nebbia non viene cancellata.'],
            ] as const).map(([value, label, description]) => <button key={value} type="button" onClick={() => { onFogChange?.(fog.id, { persistence: value }); setFogMenu(null); }} className={`w-full rounded-lg border px-3 py-2 text-left ${((fog.persistence ?? 'permanent') === value) ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-100' : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface)] hover:bg-[var(--dash-surface-2)]'}`}><span className="block font-semibold">{label}</span><span className="mt-0.5 block text-[10px] text-[var(--dash-muted)]">{description}</span></button>)}
          </div>}
          {fogMenu.panel === 'magnets' && <div className="mt-3 max-h-40 space-y-1 overflow-y-auto border-t border-[var(--dash-border-soft)] pt-2">
            <div className="mb-1 text-xs font-semibold text-[var(--dash-muted)]">Collega a una forma</div>
            {mapFog.filter(item => item.id !== fog.id && !item.locked && !item.fullMap).map((candidate, index) => <button key={candidate.id} type="button" onClick={() => {
              const groupId = candidate.magnetGroupId ?? crypto.randomUUID();
              const ids = [fog.id, ...mapFog.filter(item => item.id === candidate.id || item.magnetGroupId === candidate.magnetGroupId && candidate.magnetGroupId).map(item => item.id)];
              onFogsChange?.([...new Set(ids)], { magnetEnabled: true, magnetGroupId: groupId }); setFogMenu(null);
            }} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-white/10"><Magnet data-static-icon className="h-3.5 w-3.5 text-cyan-300" />Forma Nebbia {index + 1}</button>)}
          </div>}
        </div>;
      })()}
      {poiMenu &&
        (() => {
          const poi = mapPois.find((item) => item.id === poiMenu.poiId);
          if (!poi) return null;
          if (poi.pinned)
            return isOwner ? (
              <div data-map-interactive role="menu" className="absolute z-50 flex items-center gap-2 rounded-xl border border-[var(--dash-border)] bg-[var(--dash-panel)]/95 p-3 text-xs text-[var(--dash-text)] shadow-2xl backdrop-blur" style={{ left: poiMenu.x, top: poiMenu.y }} onPointerDown={(event) => event.stopPropagation()}>
                <span className="px-1 font-semibold text-[var(--dash-text-strong)]">PDI fissato</span>
                <Tooltip><TooltipTrigger asChild><button type="button" aria-label="Rimuovi fissaggio" onClick={() => { onPoiChange?.(poi.id, { pinned: false }); setPoiMenu(null); }} className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--dash-border-soft)] bg-cyan-400/20 text-cyan-200 hover:border-[var(--dash-accent)]"><Pin data-static-icon className="h-5 w-5" /></button></TooltipTrigger><TooltipContent side="top">Rimuovi fissaggio</TooltipContent></Tooltip>
              </div>
            ) : null;
          const actionClass = 'grid h-10 w-10 place-items-center rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] text-[var(--dash-muted)] hover:border-[var(--dash-accent)] hover:text-[var(--dash-text-strong)] disabled:cursor-not-allowed disabled:opacity-30';
          let poiIconIndex = 0;
          const iconAction = (label: string, icon: ReactNode, action: () => void, disabled = false, destructive = false, togglesPanel = false) => {
            const tooltipId = `poi-menu-${poiIconIndex++}`;
            return <Tooltip open={poiTooltip === tooltipId}>
              <TooltipTrigger asChild>
                <span className="inline-flex" onPointerEnter={() => setPoiTooltip(tooltipId)} onPointerLeave={() => setPoiTooltip(null)} onFocus={() => setPoiTooltip(tooltipId)} onBlur={(event) => { if (!event.currentTarget.matches(':hover')) setPoiTooltip(null); }}><button type="button" aria-label={label} disabled={disabled} onClick={() => { if (!togglesPanel) setPoiMenu((current) => (current ? { ...current, panel: null } : null)); action(); }} className={`${actionClass} ${destructive ? 'text-red-300 hover:bg-red-500/15 hover:text-red-200' : ''}`}>{icon}</button></span>
              </TooltipTrigger>
              <TooltipContent side="top">{label}</TooltipContent>
            </Tooltip>;
          };
          return (
            <div data-map-interactive role="menu" className="absolute z-50 w-[min(92vw,390px)] rounded-xl border border-[var(--dash-border)] bg-[var(--dash-panel)]/95 p-3 text-xs text-[var(--dash-text)] shadow-2xl backdrop-blur" style={{ left: poiMenu.x, top: poiMenu.y }} onPointerDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
              <div className="mb-3 flex items-center justify-between gap-2 border-b border-[var(--dash-border-soft)] pb-2 font-semibold text-[var(--dash-text-strong)]">
                <span>Punto di interesse</span>
                <div className="flex items-center gap-2">
                  {poi.noteId && <span className="font-normal text-[var(--dash-muted)]">Nota collegata</span>}
                  {poi.locked && <Lock data-static-icon className="h-4 w-4 text-amber-300" />}
                  <button type="button" aria-label="Sposta menu PDI" onPointerDown={(event) => beginMenuDrag(event, 'poi', poiMenu)} onPointerMove={moveMenuDrag} onPointerUp={finishMenuDrag} onPointerCancel={finishMenuDrag} className="cursor-move touch-none rounded p-1 text-[var(--dash-muted)] hover:bg-white/10 hover:text-[var(--dash-text-strong)]"><GripHorizontal data-static-icon className="h-4 w-4" /></button>
                </div>
              </div>
              <div className="mb-3 grid grid-cols-[repeat(8,40px)] gap-1.5">
                {iconAction('Modifica icona', <Shapes data-static-icon className="h-5 w-5" />, () => setPoiMenu((current) => (current ? { ...current, panel: current.panel === 'icons' ? null : 'icons' } : null)), false, false, true)}
                <Tooltip open={poiTooltip === 'poi-color'}>
                  <TooltipTrigger asChild>
                    <label aria-label="Colore PDI" onPointerEnter={() => setPoiTooltip('poi-color')} onPointerLeave={() => setPoiTooltip(null)} className={`${actionClass} relative cursor-pointer`}>
                      <Palette data-static-icon className="h-5 w-5" />
                      <input type="color" value={poi.color} onClick={() => setPoiMenu((current) => (current ? { ...current, panel: null } : null))} onChange={(event) => onPoiChange?.(poi.id, { color: event.target.value })} className="absolute inset-0 cursor-pointer opacity-0" />
                    </label>
                  </TooltipTrigger>
                  <TooltipContent side="top">Colore</TooltipContent>
                </Tooltip>
                {iconAction(poi.visibleToPlayers ? 'Nascondi ai giocatori' : 'Mostra ai giocatori', poi.visibleToPlayers ? <Eye data-static-icon className="h-5 w-5" /> : <EyeOff data-static-icon className="h-5 w-5" />, () => onPoiChange?.(poi.id, { visibleToPlayers: !poi.visibleToPlayers }), !isOwner)}
                {iconAction(poi.locked ? 'Sblocca PDI' : 'Blocca PDI', poi.locked ? <Unlock data-static-icon className="h-5 w-5" /> : <Lock data-static-icon className="h-5 w-5" />, () => onPoiChange?.(poi.id, { locked: !poi.locked }), !isOwner)}
                {iconAction('Illuminazione e vista', <Flashlight data-static-icon className="h-5 w-5" />, () => setPoiMenu((current) => (current ? { ...current, panel: current.panel === 'lighting' ? null : 'lighting' } : null)), false, false, true)}
                {iconAction('Ridimensiona PDI', <Maximize2 data-static-icon className="h-5 w-5" />, () => { setTransformPoiId(poi.id); setPoiMenu(null); })}
                {iconAction('Duplica PDI', <Copy data-static-icon className="h-5 w-5" />, () => { onPoiDuplicate?.(poi.id); setPoiMenu(null); })}
                {iconAction('Copia PDI', <ClipboardCopy data-static-icon className="h-5 w-5" />, () => { setDrawingClipboard(null); setFogClipboard(null); setPoiClipboard(structuredClone(poi)); setPoiMenu(null); }, false, false, true)}
                {iconAction('Livelli', <Layers3 data-static-icon className="h-5 w-5" />, () => setPoiMenu((current) => (current ? { ...current, panel: current.panel === 'layers' ? null : 'layers' } : null)), false, false, true)}
                {iconAction(poi.noteId ? 'Cambia nota collegata' : 'Collega nota', <Link data-static-icon className="h-5 w-5" />, () => setPoiMenu((current) => (current ? { ...current, panel: current.panel === 'notes' ? null : 'notes' } : null)), false, false, true)}
                {isOwner && iconAction('Fissa PDI', <Pin data-static-icon className="h-5 w-5 -rotate-45" />, () => onPoiChange?.(poi.id, { pinned: true }))}
                {iconAction('Elimina PDI', <Trash2 data-static-icon className="h-5 w-5" />, () => {
                  onPoiDelete?.(poi.id);
                  setPoiMenu(null);
                }, false, true)}
              </div>
              <div className="flex gap-2">
                <input aria-label="Etichetta PDI" value={poi.label} onFocus={() => setPoiMenu((current) => (current ? { ...current, panel: null } : null))} onChange={(event) => onPoiChange?.(poi.id, { label: event.target.value })} className="min-w-0 flex-1 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text-strong)] outline-none focus:border-[var(--dash-accent)]" />
                <button type="button" aria-label={poi.labelVisible ? 'Nascondi etichetta' : 'Mostra etichetta'} onClick={() => { setPoiMenu((current) => (current ? { ...current, panel: null } : null)); onPoiChange?.(poi.id, { labelVisible: !poi.labelVisible }); }} className={actionClass}>
                  {poi.labelVisible ? <Eye data-static-icon className="h-5 w-5" /> : <EyeOff data-static-icon className="h-5 w-5" />}
                </button>
              </div>
              {poi.noteId && <button type="button" onClick={() => { setPoiMenu((current) => (current ? { ...current, panel: null } : null)); onPoiChange?.(poi.id, { noteId: null, noteVisibleToPlayers: false }); }} className="mt-2 text-[11px] text-[var(--dash-muted)] hover:text-[var(--dash-danger-text)]">Rimuovi collegamento alla nota</button>}
              {poiMenu.panel === 'lighting' && (
                <div className="mt-3 space-y-3 border-t border-[var(--dash-border)] pt-3">
                  {([['Illuminazione', 'Visibile a tutti e rimuove completamente la Nebbia', 'light'], ['Vista', 'Privata al proprietario e schiarisce la Nebbia', 'vision']] as const).map(([label, description, key]) => {
                    const source = poi[key] ?? { enabled: false, radius: 0 };
                    const lightEffect = key === 'light' ? poi.light?.effect : undefined;
                    return <div key={key} className="rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-3">
                      <div className="flex items-start justify-between gap-3"><div><div className="font-semibold text-[var(--dash-text-strong)]">{label}</div><div className="mt-0.5 text-[10px] text-[var(--dash-muted)]">{description}</div></div><button type="button" role="switch" aria-checked={source.enabled} onClick={() => onPoiChange?.(poi.id, { [key]: { ...source, enabled: !source.enabled } })} className={`relative mt-0.5 h-5 w-9 rounded-full transition ${source.enabled ? 'bg-cyan-500' : 'bg-slate-600'}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${source.enabled ? 'left-[18px]' : 'left-0.5'}`} /></button></div>
                       <RadiusStepper value={source.radius} unit={gridSettings.unit} onChange={(radius) => onPoiChange?.(poi.id, { [key]: { ...source, radius } })} />
                       <LightingShapeControls shape={source.shape} coneAngle={source.coneAngle} onChange={(update) => onPoiChange?.(poi.id, { [key]: { ...source, ...update } })} />
                       <label className="mt-3 flex cursor-pointer items-center gap-2 text-[10px] font-semibold text-[var(--dash-muted)]"><input type="checkbox" checked={source.outlineVisible !== false} onChange={(event) => onPoiChange?.(poi.id, { [key]: { ...source, outlineVisible: event.target.checked } })} className="h-3.5 w-3.5 accent-cyan-500" />Mostra tratteggio</label>
                       {key === 'light' && <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2"><select aria-label="Effetto tremolante" value={lightEffect?.includes('flicker') ? poi.light?.flickerPreset ?? 'torch' : 'none'} onChange={(event) => { const preset = event.target.value as typeof LIGHT_FLICKER_PRESETS[number][0]; const radiant = lightEffect?.includes('radiant') ?? false; onPoiChange?.(poi.id, { light: { ...source, effect: preset === 'none' ? radiant ? 'radiant' : undefined : radiant ? 'flicker-radiant' : 'flicker', flickerPreset: preset === 'none' ? undefined : preset } }); }} className="min-w-0 rounded-md border border-[var(--dash-border)] bg-[var(--dash-input)] px-2 py-1.5 text-[10px] font-semibold text-[var(--dash-text-strong)] outline-none focus:border-[var(--dash-accent)]">{LIGHT_FLICKER_PRESETS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{(() => { const active = lightEffect?.includes('radiant') ?? false; return <button type="button" aria-pressed={active} onClick={() => onPoiChange?.(poi.id, { light: { ...source, effect: toggleLightEffect(lightEffect, 'radiant') } })} className={`rounded-md border px-2 py-1.5 text-[10px] font-semibold transition ${active ? 'border-cyan-400 bg-cyan-400/15 text-cyan-100' : 'border-[var(--dash-border)] bg-[var(--dash-input)] text-[var(--dash-muted)] hover:text-[var(--dash-text-strong)]'}`}>Luce radiante</button>; })()}</div>}
                    </div>;
                  })}
                </div>
              )}
              {poiMenu.panel === 'icons' && (
                <div className="mt-3 border-t border-[var(--dash-border)] pt-3">
                  <NoteIconGrid
                    selectedName={poi.iconName}
                    onChoose={(iconName) => {
                      onPoiChange?.(poi.id, { iconName });
                    }}
                  />
                </div>
              )}
              {poiMenu.panel === 'notes' && (
                <div className="mt-3 max-h-64 overflow-y-auto border-t border-[var(--dash-border)] pt-3">
                  {poiNotesLoading ? <div className="px-2 py-3 text-[var(--dash-muted)]">Caricamento note...</div> : poiNoteOptions.length === 0 ? <div className="px-2 py-3 text-[var(--dash-muted)]">Nessuna nota collegabile.</div> : (
                    <div className="space-y-1">
                      {poiNoteOptions.map((note) => <button key={note.id} type="button" onClick={() => { onPoiChange?.(poi.id, { noteId: note.id, noteVisibleToPlayers: note.visibleToPlayers, ...(poi.label === 'Punto di interesse' || !poi.label ? { label: note.label } : {}) }); setPoiMenu((current) => (current ? { ...current, panel: null } : null)); }} className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left ${poi.noteId === note.id ? 'border-[var(--dash-accent)] bg-[var(--dash-accent)]/10 text-[var(--dash-text-strong)]' : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface)] hover:bg-[var(--dash-surface-2)]'}`}><span className="truncate">{note.label}</span><span className="ml-3 shrink-0 text-[10px] text-[var(--dash-muted)]">{note.visibleToPlayers ? 'Campagna' : 'GM'}</span></button>)}
                    </div>
                  )}
                </div>
              )}
              {poiMenu.panel === 'layers' && (
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--dash-border)] pt-3">
                  {[['forward', 'Porta sopra', ArrowUp], ['backward', 'Porta sotto', ArrowDown], ['front', 'In primo piano', ChevronsUp], ['back', 'In fondo', ChevronsDown]].map(([move, label, Icon]) => <button key={String(move)} type="button" onClick={() => onPoiLayerMove?.(poi.id, move as MapLayerMove)} className="flex items-center gap-2 rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] px-3 py-2 hover:bg-[var(--dash-surface-2)]"><Icon data-static-icon className="h-4 w-4" /><span>{String(label)}</span></button>)}
                </div>
              )}
            </div>
          );
        })()}
      {pastePrompt &&
        (() => {
          const viewportWidth = viewportRef.current?.clientWidth ?? 0;
          const drawingMenuWidth = Math.max(160, Math.min(drawingStyleEditorOpen ? 390 : 460, viewportWidth - 16));
          const drawingMenuX = drawingMenu ? Math.max(8, Math.min(drawingMenu.x, Math.max(8, viewportWidth - drawingMenuWidth - 8))) : 0;
          const anchor = pastePrompt.context === 'token' && tokenMenu ? { x: tokenMenu.x, y: tokenMenu.y } : pastePrompt.context === 'drawing' && drawingMenu ? { x: drawingMenuX, y: drawingMenu.y } : { x: pastePrompt.x, y: pastePrompt.y };
          const left = Math.max(8, Math.min(anchor.x, Math.max(8, viewportWidth - 44)));
          const top = Math.max(8, anchor.y - 46);
          const pasteType = pastePrompt.pasteType;
          const isDrawing = pasteType === 'drawing';
          const isFog = pasteType === 'fog';
          const isPoi = pasteType === 'poi';
          const hasClipboard = isDrawing ? !!drawingClipboard : isFog ? !!fogClipboard : !!poiClipboard;
          if (!hasClipboard) return null;
          const label = isDrawing ? 'Incolla figura' : isFog ? 'Incolla nebbia' : 'Incolla PDI';
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  data-map-interactive
                  data-map-paste-action
                  type="button"
                  aria-label={label}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    event.preventDefault();
                    event.stopPropagation();
                    event.nativeEvent.stopImmediatePropagation();
                    if (isDrawing) pasteDrawingAt(pastePrompt.point);
                    else if (isFog) pasteFogAt(pastePrompt.point);
                    else if (isPoi) pastePoiAt(pastePrompt.point);
                  }}
                  className="absolute z-[70] grid h-9 w-9 place-items-center rounded-lg border border-[var(--dash-border)] bg-[var(--dash-panel)] text-[var(--dash-text-strong)] shadow-2xl hover:bg-[var(--dash-surface-2)]"
                  style={{ left, top }}
                >
                  <ClipboardPaste data-static-icon className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{label}</TooltipContent>
            </Tooltip>
          );
        })()}
      {drawingMenu &&
        (() => {
          const drawing = mapDrawings.find((item) => item.id === drawingMenu.id);
          if (!drawing) return null;
          const targetIds = selectedDrawingIds.has(drawing.id) ? [...selectedDrawingIds] : [drawing.id];
          const targetDrawings = mapDrawings.filter((item) => targetIds.includes(item.id));
          const drawingMenuTitle = targetIds.length === 1 ? (drawing.kind === 'text' ? 'Testo' : 'Figura') : targetDrawings.every((item) => item.kind === 'text') ? `Testi selezionati (${targetIds.length})` : targetDrawings.every((item) => item.kind !== 'text') ? `Figure selezionate (${targetIds.length})` : `Elementi selezionati (${targetIds.length})`;
          const updateTargets = (update: Partial<SessionMapDrawing>) => (targetIds.length > 1 ? onDrawingsChange?.(targetIds, update) : onDrawingChange?.(drawing.id, update));
          const updateStyle = (update: Partial<SessionMapDrawing['style']>) => updateTargets({ style: { ...drawing.style, ...update } });
          const updateText = (update: Partial<NonNullable<SessionMapDrawing['text']>>) => {
            if (!drawing.text) return;
            const text = { ...drawing.text, ...update };
            updateTargets({ text, ...measureMapText(text, drawing.style.strokeWidth) });
          };
          const tooltipEvents = (id: string) => ({
            onPointerEnter: () => setDrawingTooltip(id),
            onPointerLeave: () => setDrawingTooltip(null),
            onFocus: () => setDrawingTooltip(id),
            // TooltipTrigger rimuove il focus dopo un click: non chiudere mentre il pulsante e' ancora in hover.
            onBlur: (event: ReactFocusEvent<HTMLElement>) => {
              if (!event.currentTarget.matches(':hover')) setDrawingTooltip(null);
            },
          });
          const styles = [
            ['solid', undefined, 'Continua'],
            ['dashed', '10 7', 'Tratteggiata'],
            ['dotted', '1 7', 'Puntini'],
            ['dash-dot', '12 6 2 6', 'Tratto-punto'],
            ['long-dash', '20 8', 'Tratti lunghi'],
          ] as const;
          const viewportWidth = viewportRef.current?.clientWidth ?? 0;
          const viewportHeight = viewportRef.current?.clientHeight ?? 0;
          const menuWidth = Math.max(160, Math.min(390, viewportWidth - 16));
          const drawingIconClass = 'grid h-10 w-10 place-items-center rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] text-[var(--dash-muted)] hover:border-[var(--dash-accent)] hover:text-[var(--dash-text-strong)] disabled:cursor-not-allowed disabled:opacity-30';
          const tokenMenuWidth = Math.min(viewportWidth * 0.92, 390);
          const roomForDrawingRight = tokenMenu ? tokenMenu.x + tokenMenuWidth + 12 + menuWidth <= viewportWidth - 8 : false;
          const roomForDrawingLeft = tokenMenu ? tokenMenu.x >= menuWidth + 20 : false;
          const preferredMenuX = tokenMenu && !drawingMenuDetached ? (roomForDrawingRight ? tokenMenu.x + tokenMenuWidth + 12 : roomForDrawingLeft ? tokenMenu.x - menuWidth - 12 : tokenMenu.x) : drawingMenu.x;
          const preferredMenuY = tokenMenu && !drawingMenuDetached && !roomForDrawingRight && !roomForDrawingLeft ? tokenMenu.y + 320 : drawingMenu.y;
          const menuX = Math.max(8, Math.min(preferredMenuX, Math.max(8, viewportWidth - menuWidth - 8)));
          const estimatedMenuHeight = drawingStyleEditorOpen ? 420 : 160;
          const menuY = Math.max(8, Math.min(preferredMenuY, Math.max(8, viewportHeight - estimatedMenuHeight - 8)));
          if (drawing.pinned)
            return (
              <div data-map-interactive role="menu" className="absolute z-50 flex items-center gap-2 rounded-xl border border-[var(--dash-border)] bg-[var(--dash-panel)]/95 p-3 text-xs text-[var(--dash-text)] shadow-2xl backdrop-blur" style={{ left: Math.max(8, Math.min(drawingMenu.x, viewportWidth - 190)), top: Math.max(8, drawingMenu.y) }} onPointerDown={(event) => event.stopPropagation()}>
                <span className="px-1 font-semibold text-[var(--dash-text-strong)]">{drawing.kind === 'text' ? 'Testo fissato' : 'Figura fissata'}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="Rimuovi fissaggio"
                      onClick={() => {
                        onDrawingChange?.(drawing.id, { pinned: false });
                        setDrawingMenu(null);
                      }}
                      className={`${drawingIconClass} bg-cyan-400/20 text-cyan-200`}
                    >
                      <Pin data-static-icon className="h-5 w-5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Rimuovi fissaggio</TooltipContent>
                </Tooltip>
              </div>
            );
          return (
            <div data-map-interactive role="menu" className="absolute z-50 cursor-default overflow-y-auto rounded-xl border border-[var(--dash-border)] bg-[var(--dash-panel)]/95 p-3 text-xs text-[var(--dash-text)] shadow-2xl backdrop-blur" style={{ left: menuX, top: menuY, width: menuWidth, maxHeight: Math.max(120, viewportHeight - menuY - 8) }} onPointerDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
              <div className="mb-3 flex items-center justify-between gap-2 border-b border-[var(--dash-border-soft)] pb-2 font-semibold text-[var(--dash-text-strong)]">
                <span>{drawingMenuTitle}</span>
                <div className="flex items-center gap-2">{drawing.locked && <Lock data-static-icon className="h-4 w-4 text-amber-300" />}<button type="button" aria-label="Sposta menu figure" onPointerDown={(event) => beginMenuDrag(event, 'drawing', { x: menuX, y: menuY })} onPointerMove={moveMenuDrag} onPointerUp={finishMenuDrag} onPointerCancel={finishMenuDrag} className="cursor-move touch-none rounded p-1 text-[var(--dash-muted)] hover:bg-white/10 hover:text-[var(--dash-text-strong)]"><GripHorizontal data-static-icon className="h-4 w-4" /></button></div>
              </div>
              <div className="mb-3 flex flex-wrap gap-1.5" onPointerDownCapture={(event) => { if (!(event.target as Element).closest('[aria-label="Livelli"]')) setDrawingLayerPanelOpen(false); }}>
                <Tooltip open={drawingTooltip === 'visibility'}>
                  <TooltipTrigger asChild>
                    <button {...tooltipEvents('visibility')} type="button" aria-label={drawing.visible === false ? 'Mostra' : 'Nascondi'} onClick={() => updateTargets({ visible: drawing.visible === false })} className={drawingIconClass}>
                      {drawing.visible === false ? <EyeOff data-static-icon className="h-5 w-5" /> : <Eye data-static-icon className="h-5 w-5" />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">{drawing.visible === false ? 'Mostra' : 'Nascondi'}</TooltipContent>
                </Tooltip>
                <Tooltip open={drawingTooltip === 'lock'}>
                  <TooltipTrigger asChild>
                    <button {...tooltipEvents('lock')} type="button" aria-label={drawing.locked ? 'Sblocca' : 'Blocca'} onClick={() => updateTargets({ locked: !drawing.locked })} className={`${drawingIconClass} ${drawing.locked ? 'bg-cyan-400/20 text-cyan-200' : ''}`}>
                      {drawing.locked ? <Unlock data-static-icon className="h-5 w-5" /> : <Lock data-static-icon className="h-5 w-5" />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">{drawing.locked ? 'Sblocca' : 'Blocca'}</TooltipContent>
                </Tooltip>
                <Tooltip open={drawingTooltip === 'pin'}>
                  <TooltipTrigger asChild>
                    <button
                      {...tooltipEvents('pin')}
                      type="button"
                      aria-label="Fissa elemento"
                      onClick={() => {
                        updateTargets({ pinned: true });
                        setDrawingMenu(null);
                      }}
                      className={drawingIconClass}
                    >
                      <Pin data-static-icon className="h-5 w-5 -rotate-45" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Fissa elemento</TooltipContent>
                </Tooltip>
                {!(activeTool === 'draw' && drawSettings.mode === 'grab') && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label="Resize"
                        disabled={!isOwner}
                        onClick={() => {
                          setSelectedDrawingId(drawing.id);
                          setDrawingMenu(null);
                        }}
                        className={drawingIconClass}
                      >
                        <Maximize2 data-static-icon className="h-5 w-5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Resize</TooltipContent>
                  </Tooltip>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="Duplica"
                      onClick={() => {
                        if (targetIds.length > 1) onDrawingsDuplicate?.(targetIds);
                        else onDrawingDuplicate?.(drawing.id);
                        setDrawingMenu(null);
                      }}
                      className={drawingIconClass}
                    >
                      <Copy data-static-icon className="h-5 w-5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Duplica</TooltipContent>
                </Tooltip>
                <Tooltip open={drawingTooltip === 'copy'}>
                  <TooltipTrigger asChild>
                    <button
                      {...tooltipEvents('copy')}
                      data-map-copy-action
                      type="button"
                      aria-label="Copia"
                      onClick={() => {
                        setPoiClipboard(null);
                        setFogClipboard(null);
                        setDrawingClipboard(structuredClone(drawing));
                        setPastePrompt(null);
                        setDrawingTooltip(null);
                        setDrawingMenu(null);
                      }}
                      className={`${drawingIconClass} ${drawingClipboard?.id === drawing.id ? 'bg-cyan-400/20 text-cyan-200' : ''}`}
                    >
                      <ClipboardCopy data-static-icon className="h-5 w-5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Copia</TooltipContent>
                </Tooltip>
                <Tooltip open={drawingTooltip === 'layers'}>
                  <TooltipTrigger asChild><button {...tooltipEvents('layers')} type="button" aria-label="Livelli" onClick={() => { setDrawingLayerPanelOpen((open) => !open); setDrawingStyleEditorOpen(false); }} className={`${drawingIconClass} ${drawingLayerPanelOpen ? 'bg-cyan-400/20 text-cyan-200' : ''}`}><Layers3 data-static-icon className="h-5 w-5" /></button></TooltipTrigger>
                  <TooltipContent side="top">Livelli</TooltipContent>
                </Tooltip>
                <Tooltip open={drawingTooltip === 'magnet'}>
                  <TooltipTrigger asChild>
                    <button
                      {...tooltipEvents('magnet')}
                      type="button"
                      aria-label={drawing.magnetGroupId ? 'Disattiva collegamenti magnetici' : 'Collegamenti magnetici'}
                      onClick={() => {
                        if (drawing.magnetGroupId) onDrawingMagnetDisable?.(drawing.id);
                        else
                          setDrawingMagnetLink({
                            ids: [drawing.id],
                            pointer: {
                              x: drawing.x + drawing.width / 2,
                              y: drawing.y + drawing.height / 2,
                            },
                            hoveredId: null,
                          });
                        setDrawingTooltip(null);
                        setDrawingMenu(null);
                      }}
                      className={`${drawingIconClass} ${drawing.magnetGroupId ? 'bg-cyan-400/20 text-cyan-200' : ''}`}
                    >
                      <Magnet data-static-icon className="h-5 w-5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">{drawing.magnetGroupId ? 'Disattiva collegamenti magnetici' : 'Collegamenti magnetici'}</TooltipContent>
                </Tooltip>
                <Tooltip open={drawingTooltip === 'style'}>
                  <TooltipTrigger asChild>
                    <button
                      {...tooltipEvents('style')}
                      type="button"
                      aria-label={drawing.kind === 'text' ? 'Modifica testo' : drawingStyleEditorOpen ? 'Chiudi modifiche' : 'Modifica grafica'}
                      aria-expanded={drawing.kind !== 'text' && drawingStyleEditorOpen}
                      onClick={() => {
                        if (drawing.kind === 'text' && drawing.text) {
                          setTextDraft({ point: { x: drawing.x, y: drawing.y }, value: drawing.text.content, editingId: drawing.id });
                          setDrawingMenu(null);
                          setDrawingTooltip(null);
                        } else setDrawingStyleEditorOpen((open) => !open);
                      }}
                      className={`${drawingIconClass} ${drawing.kind !== 'text' && drawingStyleEditorOpen ? 'bg-cyan-400/20 text-cyan-200' : ''}`}
                    >
                      {drawing.kind === 'text' ? <Type data-static-icon className="h-5 w-5" /> : <Palette data-static-icon className="h-5 w-5" />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">{drawing.kind === 'text' ? 'Modifica testo' : drawingStyleEditorOpen ? 'Chiudi modifiche' : 'Modifica grafica'}</TooltipContent>
                </Tooltip>
                {drawing.kind === 'text' && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" aria-label={drawingStyleEditorOpen ? 'Chiudi formattazione testo' : 'Formattazione testo'} aria-expanded={drawingStyleEditorOpen} onClick={() => setDrawingStyleEditorOpen((open) => !open)} className={`${drawingIconClass} ${drawingStyleEditorOpen ? 'bg-cyan-400/20 text-cyan-200' : ''}`}>
                        <Palette data-static-icon className="h-5 w-5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">{drawingStyleEditorOpen ? 'Chiudi formattazione testo' : 'Formattazione testo'}</TooltipContent>
                  </Tooltip>
                )}
                {drawing.kind !== 'text' && (
                  <Tooltip open={drawingTooltip === 'path'}>
                    <TooltipTrigger asChild>
                      <button
                        {...tooltipEvents('path')}
                        type="button"
                        aria-label={pathEditDrawingId === drawing.id ? 'Termina modifica tracciato' : ['freehand', 'polygon', 'line'].includes(drawing.kind) ? 'Modifica tracciato' : 'Converti in tracciato'}
                        disabled={!isOwner}
                        onClick={() => {
                          if (pathEditDrawingId === drawing.id) {
                            setPathEditDrawingId(null);
                            setDrawingTooltip(null);
                            setDrawingMenu(null);
                            return;
                          }
                          if (['freehand', 'polygon', 'line'].includes(drawing.kind)) {
                            const points = drawing.kind === 'freehand' && drawing.points ? simplifyPathPoints(drawing.points, Math.max(1.5, Math.max(drawing.width, drawing.height) * 0.008)) : (drawing.points?.map((point) => ({ ...point })) ?? []);
                            if (points.length >= 2 && JSON.stringify(points) !== JSON.stringify(drawing.points)) onDrawingChange?.(drawing.id, { points });
                          } else {
                            onDrawingChange?.(drawing.id, { kind: 'polygon', points: convertDrawingToPath(drawing) });
                          }
                          setPathEditDrawingId(drawing.id);
                          setSelectedDrawingId(null);
                          setDrawingTooltip(null);
                          setDrawingMenu(null);
                        }}
                        className={`${drawingIconClass} ${pathEditDrawingId === drawing.id ? 'bg-cyan-400/20 text-cyan-200' : ''}`}
                      >
                        <Spline data-static-icon className="h-5 w-5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">{pathEditDrawingId === drawing.id ? 'Termina modifica tracciato' : ['freehand', 'polygon', 'line'].includes(drawing.kind) ? 'Modifica tracciato' : 'Converti in tracciato'}</TooltipContent>
                  </Tooltip>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="Elimina"
                      onClick={() => {
                        if (targetIds.length > 1) onDrawingsDelete?.(targetIds);
                        else onDrawingDelete?.(drawing.id);
                        setDrawingMenu(null);
                        setSelectedDrawingId(null);
                        setSelectedDrawingIds(new Set());
                      }}
                      className={`${drawingIconClass} text-red-300 hover:border-red-400/60 hover:bg-red-500/15 hover:text-red-200`}
                    >
                      <Trash2 data-static-icon className="h-5 w-5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Elimina</TooltipContent>
                </Tooltip>
              </div>
              {drawingLayerPanelOpen && (
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--dash-border-soft)] pt-3">
                  {[['forward', 'Porta sopra', ArrowUp], ['backward', 'Porta sotto', ArrowDown], ['front', 'In primo piano', ChevronsUp], ['back', 'In fondo', ChevronsDown]].map(([move, label, Icon]) => <button key={String(move)} type="button" onClick={() => { if (targetIds.length > 1) onDrawingsLayerMove?.(targetIds, move as MapLayerMove); else onDrawingLayerMove?.(drawing.id, move as MapLayerMove); }} className="flex items-center gap-2 rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] px-3 py-2 hover:bg-[var(--dash-surface-2)]"><Icon data-static-icon className="h-4 w-4" /><span>{String(label)}</span></button>)}
                </div>
              )}
              {drawingStyleEditorOpen && drawing.kind === 'text' && drawing.text && (
                <div className="mt-2 space-y-2 border-t border-[var(--dash-border-soft)] pt-2">
                  <div className="flex flex-wrap items-center gap-1">
                    <Tooltip open={drawingTooltip === 'text-font'}>
                      <TooltipTrigger asChild>
                        <select {...tooltipEvents('text-font')} aria-label="Font testo figura" value={drawing.text.fontFamily} onChange={(event) => updateText({ fontFamily: event.target.value })} className="h-8 rounded border border-[var(--dash-border)] bg-[var(--dash-input)] px-2">
                          {['Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Trebuchet MS', 'Cinzel', 'Uncial Antiqua', 'Crimson Text', 'Merriweather', 'Raleway'].map((font) => (
                            <option key={font} style={{ fontFamily: font }}>
                              {font}
                            </option>
                          ))}
                        </select>
                      </TooltipTrigger>
                      <TooltipContent side="top">Carattere</TooltipContent>
                    </Tooltip>
                    <Tooltip open={drawingTooltip === 'text-size'}>
                      <TooltipTrigger asChild>
                        <select {...tooltipEvents('text-size')} aria-label="Dimensione testo figura" value={drawing.text.fontSize} onChange={(event) => updateText({ fontSize: Number(event.target.value) })} className="h-8 rounded border border-[var(--dash-border)] bg-[var(--dash-input)] px-2">
                          {[6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 34].map((size) => (
                            <option key={size}>{size}px</option>
                          ))}
                        </select>
                      </TooltipTrigger>
                      <TooltipContent side="top">Dimensione testo</TooltipContent>
                    </Tooltip>
                    {(
                      [
                        ['bold', 'Grassetto', Bold],
                        ['italic', 'Corsivo', Italic],
                        ['underline', 'Sottolineato', Underline],
                        ['strike', 'Sbarrato', Strikethrough],
                      ] as const
                    ).map(([key, label, Icon]) => (
                      <Tooltip key={key} open={drawingTooltip === `text-${key}`}>
                        <TooltipTrigger asChild>
                          <button {...tooltipEvents(`text-${key}`)} type="button" aria-label={label} aria-pressed={drawing.text?.[key]} onClick={() => updateText({ [key]: !drawing.text?.[key] })} className={`grid h-8 w-8 place-items-center rounded ${drawing.text?.[key] ? 'bg-cyan-400/20 text-cyan-200' : 'hover:bg-white/10'}`}>
                            <Icon className="h-4 w-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top">{label}</TooltipContent>
                      </Tooltip>
                    ))}
                    {(
                      [
                        ['left', AlignLeft],
                        ['center', AlignCenter],
                        ['right', AlignRight],
                      ] as const
                    ).map(([align, Icon]) => (
                      <Tooltip key={align} open={drawingTooltip === `text-align-${align}`}>
                        <TooltipTrigger asChild>
                          <button {...tooltipEvents(`text-align-${align}`)} type="button" aria-label={`Allinea ${align}`} aria-pressed={drawing.text?.align === align} onClick={() => updateText({ align })} className={`grid h-8 w-8 place-items-center rounded ${drawing.text?.align === align ? 'bg-cyan-400/20 text-cyan-200' : 'hover:bg-white/10'}`}>
                            <Icon className="h-4 w-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top">{align === 'left' ? 'Allinea a sinistra' : align === 'center' ? 'Allinea al centro' : 'Allinea a destra'}</TooltipContent>
                      </Tooltip>
                    ))}
                    {(['horizontal', 'vertical'] as const).map((orientation) => (
                      <Tooltip key={orientation} open={drawingTooltip === `text-${orientation}`}>
                        <TooltipTrigger asChild>
                          <button {...tooltipEvents(`text-${orientation}`)} type="button" aria-label={`Testo ${orientation === 'horizontal' ? 'orizzontale' : 'verticale'}`} aria-pressed={(drawing.text?.orientation ?? 'horizontal') === orientation} onClick={() => updateText({ orientation })} className={`grid h-8 w-8 place-items-center rounded ${(drawing.text?.orientation ?? 'horizontal') === orientation ? 'bg-cyan-400/20 text-cyan-200' : 'hover:bg-white/10'}`}>
                            {orientation === 'horizontal' ? <ArrowRight data-static-icon className="h-4 w-4" /> : <ArrowDown data-static-icon className="h-4 w-4" />}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top">Testo {orientation === 'horizontal' ? 'orizzontale' : 'verticale'}</TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex items-center justify-between">
                      Interno
                      <input type="color" aria-label="Colore interno testo figura" value={drawing.text.color} onChange={(event) => updateText({ color: event.target.value })} />
                    </label>
                    <label className="flex items-center justify-between">
                      Bordo
                      <input type="color" aria-label="Colore bordo testo figura" value={drawing.text.strokeColor} onChange={(event) => updateText({ strokeColor: event.target.value })} />
                    </label>
                  </div>
                </div>
              )}
              {drawingStyleEditorOpen && drawing.kind !== 'text' && (
                <>
                  <div className="mt-2 grid grid-cols-2 gap-2 border-t border-[var(--dash-border-soft)] pt-2">
                    <label className="flex items-center justify-between gap-2 text-[var(--dash-muted)]">
                      Linea
                      <input type="color" aria-label="Colore linea figura" value={drawing.style.strokeColor} onChange={(event) => updateStyle({ strokeColor: event.target.value })} className="h-8 w-12 bg-transparent" />
                    </label>
                    <label className="flex items-center justify-between gap-2 text-[var(--dash-muted)]">
                      Interno
                      <input type="color" aria-label="Colore interno figura" value={drawing.style.fillColor} onChange={(event) => updateStyle({ fillColor: event.target.value })} className="h-8 w-12 bg-transparent" />
                    </label>
                  </div>
                  <div className="mt-2 grid grid-cols-5 gap-1">
                    {styles.map(([value, dash, label]) => (
                      <Tooltip key={value}>
                        <TooltipTrigger asChild>
                          <button type="button" aria-label={label} aria-pressed={drawing.style.lineStyle === value} onClick={() => updateStyle({ lineStyle: value })} className={`rounded-md border p-1.5 ${drawing.style.lineStyle === value ? 'border-cyan-300 bg-cyan-400/15 text-cyan-200' : 'border-[var(--dash-border-soft)] text-[var(--dash-muted)]'}`}>
                            <svg viewBox="0 0 60 10" className="h-3 w-full">
                              <line x1="1" y1="5" x2="59" y2="5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray={dash} />
                            </svg>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">{label}</TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                  <div className="mt-2 space-y-2 border-t border-[var(--dash-border-soft)] pt-2">
                    {(
                      [
                        ['strokeWidth', 'Spessore', 0.5, 32, 0.5, drawing.style.strokeWidth],
                        ['opacity', 'Opacità', 0.01, 1, 0.01, drawing.style.opacity],
                        ['fillOpacity', 'Riempimento', 0, 1, 0.01, drawing.style.fillOpacity],
                      ] as const
                    ).map(([key, label, min, max, step, value]) => (
                      <label key={key} className="grid grid-cols-[78px_1fr_42px] items-center gap-2 text-[11px] text-[var(--dash-muted)]">
                        <span>{label}</span>
                        <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => updateStyle({ [key]: Number(event.target.value) })} className="accent-cyan-400" />
                        <span className="text-right text-[var(--dash-text)]">{key === 'strokeWidth' ? Number(value).toFixed(1) : `${Math.round(Number(value) * 100)}%`}</span>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })()}
      {tokenMenu &&
        (() => {
          const token = mapTokens.find((candidate) => candidate.id === tokenMenu.tokenId);
          if (!token) return null;
          const targetIds = selectedTokenIds.has(token.id) ? [...selectedTokenIds] : [token.id];
          const batch = targetIds.length > 1;
          const applyTokenUpdate = (update: Partial<SessionMapToken>) => (batch ? onTokensChange?.(targetIds, update) : onTokenChange?.(token.id, update));
          const iconClass = 'grid h-10 w-10 place-items-center rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] text-[var(--dash-muted)] hover:border-[var(--dash-accent)] hover:text-[var(--dash-text-strong)] disabled:cursor-not-allowed disabled:opacity-30';
          let menuIconIndex = 0;
          const menuIcon = (label: string, button: ReactNode) => {
            const id = `token-menu-${menuIconIndex++}`;
            return (
              <Tooltip open={tokenTooltip === id}>
                <TooltipTrigger asChild>
                  <span
                    className="inline-flex"
                    onPointerEnter={() => setTokenTooltip(id)}
                    onPointerLeave={() => setTokenTooltip(null)}
                    onFocus={() => setTokenTooltip(id)}
                    onBlur={(event) => {
                      if (!event.currentTarget.matches(':hover')) setTokenTooltip(null);
                    }}
                  >
                    {button}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">{label}</TooltipContent>
              </Tooltip>
            );
          };
          const commitName = () => {
            const name = tokenMenu.nameDraft.trim();
            if (!batch && name && name !== token.name) onTokenChange?.(token.id, { name });
          };
          const toggleStandardCondition = (key: string, name: string) => {
            const conditions = token.conditions ?? [];
            const exists = conditions.some((condition) => condition.standardKey === key);
            applyTokenUpdate({
              conditions: exists ? conditions.filter((condition) => condition.standardKey !== key) : [...conditions, { id: `standard:${key}`, standardKey: key, name }],
            });
          };
          const addCustomCondition = () => {
            const name = tokenMenu.customConditionDraft.trim();
            if (!name) return;
            applyTokenUpdate({
              conditions: [...(token.conditions ?? []), { id: crypto.randomUUID(), name, custom: true }],
            });
            setTokenMenu((current) => (current ? { ...current, customConditionDraft: '' } : null));
          };
          if (token.pinned)
            return (
              <div data-map-interactive role="menu" className="absolute z-50 flex items-center gap-2 rounded-xl border border-[var(--dash-border)] bg-[var(--dash-panel)]/95 p-2 text-xs shadow-2xl" style={{ left: tokenMenu.x, top: tokenMenu.y }} onPointerDown={(event) => event.stopPropagation()}>
                <span className="px-1 font-semibold text-[var(--dash-text-strong)]">Token fissato</span>
                {menuIcon(
                  'Rimuovi fissaggio',
                  <button
                    type="button"
                    aria-label="Rimuovi fissaggio token"
                    onClick={() => {
                      onTokenChange?.(token.id, { pinned: false });
                      setTokenMenu(null);
                    }}
                    className={`${iconClass} bg-cyan-400/20 text-cyan-200`}
                  >
                    <Pin data-static-icon className="h-5 w-5" />
                  </button>,
                )}
              </div>
            );
          return (
            <div data-map-interactive role="menu" className="absolute z-50 w-[min(92vw,390px)] rounded-xl border border-[var(--dash-border)] bg-[var(--dash-panel)]/95 p-3 text-xs text-[var(--dash-text)] shadow-2xl backdrop-blur" style={{ left: tokenMenu.x, top: tokenMenu.y }} onPointerDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
              <div className="mb-3 flex items-center justify-between gap-2 border-b border-[var(--dash-border-soft)] pb-2 font-semibold text-[var(--dash-text-strong)]">
                <span>{batch ? `Token selezionati (${targetIds.length})` : 'Token'}</span>
                <div className="flex items-center gap-2">{token.locked && <Lock data-static-icon className="h-4 w-4 text-amber-300" />}<button type="button" aria-label="Sposta menu token" onPointerDown={(event) => beginMenuDrag(event, 'token', tokenMenu)} onPointerMove={moveMenuDrag} onPointerUp={finishMenuDrag} onPointerCancel={finishMenuDrag} className="cursor-move touch-none rounded p-1 text-[var(--dash-muted)] hover:bg-white/10 hover:text-[var(--dash-text-strong)]"><GripHorizontal data-static-icon className="h-4 w-4" /></button></div>
              </div>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {isOwner &&
                  menuIcon(
                    token.visible === false ? 'Mostra ai giocatori' : 'Nascondi ai giocatori',
                    <button type="button" aria-label={token.visible === false ? 'Mostra token ai giocatori' : 'Nascondi token ai giocatori'} onClick={() => applyTokenUpdate({ visible: token.visible === false })} className={iconClass}>
                      {token.visible === false ? <EyeOff data-static-icon className="h-5 w-5" /> : <Eye data-static-icon className="h-5 w-5" />}
                    </button>,
                  )}
                {isOwner &&
                  menuIcon(
                    token.locked ? 'Sblocca token' : 'Blocca token',
                    <button
                      type="button"
                      aria-label={token.locked ? 'Sblocca token' : 'Blocca token'}
                      onClick={() =>
                        batch
                          ? onTokensChange?.(targetIds, {
                              locked: !token.locked,
                            })
                          : onTokenLockChange?.(token.id, !token.locked)
                      }
                      className={`${iconClass} ${token.locked ? 'bg-cyan-400/20 text-cyan-200' : ''}`}
                    >
                      {token.locked ? <Unlock className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
                    </button>,
                  )}
                {isOwner &&
                  menuIcon(
                    'Fissa token',
                    <button
                      type="button"
                      aria-label="Fissa token"
                      onClick={() => {
                        applyTokenUpdate({ pinned: true });
                        setTokenMenu(null);
                      }}
                      className={iconClass}
                    >
                      <Pin data-static-icon className="h-5 w-5 -rotate-45" />
                    </button>,
                  )}
                {menuIcon(
                  batch ? 'Illuminazione disponibile per un token alla volta' : 'Illuminazione e vista',
                  <button type="button" disabled={batch} aria-label="Illuminazione e vista" onClick={() => setTokenMenu((current) => current ? { ...current, panel: current.panel === 'lighting' ? null : 'lighting' } : null)} className={`${iconClass} ${(token.light?.enabled || token.vision?.enabled) ? 'bg-cyan-400/20 text-cyan-200' : ''}`}>
                    <Flashlight className="h-5 w-5" />
                  </button>,
                )}
                {menuIcon(
                  !canControlToken(token) ? 'Token non modificabile' : 'Dimensione e rotazione',
                  <button
                    type="button"
                    disabled={!canControlToken(token)}
                    aria-label="Dimensione e rotazione"
                    onClick={() => {
                      setTransformTokenId(token.id);
                      setTokenMenu(null);
                    }}
                    className={iconClass}
                  >
                    <Maximize2 className="h-5 w-5" />
                  </button>,
                )}
                {menuIcon(
                  'Condizioni',
                  <button
                    type="button"
                    aria-label="Condizioni"
                    onClick={() => {
                      setConditionScrollRatio(0);
                      setTokenMenu((current) =>
                        current
                          ? {
                              ...current,
                              panel: current.panel === 'conditions' ? null : 'conditions',
                            }
                          : null,
                      );
                    }}
                    className={`${iconClass} ${(token.conditions?.length ?? 0) > 0 ? 'bg-cyan-400/20 text-cyan-200' : ''}`}
                  >
                    <Skull className="h-5 w-5" />
                  </button>,
                )}
                {menuIcon(
                  token.showLabel ? 'Colore etichetta' : 'Mostra prima il nome del token',
                  <button
                    type="button"
                    disabled={!token.showLabel}
                    aria-label="Colore etichetta"
                    onClick={() =>
                      setTokenMenu((current) =>
                        current
                          ? {
                              ...current,
                              panel: current.panel === 'colors' ? null : 'colors',
                            }
                          : null,
                      )
                    }
                    className={iconClass}
                  >
                    <Palette className="h-5 w-5" />
                  </button>,
                )}
                {menuIcon(
                  batch ? 'Crea gruppo magnetico' : token.magnetEnabled ? 'Collegamenti magnetici' : 'Attiva calamita',
                  <button
                    type="button"
                    aria-label={batch ? 'Crea gruppo magnetico' : token.magnetEnabled ? 'Collegamenti magnetici' : 'Attiva calamita'}
                    onClick={() => {
                      if (batch) {
                        onTokensCreateMagnetGroup?.(targetIds);
                        setTokenMenu(null);
                        return;
                      }
                      if (!token.magnetEnabled) onTokenMagnetEnabledChange?.(token.id, true);
                      setTokenMenu((current) =>
                        current
                          ? {
                              ...current,
                              panel: current.panel === 'magnets' && token.magnetEnabled ? null : 'magnets',
                            }
                          : null,
                      );
                    }}
                    className={`${iconClass} ${token.magnetEnabled ? 'bg-cyan-400/20 text-cyan-200' : ''}`}
                  >
                    <Magnet className="h-5 w-5" />
                  </button>,
                )}
                {menuIcon(
                  'Livelli',
                  <button
                    type="button"
                    aria-label="Livelli"
                    onClick={() =>
                      setTokenMenu((current) =>
                        current
                          ? {
                              ...current,
                              panel: current.panel === 'layers' ? null : 'layers',
                            }
                          : null,
                      )
                    }
                    className={iconClass}
                  >
                    <Layers3 className="h-5 w-5" />
                  </button>,
                )}
                {menuIcon(
                  batch ? `Elimina ${targetIds.length} token` : 'Elimina token',
                  <button
                    type="button"
                    aria-label={batch ? `Elimina ${targetIds.length} token` : 'Elimina token'}
                    onClick={() => {
                      if (batch) {
                        if (window.confirm(`Eliminare definitivamente i ${targetIds.length} token selezionati?`)) {
                          onTokensDelete?.(targetIds);
                          setSelectedTokenIds(new Set());
                          setTokenMenu(null);
                        }
                      } else {
                        onTokenDelete?.(token.id);
                        setTokenMenu(null);
                      }
                    }}
                    className={`${iconClass} text-red-300 hover:bg-red-500/15 hover:text-red-200`}
                  >
                    <Trash2 data-static-icon className="h-5 w-5" />
                  </button>,
                )}
              </div>
              <div className="flex gap-2">
                <input
                  value={batch ? `${targetIds.length} token selezionati` : tokenMenu.nameDraft}
                  disabled={batch}
                  onChange={(event) => setTokenMenu((current) => (current ? { ...current, nameDraft: event.target.value } : null))}
                  onBlur={commitName}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      commitName();
                      event.currentTarget.blur();
                    }
                  }}
                  aria-label="Nome token"
                  className="h-10 min-w-0 flex-1 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 text-sm text-[var(--dash-text-strong)] outline-none focus:border-[var(--dash-accent)] disabled:opacity-60"
                />
                {menuIcon(
                  token.showLabel ? 'Nascondi nome sotto il token' : 'Mostra nome sotto il token',
                  <button type="button" aria-label={token.showLabel ? 'Nascondi etichetta token' : 'Mostra etichetta token'} onClick={() => applyTokenUpdate({ showLabel: !token.showLabel })} className={`${iconClass} shrink-0 ${token.showLabel ? 'bg-cyan-400/20 text-cyan-200' : ''}`}>
                    {token.showLabel ? <Eye data-static-icon className="h-5 w-5" /> : <EyeOff data-static-icon className="h-5 w-5" />}
                  </button>,
                )}
              </div>
              {!batch && tokenMenu.panel === 'lighting' && (
                <div className="mt-3 space-y-3 border-t border-[var(--dash-border-soft)] pt-3">
                  {([['Illuminazione', 'Visibile a tutti e rimuove completamente la Nebbia', 'light'], ['Vista', 'Privata al proprietario e schiarisce la Nebbia', 'vision']] as const).map(([label, description, key]) => {
                    const source = token[key] ?? { enabled: false, radius: 0 };
                    const lightEffect = key === 'light' ? token.light?.effect : undefined;
                    return <div key={key} className="rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-3">
                      <div className="flex items-start justify-between gap-3"><div><div className="font-semibold text-[var(--dash-text-strong)]">{label}</div><div className="mt-0.5 text-[10px] text-[var(--dash-muted)]">{description}</div></div><button type="button" role="switch" aria-checked={source.enabled} onClick={() => applyTokenUpdate({ [key]: { ...source, enabled: !source.enabled } })} className={`relative mt-0.5 h-5 w-9 rounded-full transition ${source.enabled ? 'bg-cyan-500' : 'bg-slate-600'}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${source.enabled ? 'left-[18px]' : 'left-0.5'}`} /></button></div>
                       <RadiusStepper value={source.radius} unit={gridSettings.unit} onChange={(radius) => applyTokenUpdate({ [key]: { ...source, radius } })} />
                       <LightingShapeControls shape={source.shape} coneAngle={source.coneAngle} onChange={(update) => applyTokenUpdate({ [key]: { ...source, ...update } })} />
                       <label className="mt-3 flex cursor-pointer items-center gap-2 text-[10px] font-semibold text-[var(--dash-muted)]"><input type="checkbox" checked={source.outlineVisible !== false} onChange={(event) => applyTokenUpdate({ [key]: { ...source, outlineVisible: event.target.checked } })} className="h-3.5 w-3.5 accent-cyan-500" />Mostra tratteggio</label>
                       {key === 'light' && <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2"><select aria-label="Effetto tremolante" value={lightEffect?.includes('flicker') ? token.light?.flickerPreset ?? 'torch' : 'none'} onChange={(event) => { const preset = event.target.value as typeof LIGHT_FLICKER_PRESETS[number][0]; const radiant = lightEffect?.includes('radiant') ?? false; applyTokenUpdate({ light: { ...source, effect: preset === 'none' ? radiant ? 'radiant' : undefined : radiant ? 'flicker-radiant' : 'flicker', flickerPreset: preset === 'none' ? undefined : preset } }); }} className="min-w-0 rounded-md border border-[var(--dash-border)] bg-[var(--dash-input)] px-2 py-1.5 text-[10px] font-semibold text-[var(--dash-text-strong)] outline-none focus:border-[var(--dash-accent)]">{LIGHT_FLICKER_PRESETS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{(() => { const active = lightEffect?.includes('radiant') ?? false; return <button type="button" aria-pressed={active} onClick={() => applyTokenUpdate({ light: { ...source, effect: toggleLightEffect(lightEffect, 'radiant') } })} className={`rounded-md border px-2 py-1.5 text-[10px] font-semibold transition ${active ? 'border-cyan-400 bg-cyan-400/15 text-cyan-100' : 'border-[var(--dash-border)] bg-[var(--dash-input)] text-[var(--dash-muted)] hover:text-[var(--dash-text-strong)]'}`}>Luce radiante</button>; })()}</div>}
                    </div>;
                  })}
                </div>
              )}
              {token.showLabel && tokenMenu.panel === 'colors' && (
                <div className="mt-3 border-t border-[var(--dash-border-soft)] pt-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-[var(--dash-muted)]">Sfondo del nome</span>
                    <button type="button" onClick={() => applyTokenUpdate({ labelColor: 'var(--dash-surface)' })} className="rounded-md border border-[var(--dash-border)] bg-[var(--dash-surface-2)] px-2 py-1 text-[10px] font-semibold text-[var(--dash-text)] hover:border-[var(--dash-accent)]">
                      Reset
                    </button>
                  </div>
                  <div className="grid grid-cols-8 gap-2">
                    {TOKEN_LABEL_COLORS.map((color) => (
                      <button key={color} type="button" aria-label={`Colore etichetta ${color}`} onClick={() => applyTokenUpdate({ labelColor: color })} className={`h-6 w-6 rounded-full border-2 ${token.labelColor === color ? 'border-[var(--dash-text-strong)]' : 'border-transparent'}`} style={{ backgroundColor: color }} />
                    ))}
                  </div>
                </div>
              )}
              {tokenMenu.panel === 'conditions' && (
                <div className="mt-3 border-t border-[var(--dash-border-soft)] pt-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-semibold text-[var(--dash-text-strong)]">Condizioni</span>
                    <button type="button" disabled={(token.conditions?.length ?? 0) === 0} onClick={() => applyTokenUpdate({ conditions: [] })} className="text-[10px] text-[var(--dash-muted)] hover:text-red-200 disabled:opacity-40">
                      Rimuovi tutte
                    </button>
                  </div>
                  <div className="relative -mr-2">
                    <div
                      ref={conditionListRef}
                      data-token-condition-list
                      onScroll={(event) => {
                        const element = event.currentTarget;
                        setConditionScrollRatio(element.scrollTop / Math.max(1, element.scrollHeight - element.clientHeight));
                      }}
                      className="max-h-64 space-y-1 overflow-y-scroll pr-4"
                    >
                      {STANDARD_TOKEN_CONDITIONS.map((condition) => {
                        const selected = token.conditions?.some((item) => item.standardKey === condition.key) ?? false;
                        const ConditionIcon = condition.icon;
                        return (
                          <button key={condition.key} type="button" onClick={() => toggleStandardCondition(condition.key, condition.name)} className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left ${selected ? 'bg-[var(--dash-accent)]/20 text-[var(--dash-text-strong)]' : 'hover:bg-[var(--dash-surface-2)]'}`}>
                            <span className={`grid h-6 w-6 place-items-center rounded border ${selected ? 'border-[var(--dash-accent)] bg-[var(--dash-accent)] text-white' : 'border-[var(--dash-border)] bg-[var(--dash-input)]'}`}>{selected && (condition.key === 'prone' ? <img src="/condition-prone-v2.svg" alt="" className="h-4 w-4 object-contain invert" /> : condition.key === 'incapacitated' ? <img src="/condition-incapacitated-v2.svg" alt="" className="h-4 w-4 object-contain invert" /> : condition.key === 'stunned' ? <img src="/condition-stunned-v2.png" alt="" className="h-4 w-4 object-contain invert" /> : condition.key === 'unconscious' ? <img src="/condition-unconscious.png" alt="" className="h-4 w-4 object-contain invert" /> : condition.key === 'restrained' ? <img src="/condition-restrained-v2.png" alt="" className="h-4 w-4 object-contain invert" /> : condition.key === 'paralyzed' ? <img src="/condition-paralyzed-v3.png" alt="" className="h-5 w-5 object-contain invert" /> : <ConditionIcon data-static-icon={condition.key === 'blinded' ? true : undefined} className="h-4 w-4" />)}</span>
                            <span>{condition.name}</span>
                          </button>
                        );
                      })}
                    </div>
                    <div
                      role="scrollbar"
                      aria-label="Scorri condizioni"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(conditionScrollRatio * 100)}
                      className="absolute bottom-0 right-1 top-0 z-10 w-2 cursor-pointer touch-none rounded-full bg-[var(--dash-input)]"
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        event.currentTarget.setPointerCapture(event.pointerId);
                        const list = conditionListRef.current;
                        if (!list) return;
                        const rect = event.currentTarget.getBoundingClientRect();
                        const ratio = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
                        list.scrollTop = ratio * (list.scrollHeight - list.clientHeight);
                      }}
                      onPointerMove={(event) => {
                        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                        event.preventDefault();
                        event.stopPropagation();
                        const list = conditionListRef.current;
                        if (!list) return;
                        const rect = event.currentTarget.getBoundingClientRect();
                        const ratio = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
                        list.scrollTop = ratio * (list.scrollHeight - list.clientHeight);
                      }}
                      onPointerUp={(event) => {
                        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                      }}
                    >
                      <div
                        className="pointer-events-none absolute left-0 top-0 w-full rounded-full bg-[var(--dash-accent)]"
                        style={{
                          height: '36%',
                          transform: `translateY(${conditionScrollRatio * 177.78}%)`,
                        }}
                      />
                    </div>
                  </div>
                  {(token.conditions ?? []).some((condition) => condition.custom) && (
                    <div className="mt-2 max-h-32 space-y-1 overflow-y-auto border-t border-[var(--dash-border-soft)] pt-2">
                      {(token.conditions ?? [])
                        .filter((condition) => condition.custom)
                        .sort((a, b) => a.name.localeCompare(b.name, 'it'))
                        .map((condition) => (
                          <button
                            key={condition.id}
                            type="button"
                            title="Rimuovi condizione personalizzata"
                            onClick={() =>
                              applyTokenUpdate({
                                conditions: (token.conditions ?? []).filter((item) => item.id !== condition.id),
                              })
                            }
                            className="flex w-full items-center gap-2 rounded-md bg-[var(--dash-surface-2)] px-2 py-2 text-left hover:text-red-200"
                          >
                            <Star className="h-4 w-4" />
                            <span className="min-w-0 flex-1 truncate">{condition.name}</span>
                            <X className="h-3.5 w-3.5" />
                          </button>
                        ))}
                    </div>
                  )}
                  <div className="mt-2 flex gap-1.5 border-t border-[var(--dash-border-soft)] pt-2">
                    <input
                      value={tokenMenu.customConditionDraft}
                      onChange={(event) =>
                        setTokenMenu((current) =>
                          current
                            ? {
                                ...current,
                                customConditionDraft: event.target.value,
                              }
                            : null,
                        )
                      }
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') addCustomCondition();
                      }}
                      placeholder="Condizione personalizzata..."
                      aria-label="Condizione personalizzata"
                      className="h-9 min-w-0 flex-1 rounded-md border border-[var(--dash-border)] bg-[var(--dash-input)] px-2 text-xs outline-none focus:border-[var(--dash-accent)]"
                    />
                    <button type="button" onClick={addCustomCondition} className="rounded-md border border-[var(--dash-border)] px-3 font-semibold hover:border-[var(--dash-accent)]">
                      Aggiungi
                    </button>
                  </div>
                </div>
              )}
              {tokenMenu.panel === 'magnets' && (
                <div className="mt-3 border-t border-[var(--dash-border-soft)] pt-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="font-semibold text-[var(--dash-text-strong)]">Elementi magnetici</span>
                    <button
                      type="button"
                      onClick={() => {
                        onTokenMagnetEnabledChange?.(token.id, false);
                        setTokenMenu((current) => (current ? { ...current, panel: null } : null));
                      }}
                      className="rounded-md border border-[var(--dash-border)] px-2 py-1 text-[10px] text-[var(--dash-muted)] hover:text-red-200"
                    >
                      Disattiva
                    </button>
                  </div>
                  {token.magnetGroupId && (
                    <button type="button" onClick={() => onTokenMagnetUnlink?.(token.id)} className="mb-2 w-full rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-2 text-left text-amber-100 hover:bg-amber-400/20">
                      Scollega questo elemento dal gruppo
                    </button>
                  )}
                  <div className="max-h-44 space-y-1 overflow-y-auto">
                    {mapTokens
                      .filter((candidate) => candidate.id !== token.id && candidate.magnetEnabled)
                      .map((candidate) => {
                        const linked = Boolean(token.magnetGroupId && candidate.magnetGroupId === token.magnetGroupId);
                        return (
                          <button key={candidate.id} type="button" disabled={linked} onClick={() => onTokenMagnetLink?.(token.id, candidate.id)} className="flex w-full items-center gap-2 rounded-md bg-[var(--dash-surface-2)] px-2 py-2 text-left hover:text-[var(--dash-text-strong)] disabled:opacity-60">
                            <Magnet className={`h-4 w-4 shrink-0 ${linked ? 'text-cyan-300' : 'text-[var(--dash-muted)]'}`} />
                            <span className="min-w-0 flex-1 truncate">{candidate.name}</span>
                            {linked && <span className="text-[10px] text-cyan-300">Collegato</span>}
                          </button>
                        );
                      })}
                    {mapTokens.every((candidate) => candidate.id === token.id || !candidate.magnetEnabled) && <p className="py-2 text-[var(--dash-muted)]">Attiva la calamita su un altro elemento per collegarlo.</p>}
                  </div>
                </div>
              )}
              {tokenMenu.panel === 'layers' && (
                <div className="mt-3 grid grid-cols-2 gap-1.5 border-t border-[var(--dash-border-soft)] pt-3">
                  <button type="button" onClick={() => moveTokenLayer('forward')} className="flex items-center justify-center gap-1.5 rounded bg-[var(--dash-surface-2)] px-2 py-2 hover:text-[var(--dash-text-strong)]">
                    <ArrowUp className="h-4 w-4" />
                    Porta sopra
                  </button>
                  <button type="button" onClick={() => moveTokenLayer('backward')} className="flex items-center justify-center gap-1.5 rounded bg-[var(--dash-surface-2)] px-2 py-2 hover:text-[var(--dash-text-strong)]">
                    <ArrowDown className="h-4 w-4" />
                    Porta sotto
                  </button>
                  <button type="button" onClick={() => moveTokenLayer('front')} className="flex items-center justify-center gap-1.5 rounded bg-[var(--dash-surface-2)] px-2 py-2 hover:text-[var(--dash-text-strong)]">
                    <ChevronsUp className="h-4 w-4" />
                    In primo piano
                  </button>
                  <button type="button" onClick={() => moveTokenLayer('back')} className="flex items-center justify-center gap-1.5 rounded bg-[var(--dash-surface-2)] px-2 py-2 hover:text-[var(--dash-text-strong)]">
                    <ChevronsDown className="h-4 w-4" />
                    In fondo
                  </button>
                </div>
              )}
            </div>
          );
        })()}
    </div>
  );
}
