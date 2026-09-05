// Regression coverage for photographic Fire/Ice rendering, user-selected colors, and settled 3D effects.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const surface = fs.readFileSync(new URL('src/app/components/session/dice/DiceSkinSurface.tsx', root), 'utf8');
const icon = fs.readFileSync(new URL('src/app/components/session/dice/StyledStandardDieIcon.tsx', root), 'utf8');
const materials = fs.readFileSync(new URL('src/app/components/session/dice/dice3dAppearanceMaterials.ts', root), 'utf8');
const textures = fs.readFileSync(new URL('src/app/components/session/dice/dice3dSkinTextures.ts', root), 'utf8');
const session = fs.readFileSync(new URL('src/app/components/session/dice/DiceSessionContext.tsx', root), 'utf8');
const renderer = fs.readFileSync(new URL('src/app/components/session/dice/dice3dRenderer.ts', root), 'utf8');

const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(
  surface.includes("const photographicSkin = appearance.skinId === 'fire' || appearance.skinId === 'ice';"),
  'Fire and Ice swatches must share photographic-skin border-box handling',
);
expect(
  surface.includes("backgroundOrigin: photographicSkin ? 'border-box' : undefined"),
  'Photographic skin backgrounds must originate from the border box to avoid color slivers',
);
expect(
  icon.includes("if (skinId === 'fire' || skinId === 'ice') return symbolColor;"),
  '2D Fire/Ice numbers must preserve the exact user-selected symbol color',
);
expect(
  materials.includes("if (skinId === 'fire' || skinId === 'ice') return symbolColor;"),
  '3D Fire/Ice numbers must preserve the exact user-selected symbol color',
);

const iceTextureFn = textures.match(/function drawIcePhotoTexture[\s\S]*?\n}\n/)?.[0] ?? '';
expect(!iceTextureFn.includes('fillStyle = bodyColor'), 'Ice 3D photographic texture must not be tinted by bodyColor');
expect(!/drawIcePhotoTexture\([^)]*bodyColor/.test(textures), 'Ice texture renderer must not accept bodyColor tinting');

const iceMaterialFn = materials.match(/function preserveIceFaceTexture[\s\S]*?\n}\n/)?.[0] ?? '';
expect(iceMaterialFn.includes('material.color?.set?.(0x000000)'), 'Ice face diffuse color must be black so scene lighting cannot multiply or tint the photograph');
expect(iceMaterialFn.includes('material.emissive?.set?.(0xffffff)'), 'Ice faces must use neutral-white emissive color');
expect(iceMaterialFn.includes('material.emissiveMap = material.map'), 'Ice faces must use their photographic map as emissiveMap to resist warm scene lighting');
expect(iceMaterialFn.includes('material.emissiveIntensity = 1'), 'Ice photographic emissive map must retain its source brightness');
expect(iceMaterialFn.includes('material.toneMapped = false'), 'Ice photographic faces must bypass scene tone mapping');

const fireMaterialFn = materials.match(/function preserveFireFaceTexture[\s\S]*?\n}\n/)?.[0] ?? '';
expect(fireMaterialFn.includes('material.color?.set?.(0xffffff)'), 'Fire face diffuse behavior must remain unchanged');
expect(!fireMaterialFn.includes('material.toneMapped = false'), 'Ice lighting isolation must not change Fire tone mapping');

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

console.log('Fire/Ice rendering, exact colors, neutral Ice 3D color, and settled-effect lifecycle verification passed.');
