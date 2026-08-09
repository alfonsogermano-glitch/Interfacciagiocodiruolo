import { Table, TableView } from '@tiptap/extension-table';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { EditorView, ViewMutationRecord } from '@tiptap/pm/view';
import { createRowGrowAttribute } from './tiptapRow';

// rowGrow (Fase 5b "affiancamento a livello documento", piano confermato
// 2026-08-09): applica lo style flex-grow al wrapper (.tableWrapper,
// this.dom) leggendo l'attr dal nodo - la tabella ha una NodeView propria
// (TableViewWithHandle sotto), quindi a differenza di paragraph/textBox
// (nessuna NodeView, renderHTML/mergeAttributes basta da solo) l'attr va
// riflesso qui ESPLICITAMENTE: renderHTML non tocca mai il DOM live quando
// esiste una NodeView (usato solo per la serializzazione statica -
// getHTML/clipboard - mai per la vista interattiva, che in questa app e'
// SEMPRE quella in uso: editable cambia solo contentEditable sulla stessa
// istanza di editor, non la pipeline di rendering). Funzione condivisa fra
// constructor (primo render) e update() sotto (resize successivi, Fase 5c,
// e undo/redo) per non duplicare la logica.
function applyRowGrow(dom: HTMLElement, node: ProseMirrorNode) {
  const rowGrow = node.attrs.rowGrow as number | null;
  dom.style.flexGrow = rowGrow == null ? '' : String(rowGrow);
}

// Sottoclasse minima di TableView (node_modules/@tiptap/extension-table/src/table/TableView.ts)
// - aggiunge un elemento data-drag-handle come primo figlio del wrapper,
// prima del <table> (invariato), e applica rowGrow al wrapper stesso (Fase
// 5b). colgroup/resize restano quelli originali, ereditati da super()/
// super.update().
// Costruttore chiamato sia da columnResizing (resizable:true, editor
// modificabile - node_modules/prosemirror-tables/dist/index.js, righe
// ~2354-2364, "new View(node, defaultCellMinWidth, view)", 3 argomenti) sia
// dal fallback addNodeView() di Table stesso (non modificabile o non
// ridimensionabile - node_modules/@tiptap/extension-table/src/table/
// table.ts righe 585-601, "new View(node, cellMinWidth, view, HTMLAttributes)",
// 4 argomenti) - firma compatibile con entrambi i casi, HTMLAttributes
// opzionale come nella classe base.
class TableViewWithHandle extends TableView {
  constructor(node: ProseMirrorNode, cellMinWidth: number, view?: EditorView, HTMLAttributes: Record<string, any> = {}) {
    super(node, cellMinWidth, view, HTMLAttributes);

    const handle = document.createElement('div');
    handle.className = 'tiptap-block-handle tiptap-table-handle';
    handle.setAttribute('data-drag-handle', '');
    handle.setAttribute('contenteditable', 'false');
    handle.setAttribute('aria-hidden', 'true');
    handle.textContent = '⠿';
    this.dom.insertBefore(handle, this.table);

    applyRowGrow(this.dom, node);
  }

  // update() di TableView (prosemirror-tables) gestisce gia' colgroup/
  // larghezze colonne e ritorna false se il tipo di nodo e' cambiato (caso
  // che non dovrebbe capitare per una tabella, ma rispettato comunque) -
  // qui aggiungiamo SOLO la riapplicazione di rowGrow quando l'update e'
  // stato accettato, per qualunque causa produca un nuovo `node` per lo
  // stesso nodo tabella (resize di riga Fase 5c, undo/redo, ecc.).
  update(node: ProseMirrorNode): boolean {
    const handled = super.update(node);
    if (handled) applyRowGrow(this.dom, node);
    return handled;
  }

  // this.dom (il wrapper, non solo table/colgroup gia' protetti dalla
  // classe base) ora riceve anche lui una mutazione DOM auto-inflitta (lo
  // style.flexGrow impostato sopra) - senza includerlo qui, il
  // MutationObserver di ProseMirror la tratterebbe come una modifica
  // ESTERNA e tenterebbe di re-interpretarla, stesso motivo per cui
  // table/colgroup sono gia' protetti da TableView stessa.
  ignoreMutation(record: ViewMutationRecord): boolean {
    return super.ignoreMutation(record) || record.target === this.dom;
  }
}

// Tabella (TableKit in RichTextEditor.tsx registra il "table" originale -
// qui invece prendiamo il Node non modificato da @tiptap/extension-table e
// lo estendiamo, per poter aggiungere selectable/draggable a livello di
// schema - proprieta' che .configure() non puo' toccare, solo .extend()
// puo' - vedi RichTextEditor.tsx per come TableKit viene disattivato SOLO
// per il node "table" cosi' questa versione lo sostituisce senza doppia
// registrazione dello stesso name).
//
// allowTableNodeSelection:true e' OBBLIGATORIO, non opzionale: senza,
// prosemirror-tables normalizza qualunque NodeSelection sul nodo tabella in
// una CellSelection (tutte le celle) ad ogni transazione (tableEditing/
// normalizeSelection, prosemirror-tables/dist/index.js righe 725-745) -
// la maniglia selezionerebbe la tabella per un istante e la vedrebbe
// subito "corretta" in una selezione multi-cella, senza mai mostrare
// l'outline ne' permettere il drag.
//
// Tutto il resto (addOptions/addProseMirrorPlugins/addNodeView/addCommands/
// parseHTML/renderHTML, incluso il tokenizer markdown per l'incolla di
// tabelle) resta ereditato invariato da Table originale - .extend() sovrascrive
// solo le chiavi passate qui.
//
// group:'block rowItem' - in piu' rispetto al nativo 'block' (Fase 1
// "affiancamento a livello documento", piano confermato 2026-08-07): rende
// una tabella inseribile come figlio di una row (tiptapRow.ts), insieme a
// TextBox/CollapseBlock/paragraph.
export const TableWithHandle = Table.extend({
  selectable: true,
  draggable: true,
  group: 'block rowItem',
  // rowGrow con includeStyle:false (Fase 5b): vedi il commento su
  // createRowGrowAttribute (tiptapRow.ts) per il motivo - il renderHTML
  // nativo di Table usa gia' HTMLAttributes.style per la larghezza delle
  // colonne, un nostro style li' lo sovrascriverebbe nell'export statico.
  // L'applicazione visiva vera passa SOLO da TableViewWithHandle sopra.
  addAttributes() {
    return {
      ...this.parent?.(),
      rowGrow: createRowGrowAttribute({ includeStyle: false }),
    };
  },
}).configure({
  resizable: true,
  allowTableNodeSelection: true,
  View: TableViewWithHandle,
});
