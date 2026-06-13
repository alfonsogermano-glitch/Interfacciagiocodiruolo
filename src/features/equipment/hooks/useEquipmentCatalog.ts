import { useCallback, useEffect, useState } from 'react';

import {
  getEquipmentCatalog,
  getEquipmentCatalogForManagement
} from '../../../services/equipment/equipmentCatalogService';
import type { EquipmentCatalogItem } from '../../../types/equipment';

interface UseEquipmentCatalogOptions {
  campaignId?: string;
  managementMode?: boolean;
  enabled?: boolean;
  storageRefreshKey?: number;
}

interface UseEquipmentCatalogResult {
  items: EquipmentCatalogItem[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useEquipmentCatalog(
  options: UseEquipmentCatalogOptions = {}
): UseEquipmentCatalogResult {
  const {
  campaignId,
  managementMode = false,
  enabled = true,
  storageRefreshKey = 0
} = options;

  const [items, setItems] = useState<EquipmentCatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setItems([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = managementMode
        ? await getEquipmentCatalogForManagement(campaignId)
        : await getEquipmentCatalog(campaignId);

      setItems(result);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Errore sconosciuto nel caricamento del catalogo';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [campaignId, managementMode, enabled, storageRefreshKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    items,
    isLoading,
    error,
    refresh
  };
}