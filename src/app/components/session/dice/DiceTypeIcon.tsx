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
  structureColor?: string;
  labelColor?: string;
  thinStructure?: boolean;
  percentileFace?: 'ten' | 'zero';
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
const d100ChildClassName = 'h-full aspect-square min-h-0 min-w-0 shrink-0';
const tintedSvgCache = new Map<string, string>();
const twoToneSvgCache = new Map<string, string>();

function safeHex(color: string, fallback = '#000000'): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function tintedSvgDataUrl(source: string, color: string): string {
  const key = `${color}\n${source}`;
  const cached = tintedSvgCache.get(key);
  if (cached) return cached;

  const safeColor = safeHex(color);
  const svgOpenTag = ['<', 'svg '].join('');
  const tinted = source.replace(svgOpenTag, `${svgOpenTag}fill="${safeColor}" `);
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(tinted)}`;
  tintedSvgCache.set(key, dataUrl);
  return dataUrl;
}

function twoToneSvgDataUrl(
  source: string,
  structureColor: string,
  labelColor: string,
  thinStructure: boolean,
): string {
  const safeStructureColor = safeHex(structureColor);
  const safeLabelColor = safeHex(labelColor, '#ffffff');
  const key = `${safeStructureColor}\n${safeLabelColor}\n${thinStructure}\n${source}`;
  const cached = twoToneSvgCache.get(key);
  if (cached) return cached;

  const pathMatches = source.match(/<path\b[^>]*\/>/g) ?? [];
  if (pathMatches.length < 2) return tintedSvgDataUrl(source, safeLabelColor);

  const thinFilter = thinStructure
    ? '<defs><filter id="hg-thin-structure" x="-4" y="-4" width="44" height="44" filterUnits="userSpaceOnUse"><feMorphology in="SourceGraphic" operator="erode" radius="0.18"/></filter></defs>'
    : '';
  let pathIndex = 0;
  const lastPathIndex = pathMatches.length - 1;
  let styled = source.replace(/<path\b([^>]*)\/>/g, (_match, attributes: string) => {
    const isLabel = pathIndex === lastPathIndex;
    pathIndex += 1;
    const cleanedAttributes = attributes
      .replace(/\sfill="[^"]*"/g, '')
      .replace(/\sfilter="[^"]*"/g, '');
    const fill = isLabel ? safeLabelColor : safeStructureColor;
    const filter = !isLabel && thinStructure ? ' filter="url(#hg-thin-structure)"' : '';
    return `<path fill="${fill}"${filter}${cleanedAttributes}/>`;
  });
  if (thinFilter) {
    styled = styled.replace(/(<title>[^<]*<\/title>)/, `$1${thinFilter}`);
  }

  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(styled)}`;
  twoToneSvgCache.set(key, dataUrl);
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

function TwoToneDieImage({
  source,
  structureColor,
  labelColor,
  thinStructure,
  className,
}: {
  source: string;
  structureColor: string;
  labelColor: string;
  thinStructure: boolean;
  className: string;
}) {
  return (
    <img
      src={twoToneSvgDataUrl(source, structureColor, labelColor, thinStructure)}
      alt=""
      aria-hidden="true"
      draggable={false}
      data-die-two-tone-image
      data-die-source="user-svg"
      className={`${className} ${suppliedDieClassName}`}
    />
  );
}

export function DiceTypeIcon({
  sides,
  className,
  color,
  structureColor,
  labelColor,
  thinStructure = false,
  percentileFace,
}: DiceTypeIconProps) {
  const twoTone = Boolean(structureColor && labelColor);

  if (sides === 10 && percentileFace) {
    const rawSource = percentileFace === 'zero' ? diceD10ZeroRaw : diceD10Raw;
    const imageSource = percentileFace === 'zero' ? diceD10Zero : diceD10;
    if (twoTone) {
      return (
        <TwoToneDieImage
          source={rawSource}
          structureColor={structureColor!}
          labelColor={labelColor!}
          thinStructure={thinStructure}
          className={`${className ?? ''} inline-block`}
        />
      );
    }
    if (color) {
      return <TintedDieImage source={rawSource} color={color} className={`${className ?? ''} inline-block`} />;
    }
    return (
      <img
        src={imageSource}
        alt=""
        aria-hidden="true"
        draggable={false}
        data-die-source="user-svg"
        className={`${className ?? ''} ${suppliedDieClassName}`}
      />
    );
  }

  if (twoTone) {
    if (sides === 100) {
      return (
        <span
          aria-hidden="true"
          data-die-image="d100"
          data-die-source="user-svg"
          className={`${className ?? ''} inline-flex !w-auto items-center justify-center gap-[4px] overflow-visible`}
        >
          <TwoToneDieImage source={diceD10Raw} structureColor={structureColor!} labelColor={labelColor!} thinStructure={thinStructure} className={d100ChildClassName} />
          <TwoToneDieImage source={diceD10ZeroRaw} structureColor={structureColor!} labelColor={labelColor!} thinStructure={thinStructure} className={d100ChildClassName} />
        </span>
      );
    }
    return (
      <TwoToneDieImage
        source={DICE_RAW_BY_SIDES[sides]}
        structureColor={structureColor!}
        labelColor={labelColor!}
        thinStructure={thinStructure}
        className={`${className ?? ''} inline-block`}
      />
    );
  }

  if (color) {
    if (sides === 100) {
      return (
        <span
          aria-hidden="true"
          data-die-image="d100"
          data-die-source="user-svg"
          className={`${className ?? ''} inline-flex !w-auto items-center justify-center gap-[4px] overflow-visible`}
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
        className={`${className ?? ''} inline-flex !w-auto items-center justify-center gap-[4px] overflow-visible`}
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
