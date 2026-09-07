import assert from 'node:assert/strict';
import fs from 'node:fs';

const profiles = fs.readFileSync(new URL('../src/app/components/session/dice/dice3dSurfaceProfiles.ts', import.meta.url), 'utf8');
const materials = fs.readFileSync(new URL('../src/app/components/session/dice/dice3dAppearanceMaterials.ts', import.meta.url), 'utf8');

assert.ok(profiles.includes('const OBSIDIAN_LABEL_EMISSIVE_INTENSITY = 0.72;'), 'Obsidian labels must use a controlled emissive lift');
assert.ok(profiles.includes('function createObsidianLabelMask('), 'Obsidian must derive a fill-only emission mask from the rendered face texture');
assert.ok(profiles.includes('const tolerance = 2;'), 'Obsidian label detection must stay exact enough not to brighten photographic highlights');
assert.ok(profiles.includes('function applyObsidianLabelEmission('), 'Obsidian must have a dedicated label-emission helper');
assert.ok(profiles.includes('material.emissive.set(descriptor.appearance.symbolColor);'), 'Obsidian label emission must preserve the exact user-selected symbol color');
assert.ok(profiles.includes('material.emissiveMap = labelMaskTexture;'), 'Obsidian emission must be limited to the label fill mask');
assert.ok(profiles.includes('material.emissiveIntensity = OBSIDIAN_LABEL_EMISSIVE_INTENSITY;'), 'Obsidian label emission must use the controlled intensity');
assert.ok(profiles.includes("if (descriptor.appearance.skinId === 'obsidian') applyObsidianLabelEmission(typedMesh, descriptor);"), 'Every standard Obsidian mesh, including d4 remaps, must receive label emission');
assert.ok(materials.includes("if (descriptor.appearance.skinId === 'obsidian' && diceType === 'd4') return false;"), 'D4 Obsidian must continue bypassing the fragile reflective-label shader');
assert.ok(!profiles.includes("obsidian: 'photo-unlit'"), 'Obsidian photography must remain scene-lit rather than flattening the whole die');

console.log('Obsidian exact-color label emission verification passed.');
