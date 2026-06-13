import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Bookmark,
  Plus,
  Edit2,
  Trash2,
  Eye,
  ChevronDown,
  ChevronRight,
  Map as MapIcon,
  Building2,
  DoorOpen,
  MapPin,
  CircleDot,
  Save,
  X,
  BookOpen,
  GraduationCap,
  Shield,
  Cross,
  Landmark,
  Trees,
  Mountain,
  FlaskConical,
  TriangleAlert,
  KeyRound,
  Flame,
  Skull,
  Home,
  School,
  Library,
  Warehouse,
  Factory,
  Castle,
  Church,
  Hospital,
  Store,
  Hotel,
  Tent,
  Waves,
  Droplets,
  Snowflake,
  Leaf,
  Flower,
  CloudFog,
  Moon,
  Sun,
  Star,
  Sparkles,
  EyeOff,
  Lock,
  UnlockKeyhole,
  Search,
  Scroll,
  FileText,
  Gem,
  Pickaxe,
  Hammer,
  Wrench,
  Car,
  Train,
  Ship,
  Plane,
  Anchor,
  Flag,
  Compass,
  Route,
  Signpost,
  Footprints,
  DoorClosed,
  Bug,
  Ghost,
  Radiation,
  Biohazard,
  Siren,
  Bomb,
  HeartPulse,
  Pill,
  Syringe,
  TestTube,
  Microscope,
  Radio,
  Camera,
  Phone,
  Mail,
  MessageCircle,
  Users,
  UserRound,
  Crown,
  Scale,
  Gavel,
  Briefcase,
  Coins,
  Music,
  Drama,
  Theater,
  Dice6,
  Target,
  Crosshair
} from 'lucide-react';
import { useCampaignEntitySelection } from '../../../hooks/useCampaignEntitySelection';
import type { Adventure } from '../../../types/adventure';
import { HorrorButton } from '../ui/HorrorButton';
import {
  loadEnvironments,
  saveEnvironment as saveEnvironmentToStorage,
  deleteEnvironment as deleteEnvironmentFromStorage
} from '../../../services/supabase/entitiesService';
import { DEFAULT_CAMPAIGN_ID } from '../../../config/campaign.config';
import { generateUUID } from '../../../lib/uuid';
import { CAMPAIGN_STORAGE_KEYS } from '../../../services/campaign/campaignStorageKeys';

interface Environment {
  id: string;
  campaignId: string;
  adventureId?: string | null;
  parentLocationId?: string | null;
  mapLocationId?: string | null;
  locationType?: 'area' | 'building' | 'room' | 'poi' | 'other';
  name: string;
  description: string;
  iconId?: string | null;
  atmosphere: string;
  exitPoints: string;
  hiddenDetails: string;
  npcsPresent: string[];
  sortOrder?: number;
}

const ADVENTURES_STORAGE_KEY = CAMPAIGN_STORAGE_KEYS.adventures;

const LOCATION_TYPE_OPTIONS: Array<{
  value: NonNullable<Environment['locationType']>;
  label: string;
}> = [
  { value: 'area', label: 'Area' },
  { value: 'building', label: 'Edificio' },
  { value: 'room', label: 'Stanza' },
  { value: 'poi', label: 'Punto di interesse' },
  { value: 'other', label: 'Altro' }
];

function normalizeEnvironment(item: Partial<Environment>): Environment {
  return {
    id: item.id ?? generateUUID(),
    campaignId: item.campaignId ?? DEFAULT_CAMPAIGN_ID,
    adventureId: item.adventureId ?? null,
    parentLocationId: item.parentLocationId ?? null,
    mapLocationId: item.mapLocationId ?? null,
    locationType: item.locationType ?? 'other',
    name: item.name ?? 'Luogo senza nome',
    description: item.description ?? '',
    iconId: item.iconId ?? null,
    atmosphere: item.atmosphere ?? '',
    exitPoints: item.exitPoints ?? '',
    hiddenDetails: item.hiddenDetails ?? '',
    npcsPresent: item.npcsPresent ?? [],
    sortOrder: item.sortOrder ?? 0
  };
}

export interface EnvironmentManagerProps {
  campaignId?: string;
  storageRefreshKey?: number;
  navigationTarget?: {
    tabId: string;
    entityId?: string;
    entityType?: string;
  } | null;
  onNavigate?: (target: {
    tabId: string;
    entityId?: string;
    entityType?: string;
  }) => void;
}

const LOCATION_ICON_OPTIONS = [
  { id: 'map-pin', label: 'Punto mappa', icon: MapPin },
  { id: 'map', label: 'Mappa', icon: MapIcon },
  { id: 'compass', label: 'Bussola', icon: Compass },
  { id: 'route', label: 'Percorso', icon: Route },
  { id: 'signpost', label: 'Cartello', icon: Signpost },
  { id: 'flag', label: 'Bandiera', icon: Flag },

  { id: 'building', label: 'Edificio', icon: Building2 },
  { id: 'home', label: 'Casa', icon: Home },
  { id: 'school', label: 'Scuola', icon: School },
  { id: 'graduation', label: 'Accademia', icon: GraduationCap },
  { id: 'library', label: 'Biblioteca', icon: BookOpen },
  { id: 'store', label: 'Negozio', icon: Store },
  { id: 'hotel', label: 'Albergo', icon: Hotel },
  { id: 'warehouse', label: 'Magazzino', icon: Warehouse },
  { id: 'factory', label: 'Fabbrica', icon: Factory },
  { id: 'castle', label: 'Castello', icon: Castle },
  { id: 'church', label: 'Chiesa', icon: Church },
  { id: 'landmark', label: 'Istituzione', icon: Landmark },
  { id: 'hospital', label: 'Ospedale', icon: Hospital },
  { id: 'door-open', label: 'Porta aperta', icon: DoorOpen },
  { id: 'door-closed', label: 'Porta chiusa', icon: DoorClosed },
  
  { id: 'trees', label: 'Bosco', icon: Trees },
  { id: 'mountain', label: 'Montagna', icon: Mountain },
  { id: 'tent', label: 'Accampamento', icon: Tent },
  { id: 'waves', label: 'Acqua', icon: Waves },
  { id: 'droplets', label: 'Gocce', icon: Droplets },
  { id: 'snowflake', label: 'Gelo', icon: Snowflake },
  { id: 'leaf', label: 'Natura', icon: Leaf },
  { id: 'flower', label: 'Fiore', icon: Flower },
  { id: 'fog', label: 'Nebbia', icon: CloudFog },
  { id: 'sun', label: 'Sole', icon: Sun },
  { id: 'moon', label: 'Luna', icon: Moon },
  { id: 'star', label: 'Stella', icon: Star },
  { id: 'sparkles', label: 'Magia', icon: Sparkles },

  { id: 'eye', label: 'Occhio', icon: Eye },
  { id: 'eye-off', label: 'Nascosto', icon: EyeOff },
  { id: 'lock', label: 'Bloccato', icon: Lock },
  { id: 'key', label: 'Chiave', icon: KeyRound },
  { id: 'search', label: 'Ricerca', icon: Search },
  { id: 'scroll', label: 'Pergamena', icon: Scroll },
  { id: 'file', label: 'Documento', icon: FileText },
  { id: 'gem', label: 'Cristallo', icon: Gem },

  { id: 'skull', label: 'Teschio', icon: Skull },
  { id: 'ghost', label: 'Fantasma', icon: Ghost },
  { id: 'bug', label: 'Insetto', icon: Bug },
  { id: 'radiation', label: 'Radiazione', icon: Radiation },
  { id: 'biohazard', label: 'Biohazard', icon: Biohazard },
  { id: 'alert', label: 'Pericolo', icon: TriangleAlert },
  { id: 'siren', label: 'Allarme', icon: Siren },
  { id: 'bomb', label: 'Bomba', icon: Bomb },
  { id: 'flame', label: 'Fuoco/Rituale', icon: Flame },

  { id: 'flask', label: 'Laboratorio', icon: FlaskConical },
  { id: 'test-tube', label: 'Provetta', icon: TestTube },
  { id: 'microscope', label: 'Microscopio', icon: Microscope },
  { id: 'pill', label: 'Pillole', icon: Pill },
  { id: 'syringe', label: 'Siringa', icon: Syringe },
  { id: 'heart-pulse', label: 'Medico', icon: HeartPulse },
  { id: 'cross', label: 'Croce', icon: Cross },

  { id: 'hammer', label: 'Martello', icon: Hammer },
  { id: 'wrench', label: 'Attrezzi', icon: Wrench },
  { id: 'pickaxe', label: 'Miniera', icon: Pickaxe },
  { id: 'briefcase', label: 'Ufficio', icon: Briefcase },
  { id: 'coins', label: 'Denaro', icon: Coins },

  { id: 'car', label: 'Auto', icon: Car },
  { id: 'train', label: 'Treno', icon: Train },
  { id: 'ship', label: 'Nave', icon: Ship },
  { id: 'plane', label: 'Aereo', icon: Plane },
  { id: 'anchor', label: 'Porto', icon: Anchor },
  { id: 'footprints', label: 'Tracce', icon: Footprints },

  { id: 'radio', label: 'Radio', icon: Radio },
  { id: 'camera', label: 'Camera', icon: Camera },
  { id: 'phone', label: 'Telefono', icon: Phone },
  { id: 'mail', label: 'Lettera', icon: Mail },
  { id: 'message', label: 'Messaggio', icon: MessageCircle },

  { id: 'users', label: 'Gruppo', icon: Users },
  { id: 'user', label: 'Persona', icon: UserRound },
  { id: 'crown', label: 'Autorità', icon: Crown },
  { id: 'scale', label: 'Giustizia', icon: Scale },
  { id: 'gavel', label: 'Tribunale', icon: Gavel },
  { id: 'shield', label: 'Protezione/Polizia', icon: Shield },

  { id: 'music', label: 'Musica', icon: Music },
  { id: 'drama', label: 'Teatro', icon: Drama },
  { id: 'theater', label: 'Maschera', icon: Theater },
  { id: 'dice', label: 'Dadi', icon: Dice6 },
  { id: 'target', label: 'Obiettivo', icon: Target },
  { id: 'crosshair', label: 'Bersaglio', icon: Crosshair }
] as const;

export function EnvironmentManager({
  campaignId = DEFAULT_CAMPAIGN_ID,
  storageRefreshKey = 0,
  navigationTarget = null,
  onNavigate
}: EnvironmentManagerProps) {
  const [environments, setEnvironmentsLocal] = useState<Environment[]>([]);

  const [isLoadingFromSupabase, setIsLoadingFromSupabase] = useState(true);
  const [adventures, setAdventures] = useState<Adventure[]>([]);

  useEffect(() => {
    async function loadFromSupabase() {
      try {
        const loadedEnvironments = await loadEnvironments(campaignId);

        const normalizedEnvironments = loadedEnvironments.map((env: any) =>
          normalizeEnvironment(env)
          );

        setEnvironmentsLocal(normalizedEnvironments);
        console.log('Ambienti caricati da storage:', normalizedEnvironments);
      } catch (error) {
        console.error('Errore caricamento ambienti da Supabase:', error);
      } finally {
        setIsLoadingFromSupabase(false);
      }
    }

    loadFromSupabase();
    }, [campaignId, storageRefreshKey]);

  const syncEnvironment = async (environment: Environment) => {
    if (isLoadingFromSupabase) return;

    try {
      // Passa l'intero oggetto - il servizio si occupa del mapping automatico
      await saveEnvironmentToStorage(campaignId, environment);
    } catch (error) {
      console.error('Errore salvataggio ambiente su Supabase:', error, environment);
    }
  };

useEffect(() => {
  const loadAdventures = () => {
    if (typeof window === 'undefined') return;

    try {
      const saved = window.localStorage.getItem(ADVENTURES_STORAGE_KEY);
      if (!saved) {
        setAdventures([]);
        return;
      }

      const parsed = JSON.parse(saved);
      setAdventures(Array.isArray(parsed) ? parsed : []);
    } catch {
      setAdventures([]);
    }
  };

  loadAdventures();

  window.addEventListener('focus', loadAdventures);
  window.addEventListener('storage', loadAdventures);

  return () => {
    window.removeEventListener('focus', loadAdventures);
    window.removeEventListener('storage', loadAdventures);
  };
}, [campaignId]);

  const {
    selectedItem: selectedEnv,
    selectItem: setSelectedEnv,
    clearSelection
  } = useCampaignEntitySelection(environments);

  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
  const [locationIdPendingDelete, setLocationIdPendingDelete] = useState<string | null>(null);
  const [pendingEnvironmentSelection, setPendingEnvironmentSelection] = useState<Environment | null>(null);
  const [showUnsavedChangesDialog, setShowUnsavedChangesDialog] = useState(false);
  const locationPendingDelete =
  environments.find(env => env.id === locationIdPendingDelete) ?? null;
  const childLocationsOfPendingDelete = locationPendingDelete
  ? environments.filter(
      env => env.parentLocationId === locationPendingDelete.id
    )
  : [];

  const childLocationCount = childLocationsOfPendingDelete.length;
  const [draftEnvironment, setDraftEnvironment] = useState<Environment | null>(
    null
  );
  const [collapsedLocationIds, setCollapsedLocationIds] = useState<Set<string>>(
    () => new Set()
  );
  type DropPosition = 'before' | 'inside' | 'after';

  const hasUnsavedEnvironmentChanges = () => {
  if (!isEditing || !draftEnvironment) {
    return false;
  }

  if (isCreating) {
    return Boolean(
      draftEnvironment.name.trim() ||
      draftEnvironment.description.trim() ||
      draftEnvironment.atmosphere.trim() ||
      draftEnvironment.exitPoints.trim() ||
      draftEnvironment.hiddenDetails.trim()
    );
  }

  if (!selectedEnv) {
    return false;
  }

  return JSON.stringify(draftEnvironment) !== JSON.stringify(selectedEnv);
};

  const handleSelectEnvironment = (env: Environment) => {
  if (hasUnsavedEnvironmentChanges()) {
    setPendingEnvironmentSelection(env);
    setShowUnsavedChangesDialog(true);
    return;
  }

  setSelectedEnv(env);
  setDraftEnvironment(null);
  setIsCreating(false);
  setIsEditing(false);
  };

const [draggedLocationId, setDraggedLocationId] = useState<string | null>(null);
const [dropTarget, setDropTarget] = useState<{
  id: string;
  position: DropPosition;
} | null>(null);

  useEffect(() => {
    if (navigationTarget?.tabId !== 'environments') return;
    if (navigationTarget.entityType !== 'environment') return;
    if (!navigationTarget.entityId) return;

    const environmentToSelect = environments.find(
      environment => environment.id === navigationTarget.entityId
    );

    if (!environmentToSelect) return;

    setSelectedEnv(environmentToSelect);
    setDraftEnvironment(null);
    setIsCreating(false);
    setIsEditing(false);
  }, [navigationTarget, environments, setSelectedEnv]);

  const currentEnv = isEditing ? draftEnvironment : selectedEnv;

  const getLocationTypeIcon = (type: Environment['locationType']) => {
    switch (type) {
      case 'area':
        return <MapIcon className="h-4 w-4 text-[var(--dash-accent-2)]" />;
      case 'building':
        return <Building2 className="h-4 w-4 text-[var(--dash-accent-2)]" />;
      case 'room':
        return <DoorOpen className="h-4 w-4 text-[var(--dash-accent-2)]" />;
      case 'poi':
        return <MapPin className="h-4 w-4 text-[var(--dash-accent-2)]" />;
      default:
        return <CircleDot className="h-4 w-4 text-[var(--dash-accent-2)]" />;
    }
  };

  const getLocationIcon = (
  iconId: string | null | undefined,
  type: Environment['locationType']
) => {
  const option = LOCATION_ICON_OPTIONS.find(item => item.id === iconId);

  if (option) {
    const Icon = option.icon;
    return <Icon className="h-4 w-4 text-[var(--dash-accent-2)]" />;
  }

  return getLocationTypeIcon(type);
};

  const getLocationTypeLabel = (type: Environment['locationType']) => {
    return (
      LOCATION_TYPE_OPTIONS.find(option => option.value === type)?.label ??
      'Altro'
    );
  };

  const toggleLocationCollapse = (id: string) => {
    setCollapsedLocationIds(prev => {
      const next = new Set(prev);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  };

  const addEnvironment = () => {
    const newEnv: Environment = {
      id: generateUUID(),
      campaignId,
      adventureId: null,
      parentLocationId: null,
      mapLocationId: null,
      locationType: 'other',
      iconId: 'map-pin',
      name: '',
      description: '',
      atmosphere: '',
      exitPoints: '',
      hiddenDetails: '',
      npcsPresent: [],
      sortOrder: environments.length
    };

    setDraftEnvironment(newEnv);
    clearSelection();
    setIsCreating(true);
    setIsEditing(true);
  };

  const updateEnvironment = async (updatedEnv: Environment) => {
  if (isEditing) {
    setDraftEnvironment(updatedEnv);
    return;
  }

  setEnvironmentsLocal(prev =>
    prev.map(env => (env.id === updatedEnv.id ? updatedEnv : env))
  );

  setSelectedEnv(updatedEnv);

  await syncEnvironment(updatedEnv);
};

  const saveEnvironment = async () => {
  if (!draftEnvironment) return;
  if (!draftEnvironment.name.trim()) return;

  const environmentToSave: Environment = {
    ...draftEnvironment,
    name: draftEnvironment.name.trim()
  };

  if (isCreating) {
    setEnvironmentsLocal(prev => [...prev, environmentToSave]);
  } else {
    setEnvironmentsLocal(prev =>
      prev.map(env =>
        env.id === environmentToSave.id ? environmentToSave : env
      )
    );
  }

  setSelectedEnv(environmentToSave);
  setDraftEnvironment(null);
  setIsCreating(false);
  setIsEditing(false);

  await syncEnvironment(environmentToSave);
};

  const cancelEnvironmentEditing = () => {
  setDraftEnvironment(null);
  setIsCreating(false);
  setIsEditing(false);
};

  const requestDeleteEnvironment = (id: string) => {
  setLocationIdPendingDelete(id);
};

const confirmDeleteEnvironment = async (mode: 'delete-all' | 'promote-children') => {
  if (!locationIdPendingDelete) return;

  const collectDescendantIds = (parentId: string): string[] => {
    const children = environments.filter(env => env.parentLocationId === parentId);

    return children.flatMap(child => [
      child.id,
      ...collectDescendantIds(child.id)
    ]);
  };

  const idsToDelete =
    mode === 'delete-all'
      ? [locationIdPendingDelete, ...collectDescendantIds(locationIdPendingDelete)]
      : [locationIdPendingDelete];

  setEnvironmentsLocal(prev =>
    prev
      .filter(env => !idsToDelete.includes(env.id))
      .map(env =>
        mode === 'promote-children' && env.parentLocationId === locationIdPendingDelete
          ? {
              ...env,
              parentLocationId: locationPendingDelete?.parentLocationId ?? null
            }
          : env
      )
  );

  if (!isLoadingFromSupabase) {
    for (const id of idsToDelete) {
      try {
        await deleteEnvironmentFromStorage(id);
      } catch (error) {
        console.error('Errore eliminazione ambiente da Supabase:', error);
      }
    }
  }

  if (selectedEnv && idsToDelete.includes(selectedEnv.id)) {
    clearSelection();
    setIsEditing(false);
  }

  setLocationIdPendingDelete(null);
};

  function buildLocationTree(items: Environment[]) {
    const map = new globalThis.Map<string, Environment[]>();

    items.forEach(env => {
      const parentId = env.parentLocationId ?? 'root';

      if (!map.has(parentId)) {
        map.set(parentId, []);
      }

      map.get(parentId)!.push(env);
    });
      map.forEach(children => {
      children.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    });
    return map;
  }

  const isDescendantOf = (
  possibleChildId: string,
  possibleParentId: string
): boolean => {
  let current = environments.find(env => env.id === possibleChildId);

  while (current?.parentLocationId) {
    if (current.parentLocationId === possibleParentId) {
      return true;
    }

    current = environments.find(env => env.id === current?.parentLocationId);
  }

  return false;
};

const moveLocation = (
  draggedId: string,
  targetId: string,
  position: DropPosition
) => {
  if (draggedId === targetId) return;

  const dragged = environments.find(env => env.id === draggedId);
  const target = environments.find(env => env.id === targetId);

  if (!dragged || !target) return;

  // Blocca loop: non puoi mettere un padre dentro un suo figlio.
  if (position === 'inside' && isDescendantOf(targetId, draggedId)) {
    return;
  }

  const nextParentId =
    position === 'inside'
      ? target.id
      : target.parentLocationId ?? null;

  const siblings = environments
    .filter(env => env.id !== draggedId)
    .filter(env => (env.parentLocationId ?? null) === nextParentId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  let insertIndex = siblings.length;

  if (position === 'before' || position === 'after') {
    const targetIndex = siblings.findIndex(env => env.id === target.id);

    if (targetIndex !== -1) {
      insertIndex = position === 'before' ? targetIndex : targetIndex + 1;
    }
  }

  const moved: Environment = {
    ...dragged,
    parentLocationId: nextParentId,
    sortOrder: insertIndex
  };

  const nextSiblings = [...siblings];
  nextSiblings.splice(insertIndex, 0, moved);

  setEnvironmentsLocal(prev =>
    prev.map(env => {
      if (env.id === draggedId) {
        return moved;
      }

      const nextIndex = nextSiblings.findIndex(item => item.id === env.id);

      if (nextIndex === -1) {
        return env;
      }

      return {
        ...env,
        sortOrder: nextIndex
      };
    })
  );

  setSelectedEnv(moved);
};

  const discardChangesAndContinue = () => {
  setDraftEnvironment(null);
  setIsCreating(false);
  setIsEditing(false);

  if (pendingEnvironmentSelection) {
    setSelectedEnv(pendingEnvironmentSelection);
  }

  setPendingEnvironmentSelection(null);
  setShowUnsavedChangesDialog(false);
};

const saveChangesAndContinue = async () => {
  if (!draftEnvironment || !draftEnvironment.name.trim()) return;

  const environmentToSave: Environment = {
    ...draftEnvironment,
    name: draftEnvironment.name.trim()
  };

  setEnvironmentsLocal(prev =>
    prev.map(env =>
      env.id === environmentToSave.id ? environmentToSave : env
    )
  );

  await syncEnvironment(environmentToSave);

  setSelectedEnv(pendingEnvironmentSelection ?? environmentToSave);
  setDraftEnvironment(null);
  setIsCreating(false);
  setIsEditing(false);
  setPendingEnvironmentSelection(null);
  setShowUnsavedChangesDialog(false);
};

function renderLocationTree(
  parentId: string | null,
  map: globalThis.Map<string, Environment[]>,
  level: number,
  selectedEnvId: string | null,
  onSelect: (env: Environment) => void
): ReactNode {
  const children = map.get(parentId ?? 'root') ?? [];

  return children.map(env => {
    const childCount = map.get(env.id)?.length ?? 0;
    const isCollapsed = collapsedLocationIds.has(env.id);
    const isSelected = selectedEnvId === env.id;

    const currentDropPosition =
      dropTarget?.id === env.id ? dropTarget.position : null;

    const getDropPosition = (
      event: React.DragEvent<HTMLDivElement>
    ): DropPosition => {
      const rect = event.currentTarget.getBoundingClientRect();
      const y = event.clientY - rect.top;
      const third = rect.height / 3;

      if (y < third) return 'before';
      if (y > third * 2) return 'after';
      return 'inside';
    };

    return (
      <div key={env.id}>
        <div
          draggable
          onDragStart={event => {
            event.dataTransfer.effectAllowed = 'move';
            setDraggedLocationId(env.id);
          }}
          onDragOver={event => {
            event.preventDefault();

            if (!draggedLocationId || draggedLocationId === env.id) {
              return;
            }

            setDropTarget({
              id: env.id,
              position: getDropPosition(event)
            });
          }}
          onDragLeave={() => {
            setDropTarget(null);
          }}
          onDrop={event => {
            event.preventDefault();

            if (draggedLocationId && dropTarget) {
              moveLocation(
                draggedLocationId,
                dropTarget.id,
                dropTarget.position
              );
            }

            setDraggedLocationId(null);
            setDropTarget(null);
          }}
          onDragEnd={() => {
            setDraggedLocationId(null);
            setDropTarget(null);
          }}
          onClick={() => onSelect(env)}
          className={`group relative mb-2 flex cursor-pointer items-center gap-2 rounded-2xl border px-3 py-3 transition-colors ${
  isSelected
    ? 'border-[var(--dash-accent)] bg-[var(--dash-panel)] shadow-lg shadow-black/20'
    : currentDropPosition === 'inside'
      ? 'border-[var(--dash-accent-2)] bg-[var(--dash-panel)]'
      : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface)]'
} ${draggedLocationId === env.id ? 'opacity-50' : ''}`}
          style={{ marginLeft: level * 14 }}
        >
          {currentDropPosition === 'before' && (
            <div className="absolute -top-1 left-3 right-3 h-0.5 rounded-full bg-[var(--dash-accent-2)]" />
          )}

          {currentDropPosition === 'after' && (
            <div className="absolute -bottom-1 left-3 right-3 h-0.5 rounded-full bg-[var(--dash-accent-2)]" />
          )}

          {level > 0 && (
            <div className="absolute -left-3 top-0 h-full border-l border-[var(--dash-border-soft)]" />
          )}

          <button
            type="button"
            onClick={event => {
              event.stopPropagation();

              if (childCount > 0) {
                toggleLocationCollapse(env.id);
              }
            }}
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] text-[var(--dash-muted)] transition-colors ${
              childCount > 0
                ? 'hover:border-[var(--dash-accent)] hover:text-[var(--dash-text-strong)]'
                : 'opacity-30'
            }`}
          >
            {childCount > 0 ? (
              isCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--dash-muted)]" />
            )}
          </button>

          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] transition-colors group-hover:border-[var(--dash-accent-2)] group-hover:bg-[var(--dash-accent)]">
            {getLocationIcon(env.iconId, env.locationType)}
          </div>

          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-[var(--dash-text-strong)]">
              {env.name || 'Luogo senza nome'}
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-2 py-0.5 text-[var(--dash-text)]">
                {getLocationTypeLabel(env.locationType)}
              </span>

              {childCount > 0 && (
                <span className="text-[var(--dash-muted)]">
                  {childCount} sotto-luoghi
                </span>
              )}
            </div>
          </div>
        </div>

        {!isCollapsed &&
          renderLocationTree(env.id, map, level + 1, selectedEnvId, onSelect)}
      </div>
    );
  });
}

  const locationTree = buildLocationTree(environments);

  const getLocationPath = (locationId: string | null | undefined): string => {
  if (!locationId) return '';

  const path: string[] = [];
  let current = environments.find(env => env.id === locationId);

  while (current) {
    path.unshift(current.name || 'Luogo senza nome');

    if (!current.parentLocationId) break;

    current = environments.find(env => env.id === current?.parentLocationId);
  }

  return path.join(', ');
};

const locationBadgeClass =
  'group relative inline-flex h-9 items-center rounded-full border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-4 text-sm text-[var(--dash-text)]';

const locationClickableBadgeClass =
  'group relative inline-flex h-9 cursor-pointer items-center rounded-full border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-4 text-sm text-[var(--dash-text)] transition-colors hover:border-[var(--dash-accent-2)] hover:bg-[var(--dash-accent)] hover:text-[var(--dash-text-strong)]';

const locationTooltipClass =
  'pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-[var(--dash-accent)] bg-[var(--dash-panel)] px-3 py-1.5 text-xs text-[var(--dash-text-strong)] shadow-xl group-hover:block';
  
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-1">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-[var(--dash-text-strong)]">Luoghi</h2>
            <p className="mt-1 text-sm text-[var(--dash-muted)]">
              Struttura gerarchica della campagna
            </p>
          </div>

          <button
            type="button"
            onClick={addEnvironment}
            className="group flex items-center gap-2 rounded-lg border-2 border-[var(--dash-border)] bg-[var(--dash-border)] px-3 py-2 text-[var(--dash-text)] transition-colors hover:bg-[var(--dash-border)]"
          >
            <Plus className="h-4 w-4 group-hover:animate-[plusPulse_0.75s_ease-in-out_infinite]" />
            Nuovo
          </button>
        </div>

        <div className="space-y-2 overflow-x-auto rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-4">
          {renderLocationTree(
            null,
            locationTree,
            0,
            currentEnv?.id ?? null,
            handleSelectEnvironment
          )}
        </div>
      </div>

      <div className="lg:col-span-2">
        {currentEnv ? (
          <div className="rounded-lg border-2 border-[var(--dash-border)] bg-[var(--dash-surface-2)] p-6">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.14em] text-[var(--dash-accent-2)]">
                  Scheda luogo
                </div>

                <h2 className="mt-1 text-2xl font-semibold text-[var(--dash-text-strong)]">
                  {currentEnv.name.trim() || 'Nuovo luogo'}
                </h2>

                <div className="mt-2 flex flex-wrap gap-2 text-xs">
  <span className={locationBadgeClass}>
  {getLocationTypeLabel(currentEnv.locationType)}
  <span className={locationTooltipClass}>Tipo luogo</span>
</span>

  {currentEnv.adventureId && (
  <button
    type="button"
    onClick={() => {
      const adventureId = currentEnv.adventureId;
      if (!adventureId) return;

      onNavigate?.({
        tabId: 'adventures',
        entityId: adventureId,
        entityType: 'adventure'
      });
    }}
    className={locationClickableBadgeClass}
  >
    {adventures.find(adventure => adventure.id === currentEnv.adventureId)?.title ?? 'Avventura'}
    <span className={locationTooltipClass}>Vai all'avventura collegata</span>
  </button>
)}

                  {currentEnv.parentLocationId && (
  <button
    type="button"
    onClick={() => {
      const parentId = currentEnv.parentLocationId;
      if (!parentId) return;

      const parent = environments.find(env => env.id === parentId);
      if (!parent) return;

      handleSelectEnvironment(parent);
    }}
    className={locationClickableBadgeClass}
  >
    {getLocationPath(currentEnv.parentLocationId) || 'Luogo non trovato'}
    <span className={locationTooltipClass}>Vai al luogo padre</span>
  </button>
)}
                </div>
              </div>

              <div className="flex gap-2">
                {isEditing ? (
                  <>
                    <HorrorButton
                      type="button"
                      onClick={saveEnvironment}
                      disabled={!currentEnv.name.trim()}
                      className="group px-3 py-2"
                    >
                      <Save className="h-4 w-4 group-hover:animate-[saveDiskInsert_0.7s_ease-in-out_infinite]" />
                      Salva
                    </HorrorButton>

                    <HorrorButton
                      type="button"
                      variant="secondary"
                      onClick={cancelEnvironmentEditing}
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
  if (!selectedEnv) return;

  setDraftEnvironment({ ...selectedEnv });
  setIsCreating(false);
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
                      onClick={() => requestDeleteEnvironment(currentEnv.id)}
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
                <div>
                  <label className="mb-2 block text-[var(--dash-text)]">Nome</label>
                  <input
                    type="text"
                    value={currentEnv.name}
                    onChange={e =>
                      updateEnvironment({
                        ...currentEnv,
                        name: e.target.value
                      })
                    }
                    className="w-full rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text)]"
                    placeholder="Nome del luogo"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-[var(--dash-text)]">
                    Avventura collegata
                  </label>

                  <select
                    value={currentEnv.adventureId ?? ''}
                    onChange={e =>
                      updateEnvironment({
                        ...currentEnv,
                        adventureId: e.target.value || null
                      })
                    }
                    className="w-full rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text)]"
                  >
                    <option value="">Tutta la campagna</option>

                    {adventures
                      .filter(adventure =>
                        adventure.campaignId == null || adventure.campaignId === campaignId
                        )
                      .map(adventure => (
                        <option key={adventure.id} value={adventure.id}>
                          {adventure.title}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-[var(--dash-text)]">
                      Tipo luogo
                    </label>

                    <select
                      value={currentEnv.locationType ?? 'other'}
                      onChange={e =>
                        updateEnvironment({
                          ...currentEnv,
                          locationType: e.target
                            .value as NonNullable<Environment['locationType']>
                        })
                      }
                      className="w-full rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text)]"
                    >
                      {LOCATION_TYPE_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-[var(--dash-text)]">
                      Luogo padre
                    </label>

                    <select
                      value={currentEnv.parentLocationId ?? ''}
                      onChange={e =>
                        updateEnvironment({
                          ...currentEnv,
                          parentLocationId: e.target.value || null
                        })
                      }
                      className="w-full rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text)]"
                    >
                      <option value="">Nessun luogo padre</option>

                      {environments
                        .filter(environment => environment.id !== currentEnv.id)
                        .filter(environment => environment.campaignId === campaignId)
                        .map(environment => (
                          <option key={environment.id} value={environment.id}>
                            {environment.name}
                          </option>
                        ))}
                    </select>

                    <p className="mt-2 text-xs text-[var(--dash-muted)]">
                      Usa il luogo padre per creare sotto-luoghi, stanze o zone
                      interne.
                    </p>
                  </div>
                </div>

               <div>
  <label className="mb-2 block text-[var(--dash-text)]">Icona luogo</label>

  <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
    <button
      type="button"
      onClick={() => setIsIconPickerOpen(prev => !prev)}
      className="flex w-full items-center justify-between rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-3 py-2 text-left text-[var(--dash-text-strong)] hover:border-[var(--dash-accent)]"
    >
      <span className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)]">
          {getLocationIcon(currentEnv.iconId, currentEnv.locationType)}
        </span>
        Cambia icona
      </span>

      {isIconPickerOpen ? (
        <ChevronDown className="h-4 w-4 text-[var(--dash-muted)]" />
      ) : (
        <ChevronRight className="h-4 w-4 text-[var(--dash-muted)]" />
      )}
    </button>

    {isIconPickerOpen && (
      <div
  onScroll={() => {
  const hovered = document.querySelector('[data-location-icon-button]:hover');

  if (!hovered) return;

  const tooltip = hovered.querySelector('[data-location-icon-tooltip]');
  if (!tooltip) return;

  const rect = hovered.getBoundingClientRect();

  tooltip.setAttribute(
    'style',
    `left:${rect.left + rect.width / 2}px;top:${rect.top}px;`
  );
}}
  className="mt-3 grid max-h-56 grid-cols-6 gap-2 overflow-y-auto rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-bg)] p-3 md:grid-cols-8 lg:grid-cols-10"
>
        {LOCATION_ICON_OPTIONS.map(option => {
          const Icon = option.icon;
          const isSelected = currentEnv.iconId === option.id;

          return (
           <button
  key={option.id}
  type="button"
  data-location-icon-button
  onMouseMove={event => {
    const tooltip = event.currentTarget.querySelector('[data-location-icon-tooltip]');
    if (!tooltip) return;

    const rect = event.currentTarget.getBoundingClientRect();
    tooltip.setAttribute(
      'style',
      `left:${rect.left + rect.width / 2}px;top:${rect.top}px;`
    );
  }}
  onClick={() => {
    updateEnvironment({
      ...currentEnv,
      iconId: option.id
    });
    setIsIconPickerOpen(false);
  }}
  className={`group relative flex h-10 w-10 items-center justify-center rounded-xl border transition-colors ${
    isSelected
      ? 'border-[var(--dash-accent-2)] bg-[var(--dash-accent)] text-[var(--dash-text-strong)]'
      : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] text-[var(--dash-text)] hover:border-[var(--dash-accent)] hover:bg-[var(--dash-panel)]'
  }`}
>
  <Icon className="h-5 w-5" />

  <span
    data-location-icon-tooltip
    className="pointer-events-none fixed z-[9999] hidden -translate-x-1/2 -translate-y-[calc(100%+10px)] whitespace-nowrap rounded-lg border border-[var(--dash-accent)] bg-[var(--dash-panel)] px-3 py-1.5 text-xs text-[var(--dash-text-strong)] shadow-xl group-hover:block"
  >
    {option.label}
  </span>
</button>
          );
        })}
      </div>
    )}
  </div>
</div>

                <div>
                  <label className="mb-2 block text-[var(--dash-text)]">
                    Descrizione
                  </label>
                  <textarea
                    value={currentEnv.description}
                    onChange={e =>
                      updateEnvironment({
                        ...currentEnv,
                        description: e.target.value
                      })
                    }
                    className="h-32 w-full resize-none rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text)]"
                    placeholder="Cosa vedono i personaggi quando entrano?"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-[var(--dash-text)]">
                    Atmosfera
                  </label>
                  <input
                    type="text"
                    value={currentEnv.atmosphere}
                    onChange={e =>
                      updateEnvironment({
                        ...currentEnv,
                        atmosphere: e.target.value
                      })
                    }
                    className="w-full rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text)]"
                    placeholder="Tenebrosa, accogliente, misteriosa..."
                  />
                </div>

                <div>
                  <label className="mb-2 block text-[var(--dash-text)]">
                    Punti di uscita
                  </label>
                  <textarea
                    value={currentEnv.exitPoints}
                    onChange={e =>
                      updateEnvironment({
                        ...currentEnv,
                        exitPoints: e.target.value
                      })
                    }
                    className="h-24 w-full resize-none rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text)]"
                    placeholder="Porte, scale, finestre..."
                  />
                </div>

                <div>
                  <label className="mb-2 block text-[var(--dash-text)]">
                    Dettagli nascosti solo GM
                  </label>
                  <textarea
                    value={currentEnv.hiddenDetails}
                    onChange={e =>
                      updateEnvironment({
                        ...currentEnv,
                        hiddenDetails: e.target.value
                      })
                    }
                    className="h-24 w-full resize-none rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text)]"
                    placeholder="Indizi nascosti, passaggi segreti..."
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <h3 className="mb-2 text-[var(--dash-text)]">Avventura</h3>
                  <p className="text-[var(--dash-muted)]">
                    {currentEnv.adventureId
                      ? adventures.find(
                          adventure => adventure.id === currentEnv.adventureId
                        )?.title ?? 'Avventura non trovata'
                      : 'Tutta la campagna'}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <h3 className="mb-2 text-[var(--dash-text)]">Tipo luogo</h3>
                     <p className="text-[var(--dash-muted)]">
                        {getLocationTypeLabel(currentEnv.locationType)}
                     </p>
                  </div>

                  <div>
                    <h3 className="mb-2 text-[var(--dash-text)]">Luogo padre</h3>
                    <p className="text-[var(--dash-muted)]">
                      {currentEnv.parentLocationId
                        ? environments.find(
                            environment =>
                              environment.id === currentEnv.parentLocationId
                          )?.name ?? 'Luogo non trovato'
                        : 'Nessun luogo padre'}
                    </p>
                  </div>
                </div>

                <div>
                  <h3 className="mb-2 flex items-center gap-2 text-[var(--dash-text)]">
                    <Eye className="h-4 w-4" />
                    Descrizione
                  </h3>
                  <p className="text-[var(--dash-muted)]">
                    {currentEnv.description || 'Nessuna descrizione'}
                  </p>
                </div>

                <div>
                  <h3 className="mb-2 text-[var(--dash-text)]">Atmosfera</h3>
                  <p className="text-[var(--dash-muted)]">
                    {currentEnv.atmosphere || 'Non specificata'}
                  </p>
                </div>

                <div>
                  <h3 className="mb-2 text-[var(--dash-text)]">Punti di uscita</h3>
                  <p className="text-[var(--dash-muted)]">
                    {currentEnv.exitPoints || 'Non specificati'}
                  </p>
                </div>

                <div className="rounded-lg border-2 border-[var(--dash-border)] bg-[var(--dash-input)] p-4">
                  <h3 className="mb-2 text-[var(--dash-text)]">
                    🔒 Dettagli nascosti solo GM
                  </h3>
                  <p className="text-[var(--dash-muted)]">
                    {currentEnv.hiddenDetails || 'Nessun dettaglio nascosto'}
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg border-2 border-[var(--dash-border)] bg-[var(--dash-surface-2)] p-12 text-center">
            <Bookmark className="mx-auto mb-4 h-16 w-16 text-[var(--dash-border)]" />
            <p className="text-[var(--dash-muted)]">
              Seleziona un luogo dalla lista o creane uno nuovo
            </p>
          </div>
        )}
            </div>

      {locationPendingDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--dash-accent)] bg-[var(--dash-surface)] p-6 shadow-2xl">
            <div className="mb-4">
              <div className="text-xs uppercase tracking-[0.14em] text-[var(--dash-accent-2)]">
                Conferma eliminazione
              </div>

              <h3 className="mt-2 text-xl font-semibold text-[var(--dash-text-strong)]">
                Eliminare questo luogo?
              </h3>

              <p className="mt-3 text-sm leading-relaxed text-[var(--dash-muted)]">
                Stai per eliminare "{locationPendingDelete.name || 'Luogo senza nome'}".
                {childLocationCount > 0
                ? ` Questo luogo contiene ${childLocationCount} sotto-luoghi diretti.`
                : ' L\'azione non può essere annullata.'}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
  <HorrorButton 
    type="button"
    variant="secondary"
    onClick={() => setLocationIdPendingDelete(null)}
    className="group w-full px-3 py-2"
  >
    <X className="h-4 w-4 group-hover:animate-[cancelWiggle_0.55s_ease-in-out_infinite]" />
    Annulla
  </HorrorButton>

  {childLocationCount > 0 && (
    <HorrorButton
  type="button"
  variant="secondary"
  onClick={() => confirmDeleteEnvironment('promote-children')}
  className="group w-full px-3 py-2"
>
  <ChevronRight className="h-4 w-4 group-hover:animate-[locationArrowPulse_0.8s_ease-in-out_infinite]" />
  Sposta figli
</HorrorButton>
  )}

  <HorrorButton
    type="button"
    variant="danger"
    onClick={() => confirmDeleteEnvironment('delete-all')}
    className="group w-full px-3 py-2"
  >
    <Trash2 className="h-4 w-4 group-hover:animate-[trashShake_0.55s_ease-in-out_infinite]" />
    {childLocationCount > 0 ? 'Elimina tutto' : 'Elimina'}
  </HorrorButton>
</div>
          </div>
        </div>
      )}

      {showUnsavedChangesDialog && (
  <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4">
    <div className="w-full max-w-md rounded-2xl border border-[var(--dash-accent)] bg-[var(--dash-surface)] p-6 shadow-2xl">
      <div className="mb-4">
        <div className="text-xs uppercase tracking-[0.14em] text-[var(--dash-accent-2)]">
          Modifiche non salvate
        </div>

        <h3 className="mt-2 text-xl font-semibold text-[var(--dash-text-strong)]">
          Vuoi salvare le modifiche?
        </h3>

        <p className="mt-3 text-sm leading-relaxed text-[var(--dash-muted)]">
          Hai modifiche non salvate su "{draftEnvironment?.name || 'Nuovo luogo'}".
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <HorrorButton
          type="button"
          variant="secondary"
          onClick={() => {
            setPendingEnvironmentSelection(null);
            setShowUnsavedChangesDialog(false);
          }}
          className="group w-full px-3 py-2"
        >
          <X className="h-4 w-4 group-hover:animate-[cancelWiggle_0.55s_ease-in-out_infinite]" />
          Annulla
        </HorrorButton>

        <HorrorButton
          type="button"
          variant="secondary"
          onClick={discardChangesAndContinue}
          className="group w-full px-3 py-2"
        >
          <Trash2 className="h-4 w-4 group-hover:animate-[trashShake_0.55s_ease-in-out_infinite]" />
          Scarta
        </HorrorButton>

        <HorrorButton
          type="button"
          onClick={saveChangesAndContinue}
          disabled={!draftEnvironment?.name.trim()}
          className="group w-full px-3 py-2"
        >
          <Save className="h-4 w-4 group-hover:animate-[saveDiskInsert_0.7s_ease-in-out_infinite]" />
          Salva
        </HorrorButton>
      </div>
    </div>
  </div>
)}
    </div>
  );
}