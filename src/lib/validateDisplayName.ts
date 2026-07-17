export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 32;

// Whitelist (non blacklist): lettere Unicode, cifre, spazio e - _ . '
// Esclude per costruzione caratteri di controllo/invisibili (zero-width,
// override RTL/LTR, BOM, ecc.) perché non rientrano in nessuna di queste classi.
const DISPLAY_NAME_PATTERN = /^[\p{L}\p{N} _.'-]+$/u;

export function normalizeDisplayName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/** Ritorna un messaggio d'errore in italiano se il nome non è valido, altrimenti null. */
export function validateDisplayName(raw: string): string | null {
  const name = normalizeDisplayName(raw);
  if (name.length < DISPLAY_NAME_MIN) {
    return `Il nome deve avere almeno ${DISPLAY_NAME_MIN} caratteri.`;
  }
  if (name.length > DISPLAY_NAME_MAX) {
    return `Il nome non può superare i ${DISPLAY_NAME_MAX} caratteri.`;
  }
  if (!DISPLAY_NAME_PATTERN.test(name)) {
    return "Il nome può contenere solo lettere, numeri, spazi e - _ . '";
  }
  return null;
}
