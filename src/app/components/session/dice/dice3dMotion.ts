export const DICE_3D_THROW_STRENGTH = 1.4;
export const DICE_3D_SPIN_MULTIPLIER = 1.2;

export type Dice3DNotationVector = {
  angle?: { x: number; y: number; z: number };
};

export type Dice3DNotationVectors = {
  vectors?: Dice3DNotationVector[];
};

export function boostDice3DSpin<T extends Dice3DNotationVectors>(notationVectors: T): T {
  for (const vector of notationVectors.vectors ?? []) {
    if (!vector.angle) continue;
    vector.angle.x *= DICE_3D_SPIN_MULTIPLIER;
    vector.angle.y *= DICE_3D_SPIN_MULTIPLIER;
    vector.angle.z *= DICE_3D_SPIN_MULTIPLIER;
  }
  return notationVectors;
}
