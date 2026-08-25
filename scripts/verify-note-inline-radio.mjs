import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getSchema, Node } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import { EditorState, TextSelection } from '@tiptap/pm/state';

let feature;
try {
  feature = await import('../src/app/components/session/shared/tiptapInlineCheckbox.ts');
} catch (error) {
  if (error?.code === 'ERR_MODULE_NOT_FOUND' && String(error?.message).includes('tiptapInlineCheckbox')) {
    assert.fail('Inline radio feature not implemented yet');
  }
  throw error;
}

const {
  InlineCheckbox,
  InlineRadio,
  INLINE_RADIO_CHAR,
  getInlineRadioGroup,
  isInlineRadioSelected,
  normalizeInlineRadioGroups,
  setInlineRadioChecked,
} = feature;

assert.equal(INLINE_RADIO_CHAR, '\u200b', 'radio must occupy one real text character so Backspace/Delete work natively');
assert.ok(InlineRadio, 'InlineRadio extension must be exported');
assert.equal(typeof getInlineRadioGroup, 'function', 'radio grouping helper must be exported');
assert.equal(typeof isInlineRadioSelected, 'function', 'selection helper must be exported');
assert.equal(typeof normalizeInlineRadioGroups, 'function', 'paste/document normalization helper must be exported');
assert.equal(typeof setInlineRadioChecked, 'function', 'toggle helper must be exported');

const source = await readFile(new URL('../src/app/components/session/shared/tiptapInlineCheckbox.ts', import.meta.url), 'utf8');
const checkboxSource = source;
const commandsSource = await readFile(new URL('../src/app/components/session/shared/noteEditorCommands.ts', import.meta.url), 'utf8');
assert.match(source, /role', 'radio'/, 'radio widget must expose radio semantics');
assert.match(source, /borderRadius:\s*'50%'/, 'radio widget must render as a circle');
assert.match(source, /appendTransaction/, 'radio groups must normalize after pasted/document content changes');
assert.match(source, /userSelect:\s*view\.editable\s*\?\s*'text'\s*:\s*'none'/, 'editable radio widget must allow native mouse selection');
assert.match(source, /if \(view\.editable\) return;[\s\S]*event\.preventDefault\(\)/, 'editable radio mousedown must reach ProseMirror while read-only toggle blocks note activation');
assert.match(checkboxSource, /InlineRadio\.configure\(\{ canToggle: this\.options\.canToggle \}\)/, 'configured checkbox kit must register Radio with the same runtime toggle permission');
assert.match(commandsSource, /id: 'radio'[\s\S]*insertInlineRadio/, 'Note commands must expose Radio button insertion');
assert.match(commandsSource, /case 'radio': return chain\.insertInlineRadio\(\)\.run\(\)/, 'slash command must insert Radio atomically after removing the slash trigger');

const TextBox = Node.create({ name: 'textBox', group: 'block', content: 'block+' });
const CollapseSummary = Node.create({ name: 'collapseSummary', content: 'inline*' });
const CollapseBody = Node.create({ name: 'collapseBody', content: 'block+' });
const CollapseBlock = Node.create({ name: 'collapseBlock', group: 'block', content: 'collapseSummary collapseBody' });

const schema = getSchema([
  StarterKit.configure({ heading: false }),
  TextBox,
  CollapseSummary,
  CollapseBody,
  CollapseBlock,
  TableKit,
  InlineRadio,
]);
const markType = schema.marks.inlineRadio;
assert.ok(markType, 'schema must contain inlineRadio mark');
assert.equal(markType.create().attrs.checked, false, 'new radio must default to unchecked');
const configuredKitSchema = getSchema([StarterKit.configure({ heading: false }), InlineCheckbox]);
assert.ok(configuredKitSchema.marks.inlineRadio, 'registering configured InlineCheckbox kit must also register InlineRadio');

const radio = (checked = false) => ({
  type: 'text',
  text: INLINE_RADIO_CHAR,
  marks: [{ type: 'inlineRadio', attrs: { checked } }],
});
const text = (value) => ({ type: 'text', text: value });
const paragraph = (...content) => ({ type: 'paragraph', content });

function radioPositions(state) {
  const positions = [];
  state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const mark = node.marks.find((item) => item.type.name === 'inlineRadio');
    if (!mark) return;
    for (let offset = 0; offset < node.nodeSize; offset += 1) {
      if (node.text.charAt(offset) !== INLINE_RADIO_CHAR) continue;
      positions.push({ pos: pos + offset, checked: Boolean(mark.attrs.checked) });
    }
  });
  return positions;
}

function applyRadio(state, pos, checked) {
  let next = state;
  const ok = setInlineRadioChecked(state, (transaction) => { next = state.apply(transaction); }, pos, checked);
  assert.equal(ok, true, `radio at ${pos} must be toggleable`);
  return next;
}

// Free Note: radios are independent even when they share the same paragraph.
let freeState = EditorState.create({
  schema,
  doc: schema.nodeFromJSON({ type: 'doc', content: [paragraph(radio(true), text(' '), radio(false))] }),
});
let freeRadios = radioPositions(freeState);
assert.equal(getInlineRadioGroup(freeState, freeRadios[0].pos), null, 'top-level Note radio must have no exclusive group');
freeState = applyRadio(freeState, freeRadios[1].pos, true);
assert.deepEqual(radioPositions(freeState).map((item) => item.checked), [true, true], 'free Note radios must toggle independently');

// TextBox: zero-or-one selected. Selecting a second radio atomically clears the first.
let boxState = EditorState.create({
  schema,
  doc: schema.nodeFromJSON({
    type: 'doc',
    content: [{ type: 'textBox', content: [paragraph(radio(true), text(' '), radio(false))] }],
  }),
});
let boxRadios = radioPositions(boxState);
assert.equal(getInlineRadioGroup(boxState, boxRadios[0].pos)?.type, 'textBox', 'TextBox must be an exclusive radio group');
boxState = applyRadio(boxState, boxRadios[1].pos, true);
assert.deepEqual(radioPositions(boxState).map((item) => item.checked), [false, true], 'selecting a TextBox radio must clear its sibling');
boxRadios = radioPositions(boxState);
boxState = applyRadio(boxState, boxRadios[1].pos, false);
assert.deepEqual(radioPositions(boxState).map((item) => item.checked), [false, false], 'selected radio must be deselectable so a group may contain zero choices');

// Table: each cell is its own group; another cell is never affected.
let tableState = EditorState.create({
  schema,
  doc: schema.nodeFromJSON({
    type: 'doc',
    content: [{
      type: 'table',
      content: [{
        type: 'tableRow',
        content: [
          { type: 'tableCell', content: [paragraph(radio(true), text(' '), radio(false))] },
          { type: 'tableCell', content: [paragraph(radio(true))] },
        ],
      }],
    }],
  }),
});
let tableRadios = radioPositions(tableState);
assert.equal(getInlineRadioGroup(tableState, tableRadios[0].pos)?.type, 'tableCell', 'table radio group must be the nearest cell');
assert.notEqual(getInlineRadioGroup(tableState, tableRadios[0].pos)?.key, getInlineRadioGroup(tableState, tableRadios[2].pos)?.key, 'different cells must have different radio groups');
tableState = applyRadio(tableState, tableRadios[1].pos, true);
assert.deepEqual(radioPositions(tableState).map((item) => item.checked), [false, true, true], 'selecting in one cell must not change another cell');

// Nearest container wins: a TextBox nested in Collapse is independent from Collapse radios.
let nestedState = EditorState.create({
  schema,
  doc: schema.nodeFromJSON({
    type: 'doc',
    content: [{
      type: 'collapseBlock',
      content: [
        { type: 'collapseSummary', content: [radio(true)] },
        { type: 'collapseBody', content: [
          { type: 'textBox', content: [paragraph(radio(true), text(' '), radio(false))] },
          paragraph(radio(false)),
        ] },
      ],
    }],
  }),
});
let nestedRadios = radioPositions(nestedState);
assert.equal(getInlineRadioGroup(nestedState, nestedRadios[0].pos)?.type, 'collapseBlock', 'Collapse summary radio must belong to its Collapse');
assert.equal(getInlineRadioGroup(nestedState, nestedRadios[1].pos)?.type, 'textBox', 'nested TextBox must override outer Collapse grouping');
nestedState = applyRadio(nestedState, nestedRadios[3].pos, true);
assert.deepEqual(radioPositions(nestedState).map((item) => item.checked), [false, true, false, true], 'direct Collapse radio must clear Collapse sibling without touching nested TextBox');

// Normalization after paste/document replacement: in a grouped container the
// checked radio immediately before the post-paste cursor wins. Free radios are untouched.
const invalidDoc = schema.nodeFromJSON({
  type: 'doc',
  content: [
    paragraph(radio(true), text(' '), radio(true)),
    { type: 'textBox', content: [paragraph(radio(true), text('X'), radio(true))] },
  ],
});
const invalidPositions = [];
invalidDoc.descendants((node, pos) => {
  if (!node.isText || !node.text) return;
  const mark = node.marks.find((item) => item.type.name === 'inlineRadio');
  if (!mark) return;
  for (let offset = 0; offset < node.nodeSize; offset += 1) {
    if (node.text.charAt(offset) === INLINE_RADIO_CHAR) invalidPositions.push(pos + offset);
  }
});
const groupedFirst = invalidPositions[2];
const groupedSecond = invalidPositions[3];
const invalidState = EditorState.create({
  schema,
  doc: invalidDoc,
  selection: TextSelection.create(invalidDoc, groupedFirst + 1),
});
const normalizeTr = normalizeInlineRadioGroups(invalidState);
assert.ok(normalizeTr, 'invalid grouped radio state must produce a normalization transaction');
const normalized = invalidState.apply(normalizeTr);
const normalizedRadios = radioPositions(normalized);
assert.deepEqual(normalizedRadios.slice(0, 2).map((item) => item.checked), [true, true], 'free Note radios must survive normalization independently');
assert.deepEqual(normalizedRadios.slice(2).map((item) => item.checked), [true, false], 'group normalization must prefer the checked radio at/before the post-paste cursor');
assert.equal(groupedSecond > groupedFirst, true, 'fixture ordering must be stable');

// Selection/copy parity with checkbox architecture.
const selectedDoc = schema.nodeFromJSON({ type: 'doc', content: [paragraph(text('A'), radio(true), text('B'))] });
const selectedRadioPos = radioPositions(EditorState.create({ schema, doc: selectedDoc }))[0].pos;
const selectedState = EditorState.create({ schema, doc: selectedDoc, selection: TextSelection.create(selectedDoc, selectedRadioPos, selectedRadioPos + 1) });
assert.equal(isInlineRadioSelected(selectedState, selectedRadioPos), true, 'native text selection must recognize selected radio character');
const copied = selectedState.selection.content().toJSON();
const copiedMarkedText = copied.content?.[0]?.content?.find((item) => item.marks?.some((mark) => mark.type === 'inlineRadio'));
assert.equal(copiedMarkedText?.text, INLINE_RADIO_CHAR, 'copy must contain the real radio character');
assert.equal(copiedMarkedText?.marks?.[0]?.attrs?.checked, true, 'copy must preserve radio checked state');

console.log('Inline radio verification: PASS');
