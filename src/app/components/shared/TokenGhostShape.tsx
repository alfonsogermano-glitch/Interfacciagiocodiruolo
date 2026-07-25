import { TokenShapePreview } from './TokenShapePreview';
import { TOKEN_SHAPE_SPECS, getTokenStrokeWidth } from './tokenShapes';
import {
  DEFAULT_TOKEN_COLOR,
  DEFAULT_TOKEN_BACKGROUND_COLOR,
  DEFAULT_TOKEN_BORDER_STYLE,
  DEFAULT_TOKEN_BORDER_THICKNESS,
  DEFAULT_TOKEN_BORDER_VISIBLE,
  type TokenBorderStyle,
  type TokenBorderThickness,
} from '../../../types/tokenStyle';
import type { CropAreaPercent } from './SourceCroppedImage';

const TOKEN_SIZE = 64;
const IDENTITY_CROP = { x: 0, y: 0, scale: 1 };

export interface TokenGhostShapeEntity {
  id: string;
  name: string;
  portraitImageUrl?: string | null;
  portraitSourceImageUrl?: string | null;
  portraitCropArea?: CropAreaPercent | null;
  tokenColor?: string | null;
  tokenBackgroundColor?: string | null;
  tokenBorderStyle?: TokenBorderStyle | null;
  tokenBorderThickness?: TokenBorderThickness | null;
  tokenBorderVisible?: boolean | null;
}

/**
 * Vista "tonda" del ghost di drag (il token vero e proprio, con forma/
 * colore/bordo dell'entita'), pensata per quando il rilascio e' fuori da
 * qualunque lista di riferimento (es. la Mappa futura) - contrapposta alla
 * vista "scheda" mostrata invece dentro le liste. Estratta da
 * TokenDragGhost.tsx (Fase 3, unico chiamante fino ad oggi) perche'
 * DragGhost.tsx (drag di PNG/Mostri foderati in cartelle, vedi
 * useFolderSection.tsx) ne ha bisogno per lo stesso comportamento: prima
 * del 2026-07-26 il loro ghost restava sempre "scheda" anche fuori lista,
 * perche' vive su un'istanza dnd separata da quella di TokenDragGhost e non
 * aveva mai accesso a questa vista.
 */
export function TokenGhostShape({
  entity,
  fallbackIcon,
}: {
  entity: TokenGhostShapeEntity;
  fallbackIcon: React.ReactNode;
}) {
  const color = entity.tokenColor ?? DEFAULT_TOKEN_COLOR;
  const backgroundColor = entity.tokenBackgroundColor ?? DEFAULT_TOKEN_BACKGROUND_COLOR;
  const style = entity.tokenBorderStyle ?? DEFAULT_TOKEN_BORDER_STYLE;
  const thickness = entity.tokenBorderThickness ?? DEFAULT_TOKEN_BORDER_THICKNESS;
  const borderVisible = entity.tokenBorderVisible ?? DEFAULT_TOKEN_BORDER_VISIBLE;
  const geometry = TOKEN_SHAPE_SPECS[style].geometry;
  const strokeWidth = getTokenStrokeWidth(style, thickness);

  return (
    <TokenShapePreview
      clipId={`drag-ghost-${entity.id}`}
      name={entity.name}
      portraitImageUrl={entity.portraitImageUrl}
      portraitSourceImageUrl={entity.portraitSourceImageUrl}
      portraitCropArea={entity.portraitCropArea}
      fallbackContent={!entity.portraitImageUrl ? fallbackIcon : undefined}
      crop={IDENTITY_CROP}
      color={color}
      backgroundColor={backgroundColor}
      geometry={geometry}
      strokeWidth={strokeWidth}
      borderVisible={borderVisible}
      style={{ width: TOKEN_SIZE, height: TOKEN_SIZE }}
    />
  );
}
