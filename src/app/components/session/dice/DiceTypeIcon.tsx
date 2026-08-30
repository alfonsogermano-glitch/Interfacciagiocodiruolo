import diceD4 from './assets/dice-d4.svg';
import diceD6 from './assets/dice-d6.svg';
import diceD8 from './assets/dice-d8.svg';
import diceD10 from './assets/dice-d10.svg';
import diceD12 from './assets/dice-d12.svg';
import diceD20 from './assets/dice-d20.svg';
import diceD100 from './assets/dice-d100.svg';

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
      className={`${className ?? ''} object-contain`}
    />
  );
}
