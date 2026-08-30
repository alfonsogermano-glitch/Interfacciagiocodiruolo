import assert from 'node:assert/strict';
import fs from 'node:fs';

const icon = fs.readFileSync(new URL('../src/app/components/session/dice/DiceTypeIcon.tsx', import.meta.url), 'utf8');

const diceAssets = [
  [4, '#ef4444'],
  [6, '#3b82f6'],
  [8, '#22c55e'],
  [10, '#8b5cf6'],
  [12, '#f97316'],
  [20, '#eab308'],
  [100, '#94a3b8'],
];

assert.ok(icon.includes('<img'), 'quick dice must render dedicated image assets instead of hand-drawn inline geometry');
assert.doesNotMatch(icon, /<svg\b/, 'DiceTypeIcon must no longer draw inline SVG geometry');
assert.ok(icon.includes('DICE_IMAGE_BY_SIDES'), 'DiceTypeIcon must map every die type to a dedicated image asset');
assert.ok(icon.includes('data-die-image'), 'dice images must expose a stable UI hook');

for (const [sides, color] of diceAssets) {
  const assetName = `dice-d${sides}.svg`;
  assert.ok(icon.includes(`./assets/${assetName}`), `Missing image import for d${sides}`);
  const assetUrl = new URL(`../src/app/components/session/dice/assets/${assetName}`, import.meta.url);
  assert.ok(fs.existsSync(assetUrl), `Missing image asset ${assetName}`);
  const asset = fs.readFileSync(assetUrl, 'utf8');
  assert.match(asset, /<svg\b/, `${assetName} must be a standalone SVG image`);
  assert.ok(asset.includes(color), `${assetName} must keep its dedicated die color ${color}`);
  assert.ok(asset.includes('Pictogrammers'), `${assetName} must retain source attribution`);
}

const percentileAsset = fs.readFileSync(new URL('../src/app/components/session/dice/assets/dice-d100.svg', import.meta.url), 'utf8');
assert.ok((percentileAsset.match(/<path\b/g) ?? []).length >= 2, 'd100 image must visibly combine two percentile dice');

console.log('Dice image asset verification passed.');
