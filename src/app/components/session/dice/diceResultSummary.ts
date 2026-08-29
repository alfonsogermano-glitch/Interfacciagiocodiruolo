import type { RollResult } from './diceTypes.ts';

function formatResultNumber(value: number): string {
  if (Object.is(value, -0)) return '0';
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
}

export function getKeepCount(result: RollResult): number {
  return result.diceGroups.reduce(
    (count, group) => count + group.rolls.filter(
      (die) => die.active && die.keepMatched === true,
    ).length,
    0,
  );
}

export function formatPrimaryRollResult(result: RollResult): string {
  const total = formatResultNumber(result.total);
  const hasKeep = result.sourceItems.some((item) => item.kind === 'keep');
  return hasKeep ? `${getKeepCount(result)} (${total})` : total;
}
