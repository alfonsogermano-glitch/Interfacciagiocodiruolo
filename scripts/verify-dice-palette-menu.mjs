import assert from 'node:assert/strict';
import fs from 'node:fs';

const builder = fs.readFileSync(
  new URL('../src/app/components/session/dice/DiceFormulaBuilder.tsx', import.meta.url),
  'utf8',
);

assert.match(
  builder,
  /<DropdownMenuContent[^>]*className="[^"]*!bg-\[var\(--dash-panel\)\][^"]*!border-\[var\(--dash-border\)\][^"]*!text-\[var\(--dash-text\)\][^"]*"/,
  'dice + menu must use the selected Hollowgate palette for panel, border, and text',
);

const paletteItemClass = 'className="text-[var(--dash-text)] focus:!bg-[var(--dash-surface-2)] focus:!text-[var(--dash-text-strong)]"';
assert.equal(
  builder.split(paletteItemClass).length - 1,
  6,
  'all six dice + menu items must use palette-aware focus styling',
);

for (const label of ['Confronto', 'Dado', 'Scarta', 'Esplosione', 'Mantieni', 'Modificatore']) {
  assert.ok(builder.includes(label), `dice + menu must keep the ${label} option`);
}

console.log('Dice palette menu verification passed.');
