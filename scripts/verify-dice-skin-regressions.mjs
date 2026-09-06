// Regression coverage for photographic Fire/Ice/Lightning/Poison/Stone/Metal rendering, user-selected colors, highlighted 3D labels, and settled effects.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const surface = fs.readFileSync(new URL('src/app/components/session/dice/DiceSkinSurface.tsx', root), 'utf8');
const icon = fs.readFileSync(new URL('src/app/components/session/dice/StyledStandardDieIcon.tsx', root), 'utf8');
const materials = fs.readFileSync(new URL('src/app/components/session/dice/dice3dAppearanceMaterials.ts', root), 'utf8');
const profiles = fs.readFileSync(new URL('src/app/components/session/dice/dice3dSurfaceProfiles.ts', root), 'utf8');
const textures = fs.readFileSync(new URL('src/app/components/session/dice/dice3dSkinTextures.ts', root), 'utf8');
const session = fs.readFileSync(new URL('src/app/components/session/dice/DiceSessionContext.tsx', root), 'utf8');
const renderer = fs.readFileSync(new URL('src/app/components/session/dice/dice3dRenderer.ts', root), 'utf8');

const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(
  surface.includes("const photographicSkin = appearance.skinId === 'fire' || appearance.skinId === 'ice' || appearance.skinId === 'lightning' || appearance.skinId === 'poison' || appearance.skinId === 'stone' || appearance.skinId === 'metal';"),
  'Fire, Ice, Lightning, Poison, Stone and Metal swatches must share photographic-skin border-box handling',
);
expect(
  surface.includes("backgroundOrigin: photographicSkin ? 'border-box' : undefined"),
  'Photographic skin backgrounds must originate from the border box to avoid color slivers',
);
expect(
  icon.includes("if (skinId === 'fire' || skinId === 'ice' || skinId === 'lightning' || skinId === 'poison' || skinId === 'stone' || skinId === 'metal') return symbolColor;"),
  '2D Fire/Ice/Lightning/Poison/Stone/Metal numbers must preserve the exact user-selected symbol color',
);
expect(
  materials.includes("if (skinId === 'fire' || skinId === 'stone' || skinId === 'metal' || getDice3DSurfaceProfile(skinId) === 'photo-unlit') return symbolColor;"),
  '3D Fire, Stone, Metal and every photo-unlit skin must preserve the exact user-selected symbol color',
);
expect(
  materials.includes("import { applyDice3DSurfaceProfile, getDice3DSurfaceProfile } from './dice3dSurfaceProfiles.ts';"),
  '3D label highlighting must reuse the shared surface-profile classification',
);
expect(
  materials.includes('const DICE_SKIN_LABEL_OUTLINE_WIDTH = 8;'),
  'Lit skinned dice must keep the existing shared outline minimum',
);
expect(
  materials.includes('const PHOTO_UNLIT_LABEL_OUTLINE_MIN_WIDTH = 18;'),
  'Photographic dice requiring stronger highlighting must enforce a visibly stronger outline minimum after texture downscaling',
);
expect(
  materials.includes('const PHOTO_UNLIT_LABEL_OUTLINE_MAX_WIDTH = 32;'),
  'Photographic outline scaling must have a safe upper bound',
);
expect(
  materials.includes('const PHOTO_UNLIT_LABEL_OUTLINE_FONT_RATIO = 0.09;'),
  'Photographic outlines must scale proportionally with the renderer font size',
);
expect(
  materials.includes('function dice3DLabelOutlineWidth'),
  '3D dice must centralize proportional label-outline sizing',
);
expect(
  materials.includes("getDice3DSurfaceProfile(skinId) !== 'photo-unlit' && skinId !== 'stone' && skinId !== 'metal'"),
  'Ice, Lightning, Poison, Stone, Metal and future photo-unlit skins must inherit the stronger proportional outline',
);
expect(
  materials.includes('Number.parseFloat(context.font)'),
  'Photographic label-outline sizing must derive from the actual canvas font size',
);
expect(
  materials.includes('runWithDice3DLabelOutlineBoost(descriptor, () => originalCreate(type))'),
  'Standard skinned dice creation must render labels through the profile-aware outline boost',
);
expect(
  materials.includes('runWithDice3DLabelOutlineBoost(descriptor, () => previousSwapD4.call(box, dicemesh, result))'),
  'D4 face swaps must retain the same profile-aware label outline',
);
expect(
  materials.includes("!descriptor.custom && descriptor.appearance.skinId !== 'none'"),
  'Shared outline boosting must leave unskinned/custom dice untouched',
);

const iceTextureFn = textures.match(/function drawIcePhotoTexture[\s\S]*?\n}\n/)?.[0] ?? '';
expect(!iceTextureFn.includes('fillStyle = bodyColor'), 'Ice 3D photographic texture must not be tinted by bodyColor');
expect(!/drawIcePhotoTexture\([^)]*bodyColor/.test(textures), 'Ice texture renderer must not accept bodyColor tinting');

const lightningTextureFn = textures.match(/function drawLightningPhotoTexture[\s\S]*?\n}\n/)?.[0] ?? '';
expect(lightningTextureFn.length > 0, 'Lightning must have a dedicated photographic 3D texture renderer');
expect(!lightningTextureFn.includes('fillStyle = bodyColor'), 'Lightning 3D photographic texture must not be tinted by bodyColor');
expect(!/drawLightningPhotoTexture\([^)]*bodyColor/.test(textures), 'Lightning texture renderer must not accept bodyColor tinting');

const poisonTextureFn = textures.match(/function drawPoisonPhotoTexture[\s\S]*?\n}\n/)?.[0] ?? '';
expect(poisonTextureFn.length > 0, 'Poison must have a dedicated photographic 3D texture renderer');
expect(!poisonTextureFn.includes('fillStyle = bodyColor'), 'Poison 3D photographic texture must not be tinted by bodyColor');
expect(!/drawPoisonPhotoTexture\([^)]*bodyColor/.test(textures), 'Poison texture renderer must not accept bodyColor tinting');

const stoneTextureFn = textures.match(/function drawStonePhotoTexture[\s\S]*?\n}\n/)?.[0] ?? '';
expect(stoneTextureFn.length > 0, 'Stone must have a dedicated photographic 3D texture renderer');
expect(!stoneTextureFn.includes('fillStyle = bodyColor'), 'Stone 3D photographic texture must preserve the rock photograph instead of bodyColor tinting');
expect(!/drawStonePhotoTexture\([^)]*bodyColor/.test(textures), 'Stone texture renderer must not accept bodyColor tinting');

const metalTextureFn = textures.match(/function drawMetalPhotoTexture[\s\S]*?\n}\n/)?.[0] ?? '';
expect(metalTextureFn.length > 0, 'Metal must have a dedicated photographic 3D texture renderer');
expect(!metalTextureFn.includes('fillStyle = bodyColor'), 'Metal 3D photographic texture must preserve the metal photograph instead of bodyColor tinting');
expect(!/drawMetalPhotoTexture\([^)]*bodyColor/.test(textures), 'Metal texture renderer must not accept bodyColor tinting');

const iceMaterialFn = materials.match(/function preserveIceFaceTexture[\s\S]*?\n}\n/)?.[0] ?? '';
expect(iceMaterialFn === '', 'Ice must not emulate an unlit surface by mutating a lit Phong material');
expect(materials.includes('applyDice3DSurfaceProfile(mesh, descriptor);'), 'Every standard die must apply its declared surface profile');
expect(profiles.includes("ice: 'photo-unlit'"), 'Ice must declare the reusable photo-unlit profile');
expect(profiles.includes("lightning: 'photo-unlit'"), 'Lightning must reuse the photo-unlit profile for stable vivid faces');
expect(profiles.includes("poison: 'photo-unlit'"), 'Poison must reuse the photo-unlit profile for stable vivid faces');
expect(profiles.includes("stone: 'photo-lit'"), 'Stone must keep scene lighting for believable rocky depth');
expect(profiles.includes("metal: 'photo-lit'"), 'Metal must keep scene lighting for believable metallic depth');

const fireMaterialFn = materials.match(/function preserveFireFaceTexture[\s\S]*?\n}\n/)?.[0] ?? '';
expect(fireMaterialFn.includes('material.color?.set?.(0xffffff)'), 'Fire face diffuse behavior must remain unchanged');
expect(!fireMaterialFn.includes('material.toneMapped = false'), 'Photo-unlit isolation must not change Fire tone mapping');

const stoneMaterialFn = materials.match(/function preserveStoneFaceTexture[\s\S]*?\n}\n/)?.[0] ?? '';
expect(stoneMaterialFn.includes('material.color?.set?.(0xffffff)'), 'Stone faces must keep a neutral white multiplier over the photograph');
expect(stoneMaterialFn.includes('material.roughness = 0.9'), 'Stone photographic faces must remain strongly matte');
expect(stoneMaterialFn.includes('material.metalness = 0'), 'Stone photographic faces must remain non-metallic');

const metalMaterialFn = materials.match(/function preserveMetalFaceTexture[\s\S]*?\n}\n/)?.[0] ?? '';
expect(metalMaterialFn.includes('material.color?.set?.(0xffffff)'), 'Metal faces must keep a neutral white multiplier over the photograph');
expect(metalMaterialFn.includes('material.roughness = 0.46'), 'Metal photographic faces must retain controlled roughness');
expect(metalMaterialFn.includes('material.metalness = 0.58'), 'Metal photographic faces must retain physically metallic response');

expect(
  session.includes('const DICE_ANIMATED_SETTLED_HOLD_MS = 2000;'),
  'Animated dice must remain settled for 2000 ms, one second less than before',
);
expect(
  renderer.includes('private settledRenderRaf: number | null = null;'),
  '3D renderer must own a settled-phase RAF so effects keep rendering after physics stop',
);
expect(
  renderer.includes('this.startSettledRenderLoop();'),
  '3D renderer must start the settled redraw loop after an effects-enabled roll finishes',
);
expect(
  renderer.includes('box.renderer.render(box.scene, box.camera);'),
  'Settled redraw loop must render the Three.js scene while effects continue updating',
);
expect(
  renderer.includes('this.stopSettledRenderLoop();'),
  'Settled redraw loop must be stopped when the dice are cleared or replaced',
);

if (failures.length) {
  throw new assert.AssertionError({
    message: `Dice skin regressions still present:\n- ${failures.join('\n- ')}`,
    actual: failures.length,
    expected: 0,
    operator: 'strictEqual',
  });
}

console.log('Fire/Ice/Lightning/Poison/Stone/Metal rendering, exact colors, proportional photographic labels, shared surface profiles, and settled-effect lifecycle verification passed.');
