import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const dataUrl = new URL('src/app/components/session/dice/stoneTextureData.ts', root);
const overlayUrl = new URL('src/app/components/session/dice/DiceStoneAnimatedOverlay.tsx', root);
const cssUrl = new URL('src/app/components/session/dice/diceStoneAnimation.css', root);
const chunkUrls = Array.from({ length: 13 }, (_, index) => new URL(`src/app/components/session/dice/stoneTextureChunk${index}.ts`, root));

assert.ok(fs.existsSync(dataUrl), 'Stone texture data module must exist');
assert.ok(chunkUrls.every((url) => fs.existsSync(url)), 'All Stone texture chunks must exist');
assert.ok(fs.existsSync(overlayUrl), 'Stone must have a dedicated 2D animated overlay');
assert.ok(fs.existsSync(cssUrl), 'Stone must have dedicated 2D animation styles');

const data = fs.readFileSync(dataUrl, 'utf8');
const chunks = chunkUrls.map((url) => fs.readFileSync(url, 'utf8'));
const skins = fs.readFileSync(new URL('src/app/components/session/dice/diceSkins.ts', root), 'utf8');
const surface = fs.readFileSync(new URL('src/app/components/session/dice/DiceSkinSurface.tsx', root), 'utf8');
const icon = fs.readFileSync(new URL('src/app/components/session/dice/StyledStandardDieIcon.tsx', root), 'utf8');
const preview = fs.readFileSync(new URL('src/app/components/session/dice/DiceSkinPreviewArt.tsx', root), 'utf8');
const overlay = fs.readFileSync(overlayUrl, 'utf8');
const css = fs.readFileSync(cssUrl, 'utf8');
const textures = fs.readFileSync(new URL('src/app/components/session/dice/dice3dSkinTextures.ts', root), 'utf8');
const materials = fs.readFileSync(new URL('src/app/components/session/dice/dice3dAppearanceMaterials.ts', root), 'utf8');
const profiles = fs.readFileSync(new URL('src/app/components/session/dice/dice3dSurfaceProfiles.ts', root), 'utf8');
const profileTest = fs.readFileSync(new URL('scripts/verify-dice-surface-profiles.mts', root), 'utf8');
const effects = fs.readFileSync(new URL('src/app/components/session/dice/dice3dSkinEffects.ts', root), 'utf8');
const boost = fs.readFileSync(new URL('src/app/components/session/dice/dice3dVisualBoost.ts', root), 'utf8');
const renderer = fs.readFileSync(new URL('src/app/components/session/dice/dice3dRenderer.ts', root), 'utf8');
const ci = fs.readFileSync(new URL('.github/workflows/ci.yml', root), 'utf8');

assert.ok(data.includes('export const STONE_TEXTURE_SOURCE_DATA_URL = `data:image/webp;base64,'), 'Stone must expose the optimized WebP source for direct 3D loading');
assert.ok(data.includes('export const STONE_TEXTURE_DATA_URL = STONE_TEXTURE_SOURCE_DATA_URL;'), 'Stone 2D and 3D must share the same photographic source');
assert.ok(chunks.every((content, index) => content.includes(`STONE_TEXTURE_CHUNK_${index}`)), 'Every Stone texture chunk must export its indexed payload');
assert.ok(Array.from({ length: 13 }, (_, index) => data.includes(`STONE_TEXTURE_CHUNK_${index}`)).every(Boolean), 'Stone texture data must assemble every embedded chunk');

const expectedChunkHashes = [
  '18c13d479dd157bb61d4b510f8cd3e3e149458ac7bf8d85bbb31f5becb2aa391',
  '96551c89c37fa247c02842d552438865dc374856cbb0dc94ab27b92a5da6f99a',
  '1fed300b31b754559021232d2997b803a86312782c2aee4f42a76b4f9f6952a8',
  '9b3e059ff4d2acbdd88eb4593773fe8f6a6c41df1e35e2723ca7f8e82697fc0a',
  '038a49c500b2b862be823a4a154e66a47be17bd1129a04788607f0ce7a638b37',
  '771cb92ec07fc5c785b754844704b4cba002045e28a485f9175eeef59fe1f2c2',
  '3bfb21fbf7e175f6ca77be56ab4f18e083ce40d3ba4bdc7caa9cf8ac0c8370b8',
  'd0e9cd22e2e69232cd1b9ea3f02d3af19cab3da687a55cfc63d087f42118cd32',
  '7c26606e486ee182c1ce532392934304a8dd35f2bc93aad1851f0dbcbfaecee5',
  'ca9258b85949ab55ff26f0b7f76c3b6a1e99e73cf0e12bcd343fdf22437652c9',
  '0440e49ef86d83ab36b64f5dc5d4d0281b30cf6afaab1f6cc3ea268079d360cc',
  '8ca2af5b1a358bd743328fdbccce425d0ef8eb26be66840d54c50d845535ed43',
  'b84203a5ee076bc8b50b971c965587fc372847bf85be275cf885f8b990971b6b',
];
const encodedChunks = chunks.map((content, index) => {
  const match = content.match(new RegExp(`STONE_TEXTURE_CHUNK_${index}\\s*=\\s*['\"]([^'\"]+)['\"]`));
  assert.ok(match, `Stone texture chunk ${index} must contain base64 payload`);
  assert.equal(createHash('sha256').update(match[1]).digest('hex'), expectedChunkHashes[index], `Stone texture chunk ${index} must reconstruct the approved asset`);
  return match[1];
});
const image = Buffer.from(encodedChunks.join(''), 'base64');
assert.equal(image.length, 72_604, 'Stone texture must match the optimized 448px production WebP payload');
assert.equal(image.subarray(0, 4).toString('ascii'), 'RIFF', 'Stone texture must be a RIFF image');
assert.equal(image.subarray(8, 12).toString('ascii'), 'WEBP', 'Stone texture must be a WebP image');
assert.equal(createHash('sha256').update(image).digest('hex'), 'e401fc57ced44978891ae37a9bd7b91b325dec02fb2d28e1173ccc2da8356455', 'Stone texture must match the approved rock photograph');

assert.ok(skins.includes("import { STONE_TEXTURE_DATA_URL } from './stoneTextureData.ts';") && skins.includes("case 'stone':\n      return `url(\"${STONE_TEXTURE_DATA_URL}\")`;"), '2D Stone must use the photograph');
assert.ok(surface.includes("appearance.skinId === 'stone'") && surface.includes('const animatedStone = isAnimatedStoneAppearance(appearance);') && surface.includes('<DiceStoneAnimatedOverlay appearance={appearance} />'), 'Stone surface must use photographic handling and animation');
assert.ok(icon.includes('<DiceStoneAnimatedOverlay appearance={appearance} />'), 'Standard die icons must render Stone animation');
assert.ok(preview.includes("case 'stone':\n      return null;"), 'Procedural Stone preview must not cover the photograph');
assert.ok(overlay.includes("appearance.skinId === 'stone' && appearance.effectsEnabled") && overlay.includes('STONE_TEXTURE_DATA_URL') && overlay.includes('getDiceTextureBackgroundSize(appearance.textureScale)'), 'Stone overlay must be gated and share texture scaling');
assert.ok(css.includes('@keyframes hollowgate-stone-dust-drift') && css.includes('@media (prefers-reduced-motion: reduce)'), 'Stone dust animation must respect reduced motion');

assert.ok(textures.includes("import { STONE_TEXTURE_SOURCE_DATA_URL } from './stoneTextureData.ts';") && textures.includes("createTextureImage(STONE_TEXTURE_SOURCE_DATA_URL, 'stone')"), '3D Stone must preload the photograph');
assert.ok(textures.includes('drawStonePhotoTexture(context, bump, size)') && textures.includes("context.filter = 'brightness(1.12) saturate(.96) contrast(1.10)'") && textures.includes("bump.filter = 'grayscale(1) contrast(2.10) brightness(.90)'"), 'Stone 3D must use restrained photographic polish and bump');
assert.ok(textures.includes("descriptor.appearance.skinId === 'stone'") && textures.includes("appearance.skinId === 'stone'") && textures.includes("isStoneTextureReady() ? 'ready' : 'placeholder'"), 'Stone must use readiness-aware caching');
const waitIndex = renderer.indexOf('await waitForDice3DTextureAssets(appearanceQueue);');
assert.ok(waitIndex >= 0 && renderer.indexOf('installDiceAppearanceAdapter(this.box, appearanceQueue)') > waitIndex && renderer.indexOf('await this.box.roll(notation);') > waitIndex, 'Stone must load before die creation and roll');
assert.ok(profiles.includes("stone: 'photo-lit'"), 'Stone must keep scene-lit photographic depth');
assert.ok(materials.includes('function preserveStoneFaceTexture(material: MaterialLike)') && materials.includes('material.roughness = 0.9') && materials.includes('material.metalness = 0'), 'Stone faces must be matte and non-metallic');
assert.ok(materials.includes("skinId === 'fire' || skinId === 'stone'") && materials.includes("getDice3DSurfaceProfile(skinId) === 'photo-unlit'"), 'Stone must preserve the exact selected symbol color and use the shared intelligent outline');
assert.ok(materials.includes("case 'stone': applyRoughness(0.96); applyMetalness(0); applyShininess(4); break;"), 'Stone edges must stay extremely rough and non-metallic');
assert.ok(effects.includes("case 'stone':") && effects.includes('particleCount: 14') && effects.includes('orbitSpeed: 0.85') && effects.includes('addStoneFragments(group, updaters, radius);'), 'Stone must retain earthy dust and fragment effects while remaining visibly animated');
assert.ok(effects.includes('for (let index = 0; index < 8; index += 1)'), 'Stone must use eight visible orbiting fragments');
assert.ok(boost.includes("case 'stone': return '#d8c7a8';"), 'Stone must have a subtle warm mineral moving light');
assert.ok(profileTest.includes("getDice3DSurfaceProfile('stone'), 'photo-lit'"), 'Surface-profile verification must cover Stone');
assert.ok(ci.includes('node scripts/verify-stone-skin-consistency.mjs'), 'CI must run the Stone photographic regression test');

console.log('Stone photographic texture, 2D/3D integration, matte material, readiness cache, exact labels and mineral effects verification passed.');
