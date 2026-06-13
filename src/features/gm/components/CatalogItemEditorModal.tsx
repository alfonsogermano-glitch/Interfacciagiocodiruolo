import { useEffect, useMemo, useRef, useState } from 'react';
import { Package, X, ChevronDown, ChevronRight, Upload, Save, Trash2 } from 'lucide-react';
import { Icon } from '@iconify/react';

import { generateUUID } from '../../../lib/uuid';
import {
  loadEntityReferenceBundle,
  type EntityReference
} from '../../../services/campaign/entityReferenceService';
import {
  loadVisualAssetsByType,
  visualAssetsStorage,
  type VisualAsset
} from '../../../services/storage/visualAssetsStorage';

import type {
  CreateCatalogItemInput,
  EquipmentCatalogItem,
  EquipmentRarity,
  EquipmentType,
  UpdateCatalogItemInput
} from '../../../types/equipment';

type EditorMode = 'create' | 'edit';
type ScopeMode = 'global' | 'campaign';
type EditorTab = 'data' | 'icon' | 'image' | 'environments' | 'npcs' | 'monsters' | 'container';

interface CatalogItemEditorModalProps {
  open?: boolean;
  isOpen?: boolean;
  mode: EditorMode;
  campaignId?: string;
  defaultCampaignId?: string;
  initialItem?: EquipmentCatalogItem | null;
  catalogItems?: EquipmentCatalogItem[];
  isSaving?: boolean;
  onClose: () => void;
  onSubmit: (
    input: CreateCatalogItemInput | UpdateCatalogItemInput,
    meta: { scope: ScopeMode }
  ) => Promise<void> | void;
}

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

const TYPE_OPTIONS: Array<{ value: EquipmentType; label: string }> = [
  { value: 'tascabile', label: 'Tascabile' },
  { value: 'trasportabile', label: 'Trasportabile' },
  { value: 'risorsa', label: 'Risorsa' },
  { value: 'arma', label: 'Arma' }
];

const RARITY_OPTIONS: Array<{ value: EquipmentRarity; label: string }> = [
  { value: 'common', label: 'Comune' },
  { value: 'rare', label: 'Raro' },
  { value: 'unique', label: 'Unico' },
  { value: 'story', label: 'Storia' }
];

const EQUIPMENT_ICON_OPTIONS = [
  { id: 'game-icons:swap-bag', label: 'Borsa' },
  { id: 'game-icons:backpack', label: 'Zaino' },
  { id: 'game-icons:key', label: 'Chiave' },
  { id: 'mdi:key-variant', label: 'Chiave antica' },
  { id: 'game-icons:flashlight', label: 'Torcia' },
  { id: 'mdi:lightbulb-on', label: 'Lanterna' },
  { id: 'game-icons:notebook', label: 'Taccuino' },
  { id: 'game-icons:knife-thrust', label: 'Coltello' },
  { id: 'game-icons:pistol-gun', label: 'Pistola' },
  { id: 'game-icons:book-cover', label: 'Libro' },
  { id: 'game-icons:scroll-unfurled', label: 'Pergamena' },
  { id: 'game-icons:magnifying-glass', label: 'Lente' },
  { id: 'game-icons:medicine-pills', label: 'Medicine' },
  { id: 'game-icons:locked-box', label: 'Scatola' },
  { id: 'game-icons:car-key', label: 'Chiave auto' },
  { id: 'game-icons:car-wheel', label: 'Veicolo' },
  { id: 'game-icons:treasure-map', label: 'Mappa' },
  { id: 'game-icons:compass', label: 'Bussola' },
  { id: 'game-icons:crystal-ball', label: 'Occulto' },
  { id: 'game-icons:candle-light', label: 'Candela' },
  { id: 'game-icons:padlock', label: 'Lucchetto' },
  { id: 'game-icons:locked-chest', label: 'Baule' },
  { id: 'game-icons:wooden-crate', label: 'Cassa' },
  { id: 'game-icons:pocket-watch', label: 'Orologio' },
  { id: 'game-icons:envelope', label: 'Busta' },
  { id: 'game-icons:files', label: 'Documenti' },
  { id: 'mdi:folder', label: 'Cartella' },
  { id: 'game-icons:first-aid-kit', label: 'Kit medico' },
  { id: 'game-icons:revolver', label: 'Revolver' },
  { id: 'game-icons:ammo-box', label: 'Munizioni' },
  { id: 'game-icons:crowbar', label: 'Piede di porco' },
  { id: 'game-icons:wrench', label: 'Chiave inglese' },
  { id: 'mdi:cellphone', label: 'Telefono' },
  { id: 'game-icons:photo-camera', label: 'Fotocamera' },
  { id: 'game-icons:binoculars', label: 'Binocolo' },
  { id: 'mdi:bicycle', label: 'Bicicletta' },
  { id: 'mdi:car', label: 'Auto' },
  { id: 'mdi:motorbike', label: 'Moto' },
  { id: 'mdi:bus', label: 'Autobus' },
  { id: 'mdi:train', label: 'Treno' },
  { id: 'mdi:boat', label: 'Barca' },
  { id: 'mdi:book-open-page-variant', label: 'Libro' },
  { id: 'mdi:file-document', label: 'Documento' },
  { id: 'mdi:medical-bag', label: 'Kit medico' },
  { id: 'mdi:pill', label: 'Pillole' },
  { id: 'mdi:hammer', label: 'Martello' },
  { id: 'mdi:wrench', label: 'Chiave inglese' },
  { id: 'mdi:knife', label: 'Coltello' },
  { id: 'mdi:pistol', label: 'Pistola' },
  { id: 'mdi:briefcase', label: 'Valigetta' },
  { id: 'mdi:bag-suitcase', label: 'Valigia' },
  { id: 'mdi:wallet', label: 'Portafoglio' },
  { id: 'mdi:cash', label: 'Contanti' },
  { id: 'mdi:lock', label: 'Lucchetto' },
  { id: 'mdi:treasure-chest', label: 'Baule' },
  { id: 'mdi:skull', label: 'Teschio' },
  { id: 'mdi:eye', label: 'Occhio' },
  { id: 'mdi:crystal-ball', label: 'Sfera di cristallo' },
  { id: 'mdi:flask', label: 'Fiala' },
  { id: 'mdi:bottle-tonic', label: 'Bottiglia' }
];

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);

    reader.readAsDataURL(file);
  });
}

function createImageThumbnail(
  file: File,
  maxSize = 240,
  quality = 0.72
): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      const scale = Math.min(maxSize / image.width, maxSize / image.height, 1);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);

      const context = canvas.getContext('2d');

      if (!context) {
        URL.revokeObjectURL(url);
        reject(new Error('Canvas non disponibile.'));
        return;
      }

      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Impossibile creare thumbnail.'));
    };

    image.src = url;
  });
}

export function CatalogItemEditorModal({
  open,
  isOpen,
  mode,
  campaignId,
  defaultCampaignId,
  initialItem,
  catalogItems = [],
  isSaving = false,
  onClose,
  onSubmit
}: CatalogItemEditorModalProps) {
  const modalOpen = isOpen ?? open ?? false;
  const resolvedCampaignId = campaignId ?? defaultCampaignId;
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const [activeTab, setActiveTab] = useState<EditorTab>('data');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<EquipmentType>('tascabile');
  const [isVehicle, setIsVehicle] = useState(false);
  const [rarity, setRarity] = useState<EquipmentRarity>('common');
  const [isClue, setIsClue] = useState(false);
  const [isStoryItem, setIsStoryItem] = useState(false);
  const [isPublic, setIsPublic] = useState(true);
  const [tagsInput, setTagsInput] = useState('');
  const [scope, setScope] = useState<ScopeMode>('campaign');
  const [formError, setFormError] = useState<string | null>(null);
  const [iconId, setIconId] = useState('game-icons:swap-bag');
  const [iconColor, setIconColor] = useState('#d6b27c');
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
  const [isImagePickerOpen, setIsImagePickerOpen] = useState(false);
  const [imageAssetId, setImageAssetId] = useState<string | null>(null);
  const [visualAssets, setVisualAssets] = useState<VisualAsset[]>([]);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageAssetToDelete, setImageAssetToDelete] = useState<VisualAsset | null>(null);

  const [environmentOptions, setEnvironmentOptions] = useState<LinkOption[]>([]);
  const [npcOptions, setNpcOptions] = useState<LinkOption[]>([]);
  const [monsterOptions, setMonsterOptions] = useState<LinkOption[]>([]);
  const [linkedEnvironmentIds, setLinkedEnvironmentIds] = useState<string[]>([]);
  const [linkedNpcIds, setLinkedNpcIds] = useState<string[]>([]);
  const [linkedMonsterIds, setLinkedMonsterIds] = useState<string[]>([]);
  const [containerItemId, setContainerItemId] = useState<string | null>(null);

  const title = mode === 'create' ? 'Nuovo oggetto' : 'Modifica oggetto';
  const submitLabel = mode === 'create' ? 'Crea oggetto' : 'Salva';

  const parsedTags = useMemo(() => {
    return tagsInput
      .split(',')
      .map(tag => tag.trim())
      .filter(Boolean);
  }, [tagsInput]);

  const selectedImageAsset = visualAssets.find(asset => asset.id === imageAssetId);
  const availableContainerItems = catalogItems
    .filter(item => item.id !== initialItem?.id)
    .filter(item => item.source !== 'base')
    .filter(item => item.containerItemId !== initialItem?.id)
    .sort((a, b) => a.name.localeCompare(b.name, 'it'));


  const selectedEnvironmentId = linkedEnvironmentIds[0] ?? null;
  const selectedNpcId = linkedNpcIds[0] ?? null;
  const selectedMonsterId = linkedMonsterIds[0] ?? null;

  const getLinkedOptionName = (options: LinkOption[], id: string | null) => {
    if (!id) return null;
    return options.find(option => option.id === id)?.name ?? 'Elemento non trovato';
  };

  const currentDestination = useMemo(() => {
    if (selectedEnvironmentId) {
      return {
        type: 'environment' as const,
        label: `luogo ${getLinkedOptionName(environmentOptions, selectedEnvironmentId) ?? ''}`
      };
    }

    if (selectedNpcId) {
      return {
        type: 'npc' as const,
        label: `PNG ${getLinkedOptionName(npcOptions, selectedNpcId) ?? ''}`
      };
    }

    if (selectedMonsterId) {
      return {
        type: 'monster' as const,
        label: `mostro ${getLinkedOptionName(monsterOptions, selectedMonsterId) ?? ''}`
      };
    }

    if (containerItemId) {
      return {
        type: 'container' as const,
        label: `contenitore ${availableContainerItems.find(item => item.id === containerItemId)?.name ?? 'Elemento non trovato'}`
      };
    }

    return null;
  }, [
    selectedEnvironmentId,
    selectedNpcId,
    selectedMonsterId,
    containerItemId,
    environmentOptions,
    npcOptions,
    monsterOptions,
    availableContainerItems
  ]);

  const clearDestination = () => {
    setLinkedEnvironmentIds([]);
    setLinkedNpcIds([]);
    setLinkedMonsterIds([]);
    setContainerItemId(null);
  };

  const assignEnvironmentDestination = (id: string | null) => {
    setLinkedEnvironmentIds(id ? [id] : []);
    setLinkedNpcIds([]);
    setLinkedMonsterIds([]);
    setContainerItemId(null);
  };

  const assignNpcDestination = (id: string | null) => {
    setLinkedEnvironmentIds([]);
    setLinkedNpcIds(id ? [id] : []);
    setLinkedMonsterIds([]);
    setContainerItemId(null);
  };

  const assignMonsterDestination = (id: string | null) => {
    setLinkedEnvironmentIds([]);
    setLinkedNpcIds([]);
    setLinkedMonsterIds(id ? [id] : []);
    setContainerItemId(null);
  };

  const assignContainerDestination = (id: string | null) => {
    setLinkedEnvironmentIds([]);
    setLinkedNpcIds([]);
    setLinkedMonsterIds([]);
    setContainerItemId(id);
  };

  const getDestinationBlockMessage = (targetType: 'environment' | 'npc' | 'monster' | 'container') => {
    if (!currentDestination || currentDestination.type === targetType) return null;
    return `L’oggetto è già assegnato a ${currentDestination.label}. Rimuovi prima quella destinazione per sceglierne un’altra.`;
  };

  const loadItemImageAssets = () => {
    if (!modalOpen || !resolvedCampaignId) {
      setVisualAssets([]);
      return;
    }

    loadVisualAssetsByType(resolvedCampaignId, 'item-image')
      .then(setVisualAssets)
      .catch(error => {
        console.error('Errore caricamento asset grafici per oggetto:', error);
        setVisualAssets([]);
      });
  };

  useEffect(() => {
    if (!modalOpen) return;

    setActiveTab('data');
    setIsIconPickerOpen(false);
    setIsImagePickerOpen(false);
    setImageAssetToDelete(null);

    if (mode === 'edit' && initialItem) {
      setName(initialItem.name);
      setDescription(initialItem.description);
      setType(initialItem.type);
      setIsVehicle(initialItem.isVehicle);
      setRarity(initialItem.rarity);
      setIsClue(initialItem.isClue);
      setIsStoryItem(initialItem.isStoryItem);
      setIsPublic(initialItem.isPublic);
      setTagsInput(initialItem.tags.join(', '));
      setScope(initialItem.campaignId ? 'campaign' : 'global');
      setFormError(null);
      setIconId(initialItem.iconId ?? 'game-icons:swap-bag');
      setIconColor(initialItem.iconColor ?? '#d6b27c');
      setImageAssetId(initialItem.imageAssetId ?? null);
      setLinkedEnvironmentIds((initialItem.linkedEnvironmentIds ?? []).slice(0, 1));
      setLinkedNpcIds((initialItem.linkedNpcIds ?? []).slice(0, 1));
      setLinkedMonsterIds((initialItem.linkedMonsterIds ?? []).slice(0, 1));
      setContainerItemId(initialItem.containerItemId ?? null);
      return;
    }

    setName('');
    setDescription('');
    setType('tascabile');
    setIsVehicle(false);
    setRarity('common');
    setIsClue(false);
    setIsStoryItem(false);
    setIsPublic(true);
    setTagsInput('');
    setScope(resolvedCampaignId ? 'campaign' : 'global');
    setFormError(null);
    setIconId('game-icons:swap-bag');
    setIconColor('#d6b27c');
    setImageAssetId(null);
    setLinkedEnvironmentIds([]);
    setLinkedNpcIds([]);
    setLinkedMonsterIds([]);
    setContainerItemId(null);
  }, [modalOpen, mode, initialItem, resolvedCampaignId]);

  useEffect(() => {
    if (type !== 'risorsa' && isVehicle) {
      setIsVehicle(false);
    }
  }, [type, isVehicle]);

  useEffect(() => {
    loadItemImageAssets();
  }, [modalOpen, resolvedCampaignId]);

  useEffect(() => {
    if (!modalOpen) return;

    let cancelled = false;

    setEnvironmentOptions([]);
    setNpcOptions([]);
    setMonsterOptions([]);

    loadLinkedEntityOptions(resolvedCampaignId)
      .then(options => {
        if (cancelled) return;

        setEnvironmentOptions(options.environments);
        setNpcOptions(options.npcs);
        setMonsterOptions(options.monsters);
      })
      .catch(error => {
        console.error('Errore caricamento collegamenti oggetto:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [modalOpen, resolvedCampaignId]);

  const validate = (): string | null => {
    if (!name.trim()) return 'Il nome dell’oggetto è obbligatorio.';
    if (!description.trim()) return 'La descrizione dell’oggetto è obbligatoria.';

    if (scope === 'campaign' && !resolvedCampaignId && mode === 'create') {
      return 'Per creare un oggetto di campagna serve un campaignId valido.';
    }

    return null;
  };

  const handleUploadImage = async (file: File) => {
    if (!resolvedCampaignId) {
      setFormError('Per caricare un’immagine serve una campagna valida.');
      return;
    }

    try {
      setIsUploadingImage(true);
      setFormError(null);

      const [imageDataUrl, thumbnailDataUrl] = await Promise.all([
        fileToDataUrl(file),
        createImageThumbnail(file)
      ]);

      const newAsset: VisualAsset = {
        id: generateUUID(),
        campaignId: resolvedCampaignId,
        name: file.name,
        type: 'item-image',
        imageDataUrl,
        thumbnailDataUrl,
        createdAt: new Date().toISOString()
      };

      setVisualAssets(prev => [...prev, newAsset]);
      setImageAssetId(newAsset.id);
      await visualAssetsStorage.upsert(newAsset);
    } catch (error) {
      console.error('Errore caricamento immagine oggetto:', error);
      setFormError('Errore durante il caricamento dell’immagine oggetto.');
    } finally {
      setIsUploadingImage(false);
      if (uploadInputRef.current) {
        uploadInputRef.current.value = '';
      }
    }
  };

  const handleSubmit = async () => {
    const validationError = validate();

    if (validationError) {
      setFormError(validationError);
      setActiveTab('data');
      return;
    }

    setFormError(null);

    const commonPayload = {
      name: name.trim(),
      description: description.trim(),
      type,
      isVehicle: type === 'risorsa' ? isVehicle : false,
      rarity,
      isClue,
      isStoryItem,
      isPublic,
      tags: parsedTags,
      imageAssetId,
      iconId,
      iconColor,
      linkedEnvironmentIds,
      linkedNpcIds,
      linkedMonsterIds,
      containerItemId
    };

    if (mode === 'create') {
      await onSubmit(
        {
          ...commonPayload,
          campaignId: scope === 'campaign' ? resolvedCampaignId ?? null : null
        },
        { scope }
      );
      return;
    }

    await onSubmit(commonPayload, { scope });
  };

  if (!modalOpen) {
    return null;
  }

  const tabButtonClass = (tab: EditorTab) =>
    `min-w-[110px] flex-1 rounded-lg px-4 py-2 text-sm transition-colors ${
      activeTab === tab
        ? 'bg-[var(--dash-accent)] text-[var(--dash-text-strong)]'
        : 'text-[var(--dash-muted)] hover:bg-[var(--dash-panel)] hover:text-[var(--dash-text-strong)]'
    }`;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="flex h-[86vh] max-h-[860px] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[var(--dash-border)] bg-[var(--dash-surface)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--dash-border)] px-5 py-4">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-[var(--dash-accent)]" />
            <h3 className="text-lg font-semibold text-[var(--dash-text-strong)]">
              {title}
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="group rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-2 text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-surface-2)]"
          >
            <X className="h-4 w-4 group-hover:animate-[cancelWiggle_0.55s_ease-in-out_infinite]" />
          </button>
        </div>

        <div className="border-b border-[var(--dash-border)] px-5 py-3">
          <div className="flex flex-wrap gap-2 rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-2">
            <button type="button" onClick={() => setActiveTab('data')} className={tabButtonClass('data')}>
              Dati
            </button>
            <button type="button" onClick={() => setActiveTab('icon')} className={tabButtonClass('icon')}>
              Icona
            </button>
            <button type="button" onClick={() => setActiveTab('image')} className={tabButtonClass('image')}>
              Immagine
            </button>
            <button type="button" onClick={() => setActiveTab('environments')} className={tabButtonClass('environments')}>
              Luoghi
            </button>
            <button type="button" onClick={() => setActiveTab('npcs')} className={tabButtonClass('npcs')}>
              PNG
            </button>
            <button type="button" onClick={() => setActiveTab('monsters')} className={tabButtonClass('monsters')}>
              Mostri
            </button>
            <button type="button" onClick={() => setActiveTab('container')} className={tabButtonClass('container')}>
              Contenitore
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          {activeTab === 'data' && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs uppercase tracking-[0.08em] text-[var(--dash-muted)]">
                  Nome oggetto
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Es. Diario di Audrey"
                  className="w-full rounded-md border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-sm text-[var(--dash-text)] placeholder-[var(--dash-muted)]"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-xs uppercase tracking-[0.08em] text-[var(--dash-muted)]">
                  Descrizione
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={4}
                  placeholder="Descrivi l’oggetto, il suo aspetto o il suo uso narrativo..."
                  className="w-full resize-none rounded-md border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-sm text-[var(--dash-text)] placeholder-[var(--dash-muted)]"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs uppercase tracking-[0.08em] text-[var(--dash-muted)]">
                  Tipo
                </label>
                <select
                  value={type}
                  onChange={e => setType(e.target.value as EquipmentType)}
                  className="w-full rounded-md border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-sm text-[var(--dash-text)]"
                >
                  {TYPE_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs uppercase tracking-[0.08em] text-[var(--dash-muted)]">
                  Rarità
                </label>
                <select
                  value={rarity}
                  onChange={e => setRarity(e.target.value as EquipmentRarity)}
                  className="w-full rounded-md border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-sm text-[var(--dash-text)]"
                >
                  {RARITY_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-xs uppercase tracking-[0.08em] text-[var(--dash-muted)]">
                  Tag
                </label>
                <input
                  type="text"
                  value={tagsInput}
                  onChange={e => setTagsInput(e.target.value)}
                  placeholder="Es. indagine, occulto, scuola, chiave"
                  className="w-full rounded-md border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-sm text-[var(--dash-text)] placeholder-[var(--dash-muted)]"
                />
                <div className="mt-1 text-[11px] text-[var(--dash-muted)]">
                  Per ora i tag sono liberi. La posizione/possessore dell’oggetto verrà gestita con campi dedicati.
                </div>
              </div>

              <div className="grid gap-3 md:col-span-2 md:grid-cols-2">
                {type === 'risorsa' && (
                  <label className="flex items-center gap-2 text-sm text-[var(--dash-text)]">
                    <input
                      type="checkbox"
                      checked={isVehicle}
                      onChange={e => setIsVehicle(e.target.checked)}
                    />
                    È un veicolo
                  </label>
                )}

                <label className="flex items-center gap-2 text-sm text-[var(--dash-text)]">
                  <input type="checkbox" checked={isClue} onChange={e => setIsClue(e.target.checked)} />
                  È un indizio
                </label>

                <label className="flex items-center gap-2 text-sm text-[var(--dash-text)]">
                  <input type="checkbox" checked={isStoryItem} onChange={e => setIsStoryItem(e.target.checked)} />
                  È un oggetto di trama
                </label>

                <label className="flex items-center gap-2 text-sm text-[var(--dash-text)]">
                  <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} />
                  Visibile ai giocatori
                </label>
              </div>

              <div className="rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3 text-xs text-[var(--dash-muted)] md:col-span-2">
                “Visibile ai giocatori” è una predisposizione per il futuro sistema account/ruoli/sessioni. Attualmente non modifica ancora i permessi della dashboard.
              </div>

              {mode === 'create' && (
                <div className="md:col-span-2">
                  <label className="mb-2 block text-xs uppercase tracking-[0.08em] text-[var(--dash-muted)]">
                    Ambito oggetto
                  </label>

                  <div className="flex flex-wrap gap-3">
                    <label className="flex items-center gap-2 text-sm text-[var(--dash-text)]">
                      <input
                        type="radio"
                        name="scope"
                        checked={scope === 'global'}
                        onChange={() => setScope('global')}
                      />
                      Globale
                    </label>

                    <label className="flex items-center gap-2 text-sm text-[var(--dash-text)]">
                      <input
                        type="radio"
                        name="scope"
                        checked={scope === 'campaign'}
                        onChange={() => setScope('campaign')}
                        disabled={!resolvedCampaignId}
                      />
                      Campagna corrente
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'icon' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
                <button
                  type="button"
                  onClick={() => setIsIconPickerOpen(prev => !prev)}
                  className="group flex w-full items-center justify-between rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-3 py-2 text-left text-[var(--dash-text-strong)] hover:border-[var(--dash-accent)]"
                >
                  <span className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)]">
                      <Icon icon={iconId} className="h-6 w-6" style={{ color: iconColor }} />
                    </span>
                    Cambia icona
                  </span>

                  {isIconPickerOpen ? (
                    <ChevronDown className="h-4 w-4 text-[var(--dash-muted)] group-hover:animate-[locationArrowPulse_0.8s_ease-in-out_infinite]" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-[var(--dash-muted)] group-hover:animate-[locationArrowPulse_0.8s_ease-in-out_infinite]" />
                  )}
                </button>

                {isIconPickerOpen && (
                  <div className="mt-3 grid max-h-56 grid-cols-6 gap-2 overflow-y-auto rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-bg)] p-3 md:grid-cols-8 lg:grid-cols-10">
                    {EQUIPMENT_ICON_OPTIONS.map(option => {
                      const isSelected = iconId === option.id;

                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => {
                            setIconId(option.id);
                            setIsIconPickerOpen(false);
                          }}
                          title={option.label}
                          className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-colors ${
                            isSelected
                              ? 'border-[var(--dash-accent-2)] bg-[var(--dash-accent)]'
                              : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] hover:border-[var(--dash-accent)] hover:bg-[var(--dash-panel)]'
                          }`}
                        >
                          <Icon icon={option.id} className="h-5 w-5" style={{ color: iconColor }} />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <label className="text-xs uppercase tracking-[0.08em] text-[var(--dash-muted)]">
                  Colore icona
                </label>

                <input
                  type="color"
                  value={iconColor}
                  disabled={isIconPickerOpen}
                  onChange={e => setIconColor(e.target.value)}
                  className={`h-8 w-12 rounded border border-[var(--dash-border)] bg-[var(--dash-input)] ${
                    isIconPickerOpen ? 'cursor-not-allowed opacity-40' : ''
                  }`}
                />

                {isIconPickerOpen && (
                  <span className="text-xs text-[var(--dash-muted)]">
                    Chiudi il selettore icone per modificare il colore.
                  </span>
                )}
              </div>
            </div>
          )}

          {activeTab === 'image' && (
            <div className="space-y-4">
              <input
                ref={uploadInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={event => {
                  const file = event.target.files?.[0];
                  if (file) void handleUploadImage(file);
                }}
              />

              <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
                {selectedImageAsset ? (
                  <div className="mb-3 flex items-center gap-3">
                    <img
                      src={selectedImageAsset.thumbnailDataUrl || selectedImageAsset.imageDataUrl}
                      alt={selectedImageAsset.name}
                      className="h-20 w-20 rounded-lg border border-[var(--dash-border-soft)] object-contain"
                    />

                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-[var(--dash-text-strong)]">
                        {selectedImageAsset.name}
                      </div>
                      <div className="mt-1 text-xs text-[var(--dash-muted)]">
                        Immagine collegata all’oggetto.
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => setImageAssetId(null)}
                        className="group flex items-center gap-1 rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-3 py-1.5 text-xs text-[var(--dash-text-strong)] hover:bg-[var(--dash-surface-2)]"
                      >
                        <X className="h-3.5 w-3.5 group-hover:animate-[cancelWiggle_0.55s_ease-in-out_infinite]" />
                        Rimuovi collegamento
                      </button>

                      <button
                        type="button"
                        onClick={() => setImageAssetToDelete(selectedImageAsset)}
                        className="group flex items-center gap-1 rounded-md border border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)] px-3 py-1.5 text-xs text-[var(--dash-danger-text)] hover:bg-[var(--dash-danger-hover)]"
                      >
                        <Trash2 className="h-3.5 w-3.5 group-hover:animate-[trashShake_0.55s_ease-in-out_infinite]" />
                        Elimina immagine
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mb-3 text-xs text-[var(--dash-muted)]">
                    Nessuna immagine selezionata.
                  </div>
                )}

                <div className="mb-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => uploadInputRef.current?.click()}
                    disabled={isUploadingImage || !resolvedCampaignId}
                    className="group inline-flex items-center gap-2 rounded-md border border-[var(--dash-accent)] bg-[var(--dash-accent)] px-3 py-2 text-xs text-[var(--dash-text-strong)] hover:bg-[var(--dash-accent-2)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Upload className="h-4 w-4 group-hover:animate-[plusPulse_0.75s_ease-in-out_infinite]" />
                    {isUploadingImage ? 'Caricamento...' : 'Carica immagine oggetto'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsImagePickerOpen(prev => !prev)}
                    className="group inline-flex items-center gap-2 rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-3 py-2 text-xs text-[var(--dash-text-strong)] hover:bg-[var(--dash-surface-2)]"
                  >
                    {isImagePickerOpen ? (
                      <ChevronDown className="h-4 w-4 group-hover:animate-[locationArrowPulse_0.8s_ease-in-out_infinite]" />
                    ) : (
                      <ChevronRight className="h-4 w-4 group-hover:animate-[locationArrowPulse_0.8s_ease-in-out_infinite]" />
                    )}
                    Cambia immagine
                  </button>
                </div>

                {isImagePickerOpen && (
                  <div className="max-h-56 overflow-y-auto rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-bg)] p-3">
                    {visualAssets.length === 0 ? (
                      <div className="text-xs text-[var(--dash-muted)]">
                        Nessuna immagine oggetto disponibile.
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
                        {visualAssets.map(asset => {
                          const isSelected = imageAssetId === asset.id;

                          return (
                            <button
                              key={asset.id}
                              type="button"
                              onClick={() => {
                                setImageAssetId(asset.id);
                                setIsImagePickerOpen(false);
                              }}
                              className={`rounded-lg border p-1 transition-colors ${
                                isSelected
                                  ? 'border-[var(--dash-accent)] bg-[var(--dash-surface-2)]'
                                  : 'border-[var(--dash-border-soft)] bg-[var(--dash-input)] hover:border-[var(--dash-accent-2)]'
                              }`}
                              title={asset.name}
                            >
                              <img
                                src={asset.thumbnailDataUrl || asset.imageDataUrl}
                                alt={asset.name}
                                className="h-16 w-full rounded object-contain"
                              />
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}


          {activeTab === 'environments' && (
            <LinkSelectionPanel
              title="Luogo dell’oggetto"
              emptyLabel="Nessun luogo disponibile."
              options={environmentOptions}
              selectedId={selectedEnvironmentId}
              blockedMessage={getDestinationBlockMessage('environment')}
              onClear={clearDestination}
              onSelect={assignEnvironmentDestination}
            />
          )}

          {activeTab === 'npcs' && (
            <LinkSelectionPanel
              title="PNG che possiede l’oggetto"
              emptyLabel="Nessun PNG disponibile."
              options={npcOptions}
              selectedId={selectedNpcId}
              blockedMessage={getDestinationBlockMessage('npc')}
              onClear={clearDestination}
              onSelect={assignNpcDestination}
            />
          )}

          {activeTab === 'monsters' && (
            <LinkSelectionPanel
              title="Mostro che possiede l’oggetto"
              emptyLabel="Nessun mostro disponibile."
              options={monsterOptions}
              selectedId={selectedMonsterId}
              blockedMessage={getDestinationBlockMessage('monster')}
              onClear={clearDestination}
              onSelect={assignMonsterDestination}
            />
          )}

          {activeTab === 'container' && (
            <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
              <h4 className="text-sm font-semibold text-[var(--dash-text-strong)]">
                Oggetto contenitore
              </h4>
              <p className="mt-2 text-sm text-[var(--dash-muted)]">
                Usa questo campo se l’oggetto è fisicamente contenuto dentro un altro oggetto. Esempio: chiave dentro scatola, lettera dentro baule.
              </p>

              {getDestinationBlockMessage('container') ? (
                <div className="mt-4 rounded-lg border border-[var(--dash-accent)] bg-[var(--dash-input)] px-3 py-4 text-sm text-[var(--dash-muted)]">
                  {getDestinationBlockMessage('container')}
                  <button
                    type="button"
                    onClick={clearDestination}
                    className="mt-3 rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-3 py-1.5 text-xs text-[var(--dash-text-strong)] hover:bg-[var(--dash-surface-2)]"
                  >
                    Rimuovi destinazione attuale
                  </button>
                </div>
              ) : (
              <select
                value={containerItemId ?? ''}
                onChange={event => assignContainerDestination(event.target.value || null)}
                className="mt-4 w-full rounded-md border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-sm text-[var(--dash-text)]"
              >
                <option value="">Nessun contenitore</option>
                {availableContainerItems.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              )}

              {availableContainerItems.length === 0 && (
                <div className="mt-3 text-xs text-[var(--dash-muted)]">
                  Nessun altro oggetto custom disponibile come contenitore.
                </div>
              )}
            </div>
          )}

          {formError && (
            <div className="mt-4 rounded-lg border border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)] px-3 py-2 text-sm text-[var(--dash-danger-text)]">
              {formError}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[var(--dash-border)] px-5 py-4">
          <div className="text-xs text-[var(--dash-muted)]">
            {mode === 'create'
              ? 'Crea un oggetto permanente nel catalogo.'
              : 'Aggiorna i dati dell’oggetto di catalogo.'}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="group flex items-center gap-2 rounded-md border border-[var(--dash-border-soft)] bg-transparent px-4 py-2 text-sm text-[var(--dash-muted)] transition-colors hover:bg-[var(--dash-panel)] hover:text-[var(--dash-text-strong)] disabled:opacity-50"
            >
              <X className="h-4 w-4 group-hover:animate-[cancelWiggle_0.55s_ease-in-out_infinite]" />
              Annulla
            </button>

            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={isSaving}
              className="group flex items-center gap-2 rounded-md border border-[var(--dash-accent)] bg-[var(--dash-accent)] px-4 py-2 text-sm text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-accent-2)] disabled:opacity-50"
            >
              <Save className="h-4 w-4 group-hover:animate-[saveDiskInsert_0.7s_ease-in-out_infinite]" />
              {isSaving ? 'Salvataggio...' : submitLabel}
            </button>
          </div>
        </div>

        {imageAssetToDelete && (
          <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/70 px-4">
            <div className="w-full max-w-md rounded-2xl border border-[var(--dash-danger-border)] bg-[var(--dash-surface)] p-6 shadow-2xl">
              <h3 className="text-lg font-semibold text-[var(--dash-text-strong)]">
                Eliminare immagine?
              </h3>

              <p className="mt-3 text-sm text-[var(--dash-muted)]">
                Vuoi eliminare definitivamente “{imageAssetToDelete.name}”? Questa azione la rimuoverà dagli Asset Grafici e non può essere annullata.
              </p>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setImageAssetToDelete(null)}
                  className="group flex items-center gap-2 rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-4 py-2 text-sm text-[var(--dash-text-strong)] hover:bg-[var(--dash-surface-2)]"
                >
                  <X className="h-4 w-4 group-hover:animate-[cancelWiggle_0.55s_ease-in-out_infinite]" />
                  Annulla
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    await visualAssetsStorage.remove(imageAssetToDelete.id);

                    setVisualAssets(prev =>
                      prev.filter(asset => asset.id !== imageAssetToDelete.id)
                    );

                    if (imageAssetId === imageAssetToDelete.id) {
                      setImageAssetId(null);
                    }

                    setImageAssetToDelete(null);
                  }}
                  className="group flex items-center gap-2 rounded-lg border border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)] px-4 py-2 text-sm text-[var(--dash-danger-text)] hover:bg-[var(--dash-danger-hover)]"
                >
                  <Trash2 className="h-4 w-4 group-hover:animate-[trashShake_0.55s_ease-in-out_infinite]" />
                  Elimina
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LinkSelectionPanel({
  title,
  emptyLabel,
  options,
  selectedId,
  blockedMessage,
  onClear,
  onSelect
}: {
  title: string;
  emptyLabel: string;
  options: LinkOption[];
  selectedId: string | null;
  blockedMessage?: string | null;
  onClear: () => void;
  onSelect: (id: string | null) => void;
}) {
  return (
    <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-[var(--dash-text-strong)]">
          {title}
        </h4>
        <span className="rounded-full border border-[var(--dash-border-soft)] bg-[var(--dash-input)] px-2 py-0.5 text-xs text-[var(--dash-muted)]">
          {selectedId ? '1 selezionato' : 'Nessuna destinazione'}
        </span>
      </div>

      {blockedMessage ? (
        <div className="mt-4 rounded-lg border border-[var(--dash-accent)] bg-[var(--dash-input)] px-3 py-4 text-sm text-[var(--dash-muted)]">
          {blockedMessage}
          <button
            type="button"
            onClick={onClear}
            className="mt-3 rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-3 py-1.5 text-xs text-[var(--dash-text-strong)] hover:bg-[var(--dash-surface-2)]"
          >
            Rimuovi destinazione attuale
          </button>
        </div>
      ) : options.length === 0 ? (
        <div className="mt-4 rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-input)] px-3 py-4 text-sm text-[var(--dash-muted)]">
          {emptyLabel}
        </div>
      ) : (
        <div className="mt-4 max-h-64 space-y-2 overflow-y-auto pr-1">
          <label
            className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors ${
              selectedId === null
                ? 'border-[var(--dash-accent)] bg-[var(--dash-surface-2)] text-[var(--dash-text-strong)]'
                : 'border-[var(--dash-border-soft)] bg-[var(--dash-input)] text-[var(--dash-text)] hover:border-[var(--dash-accent-2)]'
            }`}
          >
            <input
              type="radio"
              checked={selectedId === null}
              onChange={() => onSelect(null)}
            />
            <span className="min-w-0 truncate">Nessuna assegnazione</span>
          </label>

          {options.map(option => {
            const checked = selectedId === option.id;

            return (
              <label
                key={option.id}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  checked
                    ? 'border-[var(--dash-accent)] bg-[var(--dash-surface-2)] text-[var(--dash-text-strong)]'
                    : 'border-[var(--dash-border-soft)] bg-[var(--dash-input)] text-[var(--dash-text)] hover:border-[var(--dash-accent-2)]'
                }`}
              >
                <input
                  type="radio"
                  checked={checked}
                  onChange={() => onSelect(option.id)}
                />
                <span className="min-w-0 truncate">{option.name}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}




