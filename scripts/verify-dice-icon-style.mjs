import assert from 'node:assert/strict';
import fs from 'node:fs';

const icon = fs.readFileSync(new URL('../src/app/components/session/dice/DiceTypeIcon.tsx', import.meta.url), 'utf8');
const diceSides = [4, 6, 8, 10, 12, 20, 100];
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

assert.ok(icon.includes('<img'), 'quick dice must render dedicated image assets');
assert.doesNotMatch(icon, /<svg\b/, 'DiceTypeIcon must not draw inline geometry');
assert.ok(icon.includes('DICE_IMAGE_BY_SIDES'), 'DiceTypeIcon must map every die type to a dedicated rendered asset');
assert.ok(icon.includes('data-die-image'), 'dice images must expose a stable UI hook');
assert.ok(icon.includes('data-die-render="realistic-3d"'), 'dice assets must use the realistic 3D render treatment');
assert.ok(icon.includes('data-die-numbered="true"'), 'realistic dice renders must visibly include face numbers');
assert.doesNotMatch(icon, /\.svg['"]/, 'realistic dice renders must replace the previous flat SVG icon assets');

for (const sides of diceSides) {
  const assetName = `dice-d${sides}.png`;
  assert.ok(icon.includes(`./assets/${assetName}`), `Missing rendered image import for d${sides}`);

  const assetUrl = new URL(`../src/app/components/session/dice/assets/${assetName}`, import.meta.url);
  assert.ok(fs.existsSync(assetUrl), `Missing rendered image asset ${assetName}`);

  const asset = fs.readFileSync(assetUrl);
  assert.ok(asset.subarray(0, 8).equals(pngSignature), `${assetName} must be a real PNG render`);
  assert.ok(asset.length > 2000, `${assetName} must contain a substantive rendered image, not a placeholder`);

  const width = asset.readUInt32BE(16);
  const height = asset.readUInt32BE(20);
  const colorType = asset[25];
  const hasTransparency = colorType === 4 || colorType === 6 || (colorType === 3 && asset.includes(Buffer.from('tRNS')));
  assert.ok(width >= 96 && height >= 96, `${assetName} must be at least 2x the rendered toolbar size for crisp display`);
  assert.ok(hasTransparency, `${assetName} must preserve transparency around the rendered die`);
}

console.log('Dice realistic render asset verification passed.');
