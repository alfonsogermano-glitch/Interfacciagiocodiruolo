import { useSyncExternalStore } from 'react';
import type { SessionGridLineStyle, SessionGridSettings, SessionGridType } from '../../../types/mapGeometry';

export type { SessionGridLineStyle, SessionGridSettings, SessionGridType } from '../../../types/mapGeometry';

export type SessionMapTool = 'move' | 'select' | 'grid' | 'measure' | 'draw' | 'pin' | 'fog' | 'walls' | 'pointer';
export type SessionMapSelectionMode = 'rectangle' | 'freehand';
export type SessionMapMeasureMode = 'line' | 'circle' | 'cone' | 'visibility';
export const DEFAULT_SESSION_GRID: SessionGridSettings = { visible: true, type: 'square', lineStyle: 'solid', color: '#38bdf8', opacity: 0, snap: false, squareSnapMode: 'half-step', distance: 5, unit: 'Metri', cellSize: 100 };

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
