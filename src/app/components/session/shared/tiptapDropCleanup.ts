import { Extension, combineTransactionSteps } from '@tiptap/core';
import { Plugin, PluginKey, NodeSelection } from '@tiptap/pm/state';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

// Stessa identica definizione gia' usata dal pulsante "Tabella" della
// toolbar (RichTextEditor.tsx, .command() dopo insertTable) per lo stesso
// tipo di problema.
function isEmptyParagraph(node: ProseMirrorNode): boolean {
  return node.type.name === 'paragraph' && node.content.size === 0;
}

/**
 * Trascinare un elemento selezionabile/trascinabile (TextBox, Collapse,
 * Tabella - gli unici nodi con selectable+draggable dello schema, vedi
 * tiptapBlocks.tsx/tiptapTableHandle.ts) in un punto dove esiste gia' un
 * paragrafo vuoto placeholder (es. una cella di tabella appena creata: il
 * suo content "block+" richiede sempre almeno un blocco, quindi parte con
 * UN paragrafo vuoto anche se visivamente "sembra" vuota) lo lascia li' come
 * fratello invece di sostituirlo - il drop nativo di ProseMirror
 * (handleDrop, node_modules/prosemirror-view/dist/index.js) calcola il
 * punto d'inserimento e fa un inserimento puro (slice openStart/openEnd 0 su
 * un range a larghezza zero), che non ha nessuna nozione di "questo
 * paragrafo adiacente era solo un placeholder appena creato per fare spazio,
 * toglilo" - stessa classe di bug gia' vista per il pulsante "Tabella" (che
 * pero' potendo agire dentro il proprio .command() nella STESSA transazione
 * del comando, ripuliva a mano; qui non c'e' nessun comando nostro da
 * estendere, il drop e' interamente gestito dalla view).
 *
 * appendTransaction (non un command/hook nostro) e' il meccanismo giusto:
 * gira DOPO qualunque transazione, incluse quelle dispacciate internamente
 * da prosemirror-view per un drop - handleDrop marca la propria transazione
 * con tr.setMeta("uiEvent", "drop") (verificato nel sorgente), che qui
 * identifica il momento esatto in cui intervenire, senza toccare/ripetere
 * la logica di drop stessa. Dopo un drop di un nodo selezionabile,
 * handleDrop imposta gia' da solo la selezione risultante a una
 * NodeSelection sul nodo appena spostato (tr.setSelection(new
 * NodeSelection($pos)), stesso sorgente) - $from/$to di quella selezione
 * sono rispettivamente la posizione subito prima e subito dopo il nodo,
 * quindi nodeBefore/nodeAfter danno esattamente i due fratelli diretti da
 * controllare, qualunque sia il contenitore.
 *
 * IDENTITA'/PREESISTENZA, non childCount (bug segnalato 2026-07-31, due
 * giri di indagine): una prima versione cancellava qualunque paragrafo vuoto
 * adiacente in modo incondizionato; una seconda versione aggiungeva una
 * guardia euristica ($from.parent.childCount === 2, "il paragrafo era
 * l'unico altro contenuto del contenitore") che si e' rivelata insufficiente
 * - confermato con un test dal vivo (log diagnostici temporanei,
 * combineTransactionSteps di @tiptap/core per confrontare oldState/newState)
 * che una cella con childCount=1 in oldState (un'unica riga vuota, lasciata
 * li' di proposito dall'utente come spaziatura) risultava comunque in
 * childCount=2 dopo il drop, quindi la vecchia guardia la cancellava
 * comunque: childCount da solo non distingue "un placeholder creato ORA per
 * fare spazio" da "una riga vuota che esisteva gia' prima di questo drop".
 * La distinzione corretta e' se quello SPECIFICO paragrafo (la stessa
 * porzione di documento, non solo un conteggio) esisteva gia' in oldState
 * PRIMA di questa transazione di drop - se si', non va mai toccato,
 * qualunque sia il childCount risultante; se no (creato ex-novo da questa
 * stessa transazione), e' un vero placeholder residuo da rimuovere, esatto
 * equivalente drag-and-drop del bug gia' risolto per insertTable.
 *
 * combineTransactionSteps (export pubblico di @tiptap/core) ricostruisce la
 * Transform completa (con la sua .mapping) applicata da oldState.doc a
 * newState.doc attraverso tutte le transazioni di questo batch - invertita,
 * mappa una posizione di newState alla posizione corrispondente in oldState.
 * MapResult.deleted (prosemirror-transform) e' vero quando la posizione
 * mappata cade dentro contenuto che la mappatura ha eliminato: applicato
 * alla mappatura INVERTITA (newState -> oldState), "eliminato" significa
 * esattamente "questo contenuto non esisteva in oldState", cioe' e' stato
 * inserito DURANTE il drop - la condizione cercata. Controllati entrambi gli
 * estremi del range (assoc opposti, verso l'interno del nodo) per coprire
 * l'intero paragrafo, non solo un punto.
 *
 * LIMITAZIONE NOTA (indagata 2026-07-31, non e' un bug di questo plugin):
 * trascinare un TextBox/Collapse/Tabella DENTRO LA STESSA cella verso un
 * fratello diretto adiacente che e' un paragrafo VUOTO non ha alcun effetto
 * (il drop fallisce in silenzio, l'elemento resta dov'era) - funziona invece
 * verso un fratello con contenuto reale, o verso una cella diversa. Escluso
 * con certezza: nessuna eccezione da combineTransactionSteps qui sopra,
 * nessuna cancellazione indebita (deleted:false su entrambi gli estremi,
 * verificato con log dal vivo). La causa e' quindi a monte, dentro
 * handleDrop di prosemirror-view stesso (probabile: il controllo interno
 * "if (tr.doc.eq(beforeInsert)) return" abbandona il drop senza dispatch se
 * il documento post-inserimento risulta strutturalmente uguale a quello
 * post-cancellazione-sorgente, possibile per posizioni cosi' ravvicinate
 * nello stesso genitore) - territorio di libreria, non di questo codice.
 * Scope volutamente non approfondito oltre: nessuna perdita di dati (vero
 * no-op), workaround banale (scrivere qualcosa nella riga di destinazione
 * prima, o passare da un'altra cella).
 */
export const DropCleanup = Extension.create({
  name: 'dropCleanup',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('dropCleanup'),
        appendTransaction(transactions, oldState, newState) {
          const isDrop = transactions.some((tr) => tr.getMeta('uiEvent') === 'drop');
          if (!isDrop) return null;

          const { selection } = newState;
          if (!(selection instanceof NodeSelection)) return null;

          const { $from, $to } = selection;
          let range: { from: number; to: number } | null = null;
          if ($from.nodeBefore && isEmptyParagraph($from.nodeBefore)) {
            range = { from: $from.pos - $from.nodeBefore.nodeSize, to: $from.pos };
          } else if ($to.nodeAfter && isEmptyParagraph($to.nodeAfter)) {
            range = { from: $to.pos, to: $to.pos + $to.nodeAfter.nodeSize };
          }
          if (!range) return null;

          const invertedMapping = combineTransactionSteps(oldState.doc, [...transactions]).mapping.invert();
          const wasCreatedByThisDrop =
            invertedMapping.mapResult(range.from, 1).deleted && invertedMapping.mapResult(range.to, -1).deleted;
          if (!wasCreatedByThisDrop) return null;

          return newState.tr.delete(range.from, range.to);
        },
      }),
    ];
  },
});
