import assert from 'node:assert/strict';
import fs from 'node:fs';

const icon = fs.readFileSync(new URL('../src/app/components/session/dice/DiceTypeIcon.tsx', import.meta.url), 'utf8');

const userAssets = [
  ['dice-d4.svg', 'd4-4'],
  ['dice-d6.svg', 'd6-6'],
  ['dice-d8.svg', 'd8-8'],
  ['dice-d10.svg', 'd10-10'],
  ['dice-d10-zero.svg', 'd10-0'],
  ['dice-d12.svg', 'd12-12'],
  ['dice-d20.svg', 'd20-20'],
];

assert.ok(icon.includes('<img'), 'quick dice must render the supplied SVG image assets');
assert.doesNotMatch(icon, /<svg\b/, 'DiceTypeIcon must not redraw the supplied dice inline');
assert.ok(icon.includes('data-die-source="user-svg"'), 'quick dice must identify the supplied SVG set as their source');
assert.doesNotMatch(icon, /\.png['"]/, 'quick dice must stop using the generated PNG renders');

for (const [assetName, title] of userAssets) {
  assert.ok(icon.includes(`./assets/${assetName}`), `Missing supplied asset import ${assetName}`);
  const assetUrl = new URL(`../src/app/components/session/dice/assets/${assetName}`, import.meta.url);
  assert.ok(fs.existsSync(assetUrl), `Missing supplied SVG asset ${assetName}`);
  const asset = fs.readFileSync(assetUrl, 'utf8');
  assert.ok(asset.includes(`<title>${title}</title>`), `${assetName} must be the exact supplied ${title} artwork`);
  assert.ok(asset.includes('viewBox="0 0 36 36"'), `${assetName} must preserve the supplied 36x36 viewBox`);
}

assert.ok(icon.includes("if (sides === 100)"), 'd100 must have a dedicated two-die composition');
assert.ok(icon.includes('src={diceD10}'), 'd100 must place the die showing 10 first');
assert.ok(icon.includes('src={diceD10Zero}'), 'd100 must place the die showing 0 second');
assert.ok(icon.indexOf('src={diceD10}') < icon.indexOf('src={diceD10Zero}'), 'd100 must render 10 before 0');
assert.ok(icon.includes('data-die-image="d100"'), 'd100 composition must keep a stable UI hook');

console.log('Dice supplied SVG asset verification passed.');
