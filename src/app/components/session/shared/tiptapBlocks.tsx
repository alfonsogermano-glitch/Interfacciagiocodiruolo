import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent, type NodeViewProps } from '@tiptap/react';
import { Selection, Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { ChevronRight } from 'lucide-react';

// Vero fino a qualunque profondita' (non solo il genitore immediato) che il
// cursore sia dentro un nodo di quel tipo - usata sotto per impedire
// l'inserimento di un blocco (TextBox/CollapseBlock) dentro il sommario di
// un Collapse (content: 'inline*', solo testo). Bug segnalato: i comandi
// setTextBox/setCollapseBlock passano da insertContentAt, che internamente
// chiama tr.replaceWith - a differenza della logica di "adattamento"
// (Slice.fit) usata da drag/incolla nativi di ProseMirror, replaceWith non
// cerca una posizione alternativa valida: se il punto d'inserimento non
// accetta quel tipo di nodo, genera un errore invece di limitarsi a
// rifiutare silenziosamente. Controllo esplicito qui, prima di tentare
// l'inserimento.
function isSelectionInside(state: EditorState, typeName: string): boolean {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    if ($from.node(depth).type.name === typeName) return true;
  }
  return false;
}

// Contenuto ammesso DENTRO un TextBox/CollapseBlock (pulizia 2026-08-20,
// "editor di testo ricco semplice": rimosso l'intero sistema di
// affiancamento/annidamento) - elenco esplicito di nomi di nodo, non il
// group generico 'block' (che includerebbe anche textBox/collapseBlock
// stessi, riaprendo l'annidamento che questa richiesta vuole eliminare).
// Condiviso fra TextBox e CollapseBody sotto invece di due liste separate
// che potrebbero divergere.
const SIMPLE_BLOCK_CONTENT = 'paragraph | bulletList | orderedList | blockquote | horizontalRule | image';

// Box di testo: un contenitore con bordo/sfondo distintivo attorno a blocchi
// di testo semplice - nessuna NodeView React necessaria, puro renderHTML
// statico, stesso identico rendering in sola lettura e in modifica (solo
// non modificabile). selectable: opzione nativa di ProseMirror (click-to-
// select/Backspace-elimina-nodo gia' gestiti da soli). Nessuna maniglia,
// nessun drag (rimossi nella pulizia 2026-08-20 insieme al sistema di
// affiancamento che li richiedeva).
// isolating: true - impedisce a liftEmptyBlock (catena nativa di Invio,
// vedi @tiptap/core) di sollevare fuori dal TextBox l'unico paragrafo
// vuoto che contiene, cosa che altrimenti elimina l'intero wrapper TextBox
// (bug confermato via log 2026-08-01: Invio su paragrafo vuoto, unico figlio
// del box - il box scompariva, -2 sul totale documento).
export const TextBox = Node.create({
  name: 'textBox',
  group: 'block',
  content: `(${SIMPLE_BLOCK_CONTENT})+`,
  defining: true,
  isolating: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'div[data-type="text-box"]', contentElement: '.tiptap-textbox-content' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'text-box', class: 'tiptap-textbox' }), ['div', { class: 'tiptap-textbox-content' }, 0]];
  },
  addCommands() {
    return {
      setTextBox:
        () =>
        ({ commands, state }) => {
          if (isSelectionInside(state, 'collapseSummary')) return false;
          return commands.insertContent({ type: this.name, content: [{ type: 'paragraph' }] });
        },
    };
  },
});

// Le due meta' del Collapse - nodi "foglia" senza NodeView propria, resi
// automaticamente da ProseMirror dentro l'unico contentDOM del genitore
// (CollapseBlock sotto). Non appartengono al gruppo 'block': possono
// comparire SOLO come figli espliciti di collapseBlock (vedi il suo content
// 'collapseSummary collapseBody'), mai da soli altrove nel documento.
const CollapseSummary = Node.create({
  name: 'collapseSummary',
  content: 'inline*',
  parseHTML() {
    return [{ tag: 'div[data-type="collapse-summary"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'collapse-summary', class: 'tiptap-collapse-summary' }), 0];
  },
  // Invio nel sommario: apre il blocco genitore E sposta il cursore
  // nell'inizio del corpo, invece del normale "vai a capo" - flusso naturale
  // "scrivo il titolo, premo Invio, si apre e continuo a scrivere sotto"
  // richiesto dal piano. Guardia sul tipo del nodo genitore della selezione:
  // le scorciatoie da tastiera di un'estensione si applicano sempre a
  // livello globale dell'editor, quindi senza questo controllo Invio
  // scatterebbe (sbagliato) anche fuori da un sommario - restituendo false
  // si lascia il comportamento di default (a capo normale) in ogni altro
  // punto del documento.
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { editor } = this;
        const { $from } = editor.state.selection;
        if ($from.parent.type.name !== this.name) return false;

        const blockDepth = $from.depth - 1;
        if (blockDepth < 0) return false;
        const blockNode = $from.node(blockDepth);
        if (!blockNode || blockNode.type.name !== 'collapseBlock') return false;

        const summaryNode = blockNode.firstChild;
        if (!summaryNode) return false;

        const blockPos = $from.before(blockDepth);
        // Posizione subito dopo la chiusura del sommario = inizio del corpo
        // (il secondo figlio, vedi content 'collapseSummary collapseBody').
        const bodyBoundaryPos = blockPos + 1 + summaryNode.nodeSize;

        return editor
          .chain()
          .command(({ tr }) => {
            tr.setNodeMarkup(blockPos, undefined, { ...blockNode.attrs, open: true });
            // Selection.near invece di +1/+2 manuali: trova da solo la prima
            // posizione valida dentro il corpo (dentro il suo primo figlio,
            // es. un paragrafo), a prescindere da quanti livelli servano.
            const resolved = tr.doc.resolve(bodyBoundaryPos);
            tr.setSelection(Selection.near(resolved, 1));
            return true;
          })
          .scrollIntoView()
          .run();
      },
    };
  },
  // Rete di sicurezza per trascinamento/incolla di un blocco dentro il
  // sommario: a differenza dei nostri comandi (guardia esplicita sopra),
  // drag-and-drop e incolla nativi di ProseMirror passano da Slice.fit, che
  // di norma cerca gia' da solo una posizione alternativa valida - ma non e'
  // garantito per ogni caso (es. incollare uno spezzone che contiene
  // esattamente un textBox/collapseBlock mentre il cursore e' nel sommario).
  // filterTransaction scarta l'INTERA transazione, silenziosamente, se il
  // risultato violerebbe il vincolo "il sommario contiene solo testo" -
  // prima ancora che arrivi a un errore visibile o a un documento
  // incoerente, qualunque sia il percorso che ha provato a produrla.
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('collapseSummaryOnlyInline'),
        filterTransaction: (tr) => {
          if (!tr.docChanged) return true;
          let valid = true;
          tr.doc.descendants((node) => {
            if (!valid) return false;
            if (node.type.name === 'collapseSummary') {
              node.forEach((child) => {
                if (!child.isInline) valid = false;
              });
            }
            return valid;
          });
          return valid;
        },
      }),
    ];
  },
});

const CollapseBody = Node.create({
  name: 'collapseBody',
  content: `(${SIMPLE_BLOCK_CONTENT})+`,
  parseHTML() {
    return [{ tag: 'div[data-type="collapse-body"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'collapse-body', class: 'tiptap-collapse-body' }), 0];
  },
});

// NodeView React del blocco Collapse - qui serve davvero una NodeView
// (a differenza di TextBox): il pulsante che espande/comprime vive FUORI dal
// contentDOM (data-node-view-content), cosi' il click per aprire/chiudere
// non interferisce mai col normale posizionamento del cursore dentro il
// testo del sommario. L'attributo open e' persistito nel documento (un GM
// puo' preparare un toggle chiuso per i giocatori). Il click funziona SEMPRE,
// anche a editor non modificabile (editable=false, sola lettura):
// updateAttributes dispatcha una transazione a prescindere da editable (che
// blocca solo l'input nativo da tastiera/contenteditable, non i dispatch
// programmatici) - un lettore senza permesso di scrittura puo' comunque
// espandere/comprimere per leggere.
function CollapseBlockView({ node, updateAttributes }: NodeViewProps) {
  const open = node.attrs.open !== false;
  return (
    <NodeViewWrapper className="tiptap-collapse" data-open={open}>
      <button
        type="button"
        contentEditable={false}
        onClick={(e) => {
          // Il pulsante vive fuori dal contentDOM: senza stopPropagation, il
          // click bolla fino al click-handling nativo di ProseMirror per i
          // nodi selectable, selezionando l'intero blocco OLTRE ad aprirlo/
          // chiuderlo - innocuo (il toggle funziona comunque) ma visivamente
          // confuso (l'evidenziazione da selezione lampeggia ad ogni click
          // sulla freccina).
          e.stopPropagation();
          updateAttributes({ open: !open });
        }}
        aria-expanded={open}
        aria-label={open ? 'Comprimi' : 'Espandi'}
        className="tiptap-collapse-toggle"
      >
        <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      <NodeViewContent className="tiptap-collapse-content" />
    </NodeViewWrapper>
  );
}

export const CollapseBlock = Node.create({
  name: 'collapseBlock',
  group: 'block',
  content: 'collapseSummary collapseBody',
  defining: true,
  isolating: true,
  selectable: true,
  addAttributes() {
    return {
      // Chiuso di default: si vede solo la riga del sommario finche' l'utente
      // non lo espande (freccina, o Invio nel sommario - vedi
      // CollapseSummary sopra) - partire aperto confondeva titolo (sempre
      // visibile) e corpo (comunque da scrivere dopo).
      open: {
        default: false,
        parseHTML: (element) => element.getAttribute('data-open') === 'true',
        renderHTML: (attributes) => ({ 'data-open': attributes.open === true }),
      },
    };
  },
  // contentElement: la freccina vive fuori dal contentDOM (sibling prima di
  // NodeViewContent) - senza puntare esplicitamente a
  // .tiptap-collapse-content, un copia-incolla interno la tratterebbe come
  // se fosse contenuto reale del nodo.
  parseHTML() {
    return [{ tag: 'div[data-type="collapse-block"]', contentElement: '.tiptap-collapse-content' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'collapse-block' }), 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(CollapseBlockView);
  },
  addCommands() {
    return {
      setCollapseBlock:
        () =>
        ({ commands, state }) => {
          if (isSelectionInside(state, 'collapseSummary')) return false;
          return commands.insertContent({
            type: this.name,
            attrs: { open: false },
            content: [
              { type: 'collapseSummary', content: [] },
              { type: 'collapseBody', content: [{ type: 'paragraph' }] },
            ],
          });
        },
    };
  },
});

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    textBox: {
      /** Inserisce un box di testo (bordo/sfondo distintivo) al cursore, con un paragrafo vuoto dentro. */
      setTextBox: () => ReturnType;
    };
    collapseBlock: {
      /** Inserisce un blocco Collapse (sommario + corpo comprimibile) al cursore, chiuso di default. */
      setCollapseBlock: () => ReturnType;
    };
  }
}

// Estensioni da registrare in useEditor({ extensions: [...] }) - ogni tipo di
// nodo deve comparire nell'array per entrare nello schema, inclusi i due
// figli senza comando proprio (CollapseSummary/CollapseBody).
export const TIPTAP_BLOCK_EXTENSIONS = [TextBox, CollapseSummary, CollapseBody, CollapseBlock];
