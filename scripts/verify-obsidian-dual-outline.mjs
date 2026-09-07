import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/app/components/session/dice/dice3dAppearanceMaterials.ts', import.meta.url), 'utf8');

assert.ok(source.includes('OBSIDIAN_OUTER_OUTLINE_EXTRA_WIDTH'), 'Obsidian needs a dedicated wider outer outline');
assert.ok(source.includes("descriptor.appearance.skinId === 'obsidian'"), 'dual outline must be limited to Obsidian');
assert.ok(source.includes('obsidianOuterOutlineColor'), 'Obsidian needs an outer outline color opposite to the existing outline');
assert.ok(source.includes('originalStrokeText.call(this, text, x, y'), 'outer outline must be painted into the real face texture before the normal outline');
assert.ok(source.includes('maskContext.strokeStyle = obsidianOuterOutlineColor'), 'outer outline must also be captured in the reflective protection mask');
assert.ok(source.includes('this.lineWidth + OBSIDIAN_OUTER_OUTLINE_EXTRA_WIDTH'), 'outer outline must be wider than the existing outline');
assert.ok(source.includes('this.strokeStyle = previousStrokeStyle'), 'temporary outer outline styling must be restored');

console.log('Obsidian dual-contrast outline verification passed.');
