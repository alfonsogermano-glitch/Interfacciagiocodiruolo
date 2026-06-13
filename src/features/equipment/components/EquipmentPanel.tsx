import { useMemo, useState } from 'react';
import {
  Backpack,
  Car,
  Home,
  Link2,
  Package,
  Plus,
  Shield,
  Circle,
  Trash2
} from 'lucide-react';

import { AddEquipmentModal } from '@/features/equipment/components/AddEquipmentModal';
import { useCharacterEquipment } from '@/features/equipment/hooks/useCharacterEquipment';
import { useEquipmentCatalog } from '@/features/equipment/hooks/useEquipmentCatalog';

import {
  BACKPACK_NAME,
  countActiveTransportables,
  countPocketItemsInPocket,
  getLocationLabel,
  hasBackpack,
  isBackpack,
  isTransportable,
  validateEquipmentLocationChange,
  validateInseparableToggle
} from '@/lib/rules/equipmentRules';

import type { CharacterEquipmentItem } from '@/types/equipment';

interface EquipmentPanelProps {
  characterId: string;
  campaignId?: string;
}

function getLocationActionIcon(location: CharacterEquipmentItem['location']) {
  switch (location) {
    case 'in_tasca':
      return <Circle className="h-3.5 w-3.5" />;
    case 'nel_zaino':
      return <Backpack className="h-4 w-4" />;
    case 'indossato':
      return <Shield className="h-4 w-4" />;
    case 'a_casa':
      return <Home className="h-4 w-4" />;
    case 'disponibile':
      return <Car className="h-4 w-4" />;
    default:
      return <Package className="h-4 w-4" />;
  }
}

export function EquipmentPanel({
  characterId,
  campaignId
}: EquipmentPanelProps) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const {
    items,
    isLoading,
    isSaving,
    error: equipmentError,
    addFromCatalog,
    addCustom,
    updateItem,
    removeItem
  } = useCharacterEquipment({
    characterId,
    enabled: !!characterId
  });

  const {
    items: catalogItems,
    isLoading: isLoadingCatalog,
    error: catalogError
  } = useEquipmentCatalog({
    campaignId,
    enabled: true
  });

  const backpackPresent = useMemo(() => hasBackpack(items), [items]);

  const pocketItems = useMemo(
    () =>
      items.filter(
        item => item.type === 'tascabile' && item.location === 'in_tasca'
      ),
    [items]
  );

  const activeTransportables = useMemo(
    () =>
      items.filter(
        item =>
          !isBackpack(item) &&
          isTransportable(item) &&
          (item.location === 'indossato' || item.location === 'nel_zaino')
      ),
    [items]
  );

  const homeObjects = useMemo(
    () =>
      items.filter(
        item =>
          (item.type === 'tascabile' ||
            item.type === 'trasportabile' ||
            item.type === 'arma') &&
          item.location === 'a_casa'
      ),
    [items]
  );

  const homeResources = useMemo(
    () =>
      items.filter(
        item =>
          item.type === 'risorsa' &&
          !item.isVehicle &&
          item.location === 'a_casa'
      ),
    [items]
  );

  const homeVehicles = useMemo(
    () =>
      items.filter(
        item =>
          item.type === 'risorsa' &&
          item.isVehicle &&
          item.location === 'a_casa'
      ),
    [items]
  );

  const activeVehicles = useMemo(
    () =>
      items.filter(
        item =>
          item.type === 'risorsa' &&
          item.isVehicle &&
          item.location === 'disponibile'
      ),
    [items]
  );

  const generalError = actionError || equipmentError || catalogError;

  const handleMove = async (
    item: CharacterEquipmentItem,
    nextLocation: CharacterEquipmentItem['location']
  ) => {
    setActionError(null);

    const validation = validateEquipmentLocationChange(item, nextLocation, items);

    if (!validation.valid) {
      setActionError(validation.reason ?? 'Spostamento non consentito.');
      return;
    }

    await updateItem(item.id, {
      location: nextLocation
    });
  };

  const handleToggleInseparabile = async (item: CharacterEquipmentItem) => {
    setActionError(null);

    const nextValue = !item.inseparabile;
    const validation = validateInseparableToggle(item, nextValue, items);

    if (!validation.valid) {
      setActionError(validation.reason ?? 'Operazione non consentita.');
      return;
    }

    const patch: {
  inseparabile: boolean;
  location?: CharacterEquipmentItem['location'];
} = {
  inseparabile: nextValue
};

    if (nextValue) {
      patch.location = backpackPresent ? 'nel_zaino' : 'indossato';
    }

    await updateItem(item.id, {
      inseparabile: patch.inseparabile,
      location: patch.location
    });
  };

  const handleRemove = async (item: CharacterEquipmentItem) => {
    setActionError(null);
    await removeItem(item.id);
  };

  const renderItemActions = (item: CharacterEquipmentItem) => {
    const locationActions: Array<{
      key: CharacterEquipmentItem['location'];
      label: string;
    }> = [];

    if (item.type === 'tascabile') {
      if (item.location !== 'in_tasca') {
        locationActions.push({
          key: 'in_tasca',
          label: 'Sposta in tasca'
        });
      }

      if (item.location !== 'a_casa') {
        locationActions.push({
          key: 'a_casa',
          label: 'Sposta a casa'
        });
      }
    }

    if (item.type === 'trasportabile' || item.type === 'arma') {
      if (isBackpack(item)) {
        if (item.location !== 'indossato') {
          locationActions.push({
            key: 'indossato',
            label: 'Metti addosso'
          });
        }

        if (item.location !== 'a_casa') {
          locationActions.push({
            key: 'a_casa',
            label: 'Sposta a casa'
          });
        }
      } else {
        if (backpackPresent && item.location !== 'nel_zaino') {
          locationActions.push({
            key: 'nel_zaino',
            label: 'Sposta nello zaino'
          });
        }

        if (item.location !== 'indossato') {
          locationActions.push({
            key: 'indossato',
            label: 'Sposta addosso'
          });
        }

        if (item.location !== 'a_casa') {
          locationActions.push({
            key: 'a_casa',
            label: 'Sposta a casa'
          });
        }
      }
    }

    if (item.type === 'risorsa' && item.isVehicle) {
      if (item.location !== 'disponibile') {
        locationActions.push({
          key: 'disponibile',
          label: 'Rendi disponibile'
        });
      }

      if (item.location !== 'a_casa') {
        locationActions.push({
          key: 'a_casa',
          label: 'Sposta a casa'
        });
      }
    }

    return (
      <div className="ml-2 flex flex-wrap items-center gap-1.5">
        {locationActions.map(action => (
          <button
            key={action.key}
            type="button"
            onClick={() => void handleMove(item, action.key)}
            disabled={isSaving}
            title={action.label}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--dash-border)] bg-[var(--dash-panel)] text-[var(--dash-text)] transition-colors hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text-strong)] disabled:opacity-50"
          >
            {getLocationActionIcon(action.key)}
          </button>
        ))}

        {(item.type === 'trasportabile' || item.type === 'arma') &&
          !isBackpack(item) && (
            <button
              type="button"
              onClick={() => void handleToggleInseparabile(item)}
              disabled={isSaving}
              title={
                item.inseparabile
                  ? 'Rimuovi stato inseparabile'
                  : 'Rendi inseparabile'
              }
              className={`flex h-8 w-8 items-center justify-center rounded-md border transition-colors disabled:opacity-50 ${
                item.inseparabile
                  ? 'border-[var(--dash-accent)] bg-[var(--dash-accent)] text-[var(--dash-text-strong)]'
                  : 'border-[var(--dash-border)] bg-[var(--dash-panel)] text-[var(--dash-text)] hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text-strong)]'
              }`}
            >
              <Link2 className="h-4 w-4" />
            </button>
          )}

        <button
          type="button"
          onClick={() => void handleRemove(item)}
          disabled={isSaving}
          title="Elimina oggetto"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)] text-[var(--dash-danger-text)] transition-colors hover:bg-[var(--dash-danger-hover)] disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    );
  };

  const renderItems = (sectionItems: CharacterEquipmentItem[]) => {
    if (sectionItems.length === 0) {
      return (
        <div className="py-2 text-center text-xs italic text-[var(--dash-muted)]">
          Nessun oggetto
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {sectionItems.map(item => (
          <div
            key={item.id}
            className="rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-[var(--dash-text)]">
                  {item.name}
                </div>

                {item.description && (
                  <div className="mt-0.5 line-clamp-2 text-xs text-[var(--dash-muted)]">
                    {item.description}
                  </div>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] ${
                      isBackpack(item)
                        ? 'border border-[var(--dash-accent)] bg-[var(--dash-accent)] text-[var(--dash-text-strong)]'
                        : 'border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] text-[var(--dash-text)]'
                    }`}
                  >
                    {getLocationLabel(item.location)}
                  </span>

                  <span className="rounded-full border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-2 py-0.5 text-[11px] text-[var(--dash-text)]">
                    {item.type}
                  </span>

                  {item.isVehicle && (
                    <span className="rounded-full border border-[var(--dash-accent)] bg-[var(--dash-panel)] px-2 py-0.5 text-[11px] text-[var(--dash-text)]">
                      Veicolo
                    </span>
                  )}

                  {item.inseparabile && (
                    <span className="rounded-full border border-[var(--dash-accent)] bg-[var(--dash-accent)] px-2 py-0.5 text-[11px] text-[var(--dash-text-strong)]">
                      Inseparabile
                    </span>
                  )}

                  {item.source === 'catalog' && (
                    <span className="rounded-full border border-[var(--dash-accent)] bg-[var(--dash-panel)] px-2 py-0.5 text-[11px] text-[var(--dash-text)]">
                      Catalogo
                    </span>
                  )}

                  {item.source === 'custom' && (
                    <span className="rounded-full border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-2 py-0.5 text-[11px] text-[var(--dash-text)]">
                      Custom
                    </span>
                  )}
                </div>
              </div>

              {renderItemActions(item)}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      <div className="rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Backpack className="h-5 w-5 text-[var(--dash-accent-2)]" />
            <h3 className="font-medium text-[var(--dash-text)]">Equipaggiamento</h3>
          </div>

          <button
            type="button"
            onClick={() => {
              setActionError(null);
              setIsAddOpen(true);
            }}
            className="rounded border border-[var(--dash-border)] bg-[var(--dash-input)] p-1.5 transition-colors hover:bg-[var(--dash-surface-2)]"
          >
            <Plus className="h-4 w-4 text-[var(--dash-text)]" />
          </button>
        </div>

        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-2 py-1 text-[var(--dash-text)]">
            Tascabili in tasca: {countPocketItemsInPocket(items)}/5
          </span>
          <span className="rounded-full border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-2 py-1 text-[var(--dash-text)]">
            Trasportabili attivi: {countActiveTransportables(items)}/4
          </span>
          <span className="rounded-full border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-2 py-1 text-[var(--dash-text)]">
            Zaino: {backpackPresent ? 'Sì' : 'No'}
          </span>
        </div>

        {generalError && (
          <div className="mb-4 rounded-lg border border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)] px-3 py-2 text-sm text-[var(--dash-danger-text)]">
            {generalError}
          </div>
        )}

        {isLoading ? (
          <div className="rounded-lg border border-[var(--dash-border)] bg-[var(--dash-panel)] px-3 py-4 text-sm text-[var(--dash-text)]">
            Caricamento equipaggiamento...
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <div className="mb-1.5 text-xs font-medium text-[var(--dash-muted)]">
                Tascabili in tasca ({pocketItems.length}/5)
              </div>
              {renderItems(pocketItems)}
            </div>

            <div>
              <div className="mb-1.5 text-xs font-medium text-[var(--dash-muted)]">
                Trasportabili attivi ({activeTransportables.length}/4)
              </div>
              {renderItems(activeTransportables)}
            </div>

            <div>
              <div className="mb-1.5 text-xs font-medium text-[var(--dash-muted)]">
                Oggetti a casa
              </div>
              {renderItems(homeObjects)}
            </div>

            <div>
              <div className="mb-1.5 text-xs font-medium text-[var(--dash-muted)]">
                Risorse a casa
              </div>
              {renderItems(homeResources)}
            </div>

            <div>
              <div className="mb-1.5 text-xs font-medium text-[var(--dash-muted)]">
                Veicoli a casa
              </div>
              {renderItems(homeVehicles)}
            </div>

            <div>
              <div className="mb-1.5 text-xs font-medium text-[var(--dash-muted)]">
                Veicoli in uso
              </div>
              {renderItems(activeVehicles)}
            </div>
          </div>
        )}
      </div>

      <AddEquipmentModal
  isOpen={isAddOpen}
  onClose={() => setIsAddOpen(false)}
  hasZaino={backpackPresent}
  catalogItems={catalogItems}
  isLoadingCatalog={isLoadingCatalog}
  currentEquipment={items}
  onAddFromCatalog={addFromCatalog}
  onAddCustom={addCustom}
/>
    </>
  );
}