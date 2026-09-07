import assert from 'node:assert/strict';
import fs from 'node:fs';

const icon = fs.readFileSync(new URL('../src/app/components/session/dice/DiceTypeIcon.tsx', import.meta.url), 'utf8');
const styled = fs.readFileSync(new URL('../src/app/components/session/dice/StyledStandardDieIcon.tsx', import.meta.url), 'utf8');
const customizer = fs.readFileSync(new URL('../src/app/components/session/dice/DiceAppearanceCustomizer.tsx', import.meta.url), 'utf8');

assert.ok(
  icon.includes('operator="erode" radius="0.22"'),
  'textured dice internal structure must use the balanced 0.22 erosion rather than the over-thinned 0.30 treatment',
);
assert.doesNotMatch(
  icon,
  /operator="erode" radius="0\.30"/,
  'textured dice must not retain the over-thinned 0.30 erosion',
);
assert.ok(
  icon.includes('const DICE_OUTLINE_BY_SIDES'),
  'textured dice must have an exact silhouette outline map independent from the eroded internal structure',
);
assert.ok(
  icon.includes('stroke="${safeStructureColor}"') && icon.includes('stroke-width="0.52"'),
  'textured dice must redraw the outer silhouette at the true die edge with a thin 0.52 stroke',
);
assert.ok(
  icon.includes('vector-effect="non-scaling-stroke"'),
  'the exact outer silhouette stroke must remain visually stable at quick-roll and personalization preview sizes',
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
  'the personalization main preview must stay on the shared StyledStandardDieIcon path so the exact-edge outline is identical there',
);
assert.ok(
  styled.includes('thinStructure={textured}'),
  'all textured standard-die render sizes must continue through the same two-tone structure path',
);

console.log('Dice exact-edge colored outline, balanced internal structure, shared personalization preview, and compact d100 verification passed.');
