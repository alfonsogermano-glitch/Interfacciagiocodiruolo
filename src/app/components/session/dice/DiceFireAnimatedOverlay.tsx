import { FIRE_TEXTURE_DATA_URL } from './fireTextureData.ts';
import { getDiceTextureBackgroundSize } from './diceTextureScale.ts';
import type { DiceAppearance } from './diceTypes.ts';
import './diceFireAnimation.css';

export function isAnimatedFireAppearance(appearance: DiceAppearance): boolean {
  return appearance.skinId === 'fire' && appearance.effectsEnabled;
}

export function DiceFireAnimatedOverlay({ appearance }: { appearance: DiceAppearance }) {
  if (appearance.skinId !== 'fire' || !appearance.effectsEnabled) return null;

  return (
    <span aria-hidden="true" data-dice-fire-animated-overlay className="hollowgate-fire-animation">
      <span
        data-dice-fire-animated-texture
        className="hollowgate-fire-animation__texture"
        style={{
          backgroundImage: `url("${FIRE_TEXTURE_DATA_URL}")`,
          backgroundSize: getDiceTextureBackgroundSize(appearance.textureScale),
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      />
      <span data-dice-fire-animated-glow className="hollowgate-fire-animation__glow" />
    </span>
  );
}
