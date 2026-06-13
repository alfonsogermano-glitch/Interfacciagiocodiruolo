import { useCallback, useEffect, useState } from 'react';

import {
  addCharacterEquipmentFromCatalog,
  addCustomCharacterEquipment,
  getCharacterEquipment,
  removeCharacterEquipment,
  updateCharacterEquipment
} from '../../../services/equipment/characterEquipmentService';

import type {
  AddCharacterEquipmentFromCatalogInput,
  AddCustomCharacterEquipmentInput,
  CharacterEquipmentItem,
  UpdateCharacterEquipmentInput
} from '../../../types/equipment';

interface UseCharacterEquipmentOptions {
  characterId?: string;
  enabled?: boolean;
}

interface UseCharacterEquipmentResult {
  items: CharacterEquipmentItem[];
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;

  refresh: () => Promise<void>;

  addFromCatalog: (
    input: Omit<AddCharacterEquipmentFromCatalogInput, 'characterId'>
  ) => Promise<CharacterEquipmentItem | null>;

  addCustom: (
    input: Omit<AddCustomCharacterEquipmentInput, 'characterId'>
  ) => Promise<CharacterEquipmentItem | null>;

  updateItem: (
    itemId: string,
    patch: UpdateCharacterEquipmentInput
  ) => Promise<CharacterEquipmentItem | null>;

  removeItem: (itemId: string) => Promise<boolean>;
}

export function useCharacterEquipment(
  options: UseCharacterEquipmentOptions = {}
): UseCharacterEquipmentResult {
  const { characterId, enabled = true } = options;

  const [items, setItems] = useState<CharacterEquipmentItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(enabled);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled || !characterId) {
      setItems([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await getCharacterEquipment(characterId);
      setItems(result);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Errore sconosciuto nel caricamento dell'equipaggiamento";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [characterId, enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addFromCatalog = useCallback(
    async (
      input: Omit<AddCharacterEquipmentFromCatalogInput, 'characterId'>
    ): Promise<CharacterEquipmentItem | null> => {
      if (!characterId) {
        setError('characterId mancante');
        return null;
      }

      setIsSaving(true);
      setError(null);

      try {
        const created = await addCharacterEquipmentFromCatalog({
          characterId,
          ...input
        });

        setItems(prev => [...prev, created]);
        return created;
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Errore sconosciuto nell'aggiunta da catalogo";
        setError(message);
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [characterId]
  );

  const addCustom = useCallback(
    async (
      input: Omit<AddCustomCharacterEquipmentInput, 'characterId'>
    ): Promise<CharacterEquipmentItem | null> => {
      if (!characterId) {
        setError('characterId mancante');
        return null;
      }

      setIsSaving(true);
      setError(null);

      try {
        const created = await addCustomCharacterEquipment({
          characterId,
          ...input
        });

        setItems(prev => [...prev, created]);
        return created;
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Errore sconosciuto nell'aggiunta custom";
        setError(message);
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [characterId]
  );

  const updateItem = useCallback(
    async (
      itemId: string,
      patch: UpdateCharacterEquipmentInput
    ): Promise<CharacterEquipmentItem | null> => {
      setIsSaving(true);
      setError(null);

      try {
        const updated = await updateCharacterEquipment(itemId, patch);

        setItems(prev =>
          prev.map(item => (item.id === itemId ? updated : item))
        );

        return updated;
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Errore sconosciuto nell'aggiornamento dell'oggetto";
        setError(message);
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    []
  );

  const removeItem = useCallback(async (itemId: string): Promise<boolean> => {
    setIsSaving(true);
    setError(null);

    try {
      await removeCharacterEquipment(itemId);

      setItems(prev => prev.filter(item => item.id !== itemId));
      return true;
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Errore sconosciuto nella rimozione dell'oggetto";
      setError(message);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, []);

  return {
    items,
    isLoading,
    isSaving,
    error,
    refresh,
    addFromCatalog,
    addCustom,
    updateItem,
    removeItem
  };
}