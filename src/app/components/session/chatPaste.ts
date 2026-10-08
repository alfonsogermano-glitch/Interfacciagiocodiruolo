/** Risultato del riconoscimento del formato "> Nome: citazione\n\ncorpo". */
export interface QuotedPaste {
  senderName: string;
  content: string;
  body: string;
}

/**
 * Riconosce il formato blockquote prodotto dalla copia di un messaggio con
 * citazione e ne separa le tre parti (split del nome sul primo ": ").
 * Ritorna null se il testo non ha quella struttura: allora l'incollo va
 * lasciato al comportamento di default del browser.
 */
export function parseQuotedPaste(text: string): QuotedPaste | null {
  // Gli appunti di Windows possono usare CRLF: normalizzato prima del parsing.
  const normalized = text.replace(/\r\n?/g, '\n');
  if (!normalized.startsWith('> ')) return null;
  const separator = normalized.indexOf('\n\n');
  if (separator < 0) return null;
  const quotedLines = normalized.slice(0, separator).split('\n');
  if (!quotedLines.every((line) => line.startsWith('> '))) return null;
  const first = quotedLines[0].slice(2);
  const colonIndex = first.indexOf(': ');
  if (colonIndex <= 0) return null;
  return {
    senderName: first.slice(0, colonIndex),
    content: [
      first.slice(colonIndex + 2),
      ...quotedLines.slice(1).map((line) => line.slice(2)),
    ].join('\n'),
    body: normalized.slice(separator + 2),
  };
}
