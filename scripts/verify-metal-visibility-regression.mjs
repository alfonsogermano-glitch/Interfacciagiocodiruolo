import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const boost = fs.readFileSync(new URL('src/app/components/session/dice/dice3dVisualBoost.ts', root), 'utf8');

assert.ok(!boost.includes('METAL_FACE_EMISSIVE_PULSE'), 'Metal photographic faces must not use emissive-map pulsing: it washes the texture out to white');
assert.ok(!boost.includes("(skin === 'stone' || skin === 'metal') && !descriptor.custom"), 'Metal must not be included in photographic face emissive baselines');
assert.ok(boost.includes("if (skin === 'stone' || skin === 'metal')"), 'Metal must keep the external/orbiting light animation');
assert.ok(boost.includes("skin === 'metal' ? 0.82"), 'Metal must keep its dedicated moving point-light boost');
assert.ok(boost.includes('METAL_FILL_INTENSITY = 0.55'), 'Metal must lift silvery faces with a dedicated fill intensity');
assert.ok(boost.includes("new THREE.HemisphereLight(METAL_FILL_SKY_COLOR, METAL_FILL_GROUND_COLOR, METAL_FILL_INTENSITY)"), 'Metal fill must be a soft hemisphere light that preserves the brushed texture');
assert.ok(boost.includes("descriptor.appearance.skinId === 'metal' && !descriptor.custom"), 'Metal fill must apply to standard dice only, never to custom dice or other skins');

console.log('Metal visibility regression verification passed.');
