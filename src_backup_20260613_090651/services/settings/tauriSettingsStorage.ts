import type { DashboardSettings } from './dashboardSettings';

const DB_PATH = 'sqlite:high-school-cthulhu.db';
const SETTINGS_KEY = 'dashboard_settings';

async function importOptionalTauriModule<T>(moduleName: string): Promise<T> {
  return import(/* @vite-ignore */ moduleName) as Promise<T>;
}

type TauriSqlDatabase = {
  execute: (query: string, bindValues?: unknown[]) => Promise<unknown>;
  select: (query: string, bindValues?: unknown[]) => Promise<unknown[]>;
};

type TauriSqlPlugin = {
  default: {
    load: (path: string) => Promise<TauriSqlDatabase>;
  };
};

async function getDatabase(): Promise<TauriSqlDatabase> {
  const Database = await importOptionalTauriModule<TauriSqlPlugin>('@tauri-apps/plugin-sql');
  return Database.default.load(DB_PATH);
}

async function ensureSettingsTable(): Promise<void> {
  const db = await getDatabase();

  await db.execute(`
    create table if not exists app_settings (
      key text primary key,
      value text not null,
      updated_at text not null
    )
  `);
}

export async function loadTauriDashboardSettings(): Promise<DashboardSettings | null> {
  await ensureSettingsTable();
  const db = await getDatabase();

  const rows = await db.select(
    `
      select value
      from app_settings
      where key = ?
      limit 1
    `,
    [SETTINGS_KEY]
  ) as Array<{ value: string }>;

  return rows[0] ? JSON.parse(rows[0].value) as DashboardSettings : null;
}

export async function saveTauriDashboardSettings(settings: DashboardSettings): Promise<void> {
  await ensureSettingsTable();
  const db = await getDatabase();

  await db.execute(
    `
      insert into app_settings (
        key,
        value,
        updated_at
      )
      values (?, ?, ?)
      on conflict(key) do update set
        value = excluded.value,
        updated_at = excluded.updated_at
    `,
    [
      SETTINGS_KEY,
      JSON.stringify(settings),
      new Date().toISOString()
    ]
  );
}