import assert from 'node:assert/strict';
import { ARCHIVIO_CHECKBOX_SYMBOLS, normalizeArchivioCheckbox, nextArchivioCheckboxState, archivioCheckboxValue, archivioCheckboxText } from '../src/app/components/session/shared/archivioCheckbox.ts';

assert.deepEqual(normalizeArchivioCheckbox({}), { checkboxCount: 1, checkboxSymbol: 'x', checkboxHalf: false, checkboxStates: [0] });
assert.deepEqual(normalizeArchivioCheckbox({ checked: true }).checkboxStates, [2], 'old checked cells must migrate without losing their mark');
assert.deepEqual(normalizeArchivioCheckbox({ checked: false }).checkboxStates, [0]);
for (const [input, expected] of [[0, 1], [-10, 1], [1, 1], [50, 50], [51, 50], [1000, 50], [2.7, 3], ['4', 4], [NaN, 1], [Infinity, 1]] as const) {
  const result = normalizeArchivioCheckbox({ checkboxCount: input });
  assert.equal(result.checkboxCount, expected);
  assert.equal(result.checkboxStates.length, expected);
}
assert.equal(normalizeArchivioCheckbox({ checkboxSymbol: 'unknown' }).checkboxSymbol, 'x');
assert.equal(new Set(ARCHIVIO_CHECKBOX_SYMBOLS.map(symbol => symbol.id)).size, ARCHIVIO_CHECKBOX_SYMBOLS.length);
for (const { id } of ARCHIVIO_CHECKBOX_SYMBOLS) {
  assert.equal(normalizeArchivioCheckbox({ checkboxSymbol: id }).checkboxSymbol, id);
  let state: 0 | 1 | 2 = 0;
  const ternary = [state];
  for (let i = 0; i < 3; i++) { state = nextArchivioCheckboxState(state, true); ternary.push(state); }
  assert.deepEqual(ternary, [0, 1, 2, 0], `${id}: empty, half, full, empty cycle`);
  assert.equal(nextArchivioCheckboxState(0, false), 2);
  assert.equal(nextArchivioCheckboxState(2, false), 0);
}
const source = { checkboxCount: 3, checkboxSymbol: 'star', checkboxHalf: true, checkboxStates: [1, 2, 0] };
const saved = JSON.parse(JSON.stringify(normalizeArchivioCheckbox(source)));
assert.deepEqual(normalizeArchivioCheckbox(saved), source, 'settings and independent states must round-trip');
assert.equal(archivioCheckboxValue(saved), 1.5);
assert.equal(archivioCheckboxText(saved), '½, Sì, No');
assert.equal(archivioCheckboxText({ checked: true }), 'Sì');
assert.equal(archivioCheckboxText({ checked: false }), 'No');
const grown = normalizeArchivioCheckbox({ ...source, checkboxCount: 5 });
assert.deepEqual(grown.checkboxStates, [1, 2, 0, 0, 0], 'new checkboxes start empty without resetting the old ones');
assert.deepEqual(normalizeArchivioCheckbox({ ...source, checkboxCount: 1 }).checkboxStates, [1]);
assert.deepEqual(normalizeArchivioCheckbox({ ...source, checkboxHalf: false }).checkboxStates, [2, 2, 0], 'turning off half mode keeps marks rather than erasing them');
assert.deepEqual(normalizeArchivioCheckbox({ checkboxCount: 3, checkboxHalf: true, checkboxStates: [9, -1, null] }).checkboxStates, [0, 0, 0]);
grown.checkboxStates[0] = nextArchivioCheckboxState(grown.checkboxStates[0], true);
assert.deepEqual(source.checkboxStates, [1, 2, 0], 'normalization must not share mutable state arrays');
assert.deepEqual(grown.checkboxStates, [2, 2, 0, 0, 0], 'toggling one checkbox must not touch its neighbours');
console.log('Archivio checkbox configuration: PASS (1–50 limits, 12 symbols, binary/half cycles, independent states, migration, resizing, persistence, sorting and text export).');
