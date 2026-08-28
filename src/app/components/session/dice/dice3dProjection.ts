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

function percentileTens(face: number): number {
  if (face === 100 || face < 10) return 100;
  return Math.floor(face / 10) * 10;
}

function percentileUnits(face: number): number {
  const units = face % 10;
  return units === 0 ? 10 : units;
}

/**
 * Converts the already-canonical Hollowgate roll result into deterministic
 * notation understood by @3d-dice/dice-box-threejs.
 *
 * Important: this function never rolls anything. It only projects the faces
 * already produced by diceEngine, including discarded dice and explosion
 * rolls, because the 3D animation is decorative and must never become a
 * second source of truth for the result stored in the session ledger.
 *
 * @3d-dice/dice-box-threejs models d100 as the percentile tens die only
 * (10,20,...90,00). Hollowgate therefore projects every canonical d100 face
 * into two physical dice: d100 for the tens digit and d10 for the units digit.
 */
export function projectRollTo3D(result: RollResult): Dice3DProjectionChunk[] {
  return result.diceGroups.flatMap((group): Dice3DProjectionChunk[] => {
    if (!isSupportedSides(group.sides) || group.rolls.length === 0) return [];

    const values = group.rolls.map((die) => die.face);

    if (group.sides === 100) {
      const tens = values.map(percentileTens);
      const units = values.map(percentileUnits);
      return [
        {
          sides: 100,
          values: tens,
          notation: `${tens.length}d100@${tens.join(',')}`,
        },
        {
          sides: 10,
          values: units,
          notation: `${units.length}d10@${units.join(',')}`,
        },
      ];
    }

    return [{
      sides: group.sides,
      values,
      notation: `${values.length}d${group.sides}@${values.join(',')}`,
    }];
  });
}
