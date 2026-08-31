import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(
  new URL('../src/app/components/session/dice/SavedDiceFormulaCard.tsx', import.meta.url),
  'utf8',
);

assert.match(
  source,
  /<DropdownMenuContent[^>]*className="[^"]*z-\[1000\][^"]*"/,
  'saved dice formula menu must render above the z-[900] dice slide-over panel',
);

console.log('Saved dice formula menu layering verification passed.');
