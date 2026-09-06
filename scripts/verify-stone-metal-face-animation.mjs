import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const boost = fs.readFileSync(new URL('src/app/components/session/dice/dice3dVisualBoost.ts', root), 'utf8');

assert.ok(boost.includes('STONE_FACE_EMISSIVE_PULSE'), 'Stone must keep its photographic face pulse');
assert.ok(boost.includes("skin === 'stone' && !descriptor.custom"), 'Only Stone may collect photographic face emissive baselines');
assert.ok(boost.includes('material.emissiveMap = material.map'), 'Stone photographic texture must keep its subtle emissive face pulse');
assert.ok(boost.includes("if (skin === 'stone' || skin === 'metal')"), 'Stone and Metal must keep the orbiting local light animation');
assert.ok(boost.includes('pointLight.position.set('), 'Stone/Metal local light must orbit outside the die instead of remaining at its center');
assert.ok(boost.includes("skin === 'metal' ? radius * 1.62 : radius * 1.48"), 'Metal and Stone must use visible but distinct light orbits');
assert.ok(boost.includes('facePulseBaselines'), 'Stone face pulse must preserve and restore original material state');

console.log('Stone face pulse and Stone/Metal orbit-light verification passed.');
