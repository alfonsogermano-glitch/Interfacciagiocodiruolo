import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const boost = fs.readFileSync(new URL('src/app/components/session/dice/dice3dVisualBoost.ts', root), 'utf8');
const materials = fs.readFileSync(new URL('src/app/components/session/dice/dice3dAppearanceMaterials.ts', root), 'utf8');
const effects = fs.readFileSync(new URL('src/app/components/session/dice/dice3dSkinEffects.ts', root), 'utf8');
const textures = fs.readFileSync(new URL('src/app/components/session/dice/dice3dSkinTextures.ts', root), 'utf8');

assert.ok(!boost.includes('METAL_FACE_EMISSIVE_PULSE'), 'Metal photographic faces must not use emissive-map pulsing: it washes the texture out to white');
assert.ok(!boost.includes("(skin === 'stone' || skin === 'metal') && !descriptor.custom"), 'Metal must not be included in photographic face emissive baselines');
assert.ok(materials.includes("skinId === 'metal' ? Math.min(48, base * 1.4) : base"), 'Metal number outlines must be stronger to survive bright faces');
assert.ok(!boost.includes("case 'metal': return '#d5ecff'"), 'Metal must not create a local point light');
assert.ok(!boost.includes('METAL_FILL_') && !boost.includes('createFillLight'), 'Metal must not create a dedicated fill light');
assert.ok(!materials.includes('cloneSceneHemisphere'), 'Metal must not clone renderer lights into each die');
assert.ok(boost.includes('isSettled') && boost.includes('settleDimFactor'), 'Orbiting lights must fade once dice settle so final numbers stay readable');
assert.ok(boost.includes('RESERVED_OBJECT_ID_COUNT') && boost.includes('new THREE.Object3D()'), 'Our three copy must reserve object ids past any scene-light collision');
assert.ok(!materials.includes('protectReflectiveDiceLabelFromLighting'), 'Photographic faces must not rely on an injected reflective shader');
assert.ok(!materials.includes('repairSettledFaceMaps') && !effects.includes('repairDarkFaceMap'), 'Metal must not repaint composed face canvases during or after a roll');
assert.ok(!textures.includes('getImageData(') && !textures.includes('sampledFaceLuminance'), 'Metal texture generation must not perform Canvas readbacks');
assert.ok(materials.includes('factory.materials_cache = {};'), 'Face cache must reset between rolls so 2D contexts never run out');
assert.ok(textures.includes("if (!context || !bump) throw new Error('Contesto 2D non disponibile"), 'Empty texture descriptors must fail loudly instead of poisoning the cache');
assert.ok(textures.includes('drawImageCover(context, image, size);'), 'Metal faces must be composed directly from the preloaded replacement photograph');

console.log('Metal light-free visibility and Canvas stability regression verification passed.');
