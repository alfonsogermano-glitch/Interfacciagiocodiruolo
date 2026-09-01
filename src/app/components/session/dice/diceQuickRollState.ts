import { resolveDiceFormulaItems } from './diceCustomDie.ts';
import type { DiceFormulaItem, ResolvedDiceFormulaItem, SavedCustomDie } from './diceTypes.ts';

export type QuickRollEntry =
  | { kind: 'dice'; sides: number; quantity: number }
  | { kind: 'custom-die'; customDieId: string; quantity: number };

export function addStandardQuickDie(entries: readonly QuickRollEntry[], sides: number): QuickRollEntry[] {
  let found = false;
  const next = entries.map((entry) => {
    if (entry.kind === 'dice' && entry.sides === sides) {
      found = true;
      return { ...entry, quantity: entry.quantity + 1 };
    }
    return { ...entry };
  });
  return found ? next : [...next, { kind: 'dice', sides, quantity: 1 }];
}

export function addCustomQuickDie(entries: readonly QuickRollEntry[], customDieId: string): QuickRollEntry[] {
  let found = false;
  const next = entries.map((entry) => {
    if (entry.kind === 'custom-die' && entry.customDieId === customDieId) {
      found = true;
      return { ...entry, quantity: entry.quantity + 1 };
    }
    return { ...entry };
  });
  return found ? next : [...next, { kind: 'custom-die', customDieId, quantity: 1 }];
}

export function decrementQuickDie(entries: readonly QuickRollEntry[], target: QuickRollEntry): QuickRollEntry[] {
  return entries.flatMap((entry) => {
    const matches = entry.kind === target.kind && (
      entry.kind === 'dice' ? entry.sides === (target as Extract<QuickRollEntry, { kind: 'dice' }>).sides
        : entry.customDieId === (target as Extract<QuickRollEntry, { kind: 'custom-die' }>).customDieId
    );
    if (!matches) return [{ ...entry }];
    return entry.quantity > 1 ? [{ ...entry, quantity: entry.quantity - 1 }] : [];
  });
}

export function clearQuickRoll(): QuickRollEntry[] { return []; }

export function buildQuickRollItems(entries: readonly QuickRollEntry[], customDice: readonly SavedCustomDie[]): ResolvedDiceFormulaItem[] {
  const persisted: DiceFormulaItem[] = entries.map((entry, index) => entry.kind === 'dice'
    ? { id: `quick-${index}-${entry.sides}`, kind: 'dice', sides: entry.sides, quantity: entry.quantity }
    : { id: `quick-${index}-${entry.customDieId}`, kind: 'custom-die', customDieId: entry.customDieId, quantity: entry.quantity });
  return resolveDiceFormulaItems(persisted, customDice);
}
