import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const dataUrl = new URL('src/app/components/session/dice/lightningTextureData.ts', root);
const overlayUrl = new URL('src/app/components/session/dice/DiceLightningAnimatedOverlay.tsx', root);
const cssUrl = new URL('src/app/components/session/dice/diceLightningAnimation.css', root);
const chunkUrls = Array.from({ length: 8 }, (_, index) => new URL(`src/app/components/session/dice/lightningTextureChunk${index}.ts`, root));

assert.ok(fs.existsSync(dataUrl), 'Lightning texture data module must exist');
assert.ok(chunkUrls.every((url) => fs.existsSync(url)), 'All Lightning texture chunks must exist');
assert.ok(fs.existsSync(overlayUrl), 'Lightning must have a dedicated 2D animated overlay');
assert.ok(fs.existsSync(cssUrl), 'Lightning must have dedicated 2D animation styles');

const data = fs.readFileSync(dataUrl, 'utf8');
const chunks = chunkUrls.map((url) => fs.readFileSync(url, 'utf8'));
const skins = fs.readFileSync(new URL('src/app/components/session/dice/diceSkins.ts', root), 'utf8');
const surface = fs.readFileSync(new URL('src/app/components/session/dice/DiceSkinSurface.tsx', root), 'utf8');
const preview = fs.readFileSync(new URL('src/app/components/session/dice/DiceSkinPreviewArt.tsx', root), 'utf8');
const overlay = fs.readFileSync(overlayUrl, 'utf8');
const css = fs.readFileSync(cssUrl, 'utf8');
const textures = fs.readFileSync(new URL('src/app/components/session/dice/dice3dSkinTextures.ts', root), 'utf8');
const materials = fs.readFileSync(new URL('src/app/components/session/dice/dice3dAppearanceMaterials.ts', root), 'utf8');
const profiles = fs.readFileSync(new URL('src/app/components/session/dice/dice3dSurfaceProfiles.ts', root), 'utf8');
const effects = fs.readFileSync(new URL('src/app/components/session/dice/dice3dSkinEffects.ts', root), 'utf8');
const boost = fs.readFileSync(new URL('src/app/components/session/dice/dice3dVisualBoost.ts', root), 'utf8');
const renderer = fs.readFileSync(new URL('src/app/components/session/dice/dice3dRenderer.ts', root), 'utf8');
const ci = fs.readFileSync(new URL('.github/workflows/ci.yml', root), 'utf8');

assert.ok(data.includes('export const LIGHTNING_TEXTURE_SOURCE_DATA_URL = `data:image/webp;base64,'), 'Lightning must expose the optimized WebP source for direct 3D loading');
assert.ok(data.includes('export const LIGHTNING_TEXTURE_DATA_URL = LIGHTNING_TEXTURE_SOURCE_DATA_URL;'), 'Lightning 2D and 3D must share the same square photographic source');
assert.ok(chunks.every((content, index) => content.includes(`LIGHTNING_TEXTURE_CHUNK_${index}`)), 'Every Lightning texture chunk must export its indexed payload');
assert.ok(Array.from({ length: 8 }, (_, index) => data.includes(`LIGHTNING_TEXTURE_CHUNK_${index}`)).every(Boolean), 'Lightning texture data must assemble every embedded chunk');

const encoded = chunks.map((content, index) => {
  const match = content.match(new RegExp(`LIGHTNING_TEXTURE_CHUNK_${index}\\s*=\\s*['\"]([^'\"]+)['\"]`));
  assert.ok(match, `Lightning texture chunk ${index} must contain base64 payload`);
  return match[1];
}).join('');
const image = Buffer.from(encoded, 'base64');
assert.equal(image.length, 74_492, 'Lightning texture must match the optimized 512px production WebP payload');
assert.equal(image.subarray(0, 4).toString('ascii'), 'RIFF', 'Lightning texture must be a RIFF image');
assert.equal(image.subarray(8, 12).toString('ascii'), 'WEBP', 'Lightning texture must be a WebP image');
assert.equal(
  createHash('sha256').update(image).digest('hex'),
  'f0bb74facca04695595a8b77d97d9e986df6a216c2358d6cff040cf799a1f575',
  'Lightning texture must match the approved generated blue-magenta-orange lightning image',
);

assert.ok(skins.includes("import { LIGHTNING_TEXTURE_DATA_URL } from './lightningTextureData.ts';"), '2D Lightning must import the photographic texture');
assert.ok(skins.includes("case 'lightning':\n      return `url(\"${LIGHTNING_TEXTURE_DATA_URL}\")`;"), '2D Lightning must replace the procedural gradient with the photograph');
assert.ok(surface.includes("appearance.skinId === 'fire' || appearance.skinId === 'ice' || appearance.skinId === 'lightning'"), 'Lightning must share full-coverage photographic surface handling');
assert.ok(surface.includes('const animatedLightning = isAnimatedLightningAppearance(appearance);'), 'Lightning surface must detect its animated state');
assert.ok(surface.includes('<DiceLightningAnimatedOverlay appearance={appearance} />'), 'Lightning surface must render its dedicated overlay');
assert.ok(preview.includes("case 'lightning':\n      return null;"), 'The obsolete procedural Lightning preview art must not cover the photograph');

assert.ok(overlay.includes("appearance.skinId === 'lightning' && appearance.effectsEnabled"), 'Lightning 2D animation must be gated by Lightning + effectsEnabled');
assert.ok(overlay.includes('LIGHTNING_TEXTURE_DATA_URL'), 'Lightning animated overlay must use the approved photograph');
assert.ok(overlay.includes('getDiceTextureBackgroundSize(appearance.textureScale)'), 'Lightning animated overlay must honor shared textureScale');
assert.ok(overlay.includes('data-dice-lightning-animated-texture') && overlay.includes('data-dice-lightning-animated-flash'), 'Lightning overlay must combine photographic energy and electrical flashes');
assert.ok(css.includes('@keyframes hollowgate-lightning-texture-drift') && css.includes('@keyframes hollowgate-lightning-flash'), 'Lightning 2D must animate texture energy and electrical flashes');
assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'), 'Lightning 2D must respect reduced motion');

assert.ok(textures.includes("import { LIGHTNING_TEXTURE_SOURCE_DATA_URL } from './lightningTextureData.ts';"), '3D Lightning must import the source WebP directly');
assert.ok(textures.includes("createTextureImage(LIGHTNING_TEXTURE_SOURCE_DATA_URL, 'lightning')"), '3D Lightning must preload the photograph through the shared readiness pipeline');
assert.ok(textures.includes('drawLightningPhotoTexture(context, bump, size)'), '3D Lightning must render the photographic source');
assert.ok(!/drawLightningPhotoTexture\([^)]*bodyColor/.test(textures), 'Lightning photograph must not be tinted by bodyColor');
assert.ok(textures.includes("context.filter = 'brightness(1.16) saturate(1.12) contrast(1.10)'"), 'Lightning photo faces must receive a restrained vividness lift');
assert.ok(textures.includes("bump.filter = 'grayscale(1) contrast(2.05) brightness(.94)'"), 'Lightning bump must derive from the photograph');
assert.ok(textures.includes("descriptor.appearance.skinId === 'lightning'"), 'The readiness gate must wait for Lightning rolls');
assert.ok(textures.includes("appearance.skinId === 'lightning' ? (isLightningTextureReady() ? 'ready' : 'placeholder')"), 'Lightning descriptors must distinguish placeholder and ready phases');
assert.ok(textures.includes('`${appearance.skinId}:${appearance.bodyColor}:${textureScale}:${readiness}`'), 'Lightning ready and placeholder descriptors must use separate cache keys');
assert.ok(textures.includes('`hollowgate-${appearance.skinId}-${appearance.bodyColor}-${textureScale}-${readiness}`'), 'Renderer-facing Lightning texture names must differ across readiness phases');

const waitIndex = renderer.indexOf('await waitForDice3DTextureAssets(appearanceQueue);');
const adapterIndex = renderer.indexOf('installDiceAppearanceAdapter(this.box, appearanceQueue)');
const rollIndex = renderer.indexOf('await this.box.roll(notation);');
assert.ok(waitIndex >= 0 && adapterIndex > waitIndex && rollIndex > waitIndex, 'Lightning photographic assets must load before die creation and roll start');
assert.ok(profiles.includes("lightning: 'photo-unlit'"), 'Lightning photographic faces must remain vivid and stable independently of scene lighting');
assert.ok(profiles.includes('new THREE.MeshBasicMaterial'), 'The photographic unlit profile must use a genuinely light-independent material');
assert.ok(materials.includes("skinId === 'fire' || skinId === 'ice' || skinId === 'lightning'"), 'Lightning numbers must preserve the exact user-selected symbol color');
assert.ok(materials.includes("case 'lightning': return '#42dcff';"), 'Lightning edges must keep their dedicated cyan emissive color');
assert.ok(effects.includes("case 'lightning':") && effects.includes('lightningBolts: 5'), 'Lightning must retain its dedicated animated 3D bolts');
assert.ok(boost.includes("case 'lightning': return '#55e6ff';"), 'Lightning must retain its cold electric moving-light boost');
assert.ok(renderer.includes('this.startSettledRenderLoop();') && renderer.includes('this.stopSettledRenderLoop();'), 'Lightning effects must continue rendering throughout the settled hold');
assert.ok(ci.includes('node scripts/verify-lightning-skin-consistency.mjs'), 'CI must run the Lightning photographic-skin regression test');

console.log('Lightning photographic 2D/3D texture, readiness cache, vivid unlit faces, exact symbols, and animated effects verification passed.');
