import assert from 'node:assert/strict';
import fs from 'node:fs';

const icon = fs.readFileSync(new URL('../src/app/components/session/dice/DiceTypeIcon.tsx', import.meta.url), 'utf8');
const styled = fs.readFileSync(new URL('../src/app/components/session/dice/StyledStandardDieIcon.tsx', import.meta.url), 'utf8');
const customizer = fs.readFileSync(new URL('../src/app/components/session/dice/DiceAppearanceCustomizer.tsx', import.meta.url), 'utf8');
const skinSurface = fs.readFileSync(new URL('../src/app/components/session/dice/DiceSkinSurface.tsx', import.meta.url), 'utf8');
const previewArt = fs.readFileSync(new URL('../src/app/components/session/dice/DiceSkinPreviewArt.tsx', import.meta.url), 'utf8');
const skins = fs.readFileSync(new URL('../src/app/components/session/dice/diceSkins.ts', import.meta.url), 'utf8');
const textureScale = fs.readFileSync(new URL('../src/app/components/session/dice/diceTextureScale.ts', import.meta.url), 'utf8');
const fireTextureData = fs.readFileSync(new URL('../src/app/components/session/dice/fireTextureData.ts', import.meta.url), 'utf8');
const appearance = fs.readFileSync(new URL('../src/app/components/session/dice/dice3dAppearanceMaterials.ts', import.meta.url), 'utf8');
const projection = fs.readFileSync(new URL('../src/app/components/session/dice/dice3dProjection.ts', import.meta.url), 'utf8');
const effects = fs.readFileSync(new URL('../src/app/components/session/dice/dice3dSkinEffects.ts', import.meta.url), 'utf8');
const textures = fs.readFileSync(new URL('../src/app/components/session/dice/dice3dSkinTextures.ts', import.meta.url), 'utf8');

const userAssets = [
  ['dice-d4.svg', 'd4-4'],
  ['dice-d6.svg', 'd6-6'],
  ['dice-d8.svg', 'd8-8'],
  ['dice-d10.svg', 'd10-10'],
  ['dice-d10-zero.svg', 'd10-0'],
  ['dice-d12.svg', 'd12-12'],
  ['dice-d20.svg', 'd20-20'],
];

assert.ok(icon.includes('<img'), 'quick dice must continue rendering the supplied SVG image assets');
assert.doesNotMatch(icon, /<svg\b/, 'DiceTypeIcon must not redraw the supplied dice inline');
assert.ok(icon.includes('data-die-source="user-svg"'), 'quick dice must identify the supplied SVG set as their source');
assert.doesNotMatch(icon, /\.png['"]/, 'quick dice must stop using generated PNG renders');
assert.ok(icon.includes('DICE_FILTER_BY_SIDES'), 'quick dice must retain distinct default colors when no personalization exists');
assert.ok(icon.includes('.svg?raw'), 'personalized dice must use the supplied SVG artwork as raw source for exact recoloring');
assert.ok(icon.includes('tintedSvgDataUrl'), 'personalized dice must retain single-color SVG rendering for non-textured dice');
assert.ok(icon.includes('twoToneSvgDataUrl'), 'textured dice must support separate structure and label colors');
assert.ok(icon.includes('data-die-two-tone-image'), 'two-tone textured dice must expose a stable rendering hook');
assert.ok(icon.includes('feMorphology') && icon.includes('operator="erode"') && icon.includes('radius="0.18"'), 'textured die structure must be thinned without shrinking the central number');
assert.doesNotMatch(icon, /\b(?:WebkitMaskImage|maskImage)\b/, 'personalized dice must not return to fragile CSS masks');

for (const [assetName, title] of userAssets) {
  assert.ok(icon.includes(`./assets/${assetName}`), `Missing supplied asset import ${assetName}`);
  const assetUrl = new URL(`../src/app/components/session/dice/assets/${assetName}`, import.meta.url);
  assert.ok(fs.existsSync(assetUrl), `Missing supplied SVG asset ${assetName}`);
  const asset = fs.readFileSync(assetUrl, 'utf8');
  assert.ok(asset.includes(`<title>${title}</title>`), `${assetName} must preserve the supplied ${title} artwork`);
  assert.ok(asset.includes('viewBox="0 0 36 36"'), `${assetName} must preserve the supplied 36x36 viewBox`);
}

assert.ok(icon.includes("const d100ChildClassName = 'h-full aspect-square min-h-0 min-w-0 shrink-0'"), 'd100 must keep two independent square d10 faces');
assert.ok(icon.includes('src={diceD10}') && icon.includes('src={diceD10Zero}'), 'd100 must keep the supplied 10 and 0 faces');
assert.ok(icon.indexOf('src={diceD10}') < icon.indexOf('src={diceD10Zero}'), 'd100 must render 10 before 0');
assert.ok(icon.includes('gap-[4px]'), 'd100 must keep a small explicit gap');
assert.doesNotMatch(icon, /-ml-\d/, 'd100 dice must never overlap through negative margin');

assert.doesNotMatch(styled, /DICE_FACE_CLIP_BY_SIDES|clipPath\s*[,}]/, 'styled dice must not return to approximate CSS clip-path silhouettes');
assert.ok(styled.includes('DICE_SILHOUETTE_PATHS'), 'styled dice must use the exact SVG-viewBox silhouettes');
assert.ok(styled.includes('<clipPath'), 'skin layers must stay inside the exact die silhouette');
assert.ok(styled.includes('DiceSkinPreviewArt'), 'styled dice must support illustrative skin art');
assert.ok(styled.includes("className === 'h-9 w-9' || className === 'h-9 w-14'"), 'quick-roll sizes must automatically enable illustrative skin art');
assert.ok(styled.includes('structureColor={textured ? appearance.bodyColor : undefined}'), 'textured dice structure must use the selected die body color');
assert.ok(styled.includes('labelColor={textured ? readableSymbolColor : undefined}'), 'central die numbers must keep an independent high-contrast color');
assert.ok(styled.includes('thinStructure={textured}'), 'only textured dice must use the thinner structure treatment');
assert.ok(styled.includes('h-[84%] aspect-square'), 'd100 percentile faces must stay square in every layout');
assert.ok(styled.includes('data-styled-standard-d100'), 'styled d100 must keep its dedicated two-face composition');
assert.ok(styled.includes('overflow-visible'), 'styled d100 and standard dice must not clip artwork at the sides');
assert.ok(styled.includes('getDiceTextureBackgroundSize(appearance.textureScale)'), 'main dice previews must use the saved texture zoom');

assert.ok(customizer.includes('StyledStandardDieIcon'), 'Customizer main preview must use the same exact die renderer as quick-roll');
assert.ok(customizer.includes("selected.sides === 100 ? 'h-24 w-44' : 'h-24 w-24'"), 'Customizer d100 preview must have a dedicated wide layout');
assert.ok(customizer.includes('data-dice-appearance-main-preview'), 'Customizer must expose a stable main preview hook');
assert.ok(customizer.includes('illustrative'), 'Customizer skin cards must use illustrative swatches');
assert.ok(customizer.includes('data-dice-appearance-texture-scale'), 'Customizer must expose the 100-200% texture zoom control');
assert.ok(customizer.indexOf('data-dice-appearance-texture-scale') < customizer.indexOf('data-dice-appearance-apply-all'), 'Texture zoom control must sit above Apply to all');
assert.ok(customizer.includes('textureScale: selected.textureScale'), 'Apply to all must copy the selected texture zoom');
assert.ok(skinSurface.includes('illustrative?: boolean'), 'Skin swatches must support illustrative preview art');
assert.ok(skinSurface.includes('DiceSkinPreviewArt'), 'Skin swatches must use the shared illustrative art renderer');
assert.ok(skinSurface.includes('getDiceTextureBackgroundSize(appearance.textureScale)'), 'Skin swatches must react live to the same texture zoom');
assert.ok(textureScale.includes('MIN_DICE_TEXTURE_SCALE = 100') && textureScale.includes('MAX_DICE_TEXTURE_SCALE = 200') && textureScale.includes('DEFAULT_DICE_TEXTURE_SCALE = 138'), 'Texture zoom must use the approved 100-200% range with 138% compatibility default');

for (const skin of ['fire', 'ice', 'lightning', 'poison', 'stone', 'metal', 'obsidian', 'arcane']) {
  assert.ok(effects.includes(`case '${skin}'`), `missing animated effect profile for ${skin}`);
  assert.ok(textures.includes(`case '${skin}'`), `missing strengthened static texture for ${skin}`);
}
for (const skin of ['ice', 'lightning', 'poison', 'stone', 'metal', 'obsidian', 'arcane']) {
  assert.ok(previewArt.includes(`data-dice-skin-preview-art="${skin}"`), `Missing illustrative 2D preview art for ${skin}`);
}
assert.ok(previewArt.includes("case 'fire':\n      return null;"), 'Fire must not overlay the old illustrative art on its photographic texture');
assert.ok(previewArt.includes("mix(bodyColor, '#ffffff'") && previewArt.includes("mix(bodyColor, '#000000'"), 'Illustrative art must derive light and dark tones from the chosen die color');

assert.ok(fireTextureData.includes("data:image/webp;base64,"), 'Fire skin must embed the supplied rock/lava texture');
assert.ok(skins.includes("FIRE_TEXTURE_DATA_URL"), '2D fire skin must import the supplied rock/lava texture');
assert.ok(skins.includes('url("${FIRE_TEXTURE_DATA_URL}")'), '2D fire skin must render the supplied image in menus and previews');
assert.ok(textures.includes("FIRE_TEXTURE_DATA_URL"), '3D fire skin must import the same supplied texture');
assert.doesNotMatch(textures, /FIRE_TEXTURE_ZOOM/, '3D Fire must not retain a separate hardcoded crop');
assert.ok(textures.includes('normalizeDiceTextureScale(appearance.textureScale)'), '3D textures must use the saved user zoom');
assert.ok(textures.includes('applyTextureZoom(context, bump, size, textureScale)'), '3D color and bump textures must receive the same zoom');
assert.ok(textures.includes('drawImageCover(context, fireImage, size)'), '3D fire skin must paint the supplied texture through the shared zoom transform');
assert.ok(textures.includes("context.globalCompositeOperation = 'source-over';\n  context.globalAlpha = 0.34;"), '3D fire tint must match the source-over 2D preview tint');
assert.doesNotMatch(textures, /globalCompositeOperation = 'color'[\s\S]{0,80}globalAlpha = 0\.46/, '3D fire must not use the old mismatched color blend');
assert.ok(textures.includes('drawImageCover(bump, fireImage, size)'), '3D fire skin must derive bump detail from the supplied texture using the shared zoom');
assert.ok(textures.includes('`${appearance.skinId}:${appearance.bodyColor}:${textureScale}`'), '3D texture cache must keep different zoom values independent');

assert.ok(appearance.includes('getReadable3DLabelColor'), '3D standard labels must automatically preserve contrast on textured faces');
assert.ok(appearance.includes('MIN_TEXTURED_LABEL_CONTRAST'), 'Textured 3D labels must enforce a minimum contrast target');
assert.ok(appearance.includes('factory.label_color = labelColor') && appearance.includes('factory.label_color_rand = labelColor'), '3D standard labels must use the readable corrected color');
assert.ok(appearance.includes('factory.label_outline = outlineColor') && appearance.includes('factory.label_outline_rand = outlineColor'), '3D standard labels must apply the contrasting outline');
assert.ok(appearance.includes("if (!descriptor.custom && appearance.skinId !== 'metal')"), 'Custom dice must keep a neutral face texture so skin patterns cannot obscure text, icons, or images');
assert.ok(projection.includes('custom: true') && projection.includes('preserveFaceColors: true'), 'Every Custom die must preserve face colors while skin effects animate');
assert.ok(appearance.includes('const isEdgeMaterial = materialIndex === 0'), 'Static 3D skin material changes must stay on edge material rather than readable face materials');
assert.ok(appearance.includes('factory.material_options = { ...factory.material_options, color: 0xffffff }'), 'Textured 3D faces must keep a neutral material color to prevent bodyColor double multiplication');
assert.ok(appearance.includes('material.color?.set?.(0xffffff)'), 'Fire face materials must remain neutral after dice-box creates the MeshPhong materials');
assert.ok(appearance.includes('material.emissiveMap = material.map') && appearance.includes('const FIRE_FACE_EMISSIVE_INTENSITY = 0.18'), 'Fire faces must preserve photographic brightness with a restrained texture-derived emissive contribution');
assert.ok(appearance.includes('const TEXTURED_FACE_ANISOTROPY = 8') && appearance.includes('material.map.anisotropy = Math.max'), 'Fire face maps must use bounded anisotropic filtering for oblique detail');

assert.doesNotMatch(
  effects,
  /material\.emissive\.set\(entry\.descriptor\.appearance\.bodyColor\)/,
  'animated skins must not pulse the entire die body color and flash the die white',
);
assert.ok(effects.includes('new THREE.Points'), '3D skin effects must include visible particle fields');
assert.ok(effects.includes('new THREE.LineSegments'), 'Lightning must include visible bolt geometry');
assert.ok(effects.includes('new THREE.TorusGeometry'), 'Arcane must keep its visible orbiting ring geometry');
const orbitingRingCalls = effects.match(/addOrbitingTorus\(group/g) ?? [];
assert.equal(orbitingRingCalls.length, 1, 'only Arcane may create an orbiting torus around the die');
assert.ok(effects.includes("if (profile.arcaneRing) {\n    addOrbitingTorus(group"), 'the single orbiting ring must remain gated by Arcane');
assert.ok(effects.includes('const faceMaterialFactor = entry.descriptor.preserveFaceColors ? 0 : 0.06'), 'Custom face-material animation must be fully suppressed for readability');
assert.ok(effects.includes('private particleBudget = 144'), '3D effects must retain a bounded particle budget');

assert.ok(textures.includes('const TEXTURE_SIZE = 512'), '3D skin textures must use the higher-resolution deterministic canvas');
assert.ok(textures.includes('bumpCanvas') && textures.includes('bump: bumpCanvas'), '3D skins must retain bump information');
assert.doesNotMatch(textures, /appearance\.skinId === 'metal' \? 'metal' : 'none'/, 'Metal must not return to the black-prone MeshStandard metal preset');
assert.ok(textures.includes("material: 'none'"), 'Metal must keep the neutral color-preserving material path');

console.log('Dice exact shapes, thin body-colored structure, high-contrast labels, shared 100-200% texture zoom, coherent Fire texture previews and 3D material fidelity, Arcane-only rings, and 3D skin verification passed.');
