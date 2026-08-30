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

const DICE_FILTER_BY_SIDES = {
  4: 'brightness(0) saturate(100%) invert(82%) sepia(81%) saturate(709%) hue-rotate(348deg) brightness(101%) contrast(92%)',
  6: 'brightness(0) saturate(100%) invert(47%) sepia(80%) saturate(2916%) hue-rotate(333deg) brightness(100%) contrast(89%)',
  8: 'brightness(0) saturate(100%) invert(69%) sepia(50%) saturate(574%) hue-rotate(94deg) brightness(92%) contrast(89%)',
  10: 'brightness(0) saturate(100%) invert(67%) sepia(35%) saturate(1270%) hue-rotate(158deg) brightness(96%) contrast(88%)',
  12: 'brightness(0) saturate(100%) invert(49%) sepia(84%) saturate(1020%) hue-rotate(230deg) brightness(93%) contrast(90%)',
  20: 'brightness(0) saturate(100%) invert(58%) sepia(84%) saturate(1164%) hue-rotate(343deg) brightness(96%) contrast(86%)',
  100: 'brightness(0) saturate(100%) invert(60%) sepia(49%) saturate(1660%) hue-rotate(194deg) brightness(97%) contrast(93%)',
} as const;

const suppliedDieClassName = 'object-contain opacity-95';

export function DiceTypeIcon({ sides, className }: DiceTypeIconProps) {
  if (sides === 100) {
    return (
      <span
        aria-hidden="true"
        data-die-image="d100"
        data-die-source="user-svg"
        className={`${className ?? ''} inline-flex items-center justify-center gap-2`}
      >
        <img
          src={diceD10}
          alt=""
          draggable={false}
          className={`h-7 w-7 shrink-0 ${suppliedDieClassName}`}
          style={{ filter: DICE_FILTER_BY_SIDES[10] }}
        />
        <img
          src={diceD10Zero}
          alt=""
          draggable={false}
          className={`h-7 w-7 shrink-0 ${suppliedDieClassName}`}
          style={{ filter: DICE_FILTER_BY_SIDES[100] }}
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
      style={{ filter: DICE_FILTER_BY_SIDES[sides] }}
    />
  );
}
