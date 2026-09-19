export const DICE_3D_THROW_STRENGTH = 1.6;
export const DICE_3D_MIN_SPEED_RATIO = 1.3;
export const DICE_3D_MAX_SPEED_RATIO = 3.1;
export const DICE_3D_MIN_SPIN = 8;
export const DICE_3D_MAX_SPIN = 15;
export const DICE_3D_ROLL_TIMEOUT_MS = 8_000;

type Dice3DVector3 = { x: number; y: number; z: number };

export type Dice3DNotationVector = {
  pos?: Dice3DVector3;
  velocity?: Dice3DVector3;
  angle?: Dice3DVector3;
};

export type Dice3DNotationVectors = {
  vectors?: Dice3DNotationVector[];
};

function clampHorizontal(vector: Dice3DVector3, min: number, max: number, fallback: Dice3DVector3): void {
  const speed = Math.hypot(vector.x, vector.y);
  if (speed >= min && speed <= max) return;
  const target = Math.min(max, Math.max(min, speed));
  const source = speed > 0.001 ? vector : fallback;
  const sourceLength = Math.hypot(source.x, source.y);
  if (sourceLength <= 0.001) {
    vector.x = target;
    vector.y = 0;
    return;
  }
  vector.x = source.x / sourceLength * target;
  vector.y = source.y / sourceLength * target;
}

export function calibrateDice3DMotion<T extends Dice3DNotationVectors>(notationVectors: T, viewportShortSide: number): T {
  const shortSide = Math.max(320, viewportShortSide);
  for (const vector of notationVectors.vectors ?? []) {
    if (vector.velocity) {
      const inward = vector.pos
        ? { x: -vector.pos.x, y: -vector.pos.y, z: 0 }
        : { x: 1, y: 0, z: 0 };
      clampHorizontal(
        vector.velocity,
        shortSide * DICE_3D_MIN_SPEED_RATIO,
        shortSide * DICE_3D_MAX_SPEED_RATIO,
        inward,
      );
    }
    if (vector.angle) {
      const rollingFallback = vector.velocity
        ? { x: -vector.velocity.y, y: vector.velocity.x, z: 0 }
        : { x: 1, y: 0, z: 0 };
      clampHorizontal(vector.angle, DICE_3D_MIN_SPIN, DICE_3D_MAX_SPIN, rollingFallback);
    }
  }
  return notationVectors;
}
