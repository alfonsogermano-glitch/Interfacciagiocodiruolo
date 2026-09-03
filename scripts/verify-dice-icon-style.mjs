import assert from 'node:assert/strict';
import fs from 'node:fs';

const icon = fs.readFileSync(new URL('../src/app/components/session/dice/DiceTypeIcon.tsx', import.meta.url), 'utf8');
const styled = fs.readFileSync(new URL('../src/app/components/session/dice/StyledStandardDieIcon.tsx', import.meta.url), 'utf8');

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
assert.ok(icon.includes('gap-[3px]'), 'd100 dice must sit close together with a small visible gap');
assert.doesNotMatch(icon, /-ml-\d/, 'd100 dice must not overlap through negative margin');
assert.doesNotMatch(icon, /\bgap-2\b/, 'd100 dice must no longer use the wider 8px gap');

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

assert.ok(styled.includes('DICE_FACE_CLIP_BY_SIDES'), 'styled standard dice must clip the skin to the die silhouette');
assert.ok(styled.includes('data-dice-skin-face'), 'styled standard dice must paint the skin directly on the die face');
assert.doesNotMatch(styled, /overflow-hidden rounded-md border border-black\/15/, 'quick-roll and chat dice must not add an extra framed square around the die');
assert.ok(styled.includes('data-styled-standard-d100'), 'styled d100 must keep a dedicated two-die composition');
assert.ok(styled.includes('overflow-visible'), 'styled d100 must not clip the two percentile dice at the sides');

const effects = fs.readFileSync(new URL('../src/app/components/session/dice/dice3dSkinEffects.ts', import.meta.url), 'utf8');
assert.doesNotMatch(
  effects,
  /material\.emissive\.set\(entry\.descriptor\.appearance\.bodyColor\)/,
  'animated skins must not pulse the entire die emissive color and flash the die white',
);
assert.ok(
  effects.includes("entry.descriptor.preserveFaceColors ? 0.35 : 1") &&
    effects.includes('material.roughness') &&
    effects.includes('material.shininess'),
  'animated skins must use a bounded surface shimmer while keeping uploaded Custom face colors stable',
);
assert.ok(effects.includes('getDice3DSkinEffectProfile'), 'animated skins must use a skin-specific animation profile');
assert.ok(effects.includes('material.emissive.set(profile.emissiveColor)'), 'animated skins must apply a visible skin-specific glow instead of an imperceptible material-only pulse');
assert.ok(effects.includes('baseline.emissiveIntensity'), 'animated skin glow must restore the original emissive intensity after the roll');
assert.ok(effects.includes('baseline.emissiveHex'), 'animated skin glow must restore the original emissive color after the roll');
for (const skin of ['fire', 'ice', 'lightning', 'poison', 'stone', 'metal', 'obsidian', 'arcane']) {
  assert.ok(effects.includes(`case '${skin}'`), `missing animated effect profile for ${skin}`);
}

console.log('Dice supplied SVG color filter, die-shaped skins, unclipped d100, and visible 3D skin effect verification passed.');
