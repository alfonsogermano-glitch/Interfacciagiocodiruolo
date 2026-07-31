import { Extension } from '@tiptap/core';
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
 * punto d'inserimento con dropPoint() e fa un inserimento puro (slice
 * openStart/openEnd 0 su un range a larghezza zero), che non ha nessuna
 * nozione di "questo paragrafo adiacente era solo un placeholder, toglilo" -
 * stessa identica classe di bug gia' vista e risolta per il pulsante
 * "Tabella" (che pero' potendo agire dentro il proprio .command() nella
 * STESSA transazione del comando, ripuliva a mano; qui non c'e' nessun
 * comando nostro da estendere, il drop e' interamente gestito dalla view).
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
 * controllare, qualunque sia il contenitore (cella di tabella, TextBox,
 * Collapse, primo livello del documento - nessuna logica specifica per
 * "dentro una tabella", lo stesso problema si presenta ovunque una zona di
 * drop abbia gia' un paragrafo vuoto adiacente).
 *
 * GUARDIA childCount===2 (bug segnalato 2026-07-31, effetto collaterale
 * della prima versione): la prima versione cancellava QUALUNQUE paragrafo
 * vuoto adiacente, senza distinguere un vero placeholder residuo (l'unico
 * altro contenuto del contenitore, come nel caso originale sopra) da una
 * riga vuota lasciata li' DI PROPOSITO dall'utente in una cella con PIU'
 * righe (es. prima riga vuota intenzionale, seconda riga di destinazione) -
 * cancellava quella riga comunque, spostando di fatto l'elemento appena
 * trascinato "al posto" della riga vuota invece che accanto alla riga
 * bersaglio. $from.parent.childCount === 2 dopo il drop (il nodo trascinato
 * + un solo altro figlio, quello vuoto) e' vero SOLO quando quel paragrafo
 * era l'UNICO contenuto del contenitore prima del drop (childCount saliva
 * da 1 a 2) - con piu' righe pre-esistenti il contenitore ha gia' 3+ figli
 * dopo il drop, la guardia impedisce qualunque cancellazione e le righe
 * vuote intenzionali restano intatte, indipendentemente da quale fratello
 * diretto dell'elemento risultino essere.
 *
 * Ipotesi alternativa verificata e scartata: un bug nel calcolo nativo
 * della posizione di drop (area di hit-test ridotta su una riga vuota,
 * dropPoint() che punta sempre alla riga sbagliata) non serve a spiegare il
 * sintomo - ne' theme.css ne' altrove nel progetto esiste una regola che
 * riduca l'altezza di un <p> vuoto (nessun :empty/min-height trovato), quindi
 * un paragrafo vuoto ha la stessa area di hit-test verticale di uno pieno.
 * Ed e' comunque irrilevante ai fini del sintomo osservato: sia che il drop
 * fosse atterrato PRIMA sia DOPO il paragrafo vuoto, la vecchia versione di
 * questo plugin lo cancellava comunque, producendo in ENTRAMBI i casi lo
 * stesso risultato visibile finale ("l'elemento finisce al posto della riga
 * vuota") - la causa piena e sufficiente e' la cancellazione incondizionata,
 * non la posizione del drop.
 */
export const DropCleanup = Extension.create({
  name: 'dropCleanup',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('dropCleanup'),
        appendTransaction(transactions, _oldState, newState) {
          const isDrop = transactions.some((tr) => tr.getMeta('uiEvent') === 'drop');
          if (!isDrop) return null;

          const { selection } = newState;
          if (!(selection instanceof NodeSelection)) return null;

          const { $from, $to } = selection;
          // Contenitore con SOLO il nodo trascinato + un altro figlio: solo
          // in questo caso quell'altro figlio, se vuoto, era certamente il
          // placeholder obbligatorio del contenitore altrimenti vuoto (vedi
          // commento sopra) - con 3+ figli non si tocca nulla.
          if ($from.parent.childCount !== 2) return null;

          let range: { from: number; to: number } | null = null;
          if ($from.nodeBefore && isEmptyParagraph($from.nodeBefore)) {
            range = { from: $from.pos - $from.nodeBefore.nodeSize, to: $from.pos };
          } else if ($to.nodeAfter && isEmptyParagraph($to.nodeAfter)) {
            range = { from: $to.pos, to: $to.pos + $to.nodeAfter.nodeSize };
          }
          if (!range) return null;

          return newState.tr.delete(range.from, range.to);
        },
      }),
    ];
  },
});
