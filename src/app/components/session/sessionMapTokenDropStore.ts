import type { SessionMapTokenVisual } from '../../../types/sessionMapToken';

export interface SessionMapTokenGrabOffset { x: number; y: number }
type SessionMapTokenDropHandler = (visual: SessionMapTokenVisual, clientX: number, clientY: number, grabOffset: SessionMapTokenGrabOffset) => boolean;

let dropHandler: SessionMapTokenDropHandler | null = null;

export function registerSessionMapTokenDropHandler(handler: SessionMapTokenDropHandler) {
  dropHandler = handler;
  return () => {
    if (dropHandler === handler) dropHandler = null;
  };
}

export function dropSessionMapToken(visual: SessionMapTokenVisual, clientX: number, clientY: number, grabOffset: SessionMapTokenGrabOffset = { x: 0.5, y: 0.5 }) {
  return dropHandler?.(visual, clientX, clientY, grabOffset) ?? false;
}
