import { Dices } from 'lucide-react';
import { NoteIconGlyph } from '../shared/NoteIconGrid';
import { CustomDieTextFace } from './CustomDieTextFace';
import { getCustomDieLibraryIconFace } from './diceCustomDieLibraryIcon.ts';
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
  const shellClass = compact
    ? 'h-8 w-8 rounded-md'
    : 'h-10 w-10 rounded-lg';
  const fallbackIconClass = compact ? 'h-4 w-4' : 'h-5 w-5';
  const faceIconClass = compact ? 'h-5 w-5' : 'h-6 w-6';

  if (!face) {
    return (
      <span
        data-custom-die-library-icon
        className={`flex ${shellClass} items-center justify-center border border-[var(--dash-border)] bg-[var(--dash-input)] text-[var(--dash-accent)]`}
      >
        <Dices className={fallbackIconClass} />
      </span>
    );
  }

  return (
    <span
      data-custom-die-library-icon
      data-custom-die-library-face-icon
      className={`flex ${shellClass} items-center justify-center overflow-hidden border border-[var(--dash-border)]`}
      style={{ color: die.symbolColor, backgroundColor: die.bodyColor }}
    >
      {face.visual.kind === 'icon'
        ? <NoteIconGlyph name={face.visual.iconName} className={faceIconClass} />
        : face.visual.kind === 'text'
          ? <CustomDieTextFace text={face.visual.text} color={die.symbolColor} />
          : <img draggable={false} src={face.visual.publicUrl} className={compact ? 'h-full w-full object-contain p-0.5' : 'h-full w-full object-contain p-1'} />}
    </span>
  );
}
