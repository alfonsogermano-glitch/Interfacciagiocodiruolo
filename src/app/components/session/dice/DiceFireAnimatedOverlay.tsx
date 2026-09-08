import type { CSSProperties } from 'react';
import { DiceIceAnimatedOverlay } from './DiceIceAnimatedOverlay';
import { FIRE_FRAME_ATLAS_DATA_URL } from './fireFrameAtlasData.ts';
import { normalizeDiceTextureScale } from './diceTextureScale.ts';
import type { DiceAppearance } from './diceTypes.ts';
import './diceFireAnimation.css';

export function isAnimatedFireAppearance(appearance: DiceAppearance): boolean {
  return appearance.skinId === 'fire' && appearance.effectsEnabled;
}

export function DiceFireAnimatedOverlay({ appearance }: { appearance: DiceAppearance }) {
  if (appearance.skinId === 'ice') return <DiceIceAnimatedOverlay appearance={appearance} />;
  if (appearance.skinId !== 'fire' || !appearance.effectsEnabled) return null;

  const frameStyle = {
    '--fire-frame-atlas': `url("${FIRE_FRAME_ATLAS_DATA_URL}")`,
    '--fire-frame-scale': normalizeDiceTextureScale(appearance.textureScale) / 100,
  } as CSSProperties;

  return (
    <span aria-hidden="true" data-dice-fire-animated-overlay className="hollowgate-fire-animation">
      <span
        data-dice-fire-frame-sequence
        className="hollowgate-fire-animation__frames"
        style={frameStyle}
      />
    </span>
  );
}
