import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, NodeSelection, type Transaction, type EditorState } from '@tiptap/pm/state';
import type { Node as ProseMirrorNode, ResolvedPos } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';
import { findAncestorDepth } from './tiptapRow';
import { isEmptyParagraph } from './tiptapDropCleanup';

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

// Sorgenti accettate - 'table' incluso da Fase 4c (ha gia' la propria
// maniglia con data-drag-handle e draggable:true a livello di schema,
// tiptapTableHandle.ts - lo stesso identico meccanismo generico di
// dragstart/handleDrop qui sotto la gestisce senza rami dedicati, l'unica
// differenza reale era questa lista). Paragraph incluso a livello di
// type-check (nessun motivo strutturale per escluderlo) ma non ha oggi una
// maniglia dedicata in UI (nessun data-drag-handle nel suo renderHTML) - un
// trascinamento di un paragrafo intero passerebbe comunque da qui se mai
// avviato (es. via drag di una selezione di testo), ma resta un percorso
// non esercitato dalla UI attuale.
const DRAGGABLE_SOURCE_TYPES = ['paragraph', 'textBox', 'collapseBlock', 'table'];

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
// NESSUNA guardia tabella/cella (rimossa in Fase 4c, verificato dal vivo che
// serviva a poco/niente e bloccava il caso voluto): 'table' e' un rowItem
// valido (ROW_ITEM_TYPE_NAMES sopra), quindi e' SEMPRE l'antenato rowItem
// piu' esterno di qualunque posizione al suo interno (tableRow/tableCell/
// tableHeader non sono mai piu' in alto di 'table' nella catena - non
// possono esistere senza di lei) - il walk sotto, fermandosi al PRIMO match
// dall'esterno, arriva quindi SEMPRE a 'table' prima di poter mai
// raggiungere contenuto annidato in una cella (paragrafo/textBox/
// collapseBlock), rendendo una guardia esplicita ridondante per quel caso.
// Una guardia su 'tableCell'/'tableHeader' (provato dal vivo, poi tolto)
// sembrava innocua per lo stesso motivo ma NON lo e': posAtCoords per un
// punto ovunque sopra il rettangolo di una tabella (incluso il click sulla
// sua maniglia, che occupa visivamente l'angolo della prima cella) risolve
// quasi sempre DENTRO una cella - una guardia che rifiuta quella posizione
// rifiuta quindi anche la tabella stessa come sorgente/target, l'esatto
// comportamento che questa sotto-fase deve invece abilitare.
// Esportata (Fase 5c, tiptapRowResize.ts): stessa identica risoluzione
// "posizione nel documento -> item rowItem piu' esterno" serve anche li'
// per mappare gli elementi DOM ai due lati di un confine da ridimensionare -
// un solo posto dove tenerla coerente invece di duplicarla.
export function resolveRowDropItem(doc: ProseMirrorNode, pos: number): { itemPos: number; rowDepth: number | null } | null {
  if (pos < 0 || pos > doc.content.size) return null;
  const $pos: ResolvedPos = doc.resolve(pos);

  for (let depth = 1; depth <= $pos.depth; depth += 1) {
    if (ROW_ITEM_TYPE_NAMES.includes($pos.node(depth).type.name)) {
      const parent = $pos.node(depth - 1);
      const rowDepth = parent.type.name === 'row' ? depth - 1 : null;
      return { itemPos: $pos.before(depth), rowDepth };
    }
  }
  return null;
}

// Nucleo condiviso Fase 4b: data la posizione X del mouse e una posizione
// nel documento (gia' risolta da chi chiama - i tre punti di chiamata sotto
// la ottengono in modi diversi: handleDrop da posAtCoords sull'evento drop,
// disableDropCursor dal parametro pos gia' fornito da prosemirror-dropcursor
// stesso, il nuovo handler dragover da posAtCoords sull'evento dragover),
// decide se siamo in zona-soglia valida e per cosa - stesso identico
// calcolo per tutti e tre, ESTRATTO qui invece di lasciarlo duplicato tre
// volte (handleDrop lo faceva gia' inline in Fase 4a, qui riscritto per
// riuso). null se non c'e' una sorgente valida, il target non e' un
// rowItem idoneo, o il punto e' in zona centrale (nativo, non affianca).
function computeSideDrop(
  view: EditorView,
  sourcePos: number | null,
  clientX: number,
  docPos: number
): { target: { itemPos: number; rowDepth: number | null }; side: 'before' | 'after'; rect: DOMRect } | null {
  if (sourcePos === null) return null;

  const target = resolveRowDropItem(view.state.doc, docPos);
  if (!target || target.itemPos === sourcePos) return null;

  const targetDom = view.nodeDOM(target.itemPos);
  if (!(targetDom instanceof HTMLElement)) return null;
  const rect = targetDom.getBoundingClientRect();
  const side = resolveSideZone(clientX, rect);
  if (!side) return null;

  return { target, side, rect };
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

  // Riordino DENTRO la stessa row (bug segnalato dal vivo 2026-08-20:
  // trascinare la TextBox sul lato sinistro/destro del SUO STESSO fratello
  // di riga "non faceva nulla" - in realta' produceva un terzo figlio
  // fantasma). Rilevato qui, PRIMA di qualunque step sulla transazione,
  // risolvendo sia sorgente che target contro state.doc originale (mai
  // tr.doc post-delete, il problema stesso nasce da li'): il ramo sotto
  // (target.rowDepth !== null) faceva sempre tr.delete(sourcePos,...) PRIMA
  // di calcolare mappedTargetPos/insertAt - quando sorgente e target sono
  // fratelli della STESSA row a esattamente 2 figli, quel delete lascia
  // temporaneamente la row con 1 solo figlio, sotto il minimo
  // content:'rowItem{2,}' - ProseMirror stesso (dentro Transform.replace,
  // chiamato da tr.delete) soddisfa lo schema inserendo un paragrafo vuoto
  // di riempimento PRIMA che il successivo tr.insert() rimetta dentro la
  // sorgente, lasciando alla fine 3 figli (2 reali + 1 filler) invece di 2.
  // RowCollapseCleanup non lo ripulisce: la sua logica gestisce solo "0 o 1
  // figli reali rimasti accanto a un filler fresco" - con 2+ figli reali
  // superstiti lascia esplicitamente la row invariata (vedi il commento
  // sul quel ramo, tiptapRowCollapseCleanup.ts - un caso previsto come
  // teoricamente possibile ma "mai verificato dal vivo", verificatosi ora).
  //
  // Fix: MAI passare per lo stato intermedio sotto il minimo - una sola
  // tr.replaceWith sull'intero nodo row, con l'ordine dei figli gia'
  // corretto, stesso conteggio di figli di prima (si toglie la sorgente e
  // la si reinserisce nello stesso passo, mai in due step separati).
  if (target.rowDepth !== null) {
    const $target0 = state.doc.resolve(target.itemPos);
    const rowPos = $target0.before(target.rowDepth);
    const $source0 = state.doc.resolve(sourcePos);
    const sourceRowPos =
      $source0.depth > 0 && $source0.parent.type.name === 'row' ? $source0.before($source0.depth) : null;

    if (sourceRowPos === rowPos) {
      const rowNode = $target0.parent;
      const children: ProseMirrorNode[] = [];
      rowNode.forEach((child, offset) => {
        const childPos = rowPos + 1 + offset;
        if (childPos === sourcePos) return; // la sorgente si reinserisce sotto, mai due volte
        if (childPos === target.itemPos) {
          if (side === 'before') children.push(sourceNode, child);
          else children.push(child, sourceNode);
        } else {
          children.push(child);
        }
      });

      const newRowNode = rowNode.type.create(rowNode.attrs, children, rowNode.marks);
      const tr = state.tr;
      tr.replaceWith(rowPos, rowPos + rowNode.nodeSize, newRowNode);

      let selectPos = rowPos + 1;
      for (const child of children) {
        if (child === sourceNode) break;
        selectPos += child.nodeSize;
      }
      tr.setSelection(NodeSelection.create(tr.doc, selectPos));
      tr.scrollIntoView();
      return tr;
    }
  }

  const tr = state.tr;
  tr.delete(sourcePos, sourcePos + sourceNode.nodeSize);

  const mappedTargetPos = tr.mapping.map(target.itemPos);
  const $target = tr.doc.resolve(mappedTargetPos);
  const targetNode = $target.nodeAfter;
  if (!targetNode) return null;

  if (target.rowDepth !== null) {
    // Gia' dentro una row esistente MA DIVERSA da quella della sorgente (il
    // caso "stessa row" e' gia' stato intercettato ed e' tornato sopra) - il
    // nodo trascinato si inserisce come nuovo fratello, PRIMA o DOPO l'item
    // specifico sotto il mouse (non sempre in coda alla row, a differenza
    // del Caso 1 di addElementBeside - qui la posizione la decide la zona
    // rilevata, non il cursore).
    const insertAt = side === 'before' ? mappedTargetPos : mappedTargetPos + targetNode.nodeSize;
    tr.insert(insertAt, sourceNode);
    tr.setSelection(NodeSelection.create(tr.doc, insertAt));
  } else if (isEmptyParagraph(targetNode)) {
    // Target non ancora in una row E vuoto (bug segnalato dal vivo
    // 2026-08-20, riaperto dopo il primo "comportamento corretto": drop di
    // una TextBox su un paragrafo vuoto preesistente - es. la riga bianca
    // che il documento tiene sempre in coda - produceva row[sourceNode,
    // targetNode] col paragrafo vuoto avvolto PERMANENTEMENTE come
    // fratello reale, mai un placeholder "fresco" agli occhi di
    // RowCollapseCleanup (quel controllo guarda SOLO se il nodo e' stato
    // inserito dalla transazione corrente - vedi isFreshEmpty li',
    // tiptapRowCollapseCleanup.ts - un nodo gia' presente in oldState non
    // viene mai toccato, per lo stesso motivo per cui un paragrafo svuotato
    // a mano dall'utente non collassa mai la sua row). Il bordo tratteggiato
    // sempre visibile dei paragrafi vuoti in una row (5db41f1) rendeva
    // percio' quel fratello vuoto un "quadrato fantasma" permanente.
    // Sostituire il target invece di avvolgerlo e' il comportamento atteso
    // per un drop su una riga vuota (rimpiazza, non affianca un fantasma) -
    // NESSUNA row viene creata in questo caso, sourceNode prende
    // esattamente il posto che aveva targetNode.
    tr.replaceWith(mappedTargetPos, mappedTargetPos + targetNode.nodeSize, sourceNode);
    tr.setSelection(NodeSelection.create(tr.doc, mappedTargetPos));
  } else {
    // Non ancora in una row (e non vuoto): avvolge target + sorgente in una
    // row nuova, stesso schema del Caso 2 di addElementBeside (tiptapRow.ts) -
    // side decide l'ordine dei due figli.
    //
    // selectPos DEVE tenere conto della profondita' in piu' introdotta dalla
    // row appena creata (bug trovato dal vivo in Fase 4c, mai esercitato
    // prima perche' 4a/4b non avevano ancora un test live per side:'after':
    // +1 per "entrare" nella row (mappedTargetPos punta PRIMA del nodo row,
    // non del suo primo figlio), poi la nodeSize del figlio che PRECEDE
    // quello da selezionare per saltarlo - mai sourceNode.nodeSize come
    // offset assoluto da mappedTargetPos, che ignora sia il +1 sia il fatto
    // che per side:'after' il nodo da saltare e' targetNode (il primo
    // figlio), non sourceNode stesso. Senza questa correzione,
    // NodeSelection.create riceveva una posizione a meta' del nodo
    // (o oltre la fine della row) e falliva con "Cannot read properties of
    // null (reading 'nodeSize')" - verificato dal vivo trascinando un
    // TextBox sul lato destro (side:'after') di una tabella.
    const schema = state.schema;
    const children = side === 'before' ? [sourceNode, targetNode] : [targetNode, sourceNode];
    const rowNode = schema.nodes.row.create(null, children);
    tr.replaceWith(mappedTargetPos, mappedTargetPos + targetNode.nodeSize, rowNode);
    const selectPos = side === 'before' ? mappedTargetPos + 1 : mappedTargetPos + 1 + targetNode.nodeSize;
    tr.setSelection(NodeSelection.create(tr.doc, selectPos));
  }

  tr.scrollIntoView();
  return tr;
}

interface RowDropStorage {
  // Posizione (nel doc al momento del dragstart) del nodo in trascinamento -
  // in this.storage (non una chiusura come in Fase 4a) perche' Fase 4b
  // deve leggerla anche da extendNodeSchema sotto, un metodo DIVERSO da
  // addProseMirrorPlugins - this.storage e' lo stesso oggetto condiviso fra
  // tutti i metodi della stessa istanza di estensione (meccanismo Tiptap
  // dedicato, addStorage), una chiusura locale a un solo metodo non
  // basterebbe piu'.
  sourcePos: number | null;
  indicatorEl: HTMLElement | null;
}

// Crea (al bisogno) e posiziona la barra sul bordo del blocco target -
// stesso principio di misura-rect-reale di positionEdgeCursor
// (tiptapTextBoxEdgeCursor.ts), ma un elemento DOM gestito a mano, MAI una
// Decoration: dragover e' un evento DOM puro, senza transazione associata -
// pilotare una Decoration richiederebbe dispacciarne una ad ogni movimento
// del mouse durante il drag (decine al secondo), inutilmente pesante.
// Stesso identico problema gia' risolto da prosemirror-dropcursor stesso
// (letto nel sorgente, node_modules/prosemirror-dropcursor/dist/index.js,
// DropCursorView): crea/posiziona un <div> a mano dentro i propri handler
// dragover/dragleave/dragend/drop, mai una Decoration - stesso schema qui.
//
// position:fixed (non absolute + offsetParent come fa dropcursor): le
// coordinate che abbiamo sono gia' getBoundingClientRect (viewport-
// relative) e l'indicatore viene ricalcolato da zero ad ogni dragover -
// fixed evita di replicare la matematica di scroll/offsetParent di
// dropcursor, che A LUI serve solo perche' il suo elemento deve
// sopravvivere a uno scroll fra un dragover e l'altro senza essere
// riposizionato - requisito che non abbiamo (si ricalcola comunque sempre).
//
// affiancaRowEsistente (bug/richiesta UX 2026-08-20 - chiarita dal vivo:
// "vertical = finisci affiancato in QUALUNQUE row gia' esistente, sia la
// STESSA sia un'ALTRA; horizontal = solo quando nasce una row NUOVA"): il
// chiamante (dragover sotto) passa semplicemente target.rowDepth !== null,
// esattamente la stessa condizione gia' usata da buildRowDropTransaction
// per scegliere il ramo "inserisci come fratello" invece di "avvolgi in
// una row nuova" - nessuna nuova logica di rilevamento, solo la stessa
// informazione gia' disponibile in computeSideDrop, letta un momento prima.
// classList.toggle (non className riassegnato) mantiene la classe base
// .tiptap-row-drop-indicator sempre presente. TUTTE E QUATTRO le proprieta'
// geometriche (left/top/width/height) sono scritte ad ogni chiamata, mai
// solo quelle rilevanti per l'orientamento corrente: l'elemento e' RIUSATO
// fra un dragover e l'altro (mai ricreato), quindi un cambio di
// orientamento a meta' drag lascerebbe altrimenti un valore residuo di
// quello precedente (es. una width vecchia su un indicatore appena tornato
// verticale, dove width e' normalmente lasciata al CSS).
function showIndicator(storage: RowDropStorage, side: 'before' | 'after', rect: DOMRect, affiancaRowEsistente: boolean) {
  if (!storage.indicatorEl) {
    const el = document.createElement('div');
    el.className = 'tiptap-row-drop-indicator';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    storage.indicatorEl = el;
  }
  const el = storage.indicatorEl;
  el.classList.toggle('tiptap-row-drop-indicator--vertical', affiancaRowEsistente);
  el.classList.toggle('tiptap-row-drop-indicator--horizontal', !affiancaRowEsistente);
  if (affiancaRowEsistente) {
    el.style.left = `${side === 'before' ? rect.left : rect.right}px`;
    el.style.top = `${rect.top}px`;
    el.style.width = '';
    el.style.height = `${rect.height}px`;
  } else {
    el.style.top = `${side === 'before' ? rect.top : rect.bottom}px`;
    el.style.left = `${rect.left}px`;
    el.style.height = '';
    el.style.width = `${rect.width}px`;
  }
}

function hideIndicator(storage: RowDropStorage) {
  if (storage.indicatorEl) {
    storage.indicatorEl.remove();
    storage.indicatorEl = null;
  }
}

const rowDropPluginKey = new PluginKey('rowDrop');

export const RowDropExtension = Extension.create({
  name: 'rowDrop',
  addStorage(): RowDropStorage {
    return { sourcePos: null, indicatorEl: null };
  },

  // Fase 4b - sopprime il dropcursor NATIVO (prosemirror-dropcursor, incluso
  // di default da StarterKit) solo quando siamo effettivamente in zona-
  // soglia per un drag che il nostro meccanismo gestira' - non sempre:
  // fuori zona-soglia (o senza una sorgente valida) il dropcursor nativo
  // deve restare visibile come oggi, invariato. disableDropCursor puo'
  // essere una funzione (view, pos, event) => boolean, richiamata da
  // prosemirror-dropcursor ad OGNI dragover (verificato nel sorgente,
  // DropCursorView.computeTarget) - non serve altro meccanismo, e' gia'
  // dinamica per costruzione. Applicata solo ai tipi rowItem (stesso
  // elenco di ROW_ITEM_TYPE_NAMES): sono gli unici nodi il cui
  // node.type.spec.disableDropCursor viene mai controllato per una
  // posizione che ci interessa (dropcursor lo legge da doc.nodeAt(pos.
  // inside), non da un tipo arbitrario).
  extendNodeSchema(extension) {
    if (!ROW_ITEM_TYPE_NAMES.includes(extension.name)) return {};
    return {
      disableDropCursor: (view: EditorView, pos: { pos: number; inside: number }, event: Event) => {
        if (!(event instanceof DragEvent)) return false;
        return computeSideDrop(view, this.storage.sourcePos, event.clientX, pos.pos) !== null;
      },
    };
  },

  addProseMirrorPlugins() {
    const storage = this.storage as RowDropStorage;

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
              storage.sourcePos = null;
              if (!(event instanceof DragEvent)) return false;
              const coords = { left: event.clientX, top: event.clientY };
              const startPos = view.posAtCoords(coords);
              if (!startPos) return false;
              const target = resolveRowDropItem(view.state.doc, startPos.pos);
              if (!target) return false;
              const node = view.state.doc.nodeAt(target.itemPos);
              if (node && DRAGGABLE_SOURCE_TYPES.includes(node.type.name) && node.type.spec.draggable) {
                storage.sourcePos = target.itemPos;
              }
              return false;
            },
            // Fase 4b - calcola la zona ad ogni movimento e mostra/nasconde
            // la barra di conseguenza. Nessun debounce: showIndicator/
            // hideIndicator creano/rimuovono l'elemento SOLO quando la sua
            // presenza cambia (if (!storage.indicatorEl)), le chiamate
            // ripetute con la stessa presenza si limitano a riposizionarlo
            // (poche scritture di stile, economiche) - stesso principio
            // "nessun lavoro extra se lo stato non cambia" gia' validato in
            // TextBoxEdgeCursorExtension (dedup per chiave in view().
            // update()), qui la "chiave" e' semplicemente presente/assente
            // dell'elemento invece di una stringa esplicita.
            dragover(view, event) {
              if (!(event instanceof DragEvent)) return false;
              const dropPos = view.posAtCoords({ left: event.clientX, top: event.clientY });
              const result = dropPos ? computeSideDrop(view, storage.sourcePos, event.clientX, dropPos.pos) : null;
              if (result) {
                showIndicator(storage, result.side, result.rect, result.target.rowDepth !== null);
              } else {
                hideIndicator(storage);
              }
              return false;
            },
            // Nasconde la barra SOLO quando il drag lascia davvero l'intero
            // editor, non ad ogni passaggio fra due elementi figli interni
            // (dragleave nativo si scatena anche li', per via del
            // bubbling/re-enter fra elementi DOM annidati) - stessa identica
            // guardia gia' usata da prosemirror-dropcursor stesso per lo
            // stesso motivo (dragleave, DropCursorView sopra).
            dragleave(view, event) {
              if (!(event instanceof DragEvent)) return false;
              const related = event.relatedTarget;
              if (!(related instanceof Node) || !view.dom.contains(related)) {
                hideIndicator(storage);
              }
              return false;
            },
            dragend() {
              storage.sourcePos = null;
              hideIndicator(storage);
              return false;
            },
          },
          handleDrop(view, event, slice, moved) {
            // Il drop e' concluso in ogni caso (gestito da noi o lasciato al
            // nativo) - la barra non deve mai sopravvivere oltre il rilascio.
            hideIndicator(storage);

            if (!moved || storage.sourcePos === null) return false;
            if (!(event instanceof DragEvent)) return false;

            const isSingleNodeSlice = slice.openStart === 0 && slice.openEnd === 0 && slice.content.childCount === 1;
            const draggedType = isSingleNodeSlice ? slice.content.firstChild?.type.name : null;
            if (!draggedType || !DRAGGABLE_SOURCE_TYPES.includes(draggedType)) return false;

            const dropPos = view.posAtCoords({ left: event.clientX, top: event.clientY });
            if (!dropPos) return false;

            const result = computeSideDrop(view, storage.sourcePos, event.clientX, dropPos.pos);
            if (!result) return false;

            const tr = buildRowDropTransaction(view.state, storage.sourcePos, result.target, result.side);
            if (!tr) return false;

            view.dispatch(tr);
            return true;
          },
        },
      }),
    ];
  },
});
