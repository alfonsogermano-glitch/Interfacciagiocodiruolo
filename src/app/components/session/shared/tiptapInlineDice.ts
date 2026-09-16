import { Mark, mergeAttributes } from '@tiptap/core';
import { DOMSerializer, Fragment, Slice } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { wrapNoteClipboardHTML } from './tiptapNoteRichClipboard';
import {
  INLINE_MODIFIER_CHAR,
  NOTE_MODIFIER_ROLL_EVENT,
  applyModifierTitleFormat,
  getInlineBoxWidgetAt,
  getModifierLookup,
  getModifierLookupForState,
  halveInlineBoxWidget,
  makeRoomForInlineModifierInsertion,
  registerInlineBoxWidget,
  showInlineBoxTipAbove,
  shrinkInlineBoxWidget,
  unregisterInlineBoxWidget,
  type ModifierTitleAlign,
  type ModifierTitleFormat,
  type NoteModifierMenuRequest,
  type NoteModifierRollRequest,
} from './tiptapInlineModifier';
import { describeFormulaAnomaly } from './modifierFormula';
import {
  extractModifierRefs,
  isValidModifierFormula,
  modifierFormulaHasDice,
  parseModifierValue,
} from './modifierFormula';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    inlineDice: {
      /** Inserisce un Dado alla posizione del cursore. */
      insertInlineDice: () => ReturnType;
    };
  }
}

// Elemento Dado: stessa architettura del Modificatore (singolo ZWSP marcato +
// Decoration.widget, misura per riga visiva condivisa) ma semplificato: nome
// + formula, menu con sole Modifica/Duplica/Copia/Elimina, click tira sempre.
// La formula usa la stessa sintassi delle formule Modificatore (dadi,
// numeri, operatori, parentesi, tag "Nome" che si risolvono sui Modificatori
// della nota); i Dadi non sono referenziabili e non entrano nel lookup.
export const DICE_DEFAULT_NAME = 'Dado';
export const DICE_DEFAULT_FORMULA = '1d6';

export const DICE_WIDGET_SELECTOR = '.tiptap-inline-dice-widget';

// Bridge vanilla-DOM -> React per il menu contestuale (stesso meccanismo del
// Modificatore): il click sui puntini dispatcha questo evento su window.
export const NOTE_DICE_MENU_EVENT = 'note-inline-dice-menu';

export interface DiceData {
  name: string;
  formula: string;
  titleBold: boolean;
  titleItalic: boolean;
  titleUnderline: boolean;
  titleStrike: boolean;
  titleFontSize: number | null;
  titleFontFamily: string | null;
  titleAlign: ModifierTitleAlign | null;
}

/** Formato titolo iniziale: nome centrato, senza altri stili. */
export const DICE_TITLE_FORMAT_DEFAULTS: ModifierTitleFormat = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  fontSize: null,
  fontFamily: null,
  align: 'center',
};

function createDiceId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `dice-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function getInlineDiceMark(state: EditorState, pos: number) {
  const markType = state.schema.marks.inlineDice;
  if (!markType) return null;
  let found = null;
  state.doc.nodesBetween(pos, pos + 1, (node, nodePos) => {
    if (found || !node.isText) return;
    const offset = pos - nodePos;
    if (offset < 0 || offset >= node.nodeSize) return;
    if (node.text?.charAt(offset) !== INLINE_MODIFIER_CHAR) return;
    found = node.marks.find((mark) => mark.type === markType) ?? null;
  });
  return found;
}

/** Legge nome/formula/formato titolo del Dado alla posizione data. */
export function getDiceAt(state: EditorState, pos: number): DiceData | null {
  const mark = getInlineDiceMark(state, pos);
  if (!mark) return null;
  const align = mark.attrs.titleAlign;
  return {
    name: String(mark.attrs.name ?? DICE_DEFAULT_NAME),
    formula: typeof mark.attrs.formula === 'string' && mark.attrs.formula ? mark.attrs.formula : DICE_DEFAULT_FORMULA,
    titleBold: mark.attrs.titleBold === true,
    titleItalic: mark.attrs.titleItalic === true,
    titleUnderline: mark.attrs.titleUnderline === true,
    titleStrike: mark.attrs.titleStrike === true,
    titleFontSize: typeof mark.attrs.titleFontSize === 'number' ? mark.attrs.titleFontSize : null,
    titleFontFamily: typeof mark.attrs.titleFontFamily === 'string' && mark.attrs.titleFontFamily ? mark.attrs.titleFontFamily : null,
    titleAlign: align === 'left' || align === 'center' || align === 'right' ? align : DICE_TITLE_FORMAT_DEFAULTS.align,
  };
}

/** Sostituisce nome/formula/formato di UN solo Dado (range di un carattere). */
export function setDiceAttrs(
  state: EditorState,
  dispatch: ((transaction: Transaction) => void) | undefined,
  pos: number,
  attrs: Partial<DiceData>,
): boolean {
  const markType = state.schema.marks.inlineDice;
  const currentMark = getInlineDiceMark(state, pos);
  if (!markType || !currentMark) return false;
  const nextAlign = attrs.titleAlign !== undefined ? attrs.titleAlign : currentMark.attrs.titleAlign;
  const next = {
    id: currentMark.attrs.id,
    name: attrs.name !== undefined && attrs.name.trim() ? attrs.name.trim() : String(currentMark.attrs.name ?? DICE_DEFAULT_NAME),
    formula: attrs.formula !== undefined && attrs.formula.trim() ? attrs.formula.trim() : String(currentMark.attrs.formula ?? DICE_DEFAULT_FORMULA),
    titleBold: attrs.titleBold ?? (currentMark.attrs.titleBold === true),
    titleItalic: attrs.titleItalic ?? (currentMark.attrs.titleItalic === true),
    titleUnderline: attrs.titleUnderline ?? (currentMark.attrs.titleUnderline === true),
    titleStrike: attrs.titleStrike ?? (currentMark.attrs.titleStrike === true),
    titleFontSize: attrs.titleFontSize !== undefined ? attrs.titleFontSize : (typeof currentMark.attrs.titleFontSize === 'number' ? currentMark.attrs.titleFontSize : null),
    titleFontFamily: attrs.titleFontFamily !== undefined ? attrs.titleFontFamily : (typeof currentMark.attrs.titleFontFamily === 'string' && currentMark.attrs.titleFontFamily ? currentMark.attrs.titleFontFamily : null),
    titleAlign: nextAlign === 'left' || nextAlign === 'center' || nextAlign === 'right' ? nextAlign : DICE_TITLE_FORMAT_DEFAULTS.align,
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

/** true se subito prima di pos c'e' un Dado. */
export function isPreviousDice(state: EditorState, pos: number): boolean {
  if (pos <= 0 || state.doc.textBetween(pos - 1, pos, '', '') !== INLINE_MODIFIER_CHAR) return false;
  return !!getInlineDiceMark(state, pos - 1);
}

/** Restringe il widget prima di pos se e' un Dado (testo digitato accanto). */
export function makeRoomForInlineDiceText(view: EditorView, pos: number, text: string): boolean {
  const delta = Math.max(8, text.length * 8);
  if (getInlineDiceMark(view.state, pos)) {
    const widget = getInlineBoxWidgetAt(pos);
    if (widget) shrinkInlineBoxWidget(widget, delta);
    return true;
  }
  if (pos > 0 && getInlineDiceMark(view.state, pos - 1)) {
    const widget = getInlineBoxWidgetAt(pos - 1);
    if (widget) shrinkInlineBoxWidget(widget, delta);
    return true;
  }
  return false;
}

/** Dimezza il widget prima di pos se e' un Dado (inserimento accanto). */
export function makeRoomForInlineDiceInsertion(state: EditorState, pos: number): void {
  if (pos <= 0 || !getInlineDiceMark(state, pos - 1)) return;
  const widget = getInlineBoxWidgetAt(pos - 1);
  if (widget) halveInlineBoxWidget(widget);
}

/** Duplica: copia identica subito dopo l'originale (stesso nome, id fresco),
 *  con spazio vero e restringimento come il Modificatore. */
export function duplicateDiceAt(
  state: EditorState,
  dispatch: ((transaction: Transaction) => void) | undefined,
  pos: number,
): boolean {
  const markType = state.schema.marks.inlineDice;
  const currentMark = getInlineDiceMark(state, pos);
  if (!markType || !currentMark) return false;
  if (dispatch) {
    makeRoomForInlineModifierInsertion(state, pos + 1);
    makeRoomForInlineDiceInsertion(state, pos + 1);
    const tr = state.tr.insertText(' ', pos + 1);
    tr.insert(pos + 2, state.schema.text(INLINE_MODIFIER_CHAR, [markType.create({
      ...currentMark.attrs,
      id: createDiceId(),
    })]));
    dispatch(tr);
  }
  return true;
}

/** Elimina il Dado (cancella il carattere ZWSP marcato). */
export function deleteDiceAt(
  state: EditorState,
  dispatch: ((transaction: Transaction) => void) | undefined,
  pos: number,
): boolean {
  const currentMark = getInlineDiceMark(state, pos);
  if (!currentMark) return false;
  if (dispatch) dispatch(state.tr.delete(pos, pos + 1));
  return true;
}

/** Copia in clipboard l'intero elemento Dado (stesso formato ricco del
 *  Modificatore: HTML + slice embedded, testo semplice come fallback). */
export async function copyDiceToClipboard(view: EditorView, pos: number): Promise<boolean> {
  const mark = getInlineDiceMark(view.state, pos);
  const data = getDiceAt(view.state, pos);
  if (!mark || !data) return false;
  const text = `${data.name}: ${data.formula}`;
  const markType = view.state.schema.marks.inlineDice;
  const canRich = markType
    && typeof ClipboardItem !== 'undefined'
    && !!navigator.clipboard?.write;
  if (canRich) {
    try {
      const fresh = markType.create({ ...mark.attrs, id: createDiceId() });
      const slice = new Slice(Fragment.from(view.state.schema.text(INLINE_MODIFIER_CHAR, [fresh])), 0, 0);
      const json = slice.toJSON();
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

// Anomalia (rosso) e presenza dadi per la formula del Dado, seguendo i
// riferimenti ai Modificatori. A differenza del Modificatore non esiste
// "riferimento a se' stesso": i Dadi non entrano nel lookup.
function assessDiceFormula(
  formula: string,
  lookup: Map<string, { value: string; formula: string }>,
): { anomalous: boolean; hasDice: boolean } {
  if (!formula.trim()) return { anomalous: true, hasDice: false };
  const refs = extractModifierRefs(formula);
  const resolveRef = (refName: string) => lookup.get(refName) ?? null;
  return {
    anomalous: refs === null || refs.some((ref) => !lookup.has(ref)),
    hasDice: modifierFormulaHasDice(formula, resolveRef),
  };
}

function buildDiceWidget(
  view: EditorView,
  getPos: () => number | undefined,
  name: string,
  formula: string,
  titleFormat: ModifierTitleFormat,
): HTMLElement {
  const element = document.createElement('span');
  element.className = 'tiptap-inline-dice-widget';
  element.dataset.diceName = name;
  // I Dadi non riempiono la riga: larghezza del contenuto (nome/formula)
  // come i Modificatori compatti - vale solo per la misura per riga visiva,
  // niente Riduci/Allarga.
  element.dataset.modifierCompact = 'true';
  element.setAttribute('role', 'group');
  element.setAttribute('aria-label', `Dado ${name}: ${formula}`);

  Object.assign(element.style, {
    display: 'inline-flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
    minWidth: '4em',
    minHeight: '2.5em',
    padding: '0.2em 0.5em',
    justifyContent: 'center',
    alignItems: 'stretch',
    verticalAlign: 'middle',
    border: '1px solid var(--dash-accent-2)',
    borderRadius: '0.45em',
    background: 'var(--dash-surface-2)',
    color: 'var(--dash-text)',
    userSelect: 'none',
    position: 'relative',
    // Il Dado e' sempre un pulsante: tira a ogni click.
    cursor: 'pointer',
  });
  element.style.background = 'color-mix(in srgb, var(--dash-accent-2) 22%, var(--dash-surface-2))';

  const head = document.createElement('span');
  Object.assign(head.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.35em',
    width: '100%',
    lineHeight: 1,
  });
  // Allineamento titolo come il Modificatore (default centrale).
  if (titleFormat.align === 'right') head.style.justifyContent = 'flex-end';
  else if (titleFormat.align === 'left') head.style.justifyContent = 'flex-start';
  else head.style.justifyContent = 'center';

  const label = document.createElement('span');
  label.className = 'tiptap-inline-dice-label';
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
    textAlign: 'center',
  });
  applyModifierTitleFormat(label, titleFormat);

  const formulaEl = document.createElement('span');
  formulaEl.className = 'tiptap-inline-dice-formula';
  formulaEl.textContent = formula;
  Object.assign(formulaEl.style, {
    width: '100%',
    textAlign: 'center',
    fontSize: '0.95em',
    fontWeight: 600,
    lineHeight: 1.4,
    marginTop: '0.1em',
    color: 'var(--dash-text)',
  });

  const dots = document.createElement('span');
  dots.className = 'tiptap-inline-dice-menu-trigger';
  dots.setAttribute('role', 'button');
  dots.setAttribute('tabindex', '0');
  dots.setAttribute('aria-label', `Menu Dado ${name}`);
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

  head.appendChild(label);
  element.appendChild(head);
  element.appendChild(formulaEl);
  element.appendChild(dots);

  // Apre il menu React dispatchando un CustomEvent (stesso meccanismo del
  // Modificatore). Il mousedown sui puntini viene bloccato: niente move del
  // caret, niente rimbalzi di selezione quando si apre il menu.
  const openMenu = () => {
    if (!view.editable) return;
    const pos = getPos();
    if (typeof pos !== 'number') return;
    const rect = dots.getBoundingClientRect();
    window.dispatchEvent(
      new CustomEvent<NoteModifierMenuRequest>(NOTE_DICE_MENU_EVENT, {
        detail: { pos, x: rect.left, y: rect.bottom, widgetBottom: element.getBoundingClientRect().bottom },
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
    // isEditing=true: si apre il menu appena l'editor torna editable.
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

  element.addEventListener('mouseenter', () => { dots.style.opacity = '1'; });
  element.addEventListener('mouseleave', () => { if (document.activeElement !== dots) dots.style.opacity = '0'; });
  dots.addEventListener('focus', () => { dots.style.opacity = '1'; });
  dots.addEventListener('blur', () => { dots.style.opacity = '0'; });

  const diceLookup = getModifierLookup(view);
  const assessment = assessDiceFormula(formula, diceLookup);
  element.dataset.diceAnomalous = assessment.anomalous ? 'true' : 'false';
  // Il Dado non e' referenziabile: niente controllo "riferimento a se'".
  const diceAnomalyReason = assessment.anomalous ? describeFormulaAnomaly(formula, diceLookup) : null;
  if (assessment.anomalous) {
    // Bordo spesso e vivo: il rosso border da solo e' spento.
    element.style.border = '2px solid var(--dash-danger-border)';
    element.style.borderColor = 'color-mix(in srgb, var(--dash-danger-border) 60%, #ff7a7a)';
    element.style.color = 'var(--dash-danger-text)';
    label.style.color = 'var(--dash-danger-text)';
    formulaEl.style.color = 'var(--dash-danger-text)';
    element.style.background = 'var(--dash-danger-bg)';
    element.style.background = 'color-mix(in srgb, var(--dash-danger-border) 45%, var(--dash-surface-2))';
    if (diceAnomalyReason) {
      const host = element as HTMLElement & { __hideAnomalyTip?: (() => void) | null };
      const showAnomalyTip = () => {
        if (host.__hideAnomalyTip || !element.isConnected) return;
        host.__hideAnomalyTip = showInlineBoxTipAbove(element, diceAnomalyReason);
      };
      const hideAnomalyTipNow = () => { host.__hideAnomalyTip?.(); host.__hideAnomalyTip = null; };
      element.addEventListener('mouseenter', showAnomalyTip);
      element.addEventListener('mouseleave', hideAnomalyTipNow);
      element.addEventListener('focusin', showAnomalyTip);
      element.addEventListener('focusout', hideAnomalyTipNow);
    }
  }
  // Click sull'elemento (mai dai puntini): tira sempre la formula indicata
  // nel Valore. Formula vuota o sintassi non valida: niente tiro.
  element.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('.tiptap-inline-dice-menu-trigger')) return;
    const currentPos = getPos();
    if (typeof currentPos !== 'number') return;
    const current = getDiceAt(view.state, currentPos);
    if (!current || !current.formula.trim()) return;
    if (!isValidModifierFormula(current.formula) && !parseModifierValue(current.formula)) return;
    event.stopPropagation();
    window.dispatchEvent(
      new CustomEvent<NoteModifierRollRequest>(NOTE_MODIFIER_ROLL_EVENT, {
        detail: { pos: currentPos },
      }),
    );
  });

  // Misura coordinata condivisa col Modificatore (stessa riga visiva).
  registerInlineBoxWidget(element, { view, getPos });
  (element as HTMLElement & { __destroyDiceWidget?: () => void }).__destroyDiceWidget = () => {
    (element as HTMLElement & { __hideAnomalyTip?: (() => void) | null }).__hideAnomalyTip?.();
    unregisterInlineBoxWidget(element);
  };
  return element;
}

export const InlineDice = Mark.create({
  name: 'inlineDice',
  // inclusive:false come il Modificatore: il testo digitato dopo un Dado non
  // deve ereditare il mark.
  inclusive: false,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-dice-id'),
        renderHTML: (attributes) => (attributes.id ? { 'data-dice-id': attributes.id } : {}),
      },
      name: {
        default: DICE_DEFAULT_NAME,
        parseHTML: (element) => element.getAttribute('data-dice-name') ?? DICE_DEFAULT_NAME,
        renderHTML: (attributes) => ({ 'data-dice-name': attributes.name }),
      },
      formula: {
        default: DICE_DEFAULT_FORMULA,
        parseHTML: (element) => element.getAttribute('data-dice-formula') ?? DICE_DEFAULT_FORMULA,
        renderHTML: (attributes) => ({ 'data-dice-formula': attributes.formula }),
      },
      titleBold: {
        default: false,
        parseHTML: (element) => element.getAttribute('data-dice-title-bold') === 'true',
        renderHTML: (attributes) => (attributes.titleBold ? { 'data-dice-title-bold': 'true' } : {}),
      },
      titleItalic: {
        default: false,
        parseHTML: (element) => element.getAttribute('data-dice-title-italic') === 'true',
        renderHTML: (attributes) => (attributes.titleItalic ? { 'data-dice-title-italic': 'true' } : {}),
      },
      titleUnderline: {
        default: false,
        parseHTML: (element) => element.getAttribute('data-dice-title-underline') === 'true',
        renderHTML: (attributes) => (attributes.titleUnderline ? { 'data-dice-title-underline': 'true' } : {}),
      },
      titleStrike: {
        default: false,
        parseHTML: (element) => element.getAttribute('data-dice-title-strike') === 'true',
        renderHTML: (attributes) => (attributes.titleStrike ? { 'data-dice-title-strike': 'true' } : {}),
      },
      titleFontSize: {
        default: null,
        parseHTML: (element) => {
          const raw = element.getAttribute('data-dice-title-font-size');
          const parsed = raw ? Number.parseInt(raw, 10) : NaN;
          return Number.isFinite(parsed) ? parsed : null;
        },
        renderHTML: (attributes) => (typeof attributes.titleFontSize === 'number' ? { 'data-dice-title-font-size': String(attributes.titleFontSize) } : {}),
      },
      titleFontFamily: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-dice-title-font-family') ?? null,
        renderHTML: (attributes) => (attributes.titleFontFamily ? { 'data-dice-title-font-family': attributes.titleFontFamily } : {}),
      },
      titleAlign: {
        default: DICE_TITLE_FORMAT_DEFAULTS.align,
        parseHTML: (element) => {
          const raw = element.getAttribute('data-dice-title-align');
          return raw === 'left' || raw === 'center' || raw === 'right' ? raw : DICE_TITLE_FORMAT_DEFAULTS.align;
        },
        renderHTML: (attributes) => (attributes.titleAlign ? { 'data-dice-title-align': attributes.titleAlign } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-inline-dice]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-inline-dice': 'true' }), 0];
  },

  addCommands() {
    return {
      insertInlineDice:
        () =>
        ({ state, dispatch }) => {
          const markType = state.schema.marks[this.name];
          if (!markType) return false;
          if (!dispatch) return true;

          const tr = state.tr.deleteSelection();
          let insertPos = tr.selection.from;
          // Dopo un Modificatore o un altro Dado: uno spazio vero in mezzo e
          // restringimento preventivo, cosi' il nuovo Dado resta di fianco.
          let previousIsBox = false;
          if (insertPos > 0 && tr.doc.textBetween(insertPos - 1, insertPos, '', '') === INLINE_MODIFIER_CHAR) {
            tr.doc.nodesBetween(insertPos - 1, insertPos, (node) => {
              if (previousIsBox || !node.isText) return;
              previousIsBox = node.marks.some((mark) => mark.type === markType || mark.type.name === 'inlineModifier');
            });
          }
          if (previousIsBox) {
            makeRoomForInlineModifierInsertion(state, insertPos);
            makeRoomForInlineDiceInsertion(state, insertPos);
            tr.insertText(' ', insertPos);
            insertPos += 1;
          }

          tr.insert(insertPos, state.schema.text(INLINE_MODIFIER_CHAR, [markType.create({
            id: createDiceId(),
            name: DICE_DEFAULT_NAME,
            formula: DICE_DEFAULT_FORMULA,
            titleBold: false,
            titleItalic: false,
            titleUnderline: false,
            titleStrike: false,
            titleFontSize: null,
            titleFontFamily: null,
            titleAlign: DICE_TITLE_FORMAT_DEFAULTS.align,
          })]));
          tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
          dispatch(tr.scrollIntoView());
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const markName = this.name;

    // Stesso ritocco di selezione del Modificatore per il caso d'angolo in
    // cui il Dado e' l'ULTIMO carattere del blocco.
    const nudgeToRightOfTrailingDice = (view: EditorView, pos: number, event: MouseEvent): boolean => {
      if (event.defaultPrevented || !view.editable) return false;
      if (event.button !== 0) return false;
      if (!view.state.selection.empty) return false;
      if (!(event.target instanceof Element)) return false;
      if (event.target.closest(DICE_WIDGET_SELECTOR)) return false;
      const markType = view.state.schema.marks.inlineDice;
      if (!markType || view.state.doc.textBetween(pos, pos + 1) !== INLINE_MODIFIER_CHAR) return false;
      let hasDiceMark = false;
      view.state.doc.nodesBetween(pos, pos + 1, (node) => {
        if (node.isText && node.text === INLINE_MODIFIER_CHAR) hasDiceMark = node.marks.some((mark) => mark.type === markType);
      });
      if (!hasDiceMark) return false;
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
        key: new PluginKey('inlineDiceWidget'),
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return;
              const mark = node.marks.find((item) => item.type.name === markName);
              if (!mark) return;

              const name = String(mark.attrs.name ?? DICE_DEFAULT_NAME);
              const rawFormula = typeof mark.attrs.formula === 'string' && mark.attrs.formula ? mark.attrs.formula : DICE_DEFAULT_FORMULA;
              const id = typeof mark.attrs.id === 'string' && mark.attrs.id ? mark.attrs.id : null;
              const titleFormat: ModifierTitleFormat = {
                bold: mark.attrs.titleBold === true,
                italic: mark.attrs.titleItalic === true,
                underline: mark.attrs.titleUnderline === true,
                strike: mark.attrs.titleStrike === true,
                fontSize: typeof mark.attrs.titleFontSize === 'number' ? mark.attrs.titleFontSize : null,
                fontFamily: typeof mark.attrs.titleFontFamily === 'string' && mark.attrs.titleFontFamily ? mark.attrs.titleFontFamily : null,
                align: mark.attrs.titleAlign === 'left' || mark.attrs.titleAlign === 'center' || mark.attrs.titleAlign === 'right' ? mark.attrs.titleAlign : DICE_TITLE_FORMAT_DEFAULTS.align,
              };
              const titleKey = `${titleFormat.bold ? 1 : 0}${titleFormat.italic ? 1 : 0}${titleFormat.underline ? 1 : 0}${titleFormat.strike ? 1 : 0}:${titleFormat.fontSize ?? ''}:${titleFormat.fontFamily ?? ''}:${titleFormat.align ?? ''}`;
              // Il flag anomalia e' nella key come nel Modificatore: se un
              // Modificatore referenziato viene eliminato, la key cambia e il
              // widget viene ricostruito rosso (senza, ProseMirror riuserebbe
              // il vecchio DOM e il Dado resterebbe neutro).
              const diceAnomalous = assessDiceFormula(rawFormula, getModifierLookupForState(state)).anomalous;
              for (let offset = 0; offset < node.nodeSize; offset++) {
                if (node.text.charAt(offset) !== INLINE_MODIFIER_CHAR) continue;
                const dicePos = pos + offset;
                decorations.push(
                  Decoration.widget(
                    dicePos,
                    (view, getPos) => buildDiceWidget(view, getPos, name, rawFormula, titleFormat),
                    {
                      side: 0,
                      key: `dice:${id ?? dicePos}:${name}:${rawFormula}:${titleKey}:${diceAnomalous ? 1 : 0}`,
                      destroy: (node) => {
                        (node as HTMLElement & { __destroyDiceWidget?: () => void }).__destroyDiceWidget?.();
                        unregisterInlineBoxWidget(node as HTMLElement);
                      },
                    },
                  ),
                );
              }
            });
            return DecorationSet.create(state.doc, decorations);
          },
          handleDOMEvents: {
            mousedown(view, event) {
              if (!view.editable || event.button !== 0) return false;
              if (!(event.target instanceof Element)) return false;
              if (event.target.closest(DICE_WIDGET_SELECTOR)) return false;
              const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
              if (!coords) return false;
              if (nudgeToRightOfTrailingDice(view, coords.pos, event)) {
                event.preventDefault();
                view.focus();
                return true;
              }
              return false;
            },
          },
          handleTextInput(view, from, to, text) {
            if (!view.editable || from !== to || !view.state.selection.empty) return false;
            if (!makeRoomForInlineDiceText(view, from, text)) return false;
            return false;
          },
          handleClick(view, pos, event) {
            return nudgeToRightOfTrailingDice(view, pos, event);
          },
        },
      }),
    ];
  },
});
