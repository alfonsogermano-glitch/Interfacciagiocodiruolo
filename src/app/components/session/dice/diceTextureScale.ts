export const MIN_DICE_TEXTURE_SCALE = 100;
export const MAX_DICE_TEXTURE_SCALE = 200;
export const DEFAULT_DICE_TEXTURE_SCALE = 138;

export function normalizeDiceTextureScale(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_DICE_TEXTURE_SCALE;
  return Math.min(MAX_DICE_TEXTURE_SCALE, Math.max(MIN_DICE_TEXTURE_SCALE, Math.round(value)));
}

export function getDiceTextureBackgroundSize(value: unknown): string {
  return `${normalizeDiceTextureScale(value)}%`;
}
