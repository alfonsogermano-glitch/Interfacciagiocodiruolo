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

export function parseLines(content: string): ParsedLine[] {
  return content.split('\n').map((line) => {
    const match = line.match(HEADING_RE);
    if (match) {
      return { level: match[1].length as HeadingLevel, text: match[2] };
    }
    return { level: 0, text: line };
  });
}

/**
 * Sostituisce "/" + il testo di filtro digitato dopo (da `slashStart` a
 * `cursorPos`) con il prefisso Markdown dell'intestazione scelta - il resto
 * della riga (se presente dopo il cursore) resta intatto. Ritorna anche la
 * nuova posizione del cursore (subito dopo il prefisso inserito), per
 * poterla ripristinare nella textarea dopo l'aggiornamento controllato.
 */
export function insertHeadingAtCursor(
  content: string,
  slashStart: number,
  cursorPos: number,
  level: HeadingLevel
): { content: string; cursorPos: number } {
  const prefix = '#'.repeat(level) + ' ';
  const nextContent = content.slice(0, slashStart) + prefix + content.slice(cursorPos);
  return { content: nextContent, cursorPos: slashStart + prefix.length };
}
