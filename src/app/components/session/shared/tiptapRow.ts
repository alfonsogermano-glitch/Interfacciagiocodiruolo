import { Node, mergeAttributes } from '@tiptap/core';
import { Paragraph } from '@tiptap/extension-paragraph';
import { createTable } from '@tiptap/extension-table';
import { TextSelection, type EditorState } from '@tiptap/pm/state';
import type { Node as ProseMirrorNode, NodeType, ResolvedPos, Schema } from '@tiptap/pm/model';
// TextBoxEdgeCursor/isFlexSiblingContainer: nessuna dipendenza circolare -
// tiptapTextBoxEdgeCursor.ts non importa nulla da questo file (verificato,
// solo tiptapBlocks.tsx importa da entrambi). Fase A del consolidamento
// "Aggiungi elemento accanto" nei pulsanti esistenti (piano confermato
// 2026-08-11): il Caso 1 sotto restringe la sua applicabilita' a questa
// sola classe di selezione. isFlexSiblingContainer aggiunta al Passo 3
// (piano confermato 2026-08-13, Problema A+B): distingue Caso 1a/1b, vedi
// commento sul Caso 1 sotto.
import { TextBoxEdgeCursor, isFlexSiblingContainer } from './tiptapTextBoxEdgeCursor';

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

// Antenato piu' vicino il cui GENITORE accetta un nodo di tipo childType
// come figlio - a differenza di findAncestorDepth sopra e di
// findDocRowAncestorDepth/findCellAncestorDepth (tiptapTextBoxEdgeCursor.ts),
// che cercano un TIPO DI NODO SPECIFICO per nome a qualunque profondita',
// questa non cerca un nome: verifica, livello per livello risalendo da
// $pos, se il CONTENT MODEL dello schema accetterebbe davvero childType in
// quella posizione, con parent.canReplaceWith(index, index+1, childType) -
// la stessa identica verifica che tr.replaceWith farebbe comunque,
// calcolata PRIMA invece di tentare a occhi chiusi (stesso principio "mai
// un tentativo alla cieca" gia' in uso in questo file, es. lo schema stesso
// che rifiuta una row con meno di 2 figli invece di un controllo custom).
//
// Usata dal Caso 2 di addElementBeside sotto per generalizzare "quale
// blocco avvolgere" da "sempre il figlio diretto del documento" a "il piu'
// vicino contenitore block+ a qualunque profondita'" (piano confermato
// 2026-08-13, Problema A - Passo 1): TextBox e il body di un Collapse hanno
// content 'block+' come il documento (tiptapBlocks.tsx), quindi un cursore
// dentro il paragrafo interno di un TextBox esistente trova qui la
// profondita' DENTRO quel TextBox, non piu' sempre depth 1 - la row nasce
// li' dentro, non piu' sempre avvolgendo l'intero TextBox a livello
// documento.
//
// Degrada correttamente da sola quando il livello piu' interno non accetta
// blocchi (es. dentro collapseSummary, content 'inline*': canReplaceWith
// fallisce li'): il loop risale finche' non trova un contenitore valido
// (tipicamente il documento, depth 1) - STESSO risultato di oggi per quel
// caso limite (avvolge l'intero CollapseBlock), nessuna guardia dedicata
// necessaria qui a differenza di isSelectionInside(state,'collapseSummary')
// usata da setTextBox/setCollapseBlock in tiptapBlocks.tsx.
//
// Non tocca la cella di tabella (guardia isSelectionInsideAny(['table'])
// sotto la intercetta comunque PRIMA di arrivare qui, decisione presa
// 2026-08-13 - il content model di una cella e' anch'esso 'block+',
// tecnicamente accetterebbe una row, ma l'affiancamento dentro una cella
// resta rimandato, motivo gia' documentato piu' sotto).
export function findNearestBlockContainerAncestorDepth($pos: ResolvedPos, childType: NodeType): number | null {
  for (let depth = $pos.depth; depth >= 1; depth -= 1) {
    const parent = $pos.node(depth - 1);
    const index = $pos.index(depth - 1);
    if (parent.canReplaceWith(index, index + 1, childType)) return depth;
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
          const { selection } = state;
          const schema = state.schema;

          // Caso 1 (Fase A del consolidamento "Aggiungi elemento accanto"
          // nei pulsanti esistenti, piano confermato 2026-08-11): ristretto
          // alla sola TextBoxEdgeCursor (cursore finto, Fase 3a) - un
          // cursore REALE dentro un item di una row esistente non passa piu'
          // da qui (vedi guardia rowDepthFrom sotto, Caso 3). selection.head
          // e' per costruzione ESATTAMENTE il gap dove il cursore finto e'
          // fermo (TextBoxEdgeCursor.constructor fa super($pos,$pos) - vedi
          // tiptapTextBoxEdgeCursor.ts).
          //
          // Diviso in Caso 1a/1b dal Passo 3 (piano confermato 2026-08-13,
          // coordinamento Problema A+B): il Passo 2 ha esteso le pause a box
          // ISOLATI (nessuna row/cella, es. un TextBox che esce verso un
          // paragrafo normale adiacente) - un insert nudo li' (comportamento
          // di ieri, invariato) piazzerebbe il nuovo elemento come un TERZO
          // blocco impilato invece che affiancato, vanificando lo scopo
          // della pausa. $gap.parent (il contenitore in cui il gap vive,
          // risolto una sola volta qui) decide quale dei due rami si
          // applica.
          if (selection instanceof TextBoxEdgeCursor) {
            const gapPos = selection.head;
            const $gap = state.doc.resolve(gapPos);

            // Caso 1a: il gap e' GIA' dentro una row o una cella di tabella
            // (isFlexSiblingContainer, esportata da tiptapTextBoxEdgeCursor.ts
            // per questo riuso) - comportamento INVARIATO da ieri: un
            // insert nudo esattamente al gap. Non serve piu' la formula
            // itemDepth/$from.after(itemDepth) della versione precedente
            // (che la faceva coincidere con questo stesso valore SOLO
            // grazie al caso speciale di ResolvedPos.after quando
            // depth===this.depth+1) - un inserimento diretto a
            // selection.head e' equivalente ma generico: funziona identico
            // che il gap sia dentro una row o dentro una cella di tabella
            // (accanto a un box), perche' landOrDive (che crea questi
            // cursori, tiptapTextBoxEdgeCursor.ts) non si ferma MAI su un
            // gap strutturalmente invalido - ricorre apposta oltre i
            // confini di cella/riga di tabella per non atterrare mai li'.
            if (isFlexSiblingContainer($gap.parent)) {
              if (dispatch) {
                const newNode = createRowElementNode(schema, type);
                tr.insert(gapPos, newNode);
                tr.setSelection(TextSelection.near(tr.doc.resolve(gapPos + 1)));
              }
              return true;
            }

            // Caso 1b (nuovo, Passo 3): il gap NON e' ancora dentro una
            // row - avvolge i fratelli REALI del gap (nodeBefore/nodeAfter,
            // quelli che esistono davvero - landOrDive crea la pausa sempre
            // adiacente ad ALMENO uno dei due, mai fra il nulla e il nulla)
            // insieme al nuovo elemento in una row nuova, stesso identico
            // pattern replaceWith del Caso 2 sotto, con $gap.parent gia'
            // dato come contenitore (non serve richiamare
            // findNearestBlockContainerAncestorDepth: la pausa vive per
            // costruzione esattamente al confine di un box nel SUO
            // genitore diretto - quel genitore, per essere arrivati fino a
            // qui via exitBoxBoundary/pauseAtIsolatingBoundary, e' sempre
            // uno dei contenitori block+ della Fase A - documento, content
            // di un TextBox, body di un Collapse - mai un tipo che
            // rifiuterebbe una row, quindi nessun canReplaceWith difensivo
            // in piu' qui).
            //
            // Ordine figli [before?, nuovo, after?]: quello che manca
            // (before o after, mai entrambi - vedi sopra) viene omesso,
            // sempre almeno 2 elementi per costruzione, coerente con
            // l'ordine di lettura sinistra-destra del documento.
            const before = $gap.nodeBefore;
            const after = $gap.nodeAfter;
            if (!before && !after) return false;

            if (dispatch) {
              const newNode = createRowElementNode(schema, type);
              const children = [...(before ? [before] : []), newNode, ...(after ? [after] : [])];
              const rowNode = schema.nodes.row.create(null, children);
              const wrapStart = before ? gapPos - before.nodeSize : gapPos;
              const wrapEnd = after ? gapPos + after.nodeSize : gapPos;
              tr.replaceWith(wrapStart, wrapEnd, rowNode);
              // +1 per entrare nella row appena creata, + la dimensione di
              // "before" (0 se assente) per superarlo, +1 per entrare nel
              // nuovo nodo - stesso schema TextSelection.near del Caso 2.
              const offset = wrapStart + 1 + (before ? before.nodeSize : 0) + 1;
              tr.setSelection(TextSelection.near(tr.doc.resolve(offset)));
            }
            return true;
          }

          const { $from, $to } = selection;

          // Caso 3: cursore normale (non TextBoxEdgeCursor) ma GIA' dentro
          // un item di una row esistente, a qualunque profondita' - no-op
          // deliberato: il chiamante (i 3 pulsanti Blocchi, Fase B) ricade
          // sul proprio comando di sempre, ignaro del contesto row. Solo
          // $from (non piu' anche $to/rowDepthTo come nella versione
          // precedente, che serviva a delimitare il vecchio inserimento "in
          // coda"): qui basta sapere se il PUNTO DI PARTENZA della
          // selezione e' gia' dentro una row per rifiutare, a prescindere
          // da dove finisca $to - una selezione che comincia fuori da ogni
          // row ($from) ma finisce dentro una ($to) e' comunque gestita in
          // sicurezza dalla guardia $from.node(1)!==$to.node(1) del Caso 2
          // sotto (i due nodi di primo livello differiscono per
          // costruzione in quel caso, quindi resta un no-op anche li').
          if (findAncestorDepth($from, 'row') !== null) return false;

          // Caso 2: avvolge il blocco corrente + il nuovo elemento in una
          // row nuova, al contenitore block+ piu' vicino a $from (Passo 1,
          // piano confermato 2026-08-13 - vedi findNearestBlockContainerAncestorDepth
          // sopra per la logica completa): non piu' sempre il documento,
          // ora anche dentro un TextBox/Collapse gia' esistente, se e'
          // quello il contenitore piu' vicino. La cella di tabella resta
          // ESPLICITAMENTE esclusa (decisione 2026-08-13, non riaperta da
          // questo passo): se il cursore e' annidato dentro una cella,
          // questa guardia intercetta PRIMA che findNearestBlockContainerAncestorDepth
          // venga anche solo chiamata - creare intenzionalmente una row
          // dentro una cella e' rimandato a quando avremo piu' chiarezza su
          // scroll orizzontale annidato/arrow-nav a doppio livello (stesso
          // motivo gia' valido quando la guardia copriva anche TextBox/
          // Collapse, ristretta al solo 'table' il 2026-08-10 per un bug
          // diverso - vedi storia commit).
          if (isSelectionInsideAny(state, ['table'])) return false;

          const wrapDepth = findNearestBlockContainerAncestorDepth($from, schema.nodes.row);
          if (wrapDepth === null) return false;

          // Selezione che attraversa due blocchi diversi ALLA STESSA
          // profondita' di wrap (es. da meta' di un paragrafo a meta' del
          // successivo, nello stesso contenitore) - "il blocco corrente"
          // diventerebbe ambiguo, no-op deliberato invece di avvolgere solo
          // il primo e perdere silenziosamente il resto della selezione.
          // $to.depth < wrapDepth PRIMA del confronto per nodo (non solo
          // $from.node(wrapDepth)!==$to.node(wrapDepth) da sola): $to.node(d)
          // lancia un errore se d supera $to.depth, possibile quando $to e'
          // annidato meno di $from (selezione che finisce in un contenitore
          // piu' esterno di quello trovato per $from).
          if ($to.depth < wrapDepth || $from.node(wrapDepth) !== $to.node(wrapDepth)) return false;

          const blockStart = $from.before(wrapDepth);
          const blockEnd = $from.after(wrapDepth);
          const existingNode = $from.node(wrapDepth);

          // Caso 2 non scatta se il blocco esistente e' VUOTO (nessun
          // contenuto testuale, bug segnalato 2026-08-12): avvolgere un
          // blocco vuoto produrrebbe una row con un elemento inutile/
          // invisibile accanto al nuovo. No-op deliberato: il chiamante (i
          // 3 pulsanti Blocchi, withRowAwareInsert in RichTextEditor.tsx)
          // ricade sul proprio comando di default, che gia' gestisce
          // correttamente la conversione di un blocco vuoto isolato senza
          // lasciare alcun residuo - setTextBox/setCollapseBlock passano da
          // insertContentAt (@tiptap/core), il cui unico ramo speciale
          // espande il range quando il parent e' un textblock VUOTO (vedi
          // il commento su TextBoxEdgeCursor in tiptapTextBoxEdgeCursor.ts,
          // stesso meccanismo gia' verificato li' per un motivo diverso):
          // SOSTITUISCE l'intero blocco vuoto invece di dividerlo.
          // insertTable (RichTextEditor.tsx) ha gia' un proprio step di
          // pulizia dedicato per lo stesso identico caso (paragrafo vuoto
          // lasciato da tr.replaceSelectionWith). existingNode.textContent
          // (non content.size, che per un rowItem con figli annidati come
          // textBox/collapseBlock non sarebbe mai 0 anche se vuoto di
          // testo): scende ricorsivamente in qualunque profondita' di
          // figli, generico per tutti e 3 i tipi che possono arrivare qui.
          if (existingNode.textContent === '') return false;

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
      /** Aggiunge un elemento (paragrafo/TextBox/Collapse/tabella) come fratello: al cursore
       *  finto (TextBoxEdgeCursor) se attivo - insert nudo se il gap e' gia' dentro una row/cella,
       *  altrimenti avvolge i fratelli reali del gap in una row nuova; avvolgendo il contenitore
       *  block+ piu' vicino (documento, TextBox, body di un Collapse - MAI una cella) + nuovo se il
       *  cursore normale non e' in nessuna row; no-op (false) se il cursore normale e' gia' dentro
       *  una row esistente - il chiamante ricade sul proprio comando di default in quel caso. */
      addElementBeside: (type: RowElementType) => ReturnType;
    };
  }
}
