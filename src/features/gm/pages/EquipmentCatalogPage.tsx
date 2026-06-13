import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRuleset } from '../../../app/campaigns/RulesetContext';
import { RulesetBadge } from '../../../app/campaigns/RulesetGate';
import { Plus, Search, Archive, RotateCcw, Trash2, Edit2, X, Ghost, Swords, Bookmark } from 'lucide-react';
import { Icon } from '@iconify/react';
import { CatalogItemEditorModal } from '../components/CatalogItemEditorModal';
import {
  loadEntityReferenceBundle,
  type EntityReference
} from '../../../services/campaign/entityReferenceService';
import { useEquipmentCatalog } from '../../equipment/hooks/useEquipmentCatalog';
import {
  archiveCatalogItem,
  createCatalogItem,
  deleteCatalogItem,
  restoreCatalogItem,
  updateCatalogItem
} from '../../../services/equipment/equipmentCatalogService';

import {
  visualAssetsStorage,
  type VisualAsset
} from '../../../services/storage/visualAssetsStorage';

import type {
  CreateCatalogItemInput,
  EquipmentCatalogItem,
  UpdateCatalogItemInput
} from '../../../types/equipment';

type EditorMode = 'create' | 'edit';
type ScopeMode = 'global' | 'campaign';

type LinkOption = EntityReference;

async function loadLinkedEntityOptions(
  campaignId?: string
): Promise<{
  environments: LinkOption[];
  npcs: LinkOption[];
  monsters: LinkOption[];
}> {
  const references = await loadEntityReferenceBundle(
    campaignId ?? ''
  );

  return {
    environments: references.environments,
    npcs: references.npcs,
    monsters: references.monsters
  };
}

type FilterType = 'all' | 'tascabile' | 'trasportabile' | 'risorsa' | 'arma';
type FilterStatus = 'active' | 'archived' | 'all';
type FilterNarrative = 'all' | 'clue' | 'story';
type FilterScope = 'all' | 'global' | 'campaign';

interface EquipmentCatalogPageProps {
  campaignId?: string;
  storageRefreshKey?: number;
  onNavigate?: (target: {
    tabId: string;
    entityId?: string;
    entityType?: string;
  }) => void;
}

export function EquipmentCatalogPage({
  campaignId,
  storageRefreshKey = 0,
  onNavigate
}: EquipmentCatalogPageProps) {
  const { isHSC, isDnD5e, isPathfinder, ruleset } = useRuleset();
  const isD20 = isDnD5e || isPathfinder;
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<FilterType>('all');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('active');
  const [narrativeFilter, setNarrativeFilter] =
    useState<FilterNarrative>('all');
  const [scopeFilter, setScopeFilter] = useState<FilterScope>('all');
  const [showStandardItems, setShowStandardItems] = useState(false);
  const [letterFilter, setLetterFilter] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>('create');
  const [editingItem, setEditingItem] = useState<EquipmentCatalogItem | null>(
    null
  );
  const [isSaving, setIsSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<EquipmentCatalogItem | null>(null);
  const [visualAssets, setVisualAssets] = useState<VisualAsset[]>([]);
  const [previewImageAsset, setPreviewImageAsset] = useState<VisualAsset | null>(null);
  const [environmentOptions, setEnvironmentOptions] = useState<LinkOption[]>([]);
  const [npcOptions, setNpcOptions] = useState<LinkOption[]>([]);
  const [monsterOptions, setMonsterOptions] = useState<LinkOption[]>([]);

  const {
    items,
    isLoading,
    error,
    refresh
  } = useEquipmentCatalog({
  campaignId,
  managementMode: true,
  enabled: true,
  storageRefreshKey
});

const loadItemImageAssets = () => {
  visualAssetsStorage
    .getAll()
    .then(assets => {
      setVisualAssets(
        assets.filter(asset =>
          asset.type === 'item-image' &&
          asset.imageDataUrl &&
          (!campaignId || asset.campaignId === campaignId)
        )
      );
    })
    .catch(error => {
      console.error('Errore caricamento immagini oggetto:', error);
      setVisualAssets([]);
    });
};

useEffect(() => {
  loadItemImageAssets();
}, [campaignId, storageRefreshKey]);

useEffect(() => {
  let cancelled = false;

  setEnvironmentOptions([]);
  setNpcOptions([]);
  setMonsterOptions([]);

  loadLinkedEntityOptions(campaignId)
    .then(options => {
      if (cancelled) return;

      setEnvironmentOptions(options.environments);
      setNpcOptions(options.npcs);
      setMonsterOptions(options.monsters);
    })
    .catch(error => {
      console.error('Errore caricamento collegamenti archivio oggetti:', error);
    });

  return () => {
    cancelled = true;
  };
}, [campaignId, storageRefreshKey]);

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

const normalizeInitial = (value: string) =>
  value.trim().charAt(0).toUpperCase();

  const isStandardItem = (item: EquipmentCatalogItem) => item.source === 'base';
  const filteredItems = useMemo(() => {
  const normalizedSearch = search.trim().toLowerCase();

  return items.filter(item => {
    const matchesLetter =
  !letterFilter || normalizeInitial(item.name) === letterFilter;
      const matchesSearch =
        normalizedSearch.length === 0
          ? true
          : item.name.toLowerCase().includes(normalizedSearch) ||
            item.description.toLowerCase().includes(normalizedSearch) ||
            item.tags.some(tag => tag.toLowerCase().includes(normalizedSearch));

      const matchesType =
        typeFilter === 'all' || item.type === typeFilter;

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && item.isActive) ||
        (statusFilter === 'archived' && !item.isActive);

      const matchesNarrative =
        narrativeFilter === 'all' ||
        (narrativeFilter === 'clue' && item.isClue) ||
        (narrativeFilter === 'story' && item.isStoryItem);

      const matchesScope =
        isStandardItem(item) ||
        scopeFilter === 'all' ||
        (scopeFilter === 'global' && item.campaignId === null) ||
        (scopeFilter === 'campaign' && item.campaignId === campaignId);

      return (
        matchesSearch &&
        matchesLetter &&
        matchesType &&
        matchesStatus &&
        matchesNarrative &&
        matchesScope
      );
    });
  }, [
    items,
    search,
    typeFilter,
    statusFilter,
    narrativeFilter,
    scopeFilter,
    letterFilter
  ]);

  const openCreateEditor = () => {
    setActionError(null);
    setEditingItem(null);
    setEditorMode('create');
    setEditorOpen(true);
  };

  const standardItems = filteredItems.filter(isStandardItem);
  const customItems = filteredItems.filter(item => !isStandardItem(item));
  
  const openEditEditor = (item: EquipmentCatalogItem) => {
    setActionError(null);
    setEditingItem(item);
    setEditorMode('edit');
    setEditorOpen(true);
  };

  const closeEditor = () => {
    if (isSaving) {
      return;
    }

    setEditorOpen(false);
    setEditingItem(null);
  };

  const handleSubmitEditor = async (
    input: CreateCatalogItemInput | UpdateCatalogItemInput,
    _meta: { scope: ScopeMode }
  ) => {
    setIsSaving(true);
    setActionError(null);

    try {
      if (editorMode === 'create') {
        await createCatalogItem(input as CreateCatalogItemInput);
      } else {
        if (!editingItem) {
          throw new Error('Oggetto da modificare non trovato.');
        }

        await updateCatalogItem(
          editingItem.id,
          input as UpdateCatalogItemInput,
          campaignId
        );
      }

      await refresh();
      loadItemImageAssets();
      setEditorOpen(false);
      setEditingItem(null);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Errore durante il salvataggio dell’oggetto.';
      setActionError(message);
      } finally {
      setIsSaving(false);
    }
  };

  const handleArchive = async (item: EquipmentCatalogItem) => {
    setActionError(null);

    try {
      await archiveCatalogItem(item.id, campaignId);
      await refresh();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Errore durante l’archiviazione.';
      setActionError(message);
    }
  };

  const handleRestore = async (item: EquipmentCatalogItem) => {
    setActionError(null);

    try {
      await restoreCatalogItem(item.id, campaignId);
      await refresh();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Errore durante il ripristino.';
      setActionError(message);
    }
  };

  const handleDelete = async (item: EquipmentCatalogItem) => {
  setActionError(null);

  try {
    await deleteCatalogItem(item.id, campaignId);
    await refresh();
    setItemToDelete(null);
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : 'Errore durante l’eliminazione.';
    setActionError(message);
  }
};

  const getRarityLabel = (rarity: string) => {
  switch (rarity) {
    case 'common':
      return 'Comune';
    case 'rare':
      return 'Raro';
    case 'unique':
      return 'Unico';
    case 'story':
      return 'Storia';
    default:
      return rarity;
  }
};

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'tascabile':
        return 'Tascabile';
      case 'trasportabile':
        return 'Trasportabile';
      case 'risorsa':
        return 'Risorsa';
      case 'arma':
        return 'Arma';
      default:
        return type;
    }
  };

  const getItemImageAsset = (item: EquipmentCatalogItem) => {
  if (!item.imageAssetId) return null;

  return visualAssets.find(asset => asset.id === item.imageAssetId) ?? null;
};

  const handleLinkedEntityNavigate = (target: {
    tabId: string;
    entityId?: string;
    entityType?: string;
  }) => {
    if (onNavigate) {
      onNavigate(target);
      return;
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('hsc-dashboard-navigate', {
          detail: target
        })
      );

      window.dispatchEvent(
        new CustomEvent('dashboard:navigate', {
          detail: target
        })
      );
    }
  };

  const getCatalogItemName = (id: string | null | undefined) => {
    if (!id) return null;
    return items.find(item => item.id === id)?.name ?? null;
  };

  const findLinkName = (options: LinkOption[], id: string) => {
    return options.find(option => option.id === id)?.name ?? 'Elemento non trovato';
  };

  return (
    <div className="min-h-screen bg-[var(--dash-bg)] text-[var(--dash-text)]">
      <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        {isD20 && (
          <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-4 py-3 text-sm text-[var(--dash-muted)]">
            <span className="mr-2 font-medium text-[var(--dash-text)]">
              Modalità {isDnD5e ? 'D&D 5e' : 'Pathfinder 2e'}:
            </span>
            I tipi oggetto HSC (tascabile/trasportabile/risorsa/arma) sono mantenuti come base. Usa il campo <em>note</em> per aggiungere peso, costo in {isDnD5e ? 'PO' : 'mo'}, proprietà arma o bonus CA.
          </div>
        )}
        <div className="flex items-center justify-between border-b border-[var(--dash-border)] pb-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-semibold uppercase tracking-[0.08em]">
                Archivio Oggetti
              </h2>
              <RulesetBadge />
            </div>
            <p className="mt-1 text-sm text-[var(--dash-muted)]">
              Gestione completa del catalogo oggetti
            </p>
          </div>

          <button
            type="button"
            onClick={openCreateEditor}
            className="group flex items-center gap-2 rounded-lg border-2 border-[var(--dash-border)] bg-[var(--dash-border)] px-3 py-2 text-[var(--dash-text)] transition-colors hover:bg-[var(--dash-border)]"
          >
            <Plus className="h-4 w-4 group-hover:animate-[plusPulse_0.75s_ease-in-out_infinite]" />
            Nuovo
          </button>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-3 py-2">
            <Search className="h-4 w-4 text-[var(--dash-muted)]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cerca per nome, descrizione o tag..."
              className="bg-transparent text-sm text-[var(--dash-text)] outline-none placeholder-[var(--dash-muted)]"
            />
          </div>

          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as FilterType)}
            className="rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-input)] px-3 py-2 text-sm text-[var(--dash-text)]"
          >
            <option value="all">Tutti i tipi</option>
            <option value="tascabile">Tascabile</option>
            <option value="trasportabile">Trasportabile</option>
            <option value="risorsa">Risorsa</option>
            <option value="arma">Arma</option>
          </select>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as FilterStatus)}
            className="rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-input)] px-3 py-2 text-sm text-[var(--dash-text)]"
          >
            <option value="active">Attivi</option>
            <option value="archived">Archiviati</option>
            <option value="all">Tutti</option>
          </select>

          <select
            value={narrativeFilter}
            onChange={e => setNarrativeFilter(e.target.value as FilterNarrative)}
            className="rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-input)] px-3 py-2 text-sm text-[var(--dash-text)]"
          >
            <option value="all">Tutti</option>
            <option value="clue">Solo indizi</option>
            <option value="story">Solo trama</option>
          </select>

          <select
            value={scopeFilter}
            onChange={e => setScopeFilter(e.target.value as FilterScope)}
            className="rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-input)] px-3 py-2 text-sm text-[var(--dash-text)]"
          >
            <option value="all">Tutti gli ambiti</option>
            <option value="global">Solo globali</option>
            <option value="campaign">Solo campagna</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-1">
  <button
    type="button"
    onClick={() => setLetterFilter(null)}
    className={`rounded border px-2 py-1 text-xs ${
      letterFilter === null
        ? 'border-[var(--dash-accent)] bg-[var(--dash-accent)] text-[var(--dash-text-strong)]'
        : 'border-[var(--dash-border)] text-[var(--dash-muted)]'
    }`}
  >
    Tutti
  </button>

  {ALPHABET.map(letter => (
    <button
      key={letter}
      type="button"
      onClick={() =>
        setLetterFilter(current => (current === letter ? null : letter))
      }
      className={`rounded border px-2 py-1 text-xs ${
        letterFilter === letter
          ? 'border-[var(--dash-accent)] bg-[var(--dash-accent)] text-[var(--dash-text-strong)]'
          : 'border-[var(--dash-border)] text-[var(--dash-muted)]'
      }`}
    >
      {letter}
    </button>
  ))}
</div>

        {(error || actionError) && (
          <div className="rounded-lg border border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)] px-4 py-3 text-sm text-[var(--dash-danger-text)]">
            {actionError ?? error}
          </div>
        )}

        {isLoading && (
          <div className="rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-4 py-6 text-sm italic text-[var(--dash-muted)]">
            Caricamento archivio oggetti...
          </div>
        )}

        {!isLoading && (
          <div className="space-y-3">
            {filteredItems.length === 0 && (
              <div className="rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-4 py-6 text-sm italic text-[var(--dash-muted)]">
                Nessun oggetto standard o custom trovato.                
              </div>
            )}

            {standardItems.length > 0 && (
  <div className="rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface)]">
    <button
      type="button"
      onClick={() => setShowStandardItems(value => !value)}
      className="flex w-full items-center justify-between px-4 py-3 text-left"
    >
      <span className="text-sm font-semibold text-[var(--dash-text)]">
        Oggetti standard
      </span>
      <span className="text-xs text-[var(--dash-muted)]">
        {showStandardItems ? 'Nascondi' : 'Mostra'} ({standardItems.length})
      </span>
    </button>

    {showStandardItems && (
      <div className="space-y-2 border-t border-[var(--dash-border)] p-4">
        {standardItems.map(item => (
          <div
            key={item.id}
            className="rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3">
  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)]">
    <Icon
      icon={item.iconId ?? 'game-icons:swap-bag'}
      className="h-6 w-6"
      style={{ color: item.iconColor ?? '#d6b27c' }}
    />
  </span>

  <div className="min-w-0">
    <div className="text-sm font-medium text-[var(--dash-text-strong)]">
      {item.name}
    </div>
  </div>
</div>

                {item.description && (
                  <div className="mt-1 text-xs text-[var(--dash-muted)]">
                    {item.description}
                  </div>
                )}

                <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                  <Badge variant="subtle">{getTypeLabel(item.type)}</Badge>
                  {item.isVehicle && <Badge variant="subtle">Veicolo</Badge>}
                  <Badge variant="subtle">Standard</Badge>
                  <Badge variant="subtle">{getRarityLabel(item.rarity)}</Badge>
                </div>
              </div>

              <span className="shrink-0 rounded border border-[var(--dash-border-soft)] px-2 py-1 text-xs text-[var(--dash-muted)]">
                Non modificabile
              </span>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
)}

           {customItems.map(item => {
  const imageAsset = getItemImageAsset(item);

  return (
    <div
      key={item.id}
      className="rounded-lg border border-[var(--dash-border-soft)] bg-[linear-gradient(90deg,var(--dash-panel)_0%,var(--dash-panel)_55%,var(--dash-surface)_78%,var(--dash-surface-2)_100%)] p-4">
      <div className="relative z-10 grid gap-5 md:grid-cols-[1fr_84px_96px]">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] shadow-lg">
              <Icon
                icon={item.iconId ?? 'game-icons:swap-bag'}
                className="h-7 w-7"
                style={{ color: item.iconColor ?? '#d6b27c' }}
              />
            </span>

            <div className="min-w-0">
              <div className="text-sm font-medium text-[var(--dash-text-strong)]">
                {item.name}
              </div>

              <div className="mt-1 text-xs text-[var(--dash-muted)]">
                {item.description}
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
            <Badge variant="subtle">{getTypeLabel(item.type)}</Badge>
            {item.isVehicle && <Badge variant="subtle">Veicolo</Badge>}
            {item.isClue && <Badge variant="subtle">Indizio</Badge>}
            {item.isStoryItem && <Badge variant="subtle">Trama</Badge>}
            {!item.isActive && <Badge variant="danger">Archiviato</Badge>}
            <Badge variant="subtle">
              {item.source === 'base' ? 'Base' : 'Custom GM'}
            </Badge>
            {item.campaignId === null ? (
              <Badge variant="subtle">Globale</Badge>
            ) : (
              <Badge variant="subtle">Campagna</Badge>
            )}
            <Badge variant="subtle">{getRarityLabel(item.rarity)}</Badge>
            {item.tags.map(tag => (
              <Badge key={tag} variant="subtle">
                #{tag}
              </Badge>
            ))}
            {item.linkedEnvironmentIds?.map(id => (
              <InlineLinkBadge
                key={`env-${id}`}
                icon={<Bookmark className="h-3 w-3" />}
                label={findLinkName(environmentOptions, id)}
                tooltip="Vai al luogo collegato"
                onClick={() => handleLinkedEntityNavigate({ tabId: 'environments', entityId: id, entityType: 'environment' })}
              />
            ))}
            {item.linkedNpcIds?.map(id => (
              <InlineLinkBadge
                key={`npc-${id}`}
                icon={<Ghost className="h-3 w-3" />}
                label={findLinkName(npcOptions, id)}
                tooltip="Vai al PNG collegato"
                onClick={() => handleLinkedEntityNavigate({ tabId: 'npcs', entityId: id, entityType: 'npc' })}
              />
            ))}
            {item.linkedMonsterIds?.map(id => (
              <InlineLinkBadge
                key={`monster-${id}`}
                icon={<Swords className="h-3 w-3" />}
                label={findLinkName(monsterOptions, id)}
                tooltip="Vai al mostro collegato"
                onClick={() => handleLinkedEntityNavigate({ tabId: 'monsters', entityId: id, entityType: 'monster' })}
              />
            ))}
            {item.containerItemId && (
              <InlineLinkBadge
                icon={<Archive className="h-3 w-3" />}
                label={`Dentro: ${getCatalogItemName(item.containerItemId) ?? 'oggetto'}`}
                tooltip="Apri oggetto contenitore"
                onClick={() => {
                  const containerItem = items.find(candidate => candidate.id === item.containerItemId);
                  if (containerItem && containerItem.source !== 'base') {
                    openEditEditor(containerItem);
                  }
                }}
              />
            )}
          </div>
        </div>

        <div className="group relative flex h-20 w-20 items-center justify-center overflow-visible">
  {imageAsset ? (
    <>
      <button
  type="button"
  onClick={() => setPreviewImageAsset(imageAsset)}
  className="group/image relative h-full w-full cursor-zoom-in rounded-md"
>
  <img
    src={imageAsset.thumbnailDataUrl || imageAsset.imageDataUrl}
    alt={item.name}
    className="h-full w-full rounded-md object-contain shadow-lg"
  />

  <span className="pointer-events-none absolute bottom-full left-1/2 z-[120] mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface)] px-2 py-1 text-xs text-[var(--dash-text-strong)] shadow-xl group-hover/image:block">
    Clicca per ingrandire
  </span>
</button>
    </>
  ) : (
            <div className="px-3 text-center text-xs text-[var(--dash-muted)]">
              Nessuna immagine
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => openEditEditor(item)}
            className="group flex items-center justify-center gap-1 rounded border border-[var(--dash-border-soft)] px-2 py-1 text-xs text-[var(--dash-text-strong)] transition-colors hover:border-[var(--dash-accent)] hover:bg-[var(--dash-surface-2)]"
          >
            <Edit2 className="h-3 w-3 group-hover:animate-[editWrite_0.65s_ease-in-out_infinite]" />
            Modifica
          </button>

          {item.isActive ? (
            <button
              type="button"
              onClick={() => void handleArchive(item)}
              className="group flex items-center justify-center gap-1 rounded border border-[var(--dash-accent-2)] px-2 py-1 text-xs text-[var(--dash-accent-2)] transition-colors hover:bg-[var(--dash-surface-2)]"
            >
              <Archive className="h-3 w-3 group-hover:animate-[locationArrowPulse_0.8s_ease-in-out_infinite]" />
              Archivia
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleRestore(item)}
              className="group flex items-center justify-center gap-1 rounded border border-[var(--dash-accent)] px-2 py-1 text-xs transition-colors hover:bg-[var(--dash-surface-2)]"
            >
              <RotateCcw className="h-3 w-3 group-hover:animate-[locationArrowPulse_0.8s_ease-in-out_infinite]" />
              Ripristina
            </button>
          )}

          <button
            type="button"
            onClick={() => setItemToDelete(item)}
            className="group flex items-center justify-center gap-1 rounded border border-[var(--dash-danger-border)] px-2 py-1 text-xs text-[var(--dash-danger-text)] transition-colors hover:bg-[var(--dash-danger-bg)]"
          >
            <Trash2 className="h-3 w-3 group-hover:animate-[trashShake_0.55s_ease-in-out_infinite]" />
            Elimina
          </button>
        </div>
      </div>
    </div>
  );
})}
          </div>
        )}

        <CatalogItemEditorModal
          isOpen={editorOpen}
          mode={editorMode}
          campaignId={campaignId}
          initialItem={editingItem}
          catalogItems={items}
          isSaving={isSaving}
          onClose={closeEditor}
          onSubmit={handleSubmitEditor}
        />
        {itemToDelete && (
  <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 px-4">
    <div className="w-full max-w-md rounded-2xl border border-[var(--dash-danger-border)] bg-[var(--dash-surface)] p-6 shadow-2xl">
      <h3 className="text-lg font-semibold text-[var(--dash-text-strong)]">
        Eliminare oggetto?
      </h3>

      <p className="mt-3 text-sm text-[var(--dash-muted)]">
        Vuoi eliminare definitivamente “{itemToDelete.name}”? Questa azione non può essere annullata.
      </p>

      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={() => setItemToDelete(null)}
          className="group flex items-center gap-2 rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-4 py-2 text-sm text-[var(--dash-text-strong)] hover:bg-[var(--dash-surface-2)]"
        >
          <X className="h-4 w-4 group-hover:animate-[cancelWiggle_0.55s_ease-in-out_infinite]" />
          Annulla
        </button>

        <button
          type="button"
          onClick={() => void handleDelete(itemToDelete)}
          className="group flex items-center gap-2 rounded-lg border border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)] px-4 py-2 text-sm text-[var(--dash-danger-text)] hover:bg-[var(--dash-danger-hover)]"
        >
          <Trash2 className="h-4 w-4 group-hover:animate-[trashShake_0.55s_ease-in-out_infinite]" />
          Elimina
        </button>
        
      </div>
    </div>
  </div>
)}

        {previewImageAsset && (
  <div
    className="fixed inset-0 z-[130] flex items-center justify-center bg-black/80 p-6"
    onClick={() => setPreviewImageAsset(null)}
  >
    <div className="max-h-[85vh] max-w-[85vw] rounded-2xl border border-[var(--dash-border)] bg-[var(--dash-surface)] p-3 shadow-2xl">
      <img
        src={previewImageAsset.imageDataUrl}
        alt={previewImageAsset.name}
        className="max-h-[80vh] max-w-[80vw] rounded-xl object-contain"
      />
    </div>
  </div>
)}
      </div>
    </div>
  );
}


function InlineLinkBadge({
  icon,
  label,
  tooltip,
  onClick
}: {
  icon?: ReactNode;
  label: string;
  tooltip: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={event => {
        event.preventDefault();
        event.stopPropagation();
        onClick?.();
      }}
      className="group relative inline-flex h-[22px] cursor-pointer items-center gap-1 rounded-full border border-[var(--dash-border-soft)] bg-[var(--dash-input)] px-2 py-0 text-[11px] leading-none text-[var(--dash-muted)] align-middle transition-colors hover:border-[var(--dash-accent)] hover:bg-[var(--dash-panel)] hover:text-[var(--dash-text-strong)]"
    >
      {icon && (
        <span className="inline-flex h-3 w-3 items-center justify-center leading-none">
          {icon}
        </span>
      )}

      <span className="inline-flex items-center leading-none">
        {label}
      </span>

      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-[var(--dash-accent)] bg-[var(--dash-panel)] px-3 py-1.5 text-xs text-[var(--dash-text-strong)] shadow-xl group-hover:block">
        {tooltip}
      </span>
    </button>
  );
}

function Badge({
  children,
  variant = 'default'
}: {
  children: ReactNode;
  variant?: 'default' | 'danger' | 'subtle';
}) {
  const styles =
    variant === 'danger'
      ? 'border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)] text-[var(--dash-danger-text)]'
      : variant === 'subtle'
      ? 'border-[var(--dash-border-soft)] bg-[var(--dash-input)] text-[var(--dash-muted)]'
      : 'border-[var(--dash-border-soft)] bg-[var(--dash-panel)] text-[var(--dash-text-strong)]';

  return (
    <span className={`inline-flex h-[22px] items-center gap-1 rounded-full border px-2 py-0 text-[11px] leading-none align-middle ${styles}`}>
      {children}
    </span>
  );
  
}