import type { CustomDieFace } from './diceTypes.ts';

export function toggleCustomDieLibraryIconFace(
  faces: readonly CustomDieFace[],
  targetPosition: number,
): CustomDieFace[] {
  const target = faces[targetPosition];
  if (!target) throw new RangeError('Posizione faccia custom non valida.');
  const clearSelection = target.isLibraryIcon === true;
  return faces.map((face, position) => {
    if (face.role !== target.role) return face;
    return {
      ...face,
      isLibraryIcon: !clearSelection && position === targetPosition ? true : undefined,
    };
  });
}

export function getCustomDieLibraryIconFace(faces: readonly CustomDieFace[]): CustomDieFace | null {
  return faces.find((face) => face.isLibraryIcon === true) ?? null;
}

export function ensureCustomDieLibraryIconDefaults(faces: readonly CustomDieFace[]): CustomDieFace[] {
  if (!faces.some((face) => face.role === 'tens')) return faces.map((face) => face);
  const tens = faces.find((face) => face.role === 'tens' && face.isLibraryIcon === true);
  const units = faces.find((face) => face.role === 'units' && face.isLibraryIcon === true);
  if (tens && units) return faces.map((face) => face);
  return faces.map((face) => {
    if (!tens && face.role === 'tens' && face.index === 1) return { ...face, isLibraryIcon: true };
    if (!units && face.role === 'units' && face.index === 1) return { ...face, isLibraryIcon: true };
    return face;
  });
}