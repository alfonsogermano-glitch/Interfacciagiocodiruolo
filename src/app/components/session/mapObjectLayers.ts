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

export function doBoundsOverlap(first: MapObjectBounds, second: MapObjectBounds) {
  return first.x < second.x + second.width
    && first.x + first.width > second.x
    && first.y < second.y + second.height
    && first.y + first.height > second.y;
}

export function getRotatedSquareBounds(position: { x: number; y: number }, size: number, rotation = 0): MapObjectBounds {
  const angle = rotation * Math.PI / 180;
  const boundsSize = size * (Math.abs(Math.cos(angle)) + Math.abs(Math.sin(angle)));
  const offset = (boundsSize - size) / 2;
  return { x: position.x - offset, y: position.y - offset, width: boundsSize, height: boundsSize };
}

export function rectangleCoverage(bounds: MapObjectBounds, selection: MapObjectBounds) {
  const width = Math.max(0, Math.min(bounds.x + bounds.width, selection.x + selection.width) - Math.max(bounds.x, selection.x));
  const height = Math.max(0, Math.min(bounds.y + bounds.height, selection.y + selection.height) - Math.max(bounds.y, selection.y));
  return bounds.width > 0 && bounds.height > 0 ? width * height / (bounds.width * bounds.height) : 0;
}

export function pointInPolygon(point: { x: number; y: number }, polygon: { x: number; y: number }[]) {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
    const a = polygon[current];
    const b = polygon[previous];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function polygonCoverage(bounds: MapObjectBounds, polygon: { x: number; y: number }[], samples = 9) {
  let inside = 0;
  for (let row = 0; row < samples; row += 1) for (let column = 0; column < samples; column += 1) {
    const point = { x: bounds.x + bounds.width * (column + 0.5) / samples, y: bounds.y + bounds.height * (row + 0.5) / samples };
    if (pointInPolygon(point, polygon)) inside += 1;
  }
  return inside / (samples * samples);
}

export function reorderMapObjects<T extends { id: string }>(objects: T[], objectId: string, move: MapLayerMove, overlaps?: (first: T, second: T) => boolean) {
  const index = objects.findIndex(object => object.id === objectId);
  if (index === -1) return objects;
  const object = objects[index];
  let overlappingIndex = -1;
  if (overlaps && move === 'forward') {
    for (let candidateIndex = index + 1; candidateIndex < objects.length; candidateIndex += 1) {
      if (overlaps(object, objects[candidateIndex])) { overlappingIndex = candidateIndex; break; }
    }
  } else if (overlaps && move === 'backward') {
    for (let candidateIndex = index - 1; candidateIndex >= 0; candidateIndex -= 1) {
      if (overlaps(object, objects[candidateIndex])) { overlappingIndex = candidateIndex; break; }
    }
  }
  const targetIndex = move === 'front'
    ? objects.length - 1
    : move === 'back'
      ? 0
      : move === 'forward'
        ? overlaps ? overlappingIndex : Math.min(objects.length - 1, index + 1)
        : overlaps ? overlappingIndex : Math.max(0, index - 1);
  if (targetIndex === -1) return objects;
  if (targetIndex === index) return objects;
  const next = [...objects];
  const [movedObject] = next.splice(index, 1);
  next.splice(targetIndex, 0, movedObject);
  return next;
}
