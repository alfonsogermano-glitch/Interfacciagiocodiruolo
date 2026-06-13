import { useEffect, useState } from 'react';

type Entity = {
  id: string;
};

export function useCampaignEntitySelection<T extends Entity>(items: T[]) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedItem =
    items.find(item => item.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId) return;

    const stillExists = items.some(item => item.id === selectedId);

    if (!stillExists) {
      setSelectedId(items[0]?.id ?? null);
    }
  }, [items, selectedId]);

  const selectItem = (item: T | null) => {
    setSelectedId(item?.id ?? null);
  };

  const clearSelection = () => {
    setSelectedId(null);
  };

  return {
    selectedId,
    selectedItem,
    setSelectedId,
    selectItem,
    clearSelection
  };
}