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
          const ranges: { from: number; to: number }[] = [];
          if ($from.nodeBefore && isEmptyParagraph($from.nodeBefore)) {
            ranges.push({ from: $from.pos - $from.nodeBefore.nodeSize, to: $from.pos });
          }
          if ($to.nodeAfter && isEmptyParagraph($to.nodeAfter)) {
            ranges.push({ from: $to.pos, to: $to.pos + $to.nodeAfter.nodeSize });
          }
          if (ranges.length === 0) return null;

          const tr = newState.tr;
          // Ordine decrescente di posizione: cancellando prima il range piu'
          // a destra, le posizioni del range a sinistra (se presente anche
          // quello, entrambi i lati con un placeholder) restano valide per
          // la cancellazione successiva nella stessa transazione.
          ranges
            .sort((a, b) => b.from - a.from)
            .forEach(({ from, to }) => tr.delete(from, to));
          return tr;
        },
      }),
    ];
  },
});
