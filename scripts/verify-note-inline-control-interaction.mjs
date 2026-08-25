import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

let feature;
try {
  feature = await import('../src/app/components/session/shared/noteInlineRadioInteraction.ts');
} catch (error) {
  if (error?.code === 'ERR_MODULE_NOT_FOUND') {
    assert.fail('Shared inline control interaction guard not implemented yet');
  }
  throw error;
}

const { INLINE_CONTROL_HIT_SLOP, isPointInsideInlineControlHitArea } = feature;
assert.equal(INLINE_CONTROL_HIT_SLOP, 4, 'checkbox and radio hit targets must expand by four pixels around the visible control');
assert.equal(typeof isPointInsideInlineControlHitArea, 'function');

const rect = { left: 100, right: 116, top: 50, bottom: 66 };
assert.equal(isPointInsideInlineControlHitArea(rect, 96, 58), true, 'shared hit area must include four pixels left of the visible control');
assert.equal(isPointInsideInlineControlHitArea(rect, 120, 58), true, 'shared hit area must include four pixels right of the visible control');
assert.equal(isPointInsideInlineControlHitArea(rect, 95, 58), false, 'shared hit area must not swallow text farther than the approved hit slop');

const source = await readFile(new URL('../src/app/components/session/shared/noteInlineRadioInteraction.ts', import.meta.url), 'utf8');
assert.match(source, /\.tiptap-inline-radio-widget/, 'shared interaction guard must include radio widgets');
assert.match(source, /\.tiptap-inline-checkbox-widget/, 'shared interaction guard must include checkbox widgets');
assert.match(source, /addEventListener\('mousedown',[\s\S]*true\)/, 'pointer guard must run in capture phase before ProseMirror positions the cursor');
assert.match(source, /event\.preventDefault\(\)/, 'inline control mousedown must prevent ProseMirror cursor placement');
assert.match(source, /event\.stopPropagation\(\)/, 'inline control mousedown must not bubble into ProseMirror selection handling');
assert.match(source, /control\.click\(\)/, 'clicks in the expanded hit area must activate the real inline control');
assert.match(source, /data-inline-control-hover/, 'expanded hit target must expose one shared visible hover affordance');
assert.match(source, /::after[\s\S]*inset:\s*-4px/, 'hover affordance must visually communicate the enlarged hit area');
assert.match(source, /suppressVirtualClick/, 'virtual hit clicks must suppress the following native text click so the caret does not appear');

console.log('Inline control interaction verification: PASS');
