import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const dataUrl = new URL('src/app/components/session/dice/stoneTextureData.ts', root);
const overlayUrl = new URL('src/app/components/session/dice/DiceStoneAnimatedOverlay.tsx', root);
const cssUrl = new URL('src/app/components/session/dice/diceStoneAnimation.css', root);
const chunkUrls = Array.from({ length: 15 }, (_, index) => new URL(`src/app/components/session/dice/stoneTextureChunk${index}.ts`, root));

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

assert.ok(data.includes('export const STONE_TEXTURE_SOURCE_DATA_URL = `data:image/webp;base64,'), 'Stone must expose an optimized WebP source');
assert.ok(data.includes('export const STONE_TEXTURE_DATA_URL = STONE_TEXTURE_SOURCE_DATA_URL;'), 'Stone 2D and 3D must share the same photographic source');
assert.ok(chunks.every((content, index) => content.includes(`STONE_TEXTURE_CHUNK_${index}`)), 'Every Stone chunk must export its indexed payload');
assert.ok(Array.from({ length: 15 }, (_, index) => data.includes(`STONE_TEXTURE_CHUNK_${index}`)).every(Boolean), 'Stone texture data must assemble every embedded chunk');

const expectedChunkHashes = [
  'fb4ad857f35f8dde537bc05c0bf5d19e838c31333b9081ec37493124adce2afd',
  '4af68938c97fd8c740fb994b618d7d6900be6c8f9a0140d130c666844fa73e1c',
  'e49ad898017a7226349d757c1a7f5dc7e2f4c405b0d5c118f0c2d3a744c4c688',
  'a9ba6fb4ab6e66e79efd9f916e05d5f68965cb8778cbd19a4a9d03133d9ff53d',
  '5bcdc98d67427a4837ae3adc6523f519d4945aef6741230de567c95fae565588',
  '494f143d98f990c388bbddf40c130e34ce261153042bc6765c1d5a99d5c4e693',
  'b864bbda8bf6b2c3c107d9bb13174819d6f5c8e631741907e5e8e710019e24fb',
  'd1b9c10a96084f825ccee5b63d35d19d027e3f1210293481241f6c2bc085cbea',
  '53d29b4c13a243c745f29d5c5106c25a94dfacc26c42fa6d335ae26aec0d83ef',
  '9ba5b81ccc7a8cb814f191bd2f71d0e84618454ef688be6852ed580588bdbc17',
  '44f23bb80fb96a4348e1424aaa4106181c8b7950d69018c050077224bee6a71f',
  '5378142049056ebc8cff5826a6776879b497909b8d6174146b9d8170ae426e3f',
  'fab274714b195e0a88361265b34fd24e0c7ba201d5ef71fbe21c9c8b8e81754a',
  'e0a7e7893422e03beba794cc2257f12727673e3812053c8192f96833a10dd590',
  'a3ee4b10117d974192a7cdd92a171502e394bc3b81931e77717829192185c0b0',
];
const encoded = chunks.map((content, index) => {
  const match = content.match(new RegExp(`STONE_TEXTURE_CHUNK_${index}\\s*=\\s*['\"]([^'\"]+)['\"]`));
  assert.ok(match, `Stone chunk ${index} must contain base64 payload`);
  assert.equal(createHash('sha256').update(match[1]).digest('hex'), expectedChunkHashes[index], `Stone chunk ${index} must match the approved asset`);
  return match[1];
}).join('');
const image = Buffer.from(encoded, 'base64');
assert.equal(image.length, 89_186, 'Stone texture must match the optimized 448px WebP payload');
assert.equal(image.subarray(0, 4).toString('ascii'), 'RIFF', 'Stone texture must be a RIFF image');
assert.equal(image.subarray(8, 12).toString('ascii'), 'WEBP', 'Stone texture must be a WebP image');
assert.equal(createHash('sha256').update(image).digest('hex'), '4e42a2affebc97be43dffb0b329f4c66cc69a4a3b705733b52fb545e9adb9de4', 'Stone texture must match the approved rock photograph');

assert.ok(skins.includes("import { STONE_TEXTURE_DATA_URL } from './stoneTextureData.ts';"), '2D Stone must import the photographic texture');
assert.ok(skins.includes("case 'stone':\n      return `url(\"${STONE_TEXTURE_DATA_URL}\")`;"), '2D Stone must replace the procedural texture with the photograph');
assert.ok(surface.includes("appearance.skinId === 'stone'"), 'Stone must share full-coverage photographic surface handling');
assert.ok(surface.includes('const animatedStone = isAnimatedStoneAppearance(appearance);'), 'Stone surface must detect its animated state');
assert.ok(surface.includes('<DiceStoneAnimatedOverlay appearance={appearance} />'), 'Stone surface must render its dedicated overlay');
assert.ok(icon.includes('<DiceStoneAnimatedOverlay appearance={appearance} />'), 'Standard die icons must render the Stone overlay');
assert.ok(preview.includes("case 'stone':\n      return null;"), 'Procedural Stone preview art must not cover the photograph');
assert.ok(overlay.includes("appearance.skinId === 'stone' && appearance.effectsEnabled"), 'Stone 2D animation must be gated by Stone + effectsEnabled');
assert.ok(overlay.includes('STONE_TEXTURE_DATA_URL'), 'Stone overlay must use the approved photograph');
assert.ok(overlay.includes('getDiceTextureBackgroundSize(appearance.textureScale)'), 'Stone overlay must honor textureScale');
assert.ok(css.includes('@keyframes hollowgate-stone-dust-drift') && css.includes('@media (prefers-reduced-motion: reduce)'), 'Stone 2D must animate dust and respect reduced motion');

assert.ok(textures.includes("import { STONE_TEXTURE_SOURCE_DATA_URL } from './stoneTextureData.ts';"), '3D Stone must import the source WebP directly');
assert.ok(textures.includes("createTextureImage(STONE_TEXTURE_SOURCE_DATA_URL, 'stone')"), '3D Stone must preload through the shared readiness pipeline');
assert.ok(textures.includes('drawStonePhotoTexture(context, bump, size)'), '3D Stone must render the photographic source');
assert.ok(textures.includes("context.filter = 'brightness(1.12) saturate(.96) contrast(1.10)'"), 'Stone faces must receive a restrained mineral polish');
assert.ok(textures.includes("bump.filter = 'grayscale(1) contrast(2.10) brightness(.90)'"), 'Stone bump must derive from the photograph');
assert.ok(textures.includes("descriptor.appearance.skinId === 'stone'"), 'The readiness gate must wait for Stone rolls');
assert.ok(textures.includes("appearance.skinId === 'stone' ? (isStoneTextureReady() ? 'ready' : 'placeholder')"), 'Stone descriptors must distinguish placeholder and ready phases');

const waitIndex = renderer.indexOf('await waitForDice3DTextureAssets(appearanceQueue);');
const adapterIndex = renderer.indexOf('installDiceAppearanceAdapter(this.box, appearanceQueue)');
const rollIndex = renderer.indexOf('await this.box.roll(notation);');
assert.ok(waitIndex >= 0 && adapterIndex > waitIndex && rollIndex > waitIndex, 'Stone assets must load before die creation and roll start');
assert.ok(profiles.includes("stone: 'photo-lit'"), 'Stone must keep scene-lit photographic depth');
assert.ok(materials.includes('function preserveStoneFaceTexture(material: MaterialLike)'), 'Stone must preserve its photograph with a dedicated matte face treatment');
assert.ok(materials.includes('material.roughness = 0.9') && materials.includes('material.metalness = 0'), 'Stone faces must be matte and non-metallic');
assert.ok(materials.includes("skinId === 'fire' || skinId === 'stone' || getDice3DSurfaceProfile(skinId) === 'photo-unlit'"), 'Stone must preserve the exact user-selected symbol color');
assert.ok(effects.includes("case 'stone':") && effects.includes('addStoneFragments(group, updaters, radius);'), 'Stone must retain dedicated fragments');
assert.ok(effects.includes('particleCount: 12') && effects.includes('orbitSpeed: 0.72'), 'Stone dust must be visible but restrained');
assert.ok(boost.includes("case 'stone': return '#d8c7a8';"), 'Stone must use a subtle warm mineral moving light');
assert.ok(profileTest.includes("getDice3DSurfaceProfile('stone'), 'photo-lit'"), 'Surface-profile verification must cover Stone');
assert.ok(ci.includes('node scripts/verify-stone-skin-consistency.mjs'), 'CI must run the Stone photographic regression test');

console.log('Stone photographic 2D/3D texture, matte material, readiness cache, readable labels, and mineral effects verification passed.');
