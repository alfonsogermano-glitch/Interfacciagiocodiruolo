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
  gridVisible: boolean;
  gridColumns: number;
  gridRows: number;
}

export interface SceneContextMetadata {
  timeOfDay: string;
  period: string;
  condition: string;
}
