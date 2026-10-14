export type MapLayerMove = 'forward' | 'backward' | 'front' | 'back';

export interface MapObjectBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function isBoundsFullyContained(inner: MapObjectBounds, outer: MapObjectBounds) {
  return inner.x >= outer.x
    && inner.y >= outer.y
    && inner.x + inner.width <= outer.x + outer.width
    && inner.y + inner.height <= outer.y + outer.height;
}

export function reorderMapObjects<T extends { id: string }>(objects: T[], objectId: string, move: MapLayerMove) {
  const index = objects.findIndex(object => object.id === objectId);
  if (index === -1) return objects;
  const targetIndex = move === 'front'
    ? objects.length - 1
    : move === 'back'
      ? 0
      : move === 'forward'
        ? Math.min(objects.length - 1, index + 1)
        : Math.max(0, index - 1);
  if (targetIndex === index) return objects;
  const next = [...objects];
  const [object] = next.splice(index, 1);
  next.splice(targetIndex, 0, object);
  return next;
}
