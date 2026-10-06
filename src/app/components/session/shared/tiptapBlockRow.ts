import { Node, mergeAttributes } from '@tiptap/core';
import { Fragment, type Node as PMNode, type Schema } from '@tiptap/pm/model';
import { GapCursor } from '@tiptap/pm/gapcursor';
import { Plugin, PluginKey, Selection, type EditorState, type Transaction, TextSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import type { Editor } from '@tiptap/react';

// Righe di blocchi affiancati (TextBox, Collapse, paragrafi "Testo"): piu'
// blocchi consecutivi condividono la stessa riga visiva e si dividono la
// larghezza in modo proporzionale (flex-grow equo, nessun passaggio di
// misura necessario). Niente wrap automatico: sotto la quota minima (3ch)
// i blocchi restano al minimo e tocca all'utente spezzare con Invio.
//
// - Invio dentro la riga sposta la serie di blocchi dal cursore alla fine
//   riga su una riga nuova sottostante; entrambe le righe si ridividono.
// - Il "+" laterale (NoteRowGutter) inserisce un nuovo elemento nella riga
//   (Testo / Box di testo / Collapse), accorciando le quote esistenti.
// - Un blocco fuori riga, al primo "+", viene avvolto in una riga con la
//   voce scelta (e qui la riga nasce con i suoi primi due elementi).
//
// Il nodo NON e' strutturale per noteContainerPolicy (max depth): non conta
// nella profondita' di contenitori, si possono quindi avere righe dentro
// TextBox e CollapseBody rispettando solo i limiti dei contenitori stessi.

export const BLOCK_ROW_CONTENT = '(paragraph | textBox | collapseBlock)+';

export type BlockRowItemKind = 'paragraph' | 'textBox' | 'collapseBlock';

function blockRowItemNode(schema: Schema, kind: BlockRowItemKind): PMNode {
  switch (kind) {
    case 'paragraph':
      return schema.nodes.paragraph.create();
    case 'textBox':
      return schema.nodes.textBox.createAndFill({}, [schema.nodes.paragraph.create()])!;
    case 'collapseBlock':
      return schema.nodes.collapseBlock.create(
        { open: false },
        [
          schema.nodes.collapseSummary.create({}, []),
          schema.nodes.collapseBody.create({}, [schema.nodes.paragraph.create()]),
        ],
      );
  }
}

// Trova l'antenato blockRow piu' vicino a $pos (o al blocco alla posizione).
function findBlockRowDepth($pos: { depth: number; node: (d: number) => PMNode }): number {
  for (let d = $pos.depth; d >= 0; d -= 1) {
    if ($pos.node(d).type.name === 'blockRow') return d;
  }
  return -1;
}

// Caret: Selection.near con bias forward entra nel primo punto di testo
// valido del primo elemento della riga (paragrafo o contenuto del box).
// +1 (non +2): con un primo paragrafo vuoto, +2 cade sul suo token di
// chiusura e near-forward scapperebbe nel secondo elemento.
function caretIntoFirstItem(tr: { doc: { resolve: (pos: number) => ReturnType<Editor['state']['doc']['resolve']> }; setSelection: (sel: Selection) => void }, rowStart: number) {
  const resolved = tr.doc.resolve(rowStart + 1);
  tr.setSelection(Selection.near(resolved, 1));
}

// Caret nell'elemento appena inserito: a sinistra e' il primo della riga,
// a destra e' l'ultimo (bias backward dalla fine riga). Senza questo, dopo
// un "+" a destra il caret finiva fuori riga (nel blocco sottostante) e il
// testo digitato appariva nella riga sotto invece che nel nuovo elemento.
function caretIntoRowItem(
  tr: { doc: { resolve: (pos: number) => ReturnType<Editor['state']['doc']['resolve']>; nodeAt: (pos: number) => PMNode | null }; setSelection: (sel: Selection) => void },
  rowStart: number,
  atEnd: boolean,
) {
  if (!atEnd) {
    caretIntoFirstItem(tr, rowStart);
    return;
  }
  const row = tr.doc.nodeAt(rowStart);
  if (!row) return;
  const resolved = tr.doc.resolve(rowStart + row.nodeSize - 2);
  tr.setSelection(Selection.near(resolved, -1));
}

// Esci dalla riga di elementi sul lato indicato (-1 sopra, +1 sotto): con il
// sistema dei "+" agli estremi il caret non deve mai restare in testa/fine
// riga - esce verso il blocco adiacente: paragrafo -> fine/inizio del suo
// testo, altra riga di elementi -> coda dell'ultimo elemento sopra / testa
// del primo sotto. null = nessun blocco idoneo da quel lato (il chiamante
// decide il fallback).
export function exitRowSelection(state: EditorState, rowPos: number, dir: -1 | 1): Selection | null {
  const $row = state.doc.resolve(rowPos);
  const parent = $row.parent;
  const neighborIndex = $row.index() + dir;
  if (neighborIndex < 0 || neighborIndex >= parent.childCount) return null;
  let off = $row.start();
  for (let k = 0; k < neighborIndex; k += 1) off += parent.child(k).nodeSize;
  const neighbor = parent.child(neighborIndex);
  if (neighbor.type.name !== 'paragraph' && neighbor.type.name !== 'blockRow') return null;
  const target = dir < 0 ? off + neighbor.nodeSize - 1 : off + 1;
  return Selection.near(state.doc.resolve(target), dir < 0 ? -1 : 1);
}

function exitRowTo(editor: Editor, rowPos: number, dir: -1 | 1): boolean {
  const sel = exitRowSelection(editor.state, rowPos, dir);
  if (!sel) return false;
  const tr = editor.state.tr.setSelection(sel);
  // Meta blockRowNudge: la selezione appena piazzata NON rientra nei nudge di
  // onTransaction (né nel ramo gap di riga, né nella regola margine sotto).
  // Serve a spezzare i loop: da un margine si esce una volta sola, alla
  // posizione di atterraggio (anche se a sua volta e' un margine di un'altra
  // riga) ci si ferma; un click/freccia successivi potranno di nuovo uscire.
  tr.setMeta('blockRowNudge', true);
  editor.view.dispatch(tr);
  return true;
}

// Regola margine riga (regole cursore 2026-10): il caret non deve mai restare
// ai margini esterni della riga (prima del primo figlio / dopo l'ultimo) - il
// cursore e' ammesso solo TRA due elementi, e a fine righe occupate deve
// atterrare la riga libera. Quando una TextSelection vuota finisce esattamente
// all'inizio del PRIMO figlio o alla fine dell'ULTIMO figlio della riga, il
// punto va escluso: il chiamante esce sul lato corrispondente (paragrafo
// adiacente o altra riga, vedi exitRowSelection). Restrizioni, per non rompere
// la scrittura e gli elementi incorniciati:
// - solo figli PARAGRAFI: Box e Collapse hanno bordo/padding, il caret dentro
//   di loro e' visivamente dentro l'elemento, non a margine;
// - il bordo destro di un Dado finale e' ammesso: e' un box visivo anche
//   se nello schema e' un carattere inline marcato dentro un paragrafo;
// - figlio non vuoto: uno slot di testo vuoto e' il posto dove scrivere;
// - il chiamante inoltre guarda transaction.docChanged (mentre si scrive il
//   caret resta dov'e') e il meta blockRowNudge (l'atterraggio di un exit non
//   deve riscattare la regola, altrimenti si rimbalza tra righe).
// Pura su state: il verify verify-note-row-extremes la esercita su tutti i casi.
export function rowEdgeExitTarget(state: EditorState): { rowPos: number; dir: -1 | 1 } | null {
  const sel = state.selection;
  if (!(sel instanceof TextSelection) || !sel.empty) return null;
  const $from = sel.$from;
  let rowDepth = -1;
  for (let d = $from.depth; d >= 0; d -= 1) {
    if ($from.node(d).type.name === 'blockRow') {
      rowDepth = d;
      break;
    }
  }
  if (rowDepth < 1) return null;
  const row = $from.node(rowDepth);
  const childIdx = $from.index(rowDepth);
  const isFirst = childIdx === 0;
  const isLast = childIdx === row.childCount - 1;
  if (!isFirst && !isLast) return null;
  const child = row.child(childIdx);
  if (child.type.name !== 'paragraph' || child.content.size === 0) return null;
  const childPos = $from.posAtIndex(childIdx, rowDepth);
  const rowPos = $from.before(rowDepth);
  if (isLast && sel.from === childPos + child.nodeSize - 1) {
    // Il Dado e' un box visivo, pur vivendo in un paragrafo come carattere
    // marcato: il suo bordo destro resta un punto di scrittura anche quando
    // e' l'ultimo elemento della riga (come il bordo di un box incorniciato).
    // Anche il testo aggiunto dopo il Dado fa parte del suo slot: spostare
    // il caret fuori a ogni transazione di selezione impediva Backspace.
    let hasDice = false;
    child.forEach(node => {
      if (node.isText && node.text?.includes('\u200b') && node.marks.some(mark => mark.type.name === 'inlineDice')) hasDice = true;
    });
    if (hasDice) return null;
    return { rowPos, dir: 1 };
  }
  if (isFirst && sel.from === childPos + 1) {
    if (startsWithInlineDice(child)) return null;
    return { rowPos, dir: -1 };
  }
  return null;
}

function endsWithInlineDice(node: PMNode): boolean {
  const last = node.lastChild;
  return node.type.name === 'paragraph' && Boolean(
    last?.isText && last.text?.endsWith('\u200b') && last.marks.some(mark => mark.type.name === 'inlineDice'),
  );
}

function startsWithInlineDice(node: PMNode): boolean {
  const first = node.firstChild;
  return node.type.name === 'paragraph' && Boolean(
    first?.isText && first.text?.startsWith('\u200b') && first.marks.some(mark => mark.type.name === 'inlineDice'),
  );
}

// Click in un gap INTERNO della riga (tra due elementi): il cursore di attesa
// va SEMPRE li' - e' il punto dove si inserisce un altro elemento. Il plugin
// gapcursor standard rifiuta questi click: GapCursor.valid torna false se il
// figlio vicino e' un paragrafo di testo (non "chiuso"), e anche quando il
// gap e' fra due Box (valido) handleClick ritorna false perche' il figlio
// adiacente e' NodeSelection-able (TextBox/Collapse). Il caret finiva quindi
// dentro un figlio qualsiasi, sparito fra i due box. Qui lo creiamo noi: la
// GapCursor viene disegnata dal widget ProseMirror-gapcursor e onTransaction
// la conserva (ramo gap interni). Dopo un Dado si preferisce il caret di
// testo sul suo bordo destro, anche se finale; gli altri margini esterni
// restano gestiti dalle regole head/tail e margine.
export function createBlockRowGapCursorPlugin(): Plugin {
  return new Plugin({
    key: new PluginKey('blockRowGapCursor'),
    props: {
      handleClick(view, pos, event) {
        const $pos = view.state.doc.resolve(pos);
        let rowDepth = -1;
        for (let d = $pos.depth; d >= 0; d -= 1) {
          if ($pos.node(d).type.name === 'blockRow') {
            rowDepth = d;
            break;
          }
        }
        if (rowDepth < 0) return false;
        const row = $pos.node(rowDepth);
        const index = $pos.index(rowDepth);
        const startOf = (childIndex: number): number => {
          let off = $pos.before(rowDepth) + 1;
          for (let k = 0; k < childIndex; k += 1) off += row.child(k).nodeSize;
          return off;
        };
        const caretAfterDice = (target: number): boolean => {
          if (target <= 0 || !endsWithInlineDice(row.child(target - 1))) return false;
          const diceEnd = startOf(target) - 1;
          view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, diceEnd)));
          view.focus();
          return true;
        };
        const caretBeforeDice = (target: number): boolean => {
          if (target < 0 || target >= row.childCount || !startsWithInlineDice(row.child(target))) return false;
          view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, startOf(target) + 1)));
          view.focus();
          return true;
        };
        if ($pos.parent.type.name === 'blockRow') {
          // La posizione e' gia' nel gap di riga: subito GapCursor.
          if (index > 0 && index <= row.childCount && caretAfterDice(index)) return true;
          if (caretBeforeDice(index)) return true;
          if (index <= 0 || index >= row.childCount) return false;
          view.dispatch(view.state.tr.setSelection(new GapCursor(view.state.doc.resolve(startOf(index)))));
          return true;
        }
        // La posizione e' dentro un figlio (tipico dei Box con bordo e
        // padding: posAtCoords finisce dentro anche a meta' del gap visivo
        // tra i due). Se le coordinate del click cadono a sinistra del
        // bordo del figlio (o a destra del suo bordo destro) il click era
        // nel gap: GapCursor sul confine, altrimenti e' un click sul
        // contenuto e si comporta normalmente. Il figlio puo' essere il
        // PRIMO (index 0): e' proprio il caso tipico del click nel gap fra
        // due Box, dove posAtCoords risolve dentro il bordo destro del box
        // sinistro - non si abortisce su index, solo il target dev'essere
        // un gap interno (agli estremi ci pensano head/tail e la regola
        // margine, vedi il target guard sotto).
        if (index >= row.childCount) return false;
        const dom = view.nodeDOM(startOf(index));
        if (!(dom instanceof Element)) return false;
        const rect = dom.getBoundingClientRect();
        if (event.clientX >= rect.left && event.clientX <= rect.right) return false;
        const target = event.clientX < rect.left ? index : index + 1;
        if (target > 0 && target <= row.childCount && caretAfterDice(target)) return true;
        if (caretBeforeDice(target)) return true;
        if (target <= 0 || target >= row.childCount) return false;
        view.dispatch(view.state.tr.setSelection(new GapCursor(view.state.doc.resolve(startOf(target)))));
        return true;
      },
    },
  });
}

const NOTE_WIDGET_MARKS = new Set(['inlineDice', 'inlineModifier', 'inlinePoints', 'inlineCheckbox', 'inlineRadio', 'inlineIcon']);

/** A widget-only paragraph is an element row, not the empty text line below it. */
export function noteNeedsTrailingParagraph(doc: PMNode): boolean {
  const last = doc.lastChild;
  if (!last) return false;
  if (!last.isTextblock) return true;
  if (last.type.name !== 'paragraph' || !last.content.size) return false;
  let hasWidget = false;
  let hasText = false;
  last.forEach(child => {
    if (!child.isText) { hasText = true; return; }
    const widget = child.marks.some(mark => NOTE_WIDGET_MARKS.has(mark.type.name)) && child.text?.includes('\u200b');
    if (widget) hasWidget = true;
    if (/[^\s\u200b]/u.test(child.text ?? '')) hasText = true;
  });
  return hasWidget && !hasText;
}

// Dopo righe di elementi, blocchi e paragrafi contenenti solo widget serve
// una vera riga vuota. Copre anche documenti salvati senza la riga finale:
// appendTransaction da solo non viene chiamato al primo montaggio.
export function createBlockRowTrailingParagraphPlugin(): Plugin {
  return new Plugin({
    key: new PluginKey('blockRowTrailingParagraph'),
    appendTransaction: (transactions, _oldState, newState) => {
      if (!transactions.some((transaction) => transaction.docChanged)) return null;
      if (!noteNeedsTrailingParagraph(newState.doc)) return null;
      return newState.tr.insert(
        newState.doc.content.size,
        newState.schema.nodes.paragraph.create(),
      );
    },
    view(view) {
      let frame = 0;
      const schedule = () => {
        if (frame || !view.editable || !noteNeedsTrailingParagraph(view.state.doc)) return;
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          if (!view.editable || !noteNeedsTrailingParagraph(view.state.doc)) return;
          view.dispatch(view.state.tr.insert(view.state.doc.content.size, view.state.schema.nodes.paragraph.create()).setMeta('addToHistory', false));
        });
      };
      schedule();
      return { update: schedule, destroy: () => window.cancelAnimationFrame(frame) };
    },
  });
}

// Inserisce un nuovo elemento (Testo/Box di testo/Collapse, oppure il
// paragrafo che ospita le voci inline: Dado/Modificatore/Punti/Checkbox/
// Radio) nella riga che contiene il blocco alla posizione `pos`, sul lato
// indicato. Se il blocco non e' ancora in una riga, crea la riga avvolgendo
// il blocco esistente e il nuovo elemento (la riga nasce cosi' al primo
// "+"). Regola unica e invariante: il nuovo elemento finisce SEMPRE come
// figlio della stessa riga del target — mai un paragrafo orfano separato
// ("in basso") fuori dalla riga. Pura su tr/schema: il verify
// verify-note-row-insertions.copre tutte le combinazioni target x kind x
// side.
export function applyBlockToRow(
  tr: Transaction,
  schema: Schema,
  { kind, side, pos }: { kind: BlockRowItemKind; side: 'left' | 'right'; pos: number },
): boolean {
  const $pos = tr.doc.resolve(pos);
  const target = tr.doc.nodeAt(pos);
  if (!target || !target.isBlock) return false;
  const item = blockRowItemNode(schema, kind);
  tr.setMeta('addBlockToRow', true);
  // Caret nel TITOLO del collapse appena inserito (+2 = primo punto di testo
  // dentro collapseSummary): e' il comportamento richiesto ("quando si crea
  // una collapsebox il cursore deve apparire dentro il titolo"). Con le
  // routine generiche (caretIntoRowItem/Selection.near) i rami con riga
  // esistente atterravano nel corpo (near backward dall'ultimo figlio) e in
  // ogni caso la posizione veniva poi sovrascritta dalla correzione del
  // DOMObserver - vedi reassertCollapseSelectionAfterRender. Gli altri tipi
  // (paragraph/textBox) restano sulle routine esistenti.
  const placeRowCaret = (mappedRowPos: number) => {
    if (kind === 'collapseBlock') {
      const row = tr.doc.nodeAt(mappedRowPos);
      const idx = side === 'left' ? 0 : row ? row.childCount - 1 : 0;
      let itemPos = mappedRowPos + 1;
      if (row) for (let k = 0; k < idx; k += 1) itemPos += row.child(k).nodeSize;
      tr.setSelection(TextSelection.create(tr.doc, itemPos + 2));
      return;
    }
    caretIntoRowItem(tr, mappedRowPos, side === 'right');
  };
  if (target.type.name === 'blockRow') {
    const rowDepth = findBlockRowDepth($pos);
    if (rowDepth >= 0) {
      const rowPos = $pos.before(rowDepth);
      const row = $pos.node(rowDepth);
      const children: PMNode[] = [];
      row.forEach((child) => children.push(child));
      const newChildren = side === 'left' ? [item, ...children] : [...children, item];
      const newRow = schema.nodes.blockRow.create({}, Fragment.from(newChildren));
      tr.replaceWith(rowPos, rowPos + row.nodeSize, newRow);
      placeRowCaret(tr.mapping.map(rowPos));
      return true;
    }
    const insertAt = side === 'left' ? pos + 1 : pos + target.nodeSize - 1;
    const mappedInsert = tr.mapping.map(insertAt);
    tr.insert(insertAt, item);
    if (kind === 'collapseBlock') {
      tr.setSelection(TextSelection.create(tr.doc, mappedInsert + 2));
    } else {
      caretIntoRowItem(tr, tr.mapping.map(pos), side === 'right');
    }
    return true;
  }

  const rowDepth = findBlockRowDepth($pos);
  if (rowDepth >= 0) {
    const rowPos = $pos.before(rowDepth);
    const row = $pos.node(rowDepth);
    const children: PMNode[] = [];
    row.forEach((child) => children.push(child));
    const newChildren = side === 'left' ? [item, ...children] : [...children, item];
    const newRow = schema.nodes.blockRow.create({}, Fragment.from(newChildren));
    tr.replaceWith(rowPos, rowPos + row.nodeSize, newRow);
    placeRowCaret(tr.mapping.map(rowPos));
    return true;
  }

  // Target standalone: avvolge target + nuovo elemento in un blockRow.
  // pos è l'inizio del blocco (coordinate ProseMirror, primo figlio a 0),
  // quindi pos + nodeSize è sempre una posizione valida.
  // Caret DENTRO il nuovo elemento (+1, non +2): con un paragrafo nuovo
  // (vuoto) +2 cade dopo la chiusura e near-forward scapperebbe fuori
  // riga — lo stesso "testo che finisce sotto" visto su TextBox capita
  // anche col Collapse da solo. Vale per Testo/Box/Collapse nuovi.
  const pair = side === 'left' ? [item, target] : [target, item];
  const rowNode = schema.nodes.blockRow.create({}, Fragment.from(pair));
  tr.replaceWith(pos, pos + target.nodeSize, rowNode);
  const mapped = tr.mapping.map(pos);
  const newItemPos = mapped + 1 + (side === 'left' ? 0 : pair[0].nodeSize);
  if (kind === 'collapseBlock') {
    tr.setSelection(TextSelection.create(tr.doc, newItemPos + 2));
  } else {
    tr.setSelection(Selection.near(tr.doc.resolve(newItemPos + 1), 1));
  }
  return true;
}

// Dopo aver creato un Collapse il React nodeview monta/rimonta il DOM in
// modo asincrono: il DOMObserver di ProseMirror legge allora una variante
// STALE della selezione (il caret comandato non aveva ancora scritto il DOM,
// o il nodo che lo conteneva e' stato sostituito) e readDOMChange spedisce
// una transazione SENZA step che riporta il caret dov'era prima - misurato
// dall'harness: comando -> caret nel titolo -> ~2-4ms dopo revert nel
// paragrafo. La correzione arriva come microtask DOPO il commit React; un
// requestAnimationFrame successivo (idempotente: nessun dispatch se la
// selezione e' gia' quella voluta, e solo se il doc non e' cambiato nel
// frattempo - l'utente non ha avuto tempo di scrivere in un frame)
// rimette il posto per ultimo. Vale solo per la creazione del Collapse, che
// e' l'unico caso in cui il montaggio del nodeview entra in competizione
// con la posizione del caret.
export function reassertCollapseSelectionAfterRender(view: EditorView, from: number): void {
  queueMicrotask(() => {
    // La dispatch del comando avviene nello stesso task della chiamata:
    // al primo microtask il doc e' gia' quello post-comando.
    const docAfterDispatch = view.state.doc;
    requestAnimationFrame(() => {
      if (view.isDestroyed || view.state.doc !== docAfterDispatch) return;
      const sel = view.state.selection;
      if (sel instanceof TextSelection && sel.from === from && sel.to === from) return;
      try {
        const target = TextSelection.near(
          view.state.doc.resolve(Math.min(from, view.state.doc.content.size)),
          1,
        );
        view.dispatch(view.state.tr.setSelection(target));
      } catch (e) {
        // Posizione non piu' valida: niente (il documento e' cambiato).
      }
    });
  });
}

// Elimina il singolo carattere di un box inline (Dado/Modificatore/Punti)
// e, se il paragrafo di riga che lo conteneva e' rimasto senza contenuto
// visivo (solo spazi o ZWSP), rimuove anche quel paragrafo: in riga
// occuperebbe una quota con un buco vuoto accanto — nel mezzo, all'inizio
// o alla fine — che non corrisponde ad alcuna azione dell'utente. Con altri
// figli la riga sopravvive; con il paragrafo unico figlio si lascia
// perdere (lo srotolamento della riga vuota ci pensa). Il caret finisce
// nel figlio adiacente (Selection.near). Condiviso dai delete*At dei tre
// box inline; il verify note-row-extremes ne copre i casi funzionali.
export function deleteInlineBoxAndRowResidue(
  state: EditorState,
  dispatch: ((transaction: Transaction) => void) | undefined,
  pos: number,
): void {
  if (!dispatch) return;
  const $pos = state.doc.resolve(pos);
  const parent = $pos.parent;
  const inRow = $pos.depth >= 2 && $pos.node($pos.depth - 1).type.name === 'blockRow';
  const tr = state.tr.delete(pos, pos + 1);
  if (inRow && parent.type.name === 'paragraph') {
    const paragraphPos = tr.mapping.map($pos.before());
    const $paragraph = tr.doc.resolve(paragraphPos + 1);
    const paragraph = $paragraph.node();
    if (paragraph.textContent.replace(/[\s\u200b]/g, '') === '') {
      const row = $paragraph.node($paragraph.depth - 1);
      if (row.childCount > 1) {
        tr.delete(paragraphPos, paragraphPos + paragraph.nodeSize);
        tr.setSelection(Selection.near(tr.doc.resolve(Math.min(paragraphPos, tr.doc.content.size))));
      }
    }
  }
  dispatch(tr);
}

export const BlockRow = Node.create({
  name: 'blockRow',
  group: 'block',
  content: BLOCK_ROW_CONTENT,
  defining: true,
  isolating: true,

  parseHTML() {
    return [{ tag: 'div[data-type="block-row"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'block-row', class: 'tiptap-row' }), 0];
  },

  addProseMirrorPlugins() {
    return [createBlockRowTrailingParagraphPlugin(), createBlockRowGapCursorPlugin()];
  },

  addCommands() {
    return {
      addBlockToRow:
        (opts: { kind: BlockRowItemKind; side: 'left' | 'right'; pos: number }) =>
        ({ state, tr, dispatch, view }) => {
          if (!dispatch) return true;
          const ok = applyBlockToRow(tr, state.schema, opts);
          // Solo Collapse: dopo la dispatch il DOMObserver potrebbe
          // riportare il caret dove era - re-assert a frame di distanza.
          if (ok && view && opts.kind === 'collapseBlock') {
            reassertCollapseSelectionAfterRender(view, tr.selection.from);
          }
          return ok;
        },
    };
  },

  // Riga svuotata o rimasta di solo testo: non ha piu' senso visivo.
  // - zero figli o soli paragrafi vuoti (elementi cancellati) → i "+"
  //   fantasma alle estremita' confondono: si srotola in un paragrafo.
  // - un singolo paragrafo (anche con testo: gli elementi vicini sono stati
  //   cancellati uno a uno) → e' di nuovo testo normale, conservando il
  //   figlio esistente col suo testo: niente quote flex morte, niente
  //   doppia "+" di riga, torna l'anchor paragrafo singolo.
  // Box/Collapse (anche vuoti o da soli) restano: hanno UI propria e la riga
  // serve al prossimo "+". Due+ paragrafi affiancati restano: nati apposta
  // col "+". Le transazioni di addBlockToRow sono escluse (la riga nasce con
  // un elemento vuoto da riempire subito dopo, col caret gia' dentro).
  onTransaction({ editor, transaction }: { editor: Editor; transaction: Transaction }) {
    const { state } = editor;
    // Niente caret ai margini della riga: il testo in riga nasce SOLO dal "+"
    // (Testo a inizio/fine riga, poi eventuali altri elementi sempre col "+").
    // Qualunque caret nel gap diretto della riga — TextSelection da mouse/drop
    // o GapCursor del plugin GapCursor che cattura frecce e click ai bordi —
    // viene sistemato: nei gap interni tra due elementi la GapCursor RESTA
    // dov'e' (e' il cursore visibile che segnala "qui si puo' inserire",
    // serve anche tra due Box: veniva nudged dentro un figlio e spariva),
    // agli estremi esce nella riga di testo adiacente. Il browser lo
    // disegnerebbe in alto e la scrittura lì confonde.
    // Solo caret collassato, mai in composizione IME. Le GapCursor delle
    // tabelle non arrivano qui (parent diverso da blockRow).
    const nudgeFree = !editor.view.composing && !transaction.getMeta('blockRowNudge');
    if (
      nudgeFree &&
      (state.selection instanceof GapCursor ||
        (state.selection.empty &&
          state.selection instanceof TextSelection &&
          state.selection.$from.parent.type.name === 'blockRow'))
    ) {
      const $from = state.selection.$from;
      if ($from.parent.type.name === 'blockRow') {
        const row = $from.parent;
        const rowDepth = $from.depth;
        const rowPos = $from.before(rowDepth);
        const idx = $from.index(rowDepth);
        const pick = idx < row.childCount ? idx : idx - 1;
        if (pick >= 0 && pick < row.childCount) {
          const atEnd = pick !== idx;
          const isHead = !atEnd && idx === 0;
          const isTail = atEnd && idx === row.childCount;
          // Estremi di riga (gap iniziale/finali): il caret non entra in
          // testa/fine riga (ci pensano i "+") ma esce sul lato corrispondente,
          // nella riga di testo adiacente (sotto e' SEMPRE presente il
          // paragrafo di coda garantito da blockRowTrailingParagraph).
          if (isHead || isTail) {
            if (exitRowTo(editor, rowPos, isHead ? -1 : 1)) return;
            // Nessun paragrafo adiacente da quel lato (hr/Box/Collapse/
            // tabella/lista/...): il gap creato dal gapcursor standard cade
            // DENTRO la riga (rowPos+1 / rowEnd-1), sul margine esterno dove
            // la regola vieta il cursore. Lo si sposta sul confine ESTERNO se
            // GapCursor.valid lo ammette (tra due elementi chiusi), altrimenti
            // dentro il testo del blocco adiacente (lista, citazione).
            if (state.selection instanceof GapCursor) {
              const gapPos = isHead ? rowPos : rowPos + row.nodeSize;
              const $gap = state.doc.resolve(gapPos);
              const gapCursorType = GapCursor as unknown as {
                valid: (pos: ReturnType<Editor['state']['doc']['resolve']>) => boolean;
              };
              const tr = state.tr;
              if (gapCursorType.valid($gap)) tr.setSelection(new GapCursor($gap));
              else
                tr.setSelection(
                  Selection.near(
                    state.doc.resolve(isHead ? rowPos - 1 : gapPos),
                    isHead ? -1 : 1,
                  ),
                );
              tr.setMeta('blockRowNudge', true);
              editor.view.dispatch(tr);
              return;
            }
          }
          // GapCursor in un gap INTERNI della riga (tra due elementi):
          // resta dov'e' - il suo widget lampeggiante e' il cursore richiesto
          // per inserire un elemento in mezzo (prima veniva nudged dentro il
          // figlio vicino e tra due Box non appariva nulla).
          if (state.selection instanceof GapCursor) return;
          let off = rowPos + 1;
          for (let k = 0; k < pick; k += 1) off += row.child(k).nodeSize;
          const target = atEnd ? off + row.child(pick).nodeSize - 1 : off + 1;
          const nudge = state.tr.setSelection(Selection.near(state.doc.resolve(target), atEnd ? -1 : 1));
          nudge.setMeta('blockRowNudge', true);
          editor.view.dispatch(nudge);
          return;
        }
      }
    }
    // Regola margine (regole cursore 2026-10): il caret non deve mai restare
    // ai margini ESTERNI della riga, ne' prima del primo figlio ne' dopo
    // l'ultimo (il cursore e' ammesso solo tra due elementi; a fine righe
    // occupate deve finire la riga libera). Se una TextSelection vuota finisce
    // esattamente all'inizio del primo figlio o alla fine dell'ultimo, esce
    // sul lato corrispondente. Solo su transazione di sola selezione
    // (!docChanged): mentre si scrive il caret resta dov'e'. Il meta
    // blockRowNudge dell'atterraggio (exitRowTo) impedisce di risaltare.
    if (nudgeFree && !transaction.docChanged) {
      const edge = rowEdgeExitTarget(state);
      if (edge && exitRowTo(editor, edge.rowPos, edge.dir)) return;
    }
    // GapCursor tra le righe: resta dov'è (è il caret di attesa voluto,
    // disegnato dal suo widget lampeggiante). Solo adiacenze di righe: i gap
    // delle tabelle restano al loro plugin dedicato, gli altri al default.
    // (Niente riga auto-creata: nasce solo scrivendo o con Invio lì.)
    if (!transaction.docChanged) return;
    if (transaction.getMeta('blockRowCleanup') || transaction.getMeta('addBlockToRow')) return;
    const empty: { pos: number; size: number; keep: PMNode | null }[] = [];
    state.doc.descendants((node, pos) => {
      if (node.type.name !== 'blockRow') return true;
      let childCount = 0;
      let hasContent = false;
      node.forEach((child) => {
        childCount += 1;
        if (child.type.name !== 'paragraph' || child.textContent.length > 0) hasContent = true;
      });
      // Singolo paragrafo: si conserva il figlio esistente col suo testo —
      // cancellare gli elementi vicini non deve mai cancellare il testo.
      const keep = childCount === 1 && node.firstChild?.type.name === 'paragraph' ? node.firstChild : null;
      if (childCount === 0 || !hasContent || keep) empty.push({ pos, size: node.nodeSize, keep });
      return false;
    });
    if (!empty.length) return;
    const tr = state.tr;
    for (let i = empty.length - 1; i >= 0; i -= 1) {
      const { pos, size, keep } = empty[i];
      tr.replaceWith(pos, pos + size, keep ?? state.schema.nodes.paragraph.create());
    }
    tr.setMeta('blockRowCleanup', true);
    editor.view.dispatch(tr);
  },

  addKeyboardShortcuts() {
    return {
      // Frecce ai bordi degli elementi di riga: il caret non deve mai
      // fermarsi nel gap diretto della riga (parent === blockRow) — il
      // browser lo disegna in alto sul primo elemento invece che tra i due,
      // anche se logicamente è già "tra" (scrivere funziona). Si salta
      // dentro l'elemento vicino nella direzione. Con selezione non vuota
      // (shift+frecce) non si tocca nulla: resta il comportamento default.
      ArrowRight: ({ editor }) => moveAcrossRowItems(editor, 1),
      ArrowLeft: ({ editor }) => moveAcrossRowItems(editor, -1),
      // Su/Giu ai bordi verticali della riga: su esce verso l'alto (coda del
      // paragrafo sopra, oppure GapCursor di attesa sul confine fra due righe,
      // dove la scrittura crea la riga di testo fra le due); giu entra nel
      // primo elemento della riga seguente. Senza questo, il default
      // coordinato atterra nel gap della riga (disegnato in alto) o non si
      // muove, e la scrittura finisce tra gli elementi della stessa riga
      // invece che tra le righe.
      ArrowUp: ({ editor }) => moveOutOfRowVertical(editor, -1),
      ArrowDown: ({ editor }) => moveOutOfRowVertical(editor, 1),
      // Invio dentro una riga di blocchi affiancati: NON va a capo nel testo
      // (che spaccherebbe il blocco in due colonne sulla stessa riga) ma
      // spezza la RIGA - la serie di blocchi compresa tra il cursore e la
      // fine riga scende su una riga nuova; entrambe le righe ridividono la
      // propria larghezza. Fuori dalle righe il comportamento di default
      // (a capo) resta invariato.
      Enter: ({ editor }) => splitBlockRowAtCaret(editor),
    };
  },
});

function moveAcrossRowItems(editor: Editor, dir: 1 | -1): boolean {
  const { state, view } = editor;
  const { $from } = state.selection;
  if (!state.selection.empty) return false;
  const rowDepth = findBlockRowDepth($from);
  if (rowDepth === -1) return false;
  const row = $from.node(rowDepth);
  const rowPos = $from.before(rowDepth);
  const starts: number[] = [];
  {
    let off = rowPos + 1;
    for (let k = 0; k < row.childCount; k += 1) {
      starts.push(off);
      off += row.child(k).nodeSize;
    }
  }
  const jumpInto = (childIndex: number, atEnd: boolean) => {
    if (childIndex < 0 || childIndex >= row.childCount) return false;
    const target = atEnd
      ? starts[childIndex] + row.child(childIndex).nodeSize - 1
      : starts[childIndex] + 1;
    // Meta blockRowNudge: l'atterraggio e' una navigazione voluta (frecce tra
    // elementi): se capita esattamente su un margine di riga la regola margine
    // di onTransaction non deve risaltarci fuori.
    const tr = state.tr.setSelection(Selection.near(state.doc.resolve(target), dir));
    tr.setMeta('blockRowNudge', true);
    view.dispatch(tr);
    return true;
  };
  // Caret già nel gap diretto della riga: mai restarci, vai nel vicino.
  // Agli estremi invece si esce dalla riga (i "+" gestiscono l'inserimento
  // in testa/fine): verso il paragrafo adiacente, o l'altra riga più vicina.
  if ($from.parent.type.name === 'blockRow') {
    const idx = $from.index(rowDepth);
    if (dir > 0 && idx >= row.childCount && exitRowTo(editor, rowPos, 1)) return true;
    if (dir < 0 && idx === 0 && exitRowTo(editor, rowPos, -1)) return true;
    return jumpInto(dir > 0 ? idx : idx - 1, dir < 0);
  }
  let childIndex = -1;
  for (let k = 0; k < row.childCount; k += 1) {
    if ($from.pos >= starts[k] && $from.pos <= starts[k] + row.child(k).nodeSize) {
      childIndex = k;
      break;
    }
  }
  if (childIndex === -1) return false;
  const childStart = starts[childIndex];
  const child = row.child(childIndex);
  const childEnd = childStart + child.nodeSize;
  if (dir > 0) {
    if (childIndex >= row.childCount - 1) return false;
    // Salta solo se dopo il caret non resta testo nel figlio (altrimenti la
    // freccia si muove normalmente dentro il testo). Così un solo Right a
    // fine testo attraversa i token di chiusura invisibili senza fermarsi
    // mai nel gap (che il browser disegna in alto).
    const rest = state.doc.textBetween($from.pos, childEnd - 1, undefined, '');
    if (rest.length > 0) return false;
    return jumpInto(childIndex + 1, false);
  }
  if (childIndex <= 0) return false;
  const restBefore = state.doc.textBetween(childStart + 1, $from.pos, undefined, '');
  if (restBefore.length > 0) return false;
  return jumpInto(childIndex - 1, true);
}

// Frecce su/giù in un paragrafo il cui vicino nella direzione e' una riga di
// elementi: le frecce ENTRANO nella riga adiacente (da sopra nella testa del
// primo elemento, da sotto nella coda dell'ultimo), affermando la regola che
// il cursore verticale tra righe e testo si muova normalmente. Senza questo
// passaggio il gapcursor standard trova il bordo ESTERNO della riga come
// GapCursor valido (i lati isolating la chiudono), onTransaction lo respinge
// con exitRowTo sull'estremo del paragrafo di partenza e ogni pressione
// successiva ripete lo stesso giro: il caret resta bloccato a lampeggiare
// nella stessa posizione (sintoma segnalato: freccia su da sotto la textbox,
// freccia giù da sopra, mai movimento). Solo paragrafi di primo livello con
// caret al bordo visivo (endOfTextblock): in mezzo al testo o dentro altri
// blocchi resta il comportamento di default.
function enterAdjacentRowVertical(editor: Editor, dir: -1 | 1): boolean {
  const { state, view } = editor;
  const { $from } = state.selection;
  if ($from.depth !== 1 || $from.parent.type.name !== 'paragraph') return false;
  // Bordo visivo: endOfTextblock è DOM-based e un widget decoration inline
  // (Punti/Dado con side:0, prima del testo) fa credere al browser che ci sia
  // contenuto prima del caret anche quando il doc è a inizio paragrafo: la
  // freccia non entrava piu' nella riga adiacente. Fallback sul doc: nessun
  // testo prima/dopo il caret nel paragrafo = bordo effettivo.
  const atEdge =
    view.endOfTextblock(dir < 0 ? 'up' : 'down') ||
    (dir < 0
      ? state.doc.textBetween($from.start(), $from.pos, undefined, '') === ''
      : state.doc.textBetween($from.pos, $from.end(), undefined, '') === '');
  if (!atEdge) return false;
  const sibIndex = $from.index(0) + (dir < 0 ? -1 : 1);
  const sibling = state.doc.maybeChild(sibIndex);
  if (!sibling || sibling.type.name !== 'blockRow') return false;
  let sibStart = 0;
  for (let k = 0; k < sibIndex; k += 1) sibStart += state.doc.child(k).nodeSize;
  // Selection.near NON restituisce mai GapCursor (trova solo testo/nodi
  // foglia): l'atterraggio e' dentro l'elemento adiacente della riga, mai
  // sul suo margine. Meta blockRowNudge: un paragrafo come primo figlio di
  // riga atterrerebbe col caret sul suo contentStart, che la regola margine
  // rispingerebbe fuori (rimbalzo).
  const edge = dir < 0 ? sibStart + sibling.nodeSize - 1 : sibStart + 1;
  const tr = state.tr.setSelection(visibleVerticalSelection(state.doc, edge, dir));
  tr.setMeta('blockRowNudge', true);
  view.dispatch(tr);
  return true;
}

// Selection.near vede anche il corpo nascosto: risalendo da un gap o dal
// paragrafo di coda di una Collapse chiusa deve invece raggiungere il titolo.
function visibleVerticalSelection(doc: PMNode, pos: number, dir: -1 | 1): Selection {
  const selection = Selection.near(doc.resolve(pos), dir);
  for (let depth = selection.$from.depth; depth >= 1; depth -= 1) {
    const node = selection.$from.node(depth);
    if (node.type.name !== 'collapseBlock' || node.attrs.open) continue;
    const summaryStart = selection.$from.before(depth) + 2;
    return TextSelection.create(doc, summaryStart + (dir < 0 ? node.firstChild!.content.size : 0));
  }
  return selection;
}

function isVerticalContainer(node: PMNode | null): boolean {
  return node?.type.name === 'blockRow' || node?.type.name === 'collapseBlock';
}

function moveOutOfCollapseVertical(editor: Editor, dir: -1 | 1): boolean {
  const { state, view } = editor;
  if (!(state.selection instanceof TextSelection)) return false;
  const { $from } = state.selection;
  let depth = $from.depth;
  while (depth > 0 && $from.node(depth).type.name !== 'collapseBlock') depth -= 1;
  if (!depth) return false;
  const collapse = $from.node(depth);
  // Aperto: attraversare titolo e paragrafi del corpo prima di uscire.
  // Chiuso: il solo titolo costituisce il bordo visibile.
  if (collapse.attrs.open) {
    for (let d = $from.depth - 1; d >= depth; d -= 1) {
      const index = dir < 0 ? $from.index(d) : $from.indexAfter(d);
      if (index !== (dir < 0 ? 0 : $from.node(d).childCount)) return false;
    }
  } else if ($from.parent.type.name !== 'collapseSummary') {
    return false;
  }
  if (!view.endOfTextblock(dir < 0 ? 'up' : 'down')) return false;
  const pos = dir < 0 ? $from.before(depth) : $from.after(depth);
  const $gap = state.doc.resolve(pos);
  if (!isVerticalContainer(dir < 0 ? $gap.nodeBefore : $gap.nodeAfter)) return false;
  const gapCursor = GapCursor as unknown as { valid: (pos: typeof $gap) => boolean };
  if (!gapCursor.valid($gap)) return false;
  view.dispatch(state.tr.setSelection(new GapCursor($gap)));
  return true;
}

function moveOutOfRowVertical(editor: Editor, dir: -1 | 1): boolean {
  const { state, view } = editor;
  const { $from } = state.selection;
  if (!state.selection.empty) return false;
  // Gap verticale FRA DUE righe/Collapse (GapCursor sul confine, widget
  // di attesa): su/gi' entrano nel blocco adiacente con la stessa meta
  // blockRowNudge degli altri atterraggi. Senza la meta, dalla coda della riga
  // sopra la regola margine risbatterebbe il caret in testa alla riga sotto e
  // si entrerebbe in un loop testa-riga <-> gap a ogni pressione. I gap di
  // tabella e gli altri confini del doc restano al default coordinato.
  if (state.selection instanceof GapCursor && $from.parent.type.name !== 'blockRow') {
    const before = $from.nodeBefore;
    const after = $from.nodeAfter;
    if (isVerticalContainer(before) && isVerticalContainer(after)) {
      const target = visibleVerticalSelection(state.doc, $from.pos + dir, dir);
      const tr = state.tr.setSelection(target);
      tr.setMeta('blockRowNudge', true);
      view.dispatch(tr);
      return true;
    }
    return false;
  }
  const rowDepth = findBlockRowDepth($from);
  if (rowDepth < 0) return moveOutOfCollapseVertical(editor, dir) || enterAdjacentRowVertical(editor, dir);
  if (rowDepth < 1) return false;
  const rowPos = $from.before(rowDepth);
  const row = $from.node(rowDepth);
  const rowEnd = rowPos + row.nodeSize;
  const parent = $from.node(rowDepth - 1);
  const rowIndex = $from.index(rowDepth - 1);
  const inGap = $from.parent.type.name === 'blockRow';
  // Bordo verticale a livello di FIGLIO (non di riga): sopra "mezzo" non c'è
  // nulla anche se a sinistra c'è il box — visivamente la riga è una sola
  // fascia, quindi su/giù escono dalla riga. Dentro contenuti multilinea
  // (box con più paragrafi, corpo collapse) resta il default coordinato.
  let childStart = -1;
  let childEnd = -1;
  let inClosedSummary = false;
  if (!inGap) {
    let off = rowPos + 1;
    for (let k = 0; k < row.childCount; k += 1) {
      const child = row.child(k);
      if ($from.pos >= off && $from.pos <= off + child.nodeSize) {
        childStart = off;
        childEnd = off + child.nodeSize;
        if (child.type.name === 'collapseBlock' && !child.attrs.open && $from.parent.type.name === 'collapseSummary') {
          inClosedSummary = true;
          // Il corpo chiuso non conta come testo sotto al titolo.
        }
        break;
      }
      off += child.nodeSize;
    }
    if (childStart === -1) return false;
  }
  if (dir < 0) {
    // Solo se sopra il caret non c'è più testo nel suo elemento (o caret
    // nel gap: lì sopra non c'è mai niente, si esce comunque).
    if (!inGap && (inClosedSummary
      ? !view.endOfTextblock('up')
      : state.doc.textBetween(childStart + 1, $from.pos, undefined, '').length > 0)) return false;
    // Niente sopra la riga (e' il primo blocco): si esce sopra la riga con
    // la GapCursor del gap adiacente (punto di attesa sopra la prima riga).
    // Lasciando fare al gapcursor standard, quando il primo figlio e' unBox
    // isolating troverebbe il bordo ESTERNO della riga (gap di testa): onTransaction
    // non puo' respingerlo (nessun vicino con cui uscire) e il caret resta
    // bloccato a lampeggiare sul margine, violando la regola.
    if (rowIndex <= 0) {
      const $gap = state.doc.resolve(rowPos);
      // valid e' marcato @internal nel .d.ts pubblico: stesso cast usato in
      // noteTableContainerGapCursor.
      const gapCursor = GapCursor as unknown as { valid: (pos: ReturnType<Editor['state']['doc']['resolve']>) => boolean };
      if (!gapCursor.valid($gap)) return false;
      view.dispatch(state.tr.setSelection(new GapCursor($gap)));
      return true;
    }
    const prev = parent.child(rowIndex - 1);
    if (prev.type.name !== 'paragraph' && !isVerticalContainer(prev)) return false;
    // Sopra: paragrafo -> coda del suo testo. Tra DUE righe di elementi ->
    // GapCursor di attesa sul confine fra le righe (stessa posizione già
    // usata sopra la prima riga): è il cursore verticale visibile che mancava
    // fra riga superiore e inferiore, e la scrittura lì crea la riga di testo
    // fra le due. Se il gap non fosse valido (caso limite) si cade nella
    // vecchia coda dell'ultimo elemento della riga sopra.
    if (isVerticalContainer(prev)) {
      const $gap = state.doc.resolve(rowPos);
      const gapCursorType = GapCursor as unknown as {
        valid: (pos: ReturnType<Editor['state']['doc']['resolve']>) => boolean;
      };
      if (gapCursorType.valid($gap)) {
        view.dispatch(state.tr.setSelection(new GapCursor($gap)));
        return true;
      }
    }
    const tr = state.tr;
    tr.setSelection(visibleVerticalSelection(state.doc, rowPos - 1, -1));
    tr.setMeta('blockRowNudge', true);
    view.dispatch(tr);
    return true;
  }
  if (!inGap && (inClosedSummary
    ? !view.endOfTextblock('down')
    : state.doc.textBetween($from.pos, childEnd - 1, undefined, '').length > 0)) return false;
  if (rowIndex >= parent.childCount - 1) return false;
  const next = parent.child(rowIndex + 1);
  if (next.type.name !== 'paragraph' && !isVerticalContainer(next)) return false;
  if (isVerticalContainer(next)) {
    const $gap = state.doc.resolve(rowEnd);
    const gapCursor = GapCursor as unknown as { valid: (pos: typeof $gap) => boolean };
    if (gapCursor.valid($gap)) {
      view.dispatch(state.tr.setSelection(new GapCursor($gap)));
      return true;
    }
  }
  // Sotto: paragrafo -> inizio del suo testo (sotto l'ultima riga e' SEMPRE
  // presente il paragrafo di coda, garantito da blockRowTrailingParagraph);
  // altra riga/Collapse -> gap di attesa, poi testo visibile del vicino.
  const tr = state.tr;
  tr.setSelection(visibleVerticalSelection(state.doc, rowEnd, 1));
  tr.setMeta('blockRowNudge', true);
  view.dispatch(tr);
  return true;
}

function splitBlockRowAtCaret(editor: Editor): boolean {
  const { state, view } = editor;
  const { $from } = state.selection;
  if (!state.selection.empty) return false;
  // Invio dentro sommario o corpo del Collapse: il cut() del nodo qui
  // sotto taglierebbe il collapseBlock a meta' e ne genererebbe UNA SECONDA
  // box (con un sommario o un corpo a meta' - violando anche l'espressione
  // di contenuto "collapseSummary collapseBody"). Si cede il gestore: il
  // keymap di CollapseSummary (che apre il box e sposta il caret nel corpo,
  // per il sommario) o il comportamento di default (a capo nel paragrafo del
  // corpo) gestiscono il caso. Nota d'ordine: i keymap vengono costruiti
  // sull'elenco estensioni INVERTITO (sortExtensions([...extensions].reverse())
  // in @tiptap/core), quindi l'Enter di BlockRow viene provato PRIMA di
  // quello di CollapseSummary - senza questa cessione l'Invio nel titolo non
  // arrivava mai al gestore del sommario.
  for (let d = 0; d <= $from.depth; d += 1) {
    const name = $from.node(d).type.name;
    if (name === 'collapseSummary' || name === 'collapseBody') return false;
  }
  const rowDepth = findBlockRowDepth($from);
  if (rowDepth === -1) return false;
  const row = $from.node(rowDepth);
  if (row.childCount === 0) return false;
  const schema = state.schema;
  const rowPos = $from.before(rowDepth);

  // Indice dell'elemento di riga che contiene il caret.
  const caretAbs = $from.pos;
  let childIndex = -1;
  let childStart = rowPos + 1;
  for (let k = 0; k < row.childCount; k += 1) {
    const child = row.child(k);
    if (caretAbs < childStart + child.nodeSize) {
      childIndex = k;
      break;
    }
    childStart += child.nodeSize;
  }
  if (childIndex === -1) {
    childIndex = row.childCount - 1;
    childStart = rowPos + 1;
    for (let k = 0; k < childIndex; k += 1) {
      childStart += row.child(k).nodeSize;
    }
  }

  const child = row.child(childIndex);
  const relCaret = Math.max(0, Math.min(child.content.size, caretAbs - childStart));
  const pre = relCaret > 0 ? child.cut(0, relCaret) : null;
  const post = relCaret < child.content.size ? child.cut(relCaret, child.content.size) : null;

  const oldItems: PMNode[] = [];
  for (let k = 0; k < childIndex; k += 1) {
    oldItems.push(row.child(k));
  }
  if (pre && pre.content.size > 0) oldItems.push(pre);

  const newItems: PMNode[] = [];
  if (post && post.content.size > 0) newItems.push(post);
  for (let k = childIndex + 1; k < row.childCount; k += 1) {
    newItems.push(row.child(k));
  }

  // Se la coda e' vuota (caret a fine riga), non si aggiunge un figlio
  // vuoto in riga: si esce sotto con un paragrafo nuovo, riga intatta.
  // Se la testa e' vuota (caret a inizio riga), paragrafo nuovo sopra.
  // In entrambi i casi il default spaccherebbe il paragrafo dentro la riga
  // lasciando "spazio vuoto" in coda/testa senza scendere davvero.
  const keepOld = oldItems.length > 0;
  const hasNewContent = newItems.length > 0;
  const tr = state.tr;
  const rowEnd = rowPos + row.nodeSize;
  if (!keepOld && !hasNewContent) return false;
  if (!keepOld) {
    tr.insert(rowPos, schema.nodes.paragraph.create());
    tr.setSelection(TextSelection.create(tr.doc, rowPos + 1));
    view.dispatch(tr);
    return true;
  }
  if (!hasNewContent) {
    tr.insert(rowEnd, schema.nodes.paragraph.create());
    tr.setSelection(TextSelection.create(tr.doc, rowEnd + 1));
    view.dispatch(tr);
    return true;
  }

  const oldNode = schema.nodes.blockRow.create({}, Fragment.from(oldItems));
  const newNode = schema.nodes.blockRow.create({}, Fragment.from(newItems));

  tr.replaceWith(rowPos, rowEnd, Fragment.from([oldNode, newNode]));
  const newRowStart = tr.mapping.map(rowPos) + oldNode.nodeSize;
  caretIntoFirstItem(tr, newRowStart);
  view.dispatch(tr);
  return true;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockRow: {
      /** Inserisce un elemento Testo/Box/Collapse nella riga affiancata che contiene il blocco alla posizione. */
      addBlockToRow: (opts: { kind: BlockRowItemKind; side: 'left' | 'right'; pos: number }) => ReturnType;
    };
  }
}
