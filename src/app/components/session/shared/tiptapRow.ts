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
import {
  TextBoxEdgeCursor,
  isFlexSiblingContainer,
  insertRowItemBesideRow,
  stripRowGrow,
  isRowItemEligible,
  combineIntoRow,
  buildRowGroup,
  splitRowAtPause,
  materializeParagraphAt,
} from './tiptapTextBoxEdgeCursor';

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

            const before = $gap.nodeBefore;
            const after = $gap.nodeAfter;
            if (!before && !after) return false;

            // Caso 1b-bis (Fase 2, piano confermato 2026-08-11,
            // coordinamento Segnalazione 2): il vicino reale del gap e'
            // ESSO STESSO una row esistente - possibile SOLO da quando
            // exitRowDocumentBoundary (tiptapTextBoxEdgeCursor.ts) pausa al
            // bordo assoluto di una row invece di materializzare subito
            // (landOrDive normale non crea mai pause adiacenti a una row,
            // per nessun altro percorso - verificato dal vivo 2026-08-11,
            // primo test dopo l'estensione: click da questa pausa produceva
            // una row DENTRO un'altra row, mai valido). Avvolgerla come nel
            // Caso 1b sotto la annidrebbe dentro se stessa; il nuovo
            // elemento va invece INSERITO come primo/ultimo figlio della
            // row esistente, mai in una row-wrapper aggiuntiva.
            // insertRowItemBesideRow (tiptapTextBoxEdgeCursor.ts, round
            // 2026-08-13 pomeriggio): stessa identica regola/posizione ora
            // riusata anche da handleTextInput/handlePaste li' (bug
            // "digitare/incollare alla pausa crea un paragrafo fratello
            // invece di affiancarsi dentro la row") - fattorizzata qui,
            // invece di duplicata, cosi' le due implementazioni non possono
            // divergere in futuro.
            if ((before && before.type === schema.nodes.row) || (after && after.type === schema.nodes.row)) {
              if (dispatch) {
                const newNode = createRowElementNode(schema, type);
                const insertAt = insertRowItemBesideRow(tr, gapPos, before, after, schema.nodes.row, newNode);
                if (insertAt != null) tr.setSelection(TextSelection.near(tr.doc.resolve(insertAt)));
              }
              return true;
            }

            // Caso 1b (Passo 3): nessuno dei due vicini e' una row - avvolge
            // i fratelli REALI del gap (nodeBefore/nodeAfter, quelli che
            // esistono davvero - landOrDive/la nuova pausa di Fase 2 creano
            // il gap sempre adiacente ad ALMENO uno dei due, mai fra il
            // nulla e il nulla) insieme al nuovo elemento in una row nuova,
            // stesso identico pattern replaceWith del Caso 2 sotto, con
            // $gap.parent gia' dato come contenitore (non serve richiamare
            // findNearestBlockContainerAncestorDepth: la pausa vive per
            // costruzione esattamente al confine di un box nel SUO
            // genitore diretto - quel genitore, per essere arrivati fino a
            // qui via exitBoxBoundary/pauseAtIsolatingBoundary, e' sempre
            // uno dei contenitori block+ della Fase A - documento, content
            // di un TextBox, body di un Collapse - mai un tipo che
            // rifiuterebbe una row, quindi nessun canReplaceWith difensivo
            // in piu' qui).
            //
            // wrapBefore/wrapAfter invece dei before/after grezzi (bug
            // segnalato 2026-08-12, "spazio vuoto dopo un secondo elemento"):
            // un vicino REALE ma di testo VUOTO (tipicamente il paragrafo
            // placeholder che l'editor ricrea sempre in coda al documento/
            // box/collapse per garantire un punto di editing dopo l'ultimo
            // blocco) non e' contenuto degno di essere trascinato dentro la
            // nuova row - avvolgerlo produce un terzo rowItem invisibile ma
            // che occupa spazio, MENTRE il meccanismo di ricreazione lo
            // rimpiazza subito fuori dalla row, lasciando un residuo intatto
            // dentro. Un vicino vuoto NON scompare dal documento - resta
            // esattamente dove stava, semplicemente escluso dal wrap
            // (wrapStart/wrapEnd sotto si fermano prima di lui).
            //
            // RISTRETTO a type===paragraph (regressione segnalata subito
            // dopo, 2026-08-12 sera): la prima versione escludeva QUALUNQUE
            // vicino vuoto, non solo il paragrafo placeholder - rompendo lo
            // scenario comune "crea un box vuoto, esci con la freccia SENZA
            // scrivere nulla, clicca di nuovo per affiancarne un secondo":
            // il box appena creato (before) e' esso stesso vuoto in quel
            // momento, quindi prima veniva escluso ALLORA CON before E
            // after entrambi esclusi, niente wrap, il pulsante ricadeva sul
            // fallback nudo (impilato invece di affiancato). Un
            // textBox/collapseBlock/table vuoto e' comunque un elemento che
            // l'utente sta costruendo intenzionalmente - va sempre
            // preservato. Solo un paragraph vuoto (il tipo specifico del
            // placeholder trailing, mai uno degli altri tre tipi che
            // createRowElementNode/RowElementType sa costruire) viene
            // escluso, stessa condizione di emptiness del Caso 2 sotto ma
            // ristretta al tipo di nodo giusto invece che a "qualunque nodo
            // vuoto".
            const isEmptyPlaceholderParagraph = (node: typeof before) =>
              !!node && node.type === schema.nodes.paragraph && node.textContent === '';
            const wrapBefore = before && !isEmptyPlaceholderParagraph(before) ? before : null;
            const wrapAfter = after && !isEmptyPlaceholderParagraph(after) ? after : null;
            if (!wrapBefore && !wrapAfter) return false;
            //
            // Ordine figli [before?, nuovo, after?]: quello che manca
            // (before o after, mai entrambi - vedi sopra) viene omesso,
            // sempre almeno 2 elementi per costruzione, coerente con
            // l'ordine di lettura sinistra-destra del documento.
            if (dispatch) {
              const newNode = createRowElementNode(schema, type);
              const children = [...(wrapBefore ? [wrapBefore] : []), newNode, ...(wrapAfter ? [wrapAfter] : [])];
              const rowNode = schema.nodes.row.create(null, children);
              const wrapStart = wrapBefore ? gapPos - wrapBefore.nodeSize : gapPos;
              const wrapEnd = wrapAfter ? gapPos + wrapAfter.nodeSize : gapPos;
              tr.replaceWith(wrapStart, wrapEnd, rowNode);
              // +1 per entrare nella row appena creata, + la dimensione di
              // "before" (0 se assente) per superarlo, +1 per entrare nel
              // nuovo nodo - stesso schema TextSelection.near del Caso 2.
              const offset = wrapStart + 1 + (wrapBefore ? wrapBefore.nodeSize : 0) + 1;
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

  // Backspace a inizio contenuto unisce il blocco corrente con quello
  // immediatamente sopra in una row - simmetrico a splitRowAtPause
  // (tiptapTextBoxEdgeCursor.ts, Invio su una pausa spacca la row in due),
  // ma per un cursore VERO (TextSelection), non per il cursore finto: un
  // cursore reale puo' essere "a inizio contenuto di un blocco" solo dentro
  // un paragrafo (TextBox/Collapse/Tabella non ospitano mai direttamente il
  // cursore al proprio livello, solo il loro paragrafo interno) - nessuna
  // ambiguita' di bias da gestire qui, a differenza di isAtBoxBoundary
  // (quello confronta contro il bordo ESTERNO di un box, che non e' un
  // textblock; qui parentOffset===0 e' gia' di per se' inequivocabile).
  //
  // Nessuna sovrapposizione con Backspace-cancella-box esistente
  // (createEdgeAwareKeyboardShortcuts, tiptapBlocks.tsx): quel comando
  // scatta SOLO quando $from e' il PRIMO paragrafo di un TextBox/Collapse a
  // offset 0 - qui la guardia "index===0 nel contenitore" sotto fa gia' da
  // sola no-op in quella stessa identica posizione (nessun blocco sopra
  // DENTRO lo stesso box), lasciando il comando esistente libero di
  // intervenire. Verificato per costruzione (i due contenitori coincidono),
  // non serve alcun ordine esplicito fra le due estensioni.
  //
  // Cursore a inizio di un item NON PRIMO di una row esistente resta fuori
  // scope, deliberatamente invariato: lo schema (content 'rowItem{2,}')
  // blocca gia' da solo quel join nativo fra due item della stessa row
  // (vedi il commento originale in cima a questo file, "backspace bloccato
  // se ridurrebbe una row a 1 solo figlio") - nessun nuovo codice necessario
  // li', il caso e' gia' un no-op sicuro.
  addKeyboardShortcuts() {
    return {
      Backspace: (): boolean => {
        const { editor } = this;
        const { state } = editor;
        const { selection, schema } = state;
        if (!selection.empty || !(selection instanceof TextSelection)) return false;

        const { $from } = selection;
        if ($from.parent.type.name !== 'paragraph' || $from.parentOffset !== 0) return false;

        // Cella di tabella esclusa, stesso identico motivo/precedente di
        // Case 2 in addElementBeside sopra (isSelectionInsideAny gia'
        // definita in questo file) - restano fuori scope anche qui scroll
        // orizzontale annidato/arrow-nav a doppio livello.
        if (isSelectionInsideAny(state, ['table'])) return false;

        const paragraphDepth = $from.depth;
        const rowDepth = findAncestorDepth($from, 'row');

        if (rowDepth !== null) {
          // Caso 3/4: il paragrafo e' il PRIMO item di una row esistente -
          // il blocco sopra (fuori dalla row, a livello del suo contenitore)
          // si unisce come nuovo primo elemento (Caso 3, se e' standalone) o
          // le due row si combinano (Caso 4, se e' anch'esso una row).
          // rowDepth===paragraphDepth-1 per costruzione (il paragrafo e'
          // sempre figlio DIRETTO della row quando findAncestorDepth lo trova
          // a questa profondita' minima) - guardia difensiva, mai dovrebbe
          // fallire, stesso principio "mai un'assunzione senza verifica" gia'
          // in uso altrove in questo file.
          if (rowDepth !== paragraphDepth - 1) return false;
          const rowNode = $from.node(rowDepth);
          if (rowNode.firstChild !== $from.node(paragraphDepth)) return false;

          const containerDepth = rowDepth - 1;
          if (containerDepth < 0) return false;
          const container = $from.node(containerDepth);
          const rowIndex = $from.index(containerDepth);
          if (rowIndex === 0) return false;
          const aboveNode = container.child(rowIndex - 1);

          if (!container.canReplaceWith(rowIndex - 1, rowIndex + 1, schema.nodes.row)) return false;

          const rangeFrom = $from.before(rowDepth) - aboveNode.nodeSize;
          const rangeTo = $from.after(rowDepth);
          const rowChildren: ProseMirrorNode[] = [];
          rowNode.forEach((child) => rowChildren.push(child));

          // REVISIONE 2026-08-17 (piano "Backspace unisce solo il primo
          // elemento della row", confermato): fino a ieri Caso 3/4
          // assorbivano nella nuova row TUTTI i figli della row sotto
          // (rowChildren intero) - B, C (tutto cio' che non e' A, il
          // paragrafo da cui e' partito il Backspace) non hanno pero' alcun
          // rapporto con "aboveNode": erano gia' un gruppo a se' PRIMA di
          // questo Backspace, unirli forzatamente cancellava quella
          // distinzione. Ora SOLO il primo figlio (A, sempre il paragrafo
          // corrente per costruzione - vedi il controllo firstChild sopra)
          // lascia la row per unirsi ad aboveNode; il resto (buildRowGroup:
          // row se ne restano >=2, standalone se ne resta 1) diventa un
          // fratello NUOVO subito dopo la row appena unita - mai un ramo a
          // parte "se resta 1 solo elemento": buildRowGroup lo gestisce gia'.
          //
          // aboveNode (Caso 3 standalone, Caso 4 row) e' INVECE invariato in
          // entrambi i casi rispetto a prima - e' il blocco che il Backspace
          // raggiunge all'INDIETRO, mai quello da cui si sta "uscendo": non
          // ha nulla da lasciarsi dietro, si comporta esattamente come Caso 2
          // (una row esistente che guadagna un solo nuovo membro in coda) -
          // stesso motivo per cui aboveChildren NON viene piu' stripped in
          // Caso 4 (rowGrow interno ancora valido, e' lo stesso gruppo di
          // prima con un membro in piu', non due gruppi che si fondono).
          const [firstOfRow, ...restOfRow] = rowChildren;
          const trailingSibling = buildRowGroup(schema, restOfRow);

          if (aboveNode.type === schema.nodes.row) {
            // Caso 4: aboveChildren assorbe per intero (rowGrow preservato,
            // vedi sopra), solo firstOfRow (stripped, lascia il gruppo
            // B/C) si unisce a lui.
            const aboveChildren: ProseMirrorNode[] = [];
            aboveNode.forEach((child) => aboveChildren.push(child));
            return editor
              .chain()
              .command(({ tr }) => {
                combineIntoRow(tr, schema, { from: rangeFrom, to: rangeTo }, aboveChildren, [stripRowGrow(firstOfRow)], trailingSibling);
                return true;
              })
              .scrollIntoView()
              .run();
          }

          // Caso 3: il blocco sopra deve essere di un tipo che una row puo'
          // davvero accettare come figlio (mai a occhi chiusi, vedi
          // isRowItemEligible sopra) - un elenco puntato o una citazione
          // adiacenti restano fuori scope, Backspace nativo invariato.
          if (!isRowItemEligible(aboveNode)) return false;
          return editor
            .chain()
            .command(({ tr }) => {
              combineIntoRow(tr, schema, { from: rangeFrom, to: rangeTo }, [stripRowGrow(aboveNode)], [stripRowGrow(firstOfRow)], trailingSibling);
              return true;
            })
            .scrollIntoView()
            .run();
        }

        // Caso 1/2: il paragrafo corrente e' standalone (non in nessuna
        // row) - il blocco sopra, a livello del suo stesso contenitore, si
        // unisce a lui in una row nuova (Caso 1, se e' anch'esso
        // standalone) oppure il paragrafo corrente si aggiunge in coda a
        // quella row (Caso 2, se il blocco sopra e' gia' una row).
        const containerDepth = paragraphDepth - 1;
        if (containerDepth < 0) return false;
        const container = $from.node(containerDepth);
        const index = $from.index(containerDepth);
        if (index === 0) return false;
        const aboveNode = container.child(index - 1);

        if (!container.canReplaceWith(index - 1, index + 1, schema.nodes.row)) return false;

        const currentParagraph = $from.node(paragraphDepth);
        const rangeFrom = $from.before(paragraphDepth) - aboveNode.nodeSize;
        const rangeTo = $from.after(paragraphDepth);

        if (aboveNode.type === schema.nodes.row) {
          // Caso 2: il paragrafo corrente si aggiunge in coda alla row
          // sopra - rowGrow dei figli GIA' nella row preservato (restano
          // proporzionalmente validi, e' lo stesso identico gruppo di
          // fratelli di prima, solo con un elemento in piu' in coda).
          const aboveChildren: ProseMirrorNode[] = [];
          aboveNode.forEach((child) => aboveChildren.push(child));
          return editor
            .chain()
            .command(({ tr }) => {
              combineIntoRow(tr, schema, { from: rangeFrom, to: rangeTo }, aboveChildren, [stripRowGrow(currentParagraph)]);
              return true;
            })
            .scrollIntoView()
            .run();
        }

        // Caso 1: due blocchi standalone si uniscono in una row nuova -
        // stessa guardia isRowItemEligible del Caso 3 sopra, stesso motivo.
        if (!isRowItemEligible(aboveNode)) return false;
        return editor
          .chain()
          .command(({ tr }) => {
            combineIntoRow(tr, schema, { from: rangeFrom, to: rangeTo }, [stripRowGrow(aboveNode)], [stripRowGrow(currentParagraph)]);
            return true;
          })
          .scrollIntoView()
          .run();
      },

      // Invio a inizio contenuto di un rowItem NON PRIMO di una row esistente
      // spacca la row in quel punto - simmetrico a Backspace sopra (che
      // unisce un rowItem PRIMO col blocco sopra), ma per l'operazione
      // "opposta": riusa splitRowAtPause (tiptapTextBoxEdgeCursor.ts),
      // scritta per l'Invio sulla pausa fantasma fra due rowItem (bug
      // segnalato dal vivo 2026-08-19: un cursore VERO a inizio testo di un
      // rowItem, es. "Carisma" in row[Forza,Box,Destrezza,Box,vuoto,Carisma,
      // Box], cadeva sullo splitBlock nativo invece che su questo shortcut -
      // withCursor in TextBoxEdgeCursorExtension scarta subito qualunque
      // selezione che non sia TextBoxEdgeCursor, quindi non intercettava mai
      // un TextSelection reale). $from.before(paragraphDepth) e' la
      // posizione ESATTAMENTE al confine fra il rowItem precedente e questo
      // paragrafo - stessa identica forma di posizione della pausa fantasma
      // che splitRowAtPause si aspetta (parent === il nodo row, parentOffset
      // === offset del confine), nessun adattamento necessario.
      //
      // Guardia tabella verificata dal vivo (non solo dedotta dal commento
      // "nessun nodo row" in tiptapTextBoxEdgeCursor.ts, che si e' rivelato
      // descrivere solo l'assenza di un percorso UI, non un vincolo di
      // schema): schema.nodes.row.create(...) dentro una tableCell supera
      // sia node.check() sia editor.commands.setContent() senza errori -
      // una row PUO' davvero annidarsi in una cella (content 'block+' della
      // cella accetta 'row' via il suo group 'block', vedi il commento
      // 2026-08-07 in cima a questo file). La cella resta comunque fuori
      // scope qui, stesso identico motivo/precedente del Backspace sopra
      // (isSelectionInsideAny gia' definita in questo file) - scroll
      // orizzontale annidato/arrow-nav a doppio livello restano fuori scope.
      //
      // Cursore a inizio del PRIMO rowItem di una row: splitRowAtPause sopra
      // rifiuta (before.length===0, "prima" sarebbe vuoto per costruzione -
      // guardia difensiva gia' esistente li', non duplicata qui) - a quel
      // punto NON si spacca la row (non avrebbe senso), si materializza un
      // paragrafo vuoto PRIMA dell'intera row, che resta intatta con tutti i
      // suoi figli. Stesso identico principio gia' in uso per l'Invio dalla
      // pausa fantasma al bordo assoluto (enterAtPause,
      // tiptapTextBoxEdgeCursor.ts) - riusa la stessa materializeParagraphAt,
      // nessuna nuova logica di inserimento duplicata qui.
      //
      // "splitRowAtPause ha rifiutato" (il suo valore di ritorno, non un
      // conteggio di figli ricalcolato qui) e' il segnale generico per
      // qualunque numero di rowItem nella row: il rowItem corrente finisce
      // SEMPRE nella meta' "dopo" per costruzione (boundaryPos e' il suo
      // stesso bordo iniziale), quindi l'unica ragione per cui prova a
      // spaccare e fallisce a questo punto e' before.length===0 - vale
      // identico che la row abbia 2 o 50 figli, nessuna soglia hardcoded.
      Enter: (): boolean => {
        const { editor } = this;
        const { state } = editor;
        const { selection } = state;
        if (!selection.empty || !(selection instanceof TextSelection)) return false;

        const { $from } = selection;
        if ($from.parent.type.name !== 'paragraph' || $from.parentOffset !== 0) return false;

        if (isSelectionInsideAny(state, ['table'])) return false;

        const paragraphDepth = $from.depth;
        const rowDepth = findAncestorDepth($from, 'row');
        if (rowDepth === null || rowDepth !== paragraphDepth - 1) return false;

        if (splitRowAtPause(editor, state.doc.resolve($from.before(paragraphDepth)))) return true;

        return materializeParagraphAt(editor, $from.before(rowDepth));
      },
    };
  },
});

// Attributo condiviso dai 4 tipi rowItem (Fase 5b "affiancamento a livello
// documento", piano confermato 2026-08-09) - fattorizzato in un solo posto
// per evitare che le 4 copie (paragraph/textBox/collapseBlock/table)
// divergano nel parsing/serializzazione nel tempo. number|null, default
// null = comportamento automatico attuale (flex:1 1 0 da theme.css, tutti
// i fratelli crescono alla pari) - un valore numerico sostituisce la
// componente flex-grow via style inline, sempre insieme a flex-basis:0
// (bug fix 2026-08-15: il paragrafo, unico rowItem con flex-basis:auto
// da CSS - regola shrink-to-fit sotto Fase 5c in theme.css - deve
// passare a flex-basis:0 non appena rowGrow e' impostato, altrimenti la
// formula lineare di computeGrowPair in tiptapRowResize.ts diverge dal
// rendering reale; per TextBox/Collapse e' un valore ridondante, quello
// che il CSS impone gia' incondizionatamente). data-row-grow come attributo
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
      if (includeStyle) rendered.style = `flex-grow: ${attributes.rowGrow}; flex-basis: 0`;
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
