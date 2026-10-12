import { useSyncExternalStore } from 'react';
import type { SessionGridSettings, SessionGridType } from '../../../types/mapGeometry';

export type { SessionGridSettings, SessionGridType } from '../../../types/mapGeometry';

export type SessionMapTool = 'move' | 'select' | 'grid' | 'measure' | 'draw' | 'pin' | 'fog' | 'walls' | 'pointer';
export const DEFAULT_SESSION_GRID: SessionGridSettings = { visible: false, type: 'square', color: '#38bdf8', opacity: 0.35, snap: false, distance: 5, unit: 'Metri', cellSize: 100 };

let activeMapTool: SessionMapTool = 'move';
const listeners = new Set<() => void>();
const gridListeners = new Set<() => void>();
let gridSettings = DEFAULT_SESSION_GRID;
let gridEditable = false;
let gridChange: ((settings: SessionGridSettings) => void) | null = null;
let gridSnapshot = { settings: gridSettings, editable: gridEditable };

export function setActiveSessionMapTool(tool: SessionMapTool) {
  if (tool === activeMapTool) return;
  activeMapTool = tool;
  listeners.forEach(listener => listener());
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

export function useActiveSessionMapTool(): SessionMapTool {
  return useSyncExternalStore(
    listener => { listeners.add(listener); return () => listeners.delete(listener); },
    () => activeMapTool,
    () => 'move',
  );
}
