import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const dataUrl = new URL('src/app/components/session/dice/stoneTextureData.ts', root);
const overlayUrl = new URL('src/app/components/session/dice/DiceStoneAnimatedOverlay.tsx', root);
const cssUrl = new URL('src/app/components/session/dice/diceStoneAnimation.css', root);
const chunkUrls = Array.from({ length: 20 }, (_, index) => new URL(`src/app/components/session/dice/stoneTextureChunk${index}.ts`, root));

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
assert.ok(Array.from({ length: 20 }, (_, index) => data.includes(`STONE_TEXTURE_CHUNK_${index}`)).every(Boolean), 'Stone texture data must assemble every embedded chunk');

const expectedChunkHashes = [
  'e58d77976d051e37e1f23119f5cde6a09031646d814983d681d538837b1c8902',
  '0698eed8862f9c33a92ac8df9a912c9419e23774947f647903e1f8d7ad0adaf8',
  '973a59d2d17c8841e00c0f5e42035d3f76be27e51865b1e5fd80f829f4ca591a',
  '3db9b03112d58d7f3fdfcab754acf817ba3e7f5ef63778e575413054bba600a8',
  'd4df702ddb243bbda448db27b15100431d1157fcf6e0facee360009008a82897',
  'af1ae3bfe0f66d15c1cde7a8c92b693d2acce3c2cf9422fb3eedf8329c557148',
  '523c2390598f712899d8c8f5006d0e7f772af0402ac27d55aae14fdc0f06540b',
  '37db803e4db501c68ddf524d155de186b1a95bba77aeb8d974dfca4dca40e88e',
  '39f2e271bd5866b852d3bc7b79778b35877a0439bdab6e994af2bec5edef9efd',
  '02e83431f90a14833f451cec21320004cb4dfc9d0e58e5cdc414ac0cb12bf4b7',
  '2efaaf34545d093949451051578a4f127cf6bdd661e2ca3d2175f25f25db57f7',
  'd5f1a8c71e45175e211bd2373a1a77f568f25d7ca2049e89299f7e92693fcae6',
  '7cf6e307de9d1ab3e071025718fb85f7e875c566ded12dcf7e3ad6984d923528',
  'e6e2fb167ea72d71244f08c2aa1743d76efc386bcc9f0b08c4ab4c64b96fb925',
  'b73e06c10c4fbd6a9ba916cd18dbb1244ba20a282f30b252c4ff426cbf6251e2',
  '041d8a060dbdbe22fbba605189897d3cf8eff55a9a9324989ed3ab2bc89675af',
  '2459a461b984d19a8d205c24aa54b06924b97dc36aedf4c9a566092f45aaf500',
  'cd677f4eea9ec1d14cbbbabb916ded7f11ecedc9a05c8396cf5b2865add0aff7',
  'd105e69dd077108e400e0133de1fe3ddec21be56008df91292a38c02f362ccbc',
  'fdb2f8496d1101faaceefb82cf5b2ed11179d18cdb18e6b1bb5f9317c4374ade',
];
const encodedChunks = chunks.map((content, index) => {
  const match = content.match(new RegExp(`STONE_TEXTURE_CHUNK_${index}\\s*=\\s*['\"]([^'\"]+)['\"]`));
  assert.ok(match, `Stone texture chunk ${index} must contain base64 payload`);
  assert.equal(createHash('sha256').update(match[1]).digest('hex'), expectedChunkHashes[index], `Stone texture chunk ${index} must reconstruct the approved asset`);
  return match[1];
});
const image = Buffer.from(encodedChunks.join(''), 'base64');
assert.equal(image.length, 89_186, 'Stone texture must match the optimized 448px production WebP payload');
assert.equal(image.subarray(0, 4).toString('ascii'), 'RIFF', 'Stone texture must be a RIFF image');
assert.equal(image.subarray(8, 12).toString('ascii'), 'WEBP', 'Stone texture must be a WebP image');
assert.equal(createHash('sha256').update(image).digest('hex'), '4e42a2affebc97be43dffb0b329f4c66cc69a4a3b705733b52fb545e9adb9de4', 'Stone texture must match the approved rocky photograph');

assert.ok(skins.includes("import { STONE_TEXTURE_DATA_URL } from './stoneTextureData.ts';"), '2D Stone must import the photographic texture');
assert.ok(skins.includes("case 'stone':\n      return `url(\"${STONE_TEXTURE_DATA_URL}\")`;"), '2D Stone must replace the procedural pattern with the photograph');
assert.ok(surface.includes("appearance.skinId === 'stone'"), 'Stone must share full-coverage photographic surface handling');
assert.ok(surface.includes('const animatedStone = isAnimatedStoneAppearance(appearance);'), 'Stone surface must detect its animated state');
assert.ok(surface.includes('<DiceStoneAnimatedOverlay appearance={appearance} />'), 'Stone surface must render its dedicated overlay');
assert.ok(icon.includes('<DiceStoneAnimatedOverlay appearance={appearance} />'), 'Standard-die icons must render the Stone animated overlay');
assert.ok(preview.includes("case 'stone':\n      return null;"), 'The obsolete procedural Stone preview art must not cover the photograph');
assert.ok(overlay.includes("appearance.skinId === 'stone' && appearance.effectsEnabled"), 'Stone 2D animation must be gated by Stone + effectsEnabled');
assert.ok(overlay.includes('STONE_TEXTURE_DATA_URL'), 'Stone animated overlay must use the approved photograph');
assert.ok(css.includes('@keyframes hollowgate-stone-dust-drift'), 'Stone 2D must animate restrained mineral dust');
assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'), 'Stone 2D must respect reduced motion');

assert.ok(textures.includes("import { STONE_TEXTURE_SOURCE_DATA_URL } from './stoneTextureData.ts';"), '3D Stone must import the source WebP directly');
assert.ok(textures.includes("createTextureImage(STONE_TEXTURE_SOURCE_DATA_URL, 'stone')"), '3D Stone must preload the photograph through the shared readiness pipeline');
assert.ok(textures.includes('drawStonePhotoTexture(context, bump, size)'), '3D Stone must render the photographic source');
assert.ok(textures.includes("context.filter = 'brightness(1.12) saturate(.96) contrast(1.12)'"), 'Stone faces must keep a natural but readable rocky polish');
assert.ok(textures.includes("bump.filter = 'grayscale(1) contrast(1.85) brightness(.92)'"), 'Stone bump must derive strongly from the photograph');
assert.ok(textures.includes("descriptor.appearance.skinId === 'stone'"), 'The readiness gate must wait for Stone rolls');
assert.ok(textures.includes("appearance.skinId === 'stone' ? (isStoneTextureReady() ? 'ready' : 'placeholder')"), 'Stone descriptors must distinguish placeholder and ready phases');
assert.ok(textures.includes('`${appearance.skinId}:${appearance.bodyColor}:${textureScale}:${readiness}`'), 'Stone ready and placeholder descriptors must use separate cache keys');

const waitIndex = renderer.indexOf('await waitForDice3DTextureAssets(appearanceQueue);');
const rollIndex = renderer.indexOf('await this.box.roll(notation);');
assert.ok(waitIndex >= 0 && rollIndex > waitIndex, 'Stone photographic assets must load before roll start');
assert.ok(profiles.includes("stone: 'photo-lit'"), 'Stone must keep the lit photographic profile for believable rock depth');
assert.ok(materials.includes("skinId === 'stone'"), 'Stone photographic labels must preserve the user-selected symbol color');
assert.ok(materials.includes('preserveStoneFaceTexture(material)'), 'Stone must preserve the photograph while retaining a rough lit face material');
assert.ok(materials.includes("case 'stone': applyRoughness(0.96); applyMetalness(0); applyShininess(4); break;"), 'Stone edges must remain very rough and non-metallic');
assert.ok(effects.includes("case 'stone':") && effects.includes('addStoneFragments(group, updaters, radius);'), 'Stone must retain dedicated animated 3D fragments');
assert.ok(effects.includes('for (let index = 0; index < 7; index += 1)'), 'Stone must use seven restrained orbiting fragments');
assert.ok(boost.includes("case 'stone': return '#d8c7a6';"), 'Stone must use a subtle warm mineral moving light');
assert.ok(profileTest.includes("getDice3DSurfaceProfile('stone'), 'photo-lit'"), 'Surface-profile verification must cover Stone');
assert.ok(ci.includes('node scripts/verify-stone-skin-consistency.mjs'), 'CI must run the Stone photographic-skin regression test');

console.log('Stone photographic 2D/3D texture, readiness cache, rough lit material, exact symbols, and restrained mineral effects verification passed.');
