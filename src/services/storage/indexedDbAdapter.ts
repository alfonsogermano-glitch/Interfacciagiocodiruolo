import type { BaseStoredEntity, EntityId, StorageAdapter } from './storageAdapter';

type IndexedDbAdapterOptions<T> = {
  normalize?: (item: unknown) => T;
  filterOnLoad?: (item: T) => boolean;
};

const DB_NAME = 'high-school-cthulhu';
const DB_VERSION = 3;

function openDatabase(storeName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(storeName)) {
        db.close();
        reject(
          new Error(
            `IndexedDB object store "${storeName}" non trovato. Aumenta DB_VERSION in indexedDbAdapter.ts.`
          )
        );
        return;
      }

      resolve(db);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDatabase(storeName);

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const request = callback(store);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);

    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

export function createIndexedDbAdapter<T extends BaseStoredEntity>(
  storeName: string,
  options: IndexedDbAdapterOptions<T> = {}
): StorageAdapter<T> {
  const normalizeItems = (items: unknown[]): T[] => {
    const normalized = options.normalize
      ? items.map(options.normalize)
      : (items as T[]);

    return options.filterOnLoad
      ? normalized.filter(options.filterOnLoad)
      : normalized;
  };

  return {
    async getAll() {
      const items = await withStore<unknown[]>(
        storeName,
        'readonly',
        store => store.getAll()
      );

      return normalizeItems(items);
    },

    async getById(id: EntityId) {
      const item = await withStore<unknown | undefined>(
        storeName,
        'readonly',
        store => store.get(id)
      );

      return item
        ? options.normalize
          ? options.normalize(item)
          : (item as T)
        : null;
    },

    async setAll(items: T[]) {
      const db = await openDatabase(storeName);

      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);

        store.clear();
        items.forEach(item => store.put(item));

        transaction.oncomplete = () => {
          db.close();
          resolve();
        };

        transaction.onerror = () => {
          db.close();
          reject(transaction.error);
        };
      });
    },

    async upsert(item: T) {
      await withStore<IDBValidKey>(
        storeName,
        'readwrite',
        store => store.put(item)
      );

      return item;
    },

    async remove(id: EntityId) {
      await withStore<undefined>(
        storeName,
        'readwrite',
        store => store.delete(id)
      );
    },

    async clear() {
      await withStore<undefined>(
        storeName,
        'readwrite',
        store => store.clear()
      );
    }
  };
}