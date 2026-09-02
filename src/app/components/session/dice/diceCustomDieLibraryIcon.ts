import type { CustomDieFace } from './diceTypes.ts';

export function toggleCustomDieLibraryIconFace(
  faces: readonly CustomDieFace[],
  targetPosition: number,
): CustomDieFace[] {
  const target = faces[targetPosition];
  if (!target) throw new RangeError('Posizione faccia custom non valida.');
  const clearSelection = target.isLibraryIcon === true;
  return faces.map((face, position) => ({
    ...face,
    isLibraryIcon: !clearSelection && position === targetPosition ? true : undefined,
  }));
}

export function getCustomDieLibraryIconFace(faces: readonly CustomDieFace[]): CustomDieFace | null {
  return faces.find((face) => face.isLibraryIcon === true) ?? null;
}
