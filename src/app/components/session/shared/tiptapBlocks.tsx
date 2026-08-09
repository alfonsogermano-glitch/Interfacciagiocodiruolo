import { Node, mergeAttributes, type Editor } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent, type NodeViewProps } from '@tiptap/react';
import { Selection, Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { ChevronRight } from 'lucide-react';
import {
  findBoxAncestorDepth,
  isAtBoxBoundary,
  exitBoxBoundary,
  exitFlexSiblingBoundary,
  exitCellBoundary,
  exitRowBoundary,
  exitTableBoundary,
  exitRowDocumentBoundary,
  exitTableTopEdge,
} from './tiptapTextBoxEdgeCursor';
import { createRowGrowAttribute } from './tiptapRow';

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

// Frecce/Backspace al confine di un TextBox O di un CollapseBlock - stessa
// meccanica per entrambi (generalizzata 2026-08-01, prima esisteva solo per
// TextBox): entrambi hanno isolating:true, che blocca deliberatamente Invio
// dal sollevare contenuto fuori dal nodo (vedi il commento su isolating in
// TextBox sotto), ma come effetto collaterale impedisce anche a
// frecce/Backspace di attraversarne il confine nativamente.
//
// Le frecce delegano interamente a exitBoxBoundary (tiptapTextBoxEdgeCursor.ts,
// condivisa con la prosecuzione da un cursore finto gia' attivo) invece di
// avere qui una logica propria - non piu' parametrizzata sul nome del tipo
// (typeName): findBoxAncestorDepth cerca l'antenato box PIU' VICINO fra
// ENTRAMBI i tipi in un colpo solo (bug 2026-08-02: un TextBox annidato
// dentro un CollapseBlock, o viceversa, con la ricerca ristretta a un solo
// tipo per volta poteva far trovare l'antenato sbagliato - piu' esterno di
// quello vero se il piu' interno era dell'ALTRO tipo). Registrata identica
// da entrambi i nodi (TextBox e CollapseBlock sotto): innocuo, la prima
// scorciatoia dell'uno o dell'altro che gira nel keymap la gestisce, non
// c'e' bisogno di sapere QUALE tipo specifico e' l'antenato trovato.
//
// ArrowLeft/Right provano ANCHE exitCellBoundary e poi exitRowBoundary se
// exitBoxBoundary non scatta (bug 2026-08-02, rimosso 2026-08-05 "regola
// fissa senza eccezioni", ripristinato 2026-08-05 in forma diversa su
// richiesta esplicita - vedi storia completa su exitCellBoundary in
// tiptapTextBoxEdgeCursor.ts): passando da una cella "esterna" - anche
// senza alcun box, testo normale - a una cella che INIZIA/FINISCE con un
// TextBox/Collapse, la normale navigazione fra celle di ProseMirror non
// ha nessuna cognizione dei nostri box e atterrerebbe il cursore dritto
// dentro, scavalcando sia il confine fra le due celle sia l'ingresso nel
// box. exitRowBoundary (2026-08-05, bug gemello segnalato subito dopo:
// stesso problema ma sul CAMBIO DI RIGA, dall'ultima/prima cella di una
// riga) copre lo stesso caso un livello piu' in su, quando exitCellBoundary
// non trova alcun vicino nella STESSA riga. Entrambe intervengono SOLO
// quando serve davvero (ritornano false, nessun effetto, per qualunque
// cella/riga di destinazione con contenuto normale) - il salto diretto e
// incondizionato resta il comportamento per tutto il resto, invariato.
// exitTableBoundary (2026-08-06, provata per ultima, DOPO exitRowBoundary
// e MAI dentro di lei - vedi commento completo su exitTableBoundary in
// tiptapTextBoxEdgeCursor.ts) copre il caso ancora piu' esterno: quando
// exitRowBoundary fallisce perche' non c'e' ne' una cella ne' una riga
// vicina, cioe' siamo al vero bordo ASSOLUTO della tabella (prima/ultima
// cella dell'intera tabella, non un confine interno) - il cursore esce
// dalla tabella verso il paragrafo prima/dopo, creandolo se non esiste.
// Solo Left/Right, MAI Up/Down: su/giu' vanno alla cella nella riga
// sopra/sotto nella STESSA colonna, una relazione diversa da "cella/riga
// successiva nella stessa riga/tabella" su cui queste tre si basano -
// fuori scopo qui.
//
// exitTableTopEdge (2026-08-06, SOLO ArrowUp, MAI ArrowDown per design
// esplicito) sostituisce il GapCursor nativo di ProseMirror con il nostro
// cursore finto quando siamo in riga 0 (qualunque colonna, non solo la
// prima - a differenza delle tre sopra) e sopra la tabella non c'e' nulla
// di valido: vedi il commento completo su exitTableTopEdge in
// tiptapTextBoxEdgeCursor.ts per il ragionamento (riusa GapCursor.valid
// come oracolo). ArrowDown dall'ultima riga resta interamente invariato
// (TrailingNode + comportamento nativo, mai toccato).
//
// exitFlexSiblingBoundary/exitRowDocumentBoundary (Fase 3a "navigazione fra
// fratelli di row/cella", provate DOPO exitBoxBoundary e PRIMA di
// exitCellBoundary - un livello concettuale in mezzo: bordo del box
// isolating, poi bordo del proprio item dentro row/cella, poi bordo della
// cella/riga di tabella) - vedi il commento completo su
// exitFlexSiblingBoundary in tiptapTextBoxEdgeCursor.ts. Solo Left/Right,
// stesso motivo di exitCellBoundary/exitRowBoundary/exitTableBoundary
// sotto (row e' un concetto orizzontale, flex-wrap, non verticale).
function createEdgeAwareKeyboardShortcuts(editor: Editor) {
  return {
    ArrowLeft: () =>
      exitBoxBoundary(editor, 'before') ||
      exitFlexSiblingBoundary(editor, 'before') ||
      exitCellBoundary(editor, 'before') ||
      exitRowBoundary(editor, 'before') ||
      exitTableBoundary(editor, 'before') ||
      exitRowDocumentBoundary(editor, 'before'),
    ArrowUp: () => exitBoxBoundary(editor, 'before') || exitTableTopEdge(editor),
    ArrowRight: () =>
      exitBoxBoundary(editor, 'after') ||
      exitFlexSiblingBoundary(editor, 'after') ||
      exitCellBoundary(editor, 'after') ||
      exitRowBoundary(editor, 'after') ||
      exitTableBoundary(editor, 'after') ||
      exitRowDocumentBoundary(editor, 'after'),
    ArrowDown: () => exitBoxBoundary(editor, 'after'),
    // Cancella l'intero nodo (non solo il paragrafo vuoto) quando il
    // cursore e' esattamente a inizio contenuto - equivalente esatto di
    // selezionarlo con la maniglia e premere Canc (deleteSelection su una
    // NodeSelection fa lo stesso tr.delete sul range del nodo). Un solo
    // lato (nessun equivalente "a fine contenuto"): Backspace cancella
    // all'indietro per definizione. Stesso antenato "piu' vicino fra
    // entrambi i tipi" di sopra: cancella il box PIU' INTERNO, non
    // necessariamente quello del tipo che ha registrato lo shortcut.
    Backspace: (): boolean => {
      const { selection } = editor.state;
      if (!selection.empty) return false;
      const { $from } = selection;
      const boxDepth = findBoxAncestorDepth($from);
      if (boxDepth === null) return false;
      if (!isAtBoxBoundary(editor.state.doc, $from, boxDepth, 'start')) return false;

      const from = $from.before(boxDepth);
      const to = $from.after(boxDepth);
      return editor
        .chain()
        .command(({ tr }) => {
          tr.delete(from, to);
          return true;
        })
        .scrollIntoView()
        .run();
    },
  };
}

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
// selectable+draggable: opzioni native di ProseMirror, verificate nel
// sorgente (prosemirror-view imposta da solo dom.draggable sulla node view
// di default quando non c'e' una NodeView custom, e gestisce da solo click-
// to-select/Backspace-elimina-nodo) - non serve nessun codice nostro per
// selezione/eliminazione. Il drag vero pero' richiede un elemento
// data-drag-handle dedicato (verificato in stopEvent/onDragStart di
// @tiptap/core: un trascinamento che parte da un punto qualsiasi FUORI da
// quell'elemento viene bloccato con preventDefault) - senza, il testo dentro
// il box perderebbe la normale selezione-per-trascinamento del mouse.
// isolating: true - impedisce a liftEmptyBlock (catena nativa di Invio,
// vedi @tiptap/core) di sollevare fuori dal TextBox l'unico paragrafo
// vuoto che contiene, cosa che altrimenti elimina l'intero wrapper TextBox
// (bug confermato via log 2026-08-01: Invio su paragrafo vuoto, unico figlio
// del box, dentro una cella di tabella - il box scompariva, -2 sul totale
// documento). Table e CollapseBlock hanno gia' isolating:true da tempo senza
// problemi segnalati - stesso trattamento qui. Gia' provato una volta
// insieme a un workaround CSS per il gap cursor (rimosso in 7a53367 perche'
// quel workaround specifico non funzionava per nodi non-atomici) - qui
// riproposto SOLO per il suo effetto sulla catena di Invio, non per il gap
// cursor.
export const TextBox = Node.create({
  name: 'textBox',
  // 'rowItem' in piu' rispetto al nativo 'block' (Fase 1 "affiancamento a
  // livello documento", piano confermato 2026-08-07): rende un TextBox
  // inseribile come figlio di una row (tiptapRow.ts).
  group: 'block rowItem',
  content: 'block+',
  defining: true,
  isolating: true,
  selectable: true,
  draggable: true,

  // rowGrow (Fase 5b): nessuna NodeView propria (renderHTML nativo sotto
  // gia' fa mergeAttributes su HTMLAttributes), quindi lo style prodotto
  // dall'attributo arriva gia' da solo sul div reso - a differenza di
  // CollapseBlock/TableWithHandle sotto/in tiptapTableHandle.ts, che hanno
  // una NodeView propria e devono leggere node.attrs.rowGrow a mano.
  addAttributes() {
    return {
      rowGrow: createRowGrowAttribute(),
    };
  },

  // contentElement: senza, un copia-incolla interno (che ri-analizza l'HTML
  // gia' reso) tratterebbe l'elemento maniglia come se fosse contenuto reale
  // del nodo (i figli diretti dell'elemento cercato sono, per default, cio'
  // che viene interpretato come content) - punta invece esplicitamente al
  // div che contiene davvero i blocchi (paragrafi/titoli/liste).
  parseHTML() {
    return [{ tag: 'div[data-type="text-box"]', contentElement: '.tiptap-textbox-content' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'text-box', class: 'tiptap-textbox' }),
      ['div', { 'data-drag-handle': '', contenteditable: 'false', class: 'tiptap-block-handle', 'aria-hidden': 'true' }, '⠿'],
      ['div', { class: 'tiptap-textbox-content' }, 0],
    ];
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

  // Frecce/Backspace al confine del box - vedi createEdgeAwareKeyboardShortcuts
  // sopra per il ragionamento completo (isolating:true blocca deliberatamente
  // Invio dal sollevare contenuto fuori dal box, ma come effetto collaterale
  // impedisce anche a frecce/Backspace di attraversarne il confine
  // nativamente - da qui questi shortcut).
  addKeyboardShortcuts() {
    return createEdgeAwareKeyboardShortcuts(this.editor);
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
  // draggable qui esplicito: a differenza della node view di default di
  // ProseMirror (che imposta da sola dom.draggable in base allo schema,
  // verificato nel sorgente), ReactNodeViewRenderer NON lo fa da solo -
  // l'attributo nativo va messo a mano sull'elemento radice reso da noi.
  //
  // rowGrow (Fase 5b) NON va applicato qui: NodeViewWrapper (.tiptap-collapse)
  // NON e' l'elemento che ProseMirror tratta come flex item di
  // .tiptap-row-flex - verificato dal vivo (bug preso durante il test:
  // uno style qui non aveva alcun effetto visivo). ReactNodeViewRenderer
  // avvolge SEMPRE il componente in un elemento esterno proprio
  // (.react-renderer, node_modules/@tiptap/react/dist/index.js,
  // ReactNodeView.get dom() ritorna renderer.element, MAI il DOM del
  // componente) - quello, non NodeViewWrapper, e' il vero figlio diretto
  // di .tiptap-row-flex. L'applicazione vera e' nell'opzione "attrs" di
  // ReactNodeViewRenderer sotto (addNodeView), l'unico hook ufficiale
  // della libreria per controllare attributi/style di quell'elemento
  // esterno dall'infuori del componente React.
  return (
    <NodeViewWrapper className="tiptap-collapse" data-open={open} draggable={true}>
      {/* data-drag-handle: fuori dal contentDOM come il pulsante freccina,
          stesso principio - vedi il commento su TextBox sopra per il
          meccanismo completo (verificato nel sorgente di @tiptap/core). */}
      <div data-drag-handle contentEditable={false} className="tiptap-block-handle" aria-hidden="true">
        ⠿
      </div>
      <button
        type="button"
        contentEditable={false}
        onClick={(e) => {
          // Il pulsante vive fuori dal contentDOM (come la maniglia sopra):
          // senza stopPropagation, il click bolla fino al click-handling
          // nativo di ProseMirror per i nodi selectable, selezionando
          // l'intero blocco OLTRE ad aprirlo/chiuderlo - innocuo (il toggle
          // funziona comunque) ma visivamente confuso (l'evidenziazione da
          // selezione lampeggia ad ogni click sulla freccina).
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
  // 'rowItem' in piu' rispetto al nativo 'block' (Fase 1 "affiancamento a
  // livello documento", piano confermato 2026-08-07): rende un CollapseBlock
  // inseribile come figlio di una row (tiptapRow.ts).
  group: 'block rowItem',
  content: 'collapseSummary collapseBody',
  defining: true,
  isolating: true,
  selectable: true,
  draggable: true,
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
      // rowGrow (Fase 5b): l'attr esiste comunque nello schema (roundtrip
      // JSON/serializzazione statica), anche se qui - come per "open" sopra -
      // l'applicazione VISIVA vera passa da CollapseBlockView, non da
      // questo renderHTML (mai usato per il DOM live in presenza di una
      // NodeView, vedi commento li').
      rowGrow: createRowGrowAttribute(),
    };
  },
  // contentElement: la maniglia e il pulsante freccina vivono entrambi fuori
  // dal contentDOM (sibling prima di NodeViewContent) - senza puntare
  // esplicitamente a .tiptap-collapse-content, un copia-incolla interno li
  // tratterebbe come se fossero contenuto reale del nodo.
  parseHTML() {
    return [{ tag: 'div[data-type="collapse-block"]', contentElement: '.tiptap-collapse-content' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'collapse-block' }), 0];
  },
  // attrs (Fase 5b): opzione ufficiale di ReactNodeViewRenderer per
  // applicare attributi/style all'elemento ESTERNO che la libreria crea da
  // sola (.react-renderer, il vero figlio diretto di .tiptap-row-flex -
  // vedi il commento in CollapseBlockView sopra) - richiamata sia al primo
  // render che ad ogni update() del nodo (verificato nel sorgente,
  // ReactNodeView.update -> rerenderComponent -> updateElementAttributes),
  // quindi copre anche i resize successivi (Fase 5c) e undo/redo senza
  // bisogno di altro codice qui.
  addNodeView() {
    return ReactNodeViewRenderer(CollapseBlockView, {
      // SEMPRE la chiave 'style' presente, mai {} quando rowGrow e' null:
      // ReactRenderer.updateAttributes fa setAttribute per ogni chiave
      // dell'oggetto ritornato, MAI una sostituzione completa - un {}
      // lascerebbe lo style di un rowGrow precedente bloccato per sempre
      // sull'elemento (nessuna chiave da "cancellare" nel merge).
      attrs: ({ node }) => {
        const rowGrow = node.attrs.rowGrow as number | null;
        return { style: rowGrow == null ? '' : `flex-grow: ${rowGrow}` };
      },
    });
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

  // Stesso trattamento di TextBox (generalizzato 2026-08-01, vedi
  // createEdgeAwareKeyboardShortcuts sopra) - CollapseBlock ha isolating:true
  // da prima ancora del fix su TextBox, quindi soffriva dello stesso
  // "frecce/Backspace bloccati al confine", solo mai corretto finora.
  // Nessun conflitto con l'Enter di CollapseSummary sopra (nodo diverso,
  // scatta solo quando $from.parent e' collapseSummary).
  addKeyboardShortcuts() {
    return createEdgeAwareKeyboardShortcuts(this.editor);
  },
});

// Estensioni da registrare in useEditor({ extensions: [...] }) - ogni tipo di
// nodo deve comparire nell'array per entrare nello schema, inclusi i due
// figli senza comando proprio (CollapseSummary/CollapseBody).
export const TIPTAP_BLOCK_EXTENSIONS = [TextBox, CollapseSummary, CollapseBody, CollapseBlock];
