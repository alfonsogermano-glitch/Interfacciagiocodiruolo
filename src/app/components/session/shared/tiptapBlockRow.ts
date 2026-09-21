import { Node, mergeAttributes } from '@tiptap/core';
import { Fragment, type Node as PMNode } from '@tiptap/pm/model';
import { GapCursor } from '@tiptap/pm/gapcursor';
import { Selection, type Transaction, TextSelection } from '@tiptap/pm/state';
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

function blockRowItemNode(editor: Editor, kind: BlockRowItemKind): PMNode {
  const schema = editor.schema;
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

  addCommands() {
    return {
      // Inserisce un nuovo elemento (Testo/Box di testo/Collapse) nella riga
      // che contiene il blocco alla posizione `pos`, sul lato indicato. Se il
      // blocco non e' ancora in una riga, crea la riga avvolgendo il blocco
      // esistente e il nuovo elemento (la riga nasce cosi' al primo "+").
      addBlockToRow:
        (
          { kind, side, pos }: { kind: BlockRowItemKind; side: 'left' | 'right'; pos: number },
        ) =>
        ({ state, tr, dispatch, editor }) => {
          if (!dispatch) return true;
          const schema = state.schema;
          const $pos = state.doc.resolve(pos);
          const target = state.doc.nodeAt(pos);
          if (!target || !target.isBlock) return false;
          const item = blockRowItemNode(editor, kind);
          tr.setMeta('addBlockToRow', true);
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
              caretIntoRowItem(tr, tr.mapping.map(rowPos), side === 'right');
              return true;
            }
            const insertAt = side === 'left' ? pos + 1 : pos + target.nodeSize - 1;
            tr.insert(insertAt, item);
            caretIntoRowItem(tr, tr.mapping.map(pos), side === 'right');
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
            caretIntoRowItem(tr, tr.mapping.map(rowPos), side === 'right');
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
          tr.setSelection(Selection.near(tr.doc.resolve(newItemPos + 1), 1));
          return true;
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
    // Niente caret nei gap di riga: il testo in riga nasce SOLO dal "+"
    // (Testo a inizio/fine riga, poi eventuali altri elementi sempre col "+").
    // Qualunque caret nel gap diretto della riga — TextSelection da mouse/drop
    // o GapCursor del plugin GapCursor che cattura frecce e click ai bordi —
    // viene spostato nel vicino (seguente, o precedente se ultimo gap): il
    // browser lo disegnerebbe in alto e la scrittura lì confonde.
    // Solo caret collassato, mai in composizione IME. Le GapCursor delle
    // tabelle non arrivano qui (parent diverso da blockRow).
    // La materializzazione resta SOLO tra le righe (sotto): serve a Up/Down
    // per dare una vera riga di testo dove scrivere tra le righe.
    if (
      !editor.view.composing &&
      !transaction.getMeta('blockRowNudge') &&
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
          let off = rowPos + 1;
          for (let k = 0; k < pick; k += 1) off += row.child(k).nodeSize;
          const atEnd = pick !== idx;
          const target = atEnd ? off + row.child(pick).nodeSize - 1 : off + 1;
          const nudge = state.tr.setSelection(Selection.near(state.doc.resolve(target), atEnd ? -1 : 1));
          nudge.setMeta('blockRowNudge', true);
          editor.view.dispatch(nudge);
          return;
        }
      }
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
      // Su/Giu ai bordi verticali della riga: escono dalla riga su una vera
      // riga di testo tra le righe (esistente o appena creata), dove il caret
      // si disegna normale e la scrittura crea una nuova riga tra le righe.
      // Senza questo, il default coordinato atterra nel gap della riga
      // (disegnato in alto) e la scrittura finisce tra gli elementi della
      // stessa riga invece che tra le righe.
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
    view.dispatch(state.tr.setSelection(Selection.near(state.doc.resolve(target), dir)));
    return true;
  };
  // Caret già nel gap diretto della riga: mai restarci, vai nel vicino.
  if ($from.parent.type.name === 'blockRow') {
    const idx = $from.index(rowDepth);
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

function moveOutOfRowVertical(editor: Editor, dir: -1 | 1): boolean {
  const { state, view } = editor;
  const { $from } = state.selection;
  if (!state.selection.empty) return false;
  const rowDepth = findBlockRowDepth($from);
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
  if (!inGap) {
    let off = rowPos + 1;
    for (let k = 0; k < row.childCount; k += 1) {
      const child = row.child(k);
      if ($from.pos >= off && $from.pos <= off + child.nodeSize) {
        childStart = off;
        childEnd = off + child.nodeSize;
        break;
      }
      off += child.nodeSize;
    }
    if (childStart === -1) return false;
  }
  if (dir < 0) {
    // Solo se sopra il caret non c'è più testo nel suo elemento (o caret
    // nel gap: lì sopra non c'è mai niente, si esce comunque).
    if (!inGap && state.doc.textBetween(childStart + 1, $from.pos, undefined, '').length > 0) return false;
    if (rowIndex <= 0) return false;
    const prev = parent.child(rowIndex - 1);
    const tr = state.tr;
    if (prev.type.name === 'paragraph') {
      tr.setSelection(Selection.near(state.doc.resolve(rowPos - 1), -1));
    } else {
      // Niente riga auto-creata: GapCursor visibile al confine, in attesa.
      // Un TextSelection lì il browser non lo disegna (resta il caret
      // dentro l'elemento); il GapCursor invece ha il suo widget
      // lampeggiante. La riga nasce solo scrivendo o con Invio.
      const $gap = state.doc.resolve(rowPos);
      if (!(GapCursor as unknown as { valid: ($pos: unknown) => boolean }).valid($gap)) return false;
      tr.setSelection(new GapCursor($gap));
    }
    view.dispatch(tr);
    return true;
  }
  if (!inGap && state.doc.textBetween($from.pos, childEnd - 1, undefined, '').length > 0) return false;
  if (rowIndex >= parent.childCount - 1) return false;
  const next = parent.child(rowIndex + 1);
  const tr = state.tr;
  if (next.type.name === 'paragraph') {
    tr.setSelection(Selection.near(state.doc.resolve(rowEnd), 1));
  } else {
    const $gap = state.doc.resolve(rowEnd);
    if (!(GapCursor as unknown as { valid: ($pos: unknown) => boolean }).valid($gap)) return false;
    tr.setSelection(new GapCursor($gap));
  }
  view.dispatch(tr);
  return true;
}

function splitBlockRowAtCaret(editor: Editor): boolean {
  const { state, view } = editor;
  const { $from } = state.selection;
  if (!state.selection.empty) return false;
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