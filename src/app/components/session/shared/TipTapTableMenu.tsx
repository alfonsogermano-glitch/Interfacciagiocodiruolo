import { BubbleMenu } from '@tiptap/react/menus';
import type { Editor } from '@tiptap/react';
import { findTable, TableMap, addRow, addColumn } from '@tiptap/pm/tables';
import {
  ArrowUpToLine,
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  Rows3,
  Columns3,
  PanelTop,
  PanelLeft,
  Copy,
  Trash2,
} from 'lucide-react';
import { EntityKebabMenu, type EntityKebabMenuItem } from './EntityKebabMenu';
import { PALETTE_COLORS, DEFAULT_PALETTE_COLORS, type PaletteId } from '../../ui/paletteColors';

// Stesso helper duplicato in SessionCharactersPanel.tsx/useCampaignNotesSection.tsx
// (nessun modulo condiviso lo espone ancora) - legge la palette attiva dal
// data-attribute impostato a livello di dashboard, per colorare il menu
// coerentemente col resto dell'app invece che con un default fisso.
function getCurrentPaletteColors() {
  const el = document.querySelector('[data-dashboard-palette]');
  const palette = el?.getAttribute('data-dashboard-palette') as PaletteId | null;
  return palette && PALETTE_COLORS[palette] ? PALETTE_COLORS[palette] : DEFAULT_PALETTE_COLORS;
}

// addRow/addColumn (prosemirror-tables, ri-esportate da @tiptap/pm/tables)
// accettano un indice di riga/colonna ESPLICITO - a differenza dei comandi
// nativi addRowBefore/After (sempre relativi alla riga/colonna del cursore),
// servono per "aggiungi a inizio/fine tabella" indipendentemente da dove si
// trovi il cursore. Il tipo TableRect richiede anche left/top/right/bottom
// (l'area di selezione multi-cella) ma addRow/addColumn, verificato nel
// sorgente, li ignorano del tutto - qui valorizzati con l'intera tabella
// solo per restare semanticamente coerenti col tipo, non perche' servano.
function insertRowAtEdge(editor: Editor, edge: 'start' | 'end') {
  const { state, view } = editor;
  const found = findTable(state.selection.$from);
  if (!found) return;
  const map = TableMap.get(found.node);
  const rect = { map, tableStart: found.start, table: found.node, left: 0, right: map.width, top: 0, bottom: map.height };
  const tr = addRow(state.tr, rect, edge === 'start' ? 0 : map.height);
  view.dispatch(tr);
  editor.commands.focus();
}

function insertColumnAtEdge(editor: Editor, edge: 'start' | 'end') {
  const { state, view } = editor;
  const found = findTable(state.selection.$from);
  if (!found) return;
  const map = TableMap.get(found.node);
  const rect = { map, tableStart: found.start, table: found.node, left: 0, right: map.width, top: 0, bottom: map.height };
  const tr = addColumn(state.tr, rect, edge === 'start' ? 0 : map.width);
  view.dispatch(tr);
  editor.commands.focus();
}

// Nessun comando nativo per "copia tabella": serializzazione minima in TSV
// (righe/celle separate da \n/\t, testo puro) - si incolla in modo
// utilizzabile sia in un altro punto dello stesso editor sia in un vero
// foglio elettronico esterno. Stesso pattern di HomeScreen.tsx
// (copyInviteCode) per il resto: navigator.clipboard.writeText diretto,
// nessuna gestione di permessi aggiuntiva.
function copyTableAsText(editor: Editor) {
  const { state } = editor;
  const found = findTable(state.selection.$from);
  if (!found) return;
  const rows: string[] = [];
  found.node.forEach((rowNode) => {
    const cells: string[] = [];
    rowNode.forEach((cellNode) => {
      cells.push(cellNode.textContent.replace(/\t/g, ' ').replace(/\n/g, ' '));
    });
    rows.push(cells.join('\t'));
  });
  void navigator.clipboard.writeText(rows.join('\n'));
}

/**
 * Menu contestuale della tabella (RichTextEditor.tsx) - un BubbleMenu
 * (@tiptap/react/menus, gia' incluso in @tiptap/react) con shouldShow legato
 * a editor.isActive('table') invece che alla selezione di testo, e
 * getReferencedVirtualElement per ancorarlo all'angolo della <table> DOM
 * reale invece che inseguire il cursore cella per cella. Il contenuto e'
 * un EntityKebabMenu (stesso menu ⋮ gia' usato per PG/PNG/Mostri) invece di
 * un dropdown nuovo.
 */
export function TipTapTableMenu({ editor }: { editor: Editor }) {
  const items: EntityKebabMenuItem[] = [
    {
      key: 'row-start',
      icon: <ArrowUpToLine className="h-4 w-4" />,
      label: 'Aggiungi riga a inizio',
      onClick: () => insertRowAtEdge(editor, 'start'),
    },
    {
      key: 'row-end',
      icon: <ArrowDownToLine className="h-4 w-4" />,
      label: 'Aggiungi riga a fine',
      onClick: () => insertRowAtEdge(editor, 'end'),
    },
    {
      key: 'col-start',
      icon: <ArrowLeftToLine className="h-4 w-4" />,
      label: 'Aggiungi colonna a inizio',
      onClick: () => insertColumnAtEdge(editor, 'start'),
    },
    {
      key: 'col-end',
      icon: <ArrowRightToLine className="h-4 w-4" />,
      label: 'Aggiungi colonna a fine',
      onClick: () => insertColumnAtEdge(editor, 'end'),
    },
    {
      key: 'delete-row',
      icon: <Rows3 className="h-4 w-4" />,
      label: 'Elimina riga',
      onClick: () => editor.chain().focus().deleteRow().run(),
      danger: true,
    },
    {
      key: 'delete-col',
      icon: <Columns3 className="h-4 w-4" />,
      label: 'Elimina colonna',
      onClick: () => editor.chain().focus().deleteColumn().run(),
      danger: true,
    },
    {
      key: 'header-row',
      icon: <PanelTop className="h-4 w-4" />,
      label: 'Intestazione orizzontale',
      onClick: () => editor.chain().focus().toggleHeaderRow().run(),
    },
    {
      key: 'header-col',
      icon: <PanelLeft className="h-4 w-4" />,
      label: 'Intestazione verticale',
      onClick: () => editor.chain().focus().toggleHeaderColumn().run(),
    },
    {
      key: 'copy',
      icon: <Copy className="h-4 w-4" />,
      label: 'Copia tabella',
      onClick: () => copyTableAsText(editor),
    },
    {
      key: 'delete-table',
      icon: <Trash2 className="h-4 w-4" />,
      label: 'Elimina tabella',
      onClick: () => editor.chain().focus().deleteTable().run(),
      danger: true,
    },
  ];

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="tableMenu"
      shouldShow={({ editor: e }) => e.isActive('table')}
      options={{ placement: 'top-end' }}
      getReferencedVirtualElement={() => {
        const { state, view } = editor;
        const found = findTable(state.selection.$from);
        if (!found) return null;
        const dom = view.nodeDOM(found.pos);
        if (!(dom instanceof HTMLElement)) return null;
        return { getBoundingClientRect: () => dom.getBoundingClientRect() };
      }}
    >
      <EntityKebabMenu items={items} colors={getCurrentPaletteColors()} menuWidthClassName="w-64" menuWidthPx={256} />
    </BubbleMenu>
  );
}
