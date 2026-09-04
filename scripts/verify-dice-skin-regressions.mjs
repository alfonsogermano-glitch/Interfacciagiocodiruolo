// Regression coverage for photographic Fire/Ice rendering and user-selected colors.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const surface = fs.readFileSync(new URL('src/app/components/session/dice/DiceSkinSurface.tsx', root), 'utf8');
const icon = fs.readFileSync(new URL('src/app/components/session/dice/StyledStandardDieIcon.tsx', root), 'utf8');
const materials = fs.readFileSync(new URL('src/app/components/session/dice/dice3dAppearanceMaterials.ts', root), 'utf8');
const textures = fs.readFileSync(new URL('src/app/components/session/dice/dice3dSkinTextures.ts', root), 'utf8');

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
expect(iceMaterialFn.includes('material.emissive?.set?.(0xffffff)'), 'Ice faces must use neutral-white emissive color');
expect(iceMaterialFn.includes('material.emissiveMap = material.map'), 'Ice faces must use their photographic map as emissiveMap to resist warm scene lighting');
expect(iceMaterialFn.includes('ICE_FACE_EMISSIVE_INTENSITY'), 'Ice face emissive intensity must be explicit and stable');

if (failures.length) {
  throw new assert.AssertionError({
    message: `Dice skin regressions still present:\n- ${failures.join('\n- ')}`,
    actual: failures.length,
    expected: 0,
    operator: 'strictEqual',
  });
}

console.log('Fire/Ice swatch coverage, exact number colors, and neutral Ice 3D color verification passed.');
