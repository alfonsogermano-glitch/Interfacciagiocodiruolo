import assert from 'node:assert/strict';
import fs from 'node:fs';

const icon = fs.readFileSync(new URL('../src/app/components/session/dice/DiceTypeIcon.tsx', import.meta.url), 'utf8');
const styled = fs.readFileSync(new URL('../src/app/components/session/dice/StyledStandardDieIcon.tsx', import.meta.url), 'utf8');

assert.ok(
  icon.includes('operator="erode" radius="0.24"'),
  'textured standard dice must use the slightly stronger 0.24 erosion so colored structure borders stay lighter than before',
);
assert.doesNotMatch(
  icon,
  /operator="erode" radius="0\.18"/,
  'textured standard dice must not retain the heavier old border treatment',
);
assert.ok(
  styled.includes('h-[80%] aspect-square'),
  'd100 percentile faces must be slightly smaller so the pair stays comfortably inside the quick-roll button',
);
assert.ok(
  styled.includes('gap-[3px] overflow-visible'),
  'styled d100 must use the tighter 3px pair gap',
);
assert.ok(
  icon.includes('gap-[3px] overflow-visible'),
  'shared d100 icon composition must match the tighter 3px pair gap',
);

for (const sides of [4, 6, 20]) {
  assert.ok(styled.includes(`sides={sides}`) || styled.includes('thinStructure={textured}'), `d${sides} must remain on the shared thin-structure path`);
}

console.log('Dice colored structure borders and d100 quick-roll footprint verification passed.');
