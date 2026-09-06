import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const diceDir = new URL('src/app/components/session/dice/', root);
const dataUrl = new URL('obsidianTextureData.ts', diceDir);
const chunkUrls = Array.from({ length: 10 }, (_, index) => new URL(`obsidianTextureChunk${index}.ts`, diceDir));
const skins = fs.readFileSync(new URL('diceSkins.ts', diceDir), 'utf8');
const textures = fs.readFileSync(new URL('dice3dSkinTextures.ts', diceDir), 'utf8');
const materials = fs.readFileSync(new URL('dice3dAppearanceMaterials.ts', diceDir), 'utf8');
const profiles = fs.readFileSync(new URL('dice3dSurfaceProfiles.ts', diceDir), 'utf8');
const surface = fs.readFileSync(new URL('DiceSkinSurface.tsx', diceDir), 'utf8');
const icon = fs.readFileSync(new URL('StyledStandardDieIcon.tsx', diceDir), 'utf8');
const preview = fs.readFileSync(new URL('DiceSkinPreviewArt.tsx', diceDir), 'utf8');
const effects = fs.readFileSync(new URL('dice3dSkinEffects.ts', diceDir), 'utf8');
const ci = fs.readFileSync(new URL('.github/workflows/ci.yml', root), 'utf8');

assert.ok(fs.existsSync(dataUrl), 'Obsidian texture data module must exist');
for (const chunkUrl of chunkUrls) assert.ok(fs.existsSync(chunkUrl), `Obsidian texture chunk ${chunkUrl.pathname} must exist`);
const chunks = chunkUrls.map((chunkUrl, index) => {
  const source = fs.readFileSync(chunkUrl, 'utf8');
  const match = source.match(new RegExp(`export const OBSIDIAN_TEXTURE_CHUNK_${index} = '([^']*)';`));
  assert.ok(match, `Obsidian chunk ${index} must export its Base64 payload`);
  return match[1];
});
const asset = Buffer.from(chunks.join(''), 'base64');
assert.equal(asset.length, 49_304, 'Obsidian WebP payload byte size must stay stable');
assert.equal(crypto.createHash('sha256').update(asset).digest('hex'), 'daa3649ac76b2ad4f0b71a1f4d01ccc9f1142c13d7c9ede6448624d5290717a5', 'Obsidian WebP payload hash must stay stable');
assert.equal(asset.subarray(0, 4).toString('ascii'), 'RIFF', 'Obsidian payload must be a valid WebP RIFF container');
assert.equal(asset.subarray(8, 12).toString('ascii'), 'WEBP', 'Obsidian payload must be WebP');

const data = fs.readFileSync(dataUrl, 'utf8');
assert.ok(data.includes('export const OBSIDIAN_TEXTURE_SOURCE_DATA_URL = `data:image/webp;base64,${OBSIDIAN_TEXTURE_BASE64}`;'), 'Obsidian must expose a shared photographic data URL');
assert.ok(data.includes('export const OBSIDIAN_TEXTURE_DATA_URL = OBSIDIAN_TEXTURE_SOURCE_DATA_URL;'), 'Obsidian 2D and 3D must share the same source');
assert.ok(skins.includes("import { OBSIDIAN_TEXTURE_DATA_URL } from './obsidianTextureData.ts';") && skins.includes("case 'obsidian':\n      return `url(\"${OBSIDIAN_TEXTURE_DATA_URL}\")`;"), '2D Obsidian surface must use the photograph');
assert.ok(textures.includes("import { OBSIDIAN_TEXTURE_SOURCE_DATA_URL } from './obsidianTextureData.ts';") && textures.includes("createTextureImage(OBSIDIAN_TEXTURE_SOURCE_DATA_URL, 'obsidian')"), '3D Obsidian must preload the photographic source');
assert.ok(textures.includes("descriptor && !descriptor.custom && descriptor.appearance.skinId === 'obsidian'"), 'Obsidian must finish loading before a 3D roll');
assert.ok(textures.includes('isObsidianTextureReady()'), 'Obsidian cache must distinguish placeholder from ready texture');
assert.ok(textures.includes('drawObsidianPhotoTexture(context, bump, size)') && textures.includes("context.filter = 'brightness(1.12) saturate(.92) contrast(1.16)'"), 'Obsidian 3D faces must use the photographic treatment');
assert.ok(materials.includes('function preserveObsidianFaceTexture(material: MaterialLike)') && materials.includes('material.roughness = 0.18') && materials.includes('material.metalness = 0.08'), 'Obsidian face material must stay glossy without losing the photograph');
assert.ok(materials.includes("skinId === 'obsidian'"), 'Obsidian must receive photographic label/material handling');
assert.ok(profiles.includes("obsidian: 'photo-lit'"), 'Obsidian must keep scene-lit photographic glass depth');
assert.ok(surface.includes("appearance.skinId === 'obsidian'"), 'Obsidian must be treated as photographic in 2D surfaces');
assert.ok(icon.includes("skinId === 'obsidian'"), 'Obsidian must preserve exact selected symbol color in standard die icons');
assert.ok(preview.includes("case 'obsidian':\n      return null;"), 'Procedural Obsidian preview art must not cover the photograph');
assert.ok(surface.includes('DiceObsidianAnimatedOverlay') && icon.includes('DiceObsidianAnimatedOverlay'), 'Obsidian animated overlay must be wired into both 2D surfaces');
assert.ok(fs.existsSync(new URL('DiceObsidianAnimatedOverlay.tsx', diceDir)) && fs.existsSync(new URL('diceObsidianAnimation.css', diceDir)), 'Obsidian must ship a dedicated 2D animated overlay');
assert.ok(effects.includes("case 'obsidian':") && effects.includes("particleColor: '#c7b6ff'"), 'Obsidian must keep dedicated 3D shard/glint particles');
assert.ok(ci.includes('node scripts/verify-obsidian-skin-consistency.mjs'), 'CI must run the Obsidian photographic regression test');

console.log('Obsidian photographic 2D/3D texture, readiness cache, glossy material, readable labels and animated effects verification passed.');
