import { CAMPAIGN_STORAGE_KEYS } from '../../../../services/campaign/campaignStorageKeys';
import { MONSTER_BASE_CATALOG } from '../../../../data/monsterBaseCatalog';
import { MONSTER_TRAITS_CATALOG } from '../../../../data/monsterTraitsCatalog';
import { MONSTER_SPECIAL_ACTIONS_CATALOG } from '../../../../data/monsterSpecialActionsCatalog';
import { createLocalStorageAdapter } from '../../../../services/storage/localStorageAdapter';
import { generateUUID } from '../../../../lib/uuid';
import type { Monster, Difficulty, EnvironmentSummary } from './monstersTypes';
import { DEFAULT_CROP, DEFAULT_PORTRAIT_BORDER_COLOR, MONSTERS_STORAGE_KEY } from './monstersConstants';

export function readStoredEnvironmentSummaries(campaignId = ''): EnvironmentSummary[] {
  if (typeof window === 'undefined') return [];

  try {
    const saved = window.localStorage.getItem(CAMPAIGN_STORAGE_KEYS.environments);
    if (!saved) return [];

    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(item => item?.id)
      .map(item => ({
        id: String(item.id),
        name: String(item.name ?? 'Luogo senza nome'),
        campaignId: item.campaignId ?? item.campaign_id ?? null,
        adventureId: item.adventureId ?? item.adventure_id ?? null,
        parentLocationId: item.parentLocationId ?? item.parent_location_id ?? null
      }))
      .filter(item => item.campaignId == null || item.campaignId === campaignId);
  } catch (error) {
    console.error('Errore lettura luoghi completi da localStorage:', error);
    return [];
  }
}

export function mergeEnvironmentReferencesWithStoredDetails(
  references: EnvironmentSummary[],
  storedDetails: EnvironmentSummary[]
): EnvironmentSummary[] {
  const storedById = new Map(storedDetails.map(environment => [environment.id, environment]));

  return references.map(reference => ({
    ...reference,
    adventureId: reference.adventureId ?? storedById.get(reference.id)?.adventureId ?? null,
    parentLocationId: reference.parentLocationId ?? storedById.get(reference.id)?.parentLocationId ?? null
  }));
}

export function generateId(prefix = 'monster'): string {
  return generateUUID();
}

export function createEmptyMonster(campaignId = ''): Monster {
  const now = new Date().toISOString();

  return {
    id: generateId(),
    campaignId,
    createdAt: now,
    updatedAt: now,

    baseMonsterId: null,
    adventureId: null,
    environmentId: null,
    mapLocationId: null,
    customLocationName: '',

    name: '',
    description: '',

    portraitImageUrl: '',
    coverImageUrl: '',

    portraitCrop: { ...DEFAULT_CROP },
    portraitFrameAssetId: null,
    portraitFrameRotationDegrees: 0,
    portraitFrameOffsetX: 0,
    portraitFrameOffsetY: 0,
    portraitFrameScaleX: 1,
    portraitFrameScaleY: 1,
    portraitBorderColor: DEFAULT_PORTRAIT_BORDER_COLOR,
    portraitBorderVisible: true,
    portraitBorderLabel: '',
    portraitRotationDegrees: 0,

    coverImageScale: 1,
    coverCrop: DEFAULT_CROP,
    coverRotationDegrees: 0,
    frameRotation: 0,
    frameRotationDegrees: 0,
    coverFrameOffsetX: 0,
    coverFrameOffsetY: 0,
    coverFrameScaleX: 1,
    coverFrameScaleY: 1,
    coverFrameAssetId: null,

    freschezza: null,
    maxFreschezza: null,
    audacia: 0,
    caselleFreschezzaCritiche: [],

    attacco: '',
    difesa: '',
    tiroFollia: null,

    traitIds: [],
    customTraits: [],

    specialActionIds: [],
    customSpecialActions: [],

    puntoDebole: '',
    notes: '',
    isCustom: true
  };
}

export function createMonsterFromBase(baseId: string, campaignId = ''): Monster | null {
  const base = MONSTER_BASE_CATALOG.find(item => item.id === baseId);

  if (!base) return null;

  const now = new Date().toISOString();

  return {
    id: generateUUID(),
    createdAt: now,
    updatedAt: now,
    baseMonsterId: base.id,
    campaignId,
    adventureId: null,
    environmentId: null,
    mapLocationId: null,
    customLocationName: '',

    name: base.name,
    description: base.description,

    portraitImageUrl: base.portraitImageUrl ?? '',
    coverImageUrl: base.coverImageUrl ?? '',

    portraitCrop: { ...DEFAULT_CROP },
    portraitFrameAssetId: null,
    portraitFrameRotationDegrees: 0,
    portraitFrameOffsetX: 0,
    portraitFrameOffsetY: 0,
    portraitFrameScaleX: 1,
    portraitFrameScaleY: 1,
    portraitBorderColor: DEFAULT_PORTRAIT_BORDER_COLOR,
    portraitBorderVisible: true,
    portraitBorderLabel: '',
    portraitRotationDegrees: 0,
    coverRotationDegrees: 0,

    coverImageScale: 1,
    coverCrop: DEFAULT_CROP,
    frameRotation: 0,
    frameRotationDegrees: 0,
    coverFrameOffsetX: 0,
    coverFrameOffsetY: 0,
    coverFrameScaleX: 1,
    coverFrameScaleY: 1,
    coverFrameAssetId: null,

    freschezza: 0,
    maxFreschezza: base.freschezza,
    audacia: 0,
    caselleFreschezzaCritiche: base.caselleFreschezzaCritiche ?? [],

    attacco: base.attacco,
    difesa: base.difesa,
    tiroFollia: base.tiroFollia ?? null,

    traitIds: base.traitIds ?? [],
    customTraits: [],

    specialActionIds: base.specialActionIds ?? [],
    customSpecialActions: [],

    puntoDebole: base.puntoDebole,
    notes: '',
    isCustom: false
  };
}

export function normalizeMonster(monster: Partial<Monster> & { id?: string; name?: string }): Monster {
  const legacyName = monster.name ?? '';

  return {
    id: monster.id ?? generateId(),
    createdAt: monster.createdAt ?? new Date().toISOString(),
    updatedAt: monster.updatedAt ?? new Date().toISOString(),
    baseMonsterId: monster.baseMonsterId ?? null,
    campaignId: monster.campaignId ?? '',
    adventureId: monster.adventureId ?? null,
    environmentId: monster.environmentId ?? null,
    mapLocationId: monster.mapLocationId ?? null,
    customLocationName: monster.customLocationName ?? '',

    name: legacyName === 'Ombra Strisciante' ? '' : legacyName,
    description: monster.description ?? '',

    portraitImageUrl: monster.portraitImageUrl ?? '',
    coverImageUrl: monster.coverImageUrl ?? '',

    portraitCrop: monster.portraitCrop ?? DEFAULT_CROP,
    portraitFrameAssetId: monster.portraitFrameAssetId ?? null,
    portraitFrameRotationDegrees: monster.portraitFrameRotationDegrees ?? 0,
    portraitFrameOffsetX: monster.portraitFrameOffsetX ?? 0,
    portraitFrameOffsetY: monster.portraitFrameOffsetY ?? 0,
    portraitFrameScaleX: monster.portraitFrameScaleX ?? 1,
    portraitFrameScaleY: monster.portraitFrameScaleY ?? 1,
    portraitBorderColor: monster.portraitBorderColor ?? DEFAULT_PORTRAIT_BORDER_COLOR,
    portraitBorderVisible: monster.portraitBorderVisible ?? true,
    portraitBorderLabel: monster.portraitBorderLabel ?? '',
    portraitRotationDegrees: monster.portraitRotationDegrees ?? 0,
    coverRotationDegrees: monster.coverRotationDegrees ?? 0,

    coverImageScale: monster.coverImageScale ?? 1,
    coverCrop: monster.coverCrop ?? DEFAULT_CROP,
    frameRotation: monster.frameRotation ?? 0,
    frameRotationDegrees: monster.frameRotationDegrees ?? 0,
    coverFrameOffsetX: monster.coverFrameOffsetX ?? 0,
    coverFrameOffsetY: monster.coverFrameOffsetY ?? 0,
    coverFrameScaleX: monster.coverFrameScaleX ?? 1,
    coverFrameScaleY: monster.coverFrameScaleY ?? 1,
    coverFrameAssetId: monster.coverFrameAssetId ?? null,

    freschezza: monster.freschezza ?? 0,
    maxFreschezza: monster.maxFreschezza ?? null,
    audacia: Math.max(0, monster.audacia ?? 0),
    caselleFreschezzaCritiche: Array.isArray(monster.caselleFreschezzaCritiche) && monster.caselleFreschezzaCritiche.length > 0
      ? monster.caselleFreschezzaCritiche
      : MONSTER_BASE_CATALOG.find(item => item.id === monster.baseMonsterId)?.caselleFreschezzaCritiche ??
        MONSTER_BASE_CATALOG.find(item => item.name === monster.name)?.caselleFreschezzaCritiche ??
        [],

    attacco: monster.attacco ?? '',
    difesa: monster.difesa ?? '',
    tiroFollia: normalizeTiroFollia(monster),

    traitIds: monster.traitIds ?? [],
    customTraits: monster.customTraits ?? [],

    specialActionIds: Array.isArray(monster.specialActionIds)
      ? monster.specialActionIds
      : MONSTER_BASE_CATALOG.find(item => item.id === monster.baseMonsterId)?.specialActionIds ??
        MONSTER_BASE_CATALOG.find(item => item.name === monster.name)?.specialActionIds ??
        [],
    customSpecialActions: Array.isArray(monster.customSpecialActions) ? monster.customSpecialActions : [],

    puntoDebole: monster.puntoDebole ?? '',
    notes: monster.notes ?? '',
    isCustom: monster.isCustom ?? true
  };
}

export const monsterStorage = createLocalStorageAdapter<Monster>(
  MONSTERS_STORAGE_KEY,
  {
    normalize: item => normalizeMonster(item as Partial<Monster>),
    filterOnLoad: monster => monster.name !== 'Ombra Strisciante'
  }
);

export function findTrait(id: string) {
  return MONSTER_TRAITS_CATALOG.find(item => item.id === id);
}

export function getMonsterTraitDisplayName(monster: Monster, traitId: string): string {
  const trait = findTrait(traitId);
  const traitName = trait?.name ?? traitId;

  if (traitId === 'terrificante' && monster.tiroFollia) {
    return `${traitName} · Tiro Follia ${monster.tiroFollia}`;
  }

  return traitName;
}

export function findSpecialAction(id: string) {
  return MONSTER_SPECIAL_ACTIONS_CATALOG.find(item => item.id === id);
}

export function monsterHasTerrifyingTrait(monster: Pick<Monster, 'traitIds'>): boolean {
  return Array.isArray(monster.traitIds) && monster.traitIds.includes('terrificante');
}

export function normalizeTiroFollia(
  monster: Partial<Monster> & { baseMonsterId?: string | null; name?: string }
): Difficulty | null {
  if (typeof monster.tiroFollia === 'string' && monster.tiroFollia.trim()) {
    return monster.tiroFollia as Difficulty;
  }

  const baseMonster =
    MONSTER_BASE_CATALOG.find(item => item.id === monster.baseMonsterId) ??
    MONSTER_BASE_CATALOG.find(item => item.name === monster.name);

  return (baseMonster?.tiroFollia as Difficulty | null | undefined) ?? null;
}

export function monsterHasSpecialActions(monster: Monster): boolean {
  const officialActions = Array.isArray(monster.specialActionIds)
    ? monster.specialActionIds.filter(Boolean)
    : [];

  const customActions = Array.isArray(monster.customSpecialActions)
    ? monster.customSpecialActions.filter(action =>
        Boolean(action.name?.trim() || action.description?.trim())
      )
    : [];

  if (officialActions.length > 0 || customActions.length > 0) {
    return true;
  }

  // Se specialActionIds è un array vuoto, significa che il GM ha deselezionato
  // volontariamente tutte le azioni standard. Non dobbiamo ricaricare quelle base.
  if (Array.isArray(monster.specialActionIds)) {
    return false;
  }

  const baseMonster =
    MONSTER_BASE_CATALOG.find(item => item.id === monster.baseMonsterId) ??
    MONSTER_BASE_CATALOG.find(item => item.name === monster.name);

  return (baseMonster?.specialActionIds ?? []).length > 0;
}

export function clampMonsterAudacia(monster: Monster, value: number): number {
  return Math.max(0, value);
}

export function getMonsterCriticalBoxes(monster: Monster): number[] {
  if (Array.isArray(monster.caselleFreschezzaCritiche) && monster.caselleFreschezzaCritiche.length > 0) {
    return monster.caselleFreschezzaCritiche;
  }

  const baseMonster =
    MONSTER_BASE_CATALOG.find(item => item.id === monster.baseMonsterId) ??
    MONSTER_BASE_CATALOG.find(item => item.name === monster.name);

  return baseMonster?.caselleFreschezzaCritiche ?? [];
}

export function calculateAudaciaGainFromFreshnessChange(
  monster: Monster,
  previousDamage: number,
  nextDamage: number
): number {
  if (nextDamage <= previousDamage) {
    return 0;
  }

  const criticalBoxes = getMonsterCriticalBoxes(monster);

  return criticalBoxes.filter(box => box > previousDamage && box <= nextDamage).length;
}
