import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const boost = fs.readFileSync(new URL('src/app/components/session/dice/dice3dVisualBoost.ts', root), 'utf8');
const materials = fs.readFileSync(new URL('src/app/components/session/dice/dice3dAppearanceMaterials.ts', root), 'utf8');
const effects = fs.readFileSync(new URL('src/app/components/session/dice/dice3dSkinEffects.ts', root), 'utf8');
const textures = fs.readFileSync(new URL('src/app/components/session/dice/dice3dSkinTextures.ts', root), 'utf8');

assert.ok(!boost.includes('METAL_FACE_EMISSIVE_PULSE'), 'Metal photographic faces must not use emissive-map pulsing: it washes the texture out to white');
assert.ok(!boost.includes("(skin === 'stone' || skin === 'metal') && !descriptor.custom"), 'Metal must not be included in photographic face emissive baselines');
assert.ok(boost.includes("if (skin === 'stone' || skin === 'metal')"), 'Metal must keep the external/orbiting light animation');
assert.ok(boost.includes("skin === 'metal' ? 0.82"), 'Metal must keep its dedicated moving point-light boost');
assert.ok(boost.includes('METAL_FILL_INTENSITY = 0.22'), 'Metal fill must lift faces without washing them out');
assert.ok(boost.includes('createFillLight') && boost.includes('METAL_FILL_INTENSITY'), 'Metal fill must come from a provided factory using the renderer three copy');
assert.ok(materials.includes('cloneSceneHemisphere') && materials.includes('isHemisphereLight'), 'Fill light must clone a scene hemisphere so light-cache ids stay unique');
assert.ok(boost.includes("descriptor.appearance.skinId === 'metal' && !descriptor.custom"), 'Metal fill must apply to standard dice only, never to custom dice or other skins');
assert.ok(boost.includes('isSettled') && boost.includes('settleDimFactor'), 'Orbiting lights must fade once dice settle so final numbers stay readable');
assert.ok(boost.includes('RESERVED_OBJECT_ID_COUNT') && boost.includes('new THREE.Object3D()'), 'Our three copy must reserve object ids past any scene-light collision');
assert.ok(materials.includes('repairSettledFaceMaps(meshAppearances)'), 'Settled faces must be repaired from the tracked appearance queue');
assert.ok(
  effects.includes('repairDarkFaceMap(photo, faceCanvas)') && effects.includes('getDice3DTextureDescriptor(entry.descriptor.appearance).texture'),
  'Rolling faces must heal within frames through the same shared repair',
);
assert.ok(textures.includes('export function repairDarkFaceMap'), 'Face repair must live in a single shared module');
assert.ok(materials.includes('factory.materials_cache = {};'), 'Face cache must reset between rolls so 2D contexts never run out');
assert.ok(textures.includes("if (!context || !bump) throw new Error('Contesto 2D non disponibile"), 'Empty texture descriptors must fail loudly instead of poisoning the cache');
assert.ok(textures.includes("globalCompositeOperation = 'lighten'"), 'Face repair must repaint the photo under the labels without covering them');
assert.ok(textures.includes('sampledFaceLuminance(face) >= 0.3'), 'Face repair must only touch dark faces and leave correct ones alone');

console.log('Metal visibility regression verification passed.');
