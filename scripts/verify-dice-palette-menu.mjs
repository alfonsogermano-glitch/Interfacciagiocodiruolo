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

for (const label of ['Confronto', 'Dado', 'Scarta', 'Esplosione', 'Mantieni', 'Modificatore']) {
  const pattern = new RegExp(
    `<DropdownMenuItem[^>]*className="[^"]*focus:!bg-\\[var\\(--dash-surface-2\\)\\][^"]*focus:!text-\\[var\\(--dash-text-strong\\)\\][^"]*"[^>]*>${label}</DropdownMenuItem>`,
  );
  assert.match(builder, pattern, `dice + menu item ${label} must use palette-aware focus styling`);
}

console.log('Dice palette menu verification passed.');
