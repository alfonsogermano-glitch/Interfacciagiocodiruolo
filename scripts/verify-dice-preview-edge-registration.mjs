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
assert.ok(
  icon.includes('hg-internal-structure-mask') && icon.includes('DICE_EDGE_MASK_PATHS'),
  'the rasterized internal-structure layer must explicitly mask away its duplicate outer shell using the real die silhouette',
);
assert.ok(
  icon.includes('mask="url(#hg-internal-structure-mask)"'),
  'textured internal structure must apply the edge-suppression mask so the eroded legacy perimeter cannot appear one pixel inside the real outline',
);
assert.ok(
  icon.includes('id="hg-edge-inset"') && icon.includes('operator="erode" radius="2"'),
  'the edge-suppression mask must remove the legacy outer shell before the exact 0.46 perimeter is drawn by the skin SVG',
);

console.log('Dice personalization preview exact edge registration and duplicate-outline suppression verification passed.');
