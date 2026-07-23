import { createPortal } from 'react-dom';
import { usePortalContainer } from '../../ui/portal-container';
import { TokenShapePreview } from '../../shared/TokenShapePreview';
import { TOKEN_SHAPE_SPECS, getTokenStrokeWidth } from '../../shared/tokenShapes';
import {
  DEFAULT_TOKEN_COLOR,
  DEFAULT_TOKEN_BACKGROUND_COLOR,
  DEFAULT_TOKEN_BORDER_STYLE,
  DEFAULT_TOKEN_BORDER_THICKNESS,
  DEFAULT_TOKEN_BORDER_VISIBLE,
  type TokenBorderStyle,
  type TokenBorderThickness,
} from '../../../../types/tokenStyle';
import type { CropAreaPercent } from '../../shared/SourceCroppedImage';

const TOKEN_SIZE = 64;
const IDENTITY_CROP = { x: 0, y: 0, scale: 1 };

export interface TokenDragGhostEntity {
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
 * Fantasma di drag unificato (Fase 3) per i due punti di trascinamento di
 * SessionCharactersPanel.tsx (thumbnail nella lista laterale e ritratto
 * grande nel dettaglio) - prima ciascuno aveva la propria resa nativa
 * (rispettivamente lo snapshot di default del browser e un
 * dataTransfer.setDragImage con TokenShapePreview dentro DraggablePortrait),
 * ora un solo ghost condiviso, stesso principio del portal-che-segue-il-
 * puntatore gia' usato da DragGhost.tsx per il drag di cartelle/card.
 * Nessuna chiamata di rete/stato qui dentro: riceve solo dati grezzi
 * dall'hook (pointerPosition) e l'entita' trascinata gia' risolta dal
 * chiamante (SessionCharactersPanel non conosce l'hook useFolderDragDrop
 * per "entityType" qui - lo scopo e' identico a DragGhost ma per un'entita'
 * singola invece di folders/items di una sezione).
 */
export function TokenDragGhost({
  entity,
  pointerPosition,
  fallbackIcon,
}: {
  entity: TokenDragGhostEntity | null;
  pointerPosition: { x: number; y: number } | null;
  fallbackIcon: React.ReactNode;
}) {
  const portalContainer = usePortalContainer();
  if (!entity || !pointerPosition) return null;

  const color = entity.tokenColor ?? DEFAULT_TOKEN_COLOR;
  const backgroundColor = entity.tokenBackgroundColor ?? DEFAULT_TOKEN_BACKGROUND_COLOR;
  const style = entity.tokenBorderStyle ?? DEFAULT_TOKEN_BORDER_STYLE;
  const thickness = entity.tokenBorderThickness ?? DEFAULT_TOKEN_BORDER_THICKNESS;
  const borderVisible = entity.tokenBorderVisible ?? DEFAULT_TOKEN_BORDER_VISIBLE;
  const geometry = TOKEN_SHAPE_SPECS[style].geometry;
  const strokeWidth = getTokenStrokeWidth(style, thickness);

  return createPortal(
    <div
      style={{ position: 'fixed', left: pointerPosition.x + 14, top: pointerPosition.y + 14, zIndex: 2000 }}
      className="pointer-events-none opacity-90 shadow-2xl"
    >
      <TokenShapePreview
        clipId={`session-drag-ghost-${entity.id}`}
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
    </div>,
    portalContainer ?? document.body
  );
}
