import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/app/components/session/dice/dice3dAppearanceMaterials.ts', import.meta.url), 'utf8');

assert.ok(source.includes('function protectReflectiveDiceLabelFromLighting'), 'Metal and Obsidian need a dedicated label-lighting shield');
assert.ok(source.includes("skinId !== 'metal' && skinId !== 'obsidian'"), 'label shield must be limited to Metal and Obsidian');
assert.ok(source.includes('reflectiveLabelMasks'), 'label mask must be captured separately from the photographic face');
assert.ok(source.includes('originalFillText'), 'label fill must be mirrored into the protection mask');
assert.ok(source.includes('originalStrokeText'), 'label outline must be mirrored into the protection mask');
assert.ok(source.includes('reflectiveLabelMask'), 'the face shader must receive a dedicated label mask');
assert.ok(source.includes("'#include <colorspace_fragment>'"), 'label protection must run after lighting/tone mapping/color conversion');
assert.ok(source.includes('texture2D(reflectiveLabelMask, vMapUv).r'), 'shader must sample the dedicated label mask');
assert.ok(source.includes('texture2D(map, vMapUv).rgb'), 'protected pixels must reuse the original user-colored face texel');
assert.ok(source.includes('gl_FragColor.rgb = mix('), 'protected label pixels must override the lit/specular result');
assert.ok(source.includes('protectReflectiveDiceLabelFromLighting(material, descriptor)'), 'standard reflective faces must install the label shield');

console.log('Reflective Metal/Obsidian label lighting protection verification passed.');
