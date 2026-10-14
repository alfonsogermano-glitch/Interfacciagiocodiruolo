import type { SessionMapTokenVisual } from '../../../types/sessionMapToken';

type SessionMapTokenDropHandler = (visual: SessionMapTokenVisual, clientX: number, clientY: number) => boolean;

let dropHandler: SessionMapTokenDropHandler | null = null;

export function registerSessionMapTokenDropHandler(handler: SessionMapTokenDropHandler) {
  dropHandler = handler;
  return () => {
    if (dropHandler === handler) dropHandler = null;
  };
}

export function dropSessionMapToken(visual: SessionMapTokenVisual, clientX: number, clientY: number) {
  return dropHandler?.(visual, clientX, clientY) ?? false;
}
