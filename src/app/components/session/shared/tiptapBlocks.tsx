import { Node, Extension, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent, type NodeViewProps } from '@tiptap/react';
import { Selection, NodeSelection, Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { ChevronRight } from 'lucide-react';

// Vero fino a qualunque profondita' (non solo il genitore immediato) che il
// cursore sia dentro un nodo di quel tipo - usata sotto per impedire
// l'inserimento di un blocco (TextBox/CollapseBlock) in un punto che il suo
// schema non accetta. Bug critico segnalato dal vivo 2026-08-20 ("ancora
// possibile annidare un CollapseBlock dentro una TextBox, manda l'editor in
// blocco"): il content ristretto di TextBox/CollapseBody (SIMPLE_BLOCK_CONTENT
// sotto) gia' ESCLUDE correttamente textBox/collapseBlock a livello di
// schema - il buco era qui, nella guardia dei comandi, ristretta al solo
// 'collapseSummary' (content:'inline*', solo testo) e mai estesa a
// 'textBox'/'collapseBody' quando lo schema di ENTRAMBI e' stato ristretto
// nella pulizia "editor di testo ricco semplice". I comandi
// setTextBox/setCollapseBlock passano da insertContentAt, che internamente
// chiama tr.replaceWith - a differenza della logica di "adattamento"
// (Slice.fit) usata da drag/incolla nativi di ProseMirror, replaceWith non
// cerca una posizione alternativa valida: se il punto d'inserimento non
// accetta quel tipo di nodo, genera un errore invece di limitarsi a
// rifiutare silenziosamente - un'eccezione non gestita durante il dispatch
// di una transazione ProseMirror e' esattamente la classe di bug che blocca
// l'intero editor (stato interno corrotto a meta' aggiornamento).
function isSelectionInside(state: EditorState, typeName: string): boolean {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    if ($from.node(depth).type.name === typeName) return true;
  }
  return false;
}

// Guardia condivisa per ENTRAMBI i comandi setTextBox/setCollapseBlock
// (stesso identico controllo, mai andare fuori sincrono se lo schema
// cambia ancora): un box non puo' essere inserito dentro nessuno dei tre
// contesti "a contenuto ristretto" - dentro un'altra TextBox o dentro un
// CollapseBody (entrambi SIMPLE_BLOCK_CONTENT, mai textBox/collapseBlock)
// o dentro un CollapseSummary (content:'inline*', mai alcun blocco).
function isInsideRestrictedBox(state: EditorState): boolean {
  return isSelectionInside(state, 'textBox') || isSelectionInside(state, 'collapseBody') || isSelectionInside(state, 'collapseSummary');
}

// Contenuto ammesso DENTRO un TextBox/CollapseBlock (pulizia 2026-08-20,
// "editor di testo ricco semplice": rimosso l'intero sistema di
// affiancamento/annidamento) - elenco esplicito di nomi di nodo, non il
// group generico 'block' (che includerebbe anche textBox/collapseBlock
// stessi, riaprendo l'annidamento che questa richiesta vuole eliminare).
// Condiviso fra TextBox e CollapseBody sotto invece di due liste separate
// che potrebbero divergere.
const SIMPLE_BLOCK_CONTENT = 'paragraph | bulletList | orderedList | blockquote | horizontalRule | image';
// Stessa lista di SIMPLE_BLOCK_CONTENT sopra ma come Set di nomi, per il
// controllo runtime in BlockContentGuard sotto - derivata dalla stringa
// invece di un secondo elenco scritto a mano, cosi' le due non possono mai
// disallinearsi.
const SIMPLE_BLOCK_TYPE_NAMES = new Set(SIMPLE_BLOCK_CONTENT.split(' | '));

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
          if (isInsideRestrictedBox(state)) return false;
          return commands.insertContent({ type: this.name, content: [{ type: 'paragraph' }] });
        },
    };
  },
  // Rete di sicurezza per trascinamento/incolla di un box dentro un altro
  // (bug critico segnalato dal vivo 2026-08-20, vedi il commento completo
  // su isInsideRestrictedBox sopra: la guardia dei comandi copre solo il
  // pulsante della toolbar) - stesso identico principio gia' validato per
  // il sommario del Collapse (filterTransaction su CollapseSummary sotto):
  // drag-and-drop/incolla nativi passano da Slice.fit, che DI NORMA trova
  // gia' da solo una posizione alternativa valida, ma "non e' garantito per
  // ogni caso" (motivo originale di quel primo filterTransaction, mai
  // cambiato). Qui in piu' rispetto al sommario: due tipi di contenitore
  // (textBox E collapseBody, non solo collapseSummary), stesso controllo
  // "solo tipi ammessi da SIMPLE_BLOCK_TYPE_NAMES" per entrambi.
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('boxContentGuard'),
        filterTransaction: (tr) => {
          if (!tr.docChanged) return true;
          let valid = true;
          tr.doc.descendants((node) => {
            if (!valid) return false;
            if (node.type.name === 'textBox' || node.type.name === 'collapseBody') {
              node.forEach((child) => {
                if (!SIMPLE_BLOCK_TYPE_NAMES.has(child.type.name)) valid = false;
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
//
// onMouseDown sul wrapper (bug trovato dal vivo 2026-08-20, indagine
// approfondita nel sorgente di prosemirror-view): un plugin ProseMirror con
// handleDOMEvents.mousedown (vedi BlockClickSelect sotto, che DA SOLO basta
// per TextBox) non riceve MAI l'evento per un click sul bordo/sfondo del
// Collapse - verificato empiricamente che CustomNodeViewDesc.stopEvent
// (la classe interna che rappresenta QUALUNQUE NodeView con addNodeView,
// incluso ReactNodeViewRenderer qui sotto) ritorna true per il mousedown
// reale su questo nodo, e eventBelongsToView (dispatchEvent, stesso
// sorgente) abbandona l'INTERO evento prima ancora di provare
// handleDOMEvents di qualunque plugin - "if (node.pmViewDesc &&
// node.pmViewDesc.stopEvent(event)) return false" durante la risalita degli
// antenati dal target fino a view.dom. Un handler React attaccato QUI,
// direttamente sull'elemento della NodeView, non passa mai da quel
// controllo (e' un semplice listener nativo sull'elemento stesso, non la
// pipeline di dispatch di ProseMirror) - stessa idea del plugin, stesso
// controllo "click dentro .tiptap-collapse-content = vero testo, lascia
// stare" ma a livello di componente invece che di plugin globale.
// getPos() (fornita da ReactNodeViewRenderer, NodeViewProps) da' la
// posizione CORRENTE del nodo (mai da ricalcolare a mano - resta valida
// anche se il documento e' cambiato da quando la view e' stata creata,
// verificato nel tipo pubblico: () => number | undefined).
function CollapseBlockView({ node, updateAttributes, editor, getPos }: NodeViewProps) {
  const open = node.attrs.open !== false;
  return (
    <NodeViewWrapper
      className="tiptap-collapse"
      data-open={open}
      onMouseDown={(e) => {
        // .tiptap-collapse-toggle esclusa insieme al contentDOM: mousedown e
        // click sono due eventi SEPARATI (il primo bolla comunque fino a
        // qui, lo stopPropagation della freccina sul proprio onClick sotto
        // agisce solo sul click, non retroattivamente su questo mousedown
        // gia' passato) - senza questa esclusione, cliccare la freccina
        // selezionerebbe anche l'intero blocco invece di limitarsi ad
        // aprirlo/chiuderlo.
        if ((e.target as HTMLElement).closest('.tiptap-collapse-content, .tiptap-collapse-toggle')) return;
        const pos = getPos();
        if (typeof pos !== 'number') return;
        e.preventDefault();
        editor.view.dispatch(editor.view.state.tr.setSelection(NodeSelection.create(editor.view.state.doc, pos)).setMeta('pointer', true));
      }}
    >
      <button
        type="button"
        contentEditable={false}
        onClick={(e) => {
          // Il pulsante vive fuori dal contentDOM: senza stopPropagation, il
          // click bollerebbe fino al click-handling nativo di ProseMirror
          // per i nodi selectable, selezionando l'intero blocco OLTRE ad
          // aprirlo/chiuderlo - innocuo (il toggle funziona comunque) ma
          // visivamente confuso (l'evidenziazione da selezione lampeggia ad
          // ogni click sulla freccina). Il mousedown che precede questo
          // click e' gestito separatamente: escluso esplicitamente
          // dall'onMouseDown del wrapper sopra (.tiptap-collapse-toggle
          // nel suo closest()), che altrimenti selezionerebbe il blocco un
          // istante prima ancora che questo handler scatti.
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
          if (isInsideRestrictedBox(state)) return false;
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

// Click sul bordo/sfondo di un TextBox -> seleziona l'intero blocco (bug
// segnalato dal vivo 2026-08-20, dopo la rimozione della maniglia nella
// pulizia "editor di testo ricco semplice": senza maniglia non c'era piu'
// alcun modo per selezionare/cancellare un box con un click semplice). Non
// e' un problema di selectable:true o CSS mancanti (gia' presenti su
// entrambi i nodi/su .ProseMirror-selectednode) - e' il comportamento
// nativo di ProseMirror stesso: un click semplice seleziona automaticamente
// SOLO nodi atom (verificato nel sorgente, node_modules/prosemirror-view/
// dist/index.js, selectClickedLeaf: "node.isAtom &&
// NodeSelection.isSelectable(node)") - un'immagine funziona perche' e' un
// nodo atom (nessun contenuto editabile dentro), TextBox no (contiene
// paragrafi editabili veri), quindi un click ovunque cada al suo interno
// viene sempre risolto come "posiziona il cursore di testo piu' vicino",
// mai come selezione del nodo. Il secondo meccanismo nativo che sa
// selezionare nodi non-atom (selectClickedNode) esiste ma scatta solo con
// Ctrl+Click/Cmd+Click (selectNodeModifier) - non il click semplice
// richiesto.
//
// SOLO TextBox qui - CollapseBlock e' gestito a parte, dall'onMouseDown
// sul NodeViewWrapper in CollapseBlockView sopra (indagine dal vivo
// 2026-08-20, tre round: prima provato handleClickOn, poi handleClick,
// entrambi mai invocati per CollapseBlock - risalendo nel sorgente di
// prosemirror-view fino a CustomNodeViewDesc.stopEvent/eventBelongsToView,
// confermato empiricamente che il mousedown reale su un nodo con una
// NodeView personalizzata - ReactNodeViewRenderer qui, vedi addNodeView -
// viene marcato "stopEvent:true" e l'INTERO evento e' scartato da
// eventBelongsToView PRIMA che qualunque handleDOMEvents di plugin possa
// mai vederlo; TextBox non ha questo problema, renderHTML statico senza
// NodeView, quindi handleDOMEvents.mousedown qui sotto gli basta). Un
// singolo plugin condiviso per entrambi i tipi non sarebbe quindi mai
// stato sufficiente - lasciato qui ristretto a TextBox per onesta' verso
// cio' che DAVVERO fa, non per generalita' apparente.
//
// handleDOMEvents.mousedown (non handleClick/handleClickOn): entrambi
// innescati dalla pipeline INTERNA di ProseMirror per il click
// (handlers.mousedown -> LeftMouseDown), che comincia SEMPRE con "let pos =
// view.posAtCoords(...); if (!pos) return" - handleDOMEvents e' invece un
// listener nativo SEPARATO che dispatchEvent richiama SEMPRE per primo,
// mai soggetto a quel gate (qui non serve per il motivo di sopra, ma resta
// la scelta piu' robusta anche per TextBox).
//
// Rilevamento del box via DOM (event.target.closest), non tramite il nodo
// risolto da ProseMirror: .tiptap-textbox-content e' il solo contentDOM di
// TextBox (contentElement in parseHTML sopra) - un click che ricade DENTRO
// e' realmente sul testo (return false, comportamento nativo invariato,
// stesso identico meccanismo per cui un click nello spazio vuoto a destra
// di un paragrafo corto posiziona comunque il cursore a fine testo, mai un
// segnale affidabile da solo); un click FUORI (sul div esterno, bordo/
// padding/sfondo) non lo e' mai, qualunque testo lo circondi.
//
// view.posAtDOM(boxEl, 0) (mai posAtCoords): risolve una posizione valida a
// partire dal vero elemento DOM del box - la risalita per profondita' dopo
// trova poi l'esatto nodo textBox (mai un genitore piu' esterno per
// errore, es. un box annidato dentro un altro in un vecchio documento non
// ancora passato dalla migrazione difensiva).
const BlockClickSelect = Extension.create({
  name: 'blockClickSelect',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('blockClickSelect'),
        props: {
          handleDOMEvents: {
            mousedown(view, event) {
              const target = event.target as HTMLElement | null;
              if (!target) return false;
              if (target.closest('.tiptap-textbox-content')) return false;
              const boxEl = target.closest('.tiptap-textbox') as HTMLElement | null;
              if (!boxEl) return false;

              const domPos = view.posAtDOM(boxEl, 0);
              const $pos = view.state.doc.resolve(domPos);
              for (let depth = $pos.depth; depth >= 0; depth -= 1) {
                if ($pos.node(depth).type.name === 'textBox') {
                  const tr = view.state.tr.setSelection(NodeSelection.create(view.state.doc, $pos.before(depth)));
                  tr.setMeta('pointer', true);
                  view.dispatch(tr);
                  event.preventDefault();
                  return true;
                }
              }
              return false;
            },
          },
        },
      }),
    ];
  },
});

// Estensioni da registrare in useEditor({ extensions: [...] }) - ogni tipo di
// nodo deve comparire nell'array per entrare nello schema, inclusi i due
// figli senza comando proprio (CollapseSummary/CollapseBody).
export const TIPTAP_BLOCK_EXTENSIONS = [TextBox, CollapseSummary, CollapseBody, CollapseBlock, BlockClickSelect];
