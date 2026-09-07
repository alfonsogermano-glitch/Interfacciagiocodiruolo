import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/app/components/session/dice/dice3dAppearanceMaterials.ts', import.meta.url), 'utf8');
const d4Start = source.indexOf('box.swapDiceFace_D4 =');
const d4End = source.indexOf('\n  return {', d4Start);
const d4Block = source.slice(d4Start, d4End);

assert.ok(source.includes('materials_cache?: Record<string, unknown>'), 'standard appearance factory must expose the upstream material cache');
assert.ok(source.includes('const originalSetMaterialInfo = factory.setMaterialInfo?.bind(factory);'), 'standard adapter must keep the original material initializer');
assert.ok(d4Block.includes('originalSetMaterialInfo?.();'), 'd4 forced-result remap must rebuild a valid randomized material state before regenerating faces');
assert.ok(d4Block.includes('factory.materials_cache = {};'), 'd4 forced-result remap must invalidate stale material cache before rebuilding faces');
assert.ok(d4Block.indexOf('originalSetMaterialInfo?.();') < d4Block.indexOf('applyAppearanceFactoryState(factory, descriptor);'), 'd4 material initialization must happen before the exact appearance is reapplied');
assert.ok(d4Block.indexOf('factory.materials_cache = {};') < d4Block.indexOf('const swapped = shouldBoostDice3DLabelOutline(descriptor)'), 'd4 material cache must be cleared before upstream face regeneration');
assert.ok(d4Block.includes('applyStaticSkinToMesh(dicemesh, descriptor);'), 'd4 remap must restore static skin material tuning after upstream regeneration');
assert.ok(d4Block.includes('applyDice3DSurfaceProfile(dicemesh, descriptor);'), 'd4 remap must restore the configured surface profile after upstream regeneration');

console.log('Obsidian standard d4 forced-result material remap verification passed.');
