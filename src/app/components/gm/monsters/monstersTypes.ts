import type { D20Stats } from '../../ruleset/D20StatBlock';
import type { RulesetId } from '../../../campaigns/campaignTypes';

export type Difficulty =
  | 'Base'
  | 'Critico'
  | 'Estremo'
  | 'Impossibile'
  | 'Non euclideo'
  | '';

export const FOLLIA_DIFFICULTY_OPTIONS: Exclude<Difficulty, ''>[] = [
  'Base',
  'Critico',
  'Estremo',
  'Impossibile',
  'Non euclideo'
];

export const TERRIFYING_TRAIT_ID = 'terrificante';

export type CustomEntry = {
  id: string;
  name: string;
  description: string;
};

export type ImageCrop = {
  x: number;
  y: number;
  scale: number;
};

export type VisualAsset = {
  id: string;
  name: string;
  type: string;
  imageDataUrl: string;
  createdAt?: string;
};

export type ID = string;

export type BaseCampaignEntity = {
  id: ID;
  campaignId: ID;
  createdAt: string;
  updatedAt: string;
};

export type EnvironmentSummary = {
  id: string;
  name: string;
  campaignId?: string | null;
  adventureId?: string | null;
  parentLocationId?: string | null;
};

export interface Monster extends BaseCampaignEntity {
  ruleset?: RulesetId | null;
  baseMonsterId?: string | null;
  adventureId?: string | null;
  environmentId?: string | null;
  mapLocationId?: string | null;
  customLocationName?: string;
  isDirty?: boolean;

  name: string;
  description: string;

  portraitImageUrl?: string;
  coverImageUrl?: string;

  portraitCrop?: ImageCrop;
  portraitFrameAssetId?: string | null;
  portraitFrameRotationDegrees?: number;
  portraitFrameOffsetX?: number;
  portraitFrameOffsetY?: number;
  portraitFrameScaleX?: number;
  portraitFrameScaleY?: number;
  portraitBorderColor?: string;
  portraitBorderVisible?: boolean;
  portraitBorderLabel?: string;
  portraitRotationDegrees?: number;

  coverImageScale?: number;
  coverCrop?: ImageCrop;
  coverRotationDegrees?: number;
  frameRotation?: 0 | 90;
  frameRotationDegrees?: number;
  coverFrameOffsetX?: number;
  coverFrameOffsetY?: number;
  coverFrameScaleX?: number;
  coverFrameScaleY?: number;
  coverFrameAssetId?: string | null;

  freschezza: number | null;
  maxFreschezza: number | null;
  audacia: number;
  caselleFreschezzaCritiche: number[];

  attacco: Difficulty;
  difesa: Difficulty;
  tiroFollia?: Difficulty | null;

  traitIds: string[];
  customTraits: CustomEntry[];

  specialActionIds: string[];
  customSpecialActions: CustomEntry[];

  puntoDebole: string;
  notes: string;
  isCustom: boolean;
  d20Stats?: D20Stats;
  ownerProfileId?: string;
}

export interface NavigationTarget {
  tabId: string;
  entityId?: string;
  entityType?: string;
}

export interface MonstersManagerProps {
  storageRefreshKey?: number;
  navigationTarget?: NavigationTarget | null;
  onNavigate?: (target: NavigationTarget) => void;
  // Preselezione Avventura in arrivo dalla gerarchia Campagna->Avventure di
  // LeftSidebar.tsx (vedi PendingAdventureFilter in App.tsx) - stessa forma
  // duplicata localmente qui, stessa convenzione gia' in uso per
  // NavigationTarget sopra.
  pendingAdventureFilter?: { campaignId: string; adventureId: string } | null;
  onClearPendingAdventureFilter?: () => void;
}
