// Tecnica del "div specchio" per misurare la posizione in pixel del cursore
// dentro una <textarea> nativa (il DOM non la espone direttamente) - nessuna
// dipendenza nuova, tecnica nota (stessa idea della libreria
// textarea-caret-position): si clona lo stile calcolato della textarea su un
// div nascosto, si inserisce il testo fino al cursore + uno span marcatore,
// e si legge la posizione dello span.

const MIRROR_PROPERTIES = [
  'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderStyle',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'fontFamily',
  'lineHeight', 'textAlign', 'textTransform', 'textIndent', 'textDecoration',
  'letterSpacing', 'wordSpacing', 'tabSize', 'whiteSpace', 'wordWrap',
] as const;

export interface CaretRect {
  /** Coordinate assolute rispetto al viewport (stesso sistema di
   *  getBoundingClientRect) - direttamente utilizzabili per un portal in
   *  position:fixed, stesso pattern gia' usato per gli altri menu dell'app
   *  (EntityTabBar.tsx/NoteListRow.tsx). */
  top: number;
  left: number;
  height: number;
}

export function getTextareaCaretRect(textarea: HTMLTextAreaElement, position: number): CaretRect {
  const div = document.createElement('div');
  const computed = window.getComputedStyle(textarea);

  div.style.position = 'absolute';
  div.style.visibility = 'hidden';
  div.style.whiteSpace = 'pre-wrap';
  div.style.wordWrap = 'break-word';

  for (const prop of MIRROR_PROPERTIES) {
    (div.style as unknown as Record<string, string>)[prop] = computed[prop as keyof CSSStyleDeclaration] as string;
  }
  div.style.width = computed.width;

  document.body.appendChild(div);
  div.textContent = textarea.value.slice(0, position);

  const span = document.createElement('span');
  // Contenuto minimo non vuoto: uno span vuoto non ha una box da misurare
  // in modo affidabile in ogni browser.
  span.textContent = textarea.value.slice(position) || '.';
  div.appendChild(span);

  const textareaRect = textarea.getBoundingClientRect();
  const lineHeight = parseFloat(computed.lineHeight) || span.offsetHeight;
  const rect: CaretRect = {
    top: textareaRect.top + span.offsetTop - textarea.scrollTop,
    left: textareaRect.left + span.offsetLeft - textarea.scrollLeft,
    height: lineHeight,
  };

  document.body.removeChild(div);
  return rect;
}
