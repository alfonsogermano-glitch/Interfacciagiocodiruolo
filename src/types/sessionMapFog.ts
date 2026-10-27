export type SessionMapFogKind =
  | "polygon"
  | "freehand"
  | "rectangle"
  | "circle"
  | "triangle"
  | "hexagon";

export type SessionMapFogOperation = "cover" | "reveal";

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
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  points?: SessionMapFogPoint[];
  style: SessionMapFogStyle;
  enabled?: boolean;
  locked?: boolean;
  magnetEnabled?: boolean;
  magnetGroupId?: string | null;
  fullMap?: boolean;
  createdAt: string;
  updatedAt: string;
}
