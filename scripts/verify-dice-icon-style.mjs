import assert from 'node:assert/strict';
import fs from 'node:fs';

const icon = fs.readFileSync(new URL('../src/app/components/session/dice/DiceTypeIcon.tsx', import.meta.url), 'utf8');
const styled = fs.readFileSync(new URL('../src/app/components/session/dice/StyledStandardDieIcon.tsx', import.meta.url), 'utf8');
const appearance = fs.readFileSync(new URL('../src/app/components/session/dice/dice3dAppearanceMaterials.ts', import.meta.url), 'utf8');
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
assert.ok(icon.includes('DICE_FILTER_BY_SIDES'), 'quick dice must define a distinct color filter by die type');
assert.ok(icon.includes('style={{ filter:'), 'quick dice must apply their assigned color filter to the supplied SVG image');
for (const sides of [4, 6, 8, 10, 12, 20]) {
  assert.ok(icon.includes(`${sides}: 'brightness(0) saturate(100%)`), `Missing distinct color filter for d${sides}`);
}

for (const [assetName, title] of userAssets) {
  assert.ok(icon.includes(`./assets/${assetName}`), `Missing supplied asset import ${assetName}`);
  const assetUrl = new URL(`../src/app/components/session/dice/assets/${assetName}`, import.meta.url);
  assert.ok(fs.existsSync(assetUrl), `Missing supplied SVG asset ${assetName}`);
  const asset = fs.readFileSync(assetUrl, 'utf8');
  assert.ok(asset.includes(`<title>${title}</title>`), `${assetName} must preserve the supplied ${title} artwork`);
  assert.ok(asset.includes('viewBox="0 0 36 36"'), `${assetName} must preserve the supplied 36x36 viewBox`);
}

assert.ok(icon.includes("if (sides === 100)"), 'd100 must have a dedicated two-die composition');
assert.ok(icon.includes('src={diceD10}'), 'd100 must place the die showing 10 first');
assert.ok(icon.includes('src={diceD10Zero}'), 'd100 must place the die showing 0 second');
assert.ok(icon.indexOf('src={diceD10}') < icon.indexOf('src={diceD10Zero}'), 'd100 must render 10 before 0');
assert.ok(icon.includes('data-die-image="d100"'), 'd100 composition must keep a stable UI hook');
assert.ok(icon.includes('gap-[4px]'), 'd100 dice must keep a small explicit gap');
assert.ok(icon.includes("const d100ChildClassName = 'h-full min-h-0 min-w-0 w-[calc(50%_-_2px)] flex-none'"), 'each d100 child must own an explicit half-width instead of competing through intrinsic flex sizing');
assert.doesNotMatch(icon, /source=\{diceD10Raw\}[^\n]*className="[^"]*flex-1/, 'personalized d100 children must not use intrinsic flex-1 sizing');
assert.doesNotMatch(icon, /-ml-\d/, 'd100 dice must not overlap through negative margin');

const standardFilterEntries = [...icon.matchAll(/\s(4|6|8|10|12|20): '([^']+)'/g)];
const standardFilters = new Set(standardFilterEntries.map((match) => match[2]));
const d100Filters = icon.match(/const D100_FILTERS = \{[\s\S]*?ten: '([^']+)'[\s\S]*?zero: '([^']+)'/);
assert.ok(d100Filters, 'd100 must define two dedicated color filters');
const [, d100TenFilter, d100ZeroFilter] = d100Filters;
assert.notEqual(d100TenFilter, d100ZeroFilter, 'the two d100 dice must use different colors');
assert.ok(!standardFilters.has(d100TenFilter), 'd100 ten die color must be unique from every standard die');
assert.ok(!standardFilters.has(d100ZeroFilter), 'd100 zero die color must be unique from every standard die');
assert.ok(icon.includes('style={{ filter: D100_FILTERS.ten }}'), 'd100 ten die must use its dedicated color');
assert.ok(icon.includes('style={{ filter: D100_FILTERS.zero }}'), 'd100 zero die must use its dedicated color');

assert.ok(icon.includes('.svg?raw'), 'personalized dice must use the supplied SVG artwork as raw source for exact recoloring');
assert.ok(icon.includes('tintedSvgDataUrl'), 'personalized dice must build a colored SVG image instead of relying on CSS masking');
assert.ok(icon.includes('data-die-colored-image'), 'personalized dice must expose a stable regression hook');
assert.doesNotMatch(icon, /\b(?:WebkitMaskImage|maskImage)\b/, 'personalized dice must not degrade into solid rectangles when CSS masks fail');

assert.doesNotMatch(styled, /DICE_FACE_CLIP_BY_SIDES|clipPath\s*[,}]/, 'styled dice must not return to approximate CSS clip-path silhouettes');
assert.ok(styled.includes('DICE_SILHOUETTE_PATHS'), 'styled standard dice must use SVG-viewBox silhouette paths that scale with the supplied artwork');
assert.ok(styled.includes('<clipPath'), 'styled standard dice must clip the skin inside SVG coordinates');
assert.ok(styled.includes('<foreignObject'), 'styled standard dice must keep the existing skin background generator inside the exact SVG silhouette');
assert.ok(styled.includes('data-dice-skin-surface'), 'styled standard dice must expose a stable exact-surface hook');
assert.doesNotMatch(styled, /overflow-hidden rounded-md border border-black\/15/, 'quick-roll and chat dice must not add an extra framed square around the die');
assert.ok(styled.includes('data-styled-standard-d100'), 'styled d100 must keep a dedicated two-die composition');
assert.ok(styled.includes("const d100SurfaceClassName = 'h-full min-w-0 w-[calc(50%_-_2px)] flex-none'"), 'd100 skin surfaces must use the same explicit half-width as their SVG overlays');
assert.ok(styled.includes('gap-[4px]'), 'd100 skin surfaces and SVG overlays must share the same gap');
assert.ok(styled.includes('overflow-visible'), 'styled d100 and standard dice must not clip their SVG artwork at the sides');

assert.ok(appearance.includes('readableOutlineColor'), '3D labels must receive an automatic contrasting outline');
assert.ok(appearance.includes('factory.label_outline = outlineColor') && appearance.includes('factory.label_outline_rand = outlineColor'), 'standard 3D numbers must use the contrasting outline');
assert.ok(appearance.includes('const isEdgeMaterial = materialIndex === 0'), 'static skin material changes must distinguish edge material from face materials');
assert.doesNotMatch(appearance, /for \(const material of materialsOf\(mesh as MeshLike\)\)/, 'static skin styling must not apply the same strength to every face material');

assert.doesNotMatch(
  effects,
  /material\.emissive\.set\(entry\.descriptor\.appearance\.bodyColor\)/,
  'animated skins must not pulse the entire die emissive color and flash the die white',
);
assert.ok(effects.includes("import * as THREE from 'three'"), '3D skin effects must use the Three.js runtime already used by dice-box');
assert.ok(effects.includes('new THREE.Points'), '3D skin effects must include visible particle fields');
assert.ok(effects.includes('new THREE.LineSegments'), 'Lightning must include visible bolt geometry instead of only emissive flicker');
assert.ok(effects.includes('new THREE.TorusGeometry'), 'Arcane must keep its visible orbiting ring geometry');
const orbitingRingCalls = effects.match(/addOrbitingTorus\(group/g) ?? [];
assert.equal(orbitingRingCalls.length, 1, 'only Arcane may create an orbiting torus around the die');
assert.ok(effects.includes("if (profile.arcaneRing) {\n    addOrbitingTorus(group"), 'the single orbiting ring must remain gated by the Arcane profile');
assert.ok(effects.includes('new THREE.OctahedronGeometry'), 'Ice must include visible crystalline geometry');
assert.ok(effects.includes('new THREE.SphereGeometry'), 'Poison must include visible bubble geometry');
assert.ok(effects.includes('new THREE.TetrahedronGeometry'), 'Stone must include visible fragment geometry');
assert.ok(effects.includes('private particleBudget = 144'), '3D effects must enforce a stronger but bounded per-roll particle budget');
assert.ok(effects.includes('const isEdgeMaterial = materialIndex === 0'), 'animated material pulses must distinguish the edge from readable face materials');
assert.ok(effects.includes('const faceMaterialFactor = entry.descriptor.preserveFaceColors ? 0 : 0.06'), 'animated face-material changes must be strongly suppressed to preserve content readability');
assert.ok(effects.includes('lightningBolts: 5'), 'Lightning must use a visibly stronger bolt profile');
assert.ok(effects.includes('baseline.emissiveIntensity'), 'animated skin glow must restore the original emissive intensity after the roll');
assert.ok(effects.includes('baseline.emissiveHex'), 'animated skin glow must restore the original emissive color after the roll');

assert.ok(textures.includes('const TEXTURE_SIZE = 512'), '3D skin textures must use a higher-resolution deterministic canvas');
assert.ok(textures.includes('bumpCanvas') && textures.includes('bump: bumpCanvas'), '3D skins must supply bump information to dice-box');
assert.doesNotMatch(textures, /appearance\.skinId === 'metal' \? 'metal' : 'none'/, 'Metal must not switch dice-box to the black-prone MeshStandard metal preset');
assert.ok(textures.includes("material: 'none'"), 'Metal must keep the neutral color-preserving material path');
for (const skin of ['fire', 'ice', 'lightning', 'poison', 'stone', 'metal', 'obsidian', 'arcane']) {
  assert.ok(effects.includes(`case '${skin}'`), `missing animated effect profile for ${skin}`);
  assert.ok(textures.includes(`case '${skin}'`), `missing strengthened static texture for ${skin}`);
}

console.log('Dice d100 sizing, face readability, Arcane-only rings, color-preserving metal, and stronger 3D effects verification passed.');
