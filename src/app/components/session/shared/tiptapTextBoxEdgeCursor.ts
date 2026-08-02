import { Extension, type Editor } from '@tiptap/core';
import { Selection, Plugin, PluginKey } from '@tiptap/pm/state';
import { Slice } from '@tiptap/pm/model';
import type { Node as ProseMirrorNode, ResolvedPos } from '@tiptap/pm/model';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
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
// diverse, distinta dall'affiancamento/annidamento DENTRO la stessa
// cella gestito da isSideBySideBox sopra.
const TABLE_CELL_TYPES = ['tableCell', 'tableHeader'];

function isTableCell(node: ProseMirrorNode): boolean {
  return TABLE_CELL_TYPES.includes(node.type.name);
}

// Il primo/ultimo figlio di una cella (a seconda della direzione con cui
// ci si entra) e' esso stesso un TextBox/Collapse? Se si', entrare nella
// cella richiede la stessa pausa "un livello alla volta" che si applica
// gia' fra due box fratelli - senza questo controllo, muoversi fra celle
// diverse bypassava del tutto exitBoxBoundary (che parte da un antenato
// box, mai da un antenato cella) e faceva atterrare il cursore dritto
// dentro il box della cella di destinazione (bug 2026-08-02).
function cellEdgeNeedsPause(cell: ProseMirrorNode, dir: 'before' | 'after'): boolean {
  const edgeChild = dir === 'after' ? cell.firstChild : cell.lastChild;
  return !!edgeChild && isSideBySideBox(edgeChild);
}

// Elemento adiacente alla posizione del cursore finto (nodo DOPO se e' un
// cursore "before", nodo PRIMA se e' un cursore "after") - nessuno stato
// separato "quale elemento, quale lato" da tracciare altrove: la posizione
// stessa lo dice gia', via nodeBefore/nodeAfter. "kind" distingue un
// TextBox/Collapse fratello (stesso contenitore) da una cella di tabella
// diversa (il cursore finto e' stato creato al confine FRA due celle,
// vedi exitCellBoundary sotto) - la rientrata (reenterBox) si comporta
// diversamente nei due casi. Usato sia dal rendering sotto sia da
// Invio/frecce/Escape in tiptapBlocks.tsx.
export function adjacentBox($pos: ResolvedPos): { node: ProseMirrorNode; side: 'before' | 'after'; kind: 'box' | 'cell' } | null {
  if ($pos.nodeAfter) {
    if (isSideBySideBox($pos.nodeAfter)) return { node: $pos.nodeAfter, side: 'after', kind: 'box' };
    if (isTableCell($pos.nodeAfter)) return { node: $pos.nodeAfter, side: 'after', kind: 'cell' };
  }
  if ($pos.nodeBefore) {
    if (isSideBySideBox($pos.nodeBefore)) return { node: $pos.nodeBefore, side: 'before', kind: 'box' };
    if (isTableCell($pos.nodeBefore)) return { node: $pos.nodeBefore, side: 'before', kind: 'cell' };
  }
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

// Come findBoxAncestorDepth, ma per la cella di tabella (tableCell o
// tableHeader) piu' vicina - usata SOLO da exitCellBoundary sotto per
// decidere la pausa alla transizione fra celle diverse, MAI da Backspace
// (a differenza di findBoxAncestorDepth): un antenato "cella" trovato al
// posto di un antenato "box" farebbe cancellare l'intera cella invece di
// un box al suo interno se riusata li' - le due ricerche restano
// deliberatamente separate.
function findCellAncestorDepth($pos: ResolvedPos): number | null {
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    if (isTableCell($pos.node(depth))) return depth;
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
// Condivisa da exitBoxBoundary (uscita da un box/cella) ed exitArrow sotto
// (rientro in un box/cella dopo una pausa) - la stessa identica decisione
// serve in entrambe le direzioni di attraversamento di un confine, non
// solo in uscita: un box il cui primo figlio e' un ALTRO box annidato
// deve fermarsi anche RIENTRANDOCI, non solo uscendone (stessa filosofia
// "un livello alla volta" gia' applicata all'uscita).
function landOrDive(doc: ProseMirrorNode, pos: number, dir: 'before' | 'after'): Selection {
  const $pos = doc.resolve(pos);
  const neighbor = dir === 'after' ? $pos.nodeAfter : $pos.nodeBefore;
  if (!neighbor) return new TextBoxEdgeCursor($pos);
  if (isSideBySideBox(neighbor)) return new TextBoxEdgeCursor($pos);
  if (isTableCell(neighbor) && cellEdgeNeedsPause(neighbor, dir)) return new TextBoxEdgeCursor($pos);
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

  return editor
    .chain()
    .command(({ tr }) => {
      tr.setSelection(landOrDive(tr.doc, boundaryPos, dir));
      return true;
    })
    .scrollIntoView()
    .run();
}

// Transizione fra DUE CELLE DIVERSE (stessa riga di tabella) - a
// differenza di exitBoxBoundary sopra (che parte da un antenato box, e
// quindi non scatta affatto se il cursore e' su testo normale senza
// alcun TextBox/Collapse intorno), qui l'antenato cercato e' la cella
// stessa: serve a intercettare ANCHE il caso "sono su testo normale in
// una cella, la cella ACCANTO comincia con un box" (bug 2026-08-02: senza
// questo controllo, muoversi fra celle passava per la normale
// navigazione nativa di ProseMirror/prosemirror-tables, che non ha
// nessuna cognizione dei nostri box e atterrava il cursore dritto dentro
// il primo box della cella di destinazione, scavalcando sia il confine
// fra le due celle sia l'ingresso nel box).
//
// Interviene SOLO se la cella accanto comincia (lato d'ingresso) con un
// TextBox/Collapse - se il suo contenuto e' normale, non fa nulla e si
// lascia il comportamento nativo di navigazione fra celle invariato
// (esattamente come oggi, nessuna pausa in piu' per il caso comune).
// Chiamata solo da ArrowLeft/ArrowRight (mai Up/Down, tiptapBlocks.tsx):
// su/giu' passano alla cella nella riga sopra/sotto nella STESSA colonna,
// una relazione strutturale diversa da "prima/dopo nella stessa riga" che
// prev/nextSibling qui sotto assumono - fuori scopo per questo fix.
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
  if (!neighborCell || !isTableCell(neighborCell) || !cellEdgeNeedsPause(neighborCell, dir)) return false;

  return editor
    .chain()
    .command(({ tr }) => {
      tr.setSelection(new TextBoxEdgeCursor(tr.doc.resolve(boundaryPos)));
      return true;
    })
    .scrollIntoView()
    .run();
}

export const TextBoxEdgeCursorExtension = Extension.create({
  name: 'textBoxEdgeCursor',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('textBoxEdgeCursor'),
        props: {
          // Nessun calcolo di coordinate: la cella e' ora un contenitore
          // flex con avvolgimento (theme.css) e TextBox/Collapse hanno un
          // max-width che riserva sempre spazio per questa barra sulla
          // STESSA riga flex - il widget e' semplicemente un altro item
          // flex (flex:0 0 auto in CSS), posizionato dal browser esattamente
          // dove viene inserito nel DOM, senza il sistema
          // position:absolute + misurazione DOM dei giri precedenti
          // (rimosso 2026-08-01: non serve piu' con il layout flex).
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

    // Rientra nel box O nella cella da cui il cursore finto e' uscito
    // (Escape, o freccia in direzione opposta a quella di uscita) -
    // landOrDive dal lato giusto invece di una Selection.near diretta (bug
    // 2026-08-02): se il vicino e' una CELLA (kind==='cell', il cursore
    // era al confine fra due celle diverse, vedi exitCellBoundary sopra),
    // muoversi verso di essa non deve tuffarsi dritto nel primo testo
    // reale - deve prima controllare se il SUO stesso figlio d'ingresso e'
    // a sua volta un box, fermandosi li' (stessa pausa "un livello alla
    // volta" gia' applicata dentro una singola cella). Stessa logica
    // riusata anche per kind==='box': un box il cui primo figlio e' un
    // ALTRO box annidato si ferma anche rientrandoci, non solo uscendone.
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
