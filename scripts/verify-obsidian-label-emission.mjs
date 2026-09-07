import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/app/components/session/dice/dice3dAppearanceMaterials.ts', import.meta.url), 'utf8');

assert.ok(source.includes('const OBSIDIAN_LABEL_EMISSIVE_INTENSITY = 0.72;'), 'Obsidian labels must use a controlled emissive lift');
assert.ok(source.includes('const obsidianLabelFillMasks = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();'), 'Obsidian must maintain a fill-only label mask');
assert.ok(source.includes("const captureObsidianLabelFill = !descriptor.custom && descriptor.appearance.skinId === 'obsidian';"), 'Obsidian fill-mask capture must be independent from the reflective shield');
assert.ok(source.includes('if (!captureObsidianLabelFill) return;'), 'fillText must capture the Obsidian label even on the d4 shield-bypass path');
assert.ok(source.includes('function applyObsidianLabelEmission('), 'Obsidian must have a dedicated label-emission helper');
assert.ok(source.includes('material.emissive.set(labelColor);'), 'Obsidian label emission must preserve the exact user-selected symbol color');
assert.ok(source.includes('material.emissiveMap = labelMaskTexture;'), 'Obsidian emission must be limited to the label fill mask');
assert.ok(source.includes('material.emissiveIntensity = OBSIDIAN_LABEL_EMISSIVE_INTENSITY;'), 'Obsidian label emission must use the controlled intensity');
assert.ok(source.includes("if (skinId === 'obsidian' && !descriptor.custom) applyObsidianLabelEmission(material, descriptor);"), 'Every Obsidian face material, including d4 remaps, must receive label emission');
assert.ok(source.includes("if (descriptor.appearance.skinId === 'obsidian' && diceType === 'd4') return false;"), 'D4 Obsidian must continue bypassing the fragile reflective-label shader');

console.log('Obsidian exact-color label emission verification passed.');
