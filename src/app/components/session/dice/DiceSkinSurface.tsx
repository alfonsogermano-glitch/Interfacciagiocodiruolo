import type { ReactNode } from 'react';
import { DiceFireAnimatedOverlay, isAnimatedFireAppearance } from './DiceFireAnimatedOverlay';
import { isAnimatedIceAppearance } from './DiceIceAnimatedOverlay';
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
  return (
    <span
      data-dice-skin={appearance.skinId}
      data-dice-skin-illustrative={illustrative || undefined}
      className={`${illustrative || animatedFire || animatedIce ? 'relative overflow-hidden' : ''} ${className}`}
      style={{
        backgroundColor: appearance.bodyColor,
        backgroundImage,
        backgroundSize: backgroundImage ? getDiceTextureBackgroundSize(appearance.textureScale) : 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundOrigin: appearance.skinId === 'ice' ? 'border-box' : undefined,
      }}
    >
      {illustrative && appearance.skinId !== 'none' && (
        <svg aria-hidden="true" viewBox="0 0 36 36" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
          <DiceSkinPreviewArt skinId={appearance.skinId} bodyColor={appearance.bodyColor} />
        </svg>
      )}
      <DiceFireAnimatedOverlay appearance={appearance} />
      {children}
    </span>
  );
}
