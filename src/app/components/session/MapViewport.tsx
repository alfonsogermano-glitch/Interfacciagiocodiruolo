import { Fragment, useEffect, useRef, useState, type FocusEvent as ReactFocusEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent } from 'react';
import { configureSessionMapCenter, configureSessionMapFit, configureSessionMapFogClear, configureSessionMapFogCoverFullMap, configureSessionMapFogSelectionClear, getSessionMapCurrentUserId, hydrateSessionMapFogStyle, setSessionMapCalibrationActive, setSessionMapFogFullMapCovered, setSessionMapSelectionArmed, updateSessionGrid, useActiveSessionMapTool, useSessionMapCalibrationActive, useSessionMapDrawSettings, useSessionMapFogSettings, useSessionMapMeasureMode, useSessionMapMeasurementsVisibleToAll, useSessionMapSelectionArmed, useSessionMapSelectionMode, type SessionMapDrawMode, type SessionMapFitMode, type SessionMapFogMode, type SessionMapTool } from './mapToolStore';
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
import { Accessibility, AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowRight, ArrowUp, BatteryLow, Bed, Biohazard, Bold, ChevronsDown, ChevronsUp, CircleX, ClipboardCopy, ClipboardPaste, CloudFog, EarOff, Eye, EyeOff, Flashlight, Ghost, GripHorizontal, Hand, Heart, HeartCrack, Italic, Layers3, Link, Lock, LockKeyhole, Magnet, Maximize2, Mountain, Orbit, Palette, Pin, ScanEye, Shapes, Skull, Slash, Spline, Star, Strikethrough, Trash2, Type, Underline, Unlock, UserRoundX, X, type LucideIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { Copy } from '../IconeCopia';
import { NoteIconGlyph, NoteIconGrid } from './shared/NoteIconGrid';
import { ContextHint } from './shared/ContextHint';
import { requestSessionNoteOpen } from './sessionNoteBrowserEvents';
import { projectId } from '/utils/supabase/info';

const MIN_SCALE = 0.3;
const MAX_SCALE = 6;
const ZOOM_SENSITIVITY = 0.0008;
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
  panel: 'layers' | 'colors' | 'magnets' | 'conditions' | null;
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
type FogGesture = { pointerId: number; mode: Exclude<SessionMapFogMode, 'grab' | 'quick-select' | 'polygon' | 'cutter'>; start: SessionMapPoint; current: SessionMapPoint; points: SessionMapPoint[] };

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
  onFogChange?: (fogId: string, update: Partial<SessionMapFog>) => void;
  onFogsChange?: (fogIds: string[], update: Partial<SessionMapFog>) => void;
  onFogsMove?: (updates: Record<string, Partial<SessionMapFog>>) => void;
  onFogTransformsChange?: (updates: Record<string, Partial<SessionMapFog>>) => void;
  onFogDelete?: (fogId: string) => void;
  onFogsDelete?: (fogIds: string[]) => void;
  onFogCoverFullMap?: (fog: SessionMapFog) => void;
  onMapPlacementChange?: (placement: MapPlacement) => void;
  onTokenDrop?: (visual: SessionMapTokenVisual, position: TokenPosition, size: number) => void;
  onTokensMove?: (positions: Record<string, TokenPosition>) => void;
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
  return { id: crypto.randomUUID(), kind, operation, x: minX, y: minY, width, height, rotation: 0, points: ['polygon', 'freehand'].includes(kind) ? points.map(point => ({ x: point.x - minX, y: point.y - minY })) : undefined, style: { ...style }, enabled: true, locked: false, magnetEnabled: false, magnetGroupId: null, createdAt: now, updatedAt: now };
}

function fogShape(fog: SessionMapFog, props: Record<string, unknown> = {}) {
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
    const squarePath = lineStyle === 'crosses' ? `M ${center - crossHalf} ${center} H ${center + crossHalf} M ${center} ${center - crossHalf} V ${center + crossHalf}` : lineStyle === 'corners' ? `M 0 0 L ${cornerHalf} ${cornerHalf} M ${size} 0 L ${size - cornerHalf} ${cornerHalf} M 0 ${size} L ${cornerHalf} ${size - cornerHalf} M ${size} ${size} L ${size - cornerHalf} ${size - cornerHalf}` : `M 0 0 H ${size} M 0 0 V ${size}`;
    return (
      <svg data-session-map-grid="square" aria-hidden="true" className="pointer-events-none absolute -left-[20000px] -top-[20000px] z-[2] h-[40000px] w-[40000px]" style={{ color, opacity: settings.opacity }}>
        <defs>
          <pattern id={patternId} x={20000 + (settings.originX ?? 0)} y={20000 + (settings.originY ?? 0)} width={size} height={size} patternUnits="userSpaceOnUse">
            <path d={squarePath} fill="none" stroke="currentColor" strokeWidth="1" {...strokeProps} />
            {lineStyle === 'dotted' && <circle cx="0" cy="0" r="2" fill="currentColor" />}
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
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
    <svg data-session-map-grid={settings.type} aria-hidden="true" className="pointer-events-none absolute -left-[20000px] -top-[20000px] z-[2] h-[40000px] w-[40000px]" style={{ color, opacity: settings.opacity }}>
      <defs>
        <pattern id={patternId} x={20000} y={20000} width={patternWidth} height={patternHeight} patternUnits="userSpaceOnUse">
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
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
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

export function MapViewport({ children, campaignId, mapId, backgroundUrl, isOwner, currentUserId, currentUserAccessToken, mapPlacement, gridSettings, mapTokens = [], mapDrawings = [], mapFog = [], mapPois = [], mapObjectOrder, onPoiCreate, onPoiMove, onPoiChange, onPoiDelete, onPoiDuplicate, onPoiPaste, onPoiLayerMove, onDrawingCreate, onDrawingChange, onDrawingsChange, onDrawingsMove, onDrawingTransformsChange, onDrawingDelete, onDrawingsDelete, onDrawingDuplicate, onDrawingsDuplicate, onDrawingLayerMove, onDrawingsLayerMove, onDrawingsCreateMagnetGroup, onDrawingMagnetDisable, onFogCreate, onFogChange, onFogsChange, onFogsMove, onFogTransformsChange, onFogDelete, onFogsDelete, onFogCoverFullMap, onMapPlacementChange, onTokenDrop, onTokensMove, onTokenLayerMove, onTokensLayerMove, onTokenLockChange, onTokenChange, onTokensChange, onTokenTransformsChange, onTokenDelete, onTokensDelete, onTokensCreateMagnetGroup, onTokenMagnetEnabledChange, onTokenMagnetLink, onTokenMagnetUnlink }: MapViewportProps) {
  const objectOrder = reconcileMapObjectOrder(mapObjectOrder, [['drawing', mapDrawings], ['token', mapTokens], ['poi', mapPois]]);
  const objectZIndex = new globalThis.Map(objectOrder.map((ref, index) => [`${ref.family}\u0000${ref.id}`, index + 3]));
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
  const viewportRef = useRef<HTMLDivElement>(null);
  const tokenGestureRef = useRef<TokenGesture | null>(null);
  const tokenTransformGestureRef = useRef<TokenTransformGesture | null>(null);
  const [tokenDraftPositions, setTokenDraftPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [tokenDraftTransforms, setTokenDraftTransforms] = useState<Record<string, TokenTransform>>({});
  const [transformTokenId, setTransformTokenId] = useState<string | null>(null);
  const [tokenMenu, setTokenMenu] = useState<TokenMenu | null>(null);
  const [poiMenu, setPoiMenu] = useState<{ poiId: string; x: number; y: number; panel: 'icons' | 'notes' | 'layers' | null } | null>(null);
  const [poiNoteOptions, setPoiNoteOptions] = useState<Array<{ id: string; label: string; visibleToPlayers: boolean }>>([]);
  const [poiNotesLoading, setPoiNotesLoading] = useState(false);
  const [poiClipboard, setPoiClipboard] = useState<SessionMapPoi | null>(null);
  const [poiDraftPositions, setPoiDraftPositions] = useState<Record<string, TokenPosition>>({});
  const [poiDraftTransforms, setPoiDraftTransforms] = useState<Record<string, { size: number; rotation: number }>>({});
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
  const [selectedFogIds, setSelectedFogIds] = useState<Set<string>>(() => new Set());
  const quickFogSelectionRef = useRef<{ pointerId: number; ids: Set<string> } | null>(null);
  const [fogSelectionMenu, setFogSelectionMenu] = useState<{ x: number; y: number } | null>(null);
  const [fogMenu, setFogMenu] = useState<{ id: string; x: number; y: number; panel: 'magnets' | null } | null>(null);
  const [fogClipboard, setFogClipboard] = useState<SessionMapFog | null>(null);
  const [pathEditFogId, setPathEditFogId] = useState<string | null>(null);
  const [fogPathDrafts, setFogPathDrafts] = useState<Record<string, SessionMapFog>>({});
  const fogPathPointRef = useRef<{ pointerId: number; fogId: string; pointIndex: number; origin: SessionMapFog; draft: SessionMapFog } | null>(null);
  useEffect(() => {
    if (fogMenu) return;
    fogTooltipHoveredRef.current = null;
    setFogTooltip(null);
  }, [fogMenu]);
  const previousFogModeRef = useRef(fogSettings.mode);
  const lastAppliedFogStyleRevisionRef = useRef(fogSettings.styleRevision);
  const hydratedFogStyleRef = useRef<{ mapId: string; color: string; strokeWidth: number } | null>(null);
  const fogMoveRef = useRef<{ pointerId: number; startX: number; startY: number; origins: Record<string, SessionMapPoint> } | null>(null);
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
  const [pastePrompt, setPastePrompt] = useState<{ x: number; y: number; point: SessionMapPoint; context: 'map' | 'drawing' | 'token' } | null>(null);
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
    try {
      window.localStorage.setItem(`hollowgate.map-view.${mapId}`, JSON.stringify(view));
    } catch {
      /* Pan and zoom still work without storage. */
    }
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
        setDrawingClipboard(null);
        setPoiClipboard(null);
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
    const cancelCopyOnOtherCommand = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest('button');
      if (button && !button.matches('[data-map-copy-action], [data-map-paste-action]')) {
        setDrawingClipboard(null);
        setPastePrompt(null);
      }
    };
    document.addEventListener('keydown', handlePasteShortcut);
    document.addEventListener('pointerdown', cancelCopyOnOtherCommand, true);
    return () => {
      document.removeEventListener('keydown', handlePasteShortcut);
      document.removeEventListener('pointerdown', cancelCopyOnOtherCommand, true);
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
    },
    [],
  );

  useEffect(() => {
    if (!calibrationActive) setCalibrationStart(null);
  }, [calibrationActive]);

  useEffect(() => () => setSessionMapCalibrationActive(false), []);

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
      setView((current) => ({
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
      onFogCoverFullMap({ id: crypto.randomUUID(), kind: 'rectangle', operation: 'cover', x: placement.x, y: placement.y, width, height, rotation: 0, style: { color: fogSettings.color, strokeWidth: fogSettings.strokeWidth }, enabled: true, locked: true, magnetEnabled: false, magnetGroupId: null, fullMap: true, createdAt: now, updatedAt: now });
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
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    setView((current) => {
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
  const showPastePrompt = (clientX: number, clientY: number, context: 'map' | 'drawing' | 'token') => {
    if (!drawingClipboard) return;
    const rect = viewportRef.current?.getBoundingClientRect();
    const point = mapPointFromClient(clientX, clientY);
    if (!rect || !point) return;
    setPastePrompt({ x: clientX - rect.left, y: clientY - rect.top, point, context });
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
        const position = tokenDraftPositions[item.id] ?? item;
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
      setView((current) => ({
        ...current,
        x: pan.originX + deltaX,
        y: pan.originY + deltaY,
      }));
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

  const canControlPoi = (poi: SessionMapPoi) => !poi.pinned && (isOwner || (!poi.locked && !!mapUserId && poi.createdByProfileId === mapUserId));
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
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTokenMenu(null);
    setDrawingMenu(null);
    setPoiMenu({ poiId: poi.id, x: Math.max(8, Math.min(event.clientX - rect.left + 12, rect.width - 398)), y: Math.max(8, Math.min(event.clientY - rect.top, rect.height - 300)), panel: null });
  };

  const openUnderlyingMapObjectMenu = (clientX: number, clientY: number, currentRef?: MapObjectRef) => {
    const point = mapPointFromClient(clientX, clientY);
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!point || !rect) return false;
    const contains = (bounds: { x: number; y: number; width: number; height: number }) => point.x >= bounds.x && point.x <= bounds.x + bounds.width && point.y >= bounds.y && point.y <= bounds.y + bounds.height;
    const candidates = [...objectOrder].reverse().filter((ref) => {
      if (ref.family === 'drawing') {
        const drawing = mapDrawings.find(item => item.id === ref.id);
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
    const x = Math.max(8, clientX - rect.left + 12);
    const y = Math.max(8, clientY - rect.top);
    setTokenMenu(null); setDrawingMenu(null); setPoiMenu(null);
    if (target.family === 'drawing') {
      if (!selectedDrawingIds.has(target.id)) setSelectedDrawingIds(new Set([target.id]));
      setSelectedDrawingId(target.id);
      setDrawingStyleEditorOpen(false); setDrawingLayerPanelOpen(false); setDrawingMenu({ id: target.id, x, y });
    } else if (target.family === 'token') {
      const token = mapTokens.find(item => item.id === target.id);
      if (token) setTokenMenu({ tokenId: token.id, x: Math.min(rect.width - 398, x), y, panel: null, nameDraft: token.name, customConditionDraft: '' });
    } else setPoiMenu({ poiId: target.id, x: Math.min(rect.width - 398, x), y, panel: null });
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
        const token = mapTokens.find(item => item.id === ref.id);
        const position = token ? tokenDraftTransforms[token.id] ?? tokenDraftPositions[token.id] ?? token : null;
        const size = tokenDraftTransforms[ref.id]?.size ?? (token ? getTokenSize(token, gridSettings.cellSize) : 0);
        if (token && position && contains({ x: position.x, y: position.y, width: size, height: size })) keys.add(`token\u0000${token.id}`);
      } else {
        const poi = mapPois.find(item => item.id === ref.id);
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

  const fogOperation = fogSettings.mode === 'cutter' ? 'reveal' : fogSettings.operation;
  const fogStyle = { color: fogSettings.color, strokeWidth: fogSettings.strokeWidth };
  const fogFromGesture = (gesture: FogGesture) => {
    const points = gesture.mode === 'freehand' ? gesture.points : [gesture.start, gesture.current];
    return buildFog(gesture.mode, points, fogOperation, fogStyle);
  };
  const beginFog = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isOwner || activeTool !== 'fog' || event.button !== 0 || (event.target as Element).closest('[data-map-interactive]')) return false;
    const point = worldPoint(event);
    if (!point) return false;
    if (fogSettings.mode === 'grab' || fogSettings.mode === 'quick-select') return true;
    setSelectedFogIds(new Set());
    setFogSelectionMenu(null);
    setFogMenu(null);
    if (fogSettings.mode === 'polygon' || fogSettings.mode === 'cutter') {
      event.preventDefault();
      const close = fogPolygonPoints.length >= 3 && Math.hypot(point.x - fogPolygonPoints[0].x, point.y - fogPolygonPoints[0].y) <= 14 / view.scale;
      if (close) {
        const fog = buildFog('polygon', fogPolygonPoints, fogOperation, fogStyle);
        if (fog) onFogCreate?.(fog);
        setFogPolygonPoints([]); setFogPolygonHover(null);
      } else setFogPolygonPoints(current => [...current, point]);
      return true;
    }
    const gesture: FogGesture = { pointerId: event.pointerId, mode: fogSettings.mode, start: point, current: point, points: [point] };
    fogGestureRef.current = gesture;
    setFogDraft(fogFromGesture(gesture));
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    return true;
  };
  const moveFog = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = fogGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) {
      if (activeTool === 'fog' && (fogSettings.mode === 'polygon' || fogSettings.mode === 'cutter')) setFogPolygonHover(worldPoint(event));
      return false;
    }
    const point = worldPoint(event);
    if (!point) return true;
    gesture.current = point;
    if (gesture.mode === 'freehand' && Math.hypot(point.x - gesture.points.at(-1)!.x, point.y - gesture.points.at(-1)!.y) >= 2 / view.scale) gesture.points.push(point);
    setFogDraft(fogFromGesture(gesture));
    return true;
  };
  const finishFog = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = fogGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return false;
    const fog = fogFromGesture(gesture);
    if (fog) onFogCreate?.(fog);
    fogGestureRef.current = null;
    setFogDraft(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    return true;
  };
  const beginFogMove = (event: ReactPointerEvent<SVGElement>, fog: SessionMapFog) => {
    if (!isOwner || fog.locked || activeTool !== 'fog' || fogSettings.mode !== 'grab' || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    const selectedIds = selectedFogIds.has(fog.id) ? [...selectedFogIds] : [fog.id];
    const selectedGroups = new Set(mapFog.filter(item => selectedIds.includes(item.id) && item.magnetGroupId).map(item => item.magnetGroupId));
    const ids = mapFog.filter(item => !item.locked && (selectedIds.includes(item.id) || item.magnetGroupId && selectedGroups.has(item.magnetGroupId))).map(item => item.id);
    setSelectedFogIds(new Set(ids));
    fogMoveRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, origins: Object.fromEntries(mapFog.filter(item => ids.includes(item.id)).map(item => [item.id, { x: item.x, y: item.y }])) };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const openFogMenu = (event: ReactMouseEvent<SVGElement>, fog: SessionMapFog) => {
    if (!isOwner) return;
    event.preventDefault(); event.stopPropagation();
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    setSelectedFogIds(new Set([fog.id]));
    setFogSelectionMenu(null); setTokenMenu(null); setDrawingMenu(null); setPoiMenu(null);
    setFogMenu({ id: fog.id, x: Math.max(8, Math.min(event.clientX - rect.left + 12, rect.width - 350)), y: Math.max(8, Math.min(event.clientY - rect.top, rect.height - 260)), panel: null });
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
    gesture.draft = { ...gesture.origin, points };
    setFogPathDrafts(current => ({ ...current, [gesture.fogId]: gesture.draft }));
  };
  const finishFogPathPointMove = (event: ReactPointerEvent<SVGCircleElement>) => {
    const gesture = fogPathPointRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    onFogChange?.(gesture.fogId, { points: gesture.draft.points });
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
      if (fog.fullMap) return;
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
    const dx = (event.clientX - gesture.startX) / view.scale;
    const dy = (event.clientY - gesture.startY) / view.scale;
    setFogMoveDrafts(Object.fromEntries(Object.entries(gesture.origins).map(([id, origin]) => [id, { x: origin.x + dx, y: origin.y + dy }])));
    gesture.startX = event.clientX; gesture.startY = event.clientY;
    gesture.origins = Object.fromEntries(Object.entries(gesture.origins).map(([id, origin]) => [id, { x: origin.x + dx, y: origin.y + dy }]));
  };
  const finishSelectedFog = (event: ReactPointerEvent<SVGElement>) => {
    const gesture = fogMoveRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    onFogsMove?.(Object.fromEntries(Object.entries(gesture.origins).map(([id, position]) => [id, position])));
    setFogMoveDrafts({});
    fogMoveRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
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
      const x = anchorWorld.x - width / 2 - (draftOffset.x * Math.cos(rotation) - draftOffset.y * Math.sin(rotation));
      const y = anchorWorld.y - height / 2 - (draftOffset.x * Math.sin(rotation) + draftOffset.y * Math.cos(rotation));
      gesture.draft = { ...gesture.origin, x, y, width, height, points: gesture.origin.points?.map(point => ({ x: point.x * width / gesture.origin.width, y: point.y * height / gesture.origin.height })) };
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
      if (event.key === 'Escape') { setFogPolygonPoints([]); setFogPolygonHover(null); setFogDraft(null); setSelectedFogIds(new Set()); }
      if (event.key === 'Enter' && fogPolygonPoints.length >= 3) {
        const fog = buildFog('polygon', fogPolygonPoints, fogOperation, fogStyle);
        if (fog) onFogCreate?.(fog);
        setFogPolygonPoints([]); setFogPolygonHover(null);
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedFogIds.size > 0 && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault(); onFogsDelete?.([...selectedFogIds]); setSelectedFogIds(new Set());
      }
    };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [fogOperation, fogPolygonPoints, fogSettings.color, fogSettings.strokeWidth, onFogCreate, onFogsDelete, selectedFogIds]);
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
    if (activeTool === 'pin' && event.button === 0 && !target.closest('[data-map-interactive]')) {
      const point = worldPoint(event);
      if (point) onPoiCreate?.(point);
      event.preventDefault();
      return;
    }
    if (!captureCalibrationPoint(event) && !beginVisualMeasurement(event) && !beginDrawing(event) && !beginFog(event) && !beginSelection(event)) beginPan(event);
  };
  const handleViewportPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
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
        const tokenPosition = tokenDraftPositions[linkedToken.id] ?? linkedToken;
        const tokenBounds = getTokenBounds(linkedToken, gridSettings.cellSize, tokenPosition);
        mapTokens.slice(tokenIndex + 1).forEach((candidate) => {
          const position = tokenDraftPositions[candidate.id] ?? candidate;
          if (canMoveToken(candidate) && isBoundsFullyContained(getTokenBounds(candidate, gridSettings.cellSize, position), tokenBounds)) movingIds.add(candidate.id);
        });
      });
    const movingTokens = mapTokens.filter((candidate) => movingIds.has(candidate.id));
    const origins = Object.fromEntries(
      movingTokens.map((candidate) => {
        const position = tokenDraftPositions[candidate.id] ?? candidate;
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
  };

  const finishTokenMove = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = tokenGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    tokenGestureRef.current = null;
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
    const position = tokenDraftTransforms[token.id] ?? tokenDraftPositions[token.id] ?? token;
    const size = tokenDraftTransforms[token.id]?.size ?? getTokenSize(token, gridSettings.cellSize);
    const rotation = tokenDraftTransforms[token.id]?.rotation ?? token.rotation ?? 0;
    const angle = (rotation * Math.PI) / 180;
    const boundsSize = size * (Math.abs(Math.cos(angle)) + Math.abs(Math.sin(angle)));
    const boundsX = position.x + (size - boundsSize) / 2;
    const boundsY = position.y + (size - boundsSize) / 2;
    const tokenLeft = view.x + boundsX * view.scale;
    const tokenRight = view.x + (boundsX + boundsSize) * view.scale;
    const preferredX = tokenRight + 12;
    const x = preferredX + 398 <= viewport.clientWidth ? preferredX : Math.max(8, tokenLeft - 398 - 12);
    const y = Math.max(8, Math.min(view.y + boundsY * view.scale, viewport.clientHeight - 300));
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
      onPointerDownCapture={beginDepthSelectedMove}
      onPointerDown={handleViewportPointerDown}
      onPointerMove={(event) => {
        lastMapPointerRef.current = { clientX: event.clientX, clientY: event.clientY };
        updateDepthHover(event.clientX, event.clientY);
        handleViewportPointerMove(event);
      }}
      onPointerUp={handleViewportPointerUp}
      onContextMenu={(event) => {
        if (isOwner && activeTool === 'fog') {
          const point = mapPointFromClient(event.clientX, event.clientY);
          const fog = point ? [...mapFog].reverse().find(item => !item.fullMap && fogContainsPoint(fogPathDrafts[item.id] ?? fogTransformDrafts[item.id] ?? { ...item, ...(fogMoveDrafts[item.id] ?? {}) }, point)) : null;
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
        if (drawingClipboard) {
          event.preventDefault();
          showPastePrompt(event.clientX, event.clientY, 'map');
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
      {backgroundUrl && <div aria-hidden="true" className="pointer-events-none absolute -inset-8 bg-cover bg-center opacity-30 blur-2xl saturate-75" style={{ backgroundImage: `url(${JSON.stringify(backgroundUrl)})` }} />}
      <div
        data-map-transform
        className={`relative w-full origin-top-left select-none [backface-visibility:hidden] [transform-style:preserve-3d] ${panning ? '' : 'transition-transform duration-150 ease-out'}`}
        style={{
          transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`,
          willChange: 'transform',
        }}
      >
        <div
          ref={placementElementRef}
          data-map-placement
          data-map-movable={isOwner && !mapPlacement.locked ? 'true' : 'false'}
          className={`${placement.width ? '' : 'w-full'} [backface-visibility:hidden]`}
          style={{
            width: placement.width,
            height: placement.height,
            transform: `translate3d(${placement.x}px, ${placement.y}px, 0)`,
            willChange: 'transform',
          }}
        >
          {children}
        </div>
        <CanvasGrid settings={gridSettings} patternId={`canvas-grid-${mapId.replace(/[^a-zA-Z0-9_-]/g, '')}`} />
        <div data-session-map-drawings className="pointer-events-none absolute inset-0">
          {mapDrawings.map((drawing) => {
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
                  const rect = viewportRef.current?.getBoundingClientRect();
                  if (rect) {
                    const x = event.clientX - rect.left;
                    const y = event.clientY - rect.top;
                    setDrawingMenu({ id: drawing.id, x, y });
                    const selectedToken = mapTokens.find((token) => selectedTokenIds.has(token.id));
                    if (selectedToken)
                      setTokenMenu({
                        tokenId: selectedToken.id,
                        x: Math.min(rect.width - 398, x + 402),
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
                      <circle key={`path-point-${index}`} role="slider" aria-label={`Nodo tracciato ${index + 1}`} tabIndex={0} className="pointer-events-auto cursor-move" cx={point.x} cy={point.y} r={6 / view.scale} fill="#1f2937" stroke="#fb923c" strokeWidth={2 / view.scale} vectorEffect="non-scaling-stroke" onPointerDown={(event) => beginPathPointMove(event, rendered, index)} onPointerMove={movePathPoint} onPointerUp={finishPathPointMove} onPointerCancel={finishPathPointMove} />
                    ))}
                  </g>
                )}
                {selectedDrawingId === drawing.id && (
                  <g>
                    <rect x={drawing.kind === 'text' ? 0 : -4 / view.scale} y={drawing.kind === 'text' ? 0 : -4 / view.scale} width={drawing.kind === 'text' ? rendered.width : rendered.width + 8 / view.scale} height={drawing.kind === 'text' ? rendered.height : rendered.height + 8 / view.scale} fill="none" stroke="#67e8f9" strokeWidth={1.5 / view.scale} strokeDasharray={`${5 / view.scale} ${3 / view.scale}`} vectorEffect="non-scaling-stroke" />
                    {isOwner &&
                      !drawing.pinned &&
                      (
                        [
                          ['nw', 0, 0],
                          ['ne', rendered.width, 0],
                          ['sw', 0, rendered.height],
                          ['se', rendered.width, rendered.height],
                        ] as const
                      ).map(([corner, x, y]) => <rect key={corner} className="pointer-events-auto cursor-nwse-resize" x={x - 5 / view.scale} y={y - 5 / view.scale} width={10 / view.scale} height={10 / view.scale} fill="white" stroke="#06b6d4" strokeWidth={1.5 / view.scale} onPointerDown={(event) => beginDrawingTransform(event, drawing, 'resize', corner)} onPointerMove={moveDrawingTransform} onPointerUp={finishDrawingTransform} onPointerCancel={finishDrawingTransform} />)}
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
              return <line x1={source.x + source.width / 2} y1={source.y + source.height / 2} x2={drawingMagnetLink.pointer.x} y2={drawingMagnetLink.pointer.y} stroke="#67e8f9" strokeWidth={2 / view.scale} strokeDasharray={`${7 / view.scale} ${5 / view.scale}`} vectorEffect="non-scaling-stroke" />;
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
              <polyline points={[...polygonPoints, polygonHover ?? polygonPoints[polygonPoints.length - 1]].map((point) => `${point.x},${point.y}`).join(' ')} fill={drawSettings.style.fillColor} fillOpacity={drawSettings.style.fillOpacity} stroke={drawSettings.style.strokeColor} strokeWidth={drawSettings.style.strokeWidth} strokeDasharray="6 4" />
              {polygonPoints.map((point, index) => (
                <circle key={index} cx={point.x} cy={point.y} r={(index === 0 && polygonPoints.length >= 3 ? 8 : 5) / view.scale} fill={index === 0 && polygonPoints.length >= 3 ? '#22c55e' : '#f8fafc'} stroke="#0f172a" strokeWidth={2 / view.scale} />
              ))}
            </g>
          )}
          {lineStart && lineHover && <line x1={lineStart.x} y1={lineStart.y} x2={lineHover.x} y2={lineHover.y} stroke={drawSettings.style.strokeColor} strokeWidth={drawSettings.style.strokeWidth} strokeDasharray="6 4" strokeLinecap="round" />}
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
          {mapPois.map((poi) => {
            const position = poiDraftPositions[poi.id] ?? poi;
            const transform = poiDraftTransforms[poi.id];
            const size = Math.max(8, transform?.size ?? poi.size);
            const rotation = transform?.rotation ?? poi.rotation ?? 0;
            const handleSize = Math.min(12, Math.max(6, size * view.scale * 0.14)) / view.scale;
            const rotationHandleSize = Math.min(16, Math.max(8, size * view.scale * 0.18)) / view.scale;
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
                          <rect x={0} y={0} width={size} height={size} fill="none" stroke="#67e8f9" strokeWidth={1.5 / view.scale} strokeDasharray={`${5 / view.scale} ${3 / view.scale}`} vectorEffect="non-scaling-stroke" />
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
          {mapTokens.map((token) => {
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
        <svg data-session-map-fog className="pointer-events-none absolute inset-0 z-[9000] h-full w-full overflow-visible">
          <defs>
            {mapFog.map((fog, index) => {
              if (fog.operation !== 'cover' || fog.enabled === false) return null;
              const position = fogMoveDrafts[fog.id] ?? fog;
              const rendered = fogPathDrafts[fog.id] ?? fogTransformDrafts[fog.id] ?? { ...fog, ...position };
              return <mask key={fog.id} id={`session-fog-${mapId.replace(/[^a-zA-Z0-9_-]/g, '')}-${index}`} maskUnits="userSpaceOnUse" x="-100000" y="-100000" width="200000" height="200000">
                <rect x="-100000" y="-100000" width="200000" height="200000" fill="black" />
                <g transform={`translate(${rendered.x} ${rendered.y}) rotate(${rendered.rotation} ${rendered.width / 2} ${rendered.height / 2})`}>{fogShape(rendered, { fill: 'white' })}</g>
                {mapFog.slice(index + 1).filter(item => item.operation === 'reveal' && item.enabled !== false).map(item => {
                  const revealPosition = fogMoveDrafts[item.id] ?? item;
                  const reveal = fogPathDrafts[item.id] ?? fogTransformDrafts[item.id] ?? { ...item, ...revealPosition };
                  return <g key={item.id} transform={`translate(${reveal.x} ${reveal.y}) rotate(${reveal.rotation} ${reveal.width / 2} ${reveal.height / 2})`}>{fogShape(reveal, { fill: 'black' })}</g>;
                })}
              </mask>;
            })}
          </defs>
          {mapFog.map((fog, index) => fog.operation === 'cover' && fog.enabled !== false ? <rect key={fog.id} x="-100000" y="-100000" width="200000" height="200000" fill={fog.style.color} opacity={isOwner && !fogSettings.previewAsPlayer ? 0.38 : 1} mask={`url(#session-fog-${mapId.replace(/[^a-zA-Z0-9_-]/g, '')}-${index})`} /> : null)}
          {isOwner && mapFog.map((fog) => {
            if (fog.fullMap) return null;
            const position = fogMoveDrafts[fog.id] ?? fog;
            const rendered = fogPathDrafts[fog.id] ?? fogTransformDrafts[fog.id] ?? { ...fog, ...position };
            const selected = selectedFogIds.has(fog.id);
            return <g key={`edit-${fog.id}`} data-map-interactive transform={`translate(${rendered.x} ${rendered.y}) rotate(${rendered.rotation} ${rendered.width / 2} ${rendered.height / 2})`} opacity={rendered.enabled === false ? 0.45 : 1} className={activeTool === 'fog' && ['grab', 'quick-select'].includes(fogSettings.mode) ? `pointer-events-auto ${rendered.locked ? 'cursor-not-allowed' : 'cursor-grab'}` : 'pointer-events-none'} onContextMenu={event => openFogMenu(event, rendered)} onPointerDown={(event) => {
              if (beginQuickFogSelection(event, fog)) return;
              beginFogMove(event, fog);
            }} onPointerMove={moveSelectedFog} onPointerUp={finishSelectedFog} onPointerCancel={finishSelectedFog}>
              {fogShape(rendered, { fill: 'transparent', stroke: rendered.operation === 'reveal' ? '#fb923c' : rendered.style.color, strokeWidth: rendered.style.strokeWidth / view.scale, vectorEffect: 'non-scaling-stroke' })}
              {selected && !rendered.locked && <>
                <rect x={-5 / view.scale} y={-5 / view.scale} width={rendered.width + 10 / view.scale} height={rendered.height + 10 / view.scale} fill="none" stroke="#fbbf24" strokeWidth={1.5 / view.scale} />
                {([['nw', 0, 0, 'cursor-nwse-resize'], ['n', rendered.width / 2, 0, 'cursor-ns-resize'], ['ne', rendered.width, 0, 'cursor-nesw-resize'], ['e', rendered.width, rendered.height / 2, 'cursor-ew-resize'], ['se', rendered.width, rendered.height, 'cursor-nwse-resize'], ['s', rendered.width / 2, rendered.height, 'cursor-ns-resize'], ['sw', 0, rendered.height, 'cursor-nesw-resize'], ['w', 0, rendered.height / 2, 'cursor-ew-resize']] as const).map(([handle, x, y, cursor]) => <rect key={handle} className={`pointer-events-auto ${cursor}`} x={x - 5 / view.scale} y={y - 5 / view.scale} width={10 / view.scale} height={10 / view.scale} fill="white" stroke="#fbbf24" strokeWidth={1.5 / view.scale} onPointerDown={event => beginFogTransform(event, rendered, 'resize', handle)} onPointerMove={moveFogTransform} onPointerUp={finishFogTransform} onPointerCancel={finishFogTransform} />)}
                <path d={`M ${rendered.width / 2} 0 V ${-28 / view.scale}`} stroke="#fbbf24" strokeWidth={1.5 / view.scale} />
                <circle className="pointer-events-auto cursor-grab" cx={rendered.width / 2} cy={-28 / view.scale} r={6 / view.scale} fill="#fbbf24" stroke="white" strokeWidth={1.5 / view.scale} onPointerDown={event => beginFogTransform(event, rendered, 'rotate')} onPointerMove={moveFogTransform} onPointerUp={finishFogTransform} onPointerCancel={finishFogTransform} />
              </>}
              {pathEditFogId === rendered.id && rendered.points?.map((point, pointIndex) => <circle key={pointIndex} className="pointer-events-auto cursor-move" cx={point.x} cy={point.y} r={5 / view.scale} fill="#fbbf24" stroke="white" strokeWidth={1.5 / view.scale} onPointerDown={event => beginFogPathPointMove(event, rendered, pointIndex)} onPointerMove={moveFogPathPoint} onPointerUp={finishFogPathPointMove} onPointerCancel={finishFogPathPointMove} />)}
            </g>;
          })}
          {isOwner && fogDraft && <g transform={`translate(${fogDraft.x} ${fogDraft.y})`}>{fogShape(fogDraft, { fill: fogDraft.style.color, fillOpacity: 0.38, stroke: fogDraft.style.color, strokeWidth: fogDraft.style.strokeWidth / view.scale })}</g>}
          {isOwner && fogPolygonPoints.length > 0 && <polygon points={[...fogPolygonPoints, ...(fogPolygonHover ? [fogPolygonHover] : [])].map(point => `${point.x},${point.y}`).join(' ')} fill={fogSettings.color} fillOpacity={fogPolygonPoints.length >= 3 ? 0.38 : 0} stroke={fogSettings.color} strokeWidth={fogSettings.strokeWidth / view.scale} />}
        </svg>
      </div>
      {depthHoveredKeys.size > 1 && (
        <div className="pointer-events-none absolute right-4 top-4 z-[10000] flex justify-end">
          <ContextHint>
            <strong>Oggetti sovrapposti:</strong> Ogni click destro del mouse seleziona un nuovo oggetto. E' possibile spostare quello evidenziato in giallo.
          </ContextHint>
        </div>
      )}
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
        return <div data-map-interactive role="menu" aria-label="Azioni figura nebbia" className="absolute z-50 w-[min(92vw,342px)] rounded-xl border border-[var(--dash-border)] bg-[var(--dash-panel)]/95 p-3 text-xs text-[var(--dash-text)] shadow-2xl backdrop-blur" style={{ left: fogMenu.x, top: fogMenu.y }} onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}>
          <div className="mb-3 flex items-center justify-between gap-2 border-b border-[var(--dash-border-soft)] pb-2 font-semibold text-[var(--dash-text-strong)]"><span>Figura Nebbia</span><div className="flex items-center gap-2">{fog.locked && <Lock data-static-icon className="h-4 w-4 text-amber-300" />}<button type="button" aria-label="Sposta menu Nebbia" onPointerDown={event => beginMenuDrag(event, 'fog', fogMenu)} onPointerMove={moveMenuDrag} onPointerUp={finishMenuDrag} onPointerCancel={finishMenuDrag} className="cursor-move touch-none rounded p-1 text-[var(--dash-muted)] hover:bg-white/10 hover:text-[var(--dash-text-strong)]"><GripHorizontal data-static-icon className="h-4 w-4" /></button></div></div>
          <div className="mb-3 grid grid-cols-[repeat(7,40px)] gap-1.5">
            {iconAction(fog.enabled === false ? 'Attiva nebbia' : 'Disattiva nebbia', fog.enabled === false ? <span className="relative grid h-5 w-5 place-items-center"><CloudFog data-static-icon className="h-5 w-5" /><Slash data-static-icon className="absolute h-6 w-6 text-red-300" /></span> : <CloudFog data-static-icon className="h-5 w-5" />, () => onFogChange?.(fog.id, { enabled: fog.enabled === false }), false, false, true)}
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
                {iconAction('Luce disponibile con la nebbia di gioco', <Flashlight data-static-icon className="h-5 w-5" />, () => {}, true)}
                {iconAction('Ridimensiona PDI', <Maximize2 data-static-icon className="h-5 w-5" />, () => { setTransformPoiId(poi.id); setPoiMenu(null); })}
                {iconAction('Duplica PDI', <Copy data-static-icon className="h-5 w-5" />, () => { onPoiDuplicate?.(poi.id); setPoiMenu(null); })}
                {iconAction('Copia PDI', <ClipboardCopy data-static-icon className="h-5 w-5" />, () => { setDrawingClipboard(null); setPoiClipboard(structuredClone(poi)); setPoiMenu(null); })}
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
      {drawingClipboard &&
        pastePrompt &&
        (() => {
          const viewportWidth = viewportRef.current?.clientWidth ?? 0;
          const drawingMenuWidth = Math.max(160, Math.min(drawingStyleEditorOpen ? 390 : 460, viewportWidth - 16));
          const drawingMenuX = drawingMenu ? Math.max(8, Math.min(drawingMenu.x, Math.max(8, viewportWidth - drawingMenuWidth - 8))) : 0;
          const anchor = pastePrompt.context === 'token' && tokenMenu ? { x: tokenMenu.x, y: tokenMenu.y } : pastePrompt.context === 'drawing' && drawingMenu ? { x: drawingMenuX, y: drawingMenu.y } : { x: pastePrompt.x, y: pastePrompt.y };
          const left = Math.max(8, Math.min(anchor.x, Math.max(8, viewportWidth - 44)));
          const top = Math.max(8, anchor.y - 46);
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  data-map-interactive
                  data-map-paste-action
                  type="button"
                  aria-label="Incolla figura"
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    event.preventDefault();
                    event.stopPropagation();
                    event.nativeEvent.stopImmediatePropagation();
                    pasteDrawingAt(pastePrompt.point);
                  }}
                  className="absolute z-[70] grid h-9 w-9 place-items-center rounded-lg border border-[var(--dash-border)] bg-[var(--dash-panel)] text-[var(--dash-text-strong)] shadow-2xl hover:bg-[var(--dash-surface-2)]"
                  style={{ left, top }}
                >
                  <ClipboardCopy data-static-icon className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Incolla</TooltipContent>
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
                        setDrawingClipboard(structuredClone(drawing));
                        setPastePrompt(null);
                        setDrawingTooltip(null);
                        setDrawingMenu(null);
                      }}
                      className={`${drawingIconClass} ${drawingClipboard?.id === drawing.id ? 'bg-cyan-400/20 text-cyan-200' : ''}`}
                    >
                      <ClipboardPaste data-static-icon className="h-5 w-5" />
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
                  'Illuminazione: disponibile con la nebbia',
                  <button type="button" disabled aria-label="Illuminazione non ancora disponibile" className={iconClass}>
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
