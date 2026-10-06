export const ARCHIVIO_CHECKBOX_SYMBOLS = [
  { id: 'x', label: 'X' },
  { id: 'check', label: 'Spunta' },
  { id: 'circle', label: 'Cerchio' },
  { id: 'triangle', label: 'Triangolo' },
  { id: 'square', label: 'Quadrato' },
  { id: 'diamond', label: 'Rombo' },
  { id: 'star', label: 'Stella' },
  { id: 'heart', label: 'Cuore' },
  { id: 'plus', label: 'Più' },
  { id: 'asterisk', label: 'Asterisco' },
  { id: 'flag', label: 'Bandiera' },
  { id: 'bolt', label: 'Fulmine' },
] as const;

export type ArchivioCheckboxSymbol = typeof ARCHIVIO_CHECKBOX_SYMBOLS[number]['id'];
export type ArchivioCheckboxState = 0 | 1 | 2;
export interface ArchivioCheckboxConfig {
  checkboxCount: number;
  checkboxSymbol: ArchivioCheckboxSymbol;
  checkboxHalf: boolean;
  checkboxStates: ArchivioCheckboxState[];
}

interface CheckboxSource {
  checked?: unknown;
  checkboxCount?: unknown;
  checkboxSymbol?: unknown;
  checkboxHalf?: unknown;
  checkboxStates?: unknown;
}

/** Normalize persisted data and migrate the original single checked boolean. */
export function normalizeArchivioCheckbox(source: CheckboxSource): ArchivioCheckboxConfig {
  const rawCount = Number(source.checkboxCount ?? 1);
  const checkboxCount = Number.isFinite(rawCount) ? Math.max(1, Math.min(50, Math.round(rawCount))) : 1;
  const checkboxSymbol = ARCHIVIO_CHECKBOX_SYMBOLS.find(symbol => symbol.id === source.checkboxSymbol)?.id ?? 'x';
  const checkboxHalf = source.checkboxHalf === true;
  const previous = Array.isArray(source.checkboxStates) ? source.checkboxStates : null;
  const checkboxStates = Array.from({ length: checkboxCount }, (_, index): ArchivioCheckboxState => {
    const state = previous ? previous[index] : index === 0 && source.checked === true ? 2 : 0;
    if (state === 2) return 2;
    // Turning off half values keeps an already marked checkbox marked.
    if (state === 1) return checkboxHalf ? 1 : 2;
    return 0;
  });
  return { checkboxCount, checkboxSymbol, checkboxHalf, checkboxStates };
}

export function nextArchivioCheckboxState(state: ArchivioCheckboxState, half: boolean): ArchivioCheckboxState {
  if (half) return state === 0 ? 1 : state === 1 ? 2 : 0;
  return state === 0 ? 2 : 0;
}

export function archivioCheckboxValue(source: CheckboxSource): number {
  return normalizeArchivioCheckbox(source).checkboxStates.reduce<number>((sum, state) => sum + state / 2, 0);
}

export function archivioCheckboxText(source: CheckboxSource): string {
  return normalizeArchivioCheckbox(source).checkboxStates.map(state => state === 2 ? 'Sì' : state === 1 ? '½' : 'No').join(', ');
}
