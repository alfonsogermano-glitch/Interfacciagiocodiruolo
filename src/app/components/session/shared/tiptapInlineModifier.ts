import { Mark, mergeAttributes } from '@tiptap/core';
import { DOMSerializer, Fragment, Slice } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import {
  encodeNoteClipboardSlice,
  wrapNoteClipboardHTML,
  type NoteClipboardSliceJSON,
} from './tiptapNoteRichClipboard';

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
export const NOTE_MODIFIER_RENAME_EVENT = 'note-inline-modifier-rename';
// Click sull'elemento con valore dado (es. 1d6): la view chiede a React di
// tirare tramite il bridge dadi (NoteModifierRollBridge), che legge i dati
// correnti e posta in chat dadi.
export const NOTE_MODIFIER_ROLL_EVENT = 'note-inline-modifier-roll';

export interface NoteModifierRollRequest {
  /** Posizione del carattere ZWSP (inizio del Modificatore). */
  pos: number;
}
// Bridge per il menu "/" dentro la rinomina del titolo: il widget (vanilla)
// rileva "/" nell'input e chiede a React di mostrare il menu filtrato;
// React risponde con formato o dismiss. Solo gruppo Testo, senza elenchi e
// citazione (vedi TITLE_SLASH_COMMANDS in NoteModifierMenu).
export const NOTE_MODIFIER_TITLE_MENU_EVENT = 'note-inline-modifier-title-menu';
export const NOTE_MODIFIER_TITLE_MENU_CLOSE_EVENT = 'note-inline-modifier-title-menu-close';
export const NOTE_MODIFIER_TITLE_FORMAT_EVENT = 'note-inline-modifier-title-format';
export const NOTE_MODIFIER_TITLE_MENU_DISMISS_EVENT = 'note-inline-modifier-title-menu-dismiss';

export type ModifierTitleFormatCommand =
  | 'bold' | 'italic' | 'underline' | 'strike'
  | 'fontSize' | 'fontFamily'
  | 'alignLeft' | 'alignCenter' | 'alignRight';

export interface NoteModifierTitleMenuRequest {
  pos: number;
  query: string;
  x: number;
  y: number;
}

export interface NoteModifierTitleFormatRequest {
  pos: number;
  command: ModifierTitleFormatCommand;
  value?: number | string;
}

export interface NoteModifierMenuRequest {
  /** Posizione del carattere ZWSP (inizio del Modificatore). */
  pos: number;
  /** Coordinate del punto di ancoraggio del menu (pixel viewport). */
  x: number;
  y: number;
}

export type ModifierTitleAlign = 'left' | 'center' | 'right';

export interface ModifierTitleFormat {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  fontSize: number | null;
  fontFamily: string | null;
  align: ModifierTitleAlign | null;
}

export interface ModifierData {
  name: string;
  value: string;
  compact: boolean;
  formula: string;
  titleBold: boolean;
  titleItalic: boolean;
  titleUnderline: boolean;
  titleStrike: boolean;
  titleFontSize: number | null;
  titleFontFamily: string | null;
  titleAlign: ModifierTitleAlign | null;
}

// Valore del Modificatore: numeri semplici (+1, -3, 0) o tiri dado (1d6,
// 3d6+3). Solo cifre, +/-, "d" minuscola: tutto il resto e' vietato. La "d"
// trasforma il valore in tiro di dado al click sull'elemento.
export type ParsedModifierValue =
  | { kind: 'number'; value: number }
  | { kind: 'dice'; count: number; sides: number; modifier: number };

export const MODIFIER_VALUE_MAX_LENGTH = 32;

export function parseModifierValue(raw: string): ParsedModifierValue | null {
  const text = raw.trim();
  if (!text || text.length > MODIFIER_VALUE_MAX_LENGTH || !/^[0-9+\-d]+$/.test(text)) return null;
  if (!text.includes('d')) {
    if (!/^[+-]?\d+$/.test(text)) return null;
    const value = Number.parseInt(text, 10);
    if (!Number.isSafeInteger(value)) return null;
    return { kind: 'number', value };
  }
  const match = text.match(/^(\d*)d(\d+)([+-]\d+)?$/);
  if (!match) return null;
  const count = match[1] === '' ? 1 : Number.parseInt(match[1], 10);
  const sides = Number.parseInt(match[2], 10);
  const modifier = match[3] ? Number.parseInt(match[3], 10) : 0;
  if (!Number.isSafeInteger(count) || count < 1 || count > 100) return null;
  if (!Number.isSafeInteger(sides) || sides < 2 || sides > 1000) return null;
  if (!Number.isSafeInteger(modifier)) return null;
  return { kind: 'dice', count, sides, modifier };
}

export const MODIFIER_TITLE_FORMAT_DEFAULTS: ModifierTitleFormat = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  fontSize: null,
  fontFamily: null,
  align: null,
};

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
  const align = mark.attrs.titleAlign;
  return {
    name: String(mark.attrs.name ?? MODIFIER_DEFAULT_NAME),
    value: String(mark.attrs.value ?? MODIFIER_DEFAULT_VALUE),
    compact: mark.attrs.compact === true,
    formula: typeof mark.attrs.formula === 'string' ? mark.attrs.formula : '',
    titleBold: mark.attrs.titleBold === true,
    titleItalic: mark.attrs.titleItalic === true,
    titleUnderline: mark.attrs.titleUnderline === true,
    titleStrike: mark.attrs.titleStrike === true,
    titleFontSize: typeof mark.attrs.titleFontSize === 'number' ? mark.attrs.titleFontSize : null,
    titleFontFamily: typeof mark.attrs.titleFontFamily === 'string' && mark.attrs.titleFontFamily ? mark.attrs.titleFontFamily : null,
    titleAlign: align === 'left' || align === 'center' || align === 'right' ? align : null,
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

  const nextAlign = attrs.titleAlign !== undefined ? attrs.titleAlign : currentMark.attrs.titleAlign;
  const next = {
    id: currentMark.attrs.id,
    name: attrs.name !== undefined
      ? getUniqueModifierName(state, attrs.name, pos)
      : currentMark.attrs.name ?? MODIFIER_DEFAULT_NAME,
    value: attrs.value ?? currentMark.attrs.value ?? MODIFIER_DEFAULT_VALUE,
    compact: attrs.compact ?? (currentMark.attrs.compact === true),
    formula: attrs.formula ?? (typeof currentMark.attrs.formula === 'string' ? currentMark.attrs.formula : ''),
    titleBold: attrs.titleBold ?? (currentMark.attrs.titleBold === true),
    titleItalic: attrs.titleItalic ?? (currentMark.attrs.titleItalic === true),
    titleUnderline: attrs.titleUnderline ?? (currentMark.attrs.titleUnderline === true),
    titleStrike: attrs.titleStrike ?? (currentMark.attrs.titleStrike === true),
    titleFontSize: attrs.titleFontSize !== undefined ? attrs.titleFontSize : (typeof currentMark.attrs.titleFontSize === 'number' ? currentMark.attrs.titleFontSize : null),
    titleFontFamily: attrs.titleFontFamily !== undefined ? attrs.titleFontFamily : (typeof currentMark.attrs.titleFontFamily === 'string' && currentMark.attrs.titleFontFamily ? currentMark.attrs.titleFontFamily : null),
    titleAlign: nextAlign === 'left' || nextAlign === 'center' || nextAlign === 'right' ? nextAlign : null,
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

export function setModifierCompactAt(
  state: EditorState,
  dispatch: ((transaction: Transaction) => void) | undefined,
  pos: number,
  compact: boolean,
): boolean {
  return setModifierAttrs(state, dispatch, pos, { compact });
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

/** Copia in clipboard l'intero elemento Modificatore (non solo il testo):
 *  scrive HTML + slice embedded nello stesso formato del copia/incolla ricco
 *  dell'editor, cosi' l'incolla ricrea il box identico (nome, valore, formato
 *  titolo, compatto). Il testo semplice resta come fallback per le app
 *  esterne. */
export async function copyModifierToClipboard(view: EditorView, pos: number): Promise<boolean> {
  const mark = getInlineModifierMark(view.state, pos);
  const data = getModifierAt(view.state, pos);
  if (!mark || !data) return false;
  const text = `${data.name}: ${data.value}`;
  const markType = view.state.schema.marks.inlineModifier;
  const canRich = markType
    && typeof ClipboardItem !== 'undefined'
    && !!navigator.clipboard?.write;
  if (canRich) {
    try {
      // id fresco come in Duplica (evita chiavi widget duplicate), resto
      // identico all'originale cosi' l'incolla e' "esattamente com'e'".
      const fresh = markType.create({ ...mark.attrs, id: createModifierId() });
      const slice = new Slice(Fragment.from(view.state.schema.text(INLINE_MODIFIER_CHAR, [fresh])), 0, 0);
      const json = slice.toJSON() as NoteClipboardSliceJSON;
      const fragment = DOMSerializer.fromSchema(view.state.schema).serializeFragment(slice.content, { document });
      const div = document.createElement('div');
      div.appendChild(fragment);
      const html = wrapNoteClipboardHTML(div.innerHTML, json);
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        }),
      ]);
      return true;
    } catch {
      // Sotto: fallback testuale.
    }
  }
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

// Solo una rinomina inline alla volta: se l'utente apre Rinomina su un altro
// Modificatore mentre una precedente e' ancora aperta, la precedente viene
// salvata prima di iniziare la nuova.
let finishActiveInlineRename: ((save: boolean) => void) | null = null;

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

function isCompactModifier(element: HTMLElement): boolean {
  return element.dataset.modifierCompact === 'true';
}

function measureLine(items: Array<{ element: HTMLElement } & WidgetEntry>, lineRight: number) {
  // I Modificatori compatti (Riduci) restano a dimensione contenuto - solo il
  // valore centrato - e non partecipano alla divisione della riga.
  const expanded = items.filter((item) => !isCompactModifier(item.element));
  for (const item of items) {
    if (isCompactModifier(item.element)) {
      item.element.style.marginLeft = '0px';
      item.element.style.marginRight = '0px';
      item.element.style.width = 'auto';
    }
  }
  if (expanded.length === 0) {
    for (let i = 0; i < items.length; i++) {
      items[i].element.style.marginLeft = '0px';
      items[i].element.style.marginRight = i === items.length - 1 ? `${CURSOR_ROOM}px` : '0px';
    }
    return;
  }

  if (items.length === 1) {
    const lineLeft = expanded[0].element.getBoundingClientRect().left;
    const target = Math.max(0, lineRight - lineLeft - CURSOR_ROOM - END_INSERTION_ROOM);
    expanded[0].element.style.marginRight = `${CURSOR_ROOM}px`;
    if (Math.abs(target - expanded[0].element.offsetWidth) > 1) {
      expanded[0].element.style.width = `${target}px`;
    }
    return;
  }

  for (const item of expanded) {
    item.element.style.marginLeft = '0px';
    item.element.style.marginRight = '0px';
  }

  const rects = items.map((item) => item.element.getBoundingClientRect());
  const lineLeft = rects[0].left;
  const currentWidth = rects.reduce((sum, rect) => sum + rect.width, 0);
  const currentSpan = rects[rects.length - 1].right - lineLeft;
  const realGap = Math.max(0, currentSpan - currentWidth);
  const compactWidth = items.reduce(
    (sum, item) => sum + (isCompactModifier(item.element) ? item.element.getBoundingClientRect().width : 0),
    0,
  );
  const available = Math.max(0, lineRight - lineLeft - CURSOR_ROOM - END_INSERTION_ROOM - realGap - compactWidth);
  const width = Math.max(0, available / expanded.length);

  for (const item of expanded) {
    if (Math.abs(width - item.element.offsetWidth) > 1) {
      item.element.style.width = `${width}px`;
    }
  }
  for (let i = 0; i < items.length; i++) {
    items[i].element.style.marginLeft = '0px';
    items[i].element.style.marginRight = i === items.length - 1 ? `${CURSOR_ROOM}px` : '0px';
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
  // I compatti sono gia' al minimo (solo valore): non vanno schiacciati oltre.
  if (!widget || isCompactModifier(widget)) return;
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
  // I compatti sono gia' al minimo (solo valore): non vanno dimezzati.
  if (!widget || isCompactModifier(widget)) return;
  widget.style.width = `${Math.max(MIN_MODIFIER_WIDTH, (widget.offsetWidth - MIN_GAP) / 2)}px`;
}

export function applyModifierTitleFormat(
  target: HTMLElement,
  format: ModifierTitleFormat,
  baseFontSize = '0.72em',
): void {
  target.style.fontWeight = format.bold ? '700' : '600';
  target.style.fontStyle = format.italic ? 'italic' : 'normal';
  const decorations: string[] = [];
  if (format.underline) decorations.push('underline');
  if (format.strike) decorations.push('line-through');
  target.style.textDecoration = decorations.join(' ') || 'none';
  target.style.fontSize = typeof format.fontSize === 'number' ? `${format.fontSize}px` : baseFontSize;
  target.style.fontFamily = format.fontFamily ?? '';
  if (format.align === 'center') target.style.textAlign = 'center';
  else if (format.align === 'right') target.style.textAlign = 'right';
  else target.style.textAlign = 'left';
}

function buildModifierWidget(
  view: EditorView,
  getPos: () => number | undefined,
  name: string,
  value: string,
  compact: boolean,
  titleFormat: ModifierTitleFormat,
): HTMLElement {
  const element = document.createElement('span');
  element.className = 'tiptap-inline-modifier-widget';
  element.dataset.modifierName = name;
  element.dataset.modifierValue = value;
  element.dataset.modifierCompact = compact ? 'true' : 'false';
  element.setAttribute('role', 'group');
  element.setAttribute('aria-label', `Modificatore ${name}: ${value}`);

  Object.assign(element.style, {
    display: 'inline-flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
    minWidth: compact ? 'min-content' : '4em',
    // Compatto (Riduci): stessa altezza dell'espanso, valore centrato su
    // entrambi gli assi. Il respiro laterale (1.2em ~ quattro spazi) rende la
    // forma quasi quadrata con un solo numero.
    minHeight: '2.5em',
    padding: compact ? '0.2em 1.2em' : '0.2em 0.5em',
    justifyContent: compact ? 'center' : 'flex-start',
    alignItems: compact ? 'center' : 'stretch',
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
  applyModifierTitleFormat(label, titleFormat);
  if (titleFormat.align === 'center') head.style.justifyContent = 'center';
  else if (titleFormat.align === 'right') head.style.justifyContent = 'flex-end';

  const dots = document.createElement('span');
  dots.className = 'tiptap-inline-modifier-menu-trigger';
  dots.setAttribute('role', 'button');
  dots.setAttribute('tabindex', '0');
  dots.setAttribute('aria-label', `Menu Modificatore ${name}`);
  Object.assign(dots.style, {
    display: 'inline-flex',
    position: 'absolute',
    // Sempre dentro il box come nell'espanso: overlay assoluto, visibili solo
    // a hover/focus, senza occupare spazio di layout.
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
    width: compact ? 'auto' : '100%',
    textAlign: 'center',
    fontSize: '0.95em',
    fontWeight: 600,
    lineHeight: 1.4,
    marginTop: compact ? '0' : '0.1em',
    color: 'var(--dash-text)',
  });

  head.appendChild(label);
  if (!compact) element.appendChild(head);
  element.appendChild(valueEl);
  element.appendChild(dots);

  const startInlineRename = (pos: number) => {
    if (compact || typeof getPos() !== 'number' || getPos() !== pos) return;
    // Chiude un'eventuale rinomina precedente ancora aperta (salvandola),
    // cosi' non restano mai due input attivi in giro per il documento.
    finishActiveInlineRename?.(true);
    const previousName = label.textContent ?? name;
    const pendingFormat: ModifierTitleFormat = { ...titleFormat };
    const input = document.createElement('input');
    input.value = previousName;
    input.setAttribute('aria-label', 'Nome modificatore');
    // L'input vive dentro un widget contenteditable=false: ProseMirror non lo
    // tratta come testo del documento. "/" qui apre il menu titolo filtrato
    // (solo Testo, vedi TITLE_SLASH_COMMANDS), non lo slash menu dell'editor.
    input.setAttribute('data-note-modifier-rename', 'true');
    Object.assign(input.style, {
      width: '100%',
      minWidth: 0,
      border: '0',
      outline: '1px solid var(--dash-accent)',
      borderRadius: '0.25em',
      background: 'var(--dash-surface)',
      color: 'var(--dash-text-strong)',
      font: 'inherit',
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
    });
    applyModifierTitleFormat(input, pendingFormat);

    let done = false;
    let titleMenuOpen = false;
    let titleTriggerStart: number | null = null;
    const host = element as HTMLElement & { __cancelInlineRename?: () => void };
    const restoreLabel = (text: string) => {
      label.textContent = text;
      if (input.isConnected) input.replaceWith(label);
    };
    const closeTitleMenu = () => {
      if (!titleMenuOpen) return;
      titleMenuOpen = false;
      titleTriggerStart = null;
      window.dispatchEvent(new CustomEvent<{ pos: number }>(NOTE_MODIFIER_TITLE_MENU_CLOSE_EVENT, { detail: { pos } }));
    };
    const finish = (save: boolean, focusEditor = false) => {
      if (done) return;
      done = true;
      if (finishActiveInlineRename === finishWrapper) finishActiveInlineRename = null;
      if (host.__cancelInlineRename === cancelRename) host.__cancelInlineRename = undefined;
      window.removeEventListener('pointerdown', onWindowPointerDown, true);
      window.removeEventListener('keydown', onWindowKeyDown, true);
      window.removeEventListener(NOTE_MODIFIER_TITLE_FORMAT_EVENT, onTitleFormat as EventListener);
      window.removeEventListener(NOTE_MODIFIER_TITLE_MENU_DISMISS_EVENT, onTitleDismiss as EventListener);
      input.removeEventListener('blur', onBlur);
      input.removeEventListener('input', onInput);
      closeTitleMenu();
      const currentPos = getPos();
      if (save && typeof currentPos === 'number') {
        const nextName = input.value.trim() || MODIFIER_DEFAULT_NAME;
        // Ripristina subito il label anche se il widget non verra'
        // ricostruito (nome/formato invariati => stessa key => stesso DOM):
        // senza questo, l'input resterebbe appeso nel documento.
        restoreLabel(nextName);
        applyModifierTitleFormat(label, pendingFormat);
        setModifierAttrs(view.state, (tr) => view.dispatch(tr), currentPos, {
          name: nextName,
          titleBold: pendingFormat.bold,
          titleItalic: pendingFormat.italic,
          titleUnderline: pendingFormat.underline,
          titleStrike: pendingFormat.strike,
          titleFontSize: pendingFormat.fontSize,
          titleFontFamily: pendingFormat.fontFamily,
          titleAlign: pendingFormat.align,
        });
      } else if (!save) {
        restoreLabel(previousName);
      } else {
        restoreLabel(previousName);
      }
      if (focusEditor) view.focus();
    };
    const finishWrapper = (save: boolean) => finish(save, false);

    // Trova un trigger "/" attivo prima del caret: "/" seguito solo da lettere
    // (query di filtro). Senza trigger il menu resta chiuso e "/" e' testo.
    const findTitleTrigger = (): { start: number; query: string } | null => {
      const caret = input.selectionStart ?? input.value.length;
      const before = input.value.slice(0, caret);
      const match = before.match(/\/([A-Za-zÀ-ÿ]*)$/);
      if (!match || typeof match.index !== 'number') return null;
      return { start: match.index, query: match[1] ?? '' };
    };
    const syncTitleMenu = () => {
      if (done || document.activeElement !== input) return;
      const trigger = findTitleTrigger();
      if (!trigger) {
        closeTitleMenu();
        return;
      }
      titleMenuOpen = true;
      titleTriggerStart = trigger.start;
      const rect = input.getBoundingClientRect();
      window.dispatchEvent(
        new CustomEvent<NoteModifierTitleMenuRequest>(NOTE_MODIFIER_TITLE_MENU_EVENT, {
          detail: { pos, query: trigger.query, x: rect.left, y: rect.bottom },
        }),
      );
    };
    const onInput = () => {
      applyModifierTitleFormat(input, pendingFormat);
      syncTitleMenu();
    };
    const removeTitleTrigger = () => {
      if (titleTriggerStart === null) return;
      const caret = input.selectionStart ?? input.value.length;
      input.value = input.value.slice(0, titleTriggerStart) + input.value.slice(caret);
      try { input.setSelectionRange(titleTriggerStart, titleTriggerStart); } catch { /* input non testuale: ignora */ }
    };
    const onTitleFormat = (event: Event) => {
      const detail = (event as CustomEvent<NoteModifierTitleFormatRequest>).detail;
      if (!detail || detail.pos !== pos || done) return;
      switch (detail.command) {
        case 'bold': pendingFormat.bold = !pendingFormat.bold; break;
        case 'italic': pendingFormat.italic = !pendingFormat.italic; break;
        case 'underline': pendingFormat.underline = !pendingFormat.underline; break;
        case 'strike': pendingFormat.strike = !pendingFormat.strike; break;
        case 'fontSize': pendingFormat.fontSize = typeof detail.value === 'number' ? detail.value : pendingFormat.fontSize; break;
        case 'fontFamily': pendingFormat.fontFamily = typeof detail.value === 'string' ? detail.value : pendingFormat.fontFamily; break;
        case 'alignLeft': pendingFormat.align = pendingFormat.align === 'left' ? null : 'left'; break;
        case 'alignCenter': pendingFormat.align = pendingFormat.align === 'center' ? null : 'center'; break;
        case 'alignRight': pendingFormat.align = pendingFormat.align === 'right' ? null : 'right'; break;
      }
      removeTitleTrigger();
      applyModifierTitleFormat(input, pendingFormat);
      closeTitleMenu();
      input.focus();
    };
    const onTitleDismiss = (event: Event) => {
      const detail = (event as CustomEvent<{ pos: number }>).detail;
      if (!detail || detail.pos !== pos || done) return;
      // Escape nel menu titolo: chiude solo il menu, "/" resta testo e la
      // rinomina continua (come lo slash menu dell'editor).
      titleMenuOpen = false;
      titleTriggerStart = null;
      input.focus();
    };

    // Click (o tocco) fuori dall'input e fuori dal menu titolo: salva e lascia
    // che l'evento prosegua verso il punto cliccato (niente preventDefault /
    // stopPropagation qui, altrimenti il focus non si sposterebbe mai).
    const onWindowPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && input.contains(event.target)) return;
      if (event.target === input) return;
      if (event.target instanceof Element && event.target.closest('[data-note-modifier-title-menu="true"]')) return;
      finish(true, false);
    };
    // Enter salva, Escape annulla - ma se il menu titolo e' aperto, Enter ed
    // Escape li gestisce il menu React (scelta voce / chiusura con "/" che
    // resta testo): qui si lascia passare senza chiudere la rinomina.
    // Listener in capture su window: l'input e' dentro l'editor, quindi i
    // listener capture dell'editor scatterebbero prima di un listener bubble
    // sull'input e ci ruberebbero Esc/Invio.
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.target !== input) return;
      if (titleMenuOpen) {
        if (event.key === 'Enter' || event.key === 'Escape' || event.key.startsWith('Arrow')) return;
        event.stopPropagation();
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
        finish(true, true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
        finish(false, true);
      } else {
        // Altri tasti restano testo dentro l'input, senza raggiungere l'editor.
        event.stopPropagation();
      }
    };
    const onBlur = (event: FocusEvent) => {
      // Il click sul menu titolo sposta il focus fuori dall'input: non salvare
      // in quel caso, la rinomina continua dopo la scelta nel menu.
      const next = event.relatedTarget as Element | null;
      if (next?.closest?.('[data-note-modifier-title-menu="true"]')) return;
      finish(true, false);
    };

    const cancelRename = () => finish(false, false);
    finishActiveInlineRename = finishWrapper;
    // Se il widget viene distrutto mentre la rinomina e' aperta (es. undo o
    // cancellazione esterna), annulla senza dispatch: l'input e' comunque
    // staccato dal documento e i listener verrebbero dimenticati.
    host.__cancelInlineRename = cancelRename;
    label.replaceWith(input);
    window.addEventListener('pointerdown', onWindowPointerDown, true);
    window.addEventListener('keydown', onWindowKeyDown, true);
    window.addEventListener(NOTE_MODIFIER_TITLE_FORMAT_EVENT, onTitleFormat as EventListener);
    window.addEventListener(NOTE_MODIFIER_TITLE_MENU_DISMISS_EVENT, onTitleDismiss as EventListener);
    input.addEventListener('blur', onBlur);
    input.addEventListener('input', onInput);
    window.requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  };

  const onRenameRequest = (event: Event) => {
    const detail = (event as CustomEvent<{ pos: number }>).detail;
    if (typeof detail?.pos === 'number') startInlineRename(detail.pos);
  };
  window.addEventListener(NOTE_MODIFIER_RENAME_EVENT, onRenameRequest);

  element.addEventListener('mouseenter', () => { dots.style.opacity = '1'; });
  element.addEventListener('mouseleave', () => { if (document.activeElement !== dots) dots.style.opacity = '0'; });
  dots.addEventListener('focus', () => { dots.style.opacity = '1'; });
  dots.addEventListener('blur', () => { dots.style.opacity = '0'; });

  // Tooltip col nome nel compatto (Riduci): senza la riga del titolo il nome
  // non sarebbe leggibile da nessuna parte. Specchio del Tooltip condiviso
  // (ui/tooltip): palette attiva via var(--dash-*), bolla sopra il box, solo
  // hover/focus, pointer-events none quindi mai layout ne' interazione.
  // Portal in position:fixed (come slash menu e menu contestuale): dentro il
  // widget finirebbe ritagliato dal bordo/overflow del contenitore della
  // nota. Il container e' l'antenato con data-dashboard-palette, NON
  // document.body: fuori da quell'albero le variabili --dash-* non arrivano
  // per cascata e il tooltip resta invisibile (vedi portal-container).
  let hideCompactTip: (() => void) | null = null;
  if (compact) {
    let tip: HTMLSpanElement | null = null;
    const hideTip = () => {
      window.removeEventListener('scroll', hideTip, true);
      tip?.remove();
      tip = null;
    };
    const showTip = () => {
      if (tip || !element.isConnected) return;
      tip = document.createElement('span');
      tip.className = 'tiptap-inline-modifier-tooltip';
      tip.setAttribute('role', 'tooltip');
      tip.textContent = name;
      Object.assign(tip.style, {
        position: 'fixed',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
        opacity: '0',
        transition: 'opacity 120ms ease',
        zIndex: '1200',
        borderRadius: '0.45em',
        padding: '0.35em 0.7em',
        fontSize: '0.75em',
        fontWeight: 600,
        letterSpacing: '0.04em',
        background: 'var(--dash-panel)',
        color: 'var(--dash-text)',
        border: '1px solid var(--dash-border-soft)',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
      });
      (element.closest('[data-dashboard-palette]') ?? document.body).appendChild(tip);
      const rect = element.getBoundingClientRect();
      const tipRect = tip.getBoundingClientRect();
      const left = Math.max(8, Math.min(rect.left + rect.width / 2 - tipRect.width / 2, window.innerWidth - tipRect.width - 8));
      tip.style.left = `${left}px`;
      tip.style.top = `${Math.max(8, rect.top - tipRect.height - 8)}px`;
      window.addEventListener('scroll', hideTip, true);
      window.requestAnimationFrame(() => { tip?.style.setProperty('opacity', '1'); });
    };
    hideCompactTip = hideTip;
    element.addEventListener('mouseenter', showTip);
    element.addEventListener('mouseleave', hideTip);
    element.addEventListener('focusin', showTip);
    element.addEventListener('focusout', hideTip);
  }

  // Apre il men&ugrave; React dispatchando un CustomEvent. Il mousedown sui
  // puntini viene bloccato: niente move del caret, niente rimbalzi di
  // selezione quando si apre il menu.
  const openMenu = () => {
    if (!view.editable) return;
    hideCompactTip?.();
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
    // A editor spento (tab sfocata) lascia passare l'evento: focus nativo e
    // bubble invariati, cosi' il wrapper puo' riattivare la modifica.
    if (!view.editable) return;
    event.preventDefault();
    event.stopPropagation();
  });
  dots.addEventListener('click', (event) => {
    // A editor spento il click risale al wrapper (onClickText) che rimette
    // isEditing=true: si apre il menu appena l'editor torna editable, cosi'
    // basta un solo click sui puntini anche a tab sfocata.
    if (!view.editable) {
      const startedAt = performance.now();
      const attempt = () => {
        if (!element.isConnected) return;
        if (view.editable) {
          openMenu();
          return;
        }
        if (performance.now() - startedAt < 600) window.requestAnimationFrame(attempt);
      };
      window.requestAnimationFrame(attempt);
      return;
    }
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

  // Valori validi (numeri semplici o dadi): l'elemento e' cliccabile e tira in
  // chat dadi - bordo in accento e alone per distinguerlo dai Modificatori che
  // rappresentano solo un valore. Mai dai puntini (aprono il menu) ne' dalla
  // rinomina.
  if (parseModifierValue(value)) {
    element.style.cursor = 'pointer';
    element.style.border = '1px solid var(--dash-accent-2)';
    element.style.boxShadow = '0 0 8px var(--dash-accent-2)';
  }
  element.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('.tiptap-inline-modifier-menu-trigger')) return;
    if (event.target.closest('[data-note-modifier-rename="true"]')) return;
    const currentPos = getPos();
    if (typeof currentPos !== 'number') return;
    const current = getModifierAt(view.state, currentPos);
    if (!current) return;
    if (!parseModifierValue(current.value)) return;
    event.stopPropagation();
    window.dispatchEvent(
      new CustomEvent<NoteModifierRollRequest>(NOTE_MODIFIER_ROLL_EVENT, {
        detail: { pos: currentPos },
      }),
    );
  });

  // Registra nel catalogo globale per la misura coordinata delle righe.
  // La teardown viene gestita da spec.destroy che rimuove l'entry.
  const entry: WidgetEntry = { view, getPos };
  widgetEntries.set(element, entry);
  (element as HTMLElement & { __destroyModifierWidget?: () => void }).__destroyModifierWidget = () => {
    window.removeEventListener(NOTE_MODIFIER_RENAME_EVENT, onRenameRequest);
    hideCompactTip?.();
    (element as HTMLElement & { __cancelInlineRename?: () => void }).__cancelInlineRename?.();
  };
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
      compact: {
        default: false,
        parseHTML: (element) => element.getAttribute('data-modifier-compact') === 'true',
        renderHTML: (attributes) => (attributes.compact ? { 'data-modifier-compact': 'true' } : {}),
      },
      formula: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-modifier-formula') ?? '',
        renderHTML: (attributes) => (attributes.formula ? { 'data-modifier-formula': attributes.formula } : {}),
      },
      titleBold: {
        default: false,
        parseHTML: (element) => element.getAttribute('data-modifier-title-bold') === 'true',
        renderHTML: (attributes) => (attributes.titleBold ? { 'data-modifier-title-bold': 'true' } : {}),
      },
      titleItalic: {
        default: false,
        parseHTML: (element) => element.getAttribute('data-modifier-title-italic') === 'true',
        renderHTML: (attributes) => (attributes.titleItalic ? { 'data-modifier-title-italic': 'true' } : {}),
      },
      titleUnderline: {
        default: false,
        parseHTML: (element) => element.getAttribute('data-modifier-title-underline') === 'true',
        renderHTML: (attributes) => (attributes.titleUnderline ? { 'data-modifier-title-underline': 'true' } : {}),
      },
      titleStrike: {
        default: false,
        parseHTML: (element) => element.getAttribute('data-modifier-title-strike') === 'true',
        renderHTML: (attributes) => (attributes.titleStrike ? { 'data-modifier-title-strike': 'true' } : {}),
      },
      titleFontSize: {
        default: null,
        parseHTML: (element) => {
          const raw = element.getAttribute('data-modifier-title-font-size');
          const parsed = raw ? Number.parseInt(raw, 10) : NaN;
          return Number.isFinite(parsed) ? parsed : null;
        },
        renderHTML: (attributes) => (typeof attributes.titleFontSize === 'number' ? { 'data-modifier-title-font-size': String(attributes.titleFontSize) } : {}),
      },
      titleFontFamily: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-modifier-title-font-family') ?? null,
        renderHTML: (attributes) => (attributes.titleFontFamily ? { 'data-modifier-title-font-family': attributes.titleFontFamily } : {}),
      },
      titleAlign: {
        default: null,
        parseHTML: (element) => {
          const raw = element.getAttribute('data-modifier-title-align');
          return raw === 'left' || raw === 'center' || raw === 'right' ? raw : null;
        },
        renderHTML: (attributes) => (attributes.titleAlign ? { 'data-modifier-title-align': attributes.titleAlign } : {}),
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
            compact: false,
            formula: '',
            titleBold: false,
            titleItalic: false,
            titleUnderline: false,
            titleStrike: false,
            titleFontSize: null,
            titleFontFamily: null,
            titleAlign: null,
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
              const compact = mark.attrs.compact === true;
              const titleFormat: ModifierTitleFormat = {
                bold: mark.attrs.titleBold === true,
                italic: mark.attrs.titleItalic === true,
                underline: mark.attrs.titleUnderline === true,
                strike: mark.attrs.titleStrike === true,
                fontSize: typeof mark.attrs.titleFontSize === 'number' ? mark.attrs.titleFontSize : null,
                fontFamily: typeof mark.attrs.titleFontFamily === 'string' && mark.attrs.titleFontFamily ? mark.attrs.titleFontFamily : null,
                align: mark.attrs.titleAlign === 'left' || mark.attrs.titleAlign === 'center' || mark.attrs.titleAlign === 'right' ? mark.attrs.titleAlign : null,
              };
              const titleKey = `${titleFormat.bold ? 1 : 0}${titleFormat.italic ? 1 : 0}${titleFormat.underline ? 1 : 0}${titleFormat.strike ? 1 : 0}:${titleFormat.fontSize ?? ''}:${titleFormat.fontFamily ?? ''}:${titleFormat.align ?? ''}`;
              const id = typeof mark.attrs.id === 'string' && mark.attrs.id ? mark.attrs.id : null;
              for (let offset = 0; offset < node.nodeSize; offset++) {
                if (node.text.charAt(offset) !== INLINE_MODIFIER_CHAR) continue;
                const modifierPos = pos + offset;
                decorations.push(
                  Decoration.widget(
                    modifierPos,
                    (view, getPos) => buildModifierWidget(view, getPos, name, value, compact, titleFormat),
                    {
                      side: 0,
                      // Il key include nome e valore: cambiandoli il widget
                      // viene ricostruito a vista (ProseMirror confronta i
                      // widget via spec.key) senza ricostruirlo a ogni
                      // cambio di sola selezione.
                      key: `modifier:${id ?? modifierPos}:${name}:${value}:${compact}:${titleKey}`,
                      destroy: (node) => {
                        (node as HTMLElement & { __destroyModifierWidget?: () => void }).__destroyModifierWidget?.();
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
