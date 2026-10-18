import { Fragment, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent } from 'react';
import { configureSessionMapCenter, configureSessionMapFit, setSessionMapCalibrationActive, setSessionMapSelectionArmed, updateSessionGrid, useActiveSessionMapTool, useSessionMapCalibrationActive, useSessionMapMeasureMode, useSessionMapMeasurementsVisibleToAll, useSessionMapSelectionArmed, useSessionMapSelectionMode, type SessionMapFitMode, type SessionMapTool } from './mapToolStore';
import { useCampaignChannel } from '../../../services/realtime/campaignChannel';
import type { SessionGridSettings } from '../../../types/mapGeometry';
import { snapToSessionGrid, type GridObjectSize } from './mapGridSnap';
import type { SessionMapToken, SessionMapTokenCondition, SessionMapTokenVisual } from '../../../types/sessionMapToken';
import { registerSessionMapTokenDropHandler } from './sessionMapTokenDropStore';
import { TokenGhostShape } from '../shared/TokenGhostShape';
import { MARGIN_SCALE } from '../shared/tokenShapes';
import { getRotatedSquareBounds, isBoundsFullyContained, polygonCoverage, rectangleCoverage, type MapLayerMove } from './mapObjectLayers';
import { Accessibility, ArrowDown, ArrowUp, BatteryLow, Bed, Biohazard, ChevronsDown, ChevronsUp, CircleX, EarOff, Eye, EyeOff, Flashlight, Ghost, Hand, Heart, HeartCrack, Layers3, Lock, LockKeyhole, Magnet, Maximize2, Mountain, Orbit, Palette, ScanEye, Skull, Star, Trash2, Unlock, UserRoundX, X, type LucideIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

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
export type MapPlacement = { x: number; y: number; locked: boolean; width?: number; height?: number };
type PanGesture = { pointerId: number; target: 'view' | 'map'; startX: number; startY: number; originX: number; originY: number; objectSize: GridObjectSize };
type TokenPosition = { x: number; y: number };
type TokenGesture = { pointerId: number; tokenId: string; startX: number; startY: number; origins: Record<string, TokenPosition>; positions: Record<string, TokenPosition> };
type TokenMenu = { tokenId: string; x: number; y: number; panel: 'layers' | 'colors' | 'magnets' | 'conditions' | null; nameDraft: string; customConditionDraft: string };
type TokenTransform = TokenPosition & { size: number; rotation: number };
type TokenTransformGesture = { pointerId: number; tokenId: string; kind: 'resize' | 'rotate'; centerClientX: number; centerClientY: number; startDistance: number; startAngle: number; origins: Record<string, TokenTransform>; drafts: Record<string, TokenTransform> };
type SelectionPoint = { x: number; y: number };
type SelectionGesture = { pointerId: number; mode: 'rectangle' | 'freehand'; start: SelectionPoint; current: SelectionPoint; points: SelectionPoint[] };
type VisualMeasurement = { id: string; pointerId: number; mode: 'line' | 'circle' | 'cone'; start: SelectionPoint; end: SelectionPoint; fading?: boolean };

interface MapViewportProps {
  campaignId?: string;
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

function MeasurementGraphic({ measurement, view, gridSettings }: { measurement: VisualMeasurement; view: ViewTransform; gridSettings: SessionGridSettings }) {
  const length = Math.hypot(measurement.end.x - measurement.start.x, measurement.end.y - measurement.start.y);
  const distance = length / Math.max(1, gridSettings.cellSize) * gridSettings.distance;
  const label = `${new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 }).format(distance)} ${gridSettings.unit}`;
  const perpendicular = length > 0 ? { x: -(measurement.end.y - measurement.start.y) / length, y: (measurement.end.x - measurement.start.x) / length } : { x: 0, y: 0 };
  const corners = [
    { x: measurement.end.x + perpendicular.x * length / 2, y: measurement.end.y + perpendicular.y * length / 2 },
    { x: measurement.end.x - perpendicular.x * length / 2, y: measurement.end.y - perpendicular.y * length / 2 },
  ];
  return <div aria-hidden="true" className={`pointer-events-none absolute inset-0 z-[21] overflow-visible transition-opacity duration-500 ${measurement.fading ? 'opacity-0' : 'opacity-100'}`}>
    <svg className="absolute inset-0 h-full w-full overflow-visible">
      {measurement.mode === 'circle' && <><circle cx={measurement.start.x} cy={measurement.start.y} r={length} fill="rgba(34,211,238,0.12)" stroke="rgba(3,7,18,0.95)" strokeWidth={7 / view.scale} /><circle cx={measurement.start.x} cy={measurement.start.y} r={length} fill="none" stroke="#22d3ee" strokeWidth={3 / view.scale} /></>}
      {measurement.mode === 'cone' && <><polygon points={`${measurement.start.x},${measurement.start.y} ${corners[0].x},${corners[0].y} ${corners[1].x},${corners[1].y}`} fill="rgba(34,211,238,0.12)" stroke="rgba(3,7,18,0.95)" strokeWidth={7 / view.scale} strokeLinejoin="round" /><polygon points={`${measurement.start.x},${measurement.start.y} ${corners[0].x},${corners[0].y} ${corners[1].x},${corners[1].y}`} fill="none" stroke="#22d3ee" strokeWidth={3 / view.scale} strokeLinejoin="round" /></>}
      <line x1={measurement.start.x} y1={measurement.start.y} x2={measurement.end.x} y2={measurement.end.y} stroke="rgba(3,7,18,0.95)" strokeWidth={measurement.mode === 'line' ? 7 / view.scale : 4 / view.scale} strokeLinecap="round" />
      <line x1={measurement.start.x} y1={measurement.start.y} x2={measurement.end.x} y2={measurement.end.y} stroke="#22d3ee" strokeWidth={measurement.mode === 'line' ? 3 / view.scale : 1.5 / view.scale} strokeLinecap="round" />
      <circle cx={measurement.start.x} cy={measurement.start.y} r={5 / view.scale} fill="#22d3ee" stroke="rgba(3,7,18,0.95)" strokeWidth={2 / view.scale} />
      <circle cx={measurement.end.x} cy={measurement.end.y} r={5 / view.scale} fill="#f8fafc" stroke="rgba(3,7,18,0.95)" strokeWidth={2 / view.scale} />
    </svg>
    <span className="absolute whitespace-nowrap rounded-md border border-cyan-300/60 bg-slate-950/90 px-2 py-1 font-semibold text-cyan-100 shadow-lg" style={{ left: measurement.end.x, top: measurement.end.y, fontSize: 12 / view.scale, transform: `translate(${10 / view.scale}px, ${-34 / view.scale}px)` }}>{label}</span>
  </div>;
}

const tokenFallback = <img src="/icon-source-1024.png" alt="" draggable={false} className="h-full w-full object-contain" style={{ filter: 'invert(1)', opacity: 0.9 }} />;
const TOKEN_LABEL_COLORS = ['#111827', '#374151', '#7f1d1d', '#b91c1c', '#9a3412', '#92400e', '#854d0e', '#166534', '#15803d', '#155e75', '#0e7490', '#1e40af', '#4338ca', '#6b21a8', '#9d174d', '#be185d'];
const STANDARD_TOKEN_CONDITIONS: { key: string; name: string; icon: LucideIcon }[] = [
  { key: 'blinded', name: 'Accecato', icon: EyeOff }, { key: 'charmed', name: 'Affascinato', icon: Heart },
  { key: 'grappled', name: 'Afferrato', icon: Hand }, { key: 'deafened', name: 'Assordato', icon: EarOff },
  { key: 'poisoned', name: 'Avvelenato', icon: Biohazard }, { key: 'exhausted', name: 'Esausto', icon: BatteryLow },
  { key: 'incapacitated', name: 'Incapacitato', icon: UserRoundX }, { key: 'invisible', name: 'Invisibile', icon: ScanEye },
  { key: 'dead', name: 'Morte', icon: Skull }, { key: 'paralyzed', name: 'Paralizzato', icon: Accessibility },
  { key: 'petrified', name: 'Pietrificato', icon: Mountain }, { key: 'unconscious', name: 'Privo di sensi', icon: CircleX },
  { key: 'prone', name: 'Prono', icon: Bed }, { key: 'bloodied', name: 'Sanguinante', icon: HeartCrack },
  { key: 'frightened', name: 'Spaventato', icon: Ghost }, { key: 'stunned', name: 'Stordito', icon: Orbit },
  { key: 'restrained', name: 'Trattenuto', icon: LockKeyhole },
];

function getTokenConditionIcon(condition: SessionMapTokenCondition): LucideIcon {
  return STANDARD_TOKEN_CONDITIONS.find(item => item.key === condition.standardKey)?.icon ?? Star;
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
    const squarePath = lineStyle === 'crosses'
      ? `M ${center - crossHalf} ${center} H ${center + crossHalf} M ${center} ${center - crossHalf} V ${center + crossHalf}`
      : lineStyle === 'corners'
        ? `M 0 0 L ${cornerHalf} ${cornerHalf} M ${size} 0 L ${size - cornerHalf} ${cornerHalf} M 0 ${size} L ${cornerHalf} ${size - cornerHalf} M ${size} ${size} L ${size - cornerHalf} ${size - cornerHalf}`
        : `M 0 0 H ${size} M 0 0 V ${size}`;
    return <svg data-session-map-grid="square" aria-hidden="true" className="pointer-events-none absolute -left-[20000px] -top-[20000px] z-[2] h-[40000px] w-[40000px]" style={{ color, opacity: settings.opacity }}><defs><pattern id={patternId} x={20000 + (settings.originX ?? 0)} y={20000 + (settings.originY ?? 0)} width={size} height={size} patternUnits="userSpaceOnUse"><path d={squarePath} fill="none" stroke="currentColor" strokeWidth="1" {...strokeProps} />{lineStyle === 'dotted' && <circle cx="0" cy="0" r="2" fill="currentColor" />}</pattern></defs><rect width="100%" height="100%" fill={`url(#${patternId})`} /></svg>;
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

export function MapViewport({ children, campaignId, mapId, backgroundUrl, isOwner, mapPlacement, gridSettings, mapTokens = [], onMapPlacementChange, onTokenDrop, onTokensMove, onTokenLayerMove, onTokensLayerMove, onTokenLockChange, onTokenChange, onTokensChange, onTokenTransformsChange, onTokenDelete, onTokensDelete, onTokensCreateMagnetGroup, onTokenMagnetEnabledChange, onTokenMagnetLink, onTokenMagnetUnlink }: MapViewportProps) {
  const measurementClientIdRef = useRef(crypto.randomUUID());
  const activeTool = useActiveSessionMapTool();
  const selectionMode = useSessionMapSelectionMode();
  const selectionArmed = useSessionMapSelectionArmed();
  const measureMode = useSessionMapMeasureMode();
  const measurementsVisibleToAll = useSessionMapMeasurementsVisibleToAll();
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
  const [selectedTokenIds, setSelectedTokenIds] = useState<Set<string>>(() => new Set());
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
  const conditionListRef = useRef<HTMLDivElement>(null);
  const placementRef = useRef(mapPlacement);
  const placementElementRef = useRef<HTMLDivElement>(null);
  const onMapPlacementChangeRef = useRef(onMapPlacementChange);
  onMapPlacementChangeRef.current = onMapPlacementChange;

  const { send: sendCampaignEvent } = useCampaignChannel(campaignId ?? mapId.split(':')[0], { onBroadcast: { map_measurement: message => {
    const payload = message?.payload;
    if (!payload || payload.mapId !== mapId || payload.senderId === measurementClientIdRef.current) return;
    if (payload.action === 'clear-sender' && typeof payload.senderId === 'string') {
      setRemoteMeasurements(current => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${payload.senderId}:`))));
      return;
    }
    const value = payload.measurement;
    if (!value || typeof payload.senderId !== 'string' || typeof value.id !== 'string' || !['line', 'circle', 'cone'].includes(value.mode)) return;
    const key = `${payload.senderId}:${value.id}`;
    const measurement: VisualMeasurement = { id: value.id, pointerId: -1, mode: value.mode, start: value.start, end: value.end };
    setRemoteMeasurements(current => ({ ...current, [key]: measurement }));
    remoteMeasurementTimersRef.current[key]?.forEach(clearTimeout);
    if (payload.action === 'finish') remoteMeasurementTimersRef.current[key] = [
      setTimeout(() => setRemoteMeasurements(current => current[key] ? { ...current, [key]: { ...current[key], fading: true } } : current), 1600),
      setTimeout(() => setRemoteMeasurements(current => { const next = { ...current }; delete next[key]; return next; }), 2100),
    ];
  } } });

  useEffect(() => registerSessionMapTokenDropHandler((visual, clientX, clientY, grabOffset) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    const hitViewport = document.elementFromPoint(clientX, clientY)?.closest('[data-map-viewport]');
    if (!rect || hitViewport !== viewportRef.current || clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom || !isOwner) return false;
    const size = gridSettings.cellSize;
    const rawPosition = {
      x: (clientX - rect.left - view.x) / view.scale - size * grabOffset.x,
      y: (clientY - rect.top - view.y) / view.scale - size * grabOffset.y,
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
    setSelectedTokenIds(current => new Set([...current].filter(id => mapTokens.some(token => token.id === id && !token.locked))));
    if (!isOwner) {
      setTokenDraftPositions(current => Object.fromEntries(Object.entries(current).filter(([id, position]) => {
        const token = mapTokens.find(candidate => candidate.id === id);
        return !token || token.x !== position.x || token.y !== position.y;
      })));
      setTokenDraftTransforms(current => Object.fromEntries(Object.entries(current).filter(([id, transform]) => {
        const token = mapTokens.find(candidate => candidate.id === id);
        return !token || token.x !== transform.x || token.y !== transform.y || token.size !== transform.size || (token.rotation ?? 0) !== transform.rotation;
      })));
    }
  }, [isOwner, mapTokens]);

  useEffect(() => {
    const clearSelection = (event: KeyboardEvent) => { if (event.key === 'Escape') { setSelectedTokenIds(new Set()); setCalibrationStart(null); setSessionMapCalibrationActive(false); } };
    window.addEventListener('keydown', clearSelection);
    return () => window.removeEventListener('keydown', clearSelection);
  }, []);

  useEffect(() => () => {
    visualMeasurementTimersRef.current.forEach(clearTimeout);
    Object.values(remoteMeasurementTimersRef.current).flat().forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (!calibrationActive) setCalibrationStart(null);
  }, [calibrationActive]);

  useEffect(() => () => setSessionMapCalibrationActive(false), []);

  useEffect(() => {
    if (measurementsVisibleToAll) return;
    void sendCampaignEvent('map_measurement', { action: 'clear-sender', mapId, senderId: measurementClientIdRef.current });
  }, [mapId, measurementsVisibleToAll, sendCampaignEvent]);

  useEffect(() => {
    const centerMap = () => {
      const viewport = viewportRef.current;
      const element = placementElementRef.current;
      if (!viewport || !element) return;
      const rect = element.getBoundingClientRect();
      const width = rect.width / view.scale;
      const height = rect.height / view.scale;
      setView(current => ({
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

  const worldPoint = (event: ReactPointerEvent<HTMLDivElement>): SelectionPoint | null => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { x: (event.clientX - rect.left - view.x) / view.scale, y: (event.clientY - rect.top - view.y) / view.scale };
  };

  const measurementPoint = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = worldPoint(event);
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
      updateSessionGrid({ cellSize, originX: modulo(calibrationStart.x), originY: modulo(calibrationStart.y), visible: true });
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
      measurement: { id: measurement.id, mode: measurement.mode, start: measurement.start, end: measurement.end },
    });
  };

  const beginVisualMeasurement = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activeTool !== 'measure' || (measureMode !== 'line' && measureMode !== 'circle' && measureMode !== 'cone') || event.button !== 0) return false;
    const point = measurementPoint(event);
    if (!point) return false;
    visualMeasurementTimersRef.current.forEach(clearTimeout);
    visualMeasurementTimersRef.current = [];
    const measurement: VisualMeasurement = { id: crypto.randomUUID(), pointerId: event.pointerId, mode: measureMode, start: point, end: point };
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
      setTimeout(() => setVisualMeasurement(current => current ? { ...current, fading: true } : null), 1600),
      setTimeout(() => { setVisualMeasurement(null); visualMeasurementTimersRef.current = []; }, 2100),
    ];
    return true;
  };

  const beginSelection = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activeTool !== 'select' || !selectionArmed || event.button !== 0 || (event.target as Element).closest('[data-map-interactive]')) return false;
    const point = worldPoint(event);
    if (!point) return false;
    const gesture: SelectionGesture = { pointerId: event.pointerId, mode: selectionMode, start: point, current: point, points: [point] };
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
    if (gesture.mode === 'rectangle') {
      const bounds = { x: Math.min(gesture.start.x, point.x), y: Math.min(gesture.start.y, point.y), width: Math.abs(point.x - gesture.start.x), height: Math.abs(point.y - gesture.start.y) };
      selected = mapTokens.filter(token => !token.locked && rectangleCoverage(getTokenBounds(token, gridSettings.cellSize), bounds) > 0.5);
    } else if (gesture.points.length >= 3 && Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) <= 24 / view.scale) {
      const polygon = [...gesture.points, gesture.start];
      selected = mapTokens.filter(token => !token.locked && polygonCoverage(getTokenBounds(token, gridSettings.cellSize), polygon) > 0.5);
    }
    setSelectedTokenIds(new Set(selected.map(token => token.id)));
    selectionGestureRef.current = null;
    setSelectionDraft(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (selected.length > 0) setSessionMapSelectionArmed(false);
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

  const handleViewportPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => { if (!captureCalibrationPoint(event) && !beginVisualMeasurement(event) && !beginSelection(event)) beginPan(event); };
  const handleViewportPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => { if (!moveVisualMeasurement(event) && !moveSelection(event)) movePan(event); };
  const handleViewportPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => { if (!finishVisualMeasurement(event) && !finishSelection(event)) finishPan(event); };

  const beginTokenMove = (event: ReactPointerEvent<HTMLElement>, token: SessionMapToken) => {
    if (calibrationActive || activeTool === 'measure' || token.locked || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    setTransformTokenId(null);
    setTokenMenu(null);
    const selectionMembers = selectedTokenIds.has(token.id) ? mapTokens.filter(candidate => selectedTokenIds.has(candidate.id) && !candidate.locked) : [];
    if (activeTool === 'select' && selectionMembers.length === 0) setSelectedTokenIds(new Set([token.id]));
    const linkedTokens = selectionMembers.length > 0 ? selectionMembers : token.magnetGroupId
      ? mapTokens.filter(candidate => candidate.magnetGroupId === token.magnetGroupId && !candidate.locked)
      : [token];
    const movingIds = new Set(linkedTokens.map(candidate => candidate.id));
    if (selectionMembers.length === 0) linkedTokens.forEach(linkedToken => {
      const tokenIndex = mapTokens.findIndex(candidate => candidate.id === linkedToken.id);
      const tokenPosition = tokenDraftPositions[linkedToken.id] ?? linkedToken;
      const tokenBounds = getTokenBounds(linkedToken, gridSettings.cellSize, tokenPosition);
      mapTokens.slice(tokenIndex + 1).forEach(candidate => {
        const position = tokenDraftPositions[candidate.id] ?? candidate;
        if (!candidate.locked && isBoundsFullyContained(getTokenBounds(candidate, gridSettings.cellSize, position), tokenBounds)) movingIds.add(candidate.id);
      });
    });
    const movingTokens = mapTokens.filter(candidate => movingIds.has(candidate.id));
    const origins = Object.fromEntries(movingTokens.map(candidate => {
      const position = tokenDraftPositions[candidate.id] ?? candidate;
      return [candidate.id, { x: position.x, y: position.y }];
    }));
    tokenGestureRef.current = { pointerId: event.pointerId, tokenId: token.id, startX: event.clientX, startY: event.clientY, origins, positions: origins };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveToken = (event: ReactPointerEvent<HTMLElement>) => {
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

  const finishTokenMove = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = tokenGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    tokenGestureRef.current = null;
    onTokensMove?.(gesture.positions);
    if (!isOwner) return;
    setTokenDraftPositions(current => {
      const next = { ...current };
      Object.keys(gesture.positions).forEach(id => delete next[id]);
      return next;
    });
  };

  const openTokenMenu = (event: ReactMouseEvent<HTMLElement>, tokenId: string) => {
    event.preventDefault();
    event.stopPropagation();
    setTransformTokenId(null);
    const token = mapTokens.find(candidate => candidate.id === tokenId);
    const viewport = viewportRef.current;
    if (!viewport || !token || (!isOwner && token.locked)) return;
    if (!selectedTokenIds.has(tokenId) && !token.locked) setSelectedTokenIds(new Set([tokenId]));
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
    setTokenMenu({ tokenId, x, y, panel: null, nameDraft: token.name, customConditionDraft: '' });
  };

  const moveTokenLayer = (move: MapLayerMove) => {
    if (!tokenMenu) return;
    const targetIds = selectedTokenIds.has(tokenMenu.tokenId) ? [...selectedTokenIds] : [tokenMenu.tokenId];
    if (targetIds.length > 1) onTokensLayerMove?.(targetIds, move);
    else onTokenLayerMove?.(tokenMenu.tokenId, move);
    setTokenMenu(null);
  };

  const beginTokenTransform = (event: ReactPointerEvent<SVGElement>, token: SessionMapToken, kind: 'resize' | 'rotate') => {
    if (token.locked || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const members = selectedTokenIds.has(token.id) && selectedTokenIds.size > 1
      ? mapTokens.filter(candidate => selectedTokenIds.has(candidate.id) && !candidate.locked)
      : token.magnetGroupId ? mapTokens.filter(candidate => candidate.magnetGroupId === token.magnetGroupId) : [token];
    const origins = Object.fromEntries(members.map(member => {
      const current = tokenDraftTransforms[member.id];
      return [member.id, current ?? { x: member.x, y: member.y, size: getTokenSize(member, gridSettings.cellSize), rotation: member.rotation ?? 0 }];
    }));
    const origin = origins[token.id];
    const centerClientX = rect.left + view.x + (origin.x + origin.size / 2) * view.scale;
    const centerClientY = rect.top + view.y + (origin.y + origin.size / 2) * view.scale;
    const startDistance = Math.max(1, Math.hypot(event.clientX - centerClientX, event.clientY - centerClientY));
    const startAngle = Math.atan2(event.clientY - centerClientY, event.clientX - centerClientX);
    tokenTransformGestureRef.current = { pointerId: event.pointerId, tokenId: token.id, kind, centerClientX, centerClientY, startDistance, startAngle, origins, drafts: origins };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveTokenTransform = (event: ReactPointerEvent<SVGElement>) => {
    const gesture = tokenTransformGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (gesture.kind === 'resize') {
      const distance = Math.hypot(event.clientX - gesture.centerClientX, event.clientY - gesture.centerClientY);
      const factor = distance / gesture.startDistance;
      gesture.drafts = Object.fromEntries(Object.entries(gesture.origins).map(([id, origin]) => {
        const size = Math.min(2000, Math.max(8, origin.size * factor));
        return [id, { ...origin, x: origin.x + (origin.size - size) / 2, y: origin.y + (origin.size - size) / 2, size }];
      }));
    } else {
      const angle = Math.atan2(event.clientY - gesture.centerClientY, event.clientX - gesture.centerClientX);
      const delta = (angle - gesture.startAngle) * 180 / Math.PI;
      gesture.drafts = Object.fromEntries(Object.entries(gesture.origins).map(([id, origin]) => [id, { ...origin, rotation: Math.round((origin.rotation + delta) * 10) / 10 }]));
    }
    setTokenDraftTransforms(current => ({ ...current, ...gesture.drafts }));
  };

  const finishTokenTransform = (event: ReactPointerEvent<SVGElement>) => {
    const gesture = tokenTransformGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    tokenTransformGestureRef.current = null;
    onTokenTransformsChange?.(gesture.drafts);
    if (!isOwner) return;
    setTokenDraftTransforms(current => {
      const next = { ...current };
      Object.keys(gesture.drafts).forEach(id => delete next[id]);
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
    className={`relative h-full min-h-0 w-full overflow-hidden touch-none bg-[radial-gradient(circle_at_center,#262a31_0%,#14161b_58%,#0d0f13_100%)] ${calibrationActive || activeTool === 'select' && selectionArmed ? 'cursor-crosshair' : ''}`}
    onWheel={zoom}
    onAuxClick={event => { if (event.button === 1) event.preventDefault(); }}
    onPointerDown={handleViewportPointerDown}
    onPointerMove={handleViewportPointerMove}
    onPointerUp={handleViewportPointerUp}
    onPointerCancel={event => { if (!finishVisualMeasurement(event) && !finishSelection(event)) finishPan(event); }}
    onPointerLeave={() => { if (!panning) setMoveTargetAvailable(false); }}
    onLostPointerCapture={() => { panRef.current = null; selectionGestureRef.current = null; setSelectionDraft(null); setPanning(false); }}
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
      {selectionDraft && <svg aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 overflow-visible">
        {selectionDraft.mode === 'rectangle' ? <rect x={Math.min(selectionDraft.start.x, selectionDraft.current.x)} y={Math.min(selectionDraft.start.y, selectionDraft.current.y)} width={Math.abs(selectionDraft.current.x - selectionDraft.start.x)} height={Math.abs(selectionDraft.current.y - selectionDraft.start.y)} fill="rgba(34,211,238,0.12)" stroke="#22d3ee" strokeWidth={1.5 / view.scale} strokeDasharray={`${6 / view.scale} ${4 / view.scale}`} /> : <polyline points={[...selectionDraft.points, selectionDraft.current].map(point => `${point.x},${point.y}`).join(' ')} fill="none" stroke="#22d3ee" strokeWidth={1.5 / view.scale} strokeDasharray={`${6 / view.scale} ${4 / view.scale}`} />}
      </svg>}
      {calibrationStart && <div aria-hidden="true" className="pointer-events-none absolute z-[22]" style={{ left: calibrationStart.x, top: calibrationStart.y }}><span className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-cyan-400 shadow-[0_0_0_3px_rgba(3,7,18,0.85)]" style={{ width: 14 / view.scale, height: 14 / view.scale }} /><span className="absolute left-3 top-3 whitespace-nowrap rounded-md border border-cyan-300/60 bg-slate-950/90 px-2 py-1 font-semibold text-cyan-100 shadow-lg" style={{ fontSize: 12 / view.scale }}>Seleziona un secondo incrocio distante</span></div>}
      {visualMeasurement && <MeasurementGraphic measurement={visualMeasurement} view={view} gridSettings={gridSettings} />}
      {Object.entries(remoteMeasurements).map(([key, measurement]) => <MeasurementGraphic key={key} measurement={measurement} view={view} gridSettings={gridSettings} />)}
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
           const conditions = token.conditions ?? [];
           const dead = conditions.some(condition => condition.standardKey === 'dead');
           const visibleConditions = conditions.filter(condition => condition.standardKey !== 'dead').sort((a, b) => a.name.localeCompare(b.name, 'it'));
             const conditionCount = visibleConditions.length;
             const tokenBorderRadius = size * MARGIN_SCALE / 2;
             const conditionTokenGap = size * CONDITION_BADGE_TOKEN_GAP_RATIO;
             const conditionMaxStep = conditionCount > 1 ? CONDITION_MAX_ARC / (conditionCount - 1) : 0;
             const conditionStepSin = Math.sin(conditionMaxStep / 2);
             const conditionMaxSize = conditionCount > 1 ? 2 * (tokenBorderRadius + conditionTokenGap) * conditionStepSin / (1 + CONDITION_BADGE_GAP_RATIO - conditionStepSin) : Number.POSITIVE_INFINITY;
             const conditionSize = Math.min(size * CONDITION_BADGE_SIZE_RATIO, conditionMaxSize);
             const conditionRadius = tokenBorderRadius + conditionTokenGap + conditionSize / 2;
             const conditionNaturalStep = 2 * Math.asin(Math.min(1, conditionSize * (1 + CONDITION_BADGE_GAP_RATIO) / (2 * conditionRadius)));
             const conditionStep = conditionCount > 1 ? Math.min(conditionNaturalStep, conditionMaxStep) : 0;
             const conditionStartAngle = -Math.PI / 2 - conditionStep * (conditionCount - 1) / 2;
           return <Fragment key={token.id}><Tooltip><TooltipTrigger asChild><button
            type="button"
            aria-label={`Token di ${token.name}`}
             className={`pointer-events-none absolute touch-none border-0 bg-transparent p-0 ${token.locked ? 'drop-shadow-[0_0_3px_rgba(251,191,36,0.9)]' : ''}`}
             style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)`, opacity: isOwner && token.visible === false ? 0.45 : 1 }}
           >
             <div style={{ transform: `rotate(${rotation}deg)` }}><TokenGhostShape entity={token} fallbackIcon={tokenFallback} size={size} /></div>
             <span
               data-map-interactive
               data-map-movable={!token.locked ? 'true' : 'false'}
                className={`pointer-events-auto absolute inset-0 z-[7] rounded-full ${calibrationActive || activeTool === 'select' && selectionArmed ? 'cursor-crosshair' : token.locked ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'}`}
               onPointerDown={event => beginTokenMove(event, token)}
               onPointerMove={moveToken}
               onPointerUp={finishTokenMove}
               onPointerCancel={finishTokenMove}
               onContextMenu={event => openTokenMenu(event, token.id)}
             />
              {dead && <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-[6] grid place-items-center" style={{ filter: 'drop-shadow(0 0 3px rgba(239,68,68,1)) drop-shadow(0 0 6px rgba(239,68,68,0.9))' }}><img src="/death-skull.svg" alt="" draggable={false} className="object-contain" style={{ width: size * 0.86, height: size * 0.7, opacity: 0.6, filter: 'drop-shadow(0 0 1px #09090b) drop-shadow(0 0 1px #09090b)' }} /></span>}
              {selectedTokenIds.has(token.id) && <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-[8] rounded-full border-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.9)]" style={{ borderWidth: 2 / view.scale }} />}
              {visibleConditions.length > 0 && <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[5]">{visibleConditions.map((condition, index) => { const ConditionIcon = getTokenConditionIcon(condition); const angle = conditionStartAngle + index * conditionStep; const iconStyle = { width: conditionSize * 0.58, height: conditionSize * 0.58 }; const iconAdjustment = CONDITION_ICON_ADJUSTMENTS[condition.standardKey ?? '']; return <span key={condition.id} className="absolute rounded-full bg-slate-800/95 text-white shadow-md" style={{ width: conditionSize, height: conditionSize, left: size / 2 + Math.cos(angle) * conditionRadius - conditionSize / 2, top: size / 2 + Math.sin(angle) * conditionRadius - conditionSize / 2 }}><span className="absolute inset-0 flex items-center justify-center" style={iconAdjustment ? { transform: `translate(${conditionSize * iconAdjustment.x}px, ${conditionSize * iconAdjustment.y}px)` } : undefined}>{condition.standardKey === 'prone' ? <img src="/condition-prone.svg" alt="" className="h-[70%] w-[70%] object-contain invert" /> : condition.standardKey === 'incapacitated' ? <img src="/condition-incapacitated.svg" alt="" className="h-[64%] w-[64%] object-contain invert" /> : condition.standardKey === 'stunned' ? <img src="/condition-stunned.png" alt="" className="h-[70%] w-[70%] object-contain invert" /> : condition.standardKey === 'unconscious' ? <img src="/condition-unconscious.png" alt="" className="h-[68%] w-[68%] object-contain invert" /> : condition.standardKey === 'restrained' ? <img src="/condition-restrained.png" alt="" className="h-[58%] w-[58%] object-contain invert" /> : condition.standardKey === 'paralyzed' ? <img src="/condition-paralyzed-v3.png" alt="" className="h-[70%] w-[70%] object-contain invert" /> : <ConditionIcon data-static-icon={condition.standardKey === 'blinded' ? true : undefined} style={iconStyle} />}</span></span>; })}</div>}
             {token.showLabel && <span className="pointer-events-none absolute left-1/2 top-full -translate-x-1/2 whitespace-nowrap border border-[var(--dash-border)] font-semibold leading-none text-[var(--dash-text-strong)] shadow-lg backdrop-blur-sm" style={{ backgroundColor: token.labelColor ?? 'var(--dash-surface)', marginTop: size * 0.04, maxWidth: size * 5, borderRadius: size * 0.1, borderWidth: 1 / view.scale, padding: `${size * 0.06}px ${size * 0.12}px`, fontSize: size * 0.14 }}>{token.name}</span>}
           </button></TooltipTrigger>{(conditions.length > 0 || !token.showLabel) && <TooltipContent side="top"><div className="space-y-1.5">{!token.showLabel && <div className="font-semibold">{token.name}</div>}{[...conditions].sort((a, b) => a.name.localeCompare(b.name, 'it')).map(condition => { const ConditionIcon = getTokenConditionIcon(condition); return <div key={condition.id} className="flex items-center gap-1.5">{condition.standardKey === 'prone' ? <img src="/condition-prone-v2.svg" alt="" className="h-4 w-4 object-contain invert" /> : condition.standardKey === 'incapacitated' ? <img src="/condition-incapacitated-v2.svg" alt="" className="h-4 w-4 object-contain invert" /> : condition.standardKey === 'stunned' ? <img src="/condition-stunned-v2.png" alt="" className="h-4 w-4 object-contain invert" /> : condition.standardKey === 'unconscious' ? <img src="/condition-unconscious.png" alt="" className="h-4 w-4 object-contain invert" /> : condition.standardKey === 'restrained' ? <img src="/condition-restrained-v2.png" alt="" className="h-4 w-4 object-contain invert" /> : condition.standardKey === 'paralyzed' ? <img src="/condition-paralyzed-v3.png" alt="" className="h-5 w-5 object-contain invert" /> : <ConditionIcon className={`h-3.5 w-3.5 ${condition.standardKey === 'dead' ? 'text-red-400' : ''}`} />}<span>{condition.name}</span></div>; })}</div></TooltipContent>}</Tooltip>
           {transformTokenId === token.id && !token.locked && <svg data-map-interactive className="pointer-events-none absolute z-20 overflow-visible" width={size} height={size + rotationLineLength + rotationHandleSize / 2} viewBox={`0 0 ${size} ${size + rotationLineLength + rotationHandleSize / 2}`} style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0) rotate(${rotation}deg)`, transformOrigin: `${size / 2}px ${size / 2}px` }}>
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
       const targetIds = selectedTokenIds.has(token.id) ? [...selectedTokenIds] : [token.id];
       const batch = targetIds.length > 1;
       const applyTokenUpdate = (update: Partial<SessionMapToken>) => batch ? onTokensChange?.(targetIds, update) : onTokenChange?.(token.id, update);
      const iconClass = 'grid h-10 w-10 place-items-center rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] text-[var(--dash-muted)] hover:border-[var(--dash-accent)] hover:text-[var(--dash-text-strong)] disabled:cursor-not-allowed disabled:opacity-30';
      const menuIcon = (label: string, button: ReactNode) => <Tooltip><TooltipTrigger asChild><span className="inline-flex">{button}</span></TooltipTrigger><TooltipContent side="top">{label}</TooltipContent></Tooltip>;
       const commitName = () => {
        const name = tokenMenu.nameDraft.trim();
         if (!batch && name && name !== token.name) onTokenChange?.(token.id, { name });
       };
       const toggleStandardCondition = (key: string, name: string) => {
         const conditions = token.conditions ?? [];
         const exists = conditions.some(condition => condition.standardKey === key);
          applyTokenUpdate({ conditions: exists ? conditions.filter(condition => condition.standardKey !== key) : [...conditions, { id: `standard:${key}`, standardKey: key, name }] });
       };
       const addCustomCondition = () => {
         const name = tokenMenu.customConditionDraft.trim();
         if (!name) return;
          applyTokenUpdate({ conditions: [...(token.conditions ?? []), { id: crypto.randomUUID(), name, custom: true }] });
         setTokenMenu(current => current ? { ...current, customConditionDraft: '' } : null);
       };
      return <div
        data-map-interactive
        role="menu"
        className="absolute z-50 w-[min(92vw,390px)] rounded-xl border border-[var(--dash-border)] bg-[var(--dash-panel)]/95 p-3 text-xs text-[var(--dash-text)] shadow-2xl backdrop-blur"
         style={{ left: tokenMenu.x, top: tokenMenu.y }}
         onPointerDown={event => event.stopPropagation()}
         onWheel={event => event.stopPropagation()}
      >
        <div className="mb-3 flex flex-wrap gap-1.5">
           {isOwner && menuIcon(token.visible === false ? 'Mostra ai giocatori' : 'Nascondi ai giocatori', <button type="button" aria-label={token.visible === false ? 'Mostra token ai giocatori' : 'Nascondi token ai giocatori'} onClick={() => applyTokenUpdate({ visible: token.visible === false })} className={iconClass}>{token.visible === false ? <EyeOff data-static-icon className="h-5 w-5" /> : <Eye data-static-icon className="h-5 w-5" />}</button>)}
           {isOwner && menuIcon(token.locked ? 'Sblocca token' : 'Blocca token', <button type="button" aria-label={token.locked ? 'Sblocca token' : 'Blocca token'} onClick={() => batch ? onTokensChange?.(targetIds, { locked: !token.locked }) : onTokenLockChange?.(token.id, !token.locked)} className={`${iconClass} ${token.locked ? 'bg-cyan-400/20 text-cyan-200' : ''}`}>{token.locked ? <Unlock className="h-5 w-5" /> : <Lock className="h-5 w-5" />}</button>)}
          {menuIcon('Illuminazione: disponibile con la nebbia', <button type="button" disabled aria-label="Illuminazione non ancora disponibile" className={iconClass}><Flashlight className="h-5 w-5" /></button>)}
          {menuIcon(token.locked ? 'Sblocca il token per trasformarlo' : 'Dimensione e rotazione', <button type="button" disabled={token.locked} aria-label="Dimensione e rotazione" onClick={() => { setTransformTokenId(token.id); setTokenMenu(null); }} className={iconClass}><Maximize2 className="h-5 w-5" /></button>)}
           {menuIcon('Condizioni', <button type="button" aria-label="Condizioni" onClick={() => { setConditionScrollRatio(0); setTokenMenu(current => current ? { ...current, panel: current.panel === 'conditions' ? null : 'conditions' } : null); }} className={`${iconClass} ${(token.conditions?.length ?? 0) > 0 ? 'bg-cyan-400/20 text-cyan-200' : ''}`}><Skull className="h-5 w-5" /></button>)}
           {menuIcon(token.showLabel ? 'Colore etichetta' : 'Mostra prima il nome del token', <button type="button" disabled={!token.showLabel} aria-label="Colore etichetta" onClick={() => setTokenMenu(current => current ? { ...current, panel: current.panel === 'colors' ? null : 'colors' } : null)} className={iconClass}><Palette className="h-5 w-5" /></button>)}
            {menuIcon(batch ? 'Crea gruppo magnetico' : token.magnetEnabled ? 'Collegamenti magnetici' : 'Attiva calamita', <button type="button" aria-label={batch ? 'Crea gruppo magnetico' : token.magnetEnabled ? 'Collegamenti magnetici' : 'Attiva calamita'} onClick={() => { if (batch) { onTokensCreateMagnetGroup?.(targetIds); setTokenMenu(null); return; } if (!token.magnetEnabled) onTokenMagnetEnabledChange?.(token.id, true); setTokenMenu(current => current ? { ...current, panel: current.panel === 'magnets' && token.magnetEnabled ? null : 'magnets' } : null); }} className={`${iconClass} ${token.magnetEnabled ? 'bg-cyan-400/20 text-cyan-200' : ''}`}><Magnet className="h-5 w-5" /></button>)}
           {menuIcon('Livelli', <button type="button" aria-label="Livelli" onClick={() => setTokenMenu(current => current ? { ...current, panel: current.panel === 'layers' ? null : 'layers' } : null)} className={iconClass}><Layers3 className="h-5 w-5" /></button>)}
          {menuIcon(batch ? `Elimina ${targetIds.length} token` : 'Elimina token', <button type="button" aria-label={batch ? `Elimina ${targetIds.length} token` : 'Elimina token'} onClick={() => { if (batch) { if (window.confirm(`Eliminare definitivamente i ${targetIds.length} token selezionati?`)) { onTokensDelete?.(targetIds); setSelectedTokenIds(new Set()); setTokenMenu(null); } } else { onTokenDelete?.(token.id); setTokenMenu(null); } }} className={`${iconClass} text-red-300 hover:bg-red-500/15 hover:text-red-200`}><Trash2 data-static-icon className="h-5 w-5" /></button>)}
        </div>
        <div className="flex gap-2">
          <input value={batch ? `${targetIds.length} token selezionati` : tokenMenu.nameDraft} disabled={batch} onChange={event => setTokenMenu(current => current ? { ...current, nameDraft: event.target.value } : null)} onBlur={commitName} onKeyDown={event => { if (event.key === 'Enter') { commitName(); event.currentTarget.blur(); } }} aria-label="Nome token" className="h-10 min-w-0 flex-1 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 text-sm text-[var(--dash-text-strong)] outline-none focus:border-[var(--dash-accent)] disabled:opacity-60" />
          {menuIcon(token.showLabel ? 'Nascondi nome sotto il token' : 'Mostra nome sotto il token', <button type="button" aria-label={token.showLabel ? 'Nascondi etichetta token' : 'Mostra etichetta token'} onClick={() => applyTokenUpdate({ showLabel: !token.showLabel })} className={`${iconClass} shrink-0 ${token.showLabel ? 'bg-cyan-400/20 text-cyan-200' : ''}`}>{token.showLabel ? <Eye data-static-icon className="h-5 w-5" /> : <EyeOff data-static-icon className="h-5 w-5" />}</button>)}
        </div>
         {token.showLabel && tokenMenu.panel === 'colors' && <div className="mt-3 border-t border-[var(--dash-border-soft)] pt-3"><div className="mb-2 flex items-center justify-between gap-2"><span className="text-[var(--dash-muted)]">Sfondo del nome</span><button type="button" onClick={() => applyTokenUpdate({ labelColor: 'var(--dash-surface)' })} className="rounded-md border border-[var(--dash-border)] bg-[var(--dash-surface-2)] px-2 py-1 text-[10px] font-semibold text-[var(--dash-text)] hover:border-[var(--dash-accent)]">Reset</button></div><div className="grid grid-cols-8 gap-2">{TOKEN_LABEL_COLORS.map(color => <button key={color} type="button" aria-label={`Colore etichetta ${color}`} onClick={() => applyTokenUpdate({ labelColor: color })} className={`h-6 w-6 rounded-full border-2 ${token.labelColor === color ? 'border-[var(--dash-text-strong)]' : 'border-transparent'}`} style={{ backgroundColor: color }} />)}</div></div>}
         {tokenMenu.panel === 'conditions' && <div className="mt-3 border-t border-[var(--dash-border-soft)] pt-3">
           <div className="mb-2 flex items-center justify-between"><span className="font-semibold text-[var(--dash-text-strong)]">Condizioni</span><button type="button" disabled={(token.conditions?.length ?? 0) === 0} onClick={() => applyTokenUpdate({ conditions: [] })} className="text-[10px] text-[var(--dash-muted)] hover:text-red-200 disabled:opacity-40">Rimuovi tutte</button></div>
           <div className="relative -mr-2"><div ref={conditionListRef} data-token-condition-list onScroll={event => { const element = event.currentTarget; setConditionScrollRatio(element.scrollTop / Math.max(1, element.scrollHeight - element.clientHeight)); }} className="max-h-64 space-y-1 overflow-y-scroll pr-4">{STANDARD_TOKEN_CONDITIONS.map(condition => { const selected = token.conditions?.some(item => item.standardKey === condition.key) ?? false; const ConditionIcon = condition.icon; return <button key={condition.key} type="button" onClick={() => toggleStandardCondition(condition.key, condition.name)} className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left ${selected ? 'bg-[var(--dash-accent)]/20 text-[var(--dash-text-strong)]' : 'hover:bg-[var(--dash-surface-2)]'}`}><span className={`grid h-6 w-6 place-items-center rounded border ${selected ? 'border-[var(--dash-accent)] bg-[var(--dash-accent)] text-white' : 'border-[var(--dash-border)] bg-[var(--dash-input)]'}`}>{selected && (condition.key === 'prone' ? <img src="/condition-prone-v2.svg" alt="" className="h-4 w-4 object-contain invert" /> : condition.key === 'incapacitated' ? <img src="/condition-incapacitated-v2.svg" alt="" className="h-4 w-4 object-contain invert" /> : condition.key === 'stunned' ? <img src="/condition-stunned-v2.png" alt="" className="h-4 w-4 object-contain invert" /> : condition.key === 'unconscious' ? <img src="/condition-unconscious.png" alt="" className="h-4 w-4 object-contain invert" /> : condition.key === 'restrained' ? <img src="/condition-restrained-v2.png" alt="" className="h-4 w-4 object-contain invert" /> : condition.key === 'paralyzed' ? <img src="/condition-paralyzed-v3.png" alt="" className="h-5 w-5 object-contain invert" /> : <ConditionIcon data-static-icon={condition.key === 'blinded' ? true : undefined} className="h-4 w-4" />)}</span><span>{condition.name}</span></button>; })}</div><div role="scrollbar" aria-label="Scorri condizioni" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(conditionScrollRatio * 100)} className="absolute bottom-0 right-1 top-0 z-10 w-2 cursor-pointer touch-none rounded-full bg-[var(--dash-input)]" onPointerDown={event => { event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); const list = conditionListRef.current; if (!list) return; const rect = event.currentTarget.getBoundingClientRect(); const ratio = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)); list.scrollTop = ratio * (list.scrollHeight - list.clientHeight); }} onPointerMove={event => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; event.preventDefault(); event.stopPropagation(); const list = conditionListRef.current; if (!list) return; const rect = event.currentTarget.getBoundingClientRect(); const ratio = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)); list.scrollTop = ratio * (list.scrollHeight - list.clientHeight); }} onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}><div className="pointer-events-none absolute left-0 top-0 w-full rounded-full bg-[var(--dash-accent)]" style={{ height: '36%', transform: `translateY(${conditionScrollRatio * 177.78}%)` }} /></div></div>
           {(token.conditions ?? []).some(condition => condition.custom) && <div className="mt-2 max-h-32 space-y-1 overflow-y-auto border-t border-[var(--dash-border-soft)] pt-2">{(token.conditions ?? []).filter(condition => condition.custom).sort((a, b) => a.name.localeCompare(b.name, 'it')).map(condition => <button key={condition.id} type="button" title="Rimuovi condizione personalizzata" onClick={() => applyTokenUpdate({ conditions: (token.conditions ?? []).filter(item => item.id !== condition.id) })} className="flex w-full items-center gap-2 rounded-md bg-[var(--dash-surface-2)] px-2 py-2 text-left hover:text-red-200"><Star className="h-4 w-4" /><span className="min-w-0 flex-1 truncate">{condition.name}</span><X className="h-3.5 w-3.5" /></button>)}</div>}
           <div className="mt-2 flex gap-1.5 border-t border-[var(--dash-border-soft)] pt-2"><input value={tokenMenu.customConditionDraft} onChange={event => setTokenMenu(current => current ? { ...current, customConditionDraft: event.target.value } : null)} onKeyDown={event => { if (event.key === 'Enter') addCustomCondition(); }} placeholder="Condizione personalizzata..." aria-label="Condizione personalizzata" className="h-9 min-w-0 flex-1 rounded-md border border-[var(--dash-border)] bg-[var(--dash-input)] px-2 text-xs outline-none focus:border-[var(--dash-accent)]" /><button type="button" onClick={addCustomCondition} className="rounded-md border border-[var(--dash-border)] px-3 font-semibold hover:border-[var(--dash-accent)]">Aggiungi</button></div>
         </div>}
         {tokenMenu.panel === 'magnets' && <div className="mt-3 border-t border-[var(--dash-border-soft)] pt-3">
           <div className="mb-2 flex items-center justify-between gap-2"><span className="font-semibold text-[var(--dash-text-strong)]">Elementi magnetici</span><button type="button" onClick={() => { onTokenMagnetEnabledChange?.(token.id, false); setTokenMenu(current => current ? { ...current, panel: null } : null); }} className="rounded-md border border-[var(--dash-border)] px-2 py-1 text-[10px] text-[var(--dash-muted)] hover:text-red-200">Disattiva</button></div>
           {token.magnetGroupId && <button type="button" onClick={() => onTokenMagnetUnlink?.(token.id)} className="mb-2 w-full rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-2 text-left text-amber-100 hover:bg-amber-400/20">Scollega questo elemento dal gruppo</button>}
           <div className="max-h-44 space-y-1 overflow-y-auto">{mapTokens.filter(candidate => candidate.id !== token.id && candidate.magnetEnabled).map(candidate => {
             const linked = Boolean(token.magnetGroupId && candidate.magnetGroupId === token.magnetGroupId);
             return <button key={candidate.id} type="button" disabled={linked} onClick={() => onTokenMagnetLink?.(token.id, candidate.id)} className="flex w-full items-center gap-2 rounded-md bg-[var(--dash-surface-2)] px-2 py-2 text-left hover:text-[var(--dash-text-strong)] disabled:opacity-60"><Magnet className={`h-4 w-4 shrink-0 ${linked ? 'text-cyan-300' : 'text-[var(--dash-muted)]'}`} /><span className="min-w-0 flex-1 truncate">{candidate.name}</span>{linked && <span className="text-[10px] text-cyan-300">Collegato</span>}</button>;
           })}{mapTokens.every(candidate => candidate.id === token.id || !candidate.magnetEnabled) && <p className="py-2 text-[var(--dash-muted)]">Attiva la calamita su un altro elemento per collegarlo.</p>}</div>
         </div>}
         {tokenMenu.panel === 'layers' && <div className="mt-3 grid grid-cols-2 gap-1.5 border-t border-[var(--dash-border-soft)] pt-3"><button type="button" onClick={() => moveTokenLayer('forward')} className="flex items-center justify-center gap-1.5 rounded bg-[var(--dash-surface-2)] px-2 py-2 hover:text-[var(--dash-text-strong)]"><ArrowUp className="h-4 w-4" />Porta sopra</button><button type="button" onClick={() => moveTokenLayer('backward')} className="flex items-center justify-center gap-1.5 rounded bg-[var(--dash-surface-2)] px-2 py-2 hover:text-[var(--dash-text-strong)]"><ArrowDown className="h-4 w-4" />Porta sotto</button><button type="button" onClick={() => moveTokenLayer('front')} className="flex items-center justify-center gap-1.5 rounded bg-[var(--dash-surface-2)] px-2 py-2 hover:text-[var(--dash-text-strong)]"><ChevronsUp className="h-4 w-4" />In primo piano</button><button type="button" onClick={() => moveTokenLayer('back')} className="flex items-center justify-center gap-1.5 rounded bg-[var(--dash-surface-2)] px-2 py-2 hover:text-[var(--dash-text-strong)]"><ChevronsDown className="h-4 w-4" />In fondo</button></div>}
      </div>;
    })()}
  </div>;
}
