import { useId } from 'react';
import { DiceSkinPreviewArt } from './DiceSkinPreviewArt';
import { DiceTypeIcon } from './DiceTypeIcon';
import { getDiceSkinBackgroundImage } from './diceSkins.ts';
import type { DiceAppearance, CustomDieSides } from './diceTypes.ts';

export const DICE_SILHOUETTE_PATHS: Record<Exclude<CustomDieSides, 100>, string> = {
  4: 'M18.433 1.75l14.722 25.5a.5.5 0 0 1-.433.75H3.278a.5.5 0 0 1-.433-.75l14.722-25.5a.5.5 0 0 1 .866 0z',
  6: 'M5 5h26v26H5V5z',
  8: 'M18.5 1L34 9.949v17.898l-15.5 8.949L3 27.846V9.95L18.5 1z',
  10: 'M18 .15L35 13.85V25.2L18 35.85L1 25.2V13.85L18 .15z',
  12: 'M17.691 35.951l-9.992-3.247a1 1 0 0 1-.5-.363l-6.176-8.5a1 1 0 0 1-.191-.588V12.747a1 1 0 0 1 .191-.588l6.176-8.5a1 1 0 0 1 .5-.363L17.69 .049a1 1 0 0 1 .618 0L28.3 3.296a1 1 0 0 1 .5.363l6.176 8.5a1 1 0 0 1 .191.588v10.506a1 1 0 0 1-.191.588l-6.176 8.5a1 1 0 0 1-.5.363l-9.992 3.247a1 1 0 0 1-.618 0z',
  20: 'M18.5 .134l14.722 8.5a1 1 0 0 1 .5.866v17a1 1 0 0 1-.5.866l-14.722 8.5a1 1 0 0 1-1 0l-14.722-8.5a1 1 0 0 1-.5-.866v-17a1 1 0 0 1 .5-.866L17.5.134a1 1 0 0 1 1 0z',
};

function symbolLuminance(color: string): number {
  const normalized = /^#[0-9a-f]{6}$/i.test(color) ? color.slice(1) : 'ffffff';
  const red = Number.parseInt(normalized.slice(0, 2), 16) / 255;
  const green = Number.parseInt(normalized.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(normalized.slice(4, 6), 16) / 255;
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function getDiceFaceContrastFilter(symbolColor: string, skinId: DiceAppearance['skinId']): string {
  const lightSymbol = symbolLuminance(symbolColor) > 0.58;
  const primaryHalo = lightSymbol ? 'rgba(0,0,0,0.98)' : 'rgba(255,255,255,0.98)';
  const secondaryHalo = lightSymbol ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.72)';
  if (skinId === 'none') {
    return `drop-shadow(0 0 0.75px ${primaryHalo})`;
  }
  return `drop-shadow(0 0 1.1px ${primaryHalo}) drop-shadow(0 0 2.35px ${primaryHalo}) drop-shadow(0 1px 1.35px ${secondaryHalo})`;
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
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            />
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
  const contrastFilter = getDiceFaceContrastFilter(appearance.symbolColor, appearance.skinId);
  return (
    <span className="relative inline-flex h-[84%] aspect-square shrink-0 items-center justify-center overflow-visible">
      <DieSkinSurface
        sides={10}
        appearance={appearance}
        previewSkinArt={previewSkinArt}
        className="pointer-events-none absolute inset-0 h-full w-full"
      />
      <span className="pointer-events-none absolute inset-0" style={{ filter: contrastFilter }}>
        <DiceTypeIcon sides={10} percentileFace={face} color={appearance.symbolColor} className="h-full w-full" />
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
  const contrastFilter = getDiceFaceContrastFilter(appearance.symbolColor, appearance.skinId);
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
      <DieSkinSurface
        sides={sides}
        appearance={appearance}
        previewSkinArt={effectivePreviewSkinArt}
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      />
      <span className="pointer-events-none absolute inset-0" style={{ filter: contrastFilter }}>
        <DiceTypeIcon sides={sides} color={appearance.symbolColor} className="h-full w-full overflow-visible" />
      </span>
    </span>
  );
}
