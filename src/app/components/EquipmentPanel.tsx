import {
  Backpack,
  Plus,
  X,
  Home,
  Shield,
  Link2,
  Car,
  Circle
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import type { Equipment } from '../../types/character';
import {
  OGGETTI_TASCABILI,
  OGGETTI_TRASPORTABILI,
  RISORSE,
  RISORSE_VEICOLI
} from '../../data/equipmentData';
import { generateUUID } from '../../lib/uuid';

interface EquipmentPanelProps {
  equipment: Equipment[];
  onUpdate: (equipment: Equipment[]) => void;
}

type AllowedLocation =
  | 'in_tasca'
  | 'nel_zaino'
  | 'indossato'
  | 'a_casa'
  | 'disponibile';

type EquipmentType = Equipment['type'];
type EquipmentLocation = Equipment['location'];

const MAX_TASCABILI_IN_TASCA = 5;
const MAX_TRASPORTABILI_ATTIVI = 4;
const BACKPACK_NAME = 'Zaino';

const INITIAL_NEW_ITEM: Partial<Equipment> = {
  name: '',
  type: 'tascabile',
  description: '',
  location: 'in_tasca',
  inseparabile: false,
  isVehicle: false
};

export function EquipmentPanel({ equipment, onUpdate }: EquipmentPanelProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [newItem, setNewItem] = useState<Partial<Equipment>>(INITIAL_NEW_ITEM);

  const isBackpack = (item?: Partial<Equipment>) => item?.name === BACKPACK_NAME;

  const hasZaino = useMemo(
    () => equipment.some(item => isBackpack(item)),
    [equipment]
  );

  const counts = useMemo(() => {
    const tascabiliInTasca = equipment.filter(
      item => item.type === 'tascabile' && item.location === 'in_tasca'
    );

    const trasportabiliAttivi = equipment.filter(
      item =>
        !isBackpack(item) &&
        (item.type === 'trasportabile' || item.type === 'arma') &&
        (item.location === 'nel_zaino' || item.location === 'indossato')
    );

    const oggettiACasa = equipment.filter(
      item =>
        (item.type === 'tascabile' ||
          item.type === 'trasportabile' ||
          item.type === 'arma') &&
        item.location === 'a_casa'
    );

    const risorseACasa = equipment.filter(
      item =>
        item.type === 'risorsa' &&
        !item.isVehicle &&
        item.location === 'a_casa'
    );

    const veicoliACasa = equipment.filter(
      item =>
        item.type === 'risorsa' &&
        item.isVehicle &&
        item.location === 'a_casa'
    );

    const veicoliDisponibili = equipment.filter(
      item =>
        item.type === 'risorsa' &&
        item.isVehicle &&
        item.location === 'disponibile'
    );

    const inseparabileGiaPresente = equipment.some(
      item =>
        !isBackpack(item) &&
        (item.type === 'trasportabile' || item.type === 'arma') &&
        item.inseparabile
    );

    return {
      tascabiliInTasca,
      trasportabiliAttivi,
      oggettiACasa,
      risorseACasa,
      veicoliACasa,
      veicoliDisponibili,
      inseparabileGiaPresente
    };
  }, [equipment]);

  const getAllowedLocations = (item: Partial<Equipment>): AllowedLocation[] => {
    if (item.type === 'tascabile') {
      return ['in_tasca', 'a_casa'];
    }

    if (item.type === 'trasportabile' || item.type === 'arma') {
      if (isBackpack(item)) {
        return ['indossato', 'a_casa'];
      }

      return hasZaino
        ? ['nel_zaino', 'indossato', 'a_casa']
        : ['indossato', 'a_casa'];
    }

    if (item.type === 'risorsa' && item.isVehicle) {
      return ['a_casa', 'disponibile'];
    }

    return ['a_casa'];
  };

  const getDefaultLocationForItem = (item: Partial<Equipment>): EquipmentLocation => {
    if ((item.type === 'trasportabile' || item.type === 'arma') && item.inseparabile && !isBackpack(item)) {
      return hasZaino ? 'nel_zaino' : 'indossato';
    }

    return getAllowedLocations(item)[0];
  };

  const getLocationLabel = (location: EquipmentLocation) => {
    switch (location) {
      case 'in_tasca':
        return 'In tasca';
      case 'nel_zaino':
        return 'Nello zaino';
      case 'indossato':
        return 'Addosso';
      case 'a_casa':
        return 'A casa';
      case 'disponibile':
        return 'Disponibile';
      default:
        return location;
    }
  };

  const getAvailableNamesByType = (type?: EquipmentType) => {
    if (type === 'tascabile') {
      return OGGETTI_TASCABILI;
    }

    if (type === 'trasportabile' || type === 'arma') {
      return OGGETTI_TRASPORTABILI;
    }

    if (type === 'risorsa') {
      return RISORSE;
    }

    return [];
  };

  const canPlaceItemAtLocation = (
    item: Partial<Equipment>,
    location: EquipmentLocation,
    indexToIgnore?: number
  ) => {
    if (!item.type || !location) {
      return false;
    }

    const otherItems = equipment.filter((_, i) => i !== indexToIgnore);

    if (item.type === 'tascabile') {
      if (location !== 'in_tasca' && location !== 'a_casa') {
        return false;
      }

      if (location === 'in_tasca') {
        const currentPocketCount = otherItems.filter(
          e => e.type === 'tascabile' && e.location === 'in_tasca'
        ).length;

        return currentPocketCount < MAX_TASCABILI_IN_TASCA;
      }

      return true;
    }

    if (item.type === 'trasportabile' || item.type === 'arma') {
      if (isBackpack(item)) {
        return location === 'indossato' || location === 'a_casa';
      }

      if (
        location !== 'nel_zaino' &&
        location !== 'indossato' &&
        location !== 'a_casa'
      ) {
        return false;
      }

      if (location === 'nel_zaino' && !hasZaino) {
        return false;
      }

      if (location === 'nel_zaino' || location === 'indossato') {
        const activeCount = otherItems.filter(
          e =>
            !isBackpack(e) &&
            (e.type === 'trasportabile' || e.type === 'arma') &&
            (e.location === 'nel_zaino' || e.location === 'indossato')
        ).length;

        if (activeCount >= MAX_TRASPORTABILI_ATTIVI) {
          return false;
        }
      }

      if (item.inseparabile) {
        const anotherInseparabileExists = otherItems.some(
          e =>
            !isBackpack(e) &&
            (e.type === 'trasportabile' || e.type === 'arma') &&
            e.inseparabile
        );

        if (anotherInseparabileExists) {
          return false;
        }
      }

      return true;
    }

    if (item.type === 'risorsa') {
      if (item.isVehicle) {
        return location === 'a_casa' || location === 'disponibile';
      }

      return location === 'a_casa';
    }

    return false;
  };

  const canAddItem = () => {
    if (!newItem.name || !newItem.type || !newItem.location) {
      return false;
    }

    if (isBackpack(newItem) && hasZaino) {
      return false;
    }

    return canPlaceItemAtLocation(newItem, newItem.location);
  };

  const toggleZaino = () => {
    if (hasZaino) {
      const updated = equipment
        .filter(item => !isBackpack(item))
        .map(item => {
          if (item.location === 'nel_zaino') {
            return {
              ...item,
              location: 'indossato' as const
            };
          }

          return item;
        });

      onUpdate(updated);
      return;
    }

    onUpdate([
  ...equipment,
  {
  id: generateUUID(),
  name: BACKPACK_NAME,
  type: 'trasportabile',
  description: '',
  location: 'indossato',
  inseparabile: false,
  isVehicle: false
}
]);
  };

  const addItem = () => {
    if (!canAddItem()) {
      return;
    }

    const itemToAdd: Equipment = {
  id: generateUUID(),
  name: newItem.name!,
  type: newItem.type!,
  description: newItem.description ?? '',
  location: newItem.location!,
  inseparabile: newItem.inseparabile ?? false,
  isVehicle: newItem.isVehicle ?? false
};

    onUpdate([...equipment, itemToAdd]);
    setNewItem(INITIAL_NEW_ITEM);
    setShowAdd(false);
  };

  const removeItem = (index: number) => {
    onUpdate(equipment.filter((_, i) => i !== index));
  };

  const moveItem = (index: number, nextLocation: EquipmentLocation) => {
    const item = equipment[index];

    if (!item) {
      return;
    }

    if (!canPlaceItemAtLocation(item, nextLocation, index)) {
      return;
    }

    const updated = [...equipment];
    updated[index] = {
      ...item,
      location: nextLocation
    };

    onUpdate(updated);
  };

  const toggleInseparabile = (index: number) => {
    const item = equipment[index];

    if (!item) {
      return;
    }

    if (
      (item.type !== 'trasportabile' && item.type !== 'arma') ||
      isBackpack(item)
    ) {
      return;
    }

    const nextInseparabile = !item.inseparabile;

    const updatedItem: Equipment = {
      ...item,
      inseparabile: nextInseparabile,
      location: nextInseparabile
        ? hasZaino
          ? 'nel_zaino'
          : 'indossato'
        : item.location
    };

    if (!canPlaceItemAtLocation(updatedItem, updatedItem.location, index)) {
      return;
    }

    const updated = [...equipment];
    updated[index] = updatedItem;
    onUpdate(updated);
  };

  const renderItems = (items: Equipment[], canMove = false) => (
    <div className="space-y-2">
      {items.length === 0 ? (
        <div className="py-2 text-center text-xs italic text-[var(--dash-muted)]">
          Nessun oggetto
        </div>
      ) : (
        items.map(item => {
          const globalIdx = equipment.findIndex(e => e === item);

          const locationActions: Array<{
            key: EquipmentLocation;
            label: string;
            icon: ReactNode;
          }> = [];

          if (canMove) {
            if (item.type === 'tascabile') {
              if (item.location !== 'in_tasca') {
                locationActions.push({
                  key: 'in_tasca',
                  label: 'Sposta in tasca',
                  icon: <Circle className="h-3.5 w-3.5" />
                });
              }

              if (item.location !== 'a_casa') {
                locationActions.push({
                  key: 'a_casa',
                  label: 'Sposta a casa',
                  icon: <Home className="h-4 w-4" />
                });
              }
            }

            if (item.type === 'trasportabile' || item.type === 'arma') {
              if (isBackpack(item)) {
                if (item.location !== 'indossato') {
                  locationActions.push({
                    key: 'indossato',
                    label: 'Metti addosso',
                    icon: <Shield className="h-4 w-4" />
                  });
                }

                if (item.location !== 'a_casa') {
                  locationActions.push({
                    key: 'a_casa',
                    label: 'Sposta a casa',
                    icon: <Home className="h-4 w-4" />
                  });
                }
              } else {
                if (hasZaino && item.location !== 'nel_zaino') {
                  locationActions.push({
                    key: 'nel_zaino',
                    label: 'Sposta nello zaino',
                    icon: <Backpack className="h-4 w-4" />
                  });
                }

                if (item.location !== 'indossato') {
                  locationActions.push({
                    key: 'indossato',
                    label: 'Sposta addosso',
                    icon: <Shield className="h-4 w-4" />
                  });
                }

                if (item.location !== 'a_casa') {
                  locationActions.push({
                    key: 'a_casa',
                    label: 'Sposta a casa',
                    icon: <Home className="h-4 w-4" />
                  });
                }
              }
            }

            if (item.type === 'risorsa' && item.isVehicle) {
              if (item.location !== 'disponibile') {
                locationActions.push({
                  key: 'disponibile',
                  label: 'Rendi disponibile',
                  icon: <Car className="h-4 w-4" />
                });
              }

              if (item.location !== 'a_casa') {
                locationActions.push({
                  key: 'a_casa',
                  label: 'Sposta a casa',
                  icon: <Home className="h-4 w-4" />
                });
              }
            }
          }

          return (
            <div
              key={item.id ?? `${item.name}-${globalIdx}`}
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

                    {item.inseparabile && (
                      <span className="rounded-full border border-[var(--dash-accent)] bg-[var(--dash-accent)] px-2 py-0.5 text-[11px] text-[var(--dash-text-strong)]">
                        Inseparabile
                      </span>
                    )}
                  </div>
                </div>

                <div className="ml-2 flex flex-wrap items-center gap-1.5">
                  {locationActions.map(action => (
                    <div key={action.key} className="group relative">
                      <button
                        type="button"
                        onClick={() => moveItem(globalIdx, action.key)}
                        className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--dash-border)] bg-[var(--dash-panel)] text-[var(--dash-text)] transition-colors hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text-strong)]"
                      >
                        {action.icon}
                      </button>

                      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-[var(--dash-accent)] bg-[var(--dash-panel)] px-3 py-2 text-xs text-[var(--dash-text-strong)] shadow-xl group-hover:block">
                        {action.label}
                        <div className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 rotate-45 border-r border-b border-[var(--dash-accent)] bg-[var(--dash-panel)]" />
                      </div>
                    </div>
                  ))}

                  {(item.type === 'trasportabile' || item.type === 'arma') &&
                    !isBackpack(item) && (
                      <div className="group relative">
                        <button
                          type="button"
                          onClick={() => toggleInseparabile(globalIdx)}
                          className={`flex h-8 w-8 items-center justify-center rounded-md border transition-colors ${
                            item.inseparabile
                              ? 'border-[var(--dash-accent)] bg-[var(--dash-accent)] text-[var(--dash-text-strong)]'
                              : 'border-[var(--dash-border)] bg-[var(--dash-panel)] text-[var(--dash-text)] hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text-strong)]'
                          }`}
                        >
                          <Link2 className="h-4 w-4" />
                        </button>

                        <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-[var(--dash-accent)] bg-[var(--dash-panel)] px-3 py-2 text-xs text-[var(--dash-text-strong)] shadow-xl group-hover:block">
                          {item.inseparabile
                            ? 'Oggetto inseparabile'
                            : 'Rendi inseparabile'}
                          <div className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 rotate-45 border-r border-b border-[var(--dash-accent)] bg-[var(--dash-panel)]" />
                        </div>
                      </div>
                    )}

                  <div className="group relative">
                    <button
                      type="button"
                      onClick={() => removeItem(globalIdx)}
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)] text-[var(--dash-danger-text)] transition-colors hover:bg-[var(--dash-danger-hover)]"
                    >
                      <X className="h-4 w-4" />
                    </button>

                    <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)] px-3 py-2 text-xs text-[var(--dash-danger-text)] shadow-xl group-hover:block">
                      Elimina oggetto
                      <div className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 rotate-45 border-r border-b border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)]" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  const allowedNewLocations = getAllowedLocations(newItem);

  return (
    <div className="rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Backpack className="h-5 w-5 text-[var(--dash-accent-2)]" />
          <h3 className="font-medium text-[var(--dash-text)]">Equipaggiamento</h3>
        </div>

        <button
          type="button"
          onClick={() => setShowAdd(!showAdd)}
          className="rounded border border-[var(--dash-border)] bg-[var(--dash-input)] p-1.5 transition-colors hover:bg-[var(--dash-surface-2)]"
        >
          <Plus className="h-4 w-4 text-[var(--dash-text)]" />
        </button>
      </div>

      <label className="mb-4 flex items-center gap-3 text-sm text-[var(--dash-text)]">
        <input
          type="checkbox"
          checked={hasZaino}
          onChange={toggleZaino}
          className="h-4 w-4 accent-[var(--dash-accent)]"
        />
        Il personaggio ha uno zaino
      </label>

      <div className="mb-3 text-xs text-[var(--dash-muted)]">
        {hasZaino
          ? 'Gli oggetti trasportabili possono essere addosso o nello zaino.'
          : 'Senza zaino, gli oggetti trasportabili possono essere solo addosso o a casa.'}
      </div>

      <div className="space-y-3">
        <div>
          <div className="mb-1.5 text-xs font-medium text-[var(--dash-muted)]">
            Tascabili in tasca ({counts.tascabiliInTasca.length}/{MAX_TASCABILI_IN_TASCA})
          </div>
          {renderItems(counts.tascabiliInTasca, true)}
        </div>

        <div>
          <div className="mb-1.5 text-xs font-medium text-[var(--dash-muted)]">
            Trasportabili attivi ({counts.trasportabiliAttivi.length}/{MAX_TRASPORTABILI_ATTIVI})
          </div>
          {renderItems(counts.trasportabiliAttivi, true)}
        </div>

        <div>
          <div className="mb-1.5 text-xs font-medium text-[var(--dash-muted)]">
            Oggetti a casa
          </div>
          {renderItems(counts.oggettiACasa, true)}
        </div>

        <div>
          <div className="mb-1.5 text-xs font-medium text-[var(--dash-muted)]">
            Risorse a casa
          </div>
          {renderItems(counts.risorseACasa, true)}
        </div>

        <div>
          <div className="mb-1.5 text-xs font-medium text-[var(--dash-muted)]">
            Veicoli a casa
          </div>
          {renderItems(counts.veicoliACasa, true)}
        </div>

        <div>
          <div className="mb-1.5 text-xs font-medium text-[var(--dash-muted)]">
            Veicoli in uso
          </div>
          {renderItems(counts.veicoliDisponibili, true)}
        </div>
      </div>

      {showAdd && (
        <div className="mt-3 space-y-2 border-t border-[var(--dash-border)] pt-3">
          <div>
            <label className="mb-1 block text-xs text-[var(--dash-muted)]">Tipo</label>
            <select
              value={newItem.type}
              onChange={e => {
                const type = e.target.value as EquipmentType;
                const nextItem: Partial<Equipment> = {
                  ...newItem,
                  name: '',
                  type,
                  isVehicle: type === 'risorsa' ? newItem.isVehicle : false,
                  inseparabile:
                    type === 'trasportabile' || type === 'arma'
                      ? newItem.inseparabile
                      : false
                };

                setNewItem({
                  ...nextItem,
                  location: getDefaultLocationForItem(nextItem)
                });
              }}
              className="w-full rounded border border-[var(--dash-border)] bg-[var(--dash-input)] px-2 py-1 text-sm text-[var(--dash-text)]"
            >
              <option value="tascabile">Tascabile</option>
              <option value="trasportabile">Trasportabile</option>
              <option value="risorsa">Risorsa</option>
              <option value="arma">Arma</option>
            </select>

            <div className="mt-1 text-[11px] text-[var(--dash-muted)]">
              {newItem.type === 'tascabile' && 'Può stare solo in tasca o a casa.'}
              {newItem.type === 'trasportabile' &&
                (hasZaino
                  ? 'Può stare addosso, nello zaino o a casa.'
                  : 'Può stare addosso o a casa. Senza zaino non può stare nello zaino.')}
              {newItem.type === 'arma' &&
                (hasZaino
                  ? 'Viene gestita come un trasportabile: addosso, nello zaino o a casa.'
                  : 'Viene gestita come un trasportabile: addosso o a casa.')}
              {newItem.type === 'risorsa' &&
                'Le risorse stanno a casa. I veicoli possono anche essere disponibili.'}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--dash-muted)]">Nome oggetto</label>
            <select
              value={newItem.name}
              onChange={e => {
                const selectedName = e.target.value;

                const isVehicle =
                  newItem.type === 'risorsa' &&
                  RISORSE_VEICOLI.includes(selectedName);

                const nextItem: Partial<Equipment> = {
                  ...newItem,
                  name: selectedName,
                  isVehicle
                };

                const allowedLocations = getAllowedLocations(nextItem);
                const nextLocation = allowedLocations.includes(
                  newItem.location as AllowedLocation
                )
                  ? (newItem.location as EquipmentLocation)
                  : getDefaultLocationForItem(nextItem);

                setNewItem({
                  ...nextItem,
                  location: nextLocation
                });
              }}
              className="w-full rounded border border-[var(--dash-border)] bg-[var(--dash-input)] px-2 py-1 text-sm text-[var(--dash-text)]"
            >
              <option value="">Seleziona un oggetto</option>
              {getAvailableNamesByType(newItem.type).map(itemName => (
                <option key={itemName} value={itemName}>
                  {itemName}
                </option>
              ))}
            </select>
          </div>

          {(newItem.type === 'trasportabile' || newItem.type === 'arma') && (
            <label className="flex items-center gap-2 text-sm text-[var(--dash-text)]">
              <input
                type="checkbox"
                checked={!!newItem.inseparabile}
                disabled={counts.inseparabileGiaPresente}
                onChange={e => {
                  const nextItem: Partial<Equipment> = {
                    ...newItem,
                    inseparabile: e.target.checked
                  };

                  setNewItem({
                    ...nextItem,
                    location: getDefaultLocationForItem(nextItem)
                  });
                }}
                className="h-4 w-4 accent-[var(--dash-accent)]"
              />
              Oggetto inseparabile
            </label>
          )}

          <div>
            <label className="mb-1 block text-xs text-[var(--dash-muted)]">Dove si trova</label>
            <select
              value={newItem.location}
              onChange={e =>
                setNewItem({
                  ...newItem,
                  location: e.target.value as EquipmentLocation
                })
              }
              className="w-full rounded border border-[var(--dash-border)] bg-[var(--dash-input)] px-2 py-1 text-sm text-[var(--dash-text)]"
            >
              {allowedNewLocations.map(location => (
                <option key={location} value={location}>
                  {getLocationLabel(location)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--dash-muted)]">Descrizione</label>
            <textarea
              value={newItem.description}
              onChange={e =>
                setNewItem({ ...newItem, description: e.target.value })
              }
              placeholder="Opzionale"
              rows={2}
              className="w-full resize-none rounded border border-[var(--dash-border)] bg-[var(--dash-input)] px-2 py-1 text-sm text-[var(--dash-text)] placeholder-[var(--dash-muted)]"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setShowAdd(false);
                setNewItem(INITIAL_NEW_ITEM);
              }}
              className="flex-1 rounded border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-1.5 text-sm text-[var(--dash-muted)] transition-colors hover:bg-[var(--dash-surface-2)]"
            >
              Annulla
            </button>
            <button
              type="button"
              onClick={addItem}
              disabled={!canAddItem()}
              className="flex-1 rounded border border-[var(--dash-border)] bg-[var(--dash-border)] px-3 py-1.5 text-sm text-[var(--dash-text)] transition-colors hover:bg-[var(--dash-border)] disabled:opacity-40"
            >
              Aggiungi
            </button>
          </div>
        </div>
      )}
    </div>
  );
}