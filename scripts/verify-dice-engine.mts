import assert from 'node:assert/strict';
import { formatDiceFormula } from '../src/app/components/session/dice/diceFormulaText.ts';
import type { DiceFormulaItem } from '../src/app/components/session/dice/diceTypes.ts';

const items: DiceFormulaItem[] = [
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

assert.equal(formatDiceFormula(items), '2d20+2d12!p>=3+1d3dh1!kh1+3');
assert.equal(
  formatDiceFormula([{ id: 'x', kind: 'compare', operator: 'lte', target: 15, total: true }]),
  'T<=15',
);

console.log('Dice engine serializer verification passed.');
