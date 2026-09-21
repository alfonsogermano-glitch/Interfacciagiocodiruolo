import { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { GapCursor } from '@tiptap/pm/gapcursor';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { InlineModifier } from '../src/app/components/session/shared/tiptapInlineModifier';
import { InlineDice } from '../src/app/components/session/shared/tiptapInlineDice';
import { runSlashNoteCommand } from '../src/app/components/session/shared/noteEditorCommands';
import { TextBox, CollapseSummary, CollapseBody, CollapseBlock } from '../src/app/components/session/shared/tiptapBlocks';
import { BlockRow } from '../src/app/components/session/shared/tiptapBlockRow';
import { NOTE_TABLE_EXTENSIONS } from '../src/app/components/session/shared/tiptapNoteTable';
import { Archivio } from '../src/app/components/session/shared/tiptapArchivio';

declare global {
  interface Window {
    __repro: (width: number) => Promise<ReproResult>;
    __reproRows: () => Promise<RowsReproResult>;
  }
}

interface RowsReproResult {
  rowsBefore: number;
  itemWidthsBefore: number[];
  itemGapsBefore: number[];
  firstItemType: string;
  afterAddRowItems: number;
  afterAddRowParentOfStandalone: string;
  afterAddRowWrappedChildren: number;
  totalRowsAfterWraps: number;
  wrapCaretInNewItem: boolean;
  caretInNewItem: boolean;
  caretNewItemIndex: number;
  arrowSkipsGap: boolean;
  arrowChildIndex: number;
  singleParaTextKept: boolean;
  singleParaRowsLeft: number;
  upToPara: boolean;
  downToPara: boolean;
  upWaitsAtBoundary: boolean;
  upCaretBetweenRows: boolean;
  upCaretY: number;
  upRowRects: { top: number; bottom: number }[];
  typedXLocation: string;
  typedYLocation: string;
  gapMaterialized: boolean;
  gapParaHeight: number;
  enterExitsRow: boolean;
  enterRowIntact: boolean;
  gapNudged: boolean;
  gapCursorConverted: boolean;
  interRowGapConverted: boolean;
  enterAtGapCreatesLine: boolean;
  rowsAfterClear: number;
  emptyRowsAfterClear: number;
  rowsAfterEnter: number;
  caretRowIndexAfterEnter: number;
  caretPathTypes: string[];
  boxCount: number;
  doc: unknown;
}

interface WidgetRect {
  cls: string;
  top: number;
  left: number;
  right: number;
  width: number;
  styleWidth: string;
  marginRight: string;
}

interface ReproResult {
  width: number;
  firstLayout: WidgetRect[];
  afterMeasure: WidgetRect[];
  sameLineBefore: boolean;
  sameLineAfter: boolean;
  doc: unknown;
}

function collectRects(root: HTMLElement): WidgetRect[] {
  const out: WidgetRect[] = [];
  root.querySelectorAll('.tiptap-inline-dice-widget, .tiptap-inline-modifier-widget, .tiptap-inline-points-widget').forEach((el) => {
    const rect = (el as HTMLElement).getBoundingClientRect();
    out.push({
      cls: (el as HTMLElement).className.split(' ')[0],
      top: rect.top,
      left: rect.left,
      right: rect.right,
      width: rect.width,
      styleWidth: (el as HTMLElement).style.width,
      marginRight: (el as HTMLElement).style.marginRight,
    });
  });
  return out;
}

function setupEditor(width: number): { editor: Editor; root: HTMLElement } {
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:0;top:0;width:${width}px;box-sizing:border-box;padding:8px;background:#fff;`;
  document.body.appendChild(host);
  const target = document.createElement('div');
  host.appendChild(target);

  const editor = new Editor({
    element: target,
    extensions: [Document, Paragraph, Text, InlineDice, InlineModifier],
    content: '<p></p>',
  });
  return { editor, root: host };
}

function nextFrames(n: number): Promise<void> {
  return new Promise((resolve) => {
    const step = (left: number) => {
      if (left <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(() => step(left - 1));
    };
    requestAnimationFrame(() => step(n));
  });
}

window.__repro = async (width: number): Promise<ReproResult> => {
  const { editor, root } = setupEditor(width);

  // 1) Slash -> Dado al primo carattere del paragrafo (posizione 1).
  editor.chain().setTextSelection({ from: 1, to: 1 }).insertContent('/').run();
  runSlashNoteCommand(editor, 'inlineDice', 1);
  await nextFrames(2);

  // 2) Caret subito dopo il Dado, slash -> Modificatore (stesso percorso del menu "/").
  const dopoDado = editor.state.doc.content.size - 1; // ultima posizione interna del paragrafo
  editor.chain().setTextSelection({ from: dopoDado, to: dopoDado }).insertContent('/').run();
  const slashPos = editor.state.doc.textBetween(dopoDado, dopoDado + 1, '', '') === '/' ? dopoDado : dopoDado;
  runSlashNoteCommand(editor, 'inlineModifier', slashPos);

  const firstLayout = collectRects(root);
  const sameLineBefore = firstLayout.length < 2 || Math.abs(firstLayout[0].top - firstLayout[1].top) < 2;

  await nextFrames(2);
  const afterMeasure = collectRects(root);
  const sameLineAfter = afterMeasure.length < 2 || Math.abs(afterMeasure[0].top - afterMeasure[1].top) < 2;

  const result: ReproResult = {
    width,
    firstLayout,
    afterMeasure,
    sameLineBefore,
    sameLineAfter,
    doc: editor.getJSON(),
  };
  editor.destroy();
  root.remove();
  return result;
};

function firstPosOf(editor: Editor, typeName: string): number {
  const frag = editor.state.doc.content;
  let pos = 0;
  for (let i = 0; i < frag.childCount; i += 1) {
    const child = frag.child(i);
    if (child.type.name === typeName) return pos;
    pos += child.nodeSize;
  }
  return -1;
}

function firstRootPosOf(editor: Editor, typeName: string): number {
  let offset = 0; // ProseMirror: primo figlio del doc parte a 0
  const frag = editor.state.doc.content;
  for (let i = 0; i < frag.childCount; i += 1) {
    const child = frag.child(i);
    if (child.type.name === typeName) return offset;
    offset += child.nodeSize;
  }
  return -1;
}

function firstNodePos(editor: Editor, typeName: string): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found !== -1) return false;
    if (node.type.name === typeName) {
      found = pos;
      return false;
    }
    return true;
  });
  return found;
}

function countType(editor: Editor, typeName: string): number {
  let count = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === typeName) count += 1;
    return true;
  });
  return count;
}

function getCaretPathTypes(editor: Editor): string[] {
  const $from = editor.state.selection.$from;
  const path: string[] = [];
  for (let d = 0; d <= $from.depth; d += 1) path.push($from.node(d).type.name);
  return path;
}

function rowBrothers(editor: Editor, rowPos: number): number {
  const row = editor.state.doc.nodeAt(rowPos);
  if (!row) return -1;
  return row.childCount;
}

window.__reproRows = async (): Promise<RowsReproResult> => {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:0;top:0;width:640px;box-sizing:border-box;padding:8px;background:#fff;';
  document.body.appendChild(host);
  const target = document.createElement('div');
  host.appendChild(target);

  const editor = new Editor({
    element: target,
    extensions: [
      StarterKit.configure({ heading: false }),
      Image,
      TaskList,
      TaskItem.configure({ nested: false }),
      TextBox,
      CollapseSummary,
      CollapseBody,
      CollapseBlock,
      BlockRow,
      ...NOTE_TABLE_EXTENSIONS,
      Archivio,
    ],
    content: {
      type: 'doc',
      content: [
        {
          type: 'blockRow',
          content: [
            { type: 'textBox', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'dado' }] }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'auto' }] },
          ],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'riga sotto' }] },
      ],
    },
  });
  await nextFrames(2);

  const rowsBefore = host.querySelectorAll('.tiptap-row').length;
  const rowDiv = host.querySelector('.tiptap-row');
  const itemWidthsBefore: number[] = [];
  const itemGapsBefore: number[] = [];
  {
    const rects: { left: number; right: number; width: number }[] = [];
    rowDiv?.querySelectorAll(':scope > *').forEach((el) => {
      const r = el.getBoundingClientRect();
      rects.push({ left: r.left, right: r.right, width: r.width });
      itemWidthsBefore.push(Math.round(r.width));
    });
    for (let i = 1; i < rects.length; i += 1) {
      itemGapsBefore.push(Math.round(rects[i].left - rects[i - 1].right));
    }
  }
  const firstItemType = editor.state.doc.firstChild!.type.name;

  // "+" destro sulla riga: aggiunge un Collapse affiancato.
  const rowPos = firstPosOf(editor, 'blockRow');
  editor.commands.addBlockToRow({ kind: 'collapseBlock', side: 'right', pos: rowPos });
  await nextFrames(2);
  const afterAddRowItems = rowBrothers(editor, firstPosOf(editor, 'blockRow'));

  // Blocco standalone (paragrafo sotto): il "+" sinistro lo avvolge in una
  // riga insieme al nuovo Testo.
  const frag = editor.state.doc.content;
  const childInfo: string[] = [];
  let off = 0;
  for (let i = 0; i < frag.childCount; i += 1) {
    const ch = frag.child(i);
    childInfo.push(`${ch.type.name}@${off}:${ch.nodeSize}`);
    off += ch.nodeSize;
  }
  console.log('[REPRO] doc children:', childInfo.join(', '));
  const pp = firstRootPosOf(editor, 'paragraph');
  editor.commands.addBlockToRow({ kind: 'paragraph', side: 'left', pos: pp });
  await nextFrames(2);
  const wrappedRowPos = (() => {
    let found = -1;
    editor.state.doc.descendants((node, pos) => {
      if (found !== -1) return false;
      if (node.type.name === 'blockRow') {
        let hasStandalone = false;
        node.forEach((child) => {
          if (child.type.name === 'paragraph' && child.textContent === 'riga sotto') hasStandalone = true;
        });
        if (hasStandalone) {
          found = pos;
          return false;
        }
      }
      return true;
    });
    return found;
  })();
  const afterAddRowParentOfStandalone = wrappedRowPos === -1 ? 'missing' : 'blockRow';
  const afterAddRowWrappedChildren = wrappedRowPos === -1 ? -1 : rowBrothers(editor, wrappedRowPos);
  const totalRowsAfterWraps = countType(editor, 'blockRow');
  // Caret dopo il wrap a sinistra: deve stare nel NUOVO primo elemento,
  // non nel secondo né fuori riga (stesso bug del testo-sotto su Collapse).
  let wrapCaretInNewItem = false;
  if (wrappedRowPos !== -1) {
    const $from = editor.state.selection.$from;
    for (let d = $from.depth; d >= 0; d -= 1) {
      if ($from.node(d).type.name === 'blockRow') {
        const row = $from.node(d);
        const rowStart = $from.before(d);
        const first = row.child(0);
        wrapCaretInNewItem = $from.pos >= rowStart + 1 && $from.pos <= rowStart + 1 + first.nodeSize;
        break;
      }
    }
  }

  // Bug 2: "+" a destra della riga avvolta + Testo → il caret deve finire
  // nell'ULTIMO elemento (quello nuovo), non nel primo né fuori riga.
  let caretInNewItem = false;
  let caretNewItemIndex = -1;
  if (wrappedRowPos !== -1) {
    editor.commands.addBlockToRow({ kind: 'paragraph', side: 'right', pos: wrappedRowPos });
    await nextFrames(2);
    const $from = editor.state.selection.$from;
    for (let d = $from.depth; d >= 0; d -= 1) {
      if ($from.node(d).type.name === 'blockRow') {
        const row = $from.node(d);
        const rowStart = $from.before(d);
        let off = rowStart + 1;
        for (let i = 0; i < row.childCount; i += 1) {
          const child = row.child(i);
          if ($from.pos >= off && $from.pos <= off + child.nodeSize) {
            caretNewItemIndex = i;
            break;
          }
          off += child.nodeSize;
        }
        caretInNewItem = caretNewItemIndex === row.childCount - 1;
        break;
      }
    }
  }

  // Frecce ai bordi: da fine primo elemento, dx deve saltare DENTRO il
  // secondo (mai nel gap che il browser disegna in alto).
  let arrowSkipsGap = false;
  let arrowChildIndex = -1;
  {
    let rpos = -1;
    let rnode: { childCount: number; child: (i: number) => { nodeSize: number } } | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (rpos !== -1) return false;
      if (node.type.name === 'blockRow' && node.childCount >= 2) {
        rpos = pos;
        rnode = node as unknown as { childCount: number; child: (i: number) => { nodeSize: number } };
        return false;
      }
      return true;
    });
    if (rpos !== -1 && rnode) {
      const firstEnd = rpos + 1 + rnode.child(0).nodeSize - 1;
      editor.chain().focus().setTextSelection({ from: firstEnd, to: firstEnd }).run();
      await nextFrames(1);
      editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39, which: 39, bubbles: true, cancelable: true }));
      await nextFrames(1);
      const $from = editor.state.selection.$from;
      for (let d = $from.depth; d >= 0; d -= 1) {
        if ($from.node(d).type.name === 'blockRow') {
          const row = $from.node(d);
          const rowStart = $from.before(d);
          let off = rowStart + 1;
          for (let i = 0; i < row.childCount; i += 1) {
            const child = row.child(i);
            if ($from.pos > off && $from.pos <= off + child.nodeSize) {
              arrowChildIndex = i;
              break;
            }
            off += child.nodeSize;
          }
          arrowSkipsGap = arrowChildIndex === 1 && $from.parent.type.name !== 'blockRow';
          break;
        }
      }
    }
  }

  // Invio dentro la riga (nella casella "dado"): spezza la riga, la serie
  // dal cursore alla fine scende su una riga nuova.
  const boxPos = firstNodePos(editor, 'textBox');
  const caretInBox = boxPos + 2;
  editor.chain().focus().setTextSelection({ from: caretInBox, to: caretInBox }).run();
  await nextFrames(1);
  editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
  await nextFrames(2);

  const rowsAfterEnter = countType(editor, 'blockRow');
  const caretRowIndexAfterEnter = (() => {
    const $from = editor.state.selection.$from;
    let caretRowPos = -1;
    for (let d = $from.depth; d >= 0; d -= 1) {
      if ($from.node(d).type.name === 'blockRow') {
        caretRowPos = $from.before(d);
        break;
      }
    }
    if (caretRowPos === -1) return -1;
    let index = 0;
    editor.state.doc.nodesBetween(0, caretRowPos, (node, pos) => {
      if (node.type.name === 'blockRow') {
        index += 1;
        return false;
      }
      return true;
    });
    return index;
  })();
  const caretPathTypes = getCaretPathTypes(editor);
  const boxCount = countType(editor, 'textBox');

  // Regressioni su contenuto fresco deterministico.
  const freshDoc = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'sopra' }] },
      {
        type: 'blockRow',
        content: [
          { type: 'textBox', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'dado' }] }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'mezzo' }] },
        ],
      },
      { type: 'paragraph', content: [{ type: 'text', text: 'sotto' }] },
    ],
  };
  const setFresh = async () => {
    editor.commands.setContent(JSON.parse(JSON.stringify(freshDoc)));
    await nextFrames(2);
  };
  const topLevel = () => {
    const out: { type: string; text: string }[] = [];
    editor.state.doc.content.forEach((child) => out.push({ type: child.type.name, text: child.textContent }));
    return out;
  };
  const findTextPara = (text: string): number => {
    let found = -1;
    editor.state.doc.descendants((node, pos) => {
      if (found !== -1) return false;
      if (node.type.name === 'paragraph' && node.textContent === text) {
        found = pos;
        return false;
      }
      return true;
    });
    return found;
  };

  // Regressione 1: riga [box, testo] meno box → riga srotolata MA testo kept.
  let singleParaTextKept = false;
  let singleParaRowsLeft = -1;
  await setFresh();
  {
    const tpos = firstNodePos(editor, 'textBox');
    const tnode = editor.state.doc.nodeAt(tpos);
    if (tpos !== -1 && tnode) {
      editor.view.dispatch(editor.state.tr.delete(tpos, tpos + tnode.nodeSize));
      await nextFrames(2);
      const top = topLevel();
      singleParaRowsLeft = top.filter((c) => c.type === 'blockRow').length;
      singleParaTextKept = top.some((c) => c.type === 'paragraph' && c.text === 'mezzo');
    }
  }

  // Regressione 2a: Up a inizio riga con paragrafo sopra → caret a fine "sopra".
  let upToPara = false;
  await setFresh();
  {
    const mpos = findTextPara('mezzo');
    if (mpos !== -1) {
      editor.chain().focus().setTextSelection({ from: mpos + 1, to: mpos + 1 }).run();
      await nextFrames(1);
      editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38, which: 38, bubbles: true, cancelable: true }));
      await nextFrames(1);
      const $from = editor.state.selection.$from;
      let inRow = false;
      for (let d = $from.depth; d >= 0; d -= 1) {
        if ($from.node(d).type.name === 'blockRow') {
          inRow = true;
          break;
        }
      }
      upToPara = !inRow && $from.parent.type.name === 'paragraph' && $from.parent.textContent === 'sopra';
    }
  }

  // Regressione 2b: Down a fine riga con paragrafo sotto → caret a inizio "sotto".
  let downToPara = false;
  await setFresh();
  {
    const mpos = findTextPara('mezzo');
    const mnode = mpos !== -1 ? editor.state.doc.nodeAt(mpos) : null;
    if (mpos !== -1 && mnode) {
      const endPos = mpos + mnode.nodeSize - 1;
      editor.chain().focus().setTextSelection({ from: endPos, to: endPos }).run();
      await nextFrames(1);
      editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, which: 40, bubbles: true, cancelable: true }));
      await nextFrames(1);
      const $from = editor.state.selection.$from;
      let inRow = false;
      for (let d = $from.depth; d >= 0; d -= 1) {
        if ($from.node(d).type.name === 'blockRow') {
          inRow = true;
          break;
        }
      }
      downToPara = !inRow && $from.parent.type.name === 'paragraph' && $from.parent.textContent === 'sotto' && $from.parentOffset === 0;
    }
  }

  // Regressione 2c: Up a inizio riga con vicino NON paragrafo (box sopra) →
  // NIENTE riga auto-creata: GapCursor visibile in attesa al confine.
  let upWaitsAtBoundary = false;
  {
    editor.commands.setContent({
      type: 'doc',
      content: [
        { type: 'textBox', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'dado' }] }] },
        {
          type: 'blockRow',
          content: [
            { type: 'textBox', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'box' }] }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'mezzo' }] },
          ],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'sotto' }] },
      ],
    });
    await nextFrames(2);
    const kidsBefore = (() => {
      let n = 0;
      editor.state.doc.content.forEach(() => {
        n += 1;
      });
      return n;
    })();
    const bpos = findTextPara('box');
    if (bpos !== -1) {
      editor.chain().focus().setTextSelection({ from: bpos + 1, to: bpos + 1 }).run();
      await nextFrames(1);
      editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38, which: 38, bubbles: true, cancelable: true }));
      await nextFrames(1);
      let kidsAfter = 0;
      editor.state.doc.content.forEach(() => {
        kidsAfter += 1;
      });
      upWaitsAtBoundary = editor.state.selection instanceof GapCursor && kidsAfter === kidsBefore;
    }
  }

  // Scenario utente: due righe, Up da inizio riga 2 → caret tra le righe,
  // coordinate reali tra le righe, e "X" digitata resta lì (non in riga).
  let upCaretBetweenRows = false;
  let upCaretY = -1;
  let upRowRects: { top: number; bottom: number }[] = [];
  let typedXLocation = 'none';
  {
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'blockRow',
          content: [
            { type: 'textBox', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'uno' }] }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'due' }] },
          ],
        },
        {
          type: 'blockRow',
          content: [
            { type: 'textBox', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'tre' }] }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'quattro' }] },
          ],
        },
      ],
    });
    await nextFrames(2);
    const tpos = findTextPara('tre');
    if (tpos !== -1) {
      editor.chain().focus().setTextSelection({ from: tpos + 1, to: tpos + 1 }).run();
      await nextFrames(1);
      editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38, which: 38, bubbles: true, cancelable: true }));
      await nextFrames(1);
      const caret = editor.view.coordsAtPos(editor.state.selection.from);
      upCaretY = Math.round(caret.top);
      host.querySelectorAll('.tiptap-row').forEach((el) => {
        const r = el.getBoundingClientRect();
        upRowRects.push({ top: Math.round(r.top), bottom: Math.round(r.bottom) });
      });
      if (upRowRects.length >= 2) {
        upCaretBetweenRows = upCaretY >= upRowRects[0].bottom && upCaretY <= upRowRects[1].top + 2;
      }
      editor.commands.insertContent('X');
      await nextFrames(2);
      const top: string[] = [];
      editor.state.doc.content.forEach((child) => top.push(`${child.type.name}:${child.textContent}`));
      const between = top.find((t) => t.startsWith('paragraph:') && t.includes('X'));
      const inRow = (() => {
        let found = false;
        editor.state.doc.descendants((node) => {
          if (node.type.name === 'blockRow' && node.textContent.includes('X')) found = true;
          return !found;
        });
        return found;
      })();
      typedXLocation = between && !inRow ? 'between-rows' : inRow ? 'in-row' : 'none:' + top.join('|');
    }
  }

  // Digitazione VERA (execCommand = stesso percorso dei tasti): caret tra le
  // righe + "Y" deve finire nel paragrafo tra le righe, non in riga.
  let typedYLocation = 'none';
  {
    const tpos = findTextPara('quattro');
    if (tpos !== -1) {
      editor.chain().focus().setTextSelection({ from: tpos + 1, to: tpos + 1 }).run();
      await nextFrames(1);
      editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38, which: 38, bubbles: true, cancelable: true }));
      await nextFrames(1);
      (editor.view.dom as HTMLElement).focus();
      document.execCommand('insertText', false, 'Y');
      await nextFrames(2);
      const top: string[] = [];
      editor.state.doc.content.forEach((child) => top.push(`${child.type.name}:${child.textContent}`));
      const between = top.find((t) => t.startsWith('paragraph:') && t.includes('Y'));
      const inRow = (() => {
        let found = false;
        editor.state.doc.descendants((node) => {
          if (node.type.name === 'blockRow' && node.textContent.includes('Y')) found = true;
          return !found;
        });
        return found;
      })();
      typedYLocation = between && !inRow ? 'between-rows' : inRow ? 'in-row' : 'none:' + top.join('|');
    }
  }

  // Gap in riga: niente paragrafo nuovo (testo solo via "+"), caret spostato
  // nel vicino seguente con altezza riga normale.
  let gapMaterialized = false;
  let gapParaHeight = -1;
  {
    let rpos = -1;
    let firstSize = -1;
    let kidsBefore = -1;
    editor.state.doc.descendants((node, pos) => {
      if (rpos !== -1) return false;
      if (node.type.name === 'blockRow' && node.childCount >= 2) {
        rpos = pos;
        firstSize = node.child(0).nodeSize;
        kidsBefore = node.childCount;
        return false;
      }
      return true;
    });
    if (rpos !== -1) {
      const gapPos = rpos + 1 + firstSize;
      editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, gapPos)));
      await nextFrames(2);
      const $from = editor.state.selection.$from;
      const row = editor.state.doc.nodeAt(rpos);
      gapMaterialized =
        $from.parent.type.name !== 'blockRow' && !!row && row.type.name === 'blockRow' && row.childCount === kidsBefore;
      const dom = editor.view.nodeDOM($from.before()) ?? editor.view.nodeDOM($from.pos);
      if (dom instanceof HTMLElement) gapParaHeight = Math.round(dom.getBoundingClientRect().height);
    }
  }

  // Invio a FINE riga: deve uscire sotto con paragrafo nuovo, riga intatta
  // (niente figlio vuoto in coda).
  let enterExitsRow = false;
  let enterRowIntact = false;
  {
    let rpos = -1;
    let rnode: { childCount: number; child: (i: number) => { nodeSize: number; textContent: string; type: { name: string } } } | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (rpos !== -1) return false;
      if (node.type.name === 'blockRow' && node.childCount >= 2) {
        rpos = pos;
        rnode = node as unknown as { childCount: number; child: (i: number) => { nodeSize: number; textContent: string; type: { name: string } } };
        return false;
      }
      return true;
    });
    if (rpos !== -1 && rnode) {
      const kidsBefore = rnode.childCount;
      let off = rpos + 1;
      for (let i = 0; i < rnode.childCount - 1; i += 1) off += rnode.child(i).nodeSize;
      const last = rnode.child(rnode.childCount - 1);
      const endPos = off + last.nodeSize - 1;
      editor.chain().focus().setTextSelection({ from: endPos, to: endPos }).run();
      await nextFrames(1);
      editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
      await nextFrames(2);
      const $from = editor.state.selection.$from;
      let inRow = false;
      for (let d = $from.depth; d >= 0; d -= 1) {
        if ($from.node(d).type.name === 'blockRow') {
          inRow = true;
          break;
        }
      }
      enterExitsRow = !inRow && $from.parent.type.name === 'paragraph' && $from.parent.textContent === '';
      const now = editor.state.doc.nodeAt(rpos);
      enterRowIntact = !!now && now.type.name === 'blockRow' && now.childCount === kidsBefore;
    }
  }

  // Nudge: caret piazzato nel gap diretto di riga (come da click) → spostato
  // nel vicino, mai lasciato lì a disegnarsi in alto.
  let gapNudged = false;
  {
    let rpos = -1;
    let firstSize = -1;
    editor.state.doc.descendants((node, pos) => {
      if (rpos !== -1) return false;
      if (node.type.name === 'blockRow' && node.childCount >= 2) {
        rpos = pos;
        firstSize = node.child(0).nodeSize;
        return false;
      }
      return true;
    });
    if (rpos !== -1) {
      const gapPos = rpos + 1 + firstSize;
      try {
        editor.chain().focus().setTextSelection({ from: gapPos, to: gapPos }).run();
      } catch {
        /* posizione non testuale: il nudge la gestisce comunque */
      }
      await nextFrames(2);
      const $from = editor.state.selection.$from;
      gapNudged = $from.parent.type.name !== 'blockRow';
    }
  }

  // GapCursor (quello che il plugin GapCursor crea a frecce/click ai bordi):
  // in riga o tra righe adiacenti a righe → convertito in paragrafo vero.
  let gapCursorConverted = false;
  let interRowGapConverted = false;
  {
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'blockRow',
          content: [
            { type: 'textBox', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'uno' }] }] },
            { type: 'textBox', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'due' }] }] },
          ],
        },
        {
          type: 'blockRow',
          content: [
            { type: 'textBox', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'tre' }] }] },
          ],
        },
      ],
    });
    await nextFrames(2);
    let rpos = -1;
    let firstSize = -1;
    editor.state.doc.descendants((node, pos) => {
      if (rpos !== -1) return false;
      if (node.type.name === 'blockRow' && node.childCount >= 2) {
        rpos = pos;
        firstSize = node.child(0).nodeSize;
        return false;
      }
      return true;
    });
    if (rpos !== -1) {
      const gapPos = rpos + 1 + firstSize;
      const kidsBefore = (editor.state.doc.nodeAt(rpos)?.childCount ?? -1);
      editor.view.dispatch(editor.state.tr.setSelection(new GapCursor(editor.state.doc.resolve(gapPos))));
      await nextFrames(2);
      const sel = editor.state.selection;
      let inRowChild = false;
      for (let d = sel.$from.depth; d >= 0; d -= 1) {
        if (sel.$from.node(d).type.name === 'blockRow') {
          inRowChild = sel.$from.parent.type.name !== 'blockRow';
          break;
        }
      }
      const rowNow = editor.state.doc.nodeAt(rpos);
      gapCursorConverted = !(sel instanceof GapCursor) && inRowChild && !!rowNow && rowNow.childCount === kidsBefore;
    }
    let secondRowPos = -1;
    {
      let seen = 0;
      editor.state.doc.descendants((node, pos) => {
        if (secondRowPos !== -1) return false;
        if (node.type.name === 'blockRow') {
          seen += 1;
          if (seen === 2) {
            secondRowPos = pos;
            return false;
          }
        }
        return true;
      });
    }
    if (secondRowPos !== -1) {
      editor.view.dispatch(editor.state.tr.setSelection(new GapCursor(editor.state.doc.resolve(secondRowPos))));
      await nextFrames(2);
      const sel = editor.state.selection;
      let rowCount = 0;
      editor.state.doc.content.forEach((child) => {
        if (child.type.name === 'blockRow') rowCount += 1;
      });
      interRowGapConverted = sel instanceof GapCursor && rowCount === 2;
    }
  }

  // Invio su GapCursor tra righe: nasce una vera riga di testo lì, caret dentro.
  let enterAtGapCreatesLine = false;
  {
    let secondRowPos = -1;
    {
      let seen = 0;
      editor.state.doc.descendants((node, pos) => {
        if (secondRowPos !== -1) return false;
        if (node.type.name === 'blockRow') {
          seen += 1;
          if (seen === 2) {
            secondRowPos = pos;
            return false;
          }
        }
        return true;
      });
    }
    if (secondRowPos === -1) {
      // Nessuna seconda riga rimasta: ricrea scenario minimale.
      editor.commands.setContent({
        type: 'doc',
        content: [
          { type: 'blockRow', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }] },
          { type: 'blockRow', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'b' }] }] },
        ],
      });
      await nextFrames(2);
      let seen = 0;
      editor.state.doc.descendants((node, pos) => {
        if (secondRowPos !== -1) return false;
        if (node.type.name === 'blockRow') {
          seen += 1;
          if (seen === 2) {
            secondRowPos = pos;
            return false;
          }
        }
        return true;
      });
    }
    if (secondRowPos !== -1) {
      editor.chain().focus();
      editor.view.dispatch(editor.state.tr.setSelection(new GapCursor(editor.state.doc.resolve(secondRowPos))));
      await nextFrames(1);
      editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
      await nextFrames(2);
      const sel = editor.state.selection;
      const atPara =
        !(sel instanceof GapCursor) && sel.$from.parent.type.name === 'paragraph' && sel.$from.parent.textContent === '';
      let between = false;
      {
        const top: string[] = [];
        editor.state.doc.content.forEach((child) => top.push(child.type.name));
        const idx = top.findIndex((t, i) => t === 'paragraph' && i > 0 && top[i - 1] === 'blockRow' && top[i + 1] === 'blockRow');
        between = idx !== -1;
      }
      enterAtGapCreatesLine = atPara && between;
    }
  }
  let emptyRowsAfterClear = -1;
  let rowsAfterClear = -1;
  {
    let target: { pos: number; size: number } | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (target) return false;
      if (node.type.name === 'blockRow' && node.childCount >= 2) {
        target = { pos, size: node.nodeSize };
        return false;
      }
      return true;
    });
    if (target) {
      const tr = editor.state.tr.delete(target.pos + 1, target.pos + target.size - 1);
      editor.view.dispatch(tr);
      await nextFrames(2);
      rowsAfterClear = countType(editor, 'blockRow');
      emptyRowsAfterClear = (() => {
        let n = 0;
        editor.state.doc.descendants((node) => {
          if (node.type.name !== 'blockRow') return true;
          let kids = 0;
          let content = false;
          node.forEach((child) => {
            kids += 1;
            if (child.type.name !== 'paragraph' || child.textContent.length > 0) content = true;
          });
          if (kids === 0 || !content) n += 1;
          return false;
        });
        return n;
      })();
    }
  }

  const result: RowsReproResult = {
    rowsBefore,
    itemWidthsBefore,
    itemGapsBefore,
    firstItemType,
    afterAddRowItems,
    afterAddRowParentOfStandalone,
    afterAddRowWrappedChildren,
    totalRowsAfterWraps,
    wrapCaretInNewItem,
    caretInNewItem,
    caretNewItemIndex,
    arrowSkipsGap,
    arrowChildIndex,
    singleParaTextKept,
    singleParaRowsLeft,
    upToPara,
    downToPara,
    upWaitsAtBoundary,
    upCaretBetweenRows,
    upCaretY,
    upRowRects,
    typedXLocation,
    typedYLocation,
    gapMaterialized,
    gapParaHeight,
    enterExitsRow,
    enterRowIntact,
    gapNudged,
    gapCursorConverted,
    interRowGapConverted,
    enterAtGapCreatesLine,
    rowsAfterClear,
    emptyRowsAfterClear,
    rowsAfterEnter,
    caretRowIndexAfterEnter,
    caretPathTypes,
    boxCount,
    doc: editor.getJSON(),
  };
  editor.destroy();
  host.remove();
  return result;
};