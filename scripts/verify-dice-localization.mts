import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(path: string): string {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

const panel = read('src/app/components/session/dice/SessionDicePanel.tsx');
const builder = read('src/app/components/session/dice/DiceFormulaBuilder.tsx');
const row = read('src/app/components/session/dice/DiceFormulaRow.tsx');
const historyDrawer = read('src/app/components/session/dice/DiceRollHistoryDrawer.tsx');
const validation = read('src/app/components/session/dice/diceFormulaValidation.ts');
const engine = read('src/app/components/session/dice/diceEngine.ts');

assert.ok(panel.includes("const DEFAULT_FORMULA_NAME = 'Formula senza nome';"), 'default dice formula name must be Italian');
assert.ok(panel.includes('>Formule dei dadi</h1>'), 'dice panel title must be Italian');
assert.ok(panel.includes('>Tira</button>') || panel.includes('Tira\n            </button>'), 'roll action must be Italian');
assert.ok(panel.includes('Salva formula'), 'save action must be Italian');
assert.ok(panel.includes('Svuota'), 'clear action must be Italian');

for (const label of ['Confronto', 'Dado', 'Scarta', 'Esplosione', 'Mantieni', 'Modificatore']) {
  assert.ok(builder.includes(`>${label}</DropdownMenuItem>`), `modifier menu must expose ${label}`);
}

for (const label of [
  'Maggiore o uguale',
  'Minore o uguale',
  'Uguale',
  'Più alti',
  'Più bassi',
  'Esplodi sul valore massimo',
  'Somma i rilanci aggiuntivi',
  'Rilanci penetranti',
  'Maggiore o uguale a',
  'Minore o uguale a',
  'Uguale a',
  'Somma',
  'Dividi',
  'Potenza',
  'Moltiplica',
  'Sottrai',
]) {
  assert.ok(row.includes(`>${label}</option>`), `dice formula controls must expose ${label}`);
}

assert.ok(historyDrawer.includes("3D {animationsEnabled ? 'ATTIVA' : 'DISATTIVA'}"), '3D toggle must be Italian');

for (const forbidden of [
  'Dice formulas',
  'Untitled dice formula',
  '>Roll</button>',
  'Save formula',
  '>Clear</button>',
  '>Compare</DropdownMenuItem>',
  '>Dice</DropdownMenuItem>',
  '>Drop</DropdownMenuItem>',
  '>Exploding</DropdownMenuItem>',
  '>Keep</DropdownMenuItem>',
  '>Modifier</DropdownMenuItem>',
  '>Highest</option>',
  '>Lowest</option>',
  '>Equal</option>',
  '>Explode highest value</option>',
  '>Compound additional rolls</option>',
  '>Penetrate additional rolls</option>',
  '>Greater than or equal to</option>',
  '>Less than or equal to</option>',
  '>Equals</option>',
  '>Add</option>',
  '>Divide</option>',
  '>Exponent</option>',
  '>Multiply</option>',
  '>Subtract</option>',
]) {
  assert.ok(!`${panel}\n${builder}\n${row}`.includes(forbidden), `English UI label must be removed: ${forbidden}`);
}

for (const forbidden of [
  'Keep richiede',
  'soglia Keep',
  'Drop richiede',
  'Exploding richiede',
  'modificatore Exploding',
  'Compare Totale',
  'Compare per dado',
]) {
  assert.ok(!validation.includes(forbidden), `validation message must be Italian: ${forbidden}`);
}

for (const forbidden of [
  'keep senza gruppo',
  'drop senza gruppo',
  'Exploding senza gruppo',
  'catena Exploding',
  'Compare per dado',
]) {
  assert.ok(!engine.includes(forbidden), `runtime error must be Italian: ${forbidden}`);
}

const helperUrl = new URL('../src/app/components/session/dice/diceFormulaNames.ts', import.meta.url);
assert.ok(fs.existsSync(helperUrl), 'dice formulas must provide a unique-name helper');

const { resolveUniqueDiceFormulaName } = await import('../src/app/components/session/dice/diceFormulaNames.ts');

assert.equal(resolveUniqueDiceFormulaName('Attacco', []), 'Attacco');
assert.equal(resolveUniqueDiceFormulaName(' Attacco ', []), 'Attacco');
assert.equal(resolveUniqueDiceFormulaName('Attacco', ['Attacco']), 'Attacco (1)');
assert.equal(
  resolveUniqueDiceFormulaName('Attacco', ['Attacco', 'Attacco (1)', 'Attacco (3)']),
  'Attacco (2)',
  'the first available Windows-style suffix must be selected',
);
assert.equal(
  resolveUniqueDiceFormulaName('Attacco', ['attacco']),
  'Attacco (1)',
  'formula-name uniqueness must be case-insensitive like Windows filenames',
);

assert.ok(panel.includes('resolveUniqueDiceFormulaName'), 'save flow must use the unique-name helper');
assert.ok(panel.includes('formula.id !== editingId'), 'editing a formula must exclude itself from duplicate-name checks');
assert.ok(panel.includes('resolveUniqueDiceFormulaName(`Copia di ${formula.name}`'), 'duplicate flow must also generate a unique name');

console.log('Dice Italian localization and unique-name verification passed.');
