export interface MapPoint {
  x: number;
  y: number;
}

export interface MapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type MapRegionGeometry =
  | { kind: 'rect'; rect: MapRect }
  | { kind: 'polygon'; points: MapPoint[] };

export interface SceneMapRegion {
  id: string;
  label: string;
  color: string;
  geometry: MapRegionGeometry;
}

export interface ChapterMapMetadata {
  imageUrl: string | null;
  previewUrl?: string | null;
  displayUrl?: string | null;
  source?: 'url' | 'upload';
  fileName?: string | null;
  gridVisible: boolean;
  gridColumns: number;
  gridRows: number;
}

export type SessionGridType = 'square' | 'hex-flat' | 'hex-pointy';
export type SessionGridLineStyle = 'solid' | 'dashed' | 'dotted' | 'crosses' | 'corners';
export interface SessionGridSettings {
  visible: boolean;
  type: SessionGridType;
  lineStyle?: SessionGridLineStyle;
  color?: string;
  opacity: number;
  snap: boolean;
  distance: number;
  unit: string;
  cellSize: number;
}

export interface SceneContextMetadata {
  timeOfDay: string;
  period: string;
  condition: string;
}
