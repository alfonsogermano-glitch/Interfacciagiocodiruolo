import assert from 'node:assert/strict';
import fs from 'node:fs';

const icon = fs.readFileSync(new URL('../src/app/components/session/dice/DiceTypeIcon.tsx', import.meta.url), 'utf8');

assert.ok(icon.includes('data-die-style="faceted-3d"'), 'quick dice icons must use the faceted 3D treatment');
assert.doesNotMatch(icon, /<text\b/, 'faceted dice icons must not show identifying numbers inside the die');
assert.ok(icon.includes('data-die-facets'), 'faceted dice icons must expose internal face lines');
for (const sides of [4, 6, 8, 10, 12, 20, 100]) {
  assert.ok(icon.includes(`data-die-shape="d${sides}"`), `Missing dedicated d${sides} vector shape`);
}
assert.ok(icon.includes('data-die-percentile-tens'), 'd100 must keep a dedicated tens d10');
assert.ok(icon.includes('data-die-percentile-units'), 'd100 must keep a dedicated units d10');

console.log('Dice icon style verification passed.');
