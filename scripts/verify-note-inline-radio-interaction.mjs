import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const feature = await import('../src/app/components/session/shared/noteInlineRadioInteraction.ts');
const { INLINE_CONTROL_HIT_SLOP, isPointInsideInlineControlHitArea } = feature;
assert.equal(INLINE_CONTROL_HIT_SLOP, 4, 'radio hit target must keep the approved four-pixel expansion');
assert.equal(typeof isPointInsideInlineControlHitArea, 'function');

const source = await readFile(new URL('../src/app/components/session/shared/noteInlineRadioInteraction.ts', import.meta.url), 'utf8');
assert.match(source, /\.tiptap-inline-radio-widget/, 'shared inline interaction guard must still include radio widgets');
assert.match(source, /addEventListener\('mousedown',[\s\S]*true\)/, 'radio pointer guard must still run before ProseMirror cursor placement');
assert.match(source, /event\.preventDefault\(\)/, 'radio mousedown must still prevent caret placement');
assert.match(source, /control\.click\(\)/, 'expanded radio hit area must still activate the real control');
assert.match(source, /data-inline-control-hover/, 'radio must use the shared hover affordance');

console.log('Inline radio interaction verification: PASS');
