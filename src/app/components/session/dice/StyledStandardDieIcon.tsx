import type { CSSProperties } from 'react';
import { DiceTypeIcon } from './DiceTypeIcon';
import { getDiceSkinBackgroundImage } from './diceSkins.ts';
import type { DiceAppearance, CustomDieSides } from './diceTypes.ts';

const DICE_FACE_CLIP_BY_SIDES: Record<Exclude<CustomDieSides, 100>, string> = {
  4: 'polygon(50% 2%, 97% 94%, 3% 94%)',
  6: 'inset(4% round 6%)',
  8: 'polygon(50% 2%, 97% 50%, 50% 98%, 3% 50%)',
  10: 'polygon(50% 1%, 97% 39%, 97% 70%, 50% 99%, 3% 70%, 3% 39%)',
  12: 'polygon(50% 2%, 73% 8%, 91% 24%, 98% 48%, 90% 75%, 68% 94%, 32% 94%, 10% 75%, 2% 48%, 9% 24%, 27% 8%)',
  20: 'polygon(50% 1%, 95% 24%, 95% 74%, 50% 99%, 5% 74%, 5% 24%)',
};

function dieSurfaceStyle(appearance: DiceAppearance, clipPath: string): CSSProperties {
  return {
    backgroundColor: appearance.bodyColor,
    backgroundImage: getDiceSkinBackgroundImage(appearance.skinId, appearance.bodyColor),
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    clipPath,
  };
}

export function StyledStandardDieIcon({
  sides,
  appearance,
  className = 'h-9 w-9',
}: {
  sides: CustomDieSides;
  appearance: DiceAppearance;
  className?: string;
}) {
  if (sides === 100) {
    const d10Surface = dieSurfaceStyle(appearance, DICE_FACE_CLIP_BY_SIDES[10]);
    return (
      <span
        data-styled-standard-d100
        data-dice-skin={appearance.skinId}
        className={`${className} relative inline-flex shrink-0 items-center justify-center gap-[3px] overflow-visible`}
      >
        <span data-dice-skin-face="d100-tens" className="h-full min-w-0 flex-1" style={d10Surface} />
        <span data-dice-skin-face="d100-units" className="h-full min-w-0 flex-1" style={d10Surface} />
        <DiceTypeIcon
          sides={100}
          color={appearance.symbolColor}
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
      </span>
    );
  }

  return (
    <span
      data-styled-standard-die={`d${sides}`}
      data-dice-skin={appearance.skinId}
      data-dice-skin-face={`d${sides}`}
      className={`${className} relative inline-flex shrink-0 items-center justify-center`}
      style={dieSurfaceStyle(appearance, DICE_FACE_CLIP_BY_SIDES[sides])}
    >
      <DiceTypeIcon
        sides={sides}
        color={appearance.symbolColor}
        className="pointer-events-none absolute inset-0 h-full w-full"
      />
    </span>
  );
}
