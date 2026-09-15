import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const boost = fs.readFileSync(new URL('src/app/components/session/dice/dice3dVisualBoost.ts', root), 'utf8');

assert.ok(boost.includes('STONE_FACE_EMISSIVE_PULSE'), 'Stone must keep its photographic face pulse');
assert.ok(boost.includes("skin === 'stone' && !descriptor.custom"), 'Only Stone may collect photographic face emissive baselines');
assert.ok(boost.includes('material.emissiveMap = material.map'), 'Stone photographic texture must keep its subtle emissive face pulse');
assert.ok(boost.includes("if (skin === 'stone')"), 'Stone must keep its orbiting local light animation');
assert.ok(boost.includes('pointLight.position.set('), 'Stone local light must orbit outside the die instead of remaining at its center');
assert.ok(boost.includes('const orbitRadius = radius * 1.48'), 'Stone must keep its established light orbit');
assert.ok(!boost.includes("case 'metal': return '#d5ecff'"), 'Metal must keep its dedicated lights disabled');
assert.ok(boost.includes('facePulseBaselines'), 'Stone face pulse must preserve and restore original material state');

console.log('Stone face pulse/orbit light and light-free Metal verification passed.');
