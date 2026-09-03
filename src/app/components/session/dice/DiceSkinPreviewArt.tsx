import type { DiceSkinId } from './diceTypes.ts';

function parseHex(value: string): [number, number, number] {
  const normalized = /^#[0-9a-f]{6}$/i.test(value) ? value.slice(1) : '20242f';
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

function toHex(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
}

function mix(base: string, target: string, amount: number): string {
  const a = parseHex(base);
  const b = parseHex(target);
  return `#${toHex(a[0] + (b[0] - a[0]) * amount)}${toHex(a[1] + (b[1] - a[1]) * amount)}${toHex(a[2] + (b[2] - a[2]) * amount)}`;
}

function palette(bodyColor: string) {
  return {
    bright: mix(bodyColor, '#ffffff', 0.82),
    light: mix(bodyColor, '#ffffff', 0.55),
    mid: mix(bodyColor, '#ffffff', 0.22),
    dark: mix(bodyColor, '#000000', 0.48),
    deep: mix(bodyColor, '#000000', 0.74),
  };
}

export function DiceSkinPreviewArt({ skinId, bodyColor, className }: { skinId: DiceSkinId; bodyColor: string; className?: string }) {
  if (skinId === 'none') return null;
  const colors = palette(bodyColor);

  switch (skinId) {
    case 'fire':
      return null;
    case 'ice':
      return (
        <g data-dice-skin-preview-art="ice" className={className} fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 12 11 3l5 8 5-9 5 10 8-5-5 12 6 6-11 2-5 8-5-8-12 4 7-10Z" fill={colors.light} opacity="0.42" />
          <path d="m4 31 10-10m-3-18 6 15M29 5 18 18m15 10-13-8M7 11l12 8" stroke={colors.bright} strokeWidth="1.35" opacity="0.92" />
          <path d="M18 4v29M4 18h29" stroke={colors.dark} strokeWidth="0.7" opacity="0.62" />
        </g>
      );
    case 'lightning':
      return (
        <g data-dice-skin-preview-art="lightning" className={className} fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="m22 1-12 18h8l-5 16 15-21h-8Z" fill={colors.bright} opacity="0.96" />
          <path d="m22 1-12 18h8l-5 16 15-21h-8Z" stroke={colors.deep} strokeWidth="1.4" opacity="0.88" />
          <path d="m4 9 5 3-4 4m24 8 4 2-4 4M27 5l3 2-3 3" stroke={colors.light} strokeWidth="1.5" opacity="0.9" />
        </g>
      );
    case 'poison':
      return (
        <g data-dice-skin-preview-art="poison" className={className}>
          <circle cx="9" cy="10" r="5.4" fill={colors.dark} opacity="0.58" />
          <circle cx="25" cy="9" r="3.2" fill={colors.bright} opacity="0.78" />
          <circle cx="25" cy="25" r="7" fill={colors.deep} opacity="0.52" />
          <circle cx="8" cy="28" r="2.7" fill={colors.light} opacity="0.88" />
          <circle cx="19" cy="17" r="2.4" fill={colors.bright} opacity="0.92" />
          <path d="M3 20c7-5 11 4 17 0s9-2 13 2" fill="none" stroke={colors.light} strokeWidth="1.35" opacity="0.72" />
        </g>
      );
    case 'stone':
      return (
        <g data-dice-skin-preview-art="stone" className={className} fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M0 7 11 4l5 7 8-5 12 6v24H0Z" fill={colors.dark} opacity="0.28" />
          <path d="m5 2 6 10-4 8 8 4-4 10M22 1l-3 9 6 6-4 7 8 11M3 27l9-4m13-7 9-3" stroke={colors.deep} strokeWidth="1.4" opacity="0.82" />
          <path d="m12 12 5 2-2 5m10-3 3 4-4 3" stroke={colors.light} strokeWidth="0.85" opacity="0.75" />
        </g>
      );
    case 'metal':
      return (
        <g data-dice-skin-preview-art="metal" className={className}>
          <path d="M-4 30 22-4h9L5 38Z" fill={colors.bright} opacity="0.62" />
          <path d="M8 38 34-4h6L14 38Z" fill={colors.light} opacity="0.34" />
          {[5, 10, 15, 20, 25, 30].map((y) => (
            <path key={y} d={`M1 ${y}H35`} stroke={y % 10 === 0 ? colors.dark : colors.light} strokeWidth="0.65" opacity="0.62" />
          ))}
          <path d="M2 3h32M2 33h32" stroke={colors.bright} strokeWidth="1.1" opacity="0.72" />
        </g>
      );
    case 'obsidian':
      return (
        <g data-dice-skin-preview-art="obsidian" className={className}>
          <path d="M0 0h36v36H0Z" fill={colors.deep} opacity="0.62" />
          <path d="M0 28 10 4l8 11L29 1l7 9-9 12 9 14H8Z" fill={colors.dark} opacity="0.58" />
          <path d="m3 31 11-17 4 5L31 4" fill="none" stroke={colors.bright} strokeWidth="1.55" opacity="0.82" />
          <path d="m14 14 3 6-5 8m15-15-4 7 5 7" fill="none" stroke={colors.light} strokeWidth="0.9" opacity="0.72" />
        </g>
      );
    case 'arcane':
      return (
        <g data-dice-skin-preview-art="arcane" className={className} fill="none" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="18" r="11" stroke={colors.bright} strokeWidth="1.35" opacity="0.88" />
          <circle cx="18" cy="18" r="7" stroke={colors.light} strokeWidth="1" opacity="0.76" />
          <path d="m18 4 3 6 6 2-5 4 1 7-5-3-5 3 1-7-5-4 6-2Z" stroke={colors.deep} strokeWidth="1.25" opacity="0.88" />
          <path d="M18 8v20M8 18h20m-15-7 10 14m0-14L13 25" stroke={colors.bright} strokeWidth="0.75" opacity="0.72" />
        </g>
      );
  }
}
