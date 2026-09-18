import type { RollCustomDieFace, RollDiceGroup } from './diceTypes.ts';

export interface GroupedCustomDieResult {
  id: string;
  faces: RollCustomDieFace[];
  count: number;
  active: boolean;
  contribution: number | null;
  sortValue: number;
}

function faceGroupIdentity(face: RollCustomDieFace): string {
  return face.resultGroup === null || face.resultGroup === undefined
    ? `face:${face.role}:${face.index}`
    : `group:${face.resultGroup}`;
}

function faceGroupSortValue(face: RollCustomDieFace): number {
  if (face.resultGroup !== null && face.resultGroup !== undefined) return face.resultGroup;
  const roleOffset = face.role === 'units' ? 100 : 0;
  return 1_000_000 + roleOffset + face.index;
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
    const sortValue = faces.reduce((value, face) => (value * 1_000_201) + faceGroupSortValue(face), 0);
    const key = JSON.stringify({ groups: faces.map(faceGroupIdentity), active });
    const existing = grouped.get(key);
    if (existing) {
      existing.count += 1;
      existing.sortValue = Math.min(existing.sortValue, sortValue);
      if (existing.contribution !== contribution) existing.contribution = null;
    } else {
      grouped.set(key, { id: primaryRoll.id, faces, count: 1, active, contribution, sortValue });
    }
  }

  return [...grouped.values()].sort((left, right) => left.sortValue - right.sortValue || left.id.localeCompare(right.id));
}
