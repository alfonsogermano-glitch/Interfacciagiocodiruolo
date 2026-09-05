import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const skins = fs.readFileSync(new URL('src/app/components/session/dice/diceSkins.ts', root), 'utf8');
const data = fs.readFileSync(new URL('src/app/components/session/dice/iceTextureData.ts', root), 'utf8');
const chunks = Array.from({ length: 6 }, (_, index) => fs.readFileSync(new URL(`src/app/components/session/dice/iceTextureChunk${index}.ts`, root), 'utf8'));
const textures = fs.readFileSync(new URL('src/app/components/session/dice/dice3dSkinTextures.ts', root), 'utf8');
const materials = fs.readFileSync(new URL('src/app/components/session/dice/dice3dAppearanceMaterials.ts', root), 'utf8');
const customizer = fs.readFileSync(new URL('src/app/components/session/dice/DiceAppearanceCustomizer.tsx', root), 'utf8');
const surface = fs.readFileSync(new URL('src/app/components/session/dice/DiceSkinSurface.tsx', root), 'utf8');
const appearance = fs.readFileSync(new URL('src/app/components/session/dice/diceAppearance.ts', root), 'utf8');
const service = fs.readFileSync(new URL('src/services/supabase/diceStandardStyleService.ts', root), 'utf8');
const fire = fs.readFileSync(new URL('src/app/components/session/dice/fireTextureData.ts', root), 'utf8');

assert.ok(skins.includes('ICE_TEXTURE_DATA_URL'), '2D Ice must use the official photographic texture');
assert.ok(data.includes('data:image/webp;base64'), 'Ice texture source must remain the embedded user photograph');
assert.ok(data.includes('viewBox="0 0 512 512"'), 'Ice texture must expose a square surface for die-shaped previews');
assert.ok(data.includes('preserveAspectRatio="xMidYMid slice"'), 'Ice texture must crop with cover semantics without distorting the photograph');
assert.ok(data.includes('data:image/svg+xml;charset=utf-8'), 'Ice texture must use the square SVG wrapper in 2D and 3D');
assert.ok(chunks.every((content, index) => content.includes(`ICE_TEXTURE_CHUNK_${index}`)), 'All Ice texture chunks must exist');
assert.ok(Array.from({ length: 6 }, (_, index) => data.includes(`ICE_TEXTURE_CHUNK_${index}`)).every(Boolean), 'Ice texture data must assemble every embedded chunk');

const encoded = chunks.map((content, index) => {
  const match = content.match(new RegExp(`ICE_TEXTURE_CHUNK_${index}\\s*=\\s*['\"]([^'\"]+)['\"]`));
  assert.ok(match, `Ice texture chunk ${index} must contain base64 payload`);
  return match[1];
}).join('');
const image = Buffer.from(encoded, 'base64');
assert.equal(image.length, 44_108, 'Ice texture must match the optimized bright user-provided photographic WebP payload');
assert.equal(image.subarray(0, 4).toString('ascii'), 'RIFF', 'Ice texture must be a RIFF image');
assert.equal(image.subarray(8, 12).toString('ascii'), 'WEBP', 'Ice texture must be a WebP image');
assert.equal(
  createHash('sha256').update(image).digest('hex'),
  '7ddacb18f866baeff79e6a789e67e2516a8fd7cd65a5423bb5029306bfe02bfb',
  'Ice texture must match the exact optimized image generated from the user-provided bright ice photograph',
);
assert.ok(surface.includes("const photographicSkin = appearance.skinId === 'fire' || appearance.skinId === 'ice';"), 'Fire and Ice swatches must share photographic full-coverage handling');
assert.ok(surface.includes("backgroundOrigin: photographicSkin ? 'border-box' : undefined"), 'Photographic swatches must paint below their border without body-color slivers');

assert.ok(textures.includes('const iceTextureImage = createTextureImage(ICE_TEXTURE_DATA_URL'), '3D Ice must load the same photographic texture');
assert.ok(textures.includes('drawIcePhotoTexture(context, bump, size)'), '3D Ice must render the photographic source without body-color tinting');
assert.ok(!/drawIcePhotoTexture\([^)]*bodyColor/.test(textures), '3D Ice photographic renderer must not accept bodyColor tinting');
assert.ok(textures.includes('applyTextureZoom(context, bump, size, textureScale)'), '3D Ice must use the shared textureScale pipeline');
assert.ok(textures.includes('`${appearance.skinId}:${appearance.bodyColor}:${textureScale}`'), '3D texture cache must include textureScale');
assert.ok(materials.includes('getDice3DTextureDescriptor(appearance)'), '3D Ice must use the photographic descriptor directly');
assert.ok(materials.includes('function preserveIceFaceTexture(material: MaterialLike)'), '3D Ice must explicitly preserve the photographic face colors');
assert.ok(materials.includes("if (skinId === 'ice' && !descriptor.custom) preserveIceFaceTexture(material);"), '3D Ice face materials must be neutralized after dice creation');
assert.ok(materials.includes('material.color?.set?.(0xffffff);'), 'Photographic face materials must use a neutral white multiplier');
assert.ok(materials.includes('material.emissiveMap = material.map;'), 'Ice photographic faces must resist the warm renderer lights');
assert.ok(materials.includes('factory.edge_color = appearance.bodyColor;'), 'The user body color must remain on the die edges');
assert.ok(customizer.includes('textureScale: selected.textureScale'), 'Apply to all must keep textureScale');
assert.ok(appearance.includes('textureScale: normalizeDiceTextureScale'), 'roll snapshots must normalize and preserve textureScale');
assert.ok(service.includes('texture_scale: normalizeDiceTextureScale(style.textureScale)'), 'Supabase persistence must preserve textureScale');
assert.ok(fire.includes('FIRE_TEXTURE_CHUNK_0'), 'Fire texture pipeline must remain intact');
console.log('Ice photographic texture, neutral 3D face colors, edge-color preservation, and shared 2D/3D zoom verification passed.');
