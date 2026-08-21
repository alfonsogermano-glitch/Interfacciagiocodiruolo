import type { JSONContent } from '@tiptap/core';

// Pulizia 2026-08-20 ("editor di testo ricco semplice"): rimossi dallo
// schema i nodi "row" (affiancamento a livello documento), "table"/
// "tableRow"/"tableCell"/"tableHeader" (tabella), e TextBox/CollapseBlock
// non accettano piu' altri box annidati dentro di se' (solo testo/liste/
// immagini - vedi SIMPLE_BLOCK_CONTENT in tiptapBlocks.tsx). Una nota
// gia' salvata PRIMA di questa pulizia puo' avere un content_rich che
// contiene ancora uno di questi nodi - stesso identico rischio gia'
// affrontato da migrateHeadingsToFontSize (tiptapFontSize.ts) per il nodo
// "heading" rimosso in precedenza: caricare un JSON con un tipo di nodo (o
// una combinazione genitore/figlio) che lo schema non riconosce piu' non
// da' un errore visibile - createNodeFromContent (@tiptap/core) cattura
// l'eccezione in silenzio e sostituisce l'INTERO documento con uno vuoto,
// non solo il nodo incriminato. Senza questa migrazione, aprire una nota
// vecchia con una row o una tabella la svuoterebbe silenziosamente.
//
// Strategia confermata: "appiattisci row/table in paragrafi semplici
// preservando il testo, la formattazione di affiancamento puo' andare
// perduta" - non e' un tentativo di ricostruire l'aspetto visivo
// (colonne/tabella), solo di salvare il CONTENUTO (testo, TextBox,
// Collapse, liste, immagini) che altrimenti sparirebbe insieme al nodo non
// piu' valido. Nessuna riscrittura su Supabase: la conversione avviene solo
// in memoria ad ogni caricamento, finche' l'utente non modifica di nuovo la
// nota (autosalvataggio la fissa gia' migrata a quel punto) - stesso
// principio di migrateHeadingsToFontSize.

// Tipi ammessi come figli diretti del documento (gruppo 'block' dello
// schema attuale, tiptapBlocks.tsx/RichTextEditor.tsx) - "row"/"table"/
// "tableRow"/"tableCell"/"tableHeader" ne sono deliberatamente esclusi,
// qualunque cosa contenessero viene recuperata spacchettandoli (vedi
// flattenToAllowed sotto).
// 'taskList' (RichTextEditor.tsx, pulsante "Attività" - @tiptap/extension-
// task-list/task-item): bug trovato dal vivo appena aggiunta l'estensione -
// senza questo tipo nell'elenco, flattenToAllowed la tratta come "non piu'
// valida" e la spacchetta (ricorsivamente anche i suoi taskItem, che non
// sono MAI un tipo ammesso da soli), esponendo solo i paragrafi di testo
// dentro ciascun taskItem come fratelli diretti del documento - la lista di
// attivita' spariva silenziosamente ad ogni giro di setContent (il
// useEffect su richContent in RichTextEditor.tsx richiama SEMPRE
// flattenRemovedLayoutNodes, non solo al caricamento iniziale). Nessuna
// voce 'taskItem' separata necessaria: col content fisso "paragraph+" (mai
// nested:true in questo progetto, vedi RichTextEditor.tsx) un taskItem non
// puo' mai contenere un tipo non ammesso, quindi non richiede il proprio
// ramo di ricorsione in flattenToAllowed (stesso motivo per cui
// bulletList/orderedList/blockquote/horizontalRule/image, gia' in questo
// elenco, non ne hanno uno).
const DOC_LEVEL_TYPES = new Set(['paragraph', 'textBox', 'collapseBlock', 'bulletList', 'orderedList', 'taskList', 'blockquote', 'horizontalRule', 'image']);

// Tipi ammessi DENTRO un TextBox/CollapseBody (content ristretto, mai
// 'textBox'/'collapseBlock': un box non puo' piu' contenerne un altro,
// stessa pulizia 2026-08-20) - identico a SIMPLE_BLOCK_CONTENT in
// tiptapBlocks.tsx, elencato di nuovo qui come Set (non importato da li'
// per non introdurre una dipendenza fra un modulo di sola migrazione dati e
// le definizioni di schema vere e proprie - i due elenchi vanno tenuti
// sincronizzati a mano se lo schema cambia ancora, stesso compromesso gia'
// accettato da migrateHeadingsToFontSize che duplica la propria mappa
// livello->px invece di importarla da un posto terzo).
const SIMPLE_BLOCK_TYPES = new Set(['paragraph', 'bulletList', 'orderedList', 'blockquote', 'horizontalRule', 'image']);

// Nodo per nodo: se il tipo e' ammesso nel contesto corrente (`allowed`),
// lo tiene com'e' (ricorrendo dentro il proprio contenuto SOLO per
// textBox/collapseBlock, gli unici due tipi ammessi che potrebbero a loro
// volta contenere qualcosa di non piu' valido, es. un box annidato dentro
// un altro sotto il vecchio schema, o una row/tabella annidata dentro un
// box). Se il tipo NON e' ammesso (row/table/tableRow/tableCell/
// tableHeader, o un box annidato dentro un altro box), lo spacchetta: i
// suoi figli prendono il SUO posto nella lista dei fratelli, ricorsivamente
// passati di nuovo per questa stessa funzione - una row dentro una cella di
// una tabella dentro un'altra row si risolve correttamente senza bisogno di
// un limite di profondita' esplicito, la ricorsione termina naturalmente
// quando non restano piu' nodi non ammessi.
//
// Caso collapseSummary (bug trovato in fase di verifica 2026-08-20, mai
// esercitato prima perche' l'annidamento box-in-box non era ancora
// possibile da riprodurre dal vivo): un CollapseBlock annidato dentro una
// TextBox/CollapseBody prima di questa pulizia finisce, salendo la
// ricorsione, a passare anche il suo collapseSummary (il titolo) per
// flattenToAllowed - collapseSummary non e' MAI in SIMPLE_BLOCK_TYPES (un
// box non puo' contenerne un altro, quindi nemmeno il suo sommario), quindi
// cadrebbe nel ramo generico sotto ("spacchetta i figli") - ma il
// contenuto di collapseSummary e' INLINE (testo/mark), non block: i nodi
// di testo non hanno un proprio .content array su cui la ricorsione possa
// appoggiarsi, quindi sparirebbero silenziosamente invece di essere
// recuperati (a differenza di collapseBody, il cui contenuto e' gia'
// block-level e si risolve correttamente nel ramo generico). Caso speciale
// qui: avvolge il testo del titolo in un paragrafo normale invece di
// provare a "spacchettarlo" come se fosse block-level - preserva il testo,
// coerente con lo stesso principio guida di questa migrazione ("la
// formattazione puo' andare perduta, il TESTO no").
function flattenToAllowed(node: JSONContent, allowed: Set<string>): JSONContent[] {
  const type = node.type ?? '';

  if (allowed.has(type)) {
    if (type === 'textBox') {
      return [{ ...node, content: (node.content ?? []).flatMap((child) => flattenToAllowed(child, SIMPLE_BLOCK_TYPES)) }];
    }
    if (type === 'collapseBlock') {
      // content fisso 'collapseSummary collapseBody' (tiptapBlocks.tsx) - il
      // sommario resta invariato (solo testo inline, non ha mai potuto
      // contenere row/table/box), solo il corpo si comporta come TextBox
      // sopra.
      return [{
        ...node,
        content: (node.content ?? []).map((child) =>
          child.type === 'collapseBody'
            ? { ...child, content: (child.content ?? []).flatMap((grandchild) => flattenToAllowed(grandchild, SIMPLE_BLOCK_TYPES)) }
            : child
        ),
      }];
    }
    return [node];
  }

  if (type === 'collapseSummary') {
    const text = node.content ?? [];
    return text.length > 0 ? [{ type: 'paragraph', content: text }] : [];
  }

  return (node.content ?? []).flatMap((child) => flattenToAllowed(child, allowed));
}

export function flattenRemovedLayoutNodes(doc: JSONContent): JSONContent {
  return { ...doc, content: (doc.content ?? []).flatMap((child) => flattenToAllowed(child, DOC_LEVEL_TYPES)) };
}
