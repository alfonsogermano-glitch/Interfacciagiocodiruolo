import { Extension, type Editor } from '@tiptap/core';
import { Selection, Plugin, PluginKey } from '@tiptap/pm/state';
import { Slice } from '@tiptap/pm/model';
import type { Node as ProseMirrorNode, ResolvedPos } from '@tiptap/pm/model';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
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

// Elemento adiacente alla posizione del cursore finto (nodo DOPO se e' un
// cursore "before", nodo PRIMA se e' un cursore "after") - nessuno stato
// separato "quale elemento, quale lato" da tracciare altrove: la posizione
// stessa lo dice gia', via nodeBefore/nodeAfter. Usato sia dal rendering
// sotto sia da Invio/frecce/Escape in tiptapBlocks.tsx.
// Riconosceva anche il confine FRA DUE CELLE diverse (kind:'cell', fino al
// 2026-08-05) - rimosso insieme a exitCellBoundary (vedi
// tiptapBlocks.tsx): un cursore finto non nasce piu' mai a quel confine,
// solo fra box fratelli/annidati DENTRO la stessa cella.
export function adjacentBox($pos: ResolvedPos): { node: ProseMirrorNode; side: 'before' | 'after' } | null {
  if ($pos.nodeAfter && isSideBySideBox($pos.nodeAfter)) return { node: $pos.nodeAfter, side: 'after' };
  if ($pos.nodeBefore && isSideBySideBox($pos.nodeBefore)) return { node: $pos.nodeBefore, side: 'before' };
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
function landOrDive(doc: ProseMirrorNode, pos: number, dir: 'before' | 'after'): Selection {
  const $pos = doc.resolve(pos);
  const neighbor = dir === 'after' ? $pos.nodeAfter : $pos.nodeBefore;
  if (!neighbor) return new TextBoxEdgeCursor($pos);
  if (isSideBySideBox(neighbor)) return new TextBoxEdgeCursor($pos);
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

  // Rilevamento anticipato di un a-capo di riga flex (bug 2026-08-04/05,
  // "il fix corregge troppo, e solo in una direzione": una singola
  // freccia scavalcava fine-riga-1/inizio-riga-2 saltando una fermata,
  // sia uscendo da box1 verso destra sia da box2 verso sinistra) -
  // misurato QUI, PRIMA della transazione sotto, sui due box reali ancora
  // affiancati nel DOM (nessun widget di mezzo finche' la transazione non
  // parte): box1/box2 sono fratelli diretti a questa posizione condivisa
  // (fine di uno === inizio dell'altro, un solo intero) a PRESCINDERE da
  // quale dei due si sta lasciando, quindi la stessa misura (via
  // nodeDOM/previousElementSibling) vale identica per entrambe le
  // direzioni - nessuna asimmetria qui, solo la FASE iniziale sotto
  // (ROW_PAUSE_DIR_META) distingue le due direzioni.
  let rowWrapped = false;
  const afterDom = editor.view.nodeDOM(boundaryPos) as HTMLElement | null;
  const beforeDom = afterDom?.previousElementSibling as HTMLElement | null;
  if (afterDom && beforeDom) {
    rowWrapped = Math.abs(afterDom.getBoundingClientRect().top - beforeDom.getBoundingClientRect().top) > 1;
  }

  return editor
    .chain()
    .command(({ tr }) => {
      tr.setSelection(landOrDive(tr.doc, boundaryPos, dir));
      tr.setMeta(ROW_PAUSE_WRAPPED_META, rowWrapped);
      tr.setMeta(ROW_PAUSE_DIR_META, dir);
      return true;
    })
    .scrollIntoView()
    .run();
}

// Riallinea via JS la riga VISIVA del widget quando il flex-wrap l'ha
// lasciato sulla riga sbagliata (bug 2026-08-02, "3 TextBox affiancate,
// la terza va a capo, il cursore finto sembra saltarci dentro"): il
// MODELLO non ha alcun concetto di "riga visiva 2" (tre fratelli piatti
// nella stessa cella, l'a-capo e' un puro artefatto del flex-wrap CSS a
// runtime) - il posizionamento del widget e' gia' corretto un livello
// alla volta (verificato: servono ancora due frecce per entrare
// davvero nel terzo box), ma la sua RIGA VISIVA no: flex-wrap decide in
// base alla sua "hypothetical size" (minuscola) se entra nella riga
// corrente, che quasi sempre "ci sta" anche quando il box che lo segue
// nel DOM e' gia' stato spinto alla riga successiva - il widget resta
// incollato in coda alla riga 1 (a volte sconfinando oltre il bordo
// della cella) invece di comparire all'inizio della riga 2, prima del
// box che lo segue.
//
// Non risolvibile con un trucco CSS puro equivalente a quello usato per
// .tiptap-td-flex/.tiptap-textbox-content sopra: un flex-basis grande
// abbastanza da forzare l'a-capo (l'unico modo per "spingere" un item
// flex sulla riga successiva) diventerebbe anche la sua dimensione
// RESA finale sulla nuova riga (flex-shrink non entra in gioco se quella
// riga non va in overflow) - un cursore che dovrebbe restare 1px
// renderizzerebbe invece largo quanto il valore forzato. L'unico modo
// per ottenere "stessa riga del box successivo, 1px di larghezza" e'
// misurare le coordinate REALI dopo il render (getBoundingClientRect,
// unica fonte di verita' per "riga visiva", il modello non la conosce)
// e, se non combaciano, riposizionare il widget con position:absolute
// (rispetto al contenitore flex, reso position:relative in theme.css
// solo per questo) esattamente dove si trova il box successivo - un
// ritorno mirato e isolato al vecchio meccanismo position:absolute +
// misurazione DOM (rimosso nel 2026-08-01 come meccanismo PRINCIPALE),
// qui riproposto SOLO come correzione di eccezione per il caso limite
// del wrap, non come sostituto del flex layout che gestisce gia'
// correttamente il 99% dei casi (nessuna riga visiva coinvolta).
// Ripristina PRIMA di misurare: ProseMirror riusa lo stesso nodo DOM per
// la stessa "key" di decorazione anche quando la posizione nel modello
// cambia (bug scoperto dal vivo: il cursore fra box0/box1, sulla STESSA
// riga, veniva scorrettamente ricorretto perche' l'inline style
// position:absolute lasciato da una correzione precedente - fra box1/
// box2, righe diverse - falsava getBoundingClientRect() qui sotto,
// facendo sembrare "disallineata" anche una posizione gia' corretta di
// suo). Senza reset preventivo, ogni misurazione sarebbe relativa
// all'ultima correzione anziche' al layout flex naturale. Estratta a
// parte (bug 2026-08-04) perche' serve anche da sola, senza rimisurare:
// la fase "natural" sotto (prima fermata su un vero a-capo) deve poter
// ripulire un residuo di una correzione precedente senza per questo
// riapplicarne subito una nuova.
function resetEdgeCursorRowOverride(widget: HTMLElement) {
  widget.style.position = '';
  widget.style.top = '';
  widget.style.left = '';
  widget.style.margin = '';
}

function syncEdgeCursorRow(widget: HTMLElement) {
  resetEdgeCursorRowOverride(widget);

  const next = widget.nextElementSibling as HTMLElement | null;
  const container = widget.parentElement as HTMLElement | null;
  if (!next || !container || !(next.classList.contains('tiptap-textbox') || next.classList.contains('tiptap-collapse'))) return;

  // Il widget ha un margin-top intenzionale (allineamento verticale col
  // testo del box adiacente, bug 2026-08-02 di un giro precedente) che lo
  // sposta SEMPRE un po' piu' in basso del bordo superiore della riga
  // flex rispetto al box (che non ha quel margine, e' lui stesso a
  // definire l'inizio della riga) - va sottratto PRIMA di confrontare,
  // altrimenti quello scarto atteso verrebbe scambiato per un a-capo
  // anche quando sono sulla stessa riga (bug scoperto dal vivo: il
  // cursore fra due box sulla stessa riga veniva ricorretto per errore).
  const widgetMarginTop = parseFloat(getComputedStyle(widget).marginTop) || 0;
  const widgetRowTop = widget.getBoundingClientRect().top - widgetMarginTop;
  const mismatched = Math.abs(next.getBoundingClientRect().top - widgetRowTop) > 1;

  if (!mismatched) return;

  const containerRect = container!.getBoundingClientRect();
  const nextRect = next!.getBoundingClientRect();
  widget.style.position = 'absolute';
  widget.style.top = `${nextRect.top - containerRect.top}px`;
  // 4px: stessa meta' gap usata per il caso "fra due box" allineato
  // (.tiptap-textbox-edge-cursor:not(:first-child):not(:last-child) in
  // theme.css) - qui solo approssimata (non e' detto ci sia un box PRIMA
  // su questa nuova riga con cui centrarsi), sufficiente per un piccolo
  // distacco visivo dal box che segue senza toccarne il bordo.
  widget.style.left = `${nextRect.left - containerRect.left - 4}px`;
  widget.style.margin = '0';
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

// `confirmed` invece di due valori 'natural'/'corrected' fissi (versione
// precedente, bug 2026-08-05 "funziona solo in avanti"): quale RESA
// visiva (riga corrente vs. riga del box adiacente) corrisponde a
// "confermato" dipende dalla direzione (vedi commento sopra) - la
// derivazione e' in view() sotto, non qui: questo stato traccia solo il
// FATTO "l'utente ha gia' premuto una seconda volta", non il suo
// significato visivo.
type EdgeCursorRowPauseState = { pos: number; dir: 'before' | 'after'; wrapped: boolean; confirmed: boolean } | null;

// PluginKey tipizzata (non anonima come le altre in questo file): serve a
// leggere lo stato da fuori il plugin stesso, dentro exitArrow
// (addKeyboardShortcuts sotto), per decidere se questa pressione deve
// solo confermare la pausa o puo' gia' procedere (rientro nel box o
// prosecuzione oltre).
const textBoxEdgeCursorPluginKey = new PluginKey<EdgeCursorRowPauseState>('textBoxEdgeCursor');

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
            if (value && value.pos === sel.head) {
              return tr.getMeta(ROW_PAUSE_ADVANCE_META) ? { ...value, confirmed: true } : value;
            }
            const dir = (tr.getMeta(ROW_PAUSE_DIR_META) as 'before' | 'after' | undefined) ?? 'after';
            const wrapped = tr.getMeta(ROW_PAUSE_WRAPPED_META) === true;
            return { pos: sel.head, dir, wrapped, confirmed: false };
          },
        },
        props: {
          // flex-wrap (theme.css) posiziona il widget da solo sulla STESSA
          // riga flex del box adiacente nel caso comune (nessun avvolgimento
          // di mezzo) - view() sotto corregge SOLO il caso limite in cui il
          // flex-wrap CSS ha effettivamente mandato a capo il box successivo
          // (vedi syncEdgeCursorRow sopra per il perche' non e' risolvibile
          // in puro CSS).
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

              // La RESA "in attesa" e' opposta nelle due direzioni (bug
              // 2026-08-05, vedi ROW_PAUSE_DIR_META sopra per il
              // ragionamento completo): uscendo verso destra ('after') il
              // primo arrivo (confirmed=false) deve restare sulla riga
              // corrente (nessuna correzione, la conferma la applica);
              // uscendo verso sinistra ('before') e' l'OPPOSTO - il primo
              // arrivo deve mostrare subito la riga da cui si e' usciti
              // (correzione applicata), e' la conferma a toglierla,
              // rivelando la riga precedente verso cui ci si sta
              // muovendo. Se non e' affatto un a-capo (!wrapped), nessuna
              // attesa in nessun caso: applica sempre (syncEdgeCursorRow
              // si limita da sola a un no-op se non c'e' davvero un
              // mismatch, stesso comportamento di sempre per il caso
              // comune due-box-stessa-riga).
              const shouldApply =
                !pauseState.wrapped || (pauseState.dir === 'after' ? pauseState.confirmed : !pauseState.confirmed);

              if (!shouldApply) {
                // In attesa: nessuna misurazione/correzione qui, il
                // widget resta dove il flex layout lo metterebbe da solo
                // finche' l'utente non conferma con una seconda pressione
                // della stessa freccia (exitArrow sotto). Reset comunque
                // necessario: il nodo DOM puo' essere lo stesso riusato da
                // una correzione precedente ad un'ALTRA posizione (vedi
                // resetEdgeCursorRowOverride).
                resetEdgeCursorRowOverride(widget);
                return;
              }
              syncEdgeCursorRow(widget);
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
        if (pauseState && pauseState.pos === selection.head && pauseState.dir === dir && pauseState.wrapped && !pauseState.confirmed) {
          return editor
            .chain()
            .command(({ tr }) => {
              tr.setMeta(ROW_PAUSE_ADVANCE_META, true);
              return true;
            })
            .run();
        }

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
