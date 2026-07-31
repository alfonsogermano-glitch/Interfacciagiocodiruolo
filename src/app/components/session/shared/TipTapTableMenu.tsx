import { BubbleMenu } from '@tiptap/react/menus';
import type { Editor } from '@tiptap/react';
import { findTable, TableMap, addRow, addColumn, type FindNodeResult } from '@tiptap/pm/tables';
import { Slice, Fragment } from '@tiptap/pm/model';
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

// Larghezza attuale di una colonna esistente (riga 0, quella che
// updateColumns legge per calcolare il <colgroup>) - preferisce il
// colwidth gia' salvato nel documento (nota gia' ridimensionata a mano,
// valore autorevole) e solo se assente misura dal DOM quella renderizzata
// (colonna mai toccata, ancora sul min-width di default).
function getColumnWidth(editor: Editor, found: FindNodeResult, col: number): number | null {
  const relPos = TableMap.get(found.node).map[col];
  const explicit = found.node.nodeAt(relPos)?.attrs.colwidth?.[0];
  if (explicit) return explicit;
  const dom = editor.view.nodeDOM(found.start + relPos);
  return dom instanceof HTMLElement ? Math.round(dom.getBoundingClientRect().width) || null : null;
}

function insertColumnAtEdge(editor: Editor, edge: 'start' | 'end') {
  const { state, view } = editor;
  const found = findTable(state.selection.$from);
  if (!found) return;
  const map = TableMap.get(found.node);

  // Larghezza di OGNI colonna esistente, letta PRIMA di costruire la
  // transazione (documento ancora "vecchio", stabile). updateColumns
  // (TableView) ricostruisce il <colgroup> riusando gli elementi <col>
  // ESISTENTI per POSIZIONE, non per identita' di colonna: inserendo a
  // "fine" la nuova colonna cade sempre oltre l'ultimo <col> esistente,
  // quindi ne crea sempre uno nuovo e pulito - inserendo a "inizio" invece
  // il PRIMO <col> esistente (che rappresentava la vecchia colonna 0)
  // viene riassegnato alla nuova colonna, mentre le altre colonne
  // scalano di un indice. Dare un colwidth esplicito SOLO alla cella
  // nuova (fix precedente) lasciava le colonne scalate senza una
  // larghezza coerente in riga 0 per quello stesso passaggio - qui invece
  // ristampiamo esplicitamente la larghezza di TUTTE le colonne (nuova
  // compresa) cosi' riga 0 e' sempre internamente coerente, in entrambi i
  // casi - bug verificato 2026-07-29 (funzionava solo per "fine").
  const existingWidths = Array.from({ length: map.width }, (_, col) => getColumnWidth(editor, found, col));
  const newColumnWidth = edge === 'start' ? existingWidths[0] : existingWidths[existingWidths.length - 1];

  const rect = { map, tableStart: found.start, table: found.node, left: 0, right: map.width, top: 0, bottom: map.height };
  const targetCol = edge === 'start' ? 0 : map.width;
  const tr = addColumn(state.tr, rect, targetCol);

  const tableStart = tr.mapping.map(found.start);
  const newTable = tr.doc.nodeAt(tableStart - 1);
  if (newTable) {
    const newMap = TableMap.get(newTable);
    for (let row = 0; row < newMap.height; row++) {
      for (let col = 0; col < newMap.width; col++) {
        // Per ogni colonna della tabella AGGIORNATA, risale a quale
        // larghezza usare: la nuova colonna prende newColumnWidth, le
        // altre la loro larghezza pre-inserimento (indice scalato di 1
        // per "inizio", invariato per "fine", vedi il commento sopra).
        const width = col === targetCol ? newColumnWidth : existingWidths[edge === 'start' ? col - 1 : col];
        if (!width) continue;
        const cellPos = tableStart + newMap.positionAt(row, col, newTable);
        const cellNode = tr.doc.nodeAt(cellPos);
        if (cellNode) {
          tr.setNodeMarkup(cellPos, null, { ...cellNode.attrs, colwidth: [width] });
        }
      }
    }
  }

  view.dispatch(tr);
  editor.commands.focus();
}

// TSV (righe/celle separate da \n/\t, testo puro) - invariato rispetto alla
// versione precedente di "copia tabella": resta l'unico formato utile per
// incollare in un vero foglio elettronico esterno (Excel/Google Sheets), che
// non capirebbe comunque l'HTML ricco scritto in parallelo sotto.
function tableAsTsv(tableNode: FindNodeResult['node']): string {
  const rows: string[] = [];
  tableNode.forEach((rowNode) => {
    const cells: string[] = [];
    rowNode.forEach((cellNode) => {
      cells.push(cellNode.textContent.replace(/\t/g, ' ').replace(/\n/g, ' '));
    });
    rows.push(cells.join('\t'));
  });
  return rows.join('\n');
}

// "Copia tabella": scrive SIA l'HTML ricco (per re-incollare la tabella
// intera, TextBox/Collapse annidati compresi, altrove nello stesso editor)
// SIA il TSV (per incollare in un'app esterna, vedi tableAsTsv sopra) - due
// MIME type nello stesso ClipboardItem, non due scritte separate (un secondo
// clipboard.write() sovrascriverebbe il primo).
//
// L'HTML ricco NON e' costruito a mano: editor.view.serializeForClipboard()
// e' lo stesso metodo pubblico (node_modules/prosemirror-view, tipizzato in
// index.d.ts) che ProseMirror usa internamente per il vero Ctrl+C nativo
// (handlers.copy) - produce un <div> via DOMSerializer.fromSchema (lo stesso
// renderHTML di ogni nodo, incluso il contentElement di TextBox/Collapse in
// tiptapBlocks.tsx, gia' pensato per il copia-incolla interno) con un
// attributo data-pm-slice che il parser di incolla nativo (parseFromClipboard,
// stesso modulo) riconosce per ricostruire lo slice originale esatto -
// nessun reparse HTML "a tentativi" ne' logica di ricostruzione nostra.
//
// Lo slice e' costruito a mano da found.node (new Slice(Fragment.from(...),
// 0, 0), stesso risultato di NodeSelection.content() per un nodo singolo)
// invece di selezionare davvero la tabella con una NodeSelection e leggere
// state.selection.content(): questa sessione ha gia' visto bug sottili
// legati alla NodeSelection sulla maniglia della tabella (vedi
// tiptapTableHandle.ts) - costruire lo slice senza mai toccare
// editor.state.selection evita del tutto quella classe di problemi qui,
// invece di limitarsi a "funzionare lo stesso".
//
// ClipboardItem/clipboard.write (non clipboard.writeText, usato altrove
// nell'app - vedi HomeScreen.tsx/copyInviteCode) e' l'unica API che permette
// di scrivere piu' MIME type in un colpo solo - supportata nei browser
// moderni ma piu' recente/meno diffusa di writeText, da cui il fallback
// esplicito al solo TSV se assente o se la scrittura fallisce (es. permesso
// negato) invece di lasciare "copia tabella" silenziosamente senza effetto.
function copyTableRich(editor: Editor) {
  const { state, view } = editor;
  const found = findTable(state.selection.$from);
  if (!found) return;

  const tsv = tableAsTsv(found.node);

  const ClipboardItemCtor = typeof ClipboardItem !== 'undefined' ? ClipboardItem : null;
  if (ClipboardItemCtor) {
    const slice = new Slice(Fragment.from(found.node), 0, 0);
    const { dom } = view.serializeForClipboard(slice);
    const item = new ClipboardItemCtor({
      'text/plain': new Blob([tsv], { type: 'text/plain' }),
      'text/html': new Blob([dom.innerHTML], { type: 'text/html' }),
    });
    navigator.clipboard.write([item]).catch(() => {
      void navigator.clipboard.writeText(tsv);
    });
    return;
  }

  void navigator.clipboard.writeText(tsv);
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
      onClick: () => copyTableRich(editor),
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
      // offset: 2 invece del default della libreria (8px) - il gap tra il
      // bottone ⋮ e l'angolo della tabella risultava troppo largo (segnalato
      // 2026-07-29), avvicinato qui invece di intervenire su
      // getReferencedVirtualElement (che ancora correttamente all'angolo
      // reale della tabella, il .tableWrapper renderizzato da TableView).
      //
      // flip: DISATTIVATO esplicitamente (flip:false, non semplicemente
      // omesso - BubbleMenuView parte da flip:{} nei suoi default, un
      // oggetto vuoto e' comunque truthy, quindi ometterlo qui l'avrebbe
      // lasciato attivo). Due tentativi precedenti (boundary su
      // editor.view.dom.parentElement, poi rimozione del relativo padding)
      // avevano provato a rendere il flip verticale meno aggressivo invece
      // di eliminarlo - scelta finale piu' semplice e robusta (2026-07-29,
      // terzo giro): l'icona resta SEMPRE a placement:'top-end' fisso, mai
      // spostata sotto la tabella. Lo spazio che il flip andava a cercare
      // quando mancava sopra la tabella e' garantito invece a monte da un
      // margin-top sulla regola `.tiptap-content .tableWrapper` in
      // theme.css - IMPORTANTE: sul wrapper, non sul <table> interno (bug
      // corretto 2026-07-29, quarto giro: getReferencedVirtualElement qui
      // sotto usa view.nodeDOM(found.pos), che per una tabella
      // ridimensionabile restituisce .tableWrapper, non il <table> - un
      // margin-top sul <table> sposta la tabella DENTRO il wrapper senza
      // spostare il bordo superiore del wrapper stesso, cioe' senza alcun
      // effetto sulla posizione reale dell'icona).
      //
      // shift: resta attivo, senza padding (vedi giro precedente - con un
      // padding qualunque tabella larga quanto il contenitore veniva
      // trattata come overflow orizzontale anche nel caso comune) - copre
      // solo il caso limite orizzontale (tabella vicina al bordo
      // sinistro/destro), indipendente dal flip verticale rimosso sopra.
      options={{
        placement: 'top-end',
        offset: 2,
        flip: false,
        shift: { boundary: editor.view.dom.parentElement ?? undefined },
      }}
      getReferencedVirtualElement={() => {
        const { state, view } = editor;
        const found = findTable(state.selection.$from);
        if (!found) return null;
        const dom = view.nodeDOM(found.pos);
        if (!(dom instanceof HTMLElement)) return null;
        return { getBoundingClientRect: () => dom.getBoundingClientRect() };
      }}
    >
      <EntityKebabMenu
        items={items}
        colors={getCurrentPaletteColors()}
        menuWidthClassName="w-64"
        menuWidthPx={256}
        // Stesso elemento gia' usato come boundary di flip/shift qui sopra
        // per l'icona - il dropdown (portal indipendente su document.body
        // dentro EntityKebabMenu.tsx, senza collision detection propria)
        // condivide cosi' lo stesso riferimento all'area di scrittura.
        boundaryElement={editor.view.dom.parentElement}
        // MoreHorizontal invece del MoreVertical di default - solo qui,
        // gli altri 8 punti d'uso di EntityKebabMenu restano invariati.
        iconOrientation="horizontal"
      />
    </BubbleMenu>
  );
}
