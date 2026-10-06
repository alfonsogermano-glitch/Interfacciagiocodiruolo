// Shared JSON fixtures: used both with the model and the real browser schema.
export const NOTE_CASES = [
  'empty', 'text', 'dice', 'modifier', 'points', 'checkbox', 'radio', 'icon',
  'inlineMixed', 'textBox', 'collapseOpen', 'collapseClosed', 'table', 'archive',
  'bulletList', 'taskList', 'image', 'rule',
];
export const p = (...content) => ({ type: 'paragraph', ...(content.length ? { content } : {}) });
export const text = value => ({ type: 'text', text: value });
export function inline(type, id, attrs = {}) {
  return textMark(type, id, attrs);
}
function textMark(type, id, attrs) {
  return { type: 'text', text: '\u200b', marks: [{ type, attrs: { id, ...attrs } }] };
}
export function archive(id = 'a', width = 160) {
  const kinds = ['text', 'text', 'dice', 'checkbox', 'points', 'modifier'];
  return { type: 'archivio', attrs: {
    archiveId: id, title: 'Archivio',
    columns: kinds.map((kind, i) => ({ id: `${id}-c${i}`, label: i ? kind : 'Nome', width })),
    rows: [{ id: `${id}-r`, cells: kinds.map((kind, i) => ({
      id: `${id}-cell${i}`, kind,
      text: kind === 'dice' ? '1d6+2' : kind === 'modifier' ? '3' : kind === 'text' ? (i ? 'Tipo' : 'Arco') : '',
      formula: '', value: 10, max: 10, maxEnabled: true,
      checkboxCount: 3, checkboxHalf: true, checkboxStates: [0, 1, 2],
    })) }],
  } };
}
export function fixture(name, id = name) {
  switch (name) {
    case 'empty': return p();
    case 'text': return p(text('a e\u0301 👩‍👩‍👧‍👦 z'));
    case 'dice': return p(inline('inlineDice', id, { name: 'Dado', formula: '1d6+2' }));
    case 'modifier': return p(inline('inlineModifier', id, { name: `Bonus ${id}`, value: '3', formula: '' }));
    case 'points': return p(inline('inlinePoints', id, { name: 'Punti', value: 10, max: 10 }));
    case 'checkbox': return p(inline('inlineCheckbox', id, { checked: false }));
    case 'radio': return p(inline('inlineRadio', id, { checked: false }));
    case 'icon': return p(inline('inlineIcon', id, { iconName: 'Star' }));
    case 'inlineMixed': return p(text('a '), inline('inlineDice', `${id}-d`, { formula: '1d6' }), text(' '), inline('inlineModifier', `${id}-m`, { name: `Bonus ${id}`, value: '2' }), text(' z'));
    case 'textBox': return { type: 'textBox', content: [p(text('box')), p()] };
    case 'collapseOpen': case 'collapseClosed': return { type: 'collapseBlock', attrs: { open: name === 'collapseOpen' }, content: [
      { type: 'collapseSummary', content: [text('Titolo')] },
      { type: 'collapseBody', content: [p(text('corpo')), p(inline('inlineModifier', `${id}-inner`, { name: `Interno ${id}`, value: '1' }))] },
    ] };
    case 'table': return { type: 'table', content: [{ type: 'tableRow', content: [
      { type: 'tableCell', content: [p(text('cella')), p()] },
      { type: 'tableCell', content: [p(inline('inlineDice', `${id}-cell`, { formula: '1d6' }))] },
    ] }] };
    case 'archive': return archive(id);
    case 'bulletList': return { type: 'bulletList', content: [{ type: 'listItem', content: [p(text('lista'))] }] };
    case 'taskList': return { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [p(text('task'))] }] };
    case 'image': return { type: 'image', attrs: { src: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="24" height="24"%3E%3Crect width="24" height="24" fill="gray"/%3E%3C/svg%3E', alt: 'fixture' } };
    case 'rule': return { type: 'horizontalRule' };
    default: throw new Error(`Unknown fixture ${name}`);
  }
}
export function documentFor(names) {
  return { type: 'doc', content: names.map((name, i) => fixture(name, `${i}-${name}`)) };
}
