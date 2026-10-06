import type { StorageAdapter, BaseStoredEntity, EntityId } from './storageAdapter';
import { persistenceKey } from './persistenceMode';

type LocalStorageAdapterOptions<T> = {
  normalize?: (item: unknown) => T;
  filterOnLoad?: (item: T) => boolean;
};

function safeParseArray(raw: string | null): unknown[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function createLocalStorageAdapter<T extends BaseStoredEntity>(
  storageKey: string,
  options: LocalStorageAdapterOptions<T> = {}
): StorageAdapter<T> {
  const key = persistenceKey(storageKey);

  const read = (): T[] => {
    if (typeof window === 'undefined') return [];

    const rawItems = safeParseArray(window.localStorage.getItem(key));

    const items = options.normalize
      ? rawItems.map(options.normalize)
      : (rawItems as T[]);

    return options.filterOnLoad ? items.filter(options.filterOnLoad) : items;
  };

  const write = (items: T[]) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, JSON.stringify(items));
  };

  return {
    async getAll() {
      return read();
    },

    async getById(id: EntityId) {
      return read().find(item => item.id === id) ?? null;
    },

    async setAll(items: T[]) {
      write(items);
    },

    async upsert(item: T) {
      const items = read();
      const exists = items.some(current => current.id === item.id);

      const nextItems = exists
        ? items.map(current => (current.id === item.id ? item : current))
        : [...items, item];

      write(nextItems);
      return item;
    },

    async remove(id: EntityId) {
      write(read().filter(item => item.id !== id));
    },

    async clear() {
      write([]);
    }
  };
}