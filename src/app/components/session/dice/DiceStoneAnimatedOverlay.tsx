import { STONE_TEXTURE_DATA_URL } from './stoneTextureData.ts';
import { getDiceTextureBackgroundSize } from './diceTextureScale.ts';
import type { DiceAppearance } from './diceTypes.ts';
import './diceStoneAnimation.css';

export function isAnimatedStoneAppearance(appearance: DiceAppearance): boolean {
  return appearance.skinId === 'stone' && appearance.effectsEnabled;
}

export function DiceStoneAnimatedOverlay({ appearance }: { appearance: DiceAppearance }) {
  if (!isAnimatedStoneAppearance(appearance)) return null;
  const backgroundSize = getDiceTextureBackgroundSize(appearance.textureScale);
  return (
    <span aria-hidden="true" className="hollowgate-stone-overlay pointer-events-none absolute inset-0 overflow-hidden">
      <span
        className="hollowgate-stone-texture absolute inset-0"
        style={{ backgroundImage: `url("${STONE_TEXTURE_DATA_URL}")`, backgroundSize }}
      />
      <span className="hollowgate-stone-dust hollowgate-stone-dust-a absolute inset-[-16%]" />
      <span className="hollowgate-stone-dust hollowgate-stone-dust-b absolute inset-[-12%]" />
      <span className="hollowgate-stone-grit absolute inset-0" />
    </span>
  );
}
