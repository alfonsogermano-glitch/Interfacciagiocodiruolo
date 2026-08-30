import assert from 'node:assert/strict';
import fs from 'node:fs';

const icon = fs.readFileSync(new URL('../src/app/components/session/dice/DiceTypeIcon.tsx', import.meta.url), 'utf8');

assert.ok(icon.includes('data-die-style="wireframe-polyhedral"'), 'quick dice icons must use the clear wireframe polyhedral treatment');
assert.doesNotMatch(icon, /data-die-style="faceted-3d"/, 'quick dice icons must no longer use the previous faceted-3d treatment');
assert.doesNotMatch(icon, /<text\b/, 'wireframe dice icons must not show identifying numbers inside the die');
assert.ok(icon.includes('data-die-wireframe-shell'), 'wireframe dice icons must expose a clear outer shell');
assert.ok(icon.includes('data-die-wireframe-edges'), 'wireframe dice icons must expose simplified internal polyhedral edges');
for (const sides of [4, 6, 8, 10, 12, 20, 100]) {
  assert.ok(icon.includes(`data-die-shape="d${sides}"`), `Missing dedicated d${sides} vector shape`);
}
assert.ok(icon.includes('data-die-percentile-tens'), 'd100 must keep a dedicated tens d10');
assert.ok(icon.includes('data-die-percentile-units'), 'd100 must keep a dedicated units d10');

console.log('Dice icon style verification passed.');
