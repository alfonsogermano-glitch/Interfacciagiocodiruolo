import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const dataUrl = new URL('src/app/components/session/dice/stoneTextureData.ts', root);
const overlayUrl = new URL('src/app/components/session/dice/DiceStoneAnimatedOverlay.tsx', root);
const cssUrl = new URL('src/app/components/session/dice/diceStoneAnimation.css', root);
const chunkUrls = Array.from({ length: 4 }, (_, index) => new URL(`src/app/components/session/dice/stoneTextureChunk${index}.ts`, root));

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
assert.ok(Array.from({ length: 4 }, (_, index) => data.includes(`STONE_TEXTURE_CHUNK_${index}`)).every(Boolean), 'Stone texture data must assemble every embedded chunk');

const expectedChunkHashes = [
  'd90b8a82c5635109d430c1cc78e28642a6ba899d6e012bffa2ed6b3fea72cbbb',
  '3c764f9069e8169219117ea3d60d8a5409ba4e8ccc27d734a1fcfa8ebf124842',
  '8b9922dc2d5110e5b2719b85b3674660339ec78aba38c5735c2f3eb29c08896e',
  'e86cc0041f59e2effa2b804fe795faa003eafd87e440ffb528dba94936bbe9cf',
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
assert.ok(textures.includes("descriptor.appearance.skinId === 'stone'") && textures.includes("appearance.skinId === 'stone' ? (isStoneTextureReady() ? 'ready' : 'placeholder')"), 'Stone must use readiness-aware caching');
const waitIndex = renderer.indexOf('await waitForDice3DTextureAssets(appearanceQueue);');
assert.ok(waitIndex >= 0 && renderer.indexOf('installDiceAppearanceAdapter(this.box, appearanceQueue)') > waitIndex && renderer.indexOf('await this.box.roll(notation);') > waitIndex, 'Stone must load before die creation and roll');
assert.ok(profiles.includes("stone: 'photo-lit'"), 'Stone must keep scene-lit photographic depth');
assert.ok(materials.includes('function preserveStoneFaceTexture(material: MaterialLike)') && materials.includes('material.roughness = 0.9') && materials.includes('material.metalness = 0'), 'Stone faces must be matte and non-metallic');
assert.ok(materials.includes("skinId === 'fire' || skinId === 'stone' || getDice3DSurfaceProfile(skinId) === 'photo-unlit'"), 'Stone must preserve the exact selected symbol color and use the shared intelligent outline');
assert.ok(materials.includes("case 'stone': applyRoughness(0.96); applyMetalness(0); applyShininess(4); break;"), 'Stone edges must stay extremely rough and non-metallic');
assert.ok(effects.includes('particleCount: 12') && effects.includes('orbitSpeed: 0.72') && effects.includes('addStoneFragments(group, updaters, radius);'), 'Stone must have restrained dust and fragments');
assert.ok(effects.includes('for (let index = 0; index < 7; index += 1)'), 'Stone must use seven restrained orbiting fragments');
assert.ok(boost.includes("case 'stone': return '#d8c7a8';"), 'Stone must have a subtle warm mineral moving light');
assert.ok(profileTest.includes("getDice3DSurfaceProfile('stone'), 'photo-lit'"), 'Surface-profile verification must cover Stone');
assert.ok(ci.includes('node scripts/verify-stone-skin-consistency.mjs'), 'CI must run the Stone photographic regression test');

console.log('Stone photographic texture, 2D/3D integration, matte material, readiness cache, exact labels and mineral effects verification passed.');
