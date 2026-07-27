import { useLayoutEffect, useRef, useState } from 'react';
import { applyHeadingToLine, detectHeadingLevel, HEADING_CLASSES, type HeadingLevel } from './markdownHeadings';

export interface HeadingCommand {
  value: string;
  label: string;
  level: HeadingLevel;
}

export const HEADING_COMMANDS: HeadingCommand[] = [
  { value: 'h1', label: 'Titolo 1', level: 1 },
  { value: 'h2', label: 'Titolo 2', level: 2 },
  { value: 'h3', label: 'Titolo 3', level: 3 },
  { value: 'h4', label: 'Titolo 4', level: 4 },
];

const LINE_BASE_CLASS = 'whitespace-pre-wrap break-words';

interface SlashState {
  lineEl: HTMLDivElement;
  slashStart: number;
  query: string;
  anchor: { top: number; left: number };
}

export interface SlashMenuState {
  anchor: { top: number; left: number };
  commands: HeadingCommand[];
  highlighted: string;
  setHighlighted: (value: string) => void;
  selectCommand: (level: HeadingLevel) => void;
}

export interface UseLineBasedEditorParams {
  value: string;
  onChange: (value: string) => void;
}

// --- utility DOM, nessuno stato React: operano direttamente sulla Selection/
// sui nodi, stesso principio "mutazione diretta invece di re-render" di
// tutto il motore - vedi il commento sul componente in fondo al file.

function getOffsetWithinLine(lineEl: HTMLElement, container: Node, containerOffset: number): number {
  const preRange = document.createRange();
  preRange.selectNodeContents(lineEl);
  preRange.setEnd(container, containerOffset);
  return preRange.toString().length;
}

// Il rect del caret puo' risultare tutto-zero (Chrome) quando il range
// collassato non ha alcun glyph renderizzato da misurare - tipicamente un
// caret dentro/accanto a un nodo di testo vuoto (riga vuota, es. il primo
// "/" di una riga appena creata con Invio). lineEl e' passato come fallback:
// il <div> di riga ha sempre un'altezza (line-height) anche da vuoto, quindi
// il suo rect resta valido dove quello del caret non lo e'.
function getCaretViewportPosition(lineEl?: HTMLElement): { top: number; left: number } {
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0).cloneRange();
    range.collapse(true);
    const rect = range.getBoundingClientRect();
    if (rect.top !== 0 || rect.left !== 0 || rect.width !== 0 || rect.height !== 0) {
      return { top: rect.bottom, left: rect.left };
    }
  }
  if (lineEl) {
    const lineRect = lineEl.getBoundingClientRect();
    return { top: lineRect.bottom, left: lineRect.left };
  }
  return { top: 0, left: 0 };
}

function setCaretAtLineOffset(lineEl: HTMLElement, offset: number) {
  const textNode = lineEl.firstChild ?? lineEl.appendChild(document.createTextNode(''));
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  const safeOffset = Math.min(offset, textNode.textContent?.length ?? 0);
  range.setStart(textNode, safeOffset);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

function filterCommands(query: string): HeadingCommand[] {
  const q = query.toLowerCase();
  return HEADING_COMMANDS.filter((c) => c.label.toLowerCase().includes(q));
}

// Imposta il testo di una riga garantendo che rimanga sempre almeno un nodo
// di testo (anche vuoto) al suo interno. `el.textContent = ''` rimuove ogni
// figlio: un <div> di riga completamente vuoto (zero nodi) e' un punto
// d'aggancio ambiguo per la Selection del browser, che in quel caso puo'
// ancorare il cursore al livello del container invece che dentro il div e
// inserire il primo carattere digitato come nodo di testo "orfano" fratello
// dei div di riga invece che figlio del div - vedi getActiveLineElement.
function setLineText(el: HTMLDivElement, text: string) {
  el.textContent = text;
  if (!el.firstChild) el.appendChild(document.createTextNode(''));
}

/**
 * Motore di editing a righe per SlashCommandEditor.tsx - contentEditable
 * NON controllato da React (il DOM e' la fonte di verita' durante la
 * modifica): un <div> per riga, un attributo data-level su ognuno per
 * sapere se va riclassificato. Si interviene sul DOM in modo "chirurgico"
 * (solo className quando il livello di una riga cambia, mai sostituendo
 * children React ad ogni tasto) proprio per evitare i due sintomi classici
 * di un contentEditable pienamente controllato: cursore che salta ad ogni
 * render, undo nativo del browser che si confonde. Vedi il piano per
 * l'indagine completa.
 */
export function useLineBasedEditor({ value, onChange }: UseLineBasedEditorParams) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Ultimo valore che ABBIAMO emesso noi stessi via onChange - distingue un
  // cambio di `value` "in eco" (il nostro stesso onInput, tornato indietro
  // come prop dal genitore) da un cambio ESTERNO vero (cambio nota,
  // aggiornamento realtime da un altro client): solo il secondo giustifica
  // di ricostruire il DOM da zero.
  const lastEmittedRef = useRef<string>(value);
  const isMountedRef = useRef(false);
  const isComposingRef = useRef(false);

  const [slashState, setSlashState] = useState<SlashState | null>(null);
  const [highlighted, setHighlighted] = useState(HEADING_COMMANDS[0].value);

  const applyLineClass = (el: HTMLDivElement, level: 0 | HeadingLevel) => {
    if (el.dataset.level === String(level)) return;
    el.dataset.level = String(level);
    el.className = level === 0 ? LINE_BASE_CLASS : `${LINE_BASE_CLASS} ${HEADING_CLASSES[level]}`;
  };

  const buildLineElement = (text: string): HTMLDivElement => {
    const el = document.createElement('div');
    setLineText(el, text);
    applyLineClass(el, detectHeadingLevel(text));
    return el;
  };

  const initFromValue = (v: string) => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = '';
    for (const line of v.split('\n')) container.appendChild(buildLineElement(line));
    lastEmittedRef.current = v;
  };

  useLayoutEffect(() => {
    if (!isMountedRef.current || value !== lastEmittedRef.current) {
      initFromValue(value);
    }
    isMountedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const getActiveLineElement = (): HTMLDivElement | null => {
    const container = containerRef.current;
    const sel = window.getSelection();
    if (!container || !sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    const startContainer = range.startContainer;

    // Caso normale: il punto di partenza e' dentro (o e' esso stesso) un
    // <div> di riga. closest() opera solo su Element: se il nodo di
    // partenza e' un nodo di testo si parte dal suo elemento genitore, poi
    // closest() risale TUTTI gli antenati (non un solo passo) cercando il
    // <div> di riga piu' vicino, riconoscibile dall'attributo data-level.
    const startEl = startContainer.nodeType === Node.TEXT_NODE
      ? startContainer.parentElement
      : (startContainer as Element | null);
    if (startEl && startEl !== container) {
      const lineEl = startEl.closest<HTMLDivElement>('[data-level]');
      if (lineEl && lineEl.parentElement === container) {
        return lineEl;
      }
    }

    // Caso riga vuota: confermato via log che il browser puo' ancorare la
    // selezione DIRETTAMENTE sul container esterno (startContainer ===
    // container), con startOffset = indice del figlio davanti al quale si
    // trova il cursore (semantica standard di Range quando il container e'
    // un Element, non un nodo di testo). closest() non puo' aiutare qui:
    // risale solo gli ANTENATI, mai i discendenti, e il container stesso
    // non ha mai data-level (non e' una riga). Bisogna invece SCENDERE nei
    // figli usando l'offset.
    if (startContainer === container) {
      const children = container.children;
      if (children.length === 0) return null;
      const index = Math.min(Math.max(range.startOffset, 0), children.length - 1);
      const child = children[index];
      return child instanceof HTMLDivElement ? child : null;
    }

    return null;
  };

  const emitChange = () => {
    const container = containerRef.current;
    if (!container) return;
    const text = Array.from(container.children)
      .map((el) => (el as HTMLElement).textContent ?? '')
      .join('\n');
    lastEmittedRef.current = text;
    onChange(text);
  };

  const closeSlashMenu = () => setSlashState(null);

  const selectCommand = (level: HeadingLevel) => {
    if (!slashState) return;
    const { lineEl, slashStart } = slashState;
    const sel = window.getSelection();
    const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
    const cursorOffset = range ? getOffsetWithinLine(lineEl, range.startContainer, range.startOffset) : slashStart;
    const lineText = lineEl.textContent ?? '';
    const result = applyHeadingToLine(lineText, slashStart, cursorOffset, level);

    setLineText(lineEl, result.text);
    applyLineClass(lineEl, level);
    setCaretAtLineOffset(lineEl, result.cursorPos);
    closeSlashMenu();
    emitChange();
  };

  // Aggiorna classe della riga attiva + stato del popup slash - richiamata
  // da onInput e dalla fine di una composizione IME (mai durante).
  const syncActiveLine = () => {
    const lineEl = getActiveLineElement();
    const sel = window.getSelection();
    if (!lineEl || !sel || sel.rangeCount === 0) {
      if (slashState) closeSlashMenu();
      return;
    }
    const range = sel.getRangeAt(0);
    const cursorOffset = getOffsetWithinLine(lineEl, range.startContainer, range.startOffset);
    const lineText = lineEl.textContent ?? '';

    applyLineClass(lineEl, detectHeadingLevel(lineText));

    if (slashState && slashState.lineEl === lineEl) {
      const query = lineText.slice(slashState.slashStart, cursorOffset);
      // Nessun comando corrisponde piu' alla query: chiudere invece di
      // lasciare lo stato aperto ma invisibile (slashMenu si annulla altrove
      // per commands.length === 0, ma slashState restava vivo, agganciato a
      // questa lineEl - il prossimo "/" sulla riga veniva letto come "popup
      // gia' aperto" invece che come nuovo tentativo, trigger apparentemente
      // rotto).
      if (cursorOffset <= slashState.slashStart || /\s/.test(query) || filterCommands(query).length === 0) {
        closeSlashMenu();
      } else {
        setSlashState({ ...slashState, query, anchor: getCaretViewportPosition(lineEl) });
      }
      return;
    }

    // L'apertura del popup vive interamente in handleBeforeInput (blocca il
    // primo "/" prima che finisca nel testo) - qui restano solo l'aggiornamento
    // della query sopra e la chiusura di uno stato ormai orfano (riga cambiata).
    if (slashState) closeSlashMenu();
  };

  const handleInput = () => {
    if (isComposingRef.current) return;

    // Il Backspace a meta' riga non e' mai intercettato (handleKeyDown lo
    // lascia al comportamento nativo): quando cancella l'ultimo carattere di
    // una riga e' l'UNICO punto in cui il div puo' restare senza un nodo di
    // testo (rimosso del tutto dal browser, o sostituito con un <br>) - lo
    // stesso stato ambiguo per cui setLineText garantisce sempre un nodo di
    // testo anche vuoto, ma solo per le mutazioni che facciamo noi (vedi il
    // suo commento). Senza ripristinare l'invariante anche qui, getActiveLineElement
    // per il tasto successivo (es. "/") puo' ancorarsi in modo ambiguo e far
    // fallire silenziosamente l'intercettazione in handleBeforeInput.
    const lineEl = getActiveLineElement();
    if (lineEl && lineEl.textContent === '' && !(lineEl.childNodes.length === 1 && lineEl.firstChild?.nodeType === Node.TEXT_NODE)) {
      setLineText(lineEl, '');
      setCaretAtLineOffset(lineEl, 0);
    }

    emitChange();
    syncActiveLine();
  };

  const handleCompositionStart = () => { isComposingRef.current = true; };
  const handleCompositionEnd = () => {
    isComposingRef.current = false;
    emitChange();
    syncActiveLine();
  };

  // Intercetta l'inserimento di testo semplice PRIMA che il browser lo
  // esegua autonomamente. Necessario perche' su una riga vuota (un <div>
  // con un solo nodo di testo vuoto, vedi setLineText) il comportamento
  // nativo del browser per "insertText" non e' garantito scrivere nel nodo
  // di testo esistente: puo' invece creare un nuovo elemento "fantasma" per
  // contenere il carattere digitato, che finisce fuori dalla struttura a
  // righe che gli altri handler si aspettano (getActiveLineElement non lo
  // trova piu' come riga valida). Scrivendo il carattere a mano, nel punto
  // esatto del testo della riga corrente, eliminiamo l'incertezza sul
  // risultato della mutazione DOM nativa per questo caso.
  // Non intercetta: composizione IME (isComposingRef, gestita a parte da
  // compositionstart/compositionend), cancellazioni/Invio/incolla (nessun
  // testo in e.data, vedi sotto - gia' gestiti rispettivamente da
  // handleKeyDown/handlePaste, o lasciati al comportamento nativo per il
  // Backspace non a inizio riga).
  const handleBeforeInput = (e: React.FormEvent<HTMLDivElement>) => {
    if (isComposingRef.current) return;
    const nativeEvent = e.nativeEvent as InputEvent;
    // inputType su beforeinput per contentEditable non e' affidabile in
    // tutti i browser/percorsi di inserimento (risultava undefined in
    // produzione anche per una digitazione normale) - e.data invece e'
    // sempre presente e corretto per un inserimento di testo semplice
    // (la stringa effettivamente digitata): usiamo quello.
    const data = nativeEvent.data;
    if (typeof data !== 'string' || data.length === 0) return;

    const lineEl = getActiveLineElement();
    const sel = window.getSelection();
    if (!lineEl || !sel || sel.rangeCount === 0) return;

    e.preventDefault();
    const range = sel.getRangeAt(0);
    const offset = getOffsetWithinLine(lineEl, range.startContainer, range.startOffset);

    // Il trigger "/" del popup comandi non finisce MAI da solo nel testo: il
    // primo "/" (popup chiuso per questa riga) viene bloccato qui e apre solo
    // il popup, senza scrivere nulla - cosi' slashStart e' sempre "dove inizia
    // la query", mai "indice di un carattere / da saltare" (vedi syncActiveLine).
    // Un secondo "/" digitato mentre il popup e' gia' aperto per QUESTA riga e'
    // invece l'unico modo per ottenere lo slash letterale: lo lasciamo inserire
    // normalmente e chiudiamo il popup senza applicare alcun comando.
    if (data === '/' && !(slashState && slashState.lineEl === lineEl)) {
      setSlashState({ lineEl, slashStart: offset, query: '', anchor: getCaretViewportPosition(lineEl) });
      setHighlighted(HEADING_COMMANDS[0].value);
      return;
    }

    const text = lineEl.textContent ?? '';
    const newText = text.slice(0, offset) + data + text.slice(offset);

    setLineText(lineEl, newText);
    applyLineClass(lineEl, detectHeadingLevel(newText));
    setCaretAtLineOffset(lineEl, offset + data.length);
    emitChange();

    if (data === '/') {
      // Chiusura esplicita invece di syncActiveLine: slashState nella closure
      // di questa chiamata e' ancora il valore pre-update (setState non e'
      // sincrono), quindi syncActiveLine vedrebbe lo stato "vecchio" ancora
      // aperto e riaprirebbe subito il popup sullo slash appena inserito.
      closeSlashMenu();
      return;
    }

    syncActiveLine();
  };

  const handleEnterSplit = () => {
    const lineEl = getActiveLineElement();
    const sel = window.getSelection();
    if (!lineEl || !sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const offset = getOffsetWithinLine(lineEl, range.startContainer, range.startOffset);
    const text = lineEl.textContent ?? '';
    const before = text.slice(0, offset);
    const after = text.slice(offset);

    setLineText(lineEl, before);
    applyLineClass(lineEl, detectHeadingLevel(before));

    const newLineEl = buildLineElement(after);
    lineEl.after(newLineEl);
    setCaretAtLineOffset(newLineEl, 0);

    closeSlashMenu();
    emitChange();
  };

  const handleBackspaceMerge = (lineEl: HTMLDivElement) => {
    const prevEl = lineEl.previousElementSibling as HTMLDivElement | null;
    if (!prevEl) return;
    const prevText = prevEl.textContent ?? '';
    const mergedOffset = prevText.length;
    const combined = prevText + (lineEl.textContent ?? '');

    setLineText(prevEl, combined);
    applyLineClass(prevEl, detectHeadingLevel(combined));
    lineEl.remove();

    setCaretAtLineOffset(prevEl, mergedOffset);
    closeSlashMenu();
    emitChange();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (isComposingRef.current) return;

    if (slashState) {
      if (e.key === 'Escape') { e.preventDefault(); closeSlashMenu(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const filtered = filterCommands(slashState.query);
        if (filtered.length === 0) return;
        const idx = filtered.findIndex((c) => c.value === highlighted);
        const nextIdx = e.key === 'ArrowDown'
          ? (idx + 1) % filtered.length
          : (idx - 1 + filtered.length) % filtered.length;
        setHighlighted(filtered[nextIdx].value);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const filtered = filterCommands(slashState.query);
        const cmd = filtered.find((c) => c.value === highlighted) ?? filtered[0];
        if (cmd) selectCommand(cmd.level);
        return;
      }
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      handleEnterSplit();
      return;
    }

    if (e.key === 'Backspace') {
      const lineEl = getActiveLineElement();
      const sel = window.getSelection();
      if (!lineEl || !sel || sel.rangeCount === 0 || !sel.isCollapsed) return;
      const range = sel.getRangeAt(0);
      const offset = getOffsetWithinLine(lineEl, range.startContainer, range.startOffset);
      if (offset === 0 && lineEl.previousElementSibling) {
        e.preventDefault();
        handleBackspaceMerge(lineEl);
      }
      // Altrimenti comportamento nativo (cancella un carattere dentro la riga).
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    const lineEl = getActiveLineElement();
    const sel = window.getSelection();
    if (!lineEl || !sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    const startOffset = getOffsetWithinLine(lineEl, range.startContainer, range.startOffset);
    // Selezione multi-riga (endContainer fuori da questa riga): caso
    // segnalato come piu' fragile, non gestito qui - si incolla al punto di
    // inizio senza cancellare le altre righe coinvolte, l'utente sistema a
    // mano. Selezione collassata o dentro la stessa riga: gestita per bene.
    const endInSameLine = sel.isCollapsed || lineEl.contains(range.endContainer);
    const endOffset = endInSameLine
      ? getOffsetWithinLine(lineEl, range.endContainer, range.endOffset)
      : startOffset;

    const lineText = lineEl.textContent ?? '';
    const before = lineText.slice(0, startOffset);
    const after = lineText.slice(endOffset);
    const pastedLines = text.split('\n');

    if (pastedLines.length === 1) {
      const newText = before + pastedLines[0] + after;
      setLineText(lineEl, newText);
      applyLineClass(lineEl, detectHeadingLevel(newText));
      setCaretAtLineOffset(lineEl, before.length + pastedLines[0].length);
    } else {
      const firstLineText = before + pastedLines[0];
      setLineText(lineEl, firstLineText);
      applyLineClass(lineEl, detectHeadingLevel(firstLineText));

      let insertAfter: HTMLDivElement = lineEl;
      for (let i = 1; i < pastedLines.length - 1; i++) {
        const midEl = buildLineElement(pastedLines[i]);
        insertAfter.after(midEl);
        insertAfter = midEl;
      }
      const lastLineText = pastedLines[pastedLines.length - 1] + after;
      const lastEl = buildLineElement(lastLineText);
      insertAfter.after(lastEl);
      setCaretAtLineOffset(lastEl, pastedLines[pastedLines.length - 1].length);
    }

    closeSlashMenu();
    emitChange();
  };

  const slashMenu: SlashMenuState | null = slashState ? {
    anchor: slashState.anchor,
    commands: filterCommands(slashState.query),
    highlighted,
    setHighlighted,
    selectCommand,
  } : null;

  return {
    containerRef,
    handleInput,
    handleBeforeInput,
    handleKeyDown,
    handlePaste,
    handleCompositionStart,
    handleCompositionEnd,
    slashMenu,
  };
}
