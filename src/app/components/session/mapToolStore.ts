import { useSyncExternalStore } from 'react';
import type { SessionGridLineStyle, SessionGridSettings, SessionGridType } from '../../../types/mapGeometry';

export type { SessionGridLineStyle, SessionGridSettings, SessionGridType } from '../../../types/mapGeometry';

export type SessionMapTool = 'move' | 'select' | 'grid' | 'measure' | 'draw' | 'pin' | 'fog' | 'walls' | 'pointer';
export type SessionMapSelectionMode = 'rectangle' | 'freehand';
export type SessionMapMeasureMode = 'line' | 'circle' | 'cone' | 'visibility';
export type SessionMapDrawMode = 'grab' | 'freehand' | 'polygon' | 'line' | 'rectangle' | 'circle' | 'triangle' | 'hexagon' | 'text' | 'eraser';
export type SessionMapFogMode = 'grab' | 'room-fill' | 'quick-select' | 'polygon' | 'freehand' | 'rectangle' | 'circle' | 'triangle' | 'hexagon' | 'cutter';
export type SessionMapFogOperation = 'cover' | 'reveal';
export type SessionMapFogOverlapMode = 'fit' | 'trim' | 'join' | 'overlay';
export type SessionMapFogSettings = { mode: SessionMapFogMode; operation: SessionMapFogOperation; magnetEnabled: boolean; gridSnapEnabled: boolean; gridSnapMode: 'half-step' | 'full-step'; previewAsPlayer: boolean; overlapMode: SessionMapFogOverlapMode; color: string; strokeWidth: number; styleRevision: number; fullMapCovered: boolean };
export type SessionMapDrawingStyle = { strokeColor: string; fillColor: string; strokeWidth: number; opacity: number; fillOpacity: number; lineStyle: 'solid' | 'dashed' | 'dotted' | 'dash-dot' | 'long-dash' };
export type SessionMapTextStyle = { content: string; fontSize: number; fontFamily: string; bold: boolean; italic: boolean; underline: boolean; strike: boolean; align: 'left' | 'center' | 'right'; color: string; strokeColor: string; horizontalScale: number; orientation: 'horizontal' | 'vertical' };
export const DEFAULT_SESSION_DRAW_STYLE: SessionMapDrawingStyle = { strokeColor: '#22d3ee', fillColor: '#22d3ee', strokeWidth: 4, opacity: 1, fillOpacity: 0.18, lineStyle: 'solid' };
export const DEFAULT_SESSION_TEXT_STYLE: SessionMapTextStyle = { content: 'Testo', fontSize: 24, fontFamily: 'Arial', bold: false, italic: false, underline: false, strike: false, align: 'left', color: '#ffffff', strokeColor: '#111827', horizontalScale: 1, orientation: 'horizontal' };
export const DEFAULT_SESSION_GRID: SessionGridSettings = { visible: true, type: 'square', lineStyle: 'solid', color: '#38bdf8', opacity: 0, snap: false, squareSnapMode: 'half-step', distance: 5, unit: 'Metri', cellSize: 100 };
const FOG_PREFERENCES_STORAGE_KEY = 'hollowgate.map-fog-preferences';

function loadFogPreferences(): Pick<SessionMapFogSettings, 'magnetEnabled' | 'gridSnapEnabled' | 'gridSnapMode'> {
  const defaults = { magnetEnabled: true, gridSnapEnabled: false, gridSnapMode: 'half-step' as const };
  if (typeof window === 'undefined') return defaults;
  try {
    const stored = JSON.parse(window.localStorage.getItem(FOG_PREFERENCES_STORAGE_KEY) ?? 'null');
    return {
      magnetEnabled: typeof stored?.magnetEnabled === 'boolean' ? stored.magnetEnabled : defaults.magnetEnabled,
      gridSnapEnabled: typeof stored?.gridSnapEnabled === 'boolean' ? stored.gridSnapEnabled : defaults.gridSnapEnabled,
      gridSnapMode: stored?.gridSnapMode === 'full-step' || stored?.gridSnapMode === 'half-step' ? stored.gridSnapMode : defaults.gridSnapMode,
    };
  } catch {
    return defaults;
  }
}

let activeMapTool: SessionMapTool = 'move';
const listeners = new Set<() => void>();
let selectionMode: SessionMapSelectionMode = 'rectangle';
const selectionModeListeners = new Set<() => void>();
let selectionArmed = false;
const selectionArmedListeners = new Set<() => void>();
let measureMode: SessionMapMeasureMode | null = null;
const measureModeListeners = new Set<() => void>();
let measurementsVisibleToAll = true;
const measurementVisibilityListeners = new Set<() => void>();
let drawMode: SessionMapDrawMode = 'freehand';
let drawStyle = DEFAULT_SESSION_DRAW_STYLE;
let textStyle = DEFAULT_SESSION_TEXT_STYLE;
let drawSnapshot: { mode: SessionMapDrawMode; style: SessionMapDrawingStyle; textStyle: SessionMapTextStyle } = { mode: drawMode, style: drawStyle, textStyle };
const drawListeners = new Set<() => void>();
let fogSettings: SessionMapFogSettings = { mode: 'grab', operation: 'cover', ...loadFogPreferences(), previewAsPlayer: false, overlapMode: 'overlay', color: '#111827', strokeWidth: 2, styleRevision: 0, fullMapCovered: false };
let fogSnapshot = fogSettings;
const fogListeners = new Set<() => void>();
let coverFullMapHandler: (() => void) | null = null;
let clearFogHandler: (() => void) | null = null;
let clearFogSelectionHandler: (() => void) | null = null;
let automaticFogHandler: (() => void) | null = null;
export type SessionMapAutomaticFogState = { status: 'idle' | 'processing' | 'result' | 'error'; progress: number; stage: string; areas: number; walls: number; doors: number; windows: number; source: 'local' | 'ai' | null; engine: 'gemini' | 'semantic-local' | 'heuristic' | null; error: string | null };
let automaticFogState: SessionMapAutomaticFogState = { status: 'idle', progress: 0, stage: '', areas: 0, walls: 0, doors: 0, windows: 0, source: null, engine: null, error: null };
let automaticFogApplyHandler: (() => void) | null = null;
const automaticFogListeners = new Set<() => void>();
let clearDrawingsHandler: (() => void) | null = null;
const gridListeners = new Set<() => void>();
let gridSettings = DEFAULT_SESSION_GRID;
let gridEditable = false;
let gridChange: ((settings: SessionGridSettings) => void) | null = null;
let gridSnapshot = { settings: gridSettings, editable: gridEditable };
let mapFitAvailable = false;
export type SessionMapFitMode = 'exact' | 'proportional' | 'reset';
let mapFitHandler: ((mode: SessionMapFitMode) => void) | null = null;
const mapFitListeners = new Set<() => void>();
let mapCenterAvailable = false;
let mapCenterHandler: (() => void) | null = null;
const mapCenterListeners = new Set<() => void>();
let mapUndoAvailable = false;
let mapRedoAvailable = false;
let mapUndoHandler: (() => void) | null = null;
let mapRedoHandler: (() => void) | null = null;
const mapHistoryListeners = new Set<() => void>();
let sessionMapCurrentUserId: string | null = null;

export function setSessionMapCurrentUserId(userId: string | null) { sessionMapCurrentUserId = userId; }
export function getSessionMapCurrentUserId() { return sessionMapCurrentUserId; }
let mapCalibrationActive = false;
const mapCalibrationListeners = new Set<() => void>();

export function setActiveSessionMapTool(tool: SessionMapTool) {
  if (tool === activeMapTool) return;
  activeMapTool = tool;
  listeners.forEach(listener => listener());
}

export function setSessionMapSelectionMode(mode: SessionMapSelectionMode) {
  if (mode === selectionMode) return;
  selectionMode = mode;
  selectionModeListeners.forEach(listener => listener());
}

export function useSessionMapSelectionMode(): SessionMapSelectionMode {
  return useSyncExternalStore(
    listener => { selectionModeListeners.add(listener); return () => selectionModeListeners.delete(listener); },
    () => selectionMode,
    () => 'rectangle',
  );
}

export function setSessionMapSelectionArmed(armed: boolean) {
  if (armed === selectionArmed) return;
  selectionArmed = armed;
  selectionArmedListeners.forEach(listener => listener());
}

export function useSessionMapSelectionArmed() {
  return useSyncExternalStore(
    listener => { selectionArmedListeners.add(listener); return () => selectionArmedListeners.delete(listener); },
    () => selectionArmed,
    () => false,
  );
}

export function setSessionMapMeasureMode(mode: SessionMapMeasureMode | null) {
  if (mode === measureMode) return;
  measureMode = mode;
  measureModeListeners.forEach(listener => listener());
}

export function useSessionMapMeasureMode() {
  return useSyncExternalStore(
    listener => { measureModeListeners.add(listener); return () => measureModeListeners.delete(listener); },
    () => measureMode,
    () => null,
  );
}

export function setSessionMapMeasurementsVisibleToAll(visible: boolean) {
  if (visible === measurementsVisibleToAll) return;
  measurementsVisibleToAll = visible;
  measurementVisibilityListeners.forEach(listener => listener());
}

export function useSessionMapMeasurementsVisibleToAll() {
  return useSyncExternalStore(
    listener => { measurementVisibilityListeners.add(listener); return () => measurementVisibilityListeners.delete(listener); },
    () => measurementsVisibleToAll,
    () => true,
  );
}

export function setSessionMapDrawMode(mode: SessionMapDrawMode) {
  drawMode = mode; drawSnapshot = { mode: drawMode, style: drawStyle, textStyle }; drawListeners.forEach(listener => listener());
}

export function updateSessionMapDrawStyle(update: Partial<SessionMapDrawingStyle>) {
  drawStyle = { ...drawStyle, ...update }; drawSnapshot = { mode: drawMode, style: drawStyle, textStyle }; drawListeners.forEach(listener => listener());
}

export function updateSessionMapTextStyle(update: Partial<SessionMapTextStyle>) { textStyle = { ...textStyle, ...update }; drawSnapshot = { mode: drawMode, style: drawStyle, textStyle }; drawListeners.forEach(listener => listener()); }

export function useSessionMapDrawSettings() {
  return useSyncExternalStore(listener => { drawListeners.add(listener); return () => drawListeners.delete(listener); }, () => drawSnapshot, () => ({ mode: 'freehand' as const, style: DEFAULT_SESSION_DRAW_STYLE, textStyle: DEFAULT_SESSION_TEXT_STYLE }));
}

export function configureSessionMapDrawingClear(handler: (() => void) | null) { clearDrawingsHandler = handler; }
export function requestSessionMapDrawingClear() { clearDrawingsHandler?.(); }

export function updateSessionMapFogSettings(update: Partial<SessionMapFogSettings>) {
  const styleChanged = (update.color !== undefined && update.color !== fogSettings.color) || (update.strokeWidth !== undefined && update.strokeWidth !== fogSettings.strokeWidth);
  fogSettings = { ...fogSettings, ...update, styleRevision: styleChanged ? fogSettings.styleRevision + 1 : fogSettings.styleRevision };
  if (update.magnetEnabled !== undefined || update.gridSnapEnabled !== undefined || update.gridSnapMode !== undefined) {
    try {
      window.localStorage.setItem(FOG_PREFERENCES_STORAGE_KEY, JSON.stringify({ magnetEnabled: fogSettings.magnetEnabled, gridSnapEnabled: fogSettings.gridSnapEnabled, gridSnapMode: fogSettings.gridSnapMode }));
    } catch { /* Storage may be unavailable; settings still work for the current session. */ }
  }
  fogSnapshot = fogSettings;
  fogListeners.forEach(listener => listener());
}

export function useSessionMapFogSettings() {
  return useSyncExternalStore(listener => { fogListeners.add(listener); return () => fogListeners.delete(listener); }, () => fogSnapshot, () => fogSettings);
}

export function hydrateSessionMapFogStyle(style: Pick<SessionMapFogSettings, 'color' | 'strokeWidth'>) {
  if (style.color === fogSettings.color && style.strokeWidth === fogSettings.strokeWidth) return;
  fogSettings = { ...fogSettings, ...style };
  fogSnapshot = fogSettings;
  fogListeners.forEach(listener => listener());
}

export function setSessionMapFogFullMapCovered(covered: boolean) {
  if (fogSettings.fullMapCovered === covered) return;
  fogSettings = { ...fogSettings, fullMapCovered: covered };
  fogSnapshot = fogSettings;
  fogListeners.forEach(listener => listener());
}

export function configureSessionMapFogCoverFullMap(handler: (() => void) | null) { coverFullMapHandler = handler; }
export function requestSessionMapFogCoverFullMap() { coverFullMapHandler?.(); }
export function configureSessionMapFogClear(handler: (() => void) | null) { clearFogHandler = handler; }
export function requestSessionMapFogClear() { clearFogHandler?.(); }
export function configureSessionMapFogSelectionClear(handler: (() => void) | null) { clearFogSelectionHandler = handler; }
export function requestSessionMapFogSelectionClear() { clearFogSelectionHandler?.(); }
export function configureSessionMapAutomaticFog(handler: (() => void) | null) { automaticFogHandler = handler; }
export function requestSessionMapAutomaticFog() { automaticFogHandler?.(); }
export function setSessionMapAutomaticFogProgress(progress: number, stage: string) {
  const nextProgress = Math.max(0, Math.min(100, Math.round(progress)));
  automaticFogState = { ...automaticFogState, status: 'processing', progress: automaticFogState.status === 'processing' ? Math.max(automaticFogState.progress, nextProgress) : nextProgress, stage, error: null };
  automaticFogListeners.forEach(listener => listener());
}
export function showSessionMapAutomaticFogResult(summary: Pick<SessionMapAutomaticFogState, 'areas' | 'walls' | 'doors' | 'windows' | 'source' | 'engine'>, onApply: () => void) {
  automaticFogApplyHandler = onApply;
  automaticFogState = { status: 'result', progress: 100, stage: 'Analisi completata', ...summary, error: null };
  automaticFogListeners.forEach(listener => listener());
}
export function showSessionMapAutomaticFogError(error: string) {
  automaticFogApplyHandler = null;
  automaticFogState = { ...automaticFogState, status: 'error', progress: 0, stage: '', error };
  automaticFogListeners.forEach(listener => listener());
}
export function closeSessionMapAutomaticFog() {
  automaticFogApplyHandler = null;
  automaticFogState = { status: 'idle', progress: 0, stage: '', areas: 0, walls: 0, doors: 0, windows: 0, source: null, engine: null, error: null };
  automaticFogListeners.forEach(listener => listener());
}
export function applySessionMapAutomaticFog() { const apply = automaticFogApplyHandler; closeSessionMapAutomaticFog(); apply?.(); }
export function useSessionMapAutomaticFogState() {
  return useSyncExternalStore(listener => { automaticFogListeners.add(listener); return () => automaticFogListeners.delete(listener); }, () => automaticFogState, () => automaticFogState);
}

export function configureSessionGrid(settings: SessionGridSettings, editable: boolean, onChange: ((settings: SessionGridSettings) => void) | null) {
  gridSettings = settings;
  gridEditable = editable;
  gridChange = onChange;
  gridSnapshot = { settings: gridSettings, editable: gridEditable };
  gridListeners.forEach(listener => listener());
}

export function updateSessionGrid(update: Partial<SessionGridSettings>) {
  if (!gridEditable) return;
  gridSettings = { ...gridSettings, ...update };
  gridSnapshot = { settings: gridSettings, editable: gridEditable };
  gridListeners.forEach(listener => listener());
  gridChange?.(gridSettings);
}

export function useSessionGrid() {
  return useSyncExternalStore(
    listener => { gridListeners.add(listener); return () => gridListeners.delete(listener); },
    () => gridSnapshot,
    () => ({ settings: DEFAULT_SESSION_GRID, editable: false }),
  );
}

export function configureSessionMapFit(available: boolean, handler: ((mode: SessionMapFitMode) => void) | null) {
  const availabilityChanged = mapFitAvailable !== available;
  mapFitAvailable = available;
  mapFitHandler = handler;
  if (availabilityChanged) mapFitListeners.forEach(listener => listener());
}

export function requestSessionMapFit(mode: SessionMapFitMode) {
  mapFitHandler?.(mode);
}

export function useSessionMapFitAvailable() {
  return useSyncExternalStore(
    listener => { mapFitListeners.add(listener); return () => mapFitListeners.delete(listener); },
    () => mapFitAvailable,
    () => false,
  );
}

export function configureSessionMapCenter(available: boolean, handler: (() => void) | null) {
  const availabilityChanged = mapCenterAvailable !== available;
  mapCenterAvailable = available;
  mapCenterHandler = handler;
  if (availabilityChanged) mapCenterListeners.forEach(listener => listener());
}

export function requestSessionMapCenter() {
  mapCenterHandler?.();
}

export function useSessionMapCenterAvailable() {
  return useSyncExternalStore(
    listener => { mapCenterListeners.add(listener); return () => mapCenterListeners.delete(listener); },
    () => mapCenterAvailable,
    () => false,
  );
}

export function configureSessionMapHistory(undo: (() => void) | null, redo: (() => void) | null, canUndo: boolean, canRedo: boolean) {
  const availabilityChanged = mapUndoAvailable !== canUndo || mapRedoAvailable !== canRedo;
  mapUndoHandler = undo;
  mapRedoHandler = redo;
  mapUndoAvailable = canUndo;
  mapRedoAvailable = canRedo;
  if (availabilityChanged) mapHistoryListeners.forEach(listener => listener());
}

export function requestSessionMapUndo() { mapUndoHandler?.(); }
export function requestSessionMapRedo() { mapRedoHandler?.(); }

export function useSessionMapUndoAvailable() {
  return useSyncExternalStore(listener => { mapHistoryListeners.add(listener); return () => mapHistoryListeners.delete(listener); }, () => mapUndoAvailable, () => false);
}

export function useSessionMapRedoAvailable() {
  return useSyncExternalStore(listener => { mapHistoryListeners.add(listener); return () => mapHistoryListeners.delete(listener); }, () => mapRedoAvailable, () => false);
}

export function setSessionMapCalibrationActive(active: boolean) {
  if (active === mapCalibrationActive) return;
  mapCalibrationActive = active;
  mapCalibrationListeners.forEach(listener => listener());
}

export function useSessionMapCalibrationActive() {
  return useSyncExternalStore(
    listener => { mapCalibrationListeners.add(listener); return () => mapCalibrationListeners.delete(listener); },
    () => mapCalibrationActive,
    () => false,
  );
}

export function useActiveSessionMapTool(): SessionMapTool {
  return useSyncExternalStore(
    listener => { listeners.add(listener); return () => listeners.delete(listener); },
    () => activeMapTool,
    () => 'move',
  );
}
