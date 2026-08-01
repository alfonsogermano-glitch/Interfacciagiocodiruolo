import { Extension } from '@tiptap/core';
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
// entrambi, nessuna duplicazione: vedi createEdgeAwareKeyboardShortcuts in
// tiptapBlocks.tsx, usata da entrambi i nodi parametrizzata sul proprio
// nome).
const SIDE_BY_SIDE_BLOCK_TYPES = ['textBox', 'collapseBlock'];

// Il box/collapse adiacente alla posizione del cursore finto (nodo DOPO se
// e' un cursore "before", nodo PRIMA se e' un cursore "after") - nessuno
// stato separato "quale box, quale lato" da tracciare altrove: la
// posizione stessa lo dice gia', via nodeBefore/nodeAfter. Usato sia dal
// rendering sotto sia da Invio/frecce/Escape in tiptapBlocks.tsx.
export function adjacentBox($pos: ResolvedPos): { node: ProseMirrorNode; side: 'before' | 'after' } | null {
  if ($pos.nodeAfter && SIDE_BY_SIDE_BLOCK_TYPES.includes($pos.nodeAfter.type.name)) {
    return { node: $pos.nodeAfter, side: 'after' };
  }
  if ($pos.nodeBefore && SIDE_BY_SIDE_BLOCK_TYPES.includes($pos.nodeBefore.type.name)) {
    return { node: $pos.nodeBefore, side: 'before' };
  }
  return null;
}

// Esiste gia' un fratello reale dopo questa posizione, nella STESSA cella -
// esistenza del nodo (qualunque tipo, vuoto o no), MAI contenuto testuale:
// un paragrafo vuoto e' comunque un oggetto Node vero, quindi conta.
// Esportata e riusata da createEdgeAwareKeyboardShortcuts
// (tiptapBlocks.tsx) per decidere se creare questo cursore al posto di un
// paragrafo reale - UNA sola definizione condivisa.
export function hasRealSiblingAfter($pos: ResolvedPos): boolean {
  return !!$pos.nodeAfter;
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

    // Rientra nel box da cui il cursore finto e' uscito (Escape, o freccia
    // in direzione opposta a quella di uscita) - Selection.near dal lato
    // giusto del box, stesso idioma gia' usato da createEdgeAwareKeyboardShortcuts
    // per il caso "esiste gia' un fratello" (tiptapBlocks.tsx).
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
        // prosegue oltre.
        if (dir === box.side) return reenterBox(selection, box);

        // Direzione opposta al lato del box: prosegue oltre. Selection.near
        // cerca la prima posizione cursore valida in quella direzione
        // attraversando QUALUNQUE confine, incluso isolating (tableCell) -
        // non e' un'operazione di join/lift, solo ricerca di una posizione
        // gia' esistente nel documento, e isolating vincola solo le
        // trasformazioni strutturali, non la ricerca di selezione (verificato
        // nel sorgente di prosemirror-state: TextSelection.findFrom non
        // consulta mai NodeType.spec.isolating).
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
