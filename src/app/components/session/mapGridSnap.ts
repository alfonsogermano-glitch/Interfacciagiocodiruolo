import type { SessionGridSettings } from '../../../types/mapGeometry';

export type GridPosition = { x: number; y: number };
export type GridObjectSize = { width: number; height: number };

function nearestPoint(target: GridPosition, candidates: GridPosition[]): GridPosition {
  return candidates.reduce((nearest, candidate) => {
    const nearestDistance = (nearest.x - target.x) ** 2 + (nearest.y - target.y) ** 2;
    const candidateDistance = (candidate.x - target.x) ** 2 + (candidate.y - target.y) ** 2;
    return candidateDistance < nearestDistance ? candidate : nearest;
  });
}

export function snapToSessionGrid(position: GridPosition, settings: SessionGridSettings, objectSize: GridObjectSize = { width: 0, height: 0 }): GridPosition {
  if (!settings.snap || settings.cellSize <= 0) return position;

  const radius = settings.cellSize / 2;
  if (settings.type === 'square') {
    const step = radius;
    return { x: Math.round(position.x / step) * step, y: Math.round(position.y / step) * step };
  }

  const target = { x: position.x + objectSize.width / 2, y: position.y + objectSize.height / 2 };
  const candidates: GridPosition[] = [];
  if (settings.type === 'hex-pointy') {
    const width = Math.sqrt(3) * radius;
    const approximateRow = Math.round((target.y - radius) / (radius * 1.5));
    for (let row = approximateRow - 2; row <= approximateRow + 2; row += 1) {
      const offsetX = width / 2 + (Math.abs(row) % 2) * width / 2;
      const approximateColumn = Math.round((target.x - offsetX) / width);
      for (let column = approximateColumn - 1; column <= approximateColumn + 1; column += 1) {
        candidates.push({ x: offsetX + column * width, y: radius + row * radius * 1.5 });
      }
    }
  } else {
    const height = Math.sqrt(3) * radius;
    const approximateColumn = Math.round((target.x - radius) / (radius * 1.5));
    for (let column = approximateColumn - 2; column <= approximateColumn + 2; column += 1) {
      const offsetY = height / 2 + (Math.abs(column) % 2) * height / 2;
      const approximateRow = Math.round((target.y - offsetY) / height);
      for (let row = approximateRow - 1; row <= approximateRow + 1; row += 1) {
        candidates.push({ x: radius + column * radius * 1.5, y: offsetY + row * height });
      }
    }
  }

  const snappedCenter = nearestPoint(target, candidates);
  return { x: snappedCenter.x - objectSize.width / 2, y: snappedCenter.y - objectSize.height / 2 };
}
