import type { StorageAdapter } from './storageAdapter';
import type { VisualAsset } from './visualAssetsStorage';

const DB_PATH = 'sqlite:high-school-cthulhu.db';
const ASSETS_DIR_NAME = 'visual-assets';

async function getDatabase() {
  const Database = await importOptionalTauriModule<any>('@tauri-apps/plugin-sql');
  return Database.default.load(DB_PATH);
}

async function ensureVisualAssetsTable(): Promise<void> {
  const db = await getDatabase();

  await db.execute(`
    create table if not exists visual_assets (
      id text primary key,
      campaign_id text not null,
      name text not null,
      type text not null,
      image_data_url text,
      local_file_path text,
      created_at text not null
    )
  `);
}

async function importOptionalTauriModule<T>(moduleName: string): Promise<T> {
  return import(/* @vite-ignore */ moduleName) as Promise<T>;
}

type TauriPathApi = {
  appDataDir: () => Promise<string>;
  join: (...paths: string[]) => Promise<string>;
};

type TauriFsApi = {
  mkdir: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  writeFile: (path: string, data: Uint8Array) => Promise<void>;
  readFile: (path: string) => Promise<Uint8Array>;
  exists: (path: string) => Promise<boolean>;
};

async function getTauriPathApi(): Promise<TauriPathApi> {
  return importOptionalTauriModule<TauriPathApi>('@tauri-apps/api/path');
}

async function getTauriFsApi(): Promise<TauriFsApi> {
  return importOptionalTauriModule<TauriFsApi>('@tauri-apps/plugin-fs');
}

async function ensureAssetsDir(): Promise<string> {
  const { appDataDir, join } = await getTauriPathApi();
  const { mkdir, exists } = await getTauriFsApi();

  const baseDir = await appDataDir();
  const assetsDir = await join(baseDir, ASSETS_DIR_NAME);

  if (!(await exists(assetsDir))) {
    await mkdir(assetsDir, { recursive: true });
  }

  return assetsDir;
}

function getFileExtensionFromDataUrl(dataUrl: string): string {
  const match = dataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,/);
  const ext = match?.[1]?.toLowerCase();

  if (ext === 'jpeg') return 'jpg';
  if (ext === 'svg+xml') return 'svg';

  return ext || 'png';
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] ?? '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function bytesToDataUrl(bytes: Uint8Array, filePath: string): string {
  const extension = filePath.split('.').pop()?.toLowerCase() ?? 'png';

  const mime =
    extension === 'jpg' || extension === 'jpeg'
      ? 'image/jpeg'
      : extension === 'webp'
        ? 'image/webp'
        : extension === 'svg'
          ? 'image/svg+xml'
          : 'image/png';

  let binary = '';

  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });

  return `data:${mime};base64,${btoa(binary)}`;
}

async function saveAssetImageFile(asset: VisualAsset): Promise<string | undefined> {
  if (!asset.imageDataUrl?.startsWith('data:image/')) {
    return asset.localFilePath;
  }

  const { writeFile } = await getTauriFsApi();

  const assetsDir = await ensureAssetsDir();
  const extension = getFileExtensionFromDataUrl(asset.imageDataUrl);
  const filePath = await (await getTauriPathApi()).join(assetsDir, `${asset.id}.${extension}`);
  const bytes = dataUrlToBytes(asset.imageDataUrl);

  await writeFile(filePath, bytes);

  return filePath;
}

async function hydrateAssetImage(asset: VisualAsset): Promise<VisualAsset> {
  if (asset.imageDataUrl) {
    return asset;
  }

  if (!asset.localFilePath) {
    return asset;
  }

  try {
    const { readFile } = await getTauriFsApi();
    const bytes = await readFile(asset.localFilePath);

    return {
      ...asset,
      imageDataUrl: bytesToDataUrl(bytes, asset.localFilePath)
    };
  } catch {
    return asset;
  }
}

function fromRow(row: any): VisualAsset {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    name: row.name,
    type: row.type,
    imageDataUrl: row.image_data_url ?? '',
    localFilePath: row.local_file_path ?? undefined,
    createdAt: row.created_at
  };
}

export const tauriSqliteVisualAssetsStorage: StorageAdapter<VisualAsset> = {
  async getAll() {
    await ensureVisualAssetsTable();
    const db = await getDatabase();

    const rows = await db.select(`
  select id, campaign_id, name, type, image_data_url, local_file_path, created_at
  from visual_assets
  order by created_at asc
`) as any[];

    return Promise.all(rows.map(row => hydrateAssetImage(fromRow(row))));
  },

  async getById(id) {
    await ensureVisualAssetsTable();
    const db = await getDatabase();

    const rows = await db.select(
  `
    select id, campaign_id, name, type, image_data_url, local_file_path, created_at
    from visual_assets
    where id = ?
    limit 1
  `,
  [id]
) as any[];

    return rows[0] ? await hydrateAssetImage(fromRow(rows[0])) : null;
  },

  async setAll(items) {
    await ensureVisualAssetsTable();
    const db = await getDatabase();

    await db.execute('delete from visual_assets');

    for (const item of items) {
      await this.upsert(item);
    }
  },

  async upsert(item) {
    await ensureVisualAssetsTable();
    const db = await getDatabase();

    const localFilePath = await saveAssetImageFile(item);

    await db.execute(
      `
        insert into visual_assets (
          id,
          campaign_id,
          name,
          type,
          image_data_url,
          local_file_path,
          created_at
        )
        values (?, ?, ?, ?, ?, ?, ?)
        on conflict(id) do update set
          campaign_id = excluded.campaign_id,
          name = excluded.name,
          type = excluded.type,
          image_data_url = excluded.image_data_url,
          local_file_path = excluded.local_file_path,
          created_at = excluded.created_at
      `,
      [
        item.id,
        item.campaignId,
        item.name,
        item.type,
        '',
        localFilePath ?? null,
        item.createdAt
      ]
    );

    return {
      ...item,
      localFilePath
    };
  },

  async remove(id) {
    await ensureVisualAssetsTable();
    const db = await getDatabase();

    await db.execute(
      'delete from visual_assets where id = ?',
      [id]
    );
  },

  async clear() {
    await ensureVisualAssetsTable();
    const db = await getDatabase();

    await db.execute('delete from visual_assets');
  }
};