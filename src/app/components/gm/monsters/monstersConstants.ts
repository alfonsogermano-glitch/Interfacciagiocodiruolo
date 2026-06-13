import { CAMPAIGN_STORAGE_KEYS } from '../../../../services/campaign/campaignStorageKeys';
import type { Difficulty, ImageCrop } from './monstersTypes';

export const MONSTERS_STORAGE_KEY = CAMPAIGN_STORAGE_KEYS.monsters;
export const ADVENTURES_STORAGE_KEY = CAMPAIGN_STORAGE_KEYS.adventures;
export const ENVIRONMENTS_STORAGE_KEY = CAMPAIGN_STORAGE_KEYS.environments;

export const DIFFICULTY_OPTIONS: Difficulty[] = [
  '',
  'Base',
  'Critico',
  'Estremo',
  'Impossibile',
  'Non euclideo'
];

export const NO_FRAME_VALUE = '__none__';
export const PORTRAIT_FRAME_SCALE = 1.38;

export const DEFAULT_CROP: ImageCrop = { x: 0, y: 0, scale: 1 };
export const DEFAULT_PORTRAIT_BORDER_COLOR = '#f5a623';
