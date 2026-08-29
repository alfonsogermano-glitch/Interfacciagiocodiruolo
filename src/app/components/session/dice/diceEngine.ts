import { formatDiceFormula } from './diceFormulaText.ts';
import { validateDiceFormula } from './diceFormulaValidation.ts';
import type {
  DiceFormulaItem,
  DiceKeepWhich,
  DiceModifierOperation,
  DiceRng,
  DiceRollIdentity,
  DiceRollRequest,
  RollComparisonResult,
  RollDiceGroup,
  RollDie,
  RollResult,
} from './diceTypes.ts';

const MAX_EXPLOSIONS_PER_CHAIN = 100;
const MAX_DICE_PER_ROLL = 1000;
const UINT32_RANGE = 0x1_0000_0000;

export class DiceRollError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiceRollError';
  }
}

export function cryptoDiceRng(sides: number): number {
  if (!Number.isInteger(sides) || sides < 2) {
    throw new DiceRollError(`Dado non valido: d${sides}.`);
  }

  const buffer = new Uint32Array(1);
  const upperExclusive = Math.floor(UINT32_RANGE / sides) * sides;
  do {
    globalThis.crypto.getRandomValues(buffer);
  } while (buffer[0] >= upperExclusive);

  return (buffer[0] % sides) + 1;
}

function cloneItems(items: readonly DiceFormulaItem[]): DiceFormulaItem[] {
  return items.map((item) => ({ ...item })) as DiceFormulaItem[];
}

function activeRolls(group: RollDiceGroup): RollDie[] {
  return group.rolls.filter((die) => die.active);
}

function refreshGroup(group: RollDiceGroup): void {
  const active = activeRolls(group);
  group.activeRollIds = active.map((die) => die.id);
  group.contribution = active.reduce((sum, die) => sum + die.contribution, 0);
}

function compareValue(value: number, operator: 'gte' | 'lte' | 'eq', target: number): boolean {
  if (operator === 'gte') return value >= target;
  if (operator === 'lte') return value <= target;
  return value === target;
}

function applyKeepThreshold(
  group: RollDiceGroup,
  which: DiceKeepWhich,
  threshold: number,
): void {
  for (const die of activeRolls(group)) {
    const matches = which === 'highest'
      ? die.contribution >= threshold
      : which === 'lowest'
        ? die.contribution <= threshold
        : die.contribution === threshold;
    die.active = matches;
    if (matches) die.keepMatched = true;
  }
  refreshGroup(group);
}

function modifierTargetsActiveDice(items: readonly DiceFormulaItem[], modifierIndex: number): boolean {
  for (let index = modifierIndex + 1; index < items.length; index += 1) {
    const next = items[index];
    if (next.kind === 'dice') return false;
    if (next.kind === 'keep') return true;
    if (next.kind === 'compare' && !next.total) return true;
  }
  return false;
}

function applyArithmeticValue(
  before: number,
  operation: DiceModifierOperation,
  value: number,
): number {
  let after: number;
  switch (operation) {
    case 'add':
      after = before + value;
      break;
    case 'subtract':
      after = before - value;
      break;
    case 'multiply':
      after = before * value;
      break;
    case 'divide':
      if (value === 0) throw new DiceRollError('Non e possibile dividere per zero.');
      after = before / value;
      break;
    case 'exponent':
      after = before ** value;
      break;
  }
  if (!Number.isFinite(after)) {
    throw new DiceRollError('Il modificatore ha prodotto un risultato numerico non valido.');
  }
  return after;
}

function applyDropSelection(
  group: RollDiceGroup,
  which: 'highest' | 'lowest',
  count: number,
): void {
  const candidates = activeRolls(group);
  const indexed = candidates.map((die, index) => ({ die, index }));
  indexed.sort((a, b) => {
    const delta = which === 'highest'
      ? b.die.contribution - a.die.contribution
      : a.die.contribution - b.die.contribution;
    return delta !== 0 ? delta : a.index - b.index;
  });

  const selected = new Set(indexed.slice(0, Math.min(count, indexed.length)).map(({ die }) => die.id));
  for (const die of candidates) {
    if (selected.has(die.id)) die.active = false;
  }
  refreshGroup(group);
}

export interface RollDiceFormulaInput {
  identity: DiceRollIdentity;
  request: DiceRollRequest;
}

export function rollDiceFormula(
  input: RollDiceFormulaInput,
  rng: DiceRng = cryptoDiceRng,
): RollResult {
  const validation = validateDiceFormula(input.request.items);
  if (!validation.valid) {
    throw new DiceRollError(validation.issues.map((issue) => issue.message).join(' '));
  }

  const diceGroups: RollDiceGroup[] = [];
  const comparisons: RollComparisonResult[] = [];
  const arithmeticSteps: RollResult['arithmeticSteps'] = [];

  let total = 0;
  let activeGroup: RollDiceGroup | null = null;
  let generatedDiceCount = 0;
  let rollSequence = 0;

  const nextRollId = (itemId: string) => `${itemId}:r${++rollSequence}`;

  const rollFace = (sides: number): number => {
    if (generatedDiceCount >= MAX_DICE_PER_ROLL) {
      throw new DiceRollError(`Il tiro ha superato il limite di ${MAX_DICE_PER_ROLL} dadi generati.`);
    }
    const face = rng(sides);
    if (!Number.isInteger(face) || face < 1 || face > sides) {
      throw new DiceRollError(`Il generatore ha restituito ${face} per d${sides}.`);
    }
    generatedDiceCount += 1;
    return face;
  };

  const updateTotalForGroupMutation = (group: RollDiceGroup, before: number) => {
    refreshGroup(group);
    total += group.contribution - before;
  };

  for (let itemIndex = 0; itemIndex < input.request.items.length; itemIndex += 1) {
    const item = input.request.items[itemIndex];
    switch (item.kind) {
      case 'dice': {
        const group: RollDiceGroup = {
          itemId: item.id,
          sides: item.sides,
          requestedQuantity: item.quantity,
          rolls: [],
          activeRollIds: [],
          contribution: 0,
        };

        for (let index = 0; index < item.quantity; index += 1) {
          const face = rollFace(item.sides);
          const id = nextRollId(item.id);
          group.rolls.push({
            id,
            groupItemId: item.id,
            sides: item.sides,
            face,
            contribution: face,
            active: true,
            source: 'base',
            explosionDepth: 0,
            chainId: `${item.id}:chain${index + 1}`,
          });
        }

        refreshGroup(group);
        total += group.contribution;
        diceGroups.push(group);
        activeGroup = group;
        break;
      }

      case 'keep': {
        if (!activeGroup) throw new DiceRollError('keep senza gruppo di dadi attivo.');
        const before = activeGroup.contribution;
        applyKeepThreshold(activeGroup, item.which, item.count);
        total += activeGroup.contribution - before;
        break;
      }

      case 'drop': {
        if (!activeGroup) throw new DiceRollError('drop senza gruppo di dadi attivo.');
        const before = activeGroup.contribution;
        applyDropSelection(activeGroup, item.which, item.count);
        total += activeGroup.contribution - before;
        break;
      }

      case 'exploding': {
        if (!activeGroup) throw new DiceRollError('Exploding senza gruppo di dadi attivo.');
        const group = activeGroup;
        const before = group.contribution;
        const starters = activeRolls(group).slice();

        for (const starter of starters) {
          if (starter.face !== group.sides) continue;

          let currentFace = starter.face;
          let parentRollId = starter.id;
          let explosionDepth = 0;
          let explosionCount = 0;

          while (currentFace === group.sides) {
            if (explosionCount >= MAX_EXPLOSIONS_PER_CHAIN) {
              throw new DiceRollError(
                `Una catena Exploding ha superato ${MAX_EXPLOSIONS_PER_CHAIN} rilanci.`,
              );
            }

            const face = rollFace(group.sides);
            explosionCount += 1;
            explosionDepth += 1;
            const id = nextRollId(group.itemId);
            const contribution = item.mode === 'penetrate' ? face - 1 : face;

            const extra: RollDie = {
              id,
              groupItemId: group.itemId,
              sides: group.sides,
              face,
              contribution,
              active: item.mode !== 'compound',
              source: 'explosion',
              explosionDepth,
              chainId: starter.chainId,
              parentRollId,
            };
            group.rolls.push(extra);

            if (item.mode === 'compound') {
              starter.contribution += face;
            }

            currentFace = face;
            parentRollId = id;
          }
        }

        updateTotalForGroupMutation(group, before);
        break;
      }

      case 'compare': {
        if (item.total) {
          const success = compareValue(total, item.operator, item.target);
          comparisons.push({
            itemId: item.id,
            mode: 'total',
            operator: item.operator,
            target: item.target,
            comparedValues: [total],
            success,
          });
          break;
        }

        if (!activeGroup) throw new DiceRollError('Compare per dado senza gruppo di dadi attivo.');
        const values = activeRolls(activeGroup).map((die) => die.contribution);
        const outcomes = values.map((value) => compareValue(value, item.operator, item.target));

        if (values.length === 1) {
          comparisons.push({
            itemId: item.id,
            mode: 'dice',
            operator: item.operator,
            target: item.target,
            comparedValues: values,
            success: outcomes[0],
          });
        } else {
          const successes = outcomes.filter(Boolean).length;
          comparisons.push({
            itemId: item.id,
            mode: 'dice',
            operator: item.operator,
            target: item.target,
            comparedValues: values,
            successes,
            failures: outcomes.length - successes,
          });
        }
        break;
      }

      case 'modifier': {
        const perDie = activeGroup !== null && modifierTargetsActiveDice(input.request.items, itemIndex);

        if (perDie && activeGroup) {
          const group = activeGroup;
          const before = group.contribution;
          for (const die of activeRolls(group)) {
            die.contribution = applyArithmeticValue(die.contribution, item.operation, item.value);
          }
          refreshGroup(group);
          const after = group.contribution;
          total += after - before;
          arithmeticSteps.push({
            itemId: item.id,
            operation: item.operation,
            value: item.value,
            before,
            after,
            scope: 'dice',
            groupItemId: group.itemId,
          });
          break;
        }

        const before = total;
        total = applyArithmeticValue(before, item.operation, item.value);
        arithmeticSteps.push({
          itemId: item.id,
          operation: item.operation,
          value: item.value,
          before,
          after: total,
          scope: 'total',
        });
        break;
      }
    }
  }

  return {
    id: globalThis.crypto.randomUUID(),
    campaignId: input.identity.campaignId,
    rollerId: input.identity.rollerId,
    rollerName: input.identity.rollerName,
    rollerAvatarUrl: input.identity.rollerAvatarUrl,
    formulaId: input.request.formulaId,
    formulaName: input.request.formulaName,
    formulaText: formatDiceFormula(input.request.items),
    visibility: input.request.visibility,
    sourceItems: cloneItems(input.request.items),
    diceGroups,
    arithmeticSteps,
    comparisons,
    total,
    createdAt: Date.now(),
  };
}
