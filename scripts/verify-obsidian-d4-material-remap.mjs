import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/app/components/session/dice/dice3dAppearanceMaterials.ts', import.meta.url), 'utf8');

assert.ok(source.includes('materials_cache?: Record<string, unknown>'), 'standard appearance factory must expose the upstream material cache');
assert.ok(source.includes('const originalSetMaterialInfo = factory.setMaterialInfo?.bind(factory);'), 'standard adapter must keep the original material initializer');
assert.ok(source.includes('originalSetMaterialInfo?.();'), 'd4 forced-result remap must rebuild a valid randomized material state before regenerating faces');
assert.ok(source.includes('factory.materials_cache = {};'), 'd4 forced-result remap must invalidate stale material cache before rebuilding faces');
assert.ok(source.indexOf('originalSetMaterialInfo?.();') < source.indexOf('applyAppearanceFactoryState(factory, descriptor);', source.indexOf('box.swapDiceFace_D4 =')), 'd4 material initialization must happen before the exact appearance is reapplied');
assert.ok(source.indexOf('factory.materials_cache = {};', source.indexOf('box.swapDiceFace_D4 =')) < source.indexOf('previousSwapD4.call(box, dicemesh, result)', source.indexOf('box.swapDiceFace_D4 =')), 'd4 material cache must be cleared before upstream face regeneration');
assert.ok(source.includes('applyStaticSkinToMesh(dicemesh, descriptor);'), 'd4 remap must restore static skin material tuning after upstream regeneration');
assert.ok(source.includes('applyDice3DSurfaceProfile(dicemesh, descriptor);'), 'd4 remap must restore the configured surface profile after upstream regeneration');

console.log('Obsidian standard d4 forced-result material remap verification passed.');
