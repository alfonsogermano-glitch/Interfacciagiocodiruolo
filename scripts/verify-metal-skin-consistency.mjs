import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const dataUrl = new URL('src/app/components/session/dice/metalTextureData.ts', root);
const imageUrl = new URL('src/app/components/session/dice/metalTexture.webp', root);

assert.ok(fs.existsSync(dataUrl), 'Metal texture data module must exist');
assert.ok(fs.existsSync(imageUrl), 'Metal photographic WebP asset must exist');

const data = fs.readFileSync(dataUrl, 'utf8');
const image = fs.readFileSync(imageUrl);
const skins = fs.readFileSync(new URL('src/app/components/session/dice/diceSkins.ts', root), 'utf8');
const preview = fs.readFileSync(new URL('src/app/components/session/dice/DiceSkinPreviewArt.tsx', root), 'utf8');
const icon = fs.readFileSync(new URL('src/app/components/session/dice/StyledStandardDieIcon.tsx', root), 'utf8');
const textures = fs.readFileSync(new URL('src/app/components/session/dice/dice3dSkinTextures.ts', root), 'utf8');
const materials = fs.readFileSync(new URL('src/app/components/session/dice/dice3dAppearanceMaterials.ts', root), 'utf8');
const profiles = fs.readFileSync(new URL('src/app/components/session/dice/dice3dSurfaceProfiles.ts', root), 'utf8');
const ci = fs.readFileSync(new URL('.github/workflows/ci.yml', root), 'utf8');

assert.ok(data.includes("new URL('./metalTexture.webp', import.meta.url).href"), 'Metal must expose the optimized WebP asset URL');
assert.ok(data.includes('export const METAL_TEXTURE_DATA_URL = METAL_TEXTURE_SOURCE_DATA_URL;'), 'Metal 2D and 3D must share the same photographic source');
assert.equal(image.length, 11_502, 'Metal texture must keep the approved optimized production WebP payload');
assert.equal(image.subarray(0, 4).toString('ascii'), 'RIFF', 'Metal texture must be a RIFF image');
assert.equal(image.subarray(8, 12).toString('ascii'), 'WEBP', 'Metal texture must be a WebP image');
assert.equal(createHash('sha256').update(image).digest('hex'), '7e78f88465aaadbffd44f350aa2b30a031bd9748fe3339aed5a39500b98fb70a', 'Metal texture must match the shipped approved photograph');

assert.ok(skins.includes("import { METAL_TEXTURE_DATA_URL } from './metalTextureData.ts';") && skins.includes("case 'metal':\n      return `url(\"${METAL_TEXTURE_DATA_URL}\")`;"), '2D Metal must use the photograph');
assert.ok(preview.includes("case 'metal':\n      return null;"), 'Procedural Metal preview must not cover the photograph');
assert.ok(icon.includes("skinId === 'metal'"), '2D Metal must preserve the exact selected symbol color');
assert.ok(textures.includes("import { METAL_TEXTURE_SOURCE_DATA_URL } from './metalTextureData.ts';") && textures.includes("createTextureImage(METAL_TEXTURE_SOURCE_DATA_URL, 'metal')"), '3D Metal must preload the photograph');
assert.ok(textures.includes('drawMetalPhotoTexture(context, bump, size)') && textures.includes("context.filter = 'brightness(1.10) saturate(.92) contrast(1.12)'"), 'Metal 3D must use restrained photographic polish');
assert.ok(textures.includes("appearance.skinId === 'metal'") && textures.includes("isMetalTextureReady() ? 'ready' : 'placeholder'"), 'Metal must use readiness-aware caching');
assert.ok(textures.includes("descriptor && !descriptor.custom && descriptor.appearance.skinId === 'metal'"), 'Metal must finish loading before a 3D roll');
assert.ok(profiles.includes("metal: 'photo-lit'"), 'Metal must keep scene-lit photographic depth');
assert.ok(materials.includes('function preserveMetalFaceTexture(material: MaterialLike)') && materials.includes('material.roughness = 0.46') && materials.includes('material.metalness = 0.58'), 'Metal faces must remain physically metallic without losing the photograph');
assert.ok(materials.includes("skinId === 'metal'"), 'Metal must preserve the exact selected 3D symbol color');
assert.ok(materials.includes("skinId !== 'metal'"), 'Metal must inherit the strong photographic number outline');
assert.ok(ci.includes('node scripts/verify-metal-skin-consistency.mjs'), 'CI must run the Metal photographic regression test');

console.log('Metal photographic texture, 2D/3D integration, readiness cache, metallic material and exact labels verification passed.');
