import { Mark, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    inlineCheckbox: {
      /** Inserisce una checkbox autonoma alla posizione del cursore. */
      insertInlineCheckbox: () => ReturnType;
    };
  }
}

export interface InlineCheckboxOptions {
  /** Permesso runtime al toggle. Separato da editor.editable: una nota può
   * essere fuori dalla modalità modifica ma la checkbox deve restare
   * cliccabile; un utente senza permesso di modifica invece non deve
   * generare scritture content_rich. */
  canToggle: () => boolean;
}

// Stessa architettura delle icone inline: il documento contiene un vero
// singolo carattere ZWSP marcato, mentre la grafica è una Decoration.widget.
// Per ProseMirror Backspace/Delete/frecce vedono quindi una normale posizione
// di testo, non un Node atom speciale da selezionare o gestire a mano.
export const INLINE_CHECKBOX_CHAR = '\u200b';

function getInlineCheckboxMark(state: EditorState, pos: number) {
  const markType = state.schema.marks.inlineCheckbox;
  if (!markType || pos < 0 || pos >= state.doc.content.size) return null;

  let found: ReturnType<typeof markType.create> | null = null;
  state.doc.nodesBetween(pos, Math.min(pos + 1, state.doc.content.size), (node, nodePos) => {
    if (found || !node.isText) return;
    const offset = pos - nodePos;
    if (offset < 0 || offset >= node.nodeSize) return;
    if (node.text?.charAt(offset) !== INLINE_CHECKBOX_CHAR) return;
    found = node.marks.find((mark) => mark.type === markType) ?? null;
  });
  return found;
}

/** Aggiorna una sola checkbox, anche quando più checkbox consecutive sono
 * fuse da ProseMirror nello stesso text node. Il range è sempre un solo
 * carattere: i vicini non vengono toccati. */
export function setInlineCheckboxChecked(
  state: EditorState,
  dispatch: ((transaction: Transaction) => void) | undefined,
  pos: number,
  checked: boolean,
): boolean {
  const markType = state.schema.marks.inlineCheckbox;
  const currentMark = getInlineCheckboxMark(state, pos);
  if (!markType || !currentMark) return false;

  if (dispatch) {
    const transaction = state.tr
      .removeMark(pos, pos + 1, markType)
      .addMark(pos, pos + 1, markType.create({ checked }));
    dispatch(transaction);
  }
  return true;
}

function buildCheckboxWidget(
  view: EditorView,
  getPos: () => number | undefined,
  checked: boolean,
  canToggle: () => boolean,
): HTMLElement {
  const element = document.createElement('span');
  element.className = 'tiptap-inline-checkbox-widget';
  element.dataset.checked = String(checked);
  element.setAttribute('role', 'checkbox');
  element.setAttribute('aria-checked', String(checked));
  element.setAttribute('aria-label', checked ? 'Checkbox selezionata' : 'Checkbox non selezionata');

  // Stile inline intenzionale: la checkbox è una Decoration.widget e non
  // richiede un nuovo blocco CSS globale. Bordo e spunta usano il colore
  // standard del testo della palette attiva, senza stati verdi dedicati.
  Object.assign(element.style, {
    display: 'inline-block',
    boxSizing: 'border-box',
    width: '1em',
    height: '1em',
    margin: '0 0.12em',
    verticalAlign: '-0.12em',
    border: '2px solid var(--dash-text)',
    borderRadius: '0.22em',
    background: 'transparent',
    cursor: canToggle() ? 'pointer' : 'default',
    position: 'relative',
    userSelect: 'none',
  });

  if (checked) {
    const checkmark = document.createElement('span');
    Object.assign(checkmark.style, {
      position: 'absolute',
      inset: '0',
      margin: 'auto',
      width: '0.25em',
      height: '0.5em',
      border: 'solid var(--dash-text)',
      borderWidth: '0 0.12em 0.12em 0',
      transform: 'translateY(-0.04em) rotate(45deg)',
      pointerEvents: 'none',
    });
    element.appendChild(checkmark);
  }

  const interactive = canToggle();
  element.dataset.interactive = String(interactive);
  if (interactive) {
    element.tabIndex = 0;
  } else {
    element.setAttribute('aria-disabled', 'true');
  }

  element.addEventListener('focus', () => {
    if (!canToggle()) return;
    element.style.outline = '2px solid var(--dash-accent)';
    element.style.outlineOffset = '2px';
  });
  element.addEventListener('blur', () => {
    element.style.outline = '';
    element.style.outlineOffset = '';
  });

  const toggle = () => {
    if (!canToggle()) return;
    const pos = getPos();
    if (typeof pos !== 'number') return;
    const currentMark = getInlineCheckboxMark(view.state, pos);
    if (!currentMark) return;
    setInlineCheckboxChecked(view.state, (transaction) => view.dispatch(transaction), pos, !Boolean(currentMark.attrs.checked));
  };

  // Il click sulla checkbox non deve diventare anche un click sul contenitore
  // read-only della nota (che altrimenti entrerebbe in modalità modifica).
  // preventDefault sul mousedown mantiene inoltre il focus dell'editor quando
  // si sta già scrivendo, evitando un blur solo per aver spuntato una casella.
  element.addEventListener('mousedown', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  element.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggle();
  });
  element.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    toggle();
  });

  return element;
}

export const InlineCheckbox = Mark.create<InlineCheckboxOptions>({
  name: 'inlineCheckbox',
  inclusive: false,

  addOptions() {
    return {
      canToggle: () => true,
    };
  },

  addAttributes() {
    return {
      checked: {
        default: false,
        parseHTML: (element) => element.getAttribute('data-checked') === 'true',
        renderHTML: (attributes) => ({ 'data-checked': String(Boolean(attributes.checked)) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-inline-checkbox]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-inline-checkbox': 'true' }), 0];
  },

  addCommands() {
    return {
      insertInlineCheckbox:
        () =>
        ({ chain }) =>
          chain()
            .focus()
            .insertContent({
              type: 'text',
              text: INLINE_CHECKBOX_CHAR,
              marks: [{ type: this.name, attrs: { checked: false } }],
            })
            .run(),
    };
  },

  addProseMirrorPlugins() {
    const markName = this.name;
    const canToggle = this.options.canToggle;

    return [
      new Plugin({
        key: new PluginKey('inlineCheckboxWidget'),
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return;
              const mark = node.marks.find((item) => item.type.name === markName);
              if (!mark) return;

              const checked = Boolean(mark.attrs.checked);
              for (let offset = 0; offset < node.nodeSize; offset++) {
                if (node.text.charAt(offset) !== INLINE_CHECKBOX_CHAR) continue;
                decorations.push(
                  Decoration.widget(
                    pos + offset,
                    (view, getPos) => buildCheckboxWidget(view, getPos, checked, canToggle),
                    { side: 0 },
                  ),
                );
              }
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
