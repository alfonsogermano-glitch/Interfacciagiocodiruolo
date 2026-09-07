import assert from 'node:assert/strict';
import fs from 'node:fs';

const icon = fs.readFileSync(new URL('../src/app/components/session/dice/DiceTypeIcon.tsx', import.meta.url), 'utf8');
const styled = fs.readFileSync(new URL('../src/app/components/session/dice/StyledStandardDieIcon.tsx', import.meta.url), 'utf8');

assert.doesNotMatch(
  icon,
  /const exactOutline =/,
  'the exact textured-die perimeter must not be rasterized inside the separate DiceTypeIcon image layer',
);
assert.ok(
  styled.includes('data-dice-exact-outline') && styled.includes('strokeWidth="0.46"'),
  'the exact colored perimeter must be drawn in the same SVG coordinate system as the photographic skin surface',
);
assert.ok(
  styled.includes('d={DICE_SILHOUETTE_PATHS[sides]}'),
  'the exact preview perimeter must use the same silhouette path as the skin clip itself',
);
assert.ok(
  styled.includes("appearance.skinId !== 'none' && ("),
  'the shared exact perimeter must be limited to textured skins so unskinned dice stay unchanged',
);

console.log('Dice personalization preview exact edge registration verification passed.');
