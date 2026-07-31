import { Mark, mergeAttributes, type JSONContent } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontSize: {
      /** Imposta la dimensione (px) del testo selezionato, o come stored mark al cursore se non c'e' selezione (stessa meccanica nativa di setMark gia' usata da toggleBold/toggleItalic - vedi node_modules/@tiptap/core/dist/index.js, "if (empty) tr.addStoredMark(...)"). */
      setFontSize: (size: number) => ReturnType;
      /** Rimuove il mark fontSize dalla selezione - non collegata a nessun controllo della toolbar oggi (la tendina imposta sempre una size esplicita, 16 compreso), tenuta per completezza dell'estensione. */
      unsetFontSize: () => ReturnType;
    };
  }
}

// Valori della tendina (Formattazione testo, RichTextEditor.tsx) - stessa
// scala tipica di un word processor, confermati col piano approvato.
export const FONT_SIZES = [6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 34] as const;

// Dimensione (px) a cui renderizzavano gli ex-pulsanti H1-H4 dentro
// .tiptap-content PRIMA di questa migrazione (nessun font-size esplicito li'
// - ereditato dal layer base globale di theme.css: h1{font-size:var(--text-2xl)}
// ecc. contro un root --font-size:16px, cioe' 24/20/18/16px) - riusato sia
// dalla migrazione di note gia' salvate con nodi "heading" (vedi
// migrateHeadingsToFontSize sotto) sia da legacyToTipTapDoc in
// RichTextEditor.tsx (promozione delle vecchissime note "#"-markdown), cosi'
// le note esistenti mantengono lo stesso aspetto visivo invece di saltare a
// dimensioni arbitrarie.
export const HEADING_LEVEL_TO_FONT_SIZE: Record<1 | 2 | 3 | 4, number> = {
  1: 24,
  2: 20,
  3: 18,
  4: 16,
};

// Mark inline (non block-level come l'ex Heading) per la dimensione del
// testo - Mark.create come Grassetto/Corsivo/Sottolineato/Sbarrato (gia'
// inclusi in StarterKit), non un Node: si applica a una porzione di testo
// dentro un paragrafo qualsiasi, non a un'intera riga.
export const FontSize = Mark.create({
  name: 'fontSize',

  addAttributes() {
    return {
      // parseHTML/renderHTML per attributo (non a livello di regola) - stesso
      // pattern gia' verificato in questo progetto per l'attributo "open" di
      // CollapseBlock (tiptapBlocks.tsx): @tiptap/core genera da solo il
      // getAttrs della regola parseHTML() qui sotto chiamando questa funzione
      // sull'elemento matchato, nessun getAttrs manuale necessario.
      size: {
        default: null,
        parseHTML: (element) => {
          const value = element.style.fontSize;
          return value ? parseInt(value, 10) : null;
        },
        renderHTML: (attributes) => {
          if (!attributes.size) return {};
          return { style: `font-size: ${attributes.size}px` };
        },
      },
    };
  },

  // { style: 'font-size' } senza vincolo di tag: matcha sia il nostro stesso
  // <span> renderizzato da renderHTML sotto sia uno <span style="font-size:...">
  // incollato da fuori (Word/Google Docs esportano cosi') - bonus di
  // interoperabilita' non richiesto esplicitamente ma gratuito con questo
  // pattern standard.
  parseHTML() {
    return [{ style: 'font-size' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setFontSize:
        (size: number) =>
        ({ chain }) =>
          chain().setMark(this.name, { size }).run(),
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain().unsetMark(this.name).run(),
    };
  },
});

// Vero fino a qualunque profondita' che node abbia dei figli (content e' un
// array secondo JSONContent) - usata sotto per ricorrere anche dentro
// TextBox/CollapseBody/celle di tabella, non solo i figli diretti del
// documento: un vecchio "heading" puo' comparire a qualunque livello, essendo
// nel gruppo 'block' come paragraph/lista/ecc.
function hasContent(node: JSONContent): node is JSONContent & { content: JSONContent[] } {
  return Array.isArray(node.content);
}

/**
 * Converte ricorsivamente ogni nodo "heading" residuo (note gia' salvate
 * PRIMA di questa migrazione, con content_rich scritto dai vecchi pulsanti
 * H1-H4) in un paragraph con mark fontSize equivalente - necessaria perche'
 * caricare un JSON con un tipo di nodo che lo schema non conosce piu' non
 * genera un errore visibile: @tiptap/core (createNodeFromContent, vedi
 * node_modules/@tiptap/core/dist/index.js) cattura l'eccezione in silenzio e
 * sostituisce l'INTERO documento con uno vuoto (non solo il nodo incriminato)
 * quando errorOnInvalidContent non e' esplicitamente attivo (default qui) -
 * senza questa funzione, aprire una nota con un vecchio titolo la
 * svuoterebbe silenziosamente. Il testo del vecchio heading mantiene
 * qualunque altro mark avesse gia' (grassetto ecc.), il fontSize si aggiunge
 * senza sostituirli. Nessuna riscrittura del documento su Supabase: la
 * conversione avviene solo in memoria ad ogni caricamento, finche' l'utente
 * non modifica di nuovo la nota (a quel punto si autosalva gia' convertita).
 */
export function migrateHeadingsToFontSize(doc: JSONContent): JSONContent {
  if (doc.type === 'heading') {
    const level = (doc.attrs?.level as 1 | 2 | 3 | 4 | undefined) ?? 1;
    const size = HEADING_LEVEL_TO_FONT_SIZE[level] ?? HEADING_LEVEL_TO_FONT_SIZE[1];
    const { attrs, content, ...rest } = doc;
    return {
      ...rest,
      type: 'paragraph',
      content: content?.map((child) =>
        child.type === 'text' ? { ...child, marks: [...(child.marks ?? []), { type: 'fontSize', attrs: { size } }] } : migrateHeadingsToFontSize(child)
      ),
    };
  }
  if (hasContent(doc)) {
    return { ...doc, content: doc.content.map(migrateHeadingsToFontSize) };
  }
  return doc;
}
