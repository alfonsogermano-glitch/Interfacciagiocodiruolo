import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Swords,
  Shield,
  Plus,
  Edit2,
  Trash2,
  Save,
  X,
  User,
  MapPin,
  Search,
  LayoutGrid,
  ArrowLeft,
  Sparkles,
  CircleDot,
  MoreVertical,
  ListFilter,
  Grid3X3,
  List
} from 'lucide-react';
import { loadAdventureReferences, loadEnvironmentReferences } from '../../../services/campaign/entityReferenceService';
import { MONSTER_BASE_CATALOG } from '../../../data/monsterBaseCatalog';
import { MONSTER_TRAITS_CATALOG } from '../../../data/monsterTraitsCatalog';
import { MONSTER_SPECIAL_ACTIONS_CATALOG } from '../../../data/monsterSpecialActionsCatalog';
import type { Adventure } from '../../../types/adventure';
import { useCampaignEntities } from '../../../hooks/useCampaignEntities';
import { useCampaignEntitySelection } from '../../../hooks/useCampaignEntitySelection';
import { HorrorCard } from '../ui/HorrorCard';
import { HorrorButton } from '../ui/HorrorButton';
import { EmptyState } from '../ui/EmptyState';
import { TagBadge } from '../ui/TagBadge';
import { loadMonsters, saveMonster as saveMonsterToSupabase, deleteMonster as deleteMonsterFromSupabase } from '../../../services/supabase/entitiesService';
import {
  VISUAL_ASSETS_CHANGED_EVENT,
  loadVisualAssetsByTypes
} from '../../../services/storage/visualAssetsStorage';
import type { Monster, ImageCrop, VisualAsset, NavigationTarget, MonstersManagerProps, CustomEntry, Difficulty, EnvironmentSummary } from './monsters/monstersTypes';
import { FOLLIA_DIFFICULTY_OPTIONS, TERRIFYING_TRAIT_ID } from './monsters/monstersTypes';
import { ADVENTURES_STORAGE_KEY, ENVIRONMENTS_STORAGE_KEY, DIFFICULTY_OPTIONS, NO_FRAME_VALUE, DEFAULT_CROP, DEFAULT_PORTRAIT_BORDER_COLOR } from './monsters/monstersConstants';
import {
  monsterStorage,
  createEmptyMonster,
  createMonsterFromBase,
  normalizeMonster,
  normalizeTiroFollia,
  generateId,
  findTrait,
  getMonsterTraitDisplayName,
  findSpecialAction,
  monsterHasTerrifyingTrait,
  monsterHasSpecialActions,
  clampMonsterAudacia,
  getMonsterCriticalBoxes,
  calculateAudaciaGainFromFreshnessChange,
  mergeEnvironmentReferencesWithStoredDetails,
  readStoredEnvironmentSummaries
} from './monsters/monstersUtils';
import { PortraitImage, ImageEditor, MonsterPortraitFrame, FrameTransformStepper, MonsterCoverFrame } from './monsters/MonsterImageComponents';
import { FreschezzaMaxEditor, FreschezzaBoxesEditor } from './monsters/MonsterFreschezzaComponents';
import { CatalogSelectionBlock, CustomEntriesEditor, Badge, Info, InfoBlock, TagsBlock } from './monsters/MonsterCatalogComponents';
import { isSupabaseConfigured, supabase } from '../../../lib/supabaseClient';
import { generateUUID } from '../../../lib/uuid';
import { useAuth } from '../../auth/AuthContext';
import { useCampaign } from '../../campaigns/CampaignContext';
import { useRuleset } from '../../campaigns/RulesetContext';
import { RulesetBadge } from '../../campaigns/RulesetGate';
import { D20StatBlock, DEFAULT_D20_STATS, type D20Stats } from '../ruleset/D20StatBlock';

export function MonstersManager({
  storageRefreshKey = 0,
  navigationTarget = null,
  onNavigate
}: MonstersManagerProps) {
  const { activeCampaignId } = useCampaign();
  const { user } = useAuth();

  const {
    items: monsters,
    setItems: setMonsters,
    upsert: upsertLocal,
    remove: removeLocal
  } = useCampaignEntities(monsterStorage, activeCampaignId);

  const { isHSC, isDnD5e, isPathfinder } = useRuleset();
  const isD20 = isDnD5e || isPathfinder;

  const [isLoadingFromSupabase, setIsLoadingFromSupabase] = useState(true);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

   const [adventures, setAdventures] = useState<Adventure[]>([]);

  useEffect(() => {
    async function loadFromSupabase() {
      try {
        const loadedMonsters = await loadMonsters(activeCampaignId);

        const normalizedMonsters = loadedMonsters.map((monster: any) =>
          normalizeMonster(monster)
        );

        setMonsters(normalizedMonsters);
        console.log('Mostri caricati da storage:', normalizedMonsters);
      } catch (error) {
        console.error('Errore caricamento mostri da Supabase:', error);
      } finally {
        setIsLoadingFromSupabase(false);
      }
    }

    loadFromSupabase();
  }, [setMonsters, storageRefreshKey]);

  const upsert = async (monster: Monster) => {
    const normalizedMonster = normalizeMonster({
      ...monster,
      campaignId: monster.campaignId ?? activeCampaignId,
      updatedAt: new Date().toISOString()
    });

    upsertLocal(normalizedMonster);
    setSelectedMonster(normalizedMonster);

    try {
      await saveMonsterToSupabase(activeCampaignId, normalizedMonster);
    } catch (error) {
      console.error('Errore salvataggio mostro su Supabase:', error, normalizedMonster);
    }
  };

  const remove = async (id: string) => {
    removeLocal(id);

    if (!isLoadingFromSupabase) {
      try {
        await deleteMonsterFromSupabase(id);
      } catch (error) {
        console.error('Errore eliminazione mostro da Supabase:', error);
      }
    }
  };

useEffect(() => {
  let cancelled = false;

  loadAdventureReferences(activeCampaignId)
    .then(references => {
      if (cancelled) return;

      setAdventures(
        references.map(reference => ({
          id: reference.id,
          campaignId: reference.campaignId ?? activeCampaignId,
          title: reference.name,
          description: '',
          createdAt: '',
          updatedAt: ''
        })) as Adventure[]
      );
    })
    .catch(error => {
      console.error('Errore caricamento riferimenti Avventure per Mostri:', error);

      if (typeof window === 'undefined') return;

      try {
        const saved = window.localStorage.getItem(ADVENTURES_STORAGE_KEY);
        if (!saved) {
          setAdventures([]);
          return;
        }

        const parsed = JSON.parse(saved);
        setAdventures(Array.isArray(parsed) ? parsed : []);
      } catch (localError) {
        console.error('Errore fallback caricamento Avventure per Mostri:', localError);
        setAdventures([]);
      }
    });

  return () => {
    cancelled = true;
  };
}, [storageRefreshKey]);

  const [environments, setEnvironments] = useState<EnvironmentSummary[]>([]);

  useEffect(() => {
    let cancelled = false;

    loadEnvironmentReferences(activeCampaignId)
      .then(references => {
        if (cancelled) return;
        setEnvironments(
          mergeEnvironmentReferencesWithStoredDetails(
            references,
            readStoredEnvironmentSummaries(activeCampaignId)
          )
        );
      })
      .catch(error => {
        console.error('Errore caricamento riferimenti Luoghi per Mostri:', error);

        if (typeof window === 'undefined') return;

        try {
          const saved = window.localStorage.getItem(ENVIRONMENTS_STORAGE_KEY);
          if (!saved) {
            setEnvironments([]);
            return;
          }

          const parsed = JSON.parse(saved);
          setEnvironments(
            Array.isArray(parsed)
              ? parsed
                  .filter(item => item?.id)
                  .map(item => ({
                    id: String(item.id),
                    name: String(item.name ?? 'Luogo senza nome'),
                    campaignId: item.campaignId ?? item.campaign_id ?? null,
                    adventureId: item.adventureId ?? item.adventure_id ?? null,
                    parentLocationId: item.parentLocationId ?? item.parent_location_id ?? null
                  }))
              : []
          );
        } catch (localError) {
          console.error('Errore fallback caricamento Luoghi per Mostri:', localError);
          setEnvironments([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [storageRefreshKey]);

  const [visualAssets, setVisualAssets] = useState<VisualAsset[]>([]);

  useEffect(() => {
    let cancelled = false;

    const loadMonsterFrameAssets = async () => {
      try {
        const frameAssets = await loadVisualAssetsByTypes(
          activeCampaignId,
          [
            'monster-frame-default',
            'monster-frame',
            'monster-portrait-frame-default',
            'monster-portrait-frame'
          ],
          { preferPersistentCache: true }
        );

        if (cancelled) return;

        setVisualAssets(frameAssets);
      } catch (error) {
        console.error('Errore caricamento cornici mostro:', error);

        if (!cancelled) {
          setVisualAssets([]);
        }
      }
    };

    void loadMonsterFrameAssets();

    const handleVisualAssetsChanged = () => {
      void loadMonsterFrameAssets();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener(VISUAL_ASSETS_CHANGED_EVENT, handleVisualAssetsChanged);
    }

    return () => {
      cancelled = true;

      if (typeof window !== 'undefined') {
        window.removeEventListener(VISUAL_ASSETS_CHANGED_EVENT, handleVisualAssetsChanged);
      }
    };
  }, [storageRefreshKey]);

  const defaultMonsterFrameAsset =
  visualAssets.find(asset => asset.type === 'monster-frame-default') ??
  visualAssets.find(asset => asset.name === 'Cornice Foto Mostro Default') ??
  visualAssets.find(asset => asset.name === 'Cornice Foto Estesa Mostro Default') ??
  visualAssets.find(asset => asset.type === 'monster-frame');

  const defaultPortraitFrameAsset =
  visualAssets.find(asset => asset.type === 'monster-portrait-frame-default') ??
  visualAssets.find(asset => asset.name === 'Cornice Portrait Mostro Default') ??
  visualAssets.find(asset => asset.type === 'monster-portrait-frame');

  const getPortraitFrameImageUrl = (monster: Monster): string | undefined => {
    if (monster.portraitFrameAssetId === NO_FRAME_VALUE) {
      return undefined;
    }

    return visualAssets.find(asset => asset.id === monster.portraitFrameAssetId)?.imageDataUrl ??
      defaultPortraitFrameAsset?.imageDataUrl;
  };

  const getCoverFrameImageUrl = (monster: Monster): string | undefined => {
    if (monster.coverFrameAssetId === NO_FRAME_VALUE) {
      return undefined;
    }

    return visualAssets.find(asset => asset.id === monster.coverFrameAssetId)?.imageDataUrl ??
      defaultMonsterFrameAsset?.imageDataUrl;
  };

  const {
    selectedItem: selectedMonster,
    selectItem: setSelectedMonster,
    clearSelection: clearSelectedMonster
    } = useCampaignEntitySelection(monsters);
  const [editingMonster, setEditingMonster] = useState<Monster | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [baseMonsterIdToCreate, setBaseMonsterIdToCreate] = useState('');
  const [editTab, setEditTab] = useState<'sheet' | 'avatar' | 'token' | 'abilities'>('sheet');
  const [narrativeFilter, setNarrativeFilter] = useState('all');
  const [monsterSearch, setMonsterSearch] = useState('');
  const [archiveQuickFilter, setArchiveQuickFilter] = useState<'all' | 'campaign' | 'unassigned' | 'custom' | 'catalog'>('all');
  const [archivePageSize, setArchivePageSize] = useState(12);
  const [archivePage, setArchivePage] = useState(1);
  const [archiveSortMode, setArchiveSortMode] = useState<'name-asc' | 'name-desc' | 'recent' | 'updated'>('name-asc');
  const [archiveViewMode, setArchiveViewMode] = useState<'grid' | 'list'>('grid');
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState(false);
  const [advancedCampaignFilter, setAdvancedCampaignFilter] = useState<'all' | 'current' | 'none'>('all');
  const handledNavigationTargetRef = useRef<string | null>(null);
  const [monsterToDelete, setMonsterToDelete] = useState<Monster | null>(null);

  useEffect(() => {
    if (navigationTarget?.tabId !== 'monsters') return;
    if (navigationTarget.entityType !== 'monster') return;
    if (!navigationTarget.entityId) return;

    const navigationKey = `${navigationTarget.tabId}:${navigationTarget.entityType}:${navigationTarget.entityId}`;

    if (handledNavigationTargetRef.current === navigationKey) {
      return;
    }

    const monsterToSelect = monsters.find(monster => monster.id === navigationTarget.entityId);

    if (!monsterToSelect) return;

    handledNavigationTargetRef.current = navigationKey;
    setSelectedMonster(monsterToSelect);
    setEditingMonster(null);
    setIsEditing(false);
  }, [navigationTarget, monsters, setSelectedMonster]);


  const currentMonster = isEditing ? editingMonster : selectedMonster;

const filteredMonsters = (
  narrativeFilter === 'all'
    ? monsters.filter(monster => monster.campaignId === activeCampaignId)
    : monsters.filter(monster => monster.adventureId === narrativeFilter)
)
  .filter(monster => {
    const query = monsterSearch.trim().toLowerCase();

    if (!query) return true;

    return [
      monster.name,
      monster.description,
      monster.attacco,
      monster.difesa
    ]
      .filter(Boolean)
      .some(value => String(value).toLowerCase().includes(query));
  })
  .filter(monster => {
    if (archiveQuickFilter === 'campaign') {
      return Boolean(monster.adventureId || monster.environmentId);
    }

    if (archiveQuickFilter === 'unassigned') {
      return !monster.adventureId && !monster.environmentId;
    }

    if (archiveQuickFilter === 'custom') {
      return monster.isCustom;
    }

    if (archiveQuickFilter === 'catalog') {
      return !monster.isCustom;
    }

    return true;
  })
  .sort((a, b) => {
    if (archiveSortMode === 'name-desc') {
      return (b.name || 'Mostro senza nome').localeCompare(
        a.name || 'Mostro senza nome',
        'it',
        { sensitivity: 'base' }
      );
    }

    if (archiveSortMode === 'recent') {
      return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
    }

    if (archiveSortMode === 'updated') {
      return new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime();
    }

    return (a.name || 'Mostro senza nome').localeCompare(
      b.name || 'Mostro senza nome',
      'it',
      { sensitivity: 'base' }
    );
  });

const activeFilterDescription =
  narrativeFilter === 'all'
    ? 'Filtro attivo: tutti i mostri della campagna corrente.'
    : `Filtro attivo: solo i mostri collegati all'avventura "${
        adventures.find(adventure => adventure.id === narrativeFilter)?.title ?? 'selezionata'
      }".`;

const archiveTotalPages = Math.max(1, Math.ceil(filteredMonsters.length / archivePageSize));
const safeArchivePage = Math.min(archivePage, archiveTotalPages);
const archiveStartIndex = filteredMonsters.length === 0 ? 0 : (safeArchivePage - 1) * archivePageSize;
const archiveEndIndex = Math.min(filteredMonsters.length, archiveStartIndex + archivePageSize);
const visibleMonsters = filteredMonsters.slice(archiveStartIndex, archiveEndIndex);

const getEnvironmentPath = (environmentId?: string | null): string => {
  if (!environmentId) return '';

  const visited = new Set<string>();
  const path: string[] = [];
  let current = environments.find(environment => environment.id === environmentId);

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    path.unshift(current.name || 'Luogo senza nome');

    if (!current.parentLocationId) break;

    current = environments.find(environment => environment.id === current?.parentLocationId);
  }

  return path.join(' - ');
};

const sortedEnvironmentOptions = environments
  .filter(environment =>
    environment.campaignId == null ||
    environment.campaignId === activeCampaignId
  )
  .sort((a, b) =>
    getEnvironmentPath(a.id).localeCompare(
      getEnvironmentPath(b.id),
      'it',
      { sensitivity: 'base' }
    )
  );

const getMonsterCampaignAdventureText = (monster: Monster): string => {
  const campaignName = 'Tutta la campagna';
  const adventureName = monster.adventureId
    ? adventures.find(adventure => adventure.id === monster.adventureId)?.title ?? 'Avventura non trovata'
    : '';

  return [campaignName, adventureName].filter(Boolean).join(', ');
};




const dispatchNavigationTarget = (target: NavigationTarget) => {
  if (typeof window === 'undefined') return;

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
};

const handleLinkedEntityNavigate = (target: NavigationTarget) => {
  const targets =
    target.entityType === 'environment'
      ? [
          target,
          { ...target, tabId: 'environments' },
          { ...target, tabId: 'environment' },
          { ...target, tabId: 'locations' },
          { ...target, tabId: 'luoghi' }
        ]
      : [target];

  if (onNavigate) {
    onNavigate(target);
    return;
  }

  targets.forEach(dispatchNavigationTarget);
};

useEffect(() => {
  setArchivePage(1);
}, [monsterSearch, archiveQuickFilter, narrativeFilter, archivePageSize, archiveSortMode, advancedCampaignFilter]);

  const updateMonster = (updatedMonster: Monster) => {
  const monsterWithTimestamp = {
    ...updatedMonster,
    updatedAt: new Date().toISOString()
  };

  upsert(monsterWithTimestamp);

  setSelectedMonster(monsterWithTimestamp);
};

 const updateCurrentMonster = (updatedMonster: Monster) => {
  if (isEditing) {
    setEditingMonster(updatedMonster);
  }
};

  const spendMonsterAudacia = () => {
    if (!currentMonster) return;

    const updatedMonster: Monster = {
      ...currentMonster,
      audacia: Math.max(0, (currentMonster.audacia ?? 0) - 1)
    };

    if (isEditing) {
      setEditingMonster(updatedMonster);
      return;
    }

    updateMonster(updatedMonster);
  };

  const addCustomMonster = () => {
  setBaseMonsterIdToCreate('');
  const monster = createEmptyMonster(activeCampaignId, user?.id);

  setEditingMonster(monster);
  clearSelectedMonster();
  setIsEditing(true);
};

  const addMonsterFromBase = () => {
  const newMonster = createMonsterFromBase(baseMonsterIdToCreate, activeCampaignId, user?.id);
  if (!newMonster) return;

  setEditingMonster(newMonster);
  clearSelectedMonster();
  setBaseMonsterIdToCreate('');
  setIsEditing(true);
};

  const saveMonster = async () => {
  if (!editingMonster) return;
  if (!editingMonster.name.trim()) return;

  if (
    hasIncompleteCustomEntries(editingMonster.customTraits) ||
    hasIncompleteCustomEntries(editingMonster.customSpecialActions)
  ) {
    alert('Per Tratti personalizzati e Azioni speciali personalizzate devi compilare sia Nome che Descrizione, oppure lasciare entrambi vuoti.');
    return;
  }

  const cleanedCustomTraits = cleanCustomEntries(editingMonster.customTraits);
  const cleanedCustomSpecialActions = cleanCustomEntries(editingMonster.customSpecialActions);

  const cleanedMonster: Monster = {
    ...editingMonster,
    customTraits: cleanedCustomTraits,
    customSpecialActions: cleanedCustomSpecialActions
  };

  const monsterToSave: Monster = normalizeMonster({
    ...cleanedMonster,
    campaignId: cleanedMonster.campaignId ?? activeCampaignId,
    audacia: clampMonsterAudacia(cleanedMonster, cleanedMonster.audacia),
    caselleFreschezzaCritiche: getMonsterCriticalBoxes(cleanedMonster),
    updatedAt: new Date().toISOString(),
    isDirty: true
  });

  await upsert(monsterToSave);

  setSelectedMonster(monsterToSave);
  setEditingMonster(null);
  setIsEditing(false);
  setBaseMonsterIdToCreate('');
};

  const cancelEditing = () => {
  setEditingMonster(null);
  setIsEditing(false);
};

  const confirmDeleteMonster = async () => {
    if (!monsterToDelete) return;

    await remove(monsterToDelete.id);

    if (selectedMonster?.id === monsterToDelete.id) {
      clearSelectedMonster();
      setIsEditing(false);
      setEditingMonster(null);
    }

    setMonsterToDelete(null);
  };

  const toggleTrait = (traitId: string) => {
    if (!currentMonster) return;

    const isRemovingTrait = currentMonster.traitIds.includes(traitId);
    const nextTraitIds = isRemovingTrait
      ? currentMonster.traitIds.filter(id => id !== traitId)
      : [...currentMonster.traitIds, traitId];

    const nextMonster: Monster = {
      ...currentMonster,
      traitIds: nextTraitIds
    };

    updateCurrentMonster({
      ...nextMonster,
      tiroFollia:
        traitId === TERRIFYING_TRAIT_ID
          ? isRemovingTrait
            ? null
            : normalizeTiroFollia(nextMonster) ?? 'Base'
          : currentMonster.tiroFollia
    });
  };

  const toggleSpecialAction = (actionId: string) => {
    if (!currentMonster) return;

    const nextActionIds = currentMonster.specialActionIds.includes(actionId)
      ? currentMonster.specialActionIds.filter(id => id !== actionId)
      : [...currentMonster.specialActionIds, actionId];

    const nextMonster: Monster = {
      ...currentMonster,
      specialActionIds: nextActionIds
    };

    updateCurrentMonster({
      ...nextMonster,
      audacia: monsterHasSpecialActions(nextMonster)
        ? clampMonsterAudacia(nextMonster, nextMonster.audacia)
        : 0,
      caselleFreschezzaCritiche: monsterHasSpecialActions(nextMonster)
        ? getMonsterCriticalBoxes(nextMonster)
        : []
    });
  };

  const addCustomTrait = () => {
    if (!currentMonster) return;

    updateCurrentMonster({
      ...currentMonster,
      customTraits: [
        ...currentMonster.customTraits,
        { id: generateId('trait'), name: '', description: '' }
      ]
    });
  };

  const updateCustomTrait = (id: string, patch: Partial<CustomEntry>) => {
    if (!currentMonster) return;

    updateCurrentMonster({
      ...currentMonster,
      customTraits: currentMonster.customTraits.map(item =>
        item.id === id ? { ...item, ...patch } : item
      )
    });
  };

  const removeCustomTrait = (id: string) => {
    if (!currentMonster) return;

    updateCurrentMonster({
      ...currentMonster,
      customTraits: currentMonster.customTraits.filter(item => item.id !== id)
    });
  };

  const addCustomSpecialAction = () => {
    if (!currentMonster) return;

    updateCurrentMonster({
      ...currentMonster,
      customSpecialActions: [
        ...currentMonster.customSpecialActions,
        { id: generateId('action'), name: '', description: '' }
      ]
    });
  };

  const updateCustomSpecialAction = (id: string, patch: Partial<CustomEntry>) => {
    if (!currentMonster) return;

    updateCurrentMonster({
      ...currentMonster,
      customSpecialActions: currentMonster.customSpecialActions.map(item =>
        item.id === id ? { ...item, ...patch } : item
      )
    });
  };

  const removeCustomSpecialAction = (id: string) => {
    if (!currentMonster) return;

    const nextMonster: Monster = {
      ...currentMonster,
      customSpecialActions: currentMonster.customSpecialActions.filter(item => item.id !== id)
    };

    updateCurrentMonster({
      ...nextMonster,
      audacia: monsterHasSpecialActions(nextMonster)
        ? clampMonsterAudacia(nextMonster, nextMonster.audacia)
        : 0,
      caselleFreschezzaCritiche: monsterHasSpecialActions(nextMonster)
        ? getMonsterCriticalBoxes(nextMonster)
        : []
    });
  };

  const cleanCustomEntries = (entries: CustomEntry[]): CustomEntry[] =>
    entries
      .map(entry => ({
        ...entry,
        name: entry.name.trim(),
        description: entry.description.trim()
      }))
      .filter(entry => entry.name || entry.description)
      .filter(entry => entry.name && entry.description);

  const hasIncompleteCustomEntries = (entries: CustomEntry[]): boolean =>
    entries.some(entry => {
      const hasName = Boolean(entry.name.trim());
      const hasDescription = Boolean(entry.description.trim());

      return hasName !== hasDescription;
    });

  const handleImageFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    target: 'portrait' | 'cover'
  ) => {
    if (!currentMonster) return;

    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Seleziona un file immagine valido.');
      return;
    }

    const fieldKey = target === 'portrait' ? 'portraitImageUrl' : 'coverImageUrl';

    const readAsBase64 = () => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        updateCurrentMonster({ ...currentMonster, [fieldKey]: result });
      };
      reader.readAsDataURL(file);
    };

    if (isSupabaseConfigured && supabase && user) {
      setIsUploadingImage(true);
      try {
        const ext = file.name.split('.').pop() ?? 'png';
        const monsterId = currentMonster.id || generateUUID();
        const filePath = `${user.id}/${monsterId}-${Date.now()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('monster-images')
          .upload(filePath, file, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('monster-images')
          .getPublicUrl(filePath);

        updateCurrentMonster({ ...currentMonster, [fieldKey]: publicUrl });
      } catch (err) {
        console.error('Errore upload immagine su Storage:', err);
        readAsBase64();
      } finally {
        setIsUploadingImage(false);
      }
    } else {
      readAsBase64();
    }
  };

  const updatePortraitCrop = (patch: Partial<ImageCrop>) => {
    if (!currentMonster) return;

    updateCurrentMonster({
      ...currentMonster,
      portraitCrop: {
        ...(currentMonster.portraitCrop ?? DEFAULT_CROP),
        ...patch
      }
    });
  };

  const updatePortraitScale = (scale: number) => {
    if (!currentMonster) return;

    updateCurrentMonster({
      ...currentMonster,
      portraitCrop: {
        ...(currentMonster.portraitCrop ?? DEFAULT_CROP),
        scale: Math.max(0.5, Math.min(2.5, scale))
      }
    });
  };

  const rotatePortraitFrameDegrees = (delta: number) => {
    if (!currentMonster) return;

    const currentDegrees = currentMonster.portraitFrameRotationDegrees ?? 0;
    const nextDegrees = (currentDegrees + delta + 360) % 360;

    updateCurrentMonster({
      ...currentMonster,
      portraitFrameRotationDegrees: nextDegrees
    });
  };

  const rotatePortraitImageDegrees = (delta: number) => {
  if (!currentMonster) return;

  const currentDegrees = currentMonster.portraitRotationDegrees ?? 0;
  const nextDegrees = (currentDegrees + delta + 360) % 360;

  updateCurrentMonster({
    ...currentMonster,
    portraitRotationDegrees: nextDegrees
  });
};

const rotateCoverImageDegrees = (delta: number) => {
  if (!currentMonster) return;

  const currentDegrees = currentMonster.coverRotationDegrees ?? 0;
  const nextDegrees = (currentDegrees + delta + 360) % 360;

  updateCurrentMonster({
    ...currentMonster,
    coverRotationDegrees: nextDegrees
  });
};

  const resetPortraitCrop = () => {
  if (!currentMonster) return;

  updateCurrentMonster({
    ...currentMonster,
    portraitCrop: { ...DEFAULT_CROP },
    portraitFrameRotationDegrees: 0,
    portraitFrameOffsetX: 0,
    portraitFrameOffsetY: 0,
    portraitFrameScaleX: 1,
    portraitFrameScaleY: 1,
    portraitBorderColor: DEFAULT_PORTRAIT_BORDER_COLOR,
    portraitBorderVisible: true,
    portraitBorderLabel: '',
    portraitRotationDegrees: 0
  });
};

  const resetCoverImageAndFrame = () => {
  if (!currentMonster) return;

  updateCurrentMonster({
    ...currentMonster,
    coverCrop: DEFAULT_CROP,
    coverImageScale: 1,
    coverRotationDegrees: 0,
    frameRotation: 0,
    frameRotationDegrees: 0
  });
};

  const updateCoverScale = (scale: number) => {
    if (!currentMonster) return;

    updateCurrentMonster({
      ...currentMonster,
      coverImageScale: Math.max(0.5, Math.min(1.6, scale))
    });
  };

  const updateCoverCrop = (patch: Partial<ImageCrop>) => {
    if (!currentMonster) return;

    updateCurrentMonster({
      ...currentMonster,
      coverCrop: {
        ...(currentMonster.coverCrop ?? DEFAULT_CROP),
        ...patch
      }
    });
  };

  const toggleFrameRotation = () => {
    if (!currentMonster) return;

    updateCurrentMonster({
      ...currentMonster,
      frameRotation: currentMonster.frameRotation === 90 ? 0 : 90
    });
  };

  const rotateFrameDegrees = (delta: number) => {
    if (!currentMonster) return;

    const currentDegrees = currentMonster.frameRotationDegrees ?? 0;
    const nextDegrees = (currentDegrees + delta + 360) % 360;

    updateCurrentMonster({
      ...currentMonster,
      frameRotationDegrees: nextDegrees
    });
  };

  const returnToMonsterArchive = () => {
    clearSelectedMonster();
    setEditingMonster(null);
    setIsEditing(false);
    setBaseMonsterIdToCreate('');
  };

  const openMonsterDetail = (monster: Monster) => {
    setSelectedMonster(monster);
    setIsEditing(false);
    setEditingMonster(null);
    setEditTab('sheet');
  };

  return (
    <>
      <div className="space-y-6">
      <div className="space-y-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h2 className="flex items-center font-serif text-5xl font-semibold tracking-tight text-[var(--dash-text-strong)]">
              Mostri
              <RulesetBadge className="ml-3" />
            </h2>

            <p className="mt-2 max-w-3xl text-sm text-[var(--dash-muted)]">
              Archivio completo delle creature note e inconoscibili che infestano i confini della realtà.
            </p>

            {isD20 && (
              <div className="mt-3 rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-4 py-3 text-sm text-[var(--dash-muted)]">
                <span className="mr-2 font-medium text-[var(--dash-text)]">Modalità {isDnD5e ? 'D&D 5e' : 'Pathfinder 2e'}:</span>
                Il gestore mostri usa il sistema HSC come base. I campi Freschezza/Audacia/Follia funzionano come HP/iniziativa/morale nel tuo regolamento. Aggiungi le stat D20 nelle note del mostro.
              </div>
            )}
          </div>

          <label className="relative block w-full xl:w-[520px]">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--dash-muted)]" />
            <input
              type="text"
              value={monsterSearch}
              onChange={event => setMonsterSearch(event.target.value)}
              placeholder="Cerca mostro..."
              className="w-full rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] py-3 pl-11 pr-4 text-sm text-[var(--dash-text)] placeholder-[var(--dash-muted)] shadow-inner shadow-black/20 outline-none transition-colors focus:border-[var(--dash-accent)]"
            />
          </label>
        </div>

        <div className="border-t border-[var(--dash-border-soft)] pt-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={archiveSortMode}
                onChange={event => setArchiveSortMode(event.target.value as typeof archiveSortMode)}
                className="rounded-2xl border border-[var(--dash-border-soft)] bg-black/20 px-4 py-2 text-sm text-[var(--dash-text)] outline-none transition-colors hover:border-[var(--dash-accent)]"
              >
                <option value="name-asc">Ordina: Nome (A-Z)</option>
                <option value="name-desc">Ordina: Nome (Z-A)</option>
                <option value="recent">Ordina: Più recenti</option>
                <option value="updated">Ordina: Ultima modifica</option>
              </select>

              {[
                { id: 'all', label: 'Tutti' },
                { id: 'campaign', label: 'In una Campagna' },
                { id: 'unassigned', label: 'In nessuna Campagna' }
              ].map(filter => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setArchiveQuickFilter(filter.id as typeof archiveQuickFilter)}
                  className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm transition-all ${
                    archiveQuickFilter === filter.id
                      ? 'border-[var(--dash-accent)] bg-[var(--dash-accent)] text-[var(--dash-text-strong)] shadow-lg shadow-black/20'
                      : 'border-[var(--dash-border-soft)] bg-black/10 text-[var(--dash-muted)] hover:border-[var(--dash-accent)] hover:bg-black/20 hover:text-[var(--dash-text)]'
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {filter.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setIsAdvancedFiltersOpen(value => !value)}
                className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm transition-colors ${
                  isAdvancedFiltersOpen
                    ? 'border-[var(--dash-accent)] bg-[var(--dash-accent)] text-[var(--dash-text-strong)]'
                    : 'border-[var(--dash-border-soft)] bg-black/10 text-[var(--dash-muted)] hover:border-[var(--dash-accent)] hover:bg-black/20 hover:text-[var(--dash-text)]'
                }`}
              >
                <ListFilter className="h-4 w-4" />
                Filtri
              </button>

              <div className="inline-flex rounded-2xl border border-[var(--dash-border-soft)] bg-black/10 p-1">
                <button
                  type="button"
                  onClick={() => setArchiveViewMode('grid')}
                  className={`rounded-xl px-3 py-2 transition-colors ${
                    archiveViewMode === 'grid'
                      ? 'bg-[var(--dash-accent)] text-[var(--dash-text-strong)]'
                      : 'text-[var(--dash-muted)] hover:text-[var(--dash-text)]'
                  }`}
                  aria-label="Vista a schede"
                >
                  <Grid3X3 className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setArchiveViewMode('list')}
                  className={`rounded-xl px-3 py-2 transition-colors ${
                    archiveViewMode === 'list'
                      ? 'bg-[var(--dash-accent)] text-[var(--dash-text-strong)]'
                      : 'text-[var(--dash-muted)] hover:text-[var(--dash-text)]'
                  }`}
                  aria-label="Vista a lista"
                >
                  <List className="h-4 w-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={addCustomMonster}
                className="group inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--dash-accent)] bg-[var(--dash-accent)] px-5 py-2.5 text-sm font-semibold text-[var(--dash-text-strong)] shadow-lg shadow-black/20 transition-colors hover:bg-[var(--dash-accent-2)]"
              >
                <Plus className="h-4 w-4 group-hover:animate-[plusPulse_0.75s_ease-in-out_infinite]" />
                Nuovo mostro
              </button>
            </div>
          </div>
        </div>

        {isAdvancedFiltersOpen && (
          <div className="rounded-3xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)]/95 p-4 shadow-xl shadow-black/20">
            <div className="mb-3 text-xs uppercase tracking-[0.14em] text-[var(--dash-accent-2)]">
              Filtri avanzati
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
                <div className="text-sm font-semibold text-[var(--dash-text-strong)]">Campagna</div>

                <select
                  value={advancedCampaignFilter === 'none' ? 'all' : advancedCampaignFilter}
                  onChange={event => setAdvancedCampaignFilter(event.target.value as typeof advancedCampaignFilter)}
                  className="mt-2 w-full rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-input)] px-3 py-2 text-sm text-[var(--dash-text)]"
                >
                  <option value="all">Tutte le Campagne</option>
                  <option value="current">Tutta la campagna</option>
                </select>

                <p className="mt-2 text-xs text-[var(--dash-muted)]">
                  In futuro qui comparirà la lista dei nomi delle campagne create.
                </p>
              </div>

              <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
                <div className="text-sm font-semibold text-[var(--dash-text-strong)]">Avventura</div>

                <select
                  value={narrativeFilter}
                  onChange={event => setNarrativeFilter(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-input)] px-3 py-2 text-sm text-[var(--dash-text)]"
                >
                  <option value="all">Tutte le Avventure</option>
                  {adventures
                    .filter(adventure => adventure.campaignId === activeCampaignId)
                    .map(adventure => (
                      <option key={adventure.id} value={adventure.id}>
                        {adventure.title}
                      </option>
                    ))}
                </select>

                <p className="mt-2 text-xs text-[var(--dash-muted)]">
                  Con una campagna specifica mostrerà solo le avventure di quella campagna.
                </p>
              </div>

              <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
                <div className="text-sm font-semibold text-[var(--dash-text-strong)]">Parole chiave</div>

                <div className="mt-2 flex flex-wrap gap-2">
                  {['Boss', 'Occulti', 'Umanoidi'].map(label => (
                    <button
                      key={label}
                      type="button"
                      className="group relative rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-input)] px-3 py-2 text-xs text-[var(--dash-muted)] transition-colors hover:border-[var(--dash-accent)] hover:text-[var(--dash-text-strong)]"
                    >
                      {label}

                      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-xl border border-[var(--dash-accent)] bg-[var(--dash-panel)] px-3 py-1.5 text-xs text-[var(--dash-text-strong)] shadow-xl group-hover:block">
                        Richiede il futuro campo parole chiave dei mostri
                      </span>
                    </button>
                  ))}
                </div>

                <p className="mt-2 text-xs text-[var(--dash-muted)]">
                  Questi filtri diventeranno operativi quando aggiungeremo i tag/categorie mostro al database.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6">
      <div className={currentMonster ? "hidden" : "space-y-6"}>
        {currentMonster && (
        <HorrorCard className="p-4">
  <label className="mb-2 block text-sm text-[var(--dash-text-strong)]">
    Filtro narrativo
  </label>

  <select
  value={narrativeFilter}
  onChange={e => setNarrativeFilter(e.target.value)}
  className="w-full rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-sm text-[var(--dash-text)]"
>
  <option value="all">Tutta la campagna</option>

  {adventures
    .filter(adventure => adventure.campaignId === activeCampaignId)
    .map(adventure => (
      <option key={adventure.id} value={adventure.id}>
        {adventure.title}
      </option>
    ))}
</select>
          <p className="mt-2 text-xs leading-relaxed text-[var(--dash-muted)]">
  {activeFilterDescription}
</p>
</HorrorCard>
)}

        <div className={currentMonster ? "space-y-4" : archiveViewMode === "grid" ? "grid gap-4 xl:grid-cols-3" : "space-y-3"}>
          {filteredMonsters.length === 0 ? (
            <EmptyState
  icon={<Swords className="h-10 w-10" />}
  title="Nessun mostro creato"
  description="Crea una creatura originale oppure parti da un mostro base del catalogo."
  action={
    <HorrorButton type="button" onClick={addCustomMonster}>
      <Plus className="h-4 w-4 group-hover:animate-[plusPulse_0.75s_ease-in-out_infinite]" />
      Crea mostro
    </HorrorButton>
  }
/>
          ) : (
            visibleMonsters.map(monster => {
              const displayMonster =
                isEditing && editingMonster?.id === monster.id
                  ? editingMonster
                  : monster;

              return (
              <div
                key={monster.id}
                role="button"
                tabIndex={0}
                onClick={() => openMonsterDetail(monster)}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openMonsterDetail(monster);
                  }
                }}
                className={`group relative w-full cursor-pointer overflow-hidden rounded-[1.65rem] border-2 text-left shadow-xl shadow-black/20 ring-1 ring-white/5 transition-colors duration-200 hover:border-[var(--dash-accent)] hover:ring-[var(--dash-accent)]/35 hover:shadow-2xl ${
                  selectedMonster?.id === monster.id && !isEditing
                    ? 'border-[var(--dash-accent)] bg-[var(--dash-panel)]'
                    : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface)] hover:border-[var(--dash-accent)]'
                }`}
              >
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(8,8,12,0.99)_0%,rgba(8,8,12,0.94)_58%,rgba(8,8,12,0.78)_100%)]" />
                <div className="pointer-events-none absolute inset-y-0 right-0 w-[46%] opacity-[0.06]">
                  {displayMonster.coverImageUrl || displayMonster.portraitImageUrl ? (
                    <img
                      src={displayMonster.coverImageUrl || displayMonster.portraitImageUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-full w-full bg-[var(--dash-panel)]" />
                  )}
                </div>

                <div className="relative flex h-[156px]">
                  <div className="relative h-full w-[154px] shrink-0 overflow-hidden bg-black/30">
                    {displayMonster.coverImageUrl || displayMonster.portraitImageUrl ? (
                      <img
                        src={displayMonster.coverImageUrl || displayMonster.portraitImageUrl}
                        alt={displayMonster.name}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-[var(--dash-panel)]">
                        <Swords className="h-10 w-10 text-[var(--dash-muted)]" />
                      </div>
                    )}
                    <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(0,0,0,0.14))]" />
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col px-5 py-4 pr-14">
                    <div className="min-w-0">
                      <h3 className="truncate text-[1.55rem] font-semibold leading-tight tracking-tight text-[var(--dash-text-strong)]">
                        {displayMonster.name || 'Mostro senza nome'}
                      </h3>

                      <p className="mt-1 h-5 truncate text-sm text-[var(--dash-muted)]">
                        {displayMonster.description?.trim() ?? ''}
                      </p>
                    </div>

                    <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5 text-[10px]">
                      <span className="inline-flex shrink-0 items-center rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-2 py-0.5 text-[10px] font-semibold leading-5 text-[var(--dash-text)]">
                        {displayMonster.isCustom ? 'Custom' : 'Standard'}
                      </span>
{displayMonster.environmentId && (
                        <button
                          type="button"
                          onClick={event => {
                            event.preventDefault();
                            event.stopPropagation();
                            handleLinkedEntityNavigate({
                              tabId: 'environments',
                              entityId: displayMonster.environmentId ?? undefined,
                              entityType: 'environment'
                            });
                          }}
                          className="inline-flex max-w-[300px] items-center gap-1.5 truncate rounded-md border border-[var(--dash-accent)] bg-[var(--dash-panel)] px-2 py-0.5 text-[10px] font-semibold leading-5 text-[var(--dash-text-strong)] shadow-sm shadow-[var(--dash-accent)]/20 transition-colors duration-150 hover:border-[var(--dash-accent-2)] hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-accent-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dash-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--dash-bg)]"
                          title={getEnvironmentPath(displayMonster.environmentId) || 'Luogo non trovato'}
                        >
                          <MapPin className="h-3 w-3 shrink-0 text-current" />
                          <span className="truncate">
                            {getEnvironmentPath(displayMonster.environmentId) || 'Luogo non trovato'}
                          </span>
                        </button>
                      )}
                    </div>

                    <div className="mt-auto min-w-0 pt-3 text-[11px] text-[var(--dash-muted)]">
                      <span
                        className="block truncate"
                        title={getMonsterCampaignAdventureText(displayMonster)}
                      >
                        {getMonsterCampaignAdventureText(displayMonster)}
                      </span>
                    </div>

                  </div>

                  <span
                    className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-[var(--dash-border-soft)] bg-black/25 text-[var(--dash-muted)] transition-colors group-hover:border-[var(--dash-accent)] group-hover:text-[var(--dash-text-strong)]"
                    aria-hidden="true"
                  >
                    <MoreVertical className="h-5 w-5" />
                  </span>
                </div>
              </div>
              );
            })
          )}
        </div>

        {!currentMonster && filteredMonsters.length > 0 && (
          <div className="flex flex-col gap-4 rounded-3xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)]/90 px-4 py-3 text-sm text-[var(--dash-muted)] shadow-xl shadow-black/10 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <span>Mostra</span>

              <select
                value={archivePageSize}
                onChange={event => {
                  setArchivePageSize(Number(event.target.value));
                  setArchivePage(1);
                }}
                className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-3 py-2 text-[var(--dash-text)] outline-none hover:border-[var(--dash-accent)]"
              >
                {[6, 9, 12, 18, 24].map(size => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>

              <span>per pagina</span>
            </div>

            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setArchivePage(page => Math.max(1, page - 1))}
                disabled={safeArchivePage <= 1}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] text-[var(--dash-text)] transition-colors hover:border-[var(--dash-accent)] disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Pagina precedente"
              >
                ‹
              </button>

              {Array.from({ length: archiveTotalPages }, (_, index) => index + 1)
                .filter(page => {
                  if (archiveTotalPages <= 5) return true;
                  if (page === 1 || page === archiveTotalPages) return true;
                  return Math.abs(page - safeArchivePage) <= 1;
                })
                .map((page, index, pages) => {
                  const previousPage = pages[index - 1];
                  const showGap = previousPage && page - previousPage > 1;

                  return (
                    <span key={page} className="flex items-center gap-2">
                      {showGap && (
                        <span className="px-1 text-[var(--dash-muted)]">…</span>
                      )}

                      <button
                        type="button"
                        onClick={() => setArchivePage(page)}
                        className={`flex h-9 min-w-9 items-center justify-center rounded-full border px-3 transition-colors ${
                          safeArchivePage === page
                            ? 'border-[var(--dash-accent)] bg-[var(--dash-accent)] text-[var(--dash-text-strong)]'
                            : 'border-[var(--dash-border-soft)] bg-[var(--dash-panel)] text-[var(--dash-muted)] hover:border-[var(--dash-accent)] hover:text-[var(--dash-text)]'
                        }`}
                      >
                        {page}
                      </button>
                    </span>
                  );
                })}

              <button
                type="button"
                onClick={() => setArchivePage(page => Math.min(archiveTotalPages, page + 1))}
                disabled={safeArchivePage >= archiveTotalPages}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] text-[var(--dash-text)] transition-colors hover:border-[var(--dash-accent)] disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Pagina successiva"
              >
                ›
              </button>
            </div>

            <div className="text-right text-[var(--dash-muted)]">
              {archiveStartIndex + 1}–{archiveEndIndex} di {filteredMonsters.length} mostri
            </div>
          </div>
        )}
      </div>
            <div className={currentMonster ? "min-w-0" : "hidden"}>
        {currentMonster ? (
          <div className="space-y-5">
            <button
              type="button"
              onClick={returnToMonsterArchive}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-4 py-2 text-sm text-[var(--dash-muted)] transition-colors hover:border-[var(--dash-accent)] hover:text-[var(--dash-text-strong)]"
            >
              <ArrowLeft className="h-4 w-4" />
              Torna ai mostri
            </button>

          <HorrorCard className="overflow-hidden rounded-[2rem] border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] shadow-2xl shadow-black/30">
            <div className="relative overflow-hidden">
              <div className="absolute inset-0 opacity-25">
                {currentMonster.coverImageUrl || currentMonster.portraitImageUrl ? (
                  <img
                    src={currentMonster.coverImageUrl || currentMonster.portraitImageUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full bg-[radial-gradient(circle_at_top,var(--dash-accent),transparent_35%),linear-gradient(135deg,var(--dash-surface),var(--dash-panel))]" />
                )}
              </div>
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,7,10,0.65),rgba(7,7,10,0.96))]" />
              <div className="relative p-6">
              <div className="mb-6 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div className="flex items-center gap-5">
                  <PortraitImage
  monster={currentMonster}
  size="large"
  fallbackIcon="user"
  frameImageUrl={getPortraitFrameImageUrl(currentMonster)}
/>

                  <div>
  <div className="text-xs uppercase tracking-[0.16em] text-[var(--dash-accent-2)]">
    Bestiario / Scheda mostro
  </div>

  <h2 className="mt-1 text-4xl font-semibold tracking-tight text-[var(--dash-text-strong)]">
    {currentMonster.name || 'Nuovo mostro'}
  </h2>

  <div className="mt-2 flex flex-wrap gap-2 text-xs">
    <span className="rounded-full border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-2 py-0.5 text-[var(--dash-text)]">
      {currentMonster.isCustom ? 'Custom' : 'Catalogo base'}
    </span>

    <span className="rounded-full border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-2 py-0.5 text-[var(--dash-text)]">
      Freschezza {Math.max(0, (currentMonster.maxFreschezza ?? 0) - (currentMonster.freschezza ?? 0))} / {currentMonster.maxFreschezza ?? '—'}
    </span>

    {((currentMonster.maxFreschezza ?? 0) > 0) && (
      <span className="rounded-full border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-2 py-0.5 text-[var(--dash-text)]">
        Audacia {currentMonster.audacia}
      </span>
    )}

    {currentMonster.adventureId && (
  <TagBadge tooltip="Avventura collegata">
    ◆ {adventures.find(adventure => adventure.id === currentMonster.adventureId)?.title ?? 'Avventura'}
  </TagBadge>
)}

{currentMonster.environmentId && (
  <button
    type="button"
    onClick={event => {
      event.preventDefault();
      event.stopPropagation();
      handleLinkedEntityNavigate({
        tabId: 'environments',
        entityId: currentMonster.environmentId ?? undefined,
        entityType: 'environment'
      });
    }}
    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--dash-accent)] bg-[var(--dash-panel)] px-2 py-0.5 text-xs font-semibold text-[var(--dash-text-strong)] shadow-sm shadow-[var(--dash-accent)]/20 transition-colors hover:border-[var(--dash-accent-2)] hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-accent-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dash-accent)]"
  >
    <MapPin className="h-3 w-3 text-current" />
    {getEnvironmentPath(currentMonster.environmentId) || 'Luogo'}
  </button>
)}

  </div>
</div>
</div>

                <div className="flex gap-2">
                  {isEditing ? (
  <>
    <HorrorButton
      type="button"
      onClick={() => void saveMonster()}
      disabled={!currentMonster.name.trim()}
      className="group px-3 py-2"
    >
      <Save className="h-4 w-4 group-hover:animate-[saveDiskInsert_0.7s_ease-in-out_infinite]" />
      Salva
    </HorrorButton>

    <HorrorButton
      type="button"
      variant="secondary"
      onClick={cancelEditing}
      className="group px-3 py-2"
    >
      <X className="h-4 w-4 group-hover:animate-[cancelWiggle_0.55s_ease-in-out_infinite]" />
      Annulla
    </HorrorButton>
  </>
) : (
  <>
    <HorrorButton
      type="button"
      variant="secondary"
      onClick={() => {
        if (!selectedMonster) return;

        setEditingMonster(selectedMonster);
        setIsEditing(true);
      }}
      className="group px-3 py-2"
    >
      <Edit2 className="h-4 w-4 group-hover:animate-[editWrite_0.65s_ease-in-out_infinite]" />
      Modifica
    </HorrorButton>

    <HorrorButton
      type="button"
      variant="danger"
      onClick={() => setMonsterToDelete(currentMonster)}
      className="group px-3 py-2"
    >
      <Trash2 className="h-4 w-4 group-hover:animate-[trashShake_0.55s_ease-in-out_infinite]" />
      Elimina
    </HorrorButton>
  </>
)}
                </div>
              </div>

              {isEditing ? (
                <div className="space-y-4">
                  <input
                    type="text"
                    value={currentMonster.name}
                    onChange={e =>
                      updateCurrentMonster({ ...currentMonster, name: e.target.value })
                    }
                    placeholder="Nome mostro"
                    className="w-full rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text)]"
                  />

                  {isEditing && !selectedMonster && (
  <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
    <div className="mb-3">
      <h3 className="text-[var(--dash-text)]">Crea da mostro base</h3>
      <p className="mt-1 text-xs text-[var(--dash-muted)]">
        Puoi partire da un mostro del catalogo e poi modificarlo liberamente.
      </p>
    </div>

    <div className="flex gap-2">
      <select
  key={editingMonster?.id ?? 'base-monster-selector'}
  value={baseMonsterIdToCreate}
  onChange={e => {
    const baseId = e.target.value;
    setBaseMonsterIdToCreate(baseId);

    if (!baseId) return;

    const baseMonster = createMonsterFromBase(baseId, activeCampaignId);
    if (!baseMonster) return;

    setEditingMonster({
      ...baseMonster,
      name: editingMonster?.name?.trim() || baseMonster.name
    });
  }}
  className="min-w-0 flex-1 rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-sm text-[var(--dash-text)]"
>
  <option value="">Seleziona mostro...</option>
  {MONSTER_BASE_CATALOG.map(monster => (
    <option key={monster.id} value={monster.id}>
      {monster.name}
    </option>
  ))}
</select>

      </div>
  </div>
)}

                  <div className="grid gap-2 rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-2 sm:grid-cols-4">
  {[
    { id: 'sheet', label: 'Scheda', icon: <Swords className="h-4 w-4" /> },
    { id: 'abilities', label: 'Capacità', icon: <Sparkles className="h-4 w-4" /> },
    { id: 'avatar', label: 'Avatar', icon: <User className="h-4 w-4" /> },
    { id: 'token', label: 'Token', icon: <CircleDot className="h-4 w-4" /> }
  ].map(tab => (
    <button
      key={tab.id}
      type="button"
      onClick={() => setEditTab(tab.id as typeof editTab)}
      className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm transition-colors ${
        editTab === tab.id
          ? 'bg-[var(--dash-accent)] text-[var(--dash-text-strong)] shadow-lg shadow-black/20'
          : 'text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)]'
      }`}
    >
      {tab.icon}
      {tab.label}
    </button>
  ))}
</div>

{editTab === 'avatar' && (
  <>
    <div className="grid gap-4 md:grid-cols-2">
  <div>
    <ImageEditor
      title="Portrait"
      imageUrl={currentMonster.portraitImageUrl ?? ''}
      onUrlChange={value =>
        updateCurrentMonster({
          ...currentMonster,
          portraitImageUrl: value
        })
      }
      onFileChange={e => handleImageFileUpload(e, 'portrait')}
      isUploading={isUploadingImage}
    />
  </div>

  <div>
    <label className="mb-2 block text-sm text-[var(--dash-text)]">
      Cornice portrait
    </label>

    <select
      value={currentMonster.portraitFrameAssetId === NO_FRAME_VALUE ? NO_FRAME_VALUE : currentMonster.portraitFrameAssetId ?? ''}
      onChange={e =>
        updateCurrentMonster({
          ...currentMonster,
          portraitFrameAssetId:
            e.target.value === NO_FRAME_VALUE
              ? NO_FRAME_VALUE
              : e.target.value || null
        })
      }
      className="w-full rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text)]"
    >
      <option value="">Default</option>
      <option value={NO_FRAME_VALUE}>Nessuna cornice</option>

      {visualAssets
        .filter(asset => asset.type === 'monster-portrait-frame')
        .map(asset => (
          <option key={asset.id} value={asset.id}>
            {asset.name}
          </option>
        ))}
    </select>

    <p className="mt-2 text-xs text-[var(--dash-muted)]">
      Default = prima Cornice Portrait Mostro caricata negli Asset Grafici.
    </p>


  </div>

  <ImageEditor
    title="Immagine mostro"
    imageUrl={currentMonster.coverImageUrl ?? ''}
    onUrlChange={value =>
      updateCurrentMonster({
        ...currentMonster,
        coverImageUrl: value
      })
    }
    onFileChange={e => handleImageFileUpload(e, 'cover')}
    isUploading={isUploadingImage}
  />

<div>
  <label className="mb-2 block text-sm text-[var(--dash-text)]">
    Cornice foto mostro
  </label>

  <select
    value={currentMonster.coverFrameAssetId === NO_FRAME_VALUE ? NO_FRAME_VALUE : currentMonster.coverFrameAssetId ?? ''}
    onChange={e =>
      updateCurrentMonster({
        ...currentMonster,
        coverFrameAssetId:
          e.target.value === NO_FRAME_VALUE
            ? NO_FRAME_VALUE
            : e.target.value || null
      })
    }
    className="w-full rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text)]"
  >
    <option value="">Default</option>
    <option value={NO_FRAME_VALUE}>Nessuna cornice</option>

    {visualAssets
      .filter(asset => asset.type === 'monster-frame')
      .map(asset => (
        <option key={asset.id} value={asset.id}>
          {asset.name}
        </option>
      ))}
  </select>

  <p className="mt-2 text-xs text-[var(--dash-muted)]">
    Default = Cornice Foto Mostro Default caricata negli Asset Grafici.
  </p>
</div>



    <div className="md:col-span-2 w-full rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-[var(--dash-text-strong)]">
            Cerchio portrait
          </div>
          <p className="mt-1 text-xs text-[var(--dash-muted)]">
            Colore personale del bordo portrait, utile per gruppi, condizioni o bonus/malus.
          </p>
        </div>

        <label className="flex items-center gap-2 text-xs text-[var(--dash-muted)]">
          <input
            type="checkbox"
            checked={currentMonster.portraitBorderVisible ?? true}
            onChange={event =>
              updateCurrentMonster({
                ...currentMonster,
                portraitBorderVisible: event.target.checked
              })
            }
            className="h-4 w-4 accent-[var(--dash-accent)]"
          />
          Visibile
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
        <input
          type="color"
          value={currentMonster.portraitBorderColor ?? DEFAULT_PORTRAIT_BORDER_COLOR}
          onChange={event =>
            updateCurrentMonster({
              ...currentMonster,
              portraitBorderColor: event.target.value
            })
          }
          className="h-10 w-14 cursor-pointer rounded border border-[var(--dash-border-soft)] bg-transparent p-1"
          aria-label="Colore cerchio portrait"
        />

        <input
          type="text"
          value={currentMonster.portraitBorderLabel ?? ''}
          onChange={event =>
            updateCurrentMonster({
              ...currentMonster,
              portraitBorderLabel: event.target.value
            })
          }
          placeholder="Nota facoltativa, es. Gruppo A, Malus, Stordito"
          className="rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-sm text-[var(--dash-text)] placeholder-[var(--dash-muted)]"
        />
      </div>

      <button
        type="button"
        onClick={() =>
          updateCurrentMonster({
            ...currentMonster,
            portraitBorderColor: DEFAULT_PORTRAIT_BORDER_COLOR,
            portraitBorderVisible: true,
            portraitBorderLabel: ''
          })
        }
        className="mt-3 rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] px-3 py-1.5 text-xs text-[var(--dash-text)] hover:bg-[var(--dash-surface-2)]"
      >
        Reset cerchio portrait
      </button>
    </div>
</div>

    {currentMonster.portraitImageUrl && (
      <MonsterPortraitFrame
      imageUrl={currentMonster.portraitImageUrl}
      name={currentMonster.name}
      crop={currentMonster.portraitCrop ?? DEFAULT_CROP}
      frameImageUrl={getPortraitFrameImageUrl(currentMonster)}
      frameRotationDegrees={currentMonster.portraitFrameRotationDegrees ?? 0}
      frameOffsetX={currentMonster.portraitFrameOffsetX ?? 0}
      frameOffsetY={currentMonster.portraitFrameOffsetY ?? 0}
      frameScaleX={currentMonster.portraitFrameScaleX ?? 1}
      frameScaleY={currentMonster.portraitFrameScaleY ?? 1}
      portraitBorderColor={currentMonster.portraitBorderColor ?? DEFAULT_PORTRAIT_BORDER_COLOR}
      portraitBorderVisible={currentMonster.portraitBorderVisible ?? true}
      portraitBorderLabel={currentMonster.portraitBorderLabel ?? ''}
      portraitRotationDegrees={currentMonster.portraitRotationDegrees ?? 0}
      isEditing={true}
      onCropChange={updatePortraitCrop}
      onScaleChange={updatePortraitScale}
      onRotateFrameDegrees={rotatePortraitFrameDegrees}
      onFrameTransformChange={patch =>
        updateCurrentMonster({
          ...currentMonster,
          ...patch
        })
      }
      onResetFrameTransform={() =>
        updateCurrentMonster({
          ...currentMonster,
          portraitFrameOffsetX: 0,
          portraitFrameOffsetY: 0,
          portraitFrameScaleX: 1,
          portraitFrameScaleY: 1,
          portraitFrameRotationDegrees: 0
        })
      }
      onRotateImageDegrees={rotatePortraitImageDegrees}
      onReset={resetPortraitCrop}
      />
    )}

    {currentMonster.coverImageUrl && (
      <MonsterCoverFrame
      imageUrl={currentMonster.coverImageUrl}
      name={currentMonster.name}
      scale={currentMonster.coverImageScale ?? 1}
      crop={currentMonster.coverCrop ?? DEFAULT_CROP}
      frameImageUrl={getCoverFrameImageUrl(currentMonster)}
      frameRotation={currentMonster.frameRotation ?? 0}
      frameRotationDegrees={currentMonster.frameRotationDegrees ?? 0}
      frameOffsetX={currentMonster.coverFrameOffsetX ?? 0}
      frameOffsetY={currentMonster.coverFrameOffsetY ?? 0}
      frameScaleX={currentMonster.coverFrameScaleX ?? 1}
      frameScaleY={currentMonster.coverFrameScaleY ?? 1}
      coverRotationDegrees={currentMonster.coverRotationDegrees ?? 0}
      isEditing={true}
      onCropChange={updateCoverCrop}
      onScaleChange={updateCoverScale}
      onToggleFrameRotation={toggleFrameRotation}
      onRotateFrameDegrees={rotateFrameDegrees}
      onFrameTransformChange={patch =>
        updateCurrentMonster({
          ...currentMonster,
          ...patch
        })
      }
      onResetFrameTransform={() =>
        updateCurrentMonster({
          ...currentMonster,
          coverFrameOffsetX: 0,
          coverFrameOffsetY: 0,
          coverFrameScaleX: 1,
          coverFrameScaleY: 1,
          frameRotationDegrees: 0
        })
      }
      onRotateImageDegrees={rotateCoverImageDegrees}
      onReset={resetCoverImageAndFrame}
     />
    )}
  </>
)}


{editTab === 'token' && (
  <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
    <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-5">
      <h3 className="mb-2 flex items-center gap-2 text-lg font-semibold text-[var(--dash-text-strong)]">
        <CircleDot className="h-5 w-5 text-[var(--dash-accent-2)]" />
        Token mappa
      </h3>
      <p className="text-sm text-[var(--dash-muted)]">
        Prima bozza del Token Studio: qui confluiranno forma, sfondo, bordo, zoom, posizione e rotazione del token.
      </p>

      <div className="mt-6 flex justify-center">
        <div
          className="relative flex h-56 w-56 items-center justify-center overflow-hidden rounded-full border-4 bg-[var(--dash-input)] shadow-2xl shadow-black/30"
          style={{ borderColor: currentMonster.portraitBorderColor ?? DEFAULT_PORTRAIT_BORDER_COLOR }}
        >
          {currentMonster.portraitImageUrl ? (
            <img
              src={currentMonster.portraitImageUrl}
              alt={currentMonster.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <User className="h-20 w-20 text-[var(--dash-muted)]" />
          )}
        </div>
      </div>
    </div>

    <div className="space-y-4">
      <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-5">
        <h4 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-[var(--dash-accent-2)]">
          Bordo token
        </h4>
        <div className="grid grid-cols-7 gap-2">
          {['#f5a623', '#7c3aed', '#2563eb', '#06b6d4', '#22c55e', '#ef4444', '#e5e7eb'].map(color => (
            <button
              key={color}
              type="button"
              onClick={() =>
                updateCurrentMonster({
                  ...currentMonster,
                  portraitBorderColor: color,
                  portraitBorderVisible: true
                })
              }
              className="h-8 w-8 rounded-full border-2 border-white/20"
              style={{ backgroundColor: color }}
              aria-label={`Colore token ${color}`}
            />
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-5">
        <h4 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-[var(--dash-accent-2)]">
          Prossimi controlli
        </h4>
        <div className="space-y-2 text-sm text-[var(--dash-muted)]">
          <div className="rounded-xl bg-[var(--dash-input)] px-3 py-2">Forma token: cerchio, quadrato, esagono...</div>
          <div className="rounded-xl bg-[var(--dash-input)] px-3 py-2">Sfondo token</div>
          <div className="rounded-xl bg-[var(--dash-input)] px-3 py-2">Posizione immagine 3×3</div>
          <div className="rounded-xl bg-[var(--dash-input)] px-3 py-2">Zoom e rotazione</div>
        </div>
      </div>
    </div>
  </div>
)}

{editTab === 'sheet' && (
  <>
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <label className="mb-2 block text-sm text-[var(--dash-text)]">
          Ambito narrativo
        </label>

        <select
          value={currentMonster.adventureId ?? ''}
          onChange={e =>
            updateCurrentMonster({
              ...currentMonster,
              campaignId: activeCampaignId,
              adventureId: e.target.value || null,
              environmentId: null
            })
          }
          className="w-full rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text)]"
        >
          <option value="">Tutta la campagna</option>
          {adventures
            .filter(adventure => adventure.campaignId === activeCampaignId)
            .map(adventure => (
              <option key={adventure.id} value={adventure.id}>
                {adventure.title}
              </option>
            ))}
        </select>
      </div>

      <div>
        <label className="mb-2 block text-sm text-[var(--dash-text)]">
          Luogo
        </label>

        <select
          value={currentMonster.environmentId ?? ''}
          onChange={e =>
            updateCurrentMonster({
              ...currentMonster,
              environmentId: e.target.value || null
            })
          }
          className="w-full rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text)]"
        >
          <option value="">Nessun Luogo</option>
          {sortedEnvironmentOptions
            .filter(environment =>
              !currentMonster.adventureId ||
              environment.adventureId == null ||
              environment.adventureId === currentMonster.adventureId
            )
            .map(environment => (
              <option key={environment.id} value={environment.id}>
                {getEnvironmentPath(environment.id)}
              </option>
            ))}
        </select>
      </div>
    </div>


    <textarea
      value={currentMonster.description}
      onChange={e =>
        updateCurrentMonster({ ...currentMonster, description: e.target.value })
      }
      placeholder="Descrizione"
      className="h-24 w-full resize-none rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text)]"
    />

    <div className="grid gap-3 xl:grid-cols-3">
      <div className="min-h-[170px] rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
        <div className="mb-8 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--dash-accent-2)]">
          ✦ Freschezza massima
        </div>

        <FreschezzaMaxEditor monster={currentMonster} onUpdate={updateCurrentMonster} />
      </div>

      <div className="min-h-[170px] rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
        <div className="mb-6 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--dash-accent-2)]">
          ✦ Freschezza {Math.max(0, (currentMonster.maxFreschezza ?? 0) - (currentMonster.freschezza ?? 0))} / {currentMonster.maxFreschezza ?? 0}
        </div>

        {(currentMonster.maxFreschezza ?? 0) > 0 ? (
          <div>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: Math.max(0, currentMonster.maxFreschezza ?? 0) }, (_, index) => index + 1).map(box => {
                const isCritical = getMonsterCriticalBoxes(currentMonster).includes(box);

                return (
                  <button
                    key={box}
                    type="button"
                    onDoubleClick={() => {
                      const criticalBoxes = isCritical
                        ? getMonsterCriticalBoxes(currentMonster).filter(item => item !== box)
                        : [...getMonsterCriticalBoxes(currentMonster), box].sort((a, b) => a - b);

                      updateCurrentMonster({
                        ...currentMonster,
                        caselleFreschezzaCritiche: criticalBoxes
                      });
                    }}
                    className={`flex h-10 w-10 items-center justify-center rounded-lg border text-sm transition-colors ${
                      isCritical
                        ? 'border-[var(--dash-accent)] bg-[var(--dash-accent)] text-[var(--dash-text-strong)]'
                        : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] text-[var(--dash-text)] hover:border-[var(--dash-accent)]'
                    }`}
                    title="Doppio click per marcare o rimuovere come Casella Critica"
                  >
                    {box}
                  </button>
                );
              })}
            </div>

            <p className="mt-4 text-[11px] text-[var(--dash-muted)]">
              Doppio click su una casella per marcarla o rimuoverla come Casella Critica.
            </p>
          </div>
        ) : (
          <p className="text-sm text-[var(--dash-muted)]">
            Imposta prima la Freschezza massima.
          </p>
        )}
      </div>

      <div className="relative min-h-[170px] rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
        <div className="mb-6 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--dash-accent-2)]">
          ✦ Audacia
        </div>

        <span className="absolute right-4 top-4 flex h-11 min-w-11 items-center justify-center rounded-full border border-[var(--dash-accent)] bg-[var(--dash-surface-2)] px-3 text-lg font-semibold text-[var(--dash-text-strong)]">
          {currentMonster.audacia}
        </span>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() =>
              updateCurrentMonster({
                ...currentMonster,
                audacia: clampMonsterAudacia(currentMonster, currentMonster.audacia - 1)
              })
            }
            className="rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-3 py-2 text-sm text-[var(--dash-text-strong)] hover:bg-[var(--dash-surface-2)]"
          >
            -1
          </button>

          <button
            type="button"
            onClick={() =>
              updateCurrentMonster({
                ...currentMonster,
                audacia: clampMonsterAudacia(currentMonster, currentMonster.audacia + 1)
              })
            }
            className="rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-3 py-2 text-sm text-[var(--dash-text-strong)] hover:bg-[var(--dash-surface-2)]"
          >
            +1
          </button>
        </div>

      </div>
    </div>

    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div>
        <label className="mb-2 block text-sm text-[var(--dash-text)]">
          Attacco
        </label>

        <select
          value={currentMonster.attacco}
          onChange={e =>
            updateCurrentMonster({
              ...currentMonster,
              attacco: e.target.value as Difficulty
            })
          }
          className="w-full rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text)]"
        >
          {DIFFICULTY_OPTIONS.map(option => (
            <option key={option} value={option}>
              {option || 'Attacco non definito'}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-2 block text-sm text-[var(--dash-text)]">
          Difesa
        </label>

        <select
          value={currentMonster.difesa}
          onChange={e =>
            updateCurrentMonster({
              ...currentMonster,
              difesa: e.target.value as Difficulty
            })
          }
          className="w-full rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text)]"
        >
          {DIFFICULTY_OPTIONS.map(option => (
            <option key={option} value={option}>
              {option || 'Difesa non definita'}
            </option>
          ))}
        </select>
      </div>
    </div>

    <textarea
      value={currentMonster.puntoDebole}
      onChange={e =>
        updateCurrentMonster({ ...currentMonster, puntoDebole: e.target.value })
      }
      placeholder="Punto debole"
      className="h-24 w-full resize-none rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text)]"
    />

    <textarea
      value={currentMonster.notes}
      onChange={e =>
        updateCurrentMonster({ ...currentMonster, notes: e.target.value })
      }
      placeholder="Note GM"
      className="h-24 w-full resize-none rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text)]"
    />
  </>
)}
                  {editTab === 'abilities' && (
  <>
    <CatalogSelectionBlock
      title="Tratti"
      items={MONSTER_TRAITS_CATALOG}
      selectedIds={currentMonster.traitIds}
      onToggle={toggleTrait}
      extraContent={(item, selected) =>
        item.id === TERRIFYING_TRAIT_ID && selected ? (
          <select
            value={currentMonster.tiroFollia ?? 'Base'}
            onClick={event => event.stopPropagation()}
            onKeyDown={event => event.stopPropagation()}
            onChange={event => {
              event.stopPropagation();
              updateCurrentMonster({
                ...currentMonster,
                tiroFollia: event.target.value as Difficulty
              });
            }}
            className="mt-3 h-8 w-full max-w-[220px] rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-input)] px-2 text-xs font-medium text-[var(--dash-text)] outline-none transition-colors focus:border-[var(--dash-accent)]"
            aria-label="Difficoltà Tiro Follia"
          >
            {FOLLIA_DIFFICULTY_OPTIONS.map(option => (
              <option key={option} value={option}>
                Tiro Follia {option}
              </option>
            ))}
          </select>
        ) : null
      }
    />

    <CustomEntriesEditor
      title="Tratti personalizzati"
      items={currentMonster.customTraits}
      onAdd={addCustomTrait}
      onUpdate={updateCustomTrait}
      onRemove={removeCustomTrait}
    />

    <CatalogSelectionBlock
      title="Azioni speciali"
      items={MONSTER_SPECIAL_ACTIONS_CATALOG}
      selectedIds={currentMonster.specialActionIds}
      onToggle={toggleSpecialAction}
    />

    <CustomEntriesEditor
      title="Azioni speciali personalizzate"
      items={currentMonster.customSpecialActions}
      onAdd={addCustomSpecialAction}
      onUpdate={updateCustomSpecialAction}
      onRemove={removeCustomSpecialAction}
    />
  </>
)}

                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                    <h3 className="mb-3 flex items-center gap-2 text-[var(--dash-text)]">
                      <MapPin className="h-4 w-4 text-[var(--dash-accent-2)]" />
                      Collocazione
                    </h3>

                    <div className="grid gap-3 md:grid-cols-3">
                      <Info
                        label="Ambito"
                        value={
                          currentMonster.adventureId
                            ? adventures.find(adventure => adventure.id === currentMonster.adventureId)?.title ?? 'Avventura non trovata'
                            : 'Tutta la campagna'
                        }
                      />

                      <Info
                        label="Luogo"
                        value={
                          currentMonster.environmentId
                            ? getEnvironmentPath(currentMonster.environmentId) || 'Luogo non trovato'
                            : '—'
                        }
                      />
                    </div>
                  </div>

                  {(currentMonster.maxFreschezza ?? 0) > 0 && (
                    <FreschezzaBoxesEditor
                      current={currentMonster.freschezza ?? 0}
                      max={currentMonster.maxFreschezza ?? 0}
                      criticalBoxes={getMonsterCriticalBoxes(currentMonster)}
                      hasCriticalBoxes={(currentMonster.maxFreschezza ?? 0) > 0}
                      allowCriticalEditing={false}
                      allowFreshnessEditing={true}
                      onUpdate={({ current, criticalBoxes }) => {
                        const nextMonster = {
                          ...currentMonster,
                          caselleFreschezzaCritiche: criticalBoxes
                        };
                        const audaciaGain = calculateAudaciaGainFromFreshnessChange(
                          nextMonster,
                          currentMonster.freschezza ?? 0,
                          current
                        );

                        updateMonster({
                          ...nextMonster,
                          freschezza: current,
                          audacia: clampMonsterAudacia(nextMonster, nextMonster.audacia + audaciaGain)
                        });
                      }}
                    />
                  )}


                  {((currentMonster.maxFreschezza ?? 0) > 0) && (
                    <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-[var(--dash-text)]">Audacia</h3>
                          <p className="mt-1 text-xs text-[var(--dash-muted)]">
                            Spendere 1 punto Audacia ti permette di lanciare un'Azione Speciale (se in possesso).
                          </p>
                        </div>

                        <div className="rounded-full border border-[var(--dash-accent)] bg-[var(--dash-input)] px-3 py-1 text-sm text-[var(--dash-text-strong)]">
                          {currentMonster.audacia}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={spendMonsterAudacia}
                        disabled={(currentMonster.audacia ?? 0) <= 0}
                        className="mt-3 rounded-md border border-[var(--dash-accent)] bg-[var(--dash-accent)] px-3 py-2 text-sm text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-accent-2)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Spendi 1 Audacia
                      </button>
                    </div>
                  )}

                  <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <Info icon={<Swords className="h-4 w-4" />} label="Attacco" value={currentMonster.attacco || '—'} />
                      <Info icon={<Shield className="h-4 w-4" />} label="Difesa" value={currentMonster.difesa || '—'} />
                    </div>
                  </div>

                  {currentMonster.description && (
                    <InfoBlock title="Descrizione" value={currentMonster.description} />
                  )}

                  <TagsBlock
                    title="Tratti"
                    officialItems={currentMonster.traitIds
                      .map(traitId => {
                        const item = findTrait(traitId);

                        if (!item) return null;

                        return {
                          id: item.id,
                          name: getMonsterTraitDisplayName(currentMonster, traitId),
                          description: item.description
                        };
                      })
                      .filter(Boolean)}
                    customItems={currentMonster.customTraits}
                  />

                  <TagsBlock
                    title="Azioni Speciali"
                    officialItems={currentMonster.specialActionIds
                      .map(findSpecialAction)
                      .filter(Boolean)
                      .map(item => ({
                        id: item!.id,
                        name: item!.name,
                        description: item!.description
                      }))}
                    customItems={currentMonster.customSpecialActions}
                  />

                  {currentMonster.puntoDebole && (
                    <InfoBlock title="Punto debole" value={currentMonster.puntoDebole} danger />
                  )}

                  {currentMonster.notes && (
                    <InfoBlock title="Note GM" value={currentMonster.notes} />
                  )}

                  {currentMonster.coverImageUrl && (
                    <MonsterCoverFrame
                    imageUrl={currentMonster.coverImageUrl}
                    name={currentMonster.name}
                    scale={currentMonster.coverImageScale ?? 1}
                    crop={currentMonster.coverCrop ?? DEFAULT_CROP}
                    frameImageUrl={getCoverFrameImageUrl(currentMonster)}
                    frameRotation={currentMonster.frameRotation ?? 0}
                    frameRotationDegrees={currentMonster.frameRotationDegrees ?? 0}
                    frameOffsetX={currentMonster.coverFrameOffsetX ?? 0}
                    frameOffsetY={currentMonster.coverFrameOffsetY ?? 0}
                    frameScaleX={currentMonster.coverFrameScaleX ?? 1}
                    frameScaleY={currentMonster.coverFrameScaleY ?? 1}
                    coverRotationDegrees={currentMonster.coverRotationDegrees ?? 0}
                    isEditing={false}
                    />
                  )}
                </div>
              )}
            </div>
              </div>
          </HorrorCard>
          </div>
        ) : (
          <div className="rounded-3xl border border-[var(--dash-border-soft)] bg-[linear-gradient(135deg,var(--dash-surface),var(--dash-panel))] p-12 text-center shadow-2xl shadow-black/20">
            <Swords className="mx-auto mb-4 h-16 w-16 text-[var(--dash-border)]" />
            <h3 className="text-lg font-semibold text-[var(--dash-text-strong)]">
              Nessuna scheda aperta
            </h3>
            <p className="mt-2 text-[var(--dash-muted)]">
              Seleziona un mostro dalla lista
            </p>
          </div>
        )}
      </div>
      </div>
      </div>

      {monsterToDelete && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--dash-danger-border)] bg-[var(--dash-surface)] p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-[var(--dash-text-strong)]">
              Eliminare mostro?
            </h3>

            <p className="mt-3 text-sm text-[var(--dash-muted)]">
              Vuoi eliminare definitivamente "{monsterToDelete.name || 'Mostro senza nome'}"? Questa azione non può essere annullata.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setMonsterToDelete(null)}
                className="group flex items-center gap-2 rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-4 py-2 text-sm text-[var(--dash-text-strong)] hover:bg-[var(--dash-surface-2)]"
              >
                <X className="h-4 w-4 group-hover:animate-[cancelWiggle_0.55s_ease-in-out_infinite]" />
                Annulla
              </button>

              <button
                type="button"
                onClick={() => void confirmDeleteMonster()}
                className="group flex items-center gap-2 rounded-lg border border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)] px-4 py-2 text-sm text-[var(--dash-danger-text)] hover:bg-[var(--dash-danger-hover)]"
              >
                <Trash2 className="h-4 w-4 group-hover:animate-[trashShake_0.55s_ease-in-out_infinite]" />
                Elimina
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
