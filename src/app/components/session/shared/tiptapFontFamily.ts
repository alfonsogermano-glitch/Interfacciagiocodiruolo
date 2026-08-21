import { Mark, mergeAttributes } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontFamily: {
      /** Imposta la famiglia del font (per label, es. "Cinzel") sul testo selezionato, o come stored mark al cursore se non c'e' selezione - stessa meccanica di setFontSize (tiptapFontSize.ts). Un label non presente in FONT_FAMILIES ricade su Arial. */
      setFontFamily: (label: string) => ReturnType;
      /** Rimuove il mark fontFamily dalla selezione - stessa completezza di unsetFontSize, nessun controllo della toolbar la usa oggi. */
      unsetFontFamily: () => ReturnType;
    };
  }
}

// Web-safe (gia' disponibili su qualunque OS) + Google Fonts a tema
// GDR/fantasy caricati in index.html (solo questi 5, non l'intero catalogo
// Google Fonts). "value" e' lo STACK CSS completo con fallback generico
// finale, non solo il nome - salvato canonico nell'attributo del mark (vedi
// parseHTML sotto) cosi' anche un font sconosciuto normalizzato ad Arial
// porta comunque con se' il proprio fallback sans-serif.
export const FONT_FAMILIES = [
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Georgia', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Courier New', value: '"Courier New", Courier, monospace' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Trebuchet MS', value: '"Trebuchet MS", sans-serif' },
  { label: 'Cinzel', value: '"Cinzel", serif' },
  { label: 'Uncial Antiqua', value: '"Uncial Antiqua", cursive' },
  { label: 'Crimson Text', value: '"Crimson Text", serif' },
  { label: 'Merriweather', value: '"Merriweather", serif' },
  { label: 'Raleway', value: '"Raleway", sans-serif' },
] as const;

// Font di fallback per valori non riconosciuti (font sconosciuto/salvato da
// un altro contesto) - richiesto esplicitamente: deve ricadere su Arial, non
// sul default del browser (che dipenderebbe dal generic-family finale della
// stringa non parsata, tipicamente serif).
const DEFAULT_FONT_FAMILY = FONT_FAMILIES[0];

function findFamilyByLabel(label: string) {
  return FONT_FAMILIES.find((f) => f.label.toLowerCase() === label.toLowerCase());
}

// Normalizza una stringa CSS font-family grezza (es. "Cinzel, serif" o solo
// "Cinzel", letta da uno style="font-family:..." incollato/salvato altrove)
// al nostro "value" canonico - substring match case-insensitive sul label
// di ogni entry, cosi' riconosce sia il nome nudo sia uno stack gia'
// espanso. Nessuna corrispondenza -> Arial (vedi DEFAULT_FONT_FAMILY sopra).
function normalizeRawFontFamily(raw: string): string {
  const lower = raw.toLowerCase();
  const match = FONT_FAMILIES.find((f) => lower.includes(f.label.toLowerCase()));
  return (match ?? DEFAULT_FONT_FAMILY).value;
}

// Insieme dei "value" canonici (gli unici stack CSS che questo mark scrive
// mai da se', via setFontFamily/parseHTML sopra) - usato in renderHTML sotto
// per lo stesso motivo per cui parseHTML normalizza gli sconosciuti, ma sul
// percorso che parseHTML NON copre: setContent(json) (il caso reale d'uso in
// RichTextEditor.tsx, editor.commands.setContent(migratedRichContent, ...))
// carica gli attrs del mark direttamente dal JSON, senza mai passare dal
// DOMParser/parseHTML (quello scatta solo per contenuto sorgente HTML, es.
// incolla) - un family sconosciuto/di un'altra versione dell'app salvato nel
// documento arriverebbe altrimenti intatto fino allo schermo, bypassando
// del tutto il fallback ad Arial richiesto. Verificato dal vivo:
// editor.commands.setContent({..., attrs: { family: 'Foo' }}) renderizzava
// class="..." style="font-family: Foo" senza questo controllo.
const VALID_FONT_FAMILY_VALUES = new Set(FONT_FAMILIES.map((f) => f.value));

// Mark inline (non block-level), stesso pattern di FontSize
// (tiptapFontSize.ts) - Mark.create come Grassetto/Corsivo/FontSize gia'
// nello schema, si applica a una porzione di testo dentro un paragrafo
// qualsiasi.
export const FontFamily = Mark.create({
  name: 'fontFamily',

  addAttributes() {
    return {
      family: {
        default: null,
        parseHTML: (element) => {
          const value = element.style.fontFamily;
          return value ? normalizeRawFontFamily(value) : null;
        },
        renderHTML: (attributes) => {
          if (!attributes.family) return {};
          const family = VALID_FONT_FAMILY_VALUES.has(attributes.family) ? attributes.family : DEFAULT_FONT_FAMILY.value;
          return { style: `font-family: ${family}` };
        },
      },
    };
  },

  parseHTML() {
    return [{ style: 'font-family' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setFontFamily:
        (label: string) =>
        ({ chain }) => {
          const family = (findFamilyByLabel(label) ?? DEFAULT_FONT_FAMILY).value;
          return chain().setMark(this.name, { family }).run();
        },
      unsetFontFamily:
        () =>
        ({ chain }) =>
          chain().unsetMark(this.name).run(),
    };
  },
});
