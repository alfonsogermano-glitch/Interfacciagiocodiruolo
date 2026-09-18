import { NoteIconGlyph } from '../shared/NoteIconGrid';
import { CustomDieTextFace } from './CustomDieTextFace';
import { DiceSkinSurface } from './DiceSkinSurface';
import { getCustomDieLibraryIconFace } from './diceCustomDieLibraryIcon.ts';
import type { CustomDieFace, CustomDieRollSnapshot, DiceAppearance, SavedCustomDie } from './diceTypes.ts';

type CustomDieLibraryIconData = SavedCustomDie | CustomDieRollSnapshot;

function CustomDieLibraryD100Shell({
  die,
  face,
  shellClass,
  iconClass,
  faceOffsetY,
}: {
  die: CustomDieLibraryIconData;
  face: CustomDieFace;
  shellClass: string;
  iconClass: string;
  faceOffsetY: number;
}) {
  const skinId = die.skinId ?? 'none';
  const appearance: DiceAppearance = {
    bodyColor: die.bodyColor,
    symbolColor: die.symbolColor,
    skinId,
    effectsEnabled: die.effectsEnabled ?? false,
    textureScale: die.textureScale,
  };

  return (
    <span className={`relative flex ${shellClass} items-center justify-center overflow-hidden border border-[var(--dash-border)]`}>
      <DiceSkinSurface appearance={appearance} className="flex h-full w-full items-center justify-center">
        <span className="relative z-10 flex h-full w-full items-center justify-center" style={faceOffsetY ? { transform: `translateY(${faceOffsetY}px)` } : undefined}>
          {face.visual.kind === 'icon'
            ? <NoteIconGlyph name={face.visual.iconName} className={`${iconClass} drop-shadow-[0_0_2px_rgba(255,255,255,0.65)]`} />
            : face.visual.kind === 'text'
              ? <CustomDieTextFace text={face.visual.text} color={die.symbolColor} className="h-full w-full drop-shadow-[0_0_2px_rgba(255,255,255,0.65)]" />
              : <img draggable={false} data-custom-die-image-untinted src={face.visual.publicUrl} className="h-full w-full object-contain p-0.5 drop-shadow-[0_0_2px_rgba(255,255,255,0.65)]" />}
        </span>
      </DiceSkinSurface>
    </span>
  );
}

export function CustomDieLibraryIcon({
  die,
  size = 'card',
  faceOffsetY = 0,
}: {
  die: CustomDieLibraryIconData;
  size?: 'card' | 'compact';
  faceOffsetY?: number;
}) {
  const face = getCustomDieLibraryIconFace(die.faces);
  const compact = size === 'compact';
  const shellClass = compact ? 'h-8 w-8 rounded-md' : 'h-10 w-10 rounded-lg';
  const faceIconClass = compact ? 'h-5 w-5' : 'h-6 w-6';
  const skinId = die.skinId ?? 'none';
  const appearance: DiceAppearance = {
    bodyColor: die.bodyColor,
    symbolColor: die.symbolColor,
    skinId,
    effectsEnabled: die.effectsEnabled ?? false,
    textureScale: die.textureScale,
  };

  if (die.sides === 100) {
    const tensFace = die.faces.find((candidate) => candidate.role === 'tens' && candidate.isLibraryIcon === true)
      ?? die.faces.find((candidate) => candidate.role === 'tens');
    const unitsFace = die.faces.find((candidate) => candidate.role === 'units' && candidate.isLibraryIcon === true)
      ?? die.faces.find((candidate) => candidate.role === 'units');
    if (tensFace && unitsFace) {
      return (
        <span
          data-custom-die-library-icon
          data-custom-die-library-d100-pair
          data-dice-skin={skinId}
          className={`relative flex ${compact ? 'gap-[2px]' : 'gap-1'} items-center justify-center`}
        >
          <CustomDieLibraryD100Shell die={die} face={tensFace} shellClass={compact ? 'h-4 w-4 rounded-[4px]' : 'h-8 w-8 rounded-md'} iconClass={compact ? 'h-3 w-3' : 'h-4 w-4'} faceOffsetY={faceOffsetY} />
          <CustomDieLibraryD100Shell die={die} face={unitsFace} shellClass={compact ? 'h-4 w-4 rounded-[4px]' : 'h-8 w-8 rounded-md'} iconClass={compact ? 'h-3 w-3' : 'h-4 w-4'} faceOffsetY={faceOffsetY} />
        </span>
      );
    }
  }

  if (!face) {
    return (
      <span
        data-custom-die-library-icon
        data-dice-skin={skinId}
        className={`relative flex ${shellClass} items-center justify-center border border-[var(--dash-border)]`}
      >
        <DiceSkinSurface appearance={appearance} className="flex h-full w-full items-center justify-center text-[var(--dash-accent)]">
          <span className="relative z-10 flex h-full w-full items-center justify-center" style={faceOffsetY ? { transform: `translateY(${faceOffsetY}px)` } : undefined}>
            <span className={`${compact ? 'text-[9px]' : 'text-xs'} font-bold leading-none`}>d{die.sides}</span>
          </span>
        </DiceSkinSurface>
      </span>
    );
  }

  return (
    <span
      data-custom-die-library-icon
      data-custom-die-library-face-icon
      data-dice-skin={skinId}
      className={`relative flex ${shellClass} items-center justify-center overflow-hidden border border-[var(--dash-border)]`}
    >
      <DiceSkinSurface appearance={appearance} className="flex h-full w-full items-center justify-center">
        <span className="relative z-10 flex h-full w-full items-center justify-center" style={faceOffsetY ? { transform: `translateY(${faceOffsetY}px)` } : undefined}>
          {face.visual.kind === 'icon'
            ? <NoteIconGlyph name={face.visual.iconName} className={`${faceIconClass} drop-shadow-[0_0_2px_rgba(255,255,255,0.65)]`} />
            : face.visual.kind === 'text'
              ? <CustomDieTextFace text={face.visual.text} color={die.symbolColor} className="h-full w-full drop-shadow-[0_0_2px_rgba(255,255,255,0.65)]" />
              : <img draggable={false} data-custom-die-image-untinted src={face.visual.publicUrl} className={`${compact ? 'p-0.5' : 'p-1'} h-full w-full object-contain drop-shadow-[0_0_2px_rgba(255,255,255,0.65)]`} />}
        </span>
      </DiceSkinSurface>
    </span>
  );
}
