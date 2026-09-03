import { DiceSkinSurface } from './DiceSkinSurface';
import { DiceTypeIcon } from './DiceTypeIcon';
import type { DiceAppearance, CustomDieSides } from './diceTypes.ts';

export function StyledStandardDieIcon({
  sides,
  appearance,
  className = 'h-9 w-9',
}: {
  sides: CustomDieSides;
  appearance: DiceAppearance;
  className?: string;
}) {
  return (
    <DiceSkinSurface
      appearance={appearance}
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-black/15 p-[2px] shadow-sm ${className}`}
    >
      <DiceTypeIcon sides={sides} color={appearance.symbolColor} className="h-full w-full" />
    </DiceSkinSurface>
  );
}
