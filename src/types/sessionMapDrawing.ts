export type SessionMapDrawingKind = 'freehand' | 'polygon' | 'line' | 'rectangle' | 'circle' | 'triangle' | 'hexagon' | 'text';
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

export interface SessionMapDrawingText {
  content: string;
  fontSize: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  align: 'left' | 'center' | 'right';
  color: string;
  strokeColor: string;
  horizontalScale: number;
  orientation?: 'horizontal' | 'vertical';
  curveOffsets?: number[];
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
  text?: SessionMapDrawingText;
  locked?: boolean;
  pinned?: boolean;
  visible?: boolean;
  magnetEnabled?: boolean;
  magnetGroupId?: string | null;
  createdByProfileId?: string | null;
  createdAt: string;
  updatedAt: string;
}
