import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const boost = fs.readFileSync(new URL('src/app/components/session/dice/dice3dVisualBoost.ts', root), 'utf8');

assert.ok(boost.includes('STONE_FACE_EMISSIVE_PULSE'), 'Stone must pulse the photographic face itself, not only external particles');
assert.ok(boost.includes('METAL_FACE_EMISSIVE_PULSE'), 'Metal must pulse the photographic face itself, not only external sparks');
assert.ok(boost.includes("skin === 'stone' || skin === 'metal'"), 'Stone and Metal must collect face materials for photographic animation');
assert.ok(boost.includes('material.emissiveMap = material.map'), 'Stone/Metal photographic texture must drive the subtle emissive face pulse');
assert.ok(boost.includes('pointLight.position.set('), 'Stone/Metal local light must orbit outside the die instead of remaining at its center');
assert.ok(boost.includes("skin === 'metal' ? radius * 1.62 : radius * 1.48"), 'Metal and Stone must use visible but distinct light orbits');
assert.ok(boost.includes('facePulseBaselines'), 'Stone/Metal face pulse must preserve and restore original material state');

console.log('Stone/Metal photographic face animation verification passed.');
