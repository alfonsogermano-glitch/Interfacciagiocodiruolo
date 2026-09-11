import { Mark, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    inlineModifier: {
      /** Inserisce un Modificatore alla posizione del cursore. */
      insertInlineModifier: () => ReturnType;
    };
  }
}

// Stessa architettura delle icone/checkbox/radio inline: il documento
// contiene un vero singolo carattere ZWSP marcato, mentre la grafica è una
// Decoration.widget. Per ProseMirror è quindi un carattere di testo normale:
// frecce, Backspace, selezione e clipboard restano native e il cursore può
// muoversi prima e dopo l'elemento senza alcun Node atom da gestire a mano.
export const INLINE_MODIFIER_CHAR = '\u200b';

export const MODIFIER_DEFAULT_NAME = 'Modificatore';
export const MODIFIER_DEFAULT_VALUE = '0';

// Il widget DOM è separato dalla Decoration: qui sotto viene descritta la
// continuazione della storia. La nota visiva più importante riguarda la
// larghezza - vedi buildModifierWidget e stretchWidgetToLineEnd.
export const MODIFIER_WIDGET_SELECTOR = '.tiptap-inline-modifier-widget';

// Bridge vanilla-DOM -> React per il menu contestuale: il widget è creato da
// ProseMirror (non da React) e i tre puntini non possono fare una setState.
// Il click sui puntini dispatcha questo evento CustomEvent su window; il
// componente React <NoteModifierMenu> lo ascolta e renderizza il menu.
export const NOTE_MODIFIER_MENU_EVENT = 'note-inline-modifier-menu';

export interface NoteModifierMenuRequest {
  /** Posizione del carattere ZWSP (inizio del Modificatore). */
  pos: number;
  /** Coordinate del punto di ancoraggio del menu (pixel viewport). */
  x: number;
  y: number;
}

export interface ModifierData {
  name: string;
  value: string;
}

function createModifierId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `modifier-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function getUniqueModifierName(state: EditorState, requestedName = MODIFIER_DEFAULT_NAME, excludePos: number | null = null): string {
  const markType = state.schema.marks.inlineModifier;
  if (!markType) return requestedName;

  const names = new Set<string>();
  state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const mark = node.marks.find((item) => item.type === markType);
    if (!mark) return;

    for (let offset = 0; offset < node.nodeSize; offset++) {
      if (node.text.charAt(offset) !== INLINE_MODIFIER_CHAR) continue;
      if (excludePos !== null && pos + offset === excludePos) continue;
      names.add(String(mark.attrs.name ?? MODIFIER_DEFAULT_NAME));
    }
  });

  if (!names.has(requestedName)) return requestedName;
  const base = requestedName.replace(/ \(\d+\)$/, '');
  let index = 1;
  while (names.has(`${base} (${index})`)) index += 1;
  return `${base} (${index})`;
}

function getInlineModifierMark(state: EditorState, pos: number) {
  const markType = state.schema.marks.inlineModifier;
  if (!markType || pos < 0 || pos >= state.doc.content.size) return null;

  let found: ReturnType<typeof markType.create> | null = null;
  state.doc.nodesBetween(pos, Math.min(pos + 1, state.doc.content.size), (node, nodePos) => {
    if (found || !node.isText) return;
    const offset = pos - nodePos;
    if (offset < 0 || offset >= node.nodeSize) return;
    if (node.text?.charAt(offset) !== INLINE_MODIFIER_CHAR) return;
    found = node.marks.find((mark) => mark.type === markType) ?? null;
  });
  return found;
}

/** Legge i dati correnti del Modificatore nella posizione data. */
export function getModifierAt(state: EditorState, pos: number): ModifierData | null {
  const mark = getInlineModifierMark(state, pos);
  if (!mark) return null;
  return {
    name: String(mark.attrs.name ?? MODIFIER_DEFAULT_NAME),
    value: String(mark.attrs.value ?? MODIFIER_DEFAULT_VALUE),
  };
}

/** Sostituisce gli attributi di UN solo Modificatore. Il range è sempre un
 * solo carattere: i Modificatori vicini (anche fusi nello stesso text node)
 * non vengono toccati. */
export function setModifierAttrs(
  state: EditorState,
  dispatch: ((transaction: Transaction) => void) | undefined,
  pos: number,
  attrs: Partial<ModifierData>,
): boolean {
  const markType = state.schema.marks.inlineModifier;
  const currentMark = getInlineModifierMark(state, pos);
  if (!markType || !currentMark) return false;

  const next = {
    id: currentMark.attrs.id,
    name: attrs.name !== undefined
      ? getUniqueModifierName(state, attrs.name, pos)
      : currentMark.attrs.name ?? MODIFIER_DEFAULT_NAME,
    value: attrs.value ?? currentMark.attrs.value ?? MODIFIER_DEFAULT_VALUE,
  };
  if (dispatch) {
    dispatch(
      state.tr
        .removeMark(pos, pos + 1, markType)
        .addMark(pos, pos + 1, markType.create(next)),
    );
  }
  return true;
}

/** Riduci: decrementa di un'unità il valore numerico. I valori non numerici
 * restano invariati. */
export function reduceModifierAt(
  state: EditorState,
  dispatch: ((transaction: Transaction) => void) | undefined,
  pos: number,
): boolean {
  const data = getModifierAt(state, pos);
  if (!data) return false;
  const numeric = Number.parseFloat(data.value);
  if (Number.isNaN(numeric)) return false;
  const reduced = Number((numeric - 1).toFixed(10));
  return setModifierAttrs(state, dispatch, pos, { value: String(reduced) });
}

/** Duplica: inserisce una copia identica subito dopo l'originale. */
export function duplicateModifierAt(
  state: EditorState,
  dispatch: ((transaction: Transaction) => void) | undefined,
  pos: number,
): boolean {
  const markType = state.schema.marks.inlineModifier;
  const currentMark = getInlineModifierMark(state, pos);
  if (!markType || !currentMark) return false;
  if (dispatch) {
    dispatch(state.tr.insert(pos + 1, state.schema.text(INLINE_MODIFIER_CHAR, [markType.create({
      ...currentMark.attrs,
      id: createModifierId(),
      name: getUniqueModifierName(state, String(currentMark.attrs.name ?? MODIFIER_DEFAULT_NAME)),
    })])));
  }
  return true;
}

/** Elimina il Modificatore (cancella il carattere ZWSP marcato). */
export function deleteModifierAt(
  state: EditorState,
  dispatch: ((transaction: Transaction) => void) | undefined,
  pos: number,
): boolean {
  const currentMark = getInlineModifierMark(state, pos);
  if (!currentMark) return false;
  if (dispatch) dispatch(state.tr.delete(pos, pos + 1));
  return true;
}

/** Copia in clipboard la rappresentazione testuale del Modificatore. */
export async function copyModifierToClipboard(state: EditorState, pos: number): Promise<boolean> {
  const data = getModifierAt(state, pos);
  if (!data) return false;
  const text = `${data.name}: ${data.value}`;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback per ambienti senza Permissions API (iframe sandbox).
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }
  return true;
}

// ---------------------------------------------------------------------------
// Coordinated line measurement.
//
// Each widget registers in `widgetEntries`.  A single `performMeasurement`
// function groups widgets by block paragraph, then by visual line, sorts by
// document position, sizes modifiers when widgets are created/rebuilt:
//
//  • Single modifier  → fills the line, leaving a real CURSOR_ROOM after it
//    and a small END_INSERTION_ROOM after the caret.
//  • Multiple modifiers → all widgets on the same visual line split the
//    available line width equally. The visual gap is real document text, not
//    widget margin, so caret position and insertion point stay in sync when a
//    modifier wraps to the next line.
// ---------------------------------------------------------------------------

const CHAR_WIDTH = 8;
const CURSOR_ROOM = CHAR_WIDTH;
const END_INSERTION_ROOM = CHAR_WIDTH * 2;
const MIN_GAP = CHAR_WIDTH;
const MIN_MODIFIER_WIDTH = 64;

interface WidgetEntry {
  view: EditorView;
  getPos: () => number | undefined;
}

const widgetEntries = new Map<HTMLElement, WidgetEntry>();

let measureRaf = 0;

function scheduleMeasure() {
  if (measureRaf) return;
  measureRaf = window.requestAnimationFrame(() => {
    measureRaf = 0;
    performMeasurement();
  });
}

function performMeasurement() {
  const groups = new Map<HTMLElement, Array<{ element: HTMLElement } & WidgetEntry>>();

  for (const [element, entry] of widgetEntries) {
    if (!element.isConnected) continue;
    const blockParent = element.closest('.ProseMirror > *') as HTMLElement | null;
    if (!blockParent) continue;
    if (!groups.has(blockParent)) groups.set(blockParent, []);
    groups.get(blockParent)!.push({ element, ...entry });
  }

  for (const [blockParent, items] of groups) {
    items.sort((a, b) => (a.getPos() ?? 0) - (b.getPos() ?? 0));

    const blockRect = blockParent.getBoundingClientRect();
    const lineRight = blockRect.right;
    const lineGroups: Array<Array<{ element: HTMLElement } & WidgetEntry>> = [];

    for (const item of items) {
      const top = item.element.getBoundingClientRect().top;
      const line = lineGroups.find((group) => Math.abs(group[0].element.getBoundingClientRect().top - top) < 2);
      if (line) line.push(item);
      else lineGroups.push([item]);
    }

    for (const lineItems of lineGroups) {
      measureLine(lineItems, lineRight);
    }
  }
}

function measureLine(items: Array<{ element: HTMLElement } & WidgetEntry>, lineRight: number) {
  if (items.length === 1) {
    const lineLeft = items[0].element.getBoundingClientRect().left;
    const target = Math.max(0, lineRight - lineLeft - CURSOR_ROOM - END_INSERTION_ROOM);
    items[0].element.style.marginRight = `${CURSOR_ROOM}px`;
    if (Math.abs(target - items[0].element.offsetWidth) > 1) {
      items[0].element.style.width = `${target}px`;
    }
    return;
  }

  const lineLeft = items[0].element.getBoundingClientRect().left;
  const totalGap = MIN_GAP * (items.length - 1);
  const available = Math.max(0, lineRight - lineLeft - CURSOR_ROOM - END_INSERTION_ROOM - totalGap);
  const width = Math.max(0, available / items.length);

  for (let i = 0; i < items.length; i++) {
    items[i].element.style.marginLeft = '0px';
    items[i].element.style.marginRight = i === items.length - 1 ? `${CURSOR_ROOM}px` : '0px';
    if (Math.abs(width - items[i].element.offsetWidth) > 1) {
      items[i].element.style.width = `${width}px`;
    }
  }
}

function getModifierWidgetAt(pos: number): HTMLElement | null {
  for (const [element, entry] of widgetEntries) {
    if (!element.isConnected) continue;
    if (entry.getPos() === pos) return element;
  }
  return null;
}

function makeRoomNearModifier(pos: number, delta: number): void {
  const widget = getModifierWidgetAt(pos);
  if (!widget) return;
  widget.style.width = `${Math.max(0, widget.offsetWidth - delta)}px`;
}

export function makeRoomForInlineModifierText(view: EditorView, pos: number, text: string): boolean {
  const delta = Math.max(CHAR_WIDTH, text.length * CHAR_WIDTH);
  if (getInlineModifierMark(view.state, pos)) {
    makeRoomNearModifier(pos, delta);
    return true;
  }
  if (pos > 0 && getInlineModifierMark(view.state, pos - 1)) {
    makeRoomNearModifier(pos - 1, delta);
    return true;
  }
  return false;
}

function makeRoomForInlineModifierInsertion(state: EditorState, pos: number): void {
  if (pos <= 0 || !getInlineModifierMark(state, pos - 1)) return;
  const widget = getModifierWidgetAt(pos - 1);
  if (!widget) return;
  widget.style.width = `${Math.max(MIN_MODIFIER_WIDTH, (widget.offsetWidth - MIN_GAP) / 2)}px`;
}

function buildModifierWidget(
  view: EditorView,
  getPos: () => number | undefined,
  name: string,
  value: string,
): HTMLElement {
  const element = document.createElement('span');
  element.className = 'tiptap-inline-modifier-widget';
  element.dataset.modifierName = name;
  element.dataset.modifierValue = value;
  element.setAttribute('role', 'group');
  element.setAttribute('aria-label', `Modificatore ${name}: ${value}`);

  Object.assign(element.style, {
    display: 'inline-flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
    minWidth: '4em',
    minHeight: '2.5em',
    padding: '0.2em 0.5em',
    verticalAlign: 'middle',
    border: '1px solid var(--dash-border-soft)',
    borderRadius: '0.45em',
    background: 'var(--dash-surface-2)',
    color: 'var(--dash-text)',
    userSelect: 'none',
    position: 'relative',
  });

  const head = document.createElement('span');
  Object.assign(head.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '0.35em',
    width: '100%',
    lineHeight: 1,
  });

  const label = document.createElement('span');
  label.className = 'tiptap-inline-modifier-label';
  label.textContent = name;
  Object.assign(label.style, {
    flex: '0 1 auto',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.72em',
    fontWeight: 600,
    letterSpacing: '0.04em',
    color: 'var(--dash-text-strong)',
    textTransform: 'uppercase',
  });

  const dots = document.createElement('span');
  dots.className = 'tiptap-inline-modifier-menu-trigger';
  dots.setAttribute('role', 'button');
  dots.setAttribute('tabindex', '0');
  dots.setAttribute('aria-label', `Menu Modificatore ${name}`);
  Object.assign(dots.style, {
    display: 'inline-flex',
    position: 'absolute',
    top: '0.32em',
    right: '0.32em',
    zIndex: 1,
    flex: 'none',
    alignItems: 'center',
    flexDirection: 'column',
    gap: '0.11em',
    padding: '0.22em',
    borderRadius: '0.3em',
    opacity: 0,
    transition: 'opacity 120ms ease',
    cursor: view.editable ? 'pointer' : 'default',
  });
  for (let i = 0; i < 3; i += 1) {
    const dot = document.createElement('span');
    Object.assign(dot.style, {
      width: '0.15em',
      height: '0.15em',
      borderRadius: '50%',
      background: 'var(--dash-muted)',
      pointerEvents: 'none',
    });
    dots.appendChild(dot);
  }

  const valueEl = document.createElement('span');
  valueEl.className = 'tiptap-inline-modifier-value';
  valueEl.textContent = value;
  Object.assign(valueEl.style, {
    width: '100%',
    textAlign: 'center',
    fontSize: '0.95em',
    fontWeight: 600,
    lineHeight: 1.4,
    marginTop: '0.1em',
    color: 'var(--dash-text)',
  });

  head.appendChild(label);
  element.appendChild(head);
  element.appendChild(valueEl);
  element.appendChild(dots);

  element.addEventListener('mouseenter', () => { dots.style.opacity = '1'; });
  element.addEventListener('mouseleave', () => { if (document.activeElement !== dots) dots.style.opacity = '0'; });
  dots.addEventListener('focus', () => { dots.style.opacity = '1'; });
  dots.addEventListener('blur', () => { dots.style.opacity = '0'; });

  // Apre il men&ugrave; React dispatchando un CustomEvent. Il mousedown sui
  // puntini viene bloccato: niente move del caret, niente rimbalzi di
  // selezione quando si apre il menu.
  const openMenu = () => {
    if (!view.editable) return;
    const pos = getPos();
    if (typeof pos !== 'number') return;
    const rect = dots.getBoundingClientRect();
    window.dispatchEvent(
      new CustomEvent<NoteModifierMenuRequest>(NOTE_MODIFIER_MENU_EVENT, {
        detail: { pos, x: rect.left, y: rect.bottom },
      }),
    );
  };
  dots.addEventListener('mousedown', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  dots.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    openMenu();
  });
  dots.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    openMenu();
  });

  // Registra nel catalogo globale per la misura coordinata delle righe.
  // La teardown viene gestita da spec.destroy che rimuove l'entry.
  const entry: WidgetEntry = { view, getPos };
  widgetEntries.set(element, entry);
  scheduleMeasure();
  return element;
}

export const InlineModifier = Mark.create({
  name: 'inlineModifier',
  // inclusive:false: il testo digitato dopo un Modificatore non deve ereditare
  // il mark (stessa meccanica di grassetto/corsivo a fine selezione, come per
  // icone e checkbox).
  inclusive: false,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-modifier-id'),
        renderHTML: (attributes) => (attributes.id ? { 'data-modifier-id': attributes.id } : {}),
      },
      name: {
        default: MODIFIER_DEFAULT_NAME,
        parseHTML: (element) => element.getAttribute('data-modifier-name') ?? MODIFIER_DEFAULT_NAME,
        renderHTML: (attributes) => ({ 'data-modifier-name': attributes.name }),
      },
      value: {
        default: MODIFIER_DEFAULT_VALUE,
        parseHTML: (element) => element.getAttribute('data-modifier-value') ?? MODIFIER_DEFAULT_VALUE,
        renderHTML: (attributes) => ({ 'data-modifier-value': attributes.value }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-inline-modifier]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-inline-modifier': 'true' }), 0];
  },

  addCommands() {
    return {
      insertInlineModifier:
        () =>
        ({ state, dispatch }) => {
          const markType = state.schema.marks[this.name];
          if (!markType) return false;
          if (!dispatch) return true;

          const tr = state.tr.deleteSelection();
          let insertPos = tr.selection.from;
          let previousIsModifier = false;
          if (insertPos > 0 && tr.doc.textBetween(insertPos - 1, insertPos, '', '') === INLINE_MODIFIER_CHAR) {
            tr.doc.nodesBetween(insertPos - 1, insertPos, (node) => {
              if (previousIsModifier || !node.isText) return;
              previousIsModifier = node.marks.some((mark) => mark.type === markType);
            });
          }

          if (previousIsModifier) {
            makeRoomForInlineModifierInsertion(state, insertPos);
            tr.insertText(' ', insertPos);
            insertPos += 1;
          }

          tr.insert(insertPos, state.schema.text(INLINE_MODIFIER_CHAR, [markType.create({
            id: createModifierId(),
            name: getUniqueModifierName(state),
            value: MODIFIER_DEFAULT_VALUE,
          })]));
          tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
          dispatch(tr.scrollIntoView());
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const markName = this.name;

    // Stesso ritocco di selezione delle icone inline, per il caso d'angolo in
    // cui il Modificatore è l'ULTIMO carattere del blocco: un click appena a
    // destra del box viene mappato da Chromium tra il widget e il ZWSP e
    // ProseMirror lo risolve come posizione PRIMA del widget (sinistra), col
    // caret che "rimbalza". Le frecce raggiungono la posizione corretta P+1:
    // qui la si replica sul mousedown (prima del caret nativo, senza flicker)
    // con handleClick come rete di sicurezza. Guardie volutamente strette.
    const nudgeToRightOfTrailingModifier = (view: EditorView, pos: number, event: MouseEvent): boolean => {
      if (event.defaultPrevented || !view.editable) return false;
      if (event.button !== 0) return false;
      if (!view.state.selection.empty) return false;
      if (!(event.target instanceof Element)) return false;
      if (event.target.closest(MODIFIER_WIDGET_SELECTOR)) return false;
      const markType = view.state.schema.marks.inlineModifier;
      if (!markType || view.state.doc.textBetween(pos, pos + 1) !== INLINE_MODIFIER_CHAR) return false;
      let hasModifierMark = false;
      view.state.doc.nodesBetween(pos, pos + 1, (node) => {
        if (node.isText && node.text === INLINE_MODIFIER_CHAR) hasModifierMark = node.marks.some((mark) => mark.type === markType);
      });
      if (!hasModifierMark) return false;
      const $pos = view.state.doc.resolve(pos);
      if (!$pos.parent.isTextblock) return false;
      if ($pos.parentOffset + 1 !== $pos.parent.content.size) return false;
      if (event.clientX < view.coordsAtPos(pos + 1).left) return false;
      if (view.state.selection.from === pos + 1) return true;
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos + 1)));
      return true;
    };

    return [
      new Plugin({
        key: new PluginKey('inlineModifierWidget'),
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return;
              const mark = node.marks.find((item) => item.type.name === markName);
              if (!mark) return;

              const name = String(mark.attrs.name ?? MODIFIER_DEFAULT_NAME);
              const value = String(mark.attrs.value ?? MODIFIER_DEFAULT_VALUE);
              const id = typeof mark.attrs.id === 'string' && mark.attrs.id ? mark.attrs.id : null;
              for (let offset = 0; offset < node.nodeSize; offset++) {
                if (node.text.charAt(offset) !== INLINE_MODIFIER_CHAR) continue;
                const modifierPos = pos + offset;
                decorations.push(
                  Decoration.widget(
                    modifierPos,
                    (view, getPos) => buildModifierWidget(view, getPos, name, value),
                    {
                      side: 0,
                      // Il key include nome e valore: cambiandoli il widget
                      // viene ricostruito a vista (ProseMirror confronta i
                      // widget via spec.key) senza ricostruirlo a ogni
                      // cambio di sola selezione.
                      key: `modifier:${id ?? modifierPos}:${name}:${value}`,
                      destroy: (node) => {
                        widgetEntries.delete(node as HTMLElement);
                      },
                    },
                  ),
                );
              }
            });
            return DecorationSet.create(state.doc, decorations);
          },
          // handleDOMEvents.mousedown "istruisce" il caret prima del rendering
          // nativo (vedi commento sopra il helper) e handleClick e' solo la
          // rete di sicurezza per i percorsi che non passano dal nostro
          // mousedown.
          handleDOMEvents: {
            mousedown(view, event) {
              if (!view.editable || event.button !== 0) return false;
              if (!(event.target instanceof Element)) return false;
              if (event.target.closest(MODIFIER_WIDGET_SELECTOR)) return false;
              const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
              if (!coords) return false;
              if (nudgeToRightOfTrailingModifier(view, coords.pos, event)) {
                event.preventDefault();
                view.focus();
                return true;
              }
              return false;
            },
          },
          handleTextInput(view, from, to, text) {
            if (!view.editable || from !== to || !view.state.selection.empty) return false;
            if (!makeRoomForInlineModifierText(view, from, text)) return false;
            return false;
          },
          handleClick(view, pos, event) {
            return nudgeToRightOfTrailingModifier(view, pos, event);
          },
        },
        view() {
          window.addEventListener('resize', scheduleMeasure);
          scheduleMeasure();
          return {
            destroy() {
              window.removeEventListener('resize', scheduleMeasure);
              widgetEntries.clear();
            },
          };
        },
      }),
    ];
  },
});
