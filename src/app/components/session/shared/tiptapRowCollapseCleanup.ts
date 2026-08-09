import { Extension, combineTransactionSteps, getChangedRanges } from '@tiptap/core';
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { findAncestorDepth } from './tiptapRow';
import { isEmptyParagraph } from './tiptapDropCleanup';

// Fase 4c parte 2 del progetto "affiancamento a livello documento" (piano
// confermato 2026-08-09): scioglie automaticamente una row quando resta con
// un solo figlio reale - caso scoperto in fase di analisi di 4a, trascinare
// (o cancellare in qualunque altro modo) l'unico vero rimasto fuori da una
// row di 2 lascia un paragrafo vuoto auto-inserito da ProseMirror per
// rispettare content:'rowItem{2,}' (tiptapRow.ts), invece di ridurre la row
// a 1 figlio - lo schema stesso vieta una row con meno di 2 figli, quindi
// senza questo meccanismo il documento resta "sporco" per sempre (nessun
// modo per l'utente di liberarsene con l'editor).
//
// IDENTITA'/PREESISTENZA, non un meta flag nostro: stessa tecnica gia'
// provata in tiptapDropCleanup.ts (commento li' per la storia completa, due
// giri di bugfix) - un paragrafo vuoto che l'utente ha scritto e poi
// cancellato interamente esisteva GIA' in oldState (la sua identita', non
// solo il conteggio dei figli), quindi non va MAI confuso con un
// segnaposto creato ORA da questa stessa transazione. Un meta tipo
// tr.getMeta('uiEvent')==='drop' (come in DropCleanup) NON basterebbe qui:
// lo stesso identico problema (row ridotta a 1 figlio + auto-fill) puo'
// capitare anche senza un drop (backspace/Delete/Cut su una NodeSelection
// di un figlio di row) - generalizzato quindi a QUALUNQUE transazione con
// docChanged, non solo quelle di drop: il controllo di preesistenza e' gia'
// di per se' agnostico rispetto alla causa, verificare a monte "e' stato un
// drop?" scarterebbe senza motivo gli altri percorsi che producono lo
// stesso identico stato non valido.
//
// Nessun rischio del falso positivo "TextBox affiancato a un paragrafo che
// l'utente svuota scrivendo poi cancellando tutto": in quel caso il
// paragrafo esisteva gia' PRIMA di questa transazione (la sua identita' di
// nodo, non solo la sua vuotezza), quindi il controllo di preesistenza lo
// esclude sempre, qualunque sia il numero di figli "reali" rimasti nella
// row in quel momento.
//
// Nessun rischio nemmeno per "utente preme Invio a fine riga dentro un
// figlio di row" (che crea anch'esso un paragrafo vuoto FRESCO, non tramite
// drag): quell'operazione puo' solo AGGIUNGERE un figlio alla row, mai
// toglierne uno - il conteggio dei figli "reali" (non-filler) non scende
// mai sotto 2 in quel caso, quindi il collasso (attivo solo quando restano
// <=1 figli reali) non scatta.

// Data una posizione toccata da una transazione, l'eventuale row che la
// contiene (come posizione del nodo row stesso, prima del suo primo
// figlio) - null se pos non e' dentro nessuna row. Riusa findAncestorDepth
// (tiptapRow.ts), stessa idea di resolveRowDropItem in tiptapRowDrop.ts ma
// qui serve specificamente una row (mai un rowItem generico).
function findEnclosingRowPos(doc: ProseMirrorNode, pos: number): number | null {
  if (pos < 0 || pos > doc.content.size) return null;
  const $pos = doc.resolve(pos);
  const rowDepth = findAncestorDepth($pos, 'row');
  if (rowDepth === null) return null;
  return $pos.before(rowDepth);
}

export const RowCollapseCleanup = Extension.create({
  name: 'rowCollapseCleanup',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('rowCollapseCleanup'),
        appendTransaction(transactions, oldState, newState) {
          // Uscita immediata per transazioni che non toccano il documento
          // (selezione, focus, ...) - la stragrande maggioranza delle
          // transazioni in un editor di testo (ogni movimento del cursore
          // ne dispaccia una). Nessun lavoro sotto se non serve.
          if (!transactions.some((tr) => tr.docChanged)) return null;

          const combined = combineTransactionSteps(oldState.doc, [...transactions]);

          // getChangedRanges (esportata da @tiptap/core, usata internamente
          // da Tiptap stesso per il proprio tracking di range modificati -
          // node_modules/@tiptap/core/dist/index.js) da' gia', per ogni
          // range toccato, le coordinate ESATTE in newState.doc (newRange),
          // gestendo da sola la composizione delle mappe attraverso step
          // multipli - riusata invece di reimplementare a mano la stessa
          // matematica (mapping.slice(i+1).map(...) per ogni StepMap).
          const changes = getChangedRanges(combined);
          if (changes.length === 0) return null;

          // SOLO le row toccate da questa transazione, mai un giro su
          // tutto il documento (bounded dal numero di range modificati,
          // tipicamente 1-2 per battuta/drop/cancellazione, non dalla
          // dimensione del documento) - stesso principio di scoping gia'
          // usato da DropCleanup (li' via NodeSelection.$from/$to, qui via
          // getChangedRanges perche' la selezione dopo un backspace/Cut non
          // e' detto sia una NodeSelection ne' punti alla row interessata).
          const rowPositions = new Set<number>();
          changes.forEach(({ newRange }) => {
            const fromRow = findEnclosingRowPos(newState.doc, newRange.from);
            if (fromRow !== null) rowPositions.add(fromRow);
            const toRow = findEnclosingRowPos(newState.doc, newRange.to);
            if (toRow !== null) rowPositions.add(toRow);
          });
          const invertedMapping = combined.mapping.invert();
          let tr: Transaction | null = null;

          // rowGrow "fantasma" (Fase 5d, piano confermato 2026-08-09):
          // rowGrow non ha alcun significato fuori da una row (nessun
          // fratello con cui condividere lo spazio) - un rowItem che LASCIA
          // una row (per qualunque motivo) non deve portarselo dietro,
          // altrimenti si riattiva in modo confuso se quello stesso nodo
          // finisce in una row DIVERSA in futuro, con un rapporto ereditato
          // da una relazione che non esiste piu'. Due percorsi distinti
          // producono questo stato, entrambi verificati dal vivo:
          // 1) drag nativo verso una zona CENTRALE (non gestita da
          //    RowDropExtension, che side-zone a parte lascia fare al
          //    comportamento nativo di ProseMirror) - il nodo esce dalla
          //    sua row e finisce altrove SENZA passare da un collasso,
          //    perche' gli altri fratelli restano sufficienti. Gestito QUI,
          //    PRIMA del passo di collasso sotto: un nodo il cui genitore
          //    e' ancora 'row' in questo momento (perche' non gli e' successo
          //    nulla, es. il superstite di un collasso non ancora avvenuto)
          //    viene correttamente ignorato, ci pensa il passo sotto.
          // 2) il superstite di un collasso (quando una row scende a 1
          //    figlio reale) - gestito PIU' SOTTO, inline nel momento in
          //    cui quel nodo viene riutilizzato per sostituire la row.
          //
          // Nessuna rimappatura fra questo passo e il successivo: setNodeMarkup
          // non cambia mai dimensione/posizione dei nodi, quindi i pos
          // ricavati da newState.doc restano validi anche dopo aver
          // applicato reset qui.
          changes.forEach(({ newRange }) => {
            newState.doc.nodesBetween(newRange.from, newRange.to, (node, pos, parent) => {
              if (node.attrs.rowGrow == null) return;
              if (parent && parent.type.name === 'row') return;
              if (!tr) tr = newState.tr;
              const current = tr.doc.nodeAt(pos);
              if (current && current.attrs.rowGrow != null) {
                tr.setNodeMarkup(pos, undefined, { ...current.attrs, rowGrow: null });
              }
            });
          });

          if (rowPositions.size === 0) return tr;

          // Dalla posizione piu' alta verso il basso: collassare/eliminare
          // una row sposta le posizioni di tutto cio' che viene DOPO di lei
          // nel documento, mai quello che viene prima - processare in
          // ordine decrescente garantisce che le row ancora da esaminare in
          // questo giro abbiano sempre la posizione originale (in
          // newState.doc) ancora valida, senza dover rimappare nulla fra
          // un'iterazione e la successiva.
          const sortedPositions = Array.from(rowPositions).sort((a, b) => b - a);

          for (const rowPos of sortedPositions) {
            const doc = tr ? tr.doc : newState.doc;
            const rowNode = doc.nodeAt(rowPos);
            if (!rowNode || rowNode.type.name !== 'row') continue;

            const realChildren: ProseMirrorNode[] = [];
            let sawFreshFiller = false;
            rowNode.forEach((child, offset) => {
              const childPos = rowPos + 1 + offset;
              const isFreshEmpty =
                isEmptyParagraph(child) &&
                invertedMapping.mapResult(childPos, 1).deleted &&
                invertedMapping.mapResult(childPos + child.nodeSize, -1).deleted;
              if (isFreshEmpty) {
                sawFreshFiller = true;
              } else {
                realChildren.push(child);
              }
            });

            // Nessun segnaposto fresco in questa row - niente da collassare
            // (il caso comune, per qualunque row toccata che non sia
            // scesa sotto il minimo).
            if (!sawFreshFiller) continue;

            if (!tr) tr = newState.tr;
            if (realChildren.length === 0) {
              // Caso limite (content:'rowItem{2,}' lo rende raro ma non
              // strutturalmente impossibile - vedi discussione in fase di
              // pianificazione): nessun figlio reale superstite, la row
              // stessa va eliminata, non "sciolta" verso un figlio che non
              // esiste.
              tr.delete(rowPos, rowPos + rowNode.nodeSize);
            } else if (realChildren.length === 1) {
              // Caso principale: un solo figlio reale rimasto - la row si
              // scioglie, il figlio torna a livello documento al posto
              // della row (stesso tr, cosi' un solo Ctrl+Z disfa sia questa
              // transazione che quella che l'ha scatenata).
              //
              // rowGrow azzerato qui (Fase 5d) se presente - stesso motivo
              // del passo sopra: il superstite sta per lasciare l'UNICA row
              // a cui apparteneva, portarselo dietro sarebbe lo stesso
              // valore fantasma, solo raggiunto per un percorso diverso
              // (collasso invece di drag nativo).
              const survivor =
                realChildren[0].attrs.rowGrow != null
                  ? realChildren[0].type.create(
                      { ...realChildren[0].attrs, rowGrow: null },
                      realChildren[0].content,
                      realChildren[0].marks,
                    )
                  : realChildren[0];
              tr.replaceWith(rowPos, rowPos + rowNode.nodeSize, survivor);
            }
            // 2+ figli reali superstiti insieme a un filler fresco: non
            // dovrebbe potersi verificare (il filler viene inserito da
            // ProseMirror SOLO per risalire fino al minimo di 2, quindi se
            // c'e' un filler i figli reali sono sempre esattamente 1) - se
            // mai capitasse per una via non ancora vista, meglio lasciare
            // la row invariata (nessuna azione) che rimuovere un filler
            // "a meta'" con una logica non pensata per quel caso.
          }

          return tr;
        },
      }),
    ];
  },
});
