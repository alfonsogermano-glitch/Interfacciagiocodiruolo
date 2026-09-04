import { ICE_TEXTURE_DATA_URL } from './iceTextureData.ts';
import { getDiceTextureBackgroundSize } from './diceTextureScale.ts';
import type { DiceAppearance } from './diceTypes.ts';
import './diceIceAnimation.css';

export function isAnimatedIceAppearance(appearance: DiceAppearance): boolean {
  return appearance.skinId === 'ice' && appearance.effectsEnabled;
}

export function DiceIceAnimatedOverlay({ appearance }: { appearance: DiceAppearance }) {
  if (!isAnimatedIceAppearance(appearance)) return null;

  const textureStyle = {
    backgroundImage: `url("${ICE_TEXTURE_DATA_URL}")`,
    backgroundSize: getDiceTextureBackgroundSize(appearance.textureScale),
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };

  return (
    <span aria-hidden="true" data-dice-ice-animated-overlay className="hollowgate-ice-animation">
      <span
        data-dice-ice-animated-texture-under
        className="hollowgate-ice-animation__texture hollowgate-ice-animation__texture--under"
        style={textureStyle}
      />
      <span
        data-dice-ice-animated-texture-over
        className="hollowgate-ice-animation__texture hollowgate-ice-animation__texture--over"
        style={textureStyle}
      />
      <span data-dice-ice-animated-frost className="hollowgate-ice-animation__frost" />
      <span data-dice-ice-animated-crystals className="hollowgate-ice-animation__crystals" />
      <span data-dice-ice-animated-shimmer className="hollowgate-ice-animation__shimmer" />
    </span>
  );
}
