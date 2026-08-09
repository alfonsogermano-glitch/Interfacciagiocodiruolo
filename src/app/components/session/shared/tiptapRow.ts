import { Node, mergeAttributes } from '@tiptap/core';
import { Paragraph } from '@tiptap/extension-paragraph';
import { createTable } from '@tiptap/extension-table';
import { TextSelection, type EditorState } from '@tiptap/pm/state';
import type { Node as ProseMirrorNode, ResolvedPos, Schema } from '@tiptap/pm/model';

// Fase 1 del progetto "affiancamento a livello documento" (piano confermato
// 2026-08-07): solo schema + rendering CSS, NESSUNA navigazione/drag&drop/
// toolbar ancora (fasi successive) - per ora l'unico modo di creare una row
// e' programmatico (editor.commands.insertContent), nessun comando
// setRow esposto qui di proposito.
//
// content: 'rowItem{2,}' - il vincolo "minimo 2 figli" e' fatto rispettare
// dallo SCHEMA stesso, non da codice di validazione custom: ProseMirror
// rifiuta (no-op) qualunque transazione che lascerebbe una row con 0 o 1
// figli. Effetto collaterale atteso e accettato per questa fase: backspace
// "bloccato" se ridurrebbe una row a 1 solo figlio - il collasso automatico
// (unwrap della row quando resta un solo figlio) e' Fase 5, qui serve solo
// evitare lo stato invalido.
//
// group:'block' (non anche 'rowItem'): una row NON puo' contenere un'altra
// row direttamente - impedisce l'annidamento row-in-row. Resta pero'
// inseribile dentro una cella di tabella o dentro TextBox/Collapse (che
// accettano 'block+'), lasciato deliberatamente possibile per questa fase
// (nessun modo di crearla li' finche' non arriva la Fase 2 - vedi piano
// confermato).
//
// isolating+defining: stesso trattamento di textBox/collapseBlock
// (tiptapBlocks.tsx) - Invio non solleva contenuto fuori dalla row.
//
// Nessun addNodeView: la maniglia vive nel renderHTML come div sibling
// (stesso pattern di TextBox, non di TableWithHandle) - ProseMirror gestisce
// selectable/draggable in automatico per un NodeView di default (non
// custom), non serve una classe View dedicata.

// Tipi di elemento che il comando addElementBeside sa costruire - stessi 4
// gia' supportati dallo schema in Fase 1 (group 'rowItem').
export type RowElementType = 'paragraph' | 'textBox' | 'collapseBlock' | 'table';

// Nodo vuoto pronto per l'inserimento, un tipo per volta - stessa identica
// struttura gia' usata dai comandi setTextBox/setCollapseBlock esistenti
// (tiptapBlocks.tsx) e dal pulsante Tabella esistente (RichTextEditor.tsx),
// solo costruita come Node ProseMirror diretto invece che come JSON passato
// a insertContent: qui serve un nodo GIA' PRONTO da piazzare dentro il
// content array di una nuova row nella STESSA transazione (vedi
// addElementBeside sotto) - insertContent lancerebbe un secondo
// step/dispatch separato, rompendo l'atomicita' undo richiesta dal piano
// Fase 2 confermato 2026-08-07.
function createRowElementNode(schema: Schema, type: RowElementType): ProseMirrorNode {
  const paragraph = schema.nodes.paragraph.create();
  switch (type) {
    case 'paragraph':
      return paragraph;
    case 'textBox':
      return schema.nodes.textBox.create(null, paragraph);
    case 'collapseBlock':
      return schema.nodes.collapseBlock.create({ open: false }, [
        schema.nodes.collapseSummary.create(),
        schema.nodes.collapseBody.create(null, schema.nodes.paragraph.create()),
      ]);
    case 'table':
      // Stessi parametri del pulsante "Tabella" esistente (RichTextEditor.tsx):
      // 3x3, senza riga di intestazione (si attiva dopo dal menu contestuale).
      return createTable(schema, 3, 3, false);
  }
}

// Antenato piu' vicino di un dato tipo, a qualunque profondita' - stessa
// idea di isSelectionInside (tiptapBlocks.tsx), ma restituisce la depth
// invece di un booleano: serve sapere ESATTAMENTE a che profondita' si
// trova la row per calcolare $from.end(depth) sotto. Esportata (Fase 4a,
// tiptapRowDrop.ts): la risoluzione del target di un drop riusa la stessa
// identica ricerca per sapere se il punto sotto il mouse e' gia' dentro una
// row esistente, invece di reimplementarla.
export function findAncestorDepth($pos: ResolvedPos, typeName: string): number | null {
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    if ($pos.node(depth).type.name === typeName) return depth;
  }
  return null;
}

// Vero se la posizione data e' annidata dentro uno qualunque dei tipi
// elencati, a qualunque profondita' - nucleo condiviso, non piu' legato a
// state.selection: estratta (Fase 4a) perche' il drag&drop deve fare la
// STESSA verifica su posizioni che non sono la selezione corrente (dove
// il drag e' partito, dove sta per atterrare - tiptapRowDrop.ts), mentre
// isSelectionInsideAny sotto resta il caso specifico "verifica sulla
// selezione", ora un thin wrapper.
export function isPositionInsideAny($pos: ResolvedPos, typeNames: string[]): boolean {
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    if (typeNames.includes($pos.node(depth).type.name)) return true;
  }
  return false;
}

// Vero se la selezione e' annidata dentro uno qualunque dei tipi elencati, a
// qualunque profondita' - stessa idea di isSelectionInside (tiptapBlocks.tsx)
// generalizzata a piu' tipi in un colpo solo (qui servono contemporaneamente
// table/textBox/collapseBlock, non un tipo alla volta).
function isSelectionInsideAny(state: EditorState, typeNames: string[]): boolean {
  return isPositionInsideAny(state.selection.$from, typeNames);
}

export const Row = Node.create({
  name: 'row',
  group: 'block',
  content: 'rowItem{2,}',
  isolating: true,
  defining: true,
  selectable: true,
  draggable: true,

  // contentElement: la maniglia e' un div sibling fuori da .tiptap-row-flex,
  // senza puntare li' esplicitamente un copia-incolla interno la tratterebbe
  // come contenuto reale della row (stesso motivo di TextBox/CollapseBlock).
  parseHTML() {
    return [{ tag: 'div[data-type="row"]', contentElement: '.tiptap-row-flex' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'row', class: 'tiptap-row' }),
      ['div', { 'data-drag-handle': '', contenteditable: 'false', class: 'tiptap-block-handle', 'aria-hidden': 'true' }, '⠿'],
      ['div', { class: 'tiptap-row-flex' }, 0],
    ];
  },

  // Fase 2 (piano confermato 2026-08-07): comando esplicito da toolbar
  // "Aggiungi elemento accanto" - due comportamenti secondo la posizione del
  // cursore, un solo step di transazione/undo in entrambi i casi (nessun
  // insertContent + spostamento successivo, vedi createRowElementNode sopra).
  //
  // Guardia sulla selezione: non un semplice "solo se collapsed" come le
  // funzioni di navigazione tastiera in tiptapTextBoxEdgeCursor.ts (che
  // giustamente si bloccano sempre con selezione estesa - "muovi il
  // cursore" non ha senso su un range). Qui, essendo un comando esplicito di
  // toolbar e non di navigazione, si procede anche con selezione estesa,
  // purche' $from e $to concordino sullo stesso contenitore rilevante (la
  // stessa row per il caso "aggiungi in coda", lo stesso blocco a livello
  // documento per il caso "avvolgi") - altrimenti il comando e' un no-op
  // (return false): avvolgere/appendere ignorando silenziosamente meta' di
  // una selezione che attraversa due contenitori diversi sarebbe un
  // comportamento sorprendente.
  addCommands() {
    return {
      addElementBeside:
        (type: RowElementType) =>
        ({ tr, dispatch, state }) => {
          const { $from, $to } = state.selection;
          const schema = state.schema;

          // Caso 1: il cursore (o l'intera selezione) e' gia' dentro una
          // row esistente - il nuovo elemento si aggiunge in coda al suo
          // content, nessun wrapping.
          const rowDepthFrom = findAncestorDepth($from, 'row');
          const rowDepthTo = findAncestorDepth($to, 'row');
          if (
            rowDepthFrom !== null &&
            rowDepthFrom === rowDepthTo &&
            $from.node(rowDepthFrom) === $to.node(rowDepthTo)
          ) {
            const insertPos = $from.end(rowDepthFrom);
            if (dispatch) {
              const newNode = createRowElementNode(schema, type);
              tr.insert(insertPos, newNode);
              tr.setSelection(TextSelection.near(tr.doc.resolve(insertPos + 1)));
            }
            return true;
          }

          // Caso 2: livello documento - avvolge il blocco corrente + il
          // nuovo elemento in una row nuova. Limitato per questa fase al
          // solo livello documento top-level (piano confermato 2026-08-07,
          // punto 3): se il cursore e' annidato dentro una cella di
          // tabella o dentro un TextBox/Collapse, il comando e' disabilitato
          // - creare intenzionalmente una row annidata (lo schema Fase 1 lo
          // permetterebbe) e' rimandato a quando avremo piu' chiarezza su
          // scroll orizzontale annidato/arrow-nav a doppio livello.
          if (isSelectionInsideAny(state, ['table', 'textBox', 'collapseBlock'])) return false;

          // Selezione che attraversa due blocchi diversi a livello
          // documento (es. da meta' di un paragrafo a meta' del successivo)
          // - "il blocco corrente" diventerebbe ambiguo, no-op deliberato
          // invece di avvolgere solo il primo e perdere silenziosamente il
          // resto della selezione.
          if ($from.node(1) !== $to.node(1)) return false;

          const blockStart = $from.before(1);
          const blockEnd = $from.after(1);
          const existingNode = $from.node(1);

          if (dispatch) {
            const newNode = createRowElementNode(schema, type);
            const rowNode = schema.nodes.row.create(null, [existingNode, newNode]);
            tr.replaceWith(blockStart, blockEnd, rowNode);
            // +1 per entrare nella row appena creata, +existingNode.nodeSize
            // per superare il primo figlio (quello preesistente), +1 per
            // entrare nel nuovo nodo - TextSelection.near (stesso helper
            // usato dal comando nativo insertTable, vedi
            // node_modules/@tiptap/extension-table/src/table/table.ts)
            // trova poi la prima posizione di testo valida li' dentro,
            // generico per tutti e 4 i tipi (incluse le celle di una
            // tabella appena creata).
            const offset = blockStart + 1 + existingNode.nodeSize + 1;
            tr.setSelection(TextSelection.near(tr.doc.resolve(offset)));
          }
          return true;
        },
    };
  },
});

// Attributo condiviso dai 4 tipi rowItem (Fase 5b "affiancamento a livello
// documento", piano confermato 2026-08-09) - fattorizzato in un solo posto
// per evitare che le 4 copie (paragraph/textBox/collapseBlock/table)
// divergano nel parsing/serializzazione nel tempo. number|null, default
// null = comportamento automatico attuale (flex:1 1 0 da theme.css, tutti
// i fratelli crescono alla pari) - un valore numerico sostituisce SOLO la
// componente flex-grow via style inline (mai flex-basis/min-width, che
// restano quelli del CSS - vedi Fase 5a per il perche' flex-basis non va
// mai toccato: un longhand inline sovrascrive correttamente solo quella
// componente dello shorthand da stylesheet). data-row-grow come attributo
// DOM piatto SEMPRE presente (oltre allo style, quando incluso) per un
// roundtrip robusto anche se lo style venisse perso/alterato (incolla
// esterno, ispezione DOM) - stesso pattern gia' in uso da prosemirror-
// tables per colwidth (data-colwidth).
//
// includeStyle:false (usato solo da TableWithHandle, tiptapTableHandle.ts):
// il renderHTML della tabella (libreria @tiptap/extension-table) usa gia'
// HTMLAttributes.style per calcolare la larghezza delle colonne
// (getTableStyle() - se style e' gia' presente lo usa cosi' com'e',
// altrimenti calcola width/min-width dalle colonne) - un nostro
// style:'flex-grow:N' li' sovrascriverebbe quel calcolo nell'export
// statico (getHTML/clipboard). Per la tabella l'applicazione visiva vive
// SOLO nella sua NodeView (TableViewWithHandle), mai nel renderHTML.
export function createRowGrowAttribute(options?: { includeStyle?: boolean }) {
  const includeStyle = options?.includeStyle ?? true;
  return {
    default: null as number | null,
    parseHTML: (element: HTMLElement) => {
      const raw = element.getAttribute('data-row-grow');
      return raw === null ? null : Number(raw);
    },
    renderHTML: (attributes: { rowGrow: number | null }) => {
      if (attributes.rowGrow == null) return {};
      const rendered: Record<string, unknown> = { 'data-row-grow': attributes.rowGrow };
      if (includeStyle) rendered.style = `flex-grow: ${attributes.rowGrow}`;
      return rendered;
    },
  };
}

// Paragraph esteso col group 'rowItem' in piu' (oltre al nativo 'block') -
// stesso pattern gia' usato per TableWithHandle (tiptapTableHandle.ts):
// paragraph non e' un nodo custom altrove nel repo, viene dal bundle
// StarterKit, quindi va disattivato li' (RichTextEditor.tsx,
// StarterKit.configure({ paragraph:false })) e ri-registrato qui a parte.
// addAttributes con ...this.parent?.() (Fase 5b): Paragraph nativo non ha
// attrs propri oggi, ma preservare quelli ereditati costa nulla ed evita
// una futura regressione silenziosa se la libreria ne aggiungesse - stesso
// principio gia' in uso altrove nel repo per parseHTML/renderHTML
// (tiptapTableCellWrapper.ts).
export const ParagraphWithRowGroup = Paragraph.extend({
  group: 'block rowItem',
  addAttributes() {
    return {
      ...this.parent?.(),
      rowGrow: createRowGrowAttribute(),
    };
  },
});

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    row: {
      /** Aggiunge un elemento (paragrafo/TextBox/Collapse/tabella) accanto al blocco corrente:
       *  in coda se il cursore e' gia' in una row, avvolgendo blocco corrente + nuovo altrimenti. */
      addElementBeside: (type: RowElementType) => ReturnType;
    };
  }
}
