import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const assetUrl = new URL('public/dice/obsidian.webp', root);
const skins = fs.readFileSync(new URL('src/app/components/session/dice/diceSkins.ts', root), 'utf8');
const textures = fs.readFileSync(new URL('src/app/components/session/dice/dice3dSkinTextures.ts', root), 'utf8');
const materials = fs.readFileSync(new URL('src/app/components/session/dice/dice3dAppearanceMaterials.ts', root), 'utf8');
const surface = fs.readFileSync(new URL('src/app/components/session/dice/DiceSkinSurface.tsx', root), 'utf8');
const preview = fs.readFileSync(new URL('src/app/components/session/dice/DiceSkinPreviewArt.tsx', root), 'utf8');

assert.ok(fs.existsSync(assetUrl), 'Obsidian photographic WebP asset must exist');
const asset = fs.readFileSync(assetUrl);
assert.equal(asset.length, 68150, 'Obsidian WebP asset byte size must stay stable');
assert.equal(crypto.createHash('sha256').update(asset).digest('hex'), '586dc8895042738e7488c0b1faf896fdb9bd51cf7774c8f09f11f6bc34a4591a', 'Obsidian WebP asset hash must stay stable');
assert.equal(asset.subarray(0, 4).toString('ascii'), 'RIFF', 'Obsidian asset must be a valid WebP RIFF container');
assert.equal(asset.subarray(8, 12).toString('ascii'), 'WEBP', 'Obsidian asset must be WebP');

assert.ok(skins.includes("export const OBSIDIAN_TEXTURE_SOURCE_URL = '/dice/obsidian.webp'"), 'Obsidian source URL must be centralized');
assert.ok(skins.includes('url("${OBSIDIAN_TEXTURE_SOURCE_URL}")'), '2D Obsidian surface must use the photographic texture');
assert.ok(textures.includes("createTextureImage(OBSIDIAN_TEXTURE_SOURCE_URL, 'obsidian')"), '3D Obsidian texture must load the photographic source directly');
assert.ok(textures.includes("appearance.skinId === 'obsidian'"), '3D readiness wait must include Obsidian');
assert.ok(textures.includes('isObsidianTextureReady()'), 'Obsidian cache must distinguish placeholder from ready texture');
assert.ok(textures.includes('drawObsidianPhotoTexture'), 'Obsidian 3D faces must use a dedicated photographic drawing path');
assert.ok(textures.includes("brightness(1.12) saturate(.92) contrast(1.16)"), 'Obsidian photo treatment must preserve dark glass contrast without crushing detail');
assert.ok(materials.includes('preserveObsidianFaceTexture'), 'Obsidian face material must preserve the photographic map');
assert.ok(materials.includes("skinId === 'obsidian'"), 'Obsidian must receive photographic label/material handling');
assert.ok(surface.includes("appearance.skinId === 'obsidian'"), 'Obsidian must be treated as photographic in 2D surfaces');
assert.ok(preview.includes("case 'obsidian':\n      return null;"), 'Procedural Obsidian preview art must not cover the photograph');

console.log('Obsidian photographic 2D/3D texture, readiness cache, glass material and readable labels verification passed.');
