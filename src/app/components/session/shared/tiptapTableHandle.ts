import { Table, TableView } from '@tiptap/extension-table';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';

// Sottoclasse minima di TableView (node_modules/@tiptap/extension-table/src/table/TableView.ts)
// - unica aggiunta: un elemento data-drag-handle come primo figlio del
// wrapper, prima del <table>. Nessun'altra riga toccata: colgroup/resize/
// ignoreMutation restano quelli originali, ereditati da super().
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
export const TableWithHandle = Table.extend({
  selectable: true,
  draggable: true,
}).configure({
  resizable: true,
  allowTableNodeSelection: true,
  View: TableViewWithHandle,
});
