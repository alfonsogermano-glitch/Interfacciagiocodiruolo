import { generateUUID } from '../../lib/uuid';
import { supabase } from '../../lib/supabaseClient';
import { CAMPAIGN_STORAGE_KEYS } from '../campaign/campaignStorageKeys';
import { readDashboardSettings } from '../settings/dashboardSettings';
import { isTauriRuntime } from '../runtime/runtimeEnvironment';
import { createIndexedDbAdapter } from './indexedDbAdapter';
import type { StorageAdapter } from './storageAdapter';
import { tauriSqliteVisualAssetsStorage } from './tauriSqliteVisualAssetsStorage';

export type VisualAssetType =
  | 'monster-portrait-frame-default'
  | 'monster-frame-default'
  | 'monster-portrait-frame'
  | 'monster-frame'
  | 'npc-frame'
  | 'ui-decoration'
  | 'item-image'
  | 'other';

export type VisualAsset = {
  id: string;
  campaignId: string;
  name: string;
  type: VisualAssetType;
  imageDataUrl: string;
  thumbnailDataUrl?: string;
  localFilePath?: string;
  createdAt: string;
};

type VisualAssetRow = {
  id: string;
  campaign_id: string | null;
  name: string | null;
  type: VisualAssetType | string | null;
  image_data_url: string | null;
  thumbnail_url?: string | null;
  created_at: string | null;
};

type VisualAssetPreviewRow = {
  id: string;
  campaign_id: string | null;
  name: string | null;
  type: VisualAssetType | string | null;
  image_data_url?: string | null;
  thumbnail_url?: string | null;
  created_at: string | null;
};

export function normalizeVisualAsset(item: Partial<VisualAsset>): VisualAsset {
  return {
    id: item.id ?? generateUUID(),
    campaignId: item.campaignId ?? '',
    name: item.name ?? 'Asset senza nome',
    type: item.type ?? 'other',
    imageDataUrl: item.imageDataUrl ?? '',
    thumbnailDataUrl: item.thumbnailDataUrl ?? '',
    localFilePath: item.localFilePath,
    createdAt: item.createdAt ?? new Date().toISOString()
  };
}

function fromVisualAssetRow(row: VisualAssetRow): VisualAsset {
  return normalizeVisualAsset({
    id: row.id,
    campaignId: row.campaign_id ?? '',
    name: row.name ?? 'Asset senza nome',
    type: (row.type ?? 'other') as VisualAssetType,
    imageDataUrl: row.image_data_url ?? '',
    thumbnailDataUrl: row.thumbnail_url ?? '',
    createdAt: row.created_at ?? new Date().toISOString()
  });
}

function fromVisualAssetPreviewRow(row: VisualAssetPreviewRow): VisualAsset {
  const thumbnailDataUrl = row.thumbnail_url ?? '';

  return normalizeVisualAsset({
    id: row.id,
    campaignId: row.campaign_id ?? '',
    name: row.name ?? 'Asset senza nome',
    type: (row.type ?? 'other') as VisualAssetType,
    imageDataUrl: thumbnailDataUrl ? '' : row.image_data_url ?? '',
    thumbnailDataUrl,
    createdAt: row.created_at ?? new Date().toISOString()
  });
}

function toVisualAssetRow(asset: VisualAsset) {
  return {
    id: asset.id,
    campaign_id: asset.campaignId,
    name: asset.name,
    type: asset.type,
    image_data_url: asset.imageDataUrl,
    thumbnail_url: asset.thumbnailDataUrl ?? null,
    url: asset.imageDataUrl,
    created_at: asset.createdAt
  };
}

const localVisualAssetsStorage = createIndexedDbAdapter<VisualAsset>(
  CAMPAIGN_STORAGE_KEYS.visualAssets,
  {
    normalize: item => normalizeVisualAsset(item as Partial<VisualAsset>)
  }
);

export const VISUAL_ASSETS_CHANGED_EVENT = 'hsc:visual-assets-changed';

const VISUAL_ASSETS_CACHE_TTL_MS = 60_000;

let visualAssetsCache: VisualAsset[] | null = null;
let visualAssetsCacheAt = 0;
let visualAssetsCachePromise: Promise<VisualAsset[]> | null = null;
const visualAssetsTypeCache = new Map<string, { at: number; items: VisualAsset[] }>();

function nowMs(): number {
  return Date.now();
}

function isCacheFresh(at: number): boolean {
  return nowMs() - at < VISUAL_ASSETS_CACHE_TTL_MS;
}

function sortVisualAssets(items: VisualAsset[]): VisualAsset[] {
  return [...items].sort((a, b) => {
    const createdCompare = (a.createdAt ?? '').localeCompare(b.createdAt ?? '');

    if (createdCompare !== 0) {
      return createdCompare;
    }

    return a.name.localeCompare(b.name, 'it', { sensitivity: 'base' });
  });
}

function updateVisualAssetsCache(items: VisualAsset[]): void {
  visualAssetsCache = sortVisualAssets(items);
  visualAssetsCacheAt = nowMs();
  visualAssetsTypeCache.clear();
}

function invalidateVisualAssetsCache(): void {
  visualAssetsCache = null;
  visualAssetsCacheAt = 0;
  visualAssetsCachePromise = null;
  visualAssetsTypeCache.clear();
  clearPersistentTypeCaches();
}

function notifyVisualAssetsChanged(): void {
  invalidateVisualAssetsCache();

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(VISUAL_ASSETS_CHANGED_EVENT));
  }
}

function assetPreviewOnly(asset: VisualAsset): VisualAsset {
  return {
    ...asset,
    imageDataUrl: asset.thumbnailDataUrl ? '' : asset.imageDataUrl
  };
}

const FRAME_ASSETS_PERSISTENT_CACHE_PREFIX = 'hsc_visual_assets_type_cache:';

function getPersistentTypeCacheKey(campaignId: string, types: VisualAssetType[]): string {
  return `${FRAME_ASSETS_PERSISTENT_CACHE_PREFIX}${campaignId}:${Array.from(new Set(types)).sort().join('|')}`;
}

function readPersistentTypeCache(campaignId: string, types: VisualAssetType[]): VisualAsset[] | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(getPersistentTypeCacheKey(campaignId, types));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;

    return parsed.map(item => normalizeVisualAsset(item as Partial<VisualAsset>));
  } catch {
    return null;
  }
}

function writePersistentTypeCache(campaignId: string, types: VisualAssetType[], items: VisualAsset[]): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      getPersistentTypeCacheKey(campaignId, types),
      JSON.stringify(items)
    );
  } catch {
    // Ignora cache non scrivibile o quota piena.
  }
}

function clearPersistentTypeCaches(): void {
  if (typeof window === 'undefined') return;

  const keysToRemove: string[] = [];

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);

    if (key?.startsWith(FRAME_ASSETS_PERSISTENT_CACHE_PREFIX)) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach(key => window.localStorage.removeItem(key));
}

const supabaseVisualAssetsStorage: StorageAdapter<VisualAsset> = {
  async getAll() {
    if (visualAssetsCache && isCacheFresh(visualAssetsCacheAt)) {
      return visualAssetsCache;
    }

    if (visualAssetsCachePromise) {
      return visualAssetsCachePromise;
    }

    if (!supabase) {
      visualAssetsCachePromise = localVisualAssetsStorage.getAll().then(items => {
        const sortedItems = sortVisualAssets(items);
        updateVisualAssetsCache(sortedItems);
        visualAssetsCachePromise = null;
        return sortedItems;
      });

      return visualAssetsCachePromise;
    }

    visualAssetsCachePromise = supabase
      .from('visual_assets')
      .select('id,campaign_id,name,type,image_data_url,thumbnail_url,created_at')
      .order('created_at', { ascending: true })
      .then(async ({ data, error }) => {
        if (error) {
          console.error('Errore caricamento visual assets da Supabase:', error);
          const fallbackItems = await localVisualAssetsStorage.getAll();
          const sortedFallback = sortVisualAssets(fallbackItems);
          updateVisualAssetsCache(sortedFallback);
          visualAssetsCachePromise = null;
          return sortedFallback;
        }

        const items = sortVisualAssets((data ?? []).map(row => fromVisualAssetRow(row as VisualAssetRow)));
        updateVisualAssetsCache(items);
        visualAssetsCachePromise = null;
        return items;
      });

    return visualAssetsCachePromise;
  },

  async getById(id) {
    if (!supabase) {
      return localVisualAssetsStorage.getById(id);
    }

    const { data, error } = await supabase
      .from('visual_assets')
      .select('id,campaign_id,name,type,image_data_url,thumbnail_url,created_at')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Errore caricamento visual asset da Supabase:', error);
      return localVisualAssetsStorage.getById(id);
    }

    return data ? fromVisualAssetRow(data as VisualAssetRow) : null;
  },

  async setAll(items) {
    if (!supabase) {
      await localVisualAssetsStorage.setAll(items);
      return;
    }

    for (const item of items) {
      await this.upsert(item);
    }
  },

  async upsert(item) {
    const normalizedItem = normalizeVisualAsset(item);

    if (!supabase) {
      const savedItem = await localVisualAssetsStorage.upsert(normalizedItem);
      notifyVisualAssetsChanged();
      return savedItem;
    }

    const { error } = await supabase
      .from('visual_assets')
      .upsert(toVisualAssetRow(normalizedItem), { onConflict: 'id' });

    if (error) {
      console.error('Errore salvataggio visual asset su Supabase:', error);
      const savedItem = await localVisualAssetsStorage.upsert(normalizedItem);
      notifyVisualAssetsChanged();
      return savedItem;
    }

    notifyVisualAssetsChanged();
    return normalizedItem;
  },

  async remove(id) {
    if (!supabase) {
      await localVisualAssetsStorage.remove(id);
      notifyVisualAssetsChanged();
      return;
    }

    const { data, error } = await supabase
      .from('visual_assets')
      .delete()
      .eq('id', id)
      .select('id');

    if (error) {
      console.error('Errore eliminazione visual asset da Supabase:', error);
      await localVisualAssetsStorage.remove(id);
      return;
    }

    if (!data || data.length === 0) {
      console.warn(
        'Nessun visual asset eliminato da Supabase. Controllare RLS/GRANT/policy DELETE per visual_assets:',
        id
      );
    }

    // Pulisce anche eventuale copia locale/fallback, così l'asset non ricompare
    // se si cambia modalità salvataggio o se il cloud torna temporaneamente non disponibile.
    await localVisualAssetsStorage.remove(id);
    notifyVisualAssetsChanged();
  },

  async clear() {
    if (!supabase) {
      await localVisualAssetsStorage.clear();
      notifyVisualAssetsChanged();
      return;
    }

    const { error } = await supabase.from('visual_assets').delete().neq('id', '');

    if (error) {
      console.error('Errore cancellazione visual assets da Supabase:', error);
      await localVisualAssetsStorage.clear();
    }

    notifyVisualAssetsChanged();
  }
};

function getVisualAssetsStorage(): StorageAdapter<VisualAsset> {
  const settings = readDashboardSettings();

  if (settings.saveMode === 'cloud') {
    return supabaseVisualAssetsStorage;
  }

  if (isTauriRuntime()) {
    return tauriSqliteVisualAssetsStorage;
  }

  return localVisualAssetsStorage;
}

export const visualAssetsStorage: StorageAdapter<VisualAsset> = {
  getAll() {
    const storage = getVisualAssetsStorage();

    if (storage === supabaseVisualAssetsStorage) {
      return supabaseVisualAssetsStorage.getAll();
    }

    if (visualAssetsCache && isCacheFresh(visualAssetsCacheAt)) {
      return Promise.resolve(visualAssetsCache);
    }

    if (visualAssetsCachePromise) {
      return visualAssetsCachePromise;
    }

    visualAssetsCachePromise = storage.getAll().then(items => {
      const sortedItems = sortVisualAssets(items);
      updateVisualAssetsCache(sortedItems);
      visualAssetsCachePromise = null;
      return sortedItems;
    });

    return visualAssetsCachePromise;
  },

  getById(id) {
    return getVisualAssetsStorage().getById(id);
  },

  async setAll(items) {
    await getVisualAssetsStorage().setAll(items);
    notifyVisualAssetsChanged();
  },

  async upsert(item) {
    const storage = getVisualAssetsStorage();
    const savedItem = await storage.upsert(item);

    if (storage !== supabaseVisualAssetsStorage) {
      notifyVisualAssetsChanged();
    }

    return savedItem;
  },

  async remove(id) {
    const storage = getVisualAssetsStorage();
    await storage.remove(id);

    if (storage !== supabaseVisualAssetsStorage) {
      notifyVisualAssetsChanged();
    }
  },

  async clear() {
    const storage = getVisualAssetsStorage();
    await storage.clear();

    if (storage !== supabaseVisualAssetsStorage) {
      notifyVisualAssetsChanged();
    }
  }
};

export async function loadVisualAssetsByType(
  campaignId: string,
  type: VisualAssetType
): Promise<VisualAsset[]> {
  const cacheKey = `${campaignId}:${type}`;
  const cached = visualAssetsTypeCache.get(cacheKey);

  if (cached && isCacheFresh(cached.at)) {
    return cached.items;
  }

  const settings = readDashboardSettings();
  let items: VisualAsset[] = [];

  if (settings.saveMode === 'cloud' && supabase) {
    const { data, error } = await supabase
      .from('visual_assets')
      .select('id,campaign_id,name,type,image_data_url,thumbnail_url,created_at')
      .eq('campaign_id', campaignId)
      .eq('type', type)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Errore caricamento visual assets filtrati da Supabase:', error);
      items = [];
    } else {
      items = (data ?? [])
        .map(row => fromVisualAssetRow(row as VisualAssetRow))
        .filter(asset => Boolean(asset.imageDataUrl));
    }
  } else {
    const assets = await getVisualAssetsStorage().getAll();

    items = assets.filter(asset =>
      asset.campaignId === campaignId &&
      asset.type === type &&
      Boolean(asset.imageDataUrl)
    );
  }

  const sortedItems = sortVisualAssets(items);
  visualAssetsTypeCache.set(cacheKey, {
    at: nowMs(),
    items: sortedItems
  });

  return sortedItems;
}

export async function loadVisualAssetsByTypes(
  campaignId: string,
  types: VisualAssetType[],
  options: { preferPersistentCache?: boolean } = {}
): Promise<VisualAsset[]> {
  const normalizedTypes = Array.from(new Set(types)).sort();
  const cacheKey = `${campaignId}:${normalizedTypes.join('|')}`;
  const cached = visualAssetsTypeCache.get(cacheKey);

  if (cached && isCacheFresh(cached.at)) {
    return cached.items;
  }

  if (options.preferPersistentCache) {
    const persistentCachedItems = readPersistentTypeCache(campaignId, normalizedTypes);

    if (persistentCachedItems && persistentCachedItems.length > 0) {
      const sortedPersistentItems = sortVisualAssets(persistentCachedItems);
      visualAssetsTypeCache.set(cacheKey, {
        at: nowMs(),
        items: sortedPersistentItems
      });

      // Aggiorna in background, senza bloccare la UI.
      void refreshVisualAssetsByTypes(campaignId, normalizedTypes, cacheKey);

      return sortedPersistentItems;
    }
  }

  return refreshVisualAssetsByTypes(campaignId, normalizedTypes, cacheKey);
}

async function refreshVisualAssetsByTypes(
  campaignId: string,
  normalizedTypes: VisualAssetType[],
  cacheKey: string
): Promise<VisualAsset[]> {
  const settings = readDashboardSettings();
  let items: VisualAsset[] = [];

  if (settings.saveMode === 'cloud' && supabase) {
    const { data, error } = await supabase
      .from('visual_assets')
      .select('id,campaign_id,name,type,image_data_url,thumbnail_url,created_at')
      .eq('campaign_id', campaignId)
      .in('type', normalizedTypes)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Errore caricamento visual assets multi-tipo da Supabase:', error);
      items = readPersistentTypeCache(campaignId, normalizedTypes) ?? [];
    } else {
      items = (data ?? [])
        .map(row => fromVisualAssetRow(row as VisualAssetRow))
        .filter(asset => Boolean(asset.imageDataUrl));
    }
  } else {
    const assets = await getVisualAssetsStorage().getAll();

    items = assets.filter(asset =>
      asset.campaignId === campaignId &&
      normalizedTypes.includes(asset.type) &&
      Boolean(asset.imageDataUrl)
    );
  }

  const sortedItems = sortVisualAssets(items);
  visualAssetsTypeCache.set(cacheKey, {
    at: nowMs(),
    items: sortedItems
  });
  writePersistentTypeCache(campaignId, normalizedTypes, sortedItems);

  return sortedItems;
}


export async function loadVisualAssetPreviews(campaignId: string): Promise<VisualAsset[]> {
  const settings = readDashboardSettings();

  if (settings.saveMode === 'cloud' && supabase) {
    const { data, error } = await supabase
      .from('visual_assets')
      .select('id,campaign_id,name,type,image_data_url,thumbnail_url,created_at')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Errore caricamento anteprime visual assets da Supabase:', error);
      const fallbackItems = await getVisualAssetsStorage().getAll();
      return sortVisualAssets(fallbackItems.map(assetPreviewOnly));
    }

    return sortVisualAssets((data ?? []).map(row => fromVisualAssetPreviewRow(row as VisualAssetPreviewRow)));
  }

  const assets = await getVisualAssetsStorage().getAll();

  return sortVisualAssets(
    assets
      .filter(asset => asset.campaignId === campaignId)
      .map(assetPreviewOnly)
  );
}

function createVisualAssetThumbnail(dataUrl: string, maxSize = 360): Promise<string> {
  return new Promise(resolve => {
    if (typeof window === 'undefined') {
      resolve(dataUrl);
      return;
    }

    const image = new window.Image();

    image.onload = () => {
      const ratio = Math.min(maxSize / image.width, maxSize / image.height, 1);
      const width = Math.max(1, Math.round(image.width * ratio));
      const height = Math.max(1, Math.round(image.height * ratio));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext('2d');

      if (!context) {
        resolve(dataUrl);
        return;
      }

      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.78));
    };

    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  });
}

export async function regenerateMissingVisualAssetThumbnails(
  campaignId: string,
  onProgress?: (progress: { processed: number; total: number; updated: number }) => void
): Promise<{ processed: number; total: number; updated: number }> {
  const allAssets = await visualAssetsStorage.getAll();
  const campaignAssets = allAssets.filter(asset => asset.campaignId === campaignId);
  const assetsWithoutThumbnail = campaignAssets.filter(asset =>
    Boolean(asset.imageDataUrl) &&
    !asset.thumbnailDataUrl
  );

  let processed = 0;
  let updated = 0;
  const total = assetsWithoutThumbnail.length;

  onProgress?.({ processed, total, updated });

  for (const asset of assetsWithoutThumbnail) {
    const thumbnailDataUrl = await createVisualAssetThumbnail(asset.imageDataUrl);

    await visualAssetsStorage.upsert({
      ...asset,
      thumbnailDataUrl
    });

    processed += 1;
    updated += 1;
    onProgress?.({ processed, total, updated });
  }

  notifyVisualAssetsChanged();

  return {
    processed,
    total,
    updated
  };
}
