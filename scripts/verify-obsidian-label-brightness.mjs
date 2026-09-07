import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/app/components/session/dice/dice3dAppearanceMaterials.ts', import.meta.url), 'utf8');

assert.ok(source.includes('const OBSIDIAN_LABEL_EMISSIVE_INTENSITY ='), 'Obsidian label brightness must use a dedicated controlled emissive intensity');
assert.ok(source.includes('function applyObsidianLabelEmission'), 'Obsidian must build a label-only emissive layer instead of brightening the whole photograph');
assert.ok(source.includes('destination-in'), 'Obsidian label emissive texture must be clipped to the captured label/outline mask');
assert.ok(source.includes('material.emissiveMap = emissiveTexture;'), 'Obsidian must feed the label-only texture through emissiveMap');
assert.ok(source.includes('material.emissive?.set?.(0xffffff)'), 'Obsidian label emission must preserve the original user-selected label colors');
assert.ok(source.includes("if (descriptor.appearance.skinId !== 'obsidian' || descriptor.custom) return;"), 'Label emission must remain scoped to standard Obsidian dice');
assert.ok(source.includes('applyObsidianLabelEmission(material, descriptor);'), 'Obsidian face materials must receive label-only emission');
assert.ok(source.includes("if (descriptor.appearance.skinId === 'obsidian' && diceType === 'd4') return false;"), 'D4 Obsidian must continue bypassing the unstable reflective shader');

console.log('Obsidian label brightness verification passed.');
