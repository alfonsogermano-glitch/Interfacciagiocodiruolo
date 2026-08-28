import type { RollResult } from './diceTypes.ts';

export const DICE_3D_SUPPORTED_SIDES = [4, 6, 8, 10, 12, 20, 100] as const;

export type Dice3DSupportedSides = (typeof DICE_3D_SUPPORTED_SIDES)[number];

export interface Dice3DProjectionChunk {
  sides: Dice3DSupportedSides;
  values: number[];
  notation: string;
}

function isSupportedSides(sides: number): sides is Dice3DSupportedSides {
  return (DICE_3D_SUPPORTED_SIDES as readonly number[]).includes(sides);
}

/**
 * Converts the already-canonical Hollowgate roll result into deterministic
 * notation understood by @3d-dice/dice-box-threejs.
 *
 * Important: this function never rolls anything. It only projects the faces
 * already produced by diceEngine, including discarded dice and explosion
 * rolls, because the 3D animation is decorative and must never become a
 * second source of truth for the result stored in the session ledger.
 */
export function projectRollTo3D(result: RollResult): Dice3DProjectionChunk[] {
  return result.diceGroups.flatMap((group) => {
    if (!isSupportedSides(group.sides) || group.rolls.length === 0) return [];

    const values = group.rolls.map((die) => die.face);
    return [{
      sides: group.sides,
      values,
      notation: `${values.length}d${group.sides}@${values.join(',')}`,
    }];
  });
}
