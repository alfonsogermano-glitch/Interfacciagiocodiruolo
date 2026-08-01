import { Extension } from '@tiptap/core';
import { Selection, Plugin, PluginKey } from '@tiptap/pm/state';
import { Slice } from '@tiptap/pm/model';
import type { Node as ProseMirrorNode, ResolvedPos } from '@tiptap/pm/model';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorView } from '@tiptap/pm/view';
import type { Mapping } from '@tiptap/pm/transform';

// Selezione custom per il cursore "finto" al confine di un TextBox - stesso
// schema di GapCursor (prosemirror-gapcursor, letto dal sorgente durante
// l'indagine 2026-08-01): $anchor===$head, content() vuoto, visible=false
// (nasconde il caret nativo, il segno visivo e' solo la decorazione piu'
// sotto). NON riusa GapCursor stesso: la SUA ricerca (closedBefore/
// closedAfter) vede attraverso un contenitore con contenuto reale come
// TextBox e non si ferma mai al suo confine esterno (verificato dal vivo il
// 2026-07-31, commit 7a53367) - la validita' qui e' invece decisa a monte da
// TextBox.addKeyboardShortcuts (isAtBoxBoundary, tiptapBlocks.tsx), non da
// questa classe.
//
// Il vantaggio di essere una VERA Selection (non solo stato di plugin) e'
// che digitare mentre e' attiva materializza da solo un paragrafo col testo
// digitato: Selection.replace() (metodo di base, non sovrascritto qui)
// chiama tr.replaceRange(pos, pos, content), che avvolge automaticamente il
// testo in un paragrafo quando la posizione e' tra due blocchi fratelli
// invece che dentro un textblock - stessa ragione per cui digitare con un
// gap cursor nativo prima/dopo un'immagine crea gia' un paragrafo da solo,
// senza codice dedicato. Validato con uno spike dal vivo il 2026-08-01
// prima di procedere con la rifinitura completa.
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

// Il TextBox adiacente alla posizione del cursore finto (box DOPO se e' un
// cursore "before", box PRIMA se e' un cursore "after") - nessuno stato
// separato "quale box, quale lato" da tracciare altrove: la posizione stessa
// lo dice gia', via nodeBefore/nodeAfter. Usato sia dal rendering (trovare
// il DOM del box per posizionare la barra accanto) sia da Invio/frecce/
// Escape sotto.
function adjacentBox($pos: ResolvedPos): { node: ProseMirrorNode; side: 'before' | 'after' } | null {
  if ($pos.nodeAfter?.type.name === 'textBox') return { node: $pos.nodeAfter, side: 'after' };
  if ($pos.nodeBefore?.type.name === 'textBox') return { node: $pos.nodeBefore, side: 'before' };
  return null;
}

// Il containing block REALE di un elemento position:absolute e' il piu'
// vicino antenato con position!=static nel DOM - non e' detto sia
// .tiptap-content: .tableWrapper (introdotto per la maniglia della
// tabella, theme.css) ha anch'esso position:relative, e per un TextBox
// dentro una cella e' LUI il piu' vicino, non .tiptap-content piu' esterno
// (bug segnalato 2026-08-01: coordinate calcolate rispetto all'antenato
// sbagliato facevano comparire la barra fuori dalla tabella). Si cerca
// sempre a runtime invece di assumerne uno fisso, cosi' funziona a
// qualunque profondita' di nesting (box dentro tabella dentro un altro box,
// ecc.) - parte da boxDom.parentElement, non da boxDom stesso: il widget e'
// un FRATELLO del box nel DOM, non un suo discendente, quindi il
// .tiptap-textbox del box stesso (anch'esso position:relative) non e' un
// antenato valido per lui.
function nearestPositionedAncestor(el: HTMLElement): HTMLElement {
  let node: HTMLElement | null = el;
  while (node) {
    if (getComputedStyle(node).position !== 'static') return node;
    node = node.parentElement;
  }
  return document.documentElement;
}

// Calcola e imposta left/top/height in px sulla barra. .tiptap-textbox-edge-
// cursor e' position:absolute in CSS (toglie l'elemento dal flusso, nessun
// salto di riga introdotto altrove dove viene inserito nel DOM).
//
// Le due direzioni NON sono simmetriche per scelta (confermato
// dall'utente), ma solo condizionatamente per il lato 'before' (il box sta
// PRIMA della posizione del cursore - uscita da FINE contenuto, freccia
// destra/giu): se esiste GIA' un fratello reale dopo il box nella cella,
// "sotto, verso quel contenuto" resta corretto (il box e' un blocco a piena
// larghezza, una riga nuova ci andrebbe visivamente sotto). Ma se il box e'
// invece l'ULTIMO elemento reale della cella, "sotto" fluttuerebbe senza
// nulla a cui riferirsi - li' torna simmetrico al lato 'after' (stessa
// riga, a destra invece che a sinistra). Il controllo (nodeAfter alla
// posizione del cursore) e' lo STESSO gia' usato da TextBox.exitBoundary in
// tiptapBlocks.tsx per decidere se creare questo cursore al posto di un
// paragrafo reale - non un'euristica visiva separata, rifinitura richiesta
// 2026-08-01. box.side==='after' (il box sta DOPO - uscita da INIZIO
// contenuto, freccia sinistra/su) resta invece sulla stessa riga, a
// sinistra del box in OGNI circostanza - comportamento gia' confermato,
// invariato.
function positionEdgeCursor(view: EditorView, pos: number, dom: HTMLElement) {
  const $pos = view.state.doc.resolve(pos);
  const box = adjacentBox($pos);
  if (!box) return;

  const boxPos = box.side === 'after' ? pos : pos - box.node.nodeSize;
  const boxDom = view.nodeDOM(boxPos);
  if (!(boxDom instanceof HTMLElement)) return;
  // .tiptap-textbox-content (non il box esterno, che include bordo/padding):
  // e' il riferimento giusto sia per l'altezza di riga (lineHeight sotto)
  // sia per l'allineamento verticale nel caso 'before' - usare il rettangolo
  // del box ESTERNO per il top lo sarebbe stato spostato piu' in alto della
  // vera prima riga di testo, esattamente della misura di padding+bordo del
  // box (bug segnalato 2026-08-01: barra "troppo in alto" rispetto al
  // centro della riga).
  const contentDom = boxDom.querySelector<HTMLElement>('.tiptap-textbox-content') ?? boxDom;

  const anchor = nearestPositionedAncestor(boxDom.parentElement ?? (view.dom as HTMLElement));
  const anchorRect = anchor.getBoundingClientRect();
  const anchorStyle = getComputedStyle(anchor);
  // getBoundingClientRect() da' il border-box, ma il containing block CSS
  // per top/left e' il padding-box dell'antenato - senza sottrarre lo
  // spessore del bordo, la barra risulterebbe spostata esattamente di
  // quella misura ogni volta che l'antenato ne ha uno (.tableWrapper non ne
  // ha oggi, ma qui si copre il caso generale invece di assumerlo).
  const anchorBorderTop = parseFloat(anchorStyle.borderTopWidth) || 0;
  const anchorBorderLeft = parseFloat(anchorStyle.borderLeftWidth) || 0;

  const boxRect = boxDom.getBoundingClientRect();
  const contentRect = contentDom.getBoundingClientRect();
  const lineHeight = parseFloat(getComputedStyle(contentDom).lineHeight) || boxRect.height;

  dom.style.height = `${lineHeight}px`;

  const hasRealSiblingAfter = box.side === 'before' && !!$pos.nodeAfter;

  if (hasRealSiblingAfter) {
    // Box PRIMA della posizione, MA esiste gia' un fratello reale dopo:
    // sotto il box, allineata al suo bordo sinistro (dove inizia davvero il
    // paragrafo fratello) - +4 piccolo distacco visivo, stesso principio
    // del -4 usato sotto per l'altro caso.
    dom.style.top = `${boxRect.bottom - anchorRect.top - anchorBorderTop + 4}px`;
    dom.style.left = `${boxRect.left - anchorRect.left - anchorBorderLeft}px`;
  } else if (box.side === 'before') {
    // Box PRIMA della posizione, nessun fratello reale dopo (il box e'
    // l'ultimo elemento della cella): simmetrico al ramo sotto, ma a destra
    // del box invece che a sinistra.
    dom.style.top = `${contentRect.top - anchorRect.top - anchorBorderTop}px`;
    dom.style.left = `${boxRect.right - anchorRect.left - anchorBorderLeft + 4}px`;
  } else {
    // Box DOPO la posizione (inizio contenuto, freccia sinistra/su): stessa
    // riga della prima riga di testo dentro il box (contentRect, non
    // boxRect - vedi commento sopra), appena a sinistra del bordo del box.
    // Invariato in ogni circostanza.
    dom.style.top = `${contentRect.top - anchorRect.top - anchorBorderTop}px`;
    dom.style.left = `${boxRect.left - anchorRect.left - anchorBorderLeft - 4}px`;
  }
}

export const TextBoxEdgeCursorExtension = Extension.create({
  name: 'textBoxEdgeCursor',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('textBoxEdgeCursor'),
        props: {
          decorations(state) {
            const { selection } = state;
            if (!(selection instanceof TextBoxEdgeCursor)) return null;
            return DecorationSet.create(state.doc, [
              Decoration.widget(
                selection.head,
                (view) => {
                  const dom = document.createElement('span');
                  dom.className = 'tiptap-textbox-edge-cursor';
                  dom.setAttribute('aria-hidden', 'true');
                  positionEdgeCursor(view, selection.head, dom);
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

    // Rientra nel box da cui il cursore finto e' uscito (Escape, o freccia
    // in direzione opposta a quella di uscita) - Selection.near dal lato
    // giusto del box, stesso idioma gia' usato da TextBox.exitBoundary per
    // il caso "esiste gia' un fratello" (tiptapBlocks.tsx).
    const reenterBox = (selection: TextBoxEdgeCursor, box: { side: 'before' | 'after' }) =>
      editor
        .chain()
        .command(({ tr }) => {
          const pos = selection.head;
          tr.setSelection(
            box.side === 'after' ? Selection.near(tr.doc.resolve(pos + 1), 1) : Selection.near(tr.doc.resolve(pos - 1), -1)
          );
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
        // prosegue oltre. Bug corretto 2026-08-01: la condizione era
        // invertita, faceva rientrare nel box premendo la STESSA freccia di
        // uscita invece della freccia opposta.
        if (dir === box.side) return reenterBox(selection, box);

        // Direzione opposta al lato del box: prosegue oltre. Selection.near
        // cerca la prima posizione cursore valida in quella direzione
        // attraversando QUALUNQUE confine, incluso isolating (tableCell) -
        // non e' un'operazione di join/lift, solo ricerca di una posizione
        // gia' esistente nel documento, e isolating vincola solo le
        // trasformazioni strutturali, non la ricerca di selezione (verificato
        // nel sorgente di prosemirror-state: TextSelection.findFrom non
        // consulta mai NodeType.spec.isolating). Bug corretto 2026-08-01: un
        // controllo precedente (nodeBefore/nodeAfter limitato alla sola
        // cella corrente) faceva un no-op non appena non c'era piu' nulla
        // DENTRO la cella in quella direzione, anche se la freccia veniva
        // premuta piu' volte di seguito - risultava "bloccato" invece di
        // proseguire verso il paragrafo/cella successivi fuori dalla
        // tabella.
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
