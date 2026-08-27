export const NOTE_ICON_RECENTS_STORAGE_KEY = 'hollowgate.notes.recent-icons';
export const NOTE_ICON_RECENTS_MAX = 12;

export interface SearchableNoteIcon {
  name: string;
  label: string;
  aliases: readonly string[];
  category: string;
}

export interface NoteIconStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function normalizeNoteIconSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('it')
    .trim()
    .replace(/\s+/g, ' ');
}

export function searchNoteIcons<T extends SearchableNoteIcon>(
  icons: readonly T[],
  query: string,
): T[] {
  const normalizedQuery = normalizeNoteIconSearch(query);
  if (!normalizedQuery) return [];

  const tokens = normalizedQuery.split(' ');
  return icons.filter((icon) => {
    const fields = [
      icon.name,
      icon.label,
      icon.category,
      ...icon.aliases,
    ].map(normalizeNoteIconSearch);

    return tokens.every((token) => fields.some((field) => field.includes(token)));
  });
}

export function sanitizeRecentIconNames(
  value: unknown,
  validNames: ReadonlySet<string>,
): string[] {
  if (!Array.isArray(value)) return [];

  const result: string[] = [];
  const seen = new Set<string>();

  for (const candidate of value) {
    if (typeof candidate !== 'string') continue;
    if (!validNames.has(candidate)) continue;
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    result.push(candidate);
    if (result.length >= NOTE_ICON_RECENTS_MAX) break;
  }

  return result;
}

function getBrowserStorage(): NoteIconStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readRecentIconNames(
  validNames: ReadonlySet<string>,
  storage?: NoteIconStorage | null,
): string[] {
  const resolvedStorage = storage === undefined ? getBrowserStorage() : storage;
  if (!resolvedStorage) return [];

  try {
    const raw = resolvedStorage.getItem(NOTE_ICON_RECENTS_STORAGE_KEY);
    if (!raw) return [];
    return sanitizeRecentIconNames(JSON.parse(raw), validNames);
  } catch {
    return [];
  }
}

export function recordRecentIconName(
  name: string,
  validNames: ReadonlySet<string>,
  storage?: NoteIconStorage | null,
): string[] {
  const resolvedStorage = storage === undefined ? getBrowserStorage() : storage;
  const current = readRecentIconNames(validNames, resolvedStorage);
  if (!validNames.has(name)) return current;

  const next = [name, ...current.filter((candidate) => candidate !== name)]
    .slice(0, NOTE_ICON_RECENTS_MAX);

  if (resolvedStorage) {
    try {
      resolvedStorage.setItem(NOTE_ICON_RECENTS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // localStorage può essere disabilitato/quota esaurita: il picker deve restare utilizzabile.
    }
  }

  return next;
}
