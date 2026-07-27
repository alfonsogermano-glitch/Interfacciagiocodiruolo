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
 * Il comando "/" puo' scattare ovunque nel testo, non solo a inizio riga
 * (vincolo rimosso su richiesta esplicita) - ma un prefisso "#" inserito a
 * META' riga non verrebbe MAI riconosciuto come intestazione (parseLines
 * sopra richiede il prefisso a inizio riga, coerente con la sintassi
 * Markdown reale). Per restare "sensato" in ogni posizione, questa funzione
 * trasforma sempre l'INTERA riga corrente in intestazione: rimuove solo il
 * trigger "/"+query digitato (ovunque si trovi nella riga) e sposta il
 * prefisso all'inizio, preservando il resto del testo della riga prima e
 * dopo il trigger. Es. riga "Ciao /h2 mondo" -> "## Ciao  mondo" (il
 * trigger sparisce, il resto resta, l'intestazione e' sempre valida).
 * Ritorna anche la nuova posizione del cursore (dove si trovava il trigger,
 * ricalcolata dopo l'inserimento del prefisso), per ripristinarla nella
 * textarea dopo l'aggiornamento controllato.
 */
export function insertHeadingAtCursor(
  content: string,
  slashStart: number,
  cursorPos: number,
  level: HeadingLevel
): { content: string; cursorPos: number } {
  const lineStart = content.lastIndexOf('\n', slashStart - 1) + 1;
  const nextNewline = content.indexOf('\n', cursorPos);
  const lineEnd = nextNewline === -1 ? content.length : nextNewline;

  const before = content.slice(lineStart, slashStart);
  const after = content.slice(cursorPos, lineEnd);
  const rest = before + after;
  // La riga puo' essere gia' un'intestazione (da un click precedente sulla
  // barra icone, o da "#" digitato a mano): senza toglierlo qui resterebbe
  // come testo letterale davanti al nuovo prefisso ("## # Titolo" invece di
  // "## Titolo") - questa funzione promette di trasformare SEMPRE l'intera
  // riga, quindi un prefisso preesistente va sempre rimosso, non solo lo
  // span (slashStart..cursorPos) passato dal chiamante.
  const existingMatch = rest.match(HEADING_RE);
  const strippedRest = existingMatch ? existingMatch[2] : rest;
  const removedFromBefore = Math.min(before.length, rest.length - strippedRest.length);
  const prefix = '#'.repeat(level) + ' ';
  const newLine = prefix + strippedRest;

  const nextContent = content.slice(0, lineStart) + newLine + content.slice(lineEnd);
  return { content: nextContent, cursorPos: lineStart + prefix.length + (before.length - removedFromBefore) };
}
