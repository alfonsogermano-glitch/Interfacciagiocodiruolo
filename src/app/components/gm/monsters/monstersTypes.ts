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

// PG/PNG creati prima dell'introduzione del tab "Immagine" condiviso hanno
// portraitCrop ancora nella vecchia forma {centerX,centerY,zoom} (mai
// realmente pilotata - vedi indagine), rimasta cosi' in DB finche' l'utente
// non tocca i controlli di crop per quell'entita'. Letta come ImageCrop
// darebbe x/y/scale undefined -> NaN nelle trasformazioni CSS e nel bake
// canvas (che silenziosamente disegna all'origine invece che al centro).
// Qui si tratta qualunque valore senza x/y/scale finiti come "nessun crop
// impostato", identita' - stessa convenzione gia' usata per il caso
// "mai pilotato".
export function normalizeImageCrop(crop: unknown): ImageCrop {
  if (
    crop &&
    typeof crop === 'object' &&
    Number.isFinite((crop as Partial<ImageCrop>).x) &&
    Number.isFinite((crop as Partial<ImageCrop>).y) &&
    Number.isFinite((crop as Partial<ImageCrop>).scale)
  ) {
    return crop as ImageCrop;
  }
  return { x: 0, y: 0, scale: 1 };
}

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
}
