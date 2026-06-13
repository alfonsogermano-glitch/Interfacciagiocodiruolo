const DB_PATH = 'sqlite:high-school-cthulhu.db';

export type TauriEntityCollection =
  | 'characters'
  | 'npcs'
  | 'monsters'
  | 'environments'
  | 'clues'
  | 'situations'
  | 'adventures'
  | 'equipmentCatalog'
  | 'characterEquipment';

type StoredEntity = {
  id: string;
  campaignId?: string | null;
  [key: string]: any;
};

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

async function ensureEntityTable(): Promise<void> {
  const db = await getDatabase();

  await db.execute(`
    create table if not exists campaign_entities (
      id text not null,
      campaign_id text not null,
      collection text not null,
      payload text not null,
      created_at text not null,
      updated_at text not null,
      primary key (id, collection)
    )
  `);
}

export async function loadTauriEntities<T extends StoredEntity>(
  campaignId: string,
  collection: TauriEntityCollection
): Promise<T[]> {
  await ensureEntityTable();
  const db = await getDatabase();

  const rows = await db.select(
    `
      select payload
      from campaign_entities
      where campaign_id = ? and collection = ?
      order by created_at asc
    `,
    [campaignId, collection]
  ) as Array<{ payload: string }>;

  return rows.map(row => JSON.parse(row.payload) as T);
}

export async function saveTauriEntity<T extends StoredEntity>(
  campaignId: string,
  collection: TauriEntityCollection,
  entity: T
): Promise<void> {
  await ensureEntityTable();
  const db = await getDatabase();

  const now = new Date().toISOString();
  const payload = {
    ...entity,
    campaignId
  };

  await db.execute(
    `
      insert into campaign_entities (
        id,
        campaign_id,
        collection,
        payload,
        created_at,
        updated_at
      )
      values (?, ?, ?, ?, ?, ?)
      on conflict(id, collection) do update set
        campaign_id = excluded.campaign_id,
        payload = excluded.payload,
        updated_at = excluded.updated_at
    `,
    [
      entity.id,
      campaignId,
      collection,
      JSON.stringify(payload),
      now,
      now
    ]
  );
}

export async function deleteTauriEntity(
  collection: TauriEntityCollection,
  entityId: string
): Promise<void> {
  await ensureEntityTable();
  const db = await getDatabase();

  await db.execute(
    `
      delete from campaign_entities
      where id = ? and collection = ?
    `,
    [entityId, collection]
  );
}