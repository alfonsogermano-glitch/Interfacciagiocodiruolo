import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const skins = fs.readFileSync(new URL('src/app/components/session/dice/diceSkins.ts', root), 'utf8');
const data = fs.readFileSync(new URL('src/app/components/session/dice/iceTextureData.ts', root), 'utf8');
const chunks = Array.from({ length: 6 }, (_, index) => fs.readFileSync(new URL(`src/app/components/session/dice/iceTextureChunk${index}.ts`, root), 'utf8'));
const textures = fs.readFileSync(new URL('src/app/components/session/dice/dice3dSkinTextures.ts', root), 'utf8');
const materials = fs.readFileSync(new URL('src/app/components/session/dice/dice3dAppearanceMaterials.ts', root), 'utf8');
const profiles = fs.readFileSync(new URL('src/app/components/session/dice/dice3dSurfaceProfiles.ts', root), 'utf8');
const renderer = fs.readFileSync(new URL('src/app/components/session/dice/dice3dRenderer.ts', root), 'utf8');
const customizer = fs.readFileSync(new URL('src/app/components/session/dice/DiceAppearanceCustomizer.tsx', root), 'utf8');
const surface = fs.readFileSync(new URL('src/app/components/session/dice/DiceSkinSurface.tsx', root), 'utf8');
const appearance = fs.readFileSync(new URL('src/app/components/session/dice/diceAppearance.ts', root), 'utf8');
const service = fs.readFileSync(new URL('src/services/supabase/diceStandardStyleService.ts', root), 'utf8');
const fire = fs.readFileSync(new URL('src/app/components/session/dice/fireTextureData.ts', root), 'utf8');

assert.ok(skins.includes('ICE_TEXTURE_DATA_URL'), '2D Ice must use the official photographic texture');
assert.ok(data.includes('data:image/webp;base64'), 'Ice texture source must remain the embedded user photograph');
assert.ok(data.includes('export const ICE_TEXTURE_SOURCE_DATA_URL = `data:image/webp;base64,'), 'Ice must expose the original WebP source separately for direct 3D loading');
assert.ok(data.includes('viewBox=\"0 0 512 512\"'), 'Ice texture must expose a square surface for die-shaped previews');
assert.ok(data.includes('preserveAspectRatio=\"xMidYMid slice\"'), 'Ice texture must crop with cover semantics without distorting the photograph');
assert.ok(data.includes('data:image/svg+xml;charset=utf-8'), 'Ice texture must keep the square SVG wrapper for 2D previews');
assert.ok(chunks.every((content, index) => content.includes(`ICE_TEXTURE_CHUNK_${index}`)), 'All Ice texture chunks must exist');
assert.ok(Array.from({ length: 6 }, (_, index) => data.includes(`ICE_TEXTURE_CHUNK_${index}`)).every(Boolean), 'Ice texture data must assemble every embedded chunk');

const encoded = chunks.map((content, index) => {
  const match = content.match(new RegExp(`ICE_TEXTURE_CHUNK_${index}\\s*=\\s*['\"]([^'\"]+)['\"]`));
  assert.ok(match, `Ice texture chunk ${index} must contain base64 payload`);
  return match[1];
}).join('');
const image = Buffer.from(encoded, 'base64');
assert.equal(image.length, 44_108, 'Ice texture must match the optimized bright user-provided photographic WebP payload');
assert.equal(image.subarray(0, 4).toString('ascii'), 'RIFF', 'Ice texture must be a RIFF image');
assert.equal(image.subarray(8, 12).toString('ascii'), 'WEBP', 'Ice texture must be a WebP image');
assert.equal(
  createHash('sha256').update(image).digest('hex'),
  '7ddacb18f866baeff79e6a789e67e2516a8fd7cd65a5423bb5029306bfe02bfb',
  'Ice texture must match the exact optimized image generated from the user-provided bright ice photograph',
);
assert.ok(surface.includes("const photographicSkin = appearance.skinId === 'fire' || appearance.skinId === 'ice';"), 'Fire and Ice swatches must share photographic full-coverage handling');
assert.ok(surface.includes("backgroundOrigin: photographicSkin ? 'border-box' : undefined"), 'Photographic swatches must paint below their border without body-color slivers');

assert.ok(textures.includes("import { ICE_TEXTURE_SOURCE_DATA_URL } from './iceTextureData.ts';"), '3D Ice must import the original photographic WebP instead of the 2D SVG wrapper');
assert.ok(textures.includes("createTextureImage(ICE_TEXTURE_SOURCE_DATA_URL, 'ice')"), '3D Ice must load the user photograph directly');
assert.ok(textures.includes('drawIcePhotoTexture(context, bump, size)'), '3D Ice must render the photographic source without body-color tinting');
assert.ok(!/drawIcePhotoTexture\([^)]*bodyColor/.test(textures), 'Ice 3D photographic renderer must not accept bodyColor tinting');
assert.ok(textures.includes("context.filter = 'brightness(1.22) saturate(1.16) contrast(1.14)'"), 'Ice photo faces must receive the final restrained brightness lift without changing saturation or contrast');
assert.ok(textures.includes('context.globalAlpha = 0.08;'), 'Ice photo faces must preserve the restrained cold screen lift');
assert.ok(textures.includes("context.fillStyle = '#e6fbff';"), 'Ice photo faces must preserve the cold screen tint');
assert.ok(textures.includes("bump.filter = 'grayscale(1) contrast(1.95) brightness(.96)'"), 'Ice bump must remain unchanged during the brightness micro-pass');
assert.ok(textures.includes('applyTextureZoom(context, bump, size, textureScale)'), '3D Ice must use the shared textureScale pipeline');
assert.ok(textures.includes('export async function waitForDice3DTextureAssets'), 'The 3D texture pipeline must expose an awaitable readiness gate');
assert.ok(textures.includes('if (image.complete && image.naturalWidth > 0) settleReady();'), 'The readiness gate must not resolve early for an incomplete or broken image');
assert.ok(textures.includes("const readiness = appearance.skinId === 'ice' ? (isIceTextureReady() ? 'ready' : 'placeholder') : null;"), 'Ice texture descriptors must distinguish placeholder and ready phases');
assert.ok(textures.includes('`${appearance.skinId}:${appearance.bodyColor}:${textureScale}:${readiness}`'), 'Ice 3D cache keys must distinguish the ready photograph from the placeholder');
assert.ok(textures.includes('`hollowgate-${appearance.skinId}-${appearance.bodyColor}-${textureScale}-${readiness}`'), 'The renderer-facing texture name must change when the Ice photograph becomes ready');
const waitIndex = renderer.indexOf('await waitForDice3DTextureAssets(appearanceQueue);');
const adapterIndex = renderer.indexOf('installDiceAppearanceAdapter(this.box, appearanceQueue)');
const rollIndex = renderer.indexOf('await this.box.roll(notation);');
assert.ok(waitIndex >= 0 && adapterIndex > waitIndex && rollIndex > waitIndex, 'Ice photographic assets must finish loading before the appearance adapter creates dice and before the roll starts');
assert.ok(materials.includes("if (skinId === 'fire' || skinId === 'ice') return symbolColor;"), 'Ice numbers must preserve the exact user-selected symbol color');
assert.ok(materials.includes('factory.label_outline = outlineColor;'), 'Ice numbers must keep the contrasting renderer outline');
assert.ok(materials.includes("case 'ice': return '#8eeeff';"), 'Ice edges must preserve the dedicated cold emissive glow');
assert.ok(materials.includes("material.emissiveIntensity = skinId === 'ice' ? 0.25 : 0.11;"), 'Ice edge glow must use the stable rolling-to-settled baseline');
assert.ok(materials.includes('getDice3DTextureDescriptor(appearance)'), '3D Ice must use the photographic descriptor directly');
assert.ok(!materials.includes('function preserveIceFaceTexture(material: MaterialLike)'), '3D Ice must not rely on per-skin Phong mutations');
const fireMaterialFn = materials.match(/function preserveFireFaceTexture[\s\S]*?\n}\n/)?.[0] ?? '';
assert.ok(fireMaterialFn.includes('material.color?.set?.(0xffffff);'), 'Fire photographic face materials must retain their neutral white multiplier');
assert.ok(profiles.includes("ice: 'photo-unlit'"), 'Ice photographic faces must keep the shared unlit profile');
assert.ok(profiles.includes('new THREE.MeshBasicMaterial'), 'The unlit profile must use a genuinely light-independent material');
assert.ok(materials.includes('factory.edge_color = appearance.bodyColor;'), 'The user body color must remain on the die edges');
assert.ok(customizer.includes('textureScale: selected.textureScale'), 'Apply to all must keep textureScale');
assert.ok(appearance.includes('textureScale: normalizeDiceTextureScale'), 'roll snapshots must normalize and preserve textureScale');
assert.ok(service.includes('texture_scale: normalizeDiceTextureScale(style.textureScale)'), 'Supabase persistence must preserve textureScale');
assert.ok(fire.includes('FIRE_TEXTURE_CHUNK_0'), 'Fire texture pipeline must remain intact');
console.log('Ice photographic texture, direct 3D loading, cache readiness, final brightness lift, stable edge glow, preserved symbol color, and shared 2D/3D zoom verification passed.');
