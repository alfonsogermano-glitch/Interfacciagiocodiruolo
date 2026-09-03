import diceD4 from './assets/dice-d4.svg';
import diceD6 from './assets/dice-d6.svg';
import diceD8 from './assets/dice-d8.svg';
import diceD10 from './assets/dice-d10.svg';
import diceD10Zero from './assets/dice-d10-zero.svg';
import diceD12 from './assets/dice-d12.svg';
import diceD20 from './assets/dice-d20.svg';
import diceD4Raw from './assets/dice-d4.svg?raw';
import diceD6Raw from './assets/dice-d6.svg?raw';
import diceD8Raw from './assets/dice-d8.svg?raw';
import diceD10Raw from './assets/dice-d10.svg?raw';
import diceD10ZeroRaw from './assets/dice-d10-zero.svg?raw';
import diceD12Raw from './assets/dice-d12.svg?raw';
import diceD20Raw from './assets/dice-d20.svg?raw';

interface DiceTypeIconProps {
  sides: 4 | 6 | 8 | 10 | 12 | 20 | 100;
  className?: string;
  color?: string;
}

const DICE_IMAGE_BY_SIDES = {
  4: diceD4,
  6: diceD6,
  8: diceD8,
  10: diceD10,
  12: diceD12,
  20: diceD20,
} as const;

const DICE_RAW_BY_SIDES = {
  4: diceD4Raw,
  6: diceD6Raw,
  8: diceD8Raw,
  10: diceD10Raw,
  12: diceD12Raw,
  20: diceD20Raw,
} as const;

const DICE_FILTER_BY_SIDES = {
  4: 'brightness(0) saturate(100%) invert(82%) sepia(81%) saturate(709%) hue-rotate(348deg) brightness(101%) contrast(92%)',
  6: 'brightness(0) saturate(100%) invert(47%) sepia(80%) saturate(2916%) hue-rotate(333deg) brightness(100%) contrast(89%)',
  8: 'brightness(0) saturate(100%) invert(69%) sepia(50%) saturate(574%) hue-rotate(94deg) brightness(92%) contrast(89%)',
  10: 'brightness(0) saturate(100%) invert(67%) sepia(35%) saturate(1270%) hue-rotate(158deg) brightness(96%) contrast(88%)',
  12: 'brightness(0) saturate(100%) invert(49%) sepia(84%) saturate(1020%) hue-rotate(230deg) brightness(93%) contrast(90%)',
  20: 'brightness(0) saturate(100%) invert(58%) sepia(84%) saturate(1164%) hue-rotate(343deg) brightness(96%) contrast(86%)',
} as const;

const D100_FILTERS = {
  ten: 'brightness(0) saturate(100%) invert(42%) sepia(97%) saturate(2010%) hue-rotate(300deg) brightness(101%) contrast(96%)',
  zero: 'brightness(0) saturate(100%) invert(78%) sepia(6%) saturate(410%) hue-rotate(178deg) brightness(91%) contrast(87%)',
} as const;

const suppliedDieClassName = 'object-contain opacity-95';
const d100ChildClassName = 'h-full min-h-0 min-w-0 w-[calc(50%_-_2px)] flex-none';
const tintedSvgCache = new Map<string, string>();

function tintedSvgDataUrl(source: string, color: string): string {
  const key = `${color}\n${source}`;
  const cached = tintedSvgCache.get(key);
  if (cached) return cached;

  const safeColor = /^#[0-9a-f]{6}$/i.test(color) ? color : '#000000';
  const svgOpenTag = ['<', 'svg '].join('');
  const tinted = source.replace(svgOpenTag, `${svgOpenTag}fill="${safeColor}" `);
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(tinted)}`;
  tintedSvgCache.set(key, dataUrl);
  return dataUrl;
}

function TintedDieImage({
  source,
  color,
  className,
}: {
  source: string;
  color: string;
  className: string;
}) {
  return (
    <img
      src={tintedSvgDataUrl(source, color)}
      alt=""
      aria-hidden="true"
      draggable={false}
      data-die-colored-image
      data-die-source="user-svg"
      className={`${className} ${suppliedDieClassName}`}
    />
  );
}

export function DiceTypeIcon({ sides, className, color }: DiceTypeIconProps) {
  if (color) {
    if (sides === 100) {
      return (
        <span
          aria-hidden="true"
          data-die-image="d100"
          data-die-source="user-svg"
          className={`${className ?? ''} inline-flex items-center justify-center gap-[4px] overflow-visible`}
        >
          <TintedDieImage source={diceD10Raw} color={color} className={d100ChildClassName} />
          <TintedDieImage source={diceD10ZeroRaw} color={color} className={d100ChildClassName} />
        </span>
      );
    }
    return (
      <TintedDieImage
        source={DICE_RAW_BY_SIDES[sides]}
        color={color}
        className={`${className ?? ''} inline-block`}
      />
    );
  }

  if (sides === 100) {
    return (
      <span
        aria-hidden="true"
        data-die-image="d100"
        data-die-source="user-svg"
        className={`${className ?? ''} inline-flex items-center justify-center gap-[4px] overflow-visible`}
      >
        <img
          src={diceD10}
          alt=""
          draggable={false}
          className={`${d100ChildClassName} ${suppliedDieClassName}`}
          style={{ filter: D100_FILTERS.ten }}
        />
        <img
          src={diceD10Zero}
          alt=""
          draggable={false}
          className={`${d100ChildClassName} ${suppliedDieClassName}`}
          style={{ filter: D100_FILTERS.zero }}
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
