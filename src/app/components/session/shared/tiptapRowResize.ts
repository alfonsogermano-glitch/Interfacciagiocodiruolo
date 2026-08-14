import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { resolveRowDropItem } from './tiptapRowDrop';

// Fase 5c del progetto "affiancamento a livello documento" (piano confermato
// 2026-08-09): trascinamento manuale del confine fra due rowItem affiancati,
// per impostare rowGrow (schema gia' pronto da Fase 5b). Stesso pattern di
// columnResizing di prosemirror-tables (node_modules/prosemirror-tables/
// dist/index.js, funzione columnResizing) - verificato leggendo il
// sorgente: NON e' drag&drop nativo HTML5 (a differenza di
// tiptapRowDrop.ts), sono mousedown/mousemove/mouseup NATIVI, con la fase
// attiva del trascinamento su listener a livello di window (non view.dom),
// cosi' il trascinamento resta fluido anche se il cursore esce
// temporaneamente dai bordi dell'editor. Nessuna transazione ProseMirror ad
// ogni pixel durante il drag (mutazione diretta dello stile per il feedback
// live, come displayColumnWidth di columnResizing) - una sola transazione
// al rilascio (come updateColumnWidth).

// Stesso valore di columnResizing (handleWidth default 5px).
const HANDLE_WIDTH = 5;

const rowResizePluginKey = new PluginKey<RowResizeState>('rowResize');

interface RowResizeState {
  // Confine "sotto il mouse" ma non ancora in trascinamento - solo le due
  // posizioni, non le larghezze/i rapporti (quelli si misurano di nuovo,
  // freschi, al mousedown che avvia il drag vero).
  active: { leftItemPos: number; rightItemPos: number } | null;
  dragging: boolean;
}

// Vero se due elementi sono sulla stessa riga VISIVA del flex-wrap (non
// solo fratelli DOM adiacenti) - senza questo controllo, il primo elemento
// di una riga andata a capo verrebbe accoppiato con l'ultimo elemento della
// riga sopra (adiacente nel DOM, ma non nello spazio), un confine che non
// esiste visivamente.
function sameFlexLine(a: HTMLElement, b: HTMLElement): boolean {
  return Math.abs(a.getBoundingClientRect().top - b.getBoundingClientRect().top) < 1;
}

interface EdgePair {
  leftEl: HTMLElement;
  rightEl: HTMLElement;
  leftItemPos: number;
  rightItemPos: number;
}

// Nucleo condiviso mousemove (hover) e mousedown (avvio drag) - stesso
// principio di computeSideDrop in tiptapRowDrop.ts (Fase 4b): un solo posto
// per "dato un evento del mouse, quale confine intende l'utente".
//
// Itera le COPPIE di figli diretti di .tiptap-row-flex invece di risalire
// da event.target verso un singolo "hovered item piu' vicino" (bug trovato
// dal vivo con un trascinamento reale: column-gap e' un vero gap CSS, non
// un margine di uno dei due elementi - un punto del mouse ESATTAMENTE nel
// gap non e' mai sopra il rettangolo di NESSUNO dei due fratelli, quindi
// event.target risolve al contenitore stesso, non a un figlio, e la
// vecchia risalita falliva silenziosamente proprio nella zona piu' naturale
// per afferrare il confine). Qui invece si controlla direttamente, per
// ogni coppia adiacente, se clientX cade in una finestra che include
// l'intero gap PIU' handleWidth di margine su entrambi i lati - copre gap
// e bordi degli elementi in un colpo solo, indipendente da quale elemento
// (se non nessuno) event.target abbia effettivamente colpito.
function computeEdgePair(view: EditorView, event: MouseEvent): EdgePair | null {
  if (!(event.target instanceof Element)) return null;
  const container = event.target.closest<HTMLElement>('.tiptap-row-flex');
  if (!container) return null;

  const children = Array.from(container.children).filter((c): c is HTMLElement => c instanceof HTMLElement);
  for (let i = 0; i < children.length - 1; i += 1) {
    const leftEl = children[i];
    const rightEl = children[i + 1];
    if (!sameFlexLine(leftEl, rightEl)) continue;

    const leftRect = leftEl.getBoundingClientRect();
    const rightRect = rightEl.getBoundingClientRect();
    const top = Math.min(leftRect.top, rightRect.top);
    const bottom = Math.max(leftRect.bottom, rightRect.bottom);
    if (event.clientY < top || event.clientY > bottom) continue;
    if (event.clientX < leftRect.right - HANDLE_WIDTH || event.clientX > rightRect.left + HANDLE_WIDTH) continue;

    const leftItem = resolveRowDropItem(view.state.doc, view.posAtDOM(leftEl, 0));
    const rightItem = resolveRowDropItem(view.state.doc, view.posAtDOM(rightEl, 0));
    if (!leftItem || !rightItem) return null;
    return { leftEl, rightEl, leftItemPos: leftItem.itemPos, rightItemPos: rightItem.itemPos };
  }
  return null;
}

function setActive(view: EditorView, active: RowResizeState['active']) {
  view.dispatch(view.state.tr.setMeta(rowResizePluginKey, { setActive: active }));
}

function setDragging(view: EditorView, dragging: boolean) {
  view.dispatch(view.state.tr.setMeta(rowResizePluginKey, { setDragging: dragging }));
}

// Stato completo di UN trascinamento in corso - vive in una chiusura
// locale a startDrag (non nello stato del plugin, a differenza di
// active/dragging sopra che invece devono essere leggibili da
// props.attributes per il cursore): nessun altro punto del codice ha
// bisogno di leggere larghezze/rapporti di partenza mentre il drag e' in
// corso.
interface DragSession {
  leftEl: HTMLElement;
  rightEl: HTMLElement;
  leftItemPos: number;
  rightItemPos: number;
  startX: number;
  totalWidth: number;
  minLeftWidth: number;
  minRightWidth: number;
  sumGrow: number;
  leftStartWidth: number;
}

function readEffectiveGrow(view: EditorView, itemPos: number): number {
  const node = view.state.doc.nodeAt(itemPos);
  const rowGrow = node?.attrs.rowGrow as number | null | undefined;
  return rowGrow ?? 1;
}

// Floor nativo della tabella: somma delle larghezze di colonna attuali
// (colgroup, gia' clampate a cellMinWidth=25 dal resize colonna nativo
// di prosemirror-tables se l'utente ne ha mai trascinata una) o 25px di
// default per ogni colonna non ancora ridimensionata individualmente -
// stesso valore di cellMinWidth (columnResizing, prosemirror-tables,
// mai configurato in questo codebase, vedi tiptapTableHandle.ts).
// Deciso in fase di pianificazione FIX 2 (punto 4): la tabella NON va
// mai misurata con la tecnica width:min-content usata sotto per il
// resto - table-layout:fixed rende quel numero poco significativo, la
// fonte di verita' e' colgroup.
function measureTableNativeMin(tableWrapper: HTMLElement): number {
  const table = tableWrapper.querySelector('table');
  const cols = table?.querySelectorAll('colgroup col') ?? [];
  if (cols.length === 0) return 25;
  let sum = 0;
  cols.forEach((col) => {
    const w = parseFloat((col as HTMLElement).style.width);
    sum += Number.isFinite(w) ? Math.max(w, 25) : 25;
  });
  return sum;
}

// Minimo REALE di un elemento del confine del drag (Fase 5c, piano
// confermato 2026-08-09 - aggiornato 2026-08-14, "il minimo raggiungibile
// deve tenere conto ricorsivamente del minimo reale di tutto cio' che
// contiene"): con min-width:0 (theme.css) il CSS non esprime piu' alcun
// floor riutilizzabile per il clamp del drag - getComputedStyle(el).minWidth
// restituirebbe quasi sempre 0, lasciando il drag libero di scendere
// sotto il minimo reale di un elemento con figli annidati (row dentro
// TextBox dentro row, "Problema A" del progetto affiancamento),
// causando l'overflow visivo dei figli oltre il proprio contenitore -
// gia' misurato dal vivo in fase di indagine (bordo destro dei figli
// annidati oltre il bordo destro del contenitore esterno).
//
// Tecnica: chiedere al BROWSER il min-content reale (width:min-content)
// di un CLONE fuori dal flusso, invece di reimplementare a mano la
// ricorsione bottom-up (prima bozza del piano, scartata durante
// l'implementazione dopo aver riletto .tiptap-collapse in theme.css: e'
// display:flex con una freccina SEMPRE visibile come vero item flex
// oltre al contenuto, non solo padding/bordo - un calcolo manuale
// avrebbe dovuto enumerare a mano ogni extra del genere per ogni tipo
// di blocco, con rischio concreto di dimenticarne uno). Il motore di
// layout nativo gestisce gia' correttamente, per qualunque contenitore
// con flex-wrap:wrap annidato, la semantica "il minimo e' il figlio piu'
// esigente, non la somma" (i fratelli eccedenti si impilano, spec CSS
// Flexbox), oltre a padding/bordo/gap/elementi-sempre-visibili e
// all'attraversamento trasparente di wrapper come .react-renderer
// (ReactNodeViewRenderer per CollapseBlock - .tiptap-collapse e' un
// livello piu' in profondita', vedi il commento su rowGrow in
// tiptapBlocks.tsx) senza bisogno di riconoscerli esplicitamente: basta
// misurare il min-content dell'elemento del confine cosi' com'e'.
//
// Unica eccezione voluta: la TABELLA (measureTableNativeMin sopra) -
// ogni .tableWrapper annidato, a qualunque profondita', viene
// "congelato" alla propria larghezza minima nativa PRIMA di chiedere il
// min-content del resto, cosi' la misura complessiva la rispetta senza
// provare a restringerla oltre.
function computeRealMinWidth(liveEl: HTMLElement): number {
  if (liveEl.classList.contains('tableWrapper')) return measureTableNativeMin(liveEl);

  const clone = liveEl.cloneNode(true) as HTMLElement;

  // min-width:auto (non 0, il default di FIX 1/theme.css) su OGNI
  // discendente del clone: min-width:0 e' pensato per lo SHRINK a runtime
  // di una row gia' stretta, ma un min-width esplicito puo' influenzare
  // anche il calcolo del min-content stesso di un contenitore flex (non
  // solo il comportamento di restringimento) - min-width:auto ripristina
  // la risoluzione automatica "min-content del contenuto reale", che e'
  // esattamente cio' che questa misura deve riflettere. Applicato qui
  // (sul clone, mai sull'elemento live) quindi a costo zero per il resto
  // dell'editor.
  clone.querySelectorAll<HTMLElement>('*').forEach((node) => {
    node.style.minWidth = 'auto';
  });

  clone.querySelectorAll<HTMLElement>('.tableWrapper').forEach((tableClone) => {
    const nativeMin = measureTableNativeMin(tableClone);
    tableClone.style.width = `${nativeMin}px`;
    tableClone.style.flexBasis = `${nativeMin}px`;
    tableClone.style.flexGrow = '0';
    tableClone.style.flexShrink = '0';
  });

  // position:absolute (fuori dal flusso per definizione, indipendentemente
  // da dove viene appeso nel DOM) evita due problemi verificati dal vivo
  // in fase di indagine/revisione: (1) mutare lo stile dell'elemento LIVE
  // dentro la sua row-flex reale sposterebbe visibilmente anche i
  // fratelli non coinvolti nel drag per la durata della misura (lo stesso
  // contenitore flex li ridistribuirebbe tutti in risposta); (2) il
  // MutationObserver di ProseMirror potrebbe interpretare quella
  // mutazione come una modifica esterna da correggere (rischio gia' visto
  // in fase di indagine manipolando lo stile di elementi live per testare
  // il comportamento pre-implementazione). Un clone non fa mai parte
  // dell'albero che ProseMirror osserva/gestisce, quindi nessuno dei due
  // rischi si applica. maxWidth:none neutralizza il max-width:75% dei
  // paragrafi di riga (altrimenti clamperebbe la misura invece di
  // lasciar emergere il vero min-content, se l'elemento misurato e'
  // proprio un paragrafo di riga).
  clone.style.position = 'absolute';
  clone.style.visibility = 'hidden';
  clone.style.pointerEvents = 'none';
  clone.style.left = '-99999px';
  clone.style.top = '0';
  clone.style.margin = '0';
  clone.style.width = 'min-content';
  clone.style.maxWidth = 'none';

  // Ancorato dentro lo stesso .tiptap-content (mai document.body): quasi
  // tutti i selettori di questo progetto sono scoped a ".tiptap-content
  // X" - il clone deve restare discendente per ereditare font/spaziatura/
  // custom properties (es. --tiptap-box-gap) reali, altrimenti
  // min-content misurerebbe con gli stili di default del browser invece
  // di quelli effettivi dell'editor.
  const host = liveEl.closest<HTMLElement>('.tiptap-content') ?? document.body;
  host.appendChild(clone);
  try {
    return clone.getBoundingClientRect().width;
  } finally {
    host.removeChild(clone);
  }
}

function startDragSession(view: EditorView, pair: EdgePair, startX: number): DragSession {
  const leftRect = pair.leftEl.getBoundingClientRect();
  const rightRect = pair.rightEl.getBoundingClientRect();
  return {
    leftEl: pair.leftEl,
    rightEl: pair.rightEl,
    leftItemPos: pair.leftItemPos,
    rightItemPos: pair.rightItemPos,
    startX,
    totalWidth: leftRect.width + rightRect.width,
    minLeftWidth: computeRealMinWidth(pair.leftEl),
    minRightWidth: computeRealMinWidth(pair.rightEl),
    sumGrow: readEffectiveGrow(view, pair.leftItemPos) + readEffectiveGrow(view, pair.rightItemPos),
    leftStartWidth: leftRect.width,
  };
}

// Formula condivisa fra anteprima live (mousemove, non arrotondata) e
// commit finale (mouseup, arrotondata) - vedi il ragionamento completo
// nelle "firme esatte" della Fase 5c: sumGrow PRESERVATO (mai ricalcolato
// come leftGrow+rightGrow indipendenti) perche' e' relativo a TUTTI gli
// item della riga, non solo ai due coinvolti - alterarlo sposterebbe anche
// un terzo fratello che non ha toccato il proprio rowGrow.
function computeGrowPair(session: DragSession, clientX: number): { leftGrow: number; rightGrow: number } {
  const { totalWidth, minLeftWidth, minRightWidth, sumGrow, leftStartWidth, startX } = session;
  if (totalWidth < minLeftWidth + minRightWidth) {
    // Caso limite (segnalato in fase di pianificazione): nessuno spazio
    // libero da ridistribuire, il drag non ha alcun effetto invece di
    // produrre un clamp invertito/degenere. Da FIX 2 (computeRealMinWidth,
    // 2026-08-14) minLeftWidth/minRightWidth sono di nuovo numeri reali
    // (il minimo ricorsivo misurato dal vivo, non piu' quasi-sempre-0 di
    // getComputedStyle dopo il solo FIX 1) - questo ramo torna quindi
    // raggiungibile per davvero quando entrambi i lati del confine hanno
    // gia' contenuto annidato che li spinge vicino al proprio minimo
    // cumulativo, non solo teorico come nella fase intermedia fra i due
    // fix.
    return { leftGrow: readGrowFromStyle(session.leftEl) ?? sumGrow / 2, rightGrow: readGrowFromStyle(session.rightEl) ?? sumGrow / 2 };
  }
  const delta = clientX - startX;
  const rawLeftWidth = leftStartWidth + delta;
  const clampedLeftWidth = Math.min(Math.max(rawLeftWidth, minLeftWidth), totalWidth - minRightWidth);
  const leftGrow = sumGrow * (clampedLeftWidth / totalWidth);
  return { leftGrow, rightGrow: sumGrow - leftGrow };
}

function readGrowFromStyle(el: HTMLElement): number | null {
  const value = parseFloat(el.style.flexGrow);
  return Number.isFinite(value) ? value : null;
}

// Anteprima live: SOLO stile diretto, MAI una transazione (vedi il
// ragionamento sul punto aperto nelle "firme esatte" - verificato dal vivo
// con un trascinamento reale del mouse, non serve una Decoration: gli
// elementi esterni delle NodeView di CollapseBlock/Table - .react-renderer,
// .tableWrapper - non sono mai gestiti da React/dalla NodeView per il
// proprio stile, solo il loro contenuto interno lo e').
function previewResize(session: DragSession, clientX: number) {
  const { leftGrow, rightGrow } = computeGrowPair(session, clientX);
  session.leftEl.style.flexGrow = String(leftGrow);
  session.rightEl.style.flexGrow = String(rightGrow);
}

// Commit: UNA sola transazione, arrotondata a 2 decimali - rightGrow SEMPRE
// per differenza da sumGrow (mai arrotondato in modo indipendente), per non
// far derivare la somma anche di un solo centesimo (irrilevante
// visivamente, ma scorretto in linea di principio dato che sumGrow deve
// restare l'ancora per i fratelli non coinvolti).
function commitResize(view: EditorView, session: DragSession, clientX: number) {
  const { leftGrow } = computeGrowPair(session, clientX);
  const roundedLeft = Math.round(leftGrow * 100) / 100;
  const roundedRight = Math.round((session.sumGrow - roundedLeft) * 100) / 100;

  const { state } = view;
  const leftNode = state.doc.nodeAt(session.leftItemPos);
  const rightNode = state.doc.nodeAt(session.rightItemPos);
  if (!leftNode || !rightNode) return;

  const tr = state.tr;
  tr.setNodeMarkup(session.leftItemPos, undefined, { ...leftNode.attrs, rowGrow: roundedLeft });
  tr.setNodeMarkup(session.rightItemPos, undefined, { ...rightNode.attrs, rowGrow: roundedRight });
  view.dispatch(tr);
}

export const RowResizeExtension = Extension.create({
  name: 'rowResize',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: rowResizePluginKey,
        state: {
          init: (): RowResizeState => ({ active: null, dragging: false }),
          apply(tr, prev): RowResizeState {
            const meta = tr.getMeta(rowResizePluginKey);
            if (meta && 'setActive' in meta) return { ...prev, active: meta.setActive };
            if (meta && 'setDragging' in meta) return { ...prev, dragging: meta.setDragging };
            // Nessun remapping su docChanged per "active": un mousemove
            // successivo ricalcola comunque la coppia da zero (posizioni
            // fresche) prima che serva davvero - remappare qui sarebbe
            // lavoro speso per uno stato che si autocorregge al prossimo
            // evento naturale del mouse.
            return prev;
          },
        },
        props: {
          // resize-cursor: stessa classe gia' usata da columnResizing
          // (prosemirror-tables) per lo stesso identico cursore - ProseMirror
          // unisce gia' le classi da piu' plugin sullo stesso view.dom
          // (verificato: e' lo stesso meccanismo con cui columnResizing
          // convive oggi con class:'tiptap-content' statico).
          attributes: (state) => {
            const pluginState = rowResizePluginKey.getState(state);
            return pluginState && (pluginState.active || pluginState.dragging) ? { class: 'resize-cursor' } : {};
          },
          handleDOMEvents: {
            mousemove(view, event) {
              if (!view.editable) return false;
              if (!(event instanceof MouseEvent)) return false;
              const pluginState = rowResizePluginKey.getState(view.state);
              if (!pluginState || pluginState.dragging) return false;

              const pair = computeEdgePair(view, event);
              const nextActive = pair ? { leftItemPos: pair.leftItemPos, rightItemPos: pair.rightItemPos } : null;
              const current = pluginState.active;
              const changed =
                (current === null) !== (nextActive === null) ||
                (current && nextActive && (current.leftItemPos !== nextActive.leftItemPos || current.rightItemPos !== nextActive.rightItemPos));
              if (changed) setActive(view, nextActive);
              return false;
            },
            mouseleave(view) {
              if (!view.editable) return false;
              const pluginState = rowResizePluginKey.getState(view.state);
              if (pluginState && pluginState.active && !pluginState.dragging) setActive(view, null);
              return false;
            },
            mousedown(view, event) {
              if (!view.editable) return false;
              if (!(event instanceof MouseEvent)) return false;
              const pluginState = rowResizePluginKey.getState(view.state);
              if (!pluginState || !pluginState.active || pluginState.dragging) return false;

              // Ricalcola la coppia fresca (non fidarsi della sola
              // posizione salvata in "active", che potrebbe essere di un
              // mousemove leggermente diverso) - stesso identico target del
              // mousemove che ha attivato l'hover, quindi in pratica sempre
              // la stessa coppia, ma niente assunzioni.
              const pair = computeEdgePair(view, event);
              if (!pair) return false;

              const win = view.dom.ownerDocument.defaultView ?? window;
              const session = startDragSession(view, pair, event.clientX);

              setDragging(view, true);

              function move(moveEvent: globalThis.MouseEvent) {
                if (moveEvent.buttons === 0) return finish(moveEvent);
                previewResize(session, moveEvent.clientX);
              }
              function finish(upEvent: globalThis.MouseEvent) {
                win.removeEventListener('mousemove', move);
                win.removeEventListener('mouseup', finish);
                commitResize(view, session, upEvent.clientX);
                setDragging(view, false);
                setActive(view, null);
              }

              win.addEventListener('mousemove', move);
              win.addEventListener('mouseup', finish);

              event.preventDefault();
              return true;
            },
          },
        },
      }),
    ];
  },
});
