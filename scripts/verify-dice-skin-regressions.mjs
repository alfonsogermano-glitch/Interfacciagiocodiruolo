// Regression coverage for photographic Fire/Ice/Lightning rendering, user-selected colors, highlighted 3D labels, and settled effects.
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
  surface.includes("const photographicSkin = appearance.skinId === 'fire' || appearance.skinId === 'ice' || appearance.skinId === 'lightning';"),
  'Fire, Ice and Lightning swatches must share photographic-skin border-box handling',
);
expect(
  surface.includes("backgroundOrigin: photographicSkin ? 'border-box' : undefined"),
  'Photographic skin backgrounds must originate from the border box to avoid color slivers',
);
expect(
  icon.includes("if (skinId === 'fire' || skinId === 'ice' || skinId === 'lightning') return symbolColor;"),
  '2D Fire/Ice/Lightning numbers must preserve the exact user-selected symbol color',
);
expect(
  materials.includes("if (skinId === 'fire' || skinId === 'ice' || skinId === 'lightning') return symbolColor;"),
  '3D Fire/Ice/Lightning numbers must preserve the exact user-selected symbol color',
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
  'Photo-unlit dice must enforce a visibly stronger outline minimum after texture downscaling',
);
expect(
  materials.includes('const PHOTO_UNLIT_LABEL_OUTLINE_MAX_WIDTH = 32;'),
  'Photo-unlit outline scaling must have a safe upper bound',
);
expect(
  materials.includes('const PHOTO_UNLIT_LABEL_OUTLINE_FONT_RATIO = 0.09;'),
  'Photo-unlit outlines must scale proportionally with the renderer font size',
);
expect(
  materials.includes('function dice3DLabelOutlineWidth'),
  '3D dice must centralize proportional label-outline sizing',
);
expect(
  materials.includes("getDice3DSurfaceProfile(descriptor.appearance.skinId) !== 'photo-unlit'"),
  'Ice, Lightning and future photo-unlit skins must inherit the stronger proportional outline automatically',
);
expect(
  materials.includes('Number.parseFloat(context.font)'),
  'Photo-unlit label-outline sizing must derive from the actual canvas font size',
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

const iceMaterialFn = materials.match(/function preserveIceFaceTexture[\s\S]*?\n}\n/)?.[0] ?? '';
expect(iceMaterialFn === '', 'Ice must not emulate an unlit surface by mutating a lit Phong material');
expect(materials.includes('applyDice3DSurfaceProfile(mesh, descriptor);'), 'Every standard die must apply its declared surface profile');
expect(profiles.includes("ice: 'photo-unlit'"), 'Ice must declare the reusable photo-unlit profile');
expect(profiles.includes("lightning: 'photo-unlit'"), 'Lightning must reuse the photo-unlit profile for stable vivid faces');

const fireMaterialFn = materials.match(/function preserveFireFaceTexture[\s\S]*?\n}\n/)?.[0] ?? '';
expect(fireMaterialFn.includes('material.color?.set?.(0xffffff)'), 'Fire face diffuse behavior must remain unchanged');
expect(!fireMaterialFn.includes('material.toneMapped = false'), 'Photo-unlit isolation must not change Fire tone mapping');

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

console.log('Fire/Ice/Lightning rendering, exact colors, proportional photo-unlit labels, shared surface profiles, and settled-effect lifecycle verification passed.');
