import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const dataUrl = new URL('src/app/components/session/dice/poisonTextureData.ts', root);
const overlayUrl = new URL('src/app/components/session/dice/DicePoisonAnimatedOverlay.tsx', root);
const cssUrl = new URL('src/app/components/session/dice/dicePoisonAnimation.css', root);
const chunkUrls = Array.from({ length: 13 }, (_, index) => new URL(`src/app/components/session/dice/poisonTextureChunk${index}.ts`, root));

assert.ok(fs.existsSync(dataUrl), 'Poison texture data module must exist');
assert.ok(chunkUrls.every((url) => fs.existsSync(url)), 'All Poison texture chunks must exist');
assert.ok(fs.existsSync(overlayUrl), 'Poison must have a dedicated 2D animated overlay');
assert.ok(fs.existsSync(cssUrl), 'Poison must have dedicated 2D animation styles');

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

assert.ok(data.includes('export const POISON_TEXTURE_SOURCE_DATA_URL = `data:image/webp;base64,'), 'Poison must expose the optimized WebP source for direct 3D loading');
assert.ok(data.includes('export const POISON_TEXTURE_DATA_URL = POISON_TEXTURE_SOURCE_DATA_URL;'), 'Poison 2D and 3D must share the same square photographic source');
assert.ok(chunks.every((content, index) => content.includes(`POISON_TEXTURE_CHUNK_${index}`)), 'Every Poison texture chunk must export its indexed payload');
assert.ok(Array.from({ length: 13 }, (_, index) => data.includes(`POISON_TEXTURE_CHUNK_${index}`)).every(Boolean), 'Poison texture data must assemble every embedded chunk');

const expectedChunkHashes = [
  '33b7970b9f06dfdddf2e0ad4b0225068e822aed418be05d6831a5cd9c1956649',
  '829165ee4b7ba3dded53e77f7bc3fdc3852887988323d55d21a32bfe3bffb377',
  '113075f3fe88ceb387833cc566219b86fe8fbd125e07b383e6e214919f6aaf4c',
  '419fdc65777140902313c4d27990e124d51678ebfe969d00ddcf48fc0a08bafa',
  'a4a0db51a6d1eaf96ef53edc520586626b6c43e8a7d15e8fcd4813c030b0deb2',
  'ca32db989431d793db3dab1d089f0c9e9f4f546143c42417cb4aff9ba6a9b4b2',
  '4c35e006efbb9e1d6964d1a008cc1116371486a4517b0cc110b67a61d06915e9',
  '348992acc32dce7af25310462704e34bef8b3ec170e55a9b5e8bdda6e5f3b838',
  '029c7d9eb6626b4e25ede2d6f968678b29f130f8940f44e6739d648413dce7ed',
  '99fb9a752625e5593a9f57eb261ea2460070f74a535af43ffdbf5646785da49d',
  'e731255643ecb61516914adf82f5b0862d44b9d48d453763c4cf53adafeaf756',
  '86e6b18c726b4a74026400fd12b1c740998ffccf6504096c0feeff2f92b0cb9a',
  '35b64813aeeb2d4f5d0aa8cf43cc530f41ce94d58dd952f535a0a3bb9d653ba7',
];
const encodedChunks = chunks.map((content, index) => {
  const match = content.match(new RegExp(`POISON_TEXTURE_CHUNK_${index}\\s*=\\s*['\"]([^'\"]+)['\"]`));
  assert.ok(match, `Poison texture chunk ${index} must contain base64 payload`);
  assert.equal(
    createHash('sha256').update(match[1]).digest('hex'),
    expectedChunkHashes[index],
    `Poison texture chunk ${index} must reconstruct the approved asset`,
  );
  return match[1];
});
const encoded = encodedChunks.join('');
const image = Buffer.from(encoded, 'base64');
assert.equal(image.length, 77_134, 'Poison texture must match the optimized 448px production WebP payload');
assert.equal(image.subarray(0, 4).toString('ascii'), 'RIFF', 'Poison texture must be a RIFF image');
assert.equal(image.subarray(8, 12).toString('ascii'), 'WEBP', 'Poison texture must be a WebP image');
assert.equal(
  createHash('sha256').update(image).digest('hex'),
  '351ede22e781cf5654f108a30bfb0c1c519fb03ba315be01c8e494eed7f7d50c',
  'Poison texture must match the approved green-black bubbling texture',
);

assert.ok(skins.includes("import { POISON_TEXTURE_DATA_URL } from './poisonTextureData.ts';"), '2D Poison must import the photographic texture');
assert.ok(skins.includes("case 'poison':\n      return `url(\"${POISON_TEXTURE_DATA_URL}\")`;"), '2D Poison must replace the procedural gradient with the photograph');
assert.ok(surface.includes("appearance.skinId === 'poison'"), 'Poison must share full-coverage photographic surface handling');
assert.ok(surface.includes('const animatedPoison = isAnimatedPoisonAppearance(appearance);'), 'Poison surface must detect its animated state');
assert.ok(surface.includes('<DicePoisonAnimatedOverlay appearance={appearance} />'), 'Poison surface must render its dedicated overlay');
assert.ok(icon.includes('<DicePoisonAnimatedOverlay appearance={appearance} />'), 'Standard-die icons must render the Poison animated overlay');
assert.ok(preview.includes("case 'poison':\n      return null;"), 'The obsolete procedural Poison preview art must not cover the photograph');

assert.ok(overlay.includes("appearance.skinId === 'poison' && appearance.effectsEnabled"), 'Poison 2D animation must be gated by Poison + effectsEnabled');
assert.ok(overlay.includes('POISON_TEXTURE_DATA_URL'), 'Poison animated overlay must use the approved photograph');
assert.ok(overlay.includes('getDiceTextureBackgroundSize(appearance.textureScale)'), 'Poison animated overlay must honor shared textureScale');
assert.ok(overlay.includes('data-dice-poison-animated-texture') && overlay.includes('data-dice-poison-animated-bubbles'), 'Poison overlay must combine photographic ooze and bubbling energy');
assert.ok(css.includes('@keyframes hollowgate-poison-texture-breathe') && css.includes('@keyframes hollowgate-poison-bubbles'), 'Poison 2D must animate organic texture breathing and bubbles');
assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'), 'Poison 2D must respect reduced motion');

assert.ok(textures.includes("import { POISON_TEXTURE_SOURCE_DATA_URL } from './poisonTextureData.ts';"), '3D Poison must import the source WebP directly');
assert.ok(textures.includes("createTextureImage(POISON_TEXTURE_SOURCE_DATA_URL, 'poison')"), '3D Poison must preload the photograph through the shared readiness pipeline');
assert.ok(textures.includes('drawPoisonPhotoTexture(context, bump, size)'), '3D Poison must render the photographic source');
assert.ok(!/drawPoisonPhotoTexture\([^)]*bodyColor/.test(textures), 'Poison photograph must not be tinted by bodyColor');
assert.ok(textures.includes("context.filter = 'brightness(1.20) saturate(1.18) contrast(1.10)'"), 'Poison photo faces must receive a vivid but controlled lift');
assert.ok(textures.includes("bump.filter = 'grayscale(1) contrast(1.90) brightness(.88)'"), 'Poison bump must derive from the photograph');
assert.ok(textures.includes("descriptor.appearance.skinId === 'poison'"), 'The readiness gate must wait for Poison rolls');
assert.ok(textures.includes("appearance.skinId === 'poison' ? (isPoisonTextureReady() ? 'ready' : 'placeholder')"), 'Poison descriptors must distinguish placeholder and ready phases');
assert.ok(textures.includes('`${appearance.skinId}:${appearance.bodyColor}:${textureScale}:${readiness}`'), 'Poison ready and placeholder descriptors must use separate cache keys');
assert.ok(textures.includes('`hollowgate-${appearance.skinId}-${appearance.bodyColor}-${textureScale}-${readiness}`'), 'Renderer-facing Poison texture names must differ across readiness phases');

const waitIndex = renderer.indexOf('await waitForDice3DTextureAssets(appearanceQueue);');
const adapterIndex = renderer.indexOf('installDiceAppearanceAdapter(this.box, appearanceQueue)');
const rollIndex = renderer.indexOf('await this.box.roll(notation);');
assert.ok(waitIndex >= 0 && adapterIndex > waitIndex && rollIndex > waitIndex, 'Poison photographic assets must load before die creation and roll start');
assert.ok(profiles.includes("poison: 'photo-unlit'"), 'Poison photographic faces must remain vivid and stable independently of scene lighting');
assert.ok(materials.includes("skinId === 'fire' || getDice3DSurfaceProfile(skinId) === 'photo-unlit'"), 'Fire and every photo-unlit skin must preserve the exact user-selected symbol color');
assert.ok(materials.includes("case 'poison': return '#62d94d';"), 'Poison edges must keep their dedicated toxic-green emissive color');
assert.ok(effects.includes("case 'poison':") && effects.includes('addPoisonBubbles(group, updaters, radius);'), 'Poison must retain its dedicated animated 3D bubbles');
assert.ok(boost.includes("case 'poison': return '#7fea55';"), 'Poison must retain its toxic-green moving-light boost');
assert.ok(profileTest.includes("getDice3DSurfaceProfile('poison'), 'photo-unlit'"), 'Surface-profile verification must cover Poison');
assert.ok(renderer.includes('this.startSettledRenderLoop();') && renderer.includes('this.stopSettledRenderLoop();'), 'Poison effects must continue rendering throughout the settled hold');
assert.ok(ci.includes('node scripts/verify-poison-skin-consistency.mjs'), 'CI must run the Poison photographic-skin regression test');

console.log('Poison photographic 2D/3D texture, readiness cache, vivid unlit faces, exact symbols, and toxic animated effects verification passed.');
