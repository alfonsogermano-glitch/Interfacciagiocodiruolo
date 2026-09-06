import type { ReactNode } from 'react';
import { DiceFireAnimatedOverlay, isAnimatedFireAppearance } from './DiceFireAnimatedOverlay';
import { isAnimatedIceAppearance } from './DiceIceAnimatedOverlay';
import { DiceLightningAnimatedOverlay, isAnimatedLightningAppearance } from './DiceLightningAnimatedOverlay';
import { DicePoisonAnimatedOverlay, isAnimatedPoisonAppearance } from './DicePoisonAnimatedOverlay';
import { DiceStoneAnimatedOverlay, isAnimatedStoneAppearance } from './DiceStoneAnimatedOverlay';
import { DiceSkinPreviewArt } from './DiceSkinPreviewArt';
import { getDiceSkinBackgroundImage } from './diceSkins.ts';
import { getDiceTextureBackgroundSize } from './diceTextureScale.ts';
import type { DiceAppearance } from './diceTypes.ts';

export function DiceSkinSurface({
  appearance,
  className = '',
  children,
  illustrative = false,
}: {
  appearance: DiceAppearance;
  className?: string;
  children?: ReactNode;
  illustrative?: boolean;
}) {
  const backgroundImage = getDiceSkinBackgroundImage(appearance.skinId, appearance.bodyColor);
  const animatedFire = isAnimatedFireAppearance(appearance);
  const animatedIce = isAnimatedIceAppearance(appearance);
  const animatedLightning = isAnimatedLightningAppearance(appearance);
  const animatedPoison = isAnimatedPoisonAppearance(appearance);
  const animatedStone = isAnimatedStoneAppearance(appearance);
  const photographicSkin = appearance.skinId === 'fire' || appearance.skinId === 'ice' || appearance.skinId === 'lightning' || appearance.skinId === 'poison' || appearance.skinId === 'stone' || appearance.skinId === 'metal';
  return (
    <span
      data-dice-skin={appearance.skinId}
      data-dice-skin-illustrative={illustrative || undefined}
      className={`${illustrative || animatedFire || animatedIce || animatedLightning || animatedPoison || animatedStone ? 'relative overflow-hidden' : ''} ${className}`}
      style={{
        backgroundColor: appearance.bodyColor,
        backgroundImage,
        backgroundSize: backgroundImage ? getDiceTextureBackgroundSize(appearance.textureScale) : 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundOrigin: photographicSkin ? 'border-box' : undefined,
      }}
    >
      {illustrative && appearance.skinId !== 'none' && (
        <svg aria-hidden="true" viewBox="0 0 36 36" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
          <DiceSkinPreviewArt skinId={appearance.skinId} bodyColor={appearance.bodyColor} />
        </svg>
      )}
      <DiceFireAnimatedOverlay appearance={appearance} />
      <DiceLightningAnimatedOverlay appearance={appearance} />
      <DicePoisonAnimatedOverlay appearance={appearance} />
      <DiceStoneAnimatedOverlay appearance={appearance} />
      {children}
    </span>
  );
}