import { useState } from 'react';
import { NoteIconGlyph } from '../shared/NoteIconGrid';
import { CustomDieTextFace } from './CustomDieTextFace';
import type { CustomDieFace } from './diceTypes.ts';

export function CustomDieFaceResult({
  face,
  className = 'h-4 w-4',
  symbolColor,
  bodyColor,
}: {
  face: CustomDieFace;
  className?: string;
  symbolColor?: string;
  bodyColor?: string;
}) {
  const [broken, setBroken] = useState(false);
  const surfaceClass = `${className} inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[3px]`;

  if (face.visual.kind === 'icon') {
    return (
      <span
        data-custom-die-face-result
        data-custom-die-face-surface
        className={surfaceClass}
        style={{ backgroundColor: bodyColor }}
      >
        <NoteIconGlyph
          name={face.visual.iconName}
          className="h-[78%] w-[78%]"
          stroke={symbolColor || 'currentColor'}
          style={{ color: symbolColor }}
        />
      </span>
    );
  }

  if (face.visual.kind === 'text') {
    return (
      <span
        data-custom-die-face-result
        data-custom-die-face-surface
        data-custom-die-text-result
        className={surfaceClass}
        style={{ backgroundColor: bodyColor, color: symbolColor }}
      >
        <CustomDieTextFace text={face.visual.text} color={symbolColor} />
      </span>
    );
  }

  if (!broken) {
    return (
      <span
        data-custom-die-face-result
        data-custom-die-face-surface
        className={surfaceClass}
        style={{ backgroundColor: bodyColor }}
      >
        <img
          data-custom-die-face-image
          src={face.visual.publicUrl}
          alt={face.label ?? ''}
          onError={() => setBroken(true)}
          className="h-full w-full object-contain p-px"
        />
      </span>
    );
  }

  return (
    <span
      data-custom-die-face-result
      data-custom-die-face-surface
      className={`${surfaceClass} text-[10px] font-bold`}
      style={{ backgroundColor: bodyColor }}
    >
      {face.label?.slice(0, 1) ?? '?'}
    </span>
  );
}
