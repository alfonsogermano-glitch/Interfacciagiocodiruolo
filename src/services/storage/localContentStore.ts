export type ContentRow = Record<string, any>;
export type ContentTables = Record<string, ContentRow[]>;
const DATABASE = 'hollowgate-selected-content';
let database: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('accounts');
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); database = null; };
      resolve(request.result);
    };
    request.onerror = () => { database = null; reject(request.error); };
  });
  return database;
}

// Read-modify-write within ONE IndexedDB transaction. Resolves only on commit,
// not on request success; concurrent edits cannot silently overwrite each other.
export async function withLocalContent<T>(owner: string, write: boolean, action: (tables: ContentTables) => T): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('accounts', write ? 'readwrite' : 'readonly');
    const store = tx.objectStore('accounts');
    const request = store.get(owner);
    let result: T;
    let failure: unknown;
    request.onsuccess = () => {
      try {
        const tables: ContentTables = request.result ?? {};
        result = action(tables);
        if (write) store.put(tables, owner);
      } catch (error) { failure = error; tx.abort(); }
    };
    tx.oncomplete = () => resolve(result);
    tx.onabort = tx.onerror = () => reject(failure ?? tx.error ?? new Error('Salvataggio locale non riuscito'));
  });
}

export function localRow(table: string, input: ContentRow): ContentRow {
  const now = new Date().toISOString();
  const defaults: ContentRow = { id: crypto.randomUUID(), created_at: now, updated_at: now, deleted_at: null };
  if (table === 'entity_notes') Object.assign(defaults, { content: '', content_rich: null, tab_order: [], hidden: false, visibility: 'all', folder_id: null });
  if (table === 'dice_formulas') Object.assign(defaults, { folder_id: null, sort_order: 0, is_secret: false });
  if (table === 'dice_formula_folders') Object.assign(defaults, { parent_folder_id: null, sort_order: 0 });
  if (table === 'characters') Object.assign(defaults, { status: 'active', available_for_players: false });
  return { ...defaults, ...input };
}
