// Parsing/inserimento minimo per lo scope confermato (solo intestazioni
// H1-H4 a inizio riga) - niente libreria di markdown generica: liste,
// grassetto, link, ecc. sono fuori scope, un parser di poche righe qui
// basta e avanza ed evita una dipendenza pesante per un bisogno cosi'
// piccolo.

export type HeadingLevel = 1 | 2 | 3 | 4;

export interface ParsedLine {
  /** 0 = paragrafo normale (nessun prefisso #). */
  level: 0 | HeadingLevel;
  /** Testo della riga SENZA il prefisso #/spazio. */
  text: string;
}

const HEADING_RE = /^(#{1,4})\s+(.*)$/;

// Classi Tailwind H1 (piu' grande) -> H4 (piu' piccolo, nello stesso stile
// delle etichette di sezione gia' usate ovunque nell'app). Condivise tra
// MarkdownContent.tsx (vista di sola lettura) e useLineBasedEditor.ts (vista
// live durante la modifica) - stesso identico aspetto in entrambi i casi,
// una sola fonte di verita' invece di duplicare le classi in due posti.
export const HEADING_CLASSES: Record<HeadingLevel, string> = {
  1: 'text-xl font-bold text-[var(--dash-text-strong)]',
  2: 'text-lg font-semibold text-[var(--dash-text-strong)]',
  3: 'text-base font-semibold text-[var(--dash-text-strong)]',
  4: 'text-xs font-semibold uppercase tracking-[0.08em] text-[var(--dash-accent-2)]',
};

/**
 * Rileva il livello di intestazione di UNA riga (0 = nessuno) - estratta da
 * parseLines sotto perche' riusata anche da useLineBasedEditor.ts per
 * decidere, ad ogni input, se il div della riga attiva va riclassificato
 * (confronto col livello gia' applicato, letto da un attributo sul div
 * stesso - vedi il commento li' per il perche' solo nei momenti di
 * transizione, non ad ogni tasto).
 */
export function detectHeadingLevel(line: string): 0 | HeadingLevel {
  const match = line.match(HEADING_RE);
  return match ? (match[1].length as HeadingLevel) : 0;
}

export function parseLines(content: string): ParsedLine[] {
  return content.split('\n').map((line) => {
    // Match diretto (non via detectHeadingLevel) per estrarre anche il
    // testo nello stesso passaggio, correttamente per QUALUNQUE quantita'
    // di spazi dopo il prefisso (detectHeadingLevel sopra risponde solo
    // "che livello e'", uno slice a offset fisso qui perderebbe spazi
    // extra oltre il primo).
    const match = line.match(HEADING_RE);
    if (match) {
      return { level: match[1].length as HeadingLevel, text: match[2] };
    }
    return { level: 0, text: line };
  });
}

/**
 * Il comando "/" puo' scattare ovunque nel testo, non solo a inizio riga
 * (vincolo rimosso su richiesta esplicita) - ma un prefisso "#" inserito a
 * META' riga non verrebbe MAI riconosciuto come intestazione (detectHeadingLevel
 * sopra richiede il prefisso a inizio riga, coerente con la sintassi
 * Markdown reale). Per restare "sensato" in ogni posizione, questa funzione
 * trasforma sempre l'INTERA riga (testo del div corrente nel motore a righe,
 * vedi useLineBasedEditor.ts) in intestazione: rimuove solo il trigger
 * "/"+query digitato (ovunque si trovi nella riga) e sposta il prefisso
 * all'inizio, preservando il resto del testo della riga prima e dopo il
 * trigger. Es. riga "Ciao /h2 mondo" -> "## Ciao  mondo" (il trigger
 * sparisce, il resto resta, l'intestazione e' sempre valida).
 *
 * Opera su offset LOCALI alla riga (non piu' su una posizione globale nel
 * documento intero, a differenza della vecchia versione basata su
 * <textarea>) - nel motore a righe ogni riga e' il proprio div, non serve
 * piu' cercare l'inizio/fine riga dentro una stringa multi-riga.
 */
export function applyHeadingToLine(
  lineText: string,
  slashStart: number,
  cursorPos: number,
  level: HeadingLevel
): { text: string; cursorPos: number } {
  const before = lineText.slice(0, slashStart);
  const after = lineText.slice(cursorPos);
  const prefix = '#'.repeat(level) + ' ';
  const text = prefix + before + after;
  return { text, cursorPos: prefix.length + before.length };
}
