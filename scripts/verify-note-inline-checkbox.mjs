import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { EditorState, TextSelection } from '@tiptap/pm/state';

let feature;
try {
  feature = await import('../src/app/components/session/shared/tiptapInlineCheckbox.ts');
} catch (error) {
  if (error?.code === 'ERR_MODULE_NOT_FOUND' && String(error?.message).includes('tiptapInlineCheckbox')) {
    assert.fail('Inline checkbox feature not implemented yet');
  }
  throw error;
}

const { InlineCheckbox, INLINE_CHECKBOX_CHAR, setInlineCheckboxChecked, isInlineCheckboxSelected } = feature;

assert.equal(INLINE_CHECKBOX_CHAR, '\u200b', 'checkbox must occupy one real text character so Backspace/Delete work natively');
assert.ok(InlineCheckbox, 'InlineCheckbox extension must be exported');
assert.equal(typeof setInlineCheckboxChecked, 'function', 'toggle helper must be exported');
assert.equal(typeof isInlineCheckboxSelected, 'function', 'selection helper must be exported');

const source = await readFile(new URL('../src/app/components/session/shared/tiptapInlineCheckbox.ts', import.meta.url), 'utf8');
assert.match(source, /border:\s*'2px solid var\(--dash-text\)'/, 'checkbox outline must remain 2px and use the active palette text color');
assert.match(source, /border:\s*'solid var\(--dash-text\)'/, 'checked mark must use the active palette text color');
assert.match(source, /borderWidth:\s*'0 0\.12em 0\.12em 0'/, 'checked mark stroke must remain thin for legibility');
assert.match(source, /transform:\s*'translateY\(-0\.04em\) rotate\(45deg\)'/, 'checked mark must receive the approved slight upward optical offset');
assert.doesNotMatch(source, /--dash-success-/, 'standalone checkbox must not use green success palette tokens');
assert.match(source, /userSelect:\s*view\.editable\s*\?\s*'text'\s*:\s*'none'/, 'editable checkbox widget must allow native mouse selection');
assert.match(source, /element\.addEventListener\('mousedown',[\s\S]*if \(view\.editable\) return;[\s\S]*event\.preventDefault\(\)/, 'editable checkbox mousedown must reach ProseMirror while read-only toggle still blocks note activation');
assert.match(source, /boxShadow:\s*selected\s*\?\s*'0 0 0 2px var\(--dash-accent\)'/, 'selected checkbox must receive a palette-aware visible highlight');

const schema = getSchema([
  StarterKit.configure({ heading: false }),
  InlineCheckbox,
]);
const markType = schema.marks.inlineCheckbox;
assert.ok(markType, 'schema must contain inlineCheckbox mark');

assert.equal(markType.create().attrs.checked, false, 'new checkbox must default to unchecked');

const selectionDoc = schema.nodeFromJSON({
  type: 'doc',
  content: [{
    type: 'paragraph',
    content: [
      { type: 'text', text: 'A' },
      { type: 'text', text: INLINE_CHECKBOX_CHAR, marks: [{ type: 'inlineCheckbox', attrs: { checked: true } }] },
      { type: 'text', text: 'B' },
    ],
  }],
});
const selectedState = EditorState.create({
  schema,
  doc: selectionDoc,
  selection: TextSelection.create(selectionDoc, 2, 3),
});
assert.equal(isInlineCheckboxSelected(selectedState, 2), true, 'Shift+Arrow/native text selection must recognize a selected checkbox character');
assert.equal(isInlineCheckboxSelected(selectedState, 1), false, 'selection helper must not highlight an adjacent unselected position');
const selectedSliceJSON = selectedState.selection.content().toJSON();
assert.equal(selectedSliceJSON.content?.[0]?.content?.[0]?.text, INLINE_CHECKBOX_CHAR, 'copy selection must contain the real checkbox character');
assert.equal(selectedSliceJSON.content?.[0]?.content?.[0]?.marks?.[0]?.type, 'inlineCheckbox', 'copy selection must preserve the checkbox mark');
assert.equal(selectedSliceJSON.content?.[0]?.content?.[0]?.marks?.[0]?.attrs?.checked, true, 'copy selection must preserve checked state');

const doc = schema.nodeFromJSON({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: INLINE_CHECKBOX_CHAR.repeat(2),
          marks: [{ type: 'inlineCheckbox', attrs: { checked: false } }],
        },
      ],
    },
  ],
});

let state = EditorState.create({ schema, doc });
setInlineCheckboxChecked(state, (transaction) => {
  state = state.apply(transaction);
}, 2, true);

const runs = [];
state.doc.descendants((node, pos) => {
  if (!node.isText) return;
  const mark = node.marks.find((item) => item.type.name === 'inlineCheckbox');
  if (!mark) return;
  runs.push({ pos, text: node.text, checked: mark.attrs.checked });
});

assert.deepEqual(
  runs,
  [
    { pos: 1, text: INLINE_CHECKBOX_CHAR, checked: false },
    { pos: 2, text: INLINE_CHECKBOX_CHAR, checked: true },
  ],
  'toggling one checkbox in a consecutive run must not affect its neighbors',
);
assert.equal(state.doc.textContent, INLINE_CHECKBOX_CHAR.repeat(2), 'toggle must preserve the underlying text characters');

console.log('Inline checkbox verification: PASS');
