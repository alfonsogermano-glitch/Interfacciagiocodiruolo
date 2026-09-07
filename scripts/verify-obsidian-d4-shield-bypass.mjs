import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/app/components/session/dice/dice3dAppearanceMaterials.ts', import.meta.url), 'utf8');

assert.ok(
  source.includes("function shouldProtectReflectiveDiceLabel(descriptor: Dice3DAppearanceDescriptor, diceType?: string): boolean"),
  'reflective label protection must be decided with knowledge of the dice type',
);
assert.ok(
  source.includes("if (descriptor.appearance.skinId === 'obsidian' && diceType === 'd4') return false;"),
  'standard Obsidian d4 must bypass the reflective shader shield',
);
assert.ok(
  source.includes('protectReflectiveDiceLabelFromLighting(material, descriptor, diceType);'),
  'static material tuning must forward dice type to reflective label protection',
);
assert.ok(
  source.includes('applyStaticSkinToMesh(mesh, descriptor, type);'),
  'initial dice creation must apply static skin tuning with the actual dice type',
);
assert.ok(
  source.includes("applyStaticSkinToMesh(dicemesh, descriptor, 'd4');"),
  'd4 forced-result remap must also stay on the d4-safe material path',
);

console.log('Obsidian d4 reflective-shield bypass verification passed.');
