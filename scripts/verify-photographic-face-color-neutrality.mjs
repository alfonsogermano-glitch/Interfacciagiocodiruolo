import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const source = fs.readFileSync(new URL('src/app/components/session/dice/dice3dAppearanceMaterials.ts', root), 'utf8');

assert.ok(
  source.includes("const faceColor = !descriptor.custom && appearance.skinId !== 'none' ? '#ffffff' : appearance.bodyColor;"),
  'standard photographic skins must use a neutral white 3D face base while unskinned/custom dice retain bodyColor',
);
assert.ok(source.includes('factory.dice_color = faceColor;'), '3D die face color must use the neutralized faceColor');
assert.ok(source.includes('factory.dice_color_rand = faceColor;'), 'randomized 3D die face color must use the neutralized faceColor');
assert.ok(source.includes('factory.edge_color = appearance.bodyColor;'), 'bodyColor must continue to control 3D edge/seam color');
assert.ok(source.includes('factory.edge_color_rand = appearance.bodyColor;'), 'bodyColor must continue to control randomized 3D edge/seam color');
assert.doesNotMatch(
  source,
  /factory\.dice_color\s*=\s*appearance\.bodyColor;[\s\S]{0,100}factory\.dice_color_rand\s*=\s*appearance\.bodyColor;/,
  'photographic faces must not be directly tinted by bodyColor',
);

for (const skin of ['fire', 'ice', 'lightning', 'poison', 'stone', 'metal', 'obsidian', 'arcane']) {
  assert.ok(source.includes("appearance.skinId !== 'none'"), `${skin} must be covered by the generic non-none skin neutrality rule`);
}

console.log('Photographic 3D face color neutrality verification passed.');
