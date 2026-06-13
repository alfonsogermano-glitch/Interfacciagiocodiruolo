import { useEffect, useMemo, useState } from 'react';
import { Package, Search, Plus, X } from 'lucide-react';

import {
  getAllowedLocationsForItem,
  getEquipmentTypeLabel,
  getLocationLabel,
  validateNewEquipmentItem
} from '../../../lib/rules/equipmentRules';
import type { EquipmentLike } from '../../../lib/rules/equipmentRules';

import type {
  AddCharacterEquipmentFromCatalogInput,
  AddCustomCharacterEquipmentInput,
  EquipmentCatalogItem,
  EquipmentLocation,
  EquipmentType
} from '../../../types/equipment';

type AddEquipmentMode = 'catalog' | 'custom';

interface AddEquipmentModalProps {
  isOpen: boolean;
  onClose: () => void;

  hasZaino: boolean;

  catalogItems: EquipmentCatalogItem[];
  isLoadingCatalog?: boolean;

  currentEquipment?: EquipmentLike[];

  onAddFromCatalog: (
    input: Omit<AddCharacterEquipmentFromCatalogInput, 'characterId'>
  ) => Promise<unknown> | unknown;

  onAddCustom: (
    input: Omit<AddCustomCharacterEquipmentInput, 'characterId'>
  ) => Promise<unknown> | unknown;
}

const EQUIPMENT_TYPE_OPTIONS: Array<{
  value: EquipmentType;
  label: string;
}> = [
  { value: 'tascabile', label: 'Tascabile' },
  { value: 'trasportabile', label: 'Trasportabile' },
  { value: 'risorsa', label: 'Risorsa' },
  { value: 'arma', label: 'Arma' }
];

export function AddEquipmentModal({
  isOpen,
  onClose,
  hasZaino,
  catalogItems,
  isLoadingCatalog = false,
  currentEquipment = [],
  onAddFromCatalog,
  onAddCustom
}: AddEquipmentModalProps) {
  const [mode, setMode] = useState<AddEquipmentMode>('catalog');

  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogTypeFilter, setCatalogTypeFilter] = useState<
    EquipmentType | 'all'
  >('all');
  const [selectedCatalogItemId, setSelectedCatalogItemId] = useState<
    string | null
  >(null);
  const [catalogLocation, setCatalogLocation] =
    useState<EquipmentLocation>('in_tasca');
  const [catalogInseparabile, setCatalogInseparabile] = useState(false);
  const [catalogOverrideDescription, setCatalogOverrideDescription] =
    useState('');
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [customName, setCustomName] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [customType, setCustomType] = useState<EquipmentType>('tascabile');
  const [customIsVehicle, setCustomIsVehicle] = useState(false);
  const [customLocation, setCustomLocation] =
    useState<EquipmentLocation>('in_tasca');
  const [customInseparabile, setCustomInseparabile] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);

  const selectedCatalogItem = useMemo(
    () => catalogItems.find(item => item.id === selectedCatalogItemId) ?? null,
    [catalogItems, selectedCatalogItemId]
  );

  const effectiveEquipment = useMemo(() => {
    return currentEquipment;
  }, [currentEquipment]);

  const filteredCatalogItems = useMemo(() => {
    const search = catalogSearch.trim().toLowerCase();

    return catalogItems.filter(item => {
      const matchesType =
        catalogTypeFilter === 'all' ? true : item.type === catalogTypeFilter;

      const matchesSearch =
        search.length === 0
          ? true
          : item.name.toLowerCase().includes(search) ||
            item.description.toLowerCase().includes(search) ||
            item.tags.some(tag => tag.toLowerCase().includes(search));

      return item.isActive && matchesType && matchesSearch;
    });
  }, [catalogItems, catalogSearch, catalogTypeFilter]);

  const allowedCatalogLocations = useMemo(() => {
    if (!selectedCatalogItem) {
      return ['in_tasca', 'a_casa'] as EquipmentLocation[];
    }

    return getAllowedLocationsForItem(
      {
        name: selectedCatalogItem.name,
        type: selectedCatalogItem.type,
        isVehicle: selectedCatalogItem.isVehicle
      },
      effectiveEquipment
    );
  }, [selectedCatalogItem, effectiveEquipment, hasZaino]);

  const allowedCustomLocations = useMemo(() => {
    return getAllowedLocationsForItem(
      {
        name: customName,
        type: customType,
        isVehicle: customIsVehicle
      },
      effectiveEquipment
    );
  }, [customName, customType, customIsVehicle, effectiveEquipment, hasZaino]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setMode('catalog');
    setCatalogSearch('');
    setCatalogTypeFilter('all');
    setSelectedCatalogItemId(null);
    setCatalogLocation('in_tasca');
    setCatalogInseparabile(false);
    setCatalogOverrideDescription('');
    setCatalogError(null);

    setCustomName('');
    setCustomDescription('');
    setCustomType('tascabile');
    setCustomIsVehicle(false);
    setCustomLocation('in_tasca');
    setCustomInseparabile(false);
    setCustomError(null);
  }, [isOpen]);

  useEffect(() => {
    if (!selectedCatalogItem) {
      return;
    }

    const nextAllowed = getAllowedLocationsForItem(
      {
        name: selectedCatalogItem.name,
        type: selectedCatalogItem.type,
        isVehicle: selectedCatalogItem.isVehicle
      },
      effectiveEquipment
    );

    if (!nextAllowed.includes(catalogLocation)) {
      setCatalogLocation(nextAllowed[0]);
    }

    if (
      selectedCatalogItem.type !== 'trasportabile' &&
      selectedCatalogItem.type !== 'arma'
    ) {
      setCatalogInseparabile(false);
    }

    setCatalogError(null);
  }, [selectedCatalogItem, catalogLocation, effectiveEquipment]);

  useEffect(() => {
    const nextAllowed = getAllowedLocationsForItem(
      {
        name: customName,
        type: customType,
        isVehicle: customIsVehicle
      },
      effectiveEquipment
    );

    if (!nextAllowed.includes(customLocation)) {
      setCustomLocation(nextAllowed[0]);
    }

    if (customType !== 'trasportabile' && customType !== 'arma') {
      setCustomInseparabile(false);
    }

    if (customType !== 'risorsa') {
      setCustomIsVehicle(false);
    }

    setCustomError(null);
  }, [
    customName,
    customType,
    customIsVehicle,
    customLocation,
    effectiveEquipment
  ]);

  if (!isOpen) {
    return null;
  }

  const catalogValidation = selectedCatalogItem
    ? validateNewEquipmentItem(
        {
          name: selectedCatalogItem.name,
          type: selectedCatalogItem.type,
          description: catalogOverrideDescription.trim() || selectedCatalogItem.description,
          location: catalogLocation,
          inseparabile: catalogInseparabile,
          isVehicle: selectedCatalogItem.isVehicle
        },
        effectiveEquipment
      )
    : { valid: false, reason: 'Seleziona un oggetto dal catalogo.' };

  const customValidation = validateNewEquipmentItem(
    {
      name: customName.trim(),
      type: customType,
      description: customDescription.trim(),
      location: customLocation,
      inseparabile: customInseparabile,
      isVehicle: customType === 'risorsa' ? customIsVehicle : false
    },
    effectiveEquipment
  );

  const canSubmitCatalog = !!selectedCatalogItem && catalogValidation.valid;
  const canSubmitCustom = customValidation.valid;

  const handleSubmitCatalog = async () => {
    if (!selectedCatalogItem) {
      setCatalogError('Seleziona un oggetto dal catalogo.');
      return;
    }

    if (!catalogValidation.valid) {
      setCatalogError(catalogValidation.reason ?? 'Oggetto non valido.');
      return;
    }

    setCatalogError(null);

  await onAddFromCatalog({
  catalogItemId: selectedCatalogItem.id,
  location: catalogLocation,
  inseparabile: catalogInseparabile,
  overrideDescription: catalogOverrideDescription.trim() || undefined
});

    onClose();
  };

  const handleSubmitCustom = async () => {
    if (!customValidation.valid) {
      setCustomError(customValidation.reason ?? 'Oggetto non valido.');
      return;
    }

    setCustomError(null);

    await onAddCustom({
  name: customName.trim(),
  description: customDescription.trim(),
  type: customType,
  isVehicle: customType === 'risorsa' ? customIsVehicle : false,
  location: customLocation,
  inseparabile: customInseparabile
});

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[var(--dash-border)] bg-[var(--dash-surface)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--dash-border)] px-4 py-3">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-[#8b6e4e]" />
            <h2 className="text-base font-semibold text-[var(--dash-text)]">
              Aggiungi oggetto
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[var(--dash-border)] bg-[var(--dash-input)] p-2 text-[var(--dash-text)] transition-colors hover:bg-[#3a0e0e]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-[var(--dash-border)] px-4 pt-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode('catalog')}
              className={`rounded-t-lg border px-4 py-2 text-sm transition-colors ${
                mode === 'catalog'
                  ? 'border-[var(--dash-border)] bg-[var(--dash-border)] text-[var(--dash-text-strong)]'
                  : 'border-[var(--dash-border)] bg-[#221010] text-[#bfa98c]'
              }`}
            >
              Da catalogo
            </button>

            <button
              type="button"
              onClick={() => setMode('custom')}
              className={`rounded-t-lg border px-4 py-2 text-sm transition-colors ${
                mode === 'custom'
                  ? 'border-[var(--dash-border)] bg-[var(--dash-border)] text-[var(--dash-text-strong)]'
                  : 'border-[var(--dash-border)] bg-[#221010] text-[#bfa98c]'
              }`}
            >
              Personalizzato
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {mode === 'catalog' ? (
            <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="min-h-0 rounded-xl border border-[var(--dash-border)] bg-[#221010] p-3">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--dash-muted)]" />
                    <input
                      type="text"
                      value={catalogSearch}
                      onChange={e => setCatalogSearch(e.target.value)}
                      placeholder="Cerca oggetto..."
                      className="w-full rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface)] py-2 pl-9 pr-3 text-sm text-[var(--dash-text)] placeholder-[var(--dash-muted)]"
                    />
                  </div>

                  <select
                    value={catalogTypeFilter}
                    onChange={e =>
                      setCatalogTypeFilter(
                        e.target.value as EquipmentType | 'all'
                      )
                    }
                    className="rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface)] px-3 py-2 text-sm text-[var(--dash-text)]"
                  >
                    <option value="all">Tutti i tipi</option>
                    {EQUIPMENT_TYPE_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="max-h-[50vh] space-y-2 overflow-auto pr-1">
                  {isLoadingCatalog ? (
                    <div className="rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface)] px-3 py-4 text-sm text-[#bfa98c]">
                      Caricamento catalogo...
                    </div>
                  ) : filteredCatalogItems.length === 0 ? (
                    <div className="rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface)] px-3 py-4 text-sm text-[#bfa98c]">
                      Nessun oggetto trovato.
                    </div>
                  ) : (
                    filteredCatalogItems.map(item => {
                      const isSelected = item.id === selectedCatalogItemId;

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setSelectedCatalogItemId(item.id);
                            setCatalogOverrideDescription(item.description);
                            setCatalogError(null);
                          }}
                          className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                            isSelected
                              ? 'border-[var(--dash-accent)] bg-[#3a1712]'
                              : 'border-[var(--dash-border)] bg-[var(--dash-surface)] hover:bg-[var(--dash-danger-bg)]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium text-[var(--dash-text)]">
                                {item.name}
                              </div>
                              <div className="mt-1 line-clamp-2 text-xs text-[var(--dash-muted)]">
                                {item.description || 'Nessuna descrizione'}
                              </div>
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                <span className="rounded-full border border-[#5a4030] bg-[#221714] px-2 py-0.5 text-[11px] text-[#cdb79a]">
                                  {getEquipmentTypeLabel(item.type)}
                                </span>

                                {item.isVehicle && (
                                  <span className="rounded-full border border-[#5f4a2b] bg-[#2c2217] px-2 py-0.5 text-[11px] text-[#e5cfaa]">
                                    Veicolo
                                  </span>
                                )}

                                {item.isClue && (
                                  <span className="rounded-full border border-[#6a452f] bg-[#3a2219] px-2 py-0.5 text-[11px] text-[#f3d4b4]">
                                    Indizio
                                  </span>
                                )}

                                {item.isStoryItem && (
                                  <span className="rounded-full border border-[var(--dash-danger-border)] bg-[#341818] px-2 py-0.5 text-[11px] text-[#f0cccc]">
                                    Trama
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-[var(--dash-border)] bg-[#221010] p-3">
                <div className="mb-3 text-sm font-medium text-[var(--dash-text)]">
                  Configurazione
                </div>

                {!selectedCatalogItem ? (
                  <div className="rounded-lg border border-dashed border-[var(--dash-border)] px-3 py-6 text-sm text-[var(--dash-muted)]">
                    Seleziona un oggetto dal catalogo per configurarlo.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-xs text-[var(--dash-muted)]">
                        Nome
                      </label>
                      <input
                        type="text"
                        value={selectedCatalogItem.name}
                        readOnly
                        className="w-full rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface)] px-3 py-2 text-sm text-[var(--dash-text)] opacity-90"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs text-[var(--dash-muted)]">
                        Tipo
                      </label>
                      <input
                        type="text"
                        value={getEquipmentTypeLabel(selectedCatalogItem.type)}
                        readOnly
                        className="w-full rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface)] px-3 py-2 text-sm text-[var(--dash-text)] opacity-90"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs text-[var(--dash-muted)]">
                        Descrizione dell'istanza
                      </label>
                      <textarea
                        value={catalogOverrideDescription}
                        onChange={e => {
                          setCatalogOverrideDescription(e.target.value);
                          setCatalogError(null);
                        }}
                        rows={4}
                        className="w-full resize-none rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface)] px-3 py-2 text-sm text-[var(--dash-text)] placeholder-[var(--dash-muted)]"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs text-[var(--dash-muted)]">
                        Dove si trova
                      </label>
                      <select
                        value={catalogLocation}
                        onChange={e => {
                          setCatalogLocation(e.target.value as EquipmentLocation);
                          setCatalogError(null);
                        }}
                        className="w-full rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface)] px-3 py-2 text-sm text-[var(--dash-text)]"
                      >
                        {allowedCatalogLocations.map(location => (
                          <option key={location} value={location}>
                            {getLocationLabel(location)}
                          </option>
                        ))}
                      </select>
                    </div>

                    {(selectedCatalogItem.type === 'trasportabile' ||
                      selectedCatalogItem.type === 'arma') && (
                      <label className="flex items-center gap-2 text-sm text-[var(--dash-text)]">
                        <input
                          type="checkbox"
                          checked={catalogInseparabile}
                          onChange={e => {
                            setCatalogInseparabile(e.target.checked);
                            setCatalogError(null);
                          }}
                          className="h-4 w-4 accent-[var(--dash-accent)]"
                        />
                        Oggetto inseparabile
                      </label>
                    )}

                    {catalogError && (
                      <div className="rounded-lg border border-[var(--dash-danger-border)] bg-[#2a1111] px-3 py-2 text-sm text-[#f0cccc]">
                        {catalogError}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-2xl rounded-xl border border-[var(--dash-border)] bg-[#221010] p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs text-[var(--dash-muted)]">
                    Nome oggetto
                  </label>
                  <input
                    type="text"
                    value={customName}
                    onChange={e => {
                      setCustomName(e.target.value);
                      setCustomError(null);
                    }}
                    placeholder="Es. Walkman con nastro graffiato"
                    className="w-full rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface)] px-3 py-2 text-sm text-[var(--dash-text)] placeholder-[var(--dash-muted)]"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs text-[var(--dash-muted)]">
                    Descrizione
                  </label>
                  <textarea
                    value={customDescription}
                    onChange={e => {
                      setCustomDescription(e.target.value);
                      setCustomError(null);
                    }}
                    rows={4}
                    placeholder="Descrivi l'oggetto..."
                    className="w-full resize-none rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface)] px-3 py-2 text-sm text-[var(--dash-text)] placeholder-[var(--dash-muted)]"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-[var(--dash-muted)]">
                    Tipo
                  </label>
                  <select
                    value={customType}
                    onChange={e => {
                      setCustomType(e.target.value as EquipmentType);
                      setCustomError(null);
                    }}
                    className="w-full rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface)] px-3 py-2 text-sm text-[var(--dash-text)]"
                  >
                    {EQUIPMENT_TYPE_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-[var(--dash-muted)]">
                    Dove si trova
                  </label>
                  <select
                    value={customLocation}
                    onChange={e => {
                      setCustomLocation(e.target.value as EquipmentLocation);
                      setCustomError(null);
                    }}
                    className="w-full rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface)] px-3 py-2 text-sm text-[var(--dash-text)]"
                  >
                    {allowedCustomLocations.map(location => (
                      <option key={location} value={location}>
                        {getLocationLabel(location)}
                      </option>
                    ))}
                  </select>
                </div>

                {customType === 'risorsa' && (
                  <label className="md:col-span-2 flex items-center gap-2 text-sm text-[var(--dash-text)]">
                    <input
                      type="checkbox"
                      checked={customIsVehicle}
                      onChange={e => {
                        setCustomIsVehicle(e.target.checked);
                        setCustomError(null);
                      }}
                      className="h-4 w-4 accent-[var(--dash-accent)]"
                    />
                    È un veicolo
                  </label>
                )}

                {(customType === 'trasportabile' || customType === 'arma') && (
                  <label className="md:col-span-2 flex items-center gap-2 text-sm text-[var(--dash-text)]">
                    <input
                      type="checkbox"
                      checked={customInseparabile}
                      onChange={e => {
                        setCustomInseparabile(e.target.checked);
                        setCustomError(null);
                      }}
                      className="h-4 w-4 accent-[var(--dash-accent)]"
                    />
                    Oggetto inseparabile
                  </label>
                )}

                {customError && (
                  <div className="md:col-span-2 rounded-lg border border-[var(--dash-danger-border)] bg-[#2a1111] px-3 py-2 text-sm text-[#f0cccc]">
                    {customError}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[var(--dash-border)] px-4 py-3">
          <div className="text-xs text-[var(--dash-muted)]">
            {mode === 'catalog'
              ? 'Scegli un oggetto del catalogo e configurane l’istanza.'
              : 'Crea un oggetto valido solo per questo personaggio.'}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] px-4 py-2 text-sm text-[#bfa98c] transition-colors hover:bg-[#3a0e0e]"
            >
              Annulla
            </button>

            <button
              type="button"
              onClick={
                mode === 'catalog' ? handleSubmitCatalog : handleSubmitCustom
              }
              disabled={mode === 'catalog' ? !canSubmitCatalog : !canSubmitCustom}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-border)] px-4 py-2 text-sm text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-border)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
              Aggiungi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}