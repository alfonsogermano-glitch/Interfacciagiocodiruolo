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
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/tooltip';
import type { ReactNode } from 'react';

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

// Pannello verticale di azioni tabella (round 2026-08-07, sostituisce il
// vecchio bottone ⋮/EntityKebabMenu): stile duplicato da ToolbarButton in
// RichTextEditor.tsx (bottone quadrato h-9 w-9, tooltip side="right")
// invece di importarlo da li' - e' un componente locale/non esportato in
// quel file, e duplicarlo qui evita qualunque rischio sugli 8 altri punti
// d'uso di EntityKebabMenu e sulla toolbar principale (nessun modulo
// condiviso da tenere sincronizzato fra usi con requisiti diversi: qui
// serve anche la variante "danger", mai richiesta li'). onClick diretto
// (non piu' un array di {key,icon,label,onClick} passato a un componente
// esterno): 10 bottoni fissi, nessun beneficio a mappare su una lista dati
// quando il markup e' comunque scritto a mano qui sotto.
function TableMenuButton({ icon, label, onClick, danger }: { icon: ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md p-1.5 transition-colors ${
            danger ? 'text-red-300 hover:bg-red-500/10' : 'text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text-strong)]'
          }`}
        >
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

// Separatore fra i 4 gruppi (Righe/Colonne/Intestazioni/Tabella) - una
// semplice linea, non una ToolbarSection collassabile: il pannello e' gia'
// visibile solo quando serve (dentro la tabella), comprimere i gruppi non
// avrebbe alcun beneficio qui a differenza della toolbar principale, sempre
// presente indipendentemente dal contesto.
function TableMenuSeparator() {
  return <div className="my-1 h-px w-full bg-[var(--dash-border-soft)]" />;
}

/**
 * Pannello contestuale della tabella (RichTextEditor.tsx) - un BubbleMenu
 * (@tiptap/react/menus, gia' incluso in @tiptap/react) con shouldShow legato
 * a editor.isActive('table') invece che alla selezione di testo, e
 * getReferencedVirtualElement per ancorarlo all'angolo della <table> DOM
 * reale invece che inseguire il cursore cella per cella. Round 2026-08-07:
 * non piu' un bottone ⋮ che apre una tendina (EntityKebabMenu) - una
 * colonna verticale di azioni raggruppate, sempre visibile quando la
 * selezione e' dentro la tabella, affiancata sul lato DESTRO invece che
 * sovrapposta all'angolo in alto (placement sotto).
 */
export function TipTapTableMenu({ editor }: { editor: Editor }) {
  return (
    <BubbleMenu
      editor={editor}
      pluginKey="tableMenu"
      shouldShow={({ editor: e }) => e.isActive('table')}
      // placement 'right-start' (round 2026-08-07, era 'top-end'): il
      // pannello e' ora una colonna verticale di bottoni, non piu' una
      // singola icona - non ha piu' senso sovrapporlo all'angolo della
      // tabella, ne' farlo dipendere dallo spazio sopra di essa (lo spazio
      // riservato per quello, il margin-top di .tableWrapper, e' stato
      // rimosso nello stesso round - vedi theme.css e
      // tiptapTextBoxEdgeCursor.ts/exitTableTopEdge). Affiancato a destra
      // invece: stesso identico meccanismo di ancoraggio
      // (getReferencedVirtualElement sotto, invariato) e stessa filosofia
      // "posizione fissa, mai flip" di prima - flip:false per lo stesso
      // motivo di sempre (mai un salto imprevedibile fra due lati in base
      // allo spazio disponibile).
      //
      // shift, primo giro (stesso round): ENTRAMBI gli assi esplicitamente
      // attivi, boundary ancora editor.view.dom.parentElement come per
      // 'top-end' - bug verificato dal vivo: con placement 'top-end' il
      // vecchio `shift:{boundary}` (senza altro) correggeva gia' da solo
      // l'orizzontale (per quel placement, il "mainAxis" interno di
      // shift() e' 'x' - checkMainAxis default true, verificato nel
      // sorgente di @floating-ui/core, getSideAxis('top')==='y' quindi
      // mainAxis=getOppositeAxis('y')==='x'). Per 'right-start' i due assi
      // di shift si INVERTONO (getSideAxis('right')==='x', quindi
      // mainAxis diventa 'y'): senza crossAxis:true esplicito, il pannello
      // restava corretto solo in verticale (mainAxis, default true) ma
      // MAI in orizzontale (crossAxis, default false).
      //
      // boundary, SECONDO giro (stesso round, bug verificato dal vivo
      // subito dopo il primo fix): con crossAxis:true MA boundary ancora
      // editor.view.dom.parentElement (l'area di scrittura, stretta),
      // shift correggeva si' l'overflow orizzontale - ma l'UNICO spazio
      // "libero" dentro quel confine stretto, quando la tabella e' larga
      // quanto il confine stesso (width:100% su .tiptap-content table,
      // theme.css, il caso comune - non un limite), e' quello SOPRA la
      // tabella: shift ci spingeva dentro il pannello, sovrapposto alla
      // tabella invece che accanto (misurato dal vivo: panel.left finiva
      // 42px DENTRO table.right). boundary:document.body invece di
      // editor.view.dom.parentElement risolve alla radice - non e' un
      // valore piu' permissivo dello stesso meccanismo, e' un input
      // diverso a getClippingRect() (@floating-ui/dom): per un `boundary`
      // che e' un singolo Element (non la stringa 'clippingAncestors'),
      // la funzione usa SOLO il rect di quell'elemento (intersecato con
      // rootBoundary, 'viewport' di default) - MAI la catena reale di
      // antenati con overflow (verificato nel sorgente:
      // `elementClippingAncestors = boundary === 'clippingAncestors' ? ... : [].concat(boundary)`).
      // Passare l'area di scrittura la rendeva quindi l'UNICO limite
      // considerato, ignorando che il vero spazio disponibile e' tutta la
      // finestra del browser; document.body (che di norma copre l'intera
      // larghezza viewport) intersecato col rootBoundary 'viewport' da'
      // invece il confine reale - il pannello puo' ora sconfinare nella
      // barra delle sezioni campagna a sinistra dell'area di scrittura
      // (accettato) invece di retrocedere sopra la tabella (bug).
      // mainAxis (verticale) resta true di default - tabella vicina al
      // fondo dell'area di scrittura, pannello alto quanto i suoi gruppi
      // di bottoni, altrimenti sforerebbe sotto.
      options={{
        placement: 'right-start',
        offset: 8,
        flip: false,
        shift: { boundary: document.body, crossAxis: true },
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
      {/* onMouseDown preventDefault sull'intero pannello - stesso motivo
          gia' documentato per il vecchio EntityKebabMenu qui (rimosso):
          senza, il click su un bottone sposta il focus del browser PRIMA
          che l'onClick scatti, il contenteditable va in blur, e
          RichTextEditor (onBlurEditor) uscirebbe dalla modalita' modifica
          a meta' click, prima ancora che il comando sulla tabella giri. */}
      <div
        onMouseDown={(e) => e.preventDefault()}
        className="flex flex-col gap-1 rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-1.5 shadow-2xl"
      >
        <TableMenuButton icon={<ArrowUpToLine className="h-4 w-4" />} label="Aggiungi riga a inizio" onClick={() => insertRowAtEdge(editor, 'start')} />
        <TableMenuButton icon={<ArrowDownToLine className="h-4 w-4" />} label="Aggiungi riga a fine" onClick={() => insertRowAtEdge(editor, 'end')} />
        <TableMenuButton icon={<Rows3 className="h-4 w-4" />} label="Elimina riga" danger onClick={() => editor.chain().focus().deleteRow().run()} />
        <TableMenuSeparator />
        <TableMenuButton icon={<ArrowLeftToLine className="h-4 w-4" />} label="Aggiungi colonna a inizio" onClick={() => insertColumnAtEdge(editor, 'start')} />
        <TableMenuButton icon={<ArrowRightToLine className="h-4 w-4" />} label="Aggiungi colonna a fine" onClick={() => insertColumnAtEdge(editor, 'end')} />
        <TableMenuButton icon={<Columns3 className="h-4 w-4" />} label="Elimina colonna" danger onClick={() => editor.chain().focus().deleteColumn().run()} />
        <TableMenuSeparator />
        <TableMenuButton icon={<PanelTop className="h-4 w-4" />} label="Intestazione orizzontale" onClick={() => editor.chain().focus().toggleHeaderRow().run()} />
        <TableMenuButton icon={<PanelLeft className="h-4 w-4" />} label="Intestazione verticale" onClick={() => editor.chain().focus().toggleHeaderColumn().run()} />
        <TableMenuSeparator />
        <TableMenuButton icon={<Copy className="h-4 w-4" />} label="Copia tabella" onClick={() => copyTableRich(editor)} />
        <TableMenuButton icon={<Trash2 className="h-4 w-4" />} label="Elimina tabella" danger onClick={() => editor.chain().focus().deleteTable().run()} />
      </div>
    </BubbleMenu>
  );
}
