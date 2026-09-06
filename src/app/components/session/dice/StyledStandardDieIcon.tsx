import { useId } from 'react';
import { DiceFireAnimatedOverlay } from './DiceFireAnimatedOverlay';
import { DiceLightningAnimatedOverlay } from './DiceLightningAnimatedOverlay';
import { DicePoisonAnimatedOverlay } from './DicePoisonAnimatedOverlay';
import { DiceStoneAnimatedOverlay } from './DiceStoneAnimatedOverlay';
import { DiceSkinPreviewArt } from './DiceSkinPreviewArt';
import { DiceTypeIcon } from './DiceTypeIcon';
import { getDiceSkinBackgroundImage } from './diceSkins.ts';
import { getDiceTextureBackgroundSize } from './diceTextureScale.ts';
import type { DiceAppearance, CustomDieSides } from './diceTypes.ts';

export const DICE_SILHOUETTE_PATHS: Record<Exclude<CustomDieSides, 100>, string> = {
  4: 'M18.433 1.75l14.722 25.5a.5.5 0 0 1-.433.75H3.278a.5.5 0 0 1-.433-.75l14.722-25.5a.5.5 0 0 1 .866 0z',
  6: 'M5 5h26v26H5V5z',
  8: 'M18.5 1L34 9.949v17.898l-15.5 8.949L3 27.846V9.95L18.5 1z',
  10: 'M18 .15L35 13.85V25.2L18 35.85L1 25.2V13.85L18 .15z',
  12: 'M17.691 35.951l-9.992-3.247a1 1 0 0 1-.5-.363l-6.176-8.5a1 1 0 0 1-.191-.588V12.747a1 1 0 0 1 .191-.588l6.176-8.5a1 1 0 0 1 .5-.363L17.69.049a1 1 0 0 1 .618 0L28.3 3.296a1 1 0 0 1 .5.363l6.176 8.5a1 1 0 0 1-.191.588v10.506a1 1 0 0 1-.191.588l-6.176 8.5a1 1 0 0 1-.5.363l-9.992 3.247a1 1 0 0 1-.618 0z',
  20: 'M18.5.134l14.722 8.5a1 1 0 0 1 .5.866v17a1 1 0 0 1-.5.866l-14.722 8.5a1 1 0 0 1-1 0l-14.722-8.5a1 1 0 0 1-.5-.866v-17a1 1 0 0 1 .5-.866L17.5.134a1 1 0 0 1 1 0z',
};

function parseHexColor(color: string): [number, number, number] {
  const normalized = /^#[0-9a-f]{6}$/i.test(color) ? color.slice(1) : 'ffffff';
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

function colorToHex(red: number, green: number, blue: number): string {
  const part = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
  return `#${part(red)}${part(green)}${part(blue)}`;
}

function mixHexColor(base: string, target: string, amount: number): string {
  const from = parseHexColor(base);
  const to = parseHexColor(target);
  return colorToHex(
    from[0] + (to[0] - from[0]) * amount,
    from[1] + (to[1] - from[1]) * amount,
    from[2] + (to[2] - from[2]) * amount,
  );
}

function relativeLuminance(color: string): number {
  const channels = parseHexColor(color).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(a: string, b: string): number {
  const light = Math.max(relativeLuminance(a), relativeLuminance(b));
  const dark = Math.min(relativeLuminance(a), relativeLuminance(b));
  return (light + 0.05) / (dark + 0.05);
}

export function getDiceFaceContrastFilter(symbolColor: string, skinId: DiceAppearance['skinId']): string {
  if (skinId === 'none') return 'none';
  const primaryHalo = relativeLuminance(symbolColor) > 0.58 ? 'rgba(0,0,0,0.72)' : 'rgba(255,255,255,0.72)';
  return `drop-shadow(0 0 2.35px ${primaryHalo})`;
}

function estimatedSkinBackground(bodyColor: string, skinId: DiceAppearance['skinId']): string {
  switch (skinId) {
    case 'fire': return mixHexColor('#202329', bodyColor, 0.18);
    case 'obsidian': return mixHexColor(bodyColor, '#000000', 0.55);
    case 'stone': return mixHexColor(bodyColor, '#000000', 0.22);
    default: return bodyColor;
  }
}

export function getReadableDiceSymbolColor(
  symbolColor: string,
  bodyColor: string,
  skinId: DiceAppearance['skinId'],
): string {
  if (skinId === 'none') return symbolColor;
  if (skinId === 'fire' || skinId === 'ice' || skinId === 'lightning' || skinId === 'poison' || skinId === 'stone' || skinId === 'metal') return symbolColor;
  const background = estimatedSkinBackground(bodyColor, skinId);
  const minimumContrast = 5.5;
  if (contrastRatio(symbolColor, background) >= minimumContrast) return symbolColor;

  const target = relativeLuminance(background) < 0.44 ? '#ffffff' : '#080b10';
  for (const amount of [0.5, 0.65, 0.8, 0.92, 1]) {
    const candidate = mixHexColor(symbolColor, target, amount);
    if (contrastRatio(candidate, background) >= minimumContrast) return candidate;
  }
  return target;
}

function outerGlowColor(bodyColor: string): string {
  return relativeLuminance(bodyColor) > 0.62 ? 'rgba(7,12,18,0.62)' : 'rgba(255,255,255,0.72)';
}

function DieOuterGlow({
  sides,
  appearance,
  className = '',
}: {
  sides: Exclude<CustomDieSides, 100>;
  appearance: DiceAppearance;
  className?: string;
}) {
  if (appearance.skinId === 'none') return null;
  const glow = outerGlowColor(appearance.bodyColor);
  return (
    <svg
      aria-hidden="true"
      data-dice-outer-glow={`d${sides}`}
      viewBox="0 0 36 36"
      preserveAspectRatio="xMidYMid meet"
      className={className}
      style={{ overflow: 'visible' }}
    >
      <path
        d={DICE_SILHOUETTE_PATHS[sides]}
        fill="none"
        stroke={glow}
        strokeWidth="0.5"
        vectorEffect="non-scaling-stroke"
        style={{ filter: `drop-shadow(0 0 1.55px ${glow})` }}
      />
    </svg>
  );
}

function DieSkinSurface({
  sides,
  appearance,
  className = '',
  previewSkinArt = false,
}: {
  sides: Exclude<CustomDieSides, 100>;
  appearance: DiceAppearance;
  className?: string;
  previewSkinArt?: boolean;
}) {
  const clipId = `dice-surface-${useId().replace(/:/g, '')}`;
  const backgroundImage = getDiceSkinBackgroundImage(appearance.skinId, appearance.bodyColor);
  return (
    <svg
      aria-hidden="true"
      data-dice-skin-surface={`d${sides}`}
      data-dice-skin={appearance.skinId}
      data-dice-skin-preview={previewSkinArt || undefined}
      viewBox="0 0 36 36"
      preserveAspectRatio="xMidYMid meet"
      className={className}
    >
      <defs><clipPath id={clipId}><path d={DICE_SILHOUETTE_PATHS[sides]} /></clipPath></defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width="36" height="36" fill={appearance.bodyColor} />
        {backgroundImage && (
          <foreignObject x="0" y="0" width="36" height="36">
            <div
              data-dice-skin-pattern
              style={{
                width: '100%',
                height: '100%',
                backgroundImage,
                backgroundSize: getDiceTextureBackgroundSize(appearance.textureScale),
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <DiceFireAnimatedOverlay appearance={appearance} />
              <DiceLightningAnimatedOverlay appearance={appearance} />
              <DicePoisonAnimatedOverlay appearance={appearance} />
              <DiceStoneAnimatedOverlay appearance={appearance} />
            </div>
          </foreignObject>
        )}
        {previewSkinArt && appearance.skinId !== 'none' && (
          <DiceSkinPreviewArt skinId={appearance.skinId} bodyColor={appearance.bodyColor} />
        )}
      </g>
    </svg>
  );
}

function PercentileFace({
  face,
  appearance,
  previewSkinArt,
}: {
  face: 'ten' | 'zero';
  appearance: DiceAppearance;
  previewSkinArt: boolean;
}) {
  const readableSymbolColor = getReadableDiceSymbolColor(appearance.symbolColor, appearance.bodyColor, appearance.skinId);
  const textured = appearance.skinId !== 'none';
  return (
    <span className="relative inline-flex h-[84%] aspect-square shrink-0 items-center justify-center overflow-visible">
      <DieOuterGlow sides={10} appearance={appearance} className="pointer-events-none absolute inset-0 h-full w-full" />
      <DieSkinSurface
        sides={10}
        appearance={appearance}
        previewSkinArt={previewSkinArt}
        className="pointer-events-none absolute inset-0 h-full w-full"
      />
      <span className="pointer-events-none absolute inset-0">
        <DiceTypeIcon
          sides={10}
          percentileFace={face}
          color={textured ? undefined : readableSymbolColor}
          structureColor={textured ? appearance.bodyColor : undefined}
          labelColor={textured ? readableSymbolColor : undefined}
          thinStructure={textured}
          className="h-full w-full"
        />
      </span>
    </span>
  );
}

export function StyledStandardDieIcon({
  sides,
  appearance,
  className = 'h-9 w-9',
  previewSkinArt = false,
}: {
  sides: CustomDieSides;
  appearance: DiceAppearance;
  className?: string;
  previewSkinArt?: boolean;
}) {
  const readableSymbolColor = getReadableDiceSymbolColor(appearance.symbolColor, appearance.bodyColor, appearance.skinId);
  const textured = appearance.skinId !== 'none';
  const effectivePreviewSkinArt = previewSkinArt || className === 'h-9 w-9' || className === 'h-9 w-14';

  if (sides === 100) {
    return (
      <span
        data-styled-standard-d100
        data-dice-skin={appearance.skinId}
        data-dice-skin-preview={effectivePreviewSkinArt || undefined}
        className={`${className} relative inline-flex !w-auto shrink-0 items-center justify-center gap-[4px] overflow-visible`}
      >
        <PercentileFace face="ten" appearance={appearance} previewSkinArt={effectivePreviewSkinArt} />
        <PercentileFace face="zero" appearance={appearance} previewSkinArt={effectivePreviewSkinArt} />
      </span>
    );
  }

  return (
    <span
      data-styled-standard-die={`d${sides}`}
      data-dice-skin={appearance.skinId}
      data-dice-skin-preview={effectivePreviewSkinArt || undefined}
      className={`${className} relative inline-flex shrink-0 items-center justify-center overflow-visible`}
    >
      <DieOuterGlow
        sides={sides}
        appearance={appearance}
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      />
      <DieSkinSurface
        sides={sides}
        appearance={appearance}
        previewSkinArt={effectivePreviewSkinArt}
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      />
      <span className="pointer-events-none absolute inset-0">
        <DiceTypeIcon
          sides={sides}
          color={textured ? undefined : readableSymbolColor}
          structureColor={textured ? appearance.bodyColor : undefined}
          labelColor={textured ? readableSymbolColor : undefined}
          thinStructure={textured}
          className="h-full w-full overflow-visible"
        />
      </span>
    </span>
  );
}
