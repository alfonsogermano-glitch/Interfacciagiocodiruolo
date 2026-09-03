import { Dices } from 'lucide-react';
import { NoteIconGlyph } from '../shared/NoteIconGrid';
import { CustomDieTextFace } from './CustomDieTextFace';
import { getCustomDieLibraryIconFace } from './diceCustomDieLibraryIcon.ts';
import { getDiceSkinBackgroundImage } from './diceSkins.ts';
import type { SavedCustomDie } from './diceTypes.ts';

export function CustomDieLibraryIcon({
  die,
  size = 'card',
}: {
  die: SavedCustomDie;
  size?: 'card' | 'compact';
}) {
  const face = getCustomDieLibraryIconFace(die.faces);
  const compact = size === 'compact';
  const shellClass = compact ? 'h-8 w-8 rounded-md' : 'h-10 w-10 rounded-lg';
  const fallbackIconClass = compact ? 'h-4 w-4' : 'h-5 w-5';
  const faceIconClass = compact ? 'h-5 w-5' : 'h-6 w-6';
  const skinId = die.skinId ?? 'none';
  const surfaceStyle = {
    color: die.symbolColor,
    backgroundColor: die.bodyColor,
    backgroundImage: getDiceSkinBackgroundImage(skinId, die.bodyColor),
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };

  if (!face) {
    return (
      <span
        data-custom-die-library-icon
        data-dice-skin={skinId}
        className={`flex ${shellClass} items-center justify-center border border-[var(--dash-border)] text-[var(--dash-accent)]`}
        style={surfaceStyle}
      >
        <Dices className={fallbackIconClass} />
      </span>
    );
  }

  return (
    <span
      data-custom-die-library-icon
      data-custom-die-library-face-icon
      data-dice-skin={skinId}
      className={`flex ${shellClass} items-center justify-center overflow-hidden border border-[var(--dash-border)]`}
      style={surfaceStyle}
    >
      {face.visual.kind === 'icon'
        ? <NoteIconGlyph name={face.visual.iconName} className={faceIconClass} />
        : face.visual.kind === 'text'
          ? <CustomDieTextFace text={face.visual.text} color={die.symbolColor} />
          : <img draggable={false} data-custom-die-image-untinted src={face.visual.publicUrl} className={compact ? 'h-full w-full object-contain p-0.5' : 'h-full w-full object-contain p-1'} />}
    </span>
  );
}
