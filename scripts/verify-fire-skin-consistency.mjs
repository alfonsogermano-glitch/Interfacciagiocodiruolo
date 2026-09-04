import assert from 'node:assert/strict';
import fs from 'node:fs';

const previewArt = fs.readFileSync(new URL('../src/app/components/session/dice/DiceSkinPreviewArt.tsx', import.meta.url), 'utf8');
const styled = fs.readFileSync(new URL('../src/app/components/session/dice/StyledStandardDieIcon.tsx', import.meta.url), 'utf8');
const skinSurface = fs.readFileSync(new URL('../src/app/components/session/dice/DiceSkinSurface.tsx', import.meta.url), 'utf8');
const skins = fs.readFileSync(new URL('../src/app/components/session/dice/diceSkins.ts', import.meta.url), 'utf8');
const fireTextureData = fs.readFileSync(new URL('../src/app/components/session/dice/fireTextureData.ts', import.meta.url), 'utf8');
const fireChunks = [0, 1, 2, 3].map((index) => fs.readFileSync(new URL(`../src/app/components/session/dice/fireTextureChunk${index}.ts`, import.meta.url), 'utf8'));
const textures = fs.readFileSync(new URL('../src/app/components/session/dice/dice3dSkinTextures.ts', import.meta.url), 'utf8');
const appearance = fs.readFileSync(new URL('../src/app/components/session/dice/dice3dAppearanceMaterials.ts', import.meta.url), 'utf8');
const history = fs.readFileSync(new URL('../src/app/components/session/dice/DiceRollHistoryCard.tsx', import.meta.url), 'utf8');

assert.ok(skins.includes('FIRE_TEXTURE_DATA_URL'), '2D Fire must use the supplied photographic texture');
assert.ok(previewArt.includes("case 'fire':\n      return null;"), 'Fire must not overlay old illustrative flame art on the photographic texture');
assert.ok([0, 1, 2, 3].every((index) => fireTextureData.includes(`FIRE_TEXTURE_CHUNK_${index}`)), 'Fire texture data must assemble all high-resolution chunks');
assert.ok(fireChunks.reduce((sum, content) => sum + content.length, 0) > 60_000, 'Fire must use the high-resolution texture rather than the previous tiny compressed preview');
assert.ok(styled.includes('data-dice-outer-glow'), 'Styled dice must render glow from the outer silhouette only');
assert.ok(styled.includes('getReadableDiceSymbolColor'), '2D symbols must automatically preserve contrast over textured faces');
assert.doesNotMatch(styled, /style=\{\{ filter: contrastFilter \}\}/, 'The entire SVG artwork must not receive an internal blur/glow');
assert.ok(styled.includes("appearance.skinId === 'fire' ? '138%' : 'cover'"), 'Small Fire dice must zoom the photographic texture enough to keep cracks legible');
assert.ok(skinSurface.includes("appearance.skinId === 'fire' ? '138%' : 'cover'"), 'Customizer Fire swatches must use the same readable texture crop');
assert.ok(textures.includes('const FIRE_TEXTURE_ZOOM = 1.38'), '3D Fire must use the same 138% photographic crop as the 2D preview');
assert.ok(textures.includes('drawImageCover(context, fireImage, size, FIRE_TEXTURE_ZOOM)'), '3D Fire color texture must keep the readable 138% crop');
assert.ok(textures.includes('drawImageCover(bump, fireImage, size, FIRE_TEXTURE_ZOOM)'), '3D Fire bump texture must use the same crop as the color texture');
assert.ok(textures.includes("context.globalCompositeOperation = 'source-over';\n  context.globalAlpha = 0.34;"), '3D Fire must keep the source-over body-color tint');
assert.ok(appearance.includes('factory.material_options = { ...factory.material_options, color: 0xffffff }'), 'Textured faces must keep a neutral white material color so bodyColor is not multiplied twice');
assert.ok(appearance.includes("if (skinId === 'fire' && !descriptor.custom) preserveFireFaceTexture(material);"), 'Standard Fire faces must use the dedicated photographic-material preservation path');
assert.ok(appearance.includes('material.color?.set?.(0xffffff)'), 'Fire face materials must stay neutral instead of applying bodyColor a second time');
assert.ok(appearance.includes('material.emissiveMap = material.map') && appearance.includes('const FIRE_FACE_EMISSIVE_INTENSITY = 0.18'), 'Fire must retain a restrained texture-derived emissive contribution under Phong lighting');
assert.ok(appearance.includes('const TEXTURED_FACE_ANISOTROPY = 8') && appearance.includes('material.map.anisotropy = Math.max'), 'Fire texture filtering must preserve detail on oblique 3D faces');
assert.ok(appearance.includes('getReadable3DLabelColor'), '3D labels must use automatic contrast correction on textured dice');
assert.ok(appearance.includes('const MIN_TEXTURED_LABEL_CONTRAST = 7'), '3D textured labels must use the stronger contrast target');
assert.ok(appearance.includes("case 'fire': return mixHexColor('#202329', bodyColor, 0.18)"), 'Fire label contrast must be measured against the dark photographic rock surface');
assert.ok(appearance.includes('factory.label_color = labelColor') && appearance.includes('factory.label_color_rand = labelColor'), '3D renderer must apply the corrected readable label color');
assert.ok(history.includes('result.rollerId === user?.id') && history.includes('getStandardAppearance(die.sides)'), 'Local standard-die history entries must follow the current saved appearance');
assert.ok(history.includes(': group.appearance'), 'Remote roll history must retain the roller appearance snapshot');

console.log('High-resolution Fire texture, matched 2D crop, neutral 3D face material, texture-preserving Phong compensation, outer-only glow, live local history style, and strong 3D label contrast verification passed.');
