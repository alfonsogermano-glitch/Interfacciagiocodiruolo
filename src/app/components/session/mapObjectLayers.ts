export type MapLayerMove = 'forward' | 'backward' | 'front' | 'back';
export type MapObjectFamily = string;
export type MapObjectRef = { family: MapObjectFamily; id: string };

const refKey = (ref: MapObjectRef) => `${ref.family}\u0000${ref.id}`;

export function reconcileMapObjectOrder(
  order: MapObjectRef[] | undefined,
  families: ReadonlyArray<readonly [MapObjectFamily, ReadonlyArray<{ id: string }>]>,
) {
  const available = new Set(families.flatMap(([family, objects]) => objects.map(object => refKey({ family, id: object.id }))));
  const seen = new Set<string>();
  const next: MapObjectRef[] = [];
  for (const ref of order ?? []) {
    if (!ref || typeof ref.family !== 'string' || typeof ref.id !== 'string') continue;
    const key = refKey(ref);
    if (!available.has(key) || seen.has(key)) continue;
    seen.add(key);
    next.push({ family: ref.family, id: ref.id });
  }
  // Missing legacy objects retain the historical drawings -> tokens -> POIs visual order.
  for (const [family, objects] of families) for (const object of objects) {
    const ref = { family, id: object.id };
    const key = refKey(ref);
    if (!seen.has(key)) {
      seen.add(key);
      next.push(ref);
    }
  }
  return next;
}

export function moveMapObjectBlock(order: MapObjectRef[], refs: MapObjectRef[], move: MapLayerMove, overlaps?: (first: MapObjectRef, second: MapObjectRef) => boolean) {
  const selectedKeys = new Set(refs.map(refKey));
  if (selectedKeys.size === 0) return order;
  const selected = order.filter(ref => selectedKeys.has(refKey(ref)));
  if (selected.length === 0) return order;
  const remaining = order.filter(ref => !selectedKeys.has(refKey(ref)));
  const firstIndex = order.findIndex(ref => selectedKeys.has(refKey(ref)));
  const selectedBeforeFirst = order.slice(0, firstIndex).filter(ref => selectedKeys.has(refKey(ref))).length;
  const insertion = firstIndex - selectedBeforeFirst;
  let target = insertion;
  if (move === 'front') target = remaining.length;
  else if (move === 'back') target = 0;
  else if (move === 'forward') {
    if (overlaps) {
      const candidate = order.findIndex((ref, index) => index > firstIndex && !selectedKeys.has(refKey(ref)) && selected.some(item => overlaps(item, ref)));
      if (candidate === -1) return order;
      const candidateKey = refKey(order[candidate]);
      target = remaining.findIndex(ref => refKey(ref) === candidateKey) + 1;
    } else target = Math.min(remaining.length, insertion + 1);
  } else if (overlaps) {
    let candidate = -1;
    for (let index = firstIndex - 1; index >= 0; index -= 1) {
      const ref = order[index];
      if (!selectedKeys.has(refKey(ref)) && selected.some(item => overlaps(item, ref))) { candidate = index; break; }
    }
    if (candidate === -1) return order;
    const candidateKey = refKey(order[candidate]);
    target = remaining.findIndex(ref => refKey(ref) === candidateKey);
  } else target = Math.max(0, insertion - 1);
  const next = [...remaining.slice(0, target), ...selected, ...remaining.slice(target)];
  return next.every((ref, index) => refKey(ref) === refKey(order[index])) ? order : next;
}

export function filterMapObjectOrder(order: MapObjectRef[], visible: ReadonlyArray<MapObjectRef>) {
  const keys = new Set(visible.map(refKey));
  return order.filter(ref => keys.has(refKey(ref)));
}

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

export function getRotatedRectBounds(position: { x: number; y: number }, width: number, height: number, rotation = 0): MapObjectBounds {
  const angle = rotation * Math.PI / 180;
  const boundsWidth = Math.abs(width * Math.cos(angle)) + Math.abs(height * Math.sin(angle));
  const boundsHeight = Math.abs(width * Math.sin(angle)) + Math.abs(height * Math.cos(angle));
  return { x: position.x + (width - boundsWidth) / 2, y: position.y + (height - boundsHeight) / 2, width: boundsWidth, height: boundsHeight };
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
