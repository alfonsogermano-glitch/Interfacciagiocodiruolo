import assert from 'node:assert/strict';
import { getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { EditorState } from '@tiptap/pm/state';

let feature;
try {
  feature = await import('../src/app/components/session/shared/tiptapInlineCheckbox.ts');
} catch (error) {
  if (error?.code === 'ERR_MODULE_NOT_FOUND' && String(error?.message).includes('tiptapInlineCheckbox')) {
    assert.fail('Inline checkbox feature not implemented yet');
  }
  throw error;
}

const { InlineCheckbox, INLINE_CHECKBOX_CHAR, setInlineCheckboxChecked } = feature;

assert.equal(INLINE_CHECKBOX_CHAR, '\u200b', 'checkbox must occupy one real text character so Backspace/Delete work natively');
assert.ok(InlineCheckbox, 'InlineCheckbox extension must be exported');
assert.equal(typeof setInlineCheckboxChecked, 'function', 'toggle helper must be exported');

const schema = getSchema([
  StarterKit.configure({ heading: false }),
  InlineCheckbox,
]);
const markType = schema.marks.inlineCheckbox;
assert.ok(markType, 'schema must contain inlineCheckbox mark');
assert.equal(markType.create().attrs.checked, false, 'new checkbox must default to unchecked');

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
