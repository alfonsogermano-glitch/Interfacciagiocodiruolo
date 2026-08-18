import { Extension, type Editor } from '@tiptap/core';
import { Selection, TextSelection, Plugin, PluginKey } from '@tiptap/pm/state';
import type { Transaction } from '@tiptap/pm/state';
import { Fragment, Slice } from '@tiptap/pm/model';
import type { Node as ProseMirrorNode, NodeType, ResolvedPos, Schema } from '@tiptap/pm/model';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import type { Mapping } from '@tiptap/pm/transform';
import { GapCursor } from '@tiptap/pm/gapcursor';

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

// Nome di nodo di una riga di tabella (TableRow di @tiptap/extension-table,
// invariato - non estesa da nessun wrapper qui, a differenza di
// TableCell/TableHeader) - usato per riconoscere una TRANSIZIONE fra righe
// diverse (exitRowBoundary sotto), simmetrica a isTableCell sopra ma un
// livello piu' in su.
function isTableRow(node: ProseMirrorNode): boolean {
  return node.type.name === 'tableRow';
}

// Nome di nodo della tabella stessa (TableWithHandle, tiptapTableHandle.ts
// - Table.extend({...}) da @tiptap/extension-table: .extend() non tocca
// name, resta 'table' invariato, stesso motivo di isTableRow sopra) - usato
// da exitTableBoundary sotto, un livello ancora piu' in su di isTableRow,
// per risalire dalla riga alla tabella che la contiene.
function isTable(node: ProseMirrorNode): boolean {
  return node.type.name === 'table';
}

// Come findBoxAncestorDepth (sotto), ma per la cella di tabella piu'
// vicina - usata da exitCellBoundary/exitRowBoundary per decidere la
// transizione fra celle/righe diverse, e da isAtRowStart/isAtRowEnd sotto
// per lo stesso motivo, MAI da Backspace (a differenza di
// findBoxAncestorDepth): un antenato "cella" trovato al posto di un
// antenato "box" cancellerebbe l'intera cella invece di un box al suo
// interno se riusata li' - le due ricerche restano deliberatamente
// separate. Esportata anche per RichTextEditor.tsx (scroll orizzontale
// della tabella, round 5, bug 2026-08-06): la' serve lo stesso identico
// antenato-cella, ma per trovarne il nodo DOM via view.nodeDOM invece che
// per una decisione di navigazione - riusare la stessa funzione invece di
// una ricerca DOM (closest('td, th') dalla posizione del cursore) evita la
// fragilita' di quella ricerca quando la selezione attiva e' il nostro
// cursore finto (vedi commento su quel caso in RichTextEditor.tsx).
export function findCellAncestorDepth($pos: ResolvedPos): number | null {
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    if (isTableCell($pos.node(depth))) return depth;
  }
  return null;
}

// Come findCellAncestorDepth sopra, un livello ancora piu' in su - usata
// SOLO da exitTableBoundary sotto per risalire dalla cella alla TABELLA
// che la contiene (non alla riga, isTableRow non basta qui: serve il
// nodo il cui confine esterno e' il vero bordo assoluto della tabella,
// dove far atterrare il cursore fuori). Stessa ricerca esplicita per
// profondita' invece di assumerla via aritmetica (es. rowDepth - 1) -
// coerente con lo stile del resto del file, mai assumere la profondita'
// di un antenato quando si puo' cercarla.
export function findTableAncestorDepth($pos: ResolvedPos): number | null {
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    if (isTable($pos.node(depth))) return depth;
  }
  return null;
}

// Nome di nodo della row a livello documento (tiptapRow.ts, Fase 1-2
// "affiancamento a livello documento") - chiamata "Doc" (non solo "Row",
// gia' preso da isTableRow/findRow* piu' sopra per la riga di TABELLA) per
// restare inequivocabile: le due "row" del file (riga di tabella e row
// documentale) non condividono ne' nome di nodo ne' semantica, solo la
// somiglianza superficiale del termine italiano.
function isDocRow(node: ProseMirrorNode): boolean {
  return node.type.name === 'row';
}

// Come findTableAncestorDepth sopra - antenato 'row' documentale piu'
// vicino. Usata da exitRowDocumentBoundary sotto SOLO dopo aver gia'
// verificato che il risultato coincide esattamente col genitore diretto
// dell'item (rowDepth === itemDepth-1, vedi li'): una ricerca "ovunque
// sopra" da sola non basterebbe a distinguere "il mio contenitore diretto
// e' una row" da "c'e' una row da qualche parte piu' in alto, oltre una
// cella di tabella in mezzo" (Fase 3b, tabella dentro una row - fuori
// scope qui, verificato dal vivo 2026-08-08: con la tabella dentro una
// row, il cursore dentro una cella risolve SEMPRE itemDepth dentro quella
// cella, mai al livello della row - ma questa funzione da sola, chiamata
// senza quel controllo, troverebbe comunque la row piu' esterna e
// scavalcherebbe erroneamente la tabella).
function findDocRowAncestorDepth($pos: ResolvedPos): number | null {
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    if (isDocRow($pos.node(depth))) return depth;
  }
  return null;
}

// Vero per un nodo che affianca i propri figli diretti via flex (row
// documentale O cella di tabella - stesso layout CSS, .tiptap-row-flex e
// .tiptap-td-flex, vedi theme.css) - il contenitore di riferimento per
// findFlexItemAncestorDepth sotto, che riconosce QUALUNQUE coppia di
// fratelli diretti in uno di questi due contenitori (non solo TextBox/
// Collapse, a differenza di isSideBySideBox sopra che resta invariata:
// quella decide "e' un box pausabile", non "sono in un contenitore che
// affianca i suoi figli" - le due domande sono indipendenti, vedi
// exitFlexSiblingBoundary sotto per come si combinano).
//
// Esportata (piano confermato 2026-08-13, Problema A+B - Passo 3): riusata
// da addElementBeside (tiptapRow.ts, Caso 1) per distinguere, quando la
// selezione e' un TextBoxEdgeCursor, se il gap si trova GIA' dentro una
// row/cella (Caso 1a: il fratello con cui affiancare esiste gia', basta un
// insert nudo, invariato da ieri) oppure NO (Caso 1b, nuovo: il gap e' fra
// due fratelli non ancora in una row - es. un box isolato uscito verso un
// paragrafo normale, pausa introdotta dal Passo 2 - serve avvolgerli in una
// row nuova invece di limitarsi a un insert nudo, altrimenti il nuovo
// elemento finirebbe come terzo blocco impilato invece che affiancato).
export function isFlexSiblingContainer(node: ProseMirrorNode): boolean {
  return isDocRow(node) || isTableCell(node);
}

// Profondita' del figlio DIRETTO di una row/cella che contiene $pos - "un
// livello alla volta" come findBoxAncestorDepth/findCellAncestorDepth
// sopra, ma cerca il genitore (node(depth-1)) invece del nodo stesso a
// quella profondita': serve la profondita' dell'ITEM (il fratello il cui
// bordo interessa), non della row/cella che lo contiene. Per costruzione
// si ferma sempre al contenitore piu' INTERNO: se $pos e' dentro una
// tabella che e' essa stessa figlia di una row (Fase 3b, non ancora
// gestita da exitFlexSiblingBoundary/exitRowDocumentBoundary sotto), la
// cella di quella tabella viene incontrata per prima risalendo da $pos -
// verificato dal vivo 2026-08-08 (harness con addElementBeside('table'),
// angoli riga0/colonna0 e ultima riga/colonna): itemDepth risolve sempre
// dentro la cella, mai al livello della row esterna, nessuna guardia
// esplicita su isTable(item) necessaria.
function findFlexItemAncestorDepth($pos: ResolvedPos): number | null {
  for (let depth = $pos.depth; depth >= 1; depth -= 1) {
    if (isFlexSiblingContainer($pos.node(depth - 1))) return depth;
  }
  return null;
}

// Come isSideBySideBox, ma include ANCHE la tabella (Fase 3b) - usata SOLO
// da adjacentBox sotto, mai da landOrDive/exitFlexSiblingBoundary/
// pauseAtIsolatingBoundary (che decidono SE pausare, e restano ancorate a
// isSideBySideBox com'era: la tabella come VICINO di un paragrafo che
// pausa resta fuori scope, vedi pauseAtIsolatingBoundary sopra). Qui invece
// la domanda e' diversa: "posso rientrare in questo vicino da una pausa
// gia' creata" - una pausa puo' gia' avere una tabella adiacente (creata da
// exitTableBoundary sotto, via pauseAtIsolatingBoundary) e senza questo
// riconoscimento adjacentBox tornerebbe null, bloccando exitArrow in testa
// (if (!box) return false) - nessuna freccia funzionerebbe piu' da quella
// pausa, un vicolo cieco peggiore del gap che Fase 3b risolve.
//
// isDocRow aggiunta (Fase 2, piano confermato 2026-08-11, coordinamento
// Segnalazione 2): la nuova pausa intermedia creata da exitRowDocumentBoundary
// sotto, quando il bordo assoluto di una row non ha alcun vicino, e' sempre
// adiacente alla row stessa - senza questo riconoscimento adjacentBox
// tornerebbe null anche qui, bloccando exitArrow PRIMA di poter riprovare
// exitRowDocumentBoundary una seconda volta (stesso identico vicolo cieco
// del commento sopra, per la tabella). Sicuro per costruzione: landOrDive
// (l'unica altra funzione che crea pause) non tratta MAI una row come
// vicino pausabile - nessuna pausa preesistente puo' quindi trovarsi
// adiacente a una row, questo ramo si attiva solo per la pausa nuova.
function isReenterableNeighbor(node: ProseMirrorNode): boolean {
  return isSideBySideBox(node) || isTable(node) || isDocRow(node);
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
//
export function adjacentBox($pos: ResolvedPos): { node: ProseMirrorNode; side: 'before' | 'after' } | null {
  if ($pos.nodeAfter && isReenterableNeighbor($pos.nodeAfter)) return { node: $pos.nodeAfter, side: 'after' };
  if ($pos.nodeBefore && isReenterableNeighbor($pos.nodeBefore)) return { node: $pos.nodeBefore, side: 'before' };
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
// isTableCell(neighbor)/isTableRow(neighbor): `pos` e' il confine FRA DUE
// CELLE della stessa riga (usata da exitCellBoundary sotto, chiamata li'
// con la posizione a livello di RIGA) o FRA DUE RIGHE della stessa
// tabella (exitRowBoundary, un livello piu' su, posizione a livello di
// TABELLA) - mai da exitBoxBoundary: il confine di un box e' sempre un
// livello piu' dentro, fra i FIGLI di una cella, dove un fratello non e'
// mai di tipo cella ne' riga. Un "tuffo" diretto dentro sarebbe il salto
// incondizionato di default (comportamento nativo di prosemirror-tables)
// - qui invece si RIPROVA la stessa identica decisione un livello piu'
// dentro, verso il primo/ultimo figlio della cella/riga di destinazione:
// una riga ha SEMPRE almeno una cella e una cella ha SEMPRE almeno un
// blocco (schema, "backfill" celle vuote) - la ricorsione non puo' mai
// incontrare un vicino nullo per un livello di container come questo,
// solo il caso "prima/ultima riga della tabella" (nessuna riga vicina)
// puo' esserlo, ma quello e' filtrato PRIMA di arrivare qui da
// exitRowBoundary (guardia esplicita, mai una ricorsione di landOrDive -
// vedi commento li' per il perche', stessa causa del bug 2026-08-05 sulla
// cella fantasma). Se il figlio d'ingresso e' un box il cursore finto
// nasce li' (dentro la cella/riga di destinazione, adiacente al box - MAI
// al confine grezzo, che non e' un contenitore DOM valido per il widget),
// altrimenti si procede fino al primo testo reale esattamente come nel
// caso comune.
function landOrDive(doc: ProseMirrorNode, pos: number, dir: 'before' | 'after'): Selection {
  const $pos = doc.resolve(pos);
  const neighbor = dir === 'after' ? $pos.nodeAfter : $pos.nodeBefore;
  if (!neighbor) return new TextBoxEdgeCursor($pos);
  if (isSideBySideBox(neighbor)) return new TextBoxEdgeCursor($pos);
  if (isTableCell(neighbor) || isTableRow(neighbor)) return landOrDive(doc, dir === 'after' ? pos + 1 : pos - 1, dir);
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
//
// Rilevamento anticipato di un a-capo di riga flex (bug 2026-08-04/05, "il
// fix corregge troppo, e solo in una direzione": una singola freccia
// scavalcava fine-riga-1/inizio-riga-2 saltando una fermata, sia uscendo
// da box1 verso destra sia da box2 verso sinistra) - misurato PRIMA della
// transazione, sui due elementi reali ancora affiancati nel DOM (nessun
// widget di mezzo finche' la transazione non parte): elemento1/elemento2
// sono fratelli diretti a questa posizione condivisa (fine di uno ===
// inizio dell'altro, un solo intero) a PRESCINDERE da quale dei due si
// sta lasciando, quindi la stessa misura (via nodeDOM/previousElementSibling)
// vale identica per entrambe le direzioni - nessuna asimmetria qui, solo
// la FASE iniziale (ROW_PAUSE_DIR_META, vedi sotto) distingue le due
// direzioni. Estratta come funzione a parte (round Fase 3, "affiancamento
// a livello documento") perche' riusata identica da exitFlexSiblingBoundary
// sotto: la misura e' generica (due elementi DOM adiacenti qualunque),
// mai stata specifica ai box.
//
// Guardia sul CONTENITORE aggiunta (round bug 2026-08-11 pomeriggio, "la
// doppia fermata a-capo scatta anche uscendo verticalmente da un box/row
// isolato verso un paragrafo normale sottostante, mai stata un vero
// a-capo"): "due elementi DOM adiacenti con top diverso" e' vero per
// COSTRUZIONE per qualunque coppia di blocchi impilati verticalmente (mai
// dentro un flex) - il controllo misurava solo "sono su righe diverse",
// mai "sono ENTRAMBI item flex della STESSA riga/cella che avrebbero
// dovuto stare affiancati". pauseAtIsolatingBoundary (sopra) e' chiamata
// oggi da QUALUNQUE bordo isolating (box Fase 3a/Passo 2, row Fase 2) - non
// piu' solo da bordi dentro una row/cella come alle origini di questa
// funzione, quindi il falso positivo non era mai stato raggiungibile prima
// di quei due fix. Wrap vero SOLO se afterDom e' figlio diretto di un
// contenitore flex (.tiptap-row-flex/.tiptap-td-flex, gli stessi due usati
// da findOuterVisibleBoundary sopra) - altrimenti la nozione stessa di
// "andato a capo" non si applica, `wrapped` resta false e la pausa avanza
// alla prima pressione ripetuta, invece di richiederne una in piu' per una
// conferma che qui non ha alcun significato.
function measureRowWrap(editor: Editor, boundaryPos: number): boolean {
  const afterDom = editor.view.nodeDOM(boundaryPos) as HTMLElement | null;
  const beforeDom = afterDom?.previousElementSibling as HTMLElement | null;
  if (!afterDom || !beforeDom) return false;
  const container = afterDom.parentElement;
  if (!container || !(container.classList.contains('tiptap-row-flex') || container.classList.contains('tiptap-td-flex'))) return false;
  return Math.abs(afterDom.getBoundingClientRect().top - beforeDom.getBoundingClientRect().top) > 1;
}

// Pausa incondizionata al confine di un elemento ISOLATING (box O tabella,
// Fase 3b) che sta uscendo verso un fratello DIRETTO qualunque - non piu'
// limitata a "fratello dentro una row/cella" (gate rimosso in
// exitBoxBoundary sotto, piano confermato 2026-08-13, Problema B - Passo 2):
// gia' dalla sua prima estrazione (fix Fase 3a, scoperto dal vivo
// 2026-08-08 testando A2->A1) questa funzione era scritta in modo
// completamente generico - "chi esce e' isolating per definizione (box O
// tabella, entrambi isolating:true nello schema), quindi la pausa scatta
// SEMPRE quando c'e' un vero fratello, qualunque sia il SUO tipo" - il
// limite a row/cella non era nella funzione ma nel GATE della chiamata in
// exitBoxBoundary; rimosso quel gate, questa stessa identica logica ora
// pausa anche un box ISOLATO (nessuna row/cella, es. genitore diretto il
// documento o il contenuto di un altro TextBox/Collapse) che esce verso un
// fratello NORMALE (un paragrafo qualunque) - prima il fallback generico in
// fondo a exitBoxBoundary pausava solo se il fratello era anch'esso un box
// (o assente del tutto), mai verso un blocco normale, lasciando le frecce
// tuffarsi dritte dentro senza fermata in quel caso, il gap segnalato dal
// Problema B. A differenza di exitFlexSiblingBoundary sotto, dove e' il
// fratello a dover essere un box perche' chi esce - un paragrafo - non e'
// isolating di suo, qui e' irrilevante: e' SEMPRE chi esce (il box/tabella)
// a essere isolating, mai il fratello. Esclusa la tabella come possibile
// VICINO (isTable(sibling)) - resta fuori scope anche qui il caso "due
// tabelle affiancate" o "box accanto a tabella", non ancora verificato dal
// vivo, invariato da questo passo. Ritorna false se non c'e' alcun fratello
// (bordo assoluto del contenitore, competenza del chiamante).
function pauseAtIsolatingBoundary(editor: Editor, boundaryPos: number, dir: 'before' | 'after', axis: 'horizontal' | 'vertical'): boolean {
  const { doc } = editor.state;
  const $boundary = doc.resolve(boundaryPos);
  const sibling = dir === 'before' ? $boundary.nodeBefore : $boundary.nodeAfter;
  if (!sibling || isTable(sibling)) return false;

  const rowWrapped = measureRowWrap(editor, boundaryPos);
  return editor
    .chain()
    .command(({ tr }) => {
      tr.setSelection(new TextBoxEdgeCursor(tr.doc.resolve(boundaryPos)));
      tr.setMeta(ROW_PAUSE_WRAPPED_META, rowWrapped);
      tr.setMeta(ROW_PAUSE_DIR_META, dir);
      tr.setMeta(ROW_PAUSE_AXIS_META, axis);
      return true;
    })
    .scrollIntoView()
    .run();
}

// Pattern condiviso "pausa se c'e' un vicino reale non-tabella
// (pauseAtIsolatingBoundary), altrimenti atterra/tuffati con gli stessi due
// meta di riga" - stesso identico blocco che finora viveva duplicato in tre
// punti (fallback di exitBoxBoundary, ramo row di exitTableBoundary, coda di
// exitRowDocumentBoundary, tutti invariati qui sotto). Estratto (Fase A,
// piano navigazione verticale confermato 2026-08-16) perche' il ramo
// verticale di exitBoxBoundary (allora nuovo) lo riusava una quarta volta -
// i tre punti preesistenti NON sono stati toccati/fatti convergere qui in
// quel passo (nessun bisogno funzionale, e tenerli invariati riduce il
// rischio di regressione sull'orizzontale gia' collaudato).
//
// REVISIONE 2026-08-17 (richiesta esplicita, "elimina la pausa verticale"):
// il ramo verticale di exitBoxBoundary sotto non chiama piu' questa
// funzione - l'unico chiamante rimasto e' il fallback generico in fondo a
// exitBoxBoundary, per l'asse ORIZZONTALE (invariato). L'asse verticale ha
// oggi la propria regola dedicata, vedi verticalPauseOrJump subito sotto.
function pauseOrLandAtRowBoundary(editor: Editor, pos: number, dir: 'before' | 'after', axis: 'horizontal' | 'vertical'): boolean {
  if (pauseAtIsolatingBoundary(editor, pos, dir, axis)) return true;
  const rowWrapped = measureRowWrap(editor, pos);
  return editor
    .chain()
    .command(({ tr }) => {
      tr.setSelection(landOrDive(tr.doc, pos, dir));
      tr.setMeta(ROW_PAUSE_WRAPPED_META, rowWrapped);
      tr.setMeta(ROW_PAUSE_DIR_META, dir);
      tr.setMeta(ROW_PAUSE_AXIS_META, axis);
      return true;
    })
    .scrollIntoView()
    .run();
}

// REVISIONE 2026-08-17 (tabella di verita' Su/Giu' confermata dall'utente,
// sostituisce interamente il "salto sempre diretto" della revisione di
// poco fa): la scelta fra cursore reale e cursore finto per l'asse
// verticale dipende SOLO dal contenuto della RIGA DI DESTINAZIONE, mai da
// quella di partenza - "riga" qui e' il blocco documento immediatamente
// sopra/sotto (una row vera, o un blocco standalone: paragrafo/box/
// tabella). Se quel blocco e' una row, conta il suo primo figlio (per
// dir 'after'/Giu') o ultimo figlio (per dir 'before'/Su); se non e' una
// row, conta il blocco stesso - in entrambi i casi l'"elemento al bordo"
// e' cio' che il cursore incontrerebbe per primo entrando in quella
// direzione. null se non c'e' alcun vicino (bordo assoluto del documento).
function verticalDestinationEdgeItem(doc: ProseMirrorNode, boundaryPos: number, dir: 'before' | 'after'): ProseMirrorNode | null {
  const $pos = doc.resolve(boundaryPos);
  const neighbor = dir === 'before' ? $pos.nodeBefore : $pos.nodeAfter;
  if (!neighbor) return null;
  if (isDocRow(neighbor)) return dir === 'before' ? neighbor.lastChild : neighbor.firstChild;
  return neighbor;
}

// Vero se l'elemento al bordo della destinazione (sopra) e' un ELEMENTO
// (TextBox/Collapse/Tabella) invece di testo normale - unico criterio della
// tabella di verita'. isSideBySideBox/isTable, non isRowItemEligible:
// quest'ultima include anche 'paragraph', che qui deve dare false. Una
// lista puntata/citazione (non isolating, mai stata un problema per la
// navigazione nativa) conta come "testo" allo stesso modo di un paragrafo -
// il criterio e' "e' un box/tabella", non "e' un paragrafo".
function isVerticalDestinationElement(doc: ProseMirrorNode, boundaryPos: number, dir: 'before' | 'after'): boolean {
  const edge = verticalDestinationEdgeItem(doc, boundaryPos, dir);
  return edge !== null && (isSideBySideBox(edge) || isTable(edge));
}

// Unico punto di decisione reale-vs-fantasma per l'asse verticale, riusato
// da exitBoxBoundary (uscita da dentro un box), exitRowItemVertical (uscita
// da dentro un rowItem qualunque, box o paragrafo), enterRowDocumentBoundary
// (ingresso in una row/tabella/box da fuori) ed exitArrow (prosecuzione da
// una pausa gia' attiva verso la riga ancora oltre, o rivalutazione
// all'indietro) - MAI piu' chiamata incondizionatamente com'era nella
// revisione di poco fa. Ramo fantasma: riusa esattamente il meccanismo di
// pausa gia' collaudato (TextBoxEdgeCursor + i tre meta di riga, stessa
// barra orizzontale della Fase B) - solo la CONDIZIONE per crearla e'
// cambiata, non la sua implementazione. rowWrapped hardcoded a false (non
// misurato via measureRowWrap): boundaryPos qui e' SEMPRE un confine fra
// due blocchi di livello documento (mai dentro un contenitore flex riga/
// cella, a differenza delle pause orizzontali), quindi la misura
// darebbe comunque false per costruzione (measureRowWrap richiede un
// container .tiptap-row-flex/.tiptap-td-flex) - evitata la query DOM
// inutile. Ramo reale: lo stesso identico Selection.near gia' costruito
// nella revisione precedente, invariato.
//
// pauseAtAbsoluteBoundary (bug 2026-08-18 sera, segnalato dal vivo: "salendo
// dall'ultima riga attraverso righe-elemento consecutive fino in cima, la
// pressione finale si tuffa dentro il primo box invece di fermarsi
// fantasma"): di default false, invariato per le prime tre chiamanti sopra
// (primo ingresso da testo reale - nessun bordo "gia' superato" di cui
// tener conto). L'UNICO chiamante che lo passa true e' la prosecuzione
// "stessa direzione" di exitArrow: li' il vicino che si sta per superare
// (per valutare il blocco ANCORA oltre) e' per costruzione un elemento -
// e' il motivo stesso per cui la pausa attuale esiste. Se quel salto arriva
// al bordo ASSOLUTO del documento (nessun vicino li', verticalDestinationEdgeItem
// torna null, isVerticalDestinationElement quindi false "non e' un
// elemento") il ramo reale sotto chiamava Selection.near, che senza nulla
// da trovare nella direzione richiesta ripiega sulla direzione OPPOSTA
// (stesso comportamento di libreria gia' documentato altrove in questo
// file) - rientrando dritto nel box appena superato invece di restare
// fermo al bordo. true forza qui il ramo fantasma anche quando
// isVerticalDestinationElement e' false, ma SOLO se non c'e' alcun vicino
// (bordo assoluto): un vicino REALE che risulta "non elemento" (es. un
// paragrafo normale subito oltre) deve continuare a dare luogo al salto
// vero, invariato - la guardia sotto lo verifica esplicitamente.
function verticalPauseOrJump(editor: Editor, boundaryPos: number, dir: 'before' | 'after', pauseAtAbsoluteBoundary = false): boolean {
  const { doc } = editor.state;
  const $boundary = doc.resolve(boundaryPos);
  const hasNeighbor = !!(dir === 'before' ? $boundary.nodeBefore : $boundary.nodeAfter);
  const shouldPause = isVerticalDestinationElement(doc, boundaryPos, dir) || (!hasNeighbor && pauseAtAbsoluteBoundary);
  if (shouldPause) {
    return editor
      .chain()
      .command(({ tr }) => {
        tr.setSelection(new TextBoxEdgeCursor(tr.doc.resolve(boundaryPos)));
        tr.setMeta(ROW_PAUSE_WRAPPED_META, false);
        tr.setMeta(ROW_PAUSE_DIR_META, dir);
        tr.setMeta(ROW_PAUSE_AXIS_META, 'vertical');
        return true;
      })
      .scrollIntoView()
      .run();
  }
  return editor
    .chain()
    .command(({ tr }) => {
      tr.setSelection(Selection.near(tr.doc.resolve(boundaryPos), dir === 'after' ? 1 : -1));
      return true;
    })
    .scrollIntoView()
    .run();
}

// axis (Fase A del 2026-08-16, REVISIONATO 2026-08-17 - tabella di verita'
// Su/Giu' confermata dall'utente): fino al 16 agosto questa funzione non
// distingueva Sinistra/Destra da Su/Giu' - lo stesso bordo "genitore diretto
// e' una row" veniva trattato identico in entrambi gli assi, pausando (o
// tuffandosi) verso il FRATELLO nella riga (il box adiacente nella stessa
// row). Corretto per l'orizzontale (e' esattamente il significato di "esci a
// sinistra/destra"), sbagliato per il verticale: da un box che non e' ne' il
// primo ne' l'ultimo della riga, uscire in verticale deve raggiungere il
// bordo della RIGA STESSA (il blocco documento sopra/sotto), mai un
// fratello affiancato - vedi il ramo axis==='vertical' subito sotto. Il
// ramo isTableCell (dentro il blocco isFlexSiblingContainer piu' sotto)
// resta interamente FUORI da questa distinzione, invariato per qualunque
// axis - stessa esclusione "scroll orizzontale annidato/arrow-nav a doppio
// livello, fuori scope" gia' documentata altrove in questo file per le
// celle di tabella.
export function exitBoxBoundary(editor: Editor, dir: 'before' | 'after', axis: 'horizontal' | 'vertical'): boolean {
  const { selection, doc } = editor.state;
  if (!selection.empty) return false;
  const $from = selection.$from;
  const boxDepth = findBoxAncestorDepth($from);
  if (boxDepth === null) return false;

  // REVISIONE 2026-08-17 sera (bug segnalato dal vivo, cascata di GapCursor
  // nativi salendo/scendendo da un punto qualunque di una riga corta):
  // isAtBoxBoundary richiede l'offset ESATTO 0/fine del contenuto del box -
  // corretto per l'orizzontale (movimento carattere-per-carattere, il
  // cursore raggiunge il bordo solo dopo aver attraversato tutta la riga),
  // sbagliato per il verticale, dove un cursore reale puo' trovarsi in
  // QUALUNQUE punto di una riga (specialmente monolinea) e voler comunque
  // uscire in verticale - l'utente non deve prima premere Fine/Home. Su
  // quell'asse il criterio giusto e' "sono sull'ultima riga VISIVA in
  // questa direzione", non "sono all'ultimo carattere": view.endOfTextblock
  // e' la stessa API nativa che ProseMirror usa internamente per la propria
  // gestione delle frecce - misura il layout DOM reale, quindi gestisce da
  // sola sia una riga corta (sempre vero, unica riga) sia un paragrafo
  // lungo a capo (vero solo sulla riga visiva davvero prima/ultima, false
  // altrimenti - il nativo gestisce il movimento infra-blocco). Nessun
  // parametro di stato: opera su editor.view.state.selection, che a questo
  // punto (prima di qualunque transazione) coincide con $from.
  //
  // Trade-off accettato: per un box con PIU' di un paragrafo al suo
  // interno, endOfTextblock non sa distinguere "ultima riga del MIO
  // paragrafo" da "ultimo paragrafo del box" - potrebbe uscire dal box da
  // un paragrafo intermedio invece di scendere al paragrafo successivo
  // interno. Fuori scope per questa revisione (uso reale in questa
  // codebase: box quasi sempre a un solo paragrafo) - solo l'orizzontale,
  // invariato sotto, resta rigorosamente corretto anche per quel caso.
  const atBoxBoundary =
    axis === 'vertical'
      ? editor.view.endOfTextblock(dir === 'before' ? 'up' : 'down')
      : isAtBoxBoundary(doc, $from, boxDepth, dir === 'before' ? 'start' : 'end');
  if (!atBoxBoundary) return false;

  const boundaryPos = dir === 'before' ? $from.before(boxDepth) : $from.after(boxDepth);

  // Caso Fase 3a, generalizzato al Problema B (piano confermato 2026-08-13,
  // Passo 2) - box il cui genitore DIRETTO e' QUALUNQUE contenitore
  // (documento, TextBox/Collapse gia' esistente, row, cella), non piu' solo
  // row/cella: senza questo ramo, questa funzione (controllata per PRIMA
  // nella catena, findBoxAncestorDepth trova il box a QUALUNQUE profondita')
  // intercetta sempre il confine prima che exitFlexSiblingBoundary/
  // exitRowDocumentBoundary abbiano una possibilita' - landOrDive sotto
  // pausa SOLO se il vicino e' anch'esso un box (isSideBySideBox), quindi un
  // box che esce verso un paragrafo/tabella fratello si tuffava dritto
  // attraverso. Fino al 2026-08-13 questo ramo (e quindi
  // pauseAtIsolatingBoundary) scattava SOLO se il genitore era gia' una
  // row/cella (isFlexSiblingContainer) - un box ISOLATO (genitore il
  // documento o un altro box) che usciva verso un fratello NORMALE cadeva
  // nel fallback generico in fondo, che pausa solo se il vicino e' assente o
  // anch'esso un box, mai verso un blocco qualunque: l'esatta asimmetria che
  // il Problema B segnala (nessuna pausa "di fianco" per un box isolato).
  // Gate rimosso: pauseAtIsolatingBoundary e' gia' di per se' generica (vedi
  // il suo commento sopra), il limite era solo qui nella chiamata.
  const parentDepth = boxDepth - 1;
  if (parentDepth >= 0) {
    // Ramo verticale, REVISIONATO 2026-08-17 (tabella di verita' Su/Giu'
    // confermata dall'utente, "la destinazione decide sempre, mai la
    // partenza"): se il genitore diretto del box e' una row documentale,
    // l'uscita verticale declina qui (return false) - delega interamente a
    // exitRowItemVertical subito sotto, che generalizza la stessa identica
    // decisione a QUALUNQUE rowItem (non solo un box: anche un paragrafo
    // normale che e' item della stessa row deve uscire in verticale verso
    // il bordo della row, mai verso il fratello affiancato - gap scoperto
    // in fase di analisi di questa revisione, la vecchia versione di questo
    // ramo, ancorata a findBoxAncestorDepth, non poteva raggiungerlo). Se il
    // genitore NON e' una row (box isolato, o annidato dentro un altro
    // box/cella), verticalPauseOrJump decide reale-o-fantasma guardando la
    // destinazione ESATTAMENTE al bordo del box stesso (boundaryPos) - MAI
    // piu' una pausa incondizionata verso QUALUNQUE fratello reale (vecchio
    // comportamento pre-17-agosto, pauseAtIsolatingBoundary sotto, ancora
    // in vigore SOLO per l'orizzontale).
    if (axis === 'vertical') {
      if (isDocRow($from.node(parentDepth))) return false;
      return verticalPauseOrJump(editor, boundaryPos, dir);
    }

    if (pauseAtIsolatingBoundary(editor, boundaryPos, dir, axis)) return true;

    // Il resto di questo ramo (deferral al vero bordo del CONTENITORE
    // invece di una pausa "morta" qui) resta scoped al SOLO caso row -
    // verificato esplicitamente con isFlexSiblingContainer PRIMA di questo
    // controllo piu' specifico (non piu' come gate esterno): un box isolato
    // (genitore il documento o un altro box) senza alcun fratello ricade
    // correttamente nel fallback generico sotto invariato, che gia' pausa
    // da solo su un vero bordo assoluto senza fratelli (landOrDive,
    // ramo "nessun vicino").
    if (isFlexSiblingContainer($from.node(parentDepth))) {
      const $boundary = doc.resolve(boundaryPos);
      const sibling = dir === 'before' ? $boundary.nodeBefore : $boundary.nodeAfter;

      // Nessun fratello (non-tabella) E il contenitore e' una row (non una
      // cella): il vero bordo assoluto e' quello della ROW, non del box -
      // NON creare qui la pausa "morta" del ramo generico sotto (pensata
      // per altri contesti, es. box a livello documento senza nulla
      // prima/dopo): lascia scendere la catena fino a
      // exitRowDocumentBoundary, che sa uscire davvero dalla row. Se il
      // contenitore e' invece una CELLA, questo ramo non scatta (isDocRow
      // falso) - comportamento INVARIATO sotto, stesso "pausa morta poi
      // seconda pressione" di sempre (fuori scope per questa fase, vedi
      // test di non-regressione). Se il fratello esiste ma e' una tabella
      // (pauseAtIsolatingBoundary l'ha scartato), si ricade
      // deliberatamente nel ramo generico sotto invece di un altro return
      // false qui: fuori scope anche per la Fase 3b, stesso comportamento
      // di oggi (tuffo diretto via landOrDive).
      if (!sibling && isDocRow($from.node(parentDepth))) return false;
    }
  }

  return pauseOrLandAtRowBoundary(editor, boundaryPos, dir, axis);
}

// Gemella verticale di exitRowDocumentBoundary sotto (stesso identico
// rilevamento strutturale, findFlexItemAncestorDepth + verifica esplicita
// che il contenitore diretto sia una row - non una cella, vedi il commento
// su quella funzione per il perche'), ma per l'asse verticale: generalizza
// il ramo isDocRow di exitBoxBoundary sopra a QUALUNQUE rowItem, non solo
// un box - un paragrafo normale che e' item di una row non ha mai un box
// ancestor (findBoxAncestorDepth torna null), quindi exitBoxBoundary non
// puo' raggiungerlo per costruzione. Senza questa funzione, Su/Giu' da un
// paragrafo del genere cade sul fallback nativo di ProseMirror - che
// attraversa correttamente UN SOLO confine isolating (la row stessa, gia'
// verificato dal vivo per row[paragrafo,paragrafo]) ma produce lo stesso
// identico GapCursor invisibile quando la riga di destinazione isola A SUA
// VOLTA tramite il proprio primo/ultimo figlio (un box) - due confini
// isolating in fila, il caso che ha gia' motivato exitBoxBoundary/
// enterRowDocumentBoundary altrove in questo file.
//
// Nessuna restrizione su "nessun fratello nella riga" (a differenza di
// exitRowDocumentBoundary, che scatta SOLO quando l'item e' il primo/
// ultimo della sua row): l'asse verticale non guarda MAI i fratelli
// affiancati, a qualunque posizione orizzontale nella riga - Su/Giu' da
// QUALUNQUE item della riga raggiunge sempre il bordo della riga stessa,
// stesso principio gia' in vigore per exitBoxBoundary.
//
// selection instanceof TextBoxEdgeCursor esclusa esplicitamente (stesso
// motivo di enterRowDocumentBoundary sotto): una pausa gia' attiva e'
// competenza di exitArrow, mai di questa funzione - selection.empty e'
// vero anche per una TextBoxEdgeCursor, quindi va escluso a monte.
export function exitRowItemVertical(editor: Editor, dir: 'before' | 'after'): boolean {
  const { selection } = editor.state;
  if (!selection.empty || selection instanceof TextBoxEdgeCursor) return false;

  const $from = selection.$from;
  const itemDepth = findFlexItemAncestorDepth($from);
  if (itemDepth === null) return false;
  const rowDepth = findDocRowAncestorDepth($from);
  if (rowDepth !== itemDepth - 1) return false;
  // REVISIONE 2026-08-17 sera (stesso bug/stessa cura di exitBoxBoundary
  // sopra, vedi il suo commento per il ragionamento completo): funzione
  // gia' solo-verticale, sostituzione diretta senza branch su axis.
  if (!editor.view.endOfTextblock(dir === 'before' ? 'up' : 'down')) return false;

  const rowPos = dir === 'before' ? $from.before(rowDepth) : $from.after(rowDepth);
  return verticalPauseOrJump(editor, rowPos, dir);
}

// Pausa fra due fratelli DIRETTI di una row documentale o di una cella di
// tabella (Fase 3a "navigazione fra fratelli di row/cella", generalizza il
// meccanismo gia' collaudato di exitBoxBoundary sopra) - a differenza sua
// (che parte da un antenato box isolating e scatta OVUNQUE nel documento,
// anche fuori da ogni contesto flex), qui il trigger e' strutturale: sono
// al bordo del MIO contenitore diretto (paragrafo, box, o - non ancora,
// vedi sotto - tabella) dentro una row/cella, con un fratello dall'altra
// parte. Colma il gap scoperto dal vivo 2026-08-08 (harness, passo 0):
// oggi un paragrafo normale affiancato a un TextBox/Collapse (stessa cella
// O stessa row) attraversa il confine in un solo tasto, senza la pausa che
// invece box-box gia' ha - qui SOLO perche' isSideBySideBox(paragrafo) e'
// falso e nessun codice guardava il bordo "in mezzo" a un contenitore
// flex, non un blocco reale del caret nativo (isolating non impedisce la
// ricerca di selezione, solo le trasformazioni - vedi commento su
// Selection.near piu' sotto in exitArrow).
//
// isSideBySideBox/adjacentBox/landOrDive NON cambiano: il fratello deve
// ancora essere un box (TextBox/Collapse) perche' scatti una pausa -
// paragrafo-paragrafo resta un salto diretto, invariato, stesso
// precedente gia' in vigore per due celle di tabella adiacenti che
// iniziano/finiscono entrambe con testo normale (exitCellBoundary sotto,
// che con lo stesso identico ragionamento non pausa in quel caso). La
// pausa quindi resta limitata a "almeno un lato e' un box", esattamente
// come il comportamento box-box gia' collaudato - solo il CONTESTO in cui
// puo' scattare si allarga (bordo del proprio item in una row/cella,
// non solo bordo di un box).
//
// Guardia "sibling esiste" PRIMA di chiamare landOrDive (stesso schema di
// exitCellBoundary/exitRowBoundary sotto, mai una chiamata a occhi chiusi
// su un bordo assoluto): se l'item e' primo/ultimo figlio della sua row/
// cella, non c'e' alcun fratello qui - quel bordo e' competenza di
// exitCellBoundary (bordo di cella) o di exitRowDocumentBoundary sotto
// (bordo assoluto di una row), MAI di questa funzione.
//
// Nessuna guardia esplicita su isTable(item): verificato dal vivo
// 2026-08-08 (harness con addElementBeside('table'), angoli riga0/
// colonna0 e ultima riga/colonna di una tabella dentro una row) che
// findFlexItemAncestorDepth non risolve mai alla tabella quando il
// cursore e' al suo interno - risolve sempre dentro la sua cella, gia'
// intercettata per prima. Tabella-dentro-una-row resta percio' gestita
// (per ora, invariata) solo da exitCellBoundary/exitRowBoundary/
// exitTableBoundary sotto - fuori scope per questa fase (Fase 3b).
export function exitFlexSiblingBoundary(editor: Editor, dir: 'before' | 'after'): boolean {
  const { selection, doc } = editor.state;
  if (!selection.empty) return false;
  const $from = selection.$from;
  const itemDepth = findFlexItemAncestorDepth($from);
  if (itemDepth === null) return false;
  if (!isAtBoxBoundary(doc, $from, itemDepth, dir === 'before' ? 'start' : 'end')) return false;

  const boundaryPos = dir === 'before' ? $from.before(itemDepth) : $from.after(itemDepth);
  const $boundary = doc.resolve(boundaryPos);
  const sibling = dir === 'before' ? $boundary.nodeBefore : $boundary.nodeAfter;
  if (!sibling) return false;

  if (!(landOrDive(doc, boundaryPos, dir) instanceof TextBoxEdgeCursor)) return false;

  const rowWrapped = measureRowWrap(editor, boundaryPos);

  return editor
    .chain()
    .command(({ tr }) => {
      tr.setSelection(landOrDive(tr.doc, boundaryPos, dir));
      tr.setMeta(ROW_PAUSE_WRAPPED_META, rowWrapped);
      tr.setMeta(ROW_PAUSE_DIR_META, dir);
      tr.setMeta(ROW_PAUSE_AXIS_META, 'horizontal');
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
// Controllo ESPLICITO di una vera cella vicina NELLA STESSA RIGA, PRIMA
// di chiamare landOrDive (bug 2026-08-05, corruzione strutturale reale -
// "una cella vuota fantasma appare, spostando tutte le altre a destra"):
// alla PRIMA/ULTIMA colonna di una riga, $boundary non ha alcun
// nodeBefore/nodeAfter a livello di riga (nessuna cella li', il passo
// successivo e' la RIGA precedente/successiva, non gestito qui - vedi
// sotto). Chiamare comunque landOrDive su quella posizione faceva
// scattare il suo ramo "nessun vicino => fermati qui" - pensato per un
// box appena uscito, dove "nessun vicino" significa "fermati esattamente
// al SUO bordo" (un bordo reale, il box stesso) - ma qui non c'e' NESSUN
// bordo reale: quella posizione e' un gap a livello di RIGA (prima di
// qualunque cella), mai contenuto valido per lo schema (tableRow accetta
// solo celle). Il cursore finto creato li' non e' rappresentabile, e
// ProseMirror lo "ripara" al render successivo materializzando una cella
// vuota per renderlo valido - la cella fantasma segnalata dal vivo.
// Nessuna cella vicina => return false SENZA MAI toccare landOrDive:
// lascia il salto diretto nativo di prosemirror-tables (che gestisce gia'
// correttamente la risalita/discesa alla riga precedente/successiva)
// completamente invariato.
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
  const $boundary = doc.resolve(boundaryPos);
  const neighborCell = dir === 'before' ? $boundary.nodeBefore : $boundary.nodeAfter;
  if (!neighborCell || !isTableCell(neighborCell)) return false;

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

// Vero quando $pos e' esattamente all'inizio della prima cella di una riga
// (colonna 0) - usato da RichTextEditor.tsx per forzare scrollLeft=0 sui
// contenitori di scroll orizzontale annidati (.tableWrapper dentro
// .tiptap-content dentro il wrapper esterno, tutti overflow-x:auto) quando
// il cursore raggiunge il vero margine sinistro della tabella. Bug
// segnalato 2026-08-06 dopo il primo fix (tr.scrollIntoView() ad ogni
// selectionUpdate, gia' in vigore): scrollIntoView calcola solo il MINIMO
// scroll necessario per rendere visibile il cursore con un margine, mai un
// vero azzeramento - lasciando un residuo quando si atterra su testo
// semplice senza alcun box (nessuna delle funzioni sopra interviene in quel
// caso, il movimento resta nativo). Riusa isAtBoxBoundary per "il cursore e'
// alla posizione cursore-equivalente dell'inizio della cella" (stessa
// identica logica gia' validata per i box, qui applicata alla cella)
// - "prima cella della riga" verificato a parte confrontando il nodo cella
// con firstChild del nodo riga (colonna 0 per definizione, indipendente da
// eventuali colspan altrove nella stessa riga).
export function isAtRowStart(doc: ProseMirrorNode, $pos: ResolvedPos): boolean {
  const cellDepth = findCellAncestorDepth($pos);
  if (cellDepth === null) return false;
  const rowDepth = cellDepth - 1;
  if (rowDepth < 0) return false;
  if ($pos.node(rowDepth).firstChild !== $pos.node(cellDepth)) return false;
  return isAtBoxBoundary(doc, $pos, cellDepth, 'start');
}

// Simmetrica a isAtRowStart sopra (stesso identico ragionamento, lato
// destro): vero quando $pos e' esattamente a fine contenuto dell'ULTIMA
// cella di una riga (lastChild invece di firstChild, isAtBoxBoundary side
// 'end' invece di 'start') - usata da RichTextEditor.tsx per forzare
// scrollLeft al MASSIMO (scrollWidth - clientWidth) quando il cursore
// raggiunge il vero margine destro della tabella, richiesta 2026-08-06
// "simmetrica" al fix sinistro gia' in vigore.
export function isAtRowEnd(doc: ProseMirrorNode, $pos: ResolvedPos): boolean {
  const cellDepth = findCellAncestorDepth($pos);
  if (cellDepth === null) return false;
  const rowDepth = cellDepth - 1;
  if (rowDepth < 0) return false;
  if ($pos.node(rowDepth).lastChild !== $pos.node(cellDepth)) return false;
  return isAtBoxBoundary(doc, $pos, cellDepth, 'end');
}

// Transizione fra DUE RIGHE DIVERSE della stessa tabella - simmetrica a
// exitCellBoundary sopra ma un livello piu' in su (l'antenato cercato per
// il salto e' la RIGA, non la cella): interviene SOLO quando NON c'e' un
// vicino nella STESSA riga (altrimenti e' compito di exitCellBoundary,
// non di questa) - bug 2026-08-05 segnalato subito dopo il fix del bug
// gemello sulla cella fantasma: "dall'ultima cella di una riga, uscendo a
// destra, scende correttamente alla riga successiva ma entra dritto nel
// primo elemento invece di fermarsi fuori". Stessa causa di fondo: il
// salto nativo di prosemirror-tables per il cambio riga non ha nessuna
// cognizione dei nostri box, esattamente come il salto diretto fra due
// celle della stessa riga (gia' corretto da exitCellBoundary).
//
// Guardia esplicita "nessun vicino nella stessa riga" ripetuta qui (non
// solo dedotta dal fatto che questa funzione viene provata SOLO dopo che
// exitCellBoundary e' gia' fallita, vedi tiptapBlocks.tsx/exitArrow
// sotto): exitCellBoundary puo' fallire per DUE motivi diversi - nessun
// vicino nella riga (il caso che riguarda QUESTA funzione) OPPURE un
// vicino c'e' ma non serve un cursore finto (contenuto normale, il salto
// diretto nativo fra celle della stessa riga resta corretto) - solo il
// primo motivo deve far scattare un cambio di riga qui, il secondo deve
// restare "nessun intervento" anche per questa funzione.
//
// Stesso identico schema esplicito-prima-di-landOrDive di
// exitCellBoundary (guardia neighborRow non nulla PRIMA di chiamare
// landOrDive, mai una ricorsione "a occhi chiusi"): a PRIMA/ULTIMA riga
// della tabella non c'e' alcuna riga vicina - chiamare comunque
// landOrDive li' ricreerebbe la stessa corruzione strutturale appena
// risolta, un livello piu' in su (un gap a livello di TABELLA invece che
// di riga, ugualmente non valido per lo schema: table accetta solo
// righe). Nessuna riga vicina => return false, lascia il comportamento
// nativo di prosemirror-tables (uscita dalla tabella) invariato.
//
// Chiamata solo da ArrowLeft/ArrowRight, stesso motivo di
// exitCellBoundary: Up/Down restano alla STESSA colonna (comportamento
// nativo di prosemirror-tables, mai "prima/ultima cella della riga
// adiacente" come qui) - fuori scopo anche per questa funzione.
export function exitRowBoundary(editor: Editor, dir: 'before' | 'after'): boolean {
  const { selection, doc } = editor.state;
  if (!selection.empty) return false;
  const $from = selection.$from;
  const cellDepth = findCellAncestorDepth($from);
  if (cellDepth === null) return false;
  if (!isAtBoxBoundary(doc, $from, cellDepth, dir === 'before' ? 'start' : 'end')) return false;

  const cellBoundaryPos = dir === 'before' ? $from.before(cellDepth) : $from.after(cellDepth);
  const $cellBoundary = doc.resolve(cellBoundaryPos);
  const neighborCell = dir === 'before' ? $cellBoundary.nodeBefore : $cellBoundary.nodeAfter;
  if (neighborCell && isTableCell(neighborCell)) return false;

  const rowDepth = cellDepth - 1;
  const rowBoundaryPos = dir === 'before' ? $from.before(rowDepth) : $from.after(rowDepth);
  const $rowBoundary = doc.resolve(rowBoundaryPos);
  const neighborRow = dir === 'before' ? $rowBoundary.nodeBefore : $rowBoundary.nodeAfter;
  if (!neighborRow || !isTableRow(neighborRow)) return false;

  if (!(landOrDive(doc, rowBoundaryPos, dir) instanceof TextBoxEdgeCursor)) return false;

  return editor
    .chain()
    .command(({ tr }) => {
      tr.setSelection(landOrDive(tr.doc, rowBoundaryPos, dir));
      return true;
    })
    .scrollIntoView()
    .run();
}

// Confine ASSOLUTO della tabella (richiesta 2026-08-06): quando
// exitRowBoundary sopra fallisce perche' non c'e' NE' una cella vicina
// nella riga NE' una riga vicina - siamo alla prima cella/prima colonna
// con dir 'before', o all'ultima cella/ultima colonna con dir 'after', il
// vero bordo esterno della tabella, non un confine interno gia' coperto
// da exitCellBoundary/exitRowBoundary - il cursore esce dalla tabella
// verso il paragrafo immediatamente prima/dopo, creandolo se non esiste.
// Funzione volutamente SEPARATA da exitRowBoundary (mai un ramo al suo
// interno): quella resta invariata, ritorna false esattamente come prima
// - questa va provata DOPO di lei, da entrambi i punti che oggi
// concatenano exitBoxBoundary || exitCellBoundary || exitRowBoundary
// (createEdgeAwareKeyboardShortcuts in tiptapBlocks.tsx, ed exitArrow
// sotto in questo stesso file).
//
// Guardie iniziali E doppio controllo "nessuna cella/riga vicina"
// duplicati da exitRowBoundary invece di fattorizzati - stesso motivo
// gia' spiegato li' (righe sopra, "guardia esplicita ripetuta"): questa
// funzione deve restare autosufficiente se chiamata isolatamente da un
// punto diverso della catena, esattamente come le altre in questo file.
//
// Ramo "vicino gia' esistente" attivo per QUALUNQUE neighborBlock, non
// solo un textblock (bug 2026-08-06, corruzione "due tabelle consecutive,
// senza paragrafo fra loro": isTextblock e' false anche per un'ALTRA
// tabella adiacente, quindi il vecchio controllo ci faceva cadere nel
// ramo inserimento come se non ci fosse nulla, inserendo un paragrafo
// indesiderato FRA le due tabelle invece di saltare dentro la seconda) -
// Selection.near sa gia' attraversare qualunque tipo di nodo per trovare
// la prima posizione cursore valida, textblock o no, quindi il controllo
// di tipo era ridondante oltre che sbagliato: l'unico caso che deve
// davvero inserire un nuovo paragrafo e' neighborBlock === null (nessun
// nodo li', vero bordo assoluto del documento).
//
// Ramo inserimento: stesso identico schema di Enter (withCursor,
// addKeyboardShortcuts sotto) - tr.insert(pos, paragraph.create()) poi
// Selection.near(tr.doc.resolve(pos + 1)), risolvendo la posizione SUL
// DOCUMENTO DOPO L'INSERT (tr.doc, non il `doc` di editor.state catturato
// prima della transazione) - pos+1 e' valida per costruzione (un
// paragrafo vuoto appena inserito ha una sola posizione cursore, il suo
// interno) a prescindere da dir: l'inserimento avviene sempre esattamente
// a `tablePos`, mai altrove, quindi non serve alcun mapping ulteriore ne'
// per dir 'before' ne' per dir 'after'.
//
// Bordo assoluto DI UN INTERO CONTENITORE (tabella o row documentale) nel
// SUO genitore - a containerPos, riusa il vicino gia' li' se c'e' (Selection.
// near, bias coerente con dir), altrimenti inserisce un paragrafo vuoto e ci
// entra. Estratta dal ramo finale di exitTableBoundary sotto (il primo, Fase
// 3 originale) per essere riusata identica sia dalla coda invariata di
// exitTableBoundary stessa (tabella NON dentro una row) sia dal nuovo ramo
// Fase 3b (tabella dentro una row, senza fratello di row sul lato richiesto
// - li' containerPos e' il bordo della ROW, non della tabella) sia dalla
// coda di exitRowDocumentBoundary sotto (Fase 3a, row senza fratello): le
// tre situazioni condividono esattamente questo stesso identico calcolo,
// cambia solo QUALE contenitore e QUALE posizione viene passata.
//
// Ramo "vicino gia' esistente" attivo per QUALUNQUE neighborBlock, non solo
// un textblock (bug 2026-08-06, corruzione "due tabelle consecutive, senza
// paragrafo fra loro" - isTextblock era false anche per un'ALTRA tabella
// adiacente, facendo cadere nel ramo inserimento come se non ci fosse
// nulla): Selection.near sa gia' attraversare qualunque tipo di nodo per
// trovare la prima posizione cursore valida - l'unico caso che deve davvero
// inserire un nuovo paragrafo e' neighborBlock === null.
function jumpOrInsertAtContainerBoundary(editor: Editor, containerPos: number, dir: 'before' | 'after'): boolean {
  const { doc } = editor.state;
  const $boundary = doc.resolve(containerPos);
  const neighborBlock = dir === 'before' ? $boundary.nodeBefore : $boundary.nodeAfter;

  if (neighborBlock) {
    return editor
      .chain()
      .command(({ tr }) => {
        tr.setSelection(Selection.near(tr.doc.resolve(containerPos), dir === 'after' ? 1 : -1));
        return true;
      })
      .scrollIntoView()
      .run();
  }

  return editor
    .chain()
    .command(({ tr }) => {
      tr.insert(containerPos, editor.schema.nodes.paragraph.create());
      tr.setSelection(Selection.near(tr.doc.resolve(containerPos + 1)));
      return true;
    })
    .scrollIntoView()
    .run();
}

// Ramo "vicino gia' esistente": bias di Selection.near coerente con dir,
// stesso segno gia' usato da landOrDive sopra (dir==='after' ? 1 : -1) -
// uscendo a destra (after) si cerca in avanti, atterrando all'INIZIO del
// paragrafo dopo la tabella; uscendo a sinistra (before) si cerca
// all'indietro, atterrando alla FINE del paragrafo prima della tabella
// (mai a ridosso del bordo tabella dal lato sbagliato).
//
// Fase 3b - tabella come fratello diretto di una row (piano confermato
// 2026-08-08): subito dopo aver calcolato tablePos, controllo esplicito se
// il genitore DIRETTO della tabella e' una row (rowDepth === tableDepth-1,
// stesso schema "verifica esplicita, mai solo trovata da qualche parte
// sopra" gia' usato da exitRowDocumentBoundary sotto per lo stesso motivo -
// una CELLA come genitore diretto, con una row piu' in alto oltre di lei,
// non deve mai far scattare questo ramo). Se vero, delega interamente ai
// due casi gia' pronti invece di reinventarli:
// - pauseAtIsolatingBoundary(tablePos): se c'e' un vero fratello di row li',
//   la tabella (isolating, come un box) pausa prima di attraversarlo -
//   colma per la tabella lo stesso gap gia' risolto per i box in Fase 3a
//   (li' era exitBoxBoundary a tuffarsi dritto verso un paragrafo fratello;
//   qui senza questo ramo exitTableBoundary farebbe la stessa cosa, vedi
//   il vecchio ramo "neighborBlock" sotto che non distingueva affatto un
//   fratello di row da un blocco qualunque a livello documento).
// - altrimenti (nessun fratello di row su questo lato): il vero bordo
//   assoluto e' quello della ROW, non della tabella - bug confermato dal
//   vivo 2026-08-08 (harness, addElementBeside('table')): il vecchio ramo
//   sotto, ignaro della row, inseriva il nuovo paragrafo a tablePos, una
//   posizione che qui e' DENTRO il contenuto della row (terzo figlio),
//   invece che fuori. jumpOrInsertAtContainerBoundary richiamata sul bordo
//   della ROW (rowPos, non tablePos) risolve correttamente sia il riuso di
//   un vicino esistente sia l'inserimento, esattamente come gia' fa
//   exitRowDocumentBoundary sotto per lo stesso identico bordo.
//
// Se il genitore diretto NON e' una row (oggi l'unico caso, tabella a
// livello documento o dentro una cella/box), il comportamento sotto resta
// ESATTAMENTE quello di sempre - stessa jumpOrInsertAtContainerBoundary,
// stesso tablePos, nessuna differenza osservabile.
export function exitTableBoundary(editor: Editor, dir: 'before' | 'after'): boolean {
  const { selection, doc } = editor.state;
  if (!selection.empty) return false;
  const $from = selection.$from;
  const cellDepth = findCellAncestorDepth($from);
  if (cellDepth === null) return false;
  if (!isAtBoxBoundary(doc, $from, cellDepth, dir === 'before' ? 'start' : 'end')) return false;

  const cellBoundaryPos = dir === 'before' ? $from.before(cellDepth) : $from.after(cellDepth);
  const $cellBoundary = doc.resolve(cellBoundaryPos);
  const neighborCell = dir === 'before' ? $cellBoundary.nodeBefore : $cellBoundary.nodeAfter;
  if (neighborCell && isTableCell(neighborCell)) return false;

  const rowDepth = cellDepth - 1;
  const rowBoundaryPos = dir === 'before' ? $from.before(rowDepth) : $from.after(rowDepth);
  const $rowBoundary = doc.resolve(rowBoundaryPos);
  const neighborRow = dir === 'before' ? $rowBoundary.nodeBefore : $rowBoundary.nodeAfter;
  if (neighborRow && isTableRow(neighborRow)) return false;

  const tableDepth = findTableAncestorDepth($from);
  if (tableDepth === null) return false;
  const tablePos = dir === 'before' ? $from.before(tableDepth) : $from.after(tableDepth);

  const docRowDepth = findDocRowAncestorDepth($from);
  if (docRowDepth === tableDepth - 1) {
    if (pauseAtIsolatingBoundary(editor, tablePos, dir, 'horizontal')) return true;
    const rowPos = dir === 'before' ? $from.before(docRowDepth) : $from.after(docRowDepth);

    // FIX 2026-08-12 (bug preesistente dell'8 agosto, segnalato oggi): senza
    // fratello di row su questo lato, una tabella dentro una row saltava
    // dritto a jumpOrInsertAtContainerBoundary SENZA MAI pausare prima,
    // nemmeno alla prima pressione - a differenza della row stessa
    // (exitRowDocumentBoundary sotto), che dal fix di oggi pausa sempre
    // prima di materializzare. Stesso identico pattern qui: prova prima
    // pauseAtIsolatingBoundary(rowPos) per un vero vicino a livello
    // documento; se assente, landOrDive con gli stessi due meta
    // (ROW_PAUSE_WRAPPED_META/DIR_META) che exitRowDocumentBoundary ora
    // imposta, cosi' Invio da questa pausa materializza correttamente
    // invece di rientrare nella row (stesso bug li' gia' risolto oggi).
    // Nessuna guardia aggiuntiva serve per "seconda pressione da qui non
    // deve fare nulla": la pausa nasce esattamente a rowPos, adiacente alla
    // STESSA row - la guardia isDocRow gia' in testa a
    // exitRowDocumentBoundary la riconosce e la blocca da sola, nessuna
    // duplicazione necessaria.
    if (pauseAtIsolatingBoundary(editor, rowPos, dir, 'horizontal')) return true;
    const rowWrapped = measureRowWrap(editor, rowPos);
    return editor
      .chain()
      .command(({ tr }) => {
        tr.setSelection(landOrDive(tr.doc, rowPos, dir));
        tr.setMeta(ROW_PAUSE_WRAPPED_META, rowWrapped);
        tr.setMeta(ROW_PAUSE_DIR_META, dir);
        tr.setMeta(ROW_PAUSE_AXIS_META, 'horizontal');
        return true;
      })
      .scrollIntoView()
      .run();
  }

  return jumpOrInsertAtContainerBoundary(editor, tablePos, dir);
}

// Confine ASSOLUTO di una row documentale (Fase 3a, gemella di
// exitTableBoundary sopra) - quando exitFlexSiblingBoundary fallisce
// perche' l'item e' primo/ultimo figlio della sua row (nessun fratello su
// questo lato), il cursore esce dalla row verso il paragrafo immediatamente
// prima/dopo, creandolo se non esiste - stesso identico schema "riusa
// vicino esistente o inserisci paragrafo" di exitTableBoundary, solo
// applicato a rowDepth invece che a tableDepth.
//
// findFlexItemAncestorDepth (non un check diretto su cellDepth/tableDepth
// come le funzioni sopra): riusa la stessa nozione di "item" gia' usata da
// exitFlexSiblingBoundary, cosi' le due funzioni si dividono esattamente lo
// stesso spazio di casi (fratello presente -> quella, assente -> questa),
// nessuna sovrapposizione ne' buco fra le due.
//
// rowDepth === itemDepth - 1 verificato ESPLICITAMENTE (non solo "trovata
// una row da qualche parte sopra" via findDocRowAncestorDepth da sola):
// se il contenitore diretto dell'item e' una CELLA (non una row), questa
// funzione deve restare silenziosa - quel bordo assoluto e' gia'
// competenza di exitCellBoundary/exitRowBoundary/exitTableBoundary sopra,
// invariate. E' esattamente la guardia che evita la sovrapposizione con
// Fase 3b (tabella dentro una row): verificato dal vivo 2026-08-08 che con
// la tabella dentro una row, dall'interno di una sua cella
// findFlexItemAncestorDepth risolve sempre alla CELLA, mai alla row - qui
// il controllo esplicito su rowDepth e' comunque la difesa a monte, nel
// caso (oggi non riproducibile, ma non impossibile in futuro) in cui
// itemDepth risolvesse diversamente.
// Caso B aggiunto in testa (Fase 2, piano confermato 2026-08-11, Segnalazione
// 2 - "uscire dal bordo assoluto di una row salta sopra invece di restare
// sulla stessa riga"): quando la row non ha alcun vicino reale sul lato
// richiesto, il Caso A sotto crea una PAUSA al bordo della row invece di
// materializzare subito (stesso principio gia' in uso per i box isolati,
// Fase 3a).
//
// REVISIONE 2026-08-12 (richiesta esplicita utente, cambio di design netto
// rispetto alla Fase 2 di stamattina, commit 566fcdc/f1dfe11): la seconda
// pressione della STESSA freccia dalla stessa pausa NON deve materializzare
// ne' saltare sopra la row - MA questo vale solo per la pausa "vicolo
// cieco" (nessun vicino reale sul lato richiesto, il Caso B sopra): li' la
// pausa resta ferma indefinitamente, gli unici modi di procedere sono il
// pulsante di inserimento o Invio (che materializza un paragrafo tramite
// l'handler generico di TextBoxEdgeCursorExtension). Creare una riga sopra/
// sotto con le frecce non e' un comportamento supportato - l'utente la crea
// con Invio, come in un editor di testo standard.
//
// CORREZIONE 2026-08-12 sera (la revisione sopra era stata applicata a
// ENTRAMBI i rami della pausa, non solo al vicolo cieco): quando invece un
// vicino REALE esiste gia' sul lato richiesto (es. il paragrafo garantito
// da TrailingNode dopo l'ultima riga, pausato da pauseAtIsolatingBoundary
// piu' sotto in questa stessa funzione), la seconda pressione DEVE entrare
// in quel vicino - non si sta creando nulla di nuovo, solo spostandosi in
// contenuto che esiste gia', esattamente il comportamento di sempre
// (jumpOrInsertAtContainerBoundary) mai stato in discussione. Le due pause
// sono indistinguibili dal solo controllo isDocRow(row) sopra (vede solo il
// lato "da cui si e' usciti", mai il lato "verso cui si sta andando") -
// serve un controllo separato sul lato opposto: realNeighbor e'
// $pos.nodeBefore/nodeAfter dalla parte di `dir`, il lato che
// pauseAtIsolatingBoundary aveva gia' verificato per decidere se pausare
// qui la prima volta. Se assente, vicolo cieco confermato: return true
// senza transazione (non un semplice no-op silenzioso: questa funzione e'
// raggiunta anche dalla catena di TextBoxEdgeCursorExtension.exitArrow, che
// con `false` qui prosegue fino al proprio fallback Selection.near generico
// - verificato dal vivo 2026-08-12: senza questo `return true` la freccia
// rimbalzava dentro il testo del box invece di restare ferma). Se presente,
// jumpOrInsertAtContainerBoundary(selection.head, dir) - col vicino gia'
// verificato esistente, il suo ramo "insert" non scatta mai qui.
export function exitRowDocumentBoundary(editor: Editor, dir: 'before' | 'after'): boolean {
  const { selection, doc } = editor.state;
  if (!selection.empty) return false;

  if (selection instanceof TextBoxEdgeCursor) {
    const $pos = doc.resolve(selection.head);
    const row = dir === 'before' ? $pos.nodeAfter : $pos.nodeBefore;
    if (!row || !isDocRow(row)) return false;

    const realNeighbor = dir === 'before' ? $pos.nodeBefore : $pos.nodeAfter;
    if (!realNeighbor) return true;
    return jumpOrInsertAtContainerBoundary(editor, selection.head, dir);
  }

  const $from = selection.$from;
  const itemDepth = findFlexItemAncestorDepth($from);
  if (itemDepth === null) return false;
  const rowDepth = findDocRowAncestorDepth($from);
  if (rowDepth !== itemDepth - 1) return false;
  if (!isAtBoxBoundary(doc, $from, itemDepth, dir === 'before' ? 'start' : 'end')) return false;

  const boundaryPos = dir === 'before' ? $from.before(itemDepth) : $from.after(itemDepth);
  const $boundary = doc.resolve(boundaryPos);
  const sibling = dir === 'before' ? $boundary.nodeBefore : $boundary.nodeAfter;
  if (sibling) return false;

  const rowPos = dir === 'before' ? $from.before(rowDepth) : $from.after(rowDepth);

  // AGGIORNATO (round bug 2026-08-11 pomeriggio, "Freccia Destra dall'ultimo
  // elemento scende sotto invece di pausare"): un vicino REALE gia' al bordo
  // assoluto della row NON e' piu' un caso a parte - pauseAtIsolatingBoundary
  // (stessa funzione gia' usata da exitBoxBoundary per i singoli box,
  // Passo 2 di ieri) pausa incondizionatamente verso QUALUNQUE vicino reale
  // che non sia una tabella, qui applicata al bordo della ROW invece che del
  // singolo box - stesso principio "sempre una pausa prima", ora coerente
  // fra box e row. Se fallisce (nessun vicino, o vicino e' una tabella -
  // esclusa anche li', fuori scope), landOrDive sotto copre entrambi i
  // residui: nessun vicino => pausa (comportamento gia' corretto di ieri,
  // invariato); vicino e' una tabella => dive diretto (comportamento
  // pre-esistente, invariato, mai stato contestato).
  if (pauseAtIsolatingBoundary(editor, rowPos, dir, 'horizontal')) return true;

  // FIX 2026-08-12 (scoperto testando la revisione sopra: Invio da questa
  // pausa rientrava nella row invece di materializzare un paragrafo): a
  // differenza di exitBoxBoundary/exitFlexSiblingBoundary sopra, questo ramo
  // impostava la sola selezione senza ROW_PAUSE_DIR_META/WRAPPED_META -
  // enterAtPause (TextBoxEdgeCursorExtension piu' sotto in questo file) legge
  // pauseState.dir per sapere da che lato cercare un vicino "in avanti", ma
  // senza il meta il plugin difetta a 'after' (vedi apply() del plugin,
  // stesso `?? 'after'`) a prescindere dalla direzione REALE con cui si e'
  // usciti - per una pausa creata con dir 'before' questo faceva rientrare
  // enterAtPause nella row stessa (nodeAfter, sempre presente) invece di
  // materializzare verso il vero vicolo cieco. Stesso identico setMeta gia'
  // usato dagli altri tre siti di pausa in questo file.
  const rowWrapped = measureRowWrap(editor, rowPos);

  return editor
    .chain()
    .command(({ tr }) => {
      tr.setSelection(landOrDive(tr.doc, rowPos, dir));
      tr.setMeta(ROW_PAUSE_WRAPPED_META, rowWrapped);
      tr.setMeta(ROW_PAUSE_DIR_META, dir);
      tr.setMeta(ROW_PAUSE_AXIS_META, 'horizontal');
      return true;
    })
    .scrollIntoView()
    .run();
}

// Simmetrica a exitRowDocumentBoundary sopra, ma per l'INGRESSO invece
// dell'uscita (round bug 2026-08-11 pomeriggio, "rientrare nella row da un
// paragrafo esterno con le frecce fa apparire un GapCursor nativo invece di
// una pausa"): tutte le funzioni exit* sopra gestiscono solo l'uscita da
// DENTRO un box/row/cella - nessuna gestisce l'avvicinamento da FUORI, in
// testo normale, verso il bordo di una row vicina. Il fallback nativo di
// ProseMirror di solito basta da solo (verificato dal vivo: row[paragrafo,
// paragrafo], un solo confine isolating da attraversare, funziona gia'
// senza alcun intervento) - ma quando il primo/ultimo figlio della row e'
// esso stesso isolating (TextBox/Collapse, il caso comune per cui esiste
// l'affiancamento), servirebbe attraversare DUE confini isolating in un
// colpo solo per trovare una posizione di testo valida: li' il nativo
// rinuncia e produce un GapCursor invece di una posizione di testo o una
// pausa. Pausa qui SEMPRE che il vicino sia una row, a prescindere dal suo
// contenuto (nessun controllo su cosa c'e' dentro, stesso principio "sempre
// una pausa al bordo" gia' applicato in uscita sopra) - piu' semplice e
// coerente che condizionare la pausa al tipo del figlio, e converge sulla
// STESSA pausa che exitRowDocumentBoundary creerebbe uscendo dalla row
// verso questo stesso paragrafo (stessa rowPos, vista dal lato opposto):
// isReenterableNeighbor (sopra) gia' riconosce la row per la ripresa/
// rientro da li', nessuna duplicazione.
//
// isTable(neighbor) aggiunta (round bug 2026-08-11 sera, "avvicinarsi a una
// tabella dentro una cella scrollata dall'esterno produce lo stesso identico
// GapCursor invisibile"): stesso identico ragionamento della row - una
// tabella con un box isolating come primo/ultimo figlio della sua prima/
// ultima cella richiede anch'essa di attraversare DUE confini isolating
// (tabella + box) per trovare testo valido dall'esterno, il nativo rinuncia
// alla stessa identica maniera. isReenterableNeighbor (sopra) riconosce gia'
// anche la tabella da tempo (Fase 3b, per la ripresa/rientro da una pausa
// gia' creata da exitTableBoundary) - qui serve lo stesso riconoscimento ma
// per la creazione INIZIALE della pausa, avvicinandosi da fuori.
//
// findFlexItemAncestorDepth/findCellAncestorDepth esclusi esplicitamente:
// se $from e' gia' dentro un item di un'altra row o dentro una cella,
// quella situazione e' competenza di exitFlexSiblingBoundary/
// exitCellBoundary/exitRowBoundary/exitTableBoundary sopra (provate PRIMA
// nella catena in tiptapBlocks.tsx) - questa funzione resta silenziosa li',
// mai un tentativo alla cieca su un presupposto gia' di competenza altrui.
// Nessuna esclusione invece per un box ancestor (TextBox/Collapse): una row
// o una tabella annidata dentro il content di un box e' un caso legittimo,
// il confine da controllare e' quello del PROPRIO genitore diretto di
// $from (blockDepth = $from.depth), a qualunque profondita' esso sia -
// generico esattamente come jumpOrInsertAtContainerBoundary sopra, che
// serve gia' documento, TextBox e Collapse senza distinzione.
export function enterRowDocumentBoundary(editor: Editor, dir: 'before' | 'after', axis: 'horizontal' | 'vertical'): boolean {
  const { selection, doc } = editor.state;
  if (!selection.empty) return false;
  // Una pausa gia' attiva e' competenza di exitArrow/adjacentBox
  // (TextBoxEdgeCursorExtension) - selection.empty e' vero anche per una
  // TextBoxEdgeCursor ($anchor===$head), quindi va escluso esplicitamente
  // qui: altrimenti, se mai raggiunta con una pausa gia' attiva (oggi non
  // accade, TextBoxEdgeCursorExtension la intercetta prima - ma questa
  // funzione non deve dipendere da un ordine di registrazione delle
  // estensioni per restare corretta), $from risolverebbe su una posizione
  // gia' di confine, non testo reale.
  if (selection instanceof TextBoxEdgeCursor) return false;
  const $from = selection.$from;
  if (findFlexItemAncestorDepth($from) !== null) return false;
  if (findCellAncestorDepth($from) !== null) return false;

  const blockDepth = $from.depth;
  if (blockDepth === 0) return false;
  // REVISIONE 2026-08-17 sera (stesso bug/stessa cura di exitBoxBoundary,
  // vedi il suo commento per il ragionamento completo): blockDepth qui e'
  // SEMPRE $from.depth, cioe' il paragrafo immediato di $from stesso (mai
  // un contenitore con piu' figli come un box multi-paragrafo) - nessun
  // trade-off residuo per questa funzione, a differenza di
  // exitBoxBoundary/exitRowItemVertical.
  const atBoundary =
    axis === 'vertical'
      ? editor.view.endOfTextblock(dir === 'before' ? 'up' : 'down')
      : isAtBoxBoundary(doc, $from, blockDepth, dir === 'before' ? 'start' : 'end');
  if (!atBoundary) return false;

  const boundaryPos = dir === 'before' ? $from.before(blockDepth) : $from.after(blockDepth);
  const $boundary = doc.resolve(boundaryPos);
  const neighbor = dir === 'before' ? $boundary.nodeBefore : $boundary.nodeAfter;
  if (!neighbor) return false;

  // REVISIONE 2026-08-17 (tabella di verita' Su/Giu' confermata dall'utente):
  // per l'orizzontale il tipo di vicino accettato resta ESATTAMENTE quello
  // di sempre (isDocRow/isTable, invariato - il caso "paragrafo accanto a un
  // box standalone" resta fuori scope per l'orizzontale, mai stato
  // contestato). Per il verticale invece isSideBySideBox si aggiunge ai
  // due: un box ISOLATO (non in una row) affiancato verticalmente a un
  // paragrafo normale e' un altro caso "un solo confine isolating, il
  // nativo dovrebbe farcela" che pero' deve ORA fermarsi in una pausa lo
  // stesso, non perche' il nativo fallisca (qui infatti non fallisce, entra
  // dritto nel box) ma perche' la tabella di verita' lo richiede
  // esplicitamente ("destinazione e' un elemento" vale sempre, non solo
  // quando il nativo si incaglia).
  if (axis === 'horizontal' && !(isDocRow(neighbor) || isTable(neighbor))) return false;
  if (axis === 'vertical' && !(isDocRow(neighbor) || isTable(neighbor) || isSideBySideBox(neighbor))) return false;

  // REVISIONE 2026-08-17: per il verticale la decisione reale-o-fantasma non
  // e' piu' "sempre pausa se il vicino e' del tipo giusto" ne' "sempre salto
  // diretto" (le due revisioni precedenti) - verticalPauseOrJump valuta la
  // destinazione con lo stesso criterio unico usato ovunque nel documento
  // per questo asse (vedi il suo commento sopra). Per l'orizzontale nessun
  // cambiamento: pausa incondizionata come sempre.
  if (axis === 'vertical') {
    return verticalPauseOrJump(editor, boundaryPos, dir);
  }

  return editor
    .chain()
    .command(({ tr }) => {
      tr.setSelection(new TextBoxEdgeCursor(tr.doc.resolve(boundaryPos)));
      tr.setMeta(ROW_PAUSE_AXIS_META, axis);
      return true;
    })
    .scrollIntoView()
    .run();
}

// Va oltre il bordo superiore assoluto della tabella (round 2026-08-07,
// sostituisce il cursore finto TextBoxEdgeCursor introdotto qui il
// 2026-08-06): quando Freccia Su parte dalla riga 0 e sopra non c'e' nulla
// di valido, inserisce un vero paragrafo vuoto e ci entra - stesso identico
// pattern del ramo inserimento di exitTableBoundary sopra (tr.insert +
// Selection.near(pos+1)), non piu' una selezione "finta" pensata per
// sostituire il gapcursor nativo. Il cambio nasce dalla rimozione del
// margin-top riservato su .tableWrapper (theme.css, stesso round): quel
// margine era lo spazio "gratuito" in cui il cursore finto si centrava
// (positionEdgeCursor, ramo tabella rimosso insieme a questa funzione) -
// senza piu' spazio riservato, un cursore "sospeso" senza nulla in cui
// vivere non ha piu' senso ne' concettuale ne' geometrico. Simmetrico solo
// nel nome a exitTableBoundary, non nel comportamento: qui non c'e' un
// parametro dir, la direzione e' unica e fissa (Su) per design esplicito -
// Freccia Giu' dall'ultima riga resta INVARIATA (TrailingNode + comportamento
// nativo attuale, mai toccata da questa funzione).
//
// A differenza di exitTableBoundary (orizzontale, dove il controllo e'
// "nessuna cella/riga vicina", specifico alla colonna 0/ultima), qui il
// controllo e' "siamo nella RIGA 0" a QUALUNQUE colonna - il salto
// nativo riga-sopra/riga-sotto di prosemirror-tables per le righe interne
// resta interamente invariato, fuori scopo qui.
//
// Il discriminante vero - "qui comparirebbe davvero il GapCursor nativo,
// si' o no" - NON e' GapCursor.valid($pos) da solo (bug scoperto dal vivo,
// round 2026-08-06: due tabelle consecutive, Freccia Su dalla riga 0 della
// seconda verso la prima - GapCursor.valid(tablePos) risulta true li'
// isolatamente, ma il nativo REALE non mostra mai un gapcursor in quel
// punto, atterra dentro l'ultima cella della tabella sopra). Il motivo:
// GapCursor.valid risponde "un gap cursor SAREBBE valido qui in astratto",
// ma non tiene conto che prosemirror-tables ha la PRECEDENZA e trova gia'
// una destinazione valida (la stessa Selection.near che usa lui stesso
// internamente, vedi node_modules/prosemirror-tables/dist/index.js,
// funzione arrow()) PRIMA che il gapcursor abbia la possibilita' di
// intervenire - GapCursor.valid non sa nulla di questa corsa fra plugin.
// Questo discriminante resta valido e invariato dal round 2026-08-06: decide
// ancora SE intervenire, cambia solo COME (inserimento invece di cursore
// finto).
//
// Il vero test e' quindi RIPRODURRE esattamente quella stessa chiamata
// (Selection.near(doc.resolve(tablePos), -1), lo stesso bias -1 di
// arrow()) e verificare se il risultato e' una destinazione GENUINAMENTE
// prima della tabella (nativeTarget.from < tablePos, es. dentro un
// paragrafo o un'altra tabella sopra) oppure se Selection.near e'
// "rimbalzato" dentro/dopo la tabella stessa (nessuna posizione valida
// trovata andando indietro, e' questo il segnale vero che il nativo
// fallirebbe e mostrerebbe il gapcursor). GapCursor.valid resta come
// SECONDO controllo, in AND - piu' conservativo, interveniamo solo se
// ENTRAMBI concordano che serve davvero un gap cursor.
export function exitTableTopEdge(editor: Editor): boolean {
  const { selection, doc } = editor.state;
  if (!selection.empty) return false;
  const $from = selection.$from;
  const cellDepth = findCellAncestorDepth($from);
  if (cellDepth === null) return false;
  if (!isAtBoxBoundary(doc, $from, cellDepth, 'start')) return false;

  const rowDepth = cellDepth - 1;
  const tableDepth = findTableAncestorDepth($from);
  if (tableDepth === null) return false;
  if ($from.node(tableDepth).firstChild !== $from.node(rowDepth)) return false;

  const tablePos = $from.before(tableDepth);
  const nativeTarget = Selection.near(doc.resolve(tablePos), -1);
  if (nativeTarget.from < tablePos) return false;
  if (!GapCursor.valid(doc.resolve(tablePos))) return false;

  return editor
    .chain()
    .command(({ tr }) => {
      tr.insert(tablePos, editor.schema.nodes.paragraph.create());
      tr.setSelection(Selection.near(tr.doc.resolve(tablePos + 1)));
      return true;
    })
    .scrollIntoView()
    .run();
}

// Un fratello DOM reale del widget, di QUALUNQUE tipo (non solo TextBox/
// Collapse come la vecchia isBoxElement - allargata in Fase 3a insieme a
// exitFlexSiblingBoundary sopra: da quando il cursore finto puo' nascere
// anche fra un paragrafo/tabella e un box, o fra due box in una row, i
// suoi VERI vicini nel DOM possono essere un <p>, un .tableWrapper, o
// qualunque altro blocco - non piu' solo .tiptap-textbox/.tiptap-collapse).
// L'unico elemento da ESCLUDERE e' un altro cursore finto stesso (mai
// dovrebbe capitare, ma per costruzione e' l'unico widget non-contenuto
// inserito a questo stesso livello) - nessun controllo positivo sul tipo
// serve piu': qualunque cosa non sia il widget e' contenuto reale.
function isRealSiblingElement(el: Element | null): el is HTMLElement {
  return !!el && !el.classList.contains('tiptap-textbox-edge-cursor');
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
//
// Stesso identico ragionamento esteso al container DOCUMENTALE
// (.tiptap-content, bug segnalato dal vivo 2026-08-11): un TextBox/Collapse
// isolato a livello di documento riempie .tiptap-content al 100% (nessun
// margine proprio, verificato dal vivo) esattamente come un box riempie una
// cella - il vero bordo/padding visibile e' pero' su un antenato ANCORA piu'
// esterno (il wrapper con containerClassName in RichTextEditor.tsx, non il
// genitore diretto come per la cella). Estratto in findOuterVisibleBoundary
// sotto invece di un secondo blocco if/else duplicato qui: stessa formula di
// midpoint, cambia solo QUALE elemento fornisce il bordo esterno.
// axis (Fase B, piano navigazione verticale confermato 2026-08-16) RIMOSSO
// come parametro (revisione 2026-08-18, richiesta esplicita - "stesso
// stile sottile gia' in uso per le pause orizzontali, mai piu' una barra
// larga quanto il container"): una pausa verticale rappresenta due blocchi
// IMPILATI, mai sulla stessa riga - sameRow sotto (che confronta
// beforeRect.top/afterRect.top) e' quindi SEMPRE falso per costruzione in
// quel caso, ricade da solo nel ramo "un solo vicino" (a-capo/estremi) gia'
// collaudato per l'orizzontale, senza bisogno di alcun ramo dedicato: la
// stessa lineetta sottile posizionata contro UNO dei due blocchi (quello
// scelto da preferSide) invece di una barra a tutta larghezza fra i due.
function positionEdgeCursor(widget: HTMLElement, preferSide: 'before' | 'after') {
  const container = widget.parentElement;
  if (!container) return;

  const prevEl = widget.previousElementSibling;
  const nextEl = widget.nextElementSibling;
  const siblingBefore = isRealSiblingElement(prevEl) ? prevEl : null;
  const siblingAfter = isRealSiblingElement(nextEl) ? nextEl : null;
  if (!siblingBefore && !siblingAfter) return; // difensivo: per costruzione ce n'e' sempre almeno uno

  const containerRect = container.getBoundingClientRect();
  const beforeRect = siblingBefore?.getBoundingClientRect() ?? null;
  const afterRect = siblingAfter?.getBoundingClientRect() ?? null;

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
    // Centrato sull'ALTEZZA del vicino, non piu' il suo top grezzo (bug
    // 2026-08-18 notte, misurato dal vivo: ~15px "troppo in alto" quando il
    // vicino e' una row-elemento alta per il padding dei box, ~49px, contro
    // i ~19px fissi del widget - height/2 combacia gia' da solo quando il
    // vicino e' una riga di testo normale, quasi identica al widget, quindi
    // nessuna differenza visibile li' rispetto a prima). rect.height e' il
    // vicino REALE (before/afterRect, gia' misurato sopra); l'altezza del
    // widget stesso e' fissata da CSS (.tiptap-textbox-edge-cursor,
    // theme.css) - letta dal vivo invece di ricalcolarla qui per non
    // duplicare quella regola.
    const widgetHeight = widget.getBoundingClientRect().height;
    top = rect.top - containerRect.top + (rect.height - widgetHeight) / 2;

    const outerBoundary = findOuterVisibleBoundary(container);
    if (outerBoundary) {
      const boundaryRect = outerBoundary.getBoundingClientRect();
      const outerEdge = useAfter ? boundaryRect.left : boundaryRect.right;
      const innerEdge = useAfter ? rect.left : rect.right;
      left = (outerEdge + innerEdge) / 2 - containerRect.left;
    } else {
      left = (useAfter ? rect.left : rect.right) - containerRect.left;
    }
  }

  // Clamp finale (round bug 2026-08-11 pomeriggio, "elemento isolato a
  // inizio documento, il cursore SPARISCE"): il ramo "outerBoundary" sopra
  // centra correttamente contro il vero bordo visibile, ma quel bordo puo'
  // essere PIU' esterno di .tiptap-content stesso - verificato dal vivo,
  // .tiptap-content ha overflow-x:auto (theme.css) e zero padding proprio
  // quando il box lo riempie al 100%: il punto medio centrato cade a
  // coordinata NEGATIVA rispetto a .tiptap-content, che lo clippa via
  // (scrollLeft non puo' andare sotto 0 in LTR, scrollIntoView() non ha
  // dove scrollare) - il widget esiste, e' posizionato "correttamente" per
  // la formula, ma e' semplicemente invisibile.
  //
  // SOLO per .tiptap-content e .tiptap-row-flex (bug verificato dal vivo,
  // secondo giro: applicarlo incondizionatamente a QUALUNQUE container
  // rompeva il caso cella di tabella - .tiptap-td-flex non ha overflow
  // proprio, ne' .tiptap-td-flex ne' il <td> che lo contiene clippano
  // nulla, quindi un left "negativo rispetto al container" li' e' comunque
  // perfettamente visibile, renderizzato nel padding reale della cella -
  // ESATTAMENTE il punto centrato voluto, non un valore da correggere. Il
  // clamp ha senso solo dove NON esiste un vero padding esterno in cui il
  // widget possa sporgere senza conseguenze.
  //
  // .tiptap-row-flex AGGIUNTO (bug segnalato 2026-08-12 sera, "scrollbar
  // fastidiosa alla 2a pressione uscendo da una row verso un vicino reale"):
  // stessa identica situazione di .tiptap-content, non quella della cella -
  // .tiptap-row (il genitore di .tiptap-row-flex, l'equivalente della <td>)
  // ha zero padding/margine ORIZZONTALE proprio (verificato dal vivo:
  // getBoundingClientRect() di .tiptap-row e .tiptap-row-flex identico
  // byte per byte), quindi findOuterVisibleBoundary non e' la strada giusta
  // qui - non c'e' alcun "vero bordo esterno" piu' largo in cui centrarsi,
  // il bordo vero DEL WIDGET E' il bordo del container stesso. Senza
  // questo clamp, un solo vicino a fine riga produceva left=containerWidth
  // (flush contro il vicino, che riempie la row al 100%): il widget (1px)
  // finiva per intero FUORI da .tiptap-row-flex - siccome quel container ha
  // overflow:visible (nessuna clip propria), l'eccedenza si propagava fino
  // a .tiptap-content, che invece ha overflow-x:auto (theme.css) e mostrava
  // una vera scrollbar orizzontale per 1px di larghezza indesiderata.
  //
  // Aggancio a [0, clientWidth] (il range visibile del container senza
  // scroll dell'utente): sacrifica la centratura perfetta SOLO nel caso
  // limite dove non ci sarebbe comunque spazio vero in cui centrarsi, in
  // cambio della garanzia che il widget non sporga mai fuori dal container.
  // Nessuna resa visiva speciale quando il clamp ha effetto (round
  // 2026-08-13 mattina: rettangolo asimmetrico compensativo, rimosso lo
  // stesso giorno pomeriggio su richiesta esplicita - il cursore finto resta
  // SEMPRE la sottile lineetta di 1px standard, anche quando il clamp lo
  // tiene al bordo invece che al vero centro geometrico).
  if (container.classList.contains('tiptap-content') || container.classList.contains('tiptap-row-flex')) {
    const maxLeft = Math.max(0, container.clientWidth - 1);
    left = Math.min(Math.max(left, 0), maxLeft);
  }

  widget.style.position = 'absolute';
  widget.style.top = `${top}px`;
  widget.style.left = `${left}px`;
}

// Estratta da positionEdgeCursor sopra (bug segnalato dal vivo 2026-08-11,
// "elemento isolato senza vicini, cursore finto non centrato"): il ramo "un
// solo vicino" centrava gia' correttamente contro il vero bordo VISIBILE
// quando quel bordo e' su un antenato diverso dal container immediato (caso
// cella di tabella, sotto), ma trattava OGNI altro container come se il
// proprio bordo fosse gia' quello vero (flush, 0px) - vale per
// .tiptap-textbox-content/.tiptap-collapse-body (nessun padding proprio, il
// padding visibile e' sul box stesso, gia' incluso nel confronto fra
// vicini), ma NON per .tiptap-content: quello e' l'elemento contenteditable
// nudo, senza il proprio bordo/padding visibile (border+p-3, RichTextEditor.
// tsx, containerClassName sul div scrollContainerRef) - verificato dal vivo,
// un TextBox isolato come UNICO figlio del documento riempie .tiptap-content
// al 100% (nessun margine proprio), quindi "flush contro .tiptap-content"
// coincideva ESATTAMENTE con "flush contro il box": il widget finiva
// incollato al box con TUTTO il respiro visibile del pannello (12px+bordo,
// misurato) spinto su un solo lato, invece che diviso a meta' come un caret
// nativo.
//
// container.parentElement.parentElement (non un selettore di classe, come
// per .tiptap-td-flex sopra): a differenza della cella di tabella, il
// wrapper con bordo/padding visibile (containerClassName, spesso
// DEFAULT_CONTAINER_CLASS ma sovrascrivibile dal chiamante - RichTextEditor.
// tsx riga ~892 - quindi NON identificabile per nome di classe fisso) non e'
// il genitore diretto di .tiptap-content ma il suo NONNO: EditorContent
// (libreria @tiptap/react) interpone un proprio div senza classe fra il
// wrapper e l'elemento contentEditable - struttura verificata dal vivo via
// ispezione DOM (tiptap-content -> div anonimo -> scrollContainerRef
// bordato). Se quella struttura manca per qualche motivo (nessun nonno),
// null fa degradare al ramo flush precedente invece di un crash - stesso
// principio difensivo gia' in uso altrove in questo file.
function findOuterVisibleBoundary(container: HTMLElement): HTMLElement | null {
  if (container.classList.contains('tiptap-td-flex')) return container.parentElement;
  if (container.classList.contains('tiptap-content')) return container.parentElement?.parentElement ?? null;
  return null;
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
// ROW_PAUSE_AXIS_META (Fase B, piano navigazione verticale confermato
// 2026-08-16): quale ASSE di frecce ha creato la pausa - 'vertical' per le
// pause raggiunte da Su/Giu' (exitBoxBoundary ramo isDocRow, o
// enterRowDocumentBoundary chiamata da ArrowUp/Down dopo la Fase D),
// 'horizontal' per tutte le altre (Sinistra/Destra, sempre state l'unico
// asse fino a ieri). Serve a positionEdgeCursor (sotto) per scegliere fra
// barra verticale sottile (orizzontale, invariata) e barra orizzontale
// larga quanto il container (verticale, nuova) - la vecchia barra verticale
// comunicava male "sei fra due righe impilate" quando riusata cosi' com'era
// per le pause raggiunte in verticale.
const ROW_PAUSE_AXIS_META = 'textBoxEdgeCursorRowAxis';

// `confirmed` invece di due valori 'natural'/'corrected' fissi (versione
// precedente, bug 2026-08-05 "funziona solo in avanti"): quale RESA
// visiva (riga corrente vs. riga del box adiacente) corrisponde a
// "confermato" dipende dalla direzione (vedi commento sopra) - la
// derivazione e' in view() sotto, non qui: questo stato traccia solo il
// FATTO "l'utente ha gia' premuto una seconda volta", non il suo
// significato visivo.
type EdgeCursorRowPauseState = {
  pos: number;
  dir: 'before' | 'after';
  wrapped: boolean;
  confirmed: boolean;
  axis: 'horizontal' | 'vertical';
} | null;

// PluginKey tipizzata (non anonima come le altre in questo file): serve a
// leggere lo stato da fuori il plugin stesso, dentro exitArrow
// (addKeyboardShortcuts sotto), per decidere se questa pressione deve
// solo confermare la pausa o puo' gia' procedere (rientro nel box o
// prosecuzione oltre).
const textBoxEdgeCursorPluginKey = new PluginKey<EdgeCursorRowPauseState>('textBoxEdgeCursor');

// Posizione di inserimento condivisa fra addElementBeside (tiptapRow.ts,
// Caso 1b-bis) e handleTextInput/handlePaste sotto (bug segnalato dal vivo
// 2026-08-13, "digitare/incollare alla pausa del bordo assoluto di una row
// crea un paragrafo fratello invece di affiancarsi dentro la row, come fa
// gia' correttamente il pulsante"): STESSA regola in entrambi i casi, "se il
// vicino della pausa e' la row stessa (prima o dopo), il nuovo elemento va
// DENTRO quella row, mai in una row-wrapper aggiuntiva a livello documento" -
// vedi Caso 1b-bis in tiptapRow.ts per la storia completa del perche' questa
// regola esiste. Qui vive in tiptapTextBoxEdgeCursor.ts (non in tiptapRow.ts,
// che gia' dipende da questo file, mai il contrario - vedi commento
// sull'import di TextBoxEdgeCursor li') cosi' sia addElementBeside sia
// handleTextInput/handlePaste possono chiamarla senza dipendenza circolare.
// Costruzione del nodo lasciata al chiamante (un box vuoto per il pulsante,
// un paragrafo con testo/marchi gia' dentro per la digitazione/incolla) -
// solo il CALCOLO della posizione e' condiviso, l'ESITO no. Ritorna la
// posizione DENTRO il nodo appena inserito (per costruire li' la selezione
// successiva), o null se ne' before ne' after e' una row: in quel caso il
// chiamante deve ricadere sul proprio comportamento di sempre.
// I 4 tipi di nodo che lo schema accetta come figlio di una row (stessi di
// RowElementType in tiptapRow.ts, qui pero' serve verificare un nodo GIA'
// ESISTENTE invece di costruirne uno nuovo) - usata da mergeAtBackspace
// (tiptapRow.ts, cursore reale) ed EXTENSIONS Backspace sotto (pausa) per
// escludere un vicino che NON e' mai stato pensato per stare in una row
// (es. un elenco puntato o una citazione, entrambi nello schema ma nel
// gruppo 'block' e basta, mai 'rowItem'): schema.nodes.row.create
// lancerebbe un errore se tentato con un figlio del genere, quindi va
// verificato PRIMA di costruire il nodo, mai a occhi chiusi. Vive qui
// (spostata da tiptapRow.ts, round Backspace-da-pausa 2026-08-16) perche'
// serve a ENTRAMBI i punti d'ingresso di Backspace-unisce-blocchi - cursore
// reale (tiptapRow.ts, che gia' dipende da questo file) e pausa
// (TextBoxEdgeCursorExtension, sotto) - mai il contrario, stessa direzione
// di dipendenza a senso unico gia' in vigore per stripRowGrow/
// insertRowItemBesideRow.
const ROW_ITEM_TYPE_NAMES = ['paragraph', 'textBox', 'collapseBlock', 'table'];

export function isRowItemEligible(node: ProseMirrorNode): boolean {
  return ROW_ITEM_TYPE_NAMES.includes(node.type.name);
}

// Sostituisce l'intero range dato con una row nuova i cui figli sono
// leftNodes+rightNodes concatenati - nucleo condiviso di TUTTI i casi di
// Backspace-unisce-blocchi (blocco standalone+standalone, row+standalone in
// entrambi gli ordini, row+row), da ENTRAMBI i punti d'ingresso (cursore
// reale in mergeAtBackspace/tiptapRow.ts, pausa in
// TextBoxEdgeCursorExtension sotto) - stesso identico schema "un solo
// tr.replaceWith + posizione calcolata direttamente su tr.doc" gia' usato da
// splitRowAtPause sopra e dal Caso 1b di addElementBeside (tiptapRow.ts) -
// mai piu' step separati con mapping, che costringerebbero a rimappare le
// posizioni fra uno step e l'altro. Spostata qui (round Backspace-da-pausa
// 2026-08-16, stesso motivo di isRowItemEligible sopra) da tiptapRow.ts, che
// la importa invece di definirla.
//
// Cursore al PUNTO DI GIUNZIONE fra i due gruppi (fine dell'ultimo nodo di
// leftNodes, bias -1) in tutti i casi - convenzione standard di Backspace:
// il cursore torna esattamente al bordo appena "attraversato", pronto a
// continuare a cancellare all'indietro nel contenuto che era gia' li'
// prima, mai dentro il contenuto che si e' appena unito da destra.
//
// trailingSibling opzionale (round Backspace-esce-solo-il-primo-elemento,
// piano confermato 2026-08-17): quando la row da cui si sta uscendo aveva
// altri elementi oltre a quello che si sta unendo (mergeAtBackspace Caso
// 3/4, o l'equivalente da pausa in backspaceAtPause sotto - vedi li' per il
// perche' solo il PRIMO elemento della row-sotto partecipa al merge), quel
// "resto" (gia' costruito dal chiamante via buildRowGroup sopra) va inserito
// SUBITO DOPO la row appena unita, non prima ne' dentro - stesso schema
// `Fragment.fromArray` gia' usato da splitRowAtPause per il caso duale
// (spaccare una row in due). Retrocompatibile: senza questo argomento il
// comportamento e' identico a prima (un solo nodo `rowNode` al posto del
// range), i tre punti d'ingresso che non lo passano (Caso 1/2 di
// mergeAtBackspace, e il ramo "before e' standalone" di backspaceAtPause)
// restano invariati.
export function combineIntoRow(
  tr: Transaction,
  schema: Schema,
  range: { from: number; to: number },
  leftNodes: ProseMirrorNode[],
  rightNodes: ProseMirrorNode[],
  trailingSibling?: ProseMirrorNode
) {
  const rowNode = schema.nodes.row.create(null, [...leftNodes, ...rightNodes]);
  tr.replaceWith(range.from, range.to, trailingSibling ? Fragment.fromArray([rowNode, trailingSibling]) : rowNode);
  const leftSize = leftNodes.reduce((sum, node) => sum + node.nodeSize, 0);
  const joinPos = range.from + 1 + leftSize;
  tr.setSelection(TextSelection.near(tr.doc.resolve(joinPos), -1));
}

// Azzera rowGrow (torna a crescita automatica uniforme) se presente - un
// nodo che lascia il contesto row a cui il suo rowGrow era relativo (o che
// entra a far parte di un gruppo di fratelli diverso da quello originale)
// non deve portarsi dietro un valore ormai senza significato. Estratta a
// livello di modulo ed esportata (round Backspace-unisce-blocchi, piano
// confermato 2026-08-15) - prima viveva solo dentro splitRowAtPause sotto,
// ora riusata anche da mergeAtBackspace (tiptapRow.ts) per lo stesso
// identico motivo, evitando una seconda copia che potrebbe divergere.
export function stripRowGrow(node: ProseMirrorNode): ProseMirrorNode {
  return node.attrs.rowGrow != null ? node.type.create({ ...node.attrs, rowGrow: null }, node.content, node.marks) : node;
}

// Dissolvi/mantieni un gruppo di rowItem a seconda di quanti ne restano -
// row nuova (stessi rowGrow relativi fra i superstiti, ancora validi: sono
// lo stesso sottoinsieme di prima, vedi stripRowGrow sopra per il perche' un
// SOLO superstite invece va spogliato) se ne restano almeno 2, altrimenti un
// blocco standalone. Estratta (round Backspace-esce-solo-il-primo-elemento,
// piano confermato 2026-08-17) dalla `buildGroup` locale che viveva solo
// dentro splitRowAtPause sotto - la stessa identica decisione serve ora
// anche a mergeAtBackspace (tiptapRow.ts, Caso 3/4) e a backspaceAtPause
// (sotto) per il "resto" della row da cui Backspace estrae un solo elemento,
// evitando una seconda copia che potrebbe divergere. Mai chiamata con un
// array vuoto: chi la chiama estrae sempre `.slice(1)` da una row che per
// vincolo di schema ('rowItem{2,}') ha gia' almeno 2 figli, quindi il resto
// ha sempre almeno 1 elemento.
export function buildRowGroup(schema: Schema, nodes: ProseMirrorNode[]): ProseMirrorNode {
  return nodes.length >= 2 ? schema.nodes.row.create(null, Fragment.fromArray(nodes)) : stripRowGrow(nodes[0]);
}

export function insertRowItemBesideRow(
  tr: Transaction,
  gapPos: number,
  before: ProseMirrorNode | null,
  after: ProseMirrorNode | null,
  rowType: NodeType,
  node: ProseMirrorNode
): number | null {
  if (before && before.type === rowType) {
    const insertAt = gapPos - 1; // dentro `before`, dopo il suo ultimo figlio
    tr.insert(insertAt, node);
    return insertAt + 1;
  }
  if (after && after.type === rowType) {
    const insertAt = gapPos + 1; // dentro `after`, prima del suo primo figlio
    tr.insert(insertAt, node);
    return insertAt + 1;
  }
  return null;
}

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
            const metaDir = tr.getMeta(ROW_PAUSE_DIR_META) as 'before' | 'after' | undefined;
            const metaAxis = tr.getMeta(ROW_PAUSE_AXIS_META) as 'horizontal' | 'vertical' | undefined;
            // Stessa posizione NON basta piu' da sola (bug 2026-08-18,
            // segnalato dal vivo: "Giu' da un ghost gia' fermo su Riga1 non
            // fa nulla"): quando il bordo assoluto del documento coincide
            // per due pause create da assi/direzioni diverse (qui: la pausa
            // orizzontale di 'prima' e quella verticale di 'dopo' atterrano
            // ENTRAMBE su pos 0, non essendoci altro bordo possibile),
            // questo ramo scambiava la nuova pausa per una riconferma della
            // vecchia e ne ignorava silenziosamente il meta dir/axis appena
            // scritto da verticalPauseOrJump - il cursore restava "congelato"
            // sul dir/axis originale per sempre, tasto morto ad ogni
            // pressione successiva. meta assente (undefined, es. la sola
            // transazione ROW_PAUSE_ADVANCE_META del ramo wrapped sotto, che
            // non tocca DIR/AXIS_META) conta come "nessun conflitto", non
            // "cambiato" - la riconferma del wrap resta invariata.
            const samePause =
              value &&
              value.pos === sel.head &&
              (metaDir === undefined || metaDir === value.dir) &&
              (metaAxis === undefined || metaAxis === value.axis);
            if (samePause) {
              return tr.getMeta(ROW_PAUSE_ADVANCE_META) ? { ...value, confirmed: true } : value;
            }
            const dir = metaDir ?? 'after';
            const wrapped = tr.getMeta(ROW_PAUSE_WRAPPED_META) === true;
            const axis = metaAxis ?? 'horizontal';
            return { pos: sel.head, dir, wrapped, confirmed: false, axis };
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

          // Digitazione alla pausa (bug segnalato dal vivo 2026-08-13,
          // "va nella riga sopra/sotto invece che dentro la row"):
          // Selection.replace()/tr.replaceRange() (percorso nativo, mai
          // toccato qui) non sa nulla della regola "il vicino della pausa e'
          // una row intera, il nuovo contenuto va dentro di essa" - la
          // conosce solo addElementBeside (Caso 1b-bis, tiptapRow.ts).
          // handleTextInput e' il punto ProseMirror pensato esattamente per
          // intercettare la digitazione PRIMA che il percorso nativo la
          // gestisca (verificato nel sorgente, prosemirror-view: l'handler
          // keypress consulta questo prop ogni volta che la selezione NON e'
          // una TextSelection, esattamente il caso di TextBoxEdgeCursor,
          // PRIMA di ricadere su tr.insertText). Guardia in testa identica
          // alle altre in questo file: se la selezione non e' la nostra
          // pausa, false immediato, zero costo/interferenza sul percorso
          // comune (digitazione normale altrove nel documento).
          //
          // insertRowItemBesideRow ritorna null quando ne' before ne' after
          // e' una row (es. pausa verso un box isolato, o vero vicolo cieco
          // senza alcun vicino) - in quei casi si ritorna false: il
          // comportamento nativo (Selection.replace) resta l'unico applicato,
          // esattamente come per il caso di controllo gia' funzionante
          // (pausa fra due item della stessa row, dove il vicino e' un box,
          // non una row).
          //
          // text sempre non vuoto per costruzione in questo punto di innesco
          // (keypress, event.charCode gia' verificato troncante a monte da
          // ProseMirror) - il controllo esplicito resta comunque, difensivo
          // allo stesso modo delle altre guardie in questo file: schema.text
          // lancia se chiamato con stringa vuota.
          handleTextInput(view, _from, _to, text) {
            if (!text) return false;
            const { state } = view;
            const { selection, schema } = state;
            if (!(selection instanceof TextBoxEdgeCursor)) return false;
            const rowType = schema.nodes.row;
            if (!rowType) return false;

            const gapPos = selection.head;
            const $gap = state.doc.resolve(gapPos);
            const paragraph = schema.nodes.paragraph.create(null, schema.text(text));
            const tr = state.tr;
            const insertAt = insertRowItemBesideRow(tr, gapPos, $gap.nodeBefore, $gap.nodeAfter, rowType, paragraph);
            if (insertAt == null) return false;

            tr.setSelection(TextSelection.near(tr.doc.resolve(insertAt + paragraph.content.size)));
            view.dispatch(tr.scrollIntoView());
            return true;
          },

          // Incolla alla pausa - stessa identica regola di handleTextInput
          // sopra, ma handlePaste e' un hook COMPLETAMENTE separato in
          // prosemirror-view (doPaste non consulta mai handleTextInput):
          // senza questo, incollare testo alla pausa continuerebbe a produrre
          // lo stesso bug anche dopo il fix sopra. Ristretto al caso comune
          // (slice con un solo blocco testuale, es. una frase/parola copiata
          // - childCount 1 e isTextblock) - uno slice con piu' blocchi
          // (incolla multi-paragrafo) resta fuori scope, ricade sul
          // comportamento nativo di sempre: nessuna regressione li', solo non
          // esteso. single.content (non testo semplice ricostruito a mano)
          // preserva i marchi (grassetto/corsivo) eventualmente copiati.
          handlePaste(view, _event, slice) {
            const { state } = view;
            const { selection, schema } = state;
            if (!(selection instanceof TextBoxEdgeCursor)) return false;
            if (slice.content.childCount !== 1) return false;
            const single = slice.content.firstChild;
            if (!single || !single.isTextblock) return false;
            const rowType = schema.nodes.row;
            if (!rowType) return false;

            const gapPos = selection.head;
            const $gap = state.doc.resolve(gapPos);
            const paragraph = schema.nodes.paragraph.create(null, single.content);
            const tr = state.tr;
            const insertAt = insertRowItemBesideRow(tr, gapPos, $gap.nodeBefore, $gap.nodeAfter, rowType, paragraph);
            if (insertAt == null) return false;

            tr.setSelection(TextSelection.near(tr.doc.resolve(insertAt + paragraph.content.size)));
            view.dispatch(tr.scrollIntoView().setMeta('paste', true));
            return true;
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

              // REVISIONE 2026-08-18 (glitch visivo segnalato dal vivo, "Su
              // sposta il cursore fantasma di pochi pixel in GIU'"): il
              // margin-top della regola base sotto compensa il padding
              // interno di un BOX (scarto fra il suo bordo esterno, dove
              // punta il `top` calcolato in JS, e l'inizio del testo dentro
              // di esso) - corretto per l'orizzontale, dove il vicino usato
              // per il posizionamento e' quasi sempre un box. Per il
              // verticale (dalla revisione precedente, stesso ramo "un solo
              // vicino" riusato per la lineetta sottile) il vicino e' spesso
              // una row/un paragrafo senza quel padding - applicare comunque
              // il margin-top spinge il widget ~9px piu' in basso del dovuto,
              // percepito come "scende invece di salire". Classe modificatrice
              // minima (SOLO margin-top:0, a differenza della vecchia
              // --axis-vertical che ridefiniva anche width/height per la
              // barra larga, rimossa nella revisione precedente) - la
              // lineetta resta sottile 1px, cambia solo l'allineamento
              // verticale.
              widget.classList.toggle('tiptap-textbox-edge-cursor--axis-vertical', pauseState.axis === 'vertical');

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
    //
    // Salto combinato SOLO per una row (bug segnalato 2026-08-12 sera,
    // "3 pressioni per rientrare invece di 2, asimmetrico rispetto
    // all'uscita"): landOrDive sopra si ferma correttamente sul bordo
    // dell'item estremo quando quello e' esso stesso un box (isSideBySideBox,
    // stessa pausa "un livello alla volta" gia' corretta per navigazione fra
    // item della row o per un box VERO annidato dentro un altro) - ma
    // rientrando in una ROW specificamente quel bordo coincide VISIVAMENTE
    // col bordo della row stessa (nessun bordo/sfondo proprio, .tiptap-row
    // in theme.css), esattamente lo stesso motivo per cui l'uscita
    // (exitBoxBoundary che declina + exitRowDocumentBoundary sopra) salta
    // GIA' in un solo balzo da dentro l'item estremo fino al bordo esterno
    // della row, senza mai fermarsi sul bordo dell'item separatamente.
    // isDocRow(box.node) (non un controllo su innerPos/target) individua
    // esattamente e solo questo caso - box.node e' il vicino su cui
    // adjacentBox si e' fermato per decidere di rientrare, quindi e' la row
    // se e solo se si sta rientrando in una row da fuori (mai per un
    // TextBox/Collapse/Table veri, che restano invariati - stesso comando,
    // stessa pausa "un livello alla volta" di sempre per loro). Se il primo
    // landOrDive NON si e' fermato (item estremo non e' un box, es. un
    // paragrafo o una tabella che landOrDive attraversa gia' da sola) target
    // e' gia' testo reale - nessun salto ulteriore, nessuna differenza dal
    // comportamento di ieri.
    // axis (Fase B, piano navigazione verticale confermato 2026-08-16): se
    // il rientro "un livello alla volta" atterra su un'ALTRA pausa (box
    // annidato dentro il box/row che si sta rientrando - scenario raro ma
    // possibile, es. un TextBox il cui primo figlio e' un altro TextBox),
    // quella nuova pausa va etichettata con lo stesso asse di QUESTO
    // rientro, altrimenti positionEdgeCursor la renderebbe sempre come barra
    // orizzontale (fallback '?? horizontal' del reducer) anche se si e'
    // arrivati li' con Su/Giu'. tr.setMeta incondizionato (non solo quando
    // target e' davvero una TextBoxEdgeCursor): innocuo se target e' una
    // TextSelection reale, il reducer del plugin legge questo meta SOLO
    // quando sel instanceof TextBoxEdgeCursor, stesso principio "nessun
    // controllo extra necessario" gia' in uso altrove in questo file.
    const reenterBox = (
      selection: TextBoxEdgeCursor,
      box: { node: ProseMirrorNode; side: 'before' | 'after' },
      axis: 'horizontal' | 'vertical'
    ) =>
      editor
        .chain()
        .command(({ tr }) => {
          const pos = selection.head;
          const dir: 'before' | 'after' = box.side === 'after' ? 'after' : 'before';
          const innerPos = box.side === 'after' ? pos + 1 : pos - 1;
          let target = landOrDive(tr.doc, innerPos, dir);
          if (isDocRow(box.node) && target instanceof TextBoxEdgeCursor) {
            const deeperPos = dir === 'after' ? innerPos + 1 : innerPos - 1;
            target = landOrDive(tr.doc, deeperPos, dir);
          }
          tr.setSelection(target);
          tr.setMeta(ROW_PAUSE_AXIS_META, axis);
          return true;
        })
        .scrollIntoView()
        .run();

    // axis distingue Left/Right (horizontal) da Up/Down (vertical): sotto,
    // "prosegue oltre" riprova ANCHE exitCellBoundary, ma solo per
    // horizontal - vedi commento su quella riprova per il motivo (stessa
    // ambiguita' 'before'/'after' fra le due coppie di frecce che riguarda
    // gia' exitBoxBoundary li' accanto).
    const exitArrow = (dir: 'before' | 'after', axis: 'horizontal' | 'vertical') =>
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
        // axis aggiunto al controllo (bug 2026-08-18 sera, segnalato dal
        // vivo: "Giu' da una pausa orizzontale in a-capo non fa nulla alla
        // prima pressione"): questa guardia decideva SOLO su pos/dir/
        // wrapped/confirmed, mai sull'asse - ArrowDown condivide lo stesso
        // dir:'after' di ArrowRight (idem ArrowUp/ArrowLeft con 'before'),
        // quindi una pausa ORIZZONTALE con wrapped:true (a-capo reale fra
        // due box della stessa riga) intercettava per errore la PRIMA
        // freccia VERTICALE con lo stesso dir premuta da li': la
        // transazione dispatchata sotto imposta SOLO ROW_PAUSE_ADVANCE_META
        // (nessun tr.setSelection), quindi la selezione non si muove
        // affatto - visibilmente un tasto morto. La freccia verticale
        // finiva cosi' per "consumare" la conferma di un a-capo che non le
        // apparteneva, mai eseguendo la logica verticale sotto; la SECONDA
        // pressione trovava poi `confirmed` gia' vero e proseguiva
        // normalmente, da cui "serve doppia pressione dove prima bastava
        // una". wrapped resta SEMPRE false per qualunque pausa verticale
        // (verticalPauseOrJump la imposta hardcoded, vedi il suo commento),
        // quindi il controllo axis qui sotto non cambia in alcun modo il
        // comportamento gia' collaudato della conferma a-capo orizzontale
        // fra Sinistra/Destra sulla STESSA riga - interviene solo
        // sull'incrocio spurio fra i due assi.
        if (
          pauseState &&
          pauseState.pos === selection.head &&
          pauseState.dir === dir &&
          pauseState.axis === axis &&
          pauseState.wrapped &&
          !pauseState.confirmed
        ) {
          return editor
            .chain()
            .command(({ tr }) => {
              tr.setMeta(ROW_PAUSE_ADVANCE_META, true);
              return true;
            })
            .run();
        }

        // REVISIONE 2026-08-17 (tabella di verita' Su/Giu', punto 4 - "da
        // una pausa gia' attiva, Su/Giu' valuta la riga ANCORA oltre con la
        // stessa regola"): per l'asse verticale NON si rientra MAI nel box/
        // row adiacente (a differenza dell'orizzontale sotto, dove premere
        // "verso" il box e' proprio la richiesta di entrarci) - la pausa
        // esiste qui SOLO perche' quel vicino e' un elemento, entrarci
        // violerebbe la regola appena applicata per crearla. Si valuta
        // invece il prossimo confine con lo stesso identico criterio
        // (verticalPauseOrJump), permettendo di scorrere attraverso piu'
        // righe-elemento consecutive senza mai fermarsi dentro:
        // - stessa direzione di quella che ha creato QUESTA pausa
        //   (pauseState.dir === dir): il vicino adiacente e' gia' stato
        //   valutato (e' un elemento, per questo la pausa esiste) - si
        //   salta oltre di lui (nodeBefore/nodeAfter + il suo nodeSize) per
        //   valutare il blocco ANCORA oltre, mai lui stesso una seconda
        //   volta (altrimenti si ricreerebbe una pausa identica alla stessa
        //   posizione, un tasto "morto" che non muove nulla).
        // - direzione opposta: "torno indietro" - si rivaluta il vicino
        //   IMMEDIATO in questa nuova direzione (nessuno skip), esattamente
        //   la stessa domanda "reale o fantasma" posta da zero li'.
        // Bordo assoluto (nessun vicino oltre in quella direzione): nessuna
        // riga da valutare, si ricade sul fallback generico piu' sotto
        // (Selection.near/findFrom, stesso codice gia' in uso per gli altri
        // vicoli ciechi in questo file - invariato).
        if (axis === 'vertical') {
          if (pauseState && pauseState.pos === selection.head && pauseState.dir === dir) {
            const neighbor = dir === 'before' ? $pos.nodeBefore : $pos.nodeAfter;
            if (neighbor) {
              const nextPos = dir === 'before' ? selection.head - neighbor.nodeSize : selection.head + neighbor.nodeSize;
              // pauseAtAbsoluteBoundary:true (bug 2026-08-18 sera, vedi il
              // commento completo su verticalPauseOrJump sopra) - `neighbor`
              // qui e' per costruzione un elemento (e' il motivo per cui la
              // pausa attuale, da cui si sta proseguendo, esiste): se oltre
              // di lui non c'e' piu' nulla (bordo assoluto del documento),
              // resta comunque fantasma li' invece di tuffarsi dentro di
              // lui via Selection.near.
              return verticalPauseOrJump(editor, nextPos, dir, true);
            }
          } else {
            return verticalPauseOrJump(editor, selection.head, dir);
          }
        } else if (
          // box.side e' l'OPPOSTO della direzione di uscita originale (il
          // box "after" e' il risultato di un'uscita 'before', e viceversa -
          // vedi adjacentBox sopra): premere la freccia che punta VERSO il
          // lato del box (dir === box.side) rientra nel box; l'altra
          // direzione prosegue oltre. Solo orizzontale: invariato.
          dir === box.side
        ) {
          return reenterBox(selection, box, axis);
        }

        // Direzione opposta al lato del box: prosegue oltre. Riprova PRIMA
        // exitBoxBoundary sulla posizione attuale: se questo cursore finto
        // e' ANCH'ESSO al confine di un antenato piu' esterno (annidamento)
        // o ha un altro box fratello allo stesso livello (affiancamento),
        // si ferma di nuovo li' un livello alla volta invece di scavalcarlo
        // (bug 2026-08-02, vedi commento su exitBoxBoundary in
        // tiptapTextBoxEdgeCursor.ts).
        if (exitBoxBoundary(editor, dir, axis)) return true;

        // Poi exitFlexSiblingBoundary/exitRowDocumentBoundary (Fase 3a,
        // stesso identico motivo delle riprove sotto: la prosecuzione da un
        // cursore finto gia' attivo deve poter fermarsi di nuovo al
        // prossimo bordo fratello di row/cella, non solo al primo ingresso
        // da testo reale in createEdgeAwareKeyboardShortcuts) - solo
        // axis==='horizontal', stesso motivo di exitCellBoundary sotto.
        if (axis === 'horizontal' && exitFlexSiblingBoundary(editor, dir)) return true;
        if (axis === 'horizontal' && exitRowDocumentBoundary(editor, dir)) return true;

        // Poi exitCellBoundary, SOLO in orizzontale (bug 2026-08-05,
        // "salta un livello sul confine di cella": senza questa riprova, un
        // cursore finto gia' attivo che prosegue verso una cella diversa
        // atterrava dritto nel primo box della cella di destinazione invece
        // di fermarsi fuori - stesso identico bug che exitCellBoundary
        // risolve per il PRIMO ingresso in questo stato, da testo reale
        // (createEdgeAwareKeyboardShortcuts, tiptapBlocks.tsx), qui mancava
        // solo nella PROSECUZIONE da un cursore finto gia' attivo). Solo
        // axis==='horizontal' (Left/Right, mai Up/Down che condividono lo
        // stesso `dir` con Left/Right rispettivamente ma significano "riga
        // sopra/sotto nella stessa colonna", non "cella successiva nella
        // stessa riga" - fuori scopo per Up/Down, vedi exitCellBoundary).
        if (axis === 'horizontal' && exitCellBoundary(editor, dir)) return true;

        // Poi exitRowBoundary, stessa riprova ma un livello piu' in su (bug
        // gemello 2026-08-05, cambio di RIGA invece che di cella): mancava
        // identica nella prosecuzione, stesso identico ragionamento sopra
        // per exitCellBoundary - solo axis==='horizontal'.
        if (axis === 'horizontal' && exitRowBoundary(editor, dir)) return true;

        // Poi exitTableBoundary, DOPO exitRowBoundary (richiesta 2026-08-06:
        // uscita dalla tabella verso il paragrafo prima/dopo, creandolo se
        // non esiste, quando siamo al vero bordo assoluto della tabella,
        // non un confine interno) - stessa riprova nella prosecuzione da un
        // cursore finto gia' attivo, esattamente come per exitCellBoundary/
        // exitRowBoundary sopra, solo axis==='horizontal' per lo stesso
        // motivo (Up/Down restano nella stessa colonna, mai "esci dalla
        // tabella").
        if (axis === 'horizontal' && exitTableBoundary(editor, dir)) return true;

        // Solo se non c'e' PIU' nessun antenato box ne' un confine di
        // cella/riga rilevante a questa posizione (siamo davvero usciti da
        // tutto) si ricade sulla Selection.near generica: cerca la prima
        // posizione cursore valida in quella direzione attraversando QUALUNQUE
        // confine, incluso isolating (tableCell) - non e' un'operazione di
        // join/lift, solo ricerca di una posizione gia' esistente nel
        // documento, e isolating vincola solo le trasformazioni
        // strutturali, non la ricerca di selezione (verificato nel sorgente
        // di prosemirror-state: TextSelection.findFrom non consulta mai
        // NodeType.spec.isolating).
        //
        // Guardia vicolo cieco PRIMA di Selection.near (bug segnalato dal
        // vivo 2026-08-13, "riga vuota + elemento vuoto isolato, la freccia
        // oscilla all'infinito fra pausa e dentro l'elemento"): un box
        // ISOLATO (nessuna row, genitore diretto il documento) al vero
        // bordo assoluto del documento crea la sua pausa in exitBoxBoundary
        // (Passo 2, "ieri" - mai passato da exitRowDocumentBoundary, la cui
        // guardia isDocRow sopra quindi non lo riconosce e resta
        // silenziosa) - la seconda pressione arriva quindi fino a QUESTO
        // fallback, che chiama Selection.near con bias verso `dir`: se in
        // quella direzione non c'e' NULLA (vero bordo del documento),
        // Selection.near (a differenza di Selection.findFrom) ripiega da
        // solo sulla direzione OPPOSTA pur di restituire una selezione
        // valida - rientrando cosi' dentro il box appena lasciato. Preso
        // singolarmente questo rientro sembra innocuo, ma la pausa che lo
        // ha preceduto viene ricreata dalla pressione successiva (stesso
        // meccanismo di exitBoxBoundary, invariato) - il risultato e'
        // un'oscillazione infinita pausa/dentro a ogni pressione ripetuta
        // della stessa freccia, mai risolvibile scorrendo oltre. Selection.
        // findFrom (non .near) verifica SOLO la direzione richiesta, senza
        // il ripiego automatico - null qui significa che siamo davvero a un
        // vicolo cieco: resta fermi (return true, nessuna transazione,
        // stesso pattern gia' usato per la pausa di riga stamattina) invece
        // di lasciar rimbalzare Selection.near. Nessun impatto sul caso
        // normale (testo reale raggiungibile in quella direzione, la
        // stragrande maggioranza delle volte): li' findFrom trova subito
        // quella posizione e il codice sotto prosegue identico a prima.
        const $probe = editor.state.doc.resolve(selection.head);
        if (!Selection.findFrom($probe, dir === 'before' ? -1 : 1)) {
          return true;
        }

        return editor
          .chain()
          .command(({ tr }) => {
            tr.setSelection(Selection.near(tr.doc.resolve(selection.head), dir === 'before' ? -1 : 1));
            return true;
          })
          .scrollIntoView()
          .run();
      });

    // Invio su una pausa TRA DUE rowItem della stessa row (testo o box, non
    // importa) divide la row in quel punto invece di navigare in uno dei
    // due - comportamento standard "split" di un editor (piano confermato
    // 2026-08-15, sostituisce il precedente "naviga invece di
    // materializzare" del 2026-08-10 per QUESTO caso specifico). Tutto cio'
    // che precede la pausa resta nella meta' "prima" (srotolata a blocco
    // standalone se resta un solo elemento, altrimenti ancora una row coi
    // grow relativi fra i superstiti invariati - restano comunque
    // proporzionalmente validi, sono lo stesso sottoinsieme di prima),
    // tutto cio' che segue diventa la meta' "dopo", una row nuova (o un
    // blocco standalone, stessa regola) inserita subito dopo quella
    // originale. rowGrow del superstite azzerato quando esce dal contesto
    // row (1 solo elemento) - stesso principio "nessun valore fantasma" gia'
    // applicato da RowCollapseCleanup (Fase 5d, tiptapRowCollapseCleanup.ts)
    // quando un nodo lascia l'UNICA row a cui apparteneva; RowCollapseCleanup
    // stesso non interviene mai qui: scioglie solo una row con un filler
    // vuoto inserito da ProseMirror IN QUESTA transazione (identita' tracciata
    // via invertedMapping) - questa funzione non lascia mai una row sotto
    // il minimo di 2, decide gia' da sola la forma di ciascuna meta'.
    const splitRowAtPause = ($pos: ResolvedPos) => {
      const rowDepth = $pos.depth;
      const rowPos = $pos.before(rowDepth);
      const splitOffset = $pos.parentOffset;

      return editor
        .chain()
        .command(({ tr }) => {
          const rowNode = tr.doc.nodeAt(rowPos);
          if (!rowNode) return false;

          const before: ProseMirrorNode[] = [];
          const after: ProseMirrorNode[] = [];
          rowNode.forEach((child, offset) => {
            (offset < splitOffset ? before : after).push(child);
          });
          // Non dovrebbe potersi verificare (la pausa e' per costruzione fra
          // due rowItem reali, quindi entrambi i lati hanno sempre almeno un
          // elemento) - guardia difensiva, mai il ramo split invocato su una
          // pausa che non e' davvero fra due figli della stessa row.
          if (before.length === 0 || after.length === 0) return false;

          const beforeResult = buildRowGroup(editor.schema, before);
          const afterResult = buildRowGroup(editor.schema, after);

          tr.replaceWith(rowPos, rowPos + rowNode.nodeSize, Fragment.fromArray([beforeResult, afterResult]));

          // Cursore dentro il primo punto di testo valido della meta' "dopo"
          // (stesso bias +1 di sempre in questo file per un atterraggio in
          // avanti) - afterStart e' la posizione ESTERNA di afterResult
          // (tr.doc.nodeAt(afterStart) === afterResult), +1 per entrarci.
          const afterStart = rowPos + beforeResult.nodeSize;
          tr.setSelection(Selection.near(tr.doc.resolve(afterStart + 1), 1));
          return true;
        })
        .scrollIntoView()
        .run();
    };

    // Invio su una pausa - isFlexSiblingContainer($pos.parent) distingue
    // dove si trova ESATTAMENTE $pos (non il vicino - la posizione stessa):
    // dentro il content di una row/cella (fra due suoi figli diretti, il
    // caso Fase 3a) contro il bordo assoluto (il vicino trovato da
    // pauseState.dir e' l'INTERA row/box/tabella come unita', $pos.parent e'
    // il genitore di quella unita', non i suoi figli interni). Solo la row
    // documentale si divide (splitRowAtPause sopra); una cella di tabella
    // resta col comportamento di sempre (nessun nodo "row" al suo interno -
    // ogni figlio diretto di una cella e' gia' affiancabile via
    // .tiptap-td-flex incondizionato in theme.css, senza bisogno di un
    // wrapper - "una riga sotto, nella stessa cella" non ha equivalente
    // strutturale, piano confermato 2026-08-15).
    const enterAtPause = (selection: TextBoxEdgeCursor) => {
      const pos = selection.head;
      const $pos = editor.state.doc.resolve(pos);

      if (isFlexSiblingContainer($pos.parent)) {
        if (isDocRow($pos.parent)) {
          return splitRowAtPause($pos);
        }

        // Cella di tabella - stesso identico comportamento di prima del
        // piano di oggi (naviga nel vicino, mai spacca): pauseState.dir
        // sempre riletto qui (non piu' in cima alla funzione, serve solo in
        // questo ramo ora) per lo stesso motivo di sempre - vedi il vecchio
        // commento su "pauseState.dir invece di adjacentBox()" nella storia
        // di questo file per il ragionamento completo su `?? 'after'`.
        const pauseState = textBoxEdgeCursorPluginKey.getState(editor.state);
        const dir: 'before' | 'after' = pauseState?.dir ?? 'after';
        const neighbor = dir === 'after' ? $pos.nodeAfter : $pos.nodeBefore;

        if (neighbor && isReenterableNeighbor(neighbor)) {
          return reenterBox(selection, { node: neighbor, side: dir }, pauseState?.axis ?? 'horizontal');
        }

        if (neighbor) {
          return editor
            .chain()
            .command(({ tr }) => {
              tr.setSelection(Selection.near(tr.doc.resolve(pos), dir === 'after' ? 1 : -1));
              return true;
            })
            .scrollIntoView()
            .run();
        }
      }

      // Bordo assoluto o vicolo cieco vero (nessun vicino dentro un
      // contenitore affiancabile - una row/box/tabella isolata trovata da
      // pauseState.dir, se presente, e' un'unita' intera adiacente, non
      // c'e' niente al suo interno da dividere qui) - comportamento
      // invariato: materializza un nuovo paragrafo vuoto e ci entra, stesso
      // identico meccanismo di sempre (Enter sopra/sotto una tabella
      // isolata, o ora anche sopra/sotto una row isolata).
      return editor
        .chain()
        .command(({ tr }) => {
          tr.insert(pos, editor.schema.nodes.paragraph.create());
          tr.setSelection(Selection.near(tr.doc.resolve(pos + 1)));
          return true;
        })
        .scrollIntoView()
        .run();
    };

    // Backspace da una pausa unisce i due vicini reali del gap (before/
    // after) in una row - simmetrico a mergeAtBackspace (tiptapRow.ts,
    // cursore VERO), ma per il cursore FINTO: nessuno shortcut Backspace
    // esisteva qui prima d'ora (round Backspace-da-pausa 2026-08-16, bug
    // segnalato dal vivo - "TextBox standalone sotto un paragrafo con testo
    // reale, Freccia sinistra per uscire poi Backspace" selezionava il
    // paragrafo sopra come NodeSelection invece di unirlo in una row, poi lo
    // cancellava alla pressione successiva, il TextBox 'saliva' al suo
    // posto). Causa: senza uno shortcut dedicato, Backspace su questa
    // Selection (content() vuoto, non TextSelection - vedi la classe sopra)
    // cade sul fallback nativo (Keymap interno di @tiptap/core:
    // undoInputRule -> ... -> deleteSelection -> joinBackward ->
    // selectNodeBackward), che non ha alcuna cognizione della row - da cui
    // il NodeSelection sul vicino sbagliato. Verificato dal vivo con
    // editor.getJSON()/selection.constructor.name prima di questo fix:
    // dopo una Freccia sinistra da dentro un TextBox standalone la
    // selezione e' davvero TextBoxEdgeCursor, e il primo Backspace la
    // trasformava in una NodeSelection sul paragrafo prima del box.
    //
    // before/after DEL GAP (non "il box da cui si e' usciti" ne'
    // pauseState.dir): la pausa E' la posizione del cursore, prima/dopo
    // sono i suoi soli due vicini reali, esattamente come $from.nodeBefore/
    // nodeAfter per un cursore vero - stessa simmetria "leftNodes da
    // before, rightNodes da after" di combineIntoRow, indipendente da QUALE
    // lato ha innescato la pausa: pauseAtIsolatingBoundary puo' fermarsi
    // sia uscendo verso 'before' sia verso 'after', ma il gap risultante ha
    // comunque un prima/dopo ben definiti - la direzione di uscita e'
    // irrilevante qui quanto lo sarebbe per un cursore vero fermo alla
    // stessa posizione (Backspace guarda solo indietro dalla posizione
    // corrente, mai come ci si e' arrivati).
    //
    // isFlexSiblingContainer($gap.parent): il gap e' GIA' dentro una row/
    // cella (fra due suoi figli diretti, es. due box affiancati nella
    // stessa riga) - fuori scope, stessa esclusione di "item non primo di
    // una row" in mergeAtBackspace: lo schema blocca gia' da solo quel
    // join, nessun codice nuovo necessario qui. findCellAncestorDepth/
    // findTableAncestorDepth: stessa esclusione tabella di sempre (Case 2
    // di addElementBeside, mergeAtBackspace) - restano fuori scope anche
    // qui scroll orizzontale annidato/arrow-nav a doppio livello.
    const backspaceAtPause = (selection: TextBoxEdgeCursor): boolean => {
      const { state } = editor;
      const { schema } = state;
      const gapPos = selection.head;
      const $gap = state.doc.resolve(gapPos);

      if (isFlexSiblingContainer($gap.parent)) return false;
      if (findCellAncestorDepth($gap) !== null || findTableAncestorDepth($gap) !== null) return false;

      const before = $gap.nodeBefore;
      const after = $gap.nodeAfter;
      if (!before || !after) return false;

      const index = $gap.index();
      if (!$gap.parent.canReplaceWith(index - 1, index + 1, schema.nodes.row)) return false;

      const rangeFrom = gapPos - before.nodeSize;
      const rangeTo = gapPos + after.nodeSize;

      // REVISIONE 2026-08-17 (piano "Backspace unisce solo il primo
      // elemento della row", confermato): la stessa asimmetria di
      // mergeAtBackspace (tiptapRow.ts, Caso 3/4) vale identica qui - il
      // documento "paragrafo Sopra, poi row[A,B,C]" e' lo STESSO sia che il
      // cursore ci arrivi come TextSelection dentro A (mergeAtBackspace)
      // sia come pausa al bordo assoluto della row (qui): stesso Backspace,
      // stesso risultato atteso. `before` gioca sempre il ruolo di
      // "aboveNode" (il blocco che il Backspace raggiunge all'INDIETRO) -
      // assorbimento pieno, rowGrow preservato se e' gia' una row (nessuno
      // stripping: e' lo stesso gruppo di prima, guadagna solo un nuovo
      // membro, esattamente come mergeAtBackspace Caso 2/4). `after` gioca
      // sempre il ruolo di "la row da cui si sta uscendo" - se e' una row,
      // SOLO il suo primo figlio partecipa al merge (stripped, lascia il
      // gruppo B/C con cui non ha piu' nulla a che fare), il resto
      // (buildRowGroup) diventa un fratello nuovo subito dopo la row unita.
      let leftNodes: ProseMirrorNode[];
      if (before.type === schema.nodes.row) {
        leftNodes = [];
        before.forEach((child) => leftNodes.push(child));
      } else {
        if (!isRowItemEligible(before)) return false;
        leftNodes = [stripRowGrow(before)];
      }

      let rightNodes: ProseMirrorNode[];
      let trailingSibling: ProseMirrorNode | undefined;
      if (after.type === schema.nodes.row) {
        const afterChildren: ProseMirrorNode[] = [];
        after.forEach((child) => afterChildren.push(child));
        const [firstOfAfter, ...restOfAfter] = afterChildren;
        rightNodes = [stripRowGrow(firstOfAfter)];
        trailingSibling = buildRowGroup(schema, restOfAfter);
      } else {
        if (!isRowItemEligible(after)) return false;
        rightNodes = [stripRowGrow(after)];
      }

      return editor
        .chain()
        .command(({ tr }) => {
          combineIntoRow(tr, schema, { from: rangeFrom, to: rangeTo }, leftNodes, rightNodes, trailingSibling);
          return true;
        })
        .scrollIntoView()
        .run();
    };

    return {
      Enter: withCursor(enterAtPause),
      ArrowLeft: exitArrow('before', 'horizontal'),
      ArrowUp: exitArrow('before', 'vertical'),
      ArrowRight: exitArrow('after', 'horizontal'),
      ArrowDown: exitArrow('after', 'vertical'),
      Backspace: withCursor(backspaceAtPause),
      Escape: withCursor((selection) => {
        const box = adjacentBox(editor.state.doc.resolve(selection.head));
        if (!box) return false;
        const pauseState = textBoxEdgeCursorPluginKey.getState(editor.state);
        return reenterBox(selection, box, pauseState?.axis ?? 'horizontal');
      }),
    };
  },
});
