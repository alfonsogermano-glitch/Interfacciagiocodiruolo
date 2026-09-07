import assert from 'node:assert/strict';
import fs from 'node:fs';

const icon = fs.readFileSync(new URL('../src/app/components/session/dice/DiceTypeIcon.tsx', import.meta.url), 'utf8');
const styled = fs.readFileSync(new URL('../src/app/components/session/dice/StyledStandardDieIcon.tsx', import.meta.url), 'utf8');
const customizer = fs.readFileSync(new URL('../src/app/components/session/dice/DiceAppearanceCustomizer.tsx', import.meta.url), 'utf8');

assert.ok(
  icon.includes('operator="erode" radius="0.27"'),
  'textured dice internal structure must use the balanced 0.27 erosion between the previous 0.24 and over-thin 0.30 treatments',
);
assert.doesNotMatch(
  icon,
  /operator="erode" radius="0\.30"/,
  'textured dice must not retain the over-thinned 0.30 erosion',
);
assert.doesNotMatch(
  icon,
  /const DICE_OUTLINE_BY_SIDES|const exactOutline =/,
  'the exact silhouette outline must not be embedded in the separately rasterized DiceTypeIcon layer',
);
assert.ok(
  styled.includes('data-dice-exact-outline') && styled.includes('strokeWidth="0.46"'),
  'textured dice must redraw the true outer silhouette in the same SVG as the photographic skin using the refined 0.46 stroke',
);
assert.ok(
  styled.includes('d={DICE_SILHOUETTE_PATHS[sides]}'),
  'the exact colored outline must share the identical silhouette path used by the skin clipping surface',
);
assert.doesNotMatch(
  styled,
  /strokeWidth="0\.52"/,
  'textured dice must not retain the slightly too-heavy 0.52 outer silhouette stroke',
);
assert.ok(
  styled.includes('h-[76%] aspect-square'),
  'd100 percentile faces must be genuinely more compact so the pair fits comfortably inside its button',
);
assert.doesNotMatch(
  styled,
  /h-\[80%\] aspect-square/,
  'd100 must not retain the previous 80% footprint',
);
assert.ok(
  styled.includes('gap-[3px] overflow-visible'),
  'styled d100 must keep the tight 3px pair gap',
);
assert.ok(
  customizer.includes('<StyledStandardDieIcon') && customizer.includes('previewSkinArt') && customizer.includes("className={selected.sides === 100 ? 'h-24 w-44' : 'h-24 w-24'}"),
  'the personalization main preview must stay on the shared StyledStandardDieIcon path so the exact-edge outline shares the skin SVG at large size',
);
assert.ok(
  styled.includes('thinStructure={textured}'),
  'all textured standard-die render sizes must continue through the same two-tone structure path',
);

console.log('Dice exact-edge SVG registration, refined thin outer stroke, shared personalization preview, and compact d100 verification passed.');
