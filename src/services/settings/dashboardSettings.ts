import { supabase } from '../../lib/supabaseClient';
import { isTauriRuntime } from '../runtime/runtimeEnvironment';
import {
  loadTauriDashboardSettings,
  saveTauriDashboardSettings
} from './tauriSettingsStorage';

export type DashboardLanguage = 'it' | 'en';

export type DashboardSaveMode = 'local' | 'cloud';

export type DashboardPalette =
  | 'cthulhu'
  | 'blood'
  | 'amber'
  | 'emerald'
  | 'arcane'
  | 'noir'
  | 'frost'
  | 'violet';

export type DashboardSettings = {
  language: DashboardLanguage;
  palette: DashboardPalette;
  saveMode: DashboardSaveMode;
};

export const DASHBOARD_SETTINGS_KEY = 'hsc_dashboard_settings';

const SUPABASE_SETTINGS_KEY = 'dashboard_settings';

export const DEFAULT_DASHBOARD_SETTINGS: DashboardSettings = {
  language: 'it',
  palette: 'cthulhu',
  saveMode: 'cloud'
};

const DB_NAME = 'high-school-cthulhu-settings';
const DB_VERSION = 1;
const STORE_NAME = 'settings';

let cachedDashboardSettings: DashboardSettings = readSettingsSynchronously();

function normalizeDashboardSettings(value: unknown): DashboardSettings {
  if (!value || typeof value !== 'object') {
    return DEFAULT_DASHBOARD_SETTINGS;
  }

  const partial = value as Partial<DashboardSettings>;

  const language: DashboardLanguage =
    partial.language === 'en' || partial.language === 'it'
      ? partial.language
      : DEFAULT_DASHBOARD_SETTINGS.language;

  const saveMode: DashboardSaveMode =
    partial.saveMode === 'local' || partial.saveMode === 'cloud'
      ? partial.saveMode
      : DEFAULT_DASHBOARD_SETTINGS.saveMode;

  const allowedPalettes: DashboardPalette[] = [
    'cthulhu',
    'blood',
    'amber',
    'emerald',
    'arcane',
    'noir',
    'frost',
    'violet'
  ];

  const palette: DashboardPalette =
    partial.palette && allowedPalettes.includes(partial.palette)
      ? partial.palette
      : DEFAULT_DASHBOARD_SETTINGS.palette;

  return {
    language,
    palette,
    saveMode
  };
}

function readSettingsSynchronously(): DashboardSettings {
  if (typeof window === 'undefined') {
    return DEFAULT_DASHBOARD_SETTINGS;
  }

  try {
    const rawLocalStorage = window.localStorage.getItem(DASHBOARD_SETTINGS_KEY);

    if (rawLocalStorage) {
      return normalizeDashboardSettings(JSON.parse(rawLocalStorage));
    }
  } catch (error) {
    console.error('Errore lettura sincrona impostazioni dashboard:', error);
  }

  return DEFAULT_DASHBOARD_SETTINGS;
}

function saveToLocalStorage(settings: DashboardSettings): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      DASHBOARD_SETTINGS_KEY,
      JSON.stringify(settings)
    );
  } catch (error) {
    console.error('Errore salvataggio impostazioni dashboard in localStorage:', error);
  }
}

function openSettingsDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB non disponibile.'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readFromIndexedDb(): Promise<DashboardSettings | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return null;
  }

  const db = await openSettingsDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(DASHBOARD_SETTINGS_KEY);

    request.onsuccess = () => {
      db.close();
      resolve(request.result ? normalizeDashboardSettings(request.result) : null);
    };

    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

async function saveToIndexedDb(settings: DashboardSettings): Promise<void> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return;
  }

  const db = await openSettingsDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    store.put(settings, DASHBOARD_SETTINGS_KEY);

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };

    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

async function loadFromSupabase(): Promise<DashboardSettings | null> {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from('dashboard_settings')
    .select('value')
    .eq('key', SUPABASE_SETTINGS_KEY)
    .maybeSingle();

  if (error) {
    console.error('Errore caricamento impostazioni dashboard da Supabase:', error);
    return null;
  }

  return data?.value ? normalizeDashboardSettings(data.value) : null;
}

async function saveToSupabase(settings: DashboardSettings): Promise<void> {
  if (!supabase) {
    return;
  }

  const { error } = await supabase
    .from('dashboard_settings')
    .upsert(
      {
        key: SUPABASE_SETTINGS_KEY,
        value: settings,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'key' }
    );

  if (error) {
    console.error('Errore salvataggio impostazioni dashboard in Supabase:', error);
    throw new Error(error.message);
  }
}

export function readDashboardSettings(): DashboardSettings {
  cachedDashboardSettings = normalizeDashboardSettings(cachedDashboardSettings);
  return cachedDashboardSettings;
}

export async function loadDashboardSettings(): Promise<DashboardSettings> {
  if (typeof window === 'undefined') {
    cachedDashboardSettings = DEFAULT_DASHBOARD_SETTINGS;
    return cachedDashboardSettings;
  }

  // 1. Cloud Supabase: fonte più stabile dentro Figma Make.
  try {
    const supabaseSettings = await loadFromSupabase();

    if (supabaseSettings) {
      cachedDashboardSettings = supabaseSettings;
      saveToLocalStorage(cachedDashboardSettings);

      try {
        await saveToIndexedDb(cachedDashboardSettings);
      } catch (indexedDbError) {
        console.error('Errore copia impostazioni Supabase in IndexedDB:', indexedDbError);
      }

      if (isTauriRuntime()) {
        void saveTauriDashboardSettings(cachedDashboardSettings).catch(error => {
          console.error('Errore copia impostazioni Supabase in Tauri:', error);
        });
      }

      return cachedDashboardSettings;
    }
  } catch (error) {
    console.error('Errore caricamento impostazioni dashboard da Supabase:', error);
  }

  // 2. Tauri/SQLite.
  try {
    if (isTauriRuntime()) {
      const tauriSettings = await loadTauriDashboardSettings();

      if (tauriSettings) {
        cachedDashboardSettings = normalizeDashboardSettings(tauriSettings);
        saveToLocalStorage(cachedDashboardSettings);

        try {
          await saveToIndexedDb(cachedDashboardSettings);
        } catch (indexedDbError) {
          console.error('Errore copia impostazioni Tauri in IndexedDB:', indexedDbError);
        }

        void saveToSupabase(cachedDashboardSettings).catch(error => {
          console.error('Errore copia impostazioni Tauri in Supabase:', error);
        });

        return cachedDashboardSettings;
      }
    }
  } catch (error) {
    console.error('Errore caricamento impostazioni dashboard da Tauri:', error);
  }

  // 3. IndexedDB.
  try {
    const indexedDbSettings = await readFromIndexedDb();

    if (indexedDbSettings) {
      cachedDashboardSettings = indexedDbSettings;
      saveToLocalStorage(cachedDashboardSettings);

      void saveToSupabase(cachedDashboardSettings).catch(error => {
        console.error('Errore copia impostazioni IndexedDB in Supabase:', error);
      });

      return cachedDashboardSettings;
    }
  } catch (error) {
    console.error('Errore caricamento impostazioni dashboard da IndexedDB:', error);
  }

  // 4. localStorage.
  const localStorageSettings = readSettingsSynchronously();
  cachedDashboardSettings = localStorageSettings;

  try {
    await saveToIndexedDb(cachedDashboardSettings);
  } catch (error) {
    console.error('Errore copia impostazioni localStorage in IndexedDB:', error);
  }

  void saveToSupabase(cachedDashboardSettings).catch(error => {
    console.error('Errore copia impostazioni localStorage in Supabase:', error);
  });

  return cachedDashboardSettings;
}

export function saveDashboardSettings(settings: DashboardSettings): void {
  cachedDashboardSettings = normalizeDashboardSettings(settings);

  // Salvataggio immediato e sincrono.
  saveToLocalStorage(cachedDashboardSettings);

  // Salvataggi persistenti.
  void saveToIndexedDb(cachedDashboardSettings).catch(error => {
    console.error('Errore salvataggio impostazioni dashboard in IndexedDB:', error);
  });

  void saveToSupabase(cachedDashboardSettings).catch(error => {
    console.error('Errore salvataggio impostazioni dashboard in Supabase:', error);
  });

  if (isTauriRuntime()) {
    void saveTauriDashboardSettings(cachedDashboardSettings).catch(error => {
      console.error('Errore salvataggio impostazioni dashboard in SQLite/Tauri:', error);
    });
  }
}

