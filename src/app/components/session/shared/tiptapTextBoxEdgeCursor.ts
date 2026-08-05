import { Extension, type Editor } from '@tiptap/core';
import { Selection, Plugin, PluginKey } from '@tiptap/pm/state';
import { Slice } from '@tiptap/pm/model';
import type { Node as ProseMirrorNode, ResolvedPos } from '@tiptap/pm/model';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import type { Mapping } from '@tiptap/pm/transform';

// Selezione custom per il cursore "finto" al confine di un TextBox/Collapse
// - stesso schema di GapCursor (prosemirror-gapcursor, letto dal sorgente
// durante l'indagine 2026-08-01): $anchor===$head, content() vuoto,
// visible=false (nasconde il caret nativo, il segno visivo e' solo la
// decorazione piu' sotto). NON riusa GapCursor stesso: la SUA ricerca
// (closedBefore/closedAfter) vede attraverso un contenitore con contenuto
// reale come TextBox/Collapse e non si ferma mai al suo confine esterno
// (verificato dal vivo il 2026-07-31, commit 7a53367) - la validita' qui e'
// invece decisa a monte da createEdgeAwareKeyboardShortcuts
// (isAtBoxBoundary, tiptapBlocks.tsx), non da questa classe.
//
// Il vantaggio di essere una VERA Selection (non solo stato di plugin) e'
// che digitare mentre e' attiva materializza da solo un paragrafo col testo
// digitato: Selection.replace() (metodo di base, non sovrascritto qui)
// chiama tr.replaceRange(pos, pos, content), che avvolge automaticamente il
// testo in un paragrafo quando la posizione e' tra due blocchi fratelli
// invece che dentro un textblock - stessa ragione per cui digitare con un
// gap cursor nativo prima/dopo un'immagine crea gia' un paragrafo da solo,
// senza codice dedicato. Validato con uno spike dal vivo il 2026-08-01
// prima di procedere con la rifinitura completa. Per lo stesso motivo,
// inserire un TextBox/Collapse dalla toolbar mentre questo cursore e'
// attivo funziona gia' correttamente senza alcuna modifica a
// setTextBox/setCollapseBlock: insertContentAt (@tiptap/core) usa
// genericamente tr.selection.from/.to per il punto d'inserimento
// (verificato nel sorgente, node_modules/@tiptap/core/dist/index.js) - il
// suo unico ramo speciale espande il range solo se il parent della
// posizione e' un textblock VUOTO, mai il caso qui (il parent e' sempre la
// cella, un contenitore di blocchi).
export class TextBoxEdgeCursor extends Selection {
  constructor($pos: ResolvedPos) {
    super($pos, $pos);
  }

  map(doc: ProseMirrorNode, mapping: Mapping): Selection {
    const $pos = doc.resolve(mapping.map(this.head));
    return Selection.near($pos);
  }

  content() {
    return Slice.empty;
  }

  eq(other: Selection): boolean {
    return other instanceof TextBoxEdgeCursor && other.head === this.head;
  }

  toJSON() {
    return { type: 'textBoxEdgeCursor', pos: this.head };
  }

  static fromJSON(doc: ProseMirrorNode, json: { pos: number }): TextBoxEdgeCursor {
    if (typeof json.pos !== 'number') throw new RangeError('Invalid input for TextBoxEdgeCursor.fromJSON');
    return new TextBoxEdgeCursor(doc.resolve(json.pos));
  }
}
(TextBoxEdgeCursor.prototype as unknown as { visible: boolean }).visible = false;
Selection.jsonID('textBoxEdgeCursor', TextBoxEdgeCursor);

// Tipi di nodo che partecipano al cursore finto - generalizzato 2026-08-01
// da solo 'textBox' anche a 'collapseBlock' (stessa meccanica per
// entrambi, nessuna duplicazione: vedi exitBoxBoundary sotto, usata da
// entrambi i nodi in tiptapBlocks.tsx senza parametrizzare sul proprio
// nome - un TextBox annidato dentro un CollapseBlock, o viceversa, deve
// contare comunque come "box" per l'altro).
const SIDE_BY_SIDE_BLOCK_TYPES = ['textBox', 'collapseBlock'];

function isSideBySideBox(node: ProseMirrorNode): boolean {
  return SIDE_BY_SIDE_BLOCK_TYPES.includes(node.type.name);
}

// Nomi di nodo di una cella di tabella (TableCellWithFlexWrapper/
// TableHeaderWithFlexWrapper, tiptapTableCellWrapper.ts, estendono
// semplicemente TableCell/TableHeader di @tiptap/extension-table senza
// cambiarne il nome) - usati per riconoscere una TRANSIZIONE fra celle
// diverse, distinta dall'affiancamento/annidamento DENTRO la stessa cella
// gestito da isSideBySideBox sopra.
const TABLE_CELL_TYPES = ['tableCell', 'tableHeader'];

function isTableCell(node: ProseMirrorNode): boolean {
  return TABLE_CELL_TYPES.includes(node.type.name);
}

// Come findBoxAncestorDepth (sotto), ma per la cella di tabella piu'
// vicina - usata SOLO da exitCellBoundary per decidere la transizione fra
// celle diverse, MAI da Backspace (a differenza di findBoxAncestorDepth):
// un antenato "cella" trovato al posto di un antenato "box" cancellerebbe
// l'intera cella invece di un box al suo interno se riusata li' - le due
// ricerche restano deliberatamente separate.
function findCellAncestorDepth($pos: ResolvedPos): number | null {
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    if (isTableCell($pos.node(depth))) return depth;
  }
  return null;
}

// Elemento adiacente alla posizione del cursore finto (nodo DOPO se e' un
// cursore "before", nodo PRIMA se e' un cursore "after") - nessuno stato
// separato "quale elemento, quale lato" da tracciare altrove: la posizione
// stessa lo dice gia', via nodeBefore/nodeAfter. Usato sia dal rendering
// sotto sia da Invio/frecce/Escape in tiptapBlocks.tsx.
// Il confine FRA DUE CELLE diverse (exitCellBoundary sotto) non passa da
// qui: quel cursore nasce sempre GIA' dentro la cella di destinazione,
// adiacente al suo box di bordo (vedi landOrDive) - agli occhi di questa
// funzione e' quindi indistinguibile da un confine box/box dentro la
// stessa cella, nessun ramo dedicato necessario.
export function adjacentBox($pos: ResolvedPos): { node: ProseMirrorNode; side: 'before' | 'after' } | null {
  if ($pos.nodeAfter && isSideBySideBox($pos.nodeAfter)) return { node: $pos.nodeAfter, side: 'after' };
  if ($pos.nodeBefore && isSideBySideBox($pos.nodeBefore)) return { node: $pos.nodeBefore, side: 'before' };
  return null;
}

// Profondita' dell'antenato PIU' INTERNO che sia un TextBox o un
// CollapseBlock, a QUALUNQUE profondita' - a differenza di una ricerca per
// un solo tipo alla volta (bug 2026-08-02: con un TextBox annidato dentro
// un altro, o dentro un CollapseBlock, cercare solo 'textBox' o solo
// 'collapseBlock' poteva trovare un antenato piu' esterno di quello vero,
// se il piu' interno era dell'ALTRO tipo), questa considera entrambi i
// tipi in un colpo solo: il primo (piu' profondo) che matcha vince,
// a prescindere da quale dei due sia.
export function findBoxAncestorDepth($pos: ResolvedPos): number | null {
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    if (isSideBySideBox($pos.node(depth))) return depth;
  }
  return null;
}

// $pos.start(depth)/.end(depth) danno il confine del NODO a quella
// profondita' (subito prima/dopo il suo primo/ultimo figlio diretto), non
// la posizione cursore raggiungibile dentro quel figlio - un box con un
// paragrafo come primo figlio ha sempre pos===start(depth)+1 quando il
// cursore e' davvero a inizio contenuto, MAI pos===start(depth) (bug
// confermato via log 2026-08-01: pos=99, start=98, scarto costante di 1,
// mai zero). Selection.near trova da sola la posizione cursore valida piu'
// vicina al confine grezzo del nodo: se coincide esattamente con $pos, il
// cursore era gia' li'.
//
// Controllo diretto $pos.pos===rawBoundary PRIMA di Selection.near (bug
// 2026-08-02): quando $pos e' gia' un cursore finto attivo che riprova a
// uscire di un altro livello (exitBoxBoundary chiamata in prosecuzione da
// TextBoxEdgeCursorExtension), $pos NON e' una posizione di testo reale ma
// GIA' un gap fra blocchi - esattamente il confine grezzo, per
// costruzione. Selection.near su un gap del genere non lo restituisce
// invariato: cerca la prima posizione DENTRO un vero textblock, che puo'
// essere altrove nel documento (in un'altra cella, se questo box e' l'
// ultimo blocco della sua riga) - facendo fallire il confronto e quindi
// l'intera exitBoxBoundary, con conseguente fallback al salto cieco
// (proprio il bug: da un box annidato, la freccia scavalcava il livello
// esterno e atterrava nella cella successiva). Il confronto diretto
// intercetta questo caso PRIMA che Selection.near se ne allontani; per una
// posizione di testo reale rawBoundary e $pos.pos non coincidono mai (vedi
// sopra), quindi il comportamento per il primo ingresso resta invariato.
export function isAtBoxBoundary(doc: ProseMirrorNode, $pos: ResolvedPos, boxDepth: number, side: 'start' | 'end'): boolean {
  const rawBoundary = side === 'start' ? $pos.start(boxDepth) : $pos.end(boxDepth);
  if ($pos.pos === rawBoundary) return true;
  const bias = side === 'start' ? 1 : -1;
  const nearest = Selection.near(doc.resolve(rawBoundary), bias);
  return nearest.from === $pos.pos && nearest.to === $pos.pos;
}

// Decide cosa fare arrivati ESATTAMENTE alla posizione `pos` muovendosi in
// direzione `dir`: fermarsi con un nuovo cursore finto proprio li', oppure
// proseguire fino alla prima posizione di testo reale (Selection.near).
// Condivisa da exitBoxBoundary (uscita da un box) ed exitArrow sotto
// (rientro in un box dopo una pausa) - la stessa identica decisione
// serve in entrambe le direzioni di attraversamento di un confine, non
// solo in uscita: un box il cui primo figlio e' un ALTRO box annidato
// deve fermarsi anche RIENTRANDOCI, non solo uscendone (stessa filosofia
// "un livello alla volta" gia' applicata all'uscita).
//
// isTableCell(neighbor): `pos` e' il confine FRA DUE CELLE diverse (usata
// da exitCellBoundary sotto, chiamata li' con la posizione a livello di
// RIGA - fra i due nodi cella fratelli, mai da exitBoxBoundary: il
// confine di un box e' sempre un livello piu' dentro, fra i FIGLI di una
// cella, dove un fratello non e' mai di tipo cella). Un "tuffo" diretto
// dentro sarebbe il salto incondizionato di default (comportamento
// nativo di prosemirror-tables) - qui invece si RIPROVA la stessa identica
// decisione un livello piu' dentro, verso il primo/ultimo figlio della
// cella di destinazione: se e' a sua volta un box, il cursore finto nasce
// li' (dentro la cella di destinazione, adiacente al box - MAI al confine
// grezzo fra le due celle, che non e' un contenitore DOM valido per il
// widget), altrimenti si procede fino al primo testo reale esattamente
// come nel caso comune.
function landOrDive(doc: ProseMirrorNode, pos: number, dir: 'before' | 'after'): Selection {
  const $pos = doc.resolve(pos);
  const neighbor = dir === 'after' ? $pos.nodeAfter : $pos.nodeBefore;
  if (!neighbor) return new TextBoxEdgeCursor($pos);
  if (isSideBySideBox(neighbor)) return new TextBoxEdgeCursor($pos);
  if (isTableCell(neighbor)) return landOrDive(doc, dir === 'after' ? pos + 1 : pos - 1, dir);
  return Selection.near($pos, dir === 'after' ? 1 : -1);
}

// Esce di UN SOLO livello di annidamento nella direzione data, a partire
// dalla selezione corrente (funziona sia da una posizione di testo reale
// dentro un box, sia da un cursore finto gia' attivo - Selection espone
// $from/$to genericamente per ogni sottoclasse, non solo TextSelection) -
// condivisa fra createEdgeAwareKeyboardShortcuts (primo ingresso in questo
// stato, da testo reale, tiptapBlocks.tsx) e la prosecuzione da un cursore
// finto gia' attivo sotto (TextBoxEdgeCursorExtension.exitArrow).
//
// Bug 2026-08-02 che questa condivisione risolve: prima, la prosecuzione
// (da un cursore finto gia' attivo) usava una singola Selection.near che
// cerca la prima posizione cursore valida IN QUALUNQUE DIREZIONE,
// attraversando in un colpo solo TUTTI i confini annidati incontrati -
// da dentro un TextBox annidato in un altro, la freccia destra scavalcava
// sia il box esterno sia un eventuale fratello affiancato al livello
// esterno, atterrando dritta nella cella di tabella successiva. Chiamando
// invece QUESTA funzione ad ogni pressione (sia dal primo ingresso sia
// dalla prosecuzione), ogni freccia esce di un livello alla volta: se il
// fratello al livello corrente e' un altro box affiancabile (o non esiste
// alcun fratello), si ferma con un nuovo cursore finto proprio li'; solo
// se il fratello e' un blocco normale (o non c'e' piu' nessun antenato
// box) procede oltre.
export function exitBoxBoundary(editor: Editor, dir: 'before' | 'after'): boolean {
  const { selection, doc } = editor.state;
  if (!selection.empty) return false;
  const $from = selection.$from;
  const boxDepth = findBoxAncestorDepth($from);
  if (boxDepth === null) return false;
  if (!isAtBoxBoundary(doc, $from, boxDepth, dir === 'before' ? 'start' : 'end')) return false;

  const boundaryPos = dir === 'before' ? $from.before(boxDepth) : $from.after(boxDepth);

  // Rilevamento anticipato di un a-capo di riga flex (bug 2026-08-04/05,
  // "il fix corregge troppo, e solo in una direzione": una singola
  // freccia scavalcava fine-riga-1/inizio-riga-2 saltando una fermata,
  // sia uscendo da box1 verso destra sia da box2 verso sinistra) -
  // misurato QUI, PRIMA della transazione sotto, sui due box reali ancora
  // affiancati nel DOM (nessun widget di mezzo finche' la transazione non
  // parte): box1/box2 sono fratelli diretti a questa posizione condivisa
  // (fine di uno === inizio dell'altro, un solo intero) a PRESCINDERE da
  // quale dei due si sta lasciando, quindi la stessa misura (via
  // nodeDOM/previousElementSibling) vale identica per entrambe le
  // direzioni - nessuna asimmetria qui, solo la FASE iniziale sotto
  // (ROW_PAUSE_DIR_META) distingue le due direzioni.
  let rowWrapped = false;
  const afterDom = editor.view.nodeDOM(boundaryPos) as HTMLElement | null;
  const beforeDom = afterDom?.previousElementSibling as HTMLElement | null;
  if (afterDom && beforeDom) {
    rowWrapped = Math.abs(afterDom.getBoundingClientRect().top - beforeDom.getBoundingClientRect().top) > 1;
  }

  return editor
    .chain()
    .command(({ tr }) => {
      tr.setSelection(landOrDive(tr.doc, boundaryPos, dir));
      tr.setMeta(ROW_PAUSE_WRAPPED_META, rowWrapped);
      tr.setMeta(ROW_PAUSE_DIR_META, dir);
      return true;
    })
    .scrollIntoView()
    .run();
}

// Transizione fra DUE CELLE DIVERSE (stessa riga di tabella) - a differenza
// di exitBoxBoundary sopra (che parte da un antenato box, quindi non
// scatta affatto se il cursore e' su testo normale senza alcun
// TextBox/Collapse intorno), qui l'antenato cercato e' la cella stessa:
// serve a intercettare ANCHE il caso "sono su testo normale in una cella,
// la cella ACCANTO comincia/finisce con un box" - senza questo controllo
// muoversi fra celle e' sempre il salto diretto e incondizionato nativo di
// prosemirror-tables (comportamento voluto per il caso comune, vedi
// tiptapBlocks.tsx), che non ha nessuna cognizione dei nostri box e
// atterrerebbe il cursore dritto dentro il primo box della cella di
// destinazione.
//
// Decisione presa PRIMA di costruire la transazione (chiamando landOrDive
// sul `doc` corrente, non ancora modificato) invece di controllare dentro
// il chain: interviene SOLO se il lato d'ingresso della cella vicina
// produce davvero un cursore finto (landOrDive restituisce una
// TextBoxEdgeCursor) - se la cella vicina inizia/finisce con contenuto
// normale, ritorna false e lascia il comportamento nativo invariato,
// nessuna pausa in piu' per il caso comune.
//
// Chiamata solo da ArrowLeft/ArrowRight (mai Up/Down, tiptapBlocks.tsx):
// su/giu' passano alla cella nella riga sopra/sotto nella STESSA colonna,
// una relazione strutturale diversa da "prima/dopo nella stessa riga" su
// cui questa funzione si basa - fuori scopo qui.
export function exitCellBoundary(editor: Editor, dir: 'before' | 'after'): boolean {
  const { selection, doc } = editor.state;
  if (!selection.empty) return false;
  const $from = selection.$from;
  const cellDepth = findCellAncestorDepth($from);
  if (cellDepth === null) return false;
  if (!isAtBoxBoundary(doc, $from, cellDepth, dir === 'before' ? 'start' : 'end')) return false;

  const boundaryPos = dir === 'before' ? $from.before(cellDepth) : $from.after(cellDepth);
  if (!(landOrDive(doc, boundaryPos, dir) instanceof TextBoxEdgeCursor)) return false;

  return editor
    .chain()
    .command(({ tr }) => {
      tr.setSelection(landOrDive(tr.doc, boundaryPos, dir));
      return true;
    })
    .scrollIntoView()
    .run();
}

// Nome di classe di un TextBox/Collapse RESO (non il nome di nodo dello
// schema, isSideBySideBox sopra lavora su ProseMirrorNode - qui serve il
// suo equivalente DOM, per riconoscere i veri VICINI del widget nel
// markup effettivo).
function isBoxElement(el: Element | null): el is HTMLElement {
  return !!el && (el.classList.contains('tiptap-textbox') || el.classList.contains('tiptap-collapse'));
}

// Calcolo UNICO della posizione del cursore finto (bug 2026-08-05,
// riscrittura completa: sostituisce sia le regole CSS per-caso
// (:first-child/:last-child/centrale in theme.css) sia la correzione JS
// di eccezione per l'a-capo che c'era prima - un solo meccanismo, sempre
// attivo, per ogni contesto geometrico (primo/ultimo/in mezzo/annidato/
// a-capo), invece di doverli tenere manualmente coerenti fra loro (causa
// diretta degli ultimi 5 round di fix, ognuno dei quali ne rompeva un
// altro - es. l'approssimazione "-4px" della vecchia correzione a-capo
// non e' mai stata aggiornata quando gli estremi sono passati a "flush",
// restando silenziosamente incoerente).
//
// widget.previousElementSibling/nextElementSibling danno gia' i VERI
// vicini nel DOM (il widget e' comunque inserito nel flusso alla
// posizione giusta dalla decorazione, solo il suo RENDERING e'
// position:absolute) - nessun bisogno di risalire al modello/nodeDOM: la
// stessa identica funzione, senza rami dedicati, gestisce:
// - un solo vicino reale (estremi, o box affiancato a un blocco normale
//   che occupa l'intera riga): flush contro di lui, 0px (bug 2026-08-04/
//   05, "qualunque gap inventato verso l'unico vicino e' spazio
//   indesiderato" - verificato dal vivo) sul lato del vicino - SALVO il
//   caso sotto quando il contenitore e' una cella di tabella.
// - due vicini reali sulla STESSA riga visiva (caso centrale): centrato
//   fra i due bordi (bug 2026-08-02), calcolato come midpoint reale
//   invece che da --tiptap-box-gap - resta corretto anche se il gap CSS
//   cambia.
// - due vicini reali su righe DIVERSE (a-capo, bug 2026-08-02): stesso
//   trattamento "un solo vicino" sopra, scegliendo quale dei due tramite
//   preferSide (riflette la fase natural/corrected della pausa a due
//   fermate - vedi Plugin.state sotto, logica di navigazione invariata).
//
// Caso "un solo vicino" DENTRO UNA CELLA (bug 2026-08-05, transizione fra
// due celle diverse - exitCellBoundary sopra): il "flush 0px" verificato
// dal vivo per gli estremi si applicava a un container flex SENZA
// padding proprio (.tiptap-textbox-content/.tiptap-collapse-body: il
// padding e' sul bordo/sfondo del box stesso, il cursore finto vive
// dentro un contenitore neutro) - li' il bordo del contenitore NON e' un
// confine visibile, quindi 0px e' gia' "nessun respiro inventato". Una
// cella di tabella e' diversa: .tiptap-td-flex (il contenitore reale del
// widget qui, tiptapTableCellWrapper.ts) e' anch'esso senza padding
// proprio, ma il vero bordo/padding VISIBILE (0.375rem/0.5rem, theme.css)
// sta sul <td>/<th> che lo contiene - un vicino solo con "flush 0px"
// azzererebbe silenziosamente quel padding reale, incollando il cursore
// al box e lasciando TUTTO il respiro visibile sul lato opposto (verso
// il bordo vero della cella), invece di dividerlo come farebbe un caret
// nativo fra due caratteri. cell.getBoundingClientRect() da' il vero
// bordo (border-box, box-sizing:border-box su td/th sopra) - il
// riferimento "esterno" usato per il midpoint e' quindi la cella quando
// c'e', il contenitore stesso altrimenti (comportamento flush invariato
// per i casi non-tabella, tuttora corretto li').
function positionEdgeCursor(widget: HTMLElement, preferSide: 'before' | 'after') {
  const container = widget.parentElement;
  if (!container) return;

  const prevEl = widget.previousElementSibling;
  const nextEl = widget.nextElementSibling;
  const boxBefore = isBoxElement(prevEl) ? prevEl : null;
  const boxAfter = isBoxElement(nextEl) ? nextEl : null;
  if (!boxBefore && !boxAfter) return; // difensivo: per costruzione ce n'e' sempre almeno uno

  const containerRect = container.getBoundingClientRect();
  const beforeRect = boxBefore?.getBoundingClientRect() ?? null;
  const afterRect = boxAfter?.getBoundingClientRect() ?? null;

  const sameRow = !!beforeRect && !!afterRect && Math.abs(beforeRect.top - afterRect.top) <= 1;

  let top: number;
  let left: number;
  if (sameRow) {
    top = beforeRect!.top - containerRect.top;
    left = (beforeRect!.right + afterRect!.left) / 2 - containerRect.left;
  } else {
    // Un solo vicino disponibile (estremi/a-capo): preferSide sceglie fra
    // i due quando ENTRAMBI esistono ma su righe diverse; altrimenti
    // vince comunque l'unico che c'e' davvero (preferSide ignorato).
    const useAfter = !!afterRect && (preferSide === 'after' || !beforeRect);
    const rect = useAfter ? afterRect! : beforeRect!;
    top = rect.top - containerRect.top;

    const cell = container.classList.contains('tiptap-td-flex') ? container.parentElement : null;
    if (cell) {
      const cellRect = cell.getBoundingClientRect();
      const outerEdge = useAfter ? cellRect.left : cellRect.right;
      const innerEdge = useAfter ? rect.left : rect.right;
      left = (outerEdge + innerEdge) / 2 - containerRect.left;
    } else {
      left = (useAfter ? rect.left : rect.right) - containerRect.left;
    }
  }

  widget.style.position = 'absolute';
  widget.style.top = `${top}px`;
  widget.style.left = `${left}px`;
}

// Meta di transazione per la "pausa di riga": ROW_PAUSE_WRAPPED_META e'
// impostata da exitBoxBoundary quando crea un cursore finto (in ENTRAMBE
// le direzioni, bug 2026-08-05 - vedi storia sotto) e ha misurato in
// anticipo (PRIMA della transazione, sui due box reali ancora affiancati
// nel DOM, nessun widget di mezzo) che i due box sono gia' su righe
// visive diverse (flex-wrap). ROW_PAUSE_DIR_META porta la direzione di
// uscita che ha creato il cursore ('before'/'after') - serve perche' le
// due direzioni hanno una fase INIZIALE opposta (vedi Plugin.state
// sotto): uscendo verso destra il primo arrivo mostra la riga corrente
// senza correggerla (il box successivo e' gia' a capo, non ancora
// "seguito"); uscendo verso sinistra il primo arrivo mostra invece SUBITO
// la riga del box da cui si e' appena usciti (nessuna sorpresa, e'
// esattamente dove ci si aspetta di essere), ed e' la riga PRECEDENTE
// (quella verso cui si sta continuando a muoversi) a restare "in attesa"
// finche' non viene confermata. Se WRAPPED e' assente/false, il cursore
// appena creato non passa mai per uno stato "in attesa": comportamento
// identico a prima di questo fix per OGNI caso che non sia un vero
// a-capo (nessuna fermata in piu' introdotta per il caso comune "due box
// sulla stessa riga", in nessuna delle due direzioni).
// ROW_PAUSE_ADVANCE_META e' impostata da exitArrow quando l'utente preme
// di nuovo la STESSA freccia che ha creato il cursore, mentre e' ancora
// "in attesa" - conferma la pausa (nessun cambio di selezione), cosi' il
// prossimo update() del plugin applica/rimuove la correzione di riga a
// seconda della direzione (vedi Plugin.state) - una fermata separata,
// distinta da quella della creazione.
const ROW_PAUSE_WRAPPED_META = 'textBoxEdgeCursorRowWrapped';
const ROW_PAUSE_DIR_META = 'textBoxEdgeCursorRowDir';
const ROW_PAUSE_ADVANCE_META = 'textBoxEdgeCursorRowAdvance';

// `confirmed` invece di due valori 'natural'/'corrected' fissi (versione
// precedente, bug 2026-08-05 "funziona solo in avanti"): quale RESA
// visiva (riga corrente vs. riga del box adiacente) corrisponde a
// "confermato" dipende dalla direzione (vedi commento sopra) - la
// derivazione e' in view() sotto, non qui: questo stato traccia solo il
// FATTO "l'utente ha gia' premuto una seconda volta", non il suo
// significato visivo.
type EdgeCursorRowPauseState = { pos: number; dir: 'before' | 'after'; wrapped: boolean; confirmed: boolean } | null;

// PluginKey tipizzata (non anonima come le altre in questo file): serve a
// leggere lo stato da fuori il plugin stesso, dentro exitArrow
// (addKeyboardShortcuts sotto), per decidere se questa pressione deve
// solo confermare la pausa o puo' gia' procedere (rientro nel box o
// prosecuzione oltre).
const textBoxEdgeCursorPluginKey = new PluginKey<EdgeCursorRowPauseState>('textBoxEdgeCursor');

export const TextBoxEdgeCursorExtension = Extension.create({
  name: 'textBoxEdgeCursor',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: textBoxEdgeCursorPluginKey,
        // Traccia posizione+direzione+conferma del cursore finto corrente
        // (bug 2026-08-04, poi esteso 2026-08-05 a entrambe le direzioni,
        // "la doppia fermata funziona solo andando in avanti" - prima
        // versione trattava solo dir 'after'): uscendo da un box che e'
        // l'ultimo/primo della sua riga visiva verso un fratello gia' a
        // capo, servono DUE fermate separate PRIMA di rientrare nel box -
        // `confirmed` diventa true alla seconda pressione della stessa
        // freccia (nessun cambio di selezione, solo la meta), la terza
        // pressione rientra davvero. Per qualunque cursore che NON e' un
        // vero a-capo (compreso il caso comune due-box-stessa-riga)
        // `wrapped` resta false: nessuna fermata in piu' rispetto a prima
        // di questo fix, in nessuna delle due direzioni.
        state: {
          init: (): EdgeCursorRowPauseState => null,
          apply(tr, value): EdgeCursorRowPauseState {
            const sel = tr.selection;
            if (!(sel instanceof TextBoxEdgeCursor)) return null;
            if (value && value.pos === sel.head) {
              return tr.getMeta(ROW_PAUSE_ADVANCE_META) ? { ...value, confirmed: true } : value;
            }
            const dir = (tr.getMeta(ROW_PAUSE_DIR_META) as 'before' | 'after' | undefined) ?? 'after';
            const wrapped = tr.getMeta(ROW_PAUSE_WRAPPED_META) === true;
            return { pos: sel.head, dir, wrapped, confirmed: false };
          },
        },
        props: {
          // Il widget nasce qui senza alcuna posizione (position:absolute
          // e' impostato in CSS, ma top/left no) - view() sotto la calcola
          // SEMPRE dal vivo (positionEdgeCursor), subito dopo il mount,
          // nella stessa fase di update sincrona con questa decorazione
          // (nessun frame intermedio visibile).
          decorations(state) {
            const { selection } = state;
            if (!(selection instanceof TextBoxEdgeCursor)) return null;
            return DecorationSet.create(state.doc, [
              Decoration.widget(
                selection.head,
                () => {
                  const dom = document.createElement('span');
                  dom.className = 'tiptap-textbox-edge-cursor';
                  dom.setAttribute('aria-hidden', 'true');
                  return dom;
                },
                { key: 'textBoxEdgeCursor' }
              ),
            ]);
          },
        },
        // Rimisura/corregge SOLO quando il cursore finto compare o cambia
        // posizione (bug da evitare: rimisurare a ogni update, incluso
        // ogni battitura altrove nel documento, e' costoso e inutile la
        // stragrande maggioranza delle volte) - lastKey (chiusura di
        // questa singola istanza di plugin, sopravvive fra un update e
        // l'altro) e' la posizione del cursore finto corrente, o null se
        // non attivo; invariata rispetto all'ultima chiamata => nessun
        // nuovo getBoundingClientRect. Il ridimensionamento della finestra
        // mentre il cursore e' fermo in pausa non viene ricontrollato
        // (nessuna transazione ProseMirror lo farebbe scattare) - lasciato
        // com'e', caso limite entro un limite gia' accettato per lo stesso
        // motivo.
        view() {
          // Chiave composta pos+conferma (non solo pos, bug 2026-08-04): la
          // transazione di "avanzamento" (ROW_PAUSE_ADVANCE_META) cambia
          // SOLO `confirmed`, mai la posizione - un dedup per sola
          // posizione la vedrebbe identica alla precedente e salterebbe
          // l'update, lasciando la correzione di riga non applicata
          // nonostante l'utente abbia gia' premuto la freccia una seconda
          // volta.
          let lastKey: string | null = null;
          return {
            update(view: EditorView) {
              const pauseState = textBoxEdgeCursorPluginKey.getState(view.state);
              const key = pauseState ? `${pauseState.pos}:${pauseState.confirmed}` : null;
              if (key === lastKey) return;
              lastKey = key;
              if (!pauseState) return;
              const widget = view.dom.querySelector<HTMLElement>('.tiptap-textbox-edge-cursor');
              if (!widget) return;

              // preferSide riflette la fase natural/corrected della pausa
              // a-capo (bug 2026-08-05, vedi ROW_PAUSE_DIR_META sopra per
              // il ragionamento completo su perche' le due direzioni
              // preferiscono lati opposti prima/dopo la conferma) -
              // ininfluente quando i due vicini sono sulla stessa riga o
              // ce n'e' uno solo (positionEdgeCursor lo ignora in quei
              // casi). Se non c'e' affatto un a-capo in corso (!wrapped),
              // il valore e' comunque irrilevante per lo stesso motivo.
              const preferSide: 'before' | 'after' =
                pauseState.dir === 'after'
                  ? pauseState.confirmed
                    ? 'after'
                    : 'before'
                  : pauseState.confirmed
                    ? 'before'
                    : 'after';
              positionEdgeCursor(widget, preferSide);
            },
          };
        },
      }),
    ];
  },

  // Invio/frecce/Escape mentre il cursore finto e' attivo - il chain nativo
  // di Invio (newlineInCode->...->splitBlock) e i comandi di base per le
  // frecce si aspettano un $cursor di TextSelection, che questa selezione
  // non ha (extends Selection, non TextSelection): senza questi shortcut
  // nessuno dei due farebbe nulla. Tutti con guardia in testa: se la
  // selezione non e' il nostro cursore finto, si lascia il comportamento
  // nativo invariato (altrove nell'editor, zero interferenza).
  addKeyboardShortcuts() {
    const { editor } = this;

    const withCursor = (fn: (selection: TextBoxEdgeCursor) => boolean) => (): boolean => {
      const { selection } = editor.state;
      if (!(selection instanceof TextBoxEdgeCursor)) return false;
      return fn(selection);
    };

    // Rientra nel box da cui il cursore finto e' uscito (Escape, o freccia
    // in direzione opposta a quella di uscita) - landOrDive dal lato
    // giusto invece di una Selection.near diretta (bug 2026-08-02): un box
    // il cui primo figlio e' un ALTRO box annidato si ferma anche
    // rientrandoci, non solo uscendone, stessa pausa "un livello alla
    // volta" gia' applicata in uscita.
    const reenterBox = (selection: TextBoxEdgeCursor, box: { side: 'before' | 'after' }) =>
      editor
        .chain()
        .command(({ tr }) => {
          const pos = selection.head;
          const dir: 'before' | 'after' = box.side === 'after' ? 'after' : 'before';
          const innerPos = box.side === 'after' ? pos + 1 : pos - 1;
          tr.setSelection(landOrDive(tr.doc, innerPos, dir));
          return true;
        })
        .scrollIntoView()
        .run();

    const exitArrow = (dir: 'before' | 'after') =>
      withCursor((selection) => {
        const { doc } = editor.state;
        const $pos = doc.resolve(selection.head);
        const box = adjacentBox($pos);
        if (!box) return false;

        // Fermata di riga ancora da confermare (bug 2026-08-04, esteso
        // 2026-08-05 a entrambe le direzioni - vedi ROW_PAUSE_DIR_META
        // sopra): controllato PRIMA di decidere quale ramo seguire sotto
        // (rientro nel box o prosecuzione oltre), non dentro il ramo
        // "rientra" soltanto - `adjacentBox` restituisce SEMPRE
        // side:'after' quando il vicino successivo e' un box (controlla
        // nodeAfter prima di nodeBefore), quindi al confine fra due box
        // fratelli `dir === box.side` e' vero SOLO per dir 'after': la
        // direzione 'before' passerebbe sempre dal ramo "prosegue oltre"
        // sotto, mai da questo controllo, se restasse annidato li' dentro
        // (bug appena descritto: la conferma non scattava mai andando
        // all'indietro). Confermare qui, a monte, si limita ad
        // avanzare `confirmed` (nessun cambio di selezione/posizione)
        // cosi' il prossimo update() del plugin applica/toglie la
        // correzione di riga - una TERZA pressione della stessa freccia
        // trovera' `confirmed` gia' true e proseguira' con il
        // comportamento normale sotto (rientro o prosecuzione).
        const pauseState = textBoxEdgeCursorPluginKey.getState(editor.state);
        if (pauseState && pauseState.pos === selection.head && pauseState.dir === dir && pauseState.wrapped && !pauseState.confirmed) {
          return editor
            .chain()
            .command(({ tr }) => {
              tr.setMeta(ROW_PAUSE_ADVANCE_META, true);
              return true;
            })
            .run();
        }

        // box.side e' l'OPPOSTO della direzione di uscita originale (il box
        // "after" e' il risultato di un'uscita 'before', e viceversa - vedi
        // adjacentBox sopra): premere la freccia che punta VERSO il lato del
        // box (dir === box.side) rientra nel box; l'altra direzione
        // prosegue oltre.
        if (dir === box.side) return reenterBox(selection, box);

        // Direzione opposta al lato del box: prosegue oltre. Riprova PRIMA
        // exitBoxBoundary sulla posizione attuale: se questo cursore finto
        // e' ANCH'ESSO al confine di un antenato piu' esterno (annidamento)
        // o ha un altro box fratello allo stesso livello (affiancamento),
        // si ferma di nuovo li' un livello alla volta invece di scavalcarlo
        // (bug 2026-08-02, vedi commento su exitBoxBoundary in
        // tiptapTextBoxEdgeCursor.ts). Solo se non c'e' PIU' nessun
        // antenato box a questa posizione (siamo davvero usciti da tutto)
        // si ricade sulla Selection.near generica: cerca la prima posizione
        // cursore valida in quella direzione attraversando QUALUNQUE
        // confine, incluso isolating (tableCell) - non e' un'operazione di
        // join/lift, solo ricerca di una posizione gia' esistente nel
        // documento, e isolating vincola solo le trasformazioni
        // strutturali, non la ricerca di selezione (verificato nel sorgente
        // di prosemirror-state: TextSelection.findFrom non consulta mai
        // NodeType.spec.isolating).
        if (exitBoxBoundary(editor, dir)) return true;

        return editor
          .chain()
          .command(({ tr }) => {
            tr.setSelection(Selection.near(tr.doc.resolve(selection.head), dir === 'before' ? -1 : 1));
            return true;
          })
          .scrollIntoView()
          .run();
      });

    return {
      Enter: withCursor((selection) => {
        return editor
          .chain()
          .command(({ tr }) => {
            const pos = selection.head;
            tr.insert(pos, editor.schema.nodes.paragraph.create());
            tr.setSelection(Selection.near(tr.doc.resolve(pos + 1)));
            return true;
          })
          .scrollIntoView()
          .run();
      }),
      ArrowLeft: exitArrow('before'),
      ArrowUp: exitArrow('before'),
      ArrowRight: exitArrow('after'),
      ArrowDown: exitArrow('after'),
      Escape: withCursor((selection) => {
        const box = adjacentBox(editor.state.doc.resolve(selection.head));
        if (!box) return false;
        return reenterBox(selection, box);
      }),
    };
  },
});
