import type { StorageAdapter } from './storageAdapter';
import type { VisualAsset } from './visualAssetsStorage';

export const tauriVisualAssetsStorage: StorageAdapter<VisualAsset> = {
  async getAll() {
    console.warn('Tauri visual assets storage non ancora collegato. Uso fallback IndexedDB.');
    return [];
  },

  async getById() {
    console.warn('Tauri visual assets storage non ancora collegato. Uso fallback IndexedDB.');
    return null;
  },

  async setAll() {
    console.warn('Tauri visual assets storage non ancora collegato. Uso fallback IndexedDB.');
  },

  async upsert(item) {
    console.warn('Tauri visual assets storage non ancora collegato. Uso fallback IndexedDB.');
    return item;
  },

  async remove() {
    console.warn('Tauri visual assets storage non ancora collegato. Uso fallback IndexedDB.');
  },

  async clear() {
    console.warn('Tauri visual assets storage non ancora collegato. Uso fallback IndexedDB.');
  }
};