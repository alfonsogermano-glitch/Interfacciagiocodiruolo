import { LIGHTNING_TEXTURE_DATA_URL } from './lightningTextureData.ts';
import { getDiceTextureBackgroundSize } from './diceTextureScale.ts';
import type { DiceAppearance } from './diceTypes.ts';
import './diceLightningAnimation.css';

export function isAnimatedLightningAppearance(appearance: DiceAppearance): boolean {
  return appearance.skinId === 'lightning' && appearance.effectsEnabled;
}

export function DiceLightningAnimatedOverlay({ appearance }: { appearance: DiceAppearance }) {
  if (!isAnimatedLightningAppearance(appearance)) return null;

  const textureStyle = {
    backgroundImage: `url("${LIGHTNING_TEXTURE_DATA_URL}")`,
    backgroundSize: getDiceTextureBackgroundSize(appearance.textureScale),
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };

  return (
    <span aria-hidden="true" data-dice-lightning-animated-overlay className="hollowgate-lightning-animation">
      <span
        data-dice-lightning-animated-texture
        className="hollowgate-lightning-animation__texture"
        style={textureStyle}
      />
      <span data-dice-lightning-animated-flash className="hollowgate-lightning-animation__flash" />
      <span data-dice-lightning-animated-arcs className="hollowgate-lightning-animation__arcs" />
    </span>
  );
}
