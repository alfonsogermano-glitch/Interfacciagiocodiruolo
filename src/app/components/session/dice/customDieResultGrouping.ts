import type { RollCustomDieFace, RollDiceGroup } from './diceTypes.ts';

export interface GroupedCustomDieResult {
  id: string;
  faces: RollCustomDieFace[];
  count: number;
  active: boolean;
  contribution: number | null;
  sortValue: number;
}

function faceIdentity(face: RollCustomDieFace): unknown {
  return {
    visual: face.visual,
    label: face.label ?? null,
    numericValue: face.numericValue,
  };
}

export function groupCustomDieResults(group: RollDiceGroup): GroupedCustomDieResult[] {
  const logicalResults = new Map<string, typeof group.rolls>();
  for (const roll of group.rolls) {
    if (!roll.customFace) continue;
    const logicalKey = roll.logicalRollIndex === undefined
      ? roll.id
      : `${roll.source}:${roll.logicalRollIndex}`;
    const current = logicalResults.get(logicalKey) ?? [];
    current.push(roll);
    logicalResults.set(logicalKey, current);
  }

  const grouped = new Map<string, GroupedCustomDieResult>();
  for (const rolls of logicalResults.values()) {
    const orderedRolls = [...rolls].sort((left, right) => {
      const roleOrder = { tens: 0, units: 1, single: 0 } as const;
      return roleOrder[left.physicalRole ?? 'single'] - roleOrder[right.physicalRole ?? 'single'];
    });
    const faces = orderedRolls.flatMap((roll) => roll.customFace ? [roll.customFace] : []);
    if (faces.length === 0) continue;
    const primaryRoll = orderedRolls.find((roll) => roll.physicalRole !== 'units') ?? orderedRolls[0];
    const active = orderedRolls.some((roll) => roll.active);
    const contribution = primaryRoll.contribution;
    const sortValue = contribution ?? faces.reduce((value, face) => (value * 101) + face.index, 0);
    const key = JSON.stringify({ faces: faces.map(faceIdentity), active, contribution });
    const existing = grouped.get(key);
    if (existing) {
      existing.count += 1;
      existing.sortValue = Math.min(existing.sortValue, sortValue);
    } else {
      grouped.set(key, { id: primaryRoll.id, faces, count: 1, active, contribution, sortValue });
    }
  }

  return [...grouped.values()].sort((left, right) => left.sortValue - right.sortValue || left.id.localeCompare(right.id));
}
