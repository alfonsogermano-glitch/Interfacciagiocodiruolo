export type SessionMapDrawingKind = 'freehand' | 'polygon' | 'line' | 'rectangle' | 'circle' | 'triangle' | 'hexagon';
export type SessionMapDrawingLineStyle = 'solid' | 'dashed' | 'dotted' | 'dash-dot' | 'long-dash';
export type SessionMapPoint = { x: number; y: number };

export interface SessionMapDrawingStyle {
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  opacity: number;
  fillOpacity: number;
  lineStyle: SessionMapDrawingLineStyle;
}

export interface SessionMapDrawing {
  id: string;
  kind: SessionMapDrawingKind;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  points?: SessionMapPoint[];
  style: SessionMapDrawingStyle;
  locked?: boolean;
  visible?: boolean;
  createdAt: string;
  updatedAt: string;
}
