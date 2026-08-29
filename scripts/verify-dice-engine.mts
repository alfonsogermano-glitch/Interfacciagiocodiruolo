import assert from 'node:assert/strict';
import { formatDiceFormula } from '../src/app/components/session/dice/diceFormulaText.ts';
import { validateDiceFormula } from '../src/app/components/session/dice/diceFormulaValidation.ts';
import { DiceRollError, rollDiceFormula } from '../src/app/components/session/dice/diceEngine.ts';
import { formatPrimaryRollResult } from '../src/app/components/session/dice/diceResultSummary.ts';
import type { DiceFormulaItem, DiceRng } from '../src/app/components/session/dice/diceTypes.ts';

const complexItems: DiceFormulaItem[] = [
  { id: 'a', kind: 'dice', sides: 20, quantity: 2 },
  { id: 'b', kind: 'dice', sides: 12, quantity: 2 },
  { id: 'c', kind: 'exploding', mode: 'penetrate' },
  { id: 'd', kind: 'compare', operator: 'gte', target: 3, total: false },
  { id: 'e', kind: 'dice', sides: 3, quantity: 1 },
  { id: 'f', kind: 'drop', which: 'highest', count: 1 },
  { id: 'g', kind: 'exploding', mode: 'explode' },
  { id: 'h', kind: 'keep', which: 'highest', count: 1 },
  { id: 'i', kind: 'modifier', operation: 'add', value: 3 },
];

assert.equal(formatDiceFormula(complexItems), '2d20+2d12!p>=3+1d3dh1!k>=1+3');
assert.equal(
  formatDiceFormula([{ id: 'x', kind: 'compare', operator: 'lte', target: 15, total: true }]),
  'T<=15',
);
assert.equal(
  formatDiceFormula([
    { id: 'd', kind: 'dice', sides: 20, quantity: 4 },
    { id: 'k', kind: 'keep', which: 'equal', count: 15 } as unknown as DiceFormulaItem,
  ]),
  '4d20k=15',
);

const d6: DiceFormulaItem = { id: 'd6', kind: 'dice', sides: 6, quantity: 1 };
const add2: DiceFormulaItem = { id: 'add', kind: 'modifier', operation: 'add', value: 2 };
const keep1: DiceFormulaItem = { id: 'keep', kind: 'keep', which: 'highest', count: 1 };
const explode: DiceFormulaItem = { id: 'explode', kind: 'exploding', mode: 'explode' };

assert.equal(validateDiceFormula([]).valid, false);
assert.equal(validateDiceFormula([keep1]).valid, false);
assert.equal(
  validateDiceFormula([d6, add2, keep1]).valid,
  true,
  'a modifier must no longer close the active dice group before Keep',
);
assert.equal(
  validateDiceFormula([
    d6,
    { id: 'zero', kind: 'modifier', operation: 'divide', value: 0 },
  ]).valid,
  false,
);
assert.equal(validateDiceFormula([d6, explode, { ...explode, id: 'explode2' }]).valid, false);
assert.equal(validateDiceFormula(complexItems).valid, true);
assert.equal(
  validateDiceFormula([{ id: 'huge', kind: 'dice', sides: 6, quantity: 1001 }]).valid,
  false,
);

function queued(values: number[]): DiceRng {
  let index = 0;
  return (sides: number) => {
    assert.ok(index < values.length, `RNG queue exhausted for d${sides}`);
    const value = values[index++];
    assert.ok(value >= 1 && value <= sides, `Queued value ${value} invalid for d${sides}`);
    return value;
  };
}

const identity = {
  campaignId: '10000000-0000-0000-0000-000000000001',
  rollerId: '20000000-0000-0000-0000-000000000001',
  rollerName: 'Tester',
};

function roll(items: DiceFormulaItem[], values: number[]) {
  return rollDiceFormula(
    {
      identity,
      request: {
        items,
        formulaName: 'Test',
        visibility: 'public',
      },
    },
    queued(values),
  );
}

assert.equal(roll([{ id: 'd', kind: 'dice', sides: 6, quantity: 2 }], [3, 5]).total, 8);

const keepHighest = roll([
  { id: 'd', kind: 'dice', sides: 20, quantity: 4 },
  { id: 'k', kind: 'keep', which: 'highest', count: 15 },
], [4, 15, 17, 12]);
assert.equal(keepHighest.total, 32);
assert.deepEqual(
  keepHighest.diceGroups[0].rolls.filter((die) => die.active).map((die) => die.contribution),
  [15, 17],
  'Keep Highest 15 must keep only results >= 15',
);

const keepLowest = roll([
  { id: 'd', kind: 'dice', sides: 20, quantity: 4 },
  { id: 'k', kind: 'keep', which: 'lowest', count: 15 },
], [4, 15, 17, 12]);
assert.equal(keepLowest.total, 31);
assert.deepEqual(
  keepLowest.diceGroups[0].rolls.filter((die) => die.active).map((die) => die.contribution),
  [4, 15, 12],
  'Keep Lowest 15 must keep only results <= 15',
);

const keepEqual = roll([
  { id: 'd', kind: 'dice', sides: 20, quantity: 4 },
  { id: 'k', kind: 'keep', which: 'equal', count: 15 } as unknown as DiceFormulaItem,
], [4, 15, 17, 15]);
assert.equal(keepEqual.total, 30);
assert.deepEqual(
  keepEqual.diceGroups[0].rolls.filter((die) => die.active).map((die) => die.contribution),
  [15, 15],
  'Keep Equal 15 must keep only results equal to 15',
);

assert.equal(roll([
  { id: 'd', kind: 'dice', sides: 6, quantity: 4 },
  { id: 'drop', kind: 'drop', which: 'lowest', count: 1 },
], [1, 6, 4, 2]).total, 12);

const exploded = roll([
  { id: 'd', kind: 'dice', sides: 6, quantity: 1 },
  { id: 'x', kind: 'exploding', mode: 'explode' },
], [6, 6, 3]);
assert.equal(exploded.total, 15);
assert.equal(exploded.diceGroups[0].rolls.length, 3);
assert.equal(exploded.diceGroups[0].rolls.filter((die) => die.active).length, 3);

const compounded = roll([
  { id: 'd', kind: 'dice', sides: 6, quantity: 1 },
  { id: 'x', kind: 'exploding', mode: 'compound' },
], [6, 6, 3]);
assert.equal(compounded.total, 15);
assert.equal(compounded.diceGroups[0].rolls.length, 3);
assert.equal(compounded.diceGroups[0].rolls.filter((die) => die.active).length, 1);
assert.equal(compounded.diceGroups[0].rolls.find((die) => die.active)?.contribution, 15);

const penetrated = roll([
  { id: 'd', kind: 'dice', sides: 6, quantity: 1 },
  { id: 'x', kind: 'exploding', mode: 'penetrate' },
], [6, 6, 3]);
assert.equal(penetrated.total, 13);
assert.deepEqual(penetrated.diceGroups[0].rolls.map((die) => die.face), [6, 6, 3]);
assert.deepEqual(penetrated.diceGroups[0].rolls.map((die) => die.contribution), [6, 5, 2]);

const compared = roll([
  { id: 'd', kind: 'dice', sides: 6, quantity: 3 },
  { id: 'c', kind: 'compare', operator: 'gte', target: 4, total: false },
], [6, 2, 4]);
assert.equal(compared.total, 12);
assert.equal(compared.comparisons[0].successes, 2);
assert.equal(compared.comparisons[0].failures, 1);

const totalCompared = roll([
  { id: 'd', kind: 'dice', sides: 20, quantity: 1 },
  { id: 'm', kind: 'modifier', operation: 'add', value: 3 },
  { id: 'c', kind: 'compare', operator: 'gte', target: 15, total: true },
], [13]);
assert.equal(totalCompared.total, 16);
assert.equal(totalCompared.comparisons[0].success, true);
assert.deepEqual(totalCompared.comparisons[0].comparedValues, [16]);

const arithmetic = roll([
  { id: 'd', kind: 'dice', sides: 4, quantity: 1 },
  { id: 'a', kind: 'modifier', operation: 'add', value: 2 },
  { id: 'b', kind: 'modifier', operation: 'multiply', value: 3 },
  { id: 'c', kind: 'modifier', operation: 'subtract', value: 1 },
  { id: 'e', kind: 'modifier', operation: 'divide', value: 2 },
  { id: 'f', kind: 'modifier', operation: 'exponent', value: 2 },
], [2]);
assert.equal(arithmetic.total, 30.25);


const totalOnlyModifier = roll([
  { id: 'd', kind: 'dice', sides: 20, quantity: 4 },
  { id: 'm', kind: 'modifier', operation: 'add', value: 3 },
], [12, 15, 10, 3]);
assert.equal(totalOnlyModifier.total, 43);
assert.deepEqual(totalOnlyModifier.diceGroups[0].rolls.map((die) => die.contribution), [12, 15, 10, 3]);
assert.equal(totalOnlyModifier.arithmeticSteps[0].scope, 'total');
assert.equal(totalOnlyModifier.arithmeticSteps[0].groupItemId, undefined);

const modifierBeforeKeep = roll([
  { id: 'd', kind: 'dice', sides: 20, quantity: 4 },
  { id: 'm', kind: 'modifier', operation: 'add', value: 3 },
  { id: 'k', kind: 'keep', which: 'highest', count: 15 },
], [12, 15, 3, 9]);
assert.equal(modifierBeforeKeep.total, 33);
assert.deepEqual(modifierBeforeKeep.diceGroups[0].rolls.map((die) => die.face), [12, 15, 3, 9]);
assert.deepEqual(modifierBeforeKeep.diceGroups[0].rolls.map((die) => die.contribution), [15, 18, 6, 12]);
assert.deepEqual(
  modifierBeforeKeep.diceGroups[0].rolls.filter((die) => die.active).map((die) => die.contribution),
  [15, 18],
);
assert.equal(modifierBeforeKeep.arithmeticSteps[0].scope, 'dice');
assert.equal(modifierBeforeKeep.arithmeticSteps[0].groupItemId, 'd');

const modifierAfterKeep = roll([
  { id: 'd', kind: 'dice', sides: 20, quantity: 4 },
  { id: 'k', kind: 'keep', which: 'highest', count: 15 },
  { id: 'm', kind: 'modifier', operation: 'add', value: 3 },
], [16, 16, 12, 7]);
assert.equal(modifierAfterKeep.total, 35);
assert.deepEqual(
  modifierAfterKeep.diceGroups[0].rolls.filter((die) => die.active).map((die) => die.contribution),
  [16, 16],
);
assert.equal(modifierAfterKeep.arithmeticSteps[0].scope, 'total');

const perDieComparedAfterModifier = roll([
  { id: 'd', kind: 'dice', sides: 20, quantity: 4 },
  { id: 'm', kind: 'modifier', operation: 'add', value: 3 },
  { id: 'c', kind: 'compare', operator: 'gte', target: 15, total: false },
], [12, 15, 3, 9]);
assert.deepEqual(perDieComparedAfterModifier.comparisons[0].comparedValues, [15, 18, 6, 12]);
assert.equal(perDieComparedAfterModifier.comparisons[0].successes, 2);
assert.equal(perDieComparedAfterModifier.comparisons[0].failures, 2);
assert.equal(perDieComparedAfterModifier.arithmeticSteps[0].scope, 'dice');

const totalComparedAfterModifier = roll([
  { id: 'd', kind: 'dice', sides: 20, quantity: 4 },
  { id: 'm', kind: 'modifier', operation: 'add', value: 3 },
  { id: 'c', kind: 'compare', operator: 'gte', target: 40, total: true },
], [12, 15, 10, 3]);
assert.equal(totalComparedAfterModifier.total, 43);
assert.deepEqual(totalComparedAfterModifier.comparisons[0].comparedValues, [43]);
assert.equal(totalComparedAfterModifier.comparisons[0].success, true);
assert.equal(totalComparedAfterModifier.arithmeticSteps[0].scope, 'total');

const sequentialPerDie = roll([
  { id: 'd', kind: 'dice', sides: 20, quantity: 2 },
  { id: 'a', kind: 'modifier', operation: 'add', value: 3 },
  { id: 'b', kind: 'modifier', operation: 'multiply', value: 2 },
  { id: 'k', kind: 'keep', which: 'highest', count: 20 },
], [8, 10]);
assert.deepEqual(sequentialPerDie.diceGroups[0].rolls.map((die) => die.contribution), [22, 26]);
assert.equal(sequentialPerDie.total, 48);
assert.deepEqual(sequentialPerDie.arithmeticSteps.map((step) => step.scope), ['dice', 'dice']);

const perDieSubtract = roll([
  { id: 'd', kind: 'dice', sides: 20, quantity: 2 },
  { id: 'm', kind: 'modifier', operation: 'subtract', value: 2 },
  { id: 'k', kind: 'keep', which: 'highest', count: 5 },
], [7, 6]);
assert.deepEqual(perDieSubtract.diceGroups[0].rolls.map((die) => die.contribution), [5, 4]);
assert.equal(perDieSubtract.total, 5);

const perDieDivide = roll([
  { id: 'd', kind: 'dice', sides: 20, quantity: 2 },
  { id: 'm', kind: 'modifier', operation: 'divide', value: 2 },
  { id: 'k', kind: 'keep', which: 'highest', count: 5 },
], [10, 8]);
assert.deepEqual(perDieDivide.diceGroups[0].rolls.map((die) => die.contribution), [5, 4]);
assert.equal(perDieDivide.total, 5);

const perDieExponent = roll([
  { id: 'd', kind: 'dice', sides: 20, quantity: 2 },
  { id: 'm', kind: 'modifier', operation: 'exponent', value: 2 },
  { id: 'k', kind: 'keep', which: 'highest', count: 20 },
], [5, 4]);
assert.deepEqual(perDieExponent.diceGroups[0].rolls.map((die) => die.contribution), [25, 16]);
assert.equal(perDieExponent.total, 25);

const nextDiceBoundary = roll([
  { id: 'd20', kind: 'dice', sides: 20, quantity: 1 },
  { id: 'm', kind: 'modifier', operation: 'add', value: 3 },
  { id: 'd6', kind: 'dice', sides: 6, quantity: 2 },
  { id: 'k', kind: 'keep', which: 'highest', count: 4 },
], [10, 3, 5]);
assert.equal(nextDiceBoundary.diceGroups[0].rolls[0].contribution, 10);
assert.equal(nextDiceBoundary.arithmeticSteps[0].scope, 'total');
assert.deepEqual(
  nextDiceBoundary.diceGroups[1].rolls.filter((die) => die.active).map((die) => die.contribution),
  [5],
);

const keepThenDrop = roll([
  { id: 'd', kind: 'dice', sides: 20, quantity: 3 },
  { id: 'k', kind: 'keep', which: 'highest', count: 10 },
  { id: 'drop', kind: 'drop', which: 'highest', count: 1 },
], [12, 15, 8]);
assert.equal(
  keepThenDrop.diceGroups[0].rolls.filter((die) => die.active && die.keepMatched === true).length,
  1,
);

const zeroKeep = roll([
  { id: 'd', kind: 'dice', sides: 20, quantity: 2 },
  { id: 'k', kind: 'keep', which: 'highest', count: 15 },
  { id: 'm', kind: 'modifier', operation: 'add', value: 3 },
], [4, 6]);
assert.equal(
  zeroKeep.diceGroups[0].rolls.filter((die) => die.active && die.keepMatched === true).length,
  0,
);
assert.equal(zeroKeep.total, 3);

const modifiedToMaximumDoesNotExplode = roll([
  { id: 'd', kind: 'dice', sides: 20, quantity: 1 },
  { id: 'm', kind: 'modifier', operation: 'add', value: 3 },
  { id: 'x', kind: 'exploding', mode: 'explode' },
  { id: 'c', kind: 'compare', operator: 'gte', target: 20, total: false },
], [17]);
assert.equal(modifiedToMaximumDoesNotExplode.diceGroups[0].rolls.length, 1);
assert.equal(modifiedToMaximumDoesNotExplode.diceGroups[0].rolls[0].face, 17);
assert.equal(modifiedToMaximumDoesNotExplode.diceGroups[0].rolls[0].contribution, 20);
assert.equal(modifiedToMaximumDoesNotExplode.comparisons[0].success, true);

const naturalMaximumStillExplodes = roll([
  { id: 'd', kind: 'dice', sides: 20, quantity: 1 },
  { id: 'm', kind: 'modifier', operation: 'add', value: 3 },
  { id: 'x', kind: 'exploding', mode: 'explode' },
  { id: 'c', kind: 'compare', operator: 'gte', target: 20, total: false },
], [20, 4]);
assert.deepEqual(naturalMaximumStillExplodes.diceGroups[0].rolls.map((die) => die.face), [20, 4]);
assert.deepEqual(naturalMaximumStillExplodes.diceGroups[0].rolls.map((die) => die.contribution), [23, 4]);
assert.equal(naturalMaximumStillExplodes.diceGroups[0].rolls.length, 2);


assert.equal(formatPrimaryRollResult(totalOnlyModifier), '43');
assert.equal(formatPrimaryRollResult(modifierBeforeKeep), '2 (33)');
assert.equal(formatPrimaryRollResult(modifierAfterKeep), '2 (35)');
assert.equal(formatPrimaryRollResult(zeroKeep), '0 (3)');

assert.throws(
  () => rollDiceFormula({
    identity,
    request: {
      items: [d6, { id: 'bad', kind: 'modifier', operation: 'divide', value: 0 }],
      formulaName: 'Bad',
      visibility: 'public',
    },
  }, queued([4])),
  DiceRollError,
);

console.log('Dice engine verification passed.');
