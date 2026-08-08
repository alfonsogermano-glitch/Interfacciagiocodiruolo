import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey, NodeSelection, TextSelection, type Transaction, type EditorState } from '@tiptap/pm/state';
import type { Node as ProseMirrorNode, ResolvedPos } from '@tiptap/pm/model';
import { findAncestorDepth, isPositionInsideAny } from './tiptapRow';

// Fase 4a del progetto "affiancamento a livello documento" (piano confermato
// 2026-08-08): drag&drop per CREARE una row trascinando un elemento accanto
// a un altro. Il meccanismo nativo di ProseMirror (dropPoint, verificato nel
// sorgente - node_modules/prosemirror-transform/dist/index.js, funzione
// dropPoint) risolve gia' da solo "trascina DENTRO una row esistente" (nessun
// concetto di coordinata orizzontale, solo bias verticale prima/dopo un nodo)
// ma non ha nessuna nozione di "affianca invece di impila": serve un
// meccanismo nuovo, agganciato PRIMA che il comportamento nativo scatti.
//
// props.handleDrop (EditorView, non un nostro comando) e' il punto giusto -
// verificato nel sorgente di prosemirror-view (handleDrop, node_modules/
// prosemirror-view/dist/index.js righe ~3836-3889): se un handleDrop
// registrato ritorna true, l'INTERO comportamento di default (dropPoint +
// replaceRange) non gira affatto, e prosemirror-view stesso chiama gia'
// event.preventDefault() per noi (verificato, nessuna chiamata manuale
// necessaria qui). L'evento 'drop' e' un DragEvent (estende MouseEvent) con
// clientX/clientY propri - non serve un handler dragover separato per la
// LOGICA di 4a (leggo le coordinate direttamente dentro handleDrop); resta
// pero' necessario un handler dragstart per catturare la posizione del nodo
// sorgente PRIMA del drop, dato che EditorView.dragging espone in modo
// pubblico e tipizzato solo { slice, move } (prosemirror-view/dist/
// index.d.ts riga ~425) - MAI il nodo/la posizione di partenza (quel campo
// esiste solo nell'implementazione interna, non nel tipo pubblico) - la
// ricalcoliamo noi stessi con la stessa tecnica gia' in uso altrove in
// questo progetto (posAtCoords + risalita per profondita', mai API interne
// come docView/nearestDesc, anch'esse assenti dal .d.ts pubblico).

// I 4 tipi rowItem (stesso elenco concettuale di RowElementType in
// tiptapRow.ts, qui runtime invece che solo a livello di tipo TS - serve
// poterli elencare/confrontare a runtime durante la risoluzione del target).
const ROW_ITEM_TYPE_NAMES = ['paragraph', 'textBox', 'collapseBlock', 'table'];

// Sorgenti accettate per QUESTA sotto-fase - tabella esplicitamente esclusa
// (Fase 4c, ha gia' il proprio drag&drop interno via prosemirror-tables,
// interagire con essa e' fuori scope qui). Paragraph incluso a livello di
// type-check (nessun motivo strutturale per escluderlo) ma non ha oggi una
// maniglia dedicata in UI (nessun data-drag-handle nel suo renderHTML) - un
// trascinamento di un paragrafo intero passerebbe comunque da qui se mai
// avviato (es. via drag di una selezione di testo), ma resta un percorso
// non esercitato dalla UI attuale.
const DRAGGABLE_SOURCE_TYPES = ['paragraph', 'textBox', 'collapseBlock'];

// Frazione della larghezza del rect target oltre la quale il punto e'
// "zona affianca" (sinistra o destra) invece che "zona centrale" (nativo,
// impila sopra/sotto) - un quarto per lato, meta' centrale neutra. Valore
// scelto in fase di pianificazione, non ancora tarato dal vivo: la sotto-
// fase 4b (indicatore visivo) e' il momento naturale per rivederlo insieme
// al feedback grafico, qui serve solo un valore ragionevole per verificare
// che il meccanismo funzioni.
const SIDE_ZONE_FRACTION = 0.25;

function resolveSideZone(clientX: number, rect: DOMRect): 'before' | 'after' | null {
  if (rect.width <= 0) return null;
  const fraction = (clientX - rect.left) / rect.width;
  if (fraction < SIDE_ZONE_FRACTION) return 'before';
  if (fraction > 1 - SIDE_ZONE_FRACTION) return 'after';
  return null;
}

// Risolve, da una posizione nel documento, l'item "rowItem" candidato a
// sorgente o destinazione del drop - condivisa fra dragstart (sorgente) e
// handleDrop (destinazione), stessa identica nozione di "item" nei due casi.
//
// Cammino dalla PROFONDITA' 1 (livello documento) verso $pos, fermandosi al
// PRIMO (piu' esterno) antenato di tipo rowItem incontrato - non alla
// profondita' di $pos stessa: se il punto e' dentro un TextBox/Collapse che
// e' esso stesso l'item (es. il mouse e' sopra un suo paragrafo interno),
// l'item da considerare e' il box stesso, non il suo contenuto - fermarsi
// al PRIMO match dall'esterno garantisce questo senza un ramo dedicato.
//
// Guardia tabella/cella PRIMA della risalita (isPositionInsideAny, la
// stessa gia' usata da addElementBeside in tiptapRow.ts per lo stesso
// identico motivo): annidare/affiancare dentro una cella resta fuori scope,
// tabella o non tabella il rowItem trovato - un $pos dentro una cella di
// una tabella che e' essa stessa figlia di una row viene comunque
// rifiutato, coerente con la Fase 2.
function resolveRowDropItem(doc: ProseMirrorNode, pos: number): { itemPos: number; rowDepth: number | null } | null {
  if (pos < 0 || pos > doc.content.size) return null;
  const $pos: ResolvedPos = doc.resolve(pos);
  if (isPositionInsideAny($pos, ['table', 'tableCell', 'tableHeader'])) return null;

  for (let depth = 1; depth <= $pos.depth; depth += 1) {
    if (ROW_ITEM_TYPE_NAMES.includes($pos.node(depth).type.name)) {
      const parent = $pos.node(depth - 1);
      const rowDepth = parent.type.name === 'row' ? depth - 1 : null;
      return { itemPos: $pos.before(depth), rowDepth };
    }
  }
  return null;
}

// Costruisce, in UNA transazione, lo spostamento del nodo trascinato -
// rimozione dalla sorgente + inserimento accanto al target. Non riusa
// addElementBeside (tiptapRow.ts) direttamente: quel comando assume sempre
// un lato "da creare" (createRowElementNode, per il pulsante di toolbar),
// qui invece ENTRAMBI i nodi sono gia' reali/esistenti altrove nel
// documento - riusa pero' la stessa FORMA (Caso 1 "gia' in una row" ->
// inserisci come fratello; Caso 2 "non ancora in una row" -> avvolgi in una
// row nuova) e gli stessi helper esportati (findAncestorDepth via
// resolveRowDropItem sopra).
//
// sourcePos e target.itemPos sono entrambi posizioni sul doc ORIGINALE
// (state.doc, prima di questa transazione) - calcolati in momenti diversi
// (sourcePos a dragstart, target a drop) ma sempre risolti freschi contro
// lo stato CORRENTE al momento della chiamata (chi chiama e' responsabile
// di non passare posizioni stale). tr.mapping mappa target.itemPos
// attraverso la cancellazione della sorgente, cosi' l'ordine testuale fra
// sorgente e destinazione (target prima o dopo la sorgente nel documento)
// non richiede alcun caso speciale.
function buildRowDropTransaction(
  state: EditorState,
  sourcePos: number,
  target: { itemPos: number; rowDepth: number | null },
  side: 'before' | 'after'
): Transaction | null {
  const sourceNode = state.doc.nodeAt(sourcePos);
  if (!sourceNode) return null;

  const tr = state.tr;
  tr.delete(sourcePos, sourcePos + sourceNode.nodeSize);

  const mappedTargetPos = tr.mapping.map(target.itemPos);
  const $target = tr.doc.resolve(mappedTargetPos);
  const targetNode = $target.nodeAfter;
  if (!targetNode) return null;

  if (target.rowDepth !== null) {
    // Gia' dentro una row esistente: il nodo trascinato si inserisce come
    // nuovo fratello, PRIMA o DOPO l'item specifico sotto il mouse (non
    // sempre in coda alla row, a differenza del Caso 1 di addElementBeside -
    // qui la posizione la decide la zona rilevata, non il cursore).
    const insertAt = side === 'before' ? mappedTargetPos : mappedTargetPos + targetNode.nodeSize;
    tr.insert(insertAt, sourceNode);
    tr.setSelection(NodeSelection.create(tr.doc, insertAt));
  } else {
    // Non ancora in una row: avvolge target + sorgente in una row nuova,
    // stesso schema del Caso 2 di addElementBeside (tiptapRow.ts) - side
    // decide l'ordine dei due figli.
    const schema = state.schema;
    const children = side === 'before' ? [sourceNode, targetNode] : [targetNode, sourceNode];
    const rowNode = schema.nodes.row.create(null, children);
    tr.replaceWith(mappedTargetPos, mappedTargetPos + targetNode.nodeSize, rowNode);
    const selectPos = side === 'before' ? mappedTargetPos : mappedTargetPos + sourceNode.nodeSize;
    tr.setSelection(NodeSelection.create(tr.doc, selectPos));
  }

  tr.scrollIntoView();
  return tr;
}

const rowDropPluginKey = new PluginKey('rowDrop');

export const RowDropExtension = Extension.create({
  name: 'rowDrop',
  addProseMirrorPlugins() {
    const editor = this.editor as Editor;

    // Posizione (nel doc al momento del dragstart) del nodo in
    // trascinamento - chiusura del plugin, stesso pattern gia' in uso in
    // TextBoxEdgeCursorExtension (tiptapTextBoxEdgeCursor.ts, `lastKey`
    // dentro view()): non e' stato ProseMirror (non sopravviverebbe a un
    // evento DOM puro come dragstart, che non e' una transazione), ne'
    // serve esserlo - vive solo per la durata del gesto di trascinamento,
    // azzerata a dragend.
    let sourcePos: number | null = null;

    return [
      new Plugin({
        key: rowDropPluginKey,
        props: {
          handleDOMEvents: {
            // Coordinate REALI dell'evento (mai la selezione corrente, che
            // puo' non avere alcuna relazione col punto dove il gesto di
            // drag e' effettivamente iniziato - un drag puo' partire da una
            // maniglia senza che l'utente abbia mai cliccato per
            // selezionare prima): stessa tecnica di handleDrop sotto,
            // posAtCoords + risalita per profondita' (resolveRowDropItem),
            // mai API interne (docView/nearestDesc, assenti dal tipo
            // pubblico di EditorView).
            dragstart(view, event) {
              sourcePos = null;
              if (!(event instanceof DragEvent)) return false;
              const coords = { left: event.clientX, top: event.clientY };
              const startPos = view.posAtCoords(coords);
              if (!startPos) return false;
              const target = resolveRowDropItem(view.state.doc, startPos.pos);
              if (!target) return false;
              const node = view.state.doc.nodeAt(target.itemPos);
              if (node && DRAGGABLE_SOURCE_TYPES.includes(node.type.name) && node.type.spec.draggable) {
                sourcePos = target.itemPos;
              }
              return false;
            },
            dragend() {
              sourcePos = null;
              return false;
            },
          },
          handleDrop(view, event, slice, moved) {
            if (!moved || sourcePos === null) return false;
            if (!(event instanceof DragEvent)) return false;

            const isSingleNodeSlice = slice.openStart === 0 && slice.openEnd === 0 && slice.content.childCount === 1;
            const draggedType = isSingleNodeSlice ? slice.content.firstChild?.type.name : null;
            if (!draggedType || !DRAGGABLE_SOURCE_TYPES.includes(draggedType)) return false;

            const coords = { left: event.clientX, top: event.clientY };
            const dropPos = view.posAtCoords(coords);
            if (!dropPos) return false;

            const target = resolveRowDropItem(view.state.doc, dropPos.pos);
            if (!target) return false;
            if (target.itemPos === sourcePos) return false;

            const targetDom = view.nodeDOM(target.itemPos);
            if (!(targetDom instanceof HTMLElement)) return false;
            const zone = resolveSideZone(event.clientX, targetDom.getBoundingClientRect());
            if (!zone) return false;

            const tr = buildRowDropTransaction(view.state, sourcePos, target, zone);
            if (!tr) return false;

            view.dispatch(tr);
            return true;
          },
        },
      }),
    ];
  },
});
