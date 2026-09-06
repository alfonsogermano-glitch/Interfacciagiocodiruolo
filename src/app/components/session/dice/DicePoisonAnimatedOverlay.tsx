import { POISON_TEXTURE_DATA_URL } from './poisonTextureData.ts';
import { getDiceTextureBackgroundSize } from './diceTextureScale.ts';
import type { DiceAppearance } from './diceTypes.ts';
import './dicePoisonAnimation.css';

export function isAnimatedPoisonAppearance(appearance: DiceAppearance): boolean {
  return appearance.skinId === 'poison' && appearance.effectsEnabled;
}

export function DicePoisonAnimatedOverlay({ appearance }: { appearance: DiceAppearance }) {
  if (!isAnimatedPoisonAppearance(appearance)) return null;

  const textureStyle = {
    backgroundImage: `url("${POISON_TEXTURE_DATA_URL}")`,
    backgroundSize: getDiceTextureBackgroundSize(appearance.textureScale),
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };

  return (
    <span aria-hidden="true" data-dice-poison-animated-overlay className="hollowgate-poison-animation">
      <span
        data-dice-poison-animated-texture
        className="hollowgate-poison-animation__texture"
        style={textureStyle}
      />
      <span data-dice-poison-animated-ooze className="hollowgate-poison-animation__ooze" />
      <span data-dice-poison-animated-bubbles className="hollowgate-poison-animation__bubbles" />
    </span>
  );
}
