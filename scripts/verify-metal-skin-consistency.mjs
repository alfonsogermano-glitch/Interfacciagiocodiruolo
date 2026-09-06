import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const dataUrl = new URL('src/app/components/session/dice/metalTextureData.ts', root);
const chunkUrls = Array.from({ length: 11 }, (_, index) => new URL(`src/app/components/session/dice/metalTextureChunk${index}.ts`, root));

assert.ok(fs.existsSync(dataUrl), 'Metal texture data module must exist');
assert.ok(chunkUrls.every((url) => fs.existsSync(url)), 'All Metal texture chunks must exist');

const data = fs.readFileSync(dataUrl, 'utf8');
const chunks = chunkUrls.map((url) => fs.readFileSync(url, 'utf8'));
const skins = fs.readFileSync(new URL('src/app/components/session/dice/diceSkins.ts', root), 'utf8');
const preview = fs.readFileSync(new URL('src/app/components/session/dice/DiceSkinPreviewArt.tsx', root), 'utf8');
const textures = fs.readFileSync(new URL('src/app/components/session/dice/dice3dSkinTextures.ts', root), 'utf8');
const materials = fs.readFileSync(new URL('src/app/components/session/dice/dice3dAppearanceMaterials.ts', root), 'utf8');
const profiles = fs.readFileSync(new URL('src/app/components/session/dice/dice3dSurfaceProfiles.ts', root), 'utf8');
const ci = fs.readFileSync(new URL('.github/workflows/ci.yml', root), 'utf8');

assert.ok(data.includes('export const METAL_TEXTURE_SOURCE_DATA_URL = `data:image/webp;base64,'), 'Metal must expose the optimized WebP source');
assert.ok(data.includes('export const METAL_TEXTURE_DATA_URL = METAL_TEXTURE_SOURCE_DATA_URL;'), 'Metal 2D and 3D must share the same source');

const expectedChunkHashes = [
  '5cb8a6e7f439e0ccfc9157f5f5c811b218ca899f05035135f8c0e91a3ee0ea6e',
  '1617bf7e79cb9777f92a500c7f025874d5f1ede9bf21f505b13feead534141c3',
  'cd59319f1da7610c0ba13ea9e0630b48ad1d517bd274e024594a61e3cb185a95',
  '8852b5a26ccb27afea9978d586aa89b92cd04a581a8741b97cb6d8e9309b0c10',
  '1fc4455d175e163202d623208423f913e292399c0b0f24b4f4ad0f874f25a98f',
  '8c9495da7f48c23aacfb29da729a8308457608165d8d5e5f4c3a2a6e6f651c75',
  'aeb20027e5db9950787aa4b3f87718297810d3bd773bff270eb10fb19d91f3a1',
  'ecd518bf14d6d408fc7fe76e51dc70c4d74fdc2b95cfe854722f42759ec8fcb7',
  '51897b02cc76bfb889ad0784e3b76cbdd927172d7b46161a167696948c640216',
  '2b5f4ad8e1839fd0cc8e1c34a8656a62b3f67fe3d64f8f767b3a68ab6fe02979',
  'b740c027e0ae96349e0c6c8e9df8307712c0e1c831d1f4f91417589a8e42d7f5',
];
const encodedChunks = chunks.map((content, index) => {
  const match = content.match(new RegExp(`METAL_TEXTURE_CHUNK_${index}\\s*=\\s*['\"]([^'\"]+)['\"]`));
  assert.ok(match, `Metal texture chunk ${index} must contain base64 payload`);
  assert.equal(createHash('sha256').update(match[1]).digest('hex'), expectedChunkHashes[index], `Metal texture chunk ${index} must match the approved asset`);
  return match[1];
});
const image = Buffer.from(encodedChunks.join(''), 'base64');
assert.equal(image.length, 63_570, 'Metal texture must match the optimized 448px production WebP payload');
assert.equal(image.subarray(0, 4).toString('ascii'), 'RIFF', 'Metal texture must be a RIFF image');
assert.equal(image.subarray(8, 12).toString('ascii'), 'WEBP', 'Metal texture must be a WebP image');
assert.equal(createHash('sha256').update(image).digest('hex'), '2c42047a84c08b25f460739e0d151f403a46f5c71858734f84071ffda4f2a4ca', 'Metal texture must match the approved metal photograph');

assert.ok(skins.includes("import { METAL_TEXTURE_DATA_URL } from './metalTextureData.ts';") && skins.includes("case 'metal':\n      return `url(\"${METAL_TEXTURE_DATA_URL}\")`;"), '2D Metal must use the photograph');
assert.ok(preview.includes("case 'metal':\n      return null;"), 'Procedural Metal preview must not cover the photograph');
assert.ok(textures.includes("import { METAL_TEXTURE_SOURCE_DATA_URL } from './metalTextureData.ts';") && textures.includes("createTextureImage(METAL_TEXTURE_SOURCE_DATA_URL, 'metal')"), '3D Metal must preload the photograph');
assert.ok(textures.includes('drawMetalPhotoTexture(context, bump, size)') && textures.includes("context.filter = 'brightness(1.10) saturate(.92) contrast(1.12)'"), 'Metal 3D must use restrained photographic polish');
assert.ok(textures.includes("appearance.skinId === 'metal' ? (isMetalTextureReady() ? 'ready' : 'placeholder')"), 'Metal must use readiness-aware caching');
assert.ok(profiles.includes("metal: 'photo-lit'"), 'Metal must keep scene-lit photographic depth');
assert.ok(materials.includes('function preserveMetalFaceTexture(material: MaterialLike)') && materials.includes('material.roughness = 0.46') && materials.includes('material.metalness = 0.58'), 'Metal faces must remain physically metallic without losing the photo');
assert.ok(materials.includes("skinId === 'fire' || skinId === 'stone' || skinId === 'metal' || getDice3DSurfaceProfile(skinId) === 'photo-unlit'"), 'Metal must preserve the exact selected symbol color');
assert.ok(ci.includes('node scripts/verify-metal-skin-consistency.mjs'), 'CI must run the Metal photographic regression test');

console.log('Metal photographic texture, 2D/3D integration, readiness cache, metallic material and exact labels verification passed.');
