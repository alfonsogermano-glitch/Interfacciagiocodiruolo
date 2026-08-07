import { Node, mergeAttributes } from '@tiptap/core';
import { Paragraph } from '@tiptap/extension-paragraph';

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
});

// Paragraph esteso col group 'rowItem' in piu' (oltre al nativo 'block') -
// stesso pattern gia' usato per TableWithHandle (tiptapTableHandle.ts):
// paragraph non e' un nodo custom altrove nel repo, viene dal bundle
// StarterKit, quindi va disattivato li' (RichTextEditor.tsx,
// StarterKit.configure({ paragraph:false })) e ri-registrato qui a parte.
export const ParagraphWithRowGroup = Paragraph.extend({
  group: 'block rowItem',
});
