import { Mark, mergeAttributes } from '@tiptap/core';
import { DOMSerializer, Fragment, Slice } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import {
  getInlineBoxWidgetAt,
  halveInlineBoxWidget,
  registerInlineBoxWidget,
  showInlineBoxTipAbove,
  unregisterInlineBoxWidget,
} from './tiptapInlineModifier';
import { wrapNoteClipboardHTML, type NoteClipboardSliceJSON } from './tiptapNoteRichClipboard';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    inlinePoints: {
      insertInlinePoints: () => ReturnType;
    };
  }
}

export const INLINE_POINTS_CHAR = '\u200b';
export const POINTS_DEFAULT_NAME = 'Punti';
export const POINTS_DEFAULT_VALUE = 10;
export const POINTS_DEFAULT_MAX = 10;
export const NOTE_POINTS_MENU_EVENT = 'note-inline-points-menu';
export const NOTE_POINTS_RENAME_EVENT = 'note-inline-points-rename';

export interface NotePointsMenuRequest {
  pos: number;
  x: number;
  y: number;
}

export interface PointsData {
  name: string;
  value: number;
  max: number;
  maxEnabled: boolean;
  barVisible: boolean;
  titleVisible: boolean;
}

function createPointsId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `points-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function finiteNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function collectReferenceNames(state: EditorState, excludePos: number | null): Set<string> {
  const names = new Set<string>();
  state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    for (const mark of node.marks) {
      if (mark.type.name !== 'inlineModifier' && mark.type.name !== 'inlinePoints') continue;
      for (let offset = 0; offset < node.nodeSize; offset += 1) {
        if (node.text.charAt(offset) !== INLINE_POINTS_CHAR || pos + offset === excludePos) continue;
        names.add(String(mark.attrs.name ?? (mark.type.name === 'inlinePoints' ? POINTS_DEFAULT_NAME : 'Modificatore')));
      }
    }
  });
  return names;
}

export function getUniquePointsName(state: EditorState, requestedName = POINTS_DEFAULT_NAME, excludePos: number | null = null): string {
  const names = collectReferenceNames(state, excludePos);
  if (!names.has(requestedName)) return requestedName;
  const base = requestedName.replace(/ \(\d+\)$/, '');
  let index = 1;
  while (names.has(`${base} (${index})`)) index += 1;
  return `${base} (${index})`;
}

function getInlinePointsMark(state: EditorState, pos: number) {
  const markType = state.schema.marks.inlinePoints;
  if (!markType || pos < 0 || pos >= state.doc.content.size) return null;
  let found: ReturnType<typeof markType.create> | null = null;
  state.doc.nodesBetween(pos, Math.min(pos + 1, state.doc.content.size), (node, nodePos) => {
    if (found || !node.isText || node.text?.charAt(pos - nodePos) !== INLINE_POINTS_CHAR) return;
    found = node.marks.find((mark) => mark.type === markType) ?? null;
  });
  return found;
}

function adjacentPointsCaret(state: EditorState): { pos: number; side: number } | null {
  if (!state.selection.empty) return null;
  const pos = state.selection.from;
  if (getInlinePointsMark(state, pos)) return { pos, side: -1 };
  if (pos > 0 && getInlinePointsMark(state, pos - 1)) return { pos, side: 1 };
  return null;
}

export function getPointsAt(state: EditorState, pos: number): PointsData | null {
  const mark = getInlinePointsMark(state, pos);
  if (!mark) return null;
  return {
    name: String(mark.attrs.name ?? POINTS_DEFAULT_NAME),
    value: finiteNumber(mark.attrs.value, POINTS_DEFAULT_VALUE),
    max: finiteNumber(mark.attrs.max, POINTS_DEFAULT_MAX),
    maxEnabled: mark.attrs.maxEnabled !== false,
    barVisible: mark.attrs.barVisible !== false,
    titleVisible: mark.attrs.titleVisible !== false,
  };
}

export function setPointsAttrs(
  state: EditorState,
  dispatch: ((transaction: Transaction) => void) | undefined,
  pos: number,
  attrs: Partial<PointsData>,
): boolean {
  const markType = state.schema.marks.inlinePoints;
  const mark = getInlinePointsMark(state, pos);
  if (!markType || !mark) return false;
  const next = {
    ...mark.attrs,
    name: attrs.name === undefined ? mark.attrs.name : getUniquePointsName(state, attrs.name.trim() || POINTS_DEFAULT_NAME, pos),
    value: attrs.value === undefined ? finiteNumber(mark.attrs.value, POINTS_DEFAULT_VALUE) : finiteNumber(attrs.value, POINTS_DEFAULT_VALUE),
    max: attrs.max === undefined ? finiteNumber(mark.attrs.max, POINTS_DEFAULT_MAX) : finiteNumber(attrs.max, POINTS_DEFAULT_MAX),
    maxEnabled: attrs.maxEnabled ?? (mark.attrs.maxEnabled !== false),
    barVisible: attrs.barVisible ?? (mark.attrs.barVisible !== false),
    titleVisible: attrs.titleVisible ?? (mark.attrs.titleVisible !== false),
  };
  if (dispatch) dispatch(state.tr.removeMark(pos, pos + 1, markType).addMark(pos, pos + 1, markType.create(next)));
  return true;
}

export function duplicatePointsAt(state: EditorState, dispatch: ((transaction: Transaction) => void) | undefined, pos: number): boolean {
  const markType = state.schema.marks.inlinePoints;
  const mark = getInlinePointsMark(state, pos);
  if (!markType || !mark) return false;
  if (dispatch) {
    const widget = getInlineBoxWidgetAt(pos);
    if (widget) halveInlineBoxWidget(widget);
    const tr = state.tr.insertText(' ', pos + 1);
    tr.insert(pos + 2, state.schema.text(INLINE_POINTS_CHAR, [markType.create({
      ...mark.attrs,
      id: createPointsId(),
      name: getUniquePointsName(state, String(mark.attrs.name ?? POINTS_DEFAULT_NAME)),
    })]));
    dispatch(tr);
  }
  return true;
}

export function deletePointsAt(state: EditorState, dispatch: ((transaction: Transaction) => void) | undefined, pos: number): boolean {
  if (!getInlinePointsMark(state, pos)) return false;
  if (dispatch) dispatch(state.tr.delete(pos, pos + 1));
  return true;
}

export async function copyPointsToClipboard(view: EditorView, pos: number): Promise<boolean> {
  const mark = getInlinePointsMark(view.state, pos);
  const data = getPointsAt(view.state, pos);
  if (!mark || !data) return false;
  const text = data.maxEnabled ? `${data.name}: ${data.value} / ${data.max}` : `${data.name}: ${data.value}`;
  const markType = view.state.schema.marks.inlinePoints;
  if (markType && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      const fresh = markType.create({ ...mark.attrs, id: createPointsId() });
      const slice = new Slice(Fragment.from(view.state.schema.text(INLINE_POINTS_CHAR, [fresh])), 0, 0);
      const json = slice.toJSON() as NoteClipboardSliceJSON;
      const fragment = DOMSerializer.fromSchema(view.state.schema).serializeFragment(slice.content, { document });
      const div = document.createElement('div');
      div.appendChild(fragment);
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([wrapNoteClipboardHTML(div.innerHTML, json)], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      })]);
      return true;
    } catch { /* textual fallback below */ }
  }
  try { await navigator.clipboard.writeText(text); } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }
  return true;
}

export function isPreviousPoints(state: EditorState, pos: number): boolean {
  return pos > 0 && state.doc.textBetween(pos - 1, pos, '', '') === INLINE_POINTS_CHAR && !!getInlinePointsMark(state, pos - 1);
}

export function makeRoomForInlinePointsText(view: EditorView, pos: number, text: string): boolean {
  const pointPos = getInlinePointsMark(view.state, pos) ? pos : pos > 0 && getInlinePointsMark(view.state, pos - 1) ? pos - 1 : null;
  if (pointPos === null) return false;
  const widget = getInlineBoxWidgetAt(pointPos);
  if (widget) widget.style.width = `${Math.max(64, widget.offsetWidth - Math.max(8, text.length * 8))}px`;
  return true;
}

export function makeRoomForInlinePointsInsertion(state: EditorState, pos: number): void {
  if (!isPreviousPoints(state, pos)) return;
  const widget = getInlineBoxWidgetAt(pos - 1);
  if (widget) halveInlineBoxWidget(widget);
}

function progressColor(value: number, max: number): string {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  if (ratio >= 0.75) return '#22c55e';
  if (ratio >= 0.5) return '#eab308';
  if (ratio >= 0.25) return '#f97316';
  return '#ef4444';
}

function buildPointsWidget(view: EditorView, getPos: () => number | undefined, data: PointsData): HTMLElement {
  const element = document.createElement('span');
  element.className = 'tiptap-inline-points-widget';
  element.dataset.modifierCompact = 'false';
  element.dataset.pointsName = data.name;
  element.dataset.pointsValue = String(data.value);
  element.dataset.pointsMax = String(data.max);
  element.setAttribute('role', 'group');
  element.setAttribute('aria-label', `${data.name}: ${data.value}${data.maxEnabled ? ` su ${data.max}` : ''}`);
  Object.assign(element.style, {
    display: 'inline-flex', flexDirection: 'column', boxSizing: 'border-box', minWidth: '4em',
    gap: '0.5em', padding: data.titleVisible ? '0.6em 0.7em' : '0.45em 1.8em 0.45em 0.45em', verticalAlign: 'middle', border: '1px solid var(--dash-border-soft)',
    borderRadius: '0.7em', background: 'var(--dash-surface-2)', color: 'var(--dash-text)', userSelect: 'none',
    position: 'relative', overflow: 'hidden',
  });

  const header = document.createElement('span');
  Object.assign(header.style, { display: 'flex', alignItems: 'center', minHeight: '1.3em', paddingRight: '1.5em' });
  const label = document.createElement('span');
  label.textContent = data.name;
  label.className = 'tiptap-inline-points-label';
  Object.assign(label.style, { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700, color: 'var(--dash-text-strong)' });
  header.appendChild(label);

  const dots = document.createElement('span');
  dots.className = 'tiptap-inline-points-menu-trigger';
  dots.setAttribute('role', 'button');
  dots.setAttribute('tabindex', '0');
  dots.setAttribute('aria-label', `Menu Punti ${data.name}`);
  Object.assign(dots.style, { position: 'absolute', top: data.titleVisible ? '0.55em' : '50%', right: '0.5em', transform: data.titleVisible ? '' : 'translateY(-50%)', display: 'inline-flex', flexDirection: 'column', gap: '0.12em', padding: '0.25em', borderRadius: '0.3em', cursor: view.editable ? 'pointer' : 'default' });
  for (let index = 0; index < 3; index += 1) {
    const dot = document.createElement('span');
    Object.assign(dot.style, { width: '0.2em', height: '0.2em', borderRadius: '50%', background: 'var(--dash-muted)' });
    dots.appendChild(dot);
  }

  if (data.maxEnabled && data.barVisible) {
    const track = document.createElement('span');
    track.className = 'tiptap-inline-points-progress';
    Object.assign(track.style, { display: 'block', width: '100%', height: '0.5em', borderRadius: '999px', overflow: 'hidden', background: 'var(--dash-surface)' });
    const fill = document.createElement('span');
    const ratio = data.max > 0 ? Math.max(0, Math.min(100, data.value / data.max * 100)) : 0;
    Object.assign(fill.style, { display: 'block', width: `${ratio}%`, height: '100%', background: progressColor(data.value, data.max), transition: 'width 160ms ease, background-color 160ms ease' });
    track.appendChild(fill);
    element.appendChild(track);
  }

  const controls = document.createElement('span');
  Object.assign(controls.style, { display: 'flex', alignItems: 'stretch', gap: '0.45em', width: '100%', minWidth: 0 });
  const button = (kind: 'value' | 'max', labelText: string, delta: number) => {
    const node = document.createElement('button');
    node.type = 'button';
    node.textContent = labelText;
    node.setAttribute('aria-label', `${delta < 0 ? 'Diminuisci' : 'Aumenta'} ${kind === 'value' ? data.name : `massimo ${data.name}`}`);
    Object.assign(node.style, { flex: '0 0 2em', width: '2em', border: 0, background: 'transparent', color: 'var(--dash-muted)', fontSize: '1.05em', lineHeight: 1, cursor: 'pointer' });
    node.addEventListener('mousedown', (event) => {
      if (!view.editable) return;
      event.preventDefault(); event.stopPropagation();
    });
    node.addEventListener('click', (event) => {
      if (!view.editable) return;
      event.preventDefault(); event.stopPropagation();
      const pos = getPos();
      if (typeof pos !== 'number') return;
      const current = getPointsAt(view.state, pos);
      if (current) setPointsAttrs(view.state, (tr) => view.dispatch(tr), pos, { [kind]: current[kind] + delta });
    });
    return node;
  };
  const makeInput = (kind: 'value' | 'max', current: number) => {
    const input = document.createElement('input');
    input.className = 'tiptap-inline-points-input';
    input.type = 'number';
    input.step = 'any';
    input.value = String(current);
    input.setAttribute('aria-label', kind === 'value' ? `Valore ${data.name}` : `Massimo ${data.name}`);
    Object.assign(input.style, { flex: '1 1 0', minWidth: 0, width: '100%', border: 0, borderLeft: '1px solid var(--dash-border-soft)', borderRight: '1px solid var(--dash-border-soft)', borderRadius: 0, outline: 'none', background: 'transparent', color: 'var(--dash-text-strong)', caretColor: 'auto', textAlign: 'center', fontWeight: 700, fontSize: '1em' });
    const save = () => {
      const pos = getPos();
      const parsed = Number(input.value);
      if (typeof pos === 'number' && Number.isFinite(parsed)) setPointsAttrs(view.state, (tr) => view.dispatch(tr), pos, { [kind]: parsed });
      else input.value = String(current);
    };
    input.addEventListener('mousedown', (event) => {
      input.readOnly = !view.editable;
      if (view.editable) event.stopPropagation();
    });
    input.addEventListener('click', (event) => { if (view.editable) event.stopPropagation(); });
    input.addEventListener('beforeinput', (event) => { if (!view.editable) event.preventDefault(); });
    input.addEventListener('keydown', (event) => {
      if (!view.editable) return;
      event.stopPropagation();
      if (event.key === 'Enter') { event.preventDefault(); input.blur(); }
      if (event.key === 'Escape') { event.preventDefault(); input.value = String(current); input.blur(); }
    });
    input.addEventListener('focus', () => view.dom.classList.add('tiptap-points-control-focus'));
    input.addEventListener('blur', () => { view.dom.classList.remove('tiptap-points-control-focus'); save(); });
    return input;
  };

  const makeStepper = (kind: 'value' | 'max', current: number) => {
    const stepper = document.createElement('span');
    stepper.className = 'tiptap-inline-points-stepper';
    Object.assign(stepper.style, { display: 'flex', flex: '1 1 0', minWidth: 0, minHeight: '2.35em', alignItems: 'stretch', overflow: 'hidden', border: '1px solid var(--dash-border-soft)', borderRadius: '0.5em', background: 'var(--dash-surface)' });
    stepper.appendChild(button(kind, '−', -1));
    stepper.appendChild(makeInput(kind, current));
    stepper.appendChild(button(kind, '+', 1));
    return stepper;
  };

  controls.appendChild(makeStepper('value', data.value));
  if (data.maxEnabled) {
    const slash = document.createElement('span');
    slash.textContent = '/';
    Object.assign(slash.style, { display: 'inline-flex', flex: '0 0 auto', alignItems: 'center', color: 'var(--dash-muted)', fontSize: '1.2em', fontWeight: 700 });
    controls.appendChild(slash);
    controls.appendChild(makeStepper('max', data.max));
  }

  const startRename = (pos: number) => {
    if (getPos() !== pos) return;
    const temporaryHeader = !data.titleVisible;
    if (temporaryHeader) element.prepend(header);
    const input = document.createElement('input');
    input.value = label.textContent ?? data.name;
    input.setAttribute('aria-label', 'Nome punti');
    Object.assign(input.style, { width: '100%', minWidth: 0, border: 0, outline: '1px solid var(--dash-accent)', borderRadius: '0.25em', background: 'var(--dash-surface)', color: 'var(--dash-text-strong)', caretColor: 'auto', font: 'inherit', fontWeight: 700 });
    let done = false;
    const finish = (save: boolean) => {
      if (done) return;
      done = true;
      view.dom.classList.remove('tiptap-points-control-focus');
      input.removeEventListener('blur', onBlur);
      const next = save ? input.value.trim() || POINTS_DEFAULT_NAME : data.name;
      label.textContent = next;
      input.replaceWith(label);
      if (temporaryHeader) header.remove();
      const currentPos = getPos();
      if (save && typeof currentPos === 'number') setPointsAttrs(view.state, (tr) => view.dispatch(tr), currentPos, { name: next });
    };
    const onBlur = () => { view.dom.classList.remove('tiptap-points-control-focus'); finish(true); };
    input.addEventListener('mousedown', (event) => event.stopPropagation());
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') { event.preventDefault(); finish(true); view.focus(); }
      if (event.key === 'Escape') { event.preventDefault(); finish(false); view.focus(); }
    });
    input.addEventListener('blur', onBlur);
    input.addEventListener('focus', () => view.dom.classList.add('tiptap-points-control-focus'));
    label.replaceWith(input);
    input.focus(); input.select();
  };
  const onRename = (event: Event) => {
    const detail = (event as CustomEvent<{ pos: number }>).detail;
    if (typeof detail?.pos === 'number') startRename(detail.pos);
  };
  window.addEventListener(NOTE_POINTS_RENAME_EVENT, onRename);

  const openMenu = () => {
    if (!view.editable) return;
    const pos = getPos();
    if (typeof pos !== 'number') return;
    const rect = dots.getBoundingClientRect();
    window.dispatchEvent(new CustomEvent<NotePointsMenuRequest>(NOTE_POINTS_MENU_EVENT, { detail: { pos, x: rect.left, y: rect.bottom } }));
  };
  dots.addEventListener('mousedown', (event) => { if (view.editable) { event.preventDefault(); event.stopPropagation(); } });
  dots.addEventListener('click', (event) => {
    if (!view.editable) {
      const startedAt = performance.now();
      const attempt = () => {
        if (!element.isConnected) return;
        if (view.editable) { openMenu(); return; }
        if (performance.now() - startedAt < 600) window.requestAnimationFrame(attempt);
      };
      window.requestAnimationFrame(attempt);
      return;
    }
    event.preventDefault(); event.stopPropagation(); openMenu();
  });
  dots.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openMenu(); } });

  if (data.titleVisible) element.prepend(header);
  element.appendChild(controls);
  element.appendChild(dots);

  let hideTitleTip: (() => void) | null = null;
  if (!data.titleVisible) {
    const showTitleTip = () => {
      if (!hideTitleTip && element.isConnected) hideTitleTip = showInlineBoxTipAbove(element, data.name);
    };
    const closeTitleTip = () => { hideTitleTip?.(); hideTitleTip = null; };
    element.addEventListener('mouseenter', showTitleTip);
    element.addEventListener('mouseleave', closeTitleTip);
    element.addEventListener('focusin', showTitleTip);
    element.addEventListener('focusout', closeTitleTip);
  }
  registerInlineBoxWidget(element, { view, getPos });
  (element as HTMLElement & { __destroyPointsWidget?: () => void }).__destroyPointsWidget = () => {
    window.removeEventListener(NOTE_POINTS_RENAME_EVENT, onRename);
    view.dom.classList.remove('tiptap-points-control-focus');
    hideTitleTip?.();
    unregisterInlineBoxWidget(element);
  };
  return element;
}

export const InlinePoints = Mark.create({
  name: 'inlinePoints',
  inclusive: false,
  addAttributes() {
    return {
      id: { default: null, parseHTML: (element) => element.getAttribute('data-points-id'), renderHTML: (attrs) => attrs.id ? { 'data-points-id': attrs.id } : {} },
      name: { default: POINTS_DEFAULT_NAME, parseHTML: (element) => element.getAttribute('data-points-name') ?? POINTS_DEFAULT_NAME, renderHTML: (attrs) => ({ 'data-points-name': attrs.name }) },
      value: { default: POINTS_DEFAULT_VALUE, parseHTML: (element) => finiteNumber(element.getAttribute('data-points-value'), POINTS_DEFAULT_VALUE), renderHTML: (attrs) => ({ 'data-points-value': String(attrs.value) }) },
      max: { default: POINTS_DEFAULT_MAX, parseHTML: (element) => finiteNumber(element.getAttribute('data-points-max'), POINTS_DEFAULT_MAX), renderHTML: (attrs) => ({ 'data-points-max': String(attrs.max) }) },
      maxEnabled: { default: true, parseHTML: (element) => element.getAttribute('data-points-max-enabled') !== 'false', renderHTML: (attrs) => ({ 'data-points-max-enabled': attrs.maxEnabled === false ? 'false' : 'true' }) },
      barVisible: { default: true, parseHTML: (element) => element.getAttribute('data-points-bar-visible') !== 'false', renderHTML: (attrs) => ({ 'data-points-bar-visible': attrs.barVisible === false ? 'false' : 'true' }) },
      titleVisible: { default: true, parseHTML: (element) => element.getAttribute('data-points-title-visible') !== 'false', renderHTML: (attrs) => ({ 'data-points-title-visible': attrs.titleVisible === false ? 'false' : 'true' }) },
    };
  },
  parseHTML() { return [{ tag: 'span[data-inline-points]' }]; },
  renderHTML({ HTMLAttributes }) { return ['span', mergeAttributes(HTMLAttributes, { 'data-inline-points': 'true' }), 0]; },
  addCommands() {
    return {
      insertInlinePoints: () => ({ state, dispatch }) => {
        const markType = state.schema.marks[this.name];
        if (!markType) return false;
        if (!dispatch) return true;
        const tr = state.tr.deleteSelection();
        let pos = tr.selection.from;
        if (pos > 0 && tr.doc.textBetween(pos - 1, pos, '', '') === INLINE_POINTS_CHAR) {
          let previousBox = false;
          tr.doc.nodesBetween(pos - 1, pos, (node) => { if (node.isText) previousBox = node.marks.some((mark) => ['inlineModifier', 'inlineDice', 'inlinePoints'].includes(mark.type.name)); });
          if (previousBox) {
            const widget = getInlineBoxWidgetAt(pos - 1);
            if (widget) halveInlineBoxWidget(widget);
            tr.insertText(' ', pos); pos += 1;
          }
        }
        tr.insert(pos, state.schema.text(INLINE_POINTS_CHAR, [markType.create({ id: createPointsId(), name: getUniquePointsName(state), value: POINTS_DEFAULT_VALUE, max: POINTS_DEFAULT_MAX, maxEnabled: true, barVisible: true, titleVisible: true })]));
        tr.setSelection(TextSelection.create(tr.doc, pos + 1));
        dispatch(tr.scrollIntoView());
        return true;
      },
    };
  },
  addProseMirrorPlugins() {
    const nudgeToRightOfTrailingPoints = (view: EditorView, pos: number, event: MouseEvent): boolean => {
      if (event.defaultPrevented || !view.editable || event.button !== 0 || !view.state.selection.empty) return false;
      if (!(event.target instanceof Element) || event.target.closest('.tiptap-inline-points-widget')) return false;
      if (!getInlinePointsMark(view.state, pos)) return false;
      const $pos = view.state.doc.resolve(pos);
      if (!$pos.parent.isTextblock || $pos.parentOffset + 1 !== $pos.parent.content.size) return false;
      if (event.clientX < view.coordsAtPos(pos + 1).left) return false;
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos + 1)));
      return true;
    };

    return [new Plugin({
      key: new PluginKey('inlinePointsWidget'),
      props: {
        decorations(state) {
          const decorations: Decoration[] = [];
          state.doc.descendants((node, pos) => {
            if (!node.isText || !node.text) return;
            const mark = node.marks.find((item) => item.type.name === 'inlinePoints');
            if (!mark) return;
            const data: PointsData = {
              name: String(mark.attrs.name ?? POINTS_DEFAULT_NAME), value: finiteNumber(mark.attrs.value, POINTS_DEFAULT_VALUE),
              max: finiteNumber(mark.attrs.max, POINTS_DEFAULT_MAX), maxEnabled: mark.attrs.maxEnabled !== false, barVisible: mark.attrs.barVisible !== false, titleVisible: mark.attrs.titleVisible !== false,
            };
            for (let offset = 0; offset < node.nodeSize; offset += 1) {
              if (node.text.charAt(offset) !== INLINE_POINTS_CHAR) continue;
              const pointPos = pos + offset;
              decorations.push(Decoration.widget(pointPos, (view, getPos) => buildPointsWidget(view, getPos, data), {
                side: 0,
                key: `points:${mark.attrs.id ?? pointPos}:${data.name}:${data.value}:${data.max}:${data.maxEnabled}:${data.barVisible}:${data.titleVisible}`,
                destroy: (dom) => (dom as HTMLElement & { __destroyPointsWidget?: () => void }).__destroyPointsWidget?.(),
              }));
            }
          });
          const caret = adjacentPointsCaret(state);
          if (caret) {
            decorations.push(Decoration.widget(caret.pos, () => {
              const node = document.createElement('span');
              node.className = 'tiptap-inline-points-caret';
              node.setAttribute('aria-hidden', 'true');
              return node;
            }, { side: caret.side, key: `points-caret:${caret.pos}:${caret.side}` }));
          }
          return DecorationSet.create(state.doc, decorations);
        },
        handleDOMEvents: {
          mousedown(view, event) {
            if (!view.editable || event.button !== 0 || !(event.target instanceof Element) || event.target.closest('.tiptap-inline-points-widget')) return false;
            const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
            if (!coords || !nudgeToRightOfTrailingPoints(view, coords.pos, event)) return false;
            event.preventDefault();
            view.focus();
            return true;
          },
        },
        handleTextInput(view, from, to, text) {
          if (view.editable && from === to) makeRoomForInlinePointsText(view, from, text);
          return false;
        },
        handleClick(view, pos, event) {
          return nudgeToRightOfTrailingPoints(view, pos, event);
        },
      },
      view(view) {
        const sync = () => view.dom.classList.toggle('tiptap-points-adjacent-caret', !!adjacentPointsCaret(view.state));
        sync();
        return {
          update: sync,
          destroy: () => view.dom.classList.remove('tiptap-points-adjacent-caret'),
        };
      },
    })];
  },
});
