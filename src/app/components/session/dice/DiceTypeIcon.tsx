import diceD4 from './assets/dice-d4.svg';
import diceD6 from './assets/dice-d6.svg';
import diceD8 from './assets/dice-d8.svg';
import diceD10 from './assets/dice-d10.svg';
import diceD10Zero from './assets/dice-d10-zero.svg';
import diceD12 from './assets/dice-d12.svg';
import diceD20 from './assets/dice-d20.svg';

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
} as const;

const suppliedDieClassName = 'object-contain brightness-0 invert opacity-90';

export function DiceTypeIcon({ sides, className }: DiceTypeIconProps) {
  if (sides === 100) {
    return (
      <span
        aria-hidden="true"
        data-die-image="d100"
        data-die-source="user-svg"
        className={`${className ?? ''} inline-flex items-center justify-center`}
      >
        <img
          src={diceD10}
          alt=""
          draggable={false}
          className={`h-8 w-8 shrink-0 ${suppliedDieClassName}`}
        />
        <img
          src={diceD10Zero}
          alt=""
          draggable={false}
          className={`-ml-2 h-8 w-8 shrink-0 ${suppliedDieClassName}`}
        />
      </span>
    );
  }

  return (
    <img
      src={DICE_IMAGE_BY_SIDES[sides]}
      alt=""
      aria-hidden="true"
      draggable={false}
      data-die-image={`d${sides}`}
      data-die-source="user-svg"
      className={`${className ?? ''} ${suppliedDieClassName}`}
    />
  );
}
