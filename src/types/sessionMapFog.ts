export type SessionMapFogKind =
  | "polygon"
  | "freehand"
  | "rectangle"
  | "circle"
  | "triangle"
  | "hexagon";

export type SessionMapFogOperation = "cover" | "reveal";
export type SessionMapFogPersistence = "volatile" | "semi-persistent" | "permanent";

export type SessionMapFogPoint = {
  x: number;
  y: number;
};

export interface SessionMapFogStyle {
  color: string;
  strokeWidth: number;
}

export interface SessionMapFog {
  id: string;
  kind: SessionMapFogKind;
  operation: SessionMapFogOperation;
  /** Missing on legacy fog means permanent, preserving the original behavior. */
  persistence?: SessionMapFogPersistence;
  /** Previously observed world-space polygons, including optional holes. */
  exploredAreas?: SessionMapFogPoint[][][];
  /** Subset of exploredAreas erased specifically by illumination. */
  lightExploredAreas?: SessionMapFogPoint[][][];
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  points?: SessionMapFogPoint[];
  /** Local-space polygon rings. The first ring is the shell; later rings are holes. */
  rings?: SessionMapFogPoint[][];
  style: SessionMapFogStyle;
  enabled?: boolean;
  locked?: boolean;
  magnetEnabled?: boolean;
  magnetGroupId?: string | null;
  fullMap?: boolean;
  visionBlocker?: {
    kind: "wall" | "door" | "window";
    confidence: number;
    source: "local" | "ai" | "manual";
  };
  createdAt: string;
  updatedAt: string;
}
