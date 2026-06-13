import { useCallback, useEffect, useMemo, useState } from 'react';
import type { StorageAdapter } from '../services/storage/storageAdapter';

type CampaignEntity = {
  id: string;
  campaignId: string;
};

type UseCampaignEntitiesOptions<T extends CampaignEntity> = {
  defaultItems?: T[];
  enabled?: boolean;
};

const EMPTY_ITEMS: never[] = [];

export function useCampaignEntities<T extends CampaignEntity>(
  storage: StorageAdapter<T>,
  campaignId: string,
  storageRefreshKeyOrOptions: number | UseCampaignEntitiesOptions<T> = {},
  maybeOptions: UseCampaignEntitiesOptions<T> = {}
) {
  const storageRefreshKey =
    typeof storageRefreshKeyOrOptions === 'number'
      ? storageRefreshKeyOrOptions
      : 0;

  const options =
    typeof storageRefreshKeyOrOptions === 'number'
      ? maybeOptions
      : storageRefreshKeyOrOptions;

  const enabled = options.enabled ?? true;

  const defaultItems = useMemo(
    () => options.defaultItems ?? (EMPTY_ITEMS as T[]),
    [options.defaultItems]
  );

  const [items, setItems] = useState<T[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    let mounted = true;

    setLoaded(false);

    storage
      .getAll()
      .then(storedItems => {
        if (!mounted) return;

        const campaignItems = storedItems.filter(
          item => item.campaignId === campaignId
        );

        setItems(campaignItems.length > 0 ? campaignItems : defaultItems);
        setLoaded(true);
      })
      .catch(error => {
        console.error('Errore caricamento entità campagna:', error);

        if (mounted) {
          setItems(defaultItems);
          setLoaded(true);
        }
      });

    return () => {
      mounted = false;
    };
  }, [storage, campaignId, enabled, defaultItems, storageRefreshKey]);

  useEffect(() => {
    if (!loaded || !enabled) return;

    storage
      .getAll()
      .then(allItems => {
        const otherCampaignItems = allItems.filter(
          item => item.campaignId !== campaignId
        );

        return storage.setAll([...otherCampaignItems, ...items]);
      })
      .catch(error => {
        console.error('Errore salvataggio entità campagna:', error);
      });
  }, [items, loaded, enabled, campaignId, storage]);

  const upsert = useCallback((item: T) => {
    setItems(prev => {
      const exists = prev.some(current => current.id === item.id);

      return exists
        ? prev.map(current => (current.id === item.id ? item : current))
        : [...prev, item];
    });
  }, []);

  const remove = useCallback((id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  }, []);

  const reload = useCallback(async () => {
    const storedItems = await storage.getAll();

    setItems(
      storedItems.filter(item => item.campaignId === campaignId)
    );
  }, [storage, campaignId]);

  return {
    items,
    setItems,
    loaded,
    reload,
    upsert,
    remove
  };
}