type JsonRecord = Record<string, any>;

const LEGACY_COLLECTION = 'adventures';
const LEGACY_ID_CAMEL = 'adventureId';
const LEGACY_ID_SNAKE = 'adventure_id';
const LEGACY_NEXT_IDS = 'nextAdventureIds';

export const LEGACY_CHAPTER_STORAGE_KEYS = {
  chapters: 'gdr-dashboard-adventures',
  activeChapter: 'gdr-dashboard-active-adventure',
} as const;

/** Converte esclusivamente dati persistiti da versioni precedenti. Il resto
 * dell'applicazione usa soltanto il dominio Chapter. */
export function normalizeLegacyChapterValue<T>(value: T): T {
  if (Array.isArray(value)) return value.map(normalizeLegacyChapterValue) as T;
  if (!value || typeof value !== 'object') return value;

  const source = value as JsonRecord;
  const normalized: JsonRecord = {};
  for (const [key, child] of Object.entries(source)) {
    if (key === LEGACY_ID_CAMEL || key === LEGACY_ID_SNAKE || key === LEGACY_NEXT_IDS) continue;
    normalized[key] = normalizeLegacyChapterValue(child);
  }

  if (normalized.chapterId === undefined && source[LEGACY_ID_CAMEL] !== undefined) {
    normalized.chapterId = source[LEGACY_ID_CAMEL];
  }
  if (normalized.chapter_id === undefined && source[LEGACY_ID_SNAKE] !== undefined) {
    normalized.chapter_id = source[LEGACY_ID_SNAKE];
  }
  if (normalized.nextChapterIds === undefined && source[LEGACY_NEXT_IDS] !== undefined) {
    normalized.nextChapterIds = normalizeLegacyChapterValue(source[LEGACY_NEXT_IDS]);
  }
  return normalized as T;
}

export function migrateLegacyChapterTables(tables: Record<string, JsonRecord[]>): Record<string, JsonRecord[]> {
  const legacy = Array.isArray(tables[LEGACY_COLLECTION]) ? tables[LEGACY_COLLECTION] : [];
  const current = Array.isArray(tables.chapters) ? tables.chapters : [];
  if (legacy.length) {
    const merged = new Map<string, JsonRecord>();
    for (const row of legacy) merged.set(String(row.id), normalizeLegacyChapterValue(row));
    for (const row of current) merged.set(String(row.id), normalizeLegacyChapterValue(row));
    tables.chapters = [...merged.values()];
  }
  delete tables[LEGACY_COLLECTION];

  for (const [table, rows] of Object.entries(tables)) {
    if (Array.isArray(rows)) tables[table] = rows.map(normalizeLegacyChapterValue);
  }
  return tables;
}
