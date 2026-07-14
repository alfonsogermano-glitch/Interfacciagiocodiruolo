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
  | 'violet'
  | 'questportal';

export type DashboardSettings = {
  language: DashboardLanguage;
  palette: DashboardPalette;
  saveMode: DashboardSaveMode;
};

export const DASHBOARD_SETTINGS_KEY = 'hsc_dashboard_settings';

const SUPABASE_SETTINGS_KEY = 'dashboard_settings';

export const DEFAULT_DASHBOARD_SETTINGS: DashboardSettings = {
  language: 'it',
  palette: 'noir',
  saveMode: 'cloud'
};

const DB_NAME = 'high-school-cthulhu-settings';
const DB_VERSION = 1;
const STORE_NAME = 'settings';

// Al modulo appena caricato l'utente non e' ancora noto (l'autenticazione si
// risolve in modo asincrono, vedi App.tsx) - snapshot iniziale sempre sotto
// la chiave "anonymous", corretto a momenti dal bootstrap asincrono non
// appena l'utente reale e' noto.
let cachedDashboardSettings: DashboardSettings = readSettingsSynchronously(null);

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
    'violet',
    'questportal'
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

// hsc_dashboard_settings:<ownerProfileId> (o :anonymous se non autenticato) -
// prima dello scoping era una chiave fissa unica per browser: due account
// diversi sullo stesso browser si vedevano a vicenda le preferenze
// nell'unica finestra tra il logout dell'uno e il login dell'altro senza
// pulire i dati del sito. Stesso schema per localStorage e IndexedDB.
function buildScopedSettingsKey(ownerProfileId: string | null): string {
  return `${DASHBOARD_SETTINGS_KEY}:${ownerProfileId ?? 'anonymous'}`;
}

function readSettingsSynchronously(ownerProfileId: string | null): DashboardSettings {
  if (typeof window === 'undefined') {
    return DEFAULT_DASHBOARD_SETTINGS;
  }

  const scopedKey = buildScopedSettingsKey(ownerProfileId);

  try {
    const rawScoped = window.localStorage.getItem(scopedKey);

    if (rawScoped) {
      return normalizeDashboardSettings(JSON.parse(rawScoped));
    }

    // Migrazione una tantum: chi usava l'app prima dello scoping per utente
    // ha le proprie preferenze sotto la vecchia chiave fissa. Le adotta e le
    // riscrive subito sotto la chiave scoped - le letture successive
    // trovano gia' tutto li', la vecchia chiave resta (innocua) ma non
    // viene piu' letta ne' scritta da qui in poi.
    const rawLegacy = window.localStorage.getItem(DASHBOARD_SETTINGS_KEY);

    if (rawLegacy) {
      const migrated = normalizeDashboardSettings(JSON.parse(rawLegacy));
      saveToLocalStorage(migrated, ownerProfileId);
      return migrated;
    }
  } catch (error) {
    console.error('Errore lettura sincrona impostazioni dashboard:', error);
  }

  return DEFAULT_DASHBOARD_SETTINGS;
}

function saveToLocalStorage(settings: DashboardSettings, ownerProfileId: string | null): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      buildScopedSettingsKey(ownerProfileId),
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

function readIndexedDbKey(key: string): Promise<DashboardSettings | null> {
  return openSettingsDatabase().then(db => new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);

    request.onsuccess = () => {
      db.close();
      resolve(request.result ? normalizeDashboardSettings(request.result) : null);
    };

    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  }));
}

async function readFromIndexedDb(ownerProfileId: string | null): Promise<DashboardSettings | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return null;
  }

  const scoped = await readIndexedDbKey(buildScopedSettingsKey(ownerProfileId));

  if (scoped) {
    return scoped;
  }

  // Stessa migrazione una tantum di readSettingsSynchronously, qui per
  // IndexedDB: se non c'e' ancora nulla sotto la chiave scoped ma la
  // vecchia chiave fissa ha dati, li adotta e li riscrive subito scoped.
  const legacy = await readIndexedDbKey(DASHBOARD_SETTINGS_KEY);

  if (legacy) {
    await saveToIndexedDb(legacy, ownerProfileId);
  }

  return legacy;
}

async function saveToIndexedDb(settings: DashboardSettings, ownerProfileId: string | null): Promise<void> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return;
  }

  const db = await openSettingsDatabase();
  const scopedKey = buildScopedSettingsKey(ownerProfileId);

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    store.put(settings, scopedKey);

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

async function loadFromSupabase(ownerProfileId: string | null): Promise<DashboardSettings | null> {
  // Senza un utente autenticato non c'e' nulla da scoped-are: si resta sui
  // fallback locali (Tauri/IndexedDB/localStorage) piu' sotto, esattamente
  // come oggi prima che l'autenticazione sia risolta.
  if (!supabase || !ownerProfileId) {
    return null;
  }

  const { data, error } = await supabase
    .from('dashboard_settings')
    .select('value')
    .eq('key', SUPABASE_SETTINGS_KEY)
    .eq('owner_profile_id', ownerProfileId)
    .maybeSingle();

  if (error) {
    console.error('Errore caricamento impostazioni dashboard da Supabase:', error);
    return null;
  }

  return data?.value ? normalizeDashboardSettings(data.value) : null;
}

async function saveToSupabase(settings: DashboardSettings, ownerProfileId: string | null): Promise<void> {
  if (!supabase || !ownerProfileId) {
    return;
  }

  const { error } = await supabase
    .from('dashboard_settings')
    .upsert(
      {
        key: SUPABASE_SETTINGS_KEY,
        owner_profile_id: ownerProfileId,
        value: settings,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'key,owner_profile_id' }
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

export async function loadDashboardSettings(ownerProfileId: string | null): Promise<DashboardSettings> {
  if (typeof window === 'undefined') {
    cachedDashboardSettings = DEFAULT_DASHBOARD_SETTINGS;
    return cachedDashboardSettings;
  }

  // 1. Cloud Supabase: fonte più stabile dentro Figma Make.
  try {
    const supabaseSettings = await loadFromSupabase(ownerProfileId);

    if (supabaseSettings) {
      cachedDashboardSettings = supabaseSettings;
      saveToLocalStorage(cachedDashboardSettings, ownerProfileId);

      try {
        await saveToIndexedDb(cachedDashboardSettings, ownerProfileId);
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
        saveToLocalStorage(cachedDashboardSettings, ownerProfileId);

        try {
          await saveToIndexedDb(cachedDashboardSettings, ownerProfileId);
        } catch (indexedDbError) {
          console.error('Errore copia impostazioni Tauri in IndexedDB:', indexedDbError);
        }

        void saveToSupabase(cachedDashboardSettings, ownerProfileId).catch(error => {
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
    const indexedDbSettings = await readFromIndexedDb(ownerProfileId);

    if (indexedDbSettings) {
      cachedDashboardSettings = indexedDbSettings;
      saveToLocalStorage(cachedDashboardSettings, ownerProfileId);

      void saveToSupabase(cachedDashboardSettings, ownerProfileId).catch(error => {
        console.error('Errore copia impostazioni IndexedDB in Supabase:', error);
      });

      return cachedDashboardSettings;
    }
  } catch (error) {
    console.error('Errore caricamento impostazioni dashboard da IndexedDB:', error);
  }

  // 4. localStorage.
  const localStorageSettings = readSettingsSynchronously(ownerProfileId);
  cachedDashboardSettings = localStorageSettings;

  try {
    await saveToIndexedDb(cachedDashboardSettings, ownerProfileId);
  } catch (error) {
    console.error('Errore copia impostazioni localStorage in IndexedDB:', error);
  }

  void saveToSupabase(cachedDashboardSettings, ownerProfileId).catch(error => {
    console.error('Errore copia impostazioni localStorage in Supabase:', error);
  });

  return cachedDashboardSettings;
}

export async function saveDashboardSettings(settings: DashboardSettings, ownerProfileId: string | null): Promise<void> {
  cachedDashboardSettings = normalizeDashboardSettings(settings);
  saveToLocalStorage(cachedDashboardSettings, ownerProfileId);
  void saveToIndexedDb(cachedDashboardSettings, ownerProfileId);
  try {
    await saveToSupabase(cachedDashboardSettings, ownerProfileId);
  } catch (error) {
    console.error('Errore salvataggio impostazioni su Supabase:', error);
    // non blocchiamo l'utente, il dato è già in localStorage
  }
}

