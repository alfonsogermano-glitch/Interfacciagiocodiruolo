import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(
  new URL('../src/app/components/session/dice/dice3dAppearanceMaterials.ts', import.meta.url),
  'utf8',
);

assert.ok(
  source.includes("const faceColor = appearance.skinId === 'none' ? appearance.bodyColor : '#ffffff';"),
  '3D photographic skins must use a neutral white face base while unskinned dice keep bodyColor',
);
assert.ok(
  source.includes('factory.dice_color = faceColor;') && source.includes('factory.dice_color_rand = faceColor;'),
  '3D face color must use the isolated faceColor value',
);
assert.ok(
  source.includes('factory.edge_color = appearance.bodyColor;') && source.includes('factory.edge_color_rand = appearance.bodyColor;'),
  'bodyColor must continue to control 3D edges when a skin is active',
);
assert.ok(
  source.includes('factory.material_options = { ...factory.material_options, color: 0xffffff };'),
  'material base must remain neutral so photographic textures are not tinted a second time',
);

console.log('3D photographic skin/body-color isolation verification passed.');
