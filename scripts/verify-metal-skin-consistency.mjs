import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const dataUrl = new URL('src/app/components/session/dice/metalTextureData.ts', root);
const imageUrl = new URL('src/app/components/session/dice/metalTexture.png', root);
const readText = (url) => fs.readFileSync(url, 'utf8').replace(/\r\n/g, '\n');

assert.ok(fs.existsSync(dataUrl), 'Metal texture data module must exist');
assert.ok(fs.existsSync(imageUrl), 'Metal photographic PNG asset must exist');

const data = readText(dataUrl);
const image = fs.readFileSync(imageUrl);
const skins = readText(new URL('src/app/components/session/dice/diceSkins.ts', root));
const preview = readText(new URL('src/app/components/session/dice/DiceSkinPreviewArt.tsx', root));
const icon = readText(new URL('src/app/components/session/dice/StyledStandardDieIcon.tsx', root));
const textures = readText(new URL('src/app/components/session/dice/dice3dSkinTextures.ts', root));
const materials = readText(new URL('src/app/components/session/dice/dice3dAppearanceMaterials.ts', root));
const profiles = readText(new URL('src/app/components/session/dice/dice3dSurfaceProfiles.ts', root));
const ci = readText(new URL('.github/workflows/ci.yml', root));

assert.ok(data.includes("new URL('./metalTexture.png', import.meta.url).href"), 'Metal must expose the replacement PNG asset URL');
assert.ok(data.includes('export const METAL_TEXTURE_DATA_URL = METAL_TEXTURE_SOURCE_DATA_URL;'), 'Metal 2D and 3D must share the same photographic source');
assert.equal(image.length, 381_022, 'Metal texture must keep the approved replacement PNG payload');
assert.deepEqual([...image.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], 'Metal texture must be a PNG image');
assert.equal(createHash('sha256').update(image).digest('hex'), 'd6bb26778b76bf7511629e200d8ebadc148a1fc0e812b800714dd1cf4f00a4ea', 'Metal texture must match the approved replacement photograph');

assert.ok(skins.includes("import { METAL_TEXTURE_DATA_URL } from './metalTextureData.ts';") && skins.includes("case 'metal':\n      return `url(\"${METAL_TEXTURE_DATA_URL}\")`;"), '2D Metal must use the photograph');
assert.ok(preview.includes("case 'metal':\n      return null;"), 'Procedural Metal preview must not cover the photograph');
assert.ok(icon.includes("skinId === 'metal'"), '2D Metal must preserve the exact selected symbol color');
assert.ok(textures.includes("import { METAL_TEXTURE_SOURCE_DATA_URL } from './metalTextureData.ts';") && textures.includes("createTextureImage(METAL_TEXTURE_SOURCE_DATA_URL, 'metal')"), '3D Metal must preload the photograph');
assert.ok(textures.includes('drawMetalPhotoTexture(context, bump, size)') && textures.includes("bump.filter = 'grayscale(1) contrast(1.25) brightness(.98)'"), 'Metal 3D must use the clean photograph with a restrained bump map');
assert.ok(textures.includes("appearance.skinId === 'metal'") && textures.includes("isMetalTextureReady() ? 'ready' : 'placeholder'"), 'Metal must use readiness-aware caching');
assert.ok(textures.includes("descriptor && descriptor.appearance.skinId === 'metal'"), 'Metal must finish loading before a 3D roll');
assert.ok(profiles.includes("metal: 'photo-unlit'"), 'Metal faces must keep stable photographic color independently of scene lighting');
assert.ok(materials.includes('function prepareMetalFaceTexture(material: MaterialLike)') && materials.includes('material.map.anisotropy'), 'Metal faces must retain sharp photographic maps before unlit conversion');
assert.ok(materials.includes("skinId === 'metal'"), 'Metal must preserve the exact selected 3D symbol color');
assert.ok(materials.includes("skinId !== 'metal'"), 'Metal must inherit the strong photographic number outline');
assert.ok(ci.includes('node scripts/verify-metal-skin-consistency.mjs'), 'CI must run the Metal photographic regression test');

console.log('Replacement Metal texture, stable 2D/3D integration, readiness cache and exact labels verification passed.');
