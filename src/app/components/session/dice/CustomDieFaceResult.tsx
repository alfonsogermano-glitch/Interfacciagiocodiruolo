import { useState } from 'react';
import { NoteIconGlyph } from '../shared/NoteIconGrid';
import { CustomDieTextFace } from './CustomDieTextFace';
import { getDiceSkinBackgroundImage } from './diceSkins.ts';
import { getDiceTextureBackgroundSize } from './diceTextureScale.ts';
import type { CustomDieFace, DiceSkinId } from './diceTypes.ts';

export function CustomDieFaceResult({
  face,
  className = 'h-4 w-4',
  symbolColor,
  bodyColor,
  skinId = 'none',
  textureScale,
}: {
  face: CustomDieFace;
  className?: string;
  symbolColor?: string;
  bodyColor?: string;
  skinId?: DiceSkinId;
  textureScale?: number;
}) {
  const [broken, setBroken] = useState(false);
  const surfaceClass = `${className} inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[3px]`;
  const surfaceStyle = {
    backgroundColor: bodyColor,
    backgroundImage: bodyColor ? getDiceSkinBackgroundImage(skinId, bodyColor) : undefined,
    backgroundSize: getDiceTextureBackgroundSize(textureScale),
    backgroundPosition: 'center',
  };

  if (face.visual.kind === 'icon') {
    return (
      <span data-custom-die-face-result data-custom-die-face-surface data-dice-skin={skinId} className={surfaceClass} style={surfaceStyle}>
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
        data-dice-skin={skinId}
        className={surfaceClass}
        style={{ ...surfaceStyle, color: symbolColor }}
      >
        <CustomDieTextFace text={face.visual.text} color={symbolColor} />
      </span>
    );
  }

  if (!broken) {
    return (
      <span data-custom-die-face-result data-custom-die-face-surface data-dice-skin={skinId} className={surfaceClass} style={surfaceStyle}>
        <img
          data-custom-die-face-image
          data-custom-die-image-untinted
          src={face.visual.publicUrl}
          alt={face.label ?? ''}
          onError={() => setBroken(true)}
          className="h-full w-full object-contain p-px drop-shadow-[0_0_2px_rgba(255,255,255,0.65)]"
        />
      </span>
    );
  }

  return (
    <span
      data-custom-die-face-result
      data-custom-die-face-surface
      data-dice-skin={skinId}
      className={`${surfaceClass} text-[10px] font-bold`}
      style={surfaceStyle}
    >
      {face.label?.slice(0, 1) ?? '?'}
    </span>
  );
}
