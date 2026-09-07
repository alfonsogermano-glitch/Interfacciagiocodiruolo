import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const diceDir = new URL('src/app/components/session/dice/', root);
const dataUrl = new URL('arcaneTextureData.ts', diceDir);
const chunkUrls = Array.from({ length: 6 }, (_, index) => new URL(`arcaneTextureChunk${index}.ts`, diceDir));
const skins = fs.readFileSync(new URL('diceSkins.ts', diceDir), 'utf8');
const textures = fs.readFileSync(new URL('dice3dSkinTextures.ts', diceDir), 'utf8');
const profiles = fs.readFileSync(new URL('dice3dSurfaceProfiles.ts', diceDir), 'utf8');
const surface = fs.readFileSync(new URL('DiceSkinSurface.tsx', diceDir), 'utf8');
const icon = fs.readFileSync(new URL('StyledStandardDieIcon.tsx', diceDir), 'utf8');
const preview = fs.readFileSync(new URL('DiceSkinPreviewArt.tsx', diceDir), 'utf8');
const effects = fs.readFileSync(new URL('dice3dSkinEffects.ts', diceDir), 'utf8');
const ci = fs.readFileSync(new URL('.github/workflows/ci.yml', root), 'utf8');

assert.ok(fs.existsSync(dataUrl), 'Arcane texture data module must exist');
for (const chunkUrl of chunkUrls) assert.ok(fs.existsSync(chunkUrl), `Arcane texture chunk ${chunkUrl.pathname} must exist`);
const chunks = chunkUrls.map((chunkUrl, index) => {
  const source = fs.readFileSync(chunkUrl, 'utf8');
  const match = source.match(new RegExp(`export const ARCANE_TEXTURE_CHUNK_${index} = '([^']*)';`));
  assert.ok(match, `Arcane chunk ${index} must export its Base64 payload`);
  return match[1];
});
const asset = Buffer.from(chunks.join(''), 'base64');
assert.equal(asset.length, 27_950, 'Arcane WebP payload byte size must stay stable');
assert.equal(crypto.createHash('sha256').update(asset).digest('hex'), '7b0caacb11ec217bf58e1dc5bf9c8212d2dd66fdae3037a2c830010dc224a2cb', 'Arcane WebP payload hash must stay stable');
assert.equal(asset.subarray(0, 4).toString('ascii'), 'RIFF', 'Arcane payload must be a valid WebP RIFF container');
assert.equal(asset.subarray(8, 12).toString('ascii'), 'WEBP', 'Arcane payload must be WebP');

const data = fs.readFileSync(dataUrl, 'utf8');
assert.ok(data.includes('export const ARCANE_TEXTURE_SOURCE_DATA_URL = `data:image/webp;base64,${ARCANE_TEXTURE_BASE64}`;'), 'Arcane must expose a shared photographic data URL');
assert.ok(data.includes('export const ARCANE_TEXTURE_DATA_URL = ARCANE_TEXTURE_SOURCE_DATA_URL;'), 'Arcane 2D and 3D must share the same source');
assert.ok(skins.includes("import { ARCANE_TEXTURE_DATA_URL } from './arcaneTextureData.ts';") && skins.includes("case 'arcane':\n      return `url(\"${ARCANE_TEXTURE_DATA_URL}\")`;"), '2D Arcane surface must use the photograph');
assert.ok(textures.includes("import { ARCANE_TEXTURE_SOURCE_DATA_URL } from './arcaneTextureData.ts';") && textures.includes("createTextureImage(ARCANE_TEXTURE_SOURCE_DATA_URL, 'arcane')"), '3D Arcane must preload the photographic source');
assert.ok(textures.includes("descriptor && !descriptor.custom && descriptor.appearance.skinId === 'arcane'"), 'Arcane must finish loading before a 3D roll');
assert.ok(textures.includes('isArcaneTextureReady()'), 'Arcane cache must distinguish placeholder from ready texture');
assert.ok(textures.includes('drawArcanePhotoTexture(context, bump, size)') && textures.includes("context.filter = 'brightness(1.16) saturate(1.20) contrast(1.10)'"), 'Arcane 3D faces must use the vivid photographic treatment');
assert.ok(profiles.includes("arcane: 'photo-unlit'"), 'Arcane must preserve luminous photographic color without scene-light dimming');
assert.ok(surface.includes("appearance.skinId === 'arcane'"), 'Arcane must be treated as photographic in 2D surfaces');
assert.ok(icon.includes("skinId === 'arcane'"), 'Arcane must preserve the exact user-selected symbol color');
assert.ok(preview.includes("case 'arcane':\n      return null;"), 'Procedural Arcane preview art must not cover the photograph');
assert.ok(surface.includes('DiceArcaneAnimatedOverlay') && icon.includes('DiceArcaneAnimatedOverlay'), 'Arcane animated overlay must be wired into both 2D surfaces');
assert.ok(fs.existsSync(new URL('DiceArcaneAnimatedOverlay.tsx', diceDir)) && fs.existsSync(new URL('diceArcaneAnimation.css', diceDir)), 'Arcane must ship a dedicated 2D animated overlay');
assert.ok(effects.includes("case 'arcane':") && effects.includes("particleColor: '#f1b6ff'"), 'Arcane must use dedicated magenta-violet particles');
assert.ok(effects.includes('function addArcaneSigils(') && effects.includes("case 'arcane':\n      addArcaneSigils(group, updaters, radius);"), 'Arcane must add dedicated orbiting sigils in 3D');
assert.ok(ci.includes('node scripts/verify-arcane-skin-consistency.mjs'), 'CI must run the Arcane photographic regression test');

console.log('Arcane photographic 2D/3D texture, exact labels, vivid unlit faces and magical effects verification passed.');
