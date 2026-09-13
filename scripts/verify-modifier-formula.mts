import assert from 'node:assert/strict';
import {
  ModifierFormulaError,
  evaluateModifierFormula,
  extractModifierRefs,
  isValidModifierFormula,
  modifierFormulaHasDice,
  parseModifierValue,
} from '../src/app/components/session/shared/modifierFormula.ts';
import type { DiceRng } from '../src/app/components/session/dice/diceTypes.ts';

const sequenceRng = (faces: number[]): DiceRng => {
  let index = 0;
  return (sides: number) => {
    const face = faces[index++ % faces.length];
    assert.ok(face >= 1 && face <= sides, `face ${face} fuori da d${sides}`);
    return face;
  };
};

const refs = { 'Modificatore (1)': { value: '3', formula: '' } };
const resolve = (name: string) => refs[name as keyof typeof refs] ?? null;

// Caso segnalato: 1d6 + riferimento con cifre nel nome (2 + 3 = 5, non 2 + 1).
{
  const rolled = evaluateModifierFormula('1d6+"Modificatore (1)"', sequenceRng([2]), resolve);
  assert.equal(rolled.total, 5);
  assert.deepEqual(rolled.groups, [{ sides: 6, faces: [2] }]);
}

// Letterale tra virgolette resta letterale.
{
  const rolled = evaluateModifierFormula('"1d6"', sequenceRng([4]), null);
  assert.equal(rolled.total, 4);
}

// Parentesi annidate: ((4+1)-2)+3 = 6.
{
  const rolled = evaluateModifierFormula('((1d6+1)-1d4)+3', sequenceRng([4, 2]), resolve);
  assert.equal(rolled.total, 6);
  assert.deepEqual(rolled.groups, [{ sides: 6, faces: [4] }, { sides: 4, faces: [2] }]);
}

// Riferimento mancante e circolare bloccano con errori dedicati.
assert.throws(() => evaluateModifierFormula('1d6+"Sparito"', sequenceRng([1]), resolve), (error: unknown) =>
  error instanceof ModifierFormulaError && error.code === 'missing');
assert.throws(
  () => evaluateModifierFormula('"A"', sequenceRng([1]), (name) =>
    name === 'A' ? { value: '', formula: '"B"' } : name === 'B' ? { value: '', formula: '"A"' } : null),
  (error: unknown) => error instanceof ModifierFormulaError && error.code === 'cycle',
);

// Riferimenti concatenati: "B" vale come la formula di A.
{
  const chained = evaluateModifierFormula('"B"', sequenceRng([3, 2]), (name) =>
    name === 'B' ? { value: '', formula: '"A"+1' } : name === 'A' ? { value: '2d4', formula: '' } : null);
  assert.equal(chained.total, 3 + 2 + 1);
}

// Estrazione tag, validita' e dadi senza tirare.
assert.deepEqual(extractModifierRefs('1d6+"Forza"'), ['Forza']);
assert.equal(extractModifierRefs('1d6+'), null);
assert.equal(isValidModifierFormula('1d6+"Forza"', resolve), false);
assert.equal(isValidModifierFormula('1d6+"Modificatore (1)"', resolve), true);
assert.equal(modifierFormulaHasDice('"Forza"', (name) => name === 'Forza' ? { value: '2d8', formula: '' } : null), true);
assert.equal(modifierFormulaHasDice('"Forza"', (name) => name === 'Forza' ? { value: '+3', formula: '' } : null), false);

// Valori liberi: dadi e numeri dal testo.
assert.deepEqual(parseModifierValue('hkjfhek1d4'), { kind: 'dice', dice: [{ sign: 1, count: 1, sides: 4 }], modifier: 0 });
assert.deepEqual(parseModifierValue('+1 Forza'), { kind: 'number', value: 1 });
assert.deepEqual(parseModifierValue('Saggezza-2'), { kind: 'number', value: -2 });
assert.deepEqual(parseModifierValue('Forza'), { kind: 'number', value: 0 });
assert.equal(parseModifierValue(''), null);

console.log('Modifier formula verification: PASS');
