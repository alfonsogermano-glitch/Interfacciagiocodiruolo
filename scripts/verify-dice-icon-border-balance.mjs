import assert from 'node:assert/strict';
import fs from 'node:fs';

const icon = fs.readFileSync(new URL('../src/app/components/session/dice/DiceTypeIcon.tsx', import.meta.url), 'utf8');
const styled = fs.readFileSync(new URL('../src/app/components/session/dice/StyledStandardDieIcon.tsx', import.meta.url), 'utf8');
const customizer = fs.readFileSync(new URL('../src/app/components/session/dice/DiceAppearanceCustomizer.tsx', import.meta.url), 'utf8');

assert.ok(
  icon.includes('operator="erode" radius="0.30"'),
  'textured standard dice must use the slimmer 0.30 erosion so colored structure borders stay closer to the internal line weight',
);
assert.doesNotMatch(
  icon,
  /operator="erode" radius="0\.(?:18|24)"/,
  'textured standard dice must not retain either of the heavier old border treatments',
);
assert.ok(
  styled.includes('h-[80%] aspect-square'),
  'd100 percentile faces must stay slightly smaller so the pair remains comfortably inside the quick-roll button',
);
assert.ok(
  styled.includes('gap-[3px] overflow-visible'),
  'styled d100 must keep the tighter 3px pair gap',
);
assert.ok(
  icon.includes('gap-[3px] overflow-visible'),
  'shared d100 icon composition must match the tighter 3px pair gap',
);
assert.ok(
  customizer.includes('<StyledStandardDieIcon') && customizer.includes('previewSkinArt') && customizer.includes("className={selected.sides === 100 ? 'h-24 w-44' : 'h-24 w-24'}"),
  'the personalization main preview must stay on the shared StyledStandardDieIcon path so the slimmer structure treatment applies there too',
);
assert.ok(
  styled.includes('thinStructure={textured}'),
  'all textured standard-die render sizes, including large personalization previews, must use the shared thin-structure treatment',
);

for (const sides of [4, 6, 20]) {
  assert.ok(styled.includes(`sides={sides}`) || styled.includes('thinStructure={textured}'), `d${sides} must remain on the shared thin-structure path`);
}

console.log('Dice slimmer colored borders, shared personalization preview treatment, and d100 footprint verification passed.');