import { CAMPAIGN_STORAGE_KEYS } from '../../../../services/campaign/campaignStorageKeys';
import type { Difficulty } from './monstersTypes';

export { NO_FRAME_VALUE, DEFAULT_CROP } from '../../../../types/imageCrop';

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

export const PORTRAIT_FRAME_SCALE = 1.38;
