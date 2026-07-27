import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent, type NodeViewProps } from '@tiptap/react';
import { Selection } from '@tiptap/pm/state';
import { ChevronRight } from 'lucide-react';

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

// Box di testo: un contenitore con bordo/sfondo distintivo attorno a blocchi
// (paragrafi, titoli, liste) - a differenza del Collapse sotto, non serve
// nessuna interattivita' ne' NodeView React: puro renderHTML statico, stesso
// identico rendering in sola lettura e in modifica (solo non modificabile).
export const TextBox = Node.create({
  name: 'textBox',
  group: 'block',
  content: 'block+',
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="text-box"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'text-box', class: 'tiptap-textbox' }), 0];
  },
  addCommands() {
    return {
      setTextBox:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, content: [{ type: 'paragraph' }] }),
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
});

const CollapseBody = Node.create({
  name: 'collapseBody',
  content: 'block+',
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
// testo del sommario (stesso problema/soluzione discussi nel piano: icona
// dedicata, non l'intera riga cliccabile). L'attributo open e' persistito
// nel documento (deciso col piano: un GM puo' preparare un toggle chiuso per
// i giocatori). Il click funziona SEMPRE, anche a editor non modificabile
// (editable=false, sola lettura): updateAttributes dispatcha una
// transazione a prescindere da editable (che blocca solo l'input nativo da
// tastiera/contenteditable, non i dispatch programmatici) - un lettore senza
// permesso di scrittura puo' comunque espandere/comprimere per leggere,
// anche se quel toggle non verra' salvato per gli altri (lo stesso comando
// tenta comunque il salvataggio, che fallisce silenziosamente lato server
// per chi non ha i permessi - vedi handleCustomTabRichContentChange).
function CollapseBlockView({ node, updateAttributes }: NodeViewProps) {
  const open = node.attrs.open !== false;
  return (
    <NodeViewWrapper className="tiptap-collapse" data-open={open}>
      <button
        type="button"
        contentEditable={false}
        onClick={() => updateAttributes({ open: !open })}
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
  parseHTML() {
    return [{ tag: 'div[data-type="collapse-block"]' }];
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
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { open: false },
            content: [
              { type: 'collapseSummary', content: [] },
              { type: 'collapseBody', content: [{ type: 'paragraph' }] },
            ],
          }),
    };
  },
});

// Estensioni da registrare in useEditor({ extensions: [...] }) - ogni tipo di
// nodo deve comparire nell'array per entrare nello schema, inclusi i due
// figli senza comando proprio (CollapseSummary/CollapseBody).
export const TIPTAP_BLOCK_EXTENSIONS = [TextBox, CollapseSummary, CollapseBody, CollapseBlock];
