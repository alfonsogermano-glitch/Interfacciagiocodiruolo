import diceD4 from './assets/dice-d4.png';
import diceD6 from './assets/dice-d6.png';
import diceD8 from './assets/dice-d8.png';
import diceD10 from './assets/dice-d10.png';
import diceD12 from './assets/dice-d12.png';
import diceD20 from './assets/dice-d20.png';
import diceD100 from './assets/dice-d100.png';

interface DiceTypeIconProps {
  sides: 4 | 6 | 8 | 10 | 12 | 20 | 100;
  className?: string;
}

const DICE_IMAGE_BY_SIDES = {
  4: diceD4,
  6: diceD6,
  8: diceD8,
  10: diceD10,
  12: diceD12,
  20: diceD20,
  100: diceD100,
} as const;

export function DiceTypeIcon({ sides, className }: DiceTypeIconProps) {
  return (
    <img
      src={DICE_IMAGE_BY_SIDES[sides]}
      alt=""
      aria-hidden="true"
      draggable={false}
      data-die-image={`d${sides}`}
      data-die-render="realistic-3d"
      data-die-numbered="true"
      className={`${className ?? ''} object-contain`}
    />
  );
}
