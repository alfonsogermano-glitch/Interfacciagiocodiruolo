import type { ReactNode } from 'react';
import { getDiceSkinBackgroundImage } from './diceSkins.ts';
import type { DiceAppearance } from './diceTypes.ts';

export function DiceSkinSurface({
  appearance,
  className = '',
  children,
}: {
  appearance: DiceAppearance;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <span
      data-dice-skin={appearance.skinId}
      className={className}
      style={{
        backgroundColor: appearance.bodyColor,
        backgroundImage: getDiceSkinBackgroundImage(appearance.skinId, appearance.bodyColor),
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {children}
    </span>
  );
}
