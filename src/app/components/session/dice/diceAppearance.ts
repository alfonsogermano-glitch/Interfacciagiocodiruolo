import type { CustomDieSides, DiceAppearance, RollResult, StandardDieAppearance } from './diceTypes.ts';
import { isDiceSkinId } from './diceSkins.ts';
import { DEFAULT_DICE_TEXTURE_SCALE, normalizeDiceTextureScale } from './diceTextureScale.ts';

export const STANDARD_DIE_SIDES: readonly CustomDieSides[] = [4, 6, 8, 10, 12, 20, 100] as const;

type NormalizedDiceAppearance = DiceAppearance & { textureScale: number };

export const DEFAULT_DICE_APPEARANCE: NormalizedDiceAppearance = {
  bodyColor: '#f5f5f5',
  symbolColor: '#20242f',
  skinId: 'none',
  effectsEnabled: false,
  textureScale: DEFAULT_DICE_TEXTURE_SCALE,
};

export function cloneDiceAppearance(appearance: DiceAppearance): NormalizedDiceAppearance {
  return {
    bodyColor: appearance.bodyColor,
    symbolColor: appearance.symbolColor,
    skinId: appearance.skinId,
    effectsEnabled: appearance.effectsEnabled,
    textureScale: normalizeDiceTextureScale(appearance.textureScale),
  };
}

export function buildDefaultStandardDiceStyles(): StandardDieAppearance[] {
  return STANDARD_DIE_SIDES.map((sides) => ({ sides, ...cloneDiceAppearance(DEFAULT_DICE_APPEARANCE) }));
}

export function normalizeDiceAppearance(value: Partial<DiceAppearance> | null | undefined): NormalizedDiceAppearance {
  return {
    bodyColor: typeof value?.bodyColor === 'string' && value.bodyColor ? value.bodyColor : DEFAULT_DICE_APPEARANCE.bodyColor,
    symbolColor: typeof value?.symbolColor === 'string' && value.symbolColor ? value.symbolColor : DEFAULT_DICE_APPEARANCE.symbolColor,
    skinId: isDiceSkinId(value?.skinId) ? value.skinId : DEFAULT_DICE_APPEARANCE.skinId,
    effectsEnabled: typeof value?.effectsEnabled === 'boolean' ? value.effectsEnabled : DEFAULT_DICE_APPEARANCE.effectsEnabled,
    textureScale: normalizeDiceTextureScale(value?.textureScale),
  };
}

export function completeStandardDiceStyles(
  stored: readonly StandardDieAppearance[] | null | undefined,
): StandardDieAppearance[] {
  const bySides = new Map((stored ?? []).map((style) => [style.sides, style]));
  return STANDARD_DIE_SIDES.map((sides) => ({
    sides,
    ...normalizeDiceAppearance(bySides.get(sides)),
  }));
}

export function getStandardDieAppearance(
  styles: readonly StandardDieAppearance[],
  sides: number,
): StandardDieAppearance | null {
  if (!(STANDARD_DIE_SIDES as readonly number[]).includes(sides)) return null;
  const found = styles.find((style) => style.sides === sides);
  return found ? { sides: found.sides, ...cloneDiceAppearance(found) } : {
    sides: sides as CustomDieSides,
    ...cloneDiceAppearance(DEFAULT_DICE_APPEARANCE),
  };
}

/**
 * Appearance is presentation-only. This helper runs after the canonical RNG
 * result has already been produced and never mutates the source RollResult.
 */
export function attachDiceAppearanceSnapshots(
  result: RollResult,
  standardStyles: readonly StandardDieAppearance[],
): RollResult {
  let changed = false;
  const diceGroups = result.diceGroups.map((group) => {
    if (group.customDieId || group.customDieSnapshot) return group;
    const appearance = getStandardDieAppearance(standardStyles, group.sides);
    if (!appearance) return group;
    changed = true;
    return {
      ...group,
      appearance: cloneDiceAppearance(appearance),
    };
  });
  return changed ? { ...result, diceGroups } : result;
}
