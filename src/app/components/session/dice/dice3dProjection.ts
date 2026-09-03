import type {
  CustomDiePhysicalRole,
  CustomDieRollSnapshot,
  DiceAppearance,
  RollResult,
} from './diceTypes.ts';

export const DICE_3D_SUPPORTED_SIDES = [4, 6, 8, 10, 12, 20, 100] as const;
export type Dice3DSupportedSides = (typeof DICE_3D_SUPPORTED_SIDES)[number];

export interface Dice3DCustomMaterial {
  customDie: CustomDieRollSnapshot;
  role: CustomDiePhysicalRole;
}

export interface Dice3DAppearanceDescriptor {
  appearance: DiceAppearance;
  custom: boolean;
  preserveFaceColors: boolean;
}

export interface Dice3DProjectionChunk {
  sides: Dice3DSupportedSides;
  values: number[];
  notation: string;
  customMaterials?: Array<Dice3DCustomMaterial | null>;
  appearances?: Array<Dice3DAppearanceDescriptor | null>;
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

function customForcedValue(sides: Dice3DSupportedSides, face: number): number {
  return sides === 100 ? (face === 10 ? 100 : face * 10) : face;
}

function customAppearance(snapshot: CustomDieRollSnapshot): Dice3DAppearanceDescriptor {
  return {
    appearance: {
      bodyColor: snapshot.bodyColor,
      symbolColor: snapshot.symbolColor,
      skinId: snapshot.skinId ?? 'none',
      effectsEnabled: snapshot.effectsEnabled ?? false,
    },
    custom: true,
    preserveFaceColors: snapshot.faces.some((face) => face.visual.kind === 'image'),
  };
}

/** Projects canonical results only; it never generates a second random outcome. */
export function projectRollTo3D(result: RollResult): Dice3DProjectionChunk[] {
  return result.diceGroups.flatMap((group): Dice3DProjectionChunk[] => {
    if (group.customDieId && group.customDieSnapshot) {
      return group.rolls.flatMap((die): Dice3DProjectionChunk[] => {
        if (!isSupportedSides(die.sides)) return [];
        const forced = customForcedValue(die.sides, die.face);
        const descriptor: Dice3DCustomMaterial = {
          customDie: group.customDieSnapshot!,
          role: die.physicalRole ?? 'single',
        };
        return [{
          sides: die.sides,
          values: [forced],
          notation: `1d${die.sides}@${forced}`,
          customMaterials: [descriptor],
          appearances: [customAppearance(group.customDieSnapshot!)],
        }];
      });
    }

    if (!isSupportedSides(group.sides) || group.rolls.length === 0) return [];
    const values = group.rolls.map((die) => die.face);
    const appearance = group.appearance
      ? {
        appearance: { ...group.appearance },
        custom: false,
        preserveFaceColors: false,
      } satisfies Dice3DAppearanceDescriptor
      : null;

    if (group.sides === 100) {
      const tens = values.map(percentileTens);
      const units = values.map(percentileUnits);
      return [
        {
          sides: 100,
          values: tens,
          notation: `${tens.length}d100@${tens.join(',')}`,
          appearances: tens.map(() => appearance),
        },
        {
          sides: 10,
          values: units,
          notation: `${units.length}d10@${units.join(',')}`,
          appearances: units.map(() => appearance),
        },
      ];
    }

    return [{
      sides: group.sides,
      values,
      notation: `${values.length}d${group.sides}@${values.join(',')}`,
      appearances: values.map(() => appearance),
    }];
  });
}
