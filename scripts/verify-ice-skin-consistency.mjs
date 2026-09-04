import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const skins = fs.readFileSync(new URL('src/app/components/session/dice/diceSkins.ts', root), 'utf8');
const data = fs.readFileSync(new URL('src/app/components/session/dice/iceTextureData.ts', root), 'utf8');
const chunks = Array.from({ length: 6 }, (_, index) => fs.readFileSync(new URL(`src/app/components/session/dice/iceTextureChunk${index}.ts`, root), 'utf8'));
const textures = fs.readFileSync(new URL('src/app/components/session/dice/dice3dSkinTextures.ts', root), 'utf8');
const customizer = fs.readFileSync(new URL('src/app/components/session/dice/DiceAppearanceCustomizer.tsx', root), 'utf8');
const appearance = fs.readFileSync(new URL('src/app/components/session/dice/diceAppearance.ts', root), 'utf8');
const service = fs.readFileSync(new URL('src/services/supabase/diceStandardStyleService.ts', root), 'utf8');
const fire = fs.readFileSync(new URL('src/app/components/session/dice/fireTextureData.ts', root), 'utf8');

assert.ok(skins.includes('ICE_TEXTURE_DATA_URL'), '2D Ice must use the official photographic texture');
assert.ok(data.includes('data:image/webp;base64'), 'Ice texture must be embedded like Fire');
assert.ok(chunks.every((content, index) => content.includes(`ICE_TEXTURE_CHUNK_${index}`)), 'All Ice texture chunks must exist');
assert.ok(Array.from({ length: 6 }, (_, index) => data.includes(`ICE_TEXTURE_CHUNK_${index}`)).every(Boolean), 'Ice texture data must assemble every embedded chunk');

const encoded = chunks.map((content, index) => {
  const match = content.match(new RegExp(`ICE_TEXTURE_CHUNK_${index}\\s*=\\s*['\"]([^'\"]+)['\"]`));
  assert.ok(match, `Ice texture chunk ${index} must contain base64 payload`);
  return match[1];
}).join('');
const image = Buffer.from(encoded, 'base64');
assert.equal(image.length, 54_284, 'Ice texture must match the optimized user-provided photographic WebP payload');
assert.equal(image.subarray(0, 4).toString('ascii'), 'RIFF', 'Ice texture must be a RIFF image');
assert.equal(image.subarray(8, 12).toString('ascii'), 'WEBP', 'Ice texture must be a WebP image');
assert.equal(
  createHash('sha256').update(image).digest('hex'),
  'f85c9884c37ae4b0d526755353fe63117fab288f2788504724bf86faf7d5851c',
  'Ice texture must match the exact optimized image generated from the user-provided ice photograph',
);

assert.ok(textures.includes('const iceTextureImage = createTextureImage(ICE_TEXTURE_DATA_URL'), '3D Ice must load the same photographic texture');
assert.ok(textures.includes('drawIcePhotoTexture(context, bump, size, bodyColor)'), '3D Ice must render the photographic source');
assert.ok(textures.includes('applyTextureZoom(context, bump, size, textureScale)'), '3D Ice must use the shared textureScale pipeline');
assert.ok(textures.includes('`${appearance.skinId}:${appearance.bodyColor}:${textureScale}`'), '3D texture cache must include textureScale');
assert.ok(customizer.includes('textureScale: selected.textureScale'), 'Apply to all must keep textureScale');
assert.ok(appearance.includes('textureScale: normalizeDiceTextureScale'), 'roll snapshots must normalize and preserve textureScale');
assert.ok(service.includes('texture_scale: normalizeDiceTextureScale(style.textureScale)'), 'Supabase persistence must preserve textureScale');
assert.ok(fire.includes('FIRE_TEXTURE_CHUNK_0'), 'Fire texture pipeline must remain intact');
console.log('Ice photographic texture and shared 2D/3D zoom consistency verification passed.');
